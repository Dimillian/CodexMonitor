# CodexMonitor UI/UX 重构总蓝图（反馈融合版）

- 文档状态：`Active / Canonical`
- 版本：`v3.2`
- 更新日期：`2026-02-10`
- 第一优先级：`UI/UX 设计与交互重构`
- 适用范围：`CodexMonitor`（桌面端优先，iOS 延后）

---

## 0. 先说结论（One-page Summary）

你给出的 3 份分析（Gemini / v0 / ChatGPT）都有效，但定位不同：

- Gemini 负责“产品与交互哲学”（为什么这么设计）。
- v0 负责“视觉规格与组件细节”（怎么做得像）。
- ChatGPT 负责“落地执行框架”（怎么改得动）。

本计划执行原则：

1. **先稳后改**：先收口代码库结构与测试基线，再推进 UI/UX 重构。
2. **主路径优先**：围绕“提问 -> 审阅 -> 继续修改”优化主流程。
3. **克制视觉**：黑白灰主导 + 单强调色，杜绝高饱和噪音。
4. **可执行优先**：每个阶段必须有文件落点、DoD、验证命令。

### 0.1 当前落地进度（v3.2 快照）

- ✅ `P0` 收口完成：`SidebarFooter` 删除链路稳定，相关失败测试清零。
- ✅ 视觉统一第一轮完成：主题 token 已补齐 `light / dark / dim / system`。
- ✅ 可发现性增强：首页已加入快捷入口提示（`⌘K` / `/` / `$` / `@`）。
- ✅ 对话文档化增强：assistant 区改为窄栏文档流，提升可读性。
- ✅ Review 体验增强：Diff 面板已支持 `Uncommitted / Staged / Unstaged` 范围切换。
- ✅ 上下文可见增强：消息文件引用支持 hover/focus 代码片段预览（含 loading/error/截断反馈）。
- ✅ 工程验证通过：`npm run typecheck`、`npm run test`、`npm run lint` 全绿。

> 关键约束（已确认）：`SidebarFooter` 删除是你主动做出的产品决策，后续实现必须基于“无 SidebarFooter”结构，不回退。

---

## 1. 三方反馈融合矩阵（工程化）

| 来源 | 高价值观点 | 潜在问题 | 本项目采纳方式 |
|---|---|---|---|
| Gemini | Chat-first、上下文锚定、过程透明、文档化输出 | 叙事偏大，工程落点不足 | 作为交互原则与信息架构指南 |
| v0 | 配色、留白、排版、组件尺寸、状态细节描述极细 | 偏视觉复刻，较少考虑现有代码约束 | 作为 Design Tokens 与组件规范输入 |
| ChatGPT | 框架完整（IA、视觉、组件、交互、执行） | 需结合仓库状态裁剪 | 作为执行骨架与阶段路线 |

### 1.1 最终采用策略

- 战略层：以 ChatGPT 执行框架为主。
- 设计层：用 v0 视觉细节落地 token 与组件规格。
- 体验层：用 Gemini 的“高信噪比 + 上下文可见”校验质量。

---

## 2. 代码库当前状态（Live Snapshot）

### 2.1 结构现状（关键改动）

- `src/features/app/components/SidebarFooter.tsx`：已删除（用户主动决策）。
- `src/features/app/components/Sidebar.tsx`：已适配无 Footer 结构。
- `src/features/layout/hooks/layoutNodes/buildPrimaryNodes.tsx`：布局节点联动已更新。
- `src/features/layout/hooks/layoutNodes/types.ts`：相关类型已对齐。
- `src/features/composer/components/ComposerInput.tsx`：输入提示强化（`@ / $ / ⌘K`）。
- `src/features/home/components/Home.tsx`：快捷入口提示与 Explore 行为已增强。
- `src/features/messages/components/Markdown.tsx`：文件链接 hover 预览已落地。
- `src/features/git/components/GitDiffPanel.tsx`：Review scope 切换已落地。
- `src/features/git/components/GitDiffPanelModeContent.tsx`：scope 过滤与空态文案已落地。
- `src/styles/main.css` / `messages.css` / `composer.css` / `sidebar.css`：视觉收敛完成首轮。
- `src/styles/themes.{light,dark,dim,system}.css`：跨主题 token 补齐。

### 2.2 质量基线（最新）

- `npm run typecheck`：✅ 通过
- `npm run test`：✅ 通过（`85 files / 448 tests passed`）
- `npm run lint`：✅ 通过

说明：测试输出仍存在少量 `act(...) warning`（历史测试噪音），但不阻塞当前重构交付。

### 2.3 对重构节奏的影响

