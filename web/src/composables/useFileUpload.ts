/**
 * Generic file upload composable with progress tracking.
 *
 * Provides the XHR-with-progress core that both presigned-URL uploads
 * (evidence/demos) and direct multipart uploads (avatars/logos) can use.
 *
 * Usage — presigned URL flow (evidence):
 * ```ts
 * const { uploads, uploadFile, removeUpload } = useFileUpload({
 *   async onUpload(file, item) {
 *     const info = await evidenceStore.initiateUpload(matchId, { ... })
 *     item.meta = { evidenceId: info.evidence_id }
 *     return { url: info.upload_url, method: 'PUT', headers: info.upload_headers, body: file }
 *   },
 *   async onComplete(item) {
 *     await evidenceStore.completeUpload(matchId, item.meta.evidenceId)
 *   },
 * })
 * ```
 *
 * Usage — direct multipart flow (images):
 * ```ts
 * const { uploads, uploadFile } = useFileUpload({
 *   async onUpload(file) {
 *     const formData = new FormData()
 *     formData.append('file', file)
 *     return {
 *       url: '/v1/players/me/avatar',
 *       method: 'POST',
 *       headers: { Authorization: `Bearer ${token}` },
 *       body: formData,
 *     }
 *   },
 * })
 * ```
 */

import { ref, computed } from 'vue'

export type UploadStatus = 'pending' | 'uploading' | 'completing' | 'complete' | 'error'

export interface UploadItem<TMeta = Record<string, unknown>> {
  /** Locally-generated ID for tracking this upload in the list. */
  localId: string
  /** Original File reference. */
  file: File
  /** Current upload status. */
  status: UploadStatus
  /** Upload progress (0–100). */
  progress: number
  /** Error message if status is 'error'. */
  error: string | null
  /** Caller-defined metadata (e.g. evidence_id, response URL). */
  meta: TMeta
}

/** What the XHR should send. Returned by the `onUpload` callback. */
export interface UploadTarget {
  /** URL to send the request to. */
  url: string
  /** HTTP method (default: 'PUT'). */
  method?: string
  /** Headers to set on the XHR. */
  headers?: Record<string, string>
  /** Request body — File for raw uploads, FormData for multipart. */
  body: File | FormData | Blob
}

export interface UseFileUploadOptions<TMeta = Record<string, unknown>> {
  /**
   * Called to prepare the upload. Must return the XHR target (URL, headers, body).
   * Can set `item.meta` to attach caller-specific data (e.g. evidence_id).
   * Throw to abort with an error.
   */
  onUpload: (file: File, item: UploadItem<TMeta>) => Promise<UploadTarget>

  /**
   * Optional completion step called after the XHR succeeds.
   * Use for presigned-URL flows that need a "complete" API call.
   * Can update `item.meta` with the final result.
   */
  onComplete?: (item: UploadItem<TMeta>) => Promise<void>

  /**
   * Optional XHR response handler. Called with the raw responseText
   * after a successful upload. Return value is merged into `item.meta`.
   * Useful for direct-POST flows where the response contains the URL.
   */
  parseResponse?: (responseText: string) => Partial<TMeta>

  /**
   * Optional abort handler called when an upload is cancelled/removed.
   * Use to clean up server-side resources (e.g. delete pending evidence).
   */
  onAbort?: (item: UploadItem<TMeta>) => Promise<void>
}

let nextId = 0

export function useFileUpload<TMeta = Record<string, unknown>>(
  options: UseFileUploadOptions<TMeta>,
) {
  const uploads = ref<UploadItem<TMeta>[]>([]) as ReturnType<typeof ref<UploadItem<TMeta>[]>>

  const isUploading = computed(() => uploads.value.some((u) => u.status === 'uploading' || u.status === 'completing'))

  const completedItems = computed(() => uploads.value.filter((u) => u.status === 'complete'))

  /** Active XHR handles keyed by localId, for abort support. */
  const xhrMap = new Map<string, XMLHttpRequest>()

  async function uploadFile(file: File, initialMeta?: Partial<TMeta>): Promise<UploadItem<TMeta>> {
    const localId = `upload-${++nextId}-${Date.now()}`
    const item: UploadItem<TMeta> = {
      localId,
      file,
      status: 'pending',
      progress: 0,
      error: null,
      meta: (initialMeta ?? {}) as TMeta,
    }
    uploads.value.push(item as any)

    try {
      // Step 1: Let caller prepare the upload target
      item.status = 'uploading'
      const target = await options.onUpload(file, item)

      // Step 2: XHR with progress tracking
      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest()
        xhrMap.set(localId, xhr)

        xhr.open(target.method || 'PUT', target.url, true)

        if (target.headers) {
          for (const [key, value] of Object.entries(target.headers)) {
            xhr.setRequestHeader(key, value)
          }
        }

        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            item.progress = Math.round((e.loaded / e.total) * 100)
          }
        }

        xhr.onload = () => {
          xhrMap.delete(localId)
          if (xhr.status >= 200 && xhr.status < 300) {
            if (options.parseResponse) {
              try {
                const parsed = options.parseResponse(xhr.responseText)
                Object.assign(item.meta as any, parsed)
              } catch {
                // parseResponse is optional — ignore errors
              }
            }
            resolve()
          } else {
            let message = `Upload failed: ${xhr.status}`
            try {
              const body = JSON.parse(xhr.responseText)
              message = body.detail || body.message || message
            } catch {
              // ignore parse error
            }
            reject(new Error(message))
          }
        }

        xhr.onerror = () => {
          xhrMap.delete(localId)
          reject(new Error('Upload failed: network error'))
        }

        xhr.ontimeout = () => {
          xhrMap.delete(localId)
          reject(new Error('Upload timed out'))
        }

        xhr.send(target.body)
      })

      // Step 3: Optional completion callback
      if (options.onComplete) {
        item.status = 'completing'
        await options.onComplete(item)
      }

      item.status = 'complete'
      item.progress = 100
    } catch (err) {
      item.status = 'error'
      item.error = err instanceof Error ? err.message : 'Upload failed'
    }

    return item
  }

  function removeUpload(localId: string) {
    // Abort in-flight XHR if any
    const xhr = xhrMap.get(localId)
    if (xhr) {
      xhr.abort()
      xhrMap.delete(localId)
    }

    const item = uploads.value.find((u) => u.localId === localId)
    if (item && options.onAbort) {
      options.onAbort(item as UploadItem<TMeta>).catch(() => {})
    }

    uploads.value = uploads.value.filter((u) => u.localId !== localId) as any
  }

  function clear() {
    // Abort all in-flight XHRs
    for (const [id, xhr] of xhrMap) {
      xhr.abort()
      xhrMap.delete(id)
    }
    uploads.value = [] as any
  }

  return {
    uploads,
    isUploading,
    completedItems,
    uploadFile,
    removeUpload,
    clear,
  }
}
