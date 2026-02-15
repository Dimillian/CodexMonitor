export const DIFF_VIEWER_SCROLL_CSS = `
[data-column-number],
[data-buffer],
[data-separator-wrapper],
[data-annotation-content] {
  position: static;
}

[data-buffer] {
  background-image: none;
}

diffs-container,
[data-diffs],
[data-diffs-header],
[data-error-wrapper] {
  position: relative;
  contain: layout style;
  isolation: isolate;
}

[data-diffs-header],
[data-diffs],
[data-error-wrapper] {
  --diffs-light-bg: var(--ds-diff-lib-bg-light);
  --diffs-dark-bg: var(--ds-diff-lib-bg-dark);
}

[data-diffs-header][data-theme-type='light'],
[data-diffs][data-theme-type='light'] {
  --diffs-bg: var(--ds-diff-lib-bg-light);
}

[data-diffs-header][data-theme-type='dark'],
[data-diffs][data-theme-type='dark'] {
  --diffs-bg: var(--ds-diff-lib-bg-dark);
}

@media (prefers-color-scheme: dark) {
  [data-diffs-header]:not([data-theme-type]),
  [data-diffs]:not([data-theme-type]),
  [data-diffs-header][data-theme-type='system'],
  [data-diffs][data-theme-type='system'] {
    --diffs-bg: var(--ds-diff-lib-bg-system-dark);
  }
}

@media (prefers-color-scheme: light) {
  [data-diffs-header]:not([data-theme-type]),
  [data-diffs]:not([data-theme-type]),
  [data-diffs-header][data-theme-type='system'],
  [data-diffs][data-theme-type='system'] {
    --diffs-bg: var(--ds-diff-lib-bg-system-light);
  }
}
`;

export const DIFF_VIEWER_HIGHLIGHTER_OPTIONS = {
  theme: { dark: "pierre-dark", light: "pierre-light" },
} as const;
