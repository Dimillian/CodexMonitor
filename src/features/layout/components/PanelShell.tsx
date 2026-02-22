import type { ReactNode } from "react";

import {
  PanelFrame,
  PanelHeader,
} from "../../design-system/components/panel/PanelPrimitives";
import { PanelTabs, type PanelTabId } from "./PanelTabs";

type PanelShellProps = {
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  className?: string;
  headerClassName?: string;
  headerRight?: ReactNode;
  search?: ReactNode;
  children: ReactNode;
};

export function PanelShell({
  filePanelMode,
  onFilePanelModeChange,
  className,
  headerClassName,
  headerRight,
  search,
  children,
}: PanelShellProps) {
  return (
    <PanelFrame className={className}>
      <PanelHeader className={headerClassName}>
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        {headerRight}
      </PanelHeader>
      {search}
      {children}
    </PanelFrame>
  );
}
