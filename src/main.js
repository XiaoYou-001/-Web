import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import router from './router'
import ElementPlus from 'element-plus'
import 'element-plus/dist/index.css'
import zhCn from 'element-plus/dist/locale/zh-cn.mjs'

const app = createApp(App)
app.use(createPinia())
app.use(router)
app.use(ElementPlus, { locale: zhCn })
app.mount('#app')// 从环境变量读取配置


import { library } from '@fortawesome/fontawesome-svg-core'
import { 
  faStar, 
  faLocationDot, 
  faClock, 
  faCheck, 
  faHeart, 
  faHeartCirclePlus, 
  faMagnifyingGlass, 
  faXmark, 
  faCamera, 
  faMap, 
  faPlane, 
  faHome, 
  faPhone, 
  faComment, 
  faPalette, 
  faUser,
  faTh,
  faList,
  faBalanceScale,
  faLightbulb,
  faTag,
  faSpinner,
  faSearch,
  faBell,
  faShare,
  faFire,
  faBellSlash,
  faTrash,
  faCircleDollarToSlot,
  faLandmark
} from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/vue-fontawesome'

library.add(
  faStar, 
  faLocationDot, 
  faClock, 
  faCheck, 
  faHeart, 
  faHeartCirclePlus, 
  faMagnifyingGlass, 
  faXmark, 
  faCamera, 
  faMap, 
  faPlane, 
  faHome, 
  faPhone, 
  faComment, 
  faPalette, 
  faUser,
  faTh,
  faList,
  faBalanceScale,
  faLightbulb,
  faTag,
  faSpinner,
  faSearch,
  faBell,
  faShare,
  faFire,
  faBellSlash,
  faTrash,
  faCircleDollarToSlot,
  faLandmark
)
app.component('font-awesome-icon', FontAwesomeIcon)