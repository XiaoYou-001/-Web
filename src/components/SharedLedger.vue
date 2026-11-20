<template>
  <details class="shared-ledger">
    <summary>同行共享账本 · {{ formatCents(book.totalCents) }}</summary>
    <p>这里登记的支出对本旅行空间的成员可见。付款人是记账者，费用在所选成员间均摊。</p>
    <form v-if="canWrite" @submit.prevent="submit">
      <label>支出名称 <input v-model.trim="title" class="shared-title" maxlength="60" required placeholder="例如：午餐"></label>
      <label>我垫付的金额（元） <input v-model.trim="amount" class="shared-amount" inputmode="decimal" required placeholder="0.00"></label>
      <fieldset>
        <legend>分摊成员</legend>
        <label v-for="member in trip.members" :key="member.id">
          <input v-model="participants" type="checkbox" :value="member.id"> {{ member.name }}{{ member.isMe ? '（我）' : '' }}
        </label>
      </fieldset>
      <button :disabled="sending || storageFailed || !participants.length">登记共享支出</button>
    </form>
    <p v-if="message" role="status">{{ message }}</p>
    <section v-if="pending.length">
      <h4>待同步（{{ pending.length }} 笔）</h4>
      <ul><li v-for="item in pending" :key="item.requestId">
        {{ item.title }} · {{ formatCents(item.amountCents) }}
        <span v-if="rejected[item.requestId]">{{ rejected[item.requestId] }}
          <button type="button" @click="discard(item)">移除此待同步记录</button>
        </span>
      </li></ul>
      <button v-if="canWrite" type="button" :disabled="sending" @click="flush">重试同步</button>
    </section>
    <p v-if="!book.expenses.length">还没有已同步的共享支出。</p>
    <ul v-else class="shared-expenses">
      <li v-for="item in book.expenses" :key="item.id">
        <strong>{{ item.title }} · {{ formatCents(item.amountCents) }}</strong>
        <details>
          <summary>{{ item.payerName }} 垫付 · {{ item.participantIds.length }} 人均摊</summary>
          <ul><li v-for="id in item.participantIds" :key="id">{{ item.participantNames[id] }} · {{ formatCents(item.shares[id]) }}</li></ul>
        </details>
      </li>
    </ul>
    <section v-if="book.expenses.length" class="shared-balances">
      <h4>按人汇总</h4>
      <ul><li v-for="row in book.balances" :key="row.id">
        <strong>{{ row.name }}</strong> · 已付 {{ formatCents(row.paidCents) }} · 分摊 {{ formatCents(row.owedCents) }} ·
        {{ row.netCents === 0 ? '已平衡' : (row.netCents > 0 ? '应收 ' : '应付 ') + formatCents(Math.abs(row.netCents)) }}
      </li></ul>
    </section>
  </details>
</template>

<script setup>
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { collaborationService } from '../services/collaborationService.js'
import { getCurrentUser } from '../services/authService.js'
import { pendingExpenses } from '../services/pendingExpenses.js'
import { formatCents, yuanToCents } from '../utils/ledger.js'

