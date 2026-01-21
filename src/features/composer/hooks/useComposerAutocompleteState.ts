import { useCallback, useMemo } from "react";
import type { AutocompleteItem } from "./useComposerAutocomplete";
import { useComposerAutocomplete } from "./useComposerAutocomplete";
import type { CustomPromptOption } from "../../../types";
import {
  buildPromptInsertText,
  findNextPromptArgCursor,
  findPromptArgRangeAtCursor,
  getPromptArgumentHint,
} from "../../../utils/customPrompts";
import { isComposingEvent } from "../../../utils/keys";

type Skill = { name: string; description?: string };
type UseComposerAutocompleteStateArgs = {
  text: string;
  selectionStart: number | null;
  disabled: boolean;
  skills: Skill[];
  prompts: CustomPromptOption[];
  files: string[];
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  setText: (next: string) => void;
  setSelectionStart: (next: number | null) => void;
};

const MAX_FILE_SUGGESTIONS = 500;
const FILE_TRIGGER_PREFIX = new RegExp("^(?:\\s|[\"'`]|\\(|\\[|\\{)$");

function textIncludesFile(text: string, path: string) {
  if (!text || !path) {
    return false;
  }
  const escaped = path.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(
    "(^|\\s|[\"'`]|\\(|\\[|\\{|@)" +
      escaped +
      "(?=$|\\s|[\"'`]|\\)|\\]|\\}|\\.|,|:|;|!|\\?)",
  );
  return pattern.test(text);
}

function isFileTriggerActive(text: string, cursor: number | null) {
  if (!text || cursor === null) {
    return false;
  }
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) {
    return false;
  }
  const prevChar = atIndex > 0 ? beforeCursor[atIndex - 1] : "";
  if (prevChar && !FILE_TRIGGER_PREFIX.test(prevChar)) {
    return false;
  }
  const afterAt = beforeCursor.slice(atIndex + 1);
  return afterAt.length === 0 || !/\s/.test(afterAt);
}

function getFileTriggerQuery(text: string, cursor: number | null) {
  if (!text || cursor === null) {
    return null;
  }
  const beforeCursor = text.slice(0, cursor);
  const atIndex = beforeCursor.lastIndexOf("@");
  if (atIndex < 0) {
    return null;
  }
  const prevChar = atIndex > 0 ? beforeCursor[atIndex - 1] : "";
  if (prevChar && !FILE_TRIGGER_PREFIX.test(prevChar)) {
    return null;
  }
  const afterAt = beforeCursor.slice(atIndex + 1);
  if (/\s/.test(afterAt)) {
    return null;
  }
  return afterAt;
}

