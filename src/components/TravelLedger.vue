<template>
  <details class="ledger" :open="open">
    <summary>
      旅行账本与 AA 分账
      <span class="summary-meta" v-if="summary.expenseCount">共 {{ summary.expenseCount }} 笔 · {{ formatCents(summary.totalCents) }}</span>
      <span class="summary-meta" v-else>尚未记账</span>
    </summary>

    <p class="hint">金额以人民币整数分计算，分摊合计始终等于支出金额。结算记录只表示在应用内登记了一次转账，<strong>不代表真实支付已完成</strong>；预计费用不会进入实际分账。</p>

    <section class="block">
      <h3>同行人</h3>
      <form class="row" @submit.prevent="addMember">
        <input v-model="memberName" maxlength="20" placeholder="同行人名称，例如：小林" aria-label="同行人名称" />
        <button type="submit" class="btn">添加同行人</button>
      </form>
      <p v-if="!members.length" class="muted">先添加同行人，才能记录付款人与分摊参与人。</p>
      <ul class="chips">
        <li v-for="member in members" :key="member.id">
          <span>{{ member.name }}</span>
          <button type="button" class="link danger-text" @click="removeMember(member)">移除</button>
        </li>
      </ul>
    </section>

    <section class="block">
      <h3>记一笔实际支出</h3>
      <p v-if="members.length < 1" class="muted">至少添加一位同行人后可记账。</p>
      <form v-else class="expense-form" @submit.prevent="submitExpense">
        <div class="row">
          <label>名称 <input v-model="form.title" maxlength="60" placeholder="例如：海鲜晚餐" required /></label>
          <label>金额（元） <input v-model="form.amount" inputmode="decimal" placeholder="0.00" required /></label>
          <label>分类
            <select v-model="form.category"><option v-for="category in categories" :key="category" :value="category">{{ category }}</option></select>
          </label>
          <label>日期 <input v-model="form.date" type="date" required /></label>
        </div>
        <div class="row">
          <label>付款人
            <select v-model="form.payerId" required>
              <option value="" disabled>选择付款人</option>
              <option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option>
            </select>
          </label>
          <label>分摊方式
            <select v-model="form.splitMode"><option value="even">均摊（余数按成员顺序分配）</option><option value="custom">自定义金额</option></select>
          </label>
          <label class="grow">备注 <input v-model="form.note" maxlength="300" placeholder="可选" /></label>
        </div>
        <fieldset>
          <legend>分摊参与人</legend>
          <label v-for="member in members" :key="member.id" class="check">
            <input type="checkbox" :value="member.id" :checked="form.participantIds.includes(member.id)" @change="toggleParticipant(member.id)" />
            {{ member.name }}
            <input
              v-if="form.splitMode === 'custom' && form.participantIds.includes(member.id)"
              v-model="form.shares[member.id]"
              inputmode="decimal"
              class="share-input"
              :aria-label="member.name + '分摊金额（元）'"
              placeholder="0.00"
            />
          </label>
          <p v-if="!form.participantIds.length" class="muted">请选择至少一位参与人；付款人可以不参与分摊（例如代付）。</p>
          <p v-else-if="form.splitMode === 'even'" class="muted">{{ evenPreview }}</p>
          <p v-else class="muted">自定义分摊合计：{{ customPreview }}</p>
        </fieldset>
        <p v-if="form.sourceExpenseId" class="muted">本笔来自「{{ form.sourceTitle }}」的实际支出，不会与原有预算统计重复计费。</p>
        <div class="row">
          <button type="submit" class="btn primary">记入账本</button>
          <button v-if="form.sourceExpenseId" type="button" class="btn ghost" @click="resetForm">取消导入</button>
          <button type="button" class="btn ghost" @click="resetForm">清空</button>
        </div>
      </form>

      <details v-if="importableExpenses.length" class="import">
        <summary>从实际支出导入（{{ importableExpenses.length }} 笔）</summary>
        <ul>
          <li v-for="expense in importableExpenses" :key="expense.__key">
            {{ expense.category }} · {{ expense.title }} · 实际 {{ formatCents(Math.round(expense.actual * 100)) }}
            <button type="button" class="link" @click="prefillFromExpense(expense)">填入表单</button>
          </li>
        </ul>
      </details>
    </section>

    <section class="block" v-if="ledger.expenses.length">
      <h3>支出记录</h3>
      <ul class="expenses">
        <li v-for="expense in ledger.expenses" :key="expense.id">
          <div class="expense-head">
            <strong>{{ expense.title }}</strong>
            <span class="amount">{{ formatCents(expense.amountCents) }}</span>
            <span class="tag">{{ expense.category }}</span>
            <span class="muted">{{ expense.date }} · {{ memberLabel(expense.payerId) }} 付款</span>
            <span v-if="coveringSettlement(expense.id)" class="tag settled">已结算</span>
          </div>
          <p class="split">{{ splitText(expense) }}</p>
          <p v-if="expense.note" class="muted">备注：{{ expense.note }}</p>
          <div class="row compact">
            <button type="button" class="link" @click="startEdit(expense)">修改</button>
            <button type="button" class="link danger-text" @click="removeExpense(expense)">删除</button>
          </div>
        </li>
      </ul>

      <form v-if="editing" class="expense-form edit-form" @submit.prevent="saveEdit">
        <h4>修改「{{ editing.title }}」</h4>
        <div class="row">
          <label>名称 <input v-model="editing.title" maxlength="60" required /></label>
          <label>金额（元） <input v-model="editing.amount" inputmode="decimal" required /></label>
          <label>付款人
            <select v-model="editing.payerId"><option v-for="member in members" :key="member.id" :value="member.id">{{ member.name }}</option></select>
          </label>
          <label>分摊方式
            <select v-model="editing.splitMode"><option value="even">均摊（余数按成员顺序分配）</option><option value="custom">自定义金额</option></select>
          </label>
        </div>
        <fieldset>
          <legend>分摊参与人</legend>
          <label v-for="member in members" :key="member.id" class="check">
            <input type="checkbox" :checked="editing.participantIds.includes(member.id)" @change="toggleEditParticipant(member.id)" />
            {{ member.name }}
            <input
              v-if="editing.splitMode === 'custom' && editing.participantIds.includes(member.id)"
              v-model="editing.shares[member.id]"
              inputmode="decimal"
              class="share-input"
              :aria-label="member.name + '修改后分摊金额（元）'"
              placeholder="0.00"
            />
          </label>
          <p class="muted" v-if="editing.splitMode === 'custom'">自定义分摊合计：{{ editCustomPreview }}（保存时合计必须等于支出金额）</p>
          <p class="muted" v-else>均摊会按修改后的金额与参与人重算，余数按成员顺序分配。</p>
        </fieldset>
        <div class="row"><button type="submit" class="btn primary">保存修改</button><button type="button" class="btn ghost" @click="editing = null">取消</button></div>
      </form>
    </section>

    <section class="block" v-if="balances.rows.length">
      <h3>余额（已付 · 应承担 · 应收/应付）</h3>
      <div class="table-wrap">
        <table>
        <thead><tr><th>同行人</th><th>已付</th><th>应承担</th><th>已登记转账</th><th>剩余应收/应付</th></tr></thead>
        <tbody>
          <tr v-for="row in balances.rows" :key="row.id">
            <td>{{ row.name }}</td>
            <td>{{ formatCents(row.paid) }}</td>
            <td>{{ formatCents(row.share) }}</td>
            <td>{{ formatCents(row.transferred - row.received) }}</td>
            <td :class="row.remaining > 0 ? 'receivable' : row.remaining < 0 ? 'payable' : 'muted'">
              {{ row.remaining === 0 ? '已结清' : row.remaining > 0 ? '应收 ' + formatCents(row.remaining) : '应付 ' + formatCents(-row.remaining) }}
            </td>
          </tr>
        </tbody>
        </table>
      </div>
      <p class="muted">余额守恒检查：剩余合计 {{ formatCents(balances.remainingSum) }}（应为 ¥0.00）。</p>

      <h4>建议转账</h4>
      <p v-if="!transfers.length" class="muted">当前没有待结算的转账。</p>
      <ul v-else class="transfers">
        <li v-for="(transfer, index) in transfers" :key="index">
          {{ transfer.fromName }} → {{ transfer.toName }} <strong>{{ formatCents(transfer.amountCents) }}</strong>
          <button type="button" class="btn" @click="startSettlement(transfer)">登记结算</button>
        </li>
      </ul>

      <form v-if="settlement" class="row settlement-form" @submit.prevent="saveSettlement">
        <label>结算金额（元） <input v-model="settlement.amount" inputmode="decimal" required /></label>
        <label>备注 <input v-model="settlement.note" maxlength="200" placeholder="可选，例如：微信转账" /></label>
        <button type="submit" class="btn primary">登记 {{ settlement.fromName }} → {{ settlement.toName }}</button>
        <button type="button" class="btn ghost" @click="settlement = null">取消</button>
      </form>

      <details v-if="ledger.settlements.length">
        <summary>结算记录（{{ ledger.settlements.length }}）</summary>
        <ul class="settlements">
          <li v-for="record in ledger.settlements" :key="record.id">
            {{ record.date }} · {{ memberLabel(record.fromId) }} → {{ memberLabel(record.toId) }} {{ formatCents(record.amountCents) }}
            <span v-if="record.note" class="muted">（{{ record.note }}）</span>
            <button type="button" class="link danger-text" @click="revoke(record)">撤销</button>
          </li>
        </ul>
        <p class="muted">撤销结算不会修改支出记录；已包含在该结算中的支出需撤销后才能修改或删除。</p>
      </details>
    </section>
  </details>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useFeedback } from '../composables/useFeedback.js'
