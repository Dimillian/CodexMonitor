use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::item_tracker::ItemInfo;

/// Represents a single event from Claude CLI's `--output-format stream-json` output.
/// Each line of stdout is one JSON object with a `type` field.
#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum ClaudeEvent {
    /// System initialization event, emitted once at startup.
    #[serde(rename = "system")]
    System(SystemEvent),

    /// Assistant text streaming delta.
    #[serde(rename = "assistant")]
    Assistant(AssistantEvent),

    /// Content block start/delta/stop within a message.
    #[serde(rename = "content_block_start")]
    ContentBlockStart(ContentBlockEvent),
    #[serde(rename = "content_block_delta")]
    ContentBlockDelta(ContentBlockDeltaEvent),
    #[serde(rename = "content_block_stop")]
    ContentBlockStop(ContentBlockStopEvent),

    /// Message start/delta/stop events.
    #[serde(rename = "message_start")]
    MessageStart(MessageStartEvent),
    #[serde(rename = "message_delta")]
    MessageDelta(MessageDeltaEvent),
    #[serde(rename = "message_stop")]
    MessageStop(MessageStopEvent),

    /// Result event emitted when a turn completes.
    #[serde(rename = "result")]
    Result(ResultEvent),

    /// Unknown/unhandled event type - captured as raw JSON.
    #[serde(other)]
    Unknown,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct SystemEvent {
    #[serde(default)]
    pub(crate) subtype: Option<String>,
    #[serde(default)]
    pub(crate) session_id: Option<String>,
    #[serde(default)]
    pub(crate) tools: Option<Vec<Value>>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    /// Catch-all for extra fields.
    #[serde(flatten)]
    pub(crate) extra: std::collections::HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct AssistantEvent {
    #[serde(default)]
    pub(crate) subtype: Option<String>,
    #[serde(default)]
    pub(crate) message: Option<Value>,
    #[serde(default)]
    pub(crate) content_block: Option<Value>,
    #[serde(flatten)]
    pub(crate) extra: std::collections::HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ContentBlockEvent {
    #[serde(default)]
    pub(crate) index: u64,
    #[serde(default)]
    pub(crate) content_block: Option<ContentBlock>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ContentBlockDeltaEvent {
    #[serde(default)]
    pub(crate) index: u64,
    #[serde(default)]
    pub(crate) delta: Option<ContentBlockDelta>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ContentBlockStopEvent {
    #[serde(default)]
    pub(crate) index: u64,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum ContentBlock {
    #[serde(rename = "text")]
    Text {
        #[serde(default)]
        text: String,
    },
    #[serde(rename = "thinking")]
    Thinking {
        #[serde(default)]
        thinking: String,
    },
    #[serde(rename = "tool_use")]
    ToolUse {
        id: String,
        name: String,
        #[serde(default)]
        input: Value,
    },
    #[serde(rename = "tool_result")]
    ToolResult {
        #[serde(default)]
        tool_use_id: Option<String>,
        #[serde(default)]
        content: Option<Value>,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(tag = "type")]
pub(crate) enum ContentBlockDelta {
    #[serde(rename = "text_delta")]
    TextDelta {
        #[serde(default)]
        text: String,
    },
    #[serde(rename = "thinking_delta")]
    ThinkingDelta {
        #[serde(default)]
        thinking: String,
    },
    #[serde(rename = "input_json_delta")]
    InputJsonDelta {
        #[serde(default)]
        partial_json: String,
    },
    #[serde(other)]
    Other,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MessageStartEvent {
    #[serde(default)]
    pub(crate) message: Option<MessageInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MessageInfo {
    #[serde(default)]
    pub(crate) id: Option<String>,
    #[serde(default)]
    pub(crate) role: Option<String>,
    #[serde(default)]
    pub(crate) model: Option<String>,
    #[serde(default)]
    pub(crate) usage: Option<UsageInfo>,
}

#[derive(Debug, Clone, Deserialize, Serialize)]
pub(crate) struct UsageInfo {
    #[serde(default)]
    pub(crate) input_tokens: u64,
    #[serde(default)]
    pub(crate) output_tokens: u64,
    #[serde(default)]
    pub(crate) cache_creation_input_tokens: Option<u64>,
    #[serde(default)]
    pub(crate) cache_read_input_tokens: Option<u64>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MessageDeltaEvent {
    #[serde(default)]
    pub(crate) delta: Option<Value>,
    #[serde(default)]
    pub(crate) usage: Option<UsageInfo>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct MessageStopEvent {
    #[serde(flatten)]
    pub(crate) extra: std::collections::HashMap<String, Value>,
}

#[derive(Debug, Clone, Deserialize)]
pub(crate) struct ResultEvent {
    #[serde(default)]
    pub(crate) subtype: Option<String>,
    #[serde(default)]
    pub(crate) result: Option<Value>,
    #[serde(default)]
    pub(crate) error: Option<String>,
    #[serde(default)]
    pub(crate) duration_ms: Option<u64>,
    #[serde(default)]
    pub(crate) duration_api_ms: Option<u64>,
    #[serde(default)]
    pub(crate) num_turns: Option<u64>,
    #[serde(default)]
    pub(crate) is_error: bool,
    #[serde(default)]
    pub(crate) session_id: Option<String>,
    #[serde(default)]
    pub(crate) cost_usd: Option<f64>,
    #[serde(default)]
    pub(crate) usage: Option<UsageInfo>,
    #[serde(flatten)]
    pub(crate) extra: std::collections::HashMap<String, Value>,
}

/// State tracked across the lifetime of a Claude CLI session to correlate
/// events and generate consistent Codex-compatible IDs.
pub(crate) struct BridgeState {
    pub(crate) thread_id: String,
    pub(crate) turn_id: String,
    pub(crate) workspace_id: String,
    /// Counter for generating unique item IDs.
    pub(crate) next_item_id: u64,
    /// Maps content block index to the item ID assigned for that block.
    pub(crate) block_items: std::collections::HashMap<u64, String>,
    /// Accumulated text from assistant text blocks (for thread naming).
    pub(crate) accumulated_text: String,
    /// Whether `thread/started` has been emitted.
    pub(crate) thread_started: bool,
    /// Whether `turn/started` has been emitted for the current turn.
    pub(crate) turn_started: bool,
    /// Model ID reported by Claude.
    pub(crate) model: Option<String>,
    /// Maps tool_use_id → ItemInfo for correlating tool results back to items.
    pub(crate) tool_items: std::collections::HashMap<String, ItemInfo>,
    /// Maps content block index → tool_use_id (to find ItemInfo from content block events).
    pub(crate) block_tool_use_ids: std::collections::HashMap<u64, String>,
    /// Cumulative input tokens across all turns.
    pub(crate) total_input_tokens: u64,
    /// Cumulative output tokens across all turns.
    pub(crate) total_output_tokens: u64,
    /// Cumulative cost in USD across all turns.
    pub(crate) total_cost_usd: f64,
}

impl BridgeState {
    pub(crate) fn new(workspace_id: String, thread_id: String) -> Self {
        let turn_id = format!("turn_{}", uuid::Uuid::new_v4());
        Self {
            thread_id,
            turn_id,
            workspace_id,
            next_item_id: 1,
            block_items: std::collections::HashMap::new(),
            accumulated_text: String::new(),
            thread_started: false,
            turn_started: false,
            model: None,
            tool_items: std::collections::HashMap::new(),
            block_tool_use_ids: std::collections::HashMap::new(),
            total_input_tokens: 0,
            total_output_tokens: 0,
            total_cost_usd: 0.0,
        }
    }

    pub(crate) fn next_item(&mut self) -> String {
        let id = format!("item_{}", self.next_item_id);
        self.next_item_id += 1;
        id
    }

    pub(crate) fn new_turn(&mut self) {
        self.turn_id = format!("turn_{}", uuid::Uuid::new_v4());
        self.turn_started = false;
        self.block_items.clear();
        self.tool_items.clear();
        self.block_tool_use_ids.clear();
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::claude_bridge::item_tracker::ToolCategory;
    use serde_json::json;

    // ── ClaudeEvent deserialization ────────────────────────────────

    #[test]
    fn deserialize_system_event() {
        let json_str = r#"{"type":"system","subtype":"init","session_id":"sess_abc","model":"claude-sonnet-4-20250514","tools":[{"name":"bash"}]}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::System(sys) => {
                assert_eq!(sys.subtype.as_deref(), Some("init"));
                assert_eq!(sys.session_id.as_deref(), Some("sess_abc"));
                assert_eq!(sys.model.as_deref(), Some("claude-sonnet-4-20250514"));
                assert_eq!(sys.tools.as_ref().unwrap().len(), 1);
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn deserialize_system_event_minimal() {
        let json_str = r#"{"type":"system"}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::System(sys) => {
                assert!(sys.subtype.is_none());
                assert!(sys.session_id.is_none());
                assert!(sys.model.is_none());
                assert!(sys.tools.is_none());
            }
            _ => panic!("Expected System event"),
        }
    }

    #[test]
    fn deserialize_assistant_event() {
        let json_str = r#"{"type":"assistant","subtype":"text","message":"Hello"}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::Assistant(a) => {
                assert_eq!(a.subtype.as_deref(), Some("text"));
                assert_eq!(a.message, Some(json!("Hello")));
            }
            _ => panic!("Expected Assistant event"),
        }
    }

    #[test]
    fn deserialize_content_block_start_text() {
        let json_str = r#"{"type":"content_block_start","index":0,"content_block":{"type":"text","text":""}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockStart(cb) => {
                assert_eq!(cb.index, 0);
                assert!(matches!(cb.content_block, Some(ContentBlock::Text { .. })));
            }
            _ => panic!("Expected ContentBlockStart"),
        }
    }

    #[test]
    fn deserialize_content_block_start_thinking() {
        let json_str = r#"{"type":"content_block_start","index":1,"content_block":{"type":"thinking","thinking":""}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockStart(cb) => {
                assert_eq!(cb.index, 1);
                assert!(matches!(cb.content_block, Some(ContentBlock::Thinking { .. })));
            }
            _ => panic!("Expected ContentBlockStart"),
        }
    }

    #[test]
    fn deserialize_content_block_start_tool_use() {
        let json_str = r#"{"type":"content_block_start","index":0,"content_block":{"type":"tool_use","id":"toolu_123","name":"bash","input":{}}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockStart(cb) => {
                match cb.content_block.unwrap() {
                    ContentBlock::ToolUse { id, name, .. } => {
                        assert_eq!(id, "toolu_123");
                        assert_eq!(name, "bash");
                    }
                    _ => panic!("Expected ToolUse"),
                }
            }
            _ => panic!("Expected ContentBlockStart"),
        }
    }

    #[test]
    fn deserialize_content_block_start_tool_result() {
        let json_str = r#"{"type":"content_block_start","index":1,"content_block":{"type":"tool_result","tool_use_id":"toolu_123","content":"output text"}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockStart(cb) => {
                match cb.content_block.unwrap() {
                    ContentBlock::ToolResult { tool_use_id, content } => {
                        assert_eq!(tool_use_id.as_deref(), Some("toolu_123"));
                        assert_eq!(content, Some(json!("output text")));
                    }
                    _ => panic!("Expected ToolResult"),
                }
            }
            _ => panic!("Expected ContentBlockStart"),
        }
    }

    #[test]
    fn deserialize_content_block_delta_text() {
        let json_str = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"Hello"}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockDelta(cbd) => {
                assert_eq!(cbd.index, 0);
                match cbd.delta.unwrap() {
                    ContentBlockDelta::TextDelta { text } => assert_eq!(text, "Hello"),
                    _ => panic!("Expected TextDelta"),
                }
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_content_block_delta_thinking() {
        let json_str = r#"{"type":"content_block_delta","index":1,"delta":{"type":"thinking_delta","thinking":"Let me think"}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockDelta(cbd) => {
                match cbd.delta.unwrap() {
                    ContentBlockDelta::ThinkingDelta { thinking } => {
                        assert_eq!(thinking, "Let me think");
                    }
                    _ => panic!("Expected ThinkingDelta"),
                }
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_content_block_delta_input_json() {
        let json_str = r#"{"type":"content_block_delta","index":0,"delta":{"type":"input_json_delta","partial_json":"{\"command\":\"ls\"}"}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockDelta(cbd) => {
                match cbd.delta.unwrap() {
                    ContentBlockDelta::InputJsonDelta { partial_json } => {
                        assert_eq!(partial_json, r#"{"command":"ls"}"#);
                    }
                    _ => panic!("Expected InputJsonDelta"),
                }
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_content_block_stop() {
        let json_str = r#"{"type":"content_block_stop","index":2}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockStop(cbs) => assert_eq!(cbs.index, 2),
            _ => panic!("Expected ContentBlockStop"),
        }
    }

    #[test]
    fn deserialize_message_start() {
        let json_str = r#"{"type":"message_start","message":{"id":"msg_abc","role":"assistant","model":"claude-sonnet-4-20250514","usage":{"input_tokens":100,"output_tokens":0}}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::MessageStart(ms) => {
                let info = ms.message.unwrap();
                assert_eq!(info.id.as_deref(), Some("msg_abc"));
                assert_eq!(info.role.as_deref(), Some("assistant"));
                assert_eq!(info.model.as_deref(), Some("claude-sonnet-4-20250514"));
                let usage = info.usage.unwrap();
                assert_eq!(usage.input_tokens, 100);
                assert_eq!(usage.output_tokens, 0);
            }
            _ => panic!("Expected MessageStart"),
        }
    }

    #[test]
    fn deserialize_message_delta() {
        let json_str = r#"{"type":"message_delta","delta":{"stop_reason":"end_turn"},"usage":{"input_tokens":0,"output_tokens":50}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::MessageDelta(md) => {
                assert!(md.delta.is_some());
                let usage = md.usage.unwrap();
                assert_eq!(usage.output_tokens, 50);
            }
            _ => panic!("Expected MessageDelta"),
        }
    }

    #[test]
    fn deserialize_message_stop() {
        let json_str = r#"{"type":"message_stop"}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        assert!(matches!(event, ClaudeEvent::MessageStop(_)));
    }

    #[test]
    fn deserialize_result_event() {
        let json_str = r#"{"type":"result","subtype":"success","is_error":false,"duration_ms":1500,"duration_api_ms":1200,"num_turns":1,"session_id":"sess_xyz","cost_usd":0.015,"usage":{"input_tokens":200,"output_tokens":100,"cache_creation_input_tokens":10,"cache_read_input_tokens":5}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::Result(res) => {
                assert_eq!(res.subtype.as_deref(), Some("success"));
                assert!(!res.is_error);
                assert_eq!(res.duration_ms, Some(1500));
                assert_eq!(res.duration_api_ms, Some(1200));
                assert_eq!(res.num_turns, Some(1));
                assert_eq!(res.session_id.as_deref(), Some("sess_xyz"));
                assert!((res.cost_usd.unwrap() - 0.015).abs() < f64::EPSILON);
                let usage = res.usage.unwrap();
                assert_eq!(usage.input_tokens, 200);
                assert_eq!(usage.output_tokens, 100);
                assert_eq!(usage.cache_creation_input_tokens, Some(10));
                assert_eq!(usage.cache_read_input_tokens, Some(5));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn deserialize_result_error() {
        let json_str = r#"{"type":"result","is_error":true,"error":"API rate limited"}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::Result(res) => {
                assert!(res.is_error);
                assert_eq!(res.error.as_deref(), Some("API rate limited"));
            }
            _ => panic!("Expected Result event"),
        }
    }

    #[test]
    fn deserialize_unknown_event_type() {
        let json_str = r#"{"type":"ping","timestamp":12345}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        assert!(matches!(event, ClaudeEvent::Unknown));
    }

    #[test]
    fn deserialize_content_block_with_unknown_type() {
        let json_str = r#"{"type":"content_block_start","index":0,"content_block":{"type":"image","data":"base64..."}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockStart(cb) => {
                assert!(matches!(cb.content_block, Some(ContentBlock::Other)));
            }
            _ => panic!("Expected ContentBlockStart"),
        }
    }

    #[test]
    fn deserialize_content_block_delta_unknown_type() {
        let json_str = r#"{"type":"content_block_delta","index":0,"delta":{"type":"something_new","data":"..."}}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::ContentBlockDelta(cbd) => {
                assert!(matches!(cbd.delta, Some(ContentBlockDelta::Other)));
            }
            _ => panic!("Expected ContentBlockDelta"),
        }
    }

    #[test]
    fn deserialize_system_event_with_extra_fields() {
        let json_str = r#"{"type":"system","model":"claude-sonnet-4-20250514","custom_field":"custom_value","another":42}"#;
        let event: ClaudeEvent = serde_json::from_str(json_str).unwrap();
        match event {
            ClaudeEvent::System(sys) => {
                assert_eq!(sys.extra.get("custom_field").and_then(|v| v.as_str()), Some("custom_value"));
                assert_eq!(sys.extra.get("another").and_then(|v| v.as_u64()), Some(42));
            }
            _ => panic!("Expected System event"),
        }
    }

    // ── UsageInfo ─────────────────────────────────────────────────

    #[test]
    fn usage_info_defaults_to_zero() {
        let json_str = r#"{}"#;
        let usage: UsageInfo = serde_json::from_str(json_str).unwrap();
        assert_eq!(usage.input_tokens, 0);
        assert_eq!(usage.output_tokens, 0);
        assert!(usage.cache_creation_input_tokens.is_none());
        assert!(usage.cache_read_input_tokens.is_none());
    }

    #[test]
    fn usage_info_serializes_correctly() {
        let usage = UsageInfo {
            input_tokens: 100,
            output_tokens: 50,
            cache_creation_input_tokens: Some(10),
            cache_read_input_tokens: None,
        };
        let val = serde_json::to_value(&usage).unwrap();
        assert_eq!(val["input_tokens"], 100);
        assert_eq!(val["output_tokens"], 50);
        assert_eq!(val["cache_creation_input_tokens"], 10);
        assert!(val["cache_read_input_tokens"].is_null());
    }

    // ── BridgeState ───────────────────────────────────────────────

    #[test]
    fn bridge_state_new_initializes_correctly() {
        let state = BridgeState::new("ws_1".to_string(), "thread_1".to_string());
        assert_eq!(state.workspace_id, "ws_1");
        assert_eq!(state.thread_id, "thread_1");
        assert!(state.turn_id.starts_with("turn_"));
        assert_eq!(state.next_item_id, 1);
        assert!(state.block_items.is_empty());
        assert!(state.accumulated_text.is_empty());
        assert!(!state.thread_started);
        assert!(!state.turn_started);
        assert!(state.model.is_none());
        assert!(state.tool_items.is_empty());
        assert!(state.block_tool_use_ids.is_empty());
        assert_eq!(state.total_input_tokens, 0);
        assert_eq!(state.total_output_tokens, 0);
        assert!((state.total_cost_usd - 0.0).abs() < f64::EPSILON);
    }

    #[test]
    fn bridge_state_next_item_increments() {
        let mut state = BridgeState::new("ws".to_string(), "t".to_string());
        assert_eq!(state.next_item(), "item_1");
        assert_eq!(state.next_item(), "item_2");
        assert_eq!(state.next_item(), "item_3");
        assert_eq!(state.next_item_id, 4);
    }

    #[test]
    fn bridge_state_new_turn_resets_per_turn_state() {
        let mut state = BridgeState::new("ws".to_string(), "t".to_string());
        let original_turn_id = state.turn_id.clone();
        state.turn_started = true;
        state.block_items.insert(0, "item_1".to_string());
        state.tool_items.insert("toolu_1".to_string(), super::ItemInfo {
            item_id: "item_1".to_string(),
            tool_use_id: "toolu_1".to_string(),
            tool_name: "bash".to_string(),
            category: ToolCategory::CommandExecution,
            accumulated_input_json: String::new(),
            aggregated_output: String::new(),
        });
        state.block_tool_use_ids.insert(0, "toolu_1".to_string());

        state.new_turn();

        assert_ne!(state.turn_id, original_turn_id);
        assert!(state.turn_id.starts_with("turn_"));
        assert!(!state.turn_started);
        assert!(state.block_items.is_empty());
        assert!(state.tool_items.is_empty());
        assert!(state.block_tool_use_ids.is_empty());
    }

    #[test]
    fn bridge_state_new_turn_preserves_cumulative_state() {
        let mut state = BridgeState::new("ws".to_string(), "t".to_string());
        state.total_input_tokens = 100;
        state.total_output_tokens = 50;
        state.total_cost_usd = 0.05;
        state.accumulated_text = "some text".to_string();
        state.model = Some("claude-sonnet-4-20250514".to_string());
        state.thread_started = true;
        // next_item_id should persist across turns
        let _ = state.next_item(); // item_1
        let _ = state.next_item(); // item_2

        state.new_turn();

        assert_eq!(state.total_input_tokens, 100);
        assert_eq!(state.total_output_tokens, 50);
        assert!((state.total_cost_usd - 0.05).abs() < f64::EPSILON);
        assert_eq!(state.accumulated_text, "some text");
        assert_eq!(state.model.as_deref(), Some("claude-sonnet-4-20250514"));
        assert!(state.thread_started);
        assert_eq!(state.next_item_id, 3); // preserved
    }
}
