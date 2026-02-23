export type RemoteDirectoryBreadcrumbSegment = {
  label: string;
  path: string;
};

export function buildRemoteDirectoryBreadcrumbs(
  path: string,
): RemoteDirectoryBreadcrumbSegment[] {
  const trimmed = path.trim().replace(/\\/g, "/");
  if (!trimmed) {
    return [];
  }

  const windowsDriveMatch = trimmed.match(/^([A-Za-z]:)\//);
  if (windowsDriveMatch) {
    const drive = windowsDriveMatch[1];
    const rest = trimmed.slice(drive.length + 1);
    const segments: RemoteDirectoryBreadcrumbSegment[] = [
      { label: drive, path: `${drive}/` },
    ];
    let current = drive;
    for (const piece of rest.split("/").filter(Boolean)) {
      current = `${current}/${piece}`;
      segments.push({ label: piece, path: current });
    }
    return segments;
  }

  if (!trimmed.startsWith("/")) {
    return [{ label: trimmed, path: trimmed }];
  }

  const pieces = trimmed.split("/").filter(Boolean);
  const segments: RemoteDirectoryBreadcrumbSegment[] = [{ label: "/", path: "/" }];
  let current = "";
  for (const piece of pieces) {
    current = `${current}/${piece}`;
    segments.push({ label: piece, path: current });
  }
  return segments;
}
