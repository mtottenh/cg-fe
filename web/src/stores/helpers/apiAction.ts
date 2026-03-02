import { ref, type Ref } from 'vue'
import { ApiError } from '@/api'
import type { components } from '@/api/types'

type ApiErrorResponse = components['schemas']['ApiError']

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
