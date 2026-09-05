import { computed, ref, watch } from 'vue'
import { api } from '@/api'
import type { components } from '@/api/types'
import { useAuthStore } from '@/stores/auth'
import { useLeaguesStore } from '@/stores/leagues'
import { pickCurrentSeason } from '@/utils/seasons'

type LeagueSeasonResponse = components['schemas']['LeagueSeasonResponse']

/** The league pinned in the sidebar, with the season it is currently running. */
export interface MyLeagueContext {
  id: string
  name: string
  seasonId: string | null
  seasonName: string | null
  seasonStatus: string | null
  teamsCount: number | null
  tournamentsCount: number | null
}

const STORAGE_KEY = 'my_league_id'

const context = ref<MyLeagueContext | null>(null)
const loading = ref(false)
let loadedFor: string | null = null
/** Which player's memberships have been fetched; null until the first fetch. */
let membershipsFetchedFor: string | null = null

/**
 * "Your league" for the sidebar: the league the player is a member of, its
 * current season and what is inside it. Membership, not location — it does
 * not change as the player moves around the site. A player in more than one
 * league picks which one is pinned; the choice is remembered per browser.
 *
 * Reads straight from the API rather than the league/season stores so that
 * viewing some other league's page never repoints the pinned box.
 */
export function useMyLeague() {
  const authStore = useAuthStore()
  const leaguesStore = useLeaguesStore()

  const memberships = computed(() =>
    leaguesStore.myLeagues.filter(m => m.league_status === 'active'),
  )

  function preferredId(): string | null {
    let stored: string | null = null
    try { stored = localStorage.getItem(STORAGE_KEY) } catch { /* storage unavailable */ }
    const ids = memberships.value.map(m => m.league_id)
    if (stored && ids.includes(stored)) return stored
    return ids[0] ?? null
  }

  async function load(leagueId: string) {
    loading.value = true
    try {
      const { data: leagueRes } = await api.GET('/v1/leagues/{league_id}', { params: { path: { league_id: leagueId } } })
      const league = leagueRes?.data
      if (!league) { context.value = null; return }
      const { data: seasonsRes } = await api.GET('/v1/league-seasons', { params: { query: { league_id: leagueId } } })
      const seasons: LeagueSeasonResponse[] = (seasonsRes?.data ?? []).filter(s => s.status !== 'draft')
      const season = pickCurrentSeason(seasons, league.current_season_id)
      let teamsCount: number | null = null
      let tournamentsCount: number | null = null
      if (season) {
        const [teams, tournaments] = await Promise.all([
          api.GET('/v1/league-seasons/{season_id}/teams', { params: { path: { season_id: season.id }, query: { per_page: 100 } } }).catch(() => null),
          api.GET('/v1/tournaments', { params: { query: { league_id: leagueId, per_page: 50 } } }).catch(() => null),
        ])
        teamsCount = teams?.data?.data?.length ?? null
        tournamentsCount = tournaments?.data?.data?.filter(t => !t.season_id || t.season_id === season.id).length ?? null
      }
      context.value = {
        id: league.id,
        name: league.name,
        seasonId: season?.id ?? null,
        seasonName: season?.name ?? null,
        seasonStatus: season?.status ?? null,
        teamsCount,
        tournamentsCount,
      }
      loadedFor = leagueId
    } catch {
      context.value = null
    } finally {
      loading.value = false
    }
  }

  async function refresh() {
    if (!authStore.isAuthenticated || !authStore.playerId) {
      context.value = null; loadedFor = null; membershipsFetchedFor = null
      return
    }
    // Fetch memberships once per player. Refetching whenever the list is
    // empty looped for a player in no league: every fetch stored a new empty
    // array, the watcher below fired on it, and refresh ran again — about a
    // thousand requests a second.
    if (membershipsFetchedFor !== authStore.playerId) {
      membershipsFetchedFor = authStore.playerId
      await leaguesStore.fetchMyLeagues().catch(() => { membershipsFetchedFor = null })
    }
    const id = preferredId()
    if (!id) { context.value = null; loadedFor = null; return }
    if (id !== loadedFor || !context.value) await load(id)
  }

  function selectLeague(leagueId: string) {
    try { localStorage.setItem(STORAGE_KEY, leagueId) } catch { /* storage unavailable */ }
    void load(leagueId)
  }

  // React to the membership *set* changing (joined or left a league), not to
  // the store handing back a fresh array with the same contents.
  watch(
    () => memberships.value.map(m => m.league_id).join(','),
    () => { void refresh() },
  )

  return { myLeague: context, memberships, loading, refresh, selectLeague }
}
