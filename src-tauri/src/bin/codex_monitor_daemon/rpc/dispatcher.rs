use super::*;

pub(super) async fn dispatch_rpc_request(
    state: &DaemonState,
    method: &str,
    params: &Value,
    client_version: &str,
) -> Result<Value, String> {
    if let Some(result) = daemon::try_handle(state, method, params).await {
        return result;
    }

    if let Some(result) = workspace::try_handle(state, method, params, client_version).await {
        return result;
    }

    if let Some(result) = codex::try_handle(state, method, params).await {
        return result;
    }

    if let Some(result) = git::try_handle(state, method, params).await {
        return result;
    }

    if let Some(result) = prompts::try_handle(state, method, params).await {
        return result;
    }

    Err(format!("unknown method: {method}"))
}
