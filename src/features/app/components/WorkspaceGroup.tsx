type WorkspaceGroupProps = {
  groupId: string | null;
  name: string;
  showHeader: boolean;
  isCollapsed: boolean;
  onToggleCollapse: (groupId: string) => void;
  children: React.ReactNode;
};

export function WorkspaceGroup({
  groupId,
  name,
  showHeader,
  isCollapsed,
  onToggleCollapse,
  children,
}: WorkspaceGroupProps) {
  return (
    <div className="workspace-group">
      {showHeader && (
        <div className="workspace-group-header">
          <div className="workspace-group-label">{name}</div>
          {groupId && (
            <button
              className={`group-toggle ${isCollapsed ? "" : "expanded"}`}
              onClick={(event) => {
                event.stopPropagation();
                onToggleCollapse(groupId);
              }}
              aria-label={isCollapsed ? "Expand group" : "Collapse group"}
              aria-expanded={!isCollapsed}
              type="button"
            >
              <span className="group-toggle-icon">›</span>
            </button>
          )}
        </div>
      )}
      <div className={`workspace-group-list ${isCollapsed ? "collapsed" : ""}`}>
        {children}
      </div>
    </div>
  );
}
