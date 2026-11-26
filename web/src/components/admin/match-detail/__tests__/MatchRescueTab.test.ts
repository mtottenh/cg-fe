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
import MatchRescueTab from '@/components/admin/match-detail/MatchRescueTab.vue'
import { SnackbarKey, createSnackbar, type SnackbarInstance } from '@/composables/useSnackbar'

/**
 * The Rescue tab is how an admin gets a stuck match moving without the
 * database: it shows what is wrong, offers the one action that fixes each
 * problem, and keeps every tool reachable, disabled with a reason when the
 * match is not in a state for it.
 */

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockDelete = api.DELETE as unknown as Mock
const vuetify = createVuetify({ components, directives })

const TOURNAMENT = 'tour-1'
const MATCH_ID = '01912f00-0000-7000-8000-00000000beef'
const REG_1 = '01912f00-0000-7000-8000-000000000001'
const REG_2 = '01912f00-0000-7000-8000-000000000002'
const BASE = '/v1/admin/tournaments/{tournament_id}/matches/{match_id}'

let wrapper: VueWrapper | null = null
let snackbar: SnackbarInstance
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  mockGet.mockReset()
  mockPost.mockReset()
  mockDelete.mockReset()
})

function makeMatch(status: string, extra: Record<string, unknown> = {}) {
  return {
    id: MATCH_ID,
    tournament_id: TOURNAMENT,
    match_number: 1,
    round: 1,
    status,
    match_format: 'bo3',
    participant1_registration_id: REG_1,
    participant2_registration_id: REG_2,
    participant1_name: 'Team Alpha',
    participant2_name: 'Team Bravo',
    participant1_checked_in_at: null,
    participant2_checked_in_at: null,
    winner_registration_id: null,
    scheduled_at: null,
    veto_required: false,
    disputed: false,
    ...extra,
  }
}

function makeDiagnostics(status: string, extra: Record<string, unknown> = {}) {
  return {
    status,
    scheduled_at: null,
    check_in_deadline: null,
    participant1_checked_in_at: null,
    participant2_checked_in_at: null,
    veto_required: false,
    veto: null,
    reservation: null,
    pending_proposal: null,
    pending_claim: null,
    open_dispute_id: null,
    disputed: false,
    saga: null,
    problems: [],
    ...extra,
  }
}

const ok = (data: unknown) => ({ data: { data } })
const refused = (detail: string) => ({ error: { status: 400, detail } })

async function mountTab(status: string, opts: {
  match?: Record<string, unknown>
  diagnostics?: Record<string, unknown> | 'fail'
} = {}) {
  if (opts.diagnostics === 'fail') {
    mockGet.mockResolvedValue({ error: { status: 404, detail: 'Not Found' } })
  } else {
    mockGet.mockResolvedValue(ok(makeDiagnostics(status, opts.diagnostics)))
  }
  snackbar = createSnackbar()
  wrapper = mount(MatchRescueTab, {
    attachTo: document.body,
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: snackbar },
    },
    props: {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      match: makeMatch(status, opts.match) as any,
      tournamentId: TOURNAMENT,
      active: true,
    },
  })
  await flushPromises()
  return wrapper
}

const byTestId = (id: string) => document.querySelector<HTMLElement>(`[data-testid="${id}"]`)
const button = (id: string) => byTestId(id) as HTMLButtonElement | null

/** Confirm the open reason dialog, optionally replacing the reason first. */
async function confirmReason(reason?: string) {
  await flushPromises()
  if (reason !== undefined) {
    const input = byTestId('reason-dialog-reason')!.querySelector('input')!
    input.value = reason
    input.dispatchEvent(new Event('input'))
    await flushPromises()
  }
  button('reason-dialog-confirm')!.click()
  await flushPromises()
}

const postsTo = (path: string) => mockPost.mock.calls.filter((c) => c[0] === path)

