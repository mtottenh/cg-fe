<template>
  <template v-if="ready">
    <component :is="layoutComponent">
      <router-view />
    </component>
  </template>
  <v-app v-else>
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh">
      <v-progress-circular indeterminate color="primary" size="48" />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, defineComponent } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'

const DefaultLayout = defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue'))
const PortalLayout = defineAsyncComponent(() => import('@/layouts/PortalLayout.vue'))

// Simple pass-through component for routes that handle their own layout (like admin)
const PassThrough = defineComponent({
  name: 'PassThrough',
  setup(_, { slots }) {
    return () => slots.default?.()
  }
})

const route = useRoute()
const authStore = useAuthStore()

const ready = computed(() => authStore.initialized)
const isAuthenticated = computed(() => authStore.isAuthenticated || authStore.isDevMode)

const layoutComponent = computed(() => {
  // Check if current route or any matched route has admin layout
  const hasAdminLayout = route.matched.some(r => r.meta.layout === 'admin')

  if (hasAdminLayout) {
    // Admin routes handle their own layout via router component
    return PassThrough
  }

  const layoutMeta = route.meta.layout as string | undefined

  // Explicit portal layout
  if (layoutMeta === 'portal') {
    return PortalLayout
  }

  // Explicit default layout
  if (layoutMeta === 'default') {
    return DefaultLayout
  }

  // Dynamic: use portal if authenticated, default otherwise
  if (layoutMeta === 'dynamic') {
    return isAuthenticated.value ? PortalLayout : DefaultLayout
  }

  // Fallback to default
  return DefaultLayout
})
</script>
