<script setup lang="ts">
import { getFiscalLabels, getSystemLocale } from '@/i18n/localeProfiles'
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
const fiscal = getFiscalLabels()
const almacenStore = useAlmacenStore()
const TODOS_ALMACENES = '__TODOS__'
const almacenFiltro = ref(TODOS_ALMACENES)
const facturas = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const mes = ref(new Date().getMonth() + 1)
const year = ref(new Date().getFullYear())
const tipoFiltro = ref('TODAS')

const meses = Array.from({ length: 12 }, (_, i) => ({ label: new Date(2024, i, 1).toLocaleString('es', { month: 'long' }), value: i + 1 }))
const years = Array.from({ length: 5 }, (_, i) => ({ label: String(new Date().getFullYear() - i), value: new Date().getFullYear() - i }))
const tipos = [
  { label: 'Todas', value: 'TODAS' },
  { label: 'Factura Venta', value: 'FACTURA_VENTA' },
  { label: 'Consumo', value: 'FACTURA_CONSUMO' },
  { label: 'Nota Credito', value: 'NOTA_CREDITO' },
]

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

const facturasFiltradas = computed(() => {
  const q = busqueda.value.toLowerCase().trim()
  let data = facturas.value
  if (!q) return data
  return data.filter((f: any) =>
    (f.nombre_cliente || '').toLowerCase().includes(q) ||
    (f.no_factura || '').toLowerCase().includes(q) ||
    (f.ncf || '').toLowerCase().includes(q)
  )
})

const totales = computed(() => {
  let total = 0, ganancia = 0, itbis = 0
  for (const f of facturasFiltradas.value) {
    total += Number(f.total) || 0
    ganancia += Number(f.ganancia) || 0
    itbis += Number(f.impuesto) || 0
  }
  return { total, ganancia, itbis, count: facturasFiltradas.value.length }
})

function parseProductos(productos: any): any[] {
  if (!productos) return []
  if (Array.isArray(productos)) return productos
  try { return JSON.parse(productos) } catch { return [] }
}

const itemsVendidos = computed(() => {
  let count = 0
  for (const f of facturasFiltradas.value) {
    count += parseProductos(f.productos).length
  }
  return count
})

async function cargar() {
  loading.value = true
  try {
    const m = String(mes.value).padStart(2, '0')
    const y = String(year.value)
    const inicio = `${y}-${m}-01`
    const fin = `${y}-${m}-31`
    const res = await (window as any).db.getAll('facturas')
    if (res.success) {
      facturas.value = (res.data || []).filter((f: any) =>
        f.fecha_emision >= inicio && f.fecha_emision <= fin &&
        coincideAlmacen(f) &&
        (tipoFiltro.value === 'TODAS'
          ? f.tipo_factura !== 'FACTURA_COMPRA' && f.tipo_factura !== 'COTIZACION'
          : f.tipo_factura === tipoFiltro.value)
      )
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
  let csv = `${mostrarAlmacen ? 'Almacen,' : ''}Factura,Fecha,Cliente,${fiscal.fiscalDocumentLabel},Metodo,Subtotal,Descuento,${fiscal.shortName},Total,Ganancia\n`
  for (const f of facturasFiltradas.value) {
    csv += `${mostrarAlmacen ? `"${nombreAlmacen(f)}",` : ''}"${f.no_factura || ''}","${f.fecha_emision || ''}","${f.nombre_cliente || ''}","${f.ncf || ''}","${f.metodo_pago || ''}","${Number(f.subtotal) || 0}","${Number(f.descuento) || 0}","${Number(f.impuesto) || 0}","${Number(f.total) || 0}","${Number(f.ganancia) || 0}"\n`
  }
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const almacenArchivo = almacenReporteNombre.value.replace(/[^a-z0-9]+/gi, '_')
  a.download = `ventas_${almacenArchivo}_${year.value}_${String(mes.value).padStart(2, '0')}.csv`
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
      <Select v-model="tipoFiltro" :options="tipos" optionLabel="label" optionValue="value" class="w-40" @change="cargar" />
      <IconField class="w-64">
        <InputIcon class="pi pi-search" />
        <InputText v-model="busqueda" placeholder="Buscar..." fluid />
      </IconField>
      <Button label="Exportar CSV" icon="pi pi-download" severity="info" @click="exportarCSV" />
    </div>

    <div class="mb-4 text-sm text-surface-500">
      Reporte de: <span class="font-semibold text-surface-700 dark:text-surface-200">{{ almacenReporteNombre }}</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-5 gap-3 mb-4">
      <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 p-3 text-white">
        <p class="text-blue-100 text-xs">Total Ventas</p>
        <p class="text-lg font-bold">{{ $formatMoney(totales.total) }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 text-white">
        <p class="text-emerald-100 text-xs">Ganancia</p>
        <p class="text-lg font-bold">{{ $formatMoney(totales.ganancia) }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 p-3 text-white">
        <p class="text-amber-100 text-xs">ITBIS</p>
        <p class="text-lg font-bold">{{ $formatMoney(totales.itbis) }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 p-3 text-white">
        <p class="text-violet-100 text-xs">Facturas</p>
        <p class="text-lg font-bold">{{ totales.count }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-pink-500 to-pink-700 p-3 text-white">
        <p class="text-pink-100 text-xs">Items</p>
        <p class="text-lg font-bold">{{ itemsVendidos }}</p>
      </div>
    </div>

    <DataTable
      :value="facturasFiltradas"
      :loading="loading"
      stripedRows
      paginator
      :rows="25"
      :rowsPerPageOptions="[25, 50, 100]"
      responsiveLayout="scroll"
      sortField="fecha_emision"
      :sortOrder="-1"
      class="!text-xs"
      scrollable
    >
      <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
        <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
      </Column>
      <Column field="no_factura" header="Factura" sortable style="width: 9rem" />
      <Column field="fecha_emision" header="Fecha" sortable style="width: 7rem" />
      <Column field="nombre_cliente" header="Cliente" sortable />
      <Column field="ncf" header="NCF" sortable style="width: 9rem" />
      <Column field="metodo_pago" header="Metodo" sortable style="width: 8rem" />
      <Column field="subtotal" header="Subtotal" sortable style="width: 7rem">
        <template #body="{ data }">{{ $formatMoney(data.subtotal) }}</template>
      </Column>
      <Column field="descuento" header="Desc." sortable style="width: 6rem">
        <template #body="{ data }"><span class="text-red-500">{{ $formatMoney(data.descuento) }}</span></template>
      </Column>
      <Column field="impuesto" header="ITBIS" sortable style="width: 6rem">
        <template #body="{ data }">{{ $formatMoney(data.impuesto) }}</template>
      </Column>
      <Column field="total" header="Total" sortable style="width: 7rem">
        <template #body="{ data }"><span class="font-semibold">{{ $formatMoney(data.total) }}</span></template>
      </Column>
      <Column field="ganancia" header="Ganancia" sortable style="width: 7rem">
        <template #body="{ data }"><span class="text-emerald-600 font-semibold">{{ $formatMoney(data.ganancia) }}</span></template>
      </Column>
      <template #empty>
        <div class="text-center py-8 text-surface-400">No hay facturas en este periodo.</div>
      </template>
    </DataTable>
  </div>
</template>
