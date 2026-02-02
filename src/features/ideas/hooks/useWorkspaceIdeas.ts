import { useCallback, useMemo } from "react";
import type { IdeaEntry, WorkspaceInfo, WorkspaceSettings } from "../../../types";

const createIdeaId = () => `${Date.now()}-${Math.random().toString(16).slice(2)}`;

export type WorkspaceIdeasState = {
  ideas: IdeaEntry[];
  createIdea: (title: string, body: string) => Promise<void>;
  updateIdea: (id: string, title: string, body: string) => Promise<void>;
  deleteIdea: (id: string) => Promise<void>;
};

type UseWorkspaceIdeasOptions = {
  activeWorkspace: WorkspaceInfo | null;
  updateWorkspaceSettings: (
    id: string,
    settings: Partial<WorkspaceSettings>,
  ) => Promise<WorkspaceInfo>;
};

export function useWorkspaceIdeas({
  activeWorkspace,
  updateWorkspaceSettings,
}: UseWorkspaceIdeasOptions): WorkspaceIdeasState {
  const ideas = useMemo(() => activeWorkspace?.settings.ideas ?? [], [activeWorkspace?.settings]);

  const persistIdeas = useCallback(
    async (nextIdeas: IdeaEntry[]) => {
      if (!activeWorkspace) {
        return;
      }
      await updateWorkspaceSettings(activeWorkspace.id, {
        ideas: nextIdeas,
      });
    },
    [activeWorkspace, updateWorkspaceSettings],
  );

  const createIdea = useCallback(
    async (title: string, body: string) => {
      const nextIdeas = [
        ...ideas,
        {
          id: createIdeaId(),
          title,
          body,
        },
      ];
      await persistIdeas(nextIdeas);
    },
    [ideas, persistIdeas],
  );

  const updateIdea = useCallback(
    async (id: string, title: string, body: string) => {
      const nextIdeas = ideas.map((idea) =>
        idea.id === id ? { ...idea, title, body } : idea,
      );
      await persistIdeas(nextIdeas);
    },
    [ideas, persistIdeas],
  );

  const deleteIdea = useCallback(
    async (id: string) => {
      const nextIdeas = ideas.filter((idea) => idea.id !== id);
      await persistIdeas(nextIdeas);
    },
    [ideas, persistIdeas],
  );

  return {
    ideas,
    createIdea,
    updateIdea,
    deleteIdea,
  };
}
