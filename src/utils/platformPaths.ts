type PlatformKind = "mac" | "windows" | "linux" | "unknown";

function platformKind(): PlatformKind {
  if (typeof navigator === "undefined") {
    return "unknown";
  }
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? "";
  const normalized = platform.toLowerCase();
  if (normalized.includes("mac")) {
    return "mac";
  }
  if (normalized.includes("win")) {
    return "windows";
  }
  if (normalized.includes("linux")) {
    return "linux";
  }
  return "unknown";
}

export function isMacPlatform(): boolean {
  return platformKind() === "mac";
}

export function isWindowsPlatform(): boolean {
  return platformKind() === "windows";
}

export function fileManagerName(): string {
  const platform = platformKind();
  if (platform === "mac") {
    return "Finder";
  }
  if (platform === "windows") {
    return "Explorer";
  }
  return "File Manager";
}

export function revealInFileManagerLabel(): string {
  const platform = platformKind();
  if (platform === "mac") {
    return "Reveal in Finder";
  }
  if (platform === "windows") {
    return "Show in Explorer";
  }
  return "Reveal in File Manager";
}

export function openInFileManagerLabel(): string {
  return `Open in ${fileManagerName()}`;
}

function looksLikeWindowsAbsolutePath(value: string): boolean {
  if (/^[A-Za-z]:[\\/]/.test(value)) {
    return true;
  }
  if (value.startsWith("\\\\") || value.startsWith("//")) {
    return true;
  }
  if (value.startsWith("\\\\?\\")) {
    return true;
  }
  return false;
}

export function isAbsolutePath(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  if (trimmed.startsWith("/") || trimmed.startsWith("~/") || trimmed.startsWith("~\\")) {
    return true;
  }
  return looksLikeWindowsAbsolutePath(trimmed);
}

function stripTrailingSeparators(value: string) {
  return value.replace(/[\\/]+$/, "");
}

function stripLeadingSeparators(value: string) {
  return value.replace(/^[\\/]+/, "");
}

function looksLikeWindowsPathPrefix(value: string): boolean {
  const trimmed = value.trim();
  return looksLikeWindowsAbsolutePath(trimmed) || trimmed.includes("\\");
}

export function joinWorkspacePath(base: string, path: string): string {
  const trimmedBase = base.trim();
  const trimmedPath = path.trim();
  if (!trimmedBase) {
    return trimmedPath;
  }
  if (!trimmedPath || isAbsolutePath(trimmedPath)) {
    return trimmedPath;
  }

  const isWindows = looksLikeWindowsPathPrefix(trimmedBase);
  const baseWithoutTrailing = stripTrailingSeparators(trimmedBase);
  const pathWithoutLeading = stripLeadingSeparators(trimmedPath);
  if (isWindows) {
    const normalizedRelative = pathWithoutLeading.replace(/\//g, "\\");
    return `${baseWithoutTrailing}\\${normalizedRelative}`;
  }
  const normalizedRelative = pathWithoutLeading.replace(/\\/g, "/");
  return `${baseWithoutTrailing}/${normalizedRelative}`;
}
