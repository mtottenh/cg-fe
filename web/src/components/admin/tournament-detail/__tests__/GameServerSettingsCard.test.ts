import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia } from 'pinia'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'

vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: { GET: vi.fn(), POST: vi.fn(), PUT: vi.fn(), DELETE: vi.fn(), PATCH: vi.fn() },
  }
})

import { api } from '@/api'
import GameServerSettingsCard from '@/components/admin/tournament-detail/GameServerSettingsCard.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'

/**
 * Whether a tournament uses the portal's game server lives in
 * `settings.game_server.enabled`, which nothing in the UI could set. A save
 * from this card must change only its own keys: the settings object also
 * holds side selection, eligibility and server options edited elsewhere.
 */

const mockPatch = api.PATCH as unknown as Mock
const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  mockPatch.mockReset()
})

function mountCard(settings: unknown) {
  const tournament = {
    id: 'tour-1', name: 'Cup', slug: 'cup', status: 'in_progress', team_size: 5,
    default_map_veto_format: 'bo3_veto', settings,
  }
  wrapper = mount(GameServerSettingsCard, {
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: { tournament: tournament as any },
  })
  return wrapper
}

const field = (w: VueWrapper, id: string) => w.find(`[data-testid="${id}"] input`)
const save = (w: VueWrapper) => w.find('[data-testid="game-server-settings-save"]')

describe('GameServerSettingsCard', () => {
  it('loads the stored values and has nothing to save until something changes', () => {
    const w = mountCard({ game_server: { enabled: true, auto_confirm_minutes: 15 } })
    expect((field(w, 'game-server-enabled').element as HTMLInputElement).checked).toBe(true)
    expect((field(w, 'game-server-auto-confirm').element as HTMLInputElement).value).toBe('15')
    expect((field(w, 'game-server-min-ready').element as HTMLInputElement).value).toBe('')
    expect(save(w).attributes('disabled')).toBeDefined()
  })

  it('turning the server on sends a settings-only PATCH that keeps every other key', async () => {
    const stored = {
      side_selection_mode: 'picker_choice',
      eligibility: { min_rating_per_player: 1000 },
      game_server: { region: 'eu', cvars: { mp_overtime_enable: '1' } },
    }
    const w = mountCard(stored)
    mockPatch.mockResolvedValue({ data: { data: { id: 'tour-1', name: 'Cup', slug: 'cup', status: 'in_progress', settings: stored } } })
    await field(w, 'game-server-enabled').setValue(true)
    await field(w, 'game-server-auto-confirm').setValue('30')
    await save(w).trigger('click')
    await flushPromises()
    expect(mockPatch).toHaveBeenCalledTimes(1)
    expect(mockPatch).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}', {
      params: { path: { tournament_id: 'tour-1' } },
      body: {
        settings: {
          side_selection_mode: 'picker_choice',
          eligibility: { min_rating_per_player: 1000 },
          game_server: { region: 'eu', cvars: { mp_overtime_enable: '1' }, enabled: true, auto_confirm_minutes: 30 },
        },
      },
    })
  })

  it('clearing a number removes its key so the default applies again', async () => {
    const w = mountCard({ game_server: { enabled: true, min_players_to_ready: 4 } })
    mockPatch.mockResolvedValue({ data: { data: { id: 'tour-1', name: 'Cup', slug: 'cup', status: 'in_progress', settings: {} } } })
    await field(w, 'game-server-min-ready').setValue('')
    await save(w).trigger('click')
    await flushPromises()
    expect(mockPatch.mock.calls[0]![1].body).toEqual({ settings: { game_server: { enabled: true } } })
  })

  it('refuses a ready-up count larger than the team', async () => {
    const w = mountCard({ game_server: { enabled: true } })
    await field(w, 'game-server-min-ready').setValue('6')
    expect(w.text()).toContain('A team has 5 players')
    expect(save(w).attributes('disabled')).toBeDefined()
    await save(w).trigger('click')
    expect(mockPatch).not.toHaveBeenCalled()
  })
})
