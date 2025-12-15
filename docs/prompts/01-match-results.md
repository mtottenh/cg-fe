# Match Results System Implementation (Phase 1 of 3)

## Priority: HIGH (Core Match Experience)

## CRITICAL: Read Architecture Document First

**Before doing ANYTHING, read `00-match-evidence-architecture.md` in this directory.**

This prompt is **Phase 1 of 3** in the Match Result & Evidence flow:
- **Phase 1 (this prompt)**: Result submission with evidence UI shell
- Phase 2 (prompt 03): Full evidence upload/management
- Phase 3 (prompt 06): Demo catalog integration

Your implementation MUST follow the architecture document to ensure seamless integration with future phases.

## Overview

Implement the **Match Result Submission System** foundation. Players can submit scores and see the evidence attachment interface, but evidence uploads won't actually work yet - that's Phase 2.

## IMPORTANT: Think Carefully

This is the foundation for a 3-phase feature. Consider:
- Component structure must accommodate future evidence features
- Store design must work with evidence store that comes later
- UI must have proper placeholders for unimplemented features
- Don't take shortcuts that will require refactoring in Phase 2

## Prerequisites

1. Ensure the backend is running: `./run.sh`
2. Regenerate OpenAPI types: `cd ../web && npm run generate:api`
3. **Read `00-match-evidence-architecture.md`** - understand the full picture
4. Review result-related schemas in `src/api/types.ts`

## Backend Endpoints to Integrate

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/v1/matches/{match_id}/result` | Submit a result claim |
| `GET` | `/v1/matches/{match_id}/result` | Get current result state |
| `GET` | `/v1/matches/{match_id}/result/history` | Get result submission history |
| `POST` | `/v1/matches/{match_id}/result/{claim_id}/confirm` | Confirm opponent's result |
| `POST` | `/v1/matches/{match_id}/result/{claim_id}/dispute` | Dispute a result claim |

## Implementation Tasks

### 1. Create Pinia Store: `src/stores/matchResults.ts`

```typescript
import { defineStore } from 'pinia'
import { ref } from 'vue'
import { api, ApiError } from '@/api'
import type { components } from '@/api/types'

type ResultClaimResponse = components['schemas']['ResultClaimResponse']
type SubmitResultRequest = components['schemas']['SubmitResultRequest']
type ApiErrorResponse = components['schemas']['ApiError']

export const useMatchResultsStore = defineStore('matchResults', () => {
  // State
  const currentResult = ref<ResultClaimResponse | null>(null)
  const resultHistory = ref<ResultClaimResponse[]>([])
  const loading = ref(false)
  const error = ref<string | null>(null)

  // Actions
  async function fetchCurrentResult(matchId: string): Promise<ResultClaimResponse | null> {
    // Implementation following matchScheduling.ts pattern
    // Handle 404 as "no result yet" (valid state)
  }

  async function fetchResultHistory(matchId: string): Promise<ResultClaimResponse[]> {
    // Implementation
  }

  /**
   * Submit a result claim.
   *
   * IMPORTANT: evidenceIds parameter is for Phase 2 integration.
   * In Phase 1, this will always be an empty array, but the parameter
   * must exist for future compatibility.
   */
  async function submitResult(
    matchId: string,
    scores: GameScore[],
    evidenceIds: string[] = []  // ← Ready for Phase 2
  ): Promise<ResultClaimResponse> {
    // Submit to API with scores and evidenceIds
  }

  async function confirmResult(
    matchId: string,
    claimId: string
  ): Promise<ResultClaimResponse> {
    // Implementation
  }

  /**
   * Dispute a result claim.
   *
   * IMPORTANT: evidenceIds parameter is for Phase 2 integration.
   */
  async function disputeResult(
    matchId: string,
    claimId: string,
    reason: string,
    evidenceIds: string[] = []  // ← Ready for Phase 2
  ): Promise<void> {
    // Implementation
  }

  function clear() { /* ... */ }
  function $reset() { clear() }

  return {
    currentResult,
    resultHistory,
    loading,
    error,
    fetchCurrentResult,
    fetchResultHistory,
    submitResult,
    confirmResult,
    disputeResult,
    clear,
    $reset,
  }
})

