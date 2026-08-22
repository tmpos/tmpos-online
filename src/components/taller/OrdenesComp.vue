<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputOtp from 'primevue/inputotp'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import Tooltip from 'primevue/tooltip'
import Chip from 'primevue/chip'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import TicketTallerPrint from './TicketTallerPrint.vue'
import OrdenTallerForm from './OrdenTallerForm.vue'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { getImageUrl } from '@/services/tmCloudClient'
import { useEmpresa } from '@/composables/useEmpresa'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

import { envioElectron, encryptarPassword } from '@/funciones/funciones.js'

const toast = useToast()
const route = useRoute()
const { nombre: nombreEmpresa, cargar: cargarEmpresa } = useEmpresa()
const { addAlmacenId, filterByAlmacen, store: almacenStore } = useAlmacenFilter()

// ─── Estado general ───
const ordenes = ref<any[]>([])
const loading = ref(false)
const vista = ref<'lista' | 'formulario'>('lista')
const dialogOrdenVisible = ref(false)
const editingOrderId = ref<number | null>(null)
const viewMode = ref<'table' | 'cards'>('cards')
const isEditing = ref(false)
const selectedOrden = ref<any>(null)
const selectedOrdenes = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const dialogMoverAlmacenMulti = ref(false)
const almacenDestinoMulti = ref<any>(null)
const almacenesDestinoMulti = ref<any[]>([])
const moviendoAlmacenMulti = ref(false)
const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')

const dialogPiezaCard = ref(false)
const piezaOrdenActual = ref<any>(null)
const piezasLista = ref<any[]>([])
const buscarPiezaCard = ref('')

const dialogAbonoCard = ref(false)
const abonoOrdenActual = ref<any>(null)
const abonoMonto = ref(0)

const dialogFacturaPieza = ref(false)
const piezaSeleccionadaInfo = ref<any>(null)
const creandoFactura = ref(false)
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')
const busqueda = ref(String(route.query.search || ''))
const activeTab = ref('0')
const ticketTallerRef = ref<any>(null)
const dialogEtiquetaTaller = ref(false)
const ordenEtiqueta = ref<any>(null)
const plantillasEtiquetas = ref<any[]>([])
const printers = ref<any[]>([])
const printerSel = ref('')
const escaneando = ref(false)

const tecnicos = ref<{ id?: number; nombre: string; porcentaje: number; tipo_comision?: string; valor_comision?: number }[]>([])
const dialogNuevoTecnico = ref(false)
const nuevoTecnicoForm = ref({ nombre: '', telefono: '', email: '', porcentaje: 0 })
const nuevoTecnicoPorcentaje = ref(0)
const guardando = ref(false)
const dialogTotales = ref(false)
const formaTotales = ref({ precio_pieza: 0, mano_obra: 0, total: 0 })
const ordenParaTotales = ref<any>(null)
const dialogEntregar = ref(false)
const entregaForm = ref({ estado: 'ENTREGADO', abono: 0 })
const ordenParaEntrega = ref<any>(null)
const dialogWhatsappEstado = ref(false)
const ordenWhatsappEstado = ref<any>(null)
const whatsappTelefono = ref('')
const whatsappNota = ref('')
const whatsappEstadoAnterior = ref('')
const whatsappEstadoNuevo = ref('')

watch(() => formaTotales.value.total, (val) => {
  const calc = Math.max(0, (val || 0) - (formaTotales.value.precio_pieza || 0))
  if (calc !== formaTotales.value.mano_obra) formaTotales.value.mano_obra = calc
})
watch(() => formaTotales.value.precio_pieza, (val) => {
  const calc = Math.max(0, (formaTotales.value.total || 0) - (val || 0))
  if (calc !== formaTotales.value.mano_obra) formaTotales.value.mano_obra = calc
})
watch(() => formaTotales.value.mano_obra, (val) => {
  const calc = (formaTotales.value.precio_pieza || 0) + (val || 0)
  if (calc !== formaTotales.value.total) formaTotales.value.total = calc
})
const dialogPatron = ref(false)
const patronDots = ref<number[]>([])
const patronDrawing = ref(false)

function patronMouseEnter(num: number) {
  if (!patronDrawing.value) return
  if (!patronDots.value.includes(num)) {
    patronDots.value.push(num)
  }
}

function patronMouseDown(num: number) {
  patronDrawing.value = true
  patronDots.value = [num]
}

function patronMouseUp() {
  patronDrawing.value = false
}

function patronMouseLeaveGrid() {
  patronDrawing.value = false
}

function limpiarPatron() {
  patronDots.value = []
}

function guardarPatron() {
  const pattern = patronDots.value.join('-')
  form.value.clave = pattern ? `PATRON: ${pattern}` : ''
  dialogPatron.value = false
}

function abrirPatron() {
  patronDots.value = []
  patronDrawing.value = false
  dialogPatron.value = true
}

async function cargarTecnicos() {
  try {
    const res = await window.db.getAll('ordenes_taller')
    if (res.success) {
      const unique = new Set((res.data || []).map((o: any) => o.tecnico?.trim().toUpperCase()).filter(Boolean))
      tecnicos.value = Array.from(unique).sort()
    }
  } catch (_) {}
}

function abrirDialogNuevoTecnico() {
  nuevoTecnicoInput.value = ''
  nuevoTecnicoPorcentaje.value = 0
  dialogNuevoTecnico.value = true
}

function agregarTecnico() {
  const nombre = nuevoTecnicoInput.value.trim().toUpperCase()
  if (nombre && !tecnicos.value.includes(nombre)) {
    tecnicos.value.push(nombre)
    tecnicos.value.sort()
    form.value.tecnico = nombre
    form.value.porcentaje_tecnico = nuevoTecnicoPorcentaje.value
  }
  dialogNuevoTecnico.value = false
  nuevoTecnicoInput.value = ''
}

// ─── Opciones ───
const metodosPago = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Pago Movil', value: 'PAGO_MOVIL' },
]

const estadosOrden = [
  { label: 'Recibido', value: 'RECIBIDO' },
  { label: 'En Proceso', value: 'EN_PROCESO' },
  { label: 'Completado', value: 'COMPLETADO' },
  { label: 'Entregado', value: 'ENTREGADO' },
  { label: 'Cancelado', value: 'CANCELADO' },
]

const estadosPagoTecnico = [
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'Pagado', value: 'PAGADO' },
]

// ─── Campos para crear tabla ───
const camposArray = [
  'no_orden', 'nombre', 'cedula', 'telefono', 'email',
  'equipo', 'imei', 'serial', 'marca_modelo', 'clave',
  'accesorios', 'fallas', 'piezas',
  'tecnico', 'metodo_pago', 'fecha_entrada', 'fecha_entrega', 'estado',
  'precio_pieza', 'mano_obra', 'abono', 'pendiente', 'total', 'pagos',
  'beneficio_empresa', 'beneficio_tecnico', 'porcentaje_tecnico', 'estado_pago_tecnico',
]

// ─── Config ───
const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCorto = ref('')

// ─── Formulario ───
async function generarNoOrden(): Promise<string> {
  try {
    const res = await window.db.getAll('ordenes_taller')
    const max = (res.data || []).reduce((maxId: number, o: any) => Math.max(maxId, o.id || 0), 0)
    return `ORD-${String(max + 1).padStart(4, '0')}`
  } catch {
    return ''
  }
}

const formDefault = () => ({
  no_orden: '',
  nombre: '',
  cedula: '',
  telefono: '',
  email: '',
  equipo: 'CELULAR',
  imei: '',
  serial: '',
  marca_modelo: 'APPLE',
  clave: '',
  accesorios: '',
  fallas: '',
  piezas: '',
  tecnico: '',
  metodo_pago: 'EFECTIVO',
  fecha_entrada: new Date(),
  fecha_entrega: null as Date | null,
  estado: 'RECIBIDO',
  precio_pieza: 0,
  mano_obra: 0,
  abono: 0,
  pendiente: 0,
  total: 0,
  pagos: '',
  beneficio_empresa: 0,
  beneficio_tecnico: 0,
  porcentaje_tecnico: 0,
  tipo_comision_tecnico: 'PORCENTAJE_MANO_OBRA',
  valor_comision_tecnico: 0,
  estado_pago_tecnico: 'PENDIENTE',
})