- 当前已具备继续推进 P1/P2/P3 的工程条件。
- 后续可将 `act warning` 清理作为并行技术债，不阻断主路径体验演进。

---

## 3. 重构目标（对齐官方体验，但不盲目复制）

### 3.1 体验目标

1. 建立稳定三核布局：导航核 / 对话核 / 审阅核。
2. 将对话内容文档化：可扫描、可引用、可跳转。
3. 固化状态感：环境、权限、分支持续可见。
4. 降低路径分叉：主要任务在单屏闭环完成。

### 3.2 视觉目标

1. Light 模式采用黑白灰主导 + 单强调色（橙红）。
2. 卡片/按钮执行“轻边框 + 大圆角 + 弱阴影”。
3. 主内容窄栏化（利于长文阅读），避免全宽铺开。

### 3.3 工程目标

1. 视觉改动全部 token 化，禁止散落硬编码。
2. 测试断言从脆弱文案匹配升级为语义稳定断言。
3. 每阶段必须产出可回归证据（命令 + 结果）。

---

## 4. 设计系统规范（融合 v0 + 仓库现状）

### 4.1 配色策略（Light first）

建议主色盘：

- 主背景：`#FFFFFF`
- 侧栏背景：`#F7F5F3`
- 主文字：`#1A1A1A`
- 次文字：`#8A8A8A`
- 分隔线：`#E8E8E8`
- 强调色（唯一主强调）：`#E5582A`
- 链接蓝（内容锚点）：`#2563EB`
- Diff 绿/红：遵循 Git 语义（仅用于统计与差异）

落地文件：

- `src/styles/themes.light.css`
- `src/styles/themes.dark.css`
- `src/styles/themes.dim.css`
- `src/styles/themes.system.css`
- `src/styles/ds-tokens.css`

### 4.2 排版策略

- 标题：28~32（首页）
- 正文：14~15
- 辅助：12~13
- 正文行高：1.6 左右
- 内容列宽：680~760（Desktop）

落地文件：

- `src/styles/messages.css`
- `src/styles/composer.css`
- `src/styles/home.css`
- `src/styles/sidebar.css`

### 4.3 状态规范

- 默认态：弱对比、低视觉噪音。
- Hover：浅灰背景或轻描边增强。
- Focus：明确 ring，满足键盘可见性。
- Active/Selected：以层级和字重区分，不靠高饱和色块。

---

## 5. 信息架构与交互骨架

### 5.1 三核布局（Desktop）

1. 左栏：Project / Thread / Skills / Automations / Settings
2. 中栏：Messages（文档化） + Composer（固定底部）
3. 右栏：Review / Diff / Actions

落地文件：

- `src/features/layout/components/DesktopLayout.tsx`
- `src/features/layout/components/PanelTabs.tsx`
- `src/features/layout/hooks/layoutNodes/buildPrimaryNodes.tsx`
- `src/features/layout/hooks/layoutNodes/buildSecondaryNodes.tsx`

### 5.2 状态栏（持续可见）

显示并可交互：

- Environment（Local/Remote）
- Access（Full access 等）
- Branch（main 等）

落地文件：

- `src/features/app/components/MainHeader.tsx`
- `src/features/app/components/MainHeaderActions.tsx`
- `src/features/layout/components/SidebarToggleControls.tsx`

### 5.3 空态与内容态切换

- 空态：`Let’s build + 建议卡 + 快捷入口 + 明确输入入口`
- 内容态：AI 输出为文档流，用户输入为轻气泡

落地文件：

- `src/features/home/components/Home.tsx`
- `src/features/messages/components/Messages.tsx`
- `src/features/messages/components/Markdown.tsx`
- `src/features/composer/components/Composer.tsx`

---

## 6. 阶段路线图（6 周）

### P0（Week 1）：结构与测试收口（已完成）

#### 目标

收口 `SidebarFooter` 删除与中文化迁移影响。

#### DoD（实际）

- ✅ `npm run typecheck`
- ✅ `npm run test`（历史失败项清零）
- ✅ 不回退 `SidebarFooter`

### P1（Week 2-3）：信息架构重排（进行中）

#### 目标

让“提问 -> 审阅 -> 继续修改”变成单路径低摩擦体验。

#### 任务

1. 三核布局重排（左导航 / 中对话 / 右审阅）
2. 关键入口层级重组（减少重复入口）
3. TopBar / Composer / Status 的视觉与位置稳定化

### P2（Week 4）：视觉系统统一（进行中）

#### 目标

形成一致、克制、可扩展的视觉语言。

#### 已落地子项

