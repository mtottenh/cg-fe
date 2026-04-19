import { computed, ref, type Ref, type WritableComputedRef } from 'vue'
import { ApiError } from '@/api'
import type { components } from '@/api/types'

type ApiErrorResponse = components['schemas']['ApiError']

/**
 * Like unwrapApi, but returns null instead of throwing on 404.
 * Useful for endpoints where "not found" is a valid state (e.g. no active proposal).
 */
export async function unwrapApiOptional<T>(
  apiCall: Promise<{ data?: T; error?: unknown }>
): Promise<T | null> {
  const { data, error: apiError } = await apiCall

  if (apiError) {
    const err = apiError as ApiErrorResponse
    if (err.status === 404) return null
    throw new ApiError(
      err.status || 500,
      err.detail || 'An unknown error occurred',
      err.errors ?? undefined
    )
  }

  return (data as T) ?? null
}

/**
 * Unwraps an openapi-fetch response, returning the data on success
 * or throwing an ApiError on failure.
 *
 * Replaces the repeated pattern:
 *   const { data, error: apiError } = await api.GET(...)
 *   if (apiError) { ... throw new ApiError(...) }
 */
export async function unwrapApi<T>(
  apiCall: Promise<{ data?: T; error?: unknown }>
): Promise<T> {
  const { data, error: apiError } = await apiCall

  if (apiError) {
    const err = apiError as ApiErrorResponse
    throw new ApiError(
      err.status || 500,
      err.detail || 'An unknown error occurred',
      err.errors ?? undefined
    )
  }

  return data as T
}

export interface ActionState {
  loading: Ref<boolean>
  error: Ref<string | null>
}

/**
 * Creates a per-action loading/error state pair.
 */
export function createActionState(): ActionState {
  return {
    loading: ref(false),
    error: ref<string | null>(null),
  }
}

/**
 * Aggregates loading/error signals over a set of per-action states.
 *
 * `loading` is true if any action is in flight. `error` returns the first
 * non-null action error; writing `error = null` clears every action's error
 * so snackbar dismiss logic keeps working. Writing a non-null string sets an
 * override (displayed until any action runs or the override is cleared).
 *
 * Replaces the older pattern of a dead `loading = ref(false)` / `error = ref(null)`
 * that stores never assigned but that consumers read anyway.
 */
export function aggregateActionStates(states: ActionState[]): {
  loading: Ref<boolean>
  error: WritableComputedRef<string | null>
} {
  const override = ref<string | null>(null)
  const loading = computed(() => states.some((s) => s.loading.value))
  const error = computed<string | null>({
    get() {
      if (override.value !== null) return override.value
      for (const s of states) if (s.error.value) return s.error.value
      return null
    },
    set(val) {
      override.value = val
      if (val === null) {
        for (const s of states) s.error.value = null
      }
    },
  })
  return { loading, error }
}

/**
 * Executes a store action with automatic loading/error state management.
 */
export async function withActionState<T>(
  state: ActionState,
  action: () => Promise<T>,
  fallbackMessage: string
): Promise<T> {
  state.loading.value = true
  state.error.value = null
  try {
    return await action()
  } catch (e: unknown) {
    if (e instanceof ApiError) {
      state.error.value = e.detail
    } else {
      state.error.value = fallbackMessage
    }
    throw e
  } finally {
    state.loading.value = false
  }
}
