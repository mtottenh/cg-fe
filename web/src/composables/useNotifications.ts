import { computed, onMounted, onUnmounted, ref, watch } from 'vue'
import { storeToRefs } from 'pinia'
import { useRouter } from 'vue-router'
import { useNotificationsStore, type PortalNotification } from '@/stores/notifications'
import { useAuthStore } from '@/stores/auth'
import {
  alertPermission,
  alertsSupported,
  dismissPrompt,
  promptDismissed,
  requestAlertPermission,
  selectAlerts,
  showAlerts,
  type AlertPermission,
} from '@/utils/browserNotifications'

/** Matches the action-item poll and the lifecycle tick. */
export const NOTIFICATIONS_POLL_MS = 30_000

/**
 * Polls the current user's unread notifications and raises desktop alerts for
 * new ones. Mount once, in the header bell.
 */
export function useNotifications() {
  const store = useNotificationsStore()
  const authStore = useAuthStore()
  const router = useRouter()
  const { items, unreadCount, hasMore, latestId } = storeToRefs(store)

  // Nothing created before this tab loaded is ever alerted.
  const sessionStart = Date.now()
  const permission = ref<AlertPermission>(alertPermission())
  const dismissed = ref(promptDismissed())

  const showPermissionPrompt = computed(
    () => alertsSupported() && permission.value === 'default' && !dismissed.value,
  )

  let timer: ReturnType<typeof setInterval> | null = null
  let lastSeenLatest: string | null = null
  let primed = false

  async function tick() {
    if (document.visibilityState === 'hidden') return
    if (!authStore.isAuthenticated) return
    try {
      await store.fetchUnreadCount()
    } catch {
      return
    }
    const latest = latestId.value
    const changed = primed && latest !== null && latest !== lastSeenLatest
    lastSeenLatest = latest
    primed = true
    if (!changed) return
    // Something new arrived: refresh the list, and alert if allowed.
    try {
      const fresh = await store.fetchNotifications()
      permission.value = alertPermission()
      if (permission.value === 'granted') {
        showAlerts(selectAlerts(fresh ?? [], sessionStart), open)
      }
    } catch {
      // The count is still right; the list refreshes on the next open.
    }
  }

  function start() {
    stop()
    void tick()
    timer = setInterval(() => void tick(), NOTIFICATIONS_POLL_MS)
  }

  function stop() {
    if (timer) {
      clearInterval(timer)
      timer = null
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void tick()
  }

  /** The menu opened: make sure the list is current. */
  async function onMenuOpen() {
    if (items.value.length === 0 || store.listIsStale) {
      try {
        await store.fetchNotifications()
      } catch {
        // The menu shows the error state.
      }
    }
  }

  async function open(n: PortalNotification) {
    if (!n.read_at) {
      store.markRead({ ids: [n.id] }).catch(() => {})
    }
    if (n.link) await router.push(n.link)
  }

  async function markAllRead() {
    try {
      await store.markRead({ all: true })
    } catch {
      // Optimistic update stays; the next poll corrects the count.
    }
  }

  async function enableAlerts() {
    permission.value = await requestAlertPermission()
    dismissPrompt()
    dismissed.value = true
  }

  function dismissAlertsPrompt() {
    dismissPrompt()
    dismissed.value = true
  }

  watch(
    () => authStore.isAuthenticated,
    (authed, was) => {
      if (authed && !was) {
        primed = false
        start()
      } else if (!authed && was) {
        stop()
        store.$reset()
        primed = false
        lastSeenLatest = null
      }
    },
  )

  onMounted(() => {
    if (authStore.isAuthenticated) start()
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stop()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return {
    notifications: items,
    unreadCount,
    hasMore,
    loadError: computed(() => store.fetchListState.error),
    loading: computed(() => store.fetchListState.loading),
    showPermissionPrompt,
    onMenuOpen,
    open,
    markAllRead,
    enableAlerts,
    dismissAlertsPrompt,
    refresh: tick,
  }
}
