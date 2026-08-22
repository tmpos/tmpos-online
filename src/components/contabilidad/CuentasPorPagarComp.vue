<script setup lang="ts">
import { getSystemCurrencyCode, getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import Swal from 'sweetalert2'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const cuentas = ref<any[]>([])
const selectedCuentas = ref<any[]>([])
const proveedores = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const filtroEstado = ref('')
const viewMode = ref<'table' | 'cards'>('cards')
const verTodosAlmacenes = ref(false)

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'cuentas_pagar', entity: 'cuentas_pagar', label: 'cuenta por pagar',
  selection: selectedCuentas, reload: cargarCuentas,
  reference: (item: any) => item.no_factura || String(item.id || ''),
})

const dialogPago = ref(false)
const cuentaSelected = ref<any>(null)
const montoPago = ref(0)
const guardando = ref(false)
const generandoPdf = ref(false)

const dialogNueva = ref(false)
const guardandoNueva = ref(false)
const nuevaForm = ref({
  proveedor_id: null as number | null,
  nombre_proveedor: '',
  telefono_proveedor: '',
  no_factura: '',
  total: 0,
  fecha_compra: new Date().toISOString().split('T')[0],
})

const estados = [
  { label: 'Todas', value: '' },
  { label: 'Activa', value: 'ACTIVA' },
  { label: 'Pagada', value: 'PAGADA' },
  { label: 'Vencida', value: 'VENCIDA' },
]

const cuentasFiltradas = computed(() => {
  let data = cuentas.value
  const texto = busqueda.value.toLowerCase().trim()
  if (texto) {
    data = data.filter(c =>
      c.nombre_proveedor?.toLowerCase().includes(texto) ||
      c.no_factura?.toLowerCase().includes(texto) ||
      c.telefono_proveedor?.toLowerCase().includes(texto)
    )
  }
  if (filtroEstado.value) {
    data = data.filter(c => c.estado === filtroEstado.value)
  }
  return data
})

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const d = new Date(fechaStr)
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function escaparHtml(valor: any): string {
  return String(valor ?? '').replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[caracter] || caracter))
}

