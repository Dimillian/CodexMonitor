import { describe, expect, it } from "vitest";
import type { ModelOption } from "@/types";
import { effectiveCommitMessageModelId } from "./commitMessageModelSelection";

const MODELS: ModelOption[] = [
  {
    id: "m-1",
    model: "gpt-5.1",
    displayName: "GPT-5.1",
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: false,
  },
  {
    id: "m-2",
    model: "gpt-5.2",
    displayName: "GPT-5.2",
    description: "",
    supportedReasoningEfforts: [],
    defaultReasoningEffort: null,
    isDefault: true,
  },
];

describe("effectiveCommitMessageModelId", () => {
  it("passes through null when no model is saved", () => {
    expect(effectiveCommitMessageModelId(MODELS, null)).toBeNull();
  });

  it("returns the saved model when it exists in the workspace", () => {
    expect(effectiveCommitMessageModelId(MODELS, "gpt-5.1")).toBe("gpt-5.1");
  });

  it("falls back to null when saved model is unavailable in the workspace", () => {
    expect(effectiveCommitMessageModelId(MODELS, "gpt-4.1")).toBeNull();
  });

  it("falls back to null when no models are available", () => {
    expect(effectiveCommitMessageModelId([], "gpt-5.1")).toBeNull();
  });
});
