import type { ErrorToast } from "../../../services/toasts";
import {
  ToastBody,
  ToastCard,
  ToastHeader,
  ToastTitle,
  ToastViewport,
} from "../../design-system/components/toast/ToastPrimitives";
import { useI18n } from "@/i18n";

type ErrorToastsProps = {
  toasts: ErrorToast[];
  onDismiss: (id: string) => void;
};

export function ErrorToasts({ toasts, onDismiss }: ErrorToastsProps) {
  const { tx } = useI18n();

  if (!toasts.length) {
    return null;
  }

  return (
    <ToastViewport className="error-toasts" role="region" ariaLive="assertive">
      {toasts.map((toast) => (
        <ToastCard key={toast.id} className="error-toast" role="alert">
          <ToastHeader className="error-toast-header">
            <ToastTitle className="error-toast-title">{toast.title}</ToastTitle>
            <button
              type="button"
              className="ghost error-toast-dismiss"
              onClick={() => onDismiss(toast.id)}
              aria-label={tx("Dismiss error")}
              title={tx("Dismiss")}
            >
              ×
            </button>
          </ToastHeader>
          <ToastBody className="error-toast-body">{toast.message}</ToastBody>
        </ToastCard>
      ))}
    </ToastViewport>
  );
}
