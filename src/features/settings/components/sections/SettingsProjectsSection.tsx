import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import type { Dispatch, SetStateAction } from "react";
import { useI18n } from "@/i18n";
import {
  SettingsSection,
  SettingsSubsection,
} from "@/features/design-system/components/settings/SettingsPrimitives";
import type { WorkspaceGroup, WorkspaceInfo } from "@/types";

type GroupedWorkspaces = Array<{
  id: string | null;
  name: string;
  workspaces: WorkspaceInfo[];
}>;

type SettingsProjectsSectionProps = {
  workspaceGroups: WorkspaceGroup[];
  groupedWorkspaces: GroupedWorkspaces;
  ungroupedLabel: string;
  groupDrafts: Record<string, string>;
  newGroupName: string;
  groupError: string | null;
  projects: WorkspaceInfo[];
  canCreateGroup: boolean;
  onSetNewGroupName: Dispatch<SetStateAction<string>>;
  onSetGroupDrafts: Dispatch<SetStateAction<Record<string, string>>>;
  onCreateGroup: () => Promise<void>;
  onRenameGroup: (group: WorkspaceGroup) => Promise<void>;
  onMoveWorkspaceGroup: (id: string, direction: "up" | "down") => Promise<boolean | null>;
  onDeleteGroup: (group: WorkspaceGroup) => Promise<void>;
  onChooseGroupCopiesFolder: (group: WorkspaceGroup) => Promise<void>;
  onClearGroupCopiesFolder: (group: WorkspaceGroup) => Promise<void>;
  onAssignWorkspaceGroup: (workspaceId: string, groupId: string | null) => Promise<boolean | null>;
  onMoveWorkspace: (id: string, direction: "up" | "down") => void;
  onDeleteWorkspace: (id: string) => void;
};

export function SettingsProjectsSection({
  workspaceGroups,
  groupedWorkspaces,
  ungroupedLabel,
  groupDrafts,
  newGroupName,
  groupError,
  projects,
  canCreateGroup,
  onSetNewGroupName,
  onSetGroupDrafts,
  onCreateGroup,
  onRenameGroup,
  onMoveWorkspaceGroup,
  onDeleteGroup,
  onChooseGroupCopiesFolder,
  onClearGroupCopiesFolder,
  onAssignWorkspaceGroup,
  onMoveWorkspace,
  onDeleteWorkspace,
}: SettingsProjectsSectionProps) {
  const { tx } = useI18n();
  return (
    <SettingsSection
      title={tx("Projects")}
      subtitle={tx("Group related workspaces and reorder projects within each group.")}
    >
      <SettingsSubsection
        title={tx("Groups")}
        subtitle={tx("Create group labels for related repositories.")}
      />
      <div className="settings-groups">
        <div className="settings-group-create">
          <input
            className="settings-input settings-input--compact"
            value={newGroupName}
            placeholder={tx("New group name")}
            onChange={(event) => onSetNewGroupName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && canCreateGroup) {
                event.preventDefault();
                void onCreateGroup();
              }
            }}
          />
          <button
            type="button"
            className="ghost settings-button-compact"
            onClick={() => {
              void onCreateGroup();
            }}
            disabled={!canCreateGroup}
          >
            {tx("Add group")}
          </button>
        </div>
        {groupError && <div className="settings-group-error">{groupError}</div>}
        {workspaceGroups.length > 0 ? (
          <div className="settings-group-list">
            {workspaceGroups.map((group, index) => (
              <div key={group.id} className="settings-group-row">
                <div className="settings-group-fields">
                  <input
                    className="settings-input settings-input--compact"
                    value={groupDrafts[group.id] ?? group.name}
                    onChange={(event) =>
                      onSetGroupDrafts((prev) => ({
                        ...prev,
                        [group.id]: event.target.value,
                      }))
                    }
                    onBlur={() => {
                      void onRenameGroup(group);
                    }}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        event.preventDefault();
                        void onRenameGroup(group);
                      }
                    }}
                  />
                  <div className="settings-group-copies">
                    <div className="settings-group-copies-label">{tx("Copies folder")}</div>
                    <div className="settings-group-copies-row">
                      <div
                        className={`settings-group-copies-path${group.copiesFolder ? "" : " empty"}`}
                        title={group.copiesFolder ?? ""}
                      >
                        {group.copiesFolder ?? tx("Not set")}
                      </div>
                      <button
                        type="button"
                        className="ghost settings-button-compact"
                        onClick={() => {
                          void onChooseGroupCopiesFolder(group);
                        }}
                      >
                        {tx("Choose…")}
                      </button>
                      <button
                        type="button"
                        className="ghost settings-button-compact"
                        onClick={() => {
                          void onClearGroupCopiesFolder(group);
                        }}
                        disabled={!group.copiesFolder}
                      >
                        {tx("Clear")}
                      </button>
                    </div>
                  </div>
                </div>
                <div className="settings-group-actions">
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => {
                      void onMoveWorkspaceGroup(group.id, "up");
                    }}
                    disabled={index === 0}
                    aria-label={tx("Move group up")}
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => {
                      void onMoveWorkspaceGroup(group.id, "down");
                    }}
                    disabled={index === workspaceGroups.length - 1}
                    aria-label={tx("Move group down")}
                  >
                    <ChevronDown aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => {
                      void onDeleteGroup(group);
                    }}
                    aria-label={tx("Delete group")}
                  >
                    <Trash2 aria-hidden />
                  </button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="settings-empty">{tx("No groups yet.")}</div>
        )}
      </div>
      <SettingsSubsection
        title={tx("Projects")}
        subtitle={tx("Assign projects to groups and adjust their order.")}
      />
      <div className="settings-projects">
        {groupedWorkspaces.map((group) => (
          <div key={group.id ?? "ungrouped"} className="settings-project-group">
            <div className="settings-project-group-label">{group.name}</div>
            {group.workspaces.map((workspace, index) => {
              const groupValue = workspaceGroups.some(
                (entry) => entry.id === workspace.settings.groupId,
              )
                ? workspace.settings.groupId ?? ""
                : "";
              return (
                <div key={workspace.id} className="settings-project-row">
                  <div className="settings-project-info">
                    <div className="settings-project-name">{workspace.name}</div>
                    <div className="settings-project-path">{workspace.path}</div>
                  </div>
                  <div className="settings-project-actions">
                    <select
                      className="settings-select settings-select--compact"
                      value={groupValue}
                      onChange={(event) => {
                        const nextGroupId = event.target.value || null;
                        void onAssignWorkspaceGroup(workspace.id, nextGroupId);
                      }}
                    >
                      <option value="">{tx(ungroupedLabel)}</option>
                      {workspaceGroups.map((entry) => (
                        <option key={entry.id} value={entry.id}>
                          {entry.name}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      className="ghost icon-button"
                      onClick={() => onMoveWorkspace(workspace.id, "up")}
                      disabled={index === 0}
                      aria-label={tx("Move project up")}
                    >
                      <ChevronUp aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ghost icon-button"
                      onClick={() => onMoveWorkspace(workspace.id, "down")}
                      disabled={index === group.workspaces.length - 1}
                      aria-label={tx("Move project down")}
                    >
                      <ChevronDown aria-hidden />
                    </button>
                    <button
                      type="button"
                      className="ghost icon-button"
                      onClick={() => onDeleteWorkspace(workspace.id)}
                      aria-label={tx("Delete project")}
                    >
                      <Trash2 aria-hidden />
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        ))}
        {projects.length === 0 && <div className="settings-empty">{tx("No projects yet.")}</div>}
      </div>
    </SettingsSection>
  );
}
