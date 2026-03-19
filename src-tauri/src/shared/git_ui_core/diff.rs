use std::collections::{HashMap, HashSet};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use std::process::Stdio;

use base64::{engine::general_purpose::STANDARD, Engine as _};
use git2::{DiffOptions, Repository, Status, StatusOptions};
use serde_json::{json, Value};
use tokio::sync::Mutex;

use crate::git_utils::{
    diff_patch_to_string, diff_stats_for_path, image_mime_type, resolve_git_root,
};
use crate::shared::process_core::std_command;
use crate::types::{
    AppSettings, GitCommitDiff, GitFileDiff, GitFileDisplayHunk, GitFileStatus, WorkspaceEntry,
};
use crate::utils::{git_env_path, normalize_git_path, resolve_git_binary};

use super::commands::{parse_zero_context_patch, parsed_patch_hunk_id, ParsedPatchHunk};
use super::context::workspace_entry_for_id;

const INDEX_SKIP_WORKTREE_FLAG: u16 = 0x4000;
const MAX_IMAGE_BYTES: usize = 10 * 1024 * 1024;
const MAX_TEXT_DIFF_BYTES: usize = 2 * 1024 * 1024;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum ParsedDisplayLineType {
    Add,
    Del,
    Context,
    Hunk,
    Meta,
}

#[derive(Debug, Clone)]
struct ParsedDisplayLine {
    line_type: ParsedDisplayLineType,
    old_line: Option<usize>,
    new_line: Option<usize>,
}

#[derive(Debug, Clone)]
struct ParsedDisplaySegment {
    lines: Vec<(usize, ParsedDisplayLine)>,
}

#[derive(Debug, Clone, Copy)]
struct DisplayLineRange {
    start: usize,
    end: usize,
}

#[derive(Debug, Clone, Copy)]
struct DisplayMatchRange {
    old_range: Option<DisplayLineRange>,
    new_range: Option<DisplayLineRange>,
}

fn encode_image_base64(data: &[u8]) -> Option<String> {
    if data.len() > MAX_IMAGE_BYTES {
        return None;
    }
    Some(STANDARD.encode(data))
}

fn blob_to_base64(blob: git2::Blob) -> Option<String> {
    if blob.size() > MAX_IMAGE_BYTES {
        return None;
    }
    encode_image_base64(blob.content())
}

fn read_image_base64(path: &Path) -> Option<String> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_IMAGE_BYTES as u64 {
        return None;
    }
    let data = fs::read(path).ok()?;
    encode_image_base64(&data)
}

fn bytes_look_binary(bytes: &[u8]) -> bool {
    bytes.iter().take(8192).any(|byte| *byte == 0)
}

fn split_lines_preserving_newlines(content: &str) -> Vec<String> {
    if content.is_empty() {
        return Vec::new();
    }
    content
        .split_inclusive('\n')
        .map(ToString::to_string)
        .collect()
}

fn blob_to_lines(blob: git2::Blob<'_>) -> Option<Vec<String>> {
    if blob.size() > MAX_TEXT_DIFF_BYTES || blob.is_binary() {
        return None;
    }
    let content = String::from_utf8_lossy(blob.content());
    Some(split_lines_preserving_newlines(content.as_ref()))
}

fn read_text_lines(path: &Path) -> Option<Vec<String>> {
    let metadata = fs::metadata(path).ok()?;
    if metadata.len() > MAX_TEXT_DIFF_BYTES as u64 {
        return None;
    }
    let data = fs::read(path).ok()?;
    if bytes_look_binary(&data) {
        return None;
    }
    let content = String::from_utf8_lossy(&data);
    Some(split_lines_preserving_newlines(content.as_ref()))
}

fn status_for_index(status: Status) -> Option<&'static str> {
    if status.contains(Status::INDEX_NEW) {
        Some("A")
    } else if status.contains(Status::INDEX_MODIFIED) {
        Some("M")
    } else if status.contains(Status::INDEX_DELETED) {
        Some("D")
    } else if status.contains(Status::INDEX_RENAMED) {
        Some("R")
    } else if status.contains(Status::INDEX_TYPECHANGE) {
        Some("T")
    } else {
        None
    }
}

fn status_for_workdir(status: Status) -> Option<&'static str> {
    if status.contains(Status::WT_NEW) {
        Some("A")
    } else if status.contains(Status::WT_MODIFIED) {
        Some("M")
    } else if status.contains(Status::WT_DELETED) {
        Some("D")
    } else if status.contains(Status::WT_RENAMED) {
        Some("R")
    } else if status.contains(Status::WT_TYPECHANGE) {
        Some("T")
    } else {
        None
    }
}

fn status_for_delta(status: git2::Delta) -> &'static str {
    match status {
        git2::Delta::Added => "A",
        git2::Delta::Modified => "M",
        git2::Delta::Deleted => "D",
        git2::Delta::Renamed => "R",
        git2::Delta::Typechange => "T",
        _ => "M",
    }
}

