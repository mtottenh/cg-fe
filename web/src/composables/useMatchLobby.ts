import { computed, inject, provide, ref, watch, onUnmounted, type InjectionKey, type Ref } from 'vue'
import { useVetoStore, type MapStatusResponse } from '@/stores/veto'
import { useMatchServerStore } from '@/stores/matchServer'
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
  type ServerAssignmentUpdateMessage,
  type LineupUpdateMessage,
  type LiveScoreUpdateMessage,
} from './useMatchLobbySocket'

export type VetoPhase = 'waiting' | 'coin_flip' | 'banning' | 'picking' | 'side_select' | 'completed' | 'cancelled'

export function useMatchLobby(
  matchId: Ref<string | null>,
  userRegistrationId: Ref<string | null | undefined>,
  /**
   * Server-computed "this user may act for their registration" (the check-in
   * predicate: captain / owner / delegate / the registered player). Omitted
   * where every member of a side may act (PUG lobbies).
   */
  canActForRegistration?: Ref<boolean>,
) {
  const vetoStore = useVetoStore()
  const matchServerStore = useMatchServerStore()

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

      // Populate presence from the snapshot the server built after this
      // socket joined — it names both teams and who is really here. Guard
      // the shape: an older API sent an object here, which used to turn
      // this array into something `findIndex` could not run on.
      const snapshot = msg.lobby_state.participants
      participants.value = Array.isArray(snapshot) ? snapshot : []
      spectatorCount.value = msg.lobby_state.spectator_count ?? 0

      // Populate veto session from lobby state.
      if (msg.lobby_state.session) {
        vetoStore.applySessionUpdate(msg.lobby_state.session)
      }
      // The snapshot carries only the session row. After a reconnect the maps
      // and the action list may be several steps behind (frames sent while
      // the socket was down are gone), so re-read the full state.
      resyncFromRest()
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
      // No full state yet (the session did not exist, or 404'd, when this
      // page loaded): the frame alone has no maps to render.
      if (!vetoStore.sessionState) resyncFromRest()
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
      // The final action arrives ONLY as this frame — no per-action frame —
      // so the last ban and the decider were never painted and "Maps
      // selected" omitted the decider until a reload.
      resyncFromRest()
    },

    player_connected(msg: PlayerConnectedMessage) {
      const idx = participants.value.findIndex(p => p.registration_id === msg.registration_id)
      if (idx !== -1) {
        participants.value[idx]!.connected = true
        participants.value[idx]!.username = msg.username
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

    server_assignment_update(msg: ServerAssignmentUpdateMessage) {
      matchServerStore.applyAssignmentUpdate(msg)
      // The socket only sends connect details to captains/owners/delegates:
      // every other roster member is a "spectator" on this channel and gets
      // the bare status, so their server card flipped to Ready with nothing
      // in it. The REST endpoint gates on roster membership, so re-read it.
      const id = matchId.value
      if (id) matchServerStore.fetchMatchServer(id).catch(() => {})
    },
    lineup_update(_msg: LineupUpdateMessage) {
      // A substitution was applied server-side — refresh the panel data.
      if (matchId.value) {
        void matchServerStore.fetchSubstitutions(matchId.value)
      }
    },
    live_score_update(msg: LiveScoreUpdateMessage) {
      matchServerStore.applyLiveScore({
        map_number: msg.map_number,
        team1_score: msg.team1_score,
        team2_score: msg.team2_score,
        round_number: msg.round_number,
      })
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

  /** Fire-and-forget full veto read; failure leaves the pushed state as is. */
  function resyncFromRest() {
    const id = matchId.value
    if (id) vetoStore.getVetoSession(id).catch(() => {})
  }

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
    // `cancelled` is a real session status (veto_sessions_check_status,
    // api/migrations/0034_veto_sessions.sql:42). It used to fall through to the
    // `in_progress` branch below, so a cancelled session still rendered a turn
    // indicator, a live countdown and clickable maps. See COVERAGE-PLAN.md §9c.
    if (s.status === 'cancelled') return 'cancelled'
    if (s.status === 'pending') return 'waiting'
    if (s.status === 'coin_flip') return 'coin_flip'
    // status === 'in_progress'
    const currentAction = state.value?.current_action
    // Unknown step on a LIVE session means "not synced yet", never "done" —
    // completion is the session status above. Reporting `completed` here
    // showed "Veto complete!" the moment the coin flip landed.
    if (!currentAction) return 'waiting'
    if (currentAction.action_type === 'ban') return 'banning'
    if (currentAction.action_type === 'pick') return 'picking'
    return 'side_select'
  })

  /** The viewer's TEAM is on the clock (whoever on it may act). */
  const isMyTeamsTurn = computed(() => {
    if (!session.value || !userRegistrationId.value) return false
    return session.value.current_team_turn === userRegistrationId.value
  })

  /**
   * Whether the viewer may make veto choices for their team. The veto API
   * accepts only the captain, owner, a delegate or tournament staff; an
   * ordinary roster member shares the team's registration id, so comparing
   * ids alone handed them "Your turn!" and clickable maps that 403'd.
   *
   * Two server-derived signals, either of which is enough: the check-in
   * permission, and the role the lobby socket assigned (`participant` and
   * `admin` are exactly the callers the veto authorizer lets act).
   */
  const canActInVeto = computed(() => {
    if (!canActForRegistration) return true
    return (
      canActForRegistration.value ||
      userRole.value === 'participant' ||
      userRole.value === 'admin'
    )
  })

  const isMyTurn = computed(() => isMyTeamsTurn.value && canActInVeto.value)

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
      } else if (matchServerStore.isActive()) {
        // §7.3 (review M7): a reload during server setup / a live match
        // must still get realtime pushes — the veto being finished no
        // longer means the lobby is dead.
        socket.connect()
      }
    } catch {
      // No veto session exists yet — try connecting anyway for lobby features
      socket.connect()
    }
  }

  /**
   * Re-read the veto session over REST WITHOUT dropping the socket or blanking
   * the panel (unlike `initialize`, which clears the store first).
   *
   * `rejoin`: the server only runs its "both captains are here — flip the
   * coin" check when a participant socket JOINS. A page that was already
   * connected through check-in never re-joins, so the flip waited for the
   * background pass and its turn clock started unseen. Re-joining once while
   * the session is still waiting on the flip triggers it immediately.
   */
  async function resync(opts: { rejoin?: boolean } = {}) {
    const id = matchId.value
    if (!id) return
    await vetoStore.getVetoSession(id).catch(() => null)
    if (matchId.value !== id) return
    const status = session.value?.status
    if (!status || status === 'completed' || status === 'cancelled') return
    const needsFlip = status === 'coin_flip'
    if ((opts.rejoin && needsFlip) || (!socket.connected.value && !socket.usingFallback.value)) {
      socket.connect()
    }
    startCountdown()
  }

  /**
   * Open the lobby socket if it is not already up. Unlike `initialize` this
   * never clears veto state or drops a healthy connection.
   */
  function ensureConnected() {
    if (!matchId.value) return
    if (socket.connected.value || socket.usingFallback.value) return
    socket.connect()
  }

  // Watch for session status changes. A cancelled session is as finished as a
  // completed one — keeping the countdown running and the socket open left a
  // dead session ticking down.
  watch(() => session.value?.status, (status) => {
    if (status === 'completed' || status === 'cancelled') {
      stopCountdown()
      // §7.3: veto completion used to close the socket, blinding the page
      // exactly when server setup starts. Keep it open while a server
      // assignment is (or may become) active; it closes on unmount.
      if (status === 'cancelled' && !matchServerStore.isActive()) {
        socket.disconnect()
      }
    }
  })

  // Watch for deadline changes to restart countdown
  watch(actionDeadline, () => {
    if (actionDeadline.value && phase.value !== 'completed' && phase.value !== 'cancelled') {
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
    isMyTeamsTurn,
    canActInVeto,
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

    // Raw frame subscription (PUG wheel spins ride the same socket)
    onMessage: socket.onMessage,

    // Lifecycle
    initialize,
    resync,
    ensureConnected,
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
