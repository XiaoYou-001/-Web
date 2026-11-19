<script setup>
import { computed } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart } from 'echarts/charts'
import { GridComponent } from 'echarts/components'
import { SVGRenderer } from 'echarts/renderers'
use([BarChart, GridComponent, SVGRenderer])
const props = defineProps({ expenses: { type:Array, required:true } })
const rows = computed(() => {
  const totals = new Map()
  for (const expense of props.expenses) {
    const category = expense.category || '其他'
    totals.set(category, (totals.get(category) || 0) + expense.amountCents)
  }
  return [...totals].sort((a,b) => b[1] - a[1])
})
const option = computed(() => ({
  animation:false, grid:{ top:8, bottom:4, left:65, right:90 },
  xAxis:{ type:'value', show:false }, yAxis:{ type:'category', inverse:true, data:rows.value.map(r => r[0]), axisTick:{show:false}, axisLine:{show:false} },
  series:[{ type:'bar', barMaxWidth:14, itemStyle:{color:'#348778',borderRadius:4}, label:{show:true,position:'right',formatter: p => '¥' + p.value.toFixed(2)}, data:rows.value.map(r => r[1]/100) }]
}))
</script>
<template><VChart :option="option" autoresize :style="{height:(rows.length * 32 + 20) + 'px'}" role="img" :aria-label="rows.map(([name,cents]) => name + ' ' + (cents/100).toFixed(2) + ' 元').join('，')" /></template>