// Helper types
export interface GameScore {
  gameNumber: number
  teamAScore: number
  teamBScore: number
}
```

### 2. Create Evidence Shell Components

These are UI shells that will be completed in Phase 2. They need to exist now for the result submission UI.

#### `src/components/match/evidence/EvidenceAttachmentPanel.vue`

```vue
<template>
  <v-card variant="outlined" class="evidence-attachment-panel">
    <v-card-title class="text-subtitle-1">
      Attach Evidence (recommended)
    </v-card-title>

    <v-card-text>
      <!-- Tab selector for evidence types -->
      <EvidenceTypeSelector v-model="activeTab" />

      <!-- Tab content -->
      <div class="tab-content mt-4">
        <!-- Upload Image: Basic UI now, full functionality in Phase 2 -->
        <div v-if="activeTab === 'upload'">
          <EvidenceUploadZone
            accept="image/*"
            @file-selected="handleFileSelected"
          />
          <p class="text-caption text-grey mt-2">
            <!-- Phase 1: Show note about local-only -->
            Evidence upload will be available soon. Files selected here
            will be shown but not uploaded.
          </p>
        </div>

        <!-- Link URL: Placeholder for Phase 2 -->
        <div v-else-if="activeTab === 'link'">
          <v-alert type="info" variant="tonal">
            External link attachment coming soon.
          </v-alert>
        </div>

        <!-- Demo Upload: Placeholder for Phase 2 -->
        <div v-else-if="activeTab === 'demo'">
          <v-alert type="info" variant="tonal">
            Demo file upload coming soon.
          </v-alert>
        </div>

        <!-- Browse Demos: Placeholder for Phase 3 -->
        <div v-else-if="activeTab === 'browse'">
          <v-alert type="info" variant="tonal">
            Demo browser coming soon.
          </v-alert>
        </div>
      </div>

      <!-- Attached evidence list (local only in Phase 1) -->
      <EvidenceList
        v-if="localEvidence.length > 0"
        :evidence="localEvidence"
        @remove="removeEvidence"
        class="mt-4"
      />
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { ref } from 'vue'
import EvidenceTypeSelector from './EvidenceTypeSelector.vue'
import EvidenceUploadZone from './EvidenceUploadZone.vue'
import EvidenceList from './EvidenceList.vue'

// Props
defineProps<{
  matchId: string
}>()

// Emits - ready for Phase 2 integration
const emit = defineEmits<{
  'update:evidenceIds': [ids: string[]]
}>()

// Local state (Phase 1: no actual uploads)
const activeTab = ref<'upload' | 'link' | 'demo' | 'browse'>('upload')
const localEvidence = ref<LocalEvidence[]>([])

interface LocalEvidence {
  localId: string
  name: string
  type: 'image' | 'demo' | 'link'
  preview?: string
}

function handleFileSelected(file: File) {
  // Phase 1: Store locally only, show in list
  const localId = `local-${Date.now()}`
  localEvidence.value.push({
    localId,
    name: file.name,
    type: 'image',
    preview: URL.createObjectURL(file)
  })

  // Phase 1: Emit empty array (no real evidence IDs yet)
  // Phase 2 will emit actual evidence IDs after upload
  emit('update:evidenceIds', [])
}

function removeEvidence(localId: string) {
  localEvidence.value = localEvidence.value.filter(e => e.localId !== localId)
  emit('update:evidenceIds', [])
}
</script>
```

#### `src/components/match/evidence/EvidenceTypeSelector.vue`

```vue
<template>
  <v-btn-toggle v-model="modelValue" mandatory variant="outlined" divided>
    <v-btn value="upload" size="small">
      <v-icon start>mdi-image</v-icon>
      Upload Image
    </v-btn>
    <v-btn value="link" size="small" :disabled="!linkEnabled">
      <v-icon start>mdi-link</v-icon>
      Link URL
    </v-btn>
    <v-btn value="demo" size="small" :disabled="!demoEnabled">
      <v-icon start>mdi-file-video</v-icon>
      Demo File
    </v-btn>
    <v-btn value="browse" size="small" :disabled="!browseEnabled">
      <v-icon start>mdi-folder-search</v-icon>
      Browse Demos
    </v-btn>
  </v-btn-toggle>
