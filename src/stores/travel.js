import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'
import { useAuthStore } from './auth.js'
import * as repository from '../services/userDataService.js'

export const useTravelStore = defineStore('travel', () => {
  const auth = useAuthStore()
  const data = ref(repository.emptyUserData())
  const storageError = ref('')
  const ownerId = computed(() => auth.user?.id || '')

  function refresh() {
    try {
      data.value = ownerId.value ? repository.readUserData(ownerId.value) : repository.emptyUserData()
      storageError.value = ''
    } catch (error) {
      data.value = repository.emptyUserData(ownerId.value)
      storageError.value = error.message
    }
  }
  watch(ownerId, refresh, { immediate: true, flush: 'sync' })

  function commit(action, args, expectedOwnerId = ownerId.value) {
    try {
      const saved = action(...args, expectedOwnerId)
      data.value = saved.data
      storageError.value = ''
      return saved.result
    } catch (error) {
      storageError.value = error.message
      throw error
    }
  }

  const routes = computed(() => data.value.routes)
  const attractionFavorites = computed(() => data.value.favorites.attractions)
  const hotelFavorites = computed(() => data.value.favorites.hotels)
  const subscriptions = computed(() => data.value.subscriptions)
  const favoriteCount = computed(() => attractionFavorites.value.length + hotelFavorites.value.length + routes.value.filter(route => route.isFavorite).length)

  return {
    ownerId, storageError, routes, attractionFavorites, hotelFavorites, subscriptions, favoriteCount, refresh,
    saveRoute: (route, owner) => commit(repository.saveUserRoute, [route], owner),
    deleteRoute: id => commit(repository.deleteUserRoute, [id]),
    toggleRouteFavorite: id => commit(repository.toggleRouteFavorite, [id]),
    toggleFavorite: (type, id) => commit(repository.toggleUserFavorite, [type, id]),
    subscribe: input => commit(repository.createUserSubscription, [input]),
    unsubscribe: id => commit(repository.deleteUserSubscription, [id])
  }
})
