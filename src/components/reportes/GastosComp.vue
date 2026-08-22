<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'

const toast = useToast()
const almacenStore = useAlmacenStore()
const TODOS_ALMACENES = '__TODOS__'
const almacenFiltro = ref(TODOS_ALMACENES)
const gastos = ref<any[]>([])
const gastosFijos = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const mes = ref(new Date().getMonth() + 1)
const year = ref(new Date().getFullYear())
const vista = ref<'gastos' | 'fijos'>('gastos')

const meses = Array.from({ length: 12 }, (_, i) => ({ label: new Date(2024, i, 1).toLocaleString('es', { month: 'long' }), value: i + 1 }))
const years = Array.from({ length: 5 }, (_, i) => ({ label: String(new Date().getFullYear() - i), value: new Date().getFullYear() - i }))

function almacenKey(almacen: any): string {
  return almacen?.uid ? `uid:${almacen.uid}` : `id:${Number(almacen?.id || 0)}`
}

const almacenesOptions = computed(() => [
  { label: 'Todos los almacenes', value: TODOS_ALMACENES },
  ...almacenStore.almacenes.map((almacen: any) => ({
    label: almacen.nombre || `Almacén ${almacen.id}`,
    value: almacenKey(almacen),
  })),
])

const almacenSeleccionado = computed(() =>
  almacenStore.almacenes.find((almacen: any) => almacenKey(almacen) === almacenFiltro.value) || null
)

const almacenReporteNombre = computed(() => almacenSeleccionado.value?.nombre || 'Todos los almacenes')

function coincideAlmacen(registro: any): boolean {
  if (almacenFiltro.value === TODOS_ALMACENES) return true
  const almacen = almacenSeleccionado.value
  if (!almacen) return false
  if (almacen.uid && registro.almacen_uid) return String(registro.almacen_uid) === String(almacen.uid)
  return Number(registro.almacen_id || 0) === Number(almacen.id || 0)
}

function nombreAlmacen(registro: any): string {
  const almacen = almacenStore.almacenes.find((item: any) =>
    (registro.almacen_uid && item.uid && String(item.uid) === String(registro.almacen_uid)) ||
    Number(item.id || 0) === Number(registro.almacen_id || 0)
  )
  return almacen?.nombre || 'Sin almacén'
}

const gastosFiltrados = computed(() => {
  const q = busqueda.value.toLowerCase().trim()
  const data = vista.value === 'gastos' ? gastos.value : gastosFijos.value
  if (!q) return data
  return data.filter((g: any) =>
    (g.comentario || g.descripcion || g.nombre || '').toLowerCase().includes(q)
  )
})

const totales = computed(() => {
  let total = 0
  for (const g of gastosFiltrados.value) {
    total += Number(vista.value === 'gastos' ? g.cantidad : g.monto) || 0
  }
  return { total, count: gastosFiltrados.value.length }
})

async function cargar() {
  loading.value = true
  try {
    const m = String(mes.value).padStart(2, '0')
    const y = String(year.value)
    const inicio = `${y}-${m}-01`
    const fin = `${y}-${m}-31`

    const [resGastos, resFijos] = await Promise.all([
      (window as any).db.getAll('gastos'),
      (window as any).db.getAll('gastos_fijos'),
    ])

    if (resGastos.success) {
      gastos.value = (resGastos.data || []).filter((g: any) =>
        g.fecha >= inicio && g.fecha <= fin &&
        coincideAlmacen(g)
      )
    }
    if (resFijos.success) {
      gastosFijos.value = (resFijos.data || []).filter(coincideAlmacen)
    }
  } catch (e) {
    console.error(e)
  } finally {
    loading.value = false
  }
}

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function exportarCSV() {
  const mostrarAlmacen = almacenFiltro.value === TODOS_ALMACENES
  let csv = `${mostrarAlmacen ? 'Almacen,' : ''}Fecha,Concepto,Metodo,Banco,Monto\n`
  for (const g of gastosFiltrados.value) {
    const concepto = vista.value === 'gastos' ? (g.comentario || '') : (g.nombre || '')
    const monto = vista.value === 'gastos' ? g.cantidad : g.monto
    csv += `${mostrarAlmacen ? `"${nombreAlmacen(g)}",` : ''}"${g.fecha || ''}","${concepto}","${g.metodo_pago || 'EFECTIVO'}","${g.banco_nombre || ''}","${Number(monto) || 0}"\n`
  }
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const almacenArchivo = almacenReporteNombre.value.replace(/[^a-z0-9]+/gi, '_')
  a.download = `gastos_${almacenArchivo}_${year.value}_${String(mes.value).padStart(2, '0')}.csv`
  a.click()
  URL.revokeObjectURL(url)
  toast.add({ severity: 'success', summary: 'Exportado', detail: 'Archivo CSV descargado', life: 3000 })
}

