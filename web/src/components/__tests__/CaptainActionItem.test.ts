import { describe, it, expect, afterEach } from 'vitest'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import CaptainActionItem from '@/components/CaptainActionItem.vue'
import type { CaptainAction } from '@/stores/captainActions'

const vuetify = createVuetify({ components, directives })

function action(overrides: Partial<CaptainAction> = {}): CaptainAction {
  return {
    action_type: 'check_in',
    match_id: 'm1',
    tournament_id: 't1',
    tournament_slug: 't-1',
    tournament_name: 'Winter Cup',
    match_label: 'Alpha vs Bravo',
    created_at: new Date().toISOString(),
    ...overrides,
  }
}

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
})

function mountItem(a: CaptainAction) {
  wrapper = mount(CaptainActionItem, {
    props: { action: a },
    global: {
      plugins: [vuetify],
      stubs: { RouterLink: true },
      mocks: { $router: { resolve: () => ({ href: '#' }) }, $route: {} },
    },
  })
  return wrapper
}

describe('CaptainActionItem — check-in', () => {
  it('asks for check-in once the window is open (the item carries a deadline)', () => {
    const w = mountItem(action({ deadline: new Date(Date.now() + 10 * 60_000).toISOString() }))
    expect(w.text()).toContain('Check-in required')
  })

  it('shows when the match is, when the item carries the match time', () => {
    const at = new Date(Date.now() + 10 * 60_000).toISOString()
    const w = mountItem(action({ deadline: at, scheduled_at: at }))
    expect(w.find('[data-testid="action-match-time"]').text()).toContain('Match at')
  })

  it('omits the match time when the server sends none', () => {
    const w = mountItem(action({ action_type: 'submit_result' }))
    expect(w.find('[data-testid="action-match-time"]').exists()).toBe(false)
  })
})