describe('MatchRescueTab diagnostics', () => {
  it('loads diagnostics for the match when the tab is shown', async () => {
    await mountTab('ready')
    expect(mockGet).toHaveBeenCalledWith(`${BASE}/diagnostics`, {
      params: { path: { tournament_id: TOURNAMENT, match_id: MATCH_ID } },
    })
    expect(byTestId('rescue-no-problems')).not.toBeNull()
  })

  it('describes the state in words: missing time, expired window, who has checked in', async () => {
    const past = new Date(Date.now() - 12 * 60_000).toISOString()
    await mountTab('checking_in', {
      diagnostics: {
        check_in_deadline: past,
        participant1_checked_in_at: '2032-04-17T19:45:00Z',
        veto_required: true,
        reservation: {
          id: 'r1', status: 'failed', server_name: 'game-1', failure_reason: 'players on Team Bravo have no linked Steam ID: zed',
          queue_position: null, retry_count: 3, updated_at: '2032-04-17T19:50:00Z',
        },
      },
    })
    const text = byTestId('rescue-summary')!.textContent!
    expect(text).toContain('StatusCheck-in')
    expect(text).toContain('Not set')
    expect(text).toContain('expired 12 min ago')
    expect(text).toContain('Team Alpha: checked in')
    expect(text).toContain('Team Bravo: not checked in')
    expect(text).toContain('Required, but no veto session exists')
    expect(text).toContain('Setup failed')
    expect(text).toContain('no linked Steam ID: zed')
  })

  it('still offers the tools when diagnostics cannot be loaded', async () => {
    await mountTab('scheduled', { diagnostics: 'fail' })
    expect(byTestId('rescue-diagnostics-error')!.textContent).toContain('Not Found')
    expect(byTestId('rescue-summary')!.textContent).toContain('Not set')
    expect(button('rescue-reset')!.disabled).toBe(false)
    expect(button('rescue-checkin-window')!.disabled).toBe(false)
  })
})

