use super::*;
use crate::shared::workspace_rpc;
use serde::de::DeserializeOwned;
use serde::Serialize;
use std::future::Future;

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileReadRequest {
    scope: file_policy::FileScope,
    kind: file_policy::FileKind,
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileWriteRequest {
    scope: file_policy::FileScope,
    kind: file_policy::FileKind,
    workspace_id: Option<String>,
    content: String,
}

fn parse_file_read_request(params: &Value) -> Result<FileReadRequest, String> {
    serde_json::from_value(params.clone()).map_err(|err| err.to_string())
}

fn parse_file_write_request(params: &Value) -> Result<FileWriteRequest, String> {
    serde_json::from_value(params.clone()).map_err(|err| err.to_string())
}

fn parse_workspace_request<T: DeserializeOwned>(params: &Value) -> Result<T, String> {
    workspace_rpc::from_params(params)
}

fn serialize_value<T: Serialize>(value: T) -> Result<Value, String> {
    serde_json::to_value(value).map_err(|err| err.to_string())
}

async fn serialize_result<T, Fut>(future: Fut) -> Result<Value, String>
where
    T: Serialize,
    Fut: Future<Output = Result<T, String>>,
{
    future.await.and_then(serialize_value)
}

async fn serialize_ok<Fut>(future: Fut) -> Result<Value, String>
where
    Fut: Future<Output = Result<(), String>>,
{
    future.await.map(|_| json!({ "ok": true }))
}

macro_rules! parse_request_or_err {
    ($params:expr, $ty:ty) => {
        match parse_workspace_request::<$ty>($params) {
            Ok(value) => value,
            Err(err) => return Some(Err(err)),
        }
    };
}

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
    client_version: &str,
) -> Option<Result<Value, String>> {
    match method {
        "list_workspaces" => Some(serialize_value(state.list_workspaces().await)),
        "is_workspace_path_dir" => {
            let request = parse_request_or_err!(params, workspace_rpc::IsWorkspacePathDirRequest);
            Some(serialize_value(
                state.is_workspace_path_dir(request.path).await,
            ))
        }
        "add_workspace" => {
            let request = parse_request_or_err!(params, workspace_rpc::AddWorkspaceRequest);
            Some(
                serialize_result(state.add_workspace(request.path, client_version.to_string()))
                    .await,
            )
        }
        "add_workspace_from_git_url" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::AddWorkspaceFromGitUrlRequest);
            Some(
                serialize_result(state.add_workspace_from_git_url(
                    request.url,
                    request.destination_path,
                    request.target_folder_name,
                    client_version.to_string(),
                ))
                .await,
            )
        }
        "add_worktree" => {
            let request = parse_request_or_err!(params, workspace_rpc::AddWorktreeRequest);
            Some(
                serialize_result(state.add_worktree(
                    request.parent_id,
                    request.branch,
                    request.name,
                    request.copy_agents_md,
                    client_version.to_string(),
                ))
                .await,
            )
        }
        "worktree_setup_status" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(serialize_result(state.worktree_setup_status(request.workspace_id)).await)
        }
        "worktree_setup_mark_ran" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.worktree_setup_mark_ran(request.workspace_id)).await)
        }
        "connect_workspace" => {
            let request = parse_request_or_err!(params, workspace_rpc::IdRequest);
            Some(
                serialize_ok(state.connect_workspace(request.id, client_version.to_string())).await,
            )
        }
        "set_workspace_runtime_codex_args" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::SetWorkspaceRuntimeCodexArgsRequest);
            Some(
                serialize_result(state.set_workspace_runtime_codex_args(
                    request.workspace_id,
                    request.codex_args,
                    client_version.to_string(),
                ))
                .await,
            )
        }
        "remove_workspace" => {
            let request = parse_request_or_err!(params, workspace_rpc::IdRequest);
            Some(serialize_ok(state.remove_workspace(request.id)).await)
        }
        "remove_worktree" => {
            let request = parse_request_or_err!(params, workspace_rpc::IdRequest);
            Some(serialize_ok(state.remove_worktree(request.id)).await)
        }
        "rename_worktree" => {
            let request = parse_request_or_err!(params, workspace_rpc::RenameWorktreeRequest);
            Some(
                serialize_result(state.rename_worktree(
                    request.id,
                    request.branch,
                    client_version.to_string(),
                ))
                .await,
            )
        }
        "rename_worktree_upstream" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::RenameWorktreeUpstreamRequest);
            Some(
                serialize_ok(state.rename_worktree_upstream(
                    request.id,
                    request.old_branch,
                    request.new_branch,
                ))
                .await,
            )
        }
        "update_workspace_settings" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::UpdateWorkspaceSettingsRequest);
            Some(
                serialize_result(state.update_workspace_settings(
                    request.id,
                    request.settings,
                    client_version.to_string(),
                ))
                .await,
            )
        }
        "list_workspace_files" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(serialize_result(state.list_workspace_files(request.workspace_id)).await)
        }
        "read_workspace_file" => {
            let request = parse_request_or_err!(params, workspace_rpc::ReadWorkspaceFileRequest);
            Some(
                serialize_result(state.read_workspace_file(request.workspace_id, request.path))
                    .await,
            )
        }
        "get_workspace_symphony_status" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(
                serialize_result(symphony_core::get_workspace_symphony_snapshot_core(
                    &state.symphony_runtimes,
                    &state.storage_path,
                    &request.workspace_id,
                ))
                .await,
            )
        }
        "start_workspace_symphony" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            let binary_path = match symphony_binary::resolve_symphony_binary_path() {
                Ok(path) => path,
                Err(err) => return Some(Err(err)),
            };
            Some(
                serialize_result(symphony_core::start_workspace_symphony_core(
                    state.symphony_runtimes.clone(),
                    &state.workspaces,
                    &state.storage_path,
                    &request.workspace_id,
                    state.event_sink.clone(),
                    binary_path,
                ))
                .await,
            )
        }
        "stop_workspace_symphony" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(
                match symphony_core::stop_workspace_symphony_core(
                    &state.symphony_runtimes,
                    &request.workspace_id,
                )
                .await
                {
                    Ok(status) => {
                        state
                            .event_sink
                            .emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                                workspace_id: request.workspace_id,
                                kind: "runtime_stopped".to_string(),
                                status: Some(status.clone()),
                                task: None,
                                telemetry: None,
                                message: None,
                            });
                        serialize_value(status)
                    }
                    Err(err) => Err(err),
                },
            )
        }
        "list_workspace_symphony_tasks" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(
                serialize_result(symphony_core::list_workspace_symphony_tasks_core(
                    &state.storage_path,
                    &request.workspace_id,
                ))
                .await,
            )
        }
        "create_workspace_symphony_task" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::CreateWorkspaceSymphonyTaskRequest);
            Some(
                match symphony_core::create_workspace_symphony_task_core(
                    &state.storage_path,
                    &request.workspace_id,
                    request.input,
                )
                .await
                {
                    Ok(task) => {
                        state
                            .event_sink
                            .emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                                workspace_id: request.workspace_id,
                                kind: "task_created".to_string(),
                                status: None,
                                task: Some(task.clone()),
                                telemetry: None,
                                message: None,
                            });
                        serialize_value(task)
                    }
                    Err(err) => Err(err),
                },
            )
        }
        "update_workspace_symphony_task" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::UpdateWorkspaceSymphonyTaskRequest);
            Some(
                match symphony_core::update_workspace_symphony_task_core(
                    &state.storage_path,
                    &request.workspace_id,
                    request.input,
                )
                .await
                {
                    Ok(task) => {
                        state
                            .event_sink
                            .emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                                workspace_id: request.workspace_id,
                                kind: "task_updated".to_string(),
                                status: None,
                                task: Some(task.clone()),
                                telemetry: None,
                                message: None,
                            });
                        serialize_value(task)
                    }
                    Err(err) => Err(err),
                },
            )
        }
        "move_workspace_symphony_task" => {
            let request =
                parse_request_or_err!(params, workspace_rpc::MoveWorkspaceSymphonyTaskRequest);
            Some(
                match symphony_core::move_workspace_symphony_task_core(
                    &state.storage_path,
                    &request.workspace_id,
                    request.input,
                )
                .await
                {
                    Ok(task) => {
                        state
                            .event_sink
                            .emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                                workspace_id: request.workspace_id,
                                kind: "task_moved".to_string(),
                                status: None,
                                task: Some(task.clone()),
                                telemetry: None,
                                message: None,
                            });
                        serialize_value(task)
                    }
                    Err(err) => Err(err),
                },
            )
        }
        "delete_workspace_symphony_task" => {
            let request = parse_request_or_err!(params, workspace_rpc::TaskIdRequest);
            Some(
                match symphony_core::delete_workspace_symphony_task_core(
                    &state.storage_path,
                    &request.workspace_id,
                    &request.task_id,
                )
                .await
                {
                    Ok(()) => {
                        state
                            .event_sink
                            .emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                                workspace_id: request.workspace_id,
                                kind: "task_deleted".to_string(),
                                status: None,
                                task: None,
                                telemetry: None,
                                message: Some(request.task_id),
                            });
                        Ok(json!({ "ok": true }))
                    }
                    Err(err) => Err(err),
                },
            )
        }
        "get_workspace_symphony_telemetry" => {
            let request = parse_request_or_err!(params, workspace_rpc::TaskIdRequest);
            Some(
                serialize_result(symphony_core::get_workspace_symphony_telemetry_core(
                    &state.storage_path,
                    &request.workspace_id,
                    &request.task_id,
                ))
                .await,
            )
        }
        "read_workspace_symphony_workflow_override" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(
                serialize_result(symphony_core::read_workspace_symphony_workflow_override_core(
                    &state.workspaces,
                    &state.storage_path,
                    &request.workspace_id,
                ))
                .await,
            )
        }
        "write_workspace_symphony_workflow_override" => {
            let request = parse_request_or_err!(
                params,
                workspace_rpc::WriteWorkspaceSymphonyWorkflowOverrideRequest
            );
            Some(
                serialize_ok(symphony_core::write_workspace_symphony_workflow_override_core(
                    &state.storage_path,
                    &request.workspace_id,
                    &request.content,
                ))
                .await,
            )
        }
        "add_clone" => {
            let request = parse_request_or_err!(params, workspace_rpc::AddCloneRequest);
            Some(
                serialize_result(state.add_clone(
                    request.source_workspace_id,
                    request.copies_folder,
                    request.copy_name,
                    client_version.to_string(),
                ))
                .await,
            )
        }
        "file_read" => {
            let request = match parse_file_read_request(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                serialize_result(state.file_read(
                    request.scope,
                    request.kind,
                    request.workspace_id,
                ))
                .await,
            )
        }
        "file_write" => {
            let request = match parse_file_write_request(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                serialize_ok(state.file_write(
                    request.scope,
                    request.kind,
                    request.workspace_id,
                    request.content,
                ))
                .await,
            )
        }
        "get_app_settings" => Some(serialize_value(state.get_app_settings().await)),
        "update_app_settings" => {
            let settings_value = match params {
                Value::Object(map) => map.get("settings").cloned().unwrap_or(Value::Null),
                _ => Value::Null,
            };
            let settings: AppSettings = match serde_json::from_value(settings_value) {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            Some(serialize_result(state.update_app_settings(settings)).await)
        }
        "apply_worktree_changes" => {
            let request = parse_request_or_err!(params, workspace_rpc::WorkspaceIdRequest);
            Some(serialize_ok(state.apply_worktree_changes(request.workspace_id)).await)
        }
        "open_workspace_in" => {
            let request = parse_request_or_err!(params, workspace_rpc::OpenWorkspaceInRequest);
            Some(
                serialize_ok(state.open_workspace_in(
                    request.path,
                    request.app,
                    request.args,
                    request.command,
                    request.line,
                    request.column,
                ))
                .await,
            )
        }
        "get_open_app_icon" => {
            let request = parse_request_or_err!(params, workspace_rpc::GetOpenAppIconRequest);
            Some(serialize_result(state.get_open_app_icon(request.app_name)).await)
        }
        "local_usage_snapshot" => {
            let days = parse_optional_u32(params, "days");
            let workspace_path = parse_optional_string(params, "workspacePath");
            Some(serialize_result(state.local_usage_snapshot(days, workspace_path)).await)
        }
        _ => None,
    }
}
