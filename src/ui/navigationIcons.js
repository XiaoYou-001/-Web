import { createIconComponent } from './createIconComponent.js'
import { faCamera } from '@fortawesome/free-solid-svg-icons/faCamera'
import { faMap } from '@fortawesome/free-solid-svg-icons/faMap'
import { faRoute } from '@fortawesome/free-solid-svg-icons/faRoute'
import { faTicket } from '@fortawesome/free-solid-svg-icons/faTicket'
import { faTicketSimple } from '@fortawesome/free-solid-svg-icons/faTicketSimple'
import { faHotel } from '@fortawesome/free-solid-svg-icons/faHotel'
import { faHeadset } from '@fortawesome/free-solid-svg-icons/faHeadset'
import { faComments } from '@fortawesome/free-solid-svg-icons/faComments'
import { faRightLeft } from '@fortawesome/free-solid-svg-icons/faRightLeft'
import { faPalette } from '@fortawesome/free-solid-svg-icons/faPalette'
import { faArrowRight } from '@fortawesome/free-solid-svg-icons/faArrowRight'

// 首页和导航只下载入口图标，业务页按需加载完整图标集合。
const icons = [faCamera, faMap, faRoute, faTicket, faTicketSimple, faHotel,
  faHeadset, faComments, faRightLeft, faPalette, faArrowRight]
const definitions = Object.fromEntries(icons.flatMap(icon =>
  [icon.iconName, ...icon.icon[2].filter(alias => typeof alias === 'string')].map(name => [name, icon])
))
export const FontAwesomeIcon = createIconComponent(definitions)
