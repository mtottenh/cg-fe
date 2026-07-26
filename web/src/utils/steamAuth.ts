/**
 * Steam sign-in helpers.
 *
 * The backend completes Steam OpenID sign-in by redirecting the browser to
 * `/auth/steam/complete#access_token=...&refresh_token=...`. Tokens travel
 * in the URL *fragment* (never the query string) so they don't reach server
 * or proxy logs. This module parses that fragment.
 */

import { API_BASE_URL } from '@/api/baseUrl'

export interface SteamCallbackTokens {
  accessToken: string
  refreshToken: string | null
}

/**
 * Parse the `#access_token=...&refresh_token=...` fragment produced by the
 * backend's Steam callback redirect.
 *
 * Accepts the raw `window.location.hash` (with or without the leading `#`).
 * Returns `null` when no access token is present (e.g. the user navigated
 * here directly).
 */
export function parseSteamCallbackFragment(hash: string): SteamCallbackTokens | null {
  const fragment = hash.startsWith('#') ? hash.slice(1) : hash
  if (!fragment) return null

  const params = new URLSearchParams(fragment)
  const accessToken = params.get('access_token')
  if (!accessToken) return null

  const refreshToken = params.get('refresh_token')
  return {
    accessToken,
    refreshToken: refreshToken && refreshToken.length > 0 ? refreshToken : null,
  }
}

/** URL of the backend endpoint that starts the Steam OpenID flow. */
export function steamLoginUrl(): string {
  // May be relative (same-origin deploy) — fine for window.location navigation.
  return `${API_BASE_URL}/v1/auth/steam/login`
}

// -----------------------------------------------------------------------------
// Post-login destination
//
// The router writes `?redirect=` when it bounces an unauthenticated visitor
// to /login, but the Steam round-trip loses query state: the backend hard
// redirects to /auth/steam/complete. Stash the destination in sessionStorage
// before leaving for Steam and consume it on completion — this is what makes
// deep links (PUG share links especially) survive sign-in.
// -----------------------------------------------------------------------------

const REDIRECT_KEY = 'post_login_redirect'

/** Remember where to land after Steam sign-in completes. */
export function stashPostLoginRedirect(path: string | null | undefined): void {
  // Same-origin relative paths only — anything absolute could be used to
  // bounce a victim to another site after login.
  if (path && path.startsWith('/') && !path.startsWith('//')) {
    sessionStorage.setItem(REDIRECT_KEY, path)
  }
}

/** Take (and clear) the stashed destination, if any. */
export function consumePostLoginRedirect(): string | null {
  const path = sessionStorage.getItem(REDIRECT_KEY)
  sessionStorage.removeItem(REDIRECT_KEY)
  return path && path.startsWith('/') && !path.startsWith('//') ? path : null
}
