import { describe, expect, it } from "vitest";
import { normalizePlanUpdate, normalizeRootPath } from "./threadNormalize";

describe("normalizePlanUpdate", () => {
  it("normalizes a plan when the payload uses an array", () => {
    expect(
      normalizePlanUpdate("turn-1", " Note ", [{ step: "Do it", status: "in_progress" }]),
    ).toEqual({
      turnId: "turn-1",
      explanation: "Note",
      steps: [{ step: "Do it", status: "inProgress" }],
    });
  });

  it("normalizes a plan when the payload uses an object with steps", () => {
    expect(
      normalizePlanUpdate("turn-2", null, {
        explanation: "Hello",
        steps: [{ step: "Ship it", status: "completed" }],
      }),
    ).toEqual({
      turnId: "turn-2",
      explanation: "Hello",
      steps: [{ step: "Ship it", status: "completed" }],
    });
  });

  it("returns null when there is no explanation or steps", () => {
    expect(normalizePlanUpdate("turn-3", "", { steps: [] })).toBeNull();
  });
});

describe("normalizeRootPath", () => {
  it("preserves significant leading and trailing whitespace", () => {
    expect(normalizeRootPath(" /tmp/repo ")).toBe(" /tmp/repo ");
  });

  it("normalizes Windows drive-letter paths case-insensitively", () => {
    expect(normalizeRootPath("C:\\Dev\\Repo\\")).toBe("c:/dev/repo");
    expect(normalizeRootPath("c:/Dev/Repo")).toBe("c:/dev/repo");
  });

  it("normalizes UNC paths case-insensitively", () => {
    expect(normalizeRootPath("\\\\SERVER\\Share\\Repo\\")).toBe("//server/share/repo");
  });
});
