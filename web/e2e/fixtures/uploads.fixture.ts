/**
 * API helpers for image-upload e2e tests.
 *
 * Provides minimal setup helpers used by uploads.spec.ts:
 *  - resolving the admin's seeded league team
 *  - registering / logging in a throw-away secondary player
 *  - programmatically injecting auth credentials into the browser storage
 *
 * Intentionally narrow — does not extend any existing fixture file.
 */

import type { Page } from '@playwright/test'
import { uniqueEmail, uniqueUsername } from './test-data'

export const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/**
 * Backend image validation enforces both minimum dimensions and aspect-ratio
 * ranges per image type (see portal-storage::image::config):
 *   - player_avatar: 32x32 min, ~1:1 aspect
 *   - team_logo: 64x64 min, ~1:1 aspect
 *   - player_banner: 400x100 min, ~4:1 aspect
 *   - team_banner: 480x120 min, ~4:1 aspect
 * One image can't satisfy both square + 4:1 constraints, so we ship two.
 */
export const TEST_SQUARE_IMAGE_PATH = 'e2e/fixtures/images/test-square.png'  // 64x64 square
export const TEST_BANNER_IMAGE_PATH = 'e2e/fixtures/images/test-banner.png'  // 480x120 (4:1)
export const INVALID_FILE_PATH = 'e2e/fixtures/images/invalid.txt'

/** @deprecated — kept for back-compat; prefer TEST_SQUARE_IMAGE_PATH. */
export const TEST_IMAGE_PATH = TEST_SQUARE_IMAGE_PATH

export interface PlayerCredentials {
  username: string
  email: string
  password: string
  display_name: string
}

export interface AuthedPlayer {
  token: string
  playerId: string
  credentials: PlayerCredentials
}

export interface AdminLeagueTeamMembership {
  team_id: string
  team_name: string
  team_tag: string
  season_id: string
  league_id: string
}

/**
 * Fetch the first league-team the admin (or any holder of `adminToken`) belongs
 * to. Requires global-setup.ts to have seeded the admin team.
 */
export async function getAdminLeagueTeamId(adminToken: string): Promise<string | null> {
  const response = await fetch(`${API_URL}/v1/players/me/league-teams`, {
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!response.ok) return null
  const data = await response.json()
  const memberships: AdminLeagueTeamMembership[] = data.data || []
  return memberships[0]?.team_id ?? null
}

/**
 * Register a fresh player via the API (no UI).
 * Returns token + playerId so the test can programmatically log them in.
 */
export async function registerPlayerViaApi(
  credentials?: Partial<PlayerCredentials>
): Promise<AuthedPlayer> {
  const creds: PlayerCredentials = {
    username: credentials?.username ?? uniqueUsername(),
    email: credentials?.email ?? uniqueEmail(),
    password: credentials?.password ?? 'TestPassword123!',
    display_name: credentials?.display_name ?? 'Upload Test Player',
  }

  const response = await fetch(`${API_URL}/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(creds),
  })

  if (!response.ok) {
    const error = await response.text()
    throw new Error(`Failed to register test player (${response.status}): ${error}`)
  }

  const body = await response.json()
  return {
    token: body.data.access_token,
    playerId: body.data.player?.id || body.data.player_id,
    credentials: creds,
  }
}

/**
 * Seed an authenticated session in the browser without going through the login
 * page. Writes the token + player_id to localStorage where the app reads them.
 * Call this after `page.goto('/')` so localStorage is scoped to the app origin.
 */
export async function injectAuth(page: Page, token: string, playerId: string): Promise<void> {
  await page.goto('/')
  await page.evaluate(
    ([t, p]) => {
      localStorage.setItem('token', t)
      localStorage.setItem('player_id', p)
    },
    [token, playerId]
  )
}

/**
 * Fetch the current player's profile — used by tests to read back the
 * avatar_url / banner_url after upload to assert persistence.
 */
export async function getMyProfile(token: string): Promise<{
  avatar_url?: string | null
  banner_url?: string | null
  id: string
} | null> {
  const response = await fetch(`${API_URL}/v1/players/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (!response.ok) return null
  const data = await response.json()
  return data.data || null
}

/**
 * Fetch a league-team by id via the public endpoint — used to confirm that
 * logo/banner uploads persisted on the server.
 */
export async function getLeagueTeam(teamId: string): Promise<{
  id: string
  logo_url?: string | null
  banner_url?: string | null
  owner_player_id?: string
} | null> {
  const response = await fetch(`${API_URL}/v1/league-teams/${teamId}`)
  if (!response.ok) return null
  const data = await response.json()
  return data.data || null
}
