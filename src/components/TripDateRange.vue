<script setup>
import { computed } from 'vue'
import DatePicker from '@vuepic/vue-datepicker'
import '@vuepic/vue-datepicker/dist/main.css'
const props = defineProps({ start: String, end: String, min: String, nights: Boolean, label: { type: String, default: '旅行日期' } })
const emit = defineEmits(['update:start','update:end'])
const value = computed({
  get: () => props.start && props.end ? [props.start, props.end] : null,
  set: dates => { emit('update:start', dates?.[0] || ''); emit('update:end', dates?.[1] || '') }
})
</script>
<template>
  <DatePicker v-model="value" :range="{ partialRange:false, minRange:nights ? 1 : 0 }" model-type="yyyy-MM-dd"
    format="yyyy-MM-dd" locale="zh-CN" :enable-time-picker="false" auto-apply :clearable="false"
    :min-date="min ? new Date(min + 'T00:00:00') : undefined" :placeholder="label" :aria-labels="{ input: label }" />
</template>
