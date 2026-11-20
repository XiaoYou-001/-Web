<template>
  <div class="delay-controls">
    <label><input v-model="activity.timeLocked" type="checkbox">锁定开始时间</label>
    <button v-if="!activity.skipped" type="button" :aria-expanded="open" @click="toggle">{{ open ? '收起延误预览' : '延误调整' }}</button>
    <section v-if="open && !activity.skipped" :aria-label="activity.title + '的延误预览'">
      <h4>{{ activity.title }} · 延误预览</h4>
      <label v-if="!knownMinutes(activity.durationMinutes)">原计划停留（分钟）
        <input v-model.number="stay" type="number" min="0" step="1">
      </label>
      <label>比原计划晚结束（分钟）
        <input v-model.number="minutes" type="number" min="1" step="1">
      </label>
      <p v-if="preview.error" role="status">{{ preview.error }}</p>
      <template v-else>
        <ol>
          <li v-for="row in preview.rows" :key="row.index">
            <strong>{{ row.title }}</strong>
            <span v-if="row.end">{{ row.before }} 开始，预计 {{ row.end }} 结束（停留 {{ row.duration }} 分钟）</span>
            <span v-else-if="row.fixed">{{ row.before }} 固定 · {{ row.margin < 0 ? '预计晚到 ' + -row.margin + ' 分钟' : '预计提前 ' + row.margin + ' 分钟到达' }}</span>
            <span v-else>{{ row.before === row.after ? row.before + ' 按原计划' : row.before + ' → ' + row.after }}</span>
            <small v-if="row.leaveBy">上一站最多停留 {{ row.maxPreviousStay }} 分钟，最晚 {{ row.leaveBy }} 出发</small>
          </li>
        </ol>
        <p v-for="(warning, index) in preview.warnings" :key="index">{{ warning }}</p>
        <p v-if="preview.blocked" role="status">有固定活动预计赶不上。请调整停留或交通时间后再确认。</p>
      </template>
      <button type="button" :disabled="preview.blocked" @click="apply">确认调整当天安排</button>
      <button type="button" @click="open = false">取消</button>
    </section>
    <p v-if="message" role="status">{{ message }}</p>
  </div>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { knownMinutes, previewDayDelay } from '../utils/dayDelay.js'

const props = defineProps({ day: { type: Object, required: true }, index: { type: Number, required: true } })
const activity = computed(() => props.day.activities[props.index])
const open = ref(false), minutes = ref(30), stay = ref(''), message = ref('')
const preview = computed(() => previewDayDelay(props.day.activities, props.index, minutes.value, stay.value))

watch([activity, () => props.day, () => activity.value?.skipped], () => {
  open.value = false
  message.value = ''
})
function toggle() {
  minutes.value = 30
  stay.value = ''
  message.value = ''
  open.value = !open.value
}
function apply() {
  const result = preview.value
  if (!open.value || result.blocked) return
  for (const row of result.rows) {
    const target = props.day.activities[row.index]
    if (row.duration !== undefined) target.durationMinutes = row.duration
    if (row.after !== row.before) target.time = row.after
  }
  open.value = false
  message.value = '当天安排已调整，可在旅行工作台点击「撤销修改」。'
}
</script>

<style scoped>
.delay-controls { display:flex; flex-wrap:wrap; gap:8px 14px; align-items:center; margin:10px 0; }
.delay-controls label { display:inline-flex; gap:6px; align-items:center; }
.delay-controls section { flex-basis:100%; padding:12px; border:1px solid #bdd0c8; border-radius:8px; background:#f7faf8; color:#243449; }
.delay-controls section label { margin:4px 8px 4px 0; }
.delay-controls input[type=number] { width:5em; }
.delay-controls button { padding:6px 10px; }
.delay-controls li span, .delay-controls li small { display:block; }
.delay-controls li { margin-block:8px; }
</style>
