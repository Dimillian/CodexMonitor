use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::io::ErrorKind;
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::{mpsc, Mutex};
use tokio::time::timeout;

use crate::backend::app_server::{
    build_codex_command_with_bin, build_codex_path_env, check_codex_installation, WorkspaceSession,
};
use crate::shared::process_core::tokio_command;
use crate::types::AppSettings;

const DEFAULT_COMMIT_MESSAGE_PROMPT: &str =
    "Generate a concise git commit message for the following changes. \
Follow conventional commit format (e.g., feat:, fix:, refactor:, docs:, etc.). \
Keep the summary line under 72 characters. \
Only output the commit message, nothing else.\n\n\
Changes:\n{diff}";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct GeneratedAgentConfiguration {
    pub description: String,
    pub developer_instructions: String,
}

pub(crate) fn build_commit_message_prompt(diff: &str, template: &str) -> String {
    let base = if template.trim().is_empty() {
        DEFAULT_COMMIT_MESSAGE_PROMPT
    } else {
        template
    };
    if base.contains("{diff}") {
        base.replace("{diff}", diff)
    } else {
        format!("{base}\n\nChanges:\n{diff}")
    }
}

pub(crate) fn build_commit_message_prompt_for_diff(
    diff: &str,
    template: &str,
) -> Result<String, String> {
    if diff.trim().is_empty() {
        return Err("No changes to generate commit message for".to_string());
    }
    Ok(build_commit_message_prompt(diff, template))
}

pub(crate) fn build_run_metadata_prompt(cleaned_prompt: &str) -> String {
    format!(
        "You create concise run metadata for a coding task.\n\
Return ONLY a JSON object with keys:\n\
- title: short, clear, 3-7 words, Title Case\n\
- worktreeName: lower-case, kebab-case slug prefixed with one of: \
feat/, fix/, chore/, test/, docs/, refactor/, perf/, build/, ci/, style/.\n\n\
Choose fix/ when the task is a bug fix, error, regression, crash, or cleanup. \
Use the closest match for chores/tests/docs/refactors/perf/build/ci/style. \
Otherwise use feat/.\n\n\
Examples:\n\
{{\"title\":\"Fix Login Redirect Loop\",\"worktreeName\":\"fix/login-redirect-loop\"}}\n\
{{\"title\":\"Add Workspace Home View\",\"worktreeName\":\"feat/workspace-home\"}}\n\
{{\"title\":\"Update Lint Config\",\"worktreeName\":\"chore/update-lint-config\"}}\n\
{{\"title\":\"Add Coverage Tests\",\"worktreeName\":\"test/add-coverage-tests\"}}\n\n\
Task:\n{cleaned_prompt}"
    )
}

pub(crate) fn build_agent_description_prompt(description: &str) -> String {
    format!(
        "You generate custom coding-agent configuration text.\n\
Return ONLY a JSON object with exactly these keys:\n\
- description: short role summary, one sentence, 4-12 words.\n\
- developerInstructions: multiline instructions for the agent.\n\n\
Requirements:\n\
- Preserve the user's intent, even when the input is short.\n\
- Keep description concise and practical.\n\
- developerInstructions should be actionable and specific.\n\
- developerInstructions must be 3-8 lines.\n\
- Do not include markdown fences.\n\n\
Example:\n\
{{\"description\":\"Investigates flaky tests and stabilizes suites\",\"developerInstructions\":\"Investigate flaky test failures and identify root causes.\\nReproduce failures deterministically before proposing changes.\\nPrefer minimal, safe fixes and add targeted regression coverage.\"}}\n\n\
User prompt:\n\
{description}"
    )
}

