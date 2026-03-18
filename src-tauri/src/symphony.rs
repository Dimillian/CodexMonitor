use tauri::{AppHandle, State};

use crate::backend::events::EventSink;
use crate::event_sink::TauriEventSink;
use crate::remote_backend;
use crate::shared::{symphony_core, workspace_rpc};
use crate::state::AppState;
use crate::symphony_binary::resolve_symphony_binary_path;
use crate::types::{
    CreateWorkspaceTaskInput, MoveWorkspaceTaskInput, UpdateWorkspaceTaskInput,
    WorkspaceSymphonyEvent, WorkspaceSymphonySnapshot, WorkspaceSymphonyStatus, WorkspaceTask,
    WorkspaceTaskTelemetry,
};
use crate::files::io::TextFileResponse;

fn workspace_remote_params<T: serde::Serialize>(request: &T) -> Result<serde_json::Value, String> {
    workspace_rpc::to_params(request)
}

#[tauri::command]
pub(crate) async fn get_workspace_symphony_status(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceSymphonySnapshot, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WorkspaceIdRequest { workspace_id };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "get_workspace_symphony_status",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    symphony_core::get_workspace_symphony_snapshot_core(
        &state.symphony_runtimes,
        &state.storage_path,
        &workspace_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn start_workspace_symphony(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceSymphonyStatus, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WorkspaceIdRequest { workspace_id };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "start_workspace_symphony",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let binary_path = resolve_symphony_binary_path()?;
    symphony_core::start_workspace_symphony_core(
        state.symphony_runtimes.clone(),
        &state.workspaces,
        &state.storage_path,
        &workspace_id,
        TauriEventSink::new(app),
        binary_path,
    )
    .await
}

#[tauri::command]
pub(crate) async fn stop_workspace_symphony(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceSymphonyStatus, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WorkspaceIdRequest { workspace_id };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "stop_workspace_symphony",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let status =
        symphony_core::stop_workspace_symphony_core(&state.symphony_runtimes, &workspace_id)
            .await?;
    TauriEventSink::new(app).emit_workspace_symphony_event(WorkspaceSymphonyEvent {
        workspace_id,
        kind: "runtime_stopped".to_string(),
        status: Some(status.clone()),
        task: None,
        telemetry: None,
        message: None,
    });
    Ok(status)
}

#[tauri::command]
pub(crate) async fn list_workspace_symphony_tasks(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<Vec<WorkspaceTask>, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WorkspaceIdRequest { workspace_id };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "list_workspace_symphony_tasks",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    symphony_core::list_workspace_symphony_tasks_core(&state.storage_path, &workspace_id).await
}

#[tauri::command]
pub(crate) async fn create_workspace_symphony_task(
    workspace_id: String,
    input: CreateWorkspaceTaskInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceTask, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::CreateWorkspaceSymphonyTaskRequest {
            workspace_id,
            input,
        };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "create_workspace_symphony_task",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let task = symphony_core::create_workspace_symphony_task_core(
        &state.storage_path,
        &workspace_id,
        input,
    )
    .await?;
    TauriEventSink::new(app).emit_workspace_symphony_event(WorkspaceSymphonyEvent {
        workspace_id,
        kind: "task_created".to_string(),
        status: None,
        task: Some(task.clone()),
        telemetry: None,
        message: None,
    });
    Ok(task)
}

#[tauri::command]
pub(crate) async fn update_workspace_symphony_task(
    workspace_id: String,
    input: UpdateWorkspaceTaskInput,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceTask, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::UpdateWorkspaceSymphonyTaskRequest {
            workspace_id,
            input,
        };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "update_workspace_symphony_task",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let task = symphony_core::update_workspace_symphony_task_core(
        &state.storage_path,
        &workspace_id,
        input,
    )
    .await?;
    TauriEventSink::new(app).emit_workspace_symphony_event(WorkspaceSymphonyEvent {
        workspace_id,
        kind: "task_updated".to_string(),
        status: None,
        task: Some(task.clone()),
        telemetry: None,
        message: None,
    });
    Ok(task)
}

#[tauri::command]
pub(crate) async fn move_workspace_symphony_task(
    workspace_id: String,
    task_id: String,
    status: crate::types::WorkspaceTaskStatus,
    position: Option<u32>,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceTask, String> {
    let input = MoveWorkspaceTaskInput {
        task_id,
        status,
        position,
    };

    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::MoveWorkspaceSymphonyTaskRequest {
            workspace_id,
            input,
        };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "move_workspace_symphony_task",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    let task =
        symphony_core::move_workspace_symphony_task_core(&state.storage_path, &workspace_id, input)
            .await?;
    TauriEventSink::new(app).emit_workspace_symphony_event(WorkspaceSymphonyEvent {
        workspace_id,
        kind: "task_moved".to_string(),
        status: None,
        task: Some(task.clone()),
        telemetry: None,
        message: None,
    });
    Ok(task)
}

#[tauri::command]
pub(crate) async fn delete_workspace_symphony_task(
    workspace_id: String,
    task_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::TaskIdRequest {
            workspace_id,
            task_id,
        };
        remote_backend::call_remote(
            &*state,
            app,
            "delete_workspace_symphony_task",
            workspace_remote_params(&request)?,
        )
        .await?;
        return Ok(());
    }

    symphony_core::delete_workspace_symphony_task_core(
        &state.storage_path,
        &workspace_id,
        &task_id,
    )
    .await?;
    TauriEventSink::new(app).emit_workspace_symphony_event(WorkspaceSymphonyEvent {
        workspace_id,
        kind: "task_deleted".to_string(),
        status: None,
        task: None,
        telemetry: None,
        message: Some(task_id),
    });
    Ok(())
}

#[tauri::command]
pub(crate) async fn get_workspace_symphony_telemetry(
    workspace_id: String,
    task_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<WorkspaceTaskTelemetry, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::TaskIdRequest {
            workspace_id,
            task_id,
        };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "get_workspace_symphony_telemetry",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    symphony_core::get_workspace_symphony_telemetry_core(
        &state.storage_path,
        &workspace_id,
        &task_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn read_workspace_symphony_workflow_override(
    workspace_id: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<TextFileResponse, String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WorkspaceIdRequest { workspace_id };
        let response = remote_backend::call_remote(
            &*state,
            app,
            "read_workspace_symphony_workflow_override",
            workspace_remote_params(&request)?,
        )
        .await?;
        return serde_json::from_value(response).map_err(|err| err.to_string());
    }

    symphony_core::read_workspace_symphony_workflow_override_core(
        &state.workspaces,
        &state.storage_path,
        &workspace_id,
    )
    .await
}

#[tauri::command]
pub(crate) async fn write_workspace_symphony_workflow_override(
    workspace_id: String,
    content: String,
    state: State<'_, AppState>,
    app: AppHandle,
) -> Result<(), String> {
    if remote_backend::is_remote_mode(&*state).await {
        let request = workspace_rpc::WriteWorkspaceSymphonyWorkflowOverrideRequest {
            workspace_id,
            content,
        };
        remote_backend::call_remote(
            &*state,
            app,
            "write_workspace_symphony_workflow_override",
            workspace_remote_params(&request)?,
        )
        .await?;
        return Ok(());
    }

    symphony_core::write_workspace_symphony_workflow_override_core(
        &state.storage_path,
        &workspace_id,
        &content,
    )
    .await
}
