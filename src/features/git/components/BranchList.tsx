import type { ReactNode, Ref } from "react";
import type { BranchInfo } from "../../../types";

type BranchListProps = {
  branches: BranchInfo[];
  currentBranch: string | null;
  selectedIndex?: number;
  listClassName: string;
  listRef?: Ref<HTMLDivElement>;
  itemClassName: string;
  itemLabelClassName?: string;
  selectedItemClassName?: string;
  currentItemClassName?: string;
  emptyClassName: string;
  emptyText: string;
  listRole?: string;
  itemRole?: string;
  itemDataTauriDragRegion?: string;
  renderMeta?: (branch: BranchInfo) => ReactNode;
  onMouseEnter?: (index: number) => void;
  onSelect: (branch: BranchInfo) => void;
};

export function BranchList({
  branches,
  currentBranch,
  selectedIndex,
  listClassName,
  listRef,
  itemClassName,
  itemLabelClassName,
  selectedItemClassName,
  currentItemClassName,
  emptyClassName,
  emptyText,
  listRole,
  itemRole,
  itemDataTauriDragRegion,
  renderMeta,
  onMouseEnter,
  onSelect,
}: BranchListProps) {
  return (
    <div className={listClassName} role={listRole} ref={listRef}>
      {branches.length === 0 && <div className={emptyClassName}>{emptyText}</div>}
      {branches.map((branch, index) => {
        const isCurrent = branch.name === currentBranch;
        const isSelected = selectedIndex === index;
        const className = [
          itemClassName,
          isSelected && selectedItemClassName ? selectedItemClassName : "",
          isCurrent && currentItemClassName ? currentItemClassName : "",
        ]
          .filter(Boolean)
          .join(" ");

        return (
          <button
            key={branch.name}
            type="button"
            className={className}
            onClick={() => onSelect(branch)}
            onMouseEnter={onMouseEnter ? () => onMouseEnter(index) : undefined}
            role={itemRole}
            data-tauri-drag-region={itemDataTauriDragRegion}
          >
            {itemLabelClassName ? (
              <span className={itemLabelClassName}>{branch.name}</span>
            ) : (
              branch.name
            )}
            {renderMeta?.(branch)}
          </button>
        );
      })}
    </div>
  );
}
