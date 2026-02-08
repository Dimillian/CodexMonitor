import type { ComponentPropsWithoutRef, ReactNode } from "react";
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
