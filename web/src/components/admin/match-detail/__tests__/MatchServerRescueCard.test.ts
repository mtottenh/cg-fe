import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import MatchServerRescueCard from '@/components/admin/match-detail/MatchServerRescueCard.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'

/**
 * The card an admin reaches for when players are being kicked by a match
 * config with the wrong roster in it: see what is wrong with the rosters,
 * clear the match off the server, and load it again once the roster is fixed.
 * It must never claim the server was cleared when the server did not say so.
 */

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock
const vuetify = createVuetify({ components, directives })

const MATCH_ID = '01912f00-0000-7000-8000-00000000beef'

let wrapper: VueWrapper | null = null
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  mockGet.mockReset()
  mockPost.mockReset()
  mockDelete.mockReset()
})

function reservation(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: 'res-1', status, server_name: 'game-1', failure_reason: null,
    queue_position: null, retry_count: 0, updated_at: '2032-04-17T19:50:00Z', ...extra,
  }
}

function mountCard(res: Record<string, unknown> | null) {
  wrapper = mount(MatchServerRescueCard, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: { matchId: MATCH_ID, reservation: res as any },
  })
  return wrapper
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const overlayButton = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.v-overlay--active .v-btn'))
    .find((b) => b.textContent!.trim() === label)!

async function clear() {
  byTestId('server-clear')!.click()
  await flushPromises()
  overlayButton('Clear match').click()
  await flushPromises()
}

describe('MatchServerRescueCard clear', () => {
  it('explains what clearing is for', () => {
    mountCard(reservation('ready'))
    expect(wrapper!.text()).toContain('Unloads the match config from the game server so anyone can connect')
    expect(wrapper!.text()).toContain('players are being kicked because the roster in the loaded config is wrong')
  })

  it('reports a confirmed clear, naming the server', async () => {
    const w = mountCard(reservation('ready'))
    mockDelete.mockResolvedValue({ data: { data: { released_reservation: true, server_cleared: true, server_name: 'game-1' } } })
    await clear()
    expect(mockDelete).toHaveBeenCalledWith('/v1/matches/{match_id}/server', { params: { path: { match_id: MATCH_ID } } })
    const result = byTestId('server-clear-result')!
    expect(result.textContent).toContain('The server reservation was released')
    expect(result.textContent).toContain('unloaded from game-1: anyone can connect now')
    expect(result.className).toContain('text-success')
    expect(w.emitted('changed')).toHaveLength(1)
  })

  it('clears a server that no reservation holds any more', async () => {
    mountCard(null)
    mockDelete.mockResolvedValue({ data: { data: { released_reservation: false, server_cleared: true, server_name: 'game-1' } } })
    await clear()
    const text = byTestId('server-clear-result')!.textContent!
    expect(text).toContain('There was no live reservation to release')
    expect(text).toContain('anyone can connect now')
  })

  it('does not claim the server was cleared when it did not confirm', async () => {
    mountCard(reservation('ready'))
    mockDelete.mockResolvedValue({ data: { data: {
      released_reservation: true,
      server_cleared: false,
      server_name: 'game-1',
      detail: "the game server's agent could not be reached (agent offline); the match config may still be loaded on it",
    } } })
    await clear()
    const result = byTestId('server-clear-result')!
    expect(result.textContent).toContain('was not confirmed as unloaded from game-1')
    // The backend's reason, as it came.
    expect(result.textContent).toContain("agent could not be reached (agent offline); the match config may still be loaded on it.")
    expect(result.textContent).not.toContain('anyone can connect now')
    expect(result.className).toContain('text-warning')
  })

  it('says why when the match was never on a server', async () => {
    mountCard(null)
    // `server_name` and `detail` are omitted, not null, when absent.
    mockDelete.mockResolvedValue({ data: { data: {
      released_reservation: false,
      server_cleared: false,
      detail: 'this match has not been loaded on any game server',
    } } })
    await clear()
    const text = byTestId('server-clear-result')!.textContent!
    expect(text).toContain('There was no live reservation to release')
    expect(text).toContain('This match has not been loaded on any game server.')
  })

  it('switches the server tools off when the admin lacks the server permission', async () => {
    mountCard(reservation('ready'))
    mockDelete.mockResolvedValue({ error: { status: 403, detail: 'Missing permission: admin.servers.manage' } })
    await clear()
    expect(byTestId('server-rescue-denied')!.textContent).toContain('admin.servers.manage')
    expect((byTestId('server-clear') as HTMLButtonElement).disabled).toBe(true)
    expect((byTestId('server-reload') as HTMLButtonElement).disabled).toBe(true)
    expect((byTestId('server-assign') as HTMLButtonElement).disabled).toBe(true)
    expect((byTestId('roster-check-run') as HTMLButtonElement).disabled).toBe(true)
  })

  it('treats a bodyless answer from an older backend as released but unconfirmed', async () => {
    mountCard(reservation('ready'))
    mockDelete.mockResolvedValue({ data: undefined })
    await clear()
    const text = byTestId('server-clear-result')!.textContent!
    expect(text).toContain('The server reservation was released')
    expect(text).toContain('was not confirmed as unloaded')
  })

  it('shows the backend\'s reason when the clear fails, and no result', async () => {
    const w = mountCard(reservation('ready'))
    mockDelete.mockResolvedValue({ error: { status: 502, detail: 'The agent on game-1 is offline' } })
    await clear()
    expect(byTestId('server-clear-error')!.textContent).toContain('The agent on game-1 is offline')
    expect(byTestId('server-clear-result')).toBeNull()
    expect(w.emitted('changed')).toBeUndefined()
  })
})

