import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  errorMiddleware,
  setUnauthorizedHandler,
  setRefreshHandler,
} from '@/api/middleware/errorMiddleware'

function makeRequest(url = 'http://api.test/v1/things') {
  return new Request(url, { method: 'GET' })
}

function makeResponse(status: number) {
  // happy-dom's Response constructor disallows some statuses via literals;
  // build via object with status field access only.
  return { status } as Response
}

describe('errorMiddleware 401 handling', () => {
  const onUnauthorized = vi.fn()

  beforeEach(() => {
    onUnauthorized.mockClear()
    setUnauthorizedHandler(onUnauthorized)
  })

  afterEach(() => {
    setUnauthorizedHandler(() => {})
    setRefreshHandler(async () => false)
    vi.unstubAllGlobals()
  })

  it('passes non-401 responses through untouched', async () => {
    const response = makeResponse(200)
    const result = await errorMiddleware.onResponse!({
      response,
      request: makeRequest(),
    } as never)
    expect(result).toBe(response)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('logs out when the retried request is 401 again (revoked token)', async () => {
    setRefreshHandler(async () => true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(401)))

    const result = (await errorMiddleware.onResponse!({
      response: makeResponse(401),
      request: makeRequest(),
    } as never)) as Response

    expect(result.status).toBe(401)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('does not log out when the retry succeeds', async () => {
    setRefreshHandler(async () => true)
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(makeResponse(200)))

    const result = (await errorMiddleware.onResponse!({
      response: makeResponse(401),
      request: makeRequest(),
    } as never)) as Response

    expect(result.status).toBe(200)
    expect(onUnauthorized).not.toHaveBeenCalled()
  })

  it('logs out without retrying when refresh fails', async () => {
    setRefreshHandler(async () => false)
    const fetchSpy = vi.fn()
    vi.stubGlobal('fetch', fetchSpy)

    await errorMiddleware.onResponse!({
      response: makeResponse(401),
      request: makeRequest(),
    } as never)

    expect(fetchSpy).not.toHaveBeenCalled()
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })

  it('logs out directly when the refresh endpoint itself 401s', async () => {
    await errorMiddleware.onResponse!({
      response: makeResponse(401),
      request: makeRequest('http://api.test/v1/auth/refresh'),
    } as never)
    expect(onUnauthorized).toHaveBeenCalledTimes(1)
  })
})
