use super::*;

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "get_codex_config_path" => {
            let path = match settings_core::get_codex_config_path_core() {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(Ok(Value::String(path)))
        }
        "get_config_model" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.get_config_model(workspace_id).await)
        }
        "start_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.start_thread(workspace_id).await)
        }
        "resume_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.resume_thread(workspace_id, thread_id).await)
        }
        "fork_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.fork_thread(workspace_id, thread_id).await)
        }
        "list_threads" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            let sort_key = parse_optional_string(params, "sortKey");
            Some(
                state
                    .list_threads(workspace_id, cursor, limit, sort_key)
                    .await,
            )
        }
        "list_mcp_server_status" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            Some(
                state
                    .list_mcp_server_status(workspace_id, cursor, limit)
                    .await,
            )
        }
        "archive_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.archive_thread(workspace_id, thread_id).await)
        }
        "compact_thread" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.compact_thread(workspace_id, thread_id).await)
        }
        "set_thread_name" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.set_thread_name(workspace_id, thread_id, name).await)
        }
        "send_user_message" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let text = match parse_string(params, "text") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let model = parse_optional_string(params, "model");
            let effort = parse_optional_string(params, "effort");
            let access_mode = parse_optional_string(params, "accessMode");
            let images = parse_optional_string_array(params, "images");
            let app_mentions = parse_optional_value(params, "appMentions")
                .and_then(|value| value.as_array().cloned());
            let collaboration_mode = parse_optional_value(params, "collaborationMode");
            Some(
                state
                    .send_user_message(
                        workspace_id,
                        thread_id,
                        text,
                        model,
                        effort,
                        access_mode,
                        images,
                        app_mentions,
                        collaboration_mode,
                    )
                    .await,
            )
        }
        "turn_interrupt" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let turn_id = match parse_string(params, "turnId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.turn_interrupt(workspace_id, thread_id, turn_id).await)
        }
        "turn_steer" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let turn_id = match parse_string(params, "turnId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let text = match parse_string(params, "text") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let images = parse_optional_string_array(params, "images");
            let app_mentions = parse_optional_value(params, "appMentions")
                .and_then(|value| value.as_array().cloned());
            Some(
                state
                    .turn_steer(workspace_id, thread_id, turn_id, text, images, app_mentions)
                    .await,
            )
        }
        "start_review" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let thread_id = match parse_string(params, "threadId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let target = match params
                .as_object()
                .and_then(|map| map.get("target"))
                .cloned()
                .ok_or("missing `target`")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let delivery = parse_optional_string(params, "delivery");
            Some(
                state
                    .start_review(workspace_id, thread_id, target, delivery)
                    .await,
            )
        }
        "model_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.model_list(workspace_id).await)
        }
        "collaboration_mode_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.collaboration_mode_list(workspace_id).await)
        }
        "account_rate_limits" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.account_rate_limits(workspace_id).await)
        }
        "account_read" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.account_read(workspace_id).await)
        }
        "codex_login" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.codex_login(workspace_id).await)
        }
        "codex_login_cancel" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.codex_login_cancel(workspace_id).await)
        }
        "skills_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.skills_list(workspace_id).await)
        }
        "apps_list" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let cursor = parse_optional_string(params, "cursor");
            let limit = parse_optional_u32(params, "limit");
            let thread_id = parse_optional_string(params, "threadId");
            Some(
                state
                    .apps_list(workspace_id, cursor, limit, thread_id)
                    .await,
            )
        }
        "respond_to_server_request" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let map = match params.as_object().ok_or("missing requestId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let request_id = match map
                .get("requestId")
                .cloned()
                .filter(|value| value.is_number() || value.is_string())
                .ok_or("missing requestId")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let result = match map.get("result").cloned().ok_or("missing `result`") {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            Some(
                state
                    .respond_to_server_request(workspace_id, request_id, result)
                    .await,
            )
        }
        "remember_approval_rule" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let command = match parse_string_array(params, "command") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.remember_approval_rule(workspace_id, command).await)
        }
        "codex_doctor" => {
            let codex_bin = parse_optional_string(params, "codexBin");
            let codex_args = parse_optional_string(params, "codexArgs");
            Some(state.codex_doctor(codex_bin, codex_args).await)
        }
        "generate_run_metadata" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prompt = match parse_string(params, "prompt") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.generate_run_metadata(workspace_id, prompt).await)
        }
        _ => None,
    }
}
