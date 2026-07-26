/// <reference types="vitest" />
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import vuetify from 'vite-plugin-vuetify'
import { fileURLToPath, URL } from 'node:url'

export default defineConfig({
  plugins: [
    vue(),
    // Auto-imports Vuetify components/directives on demand. Replaces the
    // `import * as components from 'vuetify/components'` global registration
    // in `src/plugins/vuetify.ts`, which was shipping the entire Vuetify
    // component surface regardless of what the app actually uses.
    vuetify({ autoImport: true }),
  ],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3000',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    // Warmup pre-scans these files at dev-server startup so Vite discovers
    // every Vuetify sub-import (and lazy route) up-front. Without this, a
    // navigation that pulls in a not-yet-seen Vuetify component (e.g.
    // `VCombobox` on an admin page) triggers dep-reoptimization mid-nav:
    // the old chunk hashes get invalidated while the browser is still
    // fetching them, so the navigation errors with "Loading failed for
    // the module" and `[Vue Router warn]: uncaught error during route navigation`.
    // Second click works (new hashes resolved); first click looked like
    // a "page refresh". See W6.3 in REFACTOR_ROADMAP.md for context.
    warmup: {
      clientFiles: [
        './src/App.vue',
        './src/main.ts',
        './src/layouts/**/*.vue',
        './src/pages/**/*.vue',
        './src/components/**/*.vue',
      ],
    },
  },
  test: {
    globals: true,
    environment: 'happy-dom',
    exclude: ['e2e/**', 'node_modules/**'],
    setupFiles: ['./src/test-setup.ts'],
    // Vuetify components pull in `.css` at module load. Inlining the `vuetify`
    // package forces Vite's pipeline to handle those imports — otherwise
    // Node's native resolver trips on `Unknown file extension ".css"`.
    server: {
      deps: {
        inline: ['vuetify'],
      },
    },
  },
})
