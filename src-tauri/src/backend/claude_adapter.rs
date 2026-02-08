use serde_json::{json, Value};
use std::collections::HashMap;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{SystemTime, UNIX_EPOCH};

use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::Child;
use tokio::sync::{mpsc, Mutex};

use crate::backend::app_server::{
    build_codex_command_with_bin, check_cli_installation, CliAdapter, CliSpawnConfig,
    WorkspaceSession,
};
use crate::backend::events::{AppServerEvent, EventSink};
use crate::shared::process_core::kill_child_process_tree;
use crate::types::WorkspaceEntry;

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
struct ThreadMetadata {
    claude_session_id: Option<String>,
    name: Option<String>,
    created_at: u64,
    updated_at: u64,
    archived: bool,
}

#[derive(serde::Serialize, serde::Deserialize, Clone, Debug, Default)]
struct ThreadStore {
    threads: HashMap<String, ThreadMetadata>,
}

impl ThreadStore {
    fn load(path: &PathBuf) -> Self {
        std::fs::read_to_string(path)
            .ok()
            .and_then(|content| serde_json::from_str(&content).ok())
            .unwrap_or_default()
    }

    fn save(&self, path: &PathBuf) -> Result<(), String> {
        if let Some(parent) = path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|e| format!("Failed to create thread store directory: {e}"))?;
        }
        let json = serde_json::to_string_pretty(self).map_err(|e| e.to_string())?;
        std::fs::write(path, json).map_err(|e| format!("Failed to write thread store: {e}"))
    }
}

fn now_epoch() -> u64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0)
}

fn thread_store_path(workspace_id: &str) -> PathBuf {
    let data_dir = dirs_next::data_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join("agent-monitor")
        .join("adapter-threads");
    data_dir.join(format!("{workspace_id}.json"))
}

pub(crate) fn build_claude_command(
    config: &CliSpawnConfig,
    session_id: Option<&str>,
    prompt: &str,
    cwd: &str,
    effort: Option<&str>,
) -> Result<tokio::process::Command, String> {
    let mut args = vec![
        "-p".to_string(),
        "--output-format".to_string(),
        "stream-json".to_string(),
        "--verbose".to_string(),
    ];
    if let Some(sid) = session_id {
        args.push("--resume".to_string());
        args.push(sid.to_string());
    }
    args.push(prompt.to_string());

    let mut command = build_codex_command_with_bin(
        config.cli_bin.clone(),
        config.cli_args.as_deref(),
        args,
    )?;
    command.current_dir(cwd);
    if let Some(ref home) = config.cli_home {
        command.env("CLAUDE_HOME", home);
    }
    if let Some(effort_value) = effort {
        if effort_value == "max" {
            command.env("CLAUDE_CODE_EFFORT_LEVEL", "high");
            command.env("CLAUDE_CODE_MAX_THINKING_TOKENS", "128000");
        } else {
            command.env("CLAUDE_CODE_EFFORT_LEVEL", effort_value);
        }
    }
    command.stdin(std::process::Stdio::null());
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    Ok(command)
}

