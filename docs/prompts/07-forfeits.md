# Forfeit System Implementation

## Priority: LOWER (Admin Feature)

## Overview

Implement the **Forfeit System** that allows admins to forfeit matches when teams fail to show up, abandon matches, or violate rules. This includes single forfeits (one team loses) and double forfeits (both teams eliminated).

## IMPORTANT: Before Starting

**Think carefully about each step.** Forfeits have significant competitive impact. Consider:
- Clear confirmation before irreversible actions
- Proper audit trail
- Impact on bracket progression
- Player notification

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. Review forfeit-related schemas in `src/api/types.ts`

## Backend Endpoints to Integrate

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/admin/tournaments/{id}/matches/{id}/forfeit` | Forfeit single team |
| `POST` | `/v1/admin/tournaments/{id}/matches/{id}/double-forfeit` | DQ both teams |
| `POST` | `/v1/admin/tournaments/{id}/registrations/{id}/disqualify` | DQ from tournament |

**Note:** These are admin-only endpoints. Players cannot forfeit themselves through this system (they can withdraw from registration separately).

## Forfeit Types

1. **Single Forfeit**: One team forfeits, opponent wins
   - No-show after scheduled time
   - Abandonment during match
   - Rule violation

2. **Double Forfeit**: Both teams eliminated
   - Both teams no-show
   - Mutual rule violations
   - Match cannot proceed for any reason

## Implementation Tasks

### 1. Update Existing Stores

This feature can be added to the `tournaments.ts` store or a new admin store:

```typescript
// In tournaments.ts or new adminMatches.ts

// Actions
- forfeitMatch(tournamentId: string, matchId: string, request: ForfeitRequest)
- doubleForfeitMatch(tournamentId: string, matchId: string, request: DoubleForfeitRequest)
- disqualifyRegistration(tournamentId: string, registrationId: string, request: DisqualifyRequest)
```

### 2. Create Vue Components

#### `src/components/admin/ForfeitModal.vue`

Modal for admin to forfeit a match:
- Match context display (teams, tournament)
- Select which team forfeits (if single forfeit)
- Required reason textarea
- Warning about bracket impact
- Confirmation checkbox
- Submit/Cancel buttons

**Form Fields:**
- Forfeit type: Single / Double (radio)
- Team selector (if single forfeit)
- Reason (required)
- Evidence notes (optional)

#### `src/components/admin/ForfeitConfirmDialog.vue`

Confirmation dialog before executing forfeit:
- Summary of action
- List of consequences
- "I understand" checkbox
- Final confirm button

#### `src/components/admin/MatchAdminActions.vue`

Admin actions panel for match management:
- Status transition buttons
- Schedule override
- **Forfeit button** ← Add this
- Progression controls

### 3. Integrate into Admin Pages

#### Admin Tournament Detail Page
- Add forfeit option to match admin actions
- Show forfeited matches with clear indicator

#### Admin Match Management
- Add "Forfeit Match" button
- Show forfeit reason if match is forfeited

### 4. E2E Tests: `e2e/forfeit.spec.ts`

```typescript
test.describe('Forfeit System', () => {
  test.describe('Single Forfeit', () => {
    test('admin can forfeit a team')
    test('forfeit requires reason')
    test('forfeit shows confirmation dialog')
    test('forfeit advances opponent in bracket')
    test('forfeited match shows forfeit indicator')
  })

  test.describe('Double Forfeit', () => {
    test('admin can double forfeit a match')
    test('double forfeit eliminates both teams')
    test('double forfeit handles bracket progression')
  })

  test.describe('Disqualification', () => {
    test('admin can disqualify registration')
    test('disqualification affects active matches')
  })

  test.describe('UI/UX', () => {
    test('forfeit button shows for admin on match')
    test('confirmation required before forfeit')
    test('forfeited matches clearly marked')
  })
})
```

### 5. Type Safety Checklist

- [ ] Forfeit request types from OpenAPI
- [ ] Forfeit reason validation
- [ ] Response types for forfeit actions

## File Structure

```
src/
  stores/
    tournaments.ts          # Update existing OR
    adminMatches.ts         # New admin store
  components/
    admin/
      ForfeitModal.vue           # Main forfeit modal
      ForfeitConfirmDialog.vue   # Confirmation dialog
      MatchAdminActions.vue      # Admin action panel (update)
  pages/
    admin/
      AdminTournamentDetailPage.vue  # Update existing
e2e/
  forfeit.spec.ts                # New test file
```

## Acceptance Criteria

1. Admins can forfeit single team
2. Admins can double forfeit match
3. Forfeit requires reason
4. Confirmation before execution
5. Bracket progression works correctly
6. Forfeited matches clearly displayed
7. E2E tests pass
8. No TypeScript errors

## UX Considerations

- Forfeits are serious - require multiple confirmations
- Show clear impact preview
- Use warning colors (red/orange)
- Include undo suggestion in confirmation (note: may not be possible)

## Notes

- Forfeits trigger bracket progression
- Connect to notification system
- Consider audit log display
- Double forfeit in finals = special case
- Test with various bracket positions
