import { defineComponent, h, ref, watch } from 'vue'
import { AVATAR_FALLBACK, LANDSCAPE_FALLBACK, resolveImageSource } from '../utils/images.js'

export default defineComponent({
  name: 'AppImage',
  inheritAttrs: false,
  props: {
    src: String,
    alt: { type: String, default: '' },
    kind: { type: String, default: 'landscape' },
    fallback: String,
    loading: { type: String, default: 'lazy' },
    width: [String, Number],
    height: [String, Number]
  },
  setup(props, { attrs }) {
    const failed = ref(false)
    watch(() => [props.src, props.fallback, props.kind], () => { failed.value = false }, { flush: 'sync' })
    return () => {
      const avatar = props.kind === 'avatar'
      const localFallback = avatar ? AVATAR_FALLBACK : LANDSCAPE_FALLBACK
      const fallback = resolveImageSource(props.fallback, localFallback)
      const requested = resolveImageSource(props.src, fallback)
      const source = failed.value ? fallback : requested
      return h('img', {
        ...attrs, src: source, alt: props.alt, loading: props.loading, decoding: 'async',
        width: props.width ?? (avatar ? 160 : 640), height: props.height ?? (avatar ? 160 : 400),
        onError: () => {
          // 忽略已被替换的请求；兜底图也失败时停止切换，避免错误循环。
          if (resolveImageSource(props.src, fallback) === requested && source !== fallback) failed.value = true
        }
      })
    }
  }
})
