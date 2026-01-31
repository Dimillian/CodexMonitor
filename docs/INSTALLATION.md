# Installation Guide

This guide covers how to install GeminiMonitor from pre-built releases or build it from source.

## Installing from Releases

Download the latest release from the [GitHub Releases](https://github.com/Dimillian/GeminiMonitor/releases) page:

- **macOS**: Download the `.dmg` file, open it, and drag GeminiMonitor to your Applications folder
- **Linux**: Download the `.AppImage` file, make it executable (`chmod +x`), and run it

## Building from Source

### Prerequisites

Before building, ensure you have the following installed:

| Dependency | Purpose | Installation |
|------------|---------|--------------|
| Node.js + npm | Frontend build | [nodejs.org](https://nodejs.org/) |
| Rust toolchain | Backend compilation | [rustup.rs](https://rustup.rs/) |
| CMake | Native dependencies | See below |
| Git CLI | Worktree operations | Usually pre-installed |
| Codex | Agent runtime | Must be in `PATH` |
| GitHub CLI (`gh`) | Issues panel (optional) | [cli.github.com](https://cli.github.com/) |

#### Installing CMake

- **macOS**: `brew install cmake`
- **Ubuntu/Debian**: `sudo apt-get install cmake`
- **Fedora**: `sudo dnf install cmake`
- **Arch**: `sudo pacman -S cmake`
- **Windows**: `choco install cmake`

### Verify Dependencies

Run the doctor script to check for missing dependencies:

```bash
# macOS/Linux
npm run doctor

# Windows
npm run doctor:win

# Strict mode (fails if dependencies missing)
npm run doctor:strict
```

### Development Build

```bash
# Install dependencies
npm install

# Run in development mode
npm run tauri:dev        # macOS/Linux
npm run tauri:dev:win    # Windows
```

### Production Build

#### macOS (DMG)

```bash
npm run tauri:build
```

Output locations:
- `src-tauri/target/release/bundle/macos/GeminiMonitor.app`
- `src-tauri/target/release/bundle/dmg/GeminiMonitor_<version>_<arch>.dmg`

#### Linux (AppImage)

```bash
npm run build:appimage
```

Output location:
- `src-tauri/target/release/bundle/appimage/`

#### Windows (NSIS/MSI)

```bash
npm run tauri:build:win
```

Output locations:
- `src-tauri/target/release/bundle/nsis/` (installer exe)
- `src-tauri/target/release/bundle/msi/` (msi)

### Nix Users

If you use Nix, enter the development environment with all dependencies:

```bash
nix develop
```

## GitHub Actions Builds

The repository includes GitHub Actions workflows for automated builds:

### Build Unsigned DMG (Testing)

1. Go to **Actions** > **Build DMG**
2. Click **Run workflow**
3. Leave "Sign and notarize" unchecked for an unsigned build
4. Download the artifact when complete

### Build Signed DMG (Release)

For signed and notarized releases, see [RELEASE.md](./RELEASE.md) for setting up the required secrets.

## Troubleshooting

### Build Errors

If you encounter native build errors:

```bash
npm run doctor
```

This will identify missing dependencies and provide installation instructions.

### Codex Not Found

If the `codex` binary is not in your `PATH`, you can configure a custom path per workspace in the application settings.

### macOS Gatekeeper Warning

Unsigned builds will show a Gatekeeper warning. To open:
1. Right-click the app
2. Select "Open"
3. Click "Open" in the dialog

Or remove the quarantine attribute:
```bash
xattr -cr /Applications/GeminiMonitor.app
```
