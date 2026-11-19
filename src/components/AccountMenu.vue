<script setup>
import { DropdownMenuRoot, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from 'reka-ui'
import Settings from '~icons/lucide/settings-2'
import UserPen from '~icons/lucide/user-round-pen'
import Phone from '~icons/lucide/phone'
import Key from '~icons/lucide/key-round'
import Info from '~icons/lucide/info'
import Shield from '~icons/lucide/shield-check'
import Logout from '~icons/lucide/log-out'
const open = defineModel('open', {type:Boolean})
const emit = defineEmits(['choose'])
const options = [
  ['nickname','修改昵称',UserPen], ['phone','绑定手机号',Phone], ['password','修改密码',Key],
  ['about','关于我们',Info], ['privacy','本地演示数据说明',Shield], ['logout','退出登录 / 切换账号',Logout]
]
let choosing = false
function choose(key) { choosing = true; emit('choose', key) }
function restoreFocus(event) { if (choosing) event.preventDefault(); choosing = false }
</script>
<template>
  <DropdownMenuRoot v-model:open="open" :modal="false">
    <DropdownMenuTrigger class="ui-control"><Settings aria-hidden="true" /> 设置</DropdownMenuTrigger>
    <DropdownMenuContent align="end" :side-offset="6" class="account-menu" @close-auto-focus="restoreFocus">
      <DropdownMenuItem v-for="[key,label,icon] in options" :key="key" @select="choose(key)">
        <component :is="icon" aria-hidden="true" />{{ label }}
      </DropdownMenuItem>
    </DropdownMenuContent>
  </DropdownMenuRoot>
</template>
<style scoped>
.account-menu { z-index:510; min-width:190px; padding:5px; border:1px solid var(--border); border-radius:12px; background:white; box-shadow:var(--shadow-card-hover); }
[role=menuitem] { display:flex; align-items:center; gap:10px; padding:9px 11px; border-radius:7px; cursor:pointer; }
[role=menuitem][data-highlighted] { background:#eaf4ee; outline:none; }
</style>
