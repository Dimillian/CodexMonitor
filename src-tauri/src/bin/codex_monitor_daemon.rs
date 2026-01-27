#[allow(dead_code)]
#[path = "../backend/mod.rs"]
mod backend;
#[path = "../codex_args.rs"]
mod codex_args;
#[path = "../codex_home.rs"]
mod codex_home;
#[path = "../codex_config.rs"]
mod codex_config;
#[path = "../rules.rs"]
mod rules;
#[path = "../storage.rs"]
mod storage;
#[path = "../utils.rs"]
mod utils;
#[allow(dead_code)]
#[path = "../types.rs"]
mod types;

use serde::{Deserialize, Serialize};
use serde_json::{json, Map, Value};
use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::Read;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;

use ignore::WalkBuilder;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::process::Command;
use tokio::sync::{broadcast, mpsc, Mutex};
use uuid::Uuid;
use utils::{git_env_path, resolve_git_binary};

use backend::app_server::{spawn_workspace_session, WorkspaceSession};
use backend::events::{AppServerEvent, EventSink, TerminalOutput};
use storage::{read_settings, read_workspaces, write_settings, write_workspaces};
use types::{
    AppSettings, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeInfo,
    WorktreeSetupStatus,
};

const DEFAULT_LISTEN_ADDR: &str = "127.0.0.1:4732";
const WORKTREE_SETUP_MARKERS_DIR: &str = "worktree-setup";
const WORKTREE_SETUP_MARKER_EXT: &str = "ran";

fn worktree_setup_marker_path(data_dir: &PathBuf, workspace_id: &str) -> PathBuf {
    data_dir
        .join(WORKTREE_SETUP_MARKERS_DIR)
        .join(format!("{workspace_id}.{WORKTREE_SETUP_MARKER_EXT}"))
}

fn normalize_setup_script(script: Option<String>) -> Option<String> {
    match script {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value),
        None => None,
    }
}

#[derive(Clone)]
struct DaemonEventSink {
    tx: broadcast::Sender<DaemonEvent>,
}

#[derive(Clone)]
enum DaemonEvent {
    AppServer(AppServerEvent),
    #[allow(dead_code)]
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
    data_dir: PathBuf,
    workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: PathBuf,
    settings_path: PathBuf,
    app_settings: Mutex<AppSettings>,
    event_sink: DaemonEventSink,
}

#[derive(Serialize, Deserialize)]
struct WorkspaceFileResponse {
    content: String,
    truncated: bool,
}

#[derive(Serialize, Deserialize)]
struct AgentMdResponse {
    exists: bool,
    content: String,
    truncated: bool,
}

impl DaemonState {
    fn load(config: &DaemonConfig, event_sink: DaemonEventSink) -> Self {
        let storage_path = config.data_dir.join("workspaces.json");
        let settings_path = config.data_dir.join("settings.json");
        let workspaces = read_workspaces(&storage_path).unwrap_or_default();
        let app_settings = read_settings(&settings_path).unwrap_or_default();
        Self {
            data_dir: config.data_dir.clone(),
            workspaces: Mutex::new(workspaces),
            sessions: Mutex::new(HashMap::new()),
            storage_path,
            settings_path,
            app_settings: Mutex::new(app_settings),
            event_sink,
        }
    }

    async fn kill_session(&self, workspace_id: &str) {
        let session = {
            let mut sessions = self.sessions.lock().await;
            sessions.remove(workspace_id)
        };

        let Some(session) = session else {
            return;
        };

        let mut child = session.child.lock().await;
        let _ = child.kill().await;
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

    async fn is_workspace_path_dir(&self, path: String) -> bool {
        PathBuf::from(&path).is_dir()
    }

    async fn add_workspace(
        &self,
        path: String,
        codex_bin: Option<String>,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        if !PathBuf::from(&path).is_dir() {
            return Err("Workspace path must be a folder.".to_string());
        }

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

        let (default_bin, codex_args) = {
            let settings = self.app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                codex_args::resolve_workspace_codex_args(&entry, None, Some(&settings)),
            )
        };

        let codex_home = codex_home::resolve_workspace_codex_home(&entry, None);
        let session = spawn_workspace_session(
            entry.clone(),
            default_bin,
            codex_args,
            codex_home,
            client_version,
            self.event_sink.clone(),
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

    async fn add_worktree(
        &self,
        parent_id: String,
        branch: String,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let branch = branch.trim().to_string();
        if branch.trim().is_empty() {
            return Err("Branch name is required.".to_string());
        }

        let parent_entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&parent_id)
                .cloned()
                .ok_or("parent workspace not found")?
        };

        if parent_entry.kind.is_worktree() {
            return Err("Cannot create a worktree from another worktree.".to_string());
        }

        let worktree_root = self.data_dir.join("worktrees").join(&parent_entry.id);
        std::fs::create_dir_all(&worktree_root)
            .map_err(|e| format!("Failed to create worktree directory: {e}"))?;

        let safe_name = sanitize_worktree_name(&branch);
        let worktree_path = unique_worktree_path(&worktree_root, &safe_name)?;
        let worktree_path_string = worktree_path.to_string_lossy().to_string();

        let repo_path = PathBuf::from(&parent_entry.path);
        let branch_exists = git_branch_exists(&repo_path, &branch).await?;
        if branch_exists {
            run_git_command(
                &repo_path,
                &["worktree", "add", &worktree_path_string, &branch],
            )
            .await?;
        } else if let Some(remote_ref) = git_find_remote_tracking_branch(&repo_path, &branch).await? {
            run_git_command(
                &repo_path,
                &["worktree", "add", "-b", &branch, &worktree_path_string, &remote_ref],
            )
            .await?;
        } else {
            run_git_command(
                &repo_path,
                &["worktree", "add", "-b", &branch, &worktree_path_string],
            )
            .await?;
        }

        let entry = WorkspaceEntry {
            id: Uuid::new_v4().to_string(),
            name: branch.to_string(),
            path: worktree_path_string,
            codex_bin: parent_entry.codex_bin.clone(),
            kind: WorkspaceKind::Worktree,
            parent_id: Some(parent_entry.id.clone()),
            worktree: Some(WorktreeInfo {
                branch: branch.to_string(),
            }),
            settings: WorkspaceSettings {
                worktree_setup_script: normalize_setup_script(
                    parent_entry.settings.worktree_setup_script.clone(),
                ),
                ..WorkspaceSettings::default()
            },
        };

        let (default_bin, codex_args) = {
            let settings = self.app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                codex_args::resolve_workspace_codex_args(
                    &entry,
                    Some(&parent_entry),
                    Some(&settings),
                ),
            )
        };

