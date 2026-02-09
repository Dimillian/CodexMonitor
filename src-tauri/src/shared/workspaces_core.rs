use std::collections::HashMap;
use std::future::Future;
#[cfg(target_os = "windows")]
use std::path::Path;
use std::path::PathBuf;
use std::process::Stdio;
use std::sync::Arc;

use tokio::io::AsyncWriteExt;
use tokio::sync::Mutex;

use crate::backend::app_server::WorkspaceSession;
use crate::codex::args::resolve_workspace_codex_args;
use crate::codex::home::resolve_workspace_codex_home;
use crate::git_utils::resolve_git_root;
#[cfg(target_os = "windows")]
use crate::shared::process_core::{build_cmd_c_command, resolve_windows_executable};
use crate::shared::process_core::{kill_child_process_tree, tokio_command};
use crate::shared::{git_core, worktree_core};
use crate::storage::write_workspaces;
use crate::types::{
    AppSettings, WorkspaceEntry, WorkspaceInfo, WorkspaceKind, WorkspaceSettings, WorktreeInfo,
    WorktreeSetupStatus,
};
use uuid::Uuid;

pub(crate) const WORKTREE_SETUP_MARKERS_DIR: &str = "worktree-setup";
pub(crate) const WORKTREE_SETUP_MARKER_EXT: &str = "ran";
const AGENTS_MD_FILE_NAME: &str = "AGENTS.md";

fn copy_agents_md_from_parent_to_worktree(
    parent_repo_root: &PathBuf,
    worktree_root: &PathBuf,
) -> Result<(), String> {
    let source_path = parent_repo_root.join(AGENTS_MD_FILE_NAME);
    if !source_path.is_file() {
        return Ok(());
    }

    let destination_path = worktree_root.join(AGENTS_MD_FILE_NAME);
    if destination_path.is_file() {
        return Ok(());
    }

    let temp_path = worktree_root.join(format!("{AGENTS_MD_FILE_NAME}.tmp"));

    std::fs::copy(&source_path, &temp_path).map_err(|err| {
        format!(
            "Failed to copy {} from {} to {}: {err}",
            AGENTS_MD_FILE_NAME,
            source_path.display(),
            temp_path.display()
        )
    })?;

    std::fs::rename(&temp_path, &destination_path).map_err(|err| {
        let _ = std::fs::remove_file(&temp_path);
        format!(
            "Failed to finalize {} copy to {}: {err}",
            AGENTS_MD_FILE_NAME,
            destination_path.display()
        )
    })?;

    Ok(())
}

pub(crate) fn normalize_setup_script(script: Option<String>) -> Option<String> {
    match script {
        Some(value) if value.trim().is_empty() => None,
        Some(value) => Some(value),
        None => None,
    }
}

pub(crate) fn worktree_setup_marker_path(data_dir: &PathBuf, workspace_id: &str) -> PathBuf {
    data_dir
        .join(WORKTREE_SETUP_MARKERS_DIR)
        .join(format!("{workspace_id}.{WORKTREE_SETUP_MARKER_EXT}"))
}

pub(crate) fn is_workspace_path_dir_core(path: &str) -> bool {
    PathBuf::from(path).is_dir()
}

pub(crate) async fn list_workspaces_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
) -> Vec<WorkspaceInfo> {
    let workspaces = workspaces.lock().await;
    let sessions = sessions.lock().await;
    let mut result = Vec::new();
    for entry in workspaces.values() {
        result.push(WorkspaceInfo {
            id: entry.id.clone(),
            name: entry.name.clone(),
            path: entry.path.clone(),
            codex_bin: entry.codex_bin.clone(),
            connected: sessions.contains_key(&entry.id),
            kind: entry.kind.clone(),
            parent_id: entry.parent_id.clone(),
            worktree: entry.worktree.clone(),
            settings: entry.settings.clone(),
        });
    }
    sort_workspaces(&mut result);
    result
}

async fn resolve_entry_and_parent(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<(WorkspaceEntry, Option<WorkspaceEntry>), String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())?;
    let parent_entry = entry
        .parent_id
        .as_ref()
        .and_then(|parent_id| workspaces.get(parent_id))
        .cloned();
    Ok((entry, parent_entry))
}

async fn resolve_workspace_root(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .cloned()
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(entry.path))
}

pub(crate) async fn worktree_setup_status_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    data_dir: &PathBuf,
) -> Result<WorktreeSetupStatus, String> {
    let entry = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };

    let script = normalize_setup_script(entry.settings.worktree_setup_script.clone());
    let marker_exists = if entry.kind.is_worktree() {
        worktree_setup_marker_path(data_dir, &entry.id).exists()
    } else {
        false
    };
    let should_run = entry.kind.is_worktree() && script.is_some() && !marker_exists;

    Ok(WorktreeSetupStatus { should_run, script })
}

pub(crate) async fn worktree_setup_mark_ran_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    data_dir: &PathBuf,
) -> Result<(), String> {
    let entry = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };
    if !entry.kind.is_worktree() {
        return Err("Not a worktree workspace.".to_string());
    }
    let marker_path = worktree_setup_marker_path(data_dir, &entry.id);
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

