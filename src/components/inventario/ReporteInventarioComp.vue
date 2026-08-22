<script setup lang="ts">
import { getSystemCurrencyCode, getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useSystemModeStore } from '@/stores/systemMode'
import { useAlmacenStore } from '@/stores/almacen.store'

const toast = useToast()
const systemMode = useSystemModeStore()
const almacenStore = useAlmacenStore()
const loading = ref(false)
const generandoPdf = ref(false)
const dialogPdf = ref(false)
const pdfUrl = ref('')
const pdfNombre = ref('')
const vista = ref('todos')
const TODOS_ALMACENES = '__TODOS__'
const almacenFiltro = ref(TODOS_ALMACENES)

const imeisRaw = ref<any[]>([])
const accesoriosRaw = ref<any[]>([])
const piezasRaw = ref<any[]>([])

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

function coincideAlmacen(item: any): boolean {
  if (almacenFiltro.value === TODOS_ALMACENES) return true
  const almacen = almacenSeleccionado.value
  if (!almacen) return false
  if (almacen.uid && item.almacen_uid) return String(item.almacen_uid) === String(almacen.uid)
  return Number(item.almacen_id || 0) === Number(almacen.id || 0)
}

function nombreAlmacenItem(item: any): string {
  const almacen = almacenStore.almacenes.find((actual: any) =>
    (item.almacen_uid && actual.uid && String(actual.uid) === String(item.almacen_uid)) ||
    Number(actual.id || 0) === Number(item.almacen_id || 0)
  )
  return almacen?.nombre || 'Sin almacén'
}

function almacenArchivo(): string {
  return almacenReporteNombre.value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'Todos'
}

const imeis = computed(() => imeisRaw.value.filter(coincideAlmacen))
const accesorios = computed(() => accesoriosRaw.value.filter(coincideAlmacen))
const piezas = computed(() => piezasRaw.value.filter(coincideAlmacen))

const vistas = computed(() => [
  { label: 'Todos', value: 'todos' },
  ...(systemMode.isCellphoneStore ? [{ label: 'IMEI', value: 'imei' }] : []),
  { label: systemMode.productLabel, value: 'accesorios' },
  { label: 'Piezas', value: 'piezas' },
])

function money(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

const imeisDisponibles = computed(() => imeis.value.filter(i => i.estado === 'DISPONIBLE'))
const imeisVendidos = computed(() => imeis.value.filter(i => i.estado === 'VENDIDO'))
const accesoriosBajoStock = computed(() => accesorios.value.filter(a => Number(a.cantidad || 0) <= Number(a.alerta || 0)))
const piezasBajoStock = computed(() => piezas.value.filter(p => Number(p.cantidad || 0) <= Number(p.alerta || 0)))

const resumen = computed(() => {
  const costoImeis = systemMode.isCellphoneStore ? imeisDisponibles.value.reduce((s, i) => s + Number(i.costo || 0), 0) : 0
  const valorImeis = systemMode.isCellphoneStore ? imeisDisponibles.value.reduce((s, i) => s + Number(i.precio_venta || 0), 0) : 0
  const costoAccesorios = accesorios.value.reduce((s, a) => s + (Number(a.costo || 0) * Number(a.cantidad || 0)), 0)
  const valorAccesorios = accesorios.value.reduce((s, a) => s + (Number(a.precio_venta || 0) * Number(a.cantidad || 0)), 0)
  const costoPiezas = piezas.value.reduce((s, p) => s + (Number(p.costo || 0) * Number(p.cantidad || 0)), 0)
  const valorPiezas = piezas.value.reduce((s, p) => s + (Number(p.precio_venta || 0) * Number(p.cantidad || 0)), 0)

  return {
    totalItems: (systemMode.isCellphoneStore ? imeisDisponibles.value.length : 0) + accesorios.value.reduce((s, a) => s + Number(a.cantidad || 0), 0) + piezas.value.reduce((s, p) => s + Number(p.cantidad || 0), 0),
    costoTotal: costoImeis + costoAccesorios + costoPiezas,
    valorTotal: valorImeis + valorAccesorios + valorPiezas,
    gananciaPotencial: (valorImeis + valorAccesorios + valorPiezas) - (costoImeis + costoAccesorios + costoPiezas),
    imeisDisponibles: imeisDisponibles.value.length,
    imeisVendidos: imeisVendidos.value.length,
    accesorios: accesorios.value.length,
    piezas: piezas.value.length,
    alertas: accesoriosBajoStock.value.length + piezasBajoStock.value.length,
  }
})

async function cargarDatos() {
  loading.value = true
  try {
    const [resImeis, resAccesorios, resPiezas] = await Promise.all([
      window.db.getAll('imei'),
      window.db.getAll('accesorios'),
      window.db.getAll('piezas'),
    ])

    imeisRaw.value = resImeis.success ? resImeis.data || [] : []
    accesoriosRaw.value = resAccesorios.success ? resAccesorios.data || [] : []
    piezasRaw.value = resPiezas.success ? resPiezas.data || [] : []
  } catch (error) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cargar el inventario', life: 3000 })
  } finally {
    loading.value = false
  }
}