fn unstaged_diff_paths_with_git(repo_root: &Path, paths: &[String]) -> Option<HashSet<String>> {
    if paths.is_empty() {
        return Some(HashSet::new());
    }

    const MAX_PATHS_PER_BATCH: usize = 200;
    let git_bin = resolve_git_binary().ok()?;
    let mut changed_paths = HashSet::new();

    for batch in paths.chunks(MAX_PATHS_PER_BATCH) {
        let mut args = vec!["diff", "--no-color", "--name-only", "-z", "--"];
        args.extend(batch.iter().map(String::as_str));

        let output = std_command(&git_bin)
            .args(args)
            .current_dir(repo_root)
            .env("PATH", git_env_path())
            .output()
            .ok()?;
        if !(output.status.success() || output.status.code() == Some(1)) {
            return None;
        }

        for raw_path in output.stdout.split(|byte| *byte == 0) {
            if raw_path.is_empty() {
                continue;
            }
            let path = String::from_utf8_lossy(raw_path);
            changed_paths.insert(normalize_git_path(path.as_ref()));
        }
    }

    Some(changed_paths)
}

fn source_diff_for_path(
    repo_root: &Path,
    path: &str,
    cached: bool,
    ignore_whitespace_changes: bool,
) -> Option<String> {
    let git_bin = resolve_git_binary().ok()?;
    let mut args = vec!["diff"];
    if cached {
        args.push("--cached");
    }
    args.push("--no-color");
    args.push("-U0");
    if ignore_whitespace_changes {
        args.push("-w");
    }
    args.push("--");
    args.push(path);

    let output = std_command(git_bin)
        .args(args)
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .output()
        .ok()?;
    if !(output.status.success() || output.status.code() == Some(1)) {
        return None;
    }

    Some(String::from_utf8_lossy(&output.stdout).to_string())
}

fn parse_display_diff(diff: &str) -> Vec<ParsedDisplayLine> {
    let mut parsed = Vec::new();
    let mut old_line = 0usize;
    let mut new_line = 0usize;
    let mut in_hunk = false;

    for raw_line in diff.split('\n') {
        if let Some((old_start, _, new_start, _)) = super::commands::parse_hunk_header(raw_line) {
            old_line = old_start;
            new_line = new_start;
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Hunk,
                old_line: None,
                new_line: None,
            });
            in_hunk = true;
            continue;
        }

        if !in_hunk {
            continue;
        }

        if raw_line.starts_with('+') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Add,
                old_line: None,
                new_line: Some(new_line),
            });
            new_line += 1;
            continue;
        }

        if raw_line.starts_with('-') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Del,
                old_line: Some(old_line),
                new_line: None,
            });
            old_line += 1;
            continue;
        }

        if raw_line.starts_with(' ') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Context,
                old_line: Some(old_line),
                new_line: Some(new_line),
            });
            old_line += 1;
            new_line += 1;
            continue;
        }

        if raw_line.starts_with('\\') {
            parsed.push(ParsedDisplayLine {
                line_type: ParsedDisplayLineType::Meta,
                old_line: None,
                new_line: None,
            });
        }
    }

    parsed
}

fn build_display_segments(parsed_lines: &[ParsedDisplayLine]) -> Vec<ParsedDisplaySegment> {
    let mut segments = Vec::new();
    let mut current: Vec<(usize, ParsedDisplayLine)> = Vec::new();

    for (index, line) in parsed_lines.iter().cloned().enumerate() {
        match line.line_type {
            ParsedDisplayLineType::Add | ParsedDisplayLineType::Del => current.push((index, line)),
            _ => {
                if !current.is_empty() {
                    segments.push(ParsedDisplaySegment { lines: current });
                    current = Vec::new();
                }
            }
        }
    }

    if !current.is_empty() {
        segments.push(ParsedDisplaySegment { lines: current });
    }

    segments
}

fn hunk_old_end(hunk: &ParsedPatchHunk) -> Option<usize> {
    if hunk.old_count == 0 {
        None
    } else {
        Some(hunk.old_start + hunk.old_count - 1)
    }
}

fn hunk_new_end(hunk: &ParsedPatchHunk) -> Option<usize> {
    if hunk.new_count == 0 {
        None
    } else {
        Some(hunk.new_start + hunk.new_count - 1)
    }
}

fn map_old_to_new_line_clamped(hunks: &[ParsedPatchHunk], old_line: usize) -> usize {
    let mut delta = 0isize;

    for hunk in hunks {
        if hunk.old_count == 0 {
            if old_line < hunk.old_start {
                break;
            }
            delta += hunk.new_count as isize;
            continue;
        }

        let old_end = hunk.old_start + hunk.old_count - 1;
        if old_line < hunk.old_start {
            break;
        }
        if old_line <= old_end {
            if hunk.new_count == 0 {
                return hunk.new_start;
            }
            let relative = old_line - hunk.old_start;
            return hunk.new_start + relative.min(hunk.new_count - 1);
        }

        delta += hunk.new_count as isize - hunk.old_count as isize;
    }

    ((old_line as isize) + delta).max(1) as usize
}

fn map_new_to_old_line_clamped(hunks: &[ParsedPatchHunk], new_line: usize) -> usize {
    let mut delta = 0isize;

    for hunk in hunks {
        if hunk.new_count == 0 {
            let insertion_point = hunk.new_start;
            if new_line < insertion_point {
                break;
            }
            delta -= hunk.old_count as isize;
            continue;
        }

        let new_end = hunk.new_start + hunk.new_count - 1;
        if new_line < hunk.new_start {
            break;
        }
        if new_line <= new_end {
            if hunk.old_count == 0 {
                return hunk.old_start;
            }
            let relative = new_line - hunk.new_start;
            return hunk.old_start + relative.min(hunk.old_count - 1);
        }

        delta += hunk.old_count as isize - hunk.new_count as isize;
    }

    ((new_line as isize) + delta).max(1) as usize
}