        let codex_home = codex_home::resolve_workspace_codex_home(&entry, Some(&parent_entry));
        let session = spawn_workspace_session(
            entry.clone(),
            default_bin,
            codex_args,
            codex_home,
            client_version,
            self.event_sink.clone(),
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

    async fn worktree_setup_status(&self, workspace_id: String) -> Result<WorktreeSetupStatus, String> {
        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&workspace_id)
                .cloned()
                .ok_or_else(|| "workspace not found".to_string())?
        };

        let script = normalize_setup_script(entry.settings.worktree_setup_script.clone());
        let marker_exists = if entry.kind.is_worktree() {
            worktree_setup_marker_path(&self.data_dir, &entry.id).exists()
        } else {
            false
        };
        let should_run = entry.kind.is_worktree() && script.is_some() && !marker_exists;

        Ok(WorktreeSetupStatus { should_run, script })
    }

    async fn worktree_setup_mark_ran(&self, workspace_id: String) -> Result<(), String> {
        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&workspace_id)
                .cloned()
                .ok_or_else(|| "workspace not found".to_string())?
        };
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let marker_path = worktree_setup_marker_path(&self.data_dir, &entry.id);
        if let Some(parent) = marker_path.parent() {
            std::fs::create_dir_all(parent)
                .map_err(|err| format!("Failed to prepare worktree marker directory: {err}"))?;
        }
        let ran_at = std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map(|duration| duration.as_secs())
            .unwrap_or(0);
        std::fs::write(&marker_path, format!("ran_at={ran_at}\n"))
            .map_err(|err| format!("Failed to write worktree setup marker: {err}"))?;
        Ok(())
    }

    async fn remove_workspace(&self, id: String) -> Result<(), String> {
        let (entry, child_worktrees) = {
            let workspaces = self.workspaces.lock().await;
            let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
            if entry.kind.is_worktree() {
                return Err("Use remove_worktree for worktree agents.".to_string());
            }
            let children = workspaces
                .values()
                .filter(|workspace| workspace.parent_id.as_deref() == Some(&id))
                .cloned()
                .collect::<Vec<_>>();
            (entry, children)
        };

        let repo_path = PathBuf::from(&entry.path);
        let mut removed_child_ids = Vec::new();
        let mut failures = Vec::new();

        for child in &child_worktrees {
            let child_path = PathBuf::from(&child.path);
            if child_path.exists() {
                if let Err(err) = run_git_command(
                    &repo_path,
                    &["worktree", "remove", "--force", &child.path],
                )
                .await
                {
                    if is_missing_worktree_error(&err) {
                        if let Err(fs_err) = std::fs::remove_dir_all(&child_path) {
                            failures.push((
                                child.id.clone(),
                                format!("Failed to remove worktree folder: {fs_err}"),
                            ));
                            continue;
                        }
                    } else {
                        failures.push((child.id.clone(), err));
                        continue;
                    }
                }
            }

            self.kill_session(&child.id).await;
            removed_child_ids.push(child.id.clone());
        }

        let _ = run_git_command(&repo_path, &["worktree", "prune", "--expire", "now"]).await;

        let mut ids_to_remove = removed_child_ids;
        if failures.is_empty() {
            self.kill_session(&id).await;
            ids_to_remove.push(id.clone());
        }

        if !ids_to_remove.is_empty() {
            let list = {
                let mut workspaces = self.workspaces.lock().await;
                for workspace_id in ids_to_remove {
                    workspaces.remove(&workspace_id);
                }
                workspaces.values().cloned().collect::<Vec<_>>()
            };
            write_workspaces(&self.storage_path, &list)?;
        }

        if failures.is_empty() {
            return Ok(());
        }

        let mut message =
            "Failed to remove one or more worktrees; parent workspace was not removed.".to_string();
        for (child_id, error) in failures {
            message.push_str(&format!("\n- {child_id}: {error}"));
        }
        Err(message)
    }

    async fn remove_worktree(&self, id: String) -> Result<(), String> {
        let (entry, parent) = {
            let workspaces = self.workspaces.lock().await;
            let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
            if !entry.kind.is_worktree() {
                return Err("Not a worktree workspace.".to_string());
            }
            let parent_id = entry.parent_id.clone().ok_or("worktree parent not found")?;
            let parent = workspaces
                .get(&parent_id)
                .cloned()
                .ok_or("worktree parent not found")?;
            (entry, parent)
        };

        let parent_path = PathBuf::from(&parent.path);
        let entry_path = PathBuf::from(&entry.path);
        if entry_path.exists() {
            if let Err(err) = run_git_command(
                &parent_path,
                &["worktree", "remove", "--force", &entry.path],
            )
            .await
            {
                if is_missing_worktree_error(&err) {
                    if entry_path.exists() {
                        std::fs::remove_dir_all(&entry_path).map_err(|fs_err| {
                            format!("Failed to remove worktree folder: {fs_err}")
                        })?;
                    }
                } else {
                    return Err(err);
                }
            }
        }
        let _ = run_git_command(&parent_path, &["worktree", "prune", "--expire", "now"]).await;

        self.kill_session(&entry.id).await;

        let list = {
            let mut workspaces = self.workspaces.lock().await;
            workspaces.remove(&entry.id);
            workspaces.values().cloned().collect::<Vec<_>>()
        };
        write_workspaces(&self.storage_path, &list)?;

        Ok(())
    }

    async fn rename_worktree(
        &self,
        id: String,
        branch: String,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let trimmed = branch.trim();
        if trimmed.is_empty() {
            return Err("Branch name is required.".to_string());
        }

        let (entry, parent) = {
            let workspaces = self.workspaces.lock().await;
            let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
            if !entry.kind.is_worktree() {
                return Err("Not a worktree workspace.".to_string());
            }
            let parent_id = entry.parent_id.clone().ok_or("worktree parent not found")?;
            let parent = workspaces
                .get(&parent_id)
                .cloned()
                .ok_or("worktree parent not found")?;
            (entry, parent)
        };

        let old_branch = entry
            .worktree
            .as_ref()
            .map(|worktree| worktree.branch.clone())
            .ok_or("worktree metadata missing")?;
        if old_branch == trimmed {
            return Err("Branch name is unchanged.".to_string());
        }

        let parent_root = PathBuf::from(&parent.path);

        let (final_branch, _was_suffixed) =
            unique_branch_name(&parent_root, trimmed, None).await?;
        if final_branch == old_branch {
            return Err("Branch name is unchanged.".to_string());
        }

        run_git_command(
            &parent_root,
            &["branch", "-m", &old_branch, &final_branch],
        )
        .await?;

        let worktree_root = self.data_dir.join("worktrees").join(&parent.id);
        std::fs::create_dir_all(&worktree_root)
            .map_err(|e| format!("Failed to create worktree directory: {e}"))?;

        let safe_name = sanitize_worktree_name(&final_branch);
        let current_path = PathBuf::from(&entry.path);
        let next_path =
            unique_worktree_path_for_rename(&worktree_root, &safe_name, &current_path)?;
        let next_path_string = next_path.to_string_lossy().to_string();
        if next_path_string != entry.path {
            if let Err(error) = run_git_command(
                &parent_root,
                &["worktree", "move", &entry.path, &next_path_string],
            )
            .await
            {
                let _ = run_git_command(
                    &parent_root,
                    &["branch", "-m", &final_branch, &old_branch],
                )
                .await;
                return Err(error);
            }
        }

        let (entry_snapshot, list) = {
            let mut workspaces = self.workspaces.lock().await;
            let entry = match workspaces.get_mut(&id) {
                Some(entry) => entry,
                None => return Err("workspace not found".to_string()),
            };
            entry.name = final_branch.clone();
            entry.path = next_path_string.clone();
            match entry.worktree.as_mut() {
                Some(worktree) => {
                    worktree.branch = final_branch.clone();
                }
                None => {
                    entry.worktree = Some(WorktreeInfo {
                        branch: final_branch.clone(),
                    });
                }
            }
            let snapshot = entry.clone();
            let list: Vec<_> = workspaces.values().cloned().collect();
            (snapshot, list)
        };
        write_workspaces(&self.storage_path, &list)?;

        let was_connected = self.sessions.lock().await.contains_key(&entry_snapshot.id);
        if was_connected {
            self.kill_session(&entry_snapshot.id).await;
            let (default_bin, codex_args) = {
                let settings = self.app_settings.lock().await;
                (
                    settings.codex_bin.clone(),
                    codex_args::resolve_workspace_codex_args(
                        &entry_snapshot,
                        Some(&parent),
                        Some(&settings),
                    ),
                )
            };
            let codex_home =
                codex_home::resolve_workspace_codex_home(&entry_snapshot, Some(&parent));
            match spawn_workspace_session(
                entry_snapshot.clone(),
                default_bin,
                codex_args,
                codex_home,
                client_version,
                self.event_sink.clone(),
            )
            .await
            {
                Ok(session) => {
                    self.sessions
                        .lock()
                        .await
                        .insert(entry_snapshot.id.clone(), session);
                }
                Err(error) => {
                    eprintln!(
                        "rename_worktree: respawn failed for {} after rename: {error}",
                        entry_snapshot.id
                    );
                }
            }
        }

        let connected = self.sessions.lock().await.contains_key(&entry_snapshot.id);
        Ok(WorkspaceInfo {
            id: entry_snapshot.id,
            name: entry_snapshot.name,
            path: entry_snapshot.path,
            connected,
            codex_bin: entry_snapshot.codex_bin,
            kind: entry_snapshot.kind,
            parent_id: entry_snapshot.parent_id,
            worktree: entry_snapshot.worktree,
            settings: entry_snapshot.settings,
        })
    }

    async fn rename_worktree_upstream(
        &self,
        id: String,
        old_branch: String,
        new_branch: String,
    ) -> Result<(), String> {
        let old_branch = old_branch.trim();
        let new_branch = new_branch.trim();
        if old_branch.is_empty() || new_branch.is_empty() {
            return Err("Branch name is required.".to_string());
        }
        if old_branch == new_branch {
            return Err("Branch name is unchanged.".to_string());
        }

        let (_entry, parent) = {
            let workspaces = self.workspaces.lock().await;
            let entry = workspaces.get(&id).cloned().ok_or("workspace not found")?;
            if !entry.kind.is_worktree() {
                return Err("Not a worktree workspace.".to_string());
            }
            let parent_id = entry.parent_id.clone().ok_or("worktree parent not found")?;
            let parent = workspaces
                .get(&parent_id)
                .cloned()
                .ok_or("worktree parent not found")?;
            (entry, parent)
        };

        let parent_root = PathBuf::from(&parent.path);
        if !git_branch_exists(&parent_root, new_branch).await? {
            return Err("Local branch not found.".to_string());
        }

        let remote_for_old = git_find_remote_for_branch(&parent_root, old_branch).await?;
        let remote_name = match remote_for_old.as_ref() {
            Some(remote) => remote.clone(),
            None => {
                if git_remote_exists(&parent_root, "origin").await? {
                    "origin".to_string()
                } else {
                    return Err("No git remote configured for this worktree.".to_string());
                }
            }
        };

        if git_remote_branch_exists_live(&parent_root, &remote_name, new_branch).await? {
            return Err("Remote branch already exists.".to_string());
        }

        if remote_for_old.is_some() {
            run_git_command(
                &parent_root,
                &[
                    "push",
                    &remote_name,
                    &format!("{new_branch}:{new_branch}"),
                ],
            )
            .await?;
            run_git_command(
                &parent_root,
                &["push", &remote_name, &format!(":{old_branch}")],
            )
            .await?;
        } else {
            run_git_command(&parent_root, &["push", &remote_name, new_branch]).await?;
        }

        run_git_command(
            &parent_root,
            &[
                "branch",
                "--set-upstream-to",
                &format!("{remote_name}/{new_branch}"),
                new_branch,
            ],
        )
        .await?;

        Ok(())
    }

    async fn update_workspace_settings(
        &self,
        id: String,
        settings: WorkspaceSettings,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let mut settings = settings;
        settings.worktree_setup_script = normalize_setup_script(settings.worktree_setup_script);

        let (
            previous_entry,
            entry_snapshot,
            parent_entry,
            previous_codex_home,
            previous_codex_args,
            previous_worktree_setup_script,
            child_entries,
        ) = {
            let mut workspaces = self.workspaces.lock().await;
            let previous_entry = workspaces
                .get(&id)
                .cloned()
                .ok_or_else(|| "workspace not found".to_string())?;
            let previous_codex_home = previous_entry.settings.codex_home.clone();
            let previous_codex_args = previous_entry.settings.codex_args.clone();
            let previous_worktree_setup_script = previous_entry.settings.worktree_setup_script.clone();
            let entry_snapshot = match workspaces.get_mut(&id) {
                Some(entry) => {
                    entry.settings = settings.clone();
                    entry.clone()
                }
                None => return Err("workspace not found".to_string()),
            };
            let parent_entry = entry_snapshot
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned();
            let child_entries = workspaces
                .values()
                .filter(|entry| entry.parent_id.as_deref() == Some(&id))
                .cloned()
                .collect::<Vec<_>>();
            (
                previous_entry,
                entry_snapshot,
                parent_entry,
                previous_codex_home,
                previous_codex_args,
                previous_worktree_setup_script,
                child_entries,
            )
        };

        let codex_home_changed = previous_codex_home != entry_snapshot.settings.codex_home;
        let codex_args_changed = previous_codex_args != entry_snapshot.settings.codex_args;
        let worktree_setup_script_changed =
            previous_worktree_setup_script != entry_snapshot.settings.worktree_setup_script;
        let connected = self.sessions.lock().await.contains_key(&id);
        if connected && (codex_home_changed || codex_args_changed) {
            let rollback_entry = previous_entry.clone();
            let (default_bin, codex_args) = {
                let settings = self.app_settings.lock().await;
                (
                    settings.codex_bin.clone(),
                    codex_args::resolve_workspace_codex_args(
                        &entry_snapshot,
                        parent_entry.as_ref(),
                        Some(&settings),
                    ),
                )
            };
            let codex_home =
                codex_home::resolve_workspace_codex_home(&entry_snapshot, parent_entry.as_ref());
            let new_session = match spawn_workspace_session(
                entry_snapshot.clone(),
                default_bin,
                codex_args,
                codex_home,
                client_version.clone(),
                self.event_sink.clone(),
            )
            .await
            {
                Ok(session) => session,
                Err(error) => {
                    let mut workspaces = self.workspaces.lock().await;
                    workspaces.insert(rollback_entry.id.clone(), rollback_entry);
                    return Err(error);
                }
            };
            if let Some(old_session) = self
                .sessions
                .lock()
                .await
                .insert(entry_snapshot.id.clone(), new_session)
            {
                let mut child = old_session.child.lock().await;
                let _ = child.kill().await;
            }
        }
        if codex_home_changed || codex_args_changed {
            let app_settings = self.app_settings.lock().await.clone();
            let default_bin = app_settings.codex_bin.clone();
            for child in &child_entries {
                let connected = self.sessions.lock().await.contains_key(&child.id);
                if !connected {
                    continue;
                }
                let previous_child_home =
                    codex_home::resolve_workspace_codex_home(&child, Some(&previous_entry));
                let next_child_home =
                    codex_home::resolve_workspace_codex_home(&child, Some(&entry_snapshot));
                let previous_child_args = codex_args::resolve_workspace_codex_args(
                    &child,
                    Some(&previous_entry),
                    Some(&app_settings),
                );
                let next_child_args = codex_args::resolve_workspace_codex_args(
                    &child,
                    Some(&entry_snapshot),
                    Some(&app_settings),
                );
                if previous_child_home == next_child_home
                    && previous_child_args == next_child_args
                {
                    continue;
                }
                let new_session = match spawn_workspace_session(
                    child.clone(),
                    default_bin.clone(),
                    next_child_args,
                    next_child_home,
                    client_version.clone(),
                    self.event_sink.clone(),
                )
                .await
                {
                    Ok(session) => session,
                    Err(error) => {
                        eprintln!(
                            "update_workspace_settings: respawn failed for worktree {} after parent override change: {error}",
                            child.id
                        );
                        continue;
                    }
                };
                if let Some(old_session) = self
                    .sessions
                    .lock()
                    .await
                    .insert(child.id.clone(), new_session)
                {
                    let mut child = old_session.child.lock().await;
                    let _ = child.kill().await;
                }
            }
        }
        if worktree_setup_script_changed && !entry_snapshot.kind.is_worktree() {
            let child_ids = child_entries
                .iter()
                .map(|child| child.id.clone())
                .collect::<Vec<_>>();
            if !child_ids.is_empty() {
                let mut workspaces = self.workspaces.lock().await;
                for child_id in child_ids {
                    if let Some(child) = workspaces.get_mut(&child_id) {
                        child.settings.worktree_setup_script =
                            entry_snapshot.settings.worktree_setup_script.clone();
                    }
                }
            }
        }

        let list: Vec<_> = {
            let workspaces = self.workspaces.lock().await;
            workspaces.values().cloned().collect()
        };
        write_workspaces(&self.storage_path, &list)?;

        Ok(WorkspaceInfo {
            id: entry_snapshot.id,
            name: entry_snapshot.name,
            path: entry_snapshot.path,
            connected: self.sessions.lock().await.contains_key(&id),
            codex_bin: entry_snapshot.codex_bin,
            kind: entry_snapshot.kind,
            parent_id: entry_snapshot.parent_id,
            worktree: entry_snapshot.worktree,
            settings: entry_snapshot.settings,
        })
    }

    async fn update_workspace_codex_bin(
        &self,
        id: String,
        codex_bin: Option<String>,
    ) -> Result<WorkspaceInfo, String> {
        let (entry_snapshot, list) = {
            let mut workspaces = self.workspaces.lock().await;
            let entry_snapshot = match workspaces.get_mut(&id) {
                Some(entry) => {
                    entry.codex_bin = codex_bin.clone();
                    entry.clone()
                }
                None => return Err("workspace not found".to_string()),
            };
            let list: Vec<_> = workspaces.values().cloned().collect();
            (entry_snapshot, list)
        };
        write_workspaces(&self.storage_path, &list)?;

        let connected = self.sessions.lock().await.contains_key(&id);
        Ok(WorkspaceInfo {
            id: entry_snapshot.id,
            name: entry_snapshot.name,
            path: entry_snapshot.path,
            connected,
            codex_bin: entry_snapshot.codex_bin,
            kind: entry_snapshot.kind,
            parent_id: entry_snapshot.parent_id,
            worktree: entry_snapshot.worktree,
            settings: entry_snapshot.settings,
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

        let parent_entry = if entry.kind.is_worktree() {
            let workspaces = self.workspaces.lock().await;
            entry
                .parent_id
                .as_deref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned()
        } else {
            None
        };
        let (default_bin, codex_args) = {
            let settings = self.app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                codex_args::resolve_workspace_codex_args(
                    &entry,
                    parent_entry.as_ref(),
                    Some(&settings),
                ),
            )
        };
        let codex_home = codex_home::resolve_workspace_codex_home(&entry, parent_entry.as_ref());
        let session = spawn_workspace_session(
            entry,
            default_bin,
            codex_args,
            codex_home,
            client_version,
            self.event_sink.clone(),
        )
        .await?;

        self.sessions.lock().await.insert(id, session);
        Ok(())
    }

    async fn update_app_settings(&self, settings: AppSettings) -> Result<AppSettings, String> {
        let _ = codex_config::write_collab_enabled(settings.experimental_collab_enabled);
        let _ = codex_config::write_collaboration_modes_enabled(
            settings.experimental_collaboration_modes_enabled,
        );
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

    async fn read_workspace_file(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<WorkspaceFileResponse, String> {
        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&workspace_id)
                .cloned()
                .ok_or("workspace not found")?
        };

        let root = PathBuf::from(entry.path);
        read_workspace_file_inner(&root, &path)
    }

    async fn read_agent_md(&self, workspace_id: String) -> Result<AgentMdResponse, String> {
        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&workspace_id)
                .cloned()
                .ok_or("workspace not found")?
        };

        let root = PathBuf::from(entry.path);
        read_agent_md_inner(&root)
    }

    async fn write_agent_md(&self, workspace_id: String, content: String) -> Result<(), String> {
        let entry = {
            let workspaces = self.workspaces.lock().await;
            workspaces
                .get(&workspace_id)
                .cloned()
                .ok_or("workspace not found")?
        };

        let root = PathBuf::from(entry.path);
        write_agent_md_inner(&root, &content)
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
        collaboration_mode: Option<Value>,
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
            "collaborationMode": collaboration_mode,
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

    async fn collaboration_mode_list(&self, workspace_id: String) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        session
            .send_request("collaborationMode/list", json!({}))
            .await
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
        request_id: Value,
        result: Value,
    ) -> Result<Value, String> {
        let session = self.get_session(&workspace_id).await?;
        session.send_response(request_id, result).await?;
        Ok(json!({ "ok": true }))
    }

    async fn remember_approval_rule(
        &self,
        workspace_id: String,
        command: Vec<String>,
    ) -> Result<Value, String> {
        let command = command
            .into_iter()
            .map(|item| item.trim().to_string())
            .filter(|item| !item.is_empty())
            .collect::<Vec<_>>();
        if command.is_empty() {
            return Err("empty command".to_string());
        }

        let codex_home = self.resolve_codex_home_for_workspace(&workspace_id).await?;
        let rules_path = rules::default_rules_path(&codex_home);
        rules::append_prefix_rule(&rules_path, &command)?;

        Ok(json!({
            "ok": true,
            "rulesPath": rules_path,
        }))
    }

    async fn get_config_model(&self, workspace_id: String) -> Result<Value, String> {
        let codex_home = self.resolve_codex_home_for_workspace(&workspace_id).await?;
        let model = codex_config::read_config_model(Some(codex_home))?;
        Ok(json!({ "model": model }))
    }

    async fn resolve_codex_home_for_workspace(&self, workspace_id: &str) -> Result<PathBuf, String> {
        let (entry, parent_entry) = {
            let workspaces = self.workspaces.lock().await;
            let entry = workspaces
                .get(workspace_id)
                .ok_or("workspace not found")?
                .clone();
            let parent_entry = entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .cloned();
            (entry, parent_entry)
        };

        codex_home::resolve_workspace_codex_home(&entry, parent_entry.as_ref())
            .or_else(codex_home::resolve_default_codex_home)
            .ok_or("Unable to resolve CODEX_HOME".to_string())
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

const MAX_WORKSPACE_FILE_BYTES: u64 = 400_000;

fn read_workspace_file_inner(
    root: &PathBuf,
    relative_path: &str,
) -> Result<WorkspaceFileResponse, String> {
    let canonical_root = root
        .canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))?;
    let candidate = canonical_root.join(relative_path);
    let canonical_path = candidate
        .canonicalize()
        .map_err(|err| format!("Failed to open file: {err}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }
    let metadata = std::fs::metadata(&canonical_path)
        .map_err(|err| format!("Failed to read file metadata: {err}"))?;
    if !metadata.is_file() {
        return Err("Path is not a file".to_string());
    }

    let file = File::open(&canonical_path).map_err(|err| format!("Failed to open file: {err}"))?;
    let mut buffer = Vec::new();
    file.take(MAX_WORKSPACE_FILE_BYTES + 1)
        .read_to_end(&mut buffer)
        .map_err(|err| format!("Failed to read file: {err}"))?;

    let truncated = buffer.len() > MAX_WORKSPACE_FILE_BYTES as usize;
    if truncated {
        buffer.truncate(MAX_WORKSPACE_FILE_BYTES as usize);
    }

    let content =
        String::from_utf8(buffer).map_err(|_| "File is not valid UTF-8".to_string())?;
    Ok(WorkspaceFileResponse { content, truncated })
}

const AGENT_MD_FILENAME: &str = "AGENTS.md";

fn canonical_root(root: &PathBuf) -> Result<PathBuf, String> {
    root.canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))
}

