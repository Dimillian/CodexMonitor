use serde::Serialize;
use serde_json::Value;

#[derive(Serialize, Clone)]
pub(crate) struct AppServerEvent {
    pub(crate) workspace_id: String,
    pub(crate) message: Value,
}

#[derive(Debug, Serialize, Clone)]
pub(crate) struct TerminalOutput {
    #[serde(rename = "workspaceId")]
    pub(crate) workspace_id: String,
    #[serde(rename = "terminalId")]
    pub(crate) terminal_id: String,
    pub(crate) data: String,
}

pub(crate) trait EventSink: Clone + Send + Sync + 'static {
    fn emit_app_server_event(&self, event: AppServerEvent);
    fn emit_terminal_output(&self, event: TerminalOutput);
}
