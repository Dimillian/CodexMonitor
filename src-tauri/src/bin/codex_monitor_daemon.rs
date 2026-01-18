#[path = "../backend/mod.rs"]
mod backend;
#[path = "../codex_config.rs"]
mod codex_config;
#[path = "../storage.rs"]
mod storage;
#[path = "../types.rs"]
mod types;

use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::env;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use ignore::WalkBuilder;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, Mutex};
use uuid::Uuid;

use backend::app_server::{spawn_workspace_session, WorkspaceSession};
use backend::events::{AppServerEvent, EventSink, TerminalOutput};
use storage::{read_settings, read_workspaces, write_settings, write_workspaces};
use types::{AppSettings, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings};

const DEFAULT_LISTEN_ADDR: &str = "127.0.0.1:4732";

#[derive(Clone)]
struct DaemonEventSink {
    tx: broadcast::Sender<DaemonEvent>,
}

#[derive(Clone)]
enum DaemonEvent {
    AppServer(AppServerEvent),
    TerminalOutput(TerminalOutput),
}

impl EventSink for DaemonEventSink {
    fn emit_app_server_event(&self, event: AppServerEvent) {
        let _ = self.tx.send(DaemonEvent::AppServer(event));
    }

    fn emit_terminal_output(&self, event: TerminalOutput) {
        let _ = self.tx.send(DaemonEvent::TerminalOutput(event));
    }
}

struct DaemonConfig {
    listen: SocketAddr,
    token: Option<String>,
    data_dir: PathBuf,
}

struct DaemonState {
    workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: PathBuf,
    settings_path: PathBuf,
    app_settings: Mutex<AppSettings>,
    event_sink: DaemonEventSink,
}

impl DaemonState {
    fn load(config: &DaemonConfig, event_sink: DaemonEventSink) -> Self {
        let storage_path = config.data_dir.join("workspaces.json");
        let settings_path = config.data_dir.join("settings.json");
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        let app_settings = read_settings(&settings_path).unwrap_or_default();
        Self {
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            storage_path,
            settings_path,
            app_settings: Mutex::new(app_settings),
            event_sink,
        }
    }

    async fn list_workspaces(&self) -> Vec<WorkspaceInfo> {
        let workspaces = self.workspaces.lock().await;
        let sessions = self.sessions.lock().await;
        let mut result = Vec::new();
        for entry in workspaces.values() {
            result.push(WorkspaceInfo {
                id: entry.id.clone(),
                name: entry.name.clone(),
                path: entry.path.clone(),
                connected: sessions.contains_key(&entry.id),
                codex_bin: entry.codex_bin.clone(),
                kind: entry.kind.clone(),
                parent_id: entry.parent_id.clone(),
                worktree: entry.worktree.clone(),
                settings: entry.settings.clone(),
            });
        }
        sort_workspaces(&mut result);
        result
    }

    async fn add_workspace(
        &self,
        path: String,
        codex_bin: Option<String>,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let name = PathBuf::from(&path)
            .file_name()
            .and_then(|s| s.to_str())
            .unwrap_or("Workspace")
            .to_string();

        let entry = WorkspaceEntry {
            id: Uuid::new_v4().to_string(),
            name: name.clone(),
            path: path.clone(),
            codex_bin,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        };

        let default_bin = {
            let settings = self.app_settings.lock().await;
            settings.codex_bin.clone()
        };

        let codex_home = resolve_codex_home(&entry, None);
        let session = spawn_workspace_session(
            entry.clone(),
            default_bin,
            client_version,
            self.event_sink.clone(),
            codex_home,
        )
        .await?;

        let list = {
            let mut workspaces = self.workspaces.lock().await;
            workspaces.insert(entry.id.clone(), entry.clone());
            workspaces.values().cloned().collect::<Vec<_>>()
        };
        write_workspaces(&self.storage_path, &list)?;

        self.sessions.lock().await.insert(entry.id.clone(), session);

        Ok(WorkspaceInfo {
            id: entry.id,
            name: entry.name,
            path: entry.path,
            connected: true,
            codex_bin: entry.codex_bin,
            kind: entry.kind,
            parent_id: entry.parent_id,
            worktree: entry.worktree,
            settings: entry.settings,
        })
    }