async function generarPdfCuentaPagar(cuenta: any) {
  if (!cuenta) return
  generandoPdf.value = true
  try {
    let empresa: any = {}
    try {
      const res = await window.db.getAll('empresa')
      if (res.success && res.data?.length) empresa = res.data[0]
    } catch {}
    const pagos = (() => {
      try {
        const datos = JSON.parse(cuenta.pagos || '[]')
        return Array.isArray(datos) ? datos : []
      } catch { return [] }
    })()
    const moneda = (valor: any) => `${getSystemCurrencyCode()} ${formatCurrency(Number(valor || 0))}`
    const abonosHtml = pagos.length
      ? pagos.map((pago: any, indice: number) => `<tr><td>${escaparHtml(pago.nopago || indice + 1)}</td><td>${escaparHtml(`${pago.fecha || ''} ${pago.hora || ''}`)}</td><td>${moneda(pago.cantidad)}</td></tr>`).join('')
      : '<tr><td colspan="3" class="empty">Sin abonos registrados.</td></tr>'
    const fecha = new Date().toLocaleString(getSystemLocale())
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:letter;margin:12mm}body{font-family:Arial,sans-serif;color:#1f2937;font-size:12px}.page{max-width:700px;margin:auto}.header{text-align:center;border-bottom:2px solid #b45309;padding-bottom:12px}.header h1{margin:0;color:#b45309;font-size:22px}.header p{margin:4px 0;color:#6b7280}.title{margin:18px 0;background:#b45309;color:#fff;padding:10px;text-align:center;font-size:16px;font-weight:bold}.box{border:1px solid #d1d5db;border-radius:8px;padding:11px;margin:12px 0}.row{display:flex;justify-content:space-between;padding:5px 0;border-bottom:1px solid #eee}.row:last-child{border:0}.total{font-size:17px}.green{color:#15803d}.red{color:#dc2626}table{width:100%;border-collapse:collapse;margin-top:10px}th,td{padding:7px;border-bottom:1px solid #e5e7eb;text-align:left}th{background:#f3f4f6}.empty{text-align:center;color:#6b7280}.footer{text-align:center;color:#9ca3af;margin-top:20px;font-size:10px}</style></head><body><div class="page"><div class="header"><h1>${escaparHtml(empresa.nombre || 'MI EMPRESA')}</h1><p>${escaparHtml(empresa.telefono || '')} ${empresa.email ? `| ${escaparHtml(empresa.email)}` : ''}</p></div><div class="title">ESTADO DE CUENTA POR PAGAR</div><div class="box"><p><b>Proveedor:</b> ${escaparHtml(cuenta.nombre_proveedor || 'Sin registro')}</p><p><b>Teléfono:</b> ${escaparHtml(cuenta.telefono_proveedor || 'N/A')}</p><p><b>Factura:</b> ${escaparHtml(cuenta.no_factura || 'N/A')}</p><p><b>Fecha de compra:</b> ${escaparHtml(formatFecha(cuenta.fecha_compra) || 'N/A')}</p><p><b>Vencimiento:</b> ${escaparHtml(formatFecha(cuenta.fecha_vencimiento) || 'N/A')}</p></div><div class="box"><div class="row total"><span>Total</span><b>${moneda(cuenta.total)}</b></div><div class="row total"><span>Abonado</span><b class="green">${moneda(cuenta.abonado)}</b></div><div class="row total"><span>Saldo pendiente</span><b class="red">${moneda(cuenta.saldo)}</b></div></div><h3>Abonos realizados</h3><table><thead><tr><th>#</th><th>Fecha y hora</th><th>Monto</th></tr></thead><tbody>${abonosHtml}</tbody></table><div class="footer">Generado el ${escaparHtml(fecha)} | TM POS</div></div></body></html>`
    const archivo = `Cuenta_por_Pagar_${String(cuenta.no_factura || cuenta.id).replace(/[^a-z0-9]+/gi, '_')}.pdf`
    const resultado = await window.electron.invoke('generate:pdf', html, archivo) as { success: boolean; dataUrl?: string; error?: string }
    if (!resultado.success || !resultado.dataUrl) throw new Error(resultado.error || 'No se pudo generar el PDF')
    const blob = await (await fetch(resultado.dataUrl)).blob()
    const url = URL.createObjectURL(blob)
    const decision = await Swal.fire({ title: 'Estado de cuenta por pagar', html: `<iframe src="${url}" style="width:100%;height:75vh;border:0;background:#fff"></iframe>`, width: '90vw', showCancelButton: true, confirmButtonText: 'Descargar PDF', cancelButtonText: 'Cerrar' })
    if (decision.isConfirmed) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binario = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const guardado = await window.electron.invoke('save:pdf', `data:application/pdf;base64,${btoa(binario)}`, archivo) as { success: boolean; error?: string }
      if (!guardado.success) throw new Error(guardado.error || 'No se pudo guardar el PDF')
    }
    URL.revokeObjectURL(url)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo generar el PDF', life: 3500 })
  } finally {
    generandoPdf.value = false
  }
}

function getEstadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | undefined {
  switch (estado) {
    case 'ACTIVA': return 'warn'
    case 'PAGADA': return 'success'
    case 'VENCIDA': return 'danger'
    default: return 'info'
  }
}

async function cargarCuentas() {
  loading.value = true
  try {
    const res = await window.db.getAll('cuentas_pagar')
    if (res.success) {
      cuentas.value = verTodosAlmacenes.value
        ? (res.data || [])
        : filterByAlmacen(res.data || [])
    }
  } catch (_) {}
  loading.value = false
}

watch(verTodosAlmacenes, () => {
  selectedCuentas.value = []
  cuentaSelected.value = null
  cargarCuentas()
})

