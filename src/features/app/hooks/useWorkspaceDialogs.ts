import { useCallback, useEffect, useRef, useState } from "react";
import { ask, message } from "@tauri-apps/plugin-dialog";
import type { WorkspaceInfo } from "../../../types";
import { isAbsolutePath, isMobilePlatform } from "../../../utils/platformPaths";
import { pickWorkspacePaths } from "../../../services/tauri";
import { pushErrorToast } from "../../../services/toasts";
import type { AddWorkspacesFromPathsResult } from "../../workspaces/hooks/useWorkspaceCrud";

function parseWorkspacePathInput(value: string) {
  return value
    .split(/\r?\n|,|;/)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

export type WorkspacePathsPromptState = {
  value: string;
  error: string | null;
} | null;

export function useWorkspaceDialogs() {
  const [workspacePathsPrompt, setWorkspacePathsPrompt] =
    useState<WorkspacePathsPromptState>(null);
  const workspacePathsPromptRef = useRef<WorkspacePathsPromptState>(null);
  const workspacePathsPromptResolveRef = useRef<((paths: string[]) => void) | null>(
    null,
  );

  const resolveWorkspacePathsPrompt = useCallback((paths: string[]) => {
    const resolve = workspacePathsPromptResolveRef.current;
    workspacePathsPromptResolveRef.current = null;
    workspacePathsPromptRef.current = null;
    setWorkspacePathsPrompt(null);
    resolve?.(paths);
  }, []);

  useEffect(() => {
    workspacePathsPromptRef.current = workspacePathsPrompt;
  }, [workspacePathsPrompt]);

  useEffect(() => {
    return () => {
      const resolve = workspacePathsPromptResolveRef.current;
      workspacePathsPromptResolveRef.current = null;
      resolve?.([]);
    };
  }, []);

  const requestWorkspacePaths = useCallback(async (backendMode?: string) => {
    if (isMobilePlatform() && backendMode === "remote") {
      return new Promise<string[]>((resolve) => {
        if (workspacePathsPromptResolveRef.current) {
          pushErrorToast({
            title: "Add workspaces",
            message: "The workspace path dialog is already open.",
          });
          resolve([]);
          return;
        }
        workspacePathsPromptResolveRef.current = resolve;
        const nextPrompt = {
          value: "",
          error: null,
        };
        workspacePathsPromptRef.current = nextPrompt;
        setWorkspacePathsPrompt(nextPrompt);
      });
    }
    return pickWorkspacePaths();
  }, []);

  const updateWorkspacePathsPromptValue = useCallback((value: string) => {
    const current = workspacePathsPromptRef.current;
    if (!current) {
      return;
    }
    const next = {
      ...current,
      value,
      error: null,
    };
    workspacePathsPromptRef.current = next;
    setWorkspacePathsPrompt(next);
  }, []);

  const cancelWorkspacePathsPrompt = useCallback(() => {
    resolveWorkspacePathsPrompt([]);
  }, [resolveWorkspacePathsPrompt]);

  const confirmWorkspacePathsPrompt = useCallback(() => {
    const currentPrompt = workspacePathsPromptRef.current;
    if (!currentPrompt) {
      return;
    }
    const paths = parseWorkspacePathInput(currentPrompt.value);
    if (paths.length === 0) {
      const next = {
        ...currentPrompt,
        error: "Enter at least one absolute path.",
      };
      workspacePathsPromptRef.current = next;
      setWorkspacePathsPrompt(next);
      return;
    }
    const invalidPaths = paths.filter((path) => !isAbsolutePath(path));
    if (invalidPaths.length > 0) {
      const next = {
        ...currentPrompt,
        error: "Use absolute paths only.",
      };
      workspacePathsPromptRef.current = next;
      setWorkspacePathsPrompt(next);
      return;
    }
    resolveWorkspacePathsPrompt(paths);
  }, [resolveWorkspacePathsPrompt]);

  const showAddWorkspacesResult = useCallback(
    async (result: AddWorkspacesFromPathsResult) => {
      const hasIssues =
        result.skippedExisting.length > 0 ||
        result.skippedInvalid.length > 0 ||
        result.failures.length > 0;
      if (!hasIssues) {
        return;
      }

      const lines: string[] = [];
      lines.push(
        `Added ${result.added.length} workspace${result.added.length === 1 ? "" : "s"}.`,
      );
      if (result.skippedExisting.length > 0) {
        lines.push(
          `Skipped ${result.skippedExisting.length} already added workspace${
            result.skippedExisting.length === 1 ? "" : "s"
          }.`,
        );
      }
      if (result.skippedInvalid.length > 0) {
        lines.push(
          `Skipped ${result.skippedInvalid.length} invalid path${
            result.skippedInvalid.length === 1 ? "" : "s"
          } (not a folder).`,
        );
      }
      if (result.failures.length > 0) {
        lines.push(
          `Failed to add ${result.failures.length} workspace${
            result.failures.length === 1 ? "" : "s"
          }.`,
        );
        const details = result.failures
          .slice(0, 3)
          .map(({ path, message: failureMessage }) => `- ${path}: ${failureMessage}`);
        if (result.failures.length > 3) {
          details.push(`- …and ${result.failures.length - 3} more`);
        }
        lines.push("");
        lines.push("Failures:");
        lines.push(...details);
      }

      const title =
        result.failures.length > 0
          ? "Some workspaces failed to add"
          : "Some workspaces were skipped";
      const summary = lines.join("\n");

      if (isMobilePlatform()) {
        pushErrorToast({ title, message: summary });
        return;
      }

      try {
        await message(summary, {
          title,
          kind: result.failures.length > 0 ? "error" : "warning",
        });
      } catch {
        pushErrorToast({ title, message: summary });
      }
    },
    [],
  );

  const confirmWorkspaceRemoval = useCallback(
    async (workspaces: WorkspaceInfo[], workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      const workspaceName = workspace?.name || "this workspace";
      const worktreeCount = workspaces.filter(
        (entry) => entry.parentId === workspaceId,
      ).length;
      const detail =
        worktreeCount > 0
          ? `\n\nThis will also delete ${worktreeCount} worktree${
              worktreeCount === 1 ? "" : "s"
            } on disk.`
          : "";

      return ask(
        `Are you sure you want to delete "${workspaceName}"?\n\nThis will remove the workspace from CodexMonitor.${detail}`,
        {
          title: "Delete Workspace",
          kind: "warning",
          okLabel: "Delete",
          cancelLabel: "Cancel",
        },
      );
    },
    [],
  );

  const confirmWorktreeRemoval = useCallback(
    async (workspaces: WorkspaceInfo[], workspaceId: string) => {
      const workspace = workspaces.find((entry) => entry.id === workspaceId);
      const workspaceName = workspace?.name || "this worktree";
      return ask(
        `Are you sure you want to delete "${workspaceName}"?\n\nThis will close the agent, remove its worktree, and delete it from CodexMonitor.`,
        {
          title: "Delete Worktree",
          kind: "warning",
          okLabel: "Delete",
          cancelLabel: "Cancel",
        },
      );
    },
    [],
  );

  const showWorkspaceRemovalError = useCallback(async (errorMessage: string) => {
    await message(errorMessage, {
      title: "Delete workspace failed",
      kind: "error",
    });
  }, []);

  const showWorktreeRemovalError = useCallback(async (errorMessage: string) => {
    await message(errorMessage, {
      title: "Delete worktree failed",
      kind: "error",
    });
  }, []);

  return {
    requestWorkspacePaths,
    workspacePathsPrompt,
    updateWorkspacePathsPromptValue,
    cancelWorkspacePathsPrompt,
    confirmWorkspacePathsPrompt,
    showAddWorkspacesResult,
    confirmWorkspaceRemoval,
    confirmWorktreeRemoval,
    showWorkspaceRemovalError,
    showWorktreeRemovalError,
  };
}