fn read_agent_md_inner(root: &PathBuf) -> Result<AgentMdResponse, String> {
    let canonical_root = canonical_root(root)?;
    let agent_path = canonical_root.join(AGENT_MD_FILENAME);

    if !agent_path.exists() {
        return Ok(AgentMdResponse {
            exists: false,
            content: String::new(),
            truncated: false,
        });
    }

    let canonical_path = agent_path
        .canonicalize()
        .map_err(|err| format!("Failed to open file: {err}"))?;
    if !canonical_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }

    let mut file =
        File::open(&canonical_path).map_err(|err| format!("Failed to open file: {err}"))?;
    let mut buffer = Vec::new();
    file.read_to_end(&mut buffer)
        .map_err(|err| format!("Failed to read file: {err}"))?;

    let content =
        String::from_utf8(buffer).map_err(|_| "File is not valid UTF-8".to_string())?;
    Ok(AgentMdResponse {
        exists: true,
        content,
        truncated: false,
    })
}

fn write_agent_md_inner(root: &PathBuf, content: &str) -> Result<(), String> {
    let canonical_root = canonical_root(root)?;
    let agent_path = canonical_root.join(AGENT_MD_FILENAME);
    if !agent_path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }
    let target_path = if agent_path.exists() {
        let canonical_path = agent_path
            .canonicalize()
            .map_err(|err| format!("Failed to resolve AGENTS.md: {err}"))?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err("Invalid file path".to_string());
        }
        canonical_path
    } else {
        agent_path
    };
    std::fs::write(&target_path, content)
        .map_err(|err| format!("Failed to write AGENTS.md: {err}"))
}

