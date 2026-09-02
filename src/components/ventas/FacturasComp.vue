<script setup lang="ts">
import { getLocaleProfile, getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import { useRoute, useRouter } from 'vue-router'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputOtp from 'primevue/inputotp'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Fieldset from 'primevue/fieldset'
import Menu from 'primevue/menu'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import TicketFacturaPrint from './TicketFacturaPrint.vue'
import FacturaPdfPrint from './FacturaPdfPrint.vue'
import { reintegrarInventarioFactura } from '@/composables/useDevoluciones'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { matchesSearch } from '@/composables/useSearch'

import { envioElectron } from '@/funciones/funciones.js'

const toast = useToast()
const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const facturas = ref<any[]>([])
const facturasRaw = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('table')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const dialogProductosVisible = ref(false)
const facturaProductosVisible = ref<any>(null)
const busquedaProductosFactura = ref('')
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')
const isEditing = ref(false)
const selectedFactura = ref<any>(null)
const selectedFacturas = ref<any[]>([])
const dialogMoverAlmacen = ref(false)
const almacenDestino = ref<any>(null)
const almacenesDestino = ref<any[]>([])
const moviendoAlmacen = ref(false)
const busqueda = ref('')
const rangoActivo = ref<string>('todo')
const rangoPersonalizado = ref<Date[]>([])
const comprobanteFiltro = ref('')
const reenviandoAlanube = ref(false)

watch(() => route.query.factura, (numero) => {
  const facturaSolicitada = String(numero || '').trim()
  if (!facturaSolicitada) return
  rangoActivo.value = 'todo'
  comprobanteFiltro.value = ''
  busqueda.value = facturaSolicitada
}, { immediate: true })

const actionMenu = ref()
const facturaAccion = ref<any>(null)
const actionMenuItems = computed(() => [
  { label: 'Ver productos', icon: 'pi pi-shopping-bag', command: () => verProductosFactura(facturaAccion.value) },
  { label: 'Imprimir', icon: 'pi pi-print', command: () => imprimirFactura(facturaAccion.value) },
  { label: 'Ver PDF', icon: 'pi pi-file-pdf', command: () => verFacturaPdf(facturaAccion.value) },
  ...(getLocaleProfile().tax.electronicProviderEnabled
    ? [{ label: 'Reintentar Alanube', icon: 'pi pi-refresh', disabled: () => reenviandoAlanube.value, command: () => reintentarAlanube(facturaAccion.value) }]
    : []),
  { label: 'Editar', icon: 'pi pi-pencil', command: () => abrirEditar(facturaAccion.value) },
  { label: 'WhatsApp', icon: 'pi pi-whatsapp', command: () => compartirWhatsAppFactura(facturaAccion.value) },
  { separator: true },
  { label: 'Eliminar', icon: 'pi pi-trash', command: () => confirmarBorrar(facturaAccion.value) },
])

function toggleActionMenu(event: Event, factura: any) {
  facturaAccion.value = factura
  actionMenu.value.toggle(event)
}

function verProductosFactura(factura: any) {
  if (!factura) return
  facturaProductosVisible.value = factura
  busquedaProductosFactura.value = ''
  dialogProductosVisible.value = true
}

function nombreProductoFactura(producto: any): string {
  return String(producto?.nombre || producto?.descripcion || producto?.producto || 'Producto sin nombre')
}

function cantidadProductoFactura(producto: any): number {
  return Number(producto?.cantidad ?? producto?.quantity ?? 1) || 1
}

function precioProductoFactura(producto: any): number {
  return Number(producto?.precio_final ?? producto?.precio_venta ?? producto?.precio_unitario ?? producto?.precio ?? producto?.price ?? 0) || 0
}

function totalProductoFactura(producto: any): number {
  return Number(producto?.total ?? (cantidadProductoFactura(producto) * precioProductoFactura(producto))) || 0
}

function valoresDetalleProductoFactura(valorPlural: any, valorSingular: any): string[] {
  const valores = Array.isArray(valorPlural) ? valorPlural : (valorSingular ? [valorSingular] : [])
  return [...new Set(valores.map(valor => String(valor || '').trim()).filter(Boolean))]
}

function detalleVariantesProductoFactura(producto: any): string {
  const capacidades = valoresDetalleProductoFactura(producto?.capacidades, producto?.capacidad)
    .map(valor => /^\d+(?:\.\d+)?$/.test(valor) ? `${valor} GB` : valor)
  const colores = valoresDetalleProductoFactura(producto?.colores, producto?.color)
  return [
    capacidades.length ? `Capacidad: ${capacidades.join(', ')}` : '',
    colores.length ? `Color: ${colores.join(', ')}` : '',
  ].filter(Boolean).join(' · ')
}

const productosFacturaFiltrados = computed(() => {
  const texto = busquedaProductosFactura.value.trim().toLowerCase()
  const productos = productosFactura(facturaProductosVisible.value)
  if (!texto) return productos
  return productos.filter((producto: any) => [
    producto?.nombre,
    producto?.descripcion,
    producto?.producto,
    producto?.codigo,
    producto?.codigo_barra,
    producto?.imei,
    producto?.serial,
    producto?.capacidad,
    producto?.capacidades,
    producto?.color,
    producto?.colores,
  ].some(valor => String(valor || '').toLowerCase().includes(texto)))
})

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'POS' } catch { return 'POS' }
}

async function registrarAuditoria(accion: string, factura: any, detalle: any = {}, resultado = 'OK') {
  try {
    await window.electron.invoke('auditoria:registrar', {
      modulo: 'ventas',
      accion,
      entidad: 'facturas',
      entidad_id: Number(factura?.id || 0),
      referencia: factura?.no_factura || factura?.ncf || '',
      usuario: usuarioAuditoria(),
      detalle,
      resultado,
    })
  } catch (_) {}
}

async function compartirWhatsAppFactura(factura: any) {
  const telefono = factura.telefono_cliente || ''
  if (!telefono) {
    toast.add({ severity: 'warn', summary: 'WhatsApp', detail: 'El cliente no tiene telefono registrado', life: 3000 })
    return
  }
  const mensaje = encodeURIComponent(
    `Factura ${factura.no_factura}\nTotal: RD$${Number(factura.total).toFixed(2)}\nCliente: ${factura.nombre_cliente}\nFecha: ${factura.fecha_emision}`
  )
  window.open(`https://wa.me/${telefono.replace(/[^0-9]/g, '')}?text=${mensaje}`, '_blank')
  await registrarAuditoria('compartir_whatsapp', factura, { telefono })
}