function estadoSeverity(estado: string) {
  if (estado === 'DISPONIBLE') return 'success'
  if (estado === 'VENDIDO') return 'info'
  if (estado === 'APARTADO') return 'warn'
  return 'secondary'
}

function buildPdfHtml(fecha: string): string {
  const rowsImeis = imeisDisponibles.value.map(i => `
    <tr><td>${escapeHtml(i.nombre)}</td><td>${escapeHtml(i.telefono_nombre || '-')}</td><td>${escapeHtml(nombreAlmacenItem(i))}</td><td>${escapeHtml(i.color || '-')}</td><td>${escapeHtml(i.capacidad || '-')}</td><td class="money">${getSystemCurrencyCode()} ${money(i.costo)}</td><td class="money">${getSystemCurrencyCode()} ${money(i.precio_venta)}</td></tr>
  `).join('')

  const rowsAcc = accesorios.value.map(a => `
    <tr><td>${escapeHtml(a.nombre)}</td><td>${escapeHtml(a.marca_nombre || '-')}</td><td>${escapeHtml(nombreAlmacenItem(a))}</td><td class="right">${a.cantidad || 0}</td><td class="money">${getSystemCurrencyCode()} ${money(a.costo)}</td><td class="money">${getSystemCurrencyCode()} ${money(a.precio_venta)}</td></tr>
  `).join('')

  const rowsPiezas = piezas.value.map(p => `
    <tr><td>${escapeHtml(p.nombre)}</td><td>${escapeHtml(p.proveedor || '-')}</td><td>${escapeHtml(nombreAlmacenItem(p))}</td><td class="right">${p.cantidad || 0}</td><td class="money">${getSystemCurrencyCode()} ${money(p.costo)}</td><td class="money">${getSystemCurrencyCode()} ${money(p.precio_venta)}</td></tr>
  `).join('')

  const imeiSection = systemMode.isCellphoneStore
    ? `<div class="sec">IMEI disponibles</div><table class="data"><thead><tr><th>IMEI</th><th>Telefono</th><th>Almacén</th><th>Color</th><th>Capacidad</th><th class="money">Costo</th><th class="money">Venta</th></tr></thead><tbody>${rowsImeis || '<tr><td colspan="7">Sin IMEI disponibles</td></tr>'}</tbody></table>`
    : ''
  const productTitle = systemMode.productLabel

  return `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Reporte Inventario</title>
  <style>
    @page{margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#1f2937;font-size:10.5px;margin:0}.bar{height:8px;background:#2563eb;margin-bottom:18px}.head{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:18px}.head h1{margin:0;font-size:22px}.box{border:1px solid #d1d5db;border-radius:6px;overflow:hidden;min-width:180px}.box div{padding:7px 10px;border-top:1px solid #e5e7eb}.box div:first-child{border-top:0;background:#2563eb;color:#fff;font-weight:700;text-transform:uppercase}.sec{font-size:12px;font-weight:700;text-transform:uppercase;border-bottom:2px solid #2563eb;padding-bottom:5px;margin:16px 0 8px}.cards{width:100%;border-collapse:separate;border-spacing:8px;margin:0 -8px 12px}.card{border:1px solid #d1d5db;background:#f9fafb;border-radius:6px;padding:10px}.label{font-size:9px;color:#6b7280;text-transform:uppercase}.value{font-size:18px;font-weight:700}.green{background:#ecfdf5;border-color:#a7f3d0}.green .value{color:#047857}.amber{background:#fffbeb;border-color:#fde68a}.amber .value{color:#b45309}table.data{width:100%;border-collapse:collapse;margin-bottom:14px}th{background:#111827;color:#fff;text-align:left;padding:7px 8px;font-size:9px;text-transform:uppercase}td{padding:7px 8px;border-bottom:1px solid #e5e7eb}tbody tr:nth-child(even) td{background:#f9fafb}.money,.right{text-align:right;white-space:nowrap}.footer{margin-top:18px;padding-top:10px;border-top:1px solid #d1d5db;color:#6b7280;font-size:9px;display:flex;justify-content:space-between}
  </style></head><body>
    <div class="bar"></div>
    <div class="head"><div><h1>Reporte de Inventario</h1><p>Resumen de productos, costos y valor disponible.</p></div><div class="box"><div>Inventario</div><div>Fecha: <strong>${fecha}</strong></div><div>Almacén: <strong>${escapeHtml(almacenReporteNombre.value)}</strong></div><div>Filtro: <strong>${escapeHtml(vista.value)}</strong></div></div></div>
    <div class="sec">Resumen</div>
    <table class="cards"><tr><td class="card"><div class="label">Items</div><div class="value">${resumen.value.totalItems}</div></td><td class="card"><div class="label">Costo</div><div class="value">${getSystemCurrencyCode()} ${money(resumen.value.costoTotal)}</div></td><td class="card green"><div class="label">Valor</div><div class="value">${getSystemCurrencyCode()} ${money(resumen.value.valorTotal)}</div></td><td class="card amber"><div class="label">Alertas</div><div class="value">${resumen.value.alertas}</div></td></tr></table>
    ${imeiSection}
    <div class="sec">${productTitle}</div><table class="data"><thead><tr><th>Nombre</th><th>Marca</th><th>Almacén</th><th class="right">Cantidad</th><th class="money">Costo</th><th class="money">Venta</th></tr></thead><tbody>${rowsAcc || `<tr><td colspan="6">Sin ${productTitle.toLowerCase()}</td></tr>`}</tbody></table>
    <div class="sec">Piezas</div><table class="data"><thead><tr><th>Nombre</th><th>Proveedor</th><th>Almacén</th><th class="right">Cantidad</th><th class="money">Costo</th><th class="money">Venta</th></tr></thead><tbody>${rowsPiezas || '<tr><td colspan="6">Sin piezas</td></tr>'}</tbody></table>
    <div class="footer"><span>MrCuttiTechnology</span><span>Generado el ${fecha}</span></div>
  </body></html>`
}

