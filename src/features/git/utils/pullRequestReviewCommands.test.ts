import { describe, expect, it } from "vitest";
import { parsePullRequestReviewCommand } from "./pullRequestReviewCommands";

describe("parsePullRequestReviewCommand", () => {
  it("returns null for non-review commands", () => {
    expect(parsePullRequestReviewCommand("/apps")).toBeNull();
    expect(parsePullRequestReviewCommand("hello")).toBeNull();
  });

  it("parses /review as full review", () => {
    expect(parsePullRequestReviewCommand("/review")).toEqual({ intent: "full" });
  });

  it("parses specialized review modes", () => {
    expect(parsePullRequestReviewCommand("/review risks")).toEqual({
      intent: "risks",
    });
    expect(parsePullRequestReviewCommand("/review tests focus api")).toEqual({
      intent: "tests",
      question: "focus api",
    });
    expect(parsePullRequestReviewCommand("/review summary")).toEqual({
      intent: "summary",
    });
  });

  it("treats unknown review payload as question intent", () => {
    expect(parsePullRequestReviewCommand("/review why did this break")).toEqual({
      intent: "question",
      question: "why did this break",
    });
  });
});
