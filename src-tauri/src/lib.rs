use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::{Emitter, Manager, WebviewUrl, WebviewWindowBuilder};

mod backend;
mod codex;
mod codex_home;
mod codex_config;
#[cfg(not(target_os = "windows"))]
#[path = "dictation.rs"]
mod dictation;
#[cfg(target_os = "windows")]
#[path = "dictation_stub.rs"]
mod dictation;
mod event_sink;
mod git;
mod git_utils;
mod local_usage;
mod prompts;
mod remote_backend;
mod rules;
mod settings;
mod state;
mod terminal;
mod window;
mod storage;
mod types;
mod utils;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Avoid WebKit compositing issues on some Linux setups (GBM buffer errors).
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    tauri::Builder::default()
        .enable_macos_default_menu(false)
        .menu(|handle| {
            let app_name = handle.package_info().name.clone();
            let about_item = MenuItemBuilder::with_id("about", format!("About {app_name}"))
                .build(handle)?;
            let check_updates_item =
                MenuItemBuilder::with_id("check_for_updates", "Check for Updates...")
                    .build(handle)?;
            let settings_item =
                MenuItemBuilder::with_id("file_open_settings", "Settings...").build(handle)?;
            let app_menu = Submenu::with_items(
                handle,
                app_name.clone(),
                true,
                &[
                    &about_item,
                    &check_updates_item,
                    &settings_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::services(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::hide(handle, None)?,
                    &PredefinedMenuItem::hide_others(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let new_agent_item =
                MenuItemBuilder::with_id("file_new_agent", "New Agent").build(handle)?;
            let new_worktree_agent_item =
                MenuItemBuilder::with_id("file_new_worktree_agent", "New Worktree Agent")
                    .build(handle)?;
            let new_clone_agent_item =
                MenuItemBuilder::with_id("file_new_clone_agent", "New Clone Agent")
                    .build(handle)?;
            let add_workspace_item =
                MenuItemBuilder::with_id("file_add_workspace", "Add Workspace...").build(handle)?;

            #[cfg(target_os = "linux")]
            let file_menu = {
                let close_window_item =
                    MenuItemBuilder::with_id("file_close_window", "Close Window").build(handle)?;
                let quit_item = MenuItemBuilder::with_id("file_quit", "Quit").build(handle)?;
                Submenu::with_items(
                    handle,
                    "File",
                    true,
                    &[
                        &new_agent_item,
                        &new_worktree_agent_item,
                        &new_clone_agent_item,
                        &PredefinedMenuItem::separator(handle)?,
                        &add_workspace_item,
                        &PredefinedMenuItem::separator(handle)?,
                        &close_window_item,
                        &quit_item,
                    ],
                )?
            };
            #[cfg(not(target_os = "linux"))]
            let file_menu = Submenu::with_items(
                handle,
                "File",
                true,
                &[
                    &new_agent_item,
                    &new_worktree_agent_item,
                    &new_clone_agent_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &add_workspace_item,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                    #[cfg(not(target_os = "macos"))]
                    &PredefinedMenuItem::quit(handle, None)?,
                ],
            )?;

            let edit_menu = Submenu::with_items(
                handle,
                "Edit",
                true,
                &[
                    &PredefinedMenuItem::undo(handle, None)?,
                    &PredefinedMenuItem::redo(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::cut(handle, None)?,
                    &PredefinedMenuItem::copy(handle, None)?,
                    &PredefinedMenuItem::paste(handle, None)?,
                    &PredefinedMenuItem::select_all(handle, None)?,
                ],
            )?;

            #[cfg(target_os = "linux")]
            let view_menu = {
                let fullscreen_item =
                    MenuItemBuilder::with_id("view_fullscreen", "Toggle Full Screen")
                        .build(handle)?;
                Submenu::with_items(handle, "View", true, &[&fullscreen_item])?
            };
            #[cfg(not(target_os = "linux"))]
            let view_menu = Submenu::with_items(
                handle,
                "View",
                true,
                &[&PredefinedMenuItem::fullscreen(handle, None)?],
            )?;

            #[cfg(target_os = "linux")]
            let window_menu = {
                let minimize_item =
                    MenuItemBuilder::with_id("window_minimize", "Minimize").build(handle)?;
                let maximize_item =
                    MenuItemBuilder::with_id("window_maximize", "Maximize").build(handle)?;
                let close_item =
                    MenuItemBuilder::with_id("window_close", "Close Window").build(handle)?;
                Submenu::with_items(
                    handle,
                    "Window",
                    true,
                    &[
                        &minimize_item,
                        &maximize_item,
                        &PredefinedMenuItem::separator(handle)?,
                        &close_item,
                    ],
                )?
            };
            #[cfg(not(target_os = "linux"))]
            let window_menu = Submenu::with_items(
                handle,
                "Window",
                true,
                &[
                    &PredefinedMenuItem::minimize(handle, None)?,
                    &PredefinedMenuItem::maximize(handle, None)?,
                    &PredefinedMenuItem::separator(handle)?,
                    &PredefinedMenuItem::close_window(handle, None)?,
                ],
            )?;

            #[cfg(target_os = "linux")]
            let help_menu = {
                let about_item =
                    MenuItemBuilder::with_id("help_about", format!("About {app_name}"))
                        .build(handle)?;
                Submenu::with_items(handle, "Help", true, &[&about_item])?
            };
            #[cfg(not(target_os = "linux"))]
            let help_menu = Submenu::with_items(handle, "Help", true, &[])?;

            Menu::with_items(
                handle,
                &[
                    &app_menu,
                    &file_menu,
                    &edit_menu,
                    &view_menu,
                    &window_menu,
                    &help_menu,
                ],
            )
        })
        .on_menu_event(|app, event| {
            match event.id().as_ref() {
                "about" | "help_about" => {
                    if let Some(window) = app.get_webview_window("about") {
                        let _ = window.show();
                        let _ = window.set_focus();
                        return;
                    }
                    let _ = WebviewWindowBuilder::new(
                        app,
                        "about",
                        WebviewUrl::App("index.html".into()),
                    )
                    .title("About Codex Monitor")
                    .resizable(false)
                    .inner_size(360.0, 240.0)
                    .center()
                    .build();
                }
                "check_for_updates" => {
                    let _ = app.emit("updater-check", ());
                }
                "file_new_agent" => {
                    emit_menu_event(app, "menu-new-agent");
                }
                "file_new_worktree_agent" => {
                    emit_menu_event(app, "menu-new-worktree-agent");
                }
                "file_new_clone_agent" => {
                    emit_menu_event(app, "menu-new-clone-agent");
                }
                "file_add_workspace" => {
                    emit_menu_event(app, "menu-add-workspace");
                }
                "file_open_settings" => {
                    emit_menu_event(app, "menu-open-settings");
                }
                "file_close_window" | "window_close" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.close();
                    }
                }
                "file_quit" => {
                    app.exit(0);
                }
                "view_fullscreen" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let is_fullscreen = window.is_fullscreen().unwrap_or(false);
                        let _ = window.set_fullscreen(!is_fullscreen);
                    }
                }
                "window_minimize" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.minimize();
                    }
                }
                "window_maximize" => {
                    if let Some(window) = app.get_webview_window("main") {
                        let _ = window.maximize();
                    }
                }
                _ => {}
            }
        })
        .setup(|app| {
            let state = state::AppState::load(&app.handle());
            app.manage(state);
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            settings::get_app_settings,
            settings::update_app_settings,
            codex::codex_doctor,
            workspaces::list_workspaces,
            workspaces::add_workspace,
            workspaces::add_clone,
            workspaces::add_worktree,
            workspaces::remove_workspace,
            workspaces::remove_worktree,
            workspaces::rename_worktree,
            workspaces::rename_worktree_upstream,
            workspaces::apply_worktree_changes,
            workspaces::update_workspace_settings,
            workspaces::update_workspace_codex_bin,
            codex::start_thread,
            codex::send_user_message,
            codex::turn_interrupt,
            codex::start_review,
            codex::respond_to_server_request,
            codex::remember_approval_rule,
            codex::get_commit_message_prompt,
            codex::generate_commit_message,
            codex::resume_thread,
            codex::list_threads,
            codex::archive_thread,
            codex::collaboration_mode_list,
            workspaces::connect_workspace,
            git::get_git_status,
            git::list_git_roots,
            git::get_git_diffs,
            git::get_git_log,
            git::get_git_commit_diff,
            git::get_git_remote,
            git::stage_git_file,
            git::stage_git_all,
            git::unstage_git_file,
            git::revert_git_file,
            git::revert_git_all,
            git::commit_git,
            git::push_git,
            git::pull_git,
            git::sync_git,
            git::get_github_issues,
            git::get_github_pull_requests,
            git::get_github_pull_request_diff,
            git::get_github_pull_request_comments,
            workspaces::list_workspace_files,
            workspaces::open_workspace_in,
            git::list_git_branches,
            git::checkout_git_branch,
            git::create_git_branch,
            codex::model_list,
            codex::account_rate_limits,
            codex::skills_list,
            prompts::prompts_list,
            prompts::prompts_create,
            prompts::prompts_update,
            prompts::prompts_delete,
            prompts::prompts_move,
            prompts::prompts_workspace_dir,
            prompts::prompts_global_dir,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close,
            dictation::dictation_model_status,
            dictation::dictation_download_model,
            dictation::dictation_cancel_download,
            dictation::dictation_remove_model,
            dictation::dictation_start,
            dictation::dictation_stop,
            dictation::dictation_cancel,
            local_usage::local_usage_snapshot
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
fn emit_menu_event<R: tauri::Runtime>(app: &tauri::AppHandle<R>, event: &str) {
    if let Some(window) = app.get_webview_window("main") {
        let _ = window.emit(event, ());
    } else {
        let _ = app.emit(event, ());
    }
}
