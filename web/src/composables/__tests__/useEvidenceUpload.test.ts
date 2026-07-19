import { describe, it, expect, beforeEach, afterEach, vi, type Mock } from 'vitest'
import { ref } from 'vue'
import { setActivePinia, createPinia } from 'pinia'

// Mock only the `api` client; keep ApiError & friends real so the store
// helpers (unwrapApi/withActionState) behave exactly as in production.
vi.mock('@/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/api')>()
  return {
    ...actual,
    api: {
      GET: vi.fn(),
      POST: vi.fn(),
      PUT: vi.fn(),
      DELETE: vi.fn(),
      PATCH: vi.fn(),
    },
  }
})

import { api } from '@/api'
import { useEvidenceStore } from '@/stores/evidence'
import { useEvidenceUpload } from '@/composables/useEvidenceUpload'

const mockPost = api.POST as unknown as Mock

const INITIATE_PATH = '/v1/matches/{match_id}/evidence/upload'
const COMPLETE_PATH = '/v1/matches/{match_id}/evidence/{evidence_id}/complete'

const UPLOAD_URL = 'https://storage.example.com/presigned/ev-1?sig=abc123'
const UPLOAD_HEADERS = { 'Content-Type': 'image/png', 'x-amz-tagging': 'evidence' }

interface SentXhr {
  method: string
  url: string
  headers: Record<string, string>
  body: unknown
}

/**
 * Deterministic XMLHttpRequest replacement. useFileUpload drives the presigned
 * PUT through raw XHR (for progress events), so we capture open/setRequestHeader/
 * send and complete the request on a microtask according to `FakeXHR.respond`.
 */
class FakeXHR {
  static sent: SentXhr[] = []
  static respond: { status: number; responseText?: string } | { networkError: true } = {
    status: 200,
  }

