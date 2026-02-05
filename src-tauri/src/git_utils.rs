use std::collections::HashSet;
use std::path::{Path, PathBuf};

use git2::{DiffOptions, Repository, Tree};
use ignore::WalkBuilder;

use crate::types::{GitLogEntry, WorkspaceEntry};
use crate::utils::normalize_git_path;

pub(crate) fn image_mime_type(path: &str) -> Option<&'static str> {
    let ext = Path::new(path)
        .extension()
        .and_then(|value| value.to_str())?
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => Some("image/png"),
        "jpg" | "jpeg" => Some("image/jpeg"),
        "gif" => Some("image/gif"),
        "webp" => Some("image/webp"),
        "svg" => Some("image/svg+xml"),
        "bmp" => Some("image/bmp"),
        "ico" => Some("image/x-icon"),
        _ => None,
    }
}

pub(crate) fn commit_to_entry(commit: git2::Commit) -> GitLogEntry {
    let summary = commit.summary().unwrap_or("").to_string();
    let author = commit.author().name().unwrap_or("").to_string();
    let timestamp = commit.time().seconds();
    GitLogEntry {
        sha: commit.id().to_string(),
        summary,
        author,
        timestamp,
    }
}

pub(crate) fn checkout_branch(repo: &Repository, name: &str) -> Result<(), git2::Error> {
    let refname = format!("refs/heads/{name}");
    let target = repo.revparse_single(&refname)?;

    let mut options = git2::build::CheckoutBuilder::new();
    options.safe();
    repo.checkout_tree(&target, Some(&mut options))?;
    repo.set_head(&refname)?;
    Ok(())
}

pub(crate) fn diff_stats_for_path(
    repo: &Repository,
    head_tree: Option<&Tree>,
    path: &str,
    include_index: bool,
    include_workdir: bool,
) -> Result<(i64, i64), git2::Error> {
    let mut additions = 0i64;
    let mut deletions = 0i64;

    if include_index {
        let mut options = DiffOptions::new();
        options.pathspec(path).include_untracked(true);
        let diff = repo.diff_tree_to_index(head_tree, None, Some(&mut options))?;
        let stats = diff.stats()?;
        additions += stats.insertions() as i64;
        deletions += stats.deletions() as i64;
    }

    if include_workdir {
        let mut options = DiffOptions::new();
        options
            .pathspec(path)
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
        let diff = repo.diff_index_to_workdir(None, Some(&mut options))?;
        let stats = diff.stats()?;
        additions += stats.insertions() as i64;
        deletions += stats.deletions() as i64;
    }

    Ok((additions, deletions))
}

pub(crate) fn diff_patch_to_string(patch: &mut git2::Patch) -> Result<String, git2::Error> {
    let buf = patch.to_buf()?;
    Ok(buf
        .as_str()
        .map(|value| value.to_string())
        .unwrap_or_else(|| String::from_utf8_lossy(&buf).to_string()))
}

#[cfg(test)]
mod tests {
    use super::{checkout_branch, image_mime_type};
    use git2::Repository;
    use std::fs;
    use std::path::Path;

    #[test]
    fn image_mime_type_detects_known_extensions() {
        assert_eq!(image_mime_type("icon.PNG"), Some("image/png"));
        assert_eq!(image_mime_type("photo.jpeg"), Some("image/jpeg"));
        assert_eq!(image_mime_type("vector.SVG"), Some("image/svg+xml"));
        assert_eq!(image_mime_type("glyph.ico"), Some("image/x-icon"));
        assert_eq!(image_mime_type("readme.txt"), None);
    }

    #[test]
    fn checkout_branch_missing_does_not_change_head() {
        let root = std::env::temp_dir().join(format!(
            "codex-monitor-git-utils-test-{}",
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&root).expect("create temp repo root");
        let repo = Repository::init(&root).expect("init repo");

        fs::write(root.join("base.txt"), "base\n").expect("write file");
        let mut index = repo.index().expect("index");
        index.add_path(Path::new("base.txt")).expect("add path");
        let tree_id = index.write_tree().expect("write tree");
        let tree = repo.find_tree(tree_id).expect("find tree");
        let sig = git2::Signature::now("Test", "test@example.com").expect("signature");
        repo.commit(Some("HEAD"), &sig, &sig, "init", &tree, &[])
            .expect("commit");

        let before = repo.head().expect("head").name().unwrap_or("").to_string();
        assert!(checkout_branch(&repo, "does-not-exist").is_err());
        let after = repo.head().expect("head after").name().unwrap_or("").to_string();
        assert_eq!(after, before);
    }
}

pub(crate) fn parse_github_repo(remote_url: &str) -> Option<String> {
    let trimmed = remote_url.trim();
    if trimmed.is_empty() {
        return None;
    }
    let mut path = if trimmed.starts_with("git@github.com:") {
        trimmed.trim_start_matches("git@github.com:").to_string()
    } else if trimmed.starts_with("ssh://git@github.com/") {
        trimmed.trim_start_matches("ssh://git@github.com/").to_string()
    } else if let Some(index) = trimmed.find("github.com/") {
        trimmed[index + "github.com/".len()..].to_string()
    } else {
        return None;
    };
    path = path.trim_end_matches(".git").trim_end_matches('/').to_string();
    if path.is_empty() {
        None
    } else {
        Some(path)
    }
}

pub(crate) fn resolve_git_root(entry: &WorkspaceEntry) -> Result<PathBuf, String> {
    let base = PathBuf::from(&entry.path);
    let root = entry
        .settings
        .git_root
        .as_ref()
        .map(|value| value.trim())
        .filter(|value| !value.is_empty());
    let Some(root) = root else {
        return Ok(base);
    };
    let root_path = if Path::new(root).is_absolute() {
        PathBuf::from(root)
    } else {
        base.join(root)
    };
    if root_path.is_dir() {
        Ok(root_path)
    } else {
        Err(format!("Git root not found: {root}"))
    }
}

fn should_skip_dir(name: &str) -> bool {
    matches!(
        name,
        ".git" | "node_modules" | "dist" | "target" | "release-artifacts"
    )
}

pub(crate) fn list_git_roots(
    root: &Path,
    max_depth: usize,
    max_results: usize,
) -> Vec<String> {
    if !root.is_dir() {
        return Vec::new();
    }

    let mut results = Vec::new();
    let mut seen = HashSet::new();
    let max_depth = max_depth.max(1);
    let walker = WalkBuilder::new(root)
        .hidden(false)
        .follow_links(false)
        .max_depth(Some(max_depth))
        .filter_entry(|entry| {
            if entry.depth() == 0 {
                return true;
            }
            if entry.file_type().is_some_and(|ft| ft.is_dir()) {
                let name = entry.file_name().to_string_lossy();
                if should_skip_dir(&name) {
                    return false;
                }
            }
            true
        })
        .build();

    for entry in walker {
        let entry = match entry {
            Ok(entry) => entry,
            Err(_) => continue,
        };
        if !entry.file_type().is_some_and(|ft| ft.is_dir()) {
            continue;
        }
        if entry.depth() == 0 {
            continue;
        }
        let candidate = entry.path();
        let git_marker = candidate.join(".git");
        if !git_marker.is_dir() && !git_marker.is_file() {
            continue;
        }
        let rel = match candidate.strip_prefix(root) {
            Ok(rel) => rel,
            Err(_) => continue,
        };
        let normalized = normalize_git_path(&rel.to_string_lossy());
        if normalized.is_empty() || !seen.insert(normalized.clone()) {
            continue;
        }
        results.push(normalized);
        if results.len() >= max_results {
            break;
        }
    }

    results.sort();
    results
}