</template>

<script setup lang="ts">
// Phase 1: Only upload is enabled
// Phase 2: link and demo will be enabled
// Phase 3: browse will be enabled
defineProps<{
  linkEnabled?: boolean   // Phase 2
  demoEnabled?: boolean   // Phase 2
  browseEnabled?: boolean // Phase 3
}>()

const modelValue = defineModel<'upload' | 'link' | 'demo' | 'browse'>()
</script>
```

#### `src/components/match/evidence/EvidenceUploadZone.vue`

Basic drag-drop zone (will be enhanced in Phase 2):

```vue
<template>
  <div
    class="upload-zone"
    :class="{ 'drag-over': isDragOver }"
    @dragover.prevent="isDragOver = true"
    @dragleave="isDragOver = false"
    @drop.prevent="handleDrop"
    @click="triggerFileInput"
  >
    <v-icon size="48" color="grey">mdi-cloud-upload</v-icon>
    <p class="mt-2">Drag & drop {{ acceptLabel }} here</p>
    <p class="text-caption">or click to browse</p>

    <input
      ref="fileInput"
      type="file"
      :accept="accept"
      hidden
      @change="handleFileChange"
    />
  </div>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'

const props = defineProps<{
  accept?: string
}>()

const emit = defineEmits<{
  'file-selected': [file: File]
}>()

const fileInput = ref<HTMLInputElement>()
const isDragOver = ref(false)

const acceptLabel = computed(() => {
  if (props.accept?.includes('image')) return 'images'
  if (props.accept?.includes('.dem')) return 'demo files'
  return 'files'
})

function triggerFileInput() {
  fileInput.value?.click()
}

function handleDrop(e: DragEvent) {
  isDragOver.value = false
  const file = e.dataTransfer?.files[0]
  if (file) emit('file-selected', file)
}

function handleFileChange(e: Event) {
  const file = (e.target as HTMLInputElement).files?.[0]
  if (file) emit('file-selected', file)
}
</script>

<style scoped>
.upload-zone {
  border: 2px dashed #ccc;
  border-radius: 8px;
  padding: 32px;
  text-align: center;
  cursor: pointer;
  transition: all 0.2s;
}
.upload-zone:hover, .upload-zone.drag-over {
  border-color: rgb(var(--v-theme-primary));
  background: rgba(var(--v-theme-primary), 0.05);
}
</style>
```

#### `src/components/match/evidence/EvidenceList.vue`

```vue
<template>
  <div class="evidence-list">
    <p class="text-subtitle-2 mb-2">Attached ({{ evidence.length }})</p>
    <div class="d-flex flex-wrap gap-2">
      <EvidenceCard
        v-for="item in evidence"
        :key="item.localId"
        :evidence="item"
        @remove="$emit('remove', item.localId)"
      />
    </div>
  </div>
</template>

<script setup lang="ts">
interface LocalEvidence {
  localId: string
  name: string
  type: string
  preview?: string
}

defineProps<{
  evidence: LocalEvidence[]
}>()

defineEmits<{
  remove: [localId: string]
}>()
</script>
```

#### `src/components/match/evidence/EvidenceCard.vue`

```vue
<template>
  <v-card variant="outlined" class="evidence-card">
    <div class="d-flex align-center pa-2">
      <v-icon class="mr-2">{{ icon }}</v-icon>
      <span class="text-body-2 text-truncate flex-grow-1">{{ evidence.name }}</span>
      <v-btn icon="mdi-close" size="x-small" variant="text" @click="$emit('remove')" />
    </div>
    <img v-if="evidence.preview" :src="evidence.preview" class="preview" />
  </v-card>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{
  evidence: {
    localId: string
    name: string
    type: string
    preview?: string
  }
}>()

defineEmits<{
  remove: []
}>()

const icon = computed(() => {
  switch (props.evidence.type) {
    case 'image': return 'mdi-image'
    case 'demo': return 'mdi-file-video'
    case 'link': return 'mdi-link'
    default: return 'mdi-file'
  }
})
</script>