const form = ref(formDefault())

// ─── Computados ───
const ordenesFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return ordenes.value
  return ordenes.value.filter(o =>
    o.nombre?.toLowerCase().includes(texto) ||
    o.cedula?.toLowerCase().includes(texto) ||
    o.telefono?.toLowerCase().includes(texto) ||
    o.equipo?.toLowerCase().includes(texto) ||
    o.imei?.toLowerCase().includes(texto) ||
    o.serial?.toLowerCase().includes(texto) ||
    o.tecnico?.toLowerCase().includes(texto) ||
    String(o.id).includes(texto)
  )
})

const ordenesParaEliminar = computed(() => {
  if (selectedOrden.value) return [selectedOrden.value]
  return selectedOrdenes.value || []
})

const totalSeleccionadoEliminar = computed(() =>
  ordenesParaEliminar.value.reduce((sum, orden) => sum + Number(orden?.total || 0), 0)
)

const totalCalculado = computed(() => {
  return (form.value.precio_pieza || 0) + (form.value.mano_obra || 0)
})

const pendienteCalculado = computed(() => {
  return totalCalculado.value - (form.value.abono || 0)
})

// ─── Watchers para calculos automaticos ───
watch([() => form.value.precio_pieza, () => form.value.mano_obra, () => form.value.abono], () => {
  form.value.total = totalCalculado.value
  form.value.pendiente = pendienteCalculado.value
})

watch(() => form.value.tecnico, (nombre) => {
  if (nombre) {
    const encontrado = tecnicos.value.find(t => t.nombre === nombre)
    if (encontrado) {
      form.value.porcentaje_tecnico = encontrado.porcentaje
      form.value.tipo_comision_tecnico = encontrado.tipo_comision || 'PORCENTAJE_MANO_OBRA'
      form.value.valor_comision_tecnico = Number(encontrado.valor_comision ?? encontrado.porcentaje ?? 0)
    }
  }
})

function recalcularComisionTecnico() {
  const tipo = form.value.tipo_comision_tecnico || 'PORCENTAJE_MANO_OBRA'
  const valor = Number(form.value.valor_comision_tecnico ?? form.value.porcentaje_tecnico ?? 0)
  const mano = Number(form.value.mano_obra || 0)
  const piezas = Number(form.value.precio_pieza || 0)
  const comision = tipo === 'MONTO_FIJO' ? valor : (tipo === 'PORCENTAJE_PIEZAS' ? piezas : mano) * valor / 100
  form.value.beneficio_tecnico = Math.round(comision * 100) / 100
  form.value.beneficio_empresa = Math.round((mano - form.value.beneficio_tecnico) * 100) / 100
}

watch([
  () => form.value.porcentaje_tecnico,
  () => form.value.valor_comision_tecnico,
  () => form.value.tipo_comision_tecnico,
  () => form.value.mano_obra,
  () => form.value.precio_pieza,
], recalcularComisionTecnico)

// ─── Funciones CRUD ───
async function cargarOrdenes() {
  loading.value = true
  try {
  const [ordenesRes, tecnicosRes] = await Promise.all([
    window.db.getAll('ordenes_taller'),
    window.db.getAll('tecnicos'),
  ])
  if (ordenesRes.success) {
    ordenes.value = verTodosAlmacenes.value
      ? (ordenesRes.data || [])
      : filterByAlmacen(ordenesRes.data || [])
  }
  if (tecnicosRes.success) {
    tecnicos.value = (tecnicosRes.data || [])
      .map((t: any) => ({
        id: t.id,
        nombre: (t.nombre || '').toUpperCase(),
        porcentaje: Number(t.porcentaje || 0),
        tipo_comision: t.tipo_comision || 'PORCENTAJE_MANO_OBRA',
        valor_comision: Number(t.valor_comision ?? t.porcentaje ?? 0),
      }))
      .filter(t => t.nombre)
      .sort((a, b) => a.nombre.localeCompare(b.nombre))
  }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  selectedOrdenes.value = []
  selectedOrden.value = null
  cargarOrdenes()
})

async function abrirCrear() {
  editingOrderId.value = null
  dialogOrdenVisible.value = true
}

function abrirEditar(orden: any) {
  editingOrderId.value = orden.id
  dialogOrdenVisible.value = true
}

