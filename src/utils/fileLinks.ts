export type ParsedFileLocation = {
  path: string;
  line: number | null;
  column: number | null;
};

const FILE_LOCATION_SUFFIX_PATTERN = /^(.*?):(\d+)(?::(\d+))?$/;
const FILE_LOCATION_RANGE_SUFFIX_PATTERN = /^(.*?):(\d+)-(\d+)$/;
const FILE_LOCATION_HASH_PATTERN = /^(.*?)#L(\d+)(?:C(\d+))?$/i;

export const FILE_LINK_SUFFIX_SOURCE =
  "(?:(?::\\d+(?::\\d+)?|:\\d+-\\d+)|(?:#L\\d+(?:C\\d+)?))?";

function parsePositiveInteger(value?: string) {
  if (!value) {
    return null;
  }
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
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
};

function encodeFileUrlPathname(pathname: string) {
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
    const [, server, share, rest = ""] = namespaceUncMatch;
    const normalizedRest = rest.replace(/\\/g, "/").replace(/^\/+/, "");
    return {
      host: server,
      pathname: `/${share}${normalizedRest ? `/${normalizedRest}` : ""}`,
    };
  }

  const namespaceDriveMatch = normalizedWindowsPath.match(/^\\\\\?\\([A-Za-z]:)(.*)$/);
  if (namespaceDriveMatch) {
    const [, driveRoot, rest = ""] = namespaceDriveMatch;
    return {
      host: "",
      pathname: `/${driveRoot}${rest.replace(/\\/g, "/")}`,
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
    base = `file://${parts.host}${encodeFileUrlPathname(parts.pathname)}`;
  }
  if (line === null) {
    return base;
  }
  return `${base}#L${line}${column !== null ? `C${column}` : ""}`;
}

export function fromFileUrl(url: string) {
  if (!url.toLowerCase().startsWith("file://")) {
    return null;
  }

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== "file:") {
      return null;
    }

    const decodedPath = decodeURIComponent(parsed.pathname);
    let path = decodedPath;
    if (parsed.host && parsed.host !== "localhost") {
      const normalizedPath = decodedPath.startsWith("/")
        ? decodedPath
        : `/${decodedPath}`;
      path = `//${parsed.host}${normalizedPath}`;
    }
    if (/^\/[A-Za-z]:\//.test(path)) {
      path = path.slice(1);
    }
    const normalizedHash = FILE_LOCATION_HASH_PATTERN.test(parsed.hash)
      ? parsed.hash
      : "";
    return normalizeFileLinkPath(`${path}${normalizedHash}`);
  } catch {
    const manualPath = url.slice("file://".length).trim();
    if (!manualPath) {
      return null;
    }
    try {
      return normalizeFileLinkPath(decodeURIComponent(manualPath));
    } catch {
      return normalizeFileLinkPath(manualPath);
    }
  }
}
