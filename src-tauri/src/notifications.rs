use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicBool, Ordering};
use tauri::{AppHandle, Emitter, Manager};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct NativeNotificationPayload {
    pub title: String,
    pub body: Option<String>,
    pub workspace_id: String,
    pub thread_id: Option<String>,
    pub kind: String,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
struct NotificationClickEvent {
    workspace_id: String,
    thread_id: Option<String>,
    kind: String,
}

#[cfg(target_os = "macos")]
static WAITING_FOR_CLICK: AtomicBool = AtomicBool::new(false);

#[cfg(target_os = "macos")]
fn emit_notification_click(app: &AppHandle, payload: NotificationClickEvent) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.set_focus();
    }
    let _ = app.emit("notification-clicked", payload);
}

#[cfg(target_os = "macos")]
fn resolve_bundle_id(app: &AppHandle) -> String {
    if tauri::is_dev() {
        "com.apple.Terminal".to_string()
    } else {
        app.config().identifier.clone()
    }
}

#[cfg(target_os = "macos")]
#[tauri::command]
pub async fn send_native_notification(
    app: AppHandle,
    payload: NativeNotificationPayload,
) -> Result<bool, String> {
    if WAITING_FOR_CLICK
        .compare_exchange(false, true, Ordering::SeqCst, Ordering::SeqCst)
        .is_err()
    {
        return Ok(false);
    }
    let app_handle = app.clone();

    tauri::async_runtime::spawn_blocking(move || {
        let title = payload.title;
        let body = payload.body.unwrap_or_default();
        let workspace_id = payload.workspace_id;
        let thread_id = payload.thread_id;
        let kind = payload.kind;

        let mut notification = mac_notification_sys::Notification::new();
        notification.title(&title);
        notification.message(&body);
        notification.wait_for_click(true);

        let bundle_id = resolve_bundle_id(&app_handle);
        let _ = mac_notification_sys::set_application(&bundle_id);

        match notification.send() {
            Ok(response) => match response {
                mac_notification_sys::NotificationResponse::Click
                | mac_notification_sys::NotificationResponse::ActionButton(_)
                | mac_notification_sys::NotificationResponse::Reply(_) => {
                    emit_notification_click(
                        &app_handle,
                        NotificationClickEvent {
                            workspace_id,
                            thread_id,
                            kind,
                        },
                    );
                }
                _ => {}
            },
            Err(_) => {}
        }
        WAITING_FOR_CLICK.store(false, Ordering::SeqCst);
    });

    Ok(true)
}

#[cfg(not(target_os = "macos"))]
#[tauri::command]
pub async fn send_native_notification(
    _app: AppHandle,
    _payload: NativeNotificationPayload,
) -> Result<bool, String> {
    Ok(false)
}
