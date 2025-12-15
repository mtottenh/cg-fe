# Frontend Feature Implementation Prompts

This directory contains detailed prompts for Claude Code sessions to implement missing frontend features identified in the API gap analysis.

## How to Use These Prompts

1. Start a new Claude Code session in the `/web` directory
2. Copy the contents of the relevant prompt file
3. Paste as the initial prompt for the session
4. Let Claude work through the implementation tasks

## Important Notes for All Sessions

Before starting any implementation:

1. **Regenerate OpenAPI Types**: Run `npm run generate:api` to ensure types are current
2. **Backend Running**: Ensure the API is running at `http://localhost:3000`
3. **Think Carefully**: Each prompt instructs Claude to think through edge cases
4. **No Shortcuts**: Follow the established patterns in the codebase
5. **E2E Tests**: All features must include Playwright tests

---

## 🔗 Match Result & Evidence Flow (3-Phase Implementation)

**IMPORTANT**: Prompts 01, 03, and 06 are tightly integrated and must be implemented in sequence. They share a common architecture document and build upon each other.

### Architecture Document (Read First!)

| # | Document | Description |
|---|----------|-------------|
| 00 | [Match Evidence Architecture](./00-match-evidence-architecture.md) | **Shared design document** - Component hierarchy, store relationships, UX flows |

### Implementation Phases

| Phase | Prompt | What It Builds | Prerequisites |
|-------|--------|----------------|---------------|
| **1** | [01 - Match Results](./01-match-results.md) | Result submission + Evidence shell UI | None |
| **2** | [03 - Evidence System](./03-evidence-system.md) | Complete evidence upload/linking | Phase 1 |
| **3** | [06 - Demo Catalog](./06-demo-catalog.md) | Demo browsing + "Browse Demos" tab | Phases 1 & 2 |

**Key Integration Points:**
- Phase 1 creates `EvidenceAttachmentPanel` with placeholder tabs
- Phase 2 enables Upload Image, Link URL, Demo File tabs
- Phase 3 enables Browse Demos tab + standalone catalog pages
- All phases share the `evidenceIds` flow for result submission

---

## Prompt Index

### HIGH Priority - Core Match Experience

| # | Feature | File | Complexity | New Files |
|---|---------|------|------------|-----------|
| 01 | [Match Results](./01-match-results.md) | Result submission + evidence shell (Phase 1) | Medium | ~5 |
| 02 | [Match Veto](./02-match-veto.md) | Map pick/ban system (CS2) | High | ~7 |
| 03 | [Evidence System](./03-evidence-system.md) | Complete evidence uploads (Phase 2) | High | ~8 |

### MEDIUM Priority - Admin & Moderation

| # | Feature | File | Complexity | New Files |
|---|---------|------|------------|-----------|
| 04 | [Disputes](./04-dispute-system.md) | Player disputes, admin resolution | Medium-High | ~7 |
| 05 | [Result Reviews](./05-result-reviews.md) | Admin result verification queue | Low-Medium | ~5 |
| 09 | [Match Lifecycle](./09-match-lifecycle.md) | Status timeline, check-in, admin controls | Medium | ~7 |

### LOWER Priority - Enhancement Features

| # | Feature | File | Complexity | New Files |
|---|---------|------|------------|-----------|
| 06 | [Demo Catalog](./06-demo-catalog.md) | Demo browsing + catalog (Phase 3) | Medium | ~8 |
| 07 | [Forfeits](./07-forfeits.md) | Admin forfeit management | Low | ~3 |
| 08 | [Progression Controls](./08-progression-controls.md) | Admin bracket correction tools | Low | ~4 |

## Recommended Implementation Order

