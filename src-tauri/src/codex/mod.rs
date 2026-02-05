use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tauri::{AppHandle, State};
use tokio::sync::Mutex;

pub(crate) mod args;
pub(crate) mod config;
pub(crate) mod home;

use crate::backend::acp_server::{self, AcpSession};
use crate::backend::events::{AppServerEvent, EventSink};
use crate::backend::session::WorkspaceSessionKind;
use crate::event_sink::TauriEventSink;
use crate::remote_backend;
use crate::state::AppState;
use crate::types::WorkspaceEntry;

pub(crate) async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    default_codex_bin: Option<String>,
    codex_args: Option<String>,
    app_handle: AppHandle,
    codex_home: Option<PathBuf>,
) -> Result<Arc<WorkspaceSessionKind>, String> {
    let _ = (default_codex_bin, codex_args, codex_home);
    let client_version = app_handle.package_info().version.to_string();
    let event_sink = TauriEventSink::new(app_handle);
    let session = acp_server::spawn_workspace_session(
        entry,
        None,
        None,
        client_version,
        event_sink,
    )
    .await?;
    Ok(Arc::new(WorkspaceSessionKind::Acp(session)))
}

fn now_millis() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_millis() as u64)
        .unwrap_or(0)
}

async fn get_acp_session(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSessionKind>>>,
    workspace_id: &str,
) -> Result<Arc<AcpSession>, String> {
    let sessions = sessions.lock().await;
    let session = sessions
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not connected".to_string())?;
    session
        .as_acp()
        .ok_or_else(|| "workspace is not using the Copilot ACP backend".to_string())
}

fn acp_only_error(feature: &str) -> String {
    format!("{feature} is not supported with the Copilot ACP backend.")
}

async fn is_copilot_backend(_state: &AppState) -> bool {
    true
}

#[tauri::command]
pub(crate) async fn codex_doctor(
    codex_bin: Option<String>,
    codex_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let _ = (codex_bin, codex_args, state);
    Ok(json!({
        "status": "disabled",
        "detail": "Codex backend support is disabled; using Copilot ACP only.",
    }))
}

#[tauri::command]
pub(crate) async fn start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "start_thread",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    if is_copilot_backend(&state).await {
        return start_thread_acp(
            &state.sessions,
            &state.preflight_session_ids,
            workspace_id,
            app,
        )
        .await;
    }

    Err(acp_only_error("start_thread"))
}

async fn start_thread_acp(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSessionKind>>>,
    preflight_session_ids: &Mutex<HashMap<String, String>>,
    workspace_id: String,
    app: AppHandle,
) -> Result<Value, String> {
    let session = get_acp_session(sessions, &workspace_id).await?;
    let preflight_session_id = {
        let mut preflight_session_ids = preflight_session_ids.lock().await;
        preflight_session_ids.remove(&workspace_id)
    };
    let session_id = if let Some(session_id) = preflight_session_id {
        session_id
    } else {
        let params = json!({ "cwd": session.entry.path, "mcpServers": [] });
        let response = session.send_request("session/new", params).await?;
        if response.get("error").is_some() {
            return Err(format!("session/new failed: {response}"));
        }
        let payload = response.get("result").unwrap_or(&response);
        payload
            .get("sessionId")
            .and_then(Value::as_str)
            .map(|value| value.to_string())
            .ok_or_else(|| "missing sessionId in session/new response".to_string())?
    };

    let thread_payload = json!({
        "id": session_id,
        "name": Value::Null,
        "createdAt": now_millis(),
    });
    let event_sink = TauriEventSink::new(app);
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id,
        message: json!({
            "method": "thread/started",
            "params": { "thread": thread_payload.clone() },
        }),
    });

    Ok(json!({ "result": { "thread": thread_payload } }))
}

#[tauri::command]
pub(crate) async fn resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "resume_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    if is_copilot_backend(&state).await {
        return Ok(json!({ "result": { "thread": { "id": thread_id, "turns": [] } } }));
    }

    Err(acp_only_error("resume_thread"))
}

