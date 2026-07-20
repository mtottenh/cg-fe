<template>
  <v-container fluid class="pa-6">
    <v-row justify="center">
      <v-col cols="12" md="8" lg="6">
        <v-card class="text-center pa-8" variant="outlined">
          <v-icon :icon="icon" size="80" color="grey-darken-1" class="mb-4" />

          <h1 class="text-h4 mb-2">{{ title }}</h1>

          <v-chip color="warning" variant="flat" class="mb-6">
            Coming Soon
          </v-chip>

          <p class="text-body-1 text-medium-emphasis mb-6">
            This admin feature is planned but requires additional backend APIs.
          </p>

          <v-divider class="mb-6" />

          <div class="text-left">
            <h3 class="text-h6 mb-4">Missing Backend Features</h3>
            <v-list density="compact" class="bg-transparent">
              <v-list-item
                v-for="(feature, index) in features"
                :key="index"
                :prepend-icon="'mdi-checkbox-blank-outline'"
              >
                <v-list-item-title>{{ feature }}</v-list-item-title>
              </v-list-item>
            </v-list>
          </div>

          <v-divider v-if="publicLink" class="my-6" />

          <v-btn
            v-if="publicLink"
            :to="publicLink"
            color="primary"
            variant="tonal"
            :prepend-icon="publicLinkIcon"
          >
            {{ publicLinkText }}
          </v-btn>
        </v-card>
      </v-col>
    </v-row>
  </v-container>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

defineProps<{
  icon: string
  title: string
  features: string[]
  publicLink?: RouteLocationRaw
  publicLinkText?: string
  publicLinkIcon?: string
}>()
</script>
