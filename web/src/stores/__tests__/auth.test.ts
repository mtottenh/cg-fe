import { describe, it, expect, beforeEach, vi } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
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

describe('Auth Store', () => {
  beforeEach(() => {
    // Reset mocks and localStorage
    localStorageMock.clear()
    vi.clearAllMocks()

    // Create fresh pinia instance
    setActivePinia(createPinia())
  })

  describe('initial state', () => {
    it('should have null token when localStorage is empty', () => {
      const store = useAuthStore()
      expect(store.token).toBeNull()
    })

    it('should load token from localStorage on initialization', () => {
      localStorageMock.getItem.mockReturnValueOnce('existing-token')
      setActivePinia(createPinia())
      const store = useAuthStore()
      expect(store.token).toBe('existing-token')
    })

    it('should have null user initially', () => {
      const store = useAuthStore()
      expect(store.user).toBeNull()
    })

    it('should have null player initially', () => {
      const store = useAuthStore()
      expect(store.player).toBeNull()
    })

    it('should not be loading initially', () => {
      const store = useAuthStore()
      expect(store.loading).toBe(false)
    })

    it('should have no error initially', () => {
      const store = useAuthStore()
      expect(store.error).toBeNull()
    })
  })

  describe('isAuthenticated', () => {
    it('should return false when token is null', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
    })

    it('should return false when token is empty string', () => {
      const store = useAuthStore()
      store.setToken('')
      expect(store.isAuthenticated).toBe(false)
    })

    it('should return true when token is a valid JWT-like string', () => {
      const store = useAuthStore()
      store.setToken('eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.test.signature')
      expect(store.isAuthenticated).toBe(true)
    })
  })

  describe('setToken', () => {
    it('should set the token value', () => {
      const store = useAuthStore()
      store.setToken('new-token')
      expect(store.token).toBe('new-token')
    })

    it('should persist token to localStorage', () => {
      const store = useAuthStore()
      store.setToken('persisted-token')
      expect(localStorageMock.setItem).toHaveBeenCalledWith('token', 'persisted-token')
    })
  })

  describe('logout', () => {
    it('should clear the token', () => {
      const store = useAuthStore()
      store.setToken('some-token')
      store.logout()
      expect(store.token).toBeNull()
    })

    it('should clear the user', () => {
      const store = useAuthStore()
      store.user = {
        id: '1',
        username: 'test',
        email: 'test@example.com',
        auth_provider: 'local',
        created_at: '',
        updated_at: '',
        email_verified: true,
        locale: 'en-US',
        status: 'active',
        timezone: 'UTC',
        two_factor_enabled: false,
      }
      store.logout()
      expect(store.user).toBeNull()
    })

    it('should clear the player', () => {
      const store = useAuthStore()
      store.player = {
        id: '1',
        display_name: 'Test Player',
        user_id: 'user-1',
        created_at: '',
        updated_at: '',
        social_links: {},
        steam_linked: false,
        looking_for_team: false,
      }
      store.logout()
      expect(store.player).toBeNull()
    })

    it('should remove token from localStorage', () => {
      const store = useAuthStore()
      store.setToken('token-to-remove')
      store.logout()
      expect(localStorageMock.removeItem).toHaveBeenCalledWith('token')
    })
  })

  describe('state transitions', () => {
    it('should transition from unauthenticated to authenticated on setToken', () => {
      const store = useAuthStore()
      expect(store.isAuthenticated).toBe(false)
      store.setToken('real-jwt-token')
      expect(store.isAuthenticated).toBe(true)
    })

    it('should transition from authenticated to unauthenticated on logout', () => {
      const store = useAuthStore()
      store.setToken('real-jwt-token')
      expect(store.isAuthenticated).toBe(true)
      store.logout()
      expect(store.isAuthenticated).toBe(false)
    })

    it('should treat the legacy dev-token like any other opaque token (bypass removed)', () => {
      const store = useAuthStore()
      store.setToken('dev-token')
      // No special-casing remains: a non-JWT string has no exp claim and is
      // treated as authenticated client-side (server still rejects it).
      expect(store.isAuthenticated).toBe(true)
    })
  })
})
