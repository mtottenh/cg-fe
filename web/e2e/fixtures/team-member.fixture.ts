/**
 * Team member fixtures for E2E tests.
 * Provides API helpers for team invitations and multi-player flows.
 */
import type { Page } from '@playwright/test'
import { login } from './auth.fixture'
import { testUsers } from './test-data'

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface InvitationResponse {
  id: string
  status: string
  [key: string]: unknown
}

/**
 * Invite a player to a league team via API.
 */
export async function invitePlayer(
  token: string,
  seasonId: string,
  teamSeasonId: string,
  playerId: string
): Promise<InvitationResponse | null> {
  const response = await fetch(
    `${API_URL}/v1/league-seasons/${seasonId}/teams/${teamSeasonId}/invitations`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ player_id: playerId, role: 'player' }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to invite player (${response.status}): ${error}`)
    return null
  }

  const data = await response.json()
  return data.data || data
}

/**
 * Accept a team invitation via API.
 */
export async function acceptInvitation(
  playerToken: string,
  invitationId: string
): Promise<boolean> {
  const response = await fetch(`${API_URL}/v1/league-team-invitations/${invitationId}/accept`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${playerToken}` },
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to accept invitation (${response.status}): ${error}`)
    return false
  }

  return true
}

/**
 * Decline a team invitation via API.
 */
export async function declineInvitation(
  playerToken: string,
  invitationId: string
): Promise<boolean> {
  const response = await fetch(`${API_URL}/v1/league-team-invitations/${invitationId}/decline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${playerToken}` },
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to decline invitation (${response.status}): ${error}`)
    return false
  }

  return true
}

/**
 * Login as the seeded second player via the UI.
 */
export async function loginAsPlayer2(page: Page): Promise<void> {
  await login(page, testUsers.player2Login)
}