pub(crate) async fn add_workspace_core<F, Fut>(
    path: String,
    codex_bin: Option<String>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    spawn_session: F,
) -> Result<WorkspaceInfo, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
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
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, None, Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = spawn_session(entry.clone(), default_bin, codex_args, codex_home).await?;

    if let Err(error) = {
        let mut workspaces = workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)
    } {
        {
            let mut workspaces = workspaces.lock().await;
            workspaces.remove(&entry.id);
        }
        let mut child = session.child.lock().await;
        kill_child_process_tree(&mut child).await;
        return Err(error);
    }

    sessions.lock().await.insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        worktree: entry.worktree,
        settings: entry.settings,
    })
}

pub(crate) async fn add_clone_core<F, Fut>(
    source_workspace_id: String,
    copy_name: String,
    copies_folder: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    spawn_session: F,
) -> Result<WorkspaceInfo, String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let copy_name = copy_name.trim().to_string();
    if copy_name.is_empty() {
        return Err("Copy name is required.".to_string());
    }

    let copies_folder = copies_folder.trim().to_string();
    if copies_folder.is_empty() {
        return Err("Copies folder is required.".to_string());
    }
    let copies_folder_path = PathBuf::from(&copies_folder);
    std::fs::create_dir_all(&copies_folder_path)
        .map_err(|e| format!("Failed to create copies folder: {e}"))?;
    if !copies_folder_path.is_dir() {
        return Err("Copies folder must be a directory.".to_string());
    }

    let (source_entry, inherited_group_id) = {
        let workspaces = workspaces.lock().await;
        let source_entry = workspaces
            .get(&source_workspace_id)
            .cloned()
            .ok_or_else(|| "source workspace not found".to_string())?;
        let inherited_group_id = if source_entry.kind.is_worktree() {
            source_entry
                .parent_id
                .as_ref()
                .and_then(|parent_id| workspaces.get(parent_id))
                .and_then(|parent| parent.settings.group_id.clone())
        } else {
            source_entry.settings.group_id.clone()
        };
        (source_entry, inherited_group_id)
    };

    let destination_path =
        worktree_core::build_clone_destination_path(&copies_folder_path, &copy_name);
    let destination_path_string = destination_path.to_string_lossy().to_string();

    if let Err(error) = git_core::run_git_command(
        &copies_folder_path,
        &["clone", &source_entry.path, &destination_path_string],
    )
    .await
    {
        let _ = tokio::fs::remove_dir_all(&destination_path).await;
        return Err(error);
    }

    if let Some(origin_url) = git_core::git_get_origin_url(&PathBuf::from(&source_entry.path)).await
    {
        let _ = git_core::run_git_command(
            &destination_path,
            &["remote", "set-url", "origin", &origin_url],
        )
        .await;
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: copy_name,
        path: destination_path_string,
        codex_bin: source_entry.codex_bin.clone(),
        kind: WorkspaceKind::Main,
        parent_id: None,
        worktree: None,
        settings: WorkspaceSettings {
            group_id: inherited_group_id,
            ..WorkspaceSettings::default()
        },
    };

    let (default_bin, codex_args) = {
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, None, Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, None);
    let session = match spawn_session(entry.clone(), default_bin, codex_args, codex_home).await {
        Ok(session) => session,
        Err(error) => {
            let _ = tokio::fs::remove_dir_all(&destination_path).await;
            return Err(error);
        }
    };

    if let Err(error) = {
        let mut workspaces = workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)
    } {
        {
            let mut workspaces = workspaces.lock().await;
            workspaces.remove(&entry.id);
        }
        let mut child = session.child.lock().await;
        kill_child_process_tree(&mut child).await;
        let _ = tokio::fs::remove_dir_all(&destination_path).await;
        return Err(error);
    }

    sessions.lock().await.insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        worktree: entry.worktree,
        settings: entry.settings,
    })
}

