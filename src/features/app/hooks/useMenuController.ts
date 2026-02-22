import { useCallback, useRef, useState } from "react";
import type { MutableRefObject } from "react";

import { useDismissibleMenu } from "./useDismissibleMenu";

type OpenStateUpdater = boolean | ((current: boolean) => boolean);

type UseMenuControllerOptions = {
  open?: boolean;
  defaultOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  onDismiss?: () => void;
  closeOnEscape?: boolean;
};

type MenuController = {
  isOpen: boolean;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  setOpen: (next: OpenStateUpdater) => void;
  open: () => void;
  close: () => void;
  toggle: () => void;
};

function resolveNextOpen(current: boolean, next: OpenStateUpdater): boolean {
  return typeof next === "function" ? next(current) : next;
}

export function useMenuController({
  open: controlledOpen,
  defaultOpen = false,
  onOpenChange,
  onDismiss,
  closeOnEscape = true,
}: UseMenuControllerOptions = {}): MenuController {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen);
  const isControlled = controlledOpen !== undefined;
  const isOpen = isControlled ? controlledOpen : uncontrolledOpen;
  const containerRef = useRef<HTMLDivElement | null>(null);

  const setOpen = useCallback(
    (next: OpenStateUpdater) => {
      if (isControlled) {
        const current = controlledOpen ?? false;
        const resolvedNext = resolveNextOpen(current, next);
        if (resolvedNext !== current) {
          onOpenChange?.(resolvedNext);
        }
        return;
      }

      setUncontrolledOpen((current) => {
        const resolvedNext = resolveNextOpen(current, next);
        if (resolvedNext !== current) {
          onOpenChange?.(resolvedNext);
        }
        return resolvedNext;
      });
    },
    [controlledOpen, isControlled, onOpenChange],
  );

  const open = useCallback(() => setOpen(true), [setOpen]);
  const close = useCallback(() => setOpen(false), [setOpen]);
  const toggle = useCallback(() => setOpen((current) => !current), [setOpen]);
  const dismiss = useCallback(() => {
    close();
    onDismiss?.();
  }, [close, onDismiss]);

  useDismissibleMenu({
    isOpen,
    containerRef,
    onClose: dismiss,
    closeOnEscape,
  });

  return {
    isOpen,
    containerRef,
    setOpen,
    open,
    close,
    toggle,
  };
}
