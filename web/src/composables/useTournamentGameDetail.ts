import { ref, computed, watch, type Ref } from 'vue'
import { useGamesStore, type GameDetail } from '@/stores/games'
import { useTournamentsStore } from '@/stores/tournaments'

export interface VetoFormatOption {
  title: string
  value: string
  description: string
}

/**
 * Side-selection mode options — shared across TournamentCreateModal +
 * TournamentEditModal so the list doesn't drift.
 */
export const SIDE_SELECTION_MODE_OPTIONS = [
  { title: 'Picker Chooses Side', value: 'picker_choice' },
  { title: 'Coin Flip for Sides', value: 'coin_flip' },
  { title: 'Knife Round (In-Game)', value: 'knife' },
] as const

export interface UseTournamentGameDetailOptions {
  /** Reactive game id. When non-empty, the composable fetches the game detail. */
  gameId: Ref<string | null | undefined>
  /** Optional tournament id — when present, loads that tournament's saved map pool. */
  tournamentId?: Ref<string | undefined | null>
  /** Reactive veto-format id the form is currently using — drives `selectedVetoDescription`. */
  selectedVetoFormatId?: Ref<string | null | undefined>
}

/**
 * Tournament create/edit modals both need to: (a) fetch the game's detail to
 * populate the veto-format select and map catalog, (b) track the tournament's
 * map pool vs the game's default pool, (c) detect "has the user customized the
 * pool" to decide whether to PATCH it on save.
 *
 * This composable owns that state + watchers so the two modals don't
 * duplicate ~80 LOC of the same logic.
 */
export function useTournamentGameDetail(opts: UseTournamentGameDetailOptions) {
  const gamesStore = useGamesStore()
  const tournamentsStore = useTournamentsStore()

  const gameDetail = ref<GameDetail | null>(null)
  const loadingGameDetail = ref(false)

  const selectedMapIds = ref<string[]>([])
  const gameDefaultPoolIds = ref<string[]>([])
  const originalMapPoolIds = ref<string[]>([])

  const vetoFormatOptions = computed<VetoFormatOption[]>(() => {
    if (!gameDetail.value) return []
    return gameDetail.value.map_pick_ban_formats.map((f) => ({
      title: f.display_name,
      value: f.id,
      description: f.description,
    }))
  })

  const selectedVetoDescription = computed<string | null>(() => {
    const id = opts.selectedVetoFormatId?.value
    if (!id || !gameDetail.value) return null
    const fmt = gameDetail.value.map_pick_ban_formats.find((f) => f.id === id)
    return fmt?.description ?? null
  })

  const mapPoolIsCustom = computed(() => {
    const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
    return sorted(selectedMapIds.value) !== sorted(gameDefaultPoolIds.value)
  })

  /** Whether the saved pool differs from the current in-memory pool — useful for edit modals. */
  const mapPoolChangedFromOriginal = computed(() => {
    const sorted = (ids: string[]) => JSON.stringify([...ids].sort())
    return sorted(selectedMapIds.value) !== sorted(originalMapPoolIds.value)
  })

  function resetPool() {
    gameDetail.value = null
    selectedMapIds.value = []
    gameDefaultPoolIds.value = []
    originalMapPoolIds.value = []
  }

  async function loadForGame(gameId: string, tournamentId?: string | null) {
    loadingGameDetail.value = true
    try {
      const detailP = gamesStore.fetchGame(gameId)
      const poolP = tournamentId
        ? tournamentsStore.getTournamentMapPool(tournamentId).catch(() => null)
        : Promise.resolve(null)
      const [gd, poolResult] = await Promise.all([detailP, poolP])
      gameDetail.value = gd
      gameDefaultPoolIds.value = gd?.map_pool ?? []

      if (poolResult && poolResult.source === 'tournament') {
        selectedMapIds.value = [...poolResult.maps]
        originalMapPoolIds.value = [...poolResult.maps]
      } else {
        selectedMapIds.value = [...gameDefaultPoolIds.value]
        originalMapPoolIds.value = [...gameDefaultPoolIds.value]
      }
    } catch {
      // Non-critical — the veto-format select just stays empty.
    } finally {
      loadingGameDetail.value = false
    }
  }

  // Auto-fetch whenever the game id changes.
  watch(
    () => opts.gameId.value,
    async (gameId) => {
      resetPool()
      if (gameId) {
        await loadForGame(gameId, opts.tournamentId?.value ?? null)
      }
    },
    { immediate: true },
  )

  return {
    gameDetail,
    loadingGameDetail,
    vetoFormatOptions,
    selectedVetoDescription,
    selectedMapIds,
    gameDefaultPoolIds,
    originalMapPoolIds,
    mapPoolIsCustom,
    mapPoolChangedFromOriginal,
    sideSelectionModeOptions: SIDE_SELECTION_MODE_OPTIONS,
    resetPool,
    loadForGame,
  }
}
