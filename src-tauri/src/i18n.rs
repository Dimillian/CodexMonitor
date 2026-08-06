/// Lightweight translation helper for Rust-side static strings.
/// No external dependencies. `en` is the default fallback for any unknown
/// language or key. Returns the key itself when neither the requested language
/// nor English has a match (developer-facing signal).
pub(crate) fn t_rs(key: &str, lang: &str) -> String {
    match lang {
        "zh-CN" => match key {
            // ── Menu items ──────────────────────────────────────────
            "menu.about_fmt" => "关于 {0}",
            "menu.check_for_updates" => "检查更新...",
            "menu.settings" => "设置...",
            "menu.file" => "文件",
            "menu.new_agent" => "新建代理",
            "menu.new_worktree_agent" => "新建工作树代理",
            "menu.new_clone_agent" => "新建克隆代理",
            "menu.add_workspaces" => "添加工作区...",
            "menu.add_workspace_from_url" => "从 URL 添加工作区...",
            "menu.close_window" => "关闭窗口",
            "menu.quit" => "退出",
            "menu.edit" => "编辑",
            "menu.composer" => "Composer",
            "menu.cycle_model" => "切换模型",
            "menu.cycle_access_mode" => "切换访问模式",
            "menu.cycle_reasoning" => "切换推理模式",
            "menu.cycle_collaboration" => "切换协作模式",
            "menu.view" => "视图",
            "menu.toggle_projects_sidebar" => "切换项目侧边栏",
            "menu.toggle_git_sidebar" => "切换 Git 侧边栏",
            "menu.toggle_debug_panel" => "切换调试面板",
            "menu.toggle_terminal" => "切换终端",
            "menu.next_agent" => "下一个代理",
            "menu.prev_agent" => "上一个代理",
            "menu.next_workspace" => "下一个工作区",
            "menu.prev_workspace" => "上一个工作区",
            "menu.toggle_fullscreen" => "切换全屏",
            "menu.window" => "窗口",
            "menu.minimize" => "最小化",
            "menu.maximize" => "最大化",
            "menu.help" => "帮助",
            "menu.about_title" => "关于 Codex Monitor",
            // ── Tray items ──────────────────────────────────────────
            "tray.tooltip" => "Codex Monitor",
            "tray.recent_threads" => "最近的线程",
            "tray.no_recent_threads" => "暂无最近的线程",
            "tray.workspaces" => "工作区",
            "tray.current_usage" => "当前用量",
            "tray.session_fmt" => "会话: {0}",
            "tray.no_active_session" => "无活跃会话",
            "tray.weekly_fmt" => "本周: {0}",
            "tray.quit" => "退出",
            "tray.unknown_workspace" => "工作区",
            // ── Fallback: unknown key → en original text ────────────
            _ => en_value(key),
        },
        _ => en_value(key),
    }
    .to_string()
}

/// Like `t_rs` but substitutes `{0}`, `{1}`, … placeholders with the
/// provided arguments.
pub(crate) fn t_rs_fmt(key: &str, lang: &str, args: &[&str]) -> String {
    let mut result = t_rs(key, lang);
    for (i, arg) in args.iter().enumerate() {
        result = result.replace(&format!("{{{}}}", i), arg);
    }
    result
}

