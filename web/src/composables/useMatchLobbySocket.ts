import { ref, onUnmounted } from 'vue'
import { getAuthToken } from '@/api/client'
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

export interface TimeoutWarningMessage {
  type: 'timeout_warning'
  seconds_remaining: number
  current_team: string
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
  | VetoActionAckMessage
  | PlayerConnectedMessage
  | PlayerDisconnectedMessage
  | SpectatorCountMessage
  | TimeoutWarningMessage
  | ServerAssignmentUpdateMessage
  | LiveScoreUpdateMessage
  | ErrorMessage
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
  'veto_action_ack',
  'player_connected',
  'player_disconnected',
  'spectator_count',
  'timeout_warning',
  'server_assignment_update',
  'live_score_update',
  'error',
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
    connectInternal()
  }

  function connectInternal() {
    const id = matchId()
    if (!id) return

    const token = getAuthToken()
    if (!token) return

    cleanup()

    try {
      ws = new WebSocket(`${WS_BASE()}/v1/ws/veto/${id}`)

      ws.onopen = () => {
        connected.value = true
        usingFallback.value = false
        reconnectAttempts = 0
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
    }
    if (msg.type === 'error' && !authenticated.value) {
      // Auth failed — don't reconnect
      reconnectAttempts = MAX_RECONNECT_ATTEMPTS
    }

    const handler = handlers[msg.type] as ((m: ServerMessage) => void) | undefined
    if (handler) handler(msg)
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
