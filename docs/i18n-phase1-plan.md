# CodexMonitor i18n 实施计划（Issue #567）

> 状态：**已认领**（2026-08-05，账号 waliean，[issue 评论](https://github.com/Dimillian/CodexMonitor/issues/567#issuecomment-5193529661)）
> 目标：为 CodexMonitor 添加 i18n 支持（英文默认 + 简体中文），不破坏现有 138 个测试。
> 本地工作副本：`E:\CodexMonitor`（上游 main @ v0.7.68-dev）
> 术语基准：`docs/i18n-glossary.md`

## 1. 背景与目标

CodexMonitor 是 Tauri 2 + React 19 + TypeScript + Vite 7 的桌面应用。目前 UI 全部英文硬编码，无任何 i18n 基础设施（无 i18next、无 locale 文件）。GitHub issue #567 请求 i18n 支持，已确认无人认领并由 waliean 认领。

Phase 1 目标：搭建 i18n 基础设施 + 覆盖核心 UI（侧栏、首页、设置、线程列表、标题栏等 ~20 个关键组件），中英双语。

## 2. 已确认的侦察事实

| 项 | 结果 |
|---|---|
| 依赖 | React ^19.1.0、TS ~5.8.3、Vite ^7.0.4、Vitest ^3.2.4、@testing-library/react ^16.3.2、jsdom ^27.0.1、@tauri-apps/api ^2.10.1。**无 i18n 库** |
| 挂载 | `src/main.tsx`：`ReactDOM.createRoot().render(<StrictMode><App/></StrictMode>)`，无 Provider 包裹（干净的注入点） |
| 字符串模式 | ① JSX 内联文本 ② 组件内常量（如 Sidebar 的 bucketLabels）③ **纯函数拼接**（如 `usageLabels.ts` 的 `formatResetLabel()` 返回 `"Resets ${relative}"`） |
| Vitest 配置 | 在 `vite.config.ts` 的 `test` 块：`environment: "node"`、`setupFiles: ["src/test/vitest.setup.ts"]`、`include: ["src/**/*.test.{ts,tsx}"]`；各测试文件头部用 `// @vitest-environment jsdom` 逐文件覆盖 |
| Tauri 配置 | `src-tauri/tauri.conf.json`：`frontendDist: "../dist"`；Windows 另有 `tauri.windows.conf.json`（`titleBarStyle: "Overlay"`，标题在 React 侧渲染） |
| 设置持久化 | `AppSettings` 位于 `src/types.ts:238`；读写走 `src/services/tauri.ts` → invoke → Rust `src-tauri/src/shared/settings_core.rs` |
| 路径别名 | `@`→src，另有 `@app`、`@settings`、`@threads`、`@services`、`@utils` |
| 测试断言 | 直接断言英文硬编码串（如 `getByRole("button", { name: "Toggle search" })`）。**策略：en 输出与现状逐字一致 → 零破坏** |
| 本地构建 | **受 #599 卡住**（whisper-rs 在 MSVC 下 bindgen 失败，官方未解决）。验证方式：`npm run test` + `npm run typecheck` + `vite build`，不做 `tauri build` |

## 3. 库选型：i18next + react-i18next（已定）

| 维度 | 结论 |
|---|---|
| 非 React 代码调用 | ✅ 模块级单例 `t()` 随处可用——匹配 `usageLabels.ts` 纯函数拼接 |
| React 19 兼容 | ✅ react-i18next v15+ 官方支持 |
| 测试友好 | ✅ 全局实例可在 vitest.setup 初始化为 en，`useTranslation` 免 Provider 直用 → 现有测试零改造 |
| 切换语言 | `i18n.changeLanguage()` 全局重渲染 |

版本：`i18next@^24` + `react-i18next@^15`。

## 4. 资源文件结构

```
src/i18n/
├── i18n.ts              # 初始化：resources 挂载、fallbackLng、initReactI18next
├── index.ts             # 再导出 useTranslation / t / i18n
├── types.ts             # AppLanguage = "en" | "zh-CN"
└── locales/
    ├── en/
    │   ├── common.json      # 通用：按钮、确认、取消、加载中
    │   ├── sidebar.json     # Sidebar 树 + 线程列表桶标签 + 空态
    │   ├── home.json        # 首页
    │   ├── header.json      # MainHeader/MainTopbar/标题栏 tooltip
    │   ├── settings.json    # 设置页 + SETTINGS_SECTION_LABELS + 各 section
    │   ├── threads.json     # ThreadRow/ThreadList 相关
    │   ├── about.json       # AboutView
    │   └── errors.json      # toasts/错误串（Phase 1 可选）
    └── zh-CN/               # 与 en 完全同构
```

## 5. 文件清单

**新增**
- `src/i18n/i18n.ts`、`src/i18n/index.ts`、`src/i18n/types.ts`
- `src/i18n/locales/en/*.json`（约 8 个）
- `src/i18n/locales/zh-CN/*.json`（与 en 同构）
- `src/test/renderWithI18n.tsx`（自定义 render helper）
- `src/i18n/i18n.test.ts`（key 奇偶性校验 + 语言切换行为测试）
- `src-tauri/src/i18n.rs`（Rust 侧轻量翻译 helper：`t_rs(key, lang)`，供 menu/tray/window 用）

**修改（前端）**
- `package.json`（+i18next、react-i18next）
- `src/main.tsx`（`import "./i18n"`）
- `src/test/vitest.setup.ts`（初始化 i18n 为 en）
- `src/types.ts`（AppSettings 增 `language` 字段——见 §8 决策 A）
- `src/features/settings/hooks/useAppSettings.ts`（语言字段 normalize）
- **侧栏树**：`Sidebar.tsx`、`SidebarHeader.tsx`、`SidebarSearchBar.tsx`、`SidebarBottomRail.tsx`、`ThreadList.tsx`、`ThreadRow.tsx`、`PinnedThreadList.tsx`、`ThreadLoading.tsx`、`SidebarThreadsOnlySection.tsx`、`WorkspaceGroup.tsx`、`WorkspaceCard.tsx`、`WorktreeCard.tsx`、`WorktreeSection.tsx`
- **首页**：`Home.tsx`、`HomeActions.tsx`、`HomeUsageSection.tsx`、`HomeLatestAgentsSection.tsx`、`homeFormatters.ts`
- **标题栏**：`MainHeader.tsx`、`MainHeaderActions.tsx`、`MainTopbar.tsx`、`WindowCaptionControls.tsx`
- **设置**：`SettingsView.tsx`、`SettingsNav.tsx`、`settingsViewConstants.ts`、`SettingsSectionContainers.tsx`、13 个 `sections/Settings*Section.tsx`、`SettingsDisplaySection.tsx`（**语言切换 UI 落点**）
- **纯函数**：`src/features/app/utils/usageLabels.ts`
- 其他：`AboutView.tsx`、`ApprovalToasts.tsx`、`ErrorToasts.tsx`（视范围裁剪）

## 6. 测试适配策略（138 文件零破坏路径）

1. `vitest.setup.ts` 中 `i18n.init({ lng: "en", resources })` → 所有 `t()` 渲染输出与现状逐字相同。
2. react-i18next 默认单例，`useTranslation()` 免 Provider → 既有测试无需改动。
3. 纯函数测试（usageLabels 相关）：期望值改为调用 `t()` 的等价结果。
4. 新增 `renderWithI18n(ui, { lng })` helper + zh-CN 冒烟测试 + key 奇偶性测试。
5. **每步跑全量 `npm run test`**，不搞最后一次性验证。

## 7. 实施顺序（每步可独立验证）

| 步骤 | 内容 | 验证 |
|---|---|---|
| 0 | 安装 i18next + react-i18next | typecheck + 全量 test 仍绿 |
| 1 | 搭 `src/i18n/` 骨架 + 空 en/zh 资源 + main.tsx 引入 | 全量 test 绿 |
| 2 | vitest.setup 初始化 en | 全量 test 绿（关键闸门） |
| 3 | 迁移纯函数 usageLabels.ts | 该模块单测绿 |
| 4 | 迁移侧栏树（13 组件） | Sidebar/ThreadList/PinnedThreadList/WorktreeSection 测试绿 |
| 5 | 迁移首页（5 组件） | Home.test.tsx 绿 |
| 6 | 迁移标题栏 | 相关测试绿 |
| 7 | 迁移设置页（+常量映射） | SettingsView 等测试绿 |
| 8 | 语言切换 UI（SettingsDisplaySection）+ 持久化 | 新增切换测试绿 |
| 9 | Rust 侧 i18n：`src-tauri/src/i18n.rs` helper + 窗口标题/menu.rs/menu_mobile.rs/tray.rs 接入（启动时按 AppSettings.language 构建） | `cargo check` 尽力而为（#599 限制）+ 代码审查 |
| 10 | 填齐 zh-CN 全部翻译 | i18n.test.ts 奇偶校验通过 |
| 11 | 收尾：test + typecheck + lint + vite build | 全绿 |

## 8. 架构裁决（Phase 1 执行前需定稿）

- **决策 A - 语言持久化**：加入 `AppSettings.language`（需同步改 Rust `settings_core.rs` serde 默认值，跨语言改动，同一 PR 内完成并补默认值测试）。备选：仅 localStorage。→ **采用 A**
- **决策 B - 切换入口**：只放设置页「Display & Sound」section 的语言下拉（English / 简体中文）；侧栏快捷切换留 Phase 2。
- **决策 C - 范围边界**：Rust 侧窗口标题、menu.rs、menu_mobile.rs、tray.rs 文案**纳入 Phase 1**（用户裁定）。策略：新增 `src-tauri/src/i18n.rs` 轻量 helper，启动时按 `AppSettings.language` 构建菜单/托盘文本；**运行时切换语言后 Rust 侧原生文本不即时重建**（已知限制，Phase 2 处理）。window.rs 用户可见字符串极少（多为 macOS 平台 API 代码），仅处理确有的可见文案。
- **决策 D - 时间格式化**：`formatRelativeTime` 等保持现状（Intl.RelativeTimeFormat 留 Phase 2），列示为已知缺口。
- **决策 E - Thread 译法**：界面用"线程"，说明文本用"会话线程"，在 glossary 中锁定。

## 9. 风险与规避

| 风险 | 规避 |
|---|---|
| 138 测试断言英文串 | §6 策略 + 每步全量回归 |
| AppSettings.language 跨 Rust 改动 | 同 PR 改 types.rs/storage.rs + 默认值测试 |
| Rust 侧改动无法 cargo check 验证（#599） | 尽力 cargo check；改 menu/tray 时靠人工审查 + 最小 diff |
| 菜单/托盘平台差异（menu_mobile、macOS 专属） | 每个 cfg 分支单独核对，不改平台逻辑只替换文案 |
| Tauri file:// 协议拉取 locale 失败 | 禁 http-backend，JSON 静态 import 随 Vite 打包 |
| react-i18next 与 React 19 peer 冲突 | 锁 v15+，安装后立即 typecheck |
| key 漂移（en/zh 不同构） | i18n.test.ts 奇偶断言入 CI |
| 本地无法 tauri build（#599） | 验证用 test + typecheck + vite build，PR 中声明 |

## 10. 后续阶段

- **Phase 2**：✅ **已完成**（2026-08-06）。全量提取剩余 ~40 文件（composer/git/workspaces/layout/app 壳层/plan/prompts/terminal/update/mobile/debug/files/messages）共 ~700 个字符串，新增 13 个 namespace（共 21 个）。详见 `docs/i18n-phase2-plan.md`。
- **Phase 3**（待办，见 `docs/i18n-phase2-plan.md` §交接）：测试适配 + 文档更新 + 打开 PR（从 waliean fork 提交到 Dimillian/CodexMonitor）；含 i18next-parser 集成、Rust 运行时语言切换、Intl 本地化等遗留项。
