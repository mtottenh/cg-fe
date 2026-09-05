// Match organisation, from both dugouts and the organiser's desk.
//
// Builds a four-team self-scheduled cup and photographs: a captain proposing a
// time and the opponent accepting it; the organiser's tournament Matches tab,
// admin Matches tab and match modal (overview, results, evidence, actions); a
// captain forfeiting; a disputed result in the admin dispute queue and its
// resolution. Runs against the local ux stack (scripts/ux-stack.sh up).
//
//   node scripts/ux/matchorg.mjs            # -> scripts/ux/shots/matchorg
//   UX_SHOTS=/tmp/before node scripts/ux/matchorg.mjs
import { mkdir, writeFile } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { api, adminToken, makePlayer, seed } from './seed-world.mjs'

const WEB = process.env.UX_WEB ?? 'http://localhost:5180'
const SHOTS = process.env.UX_SHOTS ?? 'scripts/ux/shots/matchorg'
await mkdir(SHOTS, { recursive: true })

const log = []
async function shoot(page, name, note, { settle = 1400, full = true } = {}) {
  await page.waitForTimeout(settle)
  await page.screenshot({ path: `${SHOTS}/${name}.png`, fullPage: full })
  log.push({ name, url: page.url().replace(WEB, ''), note })
  console.log(`  ${name.padEnd(28)} ${note}`)
}

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
    name: `Organiser Cup ${stamp}`,
    slug: `ux-org-cup-${stamp}`,
    description: 'Four teams, captains agree their own match times.',
    format: 'single_elimination',
    map_pool: mapPool,
    participant_type: 'team',
    team_size: 1,
    min_participants: 4,
    max_participants: 4,
    registration_type: 'open',
    scheduling_mode: 'self_scheduled',
    default_match_format: 'bo1',
    check_in_required: true,
  },
})
console.log(`cup ${cup.name}  /tournaments/${cup.slug}`)
await api(`/v1/tournaments/${cup.id}/publish`, { token, method: 'POST' })
await api(`/v1/tournaments/${cup.id}/open-registration`, { token, method: 'POST' })

const NAMES = [['Signal Loss', 'SIG'], ['Packet Storm', 'PKT'], ['Null Route', 'NUL'], ['Cold Boot', 'CLD']]
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
  await api(`/v1/tournaments/${cup.id}/registrations/${s.registrationId}/admin-check-in`, { token, method: 'POST' })
}
await api(`/v1/tournaments/${cup.id}/start`, { token, method: 'POST' })
const { data: matches } = await api(`/v1/tournaments/${cup.id}/matches?per_page=50`, { token })
const round1 = matches.filter((m) => m.round === 1).sort((a, b) => a.match_number - b.match_number)
const [m1, m2] = round1
const captainOf = (regId) => sides.find((s) => s.registrationId === regId)?.captain
const matchUrl = (m) => `${WEB}/tournaments/${cup.slug}/matches/${m.id}`
console.log(`started: ${round1.length} first-round matches`)

// ---------------------------------------------------------------- browser
const browser = await chromium.launch()
async function pageAs(who, viewport = { width: 1440, height: 950 }) {
  const ctx = await browser.newContext({ viewport })
  const page = await ctx.newPage()
  await page.goto(WEB + '/', { waitUntil: 'domcontentloaded' })
  await page.evaluate(
    ([t, p]) => {
      localStorage.setItem('token', t)
      if (p) localStorage.setItem('player_id', p)
    },
    [who.token, who.playerId ?? ''],
  )
  return page
}
const go = (page, url) => page.goto(url, { waitUntil: 'networkidle' })

const capA = captainOf(m1.participant1_registration_id)
const capB = captainOf(m1.participant2_registration_id)
const capC = captainOf(m2.participant1_registration_id)
const capD = captainOf(m2.participant2_registration_id)
const A = await pageAs(capA)
const B = await pageAs(capB)
const ORG = await pageAs({ token })
const phone = await pageAs(capB, { width: 390, height: 844 })
const orgPhone = await pageAs({ token }, { width: 390, height: 844 })

