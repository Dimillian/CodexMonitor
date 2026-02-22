use super::logger::LogLevel;
use super::rpc::{
    build_error_response, build_result_response, forward_events, parse_auth_token,
    spawn_rpc_response_task,
};
use super::*;

use std::sync::atomic::{AtomicU32, Ordering};
use std::time::Instant;

pub(super) struct ConnectionContext {
    pub(super) peer: String,
    connected_at: Instant,
    authenticated: bool,
    auth_attempts: u32,
    rpc_count: u32,
    pub(super) rpc_errors: AtomicU32,
    invalid_json_count: u32,
    unauth_request_count: u32,
}

pub(super) async fn handle_client(
    socket: TcpStream,
    config: Arc<DaemonConfig>,
    state: Arc<DaemonState>,
    events: broadcast::Sender<DaemonEvent>,
) {
    let peer = socket
        .peer_addr()
        .map(|a| a.to_string())
        .unwrap_or_else(|_| "unknown".into());

    let ctx = Arc::new(std::sync::RwLock::new(ConnectionContext {
        peer: peer.clone(),
        connected_at: Instant::now(),
        authenticated: config.token.is_none(),
        auth_attempts: 0,
        rpc_count: 0,
        rpc_errors: AtomicU32::new(0),
        invalid_json_count: 0,
        unauth_request_count: 0,
    }));

    let (reader, mut writer) = socket.into_split();
    let mut lines = BufReader::new(reader).lines();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let write_task = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if writer.write_all(message.as_bytes()).await.is_err() {
                break;
            }
            if writer.write_all(b"\n").await.is_err() {
                break;
            }
        }
    });

    let mut authenticated = config.token.is_none();
    let mut events_task: Option<tokio::task::JoinHandle<()>> = None;
    let request_limiter = Arc::new(Semaphore::new(MAX_IN_FLIGHT_RPC_PER_CONNECTION));
    let client_version = format!("daemon-{}", env!("CARGO_PKG_VERSION"));

    if authenticated {
        let rx = events.subscribe();
        let out_tx_events = out_tx.clone();
        events_task = Some(tokio::spawn(forward_events(rx, out_tx_events)));
    }

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let message: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => {
                if let Ok(mut c) = ctx.write() {
                    c.invalid_json_count += 1;
                }
                continue;
            }
        };

        let id = message.get("id").and_then(|value| value.as_u64());
        let method = message
            .get("method")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let params = message.get("params").cloned().unwrap_or(Value::Null);

        if !authenticated {
            if method != "auth" {
                if let Some(response) = build_error_response(id, "unauthorized") {
                    let _ = out_tx.send(response);
                }
                if let Ok(mut c) = ctx.write() {
                    c.unauth_request_count += 1;
                }
                continue;
            }

            let expected = config.token.clone().unwrap_or_default();
            let provided = parse_auth_token(&params).unwrap_or_default();
            if expected != provided {
                if let Some(response) = build_error_response(id, "invalid token") {
                    let _ = out_tx.send(response);
                }
                if let Ok(mut c) = ctx.write() {
                    c.auth_attempts += 1;
                }
                state.log.log_rate_limited(
                    "auth",
                    LogLevel::Error,
                    "auth_failed",
                    &[("peer", &peer)],
                );
                continue;
            }

            authenticated = true;
            if let Ok(mut c) = ctx.write() {
                c.authenticated = true;
                c.auth_attempts += 1;
            }
            if let Some(response) = build_result_response(id, json!({ "ok": true })) {
                let _ = out_tx.send(response);
            }

            let rx = events.subscribe();
            let out_tx_events = out_tx.clone();
            events_task = Some(tokio::spawn(forward_events(rx, out_tx_events)));

            continue;
        }

        if let Ok(mut c) = ctx.write() {
            c.rpc_count += 1;
        }

        spawn_rpc_response_task(
            Arc::clone(&state),
            out_tx.clone(),
            id,
            method,
            params,
            client_version.clone(),
            Arc::clone(&request_limiter),
            peer.clone(),
            Arc::clone(&ctx),
        );
    }

    drop(out_tx);
    if let Some(task) = events_task {
        task.abort();
    }
    write_task.abort();

    // Canonical wide event for the connection.
    // Note: rpc_errors is best-effort — in-flight tasks may still be running.
    let inflight = request_limiter.available_permits();
    let inflight_rpcs = (MAX_IN_FLIGHT_RPC_PER_CONNECTION - inflight).to_string();
    let c = ctx.read().unwrap_or_else(|e| e.into_inner());
    let duration_ms = c.connected_at.elapsed().as_millis().to_string();
    let rpc_count = c.rpc_count.to_string();
    let rpc_errors = c.rpc_errors.load(Ordering::Relaxed).to_string();
    let auth_attempts = c.auth_attempts.to_string();
    let invalid_json = c.invalid_json_count.to_string();
    let unauth_requests = c.unauth_request_count.to_string();
    state.log.log(
        LogLevel::Info,
        "connection_closed",
        &[
            ("peer", &c.peer),
            (
                "authenticated",
                if c.authenticated { "true" } else { "false" },
            ),
            ("duration_ms", &duration_ms),
            ("rpc_count", &rpc_count),
            ("rpc_errors", &rpc_errors),
            ("inflight_rpcs", &inflight_rpcs),
            ("auth_attempts", &auth_attempts),
            ("invalid_json", &invalid_json),
            ("unauth_requests", &unauth_requests),
        ],
    );
}
