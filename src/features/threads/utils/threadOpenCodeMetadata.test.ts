import { describe, expect, it } from "vitest";
import { extractThreadOpenCodeMetadata } from "./threadOpenCodeMetadata";

describe("extractThreadOpenCodeMetadata", () => {
  it("reads model and effort from thread-level fields", () => {
    const metadata = extractThreadOpenCodeMetadata({
      model: "gpt-5-codex",
      reasoning_effort: "high",
    });

    expect(metadata).toEqual({
      modelId: "gpt-5-codex",
      effort: "high",
    });
  });

  it("prefers latest turn metadata over thread-level values", () => {
    const metadata = extractThreadOpenCodeMetadata({
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
    const metadata = extractThreadOpenCodeMetadata({
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

  it("normalizes missing/default effort to null", () => {
    const metadata = extractThreadOpenCodeMetadata({
      modelId: "gpt-5",
      effort: "default",
    });

    expect(metadata).toEqual({
      modelId: "gpt-5",
      effort: null,
    });
  });
});
