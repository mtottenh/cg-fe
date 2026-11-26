import { describe, it, expect, afterEach, beforeEach, vi, type Mock } from 'vitest'
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
import TournamentNotificationSettingsCard from '@/components/admin/tournament-detail/TournamentNotificationSettingsCard.vue'
import { SnackbarKey, createSnackbar } from '@/composables/useSnackbar'

/**
 * The Discord webhook URL is a secret: the API never returns it, and the card
 * must never display one — only "configured (…hint)". Saving sends the URL
 * only when the admin typed a new one (or null to remove it).
 */

const mockGet = api.GET as unknown as Mock
const mockPut = api.PUT as unknown as Mock
const mockPost = api.POST as unknown as Mock
const vuetify = createVuetify({ components, directives })
const WEBHOOK = 'https://discord.com/api/webhooks/123/secret-token-abc123'

let wrapper: VueWrapper | null = null
async function mountCard(settings: Record<string, unknown>) {
  mockGet.mockResolvedValueOnce({ data: { data: settings } })
  wrapper = mount(TournamentNotificationSettingsCard, {
    global: {
      plugins: [createPinia(), vuetify],
      provide: { [SnackbarKey as symbol]: createSnackbar() },
    },
    props: { tournamentId: 'tour-1' },
  })
  await flushPromises()
  return wrapper
}

const byId = (w: VueWrapper, id: string) => w.find(`[data-testid="${id}"]`)

describe('TournamentNotificationSettingsCard', () => {
  beforeEach(() => {
    mockGet.mockReset()
    mockPut.mockReset()
    mockPost.mockReset()
  })
  afterEach(() => {
    wrapper?.unmount()
    wrapper = null
    document.body.innerHTML = ''
  })

  it('shows a configured webhook by its hint only, never a URL', async () => {
    const w = await mountCard({ discord_enabled: true, discord_webhook_configured: true, discord_webhook_hint: 'abc123' })
    expect(mockGet).toHaveBeenCalledWith('/v1/admin/tournaments/{tournament_id}/notification-settings', {
      params: { path: { tournament_id: 'tour-1' } },
    })
    expect(byId(w, 'notification-webhook-configured').text()).toContain('…abc123')
    expect(byId(w, 'notification-webhook-url').exists()).toBe(false)
    expect(w.html()).not.toContain('discord.com/api/webhooks')
  })

  it('rejects a non-Discord URL before saving', async () => {
    const w = await mountCard({ discord_enabled: false, discord_webhook_configured: false })
    await byId(w, 'notification-webhook-url').find('input').setValue('https://evil.example/hook')
    expect(w.text()).toContain('Use a Discord webhook URL')
    expect(byId(w, 'notification-settings-save').attributes('disabled')).toBeDefined()
  })

  it('saves a new webhook and clears the field afterwards', async () => {
    const w = await mountCard({ discord_enabled: false, discord_webhook_configured: false })
    await byId(w, 'notification-webhook-url').find('input').setValue(WEBHOOK)
    await byId(w, 'notification-discord-enabled').find('input').setValue(true)
    mockPut.mockResolvedValueOnce({
      data: { data: { discord_enabled: true, discord_webhook_configured: true, discord_webhook_hint: 'abc123' } },
    })
    await byId(w, 'notification-settings-save').trigger('click')
    await flushPromises()
    expect(mockPut).toHaveBeenCalledWith('/v1/admin/tournaments/{tournament_id}/notification-settings', {
      params: { path: { tournament_id: 'tour-1' } },
      body: { discord_enabled: true, discord_webhook_url: WEBHOOK },
    })
    expect(byId(w, 'notification-webhook-url').exists()).toBe(false)
    expect(byId(w, 'notification-webhook-configured').text()).toContain('…abc123')
  })

  it('toggling only the switch does not resend the URL', async () => {
    const w = await mountCard({ discord_enabled: true, discord_webhook_configured: true, discord_webhook_hint: 'abc123' })
    await byId(w, 'notification-discord-enabled').find('input').setValue(false)
    mockPut.mockResolvedValueOnce({
      data: { data: { discord_enabled: false, discord_webhook_configured: true, discord_webhook_hint: 'abc123' } },
    })
    await byId(w, 'notification-settings-save').trigger('click')
    await flushPromises()
    expect(mockPut.mock.calls[0]![1].body).toEqual({ discord_enabled: false })
  })

  it('removes the webhook with null and switches Discord off', async () => {
    const w = await mountCard({ discord_enabled: true, discord_webhook_configured: true, discord_webhook_hint: 'abc123' })
    await byId(w, 'notification-webhook-remove').trigger('click')
    mockPut.mockResolvedValueOnce({ data: { data: { discord_enabled: false, discord_webhook_configured: false } } })
    await byId(w, 'notification-settings-save').trigger('click')
    await flushPromises()
    expect(mockPut.mock.calls[0]![1].body).toEqual({ discord_enabled: false, discord_webhook_url: null })
  })

  it.each([
    [{ delivered: true }, 'Test message delivered.'],
    [{ delivered: false, detail: 'Discord answered 404' }, 'Test message not delivered. Discord answered 404'],
  ])('shows the test result verbatim (%o)', async (result, text) => {
    const w = await mountCard({ discord_enabled: true, discord_webhook_configured: true, discord_webhook_hint: 'abc123' })
    mockPost.mockResolvedValueOnce({ data: { data: result } })
    await byId(w, 'notification-settings-test').trigger('click')
    await flushPromises()
    expect(mockPost).toHaveBeenCalledWith('/v1/admin/tournaments/{tournament_id}/notification-settings/test', {
      params: { path: { tournament_id: 'tour-1' } },
    })
    expect(byId(w, 'notification-test-result').text()).toBe(text)
  })
})
