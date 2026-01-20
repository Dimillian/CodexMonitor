#![allow(dead_code)]

//! Structured error handling with correlation IDs
//!
//! This module provides a comprehensive error handling system for IPC calls.
//! All errors include:
//! - A machine-readable error code
//! - Human-readable message
//! - Optional remediation steps
//! - Optional detailed context
//! - Correlation ID for tracing
//! - Timestamp
//!
//! # Example
//!
//! ```rust
//! use codex_monitor_lib::error::{IPCError, ErrorCode, workspace_not_connected, ErrorDetails};
//!
//! // Using the helper function
//! let error = workspace_not_connected("my-workspace");
//!
//! // Or building directly
//! let error = IPCError::new(ErrorCode::ValidationError, "Invalid input")
//!     .with_remediation("Check your input and try again")
//!     .with_details(ErrorDetails {
//!         field: Some("workspace_id".to_string()),
//!         ..Default::default()
//!     });
//! ```

use serde::{Deserialize, Serialize};
use std::fmt;
use uuid::Uuid;
use chrono::Utc;

/// Structured IPC error with full context
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct IPCError {
    /// Machine-readable error code
    pub code: ErrorCode,
    /// Human-readable error message
    pub message: String,
    /// Optional remediation steps for the user
    #[serde(skip_serializing_if = "Option::is_none")]
    pub remediation: Option<String>,
    /// Additional error context
    #[serde(skip_serializing_if = "Option::is_none")]
    pub details: Option<ErrorDetails>,
    /// Correlation ID for tracing this specific error instance
    #[serde(skip_serializing_if = "Option::is_none")]
    pub correlation_id: Option<String>,
    /// ISO 8601 timestamp of when the error occurred
    pub timestamp: String,
}

impl fmt::Display for IPCError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        write!(
            f,
            "[{}:{}] {}",
            self.code,
            self.correlation_id.as_deref().unwrap_or("no-id"),
            self.message
        )
    }
}

impl std::error::Error for IPCError {}

impl IPCError {
    /// Create a new error with the given code and message
    ///
    /// This automatically generates a correlation ID and timestamp.
    pub fn new(code: ErrorCode, message: impl Into<String>) -> Self {
        Self {
            code,
            message: message.into(),
            remediation: None,
            details: None,
            correlation_id: Some(Uuid::new_v4().to_string()),
            timestamp: Utc::now().to_rfc3339(),
        }
    }

    /// Add remediation steps to this error
    #[must_use]
    pub fn with_remediation(mut self, remediation: impl Into<String>) -> Self {
        self.remediation = Some(remediation.into());
        self
    }

    /// Add detailed error context
    #[must_use]
    pub fn with_details(mut self, details: ErrorDetails) -> Self {
        self.details = Some(details);
        self
    }

    /// Convert to a String for use with Tauri's Result type
    pub fn to_json(&self) -> String {
        serde_json::to_string(self).unwrap_or_else(|_| self.message.clone())
    }
}

/// Additional error details for debugging
#[derive(Debug, Clone, Deserialize, Serialize, Default)]
#[serde(rename_all = "camelCase")]
pub struct ErrorDetails {
    /// Workspace ID if relevant
    #[serde(skip_serializing_if = "Option::is_none")]
    pub workspace_id: Option<String>,
    /// IPC command that failed
    #[serde(skip_serializing_if = "Option::is_none")]
    pub command: Option<String>,
    /// Specific field that failed validation
    #[serde(skip_serializing_if = "Option::is_none")]
    pub field: Option<String>,
    /// Multiple validation errors
    #[serde(skip_serializing_if = "Option::is_none")]
    pub validation_errors: Option<Vec<String>>,
}

/// Categorized error codes for machine-readable error handling
#[derive(Debug, Clone, Deserialize, Serialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ErrorCode {
    /// Input validation failed
    ValidationError,
    /// Workspace not found in configuration
    WorkspaceNotFound,
    /// Workspace exists but is not connected
    WorkspaceNotConnected,
    /// Codex app-server not ready yet
    AppServerNotReady,
    /// Codex app-server returned an error
    AppServerError,
    /// Filesystem operation failed
    FilesystemError,
    /// Process operation failed
    ProcessError,
    /// Git operation failed
    GitError,
    /// Timeout occurred
    TimeoutError,
    /// Internal application error
    InternalError,
}

impl fmt::Display for ErrorCode {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        let code = match self {
            ErrorCode::ValidationError => "validation_error",
            ErrorCode::WorkspaceNotFound => "workspace_not_found",
            ErrorCode::WorkspaceNotConnected => "workspace_not_connected",
            ErrorCode::AppServerNotReady => "app_server_not_ready",
            ErrorCode::AppServerError => "app_server_error",
            ErrorCode::FilesystemError => "filesystem_error",
            ErrorCode::ProcessError => "process_error",
            ErrorCode::GitError => "git_error",
            ErrorCode::TimeoutError => "timeout_error",
            ErrorCode::InternalError => "internal_error",
        };
        write!(f, "{}", code)
    }
}

