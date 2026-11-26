/**
 * An estimate of the server's clock, for counting down to server deadlines.
 *
 * Deadlines such as a veto turn's are absolute server times. Counting down to
 * one with the viewer's own clock is wrong by however far that clock is off —
 * a PC running two minutes fast shows a 30-second turn as already over.
 *
 * The best source is the `server_time` the backend stamps on every veto
 * session (REST and socket frames, millisecond resolution). Between those,
 * the `Date` header of any API response (one-second resolution) is used, but
 * never to overwrite a recent `server_time` sample.
 */

/** Below this the samples are noise: the `Date` header only has whole seconds. */
const IGNORE_BELOW_MS = 2_000

let offsetMs = 0
/** When the last precise (`server_time`) sample was taken, client clock. */
let lastPreciseAt = Number.NEGATIVE_INFINITY

/** How long a precise sample outranks the coarse `Date` header. */
const PRECISE_SAMPLE_TTL_MS = 5 * 60_000

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
  // A coarse header sample must not undo a recent precise one.
  if (clientAt - lastPreciseAt < PRECISE_SAMPLE_TTL_MS) return
  const sample = serverMs - clientAt
  // A clock that agrees to within a couple of seconds needs no correction,
  // and applying one would only add the header's rounding as jitter.
  offsetMs = Math.abs(sample) < IGNORE_BELOW_MS ? 0 : sample
}

/**
 * Record a server timestamp with sub-second resolution, such as a veto
 * session's `server_time`. Preferred over the `Date` header.
 */
export function noteServerTimestamp(iso: string | null | undefined, clientAt: number = Date.now()): void {
  if (!iso) return
  const serverMs = Date.parse(iso)
  if (Number.isNaN(serverMs)) return
  lastPreciseAt = Number.NEGATIVE_INFINITY
  noteServerTime(serverMs, clientAt)
  lastPreciseAt = clientAt
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
  lastPreciseAt = Number.NEGATIVE_INFINITY
}
