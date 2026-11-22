import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ServerUpdatesModal from '@/components/admin/ServerUpdatesModal.vue'
import type { GameServer } from '@/stores/gameServers'
import type { GameServerUpdates, UpdateJobResponse } from '@/utils/gameServerUpdates'

/**
 * The Updates modal against a mocked API. The e2e stack has no agent, so
 * this is where its rules are proven:
 *   - an unsupported host hides the feature behind one line;
 *   - the plan dialog requires "Interrupt anyway" (and only then sends
 *     force) when the restart gate would refuse, and never for lgsm;
 *   - rolled_back is shown as an outcome with its reason;
 *   - the overrides editor validates locally and shows the server's detail.
 */

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock
const mockPut = api.PUT as unknown as Mock

const vuetify = createVuetify({ components, directives })

const server: GameServer = {
  id: 'srv-1',
  name: 'eu-west-1',
  game_id: 'game-cs2',
  ip_address: '203.0.113.10',
  port: 27015,
  gotv_port: 27020,
  region: 'eu-west',
  enabled: true,
  allow_pugs: true,
  status: 'available',
  current_match_id: null,
  agent_connected: true,
  agent_version: '0.3.0',
  agent_cert_expires_at: null,
  last_heartbeat_at: '2026-11-22T12:00:00Z',
  last_gamestate: 'none',
  last_map: 'de_mirage',
  last_player_count: 2,
  last_status_at: '2026-11-22T12:00:00Z',
  enrollment_open: false,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-11-22T12:00:00Z',
}

function overview(overrides: Partial<GameServerUpdates> = {}): GameServerUpdates {
  return {
    server_id: 'srv-1',
    agent_connected: true,
    agent_version: '0.3.0',
    supported: true,
    capabilities: ['lgsm_update'],
    installed: { lgsm: 'v26.5.0', cs2_build: '100', metamod: null, cssharp: '1.0.379', matchzy: '0.9.3' },
    check: {
      checked_at: '2026-11-22T10:00:00Z',
      latest: { lgsm: 'v26.6.0', cs2_build: '100', metamod: null, cssharp: '1.0.380', matchzy: '0.9.3' },
      update_available: { lgsm: true, game: false, metamod: null, cssharp: true, matchzy: false, mods: true },
    },
    load: { metamod: true, cssharp: true, matchzy: false, error: null },
    demo_upload_wired: false,
    overrides_applied: null,
    reload_pending: false,
    agent_job: null,
    active_job: null,
    recent_jobs: [],
    safety: {
      humans_connected: 2,
      players: ['alice', 'bob'],
      reservation: null,
      bookings: [],
      restart_needs_force: true,
      reasons: ['2 players connected', 'MatchZy has a match loaded (gamestate warmup)'],
    },
    ...overrides,
  }
}

function job(overrides: Partial<UpdateJobResponse> = {}): UpdateJobResponse {
  return {
    id: 'job-1',
    server_id: 'srv-1',
    operation: 'mods',
    status: 'running',
    trigger: 'portal',
    requested_by: 'u-1',
    requested_by_username: 'max',
    forced: false,
    phase: 'mods-update',
    agent_synthesized: false,
    blocks_allocation: true,
    created_at: '2026-11-22T10:00:00Z',
    updated_at: '2026-11-22T10:00:05Z',
    ...overrides,
  }
}

function ok<T>(data: T) {
  return { data: { data, meta: { request_id: 'test' } }, error: undefined }
}

function failure(status: number, detail: string) {
  return { data: undefined, error: { type: 'about:blank', title: 'Error', status, detail } }
}

let wrapper: VueWrapper | null = null

function mountModal(props: Record<string, unknown> = {}) {
  wrapper = mount(ServerUpdatesModal, {
    props: { modelValue: true, server, ...props },
    global: { plugins: [vuetify], stubs: { ConfirmDialogHost: true } },
    attachTo: document.body,
  })
  return wrapper
}