/// Error classification for retry logic
///
/// This trait determines whether an error is retryable (transient)
/// or permanent. This prevents infinite retry loops on permanent failures.
pub trait IsRetryable {
    /// Returns true if this error might succeed on retry
    fn is_retryable(&self) -> bool;
}

impl IsRetryable for ErrorCode {
    fn is_retryable(&self) -> bool {
        match self {
            // Transient errors - retry with backoff
            ErrorCode::TimeoutError | ErrorCode::AppServerNotReady => true,
            // Permanent errors - don't retry
            ErrorCode::ValidationError
            | ErrorCode::WorkspaceNotFound
            | ErrorCode::WorkspaceNotConnected
            | ErrorCode::AppServerError
            | ErrorCode::FilesystemError
            | ErrorCode::ProcessError
            | ErrorCode::GitError
            | ErrorCode::InternalError => false,
        }
    }
}

// ===== Helper functions for common errors =====

/// Create a validation error
pub fn validation_error(msg: &str, remediation: Option<&str>) -> IPCError {
    let mut error = IPCError::new(ErrorCode::ValidationError, msg);
    if let Some(r) = remediation {
        error = error.with_remediation(r);
    }
    error
}

/// Create a "workspace not connected" error
pub fn workspace_not_connected(workspace_id: &str) -> IPCError {
    IPCError::new(
        ErrorCode::WorkspaceNotConnected,
        format!("Workspace '{}' is not connected", workspace_id),
    )
    .with_remediation("Click 'Connect' in the workspaces panel to reconnect.")
    .with_details(ErrorDetails {
        workspace_id: Some(workspace_id.to_string()),
        command: Some("connect_workspace".to_string()),
        ..Default::default()
    })
}

/// Create a "workspace not found" error
pub fn workspace_not_found(workspace_id: &str) -> IPCError {
    IPCError::new(
        ErrorCode::WorkspaceNotFound,
        format!("Workspace '{}' not found", workspace_id),
    )
    .with_remediation("Check the workspace ID and try again.")
    .with_details(ErrorDetails {
        workspace_id: Some(workspace_id.to_string()),
        field: Some("workspace_id".to_string()),
        ..Default::default()
    })
}

/// Create a timeout error
pub fn timeout_error(operation: &str, duration_secs: u64) -> IPCError {
    IPCError::new(
        ErrorCode::TimeoutError,
        format!("Operation '{}' timed out after {}s", operation, duration_secs),
    )
    .with_remediation("Try again. If the problem persists, check system resources.")
}

/// Create an app-server error
pub fn app_server_error(message: impl Into<String>) -> IPCError {
    IPCError::new(ErrorCode::AppServerError, message)
        .with_remediation("Check the debug panel for details. Try restarting the workspace.")
}

/// Create a filesystem error
pub fn filesystem_error(path: &str, operation: &str) -> IPCError {
    IPCError::new(
        ErrorCode::FilesystemError,
        format!("Failed to {} '{}'", operation, path),
    )
    .with_remediation("Check file permissions and disk space.")
    .with_details(ErrorDetails {
        workspace_id: None,
        command: Some(operation.to_string()),
        field: Some("path".to_string()),
        validation_errors: None,
    })
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_error_code_display() {
        assert_eq!(ErrorCode::ValidationError.to_string(), "validation_error");
        assert_eq!(ErrorCode::WorkspaceNotFound.to_string(), "workspace_not_found");
    }

    #[test]
    fn test_error_serialization() {
        let error = IPCError::new(ErrorCode::ValidationError, "test error");
        let json = error.to_json();
        assert!(json.contains("validation_error"));
        assert!(json.contains("test error"));
    }

    #[test]
    fn test_error_with_remediation() {
        let error = validation_error("Invalid input", Some("Fix the input"));
        assert_eq!(error.remediation, Some("Fix the input".to_string()));
    }

    #[test]
    fn test_retryable_errors() {
        assert!(ErrorCode::TimeoutError.is_retryable());
        assert!(ErrorCode::AppServerNotReady.is_retryable());
        assert!(!ErrorCode::ValidationError.is_retryable());
        assert!(!ErrorCode::WorkspaceNotFound.is_retryable());
    }

    #[test]
    fn test_workspace_not_connected_includes_details() {
        let error = workspace_not_connected("test-workspace");
        assert_eq!(error.code, ErrorCode::WorkspaceNotConnected);
        assert!(error.message.contains("test-workspace"));
        assert!(error.remediation.is_some());
        assert!(error.details.is_some());
    }
}
