#![allow(dead_code)]

//! Input validation using type-state pattern
//!
//! This module provides validated types that enforce invariants at construction time.
//! The type-state pattern ensures validation cannot be bypassed - validated instances
//! can only be created through the `validate()` constructor.
//!
//! # Design Principles
//!
//! 1. **Non-exhaustive structs**: Prevent construction via struct literal syntax
//! 2. **Private fields**: Use `pub(crate)` visibility for internal validated data
//! 3. **Serde skipping**: Skip validated fields during serialization to prevent bypass
//! 4. **Read-only accessors**: Provide immutable access to validated data
//!
//! # Example
//!
//! ```rust,no_run
//! use codex_monitor_lib::validation::{WorkspaceRequest, WorkspaceRequestInput};
//! use std::path::PathBuf;
//!
//! // Always validate input first
//! let input = WorkspaceRequestInput {
//!     workspace_id: "my-workspace".to_string(),
//!     path: "/allowed/path".to_string(),
//! };
//!
//! let allowed_roots = vec![PathBuf::from("/allowed")];
//! let request = WorkspaceRequest::validate(input, &allowed_roots)?;
//! // Now use request.workspace_id() and request.path() - guaranteed valid
//! # Ok::<(), Box<dyn std::error::Error>>(())
//! ```

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

// ===== Unvalidated input type (for deserialization) =====

/// Unvalidated workspace request input from frontend
///
/// This type is used for deserialization and must be validated
/// before use via `WorkspaceRequest::validate()`.
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkspaceRequestInput {
    pub workspace_id: String,
    pub path: String,
}

/// Unvalidated send message request input from frontend
#[derive(Debug, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SendMessageRequestInput {
    pub workspace_id: String,
    pub thread_id: String,
    pub text: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub model: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub effort: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub access_mode: Option<String>,
}

// ===== Validated type - cannot be constructed without validation =====

/// Validated workspace request
///
/// This type uses the type-state pattern to ensure that validation
/// has been performed. The only way to construct this type is through
/// the `validate()` method, which enforces all validation rules.
///
/// # Safety
///
/// - Private fields prevent construction outside this module
/// - `#[non_exhaustive]` prevents construction via struct literal syntax
/// - `#[serde(skip)]` prevents deserialization bypass
/// - Only `validate()` constructor can create instances
#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
#[non_exhaustive]
pub struct WorkspaceRequest {
    #[serde(skip)]
    workspace_id: ValidatedWorkspaceId,
    #[serde(skip)]
    path: ValidatedPath,
}

impl WorkspaceRequest {
    /// Validate input and construct a validated workspace request
    ///
    /// This is the ONLY way to construct a `WorkspaceRequest`. All validation
    /// rules are enforced here, and the returned instance guarantees that
    /// all invariants hold.
    ///
    /// # Errors
    ///
    /// Returns `ValidationError` if:
    /// - workspace_id is empty or too long (>255 chars)
    /// - workspace_id contains invalid characters
    /// - path is too long (>1024 chars)
    /// - path contains traversal components (..)
    /// - path is outside allowed roots
    ///
    /// # Example
    ///
    /// ```rust,no_run
    /// use codex_monitor_lib::validation::{WorkspaceRequest, WorkspaceRequestInput};
    /// use std::path::PathBuf;
    ///
    /// let input = WorkspaceRequestInput {
    ///     workspace_id: "my-workspace".to_string(),
    ///     path: "/allowed/path".to_string(),
    /// };
    /// let allowed_roots = vec![PathBuf::from("/allowed")];
    /// let request = WorkspaceRequest::validate(input, &allowed_roots)?;
    /// let id = request.workspace_id();  // Guaranteed valid
    /// let path = request.path();        // Guaranteed valid
    /// # Ok::<(), Box<dyn std::error::Error>>(())
    /// ```
    pub fn validate(
        input: WorkspaceRequestInput,
        allowed_roots: &[PathBuf],
    ) -> Result<Self, ValidationError> {
        Ok(Self {
            workspace_id: ValidatedWorkspaceId::validate(input.workspace_id)?,
            path: ValidatedPath::validate(input.path, allowed_roots)?,
        })
    }

    /// Get the validated workspace ID
    ///
    /// This returns a reference to the validated workspace ID string.
    /// The ID is guaranteed to be non-empty, ≤255 characters, and contain
    /// only alphanumeric characters, dashes, and underscores.
    pub fn workspace_id(&self) -> &str {
        self.workspace_id.as_str()
    }

    /// Get the validated path
    ///
    /// This returns a reference to the validated path.
    /// The path is guaranteed to be within the allowed roots and free of
    /// traversal components.
    pub fn path(&self) -> &Path {
        self.path.as_path()
    }
}

// ===== Validated workspace ID newtype =====

/// Validated workspace ID
///
/// This newtype enforces that workspace IDs meet the following requirements:
/// - Non-empty after trimming
/// - Maximum 255 characters
/// - Only alphanumeric, dash, and underscore characters
#[derive(Debug, Clone, Serialize)]
#[serde(transparent)]
pub struct ValidatedWorkspaceId(String);

