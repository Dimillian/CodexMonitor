use serde::Serialize;
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

pub(crate) fn cloudkit_cli_status(container_id: String) -> Result<CloudKitStatus, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::account_status_blocking(container_id)
}

pub(crate) fn cloudkit_cli_test(container_id: String) -> Result<CloudKitTestResult, String> {
    cloudkit_impl::ensure_cloudkit_allowed()?;
    cloudkit_impl::test_roundtrip_blocking(container_id)
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

#[cfg(any(target_os = "macos", target_os = "ios"))]
mod cloudkit_impl {
    use std::sync::{Arc, Mutex};
    use std::time::{Duration, Instant};

    use block2::RcBlock;
    use objc2::AnyThread;
    use objc2::exception::catch;
    use objc2::rc::{autoreleasepool, Retained};
    use objc2::runtime::ProtocolObject;
    use objc2_cloud_kit::{CKAccountStatus, CKContainer, CKDatabase, CKRecord, CKRecordID, CKRecordValue};
    use objc2_foundation::{NSError, NSString};
    use uuid::Uuid;

    use super::{CloudKitStatus, CloudKitTestResult};

    fn exception_to_string(exception: Option<Retained<objc2::exception::Exception>>) -> String {
        exception
            .as_deref()
            .map(|error| error.to_string())
            .unwrap_or_else(|| "Unknown Objective-C exception".to_string())
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

    fn container_with_identifier(container_id: &str) -> Result<Retained<CKContainer>, String> {
        autoreleasepool(|_| {
            let identifier = NSString::from_str(container_id);
            catch(|| unsafe { CKContainer::containerWithIdentifier(&identifier) })
                .map_err(exception_to_string)
        })
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