function confirmarBorrar(orden: any) {
  selectedOrden.value = orden
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

function confirmarBorrarSeleccionadas() {
  if (!selectedOrdenes.value.length) return
  selectedOrden.value = null
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function abrirMoverAlmacenSeleccionadas() {
  if (!selectedOrdenes.value.length) return
  almacenDestinoMulti.value = null
  try {
    await almacenStore.load()
    const activeUid = String(almacenStore.activeUid || '')
    almacenesDestinoMulti.value = almacenStore.almacenes.map((almacen: any) => {
      const uid = String(almacen.uid || almacen.almacen_uid || '')
      return {
        ...almacen,
        nombreOpcion: uid && uid === activeUid
          ? `${almacen.nombre || 'Almacen'} (Actual)`
          : almacen.nombre || 'Almacen',
      }
    })
    dialogMoverAlmacenMulti.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function aplicarMoverAlmacenSeleccionadas() {
  if (!almacenDestinoMulti.value || moviendoAlmacenMulti.value || !selectedOrdenes.value.length) return
  const destinoId = Number(almacenDestinoMulti.value.id || almacenDestinoMulti.value)
  const destinoUid = String(almacenDestinoMulti.value.uid || '')
  const destinoNombre = String(almacenDestinoMulti.value.nombre || '')
  const seleccionadas = [...selectedOrdenes.value]
  moviendoAlmacenMulti.value = true
  try {
    for (const orden of seleccionadas) {
      const res = await window.db.update('ordenes_taller', orden.id, { almacen_id: destinoId, almacen_uid: destinoUid })
      if (!res.success) throw new Error(res.error || `No se pudo mover la orden ${orden.no_orden || orden.id}`)
    }
    selectedOrdenes.value = []
    dialogMoverAlmacenMulti.value = false
    toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: `${seleccionadas.length} orden(es) movidas a ${destinoNombre}`, life: 3000 })
    await cargarOrdenes()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron mover las ordenes', life: 4000 })
  } finally {
    moviendoAlmacenMulti.value = false
  }
}

const piezasFiltradasCard = computed(() => {
  const q = buscarPiezaCard.value.toLowerCase().trim()
  if (!q) return piezasLista.value
  return piezasLista.value.filter((p: any) => (p.nombre || '').toLowerCase().includes(q))
})

async function abrirPiezaModal(orden: any) {
  piezaOrdenActual.value = orden
  buscarPiezaCard.value = ''
  try {
    const res = await window.db.getAll('piezas')
    if (res.success && res.data) piezasLista.value = (res.data || []).filter((p: any) => (p.nombre || '').trim())
  } catch {}
  dialogPiezaCard.value = true
}

async function seleccionarPiezaCard(pieza: any) {
  const orden = piezaOrdenActual.value
  if (!orden) return
  const disponibles = Number(pieza.cantidad || 0) - Number(pieza.reservada || 0)
  if (disponibles <= 0) {
    toast.add({ severity: 'warn', summary: 'Sin disponibilidad', detail: 'Todas las unidades de esta pieza están reservadas.', life: 3000 })
    return
  }
  const texto = pieza.nombre || ''
  const nuevasPiezas = orden.piezas ? orden.piezas + '\n' + texto : texto
  const valorPieza = Number(pieza.precio_venta) || 0
  const nuevoPrecioPieza = (Number(orden.precio_pieza) || 0) + valorPieza
  const nuevoTotal = nuevoPrecioPieza + (Number(orden.mano_obra) || 0)
  const nuevoPendiente = nuevoTotal - (Number(orden.abono) || 0)
  await window.db.update('ordenes_taller', orden.id, {
    piezas: nuevasPiezas,
    precio_pieza: nuevoPrecioPieza,
    total: nuevoTotal,
    pendiente: nuevoPendiente,
  })
  await window.db.update('piezas', pieza.id, { reservada: Number(pieza.reservada || 0) + 1 })
  await window.db.insert('reservas_piezas', addAlmacenId({
    orden_id: orden.id,
    pieza_id: pieza.id,
    pieza_nombre: texto,
    cantidad: 1,
    estado: 'RESERVADA',
    usuario: auth.user?.nombre || auth.user?.usuario || '',
  }))
  orden.piezas = nuevasPiezas
  orden.precio_pieza = nuevoPrecioPieza
  orden.total = nuevoTotal
  orden.pendiente = nuevoPendiente
  dialogPiezaCard.value = false
  piezaSeleccionadaInfo.value = { orden, texto, valor: valorPieza, piezaId: pieza.id, cantidad: pieza.cantidad || 0 }
  dialogFacturaPieza.value = true
}

async function crearFacturaPieza() {
  if (creandoFactura.value) return
  const info = piezaSeleccionadaInfo.value
  if (!info) return
  creandoFactura.value = true
  const { orden, texto, valor, piezaId, cantidad } = info
  const fecha = new Date().toISOString().split('T')[0]
  const ahora = new Date()
  const hora = ahora.toTimeString().split(' ')[0].slice(0, 5)
  const factura = {
    no_factura: `F-${Date.now().toString(36).toUpperCase()}`,
    nombre_cliente: orden.nombre || '',
    telefono_cliente: orden.telefono || '',
    productos: JSON.stringify([{ nombre: texto, cantidad: 1, precio: valor, costo: 0 }]),
    total: valor,
    subtotal: valor,
    descuento: 0,
    ganancia: valor,
    metodo_pago: 'EFECTIVO',
    fecha_emision: fecha,
    hora,
    estado_factura: 'PENDIENTE',
    vendedor: '',
  }
  const res = await window.db.insert('facturas', addAlmacenId(factura))
  if (res.success) {
    const piezaActualRes = await window.db.getById('piezas', piezaId)
    const piezaActual = piezaActualRes.success ? piezaActualRes.data : {}
    const cantidadActual = Number(piezaActual?.cantidad ?? cantidad)
    const nuevaCantidad = Math.max(0, cantidadActual - 1)
    await window.db.update('piezas', piezaId, {
      cantidad: nuevaCantidad,
      reservada: Math.max(0, Number(piezaActual?.reservada || 0) - 1),
    })
    const reservas = await window.db.getWhere('reservas_piezas', 'orden_id = ? AND pieza_id = ? AND estado = ?', [orden.id, piezaId, 'RESERVADA'])
    const reserva = reservas.success ? reservas.data?.[0] : null
    if (reserva) await window.db.update('reservas_piezas', reserva.id, { estado: 'CONSUMIDA', consumida_at: new Date().toISOString() })
    const ahora = new Date()
    await window.db.insert('movimientos_piezas', addAlmacenId({
      pieza_id: piezaId,
      pieza_nombre: texto,
      tipo: 'SALIDA',
      cantidad_antes: cantidad,
      cantidad_despues: nuevaCantidad,
      referencia: `Orden #${orden.id}`,
      fecha: ahora.toISOString().split('T')[0],
      hora: ahora.toTimeString().split(' ')[0].slice(0, 5),
    }))
    const idx = piezasLista.value.findIndex((p: any) => p.id === piezaId)
    if (idx >= 0) piezasLista.value[idx].cantidad = nuevaCantidad
    toast.add({ severity: 'success', summary: 'Factura creada', detail: `Factura para pieza: ${texto}`, life: 3000 })
  } else {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo crear la factura', life: 3000 })
  }
  creandoFactura.value = false
  dialogFacturaPieza.value = false
}

function cerrarFacturaPieza() {
  dialogFacturaPieza.value = false
  creandoFactura.value = false
}

function imprimirOrden(orden: any) {
  ticketTallerRef.value?.printTicket(orden)
}

function abrirTotales(orden: any) {
  ordenParaTotales.value = orden
  formaTotales.value = {
    precio_pieza: orden.precio_pieza || 0,
    mano_obra: orden.mano_obra || 0,
    total: orden.total || 0,
  }
  dialogTotales.value = true
}

async function guardarTotales() {
  try {
    const mano = formaTotales.value.mano_obra || 0
    const pct = ordenParaTotales.value.porcentaje_tecnico || 0
    const beneficio_tecnico = Math.round((mano * pct / 100) * 100) / 100
    const beneficio_empresa = Math.round((mano - beneficio_tecnico) * 100) / 100
    await window.db.update('ordenes_taller', ordenParaTotales.value.id, {
      precio_pieza: formaTotales.value.precio_pieza || 0,
      mano_obra: mano,
      total: formaTotales.value.total || 0,
      beneficio_tecnico,
      beneficio_empresa,
    })
    toast.add({ severity: 'success', summary: 'Actualizado', detail: 'Totales actualizados', life: 2000 })
    dialogTotales.value = false
    await cargarOrdenes()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  }
}

function abrirEntrega(orden: any) {
  ordenParaEntrega.value = orden
  entregaForm.value = { estado: 'ENTREGADO', abono: orden.total || 0 }
  dialogEntregar.value = true
}

async function confirmarEntrega() {
  const orden = ordenParaEntrega.value
  if (!orden) return
  try {
    const abono = Number(entregaForm.value.abono) || 0
    const nuevoAbono = (orden.abono || 0) + abono
    const nuevoPendiente = Math.max(0, (orden.total || 0) - nuevoAbono)
    const nuevoEstado = nuevoPendiente <= 0 ? entregaForm.value.estado : 'PARCIAL'
    await window.db.update('ordenes_taller', orden.id, {
      estado: nuevoEstado,
      abono: nuevoAbono,
      pendiente: nuevoPendiente,
    })
    toast.add({ severity: 'success', summary: 'Entregada', detail: `Orden #${orden.no_orden} marcada como ${nuevoEstado}`, life: 3000 })
    dialogEntregar.value = false
    prepararWhatsappEstado({ ...orden, estado: nuevoEstado, abono: nuevoAbono, pendiente: nuevoPendiente }, orden.estado || '', nuevoEstado)
    await cargarOrdenes()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  }
}

function normalizarTelefonoWhatsapp(valor: string) {
  const digits = String(valor || '').replace(/\D/g, '')
  if (!digits) return ''
  if (digits.length === 10) return `1${digits}`
  return digits
}

function etiquetaEstado(estado: string) {
  return String(estado || '').replace(/_/g, ' ')
}

function generarMensajeWhatsappEstado(orden: any, estadoNuevo: string, nota: string) {
  const lineas = [
    `Hola ${orden?.nombre || ''}.`,
    '',
    `Le informamos que el estado de su equipo ha sido actualizado a: ${etiquetaEstado(estadoNuevo)}.`,
    '',
    `Orden: ${orden?.no_orden || orden?.id || '-'}`,
    `Equipo: ${orden?.equipo || '-'}`,
    `Marca/Modelo: ${orden?.marca_modelo || '-'}`,
    orden?.imei ? `IMEI: ${orden.imei}` : '',
    orden?.serial ? `Serial: ${orden.serial}` : '',
    orden?.tecnico ? `Tecnico: ${orden.tecnico}` : '',
    '',
    nota ? `Nota: ${nota}` : '',
    '',
    'Gracias por confiar en nosotros.',
  ]
  return lineas.filter(line => line !== '').join('\n')
}

function prepararWhatsappEstado(orden: any, estadoAnterior: string, estadoNuevo: string) {
  ordenWhatsappEstado.value = orden
  whatsappEstadoAnterior.value = estadoAnterior || ''
  whatsappEstadoNuevo.value = estadoNuevo || orden?.estado || ''
  whatsappTelefono.value = orden?.telefono || ''
  whatsappNota.value = mensajeNotaPorEstado(whatsappEstadoNuevo.value)
  dialogWhatsappEstado.value = true
}

function mensajeNotaPorEstado(estado: string) {
  switch (estado) {
    case 'RECIBIDO': return 'Hemos recibido su equipo y sera revisado por nuestro equipo tecnico.'
    case 'EN_PROCESO': return 'Su equipo ya esta en proceso de revision o reparacion.'
    case 'COMPLETADO': return 'Su equipo ya fue completado. Puede pasar por tienda para retirarlo.'
    case 'REPARADO': return 'Su equipo ya fue reparado. Puede pasar por tienda para retirarlo.'
    case 'ENTREGADO': return 'Su equipo fue marcado como entregado. Gracias por su visita.'
    case 'PARCIAL': return 'Su orden queda con balance pendiente. Puede contactarnos para mas detalles.'
    case 'CANCELADO': return 'La orden fue cancelada. Puede contactarnos si necesita mas informacion.'
    default: return 'Puede contactarnos si necesita mas informacion sobre su orden.'
  }
}

function enviarWhatsappEstado() {
  const telefono = normalizarTelefonoWhatsapp(whatsappTelefono.value)
  if (!telefono) {
    toast.add({ severity: 'warn', summary: 'Telefono requerido', detail: 'Agrega un telefono valido para WhatsApp', life: 3000 })
    return
  }
  const mensaje = encodeURIComponent(generarMensajeWhatsappEstado(ordenWhatsappEstado.value, whatsappEstadoNuevo.value, whatsappNota.value))
  window.open(`https://wa.me/${telefono}?text=${mensaje}`, '_blank')
  dialogWhatsappEstado.value = false
}

async function onOrdenGuardada(payload?: any) {
  dialogOrdenVisible.value = false
  await cargarOrdenes()
  await cargarTecnicos()
  if (payload?.cambioEstado) {
    prepararWhatsappEstado(payload.orden, payload.estadoAnterior, payload.estadoNuevo)
  }
}

async function cargarPlantillasEtiquetas() {
  const res = await window.db.getAll('plantillas_etiquetas')
  if (res.success) plantillasEtiquetas.value = res.data || []
}

async function escanearImpresoras() {
  escaneando.value = true
  try {
    const res = await window.electron.invoke('getPrinters')
    if (res.success) printers.value = res.data || []
  } catch (_) {}
  escaneando.value = false
}

function abrirEtiquetaTaller(orden: any) {
  ordenEtiqueta.value = orden
  printerSel.value = localStorage.getItem('etiquetas_printer') || ''
  cargarPlantillasEtiquetas()
  escanearImpresoras()
  dialogEtiquetaTaller.value = true
}

function generarBarcodeSVG(data: string, altoMm = 9): string {
  if (!data) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, data, { format: 'CODE128', width: 0.75, height: Math.max(12, altoMm * 1.8), displayValue: true, fontSize: 5, margin: 0 })
    return new XMLSerializer()
      .serializeToString(svg)
      .replace(/width="[^"]*"/, 'width="100%"')
      .replace(/height="[^"]*"/, 'height="100%"')
  } catch {
    return '<div>Error</div>'
  }
}

