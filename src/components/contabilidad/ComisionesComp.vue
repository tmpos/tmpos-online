<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Comisiones de Vendedores</h1>
        <p class="text-sm text-surface-500">Gestiona las comisiones generadas por ventas</p>
      </div>
      <div class="flex gap-2">
        <Select v-model="filtroEstado" :options="['TODAS', 'PENDIENTE', 'PAGADA']" placeholder="Estado" class="w-32" size="small" />
        <button @click="cargar" class="px-3 py-2 rounded-lg text-xs font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100"><i class="pi pi-refresh mr-1"></i>Recargar</button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <template v-else>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 p-4 text-white shadow">
          <p class="text-blue-100 text-xs font-semibold">Total Comisiones</p>
          <p class="text-xl font-bold">{{ $formatMoney(resumen.total) }}</p>
        </div>
        <div class="rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 p-4 text-white shadow">
          <p class="text-amber-100 text-xs font-semibold">Pendientes</p>
          <p class="text-xl font-bold">{{ $formatMoney(resumen.pendiente) }}</p>
        </div>
        <div class="rounded-xl bg-gradient-to-br from-green-500 to-green-700 p-4 text-white shadow">
          <p class="text-green-100 text-xs font-semibold">Pagadas</p>
          <p class="text-xl font-bold">{{ $formatMoney(resumen.pagada) }}</p>
        </div>
      </div>

      <DataTable :value="comisionesFiltradas" stripedRows paginator :rows="15" dataKey="id" sortField="created_at" :sortOrder="-1">
        <Column field="no_factura" header="Factura" sortable style="width:7rem" />
        <Column field="vendedor" header="Vendedor" sortable />
        <Column field="total_venta" header="Venta" sortable style="width:7rem">
          <template #body="{ data }">{{ $formatMoney(data.total_venta) }}</template>
        </Column>
        <Column field="porcentaje" header="%" sortable style="width:4rem">
          <template #body="{ data }">{{ data.porcentaje }}%</template>
        </Column>
        <Column field="monto" header="Comision" sortable style="width:7rem">
          <template #body="{ data }"><span class="font-semibold text-green-600">{{ $formatMoney(data.monto) }}</span></template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width:7rem">
          <template #body="{ data }">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.estado === 'PAGADA' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'">{{ data.estado }}</span>
          </template>
        </Column>
        <Column field="created_at" header="Fecha" sortable style="width:7rem" />
        <Column header="Accion" style="width:6rem">
          <template #body="{ data }">
            <Button v-if="data.estado === 'PENDIENTE'" icon="pi pi-check" severity="success" text rounded size="small" @click="marcarPagada(data)" v-tooltip="'Marcar como pagada'" />
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-10 text-surface-400">No hay comisiones registradas.</div>
        </template>
      </DataTable>
    </template>
  </div>
</template>

<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const { filterByAlmacen } = useAlmacenFilter()

const loading = ref(true)
const comisiones = ref<any[]>([])
const filtroEstado = ref('TODAS')

const comisionesFiltradas = computed(() => {
  if (filtroEstado.value === 'TODAS') return comisiones.value
  return comisiones.value.filter(c => c.estado === filtroEstado.value)
})

const resumen = computed(() => {
  let total = 0, pendiente = 0, pagada = 0
  for (const c of comisiones.value) {
    total += Number(c.monto || 0)
    if (c.estado === 'PENDIENTE') pendiente += Number(c.monto || 0)
    else if (c.estado === 'PAGADA') pagada += Number(c.monto || 0)
  }
  return { total, pendiente, pagada }
})

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function cargar() {
  loading.value = true
  try {
    const res = await (window as any).electron.invoke('db:getAll', 'comisiones')
    if (res.success) comisiones.value = filterByAlmacen(res.data || [])
  } catch {} finally { loading.value = false }
}

async function marcarPagada(c: any) {
  try {
    const res = await (window as any).electron.invoke('db:update', 'comisiones', c.id, { estado: 'PAGADA', fecha_pago: new Date().toISOString().split('T')[0] })
    if (!res.success) throw new Error(res.error)
    toast.add({ severity: 'success', summary: 'Comision pagada', detail: `$ ${formatCurrency(c.monto)} a ${c.vendedor}`, life: 3000 })
    await cargar()
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
}

onMounted(cargar)
</script>
