import { describe, expect, it } from "vitest";
import { formatModelSlug, parseModelListResponse } from "./modelListResponse";

describe("formatModelSlug", () => {
  it("capitalizes plain segments", () => {
    expect(formatModelSlug("codex-mini")).toBe("Codex-Mini");
  });

  it("uppercases known acronyms", () => {
    expect(formatModelSlug("gpt-5.3-codex")).toBe("GPT-5.3-Codex");
  });

  it("leaves version-like segments unchanged", () => {
    expect(formatModelSlug("gpt-5.1-codex-max")).toBe("GPT-5.1-Codex-Max");
  });

  it("handles a version-only slug", () => {
    expect(formatModelSlug("gpt-5.2")).toBe("GPT-5.2");
  });
  it("is case-insensitive for acronym detection", () => {
    expect(formatModelSlug("GPT-5.3-codex")).toBe("GPT-5.3-Codex");
    expect(formatModelSlug("Gpt-5.3-codex")).toBe("GPT-5.3-Codex");
  });

  it("returns empty string for non-string input", () => {
    expect(formatModelSlug(null)).toBe("");
    expect(formatModelSlug(undefined)).toBe("");
    expect(formatModelSlug(42)).toBe("");
  });

  it("returns empty string for blank strings", () => {
    expect(formatModelSlug("")).toBe("");
    expect(formatModelSlug("   ")).toBe("");
  });

  it("handles a single segment", () => {
    expect(formatModelSlug("codex")).toBe("Codex");
    expect(formatModelSlug("gpt")).toBe("GPT");
  });
});

describe("parseModelListResponse", () => {
  it("uses displayName when present", () => {
    const response = {
      result: {
        data: [
          { id: "m1", model: "gpt-5.3-codex-spark", displayName: "GPT-5.3-Codex-Spark" },
        ],
      },
    };
    const [model] = parseModelListResponse(response);
    expect(model.displayName).toBe("GPT-5.3-Codex-Spark");
  });

  it("formats the slug when displayName is missing", () => {
    const response = {
      result: {
        data: [{ id: "m1", model: "gpt-5.3-codex" }],
      },
    };
    const [model] = parseModelListResponse(response);
    expect(model.displayName).toBe("GPT-5.3-Codex");
  });

  it("formats the slug when displayName is an empty string", () => {
    const response = {
      result: {
        data: [{ id: "m1", model: "gpt-5.1-codex-mini", displayName: "" }],
      },
    };
    const [model] = parseModelListResponse(response);
    expect(model.displayName).toBe("GPT-5.1-Codex-Mini");
  });

  it("formats the slug when displayName equals the model slug", () => {
    const response = {
      result: {
        data: [{ id: "m1", model: "gpt-5.3-codex", displayName: "gpt-5.3-codex" }],
      },
    };
    const [model] = parseModelListResponse(response);
    expect(model.displayName).toBe("GPT-5.3-Codex");
  });

  it("preserves displayName when it differs from the slug", () => {
    const response = {
      result: {
        data: [
          { id: "m1", model: "gpt-5.3-codex-spark", displayName: "GPT-5.3-Codex-Spark" },
          { id: "m2", model: "gpt-5.2-codex", displayName: "gpt-5.2-codex" },
        ],
      },
    };
    const models = parseModelListResponse(response);
    expect(models[0].displayName).toBe("GPT-5.3-Codex-Spark");
    expect(models[1].displayName).toBe("GPT-5.2-Codex");
  });
});