function getRango(key: string): { inicio: string; fin: string } | null {
  if (key === 'todo') return null
  const now = new Date()
  const y = (d: Date) => d.toISOString().split('T')[0]
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
    case 'personalizado': {
      if (rangoPersonalizado.value.length === 2 && rangoPersonalizado.value[0] && rangoPersonalizado.value[1])
        return { inicio: y(rangoPersonalizado.value[0]), fin: y(rangoPersonalizado.value[1]) }
      return null
    }
    default: return { inicio: y(now), fin: y(now) }
  }
}

const rango = computed(() => getRango(rangoActivo.value))

const comprobantesLista = ref<string[]>([])

const ticketPrintRef = ref<any>(null)
const facturaPdfRef = ref<any>(null)

const metodosPago = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Mixto', value: 'MIXTO' },
]

const tiposFactura = [
  { label: 'Factura de Venta', value: 'FACTURA_VENTA' },
  { label: 'Factura de Compra', value: 'FACTURA_COMPRA' },
  { label: 'Nota de Debito', value: 'NOTA_DEBITO' },
  { label: 'Nota de Credito', value: 'NOTA_CREDITO' },
  { label: 'Proforma', value: 'PROFORMA' },
]

const estadosFactura = [
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'Pagada', value: 'PAGADA' },
  { label: 'Anulada', value: 'ANULADA' },
  { label: 'Vencida', value: 'VENCIDA' },
  { label: 'Crediticio', value: 'CREDITICIO' },
]

const canalesVenta = [
  { label: 'Local', value: 'LOCAL' },
  { label: 'Online', value: 'ONLINE' },
  { label: 'Telefono', value: 'TELEFONO' },
  { label: 'WhatsApp', value: 'WHATSAPP' },
  { label: 'Otro', value: 'OTRO' },
]

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCorto = ref('')

const formDefault = () => ({
  cheque: '',
  token: '',
  cajero: '',
  no_factura: '',
  tipo_factura: 'FACTURA_VENTA',
  comprobante: '',
  cod_cliente: '',
  nombre_cliente: '',
  telefono_cliente: '',
  productos: '',
  vendedor: '',
  metodo_pago: 'EFECTIVO',
  tarjeta: 0,
  transferencia: 0,
  efectivo: 0,
  canal_venta: 'LOCAL',
  fecha_emision: new Date(),
  impuesto: 0,
  descuento: 0,
  subtotal: 0,
  costo: 0,
  total: 0,
  ganancia: 0,
  financiera: '',
  estado_factura: 'PENDIENTE',
  fecha_estado: new Date(),
  mes: '',
  year: '',
  hora: '',
  otro: '',
  nota: '',
  usuario: '',
  identificadordb: '',
  total_institucion: 0,
  total_cliente: 0,
})

const form = ref(formDefault())

const facturasFiltradas = computed(() => {
  let items = facturas.value

  if (rango.value) {
    items = items.filter((f: any) =>
      f.fecha_emision >= rango.value!.inicio && f.fecha_emision <= rango.value!.fin
    )
  }

  if (comprobanteFiltro.value) {
    items = items.filter((f: any) => f.comprobante === comprobanteFiltro.value)
  }

  if (busqueda.value) items = items.filter(f => matchesSearch(f, busqueda.value, ['no_factura', 'nombre_cliente', 'telefono_cliente', 'estado_factura', 'total', 'comprobante', 'ncf', 'cod_cliente']))

  return items
})

const resumenFacturas = computed(() => {
  const facturasValidas = facturasFiltradas.value.filter((factura: any) => {
    const estado = String(factura.estado_factura || '').trim().toUpperCase()
    return !['ANULADA', 'ANULADO', 'CANCELADA', 'CANCELADO', 'ELIMINADA', 'DEVUELTA'].includes(estado)
  })

  return facturasValidas.reduce((resumen, factura: any) => {
    const total = Number(factura.total || 0)
    const estado = String(factura.estado_factura || 'PENDIENTE').trim().toUpperCase()
    resumen.facturado += total
    resumen.ganancia += gananciaFactura(factura)
    resumen.cantidad += 1
    if (['PAGADA', 'PAGADO', 'COMPLETADA', 'COMPLETADO', 'CERRADA'].includes(estado)) resumen.cobrado += total
    else resumen.pendiente += total
    return resumen
  }, { facturado: 0, cobrado: 0, pendiente: 0, ganancia: 0, cantidad: 0 })
})

const facturasParaEliminar = computed(() => {
  if (selectedFactura.value) return [selectedFactura.value]
  return selectedFacturas.value || []
})

const totalSeleccionadoEliminar = computed(() =>
  facturasParaEliminar.value.reduce((sum, factura) => sum + Number(factura?.total || 0), 0)
)

