<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Tag from 'primevue/tag'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import TicketCuentaCobrarPrint from './TicketCuentaCobrarPrint.vue'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { useEmpresa } from '@/composables/useEmpresa'
import { resolvePrintableImage } from '@/services/printImageService'
import { useAlmacenStore } from '@/stores/almacen.store'

const route = useRoute()
const router = useRouter()
const toast = useToast()
const { currency, locale } = useLocaleProfile()
const { empresa, cargar: cargarEmpresa } = useEmpresa()
const almacenStore = useAlmacenStore()

const factura = ref<any>(null)
const cuenta = ref<any>(null)
const loading = ref(true)
const guardandoAbono = ref(false)
const abono = ref(0)
const metodoAbono = ref('EFECTIVO')
const bancos = ref<any[]>([])
const bancoAbonoSeleccionado = ref<number | null>(null)
const cargandoBancos = ref(false)
const metodosAbono = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Tarjeta', value: 'TARJETA' },
]
const dialogWhatsapp = ref(false)
const whatsapp = ref('')
const guardandoWhatsapp = ref(false)
const dialogEditarAbono = ref(false)
const dialogEliminarAbono = ref(false)
const abonoSeleccionadoIndex = ref(-1)
const guardandoCambioAbono = ref(false)
const abonoEditado = ref({ monto: 0, fecha: '', hora: '', metodo: '', nota: '', banco_id: null as number | null })
const ticketRef = ref<any>(null)
const dialogPdf = ref(false)
const pdfDataUrl = ref('')
const pdfNombre = ref('')

const bancoAbonoInfo = computed(() => bancos.value.find((banco: any) => Number(banco.id) === Number(bancoAbonoSeleccionado.value)) || null)
const bancoEditadoInfo = computed(() => bancos.value.find((banco: any) => Number(banco.id) === Number(abonoEditado.value.banco_id)) || null)

async function cargarBancos() {
  cargandoBancos.value = true
  try {
    const res = await window.db.getAll('bancos')
    if (!res.success) throw new Error(res.error || 'No se pudieron cargar los bancos')
    bancos.value = (res.data || [])
      .filter((banco: any) => banco.activo === undefined || Number(banco.activo) !== 0)
      .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
  } catch (error: any) {
    bancos.value = []
    toast.add({ severity: 'error', summary: 'Bancos', detail: error?.message || 'No se pudieron cargar los bancos', life: 3000 })
  } finally {
    cargandoBancos.value = false
  }
}

function bancoDePago(pago: any): any | null {
  return bancos.value.find((banco: any) =>
    (pago?.banco_uid && String(banco.uid || '') === String(pago.banco_uid)) ||
    Number(banco.id) === Number(pago?.banco_id)
  ) || null
}

async function aplicarAjustesBancarios(ajustes: Array<{ banco: any; delta: number }>): Promise<Array<{ banco: any; saldo: number }>> {
  const consolidados = new Map<number, { banco: any; delta: number }>()
  for (const ajuste of ajustes) {
    if (!ajuste.banco?.id || Math.abs(Number(ajuste.delta || 0)) < 0.001) continue
    const id = Number(ajuste.banco.id)
    const actual = consolidados.get(id)
    consolidados.set(id, { banco: ajuste.banco, delta: Number(actual?.delta || 0) + Number(ajuste.delta || 0) })
  }
  const anteriores: Array<{ banco: any; saldo: number }> = []
  try {
    for (const { banco, delta } of consolidados.values()) {
      if (Math.abs(delta) < 0.001) continue
      const saldo = Number(banco.saldo || 0)
      const ahora = new Date().toISOString()
      const res = await window.db.update('bancos', banco.id, { saldo: saldo + delta, fecha_transaccion: ahora, updated_at: ahora })
      if (!res.success) throw new Error(res.error || `No se pudo actualizar ${banco.nombre}`)
      anteriores.push({ banco, saldo })
      banco.saldo = saldo + delta
    }
    return anteriores
  } catch (error) {
    await revertirAjustesBancarios(anteriores)
    throw error
  }
}

async function revertirAjustesBancarios(anteriores: Array<{ banco: any; saldo: number }>) {
  for (const { banco, saldo } of [...anteriores].reverse()) {
    const ahora = new Date().toISOString()
    await window.db.update('bancos', banco.id, { saldo, fecha_transaccion: ahora, updated_at: ahora })
    banco.saldo = saldo
  }
}

