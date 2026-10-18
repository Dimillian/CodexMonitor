import { useCallback, useEffect, useRef, useState } from "react";
import type { CodexHomeStatus } from "@/types";
import { getCodexHome, validateCodexHome } from "@services/tauri";

export function useCodexHomeSetting(
  configuredHome: string | null | undefined,
  enabled = true,
) {
  const [draft, setDraft] = useState(configuredHome ?? "");
  const [effectiveHome, setEffectiveHome] = useState<CodexHomeStatus | null>(null);
  const [validatedHome, setValidatedHome] = useState<CodexHomeStatus | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [validating, setValidating] = useState(false);
  const requestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;
    requestRef.current += 1;
    setDraft(configuredHome ?? "");
    setEffectiveHome(null);
    setValidatedHome(null);
    setError(null);
    setValidating(false);
    if (!enabled) return;
    void getCodexHome().then(
      (status) => {
        if (!cancelled) setEffectiveHome(status);
      },
      (failure: unknown) => {
        if (!cancelled) {
          setError(failure instanceof Error ? failure.message : String(failure));
        }
      },
    );
    return () => { cancelled = true; requestRef.current += 1; };
  }, [configuredHome, enabled]);

  const updateDraft = useCallback((value: string) => {
    requestRef.current += 1;
    setDraft(value);
    setValidatedHome(null);
    setError(null);
    setValidating(false);
  }, []);

  const validate = useCallback(async () => {
    if (!enabled) return null;
    const request = ++requestRef.current;
    setValidating(true);
    setValidatedHome(null);
    setError(null);
    try {
      const status = await validateCodexHome(draft.trim() || null);
      if (request !== requestRef.current) return null;
      setValidatedHome(status);
      if ((draft.trim() || null) === (configuredHome ?? null)) setEffectiveHome(status);
      return status;
    } catch (failure) {
      if (request === requestRef.current) {
        setError(failure instanceof Error ? failure.message : String(failure));
      }
      return null;
    } finally {
      if (request === requestRef.current) setValidating(false);
    }
  }, [configuredHome, draft, enabled]);

  return { draft, updateDraft, effectiveHome, validatedHome, error, validating, validate };
}
