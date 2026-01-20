use std::collections::{HashMap, HashSet};

use serde::de::DeserializeOwned;
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use tauri::{AppHandle, Manager};
use tokio::sync::mpsc;

#[cfg(not(mobile))]
use std::time::Duration;
#[cfg(not(mobile))]
use tokio::time::sleep;

use crate::state::AppState;
use crate::storage::write_settings;
use crate::types::AppSettings;

#[derive(Debug, Clone)]
pub(crate) enum TelegramEvent {
    AppServerEvent { workspace_id: String, message: Value },
}

#[derive(Debug, Clone, Serialize)]
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
    allowed_user_ids: HashSet<i64>,
    pairing_secret: String,
}

fn read_config(settings: &AppSettings) -> TelegramConfig {
    TelegramConfig {
        enabled: settings.telegram_enabled,
        token: settings
            .telegram_bot_token
            .clone()
            .filter(|value| !value.trim().is_empty()),
        allowed_user_ids: settings
            .telegram_allowed_user_ids
            .clone()
            .unwrap_or_default()
            .into_iter()
            .collect(),
        pairing_secret: settings.telegram_pairing_secret.clone(),
    }
}

fn pairing_code(secret: &str) -> String {
    let mut filtered: String = secret
        .chars()
        .filter(|ch| ch.is_ascii_alphanumeric())
        .collect();
    if filtered.is_empty() {
        filtered = "unknown".to_string();
    }
    if filtered.len() > 32 {
        filtered.truncate(32);
    }
    filtered.to_lowercase()
}

fn build_register_payload(secret: &str) -> String {
    format!("link_{}", pairing_code(secret))
}

fn build_inline_keyboard(rows: Vec<Vec<(String, String)>>) -> Value {
    json!({
        "inline_keyboard": rows.into_iter().map(|row| {
            row.into_iter().map(|(text, data)| json!({ "text": text, "callback_data": data})).collect::<Vec<_>>()
        }).collect::<Vec<_>>()
    })
}

#[derive(Debug, Deserialize)]
struct TelegramResponse<T> {
    ok: bool,
    result: Option<T>,
    description: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramBotInfo {
    id: i64,
    username: Option<String>,
}

#[derive(Debug, Deserialize)]
struct TelegramUpdate {
    update_id: i64,
    message: Option<TelegramMessage>,
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
}

#[derive(Debug, Deserialize)]
struct TelegramChat {
    id: i64,
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

    async fn call<T: DeserializeOwned>(
        &self,
        token: &str,
        method: &str,
        params: &[(&str, String)],
    ) -> Result<T, String> {
        let url = format!("https://api.telegram.org/bot{token}/{method}");
        let response = self
            .client
            .post(&url)
            .form(&params)
            .send()
            .await
            .map_err(|e| format!("Telegram request failed: {e}"))?;
        response
            .json::<T>()
            .await
            .map_err(|e| format!("Telegram decode failed: {e}"))
    }

    async fn call_get<T: DeserializeOwned>(
        &self,
        token: &str,
        method: &str,
        params: &[(&str, String)],
    ) -> Result<T, String> {
        let url = format!("https://api.telegram.org/bot{token}/{method}");
        let response = self
            .client
            .get(&url)
            .query(&params)
            .send()
            .await
            .map_err(|e| format!("Telegram request failed: {e}"))?;
        response
            .json::<T>()
            .await
            .map_err(|e| format!("Telegram decode failed: {e}"))
    }

    async fn get_me(&self, token: &str) -> Result<TelegramBotInfo, String> {
        let response: TelegramResponse<TelegramBotInfo> =
            self.call_get(token, "getMe", &[]).await?;
        if response.ok {
            response
                .result
                .ok_or_else(|| "Telegram getMe returned no result.".to_string())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram getMe failed.".to_string()))
        }
    }

    async fn get_updates(
        &self,
        token: &str,
        offset: Option<i64>,
        timeout_seconds: u64,
    ) -> Result<Vec<TelegramUpdate>, String> {
        let mut params = vec![("timeout", timeout_seconds.to_string())];
        if let Some(offset) = offset {
            params.push(("offset", offset.to_string()));
        }
        let response: TelegramResponse<Vec<TelegramUpdate>> =
            self.call_get(token, "getUpdates", &params).await?;
        if response.ok {
            Ok(response.result.unwrap_or_default())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram getUpdates failed.".to_string()))
        }
    }