describe('MatchRescueTab problems', () => {
  const PROBLEMS = [
    { code: 'scheduled_without_time', suggested_action: 'set_time', label: 'Set match time' },
    { code: 'checkin_expired', suggested_action: 'extend_checkin', label: 'Extend check-in' },
    { code: 'veto_stalled', suggested_action: 'reset_veto', label: 'Restart veto' },
    { code: 'cancelled_by_no_show', suggested_action: 'reset', label: 'Reset match to Ready' },
    { code: 'pick_ban_veto_complete_no_server', suggested_action: 'assign_server', label: 'Assign server' },
    { code: 'reservation_failed', suggested_action: 'reload_server', label: 'Reload match on server' },
    { code: 'reservation_live_match_terminal', suggested_action: 'clear_server', label: 'Clear match from server' },
    { code: 'roster_invalid', suggested_action: 'roster_check', label: 'Check rosters' },
    { code: 'saga_failed', suggested_action: 'retry_completion', label: 'Retry completion' },
  ]

  it('gives each problem its message and exactly one button named for its fix', async () => {
    await mountTab('checking_in', {
      diagnostics: {
        problems: PROBLEMS.map((p) => ({ code: p.code, message: `Problem: ${p.code}`, suggested_action: p.suggested_action })),
      },
    })
    for (const p of PROBLEMS) {
      const row = byTestId(`rescue-problem-${p.code}`)!
      expect(row.textContent, p.code).toContain(`Problem: ${p.code}`)
      const buttons = row.querySelectorAll('button')
      expect(buttons.length, p.code).toBe(1)
      expect(buttons[0]!.textContent!.trim(), p.code).toBe(p.label)
    }
  })

  it('shows a problem with an unknown action without a button', async () => {
    await mountTab('ready', {
      diagnostics: { problems: [{ code: 'something_new', message: 'A new kind of problem', suggested_action: 'teleport' }] },
    })
    const row = byTestId('rescue-problem-something_new')!
    expect(row.textContent).toContain('A new kind of problem')
    expect(row.querySelectorAll('button').length).toBe(0)
  })

  it('"Set match time" on a problem sends the admin to the schedule form', async () => {
    const w = await mountTab('scheduled', {
      diagnostics: { problems: [{ code: 'scheduled_without_time', message: 'No time', suggested_action: 'set_time' }] },
    })
    button('rescue-fix-scheduled_without_time')!.click()
    await flushPromises()
    expect(w.emitted('set-time')).toHaveLength(1)
  })

  it('"Restart veto" on a problem posts the veto reset with the typed reason, then re-reads diagnostics', async () => {
    const w = await mountTab('pick_ban', {
      diagnostics: { problems: [{ code: 'veto_stalled', message: 'Stalled', suggested_action: 'reset_veto' }] },
    })
    mockPost.mockResolvedValue(ok(makeMatch('pick_ban')))
    button('rescue-fix-veto_stalled')!.click()
    await confirmReason('captain disconnected mid-veto')
    expect(mockPost).toHaveBeenCalledWith(`${BASE}/veto/reset`, {
      params: { path: { tournament_id: TOURNAMENT, match_id: MATCH_ID } },
      body: { reason: 'captain disconnected mid-veto' },
    })
    expect(w.emitted('updated')).toHaveLength(1)
    expect(mockGet).toHaveBeenCalledTimes(2)
  })

  it('"Clear match from server" on a problem clears the server after confirmation', async () => {
    await mountTab('forfeit', {
      diagnostics: { problems: [{ code: 'reservation_live_match_terminal', message: 'Server still held', suggested_action: 'clear_server' }] },
    })
    mockDelete.mockResolvedValue(ok({ released_reservation: true, server_cleared: true, server_name: 'game-1' }))
    button('rescue-fix-reservation_live_match_terminal')!.click()
    await flushPromises()
    const confirm = Array.from(document.querySelectorAll<HTMLElement>('.v-overlay--active .v-btn'))
      .find((b) => b.textContent!.trim() === 'Clear match')!
    confirm.click()
    await flushPromises()
    expect(mockDelete).toHaveBeenCalledWith('/v1/matches/{match_id}/server', {
      params: { path: { match_id: MATCH_ID } },
    })
    expect(byTestId('server-clear-result')!.textContent).toContain('anyone can connect now')
  })
})

describe('MatchRescueTab tools by status', () => {
  const TOOLS = [
    'rescue-set-time', 'rescue-checkin-window', 'rescue-start-veto', 'rescue-reset-veto',
    'rescue-skip-veto', 'rescue-retry-completion', 'rescue-reset',
  ]
  const ENABLED: Record<string, string[]> = {
    ready: ['rescue-set-time', 'rescue-checkin-window'],
    scheduled: ['rescue-set-time', 'rescue-checkin-window', 'rescue-reset'],
    checking_in: ['rescue-checkin-window', 'rescue-start-veto', 'rescue-reset-veto', 'rescue-reset'],
    pick_ban: ['rescue-reset-veto', 'rescue-skip-veto', 'rescue-reset'],
    in_progress: ['rescue-reset-veto', 'rescue-reset'],
    forfeit: ['rescue-retry-completion', 'rescue-reset'],
    cancelled: ['rescue-reset'],
    completed: ['rescue-retry-completion'],
  }

  for (const [status, enabled] of Object.entries(ENABLED)) {
    it(`${status}: enables ${enabled.join(', ')} and explains every disabled tool`, async () => {
      await mountTab(status)
      for (const id of TOOLS) {
        const on = enabled.includes(id)
        expect(button(id)!.disabled, id).toBe(!on)
        // A disabled tool carries its reason; an enabled one carries none.
        expect(!!byTestId(`${id}-why`), id).toBe(!on)
      }
    })
  }

  it('offers the guided reopen only on a match decided without being played', async () => {
    await mountTab('cancelled')
    expect(byTestId('rescue-reopen-card')).not.toBeNull()
    document.body.innerHTML = ''
    wrapper!.unmount()
    await mountTab('checking_in')
    expect(byTestId('rescue-reopen-card')).toBeNull()
  })

  it('offers a check-in button only for the team that has not checked in', async () => {
    await mountTab('checking_in', { diagnostics: { participant1_checked_in_at: '2032-04-17T19:45:00Z' } })
    expect(byTestId('rescue-checkin-team-1')).toBeNull()
    expect(button('rescue-checkin-team-2')!.textContent).toContain('Check in Team Bravo')
  })

  it('checks a team in through the ordinary check-in endpoint with that team\'s registration', async () => {
    await mountTab('checking_in')
    mockPost.mockResolvedValue(ok(makeMatch('checking_in')))
    button('rescue-checkin-team-2')!.click()
    await flushPromises()
    Array.from(document.querySelectorAll<HTMLElement>('.v-overlay--active .v-btn'))
      .find((b) => b.textContent!.trim() === 'Check in')!.click()
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/matches/{match_id}/check-in', {
      params: { path: { tournament_id: TOURNAMENT, match_id: MATCH_ID } },
      body: { registration_id: REG_2 },
    })
  })
})

