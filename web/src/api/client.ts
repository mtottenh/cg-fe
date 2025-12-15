import createClient, { type Middleware } from 'openapi-fetch'
import type { paths } from './types'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

// Create type-safe client
// Note: Don't add /v1 here - the generated paths already include it from OpenAPI spec
export const api = createClient<paths>({
  baseUrl: API_URL,
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
