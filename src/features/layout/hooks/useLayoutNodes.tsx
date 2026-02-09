import { buildGitNodes } from "./layoutNodes/buildGitNodes";
import { buildPrimaryNodes } from "./layoutNodes/buildPrimaryNodes";
import { buildSecondaryNodes } from "./layoutNodes/buildSecondaryNodes";
import type { LayoutNodesOptions, LayoutNodesResult } from "./layoutNodes/types";

export function useLayoutNodes(options: LayoutNodesOptions): LayoutNodesResult {
  return {
    ...buildPrimaryNodes(options),
    ...buildGitNodes(options),
    ...buildSecondaryNodes(options),
  };
}
