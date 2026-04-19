import { computed, type Ref } from 'vue'
import { useEvidenceStore } from '@/stores/evidence'
import { useFileUpload, type UploadItem } from './useFileUpload'

// Re-export for backwards compatibility
export type { UploadStatus } from './useFileUpload'

export interface EvidenceMeta {
  evidenceId: string | null
  /** Set from uploadFile() when the caller wants to override the derived type. */
  evidenceType?: string
  /** Series game number for grouped matches. */
  gameNumber?: number
}

/** Re-export shaped like the old UploadItem for consumers that check .evidenceId */
export type EvidenceUploadItem = UploadItem<EvidenceMeta>

function deriveEvidenceType(file: File): string {
  if (file.type.startsWith('image/')) return 'screenshot'
  if (file.name.endsWith('.dem')) return 'demo'
  if (file.type.startsWith('video/')) return 'video'
  return 'screenshot'
}

export function useEvidenceUpload(matchId: Ref<string>) {
  const evidenceStore = useEvidenceStore()

  const { uploads, isUploading, completedItems, uploadFile: rawUpload, removeUpload, clear } =
    useFileUpload<EvidenceMeta>({
      async onUpload(file, item) {
        const resolvedType = item.meta.evidenceType || deriveEvidenceType(file)

        const uploadInfo = await evidenceStore.initiateUpload(matchId.value, {
          file_name: file.name,
          file_size_bytes: file.size,
          mime_type: file.type || 'application/octet-stream',
          evidence_type: resolvedType,
          game_number: item.meta.gameNumber ?? null,
        })

        item.meta.evidenceId = uploadInfo.evidence_id

        return {
          url: uploadInfo.upload_url,
          method: uploadInfo.upload_method || 'PUT',
          headers: uploadInfo.upload_headers as Record<string, string> | undefined,
          body: file,
        }
      },

      async onComplete(item) {
        if (item.meta.evidenceId) {
          await evidenceStore.completeUpload(matchId.value, item.meta.evidenceId)
        }
      },
    })

  const completedEvidenceIds = computed(() =>
    completedItems.value
      .filter((u) => u.meta.evidenceId)
      .map((u) => u.meta.evidenceId!),
  )

  async function uploadFile(file: File, evidenceType?: string, gameNumber?: number) {
    await rawUpload(file, {
      evidenceId: null,
      evidenceType,
      gameNumber,
    })
  }

  return { uploads, isUploading, completedEvidenceIds, uploadFile, removeUpload, clear }
}