<style scoped>
.evidence-card { max-width: 200px; }
.preview { width: 100%; height: 80px; object-fit: cover; }
</style>
```

### 3. Create Result Components

#### `src/components/match/results/ResultSubmissionPanel.vue`

Main result submission panel. **This is the primary component for Phase 1.**

```vue
<template>
  <v-card>
    <v-card-title>Submit Match Result</v-card-title>

    <v-card-text>
      <!-- Score inputs for each game in the match -->
      <ScoreInput
        v-for="game in matchFormat"
        :key="game"
        :game-number="game"
        :team-a-name="teamAName"
        :team-b-name="teamBName"
        v-model:team-a-score="scores[game - 1].teamAScore"
        v-model:team-b-score="scores[game - 1].teamBScore"
      />

      <!-- Series winner display -->
      <v-alert v-if="seriesWinner" :type="seriesWinnerType" class="mt-4">
        Series Winner: {{ seriesWinner }}
      </v-alert>

      <!-- Evidence attachment - integrated as per architecture -->
      <EvidenceAttachmentPanel
        :match-id="matchId"
        class="mt-4"
        @update:evidence-ids="evidenceIds = $event"
      />
    </v-card-text>

    <v-card-actions>
      <v-spacer />
      <v-btn
        color="primary"
        :loading="loading"
        :disabled="!isValidSubmission"
        @click="handleSubmit"
      >
        Submit Result
      </v-btn>
    </v-card-actions>
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import { useMatchResultsStore, type GameScore } from '@/stores/matchResults'
import ScoreInput from './ScoreInput.vue'
import EvidenceAttachmentPanel from '../evidence/EvidenceAttachmentPanel.vue'

const props = defineProps<{
  matchId: string
  tournamentId: string
  teamAName: string
  teamBName: string
  matchFormat: number // 1, 3, or 5 for BO1, BO3, BO5
}>()

const emit = defineEmits<{
  submitted: []
}>()

const store = useMatchResultsStore()
const loading = computed(() => store.loading)

// Initialize scores array based on match format
const scores = ref<GameScore[]>(
  Array.from({ length: props.matchFormat }, (_, i) => ({
    gameNumber: i + 1,
    teamAScore: 0,
    teamBScore: 0
  }))
)

// Evidence IDs from EvidenceAttachmentPanel
// Phase 1: This will always be empty
// Phase 2: This will contain real IDs after uploads
const evidenceIds = ref<string[]>([])

// Computed: determine series winner
const seriesWinner = computed(() => {
  const winsNeeded = Math.ceil(props.matchFormat / 2)
  let teamAWins = 0
  let teamBWins = 0

  for (const score of scores.value) {
    if (score.teamAScore > score.teamBScore) teamAWins++
    else if (score.teamBScore > score.teamAScore) teamBWins++
  }

  if (teamAWins >= winsNeeded) return props.teamAName
  if (teamBWins >= winsNeeded) return props.teamBName
  return null
})

const seriesWinnerType = computed(() => 'success')

const isValidSubmission = computed(() => {
  // Must have a series winner
  if (!seriesWinner.value) return false

  // All played games must have valid scores
  for (const score of scores.value) {
    if (score.teamAScore < 0 || score.teamBScore < 0) return false
    // Can't be a tie in CS2
    if (score.teamAScore === score.teamBScore && score.teamAScore > 0) return false
  }

  return true
})

