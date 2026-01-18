use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;
use tokio::task::JoinHandle;

use crate::backend::events::AppServerEvent;
use crate::state::AppState;
use crate::types::CloudProvider;

mod nats;

#[derive(Debug, Clone, Serialize)]
pub(crate) struct NatsStatus {
    pub(crate) ok: bool,
    pub(crate) server: Option<String>,
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct CloudKitStatus {
    pub(crate) available: bool,
    pub(crate) status: String,
}

#[derive(Debug, Clone, Serialize)]
pub(crate) struct CloudKitTestResult {
    #[serde(rename = "recordName")]
    pub(crate) record_name: String,
    #[serde(rename = "durationMs")]
    pub(crate) duration_ms: u64,
}

#[derive(Debug, Deserialize, Serialize)]
struct RpcRequest {
    id: Value,
    method: String,
    #[serde(default)]
    params: Value,
}

#[derive(Debug, Deserialize, Serialize)]
struct RpcError {
    message: String,
}

#[derive(Debug, Deserialize, Serialize)]
struct RpcResponse {
    id: Value,
    #[serde(skip_serializing_if = "Option::is_none")]
    result: Option<Value>,
    #[serde(skip_serializing_if = "Option::is_none")]
    error: Option<RpcError>,
}

impl RpcResponse {
    fn ok(id: Value, result: Value) -> Self {
        Self {
            id,
            result: Some(result),
            error: None,
        }
    }

    fn err(id: Value, message: String) -> Self {
        Self {
            id,
            result: None,
            error: Some(RpcError { message }),
        }
    }
}

pub(crate) struct IntegrationsRuntime {
    cloud: Option<CloudRuntime>,
    cloud_listener: Option<CloudListenerRuntime>,
}

pub(crate) struct CloudRuntime {
    provider: CloudProvider,
    config: Option<String>,
    event_tx: mpsc::UnboundedSender<AppServerEvent>,
    handle: JoinHandle<()>,
}

pub(crate) struct CloudListenerRuntime {
    provider: CloudProvider,
    runner_id: String,
    config: Option<String>,
    handle: JoinHandle<()>,
}

impl Default for IntegrationsRuntime {
    fn default() -> Self {
        Self {
            cloud: None,
            cloud_listener: None,
        }
    }
}

impl IntegrationsRuntime {
    fn stop_cloud(&mut self) {
        if let Some(runtime) = self.cloud.take() {
            runtime.handle.abort();
        }
    }

