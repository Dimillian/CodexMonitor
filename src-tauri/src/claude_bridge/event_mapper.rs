use serde_json::{json, Value};

use super::item_tracker::{self, ItemInfo};
use super::types::{
    BridgeState, ClaudeEvent, ContentBlock, ContentBlockDelta,
};

/// Maps a Claude CLI stream-json event to zero or more Codex JSON-RPC
/// notification messages. Returns a `Vec` because some Claude events
/// expand into multiple Codex notifications (e.g. system init →
/// codex/connected + thread/started).
pub(crate) fn map_event(event: &ClaudeEvent, state: &mut BridgeState) -> Vec<Value> {
    match event {
        ClaudeEvent::System(sys) => map_system(sys, state),
        ClaudeEvent::MessageStart(msg) => map_message_start(msg, state),
        ClaudeEvent::ContentBlockStart(cb) => map_content_block_start(cb, state),
        ClaudeEvent::ContentBlockDelta(cbd) => map_content_block_delta(cbd, state),
        ClaudeEvent::ContentBlockStop(cbs) => map_content_block_stop(cbs, state),
        ClaudeEvent::MessageDelta(md) => map_message_delta(md, state),
        ClaudeEvent::MessageStop(_) => map_message_stop(state),
        ClaudeEvent::Result(res) => map_result(res, state),
        ClaudeEvent::Assistant(a) => map_assistant(a, state),
        ClaudeEvent::Unknown => vec![],
    }
}

fn map_system(
    sys: &super::types::SystemEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();

    if let Some(ref model) = sys.model {
        state.model = Some(model.clone());
    }

    // Emit codex/connected
    out.push(json!({
        "method": "codex/connected",
        "params": {
            "workspaceId": state.workspace_id
        }
    }));

    // Emit thread/started
    if !state.thread_started {
        state.thread_started = true;
        out.push(json!({
            "method": "thread/started",
            "params": {
                "threadId": state.thread_id,
                "thread": {
                    "id": state.thread_id,
                    "name": "New conversation",
                    "status": "active",
                    "source": "appServer"
                }
            }
        }));
    }

    out
}

fn map_message_start(
    msg: &super::types::MessageStartEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();

    if let Some(ref info) = msg.message {
        if let Some(ref model) = info.model {
            state.model = Some(model.clone());
        }
    }

    // Emit turn/started if not yet done for this turn
    if !state.turn_started {
        state.turn_started = true;
        out.push(json!({
            "method": "turn/started",
            "params": {
                "threadId": state.thread_id,
                "turnId": state.turn_id
            }
        }));
    }

    out
}

fn map_content_block_start(
    cb: &super::types::ContentBlockEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();
    let Some(ref block) = cb.content_block else {
        return out;
    };

    match block {
        ContentBlock::Text { .. } => {
            let item_id = state.next_item();
            state.block_items.insert(cb.index, item_id.clone());
            out.push(json!({
                "method": "item/started",
                "params": {
                    "threadId": state.thread_id,
                    "turnId": state.turn_id,
                    "item": {
                        "id": item_id,
                        "type": "agentMessage",
                        "status": "in_progress"
                    }
                }
            }));
        }
        ContentBlock::Thinking { .. } => {
            let item_id = state.next_item();
            state.block_items.insert(cb.index, item_id.clone());
            out.push(json!({
                "method": "item/started",
                "params": {
                    "threadId": state.thread_id,
                    "turnId": state.turn_id,
                    "item": {
                        "id": item_id,
                        "type": "reasoning",
                        "status": "in_progress"
                    }
                }
            }));
        }
        ContentBlock::ToolUse { id, name, .. } => {
            let item_id = state.next_item();
            state.block_items.insert(cb.index, item_id.clone());

            let category = item_tracker::classify_tool(name);
            let info = ItemInfo {
                item_id: item_id.clone(),
                tool_use_id: id.clone(),
                tool_name: name.clone(),
                category,
                accumulated_input_json: String::new(),
                aggregated_output: String::new(),
            };

            let event = item_tracker::build_item_started(
                &info,
                &state.thread_id,
                &state.turn_id,
            );

            state.block_tool_use_ids.insert(cb.index, id.clone());
            state.tool_items.insert(id.clone(), info);

            out.push(event);
        }
        ContentBlock::ToolResult {
            tool_use_id,
            content,
        } => {
            // Map tool result content to output delta for the original item
            if let Some(ref tuid) = tool_use_id {
                let result_text = extract_tool_result_text(content.as_ref());
                if !result_text.is_empty() {
                    if let Some(info) = state.tool_items.get_mut(tuid) {
                        info.aggregated_output.push_str(&result_text);
                        out.push(item_tracker::build_output_delta(
                            info,
                            &state.thread_id,
                            &state.turn_id,
                            &result_text,
                        ));
                    }
                }
            }
        }
        _ => {}
    }

    out
}

