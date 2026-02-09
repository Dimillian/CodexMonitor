mod orbit_ws_transport;
mod protocol;
mod tcp_transport;
mod transport;

use serde_json::{json, Value};
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;

use tauri::AppHandle;
use tokio::sync::Mutex;

use crate::state::AppState;
use crate::types::{BackendMode, RemoteBackendProvider};

use self::orbit_ws_transport::OrbitWsTransport;
use self::protocol::{build_request_line, DEFAULT_REMOTE_HOST, DISCONNECTED_MESSAGE};
use self::tcp_transport::TcpTransport;
use self::transport::{PendingMap, RemoteTransport, RemoteTransportConfig, RemoteTransportKind};

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
    out_tx: tokio::sync::mpsc::UnboundedSender<String>,
    pending: Arc<Mutex<PendingMap>>,
    next_id: AtomicU64,
    connected: Arc<std::sync::atomic::AtomicBool>,
}

impl RemoteBackend {
    pub(crate) async fn call(&self, method: &str, params: Value) -> Result<Value, String> {
        if !self.inner.connected.load(Ordering::SeqCst) {
            return Err(DISCONNECTED_MESSAGE.to_string());
        }

        let id = self.inner.next_id.fetch_add(1, Ordering::SeqCst);
        let (tx, rx) = tokio::sync::oneshot::channel();
        self.inner.pending.lock().await.insert(id, tx);

        let message = build_request_line(id, method, params)?;
        if self.inner.out_tx.send(message).is_err() {
            self.inner.pending.lock().await.remove(&id);
            return Err(DISCONNECTED_MESSAGE.to_string());
        }

        rx.await.map_err(|_| DISCONNECTED_MESSAGE.to_string())?
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
    let client = ensure_remote_backend(state, app.clone()).await?;
    match client.call(method, params.clone()).await {
        Ok(value) => Ok(value),
        Err(err) if err == DISCONNECTED_MESSAGE => {
            *state.remote_backend.lock().await = None;
            if !can_retry_after_disconnect(method) {
                return Err(err);
            }
            let retry_client = ensure_remote_backend(state, app).await?;
            match retry_client.call(method, params).await {
                Ok(value) => Ok(value),
                Err(retry_err) => {
                    *state.remote_backend.lock().await = None;
                    Err(retry_err)
                }
            }
        }
        Err(err) => {
            *state.remote_backend.lock().await = None;
            Err(err)
        }
    }
}

fn can_retry_after_disconnect(method: &str) -> bool {
    matches!(
        method,
        "account_rate_limits"
            | "account_read"
            | "apps_list"
            | "collaboration_mode_list"
            | "connect_workspace"
            | "file_read"
            | "get_config_model"
            | "get_git_commit_diff"
            | "get_git_diffs"
            | "get_git_log"
            | "get_git_remote"
            | "get_git_status"
            | "get_github_issues"
            | "get_github_pull_request_comments"
            | "get_github_pull_request_diff"
            | "get_github_pull_requests"
            | "is_workspace_path_dir"
            | "list_git_branches"
            | "list_git_roots"
            | "list_mcp_server_status"
            | "list_threads"
            | "local_usage_snapshot"
            | "list_workspace_files"
            | "list_workspaces"
            | "model_list"
            | "read_workspace_file"
            | "resume_thread"
            | "skills_list"
            | "worktree_setup_status"
    )
}

async fn ensure_remote_backend(state: &AppState, app: AppHandle) -> Result<RemoteBackend, String> {
    {
        let guard = state.remote_backend.lock().await;
        if let Some(client) = guard.as_ref() {
            return Ok(client.clone());
        }
    }

    let transport_config = {
        let settings = state.app_settings.lock().await;
        resolve_transport_config(&settings)?
    };
    let transport_kind = transport_config.kind();
    let auth_token = transport_config.auth_token().map(|value| value.to_string());

    let transport: Box<dyn RemoteTransport> = match transport_config.kind() {
        RemoteTransportKind::Tcp => Box::new(TcpTransport),
        RemoteTransportKind::OrbitWs => Box::new(OrbitWsTransport),
    };
    let connection = transport.connect(app, transport_config).await?;

    let client = RemoteBackend {
        inner: Arc::new(RemoteBackendInner {
            out_tx: connection.out_tx,
            pending: connection.pending,
            next_id: AtomicU64::new(1),
            connected: connection.connected,
        }),
    };

    if matches!(transport_kind, RemoteTransportKind::Tcp) {
        if let Some(token) = auth_token {
            client
                .call("auth", json!({ "token": token }))
                .await
                .map(|_| ())?;
        }
    }

    {
        let mut guard = state.remote_backend.lock().await;
        *guard = Some(client.clone());
    }

    Ok(client)
}

fn resolve_transport_config(
    settings: &crate::types::AppSettings,
) -> Result<RemoteTransportConfig, String> {
    match settings.remote_backend_provider {
        RemoteBackendProvider::Tcp => {
            let host = if settings.remote_backend_host.trim().is_empty() {
                DEFAULT_REMOTE_HOST.to_string()
            } else {
                settings.remote_backend_host.clone()
            };
            Ok(RemoteTransportConfig::Tcp {
                host,
                auth_token: settings.remote_backend_token.clone(),
            })
        }
        RemoteBackendProvider::Orbit => {
            let ws_url = settings
                .orbit_ws_url
                .as_ref()
                .map(|value| value.trim().to_string())
                .filter(|value| !value.is_empty())
                .ok_or_else(|| "Orbit provider requires orbitWsUrl in app settings.".to_string())?;
            Ok(RemoteTransportConfig::OrbitWs {
                ws_url,
                auth_token: settings.remote_backend_token.clone(),
            })
        }
    }
}

#[cfg(test)]
mod tests {
    use super::{can_retry_after_disconnect, resolve_transport_config};
    use crate::remote_backend::transport::RemoteTransportConfig;
    use crate::types::{AppSettings, RemoteBackendProvider};

    #[test]
    fn resolve_orbit_transport_uses_orbit_ws_url() {
        let mut settings = AppSettings::default();
        settings.remote_backend_provider = RemoteBackendProvider::Orbit;
        settings.orbit_ws_url = Some("https://orbit.example/ws/live".to_string());

        let config = resolve_transport_config(&settings).expect("transport config");
        let RemoteTransportConfig::OrbitWs { ws_url, .. } = config else {
            panic!("expected orbit transport config");
        };
        assert_eq!(ws_url, "https://orbit.example/ws/live");
    }

    #[test]
    fn retries_only_retry_safe_methods_after_disconnect() {
        assert!(can_retry_after_disconnect("resume_thread"));
        assert!(can_retry_after_disconnect("list_threads"));
        assert!(can_retry_after_disconnect("local_usage_snapshot"));
        assert!(!can_retry_after_disconnect("send_user_message"));
        assert!(!can_retry_after_disconnect("start_thread"));
        assert!(!can_retry_after_disconnect("remove_workspace"));
    }
}