function formatCurrency(n: number): string {
  if (n == null) return '0.00'
  return Number(n).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const parts = fechaStr.split('-')
  if (parts.length !== 3) return fechaStr
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getEstadoSeverity(estado: string): string {
  switch (estado) {
    case 'PAGADA': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    case 'ANULADA': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    case 'VENCIDA': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
    case 'CREDITICIO': return 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
    default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  }
}

function getEcfStatus(factura: any): string {
  const tipo = obtenerTipoEcf(factura)
  if (!tipo) return ''
  const otro = getAlanubeOtroFactura(factura)
  const response = otro?.alanube_response || {}
  return String(
    factura?._ecf?.status ||
    factura?._ecf?.legal_status ||
    factura?.alanube_status ||
    response?.legalStatus ||
    response?.status ||
    (otro?.alanube_error ? 'ERROR_ENVIO' : 'PENDIENTE')
  ).toUpperCase()
}

function getEcfStatusLabel(factura: any): string {
  const status = getEcfStatus(factura)
  if (!status) return ''
  if (status === 'ACCEPTED' || status === 'ACEPTADA') return 'Aceptada DGII'
  if (status === 'REJECTED' || status === 'RECHAZADA') return 'Rechazada'
  if (status === 'ERROR_ENVIO') return 'Error envio'
  if (status === 'REGISTERED' || status === 'ENVIADA') return 'Enviada'
  return 'Pendiente'
}

function getEcfStatusClass(factura: any): string {
  const status = getEcfStatus(factura)
  if (status === 'ACCEPTED' || status === 'ACEPTADA') return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  if (status === 'REJECTED' || status === 'RECHAZADA' || status === 'ERROR_ENVIO') return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
  if (status === 'REGISTERED' || status === 'ENVIADA') return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
}

async function cargarFacturas() {
  loading.value = true
  try {
    const res = await window.db.getAll('facturas')
    if (res.success) {
      let ecfPorFactura: Record<string, any> = {}
      try {
        const ecfRes = await window.db.getAll('facturas_ecf')
        if (ecfRes.success && Array.isArray(ecfRes.data)) {
          ecfPorFactura = ecfRes.data.reduce((acc: Record<string, any>, row: any) => {
            acc[String(row.factura_id)] = row
            return acc
          }, {})
        }
      } catch (_) {}
      const todas = (res.data || []).filter((factura: any) => {
        const tipo = String(factura.tipo_factura || '').toUpperCase()
        const estado = String(factura.estado_factura || '').toUpperCase()
        return !['COTIZACION', 'NOTA_CREDITO', 'NOTA CREDITO', 'RECIBIDO'].includes(tipo)
          && estado !== 'COTIZACION'
      }).map((factura: any) => ({
        ...factura,
        _ecf: ecfPorFactura[String(factura.id)] || null,
      }))
      facturasRaw.value = todas
      facturas.value = verTodosAlmacenes.value ? todas : filterByAlmacen(todas)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar las facturas', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  facturas.value = verTodosAlmacenes.value ? facturasRaw.value : filterByAlmacen(facturasRaw.value)
})

function abrirCrear() {
  isEditing.value = false
  selectedFactura.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function getAlanubeOtroFactura(factura: any): any {
  try {
    const otro = typeof factura?.otro === 'string' ? JSON.parse(factura.otro || '{}') : factura?.otro || {}
    return otro || {}
  } catch {
    return {}
  }
}

function esFacturaElectronicaAceptadaLocal(factura: any): boolean {
  const tipo = String(factura?.tipo_comprobante || factura?.comprobante || '').toUpperCase()
  const otro = getAlanubeOtroFactura(factura)
  const response = otro?.alanube_response || {}
  const legalStatus = String(
    factura?.legal_status ||
    factura?.alanube_legal_status ||
    factura?.ecf_legal_status ||
    factura?._ecf?.legal_status ||
    otro?.legal_status ||
    response?.legalStatus ||
    response?.legal_status ||
    ''
  ).toUpperCase()
  return tipo.startsWith('E') && legalStatus === 'ACCEPTED'
}

async function esFacturaElectronicaAceptada(factura: any): Promise<boolean> {
  if (!factura?.id) return false
  if (esFacturaElectronicaAceptadaLocal(factura)) return true
  try {
    const res = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [factura.id])
    const ecf = res?.success && Array.isArray(res.data) ? res.data[0] : null
    return String(ecf?.legal_status || '').toUpperCase() === 'ACCEPTED'
  } catch {
    return false
  }
}

async function bloquearSiFacturaElectronicaAceptada(factura: any, accion = 'modificar'): Promise<boolean> {
  if (!(await esFacturaElectronicaAceptada(factura))) return false
  await registrarAuditoria('bloqueo_fiscal', factura, { accion, motivo: 'DGII_ACCEPTED' }, 'BLOQUEADO')
  toast.add({
    severity: 'warn',
    summary: 'Factura fiscal bloqueada',
    detail: `Esta factura electronica fue aceptada por DGII. No se puede ${accion}; usa reimpresion o nota de credito.`,
    life: 4500,
  })
  return true
}

function parseJson(value: any, fallback: any) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return value
}

function limpiarNumeroFiscal(value: any): string {
  return String(value || '').replace(/\D/g, '')
}

function redondearMonto(value: any): number {
  return Number(Number(value || 0).toFixed(2))
}

function alanubeAuthHeader(tokenValue: string): string {
  const tokenClean = tokenValue.trim()
  return tokenClean.toLowerCase().startsWith('bearer ') ? tokenClean : `Bearer ${tokenClean}`
}

function obtenerTipoEcf(factura: any): string {
  const directo = String(factura?.tipo_comprobante || factura?.comprobante || '').toUpperCase()
  if (/^E\d{2}$/.test(directo)) return directo
  const ncf = String(factura?.ncf || '').toUpperCase()
  const match = ncf.match(/^E\d{2}/)
  return match ? match[0] : ''
}

function obtenerNcfFactura(factura: any): string {
  return String(factura?.ncf || '').trim().toUpperCase()
}

function productosFactura(factura: any): any[] {
  const productos = parseJson(factura?.productos, [])
  return Array.isArray(productos) ? productos : []
}

function costoFactura(factura: any): number {
  const costoGuardado = Number(factura?.costo || 0)
  if (costoGuardado !== 0) return costoGuardado
  return productosFactura(factura).reduce((total: number, item: any) => {
    return total + (Number(item?.costo || 0) * Number(item?.cantidad || 1))
  }, 0)
}

function gananciaFactura(factura: any): number {
  const gananciaGuardada = Number(factura?.ganancia || 0)
  if (gananciaGuardada !== 0) return gananciaGuardada
  return Number(factura?.total || 0) - costoFactura(factura)
}

function buildAlanubeSender(company: any, empresa: any) {
  return {
    rnc: limpiarNumeroFiscal(company?.rnc || company?.identification || company?.identificationNumber || company?.taxId || empresa?.rnc || empresa?.legal || ''),
    companyName: company?.companyName || company?.businessName || company?.name || company?.legalName || empresa?.nombre || 'EMPRESA',
    tradename: company?.tradename || company?.tradeName || company?.commercialName || empresa?.nombre || 'EMPRESA',
    address: company?.address || company?.direccion || empresa?.direccion || '',
    phone: company?.phone || company?.telefono || empresa?.telefono || '',
    email: company?.email || empresa?.email || '',
    stampDate: new Date().toISOString().split('T')[0],
  }
}

function buildAlanubeBuyer(factura: any) {
  const nombre = String(factura?.nombre_cliente || 'CONSUMIDOR FINAL').toUpperCase()
  return {
    rnc: limpiarNumeroFiscal(factura?.rnc_cliente || factura?.cedula_cliente || factura?.cod_cliente || ''),
    companyName: nombre,
    businessName: nombre,
    contact: nombre,
    phone: factura?.telefono_cliente || '',
    address: factura?.direccion_cliente || '',
    email: factura?.email_cliente || '',
  }
}

function buildAlanubeItemDetails(factura: any) {
  const tasa = Number(factura?.impuesto || 0) > 0 && Number(factura?.subtotal || 0) > 0
    ? redondearMonto((Number(factura.impuesto) / Number(factura.subtotal)) * 100)
    : 18
  return productosFactura(factura).map((item: any, index: number) => {
    const cantidad = Number(item.cantidad || item.quantity || 1)
    const precio = redondearMonto(item.precio || item.precio_venta || item.precio_unitario || item.price || 0)
    return {
      lineNumber: index + 1,
      billingIndicator: tasa > 0 ? 1 : 4,
      itemName: String(item.nombre || item.descripcion || item.producto || 'PRODUCTO').slice(0, 80),
      goodServiceIndicator: 1,
      itemDescription: String(item.nombre || item.descripcion || item.producto || 'PRODUCTO').slice(0, 1000),
      quantityItem: cantidad,
      unitPriceItem: precio,
      itemAmount: redondearMonto(precio * cantidad),
    }
  })
}

function buildAlanubeTotals(factura: any) {
  const total = redondearMonto(factura?.total || 0)
  const impuesto = redondearMonto(factura?.impuesto || 0)
  const gravado = redondearMonto(Math.max(0, total - impuesto))
  return {
    taxedAmount: gravado,
    taxedAmount18: gravado,
    exemptAmount: impuesto > 0 ? 0 : total,
    itbis18: impuesto,
    totalItbis: impuesto,
    totalAmount: total,
  }
}

async function cargarEmpresaAlanube() {
  const [companyRes, empresaRes] = await Promise.all([
    window.config.get('alanube_company_data'),
    window.db.getAll('empresa'),
  ])
  const rawCompany = String(companyRes?.data || '')
  const company = rawCompany ? parseJson(rawCompany, {}) : {}
  const empresa = empresaRes?.success && empresaRes.data?.length ? empresaRes.data[0] : {}
  return { company, empresa }
}

async function guardarResultadoEcf(factura: any, params: {
  endpoint: string
  httpStatus: number
  payload: any
  response: any
  ok: boolean
  error?: string
  alanubeIdCompania: string
}) {
  const response = params.response && typeof params.response === 'object' ? params.response : {}
  const legalStatus = String(response?.legalStatus || response?.legal_status || '').toUpperCase()
  const now = new Date().toISOString()
  const status = !params.ok
    ? 'ERROR_ENVIO'
    : legalStatus === 'ACCEPTED'
      ? 'ACEPTADA'
      : legalStatus === 'REJECTED'
        ? 'RECHAZADA'
        : String(response?.status || 'ENVIADA').toUpperCase()
  const record = {
    factura_id: factura.id,
    no_factura: factura.no_factura || '',
    ncf: obtenerNcfFactura(factura),
    tipo_comprobante: obtenerTipoEcf(factura),
    alanube_id: response?.id || '',
    alanube_id_compania: params.alanubeIdCompania,
    document_number: response?.documentNumber || response?.document_number || obtenerNcfFactura(factura),
    document_stamp_url: response?.documentStampUrl || response?.document_stamp_url || '',
    security_code: response?.securityCode || response?.security_code || '',
    status,
    legal_status: legalStatus,
    sequence_consumed: response?.sequenceConsumed ? 1 : 0,
    pdf_url: response?.pdf || '',
    xml_url: response?.xml || '',
    resume_xml_url: response?.resumeXml || '',
    endpoint: params.endpoint,
    http_status: params.httpStatus,
    payload: JSON.stringify(params.payload || {}),
    response: JSON.stringify(params.response || {}),
    error: params.error || '',
    enviado_at: now,
    aceptado_at: legalStatus === 'ACCEPTED' ? (response?.signatureDate || now) : '',
  }

  const existente = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [factura.id])
  const existenteId = existente?.success && Array.isArray(existente.data) && existente.data.length > 0 ? existente.data[0].id : 0
  const saveRes = existenteId
    ? await window.db.update('facturas_ecf', existenteId, record)
    : await window.db.insert('facturas_ecf', record)
  if (!saveRes?.success) throw new Error(saveRes?.error || 'No se pudo guardar estado e-CF')

  const otroActual = getAlanubeOtroFactura(factura)
  await window.db.update('facturas', factura.id, {
    otro: JSON.stringify({
      ...otroActual,
      facturacion_electronica: 1,
      alanube_endpoint: params.endpoint,
      alanube_payload: params.payload,
      alanube_response: params.response,
      alanube_status: params.httpStatus,
      alanube_enviado_at: now,
      alanube_id_compania: params.alanubeIdCompania,
      alanube_error: params.error || '',
    }),
  })
}

