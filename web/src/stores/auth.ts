import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setAuthToken } from '@/api'
import type { components } from '@/api/types'
import { unwrapApi, createActionState, withActionState, aggregateActionStates } from '@/stores/helpers'

/** JWT claims structure matching backend (see portal-domain/src/jwt.rs).
 *
 * NOTE: `is_admin` is intentionally NOT in the claim set. The backend moved
 * role/admin resolution to live RBAC tables so the DB is the single source
 * of truth on every request (the comment in `jwt.rs` explains the staleness
 * problem the old claim created). Admin-ness is derived from
 * `/v1/users/me/roles` instead — see `fetchMyRoles()` below.
 */
interface JwtClaims {
  sub: string
  player_id: string
  username: string
  exp: number
  iat: number
}

/** Role names the frontend treats as "can see the admin UI".
 *
 * The backend exposes RBAC via `/v1/users/me/roles` — any assignment whose
 * `role.name` appears in this set unlocks the admin sidebar button and the
 * `requiresAdmin` router guard. Scope is intentionally coarse (system-wide
 * admin only, not league/tournament moderators).
 */
const SYSTEM_ADMIN_ROLES = new Set(['super_admin', 'admin'])

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
type UserRoleAssignment = components['schemas']['UserRoleAssignmentResponse']

