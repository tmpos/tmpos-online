<script setup lang="ts">
import { shallowRef, computed } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import ComprarComp from '@/components/contabilidad/ComprarComp.vue'
import CuadreComp from '@/components/contabilidad/CuadreComp.vue'
import CajaComp from '@/components/contabilidad/CajaComp.vue'
import CuentasPorCobrarComp from '@/components/contabilidad/CuentasPorCobrarComp.vue'
import CuentasPorPagarComp from '@/components/contabilidad/CuentasPorPagarComp.vue'
import BancosComp from '@/components/contabilidad/BancosComp.vue'
import GastosComp from '@/components/contabilidad/GastosComp.vue'
import GastosFijosComp from '@/components/contabilidad/GastosFijosComp.vue'
import UtilidadesComp from '@/components/contabilidad/UtilidadesComp.vue'
import CatalogoCuentasComp from '@/components/contabilidad/CatalogoCuentasComp.vue'
import BalanceGeneralComp from '@/components/contabilidad/BalanceGeneralComp.vue'
import ComprobantesComp from '@/components/contabilidad/ComprobantesComp.vue'
import ComisionesComp from '@/components/contabilidad/ComisionesComp.vue'

const auth = useAuthStore()
const route = useRoute()

const allItems: SubMenuItem[] = [
  { label: 'Caja', icon: 'pi pi-calculator', key: 'caja' },
  { label: 'Comprar', icon: 'pi pi-shopping-bag', key: 'comprar' },
  { label: 'Cuadre', icon: 'pi pi-check-square', key: 'cuadre' },
  { label: 'Cuentas por Cobrar', icon: 'pi pi-arrow-down-left', key: 'cxc' },
  { label: 'Cuentas por Pagar', icon: 'pi pi-arrow-up-right', key: 'cxp' },
  { label: 'Bancos', icon: 'pi pi-building-columns', key: 'bancos' },
  { label: 'Gastos', icon: 'pi pi-money-bill', key: 'gastos' },
  { label: 'Gastos Fijos', icon: 'pi pi-calendar', key: 'gastos-fijos' },
  { label: 'Utilidades', icon: 'pi pi-chart-line', key: 'utilidades' },
  { label: 'Catalogo de Cuentas', icon: 'pi pi-book', key: 'catalogo' },
  { label: 'Balance General', icon: 'pi pi-chart-bar', key: 'balance' },
  { label: 'Comprobantes', icon: 'pi pi-file-check', key: 'comprobantes' },
  { label: 'Comisiones', icon: 'pi pi-percentage', key: 'comisiones' },
]

const items = computed(() => allItems.filter(item => auth.tienePermiso(item.key)))

const components: Record<string, any> = {
  caja: CajaComp,
  comprar: ComprarComp,
  cuadre: CuadreComp,
  cxc: CuentasPorCobrarComp,
  cxp: CuentasPorPagarComp,
  bancos: BancosComp,
  gastos: GastosComp,
  'gastos-fijos': GastosFijosComp,
  utilidades: UtilidadesComp,
  catalogo: CatalogoCuentasComp,
  balance: BalanceGeneralComp,
  comprobantes: ComprobantesComp,
  comisiones: ComisionesComp,
}

const active = shallowRef('')

function onSelect(key: string) {
  active.value = key
}

function primerPermiso(): string {
  return items.value.length > 0 ? items.value[0].key : ''
}

const tabRuta = String(route.query.tab || '')
active.value = items.value.some(item => item.key === tabRuta) ? tabRuta : primerPermiso()
</script>

<template>
  <div>
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <KeepAlive>
      <component :is="components[active]" />
    </KeepAlive>
  </div>
</template>
