import { describe, it, expect, beforeEach, vi, type Mock } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/withActionState) behave exactly as in production.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { api, ApiError } from '@/api'
import {
  useVetoStore,
  type VetoSessionResponse,
  type VetoSessionStateResponse,
  type VetoActionResponse,
  type MapStatusResponse,
} from '@/stores/veto'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function makeSession(overrides: Partial<VetoSessionResponse> = {}): VetoSessionResponse {
  return {
    id: 'session-1',
    match_id: 'match-1',
    status: 'in_progress',
    veto_format_id: 'bo1_veto',
    current_action_number: 0,
    current_team_turn: 'reg-a',
    map_pool: ['de_inferno', 'de_nuke', 'de_mirage'],
    remaining_maps: ['de_inferno', 'de_nuke', 'de_mirage'],
    selected_maps: [],
    side_selection_mode: 'picker_choice',
    timeout_seconds: 60,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  } as VetoSessionResponse
}

function makeMap(mapId: string, overrides: Partial<MapStatusResponse> = {}): MapStatusResponse {
  return {
    map_id: mapId,
    map_name: mapId,
    status: 'available',
    ...overrides,
  } as MapStatusResponse
}

function makeAction(overrides: Partial<VetoActionResponse> = {}): VetoActionResponse {
  return {
    id: 'action-1',
    session_id: 'session-1',
    action_number: 0,
    action_type: 'ban',
    map_id: 'de_nuke',
    performed_by_registration_id: 'reg-a',
    performed_at: '2026-01-01T00:01:00Z',
    was_auto_action: false,
    ...overrides,
  } as VetoActionResponse
}

function makeSessionState(
  overrides: Partial<NonNullable<VetoSessionStateResponse>> = {},
): VetoSessionStateResponse {
  return {
    session: makeSession(),
    maps: [makeMap('de_inferno'), makeMap('de_nuke'), makeMap('de_mirage')],
    actions: [],
    format: {
      id: 'bo1_veto',
      display_name: 'BO1 Veto',
      description: '',
      maps_selected: 1,
      min_map_pool: 3,
      sequence: [
        { action_type: 'ban', team: 1 },
        { action_type: 'ban', team: 2 },
        { action_type: 'decider', team: 0 },
      ],
    },
    current_action: { action_type: 'ban', team: 1 },
    ...overrides,
  } as VetoSessionStateResponse
}