function estaCuentaSeleccionada(cuenta: any): boolean {
  return selectedCuentas.value.some((item: any) => item.id === cuenta.id)
}

function toggleSeleccionCuenta(cuenta: any) {
  selectedCuentas.value = estaCuentaSeleccionada(cuenta)
    ? selectedCuentas.value.filter((item: any) => item.id !== cuenta.id)
    : [...selectedCuentas.value, cuenta]
}

async function cargarProveedores() {
  try {
    const res = await window.db.getAll('proveedores')
    if (res.success) proveedores.value = filterByAlmacen(res.data || [])
  } catch (_) {}
}

function seleccionarProveedor() {
  const proveedor = proveedores.value.find((item: any) => Number(item.id) === Number(nuevaForm.value.proveedor_id))
  if (!proveedor) return
  nuevaForm.value.nombre_proveedor = proveedor.nombre || ''
  nuevaForm.value.telefono_proveedor = proveedor.telefono || ''
}

function abrirPago(cuenta: any) {
  cuentaSelected.value = cuenta
  montoPago.value = cuenta.saldo
  dialogPago.value = true
}

const pagosHistorialParsed = computed(() => {
  if (!cuentaSelected.value) return []
  try {
    const p = JSON.parse(cuentaSelected.value.pagos || '[]')
    return Array.isArray(p) ? p : []
  } catch { return [] }
})