    fn stop_cloud_listener(&mut self) {
        if let Some(runtime) = self.cloud_listener.take() {
            runtime.handle.abort();
        }
    }
}

#[cfg(mobile)]
pub(crate) async fn apply_settings(app: AppHandle) {
    let state = app.state::<AppState>();
    let provider = state.app_settings.lock().await.cloud_provider.clone();
    let mut integrations = state.integrations.lock().await;
    integrations.stop_cloud();
    if matches!(provider, CloudProvider::Local) {
        integrations.stop_cloud_listener();
    }
}

#[cfg(not(mobile))]
pub(crate) async fn apply_settings(app: AppHandle) {
    let app_for_task = app.clone();
    let state = app.state::<AppState>();
    let settings = state.app_settings.lock().await.clone();

    let mut integrations = state.integrations.lock().await;

    let provider = settings.cloud_provider.clone();
    let config = match provider {
        CloudProvider::Nats => settings.nats_url.clone(),
        CloudProvider::Cloudkit => settings.cloudkit_container_id.clone(),
        CloudProvider::Local => None,
    };

    let needs_cloud = !matches!(provider, CloudProvider::Local);
    let should_restart = match integrations.cloud.as_ref() {
        None => needs_cloud,
        Some(current) => {
            if !needs_cloud {
                true
            } else {
                current.provider != provider || current.config != config
            }
        }
    };

    if should_restart {
        integrations.stop_cloud();
    }

    if !needs_cloud {
        return;
    }

    if integrations.cloud.is_some() {
        return;
    }

    let (event_tx, event_rx) = mpsc::unbounded_channel::<AppServerEvent>();
    let runner_id = settings.runner_id.clone();

    let handle = match provider {
        CloudProvider::Nats => {
            let nats_url = settings.nats_url.clone().unwrap_or_default();
            tokio::spawn(async move {
                nats::run_nats_cloud(app_for_task, runner_id, nats_url, event_rx).await;
            })
        }
        CloudProvider::Cloudkit => {
            tokio::spawn(async move {
                // Placeholder: CloudKit transport is wired in later.
                let _ = event_rx;
                loop {
                    tokio::time::sleep(Duration::from_secs(60)).await;
                }
            })
        }
        CloudProvider::Local => unreachable!(),
    };

    integrations.cloud = Some(CloudRuntime {
        provider,
        config,
        event_tx,
        handle,
    });
}

pub(crate) fn try_emit_app_server_event(app: &AppHandle, event: AppServerEvent) {
    let Some(state) = app.try_state::<AppState>() else {
        return;
    };
    let integrations = state.integrations.try_lock();
    let Some(integrations) = integrations.ok() else {
        return;
    };
    let Some(cloud) = integrations.cloud.as_ref() else {
        return;
    };
    let _ = cloud.event_tx.send(event);
}

async fn ensure_connected(app: &AppHandle, workspace_id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.sessions.lock().await.contains_key(workspace_id) {
        return Ok(());
    }
    crate::workspaces::connect_workspace(workspace_id.to_string(), state, app.clone()).await
}

async fn handle_rpc_inner(app: &AppHandle, req: &RpcRequest) -> Result<Value, String> {
    let method = req.method.as_str();
    match method {
        "ping" => Ok(json!({"ok": true})),
        "list_workspaces" => {
            let state = app.state::<AppState>();
            let workspaces = crate::workspaces::list_workspaces(state).await?;
            serde_json::to_value(workspaces).map_err(|e| e.to_string())
        }
        "connect_workspace" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .or_else(|| req.params.get("id").and_then(|v| v.as_str()))
                .ok_or("missing workspaceId")?;
            ensure_connected(app, workspace_id).await?;
            Ok(json!({"ok": true}))
        }
        "list_threads" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            ensure_connected(app, workspace_id).await?;
            let cursor = req.params.get("cursor").cloned().unwrap_or(Value::Null);
            let limit = req.params.get("limit").cloned().unwrap_or(Value::Null);
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request(
                    "thread/list",
                    json!({ "cursor": cursor, "limit": limit }),
                )
                .await
        }
        "resume_thread" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let thread_id = req
                .params
                .get("threadId")
                .and_then(|v| v.as_str())
                .ok_or("missing threadId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request("thread/resume", json!({ "threadId": thread_id }))
                .await
        }
        "archive_thread" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let thread_id = req
                .params
                .get("threadId")
                .and_then(|v| v.as_str())
                .ok_or("missing threadId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request("thread/archive", json!({ "threadId": thread_id }))
                .await
        }
        "start_thread" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request(
                    "thread/start",
                    json!({ "cwd": session.entry.path, "approvalPolicy": "on-request" }),
                )
                .await
        }
        "send_user_message" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let thread_id = req
                .params
                .get("threadId")
                .and_then(|v| v.as_str())
                .ok_or("missing threadId")?;
            let text = req
                .params
                .get("text")
                .and_then(|v| v.as_str())
                .ok_or("missing text")?;
            ensure_connected(app, workspace_id).await?;

            let model = req.params.get("model").cloned().unwrap_or(Value::Null);
            let effort = req.params.get("effort").cloned().unwrap_or(Value::Null);
            let access_mode = req
                .params
                .get("accessMode")
                .and_then(|v| v.as_str())
                .unwrap_or("current")
                .to_string();
            let images = req.params.get("images").cloned().unwrap_or(Value::Null);

            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;

            let sandbox_policy = match access_mode.as_str() {
                "full-access" => json!({ "type": "dangerFullAccess" }),
                "read-only" => json!({ "type": "readOnly" }),
                _ => json!({
                    "type": "workspaceWrite",
                    "writableRoots": [session.entry.path],
                    "networkAccess": true
                }),
            };
            let approval_policy = if access_mode == "full-access" {
                "never"
            } else {
                "on-request"
            };

            let mut input: Vec<Value> = Vec::new();
            if !text.trim().is_empty() {
                input.push(json!({ "type": "text", "text": text.trim() }));
            }
            if let Value::Array(items) = images {
                for item in items {
                    let Some(path) = item.as_str() else {
                        continue;
                    };
                    let trimmed = path.trim();
                    if trimmed.is_empty() {
                        continue;
                    }
                    if trimmed.starts_with("data:")
                        || trimmed.starts_with("http://")
                        || trimmed.starts_with("https://")
                    {
                        input.push(json!({ "type": "image", "url": trimmed }));
                    } else {
                        input.push(json!({ "type": "localImage", "path": trimmed }));
                    }
                }
            }
            if input.is_empty() {
                return Err("empty user message".to_string());
            }

            session
                .send_request(
                    "turn/start",
                    json!({
                        "threadId": thread_id,
                        "input": input,
                        "cwd": session.entry.path,
                        "approvalPolicy": approval_policy,
                        "sandboxPolicy": sandbox_policy,
                        "model": model,
                        "effort": effort,
                    }),
                )
                .await
        }
        "turn_interrupt" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let thread_id = req
                .params
                .get("threadId")
                .and_then(|v| v.as_str())
                .ok_or("missing threadId")?;
            let turn_id = req
                .params
                .get("turnId")
                .and_then(|v| v.as_str())
                .ok_or("missing turnId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request(
                    "turn/interrupt",
                    json!({ "threadId": thread_id, "turnId": turn_id }),
                )
                .await
        }
        "start_review" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let thread_id = req
                .params
                .get("threadId")
                .and_then(|v| v.as_str())
                .ok_or("missing threadId")?;
            let target = req
                .params
                .get("target")
                .cloned()
                .ok_or("missing `target`")?;
            let delivery = req.params.get("delivery").and_then(|v| v.as_str());
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            let mut payload = json!({ "threadId": thread_id, "target": target });
            if let Some(delivery) = delivery {
                if let Some(obj) = payload.as_object_mut() {
                    obj.insert("delivery".to_string(), json!(delivery));
                }
            }
            session.send_request("review/start", payload).await
        }
        "model_list" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session.send_request("model/list", json!({})).await
        }
        "account_rate_limits" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request("account/rateLimits/read", Value::Null)
                .await
        }
        "skills_list" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session
                .send_request("skills/list", json!({ "cwd": session.entry.path }))
                .await
        }
        "prompts_list" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .unwrap_or_default()
                .to_string();
            let prompts = crate::prompts::prompts_list(workspace_id).await?;
            serde_json::to_value(prompts).map_err(|e| e.to_string())
        }
        "list_workspace_files" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let state = app.state::<AppState>();
            let workspaces = state.workspaces.lock().await;
            let entry = workspaces
                .get(workspace_id)
                .ok_or("workspace not found")?;
            let root = std::path::PathBuf::from(&entry.path);
            let files = crate::workspaces::list_workspace_files_inner(&root, usize::MAX);
            serde_json::to_value(files).map_err(|e| e.to_string())
        }
        "respond_to_server_request" => {
            let workspace_id = req
                .params
                .get("workspaceId")
                .and_then(|v| v.as_str())
                .ok_or("missing workspaceId")?;
            let request_id = req
                .params
                .get("requestId")
                .and_then(|v| v.as_u64())
                .ok_or("missing requestId")?;
            let result = req.params.get("result").cloned().unwrap_or(Value::Null);
            ensure_connected(app, workspace_id).await?;
            let state = app.state::<AppState>();
            let sessions = state.sessions.lock().await;
            let session = sessions
                .get(workspace_id)
                .ok_or("workspace not connected")?;
            session.send_response(request_id, result).await?;
            Ok(json!({ "ok": true }))
        }
        _ => Err(format!("unknown method: {method}")),
    }
}

