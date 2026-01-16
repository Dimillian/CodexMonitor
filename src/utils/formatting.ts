export function formatDownloadSize(bytes: number | null | undefined) {
  if (!bytes || bytes <= 0) {
    return "0 MB";
  }
  const gb = bytes / (1024 ** 3);
  if (gb >= 1) {
    const digits = gb >= 10 ? 0 : 1;
    return `${gb.toFixed(digits)} GB`;
  }
  const mb = bytes / (1024 ** 2);
  const digits = mb >= 10 ? 0 : 1;
  return `${mb.toFixed(digits)} MB`;
}
