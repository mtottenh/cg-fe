import type { components } from '@/api/types'

type CreateAwardRequest = components['schemas']['CreateAwardRequest']
type StatCatalogEntryResponse = components['schemas']['StatCatalogEntryResponse']

/** Aggregation options for the award builder. */
export const AGGREGATION_OPTIONS = [
  { title: 'Total (sum across demos)', value: 'sum' },
  { title: 'Best single demo', value: 'max_single_demo' },
  { title: 'Average per demo', value: 'avg_per_demo' },
] as const

/** Direction options for the award builder. */
export const DIRECTION_OPTIONS = [
  { title: 'Highest wins', value: 'desc' },
  { title: 'Lowest wins', value: 'asc' },
] as const

/** Curated mdi icons for the award icon picker. */
export const AWARD_ICONS = [
  'mdi-trophy',
  'mdi-medal',
  'mdi-crown',
  'mdi-star',
  'mdi-fire',
  'mdi-flash',
  'mdi-head-flash',
  'mdi-pistol',
  'mdi-spray',
  'mdi-knife-military',
  'mdi-bomb',
  'mdi-bomb-off',
  'mdi-eye-off',
  'mdi-wall',
  'mdi-shield-star',
  'mdi-skull',
] as const

/** Curated accent colors for the award color picker. */
export const AWARD_COLORS = [
  '#E53935',
  '#8E24AA',
  '#5E35B1',
  '#1E88E5',
  '#00897B',
  '#43A047',
  '#FDD835',
  '#FB8C00',
  '#6D4C41',
  '#546E7A',
] as const

/**
 * Normalize a free-text weapon name into the CS2 weapon-kill stat key,
 * e.g. "MAG 7" -> `kills.weapon.mag7`, "ak-47" -> `kills.weapon.ak47`.
 */
export function weaponStatKey(weaponName: string): string {
  const slug = weaponName
    .trim()
    .toLowerCase()
    .replace(/[\s-]+/g, '')
    .replace(/[^a-z0-9_]/g, '')
  return `kills.weapon.${slug}`
}

/** Form model for the custom-award builder dialog. */
export interface CustomAwardForm {
  name: string
  description?: string | null
  icon?: string | null
  color?: string | null
  /** Stat key selected from the game's stat catalog. */
  statKey?: string | null
  /** Free-text weapon name; when set, wins over `statKey` as `kills.weapon.{name}`. */
  weaponName?: string | null
  aggregation?: string | null
  direction?: string | null
  minMatches?: number | null
}

/**
 * Build the CreateAwardRequest payload for a custom award.
 *
 * The free-text weapon entry takes precedence over the catalog stat select:
 * a non-empty weapon name produces a `kills.weapon.{name}` stat key.
 */
export function buildCustomAwardPayload(form: CustomAwardForm): CreateAwardRequest {
  const weapon = form.weaponName?.trim()
  const statKey = weapon ? weaponStatKey(weapon) : (form.statKey ?? null)
  return {
    name: form.name.trim(),
    description: form.description?.trim() || null,
    icon: form.icon || null,
    color: form.color || null,
    stat_key: statKey,
    aggregation: form.aggregation || null,
    direction: form.direction || null,
    min_qualifier_type: form.minMatches != null && form.minMatches > 0 ? 'matches' : null,
    min_qualifier_value: form.minMatches != null && form.minMatches > 0 ? form.minMatches : null,
  }
}

/** Build the CreateAwardRequest payload for a template-based award. */
export function buildTemplateAwardPayload(templateKey: string): CreateAwardRequest {
  return { template_key: templateKey }
}

/**
 * Stat-catalog entries as grouped select items (subheader per category),
 * for Vuetify selects: `[{ category, entries }, ...]` sorted by category.
 */
export function groupCatalogByCategory(
  entries: StatCatalogEntryResponse[],
): Array<{ category: string; entries: StatCatalogEntryResponse[] }> {
  const groups = new Map<string, StatCatalogEntryResponse[]>()
  for (const entry of entries) {
    const list = groups.get(entry.category)
    if (list) list.push(entry)
    else groups.set(entry.category, [entry])
  }
  return [...groups.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([category, list]) => ({
      category,
      entries: [...list].sort((a, b) => a.label.localeCompare(b.label)),
    }))
}

/**
 * The set of ranks that appear more than once (competition-ranking ties).
 * Used to render "shared" markers on podiums and standings tables.
 */
export function sharedRanks(entries: Array<{ rank: number }>): Set<number> {
  const counts = new Map<number, number>()
  for (const e of entries) counts.set(e.rank, (counts.get(e.rank) ?? 0) + 1)
  return new Set([...counts.entries()].filter(([, n]) => n > 1).map(([rank]) => rank))
}

/** Format an aggregated stat value: integers plain, ratios to 2 decimals. */
export function formatAwardValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2)
}

/** Medal color for a podium rank (1-3), or null for the rest of the field. */
export function medalColor(rank: number): string | null {
  switch (rank) {
    case 1:
      return '#FFC107'
    case 2:
      return '#9E9E9E'
    case 3:
      return '#CD7F32'
    default:
      return null
  }
}
