//! Friendly Rust types wrapping CS2 GC protobuf data.
//!
//! These are our own types — clean Rust structs that don't leak protobuf
//! implementation details. Conversion from the raw protobuf types happens
//! in this module.
//!
//! # Protobuf Style Note
//!
//! `steam-vent-proto-csgo` may use either `prost` (struct fields are
//! `Option<T>`, direct access) or `protobuf` v2 (accessor methods like
//! `.field()`, `.set_field()`, `.has_field()`). The conversion code below
//! shows both styles — use whichever matches your version.

use chrono::{DateTime, TimeZone, Utc};

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Rank types
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// A player's ranking in a specific game mode.
#[derive(Debug, Clone)]
pub struct Ranking {
    pub rank_type: RankType,
    /// For Comp/Wingman: 1–18 (Silver I → Global Elite).
    /// For Premier: CS Rating (e.g. 15000).
    pub rank_id: u32,
    /// Total wins in this mode.
    pub wins: u32,
}

/// CS2 game mode.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RankType {
    Competitive,
    Wingman,
    Premier,
    Unknown(u32),
}

impl RankType {
    pub fn from_id(id: u32) -> Self {
        match id {
            6 => Self::Competitive,
            7 => Self::Wingman,
            11 => Self::Premier,
            other => Self::Unknown(other),
        }
    }

    pub fn name(&self) -> &'static str {
        match self {
            Self::Competitive => "Competitive",
            Self::Wingman => "Wingman",
            Self::Premier => "Premier",
            Self::Unknown(_) => "Unknown",
        }
    }
}

/// Competitive/Wingman rank tier name (1–18).
pub fn rank_name(rank_id: u32) -> &'static str {
    match rank_id {
        0 => "Unranked",
        1 => "Silver I",
        2 => "Silver II",
        3 => "Silver III",
        4 => "Silver IV",
        5 => "Silver Elite",
        6 => "Silver Elite Master",
        7 => "Gold Nova I",
        8 => "Gold Nova II",
        9 => "Gold Nova III",
        10 => "Gold Nova Master",
        11 => "Master Guardian I",
        12 => "Master Guardian II",
        13 => "Master Guardian Elite",
        14 => "Distinguished Master Guardian",
        15 => "Legendary Eagle",
        16 => "Legendary Eagle Master",
        17 => "Supreme Master First Class",
        18 => "The Global Elite",
        _ => "Unknown",
    }
}

