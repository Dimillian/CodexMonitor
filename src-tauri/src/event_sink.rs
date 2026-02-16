use tauri::{AppHandle, Emitter};

use crate::backend::events::{AppServerEvent, EventSink, TerminalExit, TerminalOutput};

#[derive(Clone)]
pub(crate) struct TauriEventSink {
    app: AppHandle,
}

impl TauriEventSink {
    pub(crate) fn new(app: AppHandle) -> Self {
        Self { app }
    }
}

impl EventSink for TauriEventSink {
    fn emit_app_server_event(&self, event: AppServerEvent) {
        if let Err(err) = self.app.emit("app-server-event", event) {
            eprintln!("failed to emit app-server-event: {err}");
        }
    }

    fn emit_terminal_output(&self, event: TerminalOutput) {
        if let Err(err) = self.app.emit("terminal-output", event) {
            eprintln!("failed to emit terminal-output: {err}");
        }
    }

    fn emit_terminal_exit(&self, event: TerminalExit) {
        if let Err(err) = self.app.emit("terminal-exit", event) {
            eprintln!("failed to emit terminal-exit: {err}");
        }
    }
}
