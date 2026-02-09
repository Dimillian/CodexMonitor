# 上游 v0.7.49 合并修复文档

## 合并信息

- **上游仓库**: Dimillian/CodexMonitor
- **上游版本**: v0.7.49
- **本地版本**: v0.7.44
- **合并分支**: merge-upstream-v0.7.49
- **合并提交**: a7755951
- **合并日期**: 2026-02-09

## 版本差距

本地落后上游 **5 个小版本**：
- v0.7.44 → v0.7.45
- v0.7.45 → v0.7.46
- v0.7.46 → v0.7.47
- v0.7.47 → v0.7.48
- v0.7.48 → v0.7.49

## 冲突文件及解决策略

### 1. .gitignore
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游添加了新的忽略规则，包括 iOS TestFlight 环境文件
**变更**:
- 添加 `.testflight.local.env`
- 添加 Nix 构建相关忽略规则

### 2. src-tauri/Cargo.lock
**策略**: 使用上游版本 (`--theirs`)
**原因**: Cargo.lock 应该与上游版本保持一致
**变更**: 包含大量依赖更新

### 3. src-tauri/Cargo.toml
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游添加了新的依赖和功能
**变更**:
- 版本更新: `0.7.44` → `0.7.49`
- 新增依赖:
  - `futures-util = "0.3"`
  - `tokio-tungstenite = { version = "0.24", features = ["rustls-tls-webpki-roots"] }`
  - iOS 相关依赖 (`[target."cfg(target_os = \"ios\")".dependencies]`)
- git2 依赖更新: 添加 `vendored-openssl` 和 `vendored-libgit2` features

### 4. src-tauri/src/menu.rs
**策略**: 保留本地版本 (`--ours`)
**原因**: 本地有完整的中文化翻译
**保留内容**:
- 所有菜单项的中文翻译
- 应用菜单、文件菜单、编辑菜单、视图菜单、窗口菜单、帮助菜单
**需要验证**: 确保没有丢失上游的新菜单功能

### 5. src/features/app/components/TabBar.tsx
**策略**: 保留本地版本 (`--ours`)
**原因**: 本地有国际化支持
**保留内容**:
- 完整的 i18n 集成
- 中文标签显示
**需要验证**: 确保没有丢失上游的移动端改进

### 6. src/features/git/components/GitDiffPanel.tsx
**策略**: 保留本地版本 (`--ours`)
**原因**: 本地有国际化支持
**保留内容**:
- 所有用户可见文本的国际化
- `t()` 函数包装的文本
**需要验证**: 确保没有丢失上游的重构优化

### 7. src/features/messages/components/Messages.tsx
**策略**: 保留本地版本 (`--ours`)
**原因**: 本地有国际化支持
**保留内容**:
- 完整的 i18n 集成
**需要验证**: 确保没有丢失上游的新功能

### 8. src/features/settings/components/SettingsView.test.tsx
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游进行了大规模重构，SettingsView 被拆分成多个模块
**变更**:
- 测试更新以适配新的 SettingsView 结构
**风险**: 可能丢失本地化的测试文本

### 9. src/features/settings/components/SettingsView.tsx
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游进行了大规模重构，拆分成多个子组件
**变更**:
- 新增模块化结构:
  - `SettingsNav.tsx`
  - `SettingsCodexSection.tsx`
  - `SettingsComposerSection.tsx`
  - `SettingsDictationSection.tsx`
  - `SettingsDisplaySection.tsx`
  - `SettingsEnvironmentsSection.tsx`
  - `SettingsFeaturesSection.tsx`
  - `SettingsGitSection.tsx`
  - `SettingsOpenAppsSection.tsx`
  - `SettingsProjectsSection.tsx`
  - `SettingsServerSection.tsx`
  - `SettingsShortcutsSection.tsx`
**风险**: 完全丢失本地化的设置界面
**需要验证**: 所有设置项的中文翻译

### 10. src/features/threads/hooks/useThreadMessaging.ts
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游有重要的功能更新
**变更**: 可能包含新的消息处理逻辑

### 11. src/features/workspaces/components/WorkspaceHome.tsx
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游有重要的 UI 改进
**变更**: 可能包含新的工作区功能

### 12. src/main.tsx
**策略**: 使用上游版本 (`--theirs`)
**原因**: 上游有重要的架构更新
**变更**: 可能包含新的初始化逻辑

## 上游新增功能（需要验证）

### v0.7.49
- 自动生成新线程标题
- Git diff 路径拆分（文件名和目录分离）
- 可编辑的提交消息提示（在 Git 设置中）
- Token 使用重置处理

### v0.7.48
- TestFlight 发布流程
- 身份/版本检查
- 退出持久化切换

### v0.7.47
- 计划就绪的后续操作
- turn/steer 支持
- Codex 更新按钮 (brew/npm)
- 后台获取模式
- 电话主页选项卡
- 刷新图标动画

### v0.7.46
- 刷新所有工作区线程按钮
- 服务器设置向导
- iOS 构建脚手架
- 移动端主从导航
- Server 部分（TCP 守护进程控制）
- 消息文件路径显示切换

