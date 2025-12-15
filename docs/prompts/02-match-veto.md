# Match Veto System Implementation (Map Pick/Ban)

## Priority: HIGH (Core Match Experience)

## Overview

Implement the **Match Veto System** that allows teams to pick and ban maps in competitive matches. This is essential for CS2 and other competitive games that use map veto processes. The system handles coin flips, alternating picks/bans, and side selection.

## IMPORTANT: Before Starting

**Think carefully about each step.** This is a complex feature with real-time state that affects competitive fairness. Consider:
- The step-by-step veto workflow
- Whose turn it is at each phase
- How to handle timeouts/defaults
- Clear visual feedback for each action

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. Review the veto-related schemas in `src/api/types.ts`
4. Understand the game's map pool (fetched from `/v1/games/{game_id}/maps`)

## Backend Endpoints to Integrate

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/matches/{match_id}/veto` | Create a veto session |
| `GET` | `/v1/matches/{match_id}/veto` | Get current veto state |
| `POST` | `/v1/matches/{match_id}/veto/start` | Start the veto process |
| `POST` | `/v1/matches/{match_id}/veto/coin-flip` | Perform coin flip for first pick |
| `POST` | `/v1/matches/{match_id}/veto/action` | Execute a pick/ban action |
| `POST` | `/v1/matches/{match_id}/veto/side` | Select starting side (CT/T) |

## Veto Flow Understanding

The veto system typically follows this pattern (varies by format):

**BO1 (Best of 1):**
1. Coin flip determines who bans first
2. Alternating bans until 1 map remains
3. Loser of coin flip picks starting side

**BO3 (Best of 3):**
1. Coin flip determines order
2. Team A bans, Team B bans
3. Team A picks Map 1, Team B picks side
4. Team B picks Map 2, Team A picks side
5. Remaining map is decider, coin flip winner picks side

**BO5 (Best of 5):**
1. Similar pattern with more picks

## Implementation Tasks

### 1. Create Pinia Store: `src/stores/vetoSessions.ts`

```typescript
// State
- session: VetoSessionResponse | null
- currentStep: VetoStep | null  // computed from session
- loading: boolean
- error: string | null
- coinFlipResult: CoinFlipResult | null

// Actions
- fetchVetoSession(matchId: string)
- createVetoSession(matchId: string)
- startVeto(matchId: string)
- performCoinFlip(matchId: string)
- executeAction(matchId: string, action: VetoActionRequest) // ban/pick
- selectSide(matchId: string, request: SideSelectionRequest)
- clear()
- $reset()

