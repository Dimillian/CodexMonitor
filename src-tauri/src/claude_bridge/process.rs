use serde_json::{json, Value};
use std::collections::{HashMap, HashSet};
use std::sync::atomic::AtomicU64;
use std::sync::Arc;

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Command;
use tokio::sync::{mpsc, oneshot, Mutex};

use crate::backend::app_server::{InterceptAction, WorkspaceSession};
use crate::backend::events::{AppServerEvent, EventSink};
use crate::types::WorkspaceEntry;

use super::event_mapper;
use super::types::BridgeState;

/// Check that the `claude` CLI binary is available.
pub(crate) async fn check_claude_installation() -> Result<String, String> {
    let result = Command::new("claude")
        .arg("--version")
        .output()
        .await
        .map_err(|e| format!("Claude CLI not found in PATH: {e}"))?;

    if !result.status.success() {
        return Err("Claude CLI --version returned non-zero exit code".to_string());
    }

    let version = String::from_utf8_lossy(&result.stdout).trim().to_string();
    Ok(version)
}

/// Spawn a Claude CLI session that presents the same `WorkspaceSession`
/// interface as the Codex backend. The bridge translates between the
/// Codex JSON-RPC protocol and Claude CLI's stream-json format.
pub(crate) async fn spawn_claude_session<E: EventSink>(
    entry: WorkspaceEntry,
    _client_version: String,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let _ = check_claude_installation().await?;

    let thread_id = format!("thread_{}", uuid::Uuid::new_v4());

    let mut command = Command::new("claude");
    command.args(["chat", "--output-format", "stream-json", "--verbose"]);
    command.current_dir(&entry.path);
    command.stdin(std::process::Stdio::piped());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());

    let mut child = command
        .spawn()
        .map_err(|e| format!("Failed to spawn Claude CLI: {e}"))?;

    let stdin = child.stdin.take().ok_or("missing stdin")?;
    let stdout = child.stdout.take().ok_or("missing stdout")?;
    let stderr = child.stderr.take().ok_or("missing stderr")?;

    let workspace_id = entry.id.clone();
    let workspace_path = entry.path.clone();

    // Shared model name: updated by event loop, read by interceptor
    let detected_model: Arc<std::sync::Mutex<Option<String>>> =
        Arc::new(std::sync::Mutex::new(None));
    let detected_model_for_interceptor = detected_model.clone();

    // Build the request interceptor for Claude CLI protocol translation
    let interceptor_thread_id = thread_id.clone();
    let interceptor_workspace_id = workspace_id.clone();
    let interceptor: Arc<dyn Fn(Value) -> InterceptAction + Send + Sync> =
        Arc::new(move |value: Value| {
            let model = detected_model_for_interceptor
                .lock()
                .ok()
                .and_then(|g| g.clone());
            build_claude_intercept_action(
                &value,
                &interceptor_thread_id,
                &interceptor_workspace_id,
                model.as_deref(),
            )
        });

    let session = Arc::new(WorkspaceSession {
        codex_args: None,
        child: Mutex::new(child),
        stdin: Mutex::new(stdin),
        pending: Mutex::new(HashMap::new()),
        request_context: Mutex::new(HashMap::new()),
        thread_workspace: Mutex::new(HashMap::new()),
        hidden_thread_ids: Mutex::new(HashSet::new()),
        next_id: AtomicU64::new(1),
        background_thread_callbacks: Mutex::new(HashMap::new()),
        owner_workspace_id: workspace_id.clone(),
        workspace_ids: Mutex::new(HashSet::from([workspace_id.clone()])),
        workspace_roots: Mutex::new(HashMap::from([(
            workspace_id.clone(),
            workspace_path,
        )])),
        request_interceptor: Some(interceptor),
    });

    // Spawn Claude stdout reader with event translation
    let event_sink_stdout = event_sink.clone();
    let ws_id_stdout = workspace_id.clone();
    let stdout_thread_id = thread_id.clone();
    let detected_model_for_loop = detected_model.clone();
    tokio::spawn(async move {
        let mut bridge_state = BridgeState::new(ws_id_stdout.clone(), stdout_thread_id);
        let mut lines = BufReader::new(stdout).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }

            let claude_event: super::types::ClaudeEvent = match serde_json::from_str(&line) {
                Ok(e) => e,
                Err(err) => {
                    let payload = AppServerEvent {
                        workspace_id: ws_id_stdout.clone(),
                        message: json!({
                            "method": "codex/parseError",
                            "params": { "error": err.to_string(), "raw": line },
                        }),
                    };
                    event_sink_stdout.emit_app_server_event(payload);
                    continue;
                }
            };

            let codex_messages = event_mapper::map_event(&claude_event, &mut bridge_state);

            // Propagate detected model to the shared interceptor state
            if let Some(ref model) = bridge_state.model {
                if let Ok(mut guard) = detected_model_for_loop.lock() {
                    if guard.as_ref() != Some(model) {
                        *guard = Some(model.clone());
                    }
                }
            }

            for message in codex_messages {
                let payload = AppServerEvent {
                    workspace_id: ws_id_stdout.clone(),
                    message,
                };
                event_sink_stdout.emit_app_server_event(payload);
            }
        }
    });

    // Spawn Claude stderr reader
    let event_sink_stderr = event_sink.clone();
    let ws_id_stderr = workspace_id.clone();
    tokio::spawn(async move {
        let mut lines = BufReader::new(stderr).lines();
        while let Ok(Some(line)) = lines.next_line().await {
            if line.trim().is_empty() {
                continue;
            }
            let payload = AppServerEvent {
                workspace_id: ws_id_stderr.clone(),
                message: json!({
                    "method": "codex/stderr",
                    "params": { "message": line },
                }),
            };
            event_sink_stderr.emit_app_server_event(payload);
        }
    });

    // Emit codex/connected immediately
    let payload = AppServerEvent {
        workspace_id: workspace_id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": workspace_id }
        }),
    };
    event_sink.emit_app_server_event(payload);

    Ok(session)
}

