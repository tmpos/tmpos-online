<script setup lang="ts">
import { shallowRef, computed, onMounted, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import { useSystemModeStore } from '@/stores/systemMode'

const FacturasComp = defineAsyncComponent(() => import('@/components/ventas/FacturasComp.vue'))
const CotizacionesComp = defineAsyncComponent(() => import('@/components/ventas/CotizacionesComp.vue'))
const ApartadosComp = defineAsyncComponent(() => import('@/components/ventas/ApartadosComp.vue'))
const RecibidosComp = defineAsyncComponent(() => import('@/components/ventas/RecibidosComp.vue'))
const NotasCreditoComp = defineAsyncComponent(() => import('@/components/ventas/NotasCreditoComp.vue'))
const NotasAdminComp = defineAsyncComponent(() => import('@/components/ventas/NotasAdminComp.vue'))
const ReclamacionesComp = defineAsyncComponent(() => import('@/components/ReclamacionesComp.vue'))

const auth = useAuthStore()
const route = useRoute()
const systemMode = useSystemModeStore()

const allItems: SubMenuItem[] = [
  { label: 'Facturas', icon: 'pi pi-file', key: 'facturas' },
  { label: 'Cotizaciones', icon: 'pi pi-file-edit', key: 'cotizaciones' },
  { label: 'Apartados', icon: 'pi pi-bookmark', key: 'apartados' },
  { label: 'Recibidos', icon: 'pi pi-download', key: 'recibidos' },
  { label: 'Notas de Credito', icon: 'pi pi-file-minus', key: 'notas-credito' },
  { label: 'Notas', icon: 'pi pi-pencil', key: 'notas' },
  { label: 'Reclamaciones', icon: 'pi pi-exclamation-triangle', key: 'reclamaciones' },
]

const items = computed(() => allItems
  .filter(item => !systemMode.isGeneralStore || item.key !== 'recibidos')
  .filter(item => auth.tienePermiso(item.key)))

const components: Record<string, any> = {
  facturas: FacturasComp,
  cotizaciones: CotizacionesComp,
  apartados: ApartadosComp,
  recibidos: RecibidosComp,
  'notas-credito': NotasCreditoComp,
  notas: NotasAdminComp,
  reclamaciones: ReclamacionesComp,
}

const active = shallowRef('')

onMounted(() => {
  const tab = route.query.tab as string
  if (tab && items.value.some(i => i.key === tab)) {
    active.value = tab
  } else {
    active.value = items.value.length > 0 ? items.value[0].key : ''
  }
})

function onSelect(key: string) {
  active.value = key
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
