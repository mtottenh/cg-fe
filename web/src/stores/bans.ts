import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

// Export types from generated API
export type BanResponse = components['schemas']['BanResponse']
export type BanListResponse = components['schemas']['BanListResponse']
export type CreateBanRequest = components['schemas']['CreateBanRequest']
export type LiftBanRequest = components['schemas']['LiftBanRequest']
export type PaginationMeta = components['schemas']['PaginationMetaResponse']

// Ban type enum
export type BanType = 'platform' | 'matchmaking' | 'chat' | 'league' | 'tournament'

export interface BanFilters {
  user_id?: string
  ban_type?: BanType
  scope_type?: string
  scope_id?: string
  active_only?: boolean
  page?: number
  per_page?: number
}

export const useBansStore = defineStore('bans', () => {
  const bans = ref<BanResponse[]>([])
  const pagination = ref<PaginationMeta>({
    page: 1,
    per_page: 20,
    total_items: 0,
    total_pages: 0,
  })
  const loading = ref(false)
  const error = ref<string | null>(null)
  const currentBan = ref<BanResponse | null>(null)

  async function fetchBans(filters: BanFilters = {}) {
    loading.value = true
    error.value = null

    try {
      const { data, error: apiError } = await api.GET('/v1/admin/bans', {
        params: {
          query: {
            user_id: filters.user_id,
            ban_type: filters.ban_type,
            scope_type: filters.scope_type,
            scope_id: filters.scope_id,
            active_only: filters.active_only,
            page: filters.page,
            per_page: filters.per_page,
          },
        },
      })

      if (apiError) {
        throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to fetch bans')
      }

      if (data) {
        bans.value = data.data.items
        pagination.value = data.data.pagination
      }
    } catch (e) {
      if (e instanceof ApiError) {
        error.value = e.detail
      } else {
        error.value = 'Failed to load bans'
      }
      throw e
    } finally {
      loading.value = false
    }
  }

  async function getBan(banId: string): Promise<BanResponse> {
    const { data, error: apiError } = await api.GET('/v1/admin/bans/{id}', {
      params: {
        path: { id: banId },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to get ban')
    }

    if (!data) {
      throw new ApiError(404, 'Ban not found')
    }

    currentBan.value = data.data
    return data.data
  }

  async function createBan(request: CreateBanRequest): Promise<BanResponse> {
    const { data, error: apiError } = await api.POST('/v1/admin/bans', {
      body: request,
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to create ban')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    return data.data
  }

  async function liftBan(banId: string, reason?: string): Promise<BanResponse> {
    const { data, error: apiError } = await api.POST('/v1/admin/bans/{id}/lift', {
      params: {
        path: { id: banId },
      },
      body: { reason: reason ?? null },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to lift ban')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    return data.data
  }

  async function getUserBanHistory(userId: string): Promise<BanResponse[]> {
    const { data, error: apiError } = await api.GET('/v1/admin/users/{user_id}/bans', {
      params: {
        path: { user_id: userId },
      },
    })

    if (apiError) {
      throw new ApiError(apiError.status || 500, apiError.detail || 'Failed to get user ban history')
    }

    if (!data) {
      throw new ApiError(500, 'No data returned')
    }

    return data.data
  }

  function clearError() {
    error.value = null
  }

  return {
    bans,
    pagination,
    loading,
    error,
    currentBan,
    fetchBans,
    getBan,
    createBan,
    liftBan,
    getUserBanHistory,
    clearError,
  }
})
