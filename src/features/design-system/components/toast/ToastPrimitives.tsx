import type { AriaRole, ComponentPropsWithoutRef, ReactNode } from "react";
import { joinClassNames } from "../classNames";

type ToastViewportProps = Omit<ComponentPropsWithoutRef<"div">, "children" | "role"> & {
  children: ReactNode;
  className?: string;
  role?: AriaRole;
  ariaLive?: "off" | "polite" | "assertive";
};

export function ToastViewport({
  children,
  className,
  role,
  ariaLive,
  ...props
}: ToastViewportProps) {
  return (
    <div
      className={joinClassNames("ds-toast-viewport", className)}
      role={role}
      aria-live={ariaLive}
      {...props}
    >
      {children}
    </div>
  );
}

type ToastCardProps = Omit<ComponentPropsWithoutRef<"div">, "children" | "role"> & {
  children: ReactNode;
  className?: string;
  role?: AriaRole;
};

export function ToastCard({ children, className, role, ...props }: ToastCardProps) {
  return (
    <div className={joinClassNames("ds-toast-card", className)} role={role} {...props}>
      {children}
    </div>
  );
}

type ToastTextProps = ComponentPropsWithoutRef<"div">;

export function ToastTitle({ className, ...props }: ToastTextProps) {
  return <div className={joinClassNames("ds-toast-title", className)} {...props} />;
}

export function ToastBody({ className, ...props }: ToastTextProps) {
  return <div className={joinClassNames("ds-toast-body", className)} {...props} />;
}

type ToastSectionProps = ComponentPropsWithoutRef<"div">;

export function ToastHeader({ className, ...props }: ToastSectionProps) {
  return <div className={joinClassNames("ds-toast-header", className)} {...props} />;
}

export function ToastActions({ className, ...props }: ToastSectionProps) {
  return <div className={joinClassNames("ds-toast-actions", className)} {...props} />;
}

type ToastErrorProps = ComponentPropsWithoutRef<"pre">;

export function ToastError({ className, ...props }: ToastErrorProps) {
  return <pre className={joinClassNames("ds-toast-error", className)} {...props} />;
}
