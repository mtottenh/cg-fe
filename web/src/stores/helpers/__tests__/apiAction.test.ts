import { describe, it, expect } from 'vitest'
import { nextTick } from 'vue'
import { ApiError } from '@/api'
import {
  unwrapApi,
  unwrapApiOptional,
  createActionState,
  withActionState,
  aggregateActionStates,
} from '../apiAction'

describe('unwrapApi', () => {
  it('returns data on success', async () => {
    const result = await unwrapApi(Promise.resolve({ data: { id: '1' } }))
    expect(result).toEqual({ id: '1' })
  })

  it('throws ApiError with detail + status on failure', async () => {
    const call = Promise.resolve({
      error: { status: 422, detail: 'Invalid', errors: [{ field: 'x', message: 'bad' }] },
    })
    await expect(unwrapApi(call)).rejects.toSatisfy((e: unknown) => {
      return e instanceof ApiError
        && e.status === 422
        && e.detail === 'Invalid'
        && Array.isArray(e.errors)
        && e.errors.length === 1
    })
  })

  it('defaults status to 500 and detail to generic message when missing', async () => {
    const call = Promise.resolve({ error: {} })
    await expect(unwrapApi(call)).rejects.toMatchObject({
      status: 500,
      detail: 'An unknown error occurred',
    })
  })
})

describe('unwrapApiOptional', () => {
  it('returns data on success', async () => {
    const result = await unwrapApiOptional(Promise.resolve({ data: { id: '1' } }))
    expect(result).toEqual({ id: '1' })
  })

  it('returns null on 404 instead of throwing', async () => {
    const call = Promise.resolve({ error: { status: 404, detail: 'Not found' } })
    expect(await unwrapApiOptional(call)).toBeNull()
  })

  it('throws on non-404 errors', async () => {
    const call = Promise.resolve({ error: { status: 500, detail: 'Boom' } })
    await expect(unwrapApiOptional(call)).rejects.toBeInstanceOf(ApiError)
  })
})

describe('createActionState', () => {
  it('starts with loading=false, error=null', () => {
    const s = createActionState()
    expect(s.loading).toBe(false)
    expect(s.error).toBeNull()
  })

  it('fields are reactive (reassignable without .value)', () => {
    const s = createActionState()
    s.loading = true
    s.error = 'boom'
    expect(s.loading).toBe(true)
    expect(s.error).toBe('boom')
  })
})

describe('withActionState', () => {
  it('toggles loading and returns the action result on success', async () => {
    const s = createActionState()
    const loadingSnapshots: boolean[] = []

    const p = withActionState(s, async () => {
      loadingSnapshots.push(s.loading)
      return 'ok'
    }, 'fallback')

    const result = await p
    expect(result).toBe('ok')
    expect(loadingSnapshots).toEqual([true])
    expect(s.loading).toBe(false)
    expect(s.error).toBeNull()
  })

  it('captures ApiError.detail onto state and rethrows', async () => {
    const s = createActionState()
    const err = new ApiError(422, 'Invalid stuff')
    await expect(
      withActionState(s, async () => { throw err }, 'fallback'),
    ).rejects.toBe(err)
    expect(s.loading).toBe(false)
    expect(s.error).toBe('Invalid stuff')
  })

  it('uses fallbackMessage for non-ApiError throws', async () => {
    const s = createActionState()
    await expect(
      withActionState(s, async () => { throw new Error('raw') }, 'Friendly fallback'),
    ).rejects.toBeInstanceOf(Error)
    expect(s.error).toBe('Friendly fallback')
  })

  it('clears a stale error on the next successful run', async () => {
    const s = createActionState()
    s.error = 'stale'
    await withActionState(s, async () => 'ok', 'fb')
    expect(s.error).toBeNull()
  })
})

describe('aggregateActionStates', () => {
  it('loading is true if any action is loading', () => {
    const a = createActionState()
    const b = createActionState()
    const { loading } = aggregateActionStates([a, b])
    expect(loading.value).toBe(false)
    a.loading = true
    expect(loading.value).toBe(true)
    a.loading = false
    b.loading = true
    expect(loading.value).toBe(true)
  })

  it('error returns the first non-null action error', () => {
    const a = createActionState()
    const b = createActionState()
    const { error } = aggregateActionStates([a, b])
    expect(error.value).toBeNull()
    b.error = 'b failed'
    expect(error.value).toBe('b failed')
    a.error = 'a failed'
    // First non-null wins (iteration order = argument order)
    expect(error.value).toBe('a failed')
  })

  it('writing error=null clears every action error', async () => {
    const a = createActionState()
    const b = createActionState()
    const { error } = aggregateActionStates([a, b])
    a.error = 'x'
    b.error = 'y'
    error.value = null
    await nextTick()
    expect(a.error).toBeNull()
    expect(b.error).toBeNull()
    expect(error.value).toBeNull()
  })

  it('writing a non-null string overrides action errors until cleared', () => {
    const a = createActionState()
    const { error } = aggregateActionStates([a])
    a.error = 'action err'
    error.value = 'override'
    expect(error.value).toBe('override')
    error.value = null
    expect(error.value).toBeNull()
  })
})
