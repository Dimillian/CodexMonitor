use tracing::{debug, error, info, warn};
use whisper_rs_sys::ggml_log_level;

unsafe extern "C" fn whisper_cpp_tracing_trampoline(
    level: ggml_log_level,
    text: *const std::os::raw::c_char,
    _: *mut std::os::raw::c_void, // user_data
) {
    if text.is_null() {
        error!("whisper_cpp_tracing_trampoline: text is nullptr");
    }

    // SAFETY: we must trust whisper.cpp that it will not pass us a string that does not satisfy
    // from_ptr's requirements.
    let log_str = unsafe { std::ffi::CStr::from_ptr(text) }.to_string_lossy();
    // whisper.cpp gives newlines at the end of its log messages, so we trim them
    let trimmed = log_str.trim();

    match level {
        whisper_rs_sys::ggml_log_level_GGML_LOG_LEVEL_DEBUG => debug!("{}", trimmed),
        whisper_rs_sys::ggml_log_level_GGML_LOG_LEVEL_INFO => info!("{}", trimmed),
        whisper_rs_sys::ggml_log_level_GGML_LOG_LEVEL_WARN => warn!("{}", trimmed),
        whisper_rs_sys::ggml_log_level_GGML_LOG_LEVEL_ERROR => error!("{}", trimmed),
        _ => {
            warn!(
                "whisper_cpp_tracing_trampoline: unknown log level {}: message: {}",
                level, trimmed
            )
        }
    }
}

/// Shortcut utility to redirect all whisper.cpp logging to the `tracing` crate.
///
/// Filter for logs from the `whisper-rs` crate to see all log output from whisper.cpp.
///
/// You should only call this once (subsequent calls have no effect).
pub fn install_whisper_tracing_trampoline() {
    crate::LOG_TRAMPOLINE_INSTALL.call_once(|| unsafe {
        whisper_rs_sys::whisper_log_set(Some(whisper_cpp_tracing_trampoline), std::ptr::null_mut());
        #[cfg(feature = "metal")]
        {
            whisper_rs_sys::ggml_backend_metal_log_set_callback(
                Some(whisper_cpp_tracing_trampoline),
                std::ptr::null_mut(),
            );
        }
    });
}
