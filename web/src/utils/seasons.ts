/**
 * Which season a league is "on" right now.
 *
 * The API stamps `current_season_id` when a league is created and never moves
 * it, so it says "Season 1" for the life of the league. The season a player
 * means is the one being played (active or playoffs), else the one taking
 * sign-ups, else whatever the pointer says, else the most recent finished
 * one. Ties go to the newest season. Drafts never count unless nothing else
 * exists.
 */
export interface SeasonLike {
  id: string
  status: string
  created_at?: string | null
  season_start?: string | null
}

const PLAYING = ['active', 'playoffs']

function newestFirst<T extends SeasonLike>(a: T, b: T): number {
  const ka = a.created_at ?? a.season_start ?? ''
  const kb = b.created_at ?? b.season_start ?? ''
  return kb.localeCompare(ka)
}

export function pickCurrentSeason<T extends SeasonLike>(
  seasons: readonly T[],
  currentSeasonId?: string | null,
): T | null {
  const real = seasons.filter(s => s.status !== 'draft')
  if (real.length === 0) return seasons[0] ?? null
  const inClass = (statuses: string[]) => real.filter(s => statuses.includes(s.status)).sort(newestFirst)[0]
  return (
    inClass(PLAYING) ??
    inClass(['registration']) ??
    (currentSeasonId ? real.find(s => s.id === currentSeasonId) : undefined) ??
    inClass(['completed']) ??
    [...real].sort(newestFirst)[0] ??
    null
  )
}
