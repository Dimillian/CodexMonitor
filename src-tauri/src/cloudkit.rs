use serde::{Deserialize, Serialize};
use tauri::AppHandle;
use tauri::State;

use crate::state::AppState;

#[derive(Debug, Serialize, Clone)]
pub(crate) struct CloudKitTestResult {
    #[serde(rename = "recordName")]
    pub(crate) record_name: String,
    #[serde(rename = "durationMs")]
    pub(crate) duration_ms: u64,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct CloudKitStatus {
    pub(crate) available: bool,
    pub(crate) status: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct CloudKitRunnerInfo {
    #[serde(rename = "runnerId")]
    pub(crate) runner_id: String,
    pub(crate) name: String,
    pub(crate) platform: String,
    #[serde(rename = "updatedAtMs")]
    pub(crate) updated_at_ms: i64,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct CloudKitSnapshot {
    #[serde(rename = "scopeKey")]
    pub(crate) scope_key: String,
    #[serde(rename = "updatedAtMs")]
    pub(crate) updated_at_ms: i64,
    #[serde(rename = "payloadJson")]
    pub(crate) payload_json: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct CloudKitCommandAck {
    #[serde(rename = "commandId")]
    pub(crate) command_id: String,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct CloudKitCommandResult {
    #[serde(rename = "commandId")]
    pub(crate) command_id: String,
    pub(crate) ok: bool,
    #[serde(rename = "createdAtMs")]
    pub(crate) created_at_ms: i64,
    #[serde(rename = "payloadJson")]
    pub(crate) payload_json: String,
}

#[derive(Debug, Deserialize, Clone)]
struct IncomingCommand {
    #[serde(rename = "commandId")]
    command_id: String,
    #[serde(rename = "clientId")]
    client_id: Option<String>,
    #[serde(rename = "type")]
    command_type: String,
    #[serde(default)]
    args: serde_json::Value,
}

pub(crate) fn cloudkit_cli_status(container_id: String) -> Result<CloudKitStatus, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::account_status_blocking(container_id)
}

pub(crate) fn cloudkit_cli_test(container_id: String) -> Result<CloudKitTestResult, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::test_roundtrip_blocking(container_id)
}

pub(crate) fn cloudkit_cli_latest_runner(container_id: String) -> Result<Option<CloudKitRunnerInfo>, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::fetch_latest_runner_blocking(container_id)
}

pub(crate) fn cloudkit_cli_upsert_runner(
    container_id: String,
    runner_id: String,
) -> Result<CloudKitRunnerInfo, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::upsert_runner_presence_blocking(
        container_id,
        runner_id,
        "CodexMonitor".to_string(),
        "macos".to_string(),
    )
}

pub(crate) fn cloudkit_cli_get_snapshot(
    container_id: String,
    runner_id: String,
    scope_key: String,
) -> Result<Option<CloudKitSnapshot>, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::fetch_snapshot_blocking(container_id, runner_id, scope_key)
}

pub(crate) fn cloudkit_cli_get_command_result(
    container_id: String,
    runner_id: String,
    command_id: String,
) -> Result<Option<CloudKitCommandResult>, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::fetch_command_result_blocking(container_id, runner_id, command_id)
}

pub(crate) fn cloudkit_cli_latest_command_result(
    container_id: String,
    runner_id: String,
) -> Result<Option<CloudKitCommandResult>, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::fetch_latest_command_result_blocking(container_id, runner_id)
}

pub(crate) fn cloudkit_cli_submit_command(
    container_id: String,
    runner_id: String,
    payload_json: String,
) -> Result<CloudKitCommandAck, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;

    let command: IncomingCommand =
        serde_json::from_str(&payload_json).map_err(|e| format!("Invalid command JSON: {e}"))?;
    let command_id = command.command_id.clone();

    cloudkit_impl::insert_command_blocking(container_id, runner_id, payload_json)?;
    Ok(CloudKitCommandAck { command_id })
}

#[tauri::command]
pub(crate) async fn cloudkit_local_runner_id(state: State<'_, AppState>) -> Result<String, String> {
    let settings = state.app_settings.lock().await;
    Ok(settings.runner_id.clone())
}

#[tauri::command]
pub(crate) async fn cloudkit_status(state: State<'_, AppState>) -> Result<CloudKitStatus, String> {
    let (enabled, container_id) = {
        let settings = state.app_settings.lock().await;
        (settings.cloudkit_enabled, settings.cloudkit_container_id.clone())
    };
    if !enabled {
        return Ok(CloudKitStatus {
            available: false,
            status: "disabled".to_string(),
        });
    }

    cloudkit_impl::ensure_cloudkit_allowed()?;

    let container_id = container_id
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .ok_or_else(|| {
            "CloudKit container identifier is missing. Set it in Settings → Cloud.".to_string()
        })?;

    tauri::async_runtime::spawn_blocking(move || cloudkit_impl::account_status_blocking(container_id))
        .await
        .map_err(|_| "request canceled".to_string())?
}

#[tauri::command]
pub(crate) async fn cloudkit_test(state: State<'_, AppState>) -> Result<CloudKitTestResult, String> {
    let (enabled, container_id) = {
        let settings = state.app_settings.lock().await;
        (settings.cloudkit_enabled, settings.cloudkit_container_id.clone())
    };
    if !enabled {
        return Err("CloudKit Sync is disabled in Settings.".to_string());
    }

    cloudkit_impl::ensure_cloudkit_allowed()?;

    let container_id = container_id
        .and_then(|value| {
            let trimmed = value.trim().to_string();
            (!trimmed.is_empty()).then_some(trimmed)
        })
        .ok_or_else(|| {
            "CloudKit container identifier is missing. Set it in Settings → Cloud.".to_string()
        })?;

    tauri::async_runtime::spawn_blocking(move || cloudkit_impl::test_roundtrip_blocking(container_id))
        .await
        .map_err(|_| "request canceled".to_string())?
}

#[tauri::command]
pub(crate) async fn cloudkit_publish_presence(
    name: String,
    platform: String,
    state: State<'_, AppState>,
) -> Result<CloudKitRunnerInfo, String> {
    let (enabled, container_id, runner_id) = {
        let settings = state.app_settings.lock().await;
        (
            settings.cloudkit_enabled,
            settings.cloudkit_container_id.clone(),
            settings.runner_id.clone(),
        )
    };
    if !enabled {
        return Err("CloudKit Sync is disabled in Settings.".to_string());
    }

    cloudkit_impl::ensure_cloudkit_allowed()?;
    let container_id = cloudkit_impl::require_container_id(container_id)?;
    let name = name.trim().to_string();
    let platform = platform.trim().to_string();

    tauri::async_runtime::spawn_blocking(move || {
        cloudkit_impl::upsert_runner_presence_blocking(container_id, runner_id, name, platform)
    })
    .await
    .map_err(|_| "request canceled".to_string())?
}

#[tauri::command]
pub(crate) async fn cloudkit_fetch_latest_runner(
    state: State<'_, AppState>,
) -> Result<Option<CloudKitRunnerInfo>, String> {
    let (enabled, container_id) = {
        let settings = state.app_settings.lock().await;
        (settings.cloudkit_enabled, settings.cloudkit_container_id.clone())
    };
    if !enabled {
        return Ok(None);
    }
    cloudkit_impl::ensure_cloudkit_allowed()?;
    let container_id = cloudkit_impl::require_container_id(container_id)?;

    tauri::async_runtime::spawn_blocking(move || cloudkit_impl::fetch_latest_runner_blocking(container_id))
        .await
        .map_err(|_| "request canceled".to_string())?
}

