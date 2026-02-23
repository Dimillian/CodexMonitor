export function mapRemoteDirectoryError(raw: string): string {
  const separator = raw.indexOf(":");
  if (separator === -1) {
    return raw;
  }

  const code = raw.slice(0, separator).trim();
  const detail = raw.slice(separator + 1).trim();

  if (code === "INVALID_PATH") {
    return detail || "The directory path is invalid.";
  }
  if (code === "NOT_FOUND") {
    return detail || "Directory not found.";
  }
  if (code === "NOT_DIRECTORY") {
    return detail || "The selected path is not a directory.";
  }
  if (code === "PERMISSION_DENIED") {
    return detail || "Permission denied for this directory.";
  }
  if (code === "UNSUPPORTED_TILDE_USER") {
    return detail || "Only ~/ paths are supported for tilde expansion.";
  }

  return detail || raw;
}
