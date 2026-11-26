import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { createApp, defineComponent, h, reactive } from 'vue'
import { createPinia, setActivePinia } from 'pinia'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    getAuthToken: vi.fn(() => 'token'),
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

const auth = reactive({ isAuthenticated: true })
vi.mock('@/stores/auth', () => ({ useAuthStore: () => auth }))

const push = vi.fn()
vi.mock('vue-router', () => ({ useRouter: () => ({ push }) }))

import { api } from '@/api'
import { useNotifications, NOTIFICATIONS_POLL_MS } from '@/composables/useNotifications'
import { useNotificationsStore } from '@/stores/notifications'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

class FakeNotification {
  static permission: NotificationPermission = 'granted'
  static requestPermission = vi.fn(async () => FakeNotification.permission)
  static instances: FakeNotification[] = []
  onclick: (() => void) | null = null
  close = vi.fn()
  title: string
  options: NotificationOptions
  constructor(title: string, options: NotificationOptions) {
    this.title = title
    this.options = options
    FakeNotification.instances.push(this)
  }
}

let latest: string | null = null
let unread = 0
let listItems: Array<Record<string, unknown>> = []

function serve() {
  mockGet.mockImplementation(async (path: string) => {
    if (path === '/v1/me/notifications/unread-count') {
      return { data: { data: { unread_count: unread, ...(latest ? { latest_id: latest } : {}) } } }
    }
    return { data: { data: { items: listItems, unread_count: unread, has_more: false } } }
  })
}

function setVisibility(state: 'visible' | 'hidden') {
  Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => state })
}

let exposed: ReturnType<typeof useNotifications> | null = null
function mountComposable() {
  const pinia = createPinia()
  setActivePinia(pinia)
  const app = createApp(defineComponent({
    setup() {
      exposed = useNotifications()
      return () => h('div')
    },
  }))
  app.use(pinia)
  app.mount(document.createElement('div'))
  return () => app.unmount()
}

const countCalls = () => mockGet.mock.calls.filter((c) => c[0] === '/v1/me/notifications/unread-count').length
const listCalls = () => mockGet.mock.calls.filter((c) => c[0] === '/v1/me/notifications').length

describe('useNotifications', () => {
  let unmount: () => void = () => {}

  beforeEach(() => {
    vi.useFakeTimers()
    setVisibility('visible')
    auth.isAuthenticated = true
    latest = null
    unread = 0
    listItems = []
    mockGet.mockReset()
    mockPost.mockReset()
    push.mockReset()
    window.localStorage.clear()
    FakeNotification.permission = 'granted'
    FakeNotification.instances = []
    Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification })
    serve()
  })

  afterEach(() => {
    unmount()
    vi.useRealTimers()
    setVisibility('visible')
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification
  })

  it('polls the unread count every 30 s while logged in and visible', async () => {
    unmount = mountComposable()
    await vi.advanceTimersByTimeAsync(0)
    expect(countCalls()).toBe(1)
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    expect(countCalls()).toBe(2)
  })

  it('skips polls while the tab is hidden and refreshes at once when it comes back', async () => {
    unmount = mountComposable()
    await vi.advanceTimersByTimeAsync(0)
    setVisibility('hidden')
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS * 2)
    expect(countCalls()).toBe(1)
    setVisibility('visible')
    document.dispatchEvent(new Event('visibilitychange'))
    await vi.advanceTimersByTimeAsync(0)
    expect(countCalls()).toBe(2)
  })

  it('stops polling and clears state on logout', async () => {
    unread = 4
    latest = 'n1'
    unmount = mountComposable()
    await vi.advanceTimersByTimeAsync(0)
    expect(useNotificationsStore().unreadCount).toBe(4)

    auth.isAuthenticated = false
    await vi.advanceTimersByTimeAsync(0)
    expect(useNotificationsStore().unreadCount).toBe(0)
    const before = countCalls()
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS * 3)
    expect(countCalls()).toBe(before)
  })

  it('raises a desktop alert only for a new arrival of an alert kind', async () => {
    latest = 'old'
    unmount = mountComposable()
    await vi.advanceTimersByTimeAsync(0)
    // First poll primes the baseline: nothing is fetched or alerted.
    expect(listCalls()).toBe(0)

    latest = 'n2'
    unread = 2
    listItems = [
      { id: 'n2', kind: 'server_ready', title: 'Server ready', body: 'Connect now', link: '/m/1', created_at: new Date(Date.now() + 1000).toISOString() },
      { id: 'n3', kind: 'proposal_rejected', title: 'Rejected', body: 'x', created_at: new Date(Date.now() + 1000).toISOString() },
    ]
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    expect(listCalls()).toBe(1)
    expect(FakeNotification.instances.map((n) => n.title)).toEqual(['Server ready'])

    // Clicking it navigates to the notification's page and marks it read.
    mockPost.mockResolvedValue({ data: { data: { updated: 1 } } })
    FakeNotification.instances[0]!.onclick!()
    await vi.advanceTimersByTimeAsync(0)
    expect(push).toHaveBeenCalledWith('/m/1')
    expect(mockPost).toHaveBeenCalledWith('/v1/me/notifications/read', { body: { ids: ['n2'] } })

    // The same newest id on the next poll alerts nothing new.
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    expect(FakeNotification.instances).toHaveLength(1)
  })

  it('never alerts without permission, and never crashes without the API', async () => {
    FakeNotification.permission = 'denied'
    latest = 'a'
    unmount = mountComposable()
    await vi.advanceTimersByTimeAsync(0)
    latest = 'b'
    listItems = [{ id: 'b', kind: 'checkin_open', title: 'Check-in', body: 'x', created_at: new Date(Date.now() + 1000).toISOString() }]
    await vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)
    expect(FakeNotification.instances).toHaveLength(0)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    delete (window as any).Notification
    latest = 'c'
    await expect(vi.advanceTimersByTimeAsync(NOTIFICATIONS_POLL_MS)).resolves.not.toThrow()
    expect(exposed!.showPermissionPrompt.value).toBe(false)
  })

  it('offers the alert prompt once and asks for permission only on click', async () => {
    FakeNotification.permission = 'default'
    unmount = mountComposable()
    await vi.advanceTimersByTimeAsync(0)
    expect(exposed!.showPermissionPrompt.value).toBe(true)
    expect(FakeNotification.requestPermission).not.toHaveBeenCalled()

    FakeNotification.permission = 'granted'
    await exposed!.enableAlerts()
    expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    expect(exposed!.showPermissionPrompt.value).toBe(false)
  })
})