// ---------------------------------------------------------------- organiser: where are my matches?
console.log('organiser overview')
await go(ORG, `${WEB}/tournaments/${cup.slug}?tab=matches`)
await shoot(ORG, '01-org-tournament-matches', 'the tournament page Matches tab, as the organiser')

// ---------------------------------------------------------------- scheduling negotiation
console.log('scheduling')
await go(A, matchUrl(m1))
await shoot(A, '02-captain-schedule-panel', 'a self-scheduled match, nothing proposed yet — what is asked of the captain?')

const manual = A.getByRole('button', { name: /manual/i })
if (await manual.count()) await manual.first().click()
const when = new Date(Date.now() + 2 * 24 * 3600 * 1000)
when.setHours(20, 0, 0, 0)
const local = `${when.getFullYear()}-${String(when.getMonth() + 1).padStart(2, '0')}-${String(when.getDate()).padStart(2, '0')}T20:00`
const timeInput = A.locator('input[type="datetime-local"]').first()
await timeInput.waitFor({ timeout: 8000 })
await timeInput.fill(local)
await A.getByLabel(/notes/i).first().fill('Sunday evening works for us; can do 21:00 too.').catch(() => {})
await A.getByRole('button', { name: /send proposal/i }).click()
await shoot(A, '03-captain-proposed', 'the proposal sent — can the captain tell it went, and withdraw it?')

await go(B, matchUrl(m1))
await shoot(B, '04-opponent-proposal', 'the opponent: accept, counter, or reject?')
await go(phone, matchUrl(m1))
await shoot(phone, '04m-opponent-proposal', 'the same, on a phone')

// Accept stays disabled until a time is picked — even when only one was offered.
const option = B.getByRole('radio').first()
if (await option.count()) await option.check({ force: true })
await B.getByRole('button', { name: /^accept$/i }).first().click()
await shoot(B, '05-opponent-accepted', 'accepted — is the agreed time now the headline?')
await go(A, matchUrl(m1))
await shoot(A, '06-captain-scheduled', 'the proposer sees the agreed time')

// ---------------------------------------------------------------- organiser: the admin desk
console.log('admin desk')
await go(ORG, `${WEB}/admin/tournaments/${cup.id}?tab=matches`)
await shoot(ORG, '07-admin-matches', 'admin › tournament › Matches: the organiser’s list')
await go(orgPhone, `${WEB}/admin/tournaments/${cup.id}?tab=matches`)
await shoot(orgPhone, '07m-admin-matches', 'the admin matches list on a phone')

const view = ORG.getByRole('button', { name: 'View match details' })
await view.first().click()
await ORG.getByRole('dialog').waitFor({ timeout: 8000 })
await shoot(ORG, '08-admin-match-overview', 'the match modal › Overview: status, transition control', { full: false })
for (const [tab, name, note] of [
  ['Results', '09-admin-match-results', 'Results tab: recorded result, override, history'],
  ['Evidence', '10-admin-match-evidence', 'Evidence tab'],
  ['Admin Actions', '11-admin-match-actions', 'Admin Actions: reschedule, forfeit, override'],
]) {
  await ORG.getByRole('dialog').getByRole('tab', { name: tab }).click()
  await shoot(ORG, name, note, { full: false, settle: 900 })
}
await ORG.getByRole('dialog').getByRole('button', { name: 'Close' }).click().catch(() => {})

await go(ORG, matchUrl(m1))
await shoot(ORG, '12-org-public-match-page', 'the organiser on the public match page — what can they do from here?')

