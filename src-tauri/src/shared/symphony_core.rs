use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::{BufRead, BufReader as StdBufReader, Write};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use git2::Repository;
use rusqlite::{params, Connection, OptionalExtension};
use tokio::io::{AsyncBufReadExt, BufReader};
use tokio::process::{Child, Command};
use tokio::sync::Mutex;
use tokio::time::{sleep, Duration};

use crate::backend::events::EventSink;
use crate::files::io::{read_text_file_within, write_text_file_within, TextFileResponse};
use crate::shared::process_core::kill_child_process_tree;
use crate::types::{
    CreateWorkspaceTaskInput, MoveWorkspaceTaskInput, UpdateWorkspaceTaskInput, WorkspaceEntry,
    WorkspaceSymphonyEvent, WorkspaceSymphonyHealth, WorkspaceSymphonyRuntimeState,
    WorkspaceSymphonySnapshot, WorkspaceSymphonyStatus, WorkspaceTask, WorkspaceTaskEvent,
    WorkspaceTaskLiveRun, WorkspaceTaskRun, WorkspaceTaskStatus, WorkspaceTaskTelemetry,
};

#[derive(Debug)]
pub(crate) struct ManagedSymphonyRuntime {
    pub(crate) child: Arc<Mutex<Child>>,
    pub(crate) status: WorkspaceSymphonyStatus,
}

pub(crate) type SymphonyRuntimeRegistry = Mutex<HashMap<String, ManagedSymphonyRuntime>>;

const TASK_DB_NAME: &str = "tasks.db";
const WORKFLOW_FILE_NAME: &str = "WORKFLOW.codexmonitor.local.md";
const WORKFLOW_OVERRIDE_FILE_NAME: &str = "WORKFLOW.override.md";
const LOG_FILE_NAME: &str = "symphony.log";
const SYMPHONY_GUARDRAILS_ACK_FLAG: &str =
    "--i-understand-that-this-will-be-running-without-the-usual-guardrails";
const SYMPHONY_STALE_HEALTH_THRESHOLD_MS: i64 = 15_000;

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
enum WorkflowProfile {
    Generic,
    CodexMonitor,
}

pub(crate) fn automation_root_for_workspace(storage_path: &Path, workspace_id: &str) -> PathBuf {
    let data_dir = storage_path
        .parent()
        .map(Path::to_path_buf)
        .unwrap_or_else(|| PathBuf::from("."));
    data_dir.join("automation").join(workspace_id)
}

fn task_db_path(storage_path: &Path, workspace_id: &str) -> PathBuf {
    automation_root_for_workspace(storage_path, workspace_id).join(TASK_DB_NAME)
}

fn workflow_path(storage_path: &Path, workspace_id: &str) -> PathBuf {
    automation_root_for_workspace(storage_path, workspace_id).join(WORKFLOW_FILE_NAME)
}

fn log_path(storage_path: &Path, workspace_id: &str) -> PathBuf {
    automation_root_for_workspace(storage_path, workspace_id).join(LOG_FILE_NAME)
}

fn now_unix_ms() -> i64 {
    chrono::Utc::now().timestamp_millis()
}

fn derive_symphony_health(status: &WorkspaceSymphonyStatus) -> WorkspaceSymphonyHealth {
    match status.state {
        WorkspaceSymphonyRuntimeState::Error => WorkspaceSymphonyHealth::Error,
        WorkspaceSymphonyRuntimeState::Stopped => WorkspaceSymphonyHealth::Stopped,
        WorkspaceSymphonyRuntimeState::Starting => WorkspaceSymphonyHealth::Stale,
        WorkspaceSymphonyRuntimeState::Running => {
            if status.last_error.is_some() {
                return WorkspaceSymphonyHealth::Error;
            }
            let now = now_unix_ms();
            match status.last_heartbeat_at_ms {
                Some(last_heartbeat)
                    if now.saturating_sub(last_heartbeat) <= SYMPHONY_STALE_HEALTH_THRESHOLD_MS =>
                {
                    WorkspaceSymphonyHealth::Healthy
                }
                Some(_) => WorkspaceSymphonyHealth::Stale,
                None => WorkspaceSymphonyHealth::Stale,
            }
        }
    }
}

fn hydrate_runtime_status(mut status: WorkspaceSymphonyStatus) -> WorkspaceSymphonyStatus {
    status.uptime_ms = status
        .started_at_ms
        .map(|started_at_ms| now_unix_ms().saturating_sub(started_at_ms));
    status.health = derive_symphony_health(&status);
    status
}

fn automation_dir_ready(storage_path: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    let root = automation_root_for_workspace(storage_path, workspace_id);
    fs::create_dir_all(&root).map_err(|err| err.to_string())?;
    Ok(root)
}