const props = defineProps({
  trip: { type: Object, required: true },
  localTripId: { type: [String, Number], required: true },
  ownerId: { type: String, required: true },
  accountId: { type: String, required: true }
})
const emit = defineEmits(['updated', 'access-error'])
const book = computed(() => props.trip.sharedLedger || { expenses: [], balances: [], totalCents: 0 })
const canWrite = computed(() => ['owner', 'member'].includes(props.trip.myRole))
const participants = ref(props.trip.members.map(item => item.id))
const title = ref(''), amount = ref(''), pending = ref([]), rejected = ref({})
const sending = ref(false), storageFailed = ref(false), message = ref('')
let queue, disposed = false
watch(() => props.trip.members, (members, previous) => {
  const ids = new Set(members.map(item => item.id))
  const selectedAll = previous.every(member => participants.value.includes(member.id))
  participants.value = selectedAll ? [...ids] : participants.value.filter(id => ids.has(id))
})
function reload() {
  try {
    if (getCurrentUser()?.id !== props.ownerId) {
      pending.value = []
      storageFailed.value = true
      message.value = '当前账号已切换，请重新打开旅行。'
      return false
    }
    queue ||= pendingExpenses(localStorage, props.ownerId, props.accountId, props.trip.id)
    pending.value = queue.list()
    storageFailed.value = false
    return true
  } catch {
    storageFailed.value = true
    message.value = '待同步记录无法读取，请检查浏览器存储权限。'
    return false
  }
}
function submit() {
  if (sending.value || !canWrite.value || !reload()) return
  let amountCents
  try {
    amountCents = yuanToCents(amount.value)
    if (amountCents <= 0 || !title.value || !participants.value.length) throw new Error('请填写名称、正数金额并选择分摊成员')
  } catch (error) { message.value = error.message; return }
  try { queue.add({ title: title.value, amountCents, participantIds: participants.value }) }
  catch { message.value = '本机未能保存待同步支出，请检查存储空间后重试。'; return }
  title.value = ''
  amount.value = ''
  message.value = '支出已保存在本机，等待同步。'
  flush()
}
async function flush() {
  if (disposed || sending.value || !canWrite.value || !reload() || !pending.value.length) return
  if (navigator.onLine === false) { message.value = '支出已保存在本机，联网后会重试。'; return }
  sending.value = true
  try {
    for (const item of pending.value) {
      if (disposed || !canWrite.value || getCurrentUser()?.id !== props.ownerId) break
      let updated
      try {
        updated = await collaborationService.addSharedExpense(props.ownerId, props.localTripId, item, {
          accountId: props.accountId, tripId: props.trip.id
        })
        const acknowledged = updated?.id === props.trip.id && updated.sharedLedger?.expenses.some(
          receipt => receipt.requestId === item.requestId && receipt.payerId === props.accountId
        )
        if (!acknowledged) throw new Error('尚未收到该笔支出的确认')
      } catch (error) {
        if (disposed) return
        if ([400, 409, 422].includes(error.status)) {
          rejected.value[item.requestId] = error.message
          continue
        }
        if ([401, 403].includes(error.status)) emit('access-error', error)
        message.value = error.message + '；支出已保留，可重试同步。'
        return
      }
      // Remove only the exact operation acknowledged by the server, even if
      // the user switched views while it was in flight.
      queue.remove(item.requestId)
      if (disposed) return
      emit('updated', updated)
    }
    if (!disposed) message.value = queue.list().length ? '部分支出仍待同步。' : '共享支出已同步。'
  } catch {
    if (!disposed) message.value = '本机同步状态保存失败。重试会核对同一笔支出。'
  } finally {
    sending.value = false
    if (!disposed) reload()
  }
}
function discard(item) {
  if (sending.value || !rejected.value[item.requestId]) return
  try { queue.remove(item.requestId); delete rejected.value[item.requestId]; reload() }
  catch { message.value = '待同步记录移除失败，请检查存储权限。' }
}
function storageChanged(event) {
  if (event.key === null || event.key?.startsWith(queue?.prefix)) reload()
}
onMounted(() => {
  reload()
  flush()
  window.addEventListener('online', flush)
  window.addEventListener('storage', storageChanged)
})
onBeforeUnmount(() => {
  disposed = true
  window.removeEventListener('online', flush)
  window.removeEventListener('storage', storageChanged)
})
</script>

<style scoped>
.shared-ledger { margin: 12px 0; padding: 10px 0; border-block-start: 1px solid #dbe5e0; overflow-wrap: anywhere; }
summary { cursor: pointer; padding: 6px 0; font-weight: 600; }
form { display: grid; gap: 10px; max-width: 32rem; }
form > label { display: grid; gap: 4px; }
fieldset { display: flex; flex-wrap: wrap; gap: 8px 16px; min-width: 0; }
input,button { padding: 8px; font: inherit; max-width: 100%; }
button { cursor: pointer; }
li { margin: 8px 0; }
</style>
