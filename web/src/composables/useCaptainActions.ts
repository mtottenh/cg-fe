import { onMounted, onUnmounted } from 'vue'
import { storeToRefs } from 'pinia'
import { useCaptainActionsStore } from '@/stores/captainActions'
import { useAuthStore } from '@/stores/auth'

const POLL_MS = 60_000

/**
 * Composable that manages polling lifecycle for captain action items.
 * Call once at the layout level (PortalLayout) to start background polling.
 */
export function useCaptainActions() {
  const store = useCaptainActionsStore()
  const authStore = useAuthStore()
  const { sortedActions, actionCount, hasCritical, loading } = storeToRefs(store)

  let pollInterval: ReturnType<typeof setInterval> | null = null

  function startPolling() {
    stopPolling()
    pollInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      if (!authStore.isAuthenticated) return
      store.fetchActions()
    }, POLL_MS)
  }

  function stopPolling() {
    if (pollInterval) {
      clearInterval(pollInterval)
      pollInterval = null
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible' && authStore.isAuthenticated) {
      store.fetchActions()
    }
  }

  onMounted(() => {
    if (authStore.isAuthenticated) {
      store.fetchActions()
      startPolling()
    }
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    stopPolling()
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return {
    actions: sortedActions,
    actionCount,
    hasCritical,
    loading,
    refresh: () => store.fetchActions(),
  }
}
