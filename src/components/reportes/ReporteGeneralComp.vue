<script setup lang="ts">
import { getSystemCurrencyCode, getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, nextTick } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Calendar from 'primevue/calendar'
import Select from 'primevue/select'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { Chart, registerables } from 'chart.js'
import Swal from 'sweetalert2'
import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { useAlmacenStore } from '@/stores/almacen.store'

Chart.register(...registerables)

const toast = useToast()
const almacenStore = useAlmacenStore()
const TODOS_ALMACENES = '__TODOS__'
const almacenFiltro = ref(TODOS_ALMACENES)

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

const facturas = ref<any[]>([])
const taller = ref<any[]>([])
const tallerTodas = ref<any[]>([])
const gastos = ref<any[]>([])
const abonosCuentas = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const rangoPersonalizado = ref<Date[]>([])
const rangoActivo = ref<string>('hoy')

const rangoLabel = computed(() => {
  const labels: Record<string, string> = { hoy: 'Hoy', ayer: 'Ayer', semana: 'Esta semana', mes: 'Este mes', mes_pasado: 'Mes pasado', trimestre: 'Este trimestre', ano: 'Este año' }
  return labels[rangoActivo.value] || 'Rango personalizado'
})

let chartDiario: Chart | null = null
const canvasDiario = ref<HTMLCanvasElement | null>(null)

let chartPago: Chart | null = null
const canvasPago = ref<HTMLCanvasElement | null>(null)

let chartTopClientes: Chart | null = null
const canvasTopClientes = ref<HTMLCanvasElement | null>(null)

let chartTopProductos: Chart | null = null
const canvasTopProductos = ref<HTMLCanvasElement | null>(null)

let chartCategoria: Chart | null = null
const canvasCategoria = ref<HTMLCanvasElement | null>(null)

let chartTaller: Chart | null = null
const canvasTaller = ref<HTMLCanvasElement | null>(null)

function toNumber(value: unknown): number {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0
  const cleaned = String(value || '')
    .replace(/RD\$/gi, '')
    .replace(/\$/g, '')
    .replace(/,/g, '')
    .trim()
  const parsed = Number(cleaned)
  return Number.isFinite(parsed) ? parsed : 0
}

function getTallerFecha(orden: any): string {
  const estado = normalizarEstadoTaller(orden?.estado)
  const reparacionCerrada = estado === 'COMPLETADO' || estado === 'ENTREGADO'
  const value = reparacionCerrada
    ? orden.fecha_entrega || orden.fecha_pago || orden.updated_at || orden.fecha_entrada || orden.created_at || ''
    : orden.fecha_entrada || orden.fecha_ingreso || orden.fecha || orden.created_at || orden.updated_at || ''
  if (value instanceof Date) return value.toISOString().split('T')[0]
  const text = String(value || '').trim()
  if (!text) return ''
  const iso = text.match(/\d{4}-\d{2}-\d{2}/)
  if (iso) return iso[0]
  const slash = text.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (slash) return `${slash[3]}-${slash[2].padStart(2, '0')}-${slash[1].padStart(2, '0')}`
  return text.slice(0, 10)
}

function getTallerTotal(orden: any): number {
  const total = toNumber(orden.total)
  if (total > 0) return total
  return toNumber(orden.precio_pieza ?? orden.preciopiezas) + toNumber(orden.mano_obra ?? orden.manodeobra)
}

function esOrdenTallerContabilizable(orden: any): boolean {
  return normalizarEstadoTaller(orden?.estado) !== 'CANCELADO'
}

function normalizarEstadoTaller(estado: unknown): string {
  const value = String(estado || '').trim().toUpperCase().replace(/\s+/g, '_')
  if (!value) return 'SIN_ESTADO'
  if (value === 'EN PROCESO') return 'EN_PROCESO'
  return value
}

function labelEstadoTaller(estado: string): string {
  const labels: Record<string, string> = {
    RECIBIDO: 'Recibido',
    EN_PROCESO: 'En Proceso',
    COMPLETADO: 'Completado',
    ENTREGADO: 'Entregado',
    PARCIAL: 'Parcial',
    CANCELADO: 'Cancelado',
    SIN_ESTADO: 'Sin Estado',
  }
  return labels[estado] || estado.replace(/_/g, ' ')
}

function fechaLocalIso(fecha: Date): string {
  return `${fecha.getFullYear()}-${String(fecha.getMonth() + 1).padStart(2, '0')}-${String(fecha.getDate()).padStart(2, '0')}`
}

function normalizarFechaRegistro(valor: any): string {
  const texto = String(valor || '').trim()
  const iso = texto.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const local = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (local) {
    const usaMesPrimero = getSystemLocale().toLowerCase().startsWith('en-us')
    const mes = usaMesPrimero ? local[1] : local[2]
    const dia = usaMesPrimero ? local[2] : local[1]
    return `${local[3]}-${mes.padStart(2, '0')}-${dia.padStart(2, '0')}`
  }
  return ''
}

function parsePagosCuenta(cuenta: any): any[] {
  try {
    const parsed = JSON.parse(cuenta?.pagos || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch { return [] }
}

const totalAbonosCuentas = computed(() => abonosCuentas.value.reduce((total, pago) => total + toNumber(pago.monto), 0))

function fechaEfectivaFactura(factura: any): string {
  const fechaGuardada = normalizarFechaRegistro(factura?.fecha_emision)
  const creadoRaw = String(factura?.created_at || '').trim()
  if (!creadoRaw) return fechaGuardada
  const tieneZona = /(?:z|[+-]\d{2}:?\d{2})$/i.test(creadoRaw)
  const creado = new Date(`${creadoRaw.replace(' ', 'T')}${tieneZona ? '' : 'Z'}`)
  if (Number.isNaN(creado.getTime())) return fechaGuardada
  const fechaCreadaDb = creadoRaw.slice(0, 10)
  const fechaCreadaLocal = fechaLocalIso(creado)
  return fechaGuardada === fechaCreadaDb && fechaCreadaLocal < fechaGuardada
    ? fechaCreadaLocal
    : (fechaGuardada || fechaCreadaLocal)
}

function esFacturaVenta(factura: any): boolean {
  const tipo = String(factura?.tipo_factura || '').trim().toUpperCase()
  const estado = String(factura?.estado_factura || '').trim().toUpperCase()
  if (tipo.includes('COTIZACION') || tipo.includes('NOTA_CREDITO') || tipo.includes('NOTA CREDITO') || tipo.includes('RECIBIDO')) return false
  return estado === 'PAGADA' || estado === 'COBRADO' || estado === 'CREDITO' || estado === 'CRÉDITO'
}

function getGastoFecha(gasto: any): string {
  const fechaGuardada = normalizarFechaRegistro(gasto?.fecha)
  const creadoRaw = String(gasto?.created_at || '').trim()
  if (!creadoRaw) return fechaGuardada
  const tieneZona = /(?:z|[+-]\d{2}:?\d{2})$/i.test(creadoRaw)
  const creado = new Date(`${creadoRaw.replace(' ', 'T')}${tieneZona ? '' : 'Z'}`)
  if (Number.isNaN(creado.getTime())) return fechaGuardada
  const fechaCreadaDb = creadoRaw.slice(0, 10)
  const fechaCreadaLocal = fechaLocalIso(creado)
  return fechaGuardada === fechaCreadaDb && fechaCreadaLocal < fechaGuardada
    ? fechaCreadaLocal
    : (fechaGuardada || fechaCreadaLocal)
}

function esGastoTaller(gasto: any): boolean {
  const comentario = String(gasto?.comentario || gasto?.descripcion || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase()
  return /^gasto\s+de\s+taller(?:\s*:|$)/.test(comentario)
}

function descripcionGastoTaller(gasto: any): string {
  return String(gasto?.comentario || gasto?.descripcion || 'Gasto de taller')
    .replace(/^gasto\s+de\s+taller\s*:\s*/i, '')
    .trim() || 'Gasto de taller'
}

const gastosTaller = computed(() => gastos.value
  .filter(esGastoTaller)
  .sort((a: any, b: any) => getGastoFecha(b).localeCompare(getGastoFecha(a))))

function getRango(key: string): { inicio: string; fin: string } {
  const now = new Date()
  const y = (d: Date) => fechaLocalIso(d)

  switch (key) {
    case 'hoy': return { inicio: y(now), fin: y(now) }
    case 'ayer': {
      const ayer = new Date(now); ayer.setDate(ayer.getDate() - 1)
      return { inicio: y(ayer), fin: y(ayer) }
    }
    case 'semana': {
      const l = new Date(now); l.setDate(l.getDate() - (l.getDay() || 7) + 1)
      const d = new Date(l); d.setDate(d.getDate() + 6)
      return { inicio: y(l), fin: y(d) }
    }
    case 'mes': {
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
      const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { inicio: y(inicio), fin: y(fin) }
    }
    case 'mes_pasado': {
      const inicio = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const fin = new Date(now.getFullYear(), now.getMonth(), 0)
      return { inicio: y(inicio), fin: y(fin) }
    }
    case 'ano': {
      const inicio = new Date(now.getFullYear(), 0, 1)
      const fin = new Date(now.getFullYear(), 11, 31)
      return { inicio: y(inicio), fin: y(fin) }
    }
    case 'personalizado': {
      if (rangoPersonalizado.value.length === 2)
        return { inicio: y(rangoPersonalizado.value[0]), fin: y(rangoPersonalizado.value[1]) }
      return { inicio: '', fin: '' }
    }
    default: return { inicio: y(now), fin: y(now) }
  }
}

const facturasFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return facturas.value
  return facturas.value.filter((f: any) =>
    f.no_factura?.toLowerCase().includes(texto) ||
    f.nombre_cliente?.toLowerCase().includes(texto) ||
    f.metodo_pago?.toLowerCase().includes(texto)
  )
})

const tallerFiltrado = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return taller.value
  return taller.value.filter((t: any) =>
    String(t.no_orden || t.no_factura || '').toLowerCase().includes(texto) ||
    String(t.nombre || t.nombre_cliente || '').toLowerCase().includes(texto) ||
    String(t.tecnico || '').toLowerCase().includes(texto) ||
    String(t.estado || '').toLowerCase().includes(texto) ||
    String(t.metodo_pago || t.metodopago || '').toLowerCase().includes(texto)
  )
})

