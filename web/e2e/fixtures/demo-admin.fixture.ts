import { uniqueId } from './test-data'
import type { DemoStatus } from './api-status'

/**
 * Admin demo-management helpers.
 *
 * The demo *catalog* is the only cheap precondition in the demo pipeline: a
 * demo row needs nothing but a game id and an S3 coordinate, so these tests
 * don't have to stand up a tournament the way `awards.fixture` does.
 * Everything here seeds or cross-checks through the API — the mutations under
 * test are driven through the admin UI by the spec.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

/** The subset of `DemoResponse` these tests assert on. */
export interface AdminDemo {
  id: string
  game_id: string
  file_name: string
  s3_bucket: string
  s3_key: string
  status: DemoStatus
  category: string
  is_hidden: boolean
  admin_notes: string | null
  league_id: string | null
  tournament_id: string | null
}

export interface DemoGame {
  id: string
  displayName: string
}

async function jsonOrThrow<T>(response: Response, context: string): Promise<T> {
  const text = await response.text()
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`)
  }
  return (text ? JSON.parse(text) : {}) as T
}

/**
 * The CS2 game row, with the `display_name` the admin selects render.
 * `awards.fixture.getCs2Game` returns only id/slug, and the catalog modal's
 * game select is keyed on the display name, so this returns both.
 */
export async function getDemoGame(): Promise<DemoGame> {
  const resp = await fetch(`${API_URL}/v1/games?per_page=100`)
  const body = await jsonOrThrow<{
    data: Array<{ id: string; slug?: string; name?: string; display_name: string }>
  }>(resp, 'List games')
  const games = body.data ?? []
  const cs2 = games.find(
    (g) =>
      g.slug?.toLowerCase() === 'cs2' ||
      g.display_name.toLowerCase().includes('counter-strike'),
  )
  const game = cs2 ?? games[0]
  if (!game) throw new Error('No games available to catalog demos against')
  return { id: game.id, displayName: game.display_name }
}

/** A file name unique to this run, so list cross-checks can find it exactly. */
export function uniqueDemoFileName(prefix = 'e2e-demo-admin'): string {
  return `${prefix}-${uniqueId()}.dem`
}

/**
 * Catalog a demo through the admin API and return the full row.
 * Used as a precondition only — the spec drives catalog-through-the-modal
 * separately via the UI.
 */
export async function catalogDemoViaApi(
  adminToken: string,
  gameId: string,
  fileName = uniqueDemoFileName(),
): Promise<AdminDemo> {
  const resp = await fetch(`${API_URL}/v1/admin/demos`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify({
      game_id: gameId,
      file_name: fileName,
      s3_bucket: 'e2e-demo-admin',
      s3_key: `e2e/${fileName}`,
      file_size_bytes: 12_345_678,
    }),
  })
  const body = await jsonOrThrow<{ data: AdminDemo }>(resp, 'Catalog demo')
  return body.data
}

/**
 * Stamp a demo onto a league/tournament through the admin API.
 *
 * Used to seed the *wrong* stamp that P-75's repair path exists to correct —
 * the P-42 failure mode, where the auto-linker lands a demo on the wrong
 * target. The correction itself is driven through the UI by the spec.
 */
export async function associateDemoViaApi(
  adminToken: string,
  demoId: string,
  body: { league_id?: string | null; tournament_id?: string | null },
): Promise<AdminDemo> {
  const resp = await fetch(`${API_URL}/v1/admin/demos/${demoId}/associate`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${adminToken}`,
    },
    body: JSON.stringify(body),
  })
  const parsed = await jsonOrThrow<{ data: AdminDemo }>(resp, 'Associate demo')
  return parsed.data
}

/** Read a demo back as the admin (sees hidden demos). */
export async function getDemoViaApi(token: string, demoId: string): Promise<AdminDemo> {
  const resp = await fetch(`${API_URL}/v1/demos/${demoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  const body = await jsonOrThrow<{ data: AdminDemo }>(resp, 'Get demo')
  return body.data
}

/**
 * Raw HTTP status of a demo read, for the visibility gate cross-check
 * (`handlers/demos.rs:1241 authorize_demo_read` 403s a non-participant on a
 * hidden demo).
 */
export async function getDemoReadStatus(token: string, demoId: string): Promise<number> {
  const resp = await fetch(`${API_URL}/v1/demos/${demoId}`, {
    headers: { Authorization: `Bearer ${token}` },
  })
  return resp.status
}

/** List demos for a game (admin view, hidden included). */
export async function listDemosViaApi(
  adminToken: string,
  gameId: string,
  limit = 100,
): Promise<AdminDemo[]> {
  const resp = await fetch(
    `${API_URL}/v1/demos?game_id=${gameId}&include_hidden=true&limit=${limit}`,
    { headers: { Authorization: `Bearer ${adminToken}` } },
  )
  const body = await jsonOrThrow<{ data: { demos: AdminDemo[]; total: number } }>(
    resp,
    'List demos',
  )
  return body.data.demos ?? []
}

/** Delete a demo (cleanup for the batch-catalog test's rows). */
export async function deleteDemoViaApi(adminToken: string, demoId: string): Promise<void> {
  const resp = await fetch(`${API_URL}/v1/admin/demos/${demoId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${adminToken}` },
  })
  if (!resp.ok && resp.status !== 404) {
    throw new Error(`Delete demo failed (${resp.status}): ${await resp.text()}`)
  }
}
