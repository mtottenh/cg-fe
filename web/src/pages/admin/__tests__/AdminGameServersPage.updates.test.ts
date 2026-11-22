import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
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
import AdminGameServersPage from '@/pages/admin/AdminGameServersPage.vue'
import type { GameServer } from '@/stores/gameServers'
import type { GameServerUpdates } from '@/utils/gameServerUpdates'

/**
 * The server list's update badges: they come from each server's
 * GET /updates, and the row's Repair obeys the modal's rule (no repair
 * while the agent is away or a job is running).
 */

const mockGet = api.GET as unknown as Mock
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
  last_player_count: 0,
  last_status_at: '2026-11-22T12:00:00Z',
  enrollment_open: false,
  created_at: '2026-09-01T00:00:00Z',
  updated_at: '2026-11-22T12:00:00Z',
}

function overview(overrides: Partial<GameServerUpdates> = {}): GameServerUpdates {
  return {
    server_id: 'srv-1',
    agent_connected: true,
    supported: true,
    capabilities: ['lgsm_update'],
    check: {
      checked_at: '2026-11-22T10:00:00Z',
      latest: {},
      update_available: { lgsm: true },
    },
    demo_upload_wired: false,
    reload_pending: false,
    recent_jobs: [],
    safety: { players: [], bookings: [], reasons: [], restart_needs_force: false },
    ...overrides,
  }
}

function answer(o: GameServerUpdates) {
  mockGet.mockImplementation((path: string) =>
    Promise.resolve({
      data: { data: path === '/v1/admin/game-servers' ? [server] : o, meta: { request_id: 't' } },
    }),
  )
}

let wrapper: VueWrapper | null = null

async function mountPage() {
  wrapper = mount(AdminGameServersPage, {
    global: {
      plugins: [createPinia(), vuetify],
      stubs: {
        ServerUpdatesModal: true,
        AppSnackbar: true,
        ConfirmDialogHost: true,
        ServerConsoleModal: true,
        GameServerEditModal: true,
        GameServerEnrollModal: true,
        GameServerBookingsModal: true,
      },
    },
  })
  await flushPromises()
  await flushPromises()
  return wrapper
}

function repairButton(w: VueWrapper): HTMLButtonElement {
  const el = w.find('[data-testid="server-demo-repair"]')
  expect(el.exists()).toBe(true)
  return el.element as HTMLButtonElement
}

describe('AdminGameServersPage update badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
  })

  it('shows the update badge and an enabled Repair when demo upload is not wired', async () => {
    answer(overview())
    const w = await mountPage()

    expect(w.find('[data-testid="server-update-available"]').exists()).toBe(true)
    expect(w.find('[data-testid="server-demo-unwired"]').exists()).toBe(true)
    expect(repairButton(w).disabled).toBe(false)
  })

  it('disables Repair while the agent is offline', async () => {
    answer(overview({ agent_connected: false }))
    const w = await mountPage()

    expect(repairButton(w).disabled).toBe(true)
  })

  it('disables Repair while a job is running', async () => {
    answer(
      overview({
        active_job: {
          id: 'job-1',
          server_id: 'srv-1',
          operation: 'mods',
          status: 'running',
          trigger: 'portal',
          forced: false,
          agent_synthesized: false,
          blocks_allocation: true,
          created_at: '2026-11-22T10:00:00Z',
          updated_at: '2026-11-22T10:00:05Z',
        },
      }),
    )
    const w = await mountPage()

    expect(repairButton(w).disabled).toBe(true)
  })
})
