/**
 * Desktop alerts for the notifications that matter in the moment (a match time
 * proposed or set, check-in open, the server ready, …), shown while the site
 * is open in any tab. No service worker: a closed browser gets nothing, which
 * is why the bell keeps the full list.
 */
import type { PortalNotification } from '@/stores/notifications'

/** The kinds worth interrupting someone for (the same set that goes to Discord). */
export const ALERT_KINDS: ReadonlySet<string> = new Set([
  'proposal_received',
  'proposal_accepted',
  'match_time_set',
  'checkin_open',
  'checkin_reminder',
  'server_ready',
  'server_assigned_from_queue',
  'result_final',
])

const PROMPT_DISMISSED_KEY = 'portal.notifications.promptDismissed'
const LAST_ALERTED_KEY = 'portal.notifications.lastAlertedAt'

export type AlertPermission = NotificationPermission | 'unsupported'

export function alertsSupported(): boolean {
  return typeof window !== 'undefined' && 'Notification' in window
}

export function alertPermission(): AlertPermission {
  if (!alertsSupported()) return 'unsupported'
  return window.Notification.permission
}

/** Ask the browser for permission. Only ever call this from a click. */
export async function requestAlertPermission(): Promise<AlertPermission> {
  if (!alertsSupported()) return 'unsupported'
  try {
    return await window.Notification.requestPermission()
  } catch {
    return alertPermission()
  }
}

function readStorage(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}

function writeStorage(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    // Private mode / blocked storage: the prompt may reappear, nothing worse.
  }
}

export function promptDismissed(): boolean {
  return readStorage(PROMPT_DISMISSED_KEY) === '1'
}

export function dismissPrompt(): void {
  writeStorage(PROMPT_DISMISSED_KEY, '1')
}

/** Creation time (ms) of the newest notification already alerted, across reloads. */
export function lastAlertedAt(): number {
  const raw = readStorage(LAST_ALERTED_KEY)
  const n = raw ? Number(raw) : 0
  return Number.isFinite(n) ? n : 0
}

export function rememberAlerted(createdAtMs: number): void {
  if (createdAtMs > lastAlertedAt()) writeStorage(LAST_ALERTED_KEY, String(createdAtMs))
}

/**
 * Which notifications deserve a desktop alert: unread, of an alert kind,
 * newer than both this session's start and the last alert shown (so a reload
 * never replays old ones), oldest first.
 */
export function selectAlerts(
  items: readonly PortalNotification[],
  sessionStartMs: number,
): PortalNotification[] {
  const floor = Math.max(sessionStartMs, lastAlertedAt())
  return items
    .filter((n) => !n.read_at && ALERT_KINDS.has(n.kind))
    .filter((n) => {
      const t = Date.parse(n.created_at)
      return Number.isFinite(t) && t > floor
    })
    .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
}

/**
 * Show the alerts. Returns how many were shown. `onOpen` runs when one is
 * clicked (navigate to its page).
 */
export function showAlerts(
  alerts: readonly PortalNotification[],
  onOpen: (n: PortalNotification) => void,
): number {
  if (alertPermission() !== 'granted') return 0
  let shown = 0
  for (const n of alerts) {
    try {
      const alert = new window.Notification(n.title, { body: n.body, tag: n.id })
      alert.onclick = () => {
        window.focus()
        onOpen(n)
        alert.close()
      }
      shown++
    } catch {
      // Some browsers only allow notifications from a service worker; the
      // bell still has the item.
    }
    rememberAlerted(Date.parse(n.created_at))
  }
  return shown
}
