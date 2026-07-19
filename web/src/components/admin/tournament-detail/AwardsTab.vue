<template>
  <v-card-text data-testid="admin-awards-tab">
    <!-- Add from template -->
    <div class="mb-6">
      <h3 class="text-h6 mb-2">
        <v-icon start size="20">mdi-shape-plus</v-icon>
        Add from Template
      </h3>
      <p v-if="availableTemplates.length === 0 && !awardsStore.fetchTemplatesState.loading" class="text-grey text-body-2">
        All templates for this game have been added.
      </p>
      <v-chip-group v-else column>
        <v-chip
          v-for="template in availableTemplates"
          :key="template.id"
          :prepend-icon="template.icon || 'mdi-trophy'"
          variant="tonal"
          :disabled="awardsStore.createAwardState.loading"
          data-testid="template-chip"
          @click="addFromTemplate(template)"
        >
          {{ template.name }}
          <v-icon end size="16">mdi-plus</v-icon>
        </v-chip>
      </v-chip-group>
    </div>

    <!-- Custom award -->
    <div class="d-flex align-center mb-4">
      <h3 class="text-h6">
        <v-icon start size="20">mdi-trophy-award</v-icon>
        Awards
        <v-chip size="x-small" variant="tonal" class="ml-2">{{ scopedAwards.length }}</v-chip>
      </h3>
      <v-spacer />
      <v-btn
        color="primary"
        variant="tonal"
        prepend-icon="mdi-plus"
        data-testid="add-custom-award"
        @click="openCustomDialog"
      >
        Custom Award
      </v-btn>
    </div>

    <!-- Awards list -->
    <div v-if="awardsStore.fetchAwardsState.loading && scopedAwards.length === 0" class="text-center pa-6">
      <v-progress-circular indeterminate color="primary" size="32" />
    </div>
    <v-list v-else-if="scopedAwards.length > 0" lines="two" data-testid="admin-awards-list">
      <v-list-item
        v-for="award in scopedAwards"
        :key="award.id"
        data-testid="admin-award-row"
      >
        <template v-slot:prepend>
          <v-avatar :color="award.color || 'primary'" variant="tonal">
            <v-icon :icon="award.icon || 'mdi-trophy'" />
          </v-avatar>
        </template>
        <v-list-item-title class="d-flex align-center">
          {{ award.name }}
          <v-chip
            size="x-small"
            class="ml-2"
            variant="tonal"
            :color="statusColor(award.status)"
            :data-testid="`award-status-${award.status}`"
          >
            {{ award.status }}
          </v-chip>
        </v-list-item-title>
        <v-list-item-subtitle>
          {{ award.stat_key }} · {{ aggregationLabel(award.aggregation) }}
          <span v-if="award.min_qualifier_value">
            · min {{ award.min_qualifier_value }} {{ award.min_qualifier_type }}
          </span>
        </v-list-item-subtitle>
        <template v-slot:append>
          <div class="d-flex ga-1">
            <v-btn
              v-if="award.status === 'active'"
              icon
              variant="text"
              size="small"
              data-testid="edit-award"
              @click="openEditDialog(award)"
            >
              <v-icon size="18">mdi-pencil</v-icon>
              <v-tooltip activator="parent" location="top">Edit</v-tooltip>
            </v-btn>
            <v-btn
              v-if="award.status === 'active'"
              color="amber-darken-2"
              variant="tonal"
              size="small"
              prepend-icon="mdi-trophy"
              :loading="awardsStore.finalizeAwardState.loading && actionAwardId === award.id"
              data-testid="finalize-award"
              @click="confirmFinalize(award)"
            >
              Finalize
            </v-btn>
            <v-btn
              v-if="award.status === 'active'"
              icon
              variant="text"
              size="small"
              color="error"
              data-testid="void-award"
              @click="confirmVoid(award)"
            >
              <v-icon size="18">mdi-delete</v-icon>
              <v-tooltip activator="parent" location="top">Void</v-tooltip>
            </v-btn>
          </div>
        </template>
      </v-list-item>
    </v-list>
    <div v-else class="text-center pa-6 text-grey">
      No awards yet. Add one from a template or create a custom award.
    </div>

    <!-- Custom award dialog -->
    <CustomAwardDialog
      v-model="customDialogOpen"
      :stat-catalog="awardsStore.statCatalog"
      :loading="awardsStore.createAwardState.loading"
      :error-message="awardsStore.createAwardState.error"
      @submit="handleCreateCustom"
    />

    <!-- Edit award dialog (presentation fields only) -->
    <v-dialog v-model="editDialogOpen" max-width="520" persistent>
      <v-card v-if="editingAward" data-testid="edit-award-dialog">
        <v-card-title class="d-flex align-center">
          <v-icon class="mr-2">mdi-pencil</v-icon>
          Edit Award
          <v-spacer />
          <v-btn icon variant="text" size="small" @click="editDialogOpen = false">
            <v-icon>mdi-close</v-icon>
          </v-btn>
        </v-card-title>
        <v-card-text>
          <v-text-field
            v-model="editForm.name"
            label="Name *"
            variant="outlined"
            density="compact"
            class="mb-3"
            data-testid="edit-award-name"
          />
          <v-textarea
            v-model="editForm.description"
            label="Description"
            variant="outlined"
            density="compact"
            rows="2"
            class="mb-3"
          />
          <div class="mb-3">
            <v-label class="mb-1 text-caption">Icon</v-label>
            <v-chip-group v-model="editForm.icon" column mandatory>
              <v-chip v-for="icon in AWARD_ICONS" :key="icon" :value="icon" filter size="small">
                <v-icon :icon="icon" size="18" />
              </v-chip>
            </v-chip-group>
          </div>
          <div class="mb-1">
            <v-label class="mb-1 text-caption">Accent Color</v-label>
            <div class="d-flex ga-2 flex-wrap">
              <v-btn
                v-for="color in AWARD_COLORS"
                :key="color"
                :style="{ backgroundColor: color }"
                size="x-small"
                icon
                :variant="editForm.color === color ? 'elevated' : 'flat'"
                @click="editForm.color = color"
              >
                <v-icon v-if="editForm.color === color" size="14" color="white">mdi-check</v-icon>
              </v-btn>
            </div>
          </div>
          <v-alert
            v-if="awardsStore.updateAwardState.error"
            type="error"
            density="compact"
            class="mt-3"
          >
            {{ awardsStore.updateAwardState.error }}
          </v-alert>
        </v-card-text>
        <v-card-actions>
          <v-spacer />
          <v-btn variant="text" @click="editDialogOpen = false">Cancel</v-btn>
          <v-btn
            color="primary"
            variant="flat"
            :loading="awardsStore.updateAwardState.loading"
            :disabled="!editForm.name.trim()"
            data-testid="edit-award-save"
            @click="handleSaveEdit"
          >
            Save
          </v-btn>
        </v-card-actions>
      </v-card>
    </v-dialog>

    <!-- Confirm dialog (finalize / void) -->
    <ConfirmDialog
      :open="confirmDialog.state.open"
      :title="confirmDialog.state.title"
      :message="confirmDialog.state.message"
      :action-label="confirmDialog.state.actionLabel"
      :color="confirmDialog.state.color"
      :loading="confirmDialog.state.loading"
      @confirm="confirmDialog.execute"
      @cancel="confirmDialog.cancel"
    />
  </v-card-text>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useAwardsStore, type AwardResponse, type AwardTemplateResponse, type AwardScopeType, type CreateAwardRequest } from '@/stores/awards'
