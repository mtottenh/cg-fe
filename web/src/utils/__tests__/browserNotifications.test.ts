import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  ALERT_KINDS,
  alertPermission,
  alertsSupported,
  dismissPrompt,
  lastAlertedAt,
  promptDismissed,
  rememberAlerted,
  requestAlertPermission,
  selectAlerts,
  showAlerts,
} from '@/utils/browserNotifications'
import type { PortalNotification } from '@/stores/notifications'

function note(overrides: Partial<PortalNotification> = {}): PortalNotification {
  return {
    id: 'n1',
    kind: 'checkin_open',
    title: 'Check-in is open',
    body: 'Check in by 20:35 UTC',
    link: '/tournaments/cup/matches/m1',
    created_at: new Date(Date.now() + 1_000).toISOString(),
    ...overrides,
  }
}

class FakeNotification {
  static permission: NotificationPermission = 'default'
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

function installNotification(permission: NotificationPermission) {
  FakeNotification.permission = permission
  FakeNotification.instances = []
  Object.defineProperty(window, 'Notification', { configurable: true, writable: true, value: FakeNotification })
}

function removeNotification() {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (window as any).Notification
}

describe('browserNotifications', () => {
  beforeEach(() => {
    window.localStorage.clear()
  })
  afterEach(() => {
    removeNotification()
    vi.restoreAllMocks()
  })

  describe('without the Notification API', () => {
    beforeEach(() => removeNotification())

    it('reports unsupported and never throws', async () => {
      expect(alertsSupported()).toBe(false)
      expect(alertPermission()).toBe('unsupported')
      expect(await requestAlertPermission()).toBe('unsupported')
      expect(showAlerts([note()], () => {})).toBe(0)
    })
  })

  describe('permission states', () => {
    it.each(['default', 'denied'] as const)('shows nothing while permission is %s', (p) => {
      installNotification(p)
      expect(showAlerts([note()], () => {})).toBe(0)
      expect(FakeNotification.instances).toHaveLength(0)
    })

    it('shows an alert per notification when granted, tagged by id', () => {
      installNotification('granted')
      expect(showAlerts([note({ id: 'a' }), note({ id: 'b' })], () => {})).toBe(2)
      expect(FakeNotification.instances.map((n) => n.options.tag)).toEqual(['a', 'b'])
      expect(FakeNotification.instances[0]!.options.body).toBe('Check in by 20:35 UTC')
    })

    it('clicking an alert focuses the window and opens the notification', () => {
      installNotification('granted')
      const focus = vi.spyOn(window, 'focus').mockImplementation(() => {})
      const onOpen = vi.fn()
      const n = note()
      showAlerts([n], onOpen)
      FakeNotification.instances[0]!.onclick!()
      expect(focus).toHaveBeenCalled()
      expect(onOpen).toHaveBeenCalledWith(n)
      expect(FakeNotification.instances[0]!.close).toHaveBeenCalled()
    })

    it('asks for permission only when called', async () => {
      installNotification('default')
      expect(FakeNotification.requestPermission).not.toHaveBeenCalled()
      FakeNotification.permission = 'granted'
      expect(await requestAlertPermission()).toBe('granted')
      expect(FakeNotification.requestPermission).toHaveBeenCalledTimes(1)
    })
  })

  describe('selectAlerts', () => {
    const start = Date.now()

    it('keeps only unread notifications of alert kinds created after the session started', () => {
      const picked = selectAlerts([
        note({ id: 'fresh' }),
        note({ id: 'read', read_at: new Date().toISOString() }),
        note({ id: 'quiet', kind: 'proposal_rejected' }),
        note({ id: 'old', created_at: new Date(start - 60_000).toISOString() }),
      ], start)
      expect(picked.map((n) => n.id)).toEqual(['fresh'])
    })

    it('covers the Discord-worthy kinds only', () => {
      expect([...ALERT_KINDS].sort()).toEqual([
        'checkin_open', 'checkin_reminder', 'match_time_set', 'proposal_accepted',
        'proposal_received', 'result_final', 'server_assigned_from_queue', 'server_ready',
      ])
    })

    it('does not re-alert after a reload: anything at or before the last alert is skipped', () => {
      installNotification('granted')
      const n = note({ id: 'once' })
      showAlerts(selectAlerts([n], start - 10 * 60_000), () => {})
      expect(FakeNotification.instances).toHaveLength(1)
      // A reload with an earlier session start (e.g. clock skew) still skips it.
      expect(selectAlerts([n], start - 10 * 60_000)).toEqual([])
      expect(lastAlertedAt()).toBe(Date.parse(n.created_at))
    })

    it('orders alerts oldest first', () => {
      const a = note({ id: 'a', created_at: new Date(start + 5_000).toISOString() })
      const b = note({ id: 'b', created_at: new Date(start + 2_000).toISOString() })
      expect(selectAlerts([a, b], start).map((n) => n.id)).toEqual(['b', 'a'])
    })
  })

  describe('storage', () => {
    it('remembers a dismissed prompt', () => {
      expect(promptDismissed()).toBe(false)
      dismissPrompt()
      expect(promptDismissed()).toBe(true)
    })

    it('never moves the last-alerted mark backwards', () => {
      rememberAlerted(2000)
      rememberAlerted(1000)
      expect(lastAlertedAt()).toBe(2000)
    })

    it('survives blocked storage', () => {
      vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
      vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked') })
      expect(promptDismissed()).toBe(false)
      expect(() => dismissPrompt()).not.toThrow()
      expect(lastAlertedAt()).toBe(0)
      expect(() => rememberAlerted(5)).not.toThrow()
    })
  })
})
