use super::*;

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "prompts_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prompts = match state.prompts_list(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(prompts).map_err(|err| err.to_string()))
        }
        "prompts_workspace_dir" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let dir = match state.prompts_workspace_dir(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(Ok(Value::String(dir)))
        }
        "prompts_global_dir" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let dir = match state.prompts_global_dir(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(Ok(Value::String(dir)))
        }
        "prompts_create" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let scope = match parse_string(params, "scope") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let description = parse_optional_string(params, "description");
            let argument_hint = parse_optional_string(params, "argumentHint");
            let content = match parse_string(params, "content") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prompt = match state
                .prompts_create(
                    workspace_id,
                    scope,
                    name,
                    description,
                    argument_hint,
                    content,
                )
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(prompt).map_err(|err| err.to_string()))
        }
        "prompts_update" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let description = parse_optional_string(params, "description");
            let argument_hint = parse_optional_string(params, "argumentHint");
            let content = match parse_string(params, "content") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prompt = match state
                .prompts_update(
                    workspace_id,
                    path,
                    name,
                    description,
                    argument_hint,
                    content,
                )
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(prompt).map_err(|err| err.to_string()))
        }
        "prompts_delete" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .prompts_delete(workspace_id, path)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "prompts_move" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let path = match parse_string(params, "path") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let scope = match parse_string(params, "scope") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prompt = match state.prompts_move(workspace_id, path, scope).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(prompt).map_err(|err| err.to_string()))
        }
        _ => None,
    }
}
