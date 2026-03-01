//! CS2 Match History CLI.
//!
//! Fetches recent matches for yourself or a friend via the CS2 Game
//! Coordinator. Requires a dedicated bot Steam account.
//!
//! ## Usage
//!
//! ```bash
//! # Your own matches
//! cs2-matches --username bot_account
//!
//! # A friend's matches (they must be on the bot's friends list)
//! cs2-matches --username bot_account --target 52079950
//!
//! # With debug logging
//! RUST_LOG=debug cs2-matches --username bot_account
//! ```
//!
//! ## Account Setup
//!
//! 1. Create a free Steam account for the bot
//! 2. Add CS2 to its library (free)
//! 3. Add yourself (and anyone you want to look up) as a friend
//! 4. Ideally get Prime status on the bot account

use clap::Parser;
use cs2_gc::Cs2GcClient;
use cs2_gc::types::{MatchInfo, OwnProfile};
use steam_vent::auth::{ConsoleAuthConfirmationHandler, NullGuardDataStore};
use steam_vent::{Connection, ServerList};

#[derive(Parser)]
#[command(name = "cs2-matches", about = "Fetch CS2 recent matches via GC")]
struct Args {
    /// Steam username for the bot account
    #[arg(short, long)]
    username: String,

    /// 32-bit Account ID to look up.
    /// Omit to fetch your own matches.
    ///
    /// Convert SteamID64: account_id = steamid64 - 76561197960265728
    #[arg(short, long)]
    target: Option<u32>,
}

fn print_profile(p: &OwnProfile) {
    println!("  Account ID:   {}", p.account_id);
    println!("  Player Level: {}", p.player_level);
    println!("  XP:           {}", p.player_cur_xp);
    if p.rankings.is_empty() {
        println!("  Rankings:     (none)");
    } else {
        for r in &p.rankings {
            println!("  {:12}  {} ({} wins)", r.rank_type.name(), r.display(), r.wins);
        }
    }
}

fn print_match(m: &MatchInfo, i: usize) {
    println!("Match #{}", i + 1);
    println!("  ID:       {}", m.match_id);
    println!("  Time:     {}", m.time_display());
    println!("  Map:      {}", if m.map.is_empty() { "?" } else { &m.map });
    println!("  Score:    {}", m.score_display());
    println!("  Duration: {}m {}s", m.match_duration_secs / 60, m.match_duration_secs % 60);

    if !m.players.is_empty() {
        println!("  {:>12}  {:>3} {:>3} {:>3} {:>5}", "Account", "K", "A", "D", "Score");
        println!("  {}", "─".repeat(34));
        for p in &m.players {
            println!("  {:>12}  {:>3} {:>3} {:>3} {:>5}", p.account_id, p.kills, p.assists, p.deaths, p.score);
        }
    }
    println!();
}

#[tokio::main]
async fn main() -> std::result::Result<(), Box<dyn std::error::Error>> {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "cs2_gc=info,cs2_matches=info".into()),
        )
        .init();

    let args = Args::parse();
    let password = rpassword::prompt_password("Steam password: ")?;

    // ── Connect to Steam ──
    println!("[*] Discovering Steam CM servers...");
    let server_list = ServerList::discover().await?;

    println!("[*] Logging in as '{}'...", args.username);
    let connection = Connection::login(
        &server_list,
        &args.username,
        &password,
        NullGuardDataStore,
        ConsoleAuthConfirmationHandler::default(),
    )
    .await?;
    println!("[+] Logged in.");

    // ── Connect to CS2 GC ──
    let mut cs2 = Cs2GcClient::new(connection);

    println!("[*] Connecting to CS2 Game Coordinator...");
    let profile = cs2.hello().await?;

    println!("\n═══ YOUR PROFILE ═══");
    print_profile(&profile);

    // ── Fetch matches ──
    let target = args.target.unwrap_or(profile.account_id);
    let is_self = target == profile.account_id;

    println!(
        "\n[*] Fetching recent matches for {}{}...",
        target,
        if is_self { " (you)" } else { " (friend)" }
    );

    let matches = cs2.recent_matches(target).await?;

    if matches.is_empty() {
        println!("  No recent matches found.");
        if !is_self {
            println!("  (Is this player on the bot's friends list?)");
        }
    } else {
        println!("\n═══ RECENT MATCHES ({}) ═══\n", matches.len());
        for (i, m) in matches.iter().enumerate() {
            print_match(m, i);
        }
    }

    println!("[+] Done.");
    Ok(())
}