describe('Veto Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
  })

  describe('getVetoSession', () => {
    it('fetches state and populates sessionState + session', async () => {
      const state = makeSessionState()
      mockGet.mockResolvedValue({ data: { data: state } })
      const store = useVetoStore()

      const result = await store.getVetoSession('match-1')

      expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/veto', {
        params: { path: { match_id: 'match-1' } },
      })
      expect(result).toEqual(state)
      expect(store.sessionState).toEqual(state)
      expect(store.session).toEqual(state!.session)
      expect(store.getSessionState.loading).toBe(false)
      expect(store.getSessionState.error).toBeNull()
    })

    it('records the error detail and rethrows on API failure', async () => {
      mockGet.mockResolvedValue({ error: { status: 404, detail: 'No veto session' } })
      const store = useVetoStore()

      await expect(store.getVetoSession('match-1')).rejects.toThrow(ApiError)
      expect(store.getSessionState.error).toBe('No veto session')
      expect(store.getSessionState.loading).toBe(false)
      expect(store.session).toBeNull()
      expect(store.sessionState).toBeNull()
    })
  })

  describe('performVetoAction', () => {
    it('POSTs the map_id to the veto action endpoint and stores the updated session', async () => {
      const updatedSession = makeSession({ current_action_number: 1, current_team_turn: 'reg-b' })
      const action = makeAction()
      mockPost.mockResolvedValue({
        data: { data: { session: updatedSession, action, is_complete: false } },
      })
      const store = useVetoStore()

      const result = await store.performVetoAction('match-1', { map_id: 'de_nuke' })

      expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/veto/action', {
        params: { path: { match_id: 'match-1' } },
        body: { map_id: 'de_nuke' },
      })
      expect(result.action).toEqual(action)
      expect(store.session).toEqual(updatedSession)
      expect(store.vetoActionState.loading).toBe(false)
      expect(store.vetoActionState.error).toBeNull()
    })

    it('sets vetoActionState.error and leaves the session untouched on failure', async () => {
      mockPost.mockResolvedValue({ error: { status: 409, detail: 'Not your turn' } })
      const store = useVetoStore()
      const before = makeSession()
      store.session = before

      await expect(store.performVetoAction('match-1', { map_id: 'de_nuke' })).rejects.toThrow(
        'Not your turn',
      )
      expect(store.vetoActionState.error).toBe('Not your turn')
      expect(store.vetoActionState.loading).toBe(false)
      expect(store.session).toEqual(before)
    })

    it('falls back to the generic message for non-API errors', async () => {
      mockPost.mockRejectedValue(new TypeError('fetch failed'))
      const store = useVetoStore()

      await expect(store.performVetoAction('match-1', { map_id: 'de_nuke' })).rejects.toThrow()
      expect(store.vetoActionState.error).toBe('Failed to perform veto action')
    })
  })

  describe('applySessionUpdate (WS veto_state_update payload)', () => {
    it('replaces the session and syncs the nested sessionState.session', () => {
      const store = useVetoStore()
      store.sessionState = makeSessionState()

      const updated = makeSession({ status: 'completed', current_action_number: 3 })
      store.applySessionUpdate(updated)

      expect(store.session).toEqual(updated)
      expect(store.sessionState!.session).toEqual(updated)
    })

    it('works without a loaded sessionState', () => {
      const store = useVetoStore()
      const updated = makeSession({ status: 'completed' })
      store.applySessionUpdate(updated)
      expect(store.session).toEqual(updated)
      expect(store.sessionState).toBeNull()
    })
  })

  describe('applyActionPerformed (WS action payload)', () => {
    function seededStore() {
      const store = useVetoStore()
      store.sessionState = makeSessionState()
      store.session = store.sessionState!.session
      return store
    }

    it('marks the banned map and records who banned it, leaving other maps untouched', () => {
      const store = seededStore()
      const newSession = makeSession({ current_action_number: 1 })
      const action = makeAction({ action_type: 'ban', map_id: 'de_nuke' })

      store.applyActionPerformed(newSession, action)

      const maps = store.sessionState!.maps
      expect(maps.find((m) => m.map_id === 'de_nuke')).toMatchObject({
        status: 'banned',
        banned_by_registration_id: 'reg-a',
      })
      expect(maps.find((m) => m.map_id === 'de_inferno')!.status).toBe('available')
      expect(maps.find((m) => m.map_id === 'de_mirage')!.status).toBe('available')
      expect(store.session).toEqual(newSession)
    })

    it('marks picked maps with the picker registration', () => {
      const store = seededStore()
      const action = makeAction({
        action_type: 'pick',
        map_id: 'de_mirage',
        performed_by_registration_id: 'reg-b',
      })

      store.applyActionPerformed(makeSession({ current_action_number: 1 }), action)

      expect(store.sessionState!.maps.find((m) => m.map_id === 'de_mirage')).toMatchObject({
        status: 'picked',
        picked_by_registration_id: 'reg-b',
      })
    })

    it('marks decider maps', () => {
      const store = seededStore()
      const action = makeAction({ action_type: 'decider', map_id: 'de_inferno' })

      store.applyActionPerformed(makeSession({ current_action_number: 3 }), action)

      expect(store.sessionState!.maps.find((m) => m.map_id === 'de_inferno')!.status).toBe(
        'decider',
      )
    })

    it('advances current_action to the next step of the format sequence (whose turn)', () => {
      const store = seededStore()

      // After team 1's ban the backend sets current_action_number = 2 (the
      // next action, 1-based). current_action is sequence[current_action_number
      // - 1] = sequence[1] = team 2's ban — it is now their turn.
      store.applyActionPerformed(makeSession({ current_action_number: 2 }), makeAction())

      expect(store.sessionState!.current_action).toEqual({ action_type: 'ban', team: 2 })
    })

    it('sets current_action to null when the sequence is exhausted', () => {
      const store = seededStore()

      // current_action_number = 4 is one past the 3-step sequence, so
      // sequence[4 - 1] is out of bounds → no current action.
      store.applyActionPerformed(makeSession({ current_action_number: 4 }), makeAction())

      expect(store.sessionState!.current_action).toBeNull()
    })

    it('appends the action to history and dedupes by action_number', () => {
      const store = seededStore()
      const action = makeAction({ action_number: 0 })

      store.applyActionPerformed(makeSession({ current_action_number: 1 }), action)
      expect(store.sessionState!.actions).toHaveLength(1)

      // Same action arriving again (e.g. WS redelivery) must not duplicate
      store.applyActionPerformed(makeSession({ current_action_number: 1 }), action)
      expect(store.sessionState!.actions).toHaveLength(1)

      store.applyActionPerformed(
        makeSession({ current_action_number: 2 }),
        makeAction({ action_number: 1, map_id: 'de_inferno' }),
      )
      expect(store.sessionState!.actions).toHaveLength(2)
    })

    it('replaces an existing action when it is updated (e.g. side_selection added by the opponent)', () => {
      const store = seededStore()
      const pick = makeAction({ action_number: 0, action_type: 'pick', map_id: 'de_mirage' })

      store.applyActionPerformed(makeSession({ current_action_number: 1 }), pick)
      expect(store.sessionState!.actions).toHaveLength(1)
      expect(store.sessionState!.actions[0]!.side_selection).toBeUndefined()

      // The opponent later selects a side for that pick — the same action_number
      // arrives carrying side_selection and must replace the old entry in place.
      const withSide = {
        ...pick,
        side_selection: 'ct',
        side_selected_by_registration_id: 'reg-b',
      }
      store.applyActionPerformed(makeSession({ current_action_number: 1 }), withSide)
      expect(store.sessionState!.actions).toHaveLength(1)
      expect(store.sessionState!.actions[0]!.side_selection).toBe('ct')
    })

    it('ignores map updates when no sessionState is loaded but still tracks the session', () => {
      const store = useVetoStore()
      const newSession = makeSession({ current_action_number: 1 })

      store.applyActionPerformed(newSession, makeAction())

      expect(store.session).toEqual(newSession)
      expect(store.sessionState).toBeNull()
    })
  })

  describe('selectSide', () => {
    it('applies the returned action locally so the UI converges without the WS echo', async () => {
      const store = useVetoStore()
      store.session = makeSession({ current_action_number: 2 })
      store.sessionState = makeSessionState()

      const action = makeAction({
        action_number: 2,
        action_type: 'pick',
        map_id: 'de_nuke',
        side_selection: 'ct',
      })
      mockPost.mockResolvedValueOnce({ data: { data: action }, error: undefined })

      await store.selectSide('match-1', { side: 'ct' } as Parameters<typeof store.selectSide>[1])

      expect(store.sessionState?.actions?.some(a => a.action_number === 2 && a.side_selection === 'ct')).toBe(true)
    })

    it('records the error and rethrows on API failure', async () => {
      const store = useVetoStore()
      mockPost.mockResolvedValueOnce({ error: { status: 400, detail: 'Not your turn' } })

      await expect(
        store.selectSide('match-1', { side: 'ct' } as Parameters<typeof store.selectSide>[1]),
      ).rejects.toThrow(ApiError)
      expect(store.sideSelectState.error).toBe('Not your turn')
    })
  })

  describe('clear', () => {
    it('resets session, sessionState and delegates', () => {
      const store = useVetoStore()
      store.session = makeSession()
      store.sessionState = makeSessionState()

      store.clear()

      expect(store.session).toBeNull()
      expect(store.sessionState).toBeNull()
      expect(store.delegates).toEqual([])
    })
  })
})
