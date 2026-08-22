<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter, useRoute } from 'vue-router'
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
import ToggleSwitch from 'primevue/toggleswitch'
import Calendar from 'primevue/calendar'
import Fieldset from 'primevue/fieldset'
import Menu from 'primevue/menu'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron, encryptarPassword } from '@/funciones/funciones.js'
import JsBarcode from 'jsbarcode'
import QRCode from 'qrcode'
import TicketFacturaPrint from '@/components/ventas/TicketFacturaPrint.vue'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useAuthStore } from '@/stores/auth.store'
import { getImageUrl } from '@/services/tmCloudClient'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import { matchesSearch } from '@/composables/useSearch'

const toast = useToast()
const router = useRouter()
const route = useRoute()
const almacenStore = useAlmacenStore()
const auth = useAuthStore()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const imeis = ref<any[]>([])
const telefonos = ref<any[]>([])
const clientes = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('table')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')
const isEditing = ref(false)
const selectedImei = ref<any>(null)
const selectedImeis = ref<any[]>([])
const imeiActionMenu = ref()
const imeiAccion = ref<any>(null)
const busqueda = ref(String(route.query.search || ''))
const estadoFiltro = ref(route.query.estado === 'todos' ? '' : 'DISPONIBLE')
const telefonoFiltro = ref<any>(null)
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const dialogAccionVenta = ref(false)
const dialogClienteExpress = ref(false)
const dialogNuevoClienteExpress = ref(false)
const imeiParaVenta = ref<any>(null)
const imeisParaVenta = ref<any[]>([])
const preciosImeiVenta = ref<Record<number, number>>({})
const clienteExpressSeleccionado = ref<any>({ id: null, nombre: 'AL CONTADO', telefono: '' })
const busquedaClienteExpress = ref('')
const nuevoClienteExpress = ref({ nombre: '', telefono: '', direccion: '', rnc: '' })

const imeisParaEliminar = computed(() => selectedImei.value ? [selectedImei.value] : (selectedImeis.value || []))

function reiniciarOtpEliminar() {
  deleteOtpEnviado.value = false
  deleteOtpLoading.value = false
  deleteOtpConfirmando.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
}

const imeiActionItems = computed(() => [
  { label: 'Vender o agregar al carrito', icon: 'pi pi-shopping-cart', command: () => imeiAccion.value && abrirAccionVenta(imeiAccion.value) },
  { label: 'Imprimir etiqueta', icon: 'pi pi-print', command: () => imeiAccion.value && abrirImprimirEtiquetaIndividual(imeiAccion.value) },
  { label: 'Editar IMEI', icon: 'pi pi-pencil', command: () => imeiAccion.value && abrirEditar(imeiAccion.value) },
  { separator: true },
  { label: 'Eliminar', icon: 'pi pi-trash', class: 'text-red-500', command: () => imeiAccion.value && confirmarBorrar(imeiAccion.value) },
])

function abrirMenuAccionesImei(event: Event, imei: any) {
  imeiAccion.value = imei
  imeiActionMenu.value?.toggle(event)
}

const ticketPrintRef = ref<any>(null)
const reimprimiendo = ref(false)
const sincronizandoSubir = ref(false)
const sincronizandoBajar = ref(false)

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
  equipo: '',
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

const formDefault = () => ({
  nombre: '', id_equi: null as number | null, equipo: '', costo: 0, precio_venta: 0,
  precio_min: 0, precio_xmayor: 0, color: '', capacidad: '', bateria: '', estado: 'DISPONIBLE',
  fecha_venta: null as Date | null, comprador: '', proveedor: '', no_compra: '', precio_vendido: 0,
  hora_venta: '', no_factura: '', nota: '',
})

const imeiDuplicado = ref(false)

const telefonosAlmacenActual = computed(() => {
  const almacenUid = String(almacenStore.activeUid || '')
  if (!almacenUid) return []
  return telefonos.value
    .filter((telefono: any) => String(telefono.almacen_uid || '') === almacenUid)
    .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
})

const telefonosParaFiltro = computed(() => {
  const mostrarTodos = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
  const almacenUid = String(almacenStore.activeUid || '')
  const lista = mostrarTodos
    ? telefonos.value
    : telefonos.value.filter((telefono: any) => String(telefono.almacen_uid || '') === almacenUid)

  return [...lista].sort((a: any, b: any) =>
    String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es')
  )
})

