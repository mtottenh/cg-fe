import { ref } from 'vue'

export interface ConfirmDialogOptions {
  title: string
  message: string
  action?: string
  color?: string
  handler: () => Promise<void>
}

export function useConfirmDialog() {
  const open = ref(false)
  const title = ref('')
  const message = ref('')
  const actionLabel = ref('Confirm')
  const color = ref('primary')
  const loading = ref(false)
  const dialogError = ref<string | null>(null)
  const onConfirm = ref<(() => Promise<void>) | null>(null)

  function confirm(opts: ConfirmDialogOptions) {
    title.value = opts.title
    message.value = opts.message
    actionLabel.value = opts.action ?? 'Confirm'
    color.value = opts.color ?? 'primary'
    dialogError.value = null
    onConfirm.value = opts.handler
    open.value = true
  }

  async function execute() {
    if (!onConfirm.value) return
    loading.value = true
    dialogError.value = null
    try {
      await onConfirm.value()
      // Only close on success
      open.value = false
      onConfirm.value = null
    } catch (e: unknown) {
      dialogError.value = e instanceof Error ? e.message : 'Operation failed'
    } finally {
      loading.value = false
    }
  }

  function cancel() {
    open.value = false
    onConfirm.value = null
    dialogError.value = null
  }

  return { open, title, message, actionLabel, color, loading, dialogError, confirm, execute, cancel }
}
