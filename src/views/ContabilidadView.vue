<script setup lang="ts">
import { shallowRef, computed, defineAsyncComponent } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'

const ComprarComp = defineAsyncComponent(() => import('@/components/contabilidad/ComprarComp.vue'))
const CuadreComp = defineAsyncComponent(() => import('@/components/contabilidad/CuadreComp.vue'))
const CajaComp = defineAsyncComponent(() => import('@/components/contabilidad/CajaComp.vue'))
const CuentasPorCobrarComp = defineAsyncComponent(() => import('@/components/contabilidad/CuentasPorCobrarComp.vue'))
const CuentasPorPagarComp = defineAsyncComponent(() => import('@/components/contabilidad/CuentasPorPagarComp.vue'))
const BancosComp = defineAsyncComponent(() => import('@/components/contabilidad/BancosComp.vue'))
const GastosComp = defineAsyncComponent(() => import('@/components/contabilidad/GastosComp.vue'))
const GastosFijosComp = defineAsyncComponent(() => import('@/components/contabilidad/GastosFijosComp.vue'))
const UtilidadesComp = defineAsyncComponent(() => import('@/components/contabilidad/UtilidadesComp.vue'))
const CatalogoCuentasComp = defineAsyncComponent(() => import('@/components/contabilidad/CatalogoCuentasComp.vue'))
const BalanceGeneralComp = defineAsyncComponent(() => import('@/components/contabilidad/BalanceGeneralComp.vue'))
const ComprobantesComp = defineAsyncComponent(() => import('@/components/contabilidad/ComprobantesComp.vue'))
const ComisionesComp = defineAsyncComponent(() => import('@/components/contabilidad/ComisionesComp.vue'))
const NotasCreditoElectronicasComp = defineAsyncComponent(() => import('@/components/contabilidad/NotasCreditoElectronicasComp.vue'))

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
  { label: 'Notas Crédito e-CF', icon: 'pi pi-receipt', key: 'notas-credito-ecf' },
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
  'notas-credito-ecf': NotasCreditoElectronicasComp,
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
