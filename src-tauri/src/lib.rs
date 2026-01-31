use tauri::Manager;
#[cfg(target_os = "macos")]
use tauri::{RunEvent, WindowEvent};

mod backend;
mod gemini;
mod files;
mod dictation;
mod event_sink;
mod git;
mod git_utils;
mod local_usage;
mod menu;
mod prompts;
mod remote_backend;
mod rules;
mod settings;
mod state;
mod storage;
mod shared;
mod terminal;
mod types;
mod utils;
mod window;
mod workspaces;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    #[cfg(target_os = "linux")]
    {
        // Avoid WebKit compositing issues on NVIDIA Linux setups (GBM buffer errors).
        if std::env::var_os("__NV_PRIME_RENDER_OFFLOAD").is_none() {
            std::env::set_var("__NV_PRIME_RENDER_OFFLOAD", "1");
        }
    }

    let builder = tauri::Builder::default()
        .enable_macos_default_menu(false)
        .manage(menu::MenuItemRegistry::<tauri::Wry>::default())
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event)
        .on_window_event(|window, event| {
            if window.label() != "main" {
                return;
            }
            #[cfg(target_os = "macos")]
            if let WindowEvent::CloseRequested { api, .. } = event {
                api.prevent_close();
                let _ = window.hide();
            }
        })
        .setup(|app| {
            let state = state::AppState::load(&app.handle());
            app.manage(state);
            #[cfg(desktop)]
            {
                app.handle()
                    .plugin(tauri_plugin_updater::Builder::new().build())?;
            }
            Ok(())
        });

    #[cfg(desktop)]
    let builder = builder.plugin(tauri_plugin_window_state::Builder::default().build());

    let app = builder
        .plugin(tauri_plugin_liquid_glass::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_process::init())
        .invoke_handler(tauri::generate_handler![
            settings::get_app_settings,
            settings::update_app_settings,
            settings::get_gemini_config_path,
            files::file_read,
            files::file_write,
            gemini::get_config_model,
            menu::menu_set_accelerators,
            gemini::gemini_doctor,
            workspaces::list_workspaces,
            workspaces::is_workspace_path_dir,
            workspaces::add_workspace,
            workspaces::add_clone,
            workspaces::add_worktree,
            workspaces::worktree_setup_status,
            workspaces::worktree_setup_mark_ran,
            workspaces::remove_workspace,
            workspaces::remove_worktree,
            workspaces::rename_worktree,
            workspaces::rename_worktree_upstream,
            workspaces::apply_worktree_changes,
            workspaces::update_workspace_settings,
            workspaces::update_workspace_gemini_bin,
            gemini::start_thread,
            gemini::send_user_message,
            gemini::turn_interrupt,
            gemini::start_review,
            gemini::respond_to_server_request,
            gemini::remember_approval_rule,
            gemini::get_commit_message_prompt,
            gemini::generate_commit_message,
            gemini::generate_run_metadata,
            gemini::resume_thread,
            gemini::fork_thread,
            gemini::list_threads,
            gemini::list_mcp_server_status,
            gemini::archive_thread,
            gemini::collaboration_mode_list,
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
            workspaces::read_workspace_file,
            workspaces::open_workspace_in,
            workspaces::get_open_app_icon,
            git::list_git_branches,
            git::checkout_git_branch,
            git::create_git_branch,
            gemini::model_list,
            gemini::account_rate_limits,
            gemini::account_read,
            gemini::gemini_login,
            gemini::gemini_login_cancel,
            gemini::skills_list,
            gemini::get_gemini_settings,
            gemini::update_gemini_settings,
            gemini::get_mcp_config,
            gemini::get_gemini_settings_path,
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
            dictation::dictation_request_permission,
            dictation::dictation_stop,
            dictation::dictation_cancel,
            local_usage::local_usage_snapshot
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    app.run(|app_handle, event| {
        #[cfg(target_os = "macos")]
        if let RunEvent::Reopen { .. } = event {
            if let Some(window) = app_handle.get_webview_window("main") {
                let _ = window.show();
                let _ = window.set_focus();
            }
        }
    });
}
