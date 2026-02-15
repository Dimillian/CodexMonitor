import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type { DebugEntry } from "../../../types";
import { UI_LOCALE } from "../../../i18n/locale";

type DebugPanelProps = {
  entries: DebugEntry[];
  isOpen: boolean;
  onClear: () => void;
  onCopy: () => void;
  onResizeStart?: (event: ReactMouseEvent) => void;
  variant?: "dock" | "full";
};

type DebugLevel = "error" | "warn" | "info";
type LevelFilter = "all" | DebugLevel;
type AnsiSegment = {
  text: string;
  className?: string;
};

const LEVEL_FILTERS: Array<{ value: LevelFilter; label: string }> = [
  { value: "all", label: "全部" },
  { value: "error", label: "错误" },
  { value: "warn", label: "警告" },
  { value: "info", label: "信息" },
];

const ANSI_ESCAPE_CHAR = String.fromCharCode(27);
const ANSI_SEQUENCE_PATTERN = new RegExp(`${ANSI_ESCAPE_CHAR}\\[[0-9;]*m`, "g");
const ANSI_SGR_PATTERN = new RegExp(`${ANSI_ESCAPE_CHAR}\\[([0-9;]*)m`, "g");

function normalizeAnsiText(value: string) {
  return value.replace(/\\u001b|\\u001B|\\x1b/gi, ANSI_ESCAPE_CHAR);
}

function formatPayload(payload: unknown) {
  if (payload === undefined) {
    return "";
  }
  if (typeof payload === "string") {
    return normalizeAnsiText(payload);
  }
  try {
    return normalizeAnsiText(JSON.stringify(payload, null, 2));
  } catch {
    return normalizeAnsiText(String(payload));
  }
}

function stripAnsi(value: string) {
  return normalizeAnsiText(value).replace(ANSI_SEQUENCE_PATTERN, "");
}

function classifyDebugLevel(entry: DebugEntry, payloadText?: string): DebugLevel {
  const source = entry.source.toLowerCase();
  if (source === "error" || source === "stderr") {
    return "error";
  }
  const label = entry.label.toLowerCase();
  const normalizedPayload = (payloadText ?? "").toLowerCase();
  const text = `${label}\n${normalizedPayload}`;
  if (
    text.includes("error")
    || text.includes("failed")
    || text.includes("exception")
    || text.includes("fatal")
  ) {
    return "error";
  }
  if (text.includes("warn") || text.includes("warning")) {
    return "warn";
  }
  return "info";
}

function pushAnsiSegment(
  segments: AnsiSegment[],
  text: string,
  state: { fg: string | null; bold: boolean; dim: boolean },
) {
  if (!text) {
    return;
  }
  const classes: string[] = [];
  if (state.fg) {
    classes.push(`debug-ansi-fg-${state.fg}`);
  }
  if (state.bold) {
    classes.push("debug-ansi-bold");
  }
  if (state.dim) {
    classes.push("debug-ansi-dim");
  }
  segments.push({
    text,
    className: classes.length > 0 ? classes.join(" ") : undefined,
  });
}

function parseAnsiSegments(payloadText: string): AnsiSegment[] {
  const source = normalizeAnsiText(payloadText);
  const segments: AnsiSegment[] = [];
  const state = { fg: null as string | null, bold: false, dim: false };
  let lastIndex = 0;

  source.replace(ANSI_SGR_PATTERN, (fullMatch, rawCodes: string, matchIndex: number) => {
    const plainChunk = source.slice(lastIndex, matchIndex);
    pushAnsiSegment(segments, plainChunk, state);
    const codes =
      rawCodes.trim().length > 0
        ? rawCodes
          .split(";")
          .map((value) => Number.parseInt(value, 10))
          .filter((value) => Number.isFinite(value))
        : [0];
    for (const code of codes) {
      if (code === 0) {
        state.fg = null;
        state.bold = false;
        state.dim = false;
      } else if (code === 1) {
        state.bold = true;
      } else if (code === 2) {
        state.dim = true;
      } else if (code === 22) {
        state.bold = false;
        state.dim = false;
      } else if (code === 39) {
        state.fg = null;
      } else if (code >= 30 && code <= 37) {
        state.fg = ["black", "red", "green", "yellow", "blue", "magenta", "cyan", "white"][code - 30];
      } else if (code >= 90 && code <= 97) {
        state.fg = [
          "bright-black",
          "bright-red",
          "bright-green",
          "bright-yellow",
          "bright-blue",
          "bright-magenta",
          "bright-cyan",
          "bright-white",
        ][code - 90];
      }
    }
    lastIndex = matchIndex + fullMatch.length;
    return "";
  });
  if (lastIndex < source.length) {
    pushAnsiSegment(segments, source.slice(lastIndex), state);
  }
  return segments.length > 0 ? segments : [{ text: source }];
}

