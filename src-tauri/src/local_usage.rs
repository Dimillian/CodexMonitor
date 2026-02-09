use serde_json::json;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::local_usage_core;
use crate::state::AppState;
use crate::types::LocalUsageSnapshot;

#[tauri::command]
pub(crate) async fn local_usage_snapshot(
    days: Option<u32>,
    workspace_path: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<LocalUsageSnapshot, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "local_usage_snapshot",
            json!({ "days": days, "workspacePath": workspace_path }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    local_usage_core::local_usage_snapshot_core(&state.workspaces, days, workspace_path).await
}
