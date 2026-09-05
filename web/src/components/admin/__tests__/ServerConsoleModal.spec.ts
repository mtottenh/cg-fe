import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import ServerConsoleModal from '@/components/admin/ServerConsoleModal.vue'
import type { GameServer } from '@/stores/gameServers'
import type { ConsoleSnapshot } from '@/stores/serverConsole'

/**
 * The console modal's rendering rules, which no e2e test can reach: the
 * e2e stack has no game-server agent, so the endpoints behind the modal
 * answer 409 there. What this proves:
 *   - an offline agent disables every action and says since when;
 *   - the Players tab joins Steam ids to portal players and greys bots;
 *   - a refused raw command lands in the log with its reason, and the
 *     Refresh button asks for a live snapshot.
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
  agent_version: '0.2.0',
  agent_cert_expires_at: null,
  last_heartbeat_at: '2026-09-05T12:00:00Z',
  last_gamestate: 'none',
  last_map: 'de_mirage',
  last_player_count: 2,
  last_status_at: '2026-09-05T12:00:00Z',
  enrollment_open: false,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-09-05T12:00:00Z',
}

function snapshot(overrides: Partial<ConsoleSnapshot> = {}): ConsoleSnapshot {
  return {
    server_id: 'srv-1',
    server_name: 'eu-west-1',
    server_status: 'available',
    agent: {
      connected: true,
      version: '0.2.0',
      heartbeat_at: '2026-09-05T12:00:00Z',
      rcon_ok: true,
      reports_status: true,
    },
    gamestate: 'none',
    status: {
      hostname: 'CS2 10 Mans #1',
      map: 'de_mirage',
      humans: 2,
      bots: 1,
      max_players: 12,
      players: [
        { userid: 0, name: 'Kyle', steam_id64: null, bot: true, connected_secs: null, ping: 0, loss: 0, state: 'active', player: null },
        { userid: 2, name: 'Player One', steam_id64: '76561197972611406', bot: false, connected_secs: 323, ping: 31, loss: 0, state: 'active', player: { id: 'pl-1', display_name: 'One' } },
        { userid: 3, name: 'Stranger', steam_id64: '76561197960265729', bot: false, connected_secs: 12, ping: 58, loss: 2, state: 'active', player: null },
      ],
    },
    raw_status: 'map     : de_mirage',
    status_at: '2026-09-05T12:00:00Z',
    live: false,
    live_error: null,
    reservation: null,
    holds: [],
    ...overrides,
  }
}

function ok<T>(data: T) {
  return { data: { data, meta: { request_id: 'test' } }, error: undefined }
}

/** Route GET calls by path so the modal's three loads each get an answer. */
function answerGets(snap: ConsoleSnapshot) {
  mockGet.mockImplementation((path: string) => {
    if (path.endsWith('/console')) return Promise.resolve(ok(snap))
    if (path.endsWith('/console/history')) return Promise.resolve(ok([]))
    if (path.endsWith('/maps')) return Promise.resolve(ok([]))
    return Promise.resolve(ok(null))
  })
}

let wrapper: VueWrapper | null = null

function mountModal() {
  wrapper = mount(ServerConsoleModal, {
    props: { modelValue: true, server },
    global: {
      plugins: [vuetify],
      stubs: { RouterLink: { template: '<a><slot /></a>' }, ConfirmDialogHost: true },
    },
    attachTo: document.body,
  })
  return wrapper
}

/** v-dialog teleports its content; query the document, not the wrapper. */
function byTestId(id: string): HTMLElement | null {
  return document.body.querySelector(`[data-testid="${id}"]`)
}

function allByTestId(id: string): HTMLElement[] {
  return Array.from(document.body.querySelectorAll(`[data-testid="${id}"]`))
}

/** Vuetify hands `data-*` to the native input; be indifferent to where it landed. */
function inputOf(id: string): HTMLInputElement {
  const el = byTestId(id)
  if (!el) throw new Error(`no element with data-testid ${id}`)
  return (el.tagName === 'INPUT' ? el : el.querySelector('input')) as HTMLInputElement
}

/** Tabs render their window lazily; click the tab and let it settle. */
async function switchTab(id: string) {
  const tab = byTestId(id)
  if (!tab) throw new Error(`no tab ${id}`)
  tab.click()
  await flushPromises()
  await new Promise((resolve) => setTimeout(resolve, 0))
  await flushPromises()
}

