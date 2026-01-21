import { useCallback, useRef } from "react";
import { useUpdater } from "../../update/hooks/useUpdater";
import { useAgentSoundNotifications } from "../../notifications/hooks/useAgentSoundNotifications";
import { useWindowFocusState } from "../../layout/hooks/useWindowFocusState";
import { useTauriEvent } from "./useTauriEvent";
import { playNotificationSound } from "../../../utils/notificationSounds";
import { subscribeUpdaterCheck } from "../../../services/events";
import type { DebugEntry } from "../../../types";

type Params = {
  notificationSoundsEnabled: boolean;
  onDebug: (entry: DebugEntry) => void;
  successSoundUrl: string;
  errorSoundUrl: string;
};

export function useUpdaterController({
  notificationSoundsEnabled,
  onDebug,
  successSoundUrl,
  errorSoundUrl,
}: Params) {
  const { state: updaterState, startUpdate, checkForUpdates, dismiss } = useUpdater({
    onDebug,
  });
  const isWindowFocused = useWindowFocusState();
  const nextTestSoundIsError = useRef(false);

  const subscribeUpdaterCheckEvent = useCallback(
    (handler: () => void) =>
      subscribeUpdaterCheck(handler, {
        onError: (error) => {
          onDebug({
            id: `${Date.now()}-client-updater-menu-error`,
            timestamp: Date.now(),
            source: "error",
            label: "updater/menu-error",
            payload: error instanceof Error ? error.message : String(error),
          });
        },
      }),
    [onDebug],
  );

  useTauriEvent(subscribeUpdaterCheckEvent, () => {
    void checkForUpdates({ announceNoUpdate: true });
  });

  useAgentSoundNotifications({
    enabled: notificationSoundsEnabled,
    isWindowFocused,
    onDebug,
  });

  const handleTestNotificationSound = useCallback(() => {
    const useError = nextTestSoundIsError.current;
    nextTestSoundIsError.current = !useError;
    const type = useError ? "error" : "success";
    const url = useError ? errorSoundUrl : successSoundUrl;
    playNotificationSound(url, type, onDebug);
  }, [errorSoundUrl, onDebug, successSoundUrl]);

  return {
    updaterState,
    startUpdate,
    checkForUpdates,
    dismissUpdate: dismiss,
    handleTestNotificationSound,
  };
}
