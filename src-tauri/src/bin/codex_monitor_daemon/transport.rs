use super::rpc::{
    build_error_response, build_result_response, forward_events, parse_auth_token,
    spawn_rpc_response_task,
};
use super::*;
use futures_util::{SinkExt, StreamExt};
use tokio_tungstenite::tungstenite::Message as WsMessage;
use tokio_tungstenite::WebSocketStream;

fn parse_message(line: &str) -> Option<(Option<u64>, String, Value)> {
    let message: Value = serde_json::from_str(line).ok()?;
    let id = message.get("id").and_then(|value| value.as_u64());
    let method = message
        .get("method")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    if method.is_empty() {
        return None;
    }
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    Some((id, method, params))
}

async fn process_rpc_line(
    line: &str,
    config: &Arc<DaemonConfig>,
    state: &Arc<DaemonState>,
    events: &broadcast::Sender<DaemonEvent>,
    out_tx: &mpsc::UnboundedSender<String>,
    authenticated: &mut bool,
    events_task: &mut Option<tokio::task::JoinHandle<()>>,
    request_limiter: &Arc<Semaphore>,
    client_version: &str,
) {
    let line = line.trim();
    if line.is_empty() {
        return;
    }
    let Some((id, method, params)) = parse_message(line) else {
        return;
    };

    if !*authenticated {
        if method != "auth" {
            if let Some(response) = build_error_response(id, "unauthorized") {
                let _ = out_tx.send(response);
            }
            return;
        }

        let expected = config.token.clone().unwrap_or_default();
        let provided = parse_auth_token(&params).unwrap_or_default();
        if expected != provided {
            if let Some(response) = build_error_response(id, "invalid token") {
                let _ = out_tx.send(response);
            }
            return;
        }

        *authenticated = true;
        if let Some(response) = build_result_response(id, json!({ "ok": true })) {
            let _ = out_tx.send(response);
        }

        let rx = events.subscribe();
        let out_tx_events = out_tx.clone();
        *events_task = Some(tokio::spawn(forward_events(rx, out_tx_events)));
        return;
    }

    spawn_rpc_response_task(
        Arc::clone(state),
        out_tx.clone(),
        id,
        method,
        params,
        client_version.to_string(),
        Arc::clone(request_limiter),
    );
}

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
        process_rpc_line(
            &line,
            &config,
            &state,
            &events,
            &out_tx,
            &mut authenticated,
            &mut events_task,
            &request_limiter,
            &client_version,
        )
        .await;
    }

    drop(out_tx);
    if let Some(task) = events_task {
        task.abort();
    }
    write_task.abort();
}

pub(super) async fn handle_websocket_client<S>(
    socket: WebSocketStream<S>,
    config: Arc<DaemonConfig>,
    state: Arc<DaemonState>,
    events: broadcast::Sender<DaemonEvent>,
) where
    S: tokio::io::AsyncRead + tokio::io::AsyncWrite + Unpin + Send + 'static,
{
    let (mut writer, mut reader) = socket.split();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let write_task = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if writer.send(WsMessage::Text(message)).await.is_err() {
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

    while let Some(frame) = reader.next().await {
        let Ok(frame) = frame else {
            break;
        };
        match frame {
            WsMessage::Text(line) => {
                process_rpc_line(
                    line.as_str(),
                    &config,
                    &state,
                    &events,
                    &out_tx,
                    &mut authenticated,
                    &mut events_task,
                    &request_limiter,
                    &client_version,
                )
                .await;
            }
            WsMessage::Binary(bytes) => {
                if let Ok(line) = String::from_utf8(bytes.to_vec()) {
                    process_rpc_line(
                        &line,
                        &config,
                        &state,
                        &events,
                        &out_tx,
                        &mut authenticated,
                        &mut events_task,
                        &request_limiter,
                        &client_version,
                    )
                    .await;
                }
            }
            WsMessage::Close(_) => break,
            _ => {}
        }
    }

    drop(out_tx);
    if let Some(task) = events_task {
        task.abort();
    }
    write_task.abort();
}
