<script setup>
import { onBeforeUnmount, ref } from 'vue'
const props = defineProps({ images: { type: Array, required: true }, current: String, label: String })
const busy = ref(false)
const error = ref('')
let viewer
let disposed = false
async function open(event) {
  if (busy.value || viewer) return
  const opener = event.currentTarget
  busy.value = true
  error.value = ''
  try {
    const [{ default: PhotoSwipe }, slides] = await Promise.all([
      import('photoswipe'),
      Promise.all([...new Set(props.images.filter(Boolean))].map(src => new Promise(resolve => {
        const image = new Image()
        image.onload = () => resolve({ src, width: image.naturalWidth, height: image.naturalHeight, alt: props.label })
        image.onerror = () => resolve(null)
        image.src = src
      }))),
      import('photoswipe/style.css')
    ])
    if (disposed) return
    const dataSource = slides.filter(Boolean)
    if (!dataSource.length) throw new Error()
    viewer = new PhotoSwipe({ dataSource, index: Math.max(0, dataSource.findIndex(x => x.src === props.current)),
      appendToEl: opener.closest('dialog[open]') || document.body, showHideAnimationType: 'fade',
      closeTitle: '关闭', zoomTitle: '缩放', arrowPrevTitle: '上一张', arrowNextTitle: '下一张' })
    viewer.on('destroy', () => { viewer = null })
    viewer.init()
  } catch { error.value = '照片未能打开，点击可重试。' } finally { busy.value = false }
}
onBeforeUnmount(() => { disposed = true; viewer?.destroy() })
</script>
<template>
  <button class="photo-trigger" type="button" :aria-label="'放大查看' + label" :aria-busy="busy" @click="open"><slot /></button>
  <small v-if="error" role="status">{{ error }}</small>
</template>
<style scoped>
.photo-trigger { display:block; width:100%; padding:0; background:transparent; border:0; border-radius:inherit; cursor:zoom-in; }
</style>
