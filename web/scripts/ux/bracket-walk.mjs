// Screenshots of the bracket views through a groups-and-playoffs cup:
// fresh groups, groups midway, final group standings, the playoff bracket as
// it fills, and the champion. Runs against the local ux stack
// (scripts/ux-stack.sh up) and doubles as an end-to-end check that the last
// group result seeds the playoffs.
//
//   node scripts/ux/bracket-walk.mjs            # -> scripts/ux/shots/bracket
//   UX_SHOTS=/tmp/before node scripts/ux/bracket-walk.mjs
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { api, adminToken, makePlayer, seed } from './seed-world.mjs'

const WEB = process.env.UX_WEB ?? 'http://localhost:5180'
const SHOTS = process.env.UX_SHOTS ?? 'scripts/ux/shots/bracket'
await mkdir(SHOTS, { recursive: true })

const token = await adminToken()
const world = await seed()
const { data: maps } = await api(`/v1/games/${world.league.game_id}/maps`)
const mapPool = maps.slice(0, 7).map((m) => m.id)
const stamp = Math.random().toString(36).slice(2, 6)

// ---------------------------------------------------------------- the cup
const { data: cup } = await api('/v1/tournaments', {
  token,
  method: 'POST',
  body: {
    game_id: world.league.game_id,
    league_id: world.league.id,
    season_id: world.season.id,
    name: `Groups Cup ${stamp}`,
    slug: `ux-groups-cup-${stamp}`,
    description: 'Two groups of four, top two into single-elimination playoffs.',
    format: 'groups_and_playoffs',
    format_settings: {
      group_count: 2,
      advance_per_group: 2,
      group_format: 'round_robin',
      playoff_format: 'single_elimination',
    },
    map_pool: mapPool,
    participant_type: 'team',
    team_size: 1,
    min_participants: 8,
    max_participants: 8,
    registration_type: 'open',
    scheduling_mode: 'live',
    default_match_format: 'bo1',
  },
})
console.log(`cup ${cup.name}  /tournaments/${cup.slug}`)
await api(`/v1/tournaments/${cup.id}/publish`, { token, method: 'POST' })
await api(`/v1/tournaments/${cup.id}/open-registration`, { token, method: 'POST' })

// ---------------------------------------------------------------- eight teams
const NAMES = [
  ['Signal Loss', 'SIG'], ['Packet Storm', 'PKT'], ['Null Route', 'NUL'], ['Cold Boot', 'CLD'],
  ['Eggs', 'EGG'], ['Mirage Rats', 'RAT'], ['Late Rotate', 'LTE'], ['Save Round', 'SAV'],
]
const sides = []
for (const [name, tag] of NAMES) {
  const captain = await makePlayer(tag.toLowerCase())
  await api(`/v1/leagues/${world.league.id}/join`, { token: captain.token, method: 'POST' })
  const { data: made } = await api(`/v1/league-seasons/${world.season.id}/teams`, {
    token: captain.token,
    method: 'POST',
    body: { name: `${name} ${stamp}`, tag: (tag + stamp.slice(0, 2)).toUpperCase().slice(0, 5) },
  })
  const { data: reg } = await api(`/v1/tournaments/${cup.id}/registrations/team`, {
    token: captain.token,
    method: 'POST',
    body: { team_season_id: made.team_season.id, participant_name: name },
  })
  sides.push({ name, captain, registrationId: reg.id })
}
for (const s of sides) {
  await api(`/v1/tournaments/${cup.id}/registrations/${s.registrationId}/admin-check-in`, {
    token,
    method: 'POST',
  })
}
await api(`/v1/tournaments/${cup.id}/start`, { token, method: 'POST' })
console.log('started')

const captainOf = (registrationId) => sides.find((s) => s.registrationId === registrationId)?.captain
const listMatches = async () =>
  (await api(`/v1/tournaments/${cup.id}/matches?per_page=100`, { token })).data

