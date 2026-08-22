import { createApp } from 'vue'
import { createPinia } from 'pinia'
import PrimeVue from 'primevue/config'
import Aura from '@primevue/themes/aura'
import ToastService from 'primevue/toastservice'
import ConfirmationService from 'primevue/confirmationservice'
import Tooltip from 'primevue/tooltip'
import router from './router'
import App from './App.vue'

import 'primeicons/primeicons.css'
import './assets/main.css'
import { initRuntimeI18n } from '@/i18n/runtimeI18n'
import { formatSystemCurrency, formatSystemDate, formatSystemDateTime, formatSystemNumber, getSystemCurrencyCode } from '@/i18n/localeProfiles'

async function initApp() {
  const isCapacitor = typeof (window as any).Capacitor !== 'undefined' && (window as any).Capacitor.isNativePlatform()
  let capacitorApp: typeof import('@/capacitor/index') | undefined

  if (isCapacitor) {
    capacitorApp = await import('@/capacitor/index')
    await capacitorApp.initCapacitorApp()
  }

  const isSystemWeb = !isCapacitor && !(window as any).__isElectron && /^\/sistema\/[^/]+\/?$/.test(window.location.pathname)
  if (isSystemWeb) {
    const { initSystemRuntime } = await import('@/web/systemRuntime')
    await initSystemRuntime()
  }

  // Las vistas construyen las URL de logos y productos durante su primera
  // renderizacion. Si TM Cloud se inicializa despues de montar Vue,
  // getImageUrl() devuelve null y ese valor no cambia porque la configuracion
  // interna no es reactiva. Cargarla aqui garantiza que todas las imagenes
  // tengan una URL valida desde el primer render, incluido Electron/red.
  try {
    const { ensureConfigLoaded } = await import('@/services/tmCloudClient')
    await ensureConfigLoaded()
  } catch (error) {
    // La aplicacion sigue siendo util sin conexion; el auto-sync reintentara
    // cuando TM Cloud vuelva a estar disponible.
    console.warn('[TM Cloud] No se pudo preparar el almacenamiento de imagenes:', error)
  }

  // TM Cloud is the single source of truth for business data. SQLite remains
  // available only for bootstrap credentials, the installation license,
  // local login users and the essential company identity.
  if (!isSystemWeb) {
    const { installOnlineDataService } = await import('@/services/onlineDataService')
    await installOnlineDataService()
  }

  const app = createApp(App)

  // Available in every template/DataTable and always resolved from the active country.
  app.config.globalProperties.$formatMoney = formatSystemCurrency
  app.config.globalProperties.$currencyCode = getSystemCurrencyCode
  app.config.globalProperties.$formatNumber = formatSystemNumber
  app.config.globalProperties.$formatDate = formatSystemDate
  app.config.globalProperties.$formatDateTime = formatSystemDateTime

  app.config.errorHandler = (err, _instance, info) => {
    console.error('[Vue Error]', info, err)
  }

  router.onError((err) => {
    console.error('[Router Error]', err)
  })

  app.use(createPinia())
  app.use(router)
  app.use(PrimeVue, {
    theme: {
      preset: Aura,
      options: {
        darkModeSelector: '.dark',
        cssLayer: {
          name: 'primevue',
          order: 'theme, base, primevue',
        },
      },
    },
  })
  app.use(ToastService)
  app.use(ConfirmationService)
  app.directive('tooltip', Tooltip)

  app.mount('#app')
  initRuntimeI18n()

  // Apply the legacy WebView overrides after Vue and PrimeVue have inserted
  // their styles. This also forces the ELO compositor to repaint the WebView.
  if (isCapacitor) {
    capacitorApp?.applyAndroidRenderingCompatibility()
  }

  // No se inicia sincronizacion: en modo online obligatorio no existe una
  // copia local de los datos del negocio que reconciliar.
}

initApp()
