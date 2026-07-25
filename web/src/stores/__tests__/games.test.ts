import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
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

import { api } from '@/api'
import { useGamesStore } from '@/stores/games'

const mockGet = api.GET as unknown as Mock
const mockPost = api.POST as unknown as Mock

function game(id: string, slug: string) {
  return {
    id,
    slug,
    display_name: slug.toUpperCase(),
    short_name: slug,
    description: null,
    icon_url: null,
    team_size_default: 5,
    status: 'active',
    is_featured: false,
    sort_order: 0,
  }
}

/** A successful `PaginatedResponse` envelope: `{data, pagination, meta}`. */
function paginated(data: unknown[], totalItems = data.length) {
  return {
    data: {
      data,
      pagination: {
        page: 1,
        per_page: 100,
        total_items: totalItems,
        total_pages: Math.max(1, Math.ceil(totalItems / 100)),
      },
      meta: { request_id: 'test' },
    },
    error: undefined,
  }
}

/** The API error envelope `unwrapApi` reads: `{ error: { status, detail } }`. */
function failure(status: number, detail: string) {
  return { data: undefined, error: { status, detail } }
}

beforeEach(() => {
  setActivePinia(createPinia())
  vi.clearAllMocks()
})

/**
 * P-122 — the public catalog fetch and the admin-only catalog fetch shared one
 * `error`/`loading` pair.
 *
 * `error` was `computed({ get: () => fetchGamesState.error ?? fetchAllGamesState.error,
 * set: v => { both = v } })`. Only `AdminGamesPage` calls `fetchAllGames`; it is
 * the `include_inactive` catalog and 403s for non-admins by design. Everything
 * else calls `fetchGames`. So the alias leaked in both directions, and both
 * directions are asserted here.
 */
describe('games store — public and admin fetch states are isolated (P-122)', () => {
  it('an admin-only fetchAllGames failure does not surface on the public catalog state', async () => {
    const store = useGamesStore()

    // The public fetch succeeds.
    mockGet.mockResolvedValueOnce(paginated([game('g1', 'cs2')]))
    await store.fetchGames()
    expect(store.games).toHaveLength(1)
    expect(store.fetchGamesState.error).toBeNull()

    // The admin fetch 403s — this is the ordinary case for a non-admin, not an
    // exotic one, which is why it reached the public HomePage alert so easily.
    mockGet.mockResolvedValueOnce(
      failure(403, 'Admin permission required to list inactive games'),
    )
    await expect(store.fetchAllGames()).rejects.toBeDefined()

    expect(store.fetchAllGamesState.error).toContain('Admin permission required')
    // The assertion that fails on the original aliasing: the public surface
    // must not report an admin-only authorization failure.
    expect(store.fetchGamesState.error).toBeNull()
  })

  it('a public catalog failure does not surface in the admin banner', async () => {
    const store = useGamesStore()

    // The reverse direction of the leak, and the one my first pass MISSED: a
    // probe that re-added `fetchGamesState` to the admin aggregate left every
    // other assertion here green, because none of them ever failed the public
    // fetch while reading `adminError`. A test suite that only catches a
    // coupling in one direction reports "isolated" for a store that is not.
    mockGet.mockResolvedValueOnce(failure(500, 'Public catalog exploded'))
    await expect(store.fetchGames()).rejects.toBeDefined()

    expect(store.fetchGamesState.error).toContain('Public catalog exploded')
    expect(store.adminError).toBeNull()
  })

  it('clearing one surface does not discard the other surface\'s unread error', async () => {
    const store = useGamesStore()

    mockGet.mockResolvedValueOnce(failure(403, 'Admin permission required'))
    await expect(store.fetchAllGames()).rejects.toBeDefined()
    expect(store.fetchAllGamesState.error).toBeTruthy()

    // AdminLeaguesPage / AdminTournamentsPage clear the state they own on
    // navigation. Under the old shared setter this wrote null to BOTH, throwing
    // away an admin error the operator had never seen.
    store.fetchGamesState.error = null

    expect(store.fetchAllGamesState.error).toBeTruthy()
  })

  it('the admin aggregate reports a failed write — the old two-state alias could not', async () => {
    const store = useGamesStore()

    // `enableGame` was one of eleven admin actions the old `error` computed did
    // not cover: it aliased only the two FETCH states, so a failed enable left
    // the admin page silent while claiming to aggregate "every games-action
    // state".
    mockPost.mockResolvedValueOnce(failure(500, 'Enable exploded'))
    await expect(store.enableGame('cs2')).rejects.toBeDefined()

    expect(store.adminError).toContain('Enable exploded')
    // ...and it still must not reach the public surface.
    expect(store.fetchGamesState.error).toBeNull()
  })
})

/**
 * P-121 made this reachable. `per_page` on `GET /v1/games` used to be
 * decorative — the handler threaded it into the response metadata and never
 * applied it to the list — so this request always received the whole catalog no
 * matter what it asked for. Making the handler paginate turned the store's
 * `per_page: 100` into a real cap for the first time.
 */
describe('games store — truncation is surfaced, not silent (P-121)', () => {
  let warn: ReturnType<typeof vi.spyOn>

  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
  })
  afterEach(() => {
    warn.mockRestore()
  })

  it('warns when the catalog is larger than the page it received', async () => {
    const store = useGamesStore()

    // 100 returned, 137 exist: the game filters on /tournaments, /leagues and
    // /players are now missing 37 entries, and nothing else would say so.
    mockGet.mockResolvedValueOnce(
      paginated(Array.from({ length: 100 }, (_, i) => game(`g${i}`, `slug${i}`)), 137),
    )
    await store.fetchGames()

    expect(warn).toHaveBeenCalledTimes(1)
    expect(String(warn.mock.calls[0][0])).toContain('returned 100 of 137 games')
  })

  it('stays quiet when the page holds the whole catalog', async () => {
    const store = useGamesStore()

    mockGet.mockResolvedValueOnce(paginated([game('g1', 'cs2'), game('g2', 'aoe4')], 2))
    await store.fetchGames()

    // A warning that fires on the ordinary case is a warning people learn to
    // ignore, which would make the truncation invisible again by other means.
    expect(warn).not.toHaveBeenCalled()
  })
})