// Getters/Computed
- isMyTurn: boolean
- currentAction: 'ban' | 'pick' | 'side' | null
- availableMaps: Map[]
- selectedMaps: SelectedMap[]
- vetoComplete: boolean
```

**Important considerations:**
- Track whose turn it is based on veto sequence
- Handle timeout scenarios
- Provide clear state about what action is expected
- Consider polling or WebSocket for real-time updates (polling first, can enhance later)

### 2. Create Vue Components

#### `src/components/match/VetoPanel.vue`

Main container component for the entire veto workflow:
- Shows different sub-components based on veto state
- Handles loading/error states
- Coordinates between phases (coin flip → veto → side selection)

**States to handle:**
- No veto session (show "Start Veto" for authorized users)
- Awaiting coin flip
- Veto in progress (show MapVetoBoard)
- Awaiting side selection
- Veto complete (show final map selection)

#### `src/components/match/CoinFlipModal.vue`

Animated coin flip modal:
- Visual coin flip animation
- Reveals which team won the flip
- Shows what winning/losing team gets to do
- Auto-proceeds after a delay

**UX Tip:** Make this feel exciting - it's a key competitive moment!

#### `src/components/match/MapVetoBoard.vue`

The main map pick/ban interface:
- Display all maps in the game's map pool
- Visual states: available, banned (crossed out), picked (highlighted)
- Clear indication of whose turn it is
- Timer showing time remaining for action
- Action buttons: "Ban This Map" / "Pick This Map"
- History log of actions taken

**Props:**
- `maps: Map[]` - Available maps from game config
- `session: VetoSessionResponse`
- `isMyTurn: boolean`
- `currentAction: 'ban' | 'pick'`

**Visual Design:**
- Grid layout of map cards with images
- Clear banned/picked visual states
- Pulsing highlight on current team's turn
- Action log sidebar

#### `src/components/match/MapCard.vue`

Individual map display card:
- Map image/thumbnail
- Map name
- State indicator (available/banned/picked)
- Click handler for selection
- Disabled state when not selectable

#### `src/components/match/SideSelector.vue`

Side selection component (CT/T for CS2):
- Shows which map(s) need side selection
- Two buttons: CT / T (or equivalent for other games)
- Brief explanation of what each side means
- Disable after selection

#### `src/components/match/VetoHistoryLog.vue`

Sidebar/timeline showing veto actions:
- Each action with team name, action type, map name
- Timestamps
- Visual distinction between bans (red) and picks (green)
- Side selections

#### `src/components/match/VetoSummary.vue`

Final summary shown after veto completion:
- List of maps to be played in order
- Starting sides for each map
- Ready-to-play status

### 3. Integrate into Match Detail Page

Update `src/pages/tournaments/MatchDetailPage.vue`:
- Import `VetoPanel`
- Fetch veto state on mount
- Show panel when match is in veto phase
- Consider auto-refresh/polling during veto

### 4. E2E Tests: `e2e/match-veto.spec.ts`

```typescript
test.describe('Match Veto System', () => {
  // Note: Testing veto requires careful state setup

  test.describe('Veto Session Creation', () => {
    test('admin can create veto session for scheduled match')
    test('cannot create veto for match not in correct state')
  })

  test.describe('Coin Flip', () => {
    test('should display coin flip modal')
    test('coin flip should determine veto order')
    test('result should be displayed clearly')
  })

  test.describe('Map Ban/Pick Process', () => {
    test('should show available maps from game pool')
    test('should indicate current team turn')
    test('should allow banning a map when its your turn')
    test('should visually mark banned maps')
    test('should allow picking a map when its your turn')
    test('should prevent actions when not your turn')
    test('should show action history log')
  })

  test.describe('Side Selection', () => {
    test('should prompt for side selection after map pick')
    test('should allow selecting CT or T side')
    test('side selection should complete for that map')
  })

  test.describe('Veto Completion', () => {
    test('should show final map selection summary')
    test('should display starting sides for each map')
    test('completed veto should persist on page reload')
  })

  test.describe('Edge Cases', () => {
    test('should handle timeout gracefully')
    test('should show error for unauthorized veto actions')
    test('non-participants should see read-only veto view')
  })
})
```

**Test Setup Considerations:**
- Create test match in veto-ready state
- May need to mock coin flip for deterministic tests
- Consider testing with two browser contexts (two teams)

### 5. Polling/Real-time Updates

For MVP, implement polling:
```typescript
// In VetoPanel.vue
const POLL_INTERVAL = 3000 // 3 seconds

onMounted(() => {
  fetchVetoSession()
  if (!vetoComplete.value) {
    pollInterval = setInterval(fetchVetoSession, POLL_INTERVAL)
  }
})

onUnmounted(() => {
  if (pollInterval) clearInterval(pollInterval)
})
```

Future enhancement: WebSocket for instant updates.

### 6. Type Safety Checklist

- [ ] All veto actions use generated request/response types
- [ ] Map pool uses game's Map type
- [ ] Veto sequence properly typed
- [ ] No `any` types

### 7. Game-Agnostic Design

While implementing for CS2 first:
- Map pool comes from game configuration
- Side selection terminology should be configurable
- Veto sequence comes from match format configuration
- Keep game-specific logic minimal

## File Structure

```
src/
  stores/
    vetoSessions.ts           # New store
  components/
    match/
      VetoPanel.vue           # Main container
      CoinFlipModal.vue       # Coin flip animation
      MapVetoBoard.vue        # Main pick/ban interface
      MapCard.vue             # Individual map card
      SideSelector.vue        # CT/T selection
      VetoHistoryLog.vue      # Action timeline
      VetoSummary.vue         # Final results
  pages/
    tournaments/
      MatchDetailPage.vue     # Update existing
e2e/
  match-veto.spec.ts          # New test file
```

## Acceptance Criteria

1. Teams can perform coin flip to determine veto order
2. Teams can ban/pick maps according to match format
3. Side selection works for picked maps
4. Veto history is visible and clear
5. Final map lineup displayed after completion
6. Non-participants see read-only view
7. E2E tests pass
8. No TypeScript errors
9. Responsive design works on tablet/mobile

## Visual Design Notes

- Map images should be clear and recognizable
- Use color coding: red for bans, green for picks, blue for current turn
- Animate transitions between states
- Consider dark mode compatibility
- Timer should be prominent when time is running low

## Notes

- This is a complex feature - break it into phases if needed
- Consider the competitive integrity: no UI should give unfair advantage
- Test with actual CS2 map pool
- The veto process is often time-sensitive, ensure good performance
