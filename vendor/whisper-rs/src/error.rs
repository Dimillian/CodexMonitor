use std::ffi::{c_int, NulError};
use std::str::Utf8Error;

/// If you have not configured a logging trampoline with [crate::whisper_sys_log::install_whisper_log_trampoline] or
/// [crate::whisper_sys_tracing::install_whisper_tracing_trampoline],
/// then `whisper.cpp`'s errors will be output to stderr,
/// so you can check there for more information upon receiving a `WhisperError`.
#[derive(Debug, Copy, Clone)]
pub enum WhisperError {
    /// Failed to create a new context.
    InitError,
    /// User didn't initialize spectrogram
    SpectrogramNotInitialized,
    /// Encode was not called.
    EncodeNotComplete,
    /// Decode was not called.
    DecodeNotComplete,
    /// Failed to calculate the spectrogram for some reason.
    UnableToCalculateSpectrogram,
    /// Failed to evaluate model.
    UnableToCalculateEvaluation,
    /// Failed to run the encoder
    FailedToEncode,
    /// Failed to run the decoder
    FailedToDecode,
    /// Invalid number of mel bands.
    InvalidMelBands,
    /// Invalid thread count
    InvalidThreadCount,
    /// Invalid UTF-8 detected in a string from Whisper.
    InvalidUtf8 {
        error_len: Option<usize>,
        valid_up_to: usize,
    },
    /// A null byte was detected in a user-provided string.
    NullByteInString { idx: usize },
    /// Whisper returned a null pointer.
    NullPointer,
    /// Generic whisper error. Varies depending on the function.
    GenericError(c_int),
    /// Whisper failed to convert the provided text into tokens.
    InvalidText,
    /// Creating a state pointer failed. Check stderr for more information.
    FailedToCreateState,
    /// No samples were provided.
    NoSamples,
    /// Input and output slices were not the same length.
    InputOutputLengthMismatch { input_len: usize, output_len: usize },
    /// Input slice was not an even number of samples.
    HalfSampleMissing(usize),
}

impl From<Utf8Error> for WhisperError {
    fn from(e: Utf8Error) -> Self {
        Self::InvalidUtf8 {
            error_len: e.error_len(),
            valid_up_to: e.valid_up_to(),
        }
    }
}

impl From<NulError> for WhisperError {
    fn from(e: NulError) -> Self {
        Self::NullByteInString {
            idx: e.nul_position(),
        }
    }
}

impl std::fmt::Display for WhisperError {
    fn fmt(&self, f: &mut std::fmt::Formatter) -> std::fmt::Result {
        use WhisperError::*;
        match self {
            InitError => write!(f, "Failed to create a new whisper context."),
            SpectrogramNotInitialized => write!(f, "User didn't initialize spectrogram."),
            EncodeNotComplete => write!(f, "Encode was not called."),
            DecodeNotComplete => write!(f, "Decode was not called."),
            UnableToCalculateSpectrogram => {
                write!(f, "Failed to calculate the spectrogram for some reason.")
            }
            UnableToCalculateEvaluation => write!(f, "Failed to evaluate model."),
            FailedToEncode => write!(f, "Failed to run the encoder."),
            FailedToDecode => write!(f, "Failed to run the decoder."),
            InvalidMelBands => write!(f, "Invalid number of mel bands."),
            InvalidThreadCount => write!(f, "Invalid thread count."),
            InvalidUtf8 {
                valid_up_to,
                error_len: Some(len),
            } => write!(
                f,
                "Invalid UTF-8 detected in a string from Whisper. Index: {}, Length: {}.",
                valid_up_to, len
            ),
            InvalidUtf8 {
                valid_up_to,
                error_len: None,
            } => write!(
                f,
                "Invalid UTF-8 detected in a string from Whisper. Index: {}.",
                valid_up_to
            ),
            NullByteInString { idx } => write!(
                f,
                "A null byte was detected in a user-provided string. Index: {}",
                idx
            ),
            NullPointer => write!(f, "Whisper returned a null pointer."),
            InvalidText => write!(
                f,
                "Whisper failed to convert the provided text into tokens."
            ),
            FailedToCreateState => write!(f, "Creating a state pointer failed."),
            GenericError(c_int) => write!(
                f,
                "Generic whisper error. Varies depending on the function. Error code: {}",
                c_int
            ),
            NoSamples => write!(f, "Input sample buffer was empty."),
            InputOutputLengthMismatch {
                output_len,
                input_len,
            } => {
                write!(
                    f,
                    "Input and output slices were not the same length. Input: {}, Output: {}",
                    input_len, output_len
                )
            }
            HalfSampleMissing(size) => {
                write!(
                    f,
                    "Input slice was not an even number of samples, got {}, expected {}",
                    size,
                    size + 1
                )
            }
        }
    }
}

impl std::error::Error for WhisperError {}
