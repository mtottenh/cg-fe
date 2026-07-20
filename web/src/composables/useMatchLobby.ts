import { computed, inject, provide, ref, watch, onUnmounted, type InjectionKey, type Ref } from 'vue'
import { useVetoStore, type MapStatusResponse } from '@/stores/veto'
import {
  useMatchLobbySocket,
  type ChatMessage,
  type LobbyParticipant,
  type AuthSuccessMessage,
  type ChatHistoryMessage,
  type ChatMessageIncoming,
  type CoinFlipResultMessage,
  type VetoStateUpdateMessage,
  type VetoActionPerformedMessage,
  type VetoCompleteMessage,
  type PlayerConnectedMessage,
  type PlayerDisconnectedMessage,
  type SpectatorCountMessage,
  type TimeoutWarningMessage,
} from './useMatchLobbySocket'

export type VetoPhase = 'waiting' | 'coin_flip' | 'banning' | 'picking' | 'side_select' | 'completed'

export function useMatchLobby(
  matchId: Ref<string | null>,
  userRegistrationId: Ref<string | null | undefined>,
) {
  const vetoStore = useVetoStore()

  // ── Socket layer ──
  const socket = useMatchLobbySocket(() => matchId.value)

  // ── Chat state ──
  const chatMessages = ref<ChatMessage[]>([])

  // ── Presence state ──
  const participants = ref<LobbyParticipant[]>([])
  const spectatorCount = ref(0)
  const userRole = ref<'participant' | 'spectator' | 'admin' | null>(null)

  // ── Timeout warning ──
  const timeoutWarning = ref<{ seconds_remaining: number; current_team_registration_id: string } | null>(null)

  // ── Coin flip result ──
  const coinFlipResult = ref<CoinFlipResultMessage | null>(null)

  // Deadline countdown
  const timeRemaining = ref<number | null>(null)
  let countdownInterval: ReturnType<typeof setInterval> | null = null

  // ── Register WS message handlers ──
  socket.onMessage({
    auth_success(msg: AuthSuccessMessage) {
      userRole.value = msg.role

      // Populate presence
      participants.value = msg.lobby_state.participants
      spectatorCount.value = msg.lobby_state.spectator_count

      // Populate veto session from lobby state (no REST call needed)
      if (msg.lobby_state.session) {
        vetoStore.applySessionUpdate(msg.lobby_state.session)
      }
    },

    chat_history(msg: ChatHistoryMessage) {
      chatMessages.value = msg.messages
    },

    chat(msg: ChatMessageIncoming) {
      chatMessages.value.push({
        id: msg.id,
        chat_type: msg.chat_type,
        author: msg.author,
        content: msg.content,
        timestamp: msg.timestamp,
      })
    },

    coin_flip_result(msg: CoinFlipResultMessage) {
      coinFlipResult.value = msg
    },

    veto_state_update(msg: VetoStateUpdateMessage) {
      vetoStore.applySessionUpdate(msg.session)
    },

    veto_action_performed(msg: VetoActionPerformedMessage) {
      vetoStore.applyActionPerformed(msg.session, msg.action)
      if (msg.is_complete) {
        stopCountdown()
      }
    },

    veto_complete(msg: VetoCompleteMessage) {
      vetoStore.applyVetoComplete(msg.session)
      stopCountdown()
    },

    player_connected(msg: PlayerConnectedMessage) {
      const idx = participants.value.findIndex(p => p.registration_id === msg.registration_id)
      if (idx !== -1) {
        participants.value[idx]!.connected = true
      } else {
        participants.value.push({
          registration_id: msg.registration_id,
          team_name: msg.team_name,
          username: msg.username,
          connected: true,
        })
      }
    },

    player_disconnected(msg: PlayerDisconnectedMessage) {
      const idx = participants.value.findIndex(p => p.registration_id === msg.registration_id)
      if (idx !== -1) {
        participants.value[idx]!.connected = false
      }
    },

    spectator_count(msg: SpectatorCountMessage) {
      spectatorCount.value = msg.count
    },

    timeout_warning(msg: TimeoutWarningMessage) {
      timeoutWarning.value = {
        seconds_remaining: msg.seconds_remaining,
        current_team_registration_id: msg.current_team_registration_id,
      }
      // Override countdown with server-provided value
      timeRemaining.value = msg.seconds_remaining
    },
  })

  // Fallback: full REST fetch when WS reconnect exhausted
  socket.onFallback(() => {
    const id = matchId.value
    if (id) vetoStore.getVetoSession(id).catch(() => {})
  })

  // ── Chat actions ──
  function sendChat(chatType: 'team' | 'all', content: string) {
    socket.send({ type: 'chat', chat_type: chatType, content })
  }

  // ── Veto action via WS ──
  function sendVetoAction(action: { action: 'ban' | 'pick' | 'select_side'; map_id?: string; action_number?: number; side?: string }) {
    socket.send({ type: 'veto_action', action })
  }

  // ── Computed state derived from store (same API as old useVetoSession) ──
  const session = computed(() => vetoStore.session)
  const state = computed(() => vetoStore.sessionState)
  const hasSession = computed(() => !!session.value)

  const phase = computed((): VetoPhase => {
    const s = session.value
    if (!s) return 'waiting'
    if (s.status === 'completed') return 'completed'
    if (s.status === 'pending') return 'waiting'
    if (s.status === 'coin_flip') return 'coin_flip'
    // status === 'in_progress'
    const currentAction = state.value?.current_action
    if (!currentAction) return 'completed'
    if (currentAction.action_type === 'ban') return 'banning'
    if (currentAction.action_type === 'pick') return 'picking'
    return 'side_select'
  })

  const isMyTurn = computed(() => {
    if (!session.value || !userRegistrationId.value) return false
    return session.value.current_team_turn === userRegistrationId.value
  })

  const maps = computed((): MapStatusResponse[] => {
    return state.value?.maps ?? []
  })

  const availableMaps = computed(() =>
    maps.value.filter(m => m.status === 'available')
  )

  const bannedMaps = computed(() =>
    maps.value.filter(m => m.status === 'banned')
  )

  const pickedMaps = computed(() =>
    maps.value.filter(m => m.status === 'picked' || m.status === 'decider')
  )

  const actions = computed(() => state.value?.actions ?? [])
  const format = computed(() => state.value?.format ?? null)
  const currentAction = computed(() => state.value?.current_action ?? null)

  const actionDeadline = computed(() => session.value?.action_deadline ?? null)

  const bothParticipantsConnected = computed(() => {
    return participants.value.filter(p => p.connected).length >= 2
  })

  const mapsNeedingSideSelect = computed(() => {
    return actions.value.filter(
      a => (a.action_type === 'pick' || a.action_type === 'decider') && !a.side_selection
    )
  })

  // ── Countdown timer ──
  function updateCountdown() {
    if (!actionDeadline.value) {
      timeRemaining.value = null
      return
    }
    const deadline = new Date(actionDeadline.value).getTime()
    const now = Date.now()
    const remaining = Math.max(0, Math.floor((deadline - now) / 1000))
    timeRemaining.value = remaining
  }

  function startCountdown() {
    stopCountdown()
    updateCountdown()
    countdownInterval = setInterval(updateCountdown, 1000)
  }

  function stopCountdown() {
    if (countdownInterval) {
      clearInterval(countdownInterval)
      countdownInterval = null
    }
  }

  // ── Initialize ──
  async function initialize() {
    if (!matchId.value) return
    // Drop any previous match's session before fetching — getVetoSession 404s
    // for not-yet-started vetoes, and without this the old match's state
    // would keep rendering in the new lobby.
    vetoStore.clear()
    try {
      // Fetch initial state via REST (WS auth_success will update it too)
      await vetoStore.getVetoSession(matchId.value)
      if (session.value && session.value.status !== 'completed') {
        socket.connect()
        startCountdown()
      }
    } catch {
      // No veto session exists yet — try connecting anyway for lobby features
      socket.connect()
    }
  }

  // Watch for session status changes
  watch(() => session.value?.status, (status) => {
    if (status === 'completed') {
      stopCountdown()
      socket.disconnect()
    }
  })

  // Watch for deadline changes to restart countdown
  watch(actionDeadline, () => {
    if (actionDeadline.value && phase.value !== 'completed') {
      startCountdown()
    }
  })

  onUnmounted(() => {
    stopCountdown()
    socket.disconnect()
    vetoStore.clear()
  })

  return {
    // Veto state (same API as old useVetoSession)
    session,
    state,
    hasSession,
    phase,
    isMyTurn,
    maps,
    availableMaps,
    bannedMaps,
    pickedMaps,
    actions,
    format,
    currentAction,
    timeRemaining,
    mapsNeedingSideSelect,
    coinFlipResult,
    bothParticipantsConnected,

    // WebSocket state
    connected: socket.connected,
    authenticated: socket.authenticated,
    usingFallback: socket.usingFallback,

    // Chat state
    chatMessages,
    sendChat,

    // Presence state
    participants,
    spectatorCount,
    userRole,
    timeoutWarning,

    // Veto action via WS
    sendVetoAction,

    // Lifecycle
    initialize,
    connect: socket.connect,
    disconnect: socket.disconnect,
  }
}

export type MatchLobby = ReturnType<typeof useMatchLobby>

/**
 * Injection key for sharing a single `useMatchLobby` instance across a route's
 * component tree. The parent (match-detail page) calls `useMatchLobby()` once,
 * `provide()`s it, and descendants (`VetoPanel`, chat/presence panels) call
 * `injectMatchLobby()` instead of re-instantiating the composable — which
 * would open a second websocket connection.
 */
export const MatchLobbyKey: InjectionKey<MatchLobby> = Symbol('MatchLobby')

export function provideMatchLobby(lobby: MatchLobby): void {
  provide(MatchLobbyKey, lobby)
}

/**
 * Read the provided match-lobby instance. Throws in dev if no parent has
 * provided one — matches the `useSnackbar` footgun-prevention pattern.
 */
export function injectMatchLobby(): MatchLobby {
  const lobby = inject(MatchLobbyKey, null)
  if (!lobby) {
    throw new Error(
      'injectMatchLobby(): no provider found. A parent component must call ' +
      '`provideMatchLobby(useMatchLobby(matchId, userRegId))` before descendants use it.',
    )
  }
  return lobby
}

export type { ChatMessage, LobbyParticipant }
