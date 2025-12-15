import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Use generated types
type AvailabilityWindow = components['schemas']['AvailabilityWindowResponse']
type AvailabilityOverride = components['schemas']['AvailabilityOverrideResponse']
type DateAvailability = components['schemas']['DateAvailabilityResponse']
type TimeSlot = components['schemas']['TimeSlotResponse']
type CreateWindowRequest = components['schemas']['CreateAvailabilityWindowRequest']
type UpdateWindowRequest = components['schemas']['UpdateAvailabilityWindowRequest']
type CreateOverrideRequest = components['schemas']['CreateAvailabilityOverrideRequest']
type ApiErrorResponse = components['schemas']['ApiError']

// Day names for display
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const
export const DAY_NAMES_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'] as const

export const useAvailabilityStore = defineStore('availability', () => {
  // State
  const windows = ref<AvailabilityWindow[]>([])
  const overrides = ref<AvailabilityOverride[]>([])
  const dateAvailability = ref<DateAvailability | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Computed
  const windowsByDay = computed(() => {
    const grouped: Record<number, AvailabilityWindow[]> = {}
    for (let i = 0; i < 7; i++) {
      grouped[i] = []
    }
    windows.value.forEach((w) => {
      grouped[w.day_of_week].push(w)
    })
    // Sort each day by start time
    Object.keys(grouped).forEach((day) => {
      grouped[Number(day)].sort((a, b) => a.start_time.localeCompare(b.start_time))
    })
    return grouped
  })

  const preferredWindows = computed(() => windows.value.filter((w) => w.is_preferred))
  const regularWindows = computed(() => windows.value.filter((w) => !w.is_preferred))

  const futureOverrides = computed(() => {
    const today = new Date().toISOString().split('T')[0]
    return overrides.value.filter((o) => o.override_date >= today).sort((a, b) => a.override_date.localeCompare(b.override_date))
  })

  const blockedOverrides = computed(() => overrides.value.filter((o) => o.override_type === 'blocked'))
  const availableOverrides = computed(() => overrides.value.filter((o) => o.override_type === 'available'))

  // Actions - Windows
  async function fetchWindows() {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/me/availability/windows')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      windows.value = data!.data
      return windows.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch availability windows'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createWindow(windowData: CreateWindowRequest) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/players/me/availability/windows', {
        body: windowData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const newWindow = data!.data
      windows.value.push(newWindow)
      return newWindow
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to create availability window'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function updateWindow(windowId: string, windowData: UpdateWindowRequest) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/players/me/availability/windows/{window_id}', {
        params: { path: { window_id: windowId } },
        body: windowData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const updatedWindow = data!.data
      const index = windows.value.findIndex((w) => w.id === windowId)
      if (index !== -1) {
        windows.value[index] = updatedWindow
      }
      return updatedWindow
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update availability window'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteWindow(windowId: string) {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.DELETE('/v1/players/me/availability/windows/{window_id}', {
        params: { path: { window_id: windowId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      windows.value = windows.value.filter((w) => w.id !== windowId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to delete availability window'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // Actions - Overrides
  async function fetchOverrides() {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/me/availability/overrides')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      overrides.value = data!.data
      return overrides.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch availability overrides'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function createOverride(overrideData: CreateOverrideRequest) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/players/me/availability/overrides', {
        body: overrideData,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const newOverride = data!.data
      overrides.value.push(newOverride)
      return newOverride
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to create availability override'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function deleteOverride(overrideId: string) {
    loading.value = true
    error.value = null
    try {
      const { error: apiError } = await api.DELETE('/v1/players/me/availability/overrides/{override_id}', {
        params: { path: { override_id: overrideId } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      overrides.value = overrides.value.filter((o) => o.id !== overrideId)
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to delete availability override'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // Actions - Date Availability
  async function fetchDateAvailability(date: string) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/me/availability/date', {
        params: { query: { date } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      dateAvailability.value = data!.data
      return dateAvailability.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch date availability'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchPlayerDateAvailability(playerId: string, date: string) {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/{player_id}/availability/date', {
        params: { path: { player_id: playerId }, query: { date } },
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      return data!.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch player date availability'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  // Load all availability data
  async function fetchAll() {
    loading.value = true
    error.value = null
    try {
      await Promise.all([fetchWindows(), fetchOverrides()])
    } catch (e: unknown) {
      // Error already set by individual methods
      throw e
    } finally {
      loading.value = false
    }
  }

  // Clear all state
  function $reset() {
    windows.value = []
    overrides.value = []
    dateAvailability.value = null
    loading.value = false
    error.value = null
  }

  return {
    // State
    windows,
    overrides,
    dateAvailability,
    loading,
    error,
    // Computed
    windowsByDay,
    preferredWindows,
    regularWindows,
    futureOverrides,
    blockedOverrides,
    availableOverrides,
    // Actions - Windows
    fetchWindows,
    createWindow,
    updateWindow,
    deleteWindow,
    // Actions - Overrides
    fetchOverrides,
    createOverride,
    deleteOverride,
    // Actions - Date
    fetchDateAvailability,
    fetchPlayerDateAvailability,
    // Utilities
    fetchAll,
    $reset,
  }
})

// ==================== Tournament-Specific Availability ====================

// Mutual availability between two players (for scheduling matches)
export interface MutualAvailability {
  date: string
  slots: MutualSlot[]
}

export interface MutualSlot {
  start_time: string
  end_time: string
  is_preferred_by_both: boolean
  is_preferred_by_current_user: boolean
  is_preferred_by_opponent: boolean
}

export function useTournamentAvailability() {
  const availabilityStore = useAvailabilityStore()

  /**
   * Fetch availability for a specific opponent (another player)
   */
  async function fetchOpponentAvailability(
    opponentPlayerId: string,
    dateStart: string,
    dateEnd: string
  ): Promise<DateAvailability[]> {
    const dates: DateAvailability[] = []
    const start = new Date(dateStart)
    const end = new Date(dateEnd)

    // Fetch each day's availability
    for (let date = start; date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0]
      try {
        const availability = await availabilityStore.fetchPlayerDateAvailability(opponentPlayerId, dateStr)
        dates.push(availability)
      } catch {
        // Skip dates that fail
      }
    }

    return dates
  }

  /**
   * Calculate mutual availability between current user and opponent
   */
  async function calculateMutualAvailability(
    opponentPlayerId: string,
    dateStart: string,
    dateEnd: string
  ): Promise<MutualAvailability[]> {
    const results: MutualAvailability[] = []
    const start = new Date(dateStart)
    const end = new Date(dateEnd)

    for (let date = new Date(start); date <= end; date.setDate(date.getDate() + 1)) {
      const dateStr = date.toISOString().split('T')[0]

      try {
        // Fetch both availabilities in parallel
        const [myAvailability, opponentAvailability] = await Promise.all([
          availabilityStore.fetchDateAvailability(dateStr),
          availabilityStore.fetchPlayerDateAvailability(opponentPlayerId, dateStr),
        ])

        // Find overlapping slots
        const mutualSlots = findOverlappingSlots(myAvailability.slots, opponentAvailability.slots)

        if (mutualSlots.length > 0) {
          results.push({
            date: dateStr,
            slots: mutualSlots,
          })
        }
      } catch {
        // Skip dates that fail
      }
    }

    return results
  }

  /**
   * Get suggested match times based on mutual availability
   */
  async function getSuggestedTimes(
    opponentPlayerId: string,
    preferredDates: string[] = [],
    maxSuggestions = 5
  ): Promise<string[]> {
    // Default to next 7 days if no preferred dates
    const startDate = new Date()
    startDate.setDate(startDate.getDate() + 1) // Start from tomorrow
    const endDate = new Date()
    endDate.setDate(endDate.getDate() + 7)

    const dateStart = preferredDates.length > 0 ? preferredDates[0] : startDate.toISOString().split('T')[0]
    const dateEnd = preferredDates.length > 0 ? preferredDates[preferredDates.length - 1] : endDate.toISOString().split('T')[0]

    const mutualAvailability = await calculateMutualAvailability(opponentPlayerId, dateStart, dateEnd)

    const suggestions: string[] = []

    // Prioritize preferred slots, then regular slots
    for (const day of mutualAvailability) {
      // First add preferred slots
      for (const slot of day.slots.filter((s) => s.is_preferred_by_both)) {
        if (suggestions.length >= maxSuggestions) break
        const time = combineDateTime(day.date, slot.start_time)
        if (!suggestions.includes(time)) {
          suggestions.push(time)
        }
      }

      // Then add partially preferred slots
      for (const slot of day.slots.filter((s) => s.is_preferred_by_current_user || s.is_preferred_by_opponent)) {
        if (suggestions.length >= maxSuggestions) break
        const time = combineDateTime(day.date, slot.start_time)
        if (!suggestions.includes(time)) {
          suggestions.push(time)
        }
      }

      // Then add regular overlapping slots
      for (const slot of day.slots.filter((s) => !s.is_preferred_by_both && !s.is_preferred_by_current_user && !s.is_preferred_by_opponent)) {
        if (suggestions.length >= maxSuggestions) break
        const time = combineDateTime(day.date, slot.start_time)
        if (!suggestions.includes(time)) {
          suggestions.push(time)
        }
      }

      if (suggestions.length >= maxSuggestions) break
    }

    return suggestions
  }

  return {
    fetchOpponentAvailability,
    calculateMutualAvailability,
    getSuggestedTimes,
  }
}

// Helper function to find overlapping time slots
function findOverlappingSlots(slots1: TimeSlot[], slots2: TimeSlot[]): MutualSlot[] {
  const overlaps: MutualSlot[] = []

  for (const s1 of slots1) {
    for (const s2 of slots2) {
      const overlap = getTimeOverlap(s1.start_time, s1.end_time, s2.start_time, s2.end_time)
      if (overlap) {
        overlaps.push({
          start_time: overlap.start,
          end_time: overlap.end,
          is_preferred_by_both: s1.is_preferred && s2.is_preferred,
          is_preferred_by_current_user: s1.is_preferred,
          is_preferred_by_opponent: s2.is_preferred,
        })
      }
    }
  }

  // Merge adjacent/overlapping slots
  return mergeSlots(overlaps)
}

function getTimeOverlap(
  start1: string,
  end1: string,
  start2: string,
  end2: string
): { start: string; end: string } | null {
  const s1 = timeToMinutes(start1)
  const e1 = timeToMinutes(end1)
  const s2 = timeToMinutes(start2)
  const e2 = timeToMinutes(end2)

  const overlapStart = Math.max(s1, s2)
  const overlapEnd = Math.min(e1, e2)

  if (overlapStart < overlapEnd) {
    return {
      start: minutesToTime(overlapStart),
      end: minutesToTime(overlapEnd),
    }
  }

  return null
}

function timeToMinutes(time: string): number {
  const [hours, minutes] = time.split(':').map(Number)
  return hours * 60 + minutes
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:00`
}

function mergeSlots(slots: MutualSlot[]): MutualSlot[] {
  if (slots.length === 0) return []

  // Sort by start time
  const sorted = [...slots].sort((a, b) => a.start_time.localeCompare(b.start_time))

  const merged: MutualSlot[] = [sorted[0]]

  for (let i = 1; i < sorted.length; i++) {
    const current = sorted[i]
    const last = merged[merged.length - 1]

    // Check if overlapping or adjacent
    if (current.start_time <= last.end_time) {
      // Merge
      last.end_time = current.end_time > last.end_time ? current.end_time : last.end_time
      // Keep best preference status
      last.is_preferred_by_both = last.is_preferred_by_both || current.is_preferred_by_both
      last.is_preferred_by_current_user = last.is_preferred_by_current_user || current.is_preferred_by_current_user
      last.is_preferred_by_opponent = last.is_preferred_by_opponent || current.is_preferred_by_opponent
    } else {
      merged.push(current)
    }
  }

  return merged
}

function combineDateTime(date: string, time: string): string {
  // Remove seconds from time if present
  const timePart = time.split(':').slice(0, 2).join(':')
  return new Date(`${date}T${timePart}`).toISOString()
}

// Re-export types for convenience
export type { AvailabilityWindow, AvailabilityOverride, DateAvailability, TimeSlot, CreateWindowRequest, UpdateWindowRequest, CreateOverrideRequest }

// Helper functions
export function formatTime(time: string): string {
  // Convert HH:MM:SS to HH:MM AM/PM
  const [hours, minutes] = time.split(':').map(Number)
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} - ${formatTime(end)}`
}

export function getDayName(dayOfWeek: number, short = false): string {
  return short ? DAY_NAMES_SHORT[dayOfWeek] : DAY_NAMES[dayOfWeek]
}
