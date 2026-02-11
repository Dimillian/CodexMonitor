import { useCallback } from "react";
import { buildThreadTranscript } from "@utils/threadText";
import type { ConversationItem, DebugEntry } from "@/types";

type CopyThreadOptions = {
  activeItems: ConversationItem[];
  onDebug: (entry: DebugEntry) => void;
};

export function useCopyThread({ activeItems, onDebug }: CopyThreadOptions) {
  const handleCopyThread = useCallback(async () => {
    if (!activeItems.length) {
      return;
    }
    const transcript = buildThreadTranscript(activeItems);
    if (!transcript) {
      return;
    }
    try {
      await navigator.clipboard.writeText(transcript);
    } catch (error) {
      onDebug({
        id: `${Date.now()}-client-copy-thread-error`,
        timestamp: Date.now(),
        source: "error",
        label: "thread/copy error",
        payload: error instanceof Error ? error.message : String(error),
      });
    }
  }, [activeItems, onDebug]);

  return { handleCopyThread };
}