fn open_connection(path: &Path) -> Result<Connection, String> {
    let connection = Connection::open(path).map_err(|err| err.to_string())?;
    connection
        .execute_batch(
            "
            PRAGMA journal_mode = WAL;
            CREATE TABLE IF NOT EXISTS tasks (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              title TEXT NOT NULL,
              description TEXT,
              status TEXT NOT NULL,
              order_index INTEGER NOT NULL,
              created_at_ms INTEGER NOT NULL,
              updated_at_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS task_events (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              message TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS task_runs (
              id TEXT PRIMARY KEY,
              task_id TEXT NOT NULL,
              workspace_id TEXT NOT NULL,
              thread_id TEXT,
              worktree_workspace_id TEXT,
              branch_name TEXT,
              pull_request_url TEXT,
              session_id TEXT,
              last_event TEXT,
              last_message TEXT,
              last_error TEXT,
              retry_count INTEGER NOT NULL DEFAULT 0,
              token_total INTEGER NOT NULL DEFAULT 0,
              started_at_ms INTEGER NOT NULL,
              updated_at_ms INTEGER NOT NULL
            );
            CREATE TABLE IF NOT EXISTS runtime_snapshots (
              id TEXT PRIMARY KEY,
              workspace_id TEXT NOT NULL,
              payload_json TEXT NOT NULL,
              created_at_ms INTEGER NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_workspace_status_order
              ON tasks(workspace_id, status, order_index);
            CREATE INDEX IF NOT EXISTS idx_task_events_task_created
              ON task_events(task_id, created_at_ms DESC);
            CREATE INDEX IF NOT EXISTS idx_task_runs_task_started
              ON task_runs(task_id, started_at_ms DESC);
            ",
        )
        .map_err(|err| err.to_string())?;
    Ok(connection)
}

fn ensure_task_store(storage_path: &Path, workspace_id: &str) -> Result<PathBuf, String> {
    let _ = automation_dir_ready(storage_path, workspace_id)?;
    let db_path = task_db_path(storage_path, workspace_id);
    let _ = open_connection(&db_path)?;
    Ok(db_path)
}

fn status_from_str(value: &str) -> WorkspaceTaskStatus {
    match value {
        "todo" => WorkspaceTaskStatus::Todo,
        "in_progress" => WorkspaceTaskStatus::InProgress,
        "human_review" => WorkspaceTaskStatus::HumanReview,
        "rework" => WorkspaceTaskStatus::Rework,
        "merging" => WorkspaceTaskStatus::Merging,
        "done" => WorkspaceTaskStatus::Done,
        _ => WorkspaceTaskStatus::Backlog,
    }
}

fn can_user_move_task(from: &WorkspaceTaskStatus, to: &WorkspaceTaskStatus) -> bool {
    let _ = from;
    let _ = to;
    true
}

fn next_order_index(
    connection: &Connection,
    workspace_id: &str,
    status: &WorkspaceTaskStatus,
) -> Result<i64, String> {
    let max = connection
        .query_row(
            "SELECT COALESCE(MAX(order_index), -1) FROM tasks WHERE workspace_id = ?1 AND status = ?2",
            params![workspace_id, status.as_str()],
            |row| row.get::<_, i64>(0),
        )
        .map_err(|err| err.to_string())?;
    Ok(max + 1)
}

fn append_task_event(
    connection: &Connection,
    workspace_id: &str,
    task_id: &str,
    message: &str,
) -> Result<(), String> {
    connection
        .execute(
            "INSERT INTO task_events (id, task_id, workspace_id, message, created_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![
                uuid::Uuid::new_v4().to_string(),
                task_id,
                workspace_id,
                message,
                now_unix_ms()
            ],
        )
        .map_err(|err| err.to_string())?;
    Ok(())
}

fn read_active_run(
    connection: &Connection,
    workspace_id: &str,
    task_id: &str,
) -> Result<Option<WorkspaceTaskRun>, String> {
    connection
        .query_row(
            "SELECT id, task_id, workspace_id, thread_id, worktree_workspace_id, branch_name,
                    pull_request_url, session_id, last_event, last_message, last_error,
                    retry_count, token_total, started_at_ms, updated_at_ms
             FROM task_runs
             WHERE workspace_id = ?1 AND task_id = ?2
             ORDER BY started_at_ms DESC
             LIMIT 1",
            params![workspace_id, task_id],
            |row| {
                Ok(WorkspaceTaskRun {
                    id: row.get(0)?,
                    task_id: row.get(1)?,
                    workspace_id: row.get(2)?,
                    thread_id: row.get(3)?,
                    worktree_workspace_id: row.get(4)?,
                    branch_name: row.get(5)?,
                    pull_request_url: row.get(6)?,
                    session_id: row.get(7)?,
                    last_event: row.get(8)?,
                    last_message: row.get(9)?,
                    last_error: row.get(10)?,
                    retry_count: row.get(11)?,
                    token_total: row.get(12)?,
                    started_at_ms: row.get(13)?,
                    updated_at_ms: row.get(14)?,
                })
            },
        )
        .optional()
        .map_err(|err| err.to_string())
}

fn read_task_claimed_at_ms(
    connection: &Connection,
    workspace_id: &str,
    task_id: &str,
) -> Result<Option<i64>, String> {
    connection
        .query_row(
            "SELECT created_at_ms
             FROM task_events
             WHERE workspace_id = ?1 AND task_id = ?2
               AND (
                 message = 'Symphony moved the task to In Progress.'
                 OR message LIKE 'Task moved to in_progress.%'
               )
             ORDER BY created_at_ms DESC
             LIMIT 1",
            params![workspace_id, task_id],
            |row| row.get::<_, i64>(0),
        )
        .optional()
        .map_err(|err| err.to_string())
}

fn strip_terminal_control_sequences(input: &str) -> String {
    let bytes = input.as_bytes();
    let mut output = Vec::with_capacity(input.len());
    let mut index = 0usize;

    while index < bytes.len() {
        if bytes[index] == 0x1b {
            index += 1;
            if index >= bytes.len() {
                break;
            }
            if bytes[index] == b'[' {
                index += 1;
                while index < bytes.len() {
                    let byte = bytes[index];
                    index += 1;
                    if (0x40..=0x7e).contains(&byte) {
                        break;
                    }
                }
                continue;
            }
            continue;
        }
        output.push(bytes[index]);
        index += 1;
    }

    String::from_utf8_lossy(&output).into_owned()
}

fn parse_count_token(value: &str) -> Option<i64> {
    let digits = value
        .chars()
        .filter(|character| character.is_ascii_digit())
        .collect::<String>();
    if digits.is_empty() {
        None
    } else {
        digits.parse::<i64>().ok()
    }
}

fn parse_runtime_status_metrics(
    line: &str,
) -> Option<(Option<(usize, usize)>, Option<(i64, i64, i64)>)> {
    let sanitized = strip_terminal_control_sequences(line);
    let trimmed = sanitized.trim();
    if trimmed.is_empty() {
        return None;
    }

    let agents = trimmed
        .split_once("Agents:")
        .and_then(|(_, suffix)| suffix.trim().split_once('/'))
        .and_then(|(active, max)| {
            let active = active.trim().parse::<usize>().ok()?;
            let max = max
                .split_whitespace()
                .next()
                .and_then(|value| value.parse::<usize>().ok())?;
            Some((active, max))
        });

    let tokens = trimmed.split_once("Tokens:").and_then(|(_, suffix)| {
        let parts = suffix.split('|').map(str::trim).collect::<Vec<_>>();
        if parts.len() < 3 {
            return None;
        }
        let input_tokens = parts
            .first()
            .and_then(|value| value.strip_prefix("in"))
            .and_then(parse_count_token)?;
        let output_tokens = parts
            .get(1)
            .and_then(|value| value.strip_prefix("out"))
            .and_then(parse_count_token)?;
        let total_tokens = parts
            .get(2)
            .and_then(|value| value.strip_prefix("total"))
            .and_then(parse_count_token)?;
        Some((input_tokens, output_tokens, total_tokens))
    });

    (agents.is_some() || tokens.is_some()).then_some((agents, tokens))
}

fn parse_task_live_run_from_dashboard_line(
    line: &str,
    task_id: &str,
    claimed_at_ms: Option<i64>,
) -> Option<WorkspaceTaskLiveRun> {
    let sanitized = strip_terminal_control_sequences(line);
    let trimmed = sanitized.trim();
    if trimmed.is_empty() || !trimmed.contains("...") {
        return None;
    }

    let tokens = trimmed.split_whitespace().collect::<Vec<_>>();
    let id_index = tokens.iter().position(|token| {
        token.ends_with("...") && task_id.starts_with(token.trim_end_matches("..."))
    })?;
    let pid_index = tokens
        .iter()
        .enumerate()
        .skip(id_index + 1)
        .find_map(|(index, token)| {
            token
                .chars()
                .all(|character| character.is_ascii_digit())
                .then_some(index)
        })?;
    let slash_index = tokens
        .iter()
        .enumerate()
        .skip(pid_index + 1)
        .find_map(|(index, token)| (*token == "/").then_some(index))?;

    let stage = tokens
        .get(id_index + 1..pid_index)?
        .join(" ")
        .trim()
        .to_string();
    if stage.is_empty() {
        return None;
    }

    let age_label = tokens
        .get(pid_index + 1..slash_index)
        .map(|slice| slice.join(" "))
        .filter(|value| !value.trim().is_empty());
    let turn_count = tokens
        .get(slash_index + 1)
        .and_then(|value| value.parse::<i64>().ok());
    let token_total = tokens
        .get(slash_index + 2)
        .map(|value| value.replace(',', ""))
        .and_then(|value| value.parse::<i64>().ok());
    let session_id = tokens.get(slash_index + 3).map(|value| (*value).to_string());
    let current_event = if tokens.len() > slash_index + 4 {
        Some(tokens[slash_index + 4..].join(" "))
    } else {
        None
    };

    Some(WorkspaceTaskLiveRun {
        stage,
        agent_pid: tokens
            .get(pid_index)
            .and_then(|value| value.parse::<u32>().ok()),
        age_label,
        turn_count,
        token_total,
        session_id,
        current_event,
        claimed_at_ms,
        observed_at_ms: now_unix_ms(),
    })
}

fn read_live_task_run_from_log(
    storage_path: &Path,
    workspace_id: &str,
    task_id: &str,
    claimed_at_ms: Option<i64>,
) -> Option<WorkspaceTaskLiveRun> {
    let log_file = log_path(storage_path, workspace_id);
    let contents = fs::read_to_string(log_file).ok()?;
    for line in contents.lines().rev() {
        if let Some(parsed) = parse_task_live_run_from_dashboard_line(line, task_id, claimed_at_ms)
        {
            return Some(parsed);
        }
    }
    None
}

fn read_task(
    connection: &Connection,
    workspace_id: &str,
    task_id: &str,
) -> Result<WorkspaceTask, String> {
    let mut task = connection
        .query_row(
            "SELECT id, workspace_id, title, description, status, order_index, created_at_ms, updated_at_ms
             FROM tasks
             WHERE workspace_id = ?1 AND id = ?2",
            params![workspace_id, task_id],
            |row| {
                Ok(WorkspaceTask {
                    id: row.get(0)?,
                    workspace_id: row.get(1)?,
                    title: row.get(2)?,
                    description: row.get(3)?,
                    status: status_from_str(&row.get::<_, String>(4)?),
                    order_index: row.get(5)?,
                    created_at_ms: row.get(6)?,
                    updated_at_ms: row.get(7)?,
                    active_run: None,
                })
            },
        )
        .map_err(|err| err.to_string())?;
    task.active_run = read_active_run(connection, workspace_id, task_id)?;
    Ok(task)
}

fn list_tasks_from_db(
    storage_path: &Path,
    workspace_id: &str,
) -> Result<Vec<WorkspaceTask>, String> {
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    let mut statement = connection
        .prepare(
            "SELECT id, workspace_id, title, description, status, order_index, created_at_ms, updated_at_ms
             FROM tasks
             WHERE workspace_id = ?1
             ORDER BY
               CASE status
                 WHEN 'backlog' THEN 0
                 WHEN 'todo' THEN 1
                 WHEN 'in_progress' THEN 2
                 WHEN 'human_review' THEN 3
                 WHEN 'rework' THEN 4
                 WHEN 'merging' THEN 5
                 ELSE 6
               END,
               order_index,
               updated_at_ms DESC",
        )
        .map_err(|err| err.to_string())?;

    let task_rows = statement
        .query_map(params![workspace_id], |row| {
            Ok(WorkspaceTask {
                id: row.get(0)?,
                workspace_id: row.get(1)?,
                title: row.get(2)?,
                description: row.get(3)?,
                status: status_from_str(&row.get::<_, String>(4)?),
                order_index: row.get(5)?,
                created_at_ms: row.get(6)?,
                updated_at_ms: row.get(7)?,
                active_run: None,
            })
        })
        .map_err(|err| err.to_string())?;

    let mut tasks = Vec::new();
    for row in task_rows {
        let mut task = row.map_err(|err| err.to_string())?;
        task.active_run = read_active_run(&connection, workspace_id, &task.id)?;
        tasks.push(task);
    }
    Ok(tasks)
}

fn update_runtime_snapshot(
    storage_path: &Path,
    workspace_id: &str,
    payload_json: &str,
) -> Result<(), String> {
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    connection
        .execute(
            "DELETE FROM runtime_snapshots WHERE workspace_id = ?1",
            params![workspace_id],
        )
        .map_err(|err| err.to_string())?;
    connection
        .execute(
            "INSERT INTO runtime_snapshots (id, workspace_id, payload_json, created_at_ms)
             VALUES (?1, ?2, ?3, ?4)",
            params![
                uuid::Uuid::new_v4().to_string(),
                workspace_id,
                payload_json,
                now_unix_ms()
            ],
        )
        .map_err(|err| err.to_string())?;
    Ok(())
}

async fn apply_runtime_status_update(
    runtimes: Arc<SymphonyRuntimeRegistry>,
    storage_path: PathBuf,
    workspace_id: String,
    line: &str,
) -> Option<WorkspaceSymphonyStatus> {
    let parsed = parse_runtime_status_metrics(line);
    let mut status_to_emit = None;
    {
        let mut guard = runtimes.lock().await;
        if let Some(runtime) = guard.get_mut(&workspace_id) {
            runtime.status.last_heartbeat_at_ms = Some(now_unix_ms());
            runtime.status.last_activity_at_ms = Some(now_unix_ms());
            if let Some((agents, tokens)) = parsed {
                if let Some((active_agents, max_agents)) = agents {
                    runtime.status.active_agents = active_agents;
                    runtime.status.max_agents = max_agents;
                }
                if let Some((input_tokens, output_tokens, total_tokens)) = tokens {
                    runtime.status.input_tokens = input_tokens;
                    runtime.status.output_tokens = output_tokens;
                    runtime.status.total_tokens = total_tokens;
                }
            }
            runtime.status = hydrate_runtime_status(runtime.status.clone());
            status_to_emit = Some(runtime.status.clone());
        }
    }
    if let Some(status) = status_to_emit.as_ref() {
        let payload = serde_json::to_string(status).unwrap_or_else(|_| "{}".to_string());
        let _ = update_runtime_snapshot(&storage_path, &workspace_id, &payload);
    }
    status_to_emit
}

fn probe_binary_version(binary_path: &Path) -> Option<String> {
    std::process::Command::new(binary_path)
        .arg("--version")
        .output()
        .ok()
        .and_then(|output| {
            if output.status.success() {
                let stdout = String::from_utf8_lossy(&output.stdout).trim().to_string();
                if stdout.is_empty() {
                    None
                } else {
                    Some(stdout)
                }
            } else {
                None
            }
        })
}

fn is_escript_wrapper(binary_path: &Path) -> bool {
    let file = match File::open(binary_path) {
        Ok(file) => file,
        Err(_) => return false,
    };
    let mut reader = StdBufReader::new(file);
    let mut first_line = Vec::new();
    if reader.read_until(b'\n', &mut first_line).is_err() {
        return false;
    }
    String::from_utf8_lossy(&first_line).contains("escript")
}

fn candidate_escript_search_dirs() -> Vec<PathBuf> {
    let mut dirs = Vec::new();

    if let Some(path_var) = std::env::var_os("PATH") {
        dirs.extend(std::env::split_paths(&path_var));
    }

    #[cfg(target_os = "macos")]
    {
        dirs.push(PathBuf::from("/opt/homebrew/bin"));
        dirs.push(PathBuf::from("/usr/local/bin"));
        dirs.push(PathBuf::from("/usr/bin"));
    }

    if let Some(home) = std::env::var_os("HOME").map(PathBuf::from) {
        let mise_erlang_root = home.join(".local/share/mise/installs/erlang");
        dirs.push(mise_erlang_root.join("latest").join("bin"));

        if let Ok(entries) = std::fs::read_dir(&mise_erlang_root) {
            let mut version_dirs = entries
                .filter_map(Result::ok)
                .map(|entry| entry.path())
                .filter(|path| path.is_dir())
                .collect::<Vec<_>>();
            version_dirs.sort();
            version_dirs.reverse();
            for version_dir in version_dirs {
                dirs.push(version_dir.join("bin"));
            }
        }
    }

    let mut unique = Vec::new();
    for dir in dirs {
        if !unique.iter().any(|existing| existing == &dir) {
            unique.push(dir);
        }
    }
    unique
}

fn resolve_escript_path() -> Option<PathBuf> {
    candidate_escript_search_dirs()
        .into_iter()
        .map(|dir| dir.join("escript"))
        .find(|path| path.is_file())
}

fn build_symphony_launch_command(
    binary_path: &Path,
    workflow_path: &Path,
) -> Result<Command, String> {
    if is_escript_wrapper(binary_path) {
        if let Some(escript_path) = resolve_escript_path() {
            let mut command = Command::new(escript_path);
            command
                .arg(binary_path)
                .arg(SYMPHONY_GUARDRAILS_ACK_FLAG)
                .arg(workflow_path);
            return Ok(command);
        }

        return Err(
            "Unable to resolve `escript` needed to launch the Symphony debug binary."
                .to_string(),
        );
    }

    let mut command = Command::new(binary_path);
    command.arg(SYMPHONY_GUARDRAILS_ACK_FLAG).arg(workflow_path);
    Ok(command)
}

fn build_default_workflow_content(storage_path: &Path, entry: &WorkspaceEntry) -> String {
    let workspace_root = automation_root_for_workspace(storage_path, &entry.id).join("workspaces");
    let db_path = task_db_path(storage_path, &entry.id);
    let profile = detect_workflow_profile(entry);
    let repo_name = workspace_repo_name(entry);
    let clone_source = workspace_clone_source(entry);
    let max_concurrent_agents = match profile {
        WorkflowProfile::Generic => 1,
        WorkflowProfile::CodexMonitor => 10,
    };
    let codex_command = match profile {
        WorkflowProfile::Generic => "codex app-server",
        WorkflowProfile::CodexMonitor => {
            "codex --config shell_environment_policy.inherit=all --config model_reasoning_effort=xhigh app-server"
        }
    };
    let profile_guidance = match profile {
        WorkflowProfile::Generic => format!(
            "## Repository-specific guidance\n\n- Read `AGENTS.md` if present before changing architecture or running broad validation.\n- Preserve the existing architecture and external contracts unless the task explicitly requires a change.\n- Prefer focused validation that proves the changed behavior directly.\n- Keep edits scoped to the current repository copy at `{}`.\n",
            entry.path
        ),
        WorkflowProfile::CodexMonitor => "- Read `AGENTS.md`, `docs/codebase-map.md`, and `README.md` before changing architecture or running broad validation.\n- Preserve the app and daemon shared-core architecture described in `AGENTS.md`.\n- Keep backend behavior changes in `src-tauri/src/shared/*` first when logic is cross-runtime.\n- Keep frontend IPC in `src/services/tauri.ts` and preserve app/daemon parity.\n- Use the existing validation matrix from `AGENTS.md`: always run `npm run typecheck`, run `npm run test` for frontend behavior changes, and run `cd src-tauri && cargo check` for Rust changes.\n- Avoid unrelated refactors in `src/App.tsx` and the listed hotspot files unless the task demands it.\n".to_string(),
    };

    format!(
        "---\ntracker:\n  kind: codex_monitor\n  database_path: {}\n  workspace_id: {}\n  active_states:\n    - Todo\n    - In Progress\n    - Human Review\n    - Rework\n    - Merging\n  terminal_states:\n    - Done\npolling:\n  interval_ms: 5000\nworkspace:\n  root: {}\nhooks:\n  after_create: |\n    git clone --reference-if-able {} {} .\nagent:\n  max_concurrent_agents: {}\n  max_turns: 20\ncodex:\n  command: {}\n  approval_policy: never\n  thread_sandbox: danger-full-access\n  turn_sandbox_policy:\n    type: dangerFullAccess\n---\n\nYou are working on a CodexMonitor local task `{{{{ issue.identifier }}}}` for the `{}` repository.\n\n{{% if attempt %}}\nContinuation context:\n\n- This is retry attempt #{{{{ attempt }}}} because the task is still in an active state.\n- Resume from the current workspace state instead of restarting from scratch.\n- Do not repeat already-completed investigation or validation unless needed for new code changes.\n- Do not stop while the task remains active unless you are blocked by missing required tools, auth, permissions, or secrets.\n{{% endif %}}\n\nTask context:\nIdentifier: {{{{ issue.identifier }}}}\nTitle: {{{{ issue.title }}}}\nCurrent status: {{{{ issue.state }}}}\n\nDescription:\n{{% if issue.description %}}\n{{{{ issue.description }}}}\n{{% else %}}\nNo description provided.\n{{% endif %}}\n\nInstructions:\n\n1. This is an unattended orchestration session. Never ask a human to perform follow-up actions.\n2. Only stop early for a true blocker: missing required auth, permissions, tools, or secrets.\n3. Final message must report completed actions and blockers only. Do not include user follow-up steps.\n4. Work only in the provided repository copy. Do not touch any other path.\n5. Use the `codex_monitor_task` dynamic tool as your source of truth for task state, worklog, and run telemetry.\n\n## Default posture\n\n- Start by reading the current task, the repo state, and the task status, then follow the matching flow for that status.\n- Reproduce first and record the concrete signal in the task worklog before editing code.\n- Keep the task worklog current with your plan, validation evidence, blockers, and final outcome.\n- Treat any task-authored `Validation`, `Test Plan`, or `Testing` section as mandatory.\n- Operate autonomously end-to-end unless blocked by missing tools, auth, or secrets.\n\n## Status map\n\n- `Backlog` -> out of scope for this workflow; do not modify.\n- `Todo` -> claim and continue. Symphony moves claimed Todo tasks to `In Progress` automatically.\n- `In Progress` -> continue implementation, validation, and PR work.\n- `Human Review` -> do not code by default; poll for review outcomes and wait for human approval.\n- `Rework` -> reviewer requested changes; resume implementation, validation, and PR updates.\n- `Merging` -> approved by human; land the change using the repository's documented landing flow, then move the task to `Done`.\n- `Done` -> terminal state; do nothing and exit.\n\n## Execution rules\n\n1. Start by calling `codex_monitor_task` with `get_task` and keep the task state aligned with the real work.\n2. Use `append_worklog` to record meaningful milestones instead of keeping progress only in your head.\n3. Use `update_run` whenever branch, PR, worktree, session, or other run metadata changes materially.\n4. Before editing code:\n   - record reproduction evidence in the worklog\n   - sync with latest `origin/main` when the repository uses it and note the result in the worklog\n5. During implementation:\n   - keep the plan and validation notes current in the worklog\n   - address actionable PR feedback if a PR already exists\n   - rerun validation after feedback-driven changes\n6. Before moving to `Human Review`:\n   - required validation is green\n   - required acceptance items are satisfied\n   - task state and run metadata are current\n   - the worklog clearly explains what changed and how it was validated\n7. In `Human Review`, do not change code unless new review feedback requires another implementation pass. If that happens, move the task to `Rework` and continue from the existing workspace state.\n8. In `Rework`, address the requested changes, rerun the relevant validation, update the PR if present, and return to `Human Review` only when feedback is resolved.\n9. In `Merging`, follow the repository landing flow instead of waiting for more implementation work; after merge is complete, move the task to `Done`.\n\n{}\n",
        db_path.display(),
        entry.id,
        workspace_root.display(),
        entry.path,
        clone_source,
        max_concurrent_agents,
        codex_command,
        repo_name,
        profile_guidance
    )
}

fn workspace_repo_name(entry: &WorkspaceEntry) -> String {
    Path::new(&entry.path)
        .file_name()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or(entry.name.as_str())
        .to_string()
}

fn detect_workflow_profile(entry: &WorkspaceEntry) -> WorkflowProfile {
    let repo_name = workspace_repo_name(entry).to_ascii_lowercase();
    let workspace_name = entry.name.to_ascii_lowercase();
    if repo_name == "codexmonitor"
        || repo_name == "codex-monitor"
        || workspace_name == "codexmonitor"
        || workspace_name == "codex monitor"
    {
        WorkflowProfile::CodexMonitor
    } else {
        WorkflowProfile::Generic
    }
}

fn workspace_clone_source(entry: &WorkspaceEntry) -> String {
    preferred_remote_clone_source(Path::new(&entry.path)).unwrap_or_else(|| entry.path.clone())
}

fn preferred_remote_clone_source(repo_root: &Path) -> Option<String> {
    let repo = Repository::open(repo_root).ok()?;
    let remotes = repo.remotes().ok()?;
    let mut names = Vec::new();

    if remotes.iter().any(|remote| remote == Some("origin")) {
        names.push("origin".to_string());
    }

    for name in remotes.iter().flatten() {
        if name != "origin" {
            names.push(name.to_string());
        }
    }

    names.into_iter().find_map(|name| {
        let remote = repo.find_remote(&name).ok()?;
        let url = remote.url()?.trim();
        if url.is_empty() || is_local_clone_source(url) {
            None
        } else {
            Some(url.to_string())
        }
    })
}

fn is_local_clone_source(source: &str) -> bool {
    let trimmed = source.trim();
    if trimmed.is_empty() {
        return true;
    }

    trimmed.starts_with("file://")
        || trimmed.starts_with('/')
        || trimmed.starts_with("./")
        || trimmed.starts_with("../")
}

fn read_workflow_override_response(
    storage_path: &Path,
    entry: &WorkspaceEntry,
) -> Result<TextFileResponse, String> {
    let root = automation_root_for_workspace(storage_path, &entry.id);
    let response = read_text_file_within(
        &root,
        WORKFLOW_OVERRIDE_FILE_NAME,
        true,
        "Symphony workspace automation directory",
        "Symphony workflow override",
        false,
    )?;
    if response.exists {
        return Ok(response);
    }
    Ok(TextFileResponse {
        exists: false,
        content: build_default_workflow_content(storage_path, entry),
        truncated: false,
    })
}

fn write_workflow_override(
    storage_path: &Path,
    workspace_id: &str,
    content: &str,
) -> Result<(), String> {
    let root = automation_root_for_workspace(storage_path, workspace_id);
    write_text_file_within(
        &root,
        WORKFLOW_OVERRIDE_FILE_NAME,
        content,
        true,
        "Symphony workspace automation directory",
        "Symphony workflow override",
        false,
    )
}

fn write_generated_workflow(
    storage_path: &Path,
    entry: &WorkspaceEntry,
) -> Result<PathBuf, String> {
    let path = workflow_path(storage_path, &entry.id);
    let workspace_root = automation_root_for_workspace(storage_path, &entry.id).join("workspaces");
    fs::create_dir_all(&workspace_root).map_err(|err| err.to_string())?;
    let content = read_workflow_override_response(storage_path, entry)?.content;
    fs::write(&path, content).map_err(|err| err.to_string())?;
    Ok(path)
}

async fn append_log_line(log_path: PathBuf, line: String) {
    if let Ok(mut file) = OpenOptions::new().create(true).append(true).open(log_path) {
        let _ = writeln!(file, "{line}");
    }
}

async fn spawn_process_watchers(
    runtimes: Arc<SymphonyRuntimeRegistry>,
    storage_path: PathBuf,
    workspace_id: String,
    child: Arc<Mutex<Child>>,
    log_path: PathBuf,
    event_sink: impl EventSink,
) {
    let stdout = {
        let mut locked = child.lock().await;
        locked.stdout.take()
    };
    let stderr = {
        let mut locked = child.lock().await;
        locked.stderr.take()
    };

    if let Some(stdout) = stdout {
        let runtimes_clone = Arc::clone(&runtimes);
        let storage_path_clone = storage_path.clone();
        let event_sink_clone = event_sink.clone();
        let log_path_clone = log_path.clone();
        let workspace_id_clone = workspace_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stdout).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                append_log_line(log_path_clone.clone(), line.clone()).await;
                let status = apply_runtime_status_update(
                    Arc::clone(&runtimes_clone),
                    storage_path_clone.clone(),
                    workspace_id_clone.clone(),
                    &line,
                )
                .await;
                event_sink_clone.emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                    workspace_id: workspace_id_clone.clone(),
                    kind: "heartbeat".to_string(),
                    status,
                    task: None,
                    telemetry: None,
                    message: None,
                });
            }
        });
    }

    if let Some(stderr) = stderr {
        let runtimes_clone = Arc::clone(&runtimes);
        let storage_path_clone = storage_path.clone();
        let event_sink_clone = event_sink.clone();
        let log_path_clone = log_path.clone();
        let workspace_id_clone = workspace_id.clone();
        tokio::spawn(async move {
            let mut lines = BufReader::new(stderr).lines();
            while let Ok(Some(line)) = lines.next_line().await {
                append_log_line(log_path_clone.clone(), line.clone()).await;
                let status = apply_runtime_status_update(
                    Arc::clone(&runtimes_clone),
                    storage_path_clone.clone(),
                    workspace_id_clone.clone(),
                    &line,
                )
                .await;
                event_sink_clone.emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                    workspace_id: workspace_id_clone.clone(),
                    kind: "heartbeat".to_string(),
                    status,
                    task: None,
                    telemetry: None,
                    message: None,
                });
            }
        });
    }

    let event_sink_clone = event_sink.clone();
    tokio::spawn(async move {
        let exit_status = loop {
            let status = {
                let mut locked = child.lock().await;
                locked.try_wait().ok().flatten()
            };
            if status.is_some() {
                break status;
            }
            sleep(Duration::from_millis(250)).await;
        };
        let mut status_to_emit = None;
        {
            let mut guard = runtimes.lock().await;
            if let Some(runtime) = guard.remove(&workspace_id) {
                let mut status = runtime.status;
                status.state = WorkspaceSymphonyRuntimeState::Stopped;
                status.pid = None;
                status.active_agents = 0;
                if let Some(exit_status) = exit_status {
                    if !exit_status.success() {
                        status.last_error =
                            Some(format!("Symphony exited with status {exit_status}"));
                    }
                }
                status_to_emit = Some(hydrate_runtime_status(status));
            }
        }
        if let Some(status) = status_to_emit {
            event_sink_clone.emit_workspace_symphony_event(WorkspaceSymphonyEvent {
                workspace_id,
                kind: "runtime_stopped".to_string(),
                status: Some(status),
                task: None,
                telemetry: None,
                message: None,
            });
        }
    });
}

