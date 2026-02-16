import { useEffect, useState, type CSSProperties } from "react";
import { BrainCog } from "lucide-react";
import type { ThreadTokenUsage } from "../../../types";

/** Format a token count into a short human-readable string (e.g. 1234 → "1.2k") */
function fmtTokens(n: number): string {
  if (n <= 0) return "0";
  if (n < 1_000) return String(n);
  if (n < 1_000_000) {
    const k = n / 1_000;
    return k < 10 ? `${k.toFixed(1)}k` : `${Math.round(k)}k`;
  }
  const m = n / 1_000_000;
  return m < 10 ? `${m.toFixed(1)}m` : `${Math.round(m)}m`;
}

/** Get model provider indicator for display */
function getModelProviderInfo(modelId: string): { label: string } {
  const id = modelId.toLowerCase();
  if (id.includes("codex") || id.includes("gpt-5")) {
    return { label: "Codex" };
  }
  if (id.includes("claude")) {
    return { label: "Claude" };
  }
  if (id.includes("gemini") && !id.includes("claude")) {
    return { label: "Gemini" };
  }
  return { label: "Other" };
}

type ComposerMetaBarProps = {
  disabled: boolean;
  collaborationModes: { id: string; label: string }[];
  selectedCollaborationModeId: string | null;
  onSelectCollaborationMode: (id: string | null) => void;
  models: { id: string; displayName: string; model: string; contextWindow?: number | null }[];
  selectedModelId: string | null;
  onSelectModel: (id: string) => void;
  reasoningOptions: string[];
  selectedEffort: string | null;
  onSelectEffort: (effort: string) => void;
  reasoningSupported: boolean;
  contextUsage?: ThreadTokenUsage | null;
  messageFontSize?: number;
  onMessageFontSizeChange?: (next: number) => void;
  continueModeEnabled?: boolean;
  onContinueModeEnabledChange?: (next: boolean) => void;
  continuePrompt?: string;
  onContinuePromptChange?: (next: string) => void;
};

