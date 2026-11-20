<template>
  <details class="preparation" :open="open">
    <summary>
      出行准备
      <span class="summary-progress" v-if="stats.total">已准备 {{ stats.done }}/{{ stats.total }}（{{ stats.percent }}%）</span>
      <span class="summary-progress" v-else>尚未生成清单</span>
    </summary>

    <div class="progress" role="progressbar" :aria-valuenow="stats.percent" aria-valuemin="0" aria-valuemax="100" aria-label="准备进度">
      <div class="progress-bar" :style="{ width: stats.percent + '%' }"></div>
    </div>
    <p class="meta">
      共 {{ stats.total }} 项 · 未完成 {{ stats.open }} 项
      <span v-if="stats.overdue" class="danger"> · 已超过截止 {{ stats.overdue }} 项</span>
      <span v-if="stats.dueSoon" class="warn"> · 7 天内截止 {{ stats.dueSoon }} 项</span>
      <span v-if="stats.overdue || stats.dueSoon" class="muted">（应用内提醒，不发送系统推送）</span>
    </p>

    <div class="toolbar">
      <label>准备模板
        <select v-model="selectedTemplate">
          <option value="">选择模板…</option>
          <option v-for="template in templates" :key="template.id" :value="template.id">{{ template.name }}</option>
        </select>
      </label>
      <button type="button" class="btn" :disabled="!selectedTemplate || applying" @click="applyTemplate">按 {{ dayCount }} 天 / {{ personCount }} 人应用</button>
      <span class="muted">{{ selectedTemplateDescription }}</span>
    </div>
    <p v-if="templateNote" class="note" role="status">{{ templateNote }}</p>

    <form class="add-form" @submit.prevent="addItem">
      <label>事项 <input v-model="form.title" maxlength="80" placeholder="例如：预约博物馆门票" required /></label>
      <label>分类
        <select v-model="form.category">
          <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
        </select>
      </label>
      <label>截止日期 <input v-model="form.dueDate" type="date" /></label>
      <button type="submit" class="btn">添加</button>
    </form>

    <div class="filters" role="tablist" aria-label="按分类筛选准备事项">
      <button type="button" role="tab" :aria-selected="filter === 'all'" :class="{ active: filter === 'all' }" @click="filter = 'all'">全部 {{ stats.total }}</button>
      <button v-for="category in categories" :key="category" type="button" role="tab" :aria-selected="filter === category" :class="{ active: filter === category }" @click="filter = category">
        {{ category }} {{ countByCategory(category) }}
      </button>
    </div>

    <p v-if="!visibleItems.length" class="empty">
      {{ stats.total ? '该分类下没有事项。' : '还没有准备事项，可应用模板或手动添加。' }}
    </p>
    <ul class="items">
      <li v-for="item in visibleItems" :key="item.id" class="item" :class="{ done: item.done, overdue: isOverdue(item) }">
        <template v-if="editingId === item.id">
          <div class="edit">
            <input v-model="editDraft.title" maxlength="80" aria-label="事项名称" />
            <select v-model="editDraft.category" aria-label="分类">
              <option v-for="category in categories" :key="category" :value="category">{{ category }}</option>
            </select>
            <input v-model="editDraft.dueDate" type="date" aria-label="截止日期" />
            <input v-model="editDraft.note" maxlength="300" placeholder="备注（可选）" aria-label="备注" />
            <button type="button" class="btn" @click="saveEdit(item)">保存</button>
            <button type="button" class="btn ghost" @click="editingId = ''">取消</button>
          </div>
        </template>
        <template v-else>
          <label class="check">
            <input type="checkbox" :checked="item.done" @change="toggle(item)" />
            <span class="title">{{ item.title }}</span>
          </label>
          <span class="tag">{{ item.category }}</span>
          <span v-if="item.detail" class="detail">{{ item.detail }}</span>
          <span v-if="item.dueDate" class="due" :class="{ danger: isOverdue(item) }">截止 {{ item.dueDate }}</span>
          <span v-else class="muted">无截止日期</span>
          <span v-if="item.note" class="detail">{{ item.note }}</span>
          <span v-if="typeof item.source === 'string' && item.source.startsWith('template:')" class="muted">来自模板</span>
          <span class="actions">
            <button type="button" class="btn ghost" @click="startEdit(item)">编辑</button>
            <button type="button" class="btn ghost danger-text" @click="remove(item)">删除</button>
          </span>
        </template>
      </li>
    </ul>
    <p class="muted">清单随旅行保存；修改出发日期不会删除自定义事项，也不会自动调整已完成状态。</p>
  </details>
</template>
<script setup>
import { computed, reactive, ref, watch } from 'vue'
import { useFeedback } from '../composables/useFeedback.js'
import { inclusiveDayCount, localDateString } from '../utils/date.js'
import {
  PREPARATION_CATEGORIES, preparationTemplates, findPreparationTemplate, preparationStats, readPreparationItems,
  sortPreparationItems, applyPreparationTemplate, addPreparationItem,
  updatePreparationItem, togglePreparationItem, removePreparationItem
} from '../utils/preparation.js'

const props = defineProps({ route: { type: Object, required: true }, open: { type: Boolean, default: false } })
const feedback = useFeedback()
const categories = PREPARATION_CATEGORIES
const templates = preparationTemplates()
const selectedTemplate = ref('')
const applying = ref(false)
const templateNote = ref('')
const filter = ref('all')
const editingId = ref('')
const editDraft = reactive({ title: '', category: '行李', dueDate: '', note: '' })
const form = reactive({ title: '', category: '行李', dueDate: '' })
const today = ref(localDateString())

