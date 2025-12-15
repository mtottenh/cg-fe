# Match Lifecycle Enhancement Implementation

## Priority: MEDIUM (Completes Match Experience)

## Overview

Enhance the **Match Lifecycle** features to include status history timeline, match check-in flow, and admin match management controls. These features complete the match experience by providing full visibility into match state transitions.

## IMPORTANT: Before Starting

**Think carefully about each step.** Match lifecycle touches many parts of the system. Consider:
- How different states flow into each other
- What actions are available at each state
- Both player and admin perspectives
- Real-time updates during matches

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. Review match-lifecycle-related schemas in `src/api/types.ts`
4. Understand existing match display in `MatchDetailPage.vue`

## Backend Endpoints to Integrate

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/tournaments/{id}/matches/{id}/status` | Get current status |
| `GET` | `/v1/tournaments/{id}/matches/{id}/status-history` | Get status timeline |
| `POST` | `/v1/tournaments/{id}/matches/{id}/check-in` | Player/team check-in |
| `POST` | `/v1/admin/tournaments/{id}/matches/{id}/transition` | Force status transition |
| `POST` | `/v1/admin/tournaments/{id}/matches/{id}/schedule` | Admin schedule override |

## Match States

```
PENDING → SCHEDULED → CHECK_IN → VETO → PLAYING → COMPLETED
                ↓         ↓        ↓       ↓
             CANCELLED  NO_SHOW  FORFEIT  DISPUTED
```

Each state has:
- Allowed transitions
- Available actions
- Display requirements

## Implementation Tasks

### 1. Update/Create Store

Enhance `tournaments.ts` store or create dedicated `matchLifecycle.ts`:

```typescript
// State
- matchStatus: MatchStatusResponse | null
- statusHistory: MatchStatusLogResponse[]
- checkInStatus: CheckInStatusResponse | null
- loading: boolean
- error: string | null

// Actions
- fetchMatchStatus(tournamentId: string, matchId: string)
- fetchStatusHistory(tournamentId: string, matchId: string)
- checkIn(tournamentId: string, matchId: string)
- fetchCheckInStatus(tournamentId: string, matchId: string)

// Admin Actions
- transitionMatch(tournamentId: string, matchId: string, transition: MatchTransitionRequest)
- scheduleMatch(tournamentId: string, matchId: string, schedule: AdminScheduleRequest)
```

### 2. Create Vue Components

#### `src/components/match/MatchStatusBadge.vue`

Enhanced status badge with state details:
- Color-coded by status
- Icon per status
- Tooltip with timestamp
- Animated for transitional states

#### `src/components/match/MatchStatusTimeline.vue`

Visual timeline of match status changes:
- Vertical timeline layout
- Each status change as a node
- Timestamp for each change
- Actor (system/admin/player)
- Reason for transition

**Timeline Node:**
```
[Icon] Status Name
       Timestamp
       "Changed by: Admin/System"
       "Reason: Scheduled time reached"
```

#### `src/components/match/MatchCheckInPanel.vue`

Check-in panel for matches:
- Check-in deadline countdown
- Check-in status per team
- Check-in button for participants
- Visual indicators (green check, red X)

**States:**
- Awaiting check-in (show countdown)
- Checked in (show confirmation)
- Opponent pending (show waiting)
- Both checked in (show ready)
- Check-in missed (show no-show status)

#### `src/components/match/MatchCheckInButton.vue`

Check-in action button:
- Large, prominent button
- Loading state during check-in
- Success animation
- Disabled when not allowed

#### `src/components/match/MatchActionsPanel.vue`

Panel showing available actions based on state:
- Contextual actions per match state
- Clear labeling
- Disabled states with explanation

#### `src/components/admin/AdminMatchTransitionModal.vue`

Modal for admin to force state transition:
- Current state display
- Target state selector (only valid transitions)
- Required reason
- Confirmation

#### `src/components/admin/AdminMatchScheduleModal.vue`

Modal for admin schedule override:
- Date/time picker
- Notes field
- Notify participants checkbox
- Confirmation

### 3. Integrate into Match Detail Page

Major update to `src/pages/tournaments/MatchDetailPage.vue`:
- Add status timeline section
- Add check-in panel when applicable
- Show contextual actions
- Admin controls when authorized

**Page Structure:**
```
Match Header
├─ Teams & Score
├─ Status Badge
└─ Quick Actions