pub(crate) fn parse_stream_json_line(
    line: &str,
    thread_id: &str,
    turn_id: &str,
) -> Option<Value> {
    let event: Value = serde_json::from_str(line).ok()?;
    let event_type = event.get("type")?.as_str()?;

    let msg_item_id = format!("msg_{turn_id}");

    match event_type {
        "system" => {
            let subtype = event.get("subtype").and_then(|s| s.as_str()).unwrap_or("");
            if subtype == "init" {
                Some(json!({
                    "method": "turn/started",
                    "params": {
                        "threadId": thread_id,
                        "turnId": turn_id
                    }
                }))
            } else {
                None
            }
        }
        "content_block_delta" => {
            let delta = event.get("delta")?;
            let delta_type = delta.get("type")?.as_str()?;
            match delta_type {
                "text_delta" => {
                    let text = delta.get("text")?.as_str()?;
                    Some(json!({
                        "method": "item/agentMessage/delta",
                        "params": {
                            "threadId": thread_id,
                            "turnId": turn_id,
                            "itemId": msg_item_id,
                            "delta": text
                        }
                    }))
                }
                "input_json_delta" => None,
                _ => None,
            }
        }
        "content_block_start" => {
            let block = event.get("content_block")?;
            let block_type = block.get("type")?.as_str()?;
            if block_type == "tool_use" {
                let tool_name = block.get("name").and_then(|n| n.as_str()).unwrap_or("tool");
                let tool_id = block.get("id").and_then(|i| i.as_str()).unwrap_or("");
                Some(json!({
                    "method": "item/started",
                    "params": {
                        "threadId": thread_id,
                        "turnId": turn_id,
                        "item": {
                            "id": tool_id,
                            "type": "tool_use",
                            "name": tool_name
                        }
                    }
                }))
            } else {
                None
            }
        }
        "tool_result" => {
            let tool_use_id = event.get("tool_use_id").and_then(|i| i.as_str()).unwrap_or("");
            Some(json!({
                "method": "item/completed",
                "params": {
                    "threadId": thread_id,
                    "turnId": turn_id,
                    "item": {
                        "id": tool_use_id,
                        "type": "tool_use"
                    }
                }
            }))
        }
        "result" => {
            Some(json!({
                "method": "turn/completed",
                "params": {
                    "threadId": thread_id,
                    "turnId": turn_id,
                    "costUsd": event.get("cost_usd"),
                    "durationMs": event.get("duration_ms")
                }
            }))
        }
        _ => None,
    }
}

fn extract_session_id_from_line(line: &str) -> Option<String> {
    let event: Value = serde_json::from_str(line).ok()?;
    if event.get("type")?.as_str()? != "system" {
        return None;
    }
    if event.get("subtype").and_then(|s| s.as_str()) != Some("init") {
        return None;
    }
    event
        .get("session_id")
        .and_then(|s| s.as_str())
        .map(|s| s.to_string())
}

struct ClaudeAdapterSession {
    workspace_id: String,
    cwd: String,
    config: CliSpawnConfig,
    thread_store_path: PathBuf,
    thread_store: Arc<Mutex<ThreadStore>>,
    active_child: Arc<Mutex<Option<Child>>>,
    event_emitter: Arc<dyn Fn(AppServerEvent) + Send + Sync>,
    background_callbacks: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>,
}

impl ClaudeAdapterSession {
    fn new(
        entry: &WorkspaceEntry,
        config: CliSpawnConfig,
        event_emitter: Arc<dyn Fn(AppServerEvent) + Send + Sync>,
        background_callbacks: Arc<Mutex<HashMap<String, mpsc::UnboundedSender<Value>>>>,
    ) -> Self {
        let store_path = thread_store_path(&entry.id);
        let store = ThreadStore::load(&store_path);
        Self {
            workspace_id: entry.id.clone(),
            cwd: entry.path.clone(),
            config,
            thread_store_path: store_path,
            thread_store: Arc::new(Mutex::new(store)),
            active_child: Arc::new(Mutex::new(None)),
            event_emitter,
            background_callbacks,
        }
    }

    async fn handle_thread_start(&self) -> Result<Value, String> {
        let thread_id = uuid::Uuid::new_v4().to_string();
        let now = now_epoch();
        let meta = ThreadMetadata {
            claude_session_id: None,
            name: None,
            created_at: now,
            updated_at: now,
            archived: false,
        };
        {
            let mut store = self.thread_store.lock().await;
            store.threads.insert(thread_id.clone(), meta);
            store.save(&self.thread_store_path)?;
        }
        Ok(json!({
            "result": {
                "threadId": thread_id,
                "thread": { "id": thread_id }
            }
        }))
    }