async function reintentarAlanube(factura: any) {
  if (!getLocaleProfile().tax.electronicProviderEnabled) return
  if (!factura?.id) return
  if (await esFacturaElectronicaAceptada(factura)) {
    toast.add({ severity: 'info', summary: 'Alanube', detail: 'Esta factura ya fue aceptada por DGII', life: 3000 })
    return
  }

  const compTipo = obtenerTipoEcf(factura)
  const ncf = obtenerNcfFactura(factura)
  if (!['E31', 'E32'].includes(compTipo) || !ncf) {
    toast.add({ severity: 'warn', summary: 'Alanube', detail: 'Solo se puede reenviar facturas electronicas E31 o E32 con NCF', life: 3500 })
    return
  }

  reenviandoAlanube.value = true
  try {
    const [activoRes, baseRes, tokenRes, companiaRes] = await Promise.all([
      window.config.get('facturacion_electronica_activa'),
      window.config.get('alanube_base_url'),
      window.config.get('alanube_token'),
      window.config.get('alanube_id_compania'),
    ])
    if (String(activoRes?.data || '') !== '1') throw new Error('La facturacion electronica esta apagada')
    const baseUrl = String(baseRes?.data || 'https://api.alanube.co/dom/v1').replace(/\/+$/, '')
    const tokenAlanube = String(tokenRes?.data || '').trim()
    const alanubeIdCompania = String(companiaRes?.data || '').trim()
    if (!tokenAlanube || !alanubeIdCompania) throw new Error('Configura token e id compania de Alanube')

    const { company, empresa } = await cargarEmpresaAlanube()
    const endpoint = compTipo === 'E31' ? 'fiscal-invoices' : 'invoices'
    const payload: any = {
      company: { id: alanubeIdCompania },
      idDoc: {
        encf: ncf,
        documentType: Number(compTipo.replace(/\D/g, '')),
        incomeType: 1,
        paymentType: String(factura.metodo_pago || '').toUpperCase() === 'CREDITO' ? 2 : 1,
        issueDate: factura.fecha_emision || new Date().toISOString().split('T')[0],
        internalDocumentNumber: factura.no_factura || String(factura.id),
      },
      sender: buildAlanubeSender(company, empresa),
      totals: buildAlanubeTotals(factura),
      itemDetails: buildAlanubeItemDetails(factura),
      config: { sendToDgii: true },
    }
    if (compTipo === 'E31' || Number(factura.total || 0) >= 250000) payload.buyer = buildAlanubeBuyer(factura)

    const res = await fetch(`${baseUrl}/${endpoint}`, {
      method: 'POST',
      headers: {
        Accept: 'application/json',
        'Content-Type': 'application/json',
        Authorization: alanubeAuthHeader(tokenAlanube),
      },
      body: JSON.stringify(payload),
    })
    const contentType = res.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await res.json() : await res.text()
    const error = res.ok ? '' : (typeof data === 'string' ? data : data?.message || data?.error || `Alanube respondio ${res.status}`)
    await guardarResultadoEcf(factura, {
      endpoint,
      httpStatus: res.status,
      payload,
      response: data,
      ok: res.ok,
      error,
      alanubeIdCompania,
    })
    if (!res.ok) throw new Error(error)
    await registrarAuditoria('reintentar_alanube', factura, { endpoint, http_status: res.status }, 'OK')
    toast.add({ severity: 'success', summary: 'Alanube', detail: 'Factura reenviada correctamente', life: 3000 })
    await cargarFacturas()
  } catch (error: any) {
    await registrarAuditoria('reintentar_alanube', factura, { error: error?.message || 'No se pudo reenviar' }, 'ERROR')
    toast.add({ severity: 'error', summary: 'Alanube', detail: error?.message || 'No se pudo reenviar la factura', life: 4500 })
  } finally {
    reenviandoAlanube.value = false
  }
}

