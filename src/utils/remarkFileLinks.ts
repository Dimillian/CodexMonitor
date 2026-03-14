const FILE_LINK_PROTOCOL = "codex-file:";

const POSIX_ABSOLUTE_PATH_PATTERN = /^\/[^\s`"'<>]+(?:\/[^\s`"'<>]+)*\/?$/;
const HOME_PATH_PATTERN = /^~\/[^\s`"'<>]+(?:\/[^\s`"'<>]+)*\/?$/;
const DOT_RELATIVE_PATH_PATTERN = /^\.{1,2}\/[^\s`"'<>]+(?:\/[^\s`"'<>]+)*\/?$/;
const FORWARD_SLASH_RELATIVE_PATH_PATTERN =
  /^(?:[A-Za-z0-9._-]+\/){1,}[A-Za-z0-9._-]+\/?$/;
const WINDOWS_DRIVE_PATH_PATTERN =
  /^[A-Za-z]:[\\/](?:[^\s`"'<>]+(?:[\\/][^\s`"'<>]+)*)?[\\/]?$/;
const WINDOWS_UNC_PATH_PATTERN =
  /^\\\\[^\s\\/`"'<>]+\\[^\s\\/`"'<>]+(?:\\[^\s\\/`"'<>]+)*\\?$/;
const BACKSLASH_RELATIVE_PATH_PATTERN =
  /^(?:[A-Za-z0-9._-]+\\){1,}[A-Za-z0-9._-]+\\?$/;

export function toFileLink(path: string) {
  return `${FILE_LINK_PROTOCOL}${encodeURIComponent(path)}`;
}

export function isLinkableFilePath(value: string) {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return (
    POSIX_ABSOLUTE_PATH_PATTERN.test(trimmed) ||
    HOME_PATH_PATTERN.test(trimmed) ||
    DOT_RELATIVE_PATH_PATTERN.test(trimmed) ||
    FORWARD_SLASH_RELATIVE_PATH_PATTERN.test(trimmed) ||
    WINDOWS_DRIVE_PATH_PATTERN.test(trimmed) ||
    WINDOWS_UNC_PATH_PATTERN.test(trimmed) ||
    BACKSLASH_RELATIVE_PATH_PATTERN.test(trimmed)
  );
}

export function isFileLinkUrl(url: string) {
  return url.startsWith(FILE_LINK_PROTOCOL);
}

export function decodeFileLink(url: string) {
  return decodeURIComponent(url.slice(FILE_LINK_PROTOCOL.length));
}
