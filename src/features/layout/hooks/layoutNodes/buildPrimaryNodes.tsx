import ArrowLeft from "lucide-react/dist/esm/icons/arrow-left";
import { Sidebar } from "../../../app/components/Sidebar";
import { Home } from "../../../home/components/Home";
import { MainHeader } from "../../../app/components/MainHeader";
import { Messages } from "../../../messages/components/Messages";
import { ApprovalToasts } from "../../../app/components/ApprovalToasts";
import { UpdateToast } from "../../../update/components/UpdateToast";
import { ErrorToasts } from "../../../notifications/components/ErrorToasts";
import { Composer } from "../../../composer/components/Composer";
import { TabBar } from "../../../app/components/TabBar";
import { TabletNav } from "../../../app/components/TabletNav";
import type { TranslateText } from "@/i18n";
import type {
  LayoutNodesResult,
  LayoutPrimarySurface,
} from "./types";

export type PrimaryLayoutNodesOptions = LayoutPrimarySurface;

type PrimaryLayoutNodes = Pick<
  LayoutNodesResult,
  | "sidebarNode"
  | "messagesNode"
  | "composerNode"
  | "approvalToastsNode"
  | "updateToastNode"
  | "errorToastsNode"
  | "homeNode"
  | "mainHeaderNode"
  | "desktopTopbarLeftNode"
  | "tabletNavNode"
  | "tabBarNode"
>;

export function buildPrimaryNodes(
  options: PrimaryLayoutNodesOptions,
  tx: TranslateText,
): PrimaryLayoutNodes {
  const sidebarNode = <Sidebar {...options.sidebarProps} />;

  const messagesNode = <Messages {...options.messagesProps} />;

  const composerNode = options.composerProps ? <Composer {...options.composerProps} /> : null;

  const approvalToastsNode = <ApprovalToasts {...options.approvalToastsProps} />;

  const updateToastNode = <UpdateToast {...options.updateToastProps} />;

  const errorToastsNode = <ErrorToasts {...options.errorToastsProps} />;

  const homeNode = <Home {...options.homeProps} />;

  const mainHeaderNode = options.mainHeaderProps ? (
    <MainHeader {...options.mainHeaderProps} />
  ) : null;

  const desktopTopbarLeftNode = (
    <>
      {options.desktopTopbarProps.showBackToChat && (
        <button
          className="icon-button back-button"
          onClick={options.desktopTopbarProps.onExitDiff}
          aria-label={tx("Back to chat")}
        >
          <ArrowLeft aria-hidden />
        </button>
      )}
      {mainHeaderNode}
    </>
  );

  const tabletNavNode = (
    <TabletNav {...options.tabletNavProps} />
  );

  const tabBarNode = <TabBar {...options.tabBarProps} />;

  return {
    sidebarNode,
    messagesNode,
    composerNode,
    approvalToastsNode,
    updateToastNode,
    errorToastsNode,
    homeNode,
    mainHeaderNode,
    desktopTopbarLeftNode,
    tabletNavNode,
    tabBarNode,
  };
}
