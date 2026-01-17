import {
  DEFAULT_OPEN_APP_ID,
  OPEN_APP_STORAGE_KEY,
  type OpenAppId,
} from "../constants";

export function getStoredOpenAppId(): OpenAppId {
  const stored = window.localStorage.getItem(OPEN_APP_STORAGE_KEY);
  if (
    stored === "vscode" ||
    stored === "cursor" ||
    stored === "zed" ||
    stored === "ghostty" ||
    stored === "antigravity" ||
    stored === "finder"
  ) {
    return stored;
  }
  return DEFAULT_OPEN_APP_ID;
}
