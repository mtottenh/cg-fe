import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the api module before importing the store
const apiGet = vi.fn()
const setAuthToken = vi.fn()

vi.mock('@/api', () => ({
  api: {
    GET: (...args: unknown[]) => apiGet(...args),
    POST: vi.fn(),
  },
  setAuthToken: (...args: unknown[]) => setAuthToken(...args),
  getAuthToken: vi.fn(),
  ApiError: class ApiError extends Error {
    status: number
    detail: string
    constructor(status: number, detail: string) {
      super(detail)
      this.status = status
      this.detail = detail
    }
  },
  handleApiError: vi.fn(),
}))

import { useAuthStore } from '../auth'

// Mock localStorage
const localStorageMock = (() => {
  let store: Record<string, string> = {}
  return {
    getItem: vi.fn((key: string) => store[key] || null),
    setItem: vi.fn((key: string, value: string) => {
      store[key] = value
    }),
    removeItem: vi.fn((key: string) => {
      delete store[key]
    }),
    clear: vi.fn(() => {
      store = {}
    }),
  }
})()

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
})

/** Build an unsigned JWT with the given claims (payload only matters). */
function fakeJwt(claims: Record<string, unknown>): string {
  const b64 = (obj: Record<string, unknown>) =>
    btoa(JSON.stringify(obj)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  return `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64(claims)}.signature`
}

const CLAIMS = {
  sub: 'user-1',
  player_id: 'player-1',
  username: 'steamuser',
  exp: Math.floor(Date.now() / 1000) + 900,
  iat: Math.floor(Date.now() / 1000),
}

const ME_RESPONSE = {
  data: {
    data: {
      id: 'user-1',
      username: 'steamuser',
      email: 'steam_1@steam.invalid',
      auth_provider: 'steam',
      email_verified: false,
      status: 'active',
      locale: 'en-US',
      timezone: 'UTC',
      two_factor_enabled: false,
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
      last_login_at: null,
    },
  },
}

const ROLES_RESPONSE = { data: { data: [] } }

describe('Auth Store — loginWithTokens (Steam)', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
    setActivePinia(createPinia())

    apiGet.mockImplementation((path: unknown) => {
      if (path === '/v1/users/me') return Promise.resolve(ME_RESPONSE)
      if (path === '/v1/users/me/roles') return Promise.resolve(ROLES_RESPONSE)
      return Promise.resolve({ error: { status: 404, detail: 'not found' } })
    })
  })

  it('stores tokens, derives player id from JWT claims, and loads the user', async () => {
    const store = useAuthStore()
    const jwt = fakeJwt(CLAIMS)

    await store.loginWithTokens(jwt, 'refresh-abc')

    expect(store.token).toBe(jwt)
    expect(store.refreshToken).toBe('refresh-abc')
    expect(store.playerId).toBe('player-1')
    expect(store.isAuthenticated).toBe(true)

    expect(localStorageMock.setItem).toHaveBeenCalledWith('token', jwt)
    expect(localStorageMock.setItem).toHaveBeenCalledWith('refresh_token', 'refresh-abc')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('player_id', 'player-1')
    expect(setAuthToken).toHaveBeenCalledWith(jwt)

    // Profile fetched from the server
    expect(store.user?.username).toBe('steamuser')
    expect(store.user?.auth_provider).toBe('steam')
  })

  it('works without a refresh token', async () => {
    const store = useAuthStore()
    const jwt = fakeJwt(CLAIMS)

    await store.loginWithTokens(jwt, null)

    expect(store.token).toBe(jwt)
    expect(store.refreshToken).toBeNull()
    expect(localStorageMock.setItem).not.toHaveBeenCalledWith('refresh_token', expect.anything())
  })

  it('logs out when the server rejects the token', async () => {
    apiGet.mockImplementation((path: unknown) => {
      if (path === '/v1/users/me') {
        return Promise.resolve({ error: { status: 401, detail: 'Invalid or missing token' } })
      }
      return Promise.resolve({ data: { data: [] } })
    })

    const store = useAuthStore()
    const jwt = fakeJwt(CLAIMS)

    await expect(store.loginWithTokens(jwt, 'refresh-abc')).rejects.toThrow()

    expect(store.token).toBeNull()
    expect(store.refreshToken).toBeNull()
    expect(store.playerId).toBeNull()
    expect(store.user).toBeNull()
  })

  it('does not mark the session admin without admin roles', async () => {
    const store = useAuthStore()
    await store.loginWithTokens(fakeJwt(CLAIMS), 'refresh-abc')
    expect(store.isAdmin).toBe(false)
  })
})
