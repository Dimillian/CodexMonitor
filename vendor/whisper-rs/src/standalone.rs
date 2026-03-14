//! Standalone functions that have no associated type.

use std::ffi::{c_int, CStr, CString};

/// Return the id of the specified language, returns -1 if not found
///
/// # Arguments
/// * lang: The language to get the id for.
///
/// # Returns
/// The ID of the language, None if not found.
///
/// # Panics
/// Panics if the language contains a null byte.
///
/// # C++ equivalent
/// `int whisper_lang_id(const char * lang)`
pub fn get_lang_id(lang: &str) -> Option<c_int> {
    let c_lang = CString::new(lang).expect("Language contains null byte");
    let ret = unsafe { whisper_rs_sys::whisper_lang_id(c_lang.as_ptr()) };
    if ret == -1 {
        None
    } else {
        Some(ret)
    }
}

/// Return the ID of the maximum language (ie the number of languages - 1)
///
/// # Returns
/// i32
///
/// # C++ equivalent
/// `int whisper_lang_max_id()`
pub fn get_lang_max_id() -> i32 {
    unsafe { whisper_rs_sys::whisper_lang_max_id() }
}

/// Get the short string of the specified language id (e.g. 2 -> "de").
///
/// # Returns
/// The short string of the language, None if not found.
///
/// # C++ equivalent
/// `const char * whisper_lang_str(int id)`
pub fn get_lang_str(id: i32) -> Option<&'static str> {
    let c_buf = unsafe { whisper_rs_sys::whisper_lang_str(id) };
    if c_buf.is_null() {
        None
    } else {
        let c_str = unsafe { CStr::from_ptr(c_buf) };
        Some(c_str.to_str().unwrap())
    }
}

/// Get the full string of the specified language name (e.g. 2 -> "german").
///
/// # Returns
/// The full string of the language, None if not found.
///
/// # C++ equivalent
/// `const char * whisper_lang_str_full(int id)`
pub fn get_lang_str_full(id: i32) -> Option<&'static str> {
    let c_buf = unsafe { whisper_rs_sys::whisper_lang_str_full(id) };
    if c_buf.is_null() {
        None
    } else {
        let c_str = unsafe { CStr::from_ptr(c_buf) };
        Some(c_str.to_str().unwrap())
    }
}

/// Callback to control logging output: default behaviour is to print to stderr.
///
/// # Safety
/// The callback must be safe to call from C (i.e. no panicking, no unwinding, etc).
///
/// # C++ equivalent
/// `void whisper_set_log_callback(whisper_log_callback callback);`
pub unsafe fn set_log_callback(
    log_callback: crate::WhisperLogCallback,
    user_data: *mut std::ffi::c_void,
) {
    unsafe {
        whisper_rs_sys::whisper_log_set(log_callback, user_data);
        #[cfg(feature = "metal")]
        {
            whisper_rs_sys::ggml_backend_metal_log_set_callback(log_callback, user_data);
        }
    }
}

/// Print system information.
///
/// # C++ equivalent
/// `const char * whisper_print_system_info()`
pub fn print_system_info() -> &'static str {
    let c_buf = unsafe { whisper_rs_sys::whisper_print_system_info() };
    let c_str = unsafe { CStr::from_ptr(c_buf) };
    c_str.to_str().unwrap()
}

/// Programmatically exposes the information provided by `print_system_info`
///
/// # C++ equivalent
/// `int ggml_cpu_has_...`
pub struct SystemInfo {
    pub avx: bool,
    pub avx2: bool,
    pub fma: bool,
    pub f16c: bool,
    pub blas: bool,
    pub clblast: bool,
    pub cuda: bool,
}

impl Default for SystemInfo {
    fn default() -> Self {
        unsafe {
            Self {
                avx: whisper_rs_sys::ggml_cpu_has_avx() != 0,
                avx2: whisper_rs_sys::ggml_cpu_has_avx2() != 0,
                fma: whisper_rs_sys::ggml_cpu_has_fma() != 0,
                f16c: whisper_rs_sys::ggml_cpu_has_f16c() != 0,
                blas: whisper_rs_sys::ggml_cpu_has_blas() != 0,
                clblast: whisper_rs_sys::ggml_cpu_has_clblast() != 0,
                cuda: whisper_rs_sys::ggml_cpu_has_cuda() != 0,
            }
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_openblas() {
        let info = SystemInfo::default();
        assert_eq!(info.blas, cfg!(feature = "openblas"));
    }
}
