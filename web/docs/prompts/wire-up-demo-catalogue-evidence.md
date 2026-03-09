# Wire Up Demo Catalogue to Evidence Submission

## Context

The frontend has a **Phase 1 evidence UI shell** that displays local-only file attachments but never uploads anything or sends real evidence/demo IDs to the backend. The backend already has a complete demo catalogue and evidence system with all endpoints operational. This task connects the two.

The "Browse Demos" tab in the evidence panel is the primary integration point — it lets users search the demo catalogue for demos relevant to their match, link them as evidence, and include the resulting `demo_link_ids` in their result submission.

### Current State

- `EvidenceAttachmentPanel.vue` has four tabs: Upload Image (enabled), Link URL (disabled), Demo File (disabled), **Browse Demos (disabled)**.
- `EvidenceTypeSelector.vue` accepts `:browse-enabled` prop — currently hardcoded to `false`.
- `ResultSubmissionPanel.vue` collects `evidenceIds` (always `[]`) and passes `[]` for `demoLinkIds` to `store.submitResult()`.
- `matchResults` store already accepts `evidenceIds: string[]` and `demoLinkIds: string[]` params and sends them in the API request body.
- The `api` client (`src/api/`) is auto-generated from the OpenAPI spec — all demo and evidence endpoints are already typed in `src/api/types.ts`. **Do not modify `src/api/types.ts`** — it's generated.

### Key Backend Endpoints to Consume

All endpoints are typed in `src/api/types.ts` via `components['schemas'][...]`. Use the existing `api` client from `@/api` and `unwrapApi` from `@/stores/helpers`.

**Demo Catalogue (read-only for participants):**

| Method | Path | Purpose | Response Type |
|--------|------|---------|---------------|
| `GET` | `/v1/demos` | List/search demos with filters | `DemoListResponse` (`{ demos: DemoResponse[], total: number }`) |
| `GET` | `/v1/demos/{id}` | Get single demo | `DemoResponse` |
| `GET` | `/v1/demos/{id}/players` | Get player stats from demo | `DemoPlayerResponse[]` |
| `GET` | `/v1/matches/{match_id}/demos` | Get demos already linked to match | `DemoMatchLinkWithDemoResponse[]` |

**Evidence Discovery + Linking:**

| Method | Path | Purpose | Response Type |
|--------|------|---------|---------------|
| `GET` | `/v1/matches/{match_id}/evidence/discover` | Auto-discover relevant demos for a match | `DiscoveredEvidenceResponse[]` |
| `POST` | `/v1/matches/{match_id}/evidence/link-demo` | Link a demo to match as evidence (by `demo_name`) | `EvidenceResponse` |
| `POST` | `/v1/matches/{match_id}/evidence/link-discovered` | Link a discovered evidence item (by `external_id`) | `EvidenceResponse` |
| `GET` | `/v1/matches/{match_id}/evidence` | List evidence already attached to match | `EvidenceResponse[]` |

**Demo Validation (optional but valuable):**

| Method | Path | Purpose | Response Type |
|--------|------|---------|---------------|
| `GET` | `/v1/matches/{match_id}/evidence/demo-stats/{demo_name}` | Fetch parsed stats for a demo | `DemoStatsResponse` |
| `POST` | `/v1/matches/{match_id}/evidence/validate-demo` | Validate demo against claimed scores | `DemoValidationResponse` |

### Key Types (from `src/api/types.ts`)

```typescript
// Demo catalogue entry
DemoResponse: {
  id: string
  game_id: string
  file_name: string
  file_size_bytes?: number | null
  category: string           // uncategorized | pug | league | scrim | ignored
  status: string             // pending | processing | ready | failed | archived
  metadata?: DemoMetadataResponse | null
  discovered_at: string
  // ... s3_bucket, s3_key, league_id, tournament_id, etc.
}

DemoMetadataResponse: {
  map_name: string
  team1_name: string
  team1_score: number
  team2_name: string
  team2_score: number
  total_rounds: number
  duration_seconds?: number | null
  match_date?: string | null
}

// Auto-discovered evidence candidate
DiscoveredEvidenceResponse: {
  external_id: string        // prefixed "catalog:<uuid>" for catalogue demos
  evidence_type: string
  name: string
  file_size_bytes?: number | null
  relevance_score: number    // 0.0 – 1.0
  metadata: unknown          // contains map_name, scores, etc.
  discovered_at: string
}

// Link request bodies
LinkDemoRequest: { demo_name: string; game_number?: number | null; description?: string | null }
LinkDiscoveredEvidenceRequest: { external_id: string; game_number?: number | null }

// Demo-match link (returned after linking)
DemoMatchLinkResponse: {
  id: string                 // THIS is the demo_link_id to include in result submission
  demo_id: string
  match_id: string
  game_number?: number | null
  link_type: string          // manual | auto_matched | evidence
  confidence_score?: number | null
  validated: boolean
  // ...
}

// Validation
DemoValidationResponse: {
  is_valid: boolean
  confidence: number
  extracted_result?: ExtractedResultResponse | null
  warnings: string[]
  errors: string[]
  demo_url: string
  stats_url: string
}

// Result submission (already wired)
SubmitResultClaimRequest: {
  claimed_winner_registration_id: string
  participant1_score: number
  participant2_score: number
  game_results?: GameResultInput[]
  evidence_ids?: string[]     // match_evidence record IDs
  demo_link_ids?: string[]    // demo_match_links record IDs  <-- THIS IS THE KEY FIELD
  notes?: string
}

GameResultInput: {
  game_number: number
  map_id: string
  participant1_score: number
  participant2_score: number
  evidence_ids?: string[]
  demo_link_id?: string | null   // single demo link per game
  duration_seconds?: number
}
```

