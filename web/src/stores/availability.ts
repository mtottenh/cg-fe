import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers/apiAction'
import { replaceById, removeById } from '@/utils/collections'

// Use generated types
type AvailabilityWindow = components['schemas']['AvailabilityWindowResponse']
type AvailabilityOverride = components['schemas']['AvailabilityOverrideResponse']
type DateAvailability = components['schemas']['DateAvailabilityResponse']
type TimeSlot = components['schemas']['TimeSlotResponse']
type CreateWindowRequest = components['schemas']['CreateAvailabilityWindowRequest']
type UpdateWindowRequest = components['schemas']['UpdateAvailabilityWindowRequest']
type CreateOverrideRequest = components['schemas']['CreateAvailabilityOverrideRequest']

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
      grouped[w.day_of_week]!.push(w)
    })
    // Sort each day by start time
    Object.keys(grouped).forEach((day) => {
      grouped[Number(day)]!.sort((a, b) => a.start_time.localeCompare(b.start_time))
    })
    return grouped
  })

  const preferredWindows = computed(() => windows.value.filter((w) => w.is_preferred))
  const regularWindows = computed(() => windows.value.filter((w) => !w.is_preferred))

  const futureOverrides = computed(() => {
    const today = new Date().toISOString().split('T')[0]!
    return overrides.value.filter((o) => o.override_date >= today).sort((a, b) => a.override_date.localeCompare(b.override_date))
  })

  const blockedOverrides = computed(() => overrides.value.filter((o) => o.override_type === 'blocked'))
  const availableOverrides = computed(() => overrides.value.filter((o) => o.override_type === 'available'))

  // Actions - Windows
  const fetchWindowsState = createActionState()
  async function fetchWindows() {
    return withActionState(fetchWindowsState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/me/availability/windows'))
      windows.value = result.data
      return windows.value
    }, 'Failed to fetch availability windows')
  }

  const createWindowState = createActionState()
  async function createWindow(windowData: CreateWindowRequest) {
    return withActionState(createWindowState, async () => {
      const result = await unwrapApi(api.POST('/v1/players/me/availability/windows', {
        body: windowData,
      }))
      const newWindow = result.data
      windows.value.push(newWindow)
      return newWindow
    }, 'Failed to create availability window')
  }

  const updateWindowState = createActionState()
  async function updateWindow(windowId: string, windowData: UpdateWindowRequest) {
    return withActionState(updateWindowState, async () => {
      const result = await unwrapApi(api.PATCH('/v1/players/me/availability/windows/{window_id}', {
        params: { path: { window_id: windowId } },
        body: windowData,
      }))
      const updatedWindow = result.data
      replaceById(windows.value, updatedWindow)
      return updatedWindow
    }, 'Failed to update availability window')
  }

  const deleteWindowState = createActionState()
  async function deleteWindow(windowId: string) {
    return withActionState(deleteWindowState, async () => {
      await unwrapApi(api.DELETE('/v1/players/me/availability/windows/{window_id}', {
        params: { path: { window_id: windowId } },
      }))
      removeById(windows.value, windowId)
    }, 'Failed to delete availability window')
  }

  // Actions - Overrides
  const fetchOverridesState = createActionState()
  async function fetchOverrides() {
    return withActionState(fetchOverridesState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/me/availability/overrides'))
      overrides.value = result.data
      return overrides.value
    }, 'Failed to fetch availability overrides')
  }

  const createOverrideState = createActionState()
  async function createOverride(overrideData: CreateOverrideRequest) {
    return withActionState(createOverrideState, async () => {
      const result = await unwrapApi(api.POST('/v1/players/me/availability/overrides', {
        body: overrideData,
      }))
      const newOverride = result.data
      overrides.value.push(newOverride)
      return newOverride
    }, 'Failed to create availability override')
  }

  const deleteOverrideState = createActionState()
  async function deleteOverride(overrideId: string) {
    return withActionState(deleteOverrideState, async () => {
      await unwrapApi(api.DELETE('/v1/players/me/availability/overrides/{override_id}', {
        params: { path: { override_id: overrideId } },
      }))
      removeById(overrides.value, overrideId)
    }, 'Failed to delete availability override')
  }

  // Actions - Date Availability
  const fetchDateAvailabilityState = createActionState()
  async function fetchDateAvailability(date: string) {
    return withActionState(fetchDateAvailabilityState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/me/availability/date', {
        params: { query: { date } },
      }))
      dateAvailability.value = result.data
      return dateAvailability.value
    }, 'Failed to fetch date availability')
  }

  const fetchPlayerDateAvailabilityState = createActionState()
  async function fetchPlayerDateAvailability(playerId: string, date: string) {
    return withActionState(fetchPlayerDateAvailabilityState, async () => {
      const result = await unwrapApi(api.GET('/v1/players/{player_id}/availability/date', {
        params: { path: { player_id: playerId }, query: { date } },
      }))
      return result.data
    }, 'Failed to fetch player date availability')
  }

  // Load all availability data
  const fetchAllState = createActionState()
  async function fetchAll() {
    return withActionState(fetchAllState, async () => {
      await Promise.all([fetchWindows(), fetchOverrides()])
    }, 'Failed to fetch all availability data')
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
    // Per-action states
    fetchWindowsState,
    createWindowState,
    updateWindowState,
    deleteWindowState,
    fetchOverridesState,
    createOverrideState,
    deleteOverrideState,
    fetchDateAvailabilityState,
    fetchPlayerDateAvailabilityState,
    fetchAllState,
  }
})

// Re-export types for convenience
export type { AvailabilityWindow, AvailabilityOverride, DateAvailability, TimeSlot, CreateWindowRequest, UpdateWindowRequest, CreateOverrideRequest }

// Helper functions
export function formatTime(time: string): string {
  // Convert HH:MM:SS to HH:MM AM/PM
  const parts = time.split(':').map(Number)
  const hours = parts[0]!
  const minutes = parts[1]!
  const period = hours >= 12 ? 'PM' : 'AM'
  const displayHours = hours % 12 || 12
  return `${displayHours}:${minutes.toString().padStart(2, '0')} ${period}`
}

export function formatTimeRange(start: string, end: string): string {
  return `${formatTime(start)} - ${formatTime(end)}`
}

export function getDayName(dayOfWeek: number, short = false): string {
  return short ? DAY_NAMES_SHORT[dayOfWeek]! : DAY_NAMES[dayOfWeek]!
}

