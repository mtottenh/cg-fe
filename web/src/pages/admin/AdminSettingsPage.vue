<template>
  <AdminPlaceholder
    icon="mdi-cog"
    title="Platform Settings"
    :features="features"
  />
</template>

<script setup lang="ts">
import AdminPlaceholder from '@/components/admin/AdminPlaceholder.vue'

const features = [
  'Platform configuration (site name, logo, theme)',
  'Feature flags (enable/disable features)',
  'Maintenance mode toggle',
  'Rate limiting configuration',
  'Email/notification templates',
  'Integration settings (Discord, etc.)',
  'Backup and restore operations',
]
</script>