---

## Implementation Plan

### 1. Create `src/stores/evidence.ts` — Evidence & Demo Store

A new Pinia store that handles demo discovery, linking, and evidence management for a match.

**State:**
- `discoveredDemos: DiscoveredEvidenceResponse[]` — results from the discover endpoint
- `linkedDemos: DemoMatchLinkWithDemoResponse[]` — demos already linked to the match (from `GET /matches/{match_id}/demos`)
- `linkedEvidence: EvidenceResponse[]` — all evidence records for the match
- `loading`, `error` — standard

**Actions:**
- `discoverDemos(matchId: string)` — calls `GET /v1/matches/{match_id}/evidence/discover` and populates `discoveredDemos`
- `fetchLinkedDemos(matchId: string)` — calls `GET /v1/matches/{match_id}/demos?include_stats=true` and populates `linkedDemos`
- `linkDiscoveredDemo(matchId: string, externalId: string, gameNumber?: number)` — calls `POST /v1/matches/{match_id}/evidence/link-discovered` with `{ external_id: externalId, game_number: gameNumber }`. After success, re-fetches linked demos and removes the item from `discoveredDemos`.
- `unlinkDemo(matchId: string, demoLinkId: string)` — (stretch) remove a linked demo. For now, just filter it from local state.
- `fetchDemoStats(matchId: string, demoName: string)` — calls `GET /v1/matches/{match_id}/evidence/demo-stats/{demo_name}` and returns the `DemoStatsResponse`
- `clear()` — reset all state

Follow the patterns in `src/stores/matchResults.ts` — use `unwrapApi`, `createActionState`, `withActionState` from `@/stores/helpers`.

### 2. Create `src/components/match/evidence/DemoBrowser.vue` — Demo Browser Component

This is the main new UI. It renders inside the `browse` tab of `EvidenceAttachmentPanel`.

**Layout:**

```
┌─────────────────────────────────────────────────┐
│  Discover Demos for This Match        [Refresh] │
│─────────────────────────────────────────────────│
│  (auto-runs discover on mount)                  │
│                                                 │
│  ┌─ Suggested Demos ──────────────────────────┐ │
│  │  de_dust2 — Team A vs Team B (13-7)   [+]  │ │
│  │  de_inferno — Team A vs Team B (16-9) [+]  │ │
│  │  relevance: 0.85        relevance: 0.72    │ │
│  └────────────────────────────────────────────┘ │
│                                                 │
│  ┌─ Linked Demos ─────────────────────────────┐ │
│  │  de_dust2 — 13:7 — Game 1        [×]      │ │
│  │  (validated ✓)                              │ │
│  └────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Behavior:**
- On mount, call `evidenceStore.discoverDemos(matchId)` and `evidenceStore.fetchLinkedDemos(matchId)`.
- Show discovered demos as selectable cards/list items. Each shows: file name, map name (from metadata), scores, relevance score badge.
- A "+" button on each discovered demo calls `evidenceStore.linkDiscoveredDemo(matchId, externalId, gameNumber)`. For series matches, show a small game-number selector (dropdown: "Game 1", "Game 2", etc.) before linking.
- Below discovered demos, show already-linked demos with their metadata and validation status.
- Emit `update:demoLinkIds` with the array of `linkedDemos.map(d => d.link.id)` whenever linked demos change, so the parent can include them in the result submission.

**Props:**
- `matchId: string`
- `matchFormat: 'bo1' | 'bo3' | 'bo5' | 'bo7'` — to determine game number options

**Emits:**
- `update:demoLinkIds` — `string[]` of `DemoMatchLinkResponse.id` values

### 3. Update `src/components/match/evidence/EvidenceAttachmentPanel.vue`

- Enable the browse tab: change `:browse-enabled="false"` to `:browse-enabled="true"`.
- Import `DemoBrowser` and render it in the `v-else-if="activeTab === 'browse'"` slot, replacing the placeholder alert.
- Add a `demoLinkIds` ref, listen to `DemoBrowser`'s `update:demoLinkIds` event.
- Emit a new event `update:demoLinkIds` alongside the existing `update:evidenceIds`.

```vue
<!-- Browse Demos: Live integration -->
<div v-else-if="activeTab === 'browse'">
  <DemoBrowser
    :match-id="matchId"
    :match-format="matchFormat"
    @update:demo-link-ids="demoLinkIds = $event; $emit('update:demoLinkIds', $event)"
  />