/// Extract text from a tool result content value.
fn extract_tool_result_text(content: Option<&Value>) -> String {
    let Some(content) = content else {
        return String::new();
    };
    // Content can be a string directly
    if let Some(s) = content.as_str() {
        return s.to_string();
    }
    // Or an array of content blocks
    if let Some(arr) = content.as_array() {
        let texts: Vec<&str> = arr
            .iter()
            .filter_map(|item| {
                if item.get("type").and_then(|t| t.as_str()) == Some("text") {
                    item.get("text").and_then(|t| t.as_str())
                } else {
                    None
                }
            })
            .collect();
        return texts.join("\n");
    }
    String::new()
}

fn map_content_block_delta(
    cbd: &super::types::ContentBlockDeltaEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();
    let Some(ref delta) = cbd.delta else {
        return out;
    };
    let item_id = match state.block_items.get(&cbd.index) {
        Some(id) => id.clone(),
        None => return out,
    };

    match delta {
        ContentBlockDelta::TextDelta { text } => {
            state.accumulated_text.push_str(text);
            out.push(json!({
                "method": "item/agentMessage/delta",
                "params": {
                    "threadId": state.thread_id,
                    "turnId": state.turn_id,
                    "itemId": item_id,
                    "delta": text
                }
            }));
        }
        ContentBlockDelta::ThinkingDelta { thinking } => {
            out.push(json!({
                "method": "item/reasoning/textDelta",
                "params": {
                    "threadId": state.thread_id,
                    "turnId": state.turn_id,
                    "itemId": item_id,
                    "delta": thinking
                }
            }));
        }
        ContentBlockDelta::InputJsonDelta { partial_json } => {
            // Accumulate input JSON in the item tracker
            if let Some(tool_use_id) = state.block_tool_use_ids.get(&cbd.index) {
                if let Some(info) = state.tool_items.get_mut(tool_use_id) {
                    info.accumulated_input_json.push_str(partial_json);
                    out.push(item_tracker::build_output_delta(
                        info,
                        &state.thread_id,
                        &state.turn_id,
                        partial_json,
                    ));
                    return out;
                }
            }
            // Fallback if no tool tracking info found
            out.push(json!({
                "method": "item/commandExecution/outputDelta",
                "params": {
                    "threadId": state.thread_id,
                    "turnId": state.turn_id,
                    "itemId": item_id,
                    "delta": partial_json
                }
            }));
        }
        ContentBlockDelta::Other => {}
    }

    out
}

fn map_content_block_stop(
    cbs: &super::types::ContentBlockStopEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();

    // Check if this is a tool block — emit enriched item/completed
    if let Some(tool_use_id) = state.block_tool_use_ids.get(&cbs.index) {
        if let Some(info) = state.tool_items.get(tool_use_id) {
            out.push(item_tracker::build_item_completed(
                info,
                &state.thread_id,
                &state.turn_id,
            ));
            return out;
        }
    }

    // Non-tool block: emit simple item/completed
    if let Some(item_id) = state.block_items.get(&cbs.index) {
        out.push(json!({
            "method": "item/completed",
            "params": {
                "threadId": state.thread_id,
                "turnId": state.turn_id,
                "itemId": item_id,
                "status": "completed"
            }
        }));
    }
    out
}

/// Infer the model context window size from the model name.
fn context_window_for_model(model: Option<&str>) -> u64 {
    match model {
        Some(m) if m.starts_with("claude-haiku") => 200_000,
        Some(m) if m.starts_with("claude-sonnet") => 200_000,
        Some(m) if m.starts_with("claude-opus") => 200_000,
        _ => 200_000,
    }
}

fn map_message_delta(
    md: &super::types::MessageDeltaEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();
    if let Some(ref usage) = md.usage {
        let ctx_window = context_window_for_model(state.model.as_deref());
        out.push(json!({
            "method": "thread/tokenUsage/updated",
            "params": {
                "threadId": state.thread_id,
                "usage": {
                    "inputTokens": usage.input_tokens,
                    "outputTokens": usage.output_tokens,
                    "cacheCreationInputTokens": usage.cache_creation_input_tokens,
                    "cacheReadInputTokens": usage.cache_read_input_tokens,
                    "modelContextWindow": ctx_window
                }
            }
        }));
    }
    out
}

fn map_message_stop(state: &mut BridgeState) -> Vec<Value> {
    // Message stop doesn't directly map to a single event.
    // Turn completion is handled by the result event.
    let _ = state;
    vec![]
}

