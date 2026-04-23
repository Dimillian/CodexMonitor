import { buildGitNodes } from "./layoutNodes/buildGitNodes";
import type { GitLayoutNodesOptions } from "./layoutNodes/buildGitNodes";
import { buildPrimaryNodes } from "./layoutNodes/buildPrimaryNodes";
import type { PrimaryLayoutNodesOptions } from "./layoutNodes/buildPrimaryNodes";
import { buildSecondaryNodes } from "./layoutNodes/buildSecondaryNodes";
import type { SecondaryLayoutNodesOptions } from "./layoutNodes/buildSecondaryNodes";
import type { LayoutNodesOptions, LayoutNodesResult } from "./layoutNodes/types";
import { useI18n } from "@/i18n";

export function useLayoutNodes(options: LayoutNodesOptions): LayoutNodesResult {
  const { tx } = useI18n();
  const primaryOptions: PrimaryLayoutNodesOptions = options.primary;
  const gitOptions: GitLayoutNodesOptions = options.git;
  const secondaryOptions: SecondaryLayoutNodesOptions = options.secondary;

  return {
    ...buildPrimaryNodes(primaryOptions, tx),
    ...buildGitNodes(gitOptions),
    ...buildSecondaryNodes(secondaryOptions, tx),
  };
}
