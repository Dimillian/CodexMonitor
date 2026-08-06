# CodexMonitor i18n Phase 3 实施记录（Issue #567）

> 状态：✅ **已完成**（2026-08-06）
> 目标：落实 Intl 本地化（修复中文 Windows 上 6 个预存测试失败）、补齐 Rust 侧 i18n 单测、完成扫描收尾遗留字符串、集成 i18next-parser，为打开 PR 收尾。
> 工作副本：`E:\CodexMonitor`（分支 `i18n-phase3`，checkpoint commit `1654d66`，约 160 文件改动，未提交到上游）
> 前置：`docs/i18n-phase1-plan.md`、`docs/i18n-phase2-plan.md`、`docs/i18n-glossary.md`

## 1. 完成范围

本阶段未新增 namespace（维持 21 个，en / zh-CN 完全同构）：

| 项 | 范围 | 结果 |
|---|---|---|
| A | **Intl 本地化**：`src/utils/time.ts` + `src/features/home/homeFormatters.ts` 的 Intl 构造器显式传 `i18n.language`（替代 `undefined`） | 全量测试 1026/6 → **1032/0**，测试断言零改动 |
| B | **Rust 侧验证**：`src-tauri/src/i18n.rs` 新增 6 个单测（`t_rs` en/zh 菜单文案） | 单测就位；`cargo check` 被上游 #599 阻塞，未编译验证 |
| C | **扫描收尾**：`threadStatus.ts` 返回 i18n key + `WorkspaceHomeHistory.tsx` `t()` 渲染；`platformPaths.ts` 内部 `t()` | 函数签名不变，调用方零改动 |
| D | **i18next-parser 集成**：devDependency + `i18next-parser.config.cjs` + `extract:i18n` script + 42 个 locale 文件规范化 | 自动提取可用（每次需人工清理 2 个误报 key） |

## 2. Intl 本地化（修复 6 个预存失败）

**背景**：Phase 2 已知基线失败 6 个（`useTraySessionUsage.test.tsx` ×5、`Home.test.tsx` ×1）的根因是中文 Windows 上 Node 默认 Intl locale = zh-CN，`Intl.RelativeTimeFormat(undefined)` / `Intl.DateTimeFormat(undefined)` 输出中文（"2小时后"、"1月20日"），而测试断言英文。上游 Linux/en CI 不受影响。

**改动**（Phase 1 决策 D 的落实）：
- `src/utils/time.ts`：`new Intl.RelativeTimeFormat(i18n.language, { numeric: "auto" })`
- `src/features/home/homeFormatters.ts`：`formatCount` / `formatDayLabel` / `formatCreditsBalance` 的 `Intl.NumberFormat` / `Intl.DateTimeFormat` 显式传 `i18n.language`

**效果**：
- 全量测试 **1026 passed / 6 failed → 1032 passed / 0 failed**
- 测试断言**零改动**：vitest.setup 将 i18n 初始化为 en，Intl 显式收到 en 后输出与既有断言一致，无需改任何测试期望

## 3. Rust 侧验证（i18n.rs 单测）

- `src-tauri/src/i18n.rs` 新增 6 个单测，覆盖 `t_rs` 的 en/zh 菜单文案（menu/tray key）。
- 启动链路已由 Phase 1 接线：`lib.rs` setup 按 `AppSettings.language` 重建菜单/托盘文本，本阶段无需改动。
- **运行时语言切换仍是已知限制**（Phase 1 决策 C）：`handle_menu_event` 无语言切换事件，菜单/托盘文本启动后不变，需重启应用生效。
- `cargo check` 被上游 #599（whisper-rs MSVC bindgen）阻塞，新增单测未做编译验证，靠人工审查保证最小 diff。

## 4. 扫描收尾（Phase 2 遗留项 4）

- `src/utils/threadStatus.ts`：`getWorkspaceHomeThreadState` 返回 i18n key（`workspaces:statusRunning` / `statusReviewing` / `statusIdle`）替代硬编码英文；`WorkspaceHomeHistory.tsx` 用 `t(status.statusLabel)` 渲染；`threadStatus.test.ts` 断言相应改为 key。行为零变化。
- `src/utils/platformPaths.ts`：`revealInFileManagerLabel` / `openInFileManagerLabel` 内部调用 `i18n.t()`（key：`files:revealInFileManager` / `files:showInFileManager` / `files:openInFileManager`，`{fileManager}` 插值）。**函数签名不变，调用方零改动**；Finder / Explorer 作为平台专有名词不译。

## 5. i18next-parser 集成