async function registrarPago() {
  if (!cuentaSelected.value || montoPago.value <= 0) return
  if (montoPago.value > (cuentaSelected.value.saldo || 0)) {
    toast.add({ severity: 'warn', summary: 'Monto excede el saldo', detail: `Saldo: $${formatCurrency(cuentaSelected.value.saldo)}`, life: 3000 })
    return
  }
  guardando.value = true
  try {
    const monto = montoPago.value
    const nuevoAbonado = (cuentaSelected.value.abonado || 0) + monto
    const nuevoSaldo = (cuentaSelected.value.total || 0) - nuevoAbonado
    const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'ACTIVA'

    let pagosHistorial: any[] = []
    try {
      pagosHistorial = JSON.parse(cuentaSelected.value.pagos || '[]')
      if (!Array.isArray(pagosHistorial)) pagosHistorial = []
    } catch { pagosHistorial = [] }
    const now = new Date()
    pagosHistorial.push({
      nopago: pagosHistorial.length + 1,
      cantidad: monto,
      fecha: now.toLocaleDateString(getSystemLocale()),
      hora: now.toLocaleTimeString(getSystemLocale(), { hour: '2-digit', minute: '2-digit' }),
      almacen_uid: cuentaSelected.value.almacen_uid || almacenStore.activeUid || '',
    })

    await window.db.update('cuentas_pagar', cuentaSelected.value.id, {
      abonado: nuevoAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      pagos: JSON.stringify(pagosHistorial),
    })

    cuentaSelected.value.pagos = JSON.stringify(pagosHistorial)
    cuentaSelected.value.abonado = nuevoAbonado
    cuentaSelected.value.saldo = nuevoSaldo
    cuentaSelected.value.estado = nuevoEstado

    toast.add({ severity: 'success', summary: 'Pago registrado', detail: `$${formatCurrency(monto)} pagados`, life: 3000 })
    montoPago.value = nuevoSaldo
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

async function eliminarPago(index: number) {
  if (!cuentaSelected.value) return
  let pagosHistorial: any[] = []
  try {
    pagosHistorial = JSON.parse(cuentaSelected.value.pagos || '[]')
    if (!Array.isArray(pagosHistorial)) pagosHistorial = []
  } catch { pagosHistorial = [] }
  const pagoEliminado = pagosHistorial[index]
  if (!pagoEliminado) return
  pagosHistorial.splice(index, 1)
  pagosHistorial.forEach((p: any, i: number) => { p.nopago = i + 1 })
  const nuevoAbonado = pagosHistorial.reduce((sum: number, p: any) => sum + (Number(p.cantidad) || 0), 0)
  const nuevoSaldo = (cuentaSelected.value.total || 0) - nuevoAbonado
  const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'ACTIVA'
  try {
    await window.db.update('cuentas_pagar', cuentaSelected.value.id, {
      abonado: nuevoAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      pagos: JSON.stringify(pagosHistorial),
    })
    cuentaSelected.value.pagos = JSON.stringify(pagosHistorial)
    cuentaSelected.value.abonado = nuevoAbonado
    cuentaSelected.value.saldo = nuevoSaldo
    cuentaSelected.value.estado = nuevoEstado
    toast.add({ severity: 'info', summary: 'Pago eliminado', detail: `$${formatCurrency(pagoEliminado.cantidad)} removido`, life: 3000 })
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}

async function cambiarEstado(cuenta: any, estado: string) {
  await window.db.update('cuentas_pagar', cuenta.id, { estado })
  cuenta.estado = estado
  toast.add({ severity: 'success', summary: 'Estado actualizado', detail: estado, life: 2000 })
}

function abrirNueva() {
  nuevaForm.value = {
    proveedor_id: null,
    nombre_proveedor: '',
    telefono_proveedor: '',
    no_factura: '',
    total: 0,
    fecha_compra: new Date().toISOString().split('T')[0],
  }
  dialogNueva.value = true
}

async function guardarNueva() {
  if (!nuevaForm.value.nombre_proveedor.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del proveedor es requerido', life: 3000 })
    return
  }
  if (!nuevaForm.value.no_factura.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El numero de factura es requerido', life: 3000 })
    return
  }
  if (!nuevaForm.value.total || nuevaForm.value.total <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El total debe ser mayor a 0', life: 3000 })
    return
  }
  guardandoNueva.value = true
  try {
    const total = Number(nuevaForm.value.total)
    await window.db.insert('cuentas_pagar', addAlmacenId({
      cod_proveedor: nuevaForm.value.proveedor_id ? String(nuevaForm.value.proveedor_id) : '',
      nombre_proveedor: nuevaForm.value.nombre_proveedor.trim().toUpperCase(),
      telefono_proveedor: nuevaForm.value.telefono_proveedor.trim(),
      no_factura: nuevaForm.value.no_factura.trim().toUpperCase(),
      total,
      abonado: 0,
      saldo: total,
      fecha_compra: nuevaForm.value.fecha_compra,
      estado: 'ACTIVA',
    }))
    toast.add({ severity: 'success', summary: 'Creada', detail: 'Cuenta por pagar registrada', life: 3000 })
    dialogNueva.value = false
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    guardandoNueva.value = false
  }
}

onMounted(async () => {
  await almacenStore.load()
  await Promise.all([cargarCuentas(), cargarProveedores()])
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Cuentas por Pagar">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="p-input-icon-left">
            <i class="pi pi-search"></i>
            <InputText v-model="busqueda" placeholder="Buscar factura o proveedor..." />
          </span>
          <Select v-model="filtroEstado" :options="estados" optionLabel="label" optionValue="value" placeholder="Estado" class="w-32" fluid />
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-300 cursor-pointer">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            <span>Todos los almacenes</span>
          </label>
          <Button
            v-if="selectedCuentas.length"
            :label="`Cambiar almacén (${selectedCuentas.length})`"
            icon="pi pi-warehouse"
            severity="success"
            @click="abrirMoverAlmacen"
          />
          <div class="inline-flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer"
              :class="viewMode === 'table'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'table'"
            >
              <i class="pi pi-list"></i>
            </button>
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-surface-200 dark:border-surface-700"
              :class="viewMode === 'cards'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'cards'"
            >
              <i class="pi pi-th-large"></i>
            </button>
          </div>
          <Button label="Nueva Cuenta" icon="pi pi-plus" @click="abrirNueva" />
          <Button label="Actualizar" icon="pi pi-refresh" severity="secondary" @click="cargarCuentas" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        v-model:selection="selectedCuentas"
        :value="cuentasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        @row-click="abrirPago($event.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="no_factura" header="Factura" sortable style="width: 8rem" />
        <Column field="nombre_proveedor" header="Proveedor" sortable />
        <Column field="total" header="Total" sortable style="width: 8rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column field="abonado" header="Pagado" sortable style="width: 8rem">
          <template #body="{ data }">{{ $formatMoney(data.abonado) }}</template>
        </Column>
        <Column field="saldo" header="Saldo" sortable style="width: 8rem">
          <template #body="{ data }">
            <span :class="data.saldo > 0 ? 'text-red-600 font-bold' : 'text-green-600'">{{ $formatMoney(data.saldo) }}</span>
          </template>
        </Column>
        <Column field="fecha_compra" header="Fecha" sortable style="width: 7rem">
          <template #body="{ data }">{{ formatFecha(data.fecha_compra) }}</template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width: 7rem">
          <template #body="{ data }">
            <Tag :value="data.estado" :severity="getEstadoSeverity(data.estado)" />
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay cuentas por pagar.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="cuentasFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay cuentas por pagar.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="cuenta in cuentasFiltradas"
            :key="cuenta.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirPago(cuenta)"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <Button
                  :icon="estaCuentaSeleccionada(cuenta) ? 'pi pi-check-square' : 'pi pi-square'"
                  :severity="estaCuentaSeleccionada(cuenta) ? 'success' : 'secondary'"
                  text
                  rounded
                  size="small"
                  @click.stop="toggleSeleccionCuenta(cuenta)"
                  v-tooltip="estaCuentaSeleccionada(cuenta) ? 'Quitar de la selección' : 'Seleccionar cuenta'"
                />
                <span class="text-xs font-mono text-surface-400">#{{ cuenta.id }}</span>
              </div>
              <Tag :value="cuenta.estado" :severity="getEstadoSeverity(cuenta.estado)" />
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ cuenta.nombre_proveedor }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">Factura {{ cuenta.no_factura }}</p>
            </div>

            <div class="grid grid-cols-2 gap-2 text-sm">
              <div class="flex flex-col">
                <span class="text-xs text-surface-400">Total</span>
                <span class="font-semibold">{{ $formatMoney(cuenta.total) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-surface-400">Pagado</span>
                <span class="font-semibold text-green-600">{{ $formatMoney(cuenta.abonado) }}</span>
              </div>
              <div class="flex flex-col col-span-2">
                <span class="text-xs text-surface-400">Saldo pendiente</span>
                <span :class="cuenta.saldo > 0 ? 'text-red-600 font-bold text-lg' : 'text-green-600 font-bold text-lg'">{{ $formatMoney(cuenta.saldo) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-surface-400">Fecha</span>
                <span>{{ formatFecha(cuenta.fecha_compra) }}</span>
              </div>
              <div class="flex flex-col">
                <span class="text-xs text-surface-400">Telefono</span>
                <span>{{ cuenta.telefono_proveedor || '—' }}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm text-surface-600 dark:text-surface-300">
          Se moverán {{ selectedCuentas.length }} cuenta(s) por pagar al almacén seleccionado.
        </p>
        <Select
          v-model="almacenDestino"
          :options="almacenesDestino"
          optionLabel="nombre"
          placeholder="Seleccionar almacén destino"
          fluid
        />
        <p v-if="almacenesDestino.length === 0" class="text-sm text-orange-600">
          No hay otro almacén disponible como destino.
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogMoverAlmacen = false" />
        <Button
          label="Cambiar almacén"
          icon="pi pi-warehouse"
          severity="success"
          :loading="moviendoAlmacen"
          :disabled="!almacenDestino"
          @click="aplicarMoverAlmacen"
        />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogPago" header="Registrar Pago" modal :style="{ width: '36rem' }">
      <div v-if="cuentaSelected" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Factura</span>
            <span class="font-semibold">{{ cuentaSelected.no_factura }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Proveedor</span>
            <span class="font-semibold">{{ cuentaSelected.nombre_proveedor }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Total</span>
            <span>{{ $formatMoney(cuentaSelected.total) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Pagado</span>
            <span class="text-green-600">{{ $formatMoney(cuentaSelected.abonado) }}</span>
          </div>
          <div class="flex justify-between font-bold border-t border-surface-200 dark:border-surface-700 pt-2">
            <span>Saldo pendiente</span>
            <span class="text-red-600">{{ $formatMoney(cuentaSelected.saldo) }}</span>
          </div>
        </div>

        <!-- Historial de pagos -->
        <div v-if="pagosHistorialParsed.length > 0" class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm">
          <div class="font-semibold mb-2">Pagos realizados</div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div v-for="(pago, index) in pagosHistorialParsed" :key="pago.nopago" class="flex justify-between items-center py-1 border-b border-surface-100 dark:border-surface-800 last:border-0">
              <div>
                <span class="font-semibold">#{{ pago.nopago }}</span>
                <span class="text-surface-500 ml-2">{{ pago.fecha }} {{ pago.hora }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-green-600 font-semibold">{{ $formatMoney(pago.cantidad) }}</span>
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="eliminarPago(index)" v-tooltip="'Eliminar pago'" />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-surface-400 text-center py-2">Sin pagos registrados</div>

        <div v-if="cuentaSelected.saldo > 0" class="space-y-1">
          <label class="text-sm font-semibold">Monto a pagar (RD$)</label>
          <InputNumber v-model="montoPago" :min="0" :max="cuentaSelected.saldo" fluid @focus="(e: any) => e.target.select()" />
        </div>

        <div v-if="cuentaSelected.saldo > 0" class="flex gap-2 pt-1">
          <Button
            v-for="m in [cuentaSelected.saldo, Math.round(cuentaSelected.saldo / 2), Math.round(cuentaSelected.saldo * 0.25)]"
            :key="m"
            :label="'$' + formatCurrency(m)"
            severity="secondary"
            text
            size="small"
            @click="montoPago = m"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogPago = false" />
        <Button label="PDF" icon="pi pi-file-pdf" severity="danger" outlined :loading="generandoPdf" @click="generarPdfCuentaPagar(cuentaSelected)" />
        <Button v-if="cuentaSelected?.saldo > 0" label="Registrar Pago" icon="pi pi-check" :loading="guardando" :disabled="montoPago <= 0" @click="registrarPago" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNueva" header="Nueva Cuenta por Pagar" modal :style="{ width: 'min(26rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Seleccionar proveedor</label>
          <Select
            v-model="nuevaForm.proveedor_id"
            :options="proveedores"
            optionLabel="nombre"
            optionValue="id"
            filter
            showClear
            placeholder="Elegir proveedor registrado..."
            fluid
            @change="seleccionarProveedor"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Proveedor <span class="text-red-500">*</span></label>
          <InputText v-model="nuevaForm.nombre_proveedor" placeholder="Nombre del proveedor" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Factura <span class="text-red-500">*</span></label>
          <InputText v-model="nuevaForm.no_factura" placeholder="Numero de factura" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Total <span class="text-red-500">*</span></label>
          <InputNumber v-model="nuevaForm.total" :min="0" fluid @focus="(e: any) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Telefono (opcional)</label>
          <InputText v-model="nuevaForm.telefono_proveedor" placeholder="8095551234" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Fecha de compra</label>
          <InputText v-model="nuevaForm.fecha_compra" type="date" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNueva = false" />
        <Button label="Guardar" icon="pi pi-check" :loading="guardandoNueva" @click="guardarNueva" />
      </template>
    </Dialog>
  </div>
</template>
