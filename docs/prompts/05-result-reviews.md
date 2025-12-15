# Result Reviews System Implementation

## Priority: MEDIUM (Admin & Moderation)

## Overview

Implement the **Result Reviews System** that allows admins to review flagged match results before they are finalized. This provides an additional layer of verification for matches that meet certain criteria (e.g., unusual scores, important matches, flagged patterns).

## IMPORTANT: Before Starting

**Think carefully about each step.** Result reviews are a quality control mechanism. Consider:
- Why certain results get flagged for review
- Admin workflow efficiency
- Impact on match progression timing
- Player notification of review status

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. Review result-review-related schemas in `src/api/types.ts`
4. Understand Match Results system (prerequisite feature)

## Backend Endpoints to Integrate

### Public Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/matches/{match_id}/result-review` | Get review status for match |
| `POST` | `/v1/matches/{match_id}/result-review/acknowledge` | Player acknowledges review |

### Admin Endpoints
| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/v1/admin/result-reviews` | List pending reviews |
| `GET` | `/v1/admin/result-reviews/{review_id}` | Get review details |
| `POST` | `/v1/admin/result-reviews/{review_id}/approve` | Approve result |
| `POST` | `/v1/admin/result-reviews/{review_id}/reject` | Reject result |

## Review Lifecycle

```
RESULT_SUBMITTED → FLAGGED_FOR_REVIEW → PENDING_REVIEW
                                              ↓
                                       [Admin Action]
                                        ├─ APPROVED → Match proceeds
                                        └─ REJECTED → Result reverted, new submission needed
```

## Why Results Get Flagged

The backend may flag results for review based on:
- Unusual score patterns (e.g., 16-0 in competitive)
- High-stakes matches (finals, semifinals)
- Missing evidence
- Discrepancy between team submissions
- Admin-configured rules

## Implementation Tasks

### 1. Create Pinia Store: `src/stores/resultReviews.ts`

```typescript
// State
- pendingReviews: ResultReviewResponse[] // admin list
- currentReview: ResultReviewResponse | null
- matchReviewStatus: ResultReviewStatus | null // for player view
- loading: boolean
- error: string | null

// Actions - Player
- fetchMatchReviewStatus(matchId: string)
- acknowledgeReview(matchId: string)

// Actions - Admin
- fetchPendingReviews(filters?: ReviewFilters)
- fetchReviewDetails(reviewId: string)
- approveResult(reviewId: string, notes?: string)
- rejectResult(reviewId: string, reason: string)

// Utility
- clear()
- $reset()
```

### 2. Create Vue Components

#### `src/components/match/ResultReviewBanner.vue`

Banner shown on match detail when result is under review:
- Clear "Under Review" status
- Explanation of what this means
- Expected timeline (if available)
- Acknowledge button for participants

**Visual:** Yellow/orange warning banner, not alarming but clear.

#### `src/components/match/ResultReviewStatus.vue`

Status indicator for review state:
- Icon and text
- Timestamp of when review started
- Reason for flagging (if known)

#### `src/components/admin/ResultReviewCard.vue`

Card for admin review list:
- Match info (teams, score, tournament)
- Flag reason
- Time since flagged
- Evidence preview
- Quick action buttons (Approve/Reject)

#### `src/components/admin/ResultReviewDetailModal.vue`

Detailed review modal for admins:
- Full match details
- Submitted result with scores
- Evidence attached
- Flag reason explanation
- Player acknowledgment status
- Approve/Reject forms
- Notes field for decision

**Tabs/Sections:**
1. Match Overview
2. Result Details
3. Evidence
4. Decision

#### `src/components/admin/ResultReviewFilters.vue`

Filter controls for admin list:
- Status (pending, approved, rejected)
- Tournament selector
- Date range
- Flag reason type

### 3. Create Pages

#### `src/pages/admin/AdminResultReviewsPage.vue`

Admin result reviews management page:
- Summary stats (pending count, avg review time)
- Filterable list of reviews
- Bulk actions (if applicable)
- Pagination

**Route:** `/admin/result-reviews`

### 4. Integrate into Existing Pages

#### Match Detail Page
- Show `ResultReviewBanner` when match is under review
- Update result submission panel to show review status
- Disable certain actions during review

#### Admin Dashboard
- Add pending reviews count widget
- Quick link to reviews page

### 5. E2E Tests: `e2e/result-review.spec.ts`

```typescript
test.describe('Result Review System', () => {
  test.describe('Player View', () => {
    test('should show review banner when result under review')
    test('should explain what review means')
    test('participant can acknowledge review')
    test('should show approved status after approval')
    test('should show rejected status with reason after rejection')
  })

  test.describe('Admin Review List', () => {
    test('should display pending reviews')
    test('should filter by status')
    test('should filter by tournament')
    test('should show review count badge')
  })

  test.describe('Admin Review Actions', () => {
    test('admin can view review details')
    test('admin can approve result')
    test('admin can reject result with reason')
    test('approval progresses match normally')
    test('rejection reverts result to pending')
  })

  test.describe('Review Flow Integration', () => {
    test('flagged result appears in review queue')
    test('approved result allows match progression')
    test('rejected result requires new submission')
  })
})
```

### 6. Type Safety Checklist

- [ ] Review status enum properly typed
- [ ] Filter types for admin list
- [ ] Action request/response types
- [ ] Flag reason types

## File Structure

```
src/
  stores/
    resultReviews.ts              # New store
  components/
    match/
      ResultReviewBanner.vue      # Player-facing banner
      ResultReviewStatus.vue      # Status indicator
    admin/
      ResultReviewCard.vue        # List item card
      ResultReviewDetailModal.vue # Detailed review view
      ResultReviewFilters.vue     # Filter controls
  pages/
    admin/
      AdminResultReviewsPage.vue  # Admin list page
    tournaments/
      MatchDetailPage.vue         # Update existing
e2e/
  result-review.spec.ts           # New test file
```

## Acceptance Criteria

1. Players see clear indication when their result is under review
2. Players can acknowledge review status
3. Admins can view all pending reviews
4. Admins can filter/search reviews
5. Admins can approve results with optional notes
6. Admins can reject results with required reason
7. Approval triggers normal match progression
8. Rejection reverts to awaiting result
9. E2E tests pass
10. No TypeScript errors

## UX Considerations

- Reviews should not feel punitive to players
- Clear explanation of why reviews happen
- Admin interface optimized for quick processing
- Show evidence inline for fast decisions
- Keyboard shortcuts for approve/reject (optional enhancement)

## Notes

- This is a moderation feature, prioritize admin efficiency
- Consider SLA for review completion
- Connect to notification system for status updates
- May need to handle edge case: review timeout
- Test with various flag reasons