onMounted(async () => {
  await almacenStore.load()
  const almacenActivo = almacenStore.almacenes.find((almacen: any) =>
    (almacenStore.activeUid && String(almacen.uid || '') === String(almacenStore.activeUid)) ||
    Number(almacen.id || 0) === Number(almacenStore.activeId || 0)
  )
  almacenFiltro.value = almacenActivo ? almacenKey(almacenActivo) : TODOS_ALMACENES
  await cargar()
})
</script>

<template>
  <div>
    <Toast />
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <Select v-model="mes" :options="meses" optionLabel="label" optionValue="value" class="w-40" @change="cargar" />
      <Select v-model="year" :options="years" optionLabel="label" optionValue="value" class="w-28" @change="cargar" />
      <Select
        v-model="almacenFiltro"
        :options="almacenesOptions"
        optionLabel="label"
        optionValue="value"
        placeholder="Seleccionar almacén"
        class="w-56"
        @change="cargar"
      />
      <div class="flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
        <button
          class="px-3 py-2 text-xs font-semibold transition-colors cursor-pointer"
          :class="vista === 'gastos' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800'"
          @click="vista = 'gastos'"
        >Gastos</button>
        <button
          class="px-3 py-2 text-xs font-semibold transition-colors cursor-pointer border-l border-surface-200 dark:border-surface-700"
          :class="vista === 'fijos' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800'"
          @click="vista = 'fijos'"
        >Fijos</button>
      </div>
      <IconField class="w-64">
        <InputIcon class="pi pi-search" />
        <InputText v-model="busqueda" placeholder="Buscar..." fluid />
      </IconField>
      <Button label="Exportar CSV" icon="pi pi-download" severity="info" @click="exportarCSV" />
    </div>

    <div class="mb-4 text-sm text-surface-500">
      Reporte de: <span class="font-semibold text-surface-700 dark:text-surface-200">{{ almacenReporteNombre }}</span>
    </div>

    <div class="grid grid-cols-2 gap-3 mb-4">
      <div class="rounded-xl bg-gradient-to-br from-red-500 to-red-700 p-3 text-white">
        <p class="text-red-100 text-xs">Total {{ vista === 'gastos' ? 'Gastos' : 'Gastos Fijos' }}</p>
        <p class="text-lg font-bold">{{ $formatMoney(totales.total) }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 p-3 text-white">
        <p class="text-slate-100 text-xs">Registros</p>
        <p class="text-lg font-bold">{{ totales.count }}</p>
      </div>
    </div>

    <DataTable
      :value="gastosFiltrados"
      :loading="loading"
      stripedRows
      paginator
      :rows="25"
      :rowsPerPageOptions="[25, 50, 100]"
      responsiveLayout="scroll"
      :sortField="vista === 'gastos' ? 'fecha' : 'nombre'"
      :sortOrder="-1"
      class="!text-xs"
      scrollable
    >
      <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
        <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
      </Column>
      <Column field="fecha" header="Fecha" sortable style="width: 7rem" />
      <Column field="comentario" header="Concepto" sortable v-if="vista === 'gastos'" />
      <Column field="nombre" header="Concepto" sortable v-if="vista === 'fijos'" />
      <Column field="categoria" header="Categoria" sortable v-if="vista === 'fijos'" style="width: 8rem" />
      <Column field="periodicidad" header="Periodicidad" sortable v-if="vista === 'fijos'" style="width: 8rem" />
      <Column field="metodo_pago" header="Metodo" sortable v-if="vista === 'gastos'" style="width: 8rem" />
      <Column field="banco_nombre" header="Banco" sortable v-if="vista === 'gastos'" style="width: 10rem" />
      <Column :field="vista === 'gastos' ? 'cantidad' : 'monto'" header="Monto" sortable style="width: 8rem">
        <template #body="{ data }">{{ $formatMoney(vista === 'gastos' ? data.cantidad : data.monto) }}</template>
      </Column>
      <template #empty>
        <div class="text-center py-8 text-surface-400">No hay gastos registrados en este periodo.</div>
      </template>
    </DataTable>
  </div>
</template>
