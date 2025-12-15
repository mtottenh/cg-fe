<template>
  <v-btn-toggle v-model="selectedTab" mandatory variant="outlined" divided density="compact">
    <v-btn value="upload" size="small">
      <v-icon start size="small">mdi-image</v-icon>
      Upload Image
    </v-btn>
    <v-btn value="link" size="small" :disabled="!linkEnabled">
      <v-icon start size="small">mdi-link</v-icon>
      Link URL
    </v-btn>
    <v-btn value="demo" size="small" :disabled="!demoEnabled">
      <v-icon start size="small">mdi-file-video</v-icon>
      Demo File
    </v-btn>
    <v-btn value="browse" size="small" :disabled="!browseEnabled">
      <v-icon start size="small">mdi-folder-search</v-icon>
      Browse Demos
    </v-btn>
  </v-btn-toggle>
</template>

<script setup lang="ts">
/**
 * Evidence type selector tabs.
 *
 * Phase 1: Only "upload" tab is functional
 * Phase 2: "link" and "demo" tabs will be enabled
 * Phase 3: "browse" tab will be enabled
 */

export type EvidenceTab = 'upload' | 'link' | 'demo' | 'browse'

withDefaults(
  defineProps<{
    linkEnabled?: boolean
    demoEnabled?: boolean
    browseEnabled?: boolean
  }>(),
  {
    // Phase 1: Only upload is enabled
    linkEnabled: false,
    demoEnabled: false,
    browseEnabled: false,
  }
)

const selectedTab = defineModel<EvidenceTab>({ default: 'upload' })
</script>