    async fn send_message(
        &self,
        token: &str,
        chat_id: i64,
        text: &str,
        reply_markup: Option<Value>,
    ) -> Result<(), String> {
        let mut params = vec![
            ("chat_id", chat_id.to_string()),
            ("text", text.to_string()),
        ];
        if let Some(markup) = reply_markup {
            params.push(("reply_markup", markup.to_string()));
        }
        let response: TelegramResponse<Value> = self.call(token, "sendMessage", &params).await?;
        if response.ok {
            Ok(())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram sendMessage failed.".to_string()))
        }
    }

    async fn answer_callback_query(&self, token: &str, id: &str) -> Result<(), String> {
        let params = vec![("callback_query_id", id.to_string())];
        let response: TelegramResponse<Value> =
            self.call(token, "answerCallbackQuery", &params).await?;
        if response.ok {
            Ok(())
        } else {
            Err(response
                .description
                .unwrap_or_else(|| "Telegram answerCallbackQuery failed.".to_string()))
        }
    }
}

pub(crate) async fn bot_status(app: AppHandle) -> Result<TelegramBotStatus, String> {
    #[cfg(mobile)]
    {
        let _ = app;
        return Ok(TelegramBotStatus {
            ok: false,
            username: None,
            id: None,
            error: Some("Telegram is not supported on mobile yet.".to_string()),
        });
    }

    #[cfg(not(mobile))]
    {
        let state = app.state::<AppState>();
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
}

pub(crate) async fn register_link(app: AppHandle) -> Result<String, String> {
    #[cfg(mobile)]
    {
        let _ = app;
        return Err("Telegram is not supported on mobile yet.".to_string());
    }

    #[cfg(not(mobile))]
    {
        let state = app.state::<AppState>();
        let settings = state.app_settings.lock().await;
        let config = read_config(&settings);
        let token = config
            .token
            .ok_or_else(|| "Telegram token is not configured.".to_string())?;
        let api = TelegramApi::new();
        let info = api.get_me(&token).await?;
        let username = info
            .username
            .ok_or_else(|| "Telegram bot username not available (getMe returned none).".to_string())?;
        let payload = build_register_payload(&config.pairing_secret);
        Ok(format!("https://t.me/{username}?start={payload}"))
    }
}

#[cfg(mobile)]
pub(crate) async fn telegram_loop(_app: AppHandle, mut rx: mpsc::UnboundedReceiver<TelegramEvent>) {
    while rx.recv().await.is_some() {}
}

#[cfg(not(mobile))]
pub(crate) async fn telegram_loop(app: AppHandle, mut rx: mpsc::UnboundedReceiver<TelegramEvent>) {
    let api = TelegramApi::new();
    let mut offset: Option<i64> = None;
    let mut selected_thread: HashMap<i64, (String, String)> = HashMap::new();
    let mut thread_tokens: HashMap<String, (i64, String, String)> = HashMap::new();
    let mut last_sent_by_chat_thread: HashMap<String, String> = HashMap::new();

    loop {
        let config = {
            let state = app.state::<AppState>();
            let settings = state.app_settings.lock().await;
            read_config(&settings)
        };

        if !config.enabled {
            sleep(Duration::from_millis(800)).await;
            continue;
        }

        let Some(token) = config.token.clone() else {
            sleep(Duration::from_millis(800)).await;
            continue;
        };

        let updates = tokio::select! {
            event = rx.recv() => {
                if let Some(event) = event {
                    handle_app_server_event(
                        &api,
                        &token,
                        &app,
                        &config,
                        &selected_thread,
                        &mut last_sent_by_chat_thread,
                        event,
                    )
                    .await;
                }
                continue;
            }
            updates = api.get_updates(&token, offset, 20) => {
                match updates {
                    Ok(updates) => updates,
                    Err(err) => {
                        eprintln!("[telegram] {err}");
                        sleep(Duration::from_secs(2)).await;
                        continue;
                    }
                }
            }
        };

        for update in updates {
            offset = Some(update.update_id + 1);

            if let Some(callback) = update.callback_query {
                let chat_id = callback
                    .message
                    .as_ref()
                    .map(|m| m.chat.id)
                    .unwrap_or_default();
                let Some(user_id) = callback.from.as_ref().map(|u| u.id) else {
                    continue;
                };
                let Some(data) = callback.data.clone() else {
                    continue;
                };

                if let Some(id) = callback.id.as_deref() {
                    let _ = api.answer_callback_query(&token, id).await;
                }

                if !config.allowed_user_ids.contains(&user_id) {
                    let _ = api
                        .send_message(
                            &token,
                            chat_id,
                            "Not paired yet. Use the Register link in CodexMonitor Settings → Cloud → Telegram.",
                            None,
                        )
                        .await;
                    continue;
                }

                if let Some(workspace_id) = data.strip_prefix("ws:") {
                    match list_threads_for_workspace(&app, workspace_id).await {
                        Ok(threads) => {
                            thread_tokens.retain(|_, (cid, _, _)| *cid != chat_id);
                            let mut rows: Vec<Vec<(String, String)>> = Vec::new();
                            if threads.is_empty() {
                                rows.push(vec![(
                                    "🆕 New thread".to_string(),
                                    format!("new:{workspace_id}"),
                                )]);
                            } else {
                                for (thread_id, label) in threads {
                                    let token_id = uuid::Uuid::new_v4().to_string();
                                    let short = token_id
                                        .chars()
                                        .filter(|c| c.is_ascii_hexdigit())
                                        .take(10)
                                        .collect::<String>();
                                    thread_tokens.insert(
                                        short.clone(),
                                        (chat_id, workspace_id.to_string(), thread_id.clone()),
                                    );
                                    rows.push(vec![(label, format!("th:{short}"))]);
                                }
                            }
                            rows.push(vec![("🔄 Workspaces".to_string(), "status".to_string())]);
                            let _ = api
                                .send_message(
                                    &token,
                                    chat_id,
                                    "Select a thread:",
                                    Some(build_inline_keyboard(rows)),
                                )
                                .await;
                        }
                        Err(err) => {
                            let _ = api
                                .send_message(&token, chat_id, &format!("Error: {err}"), None)
                                .await;
                        }
                    }
                    continue;
                }

                if data == "status" {
                    let _ = send_workspace_status(&api, &token, &app, chat_id).await;
                    continue;
                }

                if let Some(workspace_id) = data.strip_prefix("new:") {
                    match start_new_thread(&app, workspace_id).await {
                        Ok(thread_id) => {
                            selected_thread
                                .insert(chat_id, (workspace_id.to_string(), thread_id.clone()));
                            let _ = api
                                .send_message(
                                    &token,
                                    chat_id,
                                    "Created new thread. Send a message to start.",
                                    None,
                                )
                                .await;
                        }
                        Err(err) => {
                            let _ = api
                                .send_message(&token, chat_id, &format!("Error: {err}"), None)
                                .await;
                        }
                    }
                    continue;
                }

                if let Some(token_key) = data.strip_prefix("th:") {
                    let Some((cid, ws, thread)) = thread_tokens.get(token_key).cloned() else {
                        let _ = api
                            .send_message(&token, chat_id, "Selection expired. Use /status.", None)
                            .await;
                        continue;
                    };
                    if cid != chat_id {
                        continue;
                    }
                    match resume_thread(&app, &ws, &thread).await {
                        Ok(_) => {
                            selected_thread.insert(chat_id, (ws.clone(), thread.clone()));
                            let _ = api
                                .send_message(
                                    &token,
                                    chat_id,
                                    &format!("Selected thread.\nWorkspace: {ws}\nThread: {thread}"),
                                    None,
                                )
                                .await;
                        }
                        Err(err) => {
                            let _ = api
                                .send_message(
                                    &token,
                                    chat_id,
                                    &format!("Error selecting thread: {err}\n\nSend /status to pick another thread."),
                                    None,
                                )
                                .await;
                        }
                    }
                    continue;
                }
            }

            let Some(message) = update.message else {
                continue;
            };

            let chat_id = message.chat.id;
            let Some(user_id) = message.from.as_ref().map(|u| u.id) else {
                continue;
            };
            let text = message.text.unwrap_or_default();
            let trimmed = text.trim();
            if trimmed.is_empty() {
                continue;
            }

            if trimmed.starts_with("/start") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                if parts.len() >= 2 {
                    let payload = parts[1];
                    if let Some(code) = payload.strip_prefix("link_") {
                        if code == pairing_code(&config.pairing_secret) {
                            if let Err(err) = pair_user(&app, user_id, chat_id).await {
                                let _ = api
                                    .send_message(&token, chat_id, &format!("Error: {err}"), None)
                                    .await;
                            } else {
                                let _ = api
                                    .send_message(
                                        &token,
                                        chat_id,
                                        "✅ Paired. Send /status to select a workspace.",
                                        None,
                                    )
                                    .await;
                            }
                            continue;
                        }
                    }
                }
                let _ = api
                    .send_message(
                        &token,
                        chat_id,
                        "🤖 CodexMonitor\n\nUse /status to pick a workspace.\n\nIf you haven't paired yet, use the Register link in Settings → Cloud → Telegram.",
                        None,
                    )
                    .await;
                continue;
            }

            if trimmed.starts_with("/link") {
                let parts: Vec<&str> = trimmed.split_whitespace().collect();
                let code = parts.get(1).copied().unwrap_or("");
                if code == pairing_code(&config.pairing_secret) {
                    if let Err(err) = pair_user(&app, user_id, chat_id).await {
                        let _ = api
                            .send_message(&token, chat_id, &format!("Error: {err}"), None)
                            .await;
                    } else {
                        let _ = api
                            .send_message(
                                &token,
                                chat_id,
                                "✅ Paired. Send /status to select a workspace.",
                                None,
                            )
                            .await;
                    }
                } else {
                    let _ = api
                        .send_message(
                            &token,
                            chat_id,
                            "Invalid code. Use the Register link in CodexMonitor Settings → Cloud → Telegram.",
                            None,
                        )
                        .await;
                }
                continue;
            }

            if trimmed == "/disconnect" {
                selected_thread.remove(&chat_id);
                let _ = api
                    .send_message(&token, chat_id, "Disconnected.", None)
                    .await;
                continue;
            }

            if trimmed == "/status" {
                if !config.allowed_user_ids.contains(&user_id) {
                    let _ = api
                        .send_message(
                            &token,
                            chat_id,
                            "Not paired yet. Use the Register link in CodexMonitor Settings → Cloud → Telegram.",
                            None,
                        )
                        .await;
                    continue;
                }
                let _ = send_workspace_status(&api, &token, &app, chat_id).await;
                continue;
            }

            if !config.allowed_user_ids.contains(&user_id) {
                let _ = api
                    .send_message(
                        &token,
                        chat_id,
                        "Not paired yet. Use the Register link in CodexMonitor Settings → Cloud → Telegram.",
                        None,
                    )
                    .await;
                continue;
            }

            let Some((workspace_id, thread_id)) = selected_thread.get(&chat_id).cloned() else {
                let _ = api
                    .send_message(&token, chat_id, "No active thread. Send /status.", None)
                    .await;
                continue;
            };

            match send_text_to_thread(&app, &workspace_id, &thread_id, trimmed).await {
                Ok(_) => {
                    let _ = api
                        .send_message(&token, chat_id, "Sent.", None)
                        .await;
                }
                Err(err) => {
                    let _ = api
                        .send_message(&token, chat_id, &format!("Error: {err}"), None)
                        .await;
                }
            }
        }
    }
}

async fn resume_thread(app: &AppHandle, workspace_id: &str, thread_id: &str) -> Result<(), String> {
    if thread_id.trim().is_empty() {
        return Err("missing thread id".to_string());
    }
    ensure_connected(app, workspace_id).await?;
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(workspace_id)
        .ok_or("workspace not connected")?;
    let response = session
        .send_request("thread/resume", json!({ "threadId": thread_id }))
        .await?;
    if let Some(err) = response.get("error") {
        let message = err
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        return Err(message.to_string());
    }
    Ok(())
}

async fn handle_app_server_event(
    api: &TelegramApi,
    token: &str,
    app: &AppHandle,
    config: &TelegramConfig,
    selected_thread: &HashMap<i64, (String, String)>,
    last_sent_by_chat_thread: &mut HashMap<String, String>,
    event: TelegramEvent,
) {
    let TelegramEvent::AppServerEvent { workspace_id, message } = event;
    let method = message.get("method").and_then(|v| v.as_str()).unwrap_or("");
    if method != "turn/completed" && method != "turn/failed" && method != "error" {
        return;
    }
    let thread_id = extract_thread_id(&message);
    let Some(thread_id) = thread_id else {
        return;
    };
    if !config.enabled {
        return;
    }
    if config.token.as_deref().unwrap_or("").trim().is_empty() {
        return;
    }

    for (chat_id, (ws, th)) in selected_thread.iter() {
        if ws != &workspace_id || th != &thread_id {
            continue;
        }
        let _ = send_latest_assistant_reply(
            api,
            token,
            app,
            *chat_id,
            ws,
            th,
            last_sent_by_chat_thread,
        )
        .await;
    }
}

fn extract_thread_id(message: &Value) -> Option<String> {
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    if let Some(id) = params.get("threadId").or_else(|| params.get("thread_id")).and_then(|v| v.as_str()) {
        if !id.trim().is_empty() {
            return Some(id.to_string());
        }
    }
    let turn = params.get("turn").cloned().unwrap_or(Value::Null);
    if let Some(id) = turn.get("threadId").or_else(|| turn.get("thread_id")).and_then(|v| v.as_str()) {
        if !id.trim().is_empty() {
            return Some(id.to_string());
        }
    }
    None
}

fn split_text(value: &str, limit: usize) -> Vec<String> {
    if value.trim().is_empty() {
        return Vec::new();
    }
    if value.chars().count() <= limit {
        return vec![value.to_string()];
    }
    let mut out: Vec<String> = Vec::new();
    let mut buf = String::new();
    for ch in value.chars() {
        if buf.chars().count() + 1 > limit {
            out.push(buf);
            buf = String::new();
        }
        buf.push(ch);
    }
    if !buf.is_empty() {
        out.push(buf);
    }
    out
}

async fn send_latest_assistant_reply(
    api: &TelegramApi,
    token: &str,
    app: &AppHandle,
    chat_id: i64,
    workspace_id: &str,
    thread_id: &str,
    last_sent_by_chat_thread: &mut HashMap<String, String>,
) -> Result<(), String> {
    ensure_connected(app, workspace_id).await?;
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(workspace_id)
        .ok_or("workspace not connected")?;
    let response = session
        .send_request("thread/resume", json!({ "threadId": thread_id }))
        .await?;
    let result = response.get("result").cloned().unwrap_or(response);
    let thread = result
        .get("thread")
        .cloned()
        .or_else(|| result.get("result").cloned())
        .unwrap_or(Value::Null);
    let turns = thread.get("turns").and_then(|v| v.as_array()).cloned().unwrap_or_default();

    let mut last_id: Option<String> = None;
    let mut last_text: Option<String> = None;
    for turn in turns {
        let items = turn.get("items").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        for item in items {
            let ty = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
            if ty == "agentMessage" {
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
                let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("").to_string();
                if !id.is_empty() && !text.trim().is_empty() {
                    last_id = Some(id);
                    last_text = Some(text);
                }
            }
        }
    }

    let Some(last_id_value) = last_id else {
        return Ok(());
    };
    let Some(last_text_value) = last_text else {
        return Ok(());
    };

    let key = format!("{chat_id}:{workspace_id}:{thread_id}");
    if last_sent_by_chat_thread.get(&key).map(|v| v == &last_id_value).unwrap_or(false) {
        return Ok(());
    }
    last_sent_by_chat_thread.insert(key, last_id_value);

    for chunk in split_text(&last_text_value, 3800) {
        api.send_message(token, chat_id, &chunk, None).await?;
    }
    Ok(())
}

async fn pair_user(app: &AppHandle, user_id: i64, chat_id: i64) -> Result<(), String> {
    let state = app.state::<AppState>();
    let mut settings = state.app_settings.lock().await;
    let mut allowed = settings.telegram_allowed_user_ids.clone().unwrap_or_default();
    if !allowed.contains(&user_id) {
        allowed.push(user_id);
        allowed.sort_unstable();
        settings.telegram_allowed_user_ids = Some(allowed);
    }
    if settings.telegram_default_chat_id.is_none() {
        settings.telegram_default_chat_id = Some(chat_id);
    }
    let next = settings.clone();
    drop(settings);
    write_settings(&state.settings_path, &next)?;
    Ok(())
}

async fn ensure_connected(app: &AppHandle, workspace_id: &str) -> Result<(), String> {
    let state = app.state::<AppState>();
    if state.sessions.lock().await.contains_key(workspace_id) {
        return Ok(());
    }
    crate::workspaces::connect_workspace(workspace_id.to_string(), state, app.clone()).await
}

async fn send_workspace_status(
    api: &TelegramApi,
    token: &str,
    app: &AppHandle,
    chat_id: i64,
) -> Result<(), String> {
    let state = app.state::<AppState>();
    let workspaces = crate::workspaces::list_workspaces(state).await?;
    if workspaces.is_empty() {
        api.send_message(token, chat_id, "No workspaces.", None).await?;
        return Ok(());
    }
    let mut rows: Vec<Vec<(String, String)>> = Vec::new();
    for ws in workspaces {
        rows.push(vec![(ws.name, format!("ws:{}", ws.id))]);
    }
    api.send_message(
        token,
        chat_id,
        "Select a workspace:",
        Some(build_inline_keyboard(rows)),
    )
    .await
}

async fn list_threads_for_workspace(
    app: &AppHandle,
    workspace_id: &str,
) -> Result<Vec<(String, String)>, String> {
    ensure_connected(app, workspace_id).await?;
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(workspace_id)
        .ok_or("workspace not connected")?;
    let workspace_path = session.entry.path.clone();
    let canonical_workspace = std::fs::canonicalize(&workspace_path)
        .ok()
        .and_then(|p| p.to_str().map(|s| s.to_string()));

    // Match the old bot behavior: fetch a few pages and filter by cwd (with canonical fallback).
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
        let result = response.get("result").cloned().unwrap_or(response.clone());
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

    let mut threads: Vec<(String, String)> = Vec::new();
    for item in collected {
        let Some(cwd) = item.get("cwd").and_then(|v| v.as_str()) else {
            continue;
        };
        let cwd_matches = if cwd == workspace_path {
            true
        } else if let (Some(cws), Ok(ccwd)) =
            (canonical_workspace.as_deref(), std::fs::canonicalize(cwd))
        {
            ccwd.to_str().is_some_and(|value| value == cws)
        } else {
            false
        };
        if !cwd_matches {
            continue;
        }

        let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("").to_string();
        if id.is_empty() {
            continue;
        }
        let preview = item
            .get("preview")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let title = item
            .get("title")
            .or_else(|| item.get("name"))
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .trim();
        let label_source = if !preview.is_empty() {
            preview
        } else if !title.is_empty() {
            title
        } else {
            "Agent"
        };
        threads.push((id, label_source.to_string()));
    }

    Ok(threads)
}

async fn start_new_thread(app: &AppHandle, workspace_id: &str) -> Result<String, String> {
    ensure_connected(app, workspace_id).await?;
    let state = app.state::<AppState>();
    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(workspace_id)
        .ok_or("workspace not connected")?;
    let response = session
        .send_request(
            "thread/start",
            json!({ "cwd": session.entry.path, "approvalPolicy": "on-request" }),
        )
        .await?;
    response
        .get("result")
        .and_then(|v| v.get("threadId").or_else(|| v.get("thread_id")))
        .and_then(|v| v.as_str())
        .map(|v| v.to_string())
        .ok_or_else(|| "thread/start did not return a thread id".to_string())
}

async fn send_text_to_thread(
    app: &AppHandle,
    workspace_id: &str,
    thread_id: &str,
    text: &str,
) -> Result<(), String> {
    ensure_connected(app, workspace_id).await?;
    let state = app.state::<AppState>();
    let access_mode = {
        let settings = state.app_settings.lock().await;
        settings.default_access_mode.clone()
    };

    let sessions = state.sessions.lock().await;
    let session = sessions
        .get(workspace_id)
        .ok_or("workspace not connected")?;

    // Important: resume first (old bot did this in multiple places). Some servers won't accept
    // `turn/start` for a thread that isn't resumable from this session.
    let resume_response = session
        .send_request("thread/resume", json!({ "threadId": thread_id }))
        .await?;
    if let Some(err) = resume_response.get("error") {
        let message = err
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        return Err(message.to_string());
    }

    let sandbox_policy = match access_mode.as_str() {
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
    let response = session
        .send_request(
            "turn/start",
            json!({
                "threadId": thread_id,
                "input": [json!({ "type": "text", "text": text.trim() })],
                "cwd": session.entry.path,
                "approvalPolicy": approval_policy,
                "sandboxPolicy": sandbox_policy,
                "model": Value::Null,
                "effort": Value::Null,
            }),
        )
        .await?;

    if let Some(err) = response.get("error") {
        let message = err
            .get("message")
            .and_then(|v| v.as_str())
            .unwrap_or("Unknown error");
        return Err(message.to_string());
    }

    let turn_id = response
        .get("result")
        .and_then(|result| result.get("turn"))
        .and_then(|turn| turn.get("id"))
        .and_then(|v| v.as_str())
        .unwrap_or("")
        .to_string();

    if turn_id.trim().is_empty() {
        eprintln!("[telegram] turn/start response without turn id: {response}");
    }
    Ok(())
}
