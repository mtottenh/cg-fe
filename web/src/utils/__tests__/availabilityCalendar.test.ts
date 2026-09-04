/**
 * P-93 (calendar view): the grid labels each column from `getDay()` — local —
 * but keyed the availability fetch with `toISOString().split('T')[0]` — UTC.
 * East of Greenwich that keyed every column to the *previous* day, so a
 * Saturday weekly window rendered in the Sunday column (and the real Saturday
 * column looked empty). Both sides must read the same clock.
 *
 * The defect is invisible at UTC+0 and CI runs UTC, so the cases that matter
 * pin an explicit `TZ` and include a negative offset too — the naive
 * implementation is accidentally right west of Greenwich.
 */
import { describe, it, expect, afterEach } from 'vitest'
import { buildCalendarDays } from '../availabilityCalendar'

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

const WEEKDAY = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** The weekday `dateStr` actually names, read back off the plain date parts. */
function weekdayOf(dateStr: string): string {
  const [y, m, d] = dateStr.split('-').map(Number)
  return WEEKDAY[new Date(y!, m! - 1, d!).getDay()]!
}

describe('buildCalendarDays (P-93)', () => {
  afterEach(() => {
    process.env.TZ = ORIGINAL_TZ
  })

  it('keys every column with the date its own header names', () => {
    for (const tz of ['Europe/London', 'Asia/Tokyo', 'Pacific/Kiritimati', 'America/Los_Angeles']) {
      withTz(tz, () => {
        // Tue 25 Aug 2026 — the day in the bug report's screenshot.
        const days = buildCalendarDays(new Date(2026, 7, 25, 12, 0, 0))
        for (const day of days) {
          expect(weekdayOf(day.dateStr), `TZ=${tz} ${day.dateStr}`).toBe(WEEKDAY[day.dayIndex])
          expect(Number(day.dateStr.split('-')[2]), `TZ=${tz}`).toBe(day.date)
        }
      })
    }
  })

  it('starts on the Sunday of the reference week and spans 14 days', () => {
    withTz('Europe/London', () => {
      const days = buildCalendarDays(new Date(2026, 7, 25, 12, 0, 0))
      expect(days).toHaveLength(14)
      expect(days[0]!.dateStr).toBe('2026-08-23')
      expect(days[0]!.dayIndex).toBe(0)
      expect(days[13]!.dateStr).toBe('2026-09-05')
      expect(days[13]!.dayIndex).toBe(6)
    })
  })

  it('puts a Saturday window in the Saturday column, not Sunday (the regression)', () => {
    withTz('Europe/London', () => {
      const days = buildCalendarDays(new Date(2026, 7, 25, 12, 0, 0))
      const saturdays = days.filter((d) => d.dayIndex === 6).map((d) => d.dateStr)
      const sundays = days.filter((d) => d.dayIndex === 0).map((d) => d.dateStr)
      // The old code fetched 2026-08-22 (a Saturday) for the Sunday column.
      expect(saturdays).toEqual(['2026-08-29', '2026-09-05'])
      expect(sundays).toEqual(['2026-08-23', '2026-08-30'])
    })
  })

  it('shifts by whole fortnights', () => {
    withTz('Europe/London', () => {
      expect(buildCalendarDays(new Date(2026, 7, 25, 12, 0, 0), 1)[0]!.dateStr).toBe('2026-09-06')
      expect(buildCalendarDays(new Date(2026, 7, 25, 12, 0, 0), -1)[0]!.dateStr).toBe('2026-08-09')
    })
  })

  it('marks exactly one day as today', () => {
    const now = new Date()
    const days = buildCalendarDays(now)
    expect(days.filter((d) => d.isToday)).toHaveLength(1)
  })

  it('keeps day numbering intact across a month boundary and a DST change', () => {
    withTz('Europe/London', () => {
      // BST ends Sun 25 Oct 2026; the fortnight straddles it.
      const days = buildCalendarDays(new Date(2026, 9, 22, 12, 0, 0))
      expect(days.map((d) => d.dateStr)).toEqual([
        '2026-10-18', '2026-10-19', '2026-10-20', '2026-10-21', '2026-10-22', '2026-10-23', '2026-10-24',
        '2026-10-25', '2026-10-26', '2026-10-27', '2026-10-28', '2026-10-29', '2026-10-30', '2026-10-31',
      ])
    })
  })
})
