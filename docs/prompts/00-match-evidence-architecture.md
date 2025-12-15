# Match Result & Evidence System Architecture

## Purpose

This document defines the shared architecture for the Match Result, Evidence, and Demo Catalog features. **All three feature prompts (01, 03, 06) MUST reference this document** to ensure a cohesive user experience.

## Overview

These features form a unified "Match Completion Flow":

```
┌─────────────────────────────────────────────────────────────────┐
│                    MATCH COMPLETION FLOW                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐         │
│  │   RESULTS   │───▶│  EVIDENCE   │───▶│   DEMOS     │         │
│  │   (01)      │    │   (03)      │    │   (06)      │         │
│  └─────────────┘    └─────────────┘    └─────────────┘         │
│        │                  │                  │                  │
│        │                  │                  │                  │
│        ▼                  ▼                  ▼                  │
│  Score submission   File uploads      Demo browsing            │
│  Confirmation       URL linking       Demo selection           │
│  Dispute flow       Demo upload       Stats display            │
│                     Validation        Public catalog           │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Match Detail Page Layout

All three features integrate into the Match Detail Page. Here's the canonical layout:

```
┌─────────────────────────────────────────────────────────────────┐
│ MATCH HEADER                                                    │
│ ┌─────────────────────────────────────────────────────────────┐ │
│ │ [Logo] Team Alpha        2 - 1        Team Beta [Logo]      │ │
│ │        ─────────────────────────────────────────            │ │
│ │ Status: Completed │ Format: BO3 │ Scheduled: Dec 3, 2025    │ │
│ └─────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────┤
│ TABS: [Overview] [Maps] [Evidence] [Timeline]                   │
├───────────────────────────────────────────┬─────────────────────┤
│                                           │                     │
│  MAIN CONTENT AREA                        │  ACTION SIDEBAR     │
│  (changes based on tab)                   │  (for participants) │
│                                           │                     │
│  ┌─────────────────────────────────────┐  │  ┌───────────────┐  │
│  │                                     │  │  │ Result Panel  │  │
│  │  [Overview Tab]                     │  │  │               │  │
│  │  - Match details                    │  │  │ Submit/View   │  │
│  │  - Recent activity                  │  │  │ scores with   │  │
│  │  - Quick stats                      │  │  │ evidence      │  │
│  │                                     │  │  │               │  │
│  │  [Maps Tab]                         │  │  └───────────────┘  │
│  │  - Veto results                     │  │                     │
│  │  - Per-map scores                   │  │  ┌───────────────┐  │
│  │                                     │  │  │ Quick Actions │  │
│  │  [Evidence Tab]           ◀── 03    │  │  │               │  │
│  │  - All evidence gallery             │  │  │ - Check-in    │  │
│  │  - Linked demos                     │  │  │ - Report      │  │
│  │  - Upload controls                  │  │  │ - etc         │  │
│  │                                     │  │  │               │  │
│  │  [Timeline Tab]                     │  │  └───────────────┘  │
│  │  - Status history                   │  │                     │
│  │  - Activity feed                    │  │                     │
│  │                                     │  │                     │
│  └─────────────────────────────────────┘  │                     │
│                                           │                     │
└───────────────────────────────────────────┴─────────────────────┘
```

## Component Architecture

### Shared Components (used by multiple features)

```
src/components/match/
├── evidence/                      # SHARED EVIDENCE COMPONENTS
│   ├── EvidenceAttachmentPanel.vue    # Main attachment UI (used in results & disputes)
│   ├── EvidenceTypeSelector.vue       # Tabs: Upload/Link/Demo/Browse
│   ├── EvidenceList.vue               # Display list of evidence items
│   ├── EvidenceCard.vue               # Single evidence item display
│   ├── EvidencePreview.vue            # Lightbox/preview modal
│   └── EvidenceUploadZone.vue         # Drag-drop upload area
│
├── demos/                         # SHARED DEMO COMPONENTS
│   ├── DemoSelector.vue               # Select demo from catalog (for evidence)
│   ├── DemoCard.vue                   # Demo display card
│   ├── DemoStatsPreview.vue           # Quick stats display
│   └── DemoPlayerList.vue             # Players in demo
│
├── results/                       # RESULT-SPECIFIC COMPONENTS
│   ├── ResultSubmissionPanel.vue      # Main result submission
│   ├── ResultConfirmationPanel.vue    # Review opponent's claim
│   ├── ResultDisputeModal.vue         # Dispute flow
│   ├── ScoreInput.vue                 # Score entry widget
│   └── ResultHistoryTimeline.vue      # Past submissions
│
└── MatchDetailPage.vue            # Main page orchestrating all
```

### Component Relationships

```
ResultSubmissionPanel.vue
    │
    ├── ScoreInput.vue
    │
    └── EvidenceAttachmentPanel.vue  ◀── SHARED
            │
            ├── EvidenceTypeSelector.vue
            │       │
            │       ├── [Tab: Upload] → EvidenceUploadZone.vue
            │       ├── [Tab: Link]   → EvidenceLinkForm.vue
            │       ├── [Tab: Demo]   → EvidenceUploadZone.vue (accepts .dem)
            │       └── [Tab: Browse] → DemoSelector.vue  ◀── CONNECTS TO CATALOG
            │
            └── EvidenceList.vue
                    │
                    └── EvidenceCard.vue (multiple)
