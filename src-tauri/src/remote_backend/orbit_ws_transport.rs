use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use crate::shared::orbit_core;

use super::transport::{
    dispatch_incoming_line, mark_disconnected, PendingMap, RemoteTransport, RemoteTransportConfig,
    TransportConnection, TransportFuture,
};

pub(crate) struct OrbitWsTransport;
const OUTBOUND_QUEUE_CAPACITY: usize = 512;

impl RemoteTransport for OrbitWsTransport {
    fn connect(&self, app: AppHandle, config: RemoteTransportConfig) -> TransportFuture {
        Box::pin(async move {
            let RemoteTransportConfig::OrbitWs { ws_url, auth_token } = config else {
                return Err("invalid transport config for orbit websocket transport".to_string());
            };

            let ws_url = orbit_core::build_orbit_ws_url(&ws_url, auth_token.as_deref())?;
            let (stream, _response) = connect_async(&ws_url)
                .await
                .map_err(|err| format!("Failed to connect to Orbit relay at {ws_url}: {err}"))?;
            let (mut writer, mut reader) = stream.split();

            let (out_tx, mut out_rx) = mpsc::channel::<String>(OUTBOUND_QUEUE_CAPACITY);
            let pending = Arc::new(Mutex::new(PendingMap::new()));
            let pending_for_writer = Arc::clone(&pending);
            let pending_for_reader = Arc::clone(&pending);

            let connected = Arc::new(AtomicBool::new(true));
            let connected_for_writer = Arc::clone(&connected);
            let connected_for_reader = Arc::clone(&connected);

            tokio::spawn(async move {
                while let Some(message) = out_rx.recv().await {
                    if writer.send(Message::Text(message.into())).await.is_err() {
                        mark_disconnected(&pending_for_writer, &connected_for_writer).await;
                        break;
                    }
                }
            });

            tokio::spawn(async move {
                while let Some(frame) = reader.next().await {
                    match frame {
                        Ok(Message::Text(text)) => {
                            dispatch_incoming_payload(&app, &pending_for_reader, text.as_ref())
                                .await;
                        }
                        Ok(Message::Binary(bytes)) => {
                            if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                                dispatch_incoming_payload(&app, &pending_for_reader, &text).await;
                            }
                        }
                        Ok(Message::Close(_)) => break,
                        Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {}
                        Ok(Message::Frame(_)) => {}
                        Err(_) => break,
                    }
                }

                mark_disconnected(&pending_for_reader, &connected_for_reader).await;
            });

            Ok(TransportConnection {
                out_tx,
                pending,
                connected,
            })
        })
    }
}

#[cfg(test)]
mod tests {
    use super::protocol_lines;

    #[test]
    fn protocol_lines_splits_multiline_payload() {
        let payload = "{\"id\":1}\n{\"id\":2}\n";
        let lines: Vec<&str> = protocol_lines(payload).collect();
        assert_eq!(lines, vec!["{\"id\":1}", "{\"id\":2}"]);
    }

    #[test]
    fn protocol_lines_trims_and_skips_empty_lines() {
        let payload = "  {\"id\":1}  \n\n\t{\"id\":2}\r\n";
        let lines: Vec<&str> = protocol_lines(payload).collect();
        assert_eq!(lines, vec!["{\"id\":1}", "{\"id\":2}"]);
    }
}

async fn dispatch_incoming_payload(
    app: &AppHandle,
    pending: &Arc<Mutex<PendingMap>>,
    payload: &str,
) {
    for line in protocol_lines(payload) {
        dispatch_incoming_line(app, pending, line).await;
    }
}

fn protocol_lines(payload: &str) -> impl Iterator<Item = &str> {
    payload
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
}