function metodoEsEfectivo(value: unknown): boolean {
  return String(value || '').trim().toUpperCase().includes('EFECTIVO')
}

function metodoEsTransferencia(value: unknown): boolean {
  return String(value || '').trim().toUpperCase().includes('TRANSFER')
}

function metodoEsTarjeta(value: unknown): boolean {
  const metodo = String(value || '').trim().toUpperCase()
  return metodo.includes('TARJETA') || metodo.includes('CARD') || metodo.includes('VISA') || metodo.includes('MASTERCARD')
}

function efectivoRecibidoFactura(factura: any): number {
  const metodo = String(factura?.metodo_pago || '').trim().toUpperCase()
  const efectivoGuardado = toNumber(factura?.efectivo)
  if (metodo === 'MIXTO') return efectivoGuardado
  if (!metodoEsEfectivo(metodo)) return 0
  return efectivoGuardado > 0 ? efectivoGuardado : toNumber(factura?.total)
}

function transferenciaRecibidaFactura(factura: any): number {
  const transferenciaGuardada = toNumber(factura?.transferencia)
  if (transferenciaGuardada > 0) return transferenciaGuardada
  return metodoEsTransferencia(factura?.metodo_pago) ? toNumber(factura?.total) : 0
}

function tarjetaRecibidaFactura(factura: any): number {
  const tarjetaGuardada = toNumber(factura?.tarjeta)
  if (tarjetaGuardada > 0) return tarjetaGuardada
  return metodoEsTarjeta(factura?.metodo_pago) ? toNumber(factura?.total) : 0
}

function montoRecibidoTaller(orden: any): number {
  const total = getTallerTotal(orden)
  const abono = toNumber(orden?.abono)
  if (abono > 0) return Math.min(abono, total || abono)

  const tieneSaldo = orden?.pendiente !== undefined || orden?.saldo !== undefined
  if (tieneSaldo) return Math.max(0, total - toNumber(orden?.pendiente ?? orden?.saldo))

  const estado = normalizarEstadoTaller(orden?.estado)
  return estado === 'COMPLETADO' || estado === 'ENTREGADO' ? total : 0
}

function recibidoTallerPorMetodo(orden: any, coincide: (metodo: unknown) => boolean): number {
  return coincide(orden?.metodo_pago ?? orden?.metodopago) ? montoRecibidoTaller(orden) : 0
}

const totales = computed(() => {
  let total = 0, ganancia = 0, descuento = 0, notasCreditoAplicadas = 0, porcentajeTarjeta = 0, facturasTarjeta = 0, count = 0, tallerValorOrdenes = 0, tallerIngresos = 0, tallerCobrado = 0, tallerOrdenes = 0, totalGastos = 0, totalGastosOperativos = 0, totalGastosTaller = 0, totalGastosEfectivo = 0, totalGastosTransferencia = 0
  for (const f of facturas.value) {
    total += calcularVentaFactura(f)
    ganancia += calcularGananciaFactura(f)
    descuento += calcularDescuentoComercial(f)
    notasCreditoAplicadas += calcularNotaCreditoAplicada(f)
    const montoTarjeta = calcularRecargoTarjetaFactura(f)
    porcentajeTarjeta += montoTarjeta
    if (montoTarjeta > 0) facturasTarjeta++
    count++
  }
  for (const t of taller.value) {
    if (esOrdenTallerContabilizable(t)) {
      const valorOrden = getTallerTotal(t)
      tallerValorOrdenes += valorOrden
      tallerIngresos += valorOrden
      tallerCobrado += montoRecibidoTaller(t)
    }
    tallerOrdenes++
  }
  for (const g of gastos.value) {
    const montoGasto = toNumber(g.cantidad || g.monto)
    const metodoGasto = String(g.metodo_pago || 'EFECTIVO').trim().toUpperCase()
    totalGastos += montoGasto
    if (esGastoTaller(g)) totalGastosTaller += montoGasto
    else totalGastosOperativos += montoGasto
    if (metodoGasto === 'MIXTO') {
      const efectivoMixto = Math.min(montoGasto, Math.max(0, toNumber(g.efectivo)))
      const transferenciaMixta = Math.min(
        Math.max(0, montoGasto - efectivoMixto),
        Math.max(0, toNumber(g.transferencia)),
      )
      const distribuido = efectivoMixto + transferenciaMixta
      totalGastosEfectivo += efectivoMixto + Math.max(0, montoGasto - distribuido)
      totalGastosTransferencia += transferenciaMixta
    } else if (metodoGasto.includes('TRANSFERENCIA')) {
      totalGastosTransferencia += montoGasto
    } else {
      totalGastosEfectivo += montoGasto
    }
  }
  let costo = 0, itemsCount = 0
  for (const f of facturas.value) {
    costo += calcularCostoFactura(f)
    itemsCount += parseProductos(f.productos).length
  }
  const ventasSinRecargoTarjeta = Math.max(0, total - porcentajeTarjeta)
  const margen = ventasSinRecargoTarjeta > 0 ? (ganancia / ventasSinRecargoTarjeta) * 100 : 0
  const ticketPromedio = count > 0 ? total / count : 0
  const itemsPorFactura = count > 0 ? itemsCount / count : 0
  const tallerGanancia = tallerIngresos - totalGastosTaller
  const gananciaTotal = ganancia + tallerGanancia
  const gananciaNeta = gananciaTotal - totalGastosOperativos
  const efectivoVentas = facturas.value.reduce((suma, factura) => suma + efectivoRecibidoFactura(factura), 0)
  const efectivoAbonos = abonosCuentas.value.reduce((suma, pago) => (
    suma + (metodoEsEfectivo(pago.metodo) ? toNumber(pago.monto) : 0)
  ), 0)
  const efectivoTaller = taller.value.reduce((suma, orden) => suma + recibidoTallerPorMetodo(orden, metodoEsEfectivo), 0)
  const efectivoTotal = efectivoVentas + efectivoAbonos + efectivoTaller
  const transferenciaVentas = facturas.value.reduce((suma, factura) => suma + transferenciaRecibidaFactura(factura), 0)
  const transferenciaAbonos = abonosCuentas.value.reduce((suma, pago) => (
    suma + (metodoEsTransferencia(pago.metodo) ? toNumber(pago.monto) : 0)
  ), 0)
  const transferenciaTaller = taller.value.reduce((suma, orden) => suma + recibidoTallerPorMetodo(orden, metodoEsTransferencia), 0)
  const transferenciaTotal = transferenciaVentas + transferenciaAbonos + transferenciaTaller
  const tarjetaVentas = facturas.value.reduce((suma, factura) => suma + tarjetaRecibidaFactura(factura), 0)
  const tarjetaAbonos = abonosCuentas.value.reduce((suma, pago) => (
    suma + (metodoEsTarjeta(pago.metodo) ? toNumber(pago.monto) : 0)
  ), 0)
  const tarjetaTaller = taller.value.reduce((suma, orden) => suma + recibidoTallerPorMetodo(orden, metodoEsTarjeta), 0)
  const tarjetaTotal = tarjetaVentas + tarjetaAbonos + tarjetaTaller
  return { total, ganancia, gananciaTotal, gananciaNeta, descuento, notasCreditoAplicadas, porcentajeTarjeta, facturasTarjeta, count, tallerValorOrdenes, tallerIngresos, tallerCobrado, tallerGanancia, tallerOrdenes, totalGastos, totalGastosOperativos, totalGastosTaller, totalGastosEfectivo, totalGastosTransferencia, costo, margen, ticketPromedio, itemsPorFactura, itemsCount, efectivoVentas, efectivoAbonos, efectivoTaller, efectivoTotal, transferenciaVentas, transferenciaAbonos, transferenciaTaller, transferenciaTotal, tarjetaVentas, tarjetaAbonos, tarjetaTaller, tarjetaTotal }
})

