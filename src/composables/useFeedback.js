import { onScopeDispose } from 'vue'
import { feedback } from '../services/feedbackService.js'

export function useFeedback() {
  let controller = new AbortController()
  let disposed = false
  function cancelConfirmations() { controller.abort(); controller = new AbortController() }
  onScopeDispose(() => { disposed = true; controller.abort() })
  return {
    success: (message, options) => { if (!disposed) feedback.success(message, options) },
    error: (message, options) => { if (!disposed) feedback.error(message, options) },
    info: (message, options) => { if (!disposed) feedback.info(message, options) },
    warning: (message, options) => { if (!disposed) feedback.warning(message, options) },
    confirm: (message, options = {}) => disposed ? Promise.resolve(false) : feedback.confirm(message, { ...options, signal: controller.signal }),
    cancelConfirmations
  }
}
