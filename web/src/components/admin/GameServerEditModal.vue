<template>
  <v-dialog
    v-model="open"
    max-width="600"
    persistent
  >
    <v-card>
      <v-card-title class="d-flex justify-space-between align-center">
        <span>{{ server ? `Edit Server: ${server.name}` : 'Register Game Server' }}</span>
        <v-btn aria-label="Close" icon variant="text" @click="close">
          <v-icon>mdi-close</v-icon>
        </v-btn>
      </v-card-title>

      <v-divider />

      <v-card-text>
        <v-form ref="formRef" v-model="formValid">
          <v-row>
            <v-col cols="12" sm="7">
              <v-text-field
                v-model="form.name"
                label="Name"
                hint="e.g. London #1"
                :rules="[rules.required, rules.maxLength(128)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" sm="5">
              <v-select
                v-model="form.game_id"
                aria-label="Game"
                label="Game"
                :items="gameItems"
                item-title="label"
                item-value="value"
                :disabled="!!server"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.ip_address"
                label="IP Address"
                hint="Public IPv4/IPv6 players connect to"
                :rules="[rules.required]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6" sm="3">
              <v-text-field
                v-model.number="form.port"
                label="Game Port"
                type="number"
                :rules="[rules.required, portRule]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="6" sm="3">
              <v-text-field
                v-model.number="form.gotv_port"
                label="GOTV Port"
                type="number"
                :rules="[optionalPortRule]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col cols="12" sm="6">
              <v-text-field
                v-model="form.region"
                label="Region"
                hint="Allocation label, e.g. eu-west"
                :rules="[rules.required, rules.maxLength(32)]"
                variant="outlined"
                density="comfortable"
              />
            </v-col>

            <v-col v-if="server" cols="12" sm="6">
              <v-switch
                v-model="form.enabled"
                label="Enabled (eligible for allocation)"
                color="success"
                hide-details
              />
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
          {{ server ? 'Save Changes' : 'Register Server' }}
        </v-btn>
      </v-card-actions>

      <v-alert v-if="error" type="error" class="ma-4" closable @click:close="error = null">
        {{ error }}
      </v-alert>
    </v-card>
  </v-dialog>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { ApiError } from '@/api'
import { useFormRules } from '@/composables/useFormRules'
import { useGamesStore } from '@/stores/games'
import { useGameServersStore } from '@/stores/gameServers'
import type { GameServer } from '@/stores/gameServers'

const props = defineProps<{
  server: GameServer | null
}>()

const emit = defineEmits<{
  saved: [server: GameServer]
}>()

const open = defineModel<boolean>({ required: true })

const gamesStore = useGamesStore()
const store = useGameServersStore()
const rules = useFormRules()

const formRef = ref()
const formValid = ref(false)
const saving = ref(false)
const error = ref<string | null>(null)

interface ServerForm {
  name: string
  game_id: string
  ip_address: string
  port: number
  gotv_port: number | null
  region: string
  enabled: boolean
}

const emptyForm = (): ServerForm => ({
  name: '',
  game_id: '',
  ip_address: '',
  port: 27015,
  gotv_port: null,
  region: '',
  enabled: true,
})

const form = ref<ServerForm>(emptyForm())

const gameItems = computed(() =>
  gamesStore.allGames.map((g) => ({ label: g.display_name, value: g.id })),
)

const portRule = (v: number) => (v >= 1 && v <= 65535) || 'Port must be 1-65535'
const optionalPortRule = (v: number | null) =>
  v === null || v === undefined || String(v) === '' || (v >= 1 && v <= 65535) || 'Port must be 1-65535'

watch(open, (isOpen) => {
  if (!isOpen) return
  error.value = null
  if (gamesStore.allGames.length === 0) {
    void gamesStore.fetchAllGames()
  }
  form.value = props.server
    ? {
        name: props.server.name,
        game_id: props.server.game_id,
        ip_address: props.server.ip_address,
        port: props.server.port,
        gotv_port: props.server.gotv_port ?? null,
        region: props.server.region,
        enabled: props.server.enabled,
      }
    : emptyForm()
})

function close() {
  open.value = false
}

async function save() {
  saving.value = true
  error.value = null
  try {
    let saved
    if (props.server) {
      // Diff-only PATCH: send just the fields that changed.
      const s = props.server
      const body: Record<string, unknown> = {}
      if (form.value.name !== s.name) body.name = form.value.name
      if (form.value.ip_address !== s.ip_address) body.ip_address = form.value.ip_address
      if (form.value.port !== s.port) body.port = form.value.port
      if ((form.value.gotv_port ?? null) !== (s.gotv_port ?? null))
        body.gotv_port = form.value.gotv_port
      if (form.value.region !== s.region) body.region = form.value.region
      if (form.value.enabled !== s.enabled) body.enabled = form.value.enabled
      saved = await store.updateServer(s.id, body)
    } else {
      saved = await store.createServer({
        name: form.value.name,
        game_id: form.value.game_id,
        ip_address: form.value.ip_address,
        port: form.value.port,
        gotv_port: form.value.gotv_port ?? null,
        region: form.value.region,
      })
    }
    emit('saved', saved)
    open.value = false
  } catch (e) {
    error.value = e instanceof ApiError ? e.detail : 'Failed to save server'
  } finally {
    saving.value = false
  }
}
</script>
