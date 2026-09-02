<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { locale: systemLocale, isDominicanFiscal } = useLocaleProfile()
import { ref, computed, onMounted, watch } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputOtp from 'primevue/inputotp'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import Menu from 'primevue/menu'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import TicketFacturaPrint from '@/components/ventas/TicketFacturaPrint.vue'
import FacturaPdfPrint from '@/components/ventas/FacturaPdfPrint.vue'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'

const toast = useToast()
const auth = useAuthStore()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()

const notas = ref<any[]>([])
const notasRaw = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const emitiendo = ref(false)
const reintentandoId = ref<number>(0)
const facturasOrigenDisponibles = ref<any[]>([])
const clientesMap = ref<Record<string, any>>({})
const facturacionElectronicaActiva = ref(false)
const comprobanteE34 = ref<any>(null)
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)

const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')
const selectedNota = ref<any>(null)

const busqueda = ref('')
const rangoActivo = ref<string>('todo')
const rangoPersonalizado = ref<Date[]>([])
const estadoFiltro = ref('')

const notaActionMenu = ref()
const notaAccion = ref<any>(null)

const ticketPrintRef = ref<any>(null)
const facturaPdfRef = ref<any>(null)

const facturaOrigenSeleccionadaId = ref<number | null>(null)
const modificationCode = ref<number | null>(1)
const motivoTexto = ref('')

const opcionesModificacion = [
  { label: '1 - Anulación total', value: 1 },
  { label: '2 - Corrige texto del comprobante fiscal modificado', value: 2 },
  { label: '3 - Corrige montos del comprobante fiscal modificado', value: 3 },
  { label: '4 - Reemplazo de NCF emitido en contingencia', value: 4 },
]

const facturaOrigenSeleccionada = computed(() =>
  facturasOrigenDisponibles.value.find((f: any) => f.id === facturaOrigenSeleccionadaId.value) || null
)

function diferenciaDias(fechaStr: string): number {
  if (!fechaStr) return 0
  const fecha = new Date(fechaStr)
  if (isNaN(fecha.getTime())) return 0
  const msPorDia = 24 * 60 * 60 * 1000
  return Math.floor((new Date().getTime() - fecha.getTime()) / msPorDia)
}

const creditNoteIndicatorPreview = computed(() =>
  facturaOrigenSeleccionada.value ? (diferenciaDias(facturaOrigenSeleccionada.value.fecha_emision) > 30 ? 1 : 0) : 0
)

function parseJson(value: any, fallback: any) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try { return JSON.parse(value) } catch { return fallback }
  }
  return value
}

function productosFactura(factura: any): any[] {
  const productos = parseJson(factura?.productos, [])
  return Array.isArray(productos) ? productos : []
}

const itemsOrigenPreview = computed(() => productosFactura(facturaOrigenSeleccionada.value))

function getOtroNota(nota: any): any {
  return parseJson(nota?.otro, {})
}

function facturaOrigenNcf(nota: any): string {
  return String(getOtroNota(nota)?.factura_origen_ncf || '')
}

function esNotaAceptada(nota: any): boolean {
  return String(nota?.estado_factura || '').toUpperCase() === 'ACEPTADA'
}

function estadoLabel(nota: any): string {
  const s = String(nota?.estado_factura || 'PENDIENTE').toUpperCase()
  if (s === 'ACEPTADA') return 'Aceptada DGII'
  if (s === 'RECHAZADA') return 'Rechazada'
  if (s === 'ERROR_ENVIO') return 'Error envío'
  if (s === 'ENVIADA') return 'Enviada'
  return 'Pendiente'
}

function estadoClass(nota: any): string {
  const s = String(nota?.estado_factura || 'PENDIENTE').toUpperCase()
  if (s === 'ACEPTADA') return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
  if (s === 'RECHAZADA' || s === 'ERROR_ENVIO') return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
  if (s === 'ENVIADA') return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  return 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'
}

