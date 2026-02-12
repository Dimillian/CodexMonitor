import type { WorkspaceInfo } from "@/types";

export type GroupedWorkspaces = Array<{
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
}>;
