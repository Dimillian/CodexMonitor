import type { PullRequestReviewIntent } from "../../../types";

export type PullRequestReviewCommand =
  | { intent: PullRequestReviewIntent; question?: string }
  | null;

export function parsePullRequestReviewCommand(input: string): PullRequestReviewCommand {
  const trimmed = input.trim();
  if (!/^\/review\b/i.test(trimmed)) {
    return null;
  }
  const rest = trimmed.replace(/^\/review\b/i, "").trim();
  if (!rest) {
    return { intent: "full" };
  }

  const match = /^(\S+)(?:\s+(.*))?$/i.exec(rest);
  const keyword = (match?.[1] ?? "").toLowerCase();
  const details = (match?.[2] ?? "").trim();

  if (keyword === "risks") {
    return { intent: "risks", ...(details ? { question: details } : {}) };
  }
  if (keyword === "tests" || keyword === "test") {
    return { intent: "tests", ...(details ? { question: details } : {}) };
  }
  if (keyword === "summary" || keyword === "summarize") {
    return { intent: "summary", ...(details ? { question: details } : {}) };
  }
  if (keyword === "full") {
    return { intent: "full", ...(details ? { question: details } : {}) };
  }

  return { intent: "question", question: rest };
}