async fn run_git_command(repo_path: &PathBuf, args: &[&str]) -> Result<String, String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = Command::new(git_bin)
        .args(args)
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(String::from_utf8_lossy(&output.stdout).trim().to_string())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            Err("Git command failed.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

fn is_missing_worktree_error(error: &str) -> bool {
    error.contains("is not a working tree")
}

async fn git_branch_exists(repo_path: &PathBuf, branch: &str) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let status = Command::new(git_bin)
        .args(["show-ref", "--verify", &format!("refs/heads/{branch}")])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .status()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    Ok(status.success())
}

async fn git_remote_exists(repo_path: &PathBuf, remote: &str) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let status = Command::new(git_bin)
        .args(["remote", "get-url", remote])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .status()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    Ok(status.success())
}

async fn git_remote_branch_exists_live(
    repo_path: &PathBuf,
    remote: &str,
    branch: &str,
) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let output = Command::new(git_bin)
        .args([
            "ls-remote",
            "--heads",
            remote,
            &format!("refs/heads/{branch}"),
        ])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    if output.status.success() {
        Ok(!String::from_utf8_lossy(&output.stdout).trim().is_empty())
    } else {
        let stderr = String::from_utf8_lossy(&output.stderr);
        let stdout = String::from_utf8_lossy(&output.stdout);
        let detail = if stderr.trim().is_empty() {
            stdout.trim()
        } else {
            stderr.trim()
        };
        if detail.is_empty() {
            Err("Git command failed.".to_string())
        } else {
            Err(detail.to_string())
        }
    }
}

