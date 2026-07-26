<template>
  <v-list-item
    :to="{
      name: 'match-detail',
      params: { tournamentSlug: action.tournament_slug, matchId: action.match_id },
    }"
    density="compact"
  >
    <template v-slot:prepend>
      <v-avatar :color="actionMeta.color" size="32" rounded="lg">
        <v-icon size="16">{{ actionMeta.icon }}</v-icon>
      </v-avatar>
    </template>
    <v-list-item-title class="text-body-2">{{ actionMeta.label }}</v-list-item-title>
    <v-list-item-subtitle class="text-caption">
      {{ action.match_label }} &middot; {{ action.tournament_name }}
    </v-list-item-subtitle>
    <template v-slot:append v-if="action.deadline">
      <v-chip
        :color="urgencyColor"
        size="x-small"
        variant="tonal"
      >
        {{ countdownText }}
      </v-chip>
    </template>
  </v-list-item>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted } from 'vue'
import type { CaptainAction } from '@/stores/captainActions'

const props = defineProps<{
  action: CaptainAction
}>()

const now = ref(Date.now())
let timer: ReturnType<typeof setInterval> | null = null

onMounted(() => {
  timer = setInterval(() => { now.value = Date.now() }, 30_000)
})

onUnmounted(() => {
  if (timer) clearInterval(timer)
})

const ACTION_META: Record<string, { icon: string; color: string; label: string }> = {
  schedule_match: { icon: 'mdi-calendar-clock', color: 'info', label: 'Schedule your match' },
  respond_proposal: { icon: 'mdi-calendar-question', color: 'info', label: 'Respond to schedule proposal' },
  check_in: { icon: 'mdi-checkbox-marked-circle-outline', color: 'warning', label: 'Check-in required' },
  submit_result: { icon: 'mdi-scoreboard-outline', color: 'primary', label: 'Submit match result' },
  confirm_result: { icon: 'mdi-check-decagram', color: 'warning', label: 'Confirm or dispute result' },
  acknowledge_review: { icon: 'mdi-clipboard-check-outline', color: 'error', label: 'Acknowledge result review' },
}

const actionMeta = computed(() => ACTION_META[props.action.action_type] ?? {
  icon: 'mdi-alert-circle-outline',
  color: 'grey',
  label: props.action.action_type,
})

const diffMs = computed(() => {
  if (!props.action.deadline) return null
  return new Date(props.action.deadline).getTime() - now.value
})

const urgencyColor = computed(() => {
  if (diffMs.value === null) return 'grey'
  if (diffMs.value < 0) return 'error'
  if (diffMs.value < 3600000) return 'error'
  if (diffMs.value < 86400000) return 'warning'
  return 'grey'
})

const countdownText = computed(() => {
  if (diffMs.value === null) return ''
  if (diffMs.value < 0) return 'Overdue'
  const hours = Math.floor(diffMs.value / 3600000)
  const minutes = Math.floor((diffMs.value % 3600000) / 60000)
  if (hours >= 24) {
    const days = Math.floor(hours / 24)
    return `${days}d left`
  }
  if (hours > 0) return `${hours}h left`
  return `${minutes}m left`
})
</script>
