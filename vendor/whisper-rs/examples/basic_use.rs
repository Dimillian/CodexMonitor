#![allow(clippy::uninlined_format_args)]

use whisper_rs::{FullParams, SamplingStrategy, WhisperContext, WhisperContextParameters};

// note that running this example will not do anything, as it is just a
// demonstration of how to use the library, and actual usage requires
// more dependencies than the base library.
pub fn usage() -> Result<(), &'static str> {
    // load a context and model
    let ctx = WhisperContext::new_with_params("path/to/model", WhisperContextParameters::default())
        .expect("failed to load model");
    // make a state
    let mut state = ctx.create_state().expect("failed to create state");

    // create a params object
    // note that currently the only implemented strategy is Greedy, BeamSearch is a WIP
    // n_past defaults to 0
    let mut params = FullParams::new(SamplingStrategy::Greedy { best_of: 1 });

    // edit things as needed
    // here we set the number of threads to use to 1
    params.set_n_threads(1);
    // we also enable translation
    params.set_translate(true);
    // and set the language to translate to to english
    params.set_language(Some("en"));
    // we also explicitly disable anything that prints to stdout
    params.set_print_special(false);
    params.set_print_progress(false);
    params.set_print_realtime(false);
    params.set_print_timestamps(false);

    // assume we have a buffer of audio data
    // here we'll make a fake one, integer samples, 16 bit, 16KHz, stereo
    let audio_data = vec![0_i16; 16000 * 2];

    // we must convert to 16KHz mono f32 samples for the model
    // some utilities exist for this
    // note that you don't need to use these, you can do it yourself or any other way you want
    // these are just provided for convenience
    // SIMD variants of these functions are also available, but only on nightly Rust: see the docs
    let mut inter_audio_data = Vec::with_capacity(audio_data.len());
    whisper_rs::convert_integer_to_float_audio(&audio_data, &mut inter_audio_data)
        .expect("failed to convert audio data");
    let audio_data = whisper_rs::convert_stereo_to_mono_audio(&inter_audio_data)
        .expect("failed to convert audio data");

    // now we can run the model
    // note the key we use here is the one we created above
    state
        .full(params, &audio_data[..])
        .expect("failed to run model");

    // fetch the results
    let num_segments = state
        .full_n_segments()
        .expect("failed to get number of segments");
    for i in 0..num_segments {
        let segment = state
            .full_get_segment_text(i)
            .expect("failed to get segment");
        let start_timestamp = state
            .full_get_segment_t0(i)
            .expect("failed to get segment start timestamp");
        let end_timestamp = state
            .full_get_segment_t1(i)
            .expect("failed to get segment end timestamp");
        println!("[{} - {}]: {}", start_timestamp, end_timestamp, segment);
    }

    Ok(())
}

fn main() {
    println!("running this example does nothing! see the source code for usage");
}
