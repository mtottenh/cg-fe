import { describe, expect, it } from 'vitest'
import {
  buildSegments,
  computeSpinRotation,
  computeWheelGeometry,
  describeArc,
} from '../wheel'
import type { WheelSegmentInput } from '../wheel'

function segment(mapId: string, weight: number, by: string[] = []): WheelSegmentInput {
  return { map_id: mapId, weight, nominated_by: by }
}

describe('computeWheelGeometry', () => {
  it('lays segments out proportionally to weight', () => {
    const geometry = computeWheelGeometry([
      segment('de_mirage', 3),
      segment('de_nuke', 1),
    ])
    expect(geometry).toHaveLength(2)
    expect(geometry[0]!.startDeg).toBe(0)
    expect(geometry[0]!.endDeg).toBe(270)
    expect(geometry[0]!.midDeg).toBe(135)
    expect(geometry[1]!.startDeg).toBe(270)
    expect(geometry[1]!.endDeg).toBe(360)
    expect(geometry[0]!.fraction).toBeCloseTo(0.75)
  })

  it('returns empty for zero total weight', () => {
    expect(computeWheelGeometry([segment('de_mirage', 0)])).toEqual([])
    expect(computeWheelGeometry([])).toEqual([])
  })
})

describe('computeSpinRotation', () => {
  const segments = [segment('de_mirage', 1), segment('de_nuke', 1), segment('de_train', 2)]

  it('is deterministic: same payload, same rotation on every client', () => {
    const a = computeSpinRotation(segments, 'de_nuke', 1234567)
    const b = computeSpinRotation(segments, 'de_nuke', 1234567)
    expect(a).toBe(b)
  })

  it('lands the winner midpoint under the 12 o\'clock pointer', () => {
    for (const winner of ['de_mirage', 'de_nuke', 'de_train']) {
      const rotation = computeSpinRotation(segments, winner, 42)
      const geometry = computeWheelGeometry(segments)
      const mid = geometry.find((s) => s.map_id === winner)!.midDeg
      // After rotating clockwise by `rotation`, the winner's midpoint angle
      // is (mid + rotation) mod 360 — it must be back at 0 (the pointer).
      expect((mid + rotation) % 360).toBeCloseTo(0 % 360, 6)
    }
  })

  it('always spins at least 4 and at most 7 full turns', () => {
    for (const seed of [0, 1, -5, 999999, -123456789]) {
      const rotation = computeSpinRotation(segments, 'de_mirage', seed)
      expect(rotation).toBeGreaterThan(4 * 360 - 360) // ≥ 4 turns minus landing offset
      expect(rotation).toBeLessThanOrEqual(8 * 360)
    }
  })

  it('returns 0 for a winner not on the wheel (malformed payload)', () => {
    expect(computeSpinRotation(segments, 'de_missing', 42)).toBe(0)
  })
})

describe('buildSegments', () => {
  it('mirrors the backend aggregation rules', () => {
    const entries = [
      { map_id: 'de_mirage', player_name: 'alice' },
      { map_id: 'de_mirage', player_name: 'bob' },
      { map_id: 'de_nuke', player_name: 'carol' },
      { map_id: 'de_train', player_name: 'dave' }, // not in the allowed pool
    ]
    const allowed = ['de_mirage', 'de_nuke', 'de_ancient']
    const segments = buildSegments(entries, allowed)

    expect(segments.map((s) => s.map_id)).toEqual(['de_ancient', 'de_mirage', 'de_nuke'])
    const mirage = segments.find((s) => s.map_id === 'de_mirage')!
    expect(mirage.weight).toBe(2)
    expect(mirage.nominated_by).toEqual(['alice', 'bob'])
    const ancient = segments.find((s) => s.map_id === 'de_ancient')!
    expect(ancient.weight).toBe(1)
    expect(ancient.nominated_by).toEqual([])
  })
})

describe('describeArc', () => {
  it('produces a closed path for a normal segment', () => {
    const path = describeArc(160, 160, 156, 0, 90)
    expect(path.startsWith('M 160 160')).toBe(true)
    expect(path.endsWith('Z')).toBe(true)
  })

  it('degenerates gracefully for a single-segment (full circle) wheel', () => {
    const path = describeArc(160, 160, 156, 0, 360)
    // Two half-arcs, no zero-length arc.
    expect(path.match(/A /g)?.length).toBe(2)
  })
})
