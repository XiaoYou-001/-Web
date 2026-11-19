<script setup>
// shadcn-vue Dialog, adapted to runtime props for this JavaScript project.
import { DialogRoot, useForwardPropsEmits } from "reka-ui"

const props = defineProps({ open: Boolean })
const emits = defineEmits(["update:open"])

const forwarded = useForwardPropsEmits(props, emits)
</script>

<template>
  <DialogRoot
    v-slot="slotProps"
    data-slot="dialog"
    v-bind="forwarded"
  >
    <slot v-bind="slotProps" />
  </DialogRoot>
</template>

