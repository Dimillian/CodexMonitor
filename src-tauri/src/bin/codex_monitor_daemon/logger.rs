use chrono::Local;
use std::collections::HashMap;
use std::fs::{self, File, OpenOptions};
use std::io::Write;
use std::path::{Path, PathBuf};
use std::sync::Mutex;
use std::time::{Duration, Instant};

const MAX_LOG_BYTES: u64 = 5 * 1024 * 1024;
const REOPEN_INTERVAL: Duration = Duration::from_secs(60);
const RATE_LIMIT_WINDOW: Duration = Duration::from_secs(1);

#[derive(Clone, Copy)]
pub(super) enum LogLevel {
    Info,
    Error,
}

impl LogLevel {
    fn as_str(self) -> &'static str {
        match self {
            LogLevel::Info => "info",
            LogLevel::Error => "error",
        }
    }
}

pub(super) struct DaemonLogger {
    inner: Mutex<LogInner>,
}

struct LogInner {
    handle: File,
    log_path: PathBuf,
    degraded: bool,
    last_reopen_attempt: Instant,
    rate_limiters: HashMap<&'static str, RateLimiter>,
}

struct RateLimiter {
    last_emit: Instant,
    suppressed: u32,
}

fn null_device() -> File {
    let path = if cfg!(windows) { "NUL" } else { "/dev/null" };
    OpenOptions::new()
        .write(true)
        .open(path)
        .expect("failed to open null device")
}

fn quote_value(value: &str) -> String {
    let needs_quoting = value.is_empty()
        || value.contains(' ')
        || value.contains('=')
        || value.contains('"')
        || value.contains('\\')
        || value.contains('\n')
        || value.contains('\r');
    if needs_quoting {
        let escaped = value
            .replace('\\', "\\\\")
            .replace('"', "\\\"")
            .replace('\n', "\\n")
            .replace('\r', "\\r");
        format!("\"{escaped}\"")
    } else {
        value.to_string()
    }
}

fn write_line(inner: &mut LogInner, level: LogLevel, event: &str, kvs: &[(&str, &str)]) {
    let ts = Local::now().format("%Y-%m-%dT%H:%M:%S%.3f%:z");
    let mut line = format!("ts={ts} level={} event={event}", level.as_str());
    for (k, v) in kvs {
        line.push(' ');
        line.push_str(k);
        line.push('=');
        line.push_str(&quote_value(v));
    }
    line.push('\n');
    let _ = inner.handle.write_all(line.as_bytes());
}

fn rotate_if_needed(log_path: &Path) {
    let size = match fs::metadata(log_path) {
        Ok(m) => m.len(),
        Err(_) => return,
    };
    if size <= MAX_LOG_BYTES {
        return;
    }
    let backup = log_path.with_extension("log.1");
    let _ = fs::remove_file(&backup);
    let _ = fs::rename(log_path, &backup);
}

impl DaemonLogger {
    pub(super) fn open(data_dir: &Path) -> Self {
        let _ = fs::create_dir_all(data_dir);
        let log_path = data_dir.join("daemon.log");
        rotate_if_needed(&log_path);

        let (handle, degraded) = match OpenOptions::new()
            .create(true)
            .append(true)
            .open(&log_path)
        {
            Ok(f) => (f, false),
            Err(err) => {
                eprintln!("daemon logger: failed to open {}: {err}", log_path.display());
                (null_device(), true)
            }
        };

        DaemonLogger {
            inner: Mutex::new(LogInner {
                handle,
                log_path,
                degraded,
                last_reopen_attempt: Instant::now(),
                rate_limiters: HashMap::new(),
            }),
        }
    }

