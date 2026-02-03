# Windows Support Execution Plan

This plan is **live** and should be updated as work lands.
Source of truth for requirements: `SPEC.md`.

## Workstream

### 1) Spec + plan (docs)

- [ ] Add `SPEC.md` (Windows scope, updater + dictation required).
- [ ] Rewrite `PLAN.md` to reflect the approved execution plan.

### 2) Git safety + PR

- [ ] Push `feature/windows-support` to `origin` and set upstream to avoid accidental `main` pushes.
- [ ] Open a draft PR early so CI runs on every push.

### 3) Windows UX + path correctness

- [ ] Make “Reveal in Finder” platform-aware (Explorer on Windows).
- [ ] Fix path joining in the frontend so Windows absolute/relative paths behave.
- [ ] Make backend `open_workspace_in` work cross-platform (macOS/Windows/Linux).

### 4) Dictation on Windows (required)

- [ ] Enable Whisper dictation on Windows (`whisper-rs` + `cpal`) by removing the Windows stub.
- [ ] Update Windows build checks (`doctor:win`) to require LLVM/Clang + CMake.

### 5) CI (required)

- [ ] Add a Windows CI job that runs a Tauri debug build with `src-tauri/tauri.windows.conf.json`.

### 6) Release + updater (required)

- [ ] Enable Windows updater artifacts in `src-tauri/tauri.windows.conf.json`.
- [ ] Add a Windows release build job to `.github/workflows/release.yml`.
- [ ] Extend `latest.json` generation to include Windows URL + signature.

## Validation (run after each step)

- `npm run lint`
- `npm run test`
- `npm run typecheck`
- Rust checks are executed in CI for macOS + Windows jobs added by this plan.
| `src-tauri/src/dictation/windows.rs` | New Windows Speech API module |
| `src-tauri/Cargo.toml` | Add windows-rs dependency |

---

## Testing Checklist

- [ ] App builds on Windows CI
- [ ] MSI installer works
- [ ] NSIS installer works
- [ ] App launches without errors
- [ ] Git operations work
- [ ] Terminal emulation works
- [ ] Auto-updater detects Windows releases
- [ ] Code signing eliminates SmartScreen (Tier 2)
- [ ] Dictation works via Windows Speech API (Tier 3)

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Windows-specific bugs undiscovered | Add comprehensive CI testing |
| SmartScreen blocks unsigned app | Tier 2 code signing |
| Users expect dictation | Clear documentation |
| CI runner costs | Windows runners are ~2x macOS cost on GitHub Actions |

---

## Timeline Estimate

| Milestone | Effort | Dependencies |
|-----------|--------|--------------|
| Tier 1: Builds shipping | 2-3 days | None |
| Tier 2: Signed releases | +2-3 days | Code signing certificate |
| Tier 3: Full parity | +5-7 days | Decision on dictation approach |

**Total for full Windows support: ~2 weeks**

**Recommended MVP: Tier 1 only (~2-3 days)**
