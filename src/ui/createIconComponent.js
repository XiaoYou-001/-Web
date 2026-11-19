import { defineComponent, h, normalizeClass } from 'vue'
import { FontAwesomeIcon as SvgIcon } from '@fortawesome/vue-fontawesome'

import { MapPin, Pencil, Share2, Search, CalendarDays, Trash2, X, Copy, Settings } from '@lucide/vue'

// Common actions share the navigation icon style. Domain-specific glyphs keep their existing definitions.
const actions = {
  'location-dot': MapPin, 'map-marker-alt': MapPin, edit: Pencil, 'pen-to-square': Pencil,
  'share-nodes': Share2, 'share-alt': Share2, search: Search, 'magnifying-glass': Search,
  'calendar-days': CalendarDays, trash: Trash2, 'trash-alt': Trash2, times: X, xmark: X,
  copy: Copy, gear: Settings, cog: Settings
}

export function createIconComponent(definitions) {
  return defineComponent({
  name: 'FontAwesomeIcon',
  inheritAttrs: false,
  props: { icon: { type: [String, Array, Object] } },
  setup(props, { attrs }) {
    return () => {
      // 兼容现有动态设施、星级 class，原样保留样式及点击处理器。
      const legacy = normalizeClass(attrs.class).split(/\s+/).find(name => name.startsWith('fa-'))?.slice(3)
      const [prefix, name] = Array.isArray(props.icon) ? props.icon : ['fas', props.icon || legacy]
      if (prefix === 'fas' && Object.hasOwn(actions, name)) {
        return h(actions[name], { ...attrs, class: ['svg-inline--fa', attrs.size && `fa-${attrs.size}`, attrs.class], size: '1em',
          'aria-hidden': attrs['aria-label'] ? undefined : true })
      }
      if (name === 'star-o') {
        return h('svg', { ...attrs, class: ['svg-inline--fa', attrs.class], viewBox: '0 0 24 24', width: '1em', height: '1em', 'aria-hidden': 'true' }, [
          h('path', { d: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round' })
        ])
      }
      return h(SvgIcon, { ...attrs, icon: (prefix === 'fas' && definitions[name]) || props.icon || ['fas', name] })
    }
  }
})

}
