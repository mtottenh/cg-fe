/**
 * Match day: the hour that decides whether people come back.
 *
 *   node scripts/ux/matchday.mjs
 *
 * Builds a real fixture — two captains, two teams, a started tournament, a
 * scheduled match — and then photographs it from BOTH dugouts at each stage:
 * check-in, map veto, and reporting the result.
 *
 * Two sides matter here in a way they did not for the earlier journeys. Almost
 * everything on match day is a negotiation between opponents: one checks in and
 * waits, one bans and the other picks, one reports a score and the other agrees
 * or does not. A screenshot of one side alone hides half of it.
 *
 * The organiser's plumbing runs through the API — scheduling, opening the
 * check-in window, moving the match into play. Every step a CAPTAIN performs is
 * clicked in the browser, because the click is the thing under review.
 *
 * Beware the clock: a veto turn expires in 30 seconds and the server bans for
 * you. That is a real behaviour worth seeing, but it also means the UI steps
 * between the coin flip and the first ban have to be brisk — keep the waits
 * here short, and re-read whose turn it is before assuming yours survived.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { api, makePlayer, adminToken, seed } from './seed-world.mjs'

const WEB = process.env.UX_WEB ?? 'http://localhost:5180'
const SHOTS = new URL('./shots/matchday/', import.meta.url).pathname

const log = []
async function shoot(page, name, note, settle = 2200) {
  await page.waitForTimeout(settle)
  await mkdir(SHOTS, { recursive: true })
  await page.screenshot({ path: `${SHOTS}${name}.png`, fullPage: true })
  log.push({ name, url: page.url().replace(WEB, ''), note })
  console.log(`  ${name.padEnd(24)} ${note}`)
}

async function pageAs(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await ctx.newPage()
  await page.goto(WEB, { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([t, p]) => {
      localStorage.setItem('token', t)
      if (p) localStorage.setItem('player_id', p)
    },
    [who.token, who.playerId ?? ''],
  )
  return { ctx, page }
}

const token = await adminToken()
const world = await seed()

// ── A tournament of its own, so repeated runs never fight over one bracket ──
const stamp = Math.random().toString(36).slice(2, 7)
const { data: maps } = await api(`/v1/games/${world.league.game_id}/maps`)
const { data: cup } = await api('/v1/tournaments', {
  token,
  method: 'POST',
  body: {
    game_id: world.league.game_id,
    league_id: world.league.id,
    season_id: world.season.id,
    name: `Match Day Cup ${stamp}`,
    slug: `ux-matchday-${stamp}`,
    description: 'Fixture for the match-day walk.',
    format: 'single_elimination',
    map_pool: maps.slice(0, 7).map((m) => m.id),
    participant_type: 'team',
    team_size: 5,
    min_participants: 2,
    max_participants: 4,
    registration_type: 'open',
    scheduling_mode: 'live',
    default_match_format: 'bo3',
    check_in_required: true,
    // Without this the tournament runs its matches with NO map veto at all:
    // the flag that gates the veto is set by creating a session, and nothing
    // creates one unless a format is configured here. The form leaves this
    // blank by default.
    default_map_veto_format: 'bo3_veto',
  },
})
await api(`/v1/tournaments/${cup.id}/publish`, { token, method: 'POST' })
await api(`/v1/tournaments/${cup.id}/open-registration`, { token, method: 'POST' })

// ── Two captains, two teams, both entered ───────────────────────────────────
const sides = []
for (const [name, tag] of [
  ['Signal Loss', 'SIG'],
  ['Packet Storm', 'PKT'],
]) {
  const captain = await makePlayer(tag.toLowerCase())
  await api(`/v1/leagues/${world.league.id}/join`, { token: captain.token, method: 'POST' })
  const { data: made } = await api(`/v1/league-seasons/${world.season.id}/teams`, {
    token: captain.token,
    method: 'POST',
    body: { name: `${name} ${stamp}`, tag: tag + stamp.slice(0, 2).toUpperCase() },
  })
  // A five-a-side cup refuses a roster smaller than five (the review's
  // thin-roster finding), so field a full team: four more league members
  // added by the captain.
  for (let i = 0; i < 4; i++) {
    const mate = await makePlayer(`${tag.toLowerCase()}${i}`)
    await api(`/v1/leagues/${world.league.id}/join`, { token: mate.token, method: 'POST' })
    await api(`/v1/league-team-seasons/${made.team_season.id}/members`, {
      token: captain.token,
      method: 'POST',
      body: { player_id: mate.playerId },
    })
  }
  const { data: reg } = await api(`/v1/tournaments/${cup.id}/registrations/team`, {
    token: captain.token,
    method: 'POST',
    body: { team_season_id: made.team_season.id, participant_name: `${name} ${stamp}` },
  })
  sides.push({ captain, team: made.team, registrationId: reg.id, name })
}

// Check-in is required to enter the bracket, so the organiser confirms both
// entries before starting. This is the TOURNAMENT-level check-in — a different
// thing from the match-level one the captains do below, and one of the reasons
// this journey is confusing.
for (const s of sides) {
  await api(`/v1/tournaments/${cup.id}/registrations/${s.registrationId}/admin-check-in`, {
    token,
    method: 'POST',
  }).catch((e) => console.log(`  tournament check-in ${s.name}:`, e.message.slice(0, 140)))
}
await api(`/v1/tournaments/${cup.id}/start`, { token, method: 'POST' })

const { data: matches } = await api(`/v1/tournaments/${cup.id}/matches`)
const match = matches.find((m) => m.participant1_registration_id && m.participant2_registration_id)
if (!match) throw new Error('bracket generated no fully-populated match')

// Whoever the bracket put in slot one leads the veto below.
const first = sides.find((s) => s.registrationId === match.participant1_registration_id) ?? sides[0]
const second = sides.find((s) => s.registrationId === match.participant2_registration_id) ?? sides[1]
const matchPath = `/tournaments/${cup.slug}/matches/${match.id}`
console.log(`\nmatch ${match.id}\n  ${first.name} vs ${second.name}\n`)

const browser = await chromium.launch()
const A = await pageAs(browser, first.captain)
const B = await pageAs(browser, second.captain)
const goBoth = async (path) => {
  await A.page.goto(WEB + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
  await B.page.goto(WEB + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
}

console.log('check-in')
await goBoth(matchPath)
await shoot(A.page, '01-before-checkin', 'the match, before the window opens')

// A generated match sits in `ready`; the check-in endpoint only answers while
// it is `checking_in`, and only an organiser can move it there.
await api(`/v1/admin/tournaments/${cup.id}/matches/${match.id}/schedule`, {
  token,
  method: 'POST',
  body: {
    scheduled_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    reason: 'UX walk: give the match a time',
  },
}).catch((e) => console.log('  schedule:', e.message.slice(0, 100)))
await api(`/v1/admin/tournaments/${cup.id}/matches/${match.id}/transition`, {
  token,
  method: 'POST',
  body: { to_status: 'checking_in', override_reason: 'UX walk: open the check-in window' },
}).catch((e) => console.log('  transition:', e.message.slice(0, 100)))

await goBoth(matchPath)
await shoot(A.page, '02-checkin-open', 'check-in window open — what is asked of them?')

// The background lifecycle pass creates, starts and coin-flips the veto at the
// moment it opens the check-in window — 15 minutes before kick-off, before
// either captain has checked in. Reproduce that order exactly; doing it later
// would flatter the product.
await api(`/v1/matches/${match.id}/veto`, {
  token,
  method: 'POST',
  body: { veto_format_id: 'bo3_veto' },
}).catch((e) => console.log('  veto session:', e.message.slice(0, 140)))

const clickCheckIn = async (p) => {
  const b = p.getByRole('button', { name: /check.?in/i }).first()
  if (!(await b.isVisible().catch(() => false))) return false
  await b.click()
  return true
}
await A.page.reload({ waitUntil: 'domcontentloaded' })
await A.page.waitForTimeout(2200)
if (await clickCheckIn(A.page)) {
  await shoot(A.page, '03-checked-in-one-side', 'one side in — is the other side\u2019s state visible?')
} else {
  console.log('  (no check-in control offered to the captain)')
}
await B.page.reload({ waitUntil: 'domcontentloaded' })
await shoot(B.page, '04-opponent-waiting', 'the opponent, who has not checked in')
await clickCheckIn(B.page)
await shoot(B.page, '05-both-checked-in', 'both in — the match moves itself into pick/ban')

console.log('veto')
await goBoth(matchPath)
await shoot(A.page, '06-veto-created', 'a veto exists but has not started')

await api(`/v1/matches/${match.id}/veto/start`, { token, method: 'POST' }).catch((e) =>
  console.log('  start:', e.message.slice(0, 100)),
)
await api(`/v1/matches/${match.id}/veto/coin-flip`, {
  token,
  method: 'POST',
  body: { winner_registration_id: first.registrationId, winner_goes_first: true },
}).catch((e) => console.log('  coin flip:', e.message.slice(0, 100)))

// From here the 30-second turn clock is running: brisk waits, and no clicking
// on a turn that has already moved on.
await A.page.reload({ waitUntil: 'domcontentloaded' })
await shoot(A.page, '07-veto-my-turn', 'the captain on the clock', 1400)

// A map tile is a v-card with a click handler, not a button \u2014 `getByRole`
// finds nothing here, which is a finding in itself. Selecting only ARMS the
// action; a second, explicit control commits it.
const tile = A.page.locator('.map-card-selectable').first()
if (await tile.isVisible().catch(() => false)) {
  await tile.click()
  await shoot(A.page, '08-veto-armed', 'tapped a map — the confirm step', 900)
  const confirm = A.page.locator('[data-testid="veto-confirm-action"]')
  if (await confirm.isVisible().catch(() => false)) {
    await confirm.click()
    await shoot(A.page, '09-veto-after-ban', 'the ban lands — what changed?', 1600)
  }
} else {
  console.log('  (no selectable map tile found on the acting side)')
}
await B.page.reload({ waitUntil: 'domcontentloaded' })
await shoot(B.page, '10-veto-turn-passed', 'the turn arriving at the other side', 1400)

// Play the rest out through the API so the walk reaches the result stage. The
// server auto-bans on timeout, so read whose turn it is each time rather than
// alternating blindly.
const tokenFor = (regId) =>
  regId === first.registrationId ? first.captain.token : second.captain.token
for (let i = 0; i < 8; i++) {
  const { data: v } = await api(`/v1/matches/${match.id}/veto`, { token })
  if (v.session.status !== 'in_progress') break
  const turn = v.session.current_team_turn
  const pick = v.maps.find((m) => m.status === 'available')
  if (!turn || !pick) break
  await api(`/v1/matches/${match.id}/veto/action`, {
    token: tokenFor(turn),
    method: 'POST',
    body: { map_id: pick.map_id },
  }).catch((e) => console.log('  veto action:', e.message.slice(0, 110)))
}
await goBoth(matchPath)
await shoot(A.page, '11-veto-complete', 'veto done — are the maps and the order clear?')

console.log('result')
await api(`/v1/admin/tournaments/${cup.id}/matches/${match.id}/transition`, {
  token,
  method: 'POST',
  body: { to_status: 'in_progress', override_reason: 'UX walk: the match is being played' },
}).catch((e) => console.log('  to in_progress:', e.message.slice(0, 140)))

await goBoth(matchPath)
await shoot(A.page, '12-in-progress', 'the match is live — how is a score reported?')

// Fill the series in as a captain would: two games to one. On a Bo3 that
// reaches a decider this is the ordinary case — and the one the form refuses.
const scores = A.page.locator('input[aria-label*="score, game"]')
const n = await scores.count()
console.log(`  ${n} score inputs on the form`)
const fill = async (pairs) => {
  for (const [i, val] of pairs) await scores.nth(i).fill(val).catch(() => {})
  await A.page.waitForTimeout(400)
}
const submit = A.page.getByRole('button', { name: /submit result/i }).first()
const submitState = async () =>
  (await submit.isVisible().catch(() => false))
    ? ((await submit.isDisabled().catch(() => false)) ? 'DISABLED' : 'enabled')
    : 'absent'

await fill([[0, '13'], [1, '9'], [2, '7'], [3, '13'], [4, '13'], [5, '11']])
console.log(`  2-1 (decider played): Submit Result is ${await submitState()}`)
await shoot(A.page, '13-result-2-1-blocked', 'a 2-1 series — can the winner report it?')

// Take the decider back out — a clean 2-0 — and the same form is submittable.
await fill([[2, '13'], [3, '8'], [4, '0'], [5, '0']])
console.log(`  2-0 (no decider):      Submit Result is ${await submitState()}`)
await shoot(A.page, '14-result-2-0', 'the same form, without the third map')

if ((await submitState()) === 'enabled') await submit.click()
await shoot(A.page, '15-result-submitted', 'the reporter — did the submission take?')

// The UI submission does not survive the server's validation (it sends a row
// for the map that was never played). Fall back to a correct payload so the
// walk can still photograph the half of the journey that lives past it — and
// say plainly that it had to.
const landed = await api(`/v1/matches/${match.id}/result`, { token }).catch(() => null)
if (!landed) {
  console.log('  !! the UI submission did not land; submitting via the API to continue')
  await api(`/v1/matches/${match.id}/result`, {
    token: first.captain.token,
    method: 'POST',
    body: {
      claimed_winner_registration_id: first.registrationId,
      participant1_score: 2,
      participant2_score: 0,
      game_results: [
        { game_number: 1, map_id: 'de_inferno', participant1_score: 13, participant2_score: 9 },
        { game_number: 2, map_id: 'de_nuke', participant1_score: 13, participant2_score: 8 },
      ],
    },
  }).catch((e) => console.log('  api submit:', e.message.slice(0, 200)))
  await A.page.reload({ waitUntil: 'domcontentloaded' })
  await shoot(A.page, '15b-result-accepted', 'the same result, accepted — the reporter waits')
}

await B.page.reload({ waitUntil: 'domcontentloaded' })
await shoot(B.page, '16-result-to-confirm', 'the opponent: confirm, or dispute?')

const dispute = B.page.getByRole('button', { name: /dispute/i }).first()
if (await dispute.isVisible().catch(() => false)) {
  await dispute.click()
  await shoot(B.page, '17-dispute', 'disagreeing with a reported score')
} else {
  console.log('  (no Dispute control offered to the opponent)')
}

await browser.close()
console.log(`\n${log.length} screens in scripts/ux/shots/matchday/.`)
