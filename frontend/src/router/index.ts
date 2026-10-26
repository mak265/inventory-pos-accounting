import { defineRouter } from '#q-app/wrappers'
import {
  createRouter,
  createMemoryHistory,
  createWebHistory,
  createWebHashHistory,
} from 'vue-router'
import routes from './routes'
import { hasPermission } from './permissions'

export default defineRouter(function (/* { store, ssrContext } */) {
  const createHistory = process.env.SERVER
    ? createMemoryHistory
    : process.env.VUE_ROUTER_MODE === 'history'
      ? createWebHistory
      : createWebHashHistory

  const Router = createRouter({
    scrollBehavior: () => ({ left: 0, top: 0 }),
    routes,
    history: createHistory(process.env.VUE_ROUTER_BASE),
  })

  // Navigation guard for authentication
  Router.beforeEach((to, _from, next) => {
    const isPublic = to.meta?.public === true
    const requiresAuth = to.matched.some((record) => record.meta?.requiresAuth)
    const token = localStorage.getItem('auth_token')

    if (requiresAuth && !token) {
      next({ name: 'login', query: { redirect: to.fullPath } })
      return
    } else if (to.name === 'login' && token) {
      next({ name: 'dashboard' })
      return
    } else if (isPublic || token || !requiresAuth) {
      // Permission check for authenticated users
      if (token) {
        const authUser = JSON.parse(localStorage.getItem('auth_user') || '{}')
        const userRole = authUser.role || ''
        if (to.name && typeof to.name === 'string' && !hasPermission(to.name, userRole)) {
          next({ name: 'dashboard' })
          return
        }
      }
      next()
    } else {
      next({ name: 'login' })
    }
  })

  return Router
})
