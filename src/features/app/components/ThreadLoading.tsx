import { useI18n } from "@/i18n";

type ThreadLoadingProps = {
  nested?: boolean;
};

export function ThreadLoading({ nested }: ThreadLoadingProps) {
  const { tx } = useI18n();

  return (
    <div
      className={`thread-loading${nested ? " thread-loading-nested" : ""}`}
      aria-label={tx("Loading agents")}
    >
      <span className="thread-skeleton thread-skeleton-wide" />
      <span className="thread-skeleton" />
      <span className="thread-skeleton thread-skeleton-short" />
    </div>
  );
}