function parseProductos(productos: any): any[] {
  if (!productos) return []
  if (Array.isArray(productos)) return productos
  try {
    return JSON.parse(productos)
  } catch {
    return []
  }
}

function getProductoCantidad(producto: any): number {
  const cantidad = toNumber(producto?.cantidad ?? producto?.quantity)
  return cantidad > 0 ? cantidad : 1
}

function getProductoCostoUnitario(producto: any): number {
  return toNumber(
    producto?.costo ??
    producto?.precio_compra ??
    producto?.preciocompra ??
    producto?.cost
  )
}

function getProductoTotalBruto(producto: any): number {
  return toNumber(producto?.total) || (
    (toNumber(producto?.precio) || toNumber(producto?.precio_venta)) * getProductoCantidad(producto)
  )
}

function factorDescuentoFactura(factura: any, productos: any[]): number {
  const brutoProductos = productos.reduce((total, producto) => total + getProductoTotalBruto(producto), 0)
  if (!(brutoProductos > 0)) return 1
  const descuento = Math.min(brutoProductos, calcularDescuentoComercial(factura))
  return (brutoProductos - descuento) / brutoProductos
}

function calcularCostoProductos(productos: any[]): number {
  return productos.reduce((sum: number, p: any) => (
    sum + (getProductoCostoUnitario(p) * getProductoCantidad(p))
  ), 0)
}

function calcularCostoFactura(factura: any): number {
  const costoGuardado = toNumber(factura?.costo)
  if (costoGuardado > 0) return costoGuardado
  const prods = parseProductos(factura.productos)
  return calcularCostoProductos(prods)
}

function calcularNotaCreditoAplicada(factura: any): number {
  const nota = String(factura?.nota || '')
  if (!/(?:^|\|)\s*NC\s*:/i.test(nota)) return 0
  return Math.max(0, toNumber(factura?.descuento))
}

function calcularDescuentoComercial(factura: any): number {
  return Math.max(0, toNumber(factura?.descuento) - calcularNotaCreditoAplicada(factura))
}

function calcularVentaFactura(factura: any): number {
  return toNumber(factura?.total) + calcularNotaCreditoAplicada(factura)
}

function calcularGananciaFactura(factura: any): number {
  const gananciaAntesDescuento = toNumber(factura?.ganancia)
  const descuentoAplicado = calcularDescuentoComercial(factura)
  if (gananciaAntesDescuento !== 0 || descuentoAplicado > 0) {
    return gananciaAntesDescuento - descuentoAplicado
  }
  return toNumber(factura?.total) - calcularCostoFactura(factura)
}

function calcularRecargoTarjetaFactura(factura: any): number {
  const guardado = toNumber(factura?.monto_porcentaje_tarjeta)
  if (guardado > 0) return guardado
  if (!String(factura?.metodo_pago || '').toUpperCase().includes('TARJETA')) return 0
  try {
    const financiera = typeof factura?.financiera === 'string' ? JSON.parse(factura.financiera || '{}') : factura?.financiera || {}
    const financieraMonto = toNumber(financiera?.monto_comision)
    if (financieraMonto > 0) return financieraMonto
  } catch {}
  const subtotalProductos = parseProductos(factura?.productos).reduce((sum: number, producto: any) => (
    sum + (toNumber(producto?.precio ?? producto?.precio_venta) * getProductoCantidad(producto))
  ), 0)
  return Math.max(0, toNumber(factura?.total) - subtotalProductos + toNumber(factura?.descuento) - toNumber(factura?.impuesto))
}

const topProductos = computed(() => {
  const mapa = new Map<string, { nombre: string; cantidad: number; total: number; costo: number }>()
  for (const f of facturas.value) {
    const prods = parseProductos(f.productos)
    const factorDescuento = factorDescuentoFactura(f, prods)
    for (const p of prods) {
      const key = p.codigo || p.nombre || 'SIN NOMBRE'
      const entry = mapa.get(key) || { nombre: p.nombre || 'SIN NOMBRE', cantidad: 0, total: 0, costo: 0 }
      entry.cantidad += toNumber(p.cantidad)
      entry.total += getProductoTotalBruto(p) * factorDescuento
      entry.costo += toNumber(p.costo) * toNumber(p.cantidad)
      mapa.set(key, entry)
    }
  }
  return Array.from(mapa.values())
    .sort((a, b) => b.cantidad - a.cantidad)
    .slice(0, 10)
})

const productosVendidos = computed(() => {
  const items: any[] = []
  for (const f of facturas.value) {
    const prods = parseProductos(f.productos)
    const factorDescuento = factorDescuentoFactura(f, prods)
    for (const p of prods) {
      items.push({
        no_factura: f.no_factura,
        fecha: f.fecha_emision,
        cliente: f.nombre_cliente,
        producto: p.nombre || 'SIN NOMBRE',
        cantidad: toNumber(p.cantidad),
        precio: toNumber(p.precio) || toNumber(p.precio_venta) || 0,
        costo: toNumber(p.costo) || 0,
        total: getProductoTotalBruto(p) * factorDescuento,
        almacen_id: f.almacen_id || 0,
        almacen_uid: f.almacen_uid || '',
      })
    }
  }
  return items.sort((a, b) => {
    if (a.fecha < b.fecha) return 1
    if (a.fecha > b.fecha) return -1
    return 0
  })
})

