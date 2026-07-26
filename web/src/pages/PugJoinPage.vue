<template>
  <v-container>
    <v-row justify="center">
      <v-col cols="12" sm="8" md="6" lg="5">
        <v-card class="pa-6 text-center">
          <template v-if="pugsStore.previewState.loading">
            <v-progress-circular indeterminate color="primary" size="48" class="mb-4" />
            <div class="text-body-1">Looking up the invite…</div>
          </template>

          <template v-else-if="pugsStore.previewState.error">
            <v-card-title class="text-h5 mb-2">Invite not found</v-card-title>
            <v-alert type="error" variant="tonal" class="mb-4" data-testid="pug-join-error">
              This invite link is invalid or has expired — ask the host for a fresh one.
            </v-alert>
            <v-btn color="primary" to="/">Back home</v-btn>
          </template>

          <template v-else-if="preview">
            <v-icon icon="mdi-gamepad-variant" size="56" color="primary" class="mb-2" />
            <v-card-title class="text-h5 mb-1">You're invited to a PUG</v-card-title>
            <div class="d-flex justify-center flex-wrap ga-2 my-4">
              <v-chip variant="tonal" color="primary" data-testid="pug-join-format">
                {{ formatMatchFormat(preview.match_format) }}
              </v-chip>
              <v-chip variant="tonal">
                {{ preview.map_selection_mode === 'wheel' ? '🎡 Wheel picks the maps' : 'Map veto' }}
              </v-chip>
              <v-chip variant="tonal">
                {{ preview.team_size }}v{{ preview.team_size }}
              </v-chip>
              <v-chip v-if="preview.region" variant="tonal">{{ preview.region }}</v-chip>
            </div>
            <div class="text-body-2 text-medium-emphasis mb-4" data-testid="pug-join-slots">
              {{ preview.players_count }} / {{ preview.slots_total }} players in the lobby
            </div>

            <v-alert
              v-if="preview.status !== 'gathering'"
              type="info"
              variant="tonal"
              class="mb-4"
            >
              This PUG is no longer accepting players.
            </v-alert>

            <template v-else-if="authStore.isAuthenticated">
              <v-btn
                color="primary"
                size="large"
                block
                prepend-icon="mdi-account-plus"
                :loading="pugsStore.joinState.loading"
                data-testid="pug-join-button"
                @click="join"
              >
                Join the lobby
              </v-btn>
              <v-alert
                v-if="pugsStore.joinState.error"
                type="error"
                variant="tonal"
                density="compact"
                class="mt-3"
              >
                {{ pugsStore.joinState.error }}
              </v-alert>
            </template>

            <template v-else>
              <p class="text-body-2 text-medium-emphasis mb-3">
                Sign in through Steam to join — the game server only admits
                linked Steam accounts.
              </p>
              <v-btn
                :href="steamUrl"
                color="blue-grey-darken-3"
                size="large"
                block
                prepend-icon="mdi-steam"
                data-testid="pug-join-steam"
                @click="stashRedirect"
              >
                Sign in through Steam
              </v-btn>
            </template>
          </template>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
/**
 * Share-link landing page. Public on purpose: logged-out invitees see the
 * lobby preview and a Steam CTA; the destination is stashed so sign-in
 * lands them right back here.
 */
import { computed, onMounted } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { storeToRefs } from 'pinia'
import { useAuthStore } from '@/stores/auth'
import { usePugsStore } from '@/stores/pugs'
import { formatMatchFormat } from '@/utils/matchStatus'
import { stashPostLoginRedirect, steamLoginUrl } from '@/utils/steamAuth'

const route = useRoute()
const router = useRouter()
const authStore = useAuthStore()
const pugsStore = usePugsStore()
const { preview } = storeToRefs(pugsStore)

const code = computed(() => String(route.params.code ?? ''))
const steamUrl = steamLoginUrl()

function stashRedirect(): void {
  stashPostLoginRedirect(`/pugs/join/${code.value}`)
}

async function join(): Promise<void> {
  try {
    const detail = await pugsStore.joinByCode(code.value)
    await router.replace({ name: 'pug-lobby', params: { id: detail.pug.id } })
  } catch {
    // joinState.error renders inline
  }
}

onMounted(async () => {
  try {
    await pugsStore.fetchPreview(code.value)
  } catch {
    // previewState.error renders inline
  }
})
</script>
