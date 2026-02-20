import { useCallback, useEffect, useRef, useState } from "react";
import type { ConversationItem, ModelOption } from "../../../types";
import { predictResponse } from "../../../services/tauri";

type PredictionState = "idle" | "loading" | "ready" | "dismissed";

type UsePredictedResponseOptions = {
  workspaceId: string | null;
  threadId: string | null;
  composerText: string;
  disabled: boolean;
  isProcessing: boolean;
  items: ConversationItem[];
  models: ModelOption[];
};

function pickFastModelId(models: ModelOption[]): string | undefined {
  const keywords = ["spark", "mini"] as const;
  for (const keyword of keywords) {
    for (let i = models.length - 1; i >= 0; i--) {
      const m = models[i];
      const haystack = `${m.model} ${m.displayName}`.toLowerCase();
      if (haystack.includes(keyword)) {
        return m.id;
      }
    }
  }
  return undefined;
}

type UsePredictedResponseResult = {
  ghostText: string | null;
  acceptPrediction: () => string | null;
  dismissPrediction: () => void;
};

function lastParagraph(text: string): string {
  const paragraphs = text.split(/\n\s*\n/).filter((p) => p.trim());
  return paragraphs.length ? paragraphs[paragraphs.length - 1].trim() : text.trim();
}

function buildContextFromItems(items: ConversationItem[]): string {
  const recent = items.slice(-5);
  return recent
    .map((item) => {
      if (item.kind === "message") {
        const role = item.role === "user" ? "User" : "Assistant";
        return `${role}: ${lastParagraph(item.text)}`;
      }
      if (item.kind === "diff") {
        return `Assistant: [Applied changes to ${item.title}]`;
      }
      if (item.kind === "tool") {
        return `Assistant: [Used tool: ${item.toolType}]`;
      }
      return null;
    })
    .filter(Boolean)
    .join("\n\n");
}

export function usePredictedResponse({
  workspaceId,
  threadId,
  composerText,
  disabled,
  isProcessing,
  items,
  models,
}: UsePredictedResponseOptions): UsePredictedResponseResult {
  const [state, setState] = useState<PredictionState>("idle");
  const [prediction, setPrediction] = useState<string | null>(null);
  const requestCounterRef = useRef(0);
  const wasProcessingRef = useRef(false);

  // Reset on thread or workspace change
  useEffect(() => {
    setState("idle");
    setPrediction(null);
    requestCounterRef.current += 1;
    wasProcessingRef.current = false;
  }, [threadId, workspaceId]);

  // Disabling predictions should immediately clear any in-flight or ready suggestion state.
  useEffect(() => {
    if (!disabled) {
      return;
    }
    requestCounterRef.current += 1;
    setState("idle");
    setPrediction(null);
  }, [disabled]);

  // Track isProcessing transitions: true → false triggers prediction
  useEffect(() => {
    const wasProcessing = wasProcessingRef.current;
    wasProcessingRef.current = isProcessing;

    if (!wasProcessing || isProcessing) {
      return;
    }

    // Turn just completed
    if (
      disabled ||
      composerText.length > 0 ||
      !workspaceId ||
      !threadId ||
      items.length === 0
    ) {
      return;
    }

    const context = buildContextFromItems(items);
    if (!context.trim()) {
      return;
    }

    const currentRequest = ++requestCounterRef.current;
    setState("loading");
    setPrediction(null);

    const fastModel = pickFastModelId(models);
    predictResponse(workspaceId, context, fastModel).then(
      (result) => {
        if (requestCounterRef.current !== currentRequest) {
          return;
        }
        const trimmed = result.trim();
        if (trimmed && trimmed.toUpperCase() !== "NONE") {
          setPrediction(trimmed);
          setState("ready");
        } else {
          setState("idle");
        }
      },
      () => {
        if (requestCounterRef.current !== currentRequest) {
          return;
        }
        setState("idle");
      },
    );
  }, [isProcessing, disabled, composerText, workspaceId, threadId, items, models]);

  // Dismiss when user starts typing
  useEffect(() => {
    if (composerText.length > 0 && (state === "ready" || state === "loading")) {
      requestCounterRef.current += 1;
      setState("dismissed");
      setPrediction(null);
    }
  }, [composerText, state]);

  const ghostText =
    state === "ready" && prediction && composerText.length === 0
      ? prediction
      : null;

  const acceptPrediction = useCallback((): string | null => {
    if (state !== "ready" || !prediction) {
      return null;
    }
    setState("dismissed");
    const accepted = prediction;
    setPrediction(null);
    return accepted;
  }, [state, prediction]);

  const dismissPrediction = useCallback(() => {
    if (state === "ready" || state === "loading") {
      requestCounterRef.current += 1;
      setState("dismissed");
      setPrediction(null);
    }
  }, [state]);

  return { ghostText, acceptPrediction, dismissPrediction };
}