```

## Store Architecture

### Store Relationships

```typescript
// Stores work together, not in isolation

┌─────────────────────────────────────────────────────────────────┐
│                         STORE LAYER                             │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  matchResults.ts                                                │
│  ├── currentResult: ResultClaim | null                         │
│  ├── resultHistory: ResultClaim[]                              │
│  │                                                              │
│  ├── submitResult(matchId, scores, evidenceIds[])  ◀── takes IDs│
│  ├── confirmResult(matchId, claimId)                           │
│  └── disputeResult(matchId, claimId, reason, evidenceIds[])    │
│              │                                                  │
│              │  passes evidence IDs                             │
│              ▼                                                  │
│  evidence.ts                                                    │
│  ├── matchEvidence: Evidence[]                                 │
│  ├── pendingUploads: Upload[]                                  │
│  │                                                              │
│  ├── uploadEvidence(matchId, file, type) → evidenceId          │
│  ├── linkUrl(matchId, url, type) → evidenceId                  │
│  ├── linkDemo(matchId, demoId) → evidenceId   ◀── from catalog │
│  └── deleteEvidence(matchId, evidenceId)                       │
│              │                                                  │
│              │  demoId comes from                               │
│              ▼                                                  │
│  demos.ts                                                       │
│  ├── demos: Demo[]                                             │
│  ├── currentDemo: Demo | null                                  │
│  ├── searchFilters: DemoFilters                                │
│  │                                                              │
│  ├── searchDemos(query, filters) → Demo[]                      │
│  ├── fetchDemo(demoId) → Demo                                  │
│  └── fetchDemoStats(demoId) → DemoStats                        │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

### Data Flow Example: Submit Result with Demo Evidence

```
User Action                    Store Method                  API Call
───────────────────────────────────────────────────────────────────────
1. Enter scores              → (local state)
2. Click "Browse Demos"      → demos.searchDemos()         → GET /v1/demos
3. Select demo               → (local selection)
4. Click "Attach"            → evidence.linkDemo(demoId)   → POST /v1/matches/{id}/evidence/link-demo
                             ← returns evidenceId
5. Click "Submit Result"     → results.submitResult(       → POST /v1/matches/{id}/result
                                scores, [evidenceId])
```

## API Integration Map

### Which endpoints belong to which feature:

```
PROMPT 01 (Match Results)
├── POST /v1/matches/{id}/result              # Submit claim
├── GET  /v1/matches/{id}/result              # Get current
├── GET  /v1/matches/{id}/result/history      # Get history
├── POST /v1/matches/{id}/result/{id}/confirm # Confirm
└── POST /v1/matches/{id}/result/{id}/dispute # Dispute

PROMPT 03 (Evidence System)
├── GET  /v1/matches/{id}/evidence            # List all
├── POST /v1/matches/{id}/evidence/upload     # Upload file
├── POST /v1/matches/{id}/evidence/link       # Link URL
├── POST /v1/matches/{id}/evidence/link-demo  # Link demo ◀── CONNECTS TO 06
├── POST /v1/matches/{id}/evidence/validate   # Validate
├── GET  /v1/matches/{id}/evidence/{id}       # Get one
├── DELETE /v1/matches/{id}/evidence/{id}     # Delete
├── GET  /v1/matches/{id}/evidence/discover   # Discover demos
└── POST /v1/matches/{id}/evidence/link-discovered  # Link discovered

PROMPT 06 (Demo Catalog)
├── GET  /v1/demos                            # Search/browse
├── GET  /v1/demos/{id}                       # Get details
├── GET  /v1/demos/{id}/players               # Get players
├── GET  /v1/demos/{id}/links                 # Get match links
├── GET  /v1/matches/{id}/demos               # Demos for match
└── Admin endpoints...
```

