import { ref, onUnmounted } from 'vue'
import { getAuthToken } from '@/api/client'
import { refreshAccessToken } from '@/api/middleware'
import { wsBaseUrl } from '@/api/baseUrl'
import type { components } from '@/api/types'

type VetoSessionPayload = components['schemas']['VetoSessionResponse']
type VetoActionPayload = components['schemas']['VetoActionResponse']

// Derived from the configured API origin (VITE_WS_URL overrides) — resolved
// lazily so `window.location` is only consulted at connect time.
const WS_BASE = () => wsBaseUrl()
const RECONNECT_DELAY_MS = 2_000
const MAX_RECONNECT_ATTEMPTS = 10
const FALLBACK_POLL_MS = 5_000
const PING_INTERVAL_MS = 25_000

// ── Server → Client message types ──

export interface AuthSuccessMessage {
  type: 'auth_success'
  role: 'participant' | 'spectator' | 'admin'
  registration_id: string | null
  team_name: string | null
  lobby_state: {
    session: VetoSessionPayload | null
    participants: LobbyParticipant[]
    spectator_count: number
  }
}

export interface ChatHistoryMessage {
  type: 'chat_history'
  messages: ChatMessage[]
}

export interface ChatAuthor {
  user_id: string
  username: string
  registration_id: string | null
  team_name: string | null
}

export interface ChatMessageIncoming {
  type: 'chat'
  id: string
  chat_type: 'team' | 'all'
  author: ChatAuthor
  content: string
  timestamp: string
}

export interface VetoStateUpdateMessage {
  type: 'veto_state_update'
  session: VetoSessionPayload
}

export interface VetoActionPerformedMessage {
  type: 'veto_action_performed'
  session: VetoSessionPayload
  action: VetoActionPayload
  is_complete: boolean
}

export interface VetoCompleteMessage {
  type: 'veto_complete'
  selected_maps: string[]
  session: VetoSessionPayload
}

/** One weighted wheel segment (PUG wheel mode). */
export interface WheelSegmentPayload {
  map_id: string
  /** Nomination count — duplicate nominations weight the wheel. */
  weight: number
  nominated_by: string[]
}

/** A PUG wheel spin: every client renders the identical animation from this
 * payload; the authoritative state arrives in the following
 * veto_action_performed / veto_complete frames. */
export interface WheelSpinMessage {
  type: 'wheel_spin'
  game_number: number
  segments: WheelSegmentPayload[]
  winner_map_id: string
  spin_seed: number
  duration_ms: number
}

export interface VetoActionAckMessage {
  type: 'veto_action_ack'
  success: boolean
  message: string
}

export interface CoinFlipResultMessage {
  type: 'coin_flip_result'
  winner_registration_id: string
  winner_name: string
  first_action_registration_id: string
  first_action_name: string
}

export interface PlayerConnectedMessage {
  type: 'player_connected'
  registration_id: string
  team_name: string
  username: string
}

export interface PlayerDisconnectedMessage {
  type: 'player_disconnected'
  registration_id: string
  team_name: string
  username: string
}

export interface SpectatorCountMessage {
  type: 'spectator_count'
  count: number
}

// P-182: `current_team` removed from the wire — the server only ever
// fabricated the literal "Current Team", and no consumer read it; the name
// is resolved from session state via the registration id.
export interface TimeoutWarningMessage {
  type: 'timeout_warning'
  seconds_remaining: number
  current_team_registration_id: string
}

export interface ServerConnectInfo {
  ip_address: string
  port: number
  connect_password: string
  gotv_port?: number | null
  gotv_password?: string | null
}

export interface ServerAssignmentUpdateMessage {
  type: 'server_assignment_update'
  status: string
  connect?: ServerConnectInfo | null
  reason?: string | null
}

export interface LineupUpdateMessage {
  type: 'lineup_update'
}

export interface LiveScoreUpdateMessage {
  type: 'live_score_update'
  map_number: number
  team1_score: number
  team2_score: number
  round_number?: number | null
}

export interface ErrorMessage {
  type: 'error'
  code: string
  message: string
}

/** The socket's first-frame auth was refused (typically an expired token). */
export interface AuthErrorMessage {
  type: 'auth_error'
  error: string
}

export interface PongMessage {
  type: 'pong'
}

