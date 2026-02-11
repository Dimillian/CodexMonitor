export function validateBranchName(name: string): string | null {
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return null;
  }
  if (trimmed === "." || trimmed === "..") {
    return "Branch name cannot be '.' or '..'.";
  }
  if (/\s/.test(trimmed)) {
    return "Branch name cannot contain spaces.";
  }
  if (trimmed.startsWith("/") || trimmed.endsWith("/")) {
    return "Branch name cannot start or end with '/'.";
  }
  if (trimmed.includes("//")) {
    return "Branch name cannot contain '//'.";
  }
  if (trimmed.endsWith(".lock")) {
    return "Branch name cannot end with '.lock'.";
  }
  if (trimmed.includes("..")) {
    return "Branch name cannot contain '..'.";
  }
  if (trimmed.includes("@{")) {
    return "Branch name cannot contain '@{'.";
  }
  const invalidChars = ["~", "^", ":", "?", "*", "[", "\\"];
  if (invalidChars.some((char) => trimmed.includes(char))) {
    return "Branch name contains invalid characters.";
  }
  if (trimmed.endsWith(".")) {
    return "Branch name cannot end with '.'.";
  }
  return null;
}
