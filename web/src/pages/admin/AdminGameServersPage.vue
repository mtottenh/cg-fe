<template>
  <div>
    <div class="d-flex justify-space-between align-center mb-6">
      <h1 class="text-h4">Game Servers</h1>
      <v-btn color="primary" prepend-icon="mdi-plus" @click="openCreateModal">
        Register Server
      </v-btn>
    </div>

    <ErrorAlert :error="error" retryable @clear="error = null" @retry="refresh" />

    <v-card>
      <v-card-title class="d-flex align-center">
        <v-text-field
          v-model="search"
          aria-label="Search servers"
          prepend-inner-icon="mdi-magnify"
          label="Search servers"
          single-line
          hide-details
          density="compact"
          variant="outlined"
          style="max-width: 300px"
        />
        <v-spacer />
        <v-btn
          color="primary"
          variant="tonal"
          prepend-icon="mdi-refresh"
          :loading="loading"
          @click="refresh"
        >
          Refresh
        </v-btn>
      </v-card-title>

      <div class="table-scroll">
        <v-data-table
          :headers="headers"
          :items="filteredServers"
          :loading="loading"
          :items-per-page="10"
          class="elevation-0"
        >
          <template #[`item.name`]="{ item }">
            <div class="d-flex align-center ga-2">
              <span>{{ item.name }}</span>
              <v-chip v-if="!item.enabled" size="x-small" color="grey" variant="tonal">
                Disabled
              </v-chip>
            </div>
          </template>

          <template #[`item.address`]="{ item }">
            <code>{{ item.ip_address }}:{{ item.port }}</code>
          </template>

          <template #[`item.status`]="{ item }">
            <v-chip
              :color="getStatusColor(serverStatusMap, item.status)"
              :prepend-icon="getStatusIcon(serverStatusMap, item.status)"
              size="small"
              variant="tonal"
            >
              {{ getStatusLabel(serverStatusMap, item.status) }}
            </v-chip>
          </template>

          <template #[`item.agent`]="{ item }">
            <div class="d-flex align-center ga-1">
              <v-icon
                :icon="item.agent_connected ? 'mdi-lan-connect' : 'mdi-lan-disconnect'"
                :color="item.agent_connected ? 'success' : 'grey'"
                size="small"
              />
              <span class="text-caption">{{ heartbeatAge(item) }}</span>
            </div>
          </template>

          <template #[`item.cert`]="{ item }">
            <span v-if="!item.agent_cert_expires_at" class="text-caption text-grey">
              not enrolled
            </span>
            <v-chip
              v-else
              size="x-small"
              variant="tonal"
              :color="certExpiringSoon(item) ? 'warning' : 'default'"
            >
              {{ certExpiry(item) }}
            </v-chip>
          </template>

          <template #[`item.actions`]="{ item }">
            <v-btn
              aria-label="Edit server"
              title="Edit server"
              icon
              size="small"
              variant="text"
              @click="openEditModal(item)"
            >
              <v-icon>mdi-pencil</v-icon>
            </v-btn>
            <v-btn
              aria-label="Enrollment token"
              title="Enrollment token"
              icon
              size="small"
              variant="text"
              @click="openEnrollModal(item)"
            >
              <v-icon>mdi-key</v-icon>
            </v-btn>
            <v-btn
              aria-label="Revoke agent certificates"
              title="Revoke agent certificates"
              icon
              size="small"
              variant="text"
              :disabled="!item.agent_cert_expires_at"
              @click="confirmRevoke(item)"
            >
              <v-icon>mdi-key-remove</v-icon>
            </v-btn>
            <v-btn
              aria-label="Delete server"
              title="Delete server"
              icon
              size="small"
              variant="text"
              color="error"
              @click="confirmDelete(item)"
            >
              <v-icon>mdi-delete</v-icon>
            </v-btn>
          </template>

          <template #no-data>
            <EmptyState
              icon="mdi-server-network"
              title="No game servers registered"
              subtitle="Register a server, then enroll its agent to bring it online."
            />
          </template>
        </v-data-table>
      </div>
    </v-card>

    <GameServerEditModal v-model="editModalOpen" :server="selectedServer" @saved="onSaved" />
    <GameServerEnrollModal v-model="enrollModalOpen" :server="selectedServer" />
    <ConfirmDialogHost :dialog="confirmDialog" />
    <AppSnackbar v-model="snackbar.open" :text="snackbar.text" :color="snackbar.color" />
  </div>
