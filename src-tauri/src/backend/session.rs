use std::sync::Arc;

use crate::backend::acp_server::AcpSession;
use crate::backend::app_server::WorkspaceSession as CodexSession;

pub(crate) enum WorkspaceSessionKind {
    Codex(Arc<CodexSession>),
    Acp(Arc<AcpSession>),
}

impl WorkspaceSessionKind {
    pub(crate) fn as_codex(&self) -> Option<Arc<CodexSession>> {
        match self {
            WorkspaceSessionKind::Codex(session) => Some(Arc::clone(session)),
            WorkspaceSessionKind::Acp(_) => None,
        }
    }

    pub(crate) fn as_acp(&self) -> Option<Arc<AcpSession>> {
        match self {
            WorkspaceSessionKind::Codex(_) => None,
            WorkspaceSessionKind::Acp(session) => Some(Arc::clone(session)),
        }
    }

    pub(crate) async fn kill(&self) {
        match self {
            WorkspaceSessionKind::Codex(session) => {
                let mut child = session.child.lock().await;
                let _ = child.kill().await;
            }
            WorkspaceSessionKind::Acp(session) => {
                let mut child = session.child.lock().await;
                let _ = child.kill().await;
            }
        }
    }
}
