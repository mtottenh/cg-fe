import { describe, it, expect, afterEach, vi } from 'vitest'
import { defineComponent, h, ref, nextTick } from 'vue'
import { mount, type VueWrapper } from '@vue/test-utils'
import { createVuetify } from 'vuetify'
import * as components from 'vuetify/components'
import * as directives from 'vuetify/directives'
import UserSearchAutocomplete from '@/components/admin/UserSearchAutocomplete.vue'

/**
 * COVERAGE-PLAN P-154 — after selecting from any `SearchAutocomplete`, the
 * next click anywhere was swallowed, measured app-wide in e2e
 * (platform-role-assignment.spec.ts): with `document.activeElement` left on
 * the autocomplete's <input> a real mouse click on another control fired no
 * handler, and after focus moved to BODY the identical click fired. Vuetify's
 * VAutocomplete deliberately parks focus back on its <input> after an option
 * click (its `onAfterLeave` refocuses while `isFocused` is still true — the
 * option list preventDefaults mousedown so the input never blurs during
 * selection). The fix releases that focus in `SearchAutocomplete.onSelect`
 * after a real selection, so every surface rests in the state the e2e's
 * `search.blur()` workaround had to create by hand.
 *
 * What this test CAN prove (happy-dom): after a selection driven through the
 * real Vuetify menu, the input has released focus, the menu model is closed
 * with no active overlay left to intercept, and a browser-like click sequence
 * on an outside element reaches that element's handler.
 *
 * What it CANNOT prove: the real-browser swallow itself. happy-dom has no
 * hit-testing and no native focus-on-mousedown, so a click here cannot be
 * geometrically intercepted or consumed by focus teardown the way the e2e
 * measured. The released-focus assertion is the pin: it fails on the pre-fix
 * component (focus stays on the input) and holds on the fixed one.
 */

const PLAYER = {
  id: 'p9-0000-0000-0000',
  display_name: 'Alice Anderson',
  avatar_url: null,
  country_code: null,
}

vi.mock('@/api', () => ({
  api: {
    GET: vi.fn(async () => ({ data: { data: [PLAYER] }, error: undefined })),
  },
}))

const vuetify = createVuetify({ components, directives })

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

/** Browser-ordered event sequence for a mouse click on `el`. */
function browserClick(el: HTMLElement) {
  el.dispatchEvent(new MouseEvent('mousedown', { bubbles: true, cancelable: true }))
  el.dispatchEvent(new MouseEvent('mouseup', { bubbles: true, cancelable: true }))
  el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))
}

let wrapper: VueWrapper | null = null

afterEach(() => {
  wrapper?.unmount()
  wrapper = null
  document.body.innerHTML = ''
})

describe('UserSearchAutocomplete post-selection state (P-154)', () => {
  it('releases input focus after a selection; the menu is closed and an outside click lands', async () => {
    const outsideClicks: number[] = []
    const selectedPlayers: unknown[] = []

    const Harness = defineComponent({
      setup() {
        const model = ref(null)
        return () =>
          h('div', [
            h(UserSearchAutocomplete as never, {
              modelValue: model.value,
              'onUpdate:modelValue': (v: never) => (model.value = v),
              onSelect: (p: unknown) => selectedPlayers.push(p),
            }),
            h('button', { id: 'outside-target', onClick: () => outsideClicks.push(1) }, 'Next action'),
          ])
      },
    })

    wrapper = mount(Harness, {
      global: { plugins: [vuetify] },
      attachTo: document.body,
    })

    // Type a query the way the e2e does: focus, then set the value. The
    // wrapper's debounce is a hardcoded 300ms, so wait it out with real time.
    const input = wrapper.find('input')
    const inputEl = input.element as HTMLInputElement
    inputEl.focus()
    await input.trigger('focus')
    await input.setValue('Ali')
    await sleep(400)
    await nextTick()

    // Select from the real teleported menu, with the mousedown the option list
    // preventDefaults — the exact interaction that leaves focus on the input.
    const option = document.querySelector('.v-overlay__content .v-list-item') as HTMLElement | null
    expect(option, 'the menu must offer the fetched player').not.toBeNull()
    browserClick(option!)
    await nextTick()
    await nextTick()
    await sleep(50)

    expect(selectedPlayers, 'the selection must have been emitted').toHaveLength(1)
    expect((selectedPlayers[0] as typeof PLAYER).id).toBe(PLAYER.id)

    // THE P-154 PIN — the state the e2e measured as the swallow's
    // discriminator. Pre-fix, VAutocomplete keeps/returns focus to the input
    // after the option click and this assertion fails.
    expect(
      document.activeElement,
      'after a selection the input must have released focus (P-154)',
    ).not.toBe(inputEl)

    // No armed overlay left behind: menu model closed, nothing active to
    // intercept the next pointer interaction.
    const autocomplete = wrapper.findComponent({ name: 'VAutocomplete' })
    expect(autocomplete.props('menu'), 'the menu model must be closed').toBe(false)
    expect(document.querySelector('.v-overlay--active')).toBeNull()
    const overlayContent = document.querySelector('.v-overlay__content') as HTMLElement | null
    if (overlayContent) {
      expect(overlayContent.style.display, 'the menu content must be hidden').toBe('none')
    }

    // And the mechanism, as far as happy-dom can express it: the very next
    // click on an outside element reaches that element's handler.
    browserClick(document.getElementById('outside-target')!)
    await nextTick()
    expect(outsideClicks, 'the first outside click must land (P-154)').toHaveLength(1)
  }, 15000)
})
