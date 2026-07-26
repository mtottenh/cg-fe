# Backend Task: Add `GET /v1/tournaments/{tournament_id}/matches/{match_id}` Endpoint

## Summary

Add a single-match GET endpoint. The frontend currently calls this route but it doesn't exist, causing "Match Not Found" errors.

## Endpoint Spec

- **Method**: `GET`
- **Path**: `/v1/tournaments/{tournament_id}/matches/{match_id}`
- **Response**: `DataResponse<TournamentMatchResponse>` (single match, not a list)
- **Errors**: `404` if tournament or match not found, `400` if IDs are malformed

## Implementation Guide

### 1. Add the handler

**File**: `api/crates/portal-api/src/handlers/tournaments.rs`

Add after `get_matches` (line ~1037). Follow the exact same pattern:

```rust
/// Get a single match by ID.
#[utoipa::path(
    get,
    path = "/v1/tournaments/{tournament_id}/matches/{match_id}",
    params(
        ("tournament_id" = String, Path, description = "Tournament ID"),
        ("match_id" = String, Path, description = "Match ID"),
    ),
    responses(
        (status = 200, description = "Match details", body = DataResponse<TournamentMatchResponse>),
        (status = 404, description = "Match not found", body = ApiError),
    ),
    tag = "tournaments"
)]
pub async fn get_match(
    State(state): State<AppState>,
    headers: HeaderMap,
    Path((tournament_id, match_id)): Path<(String, String)>,
) -> ApiResult<Json<DataResponse<TournamentMatchResponse>>> {
    let request_id = get_request_id(&headers);

    let tournament_id: TournamentId = tournament_id
        .parse()
        .map_err(|_| ApiError::bad_request("Invalid tournament ID format"))?;

    let match_id: TournamentMatchId = match_id
        .parse()
        .map_err(|_| ApiError::bad_request("Invalid match ID format"))?;

    let match_ = state
        .tournament_service
        .get_tournament_match(tournament_id, match_id)
        .await?;

    Ok(Json(DataResponse::new(match_.into(), request_id)))
}
```

### 2. Add the service method

**File**: `api/crates/portal-domain/src/services/tournament/service.rs`

Add after `get_tournament_matches` (line ~1477):

```rust
/// Get a single match by ID, verifying it belongs to the tournament.
pub async fn get_tournament_match(
    &self,
    tournament_id: TournamentId,
    match_id: TournamentMatchId,
) -> Result<TournamentMatch, DomainError> {
    let match_ = self
        .match_repo
        .find_by_id(match_id)
        .await?
        .ok_or_else(|| DomainError::NotFound("Match not found".into()))?;

    // Verify the match belongs to this tournament
    if match_.tournament_id != tournament_id {
        return Err(DomainError::NotFound("Match not found".into()));
    }

    Ok(match_)
}
```

The `find_by_id` method already exists on `TournamentMatchRepository` (defined in `api/crates/portal-domain/src/repositories/tournament.rs:482`). The Postgres implementation is in `api/crates/portal-db/src/adapters/tournament/match_.rs:34`.

### 3. Add the route

**File**: `api/crates/portal-api/src/routes/tournaments.rs`

Add after line 72 (the `get_matches` route):

```rust
.route("/{tournament_id}/matches/{match_id}", get(tournaments::get_match))
```

### 4. Register in OpenAPI

**File**: `api/crates/portal-api/src/openapi.rs`

Add `tournaments::get_match,` after `tournaments::get_matches,` (line ~238).

## Existing Patterns Reference

- **Handler pattern**: `get_matches` at `handlers/tournaments.rs:1018` (extracts path, calls service, maps to response)
- **Repository**: `TournamentMatchRepository::find_by_id` at `repositories/tournament.rs:482`
- **DB adapter**: `PgTournamentMatchRepository::find_by_id` at `adapters/tournament/match_.rs:34`
- **Response DTO**: `TournamentMatchResponse` at `dto/responses/tournament.rs:407`
- **Service struct**: `TournamentService` at `services/tournament/service.rs:26` (has `match_repo: Arc<TMR>`)

## Future: `GET /v1/me/matches` Endpoint

Long-term, a dedicated endpoint for the current user's upcoming matches would eliminate the need for client-side aggregation. This would:

- Accept query params: `status`, `limit`, `tournament_id`
- Use the authenticated user's player ID to find their registrations
- Return matches where they are a participant
- Could use `TournamentMatchRepository::list_by_participant(registration_id)` (already exists)
