import type { MouseEvent as ReactMouseEvent, ReactNode } from "react";
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
          aria-label="调整终端面板大小"
          onMouseDown={onResizeStart}
        />
      )}
      <div className="terminal-header">
        <div className="terminal-tabs" role="tablist" aria-label="终端标签">
          {terminals.map((tab) => (
            <div
              key={tab.id}
              className={`terminal-tab${
                tab.id === activeTerminalId ? " active" : ""
              }`}
              role="tab"
              aria-selected={tab.id === activeTerminalId}
              tabIndex={tab.id === activeTerminalId ? 0 : -1}
              onClick={() => onSelectTerminal(tab.id)}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.preventDefault();
                  onSelectTerminal(tab.id);
                }
              }}
            >
              <span className="terminal-tab-label">{tab.title}</span>
              <button
                type="button"
                className="terminal-tab-close"
                aria-label={`关闭 ${tab.title}`}
                title={`关闭 ${tab.title}`}
                onClick={(event) => {
                  event.stopPropagation();
                  onCloseTerminal(tab.id);
                }}
              >
                <span aria-hidden>×</span>
              </button>
            </div>
          ))}
          <button
            className="terminal-tab-add"
            type="button"
            onClick={onNewTerminal}
            aria-label="新建终端"
            title="新建终端"
          >
            +
          </button>
        </div>
      </div>
      <div className="terminal-body">{terminalNode}</div>
    </section>
  );
}