watch(() => form.value.nombre, async (val) => {
  if (!val || val.length < 10) { imeiDuplicado.value = false; return }
  try {
    const res = await window.db.getAll('imei')
    if (res.success) {
      const dup = (res.data || []).find((i: any) =>
        i.nombre === val.trim() && i.id !== (isEditing.value ? selectedImei.value?.id : -1)
      )
      imeiDuplicado.value = !!dup
    }
  } catch { imeiDuplicado.value = false }
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

const imeisFiltrados = computed(() => {
  return imeis.value.filter(i => {
    const coincideEstado = !estadoFiltro.value || i.estado === estadoFiltro.value
    const coincideTexto = matchesSearch(i, busqueda.value, ['nombre', 'color', 'capacidad', 'equipo', 'telefono_nombre', 'no_factura', 'comprador'])
    const telefono = telefonoFiltro.value
    const coincideTelefono = !telefono ||
      Number(i.id_equi) === Number(telefono.id) ||
      (!!telefono.uid && String(i.telefono_uid || '') === String(telefono.uid)) ||
      String(i.equipo || i.telefono_nombre || '').trim().toLocaleLowerCase() ===
        String(telefono.nombre || '').trim().toLocaleLowerCase()

    return coincideEstado && coincideTexto && coincideTelefono
  })
})

const clientesExpressFiltrados = computed(() => {
  const texto = busquedaClienteExpress.value.toLowerCase().trim()
  if (!texto) return clientes.value
  return clientes.value.filter((cliente: any) =>
    String(cliente.nombre || '').toLowerCase().includes(texto) ||
    String(cliente.telefono || '').toLowerCase().includes(texto) ||
    String(cliente.rnc || '').toLowerCase().includes(texto)
  )
})

async function cargarTelefonos() {
  try {
    const res = await window.db.getAll('telefonos')
    if (res.success) {
      telefonos.value = res.data || []
    }
  } catch (error) {
    console.error(error)
  }
}

async function crearProveedorImei() {
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

async function cargarImeis() {
  loading.value = true
  try {
    await almacenStore.load()
    const [resImei, resTel, resProv, resClientes] = await Promise.all([
      window.db.getAll('imei'),
      window.db.getAll('telefonos'),
      window.db.getAll('proveedores'),
      window.db.getAll('clientes'),
    ])

    if (resTel.success) telefonos.value = resTel.data || []
    if (resProv.success) proveedores.value = resProv.data || []
    if (resClientes.success) clientes.value = resClientes.data || []
    if (resImei.success) {
      const listaTelefonos = resTel.data || []
      const telMap = new Map(listaTelefonos.map((t: any) => [String(t.id ?? ''), t]))
      const telUidMap = new Map(listaTelefonos.filter((t: any) => t.uid).map((t: any) => [String(t.uid), t]))
      const telefonosPorNombre = new Map<string, any[]>()
      for (const telefono of listaTelefonos) {
        const nombre = String(telefono.nombre || '').trim().toLocaleUpperCase()
        if (!nombre) continue
        const grupo = telefonosPorNombre.get(nombre) || []
        grupo.push(telefono)
        telefonosPorNombre.set(nombre, grupo)
      }
      const mismoAlmacen = (imei: any, telefono: any) => {
        const imeiUid = String(imei.almacen_uid || '')
        const telefonoUid = String(telefono.almacen_uid || '')
        if (imeiUid && telefonoUid) return imeiUid === telefonoUid
        const imeiId = Number(imei.almacen_id || 0)
        const telefonoId = Number(telefono.almacen_id || 0)
        return !imeiId || !telefonoId || imeiId === telefonoId
      }
      const resolverTelefono = (imei: any) => {
        const telefonoUid = String(imei.telefono_uid || '')
        const referenciaAnterior = String(imei.id_equi || '')
        // Algunas sincronizaciones antiguas guardaron el UID del telefono en
        // id_equi. Aceptamos ambos campos antes de intentar el ID numerico.
        const porUid = (telefonoUid && telUidMap.get(telefonoUid)) ||
          (referenciaAnterior && telUidMap.get(referenciaAnterior))
        if (porUid && mismoAlmacen(imei, porUid)) return porUid

        const porId = referenciaAnterior ? telMap.get(referenciaAnterior) : null
        if (porId && mismoAlmacen(imei, porId)) return porId

        const nombre = String(imei.equipo || '').trim().toLocaleUpperCase()
        const candidatos = telefonosPorNombre.get(nombre) || []
        return candidatos.find((telefono: any) => mismoAlmacen(imei, telefono)) || candidatos[0] || porUid || porId || null
      }
      const almacenMap = new Map(almacenStore.almacenes.map((item: any) => [Number(item.id), item.nombre]))
      const lista = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
        ? (resImei.data || [])
        : filterByAlmacen(resImei.data || [])
      imeis.value = lista.map((i: any) => {
        const telefono = resolverTelefono(i)
        return {
          ...i,
          id_equi: telefono?.id ?? i.id_equi,
          telefono_uid: telefono?.uid || i.telefono_uid || '',
          equipo: telefono?.nombre || i.equipo || '',
          telefono_nombre: telefono?.nombre || i.equipo || '',
          telefono_imagen: telefono?.imagen || '',
          almacen_nombre: almacenStore.almacenes.find((almacen: any) => String(almacen.uid) === String(i.almacen_uid))?.nombre || almacenMap.get(Number(i.almacen_id)) || 'Sin empresa asignada',
        }
      })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  selectedImeis.value = []
  telefonoFiltro.value = null
  cargarImeis()
})

watch(telefonoFiltro, () => {
  selectedImeis.value = []
})

function abrirAccionVenta(imei: any) {
  abrirAccionVentaLista([imei])
}

function abrirAccionVentaMultiple() {
  abrirAccionVentaLista(selectedImeis.value)
}

function abrirAccionVentaLista(lista: any[]) {
  if (!lista.length) return
  const noDisponibles = lista.filter((imei: any) => String(imei.estado || '').toUpperCase() !== 'DISPONIBLE')
  if (noDisponibles.length) {
    toast.add({ severity: 'warn', summary: 'No disponible', detail: 'Solo puedes vender IMEIs disponibles', life: 3000 })
    return
  }
  const sinEquipo = lista.find((imei: any) => !imei.id_equi || !imei.telefono_nombre)
  if (sinEquipo) {
    toast.add({ severity: 'warn', summary: 'Equipo requerido', detail: 'Asigna un teléfono a este IMEI antes de venderlo', life: 3000 })
    return
  }
  imeisParaVenta.value = [...lista]
  imeiParaVenta.value = imeisParaVenta.value[0]
  preciosImeiVenta.value = Object.fromEntries(imeisParaVenta.value.map((imei: any) => [Number(imei.id), Number(imei.precio_venta || 0)]))
  dialogAccionVenta.value = true
}

function obtenerImeisParaVenta() {
  return imeisParaVenta.value.length ? imeisParaVenta.value : (imeiParaVenta.value ? [imeiParaVenta.value] : [])
}

function precioSeleccionadoImei(imei: any) {
  return Number(preciosImeiVenta.value[Number(imei.id)] ?? imei.precio_venta ?? 0)
}

function usarPrecioImei(imei: any, precio: any) {
  preciosImeiVenta.value[Number(imei.id)] = Number(precio || 0)
}

function validarPreciosVenta(imeisVenta: any[]) {
  if (imeisVenta.some((imei: any) => precioSeleccionadoImei(imei) <= 0)) {
    toast.add({ severity: 'warn', summary: 'Precio requerido', detail: 'Cada IMEI debe tener un precio mayor que cero', life: 3000 })
    return false
  }
  return true
}

function itemPosDesdeImei(imei: any, precio = Number(imei.precio_venta || 0)) {
  return {
    tipo: 'imei', imei_id: imei.id, imei_ids: [imei.id], imei: imei.nombre, imeis: [imei.nombre],
    codigo: imei.nombre || '', nombre: imei.telefono_nombre || '', telefono_id: imei.id_equi,
    color: imei.color || '', colores: imei.color ? [imei.color] : [],
    capacidad: imei.capacidad || '', capacidades: imei.capacidad ? [imei.capacidad] : [],
    precio: Number(precio || 0), precio_normal: Number(imei.precio_venta || precio || 0),
    costo: Number(imei.costo || 0), cantidad: 1,
  }
}

function agregarAlCarritoPos() {
  const imeisVenta = obtenerImeisParaVenta()
  if (!imeisVenta.length) return
  if (!validarPreciosVenta(imeisVenta)) return
  try {
    const data = JSON.parse(localStorage.getItem('pos_cart_data') || '{}')
    const cart = Array.isArray(data.cart) ? data.cart : []
    const repetidos = imeisVenta.filter((imei: any) => cart.some((i: any) => i.tipo === 'imei' && (Number(i.imei_id) === Number(imei.id) || (i.imei_ids || []).map(Number).includes(Number(imei.id)))))
    if (repetidos.length) {
      toast.add({ severity: 'warn', summary: 'Ya agregado', detail: `${repetidos.length} IMEI(s) ya están en el carrito del POS`, life: 3000 })
      return
    }
    data.cart = [...cart, ...imeisVenta.map((imei: any) => itemPosDesdeImei(imei, precioSeleccionadoImei(imei)))]
    localStorage.setItem('pos_cart_data', JSON.stringify(data))
    dialogAccionVenta.value = false
    router.push('/vender')
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo agregar el IMEI al carrito', life: 3000 })
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
  const imeisVenta = obtenerImeisParaVenta()
  if (!imeisVenta.length) return
  if (!validarPreciosVenta(imeisVenta)) return
  const cliente = clienteExpressSeleccionado.value || { id: null, nombre: 'AL CONTADO', telefono: '' }
  const data = {
    cart: imeisVenta.map((imei: any) => itemPosDesdeImei(imei, precioSeleccionadoImei(imei))), cliente, clienteExpress: '', metodoPago: 'EFECTIVO',
    descuento_fijo: 0, descuento_porc: 0, descuento_tipo: 'fijo', descuento_valor: 0,
    nota: '', es_cotizacion: false, venta_express_pendiente: true,
  }
  localStorage.setItem('pos_cart_data', JSON.stringify(data))
  dialogClienteExpress.value = false
  router.push('/vender')
}

async function subirImeis() {
  sincronizandoSubir.value = true
  try {
    const res = await window.db.getAll('imei')
    if (!res.success || !res.data) { toast.add({ severity: 'warn', summary: 'Sin datos', detail: 'No hay IMEIs para subir', life: 3000 }); return }
    const cfgRes = await window.db.getAll('servidor_sync_config')
    const cfg = cfgRes.success && cfgRes.data?.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.activo) { toast.add({ severity: 'warn', summary: 'Inactivo', detail: 'Sincronizacion no activada', life: 3000 }); return }
    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)
    const empresaRes = await window.db.getAll('empresa')
    const almacen = (empresaRes.success && empresaRes.data?.[0]?.nombre) || ''
    const campos = ['id','almacen','imei','estado','fecha','equipo','proveedor','id_equi','costo','precio_venta','factura','no_compra','fecha_venta','hora_venta','comprador','detalles','usuario','created_at','updated_at','identificadordb','marca','modelo','preciocompra','precioventa','vendedor','cedula','telefono','direccion','nota','precio_compra','precio_min','precio_xmayor','ganancia','no_factura','bateria','capacidad']
    let subidos = 0
    for (const imei of res.data) {
      const enviar: Record<string, any> = {
        almacen, imei: String(imei.nombre || ''), estado: String(imei.estado || 'DISPONIBLE'),
        fecha: new Date().toLocaleDateString(systemLocale.value),
        equipo: String(imei.equipo || telefonos.value.find((telefono: any) => Number(telefono.id) === Number(imei.id_equi))?.nombre || ''),
        proveedor: String(imei.proveedor || ''),
        id_equi: String(imei.telefono_uid || imei.id_equi || ''), costo: String(imei.costo || '0'),
        precio_venta: String(imei.precio_venta || '0'), factura: '', no_compra: String(imei.no_compra || ''),
        fecha_venta: String(imei.fecha_venta || ''), hora_venta: String(imei.hora_venta || ''),
        comprador: String(imei.comprador || ''), detalles: '', usuario: '', marca: '', modelo: '',
        preciocompra: String(imei.costo || '0'), precioventa: String(imei.precio_venta || '0'),
        vendedor: '', cedula: '', telefono: '', direccion: '', nota: String(imei.nota || ''),
        precio_compra: String(imei.costo || '0'), precio_min: String(imei.precio_min || '0'),
        precio_xmayor: String(imei.precio_xmayor || '0'), ganancia: '',
        no_factura: String(imei.no_factura || ''), bateria: String(imei.bateria || ''),
        capacidad: String(imei.capacidad || ''),
      }
      for (const key of Object.keys(enviar)) { if (!campos.includes(key)) delete enviar[key] }
      if (Object.keys(enviar).length === 0) continue
      const existeRes = await fetch(`${baseUrl}/datoscampo/imei/imei/${encodeURIComponent(imei.nombre || '')}`, {
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
      if (servidorId) { enviar.id = servidorId; await fetch(`${baseUrl}/actualizarcampos/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token }, body: JSON.stringify(enviar) }) }
      else { await fetch(`${baseUrl}/insertar/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token }, body: JSON.stringify(enviar) }) }
      subidos++
    }
    toast.add({ severity: 'success', summary: 'Subidos', detail: `${subidos} IMEI(s) sincronizados al servidor`, life: 3000 })
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al subir IMEIs', life: 3000 })
  } finally { sincronizandoSubir.value = false }
}

async function bajarImeis() {
  sincronizandoBajar.value = true
  try {
    const cfgRes = await window.db.getAll('servidor_sync_config')
    const cfg = cfgRes.success && cfgRes.data?.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.activo) { toast.add({ severity: 'warn', summary: 'Inactivo', detail: 'Sincronizacion no activada', life: 3000 }); return }
    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)
    const res = await fetch(`${baseUrl}/datosarray/imei`, { method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token } })
    if (!res.ok) { toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo obtener datos del servidor', life: 3000 }); return }
    const serverData = await res.json()
    console.log('[BajarIMEI] Server data:', JSON.stringify(serverData).substring(0, 500))
    const arr = Array.isArray(serverData) ? serverData : serverData?.data || serverData?.rows || []
    if (!Array.isArray(arr)) { toast.add({ severity: 'error', summary: 'Error', detail: 'Respuesta invalida del servidor', life: 3000 }); return }
    const localRes = await window.db.getAll('imei')
    const localSet = new Set((localRes.data || []).map((i: any) => i.nombre))
    const localEquiposRes = await window.db.getAll('telefonos')
    const localEquipos = localEquiposRes.data || []
    console.log('[BajarIMEI] Local IMEIs:', [...localSet].join(', '))
    let insertados = 0
    let omitidos = 0
    for (const si of arr) {
      const imeiStr = String(si.imei || '').trim()
      if (!imeiStr) continue
      const existe = localSet.has(imeiStr)
      console.log(`[BajarIMEI] ${existe ? 'SKIP' : 'INSERT'} ${imeiStr} (${si.almacen})`)
      if (existe) { omitidos++; continue }

      let equipoId: number | null = null
      let equipoUid = ''
      const nombreEquipo = String(si.equipo || '').trim().toUpperCase()
      if (nombreEquipo) {
        const existente = localEquipos.find((t: any) => t.nombre?.toUpperCase() === nombreEquipo)
        if (existente) {
          equipoId = existente.id
          equipoUid = existente.uid || ''
        } else {
          const eqRes = await window.db.insert('telefonos', addAlmacenId({ nombre: nombreEquipo }))
          if (eqRes.success) {
            equipoId = eqRes.data?.id || null
            const telefonoCreado = (await window.db.getById('telefonos', equipoId as number)).data
            equipoUid = telefonoCreado?.uid || ''
            localEquipos.push({ id: equipoId, nombre: nombreEquipo, uid: equipoUid })
          }
        }
      }

      const r = await window.db.insert('imei', addAlmacenId({ nombre: imeiStr, id_equi: equipoId, telefono_uid: equipoUid, equipo: nombreEquipo, estado: si.estado || 'DISPONIBLE',
        costo: Number(si.costo || si.precio_compra || 0), precio_venta: Number(si.precio_venta || si.precioventa || 0),
        precio_min: Number(si.precio_min || 0), precio_xmayor: Number(si.precio_xmayor || 0),
        proveedor: si.proveedor || '', color: '', capacidad: si.capacidad || '',
        bateria: si.bateria || '', no_compra: si.no_compra || '', nota: si.nota || '',
        fecha_venta: si.fecha_venta || '', hora_venta: si.hora_venta || '',
        comprador: si.comprador || '', precio_vendido: 0, no_factura: si.no_factura || '',
      }))
      if (r.success) { insertados++; console.log('[BajarIMEI] DB insert OK:', imeiStr) }
      else { console.log('[BajarIMEI] DB insert FAIL:', imeiStr, r.error) }
    }
    toast.add({ severity: insertados > 0 ? 'success' : 'info', summary: 'Descargados', detail: `${insertados} nuevo(s), ${omitidos} ya existentes`, life: 4000 })
    await cargarImeis()
    await cargarTelefonos()
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al descargar IMEIs', life: 3000 })
  } finally { sincronizandoBajar.value = false }
}

async function consultarImeiDialog() {
  const imei = form.value.nombre.trim()
  if (!imei || imei.length < 15) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un IMEI valido (15 digitos)', life: 3000 })
    return
  }
  consultaImeiServicio.value = 0
  consultaImeiResultado.value = null
  consultaImeiTelefonoSel.value = null
  dialogConsultarImei.value = true
}

