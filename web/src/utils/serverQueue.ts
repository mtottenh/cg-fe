/**
 * What to tell a team whose match is waiting for a game server.
 *
 * `queuePosition` is the API's 1-based place in the queue (1 = next), present
 * only while the reservation is `pending`. Absent means the place is not
 * known — e.g. state built from a websocket frame, which does not carry it.
 */
export function describeServerQueue(queuePosition: number | null | undefined): string {
  if (queuePosition == null || queuePosition < 1) return 'Waiting for a free game server…'
  if (queuePosition === 1) return 'Waiting for the game server — you are next.'
  const ahead = queuePosition - 1
  return `Waiting for the game server — ${ahead} ${ahead === 1 ? 'match' : 'matches'} ahead of you.`
}
