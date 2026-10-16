import { onScopeDispose } from 'vue'
import { feedback } from '../services/feedbackService.js'

export function useFeedback() {
  let controller = new AbortController()
  let disposed = false
  function cancelConfirmations() { controller.abort(); controller = new AbortController() }
  onScopeDispose(() => { disposed = true; controller.abort() })
  return {
    success: message => { if (!disposed) feedback.success(message) },
    error: message => { if (!disposed) feedback.error(message) },
    info: message => { if (!disposed) feedback.info(message) },
    warning: message => { if (!disposed) feedback.warning(message) },
    confirm: (message, options = {}) => disposed ? Promise.resolve(false) : feedback.confirm(message, { ...options, signal: controller.signal }),
    cancelConfirmations
  }
}