</div>
```

Add new props and emits:
```typescript
// New prop
matchFormat?: 'bo1' | 'bo3' | 'bo5' | 'bo7'  // default 'bo1'

// New emit
'update:demoLinkIds': [ids: string[]]
```

### 4. Update `src/components/match/results/ResultSubmissionPanel.vue`

- Pass `matchFormat` prop down to `EvidenceAttachmentPanel`.
- Add a `demoLinkIds` ref and listen to the new `update:demoLinkIds` event from `EvidenceAttachmentPanel`.
- In `handleSubmit()`, pass `demoLinkIds.value` instead of `[]` to `store.submitResult()`.
- For series matches, if a `demoLinkId` is available for a specific game number, include it in the corresponding `GameResultInput.demo_link_id`.

The relevant change in `handleSubmit`:
```typescript
// Before:
await store.submitResult(
  props.matchId,
  seriesWinnerRegistrationId.value,
  teamASeriesWins.value,
  teamBSeriesWins.value,
  gameResults,
  evidenceIds.value,
  [], // demoLinkIds - Phase 3  <-- CHANGE THIS
  notes.value || undefined
)

// After:
await store.submitResult(
  props.matchId,
  seriesWinnerRegistrationId.value,
  teamASeriesWins.value,
  teamBSeriesWins.value,
  gameResults,
  evidenceIds.value,
  demoLinkIds.value,
  notes.value || undefined
)
```

### 5. Update `src/composables/useMatchDetail.ts`

After fetching match data, also fetch linked demos so the UI has data ready:
- Import and use the evidence store.
- In `fetchAll()`, when the match is in a result-relevant state (`in_progress`, `awaiting_result`), also call `evidenceStore.discoverDemos()` and `evidenceStore.fetchLinkedDemos()`.
- Add `evidenceStore` cleanup in `onUnmounted`.

### 6. (Optional) Create `src/components/match/evidence/DiscoveredDemoCard.vue`

A small card component for rendering a single discovered demo suggestion. Shows:
- Map name + scores from metadata
- Relevance score as a colored chip (green >0.8, yellow >0.5, red otherwise)
- File name
- "Link to Match" button with optional game number selector

This keeps `DemoBrowser.vue` cleaner.

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/stores/evidence.ts` | Pinia store for demo discovery, linking, evidence management |
| `src/components/match/evidence/DemoBrowser.vue` | Browse & link demos from catalogue |
| `src/components/match/evidence/DiscoveredDemoCard.vue` | (Optional) Card for a single discovered demo |

## Files to Modify

| File | Change |
|------|--------|
| `src/components/match/evidence/EvidenceAttachmentPanel.vue` | Enable browse tab, render DemoBrowser, emit demoLinkIds |
| `src/components/match/evidence/EvidenceTypeSelector.vue` | No changes needed (already supports browseEnabled prop) |
| `src/components/match/results/ResultSubmissionPanel.vue` | Wire demoLinkIds through to store.submitResult() |
| `src/composables/useMatchDetail.ts` | Pre-fetch discovered/linked demos for result-eligible matches |

## Constraints

- **Do NOT modify `src/api/types.ts`** — it is auto-generated from the OpenAPI spec.
- Use the existing `api` client from `@/api` and `unwrapApi` / `withActionState` helpers from `@/stores/helpers`.
- Follow established patterns: Pinia stores with `createActionState`, Vue 3 `<script setup>`, Vuetify 3 components.
- The demo catalogue `GET /v1/demos` endpoint requires authentication. The `api` client already attaches the auth token.
- `DiscoveredEvidenceResponse.external_id` for catalogue demos is prefixed with `"catalog:"` — the backend's `link-discovered` endpoint handles this prefix internally.
- Keep the existing Phase 1 image upload tab functional — this work only enables the "Browse Demos" tab alongside it.

## Verification

1. Navigate to a match in `in_progress` or `awaiting_result` state
2. Open the result submission panel — evidence panel should now show "Browse Demos" tab enabled
3. Click "Browse Demos" — should auto-discover and show relevant demos with map/score metadata
4. Click "+" on a discovered demo — it moves to the "Linked" section, and `demoLinkIds` updates
5. Submit a result with linked demos — network tab shows `demo_link_ids: ["uuid-1", ...]` in the POST body
6. For a BO3 match, linking a demo should prompt for game number selection
7. Existing image upload tab still works as before (local-only Phase 1 behavior)
