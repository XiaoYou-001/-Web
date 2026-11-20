<template>
  <section class="reservation-export" aria-labelledby="reservation-export-title">
    <h3 id="reservation-export-title">导出锁定预约</h3>
    <p v-if="!count">在日程编辑中勾选「锁定开始时间」，即可将预约和提醒导入手机日历。</p>
    <template v-else>
      <p>共 {{ count }} 项预约。请按这些预约的当地时间选择时区。</p>
      <form @submit.prevent="download">
        <label>目的地时区
          <input v-model.trim="zone" list="reservation-time-zones" required placeholder="Asia/Shanghai">
          <datalist id="reservation-time-zones"><option v-for="item in zones" :key="item" :value="item" /></datalist>
        </label>
        <label>日历提醒
          <select v-model="advance">
            <option :value="0">关闭</option>
            <option v-for="n in [10, 15, 30, 60, 120]" :key="n" :value="n">提前 {{ n }} 分钟</option>
          </select>
        </label>
        <button class="btn btn-primary" type="submit">下载预约日历（.ics）</button>
      </form>
      <p role="status">{{ message }}</p>
    </template>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import { lockedReservations, reservationCalendar } from '../utils/reservationCalendar.js'

const props = defineProps({ route: { type: Object, required: true } })
const count = computed(() => lockedReservations(props.route).length)
const zone = ref(props.route.timeZone || 'Asia/Shanghai')
const advance = ref(30), message = ref('')
const zones = ['UTC', ...(Intl.supportedValuesOf?.('timeZone') || ['Asia/Shanghai', 'Asia/Tokyo', 'Europe/Paris', 'America/New_York'])]
watch([zone, advance, count], () => { message.value = '' })
function download() {
  try {
    const content = reservationCalendar(props.route, { timeZone: zone.value, reminderMinutes: advance.value })
    const url = URL.createObjectURL(new Blob([content], { type: 'text/calendar;charset=utf-8' }))
    const link = document.createElement('a')
    link.href = url
    link.download = (props.route.title || '旅行').replace(/[\\/:*?"<>|]/g, '_') + '-预约.ics'
    document.body.appendChild(link)
    link.click()
    link.remove()
    setTimeout(() => URL.revokeObjectURL(url), 1000)
    message.value = `已生成 ${count.value} 项预约，请在日历应用中打开文件并确认导入。`
  } catch (error) { message.value = error.message }
}
</script>

<style scoped>
.reservation-export { margin:16px 0; padding:16px; border:1px solid #ceddd5; border-radius:12px; background:#f6faf7; }
.reservation-export h3 { margin:0; }
.reservation-export form { display:flex; flex-wrap:wrap; gap:12px; align-items:end; }
.reservation-export label { display:grid; gap:4px; min-width:0; max-width:100%; }
.reservation-export input, .reservation-export select { padding:8px; max-width:100%; box-sizing:border-box; }
.reservation-export [role=status]:empty { display:none; }
</style>
