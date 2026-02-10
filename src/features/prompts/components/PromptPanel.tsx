import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { CustomPromptOption } from "../../../types";
import { expandCustomPromptText, getPromptArgumentHint } from "../../../utils/customPrompts";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import {
  PanelFrame,
  PanelHeader,
  PanelMeta,
  PanelSearchField,
} from "../../design-system/components/panel/PanelPrimitives";
import { Menu, MenuItem } from "@tauri-apps/api/menu";
import { LogicalPosition } from "@tauri-apps/api/dpi";
import { getCurrentWindow } from "@tauri-apps/api/window";
import MoreHorizontal from "lucide-react/dist/esm/icons/more-horizontal";
import Plus from "lucide-react/dist/esm/icons/plus";
import ScrollText from "lucide-react/dist/esm/icons/scroll-text";
import Search from "lucide-react/dist/esm/icons/search";

type PromptPanelProps = {
  prompts: CustomPromptOption[];
  workspacePath: string | null;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  onSendPrompt: (text: string) => void | Promise<void>;
  onSendPromptToNewAgent: (text: string) => void | Promise<void>;
  onCreatePrompt: (data: {
    scope: "workspace" | "global";
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  }) => void | Promise<void>;
  onUpdatePrompt: (data: {
    path: string;
    name: string;
    description?: string | null;
    argumentHint?: string | null;
    content: string;
  }) => void | Promise<void>;
  onDeletePrompt: (path: string) => void | Promise<void>;
  onMovePrompt: (data: { path: string; scope: "workspace" | "global" }) => void | Promise<void>;
  onRevealWorkspacePrompts: () => void | Promise<void>;
  onRevealGeneralPrompts: () => void | Promise<void>;
  canRevealGeneralPrompts: boolean;
};

const PROMPTS_PREFIX = "prompts:";

type PromptEditorState = {
  mode: "create" | "edit";
  scope: "workspace" | "global";
  name: string;
  description: string;
  argumentHint: string;
  content: string;
  path?: string;
};

function buildPromptCommand(name: string, args: string) {
  const trimmedArgs = args.trim();
  return `/${PROMPTS_PREFIX}${name}${trimmedArgs ? ` ${trimmedArgs}` : ""}`;
}

function isWorkspacePrompt(prompt: CustomPromptOption) {
  return prompt.scope === "workspace";
}

