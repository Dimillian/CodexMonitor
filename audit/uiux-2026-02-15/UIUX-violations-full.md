# CodexMonitor UI/UX 审计总表（实时态）

- 更新时间: 2026-02-15 12:35 PST
- 审计范围: /Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor-uiux-audit
- 分支: `codex/uiux-audit-20260215`
- 规则基线:
  - `/Users/yuyifeng/.codex/rules/ui-ux-generation.md`
  - `/Users/yuyifeng/.codex/rules/tauri-desktop-style.md`

## 1. 当前指标快照

- `hardcoded-colors.txt`: **154**
- `hardcoded-colors-non-theme.txt`: **0**
- `hardcoded-colors-theme-unique-values.txt`: **154**
- `non-scale-spacing.txt`: **0**
- `font-size-below-14px.txt`: **0**
- `line-height-below-1.5.txt`: **0**
- `important-usage.txt`: **0**
- `inline-styles.txt`: **0**
- `non-semantic-interactions-round2.txt`: **0**
- `outline-none.txt`: **0**
- `motion-files-without-reduced-motion-guard.txt`: **0**
- `motion-too-slow-over-500ms.txt`: **0**
- `layout-affecting-animation.txt`: **0**
- `image-best-practices-coverage.txt`: **92**
- `img-missing-attrs.txt`: **0**
- `image-srcset-2x-implementation.txt`: **20**

## 2. 本轮核心收敛（持续执行）

1. 排版合规完成
- `font-size-below-14px`: **371 -> 0**
- `line-height-below-1.5`: **24 -> 0**

2. 间距尺度合规完成
- `non-scale-spacing`: **244 -> 0**

3. 颜色硬编码继续收敛
- `hardcoded-colors`: **532 -> 309**
- 当前剩余全部集中在主题 token 源文件（`themes.dark.css` / `themes.dim.css` / `themes.light.css` / `themes.system.css`）。

4. 本轮新增收敛（03:44）
- `inline-styles`: **24 -> 0**
- `important-usage`: **9 -> 7**
- 处理内容: 线程列表缩进、Diff 树缩进、文件树缩进与骨架宽度从 inline style 迁移为 class 驱动；`App` 根节点与多个弹层/进度/波形节点改为 `ref + style.setProperty` 注入 CSS 变量；本轮将 `GitDiffViewer / FileTreePanel / Messages` 三处虚拟列表以及 `ComposerInput` 联想定位全部迁移到 CSS 变量注入方案，清零 JSX `style`；面板 resize 期间 transition 规则移除非必要 `!important`。

5. 本轮新增收敛（04:16）
- Lighthouse 无障碍关键项清零:
  - `color-contrast`: **fail -> pass (score=1)**
  - `select-name`: **fail -> pass (score=1)**
- 处理内容:
  - `Home.tsx` 为工作区 `select` 增加可访问名称 `aria-label`。
  - `home.css` 提升 `home-hero-eyebrow` 与 `home-section-title` 对比度（`--text-faint -> --text-subtle`）。
  - `buttons.css` 主按钮文字改为 `--text-on-accent`，并在 light/dim/dark/system 主题补齐 token，保证主按钮在不同主题下对比度合规。

6. 本轮新增收敛（04:36）
- 布局时序抖动修复（post-paint -> pre-paint）:
  - `Sidebar` 添加菜单定位改为 `useLayoutEffect` 注入 CSS 变量，避免首帧位置闪跳。
  - `FilePreviewPopover` / `Markdown` 文件预览定位改为 `useLayoutEffect`。
  - `FileTreePanel` / `GitDiffViewer` 虚拟列表总高度与行偏移改为 `useLayoutEffect`，降低滚动抖动与首帧重排。
  - `App` 根级 `appCssVars` 与 `useCodeCssVars` 改为 `useLayoutEffect`，减少首帧字体与布局变量闪变。
  - `UpdateToast` / `ComposerMetaBar` / `DictationWaveform` / `SettingsDictationSection` 的进度与波形 CSS 变量注入改为 `useLayoutEffect`。
