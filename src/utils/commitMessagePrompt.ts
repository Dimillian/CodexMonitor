export const DEFAULT_COMMIT_MESSAGE_PROMPT = `Generate a concise git commit message for the following changes. Follow conventional commit format (e.g., feat:, fix:, refactor:, docs:, etc.). Keep the summary line under 72 characters. Only output the commit message, nothing else.

Changes:
{diff}`;