describe('MatchRescueTab check-in window', () => {
  it('defaults the deadline to about twenty minutes from now', async () => {
    await mountTab('ready')
    const input = byTestId('rescue-deadline')!.querySelector('input')!
    const minutes = (new Date(input.value).getTime() - Date.now()) / 60_000
    expect(minutes).toBeGreaterThan(18)
    expect(minutes).toBeLessThanOrEqual(20)
  })

  it('opens check-in with the picked deadline and a reason', async () => {
    await mountTab('scheduled')
    mockPost.mockResolvedValue(ok(makeMatch('checking_in')))
    expect(button('rescue-checkin-window')!.textContent).toContain('Open check-in now')
    const input = byTestId('rescue-deadline')!.querySelector('input')!
    input.value = '2032-04-17T20:30'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    button('rescue-checkin-window')!.click()
    await confirmReason()
    const [call] = postsTo(`${BASE}/check-in-window`)
    expect(call![1].body).toEqual({
      deadline: new Date('2032-04-17T20:30').toISOString(),
      reason: 'Opening check-in by hand',
    })
  })

  it('extends from the current deadline when it has time left, and labels the tool accordingly', async () => {
    const inTen = new Date(Date.now() + 10 * 60_000)
    await mountTab('checking_in', { diagnostics: { check_in_deadline: inTen.toISOString() } })
    expect(button('rescue-checkin-window')!.textContent).toContain('Extend check-in')
    byTestId('rescue-deadline-plus-30')!.click()
    await flushPromises()
    const input = byTestId('rescue-deadline')!.querySelector('input')!
    const minutes = (new Date(input.value).getTime() - Date.now()) / 60_000
    // +30 on top of the 10 still left, to the minute the input holds.
    expect(minutes).toBeGreaterThan(38)
    expect(minutes).toBeLessThanOrEqual(40)
  })

  it('keeps the dialog open with the backend\'s own words when the window is refused', async () => {
    const w = await mountTab('checking_in')
    mockPost.mockResolvedValue(refused('Deadline must be in the future'))
    button('rescue-checkin-window')!.click()
    await confirmReason()
    expect(byTestId('reason-dialog-error')!.textContent).toContain('Deadline must be in the future')
    expect(snackbar.text).toBe('Deadline must be in the future')
    expect(w.emitted('updated')).toBeUndefined()
  })
})

