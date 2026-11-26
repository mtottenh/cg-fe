import { onMounted, onUnmounted } from 'vue'

/**
 * Re-run `refresh` on an interval, and when the tab comes back into view,
 * for as long as `enabled()` holds. Skips ticks while the tab is hidden or a
 * previous refresh is still in flight.
 *
 * For pages people leave open while something is happening elsewhere — a
 * tournament's fixtures and table while its matches are being played.
 */
export function useLiveRefresh(
  refresh: () => Promise<unknown> | void,
  options: { intervalMs: number; enabled: () => boolean },
) {
  let timer: ReturnType<typeof setInterval> | null = null
  let inFlight = false

  async function tick() {
    if (inFlight) return
    if (document.visibilityState === 'hidden') return
    if (!options.enabled()) return
    inFlight = true
    try {
      await refresh()
    } catch {
      // A failed background refresh is retried on the next tick.
    } finally {
      inFlight = false
    }
  }

  function onVisibilityChange() {
    if (document.visibilityState === 'visible') void tick()
  }

  onMounted(() => {
    timer = setInterval(() => void tick(), options.intervalMs)
    document.addEventListener('visibilitychange', onVisibilityChange)
  })

  onUnmounted(() => {
    if (timer) clearInterval(timer)
    timer = null
    document.removeEventListener('visibilitychange', onVisibilityChange)
  })

  return { tick }
}
