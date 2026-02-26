use crate::whisper_grammar::WhisperGrammarElement;
use std::ffi::{c_char, c_float, c_int, CString};
use std::marker::PhantomData;
use std::sync::Arc;
use whisper_rs_sys::whisper_token;

#[derive(Debug, Clone)]
pub enum SamplingStrategy {
    Greedy {
        best_of: c_int,
    },
    BeamSearch {
        beam_size: c_int,
        // not implemented in whisper.cpp as of this writing (v1.2.0)
        patience: c_float,
    },
}

impl Default for SamplingStrategy {
    fn default() -> Self {
        Self::Greedy { best_of: 1 }
    }
}

#[derive(Debug, Clone)]
pub struct SegmentCallbackData {
    pub segment: i32,
    pub start_timestamp: i64,
    pub end_timestamp: i64,
    pub text: String,
}

type SegmentCallbackFn = Box<dyn FnMut(SegmentCallbackData)>;

#[derive(Clone)]
pub struct FullParams<'a, 'b> {
    pub(crate) fp: whisper_rs_sys::whisper_full_params,
    phantom_lang: PhantomData<&'a str>,
    phantom_tokens: PhantomData<&'b [c_int]>,
    grammar: Option<Vec<whisper_rs_sys::whisper_grammar_element>>,
    progess_callback_safe: Option<Arc<Box<dyn FnMut(i32)>>>,
    abort_callback_safe: Option<Arc<Box<dyn FnMut() -> bool>>>,
    segment_calllback_safe: Option<Arc<SegmentCallbackFn>>,
}

impl<'a, 'b> FullParams<'a, 'b> {
    /// Create a new set of parameters for the decoder.
    pub fn new(sampling_strategy: SamplingStrategy) -> FullParams<'a, 'b> {
        let mut fp = unsafe {
            whisper_rs_sys::whisper_full_default_params(match sampling_strategy {
                SamplingStrategy::Greedy { .. } => {
                    whisper_rs_sys::whisper_sampling_strategy_WHISPER_SAMPLING_GREEDY
                }
                SamplingStrategy::BeamSearch { .. } => {
                    whisper_rs_sys::whisper_sampling_strategy_WHISPER_SAMPLING_BEAM_SEARCH
                }
            } as _)
        };

        match sampling_strategy {
            SamplingStrategy::Greedy { best_of } => {
                fp.greedy.best_of = best_of;
            }
            SamplingStrategy::BeamSearch {
                beam_size,
                patience,
            } => {
                fp.beam_search.beam_size = beam_size;
                fp.beam_search.patience = patience;
            }
        }

        Self {
            fp,
            phantom_lang: PhantomData,
            phantom_tokens: PhantomData,
            grammar: None,
            progess_callback_safe: None,
            abort_callback_safe: None,
            segment_calllback_safe: None,
        }
    }

    /// Set the number of threads to use for decoding.
    ///
    /// Defaults to min(4, std::thread::hardware_concurrency()).
    pub fn set_n_threads(&mut self, n_threads: c_int) {
        self.fp.n_threads = n_threads;
    }

    /// Max tokens to use from past text as prompt for the decoder
    ///
    /// Defaults to 16384.
    pub fn set_n_max_text_ctx(&mut self, n_max_text_ctx: c_int) {
        self.fp.n_max_text_ctx = n_max_text_ctx;
    }

    /// Set the start offset in milliseconds to use for decoding.
    ///
    /// Defaults to 0.
    pub fn set_offset_ms(&mut self, offset_ms: c_int) {
        self.fp.offset_ms = offset_ms;
    }

    /// Set the audio duration to process in milliseconds.
    ///
    /// Defaults to 0.
    pub fn set_duration_ms(&mut self, duration_ms: c_int) {
        self.fp.duration_ms = duration_ms;
    }

    /// Set whether to translate the output to the language specified by `language`.
    ///
    /// Defaults to false.
    pub fn set_translate(&mut self, translate: bool) {
        self.fp.translate = translate;
    }

