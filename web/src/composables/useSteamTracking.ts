import { ref, computed } from 'vue'
import { api, ApiError } from '@/api'
import { unwrapApi, unwrapApiOptional } from '@/stores/helpers'
import type { components } from '@/api/types'

type SteamTrackingResponse = components['schemas']['SteamTrackingResponse']

export function useSteamTracking() {
  const tracking = ref<SteamTrackingResponse | null>(null)
  const loading = ref(false)
  const saving = ref(false)
  const error = ref<string | null>(null)
  const registered = computed(() => tracking.value !== null)

  function captureError(e: unknown, fallback: string) {
    if (e instanceof ApiError) {
      error.value = e.detail
    } else {
      error.value = fallback
    }
  }

  async function fetchTracking(): Promise<void> {
    loading.value = true
    error.value = null
    try {
      // 404 is a valid state (tracking not registered yet) — unwrapApiOptional returns null.
      const result = await unwrapApiOptional(api.GET('/v1/players/me/steam-tracking'))
      tracking.value = result?.data ?? null
    } catch (e: unknown) {
      captureError(e, 'Failed to fetch tracking status')
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
      const result = await unwrapApi(api.POST('/v1/players/me/steam-tracking', { body }))
      tracking.value = result.data
    } catch (e: unknown) {
      captureError(e, 'Failed to register tracking')
      throw e
    } finally {
      saving.value = false
    }
  }

  async function updateAuthCode(code: string): Promise<void> {
    saving.value = true
    error.value = null
    try {
      const result = await unwrapApi(api.PATCH('/v1/players/me/steam-tracking', {
        body: { game_auth_code: code },
      }))
      tracking.value = result.data
    } catch (e: unknown) {
      captureError(e, 'Failed to update auth code')
      throw e
    } finally {
      saving.value = false
    }
  }

  async function deleteTracking(): Promise<void> {
    saving.value = true
    error.value = null
    try {
      await unwrapApi(api.DELETE('/v1/players/me/steam-tracking'))
      tracking.value = null
    } catch (e: unknown) {
      captureError(e, 'Failed to delete tracking')
      throw e
    } finally {
      saving.value = false
    }
  }

  return { tracking, loading, saving, error, registered, fetchTracking, register, updateAuthCode, deleteTracking }
}