pub(crate) async fn apply_worktree_changes_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<(), String> {
    let (entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    apply_worktree_changes_inner_core(&entry, &parent).await
}

async fn apply_worktree_changes_inner_core(
    entry: &WorkspaceEntry,
    parent: &WorkspaceEntry,
) -> Result<(), String> {
    let worktree_root = resolve_git_root(entry)?;
    let parent_root = resolve_git_root(parent)?;

    let parent_status =
        git_core::run_git_command_bytes(&parent_root, &["status", "--porcelain"]).await?;
    if !String::from_utf8_lossy(&parent_status).trim().is_empty() {
        return Err(
            "Your current branch has uncommitted changes. Please commit, stash, or discard them before applying worktree changes."
                .to_string(),
        );
    }

    let mut patch: Vec<u8> = Vec::new();
    let staged_patch = git_core::run_git_diff(
        &worktree_root,
        &["diff", "--binary", "--no-color", "--cached"],
    )
    .await?;
    patch.extend_from_slice(&staged_patch);
    let unstaged_patch =
        git_core::run_git_diff(&worktree_root, &["diff", "--binary", "--no-color"]).await?;
    patch.extend_from_slice(&unstaged_patch);

    let untracked_output = git_core::run_git_command_bytes(
        &worktree_root,
        &["ls-files", "--others", "--exclude-standard", "-z"],
    )
    .await?;
    for raw_path in untracked_output.split(|byte| *byte == 0) {
        if raw_path.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(raw_path).to_string();
        let diff = git_core::run_git_diff(
            &worktree_root,
            &[
                "diff",
                "--binary",
                "--no-color",
                "--no-index",
                "--",
                worktree_core::null_device_path(),
                &path,
            ],
        )
        .await?;
        patch.extend_from_slice(&diff);
    }

    if String::from_utf8_lossy(&patch).trim().is_empty() {
        return Err("No changes to apply.".to_string());
    }

    let git_bin =
        crate::utils::resolve_git_binary().map_err(|e| format!("Failed to run git: {e}"))?;
    let mut child = tokio_command(git_bin)
        .args(["apply", "--3way", "--whitespace=nowarn", "-"])
        .current_dir(&parent_root)
        .env("PATH", crate::utils::git_env_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .spawn()
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if let Some(mut stdin) = child.stdin.take() {
        stdin
            .write_all(&patch)
            .await
            .map_err(|e| format!("Failed to write git apply input: {e}"))?;
    }

    let output = child
        .wait_with_output()
        .await
        .map_err(|e| format!("Failed to run git: {e}"))?;

    if output.status.success() {
        return Ok(());
    }

    let stderr = String::from_utf8_lossy(&output.stderr);
    let stdout = String::from_utf8_lossy(&output.stdout);
    let detail = if stderr.trim().is_empty() {
        stdout.trim()
    } else {
        stderr.trim()
    };
    if detail.is_empty() {
        return Err("Git apply failed.".to_string());
    }

    if detail.contains("Applied patch to") {
        if detail.contains("with conflicts") {
            return Err(
                "Applied with conflicts. Resolve conflicts in the parent repo before retrying."
                    .to_string(),
            );
        }
        return Err(
            "Patch applied partially. Resolve changes in the parent repo before retrying."
                .to_string(),
        );
    }

    Err(detail.to_string())
}

pub(crate) async fn open_workspace_in_core(
    path: String,
    app: Option<String>,
    args: Vec<String>,
    command: Option<String>,
) -> Result<(), String> {
    fn output_snippet(bytes: &[u8]) -> Option<String> {
        const MAX_CHARS: usize = 240;
        let text = String::from_utf8_lossy(bytes).trim().replace('\n', "\\n");
        if text.is_empty() {
            return None;
        }
        let mut chars = text.chars();
        let snippet: String = chars.by_ref().take(MAX_CHARS).collect();
        if chars.next().is_some() {
            Some(format!("{snippet}..."))
        } else {
            Some(snippet)
        }
    }

    let target_label = command
        .as_ref()
        .map(|value| format!("command `{value}`"))
        .or_else(|| app.as_ref().map(|value| format!("app `{value}`")))
        .unwrap_or_else(|| "target".to_string());

    let output = if let Some(command) = command {
        let trimmed = command.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }

        #[cfg(target_os = "windows")]
        let mut cmd = {
            let resolved = resolve_windows_executable(trimmed, None);
            let resolved_path = resolved.as_deref().unwrap_or_else(|| Path::new(trimmed));
            let ext = resolved_path
                .extension()
                .and_then(|ext| ext.to_str())
                .map(|ext| ext.to_ascii_lowercase());

            if matches!(ext.as_deref(), Some("cmd") | Some("bat")) {
                let mut cmd = tokio_command("cmd");
                let mut command_args = args.clone();
                command_args.push(path.clone());
                let command_line = build_cmd_c_command(resolved_path, &command_args)?;
                cmd.arg("/D");
                cmd.arg("/S");
                cmd.arg("/C");
                cmd.raw_arg(command_line);
                cmd
            } else {
                let mut cmd = tokio_command(resolved_path);
                cmd.args(&args).arg(&path);
                cmd
            }
        };

        #[cfg(not(target_os = "windows"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&args).arg(&path);
            cmd
        };

        cmd.output()
            .await
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else if let Some(app) = app {
        let trimmed = app.trim();
        if trimmed.is_empty() {
            return Err("Missing app or command".to_string());
        }

        #[cfg(target_os = "macos")]
        let mut cmd = {
            let mut cmd = tokio_command("open");
            cmd.arg("-a").arg(trimmed).arg(&path);
            if !args.is_empty() {
                cmd.arg("--args").args(&args);
            }
            cmd
        };

        #[cfg(not(target_os = "macos"))]
        let mut cmd = {
            let mut cmd = tokio_command(trimmed);
            cmd.args(&args).arg(&path);
            cmd
        };

        cmd.output()
            .await
            .map_err(|error| format!("Failed to open app ({target_label}): {error}"))?
    } else {
        return Err("Missing app or command".to_string());
    };

    if output.status.success() {
        return Ok(());
    }

    let exit_detail = output
        .status
        .code()
        .map(|code| format!("exit code {code}"))
        .unwrap_or_else(|| "terminated by signal".to_string());
    let mut details = Vec::new();
    if let Some(stderr) = output_snippet(&output.stderr) {
        details.push(format!("stderr: {stderr}"));
    }
    if let Some(stdout) = output_snippet(&output.stdout) {
        details.push(format!("stdout: {stdout}"));
    }

    if details.is_empty() {
        Err(format!(
            "Failed to open app ({target_label} returned {exit_detail})."
        ))
    } else {
        Err(format!(
            "Failed to open app ({target_label} returned {exit_detail}; {}).",
            details.join("; ")
        ))
    }
}

#[cfg(target_os = "macos")]
pub(crate) async fn get_open_app_icon_core<F>(
    app_name: String,
    icon_loader: F,
) -> Result<Option<String>, String>
where
    F: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let trimmed = app_name.trim().to_string();
    if trimmed.is_empty() {
        return Ok(None);
    }
    let icon_loader = Arc::new(icon_loader);
    tokio::task::spawn_blocking(move || icon_loader(&trimmed))
        .await
        .map_err(|err| err.to_string())
}