describe('ServerConsoleModal', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockGet.mockReset()
    mockPost.mockReset()
    vi.useFakeTimers({ toFake: ['setInterval', 'clearInterval'] })
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    vi.useRealTimers()
    document.body.innerHTML = ''
  })

  it('reads the stored snapshot first and shows the map, players and agent line', async () => {
    answerGets(snapshot())
    mountModal()
    await flushPromises()

    const snapshotCall = mockGet.mock.calls.find(([path]) => String(path).endsWith('/console'))
    expect(snapshotCall?.[1]).toEqual({ params: { path: { server_id: 'srv-1' }, query: { live: false } } })
    expect(byTestId('console-header')?.textContent).toContain('agent 0.2.0')
    expect(byTestId('console-header')?.textContent).toContain('2 players of 12, 1 bot')
    expect(byTestId('console-rcon')?.textContent).toBe('rcon ok')
    expect(byTestId('console-reservation')?.textContent).toContain('No match loaded')
    expect(byTestId('console-offline')).toBeNull()
    expect((byTestId('action-pause') as HTMLButtonElement).disabled).toBe(false)
  })

  it('with the agent offline every action is disabled and the alert says since when', async () => {
    answerGets(
      snapshot({
        server_status: 'offline',
        agent: { connected: false, version: '0.2.0', heartbeat_at: '2026-09-05T11:00:00Z', rcon_ok: true, reports_status: true },
      }),
    )
    mountModal()
    await flushPromises()

    expect(byTestId('console-offline')?.textContent).toContain('Agent offline since')
    for (const id of ['action-pause', 'action-unpause', 'action-force-start', 'action-end-match', 'action-kick-bots', 'console-refresh']) {
      expect((byTestId(id) as HTMLButtonElement).disabled, id).toBe(true)
    }
    // The stored status still shows, so an admin can see who was on.
    expect(byTestId('console-header')?.textContent).toContain('2 players')
  })

  it('the Players tab joins Steam ids to portal players, greys bots and offers Kick to humans', async () => {
    answerGets(snapshot())
    mountModal()
    await flushPromises()

    await switchTab('console-tab-players')

    const rows = allByTestId('console-player-row')
    expect(rows).toHaveLength(3)
    expect(rows[0]?.textContent).toContain('BOT')
    expect(rows[0]?.classList.contains('text-medium-emphasis')).toBe(true)
    expect(rows[1]?.textContent).toContain('One')
    expect(rows[1]?.textContent).toContain('76561197972611406')
    expect(rows[1]?.textContent).toContain('5:23')
    expect(rows[2]?.textContent).toContain('—')
    expect(allByTestId('player-kick')).toHaveLength(2)
  })

  it('a refused raw command lands in the log with its reason and nothing else changes', async () => {
    answerGets(snapshot())
    mockPost.mockResolvedValueOnce({ data: undefined, error: { status: 400, detail: 'rcon_password is portal-owned' } })
    mountModal()
    await flushPromises()

    await switchTab('console-tab-console')
    const input = inputOf('console-input')
    input.value = 'rcon_password hunter2'
    input.dispatchEvent(new Event('input'))
    await flushPromises()
    ;(byTestId('console-send') as HTMLButtonElement).click()
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/v1/admin/game-servers/{server_id}/command', {
      params: { path: { server_id: 'srv-1' } },
      body: { command: 'rcon_password hunter2' },
    })
    const log = byTestId('console-log')?.textContent ?? ''
    expect(log).toContain('rcon_password hunter2')
    expect(log).toContain('rcon_password is portal-owned')
    expect(byTestId('console-action-error')).toBeNull()
  })

  it('Refresh asks for a live snapshot', async () => {
    answerGets(snapshot())
    mountModal()
    await flushPromises()
    mockGet.mockClear()
    answerGets(snapshot({ live: true }))

    ;(byTestId('console-refresh') as HTMLButtonElement).click()
    await flushPromises()

    const liveCall = mockGet.mock.calls.find(([path]) => String(path).endsWith('/console'))
    expect(liveCall?.[1]).toEqual({ params: { path: { server_id: 'srv-1' }, query: { live: true } } })
  })
})
