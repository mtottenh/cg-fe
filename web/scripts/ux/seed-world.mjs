/**
 * Put enough of a world into the UX stack that the screens have something to
 * say. An empty database photographs as a row of empty states, which tells you
 * nothing about how the product reads when it is in use.
 *
 *   node scripts/ux/seed-world.mjs
 *
 * Idempotent: run it as often as you like. Re-running after a partial failure
 * is the normal case, and every step either finds what it needs or makes it.
 *
 * What it builds, and why each piece is here:
 *   - a league with TWO seasons, one open and one draft — the pair that exposes
 *     how the season selector chooses
 *   - three teams, each owned by a DIFFERENT player, because a player may
 *     captain only one team per season
 *   - a published tournament with registration open, so the join path is live
 */
const API = process.env.UX_API ?? 'http://localhost:3007'
const ADMIN = {
  username_or_email: process.env.UX_ADMIN_EMAIL ?? 'admin@example.com',
  password: process.env.UX_ADMIN_PASSWORD ?? 'E2eAdmin!2345',
}

export async function api(path, { token, method = 'GET', body } = {}) {
  const res = await fetch(API + path, {
    method,
    headers: {
      ...(body ? { 'Content-Type': 'application/json' } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  })
  const text = await res.text()
  if (!res.ok) throw new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 240)}`)
  return text ? JSON.parse(text) : null
}

/** A brand-new account. Display names are unique, so never hard-code one. */
export async function makePlayer(prefix = 'p') {
  const id = `${prefix}${Math.random().toString(36).slice(2, 7)}`
  const { data } = await api('/v1/auth/register', {
    method: 'POST',
    body: {
      username: id.slice(0, 30),
      email: `${id}@example.com`,
      password: 'Player!2345',
      display_name: `Player ${id}`,
    },
  })
  return { token: data.access_token, playerId: data.player.id, name: `Player ${id}` }
}

export async function adminToken() {
  const { data } = await api('/v1/auth/login', { method: 'POST', body: ADMIN })
  return data.access_token
}

export async function seed() {
  const token = await adminToken()

  const { data: games } = await api('/v1/games?per_page=10')
  const cs2 = games.find((g) => g.slug === 'cs2') ?? games[0]

  // Map ids are validated against the game's configured pool, so read it
  // rather than guessing — the pool has changed before (no de_overpass).
  const { data: maps } = await api(`/v1/games/${cs2.id}/maps`)
  const mapPool = maps.slice(0, 7).map((m) => m.id)

  const league =
    (await api('/v1/leagues/by-slug/ux-winter-league').catch(() => null))?.data ??
    (
      await api('/v1/leagues', {
        token,
        method: 'POST',
        body: {
          game_id: cs2.id,
          name: 'UX Winter League',
          slug: 'ux-winter-league',
          description: 'Five-a-side. Two seasons a year, playoffs at the end of each.',
          access_type: 'open',
        },
      })
    ).data

  // Creating a league fires a trigger that makes its first season.
  //
  // Pin it by slug, never by position: the listing is newest-created-first, so
  // `seasons[0]` means "Season 1" on the first run and "Next Season" on the
  // second. That drift attached a tournament to a different season than the
  // teams on the first pass of this tooling, and the resulting "No Eligible
  // Teams" looked exactly like a product bug.
  const { data: seasons } = await api(`/v1/league-seasons?league_id=${league.id}`)
  const season =
    seasons.find((s) => s.slug !== 'ux-next-season') ??
    seasons[seasons.length - 1]
  if (!seasons.some((s) => s.slug === 'ux-next-season')) {
    await api('/v1/league-seasons', {
      token,
      method: 'POST',
      body: {
        league_id: league.id,
        name: 'Next Season',
        slug: 'ux-next-season',
        description: 'Being prepared — deliberately left in draft.',
      },
    })
  }

  for (const [name, tag] of [
    ['Hexadecimal Heroes', 'HEX'],
    ['Null Pointers', 'NULL'],
    ['Rage Quit', 'RQ'],
  ]) {
    const captain = await makePlayer(tag.toLowerCase())
    await api(`/v1/leagues/${league.id}/join`, { token: captain.token, method: 'POST' })
    await api(`/v1/league-seasons/${season.id}/teams`, {
      token: captain.token,
      method: 'POST',
      body: { name, tag },
    }).catch((e) => console.log(`  team ${tag}: ${e.message.slice(0, 120)}`))
  }

  const tournament =
    (await api('/v1/tournaments/by-slug/ux-autumn-cup').catch(() => null))?.data ??
    (
      await api('/v1/tournaments', {
        token,
        method: 'POST',
        body: {
          game_id: cs2.id,
          league_id: league.id,
          season_id: season.id,
          name: 'Autumn Cup',
          slug: 'ux-autumn-cup',
          description: 'Single elimination, best of three.',
          format: 'single_elimination',
          map_pool: mapPool,
          participant_type: 'team',
          team_size: 5,
          min_participants: 2,
          max_participants: 8,
          registration_type: 'open',
          scheduling_mode: 'live',
          default_match_format: 'bo3',
        },
      })
    ).data

  // Both are no-ops once the tournament has moved past them.
  await api(`/v1/tournaments/${tournament.id}/publish`, { token, method: 'POST' }).catch(() => {})
  await api(`/v1/tournaments/${tournament.id}/open-registration`, { token, method: 'POST' }).catch(() => {})

  return { league, season, tournament }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { league, season, tournament } = await seed()
  console.log(`league      ${league.name}  /leagues/${league.id}`)
  console.log(`season      ${season.name} (a second, draft season also exists)`)
  console.log(`tournament  ${tournament.name}  /tournaments/${tournament.slug}`)
}
