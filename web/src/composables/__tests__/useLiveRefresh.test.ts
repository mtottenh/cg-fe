import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { createApp, defineComponent, h } from 'vue'
import { useLiveRefresh } from '@/composables/useLiveRefresh'

function mountWith(refresh: () => Promise<unknown>, enabled: () => boolean) {
  const app = createApp(
    defineComponent({
      setup() {
        useLiveRefresh(refresh, { intervalMs: 30_000, enabled })
        return () => h('div')
      },
    }),
  )
  app.mount(document.createElement('div'))
  return () => app.unmount()
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

describe('useLiveRefresh', () => {
  let unmount: () => void = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
  })

  afterEach(() => {
    unmount()
    vi.useRealTimers()
    setVisibility('visible')
  })

  it('refreshes on each interval while enabled', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    unmount = mountWith(refresh, () => true)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(1)
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })

  it('does nothing while disabled or while the tab is hidden', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    let enabled = false
    unmount = mountWith(refresh, () => enabled)

    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).not.toHaveBeenCalled()

    enabled = true
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(30_000)
    expect(refresh).not.toHaveBeenCalled()
  })

  it('refreshes at once when the tab comes back into view', async () => {
    const refresh = vi.fn().mockResolvedValue(undefined)
    unmount = mountWith(refresh, () => true)

    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)

    expect(refresh).toHaveBeenCalledTimes(1)
  })

  it('survives a failed refresh and stops after unmount', async () => {
    const refresh = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue(undefined)
    unmount = mountWith(refresh, () => true)

    await vi.advanceTimersByTimeAsync(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)

    unmount()
    unmount = () => {}
    await vi.advanceTimersByTimeAsync(60_000)
    expect(refresh).toHaveBeenCalledTimes(2)
  })
})