function formatCurrency(n: number): string {
  if (n == null) return '0.00'
  return Number(n).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const parts = fechaStr.split('-')
  if (parts.length !== 3) return fechaStr
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
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

const notasFiltradas = computed(() => {
  let items = notas.value

  if (rango.value) {
    items = items.filter((f: any) => f.fecha_emision >= rango.value!.inicio && f.fecha_emision <= rango.value!.fin)
  }

  if (estadoFiltro.value) {
    items = items.filter((f: any) => String(f.estado_factura || '').toUpperCase() === estadoFiltro.value)
  }

  const texto = busqueda.value.toLowerCase().trim()
  if (texto) {
    items = items.filter((f: any) =>
      f.no_factura?.toLowerCase().includes(texto) ||
      f.ncf?.toLowerCase().includes(texto) ||
      f.nombre_cliente?.toLowerCase().includes(texto) ||
      facturaOrigenNcf(f).toLowerCase().includes(texto) ||
      f.total?.toString().includes(texto)
    )
  }

  return items
})

const notaActionItems = computed(() => {
  const nota = notaAccion.value
  const items: any[] = [
    { label: 'Imprimir', icon: 'pi pi-print', command: () => nota && imprimirNota(nota) },
    { label: 'Ver PDF local', icon: 'pi pi-file-pdf', command: () => nota && verNotaPdf(nota) },
  ]
  if (nota?._ecf?.document_stamp_url) {
    items.push({ label: 'Ver comprobante DGII', icon: 'pi pi-verified', command: () => window.open(nota._ecf.document_stamp_url, '_blank') })
  }
  if (nota?._ecf?.pdf_url) {
    items.push({ label: 'Descargar PDF Alanube', icon: 'pi pi-cloud-download', command: () => window.open(nota._ecf.pdf_url, '_blank') })
  }
  if (String(nota?.estado_factura || '').toUpperCase() === 'ERROR_ENVIO') {
    items.push({ label: 'Reintentar envío', icon: 'pi pi-refresh', command: () => nota && reintentarNotaCredito(nota) })
  }
  items.push({ separator: true })
  items.push({ label: 'Eliminar', icon: 'pi pi-trash', class: 'text-red-500', command: () => nota && confirmarBorrar(nota) })
  return items
})

function abrirMenuAccionesNota(event: Event, nota: any) {
  notaAccion.value = nota
  notaActionMenu.value?.toggle(event)
}

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'CONTABILIDAD' } catch { return 'CONTABILIDAD' }
}

async function registrarAuditoria(accion: string, nota: any, detalle: any = {}, resultado = 'OK') {
  try {
    await window.electron.invoke('auditoria:registrar', {
      modulo: 'contabilidad',
      accion,
      entidad: 'facturas',
      entidad_id: Number(nota?.id || 0),
      referencia: nota?.no_factura || nota?.ncf || '',
      usuario: usuarioAuditoria(),
      detalle,
      resultado,
    })
  } catch (_) {}
}