export type ServerMessage =
  | AuthSuccessMessage
  | ChatHistoryMessage
  | ChatMessageIncoming
  | CoinFlipResultMessage
  | VetoStateUpdateMessage
  | VetoActionPerformedMessage
  | VetoCompleteMessage
  | WheelSpinMessage
  | VetoActionAckMessage
  | PlayerConnectedMessage
  | PlayerDisconnectedMessage
  | SpectatorCountMessage
  | TimeoutWarningMessage
  | ServerAssignmentUpdateMessage
  | LineupUpdateMessage
  | LiveScoreUpdateMessage
  | ErrorMessage
  | AuthErrorMessage
  | PongMessage

// ── Shared types ──

export interface LobbyParticipant {
  registration_id: string
  team_name: string
  username: string
  connected: boolean
}

export interface ChatMessage {
  id: string
  chat_type: 'team' | 'all'
  author: ChatAuthor
  content: string
  timestamp: string
}

// ── Handler map type ──

type MessageHandlerMap = {
  [K in ServerMessage['type']]?: (msg: Extract<ServerMessage, { type: K }>) => void
}

const SERVER_MESSAGE_TYPES = new Set<ServerMessage['type']>([
  'auth_success',
  'chat_history',
  'chat',
  'coin_flip_result',
  'veto_state_update',
  'veto_action_performed',
  'veto_complete',
  'wheel_spin',
  'veto_action_ack',
  'player_connected',
  'player_disconnected',
  'spectator_count',
  'timeout_warning',
  'server_assignment_update',
  'lineup_update',
  'live_score_update',
  'error',
  'auth_error',
  'pong',
])

/** Runtime guard: a parsed frame must be an object with a known `type`, and
 * veto frames must carry an object `session` — protects the veto store from
 * silently-drifted or malformed payloads. */
function isServerMessage(msg: unknown): msg is ServerMessage {
  if (typeof msg !== 'object' || msg === null) return false
  const m = msg as { type?: unknown; session?: unknown }
  if (typeof m.type !== 'string' || !SERVER_MESSAGE_TYPES.has(m.type as ServerMessage['type'])) {
    return false
  }
  if (
    (m.type === 'veto_state_update' || m.type === 'veto_action_performed' || m.type === 'veto_complete') &&
    (typeof m.session !== 'object' || m.session === null)
  ) {
    return false
  }
  return true
}

// ── Composable ──

