<template>
  <template v-if="ready">
    <!--
      Admin routes nest `AdminLayout` as their own route component, so for them
      we render `<router-view />` directly and let the child route supply the
      layout. Non-admin routes wrap `<router-view />` in a dynamically-picked
      layout here (Default/Portal, driven by `meta.layout` + auth state).
    -->
    <component v-if="layoutComponent" :is="layoutComponent">
      <router-view />
    </component>
    <router-view v-else />
    <AppSnackbar />
  </template>
  <v-app v-else>
    <v-main class="d-flex align-center justify-center" style="min-height: 100vh">
      <v-progress-circular indeterminate color="primary" size="48" />
    </v-main>
  </v-app>
</template>

<script setup lang="ts">
import { computed, defineAsyncComponent, provide } from 'vue'
import { useRoute } from 'vue-router'
import { useAuthStore } from '@/stores/auth'
import { createSnackbar, SnackbarKey } from '@/composables/useSnackbar'
import AppSnackbar from '@/components/AppSnackbar.vue'

const DefaultLayout = defineAsyncComponent(() => import('@/layouts/DefaultLayout.vue'))
const PortalLayout = defineAsyncComponent(() => import('@/layouts/PortalLayout.vue'))

const route = useRoute()
const authStore = useAuthStore()
const snackbar = createSnackbar()
provide(SnackbarKey, snackbar)

const ready = computed(() => authStore.initialized)
const isAuthenticated = computed(() => authStore.isAuthenticated)

const layoutComponent = computed(() => {
  // Admin routes supply their own layout via the `/admin` parent route
  // (AdminLayout renders `<router-view />` for its children). Return null
  // so the template falls through to a bare `<router-view />`.
  if (route.matched.some(r => r.meta.layout === 'admin')) return null

  const layoutMeta = route.meta.layout as string | undefined
  if (layoutMeta === 'portal') return PortalLayout
  if (layoutMeta === 'default') return DefaultLayout
  if (layoutMeta === 'dynamic') {
    return isAuthenticated.value ? PortalLayout : DefaultLayout
  }
  return DefaultLayout
})
</script>
