<template>
  <v-menu
    v-model="menuOpen"
    location="bottom end"
    :close-on-content-click="false"
    max-height="520"
    min-width="360"
    max-width="420"
  >
    <template v-slot:activator="{ props: menuProps }">
      <v-btn
        :aria-label="bellLabel"
        variant="text"
        icon
        v-bind="menuProps"
        data-testid="notifications-bell"
      >
        <v-badge
          v-if="badgeCount > 0"
          :content="badgeCount"
          :color="hasCritical ? 'error' : 'warning'"
          data-testid="notifications-badge"
        >
          <v-icon>mdi-bell-outline</v-icon>
        </v-badge>
        <v-icon v-else>mdi-bell-outline</v-icon>
        <v-tooltip activator="parent" location="bottom">Notifications and action items</v-tooltip>
      </v-btn>
    </template>

    <v-card>
      <!-- Notifications -->
      <v-card-title class="d-flex align-center text-subtitle-1 py-2 px-4">
        Notifications
        <v-badge
          v-if="unreadCount > 0"
          :content="unreadCount"
          color="primary"
          inline
          class="ml-2"
        />
        <v-spacer />
        <v-btn
          v-if="unreadCount > 0"
          size="small"
          variant="text"
          aria-label="Mark all notifications read"
          data-testid="notifications-mark-all"
          @click="markAllRead"
        >
          Mark all read
        </v-btn>
      </v-card-title>

      <v-alert
        v-if="showPermissionPrompt"
        type="info"
        variant="tonal"
        density="compact"
        class="mx-3 mb-2"
        data-testid="notifications-permission-prompt"
      >
        Get a desktop alert for match times, check-in and the server being ready.
        <div class="d-flex ga-2 mt-2">
          <v-btn size="small" color="primary" variant="flat" @click="enableAlerts">
            Turn on alerts
          </v-btn>
          <v-btn size="small" variant="text" @click="dismissAlertsPrompt">Not now</v-btn>
        </div>
      </v-alert>

      <v-list v-if="notifications.length > 0" density="compact" nav data-testid="notifications-list">
        <v-list-item
          v-for="n in notifications"
          :key="n.id"
          :class="{ 'notification-unread': !n.read_at }"
          :aria-label="`${n.read_at ? '' : 'Unread: '}${n.title}`"
          data-testid="notification-item"
          @click="onOpen(n)"
        >
          <template v-slot:prepend>
            <v-icon
              v-if="!n.read_at"
              size="10"
              color="primary"
              class="mr-2"
              aria-hidden="true"
              data-testid="notification-unread-dot"
            >
              mdi-circle
            </v-icon>
            <span v-else class="unread-spacer" aria-hidden="true" />
          </template>
          <v-list-item-title class="text-body-2" :class="{ 'font-weight-bold': !n.read_at }">
            {{ n.title }}
          </v-list-item-title>
          <v-list-item-subtitle class="text-caption notification-body">{{ n.body }}</v-list-item-subtitle>
          <template v-slot:append>
            <span class="text-caption text-medium-emphasis">{{ formatRelativeTime(n.created_at) }}</span>
          </template>
        </v-list-item>
      </v-list>
      <v-card-text
        v-else-if="loadError"
        class="text-caption text-error py-3"
        data-testid="notifications-error"
      >
        {{ loadError }}
      </v-card-text>
      <v-card-text v-else class="text-center py-4" data-testid="notifications-empty">
        <p class="text-caption text-medium-emphasis">No notifications yet.</p>
      </v-card-text>

      <v-divider />

      <!-- Action items (unchanged) -->
      <v-card-title class="d-flex align-center text-subtitle-1 py-2 px-4">
        Action Items
        <v-badge
          v-if="actionCount > 0"
          :content="actionCount"
          color="primary"
          inline
          class="ml-2"
        />
      </v-card-title>
      <v-divider />
      <v-list v-if="actions.length > 0" density="compact" nav @click="menuOpen = false">
        <CaptainActionItem
          v-for="action in actions"
          :key="`${action.match_id}-${action.action_type}`"
          :action="action"
        />
      </v-list>
      <v-card-text v-else class="text-center py-6">
        <v-icon size="32" color="success">mdi-check-circle-outline</v-icon>
        <p class="text-caption text-medium-emphasis mt-2">All caught up!</p>
      </v-card-text>
    </v-card>
  </v-menu>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useCaptainActions } from '@/composables/useCaptainActions'
import { useNotifications } from '@/composables/useNotifications'
import CaptainActionItem from '@/components/CaptainActionItem.vue'
import type { PortalNotification } from '@/stores/notifications'
import { formatRelativeTime } from '@/utils/formatters'

const { actions, actionCount, hasCritical } = useCaptainActions()
const {
  notifications,
  unreadCount,
  loadError,
  showPermissionPrompt,
  onMenuOpen,
  open,
  markAllRead,
  enableAlerts,
  dismissAlertsPrompt,
} = useNotifications()

const menuOpen = ref(false)

const badgeCount = computed(() => unreadCount.value + actionCount.value)
const bellLabel = computed(() =>
  badgeCount.value > 0
    ? `Notifications and action items (${badgeCount.value} new)`
    : 'Notifications and action items',
)

watch(menuOpen, (isOpen) => {
  if (isOpen) void onMenuOpen()
})

async function onOpen(n: PortalNotification) {
  menuOpen.value = false
  await open(n)
}
</script>

<style scoped>
.notification-body {
  white-space: normal;
  -webkit-line-clamp: 3;
}
.unread-spacer {
  display: inline-block;
  width: 18px;
}
</style>
