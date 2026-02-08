import type { MouseEventHandler, ReactNode } from "react";
import { joinClassNames } from "../classNames";

type ModalShellProps = {
  children: ReactNode;
  className?: string;
  cardClassName?: string;
  onBackdropClick?: MouseEventHandler<HTMLDivElement>;
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
      <div className="ds-modal-backdrop" onClick={onBackdropClick} />
      <div className={joinClassNames("ds-modal-card", cardClassName)}>{children}</div>
    </div>
  );
}