pub(crate) async fn handle_nats_command(app: &AppHandle, payload: &str) -> Option<String> {
    let req: RpcRequest = serde_json::from_str(payload).ok()?;
    let id = req.id.clone();
    let res = match handle_rpc_inner(app, &req).await {
        Ok(result) => RpcResponse::ok(id, result),
        Err(err) => RpcResponse::err(id, err),
    };
    serde_json::to_string(&res).ok()
}

#[tauri::command]
pub(crate) async fn nats_status(app: AppHandle) -> Result<NatsStatus, String> {
    let state = app.state::<AppState>();
    let settings = state.app_settings.lock().await;
    let url = settings.nats_url.clone().unwrap_or_default();
    nats::nats_status(url).await
}

#[tauri::command]
pub(crate) async fn cloudkit_status() -> Result<CloudKitStatus, String> {
    Ok(CloudKitStatus {
        available: false,
        status: "CloudKit not wired yet.".to_string(),
    })
}

#[tauri::command]
pub(crate) async fn cloudkit_test() -> Result<CloudKitTestResult, String> {
    Err("CloudKit not wired yet.".to_string())
}

#[tauri::command]
pub(crate) async fn cloud_discover_runner(app: AppHandle) -> Result<Option<String>, String> {
    let state = app.state::<AppState>();
    let settings = state.app_settings.lock().await.clone();
    match settings.cloud_provider {
        CloudProvider::Nats => {
            let url = settings
                .nats_url
                .ok_or("NATS URL not configured.".to_string())?;
            nats::nats_discover_runner(&url, 7000).await
        }
        _ => Ok(None),
    }
}

