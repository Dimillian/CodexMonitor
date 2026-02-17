# CodexMonitor 文档体系差距审计与整改方案（AI-first Canonical）

更新时间：2026-02-17  
适用范围：当前仓库主工程（排除 `第三方Repo参考/`、`node_modules/`、构建产物）

## 1. 目标定义（本仓统一口径）

本仓“完美文档系统”的判定标准如下：

1. 可执行：AI/人可直接按文档完成 setup、run、test、debug、release。
2. 可验证：CI 能验证文档命令、路径、关键契约，不允许“文档说谎”。
3. 可分层：根级全局规则 + 目录级局部规则，不用单一大文档硬覆盖全仓。
4. 防漂移：代码变更必须触发对应文档变更要求，不满足则 CI 失败。
5. 单一真相源：同类规则只能有一个 canonical 文档，其他入口仅做薄适配。

## 2. 现状结论（先给结论）

当前仓库文档系统处于“可运行但不可治理”状态。

1. 优点：运行和验证命令较完整，`AGENTS.md` 与 `README.md` 基础可用。
2. 缺陷：缺少文档门禁、缺少分层文档、缺少社区治理文件、缺少 AI 文档 canonical 层。
3. 风险：代码持续演进时，文档会不可避免地产生偏移，AI 改动一致性无法被系统保证。

## 3. 不符合愿景的问题清单（全量）

| ID | 优先级 | 问题 | 证据（当前状态） | 风险 |
| --- | --- | --- | --- | --- |
| DOC-P0-01 | P0 | 缺少文档漂移门禁（Doc Drift Gate） | `.github/workflows/ci.yml` 未对“改代码必须改文档”做检查 | 代码与文档长期失配，AI 修改不可控 |
| DOC-P0-02 | P0 | 缺少 AI 文档 canonical 层 | 仅有根级 `AGENTS.md`，无 `docs/ai/*` 统一真相源 | AGENTS/未来 CLAUDE/规则文件容易分叉 |
| DOC-P0-03 | P0 | 缺少根级 `CLAUDE.md` 薄适配层 | 主仓未发现 `CLAUDE.md` | Claude 专用上下文不可控，跨 Agent 一致性差 |
| DOC-P0-04 | P0 | 缺少分层局部文档 | `src/`、`src-tauri/`、`e2e/` 无局部 `README.md`/`AGENTS.md` | AI 在局部目录改动时上下文不够近，误改概率上升 |
| DOC-P0-05 | P0 | 主工作区处于未收敛状态 | `git status --short` 存在大量 `DU/UD` 项 | 文档对“当前可用基线”描述失真风险高 |
| DOC-P1-01 | P1 | 缺少测试文档分层 | 无 `docs/testing/*`；E2E 有脚本但缺 runbook | 测试策略与排障路径依赖口口相传 |
| DOC-P1-02 | P1 | 缺少 CI/CD 文档分层 | 无 `docs/ci-cd/*`；仅 workflow yaml | 发布与回滚知识不可检索、不可复用 |
| DOC-P1-03 | P1 | 缺少 Debug/Logging 文档 | 无 `docs/debug/*` | AI 调试路径不稳定，日志定位成本高 |
| DOC-P1-04 | P1 | 缺少 UI/UX 规范文档分层 | 无 `docs/ui-ux/*`（仅历史审计与蓝图文件） | UI 改动风格易漂移，回归标准不统一 |
| DOC-P1-05 | P1 | 缺少文档治理文件 | 未见 `CONTRIBUTING.md`、`SECURITY.md`、`SUPPORT.md`、`CODEOWNERS` | 责任边界不清，审查和升级不可制度化 |
| DOC-P2-01 | P2 | 缺少 Diátaxis 结构 | `docs/` 未按 tutorials/how-to/reference/explanation 分层 | 信息检索和写作边界混乱 |
| DOC-P2-02 | P2 | `.gitignore` 缺少配套说明文档 | `.gitignore` 有规则，但无忽略策略说明页 | 新成员/AI 不清楚“为何忽略、何时可提交” |
| DOC-P2-03 | P2 | 文档入口聚合不足 | `README.md` 未形成统一“文档导航矩阵” | 用户和 AI 找文档路径成本高 |