export function PromptPanel({
  prompts,
  workspacePath,
  filePanelMode,
  onFilePanelModeChange,
  onSendPrompt,
  onSendPromptToNewAgent,
  onCreatePrompt,
  onUpdatePrompt,
  onDeletePrompt,
  onMovePrompt,
  onRevealWorkspacePrompts,
  onRevealGeneralPrompts,
  canRevealGeneralPrompts,
}: PromptPanelProps) {
  const [query, setQuery] = useState("");
  const [argsByPrompt, setArgsByPrompt] = useState<Record<string, string>>({});
  const [editor, setEditor] = useState<PromptEditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeletePath, setPendingDeletePath] = useState<string | null>(null);
  const [highlightKey, setHighlightKey] = useState<string | null>(null);
  const highlightTimer = useRef<number | null>(null);
  const normalizedQuery = query.trim().toLowerCase();

  const showError = (error: unknown) => {
    window.alert(error instanceof Error ? error.message : String(error));
  };

  const resetEditorState = () => {
    setEditorError(null);
    setPendingDeletePath(null);
  };

  const updateEditor = (patch: Partial<PromptEditorState>) => {
    setEditor((prev) => (prev ? { ...prev, ...patch } : prev));
  };

  useEffect(() => {
    return () => {
      if (highlightTimer.current) {
        window.clearTimeout(highlightTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!pendingDeletePath) {
      return;
    }
    const stillExists = prompts.some((prompt) => prompt.path === pendingDeletePath);
    if (!stillExists) {
      setPendingDeletePath(null);
    }
  }, [pendingDeletePath, prompts]);

  const triggerHighlight = (key: string) => {
    if (!key) {
      return;
    }
    if (highlightTimer.current) {
      window.clearTimeout(highlightTimer.current);
    }
    setHighlightKey(key);
    highlightTimer.current = window.setTimeout(() => {
      setHighlightKey(null);
    }, 650);
  };

  const buildPromptText = (prompt: CustomPromptOption, args: string) => {
    const command = buildPromptCommand(prompt.name, args);
    const expansion = expandCustomPromptText(command, [prompt]);
    if (expansion && "error" in expansion) {
      showError(expansion.error);
      return null;
    }
    if (expansion && "expanded" in expansion) {
      return expansion.expanded;
    }
    return prompt.content;
  };

  const filteredPrompts = useMemo(() => {
    if (!normalizedQuery) {
      return prompts;
    }
    return prompts.filter((prompt) => {
      const haystack = `${prompt.name} ${prompt.description ?? ""} ${prompt.path}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [normalizedQuery, prompts]);

  const { workspacePrompts, globalPrompts } = useMemo(() => {
    const workspaceEntries: CustomPromptOption[] = [];
    const globalEntries: CustomPromptOption[] = [];
    filteredPrompts.forEach((prompt) => {
      if (isWorkspacePrompt(prompt)) {
        workspaceEntries.push(prompt);
      } else {
        globalEntries.push(prompt);
      }
    });
    return { workspacePrompts: workspaceEntries, globalPrompts: globalEntries };
  }, [filteredPrompts]);

  const totalCount = filteredPrompts.length;
  const hasPrompts = totalCount > 0;

  const handleArgsChange = (key: string, value: string) => {
    setArgsByPrompt((prev) => ({ ...prev, [key]: value }));
  };

  const startCreate = (scope: "workspace" | "global") => {
    resetEditorState();
    setEditor({
      mode: "create",
      scope,
      name: "",
      description: "",
      argumentHint: "",
      content: "",
    });
  };

  const startEdit = (prompt: CustomPromptOption) => {
    const scope = isWorkspacePrompt(prompt) ? "workspace" : "global";
    resetEditorState();
    setEditor({
      mode: "edit",
      scope,
      name: prompt.name,
      description: prompt.description ?? "",
      argumentHint: prompt.argumentHint ?? "",
      content: prompt.content ?? "",
      path: prompt.path,
    });
  };

  const handleSave = async () => {
    if (!editor || isSaving) {
      return;
    }
    const name = editor.name.trim();
    if (!name) {
      setEditorError("Name is required.");
      return;
    }
    if (/\s/.test(name)) {
      setEditorError("Name cannot include whitespace.");
      return;
    }
    setEditorError(null);
    setIsSaving(true);
    const description = editor.description.trim() || null;
    const argumentHint = editor.argumentHint.trim() || null;
    const content = editor.content;
    try {
      if (editor.mode === "create") {
        await onCreatePrompt({
          scope: editor.scope,
          name,
          description,
          argumentHint,
          content,
        });
        triggerHighlight(name);
      } else if (editor.path) {
        await onUpdatePrompt({
          path: editor.path,
          name,
          description,
          argumentHint,
          content,
        });
        triggerHighlight(editor.path ?? name);
      }
      setEditor(null);
    } catch (error) {
      setEditorError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDeleteRequest = (prompt: CustomPromptOption) => {
    if (!prompt.path) {
      return;
    }
    setPendingDeletePath(prompt.path);
  };

  const handleDeleteConfirm = async (prompt: CustomPromptOption) => {
    if (!prompt.path) {
      return;
    }
    try {
      await onDeletePrompt(prompt.path);
      setPendingDeletePath((current) =>
        current === prompt.path ? null : current,
      );
    } catch (error) {
      showError(error);
    }
  };

  const handleMove = async (prompt: CustomPromptOption, scope: "workspace" | "global") => {
    if (!prompt.path) {
      return;
    }
    try {
      await onMovePrompt({ path: prompt.path, scope });
      triggerHighlight(prompt.name);
    } catch (error) {
      showError(error);
    }
  };

  const showPromptMenu = async (
    event: ReactMouseEvent<HTMLButtonElement>,
    prompt: CustomPromptOption,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const scope = isWorkspacePrompt(prompt) ? "workspace" : "global";
    const nextScope = scope === "workspace" ? "global" : "workspace";
    const menu = await Menu.new({
      items: [
        await MenuItem.new({
          text: "编辑",
          action: () => startEdit(prompt),
        }),
        await MenuItem.new({
          text: `Move to ${nextScope === "workspace" ? "workspace" : "general"}`,
          action: () => void handleMove(prompt, nextScope),
        }),
        await MenuItem.new({
          text: "删除",
          action: () => handleDeleteRequest(prompt),
        }),
      ],
    });
    const position = new LogicalPosition(event.clientX, event.clientY);
    const window = getCurrentWindow();
    await menu.popup(position, window);
  };

  const renderPromptRow = (prompt: CustomPromptOption) => {
    const hint = getPromptArgumentHint(prompt);
    const showArgsInput = Boolean(hint);
    const key = prompt.path || prompt.name;
    const argsValue = argsByPrompt[key] ?? "";
    const effectiveArgs = showArgsInput ? argsValue : "";
    const isHighlighted = highlightKey === prompt.path || highlightKey === prompt.name;
    return (
      <div className={`prompt-row${isHighlighted ? " is-highlight" : ""}`} key={key}>
        <div className="prompt-row-header">
          <div className="prompt-name">{prompt.name}</div>
          {prompt.description && (
            <div className="prompt-description">{prompt.description}</div>
          )}
        </div>
        {hint && <div className="prompt-hint">{hint}</div>}
        <div className="prompt-actions">
          {showArgsInput ? (
            <input
              className="prompt-args-input"
              type="text"
              placeholder={hint ?? "Arguments"}
              value={argsValue}
              onChange={(event) => handleArgsChange(key, event.target.value)}
              aria-label={`Arguments for ${prompt.name}`}
            />
          ) : null}
          <button
            type="button"
            className="ghost prompt-action"
            onClick={() => {
              const text = buildPromptText(prompt, effectiveArgs);
              if (!text) {
                return;
              }
              void onSendPrompt(text);
            }}
            title="发送到当前对话"
          >
            Send
          </button>
          <button
            type="button"
            className="ghost prompt-action"
            onClick={() => {
              const text = buildPromptText(prompt, effectiveArgs);
              if (!text) {
                return;
              }
              void onSendPromptToNewAgent(text);
            }}
            title="发送到新对话"
          >
            New agent
          </button>
          <button
            type="button"
            className="ghost icon-button prompt-action-menu"
            onClick={(event) => void showPromptMenu(event, prompt)}
            aria-label="提示词操作"
            title="提示词操作"
          >
            <MoreHorizontal aria-hidden />
          </button>
        </div>
        {pendingDeletePath === prompt.path && (
          <div className="prompt-delete-confirm">
            <span>删除此提示词？</span>
            <button
              type="button"
              className="ghost prompt-action"
              onClick={() => void handleDeleteConfirm(prompt)}
            >
              Delete
            </button>
            <button
              type="button"
              className="ghost prompt-action"
              onClick={() => setPendingDeletePath(null)}
            >
              Cancel
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <PanelFrame className="prompt-panel">
      <PanelHeader className="git-panel-header">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        <PanelMeta className="prompt-panel-meta">
          {hasPrompts ? `${totalCount} 个提示词` : "暂无提示词"}
        </PanelMeta>
      </PanelHeader>
      <PanelSearchField
        className="file-tree-search"
        inputClassName="file-tree-search-input"
        placeholder="筛选提示词"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        aria-label="筛选提示词"
        icon={<Search aria-hidden />}
      />
      <div className="prompt-panel-scroll">
        {editor && (
          <div className="prompt-editor">
            <div className="prompt-editor-row">
              <label className="prompt-editor-label">
                Name
                <input
                  className="prompt-args-input"
                  type="text"
                  value={editor.name}
                  onChange={(event) => updateEditor({ name: event.target.value })}
                  placeholder="提示词名称"
                />
              </label>
              <label className="prompt-editor-label">
                Scope
                <select
                  className="prompt-scope-select"
                  value={editor.scope}
                  onChange={(event) =>
                    updateEditor({
                      scope: event.target.value as PromptEditorState["scope"],
                    })
                  }
                  disabled={editor.mode === "edit"}
                >
                  <option value="workspace">工作区</option>
                  <option value="global">通用</option>
                </select>
              </label>
            </div>
            <div className="prompt-editor-row">
              <label className="prompt-editor-label">
                Description
                <input
                  className="prompt-args-input"
                  type="text"
                  value={editor.description}
                  onChange={(event) => updateEditor({ description: event.target.value })}
                  placeholder="可选描述"
                />
              </label>
              <label className="prompt-editor-label">
                Argument hint
                <input
                  className="prompt-args-input"
                  type="text"
                  value={editor.argumentHint}
                  onChange={(event) => updateEditor({ argumentHint: event.target.value })}
                  placeholder="可选参数提示"
                />
              </label>
            </div>
            <label className="prompt-editor-label">
              Content
              <textarea
                className="prompt-editor-textarea"
                value={editor.content}
                onChange={(event) => updateEditor({ content: event.target.value })}
                placeholder="提示词内容"
                rows={6}
              />
            </label>
            {editorError && <div className="prompt-editor-error">{editorError}</div>}
            <div className="prompt-editor-actions">
              <button
                type="button"
                className="ghost prompt-action"
                onClick={() => setEditor(null)}
                disabled={isSaving}
              >
                Cancel
              </button>
              <button
                type="button"
                className="ghost prompt-action"
                onClick={() => void handleSave()}
                disabled={isSaving}
              >
                {editor.mode === "create" ? "创建" : "保存"}
              </button>
            </div>
          </div>
        )}
        <div className="prompt-section">
          <div className="prompt-section-header">
            <div className="prompt-section-title">工作区提示词</div>
            <button
              type="button"
              className="ghost icon-button prompt-section-add"
              onClick={() => startCreate("workspace")}
              aria-label="添加工作区提示词"
              title="添加工作区提示词"
            >
              <Plus aria-hidden />
            </button>
          </div>
          {workspacePrompts.length > 0 ? (
            <div className="prompt-list">
              {workspacePrompts.map((prompt) => renderPromptRow(prompt))}
            </div>
          ) : (
            <div className="prompt-empty-card">
              <ScrollText className="prompt-empty-icon" aria-hidden />
              <div className="prompt-empty-text">
                <div className="prompt-empty-title">暂无工作区提示词</div>
                <div className="prompt-empty-subtitle">
                  在此创建，或将 .md 文件拖入{" "}
                  {workspacePath ? (
                    <button
                      type="button"
                      className="prompt-empty-link"
                      onClick={() => void onRevealWorkspacePrompts()}
                    >
                      工作区提示词目录
                    </button>
                  ) : (
                    <span className="prompt-empty-link is-disabled">
                      工作区提示词目录
                    </span>
                  )}
                  。
                </div>
              </div>
            </div>
          )}
        </div>
        <div className="prompt-section">
          <div className="prompt-section-header">
            <div className="prompt-section-title">通用提示词</div>
            <button
              type="button"
              className="ghost icon-button prompt-section-add"
              onClick={() => startCreate("global")}
              aria-label="添加通用提示词"
              title="添加通用提示词"
            >
              <Plus aria-hidden />
            </button>
          </div>
          {globalPrompts.length > 0 ? (
            <div className="prompt-list">
              {globalPrompts.map((prompt) => renderPromptRow(prompt))}
            </div>
          ) : (
            <div className="prompt-empty-card">
              <ScrollText className="prompt-empty-icon" aria-hidden />
              <div className="prompt-empty-text">
                <div className="prompt-empty-title">暂无通用提示词</div>
                <div className="prompt-empty-subtitle">
                  在此创建，或将 .md 文件拖入{" "}
                  {canRevealGeneralPrompts ? (
                    <button
                      type="button"
                      className="prompt-empty-link"
                      onClick={() => void onRevealGeneralPrompts()}
                    >
                      CODEX_HOME/prompts
                    </button>
                  ) : (
                    <span className="prompt-empty-link is-disabled">
                      CODEX_HOME/prompts
                    </span>
                  )}
                  。
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </PanelFrame>
  );
}
