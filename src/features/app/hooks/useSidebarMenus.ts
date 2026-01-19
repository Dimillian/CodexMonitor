import { useCallback, type MouseEvent } from "react";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";

type SidebarMenuHandlers = {
  onDeleteThread: (workspaceId: string, threadId: string) => void;
  onRenameThread: (workspaceId: string, threadId: string) => void;
  onReloadWorkspaceThreads: (workspaceId: string) => void;
  onDeleteWorkspace: (workspaceId: string) => void;
  onDeleteWorktree: (workspaceId: string) => void;
};

export function useSidebarMenus({
  onDeleteThread,
  onRenameThread,
  onReloadWorkspaceThreads,
  onDeleteWorkspace,
  onDeleteWorktree,
}: SidebarMenuHandlers) {
  const showThreadMenu = useCallback(
    async (event: MouseEvent, workspaceId: string, threadId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const renameItem = await MenuItem.new({
        text: "Rename",
        action: () => onRenameThread(workspaceId, threadId),
      });
      const archiveItem = await MenuItem.new({
        text: "Archive",
        action: () => onDeleteThread(workspaceId, threadId),
      });
      const copyItem = await MenuItem.new({
        text: "Copy ID",
        action: async () => {
          await navigator.clipboard.writeText(threadId);
        },
      });
      const menu = await Menu.new({ items: [renameItem, copyItem, archiveItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onDeleteThread, onRenameThread],
  );

  const showWorkspaceMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(workspaceId),
      });
      const deleteItem = await MenuItem.new({
        text: "Delete",
        action: () => onDeleteWorkspace(workspaceId),
      });
      const menu = await Menu.new({ items: [reloadItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onDeleteWorkspace],
  );

  const showWorktreeMenu = useCallback(
    async (event: MouseEvent, workspaceId: string) => {
      event.preventDefault();
      event.stopPropagation();
      const reloadItem = await MenuItem.new({
        text: "Reload threads",
        action: () => onReloadWorkspaceThreads(workspaceId),
      });
      const deleteItem = await MenuItem.new({
        text: "Delete worktree",
        action: () => onDeleteWorktree(workspaceId),
      });
      const menu = await Menu.new({ items: [reloadItem, deleteItem] });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [onReloadWorkspaceThreads, onDeleteWorktree],
  );

  return { showThreadMenu, showWorkspaceMenu, showWorktreeMenu };
}
