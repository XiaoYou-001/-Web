import { createRouter, createWebHistory } from 'vue-router'
import { isLoggedIn } from '../services/authService.js'
import { pageTitle, scrollBehavior } from './navigation.js'

const routes = [
  {
    path: '/',
    name: 'home',
    component: () => import('../views/HomeView.vue'),
    meta: { requiresAuth: true }
  },
  {
    path: '/login',
    name: 'login',
    component: () => import('../views/LoginView.vue')
  },
  {
    path: '/register',
    name: 'register',
    component: () => import('../views/RegisterView.vue')
  },
  {
    path: '/attractions',
    name: 'attractions',
    component: () => import('../views/AttractionsView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/routes',
    name: 'routes',
    component: () => import('../views/RoutesView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/routes/:id',
    name: 'route-detail',
    component: () => import('../views/RouteDetailView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/tickets',
    name: 'tickets',
    component: () => import('../views/TicketsView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/hotels',
    name: 'hotels',
    component: () => import('../views/HotelsView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/customer-service',
    name: 'customer-service',
    component: () => import('../views/CustomerServiceView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/chat',
    name: 'chat',
    component: () => import('../views/ChatView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/profile',
    name: 'profile',
    component: () => import('../views/ProfileView.vue'),
    meta: { requiresAuth: true, header: true }
  },
  {
    path: '/itinerary/share/:id',
    name: 'itinerary-share',
    component: () => import('../views/ItineraryShareView.vue'),
    meta: { requiresAuth: true }
  }
]

routes.push({
  path: '/:pathMatch(.*)*',
  name: 'not-found',
  component: () => import('../views/NotFoundView.vue')
})

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes,
  scrollBehavior
})

// 路由守卫
router.beforeEach((to, from, next) => {
  const isAuthenticated = isLoggedIn()
  
  if (to.meta.requiresAuth && !isAuthenticated) {
    next('/login')
  } else {
    next()
  }
})

router.afterEach((to, _from, failure) => {
  if (!failure) document.title = pageTitle(to.name)
})

export default router