async function ejecutarConsultaImei() {
  const imei = form.value.nombre.trim()
  if (!imei || imei.length < 15) return
  consultaImeiCargando.value = true
  consultaImeiResultado.value = null
  consultaImeiTelefonoSel.value = null
  try {
    const res = await window.electron.invoke('imei:consultar', imei, consultaImeiServicio.value) as any
    if (res.success) {
      consultaImeiResultado.value = res.data
      if (res.data?.status === 'error') {
        toast.add({ severity: 'error', summary: 'Error', detail: res.data.message || res.data.error || 'Error en la consulta', life: 5000 })
      } else {
        const coincidentes = telefonosCoincidentes.value
        if (coincidentes.length === 1) {
          consultaImeiTelefonoSel.value = coincidentes[0].id
        } else if (coincidentes.length > 1) {
          toast.add({ severity: 'info', summary: 'Multiples coincidencias', detail: `${coincidentes.length} telefonos coinciden con el modelo. Selecciona uno.`, life: 3000 })
        }
      }
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo conectar al servidor', life: 5000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 })
  } finally {
    consultaImeiCargando.value = false
  }
}

function aplicarTelefonoConsulta() {
  const id = consultaImeiTelefonoSel.value
  if (!id) return
  const telefono = telefonos.value.find((t: any) => Number(t.id) === Number(id))
  if (telefono) {
    form.value.id_equi = telefono.id
    form.value.equipo = telefono.nombre || ''
  }
  dialogConsultarImei.value = false
}

async function crearTelefonoDesdeConsulta() {
  const nombre = telefonoDesdeConsulta.value
  if (!nombre) return
  consultaImeiCreandoTelefono.value = true
  try {
    const uid = crypto.randomUUID()
    const res = await window.db.insert('telefonos', { nombre: String(nombre).toUpperCase(), uid, almacen_id: Number(almacenStore.activeId || 0), almacen_uid: String(almacenStore.activeUid || '') })
    if (!res.success) throw new Error(res.error || 'No se pudo crear el telefono')
    await cargarTelefonos()
    const nuevo = telefonos.value.find((t: any) => t.uid === uid)
    if (nuevo) form.value.id_equi = nuevo.id
    toast.add({ severity: 'success', summary: 'Telefono creado', detail: `${nombre} creado y seleccionado`, life: 3000 })
    dialogConsultarImei.value = false
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al crear telefono', life: 4000 })
  } finally {
    consultaImeiCreandoTelefono.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedImei.value = null
  form.value = formDefault()
  imeiDuplicado.value = false
  dialogVisible.value = true
}

function abrirEditar(imei: any) {
  isEditing.value = true
  selectedImei.value = imei
  imeiDuplicado.value = false
  form.value = {
    nombre: imei.nombre || '',
    id_equi: imei.id_equi || null,
    equipo: imei.equipo || imei.telefono_nombre || '',
    costo: imei.costo || 0,
    precio_venta: imei.precio_venta || 0,
    precio_min: imei.precio_min || 0,
    precio_xmayor: imei.precio_xmayor || 0,
    color: imei.color || '',
    capacidad: imei.capacidad || '',
    bateria: imei.bateria || '',
    estado: imei.estado || 'DISPONIBLE',
    fecha_venta: imei.fecha_venta ? new Date(imei.fecha_venta) : null,
    comprador: imei.comprador || '',
    proveedor: imei.proveedor || '',
    no_compra: imei.no_compra || '',
    precio_vendido: imei.precio_vendido || 0,
    hora_venta: imei.hora_venta || '',
    no_factura: imei.no_factura || '',
    nota: imei.nota || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(imei: any) {
  selectedImei.value = imei
  selectedImeis.value = []
  reiniciarOtpEliminar()
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }
  if (imeiDuplicado.value) {
    toast.add({ severity: 'warn', summary: 'IMEI duplicado', detail: 'Este IMEI ya esta registrado', life: 4000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()

  try {
    const telefono = telefonos.value.find((item: any) => Number(item.id) === Number(form.value.id_equi))
    const data: any = {
      nombre: nombreMayus,
      id_equi: form.value.id_equi,
      telefono_uid: telefono?.uid || '',
      equipo: String(telefono?.nombre || form.value.equipo || '').toUpperCase(),
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
      const res = await window.db.update('imei', selectedImei.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'IMEI actualizado', life: 3000 })
      }
    } else {
      const res = await window.db.insert('imei', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'IMEI creado', life: 3000 })
      }
    }
    dialogVisible.value = false
    await cargarImeis()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

const dialogCambioEstadoMultiple = ref(false)
const nuevoEstadoMultiple = ref('DISPONIBLE')
const dialogCambioEquipoMultiple = ref(false)
const busquedaEquipoMultiple = ref('')
const equipoSeleccionadoMultiple = ref<any>(null)
const proveedores = ref<any[]>([])
const dialogCambioProveedorMultiple = ref(false)
const busquedaProveedorMultiple = ref('')
const proveedorSeleccionadoMultiple = ref<any>(null)
const dialogCambioColorMultiple = ref(false)
const nuevoColorMultiple = ref('')
const dialogCambioCapacidadMultiple = ref(false)
const nuevaCapacidadMultiple = ref('')
const dialogConsultarImei = ref(false)
const consultaImeiServicio = ref(0)
const consultaImeiResultado = ref<any>(null)
const consultaImeiCargando = ref(false)
const consultaImeiCreandoTelefono = ref(false)
const consultaImeiTelefonoSel = ref<any>(null)

const telefonoDesdeConsulta = computed(() => {
  const obj = consultaImeiResultado.value?.response?.object
  if (!obj) return null
  return obj.modelName || obj.model || ''
})

const telefonosCoincidentes = computed(() => {
  const modelo = telefonoDesdeConsulta.value
  if (!modelo) return []
  const normalizado = modelo.toLowerCase().replace(/[^a-z0-9]/g, ' ')
  const palabrasModelo = normalizado.split(/\s+/).filter(Boolean)
  return telefonosAlmacenActual.value.filter((t: any) => {
    const nom = String(t.nombre || '').toLowerCase().replace(/[^a-z0-9]/g, ' ')
    return palabrasModelo.some(p => p.length > 2 && nom.includes(p))
  })
})

const dialogAutoAsignar = ref(false)
const autoAsignarServicio = ref(0)
const autoAsignarCargando = ref(false)
const autoAsignarProgreso = ref({ total: 0, procesados: 0, asignados: 0, creados: 0, errores: 0 })
const autoAsignarResultados = ref<{ imei: string; ok: boolean }[]>([])

async function abrirAutoAsignar() {
  if (selectedImeis.value.length === 0) return
  autoAsignarServicio.value = 0
  autoAsignarResultados.value = []
  autoAsignarProgreso.value = { total: selectedImeis.value.length, procesados: 0, asignados: 0, creados: 0, errores: 0 }
  dialogAutoAsignar.value = true
}

function seleccionarImeisSinTelefono() {
  const sinTelefono = imeisFiltrados.value.filter((imei: any) => !imei.id_equi || !imei.telefono_uid)
  selectedImeis.value = sinTelefono
  if (sinTelefono.length === 0) {
    toast.add({ severity: 'info', summary: 'Sin pendientes', detail: 'Todos los IMEIs visibles ya tienen telefono y uid asignado', life: 3000 })
  }
}

const AUTO_ASIGNAR_FILLER = new Set(['GALAXY', 'SERIES', 'EDITION', 'APPLE', '5G', '4G', 'LTE', 'DUAL', 'SIM'])

function normalizarModelo(str: string) {
  return String(str || '')
    .replace(/\([^)]*\)/g, ' ')
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ')
}

function tokensModelo(str: string) {
  return normalizarModelo(str).split(' ').filter(t => t && !AUTO_ASIGNAR_FILLER.has(t))
}

// Determina el nombre "legible" del modelo. En este servicio, para iPhone el campo
// modelName trae el nombre sin marca (ej. "iPhone 11 Pro"), pero para Samsung/Google
// los campos vienen al reves: model trae el nombre legible ("Galaxy S24 Ultra") y
// modelName trae el codigo tecnico ("SM-S928U"). Se detecta cual campo tiene espacios
// (legible) y se usa ese; si el modelo no incluye la marca, se le antepone.
function resolverNombreModelo(obj: any): string {
  const model = String(obj?.model || '').trim()
  const modelName = String(obj?.modelName || '').trim()
  let modelo = /\s/.test(modelName) ? modelName : (/\s/.test(model) ? model : (modelName || model))
  const marca = String(obj?.brand || obj?.manufacturer || '').trim().split(/\s+/)[0] || ''
  if (marca && marca.toUpperCase() !== 'APPLE' && !normalizarModelo(modelo).startsWith(normalizarModelo(marca))) {
    modelo = `${marca} ${modelo}`
  }
  return modelo
}

async function ejecutarAutoAsignar() {
  const imeis = [...selectedImeis.value]
  autoAsignarCargando.value = true
  autoAsignarProgreso.value = { total: imeis.length, procesados: 0, asignados: 0, creados: 0, errores: 0 }
  autoAsignarResultados.value = []

  const usoConteo = new Map<number, number>()
  for (const i of imeis.value as any[]) {
    if (i.id_equi) usoConteo.set(Number(i.id_equi), (usoConteo.get(Number(i.id_equi)) || 0) + 1)
  }

  for (const imei of imeis) {
    const resultado = { imei: imei.nombre || imei.id, ok: false }
    try {
      const res = await window.electron.invoke('imei:consultar', imei.nombre, autoAsignarServicio.value) as any
      if (res?.success && res.data?.response?.object) {
        const modelo = resolverNombreModelo(res.data.response.object)
        const tk = tokensModelo(modelo)
        const candidatos = telefonosAlmacenActual.value.filter((t: any) => {
          const tokensTelefono = tokensModelo(t.nombre)
          if (tokensTelefono.length !== tk.length) return false
          const setTelefono = new Set(tokensTelefono)
          return tk.every(p => setTelefono.has(p))
        })
        candidatos.sort((a: any, b: any) => (usoConteo.get(Number(b.id)) || 0) - (usoConteo.get(Number(a.id)) || 0) || Number(a.id) - Number(b.id))
        let telefono = candidatos[0] || null
        if (!telefono && tk.length > 0) {
          const nombreNuevo = tk.join(' ')
          const uid = crypto.randomUUID()
          const creado = await window.db.insert('telefonos', {
            nombre: nombreNuevo,
            uid,
            almacen_id: Number(almacenStore.activeId || 0),
            almacen_uid: String(almacenStore.activeUid || ''),
          })
          if (creado.success) {
            telefonos.value.push({ id: creado.data.id, uid, nombre: nombreNuevo, almacen_id: Number(almacenStore.activeId || 0), almacen_uid: String(almacenStore.activeUid || '') })
            telefono = telefonos.value.find((t: any) => t.uid === uid)
            autoAsignarProgreso.value.creados++
          }
        }
        if (telefono) {
          usoConteo.set(Number(telefono.id), (usoConteo.get(Number(telefono.id)) || 0) + 1)
          await window.db.update('imei', imei.id, {
            id_equi: telefono.id,
            telefono_uid: telefono.uid || '',
            equipo: telefono.nombre || '',
          })
          resultado.ok = true
          autoAsignarProgreso.value.asignados++
        } else {
          autoAsignarProgreso.value.errores++
        }
      } else {
        autoAsignarProgreso.value.errores++
      }
    } catch {
      autoAsignarProgreso.value.errores++
    }
    autoAsignarProgreso.value.procesados++
    autoAsignarResultados.value.push(resultado)
  }

  autoAsignarCargando.value = false
  await Promise.all([cargarImeis(), cargarTelefonos()])
  toast.add({
    severity: autoAsignarProgreso.value.errores > 0 ? 'warn' : 'success',
    summary: 'Auto-asignacion completada',
    detail: `${autoAsignarProgreso.value.asignados} asignados (${autoAsignarProgreso.value.creados} telefonos creados), ${autoAsignarProgreso.value.errores} errores de ${autoAsignarProgreso.value.total}`,
    life: 5000,
  })
}

const dialogCambioAlmacenMultiple = ref(false)
const soloAlmacen = ref(false)
const almacenesLista = ref<any[]>([])
const almacenDestinoMultiple = ref<any>(null)
const equipoDestinoAlmacen = ref<any>(null)

const equiposAlmacenDestino = computed(() => {
  const destinoUid = String(almacenDestinoMultiple.value?.uid || '')
  if (!destinoUid) return []
  return telefonos.value
    .filter((telefono: any) => String(telefono.almacen_uid || '') === destinoUid)
    .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
})

function cambiarAlmacenDestinoSeleccionado() {
  equipoDestinoAlmacen.value = null
}

function abrirCambiarEstadoMultiple() {
  nuevoEstadoMultiple.value = 'DISPONIBLE'
  dialogCambioEstadoMultiple.value = true
}

async function aplicarCambioEstadoMultiple() {
  for (const imei of selectedImeis.value) {
    await window.db.update('imei', imei.id, { estado: nuevoEstadoMultiple.value })
  }
  dialogCambioEstadoMultiple.value = false
  selectedImeis.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: `${selectedImeis.value.length} IMEIs actualizados`, life: 2000 })
  await cargarImeis()
}

const proveedoresFiltrados = computed(() => {
  const texto = busquedaProveedorMultiple.value.toLowerCase().trim()
  if (!texto) return proveedores.value
  return proveedores.value.filter((p: any) => p.nombre?.toLowerCase().includes(texto))
})

const equiposFiltradosMultiple = computed(() => {
  const texto = busquedaEquipoMultiple.value.toLowerCase().trim()
  const almacenUid = String(almacenStore.activeUid || '')
  if (!almacenUid) return []
  const telefonosAlmacenActual = telefonos.value
    .filter((telefono: any) => String(telefono.almacen_uid || '') === almacenUid)
    .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
  if (!texto) return telefonosAlmacenActual
  return telefonosAlmacenActual.filter((t: any) => t.nombre?.toLowerCase().includes(texto))
})

async function abrirCambiarEquipoMultiple() {
  await Promise.all([almacenStore.load(), cargarTelefonos()])
  busquedaEquipoMultiple.value = ''
  equipoSeleccionadoMultiple.value = null
  dialogCambioEquipoMultiple.value = true
}

async function aplicarCambioEquipoMultiple() {
  if (!equipoSeleccionadoMultiple.value) return
  const equipoDestino = equipoSeleccionadoMultiple.value
  const almacenUid = String(equipoDestino.almacen_uid || almacenStore.activeUid || '')
  const almacenId = Number(equipoDestino.almacen_id || almacenStore.activeId || 0)
  if (!almacenUid || String(equipoDestino.uid || '') === '') {
    toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'El teléfono destino debe tener UID de equipo y UID de almacén', life: 3000 })
    return
  }
  for (const imei of selectedImeis.value) {
    await window.db.update('imei', imei.id, {
      id_equi: equipoDestino.id,
      telefono_uid: equipoDestino.uid,
      equipo: equipoDestino.nombre || '',
      almacen_id: almacenId,
      almacen_uid: almacenUid,
    })
  }
  dialogCambioEquipoMultiple.value = false
  selectedImeis.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Equipo cambiado', life: 2000 })
  await cargarImeis()
}

