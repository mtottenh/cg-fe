/**
 * Display name for a raw map id.
 *
 * Map ids are the game's own identifiers (`de_dust2`). The catalog carries a
 * proper `display_name`, so prefer that when you have it; this is the
 * fallback for places that only hold an id (a tournament pool is a list of
 * ids, not full map objects).
 */
export function formatMapName(mapId: string): string {
  const match = /^[a-z]{2,3}_([a-z0-9_]+)$/i.exec(mapId)
  if (!match?.[1]) return mapId
  return match[1]
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}
