import { useCallback, useMemo, useState } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueueHealthEntry, QueuedMessage } from "../../../types";

type ComposerQueueProps = {
  queuedMessages: QueuedMessage[];
  queueHealthEntries?: QueueHealthEntry[];
  legacyQueueMessageCount?: number;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
  onSteerQueued?: (id: string) => Promise<boolean> | boolean;
  onRetryQueuedThread?: (threadId: string) => void;
  onMigrateLegacyQueue?: () => void;
  canSteerQueued?: boolean;
};

function getBlockedReasonLabel(reason: QueueHealthEntry["blockedReason"]): string {
  if (reason === "processing") {
    return "线程处理中";
  }
  if (reason === "reviewing") {
    return "Review 中";
  }
  if (reason === "workspace_unresolved") {
    return "Workspace 未就绪";
  }
  if (reason === "command_requires_active_thread") {
    return "命令需在当前线程执行";
  }
  if (reason === "awaiting_turn_start_event") {
    return "等待 turn/start";
  }
  if (reason === "global_processing") {
    return "等待其他线程完成";
  }
  return "正常";
}

function getBlockedReasonTone(
  reason: QueueHealthEntry["blockedReason"],
  isStale: boolean,
): string {
  if (isStale) {
    return "is-stale";
  }
  if (reason === "processing" || reason === "global_processing") {
    return "is-processing";
  }
  if (reason === "reviewing") {
    return "is-reviewing";
  }
  if (reason === "workspace_unresolved" || reason === "command_requires_active_thread") {
    return "is-danger";
  }
  if (reason === "awaiting_turn_start_event") {
    return "is-awaiting";
  }
  return "is-normal";
}

function queuePreviewText(item: QueuedMessage): string {
  if (item.text.trim().length > 0) {
    return item.text;
  }
  if (item.images?.length) {
    return item.images.length === 1 ? "图片" : `图片 ${item.images.length} 张`;
  }
  return "空消息";
}

export function ComposerQueue({
  queuedMessages,
  queueHealthEntries = [],
  legacyQueueMessageCount = 0,
  onEditQueued,
  onDeleteQueued,
  onSteerQueued,
  onRetryQueuedThread,
  onMigrateLegacyQueue,
  canSteerQueued = false,
}: ComposerQueueProps) {
  const [isQueueCollapsed, setIsQueueCollapsed] = useState(false);
  const [steeringById, setSteeringById] = useState<Record<string, boolean>>({});

  const handleQueueMenu = useCallback(
    async (event: React.MouseEvent, item: QueuedMessage) => {
      if (!onEditQueued) {
        return;
      }
      event.preventDefault();
      event.stopPropagation();
      const { clientX, clientY } = event;
      const editItem = await MenuItem.new({
        text: "编辑",
        action: () => onEditQueued(item),
      });
      const menu = await Menu.new({ items: [editItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(clientX, clientY);
      await menu.popup(position, window);
    },
    [onEditQueued],
  );

  const blockedQueueHealthEntries = useMemo(
    () => queueHealthEntries.filter((entry) => entry.blockedReason !== null),
    [queueHealthEntries],
  );

  const primaryEntry = queueHealthEntries[0] ?? null;
  const statusLabel = primaryEntry
    ? getBlockedReasonLabel(primaryEntry.blockedReason)
    : "正常";

  const handleRecoverBlocked = useCallback(() => {
    if (!onRetryQueuedThread || blockedQueueHealthEntries.length === 0) {
      return;
    }

    const blockedThreadIds = Array.from(
      new Set(blockedQueueHealthEntries.map((entry) => entry.threadId)),
    );

    blockedThreadIds.forEach((threadId) => {
      onRetryQueuedThread(threadId);
    });
  }, [blockedQueueHealthEntries, onRetryQueuedThread]);

  const handleSteerItem = useCallback(
    async (item: QueuedMessage) => {
      if (!onSteerQueued) {
        return;
      }
      setSteeringById((prev) => ({ ...prev, [item.id]: true }));
      try {
        await Promise.resolve(onSteerQueued(item.id));
      } finally {
        setSteeringById((prev) => {
          const { [item.id]: _removed, ...rest } = prev;
          return rest;
        });
      }
    },
    [onSteerQueued],
  );

  if (queuedMessages.length === 0 && legacyQueueMessageCount === 0) {
    return null;
  }

  return (
    <div className="composer-queue">
      <div className="composer-queue-header">
        <div className="composer-queue-title">队列</div>
        <div className="composer-queue-header-actions">
          {onMigrateLegacyQueue && legacyQueueMessageCount > 0 ? (
            <button
              type="button"
              className="composer-queue-migrate"
              onClick={() => onMigrateLegacyQueue()}
              aria-label="一键迁移旧队列"
            >
              迁移旧队列 ({legacyQueueMessageCount})
            </button>
          ) : null}
          <button
            type="button"
            className="composer-queue-toggle"
            aria-label={isQueueCollapsed ? "展开队列" : "收起队列"}
            onClick={() => setIsQueueCollapsed((prev) => !prev)}
          >
            {isQueueCollapsed ? "展开" : "收起"}
          </button>
        </div>
      </div>

      {isQueueCollapsed ? (
        <div className="composer-queue-collapsed-meta">
          已收起 · 待发送: {queuedMessages.length}
        </div>
      ) : (
        <>
          <div className="composer-queue-summary" role="status" aria-live="polite">
            <div className="composer-queue-summary-left">
              <span className="composer-queue-count">待发送: {queuedMessages.length}</span>
              <span
                className={`composer-queue-status ${getBlockedReasonTone(primaryEntry?.blockedReason ?? null, Boolean(primaryEntry?.isStale))}`}
              >
                {statusLabel}
              </span>
            </div>
            {onRetryQueuedThread && blockedQueueHealthEntries.length > 0 ? (
              <button
                type="button"
                className="composer-queue-recover"
                aria-label="恢复阻塞"
                onClick={handleRecoverBlocked}
              >
                恢复阻塞
              </button>
            ) : null}
          </div>

          {queuedMessages.length > 0 ? (
            <div className="composer-queue-list">
              {queuedMessages.map((item) => (
                <div key={item.id} className="composer-queue-item">
                  <span className="composer-queue-item-main">
                    <span className="composer-queue-item-icon" aria-hidden>
                      ↳
                    </span>
                    <span className="composer-queue-text" title={queuePreviewText(item)}>
                      {queuePreviewText(item)}
                    </span>
                  </span>

                  <div className="composer-queue-actions">
                    <button
                      type="button"
                      className="composer-queue-steer"
                      onClick={() => {
                        void handleSteerItem(item);
                      }}
                      disabled={
                        !onSteerQueued
                        || !canSteerQueued
                        || Boolean(steeringById[item.id])
                      }
                      aria-label="Steer"
                    >
                      Steer
                    </button>
                    <button
                      type="button"
                      className="composer-queue-delete"
                      onClick={() => onDeleteQueued?.(item.id)}
                      aria-label="删除队列项"
                    >
                      🗑
                    </button>
                    <button
                      className="composer-queue-menu"
                      onClick={(event) => {
                        void handleQueueMenu(event, item);
                      }}
                      aria-label="队列项菜单"
                      disabled={!onEditQueued}
                    >
                      …
                    </button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="composer-queue-empty">当前队列为空</div>
          )}
        </>
      )}
    </div>
  );
}
