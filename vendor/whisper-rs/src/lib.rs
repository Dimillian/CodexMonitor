#![allow(clippy::uninlined_format_args)]
#![cfg_attr(test, feature(test))]

mod error;
mod standalone;
mod utilities;
mod whisper_ctx;
mod whisper_ctx_wrapper;
mod whisper_grammar;
mod whisper_params;
mod whisper_state;
#[cfg(feature = "whisper-cpp-log")]
mod whisper_sys_log;
#[cfg(feature = "whisper-cpp-tracing")]
mod whisper_sys_tracing;

#[cfg(any(feature = "whisper-cpp-log", feature = "whisper-cpp-tracing"))]
static LOG_TRAMPOLINE_INSTALL: Once = Once::new();

pub use error::WhisperError;
pub use standalone::*;
#[cfg(any(feature = "whisper-cpp-log", feature = "whisper-cpp-tracing"))]
use std::sync::Once;
pub use utilities::*;
pub use whisper_ctx::DtwMode;
pub use whisper_ctx::DtwModelPreset;
pub use whisper_ctx::DtwParameters;
pub use whisper_ctx::WhisperContextParameters;
use whisper_ctx::WhisperInnerContext;
pub use whisper_ctx_wrapper::WhisperContext;
pub use whisper_grammar::{WhisperGrammarElement, WhisperGrammarElementType};
pub use whisper_params::{FullParams, SamplingStrategy, SegmentCallbackData};
#[cfg(feature = "raw-api")]
pub use whisper_rs_sys;
pub use whisper_state::WhisperState;
#[cfg(feature = "whisper-cpp-log")]
pub use whisper_sys_log::install_whisper_log_trampoline;
#[cfg(feature = "whisper-cpp-tracing")]
pub use whisper_sys_tracing::install_whisper_tracing_trampoline;

pub type WhisperSysContext = whisper_rs_sys::whisper_context;
pub type WhisperSysState = whisper_rs_sys::whisper_state;

pub type WhisperTokenData = whisper_rs_sys::whisper_token_data;
pub type WhisperToken = whisper_rs_sys::whisper_token;
pub type WhisperNewSegmentCallback = whisper_rs_sys::whisper_new_segment_callback;
pub type WhisperStartEncoderCallback = whisper_rs_sys::whisper_encoder_begin_callback;
pub type WhisperProgressCallback = whisper_rs_sys::whisper_progress_callback;
pub type WhisperLogitsFilterCallback = whisper_rs_sys::whisper_logits_filter_callback;
pub type WhisperAbortCallback = whisper_rs_sys::ggml_abort_callback;
pub type WhisperLogCallback = whisper_rs_sys::ggml_log_callback;
pub type DtwAhead = whisper_rs_sys::whisper_ahead;