async function handleSubmit() {
  try {
    await store.submitResult(props.matchId, scores.value, evidenceIds.value)
    emit('submitted')
  } catch (e) {
    // Error handled by store
  }
}
</script>
```

#### `src/components/match/results/ScoreInput.vue`

```vue
<template>
  <div class="score-input">
    <div class="game-label">
      <v-chip size="small" :color="gameColor">
        {{ gameLabel }}
      </v-chip>
    </div>

    <div class="score-row">
      <span class="team-name">{{ teamAName }}</span>
      <v-text-field
        v-model.number="teamAScoreLocal"
        type="number"
        min="0"
        max="99"
        density="compact"
        variant="outlined"
        hide-details
        class="score-field"
        @update:model-value="$emit('update:teamAScore', $event)"
      />
      <span class="vs">-</span>
      <v-text-field
        v-model.number="teamBScoreLocal"
        type="number"
        min="0"
        max="99"
        density="compact"
        variant="outlined"
        hide-details
        class="score-field"
        @update:model-value="$emit('update:teamBScore', $event)"
      />
      <span class="team-name">{{ teamBName }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'

const props = defineProps<{
  gameNumber: number
  teamAName: string
  teamBName: string
  teamAScore: number
  teamBScore: number
}>()

defineEmits<{
  'update:teamAScore': [score: number]
  'update:teamBScore': [score: number]
}>()

const teamAScoreLocal = ref(props.teamAScore)
const teamBScoreLocal = ref(props.teamBScore)

watch(() => props.teamAScore, (v) => teamAScoreLocal.value = v)
watch(() => props.teamBScore, (v) => teamBScoreLocal.value = v)

const gameLabel = computed(() => `Map ${props.gameNumber}`)
const gameColor = computed(() => {
  if (teamAScoreLocal.value > teamBScoreLocal.value) return 'success'
  if (teamBScoreLocal.value > teamAScoreLocal.value) return 'error'
  return 'grey'
})
</script>

<style scoped>
.score-input { margin-bottom: 16px; }
.game-label { margin-bottom: 8px; }
.score-row { display: flex; align-items: center; gap: 8px; }
.team-name { min-width: 100px; }
.score-field { max-width: 70px; }
.vs { font-weight: bold; }
</style>
```

#### `src/components/match/results/ResultConfirmationPanel.vue`

Shown when opponent has submitted a result:

```vue
<template>
  <v-card>
    <v-card-title>
      <v-icon start color="warning">mdi-alert-circle</v-icon>
      Opponent Submitted Result
    </v-card-title>

    <v-card-text>
      <p class="mb-4">{{ opponentName }} has submitted the following result:</p>

      <!-- Display claimed scores -->
      <div v-for="score in claim.scores" :key="score.gameNumber" class="claimed-score">
        <v-chip size="small">Map {{ score.gameNumber }}</v-chip>
        <span class="ml-2">
          {{ teamAName }}: {{ score.teamAScore }} -
          {{ score.teamBScore }} :{{ teamBName }}
        </span>
      </div>

      <v-alert type="info" class="mt-4">
        <strong>Winner:</strong> {{ claim.winner }}
      </v-alert>

      <!-- Show attached evidence if any -->
      <div v-if="claim.evidenceCount > 0" class="mt-4">
        <p class="text-subtitle-2">Evidence attached ({{ claim.evidenceCount }})</p>
        <p class="text-caption text-grey">
          View the Evidence tab for details.
        </p>
      </div>

      <v-divider class="my-4" />

      <p class="text-body-2">
        Do you confirm this result? If you believe it's incorrect, you can dispute it.
      </p>
    </v-card-text>

    <v-card-actions>
      <v-btn color="error" variant="outlined" @click="showDisputeModal = true">
        Dispute
      </v-btn>
      <v-spacer />
      <v-btn color="success" :loading="loading" @click="handleConfirm">
        Confirm Result
      </v-btn>
    </v-card-actions>

    <!-- Dispute modal -->
    <ResultDisputeModal
      v-model="showDisputeModal"
      :match-id="matchId"
      :claim-id="claim.id"
      @disputed="$emit('disputed')"
    />
  </v-card>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMatchResultsStore } from '@/stores/matchResults'
import ResultDisputeModal from './ResultDisputeModal.vue'

const props = defineProps<{
  matchId: string
  claim: {
    id: string
    scores: Array<{ gameNumber: number; teamAScore: number; teamBScore: number }>
    winner: string
    submittedBy: string
    evidenceCount: number
  }
  teamAName: string
  teamBName: string
  opponentName: string
}>()

const emit = defineEmits<{
  confirmed: []
  disputed: []
}>()

const store = useMatchResultsStore()
const loading = computed(() => store.loading)
const showDisputeModal = ref(false)