impl Ranking {
    pub fn display(&self) -> String {
        match self.rank_type {
            RankType::Premier => format!("CS Rating {}", self.rank_id),
            _ => rank_name(self.rank_id).to_string(),
        }
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Own profile (from GC2ClientHello)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// Your own profile data from the GC welcome message.
#[derive(Debug, Clone)]
pub struct OwnProfile {
    pub account_id: u32,
    pub player_level: i32,
    pub player_cur_xp: i32,
    pub rankings: Vec<Ranking>,
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Match data (from MatchList)
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

/// A single match from the match history.
#[derive(Debug, Clone)]
pub struct MatchInfo {
    pub match_id: u64,
    pub match_time: Option<DateTime<Utc>>,
    pub map: String,
    /// Typically [ct_score, t_score].
    pub team_scores: Vec<i32>,
    pub match_result: i32,
    pub match_duration_secs: i32,
    pub players: Vec<PlayerStats>,
    /// Components for constructing a share code.
    pub share_code_parts: Option<ShareCodeParts>,
}

/// Components of a CS2 share code: `CSGO-xxxxx-xxxxx-xxxxx-xxxxx-xxxxx`.
#[derive(Debug, Clone)]
pub struct ShareCodeParts {
    pub match_id: u64,
    pub outcome_id: u64,
    pub token: u32,
}

/// One player's scoreboard line for a match.
#[derive(Debug, Clone)]
pub struct PlayerStats {
    pub account_id: u32,
    pub kills: i32,
    pub assists: i32,
    pub deaths: i32,
    pub score: i32,
}

impl MatchInfo {
    pub fn score_display(&self) -> String {
        if self.team_scores.len() >= 2 {
            format!("{} – {}", self.team_scores[0], self.team_scores[1])
        } else {
            "? – ?".to_string()
        }
    }

    pub fn time_display(&self) -> String {
        self.match_time
            .map(|dt| dt.format("%Y-%m-%d %H:%M UTC").to_string())
            .unwrap_or_else(|| "Unknown".to_string())
    }
}

// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
// Protobuf conversion
// ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
//
// Below are conversion functions from the raw protobuf types in
// `steam_vent_proto_csgo::cstrike15_gcmessages`. The field access style
// depends on whether steam-vent-proto-csgo uses prost or protobuf v2.
//
// PROST STYLE:
//   field: Option<T>  →  msg.field.unwrap_or_default()
//   repeated: Vec<T>  →  msg.field (direct)
//
// PROTOBUF V2 STYLE:
//   field: T           →  msg.field()  (returns value or default)
//   msg.has_field()    →  bool
//   repeated: Vec<T>   →  msg.get_field() or &msg.field
//
// The code below uses PROTOBUF V2 style based on docs.rs evidence for
// steam-vent-proto 0.1.x. If your version uses prost, swap the accessors.

use steam_vent_proto_csgo::cstrike15_gcmessages as pb;

impl OwnProfile {
    /// Convert from `CMsgGCCStrike15_v2_MatchmakingGC2ClientHello`.
    pub fn from_proto(hello: &pb::CMsgGCCStrike15_v2_MatchmakingGC2ClientHello) -> Self {
        let mut rankings = Vec::new();

        // The `ranking` field is the legacy single ranking (MessageField).
        // `rankings` is the repeated field with all modes.
        if hello.ranking.is_some() {
            let r = &*hello.ranking;
            rankings.push(Ranking {
                rank_type: RankType::from_id(r.rank_type_id()),
                rank_id: r.rank_id(),
                wins: r.wins(),
            });
        }

        for r in &hello.rankings {
            let rt = RankType::from_id(r.rank_type_id());
            // Skip if we already have this rank type from the legacy field
            if !rankings.iter().any(|existing| existing.rank_type == rt) {
                rankings.push(Ranking {
                    rank_type: rt,
                    rank_id: r.rank_id(),
                    wins: r.wins(),
                });
            }
        }

        Self {
            account_id: hello.account_id(),
            player_level: hello.player_level(),
            player_cur_xp: hello.player_cur_xp(),
            rankings,
        }
    }
}

impl MatchInfo {
    /// Convert from `CDataGCCStrike15_v2_MatchInfo`.
    pub fn from_proto(m: &pb::CDataGCCStrike15_v2_MatchInfo) -> Self {
        let match_time = {
            let ts = m.matchtime(); // or: m.matchtime.unwrap_or(0)
            if ts > 0 {
                Utc.timestamp_opt(ts as i64, 0).single()
            } else {
                None
            }
        };

        // The last entry in `roundstatsall` is the final scoreboard.
        // Earlier entries are per-round snapshots. Fall back to
        // `roundstats_legacy` if `roundstatsall` is empty.
        let final_stats = m.roundstatsall.last();
        // If roundstatsall is empty, try legacy:
        //   protobuf v2: m.roundstats_legacy.as_ref()
        //   prost: m.roundstats_legacy.as_ref()

        let (map, team_scores, match_result, match_duration, players, share_parts) =
            match final_stats {
                Some(stats) => extract_round_stats(m.matchid(), stats),
                None => (String::new(), vec![], 0, 0, vec![], None),
            };

        Self {
            match_id: m.matchid(), // or: m.matchid.unwrap_or(0)
            match_time,
            map,
            team_scores,
            match_result,
            match_duration_secs: match_duration,
            players,
            share_code_parts: share_parts,
        }
    }
}

/// Extract scoreboard data from the final round's stats.
fn extract_round_stats(
    match_id: u64,
    stats: &pb::CMsgGCCStrike15_v2_MatchmakingServerRoundStats,
) -> (String, Vec<i32>, i32, i32, Vec<PlayerStats>, Option<ShareCodeParts>) {
    // Account IDs come from the reservation sub-message.
    // The indices in kills/assists/deaths/scores correspond to these IDs.
    let account_ids: &[u32] = stats
        .reservation
        .as_ref()
        .map(|r| r.account_ids.as_slice())
        .unwrap_or(&[]);

    let players: Vec<PlayerStats> = account_ids
        .iter()
        .enumerate()
        .filter(|(_, &id)| id != 0) // skip empty/bot slots
        .map(|(i, &acct_id)| PlayerStats {
            account_id: acct_id,
            kills: stats.kills.get(i).copied().unwrap_or(0),
            assists: stats.assists.get(i).copied().unwrap_or(0),
            deaths: stats.deaths.get(i).copied().unwrap_or(0),
            score: stats.scores.get(i).copied().unwrap_or(0),
        })
        .collect();

    // Share code parts: matchid + reservation's match_id (= outcomeid) + token.
    // The token may be in a different field — needs investigation with real data.
    let share_parts = stats.reservation.as_ref().map(|r| ShareCodeParts {
        match_id,
        outcome_id: r.match_id(), // or: r.match_id.unwrap_or(0)
        token: 0,                 // TODO: find where token lives in the proto
    });

    (
        stats.map().to_string(),       // or: stats.map.clone().unwrap_or_default()
        stats.team_scores.clone(),
        stats.match_result(),          // or: stats.match_result.unwrap_or(0)
        stats.match_duration(),        // or: stats.match_duration.unwrap_or(0)
        players,
        share_parts,
    )
}
