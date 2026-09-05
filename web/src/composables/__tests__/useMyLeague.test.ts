import { describe, it, expect, beforeEach, vi } from 'vitest'
import { nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

// The composable reads memberships through the leagues store and everything
// else straight from the API client.
const apiGet = vi.fn()
vi.mock('@/api', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/api')>()),
  api: { GET: (...args: unknown[]) => apiGet(...args) },
}))

import { useAuthStore } from '@/stores/auth'
import { useLeaguesStore } from '@/stores/leagues'
import { useMyLeague } from '@/composables/useMyLeague'

function respond(url: string): { data?: unknown; error?: unknown } {
  // The memberships endpoint answers with a bare array; the rest wrap in `data`.
  if (url === '/v1/users/me/leagues') return { data: [] }
  return { data: { data: [] } }
}

describe('useMyLeague', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    localStorage.setItem('token', 'a.b.c')
    localStorage.setItem('player_id', 'player-1')
    apiGet.mockReset()
    apiGet.mockImplementation(async (url: string) => respond(url))
  })

  it('fetches memberships once for a player in no league, and does not loop', async () => {
    const auth = useAuthStore()
    // isAuthenticated derives from the token in storage; make sure of it.
    expect(auth.isAuthenticated).toBe(true)
    const leagues = useLeaguesStore()
    const spy = vi.spyOn(leagues, 'fetchMyLeagues')

    const { myLeague, refresh } = useMyLeague()
    await refresh()
    // Let any watcher the store write triggered settle, several times over.
    for (let i = 0; i < 5; i++) await nextTick()
    await new Promise((r) => setTimeout(r, 20))

    expect(spy).toHaveBeenCalledTimes(1)
    expect(myLeague.value).toBeNull()
    const membershipCalls = apiGet.mock.calls.filter(([url]) => url === '/v1/users/me/leagues')
    expect(membershipCalls).toHaveLength(1)
  })
})
