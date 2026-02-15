import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { useVirtualizer } from "@tanstack/react-virtual";
import { convertFileSrc } from "@tauri-apps/api/core";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import Plus from "lucide-react/dist/esm/icons/plus";
import ChevronsUpDown from "lucide-react/dist/esm/icons/chevrons-up-down";
import File from "lucide-react/dist/esm/icons/file";
import Folder from "lucide-react/dist/esm/icons/folder";
import GitBranch from "lucide-react/dist/esm/icons/git-branch";
import Search from "lucide-react/dist/esm/icons/search";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import {
  PanelFrame,
  PanelHeader,
  PanelMeta,
  PanelSearchField,
} from "../../design-system/components/panel/PanelPrimitives";
import { readWorkspaceFile } from "../../../services/tauri";
import type { OpenAppTarget } from "../../../types";
import { useDebouncedValue } from "../../../hooks/useDebouncedValue";
import { languageFromPath } from "../../../utils/syntax";
import { joinWorkspacePath, revealInFileManagerLabel } from "../../../utils/platformPaths";
import { getFileTypeIconUrl } from "../../../utils/fileTypeIcons";
import { FilePreviewPopover } from "./FilePreviewPopover";

type FileTreeNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: FileTreeNode[];
};

type FileTreePanelProps = {
  workspaceId: string;
  workspacePath: string;
  files: string[];
  modifiedFiles: string[];
  isLoading: boolean;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  onInsertText?: (text: string) => void;
  canInsertText: boolean;
  openTargets: OpenAppTarget[];
  openAppIconById: Record<string, string>;
  selectedOpenAppId: string;
  onSelectOpenAppId: (id: string) => void;
};

type FileTreeBuildNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: Map<string, FileTreeBuildNode>;
};

type FileEntry = {
  path: string;
  lower: string;
  segments: string[];
};

type FileTreeRowEntry = {
  node: FileTreeNode;
  depth: number;
  isFolder: boolean;
  isExpanded: boolean;
};

const FILE_TREE_ROW_HEIGHT = 28;

function buildTree(entries: FileEntry[]): { nodes: FileTreeNode[]; folderPaths: Set<string> } {
  const root = new Map<string, FileTreeBuildNode>();
  const addNode = (
    map: Map<string, FileTreeBuildNode>,
    name: string,
    path: string,
    type: "file" | "folder",
  ) => {
    const existing = map.get(name);
    if (existing) {
      if (type === "folder") {
        existing.type = "folder";
      }
      return existing;
    }
    const node: FileTreeBuildNode = {
      name,
      path,
      type,
      children: new Map(),
    };
    map.set(name, node);
    return node;
  };

  entries.forEach(({ segments }) => {
    if (!segments.length) {
      return;
    }
    let currentMap = root;
    let currentPath = "";
    segments.forEach((segment, index) => {
      const isFile = index === segments.length - 1;
      const nextPath = currentPath ? `${currentPath}/${segment}` : segment;
      const node = addNode(currentMap, segment, nextPath, isFile ? "file" : "folder");
      if (!isFile) {
        currentMap = node.children;
        currentPath = nextPath;
      }
    });
  });

  const folderPaths = new Set<string>();

  const toArray = (map: Map<string, FileTreeBuildNode>): FileTreeNode[] => {
    const nodes = Array.from(map.values()).map((node) => {
      if (node.type === "folder") {
        folderPaths.add(node.path);
      }
      return {
        name: node.name,
        path: node.path,
        type: node.type,
        children: node.type === "folder" ? toArray(node.children) : [],
      };
    });
    nodes.sort((a, b) => {
      if (a.type !== b.type) {
        return a.type === "folder" ? -1 : 1;
      }
      return a.name.localeCompare(b.name);
    });
    return nodes;
  };

  return { nodes: toArray(root), folderPaths };
}

const imageExtensions = new Set([
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "avif",
  "bmp",
  "heic",
  "heif",
  "tif",
  "tiff",
]);

function isImagePath(path: string) {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return imageExtensions.has(ext);
}

