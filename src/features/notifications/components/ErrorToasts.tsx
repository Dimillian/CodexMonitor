import type { ErrorToast } from "../../../services/toasts";
import {
  ToastBody,
  ToastCard,
  ToastHeader,
  ToastTitle,
  ToastViewport,
} from "../../design-system/components/toast/ToastPrimitives";
import { useTranslation } from "react-i18next";

type ErrorToastsProps = {
  toasts: ErrorToast[];
  onDismiss: (id: string) => void;
};

export function ErrorToasts({ toasts, onDismiss }: ErrorToastsProps) {
  const { t } = useTranslation();

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
              aria-label={t("git_diff.close_error")}
              title={t("common.close")}
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
