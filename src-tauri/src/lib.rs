#[cfg(desktop)]
use tauri::menu::{Menu, MenuItemBuilder, PredefinedMenuItem, Submenu};
use tauri::Manager;
#[cfg(desktop)]
use tauri::{WebviewUrl, WebviewWindowBuilder};

mod backend;
mod codex;
mod event_sink;
mod cloudkit;
#[cfg(not(target_os = "ios"))]
mod git;
#[cfg(target_os = "ios")]
mod git_stub;
#[cfg(target_os = "ios")]
use git_stub as git;
mod prompts;
mod settings;
mod state;
#[cfg(not(target_os = "ios"))]
mod terminal;
#[cfg(target_os = "ios")]
mod terminal_stub;
#[cfg(target_os = "ios")]
use terminal_stub as terminal;
mod storage;
mod types;
mod utils;
mod workspaces;

#[tauri::command]
fn e2e_mark(marker: String) {
    eprintln!("[e2e] {marker}");
}

#[tauri::command]
fn e2e_quit() {
    std::process::exit(0);
}

pub fn cloudkit_cli_status_json(container_id: String) -> Result<String, String> {
    let status = cloudkit::cloudkit_cli_status(container_id)?;
    serde_json::to_string(&status).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_test_json(container_id: String) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_test(container_id)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_latest_runner_json(container_id: String) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_latest_runner(container_id)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_upsert_runner_json(container_id: String, runner_id: String) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_upsert_runner(container_id, runner_id)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_get_snapshot_json(
    container_id: String,
    runner_id: String,
    scope_key: String,
) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_get_snapshot(container_id, runner_id, scope_key)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_get_command_result_json(
    container_id: String,
    runner_id: String,
    command_id: String,
) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_get_command_result(container_id, runner_id, command_id)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_latest_command_result_json(
    container_id: String,
    runner_id: String,
) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_latest_command_result(container_id, runner_id)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

pub fn cloudkit_cli_submit_command_json(
    container_id: String,
    runner_id: String,
    payload_json: String,
) -> Result<String, String> {
    let result = cloudkit::cloudkit_cli_submit_command(container_id, runner_id, payload_json)?;
    serde_json::to_string(&result).map_err(|error| error.to_string())
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Avoid WebKit compositing issues on some Linux setups (GBM buffer errors).
        if std::env::var_os("WEBKIT_DISABLE_COMPOSITING_MODE").is_none() {
            std::env::set_var("WEBKIT_DISABLE_COMPOSITING_MODE", "1");
        }
    }

    let mut builder = tauri::Builder::default();

    #[cfg(desktop)]
    {
        builder = builder
            .enable_macos_default_menu(false)
            .menu(|handle| {
                let app_name = handle.package_info().name.clone();
                let about_item = MenuItemBuilder::with_id("about", format!("About {app_name}"))
                    .build(handle)?;
                let app_menu = Submenu::with_items(
                    handle,
                    app_name,
                    true,
                    &[
                        &about_item,
                        &PredefinedMenuItem::separator(handle)?,
                        &PredefinedMenuItem::services(handle, None)?,
                        &PredefinedMenuItem::separator(handle)?,
                        &PredefinedMenuItem::hide(handle, None)?,
                        &PredefinedMenuItem::hide_others(handle, None)?,
                        &PredefinedMenuItem::separator(handle)?,
                        &PredefinedMenuItem::quit(handle, None)?,
                    ],
                )?;

                let file_menu = Submenu::with_items(
                    handle,
                    "File",
                    true,
                    &[
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

                let view_menu = Submenu::with_items(
                    handle,
                    "View",
                    true,
                    &[&PredefinedMenuItem::fullscreen(handle, None)?],
                )?;

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
                if event.id() == "about" {
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
            });
    }

    builder
        .setup(|app| {
            let state = state::AppState::load(&app.handle());
            app.manage(state);
            cloudkit::start_cloudkit_command_poller(app.handle().clone());
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            e2e_mark,
            e2e_quit,
            settings::get_app_settings,
            settings::update_app_settings,
            cloudkit::cloudkit_status,
            cloudkit::cloudkit_test,
            cloudkit::cloudkit_local_runner_id,
            cloudkit::cloudkit_publish_presence,
            cloudkit::cloudkit_fetch_latest_runner,
            cloudkit::cloudkit_put_snapshot,
            cloudkit::cloudkit_get_snapshot,
            cloudkit::cloudkit_submit_command,
            cloudkit::cloudkit_get_command_result,
            codex::codex_doctor,
            workspaces::list_workspaces,
            workspaces::add_workspace,
            workspaces::add_worktree,
            workspaces::remove_workspace,
            workspaces::remove_worktree,
            workspaces::update_workspace_settings,
            workspaces::update_workspace_codex_bin,
            codex::start_thread,
            codex::send_user_message,
            codex::turn_interrupt,
            codex::start_review,
            codex::respond_to_server_request,
            codex::resume_thread,
            codex::list_threads,
            codex::archive_thread,
            workspaces::connect_workspace,
            git::get_git_status,
            git::get_git_diffs,
            git::get_git_log,
            git::get_git_remote,
            git::get_github_issues,
            workspaces::list_workspace_files,
            git::list_git_branches,
            git::checkout_git_branch,
            git::create_git_branch,
            codex::model_list,
            codex::account_rate_limits,
            codex::skills_list,
            prompts::prompts_list,
            terminal::terminal_open,
            terminal::terminal_write,
            terminal::terminal_resize,
            terminal::terminal_close
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
