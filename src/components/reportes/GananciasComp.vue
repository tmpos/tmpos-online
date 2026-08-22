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
const facturas = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const mes = ref(new Date().getMonth() + 1)
const year = ref(new Date().getFullYear())

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

function parseProductos(productos: any): any[] {
  if (!productos) return []
  if (Array.isArray(productos)) return productos
  try { return JSON.parse(productos) } catch { return [] }
}

const productosGanancia = computed(() => {
  const mapa = new Map<string, { nombre: string; cantidad: number; total: number; costo: number; ganancia: number; almacen_id: number; almacen_uid: string }>()
  for (const f of facturas.value) {
    const prods = parseProductos(f.productos)
    for (const p of prods) {
      const nombre = p.nombre || 'SIN NOMBRE'
      const key = `${f.almacen_uid || f.almacen_id || 0}::${nombre}`
      const entry = mapa.get(key) || {
        nombre,
        cantidad: 0,
        total: 0,
        costo: 0,
        ganancia: 0,
        almacen_id: Number(f.almacen_id || 0),
        almacen_uid: String(f.almacen_uid || ''),
      }
      entry.cantidad += Number(p.cantidad) || 0
      entry.total += Number(p.total) || (Number(p.precio) * Number(p.cantidad)) || 0
      entry.costo += (Number(p.costo) * Number(p.cantidad)) || 0
      entry.ganancia = entry.total - entry.costo
      mapa.set(key, entry)
    }
  }
  const q = busqueda.value.toLowerCase().trim()
  return Array.from(mapa.values())
    .filter(item => !q || item.nombre.toLowerCase().includes(q))
    .sort((a, b) => b.ganancia - a.ganancia)
})

const totales = computed(() => {
  let total = 0, ganancia = 0
  for (const f of facturas.value) {
    total += Number(f.total) || 0
    ganancia += Number(f.ganancia) || 0
  }
  return { total, ganancia, count: facturas.value.length }
})

const margen = computed(() => totales.value.total > 0 ? (totales.value.ganancia / totales.value.total) * 100 : 0)

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
        (f.tipo_factura === 'FACTURA_VENTA' || f.tipo_factura === 'FACTURA_CONSUMO')
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
  let csv = `${mostrarAlmacen ? 'Almacen,' : ''}Producto,Cantidad,Total,Costo,Ganancia\n`
  for (const p of productosGanancia.value) {
    csv += `${mostrarAlmacen ? `"${nombreAlmacen(p)}",` : ''}"${p.nombre}",${p.cantidad},"${p.total}","${p.costo}","${p.ganancia}"\n`
  }
  const blob = new Blob([csv], { type: 'text/csv' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  const almacenArchivo = almacenReporteNombre.value.replace(/[^a-z0-9]+/gi, '_')
  a.download = `ganancias_${almacenArchivo}_${year.value}_${String(mes.value).padStart(2, '0')}.csv`
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
      <IconField class="w-64">
        <InputIcon class="pi pi-search" />
        <InputText v-model="busqueda" placeholder="Buscar producto..." fluid />
      </IconField>
      <Button label="Exportar CSV" icon="pi pi-download" severity="info" @click="exportarCSV" />
    </div>

    <div class="mb-4 text-sm text-surface-500">
      Reporte de: <span class="font-semibold text-surface-700 dark:text-surface-200">{{ almacenReporteNombre }}</span>
    </div>

    <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
      <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 p-3 text-white">
        <p class="text-blue-100 text-xs">Ventas Totales</p>
        <p class="text-lg font-bold">{{ $formatMoney(totales.total) }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 p-3 text-white">
        <p class="text-emerald-100 text-xs">Ganancia</p>
        <p class="text-lg font-bold">{{ $formatMoney(totales.ganancia) }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-teal-500 to-teal-700 p-3 text-white">
        <p class="text-teal-100 text-xs">Margen</p>
        <p class="text-lg font-bold">{{ margen.toFixed(1) }}%</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-violet-500 to-violet-700 p-3 text-white">
        <p class="text-violet-100 text-xs">Facturas</p>
        <p class="text-lg font-bold">{{ totales.count }}</p>
      </div>
    </div>

    <DataTable
      :value="productosGanancia"
      :loading="loading"
      stripedRows
      paginator
      :rows="25"
      :rowsPerPageOptions="[25, 50, 100]"
      responsiveLayout="scroll"
      sortField="ganancia"
      :sortOrder="-1"
      class="!text-xs"
      scrollable
    >
      <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
        <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
      </Column>
      <Column field="nombre" header="Producto" sortable />
      <Column field="cantidad" header="Vendidos" sortable style="width: 6rem" />
      <Column field="total" header="Total" sortable style="width: 8rem">
        <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
      </Column>
      <Column field="costo" header="Costo" sortable style="width: 8rem">
        <template #body="{ data }">{{ $formatMoney(data.costo) }}</template>
      </Column>
      <Column field="ganancia" header="Ganancia" sortable style="width: 8rem">
        <template #body="{ data }"><span class="text-emerald-600 font-semibold">{{ $formatMoney(data.ganancia) }}</span></template>
      </Column>
      <template #empty>
        <div class="text-center py-8 text-surface-400">No hay ventas en este periodo.</div>
      </template>
    </DataTable>
  </div>
</template>
