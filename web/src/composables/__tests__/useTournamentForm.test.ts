import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { ref, createApp, defineComponent, h, nextTick } from 'vue'
import { setActivePinia, createPinia } from 'pinia'
import { useTournamentForm } from '@/composables/useTournamentForm'
import { useGamesStore } from '@/stores/games'
import { useTournamentsStore, type TournamentResponse } from '@/stores/tournaments'

/** Mount a throwaway component so the composable's watchers/computeds run
 *  under a real component instance. */
function withApp<T>(fn: () => T): { result: T; unmount: () => void } {
  let result!: T
  const Host = defineComponent({
    setup() {
      result = fn()
      return () => h('div')
    },
  })
  const app = createApp(Host)
  app.mount(document.createElement('div'))
  return { result, unmount: () => app.unmount() }
}

function makeTournament(overrides: Partial<TournamentResponse> = {}): TournamentResponse {
  return {
    id: 'tourney-1',
    game_id: 'game-1',
    name: 'Original Name',
    slug: 'original-slug',
    description: 'An original description',
    status: 'draft',
    format: 'single_elimination',
    participant_type: 'team',
    team_size: 5,
    min_participants: 4,
    max_participants: 16,
    registration_type: 'open',
    withdrawal_policy: 'forfeit',
    default_match_format: 'bo3',
    default_map_veto_format: null,
    scheduling_mode: 'self_scheduled',
    registration_start: null,
    registration_end: null,
    starts_at: null,
    check_in_required: false,
    check_in_start: null,
    check_in_end: null,
    rules_url: null,
    timezone_hint: null,
    ...overrides,
  } as TournamentResponse
}

