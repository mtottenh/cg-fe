# Dispute System Implementation

## Priority: MEDIUM (Admin & Moderation)

## Overview

Implement the **Dispute System** that allows players to dispute match results and admins to review and resolve disputes. This is essential for conflict resolution and maintaining competitive integrity.

## IMPORTANT: Before Starting

**Think carefully about each step.** Disputes are sensitive - they affect competitive standings and player experience. Consider:
- Clear communication of dispute status
- Fair resolution process
- Audit trail for all actions
- Both player and admin perspectives

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. Review dispute-related schemas in `src/api/types.ts`
4. This feature depends on Match Results and Evidence systems

## Backend Endpoints to Integrate

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/tournaments/{id}/matches/{id}/dispute` | Raise a dispute |
| `GET` | `/v1/disputes/{dispute_id}` | Get dispute details |
| `POST` | `/v1/disputes/{dispute_id}/messages` | Add message to dispute thread |

### Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/admin/disputes` | List all disputes (filterable) |
| `POST` | `/v1/admin/disputes/{id}/messages` | Admin message to dispute |
| `POST` | `/v1/admin/disputes/{id}/assign` | Assign dispute to admin |
| `POST` | `/v1/admin/disputes/{id}/resolve/uphold` | Uphold original result |
| `POST` | `/v1/admin/disputes/{id}/resolve/overturn` | Overturn result |
| `POST` | `/v1/admin/disputes/{id}/resolve/rematch` | Order a rematch |
| `POST` | `/v1/admin/disputes/{id}/resolve/adjusted` | Apply adjusted score |
| `POST` | `/v1/admin/disputes/{id}/resolve/double-dq` | DQ both parties |

## Dispute Lifecycle

```
RAISED → UNDER_REVIEW → [Resolution]
                       ├─ UPHELD (original result stands)
                       ├─ OVERTURNED (result reversed)
                       ├─ REMATCH (match replayed)
                       ├─ ADJUSTED (modified score)
                       └─ DOUBLE_DQ (both disqualified)
```

## Implementation Tasks

### 1. Create Pinia Store: `src/stores/disputes.ts`

```typescript
// State
- disputes: DisputeResponse[] // for admin list
- currentDispute: DisputeResponse | null
- messages: DisputeMessageResponse[]
- loading: boolean
- error: string | null

// Actions - Player
- raiseDispute(tournamentId: string, matchId: string, request: RaiseDisputeRequest)
- fetchDispute(disputeId: string)
- addMessage(disputeId: string, message: string)

// Actions - Admin
- fetchAllDisputes(filters?: DisputeFilters)
- assignDispute(disputeId: string, adminId: string)
- addAdminMessage(disputeId: string, message: string, internal?: boolean)
- resolveUphold(disputeId: string, reason: string)
- resolveOverturn(disputeId: string, newWinnerId: string, reason: string)
- resolveRematch(disputeId: string, reason: string)
- resolveAdjusted(disputeId: string, adjustedScores: ScoreAdjustment, reason: string)
- resolveDoubleDq(disputeId: string, reason: string)

// Utility
- clear()
- $reset()
```

### 2. Create Vue Components

#### `src/components/dispute/RaiseDisputeModal.vue`

Modal for players to raise a dispute:
- Clear explanation of dispute process
- Required: Reason/description textarea
- Optional: Link to evidence
- Checkbox: "I understand this will be reviewed by admins"
- Warning about false disputes

**Form Fields:**
- Reason (required, min 50 chars)
- Evidence references (optional, multi-select from match evidence)
- Category (result disagreement, cheating, technical issue)

#### `src/components/dispute/DisputePanel.vue`

Panel shown on match detail page for disputed matches:
- Dispute status badge
- Summary of dispute reason
- Link to full dispute thread
- Resolution status if resolved

#### `src/components/dispute/DisputeMessageThread.vue`

Threaded conversation display:
- Messages from both parties
- Admin messages (highlighted differently)
- Internal admin notes (admin-only, different styling)
- Timestamps
- Message input at bottom

**Message Types:**
- Player message
- Admin public message
- Admin internal note (only visible to admins)

#### `src/components/dispute/DisputeStatusBadge.vue`

Status indicator component:
- Color-coded by status
- Icon per status
- Tooltip with status explanation

#### `src/components/admin/AdminDisputeCard.vue`

Card for dispute list in admin panel:
- Match info (teams, tournament)
- Dispute reason preview
- Status badge
- Assigned admin
- Created date
- Priority indicator
- Quick actions

