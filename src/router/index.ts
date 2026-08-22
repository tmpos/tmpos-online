import { createRouter, createWebHashHistory } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
const LoginView = () => import('@/views/LoginView.vue')
const HomeView = () => import('@/views/HomeView.vue')
const VenderView = () => import('@/views/VenderView.vue')
const InventarioView = () => import('@/views/InventarioView.vue')
const TallerView = () => import('@/views/TallerView.vue')
const ContabilidadView = () => import('@/views/ContabilidadView.vue')
const VentasView = () => import('@/views/VentasView.vue')
const ReportesView = () => import('@/views/ReportesView.vue')
const ContactosView = () => import('@/views/ContactosView.vue')
const ConfiguracionView = () => import('@/views/ConfiguracionView.vue')
const LicenseView = () => import('@/views/LicenseView.vue')
const ComprasView = () => import('@/views/ComprasView.vue')
const TransferenciasView = () => import('@/views/TransferenciasView.vue')
const SoporteView = () => import('@/views/SoporteView.vue')
const ReclamacionesView = () => import('@/views/ReclamacionesView.vue')
const EditarFacturaComp = () => import('@/components/ventas/EditarFacturaComp.vue')
const EditarCuentaCobrarComp = () => import('@/components/contabilidad/EditarCuentaCobrarComp.vue')

const permisoPorRuta: Record<string, string> = {
  '/': 'home',
  '/inventario': 'inventario',
  '/taller': 'taller',
  '/contactos': 'contactos',
  '/contabilidad': 'contabilidad',
  '/ventas': 'ventas',
  '/reportes': 'reportes',
  '/configuracion': 'configuracion',
  '/vender': 'vender',
  '/compras': 'compras',
  '/transferencias': 'transferencias',
  '/soporte': 'soporte',
  '/reclamaciones': 'reclamaciones',
}

const router = createRouter({
  history: createWebHashHistory(),
  routes: [
    {
      path: '/login',
      name: 'login',
      component: LoginView,
      meta: { requiresAuth: false },
    },
    {
      path: '/license',
      name: 'license',
      component: LicenseView,
      meta: { requiresAuth: true },
    },
    {
      path: '/',
      name: 'home',
      component: HomeView,
      meta: { requiresAuth: true },
    },
    {
      path: '/inventario',
      name: 'inventario',
      component: InventarioView,
      meta: { requiresAuth: true },
    },
    {
      path: '/vender',
      name: 'vender',
      component: VenderView,
      meta: { requiresAuth: true },
    },
    {
      path: '/taller',
      name: 'taller',
      component: TallerView,
      meta: { requiresAuth: true },
    },
    {
      path: '/contabilidad',
      name: 'contabilidad',
      component: ContabilidadView,
      meta: { requiresAuth: true },
    },
    {
      path: '/ventas',
      name: 'ventas',
      component: VentasView,
      meta: { requiresAuth: true },
    },
    {
      path: '/reportes',
      name: 'reportes',
      component: ReportesView,
      meta: { requiresAuth: true },
    },
    {
      path: '/reclamaciones',
      name: 'reclamaciones',
      component: ReclamacionesView,
      meta: { requiresAuth: true },
    },
    {
      path: '/soporte',
      name: 'soporte',
      component: SoporteView,
      meta: { requiresAuth: true },
    },
    {
      path: '/transferencias',
      name: 'transferencias',
      component: TransferenciasView,
      meta: { requiresAuth: true },
    },
    {
      path: '/compras',
      name: 'compras',
      component: ComprasView,
      meta: { requiresAuth: true },
    },
    {
      path: '/ventas/editar/:id',
      name: 'editar-factura',
      component: EditarFacturaComp,
      meta: { requiresAuth: true },
    },
    {
      path: '/ventas/cuenta-cobrar/:facturaId',
      name: 'editar-cuenta-cobrar',
      component: EditarCuentaCobrarComp,
      meta: { requiresAuth: true },
    },
    {
      path: '/contactos',
      name: 'contactos',
      component: ContactosView,
      meta: { requiresAuth: true },
    },
    {
      path: '/configuracion',
      name: 'configuracion',
      component: ConfiguracionView,
      meta: { requiresAuth: true, requiresAdminOrSupport: true },
    },
  ],
})

router.beforeEach(async (to, _from) => {
  console.log('[Router] Navegando a:', to.fullPath, '| auth:', useAuthStore().isAuthenticated)
  if (to.meta.requiresAuth !== false) {
    const auth = useAuthStore()
    if (!auth.isAuthenticated) {
      await auth.checkAuth()
    }
    if (!auth.isAuthenticated) {
      console.log('[Router] Redirigiendo a login')
      return { name: 'login', query: { redirect: to.fullPath } }
    }
    if (to.meta.requiresAdminOrSupport && !auth.isAdmin && !auth.isSoporte) {
      console.log('[Router] Configuracion restringida a Administrador y Soporte')
      return { name: 'home' }
    }
    const key = permisoPorRuta[to.path]
    if (key && !auth.tienePermiso(key)) {
      console.log('[Router] Sin permiso para:', to.path)
      // Nunca redirigir '/' hacia si misma: eso dispara el error de redireccion
      // infinita. Home funciona como destino seguro para usuarios autenticados.
      if (to.path === '/') return true
      return { name: 'home' }
    }
  }
})

router.afterEach((to) => {
  console.log('[Router] Navegacion completada a:', to.fullPath)
})

router.onError((err) => {
  console.error('[Router] Error en navegacion:', err)
})

export default router