fn display_match_range_for_staged_hunk(
    hunk: &ParsedPatchHunk,
    unstaged_hunks: &[ParsedPatchHunk],
) -> DisplayMatchRange {
    DisplayMatchRange {
        old_range: hunk_old_end(hunk).map(|end| DisplayLineRange {
            start: hunk.old_start,
            end,
        }),
        new_range: hunk_new_end(hunk).map(|end| DisplayLineRange {
            start: map_old_to_new_line_clamped(unstaged_hunks, hunk.new_start),
            end: map_old_to_new_line_clamped(unstaged_hunks, end),
        }),
    }
}

fn display_match_range_for_unstaged_hunk(
    hunk: &ParsedPatchHunk,
    staged_hunks: &[ParsedPatchHunk],
) -> DisplayMatchRange {
    DisplayMatchRange {
        old_range: hunk_old_end(hunk).map(|end| DisplayLineRange {
            start: map_new_to_old_line_clamped(staged_hunks, hunk.old_start),
            end: map_new_to_old_line_clamped(staged_hunks, end),
        }),
        new_range: hunk_new_end(hunk).map(|end| DisplayLineRange {
            start: hunk.new_start,
            end,
        }),
    }
}

fn range_contains(range: DisplayLineRange, line_number: Option<usize>) -> bool {
    matches!(line_number, Some(line_number) if line_number >= range.start && line_number <= range.end)
}

fn source_hunk_line_counts(hunk: &ParsedPatchHunk) -> (usize, usize) {
    hunk.lines.iter().fold((0usize, 0usize), |(adds, dels), line| {
        if line.line_type == super::commands::SelectionLineType::Add {
            (adds + 1, dels)
        } else {
            (adds, dels + 1)
        }
    })
}

fn find_display_hunk_span(
    segments: &[ParsedDisplaySegment],
    min_start_index: usize,
    display_range: DisplayMatchRange,
    expected_add_count: usize,
    expected_del_count: usize,
) -> Option<(usize, usize, usize)> {
    for segment in segments {
        let mut matched_indices = Vec::new();
        let mut add_count = 0usize;
        let mut del_count = 0usize;

        for (display_index, line) in &segment.lines {
            if *display_index < min_start_index {
                continue;
            }
            match line.line_type {
                ParsedDisplayLineType::Add => {
                    if display_range
                        .new_range
                        .is_some_and(|range| range_contains(range, line.new_line))
                    {
                        matched_indices.push(*display_index);
                        add_count += 1;
                    }
                }
                ParsedDisplayLineType::Del => {
                    if display_range
                        .old_range
                        .is_some_and(|range| range_contains(range, line.old_line))
                    {
                        matched_indices.push(*display_index);
                        del_count += 1;
                    }
                }
                _ => {}
            }
        }

        if add_count == expected_add_count && del_count == expected_del_count {
            let start = matched_indices.first().copied()?;
            let end = matched_indices.last().copied()?;
            return Some((start, end, matched_indices.len()));
        }
    }

    None
}

fn parse_source_hunks(diff: Option<&str>) -> Vec<ParsedPatchHunk> {
    diff.and_then(|diff| {
        if diff.trim().is_empty() {
            None
        } else {
            parse_zero_context_patch(diff).ok()
        }
    })
    .map(|parsed| parsed.hunks)
    .unwrap_or_default()
}

fn build_display_hunks(
    diff: &str,
    staged_diff: Option<&str>,
    unstaged_diff: Option<&str>,
) -> Vec<GitFileDisplayHunk> {
    let parsed_display_lines = parse_display_diff(diff);
    if parsed_display_lines.is_empty() {
        return Vec::new();
    }
    let display_segments = build_display_segments(&parsed_display_lines);
    if display_segments.is_empty() {
        return Vec::new();
    }

    let staged_hunks = parse_source_hunks(staged_diff);
    let unstaged_hunks = parse_source_hunks(unstaged_diff);
    let mut display_hunks = Vec::new();

    let mut staged_min_start_index = 0usize;
    for hunk in &staged_hunks {
        let display_range = display_match_range_for_staged_hunk(hunk, &unstaged_hunks);
        let (expected_add_count, expected_del_count) = source_hunk_line_counts(hunk);
        let Some((start, end, line_count)) = find_display_hunk_span(
            &display_segments,
            staged_min_start_index,
            display_range,
            expected_add_count,
            expected_del_count,
        ) else {
            continue;
        };
        staged_min_start_index = end.saturating_add(1);
        display_hunks.push(GitFileDisplayHunk {
            id: parsed_patch_hunk_id("staged", hunk),
            source: "staged".to_string(),
            action: "unstage".to_string(),
            start_display_line_index: start,
            end_display_line_index: end,
            line_count,
        });
    }

    let mut unstaged_min_start_index = 0usize;
    for hunk in &unstaged_hunks {
        let display_range = display_match_range_for_unstaged_hunk(hunk, &staged_hunks);
        let (expected_add_count, expected_del_count) = source_hunk_line_counts(hunk);
        let Some((start, end, line_count)) = find_display_hunk_span(
            &display_segments,
            unstaged_min_start_index,
            display_range,
            expected_add_count,
            expected_del_count,
        ) else {
            continue;
        };
        unstaged_min_start_index = end.saturating_add(1);
        display_hunks.push(GitFileDisplayHunk {
            id: parsed_patch_hunk_id("unstaged", hunk),
            source: "unstaged".to_string(),
            action: "stage".to_string(),
            start_display_line_index: start,
            end_display_line_index: end,
            line_count,
        });
    }

    display_hunks.sort_by(|left, right| {
        left.start_display_line_index
            .cmp(&right.start_display_line_index)
            .then(left.end_display_line_index.cmp(&right.end_display_line_index))
            .then(left.action.cmp(&right.action))
            .then(left.id.cmp(&right.id))
    });

    display_hunks
}

