use std::collections::HashMap;
use std::future::Future;
use std::path::PathBuf;
use std::sync::Arc;

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::backend::app_server::WorkspaceSession;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::resolve_workspace_codex_home;
use crate::shared::process_core::kill_child_process_tree;
use crate::types::{AppSettings, WorkspaceEntry};

use super::helpers::resolve_entry_and_parent;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct WorkspaceRuntimeCodexArgsResult {
    pub(crate) applied_codex_args: Option<String>,
    pub(crate) respawned: bool,
}

pub(crate) async fn set_workspace_runtime_codex_args_core<F, Fut>(
    workspace_id: String,
    codex_args_override: Option<String>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    spawn_session: F,
) -> Result<WorkspaceRuntimeCodexArgsResult, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let (entry, parent_entry) = resolve_entry_and_parent(workspaces, &workspace_id).await?;

    let (default_bin, resolved_args) = {
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, parent_entry.as_ref(), Some(&settings)),
        )
    };

    let target_args = codex_args_override
        .as_deref()
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(str::to_string)
        .or(resolved_args);

    // If we are not connected, we can't respawn. Treat this as a no-op success; callers
    // should call again after connecting.
    let current = sessions.lock().await.get(&entry.id).cloned();
    let Some(current) = current else {
        return Ok(WorkspaceRuntimeCodexArgsResult {
            applied_codex_args: target_args,
            respawned: false,
        });
    };

    if current.codex_args == target_args {
        return Ok(WorkspaceRuntimeCodexArgsResult {
            applied_codex_args: target_args,
            respawned: false,
        });
    }

    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
    let new_session = spawn_session(entry.clone(), default_bin, target_args.clone(), codex_home).await?;
    if let Some(old_session) = sessions.lock().await.insert(entry.id.clone(), new_session) {
        let mut child = old_session.child.lock().await;
        kill_child_process_tree(&mut child).await;
    }

    Ok(WorkspaceRuntimeCodexArgsResult {
        applied_codex_args: target_args,
        respawned: true,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    use std::process::Stdio;
    use std::sync::atomic::{AtomicU64, AtomicUsize, Ordering};

    use tokio::process::Command;

    use crate::types::{WorkspaceKind, WorkspaceSettings};

    fn make_workspace_entry(id: &str) -> WorkspaceEntry {
        WorkspaceEntry {
            id: id.to_string(),
            name: id.to_string(),
            path: "/tmp".to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        }
    }

    fn make_session(entry: WorkspaceEntry, codex_args: Option<String>) -> WorkspaceSession {
        let mut cmd = if cfg!(windows) {
            let mut cmd = Command::new("cmd");
            cmd.args(["/C", "more"]);
            cmd
        } else {
            let mut cmd = Command::new("sh");
            cmd.args(["-c", "cat"]);
            cmd
        };

        cmd.stdin(Stdio::piped())
            .stdout(Stdio::null())
            .stderr(Stdio::null());

        let mut child = cmd.spawn().expect("spawn dummy child");
        let stdin = child.stdin.take().expect("dummy child stdin");

        WorkspaceSession {
            entry,
            codex_args,
            child: Mutex::new(child),
            stdin: Mutex::new(stdin),
            pending: Mutex::new(HashMap::new()),
            next_id: AtomicU64::new(0),
            background_thread_callbacks: Mutex::new(HashMap::new()),
        }
    }

    #[test]
    fn set_workspace_runtime_codex_args_is_noop_when_workspace_not_connected() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let sessions = Mutex::new(HashMap::<String, Arc<WorkspaceSession>>::new());
            let app_settings = Mutex::new(AppSettings::default());

            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("  --profile dev  ".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--profile dev".to_string()),
                    respawned: false
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_is_noop_when_args_match() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let current_session = Arc::new(make_session(entry.clone(), Some("--same".to_string())));
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            let app_settings = Mutex::new(AppSettings::default());

            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--same".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--same".to_string()),
                    respawned: false
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 0);
        });
    }

    #[test]
    fn set_workspace_runtime_codex_args_respawns_when_args_change() {
        tokio::runtime::Runtime::new().unwrap().block_on(async {
            let entry = make_workspace_entry("ws-1");
            let workspaces = Mutex::new(HashMap::from([(entry.id.clone(), entry.clone())]));
            let current_session = Arc::new(make_session(entry.clone(), Some("--old".to_string())));
            let sessions = Mutex::new(HashMap::from([(entry.id.clone(), current_session)]));
            let app_settings = Mutex::new(AppSettings::default());

            let spawn_calls = Arc::new(AtomicUsize::new(0));
            let spawn_calls_ref = spawn_calls.clone();

            let result = set_workspace_runtime_codex_args_core(
                entry.id.clone(),
                Some("--new".to_string()),
                &workspaces,
                &sessions,
                &app_settings,
                move |entry, _bin, args, _home| {
                    let spawn_calls_ref = spawn_calls_ref.clone();
                    async move {
                        spawn_calls_ref.fetch_add(1, Ordering::SeqCst);
                        Ok(Arc::new(make_session(entry, args)))
                    }
                },
            )
            .await
            .expect("core call succeeds");

            assert_eq!(
                result,
                WorkspaceRuntimeCodexArgsResult {
                    applied_codex_args: Some("--new".to_string()),
                    respawned: true
                }
            );
            assert_eq!(spawn_calls.load(Ordering::SeqCst), 1);

            let next = sessions
                .lock()
                .await
                .get(&entry.id)
                .expect("session updated")
                .codex_args
                .clone();
            assert_eq!(next, Some("--new".to_string()));
        });
    }
}
