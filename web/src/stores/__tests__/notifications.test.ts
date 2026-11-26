import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    getAuthToken: vi.fn(() => 'token'),
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api, getAuthToken } from '@/api'
import { useNotificationsStore, type PortalNotification } from '@/stores/notifications'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockPut = api.PUT as unknown as Mock
const mockToken = getAuthToken as unknown as Mock

function note(id: string, read = false): PortalNotification {
  return {
    id, kind: 'proposal_received', title: 't', body: 'b',
    created_at: new Date().toISOString(), ...(read ? { read_at: new Date().toISOString() } : {}),
  }
}

describe('notifications store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
    mockToken.mockReturnValue('token')
  })

  it('reads the unread count and newest id', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { unread_count: 3, latest_id: 'n9' } } })
    const store = useNotificationsStore()
    await store.fetchUnreadCount()
    expect(mockGet).toHaveBeenCalledWith('/v1/me/notifications/unread-count')
    expect(store.unreadCount).toBe(3)
    expect(store.latestId).toBe('n9')
    expect(store.listIsStale).toBe(true)
  })

  it('does not call the API when logged out', async () => {
    mockToken.mockReturnValue(null)
    const store = useNotificationsStore()
    await store.fetchUnreadCount()
    await store.fetchNotifications()
    expect(mockGet).not.toHaveBeenCalled()
  })

  it('loads the list and marks it current', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { items: [note('n2'), note('n1', true)], unread_count: 1, has_more: false } },
    })
    const store = useNotificationsStore()
    await store.fetchNotifications()
    expect(mockGet).toHaveBeenCalledWith('/v1/me/notifications', { params: { query: { limit: 30 } } })
    expect(store.items.map((n) => n.id)).toEqual(['n2', 'n1'])
    expect(store.unreadCount).toBe(1)
    expect(store.listIsStale).toBe(false)
  })

  it('marks one read optimistically and sends its id', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { items: [note('n2'), note('n1')], unread_count: 2, has_more: false } },
    })
    let resolvePost: (v: unknown) => void = () => {}
    mockPost.mockReturnValueOnce(new Promise((r) => { resolvePost = r }))
    const store = useNotificationsStore()
    await store.fetchNotifications()

    const pending = store.markRead({ ids: ['n2'] })
    expect(store.unreadCount).toBe(1)
    expect(store.items.find((n) => n.id === 'n2')!.read_at).toBeTruthy()
    expect(mockPost).toHaveBeenCalledWith('/v1/me/notifications/read', { body: { ids: ['n2'] } })
    resolvePost({ data: { data: { updated: 1 } } })
    expect(await pending).toBe(1)
  })

  it('marks everything read', async () => {
    mockGet.mockResolvedValueOnce({
      data: { data: { items: [note('n2'), note('n1')], unread_count: 5, has_more: true } },
    })
    mockPost.mockResolvedValueOnce({ data: { data: { updated: 5 } } })
    const store = useNotificationsStore()
    await store.fetchNotifications()
    await store.markRead({ all: true })
    expect(store.unreadCount).toBe(0)
    expect(store.items.every((n) => n.read_at)).toBe(true)
    expect(mockPost).toHaveBeenCalledWith('/v1/me/notifications/read', { body: { all: true } })
  })

  it('sends the admin settings calls with the tournament id', async () => {
    const settings = { discord_enabled: true, discord_webhook_configured: true, discord_webhook_hint: 'abc123' }
    mockGet.mockResolvedValueOnce({ data: { data: settings } })
    mockPut.mockResolvedValueOnce({ data: { data: settings } })
    mockPost.mockResolvedValueOnce({ data: { data: { delivered: true } } })
    const store = useNotificationsStore()
    expect(await store.fetchTournamentSettings('t1')).toEqual(settings)
    await store.saveTournamentSettings('t1', { discord_enabled: true, discord_webhook_url: 'https://discord.com/api/webhooks/1/a' })
    expect(mockPut).toHaveBeenCalledWith('/v1/admin/tournaments/{tournament_id}/notification-settings', {
      params: { path: { tournament_id: 't1' } },
      body: { discord_enabled: true, discord_webhook_url: 'https://discord.com/api/webhooks/1/a' },
    })
    expect(await store.sendTestNotification('t1')).toEqual({ delivered: true })
  })

  it('clears everything on reset', async () => {
    mockGet.mockResolvedValueOnce({ data: { data: { unread_count: 2, latest_id: 'x' } } })
    const store = useNotificationsStore()
    await store.fetchUnreadCount()
    store.$reset()
    expect(store.unreadCount).toBe(0)
    expect(store.latestId).toBeNull()
    expect(store.items).toEqual([])
  })
})