#[cfg(test)]
mod display_hunk_tests {
    use super::build_display_hunks;

    #[test]
    fn build_display_hunks_preserves_file_order_for_mixed_disjoint_hunks() {
        let diff =
            "@@ -1,2 +1,4 @@\n line one\n+new staged line\n line two\n+new unstaged line";
        let staged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 1111111..2222222 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -1,0 +2,1 @@\n",
            "+new staged line\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 2222222..3333333 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -3,0 +4,1 @@\n",
            "+new unstaged line\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].id, "staged:1:0:2:1");
        assert_eq!(display_hunks[0].start_display_line_index, 2);
        assert_eq!(display_hunks[0].end_display_line_index, 2);
        assert_eq!(display_hunks[1].id, "unstaged:3:0:4:1");
        assert_eq!(display_hunks[1].start_display_line_index, 4);
        assert_eq!(display_hunks[1].end_display_line_index, 4);
    }

    #[test]
    fn build_display_hunks_supports_overlapping_staged_and_unstaged_spans() {
        let diff = "@@ -1,1 +1,1 @@\n-old value\n+newer value";
        let staged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 1111111..2222222 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -1,1 +1,1 @@\n",
            "-old value\n",
            "+new value\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/src/main.ts b/src/main.ts\n",
            "index 2222222..3333333 100644\n",
            "--- a/src/main.ts\n",
            "+++ b/src/main.ts\n",
            "@@ -1,1 +1,1 @@\n",
            "-new value\n",
            "+newer value\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].start_display_line_index, 1);
        assert_eq!(display_hunks[0].end_display_line_index, 2);
        assert_eq!(display_hunks[1].start_display_line_index, 1);
        assert_eq!(display_hunks[1].end_display_line_index, 2);
    }

    #[test]
    fn build_display_hunks_maps_staged_and_unstaged_insertions_in_file_order() {
        let diff = concat!(
            "@@ -29,6 +29,17 @@ pub(crate) struct GitSelectionApplyResult {\n",
            "     pub(crate) warning: Option<String>,\n",
            " }\n",
            " \n",
            "+#[derive(Debug, Serialize, Deserialize, Clone)]\n",
            "+#[serde(rename_all = \"camelCase\")]\n",
            "+pub(crate) struct GitFileDisplayHunk {\n",
            "+    pub(crate) id: String,\n",
            "+    pub(crate) source: String,\n",
            "+    pub(crate) action: String,\n",
            "+    pub(crate) start_display_line_index: usize,\n",
            "+    pub(crate) end_display_line_index: usize,\n",
            "+    pub(crate) line_count: usize,\n",
            "+}\n",
            "+\n",
            " #[derive(Debug, Serialize, Deserialize, Clone)]\n",
            " pub(crate) struct GitFileDiff {\n",
            "     pub(crate) path: String,\n",
            "@@ -37,6 +48,8 @@ pub(crate) struct GitFileDiff {\n",
            "     pub(crate) staged_diff: Option<String>,\n",
            "     #[serde(default, rename = \"unstagedDiff\")]\n",
            "     pub(crate) unstaged_diff: Option<String>,\n",
            "+    #[serde(default, rename = \"displayHunks\")]\n",
            "+    pub(crate) display_hunks: Vec<GitFileDisplayHunk>,\n",
            "     #[serde(default, rename = \"oldLines\")]\n",
            "     pub(crate) old_lines: Option<Vec<String>>,\n",
            "     #[serde(default, rename = \"newLines\")]\n"
        );
        let staged_diff = concat!(
            "diff --git a/src-tauri/src/types.rs b/src-tauri/src/types.rs\n",
            "index dfcfa92..1277207 100644\n",
            "--- a/src-tauri/src/types.rs\n",
            "+++ b/src-tauri/src/types.rs\n",
            "@@ -31,0 +32,11 @@ pub(crate) struct GitSelectionApplyResult {\n",
            "+#[derive(Debug, Serialize, Deserialize, Clone)]\n",
            "+#[serde(rename_all = \"camelCase\")]\n",
            "+pub(crate) struct GitFileDisplayHunk {\n",
            "+    pub(crate) id: String,\n",
            "+    pub(crate) source: String,\n",
            "+    pub(crate) action: String,\n",
            "+    pub(crate) start_display_line_index: usize,\n",
            "+    pub(crate) end_display_line_index: usize,\n",
            "+    pub(crate) line_count: usize,\n",
            "+}\n",
            "+\n"
        );
        let unstaged_diff = concat!(
            "diff --git a/src-tauri/src/types.rs b/src-tauri/src/types.rs\n",
            "index 1277207..4d7914e 100644\n",
            "--- a/src-tauri/src/types.rs\n",
            "+++ b/src-tauri/src/types.rs\n",
            "@@ -50,0 +51,2 @@ pub(crate) struct GitFileDiff {\n",
            "+    #[serde(default, rename = \"displayHunks\")]\n",
            "+    pub(crate) display_hunks: Vec<GitFileDisplayHunk>,\n"
        );

        let display_hunks = build_display_hunks(diff, Some(staged_diff), Some(unstaged_diff));

        assert_eq!(display_hunks.len(), 2);
        assert_eq!(display_hunks[0].id, "staged:31:0:32:11");
        assert_eq!(display_hunks[0].source, "staged");
        assert_eq!(display_hunks[0].action, "unstage");
        assert_eq!(display_hunks[0].line_count, 11);
        assert!(display_hunks[0].start_display_line_index <= display_hunks[0].end_display_line_index);

        assert_eq!(display_hunks[1].id, "unstaged:50:0:51:2");
        assert_eq!(display_hunks[1].source, "unstaged");
        assert_eq!(display_hunks[1].action, "stage");
        assert_eq!(display_hunks[1].line_count, 2);
        assert!(display_hunks[1].start_display_line_index <= display_hunks[1].end_display_line_index);

        assert!(display_hunks[0].start_display_line_index < display_hunks[1].start_display_line_index);
    }
}

