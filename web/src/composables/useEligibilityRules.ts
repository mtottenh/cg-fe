import type { components } from '@/api/types'

/**
 * Canonical entry-requirements model, shared by leagues and tournaments.
 *
 * The wire shape is the backend's `EligibilityRestrictionsInput` — leagues
 * fold it into `settings.eligibility` JSONB, tournaments carry it as a typed
 * field — but both READ back the same key set, so one model (and one editor,
 * one display) serves both.
 */
export type EligibilityRules = {
  min_rating_per_player: number | null
  max_rating_per_player: number | null
  max_peak_rating_per_player: number | null
  max_avg_rating_per_player: number | null
  min_matches_played: number | null
  min_team_average_rating: number | null
  max_team_average_rating: number | null
  min_team_total_rating: number | null
  max_team_total_rating: number | null
  /** Allowed rank tier ids; empty = unrestricted. Displayed and checked,
   * but not yet editable (the editor needs the game's tier catalog). */
  allowed_rank_tiers: string[]
}

type WireRestrictions =
  | components['schemas']['EligibilityRestrictionsInput']
  | components['schemas']['EligibilityRestrictionsResponse']

/** The rule keys, in display order: player rules first, then team rules. */
export const PLAYER_RULE_KEYS = [
  'min_rating_per_player',
  'max_rating_per_player',
  'max_peak_rating_per_player',
  'max_avg_rating_per_player',
  'min_matches_played',
] as const

export const TEAM_RULE_KEYS = [
  'min_team_average_rating',
  'max_team_average_rating',
  'min_team_total_rating',
  'max_team_total_rating',
] as const

export type RuleKey = (typeof PLAYER_RULE_KEYS)[number] | (typeof TEAM_RULE_KEYS)[number]

export function emptyRules(): EligibilityRules {
  return {
    min_rating_per_player: null,
    max_rating_per_player: null,
    max_peak_rating_per_player: null,
    max_avg_rating_per_player: null,
    min_matches_played: null,
    min_team_average_rating: null,
    max_team_average_rating: null,
    min_team_total_rating: null,
    max_team_total_rating: null,
    allowed_rank_tiers: [],
  }
}

/** `v ?? null`, but only for finite numbers — the JSONB is untyped. */
function num(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null
}

/** Read rules from a typed `eligibility_restrictions` response object. */
export function rulesFromResponse(r: WireRestrictions | null | undefined): EligibilityRules {
  const source = (r ?? {}) as Record<string, unknown>
  const rules = emptyRules()
  for (const key of [...PLAYER_RULE_KEYS, ...TEAM_RULE_KEYS]) {
    rules[key] = num(source[key])
  }
  if (Array.isArray(source.allowed_rank_tiers)) {
    rules.allowed_rank_tiers = source.allowed_rank_tiers.filter(
      (t): t is string => typeof t === 'string',
    )
  }
  return rules
}

/** Read rules from a league/tournament `settings` JSONB (`settings.eligibility`). */
export function rulesFromSettings(settings: unknown): EligibilityRules {
  const s = (settings && typeof settings === 'object' ? settings : {}) as Record<string, unknown>
  return rulesFromResponse((s.eligibility ?? null) as WireRestrictions | null)
}

/** Whether any rule is set. `0` counts as set (`!= null`, not falsiness). */
export function hasAnyRules(rules: EligibilityRules): boolean {
  return activeRuleCount(rules) > 0
}

export function activeRuleCount(rules: EligibilityRules): number {
  const numeric = [...PLAYER_RULE_KEYS, ...TEAM_RULE_KEYS].filter((k) => rules[k] != null).length
  return numeric + (rules.allowed_rank_tiers.length > 0 ? 1 : 0)
}

/**
 * Build the request payload: only set rules, `undefined` when there are
 * none (so callers can omit the field entirely).
 */
