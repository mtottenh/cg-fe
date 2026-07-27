import { ref, reactive, computed, watch, type Ref } from 'vue'
import {
  emptyRules,
  rulesFromResponse,
  buildEligibilityPayload,
  type EligibilityRules,
} from '@/composables/useEligibilityRules'
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
  // Format configuration (persisted in format_settings JSONB)
  final_format: string | null
  grand_final_format: string | null
  group_count: number | null
  advance_per_group: number | null
  group_format: string
  playoff_format: string
  group_match_format: string | null
  playoff_match_format: string | null
  playoff_final_format: string | null
  playoff_grand_final_format: string | null
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
    final_format: null,
    grand_final_format: null,
    group_count: null,
    advance_per_group: null,
    group_format: 'round_robin',
    playoff_format: 'single_elimination',
    group_match_format: null,
    playoff_match_format: null,
    playoff_final_format: null,
    playoff_grand_final_format: null,
    timezone_hint: '',
  }
}

/**
 * The format_settings keys this form owns. Everything else in the JSONB
 * (e.g. swiss max_rounds) is preserved untouched by the patch builders.
 */
const MANAGED_FORMAT_SETTINGS_KEYS = [
  'final_format',
  'grand_final_format',
  'group_count',
  'advance_per_group',
  'group_format',
  'playoff_format',
  'group_match_format',
  'playoff_match_format',
  'playoff_final_format',
  'playoff_grand_final_format',
] as const

function readFormatSettings(t: TournamentResponse): Partial<TournamentFormState> {
  const raw = t.format_settings
  if (!raw || typeof raw !== 'object') return {}
  const fs = raw as Record<string, unknown>
  const str = (k: string) => (typeof fs[k] === 'string' ? (fs[k] as string) : null)
  const num = (k: string) => (typeof fs[k] === 'number' ? (fs[k] as number) : null)
  return {
    final_format: str('final_format'),
    grand_final_format: str('grand_final_format'),
    group_count: num('group_count'),
    advance_per_group: num('advance_per_group'),
    group_format: str('group_format') ?? 'round_robin',
    playoff_format: str('playoff_format') ?? 'single_elimination',
    group_match_format: str('group_match_format'),
    playoff_match_format: str('playoff_match_format'),
    playoff_final_format: str('playoff_final_format'),
    playoff_grand_final_format: str('playoff_grand_final_format'),
  }
}

/**
 * Extract `side_selection_mode` from a tournament's `settings` JSONB, with
 * a legacy fallback to the top-level field in case older rows still carry it.
 *
 * `settings` is now in the generated spec (untyped JSON value), so only its
 * inner shape needs a local type.
 */
