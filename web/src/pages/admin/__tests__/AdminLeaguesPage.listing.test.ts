import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import { useAuthStore } from '@/stores/auth'
import AdminLeaguesPage from '@/pages/admin/AdminLeaguesPage.vue'

/**
 * Reported from the live site: three leagues existed and only two appeared on
 * the admin Leagues screen.
 *
 * The screen was built from `/v1/users/me/leagues` — your *memberships* —
 * which (a) cannot show a league whose admin never joined it and (b) filtered
 * out any league whose status was not `active`. Both are invisible failures:
 * the page renders normally, just short a row.
 *
 * These tests mount the real page against a mocked API and assert on the rows
 * the table actually receives, so they fail if the page goes back to reading
 * memberships as its source of truth, and they fail if an archived league is
 * dropped on the way to the table.
 */

const vuetify = createVuetify({ components, directives })

const GAME = {
  id: 'game-cs2',
  slug: 'cs2',
  display_name: 'Counter-Strike 2',
  icon_url: null,
}

/** Every league on the site, as `/v1/admin/leagues` reports them. */
const ALL_LEAGUES = [
  {
    id: 'league-active',
    game_id: GAME.id,
    name: 'Active League',
    slug: 'active-league',
    access_type: 'open',
    status: 'active',
    settings: {},
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'league-archived',
    game_id: GAME.id,
    name: 'Archived League',
    slug: 'archived-league',
    access_type: 'open',
    status: 'archived',
    settings: {},
    created_by: 'user-1',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'league-unjoined',
    game_id: GAME.id,
    name: 'Someone Elses League',
    slug: 'someone-elses-league',
    access_type: 'open',
    status: 'active',
    settings: {},
    created_by: 'user-2',
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  },
]

/** The caller is a member of exactly one of them. */
const MY_MEMBERSHIPS = [
  {
    league_id: 'league-active',
    league_name: 'Active League',
    league_slug: 'active-league',
    league_logo_url: null,
    game_id: GAME.id,
    league_status: 'active',
    membership_type: 'admin',
    joined_at: '2026-01-02T00:00:00Z',
  },
]

const mockGet = api.GET as unknown as Mock

let wrapper: VueWrapper | null = null

beforeEach(() => {
  mockGet.mockImplementation((path: string) => {
    switch (path) {
      case '/v1/admin/leagues':
        return Promise.resolve({
          data: {
            data: ALL_LEAGUES,
            pagination: { page: 1, per_page: 100, total_items: 3, total_pages: 1 },
          },
        })
      case '/v1/users/me/leagues':
        return Promise.resolve({ data: MY_MEMBERSHIPS })
      case '/v1/games':
        return Promise.resolve({
          data: {
            data: [GAME],
            pagination: { page: 1, per_page: 100, total_items: 1, total_pages: 1 },
          },
        })
      default:
        return Promise.resolve({ data: { data: [] } })
    }
  })
})

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function mountPage({ siteAdmin }: { siteAdmin: boolean }) {
  const pinia = createPinia()
  setActivePinia(pinia)

  const auth = useAuthStore()
  auth.roles = siteAdmin
    ? [
        {
          id: 'assignment-1',
          role: {
            id: 'role-super',
            name: 'super_admin',
            display_name: 'Super Admin',
            description: null,
            category: 'system',
            priority: 1000,
            color: null,
            is_system: true,
            is_default: false,
            created_at: '2026-01-01T00:00:00Z',
            updated_at: '2026-01-01T00:00:00Z',
          },
          scope_type: null,
          scope_id: null,
          granted_by: null,
          granted_at: '2026-01-01T00:00:00Z',
          expires_at: null,
        },
      ]
    : []

  wrapper = mount(AdminLeaguesPage, {
    global: {
      plugins: [pinia, vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
  })
  await flushPromises()
  return wrapper
}

/** The rows the data table was actually handed. */
function tableRows(w: VueWrapper): Record<string, string>[] {
  return w
    .findAllComponents({ name: 'VDataTable' })
    .flatMap((t) => t.props('items') as Record<string, string>[])
}

describe('AdminLeaguesPage — which leagues the operator can see', () => {
  it('lists every league on the site for a site admin, joined or not', async () => {
    const w = await mountPage({ siteAdmin: true })
    const names = tableRows(w).map((r) => r.league_name)

    expect(names).toContain('Active League')
    expect(names).toContain('Someone Elses League') // never joined
    expect(names).toContain('Archived League') // not `active`
    expect(names).toHaveLength(3)
  })

  it('carries each league’s status through to the row', async () => {
    const w = await mountPage({ siteAdmin: true })
    const byName = new Map(tableRows(w).map((r) => [r.league_name, r]))

    expect(byName.get('Archived League')?.league_status).toBe('archived')
    expect(byName.get('Active League')?.league_status).toBe('active')
  })

  it('keeps the caller’s own role on the leagues they are a member of', async () => {
    const w = await mountPage({ siteAdmin: true })
    const byName = new Map(tableRows(w).map((r) => [r.league_name, r]))

    expect(byName.get('Active League')?.membership_type).toBe('admin')
    expect(byName.get('Active League')?.joined_at).toBe('2026-01-02T00:00:00Z')
    // Not a member — the row is still manageable, it just has no role to show.
    expect(byName.get('Someone Elses League')?.membership_type).toBe('')
  })

  it('falls back to memberships when the admin listing is unavailable', async () => {
    // Web and API deploy separately, so a frontend can be ahead of its API.
    // An empty Leagues screen is the bug this endpoint exists to fix — it
    // must not come back as a deploy-ordering artefact.
    mockGet.mockImplementation((path: string) => {
      if (path === '/v1/admin/leagues') return Promise.reject(new Error('404'))
      if (path === '/v1/users/me/leagues') return Promise.resolve({ data: MY_MEMBERSHIPS })
      if (path === '/v1/games') {
        return Promise.resolve({
          data: {
            data: [GAME],
            pagination: { page: 1, per_page: 100, total_items: 1, total_pages: 1 },
          },
        })
      }
      return Promise.resolve({ data: { data: [] } })
    })

    const w = await mountPage({ siteAdmin: true })

    expect(tableRows(w).map((r) => r.league_name)).toEqual(['Active League'])
  })

  it('does not call the admin listing for a non-admin, and falls back to memberships', async () => {
    const w = await mountPage({ siteAdmin: false })

    expect(mockGet.mock.calls.map((c) => c[0])).not.toContain('/v1/admin/leagues')
    expect(tableRows(w).map((r) => r.league_name)).toEqual(['Active League'])
  })
})
