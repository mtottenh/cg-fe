/**
 * P-60: logout must revoke the session server-side, not just locally.
 *
 * Before the fix, `logout()` cleared localStorage and nothing else — so the
 * refresh token stayed valid for its full lifetime after the user pressed
 * "Log out". On a shared machine, "logged out" meant nothing at the server.
 *
 * These pin the three properties that make the fix trustworthy:
 *   1. the revoke is actually sent, with the refresh token
 *   2. a FAILING revoke still logs you out locally (never strand the user)
 *   3. `clearSession` does NOT call the server — the 401 handler depends on
 *      that, or it would recurse through its own handler
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useAuthStore } from '../auth'

const mockPost = vi.fn()
vi.mock('@/api', async () => {
  const actual = await vi.importActual<typeof import('@/api')>('@/api')
  return {
    ...actual,
    api: { POST: (...args: unknown[]) => mockPost(...args) },
    setAuthToken: vi.fn(),
  }
})

const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((k: string) => store[k] ?? null),
    setItem: vi.fn((k: string, v: string) => {
      store[k] = v
    }),
    removeItem: vi.fn((k: string) => {
      delete store[k]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()
Object.defineProperty(window, 'localStorage', { value: localStorageMock })

describe('P-60 — logout revokes server-side', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())
    mockPost.mockResolvedValue({ data: { data: { logged_out: true } } })
  })

  it('sends the revoke, carrying the refresh token', async () => {
    const store = useAuthStore()
    store.token = 'access-abc'
    store.refreshToken = 'refresh-xyz'

    await store.logout()

    expect(mockPost).toHaveBeenCalledWith(
      '/v1/auth/logout',
      expect.objectContaining({ body: { refresh_token: 'refresh-xyz' } }),
    )
    expect(store.token).toBeNull()
    expect(store.refreshToken).toBeNull()
  })

  it('still logs out locally when the revoke FAILS', async () => {
    // The important one. A user who clicks "log out" must end up logged out
    // even if the network is down — the old bug was silent persistence, and
    // over-correcting into "logout fails loudly and leaves you signed in"
    // would be worse.
    const store = useAuthStore()
    store.token = 'access-abc'
    store.refreshToken = 'refresh-xyz'
    mockPost.mockRejectedValue(new Error('network down'))

    await expect(store.logout()).resolves.toBeUndefined()

    expect(store.token).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
  })

  it('clearSession does NOT call the server', async () => {
    // main.ts wires the global 401 handler to clearSession precisely so a
    // rejected token does not trigger a revoke that would 401 in turn and
    // re-enter the handler.
    const store = useAuthStore()
    store.token = 'access-abc'
    store.refreshToken = 'refresh-xyz'

    store.clearSession()

    expect(mockPost).not.toHaveBeenCalled()
    expect(store.token).toBeNull()
  })

  it('logoutAll revokes every session and clears even on failure', async () => {
    const store = useAuthStore()
    store.token = 'access-abc'

    await store.logoutAll()
    expect(mockPost).toHaveBeenCalledWith('/v1/auth/logout-all', expect.anything())
    expect(store.token).toBeNull()

    // and on failure the local session still goes
    store.token = 'access-def'
    mockPost.mockRejectedValue(new Error('boom'))
    await expect(store.logoutAll()).rejects.toThrow()
    expect(store.token).toBeNull()
  })
})
