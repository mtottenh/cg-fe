# Admin Progression Controls Implementation

## Priority: LOWER (Admin Edge Cases)

## Overview

Implement **Admin Progression Controls** that allow admins to manually manage bracket progression when automated progression fails or needs correction. This includes reverting completed matches, reprocessing progression, and manually advancing teams.

## IMPORTANT: Before Starting

**Think carefully about each step.** These are powerful admin tools that can significantly impact tournament state. Consider:
- These actions can break tournament integrity if misused
- Multiple confirmation steps required
- Clear audit trail essential
- Rarely needed but critical when they are

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. Review progression-related schemas in `src/api/types.ts`
4. Understand bracket/match progression logic

## Backend Endpoints to Integrate

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/matches/{match_id}/progression` | Get progression state |
| `POST` | `/v1/admin/matches/{match_id}/progression/revert` | Revert progression |
| `POST` | `/v1/admin/matches/{match_id}/progression/reapply` | Reapply progression |
| `POST` | `/v1/admin/matches/{match_id}/progression/process` | Force process |

## Use Cases

1. **Revert Progression**: Undo advancement when result was incorrect
2. **Reapply Progression**: Re-run progression logic after fix
3. **Process Progression**: Manually trigger when auto-process failed

## When These Are Needed

- Dispute overturned a result after progression occurred
- Bug in progression logic required manual intervention
- Admin needs to correct seeding error
- Recovery from system failure

## Implementation Tasks

### 1. Create/Update Store

Add to existing admin store or create new:

```typescript
// State
- progressionState: ProgressionStateResponse | null
- progressionLoading: boolean
- progressionError: string | null

// Actions
- fetchProgressionState(matchId: string)
- revertProgression(matchId: string, reason: string)
- reapplyProgression(matchId: string, reason: string)
- processProgression(matchId: string, options?: ProcessOptions)
```

### 2. Create Vue Components

#### `src/components/admin/ProgressionControlsPanel.vue`

Admin panel for progression management:
- Current progression state display
- Affected matches list
- Action buttons with confirmations
- Warning banners

**Sections:**
1. **Current State**: Show where winner progressed to
2. **Affected Matches**: List of matches that would change
3. **Actions**: Revert, Reapply, Process buttons
4. **Audit Log**: Recent progression changes

#### `src/components/admin/ProgressionStateDisplay.vue`

Visual display of progression state:
- Source match
- Target match (where winner went)
- Progression timestamp
- Status (completed, pending, reverted)

#### `src/components/admin/ProgressionActionModal.vue`

Modal for executing progression actions:
- Action type (revert/reapply/process)
- Impact preview
- Required reason
- Multiple confirmations
- Execute button

**Warning Levels:**
- Revert: HIGH - affects future matches
- Reapply: MEDIUM - recalculates based on current result
- Process: LOW - just triggers pending progression

#### `src/components/admin/ProgressionImpactPreview.vue`

Preview of what will change:
- Matches affected
- Teams moved
- Bracket state changes
- Standings impact

### 3. Integrate into Admin Pages

#### Admin Match Detail
- Add progression controls panel
- Show progression history
- Quick action buttons

#### Admin Tournament Overview
- Progression issues indicator
- Link to affected matches

### 4. E2E Tests: `e2e/progression-controls.spec.ts`

```typescript
test.describe('Admin Progression Controls', () => {
  test.describe('Progression State', () => {
    test('should display current progression state')
    test('should show target match for winner')
    test('should indicate progression status')
  })

  test.describe('Revert Progression', () => {
    test('admin can view revert impact preview')
    test('admin can revert progression with reason')
    test('revert removes winner from next match')
    test('revert requires multiple confirmations')
  })

  test.describe('Reapply Progression', () => {
    test('admin can reapply progression')
    test('reapply uses current result')
    test('reapply updates target match')
  })

  test.describe('Process Progression', () => {
    test('admin can force process pending progression')
    test('process handles edge cases')
  })

  test.describe('Safety', () => {
    test('shows clear warnings for dangerous actions')
    test('requires reason for all actions')
    test('logs all progression changes')
  })
})
```

### 5. Type Safety Checklist

- [ ] Progression state response typed
- [ ] Action request types
- [ ] Impact preview types

## File Structure

```
src/
  stores/
    adminProgression.ts           # New store (or add to existing)
  components/
    admin/
      ProgressionControlsPanel.vue    # Main control panel
      ProgressionStateDisplay.vue     # State visualization
      ProgressionActionModal.vue      # Action execution
      ProgressionImpactPreview.vue    # Impact preview
  pages/
    admin/
      AdminMatchDetailPage.vue    # Update/create
e2e/
  progression-controls.spec.ts    # New test file
```

## Acceptance Criteria

1. Admins can view progression state
2. Admins can revert progression
3. Admins can reapply progression
4. Admins can force process progression
5. All actions require reason
6. Clear impact preview before action
7. Multiple confirmations for dangerous actions
8. E2E tests pass
9. No TypeScript errors

## UX Considerations

- These are "break glass" features - make them feel serious
- Use red/warning colors
- Require typing confirmation text for dangerous actions
- Show full impact before execution
- Consider "dry run" mode

## Safety Features

```typescript
// Example confirmation pattern
const CONFIRMATION_TEXT = 'REVERT PROGRESSION'

function confirmRevert() {
  const input = await promptForText('Type "REVERT PROGRESSION" to confirm')
  if (input !== CONFIRMATION_TEXT) {
    throw new Error('Confirmation text did not match')
  }
}
```

## Notes

- These are admin-only emergency features
- May need to lock tournament during operations
- Consider timeout on progression operations
- Always show what will change before executing
- Log everything for audit purposes
