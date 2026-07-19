import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './types'
import { errorMiddleware } from './middleware'
import { API_BASE_URL } from './baseUrl'

// Create type-safe client
// Note: Don't add /v1 here - the generated paths already include it from OpenAPI spec
// API_BASE_URL may be "" (same-origin production deploy behind Caddy) — see baseUrl.ts.
export const api = createClient<paths>({
  baseUrl: API_BASE_URL,
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

api.use(authMiddleware)
api.use(errorMiddleware)

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

// Error handler utility - extracts error from openapi-fetch response
export function handleApiError(error: unknown): never {
  if (error && typeof error === 'object') {
    const e = error as { status?: number; detail?: string; errors?: Array<{ field: string; message: string }> }
    throw new ApiError(
      e.status || 500,
      e.detail || 'An unknown error occurred',
      e.errors
    )
  }
  throw new ApiError(500, 'An unknown error occurred')
}