    async fn handle_thread_resume(&self, params: &Value) -> Result<Value, String> {
        let thread_id = params
            .get("threadId")
            .and_then(|v| v.as_str())
            .ok_or("missing threadId")?;
        let store = self.thread_store.lock().await;
        if !store.threads.contains_key(thread_id) {
            return Err("thread not found".to_string());
        }
        Ok(json!({
            "result": {
                "threadId": thread_id,
                "thread": { "id": thread_id }
            }
        }))
    }

    async fn handle_thread_list(&self) -> Result<Value, String> {
        let store = self.thread_store.lock().await;
        let threads: Vec<Value> = store
            .threads
            .iter()
            .filter(|(_, meta)| !meta.archived)
            .map(|(id, meta)| {
                json!({
                    "id": id,
                    "name": meta.name,
                    "createdAt": meta.created_at,
                    "updatedAt": meta.updated_at,
                    "archived": meta.archived,
                })
            })
            .collect();
        Ok(json!({
            "result": {
                "threads": threads,
                "hasMore": false
            }
        }))
    }

    async fn handle_thread_archive(&self, params: &Value) -> Result<Value, String> {
        let thread_id = params
            .get("threadId")
            .and_then(|v| v.as_str())
            .ok_or("missing threadId")?;
        let mut store = self.thread_store.lock().await;
        if let Some(meta) = store.threads.get_mut(thread_id) {
            meta.archived = true;
            meta.updated_at = now_epoch();
        }
        store.save(&self.thread_store_path)?;
        Ok(json!({ "result": {} }))
    }

    async fn handle_thread_name_set(&self, params: &Value) -> Result<Value, String> {
        let thread_id = params
            .get("threadId")
            .and_then(|v| v.as_str())
            .ok_or("missing threadId")?;
        let name = params
            .get("name")
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let mut store = self.thread_store.lock().await;
        if let Some(meta) = store.threads.get_mut(thread_id) {
            meta.name = Some(name.to_string());
            meta.updated_at = now_epoch();
        }
        store.save(&self.thread_store_path)?;
        Ok(json!({ "result": {} }))
    }

    async fn handle_model_list(&self) -> Result<Value, String> {
        let standard_efforts = json!([
            { "reasoningEffort": "low", "description": "Fast, minimal thinking" },
            { "reasoningEffort": "medium", "description": "Balanced speed and depth" },
            { "reasoningEffort": "high", "description": "Deep thinking (default)" }
        ]);
        let opus_efforts = json!([
            { "reasoningEffort": "low", "description": "Fast, minimal thinking" },
            { "reasoningEffort": "medium", "description": "Balanced speed and depth" },
            { "reasoningEffort": "high", "description": "Deep thinking (default)" },
            { "reasoningEffort": "max", "description": "Maximum depth, no token limit" }
        ]);
        Ok(json!({
            "result": {
                "models": [
                    {
                        "id": "claude-sonnet-4-20250514",
                        "name": "Claude Sonnet 4",
                        "supportedReasoningEfforts": standard_efforts,
                        "defaultReasoningEffort": "high"
                    },
                    {
                        "id": "claude-opus-4-20250514",
                        "name": "Claude Opus 4",
                        "supportedReasoningEfforts": opus_efforts,
                        "defaultReasoningEffort": "high"
                    },
                    {
                        "id": "claude-haiku-4-20250514",
                        "name": "Claude Haiku 4",
                        "supportedReasoningEfforts": standard_efforts,
                        "defaultReasoningEffort": "high"
                    }
                ],
                "defaultModel": "claude-sonnet-4-20250514"
            }
        }))
    }