const ventasPorCategoria = computed(() => {
  const mapa = new Map<string, { categoria: string; cantidad: number; total: number; costo: number }>()
  for (const f of facturas.value) {
    const prods = parseProductos(f.productos)
    const factorDescuento = factorDescuentoFactura(f, prods)
    for (const p of prods) {
      const cat = p.categoria || p.tipo || 'SIN CATEGORIA'
      const entry = mapa.get(cat) || { categoria: cat, cantidad: 0, total: 0, costo: 0 }
      entry.cantidad += toNumber(p.cantidad)
      entry.total += getProductoTotalBruto(p) * factorDescuento
      entry.costo += (toNumber(p.costo) || 0) * toNumber(p.cantidad)
      mapa.set(cat, entry)
    }
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
})

const ventasPorVendedor = computed(() => {
  const mapa = new Map<string, { vendedor: string; total: number; ganancia: number; count: number }>()
  for (const f of facturas.value) {
    const vendedor = f.vendedor || 'SIN VENDEDOR'
    const entry = mapa.get(vendedor) || { vendedor, total: 0, ganancia: 0, count: 0 }
    entry.total += calcularVentaFactura(f)
    entry.ganancia += calcularGananciaFactura(f)
    entry.count++
    mapa.set(vendedor, entry)
  }
  return Array.from(mapa.values()).sort((a, b) => b.total - a.total)
})

const datosPorDia = computed(() => {
  const mapa = new Map<string, { ventas: number; ganancia: number }>()
  const rango = getRango(rangoActivo.value)
  if (!rango.inicio || !rango.fin) return []

  let d = new Date(rango.inicio + 'T00:00:00')
  const fin = new Date(rango.fin + 'T00:00:00')
  while (d <= fin) {
    const key = d.toISOString().split('T')[0]
    mapa.set(key, { ventas: 0, ganancia: 0 })
    d.setDate(d.getDate() + 1)
  }

  for (const f of facturas.value) {
    const fecha = fechaEfectivaFactura(f)
    if (mapa.has(fecha)) {
      const existing = mapa.get(fecha)!
      existing.ventas += calcularVentaFactura(f)
      existing.ganancia += calcularGananciaFactura(f)
    }
  }

  for (const t of taller.value) {
    if (!esOrdenTallerContabilizable(t)) continue
    const fecha = getTallerFecha(t)
    if (mapa.has(fecha)) {
      const existing = mapa.get(fecha)!
      existing.ventas += getTallerTotal(t)
      existing.ganancia += getTallerTotal(t)
    }
  }

  for (const g of gastos.value) {
    if (!esGastoTaller(g)) continue
    const existing = mapa.get(getGastoFecha(g))
    if (existing) existing.ganancia -= toNumber(g.cantidad || g.monto)
  }

  return Array.from(mapa.entries()).map(([fecha, datos]) => ({ fecha, ...datos }))
})

const datosTallerDiario = computed(() => {
  const mapa = new Map<string, { ingresos: number; ganancia: number; count: number }>()
  const rango = getRango(rangoActivo.value)
  if (!rango.inicio || !rango.fin) return []

  let d = new Date(rango.inicio + 'T00:00:00')
  const fin = new Date(rango.fin + 'T00:00:00')
  while (d <= fin) {
    const key = d.toISOString().split('T')[0]
    mapa.set(key, { ingresos: 0, ganancia: 0, count: 0 })
    d.setDate(d.getDate() + 1)
  }

  for (const t of taller.value) {
    if (!esOrdenTallerContabilizable(t)) continue
    const fecha = getTallerFecha(t)
    if (mapa.has(fecha)) {
      const existing = mapa.get(fecha)!
      existing.ingresos += getTallerTotal(t)
      existing.ganancia += getTallerTotal(t)
      existing.count++
    }
  }

  for (const g of gastos.value) {
    if (!esGastoTaller(g)) continue
    const existing = mapa.get(getGastoFecha(g))
    if (existing) existing.ganancia -= toNumber(g.cantidad || g.monto)
  }

  return Array.from(mapa.entries()).map(([fecha, datos]) => ({ fecha, ...datos }))
})

const datosTallerEstados = computed(() => {
  const ordenEstados = ['RECIBIDO', 'EN_PROCESO', 'COMPLETADO', 'ENTREGADO', 'PARCIAL', 'CANCELADO']
  const mapa = new Map<string, { estado: string; label: string; count: number; ingresos: number; ganancia: number }>()

  for (const estado of ordenEstados) {
    mapa.set(estado, { estado, label: labelEstadoTaller(estado), count: 0, ingresos: 0, ganancia: 0 })
  }

  for (const orden of taller.value) {
    const estado = normalizarEstadoTaller(orden.estado)
    const item = mapa.get(estado) || { estado, label: labelEstadoTaller(estado), count: 0, ingresos: 0, ganancia: 0 }
    item.count++
    item.ingresos += getTallerTotal(orden)
    item.ganancia += esOrdenTallerContabilizable(orden) ? getTallerTotal(orden) : 0
    mapa.set(estado, item)
  }

  return Array.from(mapa.values()).filter(item => item.count > 0 || ordenEstados.includes(item.estado))
})

const datosPorMetodoPago = computed(() => {
  const mapa = new Map<string, number>()
  for (const f of facturas.value) {
    const pago = f.metodo_pago || 'OTRO'
    mapa.set(pago, (mapa.get(pago) || 0) + (f.total || 0))
  }
  return Array.from(mapa.entries()).map(([metodo, total]) => ({ metodo, total }))
})

const labels = computed(() => datosPorDia.value.map(d => {
  const parts = d.fecha.split('-')
  return `${parts[2]}/${parts[1]}`
}))

const dataVentas = computed(() => datosPorDia.value.map(d => d.ventas))
const dataGanancia = computed(() => datosPorDia.value.map(d => d.ganancia))
const tallerTieneDatos = computed(() =>
  datosTallerEstados.value.some(d => d.count > 0)
)

const clientesMap = ref<Map<string, string>>(new Map())

const topClientes = computed(() => {
  const mapa = new Map<string, { total: number; ganancia: number; count: number }>()
  for (const f of facturas.value) {
    const cod = f.cod_cliente || ''
    const key = cod || f.nombre_cliente || 'CONSUMIDOR FINAL'
    const entry = mapa.get(key) || { total: 0, ganancia: 0, count: 0 }
    entry.total += calcularVentaFactura(f)
    entry.ganancia += calcularGananciaFactura(f)
    entry.count++
    mapa.set(key, entry)
  }
  return Array.from(mapa.entries())
    .map(([key, datos]) => {
      const cliente = clientesMap.value.get(key) || key
      return { cliente, ...datos }
    })
    .sort((a, b) => b.total - a.total)
    .slice(0, 10)
})

async function cargarDatos() {
  if (rangoActivo.value === 'personalizado' && rangoPersonalizado.value.length !== 2) return
  if (!almacenStore.almacenes.length) await almacenStore.load()

  const rango = getRango(rangoActivo.value)
  if (!rango.inicio || !rango.fin) return

  loading.value = true
  try {
    const [resFact, resTaller, resCli, resGastos, resCuentas] = await Promise.all([
      window.db.getAll('facturas'),
      window.db.getAll('ordenes_taller'),
      window.db.getAll('clientes'),
      window.db.getAll('gastos'),
      window.db.getAll('cuentas_cobrar'),
    ])

    const cm = new Map<string, string>()
    if (resCli.success) {
      for (const c of resCli.data || []) {
        cm.set(String(c.id), c.nombre || '')
      }
    }
    clientesMap.value = cm

    if (resFact.success) {
      facturas.value = (resFact.data || []).filter((f: any) =>
        fechaEfectivaFactura(f) >= rango.inicio && fechaEfectivaFactura(f) <= rango.fin &&
        coincideAlmacen(f) && esFacturaVenta(f)
      )
    }
    if (resTaller.success) {
      tallerTodas.value = (resTaller.data || []).filter(coincideAlmacen)
      taller.value = tallerTodas.value.filter((t: any) =>
        getTallerFecha(t) >= rango.inicio && getTallerFecha(t) <= rango.fin
      )
    }
    if (resGastos.success) {
      gastos.value = (resGastos.data || []).filter((g: any) =>
        getGastoFecha(g) >= rango.inicio && getGastoFecha(g) <= rango.fin &&
        coincideAlmacen(g)
      )
    }
    if (resCuentas.success) {
      abonosCuentas.value = (resCuentas.data || [])
        .filter(coincideAlmacen)
        .flatMap((cuenta: any) => parsePagosCuenta(cuenta).map((pago: any, index: number) => ({
          id: `${cuenta.id}-${index}`,
          no_factura: cuenta.no_factura || '',
          cliente: cuenta.nombre_cliente || 'CONSUMIDOR FINAL',
          fecha: normalizarFechaRegistro(pago.fecha),
          hora: pago.hora || '',
          metodo: String(pago.metodo || pago.metodo_pago || 'EFECTIVO').toUpperCase(),
          monto: toNumber(pago.monto ?? pago.cantidad),
          almacen_id: cuenta.almacen_id || 0,
          almacen_uid: cuenta.almacen_uid || '',
        })))
        .filter((pago: any) => pago.fecha >= rango.inicio && pago.fecha <= rango.fin)
        .sort((a: any, b: any) => `${b.fecha} ${b.hora}`.localeCompare(`${a.fecha} ${a.hora}`))
    } else {
      abonosCuentas.value = []
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }

  await nextTick()
  await new Promise<void>(resolve => requestAnimationFrame(() => resolve()))
  crearCharts()
}

function crearCharts() {
  if (chartDiario) { chartDiario.destroy(); chartDiario = null }
  if (chartPago) { chartPago.destroy(); chartPago = null }
  if (chartTopClientes) { chartTopClientes.destroy(); chartTopClientes = null }
  if (chartTaller) { chartTaller.destroy(); chartTaller = null }
  if (chartTopProductos) { chartTopProductos.destroy(); chartTopProductos = null }
  if (chartCategoria) { chartCategoria.destroy(); chartCategoria = null }

  if (canvasDiario.value) {
    chartDiario = new Chart(canvasDiario.value, {
      type: 'bar',
      data: {
        labels: labels.value,
        datasets: [
          {
            label: 'Facturado (ventas + taller)',
            data: dataVentas.value,
            backgroundColor: 'rgba(59, 130, 246, 0.7)',
            borderColor: 'rgb(59, 130, 246)',
            borderWidth: 1,
          },
          {
            label: 'Ganancia',
            data: dataGanancia.value,
            backgroundColor: 'rgba(16, 185, 129, 0.7)',
            borderColor: 'rgb(16, 185, 129)',
            borderWidth: 1,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'top' } },
        scales: { y: { beginAtZero: true } },
      },
    })
  }

  if (canvasPago.value) {
    const colores: Record<string, string> = {
      EFECTIVO: 'rgba(16, 185, 129, 0.7)',
      TARJETA: 'rgba(59, 130, 246, 0.7)',
      TRANSFERENCIA: 'rgba(139, 92, 246, 0.7)',
      CHEQUE: 'rgba(245, 158, 11, 0.7)',
      MIXTO: 'rgba(236, 72, 153, 0.7)',
    }
    chartPago = new Chart(canvasPago.value, {
      type: 'doughnut',
      data: {
        labels: datosPorMetodoPago.value.map(d => d.metodo),
        datasets: [{
          data: datosPorMetodoPago.value.map(d => d.total),
          backgroundColor: datosPorMetodoPago.value.map(d => colores[d.metodo] || 'rgba(148, 163, 184, 0.7)'),
          borderWidth: 1,
        }],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom' } },
      },
    })
  }

  if (canvasTopClientes.value && topClientes.value.length > 0) {
    chartTopClientes = new Chart(canvasTopClientes.value, {
      type: 'bar',
      data: {
        labels: topClientes.value.map(c => c.cliente.length > 18 ? c.cliente.slice(0, 16) + '...' : c.cliente),
        datasets: [{
          label: 'Total Comprado',
          data: topClientes.value.map(c => c.total),
          backgroundColor: 'rgba(168, 85, 247, 0.7)',
          borderColor: 'rgb(168, 85, 247)',
          borderWidth: 1,
        }],
      },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          plugins: { legend: { display: false } },
          scales: { x: { beginAtZero: true } },
        },
      })
    }

  if (canvasTopProductos.value && topProductos.value.length > 0) {
    try {
      chartTopProductos = new Chart(canvasTopProductos.value, {
        type: 'bar',
        data: {
          labels: topProductos.value.map(p => p.nombre.length > 20 ? p.nombre.slice(0, 18) + '...' : p.nombre),
          datasets: [
            {
              label: 'Cantidad',
              data: topProductos.value.map(p => p.cantidad),
              backgroundColor: 'rgba(251, 146, 60, 0.7)',
              borderColor: 'rgb(251, 146, 60)',
              borderWidth: 1,
              xAxisID: 'x',
            },
            {
              label: 'Total Venta',
              data: topProductos.value.map(p => p.total),
              backgroundColor: 'rgba(59, 130, 246, 0.7)',
              borderColor: 'rgb(59, 130, 246)',
              borderWidth: 1,
              xAxisID: 'x1',
            },
          ],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          indexAxis: 'y',
          interaction: { mode: 'index', intersect: false },
          plugins: { legend: { position: 'top' } },
          scales: {
            x: { position: 'bottom', beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Cantidad' } },
            x1: { position: 'top', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: 'RD$' } },
            y: { beginAtZero: true, title: { display: true, text: 'Productos' } },
          },
        },
      })
    } catch (_) {}
  }

  if (canvasCategoria.value && ventasPorCategoria.value.length > 0) {
    try {
      chartCategoria = new Chart(canvasCategoria.value, {
        type: 'doughnut',
        data: {
          labels: ventasPorCategoria.value.map(c => c.categoria),
          datasets: [{
            data: ventasPorCategoria.value.map(c => c.total),
            backgroundColor: [
              'rgba(59, 130, 246, 0.7)',
              'rgba(16, 185, 129, 0.7)',
              'rgba(251, 146, 60, 0.7)',
              'rgba(168, 85, 247, 0.7)',
              'rgba(236, 72, 153, 0.7)',
              'rgba(245, 158, 11, 0.7)',
              'rgba(14, 165, 233, 0.7)',
              'rgba(239, 68, 68, 0.7)',
            ],
            borderWidth: 1,
          }],
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          plugins: { legend: { position: 'bottom' } },
        },
      })
    } catch (_) {}
  }

  if (canvasTaller.value && tallerTieneDatos.value) {
    chartTaller = new Chart(canvasTaller.value, {
      type: 'bar',
      data: {
        labels: datosTallerEstados.value.map(d => d.label),
        datasets: [
          {
            label: 'Ordenes',
            data: datosTallerEstados.value.map(d => d.count),
            backgroundColor: [
              'rgba(59, 130, 246, 0.75)',
              'rgba(6, 182, 212, 0.75)',
              'rgba(16, 185, 129, 0.75)',
              'rgba(124, 58, 237, 0.75)',
              'rgba(245, 158, 11, 0.75)',
              'rgba(220, 38, 38, 0.75)',
            ],
            borderColor: [
              'rgb(59, 130, 246)',
              'rgb(6, 182, 212)',
              'rgb(16, 185, 129)',
              'rgb(124, 58, 237)',
              'rgb(245, 158, 11)',
              'rgb(220, 38, 38)',
            ],
            borderWidth: 1,
            yAxisID: 'y',
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              afterLabel: (context: any) => {
                const item = datosTallerEstados.value[context.dataIndex]
                if (!item) return ''
                return [
                  `Valor ordenes: ${getSystemCurrencyCode()} ${formatCurrency(item.ingresos)}`,
                  `Valor contabilizable: ${getSystemCurrencyCode()} ${formatCurrency(item.ganancia)}`,
                ]
              },
            },
          },
        },
        scales: {
          y: { beginAtZero: true, ticks: { precision: 0 }, title: { display: true, text: 'Ordenes' } },
        },
      },
    })
  }
}