fn has_ignored_parent_directory(repo: &Repository, path: &Path) -> bool {
    let mut current = path.parent();
    while let Some(parent) = current {
        if parent.as_os_str().is_empty() {
            break;
        }
        let probe = parent.join(".codexmonitor-ignore-probe");
        if repo.status_should_ignore(&probe).unwrap_or(false) {
            return true;
        }
        current = parent.parent();
    }
    false
}

pub(super) fn collect_ignored_paths_with_git(
    repo: &Repository,
    paths: &[PathBuf],
) -> Option<HashSet<PathBuf>> {
    if paths.is_empty() {
        return Some(HashSet::new());
    }

    let repo_root = repo.workdir()?;
    let git_bin = resolve_git_binary().ok()?;
    let mut child = std_command(git_bin)
        .arg("check-ignore")
        .arg("--stdin")
        .arg("-z")
        .current_dir(repo_root)
        .env("PATH", git_env_path())
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;

    let mut stdout = child.stdout.take()?;
    let stdout_thread = std::thread::spawn(move || {
        let mut buffer = Vec::new();
        stdout.read_to_end(&mut buffer).ok()?;
        Some(buffer)
    });

    let wrote_all_input = {
        let mut wrote_all = true;
        if let Some(mut stdin) = child.stdin.take() {
            for path in paths {
                if stdin
                    .write_all(path.as_os_str().as_encoded_bytes())
                    .is_err()
                {
                    wrote_all = false;
                    break;
                }
                if stdin.write_all(&[0]).is_err() {
                    wrote_all = false;
                    break;
                }
            }
        } else {
            wrote_all = false;
        }
        wrote_all
    };

    if !wrote_all_input {
        let _ = child.kill();
        let _ = child.wait();
        let _ = stdout_thread.join();
        return None;
    }

    let status = child.wait().ok()?;
    let stdout = stdout_thread.join().ok().flatten()?;
    match status.code() {
        Some(0) | Some(1) => {}
        _ => return None,
    }

    let mut ignored_paths = HashSet::new();
    for raw in stdout.split(|byte| *byte == 0) {
        if raw.is_empty() {
            continue;
        }
        let path = String::from_utf8_lossy(raw);
        ignored_paths.insert(PathBuf::from(path.as_ref()));
    }
    Some(ignored_paths)
}

pub(super) fn check_ignore_with_git(repo: &Repository, path: &Path) -> Option<bool> {
    let ignored_paths = collect_ignored_paths_with_git(repo, &[path.to_path_buf()])?;
    Some(ignored_paths.contains(path))
}

fn is_tracked_path(repo: &Repository, path: &Path) -> bool {
    if let Ok(index) = repo.index() {
        if index.get_path(path, 0).is_some() {
            return true;
        }
    }
    if let Ok(head) = repo.head() {
        if let Ok(tree) = head.peel_to_tree() {
            if tree.get_path(path).is_ok() {
                return true;
            }
        }
    }
    false
}

pub(super) fn should_skip_ignored_path_with_cache(
    repo: &Repository,
    path: &Path,
    ignored_paths: Option<&HashSet<PathBuf>>,
) -> bool {
    if is_tracked_path(repo, path) {
        return false;
    }
    if let Some(ignored_paths) = ignored_paths {
        return ignored_paths.contains(path);
    }
    if let Some(ignored) = check_ignore_with_git(repo, path) {
        return ignored;
    }
    // Fallback when git check-ignore is unavailable.
    repo.status_should_ignore(path).unwrap_or(false) || has_ignored_parent_directory(repo, path)
}