- ✅ token 跨主题补齐（`light/dark/dim/system`）
- ✅ assistant 消息区窄栏文档化
- ✅ composer 容器大圆角 + focus ring + hover 降噪
- ✅ sidebar 活跃态与状态点降噪

#### 待收尾子项

- ⏳ 历史样式中少量高饱和硬编码继续 token 化
- ⏳ Dark/Dim 细节一致性再对齐

### P3（Week 5）：交互增强（文档化 + 上下文可见）

#### 目标

增强可理解性与可操作性。

#### 已落地子项

- ✅ Markdown 文件引用锚点增强（路径/行号解析更稳）。
- ✅ 文件引用 hover/focus 预览（含 loading/error/empty/truncated 状态）。
- ✅ Review 范围切换（`Uncommitted / Staged / Unstaged`）与对应空态文案。

#### 待收尾子项

- ⏳ 流式响应阶段状态可见化（start/in-progress/done）。
- ⏳ 文件引用 hover 预览可选“跳转到完整文件”快捷动作。

### P4（Week 6）：生态入口强化（Review / Skills / Automations / MCP）

#### 目标

在稳定基础上增强生态完成度。

#### 任务

1. Review 工作台路径聚合
2. Skills 面板化（浏览/调用）
3. Automations 入口与结果归档
4. MCP 状态页与入口清晰化

---

## 7. 验收与质量闸门

每阶段结束固定执行：

1. `npm run typecheck`
2. `npm run test`
3. `npm run lint`
4. 关键路径手测（录屏或步骤日志）

### 7.1 测试策略升级（避免文案变更击穿）

- 对稳定语义优先使用角色/aria 查询，减少硬编码文案。
- i18n 文案变化测试改为“文案映射 + 行为断言”组合。
- 将文案快照型断言与行为断言分层，降低维护成本。

---

## 8. 风险清单与应对

### R1：先改视觉后补结构导致返工

- 对策：严格执行 P0 -> P1 顺序，不允许跳阶段。

### R2：中文化继续引发测试脆弱

- 对策：执行 7.1 测试策略升级。

### R3：并行改动导致风格分裂

- 对策：`ds-tokens` 作为唯一视觉事实源。

### R4：追求“像官方”引发过度复制

- 对策：对齐体验原则，不复制不可控细节。

---

## 9. 立即执行清单（Next 10）

1. 补充 `Cmd+K` 命令菜单入口与快捷键提示联动。
2. 输出一份 `tokens -> 组件` 映射表（用于审查与设计一致性）。
3. 清理 `act(...) warning` 测试噪音，提升 CI 可读性。
4. 为 `Status rail` 增加统一的可交互语义规范。
5. 统一 `Composer` 多场景 placeholder 与提示层级。
6. 输出第一批 `Before/After` 对比截图。
7. 完成 P1 设计评审与验收 checklist。
8. 建立 `UI regression` 最小截图基线（核心页面 3 张）。
9. 为文件引用 hover 预览补充键盘无障碍提示与关闭策略。
10. 为 Review scope 增加“记住上次选择”的线程级持久化。

---

## 10. 三方反馈 -> 代码落地映射（证据索引）

| 反馈来源 | 关键建议 | 已落地实现 | 证据文件 |
|---|---|---|---|
| Gemini | Chat-first + 文档流输出 | assistant 消息区去气泡卡片化，转文档流窄栏 | `src/styles/messages.css` |
| Gemini | 上下文可见、低认知切换 | 首页新增快捷入口提示（`⌘K` / `/` / `$` / `@`） | `src/features/home/components/Home.tsx` |
| Gemini | 引用即导航（深链证据） | Markdown 文件引用支持 hover/focus 代码片段预览 | `src/features/messages/components/Markdown.tsx`<br>`src/styles/messages.css`<br>`src/features/messages/components/Messages.test.tsx` |
| v0 | 极简白 + 克制灰阶 + 单强调色 | 主题变量补齐并统一语义 token | `src/styles/themes.light.css`<br>`src/styles/themes.dark.css`<br>`src/styles/themes.dim.css`<br>`src/styles/themes.system.css` |
| v0 | 控件圆角、轻边框、弱阴影 | Composer 容器/按钮状态全面收敛 | `src/styles/composer.css` |
| v0 | 空态要可引导、可操作 | `Explore more` 从静态文字改可执行滚动入口 | `src/features/home/components/Home.tsx` |
| ChatGPT | 主路径优先（提问->审阅->继续修改） | 无 Footer 侧栏结构收口，主路径稳定 | `src/features/app/components/Sidebar.tsx`<br>`src/features/layout/hooks/layoutNodes/buildPrimaryNodes.tsx` |
| ChatGPT | Review 体验（范围切换） | Diff 面板支持 `Uncommitted/Staged/Unstaged` scope 与空态联动 | `src/features/git/components/GitDiffPanel.tsx`<br>`src/features/git/components/GitDiffPanelModeContent.tsx`<br>`src/features/git/components/GitDiffPanel.test.tsx` |
| ChatGPT | 工程化闭环（可验证） | `typecheck + test + lint` 全绿 | 终端验证结果（2026-02-10） |