    /// Do not use past transcription (if any) as initial prompt for the decoder.
    ///
    /// Defaults to false.
    pub fn set_no_context(&mut self, no_context: bool) {
        self.fp.no_context = no_context;
    }

    /// Do not generate timestamps.
    ///
    /// Defaults to false.
    pub fn set_no_timestamps(&mut self, no_timestamps: bool) {
        self.fp.no_timestamps = no_timestamps;
    }

    /// Force single segment output. This may be useful for streaming.
    ///
    /// Defaults to false.
    pub fn set_single_segment(&mut self, single_segment: bool) {
        self.fp.single_segment = single_segment;
    }

    /// Print special tokens (e.g. `<SOT>`, `<EOT>`, `<BEG>`, etc.)
    ///
    /// Defaults to false.
    pub fn set_print_special(&mut self, print_special: bool) {
        self.fp.print_special = print_special;
    }

    /// Set whether to print progress.
    ///
    /// Defaults to true.
    pub fn set_print_progress(&mut self, print_progress: bool) {
        self.fp.print_progress = print_progress;
    }

    /// Print results from within whisper.cpp.
    /// Try to use the callback methods instead: [set_new_segment_callback](FullParams::set_new_segment_callback),
    /// [set_new_segment_callback_user_data](FullParams::set_new_segment_callback_user_data).
    ///
    /// Defaults to false.
    pub fn set_print_realtime(&mut self, print_realtime: bool) {
        self.fp.print_realtime = print_realtime;
    }

    /// Print timestamps for each text segment when printing realtime. Only has an effect if
    /// [set_print_realtime](FullParams::set_print_realtime) is set to true.
    ///
    /// Defaults to true.
    pub fn set_print_timestamps(&mut self, print_timestamps: bool) {
        self.fp.print_timestamps = print_timestamps;
    }

    /// # EXPERIMENTAL
    ///
    /// Enable token-level timestamps.
    ///
    /// Defaults to false.
    pub fn set_token_timestamps(&mut self, token_timestamps: bool) {
        self.fp.token_timestamps = token_timestamps;
    }

    /// # EXPERIMENTAL
    ///
    /// Set timestamp token probability threshold.
    ///
    /// Defaults to 0.01.
    pub fn set_thold_pt(&mut self, thold_pt: f32) {
        self.fp.thold_pt = thold_pt;
    }

    /// # EXPERIMENTAL
    ///
    /// Set timestamp token sum probability threshold.
    ///
    /// Defaults to 0.01.
    pub fn set_thold_ptsum(&mut self, thold_ptsum: f32) {
        self.fp.thold_ptsum = thold_ptsum;
    }

    /// # EXPERIMENTAL
    ///
    /// Set maximum segment length in characters.
    ///
    /// Defaults to 0.
    pub fn set_max_len(&mut self, max_len: c_int) {
        self.fp.max_len = max_len;
    }

    /// # EXPERIMENTAL
    ///
    /// Should the timestamps be split on words instead of characters?
    ///
    /// Defaults to false.
    pub fn set_split_on_word(&mut self, split_on_word: bool) {
        self.fp.split_on_word = split_on_word;
    }

    /// # EXPERIMENTAL
    ///
    /// Set maximum tokens per segment. 0 means no limit.
    ///
    /// Defaults to 0.
    pub fn set_max_tokens(&mut self, max_tokens: c_int) {
        self.fp.max_tokens = max_tokens;
    }

    /// # EXPERIMENTAL
    ///
    /// Speed up audio ~2x by using phase vocoder.
    /// Note that this can significantly reduce the accuracy of the transcription.
    ///
    /// Defaults to false.
    pub fn set_speed_up(&mut self, speed_up: bool) {
        self.fp.speed_up = speed_up;
    }

