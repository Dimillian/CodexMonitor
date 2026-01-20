#![allow(dead_code)]

//! Retry logic with exponential backoff and error classification
//!
//! This module provides retry utilities that distinguish between transient
//! errors (worth retrying) and permanent errors (not worth retrying).
//!
//! # Design Principles
//!
//! 1. **No infinite loops**: Permanent errors fail immediately
//! 2. **Exponential backoff**: Delay increases with each retry (1s, 2s, 4s, ...)
//! 3. **Capped delay**: Maximum wait time of 10 seconds between retries
//! 4. **Observability**: All retry attempts are logged
//!
//! # Example
//!
//! ```rust
//! use codex_monitor_lib::retry::retry_with_backoff;
//! use std::future::Future;
//! use std::pin::Pin;
//!
//! // Mock async operation for demonstration
//! async fn mock_operation() -> Result<String, String> {
//!     Ok("success".to_string())
//! }
//!
//! async fn example() {
//!     let result = retry_with_backoff(
//!         || -> Pin<Box<dyn Future<Output = Result<String, String>> + Send>> {
//!             Box::pin(mock_operation())
//!         },
//!         3,      // max 3 retries
//!         100,    // start with 100ms delay
//!     ).await;
//! }
//! ```

use std::future::Future;
use std::pin::Pin;
use std::time::Duration;
use tokio::time::sleep;

/// Trait to determine if an error is retryable
///
/// This prevents infinite retry loops on permanent failures like
/// validation errors or "not found" errors.
pub trait IsRetryable {
    /// Returns true if this error might succeed on retry
    fn is_retryable(&self) -> bool;
}

// Implement IsRetryable for common error types
impl IsRetryable for String {
    fn is_retryable(&self) -> bool {
        // Treat as retryable if the message contains "timeout" or "temporary"
        self.contains("timeout") || self.contains("temporary")
    }
}

impl IsRetryable for &str {
    fn is_retryable(&self) -> bool {
        self.to_string().is_retryable()
    }
}

impl IsRetryable for Box<dyn std::error::Error> {
    fn is_retryable(&self) -> bool {
        // Conservative: most concrete errors are permanent
        false
    }
}

/// Retry an operation with exponential backoff
///
/// This function will retry the operation up to `max_retries` times,
/// with exponential backoff between attempts. Only retryable errors
/// will trigger a retry; permanent errors fail immediately.
///
/// # Arguments
///
/// * `operation` - A function that returns a Future yielding a Result
/// * `max_retries` - Maximum number of retry attempts (0 = no retries)
/// * `initial_delay_ms` - Initial delay in milliseconds
///
/// # Returns
///
/// * `Ok(T)` on first success
/// * `Err(E)` after all retries exhausted or on permanent error
///
/// # Example
///
/// ```rust
/// use codex_monitor_lib::retry::retry_with_backoff;
/// use std::future::Future;
/// use std::pin::Pin;
///
/// // Mock async operation for demonstration
/// async fn mock_fetch() -> Result<String, String> {
///     Ok("data".to_string())
/// }
///
/// async fn example() {
///     let result = retry_with_backoff(
///         || -> Pin<Box<dyn Future<Output = Result<String, String>> + Send>> {
///             Box::pin(mock_fetch())
///         },
///         3,   // max 3 retries
///         100, // start with 100ms delay
///     ).await;
/// }
/// ```
pub async fn retry_with_backoff<T, E>(
    mut operation: impl FnMut() -> Pin<Box<dyn Future<Output = Result<T, E>> + Send>>,
    max_retries: usize,
    initial_delay_ms: u64,
) -> Result<T, E>
where
    E: std::fmt::Display + IsRetryable,
{
    let mut last_error = None;

    for attempt in 0..=max_retries {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    println!("Operation succeeded after {} retries", attempt);
                }
                return Ok(result);
            }
            Err(error) => {
                // Check if this error is retryable
                if !error.is_retryable() {
                    eprintln!("Non-retryable error encountered, failing immediately: {}", error);
                    return Err(error);
                }

                last_error = Some(error);

                // Don't wait after the last attempt
                if attempt < max_retries {
                    let delay = initial_delay_ms * 2_u64.pow(attempt as u32);
                    let delay = delay.min(10_000); // Cap at 10 seconds

                    eprintln!(
                        "Operation failed on attempt {}, retrying after {}ms: {}",
                        attempt + 1,
                        delay,
                        last_error.as_ref().unwrap()
                    );

                    sleep(Duration::from_millis(delay)).await;
                }
            }
        }
    }

    match last_error {
        Some(error) => {
            eprintln!("Operation failed after {} retries", max_retries + 1);
            Err(error)
        }
        None => unreachable!(),
    }
}

/// Retry configuration with customizable behavior
#[derive(Debug, Clone)]
pub struct RetryConfig {
    /// Maximum number of retry attempts
    pub max_retries: usize,
    /// Initial delay in milliseconds
    pub initial_delay_ms: u64,
    /// Maximum delay between retries (caps exponential backoff)
    pub max_delay_ms: u64,
    /// Whether to jitter the delay (add random 0-25%)
    pub jitter: bool,
}

impl Default for RetryConfig {
    fn default() -> Self {
        Self {
            max_retries: 3,
            initial_delay_ms: 100,
            max_delay_ms: 10_000,
            jitter: true,
        }
    }
}

impl RetryConfig {
    /// Create a new retry configuration
    pub fn new() -> Self {
        Self::default()
    }

