<script setup lang="ts">
import { shallowRef, computed, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const EmpresaComp = defineAsyncComponent(() => import('@/components/configuracion/EmpresaComp.vue'))
const SistemaComp = defineAsyncComponent(() => import('@/components/configuracion/SistemaComp.vue'))
const CorreoComp = defineAsyncComponent(() => import('@/components/configuracion/CorreoComp.vue'))
const NotificacionesComp = defineAsyncComponent(() => import('@/components/configuracion/NotificacionesComp.vue'))
const BackupsComp = defineAsyncComponent(() => import('@/components/configuracion/BackupsComp.vue'))
const ImpresorasComp = defineAsyncComponent(() => import('@/components/configuracion/ImpresorasComp.vue'))
const SoporteComp = defineAsyncComponent(() => import('@/components/configuracion/SoporteComp.vue'))
const BitacoraComp = defineAsyncComponent(() => import('@/components/configuracion/BitacoraComp.vue'))
const VentasConfigComp = defineAsyncComponent(() => import('@/components/configuracion/VentasConfigComp.vue'))
const LicenciaComp = defineAsyncComponent(() => import('@/components/configuracion/LicenciaComp.vue'))
const PermisosComp = defineAsyncComponent(() => import('@/components/configuracion/PermisosComp.vue'))
const TMCloudComp = defineAsyncComponent(() => import('@/components/configuracion/TMCloudComp.vue'))
const ActualizacionComp = defineAsyncComponent(() => import('@/components/configuracion/ActualizacionComp.vue'))
const MetodosPagoComp = defineAsyncComponent(() => import('@/components/configuracion/MetodosPagoComp.vue'))
const AlanubeComp = defineAsyncComponent(() => import('@/components/configuracion/AlanubeComp.vue'))
const ComprobantesElectronicosComp = defineAsyncComponent(() => import('@/components/configuracion/ComprobantesElectronicosComp.vue'))
const OtpLocalComp = defineAsyncComponent(() => import('@/components/configuracion/OtpLocalComp.vue'))
const ModoTiendaComp = defineAsyncComponent(() => import('@/components/configuracion/ModoTiendaComp.vue'))
const OpenAIComp = defineAsyncComponent(() => import('@/components/configuracion/OpenAIComp.vue'))
const HomeConfigComp = defineAsyncComponent(() => import('@/components/configuracion/HomeConfigComp.vue'))

const auth = useAuthStore()
const route = useRoute()
const { isDominicanFiscal } = useLocaleProfile()

const items = computed<SubMenuItem[]>(() => {
  const list: SubMenuItem[] = [
    { label: 'Empresa', icon: 'pi pi-building', key: 'empresa' },
    { label: 'Sistema', icon: 'pi pi-desktop', key: 'sistema' },
    { label: 'Personalizar Home', icon: 'pi pi-home', key: 'home-config' },
    { label: 'OpenAI / Jarvis', icon: 'pi pi-sparkles', key: 'openai' },
    { label: 'Modo de tienda', icon: 'pi pi-shop', key: 'modo-tienda' },
    { label: 'Notificaciones', icon: 'pi pi-bell', key: 'notificaciones' },
    { label: 'Backups', icon: 'pi pi-cloud-upload', key: 'backups' },
    { label: 'Impresoras', icon: 'pi pi-print', key: 'impresoras' },
    { label: 'Ventas', icon: 'pi pi-shopping-cart', key: 'ventas-config' },
    { label: 'Licencia', icon: 'pi pi-shield', key: 'licencia' },
    { label: 'Permisos', icon: 'pi pi-shield', key: 'permisos' },
    { label: 'TM Cloud', icon: 'pi pi-server', key: 'tmcloud' },
    { label: 'Actualizacion', icon: 'pi pi-refresh', key: 'actualizacion' },
    { label: 'Metodos Pago', icon: 'pi pi-credit-card', key: 'metodos-pago' },
  ]
  if (isDominicanFiscal.value) {
    list.push({ label: 'Alanube', icon: 'pi pi-cloud', key: 'alanube' })
    list.push({ label: 'Comprobantes e-CF', icon: 'pi pi-receipt', key: 'comprobantes-electronicos' })
  }
  if (auth.isSoporte) {
    list.push({ label: 'Correo', icon: 'pi pi-envelope', key: 'correo' })
  }
  if (auth.isSoporte || auth.isAdmin) {
    list.push({ label: 'OTP Local', icon: 'pi pi-key', key: 'otp-local' })
    list.push({ label: 'Soporte', icon: 'pi pi-shield', key: 'soporte' })
    list.push({ label: 'Bitacora', icon: 'pi pi-book', key: 'bitacora' })
  }
  return list
})

const components: Record<string, any> = {
  empresa: EmpresaComp,
  sistema: SistemaComp,
  'home-config': HomeConfigComp,
  openai: OpenAIComp,
  'modo-tienda': ModoTiendaComp,
  correo: CorreoComp,
  notificaciones: NotificacionesComp,
  backups: BackupsComp,
  impresoras: ImpresorasComp,
  soporte: SoporteComp,
  'ventas-config': VentasConfigComp,
  licencia: LicenciaComp,
  permisos: PermisosComp,
  tmcloud: TMCloudComp,
  actualizacion: ActualizacionComp,
  bitacora: BitacoraComp,
  'metodos-pago': MetodosPagoComp,
  alanube: AlanubeComp,
  'comprobantes-electronicos': ComprobantesElectronicosComp,
  'otp-local': OtpLocalComp,
}

function puedeAbrir(key: string): boolean {
  return Boolean(components[key]) && items.value.some(item => item.key === key)
}

const requestedSection = String(route.query.section || 'empresa')
const active = shallowRef(puedeAbrir(requestedSection) ? requestedSection : 'empresa')

watch(() => route.query.section, (section) => {
  const key = String(section || '')
  active.value = puedeAbrir(key) ? key : 'empresa'
})

watch(items, availableItems => {
  if (!availableItems.some(item => item.key === active.value)) active.value = 'empresa'
})

watch(isDominicanFiscal, enabled => {
  if (!enabled && ['alanube', 'comprobantes-electronicos'].includes(active.value)) active.value = 'sistema'
})

function onSelect(key: string) {
  if (puedeAbrir(key)) active.value = key
}
</script>

<template>
  <div>
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <KeepAlive>
      <component :is="components[active]" />
    </KeepAlive>
  </div>
</template>
