import { describe, it, expect } from 'vitest'
import {
  emptyRules,
  rulesFromSettings,
  rulesFromResponse,
  buildEligibilityPayload,
  describeRules,
  activeRuleCount,
  ruleBoundErrors,
  type EligibilityRules,
} from '@/composables/useEligibilityRules'
import { evaluateRules, type PlayerRuleStats } from '@/composables/useEligibilityCheck'

function rules(overrides: Partial<EligibilityRules> = {}): EligibilityRules {
  return { ...emptyRules(), ...overrides }
}

const stats: PlayerRuleStats = {
  rating: 11000,
  peak_rating: 15000,
  rank_tier: 'gold',
  matches_played: 42,
}

describe('useEligibilityRules', () => {
  it('reads league settings JSONB and tournament typed responses identically', () => {
    const shape = {
      min_rating_per_player: 12000,
      max_team_average_rating: 18000,
      allowed_rank_tiers: ['gold', 'silver'],
    }
    const fromLeague = rulesFromSettings({ eligibility: shape, side_selection_mode: 'knife' })
    const fromTournament = rulesFromResponse(shape)
    expect(fromLeague).toEqual(fromTournament)
    expect(fromLeague.min_rating_per_player).toBe(12000)
    expect(fromLeague.max_team_average_rating).toBe(18000)
    expect(fromLeague.allowed_rank_tiers).toEqual(['gold', 'silver'])
  })

  it('treats 0 as a real rule, not an unset field', () => {
    const r = rules({ min_matches_played: 0 })
    expect(activeRuleCount(r)).toBe(1)
    expect(buildEligibilityPayload(r)).toEqual({ min_matches_played: 0 })
  })

  it('payload is undefined when no rules are set', () => {
    expect(buildEligibilityPayload(emptyRules())).toBeUndefined()
  })

  it('ignores malformed settings without throwing', () => {
    expect(rulesFromSettings(null)).toEqual(emptyRules())
    expect(rulesFromSettings('garbage')).toEqual(emptyRules())
    expect(rulesFromSettings({ eligibility: { min_rating_per_player: 'high' } })).toEqual(
      emptyRules(),
    )
  })

  it('describes rules player-first with formatted values', () => {
    const descriptors = describeRules(
      rules({ max_team_total_rating: 60000, min_rating_per_player: 12000 }),
    )
    expect(descriptors.map((d) => d.key)).toEqual([
      'min_rating_per_player',
      'max_team_total_rating',
    ])
    expect(descriptors[0]!.text).toContain('12,000')
    expect(descriptors[1]!.kind).toBe('team')
  })

  it('flags unsatisfiable min/max pairs', () => {
    const errors = ruleBoundErrors(
      rules({ min_rating_per_player: 2000, max_rating_per_player: 1000 }),
    )
    expect(errors.min_rating_per_player).toBeTruthy()
    expect(Object.keys(errors)).toHaveLength(1)
  })
})

describe('evaluateRules', () => {
  it('passes and fails per-player rules against viewer stats', () => {
    const checks = evaluateRules(
      rules({
        min_rating_per_player: 12000, // fail: 11000 < 12000
        max_peak_rating_per_player: 16000, // pass: 15000 <= 16000
        min_matches_played: 10, // pass: 42 >= 10
      }),
      stats,
    )
    const byKey = Object.fromEntries(checks.map((c) => [c.key, c]))
    expect(byKey.min_rating_per_player!.status).toBe('fail')
    expect(byKey.min_rating_per_player!.actual).toBe('11,000')
    expect(byKey.max_peak_rating_per_player!.status).toBe('pass')
    expect(byKey.min_matches_played!.status).toBe('pass')
  })

  it('team rules are unknown client-side; everything unknown without stats', () => {
    const teamChecks = evaluateRules(rules({ max_team_total_rating: 60000 }), stats)
    expect(teamChecks[0]!.status).toBe('unknown')

    const noStats = evaluateRules(rules({ min_rating_per_player: 1 }), null)
    expect(noStats[0]!.status).toBe('unknown')
  })

  it('rank tiers: membership passes, unranked fails', () => {
    const pass = evaluateRules(rules({ allowed_rank_tiers: ['gold'] }), stats)
    expect(pass[0]!.status).toBe('pass')

    const unranked = evaluateRules(rules({ allowed_rank_tiers: ['gold'] }), {
      ...stats,
      rank_tier: null,
    })
    expect(unranked[0]!.status).toBe('fail')
    expect(unranked[0]!.actual).toBe('unranked')
  })
})
