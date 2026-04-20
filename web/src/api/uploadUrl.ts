/**
 * Typed URL builder for multipart/form-data endpoints.
 *
 * The typed `api` client (openapi-fetch) owns JSON requests. File uploads
 * need `XMLHttpRequest` (for byte-level progress telemetry), which doesn't
 * plug into openapi-fetch's fetch-only transport. This helper gives upload
 * callers the same type safety — `path` must be a real operation, and
 * `params` must match that operation's path parameters — without forcing
 * them to stringly-concatenate URLs.
 *
 * It also centralizes the `VITE_API_URL` base so consumers don't re-declare it.
 */

import type { paths } from './types'

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3000'

/**
 * All path templates that accept a multipart/form-data POST body. Extracted
 * from the generated spec so adding a new upload endpoint on the backend and
 * regenerating types automatically expands the union accepted here.
 */
export type MultipartPath = {
  [P in keyof paths]: paths[P] extends {
    post: { requestBody?: { content: { 'multipart/form-data': unknown } } }
  }
    ? P
    : never
}[keyof paths]

/** Extract the `path` parameter object (if any) for a POST operation at `P`. */
export type PathParamsFor<P extends MultipartPath> = paths[P] extends {
  post: { parameters: { path: infer Params } }
}
  ? Params
  : Record<string, never>

/**
 * Build the fully-qualified upload URL for a typed path + params pair.
 *
 * Throws if `params` doesn't cover every `{placeholder}` in the template —
 * catches the common typo where a caller forgets a param at compile-time we
 * can't reach (e.g. a plain empty object with all-optional params).
 */
export function buildUploadUrl<P extends MultipartPath>(
  path: P,
  params?: PathParamsFor<P>,
): string {
  const interpolated = path.replace(/\{([^}]+)\}/g, (_, key) => {
    const value = (params as Record<string, unknown> | undefined)?.[key]
    if (value === undefined || value === null) {
      throw new Error(`buildUploadUrl: missing path param "${key}" for ${path}`)
    }
    return encodeURIComponent(String(value))
  })
  return `${API_BASE_URL}${interpolated}`
}