Main Content
├─ Match Info Tab
│  ├─ Details
│  ├─ Map Pool (if applicable)
│  └─ Schedule
├─ Timeline Tab          ← NEW
│  └─ Status Timeline
├─ Evidence Tab          ← From Evidence System
└─ Discussion Tab        ← Future

Sidebar (for participants)
├─ Check-in Panel        ← NEW (when applicable)
├─ Scheduling Panel      ← Existing
├─ Result Panel          ← From Results System
└─ Veto Panel           ← From Veto System
```

### 4. E2E Tests: `e2e/match-lifecycle.spec.ts`

```typescript
test.describe('Match Lifecycle', () => {
  test.describe('Status Display', () => {
    test('should display current match status')
    test('should show appropriate status badge color')
    test('should display status timestamp')
  })

  test.describe('Status Timeline', () => {
    test('should display status history')
    test('should show transitions chronologically')
    test('should include actor for each transition')
    test('should show reasons where applicable')
  })

  test.describe('Match Check-in', () => {
    test('should show check-in panel when in check-in state')
    test('should display check-in deadline countdown')
    test('participant can check in')
    test('should show check-in status for both teams')
    test('should indicate when both teams checked in')
    test('non-participant cannot check in')
  })

  test.describe('Admin Match Management', () => {
    test('admin can view transition options')
    test('admin can force status transition')
    test('admin can override schedule')
    test('transitions require reason')
  })

  test.describe('State-Based Actions', () => {
    test('pending match shows limited actions')
    test('scheduled match shows schedule info')
    test('check-in match shows check-in panel')
    test('playing match shows result submission')
    test('completed match shows results')
  })
})
```

### 5. Real-Time Considerations

For check-in specifically, consider polling:
```typescript
// Poll every 5 seconds during check-in phase
const CHECK_IN_POLL_INTERVAL = 5000

watch(matchStatus, (status) => {
  if (status?.status === 'check_in') {
    startPolling()
  } else {
    stopPolling()
  }
})
```

### 6. Type Safety Checklist

- [ ] Match status enum complete
- [ ] Status history response typed
- [ ] Check-in status typed
- [ ] Transition request typed
- [ ] All timestamps as proper Date handling

## File Structure

```
src/
  stores/
    matchLifecycle.ts              # New or update tournaments.ts
  components/
    match/
      MatchStatusBadge.vue         # Enhanced badge
      MatchStatusTimeline.vue      # Status history
      MatchCheckInPanel.vue        # Check-in UI
      MatchCheckInButton.vue       # Check-in action
      MatchActionsPanel.vue        # Contextual actions
    admin/
      AdminMatchTransitionModal.vue  # Force transition
      AdminMatchScheduleModal.vue    # Schedule override
  pages/
    tournaments/
      MatchDetailPage.vue          # Major update
e2e/
  match-lifecycle.spec.ts          # New test file
```

## Acceptance Criteria

1. Match status displays correctly for all states
2. Status timeline shows full history
3. Check-in works for participants
4. Check-in countdown displays accurately
5. Admin can force transitions
6. Admin can override schedule
7. Actions are contextual to state
8. E2E tests pass
9. No TypeScript errors
10. Real-time feel during check-in

## UX Considerations

- Status should be immediately clear
- Check-in should feel urgent (countdown)
- Timeline provides transparency
- Mobile-friendly check-in (often done on phone)
- Clear indication of "what to do next"

## Notes

- Check-in timing is critical for tournaments
- Consider time zone handling for schedules
- Admin transitions should be audited
- Connect to notification system for check-in reminders
- Test with various tournament types (scheduled vs self-scheduled)