async function generarQR(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, { width: 200, margin: 1 })
  } catch {
    return ''
  }
}

function aplicarVariablesEtiqueta(valor: string, orden: any): string {
  const numeroOrden = orden?.no_orden || orden?.id || ''
  return String(valor || '')
    .replace(/\{EMPRESA\}/gi, nombreEmpresa.value || 'MI EMPRESA')
    .replace(/\{CLIENTE\}/g, orden?.nombre || '')
    .replace(/\{FALLAS\}/gi, orden?.fallas || '')
    .replace(/\{NO_ORDEN\}/g, numeroOrden)
    .replace(/\{ORDEN\}/g, numeroOrden)
    .replace(/\{NUMERO_ORDEN\}/g, numeroOrden)
}

async function imprimirEtiquetaTaller(plantilla: any) {
  if (!printerSel.value) {
    toast.add({ severity: 'warn', summary: 'Selecciona una impresora', life: 2000 })
    return
  }
  if (!ordenEtiqueta.value || !plantilla?.elementos) return

  await cargarEmpresa()

  localStorage.setItem('etiquetas_printer', printerSel.value)
  dialogEtiquetaTaller.value = false

  let elementos: any[]
  try { elementos = JSON.parse(plantilla.elementos) } catch { return }

  const mmToPx = (mm: number) => mm * 3.7795275591
  const ancho = plantilla.ancho || 50
  const alto = plantilla.alto || 30
  const orden = ordenEtiqueta.value

  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta Taller</title><style>'
  html += `@page{size:${ancho}mm ${alto}mm;margin:0}html,body{margin:0;padding:0;width:${ancho}mm;height:${alto}mm;font-family:Arial,sans-serif}`
  html += `.label{width:${mmToPx(ancho)}px;height:${mmToPx(alto)}px;position:relative;overflow:hidden;background:white}`
  html += '.elem{position:absolute;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:center}'
  html += '</style></head><body><div class="label">'

  const elClone = JSON.parse(JSON.stringify(elementos))
  for (const el of elClone) {
    if (typeof el.contenido === 'string') {
      el.contenido = aplicarVariablesEtiqueta(el.contenido, orden)
    }
    const style = `left:${mmToPx(el.x)}px;top:${mmToPx(el.y)}px;width:${mmToPx(el.ancho)}px;height:${mmToPx(el.alto)}px;`
    if (el.tipo === 'texto') {
      html += `<div class="elem" style="${style}font-size:${el.fontSize || 8}px;font-weight:${el.bold ? 'bold' : 'normal'};line-height:1;text-align:center">${el.contenido}</div>`
    } else if (el.tipo === 'barcode') {
      html += `<div class="elem" style="${style}overflow:hidden">${generarBarcodeSVG(el.contenido, el.alto)}</div>`
    } else if (el.tipo === 'qr') {
      const qrData = await generarQR(el.contenido)
      if (qrData) html += `<img class="elem" style="${style}object-fit:contain;max-width:100%;max-height:100%" src="${qrData}" />`
    }
  }
  html += '</div></body></html>'

  try {
    const res = await window.electron.invoke('print:ticket', html, printerSel.value || undefined, { width: ancho, height: alto })
    if (res.success) toast.add({ severity: 'success', summary: 'Impreso', detail: 'Etiqueta enviada a la impresora', life: 2000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo imprimir', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al imprimir', life: 3000 })
  }
}

function cancelar() {
  dialogOrdenVisible.value = false
}

