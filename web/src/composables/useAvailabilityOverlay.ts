import { ref, computed, type Ref } from 'vue'
import { useAvailabilityStore, type DateAvailability } from '@/stores/availability'
import { toLocalDateString } from '@/utils/formatters'
import { api } from '@/api'
import { unwrapApi } from '@/stores/helpers/apiAction'
import type { components } from '@/api/types'

type SuggestedTimeResponse = components['schemas']['SuggestedTimeResponse']

export type OverlayCellStatus = 'empty' | 'my_only' | 'opponent_only' | 'mutual' | 'suggested' | 'blocked'

export interface OverlayDay {
  date: string
  dayName: string
  dayLabel: string
  isToday: boolean
  cells: Map<string, OverlayCellStatus>
}

export interface OverlayGrid {
  days: OverlayDay[]
  timeSlots: string[]
}

const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

/**
 * Composable for the availability calendar overlay.
 * Fetches both players' availability and backend suggestions,
 * then merges into a 30-min-bucket grid for rendering.
 */
export function useAvailabilityOverlay(
  opponentPlayerId: Ref<string | null>,
  tournamentId: Ref<string | null>,
  matchId: Ref<string | null>,
) {
  const store = useAvailabilityStore()

  const loading = ref(false)
  const myAvailability = ref<Record<string, DateAvailability>>({})
  const opponentAvailability = ref<Record<string, DateAvailability>>({})
  const suggestions = ref<SuggestedTimeResponse[]>([])

  // Week navigation
  const weekOffset = ref(0)

  const currentWeekStart = computed(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    // Start from tomorrow, then offset by weeks
    const start = new Date(today)
    start.setDate(start.getDate() + 1 + weekOffset.value * 7)
    return start
  })

  const weekLabel = computed(() => {
    const start = currentWeekStart.value
    const end = new Date(start)
    end.setDate(end.getDate() + 6)
    const opts: Intl.DateTimeFormatOptions = { month: 'short', day: 'numeric' }
    if (start.getMonth() !== end.getMonth()) {
      return `${start.toLocaleDateString(undefined, opts)} - ${end.toLocaleDateString(undefined, opts)}, ${start.getFullYear()}`
    }
    return `${start.toLocaleDateString(undefined, { month: 'short' })} ${start.getDate()} - ${end.getDate()}, ${start.getFullYear()}`
  })

  function previousWeek() { weekOffset.value-- }
  function nextWeek() { weekOffset.value++ }
  function goToCurrentWeek() { weekOffset.value = 0 }

  // Generate the 30-min time slot labels (08:00 to 22:30)
  const defaultTimeSlots = generateTimeSlots(8, 23)

  function generateTimeSlots(startHour: number, endHour: number): string[] {
    const slots: string[] = []
    for (let h = startHour; h < endHour; h++) {
      slots.push(`${h.toString().padStart(2, '0')}:00`)
      slots.push(`${h.toString().padStart(2, '0')}:30`)
    }
    return slots
  }

  /**
   * Convert a DateAvailability's slots into a Set of 30-min bucket keys.
   * Slot times are HH:MM:SS strings (e.g. "14:00:00").
   */
  function discretizeSlots(slots: { start: string; end: string }[]): Set<string> {
    const buckets = new Set<string>()
    for (const slot of slots) {
      const startMin = timeToMinutes(slot.start)
      const endMin = timeToMinutes(slot.end)
      // Mark each 30-min bucket that the slot covers
      for (let m = startMin; m < endMin; m += 30) {
        buckets.add(minutesToKey(m))
      }
    }
    return buckets
  }

  /**
   * Convert backend SuggestedTimeResponses into a Set of date+time keys
   * so we can highlight them in the grid.
   * Key format: "YYYY-MM-DD|HH:MM"
   */
  function discretizeSuggestions(items: SuggestedTimeResponse[]): Set<string> {
    const buckets = new Set<string>()
    for (const s of items) {
      const start = new Date(s.suggested_start)
      const end = new Date(s.suggested_end)
      const dateStr = toLocalDateString(start)
      const startMin = start.getHours() * 60 + start.getMinutes()
      const endMin = end.getHours() * 60 + end.getMinutes()
      for (let m = startMin; m < endMin; m += 30) {
        buckets.add(`${dateStr}|${minutesToKey(m)}`)
      }
    }
    return buckets
  }

  // Build the overlay grid
  const overlayData = computed<OverlayGrid>(() => {
    const today = new Date()
    today.setHours(0, 0, 0, 0)
    const todayStr = toLocalDateString(today)

    const suggestionBuckets = discretizeSuggestions(suggestions.value)
    const days: OverlayDay[] = []

    for (let i = 0; i < 7; i++) {
      const date = new Date(currentWeekStart.value)
      date.setDate(date.getDate() + i)
      const dateStr = toLocalDateString(date)

      const myData = myAvailability.value[dateStr]
      const oppData = opponentAvailability.value[dateStr]

      const myBuckets = myData ? discretizeSlots(myData.available_slots) : new Set<string>()
      const oppBuckets = oppData ? discretizeSlots(oppData.available_slots) : new Set<string>()
      const myBlocked = myData?.is_blocked ?? false
      const oppBlocked = oppData?.is_blocked ?? false

      const cells = new Map<string, OverlayCellStatus>()
      for (const timeKey of defaultTimeSlots) {
        if (myBlocked || oppBlocked) {
          cells.set(timeKey, 'blocked')
          continue
        }

        const inMine = myBuckets.has(timeKey)
        const inOpp = oppBuckets.has(timeKey)
        const isSuggested = suggestionBuckets.has(`${dateStr}|${timeKey}`)

        if (isSuggested && inMine && inOpp) {
          cells.set(timeKey, 'suggested')
        } else if (inMine && inOpp) {
          cells.set(timeKey, 'mutual')
        } else if (inMine) {
          cells.set(timeKey, 'my_only')
        } else if (inOpp) {
          cells.set(timeKey, 'opponent_only')
        } else {
          cells.set(timeKey, 'empty')
        }
      }

      const dayOfWeek = date.getDay()
      const isToday = dateStr === todayStr

      days.push({
        date: dateStr,
        dayName: DAY_NAMES_SHORT[dayOfWeek]!,
        dayLabel: isToday ? 'Today' : DAY_NAMES_SHORT[dayOfWeek]!,
        isToday,
        cells,
      })
    }

    return { days, timeSlots: defaultTimeSlots }
  })

  // Data fetching
  async function fetchWeek() {
    if (!opponentPlayerId.value) return

    loading.value = true
    try {
      const dates: string[] = []
      for (let i = 0; i < 7; i++) {
        const d = new Date(currentWeekStart.value)
        d.setDate(d.getDate() + i)
        dates.push(toLocalDateString(d))
      }

      // Fetch both players' availability in parallel (7 days × 2 players)
      const promises = dates.flatMap(dateStr => [
        store.fetchDateAvailability(dateStr)
          .then(data => { myAvailability.value[dateStr] = data })
          .catch(() => {
            myAvailability.value[dateStr] = { date: dateStr, is_blocked: false, available_slots: [], notes: [] }
          }),
        store.fetchPlayerDateAvailability(opponentPlayerId.value!, dateStr)
          .then(data => { opponentAvailability.value[dateStr] = data })
          .catch(() => {
            opponentAvailability.value[dateStr] = { date: dateStr, is_blocked: false, available_slots: [], notes: [] }
          }),
      ])

      // Also fetch backend suggestions if we have tournament/match context
      if (tournamentId.value && matchId.value) {
        promises.push(
          unwrapApi(api.POST(
            '/v1/tournaments/{tournament_id}/matches/{match_id}/suggestions/generate',
            {
              params: { path: { tournament_id: tournamentId.value, match_id: matchId.value } },
              body: {
                start_date: dates[0]!,
                end_date: dates[dates.length - 1]!,
              },
            }
          ))
            .then(result => { suggestions.value = result.data })
            .catch(() => { suggestions.value = [] })
        )
      }

      await Promise.all(promises)
    } finally {
      loading.value = false
    }
  }

  /**
   * Convert a cell click (date + time key) to an ISO string
   * suitable for use as a proposed match time.
   */
  function cellToIso(date: string, timeKey: string): string {
    return new Date(`${date}T${timeKey}:00`).toISOString()
  }

  return {
    loading,
    overlayData,
    suggestions,
    weekLabel,
    currentWeekStart,
    weekOffset,
    previousWeek,
    nextWeek,
    goToCurrentWeek,
    fetchWeek,
    cellToIso,
  }
}

// Utility helpers
function timeToMinutes(time: string): number {
  const parts = time.split(':').map(Number)
  const h = parts[0]!
  const m = parts[1]!
  return h * 60 + m
}

function minutesToKey(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`
}

