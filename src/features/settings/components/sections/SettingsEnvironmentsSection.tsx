import type { Dispatch, SetStateAction } from "react";
import type { WorkspaceInfo } from "../../../../types";
import { pushErrorToast } from "../../../../services/toasts";

type SettingsEnvironmentsSectionProps = {
  mainWorkspaces: WorkspaceInfo[];
  environmentWorkspace: WorkspaceInfo | null;
  environmentSaving: boolean;
  environmentError: string | null;
  environmentDraftScript: string;
  environmentSavedScript: string | null;
  environmentDirty: boolean;
  onSetEnvironmentWorkspaceId: Dispatch<SetStateAction<string | null>>;
  onSetEnvironmentDraftScript: Dispatch<SetStateAction<string>>;
  onSaveEnvironmentSetup: () => Promise<void>;
};

export function SettingsEnvironmentsSection({
  mainWorkspaces,
  environmentWorkspace,
  environmentSaving,
  environmentError,
  environmentDraftScript,
  environmentSavedScript,
  environmentDirty,
  onSetEnvironmentWorkspaceId,
  onSetEnvironmentDraftScript,
  onSaveEnvironmentSetup,
}: SettingsEnvironmentsSectionProps) {
  return (
    <section className="settings-section">
      <div className="settings-section-title">环境</div>
      <div className="settings-section-subtitle">
        为每个项目配置 worktree 创建后自动运行的初始化脚本（如安装依赖）。
      </div>
      {mainWorkspaces.length === 0 ? (
        <div className="settings-empty">暂无项目。</div>
      ) : (
        <>
          <div className="settings-field">
            <label className="settings-field-label" htmlFor="settings-environment-project">
              项目
            </label>
            <select
              id="settings-environment-project"
              className="settings-select"
              value={environmentWorkspace?.id ?? ""}
              onChange={(event) => onSetEnvironmentWorkspaceId(event.target.value)}
              disabled={environmentSaving}
            >
              {mainWorkspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
            {environmentWorkspace ? (
              <div className="settings-help">{environmentWorkspace.path}</div>
            ) : null}
          </div>

          <div className="settings-field">
            <div className="settings-field-label">初始化脚本</div>
            <div className="settings-help">
              每次新建 worktree 后，会在独立终端中执行一次。
            </div>
            {environmentError ? (
              <div className="settings-agents-error">{environmentError}</div>
            ) : null}
            <textarea
              className="settings-agents-textarea"
              value={environmentDraftScript}
              onChange={(event) => onSetEnvironmentDraftScript(event.target.value)}
              placeholder="pnpm install"
              spellCheck={false}
              disabled={environmentSaving}
            />
            <div className="settings-field-actions">
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => {
                  const clipboard = typeof navigator === "undefined" ? null : navigator.clipboard;
                  if (!clipboard?.writeText) {
                    pushErrorToast({
                      title: "复制失败",
                      message:
                        "当前环境无法访问剪贴板，请手动复制脚本。",
                    });
                    return;
                  }

                  void clipboard.writeText(environmentDraftScript).catch(() => {
                    pushErrorToast({
                      title: "复制失败",
                      message:
                        "无法写入剪贴板，请手动复制脚本。",
                    });
                  });
                }}
                disabled={environmentSaving || environmentDraftScript.length === 0}
              >
                复制
              </button>
              <button
                type="button"
                className="ghost settings-button-compact"
                onClick={() => onSetEnvironmentDraftScript(environmentSavedScript ?? "")}
                disabled={environmentSaving || !environmentDirty}
              >
                重置
              </button>
              <button
                type="button"
                className="primary settings-button-compact"
                onClick={() => {
                  void onSaveEnvironmentSetup();
                }}
                disabled={environmentSaving || !environmentDirty}
              >
                {environmentSaving ? "保存中..." : "保存"}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}
