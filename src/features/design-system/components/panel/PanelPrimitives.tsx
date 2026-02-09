import type { ComponentPropsWithoutRef, ReactNode } from "react";
import ChevronRight from "lucide-react/dist/esm/icons/chevron-right";
import { joinClassNames } from "../classNames";

type PanelFrameProps = {
  children: ReactNode;
  className?: string;
};

export function PanelFrame({ children, className }: PanelFrameProps) {
  return <aside className={joinClassNames("ds-panel", className)}>{children}</aside>;
}

type PanelHeaderProps = {
  children: ReactNode;
  className?: string;
};

export function PanelHeader({ children, className }: PanelHeaderProps) {
  return <div className={joinClassNames("ds-panel-header", className)}>{children}</div>;
}

type PanelMetaProps = {
  children: ReactNode;
  className?: string;
};

export function PanelMeta({ children, className }: PanelMetaProps) {
  return <div className={joinClassNames("ds-panel-meta", className)}>{children}</div>;
}

type PanelSearchFieldProps = Omit<ComponentPropsWithoutRef<"input">, "className" | "type"> & {
  className?: string;
  inputClassName?: string;
  icon?: ReactNode;
  trailing?: ReactNode;
};

export function PanelSearchField({
  className,
  inputClassName,
  icon,
  trailing,
  ...props
}: PanelSearchFieldProps) {
  return (
    <div className={joinClassNames("ds-panel-search", className)}>
      {icon ? (
        <span className="ds-panel-search-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <input
        type="search"
        className={joinClassNames("ds-panel-search-input", inputClassName)}
        {...props}
      />
      {trailing}
    </div>
  );
}

type PanelNavListProps = {
  children: ReactNode;
  className?: string;
};

export function PanelNavList({ children, className }: PanelNavListProps) {
  return <div className={joinClassNames("ds-panel-nav", className)}>{children}</div>;
}

type PanelNavItemProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
  showDisclosure?: boolean;
};

export function PanelNavItem({
  className,
  icon,
  active = false,
  showDisclosure = false,
  children,
  ...props
}: PanelNavItemProps) {
  return (
    <button
      type="button"
      className={joinClassNames("ds-panel-nav-item", active && "is-active", className)}
      {...props}
    >
      <span className="ds-panel-nav-item-main">
        {icon ? (
          <span className="ds-panel-nav-item-icon" aria-hidden>
            {icon}
          </span>
        ) : null}
        <span className="ds-panel-nav-item-label">{children}</span>
      </span>
      {showDisclosure ? (
        <span className="ds-panel-nav-item-disclosure" aria-hidden>
          <ChevronRight />
        </span>
      ) : null}
    </button>
  );
}