describe('useTournamentForm (create mode)', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    // The composable's internal useTournamentGameDetail watches game_id and
    // calls `fetchGame` + `getTournamentMapPool`. Stub both so tests don't
    // fire real HTTP requests (happy-dom can't reach the backend and would
    // flood teardown with AbortErrors).
    vi.spyOn(useGamesStore(), 'fetchGame').mockResolvedValue({} as ReturnType<typeof useGamesStore>['fetchGame'] extends (...a: never[]) => Promise<infer U> ? U : never)
    vi.spyOn(useTournamentsStore(), 'getTournamentMapPool').mockResolvedValue(null as unknown as ReturnType<typeof useTournamentsStore>['getTournamentMapPool'] extends (...a: never[]) => Promise<infer U> ? U : never)
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  function setup() {
    const { result, unmount } = withApp(() => useTournamentForm({ mode: 'create' }))
    cleanups.push(unmount)
    return result
  }

  it('starts with sensible defaults', () => {
    const f = setup()
    expect(f.form.name).toBe('')
    expect(f.form.slug).toBe('')
    expect(f.form.format).toBe('single_elimination')
    expect(f.form.participant_type).toBe('individual')
    expect(f.form.min_participants).toBe(4)
    expect(f.form.max_participants).toBe(16)
    expect(f.form.scheduling_mode).toBe('live')
  })

  it('canEdit* guards are all true regardless of status', () => {
    const f = setup()
    expect(f.canEditSlug.value).toBe(true)
    expect(f.canEditParticipants.value).toBe(true)
    expect(f.canEditRegistrationDates.value).toBe(true)
    expect(f.canEditStartDate.value).toBe(true)
  })

  it('hasChanges is always true in create mode (drives the Submit button)', () => {
    const f = setup()
    expect(f.hasChanges.value).toBe(true)
  })

  it('generateSlug derives a slug from the name', () => {
    const f = setup()
    f.form.name = '  My Tournament 2026!! ---'
    f.generateSlug()
    expect(f.form.slug).toBe('my-tournament-2026')
  })

  it('generateSlug is a no-op when name is empty', () => {
    const f = setup()
    f.form.slug = 'untouched'
    f.form.name = ''
    f.generateSlug()
    expect(f.form.slug).toBe('untouched')
  })

  it('buildCreatePayload wraps form into a CreateTournamentRequest', () => {
    const f = setup()
    f.form.game_id = 'game-abc'
    f.form.name = 'Spring Cup'
    f.form.slug = 'spring-cup'
    f.form.description = ''
    f.form.format = 'double_elimination'
    f.form.participant_type = 'team'
    f.form.team_size = 6
    f.form.min_participants = 8
    f.form.max_participants = 32
    f.form.registration_type = 'approval'
    f.form.default_match_format = 'bo5'
    f.form.side_selection_mode = 'coin_flip'
    f.form.scheduling_mode = 'hybrid'
    f.form.check_in_required = true
    f.form.check_in_start = '2026-05-10T10:00'
    f.form.check_in_end = '2026-05-10T12:00'

    const payload = f.buildCreatePayload() as Record<string, unknown>

    expect(payload.game_id).toBe('game-abc')
    expect(payload.name).toBe('Spring Cup')
    expect(payload.slug).toBe('spring-cup')
    expect(payload.description).toBeNull()
    expect(payload.format).toBe('double_elimination')
    expect(payload.participant_type).toBe('team')
    expect(payload.team_size).toBe(6)
    expect(payload.min_participants).toBe(8)
    expect(payload.max_participants).toBe(32)
    expect(payload.registration_type).toBe('approval')
    expect(payload.default_match_format).toBe('bo5')
    expect(payload.check_in_required).toBe(true)
    expect(typeof payload.check_in_start).toBe('string')
    expect(typeof payload.check_in_end).toBe('string')
    expect(payload.settings).toEqual({ side_selection_mode: 'coin_flip' })
    // The map pool is REQUIRED by the API and must ship inside the create
    // body. It used to be a best-effort PUT after create that only ran for a
    // customised pool, so keeping the game default left the tournament with
    // no pool at all.
    expect(Array.isArray(payload.map_pool)).toBe(true)
  })

  it('selecting a game seeds the pool from the game default, enabling submission', async () => {
    // Mirrors the real GET /v1/games/{id} shape: a catalog plus the
    // competitive default pool. Selecting a game must populate the tournament
    // pool, otherwise the create button can never enable.
    const cs2Detail = {
      id: 'game-cs2',
      display_name: 'Counter-Strike 2',
      map_pool: ['de_dust2', 'de_mirage', 'de_inferno'],
      maps: [
        { id: 'de_dust2', display_name: 'Dust II' },
        { id: 'de_mirage', display_name: 'Mirage' },
        { id: 'de_inferno', display_name: 'Inferno' },
      ],
      map_pick_ban_formats: [],
    }
    vi.spyOn(useGamesStore(), 'fetchGame').mockResolvedValue(
      cs2Detail as unknown as Awaited<ReturnType<ReturnType<typeof useGamesStore>['fetchGame']>>,
    )

    const f = setup()
    expect(f.mapPoolValid.value).toBe(false)

    f.form.game_id = 'game-cs2'
    await nextTick()
    await new Promise((r) => setTimeout(r, 0))
    await nextTick()

    expect(f.selectedMapIds.value).toEqual(['de_dust2', 'de_mirage', 'de_inferno'])
    expect(f.mapPoolValid.value).toBe(true)
  })

  it('buildCreatePayload carries the selected map pool, and mapPoolValid gates an empty one', () => {
    const f = setup()
    f.form.game_id = 'game-abc'
    f.form.name = 'Pool Cup'
    f.form.slug = 'pool-cup'

    f.selectedMapIds.value = ['de_dust2', 'de_inferno']
    expect(f.mapPoolValid.value).toBe(true)
    expect((f.buildCreatePayload() as Record<string, unknown>).map_pool).toEqual([
      'de_dust2',
      'de_inferno',
    ])

    // An empty pool must block submission rather than create a poolless
    // tournament the result validator would later reject.
    f.selectedMapIds.value = []
    expect(f.mapPoolValid.value).toBe(false)
  })

  it('buildCreatePayload sets team_size=null for individual tournaments', () => {
    const f = setup()
    f.form.game_id = 'g'
    f.form.participant_type = 'individual'
    f.form.team_size = 5
    const payload = f.buildCreatePayload() as Record<string, unknown>
    expect(payload.team_size).toBeNull()
  })

  it('buildCreatePayload nulls check_in_start/end when check_in_required is false', () => {
    const f = setup()
    f.form.game_id = 'g'
    f.form.check_in_required = false
    f.form.check_in_start = '2026-05-10T10:00'
    f.form.check_in_end = '2026-05-10T12:00'
    const payload = f.buildCreatePayload() as Record<string, unknown>
    expect(payload.check_in_start).toBeNull()
    expect(payload.check_in_end).toBeNull()
  })
})