/// Format a model ID like "claude-sonnet-4-20250514" into a display name
/// like "Claude Sonnet 4".
fn format_model_display_name(model_id: &str) -> String {
    // Strip date suffix (e.g. "-20250514")
    let base = if let Some(pos) = model_id.rfind('-') {
        let suffix = &model_id[pos + 1..];
        if suffix.len() == 8 && suffix.chars().all(|c| c.is_ascii_digit()) {
            &model_id[..pos]
        } else {
            model_id
        }
    } else {
        model_id
    };
    // Capitalize each segment
    base.split('-')
        .map(|s| {
            let mut c = s.chars();
            match c.next() {
                None => String::new(),
                Some(first) => {
                    let upper: String = first.to_uppercase().collect();
                    upper + c.as_str()
                }
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

/// Determine how to handle a JSON-RPC message destined for Claude CLI.
fn build_claude_intercept_action(
    value: &Value,
    thread_id: &str,
    _workspace_id: &str,
    detected_model: Option<&str>,
) -> InterceptAction {
    let method = value
        .get("method")
        .and_then(|v| v.as_str())
        .unwrap_or("");
    let id = value.get("id").cloned();
    let params = value.get("params").cloned().unwrap_or(Value::Null);

    match method {
        "initialize" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": {
                        "capabilities": { "experimentalApi": true },
                        "serverInfo": {
                            "name": "claude-bridge",
                            "version": "1.0.0"
                        }
                    }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "initialized" => InterceptAction::Drop,

        "turn/start" => {
            let text = extract_user_text(&params);
            if text.is_empty() {
                if let Some(id) = id {
                    return InterceptAction::Respond(json!({
                        "id": id,
                        "error": { "message": "Empty user message" }
                    }));
                }
                return InterceptAction::Drop;
            }
            InterceptAction::Forward(text)
        }

        "turn/steer" => {
            let text = extract_user_text(&params);
            if text.is_empty() {
                if let Some(id) = id {
                    return InterceptAction::Respond(json!({
                        "id": id,
                        "error": { "message": "Empty steer message" }
                    }));
                }
                return InterceptAction::Drop;
            }
            InterceptAction::Forward(text)
        }

        "thread/start" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": {
                        "threadId": thread_id,
                        "thread": {
                            "id": thread_id,
                            "name": "New conversation",
                            "status": "active",
                            "source": "appServer"
                        }
                    }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "thread/resume" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": {
                        "threadId": thread_id,
                        "thread": {
                            "id": thread_id,
                            "status": "active"
                        }
                    }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "thread/list" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": {
                        "data": [{
                            "id": thread_id,
                            "name": "Claude CLI session",
                            "status": "active",
                            "source": "appServer"
                        }]
                    }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "model/list" => {
            if let Some(id) = id {
                let model_id = detected_model.unwrap_or("claude-sonnet-4-20250514");
                let display_name = format_model_display_name(model_id);
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": {
                        "data": [{
                            "id": model_id,
                            "model": model_id,
                            "displayName": display_name,
                            "name": display_name,
                            "isDefault": true,
                            "supportedReasoningEfforts": [],
                            "defaultReasoningEffort": null,
                            "description": "Claude CLI"
                        }]
                    }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "turn/interrupt" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": { "ok": true }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "thread/fork" | "thread/archive" | "thread/compact/start"
        | "thread/name/set" | "review/start" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": { "ok": true }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "skills/list" | "app/list" | "mcpServerStatus/list"
        | "experimentalFeature/list" | "collaborationMode/list" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": { "data": [] }
                }))
            } else {
                InterceptAction::Drop
            }
        }

        "account/read" | "account/rateLimits/read" | "account/login/start"
        | "account/login/cancel" => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "result": {}
                }))
            } else {
                InterceptAction::Drop
            }
        }

        _ => {
            if let Some(id) = id {
                InterceptAction::Respond(json!({
                    "id": id,
                    "error": {
                        "message": format!("Method not supported in Claude CLI mode: {method}")
                    }
                }))
            } else {
                InterceptAction::Drop
            }
        }
    }
}