  method = ''
  url = ''
  headers: Record<string, string> = {}
  status = 0
  responseText = ''
  upload: { onprogress: ((e: unknown) => void) | null } = { onprogress: null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  ontimeout: (() => void) | null = null

  open(method: string, url: string) {
    this.method = method
    this.url = url
  }

  setRequestHeader(key: string, value: string) {
    this.headers[key] = value
  }

  abort() {}

  send(body: unknown) {
    FakeXHR.sent.push({ method: this.method, url: this.url, headers: this.headers, body })
    queueMicrotask(() => {
      const r = FakeXHR.respond
      if ('networkError' in r) {
        this.onerror?.()
        return
      }
      this.status = r.status
      this.responseText = r.responseText ?? ''
      this.onload?.()
    })
  }
}

/** Route POSTs by path: initiate returns presigned info, complete succeeds. */
function mockUploadApiOk() {
  mockPost.mockImplementation(async (path: string) => {
    if (path === INITIATE_PATH) {
      return {
        data: {
          data: {
            evidence_id: 'ev-1',
            upload_url: UPLOAD_URL,
            upload_method: 'PUT',
            upload_headers: UPLOAD_HEADERS,
            expires_at: '2026-01-01T00:00:00Z',
          },
        },
      }
    }
    if (path === COMPLETE_PATH) {
      return { data: { data: { id: 'ev-1', status: 'uploaded' } } }
    }
    throw new Error(`unexpected POST to ${path}`)
  })
}

function initiateCalls() {
  return mockPost.mock.calls.filter((c) => c[0] === INITIATE_PATH)
}

function completeCalls() {
  return mockPost.mock.calls.filter((c) => c[0] === COMPLETE_PATH)
}

describe('useEvidenceUpload', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    vi.clearAllMocks()
    FakeXHR.sent = []
    FakeXHR.respond = { status: 200 }
    vi.stubGlobal('XMLHttpRequest', FakeXHR)
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  function setup() {
    return useEvidenceUpload(ref('match-1'))
  }

  describe('evidence type resolution', () => {
    const cases: Array<[string, string, string, string]> = [
      // [description, file name, mime type, expected evidence_type]
      ['image/* mime derives screenshot', 'shot.png', 'image/png', 'screenshot'],
      ['.dem extension derives demo', 'round1.dem', '', 'demo'],
      ['video/* mime derives video', 'clip.mp4', 'video/mp4', 'video'],
      ['unknown type falls back to screenshot', 'notes.txt', 'text/plain', 'screenshot'],
    ]

    for (const [name, fileName, mimeType, expected] of cases) {
      it(name, async () => {
        mockUploadApiOk()
        const upload = setup()
        await upload.uploadFile(new File(['x'], fileName, { type: mimeType }))

        expect(initiateCalls()).toHaveLength(1)
        const body = initiateCalls()[0]![1].body
        expect(body.evidence_type).toBe(expected)
      })
    }

    it('explicit evidenceType argument overrides derivation', async () => {
      mockUploadApiOk()
      const upload = setup()
      await upload.uploadFile(new File(['x'], 'shot.png', { type: 'image/png' }), 'other')

      expect(initiateCalls()[0]![1].body.evidence_type).toBe('other')
    })

    it('empty mime type is sent as application/octet-stream', async () => {
      mockUploadApiOk()
      const upload = setup()
      await upload.uploadFile(new File(['x'], 'round1.dem', { type: '' }))

      expect(initiateCalls()[0]![1].body.mime_type).toBe('application/octet-stream')
    })
  })

  describe('initiate → PUT → complete sequence', () => {
    it('runs the full presigned flow and PUTs to the returned URL with only the returned headers', async () => {
      mockUploadApiOk()
      const upload = setup()
      const file = new File(['pixels'], 'shot.png', { type: 'image/png' })

      await upload.uploadFile(file, undefined, 2)

      // 1. Initiate carries file metadata + game number for match-1
      expect(initiateCalls()).toHaveLength(1)
      const [, initiateArgs] = initiateCalls()[0]!
      expect(initiateArgs.params.path.match_id).toBe('match-1')
      expect(initiateArgs.body).toEqual({
        file_name: 'shot.png',
        file_size_bytes: file.size,
        mime_type: 'image/png',
        evidence_type: 'screenshot',
        game_number: 2,
      })

      // 2. Exactly one PUT, to the presigned URL, with exactly the returned
      // headers — and critically NO Authorization header (presigned contract:
      // the signature IS the auth; a bearer token would break S3-style URLs).
      expect(FakeXHR.sent).toHaveLength(1)
      const put = FakeXHR.sent[0]!
      expect(put.method).toBe('PUT')
      expect(put.url).toBe(UPLOAD_URL)
      expect(put.headers).toEqual(UPLOAD_HEADERS)
      const headerKeys = Object.keys(put.headers).map((k) => k.toLowerCase())
      expect(headerKeys).not.toContain('authorization')
      expect(put.body).toBe(file)

      // 3. Complete is called with the evidence id from initiate
      expect(completeCalls()).toHaveLength(1)
      expect(completeCalls()[0]![1].params.path).toEqual({
        match_id: 'match-1',
        evidence_id: 'ev-1',
      })

      // Final state
      expect(upload.uploads.value).toHaveLength(1)
      expect(upload.uploads.value[0]!.status).toBe('complete')
      expect(upload.uploads.value[0]!.progress).toBe(100)
      expect(upload.uploads.value[0]!.error).toBeNull()
      expect(upload.completedEvidenceIds.value).toEqual(['ev-1'])
      expect(upload.isUploading.value).toBe(false)
    })

    it('game_number defaults to null when not provided', async () => {
      mockUploadApiOk()
      const upload = setup()
      await upload.uploadFile(new File(['x'], 'shot.png', { type: 'image/png' }))

      expect(initiateCalls()[0]![1].body.game_number).toBeNull()
    })
  })

  describe('failure handling', () => {
    it('initiate 4xx marks the item errored without sending a PUT or complete', async () => {
      mockPost.mockResolvedValue({ error: { status: 422, detail: 'File too large' } })
      const upload = setup()

      await upload.uploadFile(new File(['x'], 'shot.png', { type: 'image/png' }))

      expect(FakeXHR.sent).toHaveLength(0)
      expect(completeCalls()).toHaveLength(0)

      const item = upload.uploads.value[0]!
      expect(item.status).toBe('error')
      expect(item.error).toBe('File too large')
      expect(item.meta.evidenceId).toBeNull()
      expect(upload.completedEvidenceIds.value).toEqual([])
      expect(upload.isUploading.value).toBe(false)

      // Store action state carries the same error for UI surfaces reading it
      const store = useEvidenceStore()
      expect(store.initiateUploadState.error).toBe('File too large')
    })

    it('PUT rejection (4xx from storage) surfaces the response detail and skips complete', async () => {
      mockUploadApiOk()
      FakeXHR.respond = { status: 403, responseText: '{"detail":"Signature expired"}' }
      const upload = setup()

      await upload.uploadFile(new File(['x'], 'shot.png', { type: 'image/png' }))

      expect(completeCalls()).toHaveLength(0)
      const item = upload.uploads.value[0]!
      expect(item.status).toBe('error')
      expect(item.error).toBe('Signature expired')
      // Evidence record was created server-side before the PUT failed
      expect(item.meta.evidenceId).toBe('ev-1')
      expect(upload.completedEvidenceIds.value).toEqual([])
      expect(upload.isUploading.value).toBe(false)
    })

    it('PUT network error yields a generic network message', async () => {
      mockUploadApiOk()
      FakeXHR.respond = { networkError: true }
      const upload = setup()

      await upload.uploadFile(new File(['x'], 'shot.png', { type: 'image/png' }))

      expect(completeCalls()).toHaveLength(0)
      const item = upload.uploads.value[0]!
      expect(item.status).toBe('error')
      expect(item.error).toBe('Upload failed: network error')
    })
  })
})