    async fn handle_turn_start(&self, params: &Value) -> Result<Value, String> {
        let thread_id = params
            .get("threadId")
            .and_then(|v| v.as_str())
            .ok_or("missing threadId")?
            .to_string();
        let prompt = params
            .get("input")
            .and_then(|v| v.as_str())
            .ok_or("missing input")?
            .to_string();
        let turn_id = uuid::Uuid::new_v4().to_string();

        let session_id = {
            let store = self.thread_store.lock().await;
            store
                .threads
                .get(&thread_id)
                .and_then(|meta| meta.claude_session_id.clone())
        };

        // Kill any existing turn process
        {
            let mut guard: tokio::sync::MutexGuard<'_, Option<Child>> =
                self.active_child.lock().await;
            if let Some(mut prev) = guard.take() {
                kill_child_process_tree(&mut prev).await;
            }
        }

        let effort = params
            .get("effort")
            .and_then(|v| v.as_str())
            .map(|s| s.to_string());

        let mut command = build_claude_command(
            &self.config,
            session_id.as_deref(),
            &prompt,
            &self.cwd,
            effort.as_deref(),
        )?;
        let mut child = command
            .spawn()
            .map_err(|e| format!("Failed to spawn claude: {e}"))?;
        let stdout = child
            .stdout
            .take()
            .ok_or("Failed to capture claude stdout")?;
        let stderr = child.stderr.take();

        {
            let mut guard: tokio::sync::MutexGuard<'_, Option<Child>> =
                self.active_child.lock().await;
            *guard = Some(child);
        }

        let emitter = self.event_emitter.clone();
        let ws_id = self.workspace_id.clone();
        let store = self.thread_store.clone();
        let store_path = self.thread_store_path.clone();
        let active_child = self.active_child.clone();
        let bg_callbacks = self.background_callbacks.clone();
        let thread_id_bg = thread_id.clone();
        let turn_id_bg = turn_id.clone();

        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            let mut got_result = false;

            while let Ok(Some(line)) = lines.next_line().await {
                if let Some(sid) = extract_session_id_from_line(&line) {
                    let mut s = store.lock().await;
                    if let Some(meta) = s.threads.get_mut(&thread_id_bg) {
                        meta.claude_session_id = Some(sid);
                        meta.updated_at = now_epoch();
                        if let Err(e) = s.save(&store_path) {
                            eprintln!("claude adapter: failed to persist session id: {e}");
                        }
                    }
                }

                if let Some(event) = parse_stream_json_line(&line, &thread_id_bg, &turn_id_bg) {
                    if event.get("method").and_then(|m| m.as_str()) == Some("turn/completed") {
                        got_result = true;
                    }
                    let mut sent_to_background = false;
                    {
                        let callbacks = bg_callbacks.lock().await;
                        if let Some(tx) = callbacks.get(&thread_id_bg) {
                            let _ = tx.send(event.clone());
                            sent_to_background = true;
                        }
                    }
                    if !sent_to_background {
                        (emitter)(AppServerEvent {
                            workspace_id: ws_id.clone(),
                            message: event,
                        });
                    }
                }
            }

            if !got_result {
                let fallback_event = json!({
                    "method": "turn/completed",
                    "params": {
                        "threadId": thread_id_bg,
                        "turnId": turn_id_bg
                    }
                });
                let mut sent_to_background = false;
                {
                    let callbacks = bg_callbacks.lock().await;
                    if let Some(tx) = callbacks.get(&thread_id_bg) {
                        let _ = tx.send(fallback_event.clone());
                        sent_to_background = true;
                    }
                }
                if !sent_to_background {
                    (emitter)(AppServerEvent {
                        workspace_id: ws_id,
                        message: fallback_event,
                    });
                }
            }

            let mut guard: tokio::sync::MutexGuard<'_, Option<Child>> =
                active_child.lock().await;
            if let Some(mut child) = guard.take() {
                let _ = child.wait().await;
            }
        });

        if let Some(stderr) = stderr {
            tokio::spawn(async move {
                let mut lines = BufReader::new(stderr).lines();
                while let Ok(Some(_)) = lines.next_line().await {}
            });
        }

        Ok(json!({
            "result": {
                "turn": { "id": turn_id },
                "threadId": thread_id
            }
        }))
    }
}