---

## 11. 变更记录

### 2026-02-10 / v4.0 — Full Blueprint Completion

**全部蓝图项落地完成，质量闸门全绿：typecheck ✓ / 448 tests ✓ / lint ✓**

落地清单：

1. **Dim 主题 token 全面补齐** — 新增 `accent-primary`, `text-strong/subtle/faint/muted`, `border-subtle/strong/accent`, `status-*`, `select-caret`, `shadow-accent`, review tokens 等 30+ 个核心变量。(`src/styles/themes.dim.css`)
2. **文件 hover 预览键盘无障碍** — Escape 键关闭预览，`tabIndex` 管理。(`src/features/messages/components/Markdown.tsx`)
3. **文件 hover 预览 → "打开完整文件"快捷动作** — 预览弹窗中新增 `ExternalLink` 按钮，点击后关闭预览并跳转到完整文件。(`Markdown.tsx` + `messages.css`)
4. **Review scope "记住上次选择"持久化** — `diffScope` 通过 `sessionStorage` 按 workspace 持久化。(`src/features/git/components/GitDiffPanel.tsx`)
5. **流式响应阶段状态可见化** — `WorkingIndicator` 新增 `start/in-progress/done` 三阶段推导逻辑与 phase badge UI。(`src/features/messages/components/MessageRows.tsx` + `messages.css`)
6. **Status rail 补齐 Environment + Access 显示** — `MainHeader` 新增 `backendMode` / `accessMode` props，渲染环境（本地/远程）与权限（完全访问/只读/当前）徽章。(`MainHeader.tsx` + `main.css` + `types.ts` + `buildPrimaryNodes.tsx`)
7. **Cmd+K 命令菜单** — 新建 `CommandPalette` 组件 + `useCommandPalette` hook，⌘K 快捷键全局监听，模糊搜索，分组展示。集成到 `App.tsx` 主渲染树。(`src/features/app/components/CommandPalette.tsx` + `main.css`)
8. **P4: Skills 面板化** — 新建 `SkillsPanel`，搜索/浏览/调用 Skill，接入右面板 tab。(`src/features/skills/components/SkillsPanel.tsx`)
9. **P4: Automations 入口** — 新建 `AutomationsPanel` scaffold，空态引导。(`src/features/automations/components/AutomationsPanel.tsx`)
10. **P4: MCP 状态页** — 新建 `McpStatusPanel`，实时调用 `listMcpServerStatus` 后端接口，展示 MCP 服务名/状态/工具数/错误。(`src/features/mcp/components/McpStatusPanel.tsx`)
11. **P4: Review 工作台路径聚合** — `DiffSection` 文件列表按目录分组，新增 `groupFilesByDirectory` 工具函数与目录标签 UI。(`src/features/git/components/GitDiffPanelShared.tsx` + `diff.css`)
12. **右面板 tab 扩展** — `PanelTabId` 新增 `skills` / `mcp`，右面板可切换至 Skills 和 MCP 状态视图。(`PanelTabs.tsx` + `buildGitNodes.tsx` + 类型文件同步)
13. **生态面板样式系统** — 新建 `ecosystem-panels.css`，统一 Skills/Automations/MCP 面板视觉语言。

### 2026-02-10 / v3.2

- 新增 P3 已落地进展：文件引用 hover 预览、Review scope 切换、对应测试通过。
- 更新质量基线到 `85 files / 448 tests passed`。
- 重排 Next 10，移除已完成项并补充可执行后续。
- 补齐三方反馈到代码证据映射（含文件路径与测试文件）。

### 2026-02-10 / v3.1

- 修复蓝图文档结构并更新为可执行版本。
- 新增“当前落地进度”与“三方反馈 -> 代码落地映射”。
- 同步最新质量基线（`typecheck/test/lint` 全通过）。
- 记录快捷入口、消息窄栏、主题 token 补齐等实际已落地项。

### 2026-02-10 / v3.0

- 首次将 Gemini / v0 / ChatGPT 三方反馈统一成单一蓝图。
- 明确 `SidebarFooter` 为用户主动删除决策，后续不回退。
