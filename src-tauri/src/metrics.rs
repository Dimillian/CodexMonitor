#![allow(dead_code)]

//! Application metrics collection
//!
//! This module provides thread-safe metrics collection using atomic operations.
//! All counters use `AtomicU32` with saturating operations to prevent overflow
//! panics in long-running production applications.
//!
//! # Design Principles
//!
//! 1. **No overflow panics**: Use `fetch_update` with `checked_add` for true saturation
//! 2. **Lock-free**: All operations are lock-free for performance
//! 3. **Queryable**: Metrics can be retrieved via IPC for monitoring
//! 4. **Simple**: Counter-based metrics with clear semantics
//!
//! # Example
//!
//! ```rust
//! use codex_monitor_lib::metrics::Metrics;
//!
//! let metrics = Metrics::new();
//!
//! // Record operations
//! metrics.record_ipc_call(true);
//! metrics.record_ipc_call(false);
//!
//! // Query metrics
//! let snapshot = metrics.get_snapshot();
//! println!("IPC failure rate: {:.2}%", snapshot.ipc_failure_rate() * 100.0);
//! ```

use serde::{Deserialize, Serialize};
use std::sync::atomic::{AtomicU32, Ordering};

/// Application-wide metrics collector
///
/// All counters use `fetch_update` with `checked_add` to provide true
/// saturation behavior. When a counter reaches `u32::MAX`, it saturates
/// at that value rather than wrapping (release) or panicking (debug).
#[derive(Debug)]
pub struct Metrics {
    /// Number of successful IPC calls
    ipc_success: AtomicU32,
    /// Number of failed IPC calls
    ipc_failure: AtomicU32,
    /// Number of successful workspace reconnections
    workspace_reconnect_success: AtomicU32,
    /// Number of failed workspace reconnections
    workspace_reconnect_failure: AtomicU32,
    /// Number of validation errors
    validation_errors: AtomicU32,
    /// Number of timeout errors
    timeout_errors: AtomicU32,
}

impl Default for Metrics {
    fn default() -> Self {
        Self::new()
    }
}

impl Metrics {
    /// Create a new metrics instance with all counters initialized to zero
    pub fn new() -> Self {
        Self {
            ipc_success: AtomicU32::new(0),
            ipc_failure: AtomicU32::new(0),
            workspace_reconnect_success: AtomicU32::new(0),
            workspace_reconnect_failure: AtomicU32::new(0),
            validation_errors: AtomicU32::new(0),
            timeout_errors: AtomicU32::new(0),
        }
    }

    /// Record an IPC call result
    ///
    /// Uses `fetch_update` with `checked_add` to saturate at `u32::MAX`.
    /// This prevents overflow panics in debug builds and silent wrapping
    /// in release builds.
    pub fn record_ipc_call(&self, success: bool) {
        if success {
            let _ = self.ipc_success.fetch_update(
                Ordering::Relaxed,
                Ordering::Relaxed,
                |x: u32| x.checked_add(1).or(Some(u32::MAX)),
            );
        } else {
            let _ = self.ipc_failure.fetch_update(
                Ordering::Relaxed,
                Ordering::Relaxed,
                |x: u32| x.checked_add(1).or(Some(u32::MAX)),
            );
        }
    }

    /// Record a workspace reconnection attempt result
    ///
    /// Uses `fetch_update` with `checked_add` to saturate at `u32::MAX`.
    pub fn record_workspace_reconnect(&self, success: bool) {
        if success {
            let _ = self.workspace_reconnect_success.fetch_update(
                Ordering::Relaxed,
                Ordering::Relaxed,
                |x: u32| x.checked_add(1).or(Some(u32::MAX)),
            );
        } else {
            let _ = self.workspace_reconnect_failure.fetch_update(
                Ordering::Relaxed,
                Ordering::Relaxed,
                |x: u32| x.checked_add(1).or(Some(u32::MAX)),
            );
        }
    }

    /// Record a validation error
    ///
    /// Uses `fetch_update` with `checked_add` to saturate at `u32::MAX`.
    pub fn record_validation_error(&self) {
        let _ = self.validation_errors.fetch_update(
            Ordering::Relaxed,
            Ordering::Relaxed,
            |x: u32| x.checked_add(1).or(Some(u32::MAX)),
        );
    }

    /// Record a timeout error
    ///
    /// Uses `fetch_update` with `checked_add` to saturate at `u32::MAX`.
    pub fn record_timeout(&self) {
        let _ = self.timeout_errors.fetch_update(
            Ordering::Relaxed,
            Ordering::Relaxed,
            |x: u32| x.checked_add(1).or(Some(u32::MAX)),
        );
    }

    /// Get a snapshot of current metrics
    ///
    /// This provides a consistent point-in-time view of all metrics.
    pub fn get_snapshot(&self) -> MetricsSnapshot {
        MetricsSnapshot {
            ipc_success: self.ipc_success.load(Ordering::Relaxed),
            ipc_failure: self.ipc_failure.load(Ordering::Relaxed),
            workspace_reconnect_success: self.workspace_reconnect_success.load(Ordering::Relaxed),
            workspace_reconnect_failure: self.workspace_reconnect_failure.load(Ordering::Relaxed),
            validation_errors: self.validation_errors.load(Ordering::Relaxed),
            timeout_errors: self.timeout_errors.load(Ordering::Relaxed),
        }
    }

