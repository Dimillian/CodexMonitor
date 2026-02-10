# Android Support Implementation Plan

- [ ] Confirm Android toolchain prerequisites and environment variables (`ANDROID_HOME`, `ANDROID_SDK_ROOT`, `JAVA_HOME`, `adb`, `emulator`).
- [ ] Add Android-specific Tauri config override (`src-tauri/tauri.android.conf.json`) with Android bundle identifier.
- [ ] Align backend mobile defaults so Android uses the same remote-first behavior as iOS.
- [ ] Add Android bootstrap script to initialize Tauri Android project files when missing.
- [ ] Add Android simulator/device run script for development (`tauri android dev`) with device listing support.
- [ ] Add Android release build script (`tauri android build`) with ABI and artifact options (APK/AAB, split per ABI).
- [ ] Update server/mobile UX copy that is iOS-only so Android users receive correct guidance.
- [ ] Document Android prerequisites and run/build workflows in `README.md`.
- [ ] Add or update frontend/backend tests covering Android/mobile detection and defaults.
- [ ] Run validation (`npm run lint`, `npm run test`, `npm run typecheck`, `cd src-tauri && cargo check`) and resolve integration issues.