pub(crate) async fn get_workspace_symphony_status_core(
    runtimes: &SymphonyRuntimeRegistry,
    storage_path: &Path,
    workspace_id: &str,
) -> Result<WorkspaceSymphonyStatus, String> {
    let tasks = list_tasks_from_db(storage_path, workspace_id).unwrap_or_default();
    let active_tasks = tasks
        .iter()
        .filter(|task| {
            matches!(
                task.status,
                WorkspaceTaskStatus::InProgress
                    | WorkspaceTaskStatus::HumanReview
                    | WorkspaceTaskStatus::Rework
                    | WorkspaceTaskStatus::Merging
            )
        })
        .count();
    let retrying_tasks = tasks
        .iter()
        .filter(|task| {
            task.active_run
                .as_ref()
                .and_then(|run| run.last_error.as_ref())
                .is_some()
        })
        .count();

    let mut guard = runtimes.lock().await;
    if let Some(runtime) = guard.get_mut(workspace_id) {
        runtime.status.total_tasks = tasks.len();
        runtime.status.active_tasks = active_tasks;
        runtime.status.retrying_tasks = retrying_tasks;
        runtime.status = hydrate_runtime_status(runtime.status.clone());
        return Ok(runtime.status.clone());
    }

    Ok(hydrate_runtime_status(WorkspaceSymphonyStatus {
        workspace_id: workspace_id.to_string(),
        state: WorkspaceSymphonyRuntimeState::Stopped,
        health: WorkspaceSymphonyHealth::Stopped,
        binary_path: None,
        binary_version: None,
        pid: None,
        started_at_ms: None,
        last_heartbeat_at_ms: None,
        last_error: None,
        log_path: Some(log_path(storage_path, workspace_id).display().to_string()),
        total_tasks: tasks.len(),
        active_tasks,
        retrying_tasks,
        active_agents: 0,
        max_agents: 0,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        uptime_ms: None,
        last_activity_at_ms: None,
    }))
}