    /// # EXPERIMENTAL
    ///
    /// Enables debug mode, such as dumping the log mel spectrogram.
    ///
    /// Defaults to false.
    pub fn set_debug_mode(&mut self, debug: bool) {
        self.fp.debug_mode = debug;
    }

    /// # EXPERIMENTAL
    ///
    /// Overwrite the audio context size. 0 = default.
    /// As with [set_speed_up](FullParams::set_speed_up), this can significantly reduce the accuracy of the transcription.
    ///
    /// Defaults to 0.
    pub fn set_audio_ctx(&mut self, audio_ctx: c_int) {
        self.fp.audio_ctx = audio_ctx;
    }

    /// # EXPERIMENTAL
    ///
    /// Enable tinydiarize support.
    /// Experimental speaker turn detection.
    ///
    /// Defaults to false.
    pub fn set_tdrz_enable(&mut self, tdrz_enable: bool) {
        self.fp.tdrz_enable = tdrz_enable;
    }

    /// Set tokens to provide the model as initial input.
    ///
    /// These tokens are prepended to any existing text content from a previous call.
    ///
    /// Calling this more than once will overwrite the previous tokens.
    ///
    /// Defaults to an empty vector.
    pub fn set_tokens(&mut self, tokens: &'b [c_int]) {
        // turn into ptr and len
        let tokens_ptr: *const whisper_token = tokens.as_ptr();
        let tokens_len: c_int = tokens.len() as c_int;

        // set the tokens
        self.fp.prompt_tokens = tokens_ptr;
        self.fp.prompt_n_tokens = tokens_len;
    }

    /// Set the target language.
    ///
    /// For auto-detection, set this to either "auto" or None.
    ///
    /// Defaults to "en".
    pub fn set_language(&mut self, language: Option<&'a str>) {
        self.fp.language = match language {
            Some(language) => CString::new(language)
                .expect("Language contains null byte")
                .into_raw() as *const _,
            None => std::ptr::null(),
        };
    }

    /// Set `detect_language`.
    ///
    /// Has the same effect as setting the language to "auto" or None.
    ///
    /// Defaults to false.
    pub fn set_detect_language(&mut self, detect_language: bool) {
        self.fp.detect_language = detect_language;
    }

    /// Set suppress_blank.
    /// See <https://github.com/openai/whisper/blob/f82bc59f5ea234d4b97fb2860842ed38519f7e65/whisper/decoding.py#L89>
    /// for more information.
    ///
    /// Defaults to true.
    pub fn set_suppress_blank(&mut self, suppress_blank: bool) {
        self.fp.suppress_blank = suppress_blank;
    }

    /// Set suppress_non_speech_tokens.
    /// See <https://github.com/openai/whisper/blob/7858aa9c08d98f75575035ecd6481f462d66ca27/whisper/tokenizer.py#L224-L253>
    /// for more information.
    ///
    /// Defaults to false.
    pub fn set_suppress_non_speech_tokens(&mut self, suppress_non_speech_tokens: bool) {
        self.fp.suppress_non_speech_tokens = suppress_non_speech_tokens;
    }

    /// Set initial decoding temperature.
    /// See <https://ai.stackexchange.com/a/32478> for more information.
    ///
    /// Defaults to 0.0.
    pub fn set_temperature(&mut self, temperature: f32) {
        self.fp.temperature = temperature;
    }

    /// Set max_initial_ts.
    /// See <https://github.com/openai/whisper/blob/f82bc59f5ea234d4b97fb2860842ed38519f7e65/whisper/decoding.py#L97>
    /// for more information.
    ///
    /// Defaults to 1.0.
    pub fn set_max_initial_ts(&mut self, max_initial_ts: f32) {
        self.fp.max_initial_ts = max_initial_ts;
    }

    /// Set length_penalty.
    /// See <https://github.com/openai/whisper/blob/f82bc59f5ea234d4b97fb2860842ed38519f7e65/whisper/transcribe.py#L267>
    /// for more information.
    ///
    /// Defaults to -1.0.
    pub fn set_length_penalty(&mut self, length_penalty: f32) {
        self.fp.length_penalty = length_penalty;
    }

