import {
  forwardRef,
  type ComponentPropsWithoutRef,
  type ReactNode,
  type RefObject,
} from "react";
import { joinClassNames } from "../classNames";

type PopoverSurfaceProps = ComponentPropsWithoutRef<"div"> & {
  children: ReactNode;
};

export const PopoverSurface = forwardRef<HTMLDivElement, PopoverSurfaceProps>(
  function PopoverSurface({ className, ...props }, ref) {
    return <div ref={ref} className={joinClassNames("ds-popover", className)} {...props} />;
  },
);

type PopoverMenuItemProps = Omit<ComponentPropsWithoutRef<"button">, "children"> & {
  children: ReactNode;
  icon?: ReactNode;
  active?: boolean;
};

export function PopoverMenuItem({
  className,
  icon,
  active = false,
  children,
  ...props
}: PopoverMenuItemProps) {
  return (
    <button
      type="button"
      className={joinClassNames("ds-popover-item", active && "is-active", className)}
      {...props}
    >
      {icon ? (
        <span className="ds-popover-item-icon" aria-hidden>
          {icon}
        </span>
      ) : null}
      <span className="ds-popover-item-label">{children}</span>
    </button>
  );
}

type MenuTriggerProps = Omit<
  ComponentPropsWithoutRef<"button">,
  "aria-expanded" | "aria-haspopup"
> & {
  isOpen: boolean;
  popupRole?: "menu" | "dialog";
  activeClassName?: string;
  "data-tauri-drag-region"?: string;
};

export function MenuTrigger({
  isOpen,
  popupRole = "menu",
  className,
  activeClassName,
  "data-tauri-drag-region": dragRegion,
  ...props
}: MenuTriggerProps) {
  return (
    <button
      type="button"
      aria-haspopup={popupRole}
      aria-expanded={isOpen}
      className={joinClassNames(className, isOpen && activeClassName)}
      data-tauri-drag-region={dragRegion ?? "false"}
      {...props}
    />
  );
}

type SplitActionMenuProps = {
  containerRef?: RefObject<HTMLDivElement | null>;
  className?: string;
  buttonGroupClassName?: string;
  actionButton: ReactNode;
  isOpen: boolean;
  onToggle: () => void;
  toggleClassName?: string;
  toggleAriaLabel: string;
  toggleTitle?: string;
  toggleIcon: ReactNode;
  popoverClassName?: string;
  popoverRole?: "menu" | "dialog";
  children: ReactNode;
};

export function SplitActionMenu({
  containerRef,
  className,
  buttonGroupClassName,
  actionButton,
  isOpen,
  onToggle,
  toggleClassName,
  toggleAriaLabel,
  toggleTitle,
  toggleIcon,
  popoverClassName,
  popoverRole = "menu",
  children,
}: SplitActionMenuProps) {
  return (
    <div className={className} ref={containerRef}>
      <div className={buttonGroupClassName}>
        {actionButton}
        <MenuTrigger
          isOpen={isOpen}
          popupRole={popoverRole}
          className={toggleClassName}
          onClick={onToggle}
          aria-label={toggleAriaLabel}
          title={toggleTitle}
        >
          {toggleIcon}
        </MenuTrigger>
      </div>
      {isOpen && (
        <PopoverSurface className={popoverClassName} role={popoverRole}>
          {children}
        </PopoverSurface>
      )}
    </div>
  );
}
