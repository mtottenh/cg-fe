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
import MatchAdminActionsTab from '@/components/admin/match-detail/MatchAdminActionsTab.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'
import { formatDateTimeForInput } from '@/utils/formatters'

/**
 * The schedule card is the only place an admin gives a match its time, and
 * since the admin transition no longer fakes a "Schedule", the only way to
 * move a match out of `ready`. It also has to rescue a match that is
 * `scheduled` with no time.
 */

const mockPost = api.POST as unknown as Mock
const vuetify = createVuetify({ components, directives })

const MATCH_ID = '01912f00-0000-7000-8000-00000000beef'
const STORED = '2032-04-17T19:45:00Z'

let wrapper: VueWrapper | null = null
afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  mockPost.mockReset()
})

function makeMatch(status: string, scheduledAt: string | null) {
  return {
    id: MATCH_ID,
    tournament_id: 'tour-1',
    match_number: 1,
    round: 1,
    status,
    match_format: 'bo3',
    participant1_registration_id: '01912f00-0000-7000-8000-000000000001',
    participant2_registration_id: '01912f00-0000-7000-8000-000000000002',
    participant1_name: 'Team Alpha',
    participant2_name: 'Team Bravo',
    winner_registration_id: null,
    scheduled_at: scheduledAt,
  }
}

function mountTab(status: string, scheduledAt: string | null = null) {
  wrapper = mount(MatchAdminActionsTab, {
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    props: { match: makeMatch(status, scheduledAt) as any, tournamentId: 'tour-1' },
    attachTo: document.body,
  })
  return wrapper
}

const card = (w: VueWrapper) => w.find('[data-testid="schedule-card"]')
const input = (w: VueWrapper) => w.find('input[type="datetime-local"]')
const submit = (w: VueWrapper) =>
  card(w).findAll('button').find((b) => ['Schedule', 'Reschedule'].includes(b.text().trim()))!

describe('MatchAdminActionsTab schedule card', () => {
  it('offers to schedule a ready match, starting from an empty time', () => {
    const w = mountTab('ready')
    expect(card(w).text()).toContain('Schedule Match')
    expect(card(w).text()).toContain('No time set yet')
    expect((input(w).element as HTMLInputElement).value).toBe('')
    expect(submit(w).text().trim()).toBe('Schedule')
    expect(submit(w).attributes('disabled')).toBeDefined()
    expect(w.find('[data-testid="schedule-missing-time"]').exists()).toBe(false)
  })

  it('offers to reschedule a scheduled match, starting from its stored time', () => {
    const w = mountTab('scheduled', STORED)
    expect(card(w).text()).toContain('Reschedule Match')
    expect(card(w).text()).toContain('Currently set for')
    expect((input(w).element as HTMLInputElement).value).toBe(formatDateTimeForInput(STORED))
    expect(submit(w).text().trim()).toBe('Reschedule')
    // Nothing to send until the time is actually changed.
    expect(submit(w).attributes('disabled')).toBeDefined()
  })

  it('flags a scheduled match that has no time', () => {
    const w = mountTab('scheduled')
    expect(w.find('[data-testid="schedule-missing-time"]').text()).toContain('has no time')
    expect(submit(w).text().trim()).toBe('Schedule')
  })

  it('is not rendered once the backend would refuse a time', () => {
    for (const status of ['pending', 'checking_in', 'in_progress', 'awaiting_result', 'completed']) {
      const w = mountTab(status)
      expect(card(w).exists(), status).toBe(false)
      w.unmount()
    }
    wrapper = null
  })

  it('sends the chosen time to the admin schedule endpoint', async () => {
    mockPost.mockResolvedValue({
      data: { data: makeMatch('scheduled', '2032-05-01T18:00:00Z') },
      error: undefined,
      response: { ok: true, status: 200 },
    })
    const w = mountTab('scheduled', STORED)

    const local = '2032-05-01T18:00'
    await input(w).setValue(local)
    expect(submit(w).attributes('disabled')).toBeUndefined()
    await submit(w).trigger('click')
    await flushPromises()

    expect(mockPost).toHaveBeenCalledTimes(1)
    const [path, options] = mockPost.mock.calls[0] as [
      string,
      { params: { path: Record<string, string> }; body: { scheduled_at: string } },
    ]
    expect(path).toBe('/v1/admin/tournaments/{tournament_id}/matches/{match_id}/schedule')
    expect(options.params.path).toEqual({ tournament_id: 'tour-1', match_id: MATCH_ID })
    expect(options.body.scheduled_at).toBe(new Date(local).toISOString())
    expect(w.emitted('updated')).toHaveLength(1)
  })
})

const overlayButton = (label: string) =>
  Array.from(document.querySelectorAll<HTMLElement>('.v-overlay--active .v-btn'))
    .find((b) => b.textContent!.trim() === label)

function okResponse(extra: Record<string, unknown> = {}) {
  return {
    data: { data: { ...makeMatch('scheduled', '2032-05-01T18:00:00Z'), ...extra } },
    error: undefined,
    response: { ok: true, status: 200 },
  }
}

type ScheduleBody = { scheduled_at: string; allow_past?: boolean }
const sentBody = () => (mockPost.mock.calls[0] as [string, { body: ScheduleBody }])[1].body

describe('MatchAdminActionsTab schedule card: past times and clashes', () => {
  it('does not ask for a past time when the time is in the future', async () => {
    mockPost.mockResolvedValue(okResponse())
    const w = mountTab('ready')
    await input(w).setValue('2032-05-01T18:00')
    await submit(w).trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(sentBody().allow_past).toBeUndefined()
  })

  it('asks before scheduling in the past, then sends allow_past', async () => {
    mockPost.mockResolvedValue(okResponse())
    const w = mountTab('ready')
    const past = new Date(Date.now() - 2 * 60 * 60 * 1000)
    await input(w).setValue(formatDateTimeForInput(past.toISOString()))
    await submit(w).trigger('click')
    await flushPromises()

    // Nothing is sent until the admin confirms.
    expect(mockPost).not.toHaveBeenCalled()
    const confirm = overlayButton('Schedule in the past')
    expect(confirm).toBeDefined()
    expect(document.body.textContent).toContain('Check-in opens immediately')
    confirm!.click()
    await flushPromises()

    expect(mockPost).toHaveBeenCalledTimes(1)
    expect(sentBody().allow_past).toBe(true)
  })

  it('shows the clash warning the backend returns with the applied time', async () => {
    mockPost.mockResolvedValue(okResponse({
      schedule_warning: 'One of the teams already plays Team Alpha vs Team Charlie at 18:30 UTC',
    }))
    const w = mountTab('ready')
    await input(w).setValue('2032-05-01T18:00')
    await submit(w).trigger('click')
    await flushPromises()
    const warning = w.find('[data-testid="schedule-warning"]')
    expect(warning.exists()).toBe(true)
    expect(warning.text()).toContain('The time was set')
    expect(warning.text()).toContain('Team Alpha vs Team Charlie')
  })
})
