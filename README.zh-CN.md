# CodexMonitor

语言：[English](README.md) | 简体中文

[![gitcgr](https://gitcgr.com/badge/Dimillian/CodexMonitor.svg)](https://gitcgr.com/Dimillian/CodexMonitor)

![CodexMonitor](screenshot.png)

CodexMonitor 是一个 Tauri 应用，用于在本地工作区之间编排多个 Codex 智能体。它提供项目侧边栏、用于快速操作的首页，以及基于 Codex app-server 协议的会话视图。

## 功能

### 工作区与线程

- 添加并持久化工作区，支持分组/排序，并可从首页仪表盘快速进入最近的智能体活动。
- 为每个工作区启动一个 `codex app-server`，恢复线程，并跟踪未读/运行状态。
- 使用工作树和克隆智能体进行隔离开发；工作树位于应用数据目录下（仍支持旧版 `.codex-worktrees`）。
- 线程管理：置顶、重命名、归档、复制、每线程草稿，以及停止/中断正在运行的 turn。
- 可选远程后端（daemon）模式，用于在另一台机器上运行 Codex。
- 为自托管连接提供远程设置辅助（TCP 模式下的 Tailscale 检测和主机引导）。

### 输入框与智能体控制

- 支持图片附件（选择器、拖放、粘贴）和可配置的跟进消息行为（运行中使用 `Queue` 或 `Steer`）。
- 使用 `Shift+Cmd+Enter`（macOS）或 `Shift+Ctrl+Enter`（Windows/Linux）为单条消息发送相反的跟进行为。
- 支持技能（`$`）、提示词（`/prompts:`）、评审（`/review`）和文件路径（`@`）自动补全。
- 模型选择器、协作模式（启用时）、推理强度、访问模式和上下文用量环。
- 按住说话快捷键和实时波形的语音输入（Whisper）。
- 渲染推理、工具、Diff 项，并处理审批提示。

### Git 与 GitHub

- Diff 统计、已暂存/未暂存文件 Diff、还原/暂存控制和提交日志。
- 分支列表，支持检出/创建，并显示上游 ahead/behind 数量。
- 通过 `gh` 集成 GitHub Issues 和 Pull Requests（列表、Diff、评论），并可在浏览器中打开提交/PR。
- PR 输入：使用“Ask PR”把 PR 上下文发送到新的智能体线程。

### 文件与提示词

- 文件树支持搜索、文件类型图标，以及在 Finder/Explorer 中显示。
- 全局/工作区提示词库：创建、编辑、删除、移动，并可在当前线程或新线程中运行。

### UI 与体验

- 可调整大小的侧边栏、右侧面板、计划面板、终端和调试面板，并持久化尺寸。
- 响应式布局（桌面、平板、手机）和标签式导航。
- 侧边栏用量与账号限额仪表，以及首页用量快照。
- 支持多标签的终端 Dock，用于后台命令（实验性）。
- 应用内更新、调试面板复制/清除、声音通知，以及平台特定窗口效果（macOS overlay title bar + vibrancy）和降低透明度开关。

## 运行要求

- Node.js + npm
- Rust stable 工具链
- CMake（原生依赖需要；语音输入/Whisper 会使用）
- LLVM/Clang（Windows 上通过 bindgen 构建语音输入依赖需要）
- 已安装 Codex CLI，并可通过 `PATH` 中的 `codex` 调用（也可在应用/工作区设置中配置自定义 Codex 可执行文件）
- Git CLI（用于工作树操作）
- GitHub CLI（`gh`，用于 GitHub Issues/PR 集成，可选）

如果遇到原生构建错误，运行：

```bash
npm run doctor
```

## 开始使用

安装依赖：

```bash
npm install
```

以开发模式运行：

```bash
npm run tauri:dev
```

## iOS 支持（开发中）

iOS 支持目前仍在进行中。

- 当前状态：移动端布局可运行，远程后端流程已接入，iOS 默认使用远程后端模式。
- 当前限制：移动端构建中终端和语音输入仍不可用。
- 桌面端行为不变：macOS/Linux/Windows 默认本地优先，除非显式选择远程模式。

### iOS + Tailscale 设置（TCP）

当 iOS 应用需要通过 Tailscale tailnet 连接到桌面端托管的 daemon 时使用此流程。
权威 runbook：`docs/mobile-ios-tailscale-blueprint.md`。

1. 在桌面端和 iPhone 上安装并登录 Tailscale（同一个 tailnet）。
2. 在桌面端 CodexMonitor 中打开 `Settings > Server`。
3. 设置 `Remote backend token`。
4. 在 `Mobile access daemon` 中点击 `Start daemon` 启动桌面端 daemon。
5. 在 `Tailscale helper` 中使用 `Detect Tailscale`，并记录建议主机（例如 `your-mac.your-tailnet.ts.net:4732`）。
6. 在 iOS CodexMonitor 中打开 `Settings > Server`。
7. 输入桌面端 Tailscale 主机和相同 token。
8. 点击 `Connect & test` 并确认测试成功。

说明：

- iOS 连接期间，桌面端 daemon 必须保持运行。
- 如果测试失败，确认两台设备都在线于 Tailscale，并且主机/token 与桌面端设置一致。

### 无桌面 UI 的 Headless Daemon 管理

当你想在不保持桌面应用打开的情况下使用 iOS 远程模式，可使用独立 daemon 控制 CLI。

构建二进制：

```bash
cd src-tauri
cargo build --bin codex_monitor_daemon --bin codex_monitor_daemonctl
```

示例：

```bash
# 显示当前 daemon 状态
./target/debug/codex_monitor_daemonctl status

# 使用 settings.json 中的 host/token 启动 daemon
./target/debug/codex_monitor_daemonctl start

# 停止 daemon
./target/debug/codex_monitor_daemonctl stop

# 打印等价的 daemon 启动命令
./target/debug/codex_monitor_daemonctl command-preview
```

常用覆盖参数：

- `--data-dir <path>`：包含 `settings.json` / `workspaces.json` 的应用数据目录
- `--listen <addr>`：覆盖监听地址
- `--token <token>`：覆盖 token
- `--daemon-path <path>`：显式指定 `codex-monitor-daemon` 二进制路径
- `--json`：输出机器可读格式

### iOS 前置条件

- 已安装 Xcode + Command Line Tools。
- 已安装 Rust iOS targets：

```bash
rustup target add aarch64-apple-ios aarch64-apple-ios-sim
# 可选（Intel Mac 模拟器构建）：
rustup target add x86_64-apple-ios
```

- 已配置 Apple 签名（development team）。
  - 推荐在本机使用 `src-tauri/tauri.ios.local.conf.json` 设置 `bundle.iOS.developmentTeam` 和 `identifier`，或
  - 在 `src-tauri/tauri.ios.conf.json` 中设置，或
  - 向设备脚本传入 `--team <TEAM_ID>`。
  - `build_run_ios*.sh` 和 `release_testflight_ios.sh` 会在存在 `src-tauri/tauri.ios.local.conf.json` 时自动合并。

### 在 iOS 模拟器运行

```bash
./scripts/build_run_ios.sh
```

选项：

- `--simulator "<name>"` 指定模拟器。
- `--target aarch64-sim|x86_64-sim` 覆盖架构。
- `--skip-build` 复用当前 app bundle。
- `--no-clean` 在构建之间保留 `src-tauri/gen/apple/build`。

### 在 USB 设备运行

列出可发现设备：

```bash
./scripts/build_run_ios_device.sh --list-devices
```

构建、安装并在指定设备上启动：

```bash
./scripts/build_run_ios_device.sh --device "<device name or identifier>" --team <TEAM_ID>
```

其他选项：

- `--target aarch64` 覆盖架构。
- `--skip-build` 复用当前 app bundle。
- `--bundle-id <id>` 启动非默认 bundle identifier。

首次设备设置通常需要：

1. iPhone 已解锁，并信任此 Mac。
2. iPhone 已启用 Developer Mode。
3. 至少在 Xcode 中完成一次配对/签名确认。

如果签名尚未准备好，可从脚本流程中打开 Xcode：

```bash
./scripts/build_run_ios_device.sh --open-xcode
```

### iOS TestFlight 发布（脚本化）

使用端到端脚本完成 archive、上传、合规配置、分配 beta 分组并提交 beta review。

```bash
./scripts/release_testflight_ios.sh
```

脚本会自动从 `.testflight.local.env`（gitignored）加载发布元数据。
首次设置时，复制 `.testflight.local.env.example` 为 `.testflight.local.env` 并填写值。

## 发布构建

构建生产 Tauri bundle：

```bash
npm run tauri:build
```

产物位于 `src-tauri/target/release/bundle/`（按平台分子目录）。

### Windows（可选）

Windows 构建是可选的，并使用独立 Tauri 配置文件以避免 macOS-only 窗口效果。

```bash
npm run tauri:build:win
```

产物位于：

- `src-tauri/target/release/bundle/nsis/`（安装器 exe）
- `src-tauri/target/release/bundle/msi/`（msi）

注意：在 Windows 从源码构建时，除 CMake 外还需要 LLVM/Clang（用于 `bindgen` / `libclang`）。

## 类型检查

运行 TypeScript 检查（无输出）：

```bash
npm run typecheck
```

说明：`npm run build` 也会在打包前运行 `tsc`。

## 验证

推荐验证命令：

```bash
npm run lint
npm run test
npm run typecheck
cd src-tauri && cargo check
```

## 代码库导航

按任务查找文件（“如果需要 X，编辑 Y”）请使用：

- `docs/codebase-map.md`
- `docs/i18n.md`：多语言架构、约定和验证说明。

## 项目结构

```text
src/
  features/         按功能切分的 UI 与 hooks
  features/app/bootstrap/      应用启动编排
  features/app/orchestration/  应用布局/线程/工作区编排
  features/threads/hooks/threadReducer/  线程 reducer slices
  services/         Tauri IPC wrapper
  styles/           按区域拆分的 CSS
  types.ts          共享类型
src-tauri/
  src/lib.rs        Tauri 应用后端命令注册
  src/bin/codex_monitor_daemon.rs  远程 daemon JSON-RPC 进程
  src/bin/codex_monitor_daemon/rpc/  daemon RPC 领域 handlers
  src/shared/       app + daemon 共用的后端核心
  src/shared/git_ui_core/      git/github 共享核心模块
  src/shared/workspaces_core/  workspace/worktree 共享核心模块
  src/workspaces/   workspace/worktree adapters
  src/codex/        codex app-server adapters
  src/files/        file adapters
  tauri.conf.json   窗口配置
```

## 说明

- 工作区持久化到应用数据目录下的 `workspaces.json`。
- 应用设置持久化到应用数据目录下的 `settings.json`（主题、后端模式/提供方、远程端点/token、Codex 路径、默认访问模式、UI 缩放、跟进消息行为）。
- 功能设置在 UI 中支持，并会在加载/保存时同步到 `$CODEX_HOME/config.toml`（或 `~/.codex/config.toml`）。稳定功能：协作模式（`features.collaboration_modes`）、personality（`personality`）和后台终端（`features.unified_exec`）。实验功能：Apps（`features.apps`）。Steering 能力仍跟随 Codex 的 `features.steer`，但跟进默认行为由 Settings → Composer 控制。
- 启动和窗口聚焦时，应用会为每个工作区重新连接并刷新线程列表。
- 线程通过 workspace `cwd` 过滤 `thread/list` 结果恢复。
- 选择线程时始终调用 `thread/resume` 从磁盘刷新消息。
- CLI 会话在其 `cwd` 匹配工作区路径时出现；除非恢复，否则不会实时流式输出。
- 应用通过 stdio 使用 `codex app-server`；参见 `src-tauri/src/lib.rs` 和 `src-tauri/src/codex/`。
- 远程 daemon 入口是 `src-tauri/src/bin/codex_monitor_daemon.rs`；RPC 路由位于 `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`，领域 handlers 位于 `src-tauri/src/bin/codex_monitor_daemon/rpc/`。
- 共享领域逻辑位于 `src-tauri/src/shared/`（尤其是 `src-tauri/src/shared/git_ui_core/` 和 `src-tauri/src/shared/workspaces_core/`）。
- Codex home 会按顺序从工作区设置、旧版 `.codexmonitor/`、`$CODEX_HOME`/`~/.codex` 解析。
- 工作树智能体位于应用数据目录（`worktrees/<workspace-id>`）；旧版 `.codex-worktrees/` 路径仍受支持，应用不再编辑仓库 `.gitignore`。
- UI 状态（面板尺寸、降低透明度开关、最近线程活动）存储在 `localStorage`。
- 自定义提示词从 `$CODEX_HOME/prompts`（或 `~/.codex/prompts`）加载，支持可选 frontmatter 描述/参数提示。

## Tauri IPC Surface

前端调用位于 `src/services/tauri.ts`，并映射到 `src-tauri/src/lib.rs` 中的命令。当前 surface 包括：

- 设置/配置/文件：`get_app_settings`、`update_app_settings`、`get_codex_config_path`、`get_config_model`、`file_read`、`file_write`、`codex_doctor`、`menu_set_accelerators`。
- 工作区/工作树：`list_workspaces`、`is_workspace_path_dir`、`add_workspace`、`add_clone`、`add_worktree`、`worktree_setup_status`、`worktree_setup_mark_ran`、`rename_worktree`、`rename_worktree_upstream`、`apply_worktree_changes`、`update_workspace_settings`、`remove_workspace`、`remove_worktree`、`connect_workspace`、`list_workspace_files`、`read_workspace_file`、`open_workspace_in`、`get_open_app_icon`。
- 线程/turn/评审：`start_thread`、`fork_thread`、`compact_thread`、`list_threads`、`resume_thread`、`archive_thread`、`set_thread_name`、`send_user_message`、`turn_interrupt`、`respond_to_server_request`、`start_review`、`remember_approval_rule`、`get_commit_message_prompt`、`generate_commit_message`、`generate_run_metadata`。
- 账号/模型/协作：`model_list`、`account_rate_limits`、`account_read`、`skills_list`、`apps_list`、`collaboration_mode_list`、`codex_login`、`codex_login_cancel`、`list_mcp_server_status`。
- Git/GitHub：`get_git_status`、`list_git_roots`、`get_git_diffs`、`get_git_log`、`get_git_commit_diff`、`get_git_remote`、`stage_git_file`、`stage_git_all`、`unstage_git_file`、`revert_git_file`、`revert_git_all`、`commit_git`、`push_git`、`pull_git`、`fetch_git`、`sync_git`、`list_git_branches`、`checkout_git_branch`、`create_git_branch`、`get_github_issues`、`get_github_pull_requests`、`get_github_pull_request_diff`、`get_github_pull_request_comments`。
- 提示词：`prompts_list`、`prompts_create`、`prompts_update`、`prompts_delete`、`prompts_move`、`prompts_workspace_dir`、`prompts_global_dir`。
- 终端/语音输入/通知/用量：`terminal_open`、`terminal_write`、`terminal_resize`、`terminal_close`、`dictation_model_status`、`dictation_download_model`、`dictation_cancel_download`、`dictation_remove_model`、`dictation_request_permission`、`dictation_start`、`dictation_stop`、`dictation_cancel`、`send_notification_fallback`、`is_macos_debug_build`、`local_usage_snapshot`。
- 远程后端辅助：`tailscale_status`、`tailscale_daemon_command_preview`、`tailscale_daemon_start`、`tailscale_daemon_stop`、`tailscale_daemon_status`。
