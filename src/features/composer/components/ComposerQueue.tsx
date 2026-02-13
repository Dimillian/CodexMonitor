import { useCallback } from "react";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { getCurrentWindow } from "@tauri-apps/api/window";
import type { QueuedMessage } from "../../../types";

type ComposerQueueProps = {
  queuedMessages: QueuedMessage[];
  pausedReason?: string | null;
  onEditQueued?: (item: QueuedMessage) => void;
  onDeleteQueued?: (id: string) => void;
};

export function ComposerQueue({
  queuedMessages,
  pausedReason = null,
  onEditQueued,
  onDeleteQueued,
}: ComposerQueueProps) {
  const handleQueueMenu = useCallback(
    async (event: React.MouseEvent, item: QueuedMessage) => {
      event.preventDefault();
      event.stopPropagation();
      const { clientX, clientY } = event;
      const editItem = await MenuItem.new({
        text: "Edit",
        action: () => onEditQueued?.(item),
      });
      const deleteItem = await MenuItem.new({
        text: "Delete",
        action: () => onDeleteQueued?.(item.id),
      });
      const menu = await Menu.new({ items: [editItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(clientX, clientY);
      await menu.popup(position, window);
    },
    [onDeleteQueued, onEditQueued],
  );

  if (queuedMessages.length === 0) {
    return null;
  }

  return (
    <div className="composer-queue">
      <div className="composer-queue-title">Queued</div>
      {pausedReason ? (
        <div className="composer-queue-hint">{pausedReason}</div>
      ) : null}
      <div className="composer-queue-list">
        {queuedMessages.map((item) => (
          <div key={item.id} className="composer-queue-item">
            <span className="composer-queue-text">
              {item.text ||
                (item.images?.length
                  ? item.images.length === 1
                    ? "Image"
                    : "Images"
                  : "")}
              {item.images?.length
                ? ` · ${item.images.length} image${item.images.length === 1 ? "" : "s"}`
                : ""}
            </span>
            <button
              className="composer-queue-menu"
              onClick={(event) => handleQueueMenu(event, item)}
              aria-label="Queue item menu"
            >
              ...
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
