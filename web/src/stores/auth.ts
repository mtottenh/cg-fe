import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { api, setAuthToken, ApiError } from '@/api'
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
 *
 * P-152: this set named `'admin'`, and **no migration has ever seeded a role
 * called `admin`** — `0014_seed_rbac.sql` seeds `super_admin`, `platform_admin`,
 * `moderator` and `user`. So the second entry matched nothing, and the set was
 * effectively `{super_admin}`: a freshly-granted `platform_admin` was bounced
 * off every admin route by `router/index.ts:254` and never saw the sidebar.
 *
 * That silently halved P-70. Its deploy-gate rationale was "no moderator can be
 * onboarded on day one" — Lane R made *granting* possible without SQL, but the
 * grantee still could not USE the admin area, so the blocker was only half
 * retired until this.
 *
 * `platform_admin` is the seeded platform-level admin (0014: category
 * `platform`, priority 900), which is exactly what the "system-wide admin only"
 * comment above describes. `moderator` (priority 500) stays out, per that same
 * comment. This is a UI route guard, not an authorization boundary — every
 * admin endpoint enforces its own permission server-side — so this fixes who
 * gets shown the door, not who gets let through it.
 */
const SYSTEM_ADMIN_ROLES = new Set(['super_admin', 'platform_admin'])

/**
 * True when the error is a definitive auth rejection (401/403) from the
 * server. Only these should destroy stored tokens — a network blip or a
 * 5xx during app boot must NOT log the user out (it would delete a
 * perfectly valid refresh token because the API was briefly unreachable).
 */