pub(crate) async fn get_workspace_symphony_snapshot_core(
    runtimes: &SymphonyRuntimeRegistry,
    storage_path: &Path,
    workspace_id: &str,
) -> Result<WorkspaceSymphonySnapshot, String> {
    let tasks = list_tasks_from_db(storage_path, workspace_id)?;
    let status = get_workspace_symphony_status_core(runtimes, storage_path, workspace_id).await?;
    Ok(WorkspaceSymphonySnapshot { status, tasks })
}

pub(crate) async fn list_workspace_symphony_tasks_core(
    storage_path: &Path,
    workspace_id: &str,
) -> Result<Vec<WorkspaceTask>, String> {
    list_tasks_from_db(storage_path, workspace_id)
}

pub(crate) async fn create_workspace_symphony_task_core(
    storage_path: &Path,
    workspace_id: &str,
    input: CreateWorkspaceTaskInput,
) -> Result<WorkspaceTask, String> {
    let title = input.title.trim();
    if title.is_empty() {
        return Err("Task title is required.".to_string());
    }
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    let task_id = uuid::Uuid::new_v4().to_string();
    let now = now_unix_ms();
    let order_index = next_order_index(&connection, workspace_id, &WorkspaceTaskStatus::Backlog)?;
    connection
        .execute(
            "INSERT INTO tasks (id, workspace_id, title, description, status, order_index, created_at_ms, updated_at_ms)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
            params![
                task_id,
                workspace_id,
                title,
                input.description.map(|value| value.trim().to_string()),
                WorkspaceTaskStatus::Backlog.as_str(),
                order_index,
                now,
                now
            ],
        )
        .map_err(|err| err.to_string())?;
    append_task_event(
        &connection,
        workspace_id,
        &task_id,
        "Task created in Backlog.",
    )?;
    read_task(&connection, workspace_id, &task_id)
}

