import { computed, ref } from 'vue'
import { defineStore } from 'pinia'
import * as service from '../services/authService.js'
import { chatService } from '../services/chatService.js'

export const useAuthStore = defineStore('auth', () => {
  const user = ref(service.getCurrentUser())
  const isAuthenticated = computed(() => Boolean(user.value))

  function refresh() {
    const next = service.getCurrentUser()
    if (user.value?.id !== next?.id) chatService.disconnect()
    user.value = next
  }

  function run(action, ...args) {
    const result = action(...args)
    refresh()
    return result
  }

  function logout() {
    service.logout()
    chatService.disconnect()
    user.value = null
  }

  return {
    user, isAuthenticated, refresh, logout,
    login: (phone, password) => run(service.loginUser, phone, password),
    loginWithWechat: info => run(service.loginWithWechat, info),
    updateProfile: patch => run(service.updateCurrentUserProfile, patch),
    bindPhone: (phone, code) => run(service.bindCurrentPhone, phone, code),
    changePassword: (oldPassword, newPassword) => run(service.changeCurrentPassword, oldPassword, newPassword)
  }
})