function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`)
}

function inputOf(el: Element | null): HTMLInputElement {
  if (!el) throw new Error('no element')
  return (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement
}

async function settle() {
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

async function click(id: string) {
  const el = byTestId(id)
  if (!el) throw new Error(`no element with data-testid ${id}`)
  el.click()
  await settle()
}

describe('ServerUpdatesModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    mockPut.mockReset()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('hides everything behind one line when the host does not support updates', async () => {
    mockGet.mockResolvedValue(ok(overview({ supported: false })))
    mountModal()
    await settle()

    expect(byTestId('updates-unsupported')?.textContent).toContain('older than 0.3.0')
    expect(byTestId('updates-components')).toBeNull()
    expect(byTestId('updates-check')).toBeNull()
  })

  it('an overview that lands after the modal closed opens and polls nothing', async () => {
    let answer!: (v: unknown) => void
    mockGet.mockReturnValueOnce(new Promise((r) => (answer = r))).mockResolvedValue(ok(job()))
    mountModal()
    await settle()

    await wrapper?.setProps({ modelValue: false })
    answer(ok(overview({ active_job: job() })))
    await settle()

    expect(mockGet.mock.calls.filter(([p]) => String(p).endsWith('{job_id}'))).toHaveLength(0)
  })

  it("switching servers never shows the previous server's job", async () => {
    let answerA!: (v: unknown) => void
    mockGet.mockImplementation((path: string, opts: { params: { path: { server_id: string } } }) => {
      if (path.endsWith('{job_id}')) return Promise.resolve(ok(job({ server_id: opts.params.path.server_id })))
      if (opts.params.path.server_id === 'srv-1') return new Promise((r) => (answerA = r))
      return Promise.resolve(ok(overview({ server_id: 'srv-2' })))
    })
    mountModal()
    await settle()

    await wrapper?.setProps({ server: { ...server, id: 'srv-2', name: 'eu-west-2' } })
    await settle()
    answerA(ok(overview({ active_job: job() })))
    await settle()

    expect(byTestId('update-job')).toBeNull()
    expect(mockGet.mock.calls.filter(([p]) => String(p).endsWith('{job_id}'))).toHaveLength(0)
    expect(byTestId('updates-components')).not.toBeNull()
  })

  it('shows installed → latest, the update badges, load health and the demo-upload chip', async () => {
    mockGet.mockResolvedValue(ok(overview()))
    mountModal()
    await settle()

    const lgsm = byTestId('updates-row-lgsm')?.textContent ?? ''
    expect(lgsm).toContain('v26.5.0')
    expect(lgsm).toContain('v26.6.0')
    expect(lgsm).toContain('Update available')
    expect(byTestId('updates-row-game')?.textContent).toContain('up to date')
    expect(byTestId('updates-plugin-cssharp')?.textContent).toContain('1.0.380')
    expect(byTestId('updates-load-matchzy')?.textContent).toContain('not loaded')
    expect(byTestId('updates-load-metamod')?.textContent).toContain('loaded')
    expect(byTestId('updates-demo-wired')?.textContent).toContain('NOT wired')
  })

  it('requires "Interrupt anyway" before a restarting update and then sends force', async () => {
    mockGet.mockResolvedValue(ok(overview()))
    mockPost.mockResolvedValueOnce(ok(job({ forced: true })))
    mountModal()
    await settle()

    await click('updates-start-mods')
    const reasons = byTestId('update-confirm-reasons')?.textContent ?? ''
    expect(reasons).toContain('2 players connected')
    expect(reasons).toContain('MatchZy has a match loaded (gamestate warmup)')
    expect(byTestId('update-confirm-players')?.textContent).toContain('alice, bob')
    expect(byTestId('update-confirm-restart')?.textContent).toContain('CS2 restarts')
    const startBtn = byTestId('update-confirm-start') as HTMLButtonElement
    expect(startBtn.disabled).toBe(true)

    inputOf(byTestId('update-confirm-force')).click()
    await settle()
    expect(startBtn.disabled).toBe(false)
    await click('update-confirm-start')

    expect(mockPost).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/updates', {
      params: { path: { server_id: 'srv-1' } },
      body: { operation: 'mods', force: true },
    })
    expect(byTestId('update-job-phases')?.querySelector('[data-phase="mods-update"]')?.getAttribute('data-state')).toBe(
      'active',
    )
    wrapper?.setProps({ modelValue: false })
  })

  it('re-reads the overview before showing the plan, so consent is to current reasons', async () => {
    const calm = overview({ safety: { humans_connected: 0, players: [], bookings: [], reasons: [], restart_needs_force: false } })
    const busy = overview({
      safety: { humans_connected: 1, players: ['carol'], bookings: [], reasons: ['1 player connected'], restart_needs_force: true },
    })
    mockGet.mockResolvedValueOnce(ok(calm)).mockResolvedValue(ok(busy))
    mountModal()
    await settle()
    expect(mockGet).toHaveBeenCalledTimes(1)

    await click('updates-start-game')

    expect(mockGet).toHaveBeenCalledTimes(2)
    expect(byTestId('update-confirm-reasons')?.textContent).toContain('1 player connected')
    expect(byTestId('update-confirm-players')?.textContent).toContain('carol')
    expect((byTestId('update-confirm-start') as HTMLButtonElement).disabled).toBe(true)
  })

  it('cannot start when the overview could not be re-read', async () => {
    const calm = overview({ safety: { humans_connected: 0, players: [], bookings: [], reasons: [], restart_needs_force: false } })
    mockGet.mockResolvedValueOnce(ok(calm)).mockResolvedValue(failure(500, 'database unavailable'))
    mountModal()
    await settle()

    await click('updates-start-game')

    expect(byTestId('update-confirm-error')?.textContent).toContain('database unavailable')
    expect((byTestId('update-confirm-start') as HTMLButtonElement).disabled).toBe(true)
  })

  it('clears "Interrupt anyway" when the reasons change after a refused start', async () => {
    const first = overview()
    const changed = overview({
      safety: { humans_connected: 5, players: [], bookings: [], reasons: ['5 players connected'], restart_needs_force: true },
    })
    mockGet.mockResolvedValueOnce(ok(first)).mockResolvedValueOnce(ok(first)).mockResolvedValue(ok(changed))
    mockPost.mockResolvedValueOnce(failure(409, 'update job x (mods) is already running on this server'))
    mountModal()
    await settle()

    await click('updates-start-mods')
    inputOf(byTestId('update-confirm-force')).click()
    await settle()
    expect((byTestId('update-confirm-start') as HTMLButtonElement).disabled).toBe(false)
    await click('update-confirm-start')

    expect(byTestId('update-confirm-reasons')?.textContent).toContain('5 players connected')
    expect(inputOf(byTestId('update-confirm-force')).checked).toBe(false)
    expect((byTestId('update-confirm-start') as HTMLButtonElement).disabled).toBe(true)
  })

  it('lgsm does not restart CS2, so it starts without force even with players on', async () => {
    mockGet.mockResolvedValue(ok(overview()))
    mockPost.mockResolvedValueOnce(ok(job({ operation: 'lgsm', phase: 'lgsm-update' })))
    mountModal()
    await settle()

    await click('updates-start-lgsm')
    expect(byTestId('update-confirm-reasons')).toBeNull()
    expect(byTestId('update-confirm-restart')?.textContent).toContain('CS2 keeps running')
    await click('update-confirm-start')

    expect(mockPost.mock.calls[0]?.[1]).toEqual({
      params: { path: { server_id: 'srv-1' } },
      body: { operation: 'lgsm' },
    })
    wrapper?.setProps({ modelValue: false })
  })

  it('shows the 409 detail in the plan dialog and keeps it open', async () => {
    const detail = '`game` restarts CS2 and would interrupt: 1 player connected. Send force: true to go ahead anyway'
    mockGet.mockResolvedValue(ok(overview({ safety: { players: [], bookings: [], reasons: [], restart_needs_force: false } })))
    mockPost.mockResolvedValueOnce(failure(409, detail))
    mountModal()
    await settle()

    await click('updates-start-game')
    await click('update-confirm-start')

    expect(byTestId('update-confirm-error')?.textContent).toContain(detail)
    expect(byTestId('update-confirm')).not.toBeNull()
  })

  it('opens a rolled-back job from the list with its reason and config report', async () => {
    const rolled = job({
      status: 'rolled_back',
      phase: 'rollback',
      failed_phase: 'verify',
      error: 'MatchZy did not load after the update',
      restarted: true,
      finished_at: '2026-11-22T10:02:00Z',
      before: { matchzy: '0.9.3' },
      after: { matchzy: '0.9.3' },
      log_tail: 'MMS: Fatal error\n',
      config_report: {
        cvars_changed: [{ name: 'matchzy_kick_when_no_match_loaded', before: 'false', after: 'true' }],
        cvars_removed: [],
        cvars_added: [],
        files_changed: [],
      },
    })
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith('{job_id}') ? ok(rolled) : ok(overview({ recent_jobs: [rolled] }))),
    )
    mountModal()
    await settle()

    await click('updates-tab-jobs')
    expect(byTestId('updates-job-row')?.textContent).toContain('Rolled back')
    await click('updates-job-row')

    const outcome = byTestId('update-job-outcome')?.textContent ?? ''
    expect(outcome).toContain('rolled back')
    expect(outcome).toContain('Verifying plugins load')
    expect(byTestId('update-job-error')?.textContent).toContain('MatchZy did not load')
    expect(byTestId('update-job-config-report')?.textContent).toContain('matchzy_kick_when_no_match_loaded')
    expect(byTestId('update-job-log')?.textContent).toContain('MMS: Fatal error')
    expect(byTestId('update-job-restarted')?.textContent).toContain('was restarted')
  })

  it('overrides: refuses a portal-owned name locally and shows the server detail on 400', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('matchzy-overrides')
          ? ok({ overrides: { matchzy_kick_when_no_match_loaded: false }, applied: true, pending: false })
          : ok(overview()),
      ),
    )
    mountModal()
    await settle()
    await click('updates-tab-overrides')

    expect(byTestId('overrides-applied')?.textContent).toContain('Applied on the server')
    const names = document.body.querySelectorAll('[data-testid="override-name"]')
    expect(inputOf(names[0] ?? null).value).toBe('matchzy_kick_when_no_match_loaded')

    await click('override-add')
    const rows = document.body.querySelectorAll('[data-testid="override-name"]')
    const input = inputOf(rows[1] ?? null)
    input.value = 'matchzy_demo_upload_url'
    input.dispatchEvent(new Event('input'))
    await settle()
    expect(byTestId('overrides-editor')?.textContent).toContain('managed by the portal')

    await click('overrides-save')
    expect(mockPut).not.toHaveBeenCalled()

    input.value = 'matchzy_minimum_ready_required'
    input.dispatchEvent(new Event('input'))
    await settle()
    mockPut.mockResolvedValueOnce(failure(400, 'override matchzy_minimum_ready_required: value must be a string, number or boolean'))
    await click('overrides-save')

    expect(mockPut).toHaveBeenCalledTimes(1)
    expect(byTestId('overrides-save-error')?.textContent).toContain('value must be a string, number or boolean')
  })

  it('overrides: a save that cannot be delivered now says so', async () => {
    mockGet.mockImplementation((path: string) =>
      Promise.resolve(
        path.endsWith('matchzy-overrides') ? ok({ overrides: {}, applied: null, pending: false }) : ok(overview()),
      ),
    )
    mockPut.mockResolvedValueOnce(
      ok({ overrides: { matchzy_a: '1' }, delivery: 'pending', job_id: null, detail: 'no agent connected' }),
    )
    mountModal()
    await settle()
    await click('updates-tab-overrides')
    await click('override-add')
    const name = inputOf(byTestId('override-name'))
    name.value = 'matchzy_a'
    name.dispatchEvent(new Event('input'))
    const value = inputOf(byTestId('override-value'))
    value.value = '1'
    value.dispatchEvent(new Event('input'))
    await settle()
    await click('overrides-save')

    expect(mockPut.mock.calls[0]?.[1]).toEqual({
      params: { path: { server_id: 'srv-1' } },
      body: { overrides: { matchzy_a: '1' } },
    })
    const delivery = byTestId('overrides-delivery')
    expect(delivery?.getAttribute('data-delivery')).toBe('pending')
    expect(delivery?.textContent).toContain('no agent connected')
    expect(byTestId('overrides-pending')).not.toBeNull()
  })
})
