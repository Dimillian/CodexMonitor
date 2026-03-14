use std::ffi::{c_int, CStr};
use std::sync::Arc;

use crate::{
    WhisperContextParameters, WhisperError, WhisperInnerContext, WhisperState, WhisperToken,
};

pub struct WhisperContext {
    ctx: Arc<WhisperInnerContext>,
}

impl WhisperContext {
    fn wrap(ctx: WhisperInnerContext) -> Self {
        Self { ctx: Arc::new(ctx) }
    }

    /// Create a new WhisperContext from a file, with parameters.
    ///
    /// # Arguments
    /// * path: The path to the model file.
    /// * parameters: A parameter struct containing the parameters to use.
    ///
    /// # Returns
    /// Ok(Self) on success, Err(WhisperError) on failure.
    ///
    /// # C++ equivalent
    /// `struct whisper_context * whisper_init_from_file_with_params_no_state(const char * path_model, struct whisper_context_params params);`
    pub fn new_with_params(
        path: &str,
        parameters: WhisperContextParameters,
    ) -> Result<Self, WhisperError> {
        let ctx = WhisperInnerContext::new_with_params(path, parameters)?;
        Ok(Self::wrap(ctx))
    }

    /// Create a new WhisperContext from a buffer.
    ///
    /// # Arguments
    /// * buffer: The buffer containing the model.
    ///
    /// # Returns
    /// Ok(Self) on success, Err(WhisperError) on failure.
    ///
    /// # C++ equivalent
    /// `struct whisper_context * whisper_init_from_buffer_with_params_no_state(void * buffer, size_t buffer_size, struct whisper_context_params params);`
    pub fn new_from_buffer_with_params(
        buffer: &[u8],
        parameters: WhisperContextParameters,
    ) -> Result<Self, WhisperError> {
        let ctx = WhisperInnerContext::new_from_buffer_with_params(buffer, parameters)?;
        Ok(Self::wrap(ctx))
    }

    /// Convert the provided text into tokens.
    ///
    /// # Arguments
    /// * text: The text to convert.
    ///
    /// # Returns
    /// `Ok(Vec<WhisperToken>)` on success, `Err(WhisperError)` on failure.
    ///
    /// # C++ equivalent
    /// `int whisper_tokenize(struct whisper_context * ctx, const char * text, whisper_token * tokens, int n_max_tokens);`
    pub fn tokenize(
        &self,
        text: &str,
        max_tokens: usize,
    ) -> Result<Vec<WhisperToken>, WhisperError> {
        self.ctx.tokenize(text, max_tokens)
    }

    /// Get n_vocab.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_n_vocab        (struct whisper_context * ctx)`
    #[inline]
    pub fn n_vocab(&self) -> c_int {
        self.ctx.n_vocab()
    }

    /// Get n_text_ctx.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_n_text_ctx     (struct whisper_context * ctx);`
    #[inline]
    pub fn n_text_ctx(&self) -> c_int {
        self.ctx.n_text_ctx()
    }

    /// Get n_audio_ctx.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_n_audio_ctx     (struct whisper_context * ctx);`
    #[inline]
    pub fn n_audio_ctx(&self) -> c_int {
        self.ctx.n_audio_ctx()
    }

    /// Does this model support multiple languages?
    ///
    /// # C++ equivalent
    /// `int whisper_is_multilingual(struct whisper_context * ctx)`
    #[inline]
    pub fn is_multilingual(&self) -> bool {
        self.ctx.is_multilingual()
    }

