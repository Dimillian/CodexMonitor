import { describe, expect, it } from "vitest";
import type { ModelOption } from "@/types";
import { resolveCommitMessageModelSelection } from "./commitMessageModelSelection";

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

describe("resolveCommitMessageModelSelection", () => {
  it("keeps null selection unchanged", () => {
    expect(resolveCommitMessageModelSelection(MODELS, null)).toEqual({
      resolvedModelId: null,
      normalizedModelId: null,
      shouldNormalize: false,
    });
  });

  it("keeps explicit selection when it still exists", () => {
    expect(resolveCommitMessageModelSelection(MODELS, "gpt-5.1")).toEqual({
      resolvedModelId: "gpt-5.1",
      normalizedModelId: "gpt-5.1",
      shouldNormalize: false,
    });
  });

  it("falls back to the default model when selected model disappears", () => {
    expect(resolveCommitMessageModelSelection(MODELS, "gpt-4.1")).toEqual({
      resolvedModelId: "gpt-5.2",
      normalizedModelId: "gpt-5.2",
      shouldNormalize: true,
    });
  });

  it("falls back to first model when no default exists", () => {
    const noDefault = MODELS.map((model) => ({ ...model, isDefault: false }));
    expect(resolveCommitMessageModelSelection(noDefault, "gpt-4.1")).toEqual({
      resolvedModelId: "gpt-5.1",
      normalizedModelId: "gpt-5.1",
      shouldNormalize: true,
    });
  });

  it("normalizes to null when no models are available", () => {
    expect(resolveCommitMessageModelSelection([], "gpt-4.1")).toEqual({
      resolvedModelId: null,
      normalizedModelId: null,
      shouldNormalize: true,
    });
  });
});
