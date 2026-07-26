/**
 * Match fixtures for E2E tests.
 *
 * P-67: this file used to export five more helpers — `getFirstMatch`,
 * `proposeSchedule`, `submitResult`, `respondToResult`, `getAvailabilityWindows`
 * — none of which had a single caller, and three of which pointed at endpoints
 * that do not exist: `/matches/{id}/scheduling/proposals` (the real route is
 * `/matches/{id}/schedule/propose`) and `/matches/{id}/results[...]` plural (the
 * real route is `/matches/{id}/result`). `match-results-extra.fixture.ts` was
 * written specifically *because* those two were wrong, and said so in its header
 * — so the wrong versions sat here as a trap for the next author, who would
 * reasonably have reached for the shared fixture first and got a 404 they had to
 * debug. Every one of them returned `null` on failure rather than throwing, so
 * calling one would have produced a confusing downstream failure rather than a
 * clear one.
 *
 * `setAvailabilityWindow` is the only helper here with a live consumer
 * (`match-workflow.spec.ts`) and a route that exists, so it is what remains.
 */

const API_URL = process.env.VITE_API_URL || 'http://localhost:3000'

interface AvailabilityWindow {
  id: string
  day_of_week: number
  start_time: string
  end_time: string
  is_preferred: boolean
  [key: string]: unknown
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