pub(crate) fn parse_agent_description_value(
    raw: &str,
) -> Result<GeneratedAgentConfiguration, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("No agent configuration was generated".to_string());
    }

    let cleaned = trimmed
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty() && !line.starts_with("```"))
        .collect::<Vec<_>>()
        .join("\n");
    if cleaned.trim().is_empty() {
        return Err("No agent configuration was generated".to_string());
    }

    if let Some(json_value) = extract_json_value(cleaned.as_str()) {
        let description = json_value
            .get("description")
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        let developer_instructions = json_value
            .get("developerInstructions")
            .or_else(|| json_value.get("developer_instructions"))
            .and_then(Value::as_str)
            .map(str::trim)
            .filter(|value| !value.is_empty())
            .map(str::to_string);
        if description.is_some() || developer_instructions.is_some() {
            return Ok(GeneratedAgentConfiguration {
                description: description.unwrap_or_default(),
                developer_instructions: developer_instructions.unwrap_or_default(),
            });
        }
    }

    let cleaned_lines = cleaned
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .collect::<Vec<_>>();

    let mut description: Option<String> = None;
    let mut developer_instructions: Option<String> = None;
    for (index, line) in cleaned_lines.iter().enumerate() {
        if let Some((key, value)) = line.split_once(':') {
            let key = key.trim().to_ascii_lowercase();
            let value = value.trim();
            match key.as_str() {
                "description" if description.is_none() && !value.is_empty() => {
                    description = Some(value.to_string())
                }
                "developer instructions" | "developer_instructions" | "instructions"
                    if developer_instructions.is_none() =>
                {
                    let trailing = cleaned_lines
                        .iter()
                        .skip(index + 1)
                        .copied()
                        .collect::<Vec<_>>()
                        .join("\n");
                    let trailing = trailing.trim();
                    let combined = if value.is_empty() {
                        trailing.to_string()
                    } else if trailing.is_empty() {
                        value.to_string()
                    } else {
                        format!("{value}\n{trailing}")
                    };
                    if !combined.trim().is_empty() {
                        developer_instructions = Some(combined);
                    }
                }
                _ => {}
            }
        }
    }

    if description.is_some() || developer_instructions.is_some() {
        return Ok(GeneratedAgentConfiguration {
            description: description.unwrap_or_default(),
            developer_instructions: developer_instructions.unwrap_or_default(),
        });
    }

    if let Some((first, rest)) = cleaned.split_once('\n') {
        let description = first.trim();
        let developer_instructions = rest.trim();
        if !description.is_empty() || !developer_instructions.is_empty() {
            return Ok(GeneratedAgentConfiguration {
                description: description.to_string(),
                developer_instructions: developer_instructions.to_string(),
            });
        }
    }

    if !cleaned.is_empty() {
        return Ok(GeneratedAgentConfiguration {
            description: cleaned,
            developer_instructions: String::new(),
        });
    }

    Err("No valid agent configuration was generated".to_string())
}

pub(crate) fn parse_run_metadata_value(raw: &str) -> Result<Value, String> {
    let trimmed = raw.trim();
    if trimmed.is_empty() {
        return Err("No metadata was generated".to_string());
    }
    let json_value =
        extract_json_value(trimmed).ok_or_else(|| "Failed to parse metadata JSON".to_string())?;
    let title = json_value
        .get("title")
        .and_then(|v| v.as_str())
        .map(|v| v.trim().to_string())
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Missing title in metadata".to_string())?;
    let worktree_name = json_value
        .get("worktreeName")
        .or_else(|| json_value.get("worktree_name"))
        .and_then(|v| v.as_str())
        .map(sanitize_run_worktree_name)
        .filter(|v| !v.is_empty())
        .ok_or_else(|| "Missing worktree name in metadata".to_string())?;

    Ok(json!({
        "title": title,
        "worktreeName": worktree_name
    }))
}

pub(crate) fn extract_json_value(raw: &str) -> Option<Value> {
    let start = raw.find('{')?;
    let end = raw.rfind('}')?;
    if end <= start {
        return None;
    }
    serde_json::from_str::<Value>(&raw[start..=end]).ok()
}