function seleccionarRango(key: string) {
  rangoActivo.value = key
  if (key !== 'personalizado') cargarDatos()
}

async function generarReportePDF() {
  Swal.fire({
    title: 'Generando PDF...',
    allowOutsideClick: false,
    didOpen: () => Swal.showLoading(),
  })

  const rango = getRango(rangoActivo.value)
  const almacenArchivo = almacenReporteNombre.value.replace(/[^a-z0-9]+/gi, '_')
  const filename = `Reporte_General_${almacenArchivo}_${rango.inicio}_al_${rango.fin}.pdf`

  const doc = new jsPDF('landscape', 'mm', 'letter')
  const pageW = doc.internal.pageSize.getWidth()
  const margin = 12
  let y = margin

  function addCard(label: string, value: string, color: [number, number, number], x: number, w: number) {
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(x, y, w, 14, 2, 2, 'FD')
    doc.setFillColor(color[0], color[1], color[2])
    doc.roundedRect(x, y, 1.2, 14, 0.6, 0.6, 'F')
    doc.setTextColor(100, 116, 139)
    doc.setFontSize(7)
    doc.text(label, x + 3, y + 5)
    doc.setTextColor(15, 23, 42)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'bold')
    doc.text(value, x + 3, y + 12)
    doc.setFont('helvetica', 'normal')
  }

  // Title
  doc.setFontSize(16)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(30, 41, 59)
  doc.text('Reporte General', margin, y + 6)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(100, 116, 139)
  doc.text(`${almacenReporteNombre.value} · ${rango.inicio} al ${rango.fin}`, margin, y + 12)
  y += 18

  // Summary cards
  const cards = [
    { label: 'Ventas', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.total)}`, color: [37, 99, 235] as [number, number, number] },
    { label: 'Efectivo Total', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.efectivoTotal)}`, color: [22, 163, 74] as [number, number, number] },
    { label: 'Transferencias', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.transferenciaTotal)}`, color: [14, 116, 144] as [number, number, number] },
    { label: 'Tarjetas', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.tarjetaTotal)}`, color: [79, 70, 229] as [number, number, number] },
    { label: 'Ganancia del periodo', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.gananciaTotal)}`, color: [20, 184, 166] as [number, number, number] },
    { label: 'Ganancia Neta', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.gananciaNeta)}`, color: [8, 145, 178] as [number, number, number] },
    { label: 'Ganancia de ventas', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.ganancia)}`, color: [5, 150, 105] as [number, number, number] },
    { label: 'Costo Ventas', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.costo)}`, color: [251, 146, 60] as [number, number, number] },
    { label: 'Descuentos comerciales', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.descuento)}`, color: [245, 158, 11] as [number, number, number] },
    { label: 'Notas credito aplicadas', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.notasCreditoAplicadas)}`, color: [217, 119, 6] as [number, number, number] },
    { label: 'Recargos Tarjeta', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.porcentajeTarjeta)}`, color: [37, 99, 235] as [number, number, number] },
    { label: 'Facturas', value: `${totales.value.count}`, color: [124, 58, 237] as [number, number, number] },
    { label: 'Valor Ordenes Taller', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.tallerValorOrdenes)}`, color: [6, 182, 212] as [number, number, number] },
    { label: 'Taller Facturado', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.tallerIngresos)}`, color: [14, 165, 233] as [number, number, number] },
    { label: 'Taller Cobrado', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.tallerCobrado)}`, color: [124, 58, 237] as [number, number, number] },
    { label: 'Ganancia Taller', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.tallerGanancia)}`, color: [225, 29, 72] as [number, number, number] },
    { label: 'Ordenes Taller', value: `${totales.value.tallerOrdenes}`, color: [14, 165, 233] as [number, number, number] },
    { label: 'Gastos Totales', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.totalGastos)}`, color: [220, 38, 38] as [number, number, number] },
    { label: 'Gastos Operativos', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.totalGastosOperativos)}`, color: [239, 68, 68] as [number, number, number] },
    { label: 'Gastos de Taller', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.totalGastosTaller)}`, color: [225, 29, 72] as [number, number, number] },
    { label: 'Gastos Efectivo', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.totalGastosEfectivo)}`, color: [234, 88, 12] as [number, number, number] },
    { label: 'Gastos Transfer.', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.totalGastosTransferencia)}`, color: [147, 51, 234] as [number, number, number] },
    { label: 'Margen %', value: `${totales.value.margen.toFixed(1)}%`, color: [13, 148, 136] as [number, number, number] },
    { label: 'Ticket Prom.', value: `${getSystemCurrencyCode()} ${formatCurrency(totales.value.ticketPromedio)}`, color: [79, 70, 229] as [number, number, number] },
    { label: 'Items/Fact.', value: `${totales.value.itemsPorFactura.toFixed(1)}`, color: [190, 24, 93] as [number, number, number] },
  ]

  const cardsPorFila = 6
  const separacionCard = 3
  const altoCard = 14
  const cardW = (pageW - margin * 2 - separacionCard * (cardsPorFila - 1)) / cardsPorFila
  for (let i = 0; i < cards.length; i++) {
    const columna = i % cardsPorFila
    if (columna === 0 && i > 0) y += altoCard + separacionCard
    addCard(cards[i].label, cards[i].value, cards[i].color, margin + columna * (cardW + separacionCard), cardW)
  }
  y += altoCard + 6

  // Charts as images
  const chartCanvases = [
    { ref: canvasDiario.value, label: 'Ingresos Diarios' },
    { ref: canvasPago.value, label: 'Ventas por Metodo de Pago' },
    { ref: canvasTaller.value, label: 'Taller' },
    { ref: canvasTopClientes.value, label: 'Top 10 Clientes' },
    { ref: canvasTopProductos.value, label: 'Top 10 Productos' },
    { ref: canvasCategoria.value, label: 'Ventas por Categoria' },
  ]

  const chartsRow = chartCanvases.filter(c => c.ref)
  if (chartsRow.length > 0) {
    const imgW = (pageW - margin * 2 - 6) / Math.min(chartsRow.length, 2)
    for (let row = 0; row < chartsRow.length; row += 2) {
      for (let col = 0; col < 2 && row + col < chartsRow.length; col++) {
        const c = chartsRow[row + col]
        try {
          const dataUrl = c.ref.toDataURL('image/png')
          doc.addImage(dataUrl, 'PNG', margin + col * (imgW + 2), y, imgW, imgW * 0.5)
          doc.setFontSize(7)
          doc.setTextColor(100, 116, 139)
          doc.text(c.label, margin + col * (imgW + 2) + 2, y + 4)
        } catch (_) {}
      }
      y += imgW * 0.5 + 4
    }
    y += 4
  }

  // Table
  const cols = facturasFiltradas.value.length
  const mostrarAlmacen = almacenFiltro.value === TODOS_ALMACENES
  autoTable(doc, {
    startY: y,
    head: [[...(mostrarAlmacen ? ['Almacén'] : []), 'Factura', 'Fecha', 'Cliente', 'Pago', 'Costo', 'Total', 'Ganancia']],
    body: facturasFiltradas.value.slice(0, cols).map((f: any) => [
      ...(mostrarAlmacen ? [nombreAlmacen(f)] : []),
      f.no_factura || '',
      fechaEfectivaFactura(f),
      f.nombre_cliente || '',
      f.metodo_pago || '',
      `${getSystemCurrencyCode()} ${formatCurrency(calcularCostoFactura(f))}`,
      `${getSystemCurrencyCode()} ${formatCurrency(calcularVentaFactura(f))}`,
      `${getSystemCurrencyCode()} ${formatCurrency(calcularGananciaFactura(f))}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [37, 99, 235], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  })

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [[...(mostrarAlmacen ? ['Almacén'] : []), 'Abonos CxC', 'Fecha', 'Cliente', 'Metodo', 'Monto']],
    body: abonosCuentas.value.map((pago: any) => [
      ...(mostrarAlmacen ? [nombreAlmacen(pago)] : []),
      pago.no_factura || '',
      `${pago.fecha || ''} ${pago.hora || ''}`,
      pago.cliente || '',
      pago.metodo || '',
      `${getSystemCurrencyCode()} ${formatCurrency(pago.monto)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [5, 150, 105], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  })

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [[...(mostrarAlmacen ? ['Almacén'] : []), 'Factura', 'Fecha', 'Cliente', 'Producto', 'Cant.', 'Precio', 'Costo', 'Total']],
    body: productosVendidos.value.slice(0, 500).map((p: any) => [
      ...(mostrarAlmacen ? [nombreAlmacen(p)] : []),
      p.no_factura || '',
      p.fecha || '',
      p.cliente || '',
      p.producto || '',
      String(p.cantidad),
      `${getSystemCurrencyCode()} ${formatCurrency(p.precio)}`,
      `${getSystemCurrencyCode()} ${formatCurrency(p.costo)}`,
      `${getSystemCurrencyCode()} ${formatCurrency(p.total)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [251, 146, 60], fontSize: 7 },
    bodyStyles: { fontSize: 6 },
    styles: { cellPadding: 1.5 },
  })

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [['Vendedor', 'Facturas', 'Total', 'Ganancia']],
    body: ventasPorVendedor.value.map((v: any) => [
      v.vendedor,
      String(v.count),
      `${getSystemCurrencyCode()} ${formatCurrency(v.total)}`,
      `${getSystemCurrencyCode()} ${formatCurrency(v.ganancia)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [79, 70, 229], fontSize: 7 },
    bodyStyles: { fontSize: 6 },
    styles: { cellPadding: 1.5 },
  })

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [[...(mostrarAlmacen ? ['Almacén'] : []), 'Gasto de Taller', 'Fecha', 'Metodo', 'Banco', 'Monto']],
    body: gastosTaller.value.map((gasto: any) => [
      ...(mostrarAlmacen ? [nombreAlmacen(gasto)] : []),
      descripcionGastoTaller(gasto),
      `${getGastoFecha(gasto)} ${gasto.hora || ''}`.trim(),
      gasto.metodo_pago || 'EFECTIVO',
      gasto.banco_nombre || '',
      `${getSystemCurrencyCode()} ${formatCurrency(gasto.cantidad || gasto.monto)}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [225, 29, 72], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  })

  autoTable(doc, {
    startY: (doc as any).lastAutoTable.finalY + 8,
    head: [[...(mostrarAlmacen ? ['Almacén'] : []), 'Orden', 'Fecha', 'Cliente', 'Tecnico', 'Estado', 'Total']],
    body: tallerFiltrado.value.map((t: any) => [
      ...(mostrarAlmacen ? [nombreAlmacen(t)] : []),
      t.no_orden || t.no_factura || '',
      getTallerFecha(t),
      t.nombre || t.nombre_cliente || '',
      t.tecnico || '',
      t.estado || '',
      `${getSystemCurrencyCode()} ${formatCurrency(getTallerTotal(t))}`,
    ]),
    theme: 'striped',
    headStyles: { fillColor: [6, 182, 212], fontSize: 8 },
    bodyStyles: { fontSize: 7 },
    styles: { cellPadding: 2 },
  })

  const pdfBlob = doc.output('blob')
  const url = URL.createObjectURL(pdfBlob)

  const result = await Swal.fire({
    title: 'Reporte General',
    width: '90%',
    showConfirmButton: false,
    showCloseButton: true,
    showDenyButton: true,
    denyButtonText: 'Descargar PDF',
    denyButtonColor: '#dc2626',
    showCancelButton: true,
    cancelButtonText: 'Cerrar',
    html: `<iframe src="${url}" style="width:100%;height:70vh;border:none;border-radius:8px"></iframe>`,
  })

  if (result.isDenied) {
    doc.save(filename)
  }

  URL.revokeObjectURL(url)
}

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
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

    <Fieldset legend="Reporte General">
      <div class="flex flex-wrap items-center gap-2 mb-4">
        <Button
          v-for="item in [
            { label: 'Hoy', key: 'hoy', icon: 'pi pi-calendar' },
            { label: 'Ayer', key: 'ayer', icon: 'pi pi-calendar' },
            { label: 'Esta Semana', key: 'semana', icon: 'pi pi-calendar' },
            { label: 'Este Mes', key: 'mes', icon: 'pi pi-calendar' },
            { label: 'Mes Pasado', key: 'mes_pasado', icon: 'pi pi-calendar' },
            { label: 'Este Año', key: 'ano', icon: 'pi pi-calendar' },
            { label: 'Rango', key: 'personalizado', icon: 'pi pi-sliders-h' },
          ]"
          :key="item.key"
          :label="item.label"
          :icon="item.icon"
          :severity="rangoActivo === item.key ? 'primary' : 'secondary'"
          :outlined="rangoActivo !== item.key"
          size="small"
          @click="seleccionarRango(item.key)"
        />
        <Select
          v-model="almacenFiltro"
          :options="almacenesOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Seleccionar almacén"
          class="w-56 ml-auto"
          @change="cargarDatos"
        />
        <Button label="Generar PDF" icon="pi pi-file-pdf" severity="danger" size="small" @click="generarReportePDF" />
      </div>

      <div class="mb-4 text-sm text-surface-500">
        Reporte de: <span class="font-semibold text-surface-700 dark:text-surface-200">{{ almacenReporteNombre }}</span>
      </div>

      <div v-if="rangoActivo === 'personalizado'" class="flex items-center gap-3 mb-4">
        <Calendar v-model="rangoPersonalizado" selectionMode="range" dateFormat="yy-mm-dd"
          placeholder="Seleccionar rango" showIcon fluid @update:modelValue="cargarDatos" />
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 gap-3 mb-4">
        <div class="report-kpi">
          <p class="text-blue-100 text-xs font-semibold">Ventas</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.total) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-green-100 text-xs font-semibold">Efectivo total</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.efectivoTotal) }}</p>
          <p class="text-[10px] text-green-100 mt-1">
            Ventas {{ $formatMoney(totales.efectivoVentas) }} · CxC {{ $formatMoney(totales.efectivoAbonos) }} · Taller {{ $formatMoney(totales.efectivoTaller) }}
          </p>
        </div>
        <div class="report-kpi">
          <p class="text-xs font-semibold">Transferencias</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.transferenciaTotal) }}</p>
          <p class="text-[10px] mt-1">Ventas {{ $formatMoney(totales.transferenciaVentas) }} / CxC {{ $formatMoney(totales.transferenciaAbonos) }} / Taller {{ $formatMoney(totales.transferenciaTaller) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-xs font-semibold">Tarjetas</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.tarjetaTotal) }}</p>
          <p class="text-[10px] mt-1">Ventas {{ $formatMoney(totales.tarjetaVentas) }} / CxC {{ $formatMoney(totales.tarjetaAbonos) }} / Taller {{ $formatMoney(totales.tarjetaTaller) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-emerald-100 text-xs font-semibold">Ganancia del periodo</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.gananciaTotal) }}</p>
          <p class="text-[10px] text-emerald-100 mt-1">Ganancia ventas + ganancia taller</p>
        </div>
        <div class="report-kpi">
          <p class="text-orange-100 text-xs font-semibold">Costo Ventas</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.costo) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-amber-100 text-xs font-semibold">Descuentos comerciales</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.descuento) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-amber-100 text-xs font-semibold">Notas de credito aplicadas</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.notasCreditoAplicadas) }}</p>
          <p class="text-[10px] text-amber-100 mt-1">Equipos recibidos como parte de pago</p>
        </div>
        <div class="report-kpi">
          <p class="text-blue-100 text-xs font-semibold">Recargos de Tarjeta</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.porcentajeTarjeta) }}</p>
          <p class="text-[10px] text-blue-100 mt-1">{{ totales.facturasTarjeta }} factura(s)</p>
        </div>
        <div class="report-kpi">
          <p class="text-violet-100 text-xs font-semibold">Facturas</p>
          <p class="text-xl font-bold">{{ totales.count }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-cyan-100 text-xs font-semibold">Valor Ordenes Taller</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.tallerValorOrdenes) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-sky-100 text-xs font-semibold">Taller Facturado</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.tallerIngresos) }}</p>
          <p class="text-[10px] text-sky-100 mt-1">Ordenes no canceladas del periodo</p>
        </div>
        <div class="report-kpi">
          <p class="text-violet-100 text-xs font-semibold">Taller Cobrado</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.tallerCobrado) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-rose-100 text-xs font-semibold">Ganancia Taller</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.tallerGanancia) }}</p>
          <p class="text-[10px] text-rose-100 mt-1">Taller facturado - gastos de taller</p>
        </div>
        <div class="report-kpi">
          <p class="text-sky-100 text-xs font-semibold">Ordenes Taller</p>
          <p class="text-xl font-bold">{{ totales.tallerOrdenes }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-red-100 text-xs font-semibold">Gastos Totales</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.totalGastos) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-red-100 text-xs font-semibold">Gastos Operativos</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.totalGastosOperativos) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-rose-100 text-xs font-semibold">Gastos de Taller</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.totalGastosTaller) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-orange-100 text-xs font-semibold">Gastos Efectivo</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.totalGastosEfectivo) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-purple-100 text-xs font-semibold">Gastos Transferencia</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.totalGastosTransferencia) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-teal-100 text-xs font-semibold">Margen %</p>
          <p class="text-xl font-bold">{{ totales.margen.toFixed(1) }}%</p>
        </div>
        <div class="report-kpi">
          <p class="text-indigo-100 text-xs font-semibold">Ticket Promedio</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.ticketPromedio) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-pink-100 text-xs font-semibold">Items / Factura</p>
          <p class="text-xl font-bold">{{ totales.itemsPorFactura.toFixed(1) }}</p>
        </div>
        <div class="report-kpi">
          <p class="text-teal-100 text-xs font-semibold">Ganancia de ventas</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.ganancia) }}</p>
          <p class="text-[10px] text-teal-100 mt-1">Incluye notas de credito; resta descuentos comerciales</p>
        </div>
        <div class="report-kpi">
          <p class="text-cyan-100 text-xs font-semibold">Ganancia Neta</p>
          <p class="text-xl font-bold">{{ $formatMoney(totales.gananciaNeta) }}</p>
          <p class="text-[10px] text-cyan-100 mt-1">Ganancia ventas + taller - todos los gastos</p>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h4 class="text-sm font-semibold mb-3">Ingresos Diarios</h4>
          <div v-if="loading" class="h-48 flex items-center justify-center text-surface-400 text-sm">Cargando...</div>
          <div v-else class="h-48">
            <canvas ref="canvasDiario"></canvas>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h4 class="text-sm font-semibold mb-3">Ventas por Metodo de Pago</h4>
          <div v-if="loading" class="h-48 flex items-center justify-center text-surface-400 text-sm">Cargando...</div>
          <div v-else class="h-48">
            <canvas ref="canvasPago"></canvas>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h4 class="text-sm font-semibold mb-3">Ordenes de Taller por Estado</h4>
          <div v-if="loading" class="h-48 flex items-center justify-center text-surface-400 text-sm">Cargando...</div>
          <div v-else-if="tallerTieneDatos" class="h-48 relative">
            <canvas ref="canvasTaller" class="!w-full !h-full"></canvas>
          </div>
          <div v-else class="h-48 flex flex-col items-center justify-center text-surface-400 text-sm">
            <i class="pi pi-chart-line text-2xl mb-2"></i>
            <span>No hay ordenes de taller en este rango.</span>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h4 class="text-sm font-semibold mb-3">Top 10 Clientes</h4>
          <div v-if="loading" class="h-48 flex items-center justify-center text-surface-400 text-sm">Cargando...</div>
          <div v-else class="h-48">
            <canvas ref="canvasTopClientes"></canvas>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h4 class="text-sm font-semibold mb-3">Top 10 Productos Vendidos</h4>
          <div v-if="loading" class="h-48 flex items-center justify-center text-surface-400 text-sm">Cargando...</div>
          <div v-else-if="topProductos.length > 0" class="h-48">
            <canvas ref="canvasTopProductos"></canvas>
          </div>
          <div v-else class="h-48 flex flex-col items-center justify-center text-surface-400 text-sm">
            <i class="pi pi-chart-bar text-2xl mb-2"></i>
            <span>No hay productos vendidos en este rango.</span>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4">
          <h4 class="text-sm font-semibold mb-3">Ventas por Categoria</h4>
          <div v-if="loading" class="h-48 flex items-center justify-center text-surface-400 text-sm">Cargando...</div>
          <div v-else-if="ventasPorCategoria.length > 0" class="h-48">
            <canvas ref="canvasCategoria"></canvas>
          </div>
          <div v-else class="h-48 flex flex-col items-center justify-center text-surface-400 text-sm">
            <i class="pi pi-chart-pie text-2xl mb-2"></i>
            <span>Sin datos de categoria.</span>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden col-span-1 sm:col-span-2">
          <div class="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700">
            <h4 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-list text-primary"></i> Productos Vendidos</h4>
            <span class="text-xs text-surface-400">{{ rangoLabel }}</span>
          </div>
          <div v-if="loading" class="text-center py-6 text-surface-400 text-sm">Cargando...</div>
          <div v-else-if="topProductos.length === 0" class="text-center py-6 text-surface-400 text-sm">Sin ventas en este rango</div>
          <div v-else class="divide-y divide-surface-100 dark:divide-surface-700">
            <div v-for="(p, i) in topProductos" :key="i" class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
              <span class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                :style="{ background: i < 3 ? ['#FFD700','#C0C0C0','#CD7F32'][i] : 'var(--p-primary-300)' }">
                {{ i + 1 }}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ p.nombre }}</div>
                <div class="text-xs text-surface-400">{{ p.cantidad }} vendido(s)</div>
              </div>
              <span class="text-sm font-semibold">{{ $formatMoney(p.total) }}</span>
            </div>
          </div>
        </div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 col-span-1 sm:col-span-2">
          <h4 class="text-sm font-semibold mb-3">Ventas por Vendedor</h4>
          <DataTable
            :value="ventasPorVendedor"
            :loading="loading"
            stripedRows
            paginator
            :rows="10"
            :rowsPerPageOptions="[10, 25, 50]"
            dataKey="vendedor"
            responsiveLayout="scroll"
            sortField="total"
            :sortOrder="-1"
            class="!text-xs"
          >
            <Column field="vendedor" header="Vendedor" sortable />
            <Column field="count" header="Facturas" sortable style="width: 6rem" />
            <Column field="total" header="Total" sortable style="width: 8rem">
              <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
            </Column>
            <Column field="ganancia" header="Ganancia" sortable style="width: 8rem">
              <template #body="{ data }"><span :class="data.ganancia >= 0 ? 'text-emerald-600' : 'text-red-500'" class="font-semibold">{{ $formatMoney(data.ganancia) }}</span></template>
            </Column>
            <template #empty>
              <div class="text-center py-6 text-surface-400">Sin datos de vendedor.</div>
            </template>
          </DataTable>
        </div>
      </div>

      <div class="flex items-center gap-2 mb-3">
        <i class="pi pi-search text-surface-400" />
        <InputText v-model="busqueda" placeholder="Buscar factura, orden, cliente, tecnico, metodo pago..." fluid class="!text-sm" />
      </div>

      <div class="flex items-center justify-between gap-3 mb-2">
        <h4 class="text-sm font-semibold">Abonos de cuentas por cobrar</h4>
        <span class="text-sm font-bold text-emerald-600">Total: {{ $formatMoney(totalAbonosCuentas) }}</span>
      </div>
      <DataTable
        :value="abonosCuentas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        class="mb-6"
      >
        <Column field="no_factura" header="Factura" sortable style="width: 8rem" />
        <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
          <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
        </Column>
        <Column field="fecha" header="Fecha" sortable style="width: 8rem">
          <template #body="{ data }">{{ data.fecha }} {{ data.hora }}</template>
        </Column>
        <Column field="cliente" header="Cliente" sortable />
        <Column field="metodo" header="Metodo" sortable style="width: 9rem" />
        <Column field="monto" header="Monto" sortable style="width: 8rem">
          <template #body="{ data }"><span class="font-semibold text-emerald-600">{{ $formatMoney(data.monto) }}</span></template>
        </Column>
        <template #empty><div class="text-center py-6 text-surface-400">Sin abonos en este rango.</div></template>
      </DataTable>

      <h4 class="text-sm font-semibold mb-2">Facturas</h4>
      <DataTable
        :value="facturasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        sortField="fecha_emision"
        :sortOrder="-1"
      >
        <Column field="no_factura" header="Factura" sortable style="width: 8rem" />
        <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
          <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
        </Column>
        <Column field="fecha_emision" header="Fecha" sortable style="width: 7rem">
          <template #body="{ data }">{{ fechaEfectivaFactura(data) }}</template>
        </Column>
        <Column field="nombre_cliente" header="Cliente" sortable />
        <Column field="metodo_pago" header="Pago" sortable style="width: 7rem" />
        <Column field="descuento" header="Desc." sortable style="width: 6rem">
          <template #body="{ data }">
            <span v-if="data.descuento > 0" class="text-amber-600 font-semibold">{{ $formatMoney(data.descuento) }}</span>
            <span v-else class="text-surface-300">-</span>
          </template>
        </Column>
        <Column header="Costo" sortable style="width: 7rem">
          <template #body="{ data }">
            <span class="text-orange-600 font-semibold">{{ $formatMoney(calcularCostoFactura(data)) }}</span>
          </template>
        </Column>
        <Column header="Valor venta" style="width: 7rem">
          <template #body="{ data }">
            <span class="font-semibold">{{ $formatMoney(calcularVentaFactura(data)) }}</span>
          </template>
        </Column>
        <Column header="Ganancia" style="width: 7rem">
          <template #body="{ data }">
            <span :class="calcularGananciaFactura(data) >= 0 ? 'text-emerald-600 font-semibold' : 'text-red-500'">{{ $formatMoney(calcularGananciaFactura(data)) }}</span>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-400">No hay facturas en este rango.</div>
        </template>
      </DataTable>

      <div class="flex items-center justify-between gap-3 mt-6 mb-2">
        <h4 class="text-sm font-semibold flex items-center gap-2">
          <i class="pi pi-wrench text-rose-500"></i>
          Gastos de Taller
        </h4>
        <span class="text-sm font-bold text-rose-600">Total: {{ $formatMoney(totales.totalGastosTaller) }}</span>
      </div>
      <DataTable
        :value="gastosTaller"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        sortField="fecha"
        :sortOrder="-1"
      >
        <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
          <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
        </Column>
        <Column header="Fecha" sortable style="width: 10rem">
          <template #body="{ data }">{{ getGastoFecha(data) }} {{ data.hora || '' }}</template>
        </Column>
        <Column header="Descripción" sortable>
          <template #body="{ data }">{{ descripcionGastoTaller(data) }}</template>
        </Column>
        <Column field="metodo_pago" header="Método" sortable style="width: 9rem" />
        <Column field="banco_nombre" header="Banco" sortable style="width: 10rem">
          <template #body="{ data }">{{ data.banco_nombre || '-' }}</template>
        </Column>
        <Column field="cantidad" header="Monto" sortable style="width: 8rem">
          <template #body="{ data }">
            <span class="font-semibold text-rose-600">{{ $formatMoney(data.cantidad || data.monto) }}</span>
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-6 text-surface-400">No hay gastos de taller en este rango.</div>
        </template>
      </DataTable>

      <h4 class="text-sm font-semibold mt-6 mb-2">Ordenes de Taller</h4>
      <DataTable
        :value="tallerFiltrado"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        sortField="fecha_entrada"
        :sortOrder="-1"
      >
        <Column field="no_orden" header="Orden" sortable style="width: 8rem">
          <template #body="{ data }">
            <span class="font-semibold">{{ data.no_orden || data.no_factura || '-' }}</span>
          </template>
        </Column>
        <Column v-if="almacenFiltro === TODOS_ALMACENES" header="Almacén" sortable style="width: 10rem">
          <template #body="{ data }">{{ nombreAlmacen(data) }}</template>
        </Column>
        <Column header="Fecha" sortable style="width: 7rem">
          <template #body="{ data }">{{ getTallerFecha(data) || '-' }}</template>
        </Column>
        <Column field="nombre" header="Cliente" sortable />
        <Column field="tecnico" header="Tecnico" sortable style="width: 10rem" />
        <Column field="estado" header="Estado" sortable style="width: 9rem" />
        <Column header="Total" style="width: 7rem">
          <template #body="{ data }">
            <span class="font-semibold">{{ $formatMoney(getTallerTotal(data)) }}</span>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-400">No hay ordenes de taller en este rango.</div>
        </template>
      </DataTable>
    </Fieldset>
  </div>
</template>

<style scoped>
.report-kpi {
  --kpi-accent: #3b82f6;
  --kpi-tint: #eff6ff;
  min-height: 6.25rem;
  padding: 1rem;
  border: 1px solid color-mix(in srgb, var(--kpi-accent) 22%, var(--p-content-border-color, #e2e8f0));
  border-radius: 0.75rem;
  background: linear-gradient(145deg, var(--kpi-tint) 0%, var(--p-content-background, #ffffff) 72%);
  color: var(--p-text-color, #0f172a);
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--kpi-accent) 55%, transparent), 0 1px 2px rgb(15 23 42 / 0.04);
  transition: border-color 160ms ease, box-shadow 160ms ease, transform 160ms ease;
}

.report-kpi:hover {
  border-color: color-mix(in srgb, var(--kpi-accent) 38%, var(--p-content-border-color, #e2e8f0));
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--kpi-accent) 70%, transparent), 0 5px 14px rgb(15 23 42 / 0.06);
  transform: translateY(-1px);
}

.report-kpi:nth-child(6n + 1) { --kpi-accent: #3b82f6; --kpi-tint: #eff6ff; }
.report-kpi:nth-child(6n + 2) { --kpi-accent: #10b981; --kpi-tint: #ecfdf5; }
.report-kpi:nth-child(6n + 3) { --kpi-accent: #0891b2; --kpi-tint: #ecfeff; }
.report-kpi:nth-child(6n + 4) { --kpi-accent: #8b5cf6; --kpi-tint: #f5f3ff; }
.report-kpi:nth-child(6n + 5) { --kpi-accent: #d97706; --kpi-tint: #fffbeb; }
.report-kpi:nth-child(6n) { --kpi-accent: #e11d48; --kpi-tint: #fff1f2; }

:global(.dark) .report-kpi {
  --kpi-tint: color-mix(in srgb, var(--kpi-accent) 8%, var(--p-content-background, #111827));
  border-color: color-mix(in srgb, var(--kpi-accent) 28%, var(--p-content-border-color, #334155));
  background: linear-gradient(145deg, var(--kpi-tint) 0%, var(--p-content-background, #111827) 74%);
}

.report-kpi > p:first-child {
  color: color-mix(in srgb, var(--kpi-accent) 80%, var(--p-text-color, #0f172a)) !important;
}

.report-kpi > p:nth-child(2) {
  margin-top: 0.2rem;
  color: var(--p-text-color, #0f172a) !important;
}

.report-kpi > p:nth-child(n + 3) {
  color: var(--p-text-muted-color, #64748b) !important;
  line-height: 1.35;
}
</style>