    /// Set temperature_inc.
    /// See <https://github.com/openai/whisper/blob/f82bc59f5ea234d4b97fb2860842ed38519f7e65/whisper/transcribe.py#L274-L278>
    /// for more information.
    ///
    /// Defaults to 0.2.
    pub fn set_temperature_inc(&mut self, temperature_inc: f32) {
        self.fp.temperature_inc = temperature_inc;
    }

    /// Set entropy_thold. Similar to OpenAI's compression_ratio_threshold.
    /// See <https://github.com/openai/whisper/blob/f82bc59f5ea234d4b97fb2860842ed38519f7e65/whisper/transcribe.py#L274-L278> for more information.
    ///
    /// Defaults to 2.4.
    pub fn set_entropy_thold(&mut self, entropy_thold: f32) {
        self.fp.entropy_thold = entropy_thold;
    }

    /// Set logprob_thold.
    /// See <https://github.com/openai/whisper/blob/f82bc59f5ea234d4b97fb2860842ed38519f7e65/whisper/transcribe.py#L274-L278>
    /// for more information.
    ///
    /// Defaults to -1.0.
    pub fn set_logprob_thold(&mut self, logprob_thold: f32) {
        self.fp.logprob_thold = logprob_thold;
    }

    /// Set no_speech_thold. Currently (as of v1.3.0) not implemented.
    ///
    /// Defaults to 0.6.
    pub fn set_no_speech_thold(&mut self, no_speech_thold: f32) {
        self.fp.no_speech_thold = no_speech_thold;
    }

    /// Set the callback for new segments.
    ///
    /// Note that this callback has not been Rustified yet (and likely never will be, unless someone else feels the need to do so).
    /// It is still a C callback.
    ///
    /// # Safety
    /// Do not use this function unless you know what you are doing.
    /// * Be careful not to mutate the state of the whisper_context pointer returned in the callback.
    ///   This could cause undefined behavior, as this violates the thread-safety guarantees of the underlying C library.
    ///
    /// Defaults to None.
    pub unsafe fn set_new_segment_callback(
        &mut self,
        new_segment_callback: crate::WhisperNewSegmentCallback,
    ) {
        self.fp.new_segment_callback = new_segment_callback;
    }

    /// Set the user data to be passed to the new segment callback.
    ///
    /// # Safety
    /// See the safety notes for `set_new_segment_callback`.
    ///
    /// Defaults to None.
    pub unsafe fn set_new_segment_callback_user_data(&mut self, user_data: *mut std::ffi::c_void) {
        self.fp.new_segment_callback_user_data = user_data;
    }