describe('useTournamentForm (edit mode)', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    // The composable's internal useTournamentGameDetail watches game_id and
    // calls `fetchGame` + `getTournamentMapPool`. Stub both so tests don't
    // fire real HTTP requests (happy-dom can't reach the backend and would
    // flood teardown with AbortErrors).
    vi.spyOn(useGamesStore(), 'fetchGame').mockResolvedValue({} as ReturnType<typeof useGamesStore>['fetchGame'] extends (...a: never[]) => Promise<infer U> ? U : never)
    vi.spyOn(useTournamentsStore(), 'getTournamentMapPool').mockResolvedValue(null as unknown as ReturnType<typeof useTournamentsStore>['getTournamentMapPool'] extends (...a: never[]) => Promise<infer U> ? U : never)
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  function setup(tournament: TournamentResponse | null = makeTournament()) {
    const initial = ref(tournament)
    const { result, unmount } = withApp(() =>
      useTournamentForm({ mode: 'edit', initial }),
    )
    cleanups.push(unmount)
    return { form: result, initial }
  }

  it('populates form from the tournament on mount', () => {
    const { form } = setup(makeTournament({ name: 'Copa 1', slug: 'copa-1' }))
    expect(form.form.name).toBe('Copa 1')
    expect(form.form.slug).toBe('copa-1')
    expect(form.form.description).toBe('An original description')
  })

  it('hasChanges is false until a field changes', () => {
    const { form } = setup()
    expect(form.hasChanges.value).toBe(false)
    form.form.name = 'Changed'
    expect(form.hasChanges.value).toBe(true)
  })

  it('canEditSlug depends on status', () => {
    const { form } = setup(makeTournament({ status: 'draft' }))
    expect(form.canEditSlug.value).toBe(true)

    const { form: f2 } = setup(makeTournament({ status: 'in_progress' }))
    expect(f2.canEditSlug.value).toBe(false)
  })

  it('canEditParticipants locks once the tournament is in progress', () => {
    const { form } = setup(makeTournament({ status: 'in_progress' }))
    expect(form.canEditParticipants.value).toBe(false)
  })

  it('canEditRegistrationDates is only true for draft/published', () => {
    expect(setup(makeTournament({ status: 'draft' })).form.canEditRegistrationDates.value).toBe(true)
    expect(setup(makeTournament({ status: 'published' })).form.canEditRegistrationDates.value).toBe(true)
    expect(setup(makeTournament({ status: 'in_progress' })).form.canEditRegistrationDates.value).toBe(false)
  })

  it('buildUpdatePatch includes only diff-guarded fields that changed', () => {
    const t = makeTournament({
      name: 'Orig',
      slug: 'orig',
      description: 'desc',
      min_participants: 4,
      max_participants: 16,
      withdrawal_policy: 'forfeit',
      default_match_format: 'bo3',
    })
    const { form } = setup(t)

    // Change only name + min_participants.
    form.form.name = 'New Name'
    form.form.min_participants = 8

    const patch = form.buildUpdatePatch() as Record<string, unknown>

    // Diff-guarded fields: only changed ones should be present.
    expect(patch.name).toBe('New Name')
    expect(patch.min_participants).toBe(8)
    expect(patch).not.toHaveProperty('slug')
    expect(patch).not.toHaveProperty('description')
    expect(patch).not.toHaveProperty('max_participants')
    expect(patch).not.toHaveProperty('withdrawal_policy')
    expect(patch).not.toHaveProperty('default_match_format')

    // Always-sent fields should still be present.
    expect(patch).toHaveProperty('registration_start')
    expect(patch).toHaveProperty('settings')
  })

  it('buildUpdatePatch sends null for default_map_veto_format when cleared', () => {
    const t = makeTournament({ default_map_veto_format: 'some-veto-id' })
    const { form } = setup(t)
    form.form.default_map_veto_format = null
    const patch = form.buildUpdatePatch() as Record<string, unknown>
    expect(patch.default_map_veto_format).toBeNull()
  })

  it('buildUpdatePatch suppresses check_in_start/end when check_in_required is false', () => {
    const t = makeTournament({ check_in_required: false })
    const { form } = setup(t)
    form.form.check_in_required = false
    form.form.check_in_start = '2026-06-01T10:00'
    form.form.check_in_end = '2026-06-01T12:00'
    const patch = form.buildUpdatePatch() as Record<string, unknown>
    expect(patch.check_in_start).toBeUndefined()
    expect(patch.check_in_end).toBeUndefined()
  })

  it('re-populates form when the tournament prop swaps', async () => {
    const initial = ref<TournamentResponse | null>(makeTournament({ name: 'First' }))
    const { result, unmount } = withApp(() =>
      useTournamentForm({ mode: 'edit', initial }),
    )
    cleanups.push(unmount)

    expect(result.form.name).toBe('First')
    initial.value = makeTournament({ name: 'Second' })
    // Default watcher flush is 'pre' — run the scheduler so the reset watcher fires.
    await nextTick()
    expect(result.form.name).toBe('Second')
    expect(result.hasChanges.value).toBe(false)
  })

  it('reads side_selection_mode from settings JSONB', () => {
    const t = makeTournament() as TournamentResponse & { settings?: { side_selection_mode: string } }
    t.settings = { side_selection_mode: 'knife' }
    const { form } = setup(t)
    expect(form.form.side_selection_mode).toBe('knife')
  })

  it('falls back to picker_choice when no side_selection_mode is set', () => {
    const { form } = setup(makeTournament())
    expect(form.form.side_selection_mode).toBe('picker_choice')
  })

  it('buildUpdatePatch merges settings instead of clobbering foreign keys', () => {
    // The patch used to send settings = {side_selection_mode} wholesale,
    // erasing anything else stored there (e.g. eligibility restrictions).
    const t = makeTournament() as TournamentResponse & { settings?: Record<string, unknown> }
    t.settings = {
      side_selection_mode: 'knife',
      eligibility_restrictions: { min_rating_per_player: 1000 },
    }
    const { form } = setup(t)
    form.form.side_selection_mode = 'picker_choice'
    const patch = form.buildUpdatePatch() as { settings?: Record<string, unknown> }
    expect(patch.settings).toEqual({
      side_selection_mode: 'picker_choice',
      eligibility_restrictions: { min_rating_per_player: 1000 },
    })
  })

  it('buildUpdatePatch rewrites managed format_settings keys, preserving foreign ones', () => {
    const t = makeTournament({ format: 'single_elimination' }) as TournamentResponse & {
      format_settings?: Record<string, unknown>
    }
    t.format_settings = { final_format: 'bo3', max_rounds: 5 }
    const { form } = setup(t)
    expect(form.form.final_format).toBe('bo3')
    form.form.final_format = 'bo5'
    const patch = form.buildUpdatePatch() as { format_settings?: Record<string, unknown> }
    expect(patch.format_settings).toEqual({ final_format: 'bo5', max_rounds: 5 })
  })
})

