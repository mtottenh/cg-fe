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