    async fn connect_workspace(&self, id: String, client_version: String) -> Result<(), String> {
        {
            let sessions = self.sessions.lock().await;
            if sessions.contains_key(&id) {
                return Ok(());
            }
        }

        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&id)
                .cloned()
                .ok_or("workspace not found")?
        };

        let default_bin = {
            let settings = self.app_settings.lock().await;
            settings.codex_bin.clone()
        };

        let parent_path = if entry.kind.is_worktree() {
            let workspaces = self.workspaces.lock().await;
            entry
                .parent_id
                .as_deref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .map(|parent| parent.path.clone())
        } else {
            None
        };
        let codex_home = resolve_codex_home(&entry, parent_path.as_deref());
        let session = spawn_workspace_session(
            entry,
            default_bin,
            client_version,
            self.event_sink.clone(),
            codex_home,
        )
        .await?;

        self.sessions.lock().await.insert(id, session);
        Ok(())
    }

    async fn update_app_settings(&self, settings: AppSettings) -> Result<AppSettings, String> {
        let _ = codex_config::write_collab_enabled(settings.experimental_collab_enabled);
        let _ = codex_config::write_steer_enabled(settings.experimental_steer_enabled);
        let _ = codex_config::write_unified_exec_enabled(settings.experimental_unified_exec_enabled);
        write_settings(&self.settings_path, &settings)?;
        let mut current = self.app_settings.lock().await;
        *current = settings.clone();
        Ok(settings)
    }

    async fn get_session(&self, workspace_id: &str) -> Result<Arc<WorkspaceSession>, String> {
        let sessions = self.sessions.lock().await;
        sessions
            .get(workspace_id)
            .cloned()
            .ok_or("workspace not connected".to_string())
    }

    async fn list_workspace_files(&self, workspace_id: String) -> Result<Vec<String>, String> {
        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&workspace_id)
                .cloned()
                .ok_or("workspace not found")?
        };

        let root = PathBuf::from(entry.path);
        Ok(list_workspace_files_inner(&root, 20000))
    }

    async fn start_thread(&self, workspace_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let params = json!({
            "cwd": session.entry.path,
            "approvalPolicy": "on-request"
        });
        session.send_request("thread/start", params).await
    }

    async fn resume_thread(&self, workspace_id: String, thread_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let params = json!({
            "threadId": thread_id
        });
        session.send_request("thread/resume", params).await
    }

    async fn list_threads(
        &self,
        workspace_id: String,
        cursor: Option<String>,
        limit: Option<u32>,
    ) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let params = json!({
            "cursor": cursor,
            "limit": limit
        });
        session.send_request("thread/list", params).await
    }

    async fn archive_thread(&self, workspace_id: String, thread_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let params = json!({ "threadId": thread_id });
        session.send_request("thread/archive", params).await
    }

    async fn send_user_message(
        &self,
        workspace_id: String,
        thread_id: String,
        text: String,
        model: Option<String>,
        effort: Option<String>,
        access_mode: Option<String>,
        images: Option<Vec<String>>,
    ) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let access_mode = access_mode.unwrap_or_else(|| "current".to_string());
        let sandbox_policy = match access_mode.as_str() {
            "full-access" => json!({
                "type": "dangerFullAccess"
            }),
            "read-only" => json!({
                "type": "readOnly"
            }),
            _ => json!({
                "type": "workspaceWrite",
                "writableRoots": [session.entry.path],
                "networkAccess": true
            }),
        };

        let approval_policy = if access_mode == "full-access" {
            "never"
        } else {
            "on-request"
        };

        let trimmed_text = text.trim();
        let mut input: Vec<Value> = Vec::new();
        if !trimmed_text.is_empty() {
            input.push(json!({ "type": "text", "text": trimmed_text }));
        }
        if let Some(paths) = images {
            for path in paths {
                let trimmed = path.trim();
                if trimmed.is_empty() {
                    continue;
                }
                if trimmed.starts_with("data:")
                    || trimmed.starts_with("http://")
                    || trimmed.starts_with("https://")
                {
                    input.push(json!({ "type": "image", "url": trimmed }));
                } else {
                    input.push(json!({ "type": "localImage", "path": trimmed }));
                }
            }
        }
        if input.is_empty() {
            return Err("empty user message".to_string());
        }

        let params = json!({
            "threadId": thread_id,
            "input": input,
            "cwd": session.entry.path,
            "approvalPolicy": approval_policy,
            "sandboxPolicy": sandbox_policy,
            "model": model,
            "effort": effort,
        });
        session.send_request("turn/start", params).await
    }

    async fn turn_interrupt(
        &self,
        workspace_id: String,
        thread_id: String,
        turn_id: String,
    ) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let params = json!({
            "threadId": thread_id,
            "turnId": turn_id
        });
        session.send_request("turn/interrupt", params).await
    }

    async fn start_review(
        &self,
        workspace_id: String,
        thread_id: String,
        target: Value,
        delivery: Option<String>,
    ) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let mut params = Map::new();
        params.insert("threadId".to_string(), json!(thread_id));
        params.insert("target".to_string(), target);
        if let Some(delivery) = delivery {
            params.insert("delivery".to_string(), json!(delivery));
        }
        session
            .send_request("review/start", Value::Object(params))
            .await
    }

    async fn model_list(&self, workspace_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        session.send_request("model/list", json!({})).await
    }

    async fn account_rate_limits(&self, workspace_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        session
            .send_request("account/rateLimits/read", Value::Null)
            .await
    }

    async fn skills_list(&self, workspace_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        let params = json!({
            "cwd": session.entry.path
        });
        session.send_request("skills/list", params).await
    }

    async fn respond_to_server_request(
        &self,
        workspace_id: String,
        request_id: u64,
        result: Value,
    ) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        session.send_response(request_id, result).await?;
        Ok(json!({ "ok": true }))
    }
}

