import { useCallback, useEffect, useState } from "react";
import type { DictationModelStatus } from "../../../types";
import {
  cancelDictationDownload,
  downloadDictationModel,
  getDictationModelStatus,
  removeDictationModel,
} from "../../../services/tauri";
import { subscribeDictationDownload } from "../../../services/events";

type UseDictationModelResult = {
  status: DictationModelStatus | null;
  refresh: () => Promise<void>;
  download: () => Promise<void>;
  cancel: () => Promise<void>;
  remove: () => Promise<void>;
};

export function useDictationModel(modelId: string | null): UseDictationModelResult {
  const [status, setStatus] = useState<DictationModelStatus | null>(null);

  const refresh = useCallback(async () => {
    const next = await getDictationModelStatus(modelId);
    setStatus(next);
  }, [modelId]);

  useEffect(() => {
    let active = true;
    let unlisten: (() => void) | null = null;

    void (async () => {
      try {
        const next = await getDictationModelStatus(modelId);
        if (active) {
          setStatus(next);
        }
      } catch {
        // Ignore dictation status errors during startup.
      }

      try {
        const handler = await subscribeDictationDownload((event) => {
          if (!modelId || event.modelId === modelId) {
            setStatus(event);
          }
        });
        if (active) {
          unlisten = handler;
        } else {
          handler();
        }
      } catch {
        // Ignore dictation event errors.
      }
    })();

    return () => {
      active = false;
      if (unlisten) {
        unlisten();
      }
    };
  }, [modelId]);

  const download = useCallback(async () => {
    const next = await downloadDictationModel(modelId);
    setStatus(next);
  }, [modelId]);

  const cancel = useCallback(async () => {
    const next = await cancelDictationDownload(modelId);
    setStatus(next);
  }, [modelId]);

  const remove = useCallback(async () => {
    const next = await removeDictationModel(modelId);
    setStatus(next);
  }, [modelId]);

  return {
    status,
    refresh,
    download,
    cancel,
    remove,
  };
}