async function abrirEditar(factura: any) {
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'editar')) return
  router.push(`/ventas/editar/${factura.id}`)
}

async function confirmarBorrar(factura: any) {
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'eliminar')) return
  selectedFactura.value = factura
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function confirmarBorrarSeleccionadas() {
  if (!selectedFacturas.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una factura', life: 2500 })
    return
  }
  for (const factura of selectedFacturas.value) {
    if (await bloquearSiFacturaElectronicaAceptada(factura, 'eliminar')) return
  }
  selectedFactura.value = null
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function abrirMoverAlmacenSeleccionadas() {
  if (!selectedFacturas.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una factura', life: 2500 })
    return
  }
  almacenDestino.value = null
  try {
    await almacenStore.load()
    const origenes = new Set(selectedFacturas.value.map((factura: any) => String(factura.almacen_uid || '')).filter(Boolean))
    almacenesDestino.value = almacenStore.almacenes.filter((almacen: any) =>
      origenes.size !== 1 || !origenes.has(String(almacen.uid || ''))
    )
    dialogMoverAlmacen.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function aplicarMoverAlmacenSeleccionadas() {
  if (!almacenDestino.value || moviendoAlmacen.value || !selectedFacturas.value.length) return
  const destinoId = Number(almacenDestino.value.id || 0)
  const destinoUid = String(almacenDestino.value.uid || '')
  const destinoNombre = String(almacenDestino.value.nombre || 'almacen destino')
  const seleccion = [...selectedFacturas.value]
  moviendoAlmacen.value = true
  try {
    for (const factura of seleccion) {
      const res = await window.db.update('facturas', factura.id, {
        almacen_id: destinoId,
        almacen_uid: destinoUid,
      })
      if (!res.success) throw new Error(res.error || `No se pudo mover la factura ${factura.no_factura || factura.id}`)
      await registrarAuditoria('mover_almacen', factura, {
        almacen_origen_id: factura.almacen_id || 0,
        almacen_origen_uid: factura.almacen_uid || '',
        almacen_destino_id: destinoId,
        almacen_destino_uid: destinoUid,
        almacen_destino_nombre: destinoNombre,
      })
    }
    dialogMoverAlmacen.value = false
    selectedFacturas.value = []
    toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: `${seleccion.length} factura(s) movida(s) a ${destinoNombre}`, life: 3000 })
    await cargarFacturas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron mover las facturas', life: 4500 })
  } finally {
    moviendoAlmacen.value = false
  }
}

async function solicitarOtpEliminarFactura() {
  const facturas = facturasParaEliminar.value
  if (!facturas.length) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: facturas[0]?.id,
      facturaIds: facturas.map(f => f.id),
      no_factura: facturas.length === 1 ? facturas[0]?.no_factura : '',
      nombre_cliente: facturas.length === 1 ? facturas[0]?.nombre_cliente : '',
      cantidad: facturas.length,
      total: totalSeleccionadoEliminar.value,
    }) as any
    if (res.success) {
      for (const factura of facturas) await registrarAuditoria('solicitar_otp_eliminar', factura, { cantidad: facturas.length }, 'OK')
    deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (e: any) {
    deleteOtpError.value = e.message || 'Error solicitando codigo'
  } finally {
    deleteOtpLoading.value = false
  }
}

function dateToStr(d: Date | string): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