export function useComposerAutocompleteState({
  text,
  selectionStart,
  disabled,
  skills,
  prompts,
  files,
  textareaRef,
  setText,
  setSelectionStart,
}: UseComposerAutocompleteStateArgs) {
  const skillItems = useMemo<AutocompleteItem[]>(
    () =>
      skills.map((skill) => ({
        id: skill.name,
        label: skill.name,
        description: skill.description,
        insertText: skill.name,
      })),
    [skills],
  );

  const fileItems = useMemo<AutocompleteItem[]>(
    () =>
      isFileTriggerActive(text, selectionStart)
        ? (() => {
            const query = getFileTriggerQuery(text, selectionStart) ?? "";
            const candidates = files.filter(
              (path) => !textIncludesFile(text, path),
            );
            const limited = query
              ? candidates
              : candidates.slice(0, MAX_FILE_SUGGESTIONS);
            return limited.map((path) => ({
              id: path,
              label: path,
              insertText: path,
            }));
          })()
        : [],
    [files, selectionStart, text],
  );

  const promptItems = useMemo<AutocompleteItem[]>(
    () =>
      prompts
        .filter((prompt) => prompt.name)
        .map((prompt) => {
          const insert = buildPromptInsertText(prompt);
          return {
            id: `prompt:${prompt.name}`,
            label: `prompts:${prompt.name}`,
            description: prompt.description,
            hint: getPromptArgumentHint(prompt),
            insertText: insert.text,
            cursorOffset: insert.cursorOffset,
          };
        }),
    [prompts],
  );

  const reviewItems = useMemo<AutocompleteItem[]>(
    () => [
      {
        id: "review",
        label: "review",
        description: "review uncommitted changes",
        insertText: "review",
      },
      {
        id: "review-base",
        label: "review base main",
        description: "review against main",
        insertText: "review base main",
      },
      {
        id: "review-base-other",
        label: "review base",
        description: "review against another base branch",
        insertText: "review base ",
      },
      {
        id: "review-commit",
        label: "review commit",
        description: "review a specific commit",
        insertText: "review commit",
      },
    ],
    [],
  );

  const slashItems = useMemo<AutocompleteItem[]>(
    () => [...reviewItems, ...promptItems],
    [promptItems, reviewItems],
  );

  const triggers = useMemo(
    () => [
      { trigger: "/", items: slashItems },
      { trigger: "$", items: skillItems },
      { trigger: "@", items: fileItems },
    ],
    [fileItems, skillItems, slashItems],
  );

  const {
    active: isAutocompleteOpen,
    matches: autocompleteMatches,
    highlightIndex,
    setHighlightIndex,
    moveHighlight,
    range: autocompleteRange,
    close: closeAutocomplete,
  } = useComposerAutocomplete({
    text,
    selectionStart,
    triggers,
  });

  const applyAutocomplete = useCallback(
    (item: AutocompleteItem) => {
      if (!autocompleteRange) {
        return;
      }
      const triggerIndex = Math.max(0, autocompleteRange.start - 1);
      const triggerChar = text[triggerIndex] ?? "";
      const cursor = selectionStart ?? autocompleteRange.end;
      const promptRange =
        triggerChar === "@" ? findPromptArgRangeAtCursor(text, cursor) : null;
      const before =
        triggerChar === "@"
          ? text.slice(0, triggerIndex)
          : text.slice(0, autocompleteRange.start);
      const after = text.slice(autocompleteRange.end);
      const insert = item.insertText ?? item.label;
      const actualInsert = triggerChar === "@"
        ? insert.replace(/^@+/, "")
        : insert;
      const needsSpace = promptRange
        ? false
        : after.length === 0
          ? true
          : !/^\s/.test(after);
      const nextText = `${before}${actualInsert}${needsSpace ? " " : ""}${after}`;
      setText(nextText);
      closeAutocomplete();
      requestAnimationFrame(() => {
        const textarea = textareaRef.current;
        if (!textarea) {
          return;
        }
        const insertCursor = Math.min(
          actualInsert.length,
          Math.max(0, item.cursorOffset ?? actualInsert.length),
        );
        const cursor =
          before.length +
          insertCursor +
          (item.cursorOffset === undefined ? (needsSpace ? 1 : 0) : 0);
        textarea.focus();
        textarea.setSelectionRange(cursor, cursor);
        setSelectionStart(cursor);
      });
    },
    [
      autocompleteRange,
      closeAutocomplete,
      selectionStart,
      setSelectionStart,
      setText,
      text,
      textareaRef,
    ],
  );

  const handleTextChange = useCallback(
    (next: string, cursor: number | null) => {
      setText(next);
      setSelectionStart(cursor);
    },
    [setSelectionStart, setText],
  );

  const handleSelectionChange = useCallback(
    (cursor: number | null) => {
      setSelectionStart(cursor);
    },
    [setSelectionStart],
  );

  const handleInputKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (disabled) {
        return;
      }
      if (isComposingEvent(event)) {
        return;
      }
      if (isAutocompleteOpen) {
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveHighlight(1);
          return;
        }
        if (event.key === "ArrowUp") {
          event.preventDefault();
          moveHighlight(-1);
          return;
        }
        if (event.key === "Enter" && !event.shiftKey) {
          event.preventDefault();
          const selected =
            autocompleteMatches[highlightIndex] ?? autocompleteMatches[0];
          if (selected) {
            applyAutocomplete(selected);
          }
          return;
        }
        if (event.key === "Tab") {
          event.preventDefault();
          const selected =
            autocompleteMatches[highlightIndex] ?? autocompleteMatches[0];
          if (selected) {
            applyAutocomplete(selected);
          }
          return;
        }
        if (event.key === "Escape") {
          event.preventDefault();
          closeAutocomplete();
          return;
        }
      }
      if (event.key === "Tab") {
        const cursor = selectionStart ?? text.length;
        const nextCursor = findNextPromptArgCursor(text, cursor);
        if (nextCursor !== null) {
          event.preventDefault();
          requestAnimationFrame(() => {
            const textarea = textareaRef.current;
            if (!textarea) {
              return;
            }
            textarea.focus();
            textarea.setSelectionRange(nextCursor, nextCursor);
            setSelectionStart(nextCursor);
          });
        }
      }
    },
    [
      applyAutocomplete,
      autocompleteMatches,
      closeAutocomplete,
      disabled,
      highlightIndex,
      isAutocompleteOpen,
      moveHighlight,
      selectionStart,
      setSelectionStart,
      text,
      textareaRef,
    ],
  );

  return {
    isAutocompleteOpen,
    autocompleteMatches,
    highlightIndex,
    setHighlightIndex,
    applyAutocomplete,
    handleInputKeyDown,
    handleTextChange,
    handleSelectionChange,
  };
}
