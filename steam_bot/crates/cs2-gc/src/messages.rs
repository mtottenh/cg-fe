//! CS2 Game Coordinator message type IDs.
//!
//! These are values from the `ECsgoGCMsg` enum in `cstrike15_gcmessages.proto`.
//! They are used as the `msgtype` field in `CMsgGCClient` (with `PROTO_MASK`
//! OR'd in for protobuf-encoded messages).
//!
//! Source: [SteamDatabase/GameTracking-CS2](https://github.com/SteamDatabase/GameTracking-CS2/blob/master/Protobufs/cstrike15_gcmessages.proto)

/// Client→GC: "I'm here, give me my profile."
/// Response: [`GC2CLIENT_HELLO`]
pub const CLIENT_HELLO: u32 = 9109;

/// GC→Client: Welcome. Contains own rank, XP, medals, ongoing match info.
pub const GC2CLIENT_HELLO: u32 = 9110;

/// Client→GC: Request full match info from share code components.
/// Fields: `matchid`, `outcomeid`, `token`.
/// Response: [`MATCH_LIST`]
pub const MATCH_LIST_REQUEST_FULL_GAME_INFO: u32 = 9146;

/// Client→GC: Request recent matches for an `account_id`.
/// Response: [`MATCH_LIST`]
pub const MATCH_LIST_REQUEST_RECENT_USER_GAMES: u32 = 9148;

/// GC→Client: Match list response. Returned for any match list request.
pub const MATCH_LIST: u32 = 9149;

/// Client→GC: Request list of currently live games.
/// Response: [`MATCH_LIST`]
pub const MATCH_LIST_REQUEST_CURRENT_LIVE_GAMES: u32 = 9150;

/// Client→GC: Request live game for a specific user.
/// Response: [`MATCH_LIST`]
pub const MATCH_LIST_REQUEST_LIVE_GAME_FOR_USER: u32 = 9151;
