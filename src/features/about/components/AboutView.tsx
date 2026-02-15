import { useEffect, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { openUrl } from "@tauri-apps/plugin-opener";

const GITHUB_URL = "https://github.com/Dimillian/CodexMonitor";
const TWITTER_URL = "https://x.com/dimillian";

export function AboutView() {
  const [version, setVersion] = useState<string | null>(null);

  const handleOpenGitHub = () => {
    void openUrl(GITHUB_URL);
  };

  const handleOpenTwitter = () => {
    void openUrl(TWITTER_URL);
  };

  useEffect(() => {
    let active = true;
    const fetchVersion = async () => {
      try {
        const value = await getVersion();
        if (active) {
          setVersion(value);
        }
      } catch {
        if (active) {
          setVersion(null);
        }
      }
    };

    void fetchVersion();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="about">
      <div className="about-card">
        <div className="about-header">
          <img
            className="about-icon"
            src="/assets/app-icon-44.png"
            srcSet="/assets/app-icon-44.png 1x, /assets/app-icon-88.png 2x"
            alt="Codex Monitor 图标"
            width={44}
            height={44}
            sizes="44px"
            loading="eager"
            decoding="async"
          />
          <div className="about-title">Codex Monitor</div>
        </div>
        <div className="about-version">
          {version ? `版本 ${version}` : "版本 —"}
        </div>
        <div className="about-tagline">
          统一监控你的 Codex Agent 运行状态
        </div>
        <div className="about-divider" />
        <div className="about-links">
          <button
            type="button"
            className="about-link"
            onClick={handleOpenGitHub}
          >
            GitHub
          </button>
          <span className="about-link-sep">|</span>
          <button
            type="button"
            className="about-link"
            onClick={handleOpenTwitter}
          >
            X
          </button>
        </div>
        <div className="about-footer">由 Codex & Dimillian 用 ♥ 打造</div>
      </div>
    </div>
  );
}
