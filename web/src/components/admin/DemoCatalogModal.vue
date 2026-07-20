<template>
  <v-dialog v-model="open" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex align-center">
        <v-icon class="mr-2">mdi-plus-circle</v-icon>
        Catalog Demo
        <v-spacer />
        <v-btn aria-label="Close" icon variant="text" size="small" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-card-text>
        <!-- Mode Toggle -->
        <v-btn-toggle v-model="mode" mandatory class="mb-4" density="compact">
          <v-btn value="single" size="small">Single</v-btn>
          <v-btn value="batch" size="small">Batch</v-btn>
        </v-btn-toggle>

        <!-- Single Mode -->
        <template v-if="mode === 'single'">
          <v-select
            v-model="form.game_id"
            :items="gameOptions"
            label="Game *"
            variant="outlined"
            density="compact"
            class="mb-3"
            :rules="[v => !!v || 'Game is required']"
          />
          <v-text-field
            v-model="form.s3_bucket"
            label="S3 Bucket *"
            variant="outlined"
            density="compact"
            class="mb-3"
            :rules="[v => !!v || 'S3 bucket is required']"
          />
          <v-text-field
            v-model="form.s3_key"
            label="S3 Key *"
            variant="outlined"
            density="compact"
            class="mb-3"
            placeholder="demos/2024/match_12345.dem.bz2"
            :rules="[v => !!v || 'S3 key is required']"
          />
          <v-text-field
            v-model="form.file_name"
            label="File Name *"
            variant="outlined"
            density="compact"
            class="mb-3"
            :rules="[v => !!v || 'File name is required']"
          />
          <v-text-field
            v-model.number="form.file_size_bytes"
            label="File Size (bytes)"
            variant="outlined"
            density="compact"
            type="number"
          />
        </template>

        <!-- Batch Mode -->
        <template v-else>
          <v-select
            v-model="batchGameId"
            :items="gameOptions"
            label="Game *"
            variant="outlined"
            density="compact"
            class="mb-3"
            :rules="[v => !!v || 'Game is required']"
          />
          <v-textarea
            v-model="batchInput"
            label="S3 Keys (one per line) *"
            variant="outlined"
            density="compact"
            rows="6"
            placeholder="s3://bucket/demos/match1.dem.bz2&#10;s3://bucket/demos/match2.dem.bz2"
            persistent-hint
            hint="Format: s3://bucket/key or bucket/key (one per line, max 500)"
          />
          <div v-if="parsedBatchCount > 0" class="text-caption text-medium-emphasis mt-1">
            {{ parsedBatchCount }} entries parsed
          </div>
        </template>

        <!-- Error -->
        <v-alert v-if="errorMsg" type="error" density="compact" class="mt-3" closable @click:close="errorMsg = null">
          {{ errorMsg }}
        </v-alert>

        <!-- Batch Results -->
        <template v-if="batchResult">
          <v-alert type="success" density="compact" class="mt-3" v-if="batchResult.created.length">
            {{ batchResult.created.length }} demos cataloged
          </v-alert>
          <v-alert type="info" density="compact" class="mt-2" v-if="batchResult.existing.length">
            {{ batchResult.existing.length }} already existed
          </v-alert>
          <v-alert type="error" density="compact" class="mt-2" v-if="batchResult.errors.length">
            {{ batchResult.errors.length }} failed:
            <ul class="ml-4 mt-1">
              <li v-for="err in batchResult.errors.slice(0, 5)" :key="err.s3_key" class="text-caption">
                {{ err.s3_key }}: {{ err.error }}
              </li>
            </ul>
          </v-alert>
        </template>
      </v-card-text>

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="submitting"
          :disabled="!canSubmit"
          @click="submit"
        >
          {{ mode === 'single' ? 'Catalog' : 'Batch Catalog' }}
        </v-btn>
      </v-card-actions>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { ref, computed, watch } from 'vue'
import { useDemosStore, type BatchCatalogResultResponse } from '@/stores/demos'
import { useGamesStore } from '@/stores/games'

const emit = defineEmits<{  'cataloged': []
}>()

const open = defineModel<boolean>({ required: true })

const demosStore = useDemosStore()
const gamesStore = useGamesStore()

const mode = ref<'single' | 'batch'>('single')
const submitting = ref(false)
const errorMsg = ref<string | null>(null)
const batchResult = ref<BatchCatalogResultResponse | null>(null)

// Single form
const form = ref({
  game_id: '',
  s3_bucket: '',
  s3_key: '',
  file_name: '',
  file_size_bytes: null as number | null,
})

// Batch form
const batchGameId = ref('')
const batchInput = ref('')

const gameOptions = computed(() =>
  gamesStore.games.map(g => ({ title: g.display_name, value: g.id }))
)

const parsedBatchEntries = computed(() => {
  if (!batchInput.value.trim()) return []
  return batchInput.value
    .split('\n')
    .map(line => line.trim())
    .filter(Boolean)
    .map(line => {
      // Parse s3://bucket/key or bucket/key
      const s3Match = line.match(/^s3:\/\/([^/]+)\/(.+)$/)
      if (s3Match) {
        return { s3_bucket: s3Match[1]!, s3_key: s3Match[2]!, file_name: s3Match[2]!.split('/').pop()! }
      }
      const slashIdx = line.indexOf('/')
      if (slashIdx > 0) {
        return { s3_bucket: line.slice(0, slashIdx), s3_key: line.slice(slashIdx + 1), file_name: line.slice(slashIdx + 1).split('/').pop()! }
      }
      return null
    })
    .filter(Boolean) as { s3_bucket: string; s3_key: string; file_name: string }[]
})

const parsedBatchCount = computed(() => parsedBatchEntries.value.length)

const canSubmit = computed(() => {
  if (submitting.value) return false
  if (mode.value === 'single') {
    return !!(form.value.game_id && form.value.s3_bucket && form.value.s3_key && form.value.file_name)
  }
  return !!(batchGameId.value && parsedBatchCount.value > 0)
})

// Reset on open
watch(open, (open) => {
  if (open) {
    form.value = { game_id: '', s3_bucket: '', s3_key: '', file_name: '', file_size_bytes: null }
    batchGameId.value = ''
    batchInput.value = ''
    errorMsg.value = null
    batchResult.value = null
  }
})

async function submit() {
  submitting.value = true
  errorMsg.value = null
  batchResult.value = null

  try {
    if (mode.value === 'single') {
      await demosStore.catalogSingle({
        game_id: form.value.game_id,
        s3_bucket: form.value.s3_bucket,
        s3_key: form.value.s3_key,
        file_name: form.value.file_name,
        file_size_bytes: form.value.file_size_bytes,
      })
      emit('cataloged')
      close()
    } else {
      const result = await demosStore.catalogBatch({
        game_id: batchGameId.value,
        demos: parsedBatchEntries.value.map(e => ({
          s3_bucket: e.s3_bucket,
          s3_key: e.s3_key,
          file_name: e.file_name,
        })),
      })
      batchResult.value = result
      if (result.created.length > 0) {
        emit('cataloged')
      }
    }
  } catch (e: unknown) {
    errorMsg.value = e instanceof Error ? e.message : 'An error occurred'
  } finally {
    submitting.value = false
  }
}

function close() {
  open.value = false
}
</script>
