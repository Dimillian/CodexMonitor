import type { AppSettings } from "../../../../types";
import { fileManagerName, openInFileManagerLabel } from "../../../../utils/platformPaths";

<<<<<<< HEAD
const AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MIN = 5;
const AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MAX = 240;

function clampAutoArchiveSubAgentThreadsMinutes(value: number): number {
  if (!Number.isFinite(value)) {
    return AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MIN;
  }
  return Math.min(
    AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MAX,
    Math.max(
      AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MIN,
      Math.round(value),
    ),
  );
}

type SettingsFeaturesSectionProps = {
  appSettings: AppSettings;
  hasCodexHomeOverrides: boolean;
  openConfigError: string | null;
  onOpenConfig: () => void;
  onUpdateAppSettings: (next: AppSettings) => Promise<void>;
=======
const FEATURE_DESCRIPTION_FALLBACKS: Record<string, string> = {
  undo: "Create a ghost commit at each turn.",
  shell_tool: "Enable the default shell tool.",
  unified_exec: "Use the single unified PTY-backed exec tool.",
  shell_snapshot: "Enable shell snapshotting.",
  js_repl: "Enable JavaScript REPL tools backed by a persistent Node kernel.",
  js_repl_tools_only: "Only expose js_repl tools directly to the model.",
  web_search_request: "Deprecated. Use top-level web_search instead.",
  web_search_cached: "Deprecated. Use top-level web_search instead.",
  search_tool: "Removed legacy search flag kept for backward compatibility.",
  runtime_metrics: "Enable runtime metrics snapshots via a manual reader.",
  sqlite: "Persist rollout metadata to a local SQLite database.",
  memory_tool: "Enable startup memory extraction and memory consolidation.",
  child_agents_md: "Append additional AGENTS.md guidance to user instructions.",
  apply_patch_freeform: "Include the freeform apply_patch tool.",
  use_linux_sandbox_bwrap: "Use the bubblewrap-based Linux sandbox pipeline.",
  request_rule: "Allow approval requests and exec rule proposals.",
  experimental_windows_sandbox:
    "Removed Windows sandbox flag kept for backward compatibility.",
  elevated_windows_sandbox:
    "Removed elevated Windows sandbox flag kept for backward compatibility.",
  remote_models: "Refresh remote models before AppReady.",
  powershell_utf8: "Enforce UTF-8 output in PowerShell.",
  enable_request_compression:
    "Compress streaming request bodies sent to codex-backend.",
  collab: "Enable sub-agent collaboration tools.",
  apps: "Enable ChatGPT Apps integration.",
  apps_mcp_gateway: "Route Apps MCP calls through the configured gateway.",
  skill_mcp_dependency_install:
    "Allow prompting and installing missing MCP dependencies.",
  skill_env_var_dependency_prompt:
    "Prompt for missing skill environment variable dependencies.",
  steer: "Enter submits immediately instead of queueing.",
  collaboration_modes: "Enable collaboration mode presets.",
  personality: "Enable personality selection.",
  responses_websockets:
    "Use Responses API WebSocket transport for OpenAI by default.",
  responses_websockets_v2: "Enable Responses API WebSocket v2 mode.",
>>>>>>> origin/main
};

export function SettingsFeaturesSection({
  appSettings,
  hasCodexHomeOverrides,
  openConfigError,
  onOpenConfig,
  onUpdateAppSettings,
}: SettingsFeaturesSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">功能</div>
      <div className="settings-section-subtitle">
        开关 Codex 的稳定功能和实验性功能。
      </div>
      {hasCodexHomeOverrides && (
        <div className="settings-help">
          以下设置会写入默认 CODEX_HOME 下的 config.toml，不影响工作区级别的覆盖配置。
        </div>
      )}
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">配置文件</div>
          <div className="settings-toggle-subtitle">
            在 {fileManagerName()} 中打开 Codex 配置。
          </div>
        </div>
        <button type="button" className="ghost" onClick={onOpenConfig}>
          {openInFileManagerLabel()}
        </button>
      </div>
      {openConfigError && <div className="settings-help">{openConfigError}</div>}
      <div className="settings-subsection-title">稳定功能</div>
      <div className="settings-subsection-subtitle">
        已稳定、可放心使用的功能。
      </div>
      <div className="settings-toggle-row">
        <div>
<<<<<<< HEAD
          <div className="settings-toggle-title">协作模式</div>
          <div className="settings-toggle-subtitle">
            启用 Code（编码）和 Plan（规划）两种协作模式预设。
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.collaborationModesEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              collaborationModesEnabled: !appSettings.collaborationModesEnabled,
            })
          }
          aria-pressed={appSettings.collaborationModesEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">回复风格</div>
=======
          <div className="settings-toggle-title">Personality</div>
>>>>>>> origin/main
          <div className="settings-toggle-subtitle">
            设置 Codex Agent 的沟通语气。
          </div>
        </div>
        <select
          id="features-personality-select"
          className="settings-select"
          value={appSettings.personality}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              personality: event.target.value as AppSettings["personality"],
            })
          }
          aria-label="回复风格"
        >
          <option value="friendly">友好 — 语气温和，解释详细</option>
          <option value="pragmatic">务实 — 简洁直接，专注结果</option>
        </select>
      </div>
      <div className="settings-toggle-row">
        <div>