async function guardar() {
  if (!form.value.no_factura.trim() && !form.value.nombre_cliente.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El numero de factura o nombre del cliente es requerido', life: 3000 })
    return
  }

  try {
    const data = {
      cheque: form.value.cheque.trim(),
      token: form.value.token.trim(),
      cajero: form.value.cajero.trim().toUpperCase(),
      no_factura: form.value.no_factura.trim().toUpperCase(),
      tipo_factura: form.value.tipo_factura,
      comprobante: form.value.comprobante.trim(),
      cod_cliente: form.value.cod_cliente.trim().toUpperCase(),
      nombre_cliente: form.value.nombre_cliente.trim().toUpperCase(),
      telefono_cliente: form.value.telefono_cliente.trim(),
      productos: form.value.productos,
      vendedor: form.value.vendedor.trim().toUpperCase(),
      metodo_pago: form.value.metodo_pago,
      tarjeta: form.value.tarjeta || 0,
      transferencia: form.value.transferencia || 0,
      efectivo: form.value.efectivo || 0,
      canal_venta: form.value.canal_venta,
      fecha_emision: dateToStr(form.value.fecha_emision),
      impuesto: form.value.impuesto || 0,
      descuento: form.value.descuento || 0,
      subtotal: form.value.subtotal || 0,
      costo: form.value.costo || 0,
      total: form.value.total || 0,
      ganancia: form.value.ganancia || 0,
      financiera: form.value.financiera,
      estado_factura: form.value.estado_factura,
      fecha_estado: dateToStr(form.value.fecha_estado),
      mes: form.value.mes,
      year: form.value.year,
      hora: form.value.hora,
      otro: form.value.otro.trim().toUpperCase(),
      nota: form.value.nota.trim().toUpperCase(),
      usuario: form.value.usuario.trim().toUpperCase(),
      identificadordb: form.value.identificadordb.trim(),
      total_institucion: form.value.total_institucion || 0,
      total_cliente: form.value.total_cliente || 0,
    }

    if (isEditing.value) {
      const res = await window.db.update('facturas', selectedFactura.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Factura actualizada', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('facturas', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Factura creada', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarFacturas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const facturas = facturasParaEliminar.value
    if (!facturas.length) return
    deleteOtpError.value = ''
    const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
    if (!/^\d{4}$/.test(codigo)) {
      deleteOtpError.value = 'Introduce el codigo de 4 digitos'
      return
    }
    deleteOtpConfirmando.value = true
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: facturas[0]?.id,
      facturaIds: facturas.map(f => f.id),
      codigo,
    }) as any
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    let eliminadas = 0
    let inventariosConError = 0
    let cuentasCobrarEliminadas = 0
    for (const factura of facturas) {
      let res = await window.db.delete('facturas', factura.id)
      cuentasCobrarEliminadas += Number((res as any)?.data?.cuentas_cobrar_eliminadas || 0)
      let verificacion = res.success ? await window.db.getById('facturas', factura.id) : null
      if (res.success && verificacion?.success && verificacion.data) {
        res = await window.db.delete('facturas', factura.id)
        verificacion = await window.db.getById('facturas', factura.id)
      }

      if (!res.success || !verificacion?.success || verificacion.data) {
        await registrarAuditoria('eliminar_factura', factura, { error: res.error || '' }, 'ERROR')
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || verificacion?.error || `No se pudo eliminar ${factura.no_factura || factura.id}`, life: 3000 })
        return
      }

      eliminadas++
      let inventarioRestaurado = true
      if (String(factura.tipo_factura || '').toUpperCase() === 'FACTURA_VENTA') {
        try {
          await reintegrarInventarioFactura(factura.productos)
        } catch (error: any) {
          inventarioRestaurado = false
          inventariosConError++
          await registrarAuditoria('error_reintegrar_inventario_factura_eliminada', factura, {
            error: error?.message || 'No se pudo restaurar el inventario',
          }, 'ERROR')
        }
      }
      await registrarAuditoria('eliminar_factura', factura, { inventario_restaurado: inventarioRestaurado }, 'OK')
    }
    toast.add({
      severity: inventariosConError ? 'warn' : 'success',
      summary: 'Exito',
      detail: inventariosConError
        ? `${eliminadas} factura(s) eliminada(s); ${inventariosConError} requiere(n) revision de inventario`
        : `${eliminadas} factura(s) eliminada(s)${cuentasCobrarEliminadas ? ` y ${cuentasCobrarEliminadas} cuenta(s) por cobrar asociada(s)` : ''}`,
      life: inventariosConError ? 5000 : 3000,
    })
    deleteDialogVisible.value = false
    selectedFacturas.value = []
    selectedFactura.value = null
    await cargarFacturas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

async function imprimirFactura(factura: any) {
  await registrarAuditoria('imprimir_ticket', factura)
  ticketPrintRef.value?.printTicket(factura)
}

async function verFacturaPdf(factura: any) {
  await registrarAuditoria('generar_pdf', factura)
  facturaPdfRef.value?.printFactura(factura)
}