fn map_result(
    res: &super::types::ResultEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();
    let ctx_window = context_window_for_model(state.model.as_deref());

    // Accumulate totals and emit token usage
    if let Some(ref usage) = res.usage {
        state.total_input_tokens += usage.input_tokens;
        state.total_output_tokens += usage.output_tokens;

        let last_total = usage.input_tokens + usage.output_tokens;
        let grand_total = state.total_input_tokens + state.total_output_tokens;

        out.push(json!({
            "method": "thread/tokenUsage/updated",
            "params": {
                "threadId": state.thread_id,
                "usage": {
                    "last": {
                        "inputTokens": usage.input_tokens,
                        "outputTokens": usage.output_tokens,
                        "totalTokens": last_total,
                        "cachedInputTokens": usage.cache_read_input_tokens.unwrap_or(0),
                        "reasoningOutputTokens": 0
                    },
                    "total": {
                        "inputTokens": state.total_input_tokens,
                        "outputTokens": state.total_output_tokens,
                        "totalTokens": grand_total,
                        "cachedInputTokens": 0,
                        "reasoningOutputTokens": 0
                    },
                    "modelContextWindow": ctx_window
                }
            }
        }));
    }

    // Accumulate cost
    if let Some(cost) = res.cost_usd {
        state.total_cost_usd += cost;
    }

    // Emit turn/completed with cost and duration
    if state.turn_started {
        out.push(json!({
            "method": "turn/completed",
            "params": {
                "threadId": state.thread_id,
                "turnId": state.turn_id,
                "status": if res.is_error { "error" } else { "completed" },
                "costUsd": res.cost_usd,
                "durationMs": res.duration_ms
            }
        }));
    }

    // Emit rate limits with cumulative cost display
    if state.total_cost_usd > 0.0 {
        out.push(json!({
            "method": "account/rateLimits/updated",
            "params": {
                "primary": null,
                "secondary": null,
                "credits": {
                    "hasCredits": true,
                    "unlimited": false,
                    "balance": format!("${:.2} spent", state.total_cost_usd)
                },
                "planType": "claude-cli"
            }
        }));
    }

    // Auto-name the thread from first ~38 chars of accumulated text
    if !state.accumulated_text.is_empty() {
        let name: String = state.accumulated_text.chars().take(38).collect();
        let name = name.trim().to_string();
        if !name.is_empty() {
            out.push(json!({
                "method": "thread/name/updated",
                "params": {
                    "threadId": state.thread_id,
                    "name": name
                }
            }));
        }
    }

    // Prepare for next turn
    state.new_turn();

    out
}