import { useSnackbar } from '@/composables/useSnackbar'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { AWARD_ICONS, AWARD_COLORS, AGGREGATION_OPTIONS, buildTemplateAwardPayload } from '@/utils/awards'
import CustomAwardDialog from '@/components/awards/CustomAwardDialog.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const props = defineProps<{
  scopeType: AwardScopeType
  scopeId: string
  gameId: string
}>()

const awardsStore = useAwardsStore()
const snackbar = useSnackbar()
const confirmDialog = useConfirmDialog()

const customDialogOpen = ref(false)
const editDialogOpen = ref(false)
const editingAward = ref<AwardResponse | null>(null)
const editForm = ref({ name: '', description: '', icon: 'mdi-trophy', color: null as string | null })
const actionAwardId = ref<string | null>(null)

const scopedAwards = computed(() =>
  awardsStore.awards.filter(
    (a) => a.scope_type === props.scopeType && a.scope_id === props.scopeId && a.status !== 'void',
  ),
)

/** Templates not yet instantiated in this scope (by template id or name). */
const availableTemplates = computed(() => {
  const usedTemplateIds = new Set(
    scopedAwards.value.map((a) => a.template_id).filter((id): id is string => !!id),
  )
  const usedNames = new Set(scopedAwards.value.map((a) => a.name.toLowerCase()))
  return awardsStore.templates.filter(
    (t) => !usedTemplateIds.has(t.id) && !usedNames.has(t.name.toLowerCase()),
  )
})

