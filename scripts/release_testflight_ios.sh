#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

DEFAULT_ENV_FILE=".testflight.local.env"
ENV_FILE="${TESTFLIGHT_ENV_FILE:-$DEFAULT_ENV_FILE}"
if [[ -f "$ENV_FILE" ]]; then
  set -a
  # shellcheck source=/dev/null
  . "$ENV_FILE"
  set +a
fi

TARGET="${TARGET:-aarch64}"
BUNDLE_ID="${BUNDLE_ID:-com.dimillian.codexmonitor.ios}"
APP_ID="${APP_ID:-}"
IPA_PATH="${IPA_PATH:-}"
BUILD_NUMBER="${BUILD_NUMBER:-}"
LOCALE="${LOCALE:-en-US}"
BETA_GROUP_NAME="${BETA_GROUP_NAME:-Beta Testers}"
BETA_DESCRIPTION="${BETA_DESCRIPTION:-Codex Monitor iOS beta build for external testing.}"
FEEDBACK_EMAIL="${FEEDBACK_EMAIL:-}"
REVIEW_FIRST_NAME="${REVIEW_FIRST_NAME:-}"
REVIEW_LAST_NAME="${REVIEW_LAST_NAME:-}"
REVIEW_CONTACT_EMAIL="${REVIEW_CONTACT_EMAIL:-}"
REVIEW_CONTACT_PHONE="${REVIEW_CONTACT_PHONE:-}"
REVIEW_NOTES="${REVIEW_NOTES:-Codex Monitor iOS beta build for external testing.}"
SKIP_BUILD=0
SKIP_SUBMIT=0

usage() {
  cat <<'USAGE'
Usage: scripts/release_testflight_ios.sh [options]

Builds iOS release IPA, uploads to App Store Connect, applies export compliance,
adds build to a TestFlight group, and submits for external beta review.

Defaults are auto-loaded from .testflight.local.env (gitignored) when present.
Override the path with TESTFLIGHT_ENV_FILE=/path/to/file.

Options:
  --app-id <id>              App Store Connect app ID (auto-resolved by bundle id if omitted)
  --bundle-id <id>           Bundle identifier (default: com.dimillian.codexmonitor.ios)
  --ipa <path>               IPA path (default: src-tauri/gen/apple/build/arm64/Codex Monitor.ipa)
  --target <target>          Tauri iOS target (default: aarch64)
  --build-number <number>    Build number used during archive (default: current unix timestamp)
  --skip-build               Skip Tauri archive/export step and reuse existing IPA
  --skip-submit              Do not submit for external beta review
  --group-name <name>        TestFlight beta group name (default: Beta Testers)
  --locale <locale>          Beta localization locale (default: en-US)
  --beta-description <text>  Beta app description (used for localization)
  --feedback-email <email>   Beta feedback email (defaults to review contact email)

Review metadata (required for external submission if not already set in ASC):
  --review-first-name <text>
  --review-last-name <text>
  --review-email <email>
  --review-phone <phone>
  --review-notes <text>

Examples:
  ./scripts/release_testflight_ios.sh
  ./scripts/release_testflight_ios.sh --skip-build --ipa "src-tauri/gen/apple/build/arm64/Codex Monitor.ipa"
USAGE
}

while [[ $# -gt 0 ]]; do
  case "$1" in
    --app-id)
      APP_ID="${2:-}"
      shift 2
      ;;
    --bundle-id)
      BUNDLE_ID="${2:-}"
      shift 2
      ;;
    --ipa)
      IPA_PATH="${2:-}"
      shift 2
      ;;
    --target)
      TARGET="${2:-}"
      shift 2
      ;;
    --build-number)
      BUILD_NUMBER="${2:-}"
      shift 2
      ;;
    --skip-build)
      SKIP_BUILD=1
      shift
      ;;
    --skip-submit)
      SKIP_SUBMIT=1
      shift
      ;;
    --group-name)
      BETA_GROUP_NAME="${2:-}"
      shift 2
      ;;
    --locale)
      LOCALE="${2:-}"
      shift 2
      ;;
    --beta-description)
      BETA_DESCRIPTION="${2:-}"
      shift 2
      ;;
    --feedback-email)
      FEEDBACK_EMAIL="${2:-}"
      shift 2
      ;;
    --review-first-name)
      REVIEW_FIRST_NAME="${2:-}"
      shift 2
      ;;
    --review-last-name)
      REVIEW_LAST_NAME="${2:-}"
      shift 2
      ;;
    --review-email)
      REVIEW_CONTACT_EMAIL="${2:-}"
      shift 2
      ;;
    --review-phone)
      REVIEW_CONTACT_PHONE="${2:-}"
      shift 2
      ;;
    --review-notes)
      REVIEW_NOTES="${2:-}"
      shift 2
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown option: $1" >&2
      usage >&2
      exit 1
      ;;
  esac
