use futures_util::{SinkExt, StreamExt};
use tauri::AppHandle;
use tokio::sync::{mpsc, Mutex};
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;
use std::sync::Arc;
use std::sync::atomic::AtomicBool;

use super::transport::{
    PendingMap, RemoteTransport, RemoteTransportConfig, TransportConnection, TransportFuture,
    dispatch_incoming_line, mark_disconnected,
};

const OUTBOUND_QUEUE_CAPACITY: usize = 512;

pub(crate) struct WebSocketTransport;

impl RemoteTransport for WebSocketTransport {
    fn connect(&self, app: AppHandle, config: RemoteTransportConfig) -> TransportFuture {
        Box::pin(async move {
            let RemoteTransportConfig::WebSocket { url, .. } = config else {
                return Err("expected WebSocket transport config".to_string());
            };

            let (ws_stream, _response) = connect_async(&url)
                .await
                .map_err(|err| format!("Failed to connect via WebSocket to {url}: {err}"))?;

            let (mut ws_writer, mut ws_reader) = ws_stream.split();

            let (out_tx, mut out_rx) = mpsc::channel::<String>(OUTBOUND_QUEUE_CAPACITY);
            let pending = Arc::new(Mutex::new(PendingMap::new()));
            let connected = Arc::new(AtomicBool::new(true));

            let pending_for_writer = Arc::clone(&pending);
            let connected_for_writer = Arc::clone(&connected);

            // Write loop: send outbound messages as WebSocket text frames
            tokio::spawn(async move {
                while let Some(message) = out_rx.recv().await {
                    if ws_writer.send(Message::Text(message.into())).await.is_err() {
                        mark_disconnected(&pending_for_writer, &connected_for_writer).await;
                        break;
                    }
                }
                let _ = ws_writer.close().await;
            });

            let pending_for_reader = Arc::clone(&pending);
            let connected_for_reader = Arc::clone(&connected);

            // Read loop: receive WebSocket messages and dispatch
            tokio::spawn(async move {
                while let Some(msg_result) = ws_reader.next().await {
                    let msg = match msg_result {
                        Ok(msg) => msg,
                        Err(_) => break,
                    };

                    let line = match msg {
                        Message::Text(text) => text,
                        Message::Close(_) => break,
                        Message::Ping(_) | Message::Pong(_) | Message::Frame(_) => continue,
                        Message::Binary(_) => continue,
                    };

                    let trimmed = line.trim();
                    if trimmed.is_empty() {
                        continue;
                    }

                    dispatch_incoming_line(&app, &pending_for_reader, trimmed).await;
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
