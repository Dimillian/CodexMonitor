# How-To: Update CI Workflow Safely

## Steps

1. Edit workflow under `.github/workflows/`.
2. Update `docs/ci-cd/pipeline-reference.md` or `docs/ci-cd/release-runbook.md`.
3. Run local check:

```bash
bash scripts/check-doc-drift.sh
```

4. Ensure CI `doc-drift` job passes on PR.

