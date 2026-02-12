import { prepareThreadItems } from "@utils/threadItems";
import type { ThreadAction, ThreadState } from "../useThreadsReducer";

function normalizeMaxItemsPerThread(value: number | null): number | null {
  if (value === null) {
    return null;
  }
  if (typeof value !== "number" || !Number.isFinite(value) || value <= 0) {
    return 200;
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

      const nextItemsByThread: ThreadState["itemsByThread"] = {};
      for (const [threadId, items] of Object.entries(state.itemsByThread)) {
        nextItemsByThread[threadId] = prepareThreadItems(items, {
          maxItemsPerThread: normalized,
        });
      }

      return {
        ...state,
        maxItemsPerThread: normalized,
        itemsByThread: nextItemsByThread,
      };
    }
    default:
      return state;
  }
}