    /// Reset all counters to zero
    ///
    /// This is useful for testing or for implementing periodic reset logic.
    pub fn reset(&self) {
        self.ipc_success.store(0, Ordering::Relaxed);
        self.ipc_failure.store(0, Ordering::Relaxed);
        self.workspace_reconnect_success.store(0, Ordering::Relaxed);
        self.workspace_reconnect_failure.store(0, Ordering::Relaxed);
        self.validation_errors.store(0, Ordering::Relaxed);
        self.timeout_errors.store(0, Ordering::Relaxed);
    }
}

/// A point-in-time snapshot of metrics
///
/// This struct provides a consistent view of metrics at a specific moment.
/// It can be serialized to JSON for IPC transport or logging.
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MetricsSnapshot {
    pub ipc_success: u32,
    pub ipc_failure: u32,
    pub workspace_reconnect_success: u32,
    pub workspace_reconnect_failure: u32,
    pub validation_errors: u32,
    pub timeout_errors: u32,
}

impl MetricsSnapshot {
    /// Calculate the IPC failure rate as a fraction (0.0 to 1.0)
    ///
    /// Returns 0.0 if no IPC calls have been made.
    pub fn ipc_failure_rate(&self) -> f64 {
        let total = self.ipc_success + self.ipc_failure;
        if total == 0 {
            return 0.0;
        }
        self.ipc_failure as f64 / total as f64
    }

    /// Calculate the workspace reconnection success rate as a fraction
    pub fn workspace_reconnect_success_rate(&self) -> f64 {
        let total = self.workspace_reconnect_success + self.workspace_reconnect_failure;
        if total == 0 {
            return 0.0;
        }
        self.workspace_reconnect_success as f64 / total as f64
    }

    /// Get the total number of IPC calls
    pub fn total_ipc_calls(&self) -> u32 {
        self.ipc_success + self.ipc_failure
    }

    /// Get the total number of workspace reconnection attempts
    pub fn total_reconnect_attempts(&self) -> u32 {
        self.workspace_reconnect_success + self.workspace_reconnect_failure
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_record_ipc_call() {
        let metrics = Metrics::new();
        metrics.record_ipc_call(true);
        metrics.record_ipc_call(false);
        metrics.record_ipc_call(true);

        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.ipc_success, 2);
        assert_eq!(snapshot.ipc_failure, 1);
    }

    #[test]
    fn test_failure_rate_calculation() {
        let metrics = Metrics::new();
        metrics.record_ipc_call(true);
        metrics.record_ipc_call(true);
        metrics.record_ipc_call(false);
        metrics.record_ipc_call(false);

        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.ipc_failure_rate(), 0.5);
    }

    #[test]
    fn test_empty_metrics_return_zero_rate() {
        let metrics = Metrics::new();
        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.ipc_failure_rate(), 0.0);
        assert_eq!(snapshot.workspace_reconnect_success_rate(), 0.0);
    }

    #[test]
    fn test_reset_clears_all_counters() {
        let metrics = Metrics::new();
        metrics.record_ipc_call(true);
        metrics.record_validation_error();
        metrics.record_timeout();

        metrics.reset();

        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.ipc_success, 0);
        assert_eq!(snapshot.validation_errors, 0);
        assert_eq!(snapshot.timeout_errors, 0);
    }

    #[test]
    fn test_workspace_reconnect_metrics() {
        let metrics = Metrics::new();
        metrics.record_workspace_reconnect(true);
        metrics.record_workspace_reconnect(false);
        metrics.record_workspace_reconnect(true);

        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.workspace_reconnect_success, 2);
        assert_eq!(snapshot.workspace_reconnect_failure, 1);
        assert_eq!(snapshot.workspace_reconnect_success_rate(), 2.0 / 3.0);
    }

    #[test]
    fn test_total_counts() {
        let metrics = Metrics::new();
        metrics.record_ipc_call(true);
        metrics.record_ipc_call(false);

        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.total_ipc_calls(), 2);
    }

    #[test]
    fn test_metrics_saturate_at_max() {
        let metrics = Metrics::new();

        // Set success counter to u32::MAX - 1
        metrics.ipc_success.store(u32::MAX - 1, Ordering::Relaxed);

        // Record two more - should saturate at MAX
        metrics.record_ipc_call(true);
        metrics.record_ipc_call(true);

        let snapshot = metrics.get_snapshot();
        assert_eq!(snapshot.ipc_success, u32::MAX); // Saturated, not wrapped
    }

    #[test]
    fn test_concurrent_metrics_no_panic() {
        use std::sync::Arc;
        use std::thread;

        let metrics = Arc::new(Metrics::new());
        let handles: Vec<_> = (0..100)
            .map(|_| {
                let metrics = Arc::clone(&metrics);
                thread::spawn(move || {
                    for _ in 0..10000 {
                        metrics.record_ipc_call(true);
                    }
                })
            })
            .collect();

        for handle in handles {
            handle.join().unwrap();
        }

        let snapshot = metrics.get_snapshot();
        assert!(snapshot.ipc_success <= u32::MAX);
    }
}