done

log() {
  echo "[testflight] $*"
}

fail() {
  echo "[testflight] ERROR: $*" >&2
  exit 1
}

require_cmd() {
  if ! command -v "$1" >/dev/null 2>&1; then
    fail "Missing required command: $1"
  fi
}

resolve_npm() {
  if command -v npm >/dev/null 2>&1; then
    command -v npm
    return
  fi

  for candidate in /opt/homebrew/bin/npm /usr/local/bin/npm; do
    if [[ -x "$candidate" ]]; then
      echo "$candidate"
      return
    fi
  done

  if [[ -n "${NVM_DIR:-}" && -s "${NVM_DIR}/nvm.sh" ]]; then
    # shellcheck source=/dev/null
    . "${NVM_DIR}/nvm.sh"
    if command -v npm >/dev/null 2>&1; then
      command -v npm
      return
    fi
  fi

  return 1
}

sync_ios_icons() {
  local iconset_dir="src-tauri/gen/apple/Assets.xcassets/AppIcon.appiconset"
  if [[ ! -d "$iconset_dir" ]]; then
    return
  fi
  if compgen -G "src-tauri/icons/ios/*.png" >/dev/null; then
    cp -f src-tauri/icons/ios/*.png "$iconset_dir"/
  fi
}

json_get() {
  local json="$1"
  local expr="$2"
  jq -r "$expr" <<<"$json"
}

require_cmd asc
require_cmd jq

log "Checking App Store Connect authentication"
asc auth status --validate >/dev/null

if [[ -z "$APP_ID" ]]; then
  log "Resolving app id for bundle id: $BUNDLE_ID"
  apps_json="$(asc apps list --bundle-id "$BUNDLE_ID" --output json)"
  APP_ID="$(json_get "$apps_json" '.data[0].id // empty')"
  [[ -n "$APP_ID" ]] || fail "No ASC app found for bundle id '$BUNDLE_ID'"
fi

log "Using app id: $APP_ID"

if [[ "$SKIP_BUILD" -eq 0 ]]; then
  NPM_BIN="$(resolve_npm || true)"
  [[ -n "$NPM_BIN" ]] || fail "Unable to find npm in PATH or common install locations"

  if [[ -z "$BUILD_NUMBER" ]]; then
    BUILD_NUMBER="$(date +%s)"
  fi

  log "Building iOS archive and exporting IPA (build number: $BUILD_NUMBER)"
  sync_ios_icons
  "$NPM_BIN" run tauri -- ios build --target "$TARGET" --export-method app-store-connect --build-number "$BUILD_NUMBER" --ci
fi

if [[ -z "$IPA_PATH" ]]; then
  IPA_PATH="src-tauri/gen/apple/build/arm64/Codex Monitor.ipa"
fi

[[ -f "$IPA_PATH" ]] || fail "IPA not found at: $IPA_PATH"

log "Uploading IPA to ASC"
asc builds upload --app "$APP_ID" --ipa "$IPA_PATH" --wait --output json >/dev/null

latest_json="$(asc builds latest --app "$APP_ID" --platform IOS --output json)"
BUILD_ID="$(json_get "$latest_json" '.data.id // empty')"
BUILD_VERSION="$(json_get "$latest_json" '.data.attributes.version // empty')"
BUILD_UPLOADED_AT="$(json_get "$latest_json" '.data.attributes.uploadedDate // empty')"
[[ -n "$BUILD_ID" ]] || fail "Unable to resolve uploaded build id"

log "Latest uploaded build: id=$BUILD_ID version=$BUILD_VERSION uploaded=$BUILD_UPLOADED_AT"

beta_detail_json="$(asc builds build-beta-detail get --build "$BUILD_ID" --output json)"
internal_state="$(json_get "$beta_detail_json" '.data.attributes.internalBuildState // empty')"
external_state="$(json_get "$beta_detail_json" '.data.attributes.externalBuildState // empty')"

if [[ "$internal_state" == "MISSING_EXPORT_COMPLIANCE" || "$external_state" == "MISSING_EXPORT_COMPLIANCE" ]]; then
  log "Export compliance missing; resolving encryption declaration"
  declarations_json="$(asc encryption declarations list --app "$APP_ID" --output json)"
  declaration_id="$(json_get "$declarations_json" '.data[0].id // empty')"

  if [[ -z "$declaration_id" ]]; then
    create_decl_json="$(asc encryption declarations create \
      --app "$APP_ID" \
      --app-description "Uses standard third-party cryptography for encrypted network transport (e.g. HTTPS/TLS)." \
      --contains-proprietary-cryptography=false \
      --contains-third-party-cryptography=true \
      --available-on-french-store=true \
      --output json)"
    declaration_id="$(json_get "$create_decl_json" '.data.id // empty')"
    [[ -n "$declaration_id" ]] || fail "Failed to create encryption declaration"
    log "Created encryption declaration: $declaration_id"
  else
    log "Reusing encryption declaration: $declaration_id"
  fi

  asc encryption declarations assign-builds --id "$declaration_id" --build "$BUILD_ID" --output json >/dev/null || true

  for _ in {1..12}; do
    beta_detail_json="$(asc builds build-beta-detail get --build "$BUILD_ID" --output json)"
    internal_state="$(json_get "$beta_detail_json" '.data.attributes.internalBuildState // empty')"
    external_state="$(json_get "$beta_detail_json" '.data.attributes.externalBuildState // empty')"
    if [[ "$internal_state" != "MISSING_EXPORT_COMPLIANCE" && "$external_state" != "MISSING_EXPORT_COMPLIANCE" ]]; then
      break
    fi
    sleep 5
  done
fi

log "Build beta state: internal=$internal_state external=$external_state"

groups_json="$(asc testflight beta-groups list --app "$APP_ID" --output json)"
BETA_GROUP_ID="$(jq -r --arg name "$BETA_GROUP_NAME" '.data[] | select(.attributes.name == $name) | .id' <<<"$groups_json" | head -n 1)"

if [[ -z "$BETA_GROUP_ID" ]]; then
  log "Creating beta group: $BETA_GROUP_NAME"
  group_create_json="$(asc testflight beta-groups create --app "$APP_ID" --name "$BETA_GROUP_NAME" --output json)"
  BETA_GROUP_ID="$(json_get "$group_create_json" '.data.id // empty')"
  [[ -n "$BETA_GROUP_ID" ]] || fail "Failed to create beta group"
fi

log "Using beta group: $BETA_GROUP_NAME ($BETA_GROUP_ID)"
asc builds add-groups --build "$BUILD_ID" --group "$BETA_GROUP_ID" --output json >/dev/null || true

if [[ -z "$FEEDBACK_EMAIL" ]]; then
  FEEDBACK_EMAIL="$REVIEW_CONTACT_EMAIL"
fi

localizations_json="$(asc beta-app-localizations list --app "$APP_ID" --output json)"
localization_id="$(jq -r --arg locale "$LOCALE" '.data[] | select(.attributes.locale == $locale) | .id' <<<"$localizations_json" | head -n 1)"

if [[ -z "$localization_id" ]]; then
  log "Creating beta localization for locale: $LOCALE"
  create_loc_cmd=(asc beta-app-localizations create --app "$APP_ID" --locale "$LOCALE" --description "$BETA_DESCRIPTION" --output json)
  if [[ -n "$FEEDBACK_EMAIL" ]]; then
    create_loc_cmd+=(--feedback-email "$FEEDBACK_EMAIL")
  fi
  create_loc_json="$("${create_loc_cmd[@]}")"
  localization_id="$(json_get "$create_loc_json" '.data.id // empty')"
  [[ -n "$localization_id" ]] || fail "Failed to create beta app localization"
else
  log "Updating beta localization for locale: $LOCALE"
  update_loc_cmd=(asc beta-app-localizations update --id "$localization_id" --description "$BETA_DESCRIPTION" --output json)
  if [[ -n "$FEEDBACK_EMAIL" ]]; then
    update_loc_cmd+=(--feedback-email "$FEEDBACK_EMAIL")
  fi
  "${update_loc_cmd[@]}" >/dev/null
fi

review_json="$(asc testflight review get --app "$APP_ID" --output json)"

current_first_name="$(json_get "$review_json" '.data[0].attributes.contactFirstName // empty')"
current_last_name="$(json_get "$review_json" '.data[0].attributes.contactLastName // empty')"
current_contact_email="$(json_get "$review_json" '.data[0].attributes.contactEmail // empty')"
current_contact_phone="$(json_get "$review_json" '.data[0].attributes.contactPhone // empty')"

[[ -n "$REVIEW_FIRST_NAME" ]] || REVIEW_FIRST_NAME="$current_first_name"
[[ -n "$REVIEW_LAST_NAME" ]] || REVIEW_LAST_NAME="$current_last_name"
[[ -n "$REVIEW_CONTACT_EMAIL" ]] || REVIEW_CONTACT_EMAIL="$current_contact_email"
[[ -n "$REVIEW_CONTACT_PHONE" ]] || REVIEW_CONTACT_PHONE="$current_contact_phone"

[[ -n "$REVIEW_FIRST_NAME" ]] || fail "Missing review first name. Pass --review-first-name or set REVIEW_FIRST_NAME in $ENV_FILE"
[[ -n "$REVIEW_LAST_NAME" ]] || fail "Missing review last name. Pass --review-last-name or set REVIEW_LAST_NAME in $ENV_FILE"
[[ -n "$REVIEW_CONTACT_EMAIL" ]] || fail "Missing review email. Pass --review-email or set REVIEW_CONTACT_EMAIL in $ENV_FILE"
[[ -n "$REVIEW_CONTACT_PHONE" ]] || fail "Missing review phone. Pass --review-phone or set REVIEW_CONTACT_PHONE in $ENV_FILE"

log "Updating beta review contact metadata"
asc testflight review update \
  --id "$APP_ID" \
  --contact-first-name "$REVIEW_FIRST_NAME" \
  --contact-last-name "$REVIEW_LAST_NAME" \
  --contact-email "$REVIEW_CONTACT_EMAIL" \
  --contact-phone "$REVIEW_CONTACT_PHONE" \
  --notes "$REVIEW_NOTES" \
  --output json >/dev/null

beta_detail_json="$(asc builds build-beta-detail get --build "$BUILD_ID" --output json)"
external_state="$(json_get "$beta_detail_json" '.data.attributes.externalBuildState // empty')"

if [[ "$SKIP_SUBMIT" -eq 1 ]]; then
  log "Skipping external review submit by request (--skip-submit)"
  echo
  echo "Build ID:      $BUILD_ID"
  echo "App ID:        $APP_ID"
  echo "Group ID:      $BETA_GROUP_ID"
  echo "External state:$external_state"
  exit 0
fi

if [[ "$external_state" == "READY_FOR_BETA_SUBMISSION" ]]; then
  log "Submitting build for external beta review"
  set +e
  submit_output="$(asc testflight review submit --build "$BUILD_ID" --confirm --output json 2>&1)"
  submit_status=$?
  set -e
  if [[ "$submit_status" -ne 0 ]]; then
    if grep -q "Another build is in review" <<<"$submit_output"; then
      log "Submission blocked because another build is already in beta review"
    else
      echo "$submit_output" >&2
      fail "Failed to submit build for external beta review"
    fi
  fi
  beta_detail_json="$(asc builds build-beta-detail get --build "$BUILD_ID" --output json)"
  external_state="$(json_get "$beta_detail_json" '.data.attributes.externalBuildState // empty')"
elif [[ "$external_state" == "WAITING_FOR_BETA_REVIEW" || "$external_state" == "IN_BETA_TESTING" ]]; then
  log "Build already submitted/available for external testing"
else
  fail "Build is not ready for external submit (state: $external_state)"
fi

echo
log "Completed TestFlight release flow"
echo "App ID:         $APP_ID"
echo "Build ID:       $BUILD_ID"
echo "Build version:  $BUILD_VERSION"
echo "Beta group:     $BETA_GROUP_NAME ($BETA_GROUP_ID)"
echo "External state: $external_state"
