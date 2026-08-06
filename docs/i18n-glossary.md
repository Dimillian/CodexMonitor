# i18n 中文翻译术语基准（Glossary）

> 用途：CodexMonitor i18n（issue #567）中文翻译的**术语基准**。所有 zh-CN 资源文件中的术语翻译必须与本表保持一致，避免同一概念在界面中出现多种译法。
>
> 来源：[mattpocock/dictionary-of-ai-coding](https://github.com/mattpocock/dictionary-of-ai-coding)（3.4k★，Matt Pocock 著）及社区中文翻译版。本地克隆：`E:\ai-coding-dictionary`
>
> 状态：Phase 1 基准。随 Phase 2/3 全量提取可继续扩充。

## 核心层级概念（四层框架）

| 英文 | 中文翻译 | 一句话解释 | 备注 |
|---|---|---|---|
| Model | 模型 | 参数文件，只做 next-token prediction，永远无状态 | 保留"模型"，不译"智能体" |
| Harness | 装载层 / 工具壳 | 模型外的一切：工具、系统提示、上下文管理 | Codex CLI 本身即 harness；界面中少出现 |
| Agent | 代理（智能体） | 模型 + harness 组合，用户实际对话的对象 | **统一译"代理"**，避免"智能体/代理"混用 |
| Environment | 环境 | agent 作用的世界（文件系统等） | 仅环境层永久持久化 |

## 会话与上下文

| 英文 | 中文翻译 | 备注 |
|---|---|---|
| Session | 会话 | 有界交互运行；CodexMonitor 中与 thread 区分 |
| Thread | 会话线程 | CodexMonitor UI 概念（thread = Codex app-server 的会话单元），译"会话线程"或保留"线程" |
| Turn | 回合 | 一条用户消息 + agent 全部响应 |
| Context | 上下文 | agent 当前拥有的任务相关信息 |
| Context window | 上下文窗口 | 模型每次请求看到的全部 token |
| System prompt | 系统提示 | harness 每次请求前置的常驻指令 |
| Token | 令牌 | 模型读写基本单位（≈0.75 英文单词） |
| Stateless / Stateful | 无状态 / 有状态 | 模型永远无状态，连续性靠外部注入 |

## 工具与环境

| 英文 | 中文翻译 | 备注 |
|---|---|---|
| Tool | 工具 | Read/Write/Bash/Search |
| Tool call | 工具调用 | 模型输出的结构化调用 |
| Tool result | 工具结果 | 执行后回传的内容 |
| MCP | MCP（模型上下文协议） | 保留缩写，全称译"模型上下文协议" |
| Permission request | 权限请求 | 工具调用前的人机回环 |
| Permission mode | 权限模式 | 哪种调用自动执行、哪种需询问 |
| Agent mode | 代理模式 | 权限+行为指令预设；**Codex 官方叫 approval mode** |
| Sandbox | 沙箱 | 隔离环境，限制爆炸半径 |
| Filesystem | 文件系统 | 最常见的环境形式 |
| Approval | 审批 | Codex UI 中 approval request/response 的界面用语，译"审批" |

## 模型行为与失败模式

| 英文 | 中文翻译 | 备注 |
|---|---|---|
| Effort / Reasoning effort | 推理强度 | Codex UI 有 reasoning effort 选项 |
| Hallucination | 幻觉 | 两种：factuality（事实性）/ faithfulness（忠实性） |
| Parametric knowledge | 参数化知识 | 模型训练内化的知识 |
| Knowledge cutoff | 知识截止 | 训练数据截止时间 |
| Contextual knowledge | 上下文知识 | 上下文窗口内加载的知识 |
| Attention budget / degradation | 注意力预算 / 注意力衰减 | 上下文竞争与质量下滑 |
| Smart zone / Dumb zone | 智能区间 / 愚笨区间 | 会话后期质量下滑 |
| Non-determinism | 非确定性 | 相同输入可能不同输出 |
| Sycophancy | 谄媚 | 迎合用户而非正确 |

## 交接与记忆

| 英文 | 中文翻译 | 备注 |
|---|---|---|
| Handoff | 交接 | 跨会话转移上下文，无回路 |
| Handoff artifact | 交接产物 | 写入环境的交接文件 |
| Compaction | 压缩 | 有损；摘要换上下文空间 |
| Autocompact | 自动压缩 | 接近满时自动触发 |
| Clearing | 清理 | 结束会话全新开始 |
| Memory system | 记忆系统 | 写环境+启动重载 |
| AGENTS.md | 代理指令文件 | 项目常驻简报，保留文件名 |
| Skill | 技能 | 按需加载能力单元 |
| Subagent | 子代理 | agent 派生的 agent，隔离噪音 |
| Progressive disclosure | 渐进式披露 | 只加载当下需要的上下文 |
| Context pointer | 上下文指针 | 一行指向文档的引用 |

## 工作模式

| 英文 | 中文翻译 | 备注 |
|---|---|---|
| Human-in-the-loop | 人机回环 | 人在会话中实时配对 |
| AFK | 离机工作 | 无人值守运行 |
| Vibe coding | 氛围编码 | Karpathy 2025 提出 |
| Grilling | 盘问（苏格拉底式） | 逐条反问澄清需求 |
| Spec | 规范 | 跨会话工作产物 |
| Ticket | 工单 | 单会话规模工作单元 |
| Automated check | 自动检查 | 确定性验证（测试/类型/构建） |
| Automated review | 自动审查 | LLM 审查另一 agent 工作，非确定性 |
| Human review | 人工审查 | 用户读 diff |
| Design concept | 设计概念 | 设计成形前的概念 |
| Prototyping | 原型制作 | 用产物代替问答 |
| DX / AX | 开发者体验 / 代理体验 | Agent Experience，环境对 agent 的友好度 |

## 计费相关

| 英文 | 中文翻译 | 备注 |
|---|---|---|
| Input tokens / Output tokens | 输入令牌 / 输出令牌 | 分开计费 |
| Prefix cache | 前缀缓存 | 提供商侧复用共享前缀 |
| Cache tokens | 缓存令牌 | 低价计费的缓存部分 |
| Model provider | 模型提供商 | API 服务方 |
| Model provider request | 模型提供商请求 | 一次推理调用 |

## 翻译决策记录（Important）

1. **Agent 统一译"代理"**：全项目保持，避免"智能体/代理"混用。
2. **Thread 译为"会话线程"或保留"线程"**：CodexMonitor 的 thread 是其核心 UI 概念，建议 UI 中保留"线程"+"会话"组合，需在 Phase 1 实施时定稿（见实施计划 §8）。
3. **MCP 保留英文缩写**：全称"模型上下文协议"只在说明性文本出现。
4. **英文原词 + 中文说明策略**：对术语密集的界面（如 settings 的 mode/approval 区域），采用"中文为主、必要时保留英文原词括注"策略，与词典"避免模糊词"原则一致。
5. **Rust 侧窗口标题/菜单/托盘文案不在 Phase 1 范围**：属系统级字符串，PR 描述中需声明。
