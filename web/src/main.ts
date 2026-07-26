import { createApp } from 'vue'
import { createPinia } from 'pinia'
import vuetify from './plugins/vuetify'
import router from './router'
import App from './App.vue'
import { setUnauthorizedHandler, setRefreshHandler } from './api/middleware'
import { useAuthStore } from './stores/auth'

import './styles/main.scss'

const app = createApp(App)

const pinia = createPinia()
app.use(pinia)
app.use(vuetify)
app.use(router)

// Wire global 401 handler to auth store session teardown.
// P-60: this must be `clearSession`, NOT `logout`. The server has already
// rejected our token, so a revoke call would be pointless — and it would 401
// in turn, re-entering this very handler.
const authStore = useAuthStore(pinia)
setUnauthorizedHandler(() => {
  authStore.clearSession()
  router.push({ name: 'login' })
})

// Wire refresh handler for silent token renewal on 401
setRefreshHandler(() => authStore.refreshAccessToken())

app.mount('#app')
