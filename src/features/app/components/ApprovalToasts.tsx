import { useEffect, useMemo } from "react";
import type { ApprovalRequest, WorkspaceInfo } from "../../../types";
import { getApprovalCommandInfo } from "../../../utils/approvalRules";
import {
  ToastActions,
  ToastBody,
  ToastCard,
  ToastError,
  ToastHeader,
  ToastTitle,
  ToastViewport,
} from "../../design-system/components/toast/ToastPrimitives";

type ApprovalToastsProps = {
  approvals: ApprovalRequest[];
  workspaces: WorkspaceInfo[];
  onDecision: (request: ApprovalRequest, decision: "accept" | "decline") => void;
  onRemember?: (request: ApprovalRequest, command: string[]) => void;
};

export function ApprovalToasts({
  approvals,
  workspaces,
  onDecision,
  onRemember,
}: ApprovalToastsProps) {
  const workspaceLabels = useMemo(
    () => new Map(workspaces.map((workspace) => [workspace.id, workspace.name])),
    [workspaces],
  );

  const primaryRequest = approvals[approvals.length - 1];

  useEffect(() => {
    if (!primaryRequest) {
      return;
    }

    const handler = (event: KeyboardEvent) => {
      if (event.key !== "Enter") {
        return;
      }
      const active = document.activeElement;
      if (
        active instanceof HTMLElement &&
        (active.isContentEditable ||
          active.tagName === "INPUT" ||
          active.tagName === "TEXTAREA" ||
          active.tagName === "SELECT")
      ) {
        return;
      }
      event.preventDefault();
      onDecision(primaryRequest, "accept");
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onDecision, primaryRequest]);

  if (!approvals.length) {
    return null;
  }

  const formatLabel = (value: string) =>
    value
      .replace(/([a-z])([A-Z])/g, "$1 $2")
      .replace(/_/g, " ")
      .trim();

  const methodLabel = (method: string) => {
    const trimmed = method.replace(/^codex\/requestApproval\/?/, "");
    return trimmed || method;
  };

  const renderParamValue = (value: unknown) => {
    if (value === null || value === undefined) {
      return { text: "无", isCode: false };
    }
    if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
      return { text: String(value), isCode: false };
    }
    if (Array.isArray(value)) {
      if (value.every((entry) => ["string", "number", "boolean"].includes(typeof entry))) {
        return { text: value.map(String).join(", "), isCode: false };
      }
      return { text: JSON.stringify(value, null, 2), isCode: true };
    }
    return { text: JSON.stringify(value, null, 2), isCode: true };
  };

  return (
    <ToastViewport className="approval-toasts" role="region" ariaLive="assertive">
      {approvals.map((request) => {
        const workspaceName = workspaceLabels.get(request.workspace_id);
        const params = request.params ?? {};
        const commandInfo = getApprovalCommandInfo(params);
        const entries = Object.entries(params);
        return (
          <ToastCard
            key={`${request.workspace_id}-${request.request_id}`}
            className="approval-toast"
            role="alert"
          >
            <ToastHeader className="approval-toast-header">
              <ToastTitle className="approval-toast-title">需要批准</ToastTitle>
              {workspaceName ? (
                <div className="approval-toast-workspace">{workspaceName}</div>
              ) : null}
            </ToastHeader>
            <div className="approval-toast-method">{methodLabel(request.method)}</div>
            <div className="approval-toast-details">
              {entries.length ? (
                entries.map(([key, value]) => {
                  const rendered = renderParamValue(value);
                  return (
                    <div key={key} className="approval-toast-detail">
                      <div className="approval-toast-detail-label">
                        {formatLabel(key)}
                      </div>
                      {rendered.isCode ? (
                        <ToastError className="approval-toast-detail-code">
                          {rendered.text}
                        </ToastError>
                      ) : (
                        <ToastBody className="approval-toast-detail-value">
                          {rendered.text}
                        </ToastBody>
                      )}
                    </div>
                  );
                })
              ) : (
                <div className="approval-toast-detail approval-toast-detail-empty">
                  没有其他详情。
                </div>
              )}
            </div>
            <ToastActions className="approval-toast-actions">
              <button
                className="secondary"
                onClick={() => onDecision(request, "decline")}
              >
                拒绝
              </button>
              {commandInfo && onRemember ? (
                <button
                  className="ghost approval-toast-remember"
                  onClick={() => onRemember(request, commandInfo.tokens)}
                  title={`允许以 ${commandInfo.preview} 开头的命令`}
                >
                  始终允许
                </button>
              ) : null}
              <button
                className="primary"
                onClick={() => onDecision(request, "accept")}
              >
                批准（Enter）
              </button>
            </ToastActions>
          </ToastCard>
        );
      })}
    </ToastViewport>
  );
}
