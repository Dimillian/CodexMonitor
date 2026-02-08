# Release Guide

This guide explains how to set up code signing and notarization for macOS releases.

## Overview

To distribute signed and notarized macOS apps, you need:

1. An Apple Developer account ($99/year)
2. A Developer ID Application certificate
3. App Store Connect API credentials for notarization
4. GitHub repository secrets configured

## Prerequisites

### Apple Developer Account

1. Enroll in the [Apple Developer Program](https://developer.apple.com/programs/)
2. Note your **Team ID** (found in Membership details)

### Create Developer ID Certificate

1. Open **Keychain Access** on your Mac
2. Go to **Keychain Access** > **Certificate Assistant** > **Request a Certificate from a Certificate Authority**
3. Enter your email and select "Saved to disk"
4. Go to [Apple Developer Certificates](https://developer.apple.com/account/resources/certificates/list)
5. Click **+** and select **Developer ID Application**
6. Upload your certificate signing request
7. Download and double-click to install the certificate

### Export Certificate as P12

1. Open **Keychain Access**
2. Find your "Developer ID Application" certificate
3. Right-click > **Export**
4. Choose `.p12` format and set a password
5. Base64 encode the file:
   ```bash
   base64 -i certificate.p12 | pbcopy
   ```

### Create App Store Connect API Key

1. Go to [App Store Connect](https://appstoreconnect.apple.com/) > **Users and Access** > **Integrations** > **App Store Connect API**
2. Click **+** to generate a new key
3. Select **Developer** access
4. Download the `.p8` file (only available once!)
5. Note the **Key ID** and **Issuer ID**
6. Base64 encode the key:
   ```bash
   base64 -i AuthKey_XXXXXXXXXX.p8 | pbcopy
   ```

## GitHub Configuration

### Repository Secrets

Go to your repository **Settings** > **Secrets and variables** > **Actions** > **Secrets** and add:

| Secret Name | Description | How to Get |
|-------------|-------------|------------|
| `APPLE_CERTIFICATE_P12` | Base64-encoded .p12 certificate | Export from Keychain Access |
| `APPLE_CERTIFICATE_PASSWORD` | Password for the .p12 file | Set during export |
| `APPLE_API_KEY_ID` | App Store Connect API Key ID | From App Store Connect |
| `APPLE_API_ISSUER_ID` | App Store Connect Issuer ID | From App Store Connect |
| `APPLE_API_PRIVATE_KEY_B64` | Base64-encoded .p8 API key | From App Store Connect |
| `TAURI_SIGNING_PRIVATE_KEY_B64` | Base64-encoded Tauri update signing key | Generate with `npm run tauri signer generate` |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Password for Tauri signing key | Set during generation |
| `HOMEBREW_TAP_TOKEN` | Fine-grained PAT used to update Homebrew tap cask | GitHub PAT with `Contents: Read and write` on tap repo |

### Repository Variables

Go to **Settings** > **Secrets and variables** > **Actions** > **Variables** and add:

| Variable Name | Description | Example |
|---------------|-------------|---------|
| `CODESIGN_IDENTITY` | Full name of your signing certificate | `Developer ID Application: Your Name (TEAMID)` |
| `NOTARY_PROFILE_NAME` | Name for stored notarization credentials | `agentmonitor-notary` |
| `APPLE_TEAM_ID` | Your Apple Developer Team ID | `ABCD1234EF` |
| `HOMEBREW_TAP_REPOSITORY` (optional) | Homebrew tap repository to update | `N3RDMJ/homebrew-tap` |

### Environment

Create an environment named `release` in **Settings** > **Environments** for additional protection (optional but recommended).

## Generate Tauri Signing Key

For Tauri's auto-updater, generate a signing key pair:

```bash
npm run tauri signer generate -- -w ~/.tauri/agentmonitor.key
```

This creates:
- `~/.tauri/agentmonitor.key` - Private key (keep secret!)
- Public key displayed in terminal

Base64 encode the private key:
```bash
base64 -i ~/.tauri/agentmonitor.key | pbcopy
```

Update the public key in `src-tauri/tauri.conf.json` under `plugins.updater.pubkey`.

## Running a Release

### Manual Release (workflow_dispatch)

1. Go to **Actions** > **Release**
2. Click **Run workflow**
3. Select the branch (usually `main`)
4. Click **Run workflow**

The workflow will:
1. Build the macOS app bundle
2. Sign with your Developer ID certificate
3. Notarize with Apple
4. Create a DMG
5. Build Linux AppImages + RPMs
6. Build Windows NSIS installer (`.exe`), MSI (`.msi`), and portable zip (`.zip`)
7. Generate `SHA256SUMS.txt` for release artifacts
8. Create a GitHub release with all artifacts
9. Bump the version and open a PR

See [RELEASE_CHECKLIST.md](./RELEASE_CHECKLIST.md) for the operational checklist.

## Homebrew Tap Sync

The `Homebrew Tap Sync` workflow updates `Casks/agent-monitor.rb` in your tap after a release is published.

- Trigger: automatically on `release: published`
- Manual trigger: **Actions** > **Homebrew Tap Sync** > **Run workflow**
- Default tap repo: `N3RDMJ/homebrew-tap` (override with `HOMEBREW_TAP_REPOSITORY`)

If `HOMEBREW_TAP_TOKEN` is not set, the workflow skips without failing your release flow.

### Build DMG Only

For testing without a full release:

1. Go to **Actions** > **Build DMG**
2. Click **Run workflow**
3. Check "Sign and notarize" if you want a signed build
4. Download the artifact when complete

## Troubleshooting

### Certificate Issues

```
errSecInternalComponent
```
The keychain is locked. Ensure the workflow unlocks it before signing.

### Notarization Failures

```
Package Invalid
```
Check that:
- The app is properly signed with a Developer ID certificate
- All binaries and frameworks are signed
- Hardened Runtime is enabled
- Required entitlements are included

View notarization log:
```bash
xcrun notarytool log <submission-id> --keychain-profile <profile>
```

### DMG Not Mounting

If the DMG is corrupted:
- Verify the `hdiutil` command completed successfully
- Check disk space on the runner
- Try building locally to isolate the issue

## Local Signing (Development)

To sign locally for testing:

```bash
# Find your identity
security find-identity -v -p codesigning

# Build and sign
npm run tauri build

# Manual codesign (if needed)
codesign --deep --force --verify --verbose \
  --sign "Developer ID Application: Your Name (TEAMID)" \
  "src-tauri/target/release/bundle/macos/Agent Monitor.app"
```

## References

- [Apple Developer Documentation: Notarizing macOS Software](https://developer.apple.com/documentation/security/notarizing_macos_software_before_distribution)
- [Tauri Code Signing Guide](https://tauri.app/distribute/sign/macos/)
- [App Store Connect API](https://developer.apple.com/documentation/appstoreconnectapi)