```
┌─────────────────────────────────────────────────────────────┐
│  MATCH RESULT & EVIDENCE FLOW (Sequential - Must be in order)│
│                                                             │
│  00-architecture.md ──► 01-results.md ──► 03-evidence.md ──►│
│         (read)           (Phase 1)         (Phase 2)        │
│                                                             │
│                                          06-demo-catalog.md │
│                                              (Phase 3)      │
└─────────────────────────────────────────────────────────────┘

STANDALONE FEATURES (Can be implemented in parallel):

├── 02-match-veto.md         # Map selection for competitive
├── 04-dispute-system.md     # Handle conflicts (after Phase 2)
├── 05-result-reviews.md     # Admin oversight (after Phase 1)
├── 07-forfeits.md           # Admin efficiency
├── 08-progression-controls.md # Edge case handling
└── 09-match-lifecycle.md    # Complete state management
```

## Dependencies Between Features

```
┌────────────────────────────────────────────────────┐
│         MATCH RESULT & EVIDENCE FLOW               │
│                                                    │
│   [00-Architecture] (shared design doc)            │
│          │                                         │
│          ▼                                         │
│   [01-Match Results] ──────────────────────────────┼──► [05-Result Reviews]
│   Creates: EvidenceAttachmentPanel (shell)         │
│   Creates: matchResults store                      │
│          │                                         │
│          ▼                                         │
│   [03-Evidence System] ────────────────────────────┼──► [04-Disputes]
│   Completes: EvidenceAttachmentPanel               │
│   Creates: evidence store                          │
│          │                                         │
│          ▼                                         │
│   [06-Demo Catalog]                                │
│   Creates: demos store, DemoSelector               │
│   Enables: Browse Demos tab                        │
└────────────────────────────────────────────────────┘

OTHER DEPENDENCIES:

Match Veto ──┐
             ├──► Match Lifecycle (complete experience)
Check-in ────┘
```

## Common Patterns Reference

### Store Pattern (from `matchScheduling.ts`)
```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

type MyResponse = components['schemas']['MyResponse']

export const useMyStore = defineStore('myStore', () => {
  const data = ref<MyResponse | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  async function fetchData(id: string) {
    loading.value = true
    error.value = null
    try {
      const { data: response, error: apiError } = await api.GET('/v1/...')
      if (apiError) throw new ApiError(...)
      data.value = response!.data
    } catch (e) {
      error.value = e instanceof ApiError ? e.detail : 'Failed'
      throw e
    } finally {
      loading.value = false
    }
  }

  return { data, loading, error, fetchData }
})
```

### E2E Test Pattern (from `match-workflow.spec.ts`)
```typescript
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'
import { testTournaments } from './fixtures/test-data'

test.describe('Feature Name', () => {
  test('should do something', async ({ page }) => {
    await loginAsAdmin(page)
    await page.goto('/relevant/page')
    await page.waitForLoadState('networkidle')

    // Assertions
    await expect(page.getByText('Expected')).toBeVisible()
  })
})
```

### Test Data (from `fixtures/test-data.ts`)
```typescript
export const testMatches = {
  withResult: {
    tournamentSlug: 'e2e-test-tournament',
    matchId: '...',
  },
}
```

## Checklist for Each Implementation

- [ ] OpenAPI types regenerated
- [ ] Pinia store created with proper typing
- [ ] Vue components follow project patterns
- [ ] Integration with existing pages
- [ ] E2E tests cover happy path
- [ ] E2E tests cover error cases
- [ ] No TypeScript errors (`npm run type-check`)
- [ ] Build succeeds (`npm run build`)
- [ ] Manual testing in browser

## Estimated Total Effort

| Metric | Count |
|--------|-------|
| Total New Files | ~54 |
| Total Endpoints | 67 |
| E2E Test Files | 9 |

## Questions?

If a prompt is unclear or the backend API differs from what's documented, check:
1. Swagger UI: `http://localhost:3000/swagger-ui`
2. OpenAPI spec: `http://localhost:3000/api-docs/openapi.json`
3. Backend source in `/api/crates/portal-api/src/handlers/`
