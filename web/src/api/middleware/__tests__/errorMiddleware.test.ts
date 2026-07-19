import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  errorMiddleware,
  setRefreshHandler,
  setUnauthorizedHandler,
} from '../errorMiddleware'
import { setAuthToken } from '../../client'

/**
 * Drive a request through the middleware the way openapi-fetch does:
 * onRequest first, then the actual send (which CONSUMES the request body),
 * then onResponse with the very same Request object. Reproduces the
 * production condition where `request.bodyUsed === true` by 401 time.
 */
async function runThroughMiddleware(request: Request, response: Response): Promise<Response> {
  // openapi-fetch middleware handlers receive a larger context object; the
  // middleware only reads `request` / `response`.
  const onRequestResult = await errorMiddleware.onRequest!({ request } as never)
  const sent = (onRequestResult as Request | undefined) ?? request

  // Simulate fetch consuming the body stream of the original request.
  if (sent.body !== null && !sent.bodyUsed) {
    await sent.text()
  }

  const result = await errorMiddleware.onResponse!({ request: sent, response } as never)
  return (result as Response | undefined) ?? response
}

function jsonRequest(method: string, body?: unknown): Request {
  return new Request('http://api.test/v1/things', {
    method,
    headers: { 'Content-Type': 'application/json', Authorization: 'Bearer stale-token' },
    ...(body !== undefined ? { body: JSON.stringify(body) } : {}),
  })
}

async function decodeBody(body: unknown): Promise<string> {
  if (body instanceof ArrayBuffer) return new TextDecoder().decode(body)
  if (ArrayBuffer.isView(body)) return new TextDecoder().decode(body as Uint8Array)
  return String(body)
}

describe('errorMiddleware 401 refresh-retry', () => {
  const fetchMock = vi.fn()
  const unauthorizedMock = vi.fn()

  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', fetchMock)
    setUnauthorizedHandler(unauthorizedMock)
    setAuthToken(null)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    setRefreshHandler(async () => false)
    setUnauthorizedHandler(() => {})
    setAuthToken(null)
  })

  it('retries a POST after refresh with the ORIGINAL JSON body (not empty)', async () => {
    setRefreshHandler(async () => {
      setAuthToken('fresh-token')
      return true
    })
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const payload = { name: 'Team Rocket', tag: 'TR' }
    const request = jsonRequest('POST', payload)
    const result = await runThroughMiddleware(request, new Response(null, { status: 401 }))

    // Sanity: the production condition really holds — body was consumed.
    expect(request.bodyUsed).toBe(true)

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [url, init] = fetchMock.mock.calls[0]!
    expect(url).toBe('http://api.test/v1/things')
    expect(init.method).toBe('POST')

    // The retried request must carry the original body.
    expect(init.body).toBeDefined()
    expect(JSON.parse(await decodeBody(init.body))).toEqual(payload)

    // ...and the refreshed token.
    const headers = new Headers(init.headers)
    expect(headers.get('Authorization')).toBe('Bearer fresh-token')

    expect(result.status).toBe(200)
    expect(unauthorizedMock).not.toHaveBeenCalled()
  })

  it('retries a body-less GET without inventing a body', async () => {
    setRefreshHandler(async () => {
      setAuthToken('fresh-token')
      return true
    })
    fetchMock.mockResolvedValue(new Response('{"ok":true}', { status: 200 }))

    const request = jsonRequest('GET')
    await runThroughMiddleware(request, new Response(null, { status: 401 }))

    expect(fetchMock).toHaveBeenCalledTimes(1)
    const [, init] = fetchMock.mock.calls[0]!
    expect(init.body).toBeUndefined()
  })

  it('does not retry and triggers unauthorized when refresh fails', async () => {
    setRefreshHandler(async () => false)

    const request = jsonRequest('POST', { a: 1 })
    const original = new Response(null, { status: 401 })
    const result = await runThroughMiddleware(request, original)

    expect(fetchMock).not.toHaveBeenCalled()
    expect(unauthorizedMock).toHaveBeenCalledTimes(1)
    expect(result.status).toBe(401)
  })

  it('passes non-401 responses through untouched', async () => {
    const request = jsonRequest('POST', { a: 1 })
    const original = new Response('{"ok":true}', { status: 200 })
    const result = await runThroughMiddleware(request, original)

    expect(result).toBe(original)
    expect(fetchMock).not.toHaveBeenCalled()
  })
})
