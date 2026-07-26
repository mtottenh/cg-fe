import { ref, reactive, inject, type InjectionKey } from 'vue'

export interface SnackbarInstance {
  visible: boolean
  text: string
  color: string
  show: (msg: string, msgColor?: string) => void
  success: (msg: string) => void
  error: (msg: string) => void
}

export const SnackbarKey: InjectionKey<SnackbarInstance> = Symbol('snackbar')

/** Create a new snackbar instance (call once at app root, then provide). */
export function createSnackbar(): SnackbarInstance {
  const visible = ref(false)
  const text = ref('')
  const color = ref('success')

  function show(msg: string, msgColor: string = 'success') {
    text.value = msg
    color.value = msgColor
    visible.value = true
  }

  function success(msg: string) {
    show(msg, 'success')
  }

  function error(msg: string) {
    show(msg, 'error')
  }

  return reactive({ visible, text, color, show, success, error })
}

/**
 * Get the provided snackbar instance.
 *
 * Requires a `<AppSnackbar>` to be mounted and the instance to be
 * `provide()`-d at the app root (see `App.vue`). Throws in dev to surface
 * missing providers immediately; in prod returns a no-op stub so a runtime
 * slip does not crash the page (messages will be lost, but the UI keeps working).
 */
export function useSnackbar(): SnackbarInstance {
  const provided = inject(SnackbarKey, null)
  if (provided) return provided
  if (import.meta.env.DEV) {
    throw new Error(
      'useSnackbar(): no provider found. Ensure <AppSnackbar> is mounted at ' +
      'the app root and that createSnackbar() is provided under SnackbarKey.'
    )
  }
  return {
    visible: false,
    text: '',
    color: '',
    show() {},
    success() {},
    error() {},
  }
}
