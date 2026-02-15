import { useMemo, useState } from "react";
import Search from "lucide-react/dist/esm/icons/search";
import Zap from "lucide-react/dist/esm/icons/zap";
import type { SkillOption } from "../../../types";
import { PanelTabs, type PanelTabId } from "../../layout/components/PanelTabs";
import {
  PanelFrame,
  PanelHeader,
} from "../../design-system/components/panel/PanelPrimitives";

/** Derive a short human-readable source label from the full skill path. */
function skillSourceLabel(path: string): string {
  if (path.includes("/.codex/skills/")) return "Codex";
  if (path.includes("/prompts/") || path.includes("/workspace/")) return "工作区";
  return "自定义";
}

type SkillsPanelProps = {
  skills: SkillOption[];
  onInvokeSkill?: (skill: SkillOption) => void;
  filePanelMode: PanelTabId;
  onFilePanelModeChange: (mode: PanelTabId) => void;
};

export function SkillsPanel({
  skills,
  onInvokeSkill,
  filePanelMode,
  onFilePanelModeChange,
}: SkillsPanelProps) {
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    if (!query.trim()) {
      return skills;
    }
    const lower = query.toLowerCase();
    return skills.filter(
      (s) =>
        s.name.toLowerCase().includes(lower) ||
        (s.description && s.description.toLowerCase().includes(lower)),
    );
  }, [skills, query]);

  return (
    <PanelFrame>
      <PanelHeader className="skills-panel-header-bar">
        <PanelTabs active={filePanelMode} onSelect={onFilePanelModeChange} />
      </PanelHeader>
      <div className="skills-panel-subheader">
        <Zap size={14} aria-hidden />
        <span className="skills-panel-title">技能</span>
        <span className="skills-panel-count">{skills.length}</span>
      </div>
      <div className="skills-panel-search">
        <Search size={12} className="skills-panel-search-icon" aria-hidden />
        <input
          className="skills-panel-search-input"
          placeholder="搜索技能…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          spellCheck={false}
          autoCorrect="off"
        />
      </div>
      <div className="skills-panel-list" role="list">
        {filtered.length === 0 ? (
          <div className="skills-panel-empty">
            {query ? "未找到匹配的技能" : "当前工作区暂无可用技能"}
          </div>
        ) : (
          filtered.map((skill) => (
            <button
              key={skill.name}
              type="button"
              className="skills-panel-item"
              role="listitem"
              onClick={() => onInvokeSkill?.(skill)}
              title={skill.path}
            >
              <span className="skills-panel-item-header">
                <span className="skills-panel-item-name">{skill.name}</span>
                <span className="skills-panel-item-source">
                  {skillSourceLabel(skill.path)}
                </span>
              </span>
              {skill.description ? (
                <span className="skills-panel-item-desc">{skill.description}</span>
              ) : null}
            </button>
          ))
        )}
      </div>
    </PanelFrame>
  );
}