function abrirCambiarColorMultiple() {
  nuevoColorMultiple.value = ''
  dialogCambioColorMultiple.value = true
}

async function aplicarCambioColorMultiple() {
  if (!nuevoColorMultiple.value.trim()) return
  for (const imei of selectedImeis.value) {
    await window.db.update('imei', imei.id, { color: nuevoColorMultiple.value.trim().toUpperCase() })
  }
  dialogCambioColorMultiple.value = false
  selectedImeis.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Color cambiado', life: 2000 })
  await cargarImeis()
}

function abrirCambiarCapacidadMultiple() {
  nuevaCapacidadMultiple.value = ''
  dialogCambioCapacidadMultiple.value = true
}

async function abrirCambiarAlmacenMultiple() {
  await Promise.all([almacenStore.load(), cargarTelefonos()])
  const almacenesOrigenUid = new Set(selectedImeis.value.map((imei: any) => String(imei.almacen_uid || almacenStore.activeUid || '')))
  almacenesLista.value = almacenStore.almacenes.filter((almacen: any) => !almacenesOrigenUid.has(String(almacen.uid || '')))
  soloAlmacen.value = false
  almacenDestinoMultiple.value = null
  equipoDestinoAlmacen.value = null
  dialogCambioAlmacenMultiple.value = true
}

