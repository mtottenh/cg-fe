import { ref, reactive, computed, watch, type Ref } from 'vue'
import type {
  TournamentResponse,
  CreateTournamentRequest,
  UpdateTournamentRequest,
} from '@/stores/tournaments'
import type { TournamentSettings } from '@/api/overrides'
import { formatDateTimeForApi, formatDateTimeForInput } from '@/utils/formatters'
import { useTournamentGameDetail } from '@/composables/useTournamentGameDetail'

export type TournamentFormMode = 'create' | 'edit'

/**
 * Union-shaped form state. Create mode uses the create-only fields
 * (game_id/league_id/season_id/format/participant_type/team_size/
 * registration_type/scheduling_mode); edit mode uses `timezone_hint`.
 * Fields not used in a given mode stay at their defaults.
 */
export interface TournamentFormState {
  // Shared
  name: string
  slug: string
  description: string
  min_participants: number
  max_participants: number
  withdrawal_policy: string
  default_match_format: string
  default_map_veto_format: string | null
  side_selection_mode: string
  registration_start: string
  registration_end: string
  starts_at: string
  check_in_required: boolean
  check_in_start: string
  check_in_end: string
  rules_url: string
  // Create-only
  game_id: string
  league_id: string | null
  season_id: string | null
  format: string
  participant_type: string
  team_size: number
  registration_type: string
  scheduling_mode: string
  // Edit-only
  timezone_hint: string
}

function defaultFormState(): TournamentFormState {
  return {
    name: '',
    slug: '',
    description: '',
    min_participants: 4,
    max_participants: 16,
    withdrawal_policy: 'forfeit',
    default_match_format: 'bo3',
    default_map_veto_format: null,
    side_selection_mode: 'picker_choice',
    registration_start: '',
    registration_end: '',
    starts_at: '',
    check_in_required: false,
    check_in_start: '',
    check_in_end: '',
    rules_url: '',
    game_id: '',
    league_id: null,
    season_id: null,
    format: 'single_elimination',
    participant_type: 'individual',
    team_size: 5,
    registration_type: 'open',
    scheduling_mode: 'live',
    timezone_hint: '',
  }
}

/**
 * Extract `side_selection_mode` from a tournament's `settings` JSONB, with
 * a legacy fallback to the top-level field in case older rows still carry it.
 *
 * Casts through `unknown` because `TournamentResponse`'s generated OpenAPI type
 * doesn't yet surface `settings` (see `api/overrides.ts` — pending spec fix).
 */
function readSideSelectionMode(t: TournamentResponse): string {
  const settings = (t as unknown as { settings?: TournamentSettings }).settings
  return (
    settings?.side_selection_mode
    ?? (t as unknown as { side_selection_mode?: string }).side_selection_mode
    ?? 'picker_choice'
  )
}

function fromTournament(t: TournamentResponse): TournamentFormState {
  const base = defaultFormState()
  return {
    ...base,
    name: t.name,
    slug: t.slug,
    description: t.description || '',
    min_participants: t.min_participants,
    max_participants: t.max_participants,
    withdrawal_policy: t.withdrawal_policy,
    default_match_format: t.default_match_format,
    default_map_veto_format: t.default_map_veto_format ?? null,
    side_selection_mode: readSideSelectionMode(t),
    registration_start: formatDateTimeForInput(t.registration_start),
    registration_end: formatDateTimeForInput(t.registration_end),
    starts_at: formatDateTimeForInput(t.starts_at),
    timezone_hint: t.timezone_hint || '',
    check_in_required: t.check_in_required,
    check_in_start: formatDateTimeForInput(t.check_in_start),
    check_in_end: formatDateTimeForInput(t.check_in_end),
    rules_url: t.rules_url || '',
  }
}

export interface UseTournamentFormOptions {
  mode: TournamentFormMode
  /** Required for edit mode — the tournament being edited. Ignored in create mode. */
  initial?: Ref<TournamentResponse | null>
}

/**
 * Unified tournament form state + change tracking + payload builders for both
 * create and edit flows. Owns:
 *
 * - Form state (reactive).
 * - `canEdit*` guards (create mode → always true; edit mode → based on status).
 * - `hasChanges` for the edit modal's "Save" button enablement.
 * - Game-detail + map-pool (delegated to `useTournamentGameDetail`).
 * - `buildCreatePayload()` / `buildUpdatePatch()` that produce typed API bodies.
 *
 * Keeps TournamentForm.vue + both modal wrappers thin.
 */
