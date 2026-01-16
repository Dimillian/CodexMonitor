use std::collections::{HashMap, HashSet};
use std::time::{Duration, Instant};

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use sha2::{Digest, Sha256};
use tauri::{AppHandle, Manager, State};
use tokio::sync::mpsc;
use tokio::sync::oneshot;
use tokio::time::sleep;

use crate::codex::spawn_workspace_session;
use crate::state::AppState;
use crate::types::{WorkspaceInfo, WorkspaceKind};

#[derive(Debug, Clone)]
pub(crate) enum TelegramEvent {
    AppServerEvent { workspace_id: String, message: Value },
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TelegramBotStatus {
    pub(crate) ok: bool,
    pub(crate) username: Option<String>,
    pub(crate) id: Option<i64>,
    pub(crate) error: Option<String>,
}

#[derive(Debug, Clone)]
struct TelegramConfig {
    enabled: bool,
    token: Option<String>,
    allowed_user_ids: Vec<i64>,
    default_chat_id: Option<i64>,
    send_app_status: bool,
    send_completed: bool,
    pairing_secret: String,
    default_access_mode: String,
}

fn compute_pairing_code(secret: &str) -> String {
    let digest = Sha256::digest(secret.as_bytes());
    // 16 bytes -> 32 hex chars (easy to type, still collision-resistant for our use).
    hex::encode(&digest[..16])
}

fn normalize_text_preview(value: &str) -> String {
    let trimmed = value.trim().replace('\n', " ");
    if trimmed.chars().count() > 80 {
        trimmed.chars().take(77).collect::<String>() + "…"
    } else {
        trimmed
    }
}

fn thread_key(workspace_id: &str, thread_id: &str) -> String {
    format!("{workspace_id}::{thread_id}")
}

fn normalize_status_label(value: &str) -> String {
    let trimmed = value.trim().replace('\n', " ");
    if trimmed.is_empty() {
        return "(untitled)".to_string();
    }
    // Keep status output compact like the sidebar list.
    if trimmed.chars().count() > 46 {
        trimmed.chars().take(43).collect::<String>() + "…"
    } else {
        trimmed
    }
}

fn build_status_keyboard(items: &[TelegramStatusButton]) -> Value {
    let mut rows: Vec<Vec<Value>> = Vec::new();
    for item in items {
        rows.push(vec![json!({
            "text": item.label,
            "callback_data": item.callback_data,
        })]);
    }
    rows.push(vec![json!({"text":"🔄 Refresh","callback_data":"status:refresh"}), json!({"text":"🔌 Disconnect","callback_data":"disconnect"})]);
    json!({ "inline_keyboard": rows })
}

fn build_main_reply_keyboard() -> Value {
    json!({
        "keyboard": [
            [{ "text": "📊 Status" }, { "text": "🔌 Disconnect" }],
        ],
        "resize_keyboard": true,
    })
}

const TELEGRAM_MAX_TEXT_CHARS: usize = 4096;
// Keep a little headroom for any formatting/escaping and future additions.
const TELEGRAM_SAFE_TEXT_CHARS: usize = 3800;

fn count_chars(value: &str) -> usize {
    value.chars().count()
}

fn split_telegram_text(value: &str, limit: usize) -> Vec<String> {
    if value.is_empty() {
        return vec![String::new()];
    }

    let mut chunks: Vec<String> = Vec::new();
    let mut current = String::new();

    for part in value.split_inclusive('\n') {
        if !current.is_empty() && count_chars(&current) + count_chars(part) > limit {
            chunks.push(current.trim_end_matches('\n').to_string());
            current.clear();
        }

        if count_chars(part) > limit {
            let mut buf = String::new();
            for ch in part.chars() {
                if count_chars(&buf) + 1 > limit {
                    chunks.push(buf.trim_end_matches('\n').to_string());
                    buf.clear();
                }
                buf.push(ch);
            }
            if !buf.is_empty() {
                current.push_str(&buf);
            }
        } else {
            current.push_str(part);
        }
    }

    if !current.is_empty() {
        chunks.push(current.trim_end_matches('\n').to_string());
    }

    // Telegram hard limit safety (shouldn't be hit with our limits, but keep robust).
    chunks
        .into_iter()
        .flat_map(|chunk| {
            if count_chars(&chunk) <= TELEGRAM_MAX_TEXT_CHARS {
                vec![chunk]
            } else {
                let mut split: Vec<String> = Vec::new();
                let mut buf = String::new();
                for ch in chunk.chars() {
                    if count_chars(&buf) + 1 > TELEGRAM_MAX_TEXT_CHARS {
                        split.push(buf);
                        buf = String::new();
                    }
                    buf.push(ch);
                }
                if !buf.is_empty() {
                    split.push(buf);
                }
                split
            }
        })
        .collect()
}

fn build_connected_inline_keyboard() -> Value {
    json!({
        "inline_keyboard": [
            [
                { "text": "📊 Status", "callback_data": "status:refresh" },
                { "text": "🔌 Disconnect", "callback_data": "disconnect" }
            ]
        ]
    })
}

#[derive(Debug, Clone)]
struct TelegramStatusButton {
    label: String,
    callback_data: String,
}

#[derive(Debug, Clone)]
struct ThreadSelection {
    workspace_id: String,
    thread_id: String,
    label: String,
}

#[derive(Debug, Clone)]
struct PendingReply {
    chat_id: i64,
    message_id: i64,
    workspace_id: String,
    thread_id: String,
    turn_id: String,
    thread_label: String,
    created_at: Instant,
}

#[derive(Debug, Deserialize)]
struct TelegramResponse<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    update_id: i64,
    message: Option<TelegramMessage>,
    edited_message: Option<TelegramMessage>,
    callback_query: Option<TelegramCallbackQuery>,
}