fn map_assistant(
    a: &super::types::AssistantEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    // The top-level "assistant" event type is a fallback for simpler streaming
    // modes. In full streaming mode, content_block events carry the data.
    // Handle the "text" subtype as a simple message delta.
    let mut out = Vec::new();
    if a.subtype.as_deref() == Some("text") {
        if let Some(ref msg) = a.message {
            if let Some(text) = msg.as_str() {
                state.accumulated_text.push_str(text);
                let item_id = state
                    .block_items
                    .values()
                    .next()
                    .cloned()
                    .unwrap_or_else(|| {
                        let id = state.next_item();
                        state.block_items.insert(0, id.clone());
                        id
                    });
                out.push(json!({
                    "method": "item/agentMessage/delta",
                    "params": {
                        "threadId": state.thread_id,
                        "turnId": state.turn_id,
                        "itemId": item_id,
                        "delta": text
                    }
                }));
            }
        }
    }
    out
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_bridge::types::*;

    fn make_state() -> BridgeState {
        BridgeState::new("ws_test".to_string(), "thread_test".to_string())
    }

    #[test]
    fn system_event_emits_connected_and_thread_started() {
        let mut state = make_state();
        let event = ClaudeEvent::System(SystemEvent {
            subtype: None,
            session_id: Some("sess_123".to_string()),
            tools: None,
            model: Some("claude-sonnet-4-20250514".to_string()),
            extra: Default::default(),
        });

        let messages = map_event(&event, &mut state);
        assert_eq!(messages.len(), 2);

        assert_eq!(messages[0]["method"], "codex/connected");
        assert_eq!(messages[0]["params"]["workspaceId"], "ws_test");

        assert_eq!(messages[1]["method"], "thread/started");
        assert_eq!(messages[1]["params"]["threadId"], "thread_test");

        assert!(state.thread_started);
        assert_eq!(state.model.as_deref(), Some("claude-sonnet-4-20250514"));
    }

    #[test]
    fn system_event_only_emits_thread_started_once() {
        let mut state = make_state();
        state.thread_started = true;
        let event = ClaudeEvent::System(SystemEvent {
            subtype: None,
            session_id: None,
            tools: None,
            model: None,
            extra: Default::default(),
        });

        let messages = map_event(&event, &mut state);
        assert_eq!(messages.len(), 1); // only codex/connected
    }

    #[test]
    fn message_start_emits_turn_started() {
        let mut state = make_state();
        let event = ClaudeEvent::MessageStart(MessageStartEvent {
            message: Some(MessageInfo {
                id: Some("msg_123".to_string()),
                role: Some("assistant".to_string()),
                model: Some("claude-sonnet-4-20250514".to_string()),
                usage: None,
            }),
        });

        let messages = map_event(&event, &mut state);
        assert_eq!(messages.len(), 1);
        assert_eq!(messages[0]["method"], "turn/started");
        assert!(state.turn_started);
    }

    #[test]
    fn text_content_block_lifecycle() {
        let mut state = make_state();
        state.thread_started = true;
        state.turn_started = true;

        // content_block_start (text)
        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::Text {
                text: String::new(),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/started");
        assert_eq!(msgs[0]["params"]["item"]["type"], "agentMessage");

        // content_block_delta (text)
        let delta = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::TextDelta {
                text: "Hello world".to_string(),
            }),
        });
        let msgs = map_event(&delta, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/agentMessage/delta");
        assert_eq!(msgs[0]["params"]["delta"], "Hello world");

        // content_block_stop
        let stop = ClaudeEvent::ContentBlockStop(ContentBlockStopEvent { index: 0 });
        let msgs = map_event(&stop, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/completed");
    }

    #[test]
    fn thinking_content_block_maps_to_reasoning() {
        let mut state = make_state();
        state.turn_started = true;

        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::Thinking {
                thinking: String::new(),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs[0]["params"]["item"]["type"], "reasoning");

        let delta = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::ThinkingDelta {
                thinking: "Let me think...".to_string(),
            }),
        });
        let msgs = map_event(&delta, &mut state);
        assert_eq!(msgs[0]["method"], "item/reasoning/textDelta");
        assert_eq!(msgs[0]["params"]["delta"], "Let me think...");
    }

    #[test]
    fn tool_use_content_block_maps_to_command_execution() {
        let mut state = make_state();
        state.turn_started = true;

        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "tool_123".to_string(),
                name: "bash".to_string(),
                input: json!({}),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs[0]["params"]["item"]["type"], "commandExecution");
        assert_eq!(msgs[0]["params"]["item"]["toolName"], "bash");

        let delta = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::InputJsonDelta {
                partial_json: "{\"command\":\"ls\"}".to_string(),
            }),
        });
        let msgs = map_event(&delta, &mut state);
        assert_eq!(msgs[0]["method"], "item/commandExecution/outputDelta");
    }

    #[test]
    fn result_event_emits_turn_completed_and_thread_name() {
        let mut state = make_state();
        state.turn_started = true;
        state.accumulated_text = "Here is the answer to your question".to_string();

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None,
            result: None,
            error: None,
            duration_ms: Some(1500),
            duration_api_ms: Some(1200),
            num_turns: Some(1),
            is_error: false,
            session_id: None,
            cost_usd: Some(0.01),
            usage: Some(UsageInfo {
                input_tokens: 100,
                output_tokens: 50,
                cache_creation_input_tokens: None,
                cache_read_input_tokens: None,
            }),
            extra: Default::default(),
        });

        let msgs = map_event(&event, &mut state);

        // Should have: tokenUsage, turn/completed, thread/name/updated
        let methods: Vec<&str> = msgs
            .iter()
            .map(|m| m["method"].as_str().unwrap())
            .collect();
        assert!(methods.contains(&"thread/tokenUsage/updated"));
        assert!(methods.contains(&"turn/completed"));
        assert!(methods.contains(&"thread/name/updated"));

        // Turn should be reset
        assert!(!state.turn_started);
    }

    #[test]
    fn result_error_emits_error_status() {
        let mut state = make_state();
        state.turn_started = true;

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None,
            result: None,
            error: Some("API error".to_string()),
            duration_ms: None,
            duration_api_ms: None,
            num_turns: None,
            is_error: true,
            session_id: None,
            cost_usd: None,
            usage: None,
            extra: Default::default(),
        });

        let msgs = map_event(&event, &mut state);
        let turn_completed = msgs
            .iter()
            .find(|m| m["method"] == "turn/completed")
            .unwrap();
        assert_eq!(turn_completed["params"]["status"], "error");
    }

    #[test]
    fn unknown_event_produces_no_output() {
        let mut state = make_state();
        let msgs = map_event(&ClaudeEvent::Unknown, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn message_delta_with_usage_emits_token_update() {
        let mut state = make_state();
        let event = ClaudeEvent::MessageDelta(MessageDeltaEvent {
            delta: None,
            usage: Some(UsageInfo {
                input_tokens: 200,
                output_tokens: 100,
                cache_creation_input_tokens: Some(50),
                cache_read_input_tokens: Some(30),
            }),
        });

        let msgs = map_event(&event, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "thread/tokenUsage/updated");
        assert_eq!(msgs[0]["params"]["usage"]["inputTokens"], 200);
    }

    // ── Phase 2: Tool Execution & Item Management ────────────────

    #[test]
    fn bash_tool_lifecycle_produces_command_execution() {
        let mut state = make_state();
        state.turn_started = true;

        // 1. content_block_start with tool_use (bash)
        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_abc".to_string(),
                name: "bash".to_string(),
                input: json!({}),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/started");
        assert_eq!(msgs[0]["params"]["item"]["type"], "commandExecution");
        assert_eq!(msgs[0]["params"]["item"]["toolName"], "bash");
        assert_eq!(msgs[0]["params"]["item"]["command"], "");

        let item_id = msgs[0]["params"]["item"]["id"].as_str().unwrap().to_string();

        // 2. content_block_delta with input_json_delta
        let delta1 = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::InputJsonDelta {
                partial_json: r#"{"comma"#.to_string(),
            }),
        });
        let msgs = map_event(&delta1, &mut state);
        assert_eq!(msgs[0]["method"], "item/commandExecution/outputDelta");

        let delta2 = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::InputJsonDelta {
                partial_json: r#"nd": "ls -la"}"#.to_string(),
            }),
        });
        let msgs = map_event(&delta2, &mut state);
        assert_eq!(msgs[0]["method"], "item/commandExecution/outputDelta");

        // 3. content_block_stop → enriched item/completed with command
        let stop = ClaudeEvent::ContentBlockStop(ContentBlockStopEvent { index: 0 });
        let msgs = map_event(&stop, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/completed");
        assert_eq!(msgs[0]["params"]["itemId"], item_id);
        assert_eq!(msgs[0]["params"]["status"], "completed");
        assert_eq!(msgs[0]["params"]["command"], "ls -la");
    }

    #[test]
    fn write_file_tool_produces_file_change() {
        let mut state = make_state();
        state.turn_started = true;

        // Start
        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_xyz".to_string(),
                name: "write_file".to_string(),
                input: json!({}),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs[0]["params"]["item"]["type"], "fileChange");
        assert_eq!(msgs[0]["params"]["item"]["toolName"], "write_file");

        // Input delta
        let delta = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::InputJsonDelta {
                partial_json: r#"{"path": "src/main.rs", "content": "fn main() {}"}"#.to_string(),
            }),
        });
        let msgs = map_event(&delta, &mut state);
        assert_eq!(msgs[0]["method"], "item/fileChange/outputDelta");

        // Stop → enriched with changes array
        let stop = ClaudeEvent::ContentBlockStop(ContentBlockStopEvent { index: 0 });
        let msgs = map_event(&stop, &mut state);
        assert_eq!(msgs[0]["method"], "item/completed");
        let changes = msgs[0]["params"]["changes"].as_array().unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0]["path"], "src/main.rs");
        assert_eq!(changes[0]["kind"], "add");
    }

    #[test]
    fn edit_file_tool_produces_file_change_modify() {
        let mut state = make_state();
        state.turn_started = true;

        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_edit".to_string(),
                name: "edit_file".to_string(),
                input: json!({}),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs[0]["params"]["item"]["type"], "fileChange");

        let delta = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::InputJsonDelta {
                partial_json: r#"{"path": "lib.rs"}"#.to_string(),
            }),
        });
        map_event(&delta, &mut state);

        let stop = ClaudeEvent::ContentBlockStop(ContentBlockStopEvent { index: 0 });
        let msgs = map_event(&stop, &mut state);
        let changes = msgs[0]["params"]["changes"].as_array().unwrap();
        assert_eq!(changes[0]["kind"], "modify");
    }

    #[test]
    fn unknown_tool_defaults_to_command_execution() {
        let mut state = make_state();
        state.turn_started = true;

        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_custom".to_string(),
                name: "my_custom_tool".to_string(),
                input: json!({}),
            }),
        });
        let msgs = map_event(&start, &mut state);
        assert_eq!(msgs[0]["params"]["item"]["type"], "commandExecution");
    }

    #[test]
    fn tool_result_content_maps_to_output_delta() {
        let mut state = make_state();
        state.turn_started = true;

        // Start a bash tool
        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_res".to_string(),
                name: "bash".to_string(),
                input: json!({}),
            }),
        });
        map_event(&start, &mut state);

        // Stop the tool block
        let stop = ClaudeEvent::ContentBlockStop(ContentBlockStopEvent { index: 0 });
        map_event(&stop, &mut state);

        // Tool result arrives as a new content block
        let result = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 1,
            content_block: Some(ContentBlock::ToolResult {
                tool_use_id: Some("toolu_res".to_string()),
                content: Some(json!("file1.txt\nfile2.txt\n")),
            }),
        });
        let msgs = map_event(&result, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/commandExecution/outputDelta");
        assert_eq!(msgs[0]["params"]["delta"], "file1.txt\nfile2.txt\n");

        // Verify aggregated_output was stored
        let info = state.tool_items.get("toolu_res").unwrap();
        assert_eq!(info.aggregated_output, "file1.txt\nfile2.txt\n");
    }

    #[test]
    fn tool_result_array_content_extracts_text() {
        let mut state = make_state();
        state.turn_started = true;

        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_arr".to_string(),
                name: "bash".to_string(),
                input: json!({}),
            }),
        });
        map_event(&start, &mut state);

        let result = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 1,
            content_block: Some(ContentBlock::ToolResult {
                tool_use_id: Some("toolu_arr".to_string()),
                content: Some(json!([
                    {"type": "text", "text": "line1"},
                    {"type": "image", "url": "data:..."},
                    {"type": "text", "text": "line2"}
                ])),
            }),
        });
        let msgs = map_event(&result, &mut state);
        assert_eq!(msgs[0]["params"]["delta"], "line1\nline2");
    }

    #[test]
    fn new_turn_clears_tool_tracking_state() {
        let mut state = make_state();
        state.turn_started = true;

        // Start a tool
        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::ToolUse {
                id: "toolu_clear".to_string(),
                name: "bash".to_string(),
                input: json!({}),
            }),
        });
        map_event(&start, &mut state);
        assert!(!state.tool_items.is_empty());
        assert!(!state.block_tool_use_ids.is_empty());

        // New turn should clear
        state.new_turn();
        assert!(state.tool_items.is_empty());
        assert!(state.block_tool_use_ids.is_empty());
    }

    // ── Phase 4: Model, Cost, Limits & Context Window ────────────

    #[test]
    fn result_event_accumulates_total_tokens() {
        let mut state = make_state();
        state.turn_started = true;

        let event1 = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: Some(0.01),
            usage: Some(UsageInfo {
                input_tokens: 100, output_tokens: 50,
                cache_creation_input_tokens: None, cache_read_input_tokens: None,
            }),
            extra: Default::default(),
        });
        map_event(&event1, &mut state);

        assert_eq!(state.total_input_tokens, 100);
        assert_eq!(state.total_output_tokens, 50);
        assert!((state.total_cost_usd - 0.01).abs() < f64::EPSILON);

        // Second turn
        state.turn_started = true;
        let event2 = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: Some(0.02),
            usage: Some(UsageInfo {
                input_tokens: 200, output_tokens: 100,
                cache_creation_input_tokens: None, cache_read_input_tokens: None,
            }),
            extra: Default::default(),
        });
        map_event(&event2, &mut state);

        assert_eq!(state.total_input_tokens, 300);
        assert_eq!(state.total_output_tokens, 150);
        assert!((state.total_cost_usd - 0.03).abs() < f64::EPSILON);
    }

    #[test]
    fn result_event_emits_model_context_window() {
        let mut state = make_state();
        state.turn_started = true;
        state.model = Some("claude-sonnet-4-20250514".to_string());

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: None,
            usage: Some(UsageInfo {
                input_tokens: 100, output_tokens: 50,
                cache_creation_input_tokens: None, cache_read_input_tokens: None,
            }),
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);

        let token_msg = msgs.iter()
            .find(|m| m["method"] == "thread/tokenUsage/updated")
            .unwrap();
        assert_eq!(token_msg["params"]["usage"]["modelContextWindow"], 200_000);
        assert_eq!(token_msg["params"]["usage"]["last"]["totalTokens"], 150);
        assert_eq!(token_msg["params"]["usage"]["total"]["totalTokens"], 150);
    }

    #[test]
    fn result_event_emits_rate_limits_with_cost() {
        let mut state = make_state();
        state.turn_started = true;

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: Some(0.42),
            usage: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);

        let rate_msg = msgs.iter()
            .find(|m| m["method"] == "account/rateLimits/updated")
            .unwrap();
        assert_eq!(rate_msg["params"]["credits"]["hasCredits"], true);
        assert_eq!(rate_msg["params"]["credits"]["balance"], "$0.42 spent");
        assert_eq!(rate_msg["params"]["planType"], "claude-cli");
    }

    #[test]
    fn result_event_includes_cost_in_turn_completed() {
        let mut state = make_state();
        state.turn_started = true;

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: Some(3200), duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: Some(0.05),
            usage: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);

        let turn_msg = msgs.iter()
            .find(|m| m["method"] == "turn/completed")
            .unwrap();
        assert_eq!(turn_msg["params"]["costUsd"], 0.05);
        assert_eq!(turn_msg["params"]["durationMs"], 3200);
        assert_eq!(turn_msg["params"]["status"], "completed");
    }

    #[test]
    fn message_delta_includes_model_context_window() {
        let mut state = make_state();
        state.model = Some("claude-opus-4-20250514".to_string());

        let event = ClaudeEvent::MessageDelta(MessageDeltaEvent {
            delta: None,
            usage: Some(UsageInfo {
                input_tokens: 50, output_tokens: 25,
                cache_creation_input_tokens: None, cache_read_input_tokens: None,
            }),
        });
        let msgs = map_event(&event, &mut state);
        assert_eq!(msgs[0]["params"]["usage"]["modelContextWindow"], 200_000);
    }

    // ── Phase 5: Additional edge-case tests ───────────────────────

    #[test]
    fn assistant_text_subtype_produces_message_delta() {
        let mut state = make_state();
        state.turn_started = true;

        let event = ClaudeEvent::Assistant(AssistantEvent {
            subtype: Some("text".to_string()),
            message: Some(serde_json::json!("Hello from assistant")),
            content_block: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        assert_eq!(msgs.len(), 1);
        assert_eq!(msgs[0]["method"], "item/agentMessage/delta");
        assert_eq!(msgs[0]["params"]["delta"], "Hello from assistant");
        assert_eq!(state.accumulated_text, "Hello from assistant");
    }

    #[test]
    fn assistant_text_creates_item_if_none_exists() {
        let mut state = make_state();
        assert!(state.block_items.is_empty());

        let event = ClaudeEvent::Assistant(AssistantEvent {
            subtype: Some("text".to_string()),
            message: Some(serde_json::json!("First message")),
            content_block: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        assert_eq!(msgs.len(), 1);
        // An item should have been auto-created
        assert!(!state.block_items.is_empty());
        assert_eq!(msgs[0]["params"]["itemId"], "item_1");
    }

    #[test]
    fn assistant_text_reuses_existing_item() {
        let mut state = make_state();
        state.block_items.insert(0, "item_existing".to_string());

        let event = ClaudeEvent::Assistant(AssistantEvent {
            subtype: Some("text".to_string()),
            message: Some(serde_json::json!("More text")),
            content_block: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        assert_eq!(msgs[0]["params"]["itemId"], "item_existing");
    }

    #[test]
    fn assistant_non_text_subtype_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::Assistant(AssistantEvent {
            subtype: Some("other".to_string()),
            message: Some(serde_json::json!("ignored")),
            content_block: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn assistant_none_subtype_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::Assistant(AssistantEvent {
            subtype: None,
            message: Some(serde_json::json!("ignored")),
            content_block: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn extract_tool_result_text_from_none() {
        assert_eq!(extract_tool_result_text(None), "");
    }

    #[test]
    fn extract_tool_result_text_from_string_value() {
        let val = serde_json::json!("direct output");
        assert_eq!(extract_tool_result_text(Some(&val)), "direct output");
    }

    #[test]
    fn extract_tool_result_text_from_array() {
        let val = serde_json::json!([
            {"type": "text", "text": "line1"},
            {"type": "text", "text": "line2"}
        ]);
        assert_eq!(extract_tool_result_text(Some(&val)), "line1\nline2");
    }

    #[test]
    fn extract_tool_result_text_from_array_skips_non_text() {
        let val = serde_json::json!([
            {"type": "image", "url": "data:..."},
            {"type": "text", "text": "only text"}
        ]);
        assert_eq!(extract_tool_result_text(Some(&val)), "only text");
    }

    #[test]
    fn extract_tool_result_text_from_non_string_non_array() {
        let val = serde_json::json!(42);
        assert_eq!(extract_tool_result_text(Some(&val)), "");
    }

    #[test]
    fn extract_tool_result_text_from_empty_array() {
        let val = serde_json::json!([]);
        assert_eq!(extract_tool_result_text(Some(&val)), "");
    }

    #[test]
    fn context_window_defaults_to_200k() {
        assert_eq!(context_window_for_model(None), 200_000);
        assert_eq!(context_window_for_model(Some("unknown-model")), 200_000);
    }

    #[test]
    fn context_window_for_known_models() {
        assert_eq!(context_window_for_model(Some("claude-haiku-4")), 200_000);
        assert_eq!(context_window_for_model(Some("claude-sonnet-4-20250514")), 200_000);
        assert_eq!(context_window_for_model(Some("claude-opus-4-20250514")), 200_000);
    }

    #[test]
    fn message_start_does_not_duplicate_turn_started() {
        let mut state = make_state();
        state.turn_started = true; // already started

        let event = ClaudeEvent::MessageStart(MessageStartEvent {
            message: Some(MessageInfo {
                id: Some("msg_2".to_string()),
                role: Some("assistant".to_string()),
                model: None,
                usage: None,
            }),
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty()); // no duplicate turn/started
    }

    #[test]
    fn message_start_updates_model() {
        let mut state = make_state();
        assert!(state.model.is_none());

        let event = ClaudeEvent::MessageStart(MessageStartEvent {
            message: Some(MessageInfo {
                id: None,
                role: None,
                model: Some("claude-opus-4-20250514".to_string()),
                usage: None,
            }),
        });
        map_event(&event, &mut state);
        assert_eq!(state.model.as_deref(), Some("claude-opus-4-20250514"));
    }

    #[test]
    fn message_stop_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::MessageStop(MessageStopEvent {
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn content_block_start_without_block_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: None,
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn content_block_delta_without_item_produces_nothing() {
        let mut state = make_state();
        // No block_items registered for index 5
        let event = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 5,
            delta: Some(ContentBlockDelta::TextDelta {
                text: "orphan".to_string(),
            }),
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn content_block_delta_without_delta_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: None,
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn content_block_stop_without_registered_item_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::ContentBlockStop(ContentBlockStopEvent { index: 99 });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }

    #[test]
    fn result_without_turn_started_skips_turn_completed() {
        let mut state = make_state();
        assert!(!state.turn_started);

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: None,
            usage: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        let has_turn_completed = msgs.iter().any(|m| m["method"] == "turn/completed");
        assert!(!has_turn_completed);
    }

    #[test]
    fn result_without_cost_skips_rate_limits() {
        let mut state = make_state();
        state.turn_started = true;

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: None,
            usage: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        let has_rate_limits = msgs.iter().any(|m| m["method"] == "account/rateLimits/updated");
        assert!(!has_rate_limits);
    }

    #[test]
    fn result_without_text_skips_thread_name() {
        let mut state = make_state();
        state.turn_started = true;
        assert!(state.accumulated_text.is_empty());

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: None,
            usage: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        let has_name = msgs.iter().any(|m| m["method"] == "thread/name/updated");
        assert!(!has_name);
    }

    #[test]
    fn result_thread_name_truncated_to_38_chars() {
        let mut state = make_state();
        state.turn_started = true;
        state.accumulated_text = "A".repeat(100);

        let event = ClaudeEvent::Result(ResultEvent {
            subtype: None, result: None, error: None,
            duration_ms: None, duration_api_ms: None, num_turns: None,
            is_error: false, session_id: None, cost_usd: None,
            usage: None,
            extra: Default::default(),
        });
        let msgs = map_event(&event, &mut state);
        let name_msg = msgs.iter().find(|m| m["method"] == "thread/name/updated").unwrap();
        let name = name_msg["params"]["name"].as_str().unwrap();
        assert_eq!(name.len(), 38);
    }

    #[test]
    fn multiple_content_blocks_tracked_independently() {
        let mut state = make_state();
        state.turn_started = true;

        // Start text block at index 0
        let start0 = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::Text { text: String::new() }),
        });
        let msgs0 = map_event(&start0, &mut state);
        let item_0 = msgs0[0]["params"]["item"]["id"].as_str().unwrap().to_string();

        // Start thinking block at index 1
        let start1 = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 1,
            content_block: Some(ContentBlock::Thinking { thinking: String::new() }),
        });
        let msgs1 = map_event(&start1, &mut state);
        let item_1 = msgs1[0]["params"]["item"]["id"].as_str().unwrap().to_string();

        assert_ne!(item_0, item_1);

        // Delta for index 0 → uses item_0
        let delta0 = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 0,
            delta: Some(ContentBlockDelta::TextDelta { text: "text".to_string() }),
        });
        let msgs = map_event(&delta0, &mut state);
        assert_eq!(msgs[0]["params"]["itemId"], item_0);

        // Delta for index 1 → uses item_1
        let delta1 = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
            index: 1,
            delta: Some(ContentBlockDelta::ThinkingDelta { thinking: "think".to_string() }),
        });
        let msgs = map_event(&delta1, &mut state);
        assert_eq!(msgs[0]["params"]["itemId"], item_1);
    }

    #[test]
    fn text_deltas_accumulate_in_state() {
        let mut state = make_state();
        state.turn_started = true;

        // Start text block
        let start = ClaudeEvent::ContentBlockStart(ContentBlockEvent {
            index: 0,
            content_block: Some(ContentBlock::Text { text: String::new() }),
        });
        map_event(&start, &mut state);

        // Send multiple deltas
        for word in &["Hello", " ", "world", "!"] {
            let delta = ClaudeEvent::ContentBlockDelta(ContentBlockDeltaEvent {
                index: 0,
                delta: Some(ContentBlockDelta::TextDelta { text: word.to_string() }),
            });
            map_event(&delta, &mut state);
        }

        assert_eq!(state.accumulated_text, "Hello world!");
    }

    #[test]
    fn message_delta_without_usage_produces_nothing() {
        let mut state = make_state();
        let event = ClaudeEvent::MessageDelta(MessageDeltaEvent {
            delta: Some(serde_json::json!({"stop_reason": "end_turn"})),
            usage: None,
        });
        let msgs = map_event(&event, &mut state);
        assert!(msgs.is_empty());
    }
}
