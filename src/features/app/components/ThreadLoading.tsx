import { useTranslation } from "react-i18next";

type ThreadLoadingProps = {
  nested?: boolean;
};

export function ThreadLoading({ nested }: ThreadLoadingProps) {
  const { t } = useTranslation();
  return (
    <div
      className={`thread-loading${nested ? " thread-loading-nested" : ""}`}
      aria-label={t("threads:loading.agents")}
    >
      <span className="thread-skeleton thread-skeleton-wide" />
      <span className="thread-skeleton" />
      <span className="thread-skeleton thread-skeleton-short" />
    </div>
  );
}
