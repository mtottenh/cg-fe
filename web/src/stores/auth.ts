import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setAuthToken } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState } from '@/stores/helpers'

/** JWT claims structure matching backend */
interface JwtClaims {
  sub: string
  player_id: string
  username: string
  is_admin: boolean
  exp: number
  iat: number
}

/** Decode JWT payload without verification (verification happens on backend) */
function decodeJwtPayload(token: string): JwtClaims | null {
  try {
    const parts = token.split('.')
    if (parts.length !== 3) return null
    const payload = parts[1]
    if (!payload) return null
    const decoded = atob(payload.replace(/-/g, '+').replace(/_/g, '/'))
    return JSON.parse(decoded)
  } catch {
    return null
  }
}

// Use generated types
type User = components['schemas']['UserResponse']
type Player = components['schemas']['PlayerResponse']
type LoginRequest = components['schemas']['LoginRequest']
type LoginResponse = components['schemas']['LoginResponse']
type RegisterRequest = components['schemas']['RegisterRequest']
type RegisterResponse = components['schemas']['RegisterResponse']

export const useAuthStore = defineStore('auth', () => {
  // Get token and player_id from localStorage, null if not present
  const token = ref<string | null>(localStorage.getItem('token'))
  const playerId = ref<string | null>(localStorage.getItem('player_id'))
  const user = ref<User | null>(null)
  const player = ref<Player | null>(null)
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Initialize auth token from stored value
  if (token.value) {
    setAuthToken(token.value)
  }

  // Initialization gate — true once initialize() has run
  const initialized = ref(false)

  // User is authenticated if they have a valid, non-expired token
  const isAuthenticated = computed(() => {
    const t = token.value
    if (!t || t.length === 0) return false

    const claims = decodeJwtPayload(t)
    if (!claims) return false

    // Token expired if exp is in the past (with 30-second buffer)
    const now = Math.floor(Date.now() / 1000)
    if (claims.exp && claims.exp < now - 30) {
      return false
    }

    return true
  })

  // Check if user has admin privileges by decoding JWT claims
  const isAdmin = computed(() => {
    if (!token.value) return false
    const claims = decodeJwtPayload(token.value)
    return claims?.is_admin ?? false
  })

  // Per-action states
  const loginState = createActionState()
  const registerState = createActionState()
  const fetchCurrentUserState = createActionState()

  async function login(credentials: LoginRequest): Promise<LoginResponse> {
    return withActionState(loginState, async () => {
      const result = await unwrapApi(api.POST('/v1/auth/login', {
        body: credentials,
      }))

      const data = result.data

      // Store the token and player_id
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      setAuthToken(data.access_token)

      if (data.player_id) {
        playerId.value = data.player_id
        localStorage.setItem('player_id', data.player_id)
      }

      return data
    }, 'Login failed')
  }

  async function register(credentials: RegisterRequest): Promise<RegisterResponse> {
    return withActionState(registerState, async () => {
      const result = await unwrapApi(api.POST('/v1/auth/register', {
        body: credentials,
      }))

      const data = result.data

      // Store the token from registration
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      setAuthToken(data.access_token)

      // Store user and player
      user.value = data.user
      player.value = data.player
      playerId.value = data.player.id
      localStorage.setItem('player_id', data.player.id)

      return data
    }, 'Registration failed')
  }

  async function fetchCurrentUser(): Promise<User> {
    return withActionState(fetchCurrentUserState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me'))
      user.value = result.data
      return user.value
    }, 'Failed to fetch user')
  }

  /**
   * Initialize auth state on app boot.
   * Validates stored token and fetches user profile if valid.
   * Must be called before router guards check auth state.
   */
  async function initialize(): Promise<void> {
    if (initialized.value) return

    if (token.value) {
      if (!isAuthenticated.value) {
        // Token exists but is expired or invalid
        logout()
      } else {
        // Token looks valid, verify with server
        try {
          await fetchCurrentUser()
        } catch {
          // Token rejected by server (revoked, etc.)
          logout()
        }
      }
    }

    initialized.value = true
  }

  function setToken(newToken: string) {
    token.value = newToken
    localStorage.setItem('token', newToken)
    setAuthToken(newToken)
  }

  function logout() {
    token.value = null
    playerId.value = null
    user.value = null
    player.value = null
    localStorage.removeItem('token')
    localStorage.removeItem('player_id')
    setAuthToken(null)
  }

  return {
    token,
    playerId,
    user,
    player,
    loading,
    error,
    initialized,
    isAuthenticated,
    isAdmin,
    initialize,
    login,
    register,
    fetchCurrentUser,
    setToken,
    logout,
    // Per-action states
    loginState,
    registerState,
    fetchCurrentUserState,
  }
})

// Re-export types for convenience
export type { User, Player, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse }
