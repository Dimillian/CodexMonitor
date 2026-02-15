import { useEffect, useMemo, useState } from "react";
import { convertFileSrc } from "@tauri-apps/api/core";
import type { WorkspaceInfo } from "../../../types";
import type {
  WorkspaceHomeRun,
  WorkspaceHomeRunInstance,
} from "../hooks/useWorkspaceHome";
import { FileEditorCard } from "../../shared/components/FileEditorCard";
import { WorkspaceHomeHistory } from "./WorkspaceHomeHistory";
import { buildIconPath } from "./workspaceHomeHelpers";

type ThreadStatus = {
  isProcessing: boolean;
  isReviewing: boolean;
};

type WorkspaceHomeProps = {
  workspace: WorkspaceInfo;
  runs: WorkspaceHomeRun[];
  recentThreadInstances: WorkspaceHomeRunInstance[];
  recentThreadsUpdatedAt: number | null;
  activeWorkspaceId: string | null;
  activeThreadId: string | null;
  threadStatusById: Record<string, ThreadStatus>;
  onSelectInstance: (workspaceId: string, threadId: string) => void;
  agentMdContent: string;
  agentMdExists: boolean;
  agentMdTruncated: boolean;
  agentMdLoading: boolean;
  agentMdSaving: boolean;
  agentMdError: string | null;
  agentMdDirty: boolean;
  onAgentMdChange: (value: string) => void;
  onAgentMdRefresh: () => void;
  onAgentMdSave: () => void;
};

export function WorkspaceHome({
  workspace,
  runs,
  recentThreadInstances,
  recentThreadsUpdatedAt,
  activeWorkspaceId,
  activeThreadId,
  threadStatusById,
  onSelectInstance,
  agentMdContent,
  agentMdExists,
  agentMdTruncated,
  agentMdLoading,
  agentMdSaving,
  agentMdError,
  agentMdDirty,
  onAgentMdChange,
  onAgentMdRefresh,
  onAgentMdSave,
}: WorkspaceHomeProps) {
  const [showIcon, setShowIcon] = useState(true);
  const iconPath = useMemo(() => buildIconPath(workspace.path), [workspace.path]);
  const iconSrc = useMemo(() => convertFileSrc(iconPath), [iconPath]);

  useEffect(() => {
    setShowIcon(true);
  }, [workspace.id]);

  const agentMdStatus = agentMdLoading
    ? "加载中…"
    : agentMdSaving
      ? "保存中…"
      : agentMdExists
        ? ""
        : "未找到";
  const agentMdMetaParts: string[] = [];
  if (agentMdStatus) {
    agentMdMetaParts.push(agentMdStatus);
  }
  if (agentMdTruncated) {
    agentMdMetaParts.push("已截断");
  }
  const agentMdMeta = agentMdMetaParts.join(" · ");
  const agentMdSaveLabel = agentMdExists ? "保存" : "创建";
  const agentMdSaveDisabled = agentMdLoading || agentMdSaving || !agentMdDirty;
  const agentMdRefreshDisabled = agentMdLoading || agentMdSaving;

  return (
    <div className="workspace-home">
      <div className="workspace-home-hero">
        {showIcon && (
          <img
            className="workspace-home-icon"
            src={iconSrc}
            srcSet={`${iconSrc} 1x, ${iconSrc} 2x`}
            alt=""
            width={40}
            height={40}
            sizes="40px"
            loading="lazy"
            decoding="async"
            onError={() => setShowIcon(false)}
          />
        )}
        <div>
          <div className="workspace-home-title">{workspace.name}</div>
          <div className="workspace-home-path" title={workspace.path}>
            {workspace.path}
          </div>
        </div>
      </div>

      <div className="workspace-home-agent">
        {agentMdTruncated && (
          <div className="workspace-home-agent-warning">
            文件过大，仅显示前半部分。
          </div>
        )}
        <FileEditorCard
          title="AGENTS.md"
          meta={agentMdMeta}
          error={agentMdError}
          value={agentMdContent}
          placeholder="为 Agent 添加工作区指令…"
          disabled={agentMdLoading}
          refreshDisabled={agentMdRefreshDisabled}
          saveDisabled={agentMdSaveDisabled}
          saveLabel={agentMdSaveLabel}
          onChange={onAgentMdChange}
          onRefresh={onAgentMdRefresh}
          onSave={onAgentMdSave}
          classNames={{
            container: "workspace-home-agent-card",
            header: "workspace-home-section-header",
            title: "workspace-home-section-title",
            actions: "workspace-home-section-actions",
            meta: "workspace-home-section-meta",
            iconButton: "ghost workspace-home-icon-button",
            error: "workspace-home-error",
            textarea: "workspace-home-agent-textarea",
            help: "workspace-home-section-meta",
          }}
        />
      </div>

      <WorkspaceHomeHistory
        runs={runs}
        recentThreadInstances={recentThreadInstances}
        recentThreadsUpdatedAt={recentThreadsUpdatedAt}
        activeWorkspaceId={activeWorkspaceId}
        activeThreadId={activeThreadId}
        threadStatusById={threadStatusById}
        onSelectInstance={onSelectInstance}
      />
    </div>
  );
}
