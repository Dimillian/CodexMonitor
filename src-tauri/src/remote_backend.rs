use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::atomic::{AtomicBool, AtomicU64, Ordering};
use std::sync::Arc;

use tauri::{AppHandle, Emitter};
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::TcpStream;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::state::AppState;
use crate::types::BackendMode;

const DEFAULT_REMOTE_HOST: &str = "127.0.0.1:4732";
const DISCONNECTED_MESSAGE: &str = "remote backend disconnected";

type PendingMap = HashMap<u64, oneshot::Sender<Result<Value, String>>>;

pub(crate) fn normalize_path_for_remote(path: String) -> String {
    let trimmed = path.trim();
    if trimmed.is_empty() {
        return path;
    }

    if let Some(normalized) = normalize_wsl_unc_path(trimmed) {
        return normalized;
    }

    path
}

fn normalize_wsl_unc_path(path: &str) -> Option<String> {
    let lower = path.to_ascii_lowercase();
    let (prefix_len, raw) = if lower.starts_with("\\\\wsl$\\") {
        (7, path)
    } else if lower.starts_with("\\\\wsl.localhost\\") {
        (16, path)
    } else {
        return None;
    };

    let remainder = raw.get(prefix_len..)?;
    let mut segments = remainder.split('\\').filter(|segment| !segment.is_empty());
    segments.next()?;
    let joined = segments.collect::<Vec<_>>().join("/");
    Some(if joined.is_empty() {
        "/".to_string()
    } else {
        format!("/{joined}")
    })
}

#[derive(Clone)]
pub(crate) struct RemoteBackend {
    inner: Arc<RemoteBackendInner>,
}

struct RemoteBackendInner {
    out_tx: mpsc::UnboundedSender<String>,
    pending: Arc<Mutex<PendingMap>>,
    next_id: AtomicU64,
    connected: Arc<AtomicBool>,
}

impl RemoteBackend {
    pub(crate) async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        if !self.inner.connected.load(Ordering::SeqCst) {
            return Err(DISCONNECTED_MESSAGE.to_string());
        }

        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = oneshot::channel();
        self.inner.pending.lock().await.insert(id, tx);

        let request = json!({
            "id": id,
            "method": method,
            "params": params,
        });
        let message = serde_json::to_string(&request).map_err(|err| err.to_string())?;
        if self.inner.out_tx.send(message).is_err() {
            self.inner.pending.lock().await.remove(&id);
            return Err(DISCONNECTED_MESSAGE.to_string());
        }

        rx.await
            .map_err(|_| DISCONNECTED_MESSAGE.to_string())?
    }
}

pub(crate) async fn is_remote_mode(state: &AppState) -> bool {
    let settings = state.app_settings.lock().await;
    matches!(settings.backend_mode, BackendMode::Remote)
}

pub(crate) async fn call_remote(
    state: &AppState,
    app: AppHandle,
    method: &str,
    params: Value,
) -> Result<Value, String> {
    let client = ensure_remote_backend(state, app).await?;
    match client.call(method, params).await {
        Ok(value) => Ok(value),
        Err(err) => {
            *state.remote_backend.lock().await = None;
            Err(err)
        }
    }
}

async fn ensure_remote_backend(state: &AppState, app: AppHandle) -> Result<RemoteBackend, String> {
    {
        let guard = state.remote_backend.lock().await;
        if let Some(client) = guard.as_ref() {
            return Ok(client.clone());
        }
    }

    let (host, token) = {
        let settings = state.app_settings.lock().await;
        (
            settings.remote_backend_host.clone(),
            settings.remote_backend_token.clone(),
        )
    };

    let resolved_host = if host.trim().is_empty() {
        DEFAULT_REMOTE_HOST.to_string()
    } else {
        host
    };

    let stream = TcpStream::connect(resolved_host.clone())
        .await
        .map_err(|err| format!("Failed to connect to remote backend at {resolved_host}: {err}"))?;
    let (reader, mut writer) = stream.into_split();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let pending = Arc::new(Mutex::new(PendingMap::new()));
    let pending_for_writer = Arc::clone(&pending);
    let pending_for_reader = Arc::clone(&pending);

    let connected = Arc::new(AtomicBool::new(true));
    let connected_for_writer = Arc::clone(&connected);
    let connected_for_reader = Arc::clone(&connected);

    let write_task = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if writer.write_all(message.as_bytes()).await.is_err()
                || writer.write_all(b"\n").await.is_err()
            {
                connected_for_writer.store(false, Ordering::SeqCst);
                let mut pending = pending_for_writer.lock().await;
                for (_, sender) in pending.drain() {
                    let _ = sender.send(Err(DISCONNECTED_MESSAGE.to_string()));
                }
                break;
            }
        }
    });

    let app_for_reader = app.clone();
    let read_task = tokio::spawn(async move {
        read_loop(
            app_for_reader,
            reader,
            pending_for_reader,
            connected_for_reader,
        )
        .await;
    });

    let client = RemoteBackend {
        inner: Arc::new(RemoteBackendInner {
            out_tx,
            pending,
            next_id: AtomicU64::new(1),
            connected,
        }),
    };

    if let Some(token) = token {
        client
            .call("auth", json!({ "token": token }))
            .await
            .map(|_| ())?;
    }

    {
        let mut guard = state.remote_backend.lock().await;
        *guard = Some(client.clone());
    }

    drop((write_task, read_task));

    Ok(client)
}

async fn read_loop(
    app: AppHandle,
    reader: tokio::net::tcp::OwnedReadHalf,
    pending: Arc<Mutex<PendingMap>>,
    connected: Arc<AtomicBool>,
) {
    let mut lines = BufReader::new(reader).lines();

    while let Ok(Some(line)) = lines.next_line().await {
        let trimmed = line.trim();
        if trimmed.is_empty() {
            continue;
        }

        let message: Value = match serde_json::from_str(trimmed) {
            Ok(value) => value,
            Err(_) => continue,
        };

        if let Some(id) = message.get("id").and_then(|value| value.as_u64()) {
            let sender = pending.lock().await.remove(&id);
            let Some(sender) = sender else {
                continue;
            };

            if let Some(error) = message.get("error") {
                let err_message = error
                    .get("message")
                    .and_then(|value| value.as_str())
                    .unwrap_or("remote error");
                let _ = sender.send(Err(err_message.to_string()));
                continue;
            }

            let result = message.get("result").cloned().unwrap_or(Value::Null);
            let _ = sender.send(Ok(result));
            continue;
        }

        let method = message
            .get("method")
            .and_then(|value| value.as_str())
            .unwrap_or("");
        if method.is_empty() {
            continue;
        }
        let params = message.get("params").cloned().unwrap_or(Value::Null);
        match method {
            "app-server-event" => {
                let _ = app.emit("app-server-event", params);
            }
            "terminal-output" => {
                let _ = app.emit("terminal-output", params);
            }
            _ => {}
        }
    }

    connected.store(false, Ordering::SeqCst);
    let mut pending = pending.lock().await;
    for (_, sender) in pending.drain() {
        let _ = sender.send(Err(DISCONNECTED_MESSAGE.to_string()));
    }
}
