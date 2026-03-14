use crate::WhisperError;

/// Convert an array of 16 bit mono audio samples to a vector of 32 bit floats.
///
/// # Arguments
/// * `samples` - The array of 16 bit mono audio samples.
/// * `output` - The vector of 32 bit floats to write the converted samples to.
///
/// # Panics
/// * if `samples.len != output.len()`
///
/// # Examples
/// ```
/// # use whisper_rs::convert_integer_to_float_audio;
/// let samples = [0i16; 1024];
/// let mut output = vec![0.0f32; samples.len()];
/// convert_integer_to_float_audio(&samples, &mut output).expect("input and output lengths should be equal");
/// ```
pub fn convert_integer_to_float_audio(
    samples: &[i16],
    output: &mut [f32],
) -> Result<(), WhisperError> {
    if samples.len() != output.len() {
        return Err(WhisperError::InputOutputLengthMismatch {
            input_len: samples.len(),
            output_len: output.len(),
        });
    }

    for (input, output) in samples.iter().zip(output.iter_mut()) {
        *output = *input as f32 / 32768.0;
    }

    Ok(())
}

/// Convert 32-bit floating point stereo PCM audio to 32-bit floating point mono PCM audio.
///
/// # Arguments
/// * `samples` - The array of 32-bit floating point stereo PCM audio samples.
///
/// # Errors
/// * if `samples.len()` is odd
///
/// # Returns
/// A vector of 32-bit floating point mono PCM audio samples.
///
/// # Examples
/// ```
/// # use whisper_rs::convert_stereo_to_mono_audio;
/// let samples = [0.0f32; 1024];
/// let mono = convert_stereo_to_mono_audio(&samples).expect("should be no half samples missing");
/// ```
pub fn convert_stereo_to_mono_audio(samples: &[f32]) -> Result<Vec<f32>, WhisperError> {
    if samples.len() & 1 != 0 {
        return Err(WhisperError::HalfSampleMissing(samples.len()));
    }

    Ok(samples
        .chunks_exact(2)
        .map(|x| (x[0] + x[1]) / 2.0)
        .collect())
}

#[cfg(test)]
mod test {
    use super::*;
    use rand::distributions::{Distribution, Standard};
    use rand::Rng;
    use std::hint::black_box;

    extern crate test;

    fn random_sample_data<T>() -> Vec<T>
    where
        Standard: Distribution<T>,
    {
        const SAMPLE_SIZE: usize = 1_048_576;

        let mut rng = rand::thread_rng();
        let mut samples = Vec::with_capacity(SAMPLE_SIZE);
        for _ in 0..SAMPLE_SIZE {
            samples.push(rng.gen::<T>());
        }
        samples
    }

    #[test]
    pub fn assert_stereo_to_mono_err() {
        let samples = random_sample_data::<f32>();
        let mono = convert_stereo_to_mono_audio(&samples);
        assert!(mono.is_err());
    }

    #[bench]
    pub fn bench_stereo_to_mono(b: &mut test::Bencher) {
        let samples = random_sample_data::<f32>();
        b.iter(|| black_box(convert_stereo_to_mono_audio(black_box(&samples))));
    }

    #[bench]
    pub fn bench_integer_to_float(b: &mut test::Bencher) {
        let samples = random_sample_data::<i16>();
        let mut output = vec![0.0f32; samples.len()];
        b.iter(|| {
            black_box(convert_integer_to_float_audio(
                black_box(&samples),
                black_box(&mut output),
            ))
        });
    }
}
