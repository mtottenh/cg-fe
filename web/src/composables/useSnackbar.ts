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
 * Falls back to creating a local instance if no provider exists (backwards compat).
 */
export function useSnackbar(): SnackbarInstance {
  const provided = inject(SnackbarKey, null)
  if (provided) return provided
  // Fallback: create a local instance (legacy behavior)
  return createSnackbar()
}