useCloudRefresh(['facturas', 'facturas_ecf'], cargarFacturas)

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || ''
      api.value = datosJSON.VITE_LINK_API || ''
      token.value = datosJSON.VITE_TOKEN || ''
      patronTelefono.value = datosJSON.VITE_PATRON_TELEFONO || ''
      linkImpresora.value = datosJSON.VITE_IMPRESORA_LOCAL || ''
      patroncedula.value = datosJSON.VITE_PATRON_CEDULA || ''
      tokenCorto.value = datosJSON.VITE_TOKEN_CORTO || ''
    }
  } catch (error) {
    console.error('Error cargando configuracion:', error)
  }

  await cargarFacturas()

  try {
    const res = await window.db.getAll('comprobantes_fiscales')
    if (res.success) {
      comprobantesLista.value = (res.data || []).map((c: any) => c.tipo).filter(Boolean) as string[]
    }
  } catch (_) {}
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Facturas">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar factura..." />
        </IconField>

        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex flex-wrap gap-1">
            <Button
              v-for="item in [
                { label: 'Todo', key: 'todo' },
                { label: 'Hoy', key: 'hoy' },
                { label: 'Ayer', key: 'ayer' },
                { label: 'Semana', key: 'semana' },
                { label: 'Mes', key: 'mes' },
                { label: 'Rango', key: 'personalizado' },
              ]"
              :key="item.key"
              :label="item.label"
              size="small"
              :severity="rangoActivo === item.key ? 'primary' : 'secondary'"
              :outlined="rangoActivo !== item.key"
              @click="rangoActivo = item.key"
            />
          </div>

          <Calendar
            v-if="rangoActivo === 'personalizado'"
            v-model="rangoPersonalizado"
            selectionMode="range"
            dateFormat="yy-mm-dd"
            placeholder="Seleccionar rango"
            showIcon
          />

          <Select
            v-model="comprobanteFiltro"
            :options="comprobantesLista"
            placeholder="Comprobante"
            clearable
            class="w-36"
            size="small"
          />
        </div>

        <div class="flex items-center gap-2">
          <label v-if="puedeVerTodosAlmacenes" class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
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
          <Button
            v-if="selectedFacturas.length"
            :label="`Cambiar almacen (${selectedFacturas.length})`"
            icon="pi pi-warehouse"
            severity="success"
            @click="abrirMoverAlmacenSeleccionadas"
          />
          <Button
            v-if="selectedFacturas.length"
            :label="`Eliminar (${selectedFacturas.length})`"
            icon="pi pi-trash"
            severity="danger"
            @click="confirmarBorrarSeleccionadas"
          />
          <Button label="Nueva Factura" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-3 mb-4">
        <div class="factura-summary-card">
          <div class="factura-summary-icon"><i class="pi pi-chart-line"></i></div>
          <div class="min-w-0"><p>Total facturado</p><strong>{{ $formatMoney(resumenFacturas.facturado) }}</strong><small>Sin anuladas ni canceladas</small></div>
        </div>
        <div class="factura-summary-card">
          <div class="factura-summary-icon"><i class="pi pi-check-circle"></i></div>
          <div class="min-w-0"><p>Total cobrado</p><strong>{{ $formatMoney(resumenFacturas.cobrado) }}</strong><small>Facturas pagadas</small></div>
        </div>
        <div class="factura-summary-card">
          <div class="factura-summary-icon"><i class="pi pi-clock"></i></div>
          <div class="min-w-0"><p>Pendiente</p><strong>{{ $formatMoney(resumenFacturas.pendiente) }}</strong><small>Por cobrar o completar</small></div>
        </div>
        <div class="factura-summary-card">
          <div class="factura-summary-icon"><i class="pi pi-arrow-up-right"></i></div>
          <div class="min-w-0"><p>Ganancia estimada</p><strong>{{ $formatMoney(resumenFacturas.ganancia) }}</strong><small>Segun costo registrado</small></div>
        </div>
        <div class="factura-summary-card">
          <div class="factura-summary-icon"><i class="pi pi-file"></i></div>
          <div class="min-w-0"><p>Facturas</p><strong>{{ resumenFacturas.cantidad }}</strong><small>Registros encontrados</small></div>
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        v-model:selection="selectedFacturas"
        :value="facturasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Acciones" style="width: 5rem">
          <template #body="{ data }">
            <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded @click.stop="toggleActionMenu($event, data)" v-tooltip="'Acciones'" />
          </template>
        </Column>
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="no_factura" header="No. Factura" sortable style="width: 10rem" />
        <Column field="comprobante" header="Comprobante" sortable style="width: 8rem" />
        <Column header="e-CF" style="width: 9rem">
          <template #body="{ data }">
            <span v-if="getEcfStatus(data)" class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEcfStatusClass(data)">
              {{ getEcfStatusLabel(data) }}
            </span>
            <span v-else class="text-xs text-surface-400">--</span>
          </template>
        </Column>
        <Column field="nombre_cliente" header="Cliente" sortable />
        <Column field="fecha_emision" header="Fecha Emision" sortable style="width: 9rem">
          <template #body="{ data }">{{ formatFecha(data.fecha_emision) }}</template>
        </Column>
        <Column field="total" header="Total" sortable style="width: 10rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column header="Costo" style="width: 10rem">
          <template #body="{ data }"><span class="text-orange-600 dark:text-orange-400">{{ $formatMoney(costoFactura(data)) }}</span></template>
        </Column>
        <Column header="Ganancia" style="width: 10rem">
          <template #body="{ data }"><span class="font-semibold text-emerald-600 dark:text-emerald-400">{{ $formatMoney(gananciaFactura(data)) }}</span></template>
        </Column>
        <Column field="metodo_pago" header="Pago" sortable style="width: 9rem" />
        <Column field="estado_factura" header="Estado" sortable style="width: 9rem">
          <template #body="{ data }">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEstadoSeverity(data.estado_factura)">
              {{ data.estado_factura || 'PENDIENTE' }}
            </span>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay facturas registradas.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="facturasFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay facturas registradas.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="factura in facturasFiltradas"
            :key="factura.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(factura)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ factura.id }}</span>
              <div class="flex items-center gap-1">
                <span v-if="getEcfStatus(factura)" class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEcfStatusClass(factura)">
                  {{ getEcfStatusLabel(factura) }}
                </span>
                <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEstadoSeverity(factura.estado_factura)">
                  {{ factura.estado_factura || 'PENDIENTE' }}
                </span>
              </div>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-base leading-tight truncate">{{ factura.no_factura || 'Sin numero' }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ factura.nombre_cliente || 'Sin cliente' }}</p>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-calendar text-surface-400"></i>
                <span class="truncate">{{ formatFecha(factura.fecha_emision) || '--' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-dollar text-surface-400"></i>
                <span class="truncate font-semibold">{{ $formatMoney(factura.total) }}</span>
              </div>
              <div class="grid grid-cols-2 gap-2 pt-1">
                <div class="rounded-lg bg-orange-50 dark:bg-orange-950/30 px-2 py-1.5">
                  <p class="text-[10px] uppercase tracking-wide text-orange-700 dark:text-orange-300">Costo</p>
                  <p class="text-sm font-semibold text-orange-700 dark:text-orange-300">{{ $formatMoney(costoFactura(factura)) }}</p>
                </div>
                <div class="rounded-lg bg-emerald-50 dark:bg-emerald-950/30 px-2 py-1.5">
                  <p class="text-[10px] uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Ganancia</p>
                  <p class="text-sm font-semibold text-emerald-700 dark:text-emerald-300">{{ $formatMoney(gananciaFactura(factura)) }}</p>
                </div>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-credit-card text-surface-400"></i>
                <span class="truncate">{{ factura.metodo_pago || '--' }}</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded size="small" @click.stop="toggleActionMenu($event, factura)" v-tooltip="'Acciones'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacen" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedFacturas.length }}</strong> factura(s) seleccionada(s) a otro almacen:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacen destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para el traslado.</p>
        <p class="text-xs text-surface-500">Se cambia el almacen del registro de venta; el inventario descontado originalmente no se modifica.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover facturas" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacenSeleccionadas" />
      </template>
    </Dialog>

    <EditarFacturaComp
      :factura-id="editingFacturaId"
      :visible="dialogEditarVisible"
      @close="dialogEditarVisible = false"
      @saved="dialogEditarVisible = false; cargarFacturas()"
    />

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Eliminar factura"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="facturasParaEliminar.length === 1">Seguro que deseas eliminar la factura <strong>{{ facturasParaEliminar[0]?.no_factura }}</strong>?</span>
          <span v-else>Seguro que deseas eliminar <strong>{{ facturasParaEliminar.length }}</strong> facturas seleccionadas?</span>
        </div>
        <div v-if="facturasParaEliminar.length > 1" class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
          Total combinado: <strong>{{ $formatMoney(totalSeleccionadoEliminar) }}</strong>
        </div>
        <div v-if="deleteOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">
            Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.
          </p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly mask />
        </div>
        <p v-if="deleteOtpError" class="text-red-500 text-xs text-center">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-envelope"
          severity="danger"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarFactura"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          @click="borrar"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogProductosVisible"
      :header="`Productos · Factura ${facturaProductosVisible?.no_factura || ''}`"
      modal
      :style="{ width: 'min(48rem, 96vw)' }"
    >
      <div class="space-y-4 pt-1">
        <div class="flex flex-wrap items-center justify-between gap-2 text-sm text-surface-500">
          <span>{{ facturaProductosVisible?.nombre_cliente || 'CONSUMIDOR FINAL' }}</span>
          <strong class="text-surface-900 dark:text-surface-0">Total: {{ $formatMoney(facturaProductosVisible?.total || 0) }}</strong>
        </div>
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busquedaProductosFactura" placeholder="Buscar por producto, código, IMEI o serial..." fluid />
        </IconField>
        <div v-if="productosFactura(facturaProductosVisible).length" class="overflow-x-auto rounded-xl border border-surface-200 dark:border-surface-700">
          <table class="w-full min-w-[38rem] text-sm border-collapse">
            <thead class="bg-surface-100 dark:bg-surface-800 text-surface-600 dark:text-surface-300">
              <tr>
                <th class="text-left px-3 py-2.5 font-semibold">Producto</th>
                <th class="text-center px-3 py-2.5 font-semibold">Cant.</th>
                <th class="text-right px-3 py-2.5 font-semibold">Precio</th>
                <th class="text-right px-3 py-2.5 font-semibold">Total</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(producto, index) in productosFacturaFiltrados" :key="producto.uid || producto.id || producto.imei || producto.serial || index" class="border-t border-surface-200 dark:border-surface-700">
                <td class="px-3 py-3">
                  <p class="font-medium text-surface-900 dark:text-surface-0">{{ nombreProductoFactura(producto) }}</p>
                  <p v-if="detalleVariantesProductoFactura(producto)" class="text-xs font-medium text-primary-600 dark:text-primary-400 mt-0.5">{{ detalleVariantesProductoFactura(producto) }}</p>
                  <p v-if="producto.imei || producto.serial" class="text-xs text-surface-500 mt-0.5">{{ producto.imei ? `IMEI: ${producto.imei}` : `Serial: ${producto.serial}` }}</p>
                </td>
                <td class="px-3 py-3 text-center">{{ cantidadProductoFactura(producto) }}</td>
                <td class="px-3 py-3 text-right">{{ $formatMoney(precioProductoFactura(producto)) }}</td>
                <td class="px-3 py-3 text-right font-semibold">{{ $formatMoney(totalProductoFactura(producto)) }}</td>
              </tr>
            </tbody>
          </table>
          <div v-if="productosFacturaFiltrados.length === 0" class="py-8 text-center text-surface-500">No hay productos que coincidan con la búsqueda.</div>
        </div>
        <div v-else class="py-10 text-center text-surface-500">
          <i class="pi pi-shopping-bag text-3xl block mb-3 text-surface-400"></i>
          Esta factura no tiene productos registrados.
        </div>
      </div>
    </Dialog>
    <TicketFacturaPrint ref="ticketPrintRef" />
    <FacturaPdfPrint ref="facturaPdfRef" />
    <Menu ref="actionMenu" :model="actionMenuItems" popup />
  </div>
