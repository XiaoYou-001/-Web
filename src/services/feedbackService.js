import { readonly, shallowRef } from 'vue'

export function createFeedbackService({ timers = globalThis } = {}) {
  const notices = shallowRef([])
  const confirmation = shallowRef(null)
  const timeouts = new Map()
  let sequence = 0, pending = null

  function dismiss(id) {
    timers.clearTimeout(timeouts.get(id))
    timeouts.delete(id)
    notices.value = notices.value.filter(notice => notice.id !== id)
  }
  function notify(message, type = 'info') {
    if (typeof message !== 'string' || !message.trim()) return
    const previous = notices.value.find(notice => notice.message === message && notice.type === type)
    if (previous) dismiss(previous.id)
    const id = ++sequence
    notices.value = [...notices.value, { id, message, type }]
    while (notices.value.length > 3) dismiss(notices.value[0].id)
    // 错误由用户关闭，避免尚未读完就消失。
    if (type !== 'error') timeouts.set(id, timers.setTimeout(() => dismiss(id), 5000))
    return id
  }
  function settleConfirmation(accepted = false) {
    const request = pending
    if (!request) return
    pending = null
    confirmation.value = null
    request.signal?.removeEventListener('abort', request.abort)
    request.resolve(accepted === true)
  }
  function confirm(message, { signal, title = '请确认操作', confirmLabel = '确认', danger = false } = {}) {
    // 同一时刻只处理一个确认，连续点击不会排队执行重复操作。
    if (signal?.aborted || pending) return Promise.resolve(false)
    return new Promise(resolve => {
      const abort = () => settleConfirmation(false)
      pending = { resolve, signal, abort }
      signal?.addEventListener('abort', abort, { once: true })
      confirmation.value = { title, message, confirmLabel, danger }
    })
  }
  function reset() {
    settleConfirmation(false)
    for (const notice of notices.value) dismiss(notice.id)
  }
  return {
    notices: readonly(notices), confirmation: readonly(confirmation), dismiss, confirm, settleConfirmation, reset,
    success: message => notify(message, 'success'), error: message => notify(message, 'error'),
    info: message => notify(message), warning: message => notify(message, 'warning')
  }
}

export const feedback = createFeedbackService()
