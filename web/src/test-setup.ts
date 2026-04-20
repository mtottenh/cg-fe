/**
 * Vitest environment shims.
 *
 * happy-dom does not polyfill `window.visualViewport`, which Vuetify's
 * VOverlay location strategy reads at mount time. Provide a minimal stub
 * so component tests that mount Vuetify dialogs/menus don't throw.
 */
if (typeof window !== 'undefined' && !window.visualViewport) {
  Object.defineProperty(window, 'visualViewport', {
    value: {
      width: 1024,
      height: 768,
      scale: 1,
      offsetLeft: 0,
      offsetTop: 0,
      pageLeft: 0,
      pageTop: 0,
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => true,
    },
    configurable: true,
  })
}
