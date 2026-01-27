use std::fs::File;
use std::io::Read;
use std::path::PathBuf;

use serde::{Deserialize, Serialize};

const AGENT_MD_FILENAME: &str = "AGENTS.md";

#[derive(Serialize, Deserialize, Clone)]
pub(crate) struct AgentMdResponse {
    pub exists: bool,
    pub content: String,
    pub truncated: bool,
}

fn canonical_root(root: &PathBuf) -> Result<PathBuf, String> {
    root.canonicalize()
        .map_err(|err| format!("Failed to resolve workspace root: {err}"))
}

fn agent_md_path(root: &PathBuf) -> Result<PathBuf, String> {
    let canonical_root = canonical_root(root)?;
    Ok(canonical_root.join(AGENT_MD_FILENAME))
}

pub(crate) fn read_agent_md_inner(root: &PathBuf) -> Result<AgentMdResponse, String> {
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

pub(crate) fn write_agent_md_inner(root: &PathBuf, content: &str) -> Result<(), String> {
    let canonical_root = canonical_root(root)?;
    let path = agent_md_path(root)?;
    if !path.starts_with(&canonical_root) {
        return Err("Invalid file path".to_string());
    }

    let target_path = if path.exists() {
        let canonical_path = path
            .canonicalize()
            .map_err(|err| format!("Failed to resolve AGENTS.md: {err}"))?;
        if !canonical_path.starts_with(&canonical_root) {
            return Err("Invalid file path".to_string());
        }
        canonical_path
    } else {
        path
    };

    std::fs::write(&target_path, content)
        .map_err(|err| format!("Failed to write AGENTS.md: {err}"))
}