pub(crate) async fn update_workspace_symphony_task_core(
    storage_path: &Path,
    workspace_id: &str,
    input: UpdateWorkspaceTaskInput,
) -> Result<WorkspaceTask, String> {
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    let current = read_task(&connection, workspace_id, &input.task_id)?;
    let next_title = input
        .title
        .map(|value| value.trim().to_string())
        .filter(|value| !value.is_empty())
        .unwrap_or(current.title.clone());
    let next_description = input
        .description
        .map(|value| value.trim().to_string())
        .or_else(|| current.description.clone());
    connection
        .execute(
            "UPDATE tasks SET title = ?1, description = ?2, updated_at_ms = ?3 WHERE workspace_id = ?4 AND id = ?5",
            params![next_title, next_description, now_unix_ms(), workspace_id, input.task_id],
        )
        .map_err(|err| err.to_string())?;
    append_task_event(
        &connection,
        workspace_id,
        &input.task_id,
        "Task details updated.",
    )?;
    read_task(&connection, workspace_id, &input.task_id)
}

pub(crate) async fn move_workspace_symphony_task_core(
    storage_path: &Path,
    workspace_id: &str,
    input: MoveWorkspaceTaskInput,
) -> Result<WorkspaceTask, String> {
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    let current = read_task(&connection, workspace_id, &input.task_id)?;
    if !can_user_move_task(&current.status, &input.status) {
        return Err("That move is not allowed from the board.".to_string());
    }

    let order_index = if let Some(position) = input.position {
        i64::from(position)
    } else {
        next_order_index(&connection, workspace_id, &input.status)?
    };

    connection
        .execute(
            "UPDATE tasks SET status = ?1, order_index = ?2, updated_at_ms = ?3 WHERE workspace_id = ?4 AND id = ?5",
            params![
                input.status.as_str(),
                order_index,
                now_unix_ms(),
                workspace_id,
                input.task_id
            ],
        )
        .map_err(|err| err.to_string())?;
    append_task_event(
        &connection,
        workspace_id,
        &input.task_id,
        &format!("Task moved to {}.", input.status.as_str()),
    )?;
    read_task(&connection, workspace_id, &input.task_id)
}