## UX Flow: Result Submission with Evidence

### Step-by-Step Flow

```
┌─────────────────────────────────────────────────────────────────┐
│ STEP 1: Open Result Panel                                       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Submit Match Result                                      │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  Map 1: de_inferno                                      │   │
│  │  Team Alpha [__13__]  -  [__16__] Team Beta             │   │
│  │                                                         │   │
│  │  Map 2: de_mirage                                       │   │
│  │  Team Alpha [__16__]  -  [__12__] Team Beta             │   │
│  │                                                         │   │
│  │  Map 3: de_nuke                                         │   │
│  │  Team Alpha [__16__]  -  [__14__] Team Beta             │   │
│  │                                                         │   │
│  │  ───────────────────────────────────────────────────    │   │
│  │  Series Winner: Team Alpha (2-1)                        │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2: Attach Evidence                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Attach Evidence (recommended)                            │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌────────────┐ │   │
│  │  │ Upload   │ │  Link    │ │  Demo    │ │  Browse    │ │   │
│  │  │ Image    │ │  URL     │ │  File    │ │  Demos     │ │   │
│  │  └──────────┘ └──────────┘ └──────────┘ └────────────┘ │   │
│  │       ▲                                       │         │   │
│  │       │                                       │         │   │
│  │  [Selected]                              [Opens Modal]  │   │
│  │                                                         │   │
│  │  ┌─────────────────────────────────────────────────┐   │   │
│  │  │  ╔═══════════════════════════════════════════╗  │   │   │
│  │  │  ║     Drag & drop image here               ║  │   │   │
│  │  │  ║          or click to browse              ║  │   │   │
│  │  │  ║                                          ║  │   │   │
│  │  │  ║     Accepts: PNG, JPG, WebP (max 10MB)   ║  │   │   │
│  │  │  ╚═══════════════════════════════════════════╝  │   │   │
│  │  └─────────────────────────────────────────────────┘   │   │
│  │                                                         │   │
│  │  Attached (2):                                          │   │
│  │  ┌────────────────────┐ ┌────────────────────┐         │   │
│  │  │ 📷 scoreboard.png  │ │ 🎬 match.dem       │         │   │
│  │  │ [Preview] [Remove] │ │ [View] [Remove]    │         │   │
│  │  └────────────────────┘ └────────────────────┘         │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │              [ Submit Result ]                           │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ STEP 2b: Browse Demos Modal (when "Browse Demos" clicked)       │
├─────────────────────────────────────────────────────────────────┤
│                                                                 │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ Select Demo                                         [X] │   │
│  ├─────────────────────────────────────────────────────────┤   │
│  │                                                         │   │
│  │  [🔍 Search...]  [Map: All ▼] [Date: Recent ▼]         │   │
│  │                                                         │   │
│  │  ── Suggested for this match ──────────────────────     │   │
│  │                                                         │   │
│  │  ┌─────────────────┐ ┌─────────────────┐               │   │
│  │  │ ▶ de_inferno    │ │ ▶ de_mirage     │               │   │
│  │  │ Dec 3, 10:30 PM │ │ Dec 3, 10:45 PM │               │   │
│  │  │ 45:23 duration  │ │ 38:15 duration  │               │   │
│  │  │ Alpha vs Beta   │ │ Alpha vs Beta   │               │   │
│  │  │                 │ │                 │               │   │
│  │  │ [Select]        │ │ [Select]        │               │   │
│  │  └─────────────────┘ └─────────────────┘               │   │
│  │                                                         │   │
│  │  ── All demos ─────────────────────────────────────     │   │
│  │                                                         │   │
│  │  ┌─────────────────┐ ┌─────────────────┐               │   │
│  │  │ ...more demos   │ │ ...             │               │   │
│  │  └─────────────────┘ └─────────────────┘               │   │
│  │                                                         │   │
│  │  [Load more...]                                         │   │
│  │                                                         │   │
│  └─────────────────────────────────────────────────────────┘   │
│                                                                 │
└─────────────────────────────────────────────────────────────────┘
```

## Implementation Phases

### Phase 1: Match Results (Prompt 01)
**Goal:** Result submission works with placeholder evidence UI

Implements:
- `ResultSubmissionPanel.vue` - full implementation
- `ScoreInput.vue` - full implementation
- `EvidenceAttachmentPanel.vue` - **SHELL ONLY**
  - Shows the 4-tab interface
  - "Upload Image" tab: shows upload zone but saves to local state only
  - Other tabs: show "Coming in next update" message
  - `attachedEvidence` stored locally, passed as empty array to API
