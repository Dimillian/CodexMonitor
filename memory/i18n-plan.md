# CodexMonitor 国际化实施计划

> **目标**：修复 CI 测试失败，实现中英文切换，统一日期/数字格式化
>
> **创建日期**：2026-02-08

---

## 📋 目录

- [项目背景](#项目背景)
- [技术选型](#技术选型)
- [阶段 1：基础设施搭建](#阶段-1基础设施搭建)
- [阶段 2：核心组件重构](#阶段-2核心组件重构)
- [阶段 3：测试环境配置](#阶段-3测试环境配置)
- [并发执行计划](#并发执行计划)
- [风险和注意事项](#风险和注意事项)
- [验证标准](#验证标准)

---

## 项目背景

### 当前问题

- **测试失败**：396 测试中 39 个失败（失败率 9.8%）
- **根本原因**：组件硬编码中文文本，测试期望英文；Locale 敏感问题
- **影响文件**：PlanPanel, Home, SettingsView, Sidebar, GitDiffPanel 等

### CI 环境差异

| 方面 | 本地 | CI |
|------|------|-----|
| OS | Windows | Ubuntu |
| Locale | 中文 | en_US.UTF-8 |
| Node 版本 | 3.12.10 | 20 |

---

## 技术选型

### 推荐方案：i18next + react-i18next

**理由**：React 19 兼容、类型安全、生态成熟、轻量高性能

### 架构设计

```
src/i18n/
  config.ts              # i18next 配置
  react-i18n.d.ts        # TypeScript 类型定义
  hooks/                 # 封装 Hooks
  locales/               # 语言资源（按 feature 拆分）
    en/                   # 英文
    zh-CN/                # 中文
  utils/                 # 格式化工具
```

---

## 阶段 1：基础设施搭建（2-3 天）

### 步骤

1. **安装依赖**
   ```bash
   npm install i18next react-i18next i18next-browser-languageDetector
   npm install --save-dev @types/i18next
   ```

2. **创建配置文件**
   - `src/i18n/config.ts` - i18next 配置
   - `src/i18n/react-i18n.d.ts` - TypeScript 类型定义
   - `src/i18n/hooks/useTranslation.ts` - 封装 hook
   - `src/i18n/hooks/useLocale.ts` - 语言切换 hook
   - `src/services/i18n.ts` - 服务层

3. **创建测试工具**
   - `src/test/i18n-test-utils.tsx` - 测试时的 i18n mock

4. **配置测试环境**
   - 更新 `src/test/vitest.setup.ts`

### 验证标准
- [ ] 依赖安装成功
- [ ] i18n 配置文件编译通过
- [ ] `npm run typecheck` 通过

---

## 阶段 2：核心组件重构（3-5 天）

### 步骤

1. **创建语言资源文件（12 个）**
   - 英文：common, home, plan, settings, sidebar, errors
   - 中文：common, home, plan, settings, sidebar, errors

2. **重构核心组件（4 个）**
   - `src/features/home/components/Home.tsx`
   - `src/features/plan/components/PlanPanel.tsx`
   - `src/features/settings/components/SettingsView.tsx`
   - `src/features/app/components/Sidebar.tsx`

3. **创建格式化工具**
   - `src/i18n/utils/date.ts`
   - `src/i18n/utils/number.ts`

4. **更新测试文件（4 个）**
   - 对应的 .test.tsx 文件

### 验证标准
- [ ] 核心组件测试全部通过
- [ ] CI 测试失败数减少至少 50%

---

## 阶段 3：测试环境配置（1-2 天）

### 步骤

1. **配置测试环境**
   - 设置测试默认语言为英文
   - Mock Intl API

2. **配置 CI 环境**
   - 更新 `.github/workflows/ci.yml`
   - 添加 `LC_ALL: en_US.UTF-8`, `LANG: en_US.UTF-8`

3. **修复 Locale 敏感代码**
   - 搜索并替换 `Intl.DateTimeFormat`
   - 搜索并替换 `Intl.NumberFormat`

4. **添加语言切换功能**
   - 在 App.tsx 添加 I18nextProvider
   - 在设置界面添加语言选择器
   - 添加后端持久化支持

### 验证标准
- [ ] 所有测试在本地通过
- [ ] CI 环境测试通过
- [ ] 可以在中英文之间切换

---

## 并发执行计划

### 并发策略

**可并行的任务（无依赖）**：
- 基础设施搭建（配置文件、Hooks、服务层）
- 语言资源创建（12 个 JSON 文件）
- 格式化工具创建

**有依赖的任务**：
- 组件重构 → 依赖基础设施完成
- 测试更新 → 依赖组件重构完成
- CI 配置 → 依赖基础设施完成

### 代理分配方案

| 代理 | 职责 | 时间 | 依赖 |
|------|------|------|------|
| 1 | 基础设施搭建 | 1-2 小时 | 无 |
| 2 | 语言资源创建 | 1 小时 | 无 |
| 3 | 格式化工具创建 | 30 分钟 | 无 |
| 4 | 组件重构 | 2-3 小时 | 代理 1 |
| 5 | 测试更新 | 1-2 小时 | 代理 4 |
| 6 | CI 配置 | 1-2 小时 | 代理 1 |

### 执行流程

```
T0: 代理 1、2、3 并行（1-2 小时）
    ↓
T1: 代理 4、6 并行（2-3 小时）
    ↓
T2: 代理 5（1-2 小时）
    ↓
T3: 验证和测试

总时间：7-10 小时
```

### 协调机制

1. **任务依赖检查**：检查前置任务文件是否存在
2. **失败处理**：记录错误、回滚、重试（网络操作）
3. **结果合并**：验证文件、运行测试、生成报告

### 使用 Todo List 跟踪

使用 `todo_write` 工具跟踪 10 个主要任务的进度。

---

## 风险和注意事项

### 潜在风险

| 风险 | 影响 | 缓解策略 |
|------|------|----------|
| 工作量超出预期 | 时间不足 | 优先核心组件，分阶段验证 |
| 翻译键命名不一致 | 可维护性下降 | 严格命名规范，ESLint 规则 |
| 性能影响 | 包体积增加 | 按需加载，Tree-shaking |
| 测试覆盖率下降 | 遗漏测试 | 每次迁移后立即测试 |
| Locale 问题未解决 | 测试不稳定 | 完全 mock Intl API |

### 命名规范

```
格式：{feature}.{category}.{key}
示例：home.title, plan.status.completed
```

### 回滚计划

1. `git stash` 暂存更改
2. `git checkout <commit>` 恢复
3. 验证应用正常运行
4. 分析失败原因后重新迁移

---

## 验证标准

### 功能验证

- [ ] 应用正常启动
- [ ] 中英文切换正常
- [ ] 语言选择持久化
- [ ] 所有文本正确翻译
- [ ] 日期/数字格式正确

### 测试验证

- [ ] 396 个测试全部通过
- [ ] CI 环境测试通过
- [ ] 包体积增长 < 50KB
- [ ] 语言切换响应 < 100ms

### 代码质量

- [ ] `npm run typecheck` 通过
- [ ] `npm run lint` 通过
- [ ] 无硬编码中文文本

### 验证流程

```bash
npm run typecheck
npm run lint
npm run test
npm run build
npm run tauri dev  # 手动验证
```

---

## 附录

### 文件清单

**创建（25 个）**：
- 配置和工具：8 个
- 英文资源：6 个
- 中文资源：6 个
- 后端支持：1 个（修改）

**修改（12 个）**：
- 组件：5 个
- 测试：4 个
- 配置：3 个

### 常用命令

```bash
npm install i18next react-i18next i18next-browser-languageDetector
npm run test
npm run typecheck
npm run lint
npm run build
```

---

**预期成果**：
- ✅ 396 个测试全部通过
- ✅ CI 构建稳定
- ✅ 支持中英文切换
- ✅ 包体积增长 < 50KB