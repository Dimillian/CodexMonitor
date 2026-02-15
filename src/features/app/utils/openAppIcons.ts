import cursor14Icon from "../../../assets/app-icons/optimized/cursor-14.png";
import cursor18Icon from "../../../assets/app-icons/optimized/cursor-18.png";
import cursor28Icon from "../../../assets/app-icons/optimized/cursor-28.png";
import cursor36Icon from "../../../assets/app-icons/optimized/cursor-36.png";
import finder14Icon from "../../../assets/app-icons/optimized/finder-14.png";
import finder18Icon from "../../../assets/app-icons/optimized/finder-18.png";
import finder28Icon from "../../../assets/app-icons/optimized/finder-28.png";
import finder36Icon from "../../../assets/app-icons/optimized/finder-36.png";
import antigravity14Icon from "../../../assets/app-icons/optimized/antigravity-14.png";
import antigravity18Icon from "../../../assets/app-icons/optimized/antigravity-18.png";
import antigravity28Icon from "../../../assets/app-icons/optimized/antigravity-28.png";
import antigravity36Icon from "../../../assets/app-icons/optimized/antigravity-36.png";
import ghostty14Icon from "../../../assets/app-icons/optimized/ghostty-14.png";
import ghostty18Icon from "../../../assets/app-icons/optimized/ghostty-18.png";
import ghostty28Icon from "../../../assets/app-icons/optimized/ghostty-28.png";
import ghostty36Icon from "../../../assets/app-icons/optimized/ghostty-36.png";
import vscode14Icon from "../../../assets/app-icons/optimized/vscode-14.png";
import vscode18Icon from "../../../assets/app-icons/optimized/vscode-18.png";
import vscode28Icon from "../../../assets/app-icons/optimized/vscode-28.png";
import vscode36Icon from "../../../assets/app-icons/optimized/vscode-36.png";
import zed14Icon from "../../../assets/app-icons/optimized/zed-14.png";
import zed18Icon from "../../../assets/app-icons/optimized/zed-18.png";
import zed28Icon from "../../../assets/app-icons/optimized/zed-28.png";
import zed36Icon from "../../../assets/app-icons/optimized/zed-36.png";
import { isMacPlatform } from "../../../utils/platformPaths";

const GENERIC_APP_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><rect x='4' y='3' width='16' height='18' rx='3' ry='3'/><path d='M9 7h6'/><path d='M9 11h6'/><path d='M9 15h4'/></svg>";

export const GENERIC_APP_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  GENERIC_APP_SVG,
)}`;

const GENERIC_FOLDER_SVG =
  "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%239CA3AF' stroke-width='1.75' stroke-linecap='round' stroke-linejoin='round'><path d='M3 7a2 2 0 0 1 2-2h5l2 2h9a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z'/></svg>";

export const GENERIC_FOLDER_ICON = `data:image/svg+xml;utf8,${encodeURIComponent(
  GENERIC_FOLDER_SVG,
)}`;

export type OpenAppIconAsset = {
  src: string;
  srcSet: string;
};

const makeAsset = (oneX: string, twoX: string): OpenAppIconAsset => ({
  src: oneX,
  srcSet: `${oneX} 1x, ${twoX} 2x`,
});

const GENERIC_FOLDER_ICON_ASSET: OpenAppIconAsset = {
  src: GENERIC_FOLDER_ICON,
  srcSet: `${GENERIC_FOLDER_ICON} 1x, ${GENERIC_FOLDER_ICON} 2x`,
};

const KNOWN_OPEN_APP_ICON_ASSETS_14: Record<string, OpenAppIconAsset> = {
  vscode: makeAsset(vscode14Icon, vscode28Icon),
  cursor: makeAsset(cursor14Icon, cursor28Icon),
  zed: makeAsset(zed14Icon, zed28Icon),
  ghostty: makeAsset(ghostty14Icon, ghostty28Icon),
  antigravity: makeAsset(antigravity14Icon, antigravity28Icon),
  finder: makeAsset(finder14Icon, finder28Icon),
};

const KNOWN_OPEN_APP_ICON_ASSETS_18: Record<string, OpenAppIconAsset> = {
  vscode: makeAsset(vscode18Icon, vscode36Icon),
  cursor: makeAsset(cursor18Icon, cursor36Icon),
  zed: makeAsset(zed18Icon, zed36Icon),
  ghostty: makeAsset(ghostty18Icon, ghostty36Icon),
  antigravity: makeAsset(antigravity18Icon, antigravity36Icon),
  finder: makeAsset(finder18Icon, finder36Icon),
};

export function getKnownOpenAppIconAsset(
  id: string,
  size: 14 | 18 = 18,
): OpenAppIconAsset | null {
  if (id === "finder" && !isMacPlatform()) {
    return GENERIC_FOLDER_ICON_ASSET;
  }
  const source = size === 14 ? KNOWN_OPEN_APP_ICON_ASSETS_14 : KNOWN_OPEN_APP_ICON_ASSETS_18;
  return source[id] ?? null;
}

export function getKnownOpenAppIcon(id: string): string | null {
  return getKnownOpenAppIconAsset(id, 18)?.src ?? null;
}