    pub(super) fn log(&self, level: LogLevel, event: &str, kvs: &[(&str, &str)]) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        maybe_recover(&mut inner, now);
        maybe_rotate(&mut inner);
        write_line(&mut inner, level, event, kvs);
    }

    pub(super) fn log_rate_limited(
        &self,
        key: &'static str,
        level: LogLevel,
        event: &str,
        kvs: &[(&str, &str)],
    ) {
        let mut inner = self.inner.lock().unwrap_or_else(|e| e.into_inner());
        let now = Instant::now();
        maybe_recover(&mut inner, now);

        let limiter = inner
            .rate_limiters
            .entry(key)
            .or_insert_with(|| RateLimiter {
                last_emit: now - (RATE_LIMIT_WINDOW * 2),
                suppressed: 0,
            });

        if now.duration_since(limiter.last_emit) < RATE_LIMIT_WINDOW {
            limiter.suppressed += 1;
            return;
        }

        if limiter.suppressed > 0 {
            let count = limiter.suppressed.to_string();
            write_line(
                &mut inner,
                level,
                "warnings_suppressed",
                &[("key", key), ("count", &count)],
            );
            // Reset after emitting summary — must re-borrow limiter after mutable use of inner
        }

        // Re-access limiter after the potential write_line call above
        let limiter = inner.rate_limiters.get_mut(key).unwrap();
        limiter.suppressed = 0;
        limiter.last_emit = now;

        maybe_rotate(&mut inner);
        write_line(&mut inner, level, event, kvs);
    }
}

fn maybe_recover(inner: &mut LogInner, now: Instant) {
    if !inner.degraded {
        return;
    }
    if now.duration_since(inner.last_reopen_attempt) < REOPEN_INTERVAL {
        return;
    }
    inner.last_reopen_attempt = now;
    match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&inner.log_path)
    {
        Ok(f) => {
            inner.handle = f;
            inner.degraded = false;
            write_line(&mut *inner, LogLevel::Info, "logger_recovered", &[]);
        }
        Err(_) => {}
    }
}