fn sort_workspaces(workspaces: &mut [WorkspaceInfo]) {
    workspaces.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        if a_order != b_order {
            return a_order.cmp(&b_order);
        }
        a.name.cmp(&b.name)
    });
}

fn resolve_codex_home(entry: &WorkspaceEntry, parent_path: Option<&str>) -> Option<PathBuf> {
    if entry.kind.is_worktree() {
        if let Some(parent_path) = parent_path {
            let legacy_home = PathBuf::from(parent_path).join(".codexmonitor");
            if legacy_home.is_dir() {
                return Some(legacy_home);
            }
        }
    }
    let legacy_home = PathBuf::from(&entry.path).join(".codexmonitor");
    if legacy_home.is_dir() {
        return Some(legacy_home);
    }
    None
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "target" | "release-artifacts"
    )
}

fn normalize_git_path(path: &str) -> String {
    path.replace('\\', "/")
}

fn list_workspace_files_inner(root: &PathBuf, max_files: usize) -> Vec<String> {
    let mut results = Vec::new();
    let walker = WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .require_git(false)
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                let name = entry.file_name().to_string_lossy();
                return !should_skip_dir(&name);
            }
            true
        })
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if !entry.file_type().is_some_and(|ft| ft.is_file()) {
            continue;
        }
        if let Ok(rel_path) = entry.path().strip_prefix(root) {
            let normalized = normalize_git_path(&rel_path.to_string_lossy());
            if !normalized.is_empty() {
                results.push(normalized);
            }
        }
        if results.len() >= max_files {
            break;
        }
    }

    results.sort();
    results
}

fn default_data_dir() -> PathBuf {
    if let Ok(xdg) = env::var("XDG_DATA_HOME") {
        let trimmed = xdg.trim();
        if !trimmed.is_empty() {
            return PathBuf::from(trimmed).join("codex-monitor-daemon");
        }
    }
    let home = env::var("HOME").unwrap_or_else(|_| ".".to_string());
    PathBuf::from(home)
        .join(".local")
        .join("share")
        .join("codex-monitor-daemon")
}

fn usage() -> String {
    format!(
        "\
USAGE:\n  codex-monitor-daemon [--listen <addr>] [--data-dir <path>] [--token <token> | --insecure-no-auth]\n\n\
OPTIONS:\n  --listen <addr>        Bind address (default: {DEFAULT_LISTEN_ADDR})\n  --data-dir <path>      Data dir holding workspaces.json/settings.json\n  --token <token>        Shared token required by clients\n  --insecure-no-auth      Disable auth (dev only)\n  -h, --help             Show this help\n"
    )
}

