<template>
  <v-dialog
    :fullscreen="smAndDown" v-model="open" max-width="600" persistent>
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>Create New League</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12">
              <v-select
          aria-label="Game"
                v-model="form.game_id"
                :items="activeGames"
                item-title="display_name"
                item-value="id"
                label="Game"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-gamepad-variant"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <template v-slot:prepend>
                      <v-avatar size="24" rounded="sm">
                        <v-img alt="" v-if="item.raw.icon_url" :src="item.raw.icon_url" />
                        <v-icon v-else size="16">mdi-gamepad-variant</v-icon>
                      </v-avatar>
                    </template>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.name"
                label="League Name"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100)]"
                variant="outlined"
                density="comfortable"
                @input="generateSlug"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.slug"
                label="URL Slug"
                :rules="[rules.required, rules.minLength(3), rules.maxLength(100), rules.slug]"
                variant="outlined"
                density="comfortable"
                hint="URL-friendly identifier (lowercase letters, numbers, hyphens)"
                persistent-hint
              />
            </v-col>

            <v-col cols="12">
              <v-textarea
                v-model="form.description"
                label="Description (Optional)"
                :rules="[rules.maxLength(2000)]"
                rows="3"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12">
              <v-text-field
                v-model="form.logo_url"
                label="Logo URL (Optional)"
                :rules="[rules.url]"
                variant="outlined"
                density="comfortable"
                prepend-inner-icon="mdi-image"
              />
            </v-col>

            <v-col cols="12">
              <v-select
          aria-label="Access Type"
                v-model="form.access_type"
                :items="accessTypes"
                item-title="label"
                item-value="value"
                label="Access Type"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              >
                <template v-slot:item="{ item, props: itemProps }">
                  <v-list-item v-bind="itemProps">
                    <v-list-item-subtitle>{{ item.raw.description }}</v-list-item-subtitle>
                  </v-list-item>
                </template>
              </v-select>
            </v-col>

            <!-- Entry Requirements (optional) -->
            <v-col cols="12">
              <v-expansion-panels variant="accordion">
                <v-expansion-panel>
                  <v-expansion-panel-title>
                    Entry Requirements
                    <v-chip
                      v-if="activeRules > 0"
                      size="x-small"
                      color="primary"
                      variant="tonal"
                      class="ml-2"
                    >
                      {{ activeRules }} active
                    </v-chip>
                    <span v-else class="text-medium-emphasis ml-2">(none)</span>
                  </v-expansion-panel-title>
                  <v-expansion-panel-text>
                    <EligibilityRulesEditor v-model="eligibilityRules" />
                  </v-expansion-panel-text>
                </v-expansion-panel>
              </v-expansion-panels>
            </v-col>

            <!--
              P-97: creating a league also creates a season, and nothing said
              so. `trg_leagues_create_default_season`
              (api/migrations/0028_fix_league_season_trigger.sql:49-53, AFTER
              INSERT ON leagues) inserts "Season 1" in status `registration`
              with the league's default team sizes — so the admin who clicks
              Create League immediately owns an OPEN-REGISTRATION season they
              never configured and had no way to know existed. Surfaced rather
              than removed: see the note in the fix report.
            -->
            <v-col cols="12">
              <v-alert
                type="info"
                variant="tonal"
                density="compact"
                data-testid="default-season-notice"
              >
                <div class="text-body-2">
                  A first season, <strong>Season 1</strong>, is created with the league and is
                  <strong>open for registration immediately</strong> — teams can sign up as soon as
                  the league exists. Rename it, set its dates or close registration from
                  <strong>Manage Seasons &amp; Teams</strong> on the league's row.
                </div>
              </v-alert>
            </v-col>
          </v-row>
        </v-form>
      </v-card-text>

      <v-divider />

      <v-card-actions>
        <v-spacer />
        <v-btn variant="text" @click="close">Cancel</v-btn>
        <v-btn
          color="primary"
          variant="flat"
          :loading="saving"
          :disabled="!formValid"
          @click="save"
        >
          Create League
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { useDisplay } from 'vuetify'
import { ref, computed, watch } from 'vue'
import { useLeaguesStore } from '@/stores/leagues'
import type { GameSummary } from '@/stores/games'
import { useFormRules } from '@/composables/useFormRules'
import { LEAGUE_ACCESS_TYPES, type LeagueAccessType } from '@/composables/useLeagueEligibility'
import {
  emptyRules,
  activeRuleCount,
  buildEligibilityPayload,
  type EligibilityRules,
} from '@/composables/useEligibilityRules'
import EligibilityRulesEditor from '@/components/eligibility/EligibilityRulesEditor.vue'

// Long scrolling forms in a small floating dialog are unusable on phones.
const { smAndDown } = useDisplay()

// Store for creating leagues
const leaguesStore = useLeaguesStore()

const props = defineProps<{
  games: GameSummary[]
}>()

const emit = defineEmits<{
  created: []
}>()

const open = defineModel<boolean>({ required: true })

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

const form = ref({
  game_id: '',
  name: '',
  slug: '',
  description: '',
  logo_url: '',
  access_type: 'open',
})

const eligibilityRules = ref<EligibilityRules>(emptyRules())
const activeRules = computed(() => activeRuleCount(eligibilityRules.value))

const accessTypes = LEAGUE_ACCESS_TYPES

// Filter to active games only
const activeGames = computed(() => {
  return props.games.filter(g => g.status === 'active')
})

const rules = useFormRules()

// Auto-generate slug from name
function generateSlug() {
  if (form.value.name) {
    form.value.slug = form.value.name
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '')
  }
}

// Reset form when dialog opens
watch(open, (isOpen) => {
  if (isOpen) {
    form.value = {
      game_id: '',
      name: '',
      slug: '',
      description: '',
      logo_url: '',
      access_type: 'open',
    }
    eligibilityRules.value = emptyRules()
    error.value = null
  }
})

function close() {
  error.value = null
  open.value = false
}

async function save() {
  if (!formValid.value) return

  saving.value = true
  error.value = null

  try {
    await leaguesStore.createLeague({
      game_id: form.value.game_id,
      name: form.value.name,
      slug: form.value.slug,
      access_type: form.value.access_type as LeagueAccessType,
      description: form.value.description || undefined,
      logo_url: form.value.logo_url || undefined,
      // Typed + backend-validated (unsatisfiable bounds are a 400, not a
      // silently broken league); the API folds it into settings.eligibility.
      eligibility_restrictions: buildEligibilityPayload(eligibilityRules.value),
    })

    emit('created')
    close()
  } catch {
    error.value = leaguesStore.error || 'Failed to create league'
  } finally {
    saving.value = false
  }
}
</script>
