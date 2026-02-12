# CodexMonitor Agent Guide

所有文档必须是规范的，不含历史评论，仅包含当前状态。

## 范围

本文件是此仓库的开发约定。详细的导航和操作手册位于：

- `docs/codebase-map.md`（任务导向文件映射："如果需要 X，编辑 Y"）
- `README.md`（设置、构建、发布和更广泛的项目文档）

## 项目概览

CodexMonitor 是一个 Tauri 应用，用于在本地工作区中编排多个 Codex 代理。

**当前版本**：0.7.50

**技术栈**：
- 前端：React 19 + Vite 7 + TypeScript 5.8（`src/`）
- 后端应用：Tauri Rust 进程（`src-tauri/src/lib.rs`）
- 后端守护进程：JSON-RPC 进程（`src-tauri/src/bin/codex_monitor_daemon.rs`）
- 共享后端真相源：`src-tauri/src/shared/*`
- 国际化：i18next + react-i18next（`src/i18n/`）

## 不可协商的架构规则

1. 共享/领域后端逻辑必须优先放入 `src-tauri/src/shared/*`。
2. 保持应用和守护进程作为共享核心的薄适配器。
3. 不要在应用和守护进程之间重复逻辑。
4. 保持 JSON-RPC 方法名和负载结构稳定，除非有意更改契约。
5. 保持前端 IPC 契约与后端命令接口同步。

## 后端路由规则

对于后端行为变更，按以下顺序进行：

1. 共享核心（`src-tauri/src/shared/*`）- 跨运行时的行为。
2. 应用适配器和 Tauri 命令接口（`src-tauri/src/lib.rs` + 适配器模块）。
3. 前端 IPC 包装器（`src/services/tauri.ts`）。
4. 守护进程 RPC 接口（`src-tauri/src/bin/codex_monitor_daemon/rpc.rs` + `rpc/*`）。

如果添加后端命令，更新所有相关层和测试。

## 前端路由规则

- 保持 `src/App.tsx` 作为组合/连线根。
- 将有状态编排移至：
  - `src/features/app/hooks/*`
  - `src/features/app/bootstrap/*`
  - `src/features/app/orchestration/*`
- 保持展示性 UI 在功能组件中。
- Tauri 调用仅放在 `src/services/tauri.ts`。
- 事件订阅分发放在 `src/services/events.ts`。

## 导入别名

使用项目别名进行前端导入：

- `@/*` -> `src/*`
- `@app/*` -> `src/features/app/*`
- `@settings/*` -> `src/features/settings/*`
- `@threads/*` -> `src/features/threads/*`
- `@services/*` -> `src/services/*`
- `@utils/*` -> `src/utils/*`

## 关键文件锚点

### 前端
- 组合根：`src/App.tsx`
- IPC 包装器：`src/services/tauri.ts`
- 事件中心：`src/services/events.ts`
- 国际化配置：`src/i18n/config.ts`
- 国际化语言资源：`src/i18n/locales/`

### 后端应用
- 命令注册：`src-tauri/src/lib.rs`
- Codex 适配器：`src-tauri/src/codex/mod.rs`
- 工作区适配器：`src-tauri/src/workspaces/commands.rs`
- Git 适配器：`src-tauri/src/git/mod.rs`
- 设置适配器：`src-tauri/src/settings/mod.rs`
- 提示词适配器：`src-tauri/src/prompts.rs`
- 文件适配器：`src-tauri/src/files/mod.rs`
- Orbit 连接：`src-tauri/src/orbit/`
- Tailscale 连接：`src-tauri/src/tailscale/`
- 远程后端：`src-tauri/src/remote_backend/`
- 语音听写：`src-tauri/src/dictation/`