/// Extract user text from turn/start params.
fn extract_user_text(params: &Value) -> String {
    if let Some(input) = params.get("input").and_then(|v| v.as_array()) {
        let texts: Vec<&str> = input
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                    item.get("text").and_then(|t| t.as_str())
                } else {
                    None
                }
            })
            .collect();
        if !texts.is_empty() {
            return texts.join("\n");
        }
    }

    if let Some(text) = params.get("text").and_then(|v| v.as_str()) {
        return text.to_string();
    }

    String::new()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn extract_user_text_from_input_items() {
        let params = json!({
            "input": [
                { "type": "text", "text": "Hello" },
                { "type": "image", "url": "data:..." }
            ]
        });
        assert_eq!(extract_user_text(&params), "Hello");
    }

    #[test]
    fn extract_user_text_from_text_field() {
        let params = json!({ "text": "Hello world" });
        assert_eq!(extract_user_text(&params), "Hello world");
    }

    #[test]
    fn extract_user_text_empty_when_missing() {
        let params = json!({});
        assert_eq!(extract_user_text(&params), "");
    }

    #[test]
    fn intercept_initialize_responds_immediately() {
        let action =
            build_claude_intercept_action(&json!({"id": 1, "method": "initialize"}), "t1", "w1", None);
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["id"], 1);
                assert!(v["result"]["serverInfo"]["name"].as_str().is_some());
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_turn_start_forwards_text() {
        let action = build_claude_intercept_action(
            &json!({
                "id": 2,
                "method": "turn/start",
                "params": {
                    "input": [{ "type": "text", "text": "What is Rust?" }]
                }
            }),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Forward(text) => assert_eq!(text, "What is Rust?"),
            _ => panic!("Expected Forward"),
        }
    }

    #[test]
    fn intercept_thread_list_responds_with_mock() {
        let action = build_claude_intercept_action(
            &json!({"id": 3, "method": "thread/list"}),
            "thread_abc",
            "ws_1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["id"], 3);
                let data = v["result"]["data"].as_array().unwrap();
                assert_eq!(data[0]["id"], "thread_abc");
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_unknown_method_returns_error() {
        let action = build_claude_intercept_action(
            &json!({"id": 4, "method": "some/unknown"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert!(v["error"]["message"].as_str().is_some());
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_notification_drops_initialized() {
        let action =
            build_claude_intercept_action(&json!({"method": "initialized"}), "t1", "w1", None);
        assert!(matches!(action, InterceptAction::Drop));
    }

    #[test]
    fn intercept_empty_turn_start_returns_error() {
        let action = build_claude_intercept_action(
            &json!({
                "id": 5,
                "method": "turn/start",
                "params": { "input": [] }
            }),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert!(v["error"].is_object());
            }
            _ => panic!("Expected Respond with error"),
        }
    }

    #[test]
    fn format_model_display_name_strips_date() {
        assert_eq!(
            format_model_display_name("claude-sonnet-4-20250514"),
            "Claude Sonnet 4"
        );
        assert_eq!(
            format_model_display_name("claude-opus-4-20250514"),
            "Claude Opus 4"
        );
    }

    #[test]
    fn format_model_display_name_without_date() {
        assert_eq!(
            format_model_display_name("claude-haiku-4"),
            "Claude Haiku 4"
        );
    }

    #[test]
    fn intercept_model_list_uses_detected_model() {
        let action = build_claude_intercept_action(
            &json!({"id": 10, "method": "model/list"}),
            "t1",
            "w1",
            Some("claude-opus-4-20250514"),
        );
        match action {
            InterceptAction::Respond(v) => {
                let data = v["result"]["data"].as_array().unwrap();
                assert_eq!(data[0]["model"], "claude-opus-4-20250514");
                assert_eq!(data[0]["displayName"], "Claude Opus 4");
            }
            _ => panic!("Expected Respond"),
        }
    }

    // ── Phase 5: Additional interceptor tests ─────────────────────

    #[test]
    fn intercept_model_list_fallback_when_no_detected_model() {
        let action = build_claude_intercept_action(
            &json!({"id": 11, "method": "model/list"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                let data = v["result"]["data"].as_array().unwrap();
                assert_eq!(data[0]["model"], "claude-sonnet-4-20250514");
                assert_eq!(data[0]["isDefault"], true);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_turn_steer_forwards_text() {
        let action = build_claude_intercept_action(
            &json!({
                "id": 20,
                "method": "turn/steer",
                "params": { "text": "Actually, do this instead" }
            }),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Forward(text) => assert_eq!(text, "Actually, do this instead"),
            _ => panic!("Expected Forward"),
        }
    }

    #[test]
    fn intercept_turn_steer_empty_returns_error() {
        let action = build_claude_intercept_action(
            &json!({
                "id": 21,
                "method": "turn/steer",
                "params": {}
            }),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert!(v["error"]["message"].as_str().unwrap().contains("Empty steer"));
            }
            _ => panic!("Expected Respond with error"),
        }
    }

    #[test]
    fn intercept_turn_steer_empty_no_id_drops() {
        let action = build_claude_intercept_action(
            &json!({
                "method": "turn/steer",
                "params": {}
            }),
            "t1",
            "w1",
            None,
        );
        assert!(matches!(action, InterceptAction::Drop));
    }

    #[test]
    fn intercept_thread_start_responds_with_thread() {
        let action = build_claude_intercept_action(
            &json!({"id": 30, "method": "thread/start"}),
            "thread_xyz",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["id"], 30);
                assert_eq!(v["result"]["threadId"], "thread_xyz");
                assert_eq!(v["result"]["thread"]["status"], "active");
                assert_eq!(v["result"]["thread"]["name"], "New conversation");
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_thread_resume_responds() {
        let action = build_claude_intercept_action(
            &json!({"id": 31, "method": "thread/resume"}),
            "thread_abc",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["result"]["threadId"], "thread_abc");
                assert_eq!(v["result"]["thread"]["status"], "active");
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_thread_fork_responds_ok() {
        let action = build_claude_intercept_action(
            &json!({"id": 32, "method": "thread/fork"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["id"], 32);
                assert_eq!(v["result"]["ok"], true);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_thread_archive_responds_ok() {
        let action = build_claude_intercept_action(
            &json!({"id": 33, "method": "thread/archive"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => assert_eq!(v["result"]["ok"], true),
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_thread_compact_start_responds_ok() {
        let action = build_claude_intercept_action(
            &json!({"id": 34, "method": "thread/compact/start"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => assert_eq!(v["result"]["ok"], true),
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_thread_name_set_responds_ok() {
        let action = build_claude_intercept_action(
            &json!({"id": 35, "method": "thread/name/set"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => assert_eq!(v["result"]["ok"], true),
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_review_start_responds_ok() {
        let action = build_claude_intercept_action(
            &json!({"id": 36, "method": "review/start"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => assert_eq!(v["result"]["ok"], true),
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_skills_list_responds_empty() {
        let action = build_claude_intercept_action(
            &json!({"id": 40, "method": "skills/list"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["result"]["data"].as_array().unwrap().len(), 0);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_app_list_responds_empty() {
        let action = build_claude_intercept_action(
            &json!({"id": 41, "method": "app/list"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["result"]["data"].as_array().unwrap().len(), 0);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_mcp_server_status_list_responds_empty() {
        let action = build_claude_intercept_action(
            &json!({"id": 42, "method": "mcpServerStatus/list"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["result"]["data"].as_array().unwrap().len(), 0);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_experimental_feature_list_responds_empty() {
        let action = build_claude_intercept_action(
            &json!({"id": 43, "method": "experimentalFeature/list"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["result"]["data"].as_array().unwrap().len(), 0);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_collaboration_mode_list_responds_empty() {
        let action = build_claude_intercept_action(
            &json!({"id": 44, "method": "collaborationMode/list"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["result"]["data"].as_array().unwrap().len(), 0);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_account_read_responds_empty() {
        let action = build_claude_intercept_action(
            &json!({"id": 50, "method": "account/read"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["id"], 50);
                assert!(v["result"].is_object());
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_account_rate_limits_read_responds() {
        let action = build_claude_intercept_action(
            &json!({"id": 51, "method": "account/rateLimits/read"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => assert_eq!(v["id"], 51),
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_account_login_start_responds() {
        let action = build_claude_intercept_action(
            &json!({"id": 52, "method": "account/login/start"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => assert_eq!(v["id"], 52),
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_turn_interrupt_responds_ok() {
        let action = build_claude_intercept_action(
            &json!({"id": 60, "method": "turn/interrupt"}),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Respond(v) => {
                assert_eq!(v["id"], 60);
                assert_eq!(v["result"]["ok"], true);
            }
            _ => panic!("Expected Respond"),
        }
    }

    #[test]
    fn intercept_notification_without_id_drops() {
        for method in &["thread/start", "thread/list", "model/list", "turn/interrupt", "skills/list", "account/read"] {
            let action = build_claude_intercept_action(
                &json!({"method": method}),
                "t1",
                "w1",
                None,
            );
            assert!(
                matches!(action, InterceptAction::Drop),
                "Expected Drop for notification {method} without id"
            );
        }
    }

    #[test]
    fn intercept_turn_start_empty_input_no_id_drops() {
        let action = build_claude_intercept_action(
            &json!({
                "method": "turn/start",
                "params": { "input": [] }
            }),
            "t1",
            "w1",
            None,
        );
        assert!(matches!(action, InterceptAction::Drop));
    }

    #[test]
    fn intercept_unknown_method_no_id_drops() {
        let action = build_claude_intercept_action(
            &json!({"method": "completely/unknown"}),
            "t1",
            "w1",
            None,
        );
        assert!(matches!(action, InterceptAction::Drop));
    }

    #[test]
    fn extract_user_text_multiple_text_items_joined() {
        let params = json!({
            "input": [
                { "type": "text", "text": "Hello" },
                { "type": "text", "text": "World" }
            ]
        });
        assert_eq!(extract_user_text(&params), "Hello\nWorld");
    }

    #[test]
    fn extract_user_text_prefers_input_over_text() {
        let params = json!({
            "input": [{ "type": "text", "text": "from input" }],
            "text": "from text field"
        });
        assert_eq!(extract_user_text(&params), "from input");
    }

    #[test]
    fn format_model_display_name_single_segment() {
        assert_eq!(format_model_display_name("claude"), "Claude");
    }

    #[test]
    fn format_model_display_name_with_non_date_suffix() {
        assert_eq!(
            format_model_display_name("claude-sonnet-4-beta"),
            "Claude Sonnet 4 Beta"
        );
    }

    #[test]
    fn format_model_display_name_empty() {
        assert_eq!(format_model_display_name(""), "");
    }

    #[test]
    fn intercept_turn_start_with_text_field() {
        let action = build_claude_intercept_action(
            &json!({
                "id": 70,
                "method": "turn/start",
                "params": { "text": "Simple text" }
            }),
            "t1",
            "w1",
            None,
        );
        match action {
            InterceptAction::Forward(text) => assert_eq!(text, "Simple text"),
            _ => panic!("Expected Forward"),
        }
    }

    #[test]
    fn intercept_initialize_without_id_drops() {
        let action = build_claude_intercept_action(
            &json!({"method": "initialize"}),
            "t1",
            "w1",
            None,
        );
        assert!(matches!(action, InterceptAction::Drop));
    }
}
