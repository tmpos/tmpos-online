<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch, reactive } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import InputOtp from 'primevue/inputotp'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import html2canvas from 'html2canvas'

import { envioElectron, peticionesFetch, encryptarPassword } from '@/funciones/funciones.js'
import { ensureConfigLoaded, getConfig, getImageUrl } from '@/services/tmCloudClient'
import NotasComp from '@/components/ventas/NotasComp.vue'
import FacturaPdfPrint from '@/components/ventas/FacturaPdfPrint.vue'
import TicketFacturaPrint from '@/components/ventas/TicketFacturaPrint.vue'
import TicketCuentaCobrarPrint from '@/components/contabilidad/TicketCuentaCobrarPrint.vue'
import OrdenTallerForm from '@/components/taller/OrdenTallerForm.vue'
import TicketTallerPrint from '@/components/taller/TicketTallerPrint.vue'
import RecibirEquipoDialog from '@/components/ventas/RecibirEquipoDialog.vue'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { useSonidos } from '@/composables/useSonidos'
import { useAtajosTeclado } from '@/composables/useAtajosTeclado'
import { useConexion } from '@/composables/useConexion'
import { useCaja } from '@/composables/useCaja'
import { useHoldRecall } from '@/composables/useHoldRecall'
import { useTeclasRapidas } from '@/composables/useTeclasRapidas'
import { useClienteHistorial } from '@/composables/useClienteHistorial'
import { useSpotlight } from '@/composables/useSpotlight'
import { useStockAlertas } from '@/composables/useStockAlertas'
import { useMiniDashboard } from '@/composables/useMiniDashboard'
import { useLockScreen } from '@/composables/useLockScreen'
import { useDevoluciones, reintegrarInventarioFactura } from '@/composables/useDevoluciones'
import { useBarcodeEntry } from '@/composables/useBarcodeEntry'
import { useCausaDescuento } from '@/composables/useCausaDescuento'
import { useCustomerDisplay } from '@/composables/useCustomerDisplay'
import { useLoyalty } from '@/composables/useLoyalty'
import { useComboProductos } from '@/composables/useComboProductos'
import { useThemeStore } from '@/stores/theme'
import { useSystemModeStore } from '@/stores/systemMode'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { sanitizePrintableHtml } from '@/utils/htmlSecurity'
import { matchesSearch } from '@/composables/useSearch'
import { filterPosCatalog, filterPosCustomers, searchGlobalPosCatalog } from '@/domain/posCatalog'
import { imeiBelongsToPhone, resolvePhoneForImei } from '@/domain/phoneImeiRelation'
const { store: almacenActivoStore, filterByAlmacen, addAlmacenId: addAlmacenIdFilter } = useAlmacenFilter()
const { taxName, currency: systemCurrency, locale: systemLocale, currencySymbol, isDominicanFiscal } = useLocaleProfile()

const toast = useToast()
const router = useRouter()
const systemMode = useSystemModeStore()

const activeTab = ref<string>(systemMode.isGeneralStore ? 'accesorios' : 'celulares')
const tabOptions = computed(() => [
  ...(systemMode.isCellphoneStore ? [{ label: `Celulares (${contadorTelefonos.value})`, value: 'celulares', icon: 'pi pi-mobile' }] : []),
  { label: `${systemMode.productLabel} (${contadorAccesorios.value})`, value: 'accesorios', icon: 'pi pi-box' },
  { label: `Electro. (${contadorElectrodomesticos.value})`, value: 'electrodomesticos', icon: 'pi pi-sitemap' },
  { label: 'Acciones', value: 'acciones', icon: 'pi pi-bolt' },
])
const productTypeOptions = computed(() => systemMode.isGeneralStore
  ? ['accesorio', 'electrodomestico', 'manual']
  : ['telefono', 'accesorio', 'electrodomestico', 'manual'])

watch(() => systemMode.mode, () => {
  if (!tabOptions.value.some(option => option.value === activeTab.value)) {
    activeTab.value = tabOptions.value[0]?.value || 'accesorios'
  }
})
const busquedaProd = ref('')
const busquedaProdFiltrada = ref('')
let busquedaProdTimer: ReturnType<typeof setTimeout> | null = null
const ocultarSinStock = ref(true)
const POS_CARD_COLUMNS_KEY = 'pos_tarjetas_por_fila'
const columnasCards = ref(3)
const opcionesColumnasCards = [2, 3, 4, 5]
const productosScrollRef = ref<HTMLElement | null>(null)
const mostrarBotonArriba = ref(false)

function manejarScrollProductos(event: Event) {
  mostrarBotonArriba.value = (event.currentTarget as HTMLElement).scrollTop > 240
}

function irArribaProductos() {
  productosScrollRef.value?.scrollTo({ top: 0, behavior: 'smooth' })
}

function normalizarColumnasCards(value: unknown): number {
  const columnas = Number(value)
  return opcionesColumnasCards.includes(columnas) ? columnas : 3
}

async function cargarColumnasCards() {
  try {
    const res = await (window as any).config.get(POS_CARD_COLUMNS_KEY)
    columnasCards.value = normalizarColumnasCards(res?.data)
  } catch (_) {
    columnasCards.value = 3
  }
}

async function guardarColumnasCards(value: number) {
  const anterior = columnasCards.value
  columnasCards.value = normalizarColumnasCards(value)
  try {
    const res = await (window as any).config.set(POS_CARD_COLUMNS_KEY, String(columnasCards.value))
    if (!res?.success) throw new Error(res?.error || 'No se pudo guardar la configuracion')
  } catch (error: any) {
    columnasCards.value = anterior
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar la cantidad de tarjetas', life: 3000 })
  }
}

const telefonos = ref<any[]>([])
const accesorios = ref<any[]>([])
const electrodomesticos = ref<any[]>([])
const imeisDisponibles = ref<any[]>([])
const serialesDisponibles = ref<any[]>([])
const clientes = ref<any[]>([])
const marcas = ref<any[]>([])
const categorias = ref<any[]>([])

const contadorTelefonos = computed(() => ocultarSinStock.value
  ? telefonos.value.filter((telefono: any) => imeisDisponibles.value.some((imei: any) => imeiPerteneceTelefono(imei, telefono))).length
  : telefonos.value.length)
const contadorAccesorios = computed(() => ocultarSinStock.value
  ? accesorios.value.filter((accesorio: any) => Number(accesorio.cantidad || 0) > 0).length
  : accesorios.value.length)
const contadorElectrodomesticos = computed(() => ocultarSinStock.value
  ? electrodomesticos.value.filter((equipo: any) => serialesDisponibles.value.some((serial: any) => serialPerteneceEquipo(serial, equipo))).length
  : electrodomesticos.value.length)

const cart = ref<any[]>([])
const loading = ref(false)
const dialogVariantes = ref(false)
const busquedaImei = ref('')
const selectedTelefono = ref<any>(null)
const selectedElectrodomestico = ref<any>(null)
const variantesImei = ref<any[]>([])
const variantesSerial = ref<any[]>([])
const dialogPrecio = ref(false)
const imeiParaPrecio = ref<any>(null)
const dialogDetalleImei = ref(false)
const detalleImei = ref<any>(null)
const cargandoDetalleImei = ref(false)
const precioSeleccionado = ref<'venta' | 'min' | 'xmayor' | 'manual'>('venta')
const precioManual = ref(0)
const flippedAccId = ref<number | null>(null)
const flippedTelId = ref<number | null>(null)
const flippedElecId = ref<number | null>(null)
const dialogCliente = ref(false)
const busquedaCliente = ref('')
const dialogNuevoCliente = ref(false)
const nuevoClienteForm = ref({ nombre: '', telefono: '', direccion: '', rnc: '' })
const rncTipo = ref<'RNC' | 'CEDULA'>('RNC')
const buscandoClienteApi = ref(false)
const dialogProductoPersonalizado = ref(false)
const dialogCambiarPrecio = ref(false)
const cartItemPrecio = ref<any>(null)
const nuevoPrecioItem = ref(0)
const dialogCambiarImei = ref(false)
const itemCambiarImei = ref<any>(null)
const imeisDisponiblesParaCambio = ref<any[]>([])
const busquedaCambiarImei = ref('')
const dialogGestionImeis = ref(false)
const itemGestionImeis = ref<any>(null)
const indexGestionImeis = ref<number | null>(null)
const busquedaGestionImeis = ref('')
const clienteExpress = ref('')
const esCotizacion = ref(false)
const prodPersonalizado = ref({ nombre: '', precio: 0, costo: 0 })
const dialogDescuento = ref(false)
const descuentoTipo = ref<'fijo' | 'porcentaje' | 'nota_credito'>('fijo')
const descuentoValor = ref(0)
const notasCreditoCliente = ref<any[]>([])
const notaCreditoSeleccionada = ref<any>(null)
const notaCreditoUsada = ref('')
const dialogFatCoti = ref(false)
const tipoFatCoti = ref<'FACTURA' | 'COTIZACION'>('FACTURA')
const tipoFatCotiOptions = [
  { label: 'Factura', value: 'FACTURA' },
  { label: 'Cotizacion', value: 'COTIZACION' },
]
const limiteFatCoti = ref(1000)
const busquedaFatCoti = ref('')
const cargandoFatCoti = ref(false)
const registrosFatCoti = ref<any[]>([])
const registroFatCotiSeleccionado = ref<any>(null)
const dialogEliminarFactCoti = ref(false)
const factCotiOtpEnviado = ref(false)
const factCotiOtp = ref('')
const factCotiOtpEmail = ref('')
const factCotiOtpError = ref('')
const factCotiOtpLoading = ref(false)
const factCotiOtpConfirmando = ref(false)
const dialogEditarPagoFactCoti = ref(false)
const metodoPagoFactCoti = ref('')
const guardandoPagoFactCoti = ref(false)
const dialogBancoFactCoti = ref(false)
const bancosFactCoti = ref<any[]>([])
const bancoFactCotiSeleccionado = ref<any>(null)
const cargandoBancosFactCoti = ref(false)
const guardandoBancoFactCoti = ref(false)
const dialogCuentaCobrarFactCoti = ref(false)
const cuentaCobrarFactCoti = ref<any>(null)
const cargandoCuentaCobrarFactCoti = ref(false)
const abonoCuentaCobrarFactCoti = ref(0)
const guardandoAbonoCuentaCobrarFactCoti = ref(false)
const dialogWhatsappCuentaFactCoti = ref(false)
const whatsappCuentaFactCoti = ref('')
const guardandoWhatsappCuentaFactCoti = ref(false)
const dialogWhatsappFactCoti = ref(false)
const whatsappFactCoti = ref('')
const guardandoWhatsappFactCoti = ref(false)
const dialogCambiarClienteFactCoti = ref(false)
const busquedaClienteFactCoti = ref('')
const clienteFactCotiSeleccionado = ref<any>(null)
const guardandoClienteFactCoti = ref(false)
const dialogProductosFactCoti = ref(false)
const productosFactCoti = ref<any[]>([])
const busquedaProductosFactCoti = ref('')
const guardandoProductosFactCoti = ref(false)
const dialogAgregarProductoFactCoti = ref(false)
const nuevoProductoFactCoti = ref({ nombre: '', cantidad: 1, precio: 0, costo: 0 })
const modoAgregarProductoFactCoti = ref<'manual' | 'db'>('manual')
const modosAgregarProductoFactCoti = [
  { label: 'Manual', value: 'manual' },
  { label: 'Desde DB', value: 'db' },
]
const busquedaProductoDbFactCoti = ref('')
const productoDbFactCotiSeleccionado = ref<any>(null)
const confirmPago = ref(false)
const ventaExpressPendiente = ref(false)
const bancosPos = ref<any[]>([])
const bancoPosSeleccionado = ref<any>(null)
const cargandoBancosPos = ref(false)
const dialogMixto = ref(false)
const metodosMixto = ref({ efectivo: false, tarjeta: false, transferencia: false, cheque: false })
const mixtoEfectivo = ref(0)
const mixtoTarjeta = ref(0)
const metodoTarjetaMixtoId = ref<number | null>(null)
const mixtoTransferencia = ref(0)
const transferenciasMixto = ref<Array<{ banco_id: number | null; monto: number }>>([])
const mixtoCheque = ref(0)
const mixtoError = ref('')
const dialogTicket = ref(false)
const dialogPrintChoice = ref(false)
const facturaPdfRef = ref<any>(null)
const ticketFacturaPrintRef = ref<any>(null)
const ticketCuentaCobrarRef = ref<any>(null)
const ticketTallerRef = ref<any>(null)
const dialogPdf = ref(false)
const pdfUrl = ref('')
const ticketInvoiceNo = ref('')
const ticketData = ref<any>(null)
const ticketDesdeFactCoti = ref(false)
const facturaEditandoPos = ref<any>(null)
const productosOriginalesEditandoPos = ref<any[]>([])
const printerName = ref('')
const ticketConfig = ref({
  printer_name: '',
  paper_width: 80,
  show_logo: 1,
  show_company_name: 1,
  show_legal: 1,
  show_phone: 1,
  show_address: 1,
  show_email: 1,
  show_cliente: 1,
  show_items: 1,
  show_totals: 1,
  show_barcode: 1,
  show_footer: 1,
  show_qr: 0,
  show_nota: 1,
  footer_text: 'Gracias por su compra',
})
const comprobantes = ref<any[]>([])
const comprobanteSeleccionado = ref<any>(null)
const facturacionElectronicaActiva = ref(false)
const comprobanteElectronicoDefault = ref('E32')
const alanubeBaseUrl = ref('https://api.alanube.co/dom/v1')
const alanubeToken = ref('')
const alanubeIdCompania = ref('')
const alanubeCompanyData = ref<any | null>(null)
const clienteSeleccionado = ref<any>(null)
const dialogOrdenTallerPos = ref(false)
const dialogOrdenTallerPostSave = ref(false)
const ordenTallerPosGuardada = ref<any | null>(null)
const dialogEtiquetaTallerPos = ref(false)
const plantillasEtiquetasTallerPos = ref<any[]>([])
const printersTallerPos = ref<any[]>([])
const printerTallerPos = ref('')
const escaneandoPrintersTallerPos = ref(false)
const dialogRecibirEquipo = ref(false)
const dialogAplicarNotaRecibido = ref(false)
const recibidoParaDescuento = ref<any | null>(null)
const notaCreditoRecibido = ref<any | null>(null)
const ordenTallerInitialData = computed(() => ({
  nombre: clienteSeleccionado.value?.nombre || clienteExpress.value || '',
  cedula: clienteSeleccionado.value?.cedula || clienteSeleccionado.value?.rnc || '',
  telefono: clienteSeleccionado.value?.telefono || clienteSeleccionado.value?.whatsapp || '',
  email: clienteSeleccionado.value?.email || '',
}))
const recibirEquipoInitialData = computed(() => ({
  customer_name: clienteSeleccionado.value?.nombre || clienteExpress.value || '',
  customer_phone: clienteSeleccionado.value?.telefono || clienteSeleccionado.value?.whatsapp || '',
  customer_cedula: clienteSeleccionado.value?.cedula || clienteSeleccionado.value?.rnc || '',
}))
const noFactura = ref('')
const metodoPago = ref('EFECTIVO')
const montoRecibido = ref(0)
const descuentoFijo = ref(0)
const descuentoPorc = ref(0)
const nota = ref('')
const guardando = ref(false)

const link = ref('')
const api = ref('')
const token = ref('')

const empresaNombre = ref('MI EMPRESA')
const empresaRnc = ref('')
const empresaTipoDoc = ref('')
const impuestoPorcentaje = ref(18)
const impuestoIncluido = ref(1)
const impuestoPorcentajeOriginal = ref(18)
const impuestoIncluidoOriginal = ref(1)

async function recargarConfigVentas() {
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) {
      const uid = String(almacenActivoStore.activeUid || localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || '')
      const id = Number(almacenActivoStore.activeId || localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0)
      const e = (uid && res.data.find((item: any) => String(item.uid || item.almacen_uid || '') === uid))
        || (id && res.data.find((item: any) => Number(item.almacen_id || item.id) === id))
        || res.data[0]
      impuestoPorcentaje.value = e.impuesto == null || e.impuesto === '' ? 18 : Number(e.impuesto)
      impuestoIncluido.value = e.impuesto_incluido == null || e.impuesto_incluido === '' ? 1 : Number(e.impuesto_incluido)
      impuestoPorcentajeOriginal.value = impuestoPorcentaje.value
      impuestoIncluidoOriginal.value = impuestoIncluido.value
      empresaNombre.value = e.nombre || 'MI EMPRESA'
      empresaRnc.value = e.legal || ''
      empresaTelefono.value = e.telefono || ''
      empresaDireccion.value = e.direccion || ''
      empresaEmail.value = e.email || ''
      empresaLogo.value = e.logo || ''
      empresaTipoDoc.value = e.tipo_documento_defecto || ''
    }
  } catch (_) {}
}
function aplicarConfigVentas(event: Event) {
  const detail = (event as CustomEvent).detail || {}
  const uid = String(almacenActivoStore.activeUid || '')
  if (detail.empresa_uid && uid && String(detail.empresa_uid) !== uid) return
  impuestoPorcentaje.value = Number(detail.impuesto ?? impuestoPorcentaje.value)
  impuestoIncluido.value = Number(detail.impuesto_incluido ?? impuestoIncluido.value)
  impuestoPorcentajeOriginal.value = impuestoPorcentaje.value
  impuestoIncluidoOriginal.value = impuestoIncluido.value
}
const empresaTelefono = ref('')
const empresaDireccion = ref('')
const empresaEmail = ref('')
const empresaLogo = ref('')

function esComprobanteElectronico(comp: any): boolean {
  const tipo = String(comp?.tipo || '').toUpperCase()
  return tipo.startsWith('E') && tipo !== 'SIN'
}

function formatSecuenciaComprobante(comp: any): string {
  return String(comp?.secuencia_actual || 1).padStart(esComprobanteElectronico(comp) ? 10 : 8, '0')
}

const comprobantesDisponibles = computed(() => {
  if (!facturacionElectronicaActiva.value) return comprobantes.value
  return comprobantes.value.filter((comp: any) => ['E31', 'E32'].includes(String(comp?.tipo || '').toUpperCase()))
})

function seleccionarComprobanteDisponible() {
  const disponibles = comprobantesDisponibles.value
  if (disponibles.some((comp: any) => comp.id === comprobanteSeleccionado.value?.id)) return

  const preferido = facturacionElectronicaActiva.value
    ? disponibles.find((comp: any) => String(comp.tipo || '').toUpperCase() === String(comprobanteElectronicoDefault.value || '').toUpperCase())
    : disponibles.find((comp: any) => String(comp.tipo || '').toUpperCase() === 'SIN')
  comprobanteSeleccionado.value = preferido || disponibles.find((comp: any) => comp.es_default) || disponibles[0] || null
}

async function cargarConfigFacturacionElectronica() {
  try {
    const [activoRes, defaultRes, baseUrlRes, tokenRes, idCompaniaRes, companyDataRes] = await Promise.all([
      (window as any).config.get('facturacion_electronica_activa'),
      (window as any).config.get('facturacion_electronica_comprobante_default'),
      (window as any).config.get('alanube_base_url'),
      (window as any).config.get('alanube_token'),
      (window as any).config.get('alanube_id_compania'),
      (window as any).config.get('alanube_company_data'),
    ])
    facturacionElectronicaActiva.value = isDominicanFiscal.value && String(activoRes?.data || '') === '1'
    comprobanteElectronicoDefault.value = String(defaultRes?.data || '') || 'E32'
    alanubeBaseUrl.value = String(baseUrlRes?.data || '') || 'https://api.alanube.co/dom/v1'
    alanubeToken.value = String(tokenRes?.data || '')
    alanubeIdCompania.value = String(idCompaniaRes?.data || '')
    const rawCompany = String(companyDataRes?.data || '')
    alanubeCompanyData.value = rawCompany ? JSON.parse(rawCompany) : null
  } catch (_) {
    alanubeCompanyData.value = null
  }
}

async function toggleFacturacionElectronica(value: boolean) {
  if (!isDominicanFiscal.value) return
  facturacionElectronicaActiva.value = value
  if (!value) {
    comprobanteSeleccionado.value = null
  }
  seleccionarComprobanteDisponible()
  try {
    await (window as any).config.set('facturacion_electronica_activa', value ? '1' : '0')
  } catch (_) {}
}

const POS_STORAGE_KEY = 'pos_cart_data'
const auth = useAuthStore()
const puedeVerDetalleImei = computed(() => Boolean(auth.isAdmin || auth.isSoporte))

const camposDetalleImei = computed(() => {
  if (!detalleImei.value) return []
  const prioridad = [
    'id', 'nombre', 'imei', 'telefono_id', 'estado', 'condicion', 'color', 'capacidad',
    'precio_venta', 'precio_min', 'precio_xmayor', 'costo', 'proveedor_id', 'almacen_id',
    'almacen_uid', 'uid', 'notas', 'created_at', 'updated_at',
  ]
  return Object.entries(detalleImei.value)
    .filter(([campo, valor]) => campo !== 'imagen' && valor !== null && valor !== undefined && valor !== '')
    .sort(([campoA], [campoB]) => {
      const indiceA = prioridad.indexOf(campoA)
      const indiceB = prioridad.indexOf(campoB)
      if (indiceA === -1 && indiceB === -1) return campoA.localeCompare(campoB)
      if (indiceA === -1) return 1
      if (indiceB === -1) return -1
      return indiceA - indiceB
    })
    .map(([campo, valor]) => ({ campo, valor }))
})

function etiquetaCampoImei(campo: string): string {
  const etiquetas: Record<string, string> = {
    id: 'ID', nombre: 'IMEI', imei: 'IMEI alterno', telefono_id: 'ID del telefono',
    precio_venta: 'Precio de venta', precio_min: 'Precio minimo', precio_xmayor: 'Precio por mayor',
    proveedor_id: 'ID del proveedor', almacen_id: 'ID del almacen', almacen_uid: 'UID del almacen',
    uid: 'UID del registro', created_at: 'Fecha de creacion', updated_at: 'Ultima actualizacion',
  }
  return etiquetas[campo] || campo.replaceAll('_', ' ').replace(/^./, letra => letra.toUpperCase())
}

function valorCampoImei(campo: string, valor: unknown): string {
  if (/^(precio_|costo$)/.test(campo)) return formatMoney(Number(valor || 0))
  if (typeof valor === 'boolean') return valor ? 'Si' : 'No'
  if (typeof valor === 'object') return JSON.stringify(valor)
  return String(valor)
}

async function abrirDetalleImei() {
  if (!puedeVerDetalleImei.value || !selectedTelefono.value || !imeiParaPrecio.value?.id) {
    toast.add({ severity: 'warn', summary: 'Acceso restringido', detail: 'Solo Administrador y Soporte pueden consultar los detalles del IMEI', life: 3000 })
    return
  }

  detalleImei.value = { ...imeiParaPrecio.value }
  dialogDetalleImei.value = true
  cargandoDetalleImei.value = true
  try {
    const res = await window.db.getById('imei', Number(imeiParaPrecio.value.id))
    if (!res?.success || !res.data) throw new Error(res?.error || 'No se pudo cargar el IMEI')
    detalleImei.value = { ...imeiParaPrecio.value, ...res.data }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los detalles del IMEI', life: 3500 })
  } finally {
    cargandoDetalleImei.value = false
  }
}
// Solo el nivel explícito "Vendedor" envía facturas pendientes. El nivel
// genérico "Usuario" puede compartir permisos de venta, pero cobra normalmente.
const esVendedorPendiente = computed(() => {
  const nivel = String(auth.user?.nivel_seguridad || '').trim().toLowerCase()
  const rol = String(auth.user?.rol || '').trim().toLowerCase()
  return nivel === 'vendedor' || (!nivel && rol === 'vendedor')
})
const sonidos = reactive(useSonidos())
const conexion = reactive(useConexion())
const caja = reactive(useCaja())
const holdRecall = reactive(useHoldRecall())
const teclasRapidas = reactive(useTeclasRapidas())
const clienteHistorial = reactive(useClienteHistorial())
const spotlight = reactive(useSpotlight())
const stockAlertas = reactive(useStockAlertas())
const miniDashboard = reactive(useMiniDashboard())
const lockScreen = reactive(useLockScreen())
const devoluciones = useDevoluciones()
const dev = devoluciones.state
const barcodeEntry = reactive(useBarcodeEntry())
const causaDescuento = reactive(useCausaDescuento())
const customerDisplay = reactive(useCustomerDisplay())
const loyalty = reactive(useLoyalty())
const combos = reactive(useComboProductos())
const themeStore = useThemeStore()
const dialogAyudaAtajos = ref(false)
const dialogBarcodeToggle = ref(false)
const barcodeCleanup = ref<(() => void) | null>(null)
const busquedaProdCombo = ref('')
const dialogBuscadorCombo = ref(false)

function serialPerteneceEquipo(serial: any, equipo: any): boolean {
  if (!serial || !equipo) return false
  return serial.equipo_uid
    ? String(serial.equipo_uid) === String(equipo.uid || '')
    : Number(serial.id_equi) === Number(equipo.id)
}

function imeiPerteneceTelefono(imei: any, telefono: any): boolean {
  return imeiBelongsToPhone(imei, telefono)
}

type ResumenCatalogo = { capacidades: string; colores: string; precioMayor: number }
const resumenCatalogoVacio: ResumenCatalogo = { capacidades: '', colores: '', precioMayor: 0 }

function construirResumenCatalogo(unidades: any[]): ResumenCatalogo {
  const resumir = (campo: 'capacidad' | 'color') => {
    const valores = [...new Set(unidades.map((unidad: any) => String(unidad?.[campo] || '').trim()).filter(Boolean))]
    const visibles = valores.slice(0, 2).join(' · ')
    return valores.length > 2 ? `${visibles} +${valores.length - 2}` : visibles
  }
  const precios = unidades.map((unidad: any) => Number(unidad.precio_venta || 0)).filter((precio: number) => precio > 0)
  return {
    capacidades: resumir('capacidad'),
    colores: resumir('color'),
    precioMayor: precios.length ? Math.max(...precios) : 0,
  }
}

const resumenTelefonosCatalogo = computed(() => {
  const resumen = new Map<string, ResumenCatalogo>()
  for (const telefono of telefonos.value) {
    resumen.set(String(telefono.uid || telefono.id), construirResumenCatalogo(
      imeisDisponibles.value.filter((imei: any) => imeiPerteneceTelefono(imei, telefono))
    ))
  }
  return resumen
})

const resumenElectroCatalogo = computed(() => {
  const resumen = new Map<string, ResumenCatalogo>()
  for (const equipo of electrodomesticos.value) {
    resumen.set(String(equipo.uid || equipo.id), construirResumenCatalogo(
      serialesDisponibles.value.filter((serial: any) => serialPerteneceEquipo(serial, equipo))
    ))
  }
  return resumen
})

function resumenTelefonoCatalogo(telefono: any): ResumenCatalogo {
  return resumenTelefonosCatalogo.value.get(String(telefono.uid || telefono.id)) || resumenCatalogoVacio
}

function resumenEquipoCatalogo(equipo: any): ResumenCatalogo {
  return resumenElectroCatalogo.value.get(String(equipo.uid || equipo.id)) || resumenCatalogoVacio
}

function telefonoDeImei(imei: any): any | null {
  return resolvePhoneForImei(imei, telefonos.value)
}

function equipoDeSerial(serial: any): any | null {
  return electrodomesticos.value.find((equipo: any) => serialPerteneceEquipo(serial, equipo)) || null
}

const productosFiltradosCombo = computed(() => {
  const texto = busquedaProdCombo.value.toLowerCase().trim()
  const tipo = (combos.comboEditando as any)?.items?.[(combos.comboEditando as any)?._buscandoIdx]?.tipo
  let lista: any[] = []
  if (tipo === 'telefono') {
    lista = telefonos.value.map(t => {
      const imeis = imeisDisponibles.value.filter((i: any) => imeiPerteneceTelefono(i, t))
      return { ...t, precio_venta: imeis[0]?.precio_venta || 0, costo: imeis[0]?.costo || 0, stock: imeis.length }
    })
  } else if (tipo === 'accesorio') {
    lista = accesorios.value
  } else if (tipo === 'electrodomestico') {
    lista = electrodomesticos.value.map(e => {
      const seriales = serialesDisponibles.value.filter((i: any) => serialPerteneceEquipo(i, e))
      return { ...e, precio_venta: seriales[0]?.precio_venta || 0, costo: seriales[0]?.costo || 0, stock: seriales.length }
    })
  } else {
    lista = [
      ...telefonos.value.map(t => {
        const imeis = imeisDisponibles.value.filter((i: any) => imeiPerteneceTelefono(i, t))
        return { ...t, precio_venta: imeis[0]?.precio_venta || 0, costo: imeis[0]?.costo || 0, _tipo: 'telefono' }
      }),
      ...accesorios.value.map(a => ({ ...a, _tipo: 'accesorio' })),
      ...electrodomesticos.value.map(e => {
        const seriales = serialesDisponibles.value.filter((i: any) => serialPerteneceEquipo(i, e))
        return { ...e, precio_venta: seriales[0]?.precio_venta || 0, costo: seriales[0]?.costo || 0, _tipo: 'electrodomestico' }
      }),
    ]
  }
  if (!texto) return lista.slice(0, 20)
  return lista.filter(p => p.nombre?.toLowerCase().includes(texto)).slice(0, 20)
})

function seleccionarProductoCombo(prod: any) {
  const editando = combos.comboEditando as any
  const idx = editando._buscandoIdx
  if (idx === undefined) return
  const item = editando.items[idx]
  if (!item) return
  item.nombre = prod.nombre
  item.precio = prod.precio_venta || 0
  item.costo = prod.costo || 0
  item.refId = prod.id
  if (prod._tipo) item.tipo = prod._tipo
  dialogBuscadorCombo.value = false
}
const busquedaFacturaInputDevolucion = ref('')

function selectSpotlightResult(r: any) {
  if (r.accion === 'telefono') {
    const tel = telefonos.value.find((t: any) => t.id === r.data.id)
    if (tel) { abrirVariantes(tel); sonidos.playClick() }
  } else if (r.accion === 'accesorio') {
    const acc = accesorios.value.find((a: any) => a.id === r.data.id)
    if (acc) { agregarAccesorio(acc); sonidos.playClick() }
  } else if (r.accion === 'cliente') {
    clienteSeleccionado.value = r.data; sonidos.playClick()
    toast.add({ severity: 'success', summary: 'Cliente seleccionado', detail: r.data.nombre, life: 2000 })
  } else if (r.accion === 'productoPersonalizado') {
    abrirProductoPersonalizado()
  } else if (r.accion === 'nuevoCliente') {
    abrirNuevoCliente()
  }
}

async function recallHold(hold: any) {
  const data = holdRecall.recallVenta(hold)
  if (cart.value.length > 0) {
    if (!confirm('Hay productos en el carrito actual. ¿Deseas reemplazarlos con la venta retenida?')) return
  }
  cart.value = data.cart
  clienteSeleccionado.value = data.cliente
  clienteExpress.value = data.clienteExpress
  descuentoFijo.value = data.descuentoFijo
  descuentoPorc.value = data.descuentoPorc
  descuentoTipo.value = data.descuentoTipo
  descuentoValor.value = data.descuentoValor
  metodoPago.value = data.metodoPago
  nota.value = data.nota
  await holdRecall.eliminarHold(hold.id, 'RECUPERADA')
  holdRecall.dialogHold = false
  sonidos.playSuccess()
  toast.add({ severity: 'success', summary: 'Venta recuperada', detail: `${hold.itemsCount} producto(s) cargados`, life: 3000 })
}

function agregarComboAlCarrito(combo: any) {
  const items = combos.comboToCart(combo)
  for (const item of items) {
    cart.value.push({ ...item, comboId: combo.id, comboNombre: combo.nombre })
  }
  combos.dialogSeleccionarCombo = false
  sonidos.playSuccess()
  toast.add({ severity: 'success', summary: 'Combo agregado', detail: combo.nombre, life: 2000 })
}

function seleccionarCompraHistorial(compra: any) {
  clienteHistorial.dialogHistorialCliente = false
  const productos = Array.isArray(compra.productos) ? compra.productos : []
  if (productos.length > 0) {
    const items = productos.map((p: any) => ({
      tipo: p.tipo || 'manual',
      nombre: p.nombre || 'Producto',
      cantidad: p.cantidad || 1,
      precio: p.precio || 0,
      precio_normal: p.precio_normal || p.precio || 0,
      costo: p.costo || 0,
      imei: p.imei || '',
      imei_id: p.imei_id || null,
      serial: p.serial || '',
      serial_id: p.serial_id || null,
      accesorio_id: p.accesorio_id || null,
      historialRef: compra.no_factura,
    }))
    cart.value = items
    toast.add({ severity: 'info', summary: 'Productos cargados', detail: `Desde factura ${compra.no_factura}`, life: 3000 })
  }
}

function isTicketOptionOn(value: any): boolean {
  return value === true || value === 1 || value === '1'
}

function guardarEstado() {
  const data = {
    cart: cart.value,
    cliente: clienteSeleccionado.value,
    descuento_fijo: descuentoFijo.value,
    descuento_porc: descuentoPorc.value,
    descuento_tipo: descuentoTipo.value,
    descuento_valor: descuentoValor.value,
    metodoPago: metodoPago.value,
    nota: nota.value,
    es_cotizacion: esCotizacion.value,
    factura_editando: facturaEditandoPos.value,
    productos_originales_editando: productosOriginalesEditandoPos.value,
    venta_express_pendiente: ventaExpressPendiente.value,
  }
  localStorage.setItem(POS_STORAGE_KEY, JSON.stringify(data))
}

async function cargarEstado() {
  await recargarConfigVentas()
  try {
    const raw = localStorage.getItem(POS_STORAGE_KEY)
    if (!raw) return
    const data = JSON.parse(raw)
    if (data.cart?.length) cart.value = data.cart
    if (data.cliente) clienteSeleccionado.value = data.cliente
    if (data.descuento_fijo != null) descuentoFijo.value = data.descuento_fijo
    if (data.descuento_porc != null) descuentoPorc.value = data.descuento_porc
    if (data.descuento_tipo) descuentoTipo.value = data.descuento_tipo
    if (data.descuento_valor != null) descuentoValor.value = data.descuento_valor
    if (data.metodoPago) metodoPago.value = data.metodoPago
    if (data.nota) nota.value = data.nota
    if (data.es_cotizacion != null) esCotizacion.value = data.es_cotizacion
    if (data.factura_editando) facturaEditandoPos.value = data.factura_editando
    if (Array.isArray(data.productos_originales_editando)) productosOriginalesEditandoPos.value = data.productos_originales_editando
    if (data.venta_express_pendiente) ventaExpressPendiente.value = true
  } catch (e) {
    console.error('Error loading POS state:', e)
  }
}

const metodosPagoDB = ref<any[]>([])
const metodosPago = computed(() => {
  const db = metodosPagoDB.value
    .filter((m: any) => m.estado === 'ACTIVO')
    .map((m: any) => ({ label: m.porcentaje ? `${m.nombre} (${m.porcentaje}%)` : m.nombre, value: m.nombre, porcentaje: m.porcentaje }))
  if (!db.some((m: any) => m.value === 'CREDITO')) db.push({ label: 'Credito', value: 'CREDITO' })
  if (!db.some((m: any) => m.value === 'MIXTO')) db.push({ label: 'Mixto', value: 'MIXTO' })
  return db
})
const metodoPagoSelected = computed(() => metodosPagoDB.value.find((m: any) => m.nombre === metodoPago.value))
function esMetodoTarjeta(valor: any = metodoPago.value) {
  return String(valor || '').trim().toUpperCase().includes('TARJETA')
}
const tarjetasMixto = computed(() => {
  const metodosBase = new Set(['EFECTIVO', 'TRANSFERENCIA', 'CHEQUE', 'CREDITO', 'CRÉDITO', 'MIXTO'])
  return metodosPagoDB.value
    .filter((metodo: any) => metodo.estado === 'ACTIVO' && !metodosBase.has(String(metodo.nombre || '').trim().toUpperCase()))
    .map((metodo: any) => ({
      ...metodo,
      label: Number(metodo.porcentaje || 0) > 0 ? `${metodo.nombre} (${Number(metodo.porcentaje)}%)` : metodo.nombre,
    }))
})
const metodoTarjetaMixtoSeleccionado = computed(() =>
  tarjetasMixto.value.find((metodo: any) => Number(metodo.id) === Number(metodoTarjetaMixtoId.value)) || null
)
const needsBankSelection = computed(() => {
  const m = String(metodoPago.value).toUpperCase()
  return m === 'TRANSFERENCIA' || esMetodoTarjeta(m)
})
const comisionPorcentaje = computed(() => {
  if (metodoPago.value === 'CREDITO' || metodoPago.value === 'MIXTO') return 0
  return Number(metodoPagoSelected.value?.porcentaje || 0)
})
const comisionMixtaPorcentaje = computed(() => {
  if (String(metodoPago.value).toUpperCase() !== 'MIXTO' || !metodosMixto.value.tarjeta) return 0
  return Number(metodoTarjetaMixtoSeleccionado.value?.porcentaje || 0)
})
const comisionMixtaMonto = computed(() => Number(mixtoTarjeta.value || 0) * (comisionMixtaPorcentaje.value / 100))
const montoTarjetaMixtoTotal = computed(() => Number(mixtoTarjeta.value || 0) + comisionMixtaMonto.value)
const detalleTarjetaMixta = computed(() => {
  if (!metodosMixto.value.tarjeta || !metodoTarjetaMixtoSeleccionado.value) return null
  return {
    metodo_id: Number(metodoTarjetaMixtoSeleccionado.value.id || 0),
    metodo_nombre: String(metodoTarjetaMixtoSeleccionado.value.nombre || ''),
    porcentaje: comisionMixtaPorcentaje.value,
    monto_base: Number(mixtoTarjeta.value || 0),
    monto_comision: comisionMixtaMonto.value,
    total: montoTarjetaMixtoTotal.value,
  }
})
const porcentajeTarjetaFactura = computed(() => {
  const metodo = String(metodoPago.value || '').toUpperCase()
  if (esMetodoTarjeta(metodo)) return comisionPorcentaje.value
  if (metodo === 'MIXTO') return comisionMixtaPorcentaje.value
  return 0
})
const montoPorcentajeTarjeta = computed(() => {
  const metodo = String(metodoPago.value || '').toUpperCase()
  if (esMetodoTarjeta(metodo)) {
    const subtotalOriginal = cart.value.reduce((sum, item) => sum + (Number(item.precio || 0) * Number(item.cantidad || 1)), 0)
    return subtotalOriginal * (porcentajeTarjetaFactura.value / 100)
  }
  if (metodo === 'MIXTO') return comisionMixtaMonto.value
  return 0
})
const totalDistribuidoMixto = computed(() =>
  Number(mixtoEfectivo.value || 0) + montoTarjetaMixtoTotal.value + totalTransferenciasMixto() + Number(mixtoCheque.value || 0)
)
const cartConComision = computed(() => {
  const pct = comisionPorcentaje.value
  if (pct <= 0) return cart.value
  return cart.value.map(item => ({
    ...item,
    precio: item.precio * (1 + pct / 100),
    precioOriginal: item.precio,
  }))
})

function pagoBadge(value: string): string {
  const map: Record<string, string> = {
    EFECTIVO: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    TARJETA: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    TRANSFERENCIA: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
    CHEQUE: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    CREDITO: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    MIXTO: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900/30 dark:text-cyan-300',
  }
  return map[value] || 'bg-surface-100 text-surface-600'
}

function pagoIcon(value: string): string {
  const map: Record<string, string> = {
    EFECTIVO: 'pi pi-money-bill',
    TARJETA: 'pi pi-credit-card',
    TRANSFERENCIA: 'pi pi-send',
    CHEQUE: 'pi pi-book',
    CREDITO: 'pi pi-clock',
    MIXTO: 'pi pi-sync',
  }
  return map[value] || 'pi pi-circle'
}

function compBadge(tipo: string): string {
  const map: Record<string, string> = {
    SIN: 'bg-gray-200 text-gray-700 dark:bg-gray-700 dark:text-gray-200',
    E31: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300',
    E32: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
    E33: 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-300',
    E34: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
    E41: 'bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-300',
  }
  return map[tipo] || 'bg-surface-100 text-surface-600'
}

const productosFiltrados = computed(() => {
  return filterPosCatalog({
    tab: activeTab.value, query: busquedaProdFiltrada.value, hideOutOfStock: ocultarSinStock.value,
    phones: telefonos.value, appliances: electrodomesticos.value, accessories: accesorios.value,
    imeis: imeisDisponibles.value, serials: serialesDisponibles.value,
    imeiBelongsToPhone: imeiPerteneceTelefono, serialBelongsToAppliance: serialPerteneceEquipo,
  })
})

const busquedaGlobalActiva = computed(() => busquedaProdFiltrada.value.trim().length > 0)
const resultadosBusquedaGlobal = computed(() => searchGlobalPosCatalog({
  query: busquedaProdFiltrada.value,
  hideOutOfStock: ocultarSinStock.value,
  phones: telefonos.value,
  appliances: electrodomesticos.value,
  accessories: accesorios.value,
  imeis: imeisDisponibles.value,
  serials: serialesDisponibles.value,
  imeiBelongsToPhone: imeiPerteneceTelefono,
  serialBelongsToAppliance: serialPerteneceEquipo,
}))

const cantidadResultadosPos = computed(() => busquedaGlobalActiva.value
  ? resultadosBusquedaGlobal.value.length
  : productosFiltrados.value.length)

function buscarImei() {
  const texto = busquedaProd.value.trim()
  if (!texto || texto.length < 3) return
  const normalizado = texto.toLowerCase()
  const imeiExacto = imeisDisponibles.value.find(i => String(i.nombre || '').trim().toLowerCase() === normalizado)
  if (imeiExacto) {
    activeTab.value = 'celulares'
    selectedTelefono.value = telefonos.value.find((telefono: any) => imeiPerteneceTelefono(imeiExacto, telefono)) || null
    imeiParaPrecio.value = imeiExacto
    precioSeleccionado.value = 'venta'
    precioManual.value = imeiExacto.precio_venta || 0
    busquedaProd.value = ''
    dialogPrecio.value = true
    return
  }

  const serialExacto = serialesDisponibles.value.find(i => String(i.nombre || '').trim().toLowerCase() === normalizado)
  if (serialExacto) {
    activeTab.value = 'electrodomesticos'
    selectedElectrodomestico.value = equipoDeSerial(serialExacto)
    imeiParaPrecio.value = serialExacto
    precioSeleccionado.value = 'venta'
    precioManual.value = serialExacto.precio_venta || 0
    busquedaProd.value = ''
    dialogPrecio.value = true
    return
  }

  const accesorioExacto = accesorios.value.find((item: any) =>
    String(item.codigo_barra || '').trim().toLowerCase() === normalizado ||
    String(item.nombre || '').trim().toLowerCase() === normalizado
  )
  if (accesorioExacto) {
    activeTab.value = 'accesorios'
    if (Number(accesorioExacto.cantidad || 0) > 0) agregarAccesorio(accesorioExacto)
    busquedaProd.value = ''
    return
  }

  const telefonoExacto = telefonos.value.find((item: any) => String(item.nombre || '').trim().toLowerCase() === normalizado)
  if (telefonoExacto) {
    activeTab.value = 'celulares'
    abrirVariantes(telefonoExacto)
    return
  }

  const equipoExacto = electrodomesticos.value.find((item: any) => String(item.nombre || '').trim().toLowerCase() === normalizado)
  if (equipoExacto) {
    activeTab.value = 'electrodomesticos'
    abrirVariantesSerial(equipoExacto)
  }
}

const subtotal = computed(() => {
  return cartConComision.value.reduce((sum, item) => sum + (item.precio * item.cantidad), 0)
})

const total = computed(() => {
  const desc = descuentoTipo.value === 'porcentaje'
    ? subtotal.value * (descuentoValor.value / 100)
    : descuentoFijo.value
  const base = Math.max(0, subtotal.value - Math.min(desc, subtotal.value))
  if (impuestoIncluido.value === 0) {
    return base + (base * (impuestoPorcentaje.value / 100)) + comisionMixtaMonto.value
  }
  return base + comisionMixtaMonto.value
})

const impuestoMonto = computed(() => {
  if (impuestoIncluido.value === 0) {
    const base = Math.max(0, subtotal.value - Math.min(descuento.value, subtotal.value))
    return base * (impuestoPorcentaje.value / 100)
  }
  return 0
})

const descuento = computed(() => {
  if (descuentoTipo.value === 'porcentaje') {
    return subtotal.value * (descuentoValor.value / 100)
  }
  return descuentoFijo.value
})

const cambio = computed(() => Math.max(0, Number(montoRecibido.value) - Number(total.value)))

watch([cart, clienteSeleccionado, descuento, metodoPago, nota], guardarEstado, { deep: true })

const clientesFiltrados = computed(() => {
  return filterPosCustomers(clientes.value, busquedaCliente.value)
})

const gananciaTotal = computed(() => {
  return cart.value.reduce((sum, item) => {
    const costo = item.costo || 0
    return sum + ((item.precio - costo) * item.cantidad)
  }, 0)
})

const costoTotal = computed(() => {
  return cart.value.reduce((sum, item) => {
    return sum + (Number(item.costo || 0) * Number(item.cantidad || 1))
  }, 0)
})

const cartCount = computed(() => cart.value.reduce((sum, item) => sum + item.cantidad, 0))

const variantesFiltradas = computed(() => {
  const lista = selectedTelefono.value ? variantesImei.value : variantesSerial.value
  const texto = busquedaImei.value.toLowerCase().trim()
  if (!texto) return lista
  return lista.filter(i =>
    i.nombre?.toLowerCase().includes(texto) ||
    i.color?.toLowerCase().includes(texto) ||
    i.capacidad?.toLowerCase().includes(texto)
  )
})

function formatCurrency(n: number): string {
  if (n == null) return '0.00'
  return Number(n).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatMoney(n: any): string {
  return new Intl.NumberFormat(systemLocale.value, {
    style: 'currency',
    currency: systemCurrency.value,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(n || 0))
}

function esRegistroCotizacion(factura: any): boolean {
  return factura?.tipo_factura === 'COTIZACION' || factura?.estado_factura === 'COTIZACION'
}

function esFacturaPendiente(factura: any = registroFatCotiSeleccionado.value): boolean {
  return String(factura?.estado_factura || '').toUpperCase() === 'PENDIENTE'
}

function fechaRegistroFatCoti(factura: any): string {
  const fecha = factura?.fecha_emision || factura?.created_at || ''
  const hora = factura?.hora || ''
  return `${fecha}${hora ? ' ' + hora : ''}`.trim()
}

function ordenarRegistrosFatCoti(registros: any[]): any[] {
  return [...registros].sort((a: any, b: any) => {
    const fechaA = new Date(a.created_at || a.fecha_emision || 0).getTime() || 0
    const fechaB = new Date(b.created_at || b.fecha_emision || 0).getTime() || 0
    if (fechaA !== fechaB) return fechaB - fechaA
    return Number(b.id || 0) - Number(a.id || 0)
  })
}

const registrosFatCotiFiltrados = computed(() => {
  const texto = busquedaFatCoti.value.toLowerCase().trim()
  const limite = Math.max(1, Number(limiteFatCoti.value) || 1000)
  const esCot = tipoFatCoti.value === 'COTIZACION'

  let data = registrosFatCoti.value.filter((factura: any) => esRegistroCotizacion(factura) === esCot)

  if (texto) {
    data = data.filter((factura: any) =>
      String(factura.no_factura || '').toLowerCase().includes(texto) ||
      String(factura.nombre_cliente || '').toLowerCase().includes(texto) ||
      String(factura.telefono_cliente || '').toLowerCase().includes(texto) ||
      String(factura.ncf || '').toLowerCase().includes(texto) ||
      String(factura.total || '').toLowerCase().includes(texto)
    )
  }

  return ordenarRegistrosFatCoti(data).slice(0, limite)
})

const clientesFactCotiFiltrados = computed(() => {
  const texto = busquedaClienteFactCoti.value.toLowerCase().trim()
  let data = clientes.value
  if (!texto) return data
  return data.filter((cliente: any) =>
    String(cliente.nombre || '').toLowerCase().includes(texto) ||
    String(cliente.telefono || '').toLowerCase().includes(texto) ||
    String(cliente.rnc || '').toLowerCase().includes(texto) ||
    String(cliente.id || '').toLowerCase().includes(texto)
  )
})

const productosFactCotiFiltrados = computed(() => {
  const texto = busquedaProductosFactCoti.value.toLowerCase().trim()
  if (!texto) return productosFactCoti.value
  return productosFactCoti.value.filter((producto: any) =>
    String(producto.nombre || producto.descripcion || '').toLowerCase().includes(texto) ||
    String(producto.imei || '').toLowerCase().includes(texto) ||
    String(producto.serial || '').toLowerCase().includes(texto) ||
    String(producto.tipo || '').toLowerCase().includes(texto) ||
    String(producto.color || '').toLowerCase().includes(texto) ||
    String(producto.capacidad || '').toLowerCase().includes(texto)
  )
})

const productosDbFactCotiFiltrados = computed(() => {
  const texto = busquedaProductoDbFactCoti.value.toLowerCase().trim()
  const electroMap = new Map(electrodomesticos.value.map((elec: any) => [elec.id, elec.nombre]))

  const items = [
    ...accesorios.value.map((acc: any) => ({
      dbKey: `accesorio-${acc.id}`,
      origen: 'accesorio',
      id: acc.id,
      nombre: acc.nombre,
      detalle: acc.marca_nombre || 'Accesorio',
      cantidadDisponible: Number(acc.cantidad || 0),
      precio: Number(acc.precio_venta || 0),
      costo: Number(acc.costo || 0),
      raw: acc,
    })),
    ...(systemMode.isCellphoneStore ? imeisDisponibles.value.map((imei: any) => ({
      dbKey: `imei-${imei.id}`,
      origen: 'imei',
      id: imei.id,
      nombre: telefonoDeImei(imei)?.nombre || imei.equipo || imei.nombre,
      detalle: `IMEI: ${imei.nombre}${imei.color ? ' · ' + imei.color : ''}${imei.capacidad ? ' · ' + imei.capacidad : ''}`,
      cantidadDisponible: 1,
      precio: Number(imei.precio_venta || 0),
      costo: Number(imei.costo || 0),
      raw: imei,
    })) : []),
    ...serialesDisponibles.value.map((serial: any) => ({
      dbKey: `serial-${serial.id}`,
      origen: 'serial',
      id: serial.id,
      nombre: equipoDeSerial(serial)?.nombre || serial.equipo || electroMap.get(serial.id_equi) || serial.nombre,
      detalle: `Serial: ${serial.nombre}${serial.color ? ' · ' + serial.color : ''}${serial.capacidad ? ' · ' + serial.capacidad : ''}`,
      cantidadDisponible: 1,
      precio: Number(serial.precio_venta || 0),
      costo: Number(serial.costo || 0),
      raw: serial,
    })),
  ]

  const disponibles = items.filter((item: any) => item.origen !== 'accesorio' || item.cantidadDisponible > 0)
  if (!texto) return disponibles

  return disponibles.filter((item: any) =>
    String(item.nombre || '').toLowerCase().includes(texto) ||
    String(item.detalle || '').toLowerCase().includes(texto) ||
    String(item.origen || '').toLowerCase().includes(texto)
  )
})

async function cargarRegistrosFatCoti() {
  cargandoFatCoti.value = true
  try {
    const res = await window.db.getAll('facturas')
    registrosFatCoti.value = res.success ? filterByAlmacen(res.data || []) : []
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar las facturas', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar las facturas', life: 3000 })
  } finally {
    cargandoFatCoti.value = false
  }
}

async function abrirFatCoti() {
  dialogFatCoti.value = true
  registroFatCotiSeleccionado.value = null
  await cargarRegistrosFatCoti()
}

function abrirDevolucionFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura || tipoRegistroFactCoti(factura) !== 'factura') {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona una factura para procesar la devolucion', life: 2500 })
    return
  }

  dev.resultadoDevolucion = null
  dev.motivoDevolucion = ''
  devoluciones.seleccionarFactura(factura)
  dev.dialogDevolucion = true
  dialogFatCoti.value = false
}

function abrirRecibirEquipo() {
  dialogRecibirEquipo.value = true
}

function abrirOrdenTallerPos() {
  dialogOrdenTallerPos.value = true
}

async function onOrdenTallerPosGuardada(payload?: any) {
  dialogOrdenTallerPos.value = false
  ordenTallerPosGuardada.value = payload?.orden || null
  if (ordenTallerPosGuardada.value) {
    dialogOrdenTallerPostSave.value = true
  }
}

async function cargarPlantillasEtiquetasTallerPos() {
  const res = await window.db.getAll('plantillas_etiquetas')
  if (res.success) plantillasEtiquetasTallerPos.value = res.data || []
}

async function escanearPrintersTallerPos() {
  escaneandoPrintersTallerPos.value = true
  try {
    const res = await window.electron.invoke('getPrinters')
    if (res.success) printersTallerPos.value = res.data || []
  } catch (_) {
    printersTallerPos.value = []
  } finally {
    escaneandoPrintersTallerPos.value = false
  }
}

async function imprimirOrdenTallerPos() {
  if (!ordenTallerPosGuardada.value) return
  await ticketTallerRef.value?.printTicket(ordenTallerPosGuardada.value)
}

async function abrirEtiquetaOrdenTallerPos() {
  if (!ordenTallerPosGuardada.value) return
  printerTallerPos.value = localStorage.getItem('etiquetas_printer') || ''
  await Promise.all([cargarPlantillasEtiquetasTallerPos(), escanearPrintersTallerPos()])
  dialogEtiquetaTallerPos.value = true
}

function aplicarVariablesEtiquetaTallerPos(valor: string, orden: any): string {
  const numeroOrden = orden?.no_orden || orden?.id || ''
  return String(valor || '')
    .replace(/\{CLIENTE\}/g, orden?.nombre || '')
    .replace(/\{NO_ORDEN\}/g, numeroOrden)
    .replace(/\{ORDEN\}/g, numeroOrden)
    .replace(/\{NUMERO_ORDEN\}/g, numeroOrden)
}

async function imprimirEtiquetaOrdenTallerPos(plantilla: any) {
  const orden = ordenTallerPosGuardada.value
  if (!orden || !plantilla?.elementos) return
  if (!printerTallerPos.value) {
    toast.add({ severity: 'warn', summary: 'Selecciona una impresora', life: 2000 })
    return
  }

  localStorage.setItem('etiquetas_printer', printerTallerPos.value)
  dialogEtiquetaTallerPos.value = false

  let elementos: any[]
  try { elementos = JSON.parse(plantilla.elementos) } catch { return }

  const mmToPx = (mm: number) => mm * 3.7795275591
  const ancho = plantilla.ancho || 50
  const alto = plantilla.alto || 30
  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta Taller</title><style>'
  html += 'body{margin:0;padding:0;font-family:Arial,sans-serif}'
  html += `.label{width:${mmToPx(ancho)}px;height:${mmToPx(alto)}px;position:relative;overflow:hidden;background:white}`
  html += '.elem{position:absolute;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:center}'
  html += '</style></head><body><div class="label">'

  const elClone = JSON.parse(JSON.stringify(elementos))
  for (const el of elClone) {
    if (typeof el.contenido === 'string') el.contenido = aplicarVariablesEtiquetaTallerPos(el.contenido, orden)
    const style = `left:${mmToPx(el.x)}px;top:${mmToPx(el.y)}px;width:${mmToPx(el.ancho)}px;height:${mmToPx(el.alto)}px;`
    if (el.tipo === 'texto') {
      html += `<div class="elem" style="${style}font-size:${(el.fontSize || 8) * 1.333}px;font-weight:${el.bold ? 'bold' : 'normal'}">${el.contenido}</div>`
    } else if (el.tipo === 'barcode') {
      html += `<div class="elem" style="${style}overflow:hidden">${generarBarcodeSVG(aplicarVariablesEtiquetaTallerPos(el.contenido, orden))}</div>`
    } else if (el.tipo === 'qr') {
      const qrData = await QRCode.toDataURL(aplicarVariablesEtiquetaTallerPos(el.contenido, orden), { width: 200, margin: 1 })
      html += `<img class="elem" style="${style}object-fit:contain;max-width:100%;max-height:100%" src="${qrData}" />`
    }
  }
  html += '</div></body></html>'

  try {
    const res = await window.electron.invoke('print:ticket', html, printerTallerPos.value || undefined)
    if (res.success) toast.add({ severity: 'success', summary: 'Impreso', detail: 'Etiqueta enviada a la impresora', life: 2000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo imprimir', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al imprimir etiqueta', life: 3000 })
  }
}

async function onRecibidoPosGuardado(payload?: any) {
  dialogRecibirEquipo.value = false
  await Promise.all([cargarProductos(), cargarImeisDisponibles()])
  const notaCredito = payload?.notaCredito || null
  const valor = Number(notaCredito?.total || getNotaCreditoValueFromRecibido(payload) || 0)
  if (payload && valor > 0) {
    recibidoParaDescuento.value = payload
    notaCreditoRecibido.value = notaCredito || {
      id: null,
      no_factura: getNotaCreditoNoFromRecibido(payload) || 'NOTA_CREDITO',
      total: valor,
    }
    dialogAplicarNotaRecibido.value = true
  }
}

function getNotaCreditoValueFromRecibido(recibido: any): number {
  try {
    const nota = typeof recibido?.nota === 'string' ? JSON.parse(recibido.nota || '{}') : recibido?.nota || {}
    return Number(nota.credit_note_value || 0)
  } catch {
    return 0
  }
}

function getNotaCreditoNoFromRecibido(recibido: any): string {
  try {
    const nota = typeof recibido?.nota === 'string' ? JSON.parse(recibido.nota || '{}') : recibido?.nota || {}
    return nota.credit_note_no || ''
  } catch {
    return ''
  }
}

async function aplicarNotaRecibidoComoDescuento() {
  const notaRecibido = notaCreditoRecibido.value
  const valor = Number(notaRecibido?.total || getNotaCreditoValueFromRecibido(recibidoParaDescuento.value) || 0)
  if (valor <= 0) return
  if (subtotal.value <= 0) {
    toast.add({ severity: 'warn', summary: 'Carrito vacio', detail: 'Agrega productos antes de aplicar la nota de credito', life: 3000 })
    return
  }

  descuentoTipo.value = 'nota_credito'
  descuentoValor.value = valor
  descuentoFijo.value = Math.min(subtotal.value, Math.max(0, valor))
  descuentoPorc.value = 0
  notaCreditoSeleccionada.value = notaRecibido
  notaCreditoUsada.value = `NC: ${notaRecibido?.no_factura || 'RECIBIDO'} - ${systemCurrency.value}${formatCurrency(descuentoFijo.value)}`
  if (notaRecibido?.id) await window.db.update('facturas', notaRecibido.id, { estado_factura: 'UTILIZADA' })
  dialogAplicarNotaRecibido.value = false
  recibidoParaDescuento.value = null
  notaCreditoRecibido.value = null
  toast.add({ severity: 'success', summary: 'Nota aplicada', detail: 'La nota de credito se aplico como descuento', life: 3000 })
}

function omitirNotaRecibidoComoDescuento() {
  dialogAplicarNotaRecibido.value = false
  recibidoParaDescuento.value = null
  notaCreditoRecibido.value = null
}

function tipoRegistroFactCoti(factura: any = registroFatCotiSeleccionado.value): 'factura' | 'cotizacion' {
  return esRegistroCotizacion(factura) ? 'cotizacion' : 'factura'
}

function esCreditoFactCoti(factura: any = registroFatCotiSeleccionado.value): boolean {
  return String(factura?.metodo_pago || '').toUpperCase() === 'CREDITO' ||
    String(factura?.estado_factura || '').toUpperCase() === 'CREDITO'
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
  const localLegalStatus = String(
    factura?.legal_status ||
    factura?.alanube_legal_status ||
    factura?.ecf_legal_status ||
    otro?.legal_status ||
    response?.legalStatus ||
    response?.legal_status ||
    ''
  ).toUpperCase()
  return tipo.startsWith('E') && localLegalStatus === 'ACCEPTED'
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

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'POS' } catch { return 'POS' }
}

async function registrarAuditoriaFactura(accion: string, factura: any, detalle: any = {}, resultado = 'OK') {
  try {
    await window.electron.invoke('auditoria:registrar', {
      modulo: 'pos',
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

async function bloquearSiFacturaElectronicaAceptada(factura: any, accion = 'modificar'): Promise<boolean> {
  if (!(await esFacturaElectronicaAceptada(factura))) return false
  await registrarAuditoriaFactura('bloqueo_fiscal', factura, { accion, motivo: 'DGII_ACCEPTED' }, 'BLOQUEADO')
  toast.add({
    severity: 'warn',
    summary: 'Factura fiscal bloqueada',
    detail: `Esta factura electronica fue aceptada por DGII. No se puede ${accion}; usa reimpresion o nota de credito.`,
    life: 4500,
  })
  return true
}

async function confirmarEliminarFactCoti() {
  if (!registroFatCotiSeleccionado.value) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }
  if (await bloquearSiFacturaElectronicaAceptada(registroFatCotiSeleccionado.value, 'eliminar')) return
  factCotiOtpEnviado.value = false
  factCotiOtp.value = ''
  factCotiOtpEmail.value = ''
  factCotiOtpError.value = ''
  dialogEliminarFactCoti.value = true
}

async function verCuentaCobrarFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura) return
  dialogFactCoti.value = false
  await router.push({ name: 'editar-cuenta-cobrar', params: { facturaId: factura.id } })
}

async function abonarCuentaCobrarFactCoti() {
  const cuenta = cuentaCobrarFactCoti.value
  const monto = Number(abonoCuentaCobrarFactCoti.value || 0)
  if (!cuenta || monto <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un monto valido', life: 2500 })
    return
  }

  const saldoActual = Number(cuenta.saldo || 0)
  if (monto > saldoActual) {
    toast.add({ severity: 'warn', summary: 'Monto excede el saldo', detail: `Saldo: ${systemCurrency.value} ${formatCurrency(saldoActual)}`, life: 3000 })
    return
  }

  guardandoAbonoCuentaCobrarFactCoti.value = true
  try {
    let pagos: any[] = []
    try {
      const parsed = JSON.parse(cuenta.pagos || '[]')
      pagos = Array.isArray(parsed) ? parsed : []
    } catch {
      pagos = []
    }

    const fecha = new Date().toISOString()
    pagos.push({
      fecha,
      monto,
      metodo: 'ABONO FACT-COTI',
      nota: 'ABONO REGISTRADO DESDE FACT-COTI',
    })

    const nuevoAbonado = Number(cuenta.abonado || 0) + monto
    const nuevoSaldo = Math.max(0, Number(cuenta.total || 0) - nuevoAbonado)
    const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'ACTIVA'

    const res = await window.db.update('cuentas_cobrar', cuenta.id, {
      abonado: nuevoAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      pagos: JSON.stringify(pagos),
      updated_at: fecha,
    })

    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo registrar el abono', life: 3000 })
      return
    }

    cuentaCobrarFactCoti.value = {
      ...cuenta,
      abonado: nuevoAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      pagos: JSON.stringify(pagos),
    }
    abonoCuentaCobrarFactCoti.value = 0
    toast.add({ severity: 'success', summary: 'Abono registrado', detail: `${systemCurrency.value} ${formatCurrency(monto)}`, life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo registrar el abono', life: 3000 })
  } finally {
    guardandoAbonoCuentaCobrarFactCoti.value = false
  }
}

function setAbonoPorcentajeFactCoti(porcentaje: number) {
  const saldo = Number(cuentaCobrarFactCoti.value?.saldo || 0)
  abonoCuentaCobrarFactCoti.value = Number((saldo * porcentaje).toFixed(2))
}

function normalizarTelefonoWhatsapp(valor: any): string {
  const digits = String(valor || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `1${digits}`
  return digits
}

function resumenWhatsappCuentaFactCoti(cuenta: any): string {
  const pagos = parsePagosCuentaFactCoti(cuenta)
  const ultimosPagos = pagos.slice(-5).map((p: any, index: number) => {
    const monto = Number(p.monto ?? p.cantidad ?? 0)
    return `${index + 1}. ${p.fecha || ''} - ${systemCurrency.value} ${formatCurrency(monto)}`
  }).join('\n')

  return [
    `*Estado de cuenta*`,
    ``,
    `Factura: ${cuenta.no_factura || '-'}`,
    `Cliente: ${cuenta.nombre_cliente || 'CONSUMIDOR FINAL'}`,
    `Total: ${systemCurrency.value} ${formatCurrency(cuenta.total || 0)}`,
    `Abonado: ${systemCurrency.value} ${formatCurrency(cuenta.abonado || 0)}`,
    `Saldo pendiente: ${systemCurrency.value} ${formatCurrency(cuenta.saldo || 0)}`,
    `Estado: ${cuenta.estado || 'ACTIVA'}`,
    cuenta.fecha_venta ? `Fecha venta: ${cuenta.fecha_venta}` : '',
    cuenta.fecha_vencimiento ? `Vencimiento: ${cuenta.fecha_vencimiento}` : '',
    ``,
    pagos.length ? `*Ultimos abonos:*\n${ultimosPagos}` : `Sin abonos registrados.`,
    ``,
    `Gracias por su preferencia.`,
  ].filter(line => line !== '').join('\n')
}

function enviarWhatsappCuentaFactCoti() {
  const cuenta = cuentaCobrarFactCoti.value
  if (!cuenta) return

  const telefono = normalizarTelefonoWhatsapp(cuenta.whatsapp || cuenta.telefono_cliente)
  if (!telefono) {
    whatsappCuentaFactCoti.value = ''
    dialogWhatsappCuentaFactCoti.value = true
    return
  }

  const mensaje = encodeURIComponent(resumenWhatsappCuentaFactCoti(cuenta))
  window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank')
}

function abrirCambiarWhatsappFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }
  whatsappFactCoti.value = factura.telefono_cliente || ''
  dialogWhatsappFactCoti.value = true
}

async function guardarWhatsappFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  const telefono = normalizarTelefonoWhatsapp(whatsappFactCoti.value)
  if (!factura || !telefono) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un WhatsApp valido', life: 2500 })
    return
  }

  guardandoWhatsappFactCoti.value = true
  try {
    const telefonoLocal = telefono.startsWith('1') && telefono.length === 11 ? telefono.slice(1) : telefono
    const res = await window.db.update('facturas', factura.id, { telefono_cliente: telefonoLocal })
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar el WhatsApp', life: 3000 })
      return
    }

    try {
      const cxcRes = await window.db.getAll('cuentas_cobrar')
      if (cxcRes.success) {
        const cuenta = (cxcRes.data || []).find((c: any) => String(c.no_factura || '') === String(factura.no_factura || ''))
        if (cuenta) await window.db.update('cuentas_cobrar', cuenta.id, { telefono_cliente: telefonoLocal })
      }
    } catch (_) {}

    registroFatCotiSeleccionado.value = { ...factura, telefono_cliente: telefonoLocal }
    await cargarRegistrosFatCoti()
    registroFatCotiSeleccionado.value = registrosFatCoti.value.find((f: any) => f.id === factura.id) || registroFatCotiSeleccionado.value
    dialogWhatsappFactCoti.value = false
    toast.add({ severity: 'success', summary: 'Actualizado', detail: 'WhatsApp actualizado', life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar el WhatsApp', life: 3000 })
  } finally {
    guardandoWhatsappFactCoti.value = false
  }
}

async function guardarWhatsappCuentaFactCoti() {
  const cuenta = cuentaCobrarFactCoti.value
  const telefono = normalizarTelefonoWhatsapp(whatsappCuentaFactCoti.value)
  if (!cuenta || !telefono) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un WhatsApp valido', life: 2500 })
    return
  }

  guardandoWhatsappCuentaFactCoti.value = true
  try {
    const telefonoLocal = telefono.startsWith('1') && telefono.length === 11 ? telefono.slice(1) : telefono
    const res = await window.db.update('cuentas_cobrar', cuenta.id, { telefono_cliente: telefonoLocal })
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar el WhatsApp', life: 3000 })
      return
    }

    cuentaCobrarFactCoti.value = { ...cuenta, telefono_cliente: telefonoLocal, whatsapp: telefonoLocal }

    try {
      const factura = registroFatCotiSeleccionado.value
      if (factura?.id) {
        await window.db.update('facturas', factura.id, { telefono_cliente: telefonoLocal })
        registroFatCotiSeleccionado.value = { ...factura, telefono_cliente: telefonoLocal }
      }
    } catch (_) {}

    dialogWhatsappCuentaFactCoti.value = false
    enviarWhatsappCuentaFactCoti()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar el WhatsApp', life: 3000 })
  } finally {
    guardandoWhatsappCuentaFactCoti.value = false
  }
}

function parsePagosCuentaFactCoti(cuenta: any): any[] {
  try {
    const pagos = JSON.parse(cuenta?.pagos || '[]')
    return Array.isArray(pagos) ? pagos : []
  } catch {
    return []
  }
}

function parseProductosFacturaFactCoti(factura: any = registroFatCotiSeleccionado.value): any[] {
  try {
    const productos = typeof factura?.productos === 'string' ? JSON.parse(factura.productos || '[]') : factura?.productos
    return Array.isArray(productos) ? productos : []
  } catch {
    return []
  }
}

function normalizarProductoFacturaParaCart(producto: any) {
  const precio = Number(producto.precio ?? producto.precio_venta ?? 0)
  const imeiIds = normalizarListaIds(producto.imei_ids || producto.imei_id)
  const serialIds = normalizarListaIds(producto.serial_ids || producto.serial_id)
  const imeis = normalizarListaTextos(producto.imeis || producto.imei)
  const seriales = normalizarListaTextos(producto.seriales || producto.serial)
  return {
    tipo: producto.tipo || (producto.imei_id ? 'imei' : producto.serial_id ? 'serial' : producto.accesorio_id ? 'accesorio' : 'manual'),
    nombre: producto.nombre || producto.descripcion || 'PRODUCTO',
    cantidad: Number(producto.cantidad || imeiIds.length || serialIds.length || 1),
    precio,
    precio_normal: Number(producto.precio_normal || producto.precio_venta || precio),
    costo: Number(producto.costo || 0),
    imei: imeis[0] || producto.imei || '',
    imeis,
    imei_id: imeiIds[0] || producto.imei_id || null,
    imei_ids: imeiIds,
    serial: seriales[0] || producto.serial || '',
    seriales,
    serial_id: serialIds[0] || producto.serial_id || null,
    serial_ids: serialIds,
    color: producto.color || '',
    colores: normalizarListaTextos(producto.colores || producto.color),
    capacidad: producto.capacidad || '',
    capacidades: normalizarListaTextos(producto.capacidades || producto.capacidad),
    accesorio_id: producto.accesorio_id || null,
    stock: Number(producto.stock || 0),
  }
}

function productoInventarioKey(producto: any): string {
  if (producto?.tipo === 'imei' && producto.imei_id) return `imei:${producto.imei_id}`
  if (producto?.tipo === 'serial' && producto.serial_id) return `serial:${producto.serial_id}`
  if (producto?.tipo === 'accesorio' && producto.accesorio_id) return `accesorio:${producto.accesorio_id}`
  return ''
}

function cantidadesAccesorios(productos: any[]) {
  const map = new Map<number, number>()
  for (const producto of productos) {
    if (producto?.tipo === 'accesorio' && producto.accesorio_id) {
      map.set(Number(producto.accesorio_id), (map.get(Number(producto.accesorio_id)) || 0) + Number(producto.cantidad || 1))
    }
  }
  return map
}

async function sincronizarInventarioEdicionFactura(productosOriginales: any[], productosNuevos: any[], invoiceNo: string, fechaStr: string, horaStr: string) {
  productosOriginales = expandirItemsInventario(productosOriginales)
  productosNuevos = expandirItemsInventario(productosNuevos)
  const cliente = clienteSeleccionado.value?.nombre?.toUpperCase() || clienteExpress.value?.toUpperCase() || 'CONSUMIDOR FINAL'
  const originalesKeys = new Set(productosOriginales.map(productoInventarioKey).filter(Boolean))
  const nuevosKeys = new Set(productosNuevos.map(productoInventarioKey).filter(Boolean))

  for (const producto of productosNuevos) {
    const key = productoInventarioKey(producto)
    if (!key || originalesKeys.has(key)) continue
    if (producto.tipo === 'imei' && producto.imei_id) {
      await window.db.update('imei', producto.imei_id, {
        estado: 'VENDIDO',
        comprador: cliente,
        no_factura: invoiceNo,
        precio_vendido: producto.precio,
        fecha_venta: fechaStr,
        hora_venta: horaStr,
      })
    } else if (producto.tipo === 'serial' && producto.serial_id) {
      await window.db.update('serial', producto.serial_id, {
        estado: 'VENDIDO',
        comprador: cliente,
        no_factura: invoiceNo,
        precio_vendido: producto.precio,
        fecha_venta: fechaStr,
        hora_venta: horaStr,
      })
    }
  }

  for (const producto of productosOriginales) {
    const key = productoInventarioKey(producto)
    if (!key || nuevosKeys.has(key)) continue
    if (producto.tipo === 'imei' && producto.imei_id) {
      await window.db.update('imei', producto.imei_id, {
        estado: 'DISPONIBLE',
        comprador: '',
        no_factura: '',
        precio_vendido: 0,
        fecha_venta: '',
        hora_venta: '',
      })
    } else if (producto.tipo === 'serial' && producto.serial_id) {
      await window.db.update('serial', producto.serial_id, {
        estado: 'DISPONIBLE',
        comprador: '',
        no_factura: '',
        precio_vendido: 0,
        fecha_venta: '',
        hora_venta: '',
      })
    }
  }

  const accOriginal = cantidadesAccesorios(productosOriginales)
  const accNuevo = cantidadesAccesorios(productosNuevos)
  const accIds = new Set([...accOriginal.keys(), ...accNuevo.keys()])
  for (const id of accIds) {
    const delta = (accNuevo.get(id) || 0) - (accOriginal.get(id) || 0)
    if (delta === 0) continue
    const acc = accesorios.value.find((a: any) => Number(a.id) === Number(id))
    if (acc) {
      const nuevoStock = Math.max(0, Number(acc.cantidad || 0) - delta)
      await window.db.update('accesorios', id, { cantidad: nuevoStock })
      acc.cantidad = nuevoStock
    }
  }
}

async function imprimirCuentaCobrarFactCoti() {
  const cuenta = cuentaCobrarFactCoti.value
  if (!cuenta) return
  ticketCuentaCobrarRef.value?.printTicket(cuenta, 0, Number(cuenta.abonado || 0), Number(cuenta.saldo || 0))
}

function buildCuentaCobrarPdfHtml(cuenta: any, factura: any, productos: any[], pagos: any[]) {
  const empresa = {
    nombre: empresaNombre.value || 'MI EMPRESA',
    rnc: empresaRnc.value || '',
    telefono: empresaTelefono.value || '',
    direccion: empresaDireccion.value || '',
    email: empresaEmail.value || '',
    logo: empresaLogo.value || '',
  }
  const money = (n: any) => `${systemCurrency.value} ${formatCurrency(Number(n || 0))}`
  const fecha = new Date().toLocaleDateString(systemLocale.value, { year: 'numeric', month: 'long', day: '2-digit' })
  const total = Number(cuenta.total || 0)
  const abonado = Number(cuenta.abonado || 0)
  const saldo = Number(cuenta.saldo || 0)
  const pct = total > 0 ? Math.min(100, Math.max(0, (abonado / total) * 100)) : 0

  const productosHtml = productos.length
    ? productos.map((p: any, i: number) => {
        const cant = Number(p.cantidad || 1)
        const precio = Number(p.precio || p.precio_venta || 0)
        return `<tr>
          <td>${i + 1}</td>
          <td>
            <strong>${p.nombre || p.descripcion || 'Producto'}</strong>
            <div class="muted">${p.imei ? `IMEI: ${p.imei}` : p.serial ? `Serial: ${p.serial}` : p.tipo || ''}</div>
          </td>
          <td class="right">${cant}</td>
          <td class="right">${money(precio)}</td>
          <td class="right"><strong>${money(cant * precio)}</strong></td>
        </tr>`
      }).join('')
    : '<tr><td colspan="5" class="empty">Sin productos registrados</td></tr>'

  const pagosHtml = pagos.length
    ? pagos.map((p: any, i: number) => {
        const monto = Number(p.monto ?? p.cantidad ?? 0)
        return `<tr>
          <td>${i + 1}</td>
          <td>${p.fecha || ''} ${p.hora || ''}</td>
          <td>${p.metodo || 'ABONO'}</td>
          <td>${p.nota || ''}</td>
          <td class="right"><strong>${money(monto)}</strong></td>
        </tr>`
      }).join('')
    : '<tr><td colspan="5" class="empty">Sin abonos registrados</td></tr>'

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <style>
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111827; margin: 0; padding: 34px; background: #f3f4f6; }
    .page { background: #fff; border-radius: 18px; overflow: hidden; box-shadow: 0 18px 45px rgba(15, 23, 42, .12); }
    .header { background: linear-gradient(135deg, #111827, #334155); color: #fff; padding: 28px 34px; display: flex; justify-content: space-between; gap: 24px; }
    .brand { display: flex; gap: 16px; align-items: center; }
    .logo { width: 64px; height: 64px; border-radius: 16px; object-fit: contain; background: #fff; padding: 6px; }
    .title { text-align: right; }
    h1, h2, h3, p { margin: 0; }
    h1 { font-size: 24px; letter-spacing: .04em; }
    .content { padding: 28px 34px 34px; }
    .muted { color: #6b7280; font-size: 12px; margin-top: 3px; }
    .grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 18px; }
    .card { border: 1px solid #e5e7eb; border-radius: 14px; padding: 16px; background: #fafafa; }
    .metric-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin: 18px 0; }
    .metric { border-radius: 16px; padding: 16px; color: #fff; }
    .metric.total { background: #2563eb; }
    .metric.abonado { background: #059669; }
    .metric.saldo { background: #dc2626; }
    .metric span { display: block; font-size: 12px; opacity: .9; }
    .metric strong { display: block; font-size: 22px; margin-top: 6px; }
    .progress { background: #e5e7eb; height: 12px; border-radius: 999px; overflow: hidden; margin: 12px 0 22px; }
    .bar { height: 100%; background: linear-gradient(90deg, #10b981, #22c55e); width: ${pct}%; }
    table { width: 100%; border-collapse: collapse; margin-top: 12px; font-size: 12px; }
    th { background: #f9fafb; color: #374151; text-align: left; padding: 10px; border-bottom: 1px solid #e5e7eb; }
    td { padding: 10px; border-bottom: 1px solid #f1f5f9; vertical-align: top; }
    .right { text-align: right; }
    .section { margin-top: 24px; }
    .section h2 { font-size: 16px; color: #111827; padding-bottom: 8px; border-bottom: 2px solid #e5e7eb; }
    .badge { display: inline-block; padding: 6px 10px; border-radius: 999px; background: ${saldo <= 0 ? '#dcfce7' : '#fef3c7'}; color: ${saldo <= 0 ? '#166534' : '#92400e'}; font-weight: 700; font-size: 12px; }
    .empty { text-align: center; color: #9ca3af; padding: 22px; }
    .footer { margin-top: 28px; color: #6b7280; font-size: 11px; text-align: center; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="brand">
        ${empresa.logo ? `<img class="logo" src="${empresa.logo}" />` : ''}
        <div>
          <h1>${empresa.nombre}</h1>
          <p style="opacity:.85;margin-top:6px">${empresa.rnc ? `RNC: ${empresa.rnc}` : ''}</p>
          <p style="opacity:.85">${[empresa.telefono, empresa.email].filter(Boolean).join(' · ')}</p>
          <p style="opacity:.85">${empresa.direccion}</p>
        </div>
      </div>
      <div class="title">
        <h1>ESTADO DE CUENTA</h1>
        <p style="margin-top:8px">Generado: ${fecha}</p>
        <p style="margin-top:8px"><span class="badge">${cuenta.estado || 'ACTIVA'}</span></p>
      </div>
    </div>

    <div class="content">
      <div class="grid">
        <div class="card">
          <h3>Cliente</h3>
          <p style="font-size:18px;font-weight:700;margin-top:8px">${cuenta.nombre_cliente || 'CONSUMIDOR FINAL'}</p>
          <p class="muted">Telefono: ${cuenta.telefono_cliente || '-'}</p>
          <p class="muted">Codigo cliente: ${cuenta.cod_cliente || '-'}</p>
        </div>
        <div class="card">
          <h3>Factura</h3>
          <p style="font-size:18px;font-weight:700;margin-top:8px">#${cuenta.no_factura || factura?.no_factura || '-'}</p>
          <p class="muted">Fecha venta: ${cuenta.fecha_venta || factura?.fecha_emision || '-'}</p>
          <p class="muted">Vencimiento: ${cuenta.fecha_vencimiento || '-'}</p>
        </div>
      </div>

      <div class="metric-grid">
        <div class="metric total"><span>Total factura</span><strong>${money(total)}</strong></div>
        <div class="metric abonado"><span>Total abonado</span><strong>${money(abonado)}</strong></div>
        <div class="metric saldo"><span>Saldo pendiente</span><strong>${money(saldo)}</strong></div>
      </div>
      <div class="progress"><div class="bar"></div></div>

      <div class="section">
        <h2>Productos facturados</h2>
        <table>
          <thead><tr><th>#</th><th>Producto</th><th class="right">Cant.</th><th class="right">Precio</th><th class="right">Total</th></tr></thead>
          <tbody>${productosHtml}</tbody>
        </table>
      </div>

      <div class="section">
        <h2>Abonos realizados</h2>
        <table>
          <thead><tr><th>#</th><th>Fecha</th><th>Metodo</th><th>Nota</th><th class="right">Monto</th></tr></thead>
          <tbody>${pagosHtml}</tbody>
        </table>
      </div>

      ${cuenta.notas ? `<div class="section"><h2>Notas</h2><p class="muted">${String(cuenta.notas).replace(/\n/g, '<br>')}</p></div>` : ''}
      <div class="footer">Documento generado por TMPOS · ${fecha}</div>
    </div>
  </div>
</body>
</html>`
}

async function generarPdfCuentaCobrarFactCoti() {
  const cuenta = cuentaCobrarFactCoti.value
  if (!cuenta) return
  await recargarConfigVentas()
  const factura = registroFatCotiSeleccionado.value
  const productos = parseProductosFacturaFactCoti(factura)
  const pagos = parsePagosCuentaFactCoti(cuenta)
  const html = buildCuentaCobrarPdfHtml(cuenta, factura, productos, pagos)
  const nombre = `Cuenta_Cobrar_${cuenta.no_factura || cuenta.id}.pdf`
  try {
    const res = await window.electron.invoke('generate:pdf', html, nombre) as { success: boolean; dataUrl?: string; error?: string }
    if (res.success && res.dataUrl) {
      pdfUrl.value = res.dataUrl
      dialogPdf.value = true
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar el PDF', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo generar el PDF', life: 3000 })
  }
}

function abrirEditarPagoFactCoti() {
  if (!registroFatCotiSeleccionado.value) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }
  metodoPagoFactCoti.value = registroFatCotiSeleccionado.value.metodo_pago || 'EFECTIVO'
  dialogEditarPagoFactCoti.value = true
}

function abrirCambiarClienteFactCoti() {
  if (!registroFatCotiSeleccionado.value) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }
  busquedaClienteFactCoti.value = ''
  clienteFactCotiSeleccionado.value = null
  dialogCambiarClienteFactCoti.value = true
}

function abrirProductosFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }

  try {
    const parsed = typeof factura.productos === 'string'
      ? JSON.parse(factura.productos || '[]')
      : factura.productos
    productosFactCoti.value = Array.isArray(parsed) ? parsed : []
  } catch (_) {
    productosFactCoti.value = []
  }

  busquedaProductosFactCoti.value = ''
  dialogProductosFactCoti.value = true
}

async function imprimirFacturaFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }

  await recargarConfigVentas()

  let items: any[] = []
  try {
    const parsed = typeof factura.productos === 'string'
      ? JSON.parse(factura.productos || '[]')
      : factura.productos
    items = Array.isArray(parsed) ? parsed : []
  } catch (_) {
    items = []
  }

  const fecha = `${factura.fecha_emision || factura.created_at || ''}${factura.hora ? ' ' + factura.hora : ''}`.trim()
  const alanubeResponse = getAlanubeResponseFromFactura(factura)
  const alanubeDocumentStampUrl = getAlanubeDocumentStampUrl(alanubeResponse)
  const alanubeSecurityCode = getAlanubeSecurityCode(alanubeResponse)
  const qrUrl = alanubeDocumentStampUrl || `https://tmposrd.com/factura/${factura.no_factura || factura.id}`
  let qrDataUrl = ''
  try {
    qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
  } catch (_) {}

  ticketData.value = {
    no_factura: factura.no_factura || factura.id,
    ncf: factura.ncf || '',
    tipo_factura: factura.tipo_factura || (esRegistroCotizacion(factura) ? 'COTIZACION' : 'FACTURA_VENTA'),
    tipo_comprobante: factura.tipo_comprobante || factura.comprobante || '',
    fecha,
    cliente: (factura.nombre_cliente || 'CONSUMIDOR FINAL').toUpperCase(),
    telefono: factura.telefono_cliente || '',
    items,
    subtotal: Number(factura.subtotal || 0),
    descuento: Number(factura.descuento || 0),
    impuesto: Number(factura.impuesto || 0),
    impuesto_incluido: impuestoIncluido.value,
    total: Number(factura.total || 0),
    nota: factura.nota || '',
    metodo_pago: factura.metodo_pago || '',
    document_stamp_url: alanubeDocumentStampUrl,
    codigo_seguridad: alanubeSecurityCode,
    alanube_id: alanubeResponse?.id || '',
    alanube_status: alanubeResponse?.status || '',
    alanube_legal_status: alanubeResponse?.legalStatus || '',
    alanube_pdf: alanubeResponse?.pdf || '',
    alanube_xml: alanubeResponse?.xml || '',
    otro: factura.otro || '',
    empresa: {
      nombre: empresaNombre.value,
      rnc: empresaRnc.value,
      telefono: empresaTelefono.value,
      direccion: empresaDireccion.value,
      email: empresaEmail.value,
      logo: empresaLogo.value,
    },
    qr: qrDataUrl,
  }

  ticketDesdeFactCoti.value = true
  await asegurarQrFiscalTicket()
  dialogPrintChoice.value = true
}

function recalcularTotalesProductosFactCoti(productos: any[]) {
  const subtotalNuevo = productos.reduce((sum: number, producto: any) => {
    const cantidad = Number(producto.cantidad || 1)
    const precio = Number(producto.precio || producto.precio_venta || 0)
    return sum + (cantidad * precio)
  }, 0)
  const costoTotal = productos.reduce((sum: number, producto: any) => {
    const cantidad = Number(producto.cantidad || 1)
    const costo = Number(producto.costo || 0)
    return sum + (cantidad * costo)
  }, 0)

  return {
    subtotal: subtotalNuevo,
    total: subtotalNuevo,
    costo: costoTotal,
    ganancia: subtotalNuevo - costoTotal,
  }
}

async function guardarProductosFactCoti(productos: any[]) {
  const factura = registroFatCotiSeleccionado.value
  if (!factura?.id) return false
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'cambiar productos o totales')) return false

  guardandoProductosFactCoti.value = true
  try {
    const totales = recalcularTotalesProductosFactCoti(productos)
    const res = await window.db.update('facturas', factura.id, {
      productos: JSON.stringify(productos),
      subtotal: totales.subtotal,
      total: totales.total,
      costo: totales.costo,
      ganancia: totales.ganancia,
    })

    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron guardar los productos', life: 3000 })
      return false
    }

    try {
      const cxcRes = await window.db.getAll('cuentas_cobrar')
      if (cxcRes.success) {
        const cuenta = (cxcRes.data || []).find((c: any) => String(c.no_factura || '') === String(factura.no_factura || ''))
        if (cuenta) {
          const abonado = Number(cuenta.abonado || 0)
          await window.db.update('cuentas_cobrar', cuenta.id, {
            total: totales.total,
            saldo: Math.max(0, totales.total - abonado),
            estado: totales.total - abonado <= 0 ? 'PAGADA' : cuenta.estado || 'ACTIVA',
          })
        }
      }
    } catch (_) {}

    productosFactCoti.value = productos
    registroFatCotiSeleccionado.value = {
      ...factura,
      productos: JSON.stringify(productos),
      subtotal: totales.subtotal,
      total: totales.total,
      ganancia: totales.ganancia,
    }
    await cargarRegistrosFatCoti()
    registroFatCotiSeleccionado.value = registrosFatCoti.value.find((f: any) => f.id === factura.id) || registroFatCotiSeleccionado.value
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Productos de la factura actualizados', life: 2500 })
    return true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron guardar los productos', life: 3000 })
    return false
  } finally {
    guardandoProductosFactCoti.value = false
  }
}

async function eliminarProductoFactCoti(producto: any) {
  if (!confirm(`Eliminar "${producto?.nombre || 'producto'}" de esta factura?`)) return
  const productos = [...productosFactCoti.value]
  const index = productos.findIndex((item: any) => item === producto || JSON.stringify(item) === JSON.stringify(producto))
  if (index < 0) return
  productos.splice(index, 1)
  await guardarProductosFactCoti(productos)
}

function abrirAgregarProductoFactCoti() {
  modoAgregarProductoFactCoti.value = 'manual'
  nuevoProductoFactCoti.value = { nombre: '', cantidad: 1, precio: 0, costo: 0 }
  busquedaProductoDbFactCoti.value = ''
  productoDbFactCotiSeleccionado.value = null
  dialogAgregarProductoFactCoti.value = true
}

async function agregarProductoFactCoti() {
  if (modoAgregarProductoFactCoti.value === 'db') {
    const item = productoDbFactCotiSeleccionado.value
    if (!item) {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un producto de la DB', life: 2500 })
      return
    }

    const cantidad = item.origen === 'accesorio'
      ? Math.max(1, Number(nuevoProductoFactCoti.value.cantidad || 1))
      : 1

    if (item.origen === 'accesorio' && cantidad > Number(item.cantidadDisponible || 0)) {
      toast.add({ severity: 'warn', summary: 'Stock insuficiente', detail: `Disponible: ${item.cantidadDisponible}`, life: 2500 })
      return
    }

    const raw = item.raw || {}
    const producto = {
      tipo: item.origen,
      nombre: String(item.nombre || '').toUpperCase(),
      cantidad,
      precio: Number(item.precio || 0),
      precio_normal: Number(item.precio || 0),
      costo: Number(item.costo || 0),
      imei: item.origen === 'imei' ? raw.nombre || '' : '',
      imei_id: item.origen === 'imei' ? raw.id : null,
      serial: item.origen === 'serial' ? raw.nombre || '' : '',
      serial_id: item.origen === 'serial' ? raw.id : null,
      color: raw.color || '',
      capacidad: raw.capacidad || '',
      accesorio_id: item.origen === 'accesorio' ? raw.id : null,
      stock: item.origen === 'accesorio' ? raw.cantidad || 0 : 1,
    }

    const ok = await guardarProductosFactCoti([...productosFactCoti.value, producto])
    if (ok) dialogAgregarProductoFactCoti.value = false
    return
  }

  const nombre = nuevoProductoFactCoti.value.nombre.trim()
  const cantidad = Number(nuevoProductoFactCoti.value.cantidad || 1)
  const precio = Number(nuevoProductoFactCoti.value.precio || 0)
  if (!nombre || cantidad <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Nombre y cantidad son requeridos', life: 2500 })
    return
  }

  const producto = {
    tipo: 'manual',
    nombre: nombre.toUpperCase(),
    cantidad,
    precio,
    precio_normal: precio,
    costo: Number(nuevoProductoFactCoti.value.costo || 0),
  }

  const ok = await guardarProductosFactCoti([...productosFactCoti.value, producto])
  if (ok) dialogAgregarProductoFactCoti.value = false
}

async function editarFacturaFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura?.id) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un registro primero', life: 2500 })
    return
  }
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'editar')) return

  const productos = parseProductosFacturaFactCoti(factura).map(normalizarProductoFacturaParaCart)
  if (productos.length === 0) {
    toast.add({ severity: 'warn', summary: 'Sin productos', detail: 'Esta factura no tiene productos para cargar', life: 2500 })
  }

  facturaEditandoPos.value = factura
  productosOriginalesEditandoPos.value = JSON.parse(JSON.stringify(productos))
  cart.value = productos
  noFactura.value = factura.no_factura || ''
  metodoPago.value = factura.metodo_pago || 'EFECTIVO'
  esCotizacion.value = esRegistroCotizacion(factura)
  nota.value = factura.nota || ''
  descuentoTipo.value = 'fijo'
  descuentoValor.value = Number(factura.descuento || 0)
  descuentoFijo.value = Number(factura.descuento || 0)
  descuentoPorc.value = 0

  const cliente = clientes.value.find((c: any) =>
    String(c.id || '') === String(factura.cod_cliente || '') ||
    String(c.nombre || '').toUpperCase() === String(factura.nombre_cliente || '').toUpperCase()
  )
  clienteSeleccionado.value = cliente || null
  clienteExpress.value = cliente ? '' : (factura.nombre_cliente || '')

  dialogFatCoti.value = false
  activeTab.value = systemMode.isGeneralStore ? 'accesorios' : 'celulares'
  guardarEstado()
  toast.add({ severity: 'info', summary: 'Modo edicion', detail: `Factura ${factura.no_factura || factura.id} cargada en el POS`, life: 3500 })
}

async function cobrarFacturaPendiente() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura?.id || !esFacturaPendiente(factura)) return
  if (!auth.isCajero && !auth.isAdmin && !auth.isGerente) {
    toast.add({ severity: 'warn', summary: 'Acceso restringido', detail: 'Solo Caja puede cobrar una factura pendiente', life: 3000 })
    return
  }
  const turnoRes = await window.electron.invoke('caja:getTurnoActivo', almacenActivoStore.activeUid || '') as any
  if (!turnoRes?.success || !turnoRes.data?.id) {
    toast.add({ severity: 'warn', summary: 'Caja cerrada', detail: 'Abre un turno de caja antes de cobrar la factura', life: 3500 })
    return
  }
  await editarFacturaFactCoti()
  metodoPago.value = 'EFECTIVO'
  montoRecibido.value = Number(factura.total || 0)
  confirmPago.value = true
}

async function guardarClienteFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  const cliente = clienteFactCotiSeleccionado.value
  if (!factura || !cliente) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un cliente', life: 2500 })
    return
  }
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'cambiar el cliente')) return

  guardandoClienteFactCoti.value = true
  try {
    const dataFactura = {
      cod_cliente: String(cliente.id || ''),
      nombre_cliente: String(cliente.nombre || 'CONSUMIDOR FINAL').toUpperCase(),
      telefono_cliente: cliente.telefono || cliente.whatsapp || '',
    }

    const res = await window.db.update('facturas', factura.id, dataFactura)
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo cambiar el cliente', life: 3000 })
      return
    }

    try {
      const cxcRes = await window.db.getAll('cuentas_cobrar')
      if (cxcRes.success) {
        const cuenta = (cxcRes.data || []).find((c: any) => String(c.no_factura || '') === String(factura.no_factura || ''))
        if (cuenta) {
          await window.db.update('cuentas_cobrar', cuenta.id, {
            cod_cliente: dataFactura.cod_cliente,
            nombre_cliente: dataFactura.nombre_cliente,
            telefono_cliente: dataFactura.telefono_cliente,
          })
        }
      }
    } catch (_) {}

    toast.add({ severity: 'success', summary: 'Actualizado', detail: 'Cliente cambiado correctamente', life: 2500 })
    dialogCambiarClienteFactCoti.value = false
    await cargarRegistrosFatCoti()
    registroFatCotiSeleccionado.value = registrosFatCoti.value.find((f: any) => f.id === factura.id) || null
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cambiar el cliente', life: 3000 })
  } finally {
    guardandoClienteFactCoti.value = false
  }
}

function montosPorMetodoFactCoti(metodo: string, total: number) {
  return {
    efectivo: metodo === 'EFECTIVO' ? total : 0,
    tarjeta: metodo === 'TARJETA' ? total : 0,
    transferencia: metodo === 'TRANSFERENCIA' ? total : 0,
    cheque: metodo === 'CHEQUE' ? total : 0,
  }
}

async function cargarBancosFactCoti() {
  cargandoBancosFactCoti.value = true
  try {
    await asegurarTablaBancosFactCoti()
    const res = await window.db.getAll('bancos')
    bancosFactCoti.value = res.success ? (res.data || []) : []
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar los bancos', life: 3000 })
    }
  } catch (error: any) {
    bancosFactCoti.value = []
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los bancos', life: 3000 })
  } finally {
    cargandoBancosFactCoti.value = false
  }
}

async function cargarBancosPos() {
  cargandoBancosPos.value = true
  try {
    await asegurarTablaBancosFactCoti()
    const res = await window.db.getAll('bancos')
    bancosPos.value = res.success ? (res.data || []) : []
  } catch {
    bancosPos.value = []
  } finally {
    cargandoBancosPos.value = false
  }
}

async function crearCuentaCobrarDesdeFactCoti(factura: any): Promise<boolean> {
  try {
    const totalFactura = Number(factura.total || 0)
    const noFactura = factura.no_factura || ''
    const data = {
      no_factura: noFactura,
      cod_cliente: factura.cod_cliente || '',
      nombre_cliente: factura.nombre_cliente || 'CONSUMIDOR FINAL',
      telefono_cliente: factura.telefono_cliente || '',
      total: totalFactura,
      abonado: 0,
      saldo: totalFactura,
      fecha_venta: factura.fecha_emision || new Date().toISOString().split('T')[0],
      estado: 'ACTIVA',
      notas: `GENERADA DESDE FACT-COTI`,
      almacen_id: factura.almacen_id || 0,
      almacen_uid: factura.almacen_uid || '',
    }

    const existentesRes = await window.db.getAll('cuentas_cobrar')
    if (existentesRes.success) {
      const existente = (existentesRes.data || []).find((c: any) => String(c.no_factura || '') === String(noFactura))
      if (existente) {
        const updateRes = await window.db.update('cuentas_cobrar', existente.id, data)
        if (!updateRes.success) {
          toast.add({ severity: 'error', summary: 'Error', detail: updateRes.error || 'No se pudo actualizar la cuenta por cobrar', life: 3000 })
          return false
        }
        return true
      }
    }

    const insertRes = await window.db.insert('cuentas_cobrar', data)
    if (!insertRes.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: insertRes.error || 'No se pudo crear la cuenta por cobrar', life: 3000 })
      return false
    }
    return true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo crear la cuenta por cobrar', life: 3000 })
    return false
  }
}

async function asegurarTablaBancosFactCoti() {
  const execSql = async (sql: string) => {
    try {
      await (window as any).electron.invoke('db:exec', sql)
    } catch (_) {
      try { await (window as any).electron.invoke('consultaservidor', 'executeSQL', sql) } catch {}
    }
  }

  await execSql(`CREATE TABLE IF NOT EXISTS bancos (id INTEGER PRIMARY KEY AUTOINCREMENT, nombre TEXT NOT NULL, numero_cuenta TEXT DEFAULT '', moneda TEXT DEFAULT 'PESOS', saldo REAL DEFAULT 0, fecha_transaccion TEXT DEFAULT '', uid TEXT DEFAULT '', created_at TEXT DEFAULT '', updated_at TEXT DEFAULT '')`)
  await execSql(`ALTER TABLE bancos ADD COLUMN uid TEXT DEFAULT ''`)
  await execSql(`ALTER TABLE bancos ADD COLUMN created_at TEXT DEFAULT ''`)
  await execSql(`ALTER TABLE bancos ADD COLUMN updated_at TEXT DEFAULT ''`)
  await execSql(`ALTER TABLE bancos ADD COLUMN fecha_transaccion TEXT DEFAULT ''`)
  await execSql(`UPDATE bancos SET uid = lower(hex(randomblob(16))) WHERE uid IS NULL OR uid = ''`)
}

async function guardarMetodoPagoFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura || !metodoPagoFactCoti.value) return
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'cambiar el metodo de pago')) return

  if (metodoPagoFactCoti.value === 'TRANSFERENCIA') {
    bancoFactCotiSeleccionado.value = null
    dialogEditarPagoFactCoti.value = false
    dialogBancoFactCoti.value = true
    await cargarBancosFactCoti()
    return
  }

  guardandoPagoFactCoti.value = true
  try {
    const totalFactura = Number(factura.total || 0)
    const res = await window.db.update('facturas', factura.id, {
      metodo_pago: metodoPagoFactCoti.value,
      estado_factura: metodoPagoFactCoti.value === 'CREDITO' ? 'CREDITO' : factura.estado_factura,
      ...montosPorMetodoFactCoti(metodoPagoFactCoti.value, totalFactura),
    })

    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar el metodo de pago', life: 3000 })
      return
    }

    if (metodoPagoFactCoti.value === 'CREDITO') {
      const cxcRes = await crearCuentaCobrarDesdeFactCoti(factura)
      if (!cxcRes) return
    }

    factura.metodo_pago = metodoPagoFactCoti.value
    toast.add({
      severity: 'success',
      summary: 'Actualizado',
      detail: metodoPagoFactCoti.value === 'CREDITO'
        ? 'Metodo actualizado y cuenta por cobrar creada'
        : 'Metodo de pago actualizado',
      life: 2500,
    })
    dialogEditarPagoFactCoti.value = false
    await cargarRegistrosFatCoti()
    registroFatCotiSeleccionado.value = registrosFatCoti.value.find((f: any) => f.id === factura.id) || null
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo actualizar el metodo de pago', life: 3000 })
  } finally {
    guardandoPagoFactCoti.value = false
  }
}

async function guardarTransferenciaFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  const banco = bancoFactCotiSeleccionado.value
  if (!factura || !banco) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un banco', life: 2500 })
    return
  }
  if (await bloquearSiFacturaElectronicaAceptada(factura, 'cambiar el metodo de pago')) return

  guardandoBancoFactCoti.value = true
  try {
    await asegurarTablaBancosFactCoti()
    const totalFactura = Number(factura.total || 0)
    const saldoAnterior = Number(banco.saldo || 0)
    const saldoNuevo = saldoAnterior + totalFactura
    const now = new Date().toISOString()

    const bancoRes = await window.db.update('bancos', banco.id, {
      saldo: saldoNuevo,
      fecha_transaccion: now,
      updated_at: now,
    })

    if (!bancoRes.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: bancoRes.error || 'No se pudo actualizar el banco', life: 3000 })
      return
    }

    const financieraActual = (() => {
      try {
        return factura.financiera ? JSON.parse(factura.financiera) : {}
      } catch {
        return {}
      }
    })()

    const facturaRes = await window.db.update('facturas', factura.id, {
      metodo_pago: 'TRANSFERENCIA',
      ...montosPorMetodoFactCoti('TRANSFERENCIA', totalFactura),
      financiera: JSON.stringify({
        ...financieraActual,
        banco_transferencia: {
          banco_id: banco.id,
          nombre: banco.nombre,
          numero_cuenta: banco.numero_cuenta || '',
          saldo_anterior: saldoAnterior,
          saldo_actual: saldoNuevo,
          monto: totalFactura,
          fecha: now,
        },
      }),
    })

    if (!facturaRes.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: facturaRes.error || 'No se pudo actualizar el metodo de pago', life: 3000 })
      return
    }

    toast.add({ severity: 'success', summary: 'Actualizado', detail: `Transferencia aplicada a ${banco.nombre}`, life: 3000 })
    dialogBancoFactCoti.value = false
    await cargarRegistrosFatCoti()
    registroFatCotiSeleccionado.value = registrosFatCoti.value.find((f: any) => f.id === factura.id) || null
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo aplicar la transferencia', life: 3000 })
  } finally {
    guardandoBancoFactCoti.value = false
  }
}

async function solicitarOtpEliminarFactCoti() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura) return

  factCotiOtpError.value = ''
  factCotiOtp.value = ''
  factCotiOtpLoading.value = true

  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: factura.id,
      facturaIds: [factura.id],
      no_factura: factura.no_factura || '',
      nombre_cliente: factura.nombre_cliente || '',
      cantidad: 1,
      total: Number(factura.total || 0),
    }) as any

    if (res.success) {
    factCotiOtpEmail.value = res.data?.networkUrl || ''
      factCotiOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      factCotiOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (error: any) {
    factCotiOtpError.value = error?.message || 'Error solicitando codigo'
  } finally {
    factCotiOtpLoading.value = false
  }
}

async function eliminarFactCotiSeleccionada() {
  const factura = registroFatCotiSeleccionado.value
  if (!factura) return

  const codigo = String(factCotiOtp.value || '').replace(/\D/g, '')
  if (!/^\d{4}$/.test(codigo)) {
    factCotiOtpError.value = 'Introduce el codigo de 4 digitos'
    return
  }

  factCotiOtpConfirmando.value = true
  factCotiOtpError.value = ''

  try {
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: factura.id,
      facturaIds: [factura.id],
      codigo,
    }) as any

    if (!otpRes.success) {
      factCotiOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    const tipo = tipoRegistroFactCoti(factura)
    let res = await window.db.delete('facturas', factura.id)
    if (!res.success) {
      factCotiOtpError.value = res.error || `No se pudo eliminar ${factura.no_factura || factura.id}`
      return
    }

    // Verificar la eliminacion porque algunos adaptadores pueden responder success
    // aunque ninguna fila haya sido afectada. Se reintenta una vez de forma segura.
    let verificacion = await window.db.getById('facturas', factura.id)
    if (verificacion.success && verificacion.data) {
      res = await window.db.delete('facturas', factura.id)
      verificacion = await window.db.getById('facturas', factura.id)
    }
    if (!res.success || !verificacion.success || verificacion.data) {
      factCotiOtpError.value = res.error || verificacion.error || `La ${tipo} no se pudo eliminar de la base de datos`
      return
    }

    // La restauracion del inventario no debe impedir que una factura ya autorizada
    // por OTP sea eliminada. Si falla, se registra y se avisa para revision.
    let inventarioRestaurado = true
    if (tipo === 'factura') {
      try {
        await reintegrarInventarioFactura(factura.productos)
      } catch (error: any) {
        inventarioRestaurado = false
        await registrarAuditoriaFactura('error_reintegrar_inventario_factura_eliminada', factura, {
          error: error?.message || 'No se pudo restaurar el inventario',
        }, 'ERROR')
      }
    }
    await registrarAuditoriaFactura(`eliminar_${tipo}`, factura, { inventario_restaurado: inventarioRestaurado }, 'OK')

    toast.add({
      severity: inventarioRestaurado ? 'success' : 'warn',
      summary: 'Eliminado',
      detail: inventarioRestaurado
        ? `${tipo === 'cotizacion' ? 'Cotizacion' : 'Factura'} ${factura.no_factura || factura.id} eliminada`
        : `Factura ${factura.no_factura || factura.id} eliminada, pero revisa la restauracion del inventario`,
      life: inventarioRestaurado ? 3000 : 5000,
    })
    dialogEliminarFactCoti.value = false
    registroFatCotiSeleccionado.value = null
    registrosFatCoti.value = registrosFatCoti.value.filter((registro: any) => Number(registro.id) !== Number(factura.id))
    await cargarRegistrosFatCoti()
  } catch (error: any) {
    factCotiOtpError.value = error?.message || 'Error al eliminar'
  } finally {
    factCotiOtpConfirmando.value = false
  }
}

watch([tipoFatCoti, limiteFatCoti, busquedaFatCoti], () => {
  registroFatCotiSeleccionado.value = null
})

watch(busquedaProd, (value) => {
  if (busquedaProdTimer) clearTimeout(busquedaProdTimer)
  busquedaProdTimer = setTimeout(() => {
    busquedaProdFiltrada.value = String(value || '')
  }, 120)
})

watch(productoDbFactCotiSeleccionado, () => {
  nuevoProductoFactCoti.value.cantidad = 1
})

async function cargarProductos() {
  try {
    const [resTel, resAcc, resElec, resCli, resMar, resCat] = await Promise.all([
      window.db.getAll('telefonos'),
      window.db.getAll('accesorios'),
      window.db.getAll('electrodomesticos'),
      window.db.getAll('clientes'),
      window.db.getAll('marcas'),
      window.db.getAll('categorias'),
    ])

    if (resTel.success) telefonos.value = filterByAlmacen(resTel.data || [])
    if (resAcc.success) accesorios.value = filterByAlmacen(resAcc.data || [])
    if (resElec.success) electrodomesticos.value = filterByAlmacen(resElec.data || [])
    if (resCli.success) clientes.value = resCli.data || []
    if (resMar.success) marcas.value = resMar.data || []
    if (resCat.success) categorias.value = resCat.data || []

    const marcasMap = new Map(marcas.value.map(m => [m.id, m.nombre]))
    const catsMap = new Map(categorias.value.map(c => [c.id, c.nombre]))

    accesorios.value = accesorios.value.filter(a => (a.cantidad || 0) > 0)
    accesorios.value = accesorios.value.map(a => ({
      ...a,
      marca_nombre: marcasMap.get(a.marca) || '',
      categoria_nombre: catsMap.get(a.categoria) || '',
    }))
  } catch (error) {
    console.error(error)
  }
}

async function cargarImeisDisponibles() {
  try {
    const [resImei, resSerial] = await Promise.all([
      window.db.getAll('imei'),
      window.db.getAll('serial'),
    ])
    if (resImei.success) {
      imeisDisponibles.value = filterByAlmacen(resImei.data || []).filter((i: any) => i.estado === 'DISPONIBLE')
    }
    if (resSerial.success) {
      serialesDisponibles.value = filterByAlmacen(resSerial.data || []).filter((i: any) => i.estado === 'DISPONIBLE')
    }
  } catch (error) {
    console.error(error)
  }
}

function abrirVariantes(telefono: any) {
  selectedTelefono.value = telefono
  selectedElectrodomestico.value = null
  variantesImei.value = imeisDisponibles.value.filter((i: any) => imeiPerteneceTelefono(i, telefono))
  variantesSerial.value = []
  busquedaImei.value = ''
  dialogVariantes.value = true
}

function abrirVariantesSerial(electrodomestico: any) {
  selectedElectrodomestico.value = electrodomestico
  selectedTelefono.value = null
  variantesSerial.value = serialesDisponibles.value.filter((i: any) => serialPerteneceEquipo(i, electrodomestico))
  variantesImei.value = []
  busquedaImei.value = ''
  dialogVariantes.value = true
}

const imeiSearch = ref('')
const elecSearch = ref('')

function imeisDelTel(telefonoId: number) {
  const texto = imeiSearch.value.toLowerCase().trim()
  const telefono = telefonos.value.find((item: any) => Number(item.id) === Number(telefonoId))
  let list = imeisDisponibles.value.filter((i: any) => imeiPerteneceTelefono(i, telefono))
  if (texto) {
    list = list.filter((i: any) =>
      i.nombre?.toLowerCase().includes(texto) ||
      i.color?.toLowerCase().includes(texto) ||
      i.capacidad?.toLowerCase().includes(texto)
    )
  }
  return list
}

function serialesDelElec(electrodomesticoId: number) {
  const texto = elecSearch.value.toLowerCase().trim()
  const equipo = electrodomesticos.value.find((item: any) => Number(item.id) === Number(electrodomesticoId))
  let list = serialesDisponibles.value.filter((i: any) => serialPerteneceEquipo(i, equipo))
  if (texto) {
    list = list.filter((i: any) =>
      i.nombre?.toLowerCase().includes(texto) ||
      i.color?.toLowerCase().includes(texto) ||
      i.capacidad?.toLowerCase().includes(texto)
    )
  }
  return list
}

function seleccionarImeiDirecto(imei: any) {
  if (imeiEstaEnCarrito(imei)) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Este IMEI ya esta en el carrito', life: 2000 })
    return
  }
  const telefono = telefonoDeImei(imei)
  if (!telefono) return
  imeiParaPrecio.value = imei
  selectedTelefono.value = telefono
  selectedElectrodomestico.value = null
  precioSeleccionado.value = 'venta'
  precioManual.value = imei.precio_venta || 0
  dialogPrecio.value = true
}

function seleccionarSerialDirecto(serial: any) {
  if (serialEstaEnCarrito(serial)) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Este Serial ya esta en el carrito', life: 2000 })
    return
  }
  const elec = equipoDeSerial(serial)
  if (!elec) return
  imeiParaPrecio.value = serial
  selectedElectrodomestico.value = elec
  selectedTelefono.value = null
  precioSeleccionado.value = 'venta'
  precioManual.value = serial.precio_venta || 0
  dialogPrecio.value = true
}

function abrirPrecio(imei: any) {
  if (selectedTelefono.value && imeiEstaEnCarrito(imei)) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Este IMEI ya esta en el carrito', life: 2000 })
    return
  }
  if (selectedElectrodomestico.value && serialEstaEnCarrito(imei)) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Este Serial ya esta en el carrito', life: 2000 })
    return
  }
  imeiParaPrecio.value = imei
  precioSeleccionado.value = 'venta'
  precioManual.value = imei.precio_venta || 0
  dialogVariantes.value = false
  dialogPrecio.value = true
}

const variantesFiltradasSerial = computed(() => {
  const texto = busquedaImei.value.toLowerCase().trim()
  if (!texto) return variantesSerial.value
  return variantesSerial.value.filter(i =>
    i.nombre?.toLowerCase().includes(texto) ||
    i.color?.toLowerCase().includes(texto) ||
    i.capacidad?.toLowerCase().includes(texto)
  )
})

function getPrecioActual(): number {
  switch (precioSeleccionado.value) {
    case 'venta': return imeiParaPrecio.value?.precio_venta || 0
    case 'min': return imeiParaPrecio.value?.precio_min || 0
    case 'xmayor': return imeiParaPrecio.value?.precio_xmayor || 0
    case 'manual': return precioManual.value
    default: return 0
  }
}

function getPrecioNormal(item: any): number {
  return Number(item?.precio_normal || item?.precio_venta || 0)
}

function itemTieneDescuento(item: any): boolean {
  const precioNormal = getPrecioNormal(item)
  const precioActual = Number(item?.precio || 0)
  return precioNormal > 0 && precioActual >= 0 && precioActual < precioNormal
}

function normalizarListaIds(value: any): number[] {
  const lista = Array.isArray(value) ? value : (value ? [value] : [])
  return lista
    .map((id: any) => Number(id))
    .filter((id: number) => Number.isFinite(id) && id > 0)
}

function normalizarListaTextos(value: any): string[] {
  const lista = Array.isArray(value) ? value : (value ? String(value).split(',') : [])
  return lista
    .map((texto: any) => String(texto || '').trim())
    .filter(Boolean)
}

function getCapacidadImei(imei: any): string {
  return String(imei?.capacidad || imei?.almacenamiento || imei?.memoria || imei?.storage || '').trim()
}

function itemTieneImei(item: any, imeiId: any): boolean {
  const id = Number(imeiId)
  if (!id) return false
  return Number(item?.imei_id || 0) === id || normalizarListaIds(item?.imei_ids).includes(id)
}

function itemTieneSerial(item: any, serialId: any): boolean {
  const id = Number(serialId)
  if (!id) return false
  return Number(item?.serial_id || 0) === id || normalizarListaIds(item?.serial_ids).includes(id)
}

function imeiEstaEnCarrito(imei: any): boolean {
  return cart.value.some((item: any) => item?.tipo === 'imei' && itemTieneImei(item, imei?.id))
}

function serialEstaEnCarrito(serial: any): boolean {
  return cart.value.some((item: any) => item?.tipo === 'serial' && itemTieneSerial(item, serial?.id))
}

function varianteRowClass(data: any) {
  const enCarrito = selectedTelefono.value ? imeiEstaEnCarrito(data) : serialEstaEnCarrito(data)
  return enCarrito ? 'opacity-60 cursor-not-allowed' : ''
}

function agregarValorUnico(lista: any[], valor: any) {
  const normalizado = typeof valor === 'number' ? valor : String(valor || '').trim()
  if (normalizado && !lista.some((item: any) => String(item) === String(normalizado))) lista.push(normalizado)
}

function sincronizarResumenLineaAgrupada(item: any) {
  const imeiIds = normalizarListaIds(item.imei_ids || item.imei_id)
  const serialIds = normalizarListaIds(item.serial_ids || item.serial_id)
  const imeis = normalizarListaTextos(item.imeis || item.imei)
  const seriales = normalizarListaTextos(item.seriales || item.serial)
  const colores = normalizarListaTextos(item.colores || item.color)
  const capacidades = normalizarListaTextos(item.capacidades || item.capacidad)
  item.cantidad = Math.max(1, Number(item.cantidad || 1))
  item.imei_id = imeiIds[0] || null
  item.imei_ids = imeiIds
  item.imei = imeis[0] || ''
  item.imeis = imeis
  item.serial_id = serialIds[0] || null
  item.serial_ids = serialIds
  item.serial = seriales[0] || ''
  item.seriales = seriales
  item.color = colores.length > 1 ? 'Varios' : (colores[0] || '')
  item.colores = colores
  item.capacidad = capacidades.length > 1 ? 'Varios' : (capacidades[0] || '')
  item.capacidades = capacidades
}

function buscarLineaAgrupable(tipo: 'imei' | 'serial', refId: any, precio: number, capacidad = '') {
  return cart.value.find((item: any) => {
    if (item.tipo !== tipo || Number(item.precio || 0) !== Number(precio || 0)) return false
    if (tipo === 'imei') {
      const mismaCapacidad = String(item.capacidad || '').trim().toUpperCase() === String(capacidad || '').trim().toUpperCase()
      return String(item.telefono_id || '') === String(refId || '') && mismaCapacidad
    }
    return String(item.electrodomestico_id || '') === String(refId || '')
  })
}

function expandirItemsInventario(productos: any[]) {
  const expandidos: any[] = []
  for (const producto of productos || []) {
    if (producto?.tipo === 'imei') {
      const ids = normalizarListaIds(producto.imei_ids || producto.imei_id)
      const imeis = normalizarListaTextos(producto.imeis || producto.imei)
      if (ids.length > 1) {
        ids.forEach((id: number, index: number) => {
          expandidos.push({
            ...producto,
            cantidad: 1,
            imei_id: id,
            imei: imeis[index] || imeis[0] || producto.imei || '',
            imei_ids: [id],
            imeis: imeis[index] ? [imeis[index]] : [],
          })
        })
        continue
      }
    }
    if (producto?.tipo === 'serial') {
      const ids = normalizarListaIds(producto.serial_ids || producto.serial_id)
      const seriales = normalizarListaTextos(producto.seriales || producto.serial)
      if (ids.length > 1) {
        ids.forEach((id: number, index: number) => {
          expandidos.push({
            ...producto,
            cantidad: 1,
            serial_id: id,
            serial: seriales[index] || seriales[0] || producto.serial || '',
            serial_ids: [id],
            seriales: seriales[index] ? [seriales[index]] : [],
          })
        })
        continue
      }
    }
    expandidos.push(producto)
  }
  return expandidos
}

function getImeisDetalleItem(item: any) {
  const ids = normalizarListaIds(item?.imei_ids || item?.imei_id)
  const imeis = normalizarListaTextos(item?.imeis || item?.imei)
  const colores = normalizarListaTextos(item?.colores || item?.color)
  const capacidades = normalizarListaTextos(item?.capacidades || item?.capacidad)
  const total = Math.max(ids.length, imeis.length, Number(item?.cantidad || 1))
  return Array.from({ length: total }, (_, index) => ({
    id: ids[index] || null,
    imei: imeis[index] || '',
    color: colores[index] || '',
    capacidad: capacidades[index] || '',
  }))
}

function getImeisGestionFiltrados(item: any) {
  const texto = busquedaGestionImeis.value.toLowerCase().trim()
  return getImeisDetalleItem(item)
    .map((detalle: any, pos: number) => ({ ...detalle, pos }))
    .filter((detalle: any) => {
      if (!texto) return true
      return String(detalle.imei || '').toLowerCase().includes(texto) ||
        String(detalle.color || '').toLowerCase().includes(texto) ||
        String(detalle.capacidad || '').toLowerCase().includes(texto)
    })
}

function abrirGestionImeis(item: any, index: number) {
  if (item?.tipo !== 'imei' || Number(item?.cantidad || 1) <= 1) return
  itemGestionImeis.value = item
  indexGestionImeis.value = index
  busquedaGestionImeis.value = ''
  dialogGestionImeis.value = true
}

function prepararCambioImeiAgrupado(posicion: number) {
  const item = itemGestionImeis.value
  const idx = indexGestionImeis.value
  if (!item || idx === null) return
  const idsActuales = new Set(normalizarListaIds(item.imei_ids || item.imei_id))
  const idsEnCarrito = new Set<number>()
  cart.value.forEach((cartItem: any, cartIndex: number) => {
    if (cartIndex === idx || cartItem?.tipo !== 'imei') return
    normalizarListaIds(cartItem.imei_ids || cartItem.imei_id).forEach((id: number) => idsEnCarrito.add(id))
  })
  const detalle = getImeisDetalleItem(item)[posicion]
  const telefono = telefonos.value.find((t: any) => String(t.id) === String(item.telefono_id || ''))
  imeisDisponiblesParaCambio.value = imeisDisponibles.value.filter((i: any) => {
    if (!imeiPerteneceTelefono(i, telefono)) return false
    if (idsEnCarrito.has(Number(i.id))) return false
    return !idsActuales.has(Number(i.id)) || Number(i.id) === Number(detalle?.id || 0)
  })
  itemCambiarImei.value = { ...item, _index: idx, _imeiPos: posicion, imei: detalle?.imei || '' }
  busquedaCambiarImei.value = ''
  dialogCambiarImei.value = true
}

function quitarImeiAgrupado(posicion: number) {
  const idx = indexGestionImeis.value
  if (idx === null || !cart.value[idx]) return
  const item = cart.value[idx]
  const imeiIds = normalizarListaIds(item.imei_ids || item.imei_id)
  const imeis = normalizarListaTextos(item.imeis || item.imei)
  const colores = normalizarListaTextos(item.colores || item.color)
  const capacidades = normalizarListaTextos(item.capacidades || item.capacidad)
  imeiIds.splice(posicion, 1)
  imeis.splice(posicion, 1)
  colores.splice(posicion, 1)
  capacidades.splice(posicion, 1)
  if (imeiIds.length === 0 && imeis.length === 0) {
    cart.value.splice(idx, 1)
    dialogGestionImeis.value = false
    itemGestionImeis.value = null
    indexGestionImeis.value = null
    toast.add({ severity: 'info', summary: 'Producto eliminado', detail: 'Se quitaron todos los IMEI de la linea', life: 2000 })
    return
  }
  item.imei_ids = imeiIds
  item.imeis = imeis
  item.cantidad = Math.max(1, imeiIds.length || imeis.length)
  item.colores = colores
  item.capacidades = capacidades
  sincronizarResumenLineaAgrupada(item)
  itemGestionImeis.value = item
  if (Number(item.cantidad || 1) <= 1) {
    dialogGestionImeis.value = false
    itemGestionImeis.value = null
    indexGestionImeis.value = null
  }
  toast.add({ severity: 'info', summary: 'IMEI quitado', detail: 'Se quito una unidad de la linea', life: 2000 })
}

function agregarImeiAlCarrito() {
  const imei = imeiParaPrecio.value
  if (!imei) return

  if (selectedTelefono.value) {
    const yaExiste = cart.value.find((item: any) => item.tipo === 'imei' && itemTieneImei(item, imei.id))
    if (yaExiste) {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Este IMEI ya esta en el carrito', life: 2000 })
      return
    }
  } else if (selectedElectrodomestico.value) {
    const yaExiste = cart.value.find((item: any) => item.tipo === 'serial' && itemTieneSerial(item, imei.id))
    if (yaExiste) {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Este Serial ya esta en el carrito', life: 2000 })
      return
    }
  }

  const precioFinal = getPrecioActual()
  if (precioFinal <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El precio debe ser mayor a 0', life: 2000 })
    return
  }

  if (selectedTelefono.value) {
    const agrupado = buscarLineaAgrupable('imei', selectedTelefono.value?.id, precioFinal, imei.capacidad || '')
    if (agrupado) {
      const imeiIds = normalizarListaIds(agrupado.imei_ids || agrupado.imei_id)
      const imeis = normalizarListaTextos(agrupado.imeis || agrupado.imei)
      const colores = normalizarListaTextos(agrupado.colores || agrupado.color)
      const capacidades = normalizarListaTextos(agrupado.capacidades || agrupado.capacidad)
      agregarValorUnico(imeiIds, Number(imei.id))
      agregarValorUnico(imeis, imei.nombre)
      agregarValorUnico(colores, imei.color)
      agregarValorUnico(capacidades, imei.capacidad)
      agrupado.imei_ids = imeiIds
      agrupado.imeis = imeis
      agrupado.colores = colores
      agrupado.capacidades = capacidades
      agrupado.cantidad = imeiIds.length || Number(agrupado.cantidad || 1) + 1
      agrupado.costo = ((Number(agrupado.costo || 0) * (agrupado.cantidad - 1)) + Number(imei.costo || 0)) / agrupado.cantidad
      sincronizarResumenLineaAgrupada(agrupado)
      toast.add({ severity: 'success', summary: 'Agrupado', detail: `${selectedTelefono.value?.nombre} agregado a la misma linea`, life: 2000 })
      dialogPrecio.value = false
      return
    }
    cart.value.push({
      tipo: 'imei',
      imei_id: imei.id,
      imei_ids: [imei.id],
      imei: imei.nombre,
      imeis: [imei.nombre],
      codigo: imei.nombre || '',
      nombre: selectedTelefono.value?.nombre || '',
      telefono_id: selectedTelefono.value?.id,
      color: imei.color || '',
      colores: imei.color ? [imei.color] : [],
      capacidad: imei.capacidad || '',
      capacidades: imei.capacidad ? [imei.capacidad] : [],
      precio: precioFinal,
      precio_normal: imei.precio_venta || precioFinal,
      costo: imei.costo || 0,
      cantidad: 1,
    })
    toast.add({ severity: 'success', summary: 'Agregado', detail: `${selectedTelefono.value?.nombre} agregado`, life: 2000 })
  } else if (selectedElectrodomestico.value) {
    const agrupado = buscarLineaAgrupable('serial', selectedElectrodomestico.value?.id, precioFinal)
    if (agrupado) {
      const serialIds = normalizarListaIds(agrupado.serial_ids || agrupado.serial_id)
      const seriales = normalizarListaTextos(agrupado.seriales || agrupado.serial)
      const colores = normalizarListaTextos(agrupado.colores || agrupado.color)
      const capacidades = normalizarListaTextos(agrupado.capacidades || agrupado.capacidad)
      agregarValorUnico(serialIds, Number(imei.id))
      agregarValorUnico(seriales, imei.nombre)
      agregarValorUnico(colores, imei.color)
      agregarValorUnico(capacidades, imei.capacidad)
      agrupado.serial_ids = serialIds
      agrupado.seriales = seriales
      agrupado.colores = colores
      agrupado.capacidades = capacidades
      agrupado.cantidad = serialIds.length || Number(agrupado.cantidad || 1) + 1
      agrupado.costo = ((Number(agrupado.costo || 0) * (agrupado.cantidad - 1)) + Number(imei.costo || 0)) / agrupado.cantidad
      sincronizarResumenLineaAgrupada(agrupado)
      toast.add({ severity: 'success', summary: 'Agrupado', detail: `${selectedElectrodomestico.value?.nombre} agregado a la misma linea`, life: 2000 })
      dialogPrecio.value = false
      return
    }
    cart.value.push({
      tipo: 'serial',
      serial_id: imei.id,
      serial_ids: [imei.id],
      serial: imei.nombre,
      seriales: [imei.nombre],
      codigo: imei.nombre || '',
      nombre: selectedElectrodomestico.value?.nombre || '',
      electrodomestico_id: selectedElectrodomestico.value?.id,
      color: imei.color || '',
      colores: imei.color ? [imei.color] : [],
      capacidad: imei.capacidad || '',
      capacidades: imei.capacidad ? [imei.capacidad] : [],
      precio: precioFinal,
      precio_normal: imei.precio_venta || precioFinal,
      costo: imei.costo || 0,
      cantidad: 1,
    })
    toast.add({ severity: 'success', summary: 'Agregado', detail: `${selectedElectrodomestico.value?.nombre} agregado`, life: 2000 })
  }
  dialogPrecio.value = false
}

function agregarAccesorio(accesorio: any) {
  const yaExiste = cart.value.find((item: any) => item.tipo === 'accesorio' && item.accesorio_id === accesorio.id)
  if (yaExiste) {
    if (yaExiste.cantidad >= (accesorio.cantidad || 0)) {
      toast.add({ severity: 'warn', summary: 'Stock insuficiente', detail: 'No hay suficiente stock', life: 2000 })
      return
    }
    yaExiste.cantidad++
    yaExiste.precio = accesorio.precio_venta || 0
    yaExiste.precio_normal = accesorio.precio_venta || yaExiste.precio
    return
  }
  cart.value.push({
    tipo: 'accesorio',
    accesorio_id: accesorio.id,
    nombre: accesorio.nombre,
    codigo: accesorio.codigo_barra || accesorio.codigo || accesorio.id || '',
    codigo_barra: accesorio.codigo_barra || accesorio.codigo || '',
    precio: accesorio.precio_venta || 0,
    precio_normal: accesorio.precio_venta || 0,
    costo: accesorio.costo || 0,
    stock: accesorio.cantidad || 0,
    cantidad: 1,
  })
  toast.add({ severity: 'success', summary: 'Agregado', detail: `${accesorio.nombre} agregado`, life: 2000 })
}

function abrirCambiarImei(item: any, index: number) {
  const idsEnCarrito = new Set<number>()
  cart.value.forEach((cartItem: any, cartIndex: number) => {
    if (cartIndex === index || cartItem?.tipo !== 'imei') return
    normalizarListaIds(cartItem.imei_ids || cartItem.imei_id).forEach((id: number) => idsEnCarrito.add(id))
  })
  const telefono = telefonos.value.find((t: any) => String(t.id) === String(item.telefono_id || ''))
  const imeis = imeisDisponibles.value.filter((i: any) =>
    imeiPerteneceTelefono(i, telefono) &&
    !idsEnCarrito.has(Number(i.id)) &&
    i.nombre !== item.imei
  )
  imeisDisponiblesParaCambio.value = imeis
  itemCambiarImei.value = { ...item, _index: index }
  busquedaCambiarImei.value = ''
  dialogCambiarImei.value = true
}

function seleccionarImeiCambio(nuevoImei: any) {
  const idx = itemCambiarImei.value?._index
  if (idx === undefined || idx === null) return
  const imeiPos = itemCambiarImei.value?._imeiPos
  if (imeiPos !== undefined && imeiPos !== null) {
    const item = cart.value[idx]
    if (!item) return
    const imeiIds = normalizarListaIds(item.imei_ids || item.imei_id)
    const imeis = normalizarListaTextos(item.imeis || item.imei)
    const colores = normalizarListaTextos(item.colores || item.color)
    const capacidades = normalizarListaTextos(item.capacidades || item.capacidad)
    imeiIds[imeiPos] = Number(nuevoImei.id)
    imeis[imeiPos] = nuevoImei.nombre || ''
    colores[imeiPos] = nuevoImei.color || ''
    capacidades[imeiPos] = nuevoImei.capacidad || ''
    item.imei_ids = imeiIds
    item.imeis = imeis
    item.colores = colores
    item.capacidades = capacidades
    item.cantidad = Math.max(1, imeiIds.length || imeis.length)
    sincronizarResumenLineaAgrupada(item)
    itemGestionImeis.value = item
    dialogCambiarImei.value = false
    itemCambiarImei.value = null
    toast.add({ severity: 'success', summary: 'IMEI cambiado', detail: nuevoImei.nombre, life: 2000 })
    return
  }
  cart.value[idx].imei_id = nuevoImei.id
  cart.value[idx].imei_ids = [nuevoImei.id]
  cart.value[idx].imei = nuevoImei.nombre
  cart.value[idx].imeis = [nuevoImei.nombre]
  cart.value[idx].color = nuevoImei.color || ''
  cart.value[idx].colores = nuevoImei.color ? [nuevoImei.color] : []
  cart.value[idx].capacidad = nuevoImei.capacidad || ''
  cart.value[idx].capacidades = nuevoImei.capacidad ? [nuevoImei.capacidad] : []
  cart.value[idx].precio = nuevoImei.precio_venta || cart.value[idx].precio
  dialogCambiarImei.value = false
  itemCambiarImei.value = null
  toast.add({ severity: 'success', summary: 'IMEI cambiado', detail: nuevoImei.nombre, life: 2000 })
}

function quitarDelCarrito(index: number) {
  cart.value.splice(index, 1)
}

function aumentarCantidad(index: number) {
  const item = cart.value[index]
  if (item.tipo === 'imei' || item.tipo === 'serial') return
  const acc = accesorios.value.find((a: any) => a.id === item.accesorio_id)
  if (acc && item.cantidad >= (acc.cantidad || 0)) {
    toast.add({ severity: 'warn', summary: 'Stock insuficiente', detail: 'No hay mas unidades disponibles', life: 2000 })
    return
  }
  item.cantidad++
}

function disminuirCantidad(index: number) {
  const item = cart.value[index]
  if (item.tipo === 'imei' || item.tipo === 'serial') return
  if (item.cantidad <= 1) {
    quitarDelCarrito(index)
    return
  }
  item.cantidad--
}

const precioCambioSeleccionado = ref<'venta' | 'min' | 'xmayor' | 'manual'>('venta')
const itemParaPrecio = ref<any>(null)

function abrirCambiarPrecio(item: any, index: number) {
  cartItemPrecio.value = { item, index }

  if (item.tipo === 'accesorio') {
    itemParaPrecio.value = accesorios.value.find((a: any) => a.id === item.accesorio_id) || null
  } else if (item.tipo === 'imei') {
    itemParaPrecio.value = imeisDisponibles.value.find((i: any) => i.id === item.imei_id) || null
  } else if (item.tipo === 'serial') {
    itemParaPrecio.value = serialesDisponibles.value.find((s: any) => s.id === item.serial_id) || null
  } else {
    itemParaPrecio.value = null
  }

  nuevoPrecioItem.value = item.precio
  precioCambioSeleccionado.value = 'venta'
  dialogCambiarPrecio.value = true
}

function seleccionarPrecioCambio(tipo: 'venta' | 'min' | 'xmayor' | 'manual') {
  precioCambioSeleccionado.value = tipo
  if (tipo === 'venta') nuevoPrecioItem.value = itemParaPrecio.value?.precio_venta || 0
  else if (tipo === 'min') nuevoPrecioItem.value = itemParaPrecio.value?.precio_min || 0
  else if (tipo === 'xmayor') nuevoPrecioItem.value = itemParaPrecio.value?.precio_xmayor || 0
}

function aplicarCambioPrecio() {
  if (!cartItemPrecio.value) return
  const { index } = cartItemPrecio.value
  if (nuevoPrecioItem.value >= 0) {
    cart.value[index].precio = nuevoPrecioItem.value
    cart.value[index].precio_normal = cart.value[index].precio_normal || itemParaPrecio.value?.precio_venta || nuevoPrecioItem.value
    toast.add({ severity: nuevoPrecioItem.value === 0 ? 'info' : 'success', summary: nuevoPrecioItem.value === 0 ? 'Gratis' : 'Precio actualizado', life: 2000 })
  }
  dialogCambiarPrecio.value = false
  cartItemPrecio.value = null
  itemParaPrecio.value = null
}

function seleccionarCliente(cliente: any) {
  clienteSeleccionado.value = cliente
  dialogCliente.value = false
}

function abrirNuevoCliente() {
  nuevoClienteForm.value = { nombre: '', telefono: '', direccion: '', rnc: '' }
  rncTipo.value = 'RNC'
  dialogNuevoCliente.value = true
}

async function buscarClienteApi() {
  let valor = nuevoClienteForm.value.rnc.trim().replace(/-/g, '')
  if (!valor) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un RNC o Cedula', life: 3000 })
    return
  }
  nuevoClienteForm.value.rnc = valor
  buscandoClienteApi.value = true
  try {
    const tokenCifrado = await encryptarPassword('1234567890abc', 10)
    let resultado: any
    if (rncTipo.value === 'CEDULA') {
      resultado = await peticionesFetch('https://demo.tmposrd.com/api2', 'buscarcedula', { cedula: valor }, tokenCifrado, 'POST')
    } else {
      resultado = await peticionesFetch('https://demo.tmposrd.com/api2', `consultarrnc/${valor}`, {}, tokenCifrado, 'GET')
    }
    console.log('[BuscarCliente] Resultado:', resultado)
    if (resultado?.error) {
      toast.add({ severity: 'error', summary: 'Error', detail: resultado.error, life: 4000 })
      return
    }
    let info = resultado?.datos || resultado?.data || resultado
    if (Array.isArray(info)) info = info[0]
    if (!info || (typeof info === 'object' && Object.keys(info).length === 0)) {
      toast.add({ severity: 'info', summary: 'No encontrado', detail: 'No se encontraron datos para ese documento', life: 3000 })
      return
    }
    nuevoClienteForm.value.nombre = (info.name || info.nombre || info.razon_social || info.RazonSocial || '').toUpperCase()
    nuevoClienteForm.value.direccion = (info.direccion || info.Direccion || info.address || info.domicilio || '').toUpperCase()
    toast.add({ severity: 'success', summary: 'Encontrado', detail: `Datos cargados: ${nuevoClienteForm.value.nombre}`, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al consultar API', life: 4000 })
  } finally {
    buscandoClienteApi.value = false
  }
}

async function guardarNuevoCliente() {
  if (!nuevoClienteForm.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del cliente es requerido', life: 3000 })
    return
  }
  try {
    const data = {
      nombre: nuevoClienteForm.value.nombre.trim().toUpperCase(),
      telefono: nuevoClienteForm.value.telefono.trim(),
      direccion: nuevoClienteForm.value.direccion.trim().toUpperCase(),
      rnc: nuevoClienteForm.value.rnc.trim().replace(/-/g, ''),
      email: '',
    }
    const res = await window.db.insert('clientes', addAlmacenIdFilter(data))
    if (res.success) {
      const nuevoCliente = { id: res.data.id, ...data }
      clientes.value.unshift(nuevoCliente)
      clienteSeleccionado.value = nuevoCliente
      dialogNuevoCliente.value = false
      dialogCliente.value = false
      toast.add({ severity: 'success', summary: 'Cliente creado', detail: data.nombre, life: 2000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear el cliente', life: 3000 })
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al crear cliente', life: 3000 })
  }
}

function abrirProductoPersonalizado() {
  prodPersonalizado.value = { nombre: '', precio: 0, costo: 0 }
  dialogProductoPersonalizado.value = true
}

function agregarProductoPersonalizado() {
  if (!prodPersonalizado.value.nombre.trim() || prodPersonalizado.value.precio <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Nombre y precio requeridos', life: 2000 })
    return
  }
  cart.value.push({
    tipo: 'personalizado',
    nombre: prodPersonalizado.value.nombre.trim().toUpperCase(),
    precio: prodPersonalizado.value.precio,
    costo: prodPersonalizado.value.costo,
    cantidad: 1,
  })
  dialogProductoPersonalizado.value = false
  toast.add({ severity: 'success', summary: 'Agregado', detail: prodPersonalizado.value.nombre, life: 2000 })
}

async function holdearVenta() {
  if (cart.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Carrito vacio', detail: 'Agrega productos al carrito para retener', life: 2000 })
    return
  }
  try {
    const hold = await holdRecall.holdVenta(
      cart.value, clienteSeleccionado.value, clienteExpress.value,
      descuentoFijo.value, descuentoPorc.value, descuentoTipo.value, descuentoValor.value,
      metodoPago.value, nota.value, total.value,
      auth.user?.nombre || auth.user?.usuario || ''
    )
    limpiarCarrito()
    sonidos.playClick()
    toast.add({
      severity: hold.syncPendiente ? 'warn' : 'info',
      summary: hold.syncPendiente ? 'Venta pausada localmente' : 'Venta pausada y sincronizada',
      detail: `ID: ${hold.id} - ${hold.itemsCount} producto(s) - ${systemCurrency.value} ${formatCurrency(hold.total)}`,
      life: 3500,
    })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo pausar', detail: error?.message || 'Error guardando la venta', life: 3500 })
  }
}

async function ventaExpress() {
  if (cart.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Carrito vacio', detail: 'Agrega productos al carrito', life: 3000 })
    return
  }
  metodoPago.value = 'EFECTIVO'
  clienteSeleccionado.value = null
  montoRecibido.value = total.value
  descuentoFijo.value = 0
  descuentoPorc.value = 0
  descuentoValor.value = 0
  descuentoTipo.value = 'fijo'
  montoRecibido.value = 0
  nota.value = ''
  noFactura.value = ''
  notaCreditoUsada.value = ''
  metodoPago.value = 'EFECTIVO'
  clienteSeleccionado.value = null
  localStorage.removeItem(POS_STORAGE_KEY)
}

async function imprimirPdf() {
  dialogPrintChoice.value = false
  if (ticketData.value) {
    await asegurarQrFiscalTicket()
    facturaPdfRef.value?.printFactura(ticketData.value)
  }
}

async function soloTicket() {
  dialogPrintChoice.value = false
  await imprimirTicket()
}

async function compartirWhatsApp() {
  const d = ticketData.value
  if (!d) return
  const telefono = d.telefono || ''
  if (!telefono) {
    toast.add({ severity: 'warn', summary: 'WhatsApp', detail: 'El cliente no tiene telefono registrado', life: 3000 })
    return
  }

  try {
    const html = await facturaPdfRef.value?.generateFacturaHtml({ factura: d })
    if (html) {
      const nombre = `Factura_${d.no_factura || 'sin_numero'}.pdf`
      const res = await window.electron.invoke('pdf:generateToFile', html, nombre) as any
      if (res.success) {
        await window.electron.invoke('clipboard:copyFile', res.filePath)
        toast.add({ severity: 'info', summary: 'PDF copiado', detail: 'PDF copiado al portapapeles. Abre WhatsApp y pega (Ctrl+V) para enviarlo.', life: 5000 })
      }
    }
  } catch (_) {}

  const mensaje = encodeURIComponent(
    `Factura ${d.no_factura}\nTotal: ${systemCurrency.value}${d.total?.toFixed(2)}\nCliente: ${d.cliente}\nFecha: ${d.fecha}`
  )
  window.open(`https://wa.me/${telefono.replace(/[^0-9]/g, '')}?text=${mensaje}`, '_blank')
  dialogPrintChoice.value = false
  cerrarTicket()
}

async function compartirImagen() {
  const d = ticketData.value
  if (!d) return
  dialogPrintChoice.value = false
  let container: HTMLDivElement | null = null

  try {
    await asegurarQrFiscalTicket()
    const html = generarTicketHTML()

    container = document.createElement('div')
    container.innerHTML = sanitizePrintableHtml(`<div style="display:flex;justify-content:center;background:#fff;padding:12px 16px">${html}</div>`)
    container.style.cssText = 'position:fixed;left:-9999px;top:0;background:#fff;z-index:-1'
    document.body.appendChild(container)

    await new Promise(r => setTimeout(r, 800))

    const canvas = await html2canvas(container, { scale: 2, useCORS: true, backgroundColor: '#ffffff' })
    container.remove()
    container = null

    const blob = await new Promise<Blob>(resolve => canvas.toBlob(b => resolve(b!), 'image/png'))
    const nombreArchivo = `Ticket_${d.no_factura || 'sin_numero'}.png`
    const file = new File([blob], nombreArchivo, { type: 'image/png' })
    const shareData = {
      title: `Factura ${d.no_factura || ''}`.trim(),
      text: `Factura ${d.no_factura || ''}`.trim(),
      files: [file],
    }

    if (navigator.share && (!navigator.canShare || navigator.canShare(shareData))) {
      await navigator.share(shareData)
      toast.add({ severity: 'success', summary: 'Compartido', detail: 'Se abrio la ventana de compartir.', life: 3000 })
      cerrarTicket()
      return
    }

    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      toast.add({ severity: 'success', summary: 'Copiado', detail: 'Ticket copiado al portapapeles. Pega donde quieras compartirlo.', life: 4000 })
      cerrarTicket()
      return
    } catch {
      const dataUrl = canvas.toDataURL('image/png')
      const a = document.createElement('a')
      a.href = dataUrl
      a.download = nombreArchivo
      a.click()
      toast.add({ severity: 'success', summary: 'Descargado', detail: 'No se pudo copiar al portapapeles. El ticket se descargo como imagen.', life: 4000 })
      cerrarTicket()
    }
  } catch (e: any) {
    if (e.name !== 'AbortError') {
      toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al generar imagen', life: 3000 })
    }
  } finally {
    container?.remove()
  }
}

function enviarCorreo() {
  const d = ticketData.value
  if (!d) return
  const email = clienteSeleccionado.value?.email || ''
  const asunto = encodeURIComponent(`Factura ${d.no_factura}`)
  const cuerpo = encodeURIComponent(
    `Factura: ${d.no_factura}\nCliente: ${d.cliente}\nTotal: ${systemCurrency.value}${d.total?.toFixed(2)}\nFecha: ${d.fecha}\n\nGracias por su compra.`
  )
  window.open(`mailto:${email}?subject=${asunto}&body=${cuerpo}`, '_blank')
  dialogPrintChoice.value = false
  cerrarTicket()
}

function cerrarTicket() {
  dialogTicket.value = false
  ticketData.value = null
  if (!ticketDesdeFactCoti.value) {
    limpiarCarrito()
  }
  ticketDesdeFactCoti.value = false
}

function debeForzarQrTicket(d: any): boolean {
  return Boolean(d && (d.document_stamp_url || /^E\d{2}/i.test(String(d.ncf || d.tipo_comprobante || ''))))
}

async function asegurarQrFiscalTicket() {
  const d = ticketData.value
  if (!d || d.qr || !debeForzarQrTicket(d)) return
  const qrValue = d.document_stamp_url || `https://tmposrd.com/factura/${d.no_factura || ''}`
  try {
    d.qr = await QRCode.toDataURL(qrValue, { width: 180, margin: 1, errorCorrectionLevel: 'M', color: { dark: '#000000', light: '#ffffff' } })
  } catch (error: any) {
    console.error('No se pudo generar QR fiscal:', error)
  }
}

function getTicketBody(d: any): string {
  if (!d) return ''
  const cfg = ticketConfig.value
  const fmt = (n: number) =>
    Number(n || 0).toFixed(2)

  const emp = d.empresa || {}

  const parts: string[] = []
  if (isTicketOptionOn(cfg.show_address) && emp.direccion) parts.push(emp.direccion)
  const phoneEmail: string[] = []
  if (isTicketOptionOn(cfg.show_phone) && emp.telefono) phoneEmail.push(emp.telefono)
  if (isTicketOptionOn(cfg.show_email) && emp.email) phoneEmail.push(emp.email)
  if (phoneEmail.length) parts.push(phoneEmail.join(' / '))
  if (isTicketOptionOn(cfg.show_legal) && emp.rnc) parts.push(`RNC: ${emp.rnc}`)
  const companyInfoHtml = parts.length
    ? parts.join('<br>')
    : ''

  const logoHtml = isTicketOptionOn(cfg.show_logo) && emp.logo
    ? `<div class="logos" style="text-align:center;"><img src="${emp.logo}" style="max-width:100px" alt="Logo" /></div>`
    : ''
  const companyNameHtml = isTicketOptionOn(cfg.show_company_name)
    ? `<div style="font-size:18px !important;font-weight:bold">${emp.nombre || 'MI EMPRESA'}</div>`
    : ''

  const itemsHtml = d.items.map((item: any) => {
    const nombre = `${item.nombre || ''}${item.color ? ` ${item.color}` : ''}${item.capacidad ? ` ${item.capacidad}` : ''}`
    const imeis = normalizarListaTextos(item.imeis || item.imei)
    const seriales = normalizarListaTextos(item.seriales || item.serial)
    const imei = imeis.length ? `<br><span style="font-size:8px;color:#555;">IMEI: ${imeis.join(', ')}</span>` : ''
    const serial = seriales.length ? `<br><span style="font-size:8px;color:#555;">Serial: ${seriales.join(', ')}</span>` : ''
    const precioNormal = getPrecioNormal(item)
    const oferta = itemTieneDescuento(item)
      ? `<br><span style="font-size:8px;font-weight:normal;">Normal: <span style="text-decoration:line-through;">${systemCurrency.value}${fmt(precioNormal)}</span> &nbsp; Con descuento: <b>${systemCurrency.value}${fmt(item.precio || 0)}</b></span>`
      : ''
    return `
      <tr>
        <td colspan="4" style="overflow-wrap: break-word; font-weight: bold; white-space: normal; word-break: break-word;">
          ${nombre}${oferta}${imei}${serial}
        </td>
      </tr>
      <tr>
        <td style="padding-left:20px;">${item.cantidad || 1} x</td>
        <td>${item.empaque || ''}</td>
        <td>${systemCurrency.value}${fmt(item.precio || 0)}</td>
        <td class="precio centrado" style="text-align:right;"><b>${systemCurrency.value}${fmt((item.precio || 0) * (item.cantidad || 1))}</b></td>
      </tr>
    `
  }).join('')

  const pagoLabel = {
    EFECTIVO: 'EFECTIVO',
    TARJETA: 'TARJETA',
    TRANSFERENCIA: 'TRANSFERENCIA',
    CHEQUE: 'CHEQUE',
    MIXTO: 'MIXTO',
  }[(d.metodo_pago || 'EFECTIVO')] || d.metodo_pago
  const debeMostrarQrFiscal = debeForzarQrTicket(d)

  return `
<center id="top">
  ${logoHtml}
  ${companyNameHtml}
  ${companyInfoHtml ? `<div class="info"><p>${companyInfoHtml}</p></div>` : ''}
</center>

<div id="mid" class="bordeado">
  <div class="info">
    <div class="left-column1">
      <p>
        Fecha: ${d.fecha || ''}<br>
        DOC: <b style="font-size:16px">#${d.no_factura || ''}</b><br>
        ${d.ncf ? `NCF: ${d.ncf}<br>` : ''}
        ${d.codigo_seguridad ? `CODIGO SEGURIDAD: ${d.codigo_seguridad}<br>` : ''}
        ${isTicketOptionOn(cfg.show_cliente) ? `CLIENTE: ${d.cliente || 'SIN REGISTRO'}<br>` : ''}
        ${isTicketOptionOn(cfg.show_cliente) && d.telefono ? `TELEFONO: ${d.telefono}<br>` : ''}
        CAJERO: POS<br>
        METODO DE PAGO: ${pagoLabel}
      </p>
    </div>
  </div>
</div>

<div class="bordeado" style="text-align:center;padding:3px">
  ${d.tipo_comprobante || 'FACTURA DE VENTA'}
</div>

${isTicketOptionOn(cfg.show_items) ? `<table cellspacing="0" cellpadding="0">
  <thead>
    <tr>
      <th style="text-align:left;padding-top:5px;padding-bottom:5px;">CANT.</th>
      <th class="precio" style="text-align:left;padding-top:5px;padding-bottom:5px;">EMPAQ.</th>
      <th class="precio" style="text-align:left;padding-top:5px;padding-bottom:5px;">PRECIO</th>
      <th class="precio centrado" style="text-align:right;padding-top:5px;padding-bottom:5px;">TOTAL</th>
    </tr>
  </thead>
  <tbody>${itemsHtml}</tbody>
</table>` : ''}

${isTicketOptionOn(cfg.show_totals) ? `<div class="linea" style="margin-top:30px;"></div>

<div style="font-weight:bold;">
  <table style="width:100%;border-collapse:collapse">
    <tr><td>SUBTOTAL:</td><td style="text-align:right;"><span style="font-size:1.5em !important;margin-top:5px;margin-bottom:5px;">${systemCurrency.value}${fmt(d.subtotal)}</span></td></tr>
    ${d.descuento > 0 ? `<tr><td>DESCUENTO:</td><td style="text-align:right;"><span style="font-size:1.5em !important;margin-top:5px;margin-bottom:5px;">${systemCurrency.value}${fmt(d.descuento)}</span></td></tr>` : ''}
    ${d.impuesto > 0 ? `<tr><td>${taxName.value}:</td><td style="text-align:right;"><span style="font-size:1.5em !important;margin-top:5px;margin-bottom:5px;">${systemCurrency.value}${fmt(d.impuesto)}</span></td></tr>` : `<tr><td style="color:#999">${taxName.value}:</td><td style="text-align:right;color:#999">${d.impuesto_incluido === 2 ? 'Sin impuesto' : 'Incluido'}</td></tr>`}
  </table>
  <table style="width:100%;border-collapse:collapse">
    <tr><td>TOTAL:</td><td style="text-align:right;"><span style="font-size:1.5em !important;margin-top:5px;margin-bottom:5px;">${systemCurrency.value}${fmt(d.total)}</span></td></tr>
  </table>
</div>

<div style="font-weight:bold;">
  <table style="width:100%;border-collapse:collapse">
    <tr><td>PAGO CON:</td><td style="text-align:right;"><span style="font-size:1.5em !important;margin-top:5px;margin-bottom:5px;">${systemCurrency.value}${fmt(d.total)}</span></td></tr>
    <tr><td>SU CAMBIO:</td><td style="text-align:right;"><span style="font-size:1.5em !important;margin-top:5px;margin-bottom:5px;">${formatMoney(0)}</span></td></tr>
  </table>
</div>` : ''}

${isTicketOptionOn(cfg.show_nota) && d.nota ? `<div class="bordeado" style="min-height:30px;margin:4px 0"><p style="font-size:9px;margin:0">${d.nota.replace(/\n/g, '<br>')}</p></div>` : ''}
${isTicketOptionOn(cfg.show_barcode) ? `<div class="barcode" style="text-align:center;margin:6px 0"><div style="display:inline-block;border:1px solid #000;border-radius:5px;padding:3px;overflow:hidden">${generarBarcodeSVG(d.no_factura || '')}</div></div>` : ''}
${((isTicketOptionOn(cfg.show_qr) || debeMostrarQrFiscal) && d.qr) ? `<div id="qrcode" class="qr-code"><center><div class="bordeado2"><img src="${d.qr}" alt="Codigo QR" width="150" height="150"/></div>${d.codigo_seguridad ? `<div style="font-size:9px;font-weight:bold;margin-top:3px">Codigo Seguridad: ${d.codigo_seguridad}</div>` : ''}</center></div>` : ''}
${isTicketOptionOn(cfg.show_footer) ? `<div class="linea" style="margin-top:8px;"></div><div style="text-align:center;">${cfg.footer_text || ''}</div>` : ''}`
}

function generarTicketHTML(): string {
  const paperWidth = Number(ticketConfig.value.paper_width || 80)
  const pageWidth = paperWidth === 58 ? 230 : 300
  const bodyWidth = paperWidth === 58 ? 210 : 250
  const ticketWidth = paperWidth === 58 ? 200 : 240
  const ticketStyles = `
    * { font-size: 10px; font-family: Arial, Helvetica, sans-serif; }
    @page { size: ${pageWidth}px auto; margin: 5px; }
    html, body { background-color: #ffffff; }
    body { width: ${bodyWidth}px; margin: 5px; padding: 5px; background-color: #ffffff; color: #000; }
    th { text-align: left; padding: 5px; border-bottom: 1px solid #000; }
    th.centrado { text-align: center; }
    th.precio { text-align: right; }
    .ticket { width: ${ticketWidth}px; padding-top: 10px; padding-bottom: 10px; }
    thead { border-bottom: 2px solid #000; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    td, th { width: ${ticketWidth}px; }
    .bordeado2 { border: 1px solid #000000; border-radius: 5px; padding: 3px; max-width: 150px; margin-top: 5px; }
    .centrado { text-align: center; align-content: center; }
    .derecha { text-align: right; }
    .linea { width: 100%; border-top: 1px solid #000; padding-top: 5px; padding-bottom: 5px; margin-bottom: 5px; padding-right: 10px; }
    .bordeado { border: 1px solid #000000; border-radius: 5px; padding-left: 5px; }
    .info { display: flex; justify-content: space-between; align-items: flex-start; }
    .logos img { display: block; margin-left: auto; margin-right: auto; }
  `

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Ticket</title>
  <style>${ticketStyles}</style>
</head>
<body><div class="ticket">${getTicketBody(ticketData.value)}</div></body></html>`
}

function arrayBufferTicketToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function prepararLogoTicket() {
  const empresa = ticketData.value?.empresa
  const logo = String(empresa?.logo || '').trim()
  if (!logo || /^data:|^(https?:\/\/|file:|blob:|\/)/i.test(logo)) return
  try {
    await ensureConfigLoaded()
    const url = getImageUrl(logo)
    const key = getConfig()?.key || ''
    if (!url) return
    const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
    if (!response.ok) return
    const type = response.headers.get('content-type') || 'image/png'
    ticketData.value.empresa = {
      ...empresa,
      logo: `data:${type};base64,${arrayBufferTicketToBase64(await response.arrayBuffer())}`,
    }
  } catch (_) {
    // Se conserva el valor actual para no impedir la impresion del ticket.
  }
}

function getTicketPreviewHTML(): string {
  return `<style>
    * { font-size: 10px; font-family: Arial, Helvetica, sans-serif; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    th { text-align: left; padding: 5px; border-bottom: 1px solid #000; }
    td, th { width: 240px; }
    .ticket { width: 240px; padding-top: 10px; padding-bottom: 10px; }
    .bordeado { border: 1px solid #000000; border-radius: 5px; padding-left: 5px; }
    .bordeado2 { border: 1px solid #000000; border-radius: 5px; padding: 3px; max-width: 150px; margin-top: 5px; }
    .centrado { text-align: center; align-content: center; }
    .linea { width: 100%; border-top: 1px solid #000; padding-top: 5px; padding-bottom: 5px; margin-bottom: 5px; padding-right: 10px; }
    .info { display: flex; justify-content: space-between; align-items: flex-start; }
    .logos img { display: block; margin-left: auto; margin-right: auto; }
  </style><div class="ticket">${getTicketBody(ticketData.value)}</div>`
}

async function imprimirTicket() {
  await asegurarQrFiscalTicket()
  await ticketFacturaPrintRef.value?.printTicket(ticketData.value)
  cerrarTicket()
}

function generarBarcodeSVG(data: string): string {
  if (!data) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, data, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 12,
      margin: 2,
    })
    let svgStr = new XMLSerializer().serializeToString(svg)
    svgStr = svgStr.replace(/width="[^"]*"/, 'width="180"').replace(/height="[^"]*"/, 'height="55"')
    return svgStr
  } catch {
    return ''
  }
}

function limpiarCarrito() {
  cart.value = []
  descuentoFijo.value = 0
  descuentoPorc.value = 0
  descuentoValor.value = 0
  descuentoTipo.value = 'fijo'
  montoRecibido.value = 0
  nota.value = ''
  noFactura.value = ''
  esCotizacion.value = false
  metodoPago.value = 'EFECTIVO'
  mixtoEfectivo.value = 0
  mixtoTarjeta.value = 0
  metodoTarjetaMixtoId.value = null
  mixtoTransferencia.value = 0
  transferenciasMixto.value = []
  mixtoCheque.value = 0
  metodosMixto.value = { efectivo: false, tarjeta: false, transferencia: false, cheque: false }
  bancoPosSeleccionado.value = null
  clienteSeleccionado.value = null
  facturaEditandoPos.value = null
  productosOriginalesEditandoPos.value = []
  localStorage.removeItem(POS_STORAGE_KEY)
}

function generarNoFactura() {
  const now = new Date()
  const y = now.getFullYear()
  const m = String(now.getMonth() + 1).padStart(2, '0')
  const d = String(now.getDate()).padStart(2, '0')
  const h = String(now.getHours()).padStart(2, '0')
  const min = String(now.getMinutes()).padStart(2, '0')
  const s = String(now.getSeconds()).padStart(2, '0')
  return `F-${y}${m}${d}-${h}${min}${s}`
}

function cerrarPdfDialog() {
  pdfUrl.value = ''
  dialogPdf.value = false
}

async function generarPdfCotizacion(invoiceNo: string, ncf: string, compTipo: string, fechaStr: string, horaStr: string) {
  const fmt = (n: number) => formatMoney(n)
  const itemsHtml = cart.value.map((item: any) => {
    const nombre = item.nombre || ''
    const cant = item.cantidad || 1
    const precio = item.precio || 0
    const imeis = normalizarListaTextos(item.imeis || item.imei)
    const seriales = normalizarListaTextos(item.seriales || item.serial)
    const imei = imeis.length ? `<br><span style="font-size:9px;color:#666">IMEI: ${imeis.join(', ')}</span>` : ''
    const serial = seriales.length ? `<br><span style="font-size:9px;color:#666">Serial: ${seriales.join(', ')}</span>` : ''
    const extra = imei || serial
    return `<tr><td style="padding:6px 8px;border-bottom:1px solid #ddd;font-size:10px;text-align:center">${cant}</td><td style="padding:6px 8px;border-bottom:1px solid #ddd;font-size:10px">${nombre}${extra ? '' : ''}</td><td style="padding:6px 8px;border-bottom:1px solid #ddd;font-size:10px;text-align:right">${fmt(precio)}</td><td style="padding:6px 8px;border-bottom:1px solid #ddd;font-size:10px;text-align:right;font-weight:bold">${fmt(precio * cant)}</td></tr>${extra ? `<tr><td colspan="2" style="padding:0 8px 4px 8px;font-size:9px;color:#666">${extra}</td><td></td><td></td></tr>` : ''}`
  }).join('')

  const html = `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>COTIZACION ${invoiceNo}</title>
  <style>
    * { font-family: Arial, sans-serif; font-size: 11px; }
    body { padding: 20mm 15mm; color: #333; }
    .header { text-align: center; border-bottom: 3px solid #2563eb; padding-bottom: 12px; margin-bottom: 20px; }
    .header h1 { margin: 0; font-size: 22px; color: #2563eb; }
    .header p { margin: 3px 0; font-size: 11px; color: #666; }
    table { width: 100%; border-collapse: collapse; margin: 10px 0; }
    th { background: #2563eb; color: #fff; padding: 7px 8px; font-size: 10px; text-align: left; }
    td { padding: 5px 8px; font-size: 10px; border-bottom: 1px solid #eee; }
    .info-box { border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; margin: 10px 0; }
    .total-box { background: #f8fafc; border: 1px solid #ddd; border-radius: 6px; padding: 10px 12px; margin: 10px 0; }
    .footer { text-align: center; font-size: 9px; color: #999; margin-top: 25px; border-top: 1px solid #ddd; padding-top: 10px; }
    .validez { text-align: center; font-size: 10px; color: #666; margin: 8px 0; }
  </style>
</head>
<body>
  <div class="header">
    <h1>COTIZACION</h1>
    <p><strong>${empresaNombre.value || 'MI EMPRESA'}</strong></p>
    ${empresaRnc.value ? `<p>RNC: ${empresaRnc.value}</p>` : ''}
    ${empresaDireccion.value ? `<p>${empresaDireccion.value}</p>` : ''}
    ${empresaTelefono.value ? `<p>Tel: ${empresaTelefono.value}</p>` : ''}
  </div>

  <div class="info-box">
    <table>
      <tr><td style="width:25%;font-weight:bold;border:none">No. Cotizacion:</td><td style="border:none">${invoiceNo}</td></tr>
      <tr><td style="font-weight:bold;border:none">Fecha:</td><td style="border:none">${fechaStr} ${horaStr}</td></tr>
      <tr><td style="font-weight:bold;border:none">Cliente:</td><td style="border:none">${(clienteExpress.value || clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL').toUpperCase()}</td></tr>
      ${clienteSeleccionado.value?.telefono ? `<tr><td style="font-weight:bold;border:none">Telefono:</td><td style="border:none">${clienteSeleccionado.value.telefono}</td></tr>` : ''}
      ${ncf ? `<tr><td style="font-weight:bold;border:none">NCF:</td><td style="border:none">${ncf}</td></tr>` : ''}
    </table>
  </div>

  <table>
    <thead><tr><th style="text-align:center;width:8%">Cant</th><th>Descripcion</th><th style="text-align:right;width:15%">Precio</th><th style="text-align:right;width:20%">Total</th></tr></thead>
    <tbody>${itemsHtml}</tbody>
  </table>

  <div class="total-box">
    <table>
      <tr><td style="border:none;text-align:right;font-size:11px"><strong>Subtotal:</strong></td><td style="border:none;text-align:right;font-size:11px;width:120px">${fmt(subtotal.value)}</td></tr>
      ${descuento.value > 0 ? `<tr><td style="border:none;text-align:right;font-size:11px"><strong>Descuento:</strong></td><td style="border:none;text-align:right;font-size:11px;color:#c00">${fmt(-descuento.value)}</td></tr>` : ''}
      <tr><td style="border:none;text-align:right;font-size:11px"><strong>${taxName.value}:</strong></td><td style="border:none;text-align:right;font-size:11px">${fmt(impuestoMonto.value)}</td></tr>
      <tr><td style="border-top:2px solid #333;text-align:right;font-size:14px;font-weight:bold">TOTAL</td><td style="border-top:2px solid #333;text-align:right;font-size:14px;font-weight:bold">${fmt(total.value)}</td></tr>
    </table>
  </div>

  <div class="validez">Esta cotizacion tiene una validez de 15 dias</div>

  <div class="footer">
    Cotizacion generada por MrCuttiTechnology - ${fechaStr}
  </div>
</body>
</html>`

  try {
    const res = await window.electron.invoke('generate:pdf', html, `Cotizacion_${invoiceNo}.pdf`)
    if (res.success && res.dataUrl) {
      const resp = await fetch(res.dataUrl)
      const blob = await resp.blob()
      pdfUrl.value = URL.createObjectURL(blob)
      dialogPdf.value = true
    }
  } catch (_) {}
}

async function confirmarVenta() {
  if (cart.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Carrito vacio', detail: 'Agrega productos al carrito', life: 3000 })
    return
  }
  if (total.value < 0) {
    toast.add({ severity: 'warn', summary: 'Total invalido', detail: 'El total no puede ser negativo', life: 3000 })
    return
  }
  const seEnviaraPendienteCaja = Boolean(esVendedorPendiente.value && !esCotizacion.value && !facturaEditandoPos.value?.id)
  if (!seEnviaraPendienteCaja && !esCotizacion.value && facturacionElectronicaActiva.value && !facturaEditandoPos.value?.id) {
    if (!alanubeBaseUrl.value || !alanubeToken.value.trim()) {
      toast.add({ severity: 'warn', summary: 'Alanube requerido', detail: 'Configura URL y token de Alanube antes de facturar electronicamente', life: 4000 })
      return
    }
    if (!alanubeIdCompania.value || !alanubeCompanyData.value) {
      toast.add({ severity: 'warn', summary: 'Alanube requerido', detail: 'Configura y prueba Alanube antes de facturar electronicamente', life: 4000 })
      return
    }
    if (!esComprobanteElectronico(comprobanteSeleccionado.value)) {
      toast.add({ severity: 'warn', summary: 'e-CF requerido', detail: 'Selecciona un comprobante electronico activo', life: 3500 })
      return
    }
    if (!['E31', 'E32'].includes(String(comprobanteSeleccionado.value?.tipo || '').toUpperCase())) {
      toast.add({ severity: 'warn', summary: 'e-CF no soportado', detail: 'Alanube esta conectado para E31 y E32 en este flujo', life: 3500 })
      return
    }
  }
  if (!seEnviaraPendienteCaja && !esCotizacion.value && comprobanteSeleccionado.value?.tipo === 'E31' && !clienteSeleccionado.value?.rnc) {
    toast.add({ severity: 'warn', summary: 'Cliente requerido', detail: 'E31 requiere cliente con RNC', life: 3000 })
    return
  }
  montoRecibido.value = total.value
  clienteExpress.value = ''
  confirmPago.value = true
}

watch(comprobanteSeleccionado, (comp) => {
  if (comp?.tipo === 'SIN') {
    impuestoPorcentaje.value = 0
    impuestoIncluido.value = 2
  } else if (comp) {
    impuestoPorcentaje.value = impuestoPorcentajeOriginal.value
    impuestoIncluido.value = impuestoIncluidoOriginal.value
  }
})

watch(metodoPago, (val) => {
  bancoPosSeleccionado.value = null
  if (String(val).toLowerCase() === 'mixto') {
    metodosMixto.value = { efectivo: false, tarjeta: false, transferencia: false, cheque: false }
    mixtoEfectivo.value = 0
    mixtoTarjeta.value = 0
    metodoTarjetaMixtoId.value = null
    mixtoTransferencia.value = 0
    transferenciasMixto.value = []
    mixtoCheque.value = 0
    mixtoError.value = ''
    dialogMixto.value = true
    cargarBancosPos()
  }
})

watch(confirmPago, async (val) => {
  if (val && needsBankSelection.value) {
    bancoPosSeleccionado.value = null
    await cargarBancosPos()
  }
})

function autoCalcularMixto() {
  if (!dialogMixto.value) return
  const suma = totalDistribuidoMixto.value
  if (suma >= total.value) return
  const restante = total.value - suma
  const orden = ['efectivo', 'tarjeta', 'transferencia', 'cheque']
  const campos: Record<string, any> = { efectivo: mixtoEfectivo, tarjeta: mixtoTarjeta, cheque: mixtoCheque }
  for (const key of orden) {
    if (key === 'transferencia' && metodosMixto.value.transferencia && totalTransferenciasMixto() === 0) {
      if (transferenciasMixto.value.length === 0) transferenciasMixto.value.push({ banco_id: null, monto: 0 })
      transferenciasMixto.value[0].monto = restante
      mixtoTransferencia.value = restante
      break
    }
    if (metodosMixto.value[key] && campos[key] && Number(campos[key].value) === 0) {
      campos[key].value = key === 'tarjeta' ? restante / (1 + (comisionMixtaPorcentaje.value / 100)) : restante
      break
    }
  }
}

function totalTransferenciasMixto(): number {
  return transferenciasMixto.value.reduce((sum, item) => sum + (Number(item.monto) || 0), 0)
}

function agregarTransferenciaMixto() {
  transferenciasMixto.value.push({ banco_id: null, monto: 0 })
}

function quitarTransferenciaMixto(index: number) {
  transferenciasMixto.value.splice(index, 1)
  if (transferenciasMixto.value.length === 0) agregarTransferenciaMixto()
  mixtoTransferencia.value = totalTransferenciasMixto()
}

function bancoNombrePos(id: any): string {
  return bancosPos.value.find((b: any) => Number(b.id) === Number(id))?.nombre || ''
}

watch([mixtoEfectivo, mixtoTarjeta, mixtoTransferencia, mixtoCheque, transferenciasMixto, metodosMixto], () => {
  mixtoTransferencia.value = totalTransferenciasMixto()
  autoCalcularMixto()
}, { deep: true })

watch(() => metodosMixto.value.tarjeta, (seleccionada) => {
  if (seleccionada) {
    if (!metodoTarjetaMixtoSeleccionado.value) metodoTarjetaMixtoId.value = Number(tarjetasMixto.value[0]?.id || 0) || null
  } else {
    metodoTarjetaMixtoId.value = null
    mixtoTarjeta.value = 0
  }
})

function confirmarMixto() {
  const suma = totalDistribuidoMixto.value
  if (suma <= 0) {
    mixtoError.value = 'Debes ingresar al menos un metodo de pago'
    return
  }
  if (metodosMixto.value.transferencia) {
    const invalidas = transferenciasMixto.value.filter((t) => Number(t.monto || 0) > 0 && !t.banco_id)
    if (invalidas.length > 0) {
      mixtoError.value = 'Selecciona un banco para cada transferencia'
      return
    }
  }
  if (metodosMixto.value.tarjeta && Number(mixtoTarjeta.value || 0) > 0 && !metodoTarjetaMixtoSeleccionado.value) {
    mixtoError.value = 'Selecciona la tarjeta que se utilizara'
    return
  }
  if (Math.abs(suma - total.value) > 0.01) {
    mixtoError.value = `La suma (${formatMoney(suma)}) no coincide con el total (${formatMoney(total.value)})`
    return
  }
  mixtoError.value = ''
  dialogMixto.value = false
  confirmPago.value = true
}

function alanubeAuthHeader() {
  const tokenValue = alanubeToken.value.trim()
  return tokenValue.toLowerCase().startsWith('bearer ') ? tokenValue : `Bearer ${tokenValue}`
}

function redondearMonto(value: any) {
  return Number(Number(value || 0).toFixed(2))
}

function extraerCampo(obj: any, keys: string[], fallback = '') {
  if (!obj || typeof obj !== 'object') return fallback
  for (const key of keys) {
    const value = obj[key]
    if (value !== undefined && value !== null && String(value).trim()) return String(value).trim()
  }
  return fallback
}

function limpiarNumeroFiscal(value: any) {
  return String(value || '').replace(/\D/g, '')
}

function buildAlanubeSender() {
  const company = alanubeCompanyData.value || {}
  return {
    rnc: limpiarNumeroFiscal(extraerCampo(company, ['rnc', 'identification', 'identificationNumber', 'taxId'], empresaRnc.value)) || '',
    companyName: extraerCampo(company, ['companyName', 'businessName', 'name', 'legalName', 'nombre', 'razonSocial'], empresaNombre.value),
    tradename: extraerCampo(company, ['tradename', 'tradeName', 'commercialName', 'nombreComercial'], empresaNombre.value),
    address: extraerCampo(company, ['address', 'direccion'], empresaDireccion.value),
    phone: extraerCampo(company, ['phone', 'telefono'], empresaTelefono.value),
    email: extraerCampo(company, ['email', 'correo'], empresaEmail.value),
    stampDate: new Date().toISOString().split('T')[0],
  }
}

function buildAlanubeBuyer() {
  const nombre = (clienteExpress.value || clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL').toUpperCase()
  const rnc = limpiarNumeroFiscal(clienteSeleccionado.value?.rnc || clienteSeleccionado.value?.cedula || '')
  return {
    rnc: rnc || '',
    companyName: nombre,
    businessName: nombre,
    contact: nombre,
    address: clienteSeleccionado.value?.direccion || '',
    phone: clienteSeleccionado.value?.telefono || clienteSeleccionado.value?.whatsapp || '',
    email: clienteSeleccionado.value?.email || '',
  }
}

function buildAlanubeItemDetails() {
  const tasa = Number(impuestoPorcentaje.value || 0)
  const divisor = 1 + (tasa / 100)
  return cartConComision.value.map((item: any, index: number) => {
    const cantidad = Number(item.cantidad || 1)
    const precioBruto = Number(item.precio || 0)
    const precio = impuestoIncluido.value === 1 && tasa > 0 ? redondearMonto(precioBruto / divisor) : redondearMonto(precioBruto)
    const monto = redondearMonto(precio * cantidad)
    return {
      lineNumber: index + 1,
      billingIndicator: tasa > 0 && impuestoIncluido.value !== 2 ? 1 : 4,
      itemName: String(item.nombre || 'PRODUCTO').slice(0, 80),
      goodServiceIndicator: 1,
      itemDescription: String(item.nombre || 'PRODUCTO').slice(0, 1000),
      quantityItem: cantidad,
      unitPriceItem: precio,
      itemAmount: monto,
    }
  })
}

function buildAlanubeTotals() {
  const tasa = Number(impuestoPorcentaje.value || 0)
  const divisor = 1 + (tasa / 100)
  const baseConDescuento = redondearMonto(Math.max(0, subtotal.value - descuento.value))
  const montoExento = impuestoIncluido.value === 2 ? baseConDescuento : 0
  const montoGravado = impuestoIncluido.value === 2
    ? 0
    : impuestoIncluido.value === 1 && tasa > 0
      ? redondearMonto(baseConDescuento / divisor)
      : baseConDescuento
  const itbis = impuestoIncluido.value === 2
    ? 0
    : impuestoIncluido.value === 1 && tasa > 0
      ? redondearMonto(baseConDescuento - montoGravado)
      : redondearMonto(montoGravado * (tasa / 100))
  return {
    taxedAmount: montoGravado,
    taxedAmount18: montoGravado,
    exemptAmount: montoExento,
    itbis18: itbis,
    totalItbis: itbis,
    totalAmount: redondearMonto(total.value),
  }
}

function buildAlanubePayload(ncf: string, compTipo: string, fechaStr: string, invoiceNo: string) {
  const documentType = Number(String(compTipo || '').replace(/\D/g, '') || 0)
  const payload: any = {
    company: alanubeIdCompania.value ? { id: alanubeIdCompania.value } : undefined,
    idDoc: {
      encf: ncf,
      documentType,
      incomeType: 1,
      paymentType: metodoPago.value === 'CREDITO' ? 2 : 1,
      issueDate: fechaStr,
      internalDocumentNumber: invoiceNo,
    },
    sender: buildAlanubeSender(),
    totals: buildAlanubeTotals(),
    itemDetails: buildAlanubeItemDetails(),
    config: {
      sendToDgii: true,
    },
  }

  if (compTipo === 'E31') payload.buyer = buildAlanubeBuyer()
  else if (total.value >= 250000 || clienteSeleccionado.value) payload.buyer = buildAlanubeBuyer()

  return payload
}

function alanubeStatusFromResponse(response: any, ok: boolean): string {
  if (!ok) return 'ERROR_ENVIO'
  const legalStatus = String(response?.legalStatus || response?.legal_status || '').toUpperCase()
  if (legalStatus === 'ACCEPTED') return 'ACEPTADA'
  if (legalStatus === 'REJECTED') return 'RECHAZADA'
  return String(response?.status || 'ENVIADA').toUpperCase()
}

async function guardarFacturaEcf(params: {
  facturaId: number
  invoiceNo: string
  ncf: string
  compTipo: string
  endpoint: string
  httpStatus: number
  payload: any
  response: any
  ok: boolean
  error?: string
}) {
  const response = params.response && typeof params.response === 'object' ? params.response : {}
  const now = new Date().toISOString()
  const legalStatus = String(response?.legalStatus || response?.legal_status || '').toUpperCase()
  const record = {
    factura_id: params.facturaId,
    no_factura: params.invoiceNo,
    ncf: params.ncf,
    tipo_comprobante: params.compTipo,
    alanube_id: response?.id || '',
    alanube_id_compania: alanubeIdCompania.value,
    document_number: response?.documentNumber || response?.document_number || params.ncf,
    document_stamp_url: getAlanubeDocumentStampUrl(response),
    security_code: getAlanubeSecurityCode(response),
    status: alanubeStatusFromResponse(response, params.ok),
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

  try {
    const existente = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [params.facturaId])
    const existenteId = existente?.success && Array.isArray(existente.data) && existente.data.length > 0
      ? existente.data[0].id
      : 0
    const res = existenteId
      ? await window.db.update('facturas_ecf', existenteId, record)
      : await window.db.insert('facturas_ecf', record)
    if (!res?.success) throw new Error(res?.error || 'No se pudo guardar facturas_ecf')
  } catch (error) {
    console.warn('[Alanube] No se pudo guardar el registro facturas_ecf:', error)
  }
}

async function enviarFacturaAlanube(facturaId: number, ncf: string, compTipo: string, fechaStr: string, invoiceNo: string) {
  if (!isDominicanFiscal.value || !facturacionElectronicaActiva.value || esCotizacion.value) return null
  if (!alanubeToken.value.trim()) throw new Error('Configura el token de Alanube antes de facturar electronicamente')
  if (!['E31', 'E32'].includes(String(compTipo).toUpperCase())) return null

  const endpoint = compTipo === 'E31' ? 'fiscal-invoices' : 'invoices'
  const url = `${alanubeBaseUrl.value.replace(/\/+$/, '')}/${endpoint}`
  const payload = buildAlanubePayload(ncf, compTipo, fechaStr, invoiceNo)

  const res = await fetch(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/json',
      Authorization: alanubeAuthHeader(),
    },
    body: JSON.stringify(payload),
  })
  const contentType = res.headers.get('content-type') || ''
  const data = contentType.includes('application/json') ? await res.json() : await res.text()
  const alanubeResult = {
    facturacion_electronica: 1,
    alanube_endpoint: endpoint,
    alanube_payload: payload,
    alanube_response: data,
    alanube_status: res.status,
    alanube_enviado_at: new Date().toISOString(),
    alanube_id_compania: alanubeIdCompania.value,
  }
  await window.db.update('facturas', facturaId, { otro: JSON.stringify(alanubeResult) })
  await guardarFacturaEcf({
    facturaId,
    invoiceNo,
    ncf,
    compTipo,
    endpoint,
    httpStatus: res.status,
    payload,
    response: data,
    ok: res.ok,
    error: res.ok ? '' : (typeof data === 'string' ? data : data?.message || data?.error || ''),
  })
  if (!res.ok) {
    const message = typeof data === 'object'
      ? data?.message || data?.error || data?.response?.[0]?.message || `Alanube respondio ${res.status}`
      : data || `Alanube respondio ${res.status}`
    throw new Error(message)
  }
  return data
}

function getAlanubeDocumentStampUrl(response: any): string {
  return String(response?.documentStampUrl || response?.document_stamp_url || '').trim()
}

function getAlanubeSecurityCode(response: any): string {
  return String(response?.securityCode || response?.security_code || '').trim()
}

function getAlanubeResponseFromFactura(factura: any): any {
  try {
    const otro = typeof factura?.otro === 'string' ? JSON.parse(factura.otro || '{}') : factura?.otro || {}
    return otro?.alanube_response || otro || null
  } catch {
    return null
  }
}

async function completarVenta() {
  guardando.value = true
  await recargarConfigVentas()
  try {
    const invoiceNo = noFactura.value.trim() || generarNoFactura()
    const now = new Date()
    const fechaStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
    const horaStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')

    const esNuevaPendienteVendedor = Boolean(esVendedorPendiente.value && !esCotizacion.value && !facturaEditandoPos.value?.id)
    if (!esNuevaPendienteVendedor && needsBankSelection.value && !bancoPosSeleccionado.value) {
      toast.add({ severity: 'warn', summary: 'Banco requerido', detail: 'Selecciona el banco destino para el pago', life: 3000 })
      guardando.value = false; return
    }

    const productosJson = JSON.stringify(cart.value.map(item => ({
      tipo: item.tipo,
      nombre: item.nombre,
      codigo: item.codigo || item.codigo_barra || item.cod_producto || item.sku || item.accesorio_id || item.imei || item.serial || '',
      codigo_barra: item.codigo_barra || item.codigo || '',
      cantidad: item.cantidad,
      precio: item.precio,
      precio_normal: item.precio_normal || item.precio,
      costo: item.costo || 0,
      imei: item.imei || '',
      imeis: normalizarListaTextos(item.imeis || item.imei),
      imei_id: item.imei_id || null,
      imei_ids: normalizarListaIds(item.imei_ids || item.imei_id),
      serial: item.serial || '',
      seriales: normalizarListaTextos(item.seriales || item.serial),
      serial_id: item.serial_id || null,
      serial_ids: normalizarListaIds(item.serial_ids || item.serial_id),
      color: item.color || '',
      colores: normalizarListaTextos(item.colores || item.color),
      capacidad: item.capacidad || '',
      capacidades: normalizarListaTextos(item.capacidades || item.capacidad),
      accesorio_id: item.accesorio_id || null,
      stock: item.stock || 0,
    })))

    const comp = comprobanteSeleccionado.value
    let ncf = ''
    let compId = 0
    let compTipo = ''

    if (comp && comp.tipo !== 'SIN') {
      const sec = formatSecuenciaComprobante(comp)
      ncf = `${comp.prefijo || comp.tipo}${sec}`
      compId = comp.id
      compTipo = comp.tipo
    }

    let turnoId = 0
    try {
      const turnoRes = await (window as any).electron.invoke('caja:getTurnoActivo')
      if (turnoRes.success && turnoRes.data) turnoId = turnoRes.data.id
    } catch {}
    const almacenStore = useAlmacenStore()
    const editandoFactura = facturaEditandoPos.value
    if (editandoFactura?.id && await bloquearSiFacturaElectronicaAceptada(editandoFactura, 'actualizar')) return

    const facturaData = {
      turno_id: esNuevaPendienteVendedor ? 0 : turnoId,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
      no_factura: invoiceNo,
      tipo_factura: esCotizacion.value ? 'COTIZACION' : 'FACTURA_VENTA',
      cod_cliente: clienteSeleccionado.value?.id?.toString() || '',
      nombre_cliente: (clienteExpress.value || clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL').toUpperCase(),
      telefono_cliente: clienteSeleccionado.value?.telefono || '',
      productos: productosJson,
      metodo_pago: metodoPago.value,
      porcentaje_tarjeta: porcentajeTarjetaFactura.value,
      monto_porcentaje_tarjeta: montoPorcentajeTarjeta.value,
      efectivo: esNuevaPendienteVendedor ? 0 : metodoPago.value === 'EFECTIVO' ? total.value : String(metodoPago.value).toLowerCase() === 'mixto' ? Number(mixtoEfectivo.value) || 0 : 0,
      tarjeta: esNuevaPendienteVendedor ? 0 : esMetodoTarjeta(metodoPago.value) ? total.value : String(metodoPago.value).toLowerCase() === 'mixto' ? montoTarjetaMixtoTotal.value : 0,
      transferencia: esNuevaPendienteVendedor ? 0 : metodoPago.value === 'TRANSFERENCIA' ? total.value : String(metodoPago.value).toLowerCase() === 'mixto' ? totalTransferenciasMixto() : 0,
      cheque: esNuevaPendienteVendedor ? 0 : String(metodoPago.value).toLowerCase() === 'mixto' ? Number(mixtoCheque.value) || 0 : 0,
      canal_venta: 'LOCAL',
      fecha_emision: fechaStr,
      hora: horaStr,
      impuesto: impuestoMonto.value,
      descuento: descuento.value,
      financiera: porcentajeTarjetaFactura.value ? JSON.stringify({
        comision_porcentaje: porcentajeTarjetaFactura.value,
        monto_comision: montoPorcentajeTarjeta.value,
        metodo: String(metodoPago.value).toUpperCase() === 'MIXTO' ? detalleTarjetaMixta.value?.metodo_nombre || 'TARJETA' : metodoPago.value,
        tipo_pago: metodoPago.value,
      }) : '',
      subtotal: subtotal.value,
      costo: costoTotal.value,
      total: total.value,
      ganancia: gananciaTotal.value,
      estado_factura: esNuevaPendienteVendedor ? 'PENDIENTE' : 'PAGADA',
      fecha_estado: fechaStr,
      mes: String(now.getMonth() + 1),
      year: String(now.getFullYear()),
      nota: (nota.value.trim() + (notaCreditoUsada.value ? ' | ' + notaCreditoUsada.value : '')).toUpperCase(),
      usuario: auth.user?.usuario || auth.user?.nombre || 'POS',
      vendedor: auth.user?.nombre || auth.user?.usuario || '',
      otro: JSON.stringify({
        facturacion_electronica: facturacionElectronicaActiva.value && !esCotizacion.value ? 1 : 0,
        alanube_id_compania: facturacionElectronicaActiva.value ? alanubeIdCompania.value : '',
        alanube_company_data: facturacionElectronicaActiva.value ? alanubeCompanyData.value : null,
        banco_id: needsBankSelection.value ? bancoPosSeleccionado.value : null,
        banco_nombre: needsBankSelection.value ? bancosPos.value.find((b: any) => b.id === bancoPosSeleccionado.value)?.nombre : '',
        tarjeta_mixta: String(metodoPago.value).toLowerCase() === 'mixto' ? detalleTarjetaMixta.value : null,
        transferencias_mixtas: String(metodoPago.value).toLowerCase() === 'mixto'
          ? transferenciasMixto.value
              .filter((t) => Number(t.monto || 0) > 0)
              .map((t) => ({
                banco_id: t.banco_id,
                banco_nombre: bancoNombrePos(t.banco_id),
                monto: Number(t.monto || 0),
              }))
          : [],
      }),
      ncf,
      comprobante: compTipo,
      tipo_comprobante: compTipo,
      comprobante_id: compId,
    }
    if (esNuevaPendienteVendedor) {
      facturaData.ncf = ''
      facturaData.comprobante = ''
      facturaData.tipo_comprobante = ''
      facturaData.comprobante_id = 0
    }
    if (editandoFactura?.id) {
      facturaData.ncf = editandoFactura.ncf || facturaData.ncf
      facturaData.comprobante = editandoFactura.comprobante || facturaData.comprobante
      facturaData.tipo_comprobante = editandoFactura.tipo_comprobante || facturaData.tipo_comprobante
      facturaData.comprobante_id = editandoFactura.comprobante_id || facturaData.comprobante_id
      facturaData.fecha_emision = editandoFactura.fecha_emision || facturaData.fecha_emision
      facturaData.hora = editandoFactura.hora || facturaData.hora
      facturaData.otro = editandoFactura.otro || facturaData.otro
    }

    console.log('[NC] Factura nota final:', facturaData.nota, '| notaCreditoUsada:', notaCreditoUsada.value)

    // TMPBASE expone las tablas del proyecto mediante su API, pero no ejecuta
    // los handlers IPC locales dentro de /runtime. En modo online guardamos por
    // las rutas CRUD de la API (que preparan la tabla si falta) y dejamos la
    // transaccion SQLite atomica solamente para el servidor local.
    const ventaAtomica = !(window as any).__onlineOnly && !editandoFactura?.id && !esCotizacion.value
    let resFactura: any
    if (ventaAtomica) {
      if (!esNuevaPendienteVendedor && metodoPago.value === 'CREDITO') facturaData.estado_factura = 'CREDITO'
      const inventarioAtomico = expandirItemsInventario(cart.value).map((item: any) => {
        if (item.tipo === 'accesorio' && item.accesorio_id) {
          return { tabla: 'accesorios', id: item.accesorio_id, cantidad: Number(item.cantidad || 1) }
        }
        const tabla = item.tipo === 'imei' ? 'imei' : item.tipo === 'serial' ? 'serial' : ''
        const id = item.tipo === 'imei' ? item.imei_id : item.tipo === 'serial' ? item.serial_id : 0
        return {
          tabla,
          id,
          cambios: {
            estado: 'VENDIDO',
            comprador: clienteSeleccionado.value?.nombre?.toUpperCase() || 'CONSUMIDOR FINAL',
            no_factura: invoiceNo,
            precio_vendido: item.precio,
            fecha_venta: fechaStr,
            hora_venta: horaStr,
          },
        }
      }).filter((item: any) => item.tabla && item.id)
      const bancosAtomicos = esNuevaPendienteVendedor ? [] : String(metodoPago.value).toLowerCase() === 'mixto'
        ? transferenciasMixto.value.filter((t: any) => Number(t.monto || 0) > 0 && t.banco_id).map((t: any) => ({ id: t.banco_id, monto: Number(t.monto) }))
        : needsBankSelection.value && bancoPosSeleccionado.value
          ? [{ id: bancoPosSeleccionado.value, monto: Number(total.value) }]
          : []
      const cuentaCobrarAtomica = !esNuevaPendienteVendedor && metodoPago.value === 'CREDITO' ? {
        no_factura: invoiceNo,
        cod_cliente: clienteSeleccionado.value?.id?.toString() || '',
        nombre_cliente: (clienteExpress.value || clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL').toUpperCase(),
        telefono_cliente: clienteSeleccionado.value?.telefono || '',
        total: total.value,
        abonado: 0,
        saldo: total.value,
        fecha_venta: fechaStr,
        estado: 'ACTIVA',
        almacen_id: almacenStore.activeId || 0,
        almacen_uid: almacenStore.activeUid || '',
      } : null
      resFactura = await window.electron.invoke('ventas:guardarAtomica', {
        factura: facturaData,
        cuenta_cobrar: cuentaCobrarAtomica,
        comprobante_id: !esNuevaPendienteVendedor && comp && comp.tipo !== 'SIN' ? comp.id : 0,
        inventario: inventarioAtomico,
        bancos: bancosAtomicos,
      })
    } else {
      resFactura = editandoFactura?.id
        ? await window.db.update('facturas', editandoFactura.id, facturaData)
        : await window.db.insert('facturas', facturaData)
    }

    if (resFactura.success && !editandoFactura?.id) {
      const check = await window.db.getById('facturas', resFactura.data.id)
      console.log('[NC] Factura guardada nota:', check.data?.nota)
    }
    if (!resFactura.success) {
      throw new Error(resFactura.error || (editandoFactura?.id ? 'Error al actualizar factura' : 'Error al crear factura'))
    }
    if (!editandoFactura?.id && !esCotizacion.value) {
      for (const table of ['imei', 'serial', 'accesorios']) {
        window.dispatchEvent(new CustomEvent('inventory-changed', { detail: { table, updated: 1, deleted: 0 } }))
      }
    }
    const facturaIdActual = editandoFactura?.id || resFactura.data.id
    if (editandoFactura?.id) {
      await registrarAuditoriaFactura('editar_factura_pos', editandoFactura, {
        no_factura: editandoFactura.no_factura || invoiceNo,
        total_anterior: editandoFactura.total,
        total_nuevo: facturaData.total,
      }, 'OK')
    } else if (!esNuevaPendienteVendedor && facturacionElectronicaActiva.value && !esCotizacion.value) {
      await registrarAuditoriaFactura('crear_factura_electronica', { ...facturaData, id: facturaIdActual }, {
        ncf: facturaData.ncf,
        tipo_comprobante: facturaData.tipo_comprobante,
      }, 'OK')
    }
    let alanubeResponse: any = editandoFactura?.id ? getAlanubeResponseFromFactura(editandoFactura) : null

    if (!editandoFactura?.id && !esNuevaPendienteVendedor && facturacionElectronicaActiva.value && !esCotizacion.value) {
      try {
        alanubeResponse = await enviarFacturaAlanube(facturaIdActual, facturaData.ncf, facturaData.tipo_comprobante, fechaStr, invoiceNo)
        await registrarAuditoriaFactura('enviar_alanube', { ...facturaData, id: facturaIdActual }, {
          ncf: facturaData.ncf,
          tipo_comprobante: facturaData.tipo_comprobante,
          alanube_id: alanubeResponse?.id || '',
          legal_status: alanubeResponse?.legalStatus || '',
        }, 'OK')
        toast.add({ severity: 'success', summary: 'Alanube', detail: 'Factura electronica enviada correctamente', life: 3000 })
      } catch (error: any) {
        await registrarAuditoriaFactura('enviar_alanube', { ...facturaData, id: facturaIdActual }, {
          ncf: facturaData.ncf,
          tipo_comprobante: facturaData.tipo_comprobante,
          error: error?.message || '',
        }, 'ERROR')
        try {
          const facturaActual = await window.db.getById('facturas', facturaIdActual)
          const otroActual = facturaActual?.data?.otro ? JSON.parse(facturaActual.data.otro) : {}
          await window.db.update('facturas', facturaIdActual, {
            otro: JSON.stringify({
              ...otroActual,
              facturacion_electronica: 1,
              alanube_error: error?.message || 'Error enviando a Alanube',
              alanube_error_at: new Date().toISOString(),
              alanube_id_compania: alanubeIdCompania.value,
            }),
          })
        } catch (_) {}
        throw new Error(`Alanube: ${error?.message || 'No se pudo enviar la factura electronica'}`)
      }
    }

    if (esCotizacion.value) {
      facturaData.estado_factura = 'COTIZACION'
      await window.db.update('facturas', facturaIdActual, { estado_factura: 'COTIZACION' })
    } else if (metodoPago.value === 'CREDITO' && !ventaAtomica) {
      const clienteNombre = (clienteExpress.value || clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL').toUpperCase()
      const cuentaData = {
        no_factura: invoiceNo,
        cod_cliente: clienteSeleccionado.value?.id?.toString() || '',
        nombre_cliente: clienteNombre,
        telefono_cliente: clienteSeleccionado.value?.telefono || '',
        total: total.value,
        abonado: 0,
        saldo: total.value,
        fecha_venta: fechaStr,
        estado: 'ACTIVA',
        almacen_id: almacenStore.activeId || 0,
        almacen_uid: almacenStore.activeUid || '',
      }
      const cuentasRes = await window.db.getAll('cuentas_cobrar')
      const cuentaExistente = cuentasRes.success
        ? (cuentasRes.data || []).find((c: any) => String(c.no_factura || '') === String(invoiceNo))
        : null
      const resCxC = cuentaExistente
        ? await window.db.update('cuentas_cobrar', cuentaExistente.id, {
            ...cuentaData,
            abonado: Number(cuentaExistente.abonado || 0),
            saldo: Math.max(0, total.value - Number(cuentaExistente.abonado || 0)),
          })
        : await window.db.insert('cuentas_cobrar', cuentaData)
      if (resCxC.success) {
        facturaData.estado_factura = 'CREDITO'
        await window.db.update('facturas', facturaIdActual, { estado_factura: 'CREDITO' })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear la cuenta por cobrar: ' + (resCxC.error || ''), life: 4000 })
      }
    }

    if (!esCotizacion.value) {
      if (editandoFactura?.id) {
        await sincronizarInventarioEdicionFactura(productosOriginalesEditandoPos.value, cart.value, invoiceNo, fechaStr, horaStr)
      } else if (!ventaAtomica) {
      if (comp && comp.tipo !== 'SIN') {
        await window.db.update('comprobantes_fiscales', comp.id, {
          secuencia_actual: (comp.secuencia_actual || 1) + 1,
        })
        comp.secuencia_actual = (comp.secuencia_actual || 1) + 1
      }

      for (const item of expandirItemsInventario(cart.value)) {
        if (item.tipo === 'imei' && item.imei_id) {
          await window.db.update('imei', item.imei_id, {
            estado: 'VENDIDO',
            comprador: clienteSeleccionado.value?.nombre?.toUpperCase() || 'CONSUMIDOR FINAL',
            no_factura: invoiceNo,
            precio_vendido: item.precio,
            fecha_venta: fechaStr,
            hora_venta: horaStr,
          })
          sincronizarImeiVendido(item.imei_id, {
            estado: 'VENDIDO',
            comprador: clienteSeleccionado.value?.nombre?.toUpperCase() || 'CONSUMIDOR FINAL',
            no_factura: invoiceNo,
            precio_vendido: item.precio,
            fecha_venta: fechaStr,
            hora_venta: horaStr,
          })
        }

        if (item.tipo === 'serial' && item.serial_id) {
          await window.db.update('serial', item.serial_id, {
            estado: 'VENDIDO',
            comprador: clienteSeleccionado.value?.nombre?.toUpperCase() || 'CONSUMIDOR FINAL',
            no_factura: invoiceNo,
            precio_vendido: item.precio,
            fecha_venta: fechaStr,
            hora_venta: horaStr,
          })
        }

        if (item.tipo === 'accesorio' && item.accesorio_id) {
          const acc = accesorios.value.find((a: any) => a.id === item.accesorio_id)
          if (acc) {
            const nuevoStock = Math.max(0, (acc.cantidad || 0) - item.cantidad)
            await window.db.update('accesorios', item.accesorio_id, { cantidad: nuevoStock })
            acc.cantidad = nuevoStock
          }
        }
      }
      } else {
        if (comp && comp.tipo !== 'SIN') comp.secuencia_actual = (comp.secuencia_actual || 1) + 1
        for (const item of expandirItemsInventario(cart.value)) {
          if (item.tipo === 'imei' && item.imei_id) {
            sincronizarImeiVendido(item.imei_id, {
              estado: 'VENDIDO', comprador: clienteSeleccionado.value?.nombre?.toUpperCase() || 'CONSUMIDOR FINAL',
              no_factura: invoiceNo, precio_vendido: item.precio, fecha_venta: fechaStr, hora_venta: horaStr,
            })
          }
        }
      }
    }

    confirmPago.value = false
    ticketInvoiceNo.value = invoiceNo

    const alanubeDocumentStampUrl = getAlanubeDocumentStampUrl(alanubeResponse)
    const alanubeSecurityCode = getAlanubeSecurityCode(alanubeResponse)
    const qrUrl = alanubeDocumentStampUrl || `https://tmposrd.com/factura/${invoiceNo}`
    let qrDataUrl = ''
    try {
      qrDataUrl = await QRCode.toDataURL(qrUrl, { width: 120, margin: 1, color: { dark: '#000000', light: '#ffffff' } })
    } catch (_) {}

    ticketData.value = {
      no_factura: invoiceNo,
      ncf: facturaData.ncf,
      tipo_factura: esCotizacion.value ? 'COTIZACION' : 'FACTURA_VENTA',
      tipo_comprobante: facturaData.tipo_comprobante,
      fecha: `${fechaStr} ${horaStr}`,
      cliente: (clienteExpress.value || clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL').toUpperCase(),
      telefono: clienteSeleccionado.value?.telefono || clienteSeleccionado.value?.whatsapp || '',
      items: JSON.parse(JSON.stringify(cartConComision.value.map((item: any) => {
        const i = { ...item }
        i.codigo = i.codigo || i.codigo_barra || i.cod_producto || i.sku || i.accesorio_id || i.imei || i.serial || ''
        i.codigo_barra = i.codigo_barra || i.codigo || ''
        delete i.precioOriginal
        return i
      }))),
      subtotal: subtotal.value,
      descuento: descuento.value,
      impuesto: impuestoMonto.value,
      impuesto_incluido: impuestoIncluido.value,
      total: total.value,
      nota: (nota.value.trim() + (notaCreditoUsada.value ? ' | ' + notaCreditoUsada.value : '')).toUpperCase(),
      metodo_pago: metodoPago.value,
      efectivo: String(metodoPago.value).toLowerCase() === 'mixto' ? Number(mixtoEfectivo.value) || 0 : metodoPago.value === 'EFECTIVO' ? total.value : 0,
      tarjeta: String(metodoPago.value).toLowerCase() === 'mixto' ? montoTarjetaMixtoTotal.value : metodoPago.value === 'TARJETA' ? total.value : 0,
      transferencia: String(metodoPago.value).toLowerCase() === 'mixto' ? totalTransferenciasMixto() : metodoPago.value === 'TRANSFERENCIA' ? total.value : 0,
      cheque: String(metodoPago.value).toLowerCase() === 'mixto' ? Number(mixtoCheque.value) || 0 : metodoPago.value === 'CHEQUE' ? total.value : 0,
      banco_nombre: needsBankSelection.value ? bancosPos.value.find((b: any) => b.id === bancoPosSeleccionado.value)?.nombre : '',
      tarjeta_mixta: String(metodoPago.value).toLowerCase() === 'mixto' ? detalleTarjetaMixta.value : null,
      transferencias_mixtas: String(metodoPago.value).toLowerCase() === 'mixto'
        ? transferenciasMixto.value
            .filter((t) => Number(t.monto || 0) > 0)
            .map((t) => ({
              banco_id: t.banco_id,
              banco_nombre: bancoNombrePos(t.banco_id),
              monto: Number(t.monto || 0),
            }))
        : [],
      document_stamp_url: alanubeDocumentStampUrl,
      codigo_seguridad: alanubeSecurityCode,
      alanube_id: alanubeResponse?.id || '',
      alanube_status: alanubeResponse?.status || '',
      alanube_legal_status: alanubeResponse?.legalStatus || '',
      alanube_pdf: alanubeResponse?.pdf || '',
      alanube_xml: alanubeResponse?.xml || '',
      empresa: {
        nombre: empresaNombre.value,
        rnc: empresaRnc.value,
        telefono: empresaTelefono.value,
        direccion: empresaDireccion.value,
        email: empresaEmail.value,
        logo: empresaLogo.value,
      },
      qr: qrDataUrl,
    }

    if (esCotizacion.value) {
      toast.add({
        severity: 'success',
        summary: editandoFactura?.id ? 'Cotizacion actualizada' : 'Cotizacion creada',
        detail: `Cotizacion ${invoiceNo}`,
        life: 2000,
      })
      if (ticketData.value) {
        await asegurarQrFiscalTicket()
        facturaPdfRef.value?.printFactura(ticketData.value)
      }
      nota.value = ''
      limpiarCarrito()
      await cargarImeisDisponibles()
      return
    }

    const cobrandoFacturaPendiente = Boolean(editandoFactura?.id && String(editandoFactura.estado_factura || '').toUpperCase() === 'PENDIENTE')
    if (!ventaAtomica && (!editandoFactura?.id || cobrandoFacturaPendiente) && String(metodoPago.value).toLowerCase() === 'mixto' && totalTransferenciasMixto() > 0) {
      try {
        await asegurarTablaBancosFactCoti()
        for (const transferencia of transferenciasMixto.value) {
          const monto = Number(transferencia.monto || 0)
          if (!monto || !transferencia.banco_id) continue
          const banco = bancosPos.value.find((b: any) => Number(b.id) === Number(transferencia.banco_id))
          if (!banco) continue
          const saldoAnterior = Number(banco.saldo || 0)
          await window.db.update('bancos', banco.id, {
            saldo: saldoAnterior + monto,
            fecha_transaccion: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
          banco.saldo = saldoAnterior + monto
        }
      } catch (_) {}
    } else if (!ventaAtomica && needsBankSelection.value && bancoPosSeleccionado.value && (!editandoFactura?.id || cobrandoFacturaPendiente)) {
      try {
        const banco = bancosPos.value.find((b: any) => b.id === bancoPosSeleccionado.value)
        if (banco) {
          const saldoAnterior = Number(banco.saldo || 0)
          await asegurarTablaBancosFactCoti()
          await window.db.update('bancos', banco.id, {
            saldo: saldoAnterior + Number(total.value),
            fecha_transaccion: new Date().toISOString(),
            updated_at: new Date().toISOString(),
          })
        }
      } catch (_) {}
    }

    toast.add({
      severity: 'success',
      summary: esNuevaPendienteVendedor ? 'Factura enviada a Caja' : cobrandoFacturaPendiente ? 'Factura cobrada' : editandoFactura?.id ? 'Factura actualizada' : 'Venta completada',
      detail: esNuevaPendienteVendedor ? `Factura ${invoiceNo} pendiente de cobro` : `Factura ${invoiceNo}`,
      life: 4000,
    })

    if (!esCotizacion.value && !editandoFactura?.id) {
      try {
        const totalVenta = Number(total.value)
        if (auth.user?.nombre) {
          await (window as any).electron.invoke('db:insert', 'comisiones', {
            factura_id: facturaIdActual, no_factura: invoiceNo,
            vendedor: auth.user.nombre, vendedor_id: auth.user.id || 0,
            total_venta: totalVenta, porcentaje: 0, monto: 0,
            estado: 'PENDIENTE', almacen_id: almacenStore.activeId || 0, almacen_uid: almacenStore.activeUid || '',
          })
        }
      } catch (_) {}
      if (!esNuevaPendienteVendedor) {
        await asegurarQrFiscalTicket()
        dialogPrintChoice.value = true
      }
    }
    nota.value = ''
    limpiarCarrito()
    await cargarImeisDisponibles()
    if (!esCotizacion.value) {
      await encolarSync(invoiceNo, ticketData.value)
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al completar venta', life: 4000 })
  } finally {
    guardando.value = false
  }
}

async function encolarSync(invoiceNo: string, _data: any) {
  try {
    const configRes = await window.db.getAll('servidor_sync_config')
    const config = configRes.success && configRes.data?.length > 0 ? configRes.data[0] : null
    if (!config || !config.activo) return
    const facturaRes = await window.db.getAll('facturas')
    if (!facturaRes.success || !facturaRes.data) return
    const factura = facturaRes.data.find((f: any) => f.no_factura === invoiceNo)
    if (!factura) return
    const payload = JSON.stringify(factura)
    await window.db.insert('sync_queue', { tipo: 'factura', no_factura: invoiceNo, datos: payload, created_at: new Date().toISOString(), estado: 'pendiente' })
    await sincronizarItem({ no_factura: invoiceNo, datos: payload, tipo: 'factura' }, config)
  } catch (_) {}
}

async function sincronizarImeiVendido(imeiId: number, datos: any) {
  try {
    const cfgRes = await window.db.getAll('servidor_sync_config')
    const cfg = cfgRes.success && cfgRes.data?.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.activo) return
    const tablasSync: string[] = cfg.tablas_sync ? JSON.parse(cfg.tablas_sync) : []
    if (!tablasSync.includes('imei')) return
    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)
    const imeiRes = await window.db.getById('imei', imeiId)
    if (!imeiRes.success || !imeiRes.data) return
    const imei = imeiRes.data
    const empresaRes = await window.db.getAll('empresa')
    const almacen = (empresaRes.success && empresaRes.data?.[0]?.nombre) || ''
    const campos = ['id','almacen','imei','estado','fecha','equipo','proveedor','id_equi','costo','precio_venta','factura','no_compra','fecha_venta','hora_venta','comprador','detalles','usuario','created_at','updated_at','identificadordb','marca','modelo','preciocompra','precioventa','vendedor','cedula','telefono','direccion','nota','precio_compra','precio_min','precio_xmayor','ganancia','no_factura','bateria','capacidad']
    const enviar: Record<string, any> = {
      almacen, imei: String(imei.nombre || ''), estado: 'VENDIDO',
      fecha: new Date().toLocaleDateString(systemLocale.value), equipo: '', proveedor: String(imei.proveedor || ''),
      id_equi: String(imei.id_equi || ''), costo: String(imei.costo || '0'),
      precio_venta: String(datos.precio_vendido || imei.precio_venta || '0'),
      factura: String(datos.no_factura || ''), no_compra: String(imei.no_compra || ''),
      fecha_venta: String(datos.fecha_venta || ''), hora_venta: String(datos.hora_venta || ''),
      comprador: String(datos.comprador || ''), detalles: '', usuario: '', marca: '', modelo: '',
      preciocompra: String(imei.costo || '0'), precioventa: String(datos.precio_vendido || imei.precio_venta || '0'),
      vendedor: '', cedula: '', telefono: '', direccion: '', nota: String(imei.nota || ''),
      precio_compra: String(imei.costo || '0'), precio_min: String(imei.precio_min || '0'),
      precio_xmayor: String(imei.precio_xmayor || '0'), ganancia: '',
      no_factura: String(datos.no_factura || ''), bateria: String(imei.bateria || ''),
      capacidad: String(imei.capacidad || ''),
    }
    for (const key of Object.keys(enviar)) { if (!campos.includes(key)) delete enviar[key] }
    if (Object.keys(enviar).length === 0) return
    const existeRes = await fetch(`${baseUrl}/datoscampo/imei/imei/${encodeURIComponent(imei.nombre || '')}`, { method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token } })
    let servidorId: string | null = null
    if (existeRes.ok) {
      try { const d = await existeRes.json(); const e = Array.isArray(d) ? d[0] : d?.data || d; if (e?.id) servidorId = String(e.id) } catch {}
    }
    if (servidorId) { enviar.id = servidorId; await fetch(`${baseUrl}/actualizarcampos/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token }, body: JSON.stringify(enviar) }) }
    else { await fetch(`${baseUrl}/insertar/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token }, body: JSON.stringify(enviar) }) }
  } catch {}
}

async function sincronizarItem(item: any, config: any) {
  try {
    const baseUrl = String(config.servidor_url || '').replace(/\/+$/, '') + (String(config.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = config.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)

    const camposRes = await fetch(`${baseUrl}/campos/${item.tipo === 'factura' ? 'facturas' : item.tipo}`, {
      method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token },
    })
    if (!camposRes.ok) return
    const camposArr = await camposRes.json()
    const campos: string[] = (Array.isArray(camposArr) ? camposArr : []).map((c: any) => typeof c === 'string' ? c : (c.nombre || c.field || c.Field || ''))

    let datos: any = item.datos
    if (typeof datos === 'string') try { datos = JSON.parse(datos) } catch {}

    if (datos.productos && typeof datos.productos === 'string') {
      try { JSON.parse(datos.productos); } catch { datos.productos = JSON.stringify(datos.productos) }
    } else if (datos.productos && typeof datos.productos !== 'string') {
      datos.productos = JSON.stringify(datos.productos)
    }
    if (datos.otro && typeof datos.otro !== 'string') {
      datos.otro = JSON.stringify(datos.otro)
    }

    const enviar: Record<string, any> = {}
    for (const campo of campos) {
      if (campo === 'id') continue
      if (datos[campo] !== undefined && datos[campo] !== null && datos[campo] !== '') {
        enviar[campo] = String(datos[campo])
      }
    }

    const existeRes = await fetch(`${baseUrl}/datoscampo/facturas/no_factura/${encodeURIComponent(datos.no_factura || '')}`, {
      method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token },
    })
    let servidorId: string | null = null
    if (existeRes.ok) {
      try {
        const existeData = await existeRes.json()
        const existente = Array.isArray(existeData) ? existeData[0] : existeData?.data || existeData
        if (existente?.id) servidorId = String(existente.id)
      } catch {}
    }

    let syncRes: Response
    if (servidorId) {
      enviar.id = servidorId
      syncRes = await fetch(`${baseUrl}/actualizarcampos/facturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    } else {
      syncRes = await fetch(`${baseUrl}/insertar/facturas`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    }
    if (syncRes.ok) {
      const queueRes = await window.db.getAll('sync_queue')
      if (queueRes.success && queueRes.data) {
        const pendiente = queueRes.data.find((q: any) => q.no_factura === item.no_factura && q.estado === 'pendiente')
        if (pendiente) await window.db.update('sync_queue', pendiente.id, { estado: 'sincronizado' })
      }
    } else {
      const texto = await syncRes.text().catch(() => '')
      const queueRes = await window.db.getAll('sync_queue')
      if (queueRes.success && queueRes.data) {
        const pendiente = queueRes.data.find((q: any) => q.no_factura === item.no_factura && q.estado === 'pendiente')
        if (pendiente) await window.db.update('sync_queue', pendiente.id, { error: texto.slice(0, 500) })
      }
    }
  } catch (_) {}
}

const atajosDisponibles = ref<any[]>([])

const refrescarInventarioPos = () => {
  void Promise.all([cargarProductos(), cargarImeisDisponibles()])
}

onMounted(async () => {
  // Los productos y sus contadores deben cargarse despues de resolver el
  // almacen activo; el filtro prioriza almacen_uid y conserva compatibilidad
  // con registros antiguos que solo tengan almacen_id.
  await almacenActivoStore.load()
  window.addEventListener('ventas-config-changed', aplicarConfigVentas)
  window.addEventListener('inventory-changed', refrescarInventarioPos)
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || ''
      api.value = datosJSON.VITE_LINK_API || ''
      token.value = datosJSON.VITE_TOKEN || ''
    }
  } catch (error) {
    console.error('Error cargando configuracion:', error)
  }

  const shortcuts = useAtajosTeclado({
  'ctrl+k': () => { spotlight.abrirSpotlight(systemMode.isGeneralStore ? [] : telefonos.value, accesorios.value, clientes.value) },
    'ctrl+n': () => { abrirProductoPersonalizado(); sonidos.playClick() },
    'ctrl+l': () => { if (cart.value.length > 0) { limpiarCarrito(); sonidos.playClick() } },
    'ctrl+d': () => { abrirDialogDescuento(); sonidos.playClick() },
    'ctrl+s': () => { if (cart.value.length > 0) { confirmarVenta(); sonidos.playClick() } },
    'ctrl+p': () => { if (cart.value.length > 0) { abrirCambiarPrecio(cart.value[0], 0); sonidos.playClick() } },
    'ctrl+h': () => { holdearVenta() },
    'f2': () => { document.querySelector<HTMLInputElement>('input[placeholder*="Buscar producto"]')?.focus() },
    'f3': () => { dialogCliente.value = true; sonidos.playClick() },
    'f4': () => { if (cart.value.length > 0) { confirmarVenta(); sonidos.playClick() } },
    'f5': () => { sonidos.playClick() },
    'f6': () => { abrirDialogDescuento(); sonidos.playClick() },
    'f7': () => { abrirProductoPersonalizado(); sonidos.playClick() },
    'f8': () => { abrirFatCoti(); sonidos.playClick() },
    'f9': () => { if (cart.value.length > 0) { limpiarCarrito(); sonidos.playClick() } },
    'f10': () => { ventaExpress(); sonidos.playClick() },
    'f12': () => { dialogAyudaAtajos.value = !dialogAyudaAtajos.value },
    'escape': () => { if (lockScreen.isLocked) return; sonidos.playClick() },
  })
  atajosDisponibles.value = shortcuts.atajosDisponibles

  barcodeCleanup.value = barcodeEntry.iniciarEscuchaBarcode(
    (code: string) => {
      sonidos.playScan()
      const imeiMatch = imeisDisponibles.value.find((i: any) => i.nombre?.trim() === code)
      if (imeiMatch) {
        const tel = telefonoDeImei(imeiMatch)
        if (tel) {
          imeiParaPrecio.value = imeiMatch
          selectedTelefono.value = tel
          selectedElectrodomestico.value = null
          precioSeleccionado.value = 'venta'
          precioManual.value = imeiMatch.precio_venta || 0
          agregarImeiAlCarrito()
          return
        }
      }
      const serialMatch = serialesDisponibles.value.find((i: any) => i.nombre?.trim() === code)
      if (serialMatch) {
        const elec = equipoDeSerial(serialMatch)
        if (elec) {
          imeiParaPrecio.value = serialMatch
          selectedElectrodomestico.value = elec
          selectedTelefono.value = null
          precioSeleccionado.value = 'venta'
          precioManual.value = serialMatch.precio_venta || 0
          agregarImeiAlCarrito()
          return
        }
      }
      const accMatch = accesorios.value.find((a: any) => String(a.id) === code)
      if (accMatch && (accMatch.cantidad || 0) > 0) {
        agregarAccesorio(accMatch)
        return
      }
      busquedaProd.value = code
      toast.add({ severity: 'info', summary: 'Codigo no encontrado', detail: `"${code}" no encontrado en inventario`, life: 3000 })
    }
  )

  loading.value = true
  await Promise.all([cargarProductos(), cargarImeisDisponibles()])
  await cargarEstado()

  try {
    const res = await window.db.getAll('impresoras_config')
    if (res.success && res.data?.length > 0) {
      ticketConfig.value = { ...ticketConfig.value, ...res.data[0] }
      printerName.value = ticketConfig.value.printer_name || ''
    }
  } catch (_) {}

  try {
    const resEmp = await window.db.getAll('empresa')
    if (resEmp.success && resEmp.data?.length > 0) {
      const uid = String(almacenActivoStore.activeUid || '')
      const e = (uid && resEmp.data.find((item: any) => String(item.uid || item.almacen_uid || '') === uid)) || resEmp.data[0]
      empresaNombre.value = e.nombre || 'MI EMPRESA'
      empresaRnc.value = e.legal || ''
      empresaTelefono.value = e.telefono || ''
      empresaDireccion.value = e.direccion || ''
      empresaEmail.value = e.email || ''
      empresaLogo.value = e.logo || ''
      empresaTipoDoc.value = e.tipo_documento_defecto || ''
    }
  } catch (_) {}

  await Promise.all([cargarConfigFacturacionElectronica(), cargarColumnasCards()])

  try {
    const resComp = await window.db.getAll('comprobantes_fiscales')
    if (resComp.success) {
      comprobantes.value = (resComp.data || []).filter((c: any) => c.activo)

      const tipoDocMap: Record<string, string> = {
        SIN_COMPROBANTE: 'SIN',
        FACTURA_CONSUMO: 'E32',
        FACTURA_CREDITO: 'E31',
        NOTA_DEBITO: 'E33',
        NOTA_CREDITO: 'E34',
        PROFORMA: 'SIN',
        TICKET: 'SIN',
      }
      const tipoDefecto = empresaTipoDoc.value || ''
      const compTipoDefecto = tipoDocMap[tipoDefecto]
      const compDefecto = compTipoDefecto
        ? comprobantes.value.find((c: any) => c.tipo === compTipoDefecto)
        : null

      if (facturacionElectronicaActiva.value) {
        seleccionarComprobanteDisponible()
      } else {
        const defaultComp = comprobantes.value.find((c: any) => String(c.tipo || '').toUpperCase() === 'SIN') || compDefecto || comprobantes.value.find((c: any) => c.es_default)
        if (defaultComp) comprobanteSeleccionado.value = defaultComp
        else if (comprobantes.value.length > 0) comprobanteSeleccionado.value = comprobantes.value[0]
      }
    }
  } catch (_) {}

  try {
    const resMP = await (window as any).electron.invoke('db:getAll', 'metodos_pago')
    if (resMP.success && resMP.data) metodosPagoDB.value = resMP.data
  } catch (_) {}

  loading.value = false

  if (!noFactura.value) noFactura.value = generarNoFactura()

  if (ventaExpressPendiente.value) {
    ventaExpressPendiente.value = false
    metodoPago.value = 'EFECTIVO'
    montoRecibido.value = total.value
    await completarVenta()
  }

  try { await caja.verificarTurno() } catch {}
  const facturaPendienteId = Number(localStorage.getItem('tmpos_factura_pendiente_cobrar') || 0)
  if (facturaPendienteId > 0) {
    localStorage.removeItem('tmpos_factura_pendiente_cobrar')
    try {
      const facturaRes = await window.db.getById('facturas', facturaPendienteId)
      if (facturaRes.success && facturaRes.data && esFacturaPendiente(facturaRes.data)) {
        registroFatCotiSeleccionado.value = facturaRes.data
        await cobrarFacturaPendiente()
      } else {
        toast.add({ severity: 'warn', summary: 'Factura no disponible', detail: 'La factura ya fue cobrada o eliminada', life: 3000 })
      }
    } catch (error: any) {
      toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar la factura pendiente', life: 3000 })
    }
  }
  try { await miniDashboard.cargarDashboard() } catch {}
  try { stockAlertas.setTelefonos(systemMode.isGeneralStore ? [] : telefonos.value); await stockAlertas.verificarStockBajo(accesorios.value, systemMode.isGeneralStore ? [] : imeisDisponibles.value, serialesDisponibles.value) } catch {}
})

onUnmounted(() => {
  window.removeEventListener('ventas-config-changed', aplicarConfigVentas)
  window.removeEventListener('inventory-changed', refrescarInventarioPos)
  if (busquedaProdTimer) clearTimeout(busquedaProdTimer)
  if (barcodeCleanup.value) barcodeCleanup.value()
  customerDisplay.cerrarPantallaCliente()
})

watch([total, metodoPago, clienteSeleccionado, montoRecibido], () => {
  customerDisplay.actualizarDisplay(cart.value, total.value, metodoPago.value, clienteSeleccionado.value?.nombre || 'CONSUMIDOR FINAL', montoRecibido.value, cambio.value)
})

function abrirDialogDescuento() {
  descuentoValor.value = descuentoTipo.value === 'porcentaje' ? descuentoPorc.value : descuentoFijo.value
  notaCreditoSeleccionada.value = null
  cargarNotasCreditoCliente()
  dialogDescuento.value = true
}

async function cargarNotasCreditoCliente() {
  const clienteNombre = (clienteSeleccionado.value?.nombre || clienteExpress.value || '').toUpperCase().trim()
  const clienteId = clienteSeleccionado.value?.id ? String(clienteSeleccionado.value.id) : ''
  console.log('[NC] clienteNombre:', clienteNombre, 'clienteId:', clienteId)
  if (!clienteNombre && !clienteId) { notasCreditoCliente.value = []; return }
  try {
    const res = await window.db.getAll('facturas')
    if (res.success) {
      const todasNC = (res.data || []).filter((f: any) => f.tipo_factura === 'NOTA_CREDITO')
      console.log('[NC] total NC en DB:', todasNC.length, todasNC.map(f => ({ id: f.id, no: f.no_factura, cliente: f.nombre_cliente, cod: f.cod_cliente, estado: f.estado_factura })))
      notasCreditoCliente.value = todasNC.filter((f: any) =>
        f.estado_factura === 'PENDIENTE' &&
        (
          (clienteId && String(f.cod_cliente || '') === clienteId) ||
          (clienteNombre && String(f.nombre_cliente || '').toUpperCase() === clienteNombre)
        )
      )
      console.log('[NC] filtradas:', notasCreditoCliente.value.length, notasCreditoCliente.value.map(f => ({ id: f.id, no: f.no_factura })))
    }
  } catch (e) { console.error('[NC] error:', e); notasCreditoCliente.value = [] }
}

function seleccionarNotaCredito(nota: any) {
  notaCreditoSeleccionada.value = nota
  descuentoTipo.value = 'nota_credito'
  descuentoValor.value = Number(nota.total) || 0
}

async function aplicarDescuento() {
  if (descuentoTipo.value === 'nota_credito' && notaCreditoSeleccionada.value) {
    descuentoFijo.value = Math.min(subtotal.value, Math.max(0, descuentoValor.value))
    notaCreditoUsada.value = `NC: ${notaCreditoSeleccionada.value.no_factura} - ${systemCurrency.value}${formatCurrency(descuentoFijo.value)}`
    console.log('[NC] Aplicando descuento NC, notaCreditoUsada:', notaCreditoUsada.value)
    await window.db.update('facturas', notaCreditoSeleccionada.value.id, { estado_factura: 'UTILIZADA' })
    console.log('[NC] NC marcada como UTILIZADA')
  } else if (descuentoTipo.value === 'porcentaje') {
    descuentoPorc.value = Math.min(100, Math.max(0, descuentoValor.value))
    descuentoFijo.value = 0
  } else {
    descuentoFijo.value = Math.min(subtotal.value, Math.max(0, descuentoValor.value))
    descuentoPorc.value = 0
  }
  dialogDescuento.value = false
}

function quitarDescuento() {
  descuentoFijo.value = 0
  descuentoPorc.value = 0
  descuentoValor.value = 0
  descuentoTipo.value = 'fijo'
  notaCreditoSeleccionada.value = null
  notaCreditoUsada.value = ''
  dialogDescuento.value = false
}

function cambiarSeleccionTodosDevolucion(event: Event) {
  devoluciones.seleccionarTodosProductos(Boolean((event.target as HTMLInputElement)?.checked))
}

const actionCardColors: Record<string, { bg: string; border: string }> = {
  amber: { bg: 'rgba(120, 53, 15, 0.22)', border: 'rgba(245, 158, 11, 0.45)' },
  emerald: { bg: 'rgba(6, 78, 59, 0.24)', border: 'rgba(16, 185, 129, 0.42)' },
  sky: { bg: 'rgba(12, 74, 110, 0.24)', border: 'rgba(14, 165, 233, 0.42)' },
  blue: { bg: 'rgba(30, 64, 175, 0.22)', border: 'rgba(59, 130, 246, 0.42)' },
  red: { bg: 'rgba(127, 29, 29, 0.22)', border: 'rgba(239, 68, 68, 0.42)' },
  green: { bg: 'rgba(20, 83, 45, 0.22)', border: 'rgba(34, 197, 94, 0.42)' },
  purple: { bg: 'rgba(88, 28, 135, 0.22)', border: 'rgba(168, 85, 247, 0.42)' },
  cyan: { bg: 'rgba(21, 94, 117, 0.22)', border: 'rgba(6, 182, 212, 0.42)' },
  teal: { bg: 'rgba(17, 94, 89, 0.22)', border: 'rgba(20, 184, 166, 0.42)' },
  pink: { bg: 'rgba(131, 24, 67, 0.22)', border: 'rgba(236, 72, 153, 0.42)' },
  gray: { bg: 'rgba(51, 65, 85, 0.36)', border: 'rgba(148, 163, 184, 0.35)' },
}

function actionCardStyle(color: string) {
  if (!themeStore.isDark) return {}
  const cfg = actionCardColors[color] || actionCardColors.gray
  return {
    backgroundColor: cfg.bg,
    borderColor: cfg.border,
    color: '#e5e7eb',
  }
}

const productCardColors: Record<string, { bg: string; border: string; backBg: string; backBorder: string }> = {
  telefono: {
    bg: 'rgba(76, 29, 149, 0.20)',
    border: 'rgba(139, 92, 246, 0.40)',
    backBg: 'rgba(46, 16, 101, 0.34)',
    backBorder: 'rgba(167, 139, 250, 0.45)',
  },
  accesorio: {
    bg: 'rgba(6, 78, 59, 0.20)',
    border: 'rgba(16, 185, 129, 0.38)',
    backBg: 'rgba(6, 78, 59, 0.32)',
    backBorder: 'rgba(52, 211, 153, 0.45)',
  },
  electrodomestico: {
    bg: 'rgba(21, 94, 117, 0.20)',
    border: 'rgba(6, 182, 212, 0.38)',
    backBg: 'rgba(22, 78, 99, 0.34)',
    backBorder: 'rgba(103, 232, 249, 0.45)',
  },
}

function productCardStyle(tipo: 'telefono' | 'accesorio' | 'electrodomestico', side: 'front' | 'back' = 'front') {
  const cfg = productCardColors[tipo]
  if (themeStore.isDark) {
    return {
      backgroundColor: side === 'back' ? cfg.backBg : cfg.bg,
      borderColor: side === 'back' ? cfg.backBorder : cfg.border,
      color: '#e5e7eb',
    }
  }
  if (tipo === 'telefono') return { backgroundColor: '#f5f3ff', borderColor: '#ddd6fe' }
  if (tipo === 'accesorio') return { backgroundColor: '#ecfdf5', borderColor: '#bbf7d0' }
  return { backgroundColor: '#ecfeff', borderColor: '#a5f3fc' }
}
</script>

<template>
  <div class="h-full flex flex-col">
    <Toast />

    <div class="flex-1 flex flex-col lg:flex-row gap-4 min-h-0">
      <div class="flex-1 min-w-0 flex flex-col">
        <div class="relative rounded-xl border border-surface-200/50 dark:border-surface-700/30 bg-surface-0 dark:bg-surface-800 flex flex-col flex-1 min-h-0">
          <div class="p-4 pb-0">
            <div class="flex items-center gap-2 mb-4">
              <div class="relative flex-1">
                <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-sm"></i>
                <InputText v-model="busquedaProd" placeholder="Buscar producto, IMEI, serial o codigo..." fluid class="!pl-9 h-10 !pr-9" @keyup.enter="buscarImei" />
                <button
                  v-if="busquedaProd"
                  class="absolute right-1 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md text-surface-400 hover:text-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 transition-colors cursor-pointer"
                  @click="busquedaProd = ''"
                >
                  <i class="pi pi-times text-xs"></i>
                </button>
              </div>
              <Button label="Express" icon="pi pi-bolt" severity="warning" text size="small" class="flex-shrink-0 h-10 font-bold" @click="abrirProductoPersonalizado" />
              <Button
                :label="ocultarSinStock ? 'Con Stock' : 'Todo'"
                :icon="ocultarSinStock ? 'pi pi-eye' : 'pi pi-eye-slash'"
                :severity="ocultarSinStock ? 'primary' : 'secondary'"
                text
                size="small"
                class="flex-shrink-0 h-10"
                @click="ocultarSinStock = !ocultarSinStock"
              />
              <Select
                :modelValue="columnasCards"
                :options="opcionesColumnasCards"
                class="!w-[112px] !h-10 flex-shrink-0 [&>div]:!py-0 [&>div]:!px-2"
                aria-label="Tarjetas por fila"
                @update:modelValue="guardarColumnasCards"
              >
                <template #value="{ value }">
                  <div class="flex items-center gap-1.5 text-xs font-semibold whitespace-nowrap">
                    <i class="pi pi-table text-primary"></i>
                    <span>{{ value }} por fila</span>
                  </div>
                </template>
                <template #option="{ option }">
                  <div class="flex items-center gap-2 text-sm">
                    <i class="pi pi-table text-surface-400"></i>
                    <span>{{ option }} tarjetas</span>
                  </div>
                </template>
              </Select>
              <span class="text-xs text-surface-400 whitespace-nowrap">{{ cantidadResultadosPos }} resultados</span>
            </div>

            <SelectButton v-model="activeTab" :options="tabOptions" optionLabel="label" optionValue="value" :allowEmpty="false" fluid class="mb-4">
              <template #option="{ option }">
                <div class="flex items-center gap-1.5">
                  <i :class="option.icon" class="text-base"></i>
                  <span>{{ option.label }}</span>
                </div>
              </template>
            </SelectButton>
          </div>

          <div
            ref="productosScrollRef"
            class="pos-products-scroll flex-1 overflow-y-auto overflow-x-hidden px-4 pb-4 min-h-0"
            :style="{ background: themeStore.isDark ? '#1a1a2e' : '#ffffff' }"
            @scroll="manejarScrollProductos"
          >
            <div v-if="loading" class="flex items-center justify-center py-20 text-surface-400 gap-2">
              <i class="pi pi-spin pi-spinner text-lg"></i>
              <span>Cargando...</span>
            </div>

            <div v-else-if="busquedaGlobalActiva">
              <div class="flex items-center gap-2 mb-3 text-xs text-surface-500 dark:text-surface-400">
                <i class="pi pi-search"></i>
                <span>Buscando en celulares, IMEI, electrodomésticos, seriales y {{ systemMode.isGeneralStore ? 'productos' : 'accesorios' }}</span>
              </div>
              <div v-if="resultadosBusquedaGlobal.length === 0" class="flex flex-col items-center justify-center py-20 text-surface-300 gap-2">
                <i class="pi pi-search text-4xl"></i>
                <span class="text-sm">No se encontraron productos, IMEI ni seriales</span>
              </div>
              <div v-else class="pos-product-grid grid gap-2.5" :style="{ '--pos-card-columns': columnasCards }">
                <button
                  v-for="resultado in resultadosBusquedaGlobal"
                  :key="resultado.key"
                  type="button"
                  class="min-h-[150px] rounded-xl border p-3.5 flex flex-col gap-2 text-left transition-all hover:-translate-y-0.5 hover:shadow-md cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
                  :style="productCardStyle(
                    resultado.type === 'telefono' || resultado.type === 'imei'
                      ? 'telefono'
                      : resultado.type === 'accesorio' ? 'accesorio' : 'electrodomestico'
                  )"
                  :disabled="resultado.type === 'accesorio' && Number(resultado.item.cantidad || 0) <= 0"
                  @click="resultado.type === 'imei'
                    ? seleccionarImeiDirecto(resultado.item)
                    : resultado.type === 'serial'
                      ? seleccionarSerialDirecto(resultado.item)
                      : resultado.type === 'telefono'
                        ? abrirVariantes(resultado.item)
                        : resultado.type === 'electrodomestico'
                          ? abrirVariantesSerial(resultado.item)
                          : agregarAccesorio(resultado.item)"
                >
                  <div class="flex items-start justify-between gap-2">
                    <span
                      class="w-10 h-10 rounded-xl text-white flex items-center justify-center shadow-sm shrink-0"
                      :class="resultado.type === 'telefono' || resultado.type === 'imei'
                        ? 'bg-violet-500'
                        : resultado.type === 'accesorio' ? 'bg-emerald-500' : 'bg-cyan-500'"
                    >
                      <i :class="resultado.type === 'telefono' || resultado.type === 'imei' ? 'pi pi-mobile' : resultado.type === 'accesorio' ? 'pi pi-box' : 'pi pi-sitemap'"></i>
                    </span>
                    <span class="text-[10px] font-bold uppercase tracking-wide px-2 py-1 rounded-full bg-surface-0/70 dark:bg-surface-900/40">
                      {{ resultado.type === 'telefono' ? 'Celular' : resultado.type === 'electrodomestico' ? 'Electrodoméstico' : resultado.type }}
                    </span>
                  </div>
                  <template v-if="resultado.type === 'imei' || resultado.type === 'serial'">
                    <h4 class="font-semibold text-sm leading-snug truncate text-surface-900 dark:text-surface-50">{{ resultado.parent?.nombre || (resultado.type === 'imei' ? 'Celular' : 'Electrodoméstico') }}</h4>
                    <span class="font-mono text-xs break-all text-surface-600 dark:text-surface-300">{{ resultado.item.nombre || resultado.item.imei || resultado.item.serial }}</span>
                    <div class="flex items-center justify-between gap-2 mt-auto">
                      <span class="text-[11px] text-surface-400 truncate">{{ resultado.item.capacidad || resultado.item.color || 'Unidad disponible' }}</span>
                      <span class="font-bold text-sm text-primary shrink-0">{{ formatMoney(resultado.item.precio_venta || 0) }}</span>
                    </div>
                  </template>
                  <template v-else>
                    <h4 class="font-semibold text-sm leading-snug line-clamp-2 text-surface-900 dark:text-surface-50">{{ resultado.item.nombre }}</h4>
                    <p class="text-[11px] text-surface-400 truncate">
                      {{ resultado.item.codigo_barra || resultado.item.codigo || resultado.item.marca_nombre || resultado.item.modelo || `#${resultado.item.id}` }}
                    </p>
                    <div class="flex items-center justify-between gap-2 mt-auto">
                      <span v-if="resultado.type === 'telefono'" class="text-[11px] text-surface-500">
                        {{ imeisDisponibles.filter(i => imeiPerteneceTelefono(i, resultado.item)).length }} disponibles
                      </span>
                      <span v-else-if="resultado.type === 'electrodomestico'" class="text-[11px] text-surface-500">
                        {{ serialesDisponibles.filter(i => serialPerteneceEquipo(i, resultado.item)).length }} disponibles
                      </span>
                      <span v-else class="text-[11px] text-surface-500">Stock: {{ resultado.item.cantidad || 0 }}</span>
                      <span v-if="resultado.type === 'accesorio'" class="font-bold text-sm text-emerald-600 dark:text-emerald-400 shrink-0">
                        {{ formatMoney(resultado.item.precio_venta || 0) }}
                      </span>
                    </div>
                  </template>
                </button>
              </div>
            </div>

            <div v-else-if="activeTab === 'celulares'">
              <div v-if="productosFiltrados.length === 0" class="flex flex-col items-center justify-center py-20 text-surface-300 gap-2">
                <i class="pi pi-mobile text-4xl"></i>
                <span class="text-sm">No se encontraron telefonos</span>
              </div>
              <div v-else class="pos-product-grid grid gap-2.5" :style="{ '--pos-card-columns': columnasCards }">
                <div
                  v-for="tel in productosFiltrados"
                  :key="tel.id"
                  class="flip-card perspective-[1000px]"
                >
                  <div
                    class="flip-inner relative transition-transform duration-500 cursor-pointer"
                    :class="flippedTelId === tel.id ? '[transform:rotateY(180deg)]' : ''"
                    style="transform-style: preserve-3d; min-height: 160px;"
                  >
                    <!-- FRONT -->
                    <div
                      class="pos-product-card pos-product-card--phone group absolute inset-0 rounded-2xl border flex overflow-hidden backface-hidden"
                      @click="abrirVariantes(tel)"
                      @contextmenu.prevent="() => { flippedTelId = flippedTelId === tel.id ? null : tel.id; imeiSearch = '' }"
                    >
                      <div class="pos-product-media pos-product-media--phone w-[42%] min-w-[110px] h-full shrink-0">
                        <img v-if="getImageUrl(tel.imagen)" :src="getImageUrl(tel.imagen)" class="w-full h-full object-contain p-2.5 transition-transform duration-300 group-hover:scale-105" alt="" />
                        <div v-else class="w-full h-full bg-gradient-to-br from-violet-400 to-indigo-600 flex items-center justify-center">
                          <i class="pi pi-mobile text-white text-4xl drop-shadow-sm"></i>
                        </div>
                        <span class="pos-product-type">Celular</span>
                        <span class="pos-product-stock">
                          {{ imeisDisponibles.filter(i => imeiPerteneceTelefono(i, tel)).length }} disp.
                        </span>
                      </div>
                      <div class="pos-product-content flex-1 min-w-0 p-3.5 flex flex-col">
                        <span class="pos-product-eyebrow">Seleccionar equipo</span>
                        <h4 class="pos-product-name font-bold text-[15px] leading-snug line-clamp-2 mt-2">{{ tel.nombre }}</h4>
                        <div class="pos-product-details flex gap-1.5 mt-2">
                          <span v-if="resumenTelefonoCatalogo(tel).capacidades" class="pos-product-detail-chip" :title="resumenTelefonoCatalogo(tel).capacidades">
                            <i class="pi pi-database"></i>{{ resumenTelefonoCatalogo(tel).capacidades }}
                          </span>
                          <span v-if="resumenTelefonoCatalogo(tel).colores" class="pos-product-detail-chip" :title="resumenTelefonoCatalogo(tel).colores">
                            <i class="pi pi-palette"></i>{{ resumenTelefonoCatalogo(tel).colores }}
                          </span>
                        </div>
                        <div class="mt-auto pt-2 flex items-end justify-between gap-2">
                          <div v-if="resumenTelefonoCatalogo(tel).precioMayor > 0">
                            <span class="block text-[9px] font-bold uppercase tracking-wider text-surface-400">Precio mayor</span>
                            <span class="pos-product-price font-extrabold text-violet-600 dark:text-violet-300 whitespace-nowrap">{{ formatMoney(resumenTelefonoCatalogo(tel).precioMayor) }}</span>
                          </div>
                          <span class="ml-auto text-[10px] font-medium text-surface-400">#{{ tel.id }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- BACK: IMEIs disponibles -->
                    <div
                      class="absolute inset-0 rounded-xl border border-violet-300 dark:border-violet-600 bg-surface-0 dark:bg-surface-800 p-3 flex flex-col gap-2 backface-hidden overflow-y-auto [transform:rotateY(180deg)]"
                      :style="productCardStyle('telefono', 'back')"
                      @contextmenu.prevent="flippedTelId = null"
                    >
                      <div class="flex items-center justify-between shrink-0">
                        <h4 class="pos-product-name font-semibold text-xs truncate">{{ tel.nombre }}</h4>
                        <Button icon="pi pi-times" severity="secondary" text rounded size="small" class="!w-6 !h-6 !text-[10px]" @click="flippedTelId = null" />
                      </div>
                      <div class="relative shrink-0">
                        <i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
                        <input v-model="imeiSearch" placeholder="Buscar IMEI..." class="w-full h-7 pl-7 pr-2 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-700/50 outline-none focus:border-primary" @click.stop />
                      </div>
                      <div v-if="imeisDelTel(tel.id).length === 0" class="text-[11px] text-surface-400 text-center py-4">No hay IMEIs disponibles</div>
                      <div
                        v-for="imei in imeisDelTel(tel.id)"
                        :key="imei.id"
                        class="flex items-start justify-between gap-2 py-1.5 px-2 rounded-lg transition-colors text-xs"
                        :class="imeiEstaEnCarrito(imei)
                          ? 'bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-700 dark:text-amber-300 cursor-not-allowed'
                          : 'bg-surface-50 dark:bg-surface-700/50 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer'"
                        @click="!imeiEstaEnCarrito(imei) && (flippedTelId = null, seleccionarImeiDirecto(imei))"
                      >
                        <span class="min-w-0 flex flex-col flex-1">
                          <span class="font-mono font-medium truncate">{{ imei.nombre }}</span>
                          <span class="text-[10px] font-semibold text-violet-600 dark:text-violet-300 truncate">
                            Cap: {{ getCapacidadImei(imei) || 'Sin capacidad' }}
                          </span>
                        </span>
                        <span v-if="imeiEstaEnCarrito(imei)" class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 dark:bg-amber-900/40 shrink-0">En carrito</span>
                        <span v-else-if="imei.precio_venta" class="text-primary font-semibold shrink-0 ml-2">{{ formatMoney(imei.precio_venta) }}</span>
                      </div>
                      <p class="text-[9px] text-surface-400 text-center mt-auto shrink-0">Click derecho para volver</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeTab === 'electrodomesticos'">
              <div v-if="productosFiltrados.length === 0" class="flex flex-col items-center justify-center py-20 text-surface-300 gap-2">
                <i class="pi pi-sitemap text-4xl"></i>
                <span class="text-sm">No se encontraron electrodomesticos</span>
              </div>
              <div v-else class="pos-product-grid grid gap-2.5" :style="{ '--pos-card-columns': columnasCards }">
                <div
                  v-for="elec in productosFiltrados"
                  :key="elec.id"
                  class="flip-card perspective-[1000px]"
                >
                  <div
                    class="flip-inner relative transition-transform duration-500 cursor-pointer"
                    :class="flippedElecId === elec.id ? '[transform:rotateY(180deg)]' : ''"
                    style="transform-style: preserve-3d; min-height: 160px;"
                  >
                    <!-- FRONT -->
                    <div
                      class="pos-product-card pos-product-card--electro group absolute inset-0 rounded-2xl border flex overflow-hidden backface-hidden"
                      @click="abrirVariantesSerial(elec)"
                      @contextmenu.prevent="() => { flippedElecId = flippedElecId === elec.id ? null : elec.id; elecSearch = '' }"
                    >
                      <div class="pos-product-media pos-product-media--electro w-[42%] min-w-[110px] h-full shrink-0">
                        <img v-if="getImageUrl(elec.imagen)" :src="getImageUrl(elec.imagen)" class="w-full h-full object-contain p-2.5 transition-transform duration-300 group-hover:scale-105" alt="" />
                        <div v-else class="w-full h-full bg-gradient-to-br from-cyan-400 to-sky-600 flex items-center justify-center">
                          <i class="pi pi-sitemap text-white text-4xl drop-shadow-sm"></i>
                        </div>
                        <span class="pos-product-type">Electro</span>
                        <span class="pos-product-stock">
                          {{ serialesDisponibles.filter(i => serialPerteneceEquipo(i, elec)).length }} disp.
                        </span>
                      </div>
                      <div class="pos-product-content flex-1 min-w-0 p-3.5 flex flex-col">
                        <span class="pos-product-eyebrow">Seleccionar serial</span>
                        <h4 class="pos-product-name font-bold text-[15px] leading-snug line-clamp-2 mt-2">{{ elec.nombre }}</h4>
                        <div class="pos-product-details flex gap-1.5 mt-2">
                          <span v-if="resumenEquipoCatalogo(elec).capacidades" class="pos-product-detail-chip" :title="resumenEquipoCatalogo(elec).capacidades">
                            <i class="pi pi-database"></i>{{ resumenEquipoCatalogo(elec).capacidades }}
                          </span>
                          <span v-if="resumenEquipoCatalogo(elec).colores" class="pos-product-detail-chip" :title="resumenEquipoCatalogo(elec).colores">
                            <i class="pi pi-palette"></i>{{ resumenEquipoCatalogo(elec).colores }}
                          </span>
                        </div>
                        <div class="mt-auto pt-2 flex items-end justify-between gap-2">
                          <div v-if="resumenEquipoCatalogo(elec).precioMayor > 0">
                            <span class="block text-[9px] font-bold uppercase tracking-wider text-surface-400">Precio mayor</span>
                            <span class="pos-product-price font-extrabold text-cyan-600 dark:text-cyan-300 whitespace-nowrap">{{ formatMoney(resumenEquipoCatalogo(elec).precioMayor) }}</span>
                          </div>
                          <span class="ml-auto text-[10px] font-medium text-surface-400">#{{ elec.id }}</span>
                        </div>
                      </div>
                    </div>

                    <!-- BACK: seriales disponibles -->
                    <div
                      class="absolute inset-0 rounded-xl border border-cyan-300 dark:border-cyan-600 bg-surface-0 dark:bg-surface-800 p-3 flex flex-col gap-2 backface-hidden overflow-y-auto [transform:rotateY(180deg)]"
                      :style="productCardStyle('electrodomestico', 'back')"
                      @contextmenu.prevent="flippedElecId = null"
                    >
                      <div class="flex items-center justify-between shrink-0">
                        <h4 class="pos-product-name font-semibold text-xs truncate">{{ elec.nombre }}</h4>
                        <Button icon="pi pi-times" severity="secondary" text rounded size="small" class="!w-6 !h-6 !text-[10px]" @click="flippedElecId = null" />
                      </div>
                      <div class="relative shrink-0">
                        <i class="pi pi-search absolute left-2 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
                        <input v-model="elecSearch" placeholder="Buscar serial..." class="w-full h-7 pl-7 pr-2 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-700/50 outline-none focus:border-primary" @click.stop />
                      </div>
                      <div v-if="serialesDelElec(elec.id).length === 0" class="text-[11px] text-surface-400 text-center py-4">No hay seriales disponibles</div>
                      <div
                        v-for="serial in serialesDelElec(elec.id)"
                        :key="serial.id"
                        class="flex items-center justify-between py-1.5 px-2 rounded-lg bg-surface-50 dark:bg-surface-700/50 hover:bg-primary-50 dark:hover:bg-primary-900/20 cursor-pointer transition-colors text-xs"
                        @click="flippedElecId = null; seleccionarSerialDirecto(serial)"
                      >
                        <span class="font-mono font-medium truncate">{{ serial.nombre }}</span>
                        <span v-if="serial.precio_venta" class="text-primary font-semibold shrink-0 ml-2">{{ formatMoney(serial.precio_venta) }}</span>
                      </div>
                      <p class="text-[9px] text-surface-400 text-center mt-auto shrink-0">Click derecho para volver</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div v-else-if="activeTab === 'acciones'">
              <div class="rounded-xl border border-surface-200/70 dark:border-surface-700/50 bg-surface-50 dark:bg-surface-800 p-4 min-h-[220px]">
                <div class="flex items-center justify-between gap-3 mb-4">
                  <div>
                    <h3 class="font-bold text-base">Acciones</h3>
                    <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                      Botones rapidos del POS.
                    </p>
                  </div>
                  <div class="w-10 h-10 rounded-xl bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center">
                    <i class="pi pi-bolt text-amber-600 dark:text-amber-300 text-xl"></i>
                  </div>
                </div>

                <div class="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('amber')" @click="abrirFatCoti">
                    <span class="w-14 h-14 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-file-edit text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Fact-Coti</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Facturas y cotizaciones</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('emerald')" @click="abrirRecibirEquipo">
                    <span class="w-14 h-14 rounded-2xl bg-emerald-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-download text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Recibir equipo</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Trade-in y nota de credito</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-sky-200 dark:border-sky-800 bg-sky-50 dark:bg-sky-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('sky')" @click="abrirOrdenTallerPos">
                    <span class="w-14 h-14 rounded-2xl bg-sky-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-wrench text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Orden taller</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Crear reparacion</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('blue')" @click="holdRecall.abrirHolds()">
                    <span class="w-14 h-14 rounded-2xl bg-blue-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-pause-circle text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Hold/Recall</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Retener o recuperar venta</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('red')" @click="dev.dialogDevolucion = true; devoluciones.cargarFacturas()">
                    <span class="w-14 h-14 rounded-2xl bg-red-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-undo text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Devoluciones</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Notas de crédito y devolución</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('green')" @click="combos.dialogSeleccionarCombo = true">
                    <span class="w-14 h-14 rounded-2xl bg-green-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-th-large text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Combos</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Paquetes y combos</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-purple-200 dark:border-purple-800 bg-purple-50 dark:bg-purple-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('purple')" @click="caja.verificarTurno(); caja.dialogAperturaCaja = true">
                    <span class="w-14 h-14 rounded-2xl bg-purple-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-dollar text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Caja</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Apertura/cierre de caja</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50 dark:bg-cyan-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('cyan')" @click="miniDashboard.toggleDashboard()">
                    <span class="w-14 h-14 rounded-2xl bg-cyan-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-chart-bar text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Dashboard</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Ventas del día</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-teal-200 dark:border-teal-800 bg-teal-50 dark:bg-teal-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('teal')" @click="customerDisplay.abrirPantallaCliente(cart, total, metodoPago, clienteSeleccionado?.nombre || 'CONSUMIDOR FINAL', montoRecibido, cambio)">
                    <span class="w-14 h-14 rounded-2xl bg-teal-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-desktop text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Cliente</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Pantalla para el cliente</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-pink-200 dark:border-pink-800 bg-pink-50 dark:bg-pink-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('pink')" @click="stockAlertas.abrirAlertas()">
                    <span class="w-14 h-14 rounded-2xl bg-pink-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-exclamation-triangle text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Alertas</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Stock bajo</span>
                    </span>
                  </button>

                  <button type="button" class="pos-action-card group aspect-square rounded-2xl border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-950 p-4 flex flex-col items-center justify-center text-center gap-3 shadow-sm hover:shadow-md hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer" :style="actionCardStyle('gray')" @click="dialogAyudaAtajos = true">
                    <span class="w-14 h-14 rounded-2xl bg-gray-500 text-white flex items-center justify-center shadow-sm group-hover:scale-105 transition-transform"><i class="pi pi-question-circle text-2xl"></i></span>
                    <span class="flex flex-col gap-0.5">
                      <span class="font-bold text-sm text-surface-900 dark:text-surface-50">Atajos</span>
                      <span class="text-[11px] leading-tight text-surface-500 dark:text-surface-400">Teclas rápidas (F12)</span>
                    </span>
                  </button>
                </div>
              </div>
            </div>

            <div v-else-if="activeTab === 'accesorios'">
              <div v-if="productosFiltrados.length === 0" class="flex flex-col items-center justify-center py-20 text-surface-300 gap-2">
                <i class="pi pi-box text-4xl"></i>
                <span class="text-sm">No se encontraron {{ systemMode.isGeneralStore ? 'productos' : 'accesorios' }}</span>
              </div>
              <div v-else class="pos-product-grid grid gap-2.5" :style="{ '--pos-card-columns': columnasCards }">
                <div
                  v-for="acc in productosFiltrados"
                  :key="acc.id"
                  class="flip-card perspective-[1000px]"
                  :class="(acc.cantidad || 0) <= 0 ? 'opacity-50' : ''"
                >
                  <div
                    class="flip-inner relative transition-transform duration-500 cursor-pointer"
                    :class="flippedAccId === acc.id ? '[transform:rotateY(180deg)]' : ''"
                    style="transform-style: preserve-3d; min-height: 160px;"
                  >
                    <!-- FRONT -->
                    <div
                      class="pos-product-card pos-product-card--accessory group absolute inset-0 rounded-2xl border flex overflow-hidden backface-hidden"
                      @click="(acc.cantidad || 0) > 0 && agregarAccesorio(acc)"
                      @contextmenu.prevent="() => { flippedAccId = flippedAccId === acc.id ? null : acc.id }"
                    >
                      <div class="pos-product-media pos-product-media--accessory w-[42%] min-w-[110px] h-full shrink-0">
                        <img v-if="getImageUrl(acc.imagen)" :src="getImageUrl(acc.imagen)" class="w-full h-full object-contain p-2.5 transition-transform duration-300 group-hover:scale-105" alt="" />
                        <div v-else class="w-full h-full bg-gradient-to-br from-emerald-400 to-emerald-600 flex items-center justify-center">
                          <i class="pi pi-box text-white text-4xl drop-shadow-sm"></i>
                        </div>
                        <span class="pos-product-type">Producto</span>
                        <span class="pos-product-stock" :class="(acc.cantidad || 0) <= 0 ? '!bg-red-500' : ''">
                          Stock: {{ acc.cantidad || 0 }}
                        </span>
                      </div>
                      <div class="pos-product-content flex-1 min-w-0 p-3.5 flex flex-col">
                        <span class="pos-product-eyebrow">Venta directa</span>
                        <h4 class="pos-product-name font-bold text-[15px] leading-snug line-clamp-2 mt-2">{{ acc.nombre }}</h4>
                        <p v-if="acc.marca_nombre" class="text-[11px] text-surface-400 truncate mt-1">{{ acc.marca_nombre }}</p>
                        <div class="mt-auto pt-2">
                          <span class="block text-[9px] font-bold uppercase tracking-wider text-surface-400 mb-1">Precio de venta</span>
                          <div>
                            <span class="pos-product-price min-w-0 font-extrabold text-[15px] text-emerald-600 dark:text-emerald-400 whitespace-nowrap">{{ formatMoney(acc.precio_venta || 0) }}</span>
                          </div>
                        </div>
                      </div>
                    </div>

                    <!-- BACK -->
                    <div
                      class="absolute inset-0 rounded-xl border border-emerald-300 dark:border-emerald-600 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 backface-hidden overflow-y-auto [transform:rotateY(180deg)]"
                      :style="productCardStyle('accesorio', 'back')"
                      @contextmenu.prevent="flippedAccId = null"
                    >
                      <div class="flex items-center justify-between">
                        <h4 class="pos-product-name font-semibold text-sm truncate">{{ acc.nombre }}</h4>
                        <Button icon="pi pi-times" severity="secondary" text rounded size="small" class="!w-6 !h-6 !text-[10px]" @click="flippedAccId = null" />
                      </div>
                      <div class="grid grid-cols-2 gap-2 text-xs flex-1">
                        <div class="flex flex-col gap-0.5 p-2 rounded-lg bg-surface-50 dark:bg-surface-700/50">
                          <span class="text-[9px] font-semibold text-surface-500 uppercase">Venta</span>
                          <span class="font-bold text-emerald-600">{{ formatMoney(acc.precio_venta || 0) }}</span>
                        </div>
                        <div class="flex flex-col gap-0.5 p-2 rounded-lg bg-surface-50 dark:bg-surface-700/50">
                          <span class="text-[9px] font-semibold text-surface-500 uppercase">Stock</span>
                          <span class="font-bold" :class="(acc.cantidad || 0) > 0 ? 'text-blue-600' : 'text-red-500'">{{ acc.cantidad || 0 }}</span>
                        </div>
                        <div v-if="acc.precio_min" class="flex flex-col gap-0.5 p-2 rounded-lg bg-surface-50 dark:bg-surface-700/50">
                          <span class="text-[9px] font-semibold text-surface-500 uppercase">Minimo</span>
                          <span class="font-bold text-orange-500">{{ formatMoney(acc.precio_min) }}</span>
                        </div>
                        <div v-if="acc.precio_xmayor" class="flex flex-col gap-0.5 p-2 rounded-lg bg-surface-50 dark:bg-surface-700/50">
                          <span class="text-[9px] font-semibold text-surface-500 uppercase">x Mayor</span>
                          <span class="font-bold text-green-500">{{ formatMoney(acc.precio_xmayor) }}</span>
                        </div>

                      </div>
                      <p class="text-[9px] text-surface-400 text-center mt-auto">Click derecho para volver</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
          <Transition name="pos-scroll-top">
            <button
              v-if="mostrarBotonArriba"
              type="button"
              class="pos-scroll-top-button absolute right-6 bottom-5 z-20 w-10 h-10 rounded-full bg-primary text-primary-contrast shadow-lg flex items-center justify-center cursor-pointer"
              aria-label="Ir arriba"
              v-tooltip.left="'Ir arriba'"
              @click="irArribaProductos"
            >
              <i class="pi pi-arrow-up text-sm"></i>
            </button>
          </Transition>
        </div>
      </div>

      <div class="w-full lg:w-[380px] xl:w-[420px] flex-shrink-0 flex flex-col" style="min-height: calc(100vh - 160px)">
        <div class="rounded-xl border border-surface-200/50 dark:border-surface-700/30 bg-surface-0 dark:bg-surface-800 flex flex-col shadow-sm flex-1 min-h-0">
          <div class="flex items-center justify-between px-4 py-3 border-b border-surface-200/50 dark:border-surface-700/30">
            <div v-if="isDominicanFiscal" class="flex items-center gap-1.5 min-w-0">
              <div class="min-w-0">
                <div class="text-[11px] font-semibold leading-tight truncate">Facturacion electronica</div>
                <div class="text-[9px] text-surface-500 truncate">
                  {{ facturacionElectronicaActiva ? 'e-CF activo' : 'Factura local' }}
                </div>
              </div>
              <ToggleSwitch
                :modelValue="facturacionElectronicaActiva"
                class="scale-75 origin-center shrink-0 -mx-1"
                @update:modelValue="toggleFacturacionElectronica"
              />
            </div>
            <div v-else class="flex items-center gap-2">
              <i class="pi pi-shopping-cart text-primary text-sm"></i>
              <h3 class="font-bold text-sm">Carrito</h3>
            </div>
            <div class="flex items-center gap-1">
              <span v-if="!conexion.isOnline" class="w-2 h-2 rounded-full bg-red-500" v-tooltip="'Sin conexión'"></span>
              <span v-else class="w-2 h-2 rounded-full bg-green-500" v-tooltip="'En línea'"></span>
              <button class="text-[9px] px-1.5 py-1 rounded transition-colors cursor-pointer" :class="sonidos.sonidoHabilitado ? 'text-green-600 bg-green-50 dark:bg-green-900/20' : 'text-red-500 bg-red-50 dark:bg-red-900/20'" @click="sonidos.toggleSonido()" v-tooltip="'Sonido'">
                <i :class="sonidos.sonidoHabilitado ? 'pi pi-volume-up' : 'pi pi-volume-off'" class="text-xs"></i>
              </button>
              <button class="text-[9px] px-1.5 py-1 rounded transition-colors cursor-pointer text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700" @click="lockScreen.bloquear()" v-tooltip="'Bloquear pantalla'">
                <i class="pi pi-lock text-xs"></i>
              </button>
              <span class="text-xs font-bold bg-primary text-primary-contrast min-w-[22px] h-5 flex items-center justify-center rounded-full px-1.5">{{ cartCount }}</span>
              <button class="text-xs font-bold px-2.5 py-1 rounded-md transition-colors cursor-pointer shrink-0" :class="esCotizacion ? 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300' : 'bg-primary text-primary-contrast'" @click="esCotizacion = !esCotizacion" v-tooltip="esCotizacion ? 'Cotizacion' : 'Factura'">{{ esCotizacion ? 'COT' : 'FAC' }}</button>
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" class="!w-7 !h-7" :disabled="cart.length === 0" @click="limpiarCarrito" v-tooltip="'Limpiar carrito'" />
            </div>
          </div>

          <div class="px-4 py-3 border-b border-surface-200/50 dark:border-surface-700/30 bg-surface-50 dark:bg-surface-700/20">
            <div class="grid grid-cols-3 gap-2">
              <div>
                <label class="text-[10px] font-semibold uppercase tracking-wide text-surface-500 block mb-1">Cliente</label>
                <div v-if="clienteSeleccionado" class="flex items-center gap-1">
                  <div class="flex-1 text-[11px] p-1.5 rounded-md bg-surface-0 dark:bg-surface-700 border border-surface-200/50 dark:border-surface-600/30 leading-tight truncate">
                    <p class="font-medium truncate">{{ clienteSeleccionado.nombre }}</p>
                    <p class="text-surface-400 truncate">{{ clienteSeleccionado.telefono || 'Sin telefono' }}</p>
                  </div>
                  <Button icon="pi pi-times" severity="secondary" text rounded size="small" class="!w-6 !h-6 flex-shrink-0" @click="clienteSeleccionado = null; dialogCliente = false" v-tooltip="'Quitar cliente'" />
                  <Button icon="pi pi-pencil" severity="secondary" text rounded size="small" class="!w-6 !h-6 flex-shrink-0" @click="dialogCliente = true" v-tooltip="'Cambiar cliente'" />
                </div>
                <Button
                  v-else
                  label="Cliente"
                  icon="pi pi-user"
                  severity="secondary"
                  outlined
                  size="small"
                  class="w-full h-7 text-[10px]"
                  @click="dialogCliente = true"
                />
              </div>
              <div>
                <label class="text-[10px] font-semibold uppercase tracking-wide text-surface-500 block mb-1">Pago</label>
                <Select v-model="metodoPago" :options="metodosPago" optionLabel="label" optionValue="value" class="!h-8 [&>div]:!py-0 [&>div]:!px-1.5" fluid>
                  <template #value="{ value }">
                    <div class="flex items-center h-full w-full">
                      <span class="inline-flex items-center gap-1 px-1.5 rounded text-[9px] font-semibold leading-tight" :class="pagoBadge(value)">{{ value }}</span>
                    </div>
                  </template>
                  <template #option="{ option }">
                    <div class="flex items-center gap-2 px-1 py-1">
                      <i :class="pagoIcon(option.value)" class="text-sm"></i>
                      <span>{{ option.label }}</span>
                    </div>
                  </template>
                </Select>
              </div>
              <div>
                <label class="text-[10px] font-semibold uppercase tracking-wide text-surface-500 block mb-1">Comp.</label>
                <Select
                  v-model="comprobanteSeleccionado"
                  :options="comprobantesDisponibles"
                  optionLabel="nombre"
                  placeholder="..."
                  class="!h-8 [&>div]:!py-0 [&>div]:!px-1.5"
                  fluid
                >
                  <template #value="{ value }">
                    <div v-if="value" class="flex items-center h-full w-full gap-1">
                      <span class="text-[8px] font-bold px-1 rounded leading-tight" :class="compBadge(value.tipo)">{{ value.tipo }}</span>
                      <span class="text-[9px] truncate leading-tight">{{ value.nombre }}</span>
                    </div>
                    <span v-else class="text-[9px] text-surface-400 leading-tight">Sel.</span>
                  </template>
                  <template #option="{ option }">
                    <div class="flex items-center gap-2 py-0.5">
                      <span class="text-[8px] font-bold px-1.5 py-0.5 rounded" :class="compBadge(option.tipo)">{{ option.tipo }}</span>
                      <div class="min-w-0">
                        <span class="text-[10px] truncate block">{{ option.nombre }}</span>
                        <span v-if="option.tipo !== 'SIN'" class="text-[8px] text-surface-400 font-mono">{{ option.prefijo || option.tipo }}{{ formatSecuenciaComprobante(option) }}</span>
                      </div>
                    </div>
                  </template>
                </Select>
              </div>
            </div>
          </div>

          <div v-if="facturaEditandoPos" class="mx-4 mt-3 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-xs text-amber-700 dark:text-amber-300 flex items-center justify-between gap-2">
            <span>
              Editando factura <strong>{{ facturaEditandoPos.no_factura || facturaEditandoPos.id }}</strong>
            </span>
            <Button label="Cancelar" severity="warning" text size="small" class="!text-xs" @click="limpiarCarrito" />
          </div>

          <div v-if="cart.length === 0" class="flex flex-col items-center justify-center flex-1 text-surface-300 dark:text-surface-500 gap-2">
            <i class="pi pi-shopping-cart text-3xl"></i>
            <span class="text-xs">Carrito vacio</span>
            <span class="text-[10px] text-surface-400">Selecciona productos para vender</span>
          </div>
          <div v-else class="flex flex-col gap-1 px-4 py-2.5 flex-1 overflow-y-auto min-h-0 bg-surface-0 dark:bg-surface-800">
            <div
              v-for="(item, index) in cartConComision"
              :key="index"
              class="group flex items-start gap-2 p-2 rounded-lg border border-transparent hover:border-surface-200/60 dark:hover:border-surface-600/40 hover:bg-surface-50 dark:hover:bg-surface-700/40 transition-colors"
              :class="item.tipo === 'imei' && Number(item.cantidad || 1) > 1 ? 'cursor-pointer' : ''"
              @click="abrirGestionImeis(item, index)"
            >
              <div class="w-7 h-7 rounded-md flex items-center justify-center flex-shrink-0 mt-0.5 shadow-xs"
                :class="item.tipo === 'imei' ? 'bg-violet-500' : item.tipo === 'serial' ? 'bg-cyan-500' : 'bg-emerald-500'">
                <i :class="item.tipo === 'imei' ? 'pi pi-mobile' : item.tipo === 'serial' ? 'pi pi-sitemap' : 'pi pi-box'" class="text-white text-[10px]"></i>
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-start justify-between gap-1">
                  <p class="text-xs font-medium leading-tight truncate text-surface-900 dark:text-surface-50">{{ item.nombre }}</p>
                  <Button icon="pi pi-times" severity="danger" text rounded size="small" class="!w-5 !h-5 !text-[9px] opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0 -mt-0.5 -mr-1" @click.stop="quitarDelCarrito(index)" />
                </div>
                <div v-if="itemTieneDescuento(item)" class="flex items-center gap-1.5 mt-0.5 text-[10px] leading-tight">
                  <span class="text-surface-400 line-through">{{ formatMoney(getPrecioNormal(item)) }}</span>
                  <span class="font-bold text-emerald-600 dark:text-emerald-400">{{ formatMoney(item.precio) }}</span>
                  <span class="rounded bg-emerald-50 px-1 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">Con descuento</span>
                </div>
                    <p v-if="systemMode.isCellphoneStore && (item.imei || item.imeis?.length)" class="text-[10px] text-surface-400 font-mono truncate leading-tight">
                  IMEI: {{ (item.imeis?.length ? item.imeis : [item.imei]).filter(Boolean).join(', ') }}
                  <button v-if="Number(item.cantidad || 1) === 1" class="text-primary hover:underline ml-1 font-semibold" @click.stop="abrirCambiarImei(item, index)">cambiar</button>
                  <span v-else class="text-primary font-semibold ml-1">click para gestionar</span>
                </p>
                <p v-if="item.serial || item.seriales?.length" class="text-[10px] text-surface-400 font-mono truncate leading-tight">Serial: {{ (item.seriales?.length ? item.seriales : [item.serial]).filter(Boolean).join(', ') }}</p>
                <p v-if="item.color || item.capacidad" class="text-[10px] text-surface-400 leading-tight">{{ [item.color, item.capacidad].filter(Boolean).join(' - ') }}</p>
                <div class="flex items-center justify-between mt-1">
                  <div class="flex items-center gap-1">
                    <span v-if="item.tipo === 'accesorio'" class="inline-flex items-center rounded-md border border-surface-200/50 dark:border-surface-600/30 overflow-hidden">
                      <button class="w-6 h-6 flex items-center justify-center text-xs font-bold text-surface-600 dark:text-surface-300 bg-surface-0 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer" @click.stop="disminuirCantidad(index)">−</button>
                      <span class="w-7 h-6 flex items-center justify-center text-[11px] font-bold bg-primary-50 dark:bg-primary-900/20 text-primary border-x border-surface-200/50 dark:border-surface-600/30">{{ item.cantidad }}</span>
                      <button class="w-6 h-6 flex items-center justify-center text-xs font-bold text-surface-600 dark:text-surface-300 bg-surface-0 dark:bg-surface-800 hover:bg-surface-100 dark:hover:bg-surface-700 cursor-pointer" @click.stop="aumentarCantidad(index)">+</button>
                    </span>
                    <span v-else class="text-[10px] text-surface-400">{{ item.cantidad }} x</span>
                    <span
                      class="text-[10px] text-primary font-semibold cursor-pointer hover:underline"
                      @click.stop="abrirCambiarPrecio(item, index)"
                      v-tooltip="'Click para cambiar precio'"
                    >{{ formatMoney(item.precio) }}</span>
                  </div>
                  <span class="text-xs font-bold text-surface-900 dark:text-surface-50">{{ formatMoney(item.precio * item.cantidad) }}</span>
                </div>
              </div>
            </div>
          </div>

          <div
            class="pos-cart-summary sticky bottom-0 z-20 border-t border-surface-200/50 dark:border-surface-700/50 rounded-b-xl shadow-[0_-8px_20px_-16px_rgba(15,23,42,0.45)]"
            :style="{ '--pos-cart-summary-bg': themeStore.isDark ? '#1f2937' : '#ffffff' }"
          >
            <div class="hidden lg:block px-4 py-2.5 space-y-1 border-b border-surface-200/50 dark:border-surface-700/30">
              <div class="flex justify-between text-xs"><span class="text-surface-500">Subtotal</span><span class="font-medium text-surface-800 dark:text-surface-100">{{ formatMoney(subtotal) }}</span></div>
              <div class="flex items-center justify-between gap-2"><span class="text-xs text-surface-500 flex-shrink-0">Descuento</span><Button :label="descuento > 0 ? formatMoney(descuento) : 'Agregar'" :severity="descuento > 0 ? 'warning' : 'secondary'" text size="small" class="!text-xs" @click="abrirDialogDescuento" /></div>
              <div v-if="impuestoIncluido === 0" class="flex justify-between text-xs"><span class="text-surface-500">{{ taxName }} ({{ impuestoPorcentaje }}%)</span><span class="font-medium text-surface-800 dark:text-surface-100">{{ formatMoney(impuestoMonto) }}</span></div>
              <div v-else-if="impuestoIncluido === 1" class="flex justify-between text-xs"><span class="text-surface-400">{{ taxName }} {{ impuestoPorcentaje }}% incl.</span><span class="text-surface-400">&mdash;</span></div>
              <div v-else class="flex justify-between text-xs"><span class="text-surface-400">{{ taxName }}</span><span class="text-surface-400">Sin impuesto</span></div>
            </div>
            <div class="flex items-center justify-between px-3 py-2 lg:px-4 border-b border-surface-200/50 dark:border-surface-700/30">
              <div class="flex items-center gap-3"><span class="text-xs lg:text-sm font-bold text-surface-900 dark:text-surface-50">Total</span><span class="text-sm lg:text-base font-bold text-primary">{{ formatMoney(total) }}</span></div>
              <div class="flex items-center gap-1">
                <Button v-if="cart.length > 0" icon="pi pi-pause-circle" severity="info" text rounded size="small" class="!w-7 !h-7" @click="holdearVenta()" v-tooltip="'Hold (Ctrl+H)'" />
                <Button icon="pi pi-desktop" severity="secondary" text rounded size="small" class="!w-7 !h-7 hidden lg:inline-flex" @click="customerDisplay.abrirPantallaCliente(cart, total, metodoPago, clienteSeleccionado?.nombre || 'CONSUMIDOR FINAL', montoRecibido, cambio)" v-tooltip="'Pantalla cliente'" />
                <Button label="Completar" icon="pi pi-check-circle" class="!py-1.5 !text-xs lg:!py-2.5 lg:!text-sm shadow-md" :disabled="cart.length === 0" @click="confirmarVenta" />
              </div>
            </div>
            <div class="lg:hidden flex items-center gap-2 px-3 py-1.5">
              <div class="flex-1 flex items-start gap-1.5">
                <i class="pi pi-pencil text-surface-400 text-[9px] mt-1"></i>
                <div class="flex-1 min-w-0"><NotasComp v-model="nota" /></div>
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="nota = ''" :disabled="!nota" v-tooltip="'Limpiar nota'" class="!w-5 !h-5 !text-[9px]" />
              </div>
              <Button icon="pi pi-tag" severity="secondary" text rounded size="small" class="!w-5 !h-5 !text-[9px]" @click="abrirDialogDescuento" v-tooltip="'Descuento'" />
            </div>
          </div>
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="dialogVariantes"
      :header="selectedTelefono?.nombre || selectedElectrodomestico?.nombre || 'Seleccionar Variante'"
      modal
      :style="{ width: 'min(45rem, 95vw)' }"
    >
      <div class="flex flex-col gap-4">
        <div v-if="getImageUrl(selectedTelefono?.imagen)" class="w-full flex items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/70 p-3">
          <div class="w-20 h-20 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 shrink-0">
            <img :src="getImageUrl(selectedTelefono?.imagen)" class="w-full h-full object-cover" alt="" />
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-sm truncate">{{ selectedTelefono?.nombre }}</p>
            <p class="text-xs text-surface-500">{{ variantesFiltradas.length }} IMEI disponibles</p>
          </div>
        </div>
        <div class="w-full min-w-0 space-y-3">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busquedaImei" :placeholder="selectedTelefono ? 'Buscar por IMEI, color o capacidad...' : 'Buscar por Serial, color o capacidad...'" fluid />
          </IconField>

        <DataTable
          v-if="variantesFiltradas.length > 0"
          :value="variantesFiltradas"
          stripedRows
          paginator
          :rows="8"
          :rowsPerPageOptions="[8, 15, 25]"
          dataKey="id"
          scrollable
          responsiveLayout="scroll"
          :rowClass="varianteRowClass"
          @row-click="abrirPrecio($event.data)"
        >
          <Column field="nombre" :header="selectedTelefono ? 'IMEI' : 'Serial'" sortable>
            <template #body="{ data }">
              <div class="flex items-center gap-2">
                <span class="font-mono text-xs">{{ data.nombre }}</span>
                <span
                  v-if="selectedTelefono ? imeiEstaEnCarrito(data) : serialEstaEnCarrito(data)"
                  class="text-[9px] font-bold px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300 border border-amber-200 dark:border-amber-800"
                >En carrito</span>
              </div>
            </template>
          </Column>
          <Column field="color" header="Color" sortable />
          <Column field="capacidad" header="Capacidad" sortable />
          <Column header="Venta" sortable style="width: 7rem">
            <template #body="{ data }">
              <span class="font-semibold">{{ formatMoney(data.precio_venta || 0) }}</span>
            </template>
          </Column>
          <Column header="Min" sortable style="width: 6rem">
            <template #body="{ data }">
              <span class="text-surface-500">{{ formatMoney(data.precio_min || 0) }}</span>
            </template>
          </Column>
          <Column header="xMayor" sortable style="width: 6.5rem">
            <template #body="{ data }">
              <span class="text-surface-500">{{ formatMoney(data.precio_xmayor || 0) }}</span>
            </template>
          </Column>
          <Column v-if="puedeVerDetalleImei" header="Costo" style="width: 6rem">
            <template #body="{ data }">
              <span class="text-surface-400 text-xs">{{ formatMoney(data.costo || 0) }}</span>
            </template>
          </Column>

          <template #empty>
            <div class="text-center py-6 text-surface-400">No hay unidades disponibles de este modelo.</div>
          </template>
        </DataTable>

        <div v-else-if="selectedTelefono ? variantesImei.length === 0 : variantesSerial.length === 0" class="text-center py-6 text-surface-400">No hay unidades disponibles de este modelo.</div>
        <div v-else class="text-center py-6 text-surface-400">No hay resultados para la busqueda.</div>
        </div>
      </div>

      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogVariantes = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogPrecio"
      header="Seleccionar Precio"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
    >
      <div class="flex flex-col gap-4">
        <div v-if="getImageUrl(selectedTelefono?.imagen)" class="w-full flex items-center gap-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/70 p-3">
          <div class="w-20 h-20 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 shrink-0">
            <img :src="getImageUrl(selectedTelefono?.imagen)" class="w-full h-full object-cover" alt="" />
          </div>
          <div class="min-w-0">
            <p class="font-semibold text-sm truncate">{{ selectedTelefono?.nombre || selectedElectrodomestico?.nombre }}</p>
            <p class="text-xs text-surface-500 font-mono truncate">{{ selectedTelefono ? 'IMEI:' : 'Serial:' }} {{ imeiParaPrecio?.nombre }}</p>
            <p class="text-xs text-surface-500 truncate">{{ [imeiParaPrecio?.color, imeiParaPrecio?.capacidad].filter(Boolean).join(' / ') }}</p>
          </div>
        </div>
        <div class="w-full min-w-0 space-y-4">
          <div v-if="!getImageUrl(selectedTelefono?.imagen)" class="text-sm bg-surface-50 dark:bg-surface-700/50 p-3 rounded-lg">
            <p class="font-medium">{{ selectedTelefono?.nombre || selectedElectrodomestico?.nombre }}</p>
            <p class="text-surface-400 text-xs font-mono">{{ selectedTelefono ? 'IMEI:' : 'Serial:' }} {{ imeiParaPrecio?.nombre }}</p>
            <p class="text-surface-400 text-xs">{{ imeiParaPrecio?.color }} {{ imeiParaPrecio?.capacidad }}</p>
          </div>

          <Button
            v-if="selectedTelefono && puedeVerDetalleImei"
            label="Ver detalles del IMEI"
            icon="pi pi-eye"
            severity="secondary"
            outlined
            class="w-full"
            @click="abrirDetalleImei"
          />

        <div class="flex flex-col gap-2">
          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioSeleccionado === 'venta'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="precioSeleccionado = 'venta'; precioManual = imeiParaPrecio?.precio_venta || 0; agregarImeiAlCarrito()"
          >
            <div>
              <p class="font-semibold text-sm">Precio Normal</p>
              <p class="text-xs text-surface-400">Precio de venta regular</p>
            </div>
            <span class="font-bold text-lg text-primary">{{ formatMoney(imeiParaPrecio?.precio_venta || 0) }}</span>
          </div>

          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioSeleccionado === 'min'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="precioSeleccionado = 'min'; precioManual = imeiParaPrecio?.precio_min || 0; agregarImeiAlCarrito()"
          >
            <div>
              <p class="font-semibold text-sm">Precio Minimo</p>
              <p class="text-xs text-surface-400">Precio minimo permitido</p>
            </div>
            <span class="font-bold text-lg text-orange-500">{{ formatMoney(imeiParaPrecio?.precio_min || 0) }}</span>
          </div>

          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioSeleccionado === 'xmayor'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="precioSeleccionado = 'xmayor'; precioManual = imeiParaPrecio?.precio_xmayor || 0; agregarImeiAlCarrito()"
          >
            <div>
              <p class="font-semibold text-sm">Precio por Mayor</p>
              <p class="text-xs text-surface-400">Precio para ventas al por mayor</p>
            </div>
            <span class="font-bold text-lg text-green-500">{{ formatMoney(imeiParaPrecio?.precio_xmayor || 0) }}</span>
          </div>

          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioSeleccionado === 'manual'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="precioSeleccionado = 'manual'"
          >
            <div>
              <p class="font-semibold text-sm">Precio Manual</p>
              <p class="text-xs text-surface-400">Ingresar precio personalizado</p>
            </div>
            <InputNumber
              v-if="precioSeleccionado === 'manual'"
              v-model="precioManual"
              :min="0"
              class="w-32"
              @focus="(e) => e.target.select()"
              @click.stop
              fluid
            />
            <span v-else class="text-sm text-surface-400">Click para personalizar</span>
          </div>
        </div>

        <div class="flex justify-between text-lg font-bold border-t border-surface-200/50 dark:border-surface-700/30 pt-3">
          <span>Precio seleccionado</span>
          <span class="text-primary">{{ formatMoney(getPrecioActual()) }}</span>
        </div>
          </div>
        </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogPrecio = false" />
        <Button label="Agregar al Carrito" icon="pi pi-cart-plus" :disabled="getPrecioActual() <= 0" @click="agregarImeiAlCarrito" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogDetalleImei"
      header="Detalles completos del IMEI"
      modal
      :style="{ width: 'min(52rem, 96vw)' }"
      :contentStyle="{ maxHeight: '70vh', overflowY: 'auto' }"
    >
      <div v-if="cargandoDetalleImei" class="flex items-center justify-center gap-2 py-12 text-surface-500">
        <i class="pi pi-spin pi-spinner"></i>
        <span>Cargando informacion...</span>
      </div>
      <div v-else-if="detalleImei" class="space-y-4">
        <div class="flex items-center gap-4 rounded-2xl border border-violet-200/70 dark:border-violet-800/60 bg-violet-50/70 dark:bg-violet-950/25 p-4">
          <div class="w-24 h-24 rounded-2xl overflow-hidden bg-white dark:bg-surface-800 border border-violet-200 dark:border-violet-800 shrink-0 flex items-center justify-center">
            <img v-if="getImageUrl(selectedTelefono?.imagen)" :src="getImageUrl(selectedTelefono?.imagen)" class="w-full h-full object-contain p-2" alt="" />
            <i v-else class="pi pi-mobile text-4xl text-violet-500"></i>
          </div>
          <div class="min-w-0">
            <span class="inline-flex px-2 py-1 rounded-full bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 text-[10px] font-bold uppercase tracking-wide">IMEI</span>
            <h3 class="font-bold text-lg mt-2">{{ selectedTelefono?.nombre }}</h3>
            <p class="font-mono text-sm text-surface-600 dark:text-surface-300 break-all">{{ detalleImei.nombre || detalleImei.imei }}</p>
            <p class="text-xs text-surface-500 mt-1">{{ [detalleImei.color, detalleImei.capacidad].filter(Boolean).join(' / ') || 'Sin variante especificada' }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div
            v-for="campo in camposDetalleImei"
            :key="campo.campo"
            class="rounded-xl border border-surface-200/70 dark:border-surface-700/60 bg-surface-50 dark:bg-surface-800/60 p-3 min-w-0"
          >
            <p class="text-[10px] font-bold uppercase tracking-wide text-surface-400 mb-1">{{ etiquetaCampoImei(campo.campo) }}</p>
            <p class="text-sm font-medium text-surface-800 dark:text-surface-100 break-all">{{ valorCampoImei(campo.campo, campo.valor) }}</p>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cerrar" icon="pi pi-times" severity="secondary" @click="dialogDetalleImei = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogProductoPersonalizado"
      header="Producto No Registrado"
      modal
      :style="{ width: 'min(24rem, 95vw)' }"
      @keyup.enter="agregarProductoPersonalizado"
    >
      <div class="space-y-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre del producto</label>
          <InputText v-model="prodPersonalizado.nombre" placeholder="Ej: Cargador generico" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio ({{ systemCurrency }})</label>
          <InputNumber v-model="prodPersonalizado.precio" :min="0" :minFractionDigits="0" :maxFractionDigits="2" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>
        <div v-if="puedeVerDetalleImei" class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Costo ({{ systemCurrency }}) <span class="text-surface-400 font-normal">opcional</span></label>
          <InputNumber v-model="prodPersonalizado.costo" :min="0" :minFractionDigits="0" :maxFractionDigits="2" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogProductoPersonalizado = false" />
        <Button label="Agregar al Carrito" icon="pi pi-cart-plus" @click="agregarProductoPersonalizado" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCliente"
      header="Seleccionar Cliente"
      modal
      :style="{ width: 'min(30rem, 95vw)' }"
    >
      <div class="space-y-3">
        <InputText v-model="busquedaCliente" placeholder="Buscar por nombre, telefono o RNC..." fluid />

        <div v-if="clientesFiltrados.length === 0" class="text-center py-4 text-surface-400 text-sm">No se encontraron clientes.</div>
        <div v-else class="flex flex-col gap-2 max-h-60 overflow-y-auto">
          <div
            v-for="cliente in clientesFiltrados"
            :key="cliente.id"
            class="flex items-center justify-between p-2.5 rounded-lg border border-surface-200/50 dark:border-surface-700/30 cursor-pointer hover:border-primary-300 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-colors"
            @click="seleccionarCliente(cliente)"
          >
            <div>
              <p class="font-medium text-sm">{{ cliente.nombre }}</p>
              <p class="text-xs text-surface-400">{{ cliente.telefono || 'Sin telefono' }}</p>
            </div>
            <div class="flex items-center gap-1">
              <Button icon="pi pi-history" severity="secondary" text rounded size="small" class="!w-6 !h-6" @click.stop="clienteHistorial.abrirHistorial(cliente.id, cliente.nombre)" v-tooltip="'Ver historial de compras'" />
              <i class="pi pi-chevron-right text-surface-400 text-xs"></i>
            </div>
          </div>
        </div>

        <div class="border-t border-surface-200/50 dark:border-surface-700/30 pt-3">
          <Button label="Nuevo Cliente" icon="pi pi-user-plus" severity="info" text class="w-full" @click="abrirNuevoCliente" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCliente = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogNuevoCliente"
      header="Nuevo Cliente"
      modal
      :style="{ width: 'min(26rem, 95vw)' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre <span class="text-red-400">*</span></label>
          <InputText v-model="nuevoClienteForm.nombre" placeholder="Nombre del cliente" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Telefono</label>
          <InputText v-model="nuevoClienteForm.telefono" placeholder="Telefono" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Documento</label>
          <div class="flex gap-2">
            <SelectButton v-model="rncTipo" :options="['RNC', 'CEDULA']" class="shrink-0" />
            <div class="flex-1 flex gap-1">
              <InputText v-model="nuevoClienteForm.rnc" :placeholder="rncTipo === 'RNC' ? 'RNC' : 'Cedula'" fluid class="flex-1" />
              <Button icon="pi pi-search" severity="info" :loading="buscandoClienteApi" @click="buscarClienteApi" v-tooltip="'Buscar en API'" />
            </div>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Direccion</label>
          <InputText v-model="nuevoClienteForm.direccion" placeholder="Direccion" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevoCliente = false" />
        <Button label="Guardar y Seleccionar" icon="pi pi-check" @click="guardarNuevoCliente" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogMixto"
      header="Pago Mixto"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
    >
      <div class="space-y-4">
        <p class="text-sm text-surface-500">Selecciona los metodos y distribuye el total de <strong>{{ formatMoney(total) }}</strong>:</p>

        <div v-if="mixtoError" class="p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-sm text-red-600 dark:text-red-400">{{ mixtoError }}</div>

        <div class="space-y-3">
          <div class="flex items-center gap-3 p-3 rounded-lg border border-surface-200 dark:border-surface-700" :class="metodosMixto.efectivo ? 'bg-primary text-primary-contrast border-primary' : ''">
            <input type="checkbox" v-model="metodosMixto.efectivo" class="w-4 h-4 shrink-0" />
            <i class="pi pi-money-bill shrink-0"></i>
            <span class="text-sm font-medium w-20 shrink-0">Efectivo</span>
            <InputNumber v-if="metodosMixto.efectivo" v-model="mixtoEfectivo" :min="0" fluid @focus="(e: any) => e.target.select()" />
          </div>
          <div class="p-3 rounded-lg border border-surface-200 dark:border-surface-700 space-y-3" :class="metodosMixto.tarjeta ? 'border-primary bg-primary-50 dark:bg-primary-950/20' : ''">
            <div class="flex items-center gap-3">
              <input type="checkbox" v-model="metodosMixto.tarjeta" :disabled="tarjetasMixto.length === 0" class="w-4 h-4 shrink-0" />
              <i class="pi pi-credit-card shrink-0"></i>
              <span class="text-sm font-medium">Tarjeta</span>
              <span v-if="tarjetasMixto.length === 0" class="text-xs text-amber-600 ml-auto">No hay tarjetas activas</span>
            </div>
            <div v-if="metodosMixto.tarjeta" class="grid grid-cols-[minmax(0,1fr)_9rem] gap-2">
              <Select
                v-model="metodoTarjetaMixtoId"
                :options="tarjetasMixto"
                optionLabel="label"
                optionValue="id"
                placeholder="Elegir tarjeta..."
                fluid
              />
              <InputNumber v-model="mixtoTarjeta" :min="0" fluid @focus="(e: any) => e.target.select()" />
            </div>
          </div>
          <div v-if="metodosMixto.tarjeta && comisionMixtaPorcentaje > 0" class="flex justify-between text-xs text-amber-700 dark:text-amber-300 px-3 -mt-2">
            <span>Recargo tarjeta ({{ comisionMixtaPorcentaje }}%)</span>
            <span class="font-semibold">+{{ formatMoney(comisionMixtaMonto) }}</span>
          </div>
          <div class="p-3 rounded-lg border border-surface-200 dark:border-surface-700 space-y-2" :class="metodosMixto.transferencia ? 'border-purple-300 dark:border-purple-700' : ''">
            <div class="flex items-center gap-3">
              <input type="checkbox" v-model="metodosMixto.transferencia" class="w-4 h-4 shrink-0" />
              <i class="pi pi-send shrink-0"></i>
              <span class="text-sm font-medium w-20 shrink-0">Transferencia</span>
              <Button v-if="metodosMixto.transferencia" icon="pi pi-plus" label="Agregar" size="small" severity="secondary" outlined @click="agregarTransferenciaMixto" class="ml-auto" />
            </div>
            <template v-if="metodosMixto.transferencia">
              <div
                v-for="(transferencia, idx) in transferenciasMixto"
                :key="idx"
                class="grid grid-cols-[1fr_8rem_2rem] gap-2 items-center"
              >
                <Select
                  v-model="transferencia.banco_id"
                  :options="bancosPos"
                  optionLabel="nombre"
                  optionValue="id"
                  placeholder="Banco"
                  fluid
                  filter
                >
                  <template #option="{ option }">
                    <div class="flex flex-col">
                      <span class="font-medium">{{ option.nombre }}</span>
                      <span v-if="option.numero_cuenta" class="text-xs text-surface-400">{{ option.numero_cuenta }}</span>
                    </div>
                  </template>
                </Select>
                <InputNumber v-model="transferencia.monto" :min="0" fluid @focus="(e: any) => e.target.select()" />
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" :disabled="transferenciasMixto.length === 1" @click="quitarTransferenciaMixto(idx)" />
              </div>
              <div class="flex justify-between text-xs font-semibold text-surface-500">
                <span>Total transferencia</span>
                <span>{{ formatMoney(totalTransferenciasMixto()) }}</span>
              </div>
            </template>
          </div>
          <div class="flex items-center gap-3 p-3 rounded-lg border border-surface-200 dark:border-surface-700" :class="metodosMixto.cheque ? 'bg-primary text-primary-contrast border-primary' : ''">
            <input type="checkbox" v-model="metodosMixto.cheque" class="w-4 h-4 shrink-0" />
            <i class="pi pi-check shrink-0"></i>
            <span class="text-sm font-medium w-20 shrink-0">Cheque</span>
            <InputNumber v-if="metodosMixto.cheque" v-model="mixtoCheque" :min="0" fluid @focus="(e: any) => e.target.select()" />
          </div>
        </div>

        <div class="flex justify-between text-sm font-bold border-t border-surface-200 dark:border-surface-700 pt-3">
          <span>Total distribuido</span>
          <span :class="Math.abs(totalDistribuidoMixto - total) < 0.01 ? 'text-green-600' : 'text-red-600'">
            {{ formatMoney(totalDistribuidoMixto) }}
          </span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogMixto = false" />
        <Button label="Confirmar" icon="pi pi-check" @click="confirmarMixto" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="confirmPago"
      header="Confirmar Venta"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
    >
      <div class="space-y-3">
        <div class="flex justify-between text-sm">
          <span>Productos</span>
          <span class="font-semibold">{{ cartCount }} items</span>
        </div>
        <div class="flex justify-between text-sm">
          <span>Subtotal</span>
          <span>{{ formatMoney(subtotal) }}</span>
        </div>
        <div v-if="descuento > 0" class="flex justify-between text-sm">
          <span>Descuento</span>
          <span class="text-red-500">-{{ formatMoney(descuento) }}</span>
        </div>
        <div v-if="impuestoIncluido === 0" class="flex justify-between text-sm">
          <span>{{ taxName }} ({{ impuestoPorcentaje }}%)</span>
          <span>{{ formatMoney(impuestoMonto) }}</span>
        </div>
        <div v-else-if="impuestoIncluido === 1" class="flex justify-between text-xs text-surface-400">
          <span>{{ taxName }} {{ impuestoPorcentaje }}% incl.</span>
          <span>—</span>
        </div>
        <div v-else class="flex justify-between text-xs text-surface-400">
          <span>{{ taxName }}</span>
          <span>Sin impuesto</span>
        </div>
        <div v-if="puedeVerDetalleImei" class="flex justify-between text-sm pt-1">
          <span>Costo</span>
          <span class="text-orange-600 dark:text-orange-400">{{ formatMoney(costoTotal) }}</span>
        </div>
        <div v-if="puedeVerDetalleImei" class="flex justify-between text-sm">
          <span>Ganancia</span>
          <span class="text-emerald-600 dark:text-emerald-400">{{ formatMoney(gananciaTotal) }}</span>
        </div>
        <div v-if="comisionPorcentaje > 0" class="flex justify-between text-xs text-amber-600 dark:text-amber-400 pt-1">
          <span>Recargo {{ metodoPago }} ({{ comisionPorcentaje }}%)</span>
          <span>Incluido en precios</span>
        </div>
        <div class="flex justify-between text-lg font-bold border-t border-surface-200/50 dark:border-surface-700/30 pt-2">
          <span>Total a pagar</span>
          <span class="text-primary">{{ formatMoney(total) }}</span>
        </div>
        <div class="flex items-center justify-between gap-3 text-sm border-t border-surface-100 dark:border-surface-700 pt-2">
          <span>Cliente</span>
          <InputText
            v-if="!clienteSeleccionado"
            v-model="clienteExpress"
            placeholder="Nombre del cliente"
            class="!text-xs w-48"
            fluid
          />
          <span v-else class="font-medium text-right flex items-center gap-1">
            {{ clienteSeleccionado.nombre }}
            <Button icon="pi pi-times" severity="secondary" text rounded size="small" class="!w-5 !h-5" @click="clienteSeleccionado = null" v-tooltip="'Quitar cliente'" />
          </span>
        </div>
        <div v-if="esVendedorPendiente && !facturaEditandoPos" class="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-300">
          <div class="font-semibold flex items-center gap-2"><i class="pi pi-send"></i>Esta factura se enviará pendiente a Caja</div>
          <div class="text-xs mt-1">El cajero seleccionará el método de pago y completará el cobro.</div>
        </div>
        <div v-else class="flex justify-between text-sm">
          <span>Metodo de Pago</span>
          <span>{{ metodoPago }}</span>
        </div>
        <div v-if="needsBankSelection && !(esVendedorPendiente && !facturaEditandoPos)" class="flex flex-col gap-1">
          <label class="text-xs font-semibold">Banco destino</label>
          <Select
            v-model="bancoPosSeleccionado"
            :options="bancosPos"
            optionLabel="nombre"
            optionValue="id"
            placeholder="Seleccionar banco..."
            :loading="cargandoBancosPos"
            fluid
          >
            <template #option="{ option }">
              <div class="flex flex-col">
                <span class="font-medium">{{ option.nombre }}</span>
                <span v-if="option.numero_cuenta" class="text-xs text-surface-400">{{ option.numero_cuenta }}</span>
              </div>
            </template>
          </Select>
        </div>
        <div class="pt-1 border-t border-surface-100 dark:border-surface-700">
          <div class="flex items-start gap-1.5">
            <i class="pi pi-pencil text-surface-400 text-xs mt-1.5"></i>
            <NotasComp v-model="nota" class="flex-1" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="confirmPago = false" />
        <Button :label="facturaEditandoPos ? (esFacturaPendiente(facturaEditandoPos) ? 'Cobrar Factura' : 'Actualizar Factura') : esVendedorPendiente ? 'Enviar a Caja' : 'Completar Venta'" icon="pi pi-check" :loading="guardando" @click="completarVenta" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogFatCoti"
      header="Facturas y cotizaciones (Fact-Coti)"
      modal
      :style="{ width: 'min(72rem, 96vw)' }"
      :draggable="false"
    >
      <div class="flex flex-col gap-4">
        <div class="grid grid-cols-1 md:grid-cols-[14rem_12rem_1fr_auto] gap-3 items-end">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-surface-500">Tipo</label>
            <SelectButton
              v-model="tipoFatCoti"
              :options="tipoFatCotiOptions"
              optionLabel="label"
              optionValue="value"
              :allowEmpty="false"
              fluid
            />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-surface-500">Ultimas X</label>
            <InputNumber v-model="limiteFatCoti" :min="1" :max="100000" fluid />
          </div>

          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold uppercase tracking-wide text-surface-500">Buscar</label>
            <IconField>
              <InputIcon class="pi pi-search" />
              <InputText
                v-model="busquedaFatCoti"
                :placeholder="tipoFatCoti === 'FACTURA' ? 'Buscar factura, cliente, telefono, NCF...' : 'Buscar cotizacion, cliente, telefono...'"
                fluid
              />
            </IconField>
          </div>

          <Button
            icon="pi pi-refresh"
            label="Recargar"
            severity="secondary"
            outlined
            :loading="cargandoFatCoti"
            @click="cargarRegistrosFatCoti"
          />
        </div>

        <div class="flex items-center justify-between gap-3 text-xs text-surface-500">
          <span>
            Mostrando {{ registrosFatCotiFiltrados.length }} {{ tipoFatCoti === 'FACTURA' ? 'factura(s)' : 'cotizacion(es)' }}
          </span>
          <span v-if="registroFatCotiSeleccionado" class="font-semibold text-primary">
            Seleccionado: {{ registroFatCotiSeleccionado.no_factura || registroFatCotiSeleccionado.id }}
          </span>
        </div>

        <div
          v-if="false && registroFatCotiSeleccionado"
          class="rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/70 dark:bg-primary-900/20 p-4 flex flex-col gap-3"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-primary">Acciones disponibles</p>
              <h4 class="font-bold text-sm mt-1">
                {{ tipoRegistroFactCoti() === 'cotizacion' ? 'Cotizacion' : 'Factura' }}
                {{ registroFatCotiSeleccionado.no_factura || registroFatCotiSeleccionado.id }}
              </h4>
              <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                {{ registroFatCotiSeleccionado.nombre_cliente || 'CONSUMIDOR FINAL' }} · {{ formatMoney(registroFatCotiSeleccionado.total || 0) }}
              </p>
            </div>
            <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="registroFatCotiSeleccionado = null" />
          </div>

          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            <button
              type="button"
              class="aspect-square rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-surface-800 p-2 flex flex-col items-center justify-center text-center gap-1.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
              @click="confirmarEliminarFactCoti"
            >
              <span class="w-9 h-9 rounded-lg bg-red-500 text-white flex items-center justify-center shadow-sm">
                <i class="pi pi-trash text-base"></i>
              </span>
              <span class="font-bold text-[11px] leading-tight text-red-600 dark:text-red-400">
                Eliminar {{ tipoRegistroFactCoti() === 'cotizacion' ? 'cotizacion' : 'factura' }}
              </span>
            </button>
          </div>
        </div>

        <DataTable
          v-model:selection="registroFatCotiSeleccionado"
          :value="registrosFatCotiFiltrados"
          :loading="cargandoFatCoti"
          selectionMode="single"
          dataKey="id"
          paginator
          :rows="10"
          :rowsPerPageOptions="[10, 25, 50, 100]"
          responsiveLayout="scroll"
          scrollable
          scrollHeight="300px"
          size="small"
        >
          <Column selectionMode="single" headerStyle="width: 3rem" />
          <Column field="no_factura" :header="tipoFatCoti === 'FACTURA' ? 'Factura' : 'Cotizacion'" sortable style="min-width: 9rem">
            <template #body="{ data }">
              <span class="font-semibold">{{ data.no_factura || '-' }}</span>
            </template>
          </Column>
          <Column field="fecha_emision" header="Fecha" sortable style="min-width: 9rem">
            <template #body="{ data }">
              {{ fechaRegistroFatCoti(data) || '-' }}
            </template>
          </Column>
          <Column field="nombre_cliente" header="Cliente" sortable style="min-width: 14rem">
            <template #body="{ data }">
              <div>
                <p class="font-medium">{{ data.nombre_cliente || 'CONSUMIDOR FINAL' }}</p>
                <p v-if="data.telefono_cliente" class="text-xs text-surface-500">{{ data.telefono_cliente }}</p>
              </div>
            </template>
          </Column>
          <Column field="metodo_pago" header="Pago" sortable style="min-width: 8rem" />
          <Column field="estado_factura" header="Estado" sortable style="min-width: 8rem" />
          <Column field="total" header="Total" sortable style="min-width: 8rem">
            <template #body="{ data }">
              <span class="font-bold text-emerald-600">{{ formatMoney(data.total || 0) }}</span>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-surface-400">
              No hay {{ tipoFatCoti === 'FACTURA' ? 'facturas' : 'cotizaciones' }} para mostrar.
            </div>
          </template>
        </DataTable>

        <div
          v-if="false && registroFatCotiSeleccionado"
          class="rounded-2xl border border-primary-200 dark:border-primary-800 bg-primary-50/70 dark:bg-primary-900/20 p-4 flex flex-col gap-3 shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs font-semibold uppercase tracking-wide text-primary">Acciones disponibles</p>
              <h4 class="font-bold text-sm mt-1">
                {{ tipoRegistroFactCoti() === 'cotizacion' ? 'Cotizacion' : 'Factura' }}
                {{ registroFatCotiSeleccionado.no_factura || registroFatCotiSeleccionado.id }}
              </h4>
              <p class="text-xs text-surface-500 dark:text-surface-400 mt-0.5">
                {{ registroFatCotiSeleccionado.nombre_cliente || 'CONSUMIDOR FINAL' }} · {{ formatMoney(registroFatCotiSeleccionado.total || 0) }}
              </p>
            </div>
            <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="registroFatCotiSeleccionado = null" />
          </div>

          <div class="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-6 gap-2">
            <button
              type="button"
              class="aspect-square rounded-xl border border-red-200 dark:border-red-800 bg-white dark:bg-surface-800 p-2 flex flex-col items-center justify-center text-center gap-1.5 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer"
              @click="confirmarEliminarFactCoti"
            >
              <span class="w-9 h-9 rounded-lg bg-red-500 text-white flex items-center justify-center shadow-sm">
                <i class="pi pi-trash text-base"></i>
              </span>
              <span class="font-bold text-[11px] leading-tight text-red-600 dark:text-red-400">
                Eliminar {{ tipoRegistroFactCoti() === 'cotizacion' ? 'cotizacion' : 'factura' }}
              </span>
            </button>
          </div>
        </div>
      </div>

      <template #footer>
        <div class="w-full flex flex-wrap items-center justify-end gap-2">
          <Button
            v-if="registroFatCotiSeleccionado && esFacturaPendiente() && (auth.isCajero || auth.isAdmin || auth.isGerente)"
            label="Cobrar factura"
            icon="pi pi-dollar"
            severity="success"
            size="small"
            @click="cobrarFacturaPendiente"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            label="Cambiar WhatsApp"
            icon="pi pi-whatsapp"
            severity="success"
            outlined
            size="small"
            @click="abrirCambiarWhatsappFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado && esCreditoFactCoti()"
            label="Editar cuenta por cobrar"
            icon="pi pi-pencil"
            severity="warning"
            outlined
            size="small"
            @click="verCuentaCobrarFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado && tipoRegistroFactCoti() === 'factura'"
            label="Devolucion"
            icon="pi pi-undo"
            severity="danger"
            outlined
            size="small"
            @click="abrirDevolucionFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            label="Imprimir"
            icon="pi pi-print"
            severity="primary"
            outlined
            size="small"
            @click="imprimirFacturaFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            label="Editar factura"
            icon="pi pi-pencil"
            severity="success"
            outlined
            size="small"
            @click="editarFacturaFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            label="Ver productos"
            icon="pi pi-list"
            severity="secondary"
            outlined
            size="small"
            @click="abrirProductosFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            label="Cambiar cliente"
            icon="pi pi-user-edit"
            severity="help"
            outlined
            size="small"
            @click="abrirCambiarClienteFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            label="Editar metodo de pago"
            icon="pi pi-credit-card"
            severity="info"
            outlined
            size="small"
            @click="abrirEditarPagoFactCoti"
          />
          <Button
            v-if="registroFatCotiSeleccionado"
            :label="`Eliminar ${tipoRegistroFactCoti() === 'cotizacion' ? 'cotizacion' : 'factura'}`"
            icon="pi pi-trash"
            severity="danger"
            outlined
            size="small"
            @click="confirmarEliminarFactCoti"
          />
          <Button label="Cerrar" severity="secondary" text size="small" @click="dialogFatCoti = false" />
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogWhatsappFactCoti"
      header="Cambiar WhatsApp"
      modal
      :style="{ width: 'min(26rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm">
          <p class="font-semibold">
            {{ tipoRegistroFactCoti() === 'cotizacion' ? 'Cotizacion' : 'Factura' }}
            {{ registroFatCotiSeleccionado?.no_factura || registroFatCotiSeleccionado?.id }}
          </p>
          <p class="text-xs text-surface-500 mt-0.5">
            Cliente: {{ registroFatCotiSeleccionado?.nombre_cliente || 'CONSUMIDOR FINAL' }}
          </p>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">WhatsApp</label>
          <InputText
            v-model="whatsappFactCoti"
            placeholder="8095551234"
            fluid
            @keydown.enter="guardarWhatsappFactCoti"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogWhatsappFactCoti = false" />
        <Button
          label="Guardar"
          icon="pi pi-save"
          severity="success"
          :loading="guardandoWhatsappFactCoti"
          @click="guardarWhatsappFactCoti"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogProductosFactCoti"
      header="Productos de la factura"
      modal
      :style="{ width: 'min(58rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm">
          <p class="font-semibold">
            {{ tipoRegistroFactCoti() === 'cotizacion' ? 'Cotizacion' : 'Factura' }}
            {{ registroFatCotiSeleccionado?.no_factura || registroFatCotiSeleccionado?.id }}
          </p>
          <p class="text-xs text-surface-500 mt-0.5">
            {{ registroFatCotiSeleccionado?.nombre_cliente || 'CONSUMIDOR FINAL' }}
          </p>
        </div>

        <IconField>
          <InputIcon class="pi pi-search" />
              <InputText v-model="busquedaProductosFactCoti" :placeholder="systemMode.isGeneralStore ? 'Buscar producto, serial, color o capacidad...' : 'Buscar producto, IMEI, serial, color o capacidad...'" fluid />
        </IconField>

        <div class="flex items-center justify-between gap-3">
          <span class="text-xs text-surface-500">
            {{ productosFactCotiFiltrados.length }} producto(s)
          </span>
          <Button
            label="Agregar producto"
            icon="pi pi-plus"
            size="small"
            :disabled="guardandoProductosFactCoti"
            @click="abrirAgregarProductoFactCoti"
          />
        </div>

        <DataTable
          :value="productosFactCotiFiltrados"
          paginator
          :rows="10"
          responsiveLayout="scroll"
          scrollable
          scrollHeight="360px"
          size="small"
        >
          <Column header="Acciones" style="width: 6rem">
            <template #body="{ data }">
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                :loading="guardandoProductosFactCoti"
                @click="eliminarProductoFactCoti(data)"
                v-tooltip="'Eliminar producto'"
              />
            </template>
          </Column>
          <Column header="#" style="width: 4rem">
            <template #body="{ index }">{{ index + 1 }}</template>
          </Column>
          <Column field="nombre" header="Producto" sortable style="min-width: 14rem">
            <template #body="{ data }">
              <div>
                <p class="font-semibold">{{ data.nombre || data.descripcion || 'Producto' }}</p>
                <p class="text-xs text-surface-500">
                  <span v-if="systemMode.isCellphoneStore && data.imei">IMEI: {{ data.imei }}</span>
                  <span v-else-if="data.serial">Serial: {{ data.serial }}</span>
                  <span v-else>{{ data.tipo || '' }}</span>
                </p>
              </div>
            </template>
          </Column>
          <Column field="cantidad" header="Cant." sortable style="width: 6rem">
            <template #body="{ data }">{{ data.cantidad || 1 }}</template>
          </Column>
          <Column field="precio" header="Precio" sortable style="width: 9rem">
            <template #body="{ data }">
              {{ formatMoney(data.precio || data.precio_venta || 0) }}
            </template>
          </Column>
          <Column header="Total" style="width: 9rem">
            <template #body="{ data }">
              <span class="font-bold text-emerald-600">
                {{ formatMoney((Number(data.precio || data.precio_venta || 0)) * (Number(data.cantidad || 1))) }}
              </span>
            </template>
          </Column>
          <Column field="color" header="Color" style="width: 8rem" />
          <Column field="capacidad" header="Capacidad" style="width: 8rem" />
          <template #empty>
            <div class="text-center py-8 text-surface-400">
              Esta factura no tiene productos registrados.
            </div>
          </template>
        </DataTable>
      </div>

      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogProductosFactCoti = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogAgregarProductoFactCoti"
      header="Agregar producto"
      modal
      :style="{ width: 'min(30rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <SelectButton
          v-model="modoAgregarProductoFactCoti"
          :options="modosAgregarProductoFactCoti"
          optionLabel="label"
          optionValue="value"
          :allowEmpty="false"
          fluid
        />

        <div v-if="modoAgregarProductoFactCoti === 'manual'" class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Producto</label>
          <InputText
            v-model="nuevoProductoFactCoti.nombre"
            placeholder="Nombre del producto"
            fluid
            class="uppercase"
            style="text-transform: uppercase"
          />
        </div>

        <div v-else class="space-y-3">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busquedaProductoDbFactCoti" :placeholder="systemMode.isGeneralStore ? 'Buscar en DB: producto o serial...' : 'Buscar en DB: accesorio, IMEI, serial...'" fluid />
          </IconField>

          <DataTable
            v-model:selection="productoDbFactCotiSeleccionado"
            :value="productosDbFactCotiFiltrados"
            selectionMode="single"
            dataKey="dbKey"
            responsiveLayout="scroll"
            scrollable
            scrollHeight="260px"
            size="small"
          >
            <Column selectionMode="single" headerStyle="width: 3rem" />
            <Column field="nombre" header="Producto" sortable>
              <template #body="{ data }">
                <div>
                  <p class="font-semibold">{{ data.nombre }}</p>
                  <p class="text-xs text-surface-500">{{ data.detalle }}</p>
                </div>
              </template>
            </Column>
            <Column field="origen" header="Tipo" sortable style="width: 8rem">
              <template #body="{ data }">
                <span class="text-xs font-bold uppercase">{{ data.origen }}</span>
              </template>
            </Column>
            <Column field="cantidadDisponible" header="Disp." sortable style="width: 6rem" />
            <Column field="precio" header="Precio" sortable style="width: 9rem">
              <template #body="{ data }">{{ formatMoney(data.precio || 0) }}</template>
            </Column>
            <template #empty>
              <div class="text-center py-8 text-surface-400">No hay productos disponibles.</div>
            </template>
          </DataTable>

          <div v-if="productoDbFactCotiSeleccionado" class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-xs">
            <p class="font-semibold">{{ productoDbFactCotiSeleccionado.nombre }}</p>
            <p class="text-surface-500">{{ productoDbFactCotiSeleccionado.detalle }}</p>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Cantidad</label>
            <InputNumber
              v-model="nuevoProductoFactCoti.cantidad"
              :min="1"
              :max="modoAgregarProductoFactCoti === 'db' && productoDbFactCotiSeleccionado?.origen === 'accesorio' ? productoDbFactCotiSeleccionado.cantidadDisponible : undefined"
              :disabled="modoAgregarProductoFactCoti === 'db' && productoDbFactCotiSeleccionado?.origen && productoDbFactCotiSeleccionado.origen !== 'accesorio'"
              fluid
            />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Precio</label>
            <InputNumber
              v-if="modoAgregarProductoFactCoti === 'manual'"
              v-model="nuevoProductoFactCoti.precio"
              :min="0"
              :minFractionDigits="2"
              fluid
            />
            <InputNumber
              v-else
              :modelValue="productoDbFactCotiSeleccionado?.precio || 0"
              :min="0"
              :minFractionDigits="2"
              disabled
              fluid
            />
          </div>
          <div v-if="puedeVerDetalleImei" class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Costo</label>
            <InputNumber
              v-if="modoAgregarProductoFactCoti === 'manual'"
              v-model="nuevoProductoFactCoti.costo"
              :min="0"
              :minFractionDigits="2"
              fluid
            />
            <InputNumber
              v-else
              :modelValue="productoDbFactCotiSeleccionado?.costo || 0"
              :min="0"
              :minFractionDigits="2"
              disabled
              fluid
            />
          </div>
        </div>

        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm flex justify-between">
          <span>Total producto</span>
          <span class="font-bold text-primary">
            {{ formatMoney((Number(nuevoProductoFactCoti.cantidad) || 0) * (modoAgregarProductoFactCoti === 'db' && productoDbFactCotiSeleccionado ? Number(productoDbFactCotiSeleccionado.precio || 0) : Number(nuevoProductoFactCoti.precio || 0))) }}
          </span>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogAgregarProductoFactCoti = false" />
        <Button
          label="Agregar"
          icon="pi pi-plus"
          :loading="guardandoProductosFactCoti"
          @click="agregarProductoFactCoti"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCuentaCobrarFactCoti"
      header="Cuenta por cobrar"
      modal
      :style="{ width: 'min(34rem, 95vw)' }"
      :draggable="false"
    >
      <div v-if="cargandoCuentaCobrarFactCoti" class="flex items-center justify-center py-10 gap-2 text-surface-500">
        <i class="pi pi-spin pi-spinner"></i>
        <span>Cargando cuenta...</span>
      </div>

      <div v-else-if="cuentaCobrarFactCoti" class="space-y-4">
        <div class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4">
          <div class="flex items-start justify-between gap-3">
            <div>
              <p class="text-xs uppercase tracking-wide font-semibold text-amber-700 dark:text-amber-300">Factura</p>
              <h3 class="font-bold text-lg">{{ cuentaCobrarFactCoti.no_factura }}</h3>
              <p class="text-sm text-surface-500">{{ cuentaCobrarFactCoti.nombre_cliente || 'CONSUMIDOR FINAL' }}</p>
            </div>
            <span class="text-xs font-bold px-2 py-1 rounded-full bg-white dark:bg-surface-800 text-amber-700 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
              {{ cuentaCobrarFactCoti.estado || 'ACTIVA' }}
            </span>
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
            <p class="text-xs text-surface-500">Total</p>
            <p class="font-bold">{{ formatMoney(cuentaCobrarFactCoti.total || 0) }}</p>
          </div>
          <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
            <p class="text-xs text-surface-500">Abonado</p>
            <p class="font-bold text-emerald-600">{{ formatMoney(cuentaCobrarFactCoti.abonado || 0) }}</p>
          </div>
          <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
            <p class="text-xs text-surface-500">Saldo</p>
            <p class="font-bold text-red-600">{{ formatMoney(cuentaCobrarFactCoti.saldo || 0) }}</p>
          </div>
        </div>

        <div
          v-if="Number(cuentaCobrarFactCoti.saldo || 0) > 0"
          class="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 space-y-3"
        >
          <div>
            <p class="font-semibold text-sm text-emerald-700 dark:text-emerald-300">Registrar abono</p>
            <p class="text-xs text-surface-500">El abono se aplicara al saldo de esta cuenta por cobrar.</p>
          </div>
          <div class="flex flex-col sm:flex-row gap-2">
            <InputNumber
              v-model="abonoCuentaCobrarFactCoti"
              :min="0"
              :max="Number(cuentaCobrarFactCoti.saldo || 0)"
              :minFractionDigits="2"
              placeholder="Monto del abono"
              fluid
              @focus="(e: any) => e.target.select()"
            />
            <Button
              label="Abonar"
              icon="pi pi-check"
              severity="success"
              class="shrink-0"
              :disabled="!abonoCuentaCobrarFactCoti || Number(abonoCuentaCobrarFactCoti) <= 0"
              :loading="guardandoAbonoCuentaCobrarFactCoti"
              @click="abonarCuentaCobrarFactCoti"
            />
          </div>
          <div class="grid grid-cols-4 gap-2">
            <Button label="25%" severity="secondary" outlined size="small" @click="setAbonoPorcentajeFactCoti(0.25)" />
            <Button label="50%" severity="secondary" outlined size="small" @click="setAbonoPorcentajeFactCoti(0.50)" />
            <Button label="75%" severity="secondary" outlined size="small" @click="setAbonoPorcentajeFactCoti(0.75)" />
            <Button label="100%" severity="success" outlined size="small" @click="setAbonoPorcentajeFactCoti(1)" />
          </div>
        </div>

        <div v-else class="rounded-xl border border-emerald-200 dark:border-emerald-800 bg-emerald-50 dark:bg-emerald-900/20 p-4 text-sm text-emerald-700 dark:text-emerald-300">
          Esta cuenta ya esta saldada.
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
          <div>
            <p class="text-xs text-surface-500">Telefono</p>
            <p class="font-medium">{{ cuentaCobrarFactCoti.telefono_cliente || '-' }}</p>
          </div>
          <div>
            <p class="text-xs text-surface-500">Fecha venta</p>
            <p class="font-medium">{{ cuentaCobrarFactCoti.fecha_venta || '-' }}</p>
          </div>
          <div>
            <p class="text-xs text-surface-500">Vencimiento</p>
            <p class="font-medium">{{ cuentaCobrarFactCoti.fecha_vencimiento || '-' }}</p>
          </div>
          <div>
            <p class="text-xs text-surface-500">Notas</p>
            <p class="font-medium">{{ cuentaCobrarFactCoti.notas || '-' }}</p>
          </div>
        </div>
      </div>

      <div v-else class="text-center py-10 text-surface-500">
        No se encontro cuenta por cobrar para esta factura.
      </div>

      <template #footer>
        <Button
          v-if="cuentaCobrarFactCoti"
          label="WhatsApp"
          icon="pi pi-whatsapp"
          severity="success"
          outlined
          @click="enviarWhatsappCuentaFactCoti"
        />
        <Button
          v-if="cuentaCobrarFactCoti"
          label="Imprimir"
          icon="pi pi-print"
          severity="info"
          outlined
          @click="imprimirCuentaCobrarFactCoti"
        />
        <Button
          v-if="cuentaCobrarFactCoti"
          label="PDF profesional"
          icon="pi pi-file-pdf"
          severity="danger"
          outlined
          @click="generarPdfCuentaCobrarFactCoti"
        />
        <Button label="Cerrar" severity="secondary" text @click="dialogCuentaCobrarFactCoti = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogWhatsappCuentaFactCoti"
      header="Agregar WhatsApp"
      modal
      :style="{ width: 'min(26rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm">
          <p class="font-semibold text-green-700 dark:text-green-300">El cliente no tiene WhatsApp registrado.</p>
          <p class="text-xs text-surface-500 mt-1">Agrega el numero para guardar y enviar el resumen de la cuenta.</p>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">WhatsApp</label>
          <InputText
            v-model="whatsappCuentaFactCoti"
            placeholder="8095551234"
            fluid
            @keydown.enter="guardarWhatsappCuentaFactCoti"
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogWhatsappCuentaFactCoti = false" />
        <Button
          label="Guardar y enviar"
          icon="pi pi-whatsapp"
          severity="success"
          :loading="guardandoWhatsappCuentaFactCoti"
          @click="guardarWhatsappCuentaFactCoti"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambiarClienteFactCoti"
      header="Cambiar cliente"
      modal
      :style="{ width: 'min(46rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm">
          <p class="font-semibold">
            {{ tipoRegistroFactCoti() === 'cotizacion' ? 'Cotizacion' : 'Factura' }}
            {{ registroFatCotiSeleccionado?.no_factura || registroFatCotiSeleccionado?.id }}
          </p>
          <p class="text-xs text-surface-500 mt-0.5">
            Cliente actual: {{ registroFatCotiSeleccionado?.nombre_cliente || 'CONSUMIDOR FINAL' }}
          </p>
        </div>

        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busquedaClienteFactCoti" placeholder="Buscar cliente por nombre, telefono, RNC o ID..." fluid />
        </IconField>

        <DataTable
          v-model:selection="clienteFactCotiSeleccionado"
          :value="clientesFactCotiFiltrados"
          selectionMode="single"
          dataKey="id"
          paginator
          :rows="8"
          responsiveLayout="scroll"
          scrollable
          scrollHeight="300px"
          size="small"
        >
          <Column selectionMode="single" headerStyle="width: 3rem" />
          <Column field="nombre" header="Cliente" sortable>
            <template #body="{ data }">
              <div>
                <p class="font-semibold">{{ data.nombre }}</p>
                <p class="text-xs text-surface-500">ID: {{ data.id }}</p>
              </div>
            </template>
          </Column>
          <Column field="telefono" header="Telefono" sortable style="width: 10rem" />
          <Column field="rnc" header="RNC/Cedula" sortable style="width: 10rem" />
          <Column field="direccion" header="Direccion" style="min-width: 12rem" />
          <template #empty>
            <div class="text-center py-8 text-surface-400">No hay clientes para mostrar.</div>
          </template>
        </DataTable>

        <p v-if="clienteFactCotiSeleccionado" class="text-xs text-primary font-semibold">
          Nuevo cliente: {{ clienteFactCotiSeleccionado.nombre }}
        </p>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambiarClienteFactCoti = false" />
        <Button
          label="Guardar cliente"
          icon="pi pi-save"
          :disabled="!clienteFactCotiSeleccionado"
          :loading="guardandoClienteFactCoti"
          @click="guardarClienteFactCoti"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogEditarPagoFactCoti"
      header="Editar metodo de pago"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm">
          <p class="font-semibold">
            {{ tipoRegistroFactCoti() === 'cotizacion' ? 'Cotizacion' : 'Factura' }}
            {{ registroFatCotiSeleccionado?.no_factura || registroFatCotiSeleccionado?.id }}
          </p>
          <p class="text-xs text-surface-500 mt-0.5">
            {{ registroFatCotiSeleccionado?.nombre_cliente || 'CONSUMIDOR FINAL' }}
          </p>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Metodo de pago</label>
          <Select
            v-model="metodoPagoFactCoti"
            :options="metodosPago"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEditarPagoFactCoti = false" />
        <Button
          label="Guardar"
          icon="pi pi-save"
          :loading="guardandoPagoFactCoti"
          @click="guardarMetodoPagoFactCoti"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogBancoFactCoti"
      header="Seleccionar banco"
      modal
      :style="{ width: 'min(42rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-purple-50 dark:bg-purple-900/20 border border-purple-200 dark:border-purple-800 p-3 text-sm">
          <p class="font-semibold">Transferencia para {{ registroFatCotiSeleccionado?.no_factura || registroFatCotiSeleccionado?.id }}</p>
          <p class="text-xs text-surface-500 mt-0.5">
            Selecciona el banco donde entrara {{ formatMoney(registroFatCotiSeleccionado?.total || 0) }}.
          </p>
        </div>

        <DataTable
          v-model:selection="bancoFactCotiSeleccionado"
          :value="bancosFactCoti"
          :loading="cargandoBancosFactCoti"
          selectionMode="single"
          dataKey="id"
          responsiveLayout="scroll"
          scrollable
          scrollHeight="260px"
          size="small"
        >
          <Column selectionMode="single" headerStyle="width: 3rem" />
          <Column field="nombre" header="Banco" sortable>
            <template #body="{ data }">
              <div>
                <p class="font-semibold">{{ data.nombre }}</p>
                <p v-if="data.numero_cuenta" class="text-xs text-surface-500">{{ data.numero_cuenta }}</p>
              </div>
            </template>
          </Column>
          <Column field="moneda" header="Moneda" sortable style="width: 8rem" />
          <Column field="saldo" header="Saldo actual" sortable style="width: 10rem">
            <template #body="{ data }">
              <span class="font-bold">{{ formatMoney(data.saldo || 0) }}</span>
            </template>
          </Column>
          <Column header="Nuevo saldo" style="width: 10rem">
            <template #body="{ data }">
              <span class="font-bold text-emerald-600">
                {{ formatMoney((Number(data.saldo) || 0) + (Number(registroFatCotiSeleccionado?.total) || 0)) }}
              </span>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-surface-400">
              No hay bancos registrados.
            </div>
          </template>
        </DataTable>

        <p v-if="bancoFactCotiSeleccionado" class="text-xs text-primary font-semibold">
          Banco seleccionado: {{ bancoFactCotiSeleccionado.nombre }}
        </p>
      </div>

      <template #footer>
        <Button label="Volver" severity="secondary" text @click="dialogBancoFactCoti = false; dialogEditarPagoFactCoti = true" />
        <Button
          label="Aplicar transferencia"
          icon="pi pi-check"
          severity="success"
          :disabled="!bancoFactCotiSeleccionado"
          :loading="guardandoBancoFactCoti"
          @click="guardarTransferenciaFactCoti"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogEliminarFactCoti"
      :header="`Eliminar ${tipoRegistroFactCoti() === 'cotizacion' ? 'cotizacion' : 'factura'}`"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500 mt-0.5"></i>
          <div class="text-sm">
            <p>
              Seguro que deseas eliminar la
              <strong>{{ tipoRegistroFactCoti() === 'cotizacion' ? 'cotizacion' : 'factura' }}</strong>
              <strong>{{ registroFatCotiSeleccionado?.no_factura || registroFatCotiSeleccionado?.id }}</strong>?
            </p>
            <p class="text-xs text-surface-500 mt-1">
              Esta accion requiere codigo OTP y no se puede deshacer.
            </p>
          </div>
        </div>

        <div class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
          Total: <strong>{{ formatMoney(registroFatCotiSeleccionado?.total || 0) }}</strong>
        </div>

        <div v-if="factCotiOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">
            Consulta el codigo de 4 digitos en el Centro OTP: {{ factCotiOtpEmail || 'Configuracion > OTP Local' }}.
          </p>
          <InputOtp v-model="factCotiOtp" :length="4" integerOnly />
        </div>

        <p v-if="factCotiOtpError" class="text-red-500 text-xs text-center">{{ factCotiOtpError }}</p>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEliminarFactCoti = false" />
        <Button
          v-if="!factCotiOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-envelope"
          severity="danger"
          :loading="factCotiOtpLoading"
          @click="solicitarOtpEliminarFactCoti"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="factCotiOtpConfirmando"
          @click="eliminarFactCotiSeleccionada"
        />
      </template>
    </Dialog>

    <FacturaPdfPrint ref="facturaPdfRef" />
    <TicketFacturaPrint ref="ticketFacturaPrintRef" />
    <TicketCuentaCobrarPrint ref="ticketCuentaCobrarRef" />
    <TicketTallerPrint ref="ticketTallerRef" />

    <Dialog
      v-model:visible="dialogPrintChoice"
      header="Imprimir"
      modal
      :style="{ width: 'min(24rem, 95vw)' }"
      :closable="true"
    >
      <div class="flex flex-col gap-3 pt-2">
        <p class="text-sm text-surface-500">Selecciona una opcion:</p>
        <Button label="Ticket Termico" icon="pi pi-print" severity="info" outlined class="w-full justify-start" @click="soloTicket" />
        <Button label="PDF" icon="pi pi-file-pdf" severity="danger" outlined class="w-full justify-start" @click="imprimirPdf" />
        <Button label="Enviar por Correo" icon="pi pi-envelope" severity="help" outlined class="w-full justify-start" @click="enviarCorreo" />
        <Button label="Compartir por WhatsApp" icon="pi pi-whatsapp" severity="success" outlined class="w-full justify-start" @click="compartirWhatsApp" />
        <Button label="Compartir" icon="pi pi-share-alt" severity="info" outlined class="w-full justify-start" @click="compartirImagen" />
        <Button label="Ninguno" icon="pi pi-times" severity="secondary" text class="w-full justify-start" @click="dialogPrintChoice = false" />
      </div>
    </Dialog>

    <Dialog
      v-model:visible="dialogTicket"
      header="Venta Completada"
      modal
      :style="{ width: 'min(30rem, 95vw)' }"
      @after-hide="cerrarTicket"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
          <i class="pi pi-check-circle text-2xl text-green-600"></i>
          <div>
            <p class="font-semibold text-green-700 dark:text-green-300">Factura {{ ticketData?.no_factura }}</p>
            <p class="text-sm text-green-600 dark:text-green-400">Venta completada exitosamente</p>
          </div>
        </div>

        <div class="flex justify-center">
          <div
            class="bg-white text-black font-mono text-xs leading-tight overflow-hidden rounded-lg shadow-lg"
            style="width: 280px; padding: 10px 8px"
            v-html="getTicketPreviewHTML()"
          ></div>
        </div>
      </div>

      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogTicket = false" />
        <Button label="Imprimir Ticket" icon="pi pi-print" @click="imprimirTicket" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambiarPrecio"
      header="Cambiar Precio"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
    >
      <div class="space-y-4">
        <div class="text-sm bg-surface-50 dark:bg-surface-700/50 p-3 rounded-lg">
          <p class="font-medium">{{ cartItemPrecio?.item?.nombre }}</p>
          <p class="text-xs text-surface-400">{{ cartItemPrecio?.item?.color }} {{ cartItemPrecio?.item?.capacidad }}</p>
        </div>

        <div class="flex flex-col gap-2">
          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioCambioSeleccionado === 'venta'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="seleccionarPrecioCambio('venta')"
          >
            <div>
              <p class="font-semibold text-sm">Precio Normal</p>
              <p class="text-xs text-surface-400">Precio de venta regular</p>
            </div>
            <span class="font-bold text-lg text-primary">{{ formatMoney(itemParaPrecio?.precio_venta || 0) }}</span>
          </div>

          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioCambioSeleccionado === 'min'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="seleccionarPrecioCambio('min')"
          >
            <div>
              <p class="font-semibold text-sm">Precio Minimo</p>
              <p class="text-xs text-surface-400">Precio minimo permitido</p>
            </div>
            <span class="font-bold text-lg text-orange-500">{{ formatMoney(itemParaPrecio?.precio_min || 0) }}</span>
          </div>

          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioCambioSeleccionado === 'xmayor'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="seleccionarPrecioCambio('xmayor')"
          >
            <div>
              <p class="font-semibold text-sm">Precio por Mayor</p>
              <p class="text-xs text-surface-400">Precio para ventas al por mayor</p>
            </div>
            <span class="font-bold text-lg text-green-500">{{ formatMoney(itemParaPrecio?.precio_xmayor || 0) }}</span>
          </div>

          <div
            class="flex items-center justify-between p-3 rounded-lg border cursor-pointer transition-colors"
            :class="precioCambioSeleccionado === 'manual'
              ? 'border-primary bg-primary-50 dark:bg-primary-900/20'
              : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'"
            @click="precioCambioSeleccionado = 'manual'"
          >
            <div>
              <p class="font-semibold text-sm">Precio Manual</p>
              <p class="text-xs text-surface-400">Ingresar precio personalizado</p>
            </div>
            <InputNumber
              v-if="precioCambioSeleccionado === 'manual'"
              v-model="nuevoPrecioItem"
              :min="0"
              class="w-32"
              @focus="(e) => e.target.select()"
              @click.stop
              fluid
            />
            <span v-else class="text-sm text-surface-400">Click para personalizar</span>
          </div>
        </div>

        <Button
          :label="`Gratis (${formatMoney(0)})`"
          icon="pi pi-star"
          severity="warning"
          outlined
          class="w-full justify-center"
          :class="nuevoPrecioItem === 0 ? '!bg-amber-100 dark:!bg-amber-900/30 !border-amber-400 !text-amber-700 dark:!text-amber-300' : ''"
          @click="nuevoPrecioItem = 0; precioCambioSeleccionado = 'manual'"
        />

        <div class="flex justify-between text-lg font-bold border-t border-surface-200/50 dark:border-surface-700/30 pt-3">
          <span>Precio seleccionado</span>
          <span class="text-primary">{{ formatMoney(nuevoPrecioItem) }}</span>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambiarPrecio = false; cartItemPrecio = null; itemParaPrecio = null" />
        <Button label="Aplicar" icon="pi pi-check" @click="aplicarCambioPrecio" />
      </template>
    </Dialog>

    <Dialog v-if="systemMode.isCellphoneStore" v-model:visible="dialogGestionImeis" header="Gestionar IMEI" modal :style="{ width: 'min(34rem, 95vw)' }">
      <div class="space-y-3 pt-2">
        <div class="text-sm bg-surface-50 dark:bg-surface-700/30 p-3 rounded-lg">
          <p class="font-semibold">{{ itemGestionImeis?.nombre }}</p>
          <p class="text-xs text-surface-400">{{ itemGestionImeis?.cantidad || 0 }} IMEI agregados en esta linea</p>
        </div>
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busquedaGestionImeis" placeholder="Buscar IMEI, color o capacidad..." fluid />
        </IconField>
        <div class="flex flex-col gap-2 max-h-80 overflow-y-auto">
          <div
            v-for="detalle in getImeisGestionFiltrados(itemGestionImeis)"
            :key="`${detalle.id || detalle.imei}-${detalle.pos}`"
            class="flex items-center justify-between gap-3 p-3 rounded-lg border border-surface-200/60 dark:border-surface-700/50 bg-surface-0 dark:bg-surface-800"
          >
            <div class="min-w-0">
              <p class="text-sm font-mono font-semibold truncate">{{ detalle.imei || 'IMEI sin numero' }}</p>
              <p v-if="detalle.color || detalle.capacidad" class="text-xs text-surface-400 truncate">{{ [detalle.color, detalle.capacidad].filter(Boolean).join(' / ') }}</p>
            </div>
            <div class="flex items-center gap-1 shrink-0">
              <Button icon="pi pi-refresh" severity="secondary" text rounded size="small" @click="prepararCambioImeiAgrupado(detalle.pos)" v-tooltip="'Cambiar este IMEI'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="quitarImeiAgrupado(detalle.pos)" v-tooltip="'Quitar este IMEI'" />
            </div>
          </div>
          <div v-if="getImeisGestionFiltrados(itemGestionImeis).length === 0" class="text-center py-6 text-surface-400 text-sm">No hay IMEI que coincidan con la busqueda.</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogGestionImeis = false; itemGestionImeis = null; indexGestionImeis = null" />
      </template>
    </Dialog>

    <Dialog v-if="systemMode.isCellphoneStore" v-model:visible="dialogCambiarImei" header="Cambiar IMEI" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="space-y-3 pt-2">
        <div class="text-sm bg-surface-50 dark:bg-surface-700/30 p-3 rounded-lg">
          <p class="font-medium text-xs">Producto: {{ itemCambiarImei?.nombre }}</p>
          <p class="text-xs text-surface-400 font-mono">IMEI actual: {{ itemCambiarImei?.imei }}</p>
        </div>
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busquedaCambiarImei" placeholder="Buscar IMEI..." fluid />
        </IconField>
        <div class="flex flex-col gap-2 max-h-60 overflow-y-auto">
          <div
            v-for="imei in imeisDisponiblesParaCambio.filter((i: any) => !busquedaCambiarImei || i.nombre?.toLowerCase().includes(busquedaCambiarImei.toLowerCase()))"
            :key="imei.id"
            class="flex items-center justify-between p-2.5 rounded-lg border border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300 cursor-pointer transition-colors"
            @click="seleccionarImeiCambio(imei)"
          >
            <div class="min-w-0">
              <p class="text-sm font-mono font-medium">{{ imei.nombre }}</p>
              <p v-if="imei.color || imei.capacidad" class="text-xs text-surface-400">{{ [imei.color, imei.capacidad].filter(Boolean).join(' / ') }}</p>
            </div>
            <span class="font-semibold text-sm shrink-0 ml-2">{{ formatMoney(imei.precio_venta || 0) }}</span>
          </div>
          <div v-if="imeisDisponiblesParaCambio.length === 0" class="text-center py-6 text-surface-400 text-sm">No hay otros IMEIs disponibles para este modelo</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambiarImei = false; itemCambiarImei = null" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogDescuento"
      header="Agregar Descuento"
      modal
      :style="{ width: 'min(26rem, 95vw)' }"
    >
      <div class="space-y-5 pt-2">
        <div class="flex rounded-lg border border-surface-200/50 dark:border-surface-700/30 overflow-hidden">
          <button
            class="flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer"
            :class="descuentoTipo === 'fijo' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300'"
            @click="descuentoTipo = 'fijo'; notaCreditoSeleccionada = null"
          >{{ systemCurrency }} Fijo</button>
          <button
            class="flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer border-l border-surface-200/50 dark:border-surface-700/30"
            :class="descuentoTipo === 'porcentaje' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300'"
            @click="descuentoTipo = 'porcentaje'; notaCreditoSeleccionada = null"
          >% Porcentaje</button>
          <button
            class="flex-1 py-2.5 text-sm font-semibold transition-colors cursor-pointer border-l border-surface-200/50 dark:border-surface-700/30"
            :class="descuentoTipo === 'nota_credito' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300'"
            @click="descuentoTipo = 'nota_credito'"
          >Nota Créd.</button>
        </div>

        <div v-if="descuentoTipo === 'nota_credito'" class="flex flex-col gap-2">
          <p class="text-xs text-surface-500">Selecciona una nota de credito del cliente</p>
          <div v-if="notasCreditoCliente.length > 0" class="max-h-44 overflow-y-auto flex flex-col gap-1">
            <div
              v-for="nc in notasCreditoCliente"
              :key="nc.id"
              class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer border text-sm"
              :class="notaCreditoSeleccionada?.id === nc.id ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700 hover:border-primary-300'"
              @click="seleccionarNotaCredito(nc)"
            >
              <div>
                <p class="font-medium">{{ nc.no_factura }}</p>
                <p class="text-xs text-surface-500">{{ nc.fecha_emision }}</p>
              </div>
              <span class="font-semibold text-emerald-600">{{ formatMoney(nc.total) }}</span>
            </div>
          </div>
          <div v-else class="text-center py-3 text-surface-400 text-sm">
            <span v-if="!clienteSeleccionado">Selecciona un cliente primero</span>
            <span v-else>Sin notas de credito disponibles</span>
          </div>
          <div v-if="notaCreditoSeleccionada" class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Valor a descontar</label>
            <InputNumber v-model="descuentoValor" :min="0" :max="notaCreditoSeleccionada?.total || 0" fluid />
          </div>
        </div>

        <div v-else class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Valor del descuento</label>
          <InputNumber
            v-model="descuentoValor"
            :min="0"
            :max="descuentoTipo === 'porcentaje' ? 100 : subtotal"
            fluid
          />
        </div>

        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm space-y-1">
          <div class="flex justify-between">
            <span class="text-surface-500">Subtotal</span>
            <span>{{ formatMoney(subtotal) }}</span>
          </div>
          <div v-if="impuestoIncluido === 0" class="flex justify-between text-xs">
            <span class="text-surface-500">{{ taxName }} ({{ impuestoPorcentaje }}%)</span>
            <span>{{ formatMoney(impuestoMonto) }}</span>
          </div>
          <div v-else-if="impuestoIncluido === 1" class="flex justify-between text-[10px] text-surface-400">
            <span>{{ taxName }} {{ impuestoPorcentaje }}% incl.</span>
            <span>—</span>
          </div>
          <div v-else class="flex justify-between text-[10px] text-surface-400">
            <span>{{ taxName }}</span>
            <span>Sin impuesto</span>
          </div>
          <div class="flex justify-between font-bold text-lg border-t border-surface-200/50 dark:border-surface-700/30 pt-1 mt-1">
            <span>Total</span>
            <span>{{ formatMoney(total) }}</span>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Quitar" severity="danger" text @click="quitarDescuento" />
        <Button label="Cancelar" severity="secondary" text @click="dialogDescuento = false" />
        <Button label="Aplicar" icon="pi pi-check" @click="aplicarDescuento" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogPdf" header="Cotizacion" modal :style="{ width: '80vw', height: '90vh' }" :closable="true" :draggable="false" @after-hide="cerrarPdfDialog">
      <div class="flex flex-col h-full -m-6">
        <iframe v-if="pdfUrl" :src="pdfUrl" class="w-full flex-1 border-0" style="min-height: 70vh"></iframe>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="cerrarPdfDialog" />
      </template>
    </Dialog>

    <!-- ==================== SPOTLIGHT SEARCH (Ctrl+K) ==================== -->
    <Dialog v-model:visible="spotlight.dialogSpotlight" header="Busqueda global" modal :style="{ width: 'min(36rem, 95vw)' }" @keydown="spotlight.manejarSpotlightKeydown($event, selectSpotlightResult)" @after-hide="spotlight.cerrarSpotlight()">
      <div class="space-y-2">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="spotlight.busquedaSpotlight" placeholder="Buscar productos, clientes, acciones..." fluid autofocus @keydown="spotlight.manejarSpotlightKeydown($event, selectSpotlightResult)" />
        </IconField>
        <div v-if="spotlight.resultadosSpotlight.length > 0" class="flex flex-col gap-1 max-h-72 overflow-y-auto">
          <div v-for="(r, i) in spotlight.resultadosSpotlight" :key="i" class="flex items-center gap-3 px-3 py-2 rounded-lg cursor-pointer transition-colors" :class="spotlight.spotlightIndex === i ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800' : 'hover:bg-surface-50 dark:hover:bg-surface-700/30 border border-transparent'" @click="selectSpotlightResult(r); spotlight.cerrarSpotlight()">
            <span class="w-8 h-8 rounded-lg flex items-center justify-center text-white text-xs" :class="r.tipo === 'cliente' ? 'bg-blue-500' : r.tipo === 'accion' ? 'bg-amber-500' : 'bg-primary-500'"><i :class="r.icono" class="text-sm"></i></span>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ r.label }}</p>
              <p class="text-xs text-surface-400 truncate">{{ r.detalle }}</p>
            </div>
            <span class="text-[10px] px-1.5 py-0.5 rounded font-medium uppercase" :class="r.tipo === 'cliente' ? 'bg-blue-50 text-blue-600 dark:bg-blue-900/20' : r.tipo === 'accion' ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20' : 'bg-primary-50 text-primary-600 dark:bg-primary-900/20'">{{ r.tipo }}</span>
          </div>
        </div>
        <div v-else-if="spotlight.busquedaSpotlight.length >= 2" class="text-center py-6 text-surface-400 text-sm">Sin resultados</div>
        <div v-else class="text-center py-6 text-surface-400 text-xs">Escribe al menos 2 caracteres para buscar</div>
      </div>
    </Dialog>

    <!-- ==================== HOLDS / RECALL ==================== -->
    <Dialog v-model:visible="holdRecall.dialogHold" header="Ventas retenidas (Hold)" modal :style="{ width: 'min(42rem, 95vw)' }">
      <div v-if="holdRecall.sincronizando" class="flex items-center justify-center gap-2 py-3 text-xs text-primary"><i class="pi pi-spin pi-spinner"></i>Buscando ventas pausadas en TM Cloud...</div>
      <div v-if="!holdRecall.sincronizando && holdRecall.ventasHold.length === 0" class="text-center py-8 text-surface-400">No hay ventas retenidas.</div>
      <div v-else class="flex flex-col gap-2 max-h-96 overflow-y-auto">
        <div v-for="hold in holdRecall.ventasHold" :key="hold.id" class="flex items-center justify-between p-3 rounded-lg border border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300 bg-surface-50 dark:bg-surface-700/30">
          <div class="flex-1 min-w-0">
            <div class="flex items-center gap-2">
              <span class="font-semibold text-sm">{{ hold.id }}</span>
              <span class="text-[10px] text-surface-400">{{ hold.fecha }} {{ hold.hora }}</span>
              <span class="text-[10px] font-bold px-1.5 py-0.5 rounded bg-primary-50 text-primary dark:bg-primary-900/20">{{ hold.itemsCount }} items</span>
            </div>
            <p class="text-xs text-surface-500 mt-0.5">{{ hold.cliente?.nombre || hold.clienteExpress || 'CONSUMIDOR FINAL' }} · {{ hold.metodoPago }}<span v-if="hold.usuario"> · {{ hold.usuario }}</span></p>
          </div>
          <div class="flex items-center gap-2 shrink-0">
            <span class="font-bold text-sm text-primary">{{ formatMoney(hold.total) }}</span>
            <Button icon="pi pi-undo" severity="info" text rounded size="small" class="!w-7 !h-7" @click="recallHold(hold)" v-tooltip="'Recuperar venta'" />
            <Button icon="pi pi-trash" severity="danger" text rounded size="small" class="!w-7 !h-7" @click="holdRecall.eliminarHold(hold.id)" v-tooltip="'Eliminar'" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button v-if="holdRecall.ventasHold.length > 0" label="Limpiar todas" severity="danger" text @click="holdRecall.limpiarHolds()" />
        <Button label="Cerrar" severity="secondary" text @click="holdRecall.dialogHold = false" />
      </template>
    </Dialog>

    <!-- ==================== CLIENTE HISTORIAL ==================== -->
    <Dialog v-model:visible="clienteHistorial.dialogHistorialCliente" :header="`Historial: ${clienteHistorial.clienteHistorialNombre}`" modal :style="{ width: 'min(48rem, 95vw)' }">
      <div v-if="clienteHistorial.cargandoHistorial" class="flex items-center justify-center py-10 gap-2 text-surface-400"><i class="pi pi-spin pi-spinner"></i><span>Cargando historial...</span></div>
      <div v-else-if="clienteHistorial.historialCliente.length === 0" class="text-center py-8 text-surface-400">Este cliente no tiene compras anteriores.</div>
      <div v-else class="flex flex-col gap-2 max-h-96 overflow-y-auto">
        <div v-for="compra in clienteHistorial.historialCliente" :key="compra.id" class="p-3 rounded-lg border border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300 cursor-pointer transition-colors" @click="seleccionarCompraHistorial(compra)">
          <div class="flex items-center justify-between">
            <div>
              <span class="font-semibold text-sm">#{{ compra.no_factura }}</span>
              <span class="text-xs text-surface-400 ml-2">{{ clienteHistorial.formatFecha(compra.fecha_emision, compra.hora) }}</span>
            </div>
            <span class="font-bold text-primary">{{ formatMoney(compra.total || 0) }}</span>
          </div>
          <div class="flex items-center gap-2 mt-1 text-xs text-surface-500">
            <span class="px-1.5 py-0.5 rounded" :class="compra.metodo_pago === 'CREDITO' ? 'bg-red-50 text-red-600 dark:bg-red-900/20' : 'bg-blue-50 text-blue-600 dark:bg-blue-900/20'">{{ compra.metodo_pago || 'EFECTIVO' }}</span>
            <span v-if="compra.ncf">NCF: {{ compra.ncf }}</span>
            <span>{{ compra.productos?.length || 0 }} producto(s)</span>
          </div>
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="clienteHistorial.dialogHistorialCliente = false" /></template>
    </Dialog>

    <!-- ==================== CAJA: APERTURA ==================== -->
    <Dialog v-model:visible="caja.dialogAperturaCaja" header="Apertura de caja" modal :style="{ width: 'min(26rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div v-if="caja.hayTurnoAbierto" class="rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 p-3 text-sm text-green-700 dark:text-green-300">
          <p class="font-semibold">Turno activo</p>
          <p class="text-xs mt-1">Ya hay un turno de caja abierto. Debes cerrarlo antes de abrir otro.</p>
        </div>
        <div v-else class="space-y-3">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Monto inicial ({{ systemCurrency }})</label>
            <InputNumber v-model="caja.montoApertura" :min="0" fluid @focus="(e) => e.target.select()" />
          </div>
          <Button label="Abrir turno" icon="pi pi-check-circle" :loading="caja.cargandoTurno" :disabled="caja.montoApertura < 0" @click="caja.abrirTurno(); sonidos.playCashRegister()" />
        </div>
      </div>
      <template #footer>
        <Button v-if="caja.hayTurnoAbierto" label="Cerrar turno" icon="pi pi-times-circle" severity="danger" @click="caja.dialogCierreCaja = true; caja.dialogAperturaCaja = false" />
        <Button label="Cerrar" severity="secondary" text @click="caja.dialogAperturaCaja = false" />
      </template>
    </Dialog>

    <!-- ==================== CAJA: CIERRE ==================== -->
    <Dialog v-model:visible="caja.dialogCierreCaja" header="Cierre de caja" modal :style="{ width: 'min(30rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div class="rounded-lg border p-3 text-sm space-y-1" :class="caja.cierreRevelado ? 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800' : 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800'">
          <p class="font-semibold">{{ caja.cierreRevelado ? 'Resultado del conteo' : 'Cierre ciego' }}</p>
          <template v-if="caja.cierreRevelado">
            <p class="text-xs text-surface-500">Esperado: {{ formatMoney(caja.sugerirMontoCierre()) }}</p>
            <p class="text-xs font-semibold" :class="caja.montoFinal === caja.sugerirMontoCierre() ? 'text-green-600' : 'text-red-600'">
              Diferencia: {{ formatMoney(caja.montoFinal - caja.sugerirMontoCierre()) }}
            </p>
          </template>
          <p v-else class="text-xs text-surface-500">Declara primero el efectivo contado. El esperado permanece oculto.</p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Monto final ({{ systemCurrency }})</label>
          <InputNumber v-model="caja.montoFinal" :min="0" :disabled="caja.cierreRevelado" fluid @focus="(e) => e.target.select()" />
        </div>
        <Button v-if="!caja.cierreRevelado" label="Declarar monto" icon="pi pi-lock" @click="caja.declararMontoFinal()" />
        <Button v-else label="Confirmar cierre" icon="pi pi-check" severity="danger" :loading="caja.cargandoTurno" @click="caja.cerrarTurno(); sonidos.playCashRegister()" />
      </div>
      <template #footer><Button label="Volver" severity="secondary" text @click="caja.dialogCierreCaja = false; caja.dialogAperturaCaja = true" /></template>
    </Dialog>

    <!-- ==================== MINI DASHBOARD ==================== -->
    <Dialog v-model:visible="miniDashboard.mostrarDashboard" header="Ventas del dia" modal :style="{ width: 'min(32rem, 95vw)' }" @after-show="miniDashboard.cargarDashboard()">
      <div v-if="miniDashboard.cargandoDashboard" class="flex items-center justify-center py-10 gap-2 text-surface-400"><i class="pi pi-spin pi-spinner"></i><span>Cargando...</span></div>
      <div v-else class="space-y-4">
        <div class="grid grid-cols-3 gap-3">
          <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 p-4 text-white shadow-lg">
            <p class="text-[10px] uppercase tracking-wide opacity-80">Total ventas</p>
            <p class="text-2xl font-bold mt-1">{{ formatMoney(miniDashboard.ventasDelDia) }}</p>
          </div>
          <div class="rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 p-4 text-white shadow-lg">
            <p class="text-[10px] uppercase tracking-wide opacity-80">Transacciones</p>
            <p class="text-2xl font-bold mt-1">{{ miniDashboard.cantidadTransacciones }}</p>
          </div>
          <div class="rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 p-4 text-white shadow-lg">
            <p class="text-[10px] uppercase tracking-wide opacity-80">Ganancia</p>
            <p class="text-2xl font-bold mt-1">{{ formatMoney(miniDashboard.gananciaDelDia) }}</p>
          </div>
        </div>
        <div v-if="Object.keys(miniDashboard.metodosUsados).length > 0" class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
          <p class="text-xs font-semibold uppercase tracking-wide text-surface-500 mb-2">Metodos de pago</p>
          <div class="flex flex-wrap gap-2">
            <span v-for="(count, met) in miniDashboard.metodosUsados" :key="met" class="inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium bg-primary-50 text-primary dark:bg-primary-900/20">{{ met }}: {{ count }}</span>
          </div>
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="miniDashboard.mostrarDashboard = false" /></template>
    </Dialog>

    <!-- ==================== STOCK ALERTAS ==================== -->
    <Dialog v-model:visible="stockAlertas.dialogAlertasStock" header="Alertas de stock bajo" modal :style="{ width: 'min(30rem, 95vw)' }" @after-show="stockAlertas.verificarStockBajo(accesorios, systemMode.isGeneralStore ? [] : imeisDisponibles, serialesDisponibles)">
      <div v-if="stockAlertas.alertasStock.length === 0" class="text-center py-8 text-surface-400 flex flex-col items-center gap-2">
        <i class="pi pi-check-circle text-3xl text-green-500"></i>
        <span>No hay alertas de stock bajo</span>
      </div>
      <div v-else class="flex flex-col gap-2 max-h-80 overflow-y-auto">
        <div v-for="alerta in stockAlertas.alertasStock" :key="`${alerta.tipo}-${alerta.id}`" class="flex items-center justify-between p-3 rounded-lg border" :class="alerta.stock === 0 ? 'border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20' : 'border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20'">
          <div>
            <p class="font-semibold text-sm">{{ alerta.nombre }}</p>
            <p class="text-xs text-surface-500">{{ alerta.tipo === 'imei' ? 'IMEI' : alerta.tipo === 'serial' ? 'Serial' : systemMode.isGeneralStore ? 'Producto' : 'Accesorio' }}</p>
          </div>
          <span class="font-bold text-sm" :class="alerta.stock === 0 ? 'text-red-600' : 'text-amber-600'">{{ alerta.stock }} / {{ alerta.alerta }}</span>
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="stockAlertas.dialogAlertasStock = false" /></template>
    </Dialog>

    <!-- ==================== DEVOLUCIONES ==================== -->
    <Dialog v-model:visible="dev.dialogDevolucion" header="Devolucion / Nota de credito" modal :style="{ width: 'min(40rem, 95vw)' }">
      <div v-if="!dev.facturaDevolucion" class="space-y-3 pt-2">
        <div class="rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 p-3 text-sm text-blue-700 dark:text-blue-300">
          <i class="pi pi-info-circle mr-1"></i> Selecciona una factura para procesar la devolucion.
        </div>
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="dev.busquedaFactura" placeholder="Buscar por No. Factura, cliente o NCF..." fluid />
        </IconField>
        <div v-if="dev.cargandoFacturas" class="text-center py-8 text-surface-400">Cargando facturas...</div>
        <div v-else-if="devoluciones.facturasFiltradas().length === 0" class="text-center py-8 text-surface-400">No hay facturas de venta disponibles.</div>
        <div v-else class="flex flex-col gap-2 max-h-80 overflow-y-auto">
          <div
            v-for="f in devoluciones.facturasFiltradas()"
            :key="f.id"
            class="flex items-center justify-between p-3 rounded-lg border border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300 cursor-pointer transition-colors"
            @click="devoluciones.seleccionarFactura(f)"
          >
            <div class="min-w-0">
              <p class="font-semibold text-sm truncate">{{ f.no_factura }}</p>
              <p class="text-xs text-surface-400 truncate">{{ f.nombre_cliente || 'CONSUMIDOR FINAL' }}</p>
            </div>
            <div class="text-right shrink-0 ml-2">
              <p class="font-semibold text-sm">{{ formatMoney(f.total || 0) }}</p>
              <p class="text-[10px] text-surface-400">{{ f.fecha_emision || '' }}</p>
            </div>
          </div>
        </div>
        <p v-if="dev.resultadoDevolucion" class="text-sm text-red-500">{{ dev.resultadoDevolucion }}</p>
      </div>
      <div v-else class="space-y-4">
        <div class="flex items-center gap-2">
          <Button icon="pi pi-arrow-left" severity="secondary" text rounded size="small" @click="devoluciones.volverALista()" v-tooltip="'Volver a lista de facturas'" />
          <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm flex-1">
            <p class="font-semibold">Factura: #{{ dev.facturaDevolucion.no_factura }}</p>
            <p class="text-xs text-surface-500">{{ dev.facturaDevolucion.nombre_cliente || 'CONSUMIDOR FINAL' }} · {{ formatMoney(dev.facturaDevolucion.total || 0) }}</p>
          </div>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button
            label="Devolver todo"
            icon="pi pi-check-circle"
            severity="danger"
            :outlined="!devoluciones.todosProductosSeleccionados()"
            @click="devoluciones.seleccionarTodosProductos(true)"
          />
          <Button
            label="Devolucion parcial"
            icon="pi pi-list-check"
            severity="secondary"
            :outlined="devoluciones.todosProductosSeleccionados()"
            @click="devoluciones.seleccionarTodosProductos(false)"
          />
        </div>
        <div class="flex items-center justify-between gap-3">
          <p class="text-xs font-semibold text-surface-500 uppercase tracking-wide">Selecciona los productos a devolver:</p>
          <label class="inline-flex items-center gap-2 text-xs font-semibold cursor-pointer select-none">
            <input
              type="checkbox"
              class="w-4 h-4 accent-red-500"
              :checked="devoluciones.todosProductosSeleccionados()"
              :indeterminate="devoluciones.algunosProductosSeleccionados()"
              @change="cambiarSeleccionTodosDevolucion"
            />
            <span>
              {{ devoluciones.todosProductosSeleccionados() ? 'Quitar todos' : devoluciones.algunosProductosSeleccionados() ? 'Seleccionar restantes' : 'Seleccionar todos' }}
            </span>
          </label>
        </div>
        <div class="flex flex-col gap-2 max-h-48 overflow-y-auto">
          <div v-for="(p, i) in dev.productosDevolucion" :key="i" class="flex items-center justify-between p-2.5 rounded-lg border cursor-pointer transition-colors" :class="p._devolver ? 'border-red-300 bg-red-50 dark:border-red-700 dark:bg-red-900/20' : 'border-surface-200/50 dark:border-surface-700/30 hover:border-red-300'" @click="devoluciones.toggleDevolucionProducto(p)">
            <div class="flex items-center gap-2">
              <input
                type="checkbox"
                class="w-4 h-4 accent-red-500 shrink-0"
                :checked="p._devolver"
                @click.stop
                @change="devoluciones.toggleDevolucionProducto(p)"
              />
              <div>
                <p class="text-sm font-medium">{{ p.nombre }}</p>
            <p v-if="systemMode.isCellphoneStore && (p.imei || p.imeis?.length)" class="text-xs text-surface-400 font-mono">
                  IMEI: {{ (p.imeis?.length ? p.imeis : [p.imei]).filter(Boolean).join(', ') }}
                </p>
                <p v-if="p.serial || p.seriales?.length" class="text-xs text-surface-400 font-mono">
                  Serial: {{ (p.seriales?.length ? p.seriales : [p.serial]).filter(Boolean).join(', ') }}
                </p>
              </div>
            </div>
            <span class="font-semibold text-sm">{{ formatMoney((p.precio || 0) * (p.cantidad || 1)) }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Motivo de la devolucion</label>
          <InputText v-model="dev.motivoDevolucion" placeholder="Ej: Producto defectuoso, cambio de opinion..." fluid class="w-full" />
        </div>
        <div class="rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 p-3 text-sm flex justify-between">
          <span>Total a devolver</span>
          <span class="font-bold text-red-600">{{ formatMoney(dev.devolucionSeleccion.reduce((s: number, p: any) => s + (Number(p.precio || 0) * Number(p.cantidad || 1)), 0)) }}</span>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="devoluciones.cerrarDevolucion()" />
        <Button v-if="dev.facturaDevolucion" label="Procesar Devolucion" icon="pi pi-undo" severity="danger" :loading="dev.cargandoDevolucion" :disabled="dev.devolucionSeleccion.length === 0 || !dev.motivoDevolucion.trim()" @click="devoluciones.procesarDevolucion().then(() => { cargarProductos(); cargarImeisDisponibles(); sonidos.playSuccess() })" />
      </template>
    </Dialog>

    <!-- ==================== COMBOS ==================== -->
    <Dialog v-model:visible="combos.dialogSeleccionarCombo" header="Combos y paquetes" modal :style="{ width: 'min(30rem, 95vw)' }">
      <div v-if="combos.combos.length === 0" class="text-center py-8 text-surface-400 flex flex-col items-center gap-2">
        <i class="pi pi-th-large text-3xl"></i>
        <span>No hay combos configurados</span>
        <Button label="Crear combo" icon="pi pi-plus" size="small" @click="combos.nuevoCombo()" />
      </div>
      <div v-else class="flex flex-col gap-2">
        <div class="flex justify-end mb-2"><Button label="Nuevo combo" icon="pi pi-plus" size="small" @click="combos.nuevoCombo()" /></div>
        <div v-for="combo in combos.combos.filter(c => c.activo)" :key="combo.id" class="flex items-center justify-between p-3 rounded-lg border border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300 cursor-pointer" @click="agregarComboAlCarrito(combo)">
          <div>
            <p class="font-semibold text-sm">{{ combo.nombre }}</p>
            <p class="text-xs text-surface-400">{{ combo.items.length }} producto(s)</p>
          </div>
          <span class="font-bold text-primary">{{ formatMoney(combo.precio) }}</span>
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="combos.dialogSeleccionarCombo = false" /></template>
    </Dialog>

    <Dialog v-model:visible="combos.dialogCombo" :header="combos.comboEditando?.id ? 'Editar combo' : 'Nuevo combo'" modal :style="{ width: 'min(36rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Nombre del combo</label>
          <InputText v-model="combos.comboEditando!.nombre" placeholder="Ej: Kit de inicio" fluid />
        </div>
        <div class="flex gap-3">
          <div class="flex-1 flex flex-col gap-1">
            <label class="text-sm font-semibold">Precio del combo ({{ systemCurrency }})</label>
            <InputNumber v-model="combos.comboEditando!.precio" :min="0" fluid />
          </div>
          <div v-if="puedeVerDetalleImei" class="flex-1 flex flex-col gap-1">
            <label class="text-sm font-semibold">Costo del combo ({{ systemCurrency }})</label>
            <InputNumber v-model="combos.comboEditando!.costo" :min="0" fluid />
          </div>
        </div>
        <div class="p-3 rounded-lg bg-surface-50 dark:bg-surface-700/30">
          <p class="text-xs font-semibold text-surface-500 mb-2">Productos incluidos</p>
          <div v-for="(item, idx) in combos.comboEditando!.items" :key="idx" class="flex flex-col gap-2 mb-3 p-2.5 rounded-lg border border-surface-200/50 dark:border-surface-700/30">
            <div class="flex items-center gap-2">
          <Select v-model="item.tipo" :options="productTypeOptions" placeholder="Tipo" class="w-36" />
              <Button v-if="item.tipo && item.tipo !== 'manual'" icon="pi pi-search" severity="info" text rounded size="small" @click="(combos.comboEditando as any)._buscandoIdx = idx; dialogBuscadorCombo = true" v-tooltip="'Buscar producto'" />
            </div>
            <div class="flex items-center gap-2">
              <InputText v-model="item.nombre" placeholder="Nombre del producto" class="flex-1" />
              <InputNumber v-model="item.cantidad" :min="1" class="w-16" placeholder="Cant" />
            </div>
            <div class="flex items-center gap-2">
              <InputNumber v-model="item.precio" :min="0" class="w-28" placeholder="Precio" />
              <InputNumber v-if="puedeVerDetalleImei" v-model="item.costo" :min="0" class="w-28" placeholder="Costo" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="combos.comboEditando!.items.splice(idx, 1)" />
            </div>
          </div>
          <Button label="Agregar item" icon="pi pi-plus" severity="secondary" text size="small" @click="combos.comboEditando!.items.push({ id: '', tipo: 'manual', nombre: '', cantidad: 1, precio: 0, costo: 0, refId: null })" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="combos.dialogCombo = false" />
        <Button v-if="combos.comboEditando" label="Guardar combo" icon="pi pi-save" @click="if (combos.comboEditando) { combos.agregarCombo(combos.comboEditando); combos.dialogCombo = false; sonidos.playSuccess() }" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogBuscadorCombo" header="Buscar producto" modal :style="{ width: 'min(30rem, 95vw)' }" @after-show="busquedaProdCombo = ''">
      <div class="space-y-3">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busquedaProdCombo" placeholder="Buscar producto..." fluid />
        </IconField>
        <div class="flex flex-col gap-2 max-h-64 overflow-y-auto">
          <div v-for="prod in productosFiltradosCombo" :key="prod.id" class="flex items-center justify-between p-2.5 rounded-lg border border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300 cursor-pointer transition-colors" @click="seleccionarProductoCombo(prod)">
            <div>
              <p class="text-sm font-medium">{{ prod.nombre }}</p>
              <p class="text-xs text-surface-400">{{ formatMoney(prod.precio_venta || 0) }} | Stock: {{ prod.cantidad || prod.stock || 'N/A' }}</p>
            </div>
            <i class="pi pi-chevron-right text-surface-400"></i>
          </div>
          <div v-if="productosFiltradosCombo.length === 0" class="text-center py-6 text-surface-400 text-sm">No se encontraron productos</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogBuscadorCombo = false" />
      </template>
    </Dialog>

    <!-- ==================== LOCK SCREEN ==================== -->
    <div v-if="lockScreen.isLocked" class="fixed inset-0 z-[9999] bg-surface-900/95 backdrop-blur-sm flex items-center justify-center" @click.self="() => {}">
      <div class="bg-surface-0 dark:bg-surface-800 rounded-2xl shadow-2xl p-8 w-[90vw] max-w-sm border border-surface-200/50 dark:border-surface-700/30">
        <div class="flex flex-col items-center gap-4 text-center">
          <div class="w-16 h-16 rounded-2xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <i class="pi pi-lock text-3xl text-primary"></i>
          </div>
          <div>
            <h3 class="text-lg font-bold">Pantalla bloqueada</h3>
            <p class="text-sm text-surface-500 mt-1">Ingresa tu PIN para continuar</p>
          </div>
          <InputOtp v-model="lockScreen.pinLock" :length="4" integerOnly :disabled="lockScreen.pinLock.length === 4" @complete="lockScreen.desbloquear(lockScreen.pinLock); if (!lockScreen.isLocked) sonidos.playSuccess()" />
          <p v-if="lockScreen.pinError" class="text-sm text-red-500">{{ lockScreen.pinError }}</p>
          <Button label="Desbloquear" icon="pi pi-unlock" class="w-full" :disabled="lockScreen.pinLock.length < 4" @click="lockScreen.desbloquear(lockScreen.pinLock); if (!lockScreen.isLocked) sonidos.playSuccess()" />
        </div>
      </div>
    </div>

    <!-- ==================== AYUDA / ATAJOS (F12) ==================== -->
    <Dialog v-model:visible="dialogAyudaAtajos" header="Atajos de teclado (F12)" modal :style="{ width: 'min(32rem, 95vw)' }">
      <div class="grid grid-cols-2 gap-2">
        <div v-for="atajo in atajosDisponibles" :key="atajo.tecla" class="flex items-center gap-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-700/30 text-sm">
          <span class="font-mono font-bold text-xs px-1.5 py-0.5 rounded bg-surface-200 dark:bg-surface-600 text-surface-700 dark:text-surface-200 min-w-[4rem] text-center">{{ atajo.tecla }}</span>
          <span class="text-surface-600 dark:text-surface-300 text-xs">{{ atajo.desc }}</span>
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="dialogAyudaAtajos = false" /></template>
    </Dialog>

    <OrdenTallerForm
      :order-id="null"
      :visible="dialogOrdenTallerPos"
      :initial-data="ordenTallerInitialData"
      @close="dialogOrdenTallerPos = false"
      @saved="onOrdenTallerPosGuardada"
    />

    <Dialog
      v-model:visible="dialogOrdenTallerPostSave"
      header="Orden de taller creada"
      modal
      :style="{ width: 'min(28rem, 95vw)' }"
    >
      <div class="space-y-4 pt-2">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3 text-sm">
          <p class="font-semibold">{{ ordenTallerPosGuardada?.no_orden || ordenTallerPosGuardada?.id }}</p>
          <p class="text-xs text-surface-500">{{ ordenTallerPosGuardada?.nombre || 'SIN CLIENTE' }}</p>
          <p class="text-xs text-surface-500">{{ ordenTallerPosGuardada?.equipo || '' }} {{ ordenTallerPosGuardada?.marca_modelo || '' }}</p>
        </div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
          <Button label="Imprimir orden" icon="pi pi-print" severity="info" outlined class="justify-center" @click="imprimirOrdenTallerPos" />
          <Button label="Imprimir etiqueta" icon="pi pi-tag" severity="success" outlined class="justify-center" @click="abrirEtiquetaOrdenTallerPos" />
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogOrdenTallerPostSave = false; ordenTallerPosGuardada = null" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogEtiquetaTallerPos"
      header="Imprimir Etiqueta de Taller"
      modal
      :style="{ width: '34rem' }"
    >
      <div class="space-y-4">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
          <p class="text-sm font-semibold">{{ ordenTallerPosGuardada?.nombre || 'Sin cliente' }}</p>
          <p class="text-xs text-surface-500">Orden: {{ ordenTallerPosGuardada?.no_orden || ordenTallerPosGuardada?.id || '-' }}</p>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Impresora</label>
          <div class="flex gap-2">
            <Select
              v-model="printerTallerPos"
              :options="printersTallerPos"
              optionLabel="name"
              optionValue="name"
              placeholder="Seleccionar impresora"
              class="flex-1"
              filter
            />
            <Button icon="pi pi-refresh" severity="secondary" outlined :loading="escaneandoPrintersTallerPos" @click="escanearPrintersTallerPos" />
          </div>
        </div>

        <div>
          <p class="text-sm font-semibold mb-2">Plantilla</p>
          <div v-if="plantillasEtiquetasTallerPos.length === 0" class="text-center py-4 text-surface-400 text-sm">No hay plantillas. Crea una en Inventario &gt; Etiquetas.</div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-72 overflow-y-auto">
            <button
              v-for="p in plantillasEtiquetasTallerPos"
              :key="p.id"
              type="button"
              class="text-left rounded-lg border border-surface-200 dark:border-surface-700 p-3 hover:border-primary transition-colors"
              @click="imprimirEtiquetaOrdenTallerPos(p)"
            >
              <p class="font-semibold text-sm">{{ p.nombre }}</p>
              <p class="text-xs text-surface-500">{{ p.ancho }}mm x {{ p.alto }}mm</p>
            </button>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEtiquetaTallerPos = false" />
      </template>
    </Dialog>

    <RecibirEquipoDialog
      :visible="dialogRecibirEquipo"
      :initial-data="recibirEquipoInitialData"
      :ask-publish-after-save="true"
      @close="dialogRecibirEquipo = false"
      @saved="onRecibidoPosGuardado"
    />

    <Dialog
      v-model:visible="dialogAplicarNotaRecibido"
      header="Aplicar nota de credito"
      modal
      :style="{ width: 'min(30rem, 95vw)' }"
      :closable="false"
    >
      <div class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm space-y-2">
          <div class="flex justify-between gap-3">
            <span class="text-surface-500">Nota</span>
            <span class="font-semibold text-right">{{ notaCreditoRecibido?.no_factura || getNotaCreditoNoFromRecibido(recibidoParaDescuento) || 'RECIBIDO' }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-surface-500">Valor</span>
            <span class="font-bold text-primary">{{ formatMoney(notaCreditoRecibido?.total || getNotaCreditoValueFromRecibido(recibidoParaDescuento)) }}</span>
          </div>
          <div class="flex justify-between gap-3">
            <span class="text-surface-500">Subtotal actual</span>
            <span class="font-semibold">{{ formatMoney(subtotal) }}</span>
          </div>
        </div>
        <p class="text-sm text-surface-500 dark:text-surface-400">
          El equipo recibido genero una nota de credito. Puedes aplicarla ahora como descuento en la venta actual.
        </p>
      </div>
      <template #footer>
        <Button label="No aplicar" severity="secondary" text @click="omitirNotaRecibidoComoDescuento" />
        <Button label="Aplicar descuento" icon="pi pi-check" :disabled="subtotal <= 0" @click="aplicarNotaRecibidoComoDescuento" />
      </template>
    </Dialog>

    <!-- ==================== CAUSA DESCUENTO ==================== -->
    <Dialog v-model:visible="causaDescuento.dialogCausaDescuento" header="Motivo del descuento" modal :style="{ width: 'min(26rem, 95vw)' }">
      <div class="space-y-3 pt-2">
        <p class="text-sm text-surface-500">Selecciona el motivo para registrar el descuento:</p>
        <div class="flex flex-col gap-2">
          <div v-for="causa in causaDescuento.CAUSAS_DESCUENTO" :key="causa.id" class="flex items-center gap-3 p-3 rounded-lg border cursor-pointer transition-colors" :class="causaDescuento.causaSeleccionada === causa.id ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200/50 dark:border-surface-700/30 hover:border-primary-300'" @click="causaDescuento.causaSeleccionada = causa.id">
            <i class="pi" :class="causaDescuento.causaSeleccionada === causa.id ? 'pi-check-circle text-primary' : 'pi-circle text-surface-300'"></i>
            <span class="text-sm font-medium">{{ causa.label }}</span>
          </div>
        </div>
        <div v-if="causaDescuento.causaSeleccionada === 'otro'" class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Especificar</label>
          <InputText v-model="causaDescuento.causaOtraEspecificar" placeholder="Describe el motivo..." fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="causaDescuento.dialogCausaDescuento = false" />
        <Button label="Confirmar" icon="pi pi-check" :disabled="!causaDescuento.causaSeleccionada" @click="causaDescuento.confirmarCausa()" />
      </template>
    </Dialog>

  </div>
</template>

<style scoped>
.pos-product-grid {
  grid-template-columns: repeat(var(--pos-card-columns, 3), minmax(0, 1fr));
}

.pos-product-card {
  --pos-card-accent: #3b82f6;
  background: linear-gradient(145deg, #ffffff 0%, #f8fafc 100%);
  border-color: rgba(203, 213, 225, 0.8);
  box-shadow:
    inset 0 3px 0 var(--pos-card-accent),
    0 8px 24px -18px rgba(15, 23, 42, 0.72);
  transition: transform 180ms ease, box-shadow 180ms ease, border-color 180ms ease;
}

.pos-product-card--phone {
  --pos-card-accent: #8b5cf6;
}

.pos-product-card--electro {
  --pos-card-accent: #06b6d4;
}

.pos-product-card--accessory {
  --pos-card-accent: #10b981;
}

.pos-product-card:hover {
  transform: translateY(-3px);
  border-color: color-mix(in srgb, var(--pos-card-accent) 55%, transparent);
  box-shadow:
    inset 0 3px 0 var(--pos-card-accent),
    0 18px 34px -20px color-mix(in srgb, var(--pos-card-accent) 65%, #0f172a);
}

:global(.dark) .pos-product-card {
  background: linear-gradient(145deg, #1e293b 0%, #111827 100%);
  border-color: rgba(71, 85, 105, 0.7);
}

.pos-product-media {
  position: relative;
  overflow: hidden;
  border-right: 1px solid color-mix(in srgb, var(--pos-card-accent) 24%, transparent);
}

.pos-product-media--phone {
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(155deg, #ede9fe 0%, #ddd6fe 100%);
}

.pos-product-media--electro {
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(155deg, #cffafe 0%, #bae6fd 100%);
}

.pos-product-media--accessory {
  background:
    radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.9), transparent 38%),
    linear-gradient(155deg, #d1fae5 0%, #bbf7d0 100%);
}

.pos-product-media::after {
  position: absolute;
  inset: 0;
  border-radius: inherit;
  z-index: 1;
  background: linear-gradient(90deg, transparent 68%, rgba(15, 23, 42, 0.08));
  content: '';
  pointer-events: none;
}

.pos-product-type,
.pos-product-stock {
  position: absolute;
  z-index: 2;
  border: 1px solid rgba(255, 255, 255, 0.75);
  border-radius: 999px;
  color: #ffffff;
  box-shadow: 0 5px 12px -7px rgba(15, 23, 42, 0.8);
  line-height: 1;
}

.pos-product-type {
  bottom: 0.65rem;
  left: 0.65rem;
  padding: 0.3rem 0.5rem;
  background: color-mix(in srgb, var(--pos-card-accent) 88%, #0f172a);
  font-size: 0.55rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.pos-product-stock {
  top: 0.65rem;
  right: 0.65rem;
  padding: 0.32rem 0.48rem;
  background: #16a34a;
  font-size: 0.6rem;
  font-weight: 750;
}

.pos-product-content {
  position: relative;
  background: radial-gradient(circle at 100% 100%, color-mix(in srgb, var(--pos-card-accent) 7%, transparent), transparent 55%);
}

.pos-product-name {
  position: relative;
  z-index: 1;
  display: -webkit-box;
  min-height: 2.35rem;
  overflow: hidden;
  color: #0f172a;
  line-height: 1.2;
  overflow-wrap: anywhere;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}

:global(.dark) .pos-product-name {
  color: #f8fafc;
}

.pos-product-detail-chip {
  display: inline-flex;
  flex: 1 1 0;
  min-width: 0;
  max-width: 100%;
  align-items: center;
  gap: 0.3rem;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--pos-card-accent) 22%, transparent);
  border-radius: 999px;
  padding: 0.22rem 0.45rem;
  background: color-mix(in srgb, var(--pos-card-accent) 8%, #ffffff);
  color: #475569;
  font-size: 0.58rem;
  font-weight: 700;
  line-height: 1;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.pos-product-details {
  min-width: 0;
  flex-wrap: nowrap;
  overflow: hidden;
}

.pos-product-detail-chip .pi {
  color: var(--pos-card-accent);
  font-size: 0.55rem;
}

:global(.dark) .pos-product-detail-chip {
  background: color-mix(in srgb, var(--pos-card-accent) 14%, #0f172a);
  color: #cbd5e1;
}

.pos-product-eyebrow {
  color: color-mix(in srgb, var(--pos-card-accent) 86%, #334155);
  font-size: 0.58rem;
  font-weight: 800;
  letter-spacing: 0.09em;
  text-transform: uppercase;
}

.pos-product-price {
  font-size: clamp(0.72rem, 0.82vw, 0.95rem);
  letter-spacing: -0.025em;
}

.pos-products-scroll {
  --pos-scroll-thumb: color-mix(in srgb, var(--p-primary-500, #3b82f6) 58%, transparent);
  --pos-scroll-thumb-hover: color-mix(in srgb, var(--p-primary-500, #3b82f6) 82%, transparent);
  --pos-scroll-track: color-mix(in srgb, var(--p-surface-300, #cbd5e1) 18%, transparent);
  scrollbar-width: thin;
  scrollbar-color: var(--pos-scroll-thumb) var(--pos-scroll-track);
  scrollbar-gutter: stable;
  overscroll-behavior: contain;
}

.pos-products-scroll::-webkit-scrollbar {
  width: 6px;
}

.pos-products-scroll::-webkit-scrollbar-track {
  background: var(--pos-scroll-track);
  border-radius: 999px;
}

.pos-products-scroll::-webkit-scrollbar-thumb {
  background: var(--pos-scroll-thumb);
  border: 1px solid transparent;
  border-radius: 999px;
  background-clip: padding-box;
}

.pos-products-scroll::-webkit-scrollbar-thumb:hover {
  background: var(--pos-scroll-thumb-hover);
  background-clip: padding-box;
}

.pos-scroll-top-button {
  border: 1px solid color-mix(in srgb, #ffffff 45%, transparent);
  transition: transform 160ms ease, box-shadow 160ms ease, filter 160ms ease;
}

.pos-scroll-top-button:hover {
  transform: translateY(-2px);
  filter: brightness(1.06);
  box-shadow: 0 14px 26px -12px rgba(37, 99, 235, 0.8);
}

.pos-scroll-top-enter-active,
.pos-scroll-top-leave-active {
  transition: opacity 160ms ease, transform 160ms ease;
}

.pos-scroll-top-enter-from,
.pos-scroll-top-leave-to {
  opacity: 0;
  transform: translateY(8px) scale(0.9);
}

.pos-cart-summary {
  background-color: var(--pos-cart-summary-bg, #ffffff) !important;
  background-image: none !important;
  opacity: 1;
  isolation: isolate;
}

.backface-hidden {
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
}

.pos-action-card[style] > span.flex.flex-col span {
  color: inherit !important;
}

.pos-action-card[style] > span.flex.flex-col span + span {
  opacity: 0.72;
}

.flip-inner [style] h4 {
  color: inherit;
}

@media (max-width: 1023px) {
  .pos-product-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