#[tauri::command]
pub(crate) async fn cloudkit_put_snapshot(
    scope_key: String,
    payload_json: String,
    state: State<'_, AppState>,
) -> Result<(), String> {
    let (enabled, container_id, runner_id) = {
        let settings = state.app_settings.lock().await;
        (
            settings.cloudkit_enabled,
            settings.cloudkit_container_id.clone(),
            settings.runner_id.clone(),
        )
    };
    if !enabled {
        return Ok(());
    }

    cloudkit_impl::ensure_cloudkit_allowed()?;
    let container_id = cloudkit_impl::require_container_id(container_id)?;

    tauri::async_runtime::spawn_blocking(move || {
        cloudkit_impl::upsert_snapshot_blocking(container_id, runner_id, scope_key, payload_json)
    })
    .await
    .map_err(|_| "request canceled".to_string())?
}

#[tauri::command]
pub(crate) async fn cloudkit_get_snapshot(
    runner_id: String,
    scope_key: String,
    state: State<'_, AppState>,
) -> Result<Option<CloudKitSnapshot>, String> {
    let (enabled, container_id) = {
        let settings = state.app_settings.lock().await;
        (settings.cloudkit_enabled, settings.cloudkit_container_id.clone())
    };
    if !enabled {
        return Ok(None);
    }
    cloudkit_impl::ensure_cloudkit_allowed()?;
    let container_id = cloudkit_impl::require_container_id(container_id)?;

    tauri::async_runtime::spawn_blocking(move || {
        cloudkit_impl::fetch_snapshot_blocking(container_id, runner_id, scope_key)
    })
    .await
    .map_err(|_| "request canceled".to_string())?
}

#[tauri::command]
pub(crate) async fn cloudkit_submit_command(
    runner_id: String,
    payload_json: String,
    state: State<'_, AppState>,
) -> Result<CloudKitCommandAck, String> {
    let (enabled, container_id) = {
        let settings = state.app_settings.lock().await;
        (settings.cloudkit_enabled, settings.cloudkit_container_id.clone())
    };
    if !enabled {
        return Err("CloudKit Sync is disabled in Settings.".to_string());
    }
    cloudkit_impl::ensure_cloudkit_allowed()?;
    let container_id = cloudkit_impl::require_container_id(container_id)?;

    let command: IncomingCommand =
        serde_json::from_str(&payload_json).map_err(|e| format!("Invalid command JSON: {e}"))?;
    let command_id = command.command_id.clone();

    tauri::async_runtime::spawn_blocking(move || {
        cloudkit_impl::insert_command_blocking(container_id, runner_id, payload_json)
    })
    .await
    .map_err(|_| "request canceled".to_string())??;

    Ok(CloudKitCommandAck { command_id })
}

#[tauri::command]
pub(crate) async fn cloudkit_get_command_result(
    runner_id: String,
    command_id: String,
    state: State<'_, AppState>,
) -> Result<Option<CloudKitCommandResult>, String> {
    let (enabled, container_id) = {
        let settings = state.app_settings.lock().await;
        (settings.cloudkit_enabled, settings.cloudkit_container_id.clone())
    };
    if !enabled {
        return Ok(None);
    }
    cloudkit_impl::ensure_cloudkit_allowed()?;
    let container_id = cloudkit_impl::require_container_id(container_id)?;

    tauri::async_runtime::spawn_blocking(move || {
        cloudkit_impl::fetch_command_result_blocking(container_id, runner_id, command_id)
    })
    .await
    .map_err(|_| "request canceled".to_string())?
}

