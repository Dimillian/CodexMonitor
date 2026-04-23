import { useI18n } from "@/i18n";

type WorkspaceHomeGitInitBannerProps = {
  isLoading: boolean;
  onInitGitRepo: () => void | Promise<void>;
};

export function WorkspaceHomeGitInitBanner({
  isLoading,
  onInitGitRepo,
}: WorkspaceHomeGitInitBannerProps) {
  const { tx } = useI18n();

  return (
    <div className="workspace-home-git-banner" role="region" aria-label={tx("Git setup")}>
      <div className="workspace-home-git-banner-title">
        {tx("Git is not initialized for this project.")}
      </div>
      <div className="workspace-home-git-banner-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void onInitGitRepo()}
          disabled={isLoading}
        >
          {isLoading ? tx("Initializing...") : tx("Initialize Git")}
        </button>
      </div>
    </div>
  );
}