import { localDateString } from '../utils/date.js'
import {
  LEDGER_CATEGORIES, addLedgerMember, removeLedgerMember, addLedgerExpense, updateLedgerExpense,
  removeLedgerExpense, ledgerBalances, suggestedTransfers, recordSettlement, revokeSettlement,
  splitEven, formatCents, yuanToCents, readLedger, settlementCovering, migrateExpenseSources
} from '../utils/ledger.js'

const props = defineProps({ route: { type: Object, required: true }, open: { type: Boolean, default: false } })
// 实际支出需要稳定 id：旧版本用数组下标做来源标记，删除记录后会错位并重复入账。
migrateExpenseSources(props.route)
const feedback = useFeedback()
const categories = LEDGER_CATEGORIES
const ledger = computed(() => readLedger(props.route))
const members = computed(() => ledger.value.members)
const summary = computed(() => ({
  expenseCount: ledger.value.expenses.length,
  totalCents: ledger.value.expenses.reduce((sum, expense) => sum + (Number.isSafeInteger(expense.amountCents) ? expense.amountCents : 0), 0)
}))
const balances = computed(() => ledgerBalances(props.route))
const transfers = computed(() => suggestedTransfers(balances.value))
const importableExpenses = computed(() => {
  const used = new Set(ledger.value.expenses.map(expense => expense.sourceExpenseId).filter(Boolean))
  return (props.route.expenses || [])
    .map((expense, index) => ({ ...expense, __key: expense.id || String(index), __index: index }))
    .filter(expense => expense.actual != null && Number.isFinite(Number(expense.actual)) && Number(expense.actual) > 0
      && !used.has(expense.__key))
})

