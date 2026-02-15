import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Search from "lucide-react/dist/esm/icons/search";

export type CommandItem = {
  id: string;
  label: string;
  shortcut?: string;
  section?: string;
  action: () => void;
};

type CommandPaletteProps = {
  commands: CommandItem[];
};

export function useCommandPalette(commands: CommandItem[]) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((prev) => !prev), []);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "k") {
        event.preventDefault();
        event.stopPropagation();
        toggle();
      }
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, [toggle]);

  return { open, close, commands };
}

export function CommandPalette({
  commands,
  open,
  onClose,
}: CommandPaletteProps & { open: boolean; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [activeIndex, setActiveIndex] = useState(0);

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return commands;
    }
    const lower = query.toLowerCase();
    return commands.filter(
      (cmd) =>
        cmd.label.toLowerCase().includes(lower) ||
        (cmd.section && cmd.section.toLowerCase().includes(lower)),
    );
  }, [commands, query]);

  // Reset state when opening
  useEffect(() => {
    if (open) {
      setQuery("");
      setActiveIndex(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  // Reset active index when filtered list changes
  useEffect(() => {
    setActiveIndex(0);
  }, [filtered.length]);

  const handleSelect = useCallback(
    (item: CommandItem) => {
      onClose();
      // Delay action so modal closes first
      requestAnimationFrame(() => item.action());
    },
    [onClose],
  );

  const handleKeyDown = useCallback(
    (event: React.KeyboardEvent) => {
      switch (event.key) {
        case "Escape":
          event.preventDefault();
          onClose();
          break;
        case "ArrowDown":
          event.preventDefault();
          setActiveIndex((prev) => (prev + 1) % Math.max(filtered.length, 1));
          break;
        case "ArrowUp":
          event.preventDefault();
          setActiveIndex(
            (prev) => (prev - 1 + Math.max(filtered.length, 1)) % Math.max(filtered.length, 1),
          );
          break;
        case "Enter":
          event.preventDefault();
          if (filtered[activeIndex]) {
            handleSelect(filtered[activeIndex]);
          }
          break;
      }
    },
    [filtered, activeIndex, onClose, handleSelect],
  );

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) {
      return;
    }
    const active = listRef.current.querySelector("[data-active='true']");
    if (active) {
      active.scrollIntoView({ block: "nearest" });
    }
  }, [activeIndex]);

  if (!open) {
    return null;
  }

  // Group by section
  const sections = new Map<string, CommandItem[]>();
  for (const item of filtered) {
    const section = item.section ?? "命令";
    if (!sections.has(section)) {
      sections.set(section, []);
    }
    sections.get(section)!.push(item);
  }

  let globalIndex = 0;

  return createPortal(
    <div className="command-palette-overlay" onMouseDown={onClose}>
      <div
        className="command-palette"
        onMouseDown={(event) => event.stopPropagation()}
        role="dialog"
        aria-label="命令菜单"
      >
        <div className="command-palette-search">
          <Search size={14} className="command-palette-search-icon" aria-hidden />
          <input
            ref={inputRef}
            className="command-palette-input"
            placeholder="搜索命令…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={handleKeyDown}
            spellCheck={false}
            autoCorrect="off"
            autoCapitalize="none"
          />
        </div>
        <div className="command-palette-list" ref={listRef} role="listbox">
          {filtered.length === 0 ? (
            <div className="command-palette-empty">未找到匹配命令</div>
          ) : (
            Array.from(sections.entries()).map(([section, items]) => (
              <div key={section} className="command-palette-section">
                <div className="command-palette-section-title">{section}</div>
                {items.map((item) => {
                  const index = globalIndex++;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={`command-palette-item${index === activeIndex ? " is-active" : ""}`}
                      data-active={index === activeIndex}
                      role="option"
                      aria-selected={index === activeIndex}
                      onClick={() => handleSelect(item)}
                      onMouseEnter={() => setActiveIndex(index)}
                    >
                      <span className="command-palette-item-label">{item.label}</span>
                      {item.shortcut ? (
                        <kbd className="command-palette-item-shortcut">{item.shortcut}</kbd>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