const pagos = computed<any[]>(() => {
  try {
    const parsed = JSON.parse(cuenta.value?.pagos || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})

const productos = computed<any[]>(() => {
  try {
    const parsed = typeof factura.value?.productos === 'string'
      ? JSON.parse(factura.value.productos || '[]')
      : factura.value?.productos
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
})

const porcentajePagado = computed(() => {
  const total = Number(cuenta.value?.total || 0)
  return total > 0 ? Math.min(100, Math.max(0, Number(cuenta.value?.abonado || 0) / total * 100)) : 0
})

function formatMoney(value: any): string {
  return new Intl.NumberFormat(locale.value, { style: 'currency', currency: currency.value }).format(Number(value || 0))
}

function valoresUnicos(valorPlural: any, valorSingular: any): string[] {
  const valores = Array.isArray(valorPlural) && valorPlural.length ? valorPlural : (valorSingular ? [valorSingular] : [])
  return [...new Set(valores.map((v: any) => String(v || '').trim()).filter(Boolean))]
}

function detalleVarianteProducto(prod: any): string {
  const imeis = valoresUnicos(prod?.imeis, prod?.imei)
  const seriales = valoresUnicos(prod?.seriales, prod?.serial)
  const capacidades = valoresUnicos(prod?.capacidades, prod?.capacidad)
  const colores = valoresUnicos(prod?.colores, prod?.color)
  return [
    imeis.length ? `IMEI: ${imeis.join(', ')}` : '',
    seriales.length ? `Serial: ${seriales.join(', ')}` : '',
    capacidades.length ? `Capacidad: ${capacidades.join(', ')}` : '',
    colores.length ? `Color: ${colores.join(', ')}` : '',
  ].filter(Boolean).join(' · ')
}

function estadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' {
  if (estado === 'PAGADA') return 'success'
  if (estado === 'VENCIDA') return 'danger'
  if (estado === 'ACTIVA') return 'warn'
  return 'info'
}

function montoPago(pago: any): number {
  return Number(pago?.monto ?? pago?.cantidad ?? 0)
}

function abrirEditarAbono(pago: any, index: number) {
  const metodoGuardado = String(pago?.metodo || '').toUpperCase()
  abonoSeleccionadoIndex.value = index
  abonoEditado.value = {
    monto: montoPago(pago),
    fecha: String(pago?.fecha || ''),
    hora: String(pago?.hora || ''),
    metodo: metodosAbono.some(item => item.value === metodoGuardado) ? metodoGuardado : 'EFECTIVO',
    nota: String(pago?.nota || ''),
    banco_id: pago?.banco_id ? Number(pago.banco_id) : bancoDePago(pago)?.id || null,
  }
  dialogEditarAbono.value = true
}

function confirmarEliminarAbono(index: number) {
  abonoSeleccionadoIndex.value = index
  dialogEliminarAbono.value = true
}

async function guardarHistorialAbonos(historial: any[], mensaje: string) {
  historial.forEach((pago: any, index: number) => { pago.nopago = index + 1 })
  const abonado = historial.reduce((total: number, pago: any) => total + montoPago(pago), 0)
  const saldo = Math.max(0, Number(cuenta.value.total || 0) - abonado)
  const estado = saldo <= 0 ? 'PAGADA' : 'ACTIVA'
  const res = await window.db.update('cuentas_cobrar', cuenta.value.id, {
    abonado,
    saldo,
    estado,
    pagos: JSON.stringify(historial),
  })
  if (!res.success) throw new Error(res.error || 'No se pudo actualizar el historial de abonos')
  cuenta.value = { ...cuenta.value, abonado, saldo, estado, pagos: JSON.stringify(historial) }
  toast.add({ severity: 'success', summary: mensaje, detail: `Saldo pendiente: ${formatMoney(saldo)}`, life: 3000 })
}

async function actualizarAbono() {
  const index = abonoSeleccionadoIndex.value
  const monto = Number(abonoEditado.value.monto || 0)
  if (index < 0 || monto <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El monto del abono debe ser mayor que cero', life: 2500 })
    return
  }
  const historial = pagos.value.map((pago: any) => ({ ...pago }))
  if (!historial[index]) return
  const abonadoSinActual = historial.reduce((total: number, pago: any, posicion: number) =>
    posicion === index ? total : total + montoPago(pago), 0)
  if (abonadoSinActual + monto > Number(cuenta.value.total || 0)) {
    toast.add({ severity: 'warn', summary: 'Monto excedido', detail: 'La suma de los abonos no puede superar el total de la cuenta', life: 3000 })
    return
  }
  if (abonoEditado.value.metodo === 'TRANSFERENCIA' && !bancoEditadoInfo.value) {
    toast.add({ severity: 'warn', summary: 'Banco requerido', detail: 'Selecciona el banco que recibio la transferencia', life: 3000 })
    return
  }

  guardandoCambioAbono.value = true
  let ajustesAplicados: Array<{ banco: any; saldo: number }> = []
  try {
    const pagoAnterior = historial[index]
    const bancoAnterior = String(pagoAnterior.metodo || pagoAnterior.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA' ? bancoDePago(pagoAnterior) : null
    const bancoNuevo = abonoEditado.value.metodo === 'TRANSFERENCIA' ? bancoEditadoInfo.value : null
    historial[index] = {
      ...historial[index],
      monto,
      cantidad: monto,
      fecha: abonoEditado.value.fecha,
      hora: abonoEditado.value.hora,
      metodo: abonoEditado.value.metodo.trim() || 'ABONO',
      nota: abonoEditado.value.nota.trim(),
      banco_id: bancoNuevo ? Number(bancoNuevo.id) : 0,
      banco_uid: bancoNuevo ? String(bancoNuevo.uid || '') : '',
      banco_nombre: bancoNuevo ? String(bancoNuevo.nombre || '') : '',
      banco_numero_cuenta: bancoNuevo ? String(bancoNuevo.numero_cuenta || '') : '',
    }
    ajustesAplicados = await aplicarAjustesBancarios([
      { banco: bancoAnterior, delta: -montoPago(pagoAnterior) },
      { banco: bancoNuevo, delta: monto },
    ])
    await guardarHistorialAbonos(historial, 'Abono actualizado')
    dialogEditarAbono.value = false
  } catch (error: any) {
    if (ajustesAplicados.length) await revertirAjustesBancarios(ajustesAplicados)
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo editar el abono', life: 3500 })
  } finally {
    guardandoCambioAbono.value = false
  }
}

async function eliminarAbono() {
  const index = abonoSeleccionadoIndex.value
  if (index < 0) return
  const historial = pagos.value.map((pago: any) => ({ ...pago }))
  if (!historial[index]) return
  guardandoCambioAbono.value = true
  let ajustesAplicados: Array<{ banco: any; saldo: number }> = []
  try {
    const pagoEliminado = historial[index]
    const banco = String(pagoEliminado.metodo || pagoEliminado.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA' ? bancoDePago(pagoEliminado) : null
    historial.splice(index, 1)
    ajustesAplicados = await aplicarAjustesBancarios([{ banco, delta: -montoPago(pagoEliminado) }])
    await guardarHistorialAbonos(historial, 'Abono eliminado')
    dialogEliminarAbono.value = false
  } catch (error: any) {
    if (ajustesAplicados.length) await revertirAjustesBancarios(ajustesAplicados)
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo eliminar el abono', life: 3500 })
  } finally {
    guardandoCambioAbono.value = false
  }
}

function escapeHtml(value: any): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;')
}

async function cargar() {
  loading.value = true
  try {
    await Promise.all([cargarEmpresa(), cargarBancos()])
    const facturaId = Number(route.params.facturaId || 0)
    const facturaRes = await window.db.getById('facturas', facturaId)
    if (!facturaRes.success || !facturaRes.data) throw new Error(facturaRes.error || 'No se encontro la factura')
    factura.value = facturaRes.data

    const cuentasRes = await window.db.getAll('cuentas_cobrar')
    if (!cuentasRes.success) throw new Error(cuentasRes.error || 'No se pudo cargar la cuenta por cobrar')
    cuenta.value = (cuentasRes.data || []).find((item: any) =>
      String(item.no_factura || '') === String(factura.value.no_factura || '')
    ) || null
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar la cuenta', life: 4000 })
  } finally {
    loading.value = false
  }
}

function setAbonoPorcentaje(porcentaje: number) {
  abono.value = Number((Number(cuenta.value?.saldo || 0) * porcentaje).toFixed(2))
}

async function registrarAbono() {
  const monto = Number(abono.value || 0)
  const saldo = Number(cuenta.value?.saldo || 0)
  if (!cuenta.value || monto <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un monto valido', life: 2500 })
    return
  }
  if (monto > saldo) {
    toast.add({ severity: 'warn', summary: 'Monto excede el saldo', detail: `Saldo: ${formatMoney(saldo)}`, life: 3000 })
    return
  }
  if (metodoAbono.value === 'TRANSFERENCIA' && !bancoAbonoInfo.value) {
    toast.add({ severity: 'warn', summary: 'Banco requerido', detail: 'Selecciona el banco que recibira la transferencia', life: 3000 })
    return
  }

  guardandoAbono.value = true
  let ajustesAplicados: Array<{ banco: any; saldo: number }> = []
  try {
    const turnoRes = await window.electron.invoke('caja:getTurnoActivo', almacenStore.activeUid || '') as any
    if (!turnoRes?.success || !turnoRes.data?.id) {
      toast.add({ severity: 'warn', summary: 'Caja cerrada', detail: 'Abre un turno de caja antes de registrar el abono', life: 3500 })
      return
    }
    const historial = [...pagos.value]
    const ahora = new Date()
    const banco = metodoAbono.value === 'TRANSFERENCIA' ? bancoAbonoInfo.value : null
    historial.push({
      nopago: historial.length + 1,
      monto,
      cantidad: monto,
      fecha: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`,
      hora: ahora.toLocaleTimeString(locale.value, { hour: '2-digit', minute: '2-digit' }),
      metodo: metodoAbono.value,
      banco_id: banco ? Number(banco.id) : 0,
      banco_uid: banco ? String(banco.uid || '') : '',
      banco_nombre: banco ? String(banco.nombre || '') : '',
      banco_numero_cuenta: banco ? String(banco.numero_cuenta || '') : '',
      nota: 'ABONO REGISTRADO DESDE CUENTA POR COBRAR',
      turno_id: Number(turnoRes.data.id),
      almacen_uid: almacenStore.activeUid || cuenta.value.almacen_uid || '',
      created_at: ahora.toISOString(),
    })
    const abonado = Number(cuenta.value.abonado || 0) + monto
    const nuevoSaldo = Math.max(0, Number(cuenta.value.total || 0) - abonado)
    const estado = nuevoSaldo <= 0 ? 'PAGADA' : 'ACTIVA'
    ajustesAplicados = await aplicarAjustesBancarios([{ banco, delta: monto }])
    const res = await window.db.update('cuentas_cobrar', cuenta.value.id, {
      abonado,
      saldo: nuevoSaldo,
      estado,
      pagos: JSON.stringify(historial),
    })
    if (!res.success) throw new Error(res.error || 'No se pudo registrar el abono')
    cuenta.value = { ...cuenta.value, abonado, saldo: nuevoSaldo, estado, pagos: JSON.stringify(historial) }
    abono.value = 0
    bancoAbonoSeleccionado.value = null
    toast.add({ severity: 'success', summary: 'Abono registrado', detail: formatMoney(monto), life: 2500 })
  } catch (error: any) {
    if (ajustesAplicados.length) await revertirAjustesBancarios(ajustesAplicados)
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo registrar el abono', life: 3500 })
  } finally {
    guardandoAbono.value = false
  }
}

function normalizarTelefono(value: any): string {
  const digits = String(value || '').replace(/\D/g, '')
  return digits.length === 10 ? `1${digits}` : digits
}

function resumenWhatsapp(): string {
  const ultimos = pagos.value.slice(-5).map((p: any, index: number) =>
    `${index + 1}. ${p.fecha || ''} ${p.hora || ''} - ${formatMoney(montoPago(p))}`
  ).join('\n')
  return [
    '*Estado de cuenta*', '',
    `Factura: ${cuenta.value?.no_factura || '-'}`,
    `Cliente: ${cuenta.value?.nombre_cliente || 'CONSUMIDOR FINAL'}`,
    `Total: ${formatMoney(cuenta.value?.total)}`,
    `Abonado: ${formatMoney(cuenta.value?.abonado)}`,
    `Saldo pendiente: ${formatMoney(cuenta.value?.saldo)}`,
    `Estado: ${cuenta.value?.estado || 'ACTIVA'}`, '',
    ultimos ? `*Ultimos abonos:*\n${ultimos}` : 'Sin abonos registrados.', '',
    'Gracias por su preferencia.',
  ].join('\n')
}

function enviarWhatsapp() {
  const telefono = normalizarTelefono(cuenta.value?.telefono_cliente)
  if (!telefono) {
    whatsapp.value = ''
    dialogWhatsapp.value = true
    return
  }
  window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(resumenWhatsapp())}`, '_blank')
}

async function guardarWhatsapp() {
  const telefono = normalizarTelefono(whatsapp.value)
  if (!telefono || telefono.length < 10) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un WhatsApp valido', life: 2500 })
    return
  }
  guardandoWhatsapp.value = true
  try {
    const local = telefono.startsWith('1') && telefono.length === 11 ? telefono.slice(1) : telefono
    const res = await window.db.update('cuentas_cobrar', cuenta.value.id, { telefono_cliente: local })
    if (!res.success) throw new Error(res.error || 'No se pudo guardar el WhatsApp')
    if (factura.value?.id) await window.db.update('facturas', factura.value.id, { telefono_cliente: local })
    cuenta.value = { ...cuenta.value, telefono_cliente: local }
    dialogWhatsapp.value = false
    enviarWhatsapp()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar el WhatsApp', life: 3500 })
  } finally {
    guardandoWhatsapp.value = false
  }
}

function imprimir() {
  if (cuenta.value) ticketRef.value?.printTicket(cuenta.value, 0, Number(cuenta.value.abonado || 0), Number(cuenta.value.saldo || 0))
}

function buildPdfHtml(logoEmpresa = ''): string {
  const rowsProductos = productos.value.map((item: any, index: number) => {
    const cantidad = Number(item.cantidad || 1)
    const precio = Number(item.precio ?? item.precio_venta ?? 0)
    const identificador = escapeHtml(detalleVarianteProducto(item))
    return `<tr><td>${index + 1}</td><td><strong>${escapeHtml(item.nombre || item.descripcion || 'Producto')}</strong><small>${identificador}</small></td><td class="right">${cantidad}</td><td class="right">${formatMoney(precio)}</td><td class="right">${formatMoney(cantidad * precio)}</td></tr>`
  }).join('') || '<tr><td colspan="5" class="empty">Sin productos registrados</td></tr>'
  const rowsPagos = pagos.value.map((p: any, index: number) =>
    `<tr><td>${index + 1}</td><td>${escapeHtml(p.fecha || '')} ${escapeHtml(p.hora || '')}</td><td>${escapeHtml(p.metodo || 'ABONO')}${p.banco_nombre ? `<small>${escapeHtml(p.banco_nombre)}${p.banco_numero_cuenta ? ` · ${escapeHtml(p.banco_numero_cuenta)}` : ''}</small>` : ''}</td><td>${escapeHtml(p.nota || '')}</td><td class="right">${formatMoney(montoPago(p))}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="empty">Sin abonos registrados</td></tr>'
  const company = empresa.value || {}
  const estado = String(cuenta.value.estado || 'ACTIVA').toUpperCase()
  const saldo = Number(cuenta.value.saldo || 0)
  const estadoLabel = saldo <= 0 || estado === 'PAGADA' ? 'PAGADA' : estado
  const estadoClass = estadoLabel === 'PAGADA' ? 'paid' : estadoLabel === 'VENCIDA' ? 'overdue' : 'active'
  const generado = new Intl.DateTimeFormat(locale.value, { dateStyle: 'long', timeStyle: 'short' }).format(new Date())
  return `<!DOCTYPE html><html><head><meta charset="UTF-8"><style>
    @page{size:A4;margin:12mm}*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;color:#172033;margin:0;background:#fff;font-size:11px}.page{border:1px solid #d8e0ea;min-height:270mm}.header{background:linear-gradient(120deg,#102a43,#1e4f7a);color:white;padding:25px 30px;display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:16px}.logo{width:72px;height:72px;object-fit:contain;background:white;border-radius:8px;padding:5px}.brand h1{font-size:21px;margin:0 0 4px}.brand p,.document p{margin:2px 0;color:#dbeafe}.document{text-align:right}.document .eyebrow{font-size:9px;letter-spacing:1.8px;font-weight:bold;color:#93c5fd}.document h2{font-size:24px;letter-spacing:.5px;margin:5px 0}.content{padding:25px 30px}.meta{display:grid;grid-template-columns:1.25fr 1fr .65fr;gap:12px;margin-bottom:18px}.card{border:1px solid #dbe3ec;border-radius:8px;padding:13px 15px;background:#f8fafc}.label{display:block;text-transform:uppercase;letter-spacing:.8px;font-size:8px;font-weight:bold;color:#64748b;margin-bottom:6px}.card strong{font-size:13px;color:#102a43}.card p{margin:4px 0}.status{display:inline-block;border-radius:999px;padding:6px 12px;font-size:10px;font-weight:bold;letter-spacing:.6px}.status.paid{background:#dcfce7;color:#166534}.status.active{background:#dbeafe;color:#1d4ed8}.status.overdue{background:#fee2e2;color:#b91c1c}.metrics{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #dbe3ec;border-radius:10px;overflow:hidden;margin:16px 0}.metric{padding:17px 18px;background:white;border-right:1px solid #dbe3ec}.metric:last-child{border:0}.metric small{display:block;text-transform:uppercase;letter-spacing:.7px;color:#64748b;font-weight:bold;font-size:9px}.metric strong{font-size:22px;display:block;margin-top:5px}.metric.total strong{color:#1d4ed8}.metric.paid-value strong{color:#047857}.metric.balance{background:#fff7ed}.metric.balance strong{color:#c2410c}.progress-wrap{margin:12px 0 23px}.progress-copy{display:flex;justify-content:space-between;color:#64748b;font-size:9px;margin-bottom:6px}.progress{height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden}.bar{height:100%;background:#059669;width:${Math.min(100, porcentajePagado.value)}%}.section{margin-top:22px;break-inside:avoid}.section-title{display:flex;align-items:center;justify-content:space-between;border-bottom:2px solid #1e4f7a;padding-bottom:7px;margin-bottom:7px}.section h2{font-size:13px;color:#102a43;margin:0;text-transform:uppercase;letter-spacing:.5px}.section-title span{font-size:9px;color:#64748b}table{width:100%;border-collapse:collapse;font-size:10px}th{background:#edf3f8;color:#334e68;text-transform:uppercase;letter-spacing:.4px;font-size:8px}th,td{padding:8px 7px;border-bottom:1px solid #e2e8f0;text-align:left;vertical-align:top}tbody tr:nth-child(even){background:#fafcff}.right{text-align:right}td small{display:block;color:#64748b;margin-top:3px}.empty{text-align:center;color:#94a3b8;padding:20px}.notes{background:#fffbeb;border-left:4px solid #f59e0b;padding:11px 14px;margin-top:20px}.notes strong{display:block;color:#92400e;margin-bottom:4px}.footer{display:flex;justify-content:space-between;border-top:1px solid #dbe3ec;color:#64748b;font-size:8px;margin-top:26px;padding-top:10px}
  </style></head><body><div class="page"><div class="header"><div class="brand">${logoEmpresa ? `<img src="${logoEmpresa}" alt="Logo" class="logo">` : ''}<div><h1>${escapeHtml(company.nombre || 'MI EMPRESA')}</h1><p>${escapeHtml(company.legal || '')}${company.rnc ? ` · RNC: ${escapeHtml(company.rnc)}` : ''}</p><p>${escapeHtml(company.direccion || '')}</p><p>${escapeHtml(company.telefono || '')}${company.email ? ` · ${escapeHtml(company.email)}` : ''}</p></div></div><div class="document"><div class="eyebrow">DOCUMENTO FINANCIERO</div><h2>ESTADO DE CUENTA</h2><p>Factura #${escapeHtml(cuenta.value.no_factura || cuenta.value.id || '-')}</p><p>Emitido: ${escapeHtml(generado)}</p></div></div><div class="content">
    <div class="meta"><div class="card"><span class="label">Cliente</span><strong>${escapeHtml(cuenta.value.nombre_cliente || 'CONSUMIDOR FINAL')}</strong><p>Codigo: ${escapeHtml(cuenta.value.cod_cliente || '-')} · Telefono: ${escapeHtml(cuenta.value.telefono_cliente || '-')}</p></div><div class="card"><span class="label">Informacion del credito</span><strong>Factura #${escapeHtml(cuenta.value.no_factura || '-')}</strong><p>Venta: ${escapeHtml(cuenta.value.fecha_venta || '-')}</p><p>Vencimiento: ${escapeHtml(cuenta.value.fecha_vencimiento || '-')}</p></div><div class="card"><span class="label">Estado actual</span><span class="status ${estadoClass}">${escapeHtml(estadoLabel)}</span><p>${pagos.value.length} abono(s)</p></div></div>
    <div class="metrics"><div class="metric total"><small>Monto original</small><strong>${formatMoney(cuenta.value.total)}</strong></div><div class="metric paid-value"><small>Total abonado</small><strong>${formatMoney(cuenta.value.abonado)}</strong></div><div class="metric balance"><small>Saldo pendiente</small><strong>${formatMoney(cuenta.value.saldo)}</strong></div></div><div class="progress-wrap"><div class="progress-copy"><span>Progreso de pago</span><strong>${porcentajePagado.value.toFixed(1)}% pagado</strong></div><div class="progress"><div class="bar"></div></div></div>
    <div class="section"><div class="section-title"><h2>Detalle de productos facturados</h2><span>${productos.value.length} registro(s)</span></div><table><thead><tr><th>#</th><th>Descripcion</th><th class="right">Cantidad</th><th class="right">Precio unitario</th><th class="right">Importe</th></tr></thead><tbody>${rowsProductos}</tbody></table></div>
    <div class="section"><div class="section-title"><h2>Historial de abonos</h2><span>${pagos.value.length} pago(s)</span></div><table><thead><tr><th>#</th><th>Fecha y hora</th><th>Metodo de pago</th><th>Referencia / nota</th><th class="right">Monto</th></tr></thead><tbody>${rowsPagos}</tbody></table></div>
    ${cuenta.value.notas ? `<div class="notes"><strong>Observaciones</strong>${escapeHtml(cuenta.value.notas)}</div>` : ''}<div class="footer"><span>Este documento refleja los movimientos registrados hasta su fecha de emision.</span><span>Generado por TMPOS</span></div>
  </div></div></body></html>`
}

async function generarPdf() {
  if (!cuenta.value) return
  pdfNombre.value = `Cuenta_Cobrar_${cuenta.value.no_factura || cuenta.value.id}.pdf`
  const logo = await resolvePrintableImage(empresa.value?.logoprinter || empresa.value?.logo)
  const res = await window.electron.invoke('generate:pdf', buildPdfHtml(logo), pdfNombre.value) as any
  if (!res.success || !res.dataUrl) {
    toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar el PDF', life: 3000 })
    return
  }
  pdfDataUrl.value = res.dataUrl
  dialogPdf.value = true
}

async function descargarPdf() {
  if (!pdfDataUrl.value) return
  const res = await window.electron.invoke('save:pdf', pdfDataUrl.value, pdfNombre.value) as any
  toast.add(res.success
    ? { severity: 'success', summary: 'Guardado', detail: 'PDF descargado', life: 2000 }
    : { severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
}

watch(metodoAbono, (metodo) => {
  if (metodo !== 'TRANSFERENCIA') bancoAbonoSeleccionado.value = null
})

watch(() => abonoEditado.value.metodo, (metodo) => {
  if (metodo !== 'TRANSFERENCIA') abonoEditado.value.banco_id = null
})

onMounted(cargar)
</script>

<template>
  <div class="w-full p-4 sm:p-6 space-y-5">
    <Toast />
    <TicketCuentaCobrarPrint ref="ticketRef" />

    <div class="flex flex-wrap items-center justify-between gap-3">
      <div class="flex items-center gap-3">
        <Button icon="pi pi-arrow-left" severity="secondary" text rounded @click="router.back()" v-tooltip="'Volver'" />
        <div><h1 class="text-2xl font-bold">Editar cuenta por cobrar</h1><p class="text-sm text-surface-500">Abonos, documentos y comunicación con el cliente.</p></div>
      </div>
      <div v-if="cuenta" class="flex flex-wrap gap-2">
        <Button label="WhatsApp" icon="pi pi-whatsapp" severity="success" outlined @click="enviarWhatsapp" />
        <Button label="Imprimir" icon="pi pi-print" severity="info" outlined @click="imprimir" />
        <Button label="PDF profesional" icon="pi pi-file-pdf" severity="danger" outlined @click="generarPdf" />
      </div>
    </div>

    <div v-if="loading" class="flex justify-center items-center py-24 gap-2 text-surface-500"><i class="pi pi-spin pi-spinner text-xl"></i>Cargando cuenta...</div>
    <div v-else-if="!cuenta" class="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-900/20 p-8 text-center text-amber-700">No se encontró una cuenta por cobrar para esta factura.</div>
    <template v-else>
      <div class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 shadow-sm">
        <div class="flex justify-between gap-3"><div><p class="text-xs uppercase text-surface-500 font-semibold">Factura</p><h2 class="text-2xl font-bold">{{ cuenta.no_factura }}</h2><p class="text-surface-500">{{ cuenta.nombre_cliente || 'CONSUMIDOR FINAL' }}</p></div><Tag :value="cuenta.estado || 'ACTIVA'" :severity="estadoSeverity(cuenta.estado)" /></div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-5"><div class="rounded-xl bg-blue-50 dark:bg-blue-900/20 p-4"><p class="text-xs text-surface-500">Total</p><p class="text-xl font-bold text-blue-600">{{ formatMoney(cuenta.total) }}</p></div><div class="rounded-xl bg-emerald-50 dark:bg-emerald-900/20 p-4"><p class="text-xs text-surface-500">Abonado</p><p class="text-xl font-bold text-emerald-600">{{ formatMoney(cuenta.abonado) }}</p></div><div class="rounded-xl bg-red-50 dark:bg-red-900/20 p-4"><p class="text-xs text-surface-500">Saldo pendiente</p><p class="text-xl font-bold text-red-600">{{ formatMoney(cuenta.saldo) }}</p></div></div>
        <div class="h-2 rounded-full bg-surface-200 dark:bg-surface-700 overflow-hidden mt-4"><div class="h-full bg-emerald-500" :style="{ width: `${porcentajePagado}%` }"></div></div>
      </div>

      <div v-if="Number(cuenta.saldo || 0) > 0" class="rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-5 space-y-4"><div><h3 class="font-bold text-emerald-700 dark:text-emerald-300">Registrar abono</h3><p class="text-sm text-surface-500">El monto se aplicará al saldo pendiente y aparecerá en el reporte según su fecha y método.</p></div><div class="grid grid-cols-1 sm:grid-cols-[1fr_14rem_auto] gap-2"><InputNumber v-model="abono" :min="0" :max="Number(cuenta.saldo || 0)" :minFractionDigits="2" placeholder="Monto del abono" fluid @focus="(e: any) => e.target.select()" /><Select v-model="metodoAbono" :options="metodosAbono" optionLabel="label" optionValue="value" placeholder="Método" fluid /><Button label="Abonar" icon="pi pi-check" severity="success" :loading="guardandoAbono" :disabled="Number(abono || 0) <= 0 || (metodoAbono === 'TRANSFERENCIA' && !bancoAbonoSeleccionado)" @click="registrarAbono" /></div><div v-if="metodoAbono === 'TRANSFERENCIA'" class="rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50/80 dark:bg-blue-950/30 p-3 space-y-2"><label class="text-sm font-semibold">Banco que recibe la transferencia</label><Select v-model="bancoAbonoSeleccionado" :options="bancos" optionLabel="nombre" optionValue="id" :loading="cargandoBancos" placeholder="Seleccionar banco..." emptyMessage="No hay bancos registrados" filter fluid><template #option="slotProps"><div class="flex justify-between items-center gap-4 w-full"><div><div class="font-semibold">{{ slotProps.option.nombre }}</div><div v-if="slotProps.option.numero_cuenta" class="text-xs text-surface-500">{{ slotProps.option.numero_cuenta }}</div></div><span class="text-xs font-semibold text-surface-500">{{ formatMoney(slotProps.option.saldo || 0) }}</span></div></template></Select><p v-if="bancoAbonoInfo" class="text-xs text-blue-700 dark:text-blue-300">Se acreditarán {{ formatMoney(abono || 0) }} a {{ bancoAbonoInfo.nombre }}.</p></div><div class="grid grid-cols-4 gap-2"><Button label="25%" severity="secondary" outlined size="small" @click="setAbonoPorcentaje(.25)" /><Button label="50%" severity="secondary" outlined size="small" @click="setAbonoPorcentaje(.5)" /><Button label="75%" severity="secondary" outlined size="small" @click="setAbonoPorcentaje(.75)" /><Button label="100%" severity="success" outlined size="small" @click="setAbonoPorcentaje(1)" /></div></div>
      <div v-else class="rounded-xl border border-emerald-200 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-emerald-700">Esta cuenta ya está saldada.</div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">
        <section class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden"><div class="p-4 border-b border-surface-200 dark:border-surface-700"><h3 class="font-bold">Productos facturados</h3></div><DataTable :value="productos" size="small" scrollable responsiveLayout="scroll"><Column field="nombre" header="Producto"><template #body="{ data }"><div><p class="font-medium">{{ data.nombre || data.descripcion || 'Producto' }}</p><p v-if="detalleVarianteProducto(data)" class="text-xs text-surface-500 font-mono">{{ detalleVarianteProducto(data) }}</p></div></template></Column><Column field="cantidad" header="Cant." /><Column header="Precio"><template #body="{ data }">{{ formatMoney(data.precio ?? data.precio_venta) }}</template></Column><template #empty><div class="text-center py-6 text-surface-500">Sin productos registrados.</div></template></DataTable></section>
        <section class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden"><div class="p-4 border-b border-surface-200 dark:border-surface-700"><h3 class="font-bold">Historial de abonos</h3></div><DataTable :value="pagos" size="small" scrollable responsiveLayout="scroll"><Column header="#"><template #body="{ index }">{{ index + 1 }}</template></Column><Column field="fecha" header="Fecha"><template #body="{ data }">{{ data.fecha }} {{ data.hora || '' }}</template></Column><Column field="metodo" header="Método"><template #body="{ data }"><div>{{ data.metodo || data.metodo_pago || 'ABONO' }}</div><div v-if="data.banco_nombre" class="text-xs text-surface-500">{{ data.banco_nombre }}<span v-if="data.banco_numero_cuenta"> · {{ data.banco_numero_cuenta }}</span></div></template></Column><Column header="Monto"><template #body="{ data }"><span class="font-bold text-emerald-600">{{ formatMoney(montoPago(data)) }}</span></template></Column><Column header="Acciones" style="width: 7rem"><template #body="{ data, index }"><div class="flex gap-1"><Button icon="pi pi-pencil" severity="info" text rounded size="small" @click="abrirEditarAbono(data, index)" v-tooltip="'Editar abono'" /><Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="confirmarEliminarAbono(index)" v-tooltip="'Eliminar abono'" /></div></template></Column><template #empty><div class="text-center py-6 text-surface-500">Sin abonos registrados.</div></template></DataTable></section>
      </div>

      <div class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 text-sm"><div><p class="text-xs text-surface-500">Teléfono</p><p class="font-medium">{{ cuenta.telefono_cliente || '-' }}</p></div><div><p class="text-xs text-surface-500">Fecha de venta</p><p class="font-medium">{{ cuenta.fecha_venta || '-' }}</p></div><div><p class="text-xs text-surface-500">Vencimiento</p><p class="font-medium">{{ cuenta.fecha_vencimiento || '-' }}</p></div><div><p class="text-xs text-surface-500">Notas</p><p class="font-medium">{{ cuenta.notas || '-' }}</p></div></div>
    </template>

    <Dialog v-model:visible="dialogWhatsapp" header="Agregar WhatsApp" modal :style="{ width: 'min(26rem, 95vw)' }" :draggable="false"><div class="space-y-3"><p class="text-sm text-surface-500">Agrega el número para guardarlo en la cuenta y enviar el resumen.</p><InputText v-model="whatsapp" placeholder="8095551234" fluid @keydown.enter="guardarWhatsapp" /></div><template #footer><Button label="Cancelar" severity="secondary" text @click="dialogWhatsapp = false" /><Button label="Guardar y enviar" icon="pi pi-whatsapp" severity="success" :loading="guardandoWhatsapp" @click="guardarWhatsapp" /></template></Dialog>
    <Dialog v-model:visible="dialogEditarAbono" header="Editar abono" modal :style="{ width: 'min(32rem, 95vw)' }" :draggable="false"><div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2"><div class="sm:col-span-2 space-y-1"><label class="text-sm font-semibold">Monto</label><InputNumber v-model="abonoEditado.monto" :min="0.01" :minFractionDigits="2" fluid @focus="(e: any) => e.target.select()" /></div><div class="space-y-1"><label class="text-sm font-semibold">Fecha</label><InputText v-model="abonoEditado.fecha" placeholder="Fecha" fluid /></div><div class="space-y-1"><label class="text-sm font-semibold">Hora</label><InputText v-model="abonoEditado.hora" placeholder="Hora" fluid /></div><div class="sm:col-span-2 space-y-1"><label class="text-sm font-semibold">Método</label><Select v-model="abonoEditado.metodo" :options="metodosAbono" optionLabel="label" optionValue="value" placeholder="Método de pago" fluid /></div><div v-if="abonoEditado.metodo === 'TRANSFERENCIA'" class="sm:col-span-2 space-y-1"><label class="text-sm font-semibold">Banco</label><Select v-model="abonoEditado.banco_id" :options="bancos" optionLabel="nombre" optionValue="id" :loading="cargandoBancos" placeholder="Seleccionar banco..." emptyMessage="No hay bancos registrados" filter fluid /></div><div class="sm:col-span-2 space-y-1"><label class="text-sm font-semibold">Nota</label><InputText v-model="abonoEditado.nota" placeholder="Nota del abono" fluid /></div></div><template #footer><Button label="Cancelar" severity="secondary" text :disabled="guardandoCambioAbono" @click="dialogEditarAbono = false" /><Button label="Guardar cambios" icon="pi pi-check" :loading="guardandoCambioAbono" :disabled="abonoEditado.metodo === 'TRANSFERENCIA' && !abonoEditado.banco_id" @click="actualizarAbono" /></template></Dialog>
    <Dialog v-model:visible="dialogEliminarAbono" header="Eliminar abono" modal :style="{ width: 'min(26rem, 95vw)' }" :draggable="false"><div class="flex items-start gap-3"><i class="pi pi-exclamation-triangle text-2xl text-red-500 mt-1"></i><div><p class="font-semibold">¿Eliminar este abono?</p><p class="text-sm text-surface-500 mt-1">El total abonado y el saldo pendiente se recalcularán automáticamente.</p></div></div><template #footer><Button label="Cancelar" severity="secondary" text :disabled="guardandoCambioAbono" @click="dialogEliminarAbono = false" /><Button label="Eliminar" icon="pi pi-trash" severity="danger" :loading="guardandoCambioAbono" @click="eliminarAbono" /></template></Dialog>
    <Dialog v-model:visible="dialogPdf" header="Estado de cuenta PDF" modal :style="{ width: '85vw', height: '90vh' }" :draggable="false"><iframe v-if="pdfDataUrl" :src="pdfDataUrl" class="w-full border-0" style="height:72vh"></iframe><template #footer><Button label="Cerrar" severity="secondary" text @click="dialogPdf = false" /><Button label="Descargar PDF" icon="pi pi-download" @click="descargarPdf" /></template></Dialog>
  </div>
</template>