const memberName = ref('')
const form = reactive(createEmptyForm())
const editing = ref(null)
const settlement = ref(null)

function createEmptyForm() {
  return {
    title: '', amount: '', category: '餐饮', date: localDateString(), payerId: '',
    splitMode: 'even', participantIds: [], shares: {}, note: '', sourceExpenseId: '', sourceTitle: ''
  }
}
function resetForm() {
  Object.assign(form, createEmptyForm())
  if (members.value.length) form.payerId = members.value[0].id
}
if (members.value.length) form.payerId = members.value[0].id
watch(members, list => {
  if (!list.length) { form.payerId = ''; return }
  if (!list.some(member => member.id === form.payerId)) form.payerId = list[0].id
  const valid = new Set(list.map(member => member.id))
  form.participantIds = form.participantIds.filter(id => valid.has(id))
})

function addMember() {
  try {
    const member = addLedgerMember(props.route, memberName.value)
    memberName.value = ''
    if (!form.payerId) form.payerId = member.id
    feedback.success('已添加同行人')
  } catch (error) { feedback.error(error.message) }
}
async function removeMember(member) {
  if (!await feedback.confirm(`移除同行人「${member.name}」？`, { title: '移除同行人', confirmLabel: '移除', danger: true })) return
  try { removeLedgerMember(props.route, member.id); feedback.success('已移除同行人') } catch (error) { feedback.error(error.message) }
}
function toggleParticipant(id) {
  const index = form.participantIds.indexOf(id)
  if (index === -1) form.participantIds.push(id)
  else form.participantIds.splice(index, 1)
}
const evenPreview = computed(() => {
  try {
    if (form.amount === '') return '均摊预览：填写金额后显示'
    const shares = splitEven(yuanToCents(form.amount), form.participantIds)
    return '均摊预览：' + Object.entries(shares).map(([id, cents]) => `${memberLabel(id)} ${formatCents(cents)}`).join('，')
  } catch (error) { return error.message }
})
const customPreview = computed(() => {
  let sum = 0
  let invalid = false
  for (const id of form.participantIds) {
    const value = form.shares[id]
    if (value === undefined || value === '') continue
    try { sum += yuanToCents(value) } catch { invalid = true }
  }
  const amount = form.amount === '' ? null : (() => { try { return yuanToCents(form.amount) } catch { return null } })()
  if (invalid) return '存在无效金额'
  if (amount === null) return formatCents(sum)
  return `${formatCents(sum)} / ${formatCents(amount)}${sum === amount ? '（一致）' : '（不一致）'}`
})
function memberLabel(id) {
  return members.value.find(member => member.id === id)?.name || '未知成员'
}
function splitText(expense) {
  const shares = expense.shares && typeof expense.shares === 'object' ? expense.shares : {}
  return '分摊：' + Object.entries(shares).map(([id, cents]) => `${memberLabel(id)} ${formatCents(cents)}`).join('，') + (expense.splitMode === 'custom' ? '（自定义）' : '（均摊）')
}
function coveringSettlement(expenseId) {
  return settlementCovering(ledger.value, expenseId)
}

