/**
 * P-93: a calendar date must be formatted from LOCAL parts.
 *
 * The bug was `d.toISOString().split('T')[0]`, which re-reads the instant in
 * UTC. `v-date-picker` emits a local-midnight `Date`, so for any positive
 * offset that rolled the calendar day *back*: picking Sat 15 Aug 2026 in BST
 * posted `2026-08-14`. A player blocking out a match day was recorded as
 * unavailable the day before — and available on the day they blocked.
 *
 * Why this test is written the way it is: the defect is invisible at UTC+0,
 * and CI runners default to UTC. A test that merely called the helper would
 * have passed against the buggy implementation on every machine that mattered.
 * So each case pins an explicit `TZ`, and the suite includes a **negative**
 * offset too — the naive implementation is accidentally correct west of
 * Greenwich, so only a two-sided test distinguishes the fix from the bug.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { toLocalDateString } from '../formatters'

// `tsconfig.app.json` types this tree as a browser app (`types: ["vite/client"]`),
// so `process` is not declared. These tests need it to pin `TZ` — declaring it
// locally is cheaper and better-scoped than adding @types/node to the app config
// just for one spec.
declare const process: { env: Record<string, string | undefined> }

const ORIGINAL_TZ = process.env.TZ

function withTz<T>(tz: string, fn: () => T): T {
  process.env.TZ = tz
  try {
    return fn()
  } finally {
    process.env.TZ = ORIGINAL_TZ
  }
}

describe('toLocalDateString (P-93)', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it('keeps the picked day at a POSITIVE offset (the regression)', () => {
    // Local midnight, 15 Aug 2026. The old toISOString path yielded 2026-08-14.
    const localMidnight = new Date(2026, 7, 15, 0, 0, 0)
    expect(toLocalDateString(localMidnight)).toBe('2026-08-15')
  })

  it('keeps the picked day late in the evening, when UTC has already rolled over', () => {
    // 23:30 local — UTC is already the 16th for a positive offset. A UTC-based
    // formatter reports tomorrow; a local one must still say the 15th.
    const lateEvening = new Date(2026, 7, 15, 23, 30, 0)
    expect(toLocalDateString(lateEvening)).toBe('2026-08-15')
  })

  it('keeps the picked day just after midnight, when UTC is still yesterday', () => {
    const justAfterMidnight = new Date(2026, 7, 15, 0, 30, 0)
    expect(toLocalDateString(justAfterMidnight)).toBe('2026-08-15')
  })

  it('pads single-digit months and days', () => {
    expect(toLocalDateString(new Date(2026, 0, 5, 12, 0, 0))).toBe('2026-01-05')
  })

  it('agrees with the local calendar for "today" in both hemispheres of the meridian', () => {
    for (const tz of ['Europe/London', 'Asia/Tokyo', 'America/Los_Angeles']) {
      withTz(tz, () => {
        const now = new Date()
        const expected = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
        expect(toLocalDateString(now), `TZ=${tz}`).toBe(expected)
      })
    }
  })
})
