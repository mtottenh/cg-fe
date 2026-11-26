import { reactive } from 'vue'

export interface ReasonDialogOptions {
  title: string
  /** What the action does, in a sentence or two. */
  message: string
  /** Exactly what is changed or cleared, one line each. */
  effects?: string[]
  /** Shown as a warning above the reason field. */
  warning?: string
  action?: string
  color?: string
  /** Pre-filled, editable reason recorded with the action. */
  defaultReason: string
  handler: (reason: string) => Promise<void>
}

export interface ReasonDialogState {
  open: boolean
  title: string
  message: string
  effects: string[]
  warning: string | null
  actionLabel: string
  color: string
  reason: string
  loading: boolean
  dialogError: string | null
}

/**
 * Confirm dialog that also collects the reason an admin action is recorded
 * with. Same contract as `useConfirmDialog`: a handler that throws keeps the
 * dialog open and shows the error (the backend's own wording for an
 * `ApiError`), so nothing typed is lost on a refusal.
 *
 * Render with `<ReasonDialogHost :dialog="reasonDialog" />`.
 */
export function useReasonDialog() {
  const state = reactive<ReasonDialogState>({
    open: false,
    title: '',
    message: '',
    effects: [],
    warning: null,
    actionLabel: 'Confirm',
    color: 'primary',
    reason: '',
    loading: false,
    dialogError: null,
  })

  let onConfirm: ((reason: string) => Promise<void>) | null = null

  function confirm(opts: ReasonDialogOptions) {
    state.title = opts.title
    state.message = opts.message
    state.effects = opts.effects ?? []
    state.warning = opts.warning ?? null
    state.actionLabel = opts.action ?? 'Confirm'
    state.color = opts.color ?? 'primary'
    state.reason = opts.defaultReason
    state.dialogError = null
    onConfirm = opts.handler
    state.open = true
  }

  async function execute() {
    const reason = state.reason.trim()
    if (!onConfirm || !reason) return
    state.loading = true
    state.dialogError = null
    try {
      await onConfirm(reason)
      state.open = false
      onConfirm = null
    } catch (e: unknown) {
      state.dialogError = e instanceof Error ? e.message : 'Operation failed'
    } finally {
      state.loading = false
    }
  }

  function setReason(reason: string) {
    state.reason = reason
  }

  function cancel() {
    state.open = false
    onConfirm = null
    state.dialogError = null
  }

  return { state, confirm, execute, cancel, setReason }
}