#[tauri::command]
pub(crate) async fn fork_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "fork_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    Err(acp_only_error("fork_thread"))
}

#[tauri::command]
pub(crate) async fn list_threads(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_threads",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    if is_copilot_backend(&state).await {
        return Ok(json!({ "result": { "data": [], "nextCursor": null } }));
    }

    Err(acp_only_error("list_threads"))
}

#[tauri::command]
pub(crate) async fn list_mcp_server_status(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "list_mcp_server_status",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    Err(acp_only_error("list_mcp_server_status"))
}

#[tauri::command]
pub(crate) async fn archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "archive_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    Err(acp_only_error("archive_thread"))
}

#[tauri::command]
pub(crate) async fn compact_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "compact_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    Err(acp_only_error("compact_thread"))
}

#[tauri::command]
pub(crate) async fn set_thread_name(
    workspace_id: String,
    thread_id: String,
    name: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "set_thread_name",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "name": name }),
        )
        .await;
    }

    Err(acp_only_error("set_thread_name"))
}

#[tauri::command]
pub(crate) async fn send_user_message(
    workspace_id: String,
    thread_id: String,
    text: String,
    model: Option<String>,
    effort: Option<String>,
    access_mode: Option<String>,
    images: Option<Vec<String>>,
    collaboration_mode: Option<Value>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let images = images.map(|paths| {
            paths
                .into_iter()
                .map(remote_backend::normalize_path_for_remote)
                .collect::<Vec<_>>()
        });
        let mut payload = Map::new();
        payload.insert("workspaceId".to_string(), json!(workspace_id));
        payload.insert("threadId".to_string(), json!(thread_id));
        payload.insert("text".to_string(), json!(text));
        payload.insert("model".to_string(), json!(model));
        payload.insert("effort".to_string(), json!(effort));
        payload.insert("accessMode".to_string(), json!(access_mode));
        payload.insert("images".to_string(), json!(images));
        if let Some(mode) = collaboration_mode {
            if !mode.is_null() {
                payload.insert("collaborationMode".to_string(), mode);
            }
        }
        return remote_backend::call_remote(
            &*state,
            app,
            "send_user_message",
            Value::Object(payload),
        )
        .await;
    }

    let _ = (model, effort, access_mode, collaboration_mode);
    send_user_message_acp(
        &state.sessions,
        app,
        workspace_id,
        thread_id,
        text,
        images,
    )
    .await
}

async fn send_user_message_acp(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSessionKind>>>,
    app: AppHandle,
    workspace_id: String,
    thread_id: String,
    text: String,
    _images: Option<Vec<String>>,
) -> Result<Value, String> {
    let session = get_acp_session(sessions, &workspace_id).await?;
    let trimmed_text = text.trim();
    if trimmed_text.is_empty() {
        return Err("empty user message".to_string());
    }

    let prompt = vec![json!({ "type": "text", "text": trimmed_text })];
    let event_sink = TauriEventSink::new(app);
    let turn_id = session.begin_prompt(&thread_id, &event_sink).await?;
    let response = session
        .send_request(
            "session/prompt",
            json!({ "sessionId": thread_id, "prompt": prompt }),
        )
        .await;

    let response = match response {
        Ok(value) => value,
        Err(error) => {
            session.clear_prompt(&thread_id).await;
            return Err(error);
        }
    };
    if response.get("error").is_some() {
        session.clear_prompt(&thread_id).await;
        return Err(format!("session/prompt failed: {response}"));
    }

    session.finish_prompt(&thread_id, &event_sink).await;
    let turn = json!({ "id": turn_id, "threadId": thread_id });
    let response = match response {
        Value::Object(mut map) => {
            if let Some(result_value) = map.get_mut("result") {
                if let Value::Object(result_map) = result_value {
                    result_map.insert("turn".to_string(), turn.clone());
                } else {
                    map.insert("turn".to_string(), turn);
                }
            } else {
                map.insert("turn".to_string(), turn);
            }
            Value::Object(map)
        }
        _ => json!({ "turn": turn }),
    };
    Ok(response)
}