    /// Set the callback for segment updates.
    ///
    /// Provides a limited segment_callback to ensure safety.
    /// See `set_new_segment_callback` if you need to use `whisper_context` and `whisper_state`
    ///
    /// Defaults to None.
    pub fn set_segment_callback_safe<O, F>(&mut self, closure: O)
    where
        F: FnMut(SegmentCallbackData) + 'static,
        O: Into<Option<F>>,
    {
        use std::ffi::{c_void, CStr};
        use whisper_rs_sys::{whisper_context, whisper_state};

        extern "C" fn trampoline<F>(
            _: *mut whisper_context,
            state: *mut whisper_state,
            n_new: i32,
            user_data: *mut c_void,
        ) where
            F: FnMut(SegmentCallbackData) + 'static,
        {
            unsafe {
                let user_data = &mut *(user_data as *mut SegmentCallbackFn);
                let n_segments = whisper_rs_sys::whisper_full_n_segments_from_state(state);
                let s0 = n_segments - n_new;
                //let user_data = user_data as *mut Box<dyn FnMut(SegmentCallbackData)>;

                for i in s0..n_segments {
                    let text = whisper_rs_sys::whisper_full_get_segment_text_from_state(state, i);
                    let text = CStr::from_ptr(text);

                    let t0 = whisper_rs_sys::whisper_full_get_segment_t0_from_state(state, i);
                    let t1 = whisper_rs_sys::whisper_full_get_segment_t1_from_state(state, i);

                    match text.to_str() {
                        Ok(n) => user_data(SegmentCallbackData {
                            segment: i,
                            start_timestamp: t0,
                            end_timestamp: t1,
                            text: n.to_string(),
                        }),
                        Err(_) => {}
                    }
                }
            }
        }

        match closure.into() {
            Some(closure) => {
                // Stable address
                let closure = Box::new(closure) as SegmentCallbackFn;
                // Thin pointer
                let closure = Box::new(closure);
                // Raw pointer
                let closure = Box::into_raw(closure);

                self.fp.new_segment_callback_user_data = closure as *mut c_void;
                self.fp.new_segment_callback = Some(trampoline::<SegmentCallbackFn>);
                self.segment_calllback_safe = None;
            }
            None => {
                self.segment_calllback_safe = None;
                self.fp.new_segment_callback = None;
                self.fp.new_segment_callback_user_data = std::ptr::null_mut::<c_void>();
            }
        }
    }

    /// Set the callback for segment updates.
    ///
    /// Provides a limited segment_callback to ensure safety with lossy handling of bad UTF-8 characters.
    /// See `set_new_segment_callback` if you need to use `whisper_context` and `whisper_state`.
    ///
    /// Defaults to None.
    pub fn set_segment_callback_safe_lossy<O, F>(&mut self, closure: O)
    where
        F: FnMut(SegmentCallbackData) + 'static,
        O: Into<Option<F>>,
    {
        use std::ffi::{c_void, CStr};
        use whisper_rs_sys::{whisper_context, whisper_state};

        extern "C" fn trampoline<F>(
            _: *mut whisper_context,
            state: *mut whisper_state,
            n_new: i32,
            user_data: *mut c_void,
        ) where
            F: FnMut(SegmentCallbackData) + 'static,
        {
            unsafe {
                let user_data = &mut *(user_data as *mut SegmentCallbackFn);
                let n_segments = whisper_rs_sys::whisper_full_n_segments_from_state(state);
                let s0 = n_segments - n_new;
                //let user_data = user_data as *mut Box<dyn FnMut(SegmentCallbackData)>;

                for i in s0..n_segments {
                    let text = whisper_rs_sys::whisper_full_get_segment_text_from_state(state, i);
                    let text = CStr::from_ptr(text);

                    let t0 = whisper_rs_sys::whisper_full_get_segment_t0_from_state(state, i);
                    let t1 = whisper_rs_sys::whisper_full_get_segment_t1_from_state(state, i);
                    user_data(SegmentCallbackData {
                        segment: i,
                        start_timestamp: t0,
                        end_timestamp: t1,
                        text: text.to_string_lossy().to_string(),
                    });
                }
            }
        }

        match closure.into() {
            Some(closure) => {
                // Stable address
                let closure = Box::new(closure) as SegmentCallbackFn;
                // Thin pointer
                let closure = Box::new(closure);
                // Raw pointer
                let closure = Box::into_raw(closure);

                self.fp.new_segment_callback_user_data = closure as *mut c_void;
                self.fp.new_segment_callback = Some(trampoline::<SegmentCallbackFn>);
                self.segment_calllback_safe = None;
            }
            None => {
                self.segment_calllback_safe = None;
                self.fp.new_segment_callback = None;
                self.fp.new_segment_callback_user_data = std::ptr::null_mut::<c_void>();
            }
        }
    }

