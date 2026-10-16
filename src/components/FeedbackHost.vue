<template>
  <section class="feedback-stack" aria-label="操作提示">
    <div v-for="notice in notices" :key="notice.id" :class="['feedback-notice', `feedback-${notice.type}`]"
      :role="notice.type === 'error' ? 'alert' : 'status'" aria-atomic="true">
      <span class="feedback-kind">{{ labels[notice.type] }}</span>
      <span>{{ notice.message }}</span>
      <button type="button" aria-label="关闭提示" @click="feedback.dismiss(notice.id)">×</button>
    </div>
  </section>
  <dialog v-if="confirmation" ref="dialog" class="feedback-dialog" role="alertdialog"
    aria-modal="true" aria-labelledby="feedback-title" aria-describedby="feedback-description"
    @cancel.prevent="feedback.settleConfirmation(false)" @keydown.tab="trapFocus">
    <h2 id="feedback-title">{{ confirmation.title }}</h2>
    <p id="feedback-description">{{ confirmation.message }}</p>
    <div class="feedback-actions">
      <button ref="cancelButton" type="button" autofocus @click="feedback.settleConfirmation(false)">取消</button>
      <button ref="confirmButton" type="button" :class="{ 'feedback-danger': confirmation.danger }" @click="feedback.settleConfirmation(true)">
        {{ confirmation.confirmLabel }}
      </button>
    </div>
  </dialog>
</template>

<script>
import { ref, watch, nextTick, onBeforeUnmount } from 'vue'
import { useRoute } from 'vue-router'
import { feedback } from '../services/feedbackService.js'

export default {
  setup() {
    const dialog = ref(null), cancelButton = ref(null), confirmButton = ref(null)
    const route = useRoute()
    let previousFocus = null, disposed = false
    function trapFocus(event) {
      if (event.shiftKey && document.activeElement === cancelButton.value) {
        event.preventDefault()
        confirmButton.value?.focus()
      } else if (!event.shiftKey && document.activeElement === confirmButton.value) {
        event.preventDefault()
        cancelButton.value?.focus()
      }
    }
    watch(feedback.confirmation, async value => {
      if (value) previousFocus = document.activeElement
      await nextTick()
      if (disposed) return
      if (value && feedback.confirmation.value === value && dialog.value) {
        dialog.value.showModal()
        cancelButton.value?.focus()
      } else if (!feedback.confirmation.value && previousFocus?.isConnected) {
        previousFocus.focus()
        previousFocus = null
      }
    }, { flush: 'post' })
    // 跳转后不保留上一页尚未确认的动作；成功提示可跨页面显示。
    watch(() => route.fullPath, () => feedback.settleConfirmation(false))
    onBeforeUnmount(() => { disposed = true; feedback.reset() })
    return { feedback, notices: feedback.notices, confirmation: feedback.confirmation, dialog, cancelButton, confirmButton, trapFocus,
      labels: { success: '成功', error: '错误', info: '提示', warning: '注意' } }
  }
}
</script>

<style>
.feedback-stack { position: fixed; top: 18px; right: 18px; z-index: 10000; width: min(400px, calc(100vw - 36px)); display: grid; gap: 10px; pointer-events: none; text-align: left; }
.feedback-notice { display: flex; align-items: flex-start; gap: 10px; padding: 15px; border: 1px solid #c5cfe1; border-left: 4px solid #4361ee; border-radius: 8px; background: white; color: #263650; box-shadow: 0 5px 22px #14264426; pointer-events: auto; overflow-wrap: anywhere; }
.feedback-kind { flex-shrink: 0; font-weight: 700; color: #3550ce; }
.feedback-success { border-left-color: #18734b; } .feedback-success .feedback-kind { color: #18734b; }
.feedback-error { border-left-color: #b42332; } .feedback-error .feedback-kind { color: #b42332; }
.feedback-warning { border-left-color: #945b00; } .feedback-warning .feedback-kind { color: #945b00; }
.feedback-notice button { margin-left: auto; flex-shrink: 0; border: 0; background: transparent; padding: 0 4px; font-size: 22px; color: #52617a; cursor: pointer; }
.feedback-dialog { width: min(440px, calc(100vw - 48px)); box-sizing: border-box; border: 0; border-radius: 14px; padding: 26px; color: #263650; text-align: left; box-shadow: 0 18px 80px #1426444d; }
.feedback-dialog::backdrop { background: #14264480; }
.feedback-dialog h2 { margin: 0 0 16px; font-size: 21px; }
.feedback-dialog p { margin: 0 0 24px; line-height: 1.7; overflow-wrap: anywhere; white-space: pre-line; }
.feedback-actions { display: flex; justify-content: flex-end; gap: 12px; }
.feedback-actions button { padding: 10px 18px; border: 1px solid #c5cfe1; border-radius: 7px; background: #fff; color: #263650; cursor: pointer; }
.feedback-actions button:last-child { background: #4361ee; border-color: #4361ee; color: white; }
.feedback-actions button.feedback-danger { background: #b42332; border-color: #b42332; }
.feedback-actions button:focus-visible, .feedback-notice button:focus-visible { outline: 3px solid #5b8af9; outline-offset: 3px; }
.field-error, .form-error { color: #b42332; font-size: 14px; line-height: 1.5; text-align: left; }
.field-error { margin: 6px 0 0; } .form-error { padding: 10px; border-radius: 6px; background: #fff0f1; }
input[aria-invalid="true"] { border-color: #b42332; }
</style>
