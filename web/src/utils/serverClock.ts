/**
 * An estimate of the server's clock, for counting down to server deadlines.
 *
 * Deadlines such as a veto turn's are absolute server times. Counting down to
 * one with the viewer's own clock is wrong by however far that clock is off —
 * a PC running two minutes fast shows a 30-second turn as already over.
 *
 * The estimate comes from the `Date` header of every API response, which is
 * already on the wire (one-second resolution). The veto's `timeout_warning`
 * frames are NOT a source: they carry the threshold that was crossed (30, 10,
 * 5), not the time actually left, so they can be seconds out.
 */

/** Below this the samples are noise: the `Date` header only has whole seconds. */
const IGNORE_BELOW_MS = 2_000

let offsetMs = 0

/** The server's current time, as best we know it. */
export function serverNow(): number {
  return Date.now() + offsetMs
}

/** The current correction (server minus client), for tests and diagnostics. */
export function serverClockOffsetMs(): number {
  return offsetMs
}

/** Record what the server's clock read at (about) `clientAt`. */
export function noteServerTime(serverMs: number, clientAt: number = Date.now()): void {
  if (!Number.isFinite(serverMs)) return
  const sample = serverMs - clientAt
  // A clock that agrees to within a couple of seconds needs no correction,
  // and applying one would only add the header's rounding as jitter.
  offsetMs = Math.abs(sample) < IGNORE_BELOW_MS ? 0 : sample
}

/** Record an HTTP `Date` header (truncated to the second, so add half of one). */
export function noteServerDateHeader(value: string | null, clientAt: number = Date.now()): void {
  if (!value) return
  const parsed = Date.parse(value)
  if (Number.isNaN(parsed)) return
  noteServerTime(parsed + 500, clientAt)
}

export function resetServerClock(): void {
  offsetMs = 0
}