function isAuthRejection(e: unknown): boolean {
  return e instanceof ApiError && (e.status === 401 || e.status === 403)
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
type UserRoleAssignment = components['schemas']['UserRoleAssignmentResponse']

export const useAuthStore = defineStore('auth', () => {
  // Get token and player_id from localStorage, null if not present
  const token = ref<string | null>(localStorage.getItem('token'))
  // In-memory only. The durable copy is the httpOnly cookie the backend sets;
  // persisting it to localStorage would hand any XSS a long-lived session.
  const refreshToken = ref<string | null>(null)
  // Migration: purge the copy older builds persisted.
  localStorage.removeItem('refresh_token')
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

  // Ticks every 30s so time-dependent computeds (token expiry) actually
  // re-evaluate — a computed comparing against Date.now() alone caches until
  // `token` changes, letting router guards trust an expired token.
  const authClock = ref(Date.now())
  setInterval(() => {
    authClock.value = Date.now()
  }, 30_000)

  // User is authenticated if they have a valid, non-expired token
  const isAuthenticated = computed(() => {
    const t = token.value
    if (!t || t.length === 0) return false
    const claims = decodeJwtPayload(t)
    if (claims?.exp) {
      const now = Math.floor(authClock.value / 1000)
      if (claims.exp < now - 30) return false
    }

    return true
  })

  // Check if user has admin privileges by inspecting RBAC role assignments
  // fetched from the server (JWT has no is_admin claim — see type comment above).
  const isAdmin = computed(() => {
    return roles.value.some(r => SYSTEM_ADMIN_ROLES.has(r.role.name))
  })


  // Per-action states
  const loginState = createActionState()
  const fetchCurrentUserState = createActionState()
  const fetchMyRolesState = createActionState()

  const { loading, error } = aggregateActionStates([
    loginState, fetchCurrentUserState, fetchMyRolesState,
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

      // Keep the refresh token in memory; the httpOnly cookie is the
      // durable copy.
      if (data.refresh_token) {
        refreshToken.value = data.refresh_token
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

  // (Email registration removed: Steam is the only sign-in method. The
  // backend /v1/auth/register endpoint remains for tooling and tests.)

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
   * Attempt to refresh the access token.
   *
   * Prefers the in-memory refresh token; when absent (page reload), the
   * httpOnly refresh cookie set by the backend carries the session — the
   * request goes with `credentials: 'include'` and an empty body, and the
   * backend falls back to the cookie. The refresh token is deliberately
   * never persisted to localStorage (XSS hardening).
   *
   * Returns true if successful, false if the refresh token is invalid/expired.
   */
  // True when the most recent refresh attempt was definitively rejected
  // (401/403) — as opposed to failing transiently. Lets initialize() decide
  // between logout and keep-and-retry without widening the boolean API the
  // 401 middleware consumes.
  const refreshRejected = ref(false)

  async function refreshAccessToken(): Promise<boolean> {
    const rt = refreshToken.value
    refreshRejected.value = false

    try {
      const result = await unwrapApi(api.POST('/v1/auth/refresh', {
        body: rt ? { refresh_token: rt } : {},
        credentials: 'include',
      }))

      const data = result.data

      // Update access token
      token.value = data.access_token
      localStorage.setItem('token', data.access_token)
      setAuthToken(data.access_token)

      // Update refresh token (rotation) — memory only
      if (data.refresh_token) {
        refreshToken.value = data.refresh_token
      }

      return true
    } catch (e) {
      // Only a definitive rejection invalidates the refresh token. Network
      // errors / 5xx keep it so the session survives transient failures
      // (the next 401-triggered refresh can still succeed).
      if (isAuthRejection(e)) {
        refreshToken.value = null
        refreshRejected.value = true
      }
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
        // Token exists but is expired — try to refresh before logging out.
        // Even with no in-memory refresh token (fresh page load), the
        // httpOnly refresh cookie can carry the session.
        const refreshed = await refreshAccessToken()
        if (!refreshed) {
          // Definitive 401/403 → the session is dead. A transient failure
          // (network/5xx) keeps the session material so the next attempt
          // can recover instead of forcing a re-login.
          if (refreshRejected.value) {
            logout()
          }
        } else {
          // Refreshed successfully, verify + load roles. Only an auth
          // rejection from fetchCurrentUser indicates a revoked/invalid
          // session; a role fetch hiccup is non-fatal (isAdmin just
          // starts false and reconverges).
          try {
            await fetchCurrentUser()
            await fetchMyRoles().catch(() => { roles.value = [] })
          } catch (e) {
            if (isAuthRejection(e)) logout()
          }
        }
      } else {
        // Token looks valid, verify with server + load roles for isAdmin
        try {
          await fetchCurrentUser()
          await fetchMyRoles().catch(() => { roles.value = [] })
        } catch (e) {
          // Only log out when the server definitively rejected the token
          // (revoked, etc.). Network errors / 5xx during boot keep the
          // stored tokens — the 401 middleware handles a truly dead
          // session later.
          if (isAuthRejection(e)) logout()
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


  /**
   * Drop the session locally. Does NOT talk to the server.
   *
   * This is the right call when the server has *already* invalidated us — the
   * global 401 handler (`main.ts`) uses it, because attempting a revoke with a
   * token the server just rejected would be pointless and, via the 401 handler
   * it would itself trigger, recursive.
   */
  function clearSession() {
    token.value = null
    refreshToken.value = null
    playerId.value = null
    user.value = null
    player.value = null
    roles.value = []
    localStorage.removeItem('token')
    localStorage.removeItem('player_id')
    setAuthToken(null)
  }

  /**
   * P-60: log out of THIS session, server-side as well as locally.
   *
   * Previously this only cleared localStorage, so the refresh token stayed
   * valid for its full lifetime after the user pressed "Log out" — on a shared
   * machine, "logged out" meant nothing at the server.
   *
   * Order matters: the local session is cleared FIRST, then the revoke is sent.
   * A user who clicks "log out" must end up logged out even if the network
   * hangs or the request fails; the reverse order would leave them staring at
   * a logged-in UI while a request times out. The endpoint needs no bearer
   * token (it authenticates the refresh token in the body), so clearing first
   * costs nothing.
   */
  async function logout(): Promise<void> {
    const rt = refreshToken.value
    clearSession()
    try {
      await unwrapApi(api.POST('/v1/auth/logout', {
        body: rt ? { refresh_token: rt } : {},
        credentials: 'include',
      }))
    } catch {
      // Best effort, and deliberately swallowed: the local session is already
      // gone and the refresh token expires on its own. Surfacing an error here
      // would tell the user their logout failed when, locally, it did not.
    }
  }

  /**
   * P-60: revoke every session for this user — the "log out of all devices"
   * control, built for compromise response (`handlers/auth.rs` logout-all).
   *
   * Unlike `logout`, this one needs the bearer token, so the request must go
   * out BEFORE the local session is cleared — hence try/finally rather than
   * clear-first.
   */
  async function logoutAll(): Promise<void> {
    try {
      await unwrapApi(api.POST('/v1/auth/logout-all', { credentials: 'include' }))
    } finally {
      clearSession()
    }
  }

  return {
    token,
    refreshToken,
    clearSession,
    logoutAll,
    playerId,
    user,
    player,
    roles,
    loading,
    error,
    initialized,
    isAuthenticated,
    isAdmin,
    initialize,
    login,
    loginWithTokens,

    fetchCurrentUser,
    fetchMyRoles,
    refreshAccessToken,
    setToken,
    logout,
    // Per-action states
    loginState,

    fetchCurrentUserState,
    fetchMyRolesState,
  }
})

// Re-export types for convenience
export type { User, Player, LoginRequest, LoginResponse }
