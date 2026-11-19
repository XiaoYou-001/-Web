<script setup>
import MapPin from '~icons/lucide/map-pin'
import Sparkles from '~icons/lucide/sparkles'
import Train from '~icons/lucide/train-front'
import Bed from '~icons/lucide/bed-double'
import Messages from '~icons/lucide/messages-square'
import User from '~icons/lucide/user-round'
const tools = [
  ['attractions', '全部景点', MapPin], ['customer-service', '旅行助手', Sparkles],
  ['tickets', '交通演示', Train], ['hotels', '住宿方案', Bed],
  ['chat', '聊天室', Messages], ['profile', '个人中心', User]
]
</script>
<template>
  <nav aria-label="更多旅行工具">
    <router-link v-for="[route,name,icon] in tools" :key="route" :to="{ name: route }">
      <component :is="icon" aria-hidden="true" />{{ name }}
    </router-link>
  </nav>
</template>
<style scoped>
nav { display:flex; flex-wrap:wrap; border-top:1px solid #ced4c9; padding:16px 0; gap:6px 24px; }
a { display:flex; align-items:center; gap:8px; padding:10px 0; color:inherit; text-decoration:none; }
a:hover { text-decoration:underline; }
</style>
