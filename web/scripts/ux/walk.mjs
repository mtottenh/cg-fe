/**
 * Photograph a journey through the running app, as the person who lives it.
 *
 *   node scripts/ux/walk.mjs visitor     # signed out — the first impression
 *   node scripts/ux/walk.mjs player      # signed in, no league, no team
 *   node scripts/ux/walk.mjs captain     # owns a team, has to field it
 *   node scripts/ux/walk.mjs organiser   # runs the competition
 *   node scripts/ux/walk.mjs all
 *
 * Screens land in scripts/ux/shots/<journey>/ and a summary is printed. Then
 * LOOK at them — the point of this tool is that reading the components tells
 * you what the code does, and only the screenshots tell you what the page
 * says. Findings that came only from looking, on the first pass: a league page
 * defaulting to its emptiest season, and two sections under one control
 * disagreeing about scope.
 *
 * Each journey uses a FRESH account, so what you see is what a new arrival
 * sees — not what your long-lived dev account has accumulated.
 */
import { mkdir } from 'node:fs/promises'
import { chromium } from '@playwright/test'
import { api, makePlayer, adminToken, seed } from './seed-world.mjs'

const WEB = process.env.UX_WEB ?? 'http://localhost:5180'
const SHOTS = new URL('./shots/', import.meta.url).pathname

const journeys = process.argv[2] ?? 'all'
const wanted = (j) => journeys === 'all' || journeys === j

const log = []

async function shoot(page, dir, name, note) {
  // Vite holds an HMR websocket open, so `networkidle` NEVER fires in dev and
  // every navigation would burn its full timeout. Wait for the DOM, then give
  // the page a moment to fetch and render.
  await page.waitForTimeout(2200)
  await mkdir(`${SHOTS}${dir}`, { recursive: true })
  await page.screenshot({ path: `${SHOTS}${dir}/${name}.png`, fullPage: true })
  const url = page.url().replace(WEB, '')
  log.push({ journey: dir, name, url, note })
  console.log(`  ${name.padEnd(24)} ${url.padEnd(46)} ${note}`)
}

async function go(page, path) {
  await page.goto(WEB + path, { waitUntil: 'domcontentloaded' }).catch(() => {})
}

/** A page already signed in as `who`, without touching the login screen. */
async function pageAs(browser, who) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await ctx.newPage()
  await go(page, '/')
  await page.evaluate(
    ([t, p]) => {
      localStorage.setItem('token', t)
      if (p) localStorage.setItem('player_id', p)
    },
    [who.token, who.playerId ?? ''],
  )
  return { ctx, page }
}

const world = await seed()
const browser = await chromium.launch()

if (wanted('visitor')) {
  console.log('\nvisitor — what a first-time arrival is given')
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 950 } })
  const page = await ctx.newPage()
  for (const [name, path, note] of [
    ['1-home', '/', 'the landing page'],
    ['2-leagues', '/leagues', 'can they see any league?'],
    ['3-tournaments', '/tournaments', 'can they see any tournament?'],
    ['4-league', `/leagues/${world.league.id}`, 'a league they were linked to'],
  ]) {
    await go(page, path)
    await shoot(page, 'visitor', name, note)
  }
  await ctx.close()
}

if (wanted('player')) {
  console.log('\nplayer — signed in, no league, no team')
  const { ctx, page } = await pageAs(browser, await makePlayer('new'))
  for (const [name, path, note] of [
    ['1-dashboard', '/', 'first screen after signing in'],
    ['2-leagues', '/leagues', 'browsing leagues'],
    ['3-league', `/leagues/${world.league.id}`, 'a league page — which season does it open on?'],
    ['4-tournament', `/tournaments/${world.tournament.slug}`, 'a tournament they cannot enter yet'],
    ['5-my-teams', '/my-teams', 'no team yet'],
    ['6-pugs', '/pugs', 'the fastest route to actually playing'],
  ]) {
    await go(page, path)
    await shoot(page, 'player', name, note)
  }
  await ctx.close()
}