pub(crate) fn sanitize_run_worktree_name(value: &str) -> String {
    let trimmed = value.trim().to_lowercase();
    let mut cleaned = String::new();
    let mut last_dash = false;
    for ch in trimmed.chars() {
        let next = if ch.is_ascii_alphanumeric() || ch == '/' {
            last_dash = false;
            Some(ch)
        } else if ch == '-' || ch.is_whitespace() || ch == '_' {
            if last_dash {
                None
            } else {
                last_dash = true;
                Some('-')
            }
        } else {
            None
        };
        if let Some(ch) = next {
            cleaned.push(ch);
        }
    }
    while cleaned.ends_with('-') || cleaned.ends_with('/') {
        cleaned.pop();
    }
    let allowed_prefixes = [
        "feat/",
        "fix/",
        "chore/",
        "test/",
        "docs/",
        "refactor/",
        "perf/",
        "build/",
        "ci/",
        "style/",
    ];
    if allowed_prefixes
        .iter()
        .any(|prefix| cleaned.starts_with(prefix))
    {
        return cleaned;
    }
    for prefix in &allowed_prefixes {
        let dash_prefix = prefix.replace('/', "-");
        if cleaned.starts_with(&dash_prefix) {
            return cleaned.replacen(&dash_prefix, prefix, 1);
        }
    }
    format!("feat/{}", cleaned.trim_start_matches('/'))
}

pub(crate) async fn codex_doctor_core(
    app_settings: &Mutex<AppSettings>,
    codex_bin: Option<String>,
    codex_args: Option<String>,
) -> Result<Value, String> {
    let (default_bin, default_args) = {
        let settings = app_settings.lock().await;
        (settings.codex_bin.clone(), settings.codex_args.clone())
    };
    let resolved = codex_bin
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_bin);
    let resolved_args = codex_args
        .clone()
        .filter(|value| !value.trim().is_empty())
        .or(default_args);
    let path_env = build_codex_path_env(resolved.as_deref());
    let version = check_codex_installation(resolved.clone()).await?;
    let mut command = build_codex_command_with_bin(
        resolved.clone(),
        resolved_args.as_deref(),
        vec!["app-server".to_string(), "--help".to_string()],
    )?;
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let app_server_ok = match timeout(Duration::from_secs(5), command.output()).await {
        Ok(result) => result
            .map(|output| output.status.success())
            .unwrap_or(false),
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
                        let version = String::from_utf8_lossy(&output.stdout).trim().to_string();
                        (
                            !version.is_empty(),
                            if version.is_empty() {
                                None
                            } else {
                                Some(version)
                            },
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
            Err(_) => (
                false,
                None,
                Some("Timed out while checking Node.".to_string()),
            ),
        }
    };
    let details = if app_server_ok {
        None
    } else {
        Some("Failed to run `codex app-server --help`.".to_string())
    };
    Ok(json!({
        "ok": version.is_some() && app_server_ok,
        "codexBin": resolved,
        "version": version,
        "appServerOk": app_server_ok,
        "details": details,
        "path": path_env,
        "nodeOk": node_ok,
        "nodeVersion": node_version,
        "nodeDetails": node_details,
    }))
}

