//! # cs2-gc
//!
//! High-level CS2 Game Coordinator client library.
//!
//! Follows the same pattern as [`steam-vent-chat`](https://codeberg.org/steam-vent/chat):
//! a thin, typed wrapper over a `steam_vent::Connection` that handles
//! protocol details internally.
//!
//! ## Architecture
//!
//! ```text
//! ┌─────────────────┐         ┌─────────────────┐
//! │  Your code      │         │  steam-vent      │
//! │                 │         │                  │
//! │  Cs2GcClient    │────────►│  Connection      │
//! │   .hello()      │         │   .service_method│
//! │   .recent_matches()       │   .on_notification
//! │   .match_info() │         │   (+ raw EMsg?)  │
//! └─────────────────┘         └─────────────────┘
//!         │
//!    ┌────┴────┐
//!    │transport │  ← bridges Connection to GC protocol
//!    │  .send() │    (wraps payloads in CMsgGCClient,
//!    │  .recv() │     sends via EMsg::ClientToGC)
//!    └─────────┘
//! ```
//!
//! ## Usage
//!
//! ```no_run
//! use cs2_gc::Cs2GcClient;
//! use steam_vent::Connection;
//!
//! # async fn example(connection: Connection) -> Result<(), Box<dyn std::error::Error>> {
//! let mut cs2 = Cs2GcClient::new(connection);
//!
//! // Handshake — also returns your own rank
//! let profile = cs2.hello().await?;
//! println!("My rank: {:?}", profile.rankings);
//!
//! // Recent matches for a friend (must be on your friends list)
//! let matches = cs2.recent_matches(friend_account_id).await?;
//! for m in &matches {
//!     println!("{} on {} — {}", m.time_display(), m.map, m.score_display());
//! }
//! # Ok(())
//! # }
//! ```
//!
//! ## What You'll Need to Adapt
//!
//! The [`transport`] module contains the low-level GC send/receive logic.
//! Since steam-vent's API for raw EMsg / GC messages isn't fully documented,
//! you'll need to adapt `transport::GcTransport` to match what `Connection`
//! actually exposes. The rest of the library should work as-is once transport
//! compiles.

pub mod messages;
pub(crate) mod transport;
pub mod types;

use std::time::Duration;

use steam_vent::Connection;
use tracing::{debug, info};

// Protobuf types from the csgo proto crate.
// These are the raw GC message types — we serialize/deserialize them in
// the transport layer, then convert to our own types in `types.rs`.
use steam_vent_proto_csgo::cstrike15_gcmessages as pb;

use crate::transport::{GcTransport, GcTransportError};
use crate::types::{MatchInfo, OwnProfile};

/// How long to wait for a GC response before giving up.
const DEFAULT_GC_TIMEOUT: Duration = Duration::from_secs(15);

/// Delay after telling Steam we're "playing" CS2, before sending ClientHello.
/// The GC needs a moment to notice us.
const POST_PLAY_DELAY: Duration = Duration::from_secs(2);

/// Errors from the CS2 GC client.
#[derive(Debug, thiserror::Error)]
pub enum Error {
    #[error(transparent)]
    Transport(#[from] GcTransportError),

    #[error("Protobuf decode error: {0}")]
    Decode(String),

    #[error("Not connected to GC — call hello() first")]
    NotConnected,
}

pub type Result<T> = std::result::Result<T, Error>;

/// High-level CS2 Game Coordinator client.
///
/// Modeled after `ChatClient` from `steam-vent-chat`: takes ownership of
/// a `Connection`, provides typed async methods for GC operations.
///
/// ## Lifecycle
///
/// 1. Create with `Cs2GcClient::new(connection)`
/// 2. Call `.hello()` to initiate the GC session
/// 3. Use `.recent_matches()`, `.match_info()`, etc.
///
/// The bot account must have CS2 in its library (free) and ideally Prime
/// status for full access to match data.
pub struct Cs2GcClient {
    transport: GcTransport,
    connected: bool,
}

impl Cs2GcClient {
    /// Create a new CS2 GC client from an authenticated `Connection`.
    ///
    /// The connection should already be logged in. Call [`hello()`](Self::hello)
    /// to start the GC session.
    pub fn new(connection: Connection) -> Self {
        Self {
            transport: GcTransport::new(connection),
            connected: false,
        }
    }