pub(crate) async fn delete_workspace_symphony_task_core(
    storage_path: &Path,
    workspace_id: &str,
    task_id: &str,
) -> Result<(), String> {
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    connection
        .execute(
            "DELETE FROM task_events WHERE workspace_id = ?1 AND task_id = ?2",
            params![workspace_id, task_id],
        )
        .map_err(|err| err.to_string())?;
    connection
        .execute(
            "DELETE FROM task_runs WHERE workspace_id = ?1 AND task_id = ?2",
            params![workspace_id, task_id],
        )
        .map_err(|err| err.to_string())?;
    connection
        .execute(
            "DELETE FROM tasks WHERE workspace_id = ?1 AND id = ?2",
            params![workspace_id, task_id],
        )
        .map_err(|err| err.to_string())?;
    Ok(())
}

pub(crate) async fn get_workspace_symphony_telemetry_core(
    storage_path: &Path,
    workspace_id: &str,
    task_id: &str,
) -> Result<WorkspaceTaskTelemetry, String> {
    let db_path = ensure_task_store(storage_path, workspace_id)?;
    let connection = open_connection(&db_path)?;
    let task = read_task(&connection, workspace_id, task_id)?;
    let mut statement = connection
        .prepare(
            "SELECT id, task_id, workspace_id, message, created_at_ms
             FROM task_events
             WHERE workspace_id = ?1 AND task_id = ?2
             ORDER BY created_at_ms DESC
             LIMIT 100",
        )
        .map_err(|err| err.to_string())?;
    let rows = statement
        .query_map(params![workspace_id, task_id], |row| {
            Ok(WorkspaceTaskEvent {
                id: row.get(0)?,
                task_id: row.get(1)?,
                workspace_id: row.get(2)?,
                message: row.get(3)?,
                created_at_ms: row.get(4)?,
            })
        })
        .map_err(|err| err.to_string())?;
    let mut events = Vec::new();
    for row in rows {
        events.push(row.map_err(|err| err.to_string())?);
    }
    let claimed_at_ms = read_task_claimed_at_ms(&connection, workspace_id, task_id)?;
    let live_run = read_live_task_run_from_log(storage_path, workspace_id, task_id, claimed_at_ms);
    Ok(WorkspaceTaskTelemetry {
        task,
        events,
        live_run,
    })
}

