use std::collections::HashMap;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};
use tokio::sync::Mutex;

use crate::types::WorkspaceEntry;

const PROFILES_DIR: &str = "profiles";
const AGENTS_MD: &str = "AGENTS.md";
const CLAUDE_MD: &str = "CLAUDE.md";
const PROFILE_STATE_FILE: &str = ".agent-profile-state.json";

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AgentProfileApplyMode {
    Auto,
    Symlink,
    Copy,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub(crate) enum AgentProfileWriteMode {
    Symlink,
    Copy,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentProfile {
    pub(crate) name: String,
    pub(crate) label: String,
    pub(crate) has_agents: bool,
    pub(crate) has_claude: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentProfileListResponse {
    pub(crate) profiles: Vec<AgentProfile>,
    pub(crate) active_profile: Option<String>,
    pub(crate) target_file: String,
    pub(crate) active_mode: Option<AgentProfileWriteMode>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub(crate) struct AgentProfileApplyResponse {
    pub(crate) active_profile: String,
    pub(crate) target_file: String,
    pub(crate) active_mode: AgentProfileWriteMode,
    pub(crate) fallback_used: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct AgentProfileState {
    profile: String,
    target_file: String,
    active_mode: AgentProfileWriteMode,
}

fn selected_target_file(cli_type: &str) -> &'static str {
    if cli_type == "claude" {
        CLAUDE_MD
    } else {
        AGENTS_MD
    }
}

fn profile_label(name: &str) -> String {
    name.split(['-', '_', ' '])
        .filter(|part| !part.is_empty())
        .map(|part| {
            let mut chars = part.chars();
            match chars.next() {
                Some(first) => {
                    let mut out = String::new();
                    out.extend(first.to_uppercase());
                    out.push_str(chars.as_str());
                    out
                }
                None => String::new(),
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

async fn resolve_workspace_root(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: &str,
) -> Result<PathBuf, String> {
    let workspaces = workspaces.lock().await;
    let entry = workspaces
        .get(workspace_id)
        .ok_or_else(|| "workspace not found".to_string())?;
    Ok(PathBuf::from(&entry.path))
}

fn profile_source(workspace_root: &Path, profile: &str, target_file: &str) -> PathBuf {
    workspace_root
        .join(PROFILES_DIR)
        .join(profile)
        .join(target_file)
}

fn list_profiles(workspace_root: &Path) -> Result<Vec<AgentProfile>, String> {
    let profiles_root = workspace_root.join(PROFILES_DIR);
    if !profiles_root.exists() {
        return Ok(Vec::new());
    }
    let entries = std::fs::read_dir(&profiles_root)
        .map_err(|err| format!("Failed to read profiles directory: {err}"))?;
    let mut profiles = Vec::new();
    for entry in entries {
        let entry = entry.map_err(|err| format!("Failed to inspect profiles directory: {err}"))?;
        if !entry
            .file_type()
            .map_err(|err| format!("Failed to inspect profile directory: {err}"))?
            .is_dir()
        {
            continue;
        }
        let name = entry.file_name().to_string_lossy().to_string();
        let dir = entry.path();
        let has_agents = dir.join(AGENTS_MD).is_file();
        let has_claude = dir.join(CLAUDE_MD).is_file();
        if !has_agents && !has_claude {
            continue;
        }
        profiles.push(AgentProfile {
            label: profile_label(&name),
            name,
            has_agents,
            has_claude,
        });
    }
    profiles.sort_by(|a, b| a.name.cmp(&b.name));
    Ok(profiles)
}

fn read_profile_state(workspace_root: &Path) -> Option<AgentProfileState> {
    let state_path = workspace_root.join(PROFILE_STATE_FILE);
    let data = std::fs::read_to_string(state_path).ok()?;
    serde_json::from_str(&data).ok()
}

fn write_profile_state(
    workspace_root: &Path,
    profile: &str,
    target_file: &str,
    active_mode: AgentProfileWriteMode,
) -> Result<(), String> {
    let state = AgentProfileState {
        profile: profile.to_string(),
        target_file: target_file.to_string(),
        active_mode,
    };
    let data = serde_json::to_string_pretty(&state)
        .map_err(|err| format!("Failed to serialize profile state: {err}"))?;
    let state_path = workspace_root.join(PROFILE_STATE_FILE);
    std::fs::write(state_path, data).map_err(|err| format!("Failed to persist profile state: {err}"))
}

fn remove_existing_target(target_path: &Path) -> Result<(), String> {
    if !target_path.exists() && std::fs::symlink_metadata(target_path).is_err() {
        return Ok(());
    }
    let metadata = std::fs::symlink_metadata(target_path)
        .map_err(|err| format!("Failed to inspect target file: {err}"))?;
    if metadata.file_type().is_dir() {
        return Err("Target path is a directory; refusing to overwrite".to_string());
    }
    std::fs::remove_file(target_path).map_err(|err| format!("Failed to clear target file: {err}"))
}

#[cfg(unix)]
fn create_symlink(link_target: &Path, destination: &Path) -> Result<(), String> {
    std::os::unix::fs::symlink(link_target, destination)
        .map_err(|err| format!("Failed to create symlink: {err}"))
}

#[cfg(windows)]
fn create_symlink(link_target: &Path, destination: &Path) -> Result<(), String> {
    std::os::windows::fs::symlink_file(link_target, destination)
        .map_err(|err| format!("Failed to create symlink: {err}"))
}

fn apply_copy_mode(source: &Path, target: &Path) -> Result<(), String> {
    remove_existing_target(target)?;
    std::fs::copy(source, target)
        .map(|_| ())
        .map_err(|err| format!("Failed to copy profile file: {err}"))
}

fn apply_symlink_mode(workspace_root: &Path, source: &Path, target: &Path) -> Result<(), String> {
    remove_existing_target(target)?;
    let relative_target = source
        .strip_prefix(workspace_root)
        .map_err(|_| "Failed to build profile symlink path".to_string())?;
    create_symlink(relative_target, target)
}

fn detect_active_symlink_profile(
    workspace_root: &Path,
    target_file: &str,
    profiles: &[AgentProfile],
) -> Option<String> {
    let target_path = workspace_root.join(target_file);
    let metadata = std::fs::symlink_metadata(&target_path).ok()?;
    if !metadata.file_type().is_symlink() {
        return None;
    }
    let link_target = std::fs::read_link(&target_path).ok()?;
    let resolved_target = if link_target.is_absolute() {
        link_target
    } else {
        workspace_root.join(link_target)
    };
    let canonical_target = resolved_target.canonicalize().ok()?;
    profiles.iter().find_map(|profile| {
        let source = profile_source(workspace_root, &profile.name, target_file);
        let canonical_source = source.canonicalize().ok()?;
        if canonical_source == canonical_target {
            Some(profile.name.clone())
        } else {
            None
        }
    })
}

fn detect_active_copy_profile(
    workspace_root: &Path,
    target_file: &str,
    state: Option<&AgentProfileState>,
) -> Option<String> {
    let state = state?;
    if state.active_mode != AgentProfileWriteMode::Copy || state.target_file != target_file {
        return None;
    }
    let target_content = std::fs::read(workspace_root.join(target_file)).ok()?;
    let source_content = std::fs::read(profile_source(workspace_root, &state.profile, target_file)).ok()?;
    if target_content == source_content {
        Some(state.profile.clone())
    } else {
        None
    }
}

pub(crate) async fn list_agent_profiles_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    cli_type: &str,
) -> Result<AgentProfileListResponse, String> {
    let workspace_root = resolve_workspace_root(workspaces, &workspace_id).await?;
    let target_file = selected_target_file(cli_type).to_string();
    let profiles = list_profiles(&workspace_root)?;
    let active_profile = detect_active_symlink_profile(&workspace_root, &target_file, &profiles)
        .or_else(|| {
            let state = read_profile_state(&workspace_root);
            detect_active_copy_profile(&workspace_root, &target_file, state.as_ref())
        });
    let active_mode = active_profile.as_ref().and_then(|profile_name| {
        let state = read_profile_state(&workspace_root)?;
        if state.profile == *profile_name && state.target_file == target_file {
            Some(state.active_mode)
        } else {
            None
        }
    });

    Ok(AgentProfileListResponse {
        profiles,
        active_profile,
        target_file,
        active_mode,
    })
}

pub(crate) async fn apply_agent_profile_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
    profile: String,
    cli_type: &str,
    mode: AgentProfileApplyMode,
) -> Result<AgentProfileApplyResponse, String> {
    let workspace_root = resolve_workspace_root(workspaces, &workspace_id).await?;
    let target_file = selected_target_file(cli_type).to_string();
    let source = profile_source(&workspace_root, &profile, &target_file);
    if !source.is_file() {
        return Err(format!(
            "Profile `{profile}` does not provide {target_file}. Add `{}/{target_file}` \
in that profile or switch CLI mode.",
            PROFILES_DIR
        ));
    }
    let target = workspace_root.join(&target_file);

    let mut fallback_used = false;
    let active_mode = match mode {
        AgentProfileApplyMode::Copy => {
            apply_copy_mode(&source, &target)?;
            AgentProfileWriteMode::Copy
        }
        AgentProfileApplyMode::Symlink => {
            apply_symlink_mode(&workspace_root, &source, &target)?;
            AgentProfileWriteMode::Symlink
        }
        AgentProfileApplyMode::Auto => match apply_symlink_mode(&workspace_root, &source, &target) {
            Ok(()) => AgentProfileWriteMode::Symlink,
            Err(_) => {
                apply_copy_mode(&source, &target)?;
                fallback_used = true;
                AgentProfileWriteMode::Copy
            }
        },
    };

    write_profile_state(&workspace_root, &profile, &target_file, active_mode)?;
    Ok(AgentProfileApplyResponse {
        active_profile: profile,
        target_file,
        active_mode,
        fallback_used,
    })
}
