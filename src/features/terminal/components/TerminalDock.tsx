import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
import { useI18n } from "@/i18n";
import type { TerminalTab } from "../hooks/useTerminalTabs";

type TerminalDockProps = {
  isOpen: boolean;
  terminals: TerminalTab[];
  activeTerminalId: string | null;
  onSelectTerminal: (terminalId: string) => void;
  onNewTerminal: () => void;
  onCloseTerminal: (terminalId: string) => void;
  onResizeStart?: (event: ReactMouseEvent) => void;
  terminalNode: ReactNode;
};

export function TerminalDock({
  isOpen,
  terminals,
  activeTerminalId,
  onSelectTerminal,
  onNewTerminal,
  onCloseTerminal,
  onResizeStart,
  terminalNode,
}: TerminalDockProps) {
  const { tx } = useI18n();

  if (!isOpen) {
    return null;
  }

  return (
    <section className="terminal-panel">
      {onResizeStart && (
        <div
          className="terminal-panel-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label={tx("Resize terminal panel")}
          onMouseDown={onResizeStart}
        />
      )}
      <div className="terminal-header">
        <div className="terminal-tabs" role="tablist" aria-label={tx("Terminal tabs")}>
          {terminals.map((tab) => (
            <button
              key={tab.id}
              className={`terminal-tab${
                tab.id === activeTerminalId ? " active" : ""
              }`}
              type="button"
              role="tab"
              aria-selected={tab.id === activeTerminalId}
              onClick={() => onSelectTerminal(tab.id)}
            >
              <span className="terminal-tab-label">{tab.title}</span>
              <span
                className="terminal-tab-close"
                role="button"
                aria-label={tx("Close {title}", { title: tab.title })}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTerminal(tab.id);
                }}
              >
                ×
              </span>
            </button>
          ))}
          <button
            className="terminal-tab-add"
            type="button"
            onClick={onNewTerminal}
            aria-label={tx("New terminal")}
            title={tx("New terminal")}
          >
            +
          </button>
        </div>
      </div>
      <div className="terminal-body">{terminalNode}</div>
    </section>
  );
}