describe('MatchServerRescueCard reservation, reload and assign', () => {
  it('shows the failure reason and queue position', () => {
    mountCard(reservation('failed', { failure_reason: 'players on Team Bravo have no linked Steam ID: zed', retry_count: 3 }))
    expect(byTestId('server-rescue-status')!.textContent).toContain('Setup failed')
    expect(byTestId('server-rescue-failure')!.textContent).toContain('no linked Steam ID: zed')
    expect(byTestId('server-rescue-summary')!.textContent).toContain('retried 3 time(s)')
    wrapper!.unmount()
    document.body.innerHTML = ''
    mountCard(reservation('pending', { server_name: null, queue_position: 2 }))
    expect(byTestId('server-rescue-summary')!.textContent).toContain('number 2 in the queue')
  })

  it('offers "Assign server" only when nothing is reserved', () => {
    mountCard(reservation('live'))
    expect((byTestId('server-assign') as HTMLButtonElement).disabled).toBe(true)
    wrapper!.unmount()
    document.body.innerHTML = ''
    mountCard(reservation('failed'))
    expect((byTestId('server-assign') as HTMLButtonElement).disabled).toBe(false)
    wrapper!.unmount()
    document.body.innerHTML = ''
    mountCard(null)
    expect(byTestId('server-rescue-status')!.textContent).toContain('No reservation')
    expect((byTestId('server-assign') as HTMLButtonElement).disabled).toBe(false)
  })

  it('reloads the match with a reason, and keeps the refusal on screen', async () => {
    const w = mountCard(reservation('failed'))
    mockPost.mockResolvedValue({ error: { status: 400, detail: 'The match config cannot be rebuilt: players on "Team Bravo" have no usable Steam ID: zed' } })
    // A refused reload runs the roster check so the admin sees who is at fault.
    mockGet.mockResolvedValue({ data: { data: { ok: false, players_per_team: 5, min_players_to_ready: 5, problems: [], teams: [] } } })
    byTestId('server-reload')!.click()
    await flushPromises()
    byTestId('reason-dialog-confirm')!.click()
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/v1/matches/{match_id}/server/reload', {
      params: { path: { match_id: MATCH_ID } },
      body: { reason: 'Reloading the match with corrected rosters' },
    })
    expect(byTestId('reason-dialog-error')!.textContent).toContain('no usable Steam ID: zed')
    expect(byTestId('server-reload-error')!.textContent).toContain('no usable Steam ID: zed')
    expect(byTestId('server-reload-error')!.textContent).toContain('Nothing on the server was changed')
    expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/server/roster-check', { params: { path: { match_id: MATCH_ID } } })
    expect(byTestId('roster-check-verdict')!.textContent).toContain('Rosters have problems')
    expect(w.emitted('changed')).toBeUndefined()
  })
})

describe('MatchServerRescueCard roster check', () => {
  const CHECK = {
    ok: false,
    players_per_team: 5,
    min_players_to_ready: 5,
    problems: [],
    teams: [
      {
        registration_id: 'reg-1', name: 'Team Alpha', usable_players: 5, problems: [],
        players: [
          { player_id: 'p1', display_name: 'ace', steam_id: '76561198000000001', valid: true, source: 'roster', problem: null },
          { player_id: 'p2', display_name: 'sub', steam_id: '76561198000000002', valid: true, source: 'substitution', problem: null },
        ],
      },
      {
        registration_id: 'reg-2', name: 'Team Bravo', usable_players: 4,
        problems: ['only 4 usable players; 5 needed to ready up'],
        players: [
          { player_id: 'p3', display_name: 'zed', steam_id: null, valid: false, source: 'roster', problem: 'no linked Steam ID' },
        ],
      },
    ],
  }

  it('shows each team with its players, Steam IDs, validity and problems', async () => {
    mountCard(reservation('failed'))
    mockGet.mockResolvedValue({ data: { data: CHECK } })
    byTestId('roster-check-run')!.click()
    await flushPromises()
    expect(mockGet).toHaveBeenCalledWith('/v1/matches/{match_id}/server/roster-check', { params: { path: { match_id: MATCH_ID } } })
    expect(byTestId('roster-check-verdict')!.textContent).toContain('Rosters have problems')
    const alpha = byTestId('roster-team-reg-1')!.textContent!
    expect(alpha).toContain('Team Alpha')
    expect(alpha).toContain('76561198000000001')
    expect(alpha).toContain('(substitute)')
    const bravo = byTestId('roster-team-reg-2')!.textContent!
    expect(bravo).toContain('only 4 usable players; 5 needed to ready up')
    expect(bravo).toContain('zed')
    expect(bravo).toContain('no linked Steam ID')
  })

  it('shows why the check could not run', async () => {
    mountCard(null)
    mockGet.mockResolvedValue({ error: { status: 403, detail: 'Missing admin.servers.manage' } })
    byTestId('roster-check-run')!.click()
    await flushPromises()
    expect(byTestId('roster-check-error')!.textContent).toContain('Missing admin.servers.manage')
    expect(byTestId('roster-check-verdict')).toBeNull()
  })
})
