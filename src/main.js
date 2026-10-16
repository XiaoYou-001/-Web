import { createApp } from 'vue'
import { createPinia } from 'pinia'
import { watch } from 'vue'
import { feedback } from './services/feedbackService.js'
import App from './App.vue'
import router from './router'
import { useAuthStore } from './stores/auth.js'
import { useTravelStore } from './stores/travel.js'
import { userDataKey } from './services/userDataService.js'

const app = createApp(App)
app.use(createPinia())
app.use(router)
const auth = useAuthStore()
const travel = useTravelStore()
watch(() => auth.user?.id, () => feedback.reset(), { flush: 'sync' })
window.addEventListener('storage', event => {
  if (event.key === null || ['users', 'currentUser', 'isAuthenticated'].includes(event.key)) {
    const previousUserId = auth.user?.id
    auth.refresh()
    if (router.currentRoute.value.meta.requiresAuth && previousUserId !== auth.user?.id) {
      router.replace(auth.isAuthenticated ? '/' : '/login')
    }
  }
  if (auth.user && event.key === userDataKey(auth.user.id)) travel.refresh()
})


app.mount('#app')
