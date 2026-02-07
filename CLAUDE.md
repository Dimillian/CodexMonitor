```
# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.
```

## CodexMonitor 项目概览

CodexMonitor 是一个基于 Tauri 的桌面应用程序，用于在本地工作区中编排多个 Codex 代理。它提供项目管理侧边栏、快速操作主屏幕和基于 Codex app-server 协议的对话视图。

## 常用命令

### 开发环境

```bash
# 安装依赖
npm install

# 开发模式（自动运行 doctor 检查）
npm run tauri:dev          # macOS/Linux
npm run tauri:dev:win      # Windows

# 生产构建
npm run tauri:build        # macOS/Linux
npm run tauri:build:win    # Windows

# 仅构建 AppImage（Linux）
npm run build:appimage
```

### 验证与测试

```bash
# 运行 ESLint 检查
npm run lint

# 运行 TypeScript 类型检查
npm run typecheck

# 运行前端测试
npm run test               # 单次运行
npm run test:watch         # 监听模式

# 运行 Rust 测试
cd src-tauri && cargo test

# 运行 doctor 检查（依赖和配置验证）
npm run doctor             # 基本检查
npm run doctor:strict      # 严格检查（macOS/Linux）
npm run doctor:win         # Windows 严格检查
```

### 其他命令

```bash
# 同步 Material Design 图标
npm run sync:material-icons

# 预览生产构建
npm run preview

# 直接运行 Tauri CLI
npm run tauri -- [command]
```

## 项目架构

### 高层架构

CodexMonitor 采用分层架构：

1. **前端层**: React 19 + TypeScript + Vite，功能切片架构
2. **后端层**: Tauri Rust 进程，提供系统集成和 Codex 代理管理
3. **共享核心层**: Rust 共享模块，同时服务于应用程序和守护进程
4. **Codex 代理层**: 通过 codex app-server 协议与 Codex 代理通信

### 目录结构

```
src/                          # 前端代码
├── features/                 # 功能切片架构
│   ├── app/                  # 应用程序核心功能
│   ├── composer/             # 消息编辑器
│   ├── threads/              # 线程管理
│   ├── workspaces/           # 工作区管理
│   ├── git/                  # Git 集成
│   ├── files/                # 文件浏览器
│   ├── prompts/              # 提示库
│   ├── models/               # 模型选择
│   ├── collaboration/        # 协作模式
│   ├── dictation/            # 语音输入
│   ├── terminal/             # 终端功能
│   └── debug/                # 调试面板
├── services/                 # Tauri IPC 接口
├── styles/                   # 样式文件
├── utils/                    # 工具函数
├── hooks/                    # 自定义 React Hooks
└── types.ts                  # 共享类型定义

src-tauri/                    # Rust 后端代码
├── src/
│   ├── lib.rs                # Tauri 后端入口
│   ├── main.rs               # 应用程序入口
│   ├── types.rs              # Rust 类型定义
│   ├── backend/              # 后端核心逻辑
│   ├── codex/                # Codex 代理通信
│   ├── workspaces/           # 工作区管理
│   ├── git/                  # Git 操作
│   ├── files/                # 文件系统操作
│   ├── dictation/            # 语音输入
│   └── shared/               # 共享核心模块
└── Cargo.toml                # Rust 依赖配置
```

### 核心功能模块

#### 前端架构原则

- **组件**: 仅负责展示，Props 输入，UI 输出，无 Tauri IPC
- **Hooks**: 管理状态、副作用和事件连接
- **Utils**: 纯函数助手
- **Services**: 所有 Tauri IPC 通过 `src/services/`
- **Types**: 共享 UI 类型在 `src/types.ts`
- **Styles**: 每个 UI 区域一个 CSS 文件在 `src/styles/`

#### 后端架构原则

- **共享逻辑**: 首先放在 `src-tauri/src/shared/`
- **应用程序/守护进程**: 薄适配器，不重复实现领域逻辑
- **通信**: 前端通过 Tauri IPC 调用后端命令，后端通过事件通道发送通知

## 关键集成点

### Codex 代理通信

- 使用 `codex app-server` 协议通过 stdio 通信
- 初始化流程：`initialize` → `initialized`，初始化前不发送请求
- 线程管理：`thread/list`、`thread/resume`、`thread/archive`

### Git 集成

- 使用 Git CLI 进行操作（无需 libgit2）
- 支持工作区状态、分支管理、差异查看、提交历史等
- 工作树（worktree）管理用于隔离工作

### 系统集成

- **Tauri 插件**: 对话框、通知、文件系统访问、进程管理、更新器
- **系统通知**: 跨平台通知支持
- **窗口管理**: 平台特定效果（macOS 标题栏、Windows 边框等）

## 数据持久化

- **应用程序数据**: 工作区和设置存储在应用程序数据目录的 JSON 文件中
- **Codex 配置**: 同步到 `$CODEX_HOME/config.toml`（或 `~/.codex/config.toml`）
- **UI 状态**: 面板大小、透明度设置等存储在 localStorage 中
- **自定义提示**: 从 `$CODEX_HOME/prompts`（或 `~/.codex/prompts`）加载

## 开发工作流程

### 修改前端代码

1. 找到对应的功能切片目录（`src/features/`）
2. 遵循组件/Hook/Service 分离原则
3. 使用 TypeScript 确保类型安全
4. 更新 `src/services/tauri.ts` 以添加新的 IPC 接口（如需要）

### 修改后端代码

1. 共享逻辑放在 `src-tauri/src/shared/`
2. 应用程序特定代码放在对应功能文件夹
3. 守护进程代码放在 `src-tauri/src/bin/codex_monitor_daemon.rs`
4. 更新 `src/services/tauri.ts` 以反映新的命令接口

### 添加新功能

1. 先阅读 `memory/decisions.md` 和 `AGENTS.md` 了解现有约定
2. 实现前端组件和 Hooks
3. 实现后端共享核心逻辑
4. 编写应用程序和守护进程适配器
5. 添加 Tauri IPC 接口
6. 编写测试（前端使用 Vitest，后端使用 Cargo）

## 验证检查清单

任务完成后：

1. 运行 `npm run lint` - 检查 ESLint 错误
2. 运行 `npm run test` - 运行前端测试（如果修改了线程、设置、更新器、共享工具或后端核心）
3. 运行 `npm run typecheck` - 检查 TypeScript 类型
4. 运行 `cargo check` - 在 src-tauri 目录检查 Rust 编译错误

## 注意事项

- Windows 构建需要 LLVM/Clang（用于 bindgen）和 CMake
- 自定义 Codex 路径可在设置中配置
- GitHub 集成需要安装并认证 gh CLI
- 语音输入使用 Whisper 模型，需要额外的原生依赖
