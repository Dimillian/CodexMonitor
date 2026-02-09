#[cfg_attr(any(target_os = "ios", target_os = "android"), path = "stub.rs")]
#[cfg_attr(not(any(target_os = "ios", target_os = "android")), path = "real.rs")]
mod imp;

pub(crate) use imp::*;
