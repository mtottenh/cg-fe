import type { Middleware } from 'openapi-fetch'
import { getAuthToken } from '../client'

export type UnauthorizedHandler = () => void
export type RefreshHandler = () => Promise<boolean>

let onUnauthorized: UnauthorizedHandler = () => {}
let onRefresh: RefreshHandler = async () => false

export function setUnauthorizedHandler(handler: UnauthorizedHandler) {
  onUnauthorized = handler
}

export function setRefreshHandler(handler: RefreshHandler) {
  onRefresh = handler
}

// Deduplication: single in-flight refresh, shared across every caller. Both
// the openapi-fetch middleware (below) and the XHR-based ImageUpload route
// their 401 retries through `refreshAccessToken()` so they don't each trigger
// a separate refresh POST when they race.
let refreshPromise: Promise<boolean> | null = null

/**
 * Trigger a silent access-token refresh, deduplicated with any in-flight
 * refresh from another caller. Returns `true` when the new token is live
 * in `setAuthToken` and can be read via `getAuthToken()`.
 *
 * On `false`, callers should invoke `triggerUnauthorized()` and stop.
 */
export function refreshAccessToken(): Promise<boolean> {
  if (!refreshPromise) {
    refreshPromise = onRefresh().finally(() => {
      refreshPromise = null
    })
  }
  return refreshPromise
}

/** Signal that an unauthenticated state was reached (drives logout + nav). */
export function triggerUnauthorized(): void {
  onUnauthorized()
}

// Replayable request bodies. openapi-fetch hands the SAME Request object to
// onRequest, to fetch(), and then to onResponse — so by the time a 401
// arrives here the body stream has already been consumed by the original
// send (`request.bodyUsed === true`) and cannot be re-sent. Capture a copy
// of every outgoing body up front so the 401 retry can replay it. Keyed by
// the Request object itself (WeakMap → entries are GC'd with the request).
const replayableBodies = new WeakMap<Request, ArrayBuffer>()

export const errorMiddleware: Middleware = {
  async onRequest({ request }) {
    if (request.body !== null && !request.bodyUsed) {
      replayableBodies.set(request, await request.clone().arrayBuffer())
    }
    return request
  },

  async onResponse({ response, request }) {
    if (response.status !== 401) {
      return response
    }

    // If this request IS the refresh call, don't recurse — fall through to logout
    if (request.url.includes('/auth/refresh')) {
      triggerUnauthorized()
      return response
    }

    const refreshed = await refreshAccessToken()

    if (refreshed) {
      // Retry the original request with the new token
      const newToken = getAuthToken()
      const retryHeaders = new Headers(request.headers)
      if (newToken) {
        retryHeaders.set('Authorization', `Bearer ${newToken}`)
      }
      const retryResponse = await fetch(request.url, {
        method: request.method,
        headers: retryHeaders,
        // The original body stream is consumed; replay the captured copy.
        body: replayableBodies.get(request),
        credentials: request.credentials,
      })
      return retryResponse
    }

    // Refresh failed — log out
    triggerUnauthorized()
    return response
  },
}
