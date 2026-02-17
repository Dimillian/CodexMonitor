# UI/UX Design System Contract

## Core Rule

Use shared design-system primitives/tokens for shell chrome and avoid duplicated shell styling.

## Scope

Applies to shared UI shell patterns including modal/toast/panel/popover behavior.

## Change Contract

If changing shared visual behavior:

1. Update relevant component/test coverage.
2. Update this contract when design rules or shell conventions change.
3. Keep accessibility and state patterns explicit (loading/error/empty/disabled).

## Validation

1. `npm run test`
2. `npm run typecheck`
3. Keep CI E2E smoke passing.

