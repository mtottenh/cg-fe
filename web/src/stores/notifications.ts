import { defineStore } from 'pinia'
import { computed, ref } from 'vue'
import { api, getAuthToken } from '@/api'
import { createActionState, unwrapApi, withActionState } from '@/stores/helpers/apiAction'
import type { components } from '@/api/types'

export type PortalNotification = components['schemas']['NotificationResponse']
export type TournamentNotificationSettings =
  components['schemas']['TournamentNotificationSettingsResponse']
export type NotificationTestResult = components['schemas']['NotificationTestResponse']

/**
 * The current user's notifications (match times, check-in, server ready, …).
 *
 * The header bell polls `unread-count` (cheap) and only fetches the list when
 * the menu opens or a new notification has arrived (`latest_id` changed).
 */
export const useNotificationsStore = defineStore('notifications', () => {
  const items = ref<PortalNotification[]>([])
  const unreadCount = ref(0)
  const latestId = ref<string | null>(null)
  const hasMore = ref(false)
  /** `latest_id` the loaded list reflects; a different `latestId` means it is stale. */
  const listedLatestId = ref<string | null>(null)

  const fetchCountState = createActionState()
  const fetchListState = createActionState()
  const markReadState = createActionState()

  const listIsStale = computed(() => latestId.value !== listedLatestId.value)

  async function fetchUnreadCount() {
    if (!getAuthToken()) return null
    return withActionState(fetchCountState, async () => {
      const result = await unwrapApi(api.GET('/v1/me/notifications/unread-count'))
      unreadCount.value = result.data.unread_count
      latestId.value = result.data.latest_id ?? null
      return result.data
    }, 'Failed to fetch notifications')
  }

  async function fetchNotifications(limit = 30) {
    if (!getAuthToken()) return []
    return withActionState(fetchListState, async () => {
      const result = await unwrapApi(api.GET('/v1/me/notifications', {
        params: { query: { limit } },
      }))
      items.value = result.data.items
      unreadCount.value = result.data.unread_count
      hasMore.value = result.data.has_more
      latestId.value = result.data.items[0]?.id ?? latestId.value
      listedLatestId.value = latestId.value
      return result.data.items
    }, 'Failed to fetch notifications')
  }

  /** Mark some (or all) read. Updates the list and count before the server answers. */
  async function markRead(target: { ids: string[] } | { all: true }) {
    const now = new Date().toISOString()
    const ids = 'ids' in target ? new Set(target.ids) : null
    let newlyRead = 0
    items.value = items.value.map((n) => {
      if (n.read_at || (ids && !ids.has(n.id))) return n
      newlyRead++
      return { ...n, read_at: now }
    })
    unreadCount.value = ids ? Math.max(0, unreadCount.value - newlyRead) : 0
    if (ids && ids.size === 0) return 0

    return withActionState(markReadState, async () => {
      const body = 'ids' in target ? { ids: target.ids } : { all: true }
      const result = await unwrapApi(api.POST('/v1/me/notifications/read', { body }))
      return result.data.updated
    }, 'Failed to mark notifications read')
  }

  // --- Admin: per-tournament Discord settings ------------------------------

  const settingsState = createActionState()
  const saveSettingsState = createActionState()
  const testSettingsState = createActionState()

  async function fetchTournamentSettings(tournamentId: string) {
    return withActionState(settingsState, async () => {
      const result = await unwrapApi(api.GET(
        '/v1/admin/tournaments/{tournament_id}/notification-settings',
        { params: { path: { tournament_id: tournamentId } } },
      ))
      return result.data
    }, 'Failed to load notification settings')
  }

  async function saveTournamentSettings(
    tournamentId: string,
    body: components['schemas']['UpdateTournamentNotificationSettingsRequest'],
  ) {
    return withActionState(saveSettingsState, async () => {
      const result = await unwrapApi(api.PUT(
        '/v1/admin/tournaments/{tournament_id}/notification-settings',
        { params: { path: { tournament_id: tournamentId } }, body },
      ))
      return result.data
    }, 'Failed to save notification settings')
  }

  async function sendTestNotification(tournamentId: string) {
    return withActionState(testSettingsState, async () => {
      const result = await unwrapApi(api.POST(
        '/v1/admin/tournaments/{tournament_id}/notification-settings/test',
        { params: { path: { tournament_id: tournamentId } } },
      ))
      return result.data
    }, 'Failed to send the test message')
  }

  function $reset() {
    items.value = []
    unreadCount.value = 0
    latestId.value = null
    listedLatestId.value = null
    hasMore.value = false
    for (const s of [fetchCountState, fetchListState, markReadState, settingsState, saveSettingsState, testSettingsState]) {
      s.loading = false
      s.error = null
    }
  }

  return {
    items,
    unreadCount,
    latestId,
    hasMore,
    listIsStale,
    fetchCountState,
    fetchListState,
    markReadState,
    settingsState,
    saveSettingsState,
    testSettingsState,
    fetchUnreadCount,
    fetchNotifications,
    markRead,
    fetchTournamentSettings,
    saveTournamentSettings,
    sendTestNotification,
    $reset,
  }
})