async fn git_remote_branch_exists(repo_path: &PathBuf, remote: &str, branch: &str) -> Result<bool, String> {
    let git_bin = resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let status = Command::new(git_bin)
        .args([
            "show-ref",
            "--verify",
            &format!("refs/remotes/{remote}/{branch}"),
        ])
        .current_dir(repo_path)
        .env("PATH", git_env_path())
        .status()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;
    Ok(status.success())
}

async fn unique_branch_name(
    repo_path: &PathBuf,
    desired: &str,
    remote: Option<&str>,
) -> Result<(String, bool), String> {
    let mut candidate = desired.to_string();
    if desired.is_empty() {
        return Ok((candidate, false));
    }
    if !git_branch_exists(repo_path, &candidate).await?
        && match remote {
            Some(remote) => !git_remote_branch_exists_live(repo_path, remote, &candidate).await?,
            None => true,
        }
    {
        return Ok((candidate, false));
    }
    for index in 2..1000 {
        candidate = format!("{desired}-{index}");
        let local_exists = git_branch_exists(repo_path, &candidate).await?;
        let remote_exists = match remote {
            Some(remote) => git_remote_branch_exists_live(repo_path, remote, &candidate).await?,
            None => false,
        };
        if !local_exists && !remote_exists {
            return Ok((candidate, true));
        }
    }
    Err("Unable to find an available branch name.".to_string())
}

