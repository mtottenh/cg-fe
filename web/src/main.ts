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

// Wire global 401 handler to auth store logout
const authStore = useAuthStore(pinia)
setUnauthorizedHandler(() => {
  authStore.logout()
  router.push({ name: 'login' })
})

// Wire refresh handler for silent token renewal on 401
setRefreshHandler(() => authStore.refreshAccessToken())

app.mount('#app')