function aggregationLabel(value: string): string {
  return AGGREGATION_OPTIONS.find((o) => o.value === value)?.title ?? value
}

function statusColor(status: string): string {
  switch (status) {
    case 'finalized':
      return 'amber-darken-2'
    case 'void':
      return 'grey'
    default:
      return 'success'
  }
}

async function addFromTemplate(template: AwardTemplateResponse) {
  try {
    await awardsStore.createAward(props.scopeType, props.scopeId, buildTemplateAwardPayload(template.key))
    snackbar.success(`"${template.name}" award added`)
  } catch {
    snackbar.error(awardsStore.createAwardState.error || 'Failed to add award')
  }
}

function openCustomDialog() {
  awardsStore.createAwardState.error = null
  customDialogOpen.value = true
}

async function handleCreateCustom(payload: CreateAwardRequest) {
  try {
    const award = await awardsStore.createAward(props.scopeType, props.scopeId, payload)
    customDialogOpen.value = false
    snackbar.success(`"${award.name}" award created`)
  } catch {
    // Error shown inside the dialog via createAwardState.error
  }
}

function openEditDialog(award: AwardResponse) {
  editingAward.value = award
  editForm.value = {
    name: award.name,
    description: award.description ?? '',
    icon: award.icon ?? 'mdi-trophy',
    color: award.color ?? null,
  }
  awardsStore.updateAwardState.error = null
  editDialogOpen.value = true
}

async function handleSaveEdit() {
  if (!editingAward.value) return
  try {
    const updated = await awardsStore.updateAward(props.scopeType, props.scopeId, editingAward.value.id, {
      name: editForm.value.name.trim(),
      description: editForm.value.description.trim() || null,
      icon: editForm.value.icon,
      color: editForm.value.color,
    })
    editDialogOpen.value = false
    snackbar.success(`"${updated.name}" updated`)
  } catch {
    // Error shown inside the dialog via updateAwardState.error
  }
}

function confirmFinalize(award: AwardResponse) {
  confirmDialog.confirm({
    title: 'Finalize Award',
    message: `Finalize "${award.name}"? The current podium will be snapshotted and the award marked as finalized.`,
    action: 'Finalize',
    color: 'warning',
    handler: async () => {
      actionAwardId.value = award.id
      try {
        await awardsStore.finalizeAward(props.scopeType, props.scopeId, award.id)
        snackbar.success(`"${award.name}" finalized`)
      } catch {
        snackbar.error(awardsStore.finalizeAwardState.error || 'Failed to finalize award')
      } finally {
        actionAwardId.value = null
      }
    },
  })
}

function confirmVoid(award: AwardResponse) {
  confirmDialog.confirm({
    title: 'Void Award',
    message: `Void "${award.name}"? It will no longer appear on the public awards page.`,
    action: 'Void',
    color: 'error',
    handler: async () => {
      try {
        await awardsStore.voidAward(props.scopeType, props.scopeId, award.id)
        snackbar.success(`"${award.name}" voided`)
      } catch {
        snackbar.error(awardsStore.voidAwardState.error || 'Failed to void award')
      }
    },
  })
}

async function fetchData() {
  if (!props.scopeId || !props.gameId) return
  await Promise.allSettled([
    awardsStore.fetchAwards(props.scopeType, props.scopeId),
    awardsStore.fetchTemplates(props.gameId),
    awardsStore.fetchStatCatalog(props.gameId),
  ])
}

watch(() => [props.scopeType, props.scopeId, props.gameId], fetchData)
onMounted(fetchData)
</script>
