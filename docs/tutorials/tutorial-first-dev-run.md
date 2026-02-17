# Tutorial: First Local Dev Run

## Goal

Start CodexMonitor locally and pass core checks.

## Steps

1. Install dependencies:

```bash
npm install
```

2. Verify environment:

```bash
npm run doctor:strict
```

3. Start dev app:

```bash
npm run tauri:dev
```

4. Run quality checks:

```bash
npm run typecheck
npm run test
```