#### `src/components/admin/DisputeResolutionModal.vue`

Modal for admin resolution:
- Resolution type selector (tabs or radio)
- Type-specific form fields:
  - **Uphold**: Just reason
  - **Overturn**: Select new winner, reason
  - **Rematch**: Reason, optional new schedule
  - **Adjusted**: Score inputs, reason
  - **Double DQ**: Reason
- Required resolution reason
- Preview of impact
- Confirmation step

### 3. Create Pages

#### `src/pages/disputes/DisputeDetailPage.vue`

Full dispute detail page:
- Match context (teams, score, tournament)
- Dispute information
- Evidence gallery
- Message thread
- Resolution panel (for admins)
- Status timeline

**Route:** `/disputes/:disputeId`

#### `src/pages/admin/AdminDisputesPage.vue`

Admin disputes management page:
- Filterable list of disputes
- Status filter (open, assigned to me, resolved)
- Tournament filter
- Search
- Pagination
- Quick assignment

**Route:** `/admin/disputes`

### 4. Integrate into Existing Pages

#### Match Detail Page
- Show dispute status if match is disputed
- Add "Dispute Result" button when applicable
- Link to dispute detail

#### Admin Dashboard
- Disputes count/alert widget
- Quick link to disputes needing attention

### 5. E2E Tests: `e2e/dispute.spec.ts`

```typescript
test.describe('Dispute System', () => {
  test.describe('Raising Disputes', () => {
    test('participant can raise dispute for match')
    test('non-participant cannot raise dispute')
    test('cannot dispute already disputed match')
    test('dispute reason is required')
    test('can link evidence to dispute')
  })

  test.describe('Dispute Communication', () => {
    test('disputant can add messages to thread')
    test('opponent can add messages to thread')
    test('message thread shows all messages chronologically')
  })

  test.describe('Admin Dispute Management', () => {
    test('admin can view all disputes')
    test('admin can filter disputes by status')
    test('admin can assign dispute to self')
    test('admin can add public message')
    test('admin can add internal note')
  })

  test.describe('Dispute Resolution', () => {
    test('admin can uphold original result')
    test('admin can overturn result')
    test('admin can order rematch')
    test('admin can apply adjusted scores')
    test('admin can double DQ both parties')
    test('resolution updates match state correctly')
  })

  test.describe('Dispute Detail Page', () => {
    test('shows match context')
    test('shows dispute reason and evidence')
    test('shows message thread')
    test('shows resolution status for resolved disputes')
  })
})
```

### 6. Notifications (Optional Enhancement)

Consider adding notifications for:
- New dispute raised (to admins)
- Dispute assigned (to assigned admin)
- New message in dispute (to all parties)
- Dispute resolved (to disputants)

### 7. Type Safety Checklist

- [ ] Resolution types properly enumerated
- [ ] Message types distinguish player/admin/internal
- [ ] Filter types for admin list
- [ ] All API responses typed

## File Structure

```
src/
  stores/
    disputes.ts                    # New store
  components/
    dispute/
      RaiseDisputeModal.vue        # Player raises dispute
      DisputePanel.vue             # Match page panel
      DisputeMessageThread.vue     # Conversation thread
      DisputeStatusBadge.vue       # Status indicator
    admin/
      AdminDisputeCard.vue         # List item card
      DisputeResolutionModal.vue   # Resolution form
  pages/
    disputes/
      DisputeDetailPage.vue        # Full detail page
    admin/
      AdminDisputesPage.vue        # Admin list page
    tournaments/
      MatchDetailPage.vue          # Update existing
e2e/
  dispute.spec.ts                  # New test file
```

## Acceptance Criteria

1. Players can raise disputes with required reason
2. Players and admins can communicate via message thread
3. Admins can view and filter all disputes
4. Admins can assign disputes
5. All 5 resolution types work correctly
6. Resolution updates match state appropriately
7. E2E tests pass
8. No TypeScript errors
9. Clear UI for dispute status throughout

## UX Considerations

- Disputes are stressful for players - use calm, professional tone
- Admin interface should be efficient for high volume
- Clear explanation of what each resolution means
- Confirmation before irreversible actions
- Consider dispute deadline/expiration

## Notes

- This connects to Match Results (disputes on results)
- This connects to Evidence (evidence linked to disputes)
- Resolution may trigger progression changes
- Consider audit logging for all dispute actions
- Test with edge cases (resolved match, already progressed bracket)
