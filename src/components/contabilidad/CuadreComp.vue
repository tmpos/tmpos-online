<template>
  <div class="w-full px-3 py-4 sm:px-5 sm:py-6">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Cuadres de Caja</h1>
        <p class="text-sm text-surface-500">Historial de cuadres realizados</p>
      </div>
      <button @click="abrirNuevoCuadre" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
        <i class="pi pi-plus"></i>Nuevo Cuadre
      </button>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <template v-else>
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-3 mb-4">
        <div class="w-full sm:w-80">
          <label class="block text-xs font-semibold text-surface-500 mb-1.5">Buscar por fecha</label>
          <Calendar v-model="rangoFechas" selectionMode="range" dateFormat="dd/mm/yy" placeholder="Desde - Hasta" showIcon fluid :manualInput="false" />
        </div>
        <div class="flex items-center gap-3 sm:pb-2">
          <span class="text-sm text-surface-500">{{ cuadresFiltrados.length }} cuadre(s)</span>
          <Button v-if="rangoFechas.length" label="Limpiar" icon="pi pi-filter-slash" severity="secondary" text size="small" @click="rangoFechas = []" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-5">
        <div class="cuadre-summary-card">
          <div class="cuadre-summary-icon"><i class="pi pi-chart-line"></i></div>
          <div class="min-w-0">
            <p class="cuadre-summary-label">Total cobrado</p>
            <p class="cuadre-summary-value">{{ $formatMoney(resumenFiltrado.totalCobrado) }}</p>
            <p class="cuadre-summary-detail">{{ cuadresFiltrados.length }} cuadre(s)</p>
          </div>
        </div>
        <div class="cuadre-summary-card">
          <div class="cuadre-summary-icon"><i class="pi pi-money-bill"></i></div>
          <div class="min-w-0">
            <p class="cuadre-summary-label">Efectivo</p>
            <p class="cuadre-summary-value">{{ $formatMoney(resumenFiltrado.efectivo) }}</p>
            <p class="cuadre-summary-detail">Cobrado en efectivo</p>
          </div>
        </div>
        <div class="cuadre-summary-card">
          <div class="cuadre-summary-icon"><i class="pi pi-credit-card"></i></div>
          <div class="min-w-0">
            <p class="cuadre-summary-label">Pagos bancarios</p>
            <p class="cuadre-summary-value">{{ $formatMoney(resumenFiltrado.pagosBancarios) }}</p>
            <p class="cuadre-summary-detail">Tarjetas + transferencias</p>
          </div>
        </div>
        <div class="cuadre-summary-card">
          <div class="cuadre-summary-icon"><i class="pi pi-receipt"></i></div>
          <div class="min-w-0">
            <p class="cuadre-summary-label">Gastos</p>
            <p class="cuadre-summary-value">{{ $formatMoney(resumenFiltrado.gastos) }}</p>
            <p class="cuadre-summary-detail">Salidas registradas</p>
          </div>
        </div>
        <div class="cuadre-summary-card cuadre-summary-card--featured">
          <div class="cuadre-summary-icon"><i class="pi pi-wallet"></i></div>
          <div class="min-w-0">
            <p class="cuadre-summary-label">Saldo final</p>
            <p class="cuadre-summary-value">{{ $formatMoney(resumenFiltrado.saldoFinal) }}</p>
            <p class="cuadre-summary-detail">Acumulado de cuadres</p>
          </div>
        </div>
      </div>

      <DataTable :value="cuadresFiltrados" stripedRows paginator :rows="10" dataKey="id" sortField="created_at" :sortOrder="-1" scrollable tableStyle="min-width: 92rem" class="w-full">
        <Column field="fecha" header="Fecha" sortable style="width:7rem" />
        <Column field="turno_usuario" header="Cajero" sortable />
        <Column header="Ventas" style="width:7rem">
          <template #body="{ data }">{{ $formatMoney(data.total_ventas) }}</template>
        </Column>
        <Column header="Efectivo" style="width:7rem">
          <template #body="{ data }">{{ $formatMoney(data.efectivo) }}</template>
        </Column>
        <Column header="Abonos CxC" style="width:7rem">
          <template #body="{ data }"><span class="font-semibold text-cyan-600">{{ $formatMoney(data.abonos_cxc) }}</span></template>
        </Column>
        <Column header="Tarjeta" style="width:7rem">
          <template #body="{ data }">{{ $formatMoney(data.tarjeta) }}</template>
        </Column>
        <Column header="Transferencia" style="width:7rem">
          <template #body="{ data }">{{ $formatMoney(data.transferencia) }}</template>
        </Column>
        <Column header="Gastos" style="width:7rem">
          <template #body="{ data }">{{ $formatMoney(data.total_gastos) }}</template>
        </Column>
        <Column header="Saldo Final" style="width:7rem">
          <template #body="{ data }"><span class="font-bold text-green-600">{{ $formatMoney(data.saldo_final || data.total_ventas - data.total_gastos) }}</span></template>
        </Column>
        <Column field="monto_inicial" header="Monto Inicial" style="width:6rem">
          <template #body="{ data }">{{ $formatMoney(data.monto_inicial) }}</template>
        </Column>
        <Column field="observacion" header="Nota" style="width:10rem" />
        <Column header="Acciones" style="width:12rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-print" severity="secondary" text rounded size="small" :loading="accionandoId === data.id" :disabled="accionandoId !== null" v-tooltip.left="'Reimprimir'" @click="reimprimirCuadre(data)" />
              <Button icon="pi pi-file-pdf" severity="danger" text rounded size="small" :loading="pdfGenerandoId === data.id" :disabled="accionandoId !== null || pdfGenerandoId !== null" v-tooltip.left="'Generar PDF profesional'" @click="generarPdfCuadre(data)" />
              <Button icon="pi pi-envelope" severity="secondary" text rounded size="small" :loading="accionandoId === data.id" :disabled="accionandoId !== null" v-tooltip.left="'Enviar al correo'" @click="enviarCuadreCorreo(data)" />
            </div>
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-10 text-surface-400">No hay cuadres registrados.</div>
        </template>
      </DataTable>
    </template>

    <Dialog v-model:visible="dialogVisible" header="Nuevo Cuadre de Caja" modal :style="{ width: 'min(36rem, 95vw)' }" :draggable="false">
      <div v-if="!turnoActivo" class="text-center py-8 text-amber-500 text-sm">
        <i class="pi pi-exclamation-triangle text-2xl block mb-2"></i>
        No hay un turno de caja abierto. Abre un turno en Contabilidad &gt; Caja primero.
      </div>
      <div v-else class="space-y-4 pt-2">
        <div class="grid grid-cols-2 gap-3 text-sm p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
          <div><span class="text-surface-400">Turno:</span> #{{ turnoActivo.id }}</div>
          <div><span class="text-surface-400">Cajero:</span> {{ turnoActivo.usuario_nombre }}</div>
          <div><span class="text-surface-400">Inicio:</span> {{ $formatDateTime(turnoActivo.created_at) }}</div>
          <div><span class="text-surface-400">Monto inicial:</span> <strong>{{ $formatMoney(turnoActivo.monto_inicial || 0) }}</strong></div>
        </div>
        <div v-if="resumenCargando" class="text-center text-sm text-surface-400 py-4"><i class="pi pi-spin pi-spinner mr-2"></i>Calculando resumen...</div>
        <div v-else class="grid grid-cols-2 gap-3 text-sm">
          <div class="p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p class="text-xs text-green-600">Total cobrado en el turno</p>
            <p class="text-lg font-bold text-green-700">{{ $formatMoney(resumenVentas.total) }}</p>
            <p class="text-xs text-green-500">Efectivo: {{ $formatMoney(resumenVentas.efectivo) }} | Tarjeta: {{ $formatMoney(resumenVentas.tarjeta) }} | Transf: {{ $formatMoney(resumenVentas.transferencia) }}</p>
            <p class="text-xs font-semibold text-cyan-600 mt-1">Incluye {{ resumenVentas.cantidad_abonos_cxc }} abono(s) CxC: {{ $formatMoney(resumenVentas.abonos_cxc) }}</p>
            <p class="text-xs font-semibold text-violet-600 mt-1">Incluye {{ resumenVentas.cantidad_cobros_taller }} cobro(s) de taller: {{ $formatMoney(resumenVentas.cobros_taller) }}</p>
          </div>
          <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p class="text-xs text-red-600">Gastos del turno</p>
            <p class="text-lg font-bold text-red-700">{{ $formatMoney(resumenGastos) }}</p>
          </div>
        </div>
        <div class="border-t border-surface-200 dark:border-surface-700 pt-3">
          <div class="flex justify-between text-base font-bold">
            <span>Saldo final estimado</span>
            <span class="text-green-600">{{ $formatMoney(resumenVentas.total - resumenGastos + (turnoActivo.monto_inicial || 0)) }}</span>
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Observacion</label>
          <InputText v-model="observacion" placeholder="Notas del cuadre" fluid />
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Realizar Cuadre" icon="pi pi-check-circle" :loading="guardando" :disabled="!turnoActivo" @click="realizarCuadre" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { getSystemCurrencyCode, getSystemLocale } from '@/i18n/localeProfiles'
import { computed, ref, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Calendar from 'primevue/calendar'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import { resolvePrintableImage } from '@/services/printImageService'
import Swal from 'sweetalert2'

const toast = useToast()
const almacenStore = useAlmacenStore()

const loading = ref(true)
const cuadres = ref<any[]>([])
const dialogVisible = ref(false)
const guardando = ref(false)
const error = ref('')
const observacion = ref('')
const turnoActivo = ref<any>(null)
const resumenCargando = ref(false)
const resumenVentas = ref({ total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, abonos_cxc: 0, cantidad_abonos_cxc: 0, cobros_taller: 0, cantidad_cobros_taller: 0 })
const resumenGastos = ref(0)
const accionandoId = ref<number | null>(null)
const pdfGenerandoId = ref<number | null>(null)
const rangoFechas = ref<Date[]>([])

function fechaCuadre(cuadre: any): Date | null {
  const valor = String(cuadre.created_at || cuadre.fecha || '').trim()
  if (!valor) return null
  const fecha = new Date(valor.includes('T') ? valor : valor.replace(' ', 'T'))
  return Number.isNaN(fecha.getTime()) ? null : fecha
}

const cuadresFiltrados = computed(() => {
  const desdeSeleccionado = rangoFechas.value?.[0]
  if (!desdeSeleccionado) return cuadres.value
  const hastaSeleccionado = rangoFechas.value?.[1] || desdeSeleccionado
  const desde = new Date(desdeSeleccionado)
  const hasta = new Date(hastaSeleccionado)
  desde.setHours(0, 0, 0, 0)
  hasta.setHours(23, 59, 59, 999)
  return cuadres.value.filter((cuadre) => {
    const fecha = fechaCuadre(cuadre)
    return fecha ? fecha >= desde && fecha <= hasta : false
  })
})

const resumenFiltrado = computed(() => cuadresFiltrados.value.reduce((total, cuadre) => {
  total.totalCobrado += Number(cuadre.total_ventas || 0)
  total.efectivo += Number(cuadre.efectivo || 0)
  total.pagosBancarios += Number(cuadre.tarjeta || 0) + Number(cuadre.transferencia || 0)
  total.gastos += Number(cuadre.total_gastos || 0)
  total.saldoFinal += Number(cuadre.saldo_final || 0)
  return total
}, { totalCobrado: 0, efectivo: 0, pagosBancarios: 0, gastos: 0, saldoFinal: 0 }))

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function cargar() {
  loading.value = true
  try {
    const res = await window.db.getAll('cuadres')
    if (!res.success) throw new Error(res.error || 'No se pudieron cargar los cuadres')
    const almacenUid = String(almacenStore.activeUid || '')
    cuadres.value = (res.data || [])
      .filter((cuadre: any) => !almacenUid || !cuadre.almacen_uid || String(cuadre.almacen_uid) === almacenUid)
      .sort((a: any, b: any) => String(b.created_at || b.fecha || '').localeCompare(String(a.created_at || a.fecha || '')))
  } catch (e: any) {
    cuadres.value = []
    toast.add({ severity: 'error', summary: 'Error', detail: e?.message || 'No se pudieron cargar los cuadres', life: 4000 })
  } finally { loading.value = false }
}

useCloudRefresh(['cuadres'], cargar)

async function abrirNuevoCuadre() {
  error.value = ''
  observacion.value = ''
  resumenVentas.value = { total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, abonos_cxc: 0, cantidad_abonos_cxc: 0, cobros_taller: 0, cantidad_cobros_taller: 0 }
  resumenGastos.value = 0
  resumenCargando.value = true
  dialogVisible.value = true
  try {
    const [turnosRes, facturasRes, cuentasRes, tallerRes, gastosRes] = await Promise.all([
      window.db.getAll('caja_turnos'),
      window.db.getAll('facturas'),
      window.db.getAll('cuentas_cobrar'),
      window.db.getAll('ordenes_taller'),
      window.db.getAll('gastos'),
    ])
    const almacenUid = String(almacenStore.activeUid || '')
    turnoActivo.value = (turnosRes.success ? turnosRes.data || [] : [])
      .filter((turno: any) => String(turno.estado || '').toLowerCase() === 'abierto')
      .filter((turno: any) => !almacenUid || String(turno.almacen_uid || '') === almacenUid)
      .sort((a: any, b: any) => Number(b.id || 0) - Number(a.id || 0))[0] || null

    if (!turnoActivo.value) return
    const turnoId = Number(turnoActivo.value.id || 0)
    let total = 0
    let efectivo = 0
    let tarjeta = 0
    let transferencia = 0
    for (const factura of facturasRes.success ? facturasRes.data || [] : []) {
      if (Number(factura.turno_id || 0) !== turnoId || String(factura.estado_factura || '').toUpperCase() !== 'PAGADA') continue
      const metodo = String(factura.metodo_pago || '').toUpperCase()
      if (metodo.includes('CREDITO') || metodo.includes('CRÉDITO')) continue
      const monto = Number(factura.total || 0)
      total += monto
      let pagoEfectivo = Number(factura.efectivo || 0)
      let pagoTarjeta = Number(factura.tarjeta || 0)
      let pagoTransferencia = Number(factura.transferencia || 0)
      if (pagoEfectivo + pagoTarjeta + pagoTransferencia === 0) {
        if (metodo.includes('TARJETA')) pagoTarjeta = monto
        else if (metodo.includes('TRANSFERENCIA')) pagoTransferencia = monto
        else pagoEfectivo = monto
      }
      efectivo += pagoEfectivo
      tarjeta += pagoTarjeta
      transferencia += pagoTransferencia
    }

    let abonosCxc = 0
    let cantidadAbonosCxc = 0
    for (const cuenta of cuentasRes.success ? cuentasRes.data || [] : []) {
      let pagos: any[] = []
      try { pagos = Array.isArray(cuenta.pagos) ? cuenta.pagos : JSON.parse(cuenta.pagos || '[]') } catch {}
      for (const pago of pagos) {
        if (Number(pago.turno_id || 0) !== turnoId) continue
        const monto = Number(pago.monto || pago.cantidad || 0)
        const metodo = String(pago.metodo || pago.metodo_pago || 'EFECTIVO').toUpperCase()
        if (metodo.includes('TARJETA')) tarjeta += monto
        else if (metodo.includes('TRANSFERENCIA')) transferencia += monto
        else efectivo += monto
        total += monto
        abonosCxc += monto
        cantidadAbonosCxc++
      }
    }

    let cobrosTaller = 0
    let cantidadCobrosTaller = 0
    for (const orden of tallerRes.success ? tallerRes.data || [] : []) {
      let pagos: any[] = []
      try { pagos = Array.isArray(orden.pagos) ? orden.pagos : JSON.parse(orden.pagos || '[]') } catch {}
      for (const pago of pagos) {
        if (Number(pago.turno_id || 0) !== turnoId) continue
        const monto = Number(pago.monto || pago.cantidad || 0)
        const metodo = String(pago.metodo || pago.metodo_pago || orden.metodo_pago || 'EFECTIVO').toUpperCase()
        if (metodo.includes('TARJETA')) tarjeta += monto
        else if (metodo.includes('TRANSFERENCIA')) transferencia += monto
        else efectivo += monto
        total += monto
        cobrosTaller += monto
        cantidadCobrosTaller++
      }
    }
    resumenVentas.value = { total, efectivo, tarjeta, transferencia, abonos_cxc: abonosCxc, cantidad_abonos_cxc: cantidadAbonosCxc, cobros_taller: cobrosTaller, cantidad_cobros_taller: cantidadCobrosTaller }
    resumenGastos.value = (gastosRes.success ? gastosRes.data || [] : [])
      .filter((gasto: any) => Number(gasto.turno_id || 0) === turnoId)
      .reduce((sum: number, gasto: any) => sum + Number(gasto.cantidad || 0), 0)
  } catch (e: any) {
    turnoActivo.value = null
    error.value = e?.message || 'No se pudo calcular el cuadre'
  }
  finally { resumenCargando.value = false }
}

async function realizarCuadre() {
  if (!turnoActivo.value) { error.value = 'No hay turno activo'; return }
  guardando.value = true; error.value = ''
  try {
    const ahora = new Date()
    const res = await window.db.insert('cuadres', {
      turno_id: turnoActivo.value.id,
      turno_usuario: turnoActivo.value.usuario_nombre || '',
      fecha: ahora.toISOString().split('T')[0],
      monto_inicial: turnoActivo.value.monto_inicial || 0,
      total_ventas: resumenVentas.value.total,
      efectivo: resumenVentas.value.efectivo,
      tarjeta: resumenVentas.value.tarjeta,
      transferencia: resumenVentas.value.transferencia,
      abonos_cxc: resumenVentas.value.abonos_cxc,
      cantidad_abonos_cxc: resumenVentas.value.cantidad_abonos_cxc,
      total_gastos: resumenGastos.value,
      saldo_final: resumenVentas.value.total - resumenGastos.value + (turnoActivo.value.monto_inicial || 0),
      observacion: observacion.value,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    })
    if (!res.success) throw new Error(res.error)
    const cuadreId = Number(res.data?.id || 0)
    if (!cuadreId) throw new Error('El cuadre se guardo sin un identificador valido')
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Cuadre guardado', detail: 'El cuadre se guardo en TM Cloud', life: 3000 })
    await cargar()
  } catch (e: any) { error.value = e.message || 'Error al realizar cuadre' }
  finally { guardando.value = false }
}

function escapeHtml(s: any): string {
  return String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
}

function moneyHtml(n: number): string {
  return `${getSystemCurrencyCode()} ${formatCurrency(Number(n || 0))}`
}

function dateHtml(d: any): string {
  if (!d) return '-'
  const date = new Date(String(d).replace(' ', 'T'))
  return date.toLocaleDateString(getSystemLocale(), { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function nombreArchivoSeguro(value: any): string {
  return String(value || 'cuadre').replace(/[^a-z0-9_.-]+/gi, '_')
}

function buildCuadrePdfHtml(cuadre: any, empresa: any, logo: string): string {
  const cobrado = Number(cuadre.total_ventas || 0)
  const inicial = Number(cuadre.monto_inicial || 0)
  const gastos = Number(cuadre.total_gastos || 0)
  const saldoCalculado = inicial + cobrado - gastos
  const saldoRegistrado = Number(cuadre.saldo_final ?? saldoCalculado)
  const diferencia = saldoRegistrado - saldoCalculado
  const metodos = [
    { nombre: 'Efectivo', valor: Number(cuadre.efectivo || 0), color: '#059669', fondo: '#ecfdf5' },
    { nombre: 'Tarjeta', valor: Number(cuadre.tarjeta || 0), color: '#2563eb', fondo: '#eff6ff' },
    { nombre: 'Transferencia', valor: Number(cuadre.transferencia || 0), color: '#7c3aed', fondo: '#f5f3ff' },
  ]
  const metodosHtml = metodos.map(item => {
    const porcentaje = cobrado > 0 ? (item.valor / cobrado) * 100 : 0
    return `<div class="method"><div class="method-icon" style="background:${item.fondo};color:${item.color}">${escapeHtml(item.nombre.slice(0, 1))}</div><div class="method-data"><span>${escapeHtml(item.nombre)}</span><strong>${moneyHtml(item.valor)}</strong><small>${porcentaje.toFixed(1)}% del total cobrado</small></div></div>`
  }).join('')
  const almacenNombre = empresa.nombre || empresa.legal || almacenStore.activeAlmacen?.nombre || 'TMPOS SRL'
  const contacto = [empresa.telefono, empresa.email].filter(Boolean).map(escapeHtml).join(' &nbsp;•&nbsp; ')
  const direccion = escapeHtml(empresa.direccion || '')
  const logoHtml = logo ? `<img class="logo" src="${escapeHtml(logo)}" alt="Logo">` : `<div class="logo-placeholder">TM</div>`

  return `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>
    @page{size:letter;margin:12mm}*{box-sizing:border-box}body{margin:0;background:#fff;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:11px;line-height:1.45;-webkit-print-color-adjust:exact;print-color-adjust:exact}.page{width:100%;max-width:190mm;margin:0 auto}.header{display:flex;align-items:center;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #0f766e}.brand{display:flex;align-items:center;gap:13px}.logo,.logo-placeholder{width:58px;height:58px;object-fit:contain;border-radius:12px}.logo-placeholder{display:grid;place-items:center;background:#0f766e;color:#fff;font-size:20px;font-weight:800}.company h1{font-size:20px;margin:0 0 3px;color:#0f172a}.company p{margin:1px 0;color:#64748b;font-size:10px}.document{text-align:right}.document .eyebrow{color:#0f766e;font-weight:800;font-size:10px;letter-spacing:1.3px}.document h2{margin:3px 0;font-size:23px;color:#0f172a}.document .number{display:inline-block;background:#e6fffa;color:#0f766e;border:1px solid #99f6e4;border-radius:999px;padding:4px 10px;font-weight:700}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin:16px 0}.meta-item{border:1px solid #e2e8f0;border-radius:9px;padding:9px 10px}.meta-item span,.card span,.method-data span{display:block;color:#64748b;font-size:9px;text-transform:uppercase;letter-spacing:.6px}.meta-item strong{display:block;margin-top:3px;font-size:11px;color:#0f172a}.cards{display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin:14px 0}.card{padding:14px;border-radius:11px;border:1px solid #dbe4ee;background:#f8fafc}.card strong{display:block;margin-top:5px;font-size:19px;color:#0f172a}.card.positive{border-color:#a7f3d0;background:#ecfdf5}.card.positive strong{color:#047857}.card.negative{border-color:#fecaca;background:#fef2f2}.card.negative strong{color:#b91c1c}.section{margin-top:17px}.section-title{display:flex;align-items:center;gap:8px;margin:0 0 8px;font-size:12px;color:#0f172a;text-transform:uppercase;letter-spacing:.7px}.section-title:after{content:'';height:1px;background:#e2e8f0;flex:1}.methods{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}.method{display:flex;align-items:center;gap:9px;padding:11px;border:1px solid #e2e8f0;border-radius:10px}.method-icon{width:29px;height:29px;display:grid;place-items:center;border-radius:8px;font-weight:800}.method-data{min-width:0}.method-data strong{display:block;font-size:12px;margin:1px 0}.method-data small{color:#94a3b8;font-size:8.5px}.body-grid{display:grid;grid-template-columns:1.25fr .75fr;gap:12px}.panel{border:1px solid #dbe4ee;border-radius:11px;overflow:hidden}.line{display:flex;justify-content:space-between;gap:10px;padding:9px 12px;border-bottom:1px solid #edf2f7}.line:last-child{border-bottom:0}.line.total{background:#0f172a;color:#fff;font-size:13px;font-weight:800}.line.danger strong{color:#b91c1c}.note{min-height:100%;padding:12px;background:#fffbeb;border:1px solid #fde68a;border-radius:11px}.note span{display:block;color:#92400e;font-size:9px;text-transform:uppercase;font-weight:700;letter-spacing:.7px;margin-bottom:6px}.note p{margin:0;color:#451a03;white-space:pre-wrap}.difference{margin-top:10px;padding:8px 11px;border-radius:8px;background:${Math.abs(diferencia) < 0.01 ? '#ecfdf5' : '#fff7ed'};color:${Math.abs(diferencia) < 0.01 ? '#047857' : '#c2410c'};font-weight:700;display:flex;justify-content:space-between}.signatures{display:grid;grid-template-columns:1fr 1fr;gap:55px;margin-top:48px}.signature{border-top:1px solid #64748b;padding-top:6px;text-align:center;color:#475569}.footer{margin-top:25px;padding-top:9px;border-top:1px solid #e2e8f0;color:#94a3b8;font-size:8.5px;display:flex;justify-content:space-between}
  </style></head><body><main class="page">
    <header class="header"><div class="brand">${logoHtml}<div class="company"><h1>${escapeHtml(almacenNombre)}</h1><p>${direccion}</p><p>${contacto}</p></div></div><div class="document"><div class="eyebrow">REPORTE DE CONTROL</div><h2>Cuadre de caja</h2><span class="number">No. ${escapeHtml(cuadre.id)}</span></div></header>
    <section class="meta"><div class="meta-item"><span>Fecha del cuadre</span><strong>${escapeHtml(dateHtml(cuadre.created_at || cuadre.fecha))}</strong></div><div class="meta-item"><span>Cajero responsable</span><strong>${escapeHtml(cuadre.turno_usuario || 'Sin especificar')}</strong></div><div class="meta-item"><span>Turno</span><strong>#${escapeHtml(cuadre.turno_id || '-')}</strong></div><div class="meta-item"><span>Almacen</span><strong>${escapeHtml(almacenNombre)}</strong></div></section>
    <section class="cards"><div class="card positive"><span>Total cobrado</span><strong>${moneyHtml(cobrado)}</strong></div><div class="card negative"><span>Gastos del turno</span><strong>${moneyHtml(gastos)}</strong></div><div class="card"><span>Saldo final esperado</span><strong>${moneyHtml(saldoRegistrado)}</strong></div></section>
    <section class="section"><h3 class="section-title">Distribucion de cobros</h3><div class="methods">${metodosHtml}</div></section>
    <section class="section"><h3 class="section-title">Conciliacion del turno</h3><div class="body-grid"><div class="panel"><div class="line"><span>Fondo inicial</span><strong>${moneyHtml(inicial)}</strong></div><div class="line"><span>Total cobrado</span><strong>${moneyHtml(cobrado)}</strong></div><div class="line"><span>Abonos de cuentas por cobrar (${Number(cuadre.cantidad_abonos_cxc || 0)})</span><strong>${moneyHtml(cuadre.abonos_cxc)}</strong></div><div class="line danger"><span>Menos: gastos</span><strong>-${moneyHtml(gastos)}</strong></div><div class="line total"><span>SALDO FINAL</span><strong>${moneyHtml(saldoRegistrado)}</strong></div></div><div class="note"><span>Observaciones</span><p>${escapeHtml(cuadre.observacion || 'Sin observaciones registradas.')}</p></div></div><div class="difference"><span>Diferencia de conciliacion</span><span>${moneyHtml(diferencia)}</span></div></section>
    <section class="signatures"><div class="signature">Firma del cajero</div><div class="signature">Firma del supervisor</div></section>
    <footer class="footer"><span>Generado por TMPOS SRL</span><span>${escapeHtml(new Date().toLocaleString(getSystemLocale()))}</span></footer>
  </main></body></html>`
}

async function generarPdfCuadre(cuadre: any) {
  pdfGenerandoId.value = cuadre.id
  try {
    const empresaRes = await window.db.getAll('empresa')
    const empresas = empresaRes.success && Array.isArray(empresaRes.data) ? empresaRes.data : []
    const empresa = empresas.find((item: any) => String(item.uid || item.almacen_uid || '') === String(cuadre.almacen_uid || almacenStore.activeUid || ''))
      || empresas.find((item: any) => Number(item.almacen_id || item.id) === Number(cuadre.almacen_id || almacenStore.activeId || 0))
      || empresas[0]
      || {}
    const logo = await resolvePrintableImage(empresa.logoprinter || empresa.logo)
    const archivo = `Cuadre_Caja_${nombreArchivoSeguro(cuadre.id)}_${nombreArchivoSeguro(cuadre.fecha || '')}.pdf`
    const resultado = await window.electron.invoke('generate:pdf', buildCuadrePdfHtml(cuadre, empresa, logo), archivo) as { success: boolean; dataUrl?: string; error?: string }
    if (!resultado.success || !resultado.dataUrl) throw new Error(resultado.error || 'No se pudo generar el PDF')

    const decision = await Swal.fire({
      title: `Cuadre de caja #${escapeHtml(cuadre.id)}`,
      html: `<iframe src="${resultado.dataUrl}" style="width:100%;height:75vh;border:0;border-radius:8px;background:#fff"></iframe>`,
      width: '92vw',
      padding: '1rem',
      showCancelButton: true,
      confirmButtonText: '<i class="pi pi-download"></i> Descargar PDF',
      cancelButtonText: 'Cerrar',
      focusConfirm: false,
    })
    if (decision.isConfirmed) {
      const guardado = await window.electron.invoke('save:pdf', resultado.dataUrl, archivo) as { success: boolean; error?: string }
      if (!guardado.success) throw new Error(guardado.error || 'No se pudo guardar el PDF')
      toast.add({ severity: 'success', summary: 'PDF guardado', detail: 'El cuadre se descargo correctamente', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error al generar PDF', detail: error?.message || 'No se pudo generar el documento', life: 4500 })
  } finally {
    pdfGenerandoId.value = null
  }
}

async function reimprimirCuadre(cuadre: any) {
  accionandoId.value = cuadre.id
  try {
    const [empresaRes, impresoraRes] = await Promise.all([
      window.db.getAll('empresa'),
      window.db.getAll('impresoras_config'),
    ])
    const empresa = empresaRes.success ? empresaRes.data?.[0] || {} : {}
    const impresora = impresoraRes.success ? impresoraRes.data?.[0] || {} : {}

    const ticket = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
    @page{size:72mm auto;margin:0}*{box-sizing:border-box}html,body{width:72mm;margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;padding:2.5mm;color:#000;font-size:10.5px;font-weight:500;line-height:1.4;-webkit-font-smoothing:none;text-rendering:geometricPrecision;overflow:hidden}
    h1{font-size:17px;margin:0;text-align:center;font-weight:800}h2{font-size:12px;margin:10px 0 4px;padding-bottom:3px;border-bottom:1.5px dashed #222;font-weight:800}
    .center{text-align:center}.muted{color:#222}.row{display:flex;justify-content:space-between;gap:8px;padding:2.5px 0}.row span:last-child,.row strong:last-child{text-align:right}
    .total{font-size:14px;font-weight:700;border-top:2px solid #111;border-bottom:2px solid #111;margin-top:4px;padding:6px 0}
    .footer{text-align:center;margin-top:12px;border-top:1px dashed #222;padding-top:8px;font-size:9px}
  </style></head><body>
    <h1>${escapeHtml(empresa.nombre || empresa.legal || 'TMPOS SRL')}</h1>
    <div class="center muted">${escapeHtml(empresa.legal || '')}</div>
    <h2>CUADRE DE CAJA</h2>
    <div class="row"><span>Cuadre</span><strong>#${escapeHtml(cuadre.id)}</strong></div>
    <div class="row"><span>Cajero</span><strong>${escapeHtml(cuadre.turno_usuario || '')}</strong></div>
    <div class="row"><span>Fecha</span><span>${dateHtml(cuadre.created_at)}</span></div>
    <h2>RESUMEN</h2>
    <div class="row"><span>Fondo inicial</span><span>${moneyHtml(cuadre.monto_inicial)}</span></div>
    <div class="row"><span>Ventas</span><span>${moneyHtml(cuadre.total_ventas)}</span></div>
    <div class="row"><span>Abonos CxC (${Number(cuadre.cantidad_abonos_cxc || 0)})</span><span>${moneyHtml(cuadre.abonos_cxc)}</span></div>
    <div class="row"><span>Efectivo</span><span>${moneyHtml(cuadre.efectivo)}</span></div>
    <div class="row"><span>Tarjeta</span><span>${moneyHtml(cuadre.tarjeta)}</span></div>
    <div class="row"><span>Transferencia</span><span>${moneyHtml(cuadre.transferencia)}</span></div>
    <div class="row"><span>Gastos</span><span>-${moneyHtml(cuadre.total_gastos)}</span></div>
    <div class="row total"><span>SALDO FINAL</span><span>${moneyHtml(cuadre.saldo_final)}</span></div>
    ${cuadre.observacion ? `<h2>OBSERVACION</h2><div>${escapeHtml(cuadre.observacion)}</div>` : ''}
    <div class="footer">Documento generado por TMPOS SRL</div>
  </body></html>`

    const res = await (window as any).electron.invoke('print:ticket', ticket, impresora.printer_name || undefined)
    if (res?.success) {
      toast.add({ severity: 'success', summary: 'Impreso', detail: 'Ticket enviado a la impresora', life: 3000 })
    } else {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: res?.error || 'No se pudo imprimir', life: 5000 })
    }
  } finally {
    accionandoId.value = null
  }
}

async function enviarCuadreCorreo(cuadre: any) {
  accionandoId.value = cuadre.id
  try {
    const [empresaRes] = await Promise.all([
      window.db.getAll('empresa'),
    ])
    const empresa = empresaRes.success ? empresaRes.data?.[0] || {} : {}
    const empresaNombre = escapeHtml(empresa.nombre || empresa.legal || 'TMPOS SRL')

    const emailHtml = `<!DOCTYPE html><html><head><meta charset="utf-8"></head><body style="margin:0;background:#f3f4f6;font-family:Arial,sans-serif;color:#111827">
    <div style="max-width:760px;margin:0 auto;padding:24px">
      <div style="background:#064e3b;color:#fff;padding:28px;border-radius:14px 14px 0 0">
        <div style="font-size:13px;opacity:.8;letter-spacing:1px">REPORTE OFICIAL</div>
        <h1 style="margin:6px 0 4px;font-size:28px">Cuadre de caja #${escapeHtml(cuadre.id)}</h1>
        <div>${empresaNombre}</div>
      </div>
      <div style="background:#fff;padding:26px;border-radius:0 0 14px 14px;box-shadow:0 8px 25px rgba(0,0,0,.08)">
        <table style="width:100%;margin-bottom:20px"><tr>
          <td><div style="color:#6b7280;font-size:12px">CAJERO</div><strong>${escapeHtml(cuadre.turno_usuario || '')}</strong></td>
          <td><div style="color:#6b7280;font-size:12px">FECHA</div><strong>${dateHtml(cuadre.created_at)}</strong></td>
        </tr></table>
        <table style="width:100%;border-spacing:8px"><tr>
          <td style="background:#ecfdf5;padding:16px;border-radius:10px"><div style="font-size:12px;color:#047857">VENTAS</div><strong style="font-size:20px">${moneyHtml(cuadre.total_ventas)}</strong></div></td>
          <td style="background:#eff6ff;padding:16px;border-radius:10px"><div style="font-size:12px;color:#1d4ed8">SALDO FINAL</div><strong style="font-size:20px">${moneyHtml(cuadre.saldo_final)}</strong></td>
        </tr></table>
        <table style="width:100%;border-collapse:collapse">
          <tr><td style="padding:7px">Fondo inicial</td><td style="text-align:right">${moneyHtml(cuadre.monto_inicial)}</td></tr>
          <tr><td style="padding:7px">Ingresos en efectivo</td><td style="text-align:right">${moneyHtml(cuadre.efectivo)}</td></tr>
          <tr><td style="padding:7px">Abonos CxC (${Number(cuadre.cantidad_abonos_cxc || 0)})</td><td style="text-align:right">${moneyHtml(cuadre.abonos_cxc)}</td></tr>
          <tr><td style="padding:7px">Tarjeta</td><td style="text-align:right">${moneyHtml(cuadre.tarjeta)}</td></tr>
          <tr><td style="padding:7px">Transferencia</td><td style="text-align:right">${moneyHtml(cuadre.transferencia)}</td></tr>
          <tr><td style="padding:7px">Gastos</td><td style="text-align:right;color:#b91c1c">-${moneyHtml(cuadre.total_gastos)}</td></tr>
          <tr><td style="padding:7px;font-weight:bold;border-top:2px solid #111">Saldo final</td><td style="text-align:right;font-weight:bold;border-top:2px solid #111">${moneyHtml(cuadre.saldo_final)}</td></tr>
        </table>
        ${cuadre.observacion ? `<div style="margin-top:20px;padding:14px;background:#fffbeb;border-left:4px solid #f59e0b"><strong>Observacion:</strong> ${escapeHtml(cuadre.observacion)}</div>` : ''}
        <div style="margin-top:28px;padding-top:18px;border-top:1px solid #e5e7eb;color:#6b7280;font-size:12px;text-align:center">Reporte generado automaticamente por TMPOS SRL.</div>
      </div>
    </div>
  </body></html>`

    const res = await (window as any).electron.invoke('enviar:cierreCaja', {
      toEmail: empresa.email || '',
      subject: `Cuadre de caja #${cuadre.id} - ${empresaNombre}`,
      html: emailHtml,
      data: {
        company_name: String(empresa.nombre || empresa.legal || 'TMPOS SRL'),
        company_legal_name: String(empresa.legal || ''),
        company_rnc: String(empresa.rnc || ''),
        company_phone: String(empresa.telefono || ''),
        company_address: String(empresa.direccion || ''),
        shift_id: Number(cuadre.turno_id || cuadre.id || 0),
        cashier: String(cuadre.turno_usuario || 'Usuario'),
        opened_at: String(cuadre.created_at || cuadre.fecha || ''),
        closed_at: String(cuadre.created_at || cuadre.fecha || ''),
        opening_amount: Number(cuadre.monto_inicial || 0),
        sales_total: Number(cuadre.total_ventas || 0),
        cash_sales: Number(cuadre.efectivo || 0),
        card_sales: Number(cuadre.tarjeta || 0),
        transfer_sales: Number(cuadre.transferencia || 0),
        receivables_payments_count: Number(cuadre.cantidad_abonos_cxc || 0),
        receivables_payments_total: Number(cuadre.abonos_cxc || 0),
        credit_payments_count: Number(cuadre.cantidad_abonos_cxc || 0),
        credit_payments_total: Number(cuadre.abonos_cxc || 0),
        workshop_payments_count: Number(cuadre.cantidad_cobros_taller || 0),
        workshop_payments_total: Number(cuadre.cobros_taller || 0),
        expenses_total: Number(cuadre.total_gastos || 0),
        expected_cash: Number(cuadre.efectivo_esperado ?? cuadre.saldo_final ?? 0),
        counted_cash: Number(cuadre.efectivo_contado ?? cuadre.saldo_final ?? 0),
        difference: Number(cuadre.diferencia || 0),
        observation: String(cuadre.observacion || ''),
        sales: [],
        receivables: [],
        receivables_payments: [],
        credit_payments: [],
        workshop_payments: [],
        expenses: [],
        movements: [],
        cash_count: [],
      },
    })
    if (res?.success) {
      toast.add({ severity: 'success', summary: 'Enviado', detail: `Reporte enviado a ${res.toEmail || 'la empresa'}`, life: 4000 })
    } else {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: res?.error || 'No se pudo enviar el correo', life: 5000 })
    }
  } finally {
    accionandoId.value = null
  }
}

onMounted(async () => {
  await almacenStore.load()
  await cargar()
})

watch(
  () => [almacenStore.activeUid, almacenStore.activeId],
  () => {
    turnoActivo.value = null
    cargar()
  },
)
</script>

<style scoped>
.cuadre-summary-card {
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.95rem 1rem;
  border: 1px solid var(--p-surface-200);
  border-radius: 0.85rem;
  background: var(--p-surface-0);
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.04);
}

.cuadre-summary-card--featured {
  border-color: color-mix(in srgb, var(--p-primary-500) 32%, var(--p-surface-200));
}

.cuadre-summary-icon {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  flex: 0 0 2.4rem;
  border-radius: 0.7rem;
  color: var(--p-primary-600);
  background: var(--p-surface-100);
  font-size: 1rem;
}

.cuadre-summary-label {
  margin: 0;
  color: var(--p-surface-500);
  font-size: 0.7rem;
  font-weight: 700;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.cuadre-summary-value {
  margin: 0.18rem 0 0;
  color: var(--p-surface-900);
  font-size: clamp(1rem, 1.3vw, 1.25rem);
  font-weight: 800;
  line-height: 1.2;
  white-space: nowrap;
}

.cuadre-summary-detail {
  margin: 0.2rem 0 0;
  overflow: hidden;
  color: var(--p-surface-400);
  font-size: 0.7rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .cuadre-summary-card {
  border-color: var(--p-surface-700);
  background: var(--p-surface-900);
}

:global(.dark) .cuadre-summary-card--featured {
  border-color: color-mix(in srgb, var(--p-primary-400) 42%, var(--p-surface-700));
}

:global(.dark) .cuadre-summary-icon {
  color: var(--p-primary-300);
  background: var(--p-surface-800);
}

:global(.dark) .cuadre-summary-value {
  color: var(--p-surface-0);
}
</style>