    /// Set the callback for progress updates.
    ///
    /// Note that is still a C callback.
    /// See `set_progress_callback_safe` for a limited yet safe version.
    ///
    /// # Safety
    /// Do not use this function unless you know what you are doing.
    /// * Be careful not to mutate the state of the whisper_context pointer returned in the callback.
    ///  This could cause undefined behavior, as this violates the thread-safety guarantees of the underlying C library.
    ///
    /// Defaults to None.
    pub unsafe fn set_progress_callback(
        &mut self,
        progress_callback: crate::WhisperProgressCallback,
    ) {
        self.fp.progress_callback = progress_callback;
    }

    /// Set the callback for progress updates, potentially using a closure.
    ///
    /// Note that, in order to ensure safety, the callback only accepts the progress in percent.
    /// See `set_progress_callback` if you need to use `whisper_context` and `whisper_state`
    /// (or extend this one to support their use).
    ///
    /// Defaults to None.
    pub fn set_progress_callback_safe<O, F>(&mut self, closure: O)
    where
        F: FnMut(i32) + 'static,
        O: Into<Option<F>>,
    {
        use std::ffi::c_void;
        use whisper_rs_sys::{whisper_context, whisper_state};

        unsafe extern "C" fn trampoline<F>(
            _: *mut whisper_context,
            _: *mut whisper_state,
            progress: c_int,
            user_data: *mut c_void,
        ) where
            F: FnMut(i32),
        {
            let user_data = &mut *(user_data as *mut F);
            user_data(progress);
        }

        match closure.into() {
            Some(mut closure) => {
                self.fp.progress_callback = Some(trampoline::<F>);
                self.fp.progress_callback_user_data = &mut closure as *mut F as *mut c_void;
                // store the closure internally to make sure that the pointer above remains valid
                self.progess_callback_safe = Some(Arc::new(Box::new(closure)));
            }
            None => {
                self.fp.progress_callback = None;
                self.fp.progress_callback_user_data = std::ptr::null_mut::<c_void>();
                self.progess_callback_safe = None;
            }
        }
    }

    /// Set the callback for abort conditions, potentially using a closure.
    ///
    /// Note that, for safety, the callback only accepts a function that returns a boolean
    /// indicating whether to abort or not.
    ///
    /// See `set_progress_callback` if you need to use `whisper_context` and `whisper_state`,
    /// or extend this one to support their use.
    ///
    /// Defaults to None.
    pub fn set_abort_callback_safe<O, F>(&mut self, closure: O)
    where
        F: FnMut() -> bool + 'static,
        O: Into<Option<F>>,
    {
        use std::ffi::c_void;

        unsafe extern "C" fn trampoline<F>(user_data: *mut c_void) -> bool
        where
            F: FnMut() -> bool,
        {
            let user_data = &mut *(user_data as *mut F);
            user_data()
        }

        match closure.into() {
            Some(closure) => {
                // Stable address
                let closure = Box::new(closure) as Box<dyn FnMut() -> bool>;
                // Thin pointer
                let closure = Box::new(closure);
                // Raw pointer
                let closure = Box::into_raw(closure);

                self.fp.abort_callback = Some(trampoline::<F>);
                self.fp.abort_callback_user_data = closure as *mut c_void;
                self.abort_callback_safe = None;
            }
            None => {
                self.fp.abort_callback = None;
                self.fp.abort_callback_user_data = std::ptr::null_mut::<c_void>();
                self.abort_callback_safe = None;
            }
        }
    }

    /// Set the user data to be passed to the progress callback.
    ///
    /// # Safety
    /// See the safety notes for `set_progress_callback`.
    ///
    /// Defaults to None.
    pub unsafe fn set_progress_callback_user_data(&mut self, user_data: *mut std::ffi::c_void) {
        self.fp.progress_callback_user_data = user_data;
    }