let stats
stats = computed(() => preparationStats(props.route, today.value))
const dayCount = computed(() => {
  try { return inclusiveDayCount(props.route.startDate, props.route.endDate) } catch { return (props.route.days || []).length || 1 }
})
const personCount = computed(() => {
  const value = Number(props.route.persons)
  return Number.isFinite(value) && value >= 1 ? Math.min(100, Math.floor(value)) : 1
})
const selectedTemplateDescription = computed(() => findPreparationTemplate(selectedTemplate.value)?.description || '模板可重复应用，不会重复添加相同事项')
const visibleItems = computed(() => {
  const items = readPreparationItems(props.route)
  return sortPreparationItems(filter.value === 'all' ? items : items.filter(item => item.category === filter.value))
})

watch(() => props.route.id, () => { editingId.value = ''; templateNote.value = ''; filter.value = 'all'; today.value = localDateString() })

function countByCategory(category) {
  return readPreparationItems(props.route).filter(item => item.category === category).length
}
function isOverdue(item) {
  return !item.done && Boolean(item.dueDate) && item.dueDate < today.value
}
function applyTemplate() {
  if (!selectedTemplate.value) return
  applying.value = true
  try {
    const result = applyPreparationTemplate(props.route, selectedTemplate.value, { days: dayCount.value, persons: personCount.value })
    templateNote.value = result.added
      ? `已按 ${dayCount.value} 天 / ${personCount.value} 人添加 ${result.added} 项${result.skipped ? `，跳过已存在的 ${result.skipped} 项` : ''}。`
      : `「${result.templateName}」的事项均已存在，本次未重复添加（${result.skipped} 项）。`
    feedback.success(result.added ? `已添加 ${result.added} 项准备事项` : '没有重复添加准备事项')
  } catch (error) { feedback.error(error.message) }
  finally { applying.value = false }
}
function addItem() {
  try {
    addPreparationItem(props.route, { ...form, dueDate: form.dueDate || '' })
    form.title = ''
    form.dueDate = ''
    feedback.success('已添加准备事项')
  } catch (error) { feedback.error(error.message) }
}
function startEdit(item) {
  editingId.value = item.id
  Object.assign(editDraft, { title: item.title, category: item.category, dueDate: item.dueDate, note: item.note })
}
function saveEdit(item) {
  try {
    updatePreparationItem(props.route, item.id, { ...editDraft, dueDate: editDraft.dueDate || '' })
    editingId.value = ''
    feedback.success('准备事项已更新')
  } catch (error) { feedback.error(error.message) }
}
function toggle(item) {
  try { togglePreparationItem(props.route, item.id) } catch (error) { feedback.error(error.message) }
}
async function remove(item) {
  const confirmed = await feedback.confirm(`删除「${item.title}」？`, { title: '删除准备事项', confirmLabel: '删除', danger: true })
  if (!confirmed) return
  try { removePreparationItem(props.route, item.id); feedback.success('已删除准备事项') } catch (error) { feedback.error(error.message) }
}
</script>
<style scoped>
.preparation { border: 1px solid #d7e1eb; background: #fff; border-radius: 12px; padding: 14px; margin: 12px 0; color: #243449; }
summary { cursor: pointer; font-weight: 700; display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 4px 0; }
.summary-progress { font-weight: 500; font-size: 13px; color: #4b647d; }
.progress { height: 8px; border-radius: 999px; background: #e6eef7; overflow: hidden; margin: 10px 0 6px; }
.progress-bar { height: 100%; background: linear-gradient(90deg, #667eea, #764ba2); transition: width .2s ease; }
.meta { font-size: 13px; color: #4b647d; margin: 0 0 10px; }
.danger { color: #c92a2a; }
.warn { color: #b26a00; }
.muted { color: #546374; font-size: 12px; }
.toolbar, .add-form, .filters { display: flex; flex-wrap: wrap; gap: 10px; align-items: flex-end; margin: 10px 0; }
label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; }
input, select, button { font: inherit; padding: 7px 9px; border: 1px solid #c7d3e0; border-radius: 8px; background: #fff; max-width: 100%; }
button { cursor: pointer; }
.btn { background: #eef3fb; }
.btn:disabled { opacity: .55; cursor: not-allowed; }
.ghost { background: transparent; border-color: #d7e1eb; }
.danger-text { color: #c92a2a; }
.filters button { border-radius: 999px; font-size: 13px; background: #f6f9fc; }
.filters button.active { background: #243449; color: #fff; border-color: #243449; }
.items { list-style: none; margin: 0; padding: 0; }
.item { display: flex; flex-wrap: wrap; gap: 8px; align-items: center; padding: 9px 0; border-top: 1px solid #eef2f7; }
.item.overdue .due { font-weight: 700; }
.item.done .title { text-decoration: line-through; color: #8a99a8; }
.check { flex-direction: row; align-items: center; gap: 8px; font-size: 14px; }
.title { font-weight: 600; }
.tag { font-size: 12px; background: #eef3fb; border-radius: 999px; padding: 2px 8px; color: #3d5771; }
.detail { font-size: 12px; color: #4b647d; }
.due { font-size: 12px; color: #3d5771; }
.actions { margin-left: auto; display: flex; gap: 6px; }
.edit { display: flex; flex-wrap: wrap; gap: 8px; width: 100%; }
.empty { font-size: 13px; color: #546374; margin: 10px 0; }
.note { font-size: 13px; color: #215c3d; margin: 4px 0; }
@media (max-width: 600px) { .actions { margin-left: 0; } .item { gap: 6px; } }
</style>
