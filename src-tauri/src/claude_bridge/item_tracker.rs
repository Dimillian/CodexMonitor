use serde_json::{json, Value};

/// Classification of Claude CLI tool names into Codex item types.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum ToolCategory {
    /// bash, execute_command, shell, run_command → commandExecution
    CommandExecution,
    /// write_file, edit_file, str_replace_editor, create_file, Write, Edit → fileChange
    FileChange,
    /// read_file, Read, Glob, Grep → commandExecution (read-only)
    FileRead,
    /// Unknown tools → commandExecution
    Other,
}

impl ToolCategory {
    /// The Codex item `type` string for this category.
    pub(crate) fn item_type(&self) -> &'static str {
        match self {
            ToolCategory::FileChange => "fileChange",
            _ => "commandExecution",
        }
    }
}

/// Classify a Claude CLI tool name into a category.
pub(crate) fn classify_tool(name: &str) -> ToolCategory {
    match name {
        "bash" | "execute_command" | "shell" | "run_command" | "Bash" => {
            ToolCategory::CommandExecution
        }
        "write_file" | "edit_file" | "str_replace_editor" | "create_file" | "Write" | "Edit"
        | "NotebookEdit" => ToolCategory::FileChange,
        "read_file" | "Read" | "Glob" | "Grep" | "WebFetch" | "WebSearch" => {
            ToolCategory::FileRead
        }
        _ => ToolCategory::Other,
    }
}

/// Tracks the state of a single tool-use item throughout its lifecycle.
#[derive(Debug, Clone)]
pub(crate) struct ItemInfo {
    pub(crate) item_id: String,
    pub(crate) tool_use_id: String,
    pub(crate) tool_name: String,
    pub(crate) category: ToolCategory,
    /// Accumulated partial JSON from `input_json_delta` events.
    pub(crate) accumulated_input_json: String,
    /// Accumulated output from tool result.
    pub(crate) aggregated_output: String,
}

/// Extract a command string from the parsed tool input JSON.
///
/// Works for bash/execute_command tools where `input.command` holds the command.
pub(crate) fn extract_command(tool_name: &str, input: &Value) -> Option<String> {
    match tool_name {
        "bash" | "Bash" | "execute_command" | "shell" | "run_command" => input
            .get("command")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    }
}

/// Extract a file path from the parsed tool input JSON.
///
/// Works for file-change tools where `input.path` or `input.file_path` holds the path.
pub(crate) fn extract_file_path(tool_name: &str, input: &Value) -> Option<String> {
    match tool_name {
        "write_file" | "edit_file" | "str_replace_editor" | "create_file" | "Write" | "Edit"
        | "read_file" | "Read" | "NotebookEdit" => input
            .get("path")
            .or_else(|| input.get("file_path"))
            .and_then(|v| v.as_str())
            .map(|s| s.to_string()),
        _ => None,
    }
}

/// Extract a file-change kind from the tool name.
pub(crate) fn infer_change_kind(tool_name: &str) -> &'static str {
    match tool_name {
        "create_file" | "Write" | "write_file" => "add",
        "edit_file" | "Edit" | "str_replace_editor" | "NotebookEdit" => "modify",
        _ => "modify",
    }
}

/// Build the `item` object for an `item/started` event.
pub(crate) fn build_item_started(
    info: &ItemInfo,
    thread_id: &str,
    turn_id: &str,
) -> Value {
    let item_type = info.category.item_type();
    let mut item = json!({
        "id": info.item_id,
        "type": item_type,
        "status": "in_progress",
        "toolName": info.tool_name,
        "toolUseId": info.tool_use_id,
    });

    if item_type == "commandExecution" {
        item["command"] = json!("");
        item["cwd"] = json!("");
        item["aggregatedOutput"] = json!("");
    }

    json!({
        "method": "item/started",
        "params": {
            "threadId": thread_id,
            "turnId": turn_id,
            "item": item,
        }
    })
}