pub(crate) fn start_cloudkit_command_poller(app: AppHandle) {
    if !cfg!(target_os = "macos") {
        return;
    }

    tauri::async_runtime::spawn(async move {
        cloudkit_impl::command_poller_loop(app).await;
    });
}

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod cloudkit_impl {
    use std::collections::{HashMap, HashSet};
    use std::hash::{Hash, Hasher};
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};
    use std::time::{SystemTime, UNIX_EPOCH};

    use block2::RcBlock;
    use objc2::AnyThread;
    use objc2::exception::catch;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::AnyObject;
    use objc2::runtime::ProtocolObject;
    use objc2_cloud_kit::{
        CKAccountStatus, CKContainer, CKDatabase, CKQuery, CKRecord, CKRecordID, CKRecordValue,
    };
    use objc2_foundation::{NSArray, NSError, NSNumber, NSPredicate, NSSortDescriptor, NSString};
    use tauri::AppHandle;
    use tauri::Manager;
    use uuid::Uuid;

    use crate::codex::spawn_workspace_session;
    use crate::state::AppState;
    use crate::types::{WorkspaceEntry, WorkspaceInfo};
    use super::{CloudKitCommandResult, CloudKitRunnerInfo, CloudKitSnapshot, CloudKitStatus, CloudKitTestResult, IncomingCommand};

    fn debug_enabled() -> bool {
        std::env::var("CODEXMONITOR_CLOUDKIT_DEBUG")
            .ok()
            .as_deref()
            .map(|value| value == "1" || value.eq_ignore_ascii_case("true"))
            .unwrap_or(false)
    }

    fn debug_log(message: &str) {
        if debug_enabled() {
            eprintln!("[cloudkit] {message}");
        }
    }

    fn exception_to_string(exception: Option<Retained<objc2::exception::Exception>>) -> String {
        exception
            .as_deref()
            .map(|error| error.to_string())
            .unwrap_or_else(|| "Unknown Objective-C exception".to_string())
    }

    fn now_ms() -> i64 {
        SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .unwrap_or_else(|_| Duration::from_secs(0))
            .as_millis() as i64
    }

    fn global_scope_key() -> String {
        "g".to_string()
    }

    fn workspace_scope_key(workspace_id: &str) -> String {
        format!("ws/{workspace_id}")
    }

    fn thread_scope_key(workspace_id: &str, thread_id: &str) -> String {
        format!("th/{workspace_id}/{thread_id}")
    }

    fn snapshot_envelope(scope_key: &str, runner_id: &str, payload: serde_json::Value) -> String {
        serde_json::json!({
            "v": 1,
            "ts": now_ms(),
            "runnerId": runner_id,
            "scopeKey": scope_key,
            "payload": payload,
        })
        .to_string()
    }

    pub(super) fn ensure_cloudkit_allowed() -> Result<(), String> {
        // We only hard-block debug builds on macOS, because macOS debug builds are often
        // unsigned and CloudKit requires entitlements. On iOS, even debug builds are
        // code-signed to run on devices/simulators, so we allow them by default.
        let allow_debug = cfg!(target_os = "ios")
            || std::env::var("CODEXMONITOR_ALLOW_CLOUDKIT_DEV")
                .ok()
                .as_deref()
                == Some("1");

        if cfg!(debug_assertions) && cfg!(target_os = "macos") && !allow_debug {
            return Err("CloudKit requires a signed build. Set CODEXMONITOR_ALLOW_CLOUDKIT_DEV=1 to override.".to_string());
        }
        Ok(())
    }

    pub(super) fn require_container_id(container_id: Option<String>) -> Result<String, String> {
        container_id
            .and_then(|value| {
                let trimmed = value.trim().to_string();
                (!trimmed.is_empty()).then_some(trimmed)
            })
            .ok_or_else(|| {
                "CloudKit container identifier is missing. Set it in Settings → Cloud.".to_string()
            })
    }

    fn container_with_identifier(container_id: &str) -> Result<Retained<CKContainer>, String> {
        autoreleasepool(|_| {
            let identifier = NSString::from_str(container_id);
            catch(|| unsafe { CKContainer::containerWithIdentifier(&identifier) })
                .map_err(exception_to_string)
        })
    }

    fn private_database(container_id: &str) -> Result<Retained<CKDatabase>, String> {
        let container = container_with_identifier(container_id)?;
        catch(std::panic::AssertUnwindSafe(|| unsafe { container.privateCloudDatabase() }))
            .map_err(exception_to_string)
    }

    fn upsert_record_retained(
        database: &CKDatabase,
        record_type: &str,
        record_id: &CKRecordID,
    ) -> Result<Retained<CKRecord>, String> {
        if let Some(existing) = fetch_record_retained(database, record_id)? {
            return Ok(existing);
        }

        Ok(autoreleasepool(|_| unsafe {
            let record_type = NSString::from_str(record_type);
            CKRecord::initWithRecordType_recordID(CKRecord::alloc(), &record_type, record_id)
        }))
    }

    fn save_record_blocking(database: &CKDatabase, record: &CKRecord) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_handle = tx.clone();

        let completion = RcBlock::new(move |record_ptr: *mut CKRecord, error_ptr: *mut NSError| {
            let tx = match tx_handle.lock().ok().and_then(|mut guard| guard.take()) {
                Some(sender) => sender,
                None => return,
            };

            let outcome = autoreleasepool(|_| unsafe {
                if !error_ptr.is_null() {
                    let error = Retained::<NSError>::retain(error_ptr)
                        .ok_or_else(|| "CloudKit save failed (error was null)".to_string())?;
                    return Err(error.localizedDescription().to_string());
                }
                if record_ptr.is_null() {
                    return Err("CloudKit save failed (record was null)".to_string());
                }
                Ok(())
            });

            let _ = tx.send(outcome);
        });

        catch(std::panic::AssertUnwindSafe(|| unsafe {
            database.saveRecord_completionHandler(record, &completion);
        }))
        .map_err(exception_to_string)?;

        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "codexmonitor cloudkit save timed out".to_string())?
    }

    fn fetch_record_blocking(database: &CKDatabase, record_id: &CKRecordID) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_handle = tx.clone();

        let completion = RcBlock::new(move |record_ptr: *mut CKRecord, error_ptr: *mut NSError| {
            let tx = match tx_handle.lock().ok().and_then(|mut guard| guard.take()) {
                Some(sender) => sender,
                None => return,
            };

            let outcome = autoreleasepool(|_| unsafe {
                if !error_ptr.is_null() {
                    let error = Retained::<NSError>::retain(error_ptr)
                        .ok_or_else(|| "CloudKit fetch failed (error was null)".to_string())?;
                    return Err(error.localizedDescription().to_string());
                }
                if record_ptr.is_null() {
                    return Err("CloudKit fetch failed (record was null)".to_string());
                }
                let record = Retained::<CKRecord>::retain(record_ptr)
                    .ok_or_else(|| "CloudKit fetch failed (record was null)".to_string())?;
                let key = NSString::from_str("value");
                let value = record.objectForKey(&key);
                if value.is_none() {
                    return Err("CloudKit fetch returned a record without the expected field.".to_string());
                }
                Ok(())
            });

            let _ = tx.send(outcome);
        });

        catch(std::panic::AssertUnwindSafe(|| unsafe {
            database.fetchRecordWithID_completionHandler(record_id, &completion);
        }))
        .map_err(exception_to_string)?;

        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "codexmonitor cloudkit fetch timed out".to_string())?
    }

    fn fetch_record_retained(database: &CKDatabase, record_id: &CKRecordID) -> Result<Option<Retained<CKRecord>>, String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<Option<Retained<CKRecord>>, String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_handle = tx.clone();

        let completion = RcBlock::new(move |record_ptr: *mut CKRecord, error_ptr: *mut NSError| {
            let tx = match tx_handle.lock().ok().and_then(|mut guard| guard.take()) {
                Some(sender) => sender,
                None => return,
            };

            let outcome = autoreleasepool(|_| unsafe {
                if !error_ptr.is_null() {
                    let error = Retained::<NSError>::retain(error_ptr)
                        .ok_or_else(|| "CloudKit fetch failed (error was null)".to_string())?;
                    let message = error.localizedDescription().to_string();
                    // Treat missing records as None. Different OS versions localize this as
                    // "Unknown Item" or "Record not found".
                    let lower = message.to_lowercase();
                    if lower.contains("unknown item") || lower.contains("record not found") {
                        return Ok(None);
                    }
                    return Err(message);
                }
                if record_ptr.is_null() {
                    return Ok(None);
                }
                let record = Retained::<CKRecord>::retain(record_ptr)
                    .ok_or_else(|| "CloudKit fetch failed (record was null)".to_string())?;
                Ok(Some(record))
            });

            let _ = tx.send(outcome);
        });

        catch(std::panic::AssertUnwindSafe(|| unsafe {
            database.fetchRecordWithID_completionHandler(record_id, &completion);
        }))
        .map_err(exception_to_string)?;

        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "codexmonitor cloudkit fetch timed out".to_string())?
    }

    fn delete_record_blocking(database: &CKDatabase, record_id: &CKRecordID) -> Result<(), String> {
        let (tx, rx) = std::sync::mpsc::channel::<Result<(), String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_handle = tx.clone();

        let completion = RcBlock::new(move |record_id_ptr: *mut CKRecordID, error_ptr: *mut NSError| {
            let tx = match tx_handle.lock().ok().and_then(|mut guard| guard.take()) {
                Some(sender) => sender,
                None => return,
            };

            let outcome = autoreleasepool(|_| unsafe {
                if !error_ptr.is_null() {
                    let error = Retained::<NSError>::retain(error_ptr)
                        .ok_or_else(|| "CloudKit delete failed (error was null)".to_string())?;
                    return Err(error.localizedDescription().to_string());
                }
                if record_id_ptr.is_null() {
                    return Err("CloudKit delete failed (record id was null)".to_string());
                }
                Ok(())
            });

            let _ = tx.send(outcome);
        });

        catch(std::panic::AssertUnwindSafe(|| unsafe {
            database.deleteRecordWithID_completionHandler(record_id, &completion);
        }))
        .map_err(exception_to_string)?;

        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "codexmonitor cloudkit delete timed out".to_string())?
    }

    fn perform_query_blocking(
        database: &CKDatabase,
        record_type: &str,
        predicate_format: &str,
        sort_key: Option<&str>,
        ascending: bool,
    ) -> Result<Vec<Retained<CKRecord>>, String> {
        let record_type = NSString::from_str(record_type);
        let predicate_format = NSString::from_str(predicate_format);
        let predicate =
            unsafe { NSPredicate::predicateWithFormat_argumentArray(&predicate_format, None) };

        let query = unsafe { CKQuery::initWithRecordType_predicate(CKQuery::alloc(), &record_type, &predicate) };
        if let Some(sort_key) = sort_key {
            let key = NSString::from_str(sort_key);
            let sort = NSSortDescriptor::sortDescriptorWithKey_ascending(Some(&key), ascending);
            let sort_array = objc2_foundation::NSArray::from_slice(&[&*sort]);
            unsafe { query.setSortDescriptors(Some(&sort_array)) };
        }

        let (tx, rx) = std::sync::mpsc::channel::<Result<Vec<Retained<CKRecord>>, String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_handle = tx.clone();

        let completion = RcBlock::new(move |records_ptr: *mut NSArray<CKRecord>, error_ptr: *mut NSError| {
            let tx = match tx_handle.lock().ok().and_then(|mut guard| guard.take()) {
                Some(sender) => sender,
                None => return,
            };

            let outcome = autoreleasepool(|_| unsafe {
                if !error_ptr.is_null() {
                    let error = Retained::<NSError>::retain(error_ptr)
                        .ok_or_else(|| "CloudKit query failed (error was null)".to_string())?;
                    return Err(error.localizedDescription().to_string());
                }
                if records_ptr.is_null() {
                    return Ok(Vec::new());
                }
                let records = Retained::<NSArray<CKRecord>>::retain(records_ptr)
                    .ok_or_else(|| "CloudKit query failed (records was null)".to_string())?;
                Ok(records.to_vec())
            });

            let _ = tx.send(outcome);
        });

        catch(std::panic::AssertUnwindSafe(|| unsafe {
            database.performQuery_inZoneWithID_completionHandler(&query, None, &completion);
        }))
        .map_err(exception_to_string)?;

        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "codexmonitor cloudkit query timed out".to_string())?
    }

    fn scope_record_suffix(scope_key: &str) -> String {
        // CloudKit record names are fairly permissive, but we keep it conservative and stable.
        let mut sanitized = String::with_capacity(scope_key.len());
        for ch in scope_key.chars() {
            if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
                sanitized.push(ch);
            } else {
                sanitized.push('_');
            }
        }
        if sanitized == scope_key {
            return sanitized;
        }
        let mut hasher = std::collections::hash_map::DefaultHasher::new();
        scope_key.hash(&mut hasher);
        let hash = hasher.finish();
        format!("{sanitized}-{hash:x}")
    }

    fn snapshot_record_name(runner_id: &str, scope_key: &str) -> String {
        format!("snap-{}-{}", runner_id, scope_record_suffix(scope_key))
    }

    fn runner_record_name(runner_id: &str) -> String {
        format!("runner-{runner_id}")
    }

    fn command_record_name(runner_id: &str, command_id: &str) -> String {
        format!("cmd-{}-{}", runner_id, command_id)
    }

    fn result_record_name(runner_id: &str, command_id: &str) -> String {
        format!("res-{}-{}", runner_id, command_id)
    }

    fn record_id_from_name(record_name: &str) -> Retained<CKRecordID> {
        autoreleasepool(|_| unsafe {
            let name = NSString::from_str(record_name);
            CKRecordID::initWithRecordName(CKRecordID::alloc(), &name)
        })
    }

    fn set_string_field(record: &CKRecord, key: &str, value: &str) {
        autoreleasepool(|_| unsafe {
            let key = NSString::from_str(key);
            let value = NSString::from_str(value);
            let value: &ProtocolObject<dyn CKRecordValue> = ProtocolObject::from_ref(&*value);
            record.setObject_forKey(Some(value), &key);
        });
    }

    fn set_bool_field(record: &CKRecord, key: &str, value: bool) {
        autoreleasepool(|_| unsafe {
            let key = NSString::from_str(key);
            let value = NSNumber::numberWithBool(value);
            let value: &ProtocolObject<dyn CKRecordValue> = ProtocolObject::from_ref(&*value);
            record.setObject_forKey(Some(value), &key);
        });
    }

    fn set_i64_field(record: &CKRecord, key: &str, value: i64) {
        autoreleasepool(|_| unsafe {
            let key = NSString::from_str(key);
            let value = NSNumber::numberWithLongLong(value as _);
            let value: &ProtocolObject<dyn CKRecordValue> = ProtocolObject::from_ref(&*value);
            record.setObject_forKey(Some(value), &key);
        });
    }

    fn get_string_field(record: &CKRecord, key: &str) -> Option<String> {
        autoreleasepool(|_| unsafe {
            let key = NSString::from_str(key);
            let value = record.objectForKey(&key)?;
            let obj: &AnyObject = value.as_ref();
            let ptr = obj as *const AnyObject as *mut NSString;
            let string = Retained::<NSString>::retain(ptr)?;
            Some(string.to_string())
        })
    }

    fn get_bool_field(record: &CKRecord, key: &str) -> Option<bool> {
        autoreleasepool(|_| unsafe {
            let key = NSString::from_str(key);
            let value = record.objectForKey(&key)?;
            let obj: &AnyObject = value.as_ref();
            let ptr = obj as *const AnyObject as *mut NSNumber;
            let number = Retained::<NSNumber>::retain(ptr)?;
            Some(number.boolValue())
        })
    }

    fn get_i64_field(record: &CKRecord, key: &str) -> Option<i64> {
        autoreleasepool(|_| unsafe {
            let key = NSString::from_str(key);
            let value = record.objectForKey(&key)?;
            let obj: &AnyObject = value.as_ref();
            let ptr = obj as *const AnyObject as *mut NSNumber;
            let number = Retained::<NSNumber>::retain(ptr)?;
            Some(number.longLongValue() as i64)
        })
    }

    pub(super) fn upsert_runner_presence_blocking(
        container_id: String,
        runner_id: String,
        name: String,
        platform: String,
    ) -> Result<CloudKitRunnerInfo, String> {
        let database = private_database(&container_id)?;
        let updated_at_ms = now_ms();
        let record_id = record_id_from_name(&runner_record_name(&runner_id));
        let record = upsert_record_retained(&database, "CodexMonitorRunner", &record_id)?;
        set_string_field(&record, "runnerId", &runner_id);
        set_string_field(&record, "name", &name);
        set_string_field(&record, "platform", &platform);
        set_i64_field(&record, "updatedAtMs", updated_at_ms);
        save_record_blocking(&database, &record)?;
        Ok(CloudKitRunnerInfo {
            runner_id,
            name,
            platform,
            updated_at_ms,
        })
    }

    pub(super) fn fetch_latest_runner_blocking(container_id: String) -> Result<Option<CloudKitRunnerInfo>, String> {
        let database = private_database(&container_id)?;
        let records = perform_query_blocking(
            &database,
            "CodexMonitorRunner",
            "updatedAtMs != 0",
            Some("updatedAtMs"),
            false,
        )?;
        let record = match records.first() {
            Some(record) => record,
            None => return Ok(None),
        };
        let runner_id = get_string_field(record, "runnerId").unwrap_or_default();
        let name = get_string_field(record, "name").unwrap_or_default();
        let platform = get_string_field(record, "platform").unwrap_or_else(|| "unknown".to_string());
        let updated_at_ms = get_i64_field(record, "updatedAtMs").unwrap_or(0);
        Ok(Some(CloudKitRunnerInfo {
            runner_id,
            name,
            platform,
            updated_at_ms,
        }))
    }

    pub(super) fn upsert_snapshot_blocking(
        container_id: String,
        runner_id: String,
        scope_key: String,
        payload_json: String,
    ) -> Result<(), String> {
        let database = private_database(&container_id)?;
        let updated_at_ms = now_ms();
        let record_id = record_id_from_name(&snapshot_record_name(&runner_id, &scope_key));
        let record = upsert_record_retained(&database, "CodexMonitorSnapshot", &record_id)?;
        set_string_field(&record, "runnerId", &runner_id);
        set_string_field(&record, "scopeKey", &scope_key);
        set_i64_field(&record, "updatedAtMs", updated_at_ms);
        set_string_field(&record, "payload", &payload_json);
        save_record_blocking(&database, &record)
    }

    pub(super) fn fetch_snapshot_blocking(
        container_id: String,
        runner_id: String,
        scope_key: String,
    ) -> Result<Option<CloudKitSnapshot>, String> {
        let database = private_database(&container_id)?;
        let record_id = record_id_from_name(&snapshot_record_name(&runner_id, &scope_key));
        let record = match fetch_record_retained(&database, &record_id)? {
            Some(record) => record,
            None => return Ok(None),
        };
        let payload_json = get_string_field(&record, "payload").unwrap_or_default();
        let updated_at_ms = get_i64_field(&record, "updatedAtMs").unwrap_or(0);
        Ok(Some(CloudKitSnapshot {
            scope_key,
            updated_at_ms,
            payload_json,
        }))
    }

    pub(super) fn insert_command_blocking(
        container_id: String,
        runner_id: String,
        payload_json: String,
    ) -> Result<(), String> {
        let command: IncomingCommand =
            serde_json::from_str(&payload_json).map_err(|e| format!("Invalid command JSON: {e}"))?;
        let database = private_database(&container_id)?;
        let created_at_ms = now_ms();
        let record_id = record_id_from_name(&command_record_name(&runner_id, &command.command_id));
        let record = autoreleasepool(|_| unsafe {
            let record_type = NSString::from_str("CodexMonitorCommand");
            CKRecord::initWithRecordType_recordID(CKRecord::alloc(), &record_type, &record_id)
        });
        set_string_field(&record, "runnerId", &runner_id);
        set_string_field(&record, "commandId", &command.command_id);
        if let Some(client_id) = &command.client_id {
            set_string_field(&record, "clientId", client_id);
        }
        set_string_field(&record, "type", &command.command_type);
        set_i64_field(&record, "createdAtMs", created_at_ms);
        set_string_field(&record, "status", "new");
        set_string_field(&record, "payload", &payload_json);
        save_record_blocking(&database, &record)
    }

    fn write_command_result_blocking(
        container_id: String,
        runner_id: String,
        command_id: String,
        ok: bool,
        payload_json: String,
    ) -> Result<(), String> {
        let database = private_database(&container_id)?;
        let created_at_ms = now_ms();
        let record_id = record_id_from_name(&result_record_name(&runner_id, &command_id));
        let record = upsert_record_retained(&database, "CodexMonitorCommandResult", &record_id)?;
        set_string_field(&record, "runnerId", &runner_id);
        set_string_field(&record, "commandId", &command_id);
        set_bool_field(&record, "ok", ok);
        set_i64_field(&record, "createdAtMs", created_at_ms);
        set_string_field(&record, "payload", &payload_json);
        save_record_blocking(&database, &record)
    }

    pub(super) fn fetch_command_result_blocking(
        container_id: String,
        runner_id: String,
        command_id: String,
    ) -> Result<Option<CloudKitCommandResult>, String> {
        let database = private_database(&container_id)?;
        let record_id = record_id_from_name(&result_record_name(&runner_id, &command_id));
        let record = match fetch_record_retained(&database, &record_id)? {
            Some(record) => record,
            None => return Ok(None),
        };
        let ok = get_bool_field(&record, "ok").unwrap_or(false);
        let created_at_ms = get_i64_field(&record, "createdAtMs").unwrap_or(0);
        let payload_json = get_string_field(&record, "payload").unwrap_or_else(|| "{}".to_string());
        Ok(Some(CloudKitCommandResult {
            command_id,
            ok,
            created_at_ms,
            payload_json,
        }))
    }

    fn command_result_exists_blocking(
        database: &CKDatabase,
        runner_id: &str,
        command_id: &str,
    ) -> Result<bool, String> {
        let record_id = record_id_from_name(&result_record_name(runner_id, command_id));
        Ok(fetch_record_retained(database, &record_id)?.is_some())
    }

    pub(super) fn fetch_latest_command_result_blocking(
        container_id: String,
        runner_id: String,
    ) -> Result<Option<CloudKitCommandResult>, String> {
        let database = private_database(&container_id)?;

        let escaped_runner_id = runner_id.replace('\"', "\\\"");
        let predicate = format!("runnerId == \"{escaped_runner_id}\"");
        let records = match perform_query_blocking(
            &database,
            "CodexMonitorCommandResult",
            &predicate,
            Some("createdAtMs"),
            false,
        ) {
            Ok(records) => records,
            Err(error) => {
                // CloudKit development schema may not have this record type yet. Treat as empty.
                if error.to_lowercase().contains("did not find record type") {
                    return Ok(None);
                }
                return Err(error);
            }
        };
        let Some(record) = records.first() else {
            return Ok(None);
        };

        let command_id = get_string_field(record, "commandId").unwrap_or_else(|| "".to_string());
        let ok = get_bool_field(record, "ok").unwrap_or(false);
        let created_at_ms = get_i64_field(record, "createdAtMs").unwrap_or(0);
        let payload_json = get_string_field(record, "payload").unwrap_or_else(|| "{}".to_string());

        if command_id.trim().is_empty() {
            return Ok(None);
        }

        Ok(Some(CloudKitCommandResult {
            command_id,
            ok,
            created_at_ms,
            payload_json,
        }))
    }

    async fn ensure_workspace_connected(
        workspace_id: &str,
        state: &AppState,
        app: &AppHandle,
    ) -> Result<(), String> {
        if state.sessions.lock().await.contains_key(workspace_id) {
            return Ok(());
        }
        let entry: WorkspaceEntry = {
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
        state
            .sessions
            .lock()
            .await
            .insert(entry.id.clone(), session);
        Ok(())
    }

    async fn publish_global_snapshot(
        container_id: &str,
        runner_id: &str,
        state: &AppState,
    ) -> Result<(), String> {
        let connected_ids: HashSet<String> = {
            let sessions = state.sessions.lock().await;
            sessions.keys().cloned().collect()
        };
        let list: Vec<WorkspaceInfo> = {
            let workspaces = state.workspaces.lock().await;
            workspaces
                .values()
                .cloned()
                .map(|entry: WorkspaceEntry| WorkspaceInfo {
                    id: entry.id.clone(),
                    name: entry.name.clone(),
                    path: entry.path.clone(),
                    connected: connected_ids.contains(&entry.id),
                    codex_bin: entry.codex_bin.clone(),
                    kind: entry.kind.clone(),
                    parent_id: entry.parent_id.clone(),
                    worktree: entry.worktree.clone(),
                    settings: entry.settings.clone(),
                })
                .collect()
        };

        let payload = serde_json::json!({ "workspaces": list });
        let scope_key = global_scope_key();
        let json = snapshot_envelope(&scope_key, runner_id, payload);
        upsert_snapshot_blocking(container_id.to_string(), runner_id.to_string(), scope_key, json)?;
        Ok(())
    }

    async fn fetch_thread_summaries(
        session: &crate::codex::WorkspaceSession,
    ) -> Result<Vec<serde_json::Value>, String> {
        let mut matching: Vec<serde_json::Value> = Vec::new();
        let target = 20usize;
        let mut cursor: Option<String> = None;
        let workspace_path = session.entry.path.clone();

        while matching.len() < target {
            let response = session
                .send_request(
                    "thread/list",
                    serde_json::json!({
                        "cursor": cursor,
                        "limit": 20,
                    }),
                )
                .await?;

            let result = response
                .get("result")
                .cloned()
                .unwrap_or_else(|| response.clone());
            let data = result
                .get("data")
                .and_then(|value| value.as_array())
                .cloned()
                .unwrap_or_default();
            for entry in data {
                let cwd = entry.get("cwd").and_then(|value| value.as_str()).unwrap_or("");
                if cwd == workspace_path {
                    matching.push(entry);
                }
            }
            let next = result
                .get("nextCursor")
                .or_else(|| result.get("next_cursor"))
                .and_then(|value| value.as_str())
                .map(|value| value.to_string());
            cursor = next;
            if cursor.is_none() {
                break;
            }
        }

        // Convert into minimal summaries {id, name}.
        let summaries: Vec<serde_json::Value> = matching
            .into_iter()
            .enumerate()
            .filter_map(|(idx, thread)| {
                let id = thread.get("id")?.as_str()?.to_string();
                let preview = thread
                    .get("preview")
                    .and_then(|value| value.as_str())
                    .unwrap_or("")
                    .trim()
                    .to_string();
                let fallback = format!("Agent {}", idx + 1);
                let mut name = if !preview.is_empty() { preview } else { fallback };
                if name.chars().count() > 38 {
                    name = name.chars().take(38).collect::<String>() + "…";
                }
                Some(serde_json::json!({ "id": id, "name": name }))
            })
            .collect();

        Ok(summaries)
    }

    async fn publish_workspace_snapshot(
        container_id: &str,
        runner_id: &str,
        workspace_id: &str,
        state: &AppState,
    ) -> Result<(), String> {
        let session = {
            let sessions = state.sessions.lock().await;
            sessions
                .get(workspace_id)
                .cloned()
                .ok_or("workspace not connected")?
        };

        let threads = fetch_thread_summaries(&session).await?;
        let prefetch_thread_ids: Vec<String> = threads
            .iter()
            .take(3)
            .filter_map(|thread| {
                thread
                    .get("id")
                    .and_then(|value| value.as_str())
                    .map(|value| value.to_string())
            })
            .collect();
        let scope_key = workspace_scope_key(workspace_id);
        let payload = serde_json::json!({ "workspaceId": workspace_id, "threads": threads, "threadStatusById": {} });
        let json = snapshot_envelope(&scope_key, runner_id, payload);

        upsert_snapshot_blocking(container_id.to_string(), runner_id.to_string(), scope_key, json)?;

        // Opportunistically cache a few recent thread snapshots so the iOS client can render
        // instantly when switching between threads.
        for thread_id in prefetch_thread_ids {
            let resume = session
                .send_request("thread/resume", serde_json::json!({ "threadId": thread_id }))
                .await;
            let resume = match resume {
                Ok(value) => value,
                Err(_) => continue,
            };
            if let Some(thread) = extract_thread_from_resume_response(&resume) {
                let _ = publish_thread_snapshot(container_id, runner_id, workspace_id, &thread_id, thread).await;
            }
        }
        Ok(())
    }

    fn extract_thread_from_resume_response(response: &serde_json::Value) -> Option<serde_json::Value> {
        let result = response.get("result").cloned().unwrap_or_else(|| response.clone());
        result
            .get("thread")
            .cloned()
            .or_else(|| response.get("thread").cloned())
    }

    fn latest_agent_text(thread: &serde_json::Value) -> Option<String> {
        let turns = thread.get("turns")?.as_array()?;
        let mut last: Option<String> = None;
        for turn in turns {
            let items = match turn.get("items").and_then(|v| v.as_array()) {
                Some(items) => items,
                None => continue,
            };
            for item in items.iter() {
                if item.get("type").and_then(|v| v.as_str()) == Some("agentMessage") {
                    if let Some(text) = item.get("text").and_then(|v| v.as_str()) {
                        if !text.trim().is_empty() {
                            last = Some(text.to_string());
                        }
                    }
                }
            }
        }
        last
    }

    fn truncate_chars(value: &str, max_chars: usize) -> String {
        if max_chars == 0 {
            return String::new();
        }
        let mut chars = value.chars();
        let mut out = String::new();
        for _ in 0..max_chars {
            if let Some(ch) = chars.next() {
                out.push(ch);
            } else {
                return out;
            }
        }
        if chars.next().is_some() {
            out.push('…');
        }
        out
    }

    fn user_inputs_to_text(content: &serde_json::Value, max_chars: usize) -> String {
        let Some(inputs) = content.as_array() else {
            return String::new();
        };
        let mut parts: Vec<String> = Vec::new();
        for input in inputs {
            let Some(obj) = input.as_object() else {
                continue;
            };
            let input_type = obj.get("type").and_then(|v| v.as_str()).unwrap_or("");
            match input_type {
                "text" => {
                    if let Some(text) = obj.get("text").and_then(|v| v.as_str()) {
                        let trimmed = text.trim();
                        if !trimmed.is_empty() {
                            parts.push(trimmed.to_string());
                        }
                    }
                }
                "skill" => {
                    if let Some(name) = obj.get("name").and_then(|v| v.as_str()) {
                        let trimmed = name.trim();
                        if !trimmed.is_empty() {
                            parts.push(format!("${trimmed}"));
                        }
                    }
                }
                "image" | "localImage" => {
                    parts.push("[image]".to_string());
                }
                _ => {}
            }
        }
        let joined = parts.join(" ");
        truncate_chars(joined.trim(), max_chars)
    }

    fn build_message_items(thread: &serde_json::Value, max_items: usize, max_text_chars: usize) -> Vec<serde_json::Value> {
        let turns = thread.get("turns").and_then(|v| v.as_array()).cloned().unwrap_or_default();
        let mut out: Vec<serde_json::Value> = Vec::new();
        for turn in turns {
            let items = match turn.get("items").and_then(|v| v.as_array()) {
                Some(items) => items,
                None => continue,
            };
            for item in items {
                let item_type = item.get("type").and_then(|v| v.as_str()).unwrap_or("");
                let id = item.get("id").and_then(|v| v.as_str()).unwrap_or("");
                if id.is_empty() {
                    continue;
                }
                match item_type {
                    "userMessage" => {
                        let text = user_inputs_to_text(item.get("content").unwrap_or(&serde_json::Value::Null), max_text_chars);
                        let rendered = if text.trim().is_empty() {
                            "[message]".to_string()
                        } else {
                            text
                        };
                        out.push(serde_json::json!({
                            "id": id,
                            "kind": "message",
                            "role": "user",
                            "text": rendered,
                        }));
                    }
                    "agentMessage" => {
                        let text = item.get("text").and_then(|v| v.as_str()).unwrap_or("");
                        let text = truncate_chars(text, max_text_chars);
                        let rendered = if text.trim().is_empty() {
                            "[message]".to_string()
                        } else {
                            text
                        };
                        out.push(serde_json::json!({
                            "id": id,
                            "kind": "message",
                            "role": "assistant",
                            "text": rendered,
                        }));
                    }
                    _ => {}
                }
            }
        }
        if max_items > 0 && out.len() > max_items {
            out.drain(0..(out.len() - max_items));
        }
        out
    }

    async fn publish_thread_snapshot(
        container_id: &str,
        runner_id: &str,
        workspace_id: &str,
        thread_id: &str,
        thread: serde_json::Value,
    ) -> Result<(), String> {
        let scope_key = thread_scope_key(workspace_id, thread_id);
        let items = build_message_items(&thread, 200, 8000);
        let payload = serde_json::json!({
            "workspaceId": workspace_id,
            "threadId": thread_id,
            "items": items,
            "thread": null,
            "status": null,
        });
        let json = snapshot_envelope(&scope_key, runner_id, payload);
        upsert_snapshot_blocking(container_id.to_string(), runner_id.to_string(), scope_key, json)?;
        Ok(())
    }

    async fn execute_command(
        command: IncomingCommand,
        state: &AppState,
        app: &AppHandle,
    ) -> Result<serde_json::Value, String> {
        let (container_id, runner_id) = {
            let settings = state.app_settings.lock().await;
            (
                settings
                    .cloudkit_container_id
                    .clone()
                    .unwrap_or_default(),
                settings.runner_id.clone(),
            )
        };
        let container_id = container_id.trim().to_string();
        let can_publish = !container_id.is_empty();

        match command.command_type.as_str() {
            "connectWorkspace" => {
                let workspace_id = command
                    .args
                    .get("workspaceId")
                    .and_then(|value| value.as_str())
                    .ok_or("connectWorkspace requires args.workspaceId")?;
                ensure_workspace_connected(workspace_id, state, app).await?;
                if can_publish {
                    let _ = publish_global_snapshot(&container_id, &runner_id, state).await;
                    let _ = publish_workspace_snapshot(&container_id, &runner_id, workspace_id, state).await;
                }
                Ok(serde_json::json!({ "connected": true }))
            }
            "startThread" => {
                let workspace_id = command
                    .args
                    .get("workspaceId")
                    .and_then(|value| value.as_str())
                    .ok_or("startThread requires args.workspaceId")?;
                ensure_workspace_connected(workspace_id, state, app).await?;

                let session = {
                    let sessions = state.sessions.lock().await;
                    sessions
                        .get(workspace_id)
                        .cloned()
                        .ok_or("workspace not connected")?
                };
                let params = serde_json::json!({
                    "cwd": session.entry.path,
                    "approvalPolicy": "on-request"
                });
                let response = session.send_request("thread/start", params).await?;
                if can_publish {
                    let _ = publish_workspace_snapshot(&container_id, &runner_id, workspace_id, state).await;
                }
                Ok(response)
            }
            "resumeThread" => {
                let workspace_id = command
                    .args
                    .get("workspaceId")
                    .and_then(|value| value.as_str())
                    .ok_or("resumeThread requires args.workspaceId")?;
                let thread_id = command
                    .args
                    .get("threadId")
                    .and_then(|value| value.as_str())
                    .ok_or("resumeThread requires args.threadId")?;
                ensure_workspace_connected(workspace_id, state, app).await?;

                let session = {
                    let sessions = state.sessions.lock().await;
                    sessions
                        .get(workspace_id)
                        .cloned()
                        .ok_or("workspace not connected")?
                };
                let params = serde_json::json!({ "threadId": thread_id });
                let response = session.send_request("thread/resume", params).await?;
                if can_publish {
                    if let Some(thread) = extract_thread_from_resume_response(&response) {
                        let _ = publish_thread_snapshot(&container_id, &runner_id, workspace_id, thread_id, thread).await;
                    }
                }
                Ok(response)
            }
            "sendUserMessage" => {
                let workspace_id = command
                    .args
                    .get("workspaceId")
                    .and_then(|value| value.as_str())
                    .ok_or("sendUserMessage requires args.workspaceId")?;
                let thread_id = command
                    .args
                    .get("threadId")
                    .and_then(|value| value.as_str())
                    .ok_or("sendUserMessage requires args.threadId")?;
                let text = command
                    .args
                    .get("text")
                    .and_then(|value| value.as_str())
                    .ok_or("sendUserMessage requires args.text")?;
                let model = command.args.get("model").and_then(|value| value.as_str());
                let effort = command.args.get("effort").and_then(|value| value.as_str());
                let access_mode = command
                    .args
                    .get("accessMode")
                    .and_then(|value| value.as_str())
                    .unwrap_or("current");

                ensure_workspace_connected(workspace_id, state, app).await?;
                let session = {
                    let sessions = state.sessions.lock().await;
                    sessions
                        .get(workspace_id)
                        .cloned()
                        .ok_or("workspace not connected")?
                };

                let sandbox_policy = match access_mode {
                    "full-access" => serde_json::json!({ "type": "dangerFullAccess" }),
                    "read-only" => serde_json::json!({ "type": "readOnly" }),
                    _ => serde_json::json!({
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

                let params = serde_json::json!({
                    "threadId": thread_id,
                    "input": [{ "type": "text", "text": text }],
                    "cwd": session.entry.path,
                    "approvalPolicy": approval_policy,
                    "sandboxPolicy": sandbox_policy,
                    "model": model,
                    "effort": effort,
                });
                session.send_request("turn/start", params).await?;

                let mut assistant_text: Option<String> = None;
                // Poll for a response, publishing snapshots as we go.
                for _ in 0..30 {
                    tokio::time::sleep(Duration::from_millis(2000)).await;
                    let resume = session
                        .send_request("thread/resume", serde_json::json!({ "threadId": thread_id }))
                        .await;
                    let resume = match resume {
                        Ok(value) => value,
                        Err(_) => continue,
                    };
                    if let Some(thread) = extract_thread_from_resume_response(&resume) {
                        if can_publish {
                            let _ = publish_thread_snapshot(&container_id, &runner_id, workspace_id, thread_id, thread.clone()).await;
                        }
                        assistant_text = latest_agent_text(&thread);
                        if assistant_text.as_deref().unwrap_or("").trim().len() > 0 {
                            break;
                        }
                    }
                }

                Ok(serde_json::json!({
                    "submitted": true,
                    "assistantText": assistant_text,
                }))
            }
            other => Err(format!("Unsupported command type: {other}")),
        }
    }

    pub(super) async fn command_poller_loop(app: AppHandle) {
        debug_log("starting CloudKit poller loop");
        let mut processed: HashSet<String> = HashSet::new();
        let mut processed_order: Vec<String> = Vec::new();
        let mut last_cleanup = Instant::now();
        let mut last_presence = Instant::now().checked_sub(Duration::from_secs(60)).unwrap_or_else(Instant::now);
        let mut last_global = Instant::now().checked_sub(Duration::from_secs(60)).unwrap_or_else(Instant::now);
        let mut recent_send_dedupe: HashMap<u64, Instant> = HashMap::new();
        let mut last_dedupe_cleanup = Instant::now();

        loop {
            let (enabled, container_id, runner_id, poll_ms) = {
                let state = app.state::<AppState>();
                let settings = state.app_settings.lock().await;
                (
                    settings.cloudkit_enabled,
                    settings.cloudkit_container_id.clone(),
                    settings.runner_id.clone(),
                    settings.cloudkit_poll_interval_ms.unwrap_or(2000),
                )
            };

            if !enabled {
                tokio::time::sleep(Duration::from_millis(500)).await;
                continue;
            }
            let container_id = match require_container_id(container_id) {
                Ok(value) => value,
                Err(_) => {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            if last_presence.elapsed() > Duration::from_secs(5) {
                if let Err(error) = upsert_runner_presence_blocking(
                    container_id.clone(),
                    runner_id.clone(),
                    "CodexMonitor".to_string(),
                    "macos".to_string(),
                ) {
                    debug_log(&format!("presence upsert failed: {error}"));
                }
                last_presence = Instant::now();
            }

            if last_global.elapsed() > Duration::from_secs(5) {
                let state = app.state::<AppState>();
                if let Err(error) = publish_global_snapshot(&container_id, &runner_id, &state).await {
                    debug_log(&format!("global snapshot publish failed: {error}"));
                }
                last_global = Instant::now();
            }

            let state = app.state::<AppState>();
            let database = match private_database(&container_id) {
                Ok(db) => db,
                Err(_) => {
                    tokio::time::sleep(Duration::from_secs(2)).await;
                    continue;
                }
            };

            let escaped_runner_id = runner_id.replace('\"', "\\\"");
            let predicate = format!("runnerId == \"{escaped_runner_id}\" AND status == \"new\"");
            let pending: Vec<(String, String)> = {
                let records = match perform_query_blocking(
                    &database,
                    "CodexMonitorCommand",
                    &predicate,
                    Some("createdAtMs"),
                    true,
                ) {
                    Ok(records) => records,
                    Err(error) => {
                        debug_log(&format!("command query failed: {error}"));
                        Vec::new()
                    }
                };

                let mut extracted: Vec<(String, String)> = Vec::new();
                for record in records {
                    // CKRecord isn't Send; extract what we need before awaiting.
                    let (command_id, payload_json) = match (
                        get_string_field(&record, "commandId"),
                        get_string_field(&record, "payload"),
                    ) {
                        (Some(command_id), Some(payload_json))
                            if !payload_json.trim().is_empty() =>
                        {
                            (command_id, payload_json)
                        }
                        _ => continue,
                    };
                    extracted.push((command_id, payload_json));
                }
                extracted
            };

            if pending.is_empty() {
                tokio::time::sleep(Duration::from_millis(poll_ms as u64)).await;
                continue;
            }

            for (command_id, payload_json) in pending {
                let command: IncomingCommand = match serde_json::from_str(&payload_json) {
                    Ok(value) => value,
                    Err(_) => continue,
                };

                // If we already wrote a result for this command, never execute again.
                // This makes the runner idempotent across restarts and across multiple instances.
                if let Ok(true) = command_result_exists_blocking(&database, &runner_id, &command_id) {
                    debug_log(&format!("skipping already-processed command {command_id}"));
                    let record_id = record_id_from_name(&command_record_name(&runner_id, &command_id));
                    let _ = delete_record_blocking(&database, &record_id);
                    continue;
                }
                if processed.contains(&command_id) {
                    // Best-effort cleanup of duplicate commands; delete and skip.
                    let record_id = record_id_from_name(&command_record_name(&runner_id, &command_id));
                    let _ = delete_record_blocking(&database, &record_id);
                    continue;
                }

                processed.insert(command_id.clone());
                processed_order.push(command_id.clone());

                if command.command_type == "sendUserMessage" {
                    let client_id = command.client_id.clone().unwrap_or_default();
                    let workspace_id = command.args.get("workspaceId").and_then(|v| v.as_str()).unwrap_or("");
                    let thread_id = command.args.get("threadId").and_then(|v| v.as_str()).unwrap_or("");
                    let text = command.args.get("text").and_then(|v| v.as_str()).unwrap_or("");
                    if !client_id.is_empty() && !workspace_id.is_empty() && !thread_id.is_empty() && !text.is_empty() {
                        let mut hasher = std::collections::hash_map::DefaultHasher::new();
                        client_id.hash(&mut hasher);
                        workspace_id.hash(&mut hasher);
                        thread_id.hash(&mut hasher);
                        text.hash(&mut hasher);
                        let key = hasher.finish();
                        if let Some(prev) = recent_send_dedupe.get(&key) {
                            // CloudKit commands can be observed multiple times across devices/polls.
                            // Keep this window fairly large to avoid accidental double-execution from
                            // UI retries or delayed record visibility.
                            if prev.elapsed() < Duration::from_millis(10_000) {
                                debug_log(&format!("skipping duplicate sendUserMessage command {command_id}"));
                                let payload_json = serde_json::json!({ "skippedDuplicate": true }).to_string();
                                let _ = write_command_result_blocking(
                                    container_id.clone(),
                                    runner_id.clone(),
                                    command_id.clone(),
                                    true,
                                    payload_json,
                                );
                                let record_id = record_id_from_name(&command_record_name(&runner_id, &command_id));
                                let _ = delete_record_blocking(&database, &record_id);
                                continue;
                            }
                        }
                        recent_send_dedupe.insert(key, Instant::now());
                    }
                }

                debug_log(&format!("processing command {command_id} type={}", command.command_type));
                let result = execute_command(command, state.inner(), &app).await;
                let (ok, payload) = match result {
                    Ok(value) => (true, value),
                    Err(message) => (false, serde_json::json!({ "error": message })),
                };
                let payload_json =
                    serde_json::to_string(&payload).unwrap_or_else(|_| "{}".to_string());
                if let Err(error) = write_command_result_blocking(
                    container_id.clone(),
                    runner_id.clone(),
                    command_id.clone(),
                    ok,
                    payload_json,
                ) {
                    debug_log(&format!("writing command result failed: {error}"));
                }

                let record_id = record_id_from_name(&command_record_name(&runner_id, &command_id));
                if let Err(error) = delete_record_blocking(&database, &record_id) {
                    debug_log(&format!("deleting command record failed: {error}"));
                }
            }

            if last_cleanup.elapsed() > Duration::from_secs(60) && processed_order.len() > 1000 {
                // Keep memory bounded; CloudKit deletions handle the durable side.
                let drain = processed_order.len().saturating_sub(500);
                for id in processed_order.drain(0..drain) {
                    processed.remove(&id);
                }
                last_cleanup = Instant::now();
            }

            if last_dedupe_cleanup.elapsed() > Duration::from_secs(30) && recent_send_dedupe.len() > 200 {
                recent_send_dedupe.retain(|_, instant| instant.elapsed() < Duration::from_secs(30));
                last_dedupe_cleanup = Instant::now();
            }

            tokio::time::sleep(Duration::from_millis(poll_ms as u64)).await;
        }
    }

    pub(super) fn account_status_blocking(container_id: String) -> Result<CloudKitStatus, String> {
        let container = container_with_identifier(&container_id)?;
        let (tx, rx) = std::sync::mpsc::channel::<Result<CloudKitStatus, String>>();
        let tx = Arc::new(Mutex::new(Some(tx)));
        let tx_handle = tx.clone();

        let completion = RcBlock::new(move |status: CKAccountStatus, error_ptr: *mut NSError| {
            let tx = match tx_handle.lock().ok().and_then(|mut guard| guard.take()) {
                Some(sender) => sender,
                None => return,
            };

            let outcome = autoreleasepool(|_| unsafe {
                if !error_ptr.is_null() {
                    let error = Retained::<NSError>::retain(error_ptr)
                        .ok_or_else(|| "CloudKit status failed (error was null)".to_string())?;
                    return Err(error.localizedDescription().to_string());
                }

                let available = status == CKAccountStatus::Available;
                let status_label = match status {
                    CKAccountStatus::Available => "available",
                    CKAccountStatus::NoAccount => "no-account",
                    CKAccountStatus::Restricted => "restricted",
                    CKAccountStatus::CouldNotDetermine => "unknown",
                    _ => "unknown",
                };
                Ok(CloudKitStatus {
                    available,
                    status: status_label.to_string(),
                })
            });

            let _ = tx.send(outcome);
        });

        catch(std::panic::AssertUnwindSafe(|| unsafe {
            container.accountStatusWithCompletionHandler(&completion);
        }))
        .map_err(exception_to_string)?;

        rx.recv_timeout(Duration::from_secs(15))
            .map_err(|_| "codexmonitor cloudkit status timed out".to_string())?
    }

    pub(super) fn test_roundtrip_blocking(container_id: String) -> Result<CloudKitTestResult, String> {
        let start = Instant::now();
        let container = container_with_identifier(&container_id)?;

        let record_name = format!("test-{}-{}", Uuid::new_v4(), start.elapsed().as_millis());

        let record_id = autoreleasepool(|_| unsafe {
            let name = NSString::from_str(&record_name);
            CKRecordID::initWithRecordName(CKRecordID::alloc(), &name)
        });

        let record = autoreleasepool(|_| unsafe {
            let record_type = NSString::from_str("CodexMonitorTest");
            CKRecord::initWithRecordType_recordID(CKRecord::alloc(), &record_type, &record_id)
        });

        autoreleasepool(|_| unsafe {
            let key = NSString::from_str("value");
            let value = NSString::from_str("ok");
            let value: &ProtocolObject<dyn CKRecordValue> = ProtocolObject::from_ref(&*value);
            record.setObject_forKey(Some(value), &key);
        });

        let database = catch(std::panic::AssertUnwindSafe(|| unsafe {
            container.privateCloudDatabase()
        }))
            .map_err(exception_to_string)?;

        save_record_blocking(&database, &record)?;
        fetch_record_blocking(&database, &record_id)?;

        Ok(CloudKitTestResult {
            record_name,
            duration_ms: start.elapsed().as_millis() as u64,
        })
    }
}

#[cfg(not(any(target_os = "macos", target_os = "ios")))]
mod cloudkit_impl {
    use super::{CloudKitStatus, CloudKitTestResult};

    pub(super) fn ensure_cloudkit_allowed() -> Result<(), String> {
        Err("CloudKit is only supported on Apple platforms.".to_string())
    }

    pub(super) fn account_status_blocking(_container_id: String) -> Result<CloudKitStatus, String> {
        Err("CloudKit is only supported on Apple platforms.".to_string())
    }

    pub(super) fn test_roundtrip_blocking(_container_id: String) -> Result<CloudKitTestResult, String> {
        Err("CloudKit is only supported on Apple platforms.".to_string())
    }
}
