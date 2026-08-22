<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import TicketFacturaPrint from '@/components/ventas/TicketFacturaPrint.vue'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import { matchesSearch } from '@/composables/useSearch'

const toast = useToast()
const router = useRouter()
const auth = useAuthStore()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const seriales = ref<any[]>([])
const serialesRaw = ref<any[]>([])
const electrodomesticos = ref<any[]>([])
const electrodomesticosRaw = ref<any[]>([])
const clientes = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('table')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedSerial = ref<any>(null)
const selectedSeriales = ref<any[]>([])
const busqueda = ref('')
const estadoFiltro = ref('DISPONIBLE')
const dialogAccionVenta = ref(false)
const dialogClienteExpress = ref(false)
const dialogNuevoClienteExpress = ref(false)
const serialParaVenta = ref<any>(null)
const serialesParaVenta = ref<any[]>([])
const preciosSerialVenta = ref<Record<number, number>>({})
const clienteExpressSeleccionado = ref<any>({ id: null, nombre: 'AL CONTADO', telefono: '' })
const busquedaClienteExpress = ref('')
const nuevoClienteExpress = ref({ nombre: '', telefono: '', direccion: '', rnc: '' })

const clientesExpressFiltrados = computed(() => {
  const texto = busquedaClienteExpress.value.toLowerCase().trim()
  if (!texto) return clientes.value
  return clientes.value.filter((cliente: any) =>
    String(cliente.nombre || '').toLowerCase().includes(texto) ||
    String(cliente.telefono || '').toLowerCase().includes(texto) ||
    String(cliente.rnc || '').toLowerCase().includes(texto)
  )
})

function abrirAccionVenta(serial: any) {
  abrirAccionVentaLista([serial])
}

function abrirAccionVentaMultiple() {
  abrirAccionVentaLista(selectedSeriales.value)
}

function abrirAccionVentaLista(lista: any[]) {
  if (!lista.length) return
  const noDisponibles = lista.filter((serial: any) => String(serial.estado || '').toUpperCase() !== 'DISPONIBLE')
  if (noDisponibles.length) {
    toast.add({ severity: 'warn', summary: 'No disponible', detail: 'Solo puedes vender Seriales disponibles', life: 3000 })
    return
  }
  const sinEquipo = lista.find((serial: any) => !serial.id_equi || !serial.electrodomestico_nombre)
  if (sinEquipo) {
    toast.add({ severity: 'warn', summary: 'Equipo requerido', detail: 'Asigna un electrodomestico a este Serial antes de venderlo', life: 3000 })
    return
  }
  serialesParaVenta.value = [...lista]
  serialParaVenta.value = serialesParaVenta.value[0]
  preciosSerialVenta.value = Object.fromEntries(serialesParaVenta.value.map((serial: any) => [Number(serial.id), Number(serial.precio_venta || 0)]))
  dialogAccionVenta.value = true
}

function obtenerSerialesParaVenta() {
  return serialesParaVenta.value.length ? serialesParaVenta.value : (serialParaVenta.value ? [serialParaVenta.value] : [])
}

function precioSeleccionadoSerial(serial: any) {
  return Number(preciosSerialVenta.value[Number(serial.id)] ?? serial.precio_venta ?? 0)
}

function usarPrecioSerial(serial: any, precio: any) {
  preciosSerialVenta.value[Number(serial.id)] = Number(precio || 0)
}

function validarPreciosVentaSerial(serialesVenta: any[]) {
  if (serialesVenta.some((serial: any) => precioSeleccionadoSerial(serial) <= 0)) {
    toast.add({ severity: 'warn', summary: 'Precio requerido', detail: 'Cada Serial debe tener un precio mayor que cero', life: 3000 })
    return false
  }
  return true
}

function itemPosDesdeSerial(serial: any, precio = Number(serial.precio_venta || 0)) {
  return {
    tipo: 'serial', serial_id: serial.id, serial_ids: [serial.id], serial: serial.nombre, seriales: [serial.nombre],
    codigo: serial.nombre || '', nombre: serial.electrodomestico_nombre || '', electrodomestico_id: serial.id_equi,
    color: serial.color || '', colores: serial.color ? [serial.color] : [],
    capacidad: serial.capacidad || '', capacidades: serial.capacidad ? [serial.capacidad] : [],
    precio: Number(precio || 0), precio_normal: Number(serial.precio_venta || precio || 0),
    costo: Number(serial.costo || 0), cantidad: 1,
  }
}

function agregarAlCarritoPos() {
  const serialesVenta = obtenerSerialesParaVenta()
  if (!serialesVenta.length) return
  if (!validarPreciosVentaSerial(serialesVenta)) return
  try {
    const data = JSON.parse(localStorage.getItem('pos_cart_data') || '{}')
    const cart = Array.isArray(data.cart) ? data.cart : []
    const repetidos = serialesVenta.filter((serial: any) => cart.some((i: any) => i.tipo === 'serial' && (Number(i.serial_id) === Number(serial.id) || (i.serial_ids || []).map(Number).includes(Number(serial.id)))))
    if (repetidos.length) {
      toast.add({ severity: 'warn', summary: 'Ya agregado', detail: `${repetidos.length} Serial(es) ya están en el carrito del POS`, life: 3000 })
      return
    }
    data.cart = [...cart, ...serialesVenta.map((serial: any) => itemPosDesdeSerial(serial, precioSeleccionadoSerial(serial)))]
    localStorage.setItem('pos_cart_data', JSON.stringify(data))
    dialogAccionVenta.value = false
    router.push('/vender')
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo agregar el Serial al carrito', life: 3000 })
  }
}

function abrirClienteVentaExpress() {
  clienteExpressSeleccionado.value = { id: null, nombre: 'AL CONTADO', telefono: '' }
  busquedaClienteExpress.value = ''
  dialogAccionVenta.value = false
  dialogClienteExpress.value = true
}

function seleccionarClienteExpress(cliente: any) {
  clienteExpressSeleccionado.value = cliente
}

function abrirNuevoClienteExpress() {
  nuevoClienteExpress.value = { nombre: '', telefono: '', direccion: '', rnc: '' }
  dialogNuevoClienteExpress.value = true
}

async function guardarNuevoClienteExpress() {
  if (!nuevoClienteExpress.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atención', detail: 'El nombre del cliente es requerido', life: 3000 })
    return
  }
  const data = {
    nombre: nuevoClienteExpress.value.nombre.trim().toUpperCase(), telefono: nuevoClienteExpress.value.telefono.trim(),
    direccion: nuevoClienteExpress.value.direccion.trim().toUpperCase(), rnc: nuevoClienteExpress.value.rnc.trim(), email: '',
  }
  const res = await window.db.insert('clientes', addAlmacenId(data))
  if (!res.success) {
    toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear el cliente', life: 3000 })
    return
  }
  const cliente = { id: res.data.id, ...data }
  clientes.value.unshift(cliente)
  clienteExpressSeleccionado.value = cliente
  dialogNuevoClienteExpress.value = false
  toast.add({ severity: 'success', summary: 'Cliente creado', detail: data.nombre, life: 2000 })
}

