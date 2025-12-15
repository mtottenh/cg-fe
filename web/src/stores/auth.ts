import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setAuthToken, ApiError } from '@/api'
import type { components } from '@/api/types'

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
type ApiErrorResponse = components['schemas']['ApiError']

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

  // User is authenticated if they have a valid token
  const isAuthenticated = computed(() => {
    const t = token.value
    return !!t && t.length > 0
  })

  // Check if user has admin privileges by decoding JWT claims
  const isAdmin = computed(() => {
    // No token means not admin
    if (!token.value) return false

    // Decode JWT and check is_admin claim
    const claims = decodeJwtPayload(token.value)
    return claims?.is_admin ?? false
  })

  async function login(credentials: LoginRequest): Promise<LoginResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/auth/login', {
        body: credentials,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const result = data!.data

      // Store the token and player_id
      token.value = result.access_token
      localStorage.setItem('token', result.access_token)
      setAuthToken(result.access_token)

      if (result.player_id) {
        playerId.value = result.player_id
        localStorage.setItem('player_id', result.player_id)
      }

      return result
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Login failed'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function register(credentials: RegisterRequest): Promise<RegisterResponse> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.POST('/v1/auth/register', {
        body: credentials,
      })

      if (apiError) {
        const err = apiError as ApiErrorResponse
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      const result = data!.data

      // Store the token from registration
      token.value = result.access_token
      localStorage.setItem('token', result.access_token)
      setAuthToken(result.access_token)

      // Store user and player
      user.value = result.user
      player.value = result.player
      playerId.value = result.player.id
      localStorage.setItem('player_id', result.player.id)

      return result
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Registration failed'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function fetchCurrentUser(): Promise<User> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/users/me')

      if (apiError) {
        const err = apiError as ApiErrorResponse
        // If unauthorized, clear the token
        if (err.status === 401) {
          logout()
        }
        throw new ApiError(err.status, err.detail, err.errors ?? undefined)
      }

      user.value = data!.data
      return user.value
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch user'
      }
      throw e
    } finally {
      loading.value = false
    }
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
    isAuthenticated,
    isAdmin,
    login,
    register,
    fetchCurrentUser,
    setToken,
    logout,
  }
})

// Re-export types for convenience
export type { User, Player, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse }
