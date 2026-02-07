#[allow(dead_code)]
#[path = "../backend/mod.rs"]
mod backend;
#[path = "../codex/args.rs"]
mod codex_args;
#[path = "../codex/config.rs"]
mod codex_config;
#[path = "../codex/home.rs"]
mod codex_home;
#[path = "../files/io.rs"]
mod file_io;
#[path = "../files/ops.rs"]
mod file_ops;
#[path = "../files/policy.rs"]
mod file_policy;
#[path = "../git_utils.rs"]
mod git_utils;
#[path = "../rules.rs"]
mod rules;
#[path = "../shared/mod.rs"]
mod shared;
#[path = "../storage.rs"]
mod storage;
#[allow(dead_code)]
#[path = "../types.rs"]
mod types;
#[path = "../utils.rs"]
mod utils;
#[path = "../workspaces/macos.rs"]
mod workspace_macos;
#[path = "../workspaces/settings.rs"]
mod workspace_settings;

// Provide feature-style module paths for shared cores when compiled in the daemon.
mod codex {
    pub(crate) mod args {
        pub(crate) use crate::codex_args::*;
    }
    pub(crate) mod config {
        pub(crate) use crate::codex_config::*;
    }
    pub(crate) mod home {
        pub(crate) use crate::codex_home::*;
    }
}

mod files {
    pub(crate) mod io {
        pub(crate) use crate::file_io::*;
    }
    pub(crate) mod ops {
        pub(crate) use crate::file_ops::*;
    }
    pub(crate) mod policy {
        pub(crate) use crate::file_policy::*;
    }
}

use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::env;
use std::fs::File;
use std::io::Read;
use std::net::SocketAddr;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use futures_util::{SinkExt, StreamExt};
use ignore::WalkBuilder;
use tokio::io::{AsyncBufReadExt, AsyncWriteExt, BufReader};
use tokio::net::{TcpListener, TcpStream};
use tokio::sync::{broadcast, mpsc, Mutex};
use tokio::time::sleep;
use tokio_tungstenite::connect_async;
use tokio_tungstenite::tungstenite::Message;

use backend::app_server::{spawn_workspace_session, WorkspaceSession};
use backend::events::{AppServerEvent, EventSink, TerminalExit, TerminalOutput};
use shared::codex_core::CodexLoginCancelState;
use shared::prompts_core::{self, CustomPromptEntry};
use shared::{
    codex_aux_core, codex_core, files_core, git_core, git_ui_core, local_usage_core, settings_core,
    workspaces_core, worktree_core,
};
use storage::{read_settings, read_workspaces};
use types::{
    AppSettings, GitCommitDiff, GitFileDiff, GitHubIssuesResponse, GitHubPullRequestComment,
    GitHubPullRequestDiff, GitHubPullRequestsResponse, GitLogResponse, LocalUsageSnapshot,
    OrbitConnectTestResult, OrbitDeviceCodeStart, OrbitSignInPollResult, OrbitSignInStatus,
    OrbitSignOutResult, WorkspaceEntry, WorkspaceInfo, WorkspaceSettings, WorktreeSetupStatus,
};
use workspace_settings::apply_workspace_settings_update;

const DEFAULT_LISTEN_ADDR: &str = "127.0.0.1:4732";

fn spawn_with_client(
    event_sink: DaemonEventSink,
    client_version: String,
    entry: WorkspaceEntry,
    default_bin: Option<String>,
    codex_args: Option<String>,
    codex_home: Option<PathBuf>,
) -> impl std::future::Future<Output = Result<Arc<WorkspaceSession>, String>> {
    spawn_workspace_session(
        entry,
        default_bin,
        codex_args,
        codex_home,
        client_version,
        event_sink,
    )
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
    #[allow(dead_code)]
    TerminalExit(TerminalExit),
}

impl EventSink for DaemonEventSink {
    fn emit_app_server_event(&self, event: AppServerEvent) {
        let _ = self.tx.send(DaemonEvent::AppServer(event));
    }

    fn emit_terminal_output(&self, event: TerminalOutput) {
        let _ = self.tx.send(DaemonEvent::TerminalOutput(event));
    }

    fn emit_terminal_exit(&self, event: TerminalExit) {
        let _ = self.tx.send(DaemonEvent::TerminalExit(event));
    }
}

struct DaemonConfig {
    listen: SocketAddr,
    token: Option<String>,
    data_dir: PathBuf,
    orbit_url: Option<String>,
    orbit_token: Option<String>,
    orbit_auth_url: Option<String>,
    orbit_runner_name: Option<String>,
}

struct DaemonState {
    data_dir: PathBuf,
    workspaces: Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: PathBuf,
    settings_path: PathBuf,
    app_settings: Mutex<AppSettings>,
    event_sink: DaemonEventSink,
    codex_login_cancels: Mutex<HashMap<String, CodexLoginCancelState>>,
}

