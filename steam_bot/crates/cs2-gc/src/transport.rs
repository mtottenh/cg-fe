//! Low-level GC message transport.
//!
//! Steam's Game Coordinator protocol works differently from Steam's unified
//! service methods. Where service methods use typed request/response pairs
//! routed by Steam automatically:
//!
//! ```text
//! connection.service_method(CFriendMessages_SendMessage_Request { ... })
//!     → CFriendMessages_SendMessage_Response
//! ```
//!
//! GC messages are raw protobuf payloads wrapped in `CMsgGCClient` and sent
//! through `EMsg::ClientToGC` / `EMsg::ClientFromGC`. The GC protocol has
//! its own message type IDs (the `ECsgoGCMsg` enum) that are independent
//! of Steam's EMsg system.
//!
//! ```text
//! ┌─────────────────────────────────────────┐
//! │ EMsg::ClientToGC                        │
//! │ ┌─────────────────────────────────────┐ │
//! │ │ CMsgGCClient                        │ │
//! │ │   appid: 730                        │ │
//! │ │   msgtype: 9148 | PROTO_MASK        │ │
//! │ │   payload: <serialized protobuf>    │ │
//! │ └─────────────────────────────────────┘ │
//! └─────────────────────────────────────────┘
//! ```
//!
//! # Adaptation Required
//!
//! This module contains the core transport logic that bridges steam-vent's
//! `Connection` to the GC protocol. The exact method names on `Connection`
//! for sending/receiving raw EMsg messages are **not fully documented** in
//! steam-vent 0.4.x. You will likely need to adapt the `send` and `recv`
//! implementations after checking `docs.rs/steam-vent` or the source on
//! Codeberg.
//!
//! The `csgo` feature on `steam-vent` may expose higher-level GC helpers —
//! check for traits like `GameCoordinatorTrait` or methods like
//! `send_gc_message` on `Connection` when the feature is enabled.

use steam_vent::Connection;
use tokio::sync::broadcast;
use tracing::{debug, warn};

/// CS2 App ID.
pub const CS2_APP_ID: u32 = 730;

/// OR with a GC msg type to indicate protobuf encoding.
pub const PROTO_MASK: u32 = 0x8000_0000;

/// A raw GC message received from the Game Coordinator.
#[derive(Debug, Clone)]
pub struct RawGcMessage {
    /// The GC message type (without PROTO_MASK).
    pub msg_type: u32,
    /// The serialized protobuf payload.
    pub payload: Vec<u8>,
}

/// Handles sending and receiving raw GC messages over a steam-vent Connection.
///
/// This is the part you'll most likely need to adapt to match your version
/// of steam-vent. The rest of the library (Cs2GcClient, types, etc.) depends
/// only on this interface.
pub struct GcTransport {
    connection: Connection,
}

impl GcTransport {
    pub fn new(connection: Connection) -> Self {
        Self { connection }
    }

    pub fn connection(&self) -> &Connection {
        &self.connection
    }

    /// Tell Steam we're "playing" CS2 so the GC will talk to us.
    ///
    /// # Adaptation
    ///
    /// This likely needs to send `CMsgClientGamesPlayed` with app_id 730.
    /// steam-vent may expose this as:
    /// - `connection.set_playing(app_id)` (hypothetical high-level)
    /// - Or you construct and send the message manually
    pub async fn set_playing_cs2(&self) -> Result<(), GcTransportError> {
        // ─── OPTION A: If steam-vent has a set_playing method ───
        // self.connection.set_playing(CS2_APP_ID).await?;

        // ─── OPTION B: Manual CMsgClientGamesPlayed ───
        // use steam_vent_proto::steammessages_clientserver::CMsgClientGamesPlayed;
        // use steam_vent_proto::steammessages_clientserver::CMsgClientGamesPlayed_GamePlayed;
        //
        // let game = CMsgClientGamesPlayed_GamePlayed {
        //     game_id: Some(CS2_APP_ID as u64),
        //     ..Default::default()
        // };
        // let msg = CMsgClientGamesPlayed {
        //     games_played: vec![game],
        //     ..Default::default()
        // };
        // self.connection.send(EMsg::ClientGamesPlayed, msg).await?;

        todo!(
            "Adapt to your steam-vent version. \
             See GcTransport::set_playing_cs2 doc comments for options."
        )
    }

