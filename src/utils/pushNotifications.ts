import {
  isPermissionGranted,
  requestPermission,
  sendNotification,
} from "@tauri-apps/plugin-notification";
import type { DebugEntry } from "../types";
import type { NativeNotificationPayload } from "../types";
import { sendNativeNotification } from "../services/tauri";

type DebugLogger = (entry: DebugEntry) => void;

export type PushNotificationPayload = {
  title: string;
  body?: string;
};

let permissionPromise: Promise<boolean> | null = null;
let permissionGranted: boolean | null = null;

async function ensureNotificationPermission(onDebug?: DebugLogger) {
  if (permissionGranted !== null) {
    return permissionGranted;
  }

  if (!permissionPromise) {
    permissionPromise = (async () => {
      try {
        let granted = await isPermissionGranted();
        if (!granted) {
          const permission = await requestPermission();
          granted = permission === "granted";
        }
        permissionGranted = granted;
        return granted;
      } catch (error) {
        onDebug?.({
          id: `${Date.now()}-notification-permission-error`,
          timestamp: Date.now(),
          source: "error",
          label: "notification/permission error",
          payload: error instanceof Error ? error.message : String(error),
        });
        permissionGranted = false;
        return false;
      } finally {
        permissionPromise = null;
      }
    })();
  }

  return permissionPromise;
}

export async function sendLocalNotification(
  payload: PushNotificationPayload,
  onDebug?: DebugLogger,
  target?: NativeNotificationPayload,
) {
  const allowed = await ensureNotificationPermission(onDebug);
  if (!allowed) {
    return false;
  }
  try {
    if (target) {
      const handled = await sendNativeNotification(target);
      if (handled) {
        return true;
      }
    }
    sendNotification(payload);
    return true;
  } catch (error) {
    onDebug?.({
      id: `${Date.now()}-notification-send-error`,
      timestamp: Date.now(),
      source: "error",
      label: "notification/send error",
      payload: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}