async function cambiarAlmacenMultiple() {
  if (!almacenDestinoMultiple.value || selectedImeis.value.length === 0) return
  if (!soloAlmacen.value && !equipoDestinoAlmacen.value) return
  const destinoId = almacenDestinoMultiple.value.id || almacenDestinoMultiple.value
  const destinoUid = String(almacenDestinoMultiple.value.uid || '')
  const cantidad = selectedImeis.value.length
  try {
    for (const imei of selectedImeis.value) {
      const updates: Record<string, any> = {
        almacen_id: Number(destinoId),
        almacen_uid: destinoUid,
      }
      if (!soloAlmacen.value && equipoDestinoAlmacen.value) {
        const equipoDestino = equipoDestinoAlmacen.value
        updates.id_equi = Number(equipoDestino.id)
        updates.telefono_uid = equipoDestino.uid || ''
        updates.equipo = equipoDestino.nombre || ''
      }
      const res = await window.db.update('imei', imei.id, updates)
      if (!res.success) throw new Error(res.error || `No se pudo mover el IMEI ${imei.nombre || imei.id}`)
    }
    dialogCambioAlmacenMultiple.value = false
    selectedImeis.value = []
    const detalle = soloAlmacen.value
      ? `${cantidad} IMEI(s) movidos a ${almacenDestinoMultiple.value.nombre}`
      : `${cantidad} IMEI(s) asignados a ${equipoDestinoAlmacen.value.nombre}`
    toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: detalle, life: 3000 })
    await cargarImeis()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al cambiar almacen y equipo', life: 4000 })
  }
}

async function aplicarCambioCapacidadMultiple() {
  if (!nuevaCapacidadMultiple.value.trim()) return
  for (const imei of selectedImeis.value) {
    await window.db.update('imei', imei.id, { capacidad: nuevaCapacidadMultiple.value.trim().toUpperCase() })
  }
  dialogCambioCapacidadMultiple.value = false
  selectedImeis.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Capacidad cambiada', life: 2000 })
  await cargarImeis()
}

function abrirCambiarProveedorMultiple() {
  busquedaProveedorMultiple.value = ''
  proveedorSeleccionadoMultiple.value = null
  dialogCambioProveedorMultiple.value = true
}

async function aplicarCambioProveedorMultiple() {
  if (!proveedorSeleccionadoMultiple.value) return
  for (const imei of selectedImeis.value) {
    await window.db.update('imei', imei.id, { proveedor: proveedorSeleccionadoMultiple.value.nombre })
  }
  dialogCambioProveedorMultiple.value = false
  selectedImeis.value = []
  toast.add({ severity: 'success', summary: 'Actualizados', detail: 'Proveedor cambiado', life: 2000 })
  await cargarImeis()
}

function confirmarBorrarMultiple() {
  if (selectedImeis.value.length === 0) return
  selectedImei.value = null
  reiniciarOtpEliminar()
  deleteDialogVisible.value = true
}