impl ValidatedWorkspaceId {
    /// Validate a workspace ID string
    ///
    /// # Errors
    ///
    /// Returns `ValidationError` if the ID doesn't meet requirements.
    pub(crate) fn validate(id: String) -> Result<Self, ValidationError> {
        let trimmed = id.trim();

        if trimmed.is_empty() {
            return Err(ValidationError::EmptyWorkspaceId);
        }

        if trimmed.len() > 255 {
            return Err(ValidationError::WorkspaceIdTooLong {
                length: trimmed.len(),
            });
        }

        // Only allow alphanumeric, dash, underscore
        if !trimmed.chars().all(|c| c.is_alphanumeric() || c == '-' || c == '_') {
            return Err(ValidationError::InvalidWorkspaceIdChars);
        }

        Ok(Self(trimmed.to_string()))
    }

    /// Get the workspace ID as a string slice
    pub fn as_str(&self) -> &str {
        &self.0
    }
}

// ===== Validated path newtype =====

/// Validated filesystem path
///
/// This newtype enforces that paths are:
/// - Within allowed roots
/// - Free of traversal components (..)
/// - Reasonably sized (≤1024 characters)
#[derive(Debug, Clone, Serialize)]
#[serde(transparent)]
pub struct ValidatedPath(PathBuf);

impl ValidatedPath {
    /// Validate a path string
    ///
    /// This performs comprehensive security validation including:
    /// - Length check (≤1024 characters)
    /// - Traversal component detection (..)
    /// - Canonical path resolution
    /// - Allowed root enforcement
    ///
    /// # Errors
    ///
    /// Returns `ValidationError` if validation fails.
    pub(crate) fn validate(path: String, allowed_roots: &[PathBuf]) -> Result<Self, ValidationError> {
        if path.len() > 1024 {
            return Err(ValidationError::PathTooLong {
                length: path.len(),
            });
        }

        let path_buf = PathBuf::from(&path);

        // Check for path traversal components
        if path_buf.components().any(|c| matches!(c, std::path::Component::ParentDir)) {
            return Err(ValidationError::PathTraversalDetected);
        }

        // Canonicalize and check against allowed roots
        let canonical = path_buf
            .canonicalize()
            .map_err(|_| ValidationError::InvalidPath {
                path: path.clone(),
            })?;

        let is_allowed = allowed_roots
            .iter()
            .filter_map(|r| r.canonicalize().ok())
            .any(|root| canonical.starts_with(&root));

        if !is_allowed {
            return Err(ValidationError::PathOutsideAllowedRoots {
                path: canonical.to_string_lossy().into_owned(),
            });
        }

        Ok(Self(canonical))
    }

    /// Get the validated path reference
    pub fn as_path(&self) -> &Path {
        &self.0
    }
}

// ===== Validation errors =====

/// Validation error types
///
/// These errors provide detailed context about what failed validation,
/// making it easier to fix issues and providing better error messages
/// to users.
#[derive(Debug, Clone, thiserror::Error)]
pub enum ValidationError {
    #[error("workspace_id cannot be empty")]
    EmptyWorkspaceId,

    #[error("workspace_id exceeds 255 characters (got {length} characters)")]
    WorkspaceIdTooLong { length: usize },

    #[error("workspace_id contains invalid characters (only alphanumeric, dash, underscore allowed)")]
    InvalidWorkspaceIdChars,

    #[error("path exceeds 1024 characters (got {length} characters)")]
    PathTooLong { length: usize },

    #[error("path contains parent directory components (..)")]
    PathTraversalDetected,

    #[error("path is outside allowed roots: {path}")]
    PathOutsideAllowedRoots { path: String },

    #[error("path could not be canonicalized: {path}")]
    InvalidPath { path: String },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_validates_valid_workspace_id() {
        let result = ValidatedWorkspaceId::validate("my-workspace-123".to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), "my-workspace-123");
    }

    #[test]
    fn test_rejects_empty_workspace_id() {
        let result = ValidatedWorkspaceId::validate("".to_string());
        assert!(matches!(result, Err(ValidationError::EmptyWorkspaceId)));
    }

    #[test]
    fn test_rejects_whitespace_only_workspace_id() {
        let result = ValidatedWorkspaceId::validate("   ".to_string());
        assert!(matches!(result, Err(ValidationError::EmptyWorkspaceId)));
    }

    #[test]
    fn test_rejects_too_long_workspace_id() {
        let long_id = "a".repeat(256);
        let result = ValidatedWorkspaceId::validate(long_id);
        assert!(matches!(result, Err(ValidationError::WorkspaceIdTooLong { .. })));
    }

    #[test]
    fn test_rejects_invalid_workspace_id_chars() {
        let result = ValidatedWorkspaceId::validate("my workspace!".to_string());
        assert!(matches!(result, Err(ValidationError::InvalidWorkspaceIdChars)));
    }

    #[test]
    fn test_trims_workspace_id() {
        let result = ValidatedWorkspaceId::validate("  my-workspace  ".to_string());
        assert!(result.is_ok());
        assert_eq!(result.unwrap().as_str(), "my-workspace");
    }

    #[test]
    fn test_rejects_path_traversal() {
        let result =
            ValidatedPath::validate("../../../etc/passwd".to_string(), &[PathBuf::from("/tmp")]);
        assert!(matches!(result, Err(ValidationError::PathTraversalDetected)));
    }

    #[test]
    fn test_rejects_too_long_path() {
        let long_path = "a".repeat(1025);
        let result = ValidatedPath::validate(long_path, &[PathBuf::from("/tmp")]);
        assert!(matches!(result, Err(ValidationError::PathTooLong { .. })));
    }
}
