import { toLocalDateString } from './formatters'

/** One cell of the availability calendar grid. */
export interface CalendarDay {
  /** 0 = Sunday … 6 = Saturday. Matches the API's `day_of_week`. */
  dayIndex: number
  /** Day of month, for the column header. */
  date: number
  /** `YYYY-MM-DD`, the key the availability API is queried with. */
  dateStr: string
  isToday: boolean
  fullDate: Date
}

/**
 * The 14 days of an availability period, starting on the Sunday of the week
 * containing `reference` (shifted by `periodOffset` fortnights).
 *
 * P-93: `dateStr` must come from the date's LOCAL parts. The calendar column
 * is labelled from `getDay()` (local) but was keyed with
 * `toISOString().split('T')[0]` (UTC), so east of Greenwich every column
 * fetched the *previous* day's availability — a Saturday window rendered
 * under Sunday. Keep both sides reading the same clock.
 */
export function buildCalendarDays(reference: Date, periodOffset = 0): CalendarDay[] {
  const today = new Date(reference)
  today.setHours(0, 0, 0, 0)

  const start = new Date(today)
  start.setDate(start.getDate() - start.getDay() + periodOffset * 14)

  const days: CalendarDay[] = []
  for (let i = 0; i < 14; i++) {
    const date = new Date(start)
    date.setDate(date.getDate() + i)
    days.push({
      dayIndex: date.getDay(),
      date: date.getDate(),
      dateStr: toLocalDateString(date),
      isToday: date.toDateString() === today.toDateString(),
      fullDate: date,
    })
  }
  return days
}
