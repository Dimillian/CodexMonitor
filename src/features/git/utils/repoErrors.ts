export function isMissingRepo(error: string | null | undefined) {
  if (!error) {
    return false;
  }
  const normalized = error.toLowerCase();
  return (
    normalized.includes("could not find repository") ||
    normalized.includes("not a git repository") ||
    (normalized.includes("repository") && normalized.includes("notfound")) ||
    normalized.includes("repository not found") ||
    normalized.includes("git root not found")
  );
}

export function isGitRootNotFound(error: string | null | undefined) {
  if (!error) {
    return false;
  }
  return error.toLowerCase().includes("git root not found");
}