fn build_combined_diff(repo: &Repository, diff: &git2::Diff) -> String {
    let diff_entries: Vec<(usize, PathBuf)> = diff
        .deltas()
        .enumerate()
        .filter_map(|(index, delta)| {
            delta
                .new_file()
                .path()
                .or_else(|| delta.old_file().path())
                .map(|path| (index, path.to_path_buf()))
        })
        .collect();
    let diff_paths: Vec<PathBuf> = diff_entries.iter().map(|(_, path)| path.clone()).collect();
    let ignored_paths = collect_ignored_paths_with_git(repo, &diff_paths);

    let mut combined_diff = String::new();
    for (index, path) in diff_entries {
        if should_skip_ignored_path_with_cache(repo, &path, ignored_paths.as_ref()) {
            continue;
        }
        let patch = match git2::Patch::from_diff(diff, index) {
            Ok(patch) => patch,
            Err(_) => continue,
        };
        let Some(mut patch) = patch else {
            continue;
        };
        let content = match diff_patch_to_string(&mut patch) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if content.trim().is_empty() {
            continue;
        }
        if !combined_diff.is_empty() {
            combined_diff.push_str("\n\n");
        }
        combined_diff.push_str(&format!("=== {} ===\n", path.display()));
        combined_diff.push_str(&content);
    }
    combined_diff
}

pub(super) fn collect_workspace_diff(repo_root: &Path) -> Result<String, String> {
    let repo = Repository::open(repo_root).map_err(|e| e.to_string())?;
    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

    let mut options = DiffOptions::new();
    let index = repo.index().map_err(|e| e.to_string())?;
    let diff = match head_tree.as_ref() {
        Some(tree) => repo
            .diff_tree_to_index(Some(tree), Some(&index), Some(&mut options))
            .map_err(|e| e.to_string())?,
        None => repo
            .diff_tree_to_index(None, Some(&index), Some(&mut options))
            .map_err(|e| e.to_string())?,
    };
    let combined_diff = build_combined_diff(&repo, &diff);
    if !combined_diff.trim().is_empty() {
        return Ok(combined_diff);
    }

    let mut options = DiffOptions::new();
    options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .show_untracked_content(true);
    let diff = match head_tree.as_ref() {
        Some(tree) => repo
            .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
            .map_err(|e| e.to_string())?,
        None => repo
            .diff_tree_to_workdir_with_index(None, Some(&mut options))
            .map_err(|e| e.to_string())?,
    };
    Ok(build_combined_diff(&repo, &diff))
}

pub(super) async fn get_git_status_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    workspace_id: String,
) -> Result<Value, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;

    let branch_name = repo
        .head()
        .ok()
        .and_then(|head| head.shorthand().map(|s| s.to_string()))
        .unwrap_or_else(|| "unknown".to_string());

    let mut status_options = StatusOptions::new();
    status_options
        .include_untracked(true)
        .recurse_untracked_dirs(true)
        .renames_head_to_index(true)
        .renames_index_to_workdir(true)
        .include_ignored(false);

    let statuses = repo
        .statuses(Some(&mut status_options))
        .map_err(|e| e.to_string())?;
    let status_paths: Vec<PathBuf> = statuses
        .iter()
        .filter_map(|entry| entry.path().map(PathBuf::from))
        .filter(|path| !path.as_os_str().is_empty())
        .collect();
    let normalized_status_paths: Vec<String> = status_paths
        .iter()
        .map(|path| normalize_git_path(path.to_string_lossy().as_ref()))
        .collect();
    let ignored_paths = collect_ignored_paths_with_git(&repo, &status_paths);
    let unstaged_diff_paths = unstaged_diff_paths_with_git(&repo_root, &normalized_status_paths);

    let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());
    let index = repo.index().ok();

    let mut files = Vec::new();
    let mut staged_files = Vec::new();
    let mut unstaged_files = Vec::new();
    let mut total_additions = 0i64;
    let mut total_deletions = 0i64;
    for entry in statuses.iter() {
        let path = entry.path().unwrap_or("");
        if path.is_empty() {
            continue;
        }
        if should_skip_ignored_path_with_cache(&repo, Path::new(path), ignored_paths.as_ref()) {
            continue;
        }
        if let Some(index) = index.as_ref() {
            if let Some(entry) = index.get_path(Path::new(path), 0) {
                if entry.flags_extended & INDEX_SKIP_WORKTREE_FLAG != 0 {
                    continue;
                }
            }
        }
        let status = entry.status();
        let normalized_path = normalize_git_path(path);
        let include_index = status.intersects(
            Status::INDEX_NEW
                | Status::INDEX_MODIFIED
                | Status::INDEX_DELETED
                | Status::INDEX_RENAMED
                | Status::INDEX_TYPECHANGE,
        );
        let mut include_workdir = status.intersects(
            Status::WT_NEW
                | Status::WT_MODIFIED
                | Status::WT_DELETED
                | Status::WT_RENAMED
                | Status::WT_TYPECHANGE,
        );

        // When the index is updated externally (for example via line-level staging),
        // libgit2 can briefly report both staged and workdir status for a path.
        // Verify actual unstaged diff content before keeping the workdir bucket.
        if include_index && include_workdir {
            if let Some(unstaged_diff_paths) = unstaged_diff_paths.as_ref() {
                include_workdir = unstaged_diff_paths.contains(&normalized_path);
            }
        }
        let mut combined_additions = 0i64;
        let mut combined_deletions = 0i64;

        if include_index {
            let (additions, deletions) =
                diff_stats_for_path(&repo, head_tree.as_ref(), path, true, false).unwrap_or((0, 0));
            if let Some(status_str) = status_for_index(status) {
                staged_files.push(GitFileStatus {
                    path: normalized_path.clone(),
                    status: status_str.to_string(),
                    additions,
                    deletions,
                });
            }
            combined_additions += additions;
            combined_deletions += deletions;
            total_additions += additions;
            total_deletions += deletions;
        }

        if include_workdir {
            let (additions, deletions) =
                diff_stats_for_path(&repo, head_tree.as_ref(), path, false, true).unwrap_or((0, 0));
            if let Some(status_str) = status_for_workdir(status) {
                unstaged_files.push(GitFileStatus {
                    path: normalized_path.clone(),
                    status: status_str.to_string(),
                    additions,
                    deletions,
                });
            }
            combined_additions += additions;
            combined_deletions += deletions;
            total_additions += additions;
            total_deletions += deletions;
        }

        if include_index || include_workdir {
            let status_str = status_for_workdir(status)
                .or_else(|| status_for_index(status))
                .unwrap_or("--");
            files.push(GitFileStatus {
                path: normalized_path,
                status: status_str.to_string(),
                additions: combined_additions,
                deletions: combined_deletions,
            });
        }
    }

    Ok(json!({
        "branchName": branch_name,
        "files": files,
        "stagedFiles": staged_files,
        "unstagedFiles": unstaged_files,
        "totalAdditions": total_additions,
        "totalDeletions": total_deletions,
    }))
}

