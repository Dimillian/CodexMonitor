export function formatCollaborationModeLabel(value: string) {
  if (!value) {
    return value;
  }
  const trimmed = value.trim();
  if (!trimmed) {
    return value;
  }
  const normalized = trimmed
    .replace(/[_-]+/g, " ")
    .replace(/([a-z])([A-Z])/g, "$1 $2");
  const lower = normalized.toLowerCase().replace(/\s+/g, " ").trim();
  if (lower === "pairprogramming" || lower === "pair programming") {
    return "Pair Programming";
  }
  if (lower === "plan") {
    return "Plan";
  }
  if (lower === "execute") {
    return "Execute";
  }
  if (lower === "custom") {
    return "Custom";
  }
  if (lower === "code") {
    return "Code";
  }
  return normalized
    .split(" ")
    .filter(Boolean)
    .map((word) => `${word[0].toUpperCase()}${word.slice(1)}`)
    .join(" ");
}
