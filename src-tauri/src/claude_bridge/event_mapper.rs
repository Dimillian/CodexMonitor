use serde_json::{json, Value};

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
        ContentBlock::ToolUse { id, name, input } => {
            let item_id = state.next_item();
            state.block_items.insert(cb.index, item_id.clone());
            out.push(json!({
                "method": "item/started",
                "params": {
                    "threadId": state.thread_id,
                    "turnId": state.turn_id,
                    "item": {
                        "id": item_id,
                        "type": "commandExecution",
                        "status": "in_progress",
                        "toolUseId": id,
                        "toolName": name,
                        "input": input
                    }
                }
            }));
        }
        _ => {}
    }

    out
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

fn map_message_delta(
    md: &super::types::MessageDeltaEvent,
    state: &mut BridgeState,
) -> Vec<Value> {
    let mut out = Vec::new();
    if let Some(ref usage) = md.usage {
        out.push(json!({
            "method": "thread/tokenUsage/updated",
            "params": {
                "threadId": state.thread_id,
                "usage": {
                    "inputTokens": usage.input_tokens,
                    "outputTokens": usage.output_tokens,
                    "cacheCreationInputTokens": usage.cache_creation_input_tokens,
                    "cacheReadInputTokens": usage.cache_read_input_tokens,
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

    // Emit token usage if available
    if let Some(ref usage) = res.usage {
        out.push(json!({
            "method": "thread/tokenUsage/updated",
            "params": {
                "threadId": state.thread_id,
                "usage": {
                    "inputTokens": usage.input_tokens,
                    "outputTokens": usage.output_tokens,
                    "cacheCreationInputTokens": usage.cache_creation_input_tokens,
                    "cacheReadInputTokens": usage.cache_read_input_tokens,
                }
            }
        }));
    }

    // Emit turn/completed
    if state.turn_started {
        out.push(json!({
            "method": "turn/completed",
            "params": {
                "threadId": state.thread_id,
                "turnId": state.turn_id,
                "status": if res.is_error { "error" } else { "completed" }
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
}