#[cfg(not(target_os = "macos"))]
pub(crate) async fn get_open_app_icon_core<F>(
    app_name: String,
    icon_loader: F,
) -> Result<Option<String>, String>
where
    F: Fn(&str) -> Option<String> + Send + Sync + 'static,
{
    let _ = app_name;
    let _ = icon_loader;
    Ok(None)
}

pub(crate) fn run_git_command_unit<F, Fut>(
    repo_path: &PathBuf,
    args: &[&str],
    run_git_command: F,
) -> impl Future<Output = Result<(), String>>
where
    F: Fn(PathBuf, Vec<String>) -> Fut,
    Fut: Future<Output = Result<String, String>>,
{
    // Own the inputs so the returned future does not borrow temporary references.
    let repo_path = repo_path.clone();
    let args_owned = args
        .iter()
        .map(|value| value.to_string())
        .collect::<Vec<_>>();
    async move {
        run_git_command(repo_path, args_owned)
            .await
            .map(|_output| ())
    }
}

pub(crate) async fn add_worktree_core<
    FSpawn,
    FutSpawn,
    FSanitize,
    FUniquePath,
    FBranchExists,
    FutBranchExists,
    FFindRemoteTracking,
    FutFindRemoteTracking,
    FRunGit,
    FutRunGit,
>(
    parent_id: String,
    branch: String,
    name: Option<String>,
    copy_agents_md: bool,
    data_dir: &PathBuf,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    sanitize_worktree_name: FSanitize,
    unique_worktree_path: FUniquePath,
    git_branch_exists: FBranchExists,
    git_find_remote_tracking_branch: Option<FFindRemoteTracking>,
    run_git_command: FRunGit,
    spawn_session: FSpawn,
) -> Result<WorkspaceInfo, String>
where
    FSpawn: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> FutSpawn,
    FutSpawn: Future<Output = Result<Arc<WorkspaceSession>, String>>,
    FSanitize: Fn(&str) -> String,
    FUniquePath: Fn(&PathBuf, &str) -> Result<PathBuf, String>,
    FBranchExists: Fn(&PathBuf, &str) -> FutBranchExists,
    FutBranchExists: Future<Output = Result<bool, String>>,
    FFindRemoteTracking: Fn(&PathBuf, &str) -> FutFindRemoteTracking,
    FutFindRemoteTracking: Future<Output = Result<Option<String>, String>>,
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
{
    let branch = branch.trim().to_string();
    if branch.is_empty() {
        return Err("Branch name is required.".to_string());
    }
    let name = name
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty());

    let parent_entry = {
        let workspaces = workspaces.lock().await;
        workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "parent workspace not found".to_string())?
    };

    if parent_entry.kind.is_worktree() {
        return Err("Cannot create a worktree from another worktree.".to_string());
    }

    let worktree_root = data_dir.join("worktrees").join(&parent_entry.id);
    std::fs::create_dir_all(&worktree_root)
        .map_err(|err| format!("Failed to create worktree directory: {err}"))?;

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
    } else if let Some(find_remote_tracking) = git_find_remote_tracking_branch {
        if let Some(remote_ref) = find_remote_tracking(&repo_path, &branch).await? {
            run_git_command(
                &repo_path,
                &[
                    "worktree",
                    "add",
                    "-b",
                    &branch,
                    &worktree_path_string,
                    &remote_ref,
                ],
            )
            .await?;
        } else {
            run_git_command(
                &repo_path,
                &["worktree", "add", "-b", &branch, &worktree_path_string],
            )
            .await?;
        }
    } else {
        run_git_command(
            &repo_path,
            &["worktree", "add", "-b", &branch, &worktree_path_string],
        )
        .await?;
    }

    if copy_agents_md {
        if let Err(error) = copy_agents_md_from_parent_to_worktree(&repo_path, &worktree_path) {
            eprintln!(
                "add_worktree: optional {} copy failed for {}: {}",
                AGENTS_MD_FILE_NAME,
                worktree_path.display(),
                error
            );
        }
    }

    let entry = WorkspaceEntry {
        id: Uuid::new_v4().to_string(),
        name: name.clone().unwrap_or_else(|| branch.clone()),
        path: worktree_path_string,
        codex_bin: parent_entry.codex_bin.clone(),
        kind: WorkspaceKind::Worktree,
        parent_id: Some(parent_entry.id.clone()),
        worktree: Some(WorktreeInfo { branch }),
        settings: WorkspaceSettings {
            worktree_setup_script: normalize_setup_script(
                parent_entry.settings.worktree_setup_script.clone(),
            ),
            ..WorkspaceSettings::default()
        },
    };

    let (default_bin, codex_args) = {
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, Some(&parent_entry), Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, Some(&parent_entry));
    let session = spawn_session(entry.clone(), default_bin, codex_args, codex_home).await?;

    {
        let mut workspaces = workspaces.lock().await;
        workspaces.insert(entry.id.clone(), entry.clone());
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)?;
    }

    sessions.lock().await.insert(entry.id.clone(), session);

    Ok(WorkspaceInfo {
        id: entry.id,
        name: entry.name,
        path: entry.path,
        codex_bin: entry.codex_bin,
        connected: true,
        kind: entry.kind,
        parent_id: entry.parent_id,
        worktree: entry.worktree,
        settings: entry.settings,
    })
}