#[derive(Debug, Deserialize)]
struct TelegramCallbackQuery {
    id: Option<String>,
    from: Option<TelegramUser>,
    message: Option<TelegramMessage>,
    data: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramUser {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct TelegramMessage {
    message_id: i64,
    chat: TelegramChat,
    from: Option<TelegramUser>,
    text: Option<String>,
    photo: Option<Vec<TelegramPhotoSize>>,
    caption: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramChat {
    id: i64,
}

#[derive(Debug, Deserialize)]
struct TelegramPhotoSize {
    file_id: String,
    width: Option<i64>,
    height: Option<i64>,
    file_size: Option<i64>,
}

#[derive(Debug, Deserialize)]
struct TelegramBotInfo {
    id: i64,
    username: Option<String>,
}

#[derive(Clone)]
struct TelegramApi {
    client: reqwest::Client,
}

impl TelegramApi {
    fn new() -> Self {
        Self {
            client: reqwest::Client::new(),
        }
    }

    async fn call<T: for<'de> Deserialize<'de>>(
        &self,
        token: &str,
        method: &str,
        params: Vec<(&str, String)>,
    ) -> Result<T, String> {
        let url = format!("https://api.telegram.org/bot{token}/{method}");
        let res = self
            .client
            .post(url)
            .form(&params)
            .send()
            .await
            .map_err(|e| e.to_string())?;
        let status = res.status();
        let text = res.text().await.map_err(|e| e.to_string())?;
        if !status.is_success() {
            return Err(format!("Telegram API error: HTTP {status} {text}"));
        }
        serde_json::from_str::<T>(&text).map_err(|e| format!("{e}: {text}"))
    }

    async fn get_me(&self, token: &str) -> Result<TelegramBotInfo, String> {
        let response: TelegramResponse<TelegramBotInfo> = self.call(token, "getMe", vec![]).await?;
        if response.ok {
            response
                .result
                .ok_or_else(|| "Telegram getMe: missing result".to_string())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram getMe failed".to_string()))
        }
    }

    async fn get_updates(
        &self,
        token: &str,
        offset: Option<i64>,
    ) -> Result<Vec<TelegramUpdate>, String> {
        let mut params = vec![("timeout", "50".to_string())];
        if let Some(offset) = offset {
            params.push(("offset", offset.to_string()));
        }
        // Only the update types we actually handle.
        params.push((
            "allowed_updates",
            r#"["message","edited_message","callback_query"]"#.to_string(),
        ));
        let response: TelegramResponse<Vec<TelegramUpdate>> =
            self.call(token, "getUpdates", params).await?;
        if response.ok {
            Ok(response.result.unwrap_or_default())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram getUpdates failed".to_string()))
        }
    }

    async fn send_message(
        &self,
        token: &str,
        chat_id: i64,
        text: &str,
        reply_markup: Option<Value>,
    ) -> Result<TelegramMessage, String> {
        let mut params = vec![("chat_id", chat_id.to_string()), ("text", text.to_string())];
        if let Some(markup) = reply_markup {
            params.push((
                "reply_markup",
                serde_json::to_string(&markup).map_err(|e| e.to_string())?,
            ));
        }
        let response: TelegramResponse<TelegramMessage> =
            self.call(token, "sendMessage", params).await?;
        if response.ok {
            response
                .result
                .ok_or_else(|| "Telegram sendMessage: missing result".to_string())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram sendMessage failed".to_string()))
        }
    }

    async fn edit_message_text(
        &self,
        token: &str,
        chat_id: i64,
        message_id: i64,
        text: &str,
        reply_markup: Option<Value>,
    ) -> Result<(), String> {
        let mut params = vec![
            ("chat_id", chat_id.to_string()),
            ("message_id", message_id.to_string()),
            ("text", text.to_string()),
        ];
        if let Some(markup) = reply_markup {
            params.push((
                "reply_markup",
                serde_json::to_string(&markup).map_err(|e| e.to_string())?,
            ));
        }
        let response: TelegramResponse<Value> = self.call(token, "editMessageText", params).await?;
        if response.ok {
            Ok(())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram editMessageText failed".to_string()))
        }
    }

    async fn delete_message(
        &self,
        token: &str,
        chat_id: i64,
        message_id: i64,
    ) -> Result<(), String> {
        let params = vec![
            ("chat_id", chat_id.to_string()),
            ("message_id", message_id.to_string()),
        ];
        let response: TelegramResponse<Value> = self.call(token, "deleteMessage", params).await?;
        if response.ok {
            Ok(())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram deleteMessage failed".to_string()))
        }
    }

    async fn answer_callback_query(
        &self,
        token: &str,
        callback_query_id: &str,
        text: Option<&str>,
    ) -> Result<(), String> {
        let mut params = vec![("callback_query_id", callback_query_id.to_string())];
        if let Some(text) = text {
            params.push(("text", text.to_string()));
        }
        let response: TelegramResponse<Value> =
            self.call(token, "answerCallbackQuery", params).await?;
        if response.ok {
            Ok(())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram answerCallbackQuery failed".to_string()))
        }
    }

    async fn send_chat_action(&self, token: &str, chat_id: i64, action: &str) -> Result<(), String> {
        let params = vec![
            ("chat_id", chat_id.to_string()),
            ("action", action.to_string()),
        ];
        let response: TelegramResponse<Value> =
            self.call(token, "sendChatAction", params).await?;
        if response.ok {
            Ok(())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram sendChatAction failed".to_string()))
        }
    }

    async fn get_file_path(&self, token: &str, file_id: &str) -> Result<Option<String>, String> {
        #[derive(Debug, Deserialize)]
        struct FileResult {
            file_path: Option<String>,
        }
        #[derive(Debug, Deserialize)]
        struct FileResponse {
            ok: bool,
            result: Option<FileResult>,
            description: Option<String>,
        }
        let params = vec![("file_id", file_id.to_string())];
        let response: FileResponse = self.call(token, "getFile", params).await?;
        if response.ok {
            Ok(response.result.and_then(|r| r.file_path))
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram getFile failed".to_string()))
        }
    }
}

async fn send_message_long(
    api: &TelegramApi,
    token: &str,
    chat_id: i64,
    text: &str,
    reply_markup: Option<Value>,
) -> Result<Vec<TelegramMessage>, String> {
    let chunks = split_telegram_text(text, TELEGRAM_SAFE_TEXT_CHARS);
    let mut sent: Vec<TelegramMessage> = Vec::new();
    for (idx, chunk) in chunks.iter().enumerate() {
        let markup = if idx == 0 { reply_markup.clone() } else { None };
        let msg = api.send_message(token, chat_id, chunk, markup).await?;
        sent.push(msg);
    }
    Ok(sent)
}

async fn edit_message_text_long(
    api: &TelegramApi,
    token: &str,
    chat_id: i64,
    message_id: i64,
    text: &str,
    reply_markup: Option<Value>,
) -> Result<(), String> {
    let chunks = split_telegram_text(text, TELEGRAM_SAFE_TEXT_CHARS);
    let first = chunks.first().cloned().unwrap_or_default();

    match api
        .edit_message_text(token, chat_id, message_id, &first, reply_markup.clone())
        .await
    {
        Ok(()) => {}
        Err(_) => {
            // Edits can fail if Telegram rejects the payload (e.g. length). Keep the inline
            // keyboard and send the full content in follow-up messages.
            let _ = api
                .edit_message_text(
                    token,
                    chat_id,
                    message_id,
                    "✅ Done. (see reply below)",
                    reply_markup,
                )
                .await;
            send_message_long(api, token, chat_id, text, Some(build_main_reply_keyboard())).await?;
            return Ok(());
        }
    }

    for chunk in chunks.iter().skip(1) {
        let _ = api
            .send_message(token, chat_id, chunk, Some(build_main_reply_keyboard()))
            .await?;
    }

    Ok(())
}

async fn animate_working_message(
    api: TelegramApi,
    token: String,
    chat_id: i64,
    message_id: i64,
    label: String,
    mut cancel: oneshot::Receiver<()>,
) {
    // Keep it lightweight to avoid Telegram rate limits.
    let frames = [
        "⏳ Working",
        "⏳ Working.",
        "⏳ Working..",
        "⏳ Working...",
    ];
    let mut idx: usize = 0;
    loop {
        let next = format!("{frame}\n\n➡️ Sending to:\n{label}", frame = frames[idx], label = label);
        idx = (idx + 1) % frames.len();

        tokio::select! {
            _ = &mut cancel => {
                break;
            }
            _ = sleep(Duration::from_millis(1200)) => {
                // Best-effort. If edits fail (message deleted / too old / etc.), stop animating.
                if api.edit_message_text(&token, chat_id, message_id, &next, None).await.is_err() {
                    break;
                }
            }
        }
    }
}

fn read_config(settings: &crate::types::AppSettings) -> TelegramConfig {
    TelegramConfig {
        enabled: settings.telegram_enabled,
        token: settings
            .telegram_bot_token
            .clone()
            .filter(|value| !value.trim().is_empty()),
        allowed_user_ids: settings.telegram_allowed_user_ids.clone(),
        default_chat_id: settings.telegram_default_chat_id,
        send_app_status: settings.telegram_send_app_status,
        send_completed: settings.telegram_send_completed_messages,
        pairing_secret: settings.telegram_pairing_secret.clone(),
        default_access_mode: settings.default_access_mode.clone(),
    }
}

pub(crate) async fn notify_app_exit(app: AppHandle) {
    let api = TelegramApi::new();
    let config = {
        let state = app.state::<AppState>();
        let settings = state.app_settings.lock().await;
        read_config(&settings)
    };

    if !config.enabled || !config.send_app_status {
        return;
    }
    let (Some(token), Some(chat_id)) = (config.token, config.default_chat_id) else {
        return;
    };
    let _ = api
        .send_message(
            &token,
            chat_id,
            "🛑 CodexMonitor stopped.",
            Some(build_main_reply_keyboard()),
        )
        .await;
}

pub(crate) fn start_telegram_poller(app: AppHandle) {
    tauri::async_runtime::spawn(async move {
        let (tx, rx) = mpsc::unbounded_channel::<TelegramEvent>();
        let state = app.state::<AppState>();
        *state.telegram_tx.lock().await = Some(tx);
        telegram_loop(app, rx).await;
    });
}

pub(crate) fn emit_app_server_event(app: AppHandle, workspace_id: String, message: Value) {
    tauri::async_runtime::spawn(async move {
        let state = app.state::<AppState>();
        let maybe_tx = state.telegram_tx.lock().await.clone();
        if let Some(tx) = maybe_tx {
            let _ = tx.send(TelegramEvent::AppServerEvent { workspace_id, message });
        }
    });
}

#[tauri::command]
pub(crate) async fn telegram_bot_status(state: State<'_, AppState>) -> Result<TelegramBotStatus, String> {
    let settings = state.app_settings.lock().await;
    let config = read_config(&settings);
    let token = config
        .token
        .ok_or_else(|| "Telegram token is not configured.".to_string())?;
    let api = TelegramApi::new();
    match api.get_me(&token).await {
        Ok(info) => Ok(TelegramBotStatus {
            ok: true,
            username: info.username,
            id: Some(info.id),
            error: None,
        }),
        Err(err) => Ok(TelegramBotStatus {
            ok: false,
            username: None,
            id: None,
            error: Some(err),
        }),
    }
}

async fn ensure_workspace_connected(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    {
        let sessions = state.sessions.lock().await;
        if let Some(session) = sessions.get(workspace_id) {
            let mut child = session.child.lock().await;
            match child.try_wait() {
                Ok(Some(_)) => {
                    // Dead session: fall through and respawn below.
                }
                Ok(None) => return Ok(()),
                Err(_) => return Ok(()),
            }
        }
    }
    let entry = {
        let workspaces = state.workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .cloned()
            .ok_or("workspace not found")?
    };
    let default_bin = {
        let settings = state.app_settings.lock().await;
        settings.codex_bin.clone()
    };
    let session = spawn_workspace_session(entry.clone(), default_bin, app.clone()).await?;
    state.sessions.lock().await.insert(entry.id, session);
    Ok(())
}

async fn telegram_loop(app: AppHandle, mut rx: mpsc::UnboundedReceiver<TelegramEvent>) {
    let api = TelegramApi::new();
    let mut last_config: Option<TelegramConfig> = None;
    let mut offset: Option<i64> = None;

    let mut selections: HashMap<i64, ThreadSelection> = HashMap::new();
    let mut pending: HashMap<String, PendingReply> = HashMap::new();
    // Thread key -> pending map key (workspace::thread::turn)
    let mut pending_by_thread: HashMap<String, String> = HashMap::new();
    let mut pending_animation_cancel: HashMap<String, oneshot::Sender<()>> = HashMap::new();
    let mut running_threads: HashSet<String> = HashSet::new();
    let mut sent_agent_item_ids: HashSet<String> = HashSet::new();
    let mut known_thread_labels: HashMap<String, String> = HashMap::new();

    let mut status_tokens: HashMap<String, ThreadSelection> = HashMap::new();
    let mut status_tokens_expires_at: HashMap<String, Instant> = HashMap::new();

    loop {
        let config = {
            let state = app.state::<AppState>();
            let settings = state.app_settings.lock().await;
            read_config(&settings)
        };

        if let Some(prev) = last_config.as_ref() {
            if prev.enabled && !config.enabled && prev.send_app_status {
                if let (Some(token), Some(chat_id)) = (prev.token.clone(), prev.default_chat_id) {
                    let _ = api
                        .send_message(
                            &token,
                            chat_id,
                            "🛑 CodexMonitor stopped.",
                            Some(build_main_reply_keyboard()),
                        )
                        .await;
                }
            }
        }

        if !config.enabled {
            last_config = Some(config);
            sleep(Duration::from_millis(750)).await;
            continue;
        }

        let Some(token) = config.token.clone() else {
            last_config = Some(config);
            sleep(Duration::from_millis(750)).await;
            continue;
        };

        if last_config
            .as_ref()
            .map(|prev| !prev.enabled && config.enabled)
            .unwrap_or(true)
        {
            if config.send_app_status {
                if let Some(chat_id) = config.default_chat_id {
                    let _ = api
                        .send_message(
                            &token,
                            chat_id,
                            "✅ CodexMonitor started.",
                            Some(build_main_reply_keyboard()),
                        )
                        .await;
                }
            }
        }
        last_config = Some(config.clone());

        // Cleanup expired tokens/pending.
        let now = Instant::now();
        status_tokens_expires_at.retain(|token, exp| {
            if *exp <= now {
                status_tokens.remove(token);
                false
            } else {
                true
            }
        });
        pending.retain(|_, pending| pending.created_at.elapsed() < Duration::from_secs(15 * 60));
        let valid_pending_keys: HashSet<String> = pending.keys().cloned().collect();
        pending_by_thread.retain(|_, key| valid_pending_keys.contains(key));
        pending_animation_cancel.retain(|key, _| valid_pending_keys.contains(key));

        tokio::select! {
            Some(event) = rx.recv() => {
                match event {
                    TelegramEvent::AppServerEvent { workspace_id, message } => {
                        let method = message.get("method").and_then(|v| v.as_str()).unwrap_or("");
                        let params = message.get("params").cloned().unwrap_or(Value::Null);
                        if method == "turn/started" {
                            if let Some(turn) = params.get("turn") {
                                let thread_id = turn.get("threadId").or_else(|| turn.get("thread_id")).and_then(|v| v.as_str()).unwrap_or("");
                                if !thread_id.is_empty() {
                                    running_threads.insert(thread_key(&workspace_id, thread_id));
                                }
                            }
                        }
                        if method == "turn/completed" || method == "error" {
                            if let Some(turn) = params.get("turn") {
                                let thread_id = turn.get("threadId").or_else(|| turn.get("thread_id")).and_then(|v| v.as_str()).unwrap_or("");
                                if !thread_id.is_empty() {
                                    running_threads.remove(&thread_key(&workspace_id, thread_id));
                                }
                            } else {
                                let thread_id = params.get("threadId").or_else(|| params.get("thread_id")).and_then(|v| v.as_str()).unwrap_or("");
                                if !thread_id.is_empty() {
                                    running_threads.remove(&thread_key(&workspace_id, thread_id));
                                }
                            }
                        }

                        if method == "item/completed" {
                            let thread_id = params.get("threadId").or_else(|| params.get("thread_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();
                            let item = params.get("item").cloned().unwrap_or(Value::Null);
                            let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                            if item_type == "agentMessage" {
                                let item_id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                                let turn_id = item.get("turnId").or_else(|| item.get("turn_id")).and_then(|v| v.as_str()).unwrap_or("").to_string();

                                if !item_id.is_empty() && sent_agent_item_ids.contains(&item_id) {
                                    continue;
                                }
                                if !item_id.is_empty() {
                                    sent_agent_item_ids.insert(item_id.clone());
                                }

                                // 1) Exact match: pending turn id equals this agentMessage turn id.
                                if !turn_id.is_empty() {
                                    let key = format!("{workspace_id}::{thread_id}::{turn_id}");
                                    if let Some(pending_entry) = pending.remove(&key) {
                                        pending_by_thread.remove(&thread_key(&workspace_id, &thread_id));
                                        let _token_key = ensure_thread_token(
                                            &pending_entry.workspace_id,
                                            &pending_entry.thread_id,
                                            &pending_entry.thread_label,
                                            &mut status_tokens,
                                            &mut status_tokens_expires_at,
                                        );
                                        let reply_text = if text.trim().is_empty() {
                                            format!("✅ {}\n\nDone.", pending_entry.thread_label)
                                        } else {
                                            format!("✅ {}\n\n{}", pending_entry.thread_label, text)
                                        };
                                        let reply_text = format!(
                                            "{reply_text}\n\n➡️ Next messages will go to:\n{}",
                                            pending_entry.thread_label
                                        );
                                        if let Some(cancel) = pending_animation_cancel.remove(&key) {
                                            let _ = cancel.send(());
                                        }
                                        let _ = api
                                            .delete_message(&token, pending_entry.chat_id, pending_entry.message_id)
                                            .await;
                                        let _ = send_message_long(
                                            &api,
                                            &token,
                                            pending_entry.chat_id,
                                            &reply_text,
                                            Some(build_main_reply_keyboard()),
                                        )
                                        .await;
                                        continue;
                                    }
                                }

                                // 2) Fallback: some app-server events don't include turn ids reliably.
                                // If we have a pending "working" message for this thread, consume it.
                                let tkey = thread_key(&workspace_id, &thread_id);
                                if let Some(pending_key) = pending_by_thread.get(&tkey).cloned() {
                                    if let Some(pending_entry) = pending.remove(&pending_key) {
                                        pending_by_thread.remove(&tkey);
                                        let _token_key = ensure_thread_token(
                                            &pending_entry.workspace_id,
                                            &pending_entry.thread_id,
                                            &pending_entry.thread_label,
                                            &mut status_tokens,
                                            &mut status_tokens_expires_at,
                                        );
                                        let reply_text = if text.trim().is_empty() {
                                            format!("✅ {}\n\nDone.", pending_entry.thread_label)
                                        } else {
                                            format!("✅ {}\n\n{}", pending_entry.thread_label, text)
                                        };
                                        let reply_text = format!(
                                            "{reply_text}\n\n➡️ Next messages will go to:\n{}",
                                            pending_entry.thread_label
                                        );
                                        if let Some(cancel) = pending_animation_cancel.remove(&pending_key) {
                                            let _ = cancel.send(());
                                        }
                                        let _ = api
                                            .delete_message(&token, pending_entry.chat_id, pending_entry.message_id)
                                            .await;
                                        let _ = send_message_long(
                                            &api,
                                            &token,
                                            pending_entry.chat_id,
                                            &reply_text,
                                            Some(build_main_reply_keyboard()),
                                        )
                                        .await;
                                        continue;
                                    }
                                }

                                if config.send_completed {
                                    if let Some(chat_id) = config.default_chat_id {
                                        let label = known_thread_labels
                                            .get(&thread_key(&workspace_id, &thread_id))
                                            .cloned()
                                            .unwrap_or_else(|| format!("Agent {thread_id}"));
                                        let token_key = ensure_thread_token(
                                            &workspace_id,
                                            &thread_id,
                                            &label,
                                            &mut status_tokens,
                                            &mut status_tokens_expires_at,
                                        );
                                        let preview = if text.trim().is_empty() {
                                            "✅ Agent completed.".to_string()
                                        } else {
                                            // For Telegram-only mode we prefer full answers rather than
                                            // abbreviated previews.
                                            format!("✅ {}\n\n{}", label, text)
                                        };
                                        let preview = format!(
                                            "{preview}\n\n➡️ Next messages will go to:\n{label}"
                                        );
                                        let _ = send_message_long(
                                            &api,
                                            &token,
                                            chat_id,
                                            &preview,
                                            Some(build_reply_after_completion(&token_key)),
                                        )
                                        .await;
                                    }
                                }
                            }
                        }
                    }
                }
            }
            updates = api.get_updates(&token, offset) => {
                let updates = match updates {
                    Ok(value) => value,
                    Err(_) => {
                        sleep(Duration::from_millis(750)).await;
                        continue;
                    }
                };
                for upd in updates {
                    offset = Some(upd.update_id + 1);

                    if let Some(callback) = upd.callback_query {
                        let from_id = callback.from.as_ref().map(|u| u.id);
                        let chat_id = callback.message.as_ref().map(|m| m.chat.id);
                        let msg_id = callback.message.as_ref().map(|m| m.message_id);
                        let data = callback.data.unwrap_or_default();

                        if let (Some(user_id), Some(chat_id), Some(msg_id)) = (from_id, chat_id, msg_id) {
                            if !config.allowed_user_ids.contains(&user_id) {
                                if let Some(cb_id) = callback.id.as_deref() {
                                    let _ = api.answer_callback_query(&token, cb_id, Some("Not authorized.")).await;
                                }
                                continue;
                            }

                            if data == "disconnect" {
                                selections.remove(&chat_id);
                                let _ = api
                                    .edit_message_text(
                                        &token,
                                        chat_id,
                                        msg_id,
                                        "🔌 Disconnected. Use /status to pick an agent.",
                                        None,
                                    )
                                    .await;
                                let _ = api
                                    .send_message(
                                        &token,
                                        chat_id,
                                        "Use the buttons below to continue.",
                                        Some(build_main_reply_keyboard()),
                                    )
                                    .await;
                                if let Some(cb_id) = callback.id.as_deref() {
                                    let _ = api.answer_callback_query(&token, cb_id, Some("Disconnected.")).await;
                                }
                                continue;
                            }

                            if data == "status:refresh" {
                                let _ = api.answer_callback_query(&token, callback.id.as_deref().unwrap_or(""), Some("Refreshing…")).await;
                                // Fallthrough: treat as /status from this chat.
                                let _ = send_status(&app, &api, &token, &config, chat_id, &running_threads, &mut status_tokens, &mut status_tokens_expires_at, &mut known_thread_labels).await;
                                continue;
                            }

                            if let Some(rest) = data.strip_prefix("select:") {
                                if let Some(sel) = status_tokens.get(rest).cloned() {
                                    known_thread_labels.insert(
                                        thread_key(&sel.workspace_id, &sel.thread_id),
                                        sel.label.clone(),
                                    );
                                    selections.insert(chat_id, sel.clone());
                                    let text = format!("✅ Connected. Send messages now.\n\nAgent: {}", sel.label);
                                    let _ = api
                                        .edit_message_text(
                                            &token,
                                            chat_id,
                                            msg_id,
                                            &text,
                                            Some(build_connected_inline_keyboard()),
                                        )
                                        .await;
                                    if let Ok(Some(preview)) = fetch_thread_preview(&app, &sel.workspace_id, &sel.thread_id).await {
                                        let last = normalize_text_preview(&preview);
                                        let _ = api
                                            .send_message(
                                                &token,
                                                chat_id,
                                                &format!("🧠 Last reply:\n{last}"),
                                                Some(build_main_reply_keyboard()),
                                            )
                                            .await;
                                    }
                                    if let Some(cb_id) = callback.id.as_deref() {
                                        let _ = api.answer_callback_query(&token, cb_id, Some("Connected.")).await;
                                    }
                                } else if let Some(cb_id) = callback.id.as_deref() {
                                    let _ = api.answer_callback_query(&token, cb_id, Some("Selection expired. Use /status again.")).await;
                                }
                                continue;
                            }

                            if let Some(rest) = data.strip_prefix("new:") {
                                if let Some(sel) = status_tokens.get(rest).cloned() {
                                    let _ = ensure_workspace_connected(&app, &sel.workspace_id).await;
                                    let thread_id = match start_new_thread(&app, &sel.workspace_id).await {
                                        Ok(id) => id,
                                        Err(err) => {
                                            let _ = api.edit_message_text(&token, chat_id, msg_id, &format!("Failed to start thread: {err}"), None).await;
                                            continue;
                                        }
                                    };
                                    let next_sel = ThreadSelection {
                                        workspace_id: sel.workspace_id,
                                        thread_id: thread_id.clone(),
                                        label: "New agent".to_string(),
                                    };
                                    known_thread_labels.insert(
                                        thread_key(&next_sel.workspace_id, &next_sel.thread_id),
                                        next_sel.label.clone(),
                                    );
                                    selections.insert(chat_id, next_sel.clone());
                                    let text = format!("🆕 New agent started.\n\nAgent: {}", next_sel.label);
                                    let _ = api
                                        .edit_message_text(
                                            &token,
                                            chat_id,
                                            msg_id,
                                            &text,
                                            Some(build_connected_inline_keyboard()),
                                        )
                                        .await;
                                    let _ = api
                                        .send_message(
                                            &token,
                                            chat_id,
                                            "Send a message to start.",
                                            Some(build_main_reply_keyboard()),
                                        )
                                        .await;
                                } else if let Some(cb_id) = callback.id.as_deref() {
                                    let _ = api.answer_callback_query(&token, cb_id, Some("Selection expired. Use /status again.")).await;
                                }
                                continue;
                            }
                        }

                        if let Some(cb_id) = callback.id.as_deref() {
                            let _ = api.answer_callback_query(&token, cb_id, None).await;
                        }
                        continue;
                    }

                    let message = upd.message.or(upd.edited_message);
                    if let Some(message) = message {
                        let chat_id = message.chat.id;
                        let user_id = message.from.as_ref().map(|u| u.id);
                        let text = message.text.clone().or(message.caption.clone()).unwrap_or_default();
                        let trimmed = text.trim().to_string();

                        // Always allow pairing if the code matches.
                        if let Some(rest) = trimmed.strip_prefix("/link ") {
                            let expected = compute_pairing_code(&config.pairing_secret);
                            if rest.trim() == expected {
                                if let Some(uid) = user_id {
                                    let _ = link_user(&app, uid, chat_id).await;
                                    let _ = api.send_message(&token, chat_id, "✅ Linked. Use /status to pick an agent.", Some(build_main_reply_keyboard())).await;
                                } else {
                                    let _ = api.send_message(&token, chat_id, "Failed to link: missing user id.", None).await;
                                }
                            } else {
                                let _ = api.send_message(&token, chat_id, "Invalid link code.", None).await;
                            }
                            continue;
                        }

                        let Some(uid) = user_id else {
                            continue;
                        };
                        if !config.allowed_user_ids.contains(&uid) {
                            let hint = "Not linked yet. Open CodexMonitor → Settings → Cloud → Telegram and send the /link code to this bot.";
                            let _ = api.send_message(&token, chat_id, hint, None).await;
                            continue;
                        }

                        if trimmed == "/start" || trimmed == "/help" {
                            let pairing = compute_pairing_code(&config.pairing_secret);
                            let msg = format!(
                                "🤖 CodexMonitor Telegram control\n\nCommands:\n/status - pick an agent\n/disconnect - detach\n\nIf you haven't linked yet, send:\n/link {pairing}"
                            );
                            let _ = api.send_message(&token, chat_id, &msg, Some(build_main_reply_keyboard())).await;
                            continue;
                        }

                        if trimmed == "/status" || trimmed.eq_ignore_ascii_case("status") || trimmed == "📊 Status" {
                            let _ = send_status(&app, &api, &token, &config, chat_id, &running_threads, &mut status_tokens, &mut status_tokens_expires_at, &mut known_thread_labels).await;
                            continue;
                        }

                        if trimmed == "/disconnect" || trimmed == "🔌 Disconnect" {
                            selections.remove(&chat_id);
                            let _ = api.send_message(&token, chat_id, "🔌 Disconnected. Use /status to pick an agent.", Some(build_main_reply_keyboard())).await;
                            continue;
                        }

                        let Some(selection) = selections.get(&chat_id).cloned() else {
                            let _ = api.send_message(&token, chat_id, "Pick an agent first: /status", Some(build_main_reply_keyboard())).await;
                            continue;
                        };

                        if ensure_workspace_connected(&app, &selection.workspace_id).await.is_err() {
                            let _ = api.send_message(&token, chat_id, "Workspace is not connected.", None).await;
                            continue;
                        }

                        let _ = api.send_chat_action(&token, chat_id, "typing").await;
                        let working = api
                            .send_message(
                                &token,
                                chat_id,
                                &format!("⏳ Working…\n\n➡️ Sending to:\n{}", selection.label),
                                Some(build_main_reply_keyboard()),
                            )
                            .await;
                        let working_msg_id = working.map(|m| m.message_id).unwrap_or(0);

                        let mut images: Vec<String> = Vec::new();
                        if let Some(photo) = message.photo.as_ref() {
                            if let Some(best) = photo.iter().max_by_key(|p| p.file_size.unwrap_or(0)) {
                                if let Ok(Some(path)) = api.get_file_path(&token, &best.file_id).await {
                                    images.push(format!("https://api.telegram.org/file/bot{token}/{path}"));
                                }
                            }
                        }

                        match send_to_codex(
                            &app,
                            &selection.workspace_id,
                            &selection.thread_id,
                            &trimmed,
                            &config.default_access_mode,
                            if images.is_empty() { None } else { Some(images) },
                        ).await {
                            Ok(turn_id) => {
                                if working_msg_id != 0 && !turn_id.trim().is_empty() {
                                    let key = format!("{}::{}::{}", selection.workspace_id, selection.thread_id, turn_id);
                                    let tkey = thread_key(&selection.workspace_id, &selection.thread_id);
                                    pending_by_thread.insert(tkey, key.clone());

                                    let (cancel_tx, cancel_rx) = oneshot::channel::<()>();
                                    pending_animation_cancel.insert(key.clone(), cancel_tx);
                                    tauri::async_runtime::spawn(animate_working_message(
                                        api.clone(),
                                        token.clone(),
                                        chat_id,
                                        working_msg_id,
                                        selection.label.clone(),
                                        cancel_rx,
                                    ));

                                    pending.insert(key, PendingReply {
                                        chat_id,
                                        message_id: working_msg_id,
                                        workspace_id: selection.workspace_id,
                                        thread_id: selection.thread_id,
                                        turn_id: turn_id.clone(),
                                        thread_label: selection.label,
                                        created_at: Instant::now(),
                                    });
                                } else if working_msg_id != 0 {
                                    let _ = api.edit_message_text(&token, chat_id, working_msg_id, "✅ Sent.", None).await;
                                }
                            }
                            Err(err) => {
                                if working_msg_id != 0 {
                                    let _ = api.edit_message_text(&token, chat_id, working_msg_id, &format!("❌ {err}"), None).await;
                                } else {
                                    let _ = api.send_message(&token, chat_id, &format!("❌ {err}"), None).await;
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

fn short_token_digest(value: &[u8]) -> String {
    // 8 bytes => 16 hex chars; fits safely into Telegram callback_data limits.
    hex::encode(&value[..8])
}

fn thread_token_for(workspace_id: &str, thread_id: &str) -> String {
    let digest = Sha256::digest(format!("{workspace_id}:{thread_id}").as_bytes());
    format!("t{}", short_token_digest(&digest))
}

fn workspace_token_for(workspace_id: &str) -> String {
    let digest = Sha256::digest(workspace_id.as_bytes());
    format!("w{}", short_token_digest(&digest))
}

fn ensure_thread_token(
    workspace_id: &str,
    thread_id: &str,
    label: &str,
    status_tokens: &mut HashMap<String, ThreadSelection>,
    status_tokens_expires_at: &mut HashMap<String, Instant>,
) -> String {
    let token_key = thread_token_for(workspace_id, thread_id);
    status_tokens.insert(
        token_key.clone(),
        ThreadSelection {
            workspace_id: workspace_id.to_string(),
            thread_id: thread_id.to_string(),
            label: label.to_string(),
        },
    );
    status_tokens_expires_at.insert(
        token_key.clone(),
        Instant::now() + Duration::from_secs(10 * 60),
    );
    token_key
}

fn build_reply_after_completion(_token_key: &str) -> Value {
    json!({
        "inline_keyboard": [
            [{ "text": "📊 Status", "callback_data": "status:refresh" }, { "text": "🔌 Disconnect", "callback_data": "disconnect" }]
        ]
    })
}

async fn start_new_thread(app: &AppHandle, workspace_id: &str) -> Result<String, String> {
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions.get(workspace_id).ok_or("workspace not connected")?;
    let params = json!({
        "cwd": session.entry.path,
        "approvalPolicy": "on-request"
    });
    let response = session.send_request("thread/start", params).await?;
    let thread_id = response
        .get("result")
        .and_then(|result| result.get("thread"))
        .and_then(|thread| thread.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    if thread_id.is_empty() {
        Err("thread/start did not return a thread id".to_string())
    } else {
        Ok(thread_id)
    }
}

async fn send_to_codex(
    app: &AppHandle,
    workspace_id: &str,
    thread_id: &str,
    text: &str,
    access_mode: &str,
    images: Option<Vec<String>>,
) -> Result<String, String> {
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions.get(workspace_id).ok_or("workspace not connected")?;

    let sandbox_policy = match access_mode {
        "full-access" => json!({ "type": "dangerFullAccess" }),
        "read-only" => json!({ "type": "readOnly" }),
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
            let trimmed = path.trim().to_string();
            if trimmed.is_empty() {
                continue;
            }
            input.push(json!({ "type": "image", "url": trimmed }));
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
        "model": Value::Null,
        "effort": Value::Null,
    });
    let response = session.send_request("turn/start", params).await?;
    let turn_id = response
        .get("result")
        .and_then(|result| result.get("turn"))
        .and_then(|turn| turn.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();
    Ok(turn_id)
}

async fn link_user(app: &AppHandle, user_id: i64, chat_id: i64) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut settings = state.app_settings.lock().await;
    if !settings.telegram_allowed_user_ids.contains(&user_id) {
        settings.telegram_allowed_user_ids.push(user_id);
    }
    if settings.telegram_default_chat_id.is_none() {
        settings.telegram_default_chat_id = Some(chat_id);
    }
    crate::storage::write_settings(&state.settings_path, &settings)?;
    Ok(())
}

async fn send_status(
    app: &AppHandle,
    api: &TelegramApi,
    token: &str,
    config: &TelegramConfig,
    chat_id: i64,
    running_threads: &HashSet<String>,
    status_tokens: &mut HashMap<String, ThreadSelection>,
    status_tokens_expires_at: &mut HashMap<String, Instant>,
    known_thread_labels: &mut HashMap<String, String>,
) -> Result<(), String> {
    let workspaces = list_workspaces_info(app).await;
    if workspaces.is_empty() {
        api.send_message(
            token,
            chat_id,
            "No workspaces yet.",
            Some(build_main_reply_keyboard()),
        )
        .await?;
        return Ok(());
    }

    let mut text_lines: Vec<String> = Vec::new();
    let mut buttons: Vec<TelegramStatusButton> = Vec::new();

    for workspace in workspaces {
        text_lines.push(format!("#{}", workspace.name));
        let ws_id = workspace.id.clone();
        if let Err(err) = ensure_workspace_connected(app, &ws_id).await {
            text_lines.push(format!("  (failed to connect: {err})"));
            continue;
        }

        let mut threads: Vec<ThreadPreview> = Vec::new();
        let mut last_err: Option<String> = None;
        for attempt in 0..5 {
            match list_threads_preview(app, &ws_id).await {
                Ok(list) => {
                    if !list.is_empty() {
                        threads = list;
                        last_err = None;
                        break;
                    }
                    threads = list;
                }
                Err(err) => {
                    last_err = Some(err);
                }
            }
            if attempt < 4 {
                sleep(Duration::from_millis(950)).await;
            }
        }
        if threads.is_empty() {
            if let Some(err) = last_err {
                text_lines.push(format!("  (failed to list threads: {err})"));
            } else {
                text_lines.push("  (no threads yet — try /status again in a moment)".to_string());
            }
        } else {
            let max_threads = 7usize;
            for thread in threads.iter().take(max_threads) {
                let key = thread_key(&ws_id, &thread.thread_id);
                let icon = if running_threads.contains(&key) { "🔵" } else { "🟢" };
                text_lines.push(format!("  {icon} {}", thread.label));
            }
            if threads.len() > max_threads {
                text_lines.push(format!("  … {} more", threads.len() - max_threads));
            }
        }

        let tok = workspace_token_for(&ws_id);
        status_tokens.insert(
            tok.clone(),
            ThreadSelection {
                workspace_id: ws_id.clone(),
                thread_id: String::new(),
                label: workspace.name.clone(),
            },
        );
        status_tokens_expires_at.insert(tok.clone(), Instant::now() + Duration::from_secs(10 * 60));
        buttons.push(TelegramStatusButton {
            label: format!("➕ New agent · {}", workspace.name),
            callback_data: format!("new:{tok}"),
        });

        for thread in threads.iter().take(7) {
            known_thread_labels.insert(thread_key(&ws_id, &thread.thread_id), thread.label.clone());
            let token_key = thread_token_for(&ws_id, &thread.thread_id);
            status_tokens.insert(
                token_key.clone(),
                ThreadSelection {
                    workspace_id: ws_id.clone(),
                    thread_id: thread.thread_id.clone(),
                    label: thread.label.clone(),
                },
            );
            status_tokens_expires_at.insert(
                token_key.clone(),
                Instant::now() + Duration::from_secs(10 * 60),
            );
            buttons.push(TelegramStatusButton {
                label: thread.label.clone(),
                callback_data: format!("select:{token_key}"),
            });
        }
    }

    let header = if config.default_chat_id == Some(chat_id) {
        "📊 CodexMonitor status (notifications target)".to_string()
    } else {
        "📊 CodexMonitor status".to_string()
    };
    let body = if text_lines.is_empty() {
        "No workspaces.".to_string()
    } else {
        text_lines.join("\n")
    };
    let text = format!("{header}\n\n{body}");
    let _ = send_message_long(
        api,
        token,
        chat_id,
        &text,
        Some(build_status_keyboard(&buttons)),
    )
    .await?;
    Ok(())
}

#[derive(Debug, Clone)]
struct ThreadPreview {
    thread_id: String,
    label: String,
}

async fn list_threads_preview(app: &AppHandle, workspace_id: &str) -> Result<Vec<ThreadPreview>, String> {
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions.get(workspace_id).ok_or("workspace not connected")?;
    let workspace_path = session.entry.path.clone();
    let canonical_workspace = std::fs::canonicalize(&workspace_path)
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()));

    // App-server returns a paginated list in `result.data` + `result.nextCursor`.
    // Match the UI behavior and filter by cwd.
    let mut cursor: Option<String> = None;
    let mut collected: Vec<Value> = Vec::new();
    for _ in 0..3 {
        let response = session
            .send_request(
                "thread/list",
                json!({
                    "cursor": cursor,
                    "limit": 40,
                }),
            )
            .await?;
        let result = response.get("result").unwrap_or(&response);
        let data = result
            .get("data")
            .and_then(|v| v.as_array())
            .cloned()
            .unwrap_or_default();
        collected.extend(data);

        let next_cursor = result
            .get("nextCursor")
            .or_else(|| result.get("next_cursor"))
            .and_then(|v| v.as_str())
            .map(|v| v.to_string());

        cursor = next_cursor;
        if cursor.is_none() || collected.len() >= 80 {
            break;
        }
    }

    let mut threads: Vec<Value> = Vec::new();
    for thread in collected {
        let Some(cwd) = thread.get("cwd").and_then(|v| v.as_str()) else {
            continue;
        };
        if cwd == workspace_path {
            threads.push(thread);
            continue;
        }
        // Fallback: handle symlink/canonical path differences.
        if let (Some(cws), Ok(ccwd)) = (canonical_workspace.as_deref(), std::fs::canonicalize(cwd))
        {
            if let Some(ccwd_str) = ccwd.to_str() {
                if ccwd_str == cws {
                    threads.push(thread);
                }
            }
        }
    }
    let mut previews = Vec::new();
    for thread in threads {
        let id = thread.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let preview_text = thread
            .get("preview")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim()
            .to_string();
        let title = thread
            .get("title")
            .or_else(|| thread.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("");
        let label_source = if !preview_text.is_empty() {
            preview_text
        } else if !title.trim().is_empty() {
            title.to_string()
        } else {
            format!("Agent {id}")
        };
        let label = normalize_status_label(&label_source);
        previews.push(ThreadPreview {
            thread_id: id,
            label,
        });
    }
    Ok(previews)
}

async fn fetch_thread_preview(
    app: &AppHandle,
    workspace_id: &str,
    thread_id: &str,
) -> Result<Option<String>, String> {
    if thread_id.trim().is_empty() {
        return Ok(None);
    }
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions.get(workspace_id).ok_or("workspace not connected")?;
    let response = session
        .send_request(
            "thread/resume",
            json!({
                "threadId": thread_id,
            }),
        )
        .await?;

    // Best-effort: find the last agentMessage text from the resume payload.
    fn collect_agent_messages(value: &Value, out: &mut Vec<String>) {
        match value {
            Value::Array(items) => {
                for item in items {
                    collect_agent_messages(item, out);
                }
            }
            Value::Object(map) => {
                if map
                    .get("type")
                    .and_then(|v| v.as_str())
                    .is_some_and(|v| v == "agentMessage")
                {
                    if let Some(text) = map.get("text").and_then(|v| v.as_str()) {
                        if !text.trim().is_empty() {
                            out.push(text.to_string());
                        }
                    }
                }
                for value in map.values() {
                    collect_agent_messages(value, out);
                }
            }
            _ => {}
        }
    }

    let mut agent_texts: Vec<String> = Vec::new();
    collect_agent_messages(&response, &mut agent_texts);
    if let Some(last) = agent_texts.into_iter().last() {
        return Ok(Some(last));
    }

    let thread = response
        .get("result")
        .and_then(|v| v.get("thread"))
        .or_else(|| response.get("thread"));
    let preview = thread
        .and_then(|t| t.get("preview"))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string());
    Ok(preview)
}

async fn list_workspaces_info(app: &AppHandle) -> Vec<WorkspaceInfo> {
    let state = app.state::<AppState>();
    let workspaces = state.workspaces.lock().await;
    let sessions = state.sessions.lock().await;
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
    result.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        a_order.cmp(&b_order).then_with(|| a.name.cmp(&b.name))
    });
    // Only main workspaces; worktrees are nested and noisy for Telegram.
    result
        .into_iter()
        .filter(|workspace| matches!(workspace.kind, WorkspaceKind::Main))
        .collect()
}
