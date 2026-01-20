use tauri::{AppHandle, Emitter};

use crate::backend::events::{AppServerEvent, EventSink, TerminalOutput};
use crate::integrations;

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
        let _ = self.app.emit("app-server-event", event.clone());
        integrations::try_emit_app_server_event(&self.app, event);
    }

    fn emit_terminal_output(&self, event: TerminalOutput) {
        let _ = self.app.emit("terminal-output", event);
    }
}
