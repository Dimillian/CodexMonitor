import { useCallback, useEffect, useState } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Server from "lucide-react/dist/esm/icons/server";
import { listMcpServerStatus } from "../../../services/tauri";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import {
  PanelFrame,
  PanelHeader,
} from "../../design-system/components/panel/PanelPrimitives";

type McpServer = {
  name: string;
  status: string;
  tools?: number;
  error?: string | null;
};

type McpStatusPanelProps = {
  workspaceId?: string | null;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
};

export function McpStatusPanel({
  workspaceId,
  filePanelMode,
  onFilePanelModeChange,
}: McpStatusPanelProps) {
  const [servers, setServers] = useState<McpServer[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!workspaceId) {
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const result = await listMcpServerStatus(workspaceId);
      const raw = result?.servers ?? result?.result?.servers ?? [];
      setServers(
        (raw as any[]).map((s: any) => ({
          name: String(s.name ?? "unknown"),
          status: String(s.status ?? "unknown"),
          tools: typeof s.tools_count === "number" ? s.tools_count : undefined,
          error: s.error ? String(s.error) : null,
        })),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [workspaceId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return (
    <PanelFrame>
      <PanelHeader className="mcp-panel-header-bar">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
      </PanelHeader>
      <div className="mcp-panel-subheader">
        <Server size={14} aria-hidden />
        <span className="mcp-panel-title">MCP 服务</span>
        <button
          type="button"
          className="icon-button mcp-panel-refresh"
          onClick={() => void refresh()}
          disabled={loading}
          aria-label="刷新"
          title="刷新"
        >
          <RefreshCw size={12} className={loading ? "spin" : ""} aria-hidden />
        </button>
      </div>
      <div className="mcp-panel-body" role="list">
        {error ? (
          <div className="mcp-panel-error">{error}</div>
        ) : servers.length === 0 ? (
          <div className="mcp-panel-empty">
            {loading ? "正在加载 MCP 服务状态…" : "当前工作区暂无 MCP 服务"}
          </div>
        ) : (
          servers.map((server) => (
            <div key={server.name} className="mcp-panel-item" role="listitem">
              <div className="mcp-panel-item-header">
                <span
                  className={`mcp-panel-status-dot mcp-status-${server.status}`}
                  aria-label={server.status}
                />
                <span className="mcp-panel-item-name">{server.name}</span>
                {server.tools !== undefined ? (
                  <span className="mcp-panel-item-tools">{server.tools} 工具</span>
                ) : null}
              </div>
              {server.error ? (
                <div className="mcp-panel-item-error">{server.error}</div>
              ) : null}
            </div>
          ))
        )}
      </div>
    </PanelFrame>
  );
}