/// Build the enriched `item/completed` event, extracting display fields
/// from the accumulated input JSON.
pub(crate) fn build_item_completed(
    info: &ItemInfo,
    thread_id: &str,
    turn_id: &str,
) -> Value {
    let parsed_input: Value = serde_json::from_str(&info.accumulated_input_json)
        .unwrap_or(Value::Null);

    let mut params = json!({
        "threadId": thread_id,
        "turnId": turn_id,
        "itemId": info.item_id,
        "status": "completed",
    });

    match info.category {
        ToolCategory::CommandExecution | ToolCategory::FileRead | ToolCategory::Other => {
            if let Some(cmd) = extract_command(&info.tool_name, &parsed_input) {
                params["command"] = json!(cmd);
            }
            if !info.aggregated_output.is_empty() {
                params["aggregatedOutput"] = json!(info.aggregated_output);
            }
        }
        ToolCategory::FileChange => {
            let path = extract_file_path(&info.tool_name, &parsed_input)
                .unwrap_or_default();
            let kind = infer_change_kind(&info.tool_name);

            let mut change = json!({
                "path": path,
                "kind": kind,
            });
            if !info.aggregated_output.is_empty() {
                change["diff"] = json!(info.aggregated_output);
            }
            params["changes"] = json!([change]);
        }
    }

    json!({
        "method": "item/completed",
        "params": params,
    })
}

