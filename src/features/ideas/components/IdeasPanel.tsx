import { useMemo, useState } from "react";
import Lightbulb from "lucide-react/dist/esm/icons/lightbulb";
import Plus from "lucide-react/dist/esm/icons/plus";
import Search from "lucide-react/dist/esm/icons/search";
import type { IdeaEntry } from "../../../types";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";

type IdeasPanelProps = {
  ideas: IdeaEntry[];
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
  onSendIdea: (text: string) => void | Promise<void>;
  onCreateIdea: (title: string, body: string) => void | Promise<void>;
  onUpdateIdea: (id: string, title: string, body: string) => void | Promise<void>;
  onDeleteIdea: (id: string) => void | Promise<void>;
};

type IdeaEditorState = {
  mode: "create" | "edit";
  id?: string;
  title: string;
  body: string;
};

function buildIdeaText(title: string, body: string) {
  const trimmedTitle = title.trim();
  const trimmedBody = body.trim();
  if (trimmedTitle && trimmedBody) {
    return `${trimmedTitle}\n\n${trimmedBody}`;
  }
  return trimmedBody || trimmedTitle;
}

export function IdeasPanel({
  ideas,
  filePanelMode,
  onFilePanelModeChange,
  onSendIdea,
  onCreateIdea,
  onUpdateIdea,
  onDeleteIdea,
}: IdeasPanelProps) {
  const [query, setQuery] = useState("");
  const [editor, setEditor] = useState<IdeaEditorState | null>(null);
  const [editorError, setEditorError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const normalizedQuery = query.trim().toLowerCase();

  const filteredIdeas = useMemo(() => {
    if (!normalizedQuery) {
      return ideas;
    }
    return ideas.filter((idea) => {
      const haystack = `${idea.title} ${idea.body}`.toLowerCase();
      return haystack.includes(normalizedQuery);
    });
  }, [ideas, normalizedQuery]);

  const totalCount = filteredIdeas.length;
  const hasIdeas = totalCount > 0;

  const startCreate = () => {
    setEditorError(null);
    setPendingDeleteId(null);
    setEditor({ mode: "create", title: "", body: "" });
  };

  const startEdit = (idea: IdeaEntry) => {
    setEditorError(null);
    setPendingDeleteId(null);
    setEditor({ mode: "edit", id: idea.id, title: idea.title, body: idea.body });
  };

  const handleSave = async () => {
    if (!editor || isSaving) {
      return;
    }
    const title = editor.title.trim();
    const body = editor.body.trim();
    if (!body) {
      setEditorError("Body is required.");
      return;
    }
    setEditorError(null);
    setIsSaving(true);
    try {
      if (editor.mode === "create") {
        await onCreateIdea(title, body);
      } else if (editor.id) {
        await onUpdateIdea(editor.id, title, body);
      }
      setEditor(null);
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : String(err));
    } finally {
      setIsSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await onDeleteIdea(id);
      if (editor?.id === id) {
        setEditor(null);
      }
    } catch (err) {
      setEditorError(err instanceof Error ? err.message : String(err));
    }
  };

  const renderIdeaRow = (idea: IdeaEntry) => {
    const isPendingDelete = pendingDeleteId === idea.id;
    const displayTitle = idea.title.trim();
    const hasTitle = Boolean(displayTitle);
    return (
      <div className="prompt-row" key={idea.id}>
        <div className="prompt-row-header">
          {hasTitle && <div className="prompt-name">{displayTitle}</div>}
          <div className="idea-body">{idea.body}</div>
        </div>
        <div className="prompt-actions">
          <button
            type="button"
            className="ghost prompt-action"
            onClick={() => {
              const text = buildIdeaText(displayTitle, idea.body);
              if (!text) {
                return;
              }
              void onSendIdea(text);
            }}
            title="Send to current agent"
          >
            Send
          </button>
          <button
            type="button"
            className="ghost prompt-action"
            onClick={() => startEdit(idea)}
            title="Edit idea"
          >
            Edit
          </button>
          <button
            type="button"
            className="ghost prompt-action idea-delete"
            onClick={() => setPendingDeleteId(idea.id)}
            title="Delete idea"
          >
            Delete
          </button>
        </div>
        {isPendingDelete && (
          <div className="prompt-delete-confirm">
            <span>Delete this idea?</span>
            <button
              type="button"
              className="ghost prompt-action"
              onClick={() => setPendingDeleteId(null)}
            >
              Cancel
            </button>
            <button
              type="button"
              className="ghost prompt-action idea-delete"
              onClick={() => void handleDelete(idea.id)}
            >
              Delete
            </button>
          </div>
        )}
      </div>
    );
  };

  return (
    <aside className="diff-panel prompt-panel ideas-panel">
      <div className="git-panel-header">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
        <div className="prompt-panel-meta">
          {hasIdeas ? `${totalCount} idea${totalCount === 1 ? "" : "s"}` : "No ideas"}
        </div>
      </div>
      <div className="file-tree-search">
        <Search className="file-tree-search-icon" aria-hidden />
        <input
          className="file-tree-search-input"
          type="search"
          placeholder="Filter ideas"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          aria-label="Filter ideas"
        />
      </div>
      <div className="prompt-panel-scroll">
        {editor && (
          <div className="prompt-editor">
            <label className="prompt-editor-label">
              Title
              <input
                className="prompt-args-input"
                type="text"
                value={editor.title}
                onChange={(event) =>
                  setEditor((prev) => (prev ? { ...prev, title: event.target.value } : prev))
                }
                placeholder="Idea title (Optional)"
              />
            </label>
            <label className="prompt-editor-label">
              Body
              <textarea
                className="prompt-editor-textarea"
                value={editor.body}
                onChange={(event) =>
                  setEditor((prev) => (prev ? { ...prev, body: event.target.value } : prev))
                }
                placeholder="Idea details"
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
                {editor.mode === "create" ? "Create" : "Save"}
              </button>
            </div>
          </div>
        )}
        <div className="prompt-section">
          <div className="prompt-section-header">
            <div className="prompt-section-title">Workspace ideas</div>
            <button
              type="button"
              className="ghost icon-button prompt-section-add"
              onClick={startCreate}
              aria-label="Add idea"
              title="Add idea"
            >
              <Plus aria-hidden />
            </button>
          </div>
          {filteredIdeas.length > 0 ? (
            <div className="prompt-list">{filteredIdeas.map(renderIdeaRow)}</div>
          ) : (
            <div className="prompt-empty-card">
              <Lightbulb className="prompt-empty-icon" aria-hidden />
              <div className="prompt-empty-text">
                <div className="prompt-empty-title">No ideas yet</div>
                <div className="prompt-empty-subtitle">
                  Capture quick notes for this workspace and send them to Codex.
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </aside>
  );
}