- `ResultConfirmationPanel.vue` - full implementation
- `ResultDisputeModal.vue` - full implementation

**API Integration:**
- All `/v1/matches/{id}/result/*` endpoints
- Evidence attachment UI is visual only (no actual uploads)

### Phase 2: Evidence System (Prompt 03)
**Goal:** Full evidence functionality, integrates with results

Implements:
- `EvidenceAttachmentPanel.vue` - **COMPLETE IMPLEMENTATION**
  - "Upload Image" → actually uploads via API
  - "Link URL" → links external evidence
  - "Demo File" → uploads .dem files
  - "Browse Demos" → shows placeholder "Demo catalog coming soon"
- `EvidenceUploadZone.vue` - drag-drop with progress
- `EvidenceLinkForm.vue` - URL input with validation
- `EvidenceList.vue` - display attached evidence
- `EvidenceCard.vue` - individual evidence item
- `EvidencePreview.vue` - lightbox modal
- Evidence tab on Match Detail page

**Updates to Phase 1 components:**
- `ResultSubmissionPanel.vue` - now passes real evidenceIds to API
- `ResultDisputeModal.vue` - now can attach evidence to disputes

**API Integration:**
- All `/v1/matches/{id}/evidence/*` endpoints EXCEPT demo browser

### Phase 3: Demo Catalog (Prompt 06)
**Goal:** Demo browsing + integration as evidence source

Implements:
- `DemoSelector.vue` - **COMPLETES "Browse Demos" tab**
- `DemoCard.vue` - demo display
- `DemoStatsPreview.vue` - stats widget
- `DemoPlayerList.vue` - players in demo
- Standalone `DemosPage.vue` - public catalog
- Standalone `DemoDetailPage.vue` - single demo view

**Updates to Phase 2 components:**
- `EvidenceAttachmentPanel.vue` - "Browse Demos" tab now works
- Links to `/demos` page from various places

**API Integration:**
- All `/v1/demos/*` endpoints
- `/v1/matches/{id}/evidence/link-demo` (connects the systems)

## Shared Type Definitions

```typescript
// types/evidence.ts - SHARED ACROSS ALL THREE FEATURES

export type EvidenceType = 'screenshot' | 'external_link' | 'demo' | 'other'

export interface AttachedEvidence {
  id: string
  type: EvidenceType
  name: string
  url?: string       // For preview/download
  thumbnailUrl?: string
  uploadedAt: string
  uploadedBy: {
    id: string
    displayName: string
  }
}

export interface PendingUpload {
  localId: string    // Temporary ID before upload completes
  file: File
  type: EvidenceType
  progress: number   // 0-100
  status: 'pending' | 'uploading' | 'complete' | 'error'
  error?: string
}

// types/demo.ts - SHARED

export interface DemoSummary {
  id: string
  mapName: string
  mapThumbnail?: string
  recordedAt: string
  duration: number   // seconds
  teams?: {
    teamA: string
    teamB: string
  }
  score?: {
    teamA: number
    teamB: number
  }
}

export interface DemoDetails extends DemoSummary {
  players: DemoPlayer[]
  fileSize: number
  downloadUrl?: string
  linkedMatches: LinkedMatch[]
}
```

## Testing Strategy

Each phase must test integration with previous phases:

### Phase 1 Tests
- Result submission with mock evidence (UI only)
- Score validation
- Confirmation flow
- Dispute initiation

### Phase 2 Tests
- All Phase 1 tests still pass
- Evidence upload actually creates evidence records
- Evidence appears in Evidence tab
- Result submission includes real evidence IDs
- Evidence attached to disputes

### Phase 3 Tests
- All Phase 1 & 2 tests still pass
- Demo browsing works in evidence panel
- Demo selection creates evidence link
- Demo catalog page works standalone
- Demo linked to match shows in match evidence

## Key Design Decisions

1. **Evidence IDs, not objects**: Results store references evidence by ID, not by embedding evidence data. This keeps stores loosely coupled.

2. **Evidence panel is reusable**: Same `EvidenceAttachmentPanel` used in result submission AND dispute modal.

3. **Demo selector is modal**: "Browse Demos" opens a modal over the result form, doesn't navigate away.

4. **Progressive enhancement**: Each phase adds to the previous, never breaks existing functionality.

5. **Placeholder for unimplemented**: Tabs/features not yet implemented show clear "coming soon" rather than being hidden.
