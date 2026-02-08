use serde_json::json;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::agent_profiles_core::{
    apply_agent_profile_core, list_agent_profiles_core, AgentProfileApplyMode,
    AgentProfileApplyResponse, AgentProfileListResponse,
};
use crate::shared::files_core::{file_read_core, file_write_core};
use crate::state::AppState;
use self::io::TextFileResponse;
use self::policy::{FileKind, FileScope};

pub(crate) mod io;
pub(crate) mod ops;
pub(crate) mod policy;

async fn file_read_impl(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    state: &AppState,
    app: &AppHandle,
) -> Result<TextFileResponse, String> {
    if remote_backend::is_remote_mode(state).await {
        let response = remote_backend::call_remote(
            state,
            app.clone(),
            "file_read",
            json!({ "scope": scope, "kind": kind, "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    file_read_core(&state.workspaces, scope, kind, workspace_id).await
}

async fn file_write_impl(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
    state: &AppState,
    app: &AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(state).await {
        remote_backend::call_remote(
            state,
            app.clone(),
            "file_write",
            json!({
                "scope": scope,
                "kind": kind,
                "workspaceId": workspace_id,
                "content": content,
            }),
        )
        .await?;
        return Ok(());
    }

    file_write_core(&state.workspaces, scope, kind, workspace_id, content).await
}

async fn agent_profiles_list_impl(
    workspace_id: String,
    state: &AppState,
    app: &AppHandle,
) -> Result<AgentProfileListResponse, String> {
    if remote_backend::is_remote_mode(state).await {
        let response = remote_backend::call_remote(
            state,
            app.clone(),
            "agent_profiles_list",
            json!({ "workspaceId": workspace_id }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let cli_type = {
        let settings = state.app_settings.lock().await;
        settings.cli_type.clone()
    };
    list_agent_profiles_core(&state.workspaces, workspace_id, &cli_type).await
}

async fn agent_profile_apply_impl(
    workspace_id: String,
    profile: String,
    mode: Option<AgentProfileApplyMode>,
    state: &AppState,
    app: &AppHandle,
) -> Result<AgentProfileApplyResponse, String> {
    if remote_backend::is_remote_mode(state).await {
        let response = remote_backend::call_remote(
            state,
            app.clone(),
            "agent_profile_apply",
            json!({
                "workspaceId": workspace_id,
                "profile": profile,
                "mode": mode.unwrap_or(AgentProfileApplyMode::Auto),
            }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let cli_type = {
        let settings = state.app_settings.lock().await;
        settings.cli_type.clone()
    };
    apply_agent_profile_core(
        &state.workspaces,
        workspace_id,
        profile,
        &cli_type,
        mode.unwrap_or(AgentProfileApplyMode::Auto),
    )
    .await
}

#[tauri::command]
pub(crate) async fn file_read(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<TextFileResponse, String> {
    file_read_impl(scope, kind, workspace_id, &*state, &app).await
}

#[tauri::command]
pub(crate) async fn file_write(
    scope: FileScope,
    kind: FileKind,
    workspace_id: Option<String>,
    content: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    file_write_impl(scope, kind, workspace_id, content, &*state, &app).await
}

#[tauri::command]
pub(crate) async fn agent_profiles_list(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AgentProfileListResponse, String> {
    agent_profiles_list_impl(workspace_id, &*state, &app).await
}

#[tauri::command]
pub(crate) async fn agent_profile_apply(
    workspace_id: String,
    profile: String,
    mode: Option<AgentProfileApplyMode>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<AgentProfileApplyResponse, String> {
    agent_profile_apply_impl(workspace_id, profile, mode, &*state, &app).await
}