function prefillFromExpense(expense) {
  form.title = expense.title || ''
  form.amount = Number(expense.actual).toFixed(2)
  form.category = LEDGER_CATEGORIES.includes(expense.category) ? expense.category : '其他'
  form.note = expense.title && expense.category !== expense.title ? `来源：${expense.category}` : ''
  form.sourceExpenseId = String(expense.__key)
  form.sourceTitle = expense.title || ''
  form.participantIds = members.value.map(member => member.id)
  if (!form.payerId && members.value.length) form.payerId = members.value[0].id
}

function submitExpense() {
  try {
    addLedgerExpense(props.route, {
      title: form.title,
      amount: form.amount,
      category: form.category,
      date: form.date,
      payerId: form.payerId,
      participantIds: [...form.participantIds],
      splitMode: form.splitMode,
      shares: form.splitMode === 'custom' ? Object.fromEntries(form.participantIds.map(id => [id, yuanToCents(form.shares[id] === '' || form.shares[id] === undefined ? '0' : form.shares[id])])) : undefined,
      note: form.note,
      sourceExpenseId: form.sourceExpenseId
    })
    resetForm()
    feedback.success('已记入账本')
  } catch (error) { feedback.error(error.message) }
}

function startEdit(expense) {
  const shares = {}
  for (const id of expense.participantIds || []) {
    const cents = expense.shares && Number.isSafeInteger(expense.shares[id]) ? expense.shares[id] : 0
    shares[id] = (cents / 100).toFixed(2)
  }
  editing.value = {
    id: expense.id, title: expense.title, amount: (expense.amountCents / 100).toFixed(2),
    payerId: expense.payerId, participantIds: [...(expense.participantIds || [])],
    splitMode: expense.splitMode === 'custom' ? 'custom' : 'even',
    shares
  }
}
const editCustomPreview = computed(() => {
  if (!editing.value) return ''
  const sum = editing.value.participantIds.reduce((total, id) => {
    try { return total + yuanToCents(editing.value.shares[id] === '' || editing.value.shares[id] === undefined ? '0' : editing.value.shares[id]) }
    catch { return NaN }
  }, 0)
  if (!Number.isFinite(sum)) return '存在无效金额'
  let amount = null
  try { amount = yuanToCents(editing.value.amount) } catch { amount = null }
  if (amount === null) return formatCents(sum)
  return `${formatCents(sum)} / ${formatCents(amount)}${sum === amount ? '（一致）' : '（不一致）'}`
})
function toggleEditParticipant(id) {
  const list = editing.value.participantIds
  const index = list.indexOf(id)
  if (index === -1) {
    list.push(id)
    if (editing.value.splitMode === 'custom' && editing.value.shares[id] === undefined) editing.value.shares[id] = '0.00'
  } else list.splice(index, 1)
}
function saveEdit() {
  try {
    const next = editing.value
    const patch = {
      title: next.title, amount: next.amount, payerId: next.payerId,
      participantIds: [...next.participantIds], splitMode: next.splitMode
    }
    if (next.splitMode === 'custom') {
      patch.shares = Object.fromEntries(next.participantIds.map(id => [id, yuanToCents(next.shares[id] === '' || next.shares[id] === undefined ? '0' : next.shares[id])]))
    }
    updateLedgerExpense(props.route, next.id, patch)
    editing.value = null
    feedback.success(next.splitMode === 'custom' ? '支出已修改，自定义分摊已保存' : '支出已修改，分摊已重算')
  } catch (error) { feedback.error(error.message) }
}
async function removeExpense(expense) {
  if (!await feedback.confirm(`删除「${expense.title}」这笔支出？`, { title: '删除支出', confirmLabel: '删除', danger: true })) return
  try { removeLedgerExpense(props.route, expense.id); feedback.success('支出已删除') } catch (error) { feedback.error(error.message) }
}