function completarVentaExpress() {
  const serialesVenta = obtenerSerialesParaVenta()
  if (!serialesVenta.length) return
  if (!validarPreciosVentaSerial(serialesVenta)) return
  const cliente = clienteExpressSeleccionado.value || { id: null, nombre: 'AL CONTADO', telefono: '' }
  const data = {
    cart: serialesVenta.map((serial: any) => itemPosDesdeSerial(serial, precioSeleccionadoSerial(serial))), cliente, clienteExpress: '', metodoPago: 'EFECTIVO',
    descuento_fijo: 0, descuento_porc: 0, descuento_tipo: 'fijo', descuento_valor: 0,
    nota: '', es_cotizacion: false, venta_express_pendiente: true,
  }
  localStorage.setItem('pos_cart_data', JSON.stringify(data))
  dialogClienteExpress.value = false
  router.push('/vender')
}

const ticketPrintRef = ref<any>(null)
const reimprimiendo = ref(false)

async function reimprimirFactura() {
  if (!form.value.no_factura || form.value.estado !== 'VENDIDO') return
  reimprimiendo.value = true
  try {
    const res = await window.db.getAll('facturas')
    const factura = (res.data || []).find((f: any) => f.no_factura === form.value.no_factura)
    if (!factura) {
      toast.add({ severity: 'warn', summary: 'No encontrada', detail: `Factura ${form.value.no_factura} no encontrada`, life: 3000 })
      return
    }
    await ticketPrintRef.value?.printTicket(factura)
    toast.add({ severity: 'success', summary: 'Reimprimiendo', detail: `Factura ${form.value.no_factura}`, life: 2000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al reimprimir', life: 3000 })
  } finally {
    reimprimiendo.value = false
  }
}

const dialogNuevoProveedor = ref(false)
const nuevoProveedorForm = ref({ nombre: '', telefono: '', direccion: '' })

const estados = [
  { label: 'DISPONIBLE', value: 'DISPONIBLE' },
  { label: 'VENDIDO', value: 'VENDIDO' },
  { label: 'APARTADO', value: 'APARTADO' },
  { label: 'EN GARANTIA', value: 'EN GARANTIA' },
]

const estadosFiltro = [
  { label: 'Todos', value: '' },
  ...estados,
]

const camposArray = [
  'nombre',
  'id_equi',
  'equipo_uid',
  'equipo',
  'costo',
  'precio_venta',
  'precio_min',
  'precio_xmayor',
  'color',
  'capacidad',
  'bateria',
  'estado',
  'fecha_venta',
  'comprador',
  'proveedor',
  'no_compra',
  'precio_vendido',
  'hora_venta',
  'no_factura',
  'nota',
]

const form = ref({
  nombre: '',
  id_equi: null as number | null,
  equipo_uid: '',
  costo: 0,
  precio_venta: 0,
  precio_min: 0,
  precio_xmayor: 0,
  color: '',
  capacidad: '',
  bateria: '',
  estado: 'DISPONIBLE',
  fecha_venta: null as Date | null,
  comprador: '',
  proveedor: '',
  no_compra: '',
  precio_vendido: 0,
  hora_venta: '',
  no_factura: '',
  nota: '',
})

const serialDuplicado = ref(false)

watch(() => form.value.nombre, async (val) => {
  if (!val || val.length < 3) { serialDuplicado.value = false; return }
  try {
    const res = await window.db.getAll('serial')
    if (res.success) {
      const dup = (res.data || []).find((i: any) =>
        i.nombre === val.trim() && i.id !== (isEditing.value ? selectedSerial.value?.id : -1)
      )
      serialDuplicado.value = !!dup
    }
  } catch { serialDuplicado.value = false }
})

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCifrado = ref('')
const tokenCorto = ref('')
const empresaNombre = ref('MI EMPRESA')

const serialesFiltrados = computed(() => {
  return seriales.value.filter(i => {
    const coincideEstado = !estadoFiltro.value || i.estado === estadoFiltro.value
    const coincideTexto = matchesSearch(i, busqueda.value, ['nombre', 'color', 'capacidad', 'equipo', 'no_factura', 'comprador'])

    return coincideEstado && coincideTexto
  })
})

async function cargarElectrodomesticos() {
  try {
    const res = await window.db.getAll('electrodomesticos')
    if (res.success) {
      electrodomesticosRaw.value = res.data || []
      electrodomesticos.value = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
        ? electrodomesticosRaw.value
        : filterByAlmacen(electrodomesticosRaw.value)
    }
  } catch (error) {
    console.error(error)
  }
}

async function crearProveedorSerial() {
  if (!nuevoProveedorForm.value.nombre.trim()) return
  const data = {
    nombre: nuevoProveedorForm.value.nombre.trim().toUpperCase(),
    telefono: nuevoProveedorForm.value.telefono.trim(),
    direccion: nuevoProveedorForm.value.direccion.trim().toUpperCase(),
  }
  const res = await window.db.insert('proveedores', addAlmacenId(data))
  if (res.success) {
    proveedores.value.push({ id: res.data.id, ...data })
    form.value.proveedor = data.nombre
    dialogNuevoProveedor.value = false
    toast.add({ severity: 'success', summary: 'Proveedor creado', detail: data.nombre, life: 2000 })
  }
}

async function cargarSeriales() {
  loading.value = true
  try {
    const [resSerial, resElect, resProv] = await Promise.all([
      window.db.getAll('serial'),
      window.db.getAll('electrodomesticos'),
      window.db.getAll('proveedores'),
    ])

    if (resElect.success) {
      electrodomesticosRaw.value = resElect.data || []
      electrodomesticos.value = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
        ? electrodomesticosRaw.value
        : filterByAlmacen(electrodomesticosRaw.value)
    }
    if (resProv.success) proveedores.value = resProv.data || []
    if (resSerial.success) {
      serialesRaw.value = resSerial.data || []
      const equiposLocales = electrodomesticos.value
      const equiposPorId = new Map(equiposLocales.map((t: any) => [Number(t.id), t]))
      const equiposPorUid = new Map(equiposLocales.map((t: any) => [String(t.uid || ''), t]))
      const lista = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
        ? serialesRaw.value
        : filterByAlmacen(serialesRaw.value)
      seriales.value = lista.map((i: any) => ({
        ...i,
        id_equi: (i.equipo_uid && equiposPorUid.get(String(i.equipo_uid))?.id) || i.id_equi,
        electrodomestico_nombre: (i.equipo_uid && equiposPorUid.get(String(i.equipo_uid))?.nombre) || equiposPorId.get(Number(i.id_equi))?.nombre || i.equipo || '',
      }))
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  selectedSeriales.value = []
  cargarSeriales()
})

function formDefault() {
  return {
    nombre: '',
    id_equi: null as number | null,
    equipo_uid: '',
    costo: 0,
    precio_venta: 0,
    precio_min: 0,
    precio_xmayor: 0,
    color: '',
    capacidad: '',
    bateria: '',
    estado: 'DISPONIBLE',
    fecha_venta: null as Date | null,
    comprador: '',
    proveedor: '',
    no_compra: '',
    precio_vendido: 0,
    hora_venta: '',
    no_factura: '',
    nota: '',
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedSerial.value = null
  form.value = formDefault()
  serialDuplicado.value = false
  dialogVisible.value = true
}

function abrirEditar(serial: any) {
  isEditing.value = true
  selectedSerial.value = serial
  serialDuplicado.value = false
  const equipoLocal = electrodomesticos.value.find((equipo: any) =>
    serial.equipo_uid ? String(equipo.uid || '') === String(serial.equipo_uid) : Number(equipo.id) === Number(serial.id_equi))
  form.value = {
    nombre: serial.nombre || '',
    id_equi: equipoLocal?.id || serial.id_equi || null,
    equipo_uid: serial.equipo_uid || equipoLocal?.uid || '',
    costo: serial.costo || 0,
    precio_venta: serial.precio_venta || 0,
    precio_min: serial.precio_min || 0,
    precio_xmayor: serial.precio_xmayor || 0,
    color: serial.color || '',
    capacidad: serial.capacidad || '',
    bateria: serial.bateria || '',
    estado: serial.estado || 'DISPONIBLE',
    fecha_venta: serial.fecha_venta ? new Date(serial.fecha_venta) : null,
    comprador: serial.comprador || '',
    proveedor: serial.proveedor || '',
    no_compra: serial.no_compra || '',
    precio_vendido: serial.precio_vendido || 0,
    hora_venta: serial.hora_venta || '',
    no_factura: serial.no_factura || '',
    nota: serial.nota || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(serial: any) {
  selectedSerial.value = serial
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }
  if (serialDuplicado.value) {
    toast.add({ severity: 'warn', summary: 'Serial duplicado', detail: 'Este Serial ya esta registrado', life: 4000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()
  const equipo = electrodomesticos.value.find((item: any) => Number(item.id) === Number(form.value.id_equi))

  try {
    const data: any = {
      nombre: nombreMayus,
      id_equi: form.value.id_equi,
      equipo_uid: equipo?.uid || form.value.equipo_uid || '',
      equipo: equipo?.nombre || '',
      costo: form.value.costo || 0,
      precio_venta: form.value.precio_venta || 0,
      precio_min: form.value.precio_min || 0,
      precio_xmayor: form.value.precio_xmayor || 0,
      color: form.value.color.toUpperCase(),
      capacidad: form.value.capacidad.toUpperCase(),
      bateria: form.value.bateria,
      estado: form.value.estado,
      fecha_venta: form.value.fecha_venta ? form.value.fecha_venta.toISOString().split('T')[0] : null,
      comprador: form.value.comprador.toUpperCase(),
      proveedor: form.value.proveedor.toUpperCase(),
      no_compra: form.value.no_compra,
      precio_vendido: form.value.precio_vendido || 0,
      hora_venta: form.value.hora_venta,
      no_factura: form.value.no_factura,
      nota: form.value.nota,
    }

    if (isEditing.value) {
      const res = await window.db.update('serial', selectedSerial.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Serial actualizado', life: 3000 })
      }
    } else {
      const res = await window.db.insert('serial', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Serial creado', life: 3000 })
      }
    }
    dialogVisible.value = false
    await cargarSeriales()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

const dialogCambioEstadoMultiple = ref(false)
const nuevoEstadoMultiple = ref('DISPONIBLE')
const dialogCambioEquipoMultiple = ref(false)
const busquedaEquipoMultiple = ref('')
const equipoSeleccionadoMultiple = ref<any>(null)
const dialogCambioAlmacenMultiple = ref(false)
const almacenesLista = ref<any[]>([])
const almacenDestinoMultiple = ref<any>(null)
const equipoDestinoAlmacen = ref<any>(null)
const equiposTodosAlmacenes = ref<any[]>([])
const moviendoSerialesAlmacen = ref(false)
const proveedores = ref<any[]>([])
const dialogCambioProveedorMultiple = ref(false)
const busquedaProveedorMultiple = ref('')
const proveedorSeleccionadoMultiple = ref<any>(null)
const dialogCambioColorMultiple = ref(false)
const nuevoColorMultiple = ref('')
const dialogCambioCapacidadMultiple = ref(false)
const nuevaCapacidadMultiple = ref('')

function abrirCambiarEstadoMultiple() {
  nuevoEstadoMultiple.value = 'DISPONIBLE'
  dialogCambioEstadoMultiple.value = true
}

async function aplicarCambioEstadoMultiple() {
  for (const serial of selectedSeriales.value) {
    await window.db.update('serial', serial.id, { estado: nuevoEstadoMultiple.value })
  }
  dialogCambioEstadoMultiple.value = false
  selectedSeriales.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: `${selectedSeriales.value.length} Seriales actualizados`, life: 2000 })
  await cargarSeriales()
}

const proveedoresFiltrados = computed(() => {
  const texto = busquedaProveedorMultiple.value.toLowerCase().trim()
  if (!texto) return proveedores.value
  return proveedores.value.filter((p: any) => p.nombre?.toLowerCase().includes(texto))
})

const equiposFiltradosMultiple = computed(() => {
  const texto = busquedaEquipoMultiple.value.toLowerCase().trim()
  if (!texto) return electrodomesticos.value
  return electrodomesticos.value.filter((t: any) => t.nombre?.toLowerCase().includes(texto))
})

const equiposAlmacenDestino = computed(() => {
  const destinoId = Number(almacenDestinoMultiple.value?.id || almacenDestinoMultiple.value || 0)
  const destinoUid = String(almacenDestinoMultiple.value?.uid || '')
  if (!destinoId) return []
  return equiposTodosAlmacenes.value
    .filter((equipo: any) => equipo.almacen_uid
      ? String(equipo.almacen_uid) === destinoUid
      : Number(equipo.almacen_id) === destinoId || (!equipo.almacen_id && destinoId === 1))
    .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
})

function cambiarAlmacenDestinoSeleccionado() {
  equipoDestinoAlmacen.value = null
}

function abrirCambiarEquipoMultiple() {
  busquedaEquipoMultiple.value = ''
  equipoSeleccionadoMultiple.value = null
  dialogCambioEquipoMultiple.value = true
}

async function aplicarCambioEquipoMultiple() {
  if (!equipoSeleccionadoMultiple.value) return
  for (const serial of selectedSeriales.value) {
    await window.db.update('serial', serial.id, {
      id_equi: equipoSeleccionadoMultiple.value.id,
      equipo_uid: equipoSeleccionadoMultiple.value.uid || '',
      equipo: equipoSeleccionadoMultiple.value.nombre || '',
    })
  }
  dialogCambioEquipoMultiple.value = false
  selectedSeriales.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Equipo cambiado', life: 2000 })
  await cargarSeriales()
}

async function abrirCambiarAlmacenMultiple() {
  const [, equiposRes] = await Promise.all([
    almacenStore.load(),
    window.db.getAll('electrodomesticos'),
  ])
  equiposTodosAlmacenes.value = equiposRes.success ? (equiposRes.data || []) : []
  const almacenesOrigenUid = new Set(selectedSeriales.value.map((serial: any) =>
    String(serial.almacen_uid || almacenStore.activeUid || '')))
  almacenesLista.value = almacenStore.almacenes.filter((almacen: any) =>
    !almacenesOrigenUid.has(String(almacen.uid || '')))
  almacenDestinoMultiple.value = null
  equipoDestinoAlmacen.value = null
  dialogCambioAlmacenMultiple.value = true
}

async function cambiarAlmacenMultiple() {
  if (!almacenDestinoMultiple.value || !equipoDestinoAlmacen.value || selectedSeriales.value.length === 0 || moviendoSerialesAlmacen.value) return
  const destinoId = Number(almacenDestinoMultiple.value.id || almacenDestinoMultiple.value)
  const destinoUid = String(almacenDestinoMultiple.value.uid || '')
  const equipoDestino = equipoDestinoAlmacen.value
  const cantidad = selectedSeriales.value.length
  moviendoSerialesAlmacen.value = true

  try {
    for (const serial of selectedSeriales.value) {
      const res = await window.db.update('serial', serial.id, {
        almacen_id: destinoId,
        almacen_uid: destinoUid,
        id_equi: Number(equipoDestino.id),
        equipo_uid: equipoDestino.uid || '',
        equipo: equipoDestino.nombre || '',
      })
      if (!res.success) throw new Error(res.error || `No se pudo mover el serial ${serial.nombre || serial.id}`)
    }
    dialogCambioAlmacenMultiple.value = false
    selectedSeriales.value = []
    toast.add({ severity: 'success', summary: 'Almacen y equipo actualizados', detail: `${cantidad} serial(es) asignados a ${equipoDestino.nombre}`, life: 3000 })
    await cargarSeriales()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'Error al cambiar almacen y equipo', life: 4000 })
  } finally {
    moviendoSerialesAlmacen.value = false
  }
}

function abrirCambiarColorMultiple() {
  nuevoColorMultiple.value = ''
  dialogCambioColorMultiple.value = true
}

async function aplicarCambioColorMultiple() {
  if (!nuevoColorMultiple.value.trim()) return
  for (const serial of selectedSeriales.value) {
    await window.db.update('serial', serial.id, { color: nuevoColorMultiple.value.trim().toUpperCase() })
  }
  dialogCambioColorMultiple.value = false
  selectedSeriales.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Color cambiado', life: 2000 })
  await cargarSeriales()
}

function abrirCambiarCapacidadMultiple() {
  nuevaCapacidadMultiple.value = ''
  dialogCambioCapacidadMultiple.value = true
}

async function aplicarCambioCapacidadMultiple() {
  if (!nuevaCapacidadMultiple.value.trim()) return
  for (const serial of selectedSeriales.value) {
    await window.db.update('serial', serial.id, { capacidad: nuevaCapacidadMultiple.value.trim().toUpperCase() })
  }
  dialogCambioCapacidadMultiple.value = false
  selectedSeriales.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Capacidad cambiada', life: 2000 })
  await cargarSeriales()
}

function abrirCambiarProveedorMultiple() {
  busquedaProveedorMultiple.value = ''
  proveedorSeleccionadoMultiple.value = null
  dialogCambioProveedorMultiple.value = true
}

async function aplicarCambioProveedorMultiple() {
  if (!proveedorSeleccionadoMultiple.value) return
  for (const serial of selectedSeriales.value) {
    await window.db.update('serial', serial.id, { proveedor: proveedorSeleccionadoMultiple.value.nombre })
  }
  dialogCambioProveedorMultiple.value = false
  selectedSeriales.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Proveedor cambiado', life: 2000 })
  await cargarSeriales()
}

function confirmarBorrarMultiple() {
  if (selectedSeriales.value.length === 0) return
  deleteDialogVisible.value = true
}

async function borrarMultiple() {
  for (const serial of selectedSeriales.value) {
    await window.db.delete('serial', serial.id)
  }
  selectedSeriales.value = []
  deleteDialogVisible.value = false
  toast.add({ severity: 'success', summary: 'Eliminados', detail: `Seriales eliminados`, life: 2000 })
  await cargarSeriales()
}

const plantillasEtiquetas = ref<any[]>([])
const dialogSeleccionarPlantilla = ref(false)
const printers = ref<any[]>([])
const printerSel = ref('')
const escaneando = ref(false)
const escaneandoBT = ref(false)
const busquedaPlantilla = ref('')
const printerName = ref('')

const printerOptions = computed(() =>
  printers.value.map((p: any) => ({
    label: `${p.name}${p.model ? ` (${p.model})` : ''}${p.source?.includes('bluetooth') ? ' - Bluetooth' : ''}`,
    value: p.name,
  }))
)

function normalizePrinterName(value: unknown) {
  return String(value || '').trim()
}

function mergePrinters(items: any[]) {
  const current = new Map(printers.value.map((printer: any) => [
    normalizePrinterName(printer.name).toLowerCase(),
    printer,
  ]))

  for (const item of items) {
    const name = normalizePrinterName(typeof item === 'string' ? item : item?.name)
    if (!name) continue
    const previous = current.get(name.toLowerCase())
    current.set(name.toLowerCase(), {
      ...previous,
      ...(typeof item === 'string' ? { name } : item),
      name,
    })
  }

  printers.value = Array.from(current.values()).sort((a: any, b: any) => a.name.localeCompare(b.name))
}

function incluirImpresoraGuardada() {
  const saved = localStorage.getItem('etiquetas_printer') || ''
  if (saved) mergePrinters([{ name: saved, model: 'Guardada', source: 'saved' }])
  const direct = getDirectPrinter()
  if (direct?.name && direct?.portName) {
    mergePrinters([{ ...direct, model: `Bluetooth directo ${direct.portName}`, source: 'bluetooth-direct' }])
  }
}

function getDirectPrinter() {
  try {
    return JSON.parse(localStorage.getItem('etiquetas_printer_direct') || 'null')
  } catch {
    return null
  }
}

function getSelectedDirectPrinter() {
  const found = printers.value.find((printer: any) => printer.name === printerSel.value && printer.source === 'bluetooth-direct' && printer.portName)
  if (found) return found
  const direct = getDirectPrinter()
  return direct?.name === printerSel.value && direct?.portName ? direct : null
}

function escapeTspl(value: string) {
  return String(value || '').replace(/"/g, "'")
}

function formatPrecio(value: unknown) {
  return `RD$ ${Number(value || 0).toFixed(2)}`
}

function aplicarVariablesSerial(valor: string, serial: any): string {
  return String(valor || '')
    .replace(/\{PRODUCTO\}/gi, serial?.electrodomestico_nombre || '')
    .replace(/\{SERIAL\}/gi, serial?.nombre || '')
    .replace(/\{PRECIO\}/gi, formatPrecio(serial?.precio_venta))
    .replace(/\{PRECIO_VENTA\}/gi, formatPrecio(serial?.precio_venta))
    .replace(/\{EMPRESA\}/gi, empresaNombre.value || '')
    .replace(/\{NOMBRE_EMPRESA\}/gi, empresaNombre.value || '')
    .replace(/MI EMPRESA/g, empresaNombre.value || 'MI EMPRESA')
    .replace(/RD\$ 0\.00/g, formatPrecio(serial?.precio_venta))
}

function mmToDots(mm: number) {
  return Math.round(Number(mm || 0) * 8)
}

function generarTsplSerial(plantilla: any, elementos: any[], serial: any) {
  const ancho = Number(plantilla.ancho || 50)
  const alto = Number(plantilla.alto || 30)
  let tspl = `SIZE ${ancho} mm,${alto} mm\r\nGAP 2 mm,0\r\nCLS\r\n`

  for (const el of JSON.parse(JSON.stringify(elementos))) {
    if (typeof el.contenido === 'string') {
      el.contenido = aplicarVariablesSerial(el.contenido, serial)
    }
    const x = mmToDots(el.x)
    const y = mmToDots(el.y)
    const h = mmToDots(el.alto)
    const value = escapeTspl(el.contenido)

    if (el.tipo === 'texto') {
      const scale = Number(el.fontSize || 8) >= 14 ? 2 : 1
      tspl += `TEXT ${x},${y},"0",0,${scale},${scale},"${value}"\r\n`
    } else if (el.tipo === 'barcode' && value) {
      tspl += `BARCODE ${x},${y},"128",${Math.max(24, h)},1,0,2,2,"${value}"\r\n`
    } else if (el.tipo === 'qr' && value) {
      tspl += `QRCODE ${x},${y},L,4,A,0,"${value}"\r\n`
    }
  }

  tspl += 'PRINT 1\r\n'
  return tspl
}

async function cargarPlantillasEtiquetas() {
  const res = await window.db.getAll('plantillas_etiquetas')
  if (res.success) plantillasEtiquetas.value = res.data || []
}

async function escanearImpresoras() {
  escaneando.value = true
  try {
    const res = await window.electron.invoke('getPrinters')
    if (res.success) mergePrinters(res.data || [])
  } catch (_) {}
  incluirImpresoraGuardada()
  escaneando.value = false
}

async function escanearBluetooth() {
  escaneandoBT.value = true
  try {
    const res = await window.electron.invoke('scan:bluetooth')
    if (res.success && res.data?.length > 0) {
      mergePrinters(res.data || [])
      toast.add({ severity: 'success', summary: 'Bluetooth', detail: `${res.data.length} dispositivo(s) encontrado(s)`, life: 2000 })
    } else {
      toast.add({ severity: 'info', summary: 'Bluetooth', detail: 'No se encontraron dispositivos Bluetooth', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al buscar Bluetooth', life: 3000 })
  } finally {
    incluirImpresoraGuardada()
    escaneandoBT.value = false
  }
}

const plantillasFiltradas = computed(() => {
  const texto = busquedaPlantilla.value.toLowerCase().trim()
  if (!texto) return plantillasEtiquetas.value
  return plantillasEtiquetas.value.filter((p: any) => p.nombre?.toLowerCase().includes(texto))
})

function abrirImprimirEtiqueta() {
  const saved = localStorage.getItem('etiquetas_printer') || ''
  printerSel.value = saved
  incluirImpresoraGuardada()
  busquedaPlantilla.value = ''
  cargarPlantillasEtiquetas()
  escanearImpresoras()
  dialogSeleccionarPlantilla.value = true
}

function abrirImprimirEtiquetaIndividual(serial: any) {
  selectedSeriales.value = [serial]
  abrirImprimirEtiqueta()
}

function generarBarcodeSVG(data: string): string {
  if (!data) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, data, { format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 10, margin: 2 })
    let svgStr = new XMLSerializer().serializeToString(svg)
    svgStr = svgStr.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"')
    return svgStr
  } catch { return '<div>Error</div>' }
}

async function generarQR(data: string): Promise<string> {
  try { return await QRCode.toDataURL(data, { width: 200, margin: 1 }) } catch { return '' }
}

async function imprimirEtiquetaSerial(plantilla: any) {
  if (!printerSel.value) {
    toast.add({ severity: 'warn', summary: 'Selecciona una impresora', life: 2000 })
    return
  }
  if (!plantilla?.elementos) return
  dialogSeleccionarPlantilla.value = false

  localStorage.setItem('etiquetas_printer', printerSel.value)
  printerName.value = printerSel.value

  let elementos: any[]
  try { elementos = JSON.parse(plantilla.elementos) } catch { return }

  const mmToPx = (mm: number) => mm * 3.7795275591
  const ancho = plantilla.ancho || 50
  const alto = plantilla.alto || 30
  let impresas = 0
  let ultimoError = ''
  const directPrinter = getSelectedDirectPrinter()

  if (directPrinter?.portName) {
    localStorage.setItem('etiquetas_printer_direct', JSON.stringify({
      name: printerSel.value,
      portName: directPrinter.portName,
      protocol: 'TSPL',
    }))
    for (const serial of selectedSeriales.value) {
      try {
        const tspl = generarTsplSerial(plantilla, elementos, serial)
        const res = await window.electron.invoke('print:bluetooth-raw', directPrinter.portName, tspl) as any
        if (res.success) impresas++
        else ultimoError = res.error || 'No se pudo imprimir por Bluetooth directo'
      } catch (error: any) {
        ultimoError = error.message || 'No se pudo imprimir por Bluetooth directo'
      }
    }
    if (impresas > 0) toast.add({ severity: 'success', summary: 'Impreso', detail: `${impresas} etiqueta(s) enviada(s) por ${directPrinter.portName}`, life: 3000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: ultimoError || 'No se pudo imprimir por Bluetooth directo', life: 6000 })
    return
  }

  for (const serial of selectedSeriales.value) {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>'
    html += `@page{size:${ancho}mm ${alto}mm;margin:0}html,body{margin:0;padding:0;width:${ancho}mm;height:${alto}mm;font-family:Arial,sans-serif}`
    html += `.label{width:${mmToPx(ancho)}px;height:${mmToPx(alto)}px;position:relative;overflow:hidden;background:white}`
    html += '.elem{position:absolute;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:center}'
    html += '</style></head><body><div class="label">'

    const elClone = JSON.parse(JSON.stringify(elementos))
    for (const el of elClone) {
      if (typeof el.contenido === 'string') {
        el.contenido = aplicarVariablesSerial(el.contenido, serial)
      }
      const style = `left:${mmToPx(el.x)}px;top:${mmToPx(el.y)}px;width:${mmToPx(el.ancho)}px;height:${mmToPx(el.alto)}px;`
      if (el.tipo === 'texto') {
        html += `<div class="elem" style="${style}font-size:${(el.fontSize || 8) * 1.333}px;font-weight:${el.bold ? 'bold' : 'normal'}">${el.contenido}</div>`
      } else if (el.tipo === 'barcode') {
        html += `<div class="elem" style="${style}overflow:hidden">${generarBarcodeSVG(el.contenido)}</div>`
      } else if (el.tipo === 'qr') {
        const qrData = await generarQR(el.contenido)
        if (qrData) html += `<img class="elem" style="${style}object-fit:contain;max-width:100%;max-height:100%" src="${qrData}" />`
      }
    }
    html += '</div></body></html>'

    try {
      const res = await window.electron.invoke('print:ticket', html, printerName.value || undefined, { width: ancho, height: alto }) as any
      if (res.success) impresas++
      else ultimoError = res.error || 'No se pudo imprimir'
    } catch (error: any) {
      ultimoError = error.message || 'No se pudo imprimir'
    }
  }
  if (impresas > 0) toast.add({ severity: 'success', summary: 'Impreso', detail: `${impresas} etiqueta(s) enviada(s) a la impresora`, life: 2000 })
  else toast.add({ severity: 'error', summary: 'Error', detail: ultimoError || 'No se pudieron imprimir las etiquetas', life: 6000 })
}

async function borrar() {
  try {
    const res = await window.db.delete('serial', selectedSerial.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Serial eliminado', life: 3000 })
    }
    deleteDialogVisible.value = false
    await cargarSeriales()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

function getEstadoClass(estado: string) {
  switch (estado) {
    case 'DISPONIBLE': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    case 'VENDIDO': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
    case 'APARTADO': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
    case 'EN GARANTIA': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
  }
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo');
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || '';
      api.value = datosJSON.VITE_LINK_API || '';
      token.value = datosJSON.VITE_TOKEN || '';
      patronTelefono.value = datosJSON.VITE_PATRON_TELEFONO || '';
      linkImpresora.value = datosJSON.VITE_IMPRESORA_LOCAL || '';
      patroncedula.value = datosJSON.VITE_PATRON_CEDULA || '';
      tokenCorto.value = datosJSON.VITE_TOKEN_CORTO || '';
    }
  } catch (error) {
    console.error("Error cargando configuracion:", error);
  }

  try {
    const resEmpresa = await window.db.getAll('empresa')
    if (resEmpresa.success && resEmpresa.data?.length > 0 && resEmpresa.data[0].nombre) {
      empresaNombre.value = resEmpresa.data[0].nombre
    }
  } catch (_) {}

  try {
    const resClientes = await window.db.getAll('clientes')
    if (resClientes.success) clientes.value = resClientes.data || []
  } catch (_) {}

  await cargarElectrodomesticos()
  await cargarSeriales()
})

useCloudRefresh(['serial', 'electrodomesticos'], cargarSeriales)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Serial">
      <div class="toolbar-mobile">
        <div class="flex items-center gap-2 flex-wrap">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busqueda" placeholder="Buscar Serial..." />
          </IconField>
          <Select
            v-model="estadoFiltro"
            :options="estadosFiltro"
            optionLabel="label"
            optionValue="value"
            class="w-44"
            placeholder="Estado"
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
          <Button label="Nuevo Serial" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div v-if="selectedSeriales.length > 0" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium">{{ selectedSeriales.length }} seleccionado(s)</span>
        <Button label="Cambiar Estado" icon="pi pi-refresh" severity="info" size="small" @click="abrirCambiarEstadoMultiple" />
        <Button label="Cambiar Equipo" icon="pi pi-sitemap" severity="warn" size="small" @click="abrirCambiarEquipoMultiple" />
        <Button label="Almacen" icon="pi pi-warehouse" severity="success" size="small" @click="abrirCambiarAlmacenMultiple" />
        <Button label="Color" icon="pi pi-palette" severity="help" size="small" @click="abrirCambiarColorMultiple" />
        <Button label="Capacidad" icon="pi pi-database" severity="info" size="small" @click="abrirCambiarCapacidadMultiple" />
        <Button label="Prov." icon="pi pi-truck" severity="info" size="small" @click="abrirCambiarProveedorMultiple" />
        <Button label="Vender / Carrito" icon="pi pi-shopping-cart" severity="success" size="small" @click="abrirAccionVentaMultiple" />
        <Button label="Imprimir Etiqueta" icon="pi pi-print" severity="warn" size="small" @click="abrirImprimirEtiqueta" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="confirmarBorrarMultiple" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="selectedSeriales = []" v-tooltip="'Limpiar seleccion'" />
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="serialesFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        v-model:selection="selectedSeriales"
        @row-click="abrirEditar($event.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Acciones" style="width: 10rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-shopping-cart" severity="success" text rounded size="small" @click.stop="abrirAccionVenta(data)" v-tooltip="'Vender o agregar al carrito'" />
              <Button icon="pi pi-print" severity="warn" text rounded size="small" @click.stop="abrirImprimirEtiquetaIndividual(data)" v-tooltip="'Imprimir etiqueta'" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(data)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(data)" v-tooltip="'Eliminar'" />
            </div>
          </template>
        </Column>
        <Column field="nombre" header="Serial" sortable style="width: 10rem" />
        <Column field="estado" header="Estado" sortable style="width: 8rem">
          <template #body="{ data }">
            <span
              class="px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.estado === 'DISPONIBLE' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'"
            >{{ data.estado || 'DISPONIBLE' }}</span>
          </template>
        </Column>
        <Column field="id_equi" header="Electrodomestico" sortable style="width: 10rem">
          <template #body="{ data }">
            <span v-if="data.electrodomestico_nombre">{{ data.electrodomestico_nombre }}</span>
            <span v-else class="text-surface-400">-</span>
          </template>
        </Column>
        <Column field="color" header="Color" sortable style="width: 7rem" />
        <Column field="capacidad" header="Capacidad" sortable style="width: 7rem" />
        <Column field="precio_venta" header="Venta" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.precio_venta ? `$${data.precio_venta.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>
        <Column field="costo" header="Costo" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.costo ? `$${data.costo.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay Seriales registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="serialesFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay Seriales registrados.</div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          <div
            v-for="serial in serialesFiltrados"
            :key="serial.id"
            class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-2.5 flex flex-col gap-1.5 transition-shadow hover:shadow-sm text-xs"
          >
            <div class="flex items-center justify-between gap-1">
              <span class="text-[10px] font-mono text-surface-400 truncate">#{{ serial.id }}</span>
              <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-tight" :class="getEstadoClass(serial.estado)">
                {{ serial.estado }}
              </span>
            </div>
            <div class="min-w-0">
              <h4 class="font-bold leading-tight truncate font-mono text-[11px]">{{ serial.nombre }}</h4>
              <p v-if="serial.electrodomestico_nombre" class="text-primary font-medium truncate text-[10px]">{{ serial.electrodomestico_nombre }}</p>
              <p class="text-surface-400 truncate text-[10px]">{{ [serial.color, serial.capacidad].filter(Boolean).join(' - ') }}</p>
            </div>
            <div class="font-bold text-primary text-xs">{{ $formatMoney(serial.precio_venta) }}</div>
            <div class="flex gap-1 mt-auto pt-1 border-t border-surface-100 dark:border-surface-700">
              <Button
                icon="pi pi-shopping-cart"
                severity="success"
                text
                rounded
                size="small"
                @click="abrirAccionVenta(serial)"
                v-tooltip="'Vender o agregar al carrito'"
              />
              <Button
                icon="pi pi-print"
                severity="warn"
                text
                rounded
                size="small"
                @click="abrirImprimirEtiquetaIndividual(serial)"
                v-tooltip="'Imprimir etiqueta'"
              />
              <Button
                icon="pi pi-pencil"
                severity="info"
                text
                rounded
                size="small"
                @click="abrirEditar(serial)"
                v-tooltip="'Editar'"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                @click="confirmarBorrar(serial)"
                v-tooltip="'Eliminar'"
              />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogAccionVenta" header="Vender Serial" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="space-y-4 pt-1">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
          <template v-if="serialesParaVenta.length === 1">
            <p class="font-semibold">{{ serialParaVenta?.electrodomestico_nombre }}</p>
            <p class="text-xs text-surface-500 font-mono">Serial: {{ serialParaVenta?.nombre }}</p>
          </template>
          <template v-else>
            <p class="font-semibold">{{ serialesParaVenta.length }} Seriales seleccionados</p>
            <p class="text-xs text-surface-500">Se venderan o agregaran juntos al carrito.</p>
          </template>
        </div>
        <div class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          <div v-for="serial in serialesParaVenta" :key="serial.id" class="rounded-lg border border-surface-200 dark:border-surface-700 p-2.5">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="min-w-0"><p class="font-medium text-sm truncate">{{ serial.electrodomestico_nombre }}</p><p class="text-xs text-surface-400 font-mono truncate">{{ serial.nombre }}</p></div>
              <span class="font-semibold text-primary text-sm">{{ $formatMoney(precioSeleccionadoSerial(serial)) }}</span>
            </div>
            <InputNumber v-model="preciosSerialVenta[serial.id]" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid inputClass="text-sm" />
            <div class="flex gap-1 mt-2">
              <Button label="Venta" size="small" text @click="usarPrecioSerial(serial, serial.precio_venta)" />
              <Button label="Min." size="small" text severity="warn" @click="usarPrecioSerial(serial, serial.precio_min)" />
              <Button label="Mayor" size="small" text severity="success" @click="usarPrecioSerial(serial, serial.precio_xmayor)" />
            </div>
          </div>
        </div>
        <div class="flex justify-between font-bold border-t border-surface-200 dark:border-surface-700 pt-2">
          <span>Total</span>
          <span class="text-primary">{{ $formatMoney(serialesParaVenta.reduce((total, serial) => total + precioSeleccionadoSerial(serial), 0)) }}</span>
        </div>
        <p class="text-sm text-surface-500">Elige cómo deseas continuar con este equipo.</p>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <Button label="Vender express" icon="pi pi-bolt" severity="success" class="!justify-start !py-4" @click="abrirClienteVentaExpress" />
          <Button label="Agregar al carrito" icon="pi pi-cart-plus" outlined class="!justify-start !py-4" @click="agregarAlCarritoPos" />
        </div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="dialogAccionVenta = false" /></template>
    </Dialog>

    <Dialog v-model:visible="dialogClienteExpress" header="Cliente para venta express" modal :style="{ width: 'min(30rem, 95vw)' }">
      <div class="space-y-3 pt-1">
        <div class="flex items-center justify-between p-3 rounded-lg border border-primary-200 bg-primary-50 dark:bg-primary-900/20">
          <div><p class="font-semibold text-sm">{{ clienteExpressSeleccionado?.nombre }}</p><p class="text-xs text-surface-500">Cliente seleccionado</p></div>
          <Button label="Al contado" size="small" text @click="seleccionarClienteExpress({ id: null, nombre: 'AL CONTADO', telefono: '' })" />
        </div>
        <InputText v-model="busquedaClienteExpress" placeholder="Buscar por nombre, teléfono o RNC..." fluid />
        <div class="max-h-56 overflow-y-auto flex flex-col gap-1">
          <button v-for="cliente in clientesExpressFiltrados" :key="cliente.id" type="button" class="text-left p-2.5 rounded-lg border transition-colors" :class="clienteExpressSeleccionado?.id === cliente.id ? 'border-primary bg-primary-50 dark:bg-primary-900/20' : 'border-surface-200 dark:border-surface-700 hover:border-primary-300'" @click="seleccionarClienteExpress(cliente)">
            <p class="font-medium text-sm">{{ cliente.nombre }}</p><p class="text-xs text-surface-400">{{ cliente.telefono || 'Sin teléfono' }}</p>
          </button>
          <p v-if="clientesExpressFiltrados.length === 0" class="text-center py-4 text-sm text-surface-400">No se encontraron clientes.</p>
        </div>
        <Button label="Nuevo cliente" icon="pi pi-user-plus" severity="info" text class="w-full" @click="abrirNuevoClienteExpress" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogClienteExpress = false" />
        <Button label="Completar venta express" icon="pi pi-check" @click="completarVentaExpress" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevoClienteExpress" header="Nuevo cliente" modal :style="{ width: 'min(26rem, 95vw)' }">
      <div class="flex flex-col gap-3 pt-1">
        <div><label class="text-sm font-semibold">Nombre *</label><InputText v-model="nuevoClienteExpress.nombre" fluid class="uppercase" /></div>
        <div><label class="text-sm font-semibold">Teléfono</label><InputText v-model="nuevoClienteExpress.telefono" fluid /></div>
        <div><label class="text-sm font-semibold">RNC / Cédula</label><InputText v-model="nuevoClienteExpress.rnc" fluid /></div>
        <div><label class="text-sm font-semibold">Dirección</label><InputText v-model="nuevoClienteExpress.direccion" fluid class="uppercase" /></div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="dialogNuevoClienteExpress = false" /><Button label="Guardar y seleccionar" icon="pi pi-check" @click="guardarNuevoClienteExpress" /></template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Serial' : 'Nuevo Serial'"
      modal
      :style="{ width: '36rem' }"
    >
      <div class="flex flex-col gap-3 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Serial / Nombre</label>
            <InputText
              v-model="form.nombre"
              placeholder="Numero de serie del dispositivo"
              fluid
              class="uppercase"
              style="text-transform: uppercase;"
              @focus="(e) => e.target.select()"
            />
            <div v-if="serialDuplicado" class="flex items-center gap-1.5 text-red-500 text-xs mt-1">
              <i class="pi pi-exclamation-circle"></i>
              <span>Este Serial ya existe en la base de datos</span>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Electrodomestico</label>
            <Select
              v-model="form.id_equi"
              :options="electrodomesticos"
              optionLabel="nombre"
              optionValue="id"
              placeholder="Seleccionar"
              fluid
            />
          </div>
        </div>

        <div class="grid grid-cols-4 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Costo</label>
            <InputNumber v-model="form.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Venta</label>
            <InputNumber v-model="form.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Min</label>
            <InputNumber v-model="form.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Mayor</label>
            <InputNumber v-model="form.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Color</label>
            <InputText v-model="form.color" placeholder="Color" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Capacidad</label>
            <InputText v-model="form.capacidad" placeholder="Ej: 128GB" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Bateria</label>
            <InputText v-model="form.bateria" placeholder="Ej: 5000mAh" fluid />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Estado</label>
          <Select
            v-model="form.estado"
            :options="estados"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Fecha Venta</label>
            <Calendar v-model="form.fecha_venta" dateFormat="yy-mm-dd" placeholder="YYYY-MM-DD" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Hora Venta</label>
            <InputText v-model="form.hora_venta" placeholder="HH:MM:SS" fluid />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Comprador</label>
            <InputText v-model="form.comprador" placeholder="Nombre del comprador" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Proveedor</label>
            <div class="flex gap-2">
              <Select
                v-model="form.proveedor"
                :options="proveedores.map(p => p.nombre)"
                placeholder="Seleccionar proveedor"
                filter
                filterPlaceholder="Buscar proveedor..."
                class="flex-1"
                fluid
              />
              <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
            </div>
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">No. Compra</label>
            <InputText v-model="form.no_compra" placeholder="Numero de compra" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">No. Factura</label>
            <InputText v-model="form.no_factura" placeholder="Numero de factura" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Vendido</label>
            <InputNumber v-model="form.precio_vendido" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nota</label>
          <InputText v-model="form.nota" placeholder="Observaciones adicionales" />
        </div>
      </div>
      <template #footer>
        <div class="flex items-center justify-between w-full gap-2">
          <Button
            v-if="isEditing && form.estado === 'VENDIDO' && form.no_factura"
            label="Reimprimir Factura"
            icon="pi pi-print"
            severity="info"
            outlined
            :loading="reimprimiendo"
            @click="reimprimirFactura"
          />
          <div class="flex items-center gap-2 ml-auto">
            <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
            <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="serialDuplicado" @click="guardar" />
          </div>
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar Eliminacion"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span v-if="selectedSeriales.length > 1">Seguro que deseas eliminar los <strong>{{ selectedSeriales.length }}</strong> Seriales seleccionados?</span>
        <span v-else>Seguro que deseas eliminar <strong>{{ selectedSerial?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="selectedSeriales.length > 1 ? borrarMultiple() : borrar()" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioEstadoMultiple"
      header="Cambiar Estado"
      modal
      :style="{ width: '22rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Cambiar estado de <strong>{{ selectedSeriales.length }}</strong> Serial(es) a:</p>
        <Select v-model="nuevoEstadoMultiple" :options="[{ label: 'Disponible', value: 'DISPONIBLE' }, { label: 'Vendido', value: 'VENDIDO' }, { label: 'Apartado', value: 'APARTADO' }]" optionLabel="label" optionValue="value" fluid />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioEstadoMultiple = false" />
        <Button label="Aplicar" icon="pi pi-check" @click="aplicarCambioEstadoMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioEquipoMultiple"
      header="Cambiar Equipo"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar nuevo equipo a <strong>{{ selectedSeriales.length }}</strong> Serial(es):</p>
        <InputText v-model="busquedaEquipoMultiple" placeholder="Buscar equipo..." fluid />
        <div class="flex flex-col gap-1 max-h-60 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg p-1">
          <div
            v-for="elec in equiposFiltradosMultiple"
            :key="elec.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm"
            :class="equipoSeleccionadoMultiple?.id === elec.id
              ? 'bg-primary text-primary-contrast'
              : 'hover:bg-surface-100 dark:hover:bg-surface-700'"
            @click="equipoSeleccionadoMultiple = elec"
          >
            <i class="pi pi-sitemap text-xs"></i>
            <span>{{ elec.nombre }}</span>
          </div>
          <div v-if="equiposFiltradosMultiple.length === 0" class="text-center py-4 text-surface-400 text-sm">Sin resultados</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioEquipoMultiple = false" />
        <Button label="Asignar" icon="pi pi-check" :disabled="!equipoSeleccionadoMultiple" @click="aplicarCambioEquipoMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioAlmacenMultiple"
      header="Cambiar Almacen y Equipo"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedSeriales.length }}</strong> serial(es) a otro almacen y asignarlos a uno de sus electrodomesticos:</p>
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Almacen destino</label>
          <Select
            v-model="almacenDestinoMultiple"
            :options="almacenesLista"
            optionLabel="nombre"
            placeholder="Seleccionar almacen"
            fluid
            @change="cambiarAlmacenDestinoSeleccionado"
          />
          <p v-if="almacenesLista.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para realizar el traslado.</p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Electrodomestico del almacen destino</label>
          <Select
            v-model="equipoDestinoAlmacen"
            :options="equiposAlmacenDestino"
            optionLabel="nombre"
            placeholder="Seleccionar electrodomestico"
            :disabled="!almacenDestinoMultiple || equiposAlmacenDestino.length === 0"
            filter
            fluid
          />
          <p v-if="almacenDestinoMultiple && equiposAlmacenDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">
            Este almacen no tiene electrodomesticos registrados. Crea primero el equipo en ese almacen.
          </p>
          <p v-else-if="equipoDestinoAlmacen" class="text-xs text-surface-500">
            Los seriales quedaran asignados a <strong>{{ equipoDestinoAlmacen.nombre }}</strong> mediante su UID.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoSerialesAlmacen" @click="dialogCambioAlmacenMultiple = false" />
        <Button label="Mover y Asignar" icon="pi pi-warehouse" :loading="moviendoSerialesAlmacen" :disabled="!almacenDestinoMultiple || !equipoDestinoAlmacen" @click="cambiarAlmacenMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioProveedorMultiple"
      header="Cambiar Proveedor"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar nuevo proveedor a <strong>{{ selectedSeriales.length }}</strong> Serial(es):</p>
        <InputText v-model="busquedaProveedorMultiple" placeholder="Buscar proveedor..." fluid />
        <div class="flex flex-col gap-1 max-h-60 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg p-1">
          <div
            v-for="prov in proveedoresFiltrados"
            :key="prov.id"
            class="flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer transition-colors text-sm"
            :class="proveedorSeleccionadoMultiple?.id === prov.id
              ? 'bg-primary text-primary-contrast'
              : 'hover:bg-surface-100 dark:hover:bg-surface-700'"
            @click="proveedorSeleccionadoMultiple = prov"
          >
            <i class="pi pi-truck text-xs"></i>
            <span>{{ prov.nombre }}</span>
          </div>
          <div v-if="proveedoresFiltrados.length === 0" class="text-center py-4 text-surface-400 text-sm">Sin resultados</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioProveedorMultiple = false" />
        <Button label="Asignar" icon="pi pi-check" :disabled="!proveedorSeleccionadoMultiple" @click="aplicarCambioProveedorMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioColorMultiple"
      header="Cambiar Color"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar nuevo color a <strong>{{ selectedSeriales.length }}</strong> Serial(es):</p>
        <InputText v-model="nuevoColorMultiple" placeholder="Ej: NEGRO" fluid class="uppercase" style="text-transform: uppercase;" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioColorMultiple = false" />
        <Button label="Aplicar" icon="pi pi-check" :disabled="!nuevoColorMultiple.trim()" @click="aplicarCambioColorMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioCapacidadMultiple"
      header="Cambiar Capacidad"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar nueva capacidad a <strong>{{ selectedSeriales.length }}</strong> Serial(es):</p>
        <InputText v-model="nuevaCapacidadMultiple" placeholder="Ej: 128GB" fluid class="uppercase" style="text-transform: uppercase;" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioCapacidadMultiple = false" />
        <Button label="Aplicar" icon="pi pi-check" :disabled="!nuevaCapacidadMultiple.trim()" @click="aplicarCambioCapacidadMultiple" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogSeleccionarPlantilla" header="Imprimir Etiqueta" modal :style="{ width: '34rem' }">
      <div class="space-y-4 pt-2">
        <div class="space-y-2">
          <label class="text-sm font-semibold">Impresora</label>
          <div class="flex items-center gap-2">
            <Select
              v-model="printerSel"
              :options="printerOptions"
              optionLabel="label"
              optionValue="value"
              placeholder="Seleccionar impresora..."
              class="flex-1"
              fluid
            >
              <template #option="{ option }">
                <span class="text-sm">{{ option.label }}</span>
              </template>
            </Select>
            <Button icon="pi pi-refresh" severity="secondary" text rounded size="small" :loading="escaneando" @click="escanearImpresoras" v-tooltip="'Buscar impresoras'" />
            <Button icon="pi pi-bluetooth" severity="info" text rounded size="small" :loading="escaneandoBT" @click="escanearBluetooth" v-tooltip="'Buscar Bluetooth'" />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold">Plantilla</label>
          <div class="relative">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
            <InputText v-model="busquedaPlantilla" placeholder="Buscar plantilla..." fluid class="!pl-8 h-9 text-sm" />
          </div>
          <p class="text-sm text-surface-500">Imprimir etiqueta de <strong>{{ selectedSeriales.length }}</strong> Serial(es):</p>
          <div v-if="plantillasFiltradas.length === 0" class="text-center py-4 text-surface-400 text-sm">{{ busquedaPlantilla ? 'Sin resultados' : 'No hay plantillas. Crea una en Inventario > Etiquetas.' }}</div>
          <div v-else class="flex flex-col gap-2 max-h-44 overflow-y-auto">
            <div
              v-for="p in plantillasFiltradas" :key="p.id"
              class="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-all cursor-pointer"
              @click="imprimirEtiquetaSerial(p)"
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
        <Button label="Cancelar" severity="secondary" text @click="dialogSeleccionarPlantilla = false" />
      </template>
    </Dialog>

    <TicketFacturaPrint ref="ticketPrintRef" />

    <Dialog v-model:visible="dialogNuevoProveedor" header="Nuevo Proveedor" modal :style="{ width: '26rem' }">
      <div class="flex flex-col gap-3 pt-2">
        <div class="space-y-1">
          <label class="text-sm font-medium">Nombre <span class="text-red-400">*</span></label>
          <InputText v-model="nuevoProveedorForm.nombre" placeholder="Nombre del proveedor" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-sm font-medium">Telefono</label>
            <InputText v-model="nuevoProveedorForm.telefono" placeholder="Telefono" fluid />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium">Direccion</label>
            <InputText v-model="nuevoProveedorForm.direccion" placeholder="Direccion" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevoProveedor = false" />
        <Button label="Crear y Seleccionar" icon="pi pi-check" :disabled="!nuevoProveedorForm.nombre.trim()" @click="crearProveedorSerial" />
      </template>
    </Dialog>
  </div>
</template>
