# CodexMonitor 深度审计报告（实时状态）

日期: 2026-02-16  
范围: 前后端一致性、前端功能完整度、日志闭环、测试严谨性、UI 可读性

## 总结

- 历史 10 项问题已完成高优先级修复，当前 **P0=0, P1=0**。
- 本轮新增/保留问题集中在 P2（测试深度与工程整洁度）。
- 关键验收链路已通过:
  - `npm run typecheck` ✅
  - `npm run lint` ✅
  - `npm run test` ✅（104 files / 612 tests）
  - `npm run test:coverage:gate` ✅（branches 64.96% ≥ 63% gate）
  - `npm run test:e2e:smoke` ✅（3/3）
  - `cargo check` ✅（仅 warning，无编译错误）

## 已修复项（闭环）

### 1) `useAppServerEvents` 可观测性与分支覆盖增强（已完成）
- 生产环境对 unsupported method 已提供可见错误 toast（含节流），不再纯静默。
- 覆盖了 fallback quiet-window/max-wait、nested agent message shape、guarded payload no-op 等关键路径。
- 证据:
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/app/hooks/useAppServerEvents.ts:538`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/app/hooks/useAppServerEvents.ts:545`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/app/hooks/useAppServerEvents.test.tsx:1093`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/app/hooks/useAppServerEvents.test.tsx:1127`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/app/hooks/useAppServerEvents.test.tsx:1235`
- 量化:
  - `useAppServerEvents.ts` branches: `60.88% -> 66.66%`

### 2) `dictationHoldKey` 前后端契约对齐（已完成）
- 前端设置类型已与后端统一为非空字符串，消除 nullable 漂移。
- 证据:
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/types.ts:228`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/app/hooks/useDictationController.ts:41`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/settings/components/sections/SettingsDictationSection.tsx:172`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/types.rs:659`

### 3) 小字号可读性基线修复（已完成）
- `src/styles/` 中 `9/10/11px` 已清零，最低字号提升至 12px。
- 证据:
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/styles/settings.css:111`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/styles/messages.css:121`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/styles/debug.css:66`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/styles/diff.css:964`

### 4) 关键历史缺陷闭环状态
- 菜单访问模式断链: 已通过事件层与菜单能力收敛处理（无遗留 `menu-composer-cycle-access` 断链引用）。
- 前端硬编码 API Key: 已移除默认明文 key，`DEFAULT_CONFIG.apiKey` 为空字符串。
- 事件发射吞错: 已补后端 emit 失败日志。
- CLIProxyAPI 设置错误用户可见: 已补 `pushErrorToast` 与单测。

证据:
- `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/services/cliproxyapi.ts:27`
- `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src/features/settings/components/sections/SettingsCLIProxyAPISection.tsx:92`
- `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/event_sink.rs:19`
- `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/remote_backend/transport.rs:147`

## 当前剩余问题（按优先级）

### P2-1: E2E 仍偏薄，只覆盖 smoke 级首页可见性
- 现象:
  - E2E 当前仅 `e2e/smoke.spec.ts`，主要验证首页入口与空态可见性。
  - 缺少关键真实流程（设置保存回读、菜单快捷键触发、线程发送/回流、错误提示链路）。
- 证据:
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/package.json:36`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/e2e/smoke.spec.ts:1`
- 风险:
  - 跨层回归（前端状态 + Tauri IPC + 事件总线）仍可能漏检。

### P2-2: `useAppServerEvents` 分支覆盖虽显著提升，但仍有复杂分支待压实
- 现象:
  - 分支覆盖已提升至 66.66%，但该文件控制流复杂，仍有未覆盖分支。
- 证据:
  - `.runtime-cache/coverage/tmp-useappserverevents-after/coverage-summary.json`
  - `.runtime-cache/coverage/tmp-useappserverevents-after2/coverage-summary.json`
- 风险:
  - 协议演进时，低频异常分支仍可能发生退化。

### P2-3: Rust 侧 `codex_update_core` 在 daemon 构建路径触发 dead_code 警告
- 现象:
  - `cargo check` 对 `codex_monitor_daemon` 报告未使用结构/函数。
- 证据:
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/shared/codex_update_core.rs:13`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/shared/codex_update_core.rs:24`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/shared/codex_update_core.rs:35`
  - `/Users/yuyifeng/Documents/VS Code/1_Personal_Project/[UIUX]CodexMonitor/CodexMonitor/src-tauri/src/shared/codex_update_core.rs:144`
- 风险:
  - 功能挂接不清晰，长期会演化为“名义能力”与“实际路径”偏差。

## 审计结论

- 当前代码库在“前后端一致性、日志闭环、UI 可读性基线”方面已显著收敛，未发现新的 P0/P1 阻断项。
- 下一阶段应聚焦 P2：把 E2E 从 smoke 扩展为关键流程回归、继续压缩高复杂控制层的未覆盖分支、清理 Rust dead_code 警告以维持工程卫生。
