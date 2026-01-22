import {
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { MouseEvent } from "react";
import { createPortal } from "react-dom";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import Plus from "lucide-react/dist/esm/icons/plus";
import ChevronsUpDown from "lucide-react/dist/esm/icons/chevrons-up-down";
import File from "lucide-react/dist/esm/icons/file";
import FileArchive from "lucide-react/dist/esm/icons/file-archive";
import FileAudio from "lucide-react/dist/esm/icons/file-audio";
import FileCode from "lucide-react/dist/esm/icons/file-code";
import FileImage from "lucide-react/dist/esm/icons/file-image";
import FileJson from "lucide-react/dist/esm/icons/file-json";
import FileSpreadsheet from "lucide-react/dist/esm/icons/file-spreadsheet";
import FileText from "lucide-react/dist/esm/icons/file-text";
import FileVideo from "lucide-react/dist/esm/icons/file-video";
import Folder from "lucide-react/dist/esm/icons/folder";
import Search from "lucide-react/dist/esm/icons/search";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import { readWorkspaceFile } from "../../../services/tauri";
import { languageFromPath } from "../../../utils/syntax";
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
  isLoading: boolean;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  onInsertText?: (text: string) => void;
};

type FileTreeBuildNode = {
  name: string;
  path: string;
  type: "file" | "folder";
  children: Map<string, FileTreeBuildNode>;
};