pub(crate) async fn connect_workspace_core<F, Fut>(
    workspace_id: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    spawn_session: F,
) -> Result<(), String>
where
    F: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> Fut,
    Fut: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
    let (entry, parent_entry) = resolve_entry_and_parent(workspaces, &workspace_id).await?;
    let (default_bin, codex_args) = {
        let settings = app_settings.lock().await;
        (
            settings.codex_bin.clone(),
            resolve_workspace_codex_args(&entry, parent_entry.as_ref(), Some(&settings)),
        )
    };
    let codex_home = resolve_workspace_codex_home(&entry, parent_entry.as_ref());
    let session = spawn_session(entry.clone(), default_bin, codex_args, codex_home).await?;
    sessions.lock().await.insert(entry.id, session);
    Ok(())
}

async fn kill_session_by_id(sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>, id: &str) {
    if let Some(session) = sessions.lock().await.remove(id) {
        let mut child = session.child.lock().await;
        kill_child_process_tree(&mut child).await;
    }
}

pub(crate) async fn remove_workspace_core<FRunGit, FutRunGit, FIsMissing, FRemoveDirAll>(
    id: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: &PathBuf,
    run_git_command: FRunGit,
    is_missing_worktree_error: FIsMissing,
    remove_dir_all: FRemoveDirAll,
    require_all_children_removed_to_remove_parent: bool,
    continue_on_child_error: bool,
) -> Result<(), String>
where
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
    FIsMissing: Fn(&str) -> bool,
    FRemoveDirAll: Fn(&PathBuf) -> Result<(), String>,
{
    let (entry, child_worktrees) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
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
    let mut failures: Vec<(String, String)> = Vec::new();

    for child in &child_worktrees {
        kill_session_by_id(sessions, &child.id).await;

        let child_path = PathBuf::from(&child.path);
        if child_path.exists() {
            if let Err(error) =
                run_git_command(&repo_path, &["worktree", "remove", "--force", &child.path]).await
            {
                if is_missing_worktree_error(&error) {
                    if child_path.exists() {
                        if let Err(fs_error) = remove_dir_all(&child_path) {
                            if continue_on_child_error {
                                failures.push((child.id.clone(), fs_error));
                                continue;
                            }
                            return Err(fs_error);
                        }
                    }
                } else {
                    if continue_on_child_error {
                        failures.push((child.id.clone(), error));
                        continue;
                    }
                    return Err(error);
                }
            }
        }
        removed_child_ids.push(child.id.clone());
    }

    let _ = run_git_command(&repo_path, &["worktree", "prune", "--expire", "now"]).await;

    let mut ids_to_remove = removed_child_ids;
    if failures.is_empty() || !require_all_children_removed_to_remove_parent {
        kill_session_by_id(sessions, &id).await;
        ids_to_remove.push(id.clone());
    }

    {
        let mut workspaces = workspaces.lock().await;
        for workspace_id in ids_to_remove {
            workspaces.remove(&workspace_id);
        }
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)?;
    }

    if failures.is_empty() {
        return Ok(());
    }

    if require_all_children_removed_to_remove_parent {
        let mut message =
            "Failed to remove one or more worktrees; parent workspace was not removed.".to_string();
        for (child_id, error) in failures {
            message.push_str(&format!("\n- {child_id}: {error}"));
        }
        return Err(message);
    }

    Ok(())
}

