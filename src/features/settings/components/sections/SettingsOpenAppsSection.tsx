import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import ChevronUp from "lucide-react/dist/esm/icons/chevron-up";
import Trash2 from "lucide-react/dist/esm/icons/trash-2";
import { useTranslation } from "react-i18next";
import { SettingsSection } from "@/features/design-system/components/settings/SettingsPrimitives";
import type { OpenAppTarget } from "@/types";
import {
  fileManagerName,
  isMacPlatform,
} from "@utils/platformPaths";
import {
  GENERIC_APP_ICON,
  getKnownOpenAppIcon,
} from "@app/utils/openAppIcons";
import type { OpenAppDraft } from "@settings/components/settingsTypes";

type SettingsOpenAppsSectionProps = {
  openAppDrafts: OpenAppDraft[];
  openAppSelectedId: string;
  openAppIconById: Record<string, string>;
  onOpenAppDraftChange: (index: number, updates: Partial<OpenAppDraft>) => void;
  onOpenAppKindChange: (index: number, kind: OpenAppTarget["kind"]) => void;
  onCommitOpenApps: () => void;
  onMoveOpenApp: (index: number, direction: "up" | "down") => void;
  onDeleteOpenApp: (index: number) => void;
  onAddOpenApp: () => void;
  onSelectOpenAppDefault: (id: string) => void;
};

const isOpenAppLabelValid = (label: string) => label.trim().length > 0;

