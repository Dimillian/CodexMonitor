import { CHAT_SCROLLBACK_DEFAULT } from "@utils/chatScrollback";
import type { ThreadAction, ThreadState } from "../useThreadsReducer";

function normalizeMaxItemsPerThread(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return CHAT_SCROLLBACK_DEFAULT;
  }
  return Math.floor(value);
}

export function reduceThreadConfig(state: ThreadState, action: ThreadAction): ThreadState {
  switch (action.type) {
    case "setMaxItemsPerThread": {
      const normalized = normalizeMaxItemsPerThread(action.maxItemsPerThread);
      if (state.maxItemsPerThread === normalized) {
        return state;
      }

      let itemsByThread = state.itemsByThread;
      if (normalized !== null) {
        for (const [threadId, items] of Object.entries(state.itemsByThread)) {
          if (items.length <= normalized) {
            continue;
          }
          if (itemsByThread === state.itemsByThread) {
            itemsByThread = { ...state.itemsByThread };
          }
          itemsByThread[threadId] = items.slice(-normalized);
        }
      }

      return {
        ...state,
        maxItemsPerThread: normalized,
        itemsByThread,
      };
    }
    default:
      return state;
  }
}