fn parse_args() -> Result<DaemonConfig, String> {
    let mut listen = DEFAULT_LISTEN_ADDR
        .parse::<SocketAddr>()
        .map_err(|err| err.to_string())?;
    let mut token = env::var("CODEX_MONITOR_DAEMON_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut insecure_no_auth = false;
    let mut data_dir: Option<PathBuf> = None;

    let mut args = env::args().skip(1);
    while let Some(arg) = args.next() {
        match arg.as_str() {
            "-h" | "--help" => {
                print!("{}", usage());
                std::process::exit(0);
            }
            "--listen" => {
                let value = args.next().ok_or("--listen requires a value")?;
                listen = value.parse::<SocketAddr>().map_err(|err| err.to_string())?;
            }
            "--token" => {
                let value = args.next().ok_or("--token requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--token requires a non-empty value".to_string());
                }
                token = Some(trimmed.to_string());
            }
            "--data-dir" => {
                let value = args.next().ok_or("--data-dir requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--data-dir requires a non-empty value".to_string());
                }
                data_dir = Some(PathBuf::from(trimmed));
            }
            "--insecure-no-auth" => {
                insecure_no_auth = true;
                token = None;
            }
            _ => return Err(format!("Unknown argument: {arg}")),
        }
    }

    if token.is_none() && !insecure_no_auth {
        return Err(
            "Missing --token (or set CODEX_MONITOR_DAEMON_TOKEN). Use --insecure-no-auth for local dev only."
                .to_string(),
        );
    }

    Ok(DaemonConfig {
        listen,
        token,
        data_dir: data_dir.unwrap_or_else(default_data_dir),
    })
}

fn build_error_response(id: Option<u64>, message: &str) -> Option<String> {
    let id = id?;
    Some(
        serde_json::to_string(&json!({
            "id": id,
            "error": { "message": message }
        }))
        .unwrap_or_else(|_| "{\"id\":0,\"error\":{\"message\":\"serialization failed\"}}".to_string()),
    )
}

fn build_result_response(id: Option<u64>, result: Value) -> Option<String> {
    let id = id?;
    Some(serde_json::to_string(&json!({ "id": id, "result": result })).unwrap_or_else(|_| {
        "{\"id\":0,\"error\":{\"message\":\"serialization failed\"}}".to_string()
    }))
}

fn build_event_notification(event: DaemonEvent) -> Option<String> {
    let payload = match event {
        DaemonEvent::AppServer(payload) => json!({
            "method": "app-server-event",
            "params": payload,
        }),
        DaemonEvent::TerminalOutput(payload) => json!({
            "method": "terminal-output",
            "params": payload,
        }),
    };
    serde_json::to_string(&payload).ok()
}

fn parse_auth_token(params: &Value) -> Option<String> {
    match params {
        Value::String(value) => Some(value.clone()),
        Value::Object(map) => map
            .get("token")
            .and_then(|value| value.as_str())
            .map(|v| v.to_string()),
        _ => None,
    }
}

fn parse_string(value: &Value, key: &str) -> Result<String, String> {
    match value {
        Value::Object(map) => map
            .get(key)
            .and_then(|value| value.as_str())
            .map(|value| value.to_string())
            .ok_or_else(|| format!("missing or invalid `{key}`")),
        _ => Err(format!("missing `{key}`")),
    }
}

fn parse_optional_string(value: &Value, key: &str) -> Option<String> {
    match value {
        Value::Object(map) => map
            .get(key)
            .and_then(|value| value.as_str())
            .map(|v| v.to_string()),
        _ => None,
    }
}

fn parse_optional_u32(value: &Value, key: &str) -> Option<u32> {
    match value {
        Value::Object(map) => map.get(key).and_then(|value| value.as_u64()).and_then(|v| {
            if v > u32::MAX as u64 {
                None
            } else {
                Some(v as u32)
            }
        }),
        _ => None,
    }
}

fn parse_optional_bool(value: &Value, key: &str) -> Option<bool> {
    match value {
        Value::Object(map) => map.get(key).and_then(|value| value.as_bool()),
        _ => None,
    }
}

fn parse_optional_string_array(value: &Value, key: &str) -> Option<Vec<String>> {
    match value {
        Value::Object(map) => map.get(key).and_then(|value| value.as_array()).map(|items| {
            items
                .iter()
                .filter_map(|item| item.as_str().map(|value| value.to_string()))
                .collect::<Vec<_>>()
        }),
        _ => None,
    }
}

