<script setup lang="ts">
import { shallowRef, computed, watch } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import CategoriasComp from '@/components/inventario/CategoriasComp.vue'
import MarcasComp from '@/components/inventario/MarcasComp.vue'
import TelefonosComp from '@/components/inventario/TelefonosComp.vue'
import AccesoriosComp from '@/components/inventario/AccesoriosComp.vue'
import ElectrodomesticosComp from '@/components/inventario/ElectrodomesticosComp.vue'
import CambiazoComp from '@/components/inventario/CambiazoComp.vue'
import ImeiComp from '@/components/inventario/ImeiComp.vue'
import SerialComp from '@/components/inventario/SerialComp.vue'
import ReporteInventarioComp from '@/components/inventario/ReporteInventarioComp.vue'
import AjustesComp from '@/components/inventario/AjustesComp.vue'
import HistorialPreciosComp from '@/components/inventario/HistorialPreciosComp.vue'
import EtiquetasComp from '@/components/inventario/EtiquetasComp.vue'
import TransferenciasComp from '@/components/transferencias/TransferenciasComp.vue'
import OrdenesCompraComp from '@/components/compras/OrdenesCompraComp.vue'
import PerdidasComp from '@/components/inventario/PerdidasComp.vue'
import { useSystemModeStore } from '@/stores/systemMode'

const auth = useAuthStore()
const systemMode = useSystemModeStore()
const route = useRoute()

const allItems: SubMenuItem[] = [
  { label: 'Telefonos', icon: 'pi pi-mobile', key: 'telefonos' },
  { label: 'IMEI', icon: 'pi pi-barcode', key: 'imei' },
  { label: 'Accesorios', icon: 'pi pi-headphones', key: 'accesorios' },
  { label: 'Electrodomesticos', icon: 'pi pi-sitemap', key: 'electrodomesticos' },
  { label: 'Serial', icon: 'pi pi-qrcode', key: 'serial' },
  { label: 'Perdidas', icon: 'pi pi-times-circle', key: 'perdidas' },
  { label: 'Categorias', icon: 'pi pi-tags', key: 'categorias' },
  { label: 'Marcas', icon: 'pi pi-bookmark', key: 'marcas' },
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
  .filter(item => auth.tienePermiso(item.key))
  .map(item => item.key === 'accesorios' && systemMode.isGeneralStore
    ? { ...item, label: 'Productos', icon: 'pi pi-box' }
    : item))

const components: Record<string, any> = {
  categorias: CategoriasComp,
  marcas: MarcasComp,
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
