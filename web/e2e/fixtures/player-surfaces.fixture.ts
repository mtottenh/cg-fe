import type { components } from '@/api/types'
import { createTestUser } from './checkin.fixture'

/**
 * API helpers for the player self-service surfaces:
 *
 *   - steam tracking   `/v1/players/me/steam-tracking`        (SteamTrackingCard)
 *   - availability     `/v1/players/me/availability/windows`  (AvailabilityWindowsManager)
 *                      `/v1/players/me/availability/overrides` (AvailabilityOverridesManager)
 *
 * Every one of these endpoints mutates the CURRENT user, so each spec builds a
 * throwaway player of its own instead of touching the shared admin account —
 * otherwise "this player has exactly one window" stops being assertable the
 * moment two specs run at once.
 *
 * Endpoint shapes verified against `api/crates/portal-api/src/routes/players.rs`
 * and `handlers/{steam_tracking,availability}.rs`.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

type S = components['schemas']

export type SteamTracking = S['SteamTrackingResponse']
export type AvailabilityWindow = S['AvailabilityWindowResponse']
export type AvailabilityOverride = S['AvailabilityOverrideResponse']
export type CreateWindowBody = S['CreateAvailabilityWindowRequest']
export type CreateOverrideBody = S['CreateAvailabilityOverrideRequest']
export type UpdatePlayerBody = S['UpdatePlayerProfileRequest']
export type Player = S['PlayerResponse']

export interface PlayerSession {
  userId: string
  username: string
  email: string
  password: string
  token: string
}

export interface SteamPlayerSession extends PlayerSession {
  /** The SteamID64 linked to this player (`players.steam_id`). */
  steamId: string
}

interface ApiResult<T> {
  data: T
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  if (!text) return {} as T
  return JSON.parse(text) as T
}

function authHeaders(token: string): Record<string, string> {
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` }
}

// =============================================================================
// Players
// =============================================================================

/**
 * A SteamID64 that no other player owns — `players.steam_id` and
 * `players.steam_id_64` are both UNIQUE (migration 0002:56-57), and
 * `steam_tracking` is additionally unique on (steam_id_64, game_id)
 * (migration 0047:19), so a shared constant would make the second test
 * to run fail on a database conflict.
 *
 * The `76561198` prefix is not cosmetic: `PATCH /v1/players/me` rejects
 * anything below the individual-account base 76561197960265728, so a random
 * 17-digit string starting `7656119` fails validation roughly half the time.
 */
export function uniqueSteamId(): string {
  const digits = Array.from({ length: 9 }, () => Math.floor(Math.random() * 10)).join('')
  return `76561198${digits}`
}

export async function getMyProfile(token: string): Promise<Player> {
  const resp = await fetch(`${API_URL}/v1/players/me`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<Player>>(resp, 'Get /players/me')
  return body.data
}

export async function patchMyProfile(token: string, body: UpdatePlayerBody): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/players/me`, {
    method: 'PATCH',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  await jsonOrThrow<ApiResult<unknown>>(resp, 'Patch /players/me')
}

/** A brand-new player with no Steam account linked. */
export async function createPlayer(): Promise<PlayerSession> {
  return createTestUser()
}

/**
 * A brand-new player with a linked SteamID64. Steam tracking registration
 * refuses a player without one (`handlers/steam_tracking.rs:134-138`), and the
 * Steam ID is write-once in the UI, so it is seeded over the API here.
 */
export async function createPlayerWithSteamId(): Promise<SteamPlayerSession> {
  const user = await createTestUser()
  const steamId = uniqueSteamId()
  await patchMyProfile(user.token, { steam_id: steamId })
  return { ...user, steamId }
}

// =============================================================================
// Steam tracking
// =============================================================================

/** Current tracking row, or null when the player has none (the API 404s). */
export async function getTrackingViaApi(token: string): Promise<SteamTracking | null> {
  const resp = await fetch(`${API_URL}/v1/players/me/steam-tracking`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  if (resp.status === 404) return null
  const body = await jsonOrThrow<ApiResult<SteamTracking>>(resp, 'Get steam tracking')
  return body.data
}

/** Seed an active tracking row so a spec can drive update/delete from the UI. */
export async function enableTrackingViaApi(
  token: string,
  gameAuthCode: string,
  initialShareCode?: string,
): Promise<SteamTracking> {
  const resp = await fetch(`${API_URL}/v1/players/me/steam-tracking`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify({
      game_auth_code: gameAuthCode,
      game_slug: 'cs2',
      ...(initialShareCode ? { initial_share_code: initialShareCode } : {}),
    }),
  })
  const body = await jsonOrThrow<ApiResult<SteamTracking>>(resp, 'Register steam tracking')
  return body.data
}

// =============================================================================
// Availability
// =============================================================================

export async function listWindowsViaApi(token: string): Promise<AvailabilityWindow[]> {
  const resp = await fetch(`${API_URL}/v1/players/me/availability/windows`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<AvailabilityWindow[]>>(resp, 'List availability windows')
  return body.data ?? []
}

export async function createWindowViaApi(
  token: string,
  body: CreateWindowBody,
): Promise<AvailabilityWindow> {
  const resp = await fetch(`${API_URL}/v1/players/me/availability/windows`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  const parsed = await jsonOrThrow<ApiResult<AvailabilityWindow>>(resp, 'Create availability window')
  return parsed.data
}

export async function listOverridesViaApi(token: string): Promise<AvailabilityOverride[]> {
  const resp = await fetch(`${API_URL}/v1/players/me/availability/overrides`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<ApiResult<AvailabilityOverride[]>>(
    resp,
    'List availability overrides',
  )
  return body.data ?? []
}

export async function createOverrideViaApi(
  token: string,
  body: CreateOverrideBody,
): Promise<AvailabilityOverride> {
  const resp = await fetch(`${API_URL}/v1/players/me/availability/overrides`, {
    method: 'POST',
    headers: authHeaders(token),
    body: JSON.stringify(body),
  })
  const parsed = await jsonOrThrow<ApiResult<AvailabilityOverride>>(
    resp,
    'Create availability override',
  )
  return parsed.data
}

/** `YYYY-MM-DD`, `days` from today in the runner's local calendar. */
export function isoDateInDays(days: number): string {
  const d = new Date()
  d.setDate(d.getDate() + days)
  const month = `${d.getMonth() + 1}`.padStart(2, '0')
  const day = `${d.getDate()}`.padStart(2, '0')
  return `${d.getFullYear()}-${month}-${day}`
}