- `package.json` devDependency：`i18next-parser@^9.0.2`
- 新增 `i18next-parser.config.cjs`，关键项：
  - `sort: false` —— 保持人工维护的 key 顺序
  - `pluralSeparator: false` —— 不按旧规则生成 `_plural` key
  - `keepRemoved: true` —— 代码中已移除的 key 不自动删除，防误删
  - `namespaceSeparator: ":"`、`locales: ["en", "zh-CN"]`、`output: "src/i18n/locales/$LOCALE/$NAMESPACE.json"`
  - input 为 `src/**/*.{ts,tsx}` 并排除 `*.test.*` / `*.spec.*`
- script：`"extract:i18n": "i18next -c i18next-parser.config.cjs"` —— **注意 bin 名是 `i18next`，不是 `i18next-parser`**
- **42 个 locale 文件被规范化**（21 namespace × 2 locale）：移除 BOM、`\uXXXX` 转义还原为直接字符、16 个复数基础 key 填值

### 5.1 extract:i18n 使用流程

1. 运行 `npm run extract:i18n`。
2. **清理误报**：parser 会把 `src/features/settings/hooks/useSettingsViewOrchestration.ts` 中 2 个局部变量 `optionKeyLabel` / `metaKeyLabel` 误报为 key（`t()` 的插值选项对象属性被词法分析器提取），需在 en / zh-CN 两个 locale 文件中人工删除这两个 key。
3. 校验：`npm run test -- src/i18n`（奇偶校验 31 个测试）确认 en/zh 同构；parser 只补齐 en 侧而 zh 侧缺失时，奇偶校验会报错提示补译。
4. 提交前 `git diff` 复核：正常 extract 不应产生 42 个文件的无关 diff（首次规范化后格式幂等）。

**已知限制**：
- parser 输出格式与人工维护格式不同（引号/排序/缩进风格）；首次 normalize 后再次运行幂等，两者不要混用手改。
- `i18next-parser@9.0.2` 官方已标注 **deprecated**（推荐迁移 `i18next-cli`）；当前可用，迁移留待后续。

## 6. 验证结果（2026-08-06）

| 检查 | 结果 |
|---|---|
| `npm run test` 全量 | **1032 passed / 0 failed**（较 Phase 2 基线 1026/6，修复 6 个预存失败） |
| `npm run test -- src/i18n` | 31 passed（奇偶校验 + 语言切换 + fallback） |
| `npm run typecheck` | 通过 |
| `npm run build`（vite） | **待验证**（Phase 3 结束前未跑，PR 前需补验） |
| `cargo check` | 被上游 #599（whisper-rs bindgen）阻塞，未编译验证 |
| 测试文件 | 除 `threadStatus.test.ts` 断言改为 key 外，未改动既有测试 |

## 7. 已知遗留

1. **Rust 侧运行时语言切换**：`handle_menu_event` 无语言切换事件，菜单/托盘文本启动后不随语言切换即时更新（Phase 1 决策 C，需重启应用生效）。
2. **英文复数 `_plural` 旧 key**：i18next v24 采用 v4 复数规则后，旧 `_plural` key 成为死代码；部分 key（如 `countFiles`）英文复数可能显示单数形式。处理方案：按 v4 规则（`_one` / `_other`）迁移，列为遗留项。
3. **i18next-parser deprecated**：v9.0.2 官方已标注 deprecated，推荐迁移 `i18next-cli`；当前可用。
4. **vite build 未验证**：PR 前需补跑 `npm run build`。
5. **cargo check / tauri build 阻塞**：#599（whisper-rs MSVC bindgen）未解决，Rust 侧改动仅人工审查。

## 8. PR 交接（开新对话时引用本文件）

- **仓库状态**：分支 `i18n-phase3`，checkpoint commit `1654d66`（160 文件）；Phase 1/2/3 全部改动在分支上，未提交到上游。提交前先 `git status` 复核。
- **PR 目标**：从 waliean fork 提交到 `Dimillian/CodexMonitor`，关联 issue #567；PR 描述需声明 Intl 本地化修复了中文 Windows 预存失败，以及 #599 构建限制。
- **验证基线**：全量测试 1032/0；PR 前补跑 `npm run build`（vite）。
- **关键文件**：`src/i18n/i18n.ts`（namespace 注册）、`src/i18n/i18n.test.ts`（奇偶校验）、`i18next-parser.config.cjs` + `package.json` 的 `extract:i18n` script、`src-tauri/src/i18n.rs`（Rust 侧 `t_rs`）、`docs/i18n-glossary.md`（术语基准）。
- **历史记录**：`docs/i18n-phase1-plan.md`、`docs/i18n-phase2-plan.md` 保持原样，不修改。