### v0.7.45
- Tailscale 引导助手
- Orbit WS 传输
- 远程模式支持

## TypeScript 错误（需要修复）

**数量**: 12 个错误

### 主要错误类型

1. **MessagesProps 类型不匹配** (多个文件)
   - `src/features/layout/hooks/layoutNodes/buildPrimaryNodes.tsx:101`
   - `src/features/messages/components/Messages.test.tsx` (多处)
   - 原因: 保留本地版本导致 props 类型不匹配上游的新接口

2. **TabKey 类型不匹配**
   - `src/features/layout/hooks/layoutNodes/buildPrimaryNodes.tsx:299`
   - 原因: 上游扩展了 TabKey 类型

## 测试失败（需要修复）

**统计**:
- 测试文件: 84 passed, 1 failed
- 测试用例: 438 passed, 8 failed, 1 skipped

### 失败的测试
所有失败都在 `src/features/messages/components/Messages.test.tsx`:
1. `dismisses the plan-ready follow-up when the plan is accepted`
2. `does not render plan-ready tagged internal user messages`
3. `hides the plan follow-up when an input-requested bubble is active`
4. (以及 5 个其他失败)

**原因**: 保留本地 Messages.tsx 版本导致测试不匹配上游的新功能（plan-ready 功能）

## 验证清单

### 高优先级验证项

- [ ] **菜单中文化完整性**
  - 验证所有菜单项显示中文
  - 验证没有缺失的菜单功能
  - 验证快捷键正确工作

- [ ] **设置界面国际化**
  - 检查 SettingsView.tsx 是否丢失中文翻译
  - 如果丢失，需要添加 i18n 支持
  - 验证所有设置选项都能正常显示

- [ ] **Git 面板功能**
  - 验证 Git diff 显示正常
  - 验证提交消息编辑功能（新功能）
  - 验证 GitHub Issues 集成

- [ ] **新功能验证**
  - 计划就绪后续操作
  - Token 使用重置处理
  - 自动生成线程标题

### 中优先级验证项

- [ ] **TypeScript 类型检查**
  - 修复 12 个类型错误
  - 重点修复 MessagesProps 类型不匹配

- [ ] **测试修复**
  - 修复 Messages.test.tsx 中的 8 个失败测试
  - 确保所有测试通过

- [ ] **移动端/ iOS 功能**
  - 验证移动端布局（如果有 iOS 设备）
  - 验证服务器设置向导

### 低优先级验证项

- [ ] **性能检查**
  - 确保没有性能回退
  - 检查内存使用

- [ ] **UI 一致性**
  - 检查所有组件的 UI 一致性
  - 确保主题切换正常

## 修复建议

### 立即需要修复

1. **TypeScript 错误**
   ```bash
   npm run typecheck
   ```
   修复所有 12 个类型错误，特别是 MessagesProps 相关的

2. **测试失败**
   ```bash
   npm test
   ```
   修复 Messages.test.tsx 中的 8 个失败测试

3. **设置界面国际化**
   - 检查 SettingsView.tsx 的中文翻译
   - 可能需要为新的设置模块添加翻译

### 后续改进

1. **代码审查**
   - 审查所有保留本地版本的文件
   - 确保没有丢失上游的关键功能

2. **功能测试**
   - 测试所有新功能是否正常工作
   - 测试计划就绪后续操作
   - 测试自动线程标题生成

3. **文档更新**
   - 更新 README 中的版本信息
   - 添加新功能的文档

## 风险评估

### 高风险项

1. **SettingsView.tsx 完全使用上游版本**
   - **风险**: 丢失所有设置界面的中文翻译
   - **影响**: 用户设置界面将显示英文
   - **缓解**: 需要为新的设置模块添加 i18n 支持

2. **MessagesProps 类型不匹配**
   - **风险**: 运行时错误
   - **影响**: 消息显示可能异常
   - **缓解**: 修复类型定义

### 中风险项

1. **菜单功能缺失**
   - **风险**: 上游新增的菜单功能可能不可用
   - **影响**: 功能不完整
   - **缓解**: 仔细对比上游菜单变化

2. **测试失败**
   - **风险**: 代码质量下降
   - **影响**: 可能引入回归 bug
   - **缓解**: 修复测试

### 低风险项

1. **配置文件差异**
   - **风险**: 构建配置不一致
   - **影响**: 构建可能失败
   - **缓解**: 使用上游版本已经处理

## 后续步骤

1. **修复 TypeScript 错误** (高优先级)
2. **修复测试失败** (高优先级)
3. **添加设置界面的国际化** (高优先级)
4. **全面功能测试** (中优先级)
5. **代码审查和优化** (低优先级)
6. **更新文档** (低优先级)

## 合并到 main 的条件

在合并到 main 分支之前，必须满足以下条件：

- [ ] 所有 TypeScript 错误已修复
- [ ] 所有测试通过（84/85 文件，447/447 用例）
- [ ] 设置界面支持中文
- [ ] 关键新功能测试通过
- [ ] 代码审查完成

## 联系信息

如有问题，请查看：
- 上游仓库: https://github.com/Dimillian/CodexMonitor
- 合并分支: merge-upstream-v0.7.49
- 主分支: main