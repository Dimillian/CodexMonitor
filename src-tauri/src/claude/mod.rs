use serde_json::{json, Value};
use std::io::ErrorKind;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use tauri::{AppHandle, State};
use tokio::time::timeout;

pub(crate) mod args;
pub(crate) mod config;
pub(crate) mod home;

pub(crate) use crate::backend::app_server::WorkspaceSession;
use crate::backend::app_server::{
    build_claude_command_with_bin, build_claude_path_env, check_claude_installation,
    spawn_claude_session,
};
use crate::shared::process_core::tokio_command;
use crate::event_sink::TauriEventSink;
use crate::remote_backend;
use crate::shared::claude_core;
use crate::state::AppState;
use crate::types::WorkspaceEntry;

pub(crate) async fn spawn_workspace_session(
    entry: WorkspaceEntry,
    default_claude_bin: Option<String>,
    claude_args: Option<String>,
    app_handle: AppHandle,
    claude_home: Option<PathBuf>,
) -> Result<Arc<WorkspaceSession>, String> {
    let client_version = app_handle.package_info().version.to_string();
    let event_sink = TauriEventSink::new(app_handle);
    spawn_claude_session(
        entry,
        default_claude_bin,
        claude_args,
        claude_home,
        client_version,
        event_sink,
    )
    .await
}

#[tauri::command]
pub(crate) async fn claude_doctor(
    claude_bin: Option<String>,
    claude_args: Option<String>,
    state: State<'_, AppState>,
) -> Result<Value, String> {
    let (default_bin, default_args) = {
        let settings = state.app_settings.lock().await;
        (settings.claude_bin.clone(), settings.claude_args.clone())
    };
    let resolved = claude_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = claude_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let path_env = build_claude_path_env(resolved.as_deref());
    let version = check_claude_installation(resolved.clone()).await?;
    let mut command = build_claude_command_with_bin(
        resolved.clone(),
        resolved_args.as_deref(),
        vec!["--version".to_string()],
    )?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let cli_ok = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result.map(|output| output.status.success()).unwrap_or(false),
        Err(_) => false,
    };
    let (node_ok, node_version, node_details) = {
        let mut node_command = tokio_command("node");
        if let Some(ref path_env) = path_env {
            node_command.env("PATH", path_env);
        }
        node_command.arg("--version");
        node_command.stdout(std::process::Stdio::piped());
        node_command.stderr(std::process::Stdio::piped());
        match timeout(Duration::from_secs(5), node_command.output()).await {
            Ok(result) => match result {
                Ok(output) => {
                    if output.status.success() {
                        let version = String::from_utf8_lossy(&output.stdout)
                            .trim()
                            .to_string();
                        (
                            !version.is_empty(),
                            if version.is_empty() { None } else { Some(version) },
                            None,
                        )
                    } else {
                        let stderr = String::from_utf8_lossy(&output.stderr);
                        let stdout = String::from_utf8_lossy(&output.stdout);
                        let detail = if stderr.trim().is_empty() {
                            stdout.trim()
                        } else {
                            stderr.trim()
                        };
                        (
                            false,
                            None,
                            Some(if detail.is_empty() {
                                "Node failed to start.".to_string()
                            } else {
                                detail.to_string()
                            }),
                        )
                    }
                }
                Err(err) => {
                    if err.kind() == ErrorKind::NotFound {
                        (false, None, Some("Node not found on PATH.".to_string()))
                    } else {
                        (false, None, Some(err.to_string()))
                    }
                }
            },
            Err(_) => (false, None, Some("Timed out while checking Node.".to_string())),
        }
    };
    let details = if cli_ok {
        None
    } else {
        Some("Failed to run `claude --version`.".to_string())
    };
    Ok(json!({
        "ok": version.is_some() && cli_ok,
        "claudeBin": resolved,
        "version": version,
        "cliOk": cli_ok,
        "details": details,
        "path": path_env,
        "nodeOk": node_ok,
        "nodeVersion": node_version,
        "nodeDetails": node_details,
    }))
}

#[tauri::command]
pub(crate) async fn claude_start_thread(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_start_thread",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    claude_core::start_thread_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn claude_resume_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_resume_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    claude_core::resume_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn claude_send_user_message(
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
        let mut payload = serde_json::Map::new();
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
            "claude_send_user_message",
            Value::Object(payload),
        )
        .await;
    }

    claude_core::send_user_message_core(
        &state.sessions,
        workspace_id,
        thread_id,
        text,
        model,
        effort,
        access_mode,
        images,
        collaboration_mode,
    )
    .await
}

#[tauri::command]
pub(crate) async fn claude_turn_interrupt(
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
            "claude_turn_interrupt",
            json!({ "workspaceId": workspace_id, "threadId": thread_id, "turnId": turn_id }),
        )
        .await;
    }

    claude_core::turn_interrupt_core(&state.sessions, workspace_id, thread_id, turn_id).await
}

#[tauri::command]
pub(crate) async fn claude_list_threads(
    workspace_id: String,
    cursor: Option<String>,
    limit: Option<u32>,
    sort_key: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_list_threads",
            json!({
                "workspaceId": workspace_id,
                "cursor": cursor,
                "limit": limit,
                "sortKey": sort_key
            }),
        )
        .await;
    }

    claude_core::list_threads_core(&state.sessions, workspace_id, cursor, limit, sort_key).await
}

#[tauri::command]
pub(crate) async fn claude_archive_thread(
    workspace_id: String,
    thread_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_archive_thread",
            json!({ "workspaceId": workspace_id, "threadId": thread_id }),
        )
        .await;
    }

    claude_core::archive_thread_core(&state.sessions, workspace_id, thread_id).await
}

#[tauri::command]
pub(crate) async fn claude_model_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_model_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    claude_core::model_list_core(&state.sessions, workspace_id).await
}

#[tauri::command]
pub(crate) async fn claude_account_read(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_account_read",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    claude_core::account_read_core(&state.sessions, &state.workspaces, workspace_id).await
}

#[tauri::command]
pub(crate) async fn claude_respond_to_server_request(
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
            "claude_respond_to_server_request",
            json!({ "workspaceId": workspace_id, "requestId": request_id, "result": result }),
        )
        .await?;
        return Ok(());
    }

    claude_core::respond_to_server_request_core(&state.sessions, workspace_id, request_id, result)
        .await
}

#[tauri::command]
pub(crate) async fn claude_get_config_model(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Value, String> {
    if remote_backend::is_remote_mode(&*state).await {
        return remote_backend::call_remote(
            &*state,
            app,
            "claude_get_config_model",
            json!({ "workspaceId": workspace_id }),
        )
        .await;
    }

    claude_core::get_config_model_core(&state.workspaces, workspace_id).await
}
