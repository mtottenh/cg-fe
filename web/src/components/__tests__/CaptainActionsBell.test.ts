import { describe, it, expect, afterEach, beforeEach, vi } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { ref } from 'vue'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import type { PortalNotification } from '@/stores/notifications'

const notifications = ref<PortalNotification[]>([])
const unreadCount = ref(0)
const open = vi.fn()
const markAllRead = vi.fn()
const onMenuOpen = vi.fn()
const enableAlerts = vi.fn()
const showPermissionPrompt = ref(false)

vi.mock('@/composables/useNotifications', () => ({
  useNotifications: () => ({
    notifications,
    unreadCount,
    loadError: ref(null),
    showPermissionPrompt,
    onMenuOpen,
    open,
    markAllRead,
    enableAlerts,
    dismissAlertsPrompt: vi.fn(),
  }),
}))

const actions = ref<unknown[]>([])
const actionCount = ref(0)
const hasCritical = ref(false)
vi.mock('@/composables/useCaptainActions', () => ({
  useCaptainActions: () => ({ actions, actionCount, hasCritical }),
}))

import CaptainActionsBell from '@/components/CaptainActionsBell.vue'

const vuetify = createVuetify({ components, directives })

function note(id: string, read = false, extra: Partial<PortalNotification> = {}): PortalNotification {
  return {
    id, kind: 'proposal_received', title: `Title ${id}`, body: `Body ${id}`, link: `/m/${id}`,
    created_at: new Date().toISOString(),
    ...(read ? { read_at: new Date().toISOString() } : {}),
    ...extra,
  }
}

let wrapper: VueWrapper | null = null
function mountBell() {
  wrapper = mount(CaptainActionsBell, {
    global: { plugins: [vuetify], stubs: { CaptainActionItem: true } },
    attachTo: document.body,
  })
  return wrapper
}

async function openMenu() {
  await wrapper!.find('[data-testid="notifications-bell"]').trigger('click')
  await flushPromises()
}

const body = () => document.body

describe('CaptainActionsBell', () => {
  beforeEach(() => {
    notifications.value = []
    unreadCount.value = 0
    actions.value = []
    actionCount.value = 0
    hasCritical.value = false
    showPermissionPrompt.value = false
    vi.clearAllMocks()
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('badges unread notifications plus action items, with an accessible label', () => {
    unreadCount.value = 2
    actionCount.value = 1
    const w = mountBell()
    expect(w.find('[data-testid="notifications-badge"]').text()).toContain('3')
    expect(w.find('[data-testid="notifications-bell"]').attributes('aria-label')).toBe(
      'Notifications and action items (3 new)',
    )
  })

  it('shows no badge when there is nothing new', () => {
    const w = mountBell()
    expect(w.find('[data-testid="notifications-badge"]').exists()).toBe(false)
  })

  it('lists notifications newest first with an unread dot, and loads them when opened', async () => {
    notifications.value = [note('n2'), note('n1', true)]
    unreadCount.value = 1
    mountBell()
    await openMenu()
    expect(onMenuOpen).toHaveBeenCalled()
    const rows = body().querySelectorAll('[data-testid="notification-item"]')
    expect([...rows].map((r) => r.textContent)).toEqual([
      expect.stringContaining('Title n2'),
      expect.stringContaining('Title n1'),
    ])
    expect(rows[0]!.querySelector('[data-testid="notification-unread-dot"]')).not.toBeNull()
    expect(rows[1]!.querySelector('[data-testid="notification-unread-dot"]')).toBeNull()
  })

  it('opens a notification on click (marks read and navigates)', async () => {
    const n = note('n2')
    notifications.value = [n]
    unreadCount.value = 1
    mountBell()
    await openMenu()
    ;(body().querySelector('[data-testid="notification-item"]') as HTMLElement).click()
    await flushPromises()
    expect(open).toHaveBeenCalledWith(n)
  })

  it('marks all read', async () => {
    notifications.value = [note('n2')]
    unreadCount.value = 1
    mountBell()
    await openMenu()
    ;(body().querySelector('[data-testid="notifications-mark-all"]') as HTMLElement).click()
    expect(markAllRead).toHaveBeenCalled()
  })

  it('shows an empty state and keeps the action items section', async () => {
    mountBell()
    await openMenu()
    expect(body().querySelector('[data-testid="notifications-empty"]')).not.toBeNull()
    expect(body().textContent).toContain('Action Items')
    expect(body().textContent).toContain('All caught up!')
  })

  it('offers desktop alerts only when the prompt applies', async () => {
    showPermissionPrompt.value = true
    mountBell()
    await openMenu()
    const prompt = body().querySelector('[data-testid="notifications-permission-prompt"]')
    expect(prompt).not.toBeNull()
    const turnOn = [...prompt!.querySelectorAll('button')].find((b) => b.textContent?.includes('Turn on alerts'))!
    turnOn.click()
    expect(enableAlerts).toHaveBeenCalled()
  })
})
