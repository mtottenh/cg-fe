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
import CompletedResultDisputeCard from '../CompletedResultDisputeCard.vue'

const mockPost = api.POST as unknown as Mock
const vuetify = createVuetify({ components, directives })

let wrapper: VueWrapper | null = null
afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
  mockPost.mockReset()
})

function mountCard(serverReported = true) {
  wrapper = mount(CompletedResultDisputeCard, {
    props: { tournamentId: 't-1', matchId: 'm-1', registrationId: 'reg-a', claimId: 'claim-1', serverReported },
    global: { plugins: [createPinia(), vuetify] },
    attachTo: document.body,
  })
  return wrapper
}

const byTestId = <T extends HTMLElement = HTMLElement>(id: string) =>
  document.querySelector<T>(`[data-testid="${id}"]`)

async function openAndDescribe(text: string) {
  byTestId('completed-dispute-open')!.click()
  await flushPromises()
  const textarea = document.querySelector<HTMLTextAreaElement>('.v-overlay--active textarea')!
  textarea.value = text
  textarea.dispatchEvent(new Event('input'))
  await flushPromises()
}

describe('CompletedResultDisputeCard', () => {
  it('says when the game server reported the result', () => {
    expect(mountCard(true).text()).toContain('reported by the game server')
    wrapper!.unmount()
    expect(mountCard(false).text()).not.toContain('reported by the game server')
  })

  it('needs a real explanation before it can be sent', async () => {
    mountCard()
    await openAndDescribe('too short')
    expect(byTestId<HTMLButtonElement>('completed-dispute-submit')!.disabled).toBe(true)
  })

  it('raises the dispute for the viewer\'s registration and the confirmed claim', async () => {
    mockPost.mockResolvedValue({ data: { data: { id: 'd-1' } }, error: undefined, response: { ok: true, status: 201 } })
    const w = mountCard()
    await openAndDescribe('The server recorded 2-1 but we won the decider 13-9.')
    byTestId('completed-dispute-submit')!.click()
    await flushPromises()

    expect(mockPost).toHaveBeenCalledWith('/v1/tournaments/{tournament_id}/matches/{match_id}/dispute', {
      params: { path: { tournament_id: 't-1', match_id: 'm-1' } },
      body: {
        reason: 'wrong_score',
        description: 'The server recorded 2-1 but we won the decider 13-9.',
        registration_id: 'reg-a',
        evidence_ids: [],
        result_claim_id: 'claim-1',
      },
    })
    expect(w.emitted('disputed')).toHaveLength(1)
  })

  it('keeps the dialog open and shows the refusal when the API says no', async () => {
    const { ApiError } = await import('@/api')
    mockPost.mockRejectedValue(new ApiError(409, 'Match already has an active dispute'))
    const w = mountCard()
    await openAndDescribe('The server recorded 2-1 but we won the decider 13-9.')
    byTestId('completed-dispute-submit')!.click()
    await flushPromises()
    expect(byTestId('completed-dispute-error')!.textContent).toContain('already has an active dispute')
    expect(w.emitted('disputed')).toBeUndefined()
  })
})
