use super::*;

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

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
    client_version: &str,
) -> Option<Result<Value, String>> {
    match method {
        "list_workspaces" => {
            let workspaces = state.list_workspaces().await;
            Some(serde_json::to_value(workspaces).map_err(|err| err.to_string()))
        }
        "is_workspace_path_dir" => {
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let is_dir = state.is_workspace_path_dir(path).await;
            Some(serde_json::to_value(is_dir).map_err(|err| err.to_string()))
        }
        "add_workspace" => {
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let codex_bin = parse_optional_string(params, "codex_bin");
            let workspace = match state
                .add_workspace(path, codex_bin, client_version.to_string())
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(workspace).map_err(|err| err.to_string()))
        }
        "add_worktree" => {
            let parent_id = match parse_string(params, "parentId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let branch = match parse_string(params, "branch") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = parse_optional_string(params, "name");
            let copy_agents_md = parse_optional_bool(params, "copyAgentsMd").unwrap_or(true);
            let workspace = match state
                .add_worktree(
                    parent_id,
                    branch,
                    name,
                    copy_agents_md,
                    client_version.to_string(),
                )
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(workspace).map_err(|err| err.to_string()))
        }
        "worktree_setup_status" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let status = match state.worktree_setup_status(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(status).map_err(|err| err.to_string()))
        }
        "worktree_setup_mark_ran" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .worktree_setup_mark_ran(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "connect_workspace" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .connect_workspace(id, client_version.to_string())
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "remove_workspace" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .remove_workspace(id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "remove_worktree" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .remove_worktree(id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "rename_worktree" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let branch = match parse_string(params, "branch") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let workspace = match state
                .rename_worktree(id, branch, client_version.to_string())
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(workspace).map_err(|err| err.to_string()))
        }
        "rename_worktree_upstream" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let old_branch = match parse_string(params, "oldBranch") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let new_branch = match parse_string(params, "newBranch") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .rename_worktree_upstream(id, old_branch, new_branch)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "update_workspace_settings" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let settings_value = match params {
                Value::Object(map) => map.get("settings").cloned().unwrap_or(Value::Null),
                _ => Value::Null,
            };
            let settings: WorkspaceSettings = match serde_json::from_value(settings_value) {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let workspace = match state
                .update_workspace_settings(id, settings, client_version.to_string())
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(workspace).map_err(|err| err.to_string()))
        }
        "update_workspace_codex_bin" => {
            let id = match parse_string(params, "id") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let codex_bin = parse_optional_string(params, "codex_bin");
            let workspace = match state.update_workspace_codex_bin(id, codex_bin).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(workspace).map_err(|err| err.to_string()))
        }
        "list_workspace_files" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let files = match state.list_workspace_files(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(files).map_err(|err| err.to_string()))
        }
        "read_workspace_file" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let response = match state.read_workspace_file(workspace_id, path).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(response).map_err(|err| err.to_string()))
        }
        "file_read" => {
            let request = match parse_file_read_request(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let response = match state
                .file_read(request.scope, request.kind, request.workspace_id)
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(response).map_err(|err| err.to_string()))
        }
        "file_write" => {
            let request = match parse_file_write_request(params) {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            if let Err(err) = state
                .file_write(
                    request.scope,
                    request.kind,
                    request.workspace_id,
                    request.content,
                )
                .await
            {
                return Some(Err(err));
            }
            Some(serde_json::to_value(json!({ "ok": true })).map_err(|err| err.to_string()))
        }
        "get_app_settings" => {
            let settings = state.get_app_settings().await;
            Some(serde_json::to_value(settings).map_err(|err| err.to_string()))
        }
        "update_app_settings" => {
            let settings_value = match params {
                Value::Object(map) => map.get("settings").cloned().unwrap_or(Value::Null),
                _ => Value::Null,
            };
            let settings: AppSettings = match serde_json::from_value(settings_value) {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let updated = match state.update_app_settings(settings).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(updated).map_err(|err| err.to_string()))
        }
        "add_clone" => {
            let source_workspace_id = match parse_string(params, "sourceWorkspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let copies_folder = match parse_string(params, "copiesFolder") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let copy_name = match parse_string(params, "copyName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let workspace = match state
                .add_clone(
                    source_workspace_id,
                    copies_folder,
                    copy_name,
                    client_version.to_string(),
                )
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(workspace).map_err(|err| err.to_string()))
        }
        "apply_worktree_changes" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .apply_worktree_changes(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "open_workspace_in" => {
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let app = parse_optional_string(params, "app");
            let command = parse_optional_string(params, "command");
            let args = parse_optional_string_array(params, "args").unwrap_or_default();
            Some(
                state
                    .open_workspace_in(path, app, args, command)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "get_open_app_icon" => {
            let app_name = match parse_string(params, "appName") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let icon = match state.get_open_app_icon(app_name).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(icon).map_err(|err| err.to_string()))
        }
        "local_usage_snapshot" => {
            let days = parse_optional_u32(params, "days");
            let workspace_path = parse_optional_string(params, "workspacePath");
            let snapshot = match state.local_usage_snapshot(days, workspace_path).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(snapshot).map_err(|err| err.to_string()))
        }
        _ => None,
    }
}
