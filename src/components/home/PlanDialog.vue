<script setup>
import { ref } from 'vue'
import { useRouter } from 'vue-router'
import { DialogContent, DialogOverlay, DialogPortal, DialogTitle, DialogDescription, DialogClose } from 'reka-ui'
import TripDateRange from '../TripDateRange.vue'
import Dialog from './Dialog.vue'
import { localDateString } from '../../utils/date.js'

const props = defineProps({ place: { type: Object, required: true } })
const emit = defineEmits(['close'])
const router = useRouter()
const start = ref(localDateString())
const end = ref(start.value)
const opener = document.activeElement
function continuePlanning() {
  router.push({ name: 'routes', query: { city: props.place.short, start: start.value, end: end.value } })
}
</script>
<template>
  <Dialog :open="true" @update:open="open => !open && emit('close')">
    <DialogPortal>
      <DialogOverlay class="veil" />
      <DialogContent class="panel" @close-auto-focus.prevent="opener?.focus()">
        <DialogTitle class="title">规划{{ place.short }}行程</DialogTitle>
        <DialogDescription>选好旅行日期，在行程编辑器中完善计划。</DialogDescription>
        <form @submit.prevent="continuePlanning">
          <div class="date-field"><span>旅行日期</span><TripDateRange v-model:start="start" v-model:end="end" /></div>
          <button class="next">进入行程编辑器 →</button>
        </form>
        <DialogClose class="close" aria-label="关闭">×</DialogClose>
      </DialogContent>
    </DialogPortal>
  </Dialog>
</template>
<style scoped>
.veil { position:fixed; inset:0; background:#10282499; z-index:100; }
.panel { position:fixed; top:50%; left:50%; transform:translate(-50%,-50%); width:min(92vw,440px); box-sizing:border-box; padding:30px; background:#fcfaf4; color:#17392d; border-radius:20px; z-index:101; }
.title { margin:0 28px 12px 0; }
form,.date-field { display:grid; gap:8px; }
form { gap:16px; }
input { min-width:0; padding:10px; font:inherit; color:inherit; background:white; border:1px solid #abb7ad; border-radius:8px; }
button { cursor:pointer; font:inherit; }
.next { border:0; border-radius:24px; padding:13px; color:white; background:#204b3e; }
.close { position:absolute; right:12px; top:12px; width:36px; height:36px; background:transparent; border:0; font-size:24px; }
</style>
