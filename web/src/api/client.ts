import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './types'
import { errorMiddleware } from './middleware'
import { API_BASE_URL } from './baseUrl'
import { noteServerDateHeader } from '@/utils/serverClock'

// Default request timeout: a hung connection would otherwise leave loading
// spinners up forever with no recovery path. Large file uploads use XHR
// (useFileUpload), not this client, so a flat timeout is safe here.
const REQUEST_TIMEOUT_MS = 30_000

const fetchWithTimeout: typeof fetch = (input, init) => {
  if (input instanceof Request) {
    const signal =
      typeof AbortSignal.any === 'function'
        ? AbortSignal.any([input.signal, AbortSignal.timeout(REQUEST_TIMEOUT_MS)])
        : AbortSignal.timeout(REQUEST_TIMEOUT_MS)
    return fetch(new Request(input, { signal }))
  }
  return fetch(input, { ...init, signal: init?.signal ?? AbortSignal.timeout(REQUEST_TIMEOUT_MS) })
}

// Create type-safe client
// Note: Don't add /v1 here - the generated paths already include it from OpenAPI spec
// API_BASE_URL may be "" (same-origin production deploy behind Caddy) — see baseUrl.ts.
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
  fetch: fetchWithTimeout,
})

// Auth middleware for token injection
let authToken: string | null = null

const authMiddleware: Middleware = {
  onRequest: ({ request }) => {
    if (authToken) {
      request.headers.set('Authorization', `Bearer ${authToken}`)
    }
    return request
  },
}

// Every response carries the server's clock in its `Date` header; countdowns
// to server deadlines (the veto turn clock) are measured against it rather
// than the viewer's own clock. Same-origin in production, and the API's CORS
// policy exposes every header for the dev cross-origin setup.
const clockMiddleware: Middleware = {
  onResponse: ({ response }) => {
    noteServerDateHeader(response.headers.get('date'))
    return undefined
  },
}

api.use(authMiddleware)
api.use(errorMiddleware)
api.use(clockMiddleware)

// Auth token management
export function setAuthToken(token: string | null) {
  authToken = token
}

export function getAuthToken(): string | null {
  return authToken
}

// Error types
export class ApiError extends Error {
  status: number
  detail: string
  errors?: Array<{ field: string; message: string }>

  constructor(
    status: number,
    detail: string,
    errors?: Array<{ field: string; message: string }>
  ) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
    this.errors = errors
  }
}

/**
 * Human-friendly message for an ApiError. Prefers the backend's detail;
 * when that is empty, falls back to a short status-based message so users
 * never see a bare "Action failed" for common HTTP errors.
 */
export function friendlyErrorMessage(e: ApiError): string {
  if (e.detail) return e.detail
  if (e.status === 401) return 'You need to sign in'
  if (e.status === 403) return "You don't have permission to do that"
  if (e.status === 404) return 'Not found'
  if (e.status >= 500) return 'Server error - try again shortly'
  return `Request failed (${e.status})`
}
