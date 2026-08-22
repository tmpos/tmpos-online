<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, shallowRef, computed, nextTick } from 'vue'
import { useRoute } from 'vue-router'
import SubMenu from '@/components/SubMenu.vue'
import type { SubMenuItem } from '@/components/SubMenu.vue'
import { useAuthStore } from '@/stores/auth.store'
import OrdenesComp from '@/components/taller/OrdenesComp.vue'
import TecnicosComp from '@/components/taller/TecnicosComp.vue'
import PiezasComp from '@/components/taller/PiezasComp.vue'
import GarantiasComp from '@/components/ventas/GarantiasComp.vue'
import ReporteTallerComp from '@/components/taller/ReporteTallerComp.vue'
import Toast from 'primevue/toast'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const auth = useAuthStore()
const toast = useToast()
const { addAlmacenId, store: almacenStore } = useAlmacenFilter()
const route = useRoute()

const expressVisible = ref(false)
const expressForm = ref({ pieza_usada: '', observacion: '', total_reparacion: 0, costo_pieza: 0, metodo_pago: 'EFECTIVO' })
const metodosPagoExpress = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Tarjeta', value: 'TARJETA' },
]
const ordenesRef = ref<any>(null)
const gananciaExpress = computed(() => (expressForm.value.total_reparacion || 0) - (expressForm.value.costo_pieza || 0))

const allItems: SubMenuItem[] = [
  { label: 'Ordenes', icon: 'pi pi-list', key: 'ordenes' },
  { label: 'Orden Express', icon: 'pi pi-bolt', key: 'orden-express' },
  { label: 'Piezas', icon: 'pi pi-objects-column', key: 'piezas' },
  { label: 'Tecnicos', icon: 'pi pi-users', key: 'tecnicos' },
  { label: 'Garantias', icon: 'pi pi-shield', key: 'garantias' },
  { label: 'Reporte de Taller', icon: 'pi pi-file-export', key: 'reporte' },
]

const items = computed(() => allItems.filter(item => auth.tienePermiso(item.key)))

const components: Record<string, any> = {
  ordenes: OrdenesComp,
  piezas: PiezasComp,
  tecnicos: TecnicosComp,
  garantias: GarantiasComp,
  reporte: ReporteTallerComp,
}

const active = shallowRef('')

function onSelect(key: string) {
  if (key === 'orden-express') {
    expressForm.value = { pieza_usada: '', observacion: '', total_reparacion: 0, costo_pieza: 0, metodo_pago: 'EFECTIVO' }
    expressVisible.value = true
    return
  }
  active.value = key
}

const tabRuta = String(route.query.tab || '')
active.value = items.value.some(item => item.key === tabRuta && item.key !== 'orden-express')
  ? tabRuta
  : (items.value.find(i => i.key !== 'orden-express')?.key || items.value[0]?.key || '')

function formatearNumeroOrdenExpress(id: number) {
  return `EXP-${String(id).padStart(6, '0')}`
}

function setActiveComponentRef(el: any) {
  if (active.value === 'ordenes') ordenesRef.value = el
}

async function guardarExpress() {
  try {
    const turnoRes = await window.electron.invoke('caja:getTurnoActivo', almacenStore.activeUid || '') as any
    if (!turnoRes?.success || !turnoRes.data?.id) {
      toast.add({ severity: 'warn', summary: 'Caja cerrada', detail: 'Abre un turno de caja antes de cobrar una orden express', life: 3500 })
      return
    }
    const ahora = new Date()
    const monto = Number(expressForm.value.total_reparacion || 0)
    const pago = {
      nopago: 1,
      cantidad: monto,
      monto,
      fecha: ahora.toISOString().split('T')[0],
      hora: ahora.toTimeString().slice(0, 5),
      metodo: expressForm.value.metodo_pago,
      turno_id: Number(turnoRes.data.id),
      almacen_uid: almacenStore.activeUid || '',
      created_at: ahora.toISOString(),
      nota: 'COBRO DE ORDEN EXPRESS',
    }
    const data: any = {
      nombre: 'REPARACION EXPRESS',
      piezas: expressForm.value.pieza_usada.trim().toUpperCase(),
      fallas: expressForm.value.observacion.trim().toUpperCase(),
      total: expressForm.value.total_reparacion || 0,
      precio_pieza: expressForm.value.costo_pieza || 0,
      beneficio_empresa: gananciaExpress.value,
      metodo_pago: expressForm.value.metodo_pago,
      abono: monto,
      pendiente: 0,
      pagos: JSON.stringify([pago]),
      estado: 'COMPLETADO',
      fecha_entrada: new Date().toISOString().split('T')[0],
    }

    const res = await window.db.insert('ordenes_taller', addAlmacenId(data))
    if (res.success) {
      const ordenId = Number(res.data?.id || 0)
      const noOrden = ordenId ? formatearNumeroOrdenExpress(ordenId) : ''
      if (ordenId && noOrden) {
        await window.db.update('ordenes_taller', ordenId, { no_orden: noOrden })
      }
      toast.add({ severity: 'success', summary: 'Exito', detail: `Orden express creada${noOrden ? ` #${noOrden}` : ''}`, life: 3000 })
      expressVisible.value = false
      active.value = 'ordenes'
      await nextTick()
      await ordenesRef.value?.cargarOrdenes?.()
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al crear la orden', life: 3000 })
  }
}
</script>

<template>
  <div>
    <Toast />
    <SubMenu :items="items" :active="active" @select="onSelect" />
    <component
      v-if="active && components[active]"
      :is="components[active]"
      :key="active"
      :ref="setActiveComponentRef"
    />
    <div v-if="!(active && components[active])" class="text-center py-16 text-surface-400">
      <i class="pi pi-wrench text-3xl mb-2 block"></i>
      <p>No hay modulos disponibles para este usuario</p>
    </div>

    <!-- Modal Orden Express -->
    <Dialog
      v-model:visible="expressVisible"
      header="Orden Express"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Pieza Usada</label>
          <InputText v-model="expressForm.pieza_usada" placeholder="Pieza utilizada" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Total Reparacion</label>
            <InputNumber v-model="expressForm.total_reparacion" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="($event: any) => $event.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Costo Pieza</label>
            <InputNumber v-model="expressForm.costo_pieza" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="($event: any) => $event.target.select()" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Método de pago</label>
          <Select v-model="expressForm.metodo_pago" :options="metodosPagoExpress" optionLabel="label" optionValue="value" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Observación</label>
          <Textarea
            v-model="expressForm.observacion"
            placeholder="Detalle u observación de la reparación"
            rows="3"
            fluid
            class="uppercase"
            style="text-transform: uppercase;"
          />
        </div>
        <div class="flex items-center gap-2 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <i class="pi pi-dollar text-green-600 dark:text-green-400"></i>
          <span class="font-semibold text-sm text-green-700 dark:text-green-300">Ganancia:</span>
          <span class="font-bold text-green-700 dark:text-green-300">{{ `$${gananciaExpress.toFixed(2)}` }}</span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="expressVisible = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardarExpress" />
      </template>
    </Dialog>
  </div>
</template>
