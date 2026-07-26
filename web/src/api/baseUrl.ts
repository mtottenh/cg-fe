/**
 * Single source of truth for the API origin.
 *
 * `VITE_API_URL` is baked in at build time:
 *   - unset in a dev build  → fall back to the local backend on :3000
 *   - unset in a PROD build → hard failure. A production bundle silently
 *     pointing at localhost is exactly the bug that shipped dev URLs to
 *     users; fail fast at module init instead.
 *   - empty string ("")     → same-origin. The SPA is served by the same
 *     Caddy vhost that reverse-proxies /v1 to the API, so relative URLs
 *     are the production default (see web/.env.production).
 *   - any other value       → used verbatim (e.g. https://portal.example.com)
 */
function resolveApiBaseUrl(): string {
  const configured = import.meta.env.VITE_API_URL
  if (configured !== undefined) {
    // "" is a deliberate value meaning "same origin" — keep it.
    return configured
  }
  if (import.meta.env.PROD) {
    throw new Error(
      'VITE_API_URL is not defined in this production build. ' +
        'Set it in .env.production ("" for same-origin, or an absolute API origin) and rebuild.'
    )
  }
  return 'http://localhost:3000'
}

/** Base URL prefix for API requests. May be "" (same-origin, relative URLs). */
export const API_BASE_URL = resolveApiBaseUrl()

/**
 * The absolute origin the API lives on. Unlike `API_BASE_URL` this is never
 * empty — the same-origin case resolves through `window.location.origin`.
 * Use it when an absolute URL is required (e.g. deriving the WebSocket URL).
 */
export function apiOrigin(): string {
  return API_BASE_URL || window.location.origin
}

/**
 * WebSocket base URL, derived from the API origin (http→ws, https→wss).
 * `VITE_WS_URL` overrides it for the rare split-host deployment.
 */
export function wsBaseUrl(): string {
  const configured = import.meta.env.VITE_WS_URL
  if (configured) return configured
  return apiOrigin().replace(/^http/, 'ws')
}
