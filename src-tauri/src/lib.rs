use tauri::Manager;

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
mod menu;
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
        .manage(menu::MenuItemRegistry::<tauri::Wry>::default())
        .menu(menu::build_menu)
        .on_menu_event(menu::handle_menu_event)
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
            menu::menu_set_accelerators,
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