export function buildEligibilityPayload(
  rules: EligibilityRules,
): components['schemas']['EligibilityRestrictionsInput'] | undefined {
  const payload: Record<string, number | string[]> = {}
  for (const key of [...PLAYER_RULE_KEYS, ...TEAM_RULE_KEYS]) {
    const value = rules[key]
    if (value != null) payload[key] = value
  }
  if (rules.allowed_rank_tiers.length > 0) {
    payload.allowed_rank_tiers = rules.allowed_rank_tiers
  }
  return Object.keys(payload).length > 0
    ? (payload as components['schemas']['EligibilityRestrictionsInput'])
    : undefined
}

export interface RuleDescriptor {
  key: RuleKey | 'allowed_rank_tiers'
  /** 'player' rules bind each member; 'team' rules bind the roster aggregate. */
  kind: 'player' | 'team'
  /** Compact chip text, e.g. "Rating ≥ 12,000". */
  text: string
  icon: string
  value: number
}

const RULE_PRESENTATION: Record<RuleKey, { kind: 'player' | 'team'; icon: string; format: (v: string) => string }> = {
  min_rating_per_player: { kind: 'player', icon: 'mdi-chevron-double-up', format: (v) => `Rating ≥ ${v}` },
  max_rating_per_player: { kind: 'player', icon: 'mdi-chevron-double-down', format: (v) => `Rating ≤ ${v}` },
  max_peak_rating_per_player: { kind: 'player', icon: 'mdi-summit', format: (v) => `Peak rating ≤ ${v}` },
  max_avg_rating_per_player: { kind: 'player', icon: 'mdi-chart-line', format: (v) => `Average rating ≤ ${v}` },
  min_matches_played: { kind: 'player', icon: 'mdi-counter', format: (v) => `≥ ${v} matches played` },
  min_team_average_rating: { kind: 'team', icon: 'mdi-account-group', format: (v) => `Team avg rating ≥ ${v}` },
  max_team_average_rating: { kind: 'team', icon: 'mdi-account-group', format: (v) => `Team avg rating ≤ ${v}` },
  min_team_total_rating: { kind: 'team', icon: 'mdi-sigma', format: (v) => `Team total rating ≥ ${v}` },
  max_team_total_rating: { kind: 'team', icon: 'mdi-sigma', format: (v) => `Team total rating ≤ ${v}` },
}

/** Set rules as ordered display descriptors (player rules first). */
export function describeRules(rules: EligibilityRules): RuleDescriptor[] {
  const descriptors: RuleDescriptor[] = []
  for (const key of [...PLAYER_RULE_KEYS, ...TEAM_RULE_KEYS]) {
    const value = rules[key]
    if (value == null) continue
    const { kind, icon, format } = RULE_PRESENTATION[key]
    descriptors.push({ key, kind, icon, value, text: format(value.toLocaleString()) })
  }
  if (rules.allowed_rank_tiers.length > 0) {
    descriptors.push({
      key: 'allowed_rank_tiers',
      kind: 'player',
      icon: 'mdi-medal',
      value: rules.allowed_rank_tiers.length,
      text: `Ranks: ${rules.allowed_rank_tiers.join(', ')}`,
    })
  }
  return descriptors
}

/**
 * Editor-side validation: every min/max pair must be satisfiable. Returns
 * error messages keyed by the *min* field of the offending pair. Mirrors the
 * backend's struct-level `unsatisfiable_bounds` check so admins hear about
 * it while typing, not from a 400.
 */
export function ruleBoundErrors(rules: EligibilityRules): Partial<Record<RuleKey, string>> {
  const errors: Partial<Record<RuleKey, string>> = {}
  const pairs: Array<[RuleKey, RuleKey, string]> = [
    ['min_rating_per_player', 'max_rating_per_player', 'Minimum exceeds maximum rating'],
    ['min_team_average_rating', 'max_team_average_rating', 'Minimum exceeds maximum team average'],
    ['min_team_total_rating', 'max_team_total_rating', 'Minimum exceeds maximum team total'],
  ]
  for (const [minKey, maxKey, message] of pairs) {
    const min = rules[minKey]
    const max = rules[maxKey]
    if (min != null && max != null && min > max) errors[minKey] = message
  }
  return errors
}
