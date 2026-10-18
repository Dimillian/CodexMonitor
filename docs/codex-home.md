# Codex Home

Settings → Codex → Codex Home selects the directory used for global configuration,
instructions, prompts, agents, local session usage, and the shared Codex app-server.
The setting is independent of the Codex executable and is saved as `codexHome` in
CodexMonitor's application settings.

Enter an absolute directory path, or select a directory with **Browse home**.
**Validate** displays its canonical path without saving. **Save** validates and
persists the selection. **Use default** clears the field; save to restore default
resolution. Changing environments stops existing workspace app-servers and reloads
the UI, which reconnects workspaces and discovers sessions and models in the new
environment. Active turns stop when the environment changes.

Resolution order:

1. Explicit application Codex Home.
2. The application's inherited `CODEX_HOME` environment variable.
3. `~/.codex`.

The default directory can be created on first use. Explicit application and
environment directories must exist and be accessible. An unavailable selected home,
including an unmounted external volume, produces an error and never selects another
home automatically. Settings remain accessible to correct an unavailable path.

Symlinked home directories are supported: their canonical directory is the boundary
used by file operations. For compatibility with Codex, an existing global
`AGENTS.md` leaf symlink may resolve outside that boundary; the editor reads and
writes its target. Global `config.toml` and workspace `AGENTS.md` remain contained
within their canonical roots, and dangling links are errors. Saving application
preferences does not rewrite unrelated Codex configuration; changing homes does not
copy feature settings or credentials between environments.

The selected home is passed only to child Codex processes. CodexMonitor does not
change the system launch environment. The executable must honor `CODEX_HOME` and
provide its own existing credential mechanism; selecting a home does not copy or
provision credentials. When an app-server reports its home during initialization,
CodexMonitor verifies it against the selection and refuses mismatches, including
launchers that override `CODEX_HOME`. Older app-servers can omit this field; their
executable must honor the supplied environment. Launchers must also avoid rewriting
configuration files to targets outside the selected home.

The Home control applies to the local backend and is disabled in remote mode.
Remote file editors display paths from the connected daemon, whose own persisted
settings determine its home.
