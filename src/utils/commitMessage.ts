export function shouldApplyCommitMessage(
  activeWorkspaceId: string | null,
  requestWorkspaceId: string,
): boolean {
  return activeWorkspaceId === requestWorkspaceId;
}