export function DebugPanel({
  entries,
  isOpen,
  onClear,
  onCopy,
  onResizeStart,
  variant = "dock",
}: DebugPanelProps) {
  const isVisible = variant === "full" || isOpen;
  const [levelFilter, setLevelFilter] = useState<LevelFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [onlyErrors, setOnlyErrors] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const listRef = useRef<HTMLDivElement | null>(null);

  type FormattedDebugEntry = DebugEntry & {
    timeLabel: string;
    payloadText?: string;
    payloadSegments?: AnsiSegment[];
    level: DebugLevel;
    searchText: string;
  };

  const previousEntriesRef = useRef<DebugEntry[] | null>(null);
  const previousFormattedRef = useRef<FormattedDebugEntry[] | null>(null);

  const formattedEntries = useMemo(() => {
    if (!isVisible) {
      return previousFormattedRef.current ?? [];
    }
    const previousEntries = previousEntriesRef.current;
    const previousFormatted = previousFormattedRef.current;

    const canReusePrevious =
      previousEntries !== null &&
      previousFormatted !== null &&
      previousEntries.length === entries.length &&
      entries.every((entry, index) => {
        const previous = previousEntries[index];
        return (
          previous !== undefined &&
          previous.id === entry.id &&
          previous.timestamp === entry.timestamp &&
          previous.source === entry.source &&
          previous.label === entry.label &&
          previous.payload === entry.payload
        );
      });

    if (canReusePrevious) {
      return previousFormatted;
    }

    const nextFormatted = entries.map((entry) => {
      const payloadText =
        entry.payload !== undefined ? formatPayload(entry.payload) : undefined;
      const level = classifyDebugLevel(entry, payloadText);
      return {
        ...entry,
        timeLabel: new Date(entry.timestamp).toLocaleTimeString(UI_LOCALE),
        payloadText,
        payloadSegments:
          payloadText !== undefined ? parseAnsiSegments(payloadText) : undefined,
        level,
        searchText: `${entry.source}\n${entry.label}\n${stripAnsi(payloadText ?? "")}`.toLowerCase(),
      };
    });

    previousEntriesRef.current = entries;
    previousFormattedRef.current = nextFormatted;

    return nextFormatted;
  }, [entries, isVisible]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleEntries = useMemo(
    () =>
      formattedEntries.filter((entry) => {
        if (levelFilter !== "all" && entry.level !== levelFilter) {
          return false;
        }
        if (onlyErrors && entry.level !== "error") {
          return false;
        }
        if (normalizedQuery && !entry.searchText.includes(normalizedQuery)) {
          return false;
        }
        return true;
      }),
    [formattedEntries, levelFilter, normalizedQuery, onlyErrors],
  );

  useEffect(() => {
    if (!autoScroll) {
      return;
    }
    const list = listRef.current;
    if (!list) {
      return;
    }
    list.scrollTop = list.scrollHeight;
  }, [autoScroll, visibleEntries]);

  if (!isVisible) {
    return null;
  }

  return (
    <section
      className={`debug-panel ${variant === "full" ? "full" : isOpen ? "open" : ""}`}
    >
      {variant !== "full" && isOpen && onResizeStart ? (
        <div
          className="debug-panel-resizer"
          role="separator"
          aria-orientation="horizontal"
          aria-label="调整调试面板大小"
          onMouseDown={onResizeStart}
        />
      ) : null}
      <div className="debug-header">
        <div className="debug-title">调试</div>
        <div className="debug-actions">
          <button className="ghost" onClick={onCopy}>
            复制
          </button>
          <button className="ghost" onClick={onClear}>
            清空
          </button>
        </div>
      </div>
      <div className="debug-controls">
        <div className="debug-filter-group" role="tablist" aria-label="日志级别筛选">
          {LEVEL_FILTERS.map((filter) => (
            <button
              key={filter.value}
              className={`debug-filter-chip ${levelFilter === filter.value ? "active" : ""}`}
              onClick={() => setLevelFilter(filter.value)}
            >
              {filter.label}
            </button>
          ))}
        </div>
        <label className="debug-toggle">
          <input
            type="checkbox"
            checked={onlyErrors}
            onChange={(event) => setOnlyErrors(event.target.checked)}
          />
          仅错误
        </label>
        <label className="debug-toggle">
          <input
            type="checkbox"
            checked={autoScroll}
            onChange={(event) => setAutoScroll(event.target.checked)}
          />
          自动滚动
        </label>
        <input
          className="debug-search"
          type="search"
          value={searchQuery}
          onChange={(event) => setSearchQuery(event.target.value)}
          placeholder="搜索日志（来源 / 标签 / 内容）"
          aria-label="搜索日志"
        />
      </div>
      {isOpen ? (
        <div className="debug-list" ref={listRef}>
          {formattedEntries.length === 0 ? (
            <div className="debug-empty">暂无调试事件。</div>
          ) : visibleEntries.length === 0 ? (
            <div className="debug-empty">没有匹配的日志。</div>
          ) : null}
          {visibleEntries.map((entry) => (
            <div key={entry.id} className="debug-row">
              <div className="debug-meta">
                <span className={`debug-level ${entry.level}`}>{entry.level}</span>
                <span className={`debug-source ${entry.source}`}>
                  {entry.source}
                </span>
                <span className="debug-time">{entry.timeLabel}</span>
                <span className="debug-label">{entry.label}</span>
              </div>
              {entry.payloadText !== undefined ? (
                <pre className="debug-payload">
                  {entry.payloadSegments?.map((segment, index) => (
                    <span
                      key={`${entry.id}-seg-${index}`}
                      className={segment.className}
                    >
                      {segment.text}
                    </span>
                  ))}
                </pre>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </section>
  );
}