function readSideSelectionMode(t: TournamentResponse): string {
  const settings = (t.settings ?? undefined) as TournamentSettings | undefined
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
    format: t.format,
    ...readFormatSettings(t),
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
  /** Required for edit mode — the tournament being edited. Ignored in create mode.
   * Read-only: a ComputedRef is fine. */
  initial?: Readonly<Ref<TournamentResponse | null | undefined>>
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

  /** Entry requirements — separate from the flat form state (nine fields
   * with their own editor component). */
  const eligibilityRules = ref<EligibilityRules>(emptyRules())

  /** Snapshot for change detection in edit mode. */
  const originalForm = ref<TournamentFormState | null>(null)
  const originalEligibility = ref<EligibilityRules | null>(null)

  // Keep the form in sync with the tournament being edited.
  if (mode === 'edit' && opts.initial) {
    watch(opts.initial, (t) => {
      if (!t) return
      Object.assign(form, fromTournament(t))
      originalForm.value = { ...form }
      eligibilityRules.value = rulesFromResponse(
        (t as { eligibility_restrictions?: unknown }).eligibility_restrictions as never,
      )
      originalEligibility.value = { ...eligibilityRules.value }
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
  // The backend freezes eligibility once registration opens (changing the
  // rules under registered players would strand them).
  const canEditEligibility = computed(() =>
    mode === 'create' || (status.value !== null && ['draft', 'published'].includes(status.value))
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
    const eligibilityChanged =
      JSON.stringify(eligibilityRules.value) !== JSON.stringify(originalEligibility.value)
    return formChanged || eligibilityChanged || gameDetailBundle.mapPoolChangedFromOriginal.value
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
    eligibilityRules.value = emptyRules()
    originalEligibility.value = null
  }

  // --- Payload builders ---

  /**
   * The format-configuration keys implied by the current form state, keyed by
   * the selected tournament format. Single/double elim carry only the final
   * override; groups+playoffs carries the whole groups config including
   * per-phase best-of. Returns null when there is nothing to say.
   */
  function buildFormatSettings(): Record<string, unknown> | null {
    const s: Record<string, unknown> = {}
    if (form.format === 'groups_and_playoffs') {
      if (form.group_count) s.group_count = form.group_count
      if (form.advance_per_group) s.advance_per_group = form.advance_per_group
      s.group_format = form.group_format
      s.playoff_format = form.playoff_format
      if (form.group_match_format) s.group_match_format = form.group_match_format
      if (form.playoff_match_format) s.playoff_match_format = form.playoff_match_format
      if (form.playoff_final_format) s.playoff_final_format = form.playoff_final_format
      if (form.playoff_format === 'double_elimination' && form.playoff_grand_final_format) {
        s.playoff_grand_final_format = form.playoff_grand_final_format
      }
    } else if (form.format === 'single_elimination' && form.final_format) {
      s.final_format = form.final_format
    } else if (form.format === 'double_elimination' && form.grand_final_format) {
      s.grand_final_format = form.grand_final_format
    }
    return Object.keys(s).length > 0 ? s : null
  }

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
      // Required by the API: the tournament's map pool, a subset of the
      // game's global pool. Pre-seeded from the game default by
      // useTournamentGameDetail, so the common case is "keep the defaults".
      // Previously this was a best-effort PUT after create, which silently
      // left tournaments with no pool whenever the default was kept.
      map_pool: gameDetailBundle.selectedMapIds.value,
      eligibility_restrictions: buildEligibilityPayload(eligibilityRules.value),
      format_settings: buildFormatSettings() ?? undefined,
      settings: {
        side_selection_mode: form.side_selection_mode,
      },
    } as CreateTournamentRequest
  }

  /** A tournament cannot be created without at least one map. */
  const mapPoolValid = computed(() => gameDetailBundle.selectedMapIds.value.length > 0)

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

    // Merge over the stored settings object — this patch used to send only
    // {side_selection_mode}, silently erasing any other settings keys (e.g.
    // eligibility restrictions) on every save.
    const storedSettings =
      t.settings && typeof t.settings === 'object'
        ? { ...(t.settings as Record<string, unknown>) }
        : {}
    patch.settings = { ...storedSettings, side_selection_mode: form.side_selection_mode }

    // Eligibility: only when changed. Clearing every rule sends an explicit
    // eligibility:null (the backend's settings merge removes the key);
    // sending nothing would leave the old rules in place.
    if (
      originalEligibility.value
      && JSON.stringify(eligibilityRules.value) !== JSON.stringify(originalEligibility.value)
    ) {
      const payload = buildEligibilityPayload(eligibilityRules.value)
      if (payload) {
        patch.eligibility_restrictions = payload
      } else {
        patch.settings = {
          ...(patch.settings as Record<string, unknown>),
          eligibility: null,
        }
      }
    }

    // Same merge discipline for format_settings: replace the keys this form
    // owns, preserve foreign ones (swiss max_rounds etc.).
    const storedFormatSettings =
      t.format_settings && typeof t.format_settings === 'object'
        ? { ...(t.format_settings as Record<string, unknown>) }
        : {}
    for (const key of MANAGED_FORMAT_SETTINGS_KEYS) delete storedFormatSettings[key]
    patch.format_settings = { ...storedFormatSettings, ...(buildFormatSettings() ?? {}) }

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
    canEditEligibility,
    hasChanges,
    eligibilityRules,
    generateSlug,
    reset,
    buildCreatePayload,
    buildUpdatePatch,
    // Map pool / game detail passthrough
    gameDetail: gameDetailBundle.gameDetail,
    loadingGameDetail: gameDetailBundle.loadingGameDetail,
    gameDetailError: gameDetailBundle.gameDetailError,
    vetoFormatOptions: gameDetailBundle.vetoFormatOptions,
    selectedVetoDescription: gameDetailBundle.selectedVetoDescription,
    selectedMapIds: gameDetailBundle.selectedMapIds,
    mapPoolValid,
    gameDefaultPoolIds: gameDetailBundle.gameDefaultPoolIds,
    mapPoolIsCustom: gameDetailBundle.mapPoolIsCustom,
    mapPoolChangedFromOriginal: gameDetailBundle.mapPoolChangedFromOriginal,
    sideSelectionModeOptions: gameDetailBundle.sideSelectionModeOptions,
  }
}