export const useAuthStore = defineStore('auth', () => {
  // Get token and player_id from localStorage, null if not present
  const token = ref<string | null>(localStorage.getItem('token'))
  const refreshToken = ref<string | null>(localStorage.getItem('refresh_token'))
  const playerId = ref<string | null>(localStorage.getItem('player_id'))
  const user = ref<User | null>(null)
  const player = ref<Player | null>(null)
  const roles = ref<UserRoleAssignment[]>([])

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
    if (t === 'dev-token') return false

    const claims = decodeJwtPayload(t)
    if (claims?.exp) {
      const now = Math.floor(Date.now() / 1000)
      if (claims.exp < now - 30) return false
    }

    return true
  })

  // Check if user has admin privileges by inspecting RBAC role assignments
  // fetched from the server (JWT has no is_admin claim — see type comment above).
  const isAdmin = computed(() => {
    return roles.value.some(r => SYSTEM_ADMIN_ROLES.has(r.role.name))
  })

  // Check if running in dev mode (dev-token set)
  const isDevMode = computed(() => token.value === 'dev-token')

  // Per-action states
  const loginState = createActionState()
  const registerState = createActionState()
  const fetchCurrentUserState = createActionState()
  const fetchMyRolesState = createActionState()

  const { loading, error } = aggregateActionStates([
    loginState, registerState, fetchCurrentUserState, fetchMyRolesState,
  ])

  async function login(credentials: LoginRequest): Promise<LoginResponse> {
    return withActionState(loginState, async () => {
      const result = await unwrapApi(api.POST('/v1/auth/login', {
        body: credentials,
      }))

      const data = result.data

      // Store the access token
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      setAuthToken(data.access_token)

      // Store the refresh token
      if (data.refresh_token) {
        refreshToken.value = data.refresh_token
        localStorage.setItem('refresh_token', data.refresh_token)
      }

      if (data.player_id) {
        playerId.value = data.player_id
        localStorage.setItem('player_id', data.player_id)
      }

      // Load roles immediately so isAdmin is correct before the router
      // sees the next navigation (admin guard fires on beforeEach).
      await fetchMyRoles().catch(() => { roles.value = [] })

      return data
    }, 'Login failed')
  }

  async function register(credentials: RegisterRequest): Promise<RegisterResponse> {
    return withActionState(registerState, async () => {
      const result = await unwrapApi(api.POST('/v1/auth/register', {
        body: credentials,
      }))

      const data = result.data

      // Store the access token
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      setAuthToken(data.access_token)

      // Store the refresh token
      if (data.refresh_token) {
        refreshToken.value = data.refresh_token
        localStorage.setItem('refresh_token', data.refresh_token)
      }

      // Store user and player
      user.value = data.user
      player.value = data.player
      playerId.value = data.player.id
      localStorage.setItem('player_id', data.player.id)

      // Load roles (empty for fresh registrations — but keeps the contract).
      await fetchMyRoles().catch(() => { roles.value = [] })

      return data
    }, 'Registration failed')
  }

  /**
   * Complete a token-based (Steam) sign-in.
   *
   * The Steam OpenID callback hands the browser an access + refresh token
   * pair in the URL fragment; this stores them exactly like password login
   * does (localStorage + auth header), derives the player id from the JWT
   * claims, and loads the user profile + roles.
   */
  async function loginWithTokens(accessToken: string, newRefreshToken: string | null): Promise<void> {
    return withActionState(loginState, async () => {
      token.value = accessToken
      localStorage.setItem('token', accessToken)
      setAuthToken(accessToken)

      if (newRefreshToken) {
        refreshToken.value = newRefreshToken
        localStorage.setItem('refresh_token', newRefreshToken)
      }

      // Password login gets player_id from the response body; here it
      // comes from the JWT claims (same value, signed by the backend).
      const claims = decodeJwtPayload(accessToken)
      if (claims?.player_id) {
        playerId.value = claims.player_id
        localStorage.setItem('player_id', claims.player_id)
      }

      // Verify the token against the server and populate user + roles.
      // A rejected token must not leave us half-logged-in.
      try {
        await fetchCurrentUser()
      } catch (e) {
        logout()
        throw e
      }
      await fetchMyRoles().catch(() => { roles.value = [] })
    }, 'Steam sign-in failed')
  }

  async function fetchCurrentUser(): Promise<User> {
    return withActionState(fetchCurrentUserState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me'))
      user.value = result.data
      return user.value
    }, 'Failed to fetch user')
  }

  /** Fetch the current user's role assignments. Populates `roles` which
   * backs the `isAdmin` computed. Admin-gated routes + UI check this. */
  async function fetchMyRoles(): Promise<UserRoleAssignment[]> {
    return withActionState(fetchMyRolesState, async () => {
      const result = await unwrapApi(api.GET('/v1/users/me/roles'))
      roles.value = result.data
      return roles.value
    }, 'Failed to fetch roles')
  }

  /**
   * Attempt to refresh the access token using the stored refresh token.
   * Returns true if successful, false if the refresh token is invalid/expired.
   */
  async function refreshAccessToken(): Promise<boolean> {
    const rt = refreshToken.value
    if (!rt) return false

    try {
      const result = await unwrapApi(api.POST('/v1/auth/refresh', {
        body: { refresh_token: rt },
      }))

      const data = result.data

      // Update access token
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      setAuthToken(data.access_token)

      // Update refresh token (rotation)
      if (data.refresh_token) {
        refreshToken.value = data.refresh_token
        localStorage.setItem('refresh_token', data.refresh_token)
      }

      return true
    } catch {
      // Refresh failed — clear refresh token
      refreshToken.value = null
      localStorage.removeItem('refresh_token')
      return false
    }
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
        // Token exists but is expired — try to refresh before logging out
        if (refreshToken.value) {
          const refreshed = await refreshAccessToken()
          if (!refreshed) {
            logout()
          } else {
            // Refreshed successfully, verify + load roles. Only fetchCurrentUser
            // failing indicates a revoked/invalid session; a role fetch hiccup
            // is non-fatal (isAdmin just starts false and reconverges).
            try {
              await fetchCurrentUser()
              await fetchMyRoles().catch(() => { roles.value = [] })
            } catch {
              logout()
            }
          }
        } else {
          logout()
        }
      } else {
        // Token looks valid, verify with server + load roles for isAdmin
        try {
          await fetchCurrentUser()
          await fetchMyRoles().catch(() => { roles.value = [] })
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

  function enableDevMode() {
    setToken('dev-token')
  }

  function logout() {
    token.value = null
    refreshToken.value = null
    playerId.value = null
    user.value = null
    player.value = null
    roles.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('refresh_token')
    localStorage.removeItem('player_id')
    setAuthToken(null)
  }

  return {
    token,
    refreshToken,
    playerId,
    user,
    player,
    roles,
    loading,
    error,
    initialized,
    isAuthenticated,
    isAdmin,
    isDevMode,
    initialize,
    login,
    loginWithTokens,
    register,
    fetchCurrentUser,
    fetchMyRoles,
    refreshAccessToken,
    setToken,
    enableDevMode,
    logout,
    // Per-action states
    loginState,
    registerState,
    fetchCurrentUserState,
    fetchMyRolesState,
  }
})

// Re-export types for convenience
export type { User, Player, LoginRequest, LoginResponse, RegisterRequest, RegisterResponse }