if (wanted('captain')) {
  console.log('\ncaptain — owns a team, has to field it')
  const captain = await makePlayer('cap')
  await api(`/v1/leagues/${world.league.id}/join`, { token: captain.token, method: 'POST' })
  const { data: made } = await api(`/v1/league-seasons/${world.season.id}/teams`, {
    token: captain.token,
    method: 'POST',
    body: {
      name: `Late Registrants ${Math.random().toString(36).slice(2, 5)}`,
      tag: 'LR' + Math.random().toString(36).slice(2, 4).toUpperCase(),
    },
  })

  // Someone asks to join, so the captain's request queue is not empty.
  const hopeful = await makePlayer('hope')
  await api(`/v1/leagues/${world.league.id}/join`, { token: hopeful.token, method: 'POST' })
  await api(`/v1/league-team-seasons/${made.team_season.id}/apply`, {
    token: hopeful.token,
    method: 'POST',
    body: {},
  }).catch(() => {})

  const { ctx, page } = await pageAs(browser, captain)
  await go(page, '/my-teams')
  await shoot(page, 'captain', '1-my-teams', 'their team, listed')
  await go(page, `/teams/${made.team.id}?season=${made.team_season.id}`)
  await shoot(page, 'captain', '2-team', 'roster, join requests — is the league/season named?')

  const invite = page.getByRole('button', { name: /invite player/i }).first()
  if (await invite.isVisible().catch(() => false)) {
    await invite.click()
    await shoot(page, 'captain', '3-invite', 'the tool for filling a roster')
    await page.keyboard.press('Escape')
  }

  await go(page, `/tournaments/${world.tournament.slug}`)
  await shoot(page, 'captain', '4-tournament', 'a team owner with a thin roster — what are they told?')
  const register = page.getByRole('button', { name: /^register/i }).first()
  if (await register.isVisible().catch(() => false)) {
    await register.click()
    await shoot(page, 'captain', '5-register', 'the registration dialog')
  } else {
    console.log('  (no Register control offered — note what appears instead)')
  }
  await ctx.close()
}

if (wanted('organiser')) {
  console.log('\norganiser — runs the competition')
  const { ctx, page } = await pageAs(browser, { token: await adminToken() })
  for (const [name, path, note] of [
    ['1-admin-home', '/admin', 'the admin landing'],
    ['2-leagues', '/admin/leagues', 'leagues they administer'],
    ['3-teams', '/admin/teams', 'teams, behind league + season pickers'],
    ['4-tournaments', '/admin/tournaments', 'the tournament list'],
  ]) {
    await go(page, path)
    await shoot(page, 'organiser', name, note)
  }

  // Season and team management is a modal on a table row — no URL of its own,
  // which is itself worth noticing.
  await go(page, '/admin/leagues')
  await page.waitForTimeout(2500)
  const manage = page.getByRole('button', { name: /manage seasons/i }).first()
  if (await manage.isVisible().catch(() => false)) {
    await manage.click()
    await shoot(page, 'organiser', '5-seasons', 'seasons — compare status with what /leagues shows')
    const teams = page.getByRole('tab', { name: /teams/i }).first()
    if (await teams.isVisible().catch(() => false)) {
      await teams.click()
      await shoot(page, 'organiser', '6-teams-panel', 'teams, three levels deep')
    }
    await page.keyboard.press('Escape')
  }

  await go(page, `/admin/tournaments/${world.tournament.id}`)
  await shoot(page, 'organiser', '7-tournament', 'running a tournament')
  await go(page, `/tournaments/${world.tournament.slug}`)
  await shoot(page, 'organiser', '8-public', 'the same tournament, player-facing')
  await ctx.close()
}

await browser.close()
console.log(`\n${log.length} screens in scripts/ux/shots/. Open them before writing anything.`)
