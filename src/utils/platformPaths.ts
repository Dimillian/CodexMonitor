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

export function isMobilePlatform(): boolean {
  if (typeof navigator === "undefined") {
    return false;
  }
  const platform =
    (navigator as Navigator & { userAgentData?: { platform?: string } })
      .userAgentData?.platform ?? navigator.platform ?? "";
  const normalizedPlatform = platform.toLowerCase();
  const userAgent = (navigator.userAgent ?? "").toLowerCase();
  const maxTouchPoints =
    typeof (navigator as Navigator).maxTouchPoints === "number"
      ? (navigator as Navigator).maxTouchPoints
      : 0;
  const hasTouch = maxTouchPoints > 0;
  const hasMobileUserAgentToken =
    userAgent.includes("mobile") ||
    userAgent.includes("iphone") ||
    userAgent.includes("ipad") ||
    userAgent.includes("ipod") ||
    userAgent.includes("android");
  const iPadDesktopMode =
    normalizedPlatform.includes("mac") &&
    hasTouch &&
    (hasMobileUserAgentToken || userAgent.includes("like mac os x"));
  return (
    normalizedPlatform.includes("iphone") ||
    normalizedPlatform.includes("ipad") ||
    normalizedPlatform.includes("android") ||
    hasMobileUserAgentToken ||
    iPadDesktopMode
  );
}

export function fileManagerName(): string {
  const platform = platformKind();
  if (platform === "mac") {
    return "Finder";
  }
  if (platform === "windows") {
    return "资源管理器";
  }
  return "文件管理器";
}

export function revealInFileManagerLabel(): string {
  const platform = platformKind();
  if (platform === "mac") {
    return "在 Finder 中显示";
  }
  if (platform === "windows") {
    return "在资源管理器中显示";
  }
  return "在文件管理器中显示";
}

export function openInFileManagerLabel(): string {
  return `在 ${fileManagerName()} 中打开`;
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
