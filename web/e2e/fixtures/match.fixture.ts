/**
 * Match fixtures for E2E tests.
 * Provides API helpers for match scheduling and result submission.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface MatchResponse {
  id: string
  status: string
  participant1_registration_id?: string | null
  participant2_registration_id?: string | null
  [key: string]: unknown
}

interface ScheduleProposal {
  id: string
  status: string
  proposed_times: string[]
  [key: string]: unknown
}

interface ResultResponse {
  id: string
  status: string
  [key: string]: unknown
}

interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_preferred: boolean
  [key: string]: unknown
}

/**
 * Fetch the first match for a tournament via API.
 */
export async function getFirstMatch(
  token: string,
  tournamentId: string
): Promise<MatchResponse | null> {
  const response = await fetch(`${API_URL}/v1/tournaments/${tournamentId}/matches`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) return null

  const data = await response.json()
  const matches = data.data || []
  return matches.length > 0 ? matches[0] : null
}

/**
 * Propose a match schedule with proposed times.
 */
export async function proposeSchedule(
  token: string,
  tournamentId: string,
  matchId: string,
  times: string[]
): Promise<ScheduleProposal | null> {
  const response = await fetch(
    `${API_URL}/v1/tournaments/${tournamentId}/matches/${matchId}/scheduling/proposals`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ proposed_times: times }),
    }
  )

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to propose schedule (${response.status}): ${error}`)
    return null
  }

  const data = await response.json()
  return data.data || data
}

/**
 * Submit a match result with scores.
 */
export async function submitResult(
  token: string,
  matchId: string,
  scores: { participant1_score: number; participant2_score: number }[]
): Promise<ResultResponse | null> {
  const response = await fetch(`${API_URL}/v1/matches/${matchId}/results`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ game_scores: scores }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to submit result (${response.status}): ${error}`)
    return null
  }

  const data = await response.json()
  return data.data || data
}

/**
 * Create an availability window for the authenticated player.
 * Used to seed availability data so OpponentAvailabilityPreview can show mutual times.
 */
export async function setAvailabilityWindow(
  token: string,
  dayOfWeek: number,
  startTime: string,
  endTime: string,
  isPreferred = false
): Promise<AvailabilityWindow | null> {
  const response = await fetch(`${API_URL}/v1/players/me/availability/windows`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      day_of_week: dayOfWeek,
      start_time: startTime,
      end_time: endTime,
      is_preferred: isPreferred,
    }),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to set availability window (${response.status}): ${error}`)
    return null
  }

  const data = await response.json()
  return data.data || data
}

/**
 * Fetch the authenticated player's availability windows.
 */
export async function getAvailabilityWindows(
  token: string
): Promise<AvailabilityWindow[]> {
  const response = await fetch(`${API_URL}/v1/players/me/availability/windows`, {
    headers: { Authorization: `Bearer ${token}` },
  })

  if (!response.ok) return []

  const data = await response.json()
  return data.data || []
}

/**
 * Confirm or dispute a match result.
 */
export async function respondToResult(
  token: string,
  matchId: string,
  resultId: string,
  action: 'confirm' | 'dispute',
  reason?: string
): Promise<boolean> {
  const response = await fetch(`${API_URL}/v1/matches/${matchId}/results/${resultId}/${action}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(action === 'dispute' ? { reason: reason || 'Incorrect scores' } : {}),
  })

  if (!response.ok) {
    const error = await response.text()
    console.error(`Failed to ${action} result (${response.status}): ${error}`)
    return false
  }

  return true
}