describe('MatchRescueTab reset and guided reopen', () => {
  it('lists exactly what a reset clears before the admin confirms', async () => {
    await mountTab('pick_ban')
    button('rescue-reset')!.click()
    await flushPromises()
    const effects = byTestId('reason-dialog-effects')!.textContent!
    for (const cleared of ['match time', 'check-ins', 'veto', 'result, forfeit', 'server reservation']) {
      expect(effects, cleared).toContain(cleared)
    }
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('requires a reason', async () => {
    await mountTab('pick_ban')
    button('rescue-reset')!.click()
    await confirmReason('   ')
    expect(button('reason-dialog-confirm')!.disabled).toBe(true)
    expect(mockPost).not.toHaveBeenCalled()
  })

  it('reopens a cancelled match: reset first, then the check-in window, with one reason', async () => {
    const w = await mountTab('cancelled')
    mockPost.mockResolvedValue(ok(makeMatch('ready')))
    button('rescue-reopen')!.click()
    await confirmReason('both captains were in voice, missed the button')
    expect(mockPost.mock.calls.map((c) => c[0])).toEqual([`${BASE}/reset`, `${BASE}/check-in-window`])
    expect(mockPost.mock.calls[0]![1].body).toEqual({ reason: 'both captains were in voice, missed the button' })
    expect(mockPost.mock.calls[1]![1].body.reason).toBe('both captains were in voice, missed the button')
    expect(new Date(mockPost.mock.calls[1]![1].body.deadline).getTime()).toBeGreaterThan(Date.now())
    expect(snackbar.color).toBe('success')
    expect(w.emitted('updated')).toHaveLength(1)
    expect(byTestId('rescue-reopen-failure')).toBeNull()
  })

  it('stops when the reset is refused: nothing changed, check-in not attempted', async () => {
    const w = await mountTab('forfeit')
    mockPost.mockResolvedValue(refused('Match has an open dispute'))
    button('rescue-reopen')!.click()
    await confirmReason()
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(byTestId('reason-dialog-error')!.textContent).toContain('Nothing was changed')
    expect(byTestId('reason-dialog-error')!.textContent).toContain('Match has an open dispute')
    expect(w.emitted('updated')).toBeUndefined()
  })

  it('says the match was reset when only the check-in step fails, and refreshes', async () => {
    const w = await mountTab('cancelled')
    mockPost
      .mockResolvedValueOnce(ok(makeMatch('ready')))
      .mockResolvedValueOnce(refused('Map pool has 5 maps; bo3_veto needs 7'))
    button('rescue-reopen')!.click()
    await confirmReason()
    const failure = byTestId('rescue-reopen-failure')!.textContent!
    expect(failure).toContain('The match was reset to Ready')
    expect(failure).toContain('Map pool has 5 maps; bo3_veto needs 7')
    expect(snackbar.color).toBe('error')
    // The reset did happen, so the page is told to refetch.
    expect(w.emitted('updated')).toHaveLength(1)
  })
})

describe('MatchRescueTab transitions', () => {
  it('starts the veto from check-in through the transition endpoint', async () => {
    await mountTab('checking_in')
    mockPost.mockResolvedValue(ok(makeMatch('pick_ban')))
    button('rescue-start-veto')!.click()
    await confirmReason()
    expect(mockPost).toHaveBeenCalledWith(`${BASE}/transition`, {
      params: { path: { tournament_id: TOURNAMENT, match_id: MATCH_ID } },
      body: { to_status: 'pick_ban', override_reason: 'Starting the veto without waiting for check-in' },
    })
  })

  it('warns that skipping the veto means no server before starting the match', async () => {
    await mountTab('pick_ban')
    mockPost.mockResolvedValue(ok(makeMatch('in_progress')))
    button('rescue-skip-veto')!.click()
    await flushPromises()
    expect(byTestId('reason-dialog')!.textContent).toContain('will not load the match onto a game server')
    await confirmReason()
    expect(postsTo(`${BASE}/transition`)[0]![1].body.to_status).toBe('in_progress')
  })

  it('reports what a completion retry did', async () => {
    await mountTab('completed')
    mockPost.mockResolvedValue(ok({ ran: true, outcome: 'standings recomputed' }))
    button('rescue-retry-completion')!.click()
    await confirmReason()
    expect(postsTo(`${BASE}/completion/retry`)).toHaveLength(1)
    expect(snackbar.text).toBe('Completion re-run: standings recomputed')
  })
})
