import type { MouseEventHandler, ReactNode } from "react";
import { joinClassNames } from "../classNames";

type ModalShellProps = {
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  onBackdropClick?: MouseEventHandler<HTMLElement>;
  ariaLabel?: string;
  ariaLabelledBy?: string;
  ariaDescribedBy?: string;
};

export function ModalShell({
  children,
  className,
  cardClassName,
  onBackdropClick,
  ariaLabel,
  ariaLabelledBy,
  ariaDescribedBy,
}: ModalShellProps) {
  return (
    <div
      className={joinClassNames("ds-modal", className)}
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      aria-labelledby={ariaLabelledBy}
      aria-describedby={ariaDescribedBy}
    >
      <button
        type="button"
        className="ds-modal-backdrop"
        onClick={onBackdropClick}
        aria-label="关闭弹窗"
        tabIndex={-1}
      />
      <div className={joinClassNames("ds-modal-card", cardClassName)}>{children}</div>
    </div>
  );
}