export function ComposerMetaBar({
  disabled,
  collaborationModes,
  selectedCollaborationModeId,
  onSelectCollaborationMode,
  models,
  selectedModelId,
  onSelectModel,
  reasoningOptions,
  selectedEffort,
  onSelectEffort,
  reasoningSupported,
  contextUsage = null,
  messageFontSize = 13,
  onMessageFontSizeChange,
  continueModeEnabled = false,
  onContinueModeEnabledChange,
  continuePrompt = "",
  onContinuePromptChange,
}: ComposerMetaBarProps) {
  // Get selected model for fallback context window
  const selectedModel = models.find((m) => m.id === selectedModelId) ?? null;
  // Use server-provided context window, fallback to model's default
  const contextWindow = contextUsage?.modelContextWindow ?? selectedModel?.contextWindow ?? null;
  const lastTurn = contextUsage?.last ?? null;
  const totalUsage = contextUsage?.total ?? null;
  const lastTokens = lastTurn?.totalTokens ?? 0;
  const totalTokens = totalUsage?.totalTokens ?? 0;
  // "usedTokens" reflects how much of the context window is occupied:
  // prefer last-turn snapshot; fall back to cumulative total.
  const usedTokens = lastTokens > 0 ? lastTokens : totalTokens;
  const usedPercent =
    contextWindow && contextWindow > 0 && usedTokens > 0
      ? Math.min(Math.max((usedTokens / contextWindow) * 100, 0), 100)
      : null;

  // Per-turn breakdown for the tooltip / detail panel
  const lastInputTokens = lastTurn?.inputTokens ?? 0;
  const lastCachedTokens = lastTurn?.cachedInputTokens ?? 0;
  const lastOutputTokens = lastTurn?.outputTokens ?? 0;
  const lastReasoningTokens = lastTurn?.reasoningOutputTokens ?? 0;
  const cacheHitPercent =
    lastInputTokens > 0
      ? Math.round((lastCachedTokens / lastInputTokens) * 100)
      : null;

  const planMode =
    collaborationModes.find((mode) => mode.id === "plan") ?? null;
  const defaultMode =
    collaborationModes.find((mode) => mode.id === "default") ?? null;
  const canUsePlanToggle =
    Boolean(planMode) &&
    collaborationModes.every(
      (mode) => mode.id === "default" || mode.id === "plan",
    );
  const planSelected = selectedCollaborationModeId === (planMode?.id ?? "");
  const [advancedOpen, setAdvancedOpen] = useState(
    continueModeEnabled || continuePrompt.trim().length > 0,
  );

  useEffect(() => {
    if (continueModeEnabled || continuePrompt.trim().length > 0) {
      setAdvancedOpen(true);
    }
  }, [continueModeEnabled, continuePrompt]);

  return (
    <div className="composer-bar">
      <div className="composer-meta">
        {collaborationModes.length > 0 && (
          canUsePlanToggle ? (
            <div className="composer-select-wrap composer-plan-toggle-wrap">
              <label className="composer-plan-toggle" aria-label="方案模式">
                <input
                  className="composer-plan-toggle-input"
                  type="checkbox"
                  checked={planSelected}
                  disabled={disabled}
                  onChange={(event) =>
                    onSelectCollaborationMode(
                      event.target.checked
                        ? planMode?.id ?? "plan"
                        : (defaultMode?.id ?? null),
                    )
                  }
                />
                <span className="composer-plan-toggle-icon" aria-hidden>
                  <svg viewBox="0 0 24 24" fill="none">
                    <path
                      d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                      stroke="currentColor"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <span className="composer-plan-toggle-label">
                  {planMode?.label || "Plan"}
                </span>
              </label>
            </div>
          ) : (
            <div className="composer-select-wrap">
            <span className="composer-icon" aria-hidden>
              <svg viewBox="0 0 24 24" fill="none">
                <path
                  d="m6.5 7.5 1 1 2-2M6.5 12.5l1 1 2-2M6.5 17.5l1 1 2-2M11 7.5h7M11 12.5h7M11 17.5h7"
                  stroke="currentColor"
                  strokeWidth="1.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
              <select
                className="composer-select composer-select--model composer-select--collab"
                aria-label="协作模式"
                value={selectedCollaborationModeId ?? ""}
                onChange={(event) =>
                  onSelectCollaborationMode(event.target.value || null)
                }
                disabled={disabled}
              >
                {collaborationModes.map((mode) => (
                  <option key={mode.id} value={mode.id}>
                    {mode.label || mode.id}
                  </option>
                ))}
              </select>
            </div>
          )
        )}
        <div className="composer-select-wrap composer-select-wrap--model">
          <span className="composer-icon composer-icon--model" aria-hidden>
            <svg viewBox="0 0 24 24" fill="none">
              <path
                d="M12 4v2"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M8 7.5h8a2.5 2.5 0 0 1 2.5 2.5v5a2.5 2.5 0 0 1-2.5 2.5H8A2.5 2.5 0 0 1 5.5 15v-5A2.5 2.5 0 0 1 8 7.5Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
              <circle cx="9.5" cy="12.5" r="1" fill="currentColor" />
              <circle cx="14.5" cy="12.5" r="1" fill="currentColor" />
              <path
                d="M9.5 15.5h5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
              <path
                d="M5.5 11H4M20 11h-1.5"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinecap="round"
              />
            </svg>
          </span>
          <select
            className="composer-select composer-select--model"
            aria-label="模型"
            value={selectedModelId ?? ""}
            onChange={(event) => onSelectModel(event.target.value)}
            disabled={disabled}
          >
            {models.length === 0 && <option value="">无模型</option>}
            {models.map((model) => {
              const providerInfo = getModelProviderInfo(model.id);
                return (
                  <option key={model.id} value={model.id}>
                    [{providerInfo.label}] {model.displayName || model.model}
                  </option>
                );
              })}
          </select>
        </div>
        <div className="composer-select-wrap composer-select-wrap--effort">
          <span className="composer-icon composer-icon--effort" aria-hidden>
            <BrainCog size={14} strokeWidth={1.8} />
          </span>
          <select
            className="composer-select composer-select--effort"
            aria-label="思考模式"
            value={selectedEffort ?? ""}
            onChange={(event) => onSelectEffort(event.target.value)}
            disabled={disabled || !reasoningSupported}
          >
            {reasoningOptions.length === 0 && <option value="">Default</option>}
            {reasoningOptions.map((effort) => (
              <option key={effort} value={effort}>
                {effort}
              </option>
            ))}
          </select>
        </div>
        {/* Access mode removed — always uses config.toml setting */}
      </div>
      <div
        className="composer-context-meter composer-context-meter-primary"
        title={
          lastTokens > 0
            ? [
                `上下文窗口：${contextWindow ? fmtTokens(contextWindow) : "未知"}`,
                `本轮输入：${fmtTokens(lastInputTokens)}`,
                lastCachedTokens > 0 ? `  缓存命中：${cacheHitPercent}%` : null,
                `本轮输出：${fmtTokens(lastOutputTokens)}`,
                lastReasoningTokens > 0 ? `  推理：${fmtTokens(lastReasoningTokens)}` : null,
              ].filter(Boolean).join("\n")
            : undefined
        }
      >
        {usedPercent !== null && contextWindow ? (
          <>
            <div
              className="context-meter-bar"
              role="progressbar"
              aria-valuenow={Math.round(usedPercent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`上下文已用 ${Math.round(usedPercent)}%`}
            >
              <div
                className={`context-meter-fill${
                  usedPercent > 85
                    ? " context-meter-fill--danger"
                    : usedPercent > 65
                      ? " context-meter-fill--warn"
                      : ""
                }`}
                style={{ width: `${usedPercent}%` } as CSSProperties}
              />
            </div>
            <span className="context-meter-label">
              上下文已用 {fmtTokens(usedTokens)} / {fmtTokens(contextWindow)}
            </span>
            {cacheHitPercent !== null && cacheHitPercent > 0 && (
              <span className="context-meter-cache-badge">
                缓存 {cacheHitPercent}%
              </span>
            )}
          </>
        ) : (
          <span className="context-meter-label context-meter-label--empty">
            上下文用量 --
          </span>
        )}
      </div>
      <div className="composer-font-size-control">
        <label className="composer-font-size-label" htmlFor="composer-message-font-size">
          消息字号
        </label>
        <div className="composer-font-size-row">
          <input
            id="composer-message-font-size"
            className="composer-font-size-slider"
            type="range"
            min={11}
            max={16}
            step={1}
            value={messageFontSize}
            onChange={(event) => onMessageFontSizeChange?.(Number(event.target.value))}
            aria-label="消息字号"
            disabled={disabled}
          />
          <span className="composer-font-size-value">{messageFontSize}px</span>
        </div>
      </div>
      <button
        type="button"
        className={`ghost composer-advanced-toggle${advancedOpen ? " is-open" : ""}`}
        onClick={() => setAdvancedOpen((prev) => !prev)}
        aria-expanded={advancedOpen}
        aria-label="显示高级设置"
      >
        {advancedOpen ? "收起高级" : "高级"}
      </button>
      {advancedOpen && (
        <div className="composer-advanced-controls">
          <div className="composer-continue-control">
            <label className="composer-continue-toggle" htmlFor="composer-continue-mode">
              <input
                id="composer-continue-mode"
                className="composer-continue-toggle-input"
                type="checkbox"
                checked={continueModeEnabled}
                onChange={(event) => onContinueModeEnabledChange?.(event.target.checked)}
                aria-label="Continue 模式"
                disabled={disabled}
              />
              <span className="composer-continue-toggle-label">Continue</span>
            </label>
            <input
              className="composer-continue-input"
              type="text"
              value={continuePrompt}
              onChange={(event) => onContinuePromptChange?.(event.target.value)}
              placeholder="例如：继续执行上一步计划，并总结本次修改"
              aria-label="Continue 提示词"
              disabled={disabled || !continueModeEnabled}
            />
          </div>
        </div>
      )}
    </div>
  );
}
