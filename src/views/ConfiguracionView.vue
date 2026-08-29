<script setup lang="ts">
import { shallowRef, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import EmpresaComp from '@/components/configuracion/EmpresaComp.vue'
import SistemaComp from '@/components/configuracion/SistemaComp.vue'
import CorreoComp from '@/components/configuracion/CorreoComp.vue'
import NotificacionesComp from '@/components/configuracion/NotificacionesComp.vue'
import BackupsComp from '@/components/configuracion/BackupsComp.vue'
import ImpresorasComp from '@/components/configuracion/ImpresorasComp.vue'
import SoporteComp from '@/components/configuracion/SoporteComp.vue'
import BitacoraComp from '@/components/configuracion/BitacoraComp.vue'
import VentasConfigComp from '@/components/configuracion/VentasConfigComp.vue'
import LicenciaComp from '@/components/configuracion/LicenciaComp.vue'
import PermisosComp from '@/components/configuracion/PermisosComp.vue'
import TMCloudComp from '@/components/configuracion/TMCloudComp.vue'
import ActualizacionComp from '@/components/configuracion/ActualizacionComp.vue'
import MetodosPagoComp from '@/components/configuracion/MetodosPagoComp.vue'
import AlanubeComp from '@/components/configuracion/AlanubeComp.vue'
import ComprobantesElectronicosComp from '@/components/configuracion/ComprobantesElectronicosComp.vue'
import OtpLocalComp from '@/components/configuracion/OtpLocalComp.vue'
import ModoTiendaComp from '@/components/configuracion/ModoTiendaComp.vue'
import OpenAIComp from '@/components/configuracion/OpenAIComp.vue'
import HomeConfigComp from '@/components/configuracion/HomeConfigComp.vue'
import { useLocaleProfile } from '@/composables/useLocaleProfile'

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
  <div class="configuration-page">
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <div class="configuration-content">
      <KeepAlive>
        <component :is="components[active]" />
      </KeepAlive>
    </div>
  </div>
</template>

<style scoped>
.configuration-page {
  width: 100%;
  min-width: 0;
  padding-bottom: 1rem;
}

.configuration-content {
  width: 100%;
  min-width: 0;
  max-width: 100%;
  overflow-x: auto;
  overflow-y: visible;
  padding: 1px;
  scrollbar-gutter: stable;
}

@media (max-width: 640px) {
  .configuration-content {
    padding-bottom: 0.75rem;
  }
}
</style>
