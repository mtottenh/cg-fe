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

// Deduplication: single in-flight refresh, shared promise
let refreshPromise: Promise<boolean> | null = null

export const errorMiddleware: Middleware = {
  async onResponse({ response, request }) {
    if (response.status !== 401) {
      return response
    }

    // If this request IS the refresh call, don't recurse — fall through to logout
    if (request.url.includes('/auth/refresh')) {
      onUnauthorized()
      return response
    }

    // Attempt silent refresh (deduplicated across concurrent 401s)
    if (!refreshPromise) {
      refreshPromise = onRefresh().finally(() => {
        refreshPromise = null
      })
    }

    const refreshed = await refreshPromise

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
        body: request.bodyUsed ? undefined : request.body,
        credentials: request.credentials,
      })
      return retryResponse
    }

    // Refresh failed — log out
    onUnauthorized()
    return response
  },
}