async function cargarNotas() {
  loading.value = true
  try {
    const [facturasRes, ecfRes] = await Promise.all([
      window.db.getAll('facturas'),
      window.db.getAll('facturas_ecf'),
    ])
    if (facturasRes.success) {
      let ecfPorFactura: Record<string, any> = {}
      if (ecfRes.success && Array.isArray(ecfRes.data)) {
        ecfPorFactura = ecfRes.data.reduce((acc: Record<string, any>, row: any) => {
          acc[String(row.factura_id)] = row
          return acc
        }, {})
      }
      const todas = (facturasRes.data || [])
        .filter((f: any) => f.tipo_factura === 'NOTA_CREDITO_ECF')
        .map((f: any) => ({ ...f, _ecf: ecfPorFactura[String(f.id)] || null }))
      notasRaw.value = todas
      notas.value = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value ? todas : filterByAlmacen(todas)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: facturasRes.error || 'No se pudieron cargar las notas de crédito', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function cargarFacturasOrigen() {
  try {
    const [facturasRes, ecfRes] = await Promise.all([
      window.db.getAll('facturas'),
      window.db.getAll('facturas_ecf'),
    ])
    if (facturasRes.success) {
      let ecfPorFactura: Record<string, any> = {}
      if (ecfRes.success && Array.isArray(ecfRes.data)) {
        ecfPorFactura = ecfRes.data.reduce((acc: Record<string, any>, row: any) => {
          acc[String(row.factura_id)] = row
          return acc
        }, {})
      }
      const elegibles = (facturasRes.data || []).filter((f: any) => {
        if (f.tipo_factura !== 'FACTURA_VENTA') return false
        const tipoComp = String(f.tipo_comprobante || f.comprobante || '').toUpperCase()
        if (!['E31', 'E32'].includes(tipoComp)) return false
        const ecf = ecfPorFactura[String(f.id)]
        return String(ecf?.legal_status || '').toUpperCase() === 'ACCEPTED'
      })
      facturasOrigenDisponibles.value = filterByAlmacen(elegibles)
    }
  } catch (_) {}
}

async function cargarClientes() {
  try {
    const res = await window.db.getAll('clientes')
    if (res.success) {
      clientesMap.value = (res.data || []).reduce((acc: Record<string, any>, c: any) => {
        acc[String(c.id)] = c
        return acc
      }, {})
    }
  } catch (_) {}
}

async function cargarConfigFiscal() {
  try {
    const activoRes = await window.config.get('facturacion_electronica_activa')
    facturacionElectronicaActiva.value = isDominicanFiscal.value && String(activoRes?.data || '') === '1'
  } catch (_) {}
}

async function cargarComprobanteE34() {
  try {
    const res = await window.db.getAll('comprobantes_fiscales')
    if (res.success) {
      comprobanteE34.value = (res.data || []).find((c: any) => String(c.tipo || '').toUpperCase() === 'E34' && c.activo) || null
    }
  } catch (_) {}
}

watch(verTodosAlmacenes, () => { cargarNotas() })

function resetForm() {
  facturaOrigenSeleccionadaId.value = null
  modificationCode.value = 1
  motivoTexto.value = ''
}

async function abrirCrear() {
  resetForm()
  await Promise.all([cargarFacturasOrigen(), cargarClientes(), cargarConfigFiscal(), cargarComprobanteE34()])
  if (!isDominicanFiscal.value || !facturacionElectronicaActiva.value) {
    toast.add({ severity: 'warn', summary: 'Facturación electrónica apagada', detail: 'Activa la facturación electrónica en Configuración antes de emitir notas de crédito e-CF', life: 4500 })
    return
  }
  if (!comprobanteE34.value) {
    toast.add({ severity: 'warn', summary: 'Comprobante E34 no configurado', detail: 'Configura una secuencia E34 activa en Configuración > Comprobantes Electrónicos', life: 4500 })
    return
  }
  dialogVisible.value = true
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

function obtenerNcf(factura: any): string {
  return String(factura?.ncf || '').trim().toUpperCase()
}

function buildSenderNotaCredito(companyData: any, empresa: any) {
  return {
    rnc: limpiarNumeroFiscal(companyData?.rnc || companyData?.identification || companyData?.identificationNumber || companyData?.taxId || empresa?.legal || ''),
    companyName: companyData?.companyName || companyData?.businessName || companyData?.name || companyData?.legalName || empresa?.nombre || 'EMPRESA',
    tradename: companyData?.tradename || companyData?.tradeName || companyData?.commercialName || empresa?.nombre || 'EMPRESA',
    address: companyData?.address || companyData?.direccion || empresa?.direccion || '',
    phone: companyData?.phone || companyData?.telefono || empresa?.telefono || '',
    email: companyData?.email || empresa?.email || '',
    stampDate: new Date().toISOString().split('T')[0],
  }
}

function buildBuyerNotaCredito(facturaOrigen: any, cliente: any) {
  const nombre = String(facturaOrigen?.nombre_cliente || 'CONSUMIDOR FINAL').toUpperCase()
  return {
    rnc: limpiarNumeroFiscal(cliente?.rnc || cliente?.cedula || ''),
    companyName: nombre,
    businessName: nombre,
    contact: nombre,
    phone: cliente?.telefono || cliente?.whatsapp || facturaOrigen?.telefono_cliente || '',
    address: cliente?.direccion || '',
    email: cliente?.email || '',
  }
}

function buildItemDetailsNotaCredito(facturaOrigen: any) {
  const tasa = Number(facturaOrigen?.impuesto || 0) > 0 && Number(facturaOrigen?.subtotal || 0) > 0
    ? redondearMonto((Number(facturaOrigen.impuesto) / Number(facturaOrigen.subtotal)) * 100)
    : 0
  return productosFactura(facturaOrigen).map((item: any, index: number) => {
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

function buildTotalsNotaCredito(facturaOrigen: any) {
  const total = redondearMonto(facturaOrigen?.total || 0)
  const impuesto = redondearMonto(facturaOrigen?.impuesto || 0)
  const gravado = redondearMonto(Math.max(0, total - impuesto))
  const exento = redondearMonto(gravado > 0 ? 0 : total)
  const totals: any = { totalAmount: total }
  if (gravado > 0) {
    totals.totalTaxedAmount = gravado
    totals.i1AmountTaxed = gravado
    totals.itbisS1 = 18
    totals.itbis1Total = impuesto
    totals.itbisTotal = impuesto
  }
  if (exento > 0) totals.exemptAmount = exento
  return totals
}

function buildPayloadNotaCredito(params: {
  ncf: string
  facturaOrigen: any
  cliente: any
  modificationCode: number
  reason: string
  creditNoteIndicator: number
  noNota: string
  companyData: any
  empresa: any
  alanubeIdCompania: string
}) {
  const payload: any = {
    company: params.alanubeIdCompania ? { id: params.alanubeIdCompania } : undefined,
    idDoc: {
      encf: params.ncf,
      documentType: 34,
      creditNoteIndicator: params.creditNoteIndicator,
      paymentType: String(params.facturaOrigen?.metodo_pago || '').toUpperCase() === 'CREDITO' ? 2 : 1,
      incomeType: 1,
      issueDate: new Date().toISOString().split('T')[0],
      internalDocumentNumber: params.noNota,
    },
    informationReference: {
      ncfModified: obtenerNcf(params.facturaOrigen),
      modificationCode: params.modificationCode,
      reasonForModification: params.reason.trim().slice(0, 90),
    },
    sender: buildSenderNotaCredito(params.companyData, params.empresa),
    totals: buildTotalsNotaCredito(params.facturaOrigen),
    itemDetails: buildItemDetailsNotaCredito(params.facturaOrigen),
    config: { sendToDgii: true },
  }
  if (String(params.facturaOrigen?.tipo_comprobante || '').toUpperCase() === 'E31' || Number(params.facturaOrigen?.total || 0) >= 250000) {
    payload.buyer = buildBuyerNotaCredito(params.facturaOrigen, params.cliente)
  }
  return payload
}

async function obtenerOtroActual(notaId: number) {
  try {
    const res = await window.db.getById('facturas', notaId)
    return parseJson(res?.data?.otro, {})
  } catch { return {} }
}

async function guardarResultadoEcfNota(notaId: number, ncf: string, params: {
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
    factura_id: notaId,
    no_factura: ncf,
    ncf,
    tipo_comprobante: 'E34',
    alanube_id: response?.id || '',
    alanube_id_compania: params.alanubeIdCompania,
    document_number: response?.documentNumber || response?.document_number || ncf,
    document_stamp_url: String(response?.documentStampUrl || response?.document_stamp_url || '').trim(),
    security_code: String(response?.securityCode || response?.security_code || '').trim(),
    status,
    legal_status: legalStatus,
    sequence_consumed: response?.sequenceConsumed ? 1 : 0,
    pdf_url: response?.pdf || response?.pdf_url || '',
    xml_url: response?.xml || response?.xml_url || '',
    resume_xml_url: response?.resumeXml || response?.resume_xml || '',
    endpoint: params.endpoint,
    http_status: params.httpStatus,
    payload: JSON.stringify(params.payload || {}),
    response: JSON.stringify(params.response || {}),
    error: params.error || '',
    enviado_at: now,
    aceptado_at: legalStatus === 'ACCEPTED' ? (response?.signatureDate || now) : '',
  }

  const existente = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [notaId])
  const existenteId = existente?.success && Array.isArray(existente.data) && existente.data.length > 0 ? existente.data[0].id : 0
  const saveRes = existenteId
    ? await window.db.update('facturas_ecf', existenteId, record)
    : await window.db.insert('facturas_ecf', record)
  if (!saveRes?.success) throw new Error(saveRes?.error || 'No se pudo guardar el estado e-CF')

  const otroActual = await obtenerOtroActual(notaId)
  await window.db.update('facturas', notaId, {
    estado_factura: status,
    otro: JSON.stringify({
      ...otroActual,
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

async function cargarDatosAlanube() {
  const [baseRes, tokenRes, companiaRes, companyRes, empresaRes] = await Promise.all([
    window.config.get('alanube_base_url'),
    window.config.get('alanube_token'),
    window.config.get('alanube_id_compania'),
    window.config.get('alanube_company_data'),
    window.db.getAll('empresa'),
  ])
  const baseUrl = String(baseRes?.data || 'https://api.alanube.co/dom/v1').replace(/\/+$/, '')
  const tokenAlanube = String(tokenRes?.data || '').trim()
  const alanubeIdCompania = String(companiaRes?.data || '').trim()
  const companyData = parseJson(companyRes?.data, {})
  const empresa = empresaRes?.success && empresaRes.data?.length ? empresaRes.data[0] : {}
  return { baseUrl, tokenAlanube, alanubeIdCompania, companyData, empresa }
}

async function emitirNotaCredito() {
  if (!isDominicanFiscal.value) {
    toast.add({ severity: 'warn', summary: 'No disponible', detail: 'La facturación electrónica no está habilitada para este perfil fiscal', life: 3500 })
    return
  }
  if (!facturaOrigenSeleccionada.value) {
    toast.add({ severity: 'warn', summary: 'Atención', detail: 'Selecciona la factura origen', life: 3000 })
    return
  }
  const reason = motivoTexto.value.trim()
  if (!reason) {
    toast.add({ severity: 'warn', summary: 'Atención', detail: 'La razón de la modificación es requerida', life: 3000 })
    return
  }
  if (!modificationCode.value) {
    toast.add({ severity: 'warn', summary: 'Atención', detail: 'Selecciona el motivo de la modificación', life: 3000 })
    return
  }

  emitiendo.value = true
  let notaId = 0
  try {
    const activoRes = await window.config.get('facturacion_electronica_activa')
    if (String(activoRes?.data || '') !== '1') throw new Error('La facturación electrónica está apagada')

    const { baseUrl, tokenAlanube, alanubeIdCompania, companyData, empresa } = await cargarDatosAlanube()
    if (!tokenAlanube || !alanubeIdCompania) throw new Error('Configura el token e ID de compañía de Alanube')

    await cargarComprobanteE34()
    const compE34 = comprobanteE34.value
    if (!compE34) throw new Error('No hay un comprobante E34 activo configurado')

    const facturaOrigen = facturaOrigenSeleccionada.value
    const cliente = clientesMap.value[String(facturaOrigen.cod_cliente || '')] || null

    const sec = String(compE34.secuencia_actual || 1).padStart(10, '0')
    const ncf = `${compE34.prefijo || compE34.tipo}${sec}`
    const creditNoteIndicator = diferenciaDias(facturaOrigen.fecha_emision) > 30 ? 1 : 0
    const fechaStr = new Date().toISOString().split('T')[0]

    const notaData: any = addAlmacenId({
      no_factura: ncf,
      tipo_factura: 'NOTA_CREDITO_ECF',
      comprobante: 'E34',
      tipo_comprobante: 'E34',
      ncf,
      comprobante_id: compE34.id,
      cod_cliente: facturaOrigen.cod_cliente || '',
      nombre_cliente: facturaOrigen.nombre_cliente || 'CONSUMIDOR FINAL',
      telefono_cliente: facturaOrigen.telefono_cliente || '',
      productos: facturaOrigen.productos || '[]',
      vendedor: facturaOrigen.vendedor || '',
      metodo_pago: facturaOrigen.metodo_pago || 'EFECTIVO',
      canal_venta: facturaOrigen.canal_venta || 'LOCAL',
      fecha_emision: fechaStr,
      impuesto: facturaOrigen.impuesto || 0,
      descuento: 0,
      subtotal: facturaOrigen.subtotal || 0,
      total: facturaOrigen.total || 0,
      estado_factura: 'ENVIADA',
      fecha_estado: fechaStr,
      nota: reason.slice(0, 90),
      usuario: usuarioAuditoria(),
      otro: JSON.stringify({
        factura_origen_id: facturaOrigen.id,
        factura_origen_ncf: obtenerNcf(facturaOrigen),
        factura_origen_fecha: facturaOrigen.fecha_emision,
        modification_code: modificationCode.value,
        credit_note_indicator: creditNoteIndicator,
      }),
    })

    const insertRes = await window.db.insert('facturas', notaData)
    if (!insertRes.success || !insertRes.data?.id) throw new Error(insertRes.error || 'No se pudo crear la nota de crédito')
    notaId = insertRes.data.id

    // La secuencia se consume de inmediato al generar el NCF, para que un
    // reintento posterior reutilice el mismo eNCF sin riesgo de colisión.
    await window.db.update('comprobantes_fiscales', compE34.id, { secuencia_actual: (compE34.secuencia_actual || 1) + 1 })

    const payload = buildPayloadNotaCredito({
      ncf,
      facturaOrigen,
      cliente,
      modificationCode: Number(modificationCode.value),
      reason,
      creditNoteIndicator,
      noNota: ncf,
      companyData,
      empresa,
      alanubeIdCompania,
    })

    const res = await fetch(`${baseUrl}/credit-notes`, {
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
    const errorMsg = res.ok ? '' : (typeof data === 'string' ? data : data?.message || data?.error || data?.response?.[0]?.message || `Alanube respondió ${res.status}`)

    await guardarResultadoEcfNota(notaId, ncf, {
      endpoint: 'credit-notes',
      httpStatus: res.status,
      payload,
      response: data,
      ok: res.ok,
      error: errorMsg,
      alanubeIdCompania,
    })

    await registrarAuditoria('emitir_nota_credito_ecf', { id: notaId, no_factura: ncf, ncf }, {
      factura_origen_id: facturaOrigen.id,
      factura_origen_ncf: obtenerNcf(facturaOrigen),
      http_status: res.status,
    }, res.ok ? 'OK' : 'ERROR')

    if (!res.ok) throw new Error(typeof errorMsg === 'string' ? errorMsg : 'Alanube rechazó el envío')

    toast.add({ severity: 'success', summary: 'Nota de Crédito', detail: 'Nota de crédito electrónica emitida correctamente', life: 3500 })
    dialogVisible.value = false
    resetForm()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo emitir la nota de crédito', life: 4500 })
  } finally {
    emitiendo.value = false
    await cargarNotas()
  }
}

async function reintentarNotaCredito(nota: any) {
  if (!nota?.id) return
  if (esNotaAceptada(nota)) {
    toast.add({ severity: 'info', summary: 'Alanube', detail: 'Esta nota de crédito ya fue aceptada por DGII', life: 3000 })
    return
  }

  reintentandoId.value = nota.id
  try {
    const { baseUrl, tokenAlanube, alanubeIdCompania, companyData, empresa } = await cargarDatosAlanube()
    if (!tokenAlanube || !alanubeIdCompania) throw new Error('Configura el token e ID de compañía de Alanube')

    const otro = getOtroNota(nota)
    const facturaOrigenRes = await window.db.getById('facturas', Number(otro.factura_origen_id || 0))
    const facturaOrigen = facturaOrigenRes?.data
    if (!facturaOrigen) throw new Error('No se encontró la factura origen de esta nota de crédito')

    const cliente = clientesMap.value[String(facturaOrigen.cod_cliente || '')] || null
    if (!Object.keys(clientesMap.value).length) await cargarClientes()

    const payload = buildPayloadNotaCredito({
      ncf: nota.ncf,
      facturaOrigen,
      cliente: clientesMap.value[String(facturaOrigen.cod_cliente || '')] || cliente,
      modificationCode: Number(otro.modification_code || 1),
      reason: nota.nota || '',
      creditNoteIndicator: Number(otro.credit_note_indicator || 0),
      noNota: nota.no_factura || nota.ncf,
      companyData,
      empresa,
      alanubeIdCompania,
    })

    const res = await fetch(`${baseUrl}/credit-notes`, {
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
    const errorMsg = res.ok ? '' : (typeof data === 'string' ? data : data?.message || data?.error || `Alanube respondió ${res.status}`)

    await guardarResultadoEcfNota(nota.id, nota.ncf, {
      endpoint: 'credit-notes',
      httpStatus: res.status,
      payload,
      response: data,
      ok: res.ok,
      error: errorMsg,
      alanubeIdCompania,
    })

    await registrarAuditoria('reintentar_nota_credito_ecf', nota, { http_status: res.status }, res.ok ? 'OK' : 'ERROR')

    if (!res.ok) throw new Error(typeof errorMsg === 'string' ? errorMsg : 'Alanube rechazó el envío')
    toast.add({ severity: 'success', summary: 'Alanube', detail: 'Nota de crédito reenviada correctamente', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo reenviar la nota de crédito', life: 4500 })
  } finally {
    reintentandoId.value = 0
    await cargarNotas()
  }
}

function confirmarBorrar(nota: any) {
  if (esNotaAceptada(nota)) {
    toast.add({ severity: 'warn', summary: 'Bloqueado', detail: 'Esta nota de crédito fue aceptada por DGII y no puede eliminarse', life: 4000 })
    return
  }
  selectedNota.value = nota
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function solicitarOtpEliminarNota() {
  const nota = selectedNota.value
  if (!nota) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: nota.id,
      facturaIds: [nota.id],
      no_factura: nota.no_factura || '',
      nombre_cliente: nota.nombre_cliente || '',
      cantidad: 1,
      total: nota.total || 0,
    }) as any
    if (res.success) {
      deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Código enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el código'
    }
  } catch (e: any) {
    deleteOtpError.value = e.message || 'Error solicitando código'
  } finally {
    deleteOtpLoading.value = false
  }
}

async function borrar() {
  const nota = selectedNota.value
  if (!nota) return
  try {
    deleteOtpError.value = ''
    const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
    if (!/^\d{4}$/.test(codigo)) {
      deleteOtpError.value = 'Introduce el código de 4 dígitos'
      return
    }
    deleteOtpConfirmando.value = true
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: nota.id,
      facturaIds: [nota.id],
      codigo,
    }) as any
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Código no válido'
      return
    }
    const res = await window.db.delete('facturas', nota.id)
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
      return
    }
    toast.add({ severity: 'success', summary: 'Éxito', detail: 'Nota de crédito eliminada', life: 3000 })
    deleteDialogVisible.value = false
    selectedNota.value = null
    await cargarNotas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

async function imprimirNota(nota: any) {
  ticketPrintRef.value?.printTicket(nota)
}

async function verNotaPdf(nota: any) {
  facturaPdfRef.value?.printFactura(nota)
}

onMounted(async () => {
  await Promise.all([cargarNotas(), cargarConfigFiscal()])
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Notas de Crédito Electrónicas (e-CF 34)">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar nota de crédito..." />
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
            v-model="estadoFiltro"
            :options="[
              { label: 'Aceptada DGII', value: 'ACEPTADA' },
              { label: 'Rechazada', value: 'RECHAZADA' },
              { label: 'Enviada', value: 'ENVIADA' },
              { label: 'Error envío', value: 'ERROR_ENVIO' },
            ]"
            optionLabel="label"
            optionValue="value"
            placeholder="Estado DGII"
            showClear
            class="w-40"
            size="small"
          />
        </div>

        <div class="flex items-center gap-2">
          <label v-if="puedeVerTodosAlmacenes" class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button label="Nueva Nota de Crédito" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        :value="notasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column header="Acciones" style="width: 5rem">
          <template #body="{ data }">
            <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded @click.stop="abrirMenuAccionesNota($event, data)" v-tooltip="'Acciones'" />
          </template>
        </Column>
        <Column field="ncf" header="NCF" sortable style="width: 11rem" />
        <Column header="Factura Origen" style="width: 11rem">
          <template #body="{ data }">{{ facturaOrigenNcf(data) || '--' }}</template>
        </Column>
        <Column field="nombre_cliente" header="Cliente" sortable />
        <Column field="fecha_emision" header="Fecha Emisión" sortable style="width: 9rem">
          <template #body="{ data }">{{ formatFecha(data.fecha_emision) }}</template>
        </Column>
        <Column field="total" header="Total" sortable style="width: 10rem">
          <template #body="{ data }">{{ formatCurrency(data.total) }}</template>
        </Column>
        <Column header="Estado DGII" sortable style="width: 10rem">
          <template #body="{ data }">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="estadoClass(data)">
              {{ estadoLabel(data) }}
            </span>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay notas de crédito electrónicas registradas.</div>
        </template>
      </DataTable>
    </Fieldset>

    <Menu ref="notaActionMenu" :model="notaActionItems" popup appendTo="body" />

    <Dialog
      v-model:visible="dialogVisible"
      header="Nueva Nota de Crédito Electrónica"
      modal
      :style="{ width: '90%', maxWidth: '700px' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Factura Origen (E31/E32 aceptada por DGII)</label>
          <Select
            v-model="facturaOrigenSeleccionadaId"
            :options="facturasOrigenDisponibles"
            optionLabel="ncf"
            optionValue="id"
            placeholder="Seleccionar factura electrónica..."
            filter
            fluid
          >
            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="font-semibold">{{ option.ncf }} · {{ option.nombre_cliente }}</span>
                <span class="text-xs text-surface-500">{{ formatFecha(option.fecha_emision) }} · {{ formatCurrency(option.total) }}</span>
              </div>
            </template>
          </Select>
          <p v-if="!facturasOrigenDisponibles.length" class="text-xs text-amber-600 dark:text-amber-400">
            No hay facturas E31/E32 aceptadas por DGII disponibles para acreditar.
          </p>
        </div>

        <div v-if="facturaOrigenSeleccionada" class="rounded-xl border border-surface-200 dark:border-surface-700 p-4 space-y-3">
          <div class="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
            <div><span class="text-surface-400 text-xs block">Cliente</span>{{ facturaOrigenSeleccionada.nombre_cliente }}</div>
            <div><span class="text-surface-400 text-xs block">NCF Original</span>{{ facturaOrigenSeleccionada.ncf }}</div>
            <div><span class="text-surface-400 text-xs block">Fecha Emisión</span>{{ formatFecha(facturaOrigenSeleccionada.fecha_emision) }}</div>
            <div><span class="text-surface-400 text-xs block">Total</span>{{ formatCurrency(facturaOrigenSeleccionada.total) }}</div>
          </div>
          <p v-if="creditNoteIndicatorPreview === 1" class="text-xs text-amber-600 dark:text-amber-400">
            Han pasado más de 30 días desde la emisión: esta nota de crédito no tendrá derecho a rebajar ITBIS (creditNoteIndicator = 1).
          </p>
          <div class="max-h-40 overflow-auto rounded-lg border border-surface-100 dark:border-surface-700">
            <table class="w-full text-xs">
              <thead class="bg-surface-50 dark:bg-surface-800 sticky top-0">
                <tr>
                  <th class="text-left p-2">Producto</th>
                  <th class="text-right p-2">Cant.</th>
                  <th class="text-right p-2">Precio</th>
                </tr>
              </thead>
              <tbody>
                <tr v-for="(item, idx) in itemsOrigenPreview" :key="idx" class="border-t border-surface-100 dark:border-surface-700">
                  <td class="p-2">{{ item.nombre || item.descripcion || item.producto }}</td>
                  <td class="p-2 text-right">{{ item.cantidad || item.quantity || 1 }}</td>
                  <td class="p-2 text-right">{{ formatCurrency(item.precio || item.precio_venta || item.precio_unitario || item.price || 0) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Motivo de Modificación</label>
            <Select
              v-model="modificationCode"
              :options="opcionesModificacion"
              optionLabel="label"
              optionValue="value"
              placeholder="Seleccionar motivo"
              fluid
            />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Razón de la Modificación</label>
          <Textarea v-model="motivoTexto" placeholder="Ej. Error en precio, devolución de mercancía..." rows="3" maxlength="90" />
          <span class="text-xs text-surface-400 text-right">{{ motivoTexto.length }}/90</span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="emitiendo" @click="dialogVisible = false" />
        <Button
          label="Emitir Nota de Crédito"
          icon="pi pi-send"
          :loading="emitiendo"
          :disabled="!facturaOrigenSeleccionada"
          @click="emitirNotaCredito"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Eliminar nota de crédito"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span>Seguro que deseas eliminar la nota de crédito <strong>{{ selectedNota?.no_factura }}</strong>?</span>
        </div>
        <div v-if="deleteOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">
            Consulta el código de 4 dígitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.
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
          @click="solicitarOtpEliminarNota"
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

    <TicketFacturaPrint ref="ticketPrintRef" />
    <FacturaPdfPrint ref="facturaPdfRef" />
  </div>
</template>