async function sincronizarOrdenServidor(datos: any, esEdicion: boolean) {
  try {
    const configRes = await window.db.getAll('servidor_sync_config')
    const cfg = configRes.success && configRes.data?.length > 0 ? configRes.data[0] : null
    if (!cfg || !cfg.activo) return
    const tablasSync: string[] = cfg.tablas_sync ? JSON.parse(cfg.tablas_sync) : []
    const tablaRemota = 'taller'
    if (!tablasSync.includes(tablaRemota) && !tablasSync.includes('ordenes_taller')) return

    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)

    const campos = ['id','almacen','beneficio_empresa','porcentaje_tecnico','beneficio_tecnico','pago_tecnico','nombre','cedula','direccion','telefono','whatsapp','email','equipo','marca','modelo','serial','imei','clave','accesorios','observaciones','fallas','reparacion','piezas','tecnico','metodopago','fecha_entrada','fecha_entrega','no_factura','estado','preciopiezas','manodeobra','abono','saldo','total','usuario','created_at','updated_at','identificadordb','historial_pagos','historial_orden']

    const pendiente = Number(datos.total || 0) - Number(datos.abono || 0)
    const marcaModelo = String(datos.marca_modelo || '')
    const marca = marcaModelo.split(' ')[0] || ''
    const modelo = marcaModelo.split(' ').slice(1).join(' ') || marca
    const empresaRes = await window.db.getAll('empresa')
    const nombreEmpresa = (empresaRes.success && empresaRes.data?.[0]?.nombre) || ''

    const enviar: Record<string, any> = {
      nombre: String(datos.nombre || ''),
      cedula: String(datos.cedula || ''),
      direccion: '',
      telefono: String(datos.telefono || ''),
      whatsapp: String(datos.telefono || ''),
      email: String(datos.email || ''),
      equipo: String(datos.equipo || ''),
      marca,
      modelo,
      serial: String(datos.serial || ''),
      imei: String(datos.imei || ''),
      clave: String(datos.clave || ''),
      accesorios: String(datos.accesorios || ''),
      observaciones: '',
      fallas: String(datos.fallas || ''),
      reparacion: String(datos.piezas || ''),
      piezas: String(datos.piezas || ''),
      tecnico: String(datos.tecnico || ''),
      metodopago: String(datos.metodo_pago || 'EFECTIVO'),
      fecha_entrada: String(datos.fecha_entrada || ''),
      fecha_entrega: String(datos.fecha_entrega || ''),
      no_factura: String(datos.no_orden || ''),
      estado: String(datos.estado || 'RECIBIDO'),
      preciopiezas: String(datos.precio_pieza || '0'),
      manodeobra: String(datos.mano_obra || '0'),
      abono: String(datos.abono || '0'),
      saldo: String(Math.max(0, pendiente)),
      total: String(datos.total || '0'),
      usuario: '',
      almacen: nombreEmpresa,
      beneficio_empresa: String(datos.beneficio_empresa || '0'),
      beneficio_tecnico: String(datos.beneficio_tecnico || '0'),
      porcentaje_tecnico: String(datos.porcentaje_tecnico || '0'),
      pago_tecnico: String(datos.estado_pago_tecnico || 'PENDIENTE'),
      historial_pagos: String(datos.pagos || ''),
      historial_orden: '',
    }
    for (const key of Object.keys(enviar)) {
      if (!campos.includes(key)) delete enviar[key]
    }
    if (Object.keys(enviar).length === 0) return

    const existeRes = await fetch(`${baseUrl}/datoscampo/${tablaRemota}/no_factura/${encodeURIComponent(datos.no_orden || '')}`, {
      method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token },
    })
    let servidorId: string | null = null
    if (existeRes.ok) {
      const existeData = await existeRes.json()
      const existente = Array.isArray(existeData) ? existeData[0] : existeData?.data || existeData
      if (existente?.id) servidorId = String(existente.id)
    }

    if (servidorId) {
      enviar.id = servidorId
      await fetch(`${baseUrl}/actualizarcampos/${tablaRemota}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    } else {
      await fetch(`${baseUrl}/insertar/${tablaRemota}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    }
  } catch (_) {}
}

async function guardar() {
  guardando.value = true
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del cliente es requerido', life: 3000 })
    activeTab.value = '0'
    return
  }

  const total = totalCalculado.value
  const pendiente = pendienteCalculado.value

  try {
    const data: any = {
      no_orden: form.value.no_orden.trim(),
      nombre: form.value.nombre.trim().toUpperCase(),
      cedula: form.value.cedula.trim(),
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim(),
      equipo: form.value.equipo.trim().toUpperCase(),
      imei: form.value.imei.trim(),
      serial: form.value.serial.trim(),
      marca_modelo: form.value.marca_modelo.trim().toUpperCase(),
      clave: form.value.clave.trim(),
      accesorios: form.value.accesorios.trim().toUpperCase(),
      fallas: form.value.fallas.trim().toUpperCase(),
      piezas: form.value.piezas.trim(),
      tecnico: form.value.tecnico.trim().toUpperCase(),
      metodo_pago: form.value.metodo_pago,
      fecha_entrada: form.value.fecha_entrada ? form.value.fecha_entrada.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      fecha_entrega: form.value.fecha_entrega ? form.value.fecha_entrega.toISOString().split('T')[0] : '',
      estado: form.value.estado,
      precio_pieza: form.value.precio_pieza || 0,
      mano_obra: form.value.mano_obra || 0,
      abono: form.value.abono || 0,
      pendiente: pendiente,
      total: total,
      pagos: form.value.pagos.trim(),
      beneficio_empresa: form.value.beneficio_empresa || 0,
      beneficio_tecnico: form.value.beneficio_tecnico || 0,
      porcentaje_tecnico: form.value.porcentaje_tecnico || 0,
      tipo_comision_tecnico: form.value.tipo_comision_tecnico,
      valor_comision_tecnico: form.value.valor_comision_tecnico || 0,
      estado_pago_tecnico: form.value.estado_pago_tecnico,
    }

    if (isEditing.value) {
      const res = await window.db.update('ordenes_taller', selectedOrden.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Orden actualizada', life: 3000 })
      }
    } else {
      const res = await window.db.insert('ordenes_taller', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Orden creada', life: 3000 })
      }
    }
    vista.value = 'lista'
    await cargarOrdenes()
    await cargarTecnicos()
    await sincronizarOrdenServidor(data, isEditing.value)
  } finally {
    guardando.value = false
  }
}

async function solicitarOtpEliminarOrden() {
  const ordenes = ordenesParaEliminar.value
  if (!ordenes.length) return

  deleteOtpLoading.value = true
  deleteOtpError.value = ''
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: ordenes[0]?.id,
      facturaIds: ordenes.map(orden => orden.id),
      no_factura: ordenes.length === 1 ? (ordenes[0]?.no_orden || ordenes[0]?.id) : '',
      nombre_cliente: ordenes.length === 1 ? ordenes[0]?.nombre : '',
      cantidad: ordenes.length,
      total: totalSeleccionadoEliminar.value,
      entidad: 'orden de taller',
      entidadPlural: 'ordenes de taller',
    })
    if (!res?.success) throw new Error(res?.error || 'No se pudo enviar el codigo')

    deleteOtpEnviado.value = true
    deleteOtpEmail.value = res.data?.networkUrl || ''
    toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
  } catch (error: any) {
    deleteOtpError.value = error?.message || 'No se pudo enviar el codigo'
    toast.add({ severity: 'error', summary: 'Error', detail: deleteOtpError.value, life: 4000 })
  } finally {
    deleteOtpLoading.value = false
  }
}