pub(crate) async fn read_workspace_symphony_workflow_override_core(
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    storage_path: &Path,
    workspace_id: &str,
) -> Result<TextFileResponse, String> {
    let entry = {
        let guard = workspaces.lock().await;
        guard
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };
    read_workflow_override_response(storage_path, &entry)
}

pub(crate) async fn write_workspace_symphony_workflow_override_core(
    storage_path: &Path,
    workspace_id: &str,
    content: &str,
) -> Result<(), String> {
    write_workflow_override(storage_path, workspace_id, content)
}

pub(crate) async fn start_workspace_symphony_core(
    runtimes: Arc<SymphonyRuntimeRegistry>,
    workspaces: &Mutex<HashMap<String, WorkspaceEntry>>,
    storage_path: &Path,
    workspace_id: &str,
    event_sink: impl EventSink,
    binary_path: PathBuf,
) -> Result<WorkspaceSymphonyStatus, String> {
    let existing = {
        runtimes
            .lock()
            .await
            .get(workspace_id)
            .map(|runtime| runtime.status.clone())
    };
    if let Some(status) = existing {
        if status.state == WorkspaceSymphonyRuntimeState::Running {
            return Ok(status);
        }
    }

    let entry = {
        let guard = workspaces.lock().await;
        guard
            .get(workspace_id)
            .cloned()
            .ok_or_else(|| "workspace not found".to_string())?
    };

    let _ = ensure_task_store(storage_path, workspace_id)?;
    let workflow = write_generated_workflow(storage_path, &entry)?;
    let log_path = log_path(storage_path, workspace_id);
    let _ = File::create(&log_path).map_err(|err| err.to_string())?;

    let mut command = build_symphony_launch_command(&binary_path, &workflow)?;
    command.current_dir(automation_root_for_workspace(storage_path, workspace_id));
    command.stdout(std::process::Stdio::piped());
    command.stderr(std::process::Stdio::piped());
    let child = command.spawn().map_err(|err| err.to_string())?;
    let pid = child.id();
    let child = Arc::new(Mutex::new(child));
    let status = hydrate_runtime_status(WorkspaceSymphonyStatus {
        workspace_id: workspace_id.to_string(),
        state: WorkspaceSymphonyRuntimeState::Running,
        health: WorkspaceSymphonyHealth::Healthy,
        binary_path: Some(binary_path.display().to_string()),
        binary_version: probe_binary_version(&binary_path),
        pid,
        started_at_ms: Some(now_unix_ms()),
        last_heartbeat_at_ms: Some(now_unix_ms()),
        last_error: None,
        log_path: Some(log_path.display().to_string()),
        total_tasks: list_tasks_from_db(storage_path, workspace_id)
            .unwrap_or_default()
            .len(),
        active_tasks: 0,
        retrying_tasks: 0,
        active_agents: 0,
        max_agents: 1,
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
        uptime_ms: None,
        last_activity_at_ms: Some(now_unix_ms()),
    });

    {
        let mut guard = runtimes.lock().await;
        guard.insert(
            workspace_id.to_string(),
            ManagedSymphonyRuntime {
                child: Arc::clone(&child),
                status: status.clone(),
            },
        );
    }

    let status_json = serde_json::to_string(&status).unwrap_or_else(|_| "{}".to_string());
    let _ = update_runtime_snapshot(storage_path, workspace_id, &status_json);
    event_sink.emit_workspace_symphony_event(WorkspaceSymphonyEvent {
        workspace_id: workspace_id.to_string(),
        kind: "runtime_started".to_string(),
        status: Some(status.clone()),
        task: None,
        telemetry: None,
        message: None,
    });

    spawn_process_watchers(
        Arc::clone(&runtimes),
        storage_path.to_path_buf(),
        workspace_id.to_string(),
        child,
        log_path,
        event_sink.clone(),
    )
    .await;

    Ok(status)
}