</template>

<style scoped>
.factura-summary-card {
  --card-accent: #3b82f6;
  --card-tint: #eff6ff;
  display: flex;
  align-items: center;
  gap: 0.8rem;
  min-width: 0;
  padding: 0.9rem 1rem;
  border: 1px solid color-mix(in srgb, var(--card-accent) 22%, var(--p-surface-200));
  border-radius: 0.85rem;
  background: linear-gradient(145deg, var(--card-tint), var(--p-surface-0) 74%);
  box-shadow: inset 0 2px 0 color-mix(in srgb, var(--card-accent) 48%, transparent), 0 1px 2px rgb(15 23 42 / 0.04);
}

.factura-summary-card:nth-child(2) { --card-accent: #10b981; --card-tint: #ecfdf5; }
.factura-summary-card:nth-child(3) { --card-accent: #f59e0b; --card-tint: #fffbeb; }
.factura-summary-card:nth-child(4) { --card-accent: #8b5cf6; --card-tint: #f5f3ff; }
.factura-summary-card:nth-child(5) { --card-accent: #0891b2; --card-tint: #ecfeff; }

.factura-summary-icon {
  display: grid;
  place-items: center;
  width: 2.4rem;
  height: 2.4rem;
  flex: 0 0 2.4rem;
  border-radius: 0.7rem;
  color: var(--card-accent);
  background: color-mix(in srgb, var(--card-accent) 10%, white);
}

.factura-summary-card p {
  margin: 0;
  color: color-mix(in srgb, var(--card-accent) 76%, var(--p-surface-900));
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.045em;
  text-transform: uppercase;
}

.factura-summary-card strong {
  display: block;
  margin-top: 0.15rem;
  overflow: hidden;
  color: var(--p-surface-900);
  font-size: clamp(1rem, 1.3vw, 1.22rem);
  line-height: 1.25;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.factura-summary-card small {
  display: block;
  margin-top: 0.18rem;
  overflow: hidden;
  color: var(--p-surface-400);
  font-size: 0.68rem;
  text-overflow: ellipsis;
  white-space: nowrap;
}

:global(.dark) .factura-summary-card {
  --card-tint: color-mix(in srgb, var(--card-accent) 8%, var(--p-surface-900));
  border-color: color-mix(in srgb, var(--card-accent) 28%, var(--p-surface-700));
  background: linear-gradient(145deg, var(--card-tint), var(--p-surface-900) 76%);
}

:global(.dark) .factura-summary-icon {
  background: color-mix(in srgb, var(--card-accent) 14%, var(--p-surface-800));
}

:global(.dark) .factura-summary-card p {
  color: color-mix(in srgb, var(--card-accent) 70%, white);
}

:global(.dark) .factura-summary-card strong {
  color: var(--p-surface-0);
}
</style>