/** Play a match to a result: claim by one captain, confirm by the other. */
let played = 0
async function complete(match, p1Wins) {
  const p1 = match.participant1_registration_id
  const p2 = match.participant2_registration_id
  if (!p1 || !p2) return false
  await api(`/v1/admin/tournaments/${cup.id}/matches/${match.id}/schedule`, {
    token,
    method: 'POST',
    body: { scheduled_at: new Date(Date.now() - 60_000).toISOString(), reason: 'bracket walk' },
  }).catch(() => {})
  for (const to_status of ['checking_in', 'in_progress']) {
    await api(`/v1/admin/tournaments/${cup.id}/matches/${match.id}/transition`, {
      token,
      method: 'POST',
      body: { to_status, override_reason: 'bracket walk' },
    }).catch((e) => {
      if (!/already|cannot|invalid/i.test(e.message)) console.log(`  ${to_status}:`, e.message.slice(0, 120))
    })
  }
  const winner = p1Wins ? p1 : p2
  const claimer = captainOf(winner)
  const other = captainOf(p1Wins ? p2 : p1)
  const [s1, s2] = p1Wins ? [13, 7 + (played % 6)] : [5 + (played % 8), 13]
  const { data: submitted } = await api(`/v1/matches/${match.id}/result`, {
    token: claimer.token,
    method: 'POST',
    body: {
      claimed_winner_registration_id: winner,
      participant1_score: p1Wins ? 1 : 0,
      participant2_score: p1Wins ? 0 : 1,
      game_results: [{ game_number: 1, map_id: mapPool[played % mapPool.length], participant1_score: s1, participant2_score: s2 }],
    },
  })
  // The submission response nests the claim; be indifferent to where.
  let claimId = submitted?.id ?? submitted?.claim?.id ?? submitted?.result_claim?.id
  if (!claimId) {
    const { data: current } = await api(`/v1/matches/${match.id}/result`, { token: claimer.token })
    claimId = current?.id ?? current?.claim?.id ?? current?.result_claim?.id
  }
  if (!claimId) throw new Error(`no claim id in ${JSON.stringify(submitted).slice(0, 300)}`)
  await api(`/v1/matches/${match.id}/result/${claimId}/confirm`, { token: other.token, method: 'POST' })
  played += 1
  return true
}

// ---------------------------------------------------------------- browser
const browser = await chromium.launch()
async function pageAt(width, height) {
  const ctx = await browser.newContext({ viewport: { width, height } })
  const page = await ctx.newPage()
  await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate((t) => localStorage.setItem('token', t), token)
  return page
}
const desktop = await pageAt(1440, 950)
const phone = await pageAt(390, 844)
const bracketUrl = `${WEB}/tournaments/${cup.slug}?tab=bracket`

async function shoot(page, name, { stage, full = true } = {}) {
  await page.goto(bracketUrl, { waitUntil: 'networkidle' })
  await page.waitForTimeout(800)
  if (stage) {
    const tab = page.getByRole('tab', { name: stage })
    if (await tab.count()) {
      await tab.first().click()
      await page.waitForTimeout(600)
    }
  }
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
  console.log(`  ${name}`)
}

await shoot(desktop, '01-groups-fresh')
await shoot(phone, '01m-groups-fresh')

// Three results in the first group.
let matches = await listMatches()
const groupMatches = matches.filter((m) => m.status !== 'completed')
console.log(`${groupMatches.length} group matches`)
for (const [i, m] of groupMatches.slice(0, 3).entries()) await complete(m, i % 2 === 0)
await shoot(desktop, '02-groups-midway')

// The rest of the groups; the playoff stage seeds itself when they finish.
matches = await listMatches()
for (const [i, m] of matches.filter((m) => m.status !== 'completed').entries()) await complete(m, i % 3 !== 1)
await new Promise((r) => setTimeout(r, 2500))
// Once the groups finish the live stage is the playoffs, so ask for the
// group tab explicitly to capture the final tables.
await shoot(desktop, '03-groups-final', { stage: /group/i })
await shoot(phone, '03m-groups-final', { stage: /group/i })
await shoot(desktop, '04-playoffs-fresh', { stage: /playoff|knockout|final/i })
await shoot(phone, '04m-playoffs-fresh', { stage: /playoff|knockout|final/i })

// Semi-finals.
matches = await listMatches()
const semis = matches.filter((m) => m.status !== 'completed' && m.participant1_registration_id && m.participant2_registration_id)
console.log(`${semis.length} playoff matches ready`)
for (const [i, m] of semis.entries()) await complete(m, i === 0)
await new Promise((r) => setTimeout(r, 1500))
await shoot(desktop, '05-playoffs-final-pending', { stage: /playoff|knockout|final/i })

// The final.
matches = await listMatches()
for (const m of matches.filter((m) => m.status !== 'completed' && m.participant1_registration_id && m.participant2_registration_id)) await complete(m, true)
await new Promise((r) => setTimeout(r, 1500))
await shoot(desktop, '06-champion', { stage: /playoff|knockout|final/i })
await shoot(phone, '06m-champion', { stage: /playoff|knockout|final/i })

await desktop.goto(`${WEB}/tournaments/${cup.slug}?tab=matches`, { waitUntil: 'networkidle' })
await desktop.waitForTimeout(600)
await desktop.screenshot({ path: `${SHOTS}/07-matches-tab.png`, fullPage: true })
console.log('  07-matches-tab')

await browser.close()
console.log(`done: ${SHOTS}/  (cup /tournaments/${cup.slug})`)