async fn git_list_remotes(repo_path: &PathBuf) -> Result<Vec<String>, String> {
    let output = run_git_command(repo_path, &["remote"]).await?;
    Ok(output
        .lines()
        .map(|line| line.trim())
        .filter(|line| !line.is_empty())
        .map(|line| line.to_string())
        .collect())
}

async fn git_find_remote_for_branch(
    repo_path: &PathBuf,
    branch: &str,
) -> Result<Option<String>, String> {
    if git_remote_exists(repo_path, "origin").await?
        && git_remote_branch_exists_live(repo_path, "origin", branch).await?
    {
        return Ok(Some("origin".to_string()));
    }

    for remote in git_list_remotes(repo_path).await? {
        if remote == "origin" {
            continue;
        }
        if git_remote_branch_exists_live(repo_path, &remote, branch).await? {
            return Ok(Some(remote));
        }
    }

    Ok(None)
}

async fn git_find_remote_tracking_branch(repo_path: &PathBuf, branch: &str) -> Result<Option<String>, String> {
    if git_remote_branch_exists(repo_path, "origin", branch).await? {
        return Ok(Some(format!("origin/{branch}")));
    }

    for remote in git_list_remotes(repo_path).await? {
        if remote == "origin" {
            continue;
        }
        if git_remote_branch_exists(repo_path, &remote, branch).await? {
            return Ok(Some(format!("{remote}/{branch}")));
        }
    }

    Ok(None)
}

