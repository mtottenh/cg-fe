import { ref, type Ref } from 'vue'

export function useAsyncAction() {
  const loading = ref(false)
  const error: Ref<string | null> = ref(null)

  async function execute<R>(action: () => Promise<R>): Promise<R | null> {
    loading.value = true
    error.value = null
    try {
      return await action()
    } catch (e) {
      error.value = e instanceof Error ? e.message : 'Unknown error'
      return null
    } finally {
      loading.value = false
    }
  }

  function clearError() {
    error.value = null
  }

  return { loading, error, execute, clearError }
}