// ---------------------------------------------------------------- forfeit, by a captain
console.log('forfeit')
await go(B, matchUrl(m1))
const more = B.getByTestId('match-more-actions')
if (await more.count()) {
  await more.click()
  await B.getByTestId('forfeit-match').click()
  await shoot(B, '13-forfeit-confirm', 'forfeiting: the confirmation', { full: false, settle: 700 })
  const dialog = B.getByRole('dialog')
  await dialog.getByRole('button', { name: /forfeit|confirm/i }).last().click()
  await shoot(B, '14-forfeited-loser', 'after forfeiting — the loser’s page')
  await go(A, matchUrl(m1))
  await shoot(A, '15-forfeited-winner', 'the winner by forfeit — is it clear why they advanced?')
} else {
  console.log('  no forfeit menu for the captain (status ' + (await api(`/v1/tournaments/${cup.id}/matches/${m1.id}`, { token })).data.status + ')')
}

// ---------------------------------------------------------------- a disputed result, from the organiser's side
console.log('dispute')
await api(`/v1/admin/tournaments/${cup.id}/matches/${m2.id}/schedule`, {
  token, method: 'POST',
  body: { scheduled_at: new Date(Date.now() - 60_000).toISOString(), reason: 'organiser walk' },
}).catch((e) => console.log('  schedule:', e.message.slice(0, 120)))
for (const to_status of ['checking_in', 'in_progress']) {
  await api(`/v1/admin/tournaments/${cup.id}/matches/${m2.id}/transition`, {
    token, method: 'POST', body: { to_status, override_reason: 'organiser walk' },
  }).catch((e) => console.log(`  ${to_status}:`, e.message.slice(0, 120)))
}
const { data: submitted } = await api(`/v1/matches/${m2.id}/result`, {
  token: capC.token, method: 'POST',
  body: {
    claimed_winner_registration_id: m2.participant1_registration_id,
    participant1_score: 1, participant2_score: 0,
    game_results: [{ game_number: 1, map_id: mapPool[0], participant1_score: 13, participant2_score: 11 }],
  },
})
const claimId = submitted?.claim?.id ?? submitted?.id
await api(`/v1/matches/${m2.id}/result/${claimId}/dispute`, {
  token: capD.token, method: 'POST',
  body: { reason: 'Final score was 13-11 to us, not them. Scoreboard screenshot to follow.', evidence_ids: [] },
})
const D = await pageAs(capD)
await go(D, matchUrl(m2))
await shoot(D, '16-disputed-match', 'the disputing captain’s match page — what happens now?')
const C = await pageAs(capC)
await go(C, matchUrl(m2))
await shoot(C, '17-disputed-match-reporter', 'the reporter whose result was disputed')

await go(ORG, `${WEB}/admin/disputes`)
await shoot(ORG, '18-admin-disputes', 'admin › Disputes: the queue')
const viewDispute = ORG.getByRole('button', { name: 'View dispute' })
if (await viewDispute.count()) {
  await viewDispute.first().click()
  await ORG.getByRole('dialog').waitFor({ timeout: 8000 })
  await shoot(ORG, '19-dispute-detail', 'the dispute: thread, evidence, resolutions', { full: false })
  const dlg = ORG.getByRole('dialog')
  await dlg.locator('.v-card-text, .v-overlay__content').first().evaluate((el) => { el.scrollTop = el.scrollHeight }).catch(() => {})
  await shoot(ORG, '19b-dispute-resolutions', 'the resolution options at the bottom of the modal', { full: false, settle: 600 })
  const uphold = dlg.getByRole('button', { name: /uphold result/i })
  if (await uphold.count()) {
    await uphold.first().click()
    await shoot(ORG, '20-dispute-upheld', 'after upholding the original result', { full: false })
  }
}
await go(D, matchUrl(m2))
await shoot(D, '21-dispute-outcome-loser', 'the disputing captain after the ruling')

await go(ORG, `${WEB}/admin/result-reviews`)
await shoot(ORG, '22-admin-result-reviews', 'admin › Result reviews')
await go(ORG, `${WEB}/tournaments/${cup.slug}?tab=matches`)
await shoot(ORG, '23-org-tournament-matches-after', 'the Matches tab after a forfeit and a dispute')

await writeFile(`${SHOTS}/log.json`, JSON.stringify(log, null, 2))
await browser.close()
console.log(`done: ${SHOTS}/  (cup /tournaments/${cup.slug})`)