export function SettingsOpenAppsSection({
  openAppDrafts,
  openAppSelectedId,
  openAppIconById,
  onOpenAppDraftChange,
  onOpenAppKindChange,
  onCommitOpenApps,
  onMoveOpenApp,
  onDeleteOpenApp,
  onAddOpenApp,
  onSelectOpenAppDefault,
}: SettingsOpenAppsSectionProps) {
  const { t } = useTranslation("settings");
  return (
    <SettingsSection
      title={t("open_apps_title")}
      subtitle={t("open_apps_subtitle")}
    >
      <div className="settings-open-apps">
        {openAppDrafts.map((target, index) => {
          const iconSrc =
            getKnownOpenAppIcon(target.id) ?? openAppIconById[target.id] ?? GENERIC_APP_ICON;
          const labelValid = isOpenAppLabelValid(target.label);
          const appNameValid = target.kind !== "app" || Boolean(target.appName?.trim());
          const commandValid =
            target.kind !== "command" || Boolean(target.command?.trim());
          const isComplete = labelValid && appNameValid && commandValid;
          const incompleteHint = !labelValid
            ? t("open_apps_label_required")
            : target.kind === "app"
              ? t("open_apps_app_name_required")
              : target.kind === "command"
                ? t("open_apps_command_required")
                : t("open_apps_complete_required");

          return (
            <div
              key={target.id}
              className={`settings-open-app-row${isComplete ? "" : " is-incomplete"}`}
            >
              <div className="settings-open-app-icon-wrap" aria-hidden>
                <img
                  className="settings-open-app-icon"
                  src={iconSrc}
                  alt=""
                  width={18}
                  height={18}
                />
              </div>
              <div className="settings-open-app-fields">
                <label className="settings-open-app-field settings-open-app-field--label">
                  <span className="settings-visually-hidden">{t("open_apps_label")}</span>
                  <input
                    className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--label"
                    value={target.label}
                    placeholder={t("open_apps_label")}
                    onChange={(event) =>
                      onOpenAppDraftChange(index, {
                        label: event.target.value,
                      })
                    }
                    onBlur={onCommitOpenApps}
                    aria-label={`${t("open_apps_label")} ${index + 1}`}
                    data-invalid={!labelValid || undefined}
                  />
                </label>
                <label className="settings-open-app-field settings-open-app-field--type">
                  <span className="settings-visually-hidden">{t("open_apps_label")}</span>
                  <select
                    className="settings-select settings-select--compact settings-open-app-kind"
                    value={target.kind}
                    onChange={(event) =>
                      onOpenAppKindChange(index, event.target.value as OpenAppTarget["kind"])
                    }
                    aria-label={`${t("open_apps_label")} ${index + 1}`}
                  >
                    <option value="app">{t("open_apps_app")}</option>
                    <option value="command">{t("open_apps_command_type")}</option>
                    <option value="finder">{fileManagerName()}</option>
                  </select>
                </label>
                {target.kind === "app" && (
                  <label className="settings-open-app-field settings-open-app-field--appname">
                    <span className="settings-visually-hidden">{t("open_apps_app_name")}</span>
                    <input
                      className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--appname"
                      value={target.appName ?? ""}
                      placeholder={t("open_apps_app_name")}
                      onChange={(event) =>
                        onOpenAppDraftChange(index, {
                          appName: event.target.value,
                        })
                      }
                      onBlur={onCommitOpenApps}
                      aria-label={`${t("open_apps_app_name")} ${index + 1}`}
                      data-invalid={!appNameValid || undefined}
                    />
                  </label>
                )}
                {target.kind === "command" && (
                  <label className="settings-open-app-field settings-open-app-field--command">
                    <span className="settings-visually-hidden">{t("open_apps_command")}</span>
                    <input
                      className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--command"
                      value={target.command ?? ""}
                      placeholder={t("open_apps_command")}
                      onChange={(event) =>
                        onOpenAppDraftChange(index, {
                          command: event.target.value,
                        })
                      }
                      onBlur={onCommitOpenApps}
                      aria-label={`${t("open_apps_command")} ${index + 1}`}
                      data-invalid={!commandValid || undefined}
                    />
                  </label>
                )}
                {target.kind !== "finder" && (
                  <label className="settings-open-app-field settings-open-app-field--args">
                    <span className="settings-visually-hidden">{t("open_apps_args")}</span>
                    <input
                      className="settings-input settings-input--compact settings-open-app-input settings-open-app-input--args"
                      value={target.argsText}
                      placeholder={t("open_apps_args")}
                      onChange={(event) =>
                        onOpenAppDraftChange(index, {
                          argsText: event.target.value,
                        })
                      }
                      onBlur={onCommitOpenApps}
                      aria-label={`${t("open_apps_args")} ${index + 1}`}
                    />
                  </label>
                )}
              </div>
              <div className="settings-open-app-actions">
                {!isComplete && (
                  <span
                    className="settings-open-app-status"
                    title={incompleteHint}
                    aria-label={incompleteHint}
                  >
                    {t("open_apps_incomplete")}
                  </span>
                )}
                <label className="settings-open-app-default">
                  <input
                    type="radio"
                    name="open-app-default"
                    checked={target.id === openAppSelectedId}
                    onChange={() => onSelectOpenAppDefault(target.id)}
                    disabled={!isComplete}
                  />
                  {t("open_apps_default")}
                </label>
                <div className="settings-open-app-order">
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveOpenApp(index, "up")}
                    disabled={index === 0}
                    aria-label={t("open_apps_move_up")}
                  >
                    <ChevronUp aria-hidden />
                  </button>
                  <button
                    type="button"
                    className="ghost icon-button"
                    onClick={() => onMoveOpenApp(index, "down")}
                    disabled={index === openAppDrafts.length - 1}
                    aria-label={t("open_apps_move_down")}
                  >
                    <ChevronDown aria-hidden />
                  </button>
                </div>
                <button
                  type="button"
                  className="ghost icon-button"
                  onClick={() => onDeleteOpenApp(index)}
                  disabled={openAppDrafts.length <= 1}
                  aria-label={t("open_apps_remove")}
                  title={t("open_apps_remove_title")}
                >
                  <Trash2 aria-hidden />
                </button>
              </div>
            </div>
          );
        })}
      </div>
      <div className="settings-open-app-footer">
        <button type="button" className="ghost" onClick={onAddOpenApp}>
          {t("open_apps_add")}
        </button>
        <div className="settings-help">
          {t("open_apps_help", {
            platformHelp: isMacPlatform()
              ? t("open_apps_help_mac")
              : t("open_apps_help_other"),
          })}
        </div>
      </div>
    </SettingsSection>
  );
}