async function borrar() {
  const ordenes = ordenesParaEliminar.value
  if (!ordenes.length) return
  if (!/^\d{4}$/.test(deleteOtp.value)) {
    deleteOtpError.value = 'Ingresa el codigo de 4 digitos'
    return
  }

  deleteOtpConfirmando.value = true
  deleteOtpError.value = ''
  try {
    const ids = ordenes.map(orden => orden.id)
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaIds: ids,
      codigo: deleteOtp.value,
    })
    if (!otpRes?.success) throw new Error(otpRes?.error || 'Codigo invalido')

    for (const id of ids) {
      const res = await window.db.delete('ordenes_taller', id)
      if (!res.success) throw new Error(res.error || 'Error al eliminar')
    }

    toast.add({
      severity: 'success',
      summary: 'Exito',
      detail: ids.length === 1 ? 'Orden eliminada' : `${ids.length} ordenes eliminadas`,
      life: 3000,
    })
    selectedOrden.value = null
    selectedOrdenes.value = []
    deleteDialogVisible.value = false
    await cargarOrdenes()
  } catch (error: any) {
    deleteOtpError.value = error?.message || 'Error al eliminar'
    toast.add({ severity: 'error', summary: 'Error', detail: deleteOtpError.value, life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

// ─── Utilidades ───
function getEstadoSeverity(estado: string) {
  switch (estado) {
    case 'RECIBIDO': return 'info'
    case 'EN_PROCESO': return 'warn'
    case 'COMPLETADO': return 'success'
    case 'ENTREGADO': return 'secondary'
    case 'CANCELADO': return 'danger'
    default: return 'secondary'
  }
}

function formatCurrency(val: number) {
  return val != null ? `$${Number(val).toFixed(2)}` : '$0.00'
}

function imagenesOrden(orden: any): string[] {
  const valor = orden?.imagen
  if (!valor) return []
  if (Array.isArray(valor)) return valor.filter(Boolean)
  const texto = String(valor).trim()
  if (!texto) return []
  try {
    const parsed = JSON.parse(texto)
    if (Array.isArray(parsed)) return parsed.filter(Boolean)
  } catch {}
  return [texto]
}

function primeraImagen(orden: any): string {
  return imagenesOrden(orden)[0] || ''
}

function cantidadImagenes(orden: any): number {
  return imagenesOrden(orden).length
}

function imagenOrdenUrl(valor: string): string {
  return getImageUrl(valor) || valor
}

// ─── Lifecycle ───
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

  await cargarTecnicos()
  await cargarOrdenes()
})

defineExpose({ cargarOrdenes })
</script>

<template>
  <div>
    <Toast />

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- VISTA LISTA                                                 -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <div v-if="vista === 'lista'">
      <Fieldset legend="Ordenes de Taller">
        <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busqueda" placeholder="Buscar orden..." />
          </IconField>
          <div class="flex items-center gap-2">
            <label class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
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
              v-if="selectedOrdenes.length"
              :label="`Cambiar Almacen (${selectedOrdenes.length})`"
              icon="pi pi-warehouse"
              severity="success"
              outlined
              @click="abrirMoverAlmacenSeleccionadas"
            />
            <Button
              v-if="selectedOrdenes.length"
              :label="`Eliminar (${selectedOrdenes.length})`"
              icon="pi pi-trash"
              severity="danger"
              outlined
              @click="confirmarBorrarSeleccionadas"
            />
            <Button label="Nueva Orden" icon="pi pi-plus" @click="abrirCrear" />
          </div>
        </div>

        <DataTable
          v-if="viewMode === 'table'"
          :value="ordenesFiltradas"
          v-model:selection="selectedOrdenes"
          :loading="loading"
          @row-click="abrirEditar($event.data)"
          stripedRows
          paginator
          :rows="10"
          :rowsPerPageOptions="[10, 25, 50]"
          dataKey="id"
          responsiveLayout="scroll"
        >
          <Column selectionMode="multiple" headerStyle="width: 3rem" />
          <Column header="Acciones" style="width: 12rem">
            <template #body="{ data }">
              <div class="flex gap-1">
                <Button
                  icon="pi pi-print"
                  severity="info"
                  text
                  rounded
                  @click.stop="imprimirOrden(data)"
                  v-tooltip="'Imprimir'"
                />
                <Button
                  icon="pi pi-qrcode"
                  severity="success"
                  text
                  rounded
                  @click.stop="abrirEtiquetaTaller(data)"
                  v-tooltip="'Etiqueta'"
                />
                <Button
                  icon="pi pi-pencil"
                  severity="info"
                  text
                  rounded
                  @click.stop="abrirEditar(data)"
                  v-tooltip="'Editar'"
                />
                <Button
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  rounded
                  @click.stop="confirmarBorrar(data)"
                  v-tooltip="'Eliminar'"
                />
              </div>
            </template>
          </Column>
          <Column field="id" header="#" style="width: 4rem" sortable />
          <Column field="no_orden" header="No. Orden" sortable style="width: 7rem" />
          <Column header="Fotos" style="width: 5rem">
            <template #body="{ data }">
              <div v-if="cantidadImagenes(data)" class="flex items-center gap-2">
                <img
                  :src="imagenOrdenUrl(primeraImagen(data))"
                  class="w-10 h-10 rounded-lg object-cover border border-surface-200 dark:border-surface-700"
                  alt="Foto de orden"
                />
                <span class="text-xs font-semibold text-surface-500">{{ cantidadImagenes(data) }}</span>
              </div>
              <span v-else class="text-xs text-surface-400">-</span>
            </template>
          </Column>
          <Column field="nombre" header="Cliente" sortable />
          <Column field="telefono" header="Telefono" sortable style="width: 9rem" />
          <Column field="equipo" header="Equipo" sortable />
          <Column field="marca_modelo" header="Marca/Modelo" sortable />
          <Column field="tecnico" header="Tecnico" sortable />
          <Column field="estado" header="Estado" sortable style="width: 9rem">
            <template #body="{ data }">
              <Tag :value="data.estado" :severity="getEstadoSeverity(data.estado)" />
            </template>
          </Column>
          <Column field="total" header="Total" sortable style="width: 7rem">
            <template #body="{ data }">
              {{ formatCurrency(data.total) }}
            </template>
          </Column>
          <Column field="pendiente" header="Pendiente" sortable style="width: 7rem">
            <template #body="{ data }">
              <span :class="data.pendiente > 0 ? 'text-red-500 font-semibold' : 'text-green-600'">
                {{ formatCurrency(data.pendiente) }}
              </span>
            </template>
          </Column>
          <Column field="fecha_entrada" header="Entrada" sortable style="width: 7rem" />

          <template #empty>
            <div class="text-center py-6 text-surface-500">No hay ordenes registradas.</div>
          </template>
        </DataTable>

        <div v-else>
          <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
          <div v-else-if="ordenesFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay ordenes registradas.</div>
          <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            <div
              v-for="orden in ordenesFiltradas"
              :key="orden.id"
              class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
              @click="abrirEditar(orden)"
            >
              <div class="flex items-center justify-between gap-2">
                <div class="flex items-center gap-2 min-w-0">
                  <span class="text-xs font-mono text-surface-400 shrink-0">#{{ orden.id }}</span>
                  <span class="text-xs font-semibold text-surface-500 truncate">{{ orden.no_orden || 'Sin no. orden' }}</span>
                </div>
                <Tag :value="orden.estado" :severity="getEstadoSeverity(orden.estado)" />
              </div>

              <div class="flex gap-3 min-w-0">
                <div v-if="cantidadImagenes(orden)" class="relative w-16 h-16 shrink-0 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800">
                  <img
                    :src="imagenOrdenUrl(primeraImagen(orden))"
                    class="w-full h-full object-cover"
                    alt="Foto de orden"
                  />
                  <span v-if="cantidadImagenes(orden) > 1" class="absolute bottom-1 right-1 rounded-md bg-black/70 px-1.5 py-0.5 text-[10px] font-bold text-white">
                    +{{ cantidadImagenes(orden) - 1 }}
                  </span>
                </div>
                <div class="min-w-0">
                  <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ orden.nombre }}</h4>
                  <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ orden.equipo || 'Sin equipo' }}</p>
                  <p v-if="cantidadImagenes(orden)" class="text-xs text-primary font-semibold mt-1">
                    <i class="pi pi-images mr-1"></i>{{ cantidadImagenes(orden) }} imagen(es)
                  </p>
                </div>
              </div>

              <div class="grid grid-cols-2 gap-2 text-sm">
                <div>
                  <span class="block text-surface-400 text-xs">Telefono</span>
                  <span class="font-medium truncate block">{{ orden.telefono || '-' }}</span>
                </div>
                <div>
                  <span class="block text-surface-400 text-xs">Tecnico</span>
                  <span class="font-medium truncate block">{{ orden.tecnico || '-' }}</span>
                </div>
                <div>
                  <span class="block text-surface-400 text-xs">Total</span>
                  <span class="font-semibold">{{ formatCurrency(orden.total) }}</span>
                </div>
                <div>
                  <span class="block text-surface-400 text-xs">Pendiente</span>
                  <span :class="orden.pendiente > 0 ? 'text-red-500 font-semibold' : 'text-green-600 font-semibold'">
                    {{ formatCurrency(orden.pendiente) }}
                  </span>
                </div>
                <div class="col-span-2">
                  <span class="block text-surface-400 text-xs">Piezas</span>
                  <span class="font-medium text-xs break-words">{{ orden.piezas || '-' }}</span>
                </div>
              </div>

              <div class="flex justify-evenly gap-1 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700 flex-wrap">
                  <Button
                    icon="pi pi-print"
                    severity="info"
                    text
                    rounded
                    size="small"
                    @click.stop="imprimirOrden(orden)"
                    v-tooltip="'Imprimir'"
                  />
                  <Button
                    icon="pi pi-qrcode"
                    severity="success"
                    text
                    rounded
                    size="small"
                    @click.stop="abrirEtiquetaTaller(orden)"
                    v-tooltip="'Etiqueta'"
                  />
                  <Button
                    icon="pi pi-dollar"
                    severity="success"
                    text
                    rounded
                    size="small"
                    @click.stop="abrirAbonoModal(orden)"
                    v-tooltip="'Agregar Abono'"
                  />
                  <Button
                    icon="pi pi-whatsapp"
                    severity="success"
                    text
                    rounded
                    size="small"
                    @click.stop="prepararWhatsappEstado(orden, orden.estado || '', orden.estado || '')"
                    v-tooltip="'Notificar cliente'"
                  />
                  <Button
                    icon="pi pi-cog"
                    severity="warn"
                    text
                    rounded
                    size="small"
                    @click.stop="abrirPiezaModal(orden)"
                    v-tooltip="'Agregar Pieza'"
                  />
                  <Button
                    icon="pi pi-pencil"
                    severity="info"
                    text
                    rounded
                    size="small"
                    @click.stop="abrirEditar(orden)"
                    v-tooltip="'Editar'"
                  />
                  <Button
                    icon="pi pi-calculator"
                    severity="warning"
                    text
                    rounded
                    size="small"
                    @click.stop="abrirTotales(orden)"
                    v-tooltip="'Totales'"
                  />
                  <Button
                    icon="pi pi-check-circle"
                    severity="success"
                    text
                    rounded
                    size="small"
                    @click.stop="abrirEntrega(orden)"
                    v-tooltip="'Entregar'"
                  />
                  <Button
                    icon="pi pi-trash"
                    severity="danger"
                    text
                    rounded
                    size="small"
                    @click.stop="confirmarBorrar(orden)"
                    v-tooltip="'Eliminar'"
                  />
              </div>
            </div>
          </div>
        </div>
      </Fieldset>
    </div>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- OrdenTallerForm Dialog                                      -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <OrdenTallerForm
      :order-id="editingOrderId"
      :visible="dialogOrdenVisible"
      @close="dialogOrdenVisible = false"
      @saved="onOrdenGuardada"
    />

    <Dialog v-model:visible="dialogWhatsappEstado" header="Notificar por WhatsApp" modal :style="{ width: 'min(34rem, 95vw)' }">
      <div v-if="ordenWhatsappEstado" class="space-y-4 pt-2">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800/60 p-3 text-sm space-y-1">
          <div class="flex justify-between gap-3"><span class="text-surface-500">Cliente</span><strong class="text-right">{{ ordenWhatsappEstado.nombre || '-' }}</strong></div>
          <div class="flex justify-between gap-3"><span class="text-surface-500">Orden</span><strong class="text-right">{{ ordenWhatsappEstado.no_orden || ordenWhatsappEstado.id || '-' }}</strong></div>
          <div class="flex justify-between gap-3"><span class="text-surface-500">Equipo</span><strong class="text-right">{{ ordenWhatsappEstado.equipo || '-' }}</strong></div>
          <div class="flex justify-between gap-3"><span class="text-surface-500">Estado</span><strong class="text-right text-primary">{{ etiquetaEstado(whatsappEstadoNuevo) }}</strong></div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Telefono WhatsApp</label>
          <InputText v-model="whatsappTelefono" placeholder="8090000000" fluid />
        </div>

        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Nota para el cliente</label>
          <Textarea v-model="whatsappNota" rows="4" fluid placeholder="Escribe una nota para el cliente..." />
        </div>

        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-3">
          <p class="text-xs font-semibold text-surface-400 mb-2">Vista previa</p>
          <pre class="whitespace-pre-wrap text-xs leading-relaxed text-surface-700 dark:text-surface-200 font-sans">{{ generarMensajeWhatsappEstado(ordenWhatsappEstado, whatsappEstadoNuevo, whatsappNota) }}</pre>
        </div>
      </div>
      <template #footer>
        <Button label="No enviar" severity="secondary" text @click="dialogWhatsappEstado = false" />
        <Button label="Enviar WhatsApp" icon="pi pi-whatsapp" severity="success" @click="enviarWhatsappEstado" />
      </template>
    </Dialog>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- Dialog Totales                                              -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <Dialog v-model:visible="dialogTotales" header="Ajustar Totales" modal :style="{ width: 'min(26rem, 95vw)' }">
      <div v-if="ordenParaTotales" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-1 text-sm">
          <div class="flex justify-between"><span class="text-surface-500">Cliente</span><span class="font-medium">{{ ordenParaTotales.nombre }}</span></div>
          <div class="flex justify-between"><span class="text-surface-500">Orden</span><span class="font-medium">#{{ ordenParaTotales.no_orden }}</span></div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-bold text-primary">Total a Cobrar al Cliente</label>
          <InputNumber v-model="formaTotales.total" :min="0" fluid @focus="(e: any) => e.target.select()" />
        </div>
        <div class="border-t border-surface-200 dark:border-surface-700 pt-3 space-y-4">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Total Piezas</label>
            <InputNumber v-model="formaTotales.precio_pieza" :min="0" fluid @focus="(e: any) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Total Mano de Obra</label>
            <InputNumber v-model="formaTotales.mano_obra" :min="0" fluid @focus="(e: any) => e.target.select()" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogTotales = false" />
        <Button label="Guardar Totales" icon="pi pi-check" @click="guardarTotales" />
      </template>
    </Dialog>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- Dialog Entregar Orden                                       -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <Dialog v-model:visible="dialogEntregar" header="Entregar Orden" modal :style="{ width: 'min(26rem, 95vw)' }">
      <div v-if="ordenParaEntrega" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-1 text-sm">
          <div class="flex justify-between"><span class="text-surface-500">Cliente</span><span class="font-medium">{{ ordenParaEntrega.nombre }}</span></div>
          <div class="flex justify-between"><span class="text-surface-500">Orden</span><span class="font-medium">#{{ ordenParaEntrega.no_orden }}</span></div>
          <div class="flex justify-between"><span class="text-surface-500">Total</span><span class="font-bold">${{ Number(ordenParaEntrega.total || 0).toFixed(2) }}</span></div>
          <div class="flex justify-between"><span class="text-surface-500">Pendiente</span><span class="font-bold text-red-500">${{ Number(ordenParaEntrega.pendiente || 0).toFixed(2) }}</span></div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Estado</label>
          <Select v-model="entregaForm.estado" :options="['ENTREGADO', 'PARCIAL', 'CANCELADO']" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Abono</label>
          <InputNumber v-model="entregaForm.abono" :min="0" :max="ordenParaEntrega.pendiente || 0" fluid @focus="(e: any) => e.target.select()" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEntregar = false" />
        <Button label="Confirmar Entrega" icon="pi pi-check" @click="confirmarEntrega" />
      </template>
    </Dialog>

    <!-- ════════════════════════════════════════════════════════════ -->
    <!-- Dialog Confirmar Borrar                                     -->
    <!-- ════════════════════════════════════════════════════════════ -->
    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Eliminar orden"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-start gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <div>
            <p class="font-semibold mb-1">
              Seguro que deseas eliminar
              <strong v-if="ordenesParaEliminar.length === 1">
                la orden de {{ ordenesParaEliminar[0]?.nombre || 'Sin cliente' }}
              </strong>
              <strong v-else>
                {{ ordenesParaEliminar.length }} ordenes seleccionadas
              </strong>
              ?
            </p>
            <p class="text-sm text-surface-500">
              Esta accion requiere un codigo OTP enviado al correo de la empresa.
            </p>
          </div>
        </div>

        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 bg-surface-50 dark:bg-surface-800/60">
          <div class="flex justify-between text-sm">
            <span class="text-surface-500">Cantidad</span>
            <strong>{{ ordenesParaEliminar.length }}</strong>
          </div>
          <div class="flex justify-between text-sm mt-2">
            <span class="text-surface-500">Total</span>
            <strong>{{ formatCurrency(totalSeleccionadoEliminar) }}</strong>
          </div>
        </div>

        <div v-if="deleteOtpEnviado" class="space-y-2">
          <p class="text-sm text-surface-600 dark:text-surface-300">
          Consulta el codigo en el Centro OTP: <strong>{{ deleteOtpEmail || 'Configuracion > OTP Local' }}</strong>.
          </p>
          <InputOtp v-model="deleteOtp" integerOnly :length="4" class="justify-center" />
        </div>

        <p v-if="deleteOtpError" class="text-sm text-red-500">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-send"
          severity="warning"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarOrden"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          :disabled="deleteOtp.length !== 4"
          @click="borrar"
        />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogMoverAlmacenMulti" header="Cambiar Almacen" modal :style="{ width: 'min(30rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar <strong>{{ selectedOrdenes.length }}</strong> orden(es) de taller al almacen seleccionado:</p>
        <Select v-model="almacenDestinoMulti" :options="almacenesDestinoMulti" optionLabel="nombreOpcion" placeholder="Seleccionar almacen destino..." fluid />
        <p v-if="almacenesDestinoMulti.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay almacenes registrados.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacenMulti" @click="dialogMoverAlmacenMulti = false" />
        <Button label="Aplicar" icon="pi pi-warehouse" :loading="moviendoAlmacenMulti" :disabled="!almacenDestinoMulti" @click="aplicarMoverAlmacenSeleccionadas" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogEtiquetaTaller" header="Imprimir Etiqueta de Taller" modal :style="{ width: '34rem' }">
      <div class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 bg-surface-50 dark:bg-surface-800/60">
          <p class="text-sm font-semibold">{{ ordenEtiqueta?.nombre || 'Sin cliente' }}</p>
          <p class="text-xs text-surface-500">Orden: {{ ordenEtiqueta?.no_orden || ordenEtiqueta?.id || '-' }}</p>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold">Impresora</label>
          <div class="flex items-center gap-2">
            <Select v-model="printerSel" :options="printers.map(p => p.name)" placeholder="Seleccionar impresora..." class="flex-1" fluid>
              <template #option="{ option }">
                <span class="text-sm">{{ option }}</span>
              </template>
            </Select>
            <Button icon="pi pi-refresh" severity="secondary" text rounded size="small" :loading="escaneando" @click="escanearImpresoras" v-tooltip="'Buscar impresoras'" />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold">Plantilla</label>
          <p class="text-sm text-surface-500">Usa variables como <strong>{CLIENTE}</strong> y <strong>{NO_ORDEN}</strong> en Inventario &gt; Etiquetas.</p>
          <div v-if="plantillasEtiquetas.length === 0" class="text-center py-4 text-surface-400 text-sm">No hay plantillas. Crea una en Inventario &gt; Etiquetas.</div>
          <div v-else class="flex flex-col gap-2 max-h-52 overflow-y-auto">
            <div
              v-for="p in plantillasEtiquetas"
              :key="p.id"
              class="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-all cursor-pointer"
              @click="imprimirEtiquetaTaller(p)"
            >
              <div>
                <p class="font-medium text-sm">{{ p.nombre }}</p>
                <p class="text-xs text-surface-400">{{ p.ancho }}x{{ p.alto }}mm</p>
              </div>
              <i class="pi pi-chevron-right text-surface-300"></i>
            </div>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEtiquetaTaller = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogPiezaCard" header="Agregar Pieza" :modal="true" :style="{ width: 'min(40rem, 95vw)' }">
      <div class="flex flex-col gap-3">
        <InputText v-model="buscarPiezaCard" placeholder="Buscar pieza..." fluid />
        <div class="max-h-80 overflow-y-auto flex flex-col gap-1">
          <div
            v-for="p in piezasFiltradasCard"
            :key="p.id"
            class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-700 border border-transparent hover:border-surface-200 dark:hover:border-surface-600"
            @click="seleccionarPiezaCard(p)"
          >
            <div>
              <p class="text-sm font-medium">{{ p.nombre }}</p>
              <p class="text-xs text-surface-500">Stock: {{ p.cantidad || 0 }}</p>
            </div>
            <span class="text-sm font-semibold text-emerald-600">${{ p.precio_venta || 0 }}</span>
          </div>
          <div v-if="piezasFiltradasCard.length === 0" class="text-center py-6 text-surface-400 text-sm">
            No se encontraron piezas.
          </div>
        </div>
      </div>
    </Dialog>

    <Dialog v-model:visible="dialogAbonoCard" header="Agregar Abono" :modal="true" :style="{ width: 'min(24rem, 95vw)' }">
      <div class="flex flex-col gap-4">
        <p class="text-sm text-surface-500">
          Cliente: <strong>{{ abonoOrdenActual?.nombre }}</strong><br/>
          Total: <strong>{{ $formatMoney(abonoOrdenActual?.total || 0) }}</strong> &nbsp;| 
          Abono actual: <strong>{{ $formatMoney(abonoOrdenActual?.abono || 0) }}</strong><br/>
          Pendiente: <strong :class="(abonoOrdenActual?.pendiente || 0) > 0 ? 'text-red-500' : 'text-green-600'">{{ $formatMoney(abonoOrdenActual?.pendiente || 0) }}</strong>
        </p>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Monto del Abono</label>
          <InputNumber v-model="abonoMonto" :min="0" fluid placeholder="0" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogAbonoCard = false" />
        <Button label="Guardar Abono" icon="pi pi-check" :disabled="abonoMonto <= 0" @click="guardarAbono" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogFacturaPieza" header="Crear Factura" :modal="true" :style="{ width: 'min(28rem, 95vw)' }">
      <div class="flex flex-col gap-4">
        <div class="flex items-center gap-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
          <i class="pi pi-file text-amber-600 text-xl"></i>
          <div>
            <p class="text-sm font-medium">Pieza: <strong>{{ piezaSeleccionadaInfo?.texto }}</strong></p>
            <p class="text-sm text-surface-500">Valor: <strong>${{ piezaSeleccionadaInfo?.valor }}</strong></p>
          </div>
        </div>
        <p class="text-sm">¿Deseas crear una factura por esta pieza?</p>
      </div>
      <template #footer>
        <Button label="No" severity="secondary" text @click="cerrarFacturaPieza" :disabled="creandoFactura" />
        <Button label="Sí, crear factura" icon="pi pi-check" @click="crearFacturaPieza" :loading="creandoFactura" />
      </template>
    </Dialog>

    <TicketTallerPrint ref="ticketTallerRef" />
  </div>
</template>