pub(super) async fn get_git_diffs_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
) -> Result<Vec<GitFileDiff>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;
    let repo_root = resolve_git_root(&entry)?;
    let ignore_whitespace_changes = {
        let settings = app_settings.lock().await;
        settings.git_diff_ignore_whitespace_changes
    };

    tokio::task::spawn_blocking(move || {
        let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
        let head_tree = repo.head().ok().and_then(|head| head.peel_to_tree().ok());

        let mut options = DiffOptions::new();
        options
            .include_untracked(true)
            .recurse_untracked_dirs(true)
            .show_untracked_content(true);
        options.ignore_whitespace_change(ignore_whitespace_changes);

        let diff = match head_tree.as_ref() {
            Some(tree) => repo
                .diff_tree_to_workdir_with_index(Some(tree), Some(&mut options))
                .map_err(|e| e.to_string())?,
            None => repo
                .diff_tree_to_workdir_with_index(None, Some(&mut options))
                .map_err(|e| e.to_string())?,
        };
        let diff_paths: Vec<PathBuf> = diff
            .deltas()
            .filter_map(|delta| delta.new_file().path().or_else(|| delta.old_file().path()))
            .map(PathBuf::from)
            .collect();
        let ignored_paths = collect_ignored_paths_with_git(&repo, &diff_paths);

        let mut results = Vec::new();
        for (index, delta) in diff.deltas().enumerate() {
            let old_path = delta.old_file().path();
            let new_path = delta.new_file().path();
            let display_path = new_path.or(old_path);
            let Some(display_path) = display_path else {
                continue;
            };
            if should_skip_ignored_path_with_cache(&repo, display_path, ignored_paths.as_ref()) {
                continue;
            }
            let old_path_str = old_path.map(|path| path.to_string_lossy());
            let new_path_str = new_path.map(|path| path.to_string_lossy());
            let display_path_str = display_path.to_string_lossy();
            let normalized_path = normalize_git_path(&display_path_str);
            let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
            let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
            let is_image = old_image_mime.is_some() || new_image_mime.is_some();
            let is_deleted = delta.status() == git2::Delta::Deleted;
            let is_added = delta.status() == git2::Delta::Added;
            let staged_diff = source_diff_for_path(
                &repo_root,
                normalized_path.as_str(),
                true,
                ignore_whitespace_changes,
            )
            .and_then(|diff| {
                if diff.trim().is_empty() {
                    None
                } else {
                    Some(diff)
                }
            });
            let unstaged_diff = source_diff_for_path(
                &repo_root,
                normalized_path.as_str(),
                false,
                ignore_whitespace_changes,
            )
            .and_then(|diff| {
                if diff.trim().is_empty() {
                    None
                } else {
                    Some(diff)
                }
            });

            let old_lines = if !is_added {
                head_tree
                    .as_ref()
                    .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_lines)
            } else {
                None
            };

            let new_lines = if !is_deleted {
                match new_path {
                    Some(path) => {
                        let full_path = repo_root.join(path);
                        read_text_lines(&full_path)
                    }
                    None => None,
                }
            } else {
                None
            };

            if is_image {
                let old_image_data = if !is_added && old_image_mime.is_some() {
                    head_tree
                        .as_ref()
                        .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                        .and_then(|entry| repo.find_blob(entry.id()).ok())
                        .and_then(blob_to_base64)
                } else {
                    None
                };

                let new_image_data = if !is_deleted && new_image_mime.is_some() {
                    match new_path {
                        Some(path) => {
                            let full_path = repo_root.join(path);
                            read_image_base64(&full_path)
                        }
                        None => None,
                    }
                } else {
                    None
                };

                results.push(GitFileDiff {
                    path: normalized_path,
                    diff: String::new(),
                    staged_diff,
                    unstaged_diff,
                    display_hunks: Vec::new(),
                    old_lines: None,
                    new_lines: None,
                    is_binary: true,
                    is_image: true,
                    old_image_data,
                    new_image_data,
                    old_image_mime: old_image_mime.map(str::to_string),
                    new_image_mime: new_image_mime.map(str::to_string),
                });
                continue;
            }

            let patch = match git2::Patch::from_diff(&diff, index) {
                Ok(patch) => patch,
                Err(_) => continue,
            };
            let Some(mut patch) = patch else {
                continue;
            };
            let content = match diff_patch_to_string(&mut patch) {
                Ok(content) => content,
                Err(_) => continue,
            };
            if content.trim().is_empty() {
                continue;
            }
            let display_hunks =
                build_display_hunks(&content, staged_diff.as_deref(), unstaged_diff.as_deref());
            results.push(GitFileDiff {
                path: normalized_path,
                diff: content,
                staged_diff,
                unstaged_diff,
                display_hunks,
                old_lines,
                new_lines,
                is_binary: false,
                is_image: false,
                old_image_data: None,
                new_image_data: None,
                old_image_mime: None,
                new_image_mime: None,
            });
        }

        Ok(results)
    })
    .await
    .map_err(|e| e.to_string())?
}