    /// Perform the GC handshake.
    ///
    /// 1. Tells Steam we're "playing" CS2 (app 730)
    /// 2. Sends `ClientHello` to the GC
    /// 3. Waits for `GC2ClientHello` containing our profile + rank
    ///
    /// Must be called before any other GC methods.
    pub async fn hello(&mut self) -> Result<OwnProfile> {
        info!("Starting GC handshake...");

        // Step 1: Tell Steam we're playing CS2
        self.transport.set_playing_cs2().await?;
        tokio::time::sleep(POST_PLAY_DELAY).await;

        // Step 2: Send ClientHello (empty message — no fields to set)
        //
        // Protobuf v2: CMsgGCCStrike15_v2_MatchmakingClient2GCHello::new()
        //              .write_to_bytes()?
        // Prost:       pb::CMsg...Client2GcHello::default()
        //              .encode_to_vec()
        let hello = pb::CMsgGCCStrike15_v2_MatchmakingClient2GCHello::new();
        let payload = hello.write_to_bytes()
            .map_err(|e| Error::Decode(e.to_string()))?;

        self.transport
            .send(messages::CLIENT_HELLO, &payload)
            .await?;

        // Step 3: Wait for GC2ClientHello
        let response = self
            .transport
            .recv(messages::GC2CLIENT_HELLO, DEFAULT_GC_TIMEOUT)
            .await?;

        let gc_hello = pb::CMsgGCCStrike15_v2_MatchmakingGC2ClientHello::parse_from_bytes(&response)
            .map_err(|e| Error::Decode(e.to_string()))?;

        self.connected = true;
        let profile = OwnProfile::from_proto(&gc_hello);

        info!(
            account_id = profile.account_id,
            ranks = profile.rankings.len(),
            "Connected to CS2 GC"
        );

        Ok(profile)
    }

    /// Get recent matches for an account.
    ///
    /// Returns up to ~8 most recent competitive matches with scoreboard data.
    ///
    /// - Pass your own `account_id` for your matches
    /// - Pass a friend's `account_id` for theirs (they must be on your
    ///   Steam friends list — this is Valve's restriction)
    pub async fn recent_matches(&self, account_id: u32) -> Result<Vec<MatchInfo>> {
        self.ensure_connected()?;

        debug!(account_id, "Requesting recent matches");

        // Build request
        let mut req = pb::CMsgGCCStrike15_v2_MatchListRequestRecentUserGames::new();
        req.set_accountid(account_id);
        // Prost: let req = pb::CMsg...RecentUserGames { accountid: Some(account_id), ..Default::default() };

        let payload = req.write_to_bytes()
            .map_err(|e| Error::Decode(e.to_string()))?;

        self.transport
            .send(messages::MATCH_LIST_REQUEST_RECENT_USER_GAMES, &payload)
            .await?;

        // Wait for MatchList response
        let response = self
            .transport
            .recv(messages::MATCH_LIST, DEFAULT_GC_TIMEOUT)
            .await?;

        let match_list = pb::CMsgGCCStrike15_v2_MatchList::parse_from_bytes(&response)
            .map_err(|e| Error::Decode(e.to_string()))?;

        info!(
            count = match_list.matches.len(),
            "Received match list"
        );

        Ok(match_list.matches.iter().map(MatchInfo::from_proto).collect())
    }

    /// Get full match info from share code components.
    ///
    /// A share code `CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx` decodes to
    /// `(match_id, outcome_id, token)`. Pass those components here.
    pub async fn match_info(
        &self,
        match_id: u64,
        outcome_id: u64,
        token: u32,
    ) -> Result<Vec<MatchInfo>> {
        self.ensure_connected()?;

        debug!(match_id, outcome_id, token, "Requesting match info");

        let mut req = pb::CMsgGCCStrike15_v2_MatchListRequestFullGameInfo::new();
        req.set_matchid(match_id);
        req.set_outcomeid(outcome_id);
        req.set_token(token);

        let payload = req.write_to_bytes()
            .map_err(|e| Error::Decode(e.to_string()))?;

        self.transport
            .send(messages::MATCH_LIST_REQUEST_FULL_GAME_INFO, &payload)
            .await?;

        let response = self
            .transport
            .recv(messages::MATCH_LIST, DEFAULT_GC_TIMEOUT)
            .await?;

        let match_list = pb::CMsgGCCStrike15_v2_MatchList::parse_from_bytes(&response)
            .map_err(|e| Error::Decode(e.to_string()))?;

        Ok(match_list.matches.iter().map(MatchInfo::from_proto).collect())
    }

    /// Access the underlying `Connection`.
    pub fn connection(&self) -> &Connection {
        self.transport.connection()
    }

    /// Whether the GC handshake has completed.
    pub fn is_connected(&self) -> bool {
        self.connected
    }

    fn ensure_connected(&self) -> Result<()> {
        if !self.connected {
            Err(Error::NotConnected)
        } else {
            Ok(())
        }
    }
}

// Protobuf Message trait — re-exported through steam-vent-proto so we
// don't need protobuf as a direct dependency.
use steam_vent_proto::protobuf::Message;