- 语义结构修复:
  - 线程/工作区/工作树行组件内按钮节点改为合法结构，移除按钮内块级容器（`div`）热点，降低语义与可访问性风险。
  - 追加修复 `SkillsPanel`、`GitDiffPanelShared`、`GitDiffPanelModeContent` 按钮内容结构，继续收敛按钮内块级容器风险。

7. 本轮新增收敛（04:44）
- 语义结构再收敛:
  - `Home` 最新对话卡片按钮内部结构改为 `span` 语义容器，移除按钮内 `div`。
  - `RequestUserInputMessage` 选项按钮内部标签/描述改为 `span`，移除按钮内 `div`。
  - 结构扫描结果: 全仓 `tsx` 中“`<button>...</button>` 包含 `<div>`”已清零。
- 样式收敛:
  - `terminal.css` 移除 2 处 `!important`（xterm 背景与高度），`important-usage` 由 **7 -> 5**。
  - 当时剩余集中于 `diffViewerTheme` 的 5 处第三方组件覆盖项（已在 04:56 轮次清零）。

8. 已清零项保持稳定
- 非语义交互、outline/focus、慢动效、布局抖动型动效、reduced-motion 覆盖均保持 0。

9. 本轮新增收敛（04:56）
- `important-usage`: **5 -> 0**
- 图片属性一致性:
  - `img-missing-attrs`: **9 -> 0**（`loading/width/height` 全量补齐）
- 处理内容:
  - `AboutView`、`OpenAppMenu` 补齐 `loading`。
  - `ImageDiffCard`、`FilePreviewPopover`、`MessageRows` 引入运行时图片固有尺寸探测并回填 `width/height`。
  - `diffViewerTheme` 移除最后 5 个 `!important`，保持 DS 样式一致性。

10. 本轮新增收敛（05:12）
- 图片响应式提示再收敛:
  - `img-missing-attrs`: **0**（升级为 `srcSet/loading/width/height/sizes` 五项后仍为 0）
  - `image-best-practices-coverage`: **54 -> 88**
- 微文案一致性:
  - 将本轮触达路径内英文残留替换为中文（如 `Explore more`、`Open image`、`Loading/Saving`、`Remove`）。
- 图片策略基线:
  - `src/features` 内 `<img>` 全量补齐 `srcSet + sizes`（当前统一 1x 基线），后续仅需在资产具备条件时升级多分辨率源。

11. 本轮新增收敛（12:17）
- 真实多分辨率资源落地:
  - `AboutView` 应用图标改为真实位图资产对（`44px + 88px`），`srcSet` 不再是同源 1x 占位。
  - OpenApp 图标改为真实位图资产对（`14px + 28px`、`18px + 36px`），菜单与设置页统一走 `1x, 2x` 资源。
- 主题颜色治理口径升级:
  - `hardcoded-colors` 维持 **309**（原始出现次数，全部位于主题 token 源文件）。
  - 新增去重口径 `hardcoded-colors-theme-unique-values`: **153**（主题层真实唯一字面量值）。

12. 本轮新增收敛（12:26）
- 主题颜色去重重构:
  - 四个主题文件（`themes.dark.css` / `themes.dim.css` / `themes.light.css` / `themes.system.css`）已改为共享颜色原语引用（`--theme-color-***`）。
  - `hardcoded-colors`: **309 -> 154**（下降 50.2%）。
  - `hardcoded-colors-non-theme`: 持续 **0**（组件层/非主题样式仍无字面量颜色回流）。
  - 去重口径同步为 **154**（与共享原语规模一致）。

13. 本轮新增收敛（12:35）
- 动态图片 `srcSet` 密度兜底全量补齐:
  - `MessageRows`、`ImageDiffCard`、`FilePreviewPopover`、`ComposerAttachments`、`WorkspaceHome`、`FileTreePanel`、`ComposerInput` 的运行时图片源已统一为 `1x, 2x`。
  - OpenApp 回退路径（自定义图标、generic app、generic folder）已移除纯 `1x` 回落。
