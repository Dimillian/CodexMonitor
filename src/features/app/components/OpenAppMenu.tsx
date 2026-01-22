import { useEffect, useMemo, useRef, useState } from "react";
import ChevronDown from "lucide-react/dist/esm/icons/chevron-down";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { openWorkspaceIn } from "../../../services/tauri";
import { OPEN_APP_STORAGE_KEY, type OpenAppId } from "../constants";
import { getStoredOpenAppId } from "../utils/openApp";
import cursorIcon from "../../../assets/app-icons/cursor.png";
import finderIcon from "../../../assets/app-icons/finder.png";
import antigravityIcon from "../../../assets/app-icons/antigravity.png";
import ghosttyIcon from "../../../assets/app-icons/ghostty.png";
import vscodeIcon from "../../../assets/app-icons/vscode.png";
import zedIcon from "../../../assets/app-icons/zed.png";

type OpenTarget = {
  id: OpenAppId;
  label: string;
  icon: string;
  open: (path: string) => Promise<void>;
};

type OpenAppMenuProps = {
  path: string;
};

export function OpenAppMenu({ path }: OpenAppMenuProps) {
  const [openMenuOpen, setOpenMenuOpen] = useState(false);
  const openMenuRef = useRef<HTMLDivElement | null>(null);
  const [openAppId, setOpenAppId] = useState<OpenTarget["id"]>(() => (
    getStoredOpenAppId()
  ));

  const openTargets = useMemo<OpenTarget[]>(
    () => [
      {
        id: "vscode",
        label: "VS Code",
        icon: vscodeIcon,
        open: async (pathToOpen) => openWorkspaceIn(pathToOpen, "Visual Studio Code"),
      },
      {
        id: "cursor",
        label: "Cursor",
        icon: cursorIcon,
        open: async (pathToOpen) => openWorkspaceIn(pathToOpen, "Cursor"),
      },
      {
        id: "zed",
        label: "Zed",
        icon: zedIcon,
        open: async (pathToOpen) => openWorkspaceIn(pathToOpen, "Zed"),
      },
      {
        id: "ghostty",
        label: "Ghostty",
        icon: ghosttyIcon,
        open: async (pathToOpen) => openWorkspaceIn(pathToOpen, "Ghostty"),
      },
      {
        id: "antigravity",
        label: "Antigravity",
        icon: antigravityIcon,
        open: async (pathToOpen) => openWorkspaceIn(pathToOpen, "Antigravity"),
      },
      {
        id: "finder",
        label: "Finder",
        icon: finderIcon,
        open: async (pathToOpen) => revealItemInDir(pathToOpen),
      },
    ],
    [],
  );

  const selectedOpenTarget =
    openTargets.find((target) => target.id === openAppId) ?? openTargets[0];

  useEffect(() => {
    if (!openMenuOpen) {
      return;
    }
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      const openContains = openMenuRef.current?.contains(target) ?? false;
      if (!openContains) {
        setOpenMenuOpen(false);
      }
    };
    window.addEventListener("mousedown", handleClick);
    return () => {
      window.removeEventListener("mousedown", handleClick);
    };
  }, [openMenuOpen]);

  const handleOpen = async () => {
    await selectedOpenTarget.open(path);
  };

  const handleSelectOpenTarget = async (target: OpenTarget) => {
    setOpenAppId(target.id);
    window.localStorage.setItem(OPEN_APP_STORAGE_KEY, target.id);
    setOpenMenuOpen(false);
    await target.open(path);
  };

  return (
    <div className="open-app-menu" ref={openMenuRef}>
      <div className="open-app-button">
        <button
          type="button"
          className="ghost main-header-action open-app-action"
          onClick={handleOpen}
          data-tauri-drag-region="false"
          aria-label={`Open in ${selectedOpenTarget.label}`}
          title={`Open in ${selectedOpenTarget.label}`}
        >
          <span className="open-app-label">
            <img
              className="open-app-icon"
              src={selectedOpenTarget.icon}
              alt=""
              aria-hidden
            />
            {selectedOpenTarget.label}
          </span>
        </button>
        <button
          type="button"
          className="ghost main-header-action open-app-toggle"
          onClick={() => setOpenMenuOpen((prev) => !prev)}
          data-tauri-drag-region="false"
          aria-haspopup="menu"
          aria-expanded={openMenuOpen}
          aria-label="Select editor"
          title="Select editor"
        >
          <ChevronDown size={14} aria-hidden />
        </button>
      </div>
      {openMenuOpen && (
        <div className="open-app-dropdown" role="menu">
          {openTargets.map((target) => (
            <button
              key={target.id}
              type="button"
              className={`open-app-option${
                target.id === openAppId ? " is-active" : ""
              }`}
              onClick={() => handleSelectOpenTarget(target)}
              role="menuitem"
              data-tauri-drag-region="false"
            >
              <img className="open-app-icon" src={target.icon} alt="" aria-hidden />
              {target.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
