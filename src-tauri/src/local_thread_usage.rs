use serde_json::json;
use tauri::{AppHandle, State};

use crate::remote_backend;
use crate::shared::thread_usage_core;
use crate::state::AppState;
use crate::types::LocalThreadUsageSnapshot;

#[tauri::command]
pub(crate) async fn local_thread_usage_snapshot(
    thread_ids: Vec<String>,
    workspace_path: Option<String>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<LocalThreadUsageSnapshot, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let response = remote_backend::call_remote(
            &*state,
            app,
            "local_thread_usage_snapshot",
            json!({ "threadIds": thread_ids, "workspacePath": workspace_path }),
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    thread_usage_core::local_thread_usage_snapshot_core(
        &state.workspaces,
        thread_ids,
        workspace_path,
    )
    .await
}
