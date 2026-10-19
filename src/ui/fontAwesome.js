import { defineComponent, h, normalizeClass } from 'vue'
import { FontAwesomeIcon as SvgIcon } from '@fortawesome/vue-fontawesome'
import {
  faStar, faStarHalfStroke, faLocationDot, faClock, faCheck,
  faHeart, faHeartCirclePlus, faMagnifyingGlass, faXmark,
  faCamera, faMap, faPlane, faHome, faPhone, faComment, faUser,
  faTh, faThLarge, faList, faBalanceScale, faLightbulb, faTag,
  faSpinner, faBell, faShare, faFire, faBellSlash, faTrash,
  faCircleDollarToSlot, faPlus, faWandMagicSparkles, faWalking,
  faEye, faRoute, faCalendarDays, faShareNodes, faPerson,
  faChildren, faUserGroup, faDollarSign, faDownload, faSave,
  faPalette, faCircleUser, faHotel, faCalendar, faCalendarCheck, faCalendarXmark,
  faFilter, faChevronUp, faChevronDown, faChevronLeft, faChevronRight,
  faWifi, faSquareParking, faDumbbell, faWaterLadder, faSpa, faUsers,
  faUtensils, faMartiniGlass, faBriefcase, faPenToSquare, faInbox,
  faGear, faUserPen, faKey, faCircleInfo, faShieldHalved, faHeadset,
  faTicket, faTicketSimple, faCreditCard, faRotateLeft, faArrowRotateLeft, faRectangleList, faClockRotateLeft,
  faArrowsRotate, faRightLeft, faFlag, faMoneyBillWave, faRobot,
  faCircleCheck, faCircleQuestion, faImage, faFileImage, faPaperPlane,
  faCircleXmark, faEnvelope, faComments, faRotate, faPhoneFlip,
  faCompass, faArrowRight
} from '@fortawesome/free-solid-svg-icons'

// 使用明确的图标定义，不依赖全局注册；同一模块供懒加载页面复用。
const icons = [
  faStar, faStarHalfStroke, faLocationDot, faClock, faCheck,
  faHeart, faHeartCirclePlus, faMagnifyingGlass, faXmark,
  faCamera, faMap, faPlane, faHome, faPhone, faComment, faUser,
  faTh, faThLarge, faList, faBalanceScale, faLightbulb, faTag,
  faSpinner, faBell, faShare, faFire, faBellSlash, faTrash,
  faCircleDollarToSlot, faPlus, faWandMagicSparkles, faWalking,
  faEye, faRoute, faCalendarDays, faShareNodes, faPerson,
  faChildren, faUserGroup, faDollarSign, faDownload, faSave,
  faPalette, faCircleUser, faHotel, faCalendar, faCalendarCheck, faCalendarXmark,
  faFilter, faChevronUp, faChevronDown, faChevronLeft, faChevronRight,
  faWifi, faSquareParking, faDumbbell, faWaterLadder, faSpa, faUsers,
  faUtensils, faMartiniGlass, faBriefcase, faPenToSquare, faInbox,
  faGear, faUserPen, faKey, faCircleInfo, faShieldHalved, faHeadset,
  faTicket, faTicketSimple, faCreditCard, faRotateLeft, faArrowRotateLeft, faRectangleList, faClockRotateLeft,
  faArrowsRotate, faRightLeft, faFlag, faMoneyBillWave, faRobot,
  faCircleCheck, faCircleQuestion, faImage, faFileImage, faPaperPlane,
  faCircleXmark, faEnvelope, faComments, faRotate, faPhoneFlip,
  faCompass, faArrowRight
]
const definitions = Object.fromEntries(icons.flatMap(icon =>
  [icon.iconName, ...icon.icon[2].filter(alias => typeof alias === 'string')].map(name => [name, icon])
))
// 微信联系方式使用通用会话图标，不再为一个标志下载整套品牌字体。
definitions.weixin = faComments

export const FontAwesomeIcon = defineComponent({
  name: 'FontAwesomeIcon',
  inheritAttrs: false,
  props: { icon: { type: [String, Array, Object] } },
  setup(props, { attrs }) {
    return () => {
      // 兼容现有动态设施、星级 class，原样保留样式及点击处理器。
      const legacy = normalizeClass(attrs.class).split(/\s+/).find(name => name.startsWith('fa-'))?.slice(3)
      const [prefix, name] = Array.isArray(props.icon) ? props.icon : ['fas', props.icon || legacy]
      if (name === 'star-o') {
        return h('svg', { ...attrs, class: ['svg-inline--fa', attrs.class], viewBox: '0 0 24 24', width: '1em', height: '1em', 'aria-hidden': 'true' }, [
          h('path', { d: 'm12 2 3.1 6.3 6.9 1-5 4.9 1.2 6.8-6.2-3.2L5.8 21 7 14.2 2 9.3l6.9-1Z', fill: 'none', stroke: 'currentColor', 'stroke-width': 1.5, 'stroke-linejoin': 'round' })
        ])
      }
      return h(SvgIcon, { ...attrs, icon: (prefix === 'fas' && definitions[name]) || props.icon || ['fas', name] })
    }
  }
})
