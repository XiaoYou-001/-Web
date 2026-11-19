<script setup>
// Adapted from Inspira UI's BlurReveal for a single, semantic itinerary list.
import { Motion, useReducedMotion } from 'motion-v'
const reduced = useReducedMotion()
</script>
<template>
  <Motion as="div" :initial="reduced ? false : { opacity: 0.4, filter: 'blur(3px)', y: 6 }"
    :animate="{ opacity: 1, filter: 'blur(0px)', y: 0 }" :transition="{ duration: reduced ? 0 : 0.32 }">
    <slot />
  </Motion>
</template>