export function FileTreePanel({
  workspaceId,
  workspacePath,
  files,
  modifiedFiles,
  isLoading,
  filePanelMode,
  onFilePanelModeChange,
  onInsertText,
  canInsertText,
  openTargets,
  openAppIconById,
  selectedOpenAppId,
  onSelectOpenAppId,
}: FileTreePanelProps) {
  const [filterMode, setFilterMode] = useState<"all" | "modified">("all");
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());
  const [query, setQuery] = useState("");
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const [previewAnchor, setPreviewAnchor] = useState<{
    top: number;
    left: number;
    arrowTop: number;
    height: number;
  } | null>(null);
  const [previewContent, setPreviewContent] = useState<string>("");
  const [previewTruncated, setPreviewTruncated] = useState(false);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewSelection, setPreviewSelection] = useState<{
    start: number;
    end: number;
  } | null>(null);
  const [isDragSelecting, setIsDragSelecting] = useState(false);
  const dragAnchorLineRef = useRef<number | null>(null);
  const dragMovedRef = useRef(false);
  const hasManualToggle = useRef(false);
  const showLoading = isLoading && files.length === 0;
  const listRef = useRef<HTMLDivElement | null>(null);
  const debouncedQuery = useDebouncedValue(query, 150);
  const normalizedQuery = debouncedQuery.trim().toLowerCase();
  const modifiedPathSet = useMemo(() => new Set(modifiedFiles), [modifiedFiles]);
  const fileEntries = useMemo(
    () =>
      files.map((path) => ({
        path,
        lower: path.toLowerCase(),
        segments: path.split("/").filter(Boolean),
      })),
    [files],
  );
  const sourceEntries = useMemo(
    () =>
      filterMode === "modified"
        ? fileEntries.filter((entry) => modifiedPathSet.has(entry.path))
        : fileEntries,
    [fileEntries, filterMode, modifiedPathSet],
  );
  const previewKind = useMemo(
    () => (previewPath && isImagePath(previewPath) ? "image" : "text"),
    [previewPath],
  );

  const visibleEntries = useMemo(() => {
    if (!normalizedQuery) {
      return sourceEntries;
    }
    return sourceEntries.filter((entry) => entry.lower.includes(normalizedQuery));
  }, [sourceEntries, normalizedQuery]);

  const { nodes, folderPaths } = useMemo(
    () => buildTree(visibleEntries),
    [visibleEntries],
  );

  const visibleFolderPaths = folderPaths;
  const hasFolders = visibleFolderPaths.size > 0;
  const allVisibleExpanded =
    hasFolders && Array.from(visibleFolderPaths).every((path) => expandedFolders.has(path));

  useEffect(() => {
    setExpandedFolders((prev) => {
      if (normalizedQuery || filterMode === "modified") {
        return new Set(folderPaths);
      }
      const next = new Set<string>();
      prev.forEach((path) => {
        if (folderPaths.has(path)) {
          next.add(path);
        }
      });
      if (next.size === 0 && !hasManualToggle.current) {
        nodes.forEach((node) => {
          if (node.type === "folder") {
            next.add(node.path);
          }
        });
      }
      return next;
    });
  }, [filterMode, folderPaths, nodes, normalizedQuery]);

  useEffect(() => {
    setPreviewPath(null);
    setPreviewAnchor(null);
    setPreviewSelection(null);
    setPreviewContent("");
    setPreviewTruncated(false);
    setPreviewError(null);
    setPreviewLoading(false);
    setIsDragSelecting(false);
    dragAnchorLineRef.current = null;
    dragMovedRef.current = false;
  }, [workspaceId]);

  const closePreview = useCallback(() => {
    setPreviewPath(null);
    setPreviewAnchor(null);
    setPreviewSelection(null);
    setPreviewContent("");
    setPreviewTruncated(false);
    setPreviewError(null);
    setPreviewLoading(false);
    setIsDragSelecting(false);
    dragAnchorLineRef.current = null;
    dragMovedRef.current = false;
  }, []);

  useEffect(() => {
    if (!previewPath) {
      return;
    }
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closePreview();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewPath, closePreview]);

  const toggleAllFolders = () => {
    if (!hasFolders) {
      return;
    }
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (allVisibleExpanded) {
        visibleFolderPaths.forEach((path) => next.delete(path));
      } else {
        visibleFolderPaths.forEach((path) => next.add(path));
      }
      return next;
    });
    hasManualToggle.current = true;
  };

  const toggleFolder = (path: string) => {
    setExpandedFolders((prev) => {
      const next = new Set(prev);
      if (next.has(path)) {
        next.delete(path);
      } else {
        next.add(path);
      }
      return next;
    });
  };

  const resolvePath = useCallback(
    (relativePath: string) => {
      return joinWorkspacePath(workspacePath, relativePath);
    },
    [workspacePath],
  );

  const previewImageSrc = useMemo(() => {
    if (!previewPath || previewKind !== "image") {
      return null;
    }
    try {
      return convertFileSrc(resolvePath(previewPath));
    } catch {
      return null;
    }
  }, [previewPath, previewKind, resolvePath]);

  const openPreview = useCallback((path: string, target: HTMLElement) => {
    const rect = target.getBoundingClientRect();
    const estimatedWidth = 640;
    const estimatedHeight = 520;
    const padding = 16;
    const maxHeight = Math.min(estimatedHeight, window.innerHeight - padding * 2);
    const left = Math.min(
      Math.max(padding, rect.left - estimatedWidth - padding),
      Math.max(padding, window.innerWidth - estimatedWidth - padding),
    );
    const top = Math.min(
      Math.max(padding, rect.top - maxHeight * 0.35),
      Math.max(padding, window.innerHeight - maxHeight - padding),
    );
    const arrowTop = Math.min(
      Math.max(16, rect.top + rect.height / 2 - top),
      Math.max(16, maxHeight - 16),
    );
    setPreviewPath(path);
    setPreviewAnchor({ top, left, arrowTop, height: maxHeight });
    setPreviewSelection(null);
    setIsDragSelecting(false);
    dragAnchorLineRef.current = null;
    dragMovedRef.current = false;
  }, []);

  useEffect(() => {
    if (!previewPath) {
      return;
    }
    let cancelled = false;
    if (previewKind === "image") {
      setPreviewContent("");
      setPreviewTruncated(false);
      setPreviewError(null);
      setPreviewLoading(false);
      return () => {
        cancelled = true;
      };
    }
    setPreviewLoading(true);
    setPreviewError(null);
    readWorkspaceFile(workspaceId, previewPath)
      .then((response) => {
        if (cancelled) {
          return;
        }
        setPreviewContent(response.content ?? "");
        setPreviewTruncated(Boolean(response.truncated));
      })
      .catch((error) => {
        if (cancelled) {
          return;
        }
        setPreviewError(error instanceof Error ? error.message : String(error));
      })
      .finally(() => {
        if (!cancelled) {
          setPreviewLoading(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [previewKind, previewPath, workspaceId]);

  const flatNodes = useMemo(() => {
    const rows: FileTreeRowEntry[] = [];
    const walk = (node: FileTreeNode, depth: number) => {
      const isFolder = node.type === "folder";
      const isExpanded = isFolder && expandedFolders.has(node.path);
      rows.push({ node, depth, isFolder, isExpanded });
      if (isFolder && isExpanded) {
        node.children.forEach((child) => walk(child, depth + 1));
      }
    };
    nodes.forEach((node) => walk(node, 0));
    return rows;
  }, [nodes, expandedFolders]);

  const rowVirtualizer = useVirtualizer({
    count: flatNodes.length,
    getScrollElement: () => listRef.current,
    estimateSize: () => FILE_TREE_ROW_HEIGHT,
    overscan: 8,
  });
  const virtualRows = rowVirtualizer.getVirtualItems();
  const totalVirtualHeight = rowVirtualizer.getTotalSize();
  const virtualContainerRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    const container = virtualContainerRef.current;
    if (!container) {
      return;
    }
    container.style.setProperty("--file-tree-total-height", `${totalVirtualHeight}px`);
  }, [totalVirtualHeight]);

  useLayoutEffect(() => {
    const container = virtualContainerRef.current;
    if (!container) {
      return;
    }
    for (const virtualRow of virtualRows) {
      const rowElement = container.querySelector<HTMLElement>(
        `[data-index="${virtualRow.index}"]`,
      );
      if (!rowElement) {
        continue;
      }
      rowElement.style.setProperty("--file-tree-row-offset", `${virtualRow.start}px`);
    }
  }, [virtualRows]);

  useEffect(() => {
    if (!isDragSelecting) {
      return;
    }
    const handleMouseUp = () => {
      setIsDragSelecting(false);
      dragAnchorLineRef.current = null;
    };
    window.addEventListener("mouseup", handleMouseUp);
    return () => window.removeEventListener("mouseup", handleMouseUp);
  }, [isDragSelecting]);

  const selectRangeFromAnchor = useCallback((anchor: number, index: number) => {
    const start = Math.min(anchor, index);
    const end = Math.max(anchor, index);
    setPreviewSelection({ start, end });
  }, []);

  const handleSelectLine = useCallback(
    (index: number, event: MouseEvent<HTMLButtonElement>) => {
      if (dragMovedRef.current) {
        dragMovedRef.current = false;
        return;
      }
      if (event.shiftKey && previewSelection) {
        const anchor = previewSelection.start;
        selectRangeFromAnchor(anchor, index);
        return;
      }
      setPreviewSelection({ start: index, end: index });
    },
    [previewSelection, selectRangeFromAnchor],
  );

  const handleLineMouseDown = useCallback(
    (index: number, event: MouseEvent<HTMLButtonElement>) => {
      if (previewKind !== "text" || event.button !== 0) {
        return;
      }
      event.preventDefault();
      setIsDragSelecting(true);
      const anchor =
        event.shiftKey && previewSelection ? previewSelection.start : index;
      dragAnchorLineRef.current = anchor;
      dragMovedRef.current = false;
      selectRangeFromAnchor(anchor, index);
    },
    [previewKind, previewSelection, selectRangeFromAnchor],
  );

  const handleLineMouseEnter = useCallback(
    (index: number, _event: MouseEvent<HTMLButtonElement>) => {
      if (!isDragSelecting) {
        return;
      }
      const anchor = dragAnchorLineRef.current;
      if (anchor === null) {
        return;
      }
      if (anchor !== index) {
        dragMovedRef.current = true;
      }
      selectRangeFromAnchor(anchor, index);
    },
    [isDragSelecting, selectRangeFromAnchor],
  );

  const handleLineMouseUp = useCallback(() => {
    if (!isDragSelecting) {
      return;
    }
    setIsDragSelecting(false);
    dragAnchorLineRef.current = null;
  }, [isDragSelecting]);

  const selectionHints = useMemo(
    () =>
      previewKind === "text"
        ? ["按住 Shift 后点击，或拖拽后点击", "用于多行选择"]
        : [],
    [previewKind],
  );

  const handleAddSelection = useCallback(() => {
    if (
      !canInsertText ||
      previewKind !== "text" ||
      !previewPath ||
      !previewSelection ||
      !onInsertText
    ) {
      return;
    }
    const lines = previewContent.split("\n");
    const selected = lines.slice(previewSelection.start, previewSelection.end + 1);
    const language = languageFromPath(previewPath);
    const fence = language ? `\`\`\`${language}` : "```";
    const start = previewSelection.start + 1;
    const end = previewSelection.end + 1;
    const rangeLabel = start === end ? `L${start}` : `L${start}-L${end}`;
    const snippet = `${previewPath}:${rangeLabel}\n${fence}\n${selected.join("\n")}\n\`\`\``;
    onInsertText(snippet);
    closePreview();
  }, [
    canInsertText,
    previewContent,
    previewKind,
    previewPath,
    previewSelection,
    onInsertText,
    closePreview,
  ]);

  const showMenu = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, relativePath: string) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = await Menu.new({
        items: [
          await MenuItem.new({
            text: "添加到对话",
            enabled: canInsertText,
            action: async () => {
              if (!canInsertText) {
                return;
              }
              onInsertText?.(relativePath);
            },
          }),
          await MenuItem.new({
            text: revealInFileManagerLabel(),
            action: async () => {
              await revealItemInDir(resolvePath(relativePath));
            },
          }),
        ],
      });
      const window = getCurrentWindow();
      const position = new LogicalPosition(event.clientX, event.clientY);
      await menu.popup(position, window);
    },
    [canInsertText, onInsertText, resolvePath],
  );

  const renderRow = (entry: FileTreeRowEntry) => {
    const { node, depth, isFolder, isExpanded } = entry;
    const fileTypeIconUrl = isFolder ? null : getFileTypeIconUrl(node.path);
    const depthClass = `file-tree-depth-${Math.min(depth, 20)}`;
    return (
      <div className="file-tree-row-wrap">
        <button
          type="button"
          className={`file-tree-row ${depthClass}${isFolder ? " is-folder" : " is-file"}`}
          onClick={(event) => {
            if (isFolder) {
              toggleFolder(node.path);
              return;
            }
            openPreview(node.path, event.currentTarget);
          }}
          onContextMenu={(event) => {
            void showMenu(event, node.path);
          }}
        >
          {isFolder ? (
            <span className={`file-tree-chevron${isExpanded ? " is-open" : ""}`}>
              ›
            </span>
          ) : (
            <span className="file-tree-spacer" aria-hidden />
          )}
          <span className="file-tree-icon" aria-hidden>
            {isFolder ? (
              <Folder size={12} />
            ) : fileTypeIconUrl ? (
              <img
                className="file-tree-icon-image"
                src={fileTypeIconUrl}
                srcSet={`${fileTypeIconUrl} 1x, ${fileTypeIconUrl} 2x`}
                alt=""
                width={12}
                height={12}
                sizes="12px"
                loading="lazy"
                decoding="async"
              />
            ) : (
              <File size={12} />
            )}
          </span>
          <span className="file-tree-name">{node.name}</span>
        </button>
        {!isFolder && (
          <button
            type="button"
            className="ghost icon-button file-tree-action"
            onClick={(event) => {
              event.stopPropagation();
              if (!canInsertText) {
                return;
              }
              onInsertText?.(node.path);
            }}
            disabled={!canInsertText}
            aria-label={`提及 ${node.name}`}
            title="在对话中提及"
          >
            <Plus size={10} aria-hidden />
          </button>
        )}
      </div>
    );
  };

  return (
    <PanelFrame className="file-tree-panel">
      <PanelHeader className="git-panel-header">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        <PanelMeta className="file-tree-meta">
          <div className="file-tree-count">
            {visibleEntries.length
              ? normalizedQuery
                ? `${visibleEntries.length} 条匹配`
                : filterMode === "modified"
                  ? `${visibleEntries.length} modified`
                  : `${visibleEntries.length} 个文件`
              : showLoading
                ? "正在加载文件"
                : filterMode === "modified"
                  ? "无改动文件"
                  : "无文件"}
          </div>
          {hasFolders ? (
            <button
              type="button"
              className="ghost icon-button file-tree-toggle"
              onClick={toggleAllFolders}
              aria-label={allVisibleExpanded ? "折叠全部文件夹" : "展开全部文件夹"}
              title={allVisibleExpanded ? "折叠全部文件夹" : "展开全部文件夹"}
            >
              <ChevronsUpDown aria-hidden />
            </button>
          ) : null}
        </PanelMeta>
      </PanelHeader>
      <PanelSearchField
        className="file-tree-search"
        inputClassName="file-tree-search-input"
        placeholder="筛选文件和文件夹"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="筛选文件和文件夹"
        icon={<Search aria-hidden />}
        trailing={
          <button
            type="button"
            className={`ghost icon-button file-tree-search-filter${filterMode === "modified" ? " is-active" : ""}`}
            onClick={() => {
              setFilterMode((prev) => (prev === "all" ? "modified" : "all"));
            }}
            aria-pressed={filterMode === "modified"}
            aria-label={
              filterMode === "modified" ? "显示全部文件" : "仅显示改动文件"
            }
            title={filterMode === "modified" ? "显示全部文件" : "仅显示改动文件"}
          >
            <GitBranch size={14} aria-hidden />
          </button>
        }
      />
      <div className="file-tree-list" ref={listRef}>
        {showLoading ? (
          <div className="file-tree-skeleton">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                className={`file-tree-skeleton-row file-tree-skeleton-row-${index}`}
                key={`file-tree-skeleton-${index}`}
              />
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <div className="file-tree-empty">
            {normalizedQuery
              ? filterMode === "modified"
                ? "没有符合筛选条件的改动文件。"
                : "未找到匹配项。"
              : filterMode === "modified"
                ? "暂无改动文件。"
                : "暂无可用文件。"}
          </div>
        ) : (
          <div className="file-tree-virtual" ref={virtualContainerRef}>
            {virtualRows.map((virtualRow) => {
              const entry = flatNodes[virtualRow.index];
              if (!entry) {
                return null;
              }
              return (
                <div
                  key={virtualRow.key}
                  className="file-tree-virtual-row"
                  data-index={virtualRow.index}
                  ref={rowVirtualizer.measureElement}
                >
                  {renderRow(entry)}
                </div>
              );
            })}
          </div>
        )}
      </div>
      {previewPath && previewAnchor
        ? createPortal(
            <FilePreviewPopover
              path={previewPath}
              absolutePath={resolvePath(previewPath)}
              content={previewContent}
              truncated={previewTruncated}
              previewKind={previewKind}
              imageSrc={previewImageSrc}
              openTargets={openTargets}
              openAppIconById={openAppIconById}
              selectedOpenAppId={selectedOpenAppId}
              onSelectOpenAppId={onSelectOpenAppId}
              selection={previewSelection}
              onSelectLine={handleSelectLine}
              onLineMouseDown={handleLineMouseDown}
              onLineMouseEnter={handleLineMouseEnter}
              onLineMouseUp={handleLineMouseUp}
              onClearSelection={() => setPreviewSelection(null)}
              onAddSelection={handleAddSelection}
              canInsertText={canInsertText}
              onClose={closePreview}
              selectionHints={selectionHints}
              anchor={{
                top: previewAnchor.top,
                left: previewAnchor.left,
                width: 640,
                maxHeight: previewAnchor.height,
                arrowTop: previewAnchor.arrowTop,
              }}
              isLoading={previewLoading}
              error={previewError}
            />,
            document.body,
          )
        : null}
    </PanelFrame>
  );
}