fn sanitize_worktree_name(branch: &str) -> String {
    let mut result = String::new();
    for ch in branch.chars() {
        if ch.is_ascii_alphanumeric() || matches!(ch, '-' | '_' | '.') {
            result.push(ch);
        } else {
            result.push('-');
        }
    }
    let trimmed = result.trim_matches('-').to_string();
    if trimmed.is_empty() {
        "worktree".to_string()
    } else {
        trimmed
    }
}

fn unique_worktree_path(base_dir: &PathBuf, name: &str) -> Result<PathBuf, String> {
    let candidate = base_dir.join(name);
    if !candidate.exists() {
        return Ok(candidate);
    }

    for index in 2..1000 {
        let next = base_dir.join(format!("{name}-{index}"));
        if !next.exists() {
            return Ok(next);
        }
    }

    Err(format!(
        "Failed to find an available worktree path under {}.",
        base_dir.display()
    ))
}

fn unique_worktree_path_for_rename(
    base_dir: &PathBuf,
    name: &str,
    current_path: &PathBuf,
) -> Result<PathBuf, String> {
    let candidate = base_dir.join(name);
    if candidate == *current_path {
        return Ok(candidate);
    }
    if !candidate.exists() {
        return Ok(candidate);
    }
    for index in 2..1000 {
        let next = base_dir.join(format!("{name}-{index}"));
        if next == *current_path || !next.exists() {
            return Ok(next);
        }
    }
    Err(format!(
        "Failed to find an available worktree path under {}.",
        base_dir.display()
    ))
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

fn parse_string_array(value: &Value, key: &str) -> Result<Vec<String>, String> {
    parse_optional_string_array(value, key).ok_or_else(|| format!("missing `{key}`"))
}

fn parse_optional_value(value: &Value, key: &str) -> Option<Value> {
    match value {
        Value::Object(map) => map.get(key).cloned(),
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
        "is_workspace_path_dir" => {
            let path = parse_string(&params, "path")?;
            let is_dir = state.is_workspace_path_dir(path).await;
            serde_json::to_value(is_dir).map_err(|err| err.to_string())
        }
        "add_workspace" => {
            let path = parse_string(&params, "path")?;
            let codex_bin = parse_optional_string(&params, "codex_bin");
            let workspace = state.add_workspace(path, codex_bin, client_version).await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "add_worktree" => {
            let parent_id = parse_string(&params, "parentId")?;
            let branch = parse_string(&params, "branch")?;
            let workspace = state
                .add_worktree(parent_id, branch, client_version)
                .await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "worktree_setup_status" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let status = state.worktree_setup_status(workspace_id).await?;
            serde_json::to_value(status).map_err(|err| err.to_string())
        }
        "worktree_setup_mark_ran" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.worktree_setup_mark_ran(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "connect_workspace" => {
            let id = parse_string(&params, "id")?;
            state.connect_workspace(id, client_version).await?;
            Ok(json!({ "ok": true }))
        }
        "remove_workspace" => {
            let id = parse_string(&params, "id")?;
            state.remove_workspace(id).await?;
            Ok(json!({ "ok": true }))
        }
        "remove_worktree" => {
            let id = parse_string(&params, "id")?;
            state.remove_worktree(id).await?;
            Ok(json!({ "ok": true }))
        }
        "rename_worktree" => {
            let id = parse_string(&params, "id")?;
            let branch = parse_string(&params, "branch")?;
            let workspace = state.rename_worktree(id, branch, client_version).await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "rename_worktree_upstream" => {
            let id = parse_string(&params, "id")?;
            let old_branch = parse_string(&params, "oldBranch")?;
            let new_branch = parse_string(&params, "newBranch")?;
            state
                .rename_worktree_upstream(id, old_branch, new_branch)
                .await?;
            Ok(json!({ "ok": true }))
        }
        "update_workspace_settings" => {
            let id = parse_string(&params, "id")?;
            let settings_value = match params {
                Value::Object(map) => map.get("settings").cloned().unwrap_or(Value::Null),
                _ => Value::Null,
            };
            let settings: WorkspaceSettings =
                serde_json::from_value(settings_value).map_err(|err| err.to_string())?;
            let workspace = state
                .update_workspace_settings(id, settings, client_version)
                .await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "update_workspace_codex_bin" => {
            let id = parse_string(&params, "id")?;
            let codex_bin = parse_optional_string(&params, "codex_bin");
            let workspace = state.update_workspace_codex_bin(id, codex_bin).await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "list_workspace_files" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let files = state.list_workspace_files(workspace_id).await?;
            serde_json::to_value(files).map_err(|err| err.to_string())
        }
        "read_workspace_file" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            let response = state.read_workspace_file(workspace_id, path).await?;
            serde_json::to_value(response).map_err(|err| err.to_string())
        }
        "read_agent_md" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let response = state.read_agent_md(workspace_id).await?;
            serde_json::to_value(response).map_err(|err| err.to_string())
        }
        "write_agent_md" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let content = parse_string(&params, "content")?;
            state.write_agent_md(workspace_id, content).await?;
            serde_json::to_value(json!({ "ok": true })).map_err(|err| err.to_string())
        }
        "get_app_settings" => {
            let mut settings = state.app_settings.lock().await.clone();
            if let Ok(Some(collab_enabled)) = codex_config::read_collab_enabled() {
                settings.experimental_collab_enabled = collab_enabled;
            }
            if let Ok(Some(collaboration_modes_enabled)) =
                codex_config::read_collaboration_modes_enabled()
            {
                settings.experimental_collaboration_modes_enabled = collaboration_modes_enabled;
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
        "get_codex_config_path" => {
            let path = codex_config::config_toml_path()
                .ok_or("Unable to resolve CODEX_HOME".to_string())?;
            let path = path
                .to_str()
                .ok_or("Unable to resolve CODEX_HOME".to_string())?;
            Ok(Value::String(path.to_string()))
        }
        "get_config_model" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.get_config_model(workspace_id).await
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
            let collaboration_mode = parse_optional_value(&params, "collaborationMode");
            state
                .send_user_message(
                    workspace_id,
                    thread_id,
                    text,
                    model,
                    effort,
                    access_mode,
                    images,
                    collaboration_mode,
                )
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
        "collaboration_mode_list" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.collaboration_mode_list(workspace_id).await
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
                .cloned()
                .filter(|value| value.is_number() || value.is_string())
                .ok_or("missing requestId")?;
            let result = map.get("result").cloned().ok_or("missing `result`")?;
            state
                .respond_to_server_request(workspace_id, request_id, result)
                .await
        }
        "remember_approval_rule" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let command = parse_string_array(&params, "command")?;
            state.remember_approval_rule(workspace_id, command).await
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
