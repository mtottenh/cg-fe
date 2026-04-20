<template>
  <v-app-bar color="surface" elevation="0" border="b">
    <v-app-bar-nav-icon v-if="showNav" @click="$emit('toggle-nav')" />

    <v-app-bar-title>
      <router-link :to="titleTo" class="text-decoration-none text-white">
        {{ title }}
      </router-link>
    </v-app-bar-title>

    <template #append>
      <slot name="append" />
    </template>
  </v-app-bar>
</template>

<script setup lang="ts">
import type { RouteLocationRaw } from 'vue-router'

withDefaults(defineProps<{
  title: string
  titleTo?: RouteLocationRaw
  showNav?: boolean
}>(), {
  titleTo: '/',
  showNav: false,
})

defineEmits<{
  'toggle-nav': []
}>()
</script>