    /// Set the callback that is called each time before the encoder begins.
    ///
    /// Note that this callback has not been Rustified yet (and likely never will be, unless someone else feels the need to do so).
    /// It is still a C callback.
    ///
    /// # Safety
    /// Do not use this function unless you know what you are doing.
    /// * Be careful not to mutate the state of the whisper_context pointer returned in the callback.
    ///  This could cause undefined behavior, as this violates the thread-safety guarantees of the underlying C library.
    ///
    /// Defaults to None.
    pub unsafe fn set_start_encoder_callback(
        &mut self,
        start_encoder_callback: crate::WhisperStartEncoderCallback,
    ) {
        self.fp.encoder_begin_callback = start_encoder_callback;
    }

    /// Set the user data to be passed to the start encoder callback.
    ///
    /// # Safety
    /// See the safety notes for `set_start_encoder_callback`.
    ///
    /// Defaults to None.
    pub unsafe fn set_start_encoder_callback_user_data(
        &mut self,
        user_data: *mut std::ffi::c_void,
    ) {
        self.fp.encoder_begin_callback_user_data = user_data;
    }

    /// Set the callback that is called by each decoder to filter obtained logits.
    ///
    /// Note that this callback has not been Rustified yet (and likely never will be, unless someone else feels the need to do so).
    /// It is still a C callback.
    ///
    /// # Safety
    /// Do not use this function unless you know what you are doing.
    /// * Be careful not to mutate the state of the whisper_context pointer returned in the callback.
    ///   This could cause undefined behavior, as this violates the thread-safety guarantees of the underlying C library.
    ///
    /// Defaults to None.
    pub unsafe fn set_filter_logits_callback(
        &mut self,
        logits_filter_callback: crate::WhisperLogitsFilterCallback,
    ) {
        self.fp.logits_filter_callback = logits_filter_callback;
    }

    /// Set the user data to be passed to the logits filter callback.
    ///
    /// # Safety
    /// See the safety notes for `set_filter_logits_callback`.
    ///
    /// Defaults to None.
    pub unsafe fn set_filter_logits_callback_user_data(
        &mut self,
        user_data: *mut std::ffi::c_void,
    ) {
        self.fp.logits_filter_callback_user_data = user_data;
    }

    /// Set the callback that is called each time before ggml computation starts.
    ///
    /// Note that this callback has not been Rustified yet (and likely never will be, unless someone else feels the need to do so).
    /// It is still a C callback.
    ///
    /// # Safety
    /// Do not use this function unless you know what you are doing.
    /// * Be careful not to mutate the state of the whisper_context pointer returned in the callback.
    ///   This could cause undefined behavior, as this violates the thread-safety guarantees of the underlying C library.
    ///
    /// Defaults to None.
    pub unsafe fn set_abort_callback(&mut self, abort_callback: crate::WhisperAbortCallback) {
        self.fp.abort_callback = abort_callback;
    }

    /// Set the user data to be passed to the abort callback.
    ///
    /// # Safety
    /// See the safety notes for `set_abort_callback`.
    ///
    /// Defaults to None.
    pub unsafe fn set_abort_callback_user_data(&mut self, user_data: *mut std::ffi::c_void) {
        self.fp.abort_callback_user_data = user_data;
    }

    /// Enable an array of grammar elements to be passed to the whisper model.
    ///
    /// Defaults to an empty vector.
    pub fn set_grammar(&mut self, grammar: Option<&[WhisperGrammarElement]>) {
        if let Some(grammar) = grammar {
            // convert to c types
            let inner = grammar.iter().map(|e| e.to_c_type()).collect::<Vec<_>>();
            // turn into ptr and len
            let grammar_ptr = inner.as_ptr() as *mut _;
            let grammar_len = inner.len();

            self.grammar = Some(inner);

            // set the grammar
            self.fp.grammar_rules = grammar_ptr;
            self.fp.n_grammar_rules = grammar_len;
        } else {
            self.grammar = None;
            self.fp.grammar_rules = std::ptr::null_mut();
            self.fp.n_grammar_rules = 0;
            self.fp.i_start_rule = 0;
        }
    }

    /// Set the start grammar rule. Does nothing if no grammar is set.
    ///
    /// Defaults to 0.
    pub fn set_start_rule(&mut self, start_rule: usize) {
        if self.grammar.is_some() {
            self.fp.i_start_rule = start_rule;
        }
    }

