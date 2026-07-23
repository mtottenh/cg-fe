import { describe, expect, it } from 'vitest'
import generatedApiTypes from '../../api/types.ts?raw'

/**
 * Store sources as text. `import.meta.glob` rather than `node:fs` because
 * `tsconfig.app.json` deliberately excludes the node types from `src/`.
 */
const storeSources = import.meta.glob('../**/*.ts', {
  query: '?raw',
  import: 'default',
  eager: true,
}) as Record<string, string>

/**
 * ── Guard for the pagination-blindness defect class ──────────────────────────
 *
 * The bug, four times over (P-4x sweep): a store fetches a collection with NO
 * pagination parameters, so the API applies its default `per_page` (20) and
 * silently truncates. The page then filters or searches the twenty rows it
 * happens to hold, and everything past row 20 is invisible — with no pager to
 * reach it either. `/tournaments` search (P-28) and the `/admin/result-reviews`
 * queue (P-43) were both this.
 *
 * This test makes the omission fail loudly at `npm run test:run`:
 *
 *   For every `api.GET('/v1/…')` in `src/stores/**`, if the GENERATED OpenAPI
 *   types say the endpoint accepts `per_page`, the call must either pass a
 *   pagination parameter or appear in `PAGINATION_EXEMPT` with a reason.
 *
 * The two inputs are both facts, not opinions: the call sites come from the
 * store sources and the "is it paginated" answer comes from `src/api/types.ts`,
 * which is regenerated from the live spec. An endpoint that gains pagination
 * server-side starts failing this test the next time the types are regenerated.
 *
 * WHAT IT DELIBERATELY DOES NOT DO:
 *
 *  - It does not check that the *page* renders a pager. Passing `per_page` is
 *    necessary, not sufficient. It catches the specific, mechanical mistake that
 *    produced all four instances.
 *  - It does not police the `limit`/`offset` endpoints (`/v1/demos`,
 *    `/v1/users/me/matches`, the leaderboards). Those were triaged by hand in
 *    the same sweep and are all sound: `AdminDemosPage` pages with
 *    `limit`/`offset`, `MatchHistoryList` asks for `limit: 10`, and a
 *    leaderboard is a top-N by definition. Encoding them here needed an
 *    exemption list longer than the rule, which would be noise, not a guard.
 */

/**
 * THE RULE: the request's own query object must name `per_page` (or
 * `page_size`). Accepting pagination through the store function's SIGNATURE and
 * forwarding it is not enough — `fetchRegistrations(id, filters?)` does exactly
 * that and every one of its three callers omits the filters, so every
 * registrations list in the app is capped at 20. A default at the store
 * boundary (`per_page: filters?.per_page ?? 20`, as `players.ts` does) is what
 * makes the truncation deliberate.
 */

/**
 * Endpoints that accept `per_page` but are knowingly fetched without one.
 *
 * Each entry needs a reason that answers "why can this list never grow past a
 * page?". "It is small today" is not a reason on its own — say what bounds it.
 */
const PAGINATION_EXEMPT: Record<string, string> = {
  // (empty — every paginated collection fetched by a store either passes
  // per_page or is recorded in KNOWN_BLIND below)
}

/**
 * Instances of the defect that are recorded but NOT fixed here, because these
 * files are owned elsewhere. The test asserts the offender set equals this list
 * exactly, so a new instance fails and a fixed one fails too (delete the entry).
 */
const KNOWN_BLIND: Record<string, string> = {
  '/v1/tournaments':
    'stores/tournament/_lifecycle.ts — pass-through; both page callers do pass ' +
    'per_page today, so this is a latent trap rather than a live bug. Needs a ' +
    'default at the store boundary.',
  '/v1/tournaments/{tournament_id}/registrations':
    'stores/tournament/_registrations.ts — LIVE BUG. No caller passes ' +
    'per_page, so a tournament with more than 20 registrations shows only 20 ' +
    'participants, and useMatchDetail.ts:298 cannot resolve the registration id ' +
    'of a player past row 20 (result submission breaks for them).',
}