#[derive(Serialize, Deserialize)]
struct WorkspaceFileResponse {
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
            codex_login_cancels: Mutex::new(HashMap::new()),
        }
    }

    async fn list_workspaces(&self) -> Vec<WorkspaceInfo> {
        workspaces_core::list_workspaces_core(&self.workspaces, &self.sessions).await
    }

    async fn is_workspace_path_dir(&self, path: String) -> bool {
        workspaces_core::is_workspace_path_dir_core(&path)
    }

    async fn add_workspace(
        &self,
        path: String,
        codex_bin: Option<String>,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let client_version = client_version.clone();
        workspaces_core::add_workspace_core(
            path,
            codex_bin,
            &self.workspaces,
            &self.sessions,
            &self.app_settings,
            &self.storage_path,
            move |entry, default_bin, codex_args, codex_home| {
                spawn_with_client(
                    self.event_sink.clone(),
                    client_version.clone(),
                    entry,
                    default_bin,
                    codex_args,
                    codex_home,
                )
            },
        )
        .await
    }

    async fn add_worktree(
        &self,
        parent_id: String,
        branch: String,
        name: Option<String>,
        copy_agents_md: bool,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let client_version = client_version.clone();
        workspaces_core::add_worktree_core(
            parent_id,
            branch,
            name,
            copy_agents_md,
            &self.data_dir,
            &self.workspaces,
            &self.sessions,
            &self.app_settings,
            &self.storage_path,
            |value| worktree_core::sanitize_worktree_name(value),
            |root, name| worktree_core::unique_worktree_path_strict(root, name),
            |root, branch_name| {
                let root = root.clone();
                let branch_name = branch_name.to_string();
                async move { git_core::git_branch_exists(&root, &branch_name).await }
            },
            Some(|root: &PathBuf, branch_name: &str| {
                let root = root.clone();
                let branch_name = branch_name.to_string();
                async move { git_core::git_find_remote_tracking_branch_local(&root, &branch_name).await }
            }),
            |root, args| {
                workspaces_core::run_git_command_unit(root, args, git_core::run_git_command_owned)
            },
            move |entry, default_bin, codex_args, codex_home| {
                spawn_with_client(
                    self.event_sink.clone(),
                    client_version.clone(),
                    entry,
                    default_bin,
                    codex_args,
                    codex_home,
                )
            },
        )
        .await
    }

    async fn worktree_setup_status(
        &self,
        workspace_id: String,
    ) -> Result<WorktreeSetupStatus, String> {
        workspaces_core::worktree_setup_status_core(&self.workspaces, &workspace_id, &self.data_dir)
            .await
    }

    async fn worktree_setup_mark_ran(&self, workspace_id: String) -> Result<(), String> {
        workspaces_core::worktree_setup_mark_ran_core(
            &self.workspaces,
            &workspace_id,
            &self.data_dir,
        )
        .await
    }

    async fn remove_workspace(&self, id: String) -> Result<(), String> {
        workspaces_core::remove_workspace_core(
            id,
            &self.workspaces,
            &self.sessions,
            &self.storage_path,
            |root, args| {
                workspaces_core::run_git_command_unit(root, args, git_core::run_git_command_owned)
            },
            |error| git_core::is_missing_worktree_error(error),
            |path| {
                std::fs::remove_dir_all(path)
                    .map_err(|err| format!("Failed to remove worktree folder: {err}"))
            },
            true,
            true,
        )
        .await
    }

    async fn remove_worktree(&self, id: String) -> Result<(), String> {
        workspaces_core::remove_worktree_core(
            id,
            &self.workspaces,
            &self.sessions,
            &self.storage_path,
            |root, args| {
                workspaces_core::run_git_command_unit(root, args, git_core::run_git_command_owned)
            },
            |error| git_core::is_missing_worktree_error(error),
            |path| {
                std::fs::remove_dir_all(path)
                    .map_err(|err| format!("Failed to remove worktree folder: {err}"))
            },
        )
        .await
    }

    async fn rename_worktree(
        &self,
        id: String,
        branch: String,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let client_version = client_version.clone();
        workspaces_core::rename_worktree_core(
            id,
            branch,
            &self.data_dir,
            &self.workspaces,
            &self.sessions,
            &self.app_settings,
            &self.storage_path,
            |entry| Ok(PathBuf::from(entry.path.clone())),
            |root, name| {
                let root = root.clone();
                let name = name.to_string();
                async move {
                    git_core::unique_branch_name_live(&root, &name, None)
                        .await
                        .map(|(branch_name, _was_suffixed)| branch_name)
                }
            },
            |value| worktree_core::sanitize_worktree_name(value),
            |root, name, current| {
                worktree_core::unique_worktree_path_for_rename(root, name, current)
            },
            |root, args| {
                workspaces_core::run_git_command_unit(root, args, git_core::run_git_command_owned)
            },
            move |entry, default_bin, codex_args, codex_home| {
                spawn_with_client(
                    self.event_sink.clone(),
                    client_version.clone(),
                    entry,
                    default_bin,
                    codex_args,
                    codex_home,
                )
            },
        )
        .await
    }

    async fn rename_worktree_upstream(
        &self,
        id: String,
        old_branch: String,
        new_branch: String,
    ) -> Result<(), String> {
        workspaces_core::rename_worktree_upstream_core(
            id,
            old_branch,
            new_branch,
            &self.workspaces,
            |entry| Ok(PathBuf::from(entry.path.clone())),
            |root, branch_name| {
                let root = root.clone();
                let branch_name = branch_name.to_string();
                async move { git_core::git_branch_exists(&root, &branch_name).await }
            },
            |root, branch_name| {
                let root = root.clone();
                let branch_name = branch_name.to_string();
                async move { git_core::git_find_remote_for_branch_live(&root, &branch_name).await }
            },
            |root, remote| {
                let root = root.clone();
                let remote = remote.to_string();
                async move { git_core::git_remote_exists(&root, &remote).await }
            },
            |root, remote, branch_name| {
                let root = root.clone();
                let remote = remote.to_string();
                let branch_name = branch_name.to_string();
                async move {
                    git_core::git_remote_branch_exists_live(&root, &remote, &branch_name).await
                }
            },
            |root, args| {
                workspaces_core::run_git_command_unit(root, args, git_core::run_git_command_owned)
            },
        )
        .await
    }

    async fn update_workspace_settings(
        &self,
        id: String,
        settings: WorkspaceSettings,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        let client_version = client_version.clone();
        workspaces_core::update_workspace_settings_core(
            id,
            settings,
            &self.workspaces,
            &self.sessions,
            &self.app_settings,
            &self.storage_path,
            |workspaces, workspace_id, next_settings| {
                apply_workspace_settings_update(workspaces, workspace_id, next_settings)
            },
            move |entry, default_bin, codex_args, codex_home| {
                spawn_with_client(
                    self.event_sink.clone(),
                    client_version.clone(),
                    entry,
                    default_bin,
                    codex_args,
                    codex_home,
                )
            },
        )
        .await
    }

    async fn update_workspace_codex_bin(
        &self,
        id: String,
        codex_bin: Option<String>,
    ) -> Result<WorkspaceInfo, String> {
        workspaces_core::update_workspace_codex_bin_core(
            id,
            codex_bin,
            &self.workspaces,
            &self.sessions,
            &self.storage_path,
        )
        .await
    }

    async fn connect_workspace(&self, id: String, client_version: String) -> Result<(), String> {
        {
            let sessions = self.sessions.lock().await;
            if sessions.contains_key(&id) {
                return Ok(());
            }
        }

        let client_version = client_version.clone();
        workspaces_core::connect_workspace_core(
            id,
            &self.workspaces,
            &self.sessions,
            &self.app_settings,
            move |entry, default_bin, codex_args, codex_home| {
                spawn_with_client(
                    self.event_sink.clone(),
                    client_version.clone(),
                    entry,
                    default_bin,
                    codex_args,
                    codex_home,
                )
            },
        )
        .await
    }

    async fn get_app_settings(&self) -> AppSettings {
        settings_core::get_app_settings_core(&self.app_settings).await
    }

    async fn update_app_settings(&self, settings: AppSettings) -> Result<AppSettings, String> {
        settings_core::update_app_settings_core(settings, &self.app_settings, &self.settings_path)
            .await
    }

    async fn orbit_connect_test(&self) -> Result<OrbitConnectTestResult, String> {
        let settings = self.app_settings.lock().await.clone();
        let ws_url = shared::orbit_core::orbit_ws_url_from_settings(&settings)?;
        shared::orbit_core::orbit_connect_test_core(
            &ws_url,
            settings.remote_backend_token.as_deref(),
        )
        .await
    }

    async fn orbit_sign_in_start(&self) -> Result<OrbitDeviceCodeStart, String> {
        let settings = self.app_settings.lock().await.clone();
        let auth_url = shared::orbit_core::orbit_auth_url_from_settings(&settings)?;
        shared::orbit_core::orbit_sign_in_start_core(
            &auth_url,
            settings.orbit_runner_name.as_deref(),
        )
        .await
    }

    async fn orbit_sign_in_poll(
        &self,
        device_code: String,
    ) -> Result<OrbitSignInPollResult, String> {
        let auth_url = {
            let settings = self.app_settings.lock().await.clone();
            shared::orbit_core::orbit_auth_url_from_settings(&settings)?
        };
        let result = shared::orbit_core::orbit_sign_in_poll_core(&auth_url, &device_code).await?;

        if matches!(result.status, OrbitSignInStatus::Authorized) {
            if let Some(token) = result.token.as_ref() {
                let _ = settings_core::update_remote_backend_token_core(
                    &self.app_settings,
                    &self.settings_path,
                    Some(token),
                )
                .await?;
            }
        }

        Ok(result)
    }

    async fn orbit_sign_out(&self) -> Result<OrbitSignOutResult, String> {
        let settings = self.app_settings.lock().await.clone();
        let auth_url = shared::orbit_core::orbit_auth_url_optional(&settings);
        let token = shared::orbit_core::remote_backend_token_optional(&settings);

        let mut logout_error: Option<String> = None;
        if let (Some(auth_url), Some(token)) = (auth_url.as_ref(), token.as_ref()) {
            if let Err(err) = shared::orbit_core::orbit_sign_out_core(auth_url, token).await {
                logout_error = Some(err);
            }
        }

        let _ = settings_core::update_remote_backend_token_core(
            &self.app_settings,
            &self.settings_path,
            None,
        )
        .await?;

        Ok(OrbitSignOutResult {
            success: logout_error.is_none(),
            message: logout_error,
        })
    }

    async fn list_workspace_files(&self, workspace_id: String) -> Result<Vec<String>, String> {
        workspaces_core::list_workspace_files_core(&self.workspaces, &workspace_id, |root| {
            list_workspace_files_inner(root, 20000)
        })
        .await
    }

    async fn read_workspace_file(
        &self,
        workspace_id: String,
        path: String,
    ) -> Result<WorkspaceFileResponse, String> {
        workspaces_core::read_workspace_file_core(
            &self.workspaces,
            &workspace_id,
            &path,
            |root, rel_path| read_workspace_file_inner(root, rel_path),
        )
        .await
    }

    async fn file_read(
        &self,
        scope: file_policy::FileScope,
        kind: file_policy::FileKind,
        workspace_id: Option<String>,
    ) -> Result<file_io::TextFileResponse, String> {
        files_core::file_read_core(&self.workspaces, scope, kind, workspace_id).await
    }

    async fn file_write(
        &self,
        scope: file_policy::FileScope,
        kind: file_policy::FileKind,
        workspace_id: Option<String>,
        content: String,
    ) -> Result<(), String> {
        files_core::file_write_core(&self.workspaces, scope, kind, workspace_id, content).await
    }

    async fn start_thread(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::start_thread_core(&self.sessions, workspace_id).await
    }

    async fn resume_thread(
        &self,
        workspace_id: String,
        thread_id: String,
    ) -> Result<Value, String> {
        codex_core::resume_thread_core(&self.sessions, workspace_id, thread_id).await
    }

    async fn fork_thread(&self, workspace_id: String, thread_id: String) -> Result<Value, String> {
        codex_core::fork_thread_core(&self.sessions, workspace_id, thread_id).await
    }

    async fn list_threads(
        &self,
        workspace_id: String,
        cursor: Option<String>,
        limit: Option<u32>,
        sort_key: Option<String>,
    ) -> Result<Value, String> {
        codex_core::list_threads_core(&self.sessions, workspace_id, cursor, limit, sort_key).await
    }

    async fn list_mcp_server_status(
        &self,
        workspace_id: String,
        cursor: Option<String>,
        limit: Option<u32>,
    ) -> Result<Value, String> {
        codex_core::list_mcp_server_status_core(&self.sessions, workspace_id, cursor, limit).await
    }

    async fn archive_thread(
        &self,
        workspace_id: String,
        thread_id: String,
    ) -> Result<Value, String> {
        codex_core::archive_thread_core(&self.sessions, workspace_id, thread_id).await
    }

    async fn compact_thread(
        &self,
        workspace_id: String,
        thread_id: String,
    ) -> Result<Value, String> {
        codex_core::compact_thread_core(&self.sessions, workspace_id, thread_id).await
    }

    async fn set_thread_name(
        &self,
        workspace_id: String,
        thread_id: String,
        name: String,
    ) -> Result<Value, String> {
        codex_core::set_thread_name_core(&self.sessions, workspace_id, thread_id, name).await
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
        codex_core::send_user_message_core(
            &self.sessions,
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

    async fn turn_interrupt(
        &self,
        workspace_id: String,
        thread_id: String,
        turn_id: String,
    ) -> Result<Value, String> {
        codex_core::turn_interrupt_core(&self.sessions, workspace_id, thread_id, turn_id).await
    }

    async fn start_review(
        &self,
        workspace_id: String,
        thread_id: String,
        target: Value,
        delivery: Option<String>,
    ) -> Result<Value, String> {
        codex_core::start_review_core(&self.sessions, workspace_id, thread_id, target, delivery)
            .await
    }

    async fn model_list(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::model_list_core(&self.sessions, workspace_id).await
    }

    async fn collaboration_mode_list(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::collaboration_mode_list_core(&self.sessions, workspace_id).await
    }

    async fn account_rate_limits(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::account_rate_limits_core(&self.sessions, workspace_id).await
    }

    async fn account_read(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::account_read_core(&self.sessions, &self.workspaces, workspace_id).await
    }

    async fn codex_login(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::codex_login_core(&self.sessions, &self.codex_login_cancels, workspace_id).await
    }

    async fn codex_login_cancel(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::codex_login_cancel_core(&self.sessions, &self.codex_login_cancels, workspace_id)
            .await
    }

    async fn skills_list(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::skills_list_core(&self.sessions, workspace_id).await
    }

    async fn apps_list(
        &self,
        workspace_id: String,
        cursor: Option<String>,
        limit: Option<u32>,
    ) -> Result<Value, String> {
        codex_core::apps_list_core(&self.sessions, workspace_id, cursor, limit).await
    }

    async fn respond_to_server_request(
        &self,
        workspace_id: String,
        request_id: Value,
        result: Value,
    ) -> Result<Value, String> {
        codex_core::respond_to_server_request_core(
            &self.sessions,
            workspace_id,
            request_id,
            result,
        )
        .await?;
        Ok(json!({ "ok": true }))
    }

    async fn remember_approval_rule(
        &self,
        workspace_id: String,
        command: Vec<String>,
    ) -> Result<Value, String> {
        codex_core::remember_approval_rule_core(&self.workspaces, workspace_id, command).await
    }

    async fn get_config_model(&self, workspace_id: String) -> Result<Value, String> {
        codex_core::get_config_model_core(&self.workspaces, workspace_id).await
    }

    async fn add_clone(
        &self,
        source_workspace_id: String,
        copies_folder: String,
        copy_name: String,
        client_version: String,
    ) -> Result<WorkspaceInfo, String> {
        workspaces_core::add_clone_core(
            source_workspace_id,
            copy_name,
            copies_folder,
            &self.workspaces,
            &self.sessions,
            &self.app_settings,
            &self.storage_path,
            |entry, default_bin, codex_args, codex_home| {
                spawn_with_client(
                    self.event_sink.clone(),
                    client_version.clone(),
                    entry,
                    default_bin,
                    codex_args,
                    codex_home,
                )
            },
        )
        .await
    }

    async fn apply_worktree_changes(&self, workspace_id: String) -> Result<(), String> {
        workspaces_core::apply_worktree_changes_core(&self.workspaces, workspace_id).await
    }

    async fn open_workspace_in(
        &self,
        path: String,
        app: Option<String>,
        args: Vec<String>,
        command: Option<String>,
    ) -> Result<(), String> {
        workspaces_core::open_workspace_in_core(path, app, args, command).await
    }

    async fn get_open_app_icon(&self, app_name: String) -> Result<Option<String>, String> {
        #[cfg(target_os = "macos")]
        {
            return workspaces_core::get_open_app_icon_core(app_name, |name| {
                workspace_macos::get_open_app_icon_inner(name)
            })
            .await;
        }

        #[cfg(not(target_os = "macos"))]
        {
            workspaces_core::get_open_app_icon_core(app_name, |_name| None).await
        }
    }

    async fn get_git_status(&self, workspace_id: String) -> Result<Value, String> {
        git_ui_core::get_git_status_core(&self.workspaces, workspace_id).await
    }

    async fn list_git_roots(
        &self,
        workspace_id: String,
        depth: Option<usize>,
    ) -> Result<Vec<String>, String> {
        git_ui_core::list_git_roots_core(&self.workspaces, workspace_id, depth).await
    }

    async fn get_git_diffs(&self, workspace_id: String) -> Result<Vec<GitFileDiff>, String> {
        git_ui_core::get_git_diffs_core(&self.workspaces, &self.app_settings, workspace_id).await
    }

    async fn get_git_log(
        &self,
        workspace_id: String,
        limit: Option<usize>,
    ) -> Result<GitLogResponse, String> {
        git_ui_core::get_git_log_core(&self.workspaces, workspace_id, limit).await
    }

    async fn get_git_commit_diff(
        &self,
        workspace_id: String,
        sha: String,
    ) -> Result<Vec<GitCommitDiff>, String> {
        git_ui_core::get_git_commit_diff_core(
            &self.workspaces,
            &self.app_settings,
            workspace_id,
            sha,
        )
        .await
    }

    async fn get_git_remote(&self, workspace_id: String) -> Result<Option<String>, String> {
        git_ui_core::get_git_remote_core(&self.workspaces, workspace_id).await
    }

    async fn stage_git_file(&self, workspace_id: String, path: String) -> Result<(), String> {
        git_ui_core::stage_git_file_core(&self.workspaces, workspace_id, path).await
    }

    async fn stage_git_all(&self, workspace_id: String) -> Result<(), String> {
        git_ui_core::stage_git_all_core(&self.workspaces, workspace_id).await
    }

    async fn unstage_git_file(&self, workspace_id: String, path: String) -> Result<(), String> {
        git_ui_core::unstage_git_file_core(&self.workspaces, workspace_id, path).await
    }

    async fn revert_git_file(&self, workspace_id: String, path: String) -> Result<(), String> {
        git_ui_core::revert_git_file_core(&self.workspaces, workspace_id, path).await
    }

    async fn revert_git_all(&self, workspace_id: String) -> Result<(), String> {
        git_ui_core::revert_git_all_core(&self.workspaces, workspace_id).await
    }

    async fn commit_git(&self, workspace_id: String, message: String) -> Result<(), String> {
        git_ui_core::commit_git_core(&self.workspaces, workspace_id, message).await
    }

    async fn push_git(&self, workspace_id: String) -> Result<(), String> {
        git_ui_core::push_git_core(&self.workspaces, workspace_id).await
    }

    async fn pull_git(&self, workspace_id: String) -> Result<(), String> {
        git_ui_core::pull_git_core(&self.workspaces, workspace_id).await
    }

    async fn fetch_git(&self, workspace_id: String) -> Result<(), String> {
        git_ui_core::fetch_git_core(&self.workspaces, workspace_id).await
    }

    async fn sync_git(&self, workspace_id: String) -> Result<(), String> {
        git_ui_core::sync_git_core(&self.workspaces, workspace_id).await
    }

    async fn get_github_issues(
        &self,
        workspace_id: String,
    ) -> Result<GitHubIssuesResponse, String> {
        git_ui_core::get_github_issues_core(&self.workspaces, workspace_id).await
    }

    async fn get_github_pull_requests(
        &self,
        workspace_id: String,
    ) -> Result<GitHubPullRequestsResponse, String> {
        git_ui_core::get_github_pull_requests_core(&self.workspaces, workspace_id).await
    }

    async fn get_github_pull_request_diff(
        &self,
        workspace_id: String,
        pr_number: u64,
    ) -> Result<Vec<GitHubPullRequestDiff>, String> {
        git_ui_core::get_github_pull_request_diff_core(&self.workspaces, workspace_id, pr_number)
            .await
    }

    async fn get_github_pull_request_comments(
        &self,
        workspace_id: String,
        pr_number: u64,
    ) -> Result<Vec<GitHubPullRequestComment>, String> {
        git_ui_core::get_github_pull_request_comments_core(
            &self.workspaces,
            workspace_id,
            pr_number,
        )
        .await
    }

    async fn list_git_branches(&self, workspace_id: String) -> Result<Value, String> {
        git_ui_core::list_git_branches_core(&self.workspaces, workspace_id).await
    }

    async fn checkout_git_branch(&self, workspace_id: String, name: String) -> Result<(), String> {
        git_ui_core::checkout_git_branch_core(&self.workspaces, workspace_id, name).await
    }

    async fn create_git_branch(&self, workspace_id: String, name: String) -> Result<(), String> {
        git_ui_core::create_git_branch_core(&self.workspaces, workspace_id, name).await
    }

    async fn prompts_list(&self, workspace_id: String) -> Result<Vec<CustomPromptEntry>, String> {
        prompts_core::prompts_list_core(&self.workspaces, &self.settings_path, workspace_id).await
    }

    async fn prompts_workspace_dir(&self, workspace_id: String) -> Result<String, String> {
        prompts_core::prompts_workspace_dir_core(
            &self.workspaces,
            &self.settings_path,
            workspace_id,
        )
        .await
    }

    async fn prompts_global_dir(&self, workspace_id: String) -> Result<String, String> {
        prompts_core::prompts_global_dir_core(&self.workspaces, workspace_id).await
    }

    async fn prompts_create(
        &self,
        workspace_id: String,
        scope: String,
        name: String,
        description: Option<String>,
        argument_hint: Option<String>,
        content: String,
    ) -> Result<CustomPromptEntry, String> {
        prompts_core::prompts_create_core(
            &self.workspaces,
            &self.settings_path,
            workspace_id,
            scope,
            name,
            description,
            argument_hint,
            content,
        )
        .await
    }

    async fn prompts_update(
        &self,
        workspace_id: String,
        path: String,
        name: String,
        description: Option<String>,
        argument_hint: Option<String>,
        content: String,
    ) -> Result<CustomPromptEntry, String> {
        prompts_core::prompts_update_core(
            &self.workspaces,
            &self.settings_path,
            workspace_id,
            path,
            name,
            description,
            argument_hint,
            content,
        )
        .await
    }

    async fn prompts_delete(&self, workspace_id: String, path: String) -> Result<(), String> {
        prompts_core::prompts_delete_core(&self.workspaces, &self.settings_path, workspace_id, path)
            .await
    }

    async fn prompts_move(
        &self,
        workspace_id: String,
        path: String,
        scope: String,
    ) -> Result<CustomPromptEntry, String> {
        prompts_core::prompts_move_core(
            &self.workspaces,
            &self.settings_path,
            workspace_id,
            path,
            scope,
        )
        .await
    }

    async fn codex_doctor(
        &self,
        codex_bin: Option<String>,
        codex_args: Option<String>,
    ) -> Result<Value, String> {
        codex_aux_core::codex_doctor_core(&self.app_settings, codex_bin, codex_args).await
    }

    async fn get_commit_message_prompt(&self, workspace_id: String) -> Result<String, String> {
        let repo_root =
            git_ui_core::resolve_repo_root_for_workspace_core(&self.workspaces, workspace_id)
                .await?;
        let diff = git_ui_core::collect_workspace_diff_core(&repo_root)?;
        if diff.trim().is_empty() {
            return Err("No changes to generate commit message for".to_string());
        }
        Ok(codex_aux_core::build_commit_message_prompt(&diff))
    }

    async fn generate_commit_message(&self, workspace_id: String) -> Result<String, String> {
        let repo_root = git_ui_core::resolve_repo_root_for_workspace_core(
            &self.workspaces,
            workspace_id.clone(),
        )
        .await?;
        let diff = git_ui_core::collect_workspace_diff_core(&repo_root)?;
        if diff.trim().is_empty() {
            return Err("No changes to generate commit message for".to_string());
        }
        let prompt = codex_aux_core::build_commit_message_prompt(&diff);
        let response = codex_aux_core::run_background_prompt_core(
            &self.sessions,
            workspace_id,
            prompt,
            |workspace_id, thread_id| {
                emit_background_thread_hide(&self.event_sink, workspace_id, thread_id);
            },
            "Timeout waiting for commit message generation",
            "Unknown error during commit message generation",
        )
        .await?;

        let trimmed = response.trim().to_string();
        if trimmed.is_empty() {
            return Err("No commit message was generated".to_string());
        }
        Ok(trimmed)
    }

    async fn generate_run_metadata(
        &self,
        workspace_id: String,
        prompt: String,
    ) -> Result<Value, String> {
        let cleaned_prompt = prompt.trim();
        if cleaned_prompt.is_empty() {
            return Err("Prompt is required.".to_string());
        }

        let title_prompt = codex_aux_core::build_run_metadata_prompt(cleaned_prompt);
        let response_text = codex_aux_core::run_background_prompt_core(
            &self.sessions,
            workspace_id,
            title_prompt,
            |workspace_id, thread_id| {
                emit_background_thread_hide(&self.event_sink, workspace_id, thread_id);
            },
            "Timeout waiting for metadata generation",
            "Unknown error during metadata generation",
        )
        .await?;

        let trimmed = response_text.trim();
        if trimmed.is_empty() {
            return Err("No metadata was generated".to_string());
        }
        let json_value = codex_aux_core::extract_json_value(trimmed)
            .ok_or_else(|| "Failed to parse metadata JSON".to_string())?;
        let title = json_value
            .get("title")
            .and_then(|v| v.as_str())
            .map(|v| v.trim().to_string())
            .filter(|v| !v.is_empty())
            .ok_or_else(|| "Missing title in metadata".to_string())?;
        let worktree_name = json_value
            .get("worktreeName")
            .or_else(|| json_value.get("worktree_name"))
            .and_then(|v| v.as_str())
            .map(codex_aux_core::sanitize_run_worktree_name)
            .filter(|v| !v.is_empty())
            .ok_or_else(|| "Missing worktree name in metadata".to_string())?;
        Ok(json!({
            "title": title,
            "worktreeName": worktree_name
        }))
    }

    async fn local_usage_snapshot(
        &self,
        days: Option<u32>,
        workspace_path: Option<String>,
    ) -> Result<LocalUsageSnapshot, String> {
        local_usage_core::local_usage_snapshot_core(&self.workspaces, days, workspace_path).await
    }

    async fn menu_set_accelerators(&self, _updates: Vec<Value>) -> Result<(), String> {
        // Daemon has no native menu runtime; treat as no-op for remote parity.
        Ok(())
    }

    async fn is_macos_debug_build(&self) -> bool {
        cfg!(all(target_os = "macos", debug_assertions))
    }

    async fn send_notification_fallback(&self, title: String, body: String) -> Result<(), String> {
        send_notification_fallback_inner(title, body)
    }
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

fn parse_optional_u64(value: &Value, key: &str) -> Option<u64> {
    match value {
        Value::Object(map) => map.get(key).and_then(|value| value.as_u64()),
        _ => None,
    }
}

fn emit_background_thread_hide(event_sink: &DaemonEventSink, workspace_id: &str, thread_id: &str) {
    event_sink.emit_app_server_event(AppServerEvent {
        workspace_id: workspace_id.to_string(),
        message: json!({
            "method": "codex/backgroundThread",
            "params": {
                "threadId": thread_id,
                "action": "hide"
            }
        }),
    });
}

fn send_notification_fallback_inner(title: String, body: String) -> Result<(), String> {
    #[cfg(all(target_os = "macos", debug_assertions))]
    {
        let escape = |value: &str| value.replace('\\', "\\\\").replace('"', "\\\"");
        let script = format!(
            "display notification \"{}\" with title \"{}\"",
            escape(&body),
            escape(&title)
        );

        let status = std::process::Command::new("/usr/bin/osascript")
            .arg("-e")
            .arg(script)
            .status()
            .map_err(|error| format!("Failed to run osascript: {error}"))?;

        if status.success() {
            return Ok(());
        }
        return Err(format!("osascript exited with status: {status}"));
    }

    #[cfg(not(all(target_os = "macos", debug_assertions)))]
    {
        let _ = (title, body);
        Err("Notification fallback is only available on macOS debug builds.".to_string())
    }
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

    let content = String::from_utf8(buffer).map_err(|_| "File is not valid UTF-8".to_string())?;
    Ok(WorkspaceFileResponse { content, truncated })
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
USAGE:\n  codex-monitor-daemon [--listen <addr>] [--data-dir <path>] [--token <token> | --insecure-no-auth]\n  codex-monitor-daemon --orbit-url <ws-url> [--orbit-token <token>] [--orbit-auth-url <url>] [--orbit-runner-name <name>] [--data-dir <path>]\n\n\
OPTIONS:\n  --listen <addr>          Bind address (default: {DEFAULT_LISTEN_ADDR})\n  --data-dir <path>        Data dir holding workspaces.json/settings.json\n  --token <token>          Shared token required by TCP clients\n  --insecure-no-auth       Disable TCP auth (dev only)\n  --orbit-url <ws-url>     Run in Orbit runner mode and connect outbound to this WS URL\n  --orbit-token <token>    Orbit auth token (optional if URL already includes token)\n  --orbit-auth-url <url>   Orbit auth base URL (metadata only, optional)\n  --orbit-runner-name <n>  Runner display name (metadata only, optional)\n  -h, --help               Show this help\n"
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
    let mut orbit_url: Option<String> = None;
    let mut orbit_token: Option<String> = env::var("CODEX_MONITOR_ORBIT_TOKEN")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut orbit_auth_url: Option<String> = env::var("CODEX_MONITOR_ORBIT_AUTH_URL")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());
    let mut orbit_runner_name: Option<String> = env::var("CODEX_MONITOR_ORBIT_RUNNER_NAME")
        .ok()
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

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
            "--orbit-url" => {
                let value = args.next().ok_or("--orbit-url requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--orbit-url requires a non-empty value".to_string());
                }
                orbit_url = Some(trimmed.to_string());
            }
            "--orbit-token" => {
                let value = args.next().ok_or("--orbit-token requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--orbit-token requires a non-empty value".to_string());
                }
                orbit_token = Some(trimmed.to_string());
            }
            "--orbit-auth-url" => {
                let value = args.next().ok_or("--orbit-auth-url requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--orbit-auth-url requires a non-empty value".to_string());
                }
                orbit_auth_url = Some(trimmed.to_string());
            }
            "--orbit-runner-name" => {
                let value = args.next().ok_or("--orbit-runner-name requires a value")?;
                let trimmed = value.trim();
                if trimmed.is_empty() {
                    return Err("--orbit-runner-name requires a non-empty value".to_string());
                }
                orbit_runner_name = Some(trimmed.to_string());
            }
            _ => return Err(format!("Unknown argument: {arg}")),
        }
    }

    let is_orbit_mode = orbit_url.is_some();
    if !is_orbit_mode && token.is_none() && !insecure_no_auth {
        return Err(
            "Missing --token (or set CODEX_MONITOR_DAEMON_TOKEN). Use --insecure-no-auth for local dev only."
                .to_string(),
        );
    }

    Ok(DaemonConfig {
        listen,
        token,
        data_dir: data_dir.unwrap_or_else(default_data_dir),
        orbit_url,
        orbit_token,
        orbit_auth_url,
        orbit_runner_name,
    })
}

