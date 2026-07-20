import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock the api module before importing the store
const apiGet = vi.fn()
const apiPost = vi.fn()
const setAuthToken = vi.fn()

vi.mock('@/api', () => ({
  api: {
    GET: (...args: unknown[]) => apiGet(...args),
    POST: (...args: unknown[]) => apiPost(...args),
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

const NOW = Math.floor(Date.now() / 1000)
const VALID_JWT = fakeJwt({ sub: 'u1', player_id: 'p1', username: 'max', exp: NOW + 900, iat: NOW })
const EXPIRED_JWT = fakeJwt({ sub: 'u1', player_id: 'p1', username: 'max', exp: NOW - 3600, iat: NOW - 4500 })

const ME_RESPONSE = {
  data: {
    data: {
      id: 'u1',
      username: 'max',
      email: 'max@example.com',
      auth_provider: 'local',
      email_verified: true,
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

function seedStorage(token: string) {
  // The refresh token is no longer persisted — after a reload the store
  // relies on the httpOnly refresh cookie (sent via credentials: 'include').
  localStorageMock.setItem('token', token)
}

describe('Auth Store — initialize() logout-only-on-auth-error', () => {
  beforeEach(() => {
    localStorageMock.clear()
    vi.clearAllMocks()
  })

  function freshStore() {
    setActivePinia(createPinia())
    return useAuthStore()
  }

  describe('valid stored token', () => {
    it('keeps the session when /users/me fails with a network error', async () => {
      seedStorage(VALID_JWT)
      apiGet.mockRejectedValue(new TypeError('fetch failed'))

      const store = freshStore()
      await store.initialize()

      expect(store.initialized).toBe(true)
      expect(store.token).toBe(VALID_JWT)
      expect(localStorageMock.removeItem).not.toHaveBeenCalledWith('token')
    })

    it('keeps the session when /users/me fails with a 500', async () => {
      seedStorage(VALID_JWT)
      apiGet.mockResolvedValue({ error: { status: 500, detail: 'internal error' } })

      const store = freshStore()
      await store.initialize()

      expect(store.initialized).toBe(true)
      expect(store.token).toBe(VALID_JWT)
    })

    it('logs out when /users/me is rejected with 401', async () => {
      seedStorage(VALID_JWT)
      apiGet.mockResolvedValue({ error: { status: 401, detail: 'Invalid or missing token' } })

      const store = freshStore()
      await store.initialize()

      expect(store.initialized).toBe(true)
      expect(store.token).toBeNull()
      expect(store.refreshToken).toBeNull()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
    })

    it('logs out when /users/me is rejected with 403', async () => {
      seedStorage(VALID_JWT)
      apiGet.mockResolvedValue({ error: { status: 403, detail: 'Forbidden' } })

      const store = freshStore()
      await store.initialize()

      expect(store.token).toBeNull()
      expect(store.refreshToken).toBeNull()
    })
  })

  describe('expired stored token (cookie refresh path)', () => {
    it('keeps the session when the refresh call hits a network error (transient)', async () => {
      seedStorage(EXPIRED_JWT)
      apiPost.mockRejectedValue(new TypeError('fetch failed'))

      const store = freshStore()
      await store.initialize()

      expect(store.initialized).toBe(true)
      // Session material preserved so a later attempt can recover.
      expect(store.token).toBe(EXPIRED_JWT)
    })

    it('keeps the session when the refresh call fails with a 500 (transient)', async () => {
      seedStorage(EXPIRED_JWT)
      apiPost.mockResolvedValue({ error: { status: 500, detail: 'internal error' } })

      const store = freshStore()
      await store.initialize()

      expect(store.token).toBe(EXPIRED_JWT)
    })

    it('logs out when the refresh is definitively rejected (401)', async () => {
      seedStorage(EXPIRED_JWT)
      apiPost.mockResolvedValue({ error: { status: 401, detail: 'invalid refresh token' } })

      const store = freshStore()
      await store.initialize()

      expect(store.token).toBeNull()
      expect(store.refreshToken).toBeNull()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
    })

    it('refreshes via the cookie (empty body, credentials include) and loads the user', async () => {
      seedStorage(EXPIRED_JWT)
      apiPost.mockResolvedValue({
        data: { data: { access_token: VALID_JWT, refresh_token: 'refresh-2' } },
      })
      apiGet.mockImplementation((path: unknown) => {
        if (path === '/v1/users/me') return Promise.resolve(ME_RESPONSE)
        if (path === '/v1/users/me/roles') return Promise.resolve(ROLES_RESPONSE)
        return Promise.resolve({ error: { status: 404, detail: 'not found' } })
      })

      const store = freshStore()
      await store.initialize()

      // No in-memory refresh token after reload → cookie carries the session.
      expect(apiPost).toHaveBeenCalledWith('/v1/auth/refresh', {
        body: {},
        credentials: 'include',
      })
      expect(store.token).toBe(VALID_JWT)
      expect(store.refreshToken).toBe('refresh-2')
      expect(store.user?.username).toBe('max')
      expect(store.isAuthenticated).toBe(true)
    })

    it('does not persist the rotated refresh token to localStorage', async () => {
      seedStorage(EXPIRED_JWT)
      apiPost.mockResolvedValue({
        data: { data: { access_token: VALID_JWT, refresh_token: 'refresh-2' } },
      })
      apiGet.mockResolvedValue(ME_RESPONSE)

      const store = freshStore()
      await store.initialize()

      expect(store.refreshToken).toBe('refresh-2')
      expect(localStorageMock.setItem).not.toHaveBeenCalledWith('refresh_token', expect.anything())
    })
  })
})