## 4. 整改方案（按优先级执行）

## 4.1 P0（必须先做）

1. 建立 canonical AI 文档层：`docs/ai/agent-contract.md`。  
2. 根级 `AGENTS.md`、新增 `CLAUDE.md` 仅保留：
   - 最短执行入口；
   - tool 特殊差异；
   - 指向 `docs/ai/agent-contract.md` 的链接。
3. 建立 Doc Drift Gate（CI 新增 jobs）：
   - 规则A：改 `src/**` 或 `src-tauri/**` 时，必须改动 `docs/codebase-map.md` 或对应子域文档；
   - 规则B：改 `.github/workflows/**` 时，必须改动 `docs/ci-cd/**`；
   - 规则C：改 `e2e/**` 或测试命令时，必须改动 `docs/testing/**`；
   - 规则D：改 `src/styles/**` 或 UI 组件层时，必须改动 `docs/ui-ux/**`。
4. 收敛当前工作树冲突态（先完成/回滚冲突文件），再更新文档基线声明。

## 4.2 P1（治理层补齐）

1. 建立文档目录：
   - `docs/testing/`
   - `docs/ci-cd/`
   - `docs/debug/`
   - `docs/ui-ux/`
2. 建立核心文档最小集：
   - `docs/testing/testing-strategy.md`
   - `docs/testing/e2e-smoke-runbook.md`
   - `docs/ci-cd/pipeline-reference.md`
   - `docs/ci-cd/release-runbook.md`
   - `docs/debug/logging-and-troubleshooting.md`
   - `docs/ui-ux/design-system-contract.md`
3. 建立社区与责任文件：
   - `CONTRIBUTING.md`
   - `SECURITY.md`
   - `SUPPORT.md`
   - `.github/CODEOWNERS`

## 4.3 P2（信息架构升级）

1. 将 `docs/` 渐进迁移为 Diátaxis：
   - `docs/tutorials/`
   - `docs/how-to/`
   - `docs/reference/`
   - `docs/explanation/`
2. 增加文档策略页：
   - `docs/explanation/documentation-policy.md`
   - 定义 DoD、Freshness SLO、Doc debt 处理规则、评审清单。
3. 增加忽略策略说明：
   - `docs/reference/gitignore-policy.md`。

## 5. 执行顺序（建议）

1. 第 1 天：完成 P0 文档骨架 + CI drift gate 首版。  
2. 第 2-3 天：完成 P1 文档最小集 + CODEOWNERS。  
3. 第 4-5 天：完成 P2 信息架构迁移首批目录。  
4. 第 6-7 天：清理重复内容，完成 canonical 化与链接校验。

## 6. 验收标准（DoD）

必须全部满足：

1. CI 新增 Doc Drift Gate 并在 PR 中生效。  
2. `AGENTS.md`、`CLAUDE.md`、`docs/ai/agent-contract.md` 无冲突、无重复长段。  
3. `src/`、`src-tauri/`、`e2e/` 均具备局部文档入口（`README.md` 或 `AGENTS.md`）。  
4. 新增 testing/ci-cd/debug/ui-ux 文档并可从根 `README.md` 一跳到达。  
5. 社区治理文件齐备并被根 README 导航。  
6. 文档链接检查通过，关键命令 smoke 通过。  
7. 工作树无未决冲突状态后，文档基线重新确认。

## 7. 非目标（避免范围失控）

1. 本文档不要求一次性重写所有历史文档内容。  
2. 本文档不改变现有业务功能逻辑。  
3. 本文档不引入额外文档站点框架（先完成治理，再做平台升级）。

