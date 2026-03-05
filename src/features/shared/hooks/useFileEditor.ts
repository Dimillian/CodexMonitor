import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { pushErrorToast } from "../../../services/toasts";

export type FileEditorResponse = {
  exists: boolean;
  content: string;
  truncated: boolean;
};

type UseFileEditorOptions = {
  key: string | null;
  read: () => Promise<FileEditorResponse>;
  write: (content: string) => Promise<void>;
  readErrorTitle: string;
  writeErrorTitle: string;
};

type FileEditorState = {
  content: string;
  exists: boolean;
  truncated: boolean;
  isLoading: boolean;
  isSaving: boolean;
  error: string | null;
};

const EMPTY_STATE: FileEditorState = {
  content: "",
  exists: false,
  truncated: false,
  isLoading: false,
  isSaving: false,
  error: null,
};

export function useFileEditor({
  key,
  read,
  write,
  readErrorTitle,
  writeErrorTitle,
}: UseFileEditorOptions) {
  const [state, setState] = useState<FileEditorState>(EMPTY_STATE);
  const lastLoadedContentRef = useRef<string>("");
  const requestIdRef = useRef(0);
  const inFlightRef = useRef(false);
  const latestKeyRef = useRef<string | null>(key);

  useEffect(() => {
    latestKeyRef.current = key;
  }, [key]);

  const refresh = useCallback(async () => {
    if (!latestKeyRef.current) {
      return;
    }
    if (inFlightRef.current) {
      return;
    }
    const keyAtRequest = latestKeyRef.current;
    inFlightRef.current = true;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    setState((prev) => ({ ...prev, isLoading: true, error: null }));
    try {
      const response = await read();
      if (requestId !== requestIdRef.current || keyAtRequest !== latestKeyRef.current) {
        return;
      }
      lastLoadedContentRef.current = response.content;
      setState({
        content: response.content,
        exists: response.exists,
        truncated: response.truncated,
        isLoading: false,
        isSaving: false,
        error: null,
      });
    } catch (error) {
      if (requestId !== requestIdRef.current || keyAtRequest !== latestKeyRef.current) {
        return;
      }
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, isLoading: false, error: message }));
      pushErrorToast({
        title: readErrorTitle,
        message,
      });
    } finally {
      inFlightRef.current = false;
    }
  }, [read, readErrorTitle]);

  const save = useCallback(async () => {
    if (!latestKeyRef.current) {
      return false;
    }
    const keyAtRequest = latestKeyRef.current;
    requestIdRef.current += 1;
    const requestId = requestIdRef.current;
    const content = state.content;
    setState((prev) => ({ ...prev, isSaving: true, error: null }));
    try {
      await write(content);
      if (requestId !== requestIdRef.current || keyAtRequest !== latestKeyRef.current) {
        return false;
      }
      lastLoadedContentRef.current = content;
      setState((prev) => ({
        ...prev,
        exists: true,
        truncated: false,
        isSaving: false,
        error: null,
      }));
      return true;
    } catch (error) {
      if (requestId !== requestIdRef.current || keyAtRequest !== latestKeyRef.current) {
        return false;
      }
      const message = error instanceof Error ? error.message : String(error);
      setState((prev) => ({ ...prev, isSaving: false, error: message }));
      pushErrorToast({
        title: writeErrorTitle,
        message,
      });
      return false;
    }
  }, [state.content, write, writeErrorTitle]);

  const setContent = useCallback((value: string) => {
    setState((prev) => ({ ...prev, content: value }));
  }, []);

  useEffect(() => {
    requestIdRef.current += 1;
    inFlightRef.current = false;
    lastLoadedContentRef.current = "";
    setState(EMPTY_STATE);
    if (!key) {
      return;
    }
    refresh().catch((err) => console.debug("file editor refresh failed", err));
  }, [key, refresh]);

  const isDirty = useMemo(() => state.content !== lastLoadedContentRef.current, [state.content]);

  return {
    ...state,
    isDirty,
    setContent,
    refresh,
    save,
  };
}