pub(super) async fn get_git_commit_diff_inner(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    app_settings: &Mutex<AppSettings>,
    workspace_id: String,
    sha: String,
) -> Result<Vec<GitCommitDiff>, String> {
    let entry = workspace_entry_for_id(workspaces, &workspace_id).await?;

    let ignore_whitespace_changes = {
        let settings = app_settings.lock().await;
        settings.git_diff_ignore_whitespace_changes
    };

    let repo_root = resolve_git_root(&entry)?;
    let repo = Repository::open(&repo_root).map_err(|e| e.to_string())?;
    let oid = git2::Oid::from_str(&sha).map_err(|e| e.to_string())?;
    let commit = repo.find_commit(oid).map_err(|e| e.to_string())?;
    let commit_tree = commit.tree().map_err(|e| e.to_string())?;
    let parent_tree = commit.parent(0).ok().and_then(|parent| parent.tree().ok());

    let mut options = DiffOptions::new();
    options.ignore_whitespace_change(ignore_whitespace_changes);
    let diff = repo
        .diff_tree_to_tree(parent_tree.as_ref(), Some(&commit_tree), Some(&mut options))
        .map_err(|e| e.to_string())?;

    let mut results = Vec::new();
    for (index, delta) in diff.deltas().enumerate() {
        let old_path = delta.old_file().path();
        let new_path = delta.new_file().path();
        let display_path = new_path.or(old_path);
        let Some(display_path) = display_path else {
            continue;
        };
        let old_path_str = old_path.map(|path| path.to_string_lossy());
        let new_path_str = new_path.map(|path| path.to_string_lossy());
        let display_path_str = display_path.to_string_lossy();
        let normalized_path = normalize_git_path(&display_path_str);
        let old_image_mime = old_path_str.as_deref().and_then(image_mime_type);
        let new_image_mime = new_path_str.as_deref().and_then(image_mime_type);
        let is_image = old_image_mime.is_some() || new_image_mime.is_some();
        let is_deleted = delta.status() == git2::Delta::Deleted;
        let is_added = delta.status() == git2::Delta::Added;

        let old_lines = if !is_added {
            parent_tree
                .as_ref()
                .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                .and_then(|entry| repo.find_blob(entry.id()).ok())
                .and_then(blob_to_lines)
        } else {
            None
        };

        let new_lines = if !is_deleted {
            new_path
                .and_then(|path| commit_tree.get_path(path).ok())
                .and_then(|entry| repo.find_blob(entry.id()).ok())
                .and_then(blob_to_lines)
        } else {
            None
        };

        if is_image {
            let old_image_data = if !is_added && old_image_mime.is_some() {
                parent_tree
                    .as_ref()
                    .and_then(|tree| old_path.and_then(|path| tree.get_path(path).ok()))
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_base64)
            } else {
                None
            };

            let new_image_data = if !is_deleted && new_image_mime.is_some() {
                new_path
                    .and_then(|path| commit_tree.get_path(path).ok())
                    .and_then(|entry| repo.find_blob(entry.id()).ok())
                    .and_then(blob_to_base64)
            } else {
                None
            };

            results.push(GitCommitDiff {
                path: normalized_path,
                status: status_for_delta(delta.status()).to_string(),
                diff: String::new(),
                old_lines: None,
                new_lines: None,
                is_binary: true,
                is_image: true,
                old_image_data,
                new_image_data,
                old_image_mime: old_image_mime.map(str::to_string),
                new_image_mime: new_image_mime.map(str::to_string),
            });
            continue;
        }

        let patch = match git2::Patch::from_diff(&diff, index) {
            Ok(patch) => patch,
            Err(_) => continue,
        };
        let Some(mut patch) = patch else {
            continue;
        };
        let content = match diff_patch_to_string(&mut patch) {
            Ok(content) => content,
            Err(_) => continue,
        };
        if content.trim().is_empty() {
            continue;
        }
        results.push(GitCommitDiff {
            path: normalized_path,
            status: status_for_delta(delta.status()).to_string(),
            diff: content,
            old_lines,
            new_lines,
            is_binary: false,
            is_image: false,
            old_image_data: None,
            new_image_data: None,
            old_image_mime: None,
            new_image_mime: None,
        });
    }

    Ok(results)
}
