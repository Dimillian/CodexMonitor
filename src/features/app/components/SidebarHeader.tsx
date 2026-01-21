import { FolderKanban, Plus } from "lucide-react";

type SidebarHeaderProps = {
  onSelectHome: () => void;
  onAddWorkspace: () => void;
};

export function SidebarHeader({ onSelectHome, onAddWorkspace }: SidebarHeaderProps) {
  return (
    <div className="sidebar-header">
      <div>
        <button
          className="subtitle subtitle-button"
          onClick={onSelectHome}
          data-tauri-drag-region="false"
          aria-label="Open home"
        >
          <FolderKanban className="sidebar-nav-icon" />
          Projects
        </button>
      </div>
      <button
        className="ghost plus-button"
        style={{height: "24px", width: "24px", padding: "0 0 0 0", display: "flex", justifyContent: "center", alignItems: "center"}}
        onClick={onAddWorkspace}
        data-tauri-drag-region="false"
        aria-label="Add workspace"
      >
        <Plus size={12}></Plus>
      </button>
    </div>
  );
}