    /// Set the maximum number of retries
    #[must_use]
    pub fn with_max_retries(mut self, max_retries: usize) -> Self {
        self.max_retries = max_retries;
        self
    }

    /// Set the initial delay
    #[must_use]
    pub fn with_initial_delay_ms(mut self, delay_ms: u64) -> Self {
        self.initial_delay_ms = delay_ms;
        self
    }

    /// Set the maximum delay
    #[must_use]
    pub fn with_max_delay_ms(mut self, max_delay_ms: u64) -> Self {
        self.max_delay_ms = max_delay_ms;
        self
    }

    /// Enable or disable jitter
    #[must_use]
    pub fn with_jitter(mut self, jitter: bool) -> Self {
        self.jitter = jitter;
        self
    }

    /// Calculate the delay for a given attempt
    fn calculate_delay(&self, attempt: usize) -> Duration {
        let base_delay = self.initial_delay_ms * 2_u64.pow(attempt as u32);
        let delay = base_delay.min(self.max_delay_ms);

        if self.jitter {
            // Add up to 25% jitter to avoid thundering herd
            let jitter = (delay / 4) as f64;
            let jitter_amount = (rand::random::<f64>() * jitter) as u64;
            Duration::from_millis(delay + jitter_amount)
        } else {
            Duration::from_millis(delay)
        }
    }
}

/// Retry with custom configuration
pub async fn retry_with_config<T, E>(
    config: &RetryConfig,
    mut operation: impl FnMut() -> Pin<Box<dyn Future<Output = Result<T, E>> + Send>>,
) -> Result<T, E>
where
    E: std::fmt::Display + IsRetryable,
{
    let mut last_error = None;

    for attempt in 0..=config.max_retries {
        match operation().await {
            Ok(result) => {
                if attempt > 0 {
                    println!("Operation succeeded after {} retries", attempt);
                }
                return Ok(result);
            }
            Err(error) => {
                if !error.is_retryable() {
                    eprintln!("Non-retryable error encountered, failing immediately: {}", error);
                    return Err(error);
                }

                last_error = Some(error);

                if attempt < config.max_retries {
                    let delay = config.calculate_delay(attempt);

                    eprintln!(
                        "Operation failed on attempt {}, retrying after {:?}: {}",
                        attempt + 1,
                        delay,
                        last_error.as_ref().unwrap()
                    );

                    sleep(delay).await;
                }
            }
        }
    }

    match last_error {
        Some(error) => {
            eprintln!(
                "Operation failed after {} retries",
                config.max_retries + 1
            );
            Err(error)
        }
        None => unreachable!(),
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_is_retryable_string() {
        assert!("timeout error".is_retryable());
        assert!("temporary failure".is_retryable());
        assert!(!"validation error".is_retryable());
        assert!(!"not found".is_retryable());
    }

    #[tokio::test]
    async fn test_retry_succeeds_on_first_try() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let attempts = Arc::new(AtomicU32::new(0));
        let op = || -> Pin<Box<dyn Future<Output = Result<&str, String>> + Send>> {
            let counter = Arc::clone(&attempts);
            Box::pin(async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Ok("success")
            })
        };
        let result: Result<&str, String> = retry_with_backoff(op, 3, 10).await;

        assert!(result.is_ok());
        assert_eq!(result.unwrap(), "success");
        assert_eq!(attempts.load(Ordering::SeqCst), 1);
    }

    #[tokio::test]
    async fn test_retry_succeeds_on_second_try() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let attempts = Arc::new(AtomicU32::new(0));
        let op = || -> Pin<Box<dyn Future<Output = Result<&str, String>> + Send>> {
            let counter = Arc::clone(&attempts);
            Box::pin(async move {
                let count = counter.fetch_add(1, Ordering::SeqCst) + 1;
                if count < 2 {
                    Err("timeout error".to_string())
                } else {
                    Ok("success")
                }
            })
        };
        let result: Result<&str, String> = retry_with_backoff(op, 3, 10).await;

        assert!(result.is_ok());
        assert_eq!(attempts.load(Ordering::SeqCst), 2);
    }

    #[tokio::test]
    async fn test_non_retryable_fails_immediately() {
        use std::sync::atomic::{AtomicU32, Ordering};
        use std::sync::Arc;

        let attempts = Arc::new(AtomicU32::new(0));
        let op = || -> Pin<Box<dyn Future<Output = Result<(), String>> + Send>> {
            let counter = Arc::clone(&attempts);
            Box::pin(async move {
                counter.fetch_add(1, Ordering::SeqCst);
                Err("validation error".to_string())
            })
        };
        let result: Result<(), String> = retry_with_backoff(op, 3, 10).await;

        assert!(result.is_err());
        assert_eq!(attempts.load(Ordering::SeqCst), 1); // Should fail immediately, not retry
    }

    #[test]
    fn test_retry_config_default() {
        let config = RetryConfig::default();
        assert_eq!(config.max_retries, 3);
        assert_eq!(config.initial_delay_ms, 100);
        assert_eq!(config.max_delay_ms, 10_000);
        assert!(config.jitter);
    }

    #[test]
    fn test_retry_config_builder() {
        let config = RetryConfig::new()
            .with_max_retries(5)
            .with_initial_delay_ms(200)
            .with_max_delay_ms(5000)
            .with_jitter(false);

        assert_eq!(config.max_retries, 5);
        assert_eq!(config.initial_delay_ms, 200);
        assert_eq!(config.max_delay_ms, 5000);
        assert!(!config.jitter);
    }
}
