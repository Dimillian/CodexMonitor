export const STORAGE_KEY_PENDING_POST_UPDATE_VERSION =
  "codexmonitor.pendingPostUpdateVersion";
const GITHUB_RELEASES_API_BASE =
  "https://api.github.com/repos/Dimillian/CodexMonitor/releases";
const GITHUB_RELEASES_WEB_BASE =
  "https://github.com/Dimillian/CodexMonitor/releases";

type GitHubReleaseResponse = {
  tag_name?: string;
  html_url?: string;
  body?: string | null;
};

export type PostUpdateReleaseInfo = {
  body: string | null;
  htmlUrl: string;
  tag: string | null;
};

function normalizeStoredVersion(value: string): string {
  let normalized = value.trim();
  while (normalized.startsWith("v") || normalized.startsWith("V")) {
    normalized = normalized.slice(1);
  }
  return normalized.trim();
}

export function normalizeReleaseVersion(value: string): string {
  return normalizeStoredVersion(value);
}

export function buildReleaseTagUrl(version: string): string {
  const normalized = normalizeStoredVersion(version);
  const tag = normalized.length > 0 ? `v${normalized}` : "latest";
  return `${GITHUB_RELEASES_WEB_BASE}/tag/${encodeURIComponent(tag)}`;
}

export function savePendingPostUpdateVersion(version: string): void {
  if (typeof window === "undefined") {
    return;
  }
  const normalized = normalizeStoredVersion(version);
  if (!normalized) {
    return;
  }
  try {
    window.localStorage.setItem(
      STORAGE_KEY_PENDING_POST_UPDATE_VERSION,
      normalized,
    );
  } catch {
    // Best-effort persistence.
  }
}

export function loadPendingPostUpdateVersion(): string | null {
  if (typeof window === "undefined") {
    return null;
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION);
    if (!raw) {
      return null;
    }
    const normalized = normalizeStoredVersion(raw);
    return normalized || null;
  } catch {
    return null;
  }
}

export function clearPendingPostUpdateVersion(): void {
  if (typeof window === "undefined") {
    return;
  }
  try {
    window.localStorage.removeItem(STORAGE_KEY_PENDING_POST_UPDATE_VERSION);
  } catch {
    // Best-effort persistence.
  }
}

export async function fetchReleaseNotesForVersion(
  version: string,
): Promise<PostUpdateReleaseInfo> {
  const normalized = normalizeStoredVersion(version);
  if (!normalized) {
    throw new Error("Invalid release version.");
  }

  const candidates = [`v${normalized}`, normalized];
  const seen = new Set<string>();
  for (const candidate of candidates) {
    const tag = candidate.trim();
    if (!tag || seen.has(tag)) {
      continue;
    }
    seen.add(tag);
    const url = `${GITHUB_RELEASES_API_BASE}/tags/${encodeURIComponent(tag)}`;
    const response = await fetch(url, {
      headers: {
        Accept: "application/vnd.github+json",
      },
    });
    if (response.status === 404) {
      continue;
    }
    if (!response.ok) {
      throw new Error(`GitHub releases request failed (${response.status}).`);
    }
    const payload = (await response.json()) as GitHubReleaseResponse;
    const body = payload.body?.trim() ? payload.body : null;
    const htmlUrl =
      payload.html_url && payload.html_url.trim().length > 0
        ? payload.html_url
        : buildReleaseTagUrl(normalized);
    const resultTag =
      payload.tag_name && payload.tag_name.trim().length > 0
        ? payload.tag_name
        : null;
    return {
      body,
      htmlUrl,
      tag: resultTag,
    };
  }

  throw new Error(`Could not find GitHub release for version ${normalized}.`);
}
