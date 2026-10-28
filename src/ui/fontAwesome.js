import { createIconComponent } from './createIconComponent.js'
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
  faCompass, faArrowRight, faSliders, faChartLine, faTriangleExclamation,
  faConciergeBell, faHospitalUser, faHeartCrack, faLock,
  faLayerGroup, faBolt, faFileInvoice, faCopy, faStop,
  faThumbsUp, faThumbsDown, faArrowLeftLong, faArrowLeft, faHouse,
  faTrashCan, faTowerBroadcast, faFaceSmile, faRightToBracket,
  faRightFromBracket, faCircleExclamation
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
  faCompass, faArrowRight, faSliders, faChartLine, faTriangleExclamation,
  faConciergeBell, faHospitalUser, faHeartCrack, faLock,
  faLayerGroup, faBolt, faFileInvoice, faCopy, faStop,
  faThumbsUp, faThumbsDown, faArrowLeftLong, faArrowLeft, faHouse,
  faTrashCan, faTowerBroadcast, faFaceSmile, faRightToBracket,
  faRightFromBracket, faCircleExclamation
]
const definitions = Object.fromEntries(icons.flatMap(icon =>
  [icon.iconName, ...icon.icon[2].filter(alias => typeof alias === 'string')].map(name => [name, icon])
))
// 微信联系方式使用通用会话图标，不再为一个标志下载整套品牌字体。
definitions.weixin = faComments
// 兼容历史别名类名（不同 FA 版本别名名称可能不同）
definitions['sliders-h'] = faSliders

export const FontAwesomeIcon = createIconComponent(definitions)