async function handleConfirm() {
  try {
    await store.confirmResult(props.matchId, props.claim.id)
    emit('confirmed')
  } catch (e) {
    // Error handled by store
  }
}
</script>
```

#### `src/components/match/results/ResultDisputeModal.vue`

```vue
<template>
  <v-dialog v-model="modelValue" max-width="600">
    <v-card>
      <v-card-title>Dispute Result</v-card-title>

      <v-card-text>
        <v-alert type="warning" class="mb-4">
          Disputes are reviewed by tournament administrators. Please provide
          a clear explanation and attach evidence if possible.
        </v-alert>

        <v-textarea
          v-model="reason"
          label="Reason for dispute"
          placeholder="Explain why you believe the submitted result is incorrect..."
          :rules="[v => !!v || 'Reason is required', v => v.length >= 20 || 'Please provide more detail']"
          counter
          rows="4"
        />

        <!-- Evidence attachment for disputes -->
        <EvidenceAttachmentPanel
          :match-id="matchId"
          class="mt-4"
          @update:evidence-ids="evidenceIds = $event"
        />
      </v-card-text>

      <v-card-actions>
        <v-btn variant="text" @click="modelValue = false">Cancel</v-btn>
        <v-spacer />
        <v-btn
          color="error"
          :loading="loading"
          :disabled="!isValid"
          @click="handleDispute"
        >
          Submit Dispute
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed } from 'vue'
import { useMatchResultsStore } from '@/stores/matchResults'
import EvidenceAttachmentPanel from '../evidence/EvidenceAttachmentPanel.vue'

const props = defineProps<{
  matchId: string
  claimId: string
}>()

const emit = defineEmits<{
  disputed: []
}>()

const modelValue = defineModel<boolean>()

const store = useMatchResultsStore()
const loading = computed(() => store.loading)

const reason = ref('')
const evidenceIds = ref<string[]>([])

const isValid = computed(() => reason.value.length >= 20)

async function handleDispute() {
  try {
    await store.disputeResult(props.matchId, props.claimId, reason.value, evidenceIds.value)
    modelValue.value = false
    emit('disputed')
  } catch (e) {
    // Error handled by store
  }
}
</script>
```

#### `src/components/match/results/ResultHistoryTimeline.vue`

```vue
<template>
  <v-timeline density="compact" side="end">
    <v-timeline-item
      v-for="entry in history"
      :key="entry.id"
      :dot-color="getStatusColor(entry.status)"
      size="small"
    >
      <template #opposite>
        <span class="text-caption">{{ formatDate(entry.submittedAt) }}</span>
      </template>

      <v-card variant="outlined" density="compact">
        <v-card-text class="py-2">
          <div class="d-flex align-center">
            <strong>{{ entry.submittedByName }}</strong>
            <v-chip :color="getStatusColor(entry.status)" size="x-small" class="ml-2">
              {{ entry.status }}
            </v-chip>
          </div>
          <div class="text-caption mt-1">
            {{ formatScores(entry.scores) }}
          </div>
        </v-card-text>
      </v-card>
    </v-timeline-item>
  </v-timeline>
</template>

<script setup lang="ts">
defineProps<{
  history: Array<{
    id: string
    submittedByName: string
    submittedAt: string
    status: 'pending' | 'confirmed' | 'disputed' | 'expired'
    scores: Array<{ teamAScore: number; teamBScore: number }>
  }>
}>()

function getStatusColor(status: string) {
  switch (status) {
    case 'pending': return 'warning'
    case 'confirmed': return 'success'
    case 'disputed': return 'error'
    case 'expired': return 'grey'
    default: return 'grey'
  }
}

function formatDate(dateStr: string) {
  return new Date(dateStr).toLocaleString()
}

function formatScores(scores: Array<{ teamAScore: number; teamBScore: number }>) {
  return scores.map((s, i) => `Map ${i + 1}: ${s.teamAScore}-${s.teamBScore}`).join(' | ')
}
</script>
```

### 4. Integrate into Match Detail Page

Update `src/pages/tournaments/MatchDetailPage.vue` to include the result panel in the sidebar.

The key integration points:
- Add result panel to action sidebar
- Show `ResultSubmissionPanel` when awaiting results from current user
- Show `ResultConfirmationPanel` when opponent has submitted
- Show result summary when confirmed

### 5. E2E Tests: `e2e/match-results.spec.ts`

```typescript
import { test, expect } from '@playwright/test'
import { loginAsAdmin } from './fixtures/auth.fixture'
import { testTournaments } from './fixtures/test-data'

