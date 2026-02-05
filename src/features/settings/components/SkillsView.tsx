import { useMemo } from "react";
import type { SkillOption } from "../../../types";
import { homeDir, join } from "@tauri-apps/api/path";
import { openPath, openUrl, revealItemInDir } from "@tauri-apps/plugin-opener";
import Wrench from "lucide-react/dist/esm/icons/wrench";
import FolderOpen from "lucide-react/dist/esm/icons/folder-open";
import Pencil from "lucide-react/dist/esm/icons/pencil";
import ExternalLink from "lucide-react/dist/esm/icons/external-link";
import { pushErrorToast } from "../../../services/toasts";

const SKILLS_DOCS_URL = "https://github.com/openai/skills";

type SkillPaths = {
  folderPath: string;
  filePath: string;
};

const isAbsolutePath = (value: string) =>
  value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || value.startsWith("\\\\");

const expandHomePath = async (value: string) => {
  const trimmed = value.trim();
  if (trimmed.startsWith("~")) {
    const home = await homeDir();
    if (trimmed === "~") {
      return home;
    }
    const next = trimmed.startsWith("~/") || trimmed.startsWith("~\\")
      ? trimmed.slice(2)
      : trimmed.slice(1);
    return join(home, next);
  }
  if (isAbsolutePath(trimmed)) {
    return trimmed;
  }
  const home = await homeDir();
  return join(home, trimmed);
};

const normalizeSkillPath = (value: string) => value.replace(/\\/g, "/");

const resolveSkillPaths = (value: string): SkillPaths => {
  const separator = value.includes("\\") ? "\\" : "/";
  const trimmed = value.replace(/[\\/]+$/, "");
  const normalized = normalizeSkillPath(trimmed).toLowerCase();
  const isFilePath =
    normalized.endsWith("/skill.md") || normalized.endsWith(".md");
  if (isFilePath) {
    const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
    const folderPath = index >= 0 ? trimmed.slice(0, index) : trimmed;
    return { folderPath, filePath: trimmed };
  }
  return { folderPath: trimmed, filePath: `${trimmed}${separator}SKILL.md` };
};

const buildSkillFileCandidates = (skill: SkillOption) => {
  const { filePath } = resolveSkillPaths(skill.path);
  const candidates = [filePath];
  const skillName = skill.name?.trim();
  if (!skillName) {
    return candidates;
  }
  const normalizedPath = normalizeSkillPath(skill.path).replace(/[\\/]+$/, "");
  const normalizedLower = normalizedPath.toLowerCase();
  const normalizedName = normalizeSkillPath(skillName).toLowerCase();
  const endsWithName = normalizedLower.endsWith(`/${normalizedName}`);
  const endsWithMd =
    normalizedLower.endsWith("/skill.md") || normalizedLower.endsWith(".md");
  if (!endsWithName && !endsWithMd) {
    const separator = skill.path.includes("\\") ? "\\" : "/";
    candidates.push(`${skill.path}${separator}${skillName}${separator}SKILL.md`);
  }
  return candidates;
};

const openFirstAvailablePath = async (paths: string[]) => {
  let lastError: unknown = null;
  for (const path of paths) {
    try {
      const expanded = await expandHomePath(path);
      await openPath(expanded);
      return;
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("No skill file candidates");
};

type SkillsViewProps = {
  skills: SkillOption[];
  onUseSkill: (name: string) => void;
  onRefreshSkills: () => void;
};

export function SkillsView({
  skills,
  onUseSkill,
  onRefreshSkills,
}: SkillsViewProps) {
  const cards = useMemo(() => skills.filter((skill) => skill.name), [skills]);
  const hasSkills = cards.length > 0;

  const handleLearnMore = () => {
    void openUrl(SKILLS_DOCS_URL).catch(() => {
      pushErrorToast({
        title: "Unable to open link",
        message: "Could not open the skills documentation link.",
      });
    });
  };

  const handleOpenSkill = (skill: SkillOption) => {
    const { folderPath } = resolveSkillPaths(skill.path);
    void expandHomePath(folderPath)
      .then((expanded) => revealItemInDir(expanded))
      .catch(() => {
      pushErrorToast({
        title: "Could not open skill",
        message: "Failed to reveal the skill folder.",
      });
    });
  };

  const handleEditSkill = (skill: SkillOption) => {
    const candidates = buildSkillFileCandidates(skill);
    void openFirstAvailablePath(candidates).catch(() => {
      pushErrorToast({
        title: "Could not edit skill",
        message: "Failed to open the skill file.",
      });
    });
  };

  return (
    <section className="settings-section skills-section">
      <div className="skills-header">
        <div>
          <div className="settings-section-title">Skills</div>
          <div className="settings-section-subtitle">
            Give Codex superpowers.
            <button
              type="button"
              className="skills-link"
              onClick={handleLearnMore}
            >
              Learn more <ExternalLink aria-hidden />
            </button>
          </div>
        </div>
        <button
          type="button"
          className="ghost settings-button-compact"
          onClick={onRefreshSkills}
        >
          Reload
        </button>
      </div>
      <div className="skills-subsection-title">Installed</div>
      {!hasSkills ? (
        <div className="settings-help">
          No skills found for this workspace. Connect a workspace to load skills.
        </div>
      ) : (
        <div className="skills-grid">
          {cards.map((skill) => (
            <div key={skill.path || skill.name} className="skills-card">
              <div className="skills-card-header">
                <div className="skills-card-icon">
                  <Wrench aria-hidden />
                </div>
                <div className="skills-card-body">
                  <div className="skills-card-title">{skill.name}</div>
                  <div className="skills-card-description">
                    {skill.description ?? "No description provided."}
                  </div>
                </div>
              </div>
              <div className="skills-card-actions">
                <button
                  type="button"
                  className="primary settings-button-compact"
                  onClick={() => onUseSkill(skill.name)}
                >
                  Use
                </button>
                <button
                  type="button"
                  className="ghost settings-button-compact"
                  onClick={() => handleOpenSkill(skill)}
                >
                  <FolderOpen aria-hidden />
                  Open
                </button>
                <button
                  type="button"
                  className="ghost settings-button-compact"
                  onClick={() => handleEditSkill(skill)}
                >
                  <Pencil aria-hidden />
                  Edit
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}