/// English text table – also serves as the fallback for unknown languages
/// and unknown keys.
fn en_value(key: &str) -> &'static str {
    match key {
        // ── Menu items ──────────────────────────────────────────
        "menu.about_fmt" => "About {0}",
        "menu.check_for_updates" => "Check for Updates...",
        "menu.settings" => "Settings...",
        "menu.file" => "File",
        "menu.new_agent" => "New Agent",
        "menu.new_worktree_agent" => "New Worktree Agent",
        "menu.new_clone_agent" => "New Clone Agent",
        "menu.add_workspaces" => "Add Workspaces...",
        "menu.add_workspace_from_url" => "Add Workspace from URL...",
        "menu.close_window" => "Close Window",
        "menu.quit" => "Quit",
        "menu.edit" => "Edit",
        "menu.composer" => "Composer",
        "menu.cycle_model" => "Cycle Model",
        "menu.cycle_access_mode" => "Cycle Access Mode",
        "menu.cycle_reasoning" => "Cycle Reasoning Mode",
        "menu.cycle_collaboration" => "Cycle Collaboration Mode",
        "menu.view" => "View",
        "menu.toggle_projects_sidebar" => "Toggle Projects Sidebar",
        "menu.toggle_git_sidebar" => "Toggle Git Sidebar",
        "menu.toggle_debug_panel" => "Toggle Debug Panel",
        "menu.toggle_terminal" => "Toggle Terminal",
        "menu.next_agent" => "Next Agent",
        "menu.prev_agent" => "Previous Agent",
        "menu.next_workspace" => "Next Workspace",
        "menu.prev_workspace" => "Previous Workspace",
        "menu.toggle_fullscreen" => "Toggle Full Screen",
        "menu.window" => "Window",
        "menu.minimize" => "Minimize",
        "menu.maximize" => "Maximize",
        "menu.help" => "Help",
        "menu.about_title" => "About Codex Monitor",
        // ── Tray items ──────────────────────────────────────────
        "tray.tooltip" => "Codex Monitor",
        "tray.recent_threads" => "Recent Threads",
        "tray.no_recent_threads" => "No recent threads",
        "tray.workspaces" => "Workspaces",
        "tray.current_usage" => "Current Usage",
        "tray.session_fmt" => "Session: {0}",
        "tray.no_active_session" => "No active session",
        "tray.weekly_fmt" => "Weekly: {0}",
        "tray.quit" => "Quit",
        "tray.unknown_workspace" => "Workspace",
        // ── Developer signal: unknown key ────────────────────────
        _ => key,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    // ── English hits ────────────────────────────────────────────────

    #[test]
    fn t_rs_en_menu_new_agent() {
        assert_eq!(t_rs("menu.new_agent", "en"), "New Agent");
    }

    #[test]
    fn t_rs_en_menu_quit() {
        assert_eq!(t_rs("menu.quit", "en"), "Quit");
    }

    #[test]
    fn t_rs_en_tray_recent_threads() {
        assert_eq!(t_rs("tray.recent_threads", "en"), "Recent Threads");
    }

    #[test]
    fn t_rs_en_tray_quit() {
        assert_eq!(t_rs("tray.quit", "en"), "Quit");
    }

    #[test]
    fn t_rs_en_tray_no_active_session() {
        assert_eq!(t_rs("tray.no_active_session", "en"), "No active session");
    }

    #[test]
    fn t_rs_en_tray_unknown_workspace() {
        assert_eq!(t_rs("tray.unknown_workspace", "en"), "Workspace");
    }

    #[test]
    fn t_rs_en_menu_file() {
        assert_eq!(t_rs("menu.file", "en"), "File");
    }

    #[test]
    fn t_rs_en_menu_view() {
        assert_eq!(t_rs("menu.view", "en"), "View");
    }

    #[test]
    fn t_rs_en_menu_settings() {
        assert_eq!(t_rs("menu.settings", "en"), "Settings...");
    }

    #[test]
    fn t_rs_en_about_fmt() {
        assert_eq!(t_rs("menu.about_fmt", "en"), "About {0}");
    }

    #[test]
    fn t_rs_fmt_en_about() {
        assert_eq!(
            t_rs_fmt("menu.about_fmt", "en", &["Codex Monitor"]),
            "About Codex Monitor"
        );
    }

    #[test]
    fn t_rs_fmt_en_session() {
        assert_eq!(
            t_rs_fmt("tray.session_fmt", "en", &["12% used"]),
            "Session: 12% used"
        );
    }

    // ── zh-CN hits ──────────────────────────────────────────────────

    #[test]
    fn t_rs_zh_menu_new_agent() {
        assert_eq!(t_rs("menu.new_agent", "zh-CN"), "新建代理");
    }

    #[test]
    fn t_rs_zh_menu_quit() {
        assert_eq!(t_rs("menu.quit", "zh-CN"), "退出");
    }

    #[test]
    fn t_rs_zh_tray_recent_threads() {
        assert_eq!(t_rs("tray.recent_threads", "zh-CN"), "最近的线程");
    }

    #[test]
    fn t_rs_zh_tray_quit() {
        assert_eq!(t_rs("tray.quit", "zh-CN"), "退出");
    }

    #[test]
    fn t_rs_zh_tray_unknown_workspace() {
        assert_eq!(t_rs("tray.unknown_workspace", "zh-CN"), "工作区");
    }

    #[test]
    fn t_rs_zh_about_fmt() {
        assert_eq!(t_rs("menu.about_fmt", "zh-CN"), "关于 {0}");
    }

    #[test]
    fn t_rs_fmt_zh_about() {
        assert_eq!(
            t_rs_fmt("menu.about_fmt", "zh-CN", &["Codex Monitor"]),
            "关于 Codex Monitor"
        );
    }

    #[test]
    fn t_rs_zh_menu_file() {
        assert_eq!(t_rs("menu.file", "zh-CN"), "文件");
    }

    #[test]
    fn t_rs_zh_menu_view() {
        assert_eq!(t_rs("menu.view", "zh-CN"), "视图");
    }

    #[test]
    fn t_rs_zh_menu_settings() {
        assert_eq!(t_rs("menu.settings", "zh-CN"), "设置...");
    }

    // ── Unknown key → fallback to key itself ────────────────────────

    #[test]
    fn t_rs_unknown_key_en() {
        assert_eq!(t_rs("menu.nonexistent", "en"), "menu.nonexistent");
    }

    #[test]
    fn t_rs_unknown_key_zh() {
        assert_eq!(t_rs("menu.nonexistent", "zh-CN"), "menu.nonexistent");
    }

    // ── Unknown lang → fallback to en ───────────────────────────────

    #[test]
    fn t_rs_unknown_lang_falls_back_to_en() {
        assert_eq!(t_rs("menu.new_agent", "fr"), "New Agent");
        assert_eq!(t_rs("menu.new_agent", "de"), "New Agent");
        assert_eq!(t_rs("menu.new_agent", "ja"), "New Agent");
    }

    #[test]
    fn t_rs_unknown_lang_unknown_key_falls_back_to_key() {
        assert_eq!(t_rs("menu.nonexistent", "fr"), "menu.nonexistent");
    }
}