function buildTree(paths: string[]): { nodes: FileTreeNode[]; folderPaths: Set<string> } {
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

  paths.forEach((path) => {
    const parts = path.split("/").filter(Boolean);
    let currentMap = root;
    let currentPath = "";
    parts.forEach((segment, index) => {
      const isFile = index === parts.length - 1;
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

function getFileIcon(name: string) {
  const ext = name.split(".").pop()?.toLowerCase() ?? "";
  switch (ext) {
    case "ts":
    case "tsx":
    case "js":
    case "jsx":
    case "mjs":
    case "cjs":
    case "py":
    case "rs":
    case "swift":
    case "go":
    case "java":
    case "kt":
    case "cs":
    case "cpp":
    case "c":
    case "h":
    case "hpp":
    case "sh":
    case "zsh":
    case "bash":
      return FileCode;
    case "json":
      return FileJson;
    case "md":
    case "mdx":
    case "txt":
    case "rtf":
      return FileText;
    case "png":
    case "jpg":
    case "jpeg":
    case "gif":
    case "svg":
    case "webp":
    case "heic":
      return FileImage;
    case "mp4":
    case "mov":
    case "m4v":
    case "webm":
      return FileVideo;
    case "mp3":
    case "wav":
    case "flac":
    case "m4a":
      return FileAudio;
    case "zip":
    case "gz":
    case "tgz":
    case "tar":
    case "7z":
    case "rar":
      return FileArchive;
    case "csv":
    case "tsv":
    case "xls":
    case "xlsx":
      return FileSpreadsheet;
    default:
      return File;
  }
}

export function FileTreePanel({
  workspaceId,
  workspacePath,
  files,
  isLoading,
  filePanelMode,
  onFilePanelModeChange,
  onInsertText,
}: FileTreePanelProps) {
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
  const hasManualToggle = useRef(false);
  const showLoading = isLoading && files.length === 0;
  const deferredQuery = useDeferredValue(query);
  const normalizedQuery = deferredQuery.trim().toLowerCase();

  const filteredFiles = useMemo(() => {
    if (!normalizedQuery) {
      return files;
    }
    return files.filter((path) => path.toLowerCase().includes(normalizedQuery));
  }, [files, normalizedQuery]);

  const { nodes, folderPaths } = useMemo(
    () => buildTree(normalizedQuery ? filteredFiles : files),
    [files, filteredFiles, normalizedQuery],
  );

  const visibleFolderPaths = folderPaths;
  const hasFolders = visibleFolderPaths.size > 0;
  const allVisibleExpanded =
    hasFolders && Array.from(visibleFolderPaths).every((path) => expandedFolders.has(path));

  useEffect(() => {
    setExpandedFolders((prev) => {
      if (normalizedQuery) {
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
  }, [folderPaths, nodes, normalizedQuery]);

  useEffect(() => {
    setPreviewPath(null);
    setPreviewAnchor(null);
    setPreviewSelection(null);
    setPreviewContent("");
    setPreviewTruncated(false);
    setPreviewError(null);
    setPreviewLoading(false);
  }, [workspaceId]);

  const closePreview = useCallback(() => {
    setPreviewPath(null);
    setPreviewAnchor(null);
    setPreviewSelection(null);
    setPreviewContent("");
    setPreviewTruncated(false);
    setPreviewError(null);
    setPreviewLoading(false);
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
      const base = workspacePath.endsWith("/")
        ? workspacePath.slice(0, -1)
        : workspacePath;
      return `${base}/${relativePath}`;
    },
    [workspacePath],
  );

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
  }, []);

  useEffect(() => {
    if (!previewPath) {
      return;
    }
    let cancelled = false;
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
  }, [previewPath, workspaceId]);

  const handleSelectLine = useCallback(
    (index: number, event: MouseEvent<HTMLButtonElement>) => {
      if (event.shiftKey && previewSelection) {
        const anchor = previewSelection.start;
        const start = Math.min(anchor, index);
        const end = Math.max(anchor, index);
        setPreviewSelection({ start, end });
        return;
      }
      setPreviewSelection({ start: index, end: index });
    },
    [previewSelection],
  );

  const handleAddSelection = useCallback(() => {
    if (!previewPath || !previewSelection || !onInsertText) {
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
  }, [previewContent, previewPath, previewSelection, onInsertText, closePreview]);

  const showFileMenu = useCallback(
    async (event: MouseEvent<HTMLButtonElement>, relativePath: string) => {
      event.preventDefault();
      event.stopPropagation();
      const menu = await Menu.new({
        items: [
          await MenuItem.new({
            text: "Reveal in Finder",
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
    [resolvePath],
  );

  const renderNode = (node: FileTreeNode, depth: number) => {
    const isFolder = node.type === "folder";
    const isExpanded = isFolder && expandedFolders.has(node.path);
    const FileIcon = isFolder ? Folder : getFileIcon(node.name);
    return (
      <div key={node.path}>
        <div className="file-tree-row-wrap">
          <button
            type="button"
            className={`file-tree-row${isFolder ? " is-folder" : " is-file"}`}
            style={{ paddingLeft: `${depth * 10}px` }}
            onClick={(event) => {
              if (isFolder) {
                toggleFolder(node.path);
                return;
              }
              openPreview(node.path, event.currentTarget);
            }}
            onContextMenu={(event) => {
              if (!isFolder) {
                void showFileMenu(event, node.path);
              }
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
              <FileIcon size={12} />
            </span>
            <span className="file-tree-name">{node.name}</span>
          </button>
          {!isFolder && (
            <button
              type="button"
              className="ghost icon-button file-tree-action"
              onClick={(event) => {
                event.stopPropagation();
                onInsertText?.(node.path);
              }}
              aria-label={`Mention ${node.name}`}
              title="Mention in chat"
            >
              <Plus size={10} aria-hidden />
            </button>
          )}
        </div>
        {isFolder && isExpanded && node.children.length > 0 && (
          <div className="file-tree-children">
            {node.children.map((child) => renderNode(child, depth + 1))}
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="diff-panel file-tree-panel">
      <div className="git-panel-header">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        <div className="file-tree-meta">
          <div className="file-tree-count">
          {filteredFiles.length
            ? normalizedQuery
              ? `${filteredFiles.length} match${filteredFiles.length === 1 ? "" : "es"}`
              : `${filteredFiles.length} file${filteredFiles.length === 1 ? "" : "s"}`
            : showLoading
              ? "Loading files"
              : "No files"}
        </div>
          {hasFolders ? (
            <button
              type="button"
              className="ghost icon-button file-tree-toggle"
              onClick={toggleAllFolders}
              aria-label={allVisibleExpanded ? "Collapse all folders" : "Expand all folders"}
              title={allVisibleExpanded ? "Collapse all folders" : "Expand all folders"}
            >
              <ChevronsUpDown aria-hidden />
            </button>
          ) : null}
        </div>
      </div>
      <div className="file-tree-search">
        <Search className="file-tree-search-icon" aria-hidden />
        <input
          className="file-tree-search-input"
          type="search"
          placeholder="Filter files and folders"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter files and folders"
        />
      </div>
      <div className="file-tree-list">
        {showLoading ? (
          <div className="file-tree-skeleton">
            {Array.from({ length: 8 }).map((_, index) => (
              <div
                className="file-tree-skeleton-row"
                key={`file-tree-skeleton-${index}`}
                style={{ width: `${68 + index * 3}%` }}
              />
            ))}
          </div>
        ) : nodes.length === 0 ? (
          <div className="file-tree-empty">
            {normalizedQuery ? "No matches found." : "No files available."}
          </div>
        ) : (
          nodes.map((node) => renderNode(node, 0))
        )}
      </div>
      {previewPath && previewAnchor
        ? createPortal(
            <FilePreviewPopover
              path={previewPath}
              absolutePath={resolvePath(previewPath)}
              content={previewContent}
              truncated={previewTruncated}
              selection={previewSelection}
              onSelectLine={handleSelectLine}
              onClearSelection={() => setPreviewSelection(null)}
              onAddSelection={handleAddSelection}
              onClose={closePreview}
              style={{
                position: "fixed",
                top: previewAnchor.top,
                left: previewAnchor.left,
                width: 640,
                maxHeight: previewAnchor.height,
                ["--file-preview-arrow-top" as string]: `${previewAnchor.arrowTop}px`,
              }}
              isLoading={previewLoading}
              error={previewError}
            />,
            document.body,
          )
        : null}
    </aside>
  );
}