async fn model_list_acp(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSessionKind>>>,
    model_list_cache: &Mutex<HashMap<String, Value>>,
    preflight_session_ids: &Mutex<HashMap<String, String>>,
    workspace_id: String,
) -> Result<Value, String> {
    if let Some(cached) = model_list_cache.lock().await.get(&workspace_id).cloned() {
        return Ok(cached);
    }
    let session = get_acp_session(sessions, &workspace_id).await?;
    let response = session
        .send_request("session/new", json!({ "cwd": session.entry.path, "mcpServers": [] }))
        .await?;
    if response.get("error").is_some() {
        return Err(format!("session/new failed: {response}"));
    }
    let payload = response.get("result").unwrap_or(&response);
    let session_id = payload
        .get("sessionId")
        .and_then(Value::as_str)
        .map(|value| value.to_string());
    let models_payload = payload
        .get("models")
        .and_then(|models| models.get("availableModels"))
        .and_then(Value::as_array)
        .cloned()
        .unwrap_or_default();
    let current_model_id = payload
        .get("models")
        .and_then(|models| models.get("currentModelId"))
        .and_then(Value::as_str);
    let data = models_payload
        .into_iter()
        .filter_map(|model| {
            let model_id = model
                .get("modelId")
                .or_else(|| model.get("id"))
                .and_then(Value::as_str)?;
            let display_name = model
                .get("name")
                .or_else(|| model.get("displayName"))
                .and_then(Value::as_str)
                .unwrap_or(model_id);
            let description = model
                .get("description")
                .and_then(Value::as_str)
                .unwrap_or("");
            let copilot_usage = model
                .get("_meta")
                .and_then(|meta| meta.get("copilotUsage"))
                .and_then(Value::as_str);
            let is_default = current_model_id == Some(model_id);
            Some(json!({
                "id": model_id,
                "model": model_id,
                "displayName": display_name,
                "description": description,
                "isDefault": is_default,
                "copilotUsage": copilot_usage,
            }))
        })
        .collect::<Vec<_>>();
    let mut result = Map::new();
    result.insert("data".to_string(), Value::Array(data));
    if let Some(current_model_id) = current_model_id {
        result.insert("currentModelId".to_string(), json!(current_model_id));
    }
    let response = json!({ "result": Value::Object(result) });
    if let Some(session_id) = session_id {
        preflight_session_ids
            .lock()
            .await
            .insert(workspace_id.clone(), session_id);
    }
    model_list_cache
        .lock()
        .await
        .insert(workspace_id, response.clone());
    Ok(response)
}

async fn account_read_acp(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSessionKind>>>,
    workspace_id: String,
) -> Result<Value, String> {
    let session = get_acp_session(sessions, &workspace_id).await?;
    let response = session.send_request("account/read", Value::Null).await?;
    if let Some(error) = response.get("error") {
        let code = error.get("code").and_then(Value::as_i64);
        let method = error
            .get("data")
            .and_then(|value| value.get("method"))
            .and_then(Value::as_str)
            .unwrap_or("");
        if code == Some(-32601) && method == "account/read" {
            return Ok(json!({ "result": { "authenticated": true, "user": "Copilot" } }));
        }
        return Err(format!("account/read failed: {response}"));
    }
    Ok(response)
}

#[tauri::command]
pub(crate) async fn collaboration_mode_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "collaboration_mode_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    Err(acp_only_error("collaboration_mode_list"))
}

#[tauri::command]
pub(crate) async fn turn_interrupt(
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "turn_interrupt",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "turnId": turn_id }),
        )
        .await;
    }

    Err(acp_only_error("turn_interrupt"))
}

