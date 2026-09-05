import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { ApiError, api } from '@/api'
import { usePlayersStore } from '@/stores/players'

const mockDelete = api.DELETE as unknown as Mock

function ok<T>(data: T) {
  return { data: { data, meta: { request_id: 't' } }, error: undefined }
}

describe('players store: removing images', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockDelete.mockReset()
  })

  it('clearMyImage DELETEs the banner and keeps the returned profile', async () => {
    mockDelete.mockResolvedValue(ok({ id: 'me', display_name: 'Me', avatar_url: 'a', banner_url: null }))
    const store = usePlayersStore()

    const result = await store.clearMyImage('banner')

    expect(mockDelete).toHaveBeenCalledWith('/v1/players/me/banner')
    expect(result.banner_url).toBeNull()
    expect(store.currentPlayer?.banner_url).toBeNull()
  })

  it('adminClearPlayerImage DELETEs the admin route for that player', async () => {
    mockDelete.mockResolvedValue(ok({ id: 'p-9', display_name: 'Them', avatar_url: null, banner_url: null }))
    const store = usePlayersStore()

    const result = await store.adminClearPlayerImage('p-9', 'avatar')

    expect(mockDelete).toHaveBeenCalledWith('/v1/admin/players/{player_id}/avatar', {
      params: { path: { player_id: 'p-9' } },
    })
    expect(result.avatar_url).toBeNull()
  })

  it('a refused takedown is an ApiError with its own state', async () => {
    mockDelete.mockResolvedValue({ data: undefined, error: { status: 403, detail: 'Missing admin.users.manage' } })
    const store = usePlayersStore()
    await expect(store.adminClearPlayerImage('p-9', 'banner')).rejects.toBeInstanceOf(ApiError)
    expect(store.adminClearPlayerImageState.error).toBe('Missing admin.users.manage')
  })
})