/// Build an output delta event for streaming tool output.
pub(crate) fn build_output_delta(
    info: &ItemInfo,
    thread_id: &str,
    turn_id: &str,
    delta: &str,
) -> Value {
    let method = match info.category {
        ToolCategory::FileChange => "item/fileChange/outputDelta",
        _ => "item/commandExecution/outputDelta",
    };
    json!({
        "method": method,
        "params": {
            "threadId": thread_id,
            "turnId": turn_id,
            "itemId": info.item_id,
            "delta": delta,
        }
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── classify_tool ────────────────────────────────────────────

    #[test]
    fn classify_bash_as_command_execution() {
        assert_eq!(classify_tool("bash"), ToolCategory::CommandExecution);
        assert_eq!(classify_tool("Bash"), ToolCategory::CommandExecution);
        assert_eq!(
            classify_tool("execute_command"),
            ToolCategory::CommandExecution
        );
        assert_eq!(classify_tool("shell"), ToolCategory::CommandExecution);
        assert_eq!(classify_tool("run_command"), ToolCategory::CommandExecution);
    }

    #[test]
    fn classify_file_change_tools() {
        assert_eq!(classify_tool("write_file"), ToolCategory::FileChange);
        assert_eq!(classify_tool("edit_file"), ToolCategory::FileChange);
        assert_eq!(
            classify_tool("str_replace_editor"),
            ToolCategory::FileChange
        );
        assert_eq!(classify_tool("create_file"), ToolCategory::FileChange);
        assert_eq!(classify_tool("Write"), ToolCategory::FileChange);
        assert_eq!(classify_tool("Edit"), ToolCategory::FileChange);
        assert_eq!(classify_tool("NotebookEdit"), ToolCategory::FileChange);
    }

    #[test]
    fn classify_file_read_tools() {
        assert_eq!(classify_tool("read_file"), ToolCategory::FileRead);
        assert_eq!(classify_tool("Read"), ToolCategory::FileRead);
        assert_eq!(classify_tool("Glob"), ToolCategory::FileRead);
        assert_eq!(classify_tool("Grep"), ToolCategory::FileRead);
        assert_eq!(classify_tool("WebFetch"), ToolCategory::FileRead);
    }

    #[test]
    fn classify_unknown_as_other() {
        assert_eq!(classify_tool("my_custom_tool"), ToolCategory::Other);
        assert_eq!(classify_tool("mcp__slack__send"), ToolCategory::Other);
    }

    #[test]
    fn item_type_for_categories() {
        assert_eq!(ToolCategory::CommandExecution.item_type(), "commandExecution");
        assert_eq!(ToolCategory::FileChange.item_type(), "fileChange");
        assert_eq!(ToolCategory::FileRead.item_type(), "commandExecution");
        assert_eq!(ToolCategory::Other.item_type(), "commandExecution");
    }

    // ── extract_command ──────────────────────────────────────────

    #[test]
    fn extract_command_from_bash_input() {
        let input = json!({"command": "ls -la /tmp"});
        assert_eq!(
            extract_command("bash", &input),
            Some("ls -la /tmp".to_string())
        );
    }

    #[test]
    fn extract_command_from_execute_command_input() {
        let input = json!({"command": "cargo build"});
        assert_eq!(
            extract_command("execute_command", &input),
            Some("cargo build".to_string())
        );
    }

    #[test]
    fn extract_command_returns_none_for_non_command_tool() {
        let input = json!({"command": "something"});
        assert_eq!(extract_command("write_file", &input), None);
    }

    #[test]
    fn extract_command_returns_none_when_field_missing() {
        let input = json!({"other": "value"});
        assert_eq!(extract_command("bash", &input), None);
    }

    // ── extract_file_path ────────────────────────────────────────

    #[test]
    fn extract_file_path_from_write_file() {
        let input = json!({"path": "/src/main.rs", "content": "fn main() {}"});
        assert_eq!(
            extract_file_path("write_file", &input),
            Some("/src/main.rs".to_string())
        );
    }

    #[test]
    fn extract_file_path_from_edit_file_with_file_path_key() {
        let input = json!({"file_path": "/src/lib.rs"});
        assert_eq!(
            extract_file_path("edit_file", &input),
            Some("/src/lib.rs".to_string())
        );
    }

    #[test]
    fn extract_file_path_returns_none_for_bash() {
        let input = json!({"path": "/tmp"});
        assert_eq!(extract_file_path("bash", &input), None);
    }

    // ── infer_change_kind ────────────────────────────────────────

    #[test]
    fn infer_kind_for_file_tools() {
        assert_eq!(infer_change_kind("create_file"), "add");
        assert_eq!(infer_change_kind("Write"), "add");
        assert_eq!(infer_change_kind("write_file"), "add");
        assert_eq!(infer_change_kind("edit_file"), "modify");
        assert_eq!(infer_change_kind("Edit"), "modify");
        assert_eq!(infer_change_kind("str_replace_editor"), "modify");
    }

    // ── build_item_started ───────────────────────────────────────

    #[test]
    fn build_item_started_command_execution() {
        let info = ItemInfo {
            item_id: "item_1".into(),
            tool_use_id: "toolu_abc".into(),
            tool_name: "bash".into(),
            category: ToolCategory::CommandExecution,
            accumulated_input_json: String::new(),
            aggregated_output: String::new(),
        };
        let event = build_item_started(&info, "thread_1", "turn_1");
        assert_eq!(event["method"], "item/started");
        let item = &event["params"]["item"];
        assert_eq!(item["type"], "commandExecution");
        assert_eq!(item["id"], "item_1");
        assert_eq!(item["status"], "in_progress");
        assert_eq!(item["toolName"], "bash");
        assert_eq!(item["toolUseId"], "toolu_abc");
        assert_eq!(item["command"], "");
        assert_eq!(item["cwd"], "");
    }

    #[test]
    fn build_item_started_file_change() {
        let info = ItemInfo {
            item_id: "item_2".into(),
            tool_use_id: "toolu_xyz".into(),
            tool_name: "write_file".into(),
            category: ToolCategory::FileChange,
            accumulated_input_json: String::new(),
            aggregated_output: String::new(),
        };
        let event = build_item_started(&info, "thread_1", "turn_1");
        let item = &event["params"]["item"];
        assert_eq!(item["type"], "fileChange");
        assert_eq!(item["toolName"], "write_file");
        // fileChange items don't have command/cwd fields
        assert!(item.get("command").is_none());
    }

    // ── build_item_completed ─────────────────────────────────────

    #[test]
    fn build_item_completed_command_with_output() {
        let info = ItemInfo {
            item_id: "item_3".into(),
            tool_use_id: "toolu_123".into(),
            tool_name: "bash".into(),
            category: ToolCategory::CommandExecution,
            accumulated_input_json: r#"{"command": "ls -la"}"#.into(),
            aggregated_output: "total 8\ndrwxr-xr-x 2 user user 4096 Jan 1 00:00 .\n".into(),
        };
        let event = build_item_completed(&info, "thread_1", "turn_1");
        assert_eq!(event["method"], "item/completed");
        let params = &event["params"];
        assert_eq!(params["itemId"], "item_3");
        assert_eq!(params["status"], "completed");
        assert_eq!(params["command"], "ls -la");
        assert!(params["aggregatedOutput"].as_str().unwrap().contains("total 8"));
    }

    #[test]
    fn build_item_completed_file_change_with_path() {
        let info = ItemInfo {
            item_id: "item_4".into(),
            tool_use_id: "toolu_456".into(),
            tool_name: "write_file".into(),
            category: ToolCategory::FileChange,
            accumulated_input_json: r#"{"path": "src/main.rs", "content": "fn main() {}"}"#.into(),
            aggregated_output: String::new(),
        };
        let event = build_item_completed(&info, "thread_1", "turn_1");
        let params = &event["params"];
        assert_eq!(params["status"], "completed");
        let changes = params["changes"].as_array().unwrap();
        assert_eq!(changes.len(), 1);
        assert_eq!(changes[0]["path"], "src/main.rs");
        assert_eq!(changes[0]["kind"], "add");
    }

    #[test]
    fn build_item_completed_edit_file_infers_modify() {
        let info = ItemInfo {
            item_id: "item_5".into(),
            tool_use_id: "toolu_789".into(),
            tool_name: "edit_file".into(),
            category: ToolCategory::FileChange,
            accumulated_input_json: r#"{"path": "src/lib.rs"}"#.into(),
            aggregated_output: "--- a/src/lib.rs\n+++ b/src/lib.rs\n@@ -1 +1 @@\n-old\n+new\n"
                .into(),
        };
        let event = build_item_completed(&info, "thread_1", "turn_1");
        let changes = event["params"]["changes"].as_array().unwrap();
        assert_eq!(changes[0]["kind"], "modify");
        assert!(changes[0]["diff"].as_str().unwrap().contains("--- a/src/lib.rs"));
    }

    // ── build_output_delta ───────────────────────────────────────

    #[test]
    fn build_output_delta_command_execution() {
        let info = ItemInfo {
            item_id: "item_6".into(),
            tool_use_id: "toolu_aaa".into(),
            tool_name: "bash".into(),
            category: ToolCategory::CommandExecution,
            accumulated_input_json: String::new(),
            aggregated_output: String::new(),
        };
        let event = build_output_delta(&info, "t1", "turn1", "hello world\n");
        assert_eq!(event["method"], "item/commandExecution/outputDelta");
        assert_eq!(event["params"]["delta"], "hello world\n");
        assert_eq!(event["params"]["itemId"], "item_6");
    }

    #[test]
    fn build_output_delta_file_change() {
        let info = ItemInfo {
            item_id: "item_7".into(),
            tool_use_id: "toolu_bbb".into(),
            tool_name: "write_file".into(),
            category: ToolCategory::FileChange,
            accumulated_input_json: String::new(),
            aggregated_output: String::new(),
        };
        let event = build_output_delta(&info, "t1", "turn1", "diff content");
        assert_eq!(event["method"], "item/fileChange/outputDelta");
    }

    // ── build_item_completed with unparseable input ──────────────

    #[test]
    fn build_item_completed_with_invalid_json_input() {
        let info = ItemInfo {
            item_id: "item_8".into(),
            tool_use_id: "toolu_ccc".into(),
            tool_name: "bash".into(),
            category: ToolCategory::CommandExecution,
            accumulated_input_json: "not valid json{".into(),
            aggregated_output: "some output".into(),
        };
        let event = build_item_completed(&info, "t1", "turn1");
        // Should not panic, gracefully handles invalid JSON
        assert_eq!(event["params"]["status"], "completed");
        assert_eq!(event["params"]["aggregatedOutput"], "some output");
    }
}