async function solicitarOtpEliminarImei() {
  const imeisParaBorrar = imeisParaEliminar.value
  if (!imeisParaBorrar.length) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('imei:solicitarOtpEliminar', {
      id: imeisParaBorrar[0]?.id,
      imeiIds: imeisParaBorrar.map((imei: any) => imei.id),
      nombre: imeisParaBorrar.length === 1 ? imeisParaBorrar[0]?.nombre : '',
      cantidad: imeisParaBorrar.length,
      entidad: 'IMEI',
      entidadPlural: 'IMEI',
    }) as any
    if (res.success) {
    deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (error: any) {
    deleteOtpError.value = error.message || 'Error solicitando codigo'
  } finally {
    deleteOtpLoading.value = false
  }
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

function aplicarVariablesImei(valor: string, imei: any): string {
  return String(valor || '')
    .replace(/\{IMEI\}/g, imei?.nombre || '')
    .replace(/\{PRECIO\}/g, formatPrecio(imei?.precio_venta))
    .replace(/\{PRECIO_VENTA\}/g, formatPrecio(imei?.precio_venta))
    .replace(/\{EMPRESA\}/g, empresaNombre.value || '')
    .replace(/\{NOMBRE_EMPRESA\}/g, empresaNombre.value || '')
    .replace(/MI EMPRESA/g, empresaNombre.value || 'MI EMPRESA')
    .replace(/RD\$ 0\.00/g, formatPrecio(imei?.precio_venta))
}

function mmToDots(mm: number) {
  return Math.round(Number(mm || 0) * 8)
}

function generarTsplImei(plantilla: any, elementos: any[], imei: any) {
  const ancho = Number(plantilla.ancho || 50)
  const alto = Number(plantilla.alto || 30)
  let tspl = `SIZE ${ancho} mm,${alto} mm\r\nGAP 2 mm,0\r\nCLS\r\n`

  for (const el of JSON.parse(JSON.stringify(elementos))) {
    if (typeof el.contenido === 'string') {
      el.contenido = aplicarVariablesImei(el.contenido, imei)
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

function abrirImprimirEtiquetaIndividual(imei: any) {
  selectedImeis.value = [imei]
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

async function imprimirEtiquetaImei(plantilla: any) {
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
    for (const imei of selectedImeis.value) {
      try {
        const tspl = generarTsplImei(plantilla, elementos, imei)
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

  for (const imei of selectedImeis.value) {
    let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>'
    html += 'body{margin:0;padding:0;font-family:Arial,sans-serif}'
    html += `.label{width:${mmToPx(ancho)}px;height:${mmToPx(alto)}px;position:relative;overflow:hidden;background:white}`
    html += '.elem{position:absolute;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:center}'
    html += '</style></head><body><div class="label">'

    const elClone = JSON.parse(JSON.stringify(elementos))
    for (const el of elClone) {
      if (typeof el.contenido === 'string') {
        el.contenido = aplicarVariablesImei(el.contenido, imei)
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
      const res = await window.electron.invoke('print:ticket', html, printerName.value || undefined) as any
      if (res.success) impresas++
      else ultimoError = res.error || 'No se pudo imprimir'
    } catch (error: any) {
      ultimoError = error.message || 'No se pudo imprimir'
    }
  }
  if (impresas > 0) toast.add({ severity: 'success', summary: 'Impreso', detail: `${impresas} etiqueta(s) enviada(s) a la impresora`, life: 2000 })
  else toast.add({ severity: 'error', summary: 'Error', detail: ultimoError || 'No se pudieron imprimir las etiquetas', life: 6000 })
}

async function confirmarEliminarImei() {
  try {
    const imeisParaBorrar = imeisParaEliminar.value
    if (!imeisParaBorrar.length) return
    deleteOtpError.value = ''
    const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
    if (!/^\d{4}$/.test(codigo)) {
      deleteOtpError.value = 'Introduce el codigo de 4 digitos'
      return
    }

    deleteOtpConfirmando.value = true
    const otpRes = await window.electron.invoke('imei:confirmarOtpEliminar', {
      imeiId: imeisParaBorrar[0]?.id,
      imeiIds: imeisParaBorrar.map((imei: any) => imei.id),
      codigo,
    }) as any
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    let eliminados = 0
    for (const imei of imeisParaBorrar) {
      const res = await window.db.delete('imei', imei.id)
      if (!res.success) {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || `No se pudo eliminar ${imei.nombre || imei.id}`, life: 3000 })
        return
      }
      eliminados++
    }
    deleteDialogVisible.value = false
    selectedImei.value = null
    selectedImeis.value = []
    reiniciarOtpEliminar()
    toast.add({ severity: 'success', summary: 'Exito', detail: `${eliminados} IMEI(s) eliminado(s)`, life: 3000 })
    await cargarImeis()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
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

  await almacenStore.load()
  await cargarTelefonos()
  await cargarImeis()
})

useCloudRefresh(['imei', 'telefonos'], cargarImeis)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="IMEI">
      <div class="toolbar-mobile">
        <div class="flex items-center gap-2 flex-wrap">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busqueda" placeholder="Buscar IMEI o teléfono..." />
          </IconField>
          <Select
            v-model="telefonoFiltro"
            :options="telefonosParaFiltro"
            optionLabel="nombre"
            placeholder="Filtrar por teléfono"
            filter
            filterPlaceholder="Buscar teléfono..."
            showClear
            class="w-64"
          />
          <Select
            v-model="estadoFiltro"
            :options="estadosFiltro"
            optionLabel="label"
            optionValue="value"
            class="w-44"
            placeholder="Estado"
          />
          <label v-if="puedeVerTodosAlmacenes" class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            <span class="text-xs font-medium whitespace-nowrap">Ver todos los almacenes</span>
          </label>
        </div>
        <div class="flex items-center gap-2">
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
          <Button label="Nuevo IMEI" icon="pi pi-plus" @click="abrirCrear" />
          <Button label="Sin telefono" icon="pi pi-search" severity="help" @click="seleccionarImeisSinTelefono" v-tooltip="'Seleccionar IMEIs sin telefono o uid asignado'" />
          <Button label="Subir" icon="pi pi-upload" severity="info" :loading="sincronizandoSubir" @click="subirImeis" v-tooltip="'Subir IMEIs al servidor'" />
          <Button label="Bajar" icon="pi pi-download" severity="warning" :loading="sincronizandoBajar" @click="bajarImeis" v-tooltip="'Descargar IMEIs del servidor'" />
        </div>
      </div>

      <div v-if="selectedImeis.length > 0" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium">{{ selectedImeis.length }} seleccionado(s)</span>
        <Button label="Cambiar Estado" icon="pi pi-refresh" severity="info" size="small" @click="abrirCambiarEstadoMultiple" />
        <Button label="Reubicar en otro teléfono" icon="pi pi-mobile" severity="warn" size="small" @click="abrirCambiarEquipoMultiple" />
        <Button label="Color" icon="pi pi-palette" severity="help" size="small" @click="abrirCambiarColorMultiple" />
        <Button label="Capacidad" icon="pi pi-database" severity="info" size="small" @click="abrirCambiarCapacidadMultiple" />
        <Button label="Auto-asignar telefono" icon="pi pi-magic" severity="info" size="small" @click="abrirAutoAsignar" />
        <Button label="Prov." icon="pi pi-truck" severity="info" size="small" @click="abrirCambiarProveedorMultiple" />
        <Button label="Almacen" icon="pi pi-warehouse" severity="success" size="small" @click="abrirCambiarAlmacenMultiple" />
        <Button label="Vender / Carrito" icon="pi pi-shopping-cart" severity="success" size="small" @click="abrirAccionVentaMultiple" />
        <Button label="Imprimir Etiqueta" icon="pi pi-print" severity="warn" size="small" @click="abrirImprimirEtiqueta" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="confirmarBorrarMultiple" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="selectedImeis = []" v-tooltip="'Limpiar seleccion'" />
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        class="imei-data-table"
        :value="imeisFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        v-model:selection="selectedImeis"
        @row-click="abrirEditar($event.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Acciones" style="width: 5rem">
          <template #body="{ data }">
            <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded size="small" @click.stop="abrirMenuAccionesImei($event, data)" v-tooltip="'Acciones'" />
          </template>
        </Column>
        <Column field="nombre" header="IMEI" sortable style="width: 10rem" />
        <Column field="estado" header="Estado" sortable style="width: 8rem">
          <template #body="{ data }">
            <span
              class="px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.estado === 'DISPONIBLE' ? 'bg-green-100 dark:bg-green-900 text-green-700 dark:text-green-300' : 'bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300'"
            >{{ data.estado || 'DISPONIBLE' }}</span>
          </template>
        </Column>
        <Column field="equipo" header="Equipo" sortable style="width: 8rem">
          <template #body="{ data }">
            <span v-if="data.telefono_nombre">{{ data.telefono_nombre }}</span>
            <span v-else class="text-surface-400">-</span>
          </template>
        </Column>
        <Column v-if="verTodosAlmacenes && puedeVerTodosAlmacenes" field="almacen_nombre" header="Almacén" sortable style="width: 10rem" />
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
        <Column header="Ganancia" style="width: 7rem">
          <template #body="{ data }">
            <span :class="Number(data.precio_venta || 0) - Number(data.costo || 0) >= 0 ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-red-600 dark:text-red-400 font-semibold'">
              {{ $formatMoney(Number(data.precio_venta || 0) - Number(data.costo || 0)) }}
            </span>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay IMEI registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="imeisFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay IMEI registrados.</div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-2">
          <div
            v-for="imei in imeisFiltrados"
            :key="imei.id"
            class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-2.5 flex flex-col gap-1.5 transition-shadow hover:shadow-sm text-xs"
          >
            <div class="flex items-center justify-between gap-1">
              <span class="text-[10px] font-mono text-surface-400 truncate">#{{ imei.id }}</span>
              <span class="text-[9px] font-semibold px-1.5 py-0.5 rounded-full leading-tight" :class="getEstadoClass(imei.estado)">
                {{ imei.estado }}
              </span>
            </div>
            <div class="min-w-0">
              <div v-if="imei.telefono_imagen" class="mb-1 h-20 rounded-md overflow-hidden border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-700">
                <img :src="getImageUrl(imei.telefono_imagen)" class="w-full h-full object-cover" :alt="imei.telefono_nombre || 'Equipo'" />
              </div>
              <h4 class="font-bold leading-tight truncate font-mono text-[11px]">IMEI: {{ imei.nombre }}</h4>
              <p v-if="imei.telefono_nombre" class="text-primary font-medium truncate text-[10px]">{{ imei.telefono_nombre }}</p>
              <p v-if="verTodosAlmacenes && puedeVerTodosAlmacenes" class="text-amber-600 dark:text-amber-400 font-medium truncate text-[10px]">
                <i class="pi pi-building mr-1"></i>{{ imei.almacen_nombre }}
              </p>
              <p class="text-surface-400 truncate text-[10px]">{{ [imei.color, imei.capacidad].filter(Boolean).join(' - ') }}</p>
            </div>
            <div class="font-bold text-primary text-xs">{{ $formatMoney(imei.precio_venta) }}</div>
            <div class="flex gap-1 mt-auto pt-1 border-t border-surface-100 dark:border-surface-700">
              <Button
                icon="pi pi-shopping-cart"
                severity="success"
                text
                rounded
                size="small"
                @click="abrirAccionVenta(imei)"
                v-tooltip="'Vender o agregar al carrito'"
              />
              <Button
                icon="pi pi-print"
                severity="warn"
                text
                rounded
                size="small"
                @click="abrirImprimirEtiquetaIndividual(imei)"
                v-tooltip="'Imprimir etiqueta'"
              />
              <Button
                icon="pi pi-pencil"
                severity="info"
                text
                rounded
                size="small"
                @click="abrirEditar(imei)"
                v-tooltip="'Editar'"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                @click="confirmarBorrar(imei)"
                v-tooltip="'Eliminar'"
              />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>
    <Menu ref="imeiActionMenu" :model="imeiActionItems" popup appendTo="body" />

    <Dialog v-model:visible="dialogAccionVenta" header="Vender IMEI" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="space-y-4 pt-1">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
          <template v-if="imeisParaVenta.length === 1">
            <p class="font-semibold">{{ imeiParaVenta?.telefono_nombre }}</p>
            <p class="text-xs text-surface-500 font-mono">IMEI: {{ imeiParaVenta?.nombre }}</p>
          </template>
          <template v-else>
            <p class="font-semibold">{{ imeisParaVenta.length }} IMEIs seleccionados</p>
            <p class="text-xs text-surface-500">Se venderan o agregaran juntos al carrito.</p>
          </template>
        </div>
        <div class="flex flex-col gap-2 max-h-64 overflow-y-auto pr-1">
          <div v-for="imei in imeisParaVenta" :key="imei.id" class="rounded-lg border border-surface-200 dark:border-surface-700 p-2.5">
            <div class="flex items-center justify-between gap-2 mb-2">
              <div class="min-w-0"><p class="font-medium text-sm truncate">{{ imei.telefono_nombre }}</p><p class="text-xs text-surface-400 font-mono truncate">{{ imei.nombre }}</p></div>
              <span class="font-semibold text-primary text-sm">{{ $formatMoney(precioSeleccionadoImei(imei)) }}</span>
            </div>
            <InputNumber v-model="preciosImeiVenta[imei.id]" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid inputClass="text-sm" />
            <div class="flex gap-1 mt-2">
              <Button label="Venta" size="small" text @click="usarPrecioImei(imei, imei.precio_venta)" />
              <Button label="Min." size="small" text severity="warn" @click="usarPrecioImei(imei, imei.precio_min)" />
              <Button label="Mayor" size="small" text severity="success" @click="usarPrecioImei(imei, imei.precio_xmayor)" />
            </div>
          </div>
        </div>
        <div class="flex justify-between font-bold border-t border-surface-200 dark:border-surface-700 pt-2">
          <span>Total</span>
          <span class="text-primary">{{ $formatMoney(imeisParaVenta.reduce((total, imei) => total + precioSeleccionadoImei(imei), 0)) }}</span>
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
      :header="isEditing ? 'Editar IMEI' : 'Nuevo IMEI'"
      modal
      :style="{ width: '36rem' }"
    >
      <div class="flex flex-col gap-3 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">IMEI</label>
            <div class="flex gap-2">
              <InputText
                v-model="form.nombre"
                placeholder="IMEI del dispositivo (15 digitos)"
                pattern="[0-9]{15}"
                inputmode="numeric"
                maxlength="15"
                class="flex-1"
                fluid
                @focus="(e) => e.target.select()"
              />
              <Button
                v-if="isEditing"
                icon="pi pi-search"
                severity="info"
                outlined
                v-tooltip="'Consultar IMEI externo'"
                @click="consultarImeiDialog"
              />
            </div>
            <div v-if="imeiDuplicado" class="flex items-center gap-1.5 text-red-500 text-xs mt-1">
              <i class="pi pi-exclamation-circle"></i>
              <span>Este IMEI ya existe en la base de datos</span>
            </div>
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Equipo</label>
            <Select
              v-model="form.id_equi"
              :options="telefonosAlmacenActual"
              optionLabel="nombre"
              optionValue="id"
              placeholder="Seleccionar"
              filter
              filterPlaceholder="Buscar equipo..."
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
            <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="imeiDuplicado" @click="guardar" />
          </div>
        </div>
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogConsultarImei" header="Consultar IMEI" modal :style="{ width: '28rem' }">
      <div class="flex flex-col gap-4 py-2">
        <div class="flex items-center gap-2">
          <label class="text-sm font-semibold whitespace-nowrap">Servicio:</label>
          <InputText v-model.number="consultaImeiServicio" type="number" class="w-20" placeholder="0" @keydown.enter="ejecutarConsultaImei" />
        </div>
        <div class="flex items-center gap-2">
          <InputText :value="form.nombre" placeholder="IMEI" disabled fluid />
          <Button label="Consultar" icon="pi pi-search" :loading="consultaImeiCargando" @click="ejecutarConsultaImei" />
        </div>
        <div v-if="consultaImeiCargando" class="flex items-center justify-center py-8 text-surface-400 gap-2">
          <i class="pi pi-spin pi-spinner"></i><span>Consultando IMEI...</span>
        </div>
        <div v-else-if="consultaImeiResultado" class="space-y-3">
          <div v-if="consultaImeiResultado.response?.object" class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 divide-y divide-surface-200 dark:divide-surface-700 overflow-hidden">
            <div class="px-4 py-2.5 text-sm flex items-center gap-2" :class="consultaImeiResultado.response.object.blacklistStatus ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'">
              <i :class="consultaImeiResultado.response.object.blacklistStatus ? 'pi pi-times-circle text-red-500' : 'pi pi-check-circle text-green-500'"></i>
              <span class="font-semibold" :class="consultaImeiResultado.response.object.blacklistStatus ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'">{{ consultaImeiResultado.response.object.blacklistStatus ? 'BLACKLISTEADO' : 'LIMPIO' }}</span>
            </div>
            <div v-for="(val, key) in { Modelo: consultaImeiResultado.response.object.model, Nombre: consultaImeiResultado.response.object.modelName, Fabricante: consultaImeiResultado.response.object.manufacturer, IMEI: consultaImeiResultado.response.object.imei }" :key="key" class="flex items-start gap-2 px-4 py-2.5 text-sm">
              <span class="text-surface-400 font-medium min-w-[90px]">{{ key }}:</span><span class="font-medium break-all">{{ val }}</span>
            </div>
            <div class="px-4 py-3 border-t border-surface-200 dark:border-surface-700 space-y-3">
              <p class="text-xs text-surface-500 font-medium">Asignar a telefono del almacen actual:</p>
              <div class="flex gap-2">
                <Select
                  v-model="consultaImeiTelefonoSel"
                  :options="telefonosAlmacenActual"
                  optionLabel="nombre"
                  optionValue="id"
                  placeholder="Seleccionar telefono..."
                  filter
                  filterPlaceholder="Buscar telefono..."
                  fluid
                />
                <Button label="Aplicar" icon="pi pi-check" :disabled="!consultaImeiTelefonoSel" @click="aplicarTelefonoConsulta" />
              </div>
              <Button v-if="telefonoDesdeConsulta" label="Crear telefono" icon="pi pi-plus" severity="info" outlined size="small" :loading="consultaImeiCreandoTelefono" class="w-full" @click="crearTelefonoDesdeConsulta" />
            </div>
          </div>
          <div v-else class="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 text-center">{{ consultaImeiResultado.message || consultaImeiResultado.error || 'Sin resultados' }}</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogConsultarImei = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogAutoAsignar" header="Auto-asignar telefono" modal :style="{ width: '30rem' }">
      <div class="flex flex-col gap-4 py-2">
        <p class="text-sm text-surface-500">
          Se consultara cada uno de los <strong>{{ autoAsignarProgreso.total }}</strong> IMEI(s) seleccionados por API, se
          buscara un telefono existente que coincida con el modelo y, si no existe, se creara automaticamente y se
          asignara su id/uid al IMEI.
        </p>
        <div class="flex items-center gap-2">
          <label class="text-sm font-semibold whitespace-nowrap">Servicio:</label>
          <InputText v-model.number="autoAsignarServicio" type="number" class="w-20" placeholder="0" :disabled="autoAsignarCargando" />
        </div>
        <div v-if="autoAsignarCargando || autoAsignarProgreso.procesados > 0" class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2 text-sm">
          <div class="flex justify-between"><span>Procesados</span><strong>{{ autoAsignarProgreso.procesados }} / {{ autoAsignarProgreso.total }}</strong></div>
          <div class="flex justify-between text-green-600"><span>Asignados</span><strong>{{ autoAsignarProgreso.asignados }}</strong></div>
          <div class="flex justify-between text-blue-600"><span>Telefonos creados</span><strong>{{ autoAsignarProgreso.creados }}</strong></div>
          <div class="flex justify-between text-red-500"><span>Errores</span><strong>{{ autoAsignarProgreso.errores }}</strong></div>
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text :disabled="autoAsignarCargando" @click="dialogAutoAsignar = false" />
        <Button label="Ejecutar" icon="pi pi-magic" :loading="autoAsignarCargando" @click="ejecutarAutoAsignar" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar Eliminacion"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="imeisParaEliminar.length > 1">Seguro que deseas eliminar los <strong>{{ imeisParaEliminar.length }}</strong> IMEI seleccionados?</span>
          <span v-else>Seguro que deseas eliminar <strong>{{ imeisParaEliminar[0]?.nombre }}</strong>?</span>
        </div>
        <div v-if="deleteOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
      <p class="text-xs text-surface-500 text-center">Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.</p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly />
        </div>
        <p v-if="deleteOtpError" class="text-red-500 text-xs text-center">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button v-if="!deleteOtpEnviado" label="Enviar OTP" icon="pi pi-envelope" severity="danger" :loading="deleteOtpLoading" @click="solicitarOtpEliminarImei" />
        <Button v-else label="Eliminar" icon="pi pi-trash" severity="danger" :loading="deleteOtpConfirmando" @click="confirmarEliminarImei" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioEstadoMultiple"
      header="Cambiar Estado"
      modal
      :style="{ width: '22rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Cambiar estado de <strong>{{ selectedImeis.length }}</strong> IMEI(s) a:</p>
        <Select v-model="nuevoEstadoMultiple" :options="[{ label: 'Disponible', value: 'DISPONIBLE' }, { label: 'Vendido', value: 'VENDIDO' }, { label: 'Apartado', value: 'APARTADO' }]" optionLabel="label" optionValue="value" fluid />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioEstadoMultiple = false" />
        <Button label="Aplicar" icon="pi pi-check" @click="aplicarCambioEstadoMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioEquipoMultiple"
      header="Reubicar en otro teléfono"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Selecciona el teléfono destino para <strong>{{ selectedImeis.length }}</strong> IMEI(s):</p>
        <InputText v-model="busquedaEquipoMultiple" placeholder="Buscar equipo..." fluid />
        <div class="flex flex-col gap-1 max-h-60 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg p-1">
          <div
            v-for="tel in equiposFiltradosMultiple"
            :key="tel.uid || tel.id"
            class="imei-equipo-option flex items-center gap-2 px-3 py-2 rounded-lg cursor-pointer border border-transparent text-sm"
            :class="equipoSeleccionadoMultiple
              && (equipoSeleccionadoMultiple.uid || equipoSeleccionadoMultiple.id) === (tel.uid || tel.id)
                ? 'imei-equipo-option--selected bg-primary text-primary-contrast'
                : ''"
            @click="equipoSeleccionadoMultiple = tel"
          >
            <i class="pi pi-mobile text-xs"></i>
            <span>{{ tel.nombre }}</span>
          </div>
          <div v-if="equiposFiltradosMultiple.length === 0" class="text-center py-4 text-surface-400 text-sm">Sin resultados</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioEquipoMultiple = false" />
        <Button label="Reubicar" icon="pi pi-check" :disabled="!equipoSeleccionadoMultiple" @click="aplicarCambioEquipoMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioProveedorMultiple"
      header="Cambiar Proveedor"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar nuevo proveedor a <strong>{{ selectedImeis.length }}</strong> IMEI(s):</p>
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
        <p class="text-sm">Asignar nuevo color a <strong>{{ selectedImeis.length }}</strong> IMEI(s):</p>
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
        <p class="text-sm">Asignar nueva capacidad a <strong>{{ selectedImeis.length }}</strong> IMEI(s):</p>
        <InputText v-model="nuevaCapacidadMultiple" placeholder="Ej: 128GB" fluid class="uppercase" style="text-transform: uppercase;" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioCapacidadMultiple = false" />
        <Button label="Aplicar" icon="pi pi-check" :disabled="!nuevaCapacidadMultiple.trim()" @click="aplicarCambioCapacidadMultiple" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogCambioAlmacenMultiple"
      header="Cambiar Almacen y Equipo"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedImeis.length }}</strong> IMEI(s) a otro almacen:</p>
        <div class="flex items-center justify-between gap-2">
          <label class="text-sm font-semibold">Solo cambiar almacen (sin equipo)</label>
          <ToggleSwitch v-model="soloAlmacen" />
        </div>
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
          <p v-if="almacenesLista.length === 0" class="text-xs text-amber-600 dark:text-amber-400">
            No hay otro almacen disponible para realizar el traslado.
          </p>
        </div>
        <div v-if="!soloAlmacen" class="space-y-1.5">
          <label class="text-sm font-semibold">Equipo del almacen destino</label>
          <Select
            v-model="equipoDestinoAlmacen"
            :options="equiposAlmacenDestino"
            optionLabel="nombre"
            placeholder="Seleccionar telefono"
            :disabled="!almacenDestinoMultiple || equiposAlmacenDestino.length === 0"
            filter
            fluid
          />
          <p v-if="almacenDestinoMultiple && equiposAlmacenDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">
            Este almacen no tiene telefonos registrados. Crea primero el equipo en ese almacen.
          </p>
          <p v-else-if="equipoDestinoAlmacen" class="text-xs text-surface-500">
            Los IMEI quedaran asignados a <strong>{{ equipoDestinoAlmacen.nombre }}</strong>.
          </p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioAlmacenMultiple = false" />
        <Button
          :label="soloAlmacen ? 'Mover solo almacen' : 'Mover y Asignar'"
          :icon="soloAlmacen ? 'pi pi-warehouse' : 'pi pi-warehouse'"
          :disabled="!almacenDestinoMultiple || (!soloAlmacen && !equipoDestinoAlmacen)"
          @click="cambiarAlmacenMultiple"
        />
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
          <p class="text-sm text-surface-500">Imprimir etiqueta de <strong>{{ selectedImeis.length }}</strong> IMEI(s):</p>
          <div v-if="plantillasFiltradas.length === 0" class="text-center py-4 text-surface-400 text-sm">{{ busquedaPlantilla ? 'Sin resultados' : 'No hay plantillas. Crea una en Inventario > Etiquetas.' }}</div>
          <div v-else class="flex flex-col gap-2 max-h-44 overflow-y-auto">
            <div
              v-for="p in plantillasFiltradas" :key="p.id"
              class="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-all cursor-pointer"
              @click="imprimirEtiquetaImei(p)"
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
        <Button label="Crear y Seleccionar" icon="pi pi-check" :disabled="!nuevoProveedorForm.nombre.trim()" @click="crearProveedorImei" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.imei-equipo-option {
  transition: background-color 150ms ease, border-color 150ms ease, color 150ms ease, transform 150ms ease;
}

.imei-equipo-option:not(.imei-equipo-option--selected):hover {
  background-color: rgba(59, 130, 246, 0.24) !important;
  border-color: #3b82f6 !important;
  color: #93c5fd !important;
  transform: translateX(3px);
}

.imei-data-table :deep(.p-datatable-tbody > tr) {
  cursor: pointer;
  transition: background-color 150ms ease, box-shadow 150ms ease;
}

.imei-data-table :deep(.p-datatable-tbody > tr:not(.p-datatable-row-selected):hover) {
  background-color: rgba(59, 130, 246, 0.24) !important;
  box-shadow: inset 4px 0 0 #3b82f6;
}

.imei-data-table :deep(.p-datatable-tbody > tr:not(.p-datatable-row-selected):hover > td) {
  background-color: transparent !important;
}
</style>