    /// Set grammar penalty.
    ///
    /// Defaults to 100.0.
    pub fn set_grammar_penalty(&mut self, grammar_penalty: f32) {
        self.fp.grammar_penalty = grammar_penalty;
    }

    /// Set the initial prompt for the model.
    ///
    /// This is the text that will be used as the starting point for the model's decoding.
    /// Calling this more than once will overwrite the previous initial prompt.
    ///
    /// # Arguments
    /// * `initial_prompt` - A string slice representing the initial prompt text.
    ///
    /// # Panics
    /// This method will panic if `initial_prompt` contains a null byte, as it cannot be converted into a `CString`.
    ///
    /// # Examples
    /// ```
    /// # use whisper_rs::{FullParams, SamplingStrategy};
    /// let mut params = FullParams::new(SamplingStrategy::default());
    /// params.set_initial_prompt("Hello, world!");
    /// // ... further usage of params ...
    /// ```
    pub fn set_initial_prompt(&mut self, initial_prompt: &str) {
        self.fp.initial_prompt = CString::new(initial_prompt)
            .expect("Initial prompt contains null byte")
            .into_raw() as *const c_char;
    }
}

// following implementations are safe
// see https://github.com/ggerganov/whisper.cpp/issues/32#issuecomment-1272790388
// concurrent usage is prevented by &mut self on methods that modify the struct
unsafe impl<'a, 'b> Send for FullParams<'a, 'b> {}
unsafe impl<'a, 'b> Sync for FullParams<'a, 'b> {}

#[cfg(test)]
mod test_whisper_params_initial_prompt {
    use super::*;

    impl<'a, 'b> FullParams<'a, 'b> {
        pub fn get_initial_prompt(&self) -> &str {
            // SAFETY: Ensure this is safe and respects the lifetime of the string in self.fp
            unsafe {
                std::ffi::CStr::from_ptr(self.fp.initial_prompt)
                    .to_str()
                    .unwrap()
            }
        }
    }

    #[test]
    fn test_initial_prompt_normal_usage() {
        let mut params = FullParams::new(SamplingStrategy::default());
        let prompt = "Hello, world!";
        params.set_initial_prompt(prompt);
        assert_eq!(params.get_initial_prompt(), prompt);
    }

    #[test]
    #[should_panic(expected = "Initial prompt contains null byte")]
    fn test_initial_prompt_null_byte() {
        let mut params = FullParams::new(SamplingStrategy::default());
        let prompt = "Hello\0, world!";
        params.set_initial_prompt(prompt);
        // Should panic
    }

    #[test]
    fn test_initial_prompt_empty_string() {
        let mut params = FullParams::new(SamplingStrategy::default());
        let prompt = "";
        params.set_initial_prompt(prompt);

        assert_eq!(
            params.get_initial_prompt(),
            prompt,
            "The initial prompt should be an empty string."
        );
    }

    #[test]
    fn test_initial_prompt_repeated_calls() {
        let mut params = FullParams::new(SamplingStrategy::default());
        params.set_initial_prompt("First prompt");
        assert_eq!(
            params.get_initial_prompt(),
            "First prompt",
            "The initial prompt should be 'First prompt'."
        );

        params.set_initial_prompt("Second prompt");
        assert_eq!(
            params.get_initial_prompt(),
            "Second prompt",
            "The initial prompt should be 'Second prompt' after second set."
        );
    }

    #[test]
    fn test_initial_prompt_long_string() {
        let mut params = FullParams::new(SamplingStrategy::default());
        let long_prompt = "a".repeat(10000); // a long string of 10,000 'a' characters
        params.set_initial_prompt(&long_prompt);

        assert_eq!(
            params.get_initial_prompt(),
            long_prompt.as_str(),
            "The initial prompt should match the long string provided."
        );
    }
}