pub(crate) async fn run_background_prompt_core<F>(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    prompt: String,
    model: Option<&str>,
    on_hide_thread: F,
    timeout_error: &str,
    turn_error_fallback: &str,
) -> Result<String, String>
where
    F: Fn(&str, &str),
{
    let session = {
        let sessions = sessions.lock().await;
        sessions
            .get(&workspace_id)
            .ok_or("workspace not connected")?
            .clone()
    };

    let thread_params = json!({
        "cwd": session.entry.path,
        "approvalPolicy": "never"
    });
    let thread_result = session.send_request("thread/start", thread_params).await?;

    if let Some(error) = thread_result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or("Unknown error starting thread");
        return Err(error_msg.to_string());
    }

    let thread_id = thread_result
        .get("result")
        .and_then(|r| r.get("threadId"))
        .or_else(|| {
            thread_result
                .get("result")
                .and_then(|r| r.get("thread"))
                .and_then(|t| t.get("id"))
        })
        .or_else(|| thread_result.get("threadId"))
        .or_else(|| thread_result.get("thread").and_then(|t| t.get("id")))
        .and_then(|t| t.as_str())
        .ok_or_else(|| {
            format!(
                "Failed to get threadId from thread/start response: {:?}",
                thread_result
            )
        })?
        .to_string();

    on_hide_thread(&workspace_id, &thread_id);

    let (tx, mut rx) = mpsc::unbounded_channel::<Value>();
    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.insert(thread_id.clone(), tx);
    }

    let mut turn_params = json!({
        "threadId": thread_id,
        "input": [{ "type": "text", "text": prompt }],
        "cwd": session.entry.path,
        "approvalPolicy": "never",
        "sandboxPolicy": { "type": "readOnly" },
    });
    if let Some(model_id) = model {
        turn_params["model"] = json!(model_id);
    }
    let turn_result = session.send_request("turn/start", turn_params).await;
    let turn_result = match turn_result {
        Ok(result) => result,
        Err(error) => {
            {
                let mut callbacks = session.background_thread_callbacks.lock().await;
                callbacks.remove(&thread_id);
            }
            let archive_params = json!({ "threadId": thread_id.as_str() });
            let _ = session.send_request("thread/archive", archive_params).await;
            return Err(error);
        }
    };

    if let Some(error) = turn_result.get("error") {
        let error_msg = error
            .get("message")
            .and_then(|m| m.as_str())
            .unwrap_or(turn_error_fallback);
        {
            let mut callbacks = session.background_thread_callbacks.lock().await;
            callbacks.remove(&thread_id);
        }
        let archive_params = json!({ "threadId": thread_id.as_str() });
        let _ = session.send_request("thread/archive", archive_params).await;
        return Err(error_msg.to_string());
    }

    let mut response_text = String::new();
    let collect_result = timeout(Duration::from_secs(60), async {
        loop {
            let Some(event) = rx.recv().await else {
                return Err("Background response stream closed before completion".to_string());
            };
            let method = event.get("method").and_then(|m| m.as_str()).unwrap_or("");
            match method {
                "item/agentMessage/delta" => {
                    if let Some(params) = event.get("params") {
                        if let Some(delta) = params.get("delta").and_then(|d| d.as_str()) {
                            response_text.push_str(delta);
                        }
                    }
                }
                "turn/completed" => break,
                "turn/error" => {
                    let error_msg = event
                        .get("params")
                        .and_then(|p| p.get("error"))
                        .and_then(|e| e.as_str())
                        .unwrap_or(turn_error_fallback);
                    return Err(error_msg.to_string());
                }
                _ => {}
            }
        }
        Ok(())
    })
    .await;

    {
        let mut callbacks = session.background_thread_callbacks.lock().await;
        callbacks.remove(&thread_id);
    }

    let archive_params = json!({ "threadId": thread_id });
    let _ = session.send_request("thread/archive", archive_params).await;

    match collect_result {
        Ok(Ok(())) => {}
        Ok(Err(error)) => return Err(error),
        Err(_) => return Err(timeout_error.to_string()),
    }

    let trimmed = response_text.trim().to_string();
    if trimmed.is_empty() {
        return Err("No response was generated".to_string());
    }

    Ok(trimmed)
}

pub(crate) async fn generate_commit_message_core<F>(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    diff: &str,
    template: &str,
    model: Option<&str>,
    on_hide_thread: F,
) -> Result<String, String>
where
    F: Fn(&str, &str),
{
    let prompt = build_commit_message_prompt_for_diff(diff, template)?;
    run_background_prompt_core(
        sessions,
        workspace_id,
        prompt,
        model,
        on_hide_thread,
        "Timeout waiting for commit message generation",
        "Unknown error during commit message generation",
    )
    .await
}

