<template>
  <v-chip :color="color" :variant="variant" :size="size">
    <v-icon v-if="showIcon" start :size="iconSize">{{ icon }}</v-icon>
    {{ label }}
  </v-chip>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{
    status: string
    size?: 'x-small' | 'small' | 'default' | 'large' | 'x-large'
    variant?: 'flat' | 'text' | 'elevated' | 'tonal' | 'outlined' | 'plain'
    showIcon?: boolean
  }>(),
  {
    size: 'small',
    variant: 'flat',
    showIcon: false,
  }
)

const color = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'grey'
    case 'published':
      return 'info'
    case 'registration_open':
      return 'success'
    case 'registration_closed':
      return 'warning'
    case 'check_in_open':
      return 'primary'
    case 'ready':
      return 'secondary'
    case 'in_progress':
      return 'primary'
    case 'completed':
      return 'success'
    case 'cancelled':
      return 'error'
    default:
      return 'grey'
  }
})

const label = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'Draft'
    case 'published':
      return 'Published'
    case 'registration_open':
      return 'Registration Open'
    case 'registration_closed':
      return 'Registration Closed'
    case 'check_in_open':
      return 'Check-in Open'
    case 'ready':
      return 'Ready'
    case 'in_progress':
      return 'In Progress'
    case 'completed':
      return 'Completed'
    case 'cancelled':
      return 'Cancelled'
    default:
      return props.status
  }
})

const icon = computed(() => {
  switch (props.status) {
    case 'draft':
      return 'mdi-file-document-edit-outline'
    case 'published':
      return 'mdi-eye'
    case 'registration_open':
      return 'mdi-account-plus'
    case 'registration_closed':
      return 'mdi-account-cancel'
    case 'check_in_open':
      return 'mdi-checkbox-marked-circle-outline'
    case 'ready':
      return 'mdi-check-circle'
    case 'in_progress':
      return 'mdi-play-circle'
    case 'completed':
      return 'mdi-trophy'
    case 'cancelled':
      return 'mdi-close-circle'
    default:
      return 'mdi-help-circle'
  }
})

const iconSize = computed(() => {
  switch (props.size) {
    case 'x-small':
      return 12
    case 'small':
      return 14
    case 'default':
      return 16
    case 'large':
      return 18
    case 'x-large':
      return 20
    default:
      return 14
  }
})
</script>
