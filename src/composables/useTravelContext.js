import { computed, inject } from 'vue'
import { routeLocationKey } from 'vue-router'
import { useTravelStore } from '../stores/travel.js'

// Only the travel ID crosses pages. Details are resolved from the active account.
export function useTravelContext() {
  const route = inject(routeLocationKey, null)
  const travel = useTravelStore()
  return computed(() => {
    const id = route?.query?.travel
    if (typeof id !== 'string') return null
    return travel.routes.find(item => String(item.id) === id) || null
  })
}