export function useTournamentForm(opts: UseTournamentFormOptions) {
  const { mode } = opts
  const form = reactive<TournamentFormState>(defaultFormState())
  const formRef = ref()
  const formValid = ref(false)

  /** Snapshot for change detection in edit mode. */
  const originalForm = ref<TournamentFormState | null>(null)

  // Keep the form in sync with the tournament being edited.
  if (mode === 'edit' && opts.initial) {
    watch(opts.initial, (t) => {
      if (!t) return
      Object.assign(form, fromTournament(t))
      originalForm.value = { ...form }
    }, { immediate: true })
  }

  // --- Status-based edit gating ---
  const status = computed(() => opts.initial?.value?.status ?? null)

  const canEditSlug = computed(() =>
    mode === 'create' || (status.value !== null && ['draft', 'published'].includes(status.value))
  )
  const canEditParticipants = computed(() =>
    mode === 'create'
    || (status.value !== null && ['draft', 'published', 'registration_open', 'registration_closed'].includes(status.value))
  )
  const canEditRegistrationDates = computed(() =>
    mode === 'create' || (status.value !== null && ['draft', 'published'].includes(status.value))
  )
  const canEditStartDate = computed(() =>
    mode === 'create'
    || (status.value !== null && ['draft', 'published', 'registration_open', 'registration_closed', 'ready'].includes(status.value))
  )

  // --- Game detail + map pool (shared composable) ---
  // In create mode, gameId flows from the form; in edit, from the tournament.
  const gameIdRef = computed(() =>
    mode === 'edit'
      ? (opts.initial?.value?.game_id ?? null)
      : form.game_id || null,
  )
  const tournamentIdRef = computed(() =>
    mode === 'edit' ? (opts.initial?.value?.id ?? null) : null,
  )
  const vetoFormatIdRef = computed(() => form.default_map_veto_format)

  const gameDetailBundle = useTournamentGameDetail({
    gameId: gameIdRef,
    tournamentId: tournamentIdRef,
    selectedVetoFormatId: vetoFormatIdRef,
  })

  // --- Change detection (edit mode) ---
  const hasChanges = computed(() => {
    if (mode === 'create') return true
    if (!originalForm.value) return false
    const formChanged = JSON.stringify(form) !== JSON.stringify(originalForm.value)
    return formChanged || gameDetailBundle.mapPoolChangedFromOriginal.value
  })

  // --- Slug auto-generation (create mode) ---
  function generateSlug() {
    if (mode !== 'create' || !form.name) return
    form.slug = form.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }

  // --- Reset (e.g. on create-modal close) ---
  function reset() {
    Object.assign(form, defaultFormState())
    originalForm.value = null
  }

  // --- Payload builders ---

  function buildCreatePayload(): CreateTournamentRequest {
    return {
      game_id: form.game_id,
      league_id: form.league_id || undefined,
      season_id: form.season_id || undefined,
      name: form.name,
      slug: form.slug,
      description: form.description || null,
      format: form.format,
      participant_type: form.participant_type,
      team_size: form.participant_type === 'team' ? form.team_size : null,
      min_participants: form.min_participants,
      max_participants: form.max_participants,
      registration_type: form.registration_type,
      withdrawal_policy: form.withdrawal_policy,
      default_match_format: form.default_match_format,
      default_map_veto_format: form.default_map_veto_format || null,
      scheduling_mode: form.scheduling_mode,
      registration_start: formatDateTimeForApi(form.registration_start),
      registration_end: formatDateTimeForApi(form.registration_end),
      starts_at: formatDateTimeForApi(form.starts_at),
      check_in_required: form.check_in_required,
      check_in_start: form.check_in_required ? formatDateTimeForApi(form.check_in_start) : null,
      check_in_end: form.check_in_required ? formatDateTimeForApi(form.check_in_end) : null,
      rules_url: form.rules_url || null,
      settings: {
        side_selection_mode: form.side_selection_mode,
      },
    } as CreateTournamentRequest
  }

  /**
   * Only-changed-fields PATCH body. Matches the previous TournamentEditModal
   * behavior: diff-guard the stable fields (name/slug/description/participant
   * bounds/withdrawal/match format/veto format/check_in_required); always send
   * dates + rules_url + settings + timezone_hint.
   */
  function buildUpdatePatch(): UpdateTournamentRequest {
    const t = opts.initial?.value
    if (!t) return {} as UpdateTournamentRequest

    const patch: Record<string, unknown> = {}

    if (form.name !== t.name) patch.name = form.name
    if (form.slug !== t.slug) patch.slug = form.slug
    if (form.description !== (t.description || '')) patch.description = form.description
    if (form.min_participants !== t.min_participants) patch.min_participants = form.min_participants
    if (form.max_participants !== t.max_participants) patch.max_participants = form.max_participants
    if (form.withdrawal_policy !== t.withdrawal_policy) patch.withdrawal_policy = form.withdrawal_policy
    if (form.default_match_format !== t.default_match_format) patch.default_match_format = form.default_match_format
    if (form.default_map_veto_format !== (t.default_map_veto_format ?? null)) {
      patch.default_map_veto_format = form.default_map_veto_format || null
    }
    if (form.check_in_required !== t.check_in_required) patch.check_in_required = form.check_in_required

    patch.registration_start = formatDateTimeForApi(form.registration_start)
    patch.registration_end = formatDateTimeForApi(form.registration_end)
    patch.starts_at = formatDateTimeForApi(form.starts_at)
    patch.timezone_hint = form.timezone_hint || undefined
    patch.check_in_start = form.check_in_required ? formatDateTimeForApi(form.check_in_start) : undefined
    patch.check_in_end = form.check_in_required ? formatDateTimeForApi(form.check_in_end) : undefined
    patch.rules_url = form.rules_url || undefined
    patch.settings = { side_selection_mode: form.side_selection_mode }

    return patch as UpdateTournamentRequest
  }

  return {
    mode,
    form,
    formRef,
    formValid,
    originalForm,
    status,
    canEditSlug,
    canEditParticipants,
    canEditRegistrationDates,
    canEditStartDate,
    hasChanges,
    generateSlug,
    reset,
    buildCreatePayload,
    buildUpdatePatch,
    // Map pool / game detail passthrough
    gameDetail: gameDetailBundle.gameDetail,
    loadingGameDetail: gameDetailBundle.loadingGameDetail,
    vetoFormatOptions: gameDetailBundle.vetoFormatOptions,
    selectedVetoDescription: gameDetailBundle.selectedVetoDescription,
    selectedMapIds: gameDetailBundle.selectedMapIds,
    gameDefaultPoolIds: gameDetailBundle.gameDefaultPoolIds,
    mapPoolIsCustom: gameDetailBundle.mapPoolIsCustom,
    mapPoolChangedFromOriginal: gameDetailBundle.mapPoolChangedFromOriginal,
    sideSelectionModeOptions: gameDetailBundle.sideSelectionModeOptions,
  }
}
