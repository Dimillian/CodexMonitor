# CodexMonitor i18n Phase 2 实施记录（Issue #567）

> 状态：✅ **已完成**（2026-08-06）
> 目标：Phase 1（基础设施 + 核心 UI）完成后，全量提取剩余组件的硬编码英文 UI 字符串，中英双语，零新增测试失败。
> 工作副本：`E:\CodexMonitor`（上游 main @ v0.7.68-dev，工作区改动**未提交**）
> 前置：`docs/i18n-phase1-plan.md`、`docs/i18n-glossary.md`

## 1. 完成范围

按 5 组分批迁移（每组分派 implementer，每组全量测试回归）：

| 组 | 范围 | 结果 |
|---|---|---|
| A | composer 8 文件（Composer/ComposerInput/ComposerMetaBar/ComposerAttachments/ComposerQueue/ComposerMobileActionsMenu/ComposerSuggestionsPopover/ReviewInlinePrompt） | 60 key |
| B | git 12 文件（GitDiffPanel 系 9 个 + BranchSwitcherPrompt/InitGitRepoPrompt/ImageDiffCard/PierreDiffBlock；BranchList 无字符串跳过） | 130 key |
| C | workspaces 8 文件（WorkspaceHome 系 4 个 + ClonePrompt/WorkspaceFromUrlPrompt/WorktreePrompt/MobileRemoteWorkspacePrompt） | 91 key |
| D | layout 5 文件（PanelTabs/SidebarToggleControls/build*Nodes）+ app 壳层 15 文件（ApprovalToasts/MainTopbar/PinnedThreadList/TabBar 等） | layout 13 + app 49 key |
| E | 零星 13 文件（PlanPanel/PromptPanel/TerminalDock/UpdateToast/MobileServerSetupWizard/DebugPanel/FilePreviewPopover/FileTreePanel/FileEditorCard/Messages/ErrorToasts/AboutView/utils-time）+ 补漏 6 文件 17 处 aria-label/title | plan 4 + prompts 40 + terminal 5 + update 22 + mobile 14 + debug 5 + files 40 + messages 15 + 补充 errors/about/common 各若干 |

## 2. Namespace 清单（共 21 个）

Phase 1：`common` `sidebar` `home` `header` `settings` `threads` `about` `errors`
Phase 2 新增：`composer` `git` `workspaces` `layout` `app` `plan` `prompts` `terminal` `update` `mobile` `debug` `files` `messages`

en / zh-CN 完全同构，`src/i18n/i18n.test.ts` 奇偶校验覆盖全部 21 个 namespace（31 个测试）。

## 3. 验证结果（2026-08-06）

| 检查 | 结果 |
|---|---|
| `npm run test` 全量 | 1026 passed / **6 failed（基线预存，0 新增）** |
| `npm run test -- src/i18n` | 31 passed（奇偶校验 + 语言切换 + fallback） |
| `npm run typecheck` | 通过 |
| `npm run build`（vite） | 通过（chunk 大小警告为预存） |
| 测试文件 | 未改动任何既有测试 |

### 已知基线失败（与 i18n 无关，中文 Windows 预存）

6 个失败固定存在（Phase 1 之前 HEAD 上同样失败，已用 `git stash` 验证）：
- `src/features/app/hooks/useTraySessionUsage.test.tsx` ×5
- `src/features/home/components/Home.test.tsx` ×1（renders expanded token stats and account limits）

**根因**：中文 Windows 上 Node 默认 Intl locale = zh-CN，`Intl.RelativeTimeFormat(undefined)` / `Intl.DateTimeFormat(undefined)` 输出中文（"2小时后"、"1月20日"），测试断言英文（"Resets 2 hours"、"Jan 20"）。上游 Linux/en CI 不受影响。修复方案留待 Phase 3 与上游讨论（或 vitest 环境固定 en）。

## 4. 已知遗留（Phase 3 待办）

1. **Rust 侧运行时语言切换**：`src-tauri/src/i18n.rs` + menu.rs/tray.rs 启动时按 AppSettings.language 构建；运行时切换后原生文本不即时重建（Phase 1 决策 C 已知限制）。
2. **Intl 本地化**（Phase 1 决策 D）：`formatRelativeTime`/`formatDayLabel` 等保持 Intl 默认 locale，zh-CN 下输出由系统 locale 决定；应改为按 i18n 语言显式传 locale（注意：这也将修复上述 6 个预存失败——前提是测试期望相应调整或测试环境固定 en）。
3. **i18next-parser 集成**：自动提取 key 到资源文件，防止 key 漂移（目前靠奇偶校验测试兜底）。
4. **扫描收尾**：`src/utils/threadStatus.ts`（Running/Reviewing/Idle 状态标签）、`src/utils/platformPaths.ts`（文件管理器标签）等少量字符串在组件调用方已处理或为代理侧文本，可后续复核。
5. **README/文档更新**：用户可见文档说明多语言支持。

## 5. Phase 3 交接（开新对话时引用本文件）

- **仓库状态**：全部改动在工作区**未提交**（~100 文件：前端 ~40 源文件 + 21×2 locale + i18n.ts/i18n.test.ts + Phase 1 的 Rust 侧 4 文件 + package.json）。提交前先 `git status` 复核。
- **PR 目标**：从 waliean fork 提交到 `Dimillian/CodexMonitor`，关联 issue #567。
- **验证基线**：全量测试 6 失败（上述预存）为当前可接受基线；PR 描述中声明中文 Windows 预存失败与 i18n 无关。
- **构建限制**：#599（whisper-rs MSVC bindgen）阻止本地 `tauri build`；`cargo check` 尽力而为。
- **关键文件**：`src/i18n/i18n.ts`（namespace 注册）、`src/i18n/i18n.test.ts`（奇偶校验）、`docs/i18n-glossary.md`（术语基准）。