async fn handle_rpc_request(
    state: &DaemonState,
    method: &str,
    params: Value,
    client_version: String,
) -> Result<Value, String> {
    match method {
        "ping" => Ok(json!({ "ok": true })),
        "list_workspaces" => {
            let workspaces = state.list_workspaces().await;
            serde_json::to_value(workspaces).map_err(|err| err.to_string())
        }
        "add_workspace" => {
            let path = parse_string(&params, "path")?;
            let codex_bin = parse_optional_string(&params, "codex_bin");
            let workspace = state.add_workspace(path, codex_bin, client_version).await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "connect_workspace" => {
            let id = parse_string(&params, "id")?;
            state.connect_workspace(id, client_version).await?;
            Ok(json!({ "ok": true }))
        }
        "list_workspace_files" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let files = state.list_workspace_files(workspace_id).await?;
            serde_json::to_value(files).map_err(|err| err.to_string())
        }
        "get_app_settings" => {
            let mut settings = state.app_settings.lock().await.clone();
            if let Ok(Some(collab_enabled)) = codex_config::read_collab_enabled() {
                settings.experimental_collab_enabled = collab_enabled;
            }
            if let Ok(Some(steer_enabled)) = codex_config::read_steer_enabled() {
                settings.experimental_steer_enabled = steer_enabled;
            }
            if let Ok(Some(unified_exec_enabled)) = codex_config::read_unified_exec_enabled() {
                settings.experimental_unified_exec_enabled = unified_exec_enabled;
            }
            serde_json::to_value(settings).map_err(|err| err.to_string())
        }
        "update_app_settings" => {
            let settings_value = match params {
                Value::Object(map) => map.get("settings").cloned().unwrap_or(Value::Null),
                _ => Value::Null,
            };
            let settings: AppSettings =
                serde_json::from_value(settings_value).map_err(|err| err.to_string())?;
            let updated = state.update_app_settings(settings).await?;
            serde_json::to_value(updated).map_err(|err| err.to_string())
        }
        "start_thread" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.start_thread(workspace_id).await
        }
        "resume_thread" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            state.resume_thread(workspace_id, thread_id).await
        }
        "list_threads" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let cursor = parse_optional_string(&params, "cursor");
            let limit = parse_optional_u32(&params, "limit");
            state.list_threads(workspace_id, cursor, limit).await
        }
        "archive_thread" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            state.archive_thread(workspace_id, thread_id).await
        }
        "send_user_message" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            let text = parse_string(&params, "text")?;
            let model = parse_optional_string(&params, "model");
            let effort = parse_optional_string(&params, "effort");
            let access_mode = parse_optional_string(&params, "accessMode");
            let images = parse_optional_string_array(&params, "images");
            state
                .send_user_message(workspace_id, thread_id, text, model, effort, access_mode, images)
                .await
        }
        "turn_interrupt" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            let turn_id = parse_string(&params, "turnId")?;
            state.turn_interrupt(workspace_id, thread_id, turn_id).await
        }
        "start_review" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            let target = params
                .as_object()
                .and_then(|map| map.get("target"))
                .cloned()
                .ok_or("missing `target`")?;
            let delivery = parse_optional_string(&params, "delivery");
            state.start_review(workspace_id, thread_id, target, delivery).await
        }
        "model_list" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.model_list(workspace_id).await
        }
        "account_rate_limits" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.account_rate_limits(workspace_id).await
        }
        "skills_list" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.skills_list(workspace_id).await
        }
        "respond_to_server_request" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let map = params.as_object().ok_or("missing requestId")?;
            let request_id = map
                .get("requestId")
                .and_then(|value| value.as_u64())
                .ok_or("missing requestId")?;
            let result = map.get("result").cloned().ok_or("missing `result`")?;
            state
                .respond_to_server_request(workspace_id, request_id, result)
                .await
        }
        _ => Err(format!("unknown method: {method}")),
    }
}