    /// Get model_n_vocab.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_vocab      (struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_vocab(&self) -> c_int {
        self.ctx.model_n_vocab()
    }

    /// Get model_n_audio_ctx.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_audio_ctx    (struct whisper_context * ctx)`
    #[inline]
    pub fn model_n_audio_ctx(&self) -> c_int {
        self.ctx.model_n_audio_ctx()
    }

    /// Get model_n_audio_state.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_audio_state(struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_audio_state(&self) -> c_int {
        self.ctx.model_n_audio_state()
    }

    /// Get model_n_audio_head.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_audio_head (struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_audio_head(&self) -> c_int {
        self.ctx.model_n_audio_head()
    }

    /// Get model_n_audio_layer.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_audio_layer(struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_audio_layer(&self) -> c_int {
        self.ctx.model_n_audio_layer()
    }

    /// Get model_n_text_ctx.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_text_ctx     (struct whisper_context * ctx)`
    #[inline]
    pub fn model_n_text_ctx(&self) -> c_int {
        self.ctx.model_n_text_ctx()
    }

    /// Get model_n_text_state.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_text_state (struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_text_state(&self) -> c_int {
        self.ctx.model_n_text_state()
    }

    /// Get model_n_text_head.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_text_head  (struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_text_head(&self) -> c_int {
        self.ctx.model_n_text_head()
    }

    /// Get model_n_text_layer.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_text_layer (struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_text_layer(&self) -> c_int {
        self.ctx.model_n_text_layer()
    }

    /// Get model_n_mels.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_n_mels       (struct whisper_context * ctx);`
    #[inline]
    pub fn model_n_mels(&self) -> c_int {
        self.ctx.model_n_mels()
    }

    /// Get model_ftype.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_ftype          (struct whisper_context * ctx);`
    #[inline]
    pub fn model_ftype(&self) -> c_int {
        self.ctx.model_ftype()
    }

    /// Get model_type.
    ///
    /// # Returns
    /// c_int
    ///
    /// # C++ equivalent
    /// `int whisper_model_type         (struct whisper_context * ctx);`
    #[inline]
    pub fn model_type(&self) -> c_int {
        self.ctx.model_type()
    }

    // token functions
    /// Convert a token ID to a string.
    ///
    /// # Arguments
    /// * token_id: ID of the token.
    ///
    /// # Returns
    /// Ok(&str) on success, Err(WhisperError) on failure.
    ///
    /// # C++ equivalent
    /// `const char * whisper_token_to_str(struct whisper_context * ctx, whisper_token token)`
    pub fn token_to_str(&self, token_id: WhisperToken) -> Result<&str, WhisperError> {
        self.ctx.token_to_str(token_id)
    }

    /// Convert a token ID to a &CStr.
    ///
    /// # Arguments
    /// * token_id: ID of the token.
    ///
    /// # Returns
    /// Ok(String) on success, Err(WhisperError) on failure.
    ///
    /// # C++ equivalent
    /// `const char * whisper_token_to_str(struct whisper_context * ctx, whisper_token token)`
    pub fn token_to_cstr(&self, token_id: WhisperToken) -> Result<&CStr, WhisperError> {
        self.ctx.token_to_cstr(token_id)
    }

    /// Undocumented but exposed function in the C++ API.
    /// `const char * whisper_model_type_readable(struct whisper_context * ctx);`
    ///
    /// # Returns
    /// Ok(String) on success, Err(WhisperError) on failure.
    pub fn model_type_readable(&self) -> Result<String, WhisperError> {
        self.ctx.model_type_readable()
    }

    /// Get the ID of the eot token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_eot (struct whisper_context * ctx)`
    #[inline]
    pub fn token_eot(&self) -> WhisperToken {
        self.ctx.token_eot()
    }

    /// Get the ID of the sot token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_sot (struct whisper_context * ctx)`
    #[inline]
    pub fn token_sot(&self) -> WhisperToken {
        self.ctx.token_sot()
    }

    /// Get the ID of the solm token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_solm(struct whisper_context * ctx)`
    #[inline]
    pub fn token_solm(&self) -> WhisperToken {
        self.ctx.token_solm()
    }

    /// Get the ID of the prev token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_prev(struct whisper_context * ctx)`
    #[inline]
    pub fn token_prev(&self) -> WhisperToken {
        self.ctx.token_prev()
    }

    /// Get the ID of the nosp token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_nosp(struct whisper_context * ctx)`
    #[inline]
    pub fn token_nosp(&self) -> WhisperToken {
        self.ctx.token_nosp()
    }

    /// Get the ID of the not token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_not (struct whisper_context * ctx)`
    #[inline]
    pub fn token_not(&self) -> WhisperToken {
        self.ctx.token_not()
    }

    /// Get the ID of the beg token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_beg (struct whisper_context * ctx)`
    #[inline]
    pub fn token_beg(&self) -> WhisperToken {
        self.ctx.token_beg()
    }

    /// Get the ID of a specified language token
    ///
    /// # Arguments
    /// * lang_id: ID of the language
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_lang(struct whisper_context * ctx, int lang_id)`
    #[inline]
    pub fn token_lang(&self, lang_id: c_int) -> WhisperToken {
        self.ctx.token_lang(lang_id)
    }

    /// Print performance statistics to stderr.
    ///
    /// # C++ equivalent
    /// `void whisper_print_timings(struct whisper_context * ctx)`
    #[inline]
    pub fn print_timings(&self) {
        self.ctx.print_timings()
    }

    /// Reset performance statistics.
    ///
    /// # C++ equivalent
    /// `void whisper_reset_timings(struct whisper_context * ctx)`
    #[inline]
    pub fn reset_timings(&self) {
        self.ctx.reset_timings()
    }

    // task tokens
    /// Get the ID of the translate task token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_translate ()`
    pub fn token_translate(&self) -> WhisperToken {
        self.ctx.token_translate()
    }

    /// Get the ID of the transcribe task token.
    ///
    /// # C++ equivalent
    /// `whisper_token whisper_token_transcribe()`
    pub fn token_transcribe(&self) -> WhisperToken {
        self.ctx.token_transcribe()
    }

    // we don't implement `whisper_init()` here since i have zero clue what `whisper_model_loader` does

    /// Create a new state object, ready for use.
    ///
    /// # Returns
    /// Ok(WhisperState) on success, Err(WhisperError) on failure.
    ///
    /// # C++ equivalent
    /// `struct whisper_state * whisper_init_state(struct whisper_context * ctx);`
    pub fn create_state(&self) -> Result<WhisperState, WhisperError> {
        let state = unsafe { whisper_rs_sys::whisper_init_state(self.ctx.ctx) };
        if state.is_null() {
            Err(WhisperError::InitError)
        } else {
            // SAFETY: this is known to be a valid pointer to a `whisper_state` struct
            Ok(WhisperState::new(self.ctx.clone(), state))
        }
    }
}
