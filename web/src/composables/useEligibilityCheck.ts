import { ref, watch, computed, type Ref } from 'vue'
import { api } from '@/api'
import { unwrapApiOptional } from '@/stores/helpers'
import type { components } from '@/api/types'
import {
  describeRules,
  type EligibilityRules,
  type RuleDescriptor,
} from '@/composables/useEligibilityRules'

type PublicMmStatsResponse = components['schemas']['PublicMmStatsResponse']

/** The subset of a player's stats the per-player rules are checked against. */
export interface PlayerRuleStats {
  rating: number
  peak_rating: number
  rank_tier: string | null
  matches_played: number
}

export interface RuleCheck extends RuleDescriptor {
  /**
   * 'pass'/'fail' for per-player rules checked against known stats;
   * 'unknown' for team rules (roster aggregates aren't computable
   * client-side) and when the viewer's stats aren't available. The server
   * remains authoritative either way — this is a preview, not a gate.
   */
  status: 'pass' | 'fail' | 'unknown'
  /** The viewer's actual value, for "you have X" feedback. */
  actual: string | null
}

/**
 * Evaluate rules against a player's stats. Pure — exported for tests and
 * for callers that already hold stats.
 */
export function evaluateRules(
  rules: EligibilityRules,
  stats: PlayerRuleStats | null,
): RuleCheck[] {
  return describeRules(rules).map((descriptor) => {
    if (descriptor.kind === 'team' || !stats) {
      return { ...descriptor, status: 'unknown' as const, actual: null }
    }
    switch (descriptor.key) {
      case 'min_rating_per_player':
        return withVerdict(descriptor, stats.rating >= descriptor.value, stats.rating)
      case 'max_rating_per_player':
        return withVerdict(descriptor, stats.rating <= descriptor.value, stats.rating)
      case 'max_peak_rating_per_player':
        return withVerdict(descriptor, stats.peak_rating <= descriptor.value, stats.peak_rating)
      case 'min_matches_played':
        return withVerdict(
          descriptor,
          stats.matches_played >= descriptor.value,
          stats.matches_played,
        )
      case 'allowed_rank_tiers': {
        // Mirrors the backend: an unranked player fails a tier restriction.
        const tier = stats.rank_tier ?? 'unranked'
        return {
          ...descriptor,
          status: rules.allowed_rank_tiers.includes(tier)
            ? ('pass' as const)
            : ('fail' as const),
          actual: tier,
        }
      }
      default:
        return { ...descriptor, status: 'unknown' as const, actual: null }
    }
  })
}

function withVerdict(descriptor: RuleDescriptor, pass: boolean, actual: number): RuleCheck {
  return {
    ...descriptor,
    status: pass ? 'pass' : 'fail',
    actual: actual.toLocaleString(),
  }
}

/**
 * Fetch the viewer's own stats for a game and evaluate a rule set against
 * them. Both refs may resolve late (page loads, auth hydration) — the
 * checks recompute when they do.
 *
 * `gameId` accepts a game UUID or slug (the endpoint resolves both).
 */
export function useEligibilityCheck(
  rules: Ref<EligibilityRules>,
  playerId: Ref<string | null | undefined>,
  gameId: Ref<string | null | undefined>,
) {
  const stats = ref<PlayerRuleStats | null>(null)
  const loading = ref(false)

  let fetchSeq = 0
  watch(
    [playerId, gameId],
    async ([pid, gid]) => {
      const seq = ++fetchSeq
      stats.value = null
      if (!pid || !gid) return
      loading.value = true
      try {
        // 404 = no stats tracked yet; the checklist degrades to 'unknown'.
        const result = await unwrapApiOptional(
          api.GET('/v1/players/{player_id}/games/{game_id}/mm-stats', {
            params: { path: { player_id: pid, game_id: gid } },
          }),
        )
        if (seq !== fetchSeq) return
        if (result !== null) {
          const s: PublicMmStatsResponse = result.data
          stats.value = {
            rating: s.rating,
            peak_rating: s.peak_rating,
            rank_tier: s.rank_tier ?? null,
            matches_played: s.matches_played,
          }
        }
      } catch {
        // Preview only: failures leave checks at 'unknown'.
        if (seq === fetchSeq) stats.value = null
      } finally {
        if (seq === fetchSeq) loading.value = false
      }
    },
    { immediate: true },
  )

  const checks = computed(() => evaluateRules(rules.value, stats.value))
  const failingChecks = computed(() => checks.value.filter((c) => c.status === 'fail'))
  const meetsAllKnown = computed(() => failingChecks.value.length === 0)

  return { stats, loading, checks, failingChecks, meetsAllKnown }
}