async fn forward_events(
    mut rx: broadcast::Receiver<DaemonEvent>,
    out_tx_events: mpsc::UnboundedSender<String>,
) {
    loop {
        let event = match rx.recv().await {
            Ok(event) => event,
            Err(broadcast::error::RecvError::Lagged(_)) => continue,
            Err(broadcast::error::RecvError::Closed) => break,
        };

        let Some(payload) = build_event_notification(event) else {
            continue;
        };

        if out_tx_events.send(payload).is_err() {
            break;
        }
    }
}

async fn handle_client(
    socket: TcpStream,
    config: Arc<DaemonConfig>,
    state: Arc<DaemonState>,
    events: broadcast::Sender<DaemonEvent>,
) {
    let (reader, mut writer) = socket.into_split();
    let mut lines = BufReader::new(reader).lines();

    let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();
    let write_task = tokio::spawn(async move {
        while let Some(message) = out_rx.recv().await {
            if writer.write_all(message.as_bytes()).await.is_err() {
                break;
            }
            if writer.write_all(b"\n").await.is_err() {
                break;
            }
        }
    });

    let mut authenticated = config.token.is_none();
    let mut events_task: Option<tokio::task::JoinHandle<()>> = None;

    if authenticated {
        let rx = events.subscribe();
        let out_tx_events = out_tx.clone();
        events_task = Some(tokio::spawn(forward_events(rx, out_tx_events)));
    }

    while let Ok(Some(line)) = lines.next_line().await {
        let line = line.trim();
        if line.is_empty() {
            continue;
        }

        let message: Value = match serde_json::from_str(line) {
            Ok(value) => value,
            Err(_) => continue,
        };

        let id = message.get("id").and_then(|value| value.as_u64());
        let method = message
            .get("method")
            .and_then(|value| value.as_str())
            .unwrap_or("")
            .to_string();
        let params = message.get("params").cloned().unwrap_or(Value::Null);

        if !authenticated {
            if method != "auth" {
                if let Some(response) = build_error_response(id, "unauthorized") {
                    let _ = out_tx.send(response);
                }
                continue;
            }

            let expected = config.token.clone().unwrap_or_default();
            let provided = parse_auth_token(&params).unwrap_or_default();
            if expected != provided {
                if let Some(response) = build_error_response(id, "invalid token") {
                    let _ = out_tx.send(response);
                }
                continue;
            }

            authenticated = true;
            if let Some(response) = build_result_response(id, json!({ "ok": true })) {
                let _ = out_tx.send(response);
            }

            let rx = events.subscribe();
            let out_tx_events = out_tx.clone();
            events_task = Some(tokio::spawn(forward_events(rx, out_tx_events)));

            continue;
        }

        let client_version = format!("daemon-{}", env!("CARGO_PKG_VERSION"));
        let result = handle_rpc_request(&state, &method, params, client_version).await;
        let response = match result {
            Ok(result) => build_result_response(id, result),
            Err(message) => build_error_response(id, &message),
        };
        if let Some(response) = response {
            let _ = out_tx.send(response);
        }
    }

    drop(out_tx);
    if let Some(task) = events_task {
        task.abort();
    }
    write_task.abort();
}

fn main() {
    let config = match parse_args() {
        Ok(config) => config,
        Err(err) => {
            eprintln!("{err}\n\n{}", usage());
            std::process::exit(2);
        }
    };

    let runtime = tokio::runtime::Builder::new_current_thread()
        .enable_all()
        .build()
        .expect("failed to build tokio runtime");

    runtime.block_on(async move {
        let (events_tx, _events_rx) = broadcast::channel::<DaemonEvent>(2048);
        let event_sink = DaemonEventSink {
            tx: events_tx.clone(),
        };
        let state = Arc::new(DaemonState::load(&config, event_sink));
        let config = Arc::new(config);

        let listener = TcpListener::bind(config.listen)
            .await
            .unwrap_or_else(|err| panic!("failed to bind {}: {err}", config.listen));
        eprintln!(
            "codex-monitor-daemon listening on {} (data dir: {})",
            config.listen,
            state
                .storage_path
                .parent()
                .unwrap_or(&state.storage_path)
                .display()
        );

        loop {
            match listener.accept().await {
                Ok((socket, _addr)) => {
                    let config = Arc::clone(&config);
                    let state = Arc::clone(&state);
                    let events = events_tx.clone();
                    tokio::spawn(async move {
                        handle_client(socket, config, state, events).await;
                    });
                }
                Err(_) => continue,
            }
        }
    });
}
