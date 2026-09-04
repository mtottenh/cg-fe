import { describe, it, expect, afterEach, vi, type Mock } from 'vitest'
import { mount, flushPromises, type VueWrapper } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
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

import { createRouter, createMemoryHistory } from 'vue-router'
import { api } from '@/api'
import ProfilePage from '@/pages/ProfilePage.vue'

/**
 * Signing up through Steam mints an address the user never chose and can
 * never receive mail at — `steam_<id64>@steam.invalid`, from
 * portal-domain's `is_reserved_placeholder_email`. The profile printed it
 * under "Email", which states something untrue about the account.
 */

const vuetify = createVuetify({ components, directives })

const router = createRouter({
  history: createMemoryHistory(),
  routes: [{ path: '/:pathMatch(.*)*', component: { template: '<div />' } }],
})

/** The identity card is the subject; the rest of the profile is stubbed so
 *  its own fetches cannot fail the test for unrelated reasons. */
const stubs = {
  PlayerGameStatsCard: true,
  PublicMmStatsCard: true,
  PugStatsCard: true,
  MatchHistoryList: true,
  TrophyCase: true,
}

const STEAM_USER = {
  id: 'user-1',
  username: 'sniperjoe',
  email: 'steam_76561198012345678@steam.invalid',
  email_verified: false,
  auth_provider: 'steam',
  status: 'active',
  locale: 'en-GB',
  timezone: 'Europe/London',
  two_factor_enabled: false,
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const EMAIL_USER = {
  ...STEAM_USER,
  email: 'real.person@example.com',
  auth_provider: 'local',
}

const PLAYER = {
  id: 'player-1',
  user_id: 'user-1',
  display_name: 'SniperJoe',
  steam_id: '76561198012345678',
  steam_linked: true,
  looking_for_team: false,
  social_links: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const mockGet = api.GET as unknown as Mock

let wrapper: VueWrapper | null = null

afterEach(() => {
  if (wrapper) wrapper.unmount()
  wrapper = null
  document.body.innerHTML = ''
  vi.clearAllMocks()
})

async function mountProfile(
  user: typeof STEAM_USER,
  player: typeof PLAYER = PLAYER,
) {
  const pinia = createPinia()
  setActivePinia(pinia)

  mockGet.mockImplementation((path: string) => {
    switch (path) {
      case '/v1/users/me':
        return Promise.resolve({ data: { data: user } })
      case '/v1/players/me':
        return Promise.resolve({ data: { data: player } })
      default:
        return Promise.resolve({ data: { data: [] } })
    }
  })

  await router.push('/profile')
  await router.isReady()
  wrapper = mount(ProfilePage, { global: { plugins: [pinia, vuetify, router], stubs } })
  await flushPromises()
  return wrapper
}

describe('ProfilePage — account identity', () => {
  it('does not show the Steam placeholder address as an email', async () => {
    const w = await mountProfile(STEAM_USER)
    const text = w.text()

    expect(text).not.toContain('steam.invalid')
    expect(text).not.toContain('Email')
  })

  it('shows the Steam name, linked to the Steam profile', async () => {
    const w = await mountProfile(STEAM_USER)

    expect(w.text()).toContain('Steam')
    expect(w.text()).toContain('SniperJoe')
    const link = w.find('a[href^="https://steamcommunity.com/profiles/"]')
    expect(link.exists()).toBe(true)
    expect(link.attributes('href')).toBe(
      'https://steamcommunity.com/profiles/76561198012345678',
    )
  })

  it('still shows a real email address', async () => {
    const w = await mountProfile(EMAIL_USER, { ...PLAYER, steam_id: '', steam_linked: false })
    const text = w.text()

    expect(text).toContain('Email')
    expect(text).toContain('real.person@example.com')
  })

  it('shows both when a real email account has linked Steam', async () => {
    const w = await mountProfile(EMAIL_USER)
    const text = w.text()

    expect(text).toContain('real.person@example.com')
    expect(text).toContain('SniperJoe')
  })
})