function startSettlement(transfer) {
  settlement.value = { fromId: transfer.fromId, fromName: transfer.fromName, toId: transfer.toId, toName: transfer.toName, amount: (transfer.amountCents / 100).toFixed(2), note: '' }
}
function saveSettlement() {
  try {
    recordSettlement(props.route, {
      fromId: settlement.value.fromId, toId: settlement.value.toId,
      amount: settlement.value.amount, note: settlement.value.note
    })
    settlement.value = null
    feedback.success('已登记结算（不代表真实支付已完成）')
  } catch (error) { feedback.error(error.message) }
}
async function revoke(record) {
  if (!await feedback.confirm('撤销这条结算记录？相关支出将恢复可修改。', { title: '撤销结算', confirmLabel: '撤销结算', danger: true })) return
  try { revokeSettlement(props.route, record.id); feedback.success('结算已撤销') } catch (error) { feedback.error(error.message) }
}
</script>
<style scoped>
.ledger { border: 1px solid #d7e1eb; background: #fff; border-radius: 12px; padding: 14px; margin: 12px 0; color: #243449; }
summary { cursor: pointer; font-weight: 700; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; }
.summary-meta { font-weight: 500; font-size: 13px; color: #4b647d; }
.hint { font-size: 12px; color: #4b647d; background: #f6f9fc; border-radius: 8px; padding: 8px 10px; }
.block { margin: 14px 0; padding-top: 10px; border-top: 1px dashed #dde6ef; }
.block h3 { font-size: 15px; margin: 0 0 8px; }
.row { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin: 8px 0; }
.row.compact { gap: 14px; margin: 4px 0 0; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
label.grow { flex: 1; min-width: 180px; }
label.check { flex-direction: row; align-items: center; gap: 6px; }
input, select, button { font: inherit; padding: 7px 9px; border: 1px solid #c7d3e0; border-radius: 8px; background: #fff; max-width: 100%; }
button { cursor: pointer; }
.btn { background: #eef3fb; }
.btn.primary { background: #243449; color: #fff; border-color: #243449; }
.ghost { background: transparent; border-color: #d7e1eb; }
.link { border: 0; background: none; padding: 2px 0; color: #245a9c; text-decoration: underline; }
.danger-text { color: #c92a2a; }
.muted { color: #71808f; font-size: 12px; }
fieldset { border: 1px solid #e2eaf2; border-radius: 10px; padding: 8px 10px; margin: 8px 0; display: flex; flex-wrap: wrap; gap: 10px; }
legend { font-size: 12px; color: #4b647d; padding: 0 4px; }
.share-input { width: 92px; }
.chips { list-style: none; display: flex; flex-wrap: wrap; gap: 8px; padding: 0; margin: 6px 0 0; }
.chips li { background: #eef3fb; border-radius: 999px; padding: 4px 10px; font-size: 13px; display: flex; gap: 8px; align-items: center; }
.expenses, .transfers, .settlements { list-style: none; padding: 0; margin: 8px 0; }
.expenses li { border-top: 1px solid #eef2f7; padding: 8px 0; }
.expense-head { display: flex; flex-wrap: wrap; gap: 8px; align-items: baseline; }
.amount { font-weight: 700; }
.split { font-size: 12px; color: #4b647d; margin: 4px 0; }
.tag { font-size: 12px; background: #eef3fb; border-radius: 999px; padding: 2px 8px; color: #3d5771; }
.tag.settled { background: #e6f4ea; color: #215c3d; }
table { width: 100%; border-collapse: collapse; font-size: 13px; }
.table-wrap { overflow-x: auto; }
th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #eef2f7; }
th { font-size: 12px; color: #4b647d; font-weight: 600; }
.receivable { color: #1f7a4d; font-weight: 600; }
.payable { color: #c92a2a; font-weight: 600; }
.transfers li { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; padding: 6px 0; border-top: 1px solid #eef2f7; font-size: 13px; }
.settlements li { padding: 6px 0; border-top: 1px solid #eef2f7; font-size: 13px; }
.import { margin-top: 8px; }
.import ul { margin: 6px 0; padding-left: 18px; font-size: 13px; }
.edit-form { border: 1px solid #e2eaf2; border-radius: 10px; padding: 10px; margin-top: 10px; }
@media (max-width: 600px) { table { font-size: 12px; } th, td { padding: 5px 2px; } }
</style>