pub(crate) async fn remove_worktree_core<FRunGit, FutRunGit, FIsMissing, FRemoveDirAll>(
    id: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: &PathBuf,
    run_git_command: FRunGit,
    is_missing_worktree_error: FIsMissing,
    remove_dir_all: FRemoveDirAll,
) -> Result<(), String>
where
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
    FIsMissing: Fn(&str) -> bool,
    FRemoveDirAll: Fn(&PathBuf) -> Result<(), String>,
{
    let (entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    let parent_path = PathBuf::from(&parent.path);
    let entry_path = PathBuf::from(&entry.path);
    kill_session_by_id(sessions, &entry.id).await;

    if entry_path.exists() {
        if let Err(error) = run_git_command(
            &parent_path,
            &["worktree", "remove", "--force", &entry.path],
        )
        .await
        {
            if is_missing_worktree_error(&error) {
                if entry_path.exists() {
                    remove_dir_all(&entry_path)?;
                }
            } else {
                return Err(error);
            }
        }
    }
    let _ = run_git_command(&parent_path, &["worktree", "prune", "--expire", "now"]).await;

    {
        let mut workspaces = workspaces.lock().await;
        workspaces.remove(&entry.id);
        let list: Vec<_> = workspaces.values().cloned().collect();
        write_workspaces(storage_path, &list)?;
    }

    Ok(())
}

pub(crate) async fn rename_worktree_core<
    FSpawn,
    FutSpawn,
    FResolveGitRoot,
    FUniqueBranch,
    FutUniqueBranch,
    FSanitize,
    FUniqueRenamePath,
    FRunGit,
    FutRunGit,
>(
    id: String,
    branch: String,
    data_dir: &PathBuf,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    resolve_git_root: FResolveGitRoot,
    unique_branch_name: FUniqueBranch,
    sanitize_worktree_name: FSanitize,
    unique_worktree_path_for_rename: FUniqueRenamePath,
    run_git_command: FRunGit,
    spawn_session: FSpawn,
) -> Result<WorkspaceInfo, String>
where
    FSpawn: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> FutSpawn,
    FutSpawn: Future<Output = Result<Arc<WorkspaceSession>, String>>,
    FResolveGitRoot: Fn(&WorkspaceEntry) -> Result<PathBuf, String>,
    FUniqueBranch: Fn(&PathBuf, &str) -> FutUniqueBranch,
    FutUniqueBranch: Future<Output = Result<String, String>>,
    FSanitize: Fn(&str) -> String,
    FUniqueRenamePath: Fn(&PathBuf, &str, &PathBuf) -> Result<PathBuf, String>,
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
{
    let trimmed = branch.trim();
    if trimmed.is_empty() {
        return Err("Branch name is required.".to_string());
    }

    let (entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    let old_branch = entry
        .worktree
        .as_ref()
        .map(|worktree| worktree.branch.clone())
        .ok_or_else(|| "worktree metadata missing".to_string())?;
    if old_branch == trimmed {
        return Err("Branch name is unchanged.".to_string());
    }

    let parent_root = resolve_git_root(&parent)?;
    let final_branch = unique_branch_name(&parent_root, trimmed).await?;
    if final_branch == old_branch {
        return Err("Branch name is unchanged.".to_string());
    }

    run_git_command(&parent_root, &["branch", "-m", &old_branch, &final_branch]).await?;

    let worktree_root = data_dir.join("worktrees").join(&parent.id);
    std::fs::create_dir_all(&worktree_root)
        .map_err(|err| format!("Failed to create worktree directory: {err}"))?;

    let safe_name = sanitize_worktree_name(&final_branch);
    let current_path = PathBuf::from(&entry.path);
    let next_path = unique_worktree_path_for_rename(&worktree_root, &safe_name, &current_path)?;
    let next_path_string = next_path.to_string_lossy().to_string();
    if next_path_string != entry.path {
        if let Err(error) = run_git_command(
            &parent_root,
            &["worktree", "move", &entry.path, &next_path_string],
        )
        .await
        {
            let _ =
                run_git_command(&parent_root, &["branch", "-m", &final_branch, &old_branch]).await;
            return Err(error);
        }
    }

    let (entry_snapshot, list) = {
        let mut workspaces = workspaces.lock().await;
        let entry = match workspaces.get_mut(&id) {
            Some(entry) => entry,
            None => return Err("workspace not found".to_string()),
        };
        if entry.name.trim() == old_branch {
            entry.name = final_branch.clone();
        }
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
    write_workspaces(storage_path, &list)?;

    let was_connected = sessions.lock().await.contains_key(&entry_snapshot.id);
    if was_connected {
        kill_session_by_id(sessions, &entry_snapshot.id).await;
        let (default_bin, codex_args) = {
            let settings = app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(&entry_snapshot, Some(&parent), Some(&settings)),
            )
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, Some(&parent));
        match spawn_session(entry_snapshot.clone(), default_bin, codex_args, codex_home).await {
            Ok(session) => {
                sessions
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

    let connected = sessions.lock().await.contains_key(&entry_snapshot.id);
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        kind: entry_snapshot.kind,
        parent_id: entry_snapshot.parent_id,
        worktree: entry_snapshot.worktree,
        settings: entry_snapshot.settings,
    })
}

pub(crate) async fn rename_worktree_upstream_core<
    FResolveGitRoot,
    FBranchExists,
    FutBranchExists,
    FFindRemote,
    FutFindRemote,
    FRemoteExists,
    FutRemoteExists,
    FRemoteBranchExists,
    FutRemoteBranchExists,
    FRunGit,
    FutRunGit,
>(
    id: String,
    old_branch: String,
    new_branch: String,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    resolve_git_root: FResolveGitRoot,
    git_branch_exists: FBranchExists,
    git_find_remote_for_branch: FFindRemote,
    git_remote_exists: FRemoteExists,
    git_remote_branch_exists: FRemoteBranchExists,
    run_git_command: FRunGit,
) -> Result<(), String>
where
    FResolveGitRoot: Fn(&WorkspaceEntry) -> Result<PathBuf, String>,
    FBranchExists: Fn(&PathBuf, &str) -> FutBranchExists,
    FutBranchExists: Future<Output = Result<bool, String>>,
    FFindRemote: Fn(&PathBuf, &str) -> FutFindRemote,
    FutFindRemote: Future<Output = Result<Option<String>, String>>,
    FRemoteExists: Fn(&PathBuf, &str) -> FutRemoteExists,
    FutRemoteExists: Future<Output = Result<bool, String>>,
    FRemoteBranchExists: Fn(&PathBuf, &str, &str) -> FutRemoteBranchExists,
    FutRemoteBranchExists: Future<Output = Result<bool, String>>,
    FRunGit: Fn(&PathBuf, &[&str]) -> FutRunGit,
    FutRunGit: Future<Output = Result<(), String>>,
{
    let old_branch = old_branch.trim().to_string();
    let new_branch = new_branch.trim().to_string();
    if old_branch.is_empty() || new_branch.is_empty() {
        return Err("Branch name is required.".to_string());
    }
    if old_branch == new_branch {
        return Err("Branch name is unchanged.".to_string());
    }

    let (_entry, parent) = {
        let workspaces = workspaces.lock().await;
        let entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        if !entry.kind.is_worktree() {
            return Err("Not a worktree workspace.".to_string());
        }
        let parent_id = entry
            .parent_id
            .clone()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        let parent = workspaces
            .get(&parent_id)
            .cloned()
            .ok_or_else(|| "worktree parent not found".to_string())?;
        (entry, parent)
    };

    let parent_root = resolve_git_root(&parent)?;
    if !git_branch_exists(&parent_root, &new_branch).await? {
        return Err("Local branch not found.".to_string());
    }

    let remote_for_old = git_find_remote_for_branch(&parent_root, &old_branch).await?;
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

    if git_remote_branch_exists(&parent_root, &remote_name, &new_branch).await? {
        return Err("Remote branch already exists.".to_string());
    }

    if remote_for_old.is_some() {
        run_git_command(
            &parent_root,
            &["push", &remote_name, &format!("{new_branch}:{new_branch}")],
        )
        .await?;
        run_git_command(
            &parent_root,
            &["push", &remote_name, &format!(":{old_branch}")],
        )
        .await?;
    } else {
        run_git_command(&parent_root, &["push", &remote_name, &new_branch]).await?;
    }

    run_git_command(
        &parent_root,
        &[
            "branch",
            "--set-upstream-to",
            &format!("{remote_name}/{new_branch}"),
            &new_branch,
        ],
    )
    .await?;

    Ok(())
}

pub(crate) async fn update_workspace_settings_core<FApplySettings, FSpawn, FutSpawn>(
    id: String,
    mut settings: WorkspaceSettings,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    app_settings: &Mutex<AppSettings>,
    storage_path: &PathBuf,
    apply_settings_update: FApplySettings,
    spawn_session: FSpawn,
) -> Result<WorkspaceInfo, String>
where
    FApplySettings: Fn(
        &mut HashMap<String, WorkspaceEntry>,
        &str,
        WorkspaceSettings,
    ) -> Result<WorkspaceEntry, String>,
    FSpawn: Fn(WorkspaceEntry, Option<String>, Option<String>, Option<PathBuf>) -> FutSpawn,
    FutSpawn: Future<Output = Result<Arc<WorkspaceSession>, String>>,
{
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
        let mut workspaces = workspaces.lock().await;
        let previous_entry = workspaces
            .get(&id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?;
        let previous_codex_home = previous_entry.settings.codex_home.clone();
        let previous_codex_args = previous_entry.settings.codex_args.clone();
        let previous_worktree_setup_script = previous_entry.settings.worktree_setup_script.clone();
        let entry_snapshot = apply_settings_update(&mut workspaces, &id, settings)?;
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
    let connected = sessions.lock().await.contains_key(&id);
    if connected && (codex_home_changed || codex_args_changed) {
        let rollback_entry = previous_entry.clone();
        let (default_bin, codex_args) = {
            let settings = app_settings.lock().await;
            (
                settings.codex_bin.clone(),
                resolve_workspace_codex_args(
                    &entry_snapshot,
                    parent_entry.as_ref(),
                    Some(&settings),
                ),
            )
        };
        let codex_home = resolve_workspace_codex_home(&entry_snapshot, parent_entry.as_ref());
        let new_session = match spawn_session(
            entry_snapshot.clone(),
            default_bin,
            codex_args,
            codex_home,
        )
        .await
        {
            Ok(session) => session,
            Err(error) => {
                let mut workspaces = workspaces.lock().await;
                workspaces.insert(rollback_entry.id.clone(), rollback_entry);
                return Err(error);
            }
        };
        if let Some(old_session) = sessions
            .lock()
            .await
            .insert(entry_snapshot.id.clone(), new_session)
        {
            let mut child = old_session.child.lock().await;
            kill_child_process_tree(&mut child).await;
        }
    }
    if codex_home_changed || codex_args_changed {
        let app_settings_snapshot = app_settings.lock().await.clone();
        let default_bin = app_settings_snapshot.codex_bin.clone();
        for child in &child_entries {
            let connected = sessions.lock().await.contains_key(&child.id);
            if !connected {
                continue;
            }
            let previous_child_home = resolve_workspace_codex_home(child, Some(&previous_entry));
            let next_child_home = resolve_workspace_codex_home(child, Some(&entry_snapshot));
            let previous_child_args = resolve_workspace_codex_args(
                child,
                Some(&previous_entry),
                Some(&app_settings_snapshot),
            );
            let next_child_args = resolve_workspace_codex_args(
                child,
                Some(&entry_snapshot),
                Some(&app_settings_snapshot),
            );
            if previous_child_home == next_child_home && previous_child_args == next_child_args {
                continue;
            }
            let new_session = match spawn_session(
                child.clone(),
                default_bin.clone(),
                next_child_args,
                next_child_home,
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
            if let Some(old_session) = sessions.lock().await.insert(child.id.clone(), new_session) {
                let mut child = old_session.child.lock().await;
                kill_child_process_tree(&mut child).await;
            }
        }
    }
    if worktree_setup_script_changed && !entry_snapshot.kind.is_worktree() {
        let child_ids = child_entries
            .iter()
            .map(|child| child.id.clone())
            .collect::<Vec<_>>();
        if !child_ids.is_empty() {
            let mut workspaces = workspaces.lock().await;
            for child_id in child_ids {
                if let Some(child) = workspaces.get_mut(&child_id) {
                    child.settings.worktree_setup_script =
                        entry_snapshot.settings.worktree_setup_script.clone();
                }
            }
        }
    }
    let list: Vec<_> = {
        let workspaces = workspaces.lock().await;
        workspaces.values().cloned().collect()
    };
    write_workspaces(storage_path, &list)?;
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        kind: entry_snapshot.kind,
        parent_id: entry_snapshot.parent_id,
        worktree: entry_snapshot.worktree,
        settings: entry_snapshot.settings,
    })
}

pub(crate) async fn update_workspace_codex_bin_core(
    id: String,
    codex_bin: Option<String>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    sessions: &Mutex<HashMap<String, Arc<WorkspaceSession>>>,
    storage_path: &PathBuf,
) -> Result<WorkspaceInfo, String> {
    let (entry_snapshot, list) = {
        let mut workspaces = workspaces.lock().await;
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
    write_workspaces(storage_path, &list)?;

    let connected = sessions.lock().await.contains_key(&id);
    Ok(WorkspaceInfo {
        id: entry_snapshot.id,
        name: entry_snapshot.name,
        path: entry_snapshot.path,
        codex_bin: entry_snapshot.codex_bin,
        connected,
        kind: entry_snapshot.kind,
        parent_id: entry_snapshot.parent_id,
        worktree: entry_snapshot.worktree,
        settings: entry_snapshot.settings,
    })
}

pub(crate) async fn list_workspace_files_core<F>(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    list_files: F,
) -> Result<Vec<String>, String>
where
    F: Fn(&PathBuf) -> Vec<String>,
{
    let root = resolve_workspace_root(workspaces, workspace_id).await?;
    Ok(list_files(&root))
}

pub(crate) async fn read_workspace_file_core<F, T>(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
    path: &str,
    read_file: F,
) -> Result<T, String>
where
    F: Fn(&PathBuf, &str) -> Result<T, String>,
{
    let root = resolve_workspace_root(workspaces, workspace_id).await?;
    read_file(&root, path)
}

fn sort_workspaces(workspaces: &mut [WorkspaceInfo]) {
    workspaces.sort_by(|a, b| {
        let a_order = a.settings.sort_order.unwrap_or(u32::MAX);
        let b_order = b.settings.sort_order.unwrap_or(u32::MAX);
        if a_order != b_order {
            return a_order.cmp(&b_order);
        }
        a.name.cmp(&b.name).then_with(|| a.id.cmp(&b.id))
    });
}

#[cfg(test)]
mod tests {
    use super::copy_agents_md_from_parent_to_worktree;
    use super::AGENTS_MD_FILE_NAME;
    use uuid::Uuid;

    fn make_temp_dir() -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("codex-monitor-{}", Uuid::new_v4()));
        std::fs::create_dir_all(&dir).expect("failed to create temp dir");
        dir
    }

    #[test]
    fn copies_agents_md_when_missing_in_worktree() {
        let parent = make_temp_dir();
        let worktree = make_temp_dir();
        let parent_agents = parent.join(AGENTS_MD_FILE_NAME);
        let worktree_agents = worktree.join(AGENTS_MD_FILE_NAME);

        std::fs::write(&parent_agents, "parent").expect("failed to write parent AGENTS.md");

        copy_agents_md_from_parent_to_worktree(&parent, &worktree).expect("copy should succeed");

        let copied = std::fs::read_to_string(&worktree_agents)
            .expect("worktree AGENTS.md should exist after copy");
        assert_eq!(copied, "parent");

        let _ = std::fs::remove_dir_all(parent);
        let _ = std::fs::remove_dir_all(worktree);
    }

    #[test]
    fn does_not_overwrite_existing_worktree_agents_md() {
        let parent = make_temp_dir();
        let worktree = make_temp_dir();
        let parent_agents = parent.join(AGENTS_MD_FILE_NAME);
        let worktree_agents = worktree.join(AGENTS_MD_FILE_NAME);

        std::fs::write(&parent_agents, "parent").expect("failed to write parent AGENTS.md");
        std::fs::write(&worktree_agents, "branch-specific")
            .expect("failed to write worktree AGENTS.md");

        copy_agents_md_from_parent_to_worktree(&parent, &worktree).expect("copy should succeed");

        let retained = std::fs::read_to_string(&worktree_agents)
            .expect("worktree AGENTS.md should still exist");
        assert_eq!(retained, "branch-specific");

        let _ = std::fs::remove_dir_all(parent);
        let _ = std::fs::remove_dir_all(worktree);
    }
}