test.describe('Match Result Submission (Phase 1)', () => {
  test.describe('Result Submission Panel', () => {
    test('should display result submission panel for participants', async ({ page }) => {
      await loginAsAdmin(page)
      // Navigate to a match in "playing" state
      // Verify panel is visible
    })

    test('should show score inputs for each map in format', async ({ page }) => {
      await loginAsAdmin(page)
      // BO3 should show 3 map inputs
    })

    test('should calculate series winner automatically', async ({ page }) => {
      await loginAsAdmin(page)
      // Enter 2-1 scores, verify winner shown
    })

    test('should validate scores before submission', async ({ page }) => {
      await loginAsAdmin(page)
      // Try to submit without winner, button should be disabled
    })

    test('should submit result successfully', async ({ page }) => {
      await loginAsAdmin(page)
      // Enter valid scores, submit, verify success
    })
  })

  test.describe('Evidence Panel Shell (Phase 1)', () => {
    test('should show evidence attachment panel', async ({ page }) => {
      await loginAsAdmin(page)
      // Verify evidence panel is visible
    })

    test('should show 4 evidence type tabs', async ({ page }) => {
      await loginAsAdmin(page)
      // Verify: Upload Image, Link URL, Demo File, Browse Demos tabs exist
    })

    test('only Upload Image tab should be functional', async ({ page }) => {
      await loginAsAdmin(page)
      // Verify other tabs show "coming soon"
    })

    test('should allow selecting file in upload tab', async ({ page }) => {
      await loginAsAdmin(page)
      // Select file, verify it appears in attached list
    })

    test('attached files should be local only (no upload)', async ({ page }) => {
      await loginAsAdmin(page)
      // Verify files are shown but not actually uploaded
    })
  })

  test.describe('Result Confirmation', () => {
    test('should show confirmation panel when opponent submitted', async ({ page }) => {
      // Need a match with pending result from opponent
    })

    test('should display opponent claimed scores', async ({ page }) => {
      // Verify scores are shown clearly
    })

    test('should allow confirming result', async ({ page }) => {
      // Click confirm, verify match becomes completed
    })

    test('should allow disputing result', async ({ page }) => {
      // Click dispute, verify modal opens
    })
  })

  test.describe('Result Dispute', () => {
    test('dispute modal should require reason', async ({ page }) => {
      // Try to submit without reason, should be disabled
    })

    test('dispute modal should have evidence attachment', async ({ page }) => {
      // Verify evidence panel is present in dispute modal
    })

    test('should submit dispute successfully', async ({ page }) => {
      // Enter reason, submit, verify success
    })
  })
})
```

## File Structure

```
src/
├── stores/
│   └── matchResults.ts                    # Result store
├── components/
│   └── match/
│       ├── evidence/                      # SHELL (completed in Phase 2)
│       │   ├── EvidenceAttachmentPanel.vue
│       │   ├── EvidenceTypeSelector.vue
│       │   ├── EvidenceUploadZone.vue
│       │   ├── EvidenceList.vue
│       │   └── EvidenceCard.vue
│       └── results/                       # FULL IMPLEMENTATION
│           ├── ResultSubmissionPanel.vue
│           ├── ResultConfirmationPanel.vue
│           ├── ResultDisputeModal.vue
│           ├── ScoreInput.vue
│           └── ResultHistoryTimeline.vue
└── pages/
    └── tournaments/
        └── MatchDetailPage.vue            # Integration
e2e/
└── match-results.spec.ts
```

## Phase 1 Completion Checklist

- [ ] Read and understand `00-match-evidence-architecture.md`
- [ ] `matchResults.ts` store created with all methods
- [ ] Evidence shell components created (functional UI, no actual uploads)
- [ ] Result components fully implemented
- [ ] Match detail page integration complete
- [ ] E2E tests pass for result submission and confirmation
- [ ] E2E tests document that evidence upload is placeholder
- [ ] No TypeScript errors
- [ ] Build succeeds

## What Phase 2 Will Add

Phase 2 (Evidence System) will:
1. Complete `EvidenceAttachmentPanel.vue` - actual uploads
2. Enable "Link URL" and "Demo File" tabs
3. Create `evidence.ts` store
4. Add Evidence tab to match detail page
5. Connect evidence IDs to result submission

**Do NOT attempt to implement actual evidence uploads in Phase 1.**