pub(crate) async fn stop_workspace_symphony_core(
    runtimes: &SymphonyRuntimeRegistry,
    workspace_id: &str,
) -> Result<WorkspaceSymphonyStatus, String> {
    let runtime = {
        let mut guard = runtimes.lock().await;
        guard.remove(workspace_id)
    };

    let Some(runtime) = runtime else {
        return Ok(hydrate_runtime_status(WorkspaceSymphonyStatus {
            workspace_id: workspace_id.to_string(),
            state: WorkspaceSymphonyRuntimeState::Stopped,
            health: WorkspaceSymphonyHealth::Stopped,
            binary_path: None,
            binary_version: None,
            pid: None,
            started_at_ms: None,
            last_heartbeat_at_ms: None,
            last_error: None,
            log_path: None,
            total_tasks: 0,
            active_tasks: 0,
            retrying_tasks: 0,
            active_agents: 0,
            max_agents: 0,
            input_tokens: 0,
            output_tokens: 0,
            total_tokens: 0,
            uptime_ms: None,
            last_activity_at_ms: None,
        }));
    };

    {
        let mut child = runtime.child.lock().await;
        let _ = kill_child_process_tree(&mut child).await;
    }

    let mut status = runtime.status;
    status.state = WorkspaceSymphonyRuntimeState::Stopped;
    status.pid = None;
    status.active_agents = 0;
    Ok(hydrate_runtime_status(status))
}

#[cfg(test)]
mod tests {
    use super::{
        build_default_workflow_content, detect_workflow_profile, is_local_clone_source,
        preferred_remote_clone_source, WorkflowProfile,
    };
    use crate::types::{WorkspaceEntry, WorkspaceKind, WorkspaceSettings};
    use git2::Repository;
    use std::fs;
    use std::path::Path;

    fn sample_workspace_entry(name: &str, path: &str) -> WorkspaceEntry {
        WorkspaceEntry {
            id: "ws-1".to_string(),
            name: name.to_string(),
            path: path.to_string(),
            kind: WorkspaceKind::Main,
            parent_id: None,
            worktree: None,
            settings: WorkspaceSettings::default(),
        }
    }

    fn temp_repo_root(name: &str) -> std::path::PathBuf {
        let path = std::env::temp_dir().join(format!(
            "codex-monitor-symphony-core-tests-{}-{}",
            name,
            uuid::Uuid::new_v4()
        ));
        fs::create_dir_all(&path).expect("create temp repo root");
        path
    }

    #[test]
    fn detects_codexmonitor_profile_from_repo_name() {
        let entry = sample_workspace_entry(
            "CodexMonitor",
            "/Users/dimillian/Documents/Dev/CodexMonitor",
        );

        assert_eq!(detect_workflow_profile(&entry), WorkflowProfile::CodexMonitor);
    }

    #[test]
    fn detects_generic_profile_for_other_repositories() {
        let entry = sample_workspace_entry("MyApp", "/Users/dimillian/Documents/Dev/MyApp");

        assert_eq!(detect_workflow_profile(&entry), WorkflowProfile::Generic);
    }

    #[test]
    fn codexmonitor_default_workflow_uses_profile_guidance() {
        let entry = sample_workspace_entry(
            "CodexMonitor",
            "/Users/dimillian/Documents/Dev/CodexMonitor",
        );
        let workflow = build_default_workflow_content(Path::new("/tmp/codex-monitor.json"), &entry);

        assert!(workflow.contains("docs/codebase-map.md"));
        assert!(workflow.contains("max_concurrent_agents: 10"));
        assert!(workflow.contains("model_reasoning_effort=xhigh"));
        assert!(workflow.contains("Human Review"));
    }

    #[test]
    fn generic_default_workflow_avoids_codexmonitor_specific_guidance() {
        let entry = sample_workspace_entry("MyApp", "/Users/dimillian/Documents/Dev/MyApp");
        let workflow = build_default_workflow_content(Path::new("/tmp/codex-monitor.json"), &entry);

        assert!(workflow.contains("Read `AGENTS.md` if present"));
        assert!(!workflow.contains("docs/codebase-map.md"));
        assert!(workflow.contains("max_concurrent_agents: 1"));
        assert!(workflow.contains("codex app-server"));
    }

    #[test]
    fn workflow_prefers_non_local_origin_remote_for_clone_source() {
        let temp = temp_repo_root("origin-remote");
        let repo = Repository::init(&temp).expect("init repo");
        repo.remote("origin", "https://github.com/Dimillian/CodexMonitor.git")
            .expect("add remote");

        let entry = sample_workspace_entry("CodexMonitor", temp.to_str().expect("utf8 path"));
        let workflow = build_default_workflow_content(Path::new("/tmp/codex-monitor.json"), &entry);

        assert!(workflow.contains("git clone --reference-if-able"));
        assert!(workflow.contains("https://github.com/Dimillian/CodexMonitor.git ."));

        fs::remove_dir_all(temp).expect("cleanup temp repo");
    }

    #[test]
    fn workflow_ignores_local_origin_and_uses_other_network_remote() {
        let temp = temp_repo_root("mixed-remotes");
        let local_remote = temp.join("mirror.git");
        fs::create_dir_all(&local_remote).expect("create local remote dir");
        let repo = Repository::init(&temp).expect("init repo");
        repo.remote("origin", local_remote.to_str().expect("utf8 local path"))
            .expect("add local origin");
        repo.remote("upstream", "git@github.com:Dimillian/CodexMonitor.git")
            .expect("add upstream");

        let resolved = preferred_remote_clone_source(&temp);
        assert_eq!(
            resolved.as_deref(),
            Some("git@github.com:Dimillian/CodexMonitor.git")
        );

        fs::remove_dir_all(temp).expect("cleanup temp repo");
    }

    #[test]
    fn workflow_falls_back_to_local_path_when_no_network_remote_exists() {
        let temp = temp_repo_root("local-only");
        let repo = Repository::init(&temp).expect("init repo");
        let local_remote = temp.join("mirror.git");
        fs::create_dir_all(&local_remote).expect("create local remote dir");
        repo.remote("origin", local_remote.to_str().expect("utf8 local path"))
            .expect("add local origin");

        let entry = sample_workspace_entry("MyApp", temp.to_str().expect("utf8 path"));
        let workflow = build_default_workflow_content(Path::new("/tmp/codex-monitor.json"), &entry);

        assert!(workflow.contains(&format!(
            "git clone --reference-if-able {} {} .",
            temp.display(),
            temp.display()
        )));

        fs::remove_dir_all(temp).expect("cleanup temp repo");
    }

    #[test]
    fn local_clone_source_detection_matches_path_style_urls() {
        assert!(is_local_clone_source("/tmp/repo"));
        assert!(is_local_clone_source("./repo"));
        assert!(is_local_clone_source("../repo"));
        assert!(is_local_clone_source("file:///tmp/repo"));
        assert!(!is_local_clone_source("https://github.com/Dimillian/CodexMonitor.git"));
        assert!(!is_local_clone_source("git@github.com:Dimillian/CodexMonitor.git"));
    }
}