#[async_trait::async_trait]
impl CliAdapter for ClaudeAdapterSession {
    async fn send_request(&self, method: &str, params: Value) -> Result<Value, String> {
        match method {
            "initialize" => Ok(json!({
                "result": {
                    "serverInfo": {
                        "name": "claude-adapter",
                        "version": "0.1.0"
                    },
                    "capabilities": {}
                }
            })),
            "thread/start" => self.handle_thread_start().await,
            "thread/resume" => self.handle_thread_resume(&params).await,
            "thread/fork" => {
                let source_id = params
                    .get("threadId")
                    .and_then(|v| v.as_str())
                    .ok_or("missing threadId")?;
                let mut store = self.thread_store.lock().await;
                let source = store
                    .threads
                    .get(source_id)
                    .cloned()
                    .ok_or("thread not found")?;
                let new_id = uuid::Uuid::new_v4().to_string();
                let now = now_epoch();
                let meta = ThreadMetadata {
                    claude_session_id: None,
                    name: source.name.map(|n| format!("{n} (fork)")),
                    created_at: now,
                    updated_at: now,
                    archived: false,
                };
                store.threads.insert(new_id.clone(), meta);
                store.save(&self.thread_store_path)?;
                Ok(json!({
                    "result": {
                        "threadId": new_id,
                        "thread": { "id": new_id }
                    }
                }))
            }
            "thread/list" => self.handle_thread_list().await,
            "thread/archive" => self.handle_thread_archive(&params).await,
            "thread/compact/start" => Ok(json!({ "result": {} })),
            "thread/name/set" => self.handle_thread_name_set(&params).await,
            "turn/start" => self.handle_turn_start(&params).await,
            "turn/interrupt" => {
                let mut child_guard: tokio::sync::MutexGuard<'_, Option<Child>> =
                    self.active_child.lock().await;
                if let Some(mut child) = child_guard.take() {
                    kill_child_process_tree(&mut child).await;
                }
                Ok(json!({ "result": {} }))
            }
            "model/list" => self.handle_model_list().await,
            "account/read" => Ok(json!({ "result": { "provider": "claude" } })),
            "account/rateLimits/read" => Ok(json!({ "result": Value::Null })),
            "collaborationMode/list" => Ok(json!({ "result": { "modes": [] } })),
            "skills/list" => Ok(json!({ "result": { "skills": [] } })),
            "app/list" => Ok(json!({ "result": { "apps": [] } })),
            "mcpServerStatus/list" => Ok(json!({ "result": { "servers": [] } })),
            _ => Err(format!("unsupported method: {method}")),
        }
    }

    async fn send_notification(&self, _method: &str, _params: Option<Value>) -> Result<(), String> {
        Ok(())
    }

    async fn send_response(&self, _id: Value, _result: Value) -> Result<(), String> {
        Ok(())
    }

    async fn kill(&self) {
        let mut child_guard: tokio::sync::MutexGuard<'_, Option<Child>> =
            self.active_child.lock().await;
        if let Some(mut child) = child_guard.take() {
            kill_child_process_tree(&mut child).await;
        }
    }
}

