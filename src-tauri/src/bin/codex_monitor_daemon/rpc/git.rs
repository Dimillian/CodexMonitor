use super::*;

pub(super) async fn try_handle(
    state: &DaemonState,
    method: &str,
    params: &Value,
) -> Option<Result<Value, String>> {
    match method {
        "get_git_status" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.get_git_status(workspace_id).await)
        }
        "list_git_roots" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let depth = parse_optional_u32(params, "depth").map(|value| value as usize);
            let roots = match state.list_git_roots(workspace_id, depth).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(roots).map_err(|err| err.to_string()))
        }
        "get_git_diffs" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let diffs = match state.get_git_diffs(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(diffs).map_err(|err| err.to_string()))
        }
        "get_git_log" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let limit = parse_optional_u32(params, "limit").map(|value| value as usize);
            let log = match state.get_git_log(workspace_id, limit).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(log).map_err(|err| err.to_string()))
        }
        "get_git_commit_diff" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let sha = match parse_string(params, "sha") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let diff = match state.get_git_commit_diff(workspace_id, sha).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(diff).map_err(|err| err.to_string()))
        }
        "get_git_remote" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let remote = match state.get_git_remote(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(remote).map_err(|err| err.to_string()))
        }
        "stage_git_file" => {
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
                    .stage_git_file(workspace_id, path)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "stage_git_all" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .stage_git_all(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "unstage_git_file" => {
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
                    .unstage_git_file(workspace_id, path)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "revert_git_file" => {
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
                    .revert_git_file(workspace_id, path)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "revert_git_all" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .revert_git_all(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "commit_git" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let message = match parse_string(params, "message") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .commit_git(workspace_id, message)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "push_git" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .push_git(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "pull_git" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .pull_git(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "fetch_git" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .fetch_git(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "sync_git" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .sync_git(workspace_id)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "get_github_issues" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let issues = match state.get_github_issues(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(issues).map_err(|err| err.to_string()))
        }
        "get_github_pull_requests" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let prs = match state.get_github_pull_requests(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(prs).map_err(|err| err.to_string()))
        }
        "get_github_pull_request_diff" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let pr_number = match super::super::parse_optional_u64(params, "prNumber")
                .ok_or("missing or invalid `prNumber`")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let diff = match state
                .get_github_pull_request_diff(workspace_id, pr_number)
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(diff).map_err(|err| err.to_string()))
        }
        "get_github_pull_request_comments" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let pr_number = match super::super::parse_optional_u64(params, "prNumber")
                .ok_or("missing or invalid `prNumber`")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            let comments = match state
                .get_github_pull_request_comments(workspace_id, pr_number)
                .await
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(serde_json::to_value(comments).map_err(|err| err.to_string()))
        }
        "checkout_github_pull_request" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let pr_number = match super::super::parse_optional_u64(params, "prNumber")
                .ok_or("missing or invalid `prNumber`")
            {
                Ok(value) => value,
                Err(err) => return Some(Err(err.to_string())),
            };
            Some(
                state
                    .checkout_github_pull_request(workspace_id, pr_number)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "list_git_branches" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(state.list_git_branches(workspace_id).await)
        }
        "checkout_git_branch" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .checkout_git_branch(workspace_id, name)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "create_git_branch" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let name = match parse_string(params, "name") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(
                state
                    .create_git_branch(workspace_id, name)
                    .await
                    .map(|_| json!({ "ok": true })),
            )
        }
        "generate_commit_message" => {
            let workspace_id = match parse_string(params, "workspaceId") {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            let message = match state.generate_commit_message(workspace_id).await {
                Ok(value) => value,
                Err(err) => return Some(Err(err)),
            };
            Some(Ok(Value::String(message)))
        }
        _ => None,
    }
}
