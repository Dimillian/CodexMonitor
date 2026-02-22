import { describe, expect, it } from "vitest";
import { extractThreadCodexMetadata } from "./threadCodexMetadata";

describe("extractThreadCodexMetadata", () => {
  it("reads model and effort from thread-level fields", () => {
    const metadata = extractThreadCodexMetadata({
      model: "gpt-5-codex",
      reasoning_effort: "high",
    });

    expect(metadata).toEqual({
      modelId: "gpt-5-codex",
      effort: "high",
    });
  });

  it("prefers latest turn metadata over thread-level values", () => {
    const metadata = extractThreadCodexMetadata({
      model: "gpt-4.1",
      turns: [
        {
          items: [{ type: "turnContext", payload: { model: "gpt-5-codex" } }],
        },
      ],
    });

    expect(metadata.modelId).toBe("gpt-5-codex");
  });

  it("reads payload.info fields from turn items", () => {
    const metadata = extractThreadCodexMetadata({
      turns: [
        {
          items: [
            {
              type: "tokenCount",
              payload: {
                info: {
                  model_name: "gpt-5.3-codex",
                  reasoning_effort: "Medium",
                },
              },
            },
          ],
        },
      ],
    });

    expect(metadata).toEqual({
      modelId: "gpt-5.3-codex",
      effort: "medium",
    });
  });

  it("prefers latest turn item metadata over turn-level fallback values", () => {
    const metadata = extractThreadCodexMetadata({
      turns: [
        {
          model: "gpt-5.3-codex",
          reasoning_effort: "medium",
          items: [
            {
              type: "response",
              payload: {
                model: "gpt-5.3-codex",
                settings: {
                  reasoning_effort: "high",
                },
              },
            },
          ],
        },
      ],
    });

    expect(metadata).toEqual({
      modelId: "gpt-5.3-codex",
      effort: "high",
    });
  });

  it("extracts effort from deeply nested payload fields", () => {
    const metadata = extractThreadCodexMetadata({
      turns: [
        {
          items: [
            {
              type: "response",
              payload: {
                info: {
                  model: "gpt-5.3-codex",
                },
                context: {
                  reasoning: {
                    effort: "high",
                  },
                },
              },
            },
          ],
        },
      ],
    });

    expect(metadata).toEqual({
      modelId: "gpt-5.3-codex",
      effort: "high",
    });
  });

  it("prefers latest turn item effort over older item effort values", () => {
    const metadata = extractThreadCodexMetadata({
      model: "gpt-5.3-codex",
      turns: [
        {
          items: [
            {
              type: "tokenCount",
              payload: {
                settings: {
                  reasoning_effort: "medium",
                },
              },
            },
            {
              type: "response",
              payload: {
                settings: {
                  reasoning_effort: "high",
                },
              },
            },
          ],
        },
      ],
    });

    expect(metadata).toEqual({
      modelId: "gpt-5.3-codex",
      effort: "high",
    });
  });

  it("normalizes missing/default effort to null", () => {
    const metadata = extractThreadCodexMetadata({
      modelId: "gpt-5",
      effort: "default",
    });

    expect(metadata).toEqual({
      modelId: "gpt-5",
      effort: null,
    });
  });
});
