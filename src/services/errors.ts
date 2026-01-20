/**
 * Frontend error handling and user-facing error mapping
 *
 * This module provides utilities for converting backend IPC errors
 * into user-friendly UI messages with actionable remediation steps.
 *
 * @module services/errors
 */

/**
 * Structured IPC error from backend
 */
export interface IPCError {
  code: ErrorCode;
  message: string;
  remediation?: string;
  details?: ErrorDetails;
  correlationId: string;
  timestamp: string;
}

/**
 * Machine-readable error codes
 */
export type ErrorCode =
  | "validation_error"
  | "workspace_not_found"
  | "workspace_not_connected"
  | "app_server_not_ready"
  | "app_server_error"
  | "filesystem_error"
  | "process_error"
  | "git_error"
  | "timeout_error"
  | "internal_error";

/**
 * Additional error context
 */
export interface ErrorDetails {
  workspaceId?: string;
  command?: string;
  field?: string;
  validationErrors?: string[];
}

/**
 * User-facing error UI representation
 */
export interface ErrorUI {
  severity: "low" | "medium" | "high";
  title: string;
  message: string;
  action: string;
  showDetails: boolean;
}

/**
 * Error remediation mappings for common error codes
 */
export const ERROR_REMEDIATION: Record<ErrorCode, { message: string; action: string }> = {
  validation_error: {
    message: "Invalid input provided",
    action: "Check your input and try again",
  },
  workspace_not_connected: {
    message: "Workspace is not connected",
    action: "Click 'Connect' to reconnect",
  },
  app_server_not_ready: {
    message: "Codex app-server is initializing",
    action: "Wait a moment and try again",
  },
  app_server_error: {
    message: "Codex app-server encountered an error",
    action: "Check the debug panel for details",
  },
  filesystem_error: {
    message: "Filesystem operation failed",
    action: "Check file permissions and try again",
  },
  process_error: {
    message: "Process operation failed",
    action: "The command could not be executed",
  },
  git_error: {
    message: "Git operation failed",
    action: "Check that git is installed and the repository is valid",
  },
  timeout_error: {
    message: "Operation timed out",
    action: "Try again. If the problem persists, check system resources.",
  },
  workspace_not_found: {
    message: "Workspace not found",
    action: "Check the workspace ID and try again",
  },
  internal_error: {
    message: "An unexpected error occurred",
    action: "Try again or contact support if the issue persists",
  },
};

/**
 * Get the severity level for an error code
 */
function getSeverity(code: ErrorCode): "low" | "medium" | "high" {
  const high: ErrorCode[] = ["workspace_not_connected", "app_server_error"];
  const medium: ErrorCode[] = ["filesystem_error", "process_error", "git_error"];

  if (high.includes(code)) return "high";
  if (medium.includes(code)) return "medium";
  return "low";
}

/**
 * Check if detailed error information should be shown
 */
function hasDetails(code: ErrorCode): boolean {
  return [
    "validation_error",
    "app_server_error",
    "git_error",
    "filesystem_error",
  ].includes(code);
}

/**
 * Convert an IPC error to a user-facing error UI
 *
 * This function maps backend error codes to user-friendly messages
 * and provides actionable remediation steps.
 *
 * @param error - The IPC error from the backend
 * @returns A user-facing error UI representation
 */
export function getErrorUI(error: IPCError): ErrorUI {
  const remediation = ERROR_REMEDIATION[error.code];
  return {
    severity: getSeverity(error.code),
    title: remediation.message,
    message: error.message,
    action: error.remediation || remediation.action,
    showDetails: hasDetails(error.code),
  };
}

/**
 * Parse an error string from Tauri invoke
 *
 * Tauri returns errors as strings, so we need to parse them
 * back into structured error objects.
 *
 * @param errorString - The error string from Tauri
 * @returns A structured IPC error, or a generic error if parsing fails
 */
export function parseTauriError(errorString: string): IPCError {
  try {
    return JSON.parse(errorString) as IPCError;
  } catch {
    // If parsing fails, return a generic internal error
    return {
      code: "internal_error",
      message: errorString,
      correlationId: "",
      timestamp: new Date().toISOString(),
    };
  }
}

/**
 * Check if an error is retryable
 *
 * This is used to determine whether to show a "Retry" button
 * in the error UI.
 *
 * @param code - The error code to check
 * @returns True if the error might succeed on retry
 */
export function isRetryableError(code: ErrorCode): boolean {
  return ["timeout_error", "app_server_not_ready"].includes(code);
}
