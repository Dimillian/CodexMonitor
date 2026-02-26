# Version 0.8.0 (-sys bindings 0.6.1) (2023-06-18)
* Fix CUDA and OpenCL build broken due to missing API headers.
* Use PIC when building whisper.cpp (fixes building a cdylib on x86 Linux)

# Version 0.8.0 (2023-05-14)
* Update upstream whisper.cpp to v1.4.2 (OpenCL support)
* Add CUDA and OpenCL support to bindings
  * No MacOS testers were able to test CoreML support, so it may be broken. Please open an issue if it is.
  * Enable CUDA support by enabling the `cuda` feature.
  * Enable OpenCL support by enabling the `opencl` feature.
* Add `FullParams::set_detect_language`

# Version 0.7.0 (2023-05-10)
* Update upstream whisper.cpp to v1.4.0 (integer quantization support, see last point for CUDA support)
* Expose `WhisperState` as a public type, allowing for more control over the state.
  * `WhisperContext::create_state` now returns a `WhisperState` instead of `()`.
  * All methods that took a key argument in v0.6.0 have been moved to `WhisperState`.
* Generic key argument on `WhisperContext` has been removed.
* Note: CUDA and OpenCL acceleration is supported on the `cuda-and-opencl-support` branch of the git repo,
  and will probably be released in v0.8.0.

# Version 0.6.0 (2023-04-17)
* Update upstream whisper.cpp to v1.3.0
* Fix breaking changes in update, which cascade to users:
  * `WhisperContext`s now have a generic type parameter, which is a hashable key for a state map.
    This allows for a single context to be reused for multiple different states, saving memory.
    * You must create a new state upon creation, even if you are using the context only once, by calling `WhisperContext::create_key`.
    * Each method that now takes a state now takes a key, which internally is used to look up the state.
    * This also turns `WhisperContext` into an entirely immutable object, meaning it can be shared across threads and used concurrently, safely.
* Send feedback on these changes to the PR: https://github.com/tazz4843/whisper-rs/pull/33

# Version 0.2.0 (2022-10-28)
* Update upstream whisper.cpp to 2c281d190b7ec351b8128ba386d110f100993973.
* Fix breaking changes in update, which cascade to users:
  * `DecodeStrategy` has been renamed to `SamplingStrategy`
  * `WhisperContext::sample_best`'s signature has changed: `needs_timestamp` has been removed.
* New features
  * `WhisperContext::full_n_tokens`
  * `WhisperContext::full_get_token_text`
  * `WhisperContext::full_get_token_id`
  * `WhisperContext::full_get_token_prob`