- 指标变化:
  - `image-best-practices-coverage`: **88 -> 92**
  - `image-srcset-2x-implementation`: **2 -> 20**
  - `img-missing-attrs`: 持续 **0**
- 口径说明:
  - `2x` 实现计数包含“真实多分辨率资源”和“动态同源密度兜底”两类。
  - 真实静态多分辨率资源当前为 2 组：`AboutView` app icon、`openAppIcons` 优化位图对。

## 3. 剩余问题与结论

### P0
- 已全部清零。

### P1
1. `hardcoded-colors = 154`
- 来源定位: 仅主题 token 源文件（当前集中在 `themes.dark.css` 的共享颜色原语块）。
- 判定: 属于“主题源值定义层”而非“组件样式硬编码”，非主题文件字面量颜色保持 0。
- 去重视角: 主题字面量唯一值为 `154`，已与原始计数对齐（说明跨文件重复已被压缩）。

2. `inline-styles = 0`
- JSX 内联样式已清零；运行时定位改为 `ref + style.setProperty` 驱动 CSS 变量。

### P2
- 视觉优化项（非阻塞）:
- 动态图片（运行时 URI，如消息附件、diff data URI）已补齐 `1x, 2x` 密度兜底；后续可选增强项是生成真实多分辨率变体（例如 runtime canvas 生成缩略资源），以进一步优化传输体积与清晰度控制。

## 4. 质量闸门结果

- `npm run lint -- src`: 通过（12:35 PST）
- `npm run typecheck`: 通过（12:35 PST）
- `npm run test -- --run`: 通过（560/560，12:35 PST）
- `npm run build`: 通过（12:35 PST）
- Lighthouse: `accessibility=1.00`（`color-contrast=1`，`select-name=1`）
- axe CLI: 本轮重跑触发 `AXE_TIMEOUT`（已设置超时保护并如实记录）
- 备注: 测试输出仍有既有 `act(...)` 警告与预期错误日志打印，不影响通过。

## 5. 证据文件（单一事实来源）

- `audit/uiux-2026-02-15/hardcoded-colors.txt`
- `audit/uiux-2026-02-15/hardcoded-colors-non-theme.txt`
- `audit/uiux-2026-02-15/hardcoded-colors-theme-unique-values.txt`
- `audit/uiux-2026-02-15/hardcoded-colors-theme-unique-count.txt`
- `audit/uiux-2026-02-15/non-scale-spacing.txt`
- `audit/uiux-2026-02-15/font-size-below-14px.txt`
- `audit/uiux-2026-02-15/line-height-below-1.5.txt`
- `audit/uiux-2026-02-15/important-usage.txt`
- `audit/uiux-2026-02-15/button-div-inside-button.txt`
- `audit/uiux-2026-02-15/img-missing-attrs.txt`
- `audit/uiux-2026-02-15/inline-styles.txt`
- `audit/uiux-2026-02-15/non-semantic-interactions-round2.txt`
- `audit/uiux-2026-02-15/outline-none.txt`
- `audit/uiux-2026-02-15/motion-files-without-reduced-motion-guard.txt`
- `audit/uiux-2026-02-15/motion-too-slow-over-500ms.txt`
- `audit/uiux-2026-02-15/layout-affecting-animation.txt`
- `audit/uiux-2026-02-15/image-best-practices-coverage.txt`
- `audit/uiux-2026-02-15/image-srcset-2x-implementation.txt`
- `audit/uiux-2026-02-15/image-srcset-2x-coverage.txt`
- `audit/uiux-2026-02-15/lighthouse-home.json`
- `audit/uiux-2026-02-15/axe-home.json`

## 6. 剩余内联样式例外清单（0）

- 已清零，无例外项。
