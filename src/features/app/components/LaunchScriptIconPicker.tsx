import { useTranslation } from "react-i18next";
import type { LaunchScriptIconId } from "../utils/launchScriptIcons";
import {
  LAUNCH_SCRIPT_ICON_OPTIONS,
  getLaunchScriptIcon,
} from "../utils/launchScriptIcons";

type LaunchScriptIconPickerProps = {
  value: LaunchScriptIconId;
  onChange: (value: LaunchScriptIconId) => void;
};

export function LaunchScriptIconPicker({ value, onChange }: LaunchScriptIconPickerProps) {
  const { t } = useTranslation("app");
  return (
    <div className="launch-script-icon-picker">
      {LAUNCH_SCRIPT_ICON_OPTIONS.map((option) => {
        const Icon = getLaunchScriptIcon(option.id);
        const selected = option.id === value;
        const iconKey = `launchScript.icons.${option.id}`;
        return (
          <button
            key={option.id}
            type="button"
            className={`launch-script-icon-option${selected ? " is-selected" : ""}`}
            onClick={() => onChange(option.id)}
            aria-label={t(iconKey)}
            aria-pressed={selected}
            data-tauri-drag-region="false"
          >
            <Icon size={14} aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