#[tauri::command]
pub(crate) async fn start_review(
    workspace_id: String,
    thread_id: String,
    target: Value,
    delivery: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "start_review",
            json!({
                "workspaceId": workspace_id,
                "threadId": thread_id,
                "target": target,
                "delivery": delivery,
            }),
        )
        .await;
    }

    let _ = (target, delivery);
    Err(acp_only_error("start_review"))
}

#[tauri::command]
pub(crate) async fn model_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "model_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    if is_copilot_backend(&state).await {
        return model_list_acp(
            &state.sessions,
            &state.model_list_cache,
            &state.preflight_session_ids,
            workspace_id,
        )
        .await;
    }

    Err(acp_only_error("model_list"))
}

#[tauri::command]
pub(crate) async fn account_rate_limits(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "account_rate_limits",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    Err(acp_only_error("account_rate_limits"))
}

#[tauri::command]
pub(crate) async fn account_read(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "account_read",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    if is_copilot_backend(&state).await {
        return account_read_acp(&state.sessions, workspace_id).await;
    }

    Err(acp_only_error("account_read"))
}

#[tauri::command]
pub(crate) async fn codex_login(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "codex_login",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    Err(acp_only_error("codex_login"))
}

#[tauri::command]
pub(crate) async fn codex_login_cancel(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "codex_login_cancel",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    Err(acp_only_error("codex_login_cancel"))
}

#[tauri::command]
pub(crate) async fn skills_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "skills_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    Err(acp_only_error("skills_list"))
}

#[tauri::command]
pub(crate) async fn apps_list(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "apps_list",
            json!({ "workspaceId": workspace_id, "cursor": cursor, "limit": limit }),
        )
        .await;
    }

    let _ = (cursor, limit);
    Err(acp_only_error("apps_list"))
}

#[tauri::command]
pub(crate) async fn respond_to_server_request(
    workspace_id: String,
    request_id: Value,
    result: Value,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        remote_backend::call_remote(
            &*state,
            app,
            "respond_to_server_request",
            json!({ "workspaceId": workspace_id, "requestId": request_id, "result": result }),
        )
        .await?;
        return Ok(());
    }

    let _ = (workspace_id, request_id, result);
    Err(acp_only_error("respond_to_server_request"))
}

fn build_commit_message_prompt(diff: &str) -> String {
    format!(
        "Generate a concise git commit message for the following changes. \
Follow conventional commit format (e.g., feat:, fix:, refactor:, docs:, etc.). \
Keep the summary line under 72 characters. \
Only output the commit message, nothing else.\n\n\
Changes:\n{diff}"
    )
}

/// Gets the diff content for commit message generation
#[tauri::command]
pub(crate) async fn get_commit_message_prompt(
    workspace_id: String,
    state: State<'_, AppState>,
) -> Result<String, String> {
    // Get the diff from git
    let diff = crate::git::get_workspace_diff(&workspace_id, &state).await?;

    if diff.trim().is_empty() {
        return Err("No changes to generate commit message for".to_string());
    }

    let prompt = build_commit_message_prompt(&diff);

    Ok(prompt)
}

#[tauri::command]
pub(crate) async fn remember_approval_rule(
    workspace_id: String,
    command: Vec<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let _ = (workspace_id, command, state);
    Err(acp_only_error("remember_approval_rule"))
}

#[tauri::command]
pub(crate) async fn get_config_model(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "get_config_model",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    Err(acp_only_error("get_config_model"))
}

/// Generates a commit message in the background without showing in the main chat
#[tauri::command]
pub(crate) async fn generate_commit_message(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<String, String> {
    let _ = (workspace_id, state, app);
    Err(acp_only_error("generate_commit_message"))
}

/// Generates run metadata in the background without showing in the main chat
#[tauri::command]
pub(crate) async fn generate_run_metadata(
    workspace_id: String,
    prompt: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "generate_run_metadata",
            json!({ "workspaceId": workspace_id, "prompt": prompt }),
        )
        .await;
    }

    let _ = (workspace_id, prompt);
    Err(acp_only_error("generate_run_metadata"))
}