/** path → the operation id of its GET, straight out of the generated types. */
function readGetOperations(types: string): Map<string, string> {
  const byPath = new Map<string, string>()
  const pathBlock = /\n {4}"(\/v1\/[^"]*)": \{\n([\s\S]*?)\n {4}\};/g
  let match: RegExpExecArray | null
  while ((match = pathBlock.exec(types)) !== null) {
    const get = /\n {8}get: operations\["([a-z0-9_]+)"\]/.exec(match[2]!)
    if (get) byPath.set(match[1]!, get[1]!)
  }
  return byPath
}

/** operation id → whether its query object declares `per_page`. */
function readPaginatedOperations(types: string): Set<string> {
  const paginated = new Set<string>()
  const opBlock =
    /\n {4}([a-z0-9_]+): \{\n {8}parameters: \{\n {12}query\??: (\{[\s\S]*?\n {12}\}|never);/g
  let match: RegExpExecArray | null
  while ((match = opBlock.exec(types)) !== null) {
    if (/per_page\??:/.test(match[2]!)) paginated.add(match[1]!)
  }
  return paginated
}

interface CallSite {
  file: string
  line: number
  path: string
  paginated: boolean
}

function collectGetCallSites(): CallSite[] {
  const getOperations = readGetOperations(generatedApiTypes)
  const paginatedOperations = readPaginatedOperations(generatedApiTypes)

  const sites: CallSite[] = []
  for (const [globKey, source] of Object.entries(storeSources)) {
    if (globKey.includes('__tests__')) continue
    const file = `stores/${globKey.replace(/^\.\.\//, '')}`
    const lines = source.split('\n')
    lines.forEach((line, index) => {
      const call = /api\.GET\('(\/v1\/[^']+)'/.exec(line)
      if (!call) return
      const path = call[1]!
      const operation = getOperations.get(path)
      // The whole call expression: `api.GET(path, { params: { query: {…} } })`
      // spans a handful of lines. 16 comfortably covers the widest one today
      // (`/v1/demos`, 13 lines of query fields).
      const callText = lines.slice(index, index + 16).join('\n')
      sites.push({
        file,
        line: index + 1,
        path,
        paginated:
          operation !== undefined &&
          paginatedOperations.has(operation) &&
          !/per_page|page_size/.test(callText),
      })
    })
  }
  return sites
}

describe('store collection fetches are pagination-aware', () => {
  const sites = collectGetCallSites()

  it('finds the store call sites at all', () => {
    // Without this, a broken scanner would report "no offenders" forever.
    expect(sites.length).toBeGreaterThan(50)
    expect(sites.map((s) => s.path)).toContain('/v1/tournaments')
  })

  it('recognises pagination in the generated types', () => {
    // Anchor on the two endpoints this guard was written for. If the types are
    // regenerated into a shape the parser cannot read, these go empty and the
    // guard would silently pass everything.
    const paginated = readPaginatedOperations(generatedApiTypes)
    const byPath = readGetOperations(generatedApiTypes)
    expect(paginated.has(byPath.get('/v1/tournaments')!)).toBe(true)
    expect(paginated.has(byPath.get('/v1/admin/result-reviews')!)).toBe(true)
  })

  it('passes an explicit per_page to every paginated collection', () => {
    const offending = sites.filter(
      (s) => s.paginated && PAGINATION_EXEMPT[s.path] === undefined,
    )
    const offendingPaths = [...new Set(offending.map((s) => s.path))].sort()
    const where = offending.map((s) => `${s.file}:${s.line} → ${s.path}`).join('\n')

    expect(
      offendingPaths,
      'These fetches take the API default per_page (20) and silently truncate:\n' +
        `${where}\n` +
        'Pass an explicit page/per_page and give the UI a pager, add the path to ' +
        'PAGINATION_EXEMPT with a reason it cannot grow, or — if you are recording ' +
        'a defect you are not fixing — to KNOWN_BLIND.',
    ).toEqual(Object.keys(KNOWN_BLIND).sort())
  })

  it('keeps the exemption lists free of stale entries', () => {
    const stillBlind = new Set(sites.filter((s) => s.paginated).map((s) => s.path))
    const stale = [...Object.keys(PAGINATION_EXEMPT), ...Object.keys(KNOWN_BLIND)].filter(
      (p) => !stillBlind.has(p),
    )
    expect(stale, 'listed paths that no longer need the entry — delete them').toEqual([])
  })
})
