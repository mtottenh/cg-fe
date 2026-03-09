# Backend Fix: Matches Stuck in "Pending" After Tournament Start

## Problem

When `start_tournament()` runs, it creates matches and assigns participants via `apply_initial_assignments()` and `apply_byes()`, but never transitions matches from `Pending` to `Ready`. The `Pending → Ready` transition only fires in the progression service after a **previous** match completes — so first-round matches are permanently stuck.

## Fix

### 1. Transition assigned matches to `Ready` after bracket generation

**File**: `portal-domain/src/services/tournament/service.rs` (around line 496, inside `start_tournament()`)

After `apply_initial_assignments()` and `apply_byes()` complete:

```rust
// Query all matches for the newly created bracket
let bracket_matches = match_repo.find_by_bracket_id(bracket.id).await?;

// Transition matches that have both participants assigned
for m in &bracket_matches {
    if m.participant1_registration_id.is_some()
        && m.participant2_registration_id.is_some()
        && m.status == TournamentMatchStatus::Pending
    {
        match_repo.update_status(m.id, TournamentMatchStatus::Ready).await?;
    }
}
```

This follows the exact same pattern as `find_newly_ready_matches()` in `progression.rs:400-416`.

### 2. For `live` scheduling mode: auto-start matches

When the tournament's `scheduling_mode` is `live`, matches should skip `Scheduled` / `CheckingIn` and go straight to `InProgress`:

```rust
if tournament.scheduling_mode == SchedulingMode::Live {
    for m in &bracket_matches {
        if m.participant1_registration_id.is_some()
            && m.participant2_registration_id.is_some()
            && m.status == TournamentMatchStatus::Pending
        {
            match_repo.update_status(m.id, TournamentMatchStatus::Ready).await?;
            match_repo.update_status(m.id, TournamentMatchStatus::InProgress).await?;
            match_repo.set_started_at(m.id, Utc::now()).await?;
        }
    }
}
```

### 3. Reference

- `find_newly_ready_matches()` in `progression.rs:400-416` — exact pattern to follow for checking participant assignment
- `match_repo.update_status()` — same call used throughout progression service
