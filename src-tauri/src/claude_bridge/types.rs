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