</template>

<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { storeToRefs } from 'pinia'
import AppSnackbar from '@/components/AppSnackbar.vue'
import ConfirmDialogHost from '@/components/ConfirmDialogHost.vue'
import EmptyState from '@/components/EmptyState.vue'
import ErrorAlert from '@/components/ErrorAlert.vue'
import GameServerEditModal from '@/components/admin/GameServerEditModal.vue'
import GameServerEnrollModal from '@/components/admin/GameServerEnrollModal.vue'
import { useConfirmDialog } from '@/composables/useConfirmDialog'
import { useGameServersStore } from '@/stores/gameServers'
import type { GameServer } from '@/stores/gameServers'
import { getStatusColor, getStatusIcon, getStatusLabel, serverStatusMap } from '@/utils/statusMaps'

const store = useGameServersStore()
const { servers, loading, error } = storeToRefs(store)
const confirmDialog = useConfirmDialog()

const search = ref('')
const editModalOpen = ref(false)
const enrollModalOpen = ref(false)
const selectedServer = ref<GameServer | null>(null)
const snackbar = ref({ open: false, text: '', color: 'success' })

const headers = [
  { title: 'Name', key: 'name' },
  { title: 'Address', key: 'address', sortable: false },
  { title: 'Region', key: 'region' },
  { title: 'Status', key: 'status' },
  { title: 'Agent', key: 'agent', sortable: false },
  { title: 'Certificate', key: 'cert', sortable: false },
  { title: 'Actions', key: 'actions', sortable: false, align: 'center' as const },
]

const filteredServers = computed(() => {
  const q = search.value.trim().toLowerCase()
  if (!q) return servers.value
  return servers.value.filter(
    (s) =>
      s.name.toLowerCase().includes(q) ||
      s.region.toLowerCase().includes(q) ||
      s.ip_address.includes(q),
  )
})

function heartbeatAge(server: GameServer): string {
  if (!server.last_heartbeat_at) return 'never'
  const seconds = Math.floor((Date.now() - new Date(server.last_heartbeat_at).getTime()) / 1000)
  if (seconds < 90) return `${seconds}s ago`
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`
  return `${Math.floor(seconds / 3600)}h ago`
}

function certExpiry(server: GameServer): string {
  if (!server.agent_cert_expires_at) return ''
  const days = Math.floor(
    (new Date(server.agent_cert_expires_at).getTime() - Date.now()) / 86_400_000,
  )
  return days < 0 ? 'expired' : `${days}d left`
}

function certExpiringSoon(server: GameServer): boolean {
  if (!server.agent_cert_expires_at) return false
  return new Date(server.agent_cert_expires_at).getTime() - Date.now() < 30 * 86_400_000
}

function refresh() {
  void store.fetchServers()
}

function openCreateModal() {
  selectedServer.value = null
  editModalOpen.value = true
}

function openEditModal(server: GameServer) {
  selectedServer.value = server
  editModalOpen.value = true
}

function openEnrollModal(server: GameServer) {
  selectedServer.value = server
  enrollModalOpen.value = true
}

function onSaved(server: GameServer) {
  snackbar.value = { open: true, text: `Server "${server.name}" saved`, color: 'success' }
}

function confirmRevoke(server: GameServer) {
  confirmDialog.confirm({
    title: 'Revoke agent certificates?',
    message:
      `The agent on "${server.name}" will be disconnected immediately and ` +
      'cannot reconnect until it re-enrolls with a fresh token.',
    action: 'Revoke',
    color: 'error',
    handler: async () => {
      const count = await store.revokeAgent(server.id)
      snackbar.value = {
        open: true,
        text: `Revoked ${count} certificate(s) for "${server.name}"`,
        color: 'success',
      }
    },
  })
}

function confirmDelete(server: GameServer) {
  confirmDialog.confirm({
    title: 'Delete game server?',
    message:
      `"${server.name}" will be removed from the registry. ` +
      'Deletion is refused while the server is busy with a match.',
    action: 'Delete',
    color: 'error',
    handler: async () => {
      await store.deleteServer(server.id)
      snackbar.value = { open: true, text: `Server "${server.name}" deleted`, color: 'success' }
    },
  })
}

onMounted(refresh)
</script>

<style scoped>
/* Wide tables scroll within themselves; the page never scrolls sideways. */
.table-scroll {
  overflow-x: auto;
}
</style>
