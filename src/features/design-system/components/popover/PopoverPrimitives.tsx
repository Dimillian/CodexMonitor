import { forwardRef, type ComponentPropsWithoutRef, type ReactNode } from "react";
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