export function useMatchLobbySocket(matchId: () => string | null) {
  const connected = ref(false)
  const authenticated = ref(false)
  const usingFallback = ref(false)
  const role = ref<'participant' | 'spectator' | 'admin' | null>(null)

  let ws: WebSocket | null = null
  let reconnectAttempts = 0
  let reconnectTimeout: ReturnType<typeof setTimeout> | null = null
  let pingInterval: ReturnType<typeof setInterval> | null = null
  let handlers: MessageHandlerMap = {}
  let fallbackFn: (() => void) | null = null
  // One token refresh per auth failure: a second refusal straight after a
  // refresh is not an expired token, and must not loop.
  let authRefreshTried = false
  let refreshingAuth = false
  // Set by disconnect(); an in-flight refresh must not reopen the socket.
  let stopped = false

  /** Register message handlers. Call before connect(). */
  function onMessage(map: MessageHandlerMap) {
    handlers = { ...handlers, ...map }
  }

  /** Register a fallback polling function (called when WS reconnect exhausted). */
  function onFallback(fn: () => void) {
    fallbackFn = fn
  }

  function connect() {
    // External (re)connect: start with a fresh retry budget. Retries go
    // through connectInternal() so the counter survives failed attempts.
    reconnectAttempts = 0
    stopped = false
    authRefreshTried = false
    connectInternal()
  }

  function connectInternal() {
    const id = matchId()
    if (!id) return

    const token = getAuthToken()
    if (!token) {
      // The socket needs a token, so a logged-out viewer cannot have one.
      // Watching a veto is public (`GET /v1/matches/{id}/veto` takes no
      // auth), so follow it over REST instead of showing a frozen page.
      cleanup()
      startFallbackPolling()
      return
    }

    cleanup()

    try {
      ws = new WebSocket(`${WS_BASE()}/v1/ws/veto/${id}`)

      ws.onopen = () => {
        connected.value = true
        usingFallback.value = false
        // The retry budget is reset on `auth_success`, not here: a socket
        // that opens and is then refused (expired token) used to count as a
        // success every time, so it reconnected every 2s forever and never
        // reached fallback polling.
        // Send in-band auth as first message
        ws!.send(JSON.stringify({ type: 'auth', token }))
        startPing()
      }

      ws.onmessage = (event) => {
        try {
          const msg: unknown = JSON.parse(event.data)
          if (isServerMessage(msg)) dispatch(msg)
        } catch {
          // Ignore unparseable messages
        }
      }

      ws.onclose = () => {
        connected.value = false
        authenticated.value = false
        stopPing()
        attemptReconnect()
      }

      ws.onerror = () => {
        connected.value = false
        ws?.close()
      }
    } catch {
      startFallbackPolling()
    }
  }

  function dispatch(msg: ServerMessage) {
    // Track auth state
    if (msg.type === 'auth_success') {
      authenticated.value = true
      role.value = msg.role
      reconnectAttempts = 0
      authRefreshTried = false
    }
    if (msg.type === 'auth_error') {
      void recoverFromAuthError()
      return
    }
    if (msg.type === 'error' && !authenticated.value) {
      // Auth failed — don't reconnect
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS
    }

    const handler = handlers[msg.type] as ((m: ServerMessage) => void) | undefined
    if (handler) handler(msg)
  }

  /**
   * Access tokens are short-lived and only refreshed by a REST 401, so a page
   * left open on a quiet lobby reconnects with an expired one. Refresh it once
   * and reconnect; if that does not help, stop hammering the socket and fall
   * back to REST polling.
   */
  async function recoverFromAuthError() {
    if (refreshingAuth) return
    if (authRefreshTried) {
      giveUpOnSocket()
      return
    }
    authRefreshTried = true
    refreshingAuth = true
    let refreshed = false
    try {
      refreshed = await refreshAccessToken()
    } catch {
      refreshed = false
    } finally {
      refreshingAuth = false
    }
    if (stopped) return
    if (refreshed) connectInternal()
    else giveUpOnSocket()
  }

  function giveUpOnSocket() {
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS
    cleanup()
    startFallbackPolling()
  }

  function send(message: Record<string, unknown>) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(message))
    }
  }

  // ── Ping keepalive ──

  function startPing() {
    stopPing()
    pingInterval = setInterval(() => {
      send({ type: 'ping' })
    }, PING_INTERVAL_MS)
  }

  function stopPing() {
    if (pingInterval) {
      clearInterval(pingInterval)
      pingInterval = null
    }
  }

  // ── Reconnect ──

  function attemptReconnect() {
    // The auth-recovery path reconnects itself once the token is refreshed.
    if (refreshingAuth) return
    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      startFallbackPolling()
      return
    }

    reconnectAttempts++
    const delay = RECONNECT_DELAY_MS * Math.min(reconnectAttempts, 5)
    reconnectTimeout = setTimeout(() => connectInternal(), delay)
  }

  // ── Fallback polling ──

  let fallbackInterval: ReturnType<typeof setInterval> | null = null

  function startFallbackPolling() {
    if (fallbackInterval || !fallbackFn) return
    usingFallback.value = true

    const fn = fallbackFn
    fallbackInterval = setInterval(() => {
      if (document.visibilityState === 'hidden') return
      fn()
    }, FALLBACK_POLL_MS)
  }

  function stopFallbackPolling() {
    if (fallbackInterval) {
      clearInterval(fallbackInterval)
      fallbackInterval = null
    }
  }

  // ── Cleanup ──

  function cleanup() {
    if (reconnectTimeout) {
      clearTimeout(reconnectTimeout)
      reconnectTimeout = null
    }
    stopPing()
    stopFallbackPolling()
    if (ws) {
      ws.onclose = null
      ws.onerror = null
      ws.onmessage = null
      ws.close()
      ws = null
    }
    connected.value = false
    authenticated.value = false
  }

  function disconnect() {
    stopped = true
    reconnectAttempts = MAX_RECONNECT_ATTEMPTS // prevent reconnect
    cleanup()
  }

  onUnmounted(disconnect)

  return {
    connected,
    authenticated,
    usingFallback,
    role,
    connect,
    disconnect,
    send,
    onMessage,
    onFallback,
  }
}
