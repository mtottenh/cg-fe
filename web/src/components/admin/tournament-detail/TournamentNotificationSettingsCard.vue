<template>
  <v-card variant="outlined" class="mt-4" data-testid="notification-settings-card">
    <v-card-title class="text-subtitle-1">
      <v-icon class="mr-2">mdi-bell-ring-outline</v-icon>
      Notifications
    </v-card-title>
    <v-card-text>
      <p class="text-caption text-medium-emphasis mb-3">
        Players always get notifications on the site. A Discord channel webhook
        also posts match times, check-in, server ready and results to a channel.
      </p>

      <v-alert
        v-if="loadError"
        type="error"
        variant="tonal"
        density="compact"
        class="mb-3"
        data-testid="notification-settings-load-error"
      >
        {{ loadError }}
      </v-alert>

      <v-switch
        v-model="enabled"
        color="primary"
        density="compact"
        hide-details
        label="Post to Discord"
        aria-label="Post notifications to Discord"
        :disabled="!configuredAfterSave"
        data-testid="notification-discord-enabled"
      />
      <p v-if="!configuredAfterSave" class="text-caption text-medium-emphasis mb-2">
        Add a webhook URL first.
      </p>

      <div v-if="settings?.discord_webhook_configured && !replacing && !removing" class="d-flex align-center ga-2 my-2" data-testid="notification-webhook-configured">
        <v-icon color="success" size="small">mdi-check-circle</v-icon>
        <span class="text-body-2">
          Webhook configured<template v-if="settings.discord_webhook_hint"> (…{{ settings.discord_webhook_hint }})</template>
        </span>
        <v-spacer />
        <v-btn size="small" variant="text" data-testid="notification-webhook-replace" @click="replacing = true">Replace</v-btn>
        <v-btn size="small" variant="text" color="error" data-testid="notification-webhook-remove" @click="removing = true">Remove</v-btn>
      </div>
      <v-alert
        v-if="removing"
        type="warning"
        variant="tonal"
        density="compact"
        class="my-2"
        data-testid="notification-webhook-removing"
      >
        The webhook will be removed when you save.
        <template #append>
          <v-btn size="small" variant="text" @click="removing = false">Undo</v-btn>
        </template>
      </v-alert>

      <v-text-field
        v-if="!settings?.discord_webhook_configured || replacing"
        v-model="webhookUrl"
        type="password"
        autocomplete="off"
        label="Discord webhook URL"
        aria-label="Discord webhook URL"
        placeholder="https://discord.com/api/webhooks/…"
        hint="Discord channel → Edit channel → Integrations → Webhooks → Copy webhook URL. It is stored and never shown again."
        persistent-hint
        variant="outlined"
        density="compact"
        class="my-2"
        :error-messages="urlError"
        data-testid="notification-webhook-url"
      />

      <div class="d-flex flex-wrap ga-2 mt-3">
        <v-btn
          color="primary"
          :disabled="!dirty || !!urlError"
          :loading="store.saveSettingsState.loading"
          data-testid="notification-settings-save"
          @click="save"
        >
          Save
        </v-btn>
        <v-btn
          variant="tonal"
          :disabled="!settings?.discord_webhook_configured || dirty"
          :loading="store.testSettingsState.loading"
          data-testid="notification-settings-test"
          @click="sendTest"
        >
          Send test message
        </v-btn>
      </div>

      <v-alert
        v-if="testResult"
        :type="testResult.delivered ? 'success' : 'error'"
        variant="tonal"
        density="compact"
        class="mt-3"
        data-testid="notification-test-result"
      >
        {{ testResult.delivered ? 'Test message delivered.' : 'Test message not delivered.' }}
        <template v-if="testResult.detail"> {{ testResult.detail }}</template>
      </v-alert>
    </v-card-text>
  </v-card>
</template>

<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { useActionFeedback } from '@/composables/useActionFeedback'
import {
  useNotificationsStore,
  type NotificationTestResult,
  type TournamentNotificationSettings,
} from '@/stores/notifications'
import { discordWebhookProblem } from '@/utils/discordWebhook'

const props = defineProps<{
  tournamentId: string
}>()

const store = useNotificationsStore()
const feedback = useActionFeedback()

const settings = ref<TournamentNotificationSettings | null>(null)
const loadError = ref<string | null>(null)
const enabled = ref(false)
const webhookUrl = ref('')
const replacing = ref(false)
const removing = ref(false)
const testResult = ref<NotificationTestResult | null>(null)

function reset(from: TournamentNotificationSettings | null) {
  settings.value = from
  enabled.value = from?.discord_enabled ?? false
  webhookUrl.value = ''
  replacing.value = false
  removing.value = false
}

async function load() {
  loadError.value = null
  testResult.value = null
  try {
    reset(await store.fetchTournamentSettings(props.tournamentId))
  } catch (e) {
    reset(null)
    loadError.value = store.settingsState.error ?? (e instanceof Error ? e.message : 'Failed to load')
  }
}
watch(() => props.tournamentId, () => void load(), { immediate: true })

const urlError = computed(() => {
  const raw = webhookUrl.value.trim()
  return raw ? discordWebhookProblem(raw) : null
})

/** Whether a webhook will exist once the current form is saved. */
const configuredAfterSave = computed(() => {
  if (removing.value) return false
  if (webhookUrl.value.trim()) return true
  return settings.value?.discord_webhook_configured ?? false
})

// Posting to Discord without a webhook is meaningless; switch it off.
watch(configuredAfterSave, (configured) => {
  if (!configured) enabled.value = false
})

const dirty = computed(() =>
  removing.value
  || webhookUrl.value.trim() !== ''
  || enabled.value !== (settings.value?.discord_enabled ?? false),
)

async function save() {
  if (!dirty.value || urlError.value) return
  const url = webhookUrl.value.trim()
  const body: { discord_enabled: boolean; discord_webhook_url?: string | null } = {
    discord_enabled: enabled.value && configuredAfterSave.value,
  }
  if (removing.value) body.discord_webhook_url = null
  else if (url) body.discord_webhook_url = url
  await feedback.run(
    async () => {
      reset(await store.saveTournamentSettings(props.tournamentId, body))
      testResult.value = null
    },
    {
      success: 'Notification settings saved',
      failureFallback: 'Failed to save the notification settings',
      errorSource: store.saveSettingsState,
    },
  )
}

async function sendTest() {
  testResult.value = null
  try {
    testResult.value = await store.sendTestNotification(props.tournamentId)
  } catch {
    testResult.value = {
      delivered: false,
      detail: store.testSettingsState.error ?? 'The request failed.',
    }
  }
}
</script>