#[tauri::command]
pub(crate) async fn cloud_rpc(
    runner_id: String,
    method: String,
    params: Value,
    app: AppHandle,
) -> Result<Value, String> {
    let state = app.state::<AppState>();
    let settings = state.app_settings.lock().await.clone();
    match settings.cloud_provider {
        CloudProvider::Local => {
            let req = RpcRequest {
                id: json!("local"),
                method,
                params,
            };
            handle_rpc_inner(&app, &req).await
        }
        CloudProvider::Nats => {
            let url = settings
                .nats_url
                .ok_or("NATS URL not configured.".to_string())?;
            let id = json!(uuid::Uuid::new_v4().to_string());
            let req_json = serde_json::to_string(&RpcRequest { id: id.clone(), method, params })
                .map_err(|e| e.to_string())?;
            let reply_json = nats::nats_request(
                &url,
                format!("cm.cmd.{runner_id}"),
                req_json,
                15_000,
            )
            .await?;
            let response: RpcResponse =
                serde_json::from_str(&reply_json).map_err(|e| e.to_string())?;
            if response.error.is_some() {
                let message = response
                    .error
                    .map(|e| e.message)
                    .unwrap_or_else(|| "Unknown error".to_string());
                return Err(message);
            }
            Ok(response.result.unwrap_or(Value::Null))
        }
        CloudProvider::Cloudkit => Err("CloudKit not wired yet.".to_string()),
    }
}

#[tauri::command]
pub(crate) async fn cloud_subscribe_runner_events(
    runner_id: String,
    app: AppHandle,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let settings = state.app_settings.lock().await.clone();
    let provider = settings.cloud_provider.clone();
    let config = match provider {
        CloudProvider::Nats => settings.nats_url.clone(),
        CloudProvider::Cloudkit => settings.cloudkit_container_id.clone(),
        CloudProvider::Local => None,
    };

    if matches!(provider, CloudProvider::Local) {
        let mut integrations = state.integrations.lock().await;
        integrations.stop_cloud_listener();
        return Ok(());
    }

    let needs_restart = {
        let integrations = state.integrations.lock().await;
        match integrations.cloud_listener.as_ref() {
            None => true,
            Some(current) => {
                current.provider != provider
                    || current.runner_id != runner_id
                    || current.config != config
            }
        }
    };

    if !needs_restart {
        return Ok(());
    }

    let mut integrations = state.integrations.lock().await;
    integrations.stop_cloud_listener();

    match provider {
        CloudProvider::Nats => {
            let url = settings
                .nats_url
                .ok_or("NATS URL not configured.".to_string())?;
            let app_for_task = app.clone();
            let runner_id_for_task = runner_id.clone();
            let handle = tokio::spawn(async move {
                nats::run_nats_event_listener(app_for_task, runner_id_for_task, url).await;
            });
            integrations.cloud_listener = Some(CloudListenerRuntime {
                provider,
                runner_id,
                config,
                handle,
            });
            Ok(())
        }
        CloudProvider::Cloudkit => Err("CloudKit not wired yet.".to_string()),
        CloudProvider::Local => Ok(()),
    }
}