<<<<<<< HEAD
          <div className="settings-toggle-title">即时发送（Steer）</div>
          <div className="settings-toggle-subtitle">
            消息输入即发送，无需等待当前任务完成。运行中可按 Tab 排队追加指令。
=======
          <div className="settings-toggle-title">
            Pause queued messages when a response is required
          </div>
          <div className="settings-toggle-subtitle">
            Keep queued messages paused while Codex is waiting for plan accept/changes
            or your answers.
>>>>>>> origin/main
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.steerEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              steerEnabled: !appSettings.steerEnabled,
            })
          }
          aria-pressed={appSettings.steerEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
<<<<<<< HEAD
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">后台终端</div>
          <div className="settings-toggle-subtitle">
            允许 Codex 将耗时较长的终端命令（如编译、测试）放到后台执行，不阻塞对话。
=======
      {stableFeatures.map((feature) => (
        <div className="settings-toggle-row" key={feature.name}>
          <div>
            <div className="settings-toggle-title">{formatFeatureLabel(feature)}</div>
            <div className="settings-toggle-subtitle">{featureSubtitle(feature)}</div>
>>>>>>> origin/main
          </div>
        </div>
<<<<<<< HEAD
        <button
          type="button"
          className={`settings-toggle ${appSettings.unifiedExecEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              unifiedExecEnabled: !appSettings.unifiedExecEnabled,
            })
          }
          aria-pressed={appSettings.unifiedExecEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">自动归档子代理线程</div>
          <div className="settings-toggle-subtitle">
            自动归档创建时间超过阈值且处于不活跃状态的子代理线程。
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.autoArchiveSubAgentThreadsEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              autoArchiveSubAgentThreadsEnabled:
                !appSettings.autoArchiveSubAgentThreadsEnabled,
            })
          }
          aria-pressed={appSettings.autoArchiveSubAgentThreadsEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">自动归档阈值（分钟）</div>
          <div className="settings-toggle-subtitle">
            支持 5–240 分钟。超过该时长且不活跃时，线程会被自动归档。
          </div>
        </div>
        <input
          type="number"
          className="settings-input settings-input--compact"
          min={AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MIN}
          max={AUTO_ARCHIVE_SUB_AGENT_THREADS_MINUTES_MAX}
          step={5}
          value={appSettings.autoArchiveSubAgentThreadsMaxAgeMinutes}
          onChange={(event) =>
            void onUpdateAppSettings({
              ...appSettings,
              autoArchiveSubAgentThreadsMaxAgeMinutes:
                clampAutoArchiveSubAgentThreadsMinutes(
                  Number(event.target.value),
                ),
            })
          }
          disabled={!appSettings.autoArchiveSubAgentThreadsEnabled}
          aria-label="自动归档分钟数"
        />
      </div>
      <div className="settings-subsection-title">实验功能</div>
      <div className="settings-subsection-subtitle">
        尚在测试中的功能，后续版本可能变更或移除。
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">多 Agent 协作</div>
          <div className="settings-toggle-subtitle">
            允许 Codex 调用多个 Agent 并行处理子任务，适用于大型重构等复杂场景。
=======
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        stableFeatures.length === 0 && (
        <div className="settings-help">No stable feature flags returned by Codex.</div>
      )}
      <div className="settings-subsection-title">Experimental Features</div>
      <div className="settings-subsection-subtitle">
        Preview and under-development features.
      </div>
      {experimentalFeatures.map((feature) => (
        <div className="settings-toggle-row" key={feature.name}>
          <div>
            <div className="settings-toggle-title">{formatFeatureLabel(feature)}</div>
            <div className="settings-toggle-subtitle">{featureSubtitle(feature)}</div>
>>>>>>> origin/main
          </div>
        </div>
<<<<<<< HEAD
        <button
          type="button"
          className={`settings-toggle ${appSettings.experimentalCollabEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              experimentalCollabEnabled: !appSettings.experimentalCollabEnabled,
            })
          }
          aria-pressed={appSettings.experimentalCollabEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
      <div className="settings-toggle-row">
        <div>
          <div className="settings-toggle-title">应用连接器</div>
          <div className="settings-toggle-subtitle">
            启用 ChatGPT 应用/连接器，可通过 <code>/apps</code> 命令调用外部服务。
=======
      ))}
      {hasFeatureWorkspace &&
        !featuresLoading &&
        !featureError &&
        hasDynamicFeatureRows &&
        experimentalFeatures.length === 0 && (
          <div className="settings-help">
            No preview or under-development feature flags returned by Codex.
>>>>>>> origin/main
          </div>
        </div>
        <button
          type="button"
          className={`settings-toggle ${appSettings.experimentalAppsEnabled ? "on" : ""}`}
          onClick={() =>
            void onUpdateAppSettings({
              ...appSettings,
              experimentalAppsEnabled: !appSettings.experimentalAppsEnabled,
            })
          }
          aria-pressed={appSettings.experimentalAppsEnabled}
        >
          <span className="settings-toggle-knob" />
        </button>
      </div>
    </section>
  );
}
