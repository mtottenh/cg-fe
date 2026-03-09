import { ref, computed } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

type SteamTrackingResponse = components['schemas']['SteamTrackingResponse']

export function useSteamTracking() {
  const tracking = ref<SteamTrackingResponse | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const registered = computed(() => tracking.value !== null)

  async function fetchTracking(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.GET('/v1/players/me/steam-tracking')
      if (apiError) {
        const err = apiError as any
        if (err.status === 404) {
          tracking.value = null
          return
        }
        throw new ApiError(err.status || 500, err.detail || 'Failed to fetch tracking status')
      }
      tracking.value = data.data
    } catch (e: unknown) {
      if (e instanceof ApiError && e.status === 404) {
        tracking.value = null
        return
      }
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to fetch tracking status'
      }
    } finally {
      loading.value = false
    }
  }

  async function register(gameAuthCode: string, initialShareCode?: string): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const body: components['schemas']['RegisterSteamTrackingRequest'] = {
        game_auth_code: gameAuthCode,
        game_slug: 'cs2',
        ...(initialShareCode ? { initial_share_code: initialShareCode } : {}),
      }
      const { data, error: apiError } = await api.POST('/v1/players/me/steam-tracking', { body })
      if (apiError) {
        const err = apiError as any
        throw new ApiError(err.status || 500, err.detail || 'Failed to register tracking')
      }
      tracking.value = data.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to register tracking'
      }
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateAuthCode(code: string): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const { data, error: apiError } = await api.PATCH('/v1/players/me/steam-tracking', {
        body: { game_auth_code: code },
      })
      if (apiError) {
        const err = apiError as any
        throw new ApiError(err.status || 500, err.detail || 'Failed to update auth code')
      }
      tracking.value = data.data
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to update auth code'
      }
      throw e
    } finally {
      saving.value = false
    }
  }

  async function deleteTracking(): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const { error: apiError } = await api.DELETE('/v1/players/me/steam-tracking')
      if (apiError) {
        const err = apiError as any
        throw new ApiError(err.status || 500, err.detail || 'Failed to delete tracking')
      }
      tracking.value = null
    } catch (e: unknown) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to delete tracking'
      }
      throw e
    } finally {
      saving.value = false
    }
  }

  return { tracking, loading, saving, error, registered, fetchTracking, register, updateAuthCode, deleteTracking }
}
