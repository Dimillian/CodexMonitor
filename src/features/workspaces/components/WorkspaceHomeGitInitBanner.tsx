type WorkspaceHomeGitInitBannerProps = {
  isLoading: boolean;
  onInitGitRepo: () => void | Promise<void>;
};

export function WorkspaceHomeGitInitBanner({
  isLoading,
  onInitGitRepo,
}: WorkspaceHomeGitInitBannerProps) {
  return (
    <div className="workspace-home-git-banner" role="region" aria-label="Git setup">
      <div className="workspace-home-git-banner-title">
        Git is not initialized for this project.
      </div>
      <div className="workspace-home-git-banner-actions">
        <button
          type="button"
          className="primary"
          onClick={() => void onInitGitRepo()}
          disabled={isLoading}
        >
          {isLoading ? "Initializing..." : "Initialize Git"}
        </button>
      </div>
    </div>
  );
}

