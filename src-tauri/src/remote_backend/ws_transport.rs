use std::sync::atomic::AtomicBool;
use std::sync::Arc;

use futures_util::{SinkExt, StreamExt};
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::tungstenite::Message as WsMessage;

use super::transport::{
    dispatch_incoming_line, mark_disconnected, PendingMap, RemoteTransport, RemoteTransportConfig,
    TransportConnection, TransportFuture,
};

const OUTBOUND_QUEUE_CAPACITY: usize = 512;

pub(crate) struct WssTransport;

impl RemoteTransport for WssTransport {
    fn connect(&self, app: AppHandle, config: RemoteTransportConfig) -> TransportFuture {
        Box::pin(async move {
            let RemoteTransportConfig::Wss { url, .. } = config else {
                return Err("Expected WSS remote transport config".to_string());
            };

            let (socket, _) = tokio_tungstenite::connect_async(url.clone())
                .await
                .map_err(|err| {
                    format!("Failed to connect to remote backend via WebSocket at {url}: {err}")
                })?;

            let (mut writer, mut reader) = socket.split();

            let (out_tx, mut out_rx) = mpsc::channel::<String>(OUTBOUND_QUEUE_CAPACITY);
            let pending = Arc::new(Mutex::new(PendingMap::new()));
            let pending_for_writer = Arc::clone(&pending);
            let pending_for_reader = Arc::clone(&pending);

            let connected = Arc::new(AtomicBool::new(true));
            let connected_for_writer = Arc::clone(&connected);
            let connected_for_reader = Arc::clone(&connected);

            tokio::spawn(async move {
                while let Some(message) = out_rx.recv().await {
                    if writer.send(WsMessage::Text(message.into())).await.is_err() {
                        mark_disconnected(&pending_for_writer, &connected_for_writer).await;
                        break;
                    }
                }
            });

            tokio::spawn(async move {
                while let Some(frame) = reader.next().await {
                    match frame {
                        Ok(WsMessage::Text(line)) => {
                            dispatch_incoming_line(&app, &pending_for_reader, line.as_str()).await;
                        }
                        Ok(WsMessage::Binary(bytes)) => {
                            if let Ok(line) = String::from_utf8(bytes.to_vec()) {
                                dispatch_incoming_line(&app, &pending_for_reader, &line).await;
                            }
                        }
                        Ok(WsMessage::Close(_)) => break,
                        Ok(_) => {}
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
