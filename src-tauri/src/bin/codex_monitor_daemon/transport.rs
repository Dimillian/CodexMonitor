use super::rpc::{
    build_error_response, build_result_response, forward_events, parse_auth_token,
    spawn_rpc_response_task,
};
use super::*;

pub(super) async fn handle_client(
    socket: TcpStream,
    config: Arc<DaemonConfig>,
    state: Arc<DaemonState>,
    events: broadcast::Sender<DaemonEvent>,
) {
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
            Err(_) => continue,
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
                    if out_tx.send(response).is_err() {
                        eprintln!("[daemon] failed to send unauthorized response");
                        break;
                    }
                }
                continue;
            }

            let expected = config.token.clone().unwrap_or_default();
            let provided = parse_auth_token(&params).unwrap_or_default();
            if expected != provided {
                if let Some(response) = build_error_response(id, "invalid token") {
                    if out_tx.send(response).is_err() {
                        eprintln!("[daemon] failed to send invalid-token response");
                        break;
                    }
                }
                continue;
            }

            authenticated = true;
            if let Some(response) = build_result_response(id, json!({ "ok": true })) {
                if out_tx.send(response).is_err() {
                    eprintln!("[daemon] failed to send auth success response");
                    break;
                }
            }

            let rx = events.subscribe();
            let out_tx_events = out_tx.clone();
            events_task = Some(tokio::spawn(forward_events(rx, out_tx_events)));

            continue;
        }

        spawn_rpc_response_task(
            Arc::clone(&state),
            out_tx.clone(),
            id,
            method,
            params,
            client_version.clone(),
            Arc::clone(&request_limiter),
        );
    }

    drop(out_tx);
    if let Some(task) = events_task {
        task.abort();
    }
    write_task.abort();
}

fn handle_orbit_line(
    line: &str,
    state: Arc<DaemonState>,
    out_tx: mpsc::UnboundedSender<String>,
    client_version: String,
    request_limiter: Arc<Semaphore>,
) {
    let message: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(_) => return,
    };

    if let Some(message_type) = message.get("type").and_then(Value::as_str) {
        if message_type.eq_ignore_ascii_case("ping") {
            if out_tx.send(json!({ "type": "pong" }).to_string()).is_err() {
                eprintln!("[daemon] failed to send orbit pong message");
            }
        }
        return;
    }

    let id = message.get("id").and_then(|value| value.as_u64());
    let method = message
        .get("method")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    if method.is_empty() {
        return;
    }

    if method == "auth" {
        if let Some(response) = build_result_response(id, json!({ "ok": true })) {
            if out_tx.send(response).is_err() {
                eprintln!("[daemon] failed to send orbit auth response");
            }
        }
        return;
    }

    spawn_rpc_response_task(
        state,
        out_tx,
        id,
        method,
        params,
        client_version,
        request_limiter,
    );
}

pub(super) async fn run_orbit_mode(
    config: Arc<DaemonConfig>,
    state: Arc<DaemonState>,
    events_tx: broadcast::Sender<DaemonEvent>,
) {
    let orbit_url = config.orbit_url.clone().unwrap_or_default();
    let runner_name = config
        .orbit_runner_name
        .clone()
        .unwrap_or_else(|| "codex-monitor-daemon".to_string());

    let mut reconnect_delay = Duration::from_secs(1);
    loop {
        let ws_url =
            match shared::orbit_core::build_orbit_ws_url(&orbit_url, config.orbit_token.as_deref())
            {
                Ok(value) => value,
                Err(err) => {
                    eprintln!("invalid orbit url: {err}");
                    sleep(reconnect_delay).await;
                    reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(20));
                    continue;
                }
            };

        let stream = match connect_async(&ws_url).await {
            Ok((stream, _response)) => stream,
            Err(err) => {
                eprintln!(
                    "orbit runner failed to connect to {}: {}. retrying in {}s",
                    ws_url,
                    err,
                    reconnect_delay.as_secs()
                );
                sleep(reconnect_delay).await;
                reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(20));
                continue;
            }
        };

        reconnect_delay = Duration::from_secs(1);
        eprintln!("orbit runner connected to {}", ws_url);

        let (mut writer, mut reader) = stream.split();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();

        let write_task = tokio::spawn(async move {
            while let Some(message) = out_rx.recv().await {
                if writer.send(Message::Text(message.into())).await.is_err() {
                    break;
                }
            }
        });

        let events_task = {
            let rx = events_tx.subscribe();
            let out_tx_events = out_tx.clone();
            tokio::spawn(forward_events(rx, out_tx_events))
        };

        if out_tx
            .send(
                json!({
                    "type": "anchor.hello",
                    "name": runner_name.clone(),
                    "platform": std::env::consts::OS,
                    "authUrl": config.orbit_auth_url.clone(),
                })
                .to_string(),
            )
            .is_err()
        {
            eprintln!("[daemon] failed to send orbit anchor.hello message");
        }

        let client_version = format!("daemon-{}", env!("CARGO_PKG_VERSION"));
        let request_limiter = Arc::new(Semaphore::new(MAX_IN_FLIGHT_RPC_PER_CONNECTION));
        while let Some(frame) = reader.next().await {
            match frame {
                Ok(Message::Text(text)) => {
                    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
                        handle_orbit_line(
                            line,
                            Arc::clone(&state),
                            out_tx.clone(),
                            client_version.clone(),
                            Arc::clone(&request_limiter),
                        );
                    }
                }
                Ok(Message::Binary(bytes)) => {
                    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                        for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
                            handle_orbit_line(
                                line,
                                Arc::clone(&state),
                                out_tx.clone(),
                                client_version.clone(),
                                Arc::clone(&request_limiter),
                            );
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {}
                Ok(Message::Frame(_)) => {}
                Err(err) => {
                    eprintln!("orbit runner connection error: {err}");
                    break;
                }
            }
        }

        drop(out_tx);
        events_task.abort();
        write_task.abort();

        eprintln!(
            "orbit runner disconnected. reconnecting in {}s",
            reconnect_delay.as_secs()
        );
        sleep(reconnect_delay).await;
        reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(20));
    }
}
