use std::collections::HashMap;
use std::sync::Mutex;

use serde::{Deserialize, Serialize};
use tauri::AppHandle;

#[cfg(target_os = "macos")]
use tauri::image::Image;
#[cfg(target_os = "macos")]
use tauri::menu::{IsMenuItem, Menu, MenuEvent, MenuItemBuilder, PredefinedMenuItem, Submenu};
#[cfg(target_os = "macos")]
use tauri::tray::TrayIconBuilder;
#[cfg(target_os = "macos")]
use tauri::{Emitter, Manager, Runtime};

const RECENT_THREADS_SECTION_LIMIT: usize = 3;
#[cfg(target_os = "macos")]
const TRAY_ID: &str = "codex-monitor-tray";
#[cfg(target_os = "macos")]
const TRAY_QUIT_ID: &str = "tray_quit";
#[cfg(target_os = "macos")]
const TRAY_RECENT_HEADER_ID: &str = "tray_recent_header";
#[cfg(target_os = "macos")]
const TRAY_EMPTY_ID: &str = "tray_recent_empty";
#[cfg(target_os = "macos")]
const TRAY_WORKSPACES_HEADER_ID: &str = "tray_workspaces_header";
#[cfg(target_os = "macos")]
const TRAY_USAGE_HEADER_ID: &str = "tray_usage_header";
#[cfg(target_os = "macos")]
const TRAY_USAGE_SESSION_ID: &str = "tray_usage_session";
#[cfg(target_os = "macos")]
const TRAY_USAGE_WEEKLY_ID: &str = "tray_usage_weekly";
pub(crate) const TRAY_OPEN_THREAD_EVENT: &str = "tray-open-thread";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrayRecentThreadEntry {
    pub(crate) workspace_id: String,
    pub(crate) workspace_label: String,
    pub(crate) thread_id: String,
    pub(crate) thread_label: String,
    pub(crate) updated_at: i64,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TrayOpenThreadPayload {
    pub(crate) workspace_id: String,
    pub(crate) thread_id: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub(crate) struct TraySessionUsage {
    pub(crate) session_label: String,
    pub(crate) weekly_label: Option<String>,
}

#[derive(Default)]
pub(crate) struct TrayState {
    tray_threads: Mutex<Vec<TrayRecentThreadEntry>>,
    session_usage: Mutex<Option<TraySessionUsage>>,
    thread_targets_by_menu_id: Mutex<HashMap<String, TrayOpenThreadPayload>>,
}

#[tauri::command]
pub(crate) fn set_tray_recent_threads<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TrayState>,
    entries: Vec<TrayRecentThreadEntry>,
) -> Result<(), String> {
    let normalized = normalize_tray_threads(entries);
    {
        let mut tray_threads = state
            .tray_threads
            .lock()
            .map_err(|_| "failed to lock tray threads".to_string())?;
        if *tray_threads == normalized {
            return Ok(());
        }
        *tray_threads = normalized;
    }

    #[cfg(target_os = "macos")]
    update_tray_menu(&app, &state)?;

    Ok(())
}

#[tauri::command]
pub(crate) fn set_tray_session_usage<R: tauri::Runtime>(
    app: AppHandle<R>,
    state: tauri::State<'_, TrayState>,
    usage: Option<TraySessionUsage>,
) -> Result<(), String> {
    let normalized = normalize_session_usage(usage);
    {
        let mut session_usage = state
            .session_usage
            .lock()
            .map_err(|_| "failed to lock tray session usage".to_string())?;
        if *session_usage == normalized {
            return Ok(());
        }
        *session_usage = normalized;
    }

    #[cfg(target_os = "macos")]
    update_tray_menu(&app, &state)?;

    Ok(())
}

#[cfg(target_os = "macos")]
pub(crate) fn initialize<R: Runtime>(
    app: &tauri::AppHandle<R>,
    state: &TrayState,
) -> tauri::Result<()> {
    let menu = build_tray_menu(app, state)?;
    let builder = TrayIconBuilder::with_id(TRAY_ID)
        .menu(&menu)
        .tooltip("Codex Monitor")
        .show_menu_on_left_click(true)
        .icon(load_tray_icon()?)
        .icon_as_template(true)
        .on_menu_event(handle_tray_menu_event::<R>);

    builder.build(app)?;
    Ok(())
}

#[cfg(not(target_os = "macos"))]
pub(crate) fn initialize<R: tauri::Runtime>(
    _app: &tauri::AppHandle<R>,
    _state: &TrayState,
) -> tauri::Result<()> {
    Ok(())
}

fn normalize_tray_threads(entries: Vec<TrayRecentThreadEntry>) -> Vec<TrayRecentThreadEntry> {
    let mut deduped = HashMap::<(String, String), TrayRecentThreadEntry>::new();
    for entry in entries.into_iter() {
        let workspace_id = entry.workspace_id.trim();
        let thread_id = entry.thread_id.trim();
        let thread_label = entry.thread_label.trim();
        let workspace_label = entry.workspace_label.trim();
        if workspace_id.is_empty()
            || thread_id.is_empty()
            || thread_label.is_empty()
            || workspace_label.is_empty()
        {
            continue;
        }
        let key = (workspace_id.to_string(), thread_id.to_string());
        let should_replace = deduped
            .get(&key)
            .map(|current| entry.updated_at > current.updated_at)
            .unwrap_or(true);
        if should_replace {
            deduped.insert(
                key,
                TrayRecentThreadEntry {
                    workspace_id: workspace_id.to_string(),
                    workspace_label: workspace_label.to_string(),
                    thread_id: thread_id.to_string(),
                    thread_label: thread_label.to_string(),
                    updated_at: entry.updated_at,
                },
            );
        }
    }

    let mut normalized: Vec<_> = deduped.into_values().collect();
    normalized.sort_by(|left, right| {
        right
            .updated_at
            .cmp(&left.updated_at)
            .then_with(|| left.thread_label.cmp(&right.thread_label))
            .then_with(|| left.workspace_label.cmp(&right.workspace_label))
    });
    normalized
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrayThreadMenuItem {
    menu_id: String,
    label: String,
    payload: TrayOpenThreadPayload,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrayWorkspaceMenuSection {
    workspace_label: String,
    newest_updated_at: i64,
    items: Vec<TrayThreadMenuItem>,
}

#[derive(Debug, Clone, PartialEq, Eq)]
struct TrayThreadMenuSections {
    recent: Vec<TrayThreadMenuItem>,
    workspaces: Vec<TrayWorkspaceMenuSection>,
}

fn build_thread_menu_item(menu_id: String, entry: &TrayRecentThreadEntry) -> TrayThreadMenuItem {
    TrayThreadMenuItem {
        menu_id,
        label: entry.thread_label.clone(),
        payload: TrayOpenThreadPayload {
            workspace_id: entry.workspace_id.clone(),
            thread_id: entry.thread_id.clone(),
        },
    }
}

fn build_thread_menu_sections(entries: &[TrayRecentThreadEntry]) -> TrayThreadMenuSections {
    let recent = entries
        .iter()
        .take(RECENT_THREADS_SECTION_LIMIT)
        .enumerate()
        .map(|(index, entry)| build_thread_menu_item(format!("tray_recent_{index}"), entry))
        .collect();

    let mut workspace_entries_by_id = HashMap::<String, Vec<TrayRecentThreadEntry>>::new();
    for entry in entries {
        workspace_entries_by_id
            .entry(entry.workspace_id.clone())
            .or_default()
            .push(entry.clone());
    }

    let mut workspaces: Vec<_> = workspace_entries_by_id
        .into_iter()
        .map(|(_, mut workspace_entries)| {
            workspace_entries.sort_by(|left, right| {
                right
                    .updated_at
                    .cmp(&left.updated_at)
                    .then_with(|| left.thread_label.cmp(&right.thread_label))
            });
            let workspace_label = workspace_entries
                .first()
                .map(|entry| entry.workspace_label.clone())
                .unwrap_or_else(|| "Workspace".to_string());
            let newest_updated_at = workspace_entries
                .first()
                .map(|entry| entry.updated_at)
                .unwrap_or_default();
            let items = workspace_entries
                .iter()
                .enumerate()
                .map(|(_, entry)| build_thread_menu_item(String::new(), entry))
                .collect();

            TrayWorkspaceMenuSection {
                workspace_label,
                newest_updated_at,
                items,
            }
        })
        .collect();

    workspaces.sort_by(|left, right| {
        right
            .newest_updated_at
            .cmp(&left.newest_updated_at)
            .then_with(|| left.workspace_label.cmp(&right.workspace_label))
    });

    for (workspace_index, workspace) in workspaces.iter_mut().enumerate() {
        for (thread_index, item) in workspace.items.iter_mut().enumerate() {
            item.menu_id = format!("tray_workspace_{workspace_index}_{thread_index}");
        }
    }

    TrayThreadMenuSections { recent, workspaces }
}

fn collect_thread_menu_targets(
    sections: &TrayThreadMenuSections,
) -> HashMap<String, TrayOpenThreadPayload> {
    let mut targets = HashMap::new();
    for item in &sections.recent {
        targets.insert(item.menu_id.clone(), item.payload.clone());
    }
    for workspace in &sections.workspaces {
        for item in &workspace.items {
            targets.insert(item.menu_id.clone(), item.payload.clone());
        }
    }
    targets
}

fn normalize_session_usage(usage: Option<TraySessionUsage>) -> Option<TraySessionUsage> {
    let usage = usage?;
    let session_label = usage.session_label.trim();
    if session_label.is_empty() {
        return None;
    }
    let weekly_label = usage
        .weekly_label
        .as_ref()
        .map(|label| label.trim())
        .filter(|label| !label.is_empty())
        .map(ToString::to_string);

    Some(TraySessionUsage {
        session_label: session_label.to_string(),
        weekly_label,
    })
}

#[cfg(target_os = "macos")]
fn update_tray_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    state: &TrayState,
) -> Result<(), String> {
    let menu = build_tray_menu(app, state).map_err(|error| error.to_string())?;
    let tray = app
        .tray_by_id(TRAY_ID)
        .ok_or_else(|| "tray icon not initialized".to_string())?;
    tray.set_menu(Some(menu)).map_err(|error| error.to_string())
}

#[cfg(target_os = "macos")]
fn build_tray_menu<R: Runtime>(
    app: &tauri::AppHandle<R>,
    state: &TrayState,
) -> tauri::Result<Menu<R>> {
    let menu = Menu::new(app)?;
    let tray_threads = state
        .tray_threads
        .lock()
        .map(|entries| entries.clone())
        .unwrap_or_default();
    let session_usage = state
        .session_usage
        .lock()
        .map(|usage| usage.clone())
        .unwrap_or_default();
    let thread_sections = build_thread_menu_sections(&tray_threads);
    let usage_items = build_usage_menu_items(app, session_usage.as_ref())?;
    if let Ok(mut targets) = state.thread_targets_by_menu_id.lock() {
        *targets = collect_thread_menu_targets(&thread_sections);
    }

    let recent_header = MenuItemBuilder::with_id(TRAY_RECENT_HEADER_ID, "Recent Threads")
        .enabled(false)
        .build(app)?;
    menu.append(&recent_header)?;

    if thread_sections.recent.is_empty() {
        let empty_item = MenuItemBuilder::with_id(TRAY_EMPTY_ID, "No recent threads")
            .enabled(false)
            .build(app)?;
        menu.append(&empty_item)?;
    } else {
        append_thread_menu_items(app, &menu, &thread_sections.recent)?;
    }

    if !thread_sections.workspaces.is_empty() {
        let thread_separator = PredefinedMenuItem::separator(app)?;
        menu.append(&thread_separator)?;

        let workspace_header = MenuItemBuilder::with_id(TRAY_WORKSPACES_HEADER_ID, "Workspaces")
            .enabled(false)
            .build(app)?;
        menu.append(&workspace_header)?;

        append_workspace_submenus(app, &menu, &thread_sections.workspaces)?;
    }

    let usage_separator = PredefinedMenuItem::separator(app)?;
    menu.append(&usage_separator)?;
    for item in &usage_items {
        menu.append(item)?;
    }
    let quit_separator = PredefinedMenuItem::separator(app)?;
    menu.append(&quit_separator)?;
    let quit_item = MenuItemBuilder::with_id(TRAY_QUIT_ID, "Quit").build(app)?;
    menu.append(&quit_item)?;
    Ok(menu)
}

#[cfg(target_os = "macos")]
fn append_thread_menu_items<R: Runtime>(
    app: &tauri::AppHandle<R>,
    menu: &Menu<R>,
    items: &[TrayThreadMenuItem],
) -> tauri::Result<()> {
    for item in items {
        let menu_item = MenuItemBuilder::with_id(item.menu_id.clone(), &item.label).build(app)?;
        menu.append(&menu_item)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn append_workspace_submenus<R: Runtime>(
    app: &tauri::AppHandle<R>,
    menu: &Menu<R>,
    workspaces: &[TrayWorkspaceMenuSection],
) -> tauri::Result<()> {
    for workspace in workspaces {
        let submenu_items = workspace
            .items
            .iter()
            .map(|item| MenuItemBuilder::with_id(item.menu_id.clone(), &item.label).build(app))
            .collect::<tauri::Result<Vec<_>>>()?;
        let submenu_refs: Vec<&dyn IsMenuItem<R>> = submenu_items
            .iter()
            .map(|item| item as &dyn IsMenuItem<R>)
            .collect();
        let submenu = Submenu::with_items(app, &workspace.workspace_label, true, &submenu_refs)?;
        menu.append(&submenu)?;
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn build_usage_menu_items<R: Runtime>(
    app: &tauri::AppHandle<R>,
    usage: Option<&TraySessionUsage>,
) -> tauri::Result<Vec<tauri::menu::MenuItem<R>>> {
    let labels = build_usage_menu_labels(usage);
    let mut items = Vec::with_capacity(3);
    let header = MenuItemBuilder::with_id(TRAY_USAGE_HEADER_ID, &labels.0)
        .enabled(false)
        .build(app)?;
    items.push(header);
    let session = MenuItemBuilder::with_id(TRAY_USAGE_SESSION_ID, &labels.1)
        .enabled(false)
        .build(app)?;
    items.push(session);
    if let Some(weekly_label) = labels.2 {
        let weekly = MenuItemBuilder::with_id(TRAY_USAGE_WEEKLY_ID, &weekly_label)
            .enabled(false)
            .build(app)?;
        items.push(weekly);
    }
    Ok(items)
}

fn build_usage_menu_labels(usage: Option<&TraySessionUsage>) -> (String, String, Option<String>) {
    (
        "Current Usage".to_string(),
        usage
            .map(|usage| format!("Session: {}", usage.session_label))
            .unwrap_or_else(|| "No active session".to_string()),
        usage
            .map(|usage| usage.weekly_label.clone())
            .unwrap_or(None)
            .map(|label| format!("Weekly: {label}")),
    )
}

#[cfg(target_os = "macos")]
fn handle_tray_menu_event<R: Runtime>(app: &tauri::AppHandle<R>, event: MenuEvent) {
    match event.id().as_ref() {
        TRAY_QUIT_ID => app.exit(0),
        id => {
            let state = app.state::<TrayState>();
            let payload = state
                .thread_targets_by_menu_id
                .lock()
                .ok()
                .and_then(|targets| targets.get(id).cloned());
            if let Some(payload) = payload {
                show_main_window(app);
                emit_open_thread_event(app, payload);
            }
        }
    }
}

#[cfg(target_os = "macos")]
fn show_main_window<R: Runtime>(app: &tauri::AppHandle<R>) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.show();
        let _ = window.unminimize();
        let _ = window.set_focus();
    }
}

#[cfg(target_os = "macos")]
fn emit_open_thread_event<R: Runtime>(app: &tauri::AppHandle<R>, payload: TrayOpenThreadPayload) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(TRAY_OPEN_THREAD_EVENT, payload);
    } else {
        let _ = app.emit(TRAY_OPEN_THREAD_EVENT, payload);
    }
}

#[cfg(target_os = "macos")]
fn load_tray_icon() -> tauri::Result<Image<'static>> {
    Image::from_bytes(include_bytes!("../icons/tray-icon.png")).map(|image| image.to_owned())
}

#[cfg(test)]
mod tests {
    use super::{
        build_thread_menu_sections, build_usage_menu_labels, collect_thread_menu_targets,
        normalize_session_usage, normalize_tray_threads, TrayOpenThreadPayload,
        TrayRecentThreadEntry, TraySessionUsage, RECENT_THREADS_SECTION_LIMIT,
    };

    fn recent_entry(
        workspace_id: &str,
        workspace_label: &str,
        thread_id: &str,
        thread_label: &str,
        updated_at: i64,
    ) -> TrayRecentThreadEntry {
        TrayRecentThreadEntry {
            workspace_id: workspace_id.to_string(),
            workspace_label: workspace_label.to_string(),
            thread_id: thread_id.to_string(),
            thread_label: thread_label.to_string(),
            updated_at,
        }
    }

    #[test]
    fn normalize_tray_threads_sorts_and_deduplicates_without_truncating() {
        let entries = vec![
            recent_entry("ws-1", "One", "t-1", "Alpha", 10),
            recent_entry("ws-2", "Two", "t-2", "Beta", 50),
            recent_entry("ws-1", "One", "t-1", "Alpha", 20),
            recent_entry(" ", "Two", "t-3", "Ignored", 30),
        ]
        .into_iter()
        .chain((0..12).map(|index| {
            recent_entry(
                "ws-extra",
                "Extra",
                &format!("t-extra-{index}"),
                &format!("Thread {index}"),
                index,
            )
        }))
        .collect();

        let normalized = normalize_tray_threads(entries);

        assert_eq!(normalized.len(), 14);
        assert_eq!(normalized[0].thread_id, "t-2");
        assert_eq!(normalized[1].thread_id, "t-1");
        assert_eq!(normalized[1].updated_at, 20);
        assert!(!normalized
            .iter()
            .any(|entry| entry.thread_label == "Ignored"));
    }

    #[test]
    fn build_thread_menu_sections_groups_recent_threads_and_workspaces() {
        let normalized = normalize_tray_threads(vec![
            recent_entry("ws-1", "One", "t-1", "Alpha", 100),
            recent_entry("ws-2", "Two", "t-2", "Beta", 110),
            recent_entry("ws-1", "One", "t-3", "Gamma", 90),
            recent_entry("ws-3", "Three", "t-4", "Delta", 105),
            recent_entry("ws-2", "Two", "t-5", "Epsilon", 95),
        ]);

        let sections = build_thread_menu_sections(&normalized);

        assert_eq!(sections.recent.len(), RECENT_THREADS_SECTION_LIMIT);
        assert_eq!(
            sections
                .recent
                .iter()
                .map(|item| item.payload.thread_id.as_str())
                .collect::<Vec<_>>(),
            vec!["t-2", "t-4", "t-1"]
        );
        assert_eq!(
            sections
                .workspaces
                .iter()
                .map(|workspace| workspace.workspace_label.as_str())
                .collect::<Vec<_>>(),
            vec!["Two", "Three", "One"]
        );
        assert_eq!(
            sections.workspaces[0]
                .items
                .iter()
                .map(|item| item.payload.thread_id.as_str())
                .collect::<Vec<_>>(),
            vec!["t-2", "t-5"]
        );
        assert_eq!(
            sections.workspaces[1]
                .items
                .iter()
                .map(|item| item.payload.thread_id.as_str())
                .collect::<Vec<_>>(),
            vec!["t-4"]
        );
        assert_eq!(
            sections.workspaces[2]
                .items
                .iter()
                .map(|item| item.payload.thread_id.as_str())
                .collect::<Vec<_>>(),
            vec!["t-1", "t-3"]
        );
    }

    #[test]
    fn collect_thread_menu_targets_maps_recent_and_workspace_items() {
        let normalized = normalize_tray_threads(vec![
            recent_entry("ws-1", "One", "t-1", "Alpha", 100),
            recent_entry("ws-2", "Two", "t-2", "Beta", 110),
            recent_entry("ws-1", "One", "t-3", "Gamma", 90),
            recent_entry("ws-3", "Three", "t-4", "Delta", 105),
        ]);

        let sections = build_thread_menu_sections(&normalized);
        let targets = collect_thread_menu_targets(&sections);

        assert_eq!(
            targets.get("tray_recent_0"),
            Some(&TrayOpenThreadPayload {
                workspace_id: "ws-2".into(),
                thread_id: "t-2".into(),
            })
        );
        assert_eq!(
            targets.get("tray_workspace_0_0"),
            Some(&TrayOpenThreadPayload {
                workspace_id: "ws-2".into(),
                thread_id: "t-2".into(),
            })
        );
        assert_eq!(
            targets.get("tray_workspace_1_0"),
            Some(&TrayOpenThreadPayload {
                workspace_id: "ws-3".into(),
                thread_id: "t-4".into(),
            })
        );
        assert_eq!(
            targets.get("tray_workspace_2_1"),
            Some(&TrayOpenThreadPayload {
                workspace_id: "ws-1".into(),
                thread_id: "t-3".into(),
            })
        );
    }

    #[test]
    fn tray_open_payload_round_trips_expected_fields() {
        let payload = TrayOpenThreadPayload {
            workspace_id: "ws-1".into(),
            thread_id: "thread-1".into(),
        };

        assert_eq!(payload.workspace_id, "ws-1");
        assert_eq!(payload.thread_id, "thread-1");
    }

    #[test]
    fn normalize_session_usage_discards_blank_labels() {
        assert_eq!(normalize_session_usage(None), None);
        assert_eq!(
            normalize_session_usage(Some(TraySessionUsage {
                session_label: "   ".into(),
                weekly_label: None,
            })),
            None
        );
        assert_eq!(
            normalize_session_usage(Some(TraySessionUsage {
                session_label: " 12% used ".into(),
                weekly_label: Some(" 67% used ".into()),
            })),
            Some(TraySessionUsage {
                session_label: "12% used".into(),
                weekly_label: Some("67% used".into()),
            })
        );
    }

    #[test]
    fn build_usage_menu_labels_include_current_usage_section() {
        assert_eq!(
            build_usage_menu_labels(Some(&TraySessionUsage {
                session_label: "12% used · Resets 2 hours".into(),
                weekly_label: Some("67% used · Resets in 2 days".into()),
            })),
            (
                "Current Usage".into(),
                "Session: 12% used · Resets 2 hours".into(),
                Some("Weekly: 67% used · Resets in 2 days".into()),
            )
        );
        assert_eq!(
            build_usage_menu_labels(None),
            ("Current Usage".into(), "No active session".into(), None)
        );
    }
}
