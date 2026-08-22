<script setup lang="ts">
import { shallowRef, computed } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import Reporte606Comp from '@/components/reportes/Reporte606Comp.vue'
import Reporte607Comp from '@/components/reportes/Reporte607Comp.vue'
import GastosComp from '@/components/reportes/GastosComp.vue'
import VentasReporteComp from '@/components/reportes/VentasReporteComp.vue'
import GananciasComp from '@/components/reportes/GananciasComp.vue'
import ReporteGeneralComp from '@/components/reportes/ReporteGeneralComp.vue'
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const auth = useAuthStore()
const route = useRoute()
const { isDominicanFiscal } = useLocaleProfile()

const allItems: SubMenuItem[] = [
  { label: 'General', icon: 'pi pi-chart-pie', key: 'general' },
  { label: '606', icon: 'pi pi-file', key: '606' },
  { label: '607', icon: 'pi pi-file', key: '607' },
  { label: 'Gastos', icon: 'pi pi-money-bill', key: 'gastos' },
  { label: 'Ventas', icon: 'pi pi-shopping-cart', key: 'ventas' },
  { label: 'Ganancias', icon: 'pi pi-chart-line', key: 'ganancias' },
]

const items = computed(() => allItems.filter(item =>
  auth.tienePermiso(item.key) && (isDominicanFiscal.value || !['606', '607'].includes(item.key))
))

const components: Record<string, any> = {
  general: ReporteGeneralComp,
  '606': Reporte606Comp,
  '607': Reporte607Comp,
  gastos: GastosComp,
  ventas: VentasReporteComp,
  ganancias: GananciasComp,
}

const active = shallowRef('')

function onSelect(key: string) {
  active.value = key
}

const tabRuta = String(route.query.tab || '')
active.value = items.value.some(item => item.key === tabRuta)
  ? tabRuta
  : (items.value[0]?.key || '')
</script>

<template>
  <div>
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <KeepAlive>
      <component :is="components[active]" />
    </KeepAlive>
  </div>
</template>
