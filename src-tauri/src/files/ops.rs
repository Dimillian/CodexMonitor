use std::path::PathBuf;

use crate::files::io::{read_text_file_within, write_text_file_within, TextFileResponse};
use crate::files::policy::FilePolicy;

pub(crate) fn read_with_policy(root: &PathBuf, policy: FilePolicy) -> Result<TextFileResponse, String> {
    read_text_file_within(
        root,
        policy.filename,
        policy.root_may_be_missing,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )
}

pub(crate) fn write_with_policy(
    root: &PathBuf,
    policy: FilePolicy,
    content: &str,
) -> Result<(), String> {
    write_text_file_within(
        root,
        policy.filename,
        content,
        policy.create_root,
        policy.root_context,
        policy.filename,
        policy.allow_external_symlink_target,
    )
}

#[cfg(test)]
mod tests {
    use std::fs;

    use uuid::Uuid;

    use crate::files::policy::{policy_for, FileKind, FileScope};

    use super::{read_with_policy, write_with_policy};

    fn temp_dir(prefix: &str) -> std::path::PathBuf {
        let dir = std::env::temp_dir().join(format!("codex-monitor-{prefix}-{}", Uuid::new_v4()));
        if dir.exists() {
            let _ = fs::remove_dir_all(&dir);
        }
        dir
    }

    #[test]
    fn workspace_agents_round_trip_requires_existing_root() {
        let root = temp_dir("workspace-agents");
        fs::create_dir_all(&root).expect("create workspace root");
        let policy = policy_for(FileScope::Workspace, FileKind::Agents).expect("policy");

        write_with_policy(&root, policy, "workspace agents").expect("write agents");
        let response = read_with_policy(&root, policy).expect("read agents");

        assert!(response.exists);
        assert_eq!(response.content, "workspace agents");
        assert!(!response.truncated);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn workspace_agents_write_fails_when_root_missing() {
        let root = temp_dir("workspace-missing-root");
        let policy = policy_for(FileScope::Workspace, FileKind::Agents).expect("policy");

        let result = write_with_policy(&root, policy, "should fail");
        assert!(result.is_err());
    }

    #[test]
    fn global_agents_write_creates_root() {
        let root = temp_dir("global-agents");
        let policy = policy_for(FileScope::Global, FileKind::Agents).expect("policy");

        let initial = read_with_policy(&root, policy).expect("initial read");
        assert!(!initial.exists);

        write_with_policy(&root, policy, "global agents").expect("write agents");
        let response = read_with_policy(&root, policy).expect("read agents");

        assert!(response.exists);
        assert_eq!(response.content, "global agents");
        assert!(!response.truncated);

        let _ = fs::remove_dir_all(&root);
    }

    #[test]
    fn global_config_write_creates_root() {
        let root = temp_dir("global-config");
        let policy = policy_for(FileScope::Global, FileKind::Config).expect("policy");

        write_with_policy(&root, policy, "[model]\nname = \"test\"\n").expect("write config");
        let response = read_with_policy(&root, policy).expect("read config");

        assert!(response.exists);
        assert!(response.content.contains("name = \"test\""));
        assert!(!response.truncated);

        let _ = fs::remove_dir_all(&root);
    }
}