### 后端守护进程
- 入口点：`src-tauri/src/bin/codex_monitor_daemon.rs`
- RPC 路由：`src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- RPC 领域处理器：
  - `rpc/codex.rs`
  - `rpc/daemon.rs`
  - `rpc/dispatcher.rs`
  - `rpc/git.rs`
  - `rpc/prompts.rs`
  - `rpc/workspace.rs`
- 传输层：`src-tauri/src/bin/codex_monitor_daemon/transport.rs`

### 共享核心（真相源）
- Codex 核心：`src-tauri/src/shared/codex_core.rs`
- Codex 辅助：`src-tauri/src/shared/codex_aux_core.rs`
- Codex 更新：`src-tauri/src/shared/codex_update_core.rs`
- 工作区核心：`src-tauri/src/shared/workspaces_core.rs` + `workspaces_core/*`
- Worktree 核心：`src-tauri/src/shared/worktree_core.rs`
- 设置核心：`src-tauri/src/shared/settings_core.rs`
- 文件核心：`src-tauri/src/shared/files_core.rs`
- Git 核心：`src-tauri/src/shared/git_core.rs`
- Git UI 核心：`src-tauri/src/shared/git_ui_core.rs` + `git_ui_core/*`
- 提示词核心：`src-tauri/src/shared/prompts_core.rs`
- Orbit 核心：`src-tauri/src/shared/orbit_core.rs`
- 进程核心：`src-tauri/src/shared/process_core.rs`
- 本地用量：`src-tauri/src/shared/local_usage_core.rs`

### 线程状态管理
- Reducer 入口：`src/features/threads/hooks/useThreadsReducer.ts`
- Reducer 切片：`src/features/threads/hooks/threadReducer/*`

更广泛的路径映射请参考 `docs/codebase-map.md`。

## 应用/守护进程对等检查清单

当更改可在远程运行的后端行为时：

1. 共享核心逻辑已更新（或明确为仅应用/仅守护进程）。
2. 应用接口已更新（`src-tauri/src/lib.rs` + 适配器）。
3. 前端 IPC 已更新（`src/services/tauri.ts`）。
4. 守护进程 RPC 已更新（`rpc.rs` + `rpc/*`）。
5. 契约/测试覆盖已更新。

## 设计系统规则（高级）

使用现有的设计系统原语和令牌作为共享的外壳框架。
不要在功能 CSS 中重新引入重复的 modal/toast/panel/popover 外壳样式。

（详见现有 DS 文件和 lint 规则。）

## 国际化规则

- 所有用户可见文本必须使用 `useTranslation()` hook。
- 翻译键命名规范：`{feature}.{category}.{key}`
- 语言资源位于 `src/i18n/locales/{en,zh}/`
- 新功能模块必须同时添加中英文资源文件

## 安全和 Git 行为

- 优先使用安全的 git 操作（`status`、`diff`、`log`）。
- 不要重置/恢复无关的用户更改。
- 如果出现无关更改，继续关注自有文件，除非它们影响正确性。
- 如果冲突影响正确性，明确指出并选择最安全的路径。
- 修复根本原因，而非临时补丁。

## 验证矩阵

根据修改区域运行验证：

- 始终：`npm run typecheck`
- 前端行为/状态/hooks/组件：`npm run test`
- Rust 后端变更：`cd src-tauri && cargo check`
- 迭代时对修改模块使用定向测试，而非全量运行。

## 快速操作手册

核心本地命令（日常使用）：

```bash
npm install
npm run doctor:strict          # macOS/Linux
npm run doctor:win             # Windows
npm run tauri:dev              # 开发模式
npm run tauri:dev:win          # Windows 开发模式
npm run test
npm run typecheck
cd src-tauri && cargo check
```

发布构建：

```bash
npm run tauri:build            # macOS/Linux
npm run tauri:build:win        # Windows
```

定向测试运行：

```bash
npm run test -- <path-to-test-file>
```

代码质量检查：

```bash
npm run lint
npm run lint:ds                # 设计系统 lint
```

Codemod 工具（重构辅助）：

```bash
npm run codemod:ds:dry         # 预览变更
npm run codemod:ds             # 执行变更
```

## 环境要求

### 必需
- Node.js 16+（当前使用 3.12.10）
- Rust 工具链（stable）
- CMake（原生依赖需要；语音听写/Whisper 使用）
- Codex CLI（作为 `codex` 在 `PATH` 中可用）
- Git CLI（用于 worktree 操作）

### 平台特定
- **Windows**：LLVM/Clang（用于 `bindgen`/`libclang`，构建语音听写依赖）
- **macOS**：Xcode + Command Line Tools（iOS 构建）
- **iOS**：
  - Rust iOS 目标：`rustup target add aarch64-apple-ios aarch64-apple-ios-sim`
  - Apple 签名配置

### 可选
- GitHub CLI（`gh`）用于 GitHub Issues/PR 集成

## 热点区域

在以下高变更/高复杂度文件中需格外小心：

- `src/App.tsx`
- `src/features/settings/components/SettingsView.tsx`
- `src/features/threads/hooks/useThreadsReducer.ts`
- `src-tauri/src/shared/git_ui_core.rs`
- `src-tauri/src/shared/workspaces_core.rs`
- `src-tauri/src/bin/codex_monitor_daemon/rpc.rs`
- `src/i18n/config.ts`

## 功能模块索引

| 模块 | 路径 | 说明 |
|------|------|------|
| 应用核心 | `src/features/app/` | 引导、编排、布局 |
| 线程管理 | `src/features/threads/` | 线程状态、消息、reducer |
| 工作区 | `src/features/workspaces/` | 工作区生命周期、worktree |
| 设置 | `src/features/settings/` | 应用设置、Codex 配置 |
| Git | `src/features/git/` | Git 状态、分支、GitHub 集成 |
| 提示词 | `src/features/prompts/` | 自定义提示词库 |
| 编辑器 | `src/features/composer/` | 消息编辑、附件、自动完成 |
| 消息 | `src/features/messages/` | 消息渲染、diff、reasoning |
| 终端 | `src/features/terminal/` | 终端标签页、后台命令 |
| 计划 | `src/features/plan/` | 任务计划面板 |
| 文件 | `src/features/files/` | 文件树、搜索 |
| 移动端 | `src/features/mobile/` | iOS 支持（WIP） |
| 语音听写 | `src/features/dictation/` | Whisper 语音输入 |
| 协作 | `src/features/collaboration/` | 协作模式 |
| 模型 | `src/features/models/` | 模型选择器 |
| 更新 | `src/features/update/` | 应用内更新 |

## 规范参考

- 任务导向代码映射：`docs/codebase-map.md`
- 设置/构建/发布/测试命令：`README.md`
- 国际化计划：`memory/i18n-plan.md`