pub(crate) async fn generate_run_metadata_core<F>(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    prompt: &str,
    on_hide_thread: F,
) -> Result<Value, String>
where
    F: Fn(&str, &str),
{
    let cleaned_prompt = prompt.trim();
    if cleaned_prompt.is_empty() {
        return Err("Prompt is required.".to_string());
    }

    let metadata_prompt = build_run_metadata_prompt(cleaned_prompt);
    let response = run_background_prompt_core(
        sessions,
        workspace_id,
        metadata_prompt,
        None,
        on_hide_thread,
        "Timeout waiting for metadata generation",
        "Unknown error during metadata generation",
    )
    .await?;

    parse_run_metadata_value(&response)
}

pub(crate) async fn generate_agent_description_core<F>(
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    workspace_id: String,
    description: &str,
    on_hide_thread: F,
) -> Result<GeneratedAgentConfiguration, String>
where
    F: Fn(&str, &str),
{
    let cleaned_description = description.trim();
    if cleaned_description.is_empty() {
        return Err("Description is required.".to_string());
    }

    let prompt = build_agent_description_prompt(cleaned_description);
    let response = run_background_prompt_core(
        sessions,
        workspace_id,
        prompt,
        None,
        on_hide_thread,
        "Timeout waiting for agent configuration generation",
        "Unknown error during agent configuration generation",
    )
    .await?;

    parse_agent_description_value(&response)
}

#[cfg(test)]
mod tests {
    use super::{
        build_commit_message_prompt_for_diff, parse_agent_description_value,
        parse_run_metadata_value,
    };

    #[test]
    fn build_commit_message_prompt_for_diff_requires_changes() {
        let result = build_commit_message_prompt_for_diff("   ", "{diff}");
        assert_eq!(
            result.expect_err("should fail"),
            "No changes to generate commit message for"
        );
    }

    #[test]
    fn parse_run_metadata_value_normalizes_worktree_name_alias() {
        let raw =
            r#"{"title":"Fix Login Redirect Loop","worktree_name":"fix-login-redirect-loop"}"#;
        let parsed = parse_run_metadata_value(raw).expect("parse metadata");
        assert_eq!(parsed["title"], "Fix Login Redirect Loop");
        assert_eq!(parsed["worktreeName"], "fix/login-redirect-loop");
    }

    #[test]
    fn parse_run_metadata_value_requires_title() {
        let raw = r#"{"worktreeName":"feat/example"}"#;
        let result = parse_run_metadata_value(raw);
        assert_eq!(
            result.expect_err("should fail"),
            "Missing title in metadata"
        );
    }

    #[test]
    fn parse_agent_description_value_parses_json_shape() {
        let raw = r#"{"description":"Researches large codebases","developerInstructions":"Map relevant modules first.\nSummarize findings before proposing edits.\nCall out risks and unknowns."}"#;
        let parsed = parse_agent_description_value(raw).expect("parse description");
        assert_eq!(parsed.description, "Researches large codebases");
        assert!(parsed
            .developer_instructions
            .contains("Map relevant modules first."));
    }

    #[test]
    fn parse_agent_description_value_handles_labeled_fallback() {
        let raw = "Description: Stabilizes flaky test suites\nDeveloper Instructions: Reproduce failures first.\nAdd targeted regression tests.";
        let parsed = parse_agent_description_value(raw).expect("parse description");
        assert_eq!(parsed.description, "Stabilizes flaky test suites");
        assert_eq!(
            parsed.developer_instructions,
            "Reproduce failures first.\nAdd targeted regression tests."
        );
    }

    #[test]
    fn parse_agent_description_value_allows_partial_output() {
        let raw = r#"{"description":"Refactors large React components"}"#;
        let parsed = parse_agent_description_value(raw).expect("parse partial");
        assert_eq!(parsed.description, "Refactors large React components");
        assert_eq!(parsed.developer_instructions, "");
    }

    #[test]
    fn parse_agent_description_value_accepts_single_line_plain_text() {
        let raw = "Refactors large React components for performance";
        let parsed = parse_agent_description_value(raw).expect("parse single-line fallback");
        assert_eq!(
            parsed.description,
            "Refactors large React components for performance"
        );
        assert_eq!(parsed.developer_instructions, "");
    }
}
