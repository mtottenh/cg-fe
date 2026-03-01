//! GC transport layer — thin wrapper around steam-vent's `GameCoordinator`.
//!
//! The `GameCoordinator` handles the entire GC protocol: setting "playing"
//! CS2, the generic handshake (CMsgClientHello → CMsgClientWelcome),
//! CMsgGCClient wrapping, EMsg routing, and message filtering.
//!
//! We hold the `GameCoordinator` alongside the `Connection` (which must
//! stay alive for the background message receiver).

use steam_vent::{Connection, GameCoordinator, NetworkError};
use steam_vent_proto_csgo::GCHandshake;

/// Holds a `GameCoordinator` for CS2 (app 730) and the backing `Connection`.
pub struct GcTransport {
    gc: GameCoordinator,
    _connection: Connection, // kept alive for background receiver
}

/// Errors from the GC transport layer.
#[derive(Debug, thiserror::Error)]
pub enum GcTransportError {
    #[error(transparent)]
    Network(Box<NetworkError>),
}

impl From<NetworkError> for GcTransportError {
    fn from(e: NetworkError) -> Self {
        Self::Network(Box::new(e))
    }
}

impl GcTransport {
    /// Perform the generic GC handshake (set playing, CMsgClientHello → CMsgClientWelcome).
    pub async fn connect(connection: Connection) -> Result<Self, GcTransportError> {
        let (gc, _welcome) = connection
            .game_coordinator(&GCHandshake::default())
            .await?;
        Ok(Self {
            gc,
            _connection: connection,
        })
    }

    /// Access the underlying `GameCoordinator` for typed send/receive.
    pub fn gc(&self) -> &GameCoordinator {
        &self.gc
    }
}
