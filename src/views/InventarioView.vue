<script setup lang="ts">
import { shallowRef, computed, watch, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useSystemModeStore } from '@/stores/systemMode'

const CategoriasComp = defineAsyncComponent(() => import('@/components/inventario/CategoriasComp.vue'))
const MarcasComp = defineAsyncComponent(() => import('@/components/inventario/MarcasComp.vue'))
const ColoresComp = defineAsyncComponent(() => import('@/components/inventario/ColoresComp.vue'))
const CapacidadesComp = defineAsyncComponent(() => import('@/components/inventario/CapacidadesComp.vue'))
const TelefonosComp = defineAsyncComponent(() => import('@/components/inventario/TelefonosComp.vue'))
const AccesoriosComp = defineAsyncComponent(() => import('@/components/inventario/AccesoriosComp.vue'))
const ElectrodomesticosComp = defineAsyncComponent(() => import('@/components/inventario/ElectrodomesticosComp.vue'))
const CambiazoComp = defineAsyncComponent(() => import('@/components/inventario/CambiazoComp.vue'))
const ImeiComp = defineAsyncComponent(() => import('@/components/inventario/ImeiComp.vue'))
const SerialComp = defineAsyncComponent(() => import('@/components/inventario/SerialComp.vue'))
const ReporteInventarioComp = defineAsyncComponent(() => import('@/components/inventario/ReporteInventarioComp.vue'))
const AjustesComp = defineAsyncComponent(() => import('@/components/inventario/AjustesComp.vue'))
const HistorialPreciosComp = defineAsyncComponent(() => import('@/components/inventario/HistorialPreciosComp.vue'))
const EtiquetasComp = defineAsyncComponent(() => import('@/components/inventario/EtiquetasComp.vue'))
const TransferenciasComp = defineAsyncComponent(() => import('@/components/transferencias/TransferenciasComp.vue'))
const OrdenesCompraComp = defineAsyncComponent(() => import('@/components/compras/OrdenesCompraComp.vue'))
const PerdidasComp = defineAsyncComponent(() => import('@/components/inventario/PerdidasComp.vue'))

const auth = useAuthStore()
const systemMode = useSystemModeStore()
const route = useRoute()

const allItems: SubMenuItem[] = [
  { label: 'Telefonos', icon: 'pi pi-mobile', key: 'telefonos' },
  { label: 'IMEI', icon: 'pi pi-barcode', key: 'imei' },
  { label: 'Accesorios', icon: 'pi pi-headphones', key: 'accesorios' },
  { label: 'Electrónicos', icon: 'pi pi-sitemap', key: 'electrodomesticos' },
  { label: 'Serial', icon: 'pi pi-qrcode', key: 'serial' },
  { label: 'Perdidas', icon: 'pi pi-times-circle', key: 'perdidas' },
  { label: 'Categorias', icon: 'pi pi-tags', key: 'categorias' },
  { label: 'Marcas', icon: 'pi pi-bookmark', key: 'marcas' },
  { label: 'Colores', icon: 'pi pi-palette', key: 'colores' },
  { label: 'Capacidades', icon: 'pi pi-database', key: 'capacidades' },
  { label: 'Etiquetas', icon: 'pi pi-qrcode', key: 'etiquetas' },
  { label: 'Cambiazo', icon: 'pi pi-sync', key: 'cambiazo' },
  { label: 'Transferencias', icon: 'pi pi-arrow-right-arrow-left', key: 'transferencias' },
  { label: 'Compras', icon: 'pi pi-truck', key: 'compras' },
  { label: 'Reporte de Inventario', icon: 'pi pi-file-export', key: 'reporte' },
  { label: 'Ajustes', icon: 'pi pi-pencil', key: 'ajustes' },
  { label: 'Historial Precios', icon: 'pi pi-history', key: 'historial-precios' },
]

const cellphoneOnlyKeys = new Set(['telefonos', 'imei', 'cambiazo'])
const items = computed(() => allItems
  .filter(item => !systemMode.isGeneralStore || !cellphoneOnlyKeys.has(item.key))
  .filter(item => auth.tienePermiso(item.key) || (['colores', 'capacidades'].includes(item.key) && auth.tienePermiso('marcas')))
  .map(item => item.key === 'accesorios' && systemMode.isGeneralStore
    ? { ...item, label: 'Productos', icon: 'pi pi-box' }
    : item))

const components: Record<string, any> = {
  categorias: CategoriasComp,
  marcas: MarcasComp,
  colores: ColoresComp,
  capacidades: CapacidadesComp,
  telefonos: TelefonosComp,
  accesorios: AccesoriosComp,
  electrodomesticos: ElectrodomesticosComp,
  imei: ImeiComp,
  serial: SerialComp,
  etiquetas: EtiquetasComp,
  cambiazo: CambiazoComp,
  transferencias: TransferenciasComp,
  compras: OrdenesCompraComp,
  ajustes: AjustesComp,
  'historial-precios': HistorialPreciosComp,
  reporte: ReporteInventarioComp,
  perdidas: PerdidasComp,
}

const active = shallowRef('')

function onSelect(key: string) {
  active.value = key
}

watch(() => route.query.tab, (tab) => {
  const key = String(tab || '')
  active.value = items.value.some(item => item.key === key) ? key : (items.value[0]?.key || '')
}, { immediate: true })

watch(items, (visibleItems) => {
  if (!visibleItems.some(item => item.key === active.value)) {
    active.value = visibleItems[0]?.key || ''
  }
})
</script>

<template>
  <div>
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <KeepAlive>
      <component :is="components[active]" />
    </KeepAlive>
  </div>
</template>