fn build_error_response(id: Option<u64>, message: &str) -> Option<String> {
    let id = id?;
    Some(
        serde_json::to_string(&json!({
            "id": id,
            "error": { "message": message }
        }))
        .unwrap_or_else(|_| {
            "{\"id\":0,\"error\":{\"message\":\"serialization failed\"}}".to_string()
        }),
    )
}

fn build_result_response(id: Option<u64>, result: Value) -> Option<String> {
    let id = id?;
    Some(
        serde_json::to_string(&json!({ "id": id, "result": result })).unwrap_or_else(|_| {
            "{\"id\":0,\"error\":{\"message\":\"serialization failed\"}}".to_string()
        }),
    )
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
        DaemonEvent::TerminalExit(payload) => json!({
            "method": "terminal-exit",
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
        Value::Object(map) => map
            .get(key)
            .and_then(|value| value.as_array())
            .map(|items| {
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

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileReadRequest {
    scope: file_policy::FileScope,
    kind: file_policy::FileKind,
    workspace_id: Option<String>,
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
struct FileWriteRequest {
    scope: file_policy::FileScope,
    kind: file_policy::FileKind,
    workspace_id: Option<String>,
    content: String,
}

fn parse_file_read_request(params: &Value) -> Result<FileReadRequest, String> {
    serde_json::from_value(params.clone()).map_err(|err| err.to_string())
}

fn parse_file_write_request(params: &Value) -> Result<FileWriteRequest, String> {
    serde_json::from_value(params.clone()).map_err(|err| err.to_string())
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
            let name = parse_optional_string(&params, "name");
            let copy_agents_md = parse_optional_bool(&params, "copyAgentsMd").unwrap_or(true);
            let workspace = state
                .add_worktree(parent_id, branch, name, copy_agents_md, client_version)
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
        "file_read" => {
            let request = parse_file_read_request(&params)?;
            let response = state
                .file_read(request.scope, request.kind, request.workspace_id)
                .await?;
            serde_json::to_value(response).map_err(|err| err.to_string())
        }
        "file_write" => {
            let request = parse_file_write_request(&params)?;
            state
                .file_write(
                    request.scope,
                    request.kind,
                    request.workspace_id,
                    request.content,
                )
                .await?;
            serde_json::to_value(json!({ "ok": true })).map_err(|err| err.to_string())
        }
        "get_app_settings" => {
            let settings = state.get_app_settings().await;
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
        "orbit_connect_test" => {
            let result = state.orbit_connect_test().await?;
            serde_json::to_value(result).map_err(|err| err.to_string())
        }
        "orbit_sign_in_start" => {
            let result = state.orbit_sign_in_start().await?;
            serde_json::to_value(result).map_err(|err| err.to_string())
        }
        "orbit_sign_in_poll" => {
            let device_code = parse_string(&params, "deviceCode")?;
            let result = state.orbit_sign_in_poll(device_code).await?;
            serde_json::to_value(result).map_err(|err| err.to_string())
        }
        "orbit_sign_out" => {
            let result = state.orbit_sign_out().await?;
            serde_json::to_value(result).map_err(|err| err.to_string())
        }
        "get_codex_config_path" => {
            let path = settings_core::get_codex_config_path_core()?;
            Ok(Value::String(path))
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
        "fork_thread" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            state.fork_thread(workspace_id, thread_id).await
        }
        "list_threads" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let cursor = parse_optional_string(&params, "cursor");
            let limit = parse_optional_u32(&params, "limit");
            let sort_key = parse_optional_string(&params, "sortKey");
            state
                .list_threads(workspace_id, cursor, limit, sort_key)
                .await
        }
        "list_mcp_server_status" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let cursor = parse_optional_string(&params, "cursor");
            let limit = parse_optional_u32(&params, "limit");
            state
                .list_mcp_server_status(workspace_id, cursor, limit)
                .await
        }
        "archive_thread" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            state.archive_thread(workspace_id, thread_id).await
        }
        "compact_thread" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            state.compact_thread(workspace_id, thread_id).await
        }
        "set_thread_name" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let thread_id = parse_string(&params, "threadId")?;
            let name = parse_string(&params, "name")?;
            state.set_thread_name(workspace_id, thread_id, name).await
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
            state
                .start_review(workspace_id, thread_id, target, delivery)
                .await
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
        "account_read" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.account_read(workspace_id).await
        }
        "codex_login" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.codex_login(workspace_id).await
        }
        "codex_login_cancel" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.codex_login_cancel(workspace_id).await
        }
        "skills_list" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.skills_list(workspace_id).await
        }
        "apps_list" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let cursor = parse_optional_string(&params, "cursor");
            let limit = parse_optional_u32(&params, "limit");
            state.apps_list(workspace_id, cursor, limit).await
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
        "add_clone" => {
            let source_workspace_id = parse_string(&params, "sourceWorkspaceId")?;
            let copies_folder = parse_string(&params, "copiesFolder")?;
            let copy_name = parse_string(&params, "copyName")?;
            let workspace = state
                .add_clone(
                    source_workspace_id,
                    copies_folder,
                    copy_name,
                    client_version,
                )
                .await?;
            serde_json::to_value(workspace).map_err(|err| err.to_string())
        }
        "apply_worktree_changes" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.apply_worktree_changes(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "open_workspace_in" => {
            let path = parse_string(&params, "path")?;
            let app = parse_optional_string(&params, "app");
            let command = parse_optional_string(&params, "command");
            let args = parse_optional_string_array(&params, "args").unwrap_or_default();
            state.open_workspace_in(path, app, args, command).await?;
            Ok(json!({ "ok": true }))
        }
        "get_open_app_icon" => {
            let app_name = parse_string(&params, "appName")?;
            let icon = state.get_open_app_icon(app_name).await?;
            serde_json::to_value(icon).map_err(|err| err.to_string())
        }
        "get_git_status" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.get_git_status(workspace_id).await
        }
        "list_git_roots" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let depth = parse_optional_u32(&params, "depth").map(|value| value as usize);
            let roots = state.list_git_roots(workspace_id, depth).await?;
            serde_json::to_value(roots).map_err(|err| err.to_string())
        }
        "get_git_diffs" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let diffs = state.get_git_diffs(workspace_id).await?;
            serde_json::to_value(diffs).map_err(|err| err.to_string())
        }
        "get_git_log" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let limit = parse_optional_u32(&params, "limit").map(|value| value as usize);
            let log = state.get_git_log(workspace_id, limit).await?;
            serde_json::to_value(log).map_err(|err| err.to_string())
        }
        "get_git_commit_diff" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let sha = parse_string(&params, "sha")?;
            let diff = state.get_git_commit_diff(workspace_id, sha).await?;
            serde_json::to_value(diff).map_err(|err| err.to_string())
        }
        "get_git_remote" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let remote = state.get_git_remote(workspace_id).await?;
            serde_json::to_value(remote).map_err(|err| err.to_string())
        }
        "stage_git_file" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            state.stage_git_file(workspace_id, path).await?;
            Ok(json!({ "ok": true }))
        }
        "stage_git_all" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.stage_git_all(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "unstage_git_file" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            state.unstage_git_file(workspace_id, path).await?;
            Ok(json!({ "ok": true }))
        }
        "revert_git_file" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            state.revert_git_file(workspace_id, path).await?;
            Ok(json!({ "ok": true }))
        }
        "revert_git_all" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.revert_git_all(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "commit_git" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let message = parse_string(&params, "message")?;
            state.commit_git(workspace_id, message).await?;
            Ok(json!({ "ok": true }))
        }
        "push_git" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.push_git(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "pull_git" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.pull_git(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "fetch_git" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.fetch_git(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "sync_git" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.sync_git(workspace_id).await?;
            Ok(json!({ "ok": true }))
        }
        "get_github_issues" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let issues = state.get_github_issues(workspace_id).await?;
            serde_json::to_value(issues).map_err(|err| err.to_string())
        }
        "get_github_pull_requests" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let prs = state.get_github_pull_requests(workspace_id).await?;
            serde_json::to_value(prs).map_err(|err| err.to_string())
        }
        "get_github_pull_request_diff" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let pr_number =
                parse_optional_u64(&params, "prNumber").ok_or("missing or invalid `prNumber`")?;
            let diff = state
                .get_github_pull_request_diff(workspace_id, pr_number)
                .await?;
            serde_json::to_value(diff).map_err(|err| err.to_string())
        }
        "get_github_pull_request_comments" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let pr_number =
                parse_optional_u64(&params, "prNumber").ok_or("missing or invalid `prNumber`")?;
            let comments = state
                .get_github_pull_request_comments(workspace_id, pr_number)
                .await?;
            serde_json::to_value(comments).map_err(|err| err.to_string())
        }
        "list_git_branches" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            state.list_git_branches(workspace_id).await
        }
        "checkout_git_branch" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let name = parse_string(&params, "name")?;
            state.checkout_git_branch(workspace_id, name).await?;
            Ok(json!({ "ok": true }))
        }
        "create_git_branch" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let name = parse_string(&params, "name")?;
            state.create_git_branch(workspace_id, name).await?;
            Ok(json!({ "ok": true }))
        }
        "prompts_list" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let prompts = state.prompts_list(workspace_id).await?;
            serde_json::to_value(prompts).map_err(|err| err.to_string())
        }
        "prompts_workspace_dir" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let dir = state.prompts_workspace_dir(workspace_id).await?;
            Ok(Value::String(dir))
        }
        "prompts_global_dir" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let dir = state.prompts_global_dir(workspace_id).await?;
            Ok(Value::String(dir))
        }
        "prompts_create" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let scope = parse_string(&params, "scope")?;
            let name = parse_string(&params, "name")?;
            let description = parse_optional_string(&params, "description");
            let argument_hint = parse_optional_string(&params, "argumentHint");
            let content = parse_string(&params, "content")?;
            let prompt = state
                .prompts_create(
                    workspace_id,
                    scope,
                    name,
                    description,
                    argument_hint,
                    content,
                )
                .await?;
            serde_json::to_value(prompt).map_err(|err| err.to_string())
        }
        "prompts_update" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            let name = parse_string(&params, "name")?;
            let description = parse_optional_string(&params, "description");
            let argument_hint = parse_optional_string(&params, "argumentHint");
            let content = parse_string(&params, "content")?;
            let prompt = state
                .prompts_update(
                    workspace_id,
                    path,
                    name,
                    description,
                    argument_hint,
                    content,
                )
                .await?;
            serde_json::to_value(prompt).map_err(|err| err.to_string())
        }
        "prompts_delete" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            state.prompts_delete(workspace_id, path).await?;
            Ok(json!({ "ok": true }))
        }
        "prompts_move" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let path = parse_string(&params, "path")?;
            let scope = parse_string(&params, "scope")?;
            let prompt = state.prompts_move(workspace_id, path, scope).await?;
            serde_json::to_value(prompt).map_err(|err| err.to_string())
        }
        "codex_doctor" => {
            let codex_bin = parse_optional_string(&params, "codexBin");
            let codex_args = parse_optional_string(&params, "codexArgs");
            state.codex_doctor(codex_bin, codex_args).await
        }
        "get_commit_message_prompt" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let prompt = state.get_commit_message_prompt(workspace_id).await?;
            Ok(Value::String(prompt))
        }
        "generate_commit_message" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let message = state.generate_commit_message(workspace_id).await?;
            Ok(Value::String(message))
        }
        "generate_run_metadata" => {
            let workspace_id = parse_string(&params, "workspaceId")?;
            let prompt = parse_string(&params, "prompt")?;
            state.generate_run_metadata(workspace_id, prompt).await
        }
        "local_usage_snapshot" => {
            let days = parse_optional_u32(&params, "days");
            let workspace_path = parse_optional_string(&params, "workspacePath");
            let snapshot = state.local_usage_snapshot(days, workspace_path).await?;
            serde_json::to_value(snapshot).map_err(|err| err.to_string())
        }
        "menu_set_accelerators" => {
            let updates: Vec<Value> = match &params {
                Value::Object(map) => map
                    .get("updates")
                    .cloned()
                    .map(serde_json::from_value)
                    .transpose()
                    .map_err(|err| err.to_string())?
                    .unwrap_or_default(),
                _ => Vec::new(),
            };
            state.menu_set_accelerators(updates).await?;
            Ok(json!({ "ok": true }))
        }
        "is_macos_debug_build" => {
            let is_debug = state.is_macos_debug_build().await;
            Ok(Value::Bool(is_debug))
        }
        "send_notification_fallback" => {
            let title = parse_string(&params, "title")?;
            let body = parse_string(&params, "body")?;
            state.send_notification_fallback(title, body).await?;
            Ok(json!({ "ok": true }))
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

async fn handle_orbit_line(
    line: &str,
    state: &DaemonState,
    out_tx: &mpsc::UnboundedSender<String>,
    client_version: &str,
) {
    let message: Value = match serde_json::from_str(line) {
        Ok(value) => value,
        Err(_) => return,
    };

    if let Some(message_type) = message.get("type").and_then(Value::as_str) {
        if message_type.eq_ignore_ascii_case("ping") {
            let _ = out_tx.send(json!({ "type": "pong" }).to_string());
        }
        return;
    }

    let id = message.get("id").and_then(|value| value.as_u64());
    let method = message
        .get("method")
        .and_then(|value| value.as_str())
        .unwrap_or("")
        .to_string();
    let params = message.get("params").cloned().unwrap_or(Value::Null);
    if method.is_empty() {
        return;
    }

    if method == "auth" {
        if let Some(response) = build_result_response(id, json!({ "ok": true })) {
            let _ = out_tx.send(response);
        }
        return;
    }

    let result = handle_rpc_request(state, &method, params, client_version.to_string()).await;
    let response = match result {
        Ok(value) => build_result_response(id, value),
        Err(message) => build_error_response(id, &message),
    };
    if let Some(response) = response {
        let _ = out_tx.send(response);
    }
}

async fn run_orbit_mode(
    config: Arc<DaemonConfig>,
    state: Arc<DaemonState>,
    events_tx: broadcast::Sender<DaemonEvent>,
) {
    let orbit_url = config.orbit_url.clone().unwrap_or_default();
    let runner_name = config
        .orbit_runner_name
        .clone()
        .unwrap_or_else(|| "codex-monitor-daemon".to_string());

    let mut reconnect_delay = Duration::from_secs(1);
    loop {
        let ws_url =
            match shared::orbit_core::build_orbit_ws_url(&orbit_url, config.orbit_token.as_deref())
            {
                Ok(value) => value,
                Err(err) => {
                    eprintln!("invalid orbit url: {err}");
                    sleep(reconnect_delay).await;
                    reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(20));
                    continue;
                }
            };

        let stream = match connect_async(&ws_url).await {
            Ok((stream, _response)) => stream,
            Err(err) => {
                eprintln!(
                    "orbit runner failed to connect to {}: {}. retrying in {}s",
                    ws_url,
                    err,
                    reconnect_delay.as_secs()
                );
                sleep(reconnect_delay).await;
                reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(20));
                continue;
            }
        };

        reconnect_delay = Duration::from_secs(1);
        eprintln!("orbit runner connected to {}", ws_url);

        let (mut writer, mut reader) = stream.split();
        let (out_tx, mut out_rx) = mpsc::unbounded_channel::<String>();

        let write_task = tokio::spawn(async move {
            while let Some(message) = out_rx.recv().await {
                if writer.send(Message::Text(message.into())).await.is_err() {
                    break;
                }
            }
        });

        let events_task = {
            let rx = events_tx.subscribe();
            let out_tx_events = out_tx.clone();
            tokio::spawn(forward_events(rx, out_tx_events))
        };

        let _ = out_tx.send(
            json!({
                "type": "anchor.hello",
                "name": runner_name.clone(),
                "platform": std::env::consts::OS,
                "authUrl": config.orbit_auth_url.clone(),
            })
            .to_string(),
        );

        let client_version = format!("daemon-{}", env!("CARGO_PKG_VERSION"));
        while let Some(frame) = reader.next().await {
            match frame {
                Ok(Message::Text(text)) => {
                    for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
                        handle_orbit_line(line, &state, &out_tx, &client_version).await;
                    }
                }
                Ok(Message::Binary(bytes)) => {
                    if let Ok(text) = String::from_utf8(bytes.to_vec()) {
                        for line in text.lines().map(str::trim).filter(|line| !line.is_empty()) {
                            handle_orbit_line(line, &state, &out_tx, &client_version).await;
                        }
                    }
                }
                Ok(Message::Close(_)) => break,
                Ok(Message::Ping(_)) | Ok(Message::Pong(_)) => {}
                Ok(Message::Frame(_)) => {}
                Err(err) => {
                    eprintln!("orbit runner connection error: {err}");
                    break;
                }
            }
        }

        drop(out_tx);
        events_task.abort();
        write_task.abort();

        eprintln!(
            "orbit runner disconnected. reconnecting in {}s",
            reconnect_delay.as_secs()
        );
        sleep(reconnect_delay).await;
        reconnect_delay = (reconnect_delay * 2).min(Duration::from_secs(20));
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::types::WorkspaceKind;
    use serde_json::json;
    use std::future::Future;
    use std::path::PathBuf;
    use std::time::{SystemTime, UNIX_EPOCH};

    fn run_async_test<F>(future: F)
    where
        F: Future<Output = ()>,
    {
        tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .expect("runtime")
            .block_on(future);
    }

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "codex-monitor-{prefix}-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn test_state(data_dir: &std::path::Path) -> DaemonState {
        let (tx, _rx) = broadcast::channel::<DaemonEvent>(32);
        DaemonState {
            data_dir: data_dir.to_path_buf(),
            workspaces: Mutex::new(HashMap::new()),
            sessions: Mutex::new(HashMap::new()),
            storage_path: data_dir.join("workspaces.json"),
            settings_path: data_dir.join("settings.json"),
            app_settings: Mutex::new(AppSettings::default()),
            event_sink: DaemonEventSink { tx },
            codex_login_cancels: Mutex::new(HashMap::new()),
        }
    }

    async fn insert_workspace(state: &DaemonState, workspace_id: &str, workspace_path: &str) {
        let entry = WorkspaceEntry {
            id: workspace_id.to_string(),
            name: "Workspace".to_string(),
            path: workspace_path.to_string(),
            codex_bin: None,
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings {
                codex_home: Some(format!("{workspace_path}/.codex-home")),
                ..WorkspaceSettings::default()
            },
        };
        state
            .workspaces
            .lock()
            .await
            .insert(workspace_id.to_string(), entry);
    }

    #[test]
    fn rpc_add_clone_uses_workspace_core_validation() {
        run_async_test(async {
            let tmp = make_temp_dir("rpc-add-clone");
            let state = test_state(&tmp);

            let err = handle_rpc_request(
                &state,
                "add_clone",
                json!({
                    "sourceWorkspaceId": "source",
                    "copiesFolder": tmp.to_string_lossy().to_string(),
                    "copyName": "   "
                }),
                "daemon-test".to_string(),
            )
            .await
            .expect_err("expected validation error");

            assert_eq!(err, "Copy name is required.");
            let _ = std::fs::remove_dir_all(&tmp);
        });
    }

    #[test]
    fn rpc_prompts_list_reads_workspace_prompts() {
        run_async_test(async {
            let tmp = make_temp_dir("rpc-prompts-list");
            let workspace_id = "ws-prompts";
            let workspace_dir = tmp.join("workspace");
            std::fs::create_dir_all(&workspace_dir).expect("create workspace dir");

            let state = test_state(&tmp);
            insert_workspace(&state, workspace_id, &workspace_dir.to_string_lossy()).await;

            let prompts_dir = tmp.join("workspaces").join(workspace_id).join("prompts");
            std::fs::create_dir_all(&prompts_dir).expect("create prompts dir");
            std::fs::write(prompts_dir.join("review.md"), "Prompt body").expect("write prompt");

            let result = handle_rpc_request(
                &state,
                "prompts_list",
                json!({ "workspaceId": workspace_id }),
                "daemon-test".to_string(),
            )
            .await
            .expect("prompts_list should succeed");

            let prompts = result.as_array().expect("array result");
            assert!(
                prompts.iter().any(|entry| {
                    entry
                        .get("name")
                        .and_then(Value::as_str)
                        .is_some_and(|name| name == "review")
                }),
                "expected prompts_list to include workspace prompt"
            );
            let _ = std::fs::remove_dir_all(&tmp);
        });
    }

    #[test]
    fn rpc_local_usage_snapshot_returns_snapshot_shape() {
        run_async_test(async {
            let tmp = make_temp_dir("rpc-local-usage");
            let state = test_state(&tmp);

            let result = handle_rpc_request(
                &state,
                "local_usage_snapshot",
                json!({ "days": 7 }),
                "daemon-test".to_string(),
            )
            .await
            .expect("local_usage_snapshot should succeed");

            assert!(result.get("days").and_then(Value::as_array).is_some());
            assert!(result.get("totals").is_some());
            let _ = std::fs::remove_dir_all(&tmp);
        });
    }
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

        if config.orbit_url.is_some() {
            eprintln!(
                "codex-monitor-daemon orbit mode (data dir: {})",
                state
                    .storage_path
                    .parent()
                    .unwrap_or(&state.storage_path)
                    .display()
            );
            run_orbit_mode(config, state, events_tx).await;
            return;
        }

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
