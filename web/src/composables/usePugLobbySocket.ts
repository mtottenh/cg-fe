/**
 * PUG lobby WebSocket — the doorbell channel.
 *
 * `/v1/ws/pug/{pug_id}` pushes tiny frames (`pug_changed`,
 * `rematch_created`); state itself always comes from
 * `GET /v1/pugs/{id}` because that response is viewer-specific. On every
 * ring the composable refetches (debounced to coalesce bursts). While the
 * socket is down it falls back to slow polling, so the lobby degrades to
 * the old behavior instead of freezing.
 */
import { onUnmounted, ref } from 'vue'
import { getAuthToken } from '@/api/client'
import { wsBaseUrl } from '@/api/baseUrl'

const RECONNECT_DELAY_MS = 2_000
const MAX_RECONNECT_ATTEMPTS = 8
const FALLBACK_POLL_MS = 10_000
const PING_INTERVAL_MS = 25_000
const REFETCH_DEBOUNCE_MS = 150

export interface PugLobbySocketOptions {
  /** Invite code for share-link viewers who haven't joined yet. */
  code?: string | undefined
  /** Called (debounced) whenever the lobby changed server-side. */
  onChanged: (reason: string) => void
  /** Called when the creator spins up a rematch — navigate the lobby over. */
  onRematch?: (newPugId: string) => void
}

export function usePugLobbySocket(getPugId: () => string | null, options: PugLobbySocketOptions) {
  const connected = ref(false)
  const usingFallback = ref(false)

  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  let fallbackTimer: ReturnType<typeof setInterval> | null = null
  let pingTimer: ReturnType<typeof setInterval> | null = null
  let refetchTimer: ReturnType<typeof setTimeout> | null = null
  let disposed = false

  function ringDoorbell(reason: string): void {
    // Coalesce bursts (shuffle → several broadcasts) into one refetch.
    if (refetchTimer) clearTimeout(refetchTimer)
    refetchTimer = setTimeout(() => options.onChanged(reason), REFETCH_DEBOUNCE_MS)
  }

  function connect(): void {
    const pugId = getPugId()
    const token = getAuthToken()
    if (!pugId || !token || disposed) return
    if (ws && (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING)) return

    stopFallbackPolling()
    const socket = new WebSocket(`${wsBaseUrl()}/v1/ws/pug/${pugId}`)
    ws = socket

    socket.onopen = () => {
      socket.send(
        JSON.stringify({ type: 'auth', token, ...(options.code ? { code: options.code } : {}) })
      )
    }

    socket.onmessage = (event) => {
      let msg: unknown
      try {
        msg = JSON.parse(String(event.data))
      } catch {
        return
      }
      if (typeof msg !== 'object' || msg === null) return
      const frame = msg as { type?: string; reason?: string; pug_id?: string; error?: string }
      switch (frame.type) {
        case 'auth_success':
          connected.value = true
          usingFallback.value = false
          reconnectAttempts = 0
          startPing(socket)
          // Anything could have changed while we were disconnected.
          ringDoorbell('connected')
          break
        case 'auth_error':
          // Not authorized (or bad token): reconnecting won't help.
          reconnectAttempts = MAX_RECONNECT_ATTEMPTS
          socket.close()
          break
        case 'pug_changed':
          ringDoorbell(frame.reason ?? 'changed')
          break
        case 'rematch_created':
          if (frame.pug_id) options.onRematch?.(frame.pug_id)
          break
        default:
          break
      }
    }

    socket.onclose = () => {
      connected.value = false
      stopPing()
      if (disposed) return
      if (reconnectAttempts < MAX_RECONNECT_ATTEMPTS) {
        reconnectAttempts += 1
        const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttempts, 5)
        reconnectTimer = setTimeout(connect, delay)
      } else {
        startFallbackPolling()
      }
    }

    socket.onerror = () => {
      socket.close()
    }
  }

  function disconnect(): void {
    if (reconnectTimer) clearTimeout(reconnectTimer)
    if (refetchTimer) clearTimeout(refetchTimer)
    stopPing()
    stopFallbackPolling()
    reconnectAttempts = 0
    connected.value = false
    if (ws) {
      const socket = ws
      ws = null
      socket.onclose = null
      socket.close()
    }
  }

  function startPing(socket: WebSocket): void {
    stopPing()
    pingTimer = setInterval(() => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'ping' }))
      }
    }, PING_INTERVAL_MS)
  }

  function stopPing(): void {
    if (pingTimer) {
      clearInterval(pingTimer)
      pingTimer = null
    }
  }

  function startFallbackPolling(): void {
    if (fallbackTimer) return
    usingFallback.value = true
    fallbackTimer = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      options.onChanged('fallback_poll')
      // Keep probing for a way back onto the socket.
      reconnectAttempts = 0
      connect()
    }, FALLBACK_POLL_MS)
  }

  function stopFallbackPolling(): void {
    if (fallbackTimer) {
      clearInterval(fallbackTimer)
      fallbackTimer = null
    }
    usingFallback.value = false
  }

  onUnmounted(() => {
    disposed = true
    disconnect()
  })

  return { connected, usingFallback, connect, disconnect }
}
