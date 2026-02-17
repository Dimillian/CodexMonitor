# Release Runbook

Primary workflow: `.github/workflows/release.yml`

## Trigger

- Manual dispatch (`workflow_dispatch`)

## High-Level Flow

1. Build/sign macOS artifacts
2. Build Linux bundles
3. Build Windows bundles
4. Aggregate artifacts and generate release metadata

## Guardrails

1. Keep signing/notarization steps synchronized with actual workflow.
2. Keep artifact names/paths synchronized with workflow outputs.
3. Update this runbook whenever release workflow changes.