async function abrirPdf(url: string, nombre: string) {
  pdfUrl.value = url
  pdfNombre.value = nombre
  if (window.Swal?.fire) {
    const result = await window.Swal.fire({
      title: 'Vista Previa - Reporte de Inventario',
      html: `<iframe src="${url}" style="width:100%;height:75vh;border:0;border-radius:6px;background:#fff"></iframe>`,
      width: '90vw',
      showCancelButton: true,
      confirmButtonText: 'Descargar PDF',
      cancelButtonText: 'Cerrar',
      focusConfirm: false,
    })
    if (result.isConfirmed) await descargarPDF()
    cerrarPdf()
    return
  }
  dialogPdf.value = true
}

async function generarPDF() {
  generandoPdf.value = true
  try {
    const fecha = new Date().toLocaleDateString(getSystemLocale(), { year: 'numeric', month: 'long', day: 'numeric' })
    const nombre = `Reporte_Inventario_${almacenArchivo()}_${new Date().toISOString().split('T')[0]}.pdf`
    const res = await window.electron.invoke('generate:pdf', buildPdfHtml(fecha), nombre) as { success: boolean; dataUrl?: string; error?: string }
    if (res.success && res.dataUrl) {
      const blob = await (await fetch(res.dataUrl)).blob()
      await abrirPdf(URL.createObjectURL(blob), nombre)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar el PDF', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    generandoPdf.value = false
  }
}

function cerrarPdf() {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = ''
  dialogPdf.value = false
}

async function descargarPDF() {
  if (!pdfUrl.value) return
  const blob = await (await fetch(pdfUrl.value)).blob()
  const buffer = await blob.arrayBuffer()
  const base64 = btoa(String.fromCharCode(...new Uint8Array(buffer)))
  const dataUrl = `data:application/pdf;base64,${base64}`
  const res = await window.electron.invoke('save:pdf', dataUrl, pdfNombre.value) as { success: boolean }
  if (res.success) toast.add({ severity: 'success', summary: 'Guardado', detail: 'PDF descargado', life: 2000 })
}

onMounted(async () => {
  await almacenStore.load()
  const almacenActivo = almacenStore.almacenes.find((almacen: any) =>
    (almacenStore.activeUid && String(almacen.uid || '') === String(almacenStore.activeUid)) ||
    Number(almacen.id || 0) === Number(almacenStore.activeId || 0)
  )
  almacenFiltro.value = almacenActivo ? almacenKey(almacenActivo) : TODOS_ALMACENES
  await cargarDatos()
})
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-5">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <i class="pi pi-file-export text-primary text-lg"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold">Reporte de Inventario</h2>
            <p class="text-sm text-surface-500">Costos, valor y disponibilidad del inventario</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Select v-model="almacenFiltro" :options="almacenesOptions" optionLabel="label" optionValue="value" placeholder="Seleccionar almacén" class="w-56" />
          <Select v-model="vista" :options="vistas" optionLabel="label" optionValue="value" class="w-40" />
          <Button label="PDF" icon="pi pi-file-pdf" severity="danger" :loading="generandoPdf" @click="generarPDF" />
          <Button icon="pi pi-refresh" severity="secondary" @click="cargarDatos" />
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16 text-surface-400 gap-3">
        <i class="pi pi-spin pi-spinner text-2xl"></i>
        <span>Cargando...</span>
      </div>

      <div v-else class="space-y-5">
        <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-3">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
            <span class="text-xs text-surface-400">Items</span>
            <p class="text-2xl font-bold mt-1">{{ resumen.totalItems }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
            <span class="text-xs text-surface-400">Costo</span>
            <p class="text-2xl font-bold mt-1">{{ $formatMoney(resumen.costoTotal) }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
            <span class="text-xs text-green-600 font-semibold">Valor</span>
            <p class="text-2xl font-bold mt-1 text-green-600">{{ $formatMoney(resumen.valorTotal) }}</p>
          </div>
          <div v-if="systemMode.isCellphoneStore" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
            <span class="text-xs text-primary font-semibold">IMEI Disp.</span>
            <p class="text-2xl font-bold mt-1">{{ resumen.imeisDisponibles }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
            <span class="text-xs text-surface-400">{{ systemMode.productLabel }}</span>
            <p class="text-2xl font-bold mt-1">{{ resumen.accesorios }}</p>
          </div>
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
            <span class="text-xs text-orange-500 font-semibold">Alertas</span>
            <p class="text-2xl font-bold mt-1">{{ resumen.alertas }}</p>
          </div>
        </div>

        <div v-if="systemMode.isCellphoneStore && (vista === 'todos' || vista === 'imei')" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h3 class="font-semibold text-sm mb-3">IMEI Disponibles</h3>
          <DataTable :value="imeisDisponibles" paginator :rows="10" responsiveLayout="scroll">
            <Column field="nombre" header="IMEI" sortable />
            <Column field="telefono_nombre" header="Telefono" sortable />
            <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable>
              <template #body="{ data }">{{ nombreAlmacenItem(data) }}</template>
            </Column>
            <Column field="color" header="Color" sortable />
            <Column field="capacidad" header="Capacidad" sortable />
            <Column field="precio_venta" header="Venta" sortable><template #body="{ data }">{{ $formatMoney(data.precio_venta) }}</template></Column>
            <Column field="estado" header="Estado"><template #body="{ data }"><Tag :value="data.estado" :severity="estadoSeverity(data.estado)" /></template></Column>
          </DataTable>
        </div>

        <div v-if="vista === 'todos' || vista === 'accesorios'" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h3 class="font-semibold text-sm mb-3">{{ systemMode.productLabel }}</h3>
          <DataTable :value="accesorios" paginator :rows="10" responsiveLayout="scroll">
            <Column field="nombre" header="Nombre" sortable />
            <Column field="marca_nombre" header="Marca" sortable />
            <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable>
              <template #body="{ data }">{{ nombreAlmacenItem(data) }}</template>
            </Column>
            <Column field="cantidad" header="Cant." sortable />
            <Column field="precio_venta" header="Venta" sortable><template #body="{ data }">{{ $formatMoney(data.precio_venta) }}</template></Column>
            <Column header="Stock"><template #body="{ data }"><Tag :value="data.cantidad <= data.alerta ? 'BAJO' : 'OK'" :severity="data.cantidad <= data.alerta ? 'warn' : 'success'" /></template></Column>
          </DataTable>
        </div>

        <div v-if="vista === 'todos' || vista === 'piezas'" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h3 class="font-semibold text-sm mb-3">Piezas</h3>
          <DataTable :value="piezas" paginator :rows="10" responsiveLayout="scroll">
            <Column field="nombre" header="Nombre" sortable />
            <Column field="proveedor" header="Proveedor" sortable />
            <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable>
              <template #body="{ data }">{{ nombreAlmacenItem(data) }}</template>
            </Column>
            <Column field="cantidad" header="Cant." sortable />
            <Column field="precio_venta" header="Venta" sortable><template #body="{ data }">{{ $formatMoney(data.precio_venta) }}</template></Column>
            <Column header="Stock"><template #body="{ data }"><Tag :value="data.cantidad <= data.alerta ? 'BAJO' : 'OK'" :severity="data.cantidad <= data.alerta ? 'warn' : 'success'" /></template></Column>
          </DataTable>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="dialogPdf" header="Vista Previa - Reporte de Inventario" modal :style="{ width: '80vw', height: '90vh' }" :draggable="false">
      <div class="flex flex-col h-full -m-6">
        <iframe v-if="pdfUrl" :src="pdfUrl" class="w-full flex-1 border-0" style="min-height: 70vh"></iframe>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="cerrarPdf" />
        <Button label="Descargar PDF" icon="pi pi-download" @click="descargarPDF" />
      </template>
    </Dialog>
  </div>
</template>
