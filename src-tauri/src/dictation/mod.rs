#[cfg_attr(
    any(target_os = "ios", target_os = "android", target_os = "windows"),
    path = "stub.rs"
)]
#[cfg_attr(
    not(any(target_os = "ios", target_os = "android", target_os = "windows")),
    path = "real.rs"
)]
mod imp;

pub(crate) use imp::*;
