import { useTranslation } from "react-i18next";
import type { ReactNode } from "react";
import RefreshCw from "lucide-react/dist/esm/icons/refresh-cw";
import Save from "lucide-react/dist/esm/icons/save";

type FileEditorCardClassNames = {
  container: string;
  header: string;
  title: string;
  actions: string;
  meta: string;
  iconButton: string;
  error: string;
  textarea: string;
  help: string;
};

type FileEditorCardProps = {
  title: string;
  meta?: string;
  error?: string | null;
  value: string;
  placeholder?: string;
  helpText?: ReactNode;
  disabled?: boolean;
  refreshDisabled?: boolean;
  saveDisabled?: boolean;
  saveLabel: string;
  onChange: (value: string) => void;
  onRefresh: () => void;
  onSave: () => void;
  classNames: FileEditorCardClassNames;
};

export function FileEditorCard({
  title,
  meta,
  error,
  value,
  placeholder,
  helpText,
  disabled,
  refreshDisabled,
  saveDisabled,
  saveLabel,
  onChange,
  onRefresh,
  onSave,
  classNames,
}: FileEditorCardProps) {
  const { t } = useTranslation("files");
  return (
    <div className={classNames.container}>
      <div className={classNames.header}>
        <div className={classNames.title}>{title}</div>
        <div className={classNames.actions}>
          {meta ? <div className={classNames.meta}>{meta}</div> : null}
          <button
            type="button"
            className={classNames.iconButton}
            onClick={onRefresh}
            disabled={refreshDisabled}
            aria-label={`${t("refresh")} ${title}`}
            title={t("refresh")}
          >
            <RefreshCw aria-hidden />
          </button>
          <button
            type="button"
            className={classNames.iconButton}
            onClick={onSave}
            disabled={saveDisabled}
            aria-label={saveLabel === "Create" ? `${t("create")} ${title}` : `${t("save")} ${title}`}
            title={saveLabel}
          >
            <Save aria-hidden />
          </button>
        </div>
      </div>
      {error ? <div className={classNames.error}>{error}</div> : null}
      <textarea
        className={classNames.textarea}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        spellCheck={false}
        disabled={disabled}
      />
      {helpText ? <div className={classNames.help}>{helpText}</div> : null}
    </div>
  );
}

