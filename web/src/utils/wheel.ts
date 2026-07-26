/**
 * Wheel geometry + deterministic spin math for PUG wheel mode.
 *
 * The server picks the winner and broadcasts `{segments, winner_map_id,
 * spin_seed, duration_ms}` to every lobby client. Everything here is a pure
 * function of that payload, so every client renders the *identical* spin —
 * same segments, same number of turns, same landing angle.
 */

export interface WheelSegmentInput {
  map_id: string
  /** Nomination count — duplicate nominations weight the wheel. */
  weight: number
  nominated_by: string[]
}

export interface WheelSegmentGeometry extends WheelSegmentInput {
  /** Segment start angle in degrees (0 = 12 o'clock, clockwise). */
  startDeg: number
  /** Segment end angle in degrees. */
  endDeg: number
  /** Angle of the segment midpoint in degrees. */
  midDeg: number
  /** Fraction of the wheel this segment covers (0..1). */
  fraction: number
}

/**
 * Lay the segments out clockwise from 12 o'clock, proportionally to weight.
 * Segment order must be the server's order (it is stable/sorted) — geometry
 * is part of the shared determinism contract.
 */
export function computeWheelGeometry(segments: WheelSegmentInput[]): WheelSegmentGeometry[] {
  const total = segments.reduce((sum, s) => sum + Math.max(0, s.weight), 0)
  if (total <= 0) return []

  let cursor = 0
  return segments.map((segment) => {
    const fraction = Math.max(0, segment.weight) / total
    const startDeg = cursor * 360
    cursor += fraction
    const endDeg = cursor * 360
    return {
      ...segment,
      startDeg,
      endDeg,
      midDeg: (startDeg + endDeg) / 2,
      fraction,
    }
  })
}

/**
 * Total clockwise rotation (degrees) that lands the winner's midpoint under
 * the pointer at 12 o'clock.
 *
 * Deterministic from the server's seed: 4–7 full turns plus the offset to
 * the winner. Returns 0 when the winner isn't among the segments (malformed
 * payload) — the caller should then skip the animation and trust the state
 * frames.
 */
export function computeSpinRotation(
  segments: WheelSegmentInput[],
  winnerMapId: string,
  spinSeed: number,
): number {
  const geometry = computeWheelGeometry(segments)
  const winner = geometry.find((s) => s.map_id === winnerMapId)
  if (!winner) return 0

  // 4 + (|seed| mod 4) full turns — enough drama, bounded wait.
  const fullTurns = 4 + (Math.abs(Math.trunc(spinSeed)) % 4)
  // Rotating the wheel clockwise by `midDeg` brings the winner's midpoint
  // back to 12 o'clock after whole turns; normalize into (0, 360].
  const offset = 360 - (winner.midDeg % 360)
  return fullTurns * 360 + offset
}

/**
 * SVG arc path for a segment of a wheel centered at (cx, cy).
 * Degrees measured clockwise from 12 o'clock.
 */
export function describeArc(
  cx: number,
  cy: number,
  radius: number,
  startDeg: number,
  endDeg: number,
): string {
  const toPoint = (deg: number) => {
    const rad = ((deg - 90) * Math.PI) / 180
    return { x: cx + radius * Math.cos(rad), y: cy + radius * Math.sin(rad) }
  }
  const start = toPoint(startDeg)
  const end = toPoint(endDeg)
  const sweep = endDeg - startDeg
  // A full-circle "segment" (single-entry wheel) degenerates: draw two
  // half-arcs instead.
  if (sweep >= 360) {
    const mid = toPoint(startDeg + 180)
    return [
      `M ${cx} ${cy - radius}`,
      `A ${radius} ${radius} 0 1 1 ${mid.x} ${mid.y}`,
      `A ${radius} ${radius} 0 1 1 ${cx} ${cy - radius}`,
      'Z',
    ].join(' ')
  }
  const largeArc = sweep > 180 ? 1 : 0
  return [
    `M ${cx} ${cy}`,
    `L ${start.x} ${start.y}`,
    `A ${radius} ${radius} 0 ${largeArc} 1 ${end.x} ${end.y}`,
    'Z',
  ].join(' ')
}

/**
 * Aggregate nominations into weighted segments, mirroring the backend rule
 * set exactly: entries restricted to `allowed` maps, duplicate nominations
 * add weight, un-nominated allowed maps spin at weight 1, stable sort by
 * map id. Only used for the idle wheel — spin animations always use the
 * server's own segment payload.
 */
export function buildSegments(
  entries: Array<{ map_id: string; player_name: string }>,
  allowed: string[],
): WheelSegmentInput[] {
  const byMap = new Map<string, WheelSegmentInput>()
  for (const entry of entries) {
    if (!allowed.includes(entry.map_id)) continue
    const existing = byMap.get(entry.map_id)
    if (existing) {
      existing.weight += 1
      existing.nominated_by.push(entry.player_name)
    } else {
      byMap.set(entry.map_id, {
        map_id: entry.map_id,
        weight: 1,
        nominated_by: [entry.player_name],
      })
    }
  }
  for (const mapId of allowed) {
    if (!byMap.has(mapId)) {
      byMap.set(mapId, { map_id: mapId, weight: 1, nominated_by: [] })
    }
  }
  return [...byMap.values()].sort((a, b) => a.map_id.localeCompare(b.map_id))
}

/** Dark-theme-friendly categorical palette for wheel segments. */
export const WHEEL_COLORS = [
  '#5C6BC0', // indigo
  '#26A69A', // teal
  '#EF5350', // red
  '#AB47BC', // purple
  '#FFA726', // orange
  '#42A5F5', // blue
  '#9CCC65', // light green
  '#EC407A', // pink
  '#8D6E63', // brown
  '#78909C', // blue grey
]