describe('useTournamentForm format_settings (create mode)', () => {
  const cleanups: Array<() => void> = []

  beforeEach(() => {
    setActivePinia(createPinia())
    vi.spyOn(useGamesStore(), 'fetchGame').mockResolvedValue({} as ReturnType<typeof useGamesStore>['fetchGame'] extends (...a: never[]) => Promise<infer U> ? U : never)
    vi.spyOn(useTournamentsStore(), 'getTournamentMapPool').mockResolvedValue(null as unknown as ReturnType<typeof useTournamentsStore>['getTournamentMapPool'] extends (...a: never[]) => Promise<infer U> ? U : never)
  })

  afterEach(() => {
    while (cleanups.length) cleanups.pop()!()
  })

  function setup() {
    const { result, unmount } = withApp(() => useTournamentForm({ mode: 'create' }))
    cleanups.push(unmount)
    return result
  }

  it('single elim with a final override emits format_settings.final_format', () => {
    const form = setup()
    form.form.format = 'single_elimination'
    form.form.final_format = 'bo3'
    const payload = form.buildCreatePayload() as { format_settings?: Record<string, unknown> }
    expect(payload.format_settings).toEqual({ final_format: 'bo3' })
  })

  it('no overrides means no format_settings at all', () => {
    const form = setup()
    form.form.format = 'single_elimination'
    const payload = form.buildCreatePayload() as { format_settings?: Record<string, unknown> }
    expect(payload.format_settings).toBeUndefined()
  })

  it('groups_and_playoffs emits the full groups config with per-phase formats', () => {
    // "Groups bo1, playoffs bo3, final bo5" — the headline configuration.
    const form = setup()
    form.form.format = 'groups_and_playoffs'
    form.form.group_count = 4
    form.form.advance_per_group = 2
    form.form.group_format = 'round_robin'
    form.form.playoff_format = 'single_elimination'
    form.form.group_match_format = 'bo1'
    form.form.playoff_match_format = 'bo3'
    form.form.playoff_final_format = 'bo5'
    // Not double elim, so a stray grand-final override must not leak.
    form.form.playoff_grand_final_format = 'bo7'
    const payload = form.buildCreatePayload() as { format_settings?: Record<string, unknown> }
    expect(payload.format_settings).toEqual({
      group_count: 4,
      advance_per_group: 2,
      group_format: 'round_robin',
      playoff_format: 'single_elimination',
      group_match_format: 'bo1',
      playoff_match_format: 'bo3',
      playoff_final_format: 'bo5',
    })
  })
})
