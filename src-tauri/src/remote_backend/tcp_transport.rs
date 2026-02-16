use tauri::AppHandle;
use tokio::net::TcpStream;

use super::transport::{
    spawn_transport_io, RemoteTransport, RemoteTransportConfig, TransportFuture,
};

pub(crate) struct TcpTransport;

impl RemoteTransport for TcpTransport {
    fn connect(&self, app: AppHandle, config: RemoteTransportConfig) -> TransportFuture {
        Box::pin(async move {
            let RemoteTransportConfig::Tcp { host, .. } = config;

            let stream = TcpStream::connect(host.clone())
                .await
                .map_err(|err| format!("Failed to connect to remote backend at {host}: {err}"))?;
            let (reader, writer) = stream.into_split();
            Ok(spawn_transport_io(app, reader, writer))
        })
    }
}
