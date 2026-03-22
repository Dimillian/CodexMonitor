export type ParsedFileLocation = {
  path: string;
  line: number | null;
  column: number | null;
};

const FILE_LOCATION_SUFFIX_PATTERN = /^(.*?):(\d+)(?::(\d+))?$/;
const FILE_LOCATION_RANGE_SUFFIX_PATTERN = /^(.*?):(\d+)-(\d+)$/;
const FILE_LOCATION_HASH_PATTERN = /^(.*?)#L(\d+)(?:C(\d+))?$/i;
const FILE_URL_LOCATION_HASH_PATTERN = /^#L(\d+)(?:C(\d+))?$/i;

export const FILE_LINK_SUFFIX_SOURCE =
  "(?:(?::\\d+(?::\\d+)?|:\\d+-\\d+)|(?:#L\\d+(?:C\\d+)?))?";

function parsePositiveInteger(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function decodeURIComponentSafely(value: string) {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function parseRecognizedFileUrlHash(hash: string) {
  const match = hash.match(FILE_URL_LOCATION_HASH_PATTERN);
  if (!match) {
    return {
      line: null,
      column: null,
    };
  }

  const [, lineValue, columnValue] = match;
  const line = parsePositiveInteger(lineValue);
  return {
    line,
    column: line === null ? null : parsePositiveInteger(columnValue),
  };
}

function buildLocalPathFromFileUrl(host: string, pathname: string) {
  const decodedPath = decodeURIComponentSafely(pathname);
  if (/^\/(?:\\\\|\/\/)[?.][\\/]/.test(decodedPath)) {
    return decodedPath.slice(1);
  }
  let path = decodedPath;
  if (host && host !== "localhost") {
    const normalizedPath = decodedPath.startsWith("/") ? decodedPath : `/${decodedPath}`;
    path = `//${host}${normalizedPath}`;
  }
  if (/^\/[A-Za-z]:\//.test(path)) {
    path = path.slice(1);
  }
  return path;
}

function parseManualFileUrl(url: string) {
  const manualPath = url.slice("file://".length).trim();
  if (!manualPath) {
    return null;
  }

  const hashIndex = manualPath.indexOf("#");
  const hash = hashIndex === -1 ? "" : manualPath.slice(hashIndex);
  const pathWithHost = hashIndex === -1 ? manualPath : manualPath.slice(0, hashIndex);
  if (!pathWithHost) {
    return null;
  }

  if (pathWithHost.startsWith("/")) {
    return {
      host: "",
      pathname: pathWithHost,
      hash,
    };
  }

  const slashIndex = pathWithHost.indexOf("/");
  if (slashIndex === -1) {
    if (/^[A-Za-z]:$/.test(pathWithHost)) {
      return {
        host: "",
        pathname: `/${pathWithHost}`,
        hash,
      };
    }
    return {
      host: pathWithHost,
      pathname: "",
      hash,
    };
  }

  const host = pathWithHost.slice(0, slashIndex);
  const pathname = pathWithHost.slice(slashIndex);
  if (/^[A-Za-z]:$/.test(host)) {
    return {
      host: "",
      pathname: `/${host}${pathname}`,
      hash,
    };
  }

  return {
    host,
    pathname,
    hash,
  };
}

export function parseFileLocation(rawPath: string): ParsedFileLocation {
  const trimmed = rawPath.trim();
  const hashMatch = trimmed.match(FILE_LOCATION_HASH_PATTERN);
  if (hashMatch) {
    const [, path, lineValue, columnValue] = hashMatch;
    const line = parsePositiveInteger(lineValue);
    if (line !== null) {
      return {
        path,
        line,
        column: parsePositiveInteger(columnValue),
      };
    }
  }

  const match = trimmed.match(FILE_LOCATION_SUFFIX_PATTERN);
  if (match) {
    const [, path, lineValue, columnValue] = match;
    const line = parsePositiveInteger(lineValue);
    if (line !== null) {
      return {
        path,
        line,
        column: parsePositiveInteger(columnValue),
      };
    }
  }

  const rangeMatch = trimmed.match(FILE_LOCATION_RANGE_SUFFIX_PATTERN);
  if (rangeMatch) {
    const [, path, startLineValue] = rangeMatch;
    const startLine = parsePositiveInteger(startLineValue);
    if (startLine !== null) {
      return {
        path,
        line: startLine,
        column: null,
      };
    }
  }

  return {
    path: trimmed,
    line: null,
    column: null,
  };
}

export function formatFileLocation(
  path: string,
  line: number | null,
  column: number | null,
) {
  if (line === null) {
    return path.trim();
  }
  return `${path.trim()}:${line}${column !== null ? `:${column}` : ""}`;
}

export function normalizeFileLinkPath(rawPath: string) {
  const parsed = parseFileLocation(rawPath);
  return formatFileLocation(parsed.path, parsed.line, parsed.column);
}

type FileUrlParts = {
  host: string;
  pathname: string;
  treatPathnameAsOpaque?: boolean;
};

function encodeFileUrlPathname(pathname: string, treatPathnameAsOpaque = false) {
  if (treatPathnameAsOpaque) {
    return pathname
      .split("/")
      .map((segment) => encodeURIComponent(segment))
      .join("/");
  }
  return pathname
    .split("/")
    .map((segment, index) => {
      if (index === 1 && /^[A-Za-z]:$/.test(segment)) {
        return segment;
      }
      return encodeURIComponent(segment);
    })
    .join("/");
}

function toFileUrlParts(path: string): FileUrlParts | null {
  const normalizedWindowsPath = path.replace(/\//g, "\\");
  const namespaceUncMatch = normalizedWindowsPath.match(
    /^\\\\\?\\UNC\\([^\\]+)\\([^\\]+)(.*)$/i,
  );
  if (namespaceUncMatch) {
    return {
      host: "",
      pathname: `/${normalizedWindowsPath}`,
      treatPathnameAsOpaque: true,
    };
  }

  const namespaceDriveMatch = normalizedWindowsPath.match(/^\\\\\?\\([A-Za-z]:)(.*)$/);
  if (namespaceDriveMatch) {
    return {
      host: "",
      pathname: `/${normalizedWindowsPath}`,
      treatPathnameAsOpaque: true,
    };
  }

  const uncMatch = normalizedWindowsPath.match(/^\\\\([^\\]+)\\([^\\]+)(.*)$/);
  if (uncMatch) {
    const [, server, share, rest = ""] = uncMatch;
    const normalizedRest = rest.replace(/\\/g, "/").replace(/^\/+/, "");
    return {
      host: server,
      pathname: `/${share}${normalizedRest ? `/${normalizedRest}` : ""}`,
    };
  }

  if (/^[A-Za-z]:[\\/]/.test(path)) {
    return {
      host: "",
      pathname: `/${path.replace(/\\/g, "/")}`,
    };
  }

  if (path.startsWith("/")) {
    return {
      host: "",
      pathname: path,
    };
  }

  return null;
}

export function toFileUrl(path: string, line: number | null, column: number | null) {
  const parts = toFileUrlParts(path);
  let base = path;
  if (parts) {
    base = `file://${parts.host}${encodeFileUrlPathname(
      parts.pathname,
      parts.treatPathnameAsOpaque,
    )}`;
  }
  if (line === null) {
    return base;
  }
  return `${base}#L${line}${column !== null ? `C${column}` : ""}`;
}

export function parseFileUrlLocation(url: string): ParsedFileLocation | null {
  if (!url.toLowerCase().startsWith("file://")) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") {
      return null;
    }

    const path = buildLocalPathFromFileUrl(parsed.host, parsed.pathname);
    const { line, column } = parseRecognizedFileUrlHash(parsed.hash);
    return { path, line, column };
  } catch {
    const manualParts = parseManualFileUrl(url);
    if (!manualParts) {
      return null;
    }
    const path = buildLocalPathFromFileUrl(manualParts.host, manualParts.pathname);
    const { line, column } = parseRecognizedFileUrlHash(manualParts.hash);
    return { path, line, column };
  }
}