    /// Send a GC message with the given type ID and serialized payload.
    ///
    /// # Adaptation
    ///
    /// This wraps the payload in CMsgGCClient and sends it as
    /// EMsg::ClientToGC. Check steam-vent for:
    /// - A `send_gc_message(app_id, msg_type, payload)` method
    /// - A `send_with_kind(EMsg, body)` or similar raw send
    /// - The `csgo` feature might add GC-specific methods
    pub async fn send(&self, msg_type: u32, payload: &[u8]) -> Result<(), GcTransportError> {
        debug!(msg_type, payload_len = payload.len(), "Sending GC message");

        // ─── OPTION A: If steam-vent exposes a GC send method ───
        // self.connection
        //     .send_gc_message(CS2_APP_ID, msg_type, payload)
        //     .await
        //     .map_err(GcTransportError::Network)?;

        // ─── OPTION B: Manual CMsgGCClient wrapping ───
        // use steam_vent_proto::steammessages_clientserver_2::CMsgGCClient;
        //
        // let gc_msg = CMsgGCClient {
        //     appid: Some(CS2_APP_ID),
        //     msgtype: Some(msg_type | PROTO_MASK),
        //     payload: Some(payload.to_vec()),
        //     ..Default::default()
        // };
        // // EMsg::ClientToGC = 200
        // self.connection.send_raw(200, gc_msg).await?;

        todo!(
            "Adapt to your steam-vent version. \
             See GcTransport::send doc comments for options."
        )
    }

    /// Wait for a GC message of a specific type, with timeout.
    ///
    /// # Adaptation
    ///
    /// This needs to listen for EMsg::ClientFromGC messages, unwrap the
    /// CMsgGCClient, filter by app_id == 730 and the target msg_type,
    /// and return the inner payload.
    ///
    /// steam-vent may expose:
    /// - `connection.on_gc_message(app_id)` → Stream
    /// - `connection.on_notification::<CMsgGCClient>()` (unlikely for GC)
    /// - Raw message filtering via `on_raw(EMsg::ClientFromGC)`
    pub async fn recv(
        &self,
        expected_msg_type: u32,
        timeout: std::time::Duration,
    ) -> Result<Vec<u8>, GcTransportError> {
        debug!(expected_msg_type, ?timeout, "Waiting for GC message");

        // ─── OPTION A: If steam-vent exposes a GC receive method ───
        // let payload = tokio::time::timeout(timeout, async {
        //     self.connection
        //         .receive_gc_message(CS2_APP_ID, expected_msg_type)
        //         .await
        //         .map_err(GcTransportError::Network)
        // })
        // .await
        // .map_err(|_| GcTransportError::Timeout(timeout))??;
        // Ok(payload)

        // ─── OPTION B: Filter from a raw stream ───
        // use tokio_stream::StreamExt;
        // let mut stream = self.connection.on_raw::<CMsgGCClient>();
        // let result = tokio::time::timeout(timeout, async {
        //     while let Some(Ok(gc_msg)) = stream.next().await {
        //         let app = gc_msg.appid.unwrap_or(0);
        //         let mtype = gc_msg.msgtype.unwrap_or(0) & !PROTO_MASK;
        //         if app == CS2_APP_ID && mtype == expected_msg_type {
        //             return Ok(gc_msg.payload.unwrap_or_default());
        //         }
        //     }
        //     Err(GcTransportError::Disconnected)
        // })
        // .await
        // .map_err(|_| GcTransportError::Timeout(timeout))??;
        // Ok(result)

        todo!(
            "Adapt to your steam-vent version. \
             See GcTransport::recv doc comments for options."
        )
    }
}

#[derive(Debug, thiserror::Error)]
pub enum GcTransportError {
    #[error("Steam network error: {0}")]
    Network(#[from] steam_vent::NetworkError),

    #[error("GC did not respond within {0:?}")]
    Timeout(std::time::Duration),

    #[error("Disconnected from GC")]
    Disconnected,

    #[error("Protobuf error: {0}")]
    Proto(String),
}