pub(crate) async fn spawn_claude_session<E: EventSink>(
    entry: WorkspaceEntry,
    config: CliSpawnConfig,
    event_sink: E,
) -> Result<Arc<WorkspaceSession>, String> {
    let _ = check_cli_installation(config.cli_bin.clone(), "Claude").await?;

    let event_sink_clone = event_sink.clone();
    let emitter: Arc<dyn Fn(AppServerEvent) + Send + Sync> = Arc::new(move |event| {
        event_sink_clone.emit_app_server_event(event);
    });

    let shared_callbacks = Arc::new(Mutex::new(HashMap::new()));
    let adapter = ClaudeAdapterSession::new(&entry, config, emitter, shared_callbacks.clone());
    let session = Arc::new(WorkspaceSession::new_with_adapter(
        entry.clone(),
        Box::new(adapter),
        shared_callbacks,
    ));

    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: entry.id.clone(),
        message: json!({
            "method": "codex/connected",
            "params": { "workspaceId": entry.id }
        }),
    });

    Ok(session)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn test_emitter() -> Arc<dyn Fn(AppServerEvent) + Send + Sync> {
        Arc::new(|_| {})
    }

    #[test]
    fn build_claude_command_basic() {
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: Some("claude".to_string()),
            cli_args: None,
            cli_home: None,
        };
        let result = build_claude_command(&config, None, "hello world", "/tmp", None);
        assert!(result.is_ok());
    }

    #[test]
    fn build_claude_command_with_resume() {
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: Some("claude".to_string()),
            cli_args: None,
            cli_home: None,
        };
        let result = build_claude_command(&config, Some("session-123"), "hello", "/tmp", None);
        assert!(result.is_ok());
    }

    #[test]
    fn parse_stream_json_init() {
        let line = r#"{"type":"system","subtype":"init","session_id":"s1","tools":[],"model":"claude-4"}"#;
        let event = parse_stream_json_line(line, "t1", "turn1");
        assert!(event.is_some());
        let event = event.unwrap();
        assert_eq!(
            event.get("method").and_then(|v| v.as_str()),
            Some("turn/started")
        );
    }

    #[test]
    fn parse_stream_json_text_delta_has_item_id() {
        let line = r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hello"}}"#;
        let event = parse_stream_json_line(line, "t1", "turn1").unwrap();
        assert_eq!(
            event.get("method").and_then(|v| v.as_str()),
            Some("item/agentMessage/delta")
        );
        let params = event.get("params").unwrap();
        assert_eq!(params.get("delta").and_then(|d| d.as_str()), Some("hello"));
        assert!(
            params.get("itemId").and_then(|i| i.as_str()).is_some(),
            "item/agentMessage/delta must include itemId for frontend dispatch"
        );
    }

    #[test]
    fn parse_stream_json_tool_use_start_emits_item_started() {
        let line = r#"{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read","id":"tool-1"}}"#;
        let event = parse_stream_json_line(line, "t1", "turn1").unwrap();
        assert_eq!(
            event.get("method").and_then(|v| v.as_str()),
            Some("item/started"),
            "tool_use start must emit item/started (not item/tool/started) to match SUPPORTED_APP_SERVER_METHODS"
        );
        let item = event.get("params").and_then(|p| p.get("item")).unwrap();
        assert_eq!(item.get("id").and_then(|i| i.as_str()), Some("tool-1"));
        assert_eq!(item.get("name").and_then(|n| n.as_str()), Some("Read"));
    }

    #[test]
    fn parse_stream_json_tool_input_delta_is_dropped() {
        let line = r#"{"type":"content_block_delta","index":1,"delta":{"type":"input_json_delta","partial_json":"{\"path\":"}}"#;
        assert!(
            parse_stream_json_line(line, "t1", "turn1").is_none(),
            "input_json_delta has no supported frontend method and should be dropped"
        );
    }

    #[test]
    fn parse_stream_json_tool_result_emits_item_completed() {
        let line = r#"{"type":"tool_result","tool_use_id":"tool-1","content":"done"}"#;
        let event = parse_stream_json_line(line, "t1", "turn1").unwrap();
        assert_eq!(
            event.get("method").and_then(|v| v.as_str()),
            Some("item/completed"),
            "tool_result must emit item/completed (not item/tool/completed) to match SUPPORTED_APP_SERVER_METHODS"
        );
        let item = event.get("params").and_then(|p| p.get("item")).unwrap();
        assert_eq!(item.get("id").and_then(|i| i.as_str()), Some("tool-1"));
    }

    const SUPPORTED_METHODS: &[&str] = &[
        "item/agentMessage/delta",
        "item/completed",
        "item/started",
        "turn/completed",
        "turn/started",
    ];

    #[test]
    fn all_emitted_methods_are_supported_by_frontend() {
        let test_lines = vec![
            r#"{"type":"system","subtype":"init","session_id":"s1","tools":[]}"#,
            r#"{"type":"content_block_delta","index":0,"delta":{"type":"text_delta","text":"hi"}}"#,
            r#"{"type":"content_block_start","content_block":{"type":"tool_use","name":"Read","id":"t1"}}"#,
            r#"{"type":"tool_result","tool_use_id":"t1","content":"ok"}"#,
            r#"{"type":"result","subtype":"success","cost_usd":0.01,"duration_ms":100}}"#,
        ];
        for line in test_lines {
            if let Some(event) = parse_stream_json_line(line, "thread1", "turn1") {
                let method = event.get("method").and_then(|m| m.as_str()).unwrap();
                assert!(
                    SUPPORTED_METHODS.contains(&method),
                    "Emitted method '{method}' is not in SUPPORTED_APP_SERVER_METHODS"
                );
            }
        }
    }

    #[test]
    fn parse_stream_json_result() {
        let line = r#"{"type":"result","subtype":"success","cost_usd":0.05,"duration_ms":1200,"session_id":"s1"}"#;
        let event = parse_stream_json_line(line, "t1", "turn1");
        assert!(event.is_some());
        let event = event.unwrap();
        assert_eq!(
            event.get("method").and_then(|v| v.as_str()),
            Some("turn/completed")
        );
    }

    #[test]
    fn parse_stream_json_unknown_type() {
        let line = r#"{"type":"unknown_event"}"#;
        let event = parse_stream_json_line(line, "t1", "turn1");
        assert!(event.is_none());
    }

    #[test]
    fn extract_session_id_from_init_line() {
        let line = r#"{"type":"system","subtype":"init","session_id":"abc-123","tools":[]}"#;
        assert_eq!(
            extract_session_id_from_line(line),
            Some("abc-123".to_string())
        );
    }

    #[test]
    fn extract_session_id_from_non_init_line() {
        let line = r#"{"type":"content_block_delta","delta":{"type":"text_delta","text":"hi"}}"#;
        assert_eq!(extract_session_id_from_line(line), None);
    }

    #[test]
    fn thread_store_roundtrip() {
        let temp_dir = std::env::temp_dir().join(format!(
            "claude-adapter-test-{}",
            uuid::Uuid::new_v4()
        ));
        std::fs::create_dir_all(&temp_dir).unwrap();
        let path = temp_dir.join("threads.json");

        let mut store = ThreadStore::default();
        store.threads.insert(
            "t1".to_string(),
            ThreadMetadata {
                claude_session_id: Some("s1".to_string()),
                name: Some("Test Thread".to_string()),
                created_at: 1000,
                updated_at: 2000,
                archived: false,
            },
        );
        store.save(&path).unwrap();

        let loaded = ThreadStore::load(&path);
        assert!(loaded.threads.contains_key("t1"));
        let meta = &loaded.threads["t1"];
        assert_eq!(meta.claude_session_id.as_deref(), Some("s1"));
        assert_eq!(meta.name.as_deref(), Some("Test Thread"));
        assert!(!meta.archived);

        let _ = std::fs::remove_dir_all(temp_dir);
    }

    #[tokio::test]
    async fn adapter_send_request_routing() {
        let entry = WorkspaceEntry {
            id: "test-ws".to_string(),
            name: "Test".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: crate::types::WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: crate::types::WorkspaceSettings::default(),
        };
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: None,
            cli_args: None,
            cli_home: None,
        };
        let adapter = ClaudeAdapterSession::new(&entry, config, test_emitter(), Arc::new(Mutex::new(HashMap::new())));

        let init_result = adapter.send_request("initialize", json!({})).await;
        assert!(init_result.is_ok());

        let thread_result = adapter.send_request("thread/start", json!({})).await;
        assert!(thread_result.is_ok());
        let thread_id = thread_result
            .unwrap()
            .get("result")
            .and_then(|r| r.get("threadId"))
            .and_then(|v| v.as_str())
            .unwrap()
            .to_string();

        let list_result = adapter.send_request("thread/list", json!({})).await;
        assert!(list_result.is_ok());

        let archive_result = adapter
            .send_request("thread/archive", json!({ "threadId": thread_id }))
            .await;
        assert!(archive_result.is_ok());

        let model_result = adapter.send_request("model/list", json!({})).await;
        assert!(model_result.is_ok());
        let models = model_result
            .unwrap()
            .get("result")
            .and_then(|r| r.get("models"))
            .and_then(|m| m.as_array())
            .map(|a| a.len())
            .unwrap_or(0);
        assert!(models > 0);

        let account_result = adapter.send_request("account/read", json!({})).await;
        assert!(account_result.is_ok());

        let unknown_result = adapter.send_request("nonexistent/method", json!({})).await;
        assert!(unknown_result.is_err());
    }

    #[tokio::test]
    async fn thread_start_response_has_thread_id_and_thread_object() {
        let entry = WorkspaceEntry {
            id: "test-ws".to_string(),
            name: "Test".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: crate::types::WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: crate::types::WorkspaceSettings::default(),
        };
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: None,
            cli_args: None,
            cli_home: None,
        };
        let adapter = ClaudeAdapterSession::new(&entry, config, test_emitter(), Arc::new(Mutex::new(HashMap::new())));
        let result = adapter.send_request("thread/start", json!({})).await.unwrap();
        let r = result.get("result").expect("must have result");
        assert!(
            r.get("threadId").and_then(|v| v.as_str()).is_some(),
            "thread/start result must include threadId"
        );
        let thread = r.get("thread").expect("must have thread object");
        assert!(
            thread.get("id").and_then(|v| v.as_str()).is_some(),
            "thread/start result.thread must include id"
        );
    }

    #[test]
    fn build_claude_command_with_effort() {
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: Some("claude".to_string()),
            cli_args: None,
            cli_home: None,
        };
        let result = build_claude_command(&config, None, "hello", "/tmp", Some("low"));
        assert!(result.is_ok());
    }

    #[test]
    fn build_claude_command_with_max_effort() {
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: Some("claude".to_string()),
            cli_args: None,
            cli_home: None,
        };
        let result = build_claude_command(&config, None, "hello", "/tmp", Some("max"));
        assert!(result.is_ok());
    }

    #[tokio::test]
    async fn model_list_includes_reasoning_efforts() {
        let entry = WorkspaceEntry {
            id: "test-ws".to_string(),
            name: "Test".to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: crate::types::WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: crate::types::WorkspaceSettings::default(),
        };
        let config = CliSpawnConfig {
            cli_type: "claude".to_string(),
            cli_bin: None,
            cli_args: None,
            cli_home: None,
        };
        let adapter = ClaudeAdapterSession::new(&entry, config, test_emitter(), Arc::new(Mutex::new(HashMap::new())));
        let result = adapter.send_request("model/list", json!({})).await.unwrap();
        let models = result["result"]["models"].as_array().unwrap();

        for model in models {
            assert!(model.get("supportedReasoningEfforts").is_some());
            assert!(model.get("defaultReasoningEffort").is_some());
        }

        let opus = models.iter().find(|m| m["id"] == "claude-opus-4-20250514").unwrap();
        let opus_efforts = opus["supportedReasoningEfforts"].as_array().unwrap();
        assert_eq!(opus_efforts.len(), 4);
        assert!(opus_efforts.iter().any(|e| e["reasoningEffort"] == "max"));

        let sonnet = models.iter().find(|m| m["id"] == "claude-sonnet-4-20250514").unwrap();
        let sonnet_efforts = sonnet["supportedReasoningEfforts"].as_array().unwrap();
        assert_eq!(sonnet_efforts.len(), 3);
        assert!(!sonnet_efforts.iter().any(|e| e["reasoningEffort"] == "max"));
    }
}