fn maybe_rotate(inner: &mut LogInner) {
    let size = match inner.handle.metadata() {
        Ok(m) => m.len(),
        Err(_) => return,
    };
    if size <= MAX_LOG_BYTES {
        return;
    }

    // Replace handle with null device while we rotate
    inner.handle = null_device();

    let backup = inner.log_path.with_extension("log.1");
    let _ = fs::remove_file(&backup);
    let renamed = fs::rename(&inner.log_path, &backup).is_ok();

    match OpenOptions::new()
        .create(true)
        .append(true)
        .open(&inner.log_path)
    {
        Ok(f) => {
            inner.handle = f;
            if renamed {
                let size_str = size.to_string();
                write_line(
                    inner,
                    LogLevel::Info,
                    "log_rotated",
                    &[("prev_bytes", &size_str)],
                );
            } else {
                write_line(
                    inner,
                    LogLevel::Error,
                    "log_rotate_failed",
                    &[("reason", "rename failed")],
                );
            }
        }
        Err(err) => {
            eprintln!(
                "daemon logger: failed to reopen after rotation: {err}"
            );
            inner.degraded = true;
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Read;
    use std::time::SystemTime;

    fn make_temp_dir(prefix: &str) -> PathBuf {
        let unique = SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .expect("time")
            .as_nanos();
        let dir = std::env::temp_dir().join(format!(
            "codex-logger-{prefix}-{}-{unique}",
            std::process::id()
        ));
        std::fs::create_dir_all(&dir).expect("create temp dir");
        dir
    }

    fn read_log(dir: &Path) -> String {
        let mut content = String::new();
        File::open(dir.join("daemon.log"))
            .expect("open log")
            .read_to_string(&mut content)
            .expect("read log");
        content
    }

    #[test]
    fn logger_writes_logfmt() {
        let dir = make_temp_dir("logfmt");
        let logger = DaemonLogger::open(&dir);
        logger.log(LogLevel::Info, "test_event", &[("key1", "val1")]);
        logger.log(
            LogLevel::Error,
            "error_event",
            &[("key2", "val2"), ("key3", "val3")],
        );

        let content = read_log(&dir);
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 2);
        assert!(lines[0].starts_with("ts="));
        assert!(lines[0].contains("level=info"));
        assert!(lines[0].contains("event=test_event"));
        assert!(lines[0].contains("key1=val1"));
        assert!(lines[1].contains("level=error"));
        assert!(lines[1].contains("event=error_event"));
        assert!(lines[1].contains("key2=val2"));
        assert!(lines[1].contains("key3=val3"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rotation_creates_backup() {
        let dir = make_temp_dir("rotation");
        let log_path = dir.join("daemon.log");
        // Create a file larger than MAX_LOG_BYTES
        {
            let mut f = File::create(&log_path).expect("create");
            let chunk = vec![b'x'; 1024];
            for _ in 0..(5 * 1024 + 1) {
                f.write_all(&chunk).expect("write");
            }
        }
        assert!(fs::metadata(&log_path).unwrap().len() > MAX_LOG_BYTES);

        let logger = DaemonLogger::open(&dir);
        // Logger should have rotated on open
        let backup = dir.join("daemon.log.1");
        assert!(backup.exists(), "backup file should exist after rotation");

        // New log file should be small (just the startup is not written yet by open itself,
        // but let's write something and verify it's small)
        logger.log(LogLevel::Info, "after_rotation", &[]);
        let new_size = fs::metadata(&log_path).unwrap().len();
        assert!(new_size < MAX_LOG_BYTES);
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn open_creates_missing_dir() {
        let base = make_temp_dir("missing-parent");
        let nested = base.join("deep").join("nested").join("dir");
        // Should not panic
        let logger = DaemonLogger::open(&nested);
        logger.log(LogLevel::Info, "created", &[]);
        assert!(nested.join("daemon.log").exists());
        let _ = fs::remove_dir_all(&base);
    }

    #[test]
    fn rate_limiter_first_event_passes() {
        let dir = make_temp_dir("rate-first");
        let logger = DaemonLogger::open(&dir);
        logger.log_rate_limited("test_key", LogLevel::Info, "first_event", &[("a", "1")]);

        let content = read_log(&dir);
        assert!(
            content.contains("event=first_event"),
            "first event should always pass"
        );
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rate_limiter_suppresses_within_window() {
        let dir = make_temp_dir("rate-suppress");
        let logger = DaemonLogger::open(&dir);

        // First call passes
        logger.log_rate_limited("burst", LogLevel::Error, "burst_event", &[("n", "1")]);
        // Rapid calls within 1s window should be suppressed
        logger.log_rate_limited("burst", LogLevel::Error, "burst_event", &[("n", "2")]);
        logger.log_rate_limited("burst", LogLevel::Error, "burst_event", &[("n", "3")]);

        let content = read_log(&dir);
        let event_count = content.matches("event=burst_event").count();
        assert_eq!(event_count, 1, "only first event should pass within window");
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn rate_limiter_independent_keys() {
        let dir = make_temp_dir("rate-keys");
        let logger = DaemonLogger::open(&dir);

        logger.log_rate_limited("key_a", LogLevel::Info, "event_a", &[]);
        logger.log_rate_limited("key_b", LogLevel::Info, "event_b", &[]);

        let content = read_log(&dir);
        assert!(content.contains("event=event_a"));
        assert!(content.contains("event=event_b"));
        let _ = fs::remove_dir_all(&dir);
    }

    #[test]
    fn value_quoting() {
        let dir = make_temp_dir("quoting");
        let logger = DaemonLogger::open(&dir);
        logger.log(
            LogLevel::Info,
            "quote_test",
            &[
                ("spaces", "hello world"),
                ("equals", "a=b"),
                ("quotes", "say \"hi\""),
                ("newline", "line1\nline2"),
                ("backslash", "a\\b"),
                ("bare", "simple"),
                ("empty", ""),
            ],
        );

        let content = read_log(&dir);
        // Every event must be a single line
        let lines: Vec<&str> = content.lines().collect();
        assert_eq!(lines.len(), 1, "event with newline value must stay on one line");
        assert!(content.contains("spaces=\"hello world\""));
        assert!(content.contains("equals=\"a=b\""));
        assert!(content.contains("quotes=\"say \\\"hi\\\"\""));
        assert!(content.contains("newline=\"line1\\nline2\""));
        assert!(content.contains("backslash=\"a\\\\b\""));
        assert!(content.contains("bare=simple"));
        assert!(content.contains("empty=\"\""));
        let _ = fs::remove_dir_all(&dir);
    }
}
