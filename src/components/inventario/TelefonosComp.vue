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
import InputOtp from 'primevue/inputotp'
import Select from 'primevue/select'
import Chip from 'primevue/chip'
import SelectButton from 'primevue/selectbutton'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron, encryptarPassword } from '@/funciones/funciones.js'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { uploadImage, getImageUrl, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import { imeiBelongsToPhone } from '@/domain/phoneImeiRelation'

const toast = useToast()
const router = useRouter()
const auth = useAuthStore()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const telefonos = ref<any[]>([])
const telefonosRaw = ref<any[]>([])
const imeisDisponiblesRaw = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const detalleDialogVisible = ref(false)
const imeiDialogVisible = ref(false)
const imeiAccionesVisible = ref(false)
const editarImeiVisible = ref(false)
const guardandoEdicionImei = ref(false)
const eliminarImeiDialogVisible = ref(false)
const eliminarImeiOtpEnviado = ref(false)
const eliminarImeiOtpLoading = ref(false)
const eliminandoImei = ref(false)
const eliminarImeiOtp = ref('')
const eliminarImeiOtpEmail = ref('')
const eliminarImeiError = ref('')
const reubicarImeiVisible = ref(false)
const imeiSeleccionado = ref<any>(null)
const telefonoDestinoImei = ref<any>(null)
const isEditing = ref(false)
const selectedTelefono = ref<any>(null)
const busqueda = ref('')
const busquedaImeiTelefono = ref('')
const imeisDelTelefono = ref<any[]>([])
const imeisDisponibles = ref<any[]>([])
const selectedTelefonos = ref<any[]>([])
const flippedTelId = ref<number | null>(null)
const imeiSearch = ref('')
const proveedores = ref<any[]>([])
const dialogNuevoProveedor = ref(false)
const nuevoProveedorForm = ref({ nombre: '', telefono: '', direccion: '' })
const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCorto = ref('')
const form = ref({ nombre: '', imagen: '' })
const fileInput = ref<HTMLInputElement | null>(null)
const subiendoImagen = ref(false)
const dialogBuscarImagen = ref(false)
const consultaImagen = ref('')
const resultadosImagen = ref<any[]>([])
const buscandoImagen = ref(false)
const importandoImagenUrl = ref('')
const dialogMoverAlmacen = ref(false)
const almacenDestino = ref<any>(null)
const almacenesDestino = ref<any[]>([])
const moviendoAlmacen = ref(false)
const cantidadImeisATrasladar = ref(0)
const modoImei = ref<'individual' | 'lote'>('individual')
const modosImei = [
  { label: 'Individual', value: 'individual' },
  { label: 'Por Lote', value: 'lote' },
]
const guardandoLote = ref(false)
const batchImeis = ref<string[]>([])
const batchImeiInput = ref('')
const imeiForm = ref({
  nombre: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0,
  color: '', capacidad: '', bateria: '', estado: 'DISPONIBLE',
  fecha_venta: null as Date | null, comprador: '', proveedor: '', no_compra: '',
  precio_vendido: 0, hora_venta: '', no_factura: '', nota: '',
})
const editarImeiForm = ref({
  nombre: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0,
  color: '', capacidad: '', bateria: '', estado: 'DISPONIBLE', proveedor: '', nota: '',
})
const estadosImei = [
  { label: 'DISPONIBLE', value: 'DISPONIBLE' },
  { label: 'VENDIDO', value: 'VENDIDO' },
  { label: 'APARTADO', value: 'APARTADO' },
  { label: 'EN GARANTIA', value: 'EN GARANTIA' },
]

const telefonosAMoverHeader = computed(() => {
  if (selectedTelefonos.value.length > 1) return `Mover ${selectedTelefonos.value.length} telefonos a otro Almacen`
  return 'Mover Telefono a otro Almacen'
})

const telefonosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return telefonos.value
  return telefonos.value.filter(t =>
    t.nombre?.toLowerCase().includes(texto)
  )
})

const imeisDelTelefonoFiltrados = computed(() => {
  const texto = busquedaImeiTelefono.value.toLowerCase().trim()
  if (!texto) return imeisDelTelefono.value
  return imeisDelTelefono.value.filter(i =>
    i.nombre?.toLowerCase().includes(texto) ||
    i.color?.toLowerCase().includes(texto) ||
    i.capacidad?.toLowerCase().includes(texto) ||
    i.proveedor?.toLowerCase().includes(texto)
  )
})

const telefonosDestinoImei = computed(() => telefonos.value.filter((telefono: any) => !imeiBelongsToPhone(imeiSeleccionado.value, telefono)))

const camposArray = ['nombre']
const imeiCamposArray = [
  'nombre',
  'id_equi',
  'estado',
  'costo',
  'precio_venta',
  'precio_min',
  'precio_xmayor',
  'proveedor',
  'color',
  'capacidad',
  'bateria',
  'fecha_venta',
  'hora_venta',
  'comprador',
  'no_compra',
  'precio_vendido',
  'no_factura',
  'nota',
]

function imeiCount(telefonoId: number) {
  const telefono = telefonos.value.find((item: any) => String(item.id) === String(telefonoId))
  return imeisDisponibles.value.filter((i: any) => imeiBelongsToPhone(i, telefono) && String(i.estado || '').toUpperCase() === 'DISPONIBLE').length
}

function imeisDelTel(telefonoId: number) {
  const texto = imeiSearch.value.toLowerCase().trim()
  const telefono = telefonos.value.find((item: any) => String(item.id) === String(telefonoId))
  let list = imeisDisponibles.value.filter((i: any) => imeiBelongsToPhone(i, telefono) && String(i.estado || '').toUpperCase() === 'DISPONIBLE')
  if (texto) list = list.filter((i: any) => i.nombre?.toLowerCase().includes(texto))
  return list
}

function formatCurrency(val: any) {
  return Number(val || 0).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function cargarTelefonos() {
  try {
    const [res, imeiRes] = await Promise.all([
      window.db.getAll('telefonos'),
      window.db.getAll('imei'),
    ])
    if (res.success) {
      telefonosRaw.value = res.data || []
      telefonos.value = verTodosAlmacenes.value ? telefonosRaw.value : filterByAlmacen(res.data || [])
    }
    if (imeiRes.success) {
      imeisDisponiblesRaw.value = imeiRes.data || []
      imeisDisponibles.value = verTodosAlmacenes.value ? imeisDisponiblesRaw.value : filterByAlmacen(imeiRes.data || [])
    }
  } catch (_) {}
}

watch(verTodosAlmacenes, () => {
  if (verTodosAlmacenes.value) {
    telefonos.value = telefonosRaw.value
    imeisDisponibles.value = imeisDisponiblesRaw.value
  } else {
    telefonos.value = filterByAlmacen(telefonosRaw.value)
    imeisDisponibles.value = filterByAlmacen(imeisDisponiblesRaw.value)
  }
})

async function borrarSeleccionados() {
  const seleccionados = selectedTelefonos.value
  if (!seleccionados.length) return
  const confirmar = confirm(`Borrar ${seleccionados.length} telefono(s) seleccionados?`)
  if (!confirmar) return
  for (const tel of seleccionados) {
    if (tel.id) await window.db.delete('telefonos', tel.id)
  }
  selectedTelefonos.value = []
  await cargarTelefonos()
  toast.add({ severity: 'success', summary: 'Eliminados', detail: `${seleccionados.length} telefono(s) borrados`, life: 3000 })
}

async function abrirMoverSeleccionados() {
  const seleccionados = selectedTelefonos.value
  if (!seleccionados.length) return
  selectedTelefono.value = seleccionados[0]
  almacenDestino.value = null
  cantidadImeisATrasladar.value = 0
  try {
    await almacenStore.load()
    const almacenOrigenUid = String(seleccionados[0].almacen_uid || almacenStore.activeUid || '')
    almacenesDestino.value = almacenStore.almacenes.filter((a: any) => String(a.uid || '') !== almacenOrigenUid)
    dialogMoverAlmacen.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

function abrirDetalle(tel: any) {
  selectedTelefono.value = tel
  detalleDialogVisible.value = true
  imeiSearch.value = ''
  cargarImeisDelTelefono(tel.id)
}

async function abrirCrear() {
  isEditing.value = false
  selectedTelefono.value = null
  form.value.nombre = ''
  form.value.imagen = ''
  detalleDialogVisible.value = false
  dialogVisible.value = true
}

function abrirEditar(tel?: any) {
  const telefono = tel || selectedTelefono.value
  if (!telefono) return
  selectedTelefono.value = telefono
  form.value.nombre = telefono.nombre || ''
  form.value.imagen = telefono.imagen || ''
  isEditing.value = true
  dialogVisible.value = true
}

function confirmarBorrar(tel?: any) {
  if (tel) selectedTelefono.value = tel
  deleteDialogVisible.value = true
}

async function borrarTelefono() {
  try {
    const res = await window.db.delete('telefonos', selectedTelefono.value.id)
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'Error al eliminar', life: 4000 })
      return
    }
    deleteDialogVisible.value = false
    await cargarTelefonos()
    toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Telefono eliminado', life: 2000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al eliminar', life: 4000 })
  }
}

async function abrirMoverAlmacen(telefono?: any) {
  const seleccionado = telefono || selectedTelefono.value
  if (!seleccionado) return
  selectedTelefono.value = seleccionado
  almacenDestino.value = null
  cantidadImeisATrasladar.value = 0

  try {
    const [, imeiRes] = await Promise.all([
      almacenStore.load(),
      window.db.getAll('imei'),
    ])
    const almacenOrigenUid = String(seleccionado.almacen_uid || almacenStore.activeUid || '')
    almacenesDestino.value = almacenStore.almacenes.filter((almacen: any) => String(almacen.uid || '') !== almacenOrigenUid)
    if (imeiRes.success) {
      cantidadImeisATrasladar.value = (imeiRes.data || []).filter((imei: any) =>
        imeiBelongsToPhone(imei, seleccionado) && String(imei.estado || '').toUpperCase() === 'DISPONIBLE').length
    }
    dialogMoverAlmacen.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function moverTelefonoAlmacen() {
  if (!selectedTelefono.value || !almacenDestino.value || moviendoAlmacen.value) return
  const telefonosAMover = selectedTelefonos.value.length ? selectedTelefonos.value : [selectedTelefono.value]
  const destinoId = Number(almacenDestino.value.id || almacenDestino.value)
  const destinoUid = String(almacenDestino.value.uid || '')
  moviendoAlmacen.value = true
  let movidos = 0

  try {
    const imeiRes = await window.db.getAll('imei')
    if (!imeiRes.success) throw new Error(imeiRes.error || 'No se pudieron consultar los IMEI asociados')

    for (const telefono of telefonosAMover) {
      const imeisDisponibles = (imeiRes.data || []).filter((imei: any) =>
        imeiBelongsToPhone(imei, telefono) && String(imei.estado || '').toUpperCase() === 'DISPONIBLE')

      const resTel = await window.db.update('telefonos', telefono.id, { almacen_id: destinoId, almacen_uid: destinoUid })
      if (!resTel.success) throw new Error(resTel.error || `No se pudo mover ${telefono.nombre}`)

      for (const imei of imeisDisponibles) {
        const res = await window.db.update('imei', imei.id, {
          almacen_id: destinoId,
          almacen_uid: destinoUid,
          id_equi: telefono.id,
          telefono_uid: telefono.uid || imei.telefono_uid || '',
          equipo: telefono.nombre || imei.equipo || '',
        })
        if (!res.success) throw new Error(res.error || `No se pudo mover el IMEI ${imei.nombre || imei.id}`)
      }
      movidos++
    }

    dialogMoverAlmacen.value = false
    detalleDialogVisible.value = false
    selectedTelefonos.value = []
    toast.add({
      severity: 'success',
      summary: 'Telefono(s) trasladado(s)',
      detail: `${movidos} telefono(s) movidos a ${almacenDestino.value.nombre}`,
      life: 4000,
    })
    await cargarTelefonos()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron trasladar los telefonos', life: 4000 })
  } finally {
    moviendoAlmacen.value = false
  }
}

async function guardarTelefono() {
  const nombre = ((form.value?.nombre || '') as string).trim().toUpperCase()
  if (!nombre) return
  const data: any = { nombre }
  if (form.value.imagen) data.imagen = form.value.imagen
  try {
    let res
    const telefonoId = isEditing.value ? selectedTelefono.value.id : null
    if (isEditing.value) res = await window.db.update('telefonos', telefonoId, data)
    else res = await window.db.insert('telefonos', addAlmacenId(data))
    if (!res.success) {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'Error al guardar', life: 4000 })
      return
    }
    toast.add({ severity: 'success', summary: 'Guardado en la nube', detail: `Telefono ${isEditing.value ? 'actualizado' : 'creado'}`, life: 3000 })
    form.value.nombre = ''
    dialogVisible.value = false
    await cargarTelefonos()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al guardar', life: 4000 })
  }
}

async function cargarImeisDelTelefono(telefonoId: number) {
  const res = await window.db.getAll('imei')
  if (res.success) {
    const telefono = telefonos.value.find((item: any) => String(item.id) === String(telefonoId)) || selectedTelefono.value
    imeisDelTelefono.value = filterByAlmacen(res.data || []).filter((i: any) =>
      imeiBelongsToPhone(i, telefono) && String(i.estado || '').toUpperCase() === 'DISPONIBLE')
  }
}

function itemPosDesdeImei(imei: any) {
  return {
    tipo: 'imei', imei_id: imei.id, imei_ids: [imei.id], imei: imei.nombre, imeis: [imei.nombre],
    codigo: imei.nombre || '', nombre: selectedTelefono.value?.nombre || imei.equipo || '', telefono_id: selectedTelefono.value?.id ?? imei.id_equi,
    color: imei.color || '', colores: imei.color ? [imei.color] : [],
    capacidad: imei.capacidad || '', capacidades: imei.capacidad ? [imei.capacidad] : [],
    precio: Number(imei.precio_venta || 0), precio_normal: Number(imei.precio_venta || 0),
    costo: Number(imei.costo || 0), cantidad: 1,
  }
}

function abrirAccionesImei(imei: any) {
  imeiSeleccionado.value = imei
  imeiAccionesVisible.value = true
}

function abrirEditarImeiDesdeAcciones() {
  const imei = imeiSeleccionado.value
  if (!imei?.id) return
  editarImeiForm.value = {
    nombre: String(imei.nombre || ''),
    costo: Number(imei.costo || 0),
    precio_venta: Number(imei.precio_venta || 0),
    precio_min: Number(imei.precio_min || 0),
    precio_xmayor: Number(imei.precio_xmayor || 0),
    color: String(imei.color || ''),
    capacidad: String(imei.capacidad || ''),
    bateria: String(imei.bateria || ''),
    estado: String(imei.estado || 'DISPONIBLE'),
    proveedor: String(imei.proveedor || ''),
    nota: String(imei.nota || ''),
  }
  imeiAccionesVisible.value = false
  editarImeiVisible.value = true
}

async function guardarEdicionImeiDesdeTelefono() {
  const imei = imeiSeleccionado.value
  const nombre = editarImeiForm.value.nombre.replace(/\D/g, '')
  if (!imei?.id || guardandoEdicionImei.value) return
  if (nombre.length !== 15) {
    toast.add({ severity: 'warn', summary: 'IMEI invalido', detail: 'El IMEI debe tener exactamente 15 digitos', life: 3500 })
    return
  }

  guardandoEdicionImei.value = true
  try {
    const existentes = await window.db.getAll('imei')
    if (!existentes.success) throw new Error(existentes.error || 'No se pudo validar el IMEI')
    const duplicado = (existentes.data || []).some((item: any) =>
      String(item.nombre || '') === nombre && Number(item.id) !== Number(imei.id))
    if (duplicado) throw new Error('Ese IMEI ya esta registrado')

    const data = {
      nombre,
      costo: Number(editarImeiForm.value.costo || 0),
      precio_venta: Number(editarImeiForm.value.precio_venta || 0),
      precio_min: Number(editarImeiForm.value.precio_min || 0),
      precio_xmayor: Number(editarImeiForm.value.precio_xmayor || 0),
      color: editarImeiForm.value.color.trim().toUpperCase(),
      capacidad: editarImeiForm.value.capacidad.trim().toUpperCase(),
      bateria: editarImeiForm.value.bateria.trim().toUpperCase(),
      estado: editarImeiForm.value.estado,
      proveedor: editarImeiForm.value.proveedor.trim().toUpperCase(),
      nota: editarImeiForm.value.nota.trim(),
    }
    const res = await window.db.update('imei', imei.id, data)
    if (!res.success) throw new Error(res.error || 'No se pudo actualizar el IMEI en la nube')

    Object.assign(imei, data)
    editarImeiVisible.value = false
    if (selectedTelefono.value?.id) await cargarImeisDelTelefono(selectedTelefono.value.id)
    await cargarTelefonos()
    toast.add({ severity: 'success', summary: 'Guardado en la nube', detail: `IMEI ${nombre} actualizado`, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo editar', detail: error?.message || 'Error al actualizar el IMEI', life: 4500 })
  } finally {
    guardandoEdicionImei.value = false
  }
}

function confirmarEliminarImeiDesdeAcciones() {
  if (!imeiSeleccionado.value?.id) return
  eliminarImeiOtpEnviado.value = false
  eliminarImeiOtpLoading.value = false
  eliminandoImei.value = false
  eliminarImeiOtp.value = ''
  eliminarImeiOtpEmail.value = ''
  eliminarImeiError.value = ''
  imeiAccionesVisible.value = false
  eliminarImeiDialogVisible.value = true
}

async function solicitarOtpEliminarImeiDesdeTelefono() {
  const imei = imeiSeleccionado.value
  if (!imei?.id || eliminarImeiOtpLoading.value) return
  eliminarImeiError.value = ''
  eliminarImeiOtp.value = ''
  eliminarImeiOtpLoading.value = true
  try {
    const res = await window.electron.invoke('imei:solicitarOtpEliminar', {
      id: imei.id,
      imeiIds: [imei.id],
      nombre: imei.nombre || '',
      cantidad: 1,
      entidad: 'IMEI',
      entidadPlural: 'IMEI',
    }) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo generar el codigo')
    eliminarImeiOtpEmail.value = res.data?.networkUrl || ''
    eliminarImeiOtpEnviado.value = true
    toast.add({ severity: 'success', summary: 'Codigo generado', detail: 'Consulta el codigo en el Centro OTP', life: 3000 })
  } catch (error: any) {
    eliminarImeiError.value = error?.message || 'No se pudo generar el codigo'
  } finally {
    eliminarImeiOtpLoading.value = false
  }
}

async function eliminarImeiDesdeTelefono() {
  const imei = imeiSeleccionado.value
  if (!imei?.id || eliminandoImei.value) return
  eliminarImeiError.value = ''
  const codigo = String(eliminarImeiOtp.value || '').replace(/\D/g, '')
  if (!/^\d{4}$/.test(codigo)) {
    eliminarImeiError.value = 'Introduce el codigo de 4 digitos'
    return
  }

  eliminandoImei.value = true
  try {
    const otpRes = await window.electron.invoke('imei:confirmarOtpEliminar', {
      imeiId: imei.id,
      imeiIds: [imei.id],
      codigo,
    }) as any
    if (!otpRes?.success) throw new Error(otpRes?.error || 'Codigo no valido')

    const res = await window.db.delete('imei', imei.id)
    if (!res.success) throw new Error(res.error || 'No se pudo eliminar el IMEI')

    eliminarImeiDialogVisible.value = false
    imeiSeleccionado.value = null
    if (selectedTelefono.value?.id) await cargarImeisDelTelefono(selectedTelefono.value.id)
    await cargarTelefonos()
    window.dispatchEvent(new CustomEvent('inventory-changed', { detail: { table: 'imei' } }))
    toast.add({ severity: 'success', summary: 'IMEI eliminado', detail: 'El IMEI fue eliminado correctamente', life: 3000 })
  } catch (error: any) {
    eliminarImeiError.value = error?.message || 'No se pudo eliminar el IMEI'
  } finally {
    eliminandoImei.value = false
  }
}

function validarImeiParaVenta(imei: any): boolean {
  if (Number(imei?.precio_venta || 0) <= 0) {
    toast.add({ severity: 'warn', summary: 'Precio requerido', detail: 'Este IMEI necesita un precio de venta mayor que cero', life: 3000 })
    return false
  }
  return true
}

function agregarImeiAlCarrito() {
  const imei = imeiSeleccionado.value
  if (!imei || !validarImeiParaVenta(imei)) return
  try {
    const data = JSON.parse(localStorage.getItem('pos_cart_data') || '{}')
    const cart = Array.isArray(data.cart) ? data.cart : []
    if (cart.some((item: any) => item.tipo === 'imei' && (Number(item.imei_id) === Number(imei.id) || (item.imei_ids || []).map(Number).includes(Number(imei.id))))) {
      toast.add({ severity: 'warn', summary: 'Ya agregado', detail: 'Este IMEI ya está en el carrito del POS', life: 3000 })
      return
    }
    data.cart = [...cart, itemPosDesdeImei(imei)]
    localStorage.setItem('pos_cart_data', JSON.stringify(data))
    imeiAccionesVisible.value = false
    router.push('/vender')
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo agregar el IMEI al carrito', life: 3000 })
  }
}

function venderImeiExpress() {
  const imei = imeiSeleccionado.value
  if (!imei || !validarImeiParaVenta(imei)) return
  localStorage.setItem('pos_cart_data', JSON.stringify({
    cart: [itemPosDesdeImei(imei)], cliente: { id: null, nombre: 'AL CONTADO', telefono: '' }, clienteExpress: '', metodoPago: 'EFECTIVO',
    descuento_fijo: 0, descuento_porc: 0, descuento_tipo: 'fijo', descuento_valor: 0,
    nota: '', es_cotizacion: false, venta_express_pendiente: true,
  }))
  imeiAccionesVisible.value = false
  router.push('/vender')
}

function abrirReubicarImei() {
  telefonoDestinoImei.value = null
  imeiAccionesVisible.value = false
  reubicarImeiVisible.value = true
}

async function reubicarImei() {
  const imei = imeiSeleccionado.value
  const destino = telefonoDestinoImei.value
  if (!imei || !destino) return
  const res = await window.db.update('imei', imei.id, { id_equi: destino.id, telefono_uid: destino.uid || '', equipo: destino.nombre || '' })
  if (!res.success) {
    toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo reubicar el IMEI', life: 3000 })
    return
  }
  if (isOnline()) await pushLocalRowToCloud('imei', imei.id)
  reubicarImeiVisible.value = false
  toast.add({ severity: 'success', summary: 'IMEI reubicado', detail: `Asignado a ${destino.nombre}`, life: 2500 })
  await cargarTelefonos()
  if (selectedTelefono.value?.id) await cargarImeisDelTelefono(selectedTelefono.value.id)
}

function abrirAgregarImei() {
  batchImeis.value = []
  batchImeiInput.value = ''
  imeiForm.value = {
    nombre: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0,
    color: '', capacidad: '', bateria: '', estado: 'DISPONIBLE',
    fecha_venta: null, comprador: '', proveedor: '', no_compra: '',
    precio_vendido: 0, hora_venta: '', no_factura: '', nota: '',
  }
  imeiDialogVisible.value = true
}

function onBatchInput(e: Event) {
  const target = e.target as HTMLInputElement
  let raw = String(target?.value || '').replace(/\D/g, '')
  let added = 0
  while (raw.length >= 15 && added < 10) {
    const imei = raw.substring(0, 15)
    if (!batchImeis.value.includes(imei)) batchImeis.value = [...batchImeis.value, imei]
    raw = raw.substring(15)
    added++
  }
  batchImeiInput.value = raw
  if (target) target.value = raw
}

async function crearProveedorTel() {
  if (!nuevoProveedorForm.value.nombre.trim()) return
  const data = {
    nombre: nuevoProveedorForm.value.nombre.trim().toUpperCase(),
    telefono: nuevoProveedorForm.value.telefono.trim(),
    direccion: nuevoProveedorForm.value.direccion.trim().toUpperCase(),
  }
  const res = await window.db.insert('proveedores', addAlmacenId(data))
  if (res.success) {
    const newProv = { id: res.data?.id || 0, ...data }
    proveedores.value.push(newProv)
    imeiForm.value.proveedor = data.nombre
    dialogNuevoProveedor.value = false
    toast.add({ severity: 'success', summary: 'Creado', detail: data.nombre, life: 2000 })
  }
}

async function guardarImei() {
  if (!selectedTelefono.value?.id) return
  if (!imeiForm.value.nombre.trim() || imeiForm.value.nombre.length !== 15) { toast.add({ severity: 'warn', summary: 'IMEI invalido', detail: '15 digitos requeridos', life: 3000 }); return }
  try {
    if (!almacenStore.activeUid) await almacenStore.load()
    const almacenUid = String(almacenStore.activeUid || almacenStore.activeAlmacen?.uid || '')
    const existe = await window.db.getAll('imei')
    if (existe.success && (existe.data || []).find((i: any) => i.nombre === imeiForm.value.nombre.trim())) { toast.add({ severity: 'warn', summary: 'Duplicado', detail: 'El IMEI ya existe', life: 3000 }); return }
    const creado = await window.db.insert('imei', addAlmacenId({ nombre: imeiForm.value.nombre.trim(), id_equi: selectedTelefono.value.id, telefono_uid: selectedTelefono.value.uid || '', almacen_uid: almacenUid, costo: imeiForm.value.costo || 0, precio_venta: imeiForm.value.precio_venta || 0, precio_min: imeiForm.value.precio_min || 0, precio_xmayor: imeiForm.value.precio_xmayor || 0, color: imeiForm.value.color.toUpperCase(), capacidad: imeiForm.value.capacidad.toUpperCase(), bateria: '', estado: 'DISPONIBLE', fecha_venta: null, comprador: '', proveedor: imeiForm.value.proveedor.toUpperCase(), no_compra: '', precio_vendido: 0, hora_venta: '', no_factura: '', nota: '' }))
    if (!creado.success) throw new Error(creado.error || 'La nube rechazo el IMEI')
    toast.add({ severity: 'success', summary: 'Guardado en la nube', detail: 'IMEI creado', life: 3000 })
    imeiDialogVisible.value = false
    await Promise.all([cargarImeisDelTelefono(selectedTelefono.value.id), cargarTelefonos()])
    window.dispatchEvent(new CustomEvent('inventory-changed', { detail: { table: 'imei' } }))
    sincronizarImeiServidor({ nombre: imeiForm.value.nombre.trim(), costo: imeiForm.value.costo, precio_venta: imeiForm.value.precio_venta, proveedor: imeiForm.value.proveedor })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'No se guardo', detail: error?.message || 'Error al guardar en la nube', life: 4000 }) }
}

async function agregarImeiEnLote() {
  if (!selectedTelefono.value?.id) return
  const imeis = [...batchImeis.value]
  if (imeis.length === 0) { toast.add({ severity: 'warn', summary: 'Vacio', detail: 'No hay IMEIs', life: 3000 }); return }
  guardandoLote.value = true
  try {
    if (!almacenStore.activeUid) await almacenStore.load()
    const almacenUid = String(almacenStore.activeUid || almacenStore.activeAlmacen?.uid || '')
    const existentes = new Set(((await window.db.getAll('imei')).data || []).map((i: any) => i.nombre))
    let insertados = 0, errores = 0, duplicados = 0
    for (const imei of imeis) {
      if (existentes.has(imei)) { duplicados++; continue }
      try {
        const creado = await window.db.insert('imei', addAlmacenId({ nombre: imei, id_equi: selectedTelefono.value.id, telefono_uid: selectedTelefono.value.uid || '', almacen_uid: almacenUid, costo: imeiForm.value.costo || 0, precio_venta: imeiForm.value.precio_venta || 0, precio_min: imeiForm.value.precio_min || 0, precio_xmayor: imeiForm.value.precio_xmayor || 0, color: imeiForm.value.color.toUpperCase(), capacidad: imeiForm.value.capacidad.toUpperCase(), bateria: '', estado: 'DISPONIBLE', fecha_venta: null, comprador: '', proveedor: imeiForm.value.proveedor.toUpperCase(), no_compra: '', precio_vendido: 0, hora_venta: '', no_factura: '', nota: '' }))
        if (!creado.success) throw new Error(creado.error || 'La nube rechazo el IMEI')
        insertados++
        sincronizarImeiServidor({ nombre: imei, costo: imeiForm.value.costo, precio_venta: imeiForm.value.precio_venta, proveedor: imeiForm.value.proveedor })
      } catch { errores++ }
    }
    let msg = `${insertados} insertados`
    if (duplicados > 0) msg += `, ${duplicados} duplicados`
    if (errores > 0) msg += `, ${errores} errores`
    toast.add({ severity: insertados > 0 ? 'success' : 'warn', summary: 'Lote procesado', detail: msg, life: 3000 })
    imeiDialogVisible.value = false
    await Promise.all([cargarImeisDelTelefono(selectedTelefono.value.id), cargarTelefonos()])
    window.dispatchEvent(new CustomEvent('inventory-changed', { detail: { table: 'imei' } }))
  } catch (_) {} finally { guardandoLote.value = false }
}

async function sincronizarImeiServidor(datos: any) {
  try {
    const cfgRes = await window.db.getAll('servidor_sync_config')
    const cfg = cfgRes.success && cfgRes.data?.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.activo) return
    const tablasSync: string[] = cfg.tablas_sync ? JSON.parse(cfg.tablas_sync) : []
    if (!tablasSync.includes('imei')) return
    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)
    const empresaRes = await window.db.getAll('empresa')
    const almacen = (empresaRes.success && empresaRes.data?.[0]?.nombre) || ''
    const campos = ['id','almacen','imei','estado','fecha','equipo','proveedor','id_equi','costo','precio_venta','factura','no_compra','fecha_venta','hora_venta','comprador','detalles','usuario','created_at','updated_at','identificadordb','marca','modelo','preciocompra','precioventa','vendedor','cedula','telefono','direccion','nota','precio_compra','precio_min','precio_xmayor','ganancia','no_factura','bateria','capacidad']
    const enviar: Record<string, any> = {
      almacen, imei: String(datos.nombre || ''), estado: 'DISPONIBLE',
      fecha: new Date().toLocaleDateString(systemLocale.value), equipo: '', proveedor: String(datos.proveedor || ''),
      id_equi: String(selectedTelefono.value?.uid || selectedTelefono.value?.id || ''), costo: String(datos.costo || '0'),
      precio_venta: String(datos.precio_venta || '0'), factura: '', no_compra: '',
      fecha_venta: '', hora_venta: '', comprador: '', detalles: '', usuario: '',
      marca: '', modelo: '', preciocompra: String(datos.costo || '0'), precioventa: String(datos.precio_venta || '0'),
      vendedor: '', cedula: '', telefono: '', direccion: '', nota: '',
      precio_compra: String(datos.costo || '0'), precio_min: '0', precio_xmayor: '0', ganancia: '',
      no_factura: '', bateria: '', capacidad: '',
    }
    for (const key of Object.keys(enviar)) { if (!campos.includes(key)) delete enviar[key] }
    if (Object.keys(enviar).length === 0) return
    const existeRes = await fetch(`${baseUrl}/datoscampo/imei/imei/${encodeURIComponent(datos.nombre || '')}`, { method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token } })
    let servidorId: string | null = null
    if (existeRes.ok) {
      try { const d = await existeRes.json(); const e = Array.isArray(d) ? d[0] : d?.data || d; if (e?.id) servidorId = String(e.id) } catch {}
    }
    if (servidorId) { enviar.id = servidorId; await fetch(`${baseUrl}/actualizarcampos/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token }, body: JSON.stringify(enviar) }) }
    else { await fetch(`${baseUrl}/insertar/imei`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token }, body: JSON.stringify(enviar) }) }
  } catch {}
}

async function subirImagen() {
  const input = fileInput.value
  if (!input?.files?.length) return
  const file = input.files[0]
  if (!file.type.startsWith('image/')) {
    toast.add({ severity: 'warn', summary: 'Solo imagenes', detail: 'Selecciona un archivo de imagen', life: 3000 })
    return
  }
  if (!tmCloudConnected()) {
    toast.add({ severity: 'warn', summary: 'TM Cloud no configurado', detail: 'Configura TM Cloud para subir imagenes', life: 3000 })
    return
  }
  subiendoImagen.value = true
  try {
    const uid = await uploadImage(file, 'telefonos')
    form.value.imagen = uid
    if (isEditing.value && selectedTelefono.value?.id) {
      const actualizado = await window.db.update('telefonos', selectedTelefono.value.id, { imagen: uid })
      if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo guardar la imagen')
      selectedTelefono.value.imagen = uid
      const local = telefonos.value.find((telefono: any) => telefono.id === selectedTelefono.value.id)
      if (local) local.imagen = uid
      if (isOnline()) await pushLocalRowToCloud('telefonos', selectedTelefono.value.id)
    }
    toast.add({ severity: 'success', summary: 'Imagen subida', life: 2000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo subir la imagen', life: 4000 })
  } finally {
    subiendoImagen.value = false
    input.value = ''
  }
}

function abrirBusquedaImagen() {
  consultaImagen.value = String(form.value.nombre || selectedTelefono.value?.nombre || '').trim()
  resultadosImagen.value = []
  dialogBuscarImagen.value = true
  if (consultaImagen.value) buscarImagenesInternet()
}

function textoPlanoMetadata(value: unknown): string {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#039;|&apos;/gi, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

async function buscarImagenesInternet() {
  const termino = consultaImagen.value.trim()
  if (!termino || buscandoImagen.value) return
  buscandoImagen.value = true
  resultadosImagen.value = []
  const controller = new AbortController()
  const timeoutId = window.setTimeout(() => controller.abort(), 15000)
  try {
    const openverseParams = new URLSearchParams({
      q: termino,
      page_size: '30',
      mature: 'false',
    })
    const commonsParams = new URLSearchParams({
      action: 'query',
      format: 'json',
      origin: '*',
      generator: 'search',
      gsrsearch: `${termino} smartphone`,
      gsrnamespace: '6',
      gsrlimit: '24',
      prop: 'imageinfo',
      iiprop: 'url|mime|extmetadata',
      iiurlwidth: '640',
    })

    const [openverseResult, commonsResult] = await Promise.allSettled([
      fetch(`https://api.openverse.org/v1/images/?${openverseParams.toString()}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(`Openverse respondió HTTP ${response.status}`)
        return response.json()
      }),
      fetch(`https://commons.wikimedia.org/w/api.php?${commonsParams.toString()}`, { signal: controller.signal }).then(async response => {
        if (!response.ok) throw new Error(`Wikimedia respondió HTTP ${response.status}`)
        return response.json()
      }),
    ])

    const openverseData: any = openverseResult.status === 'fulfilled' ? openverseResult.value : null
    const commonsData: any = commonsResult.status === 'fulfilled' ? commonsResult.value : null
    if (!openverseData && !commonsData) {
      const primerError = openverseResult.status === 'rejected' ? openverseResult.reason : commonsResult.status === 'rejected' ? commonsResult.reason : null
      throw primerError || new Error('Los proveedores de imágenes no respondieron')
    }

    const resultadosOpenverse = (openverseData?.results || [])
      .map((imagen: any) => ({
        id: `openverse-${imagen?.id}`,
        titulo: textoPlanoMetadata(imagen?.title) || 'Imagen sin título',
        miniatura: imagen?.thumbnail || '',
        url: imagen?.thumbnail || '',
        fuente: imagen?.foreign_landing_url || imagen?.detail_url || '',
        mime: 'image/jpeg',
        autor: textoPlanoMetadata(imagen?.creator),
        licencia: [imagen?.license, imagen?.license_version].filter(Boolean).join(' ').toUpperCase(),
        proveedor: `Openverse · ${textoPlanoMetadata(imagen?.source || imagen?.provider || 'fuente abierta')}`,
      }))
      .filter((imagen: any) => imagen.url)

    const paginasCommons = Object.values(commonsData?.query?.pages || {}) as any[]
    const resultadosCommons = paginasCommons
      .map((pagina: any) => {
        const info = pagina?.imageinfo?.[0]
        const metadata = info?.extmetadata || {}
        return {
          id: `commons-${pagina?.pageid}`,
          titulo: String(pagina?.title || '').replace(/^File:/i, ''),
          miniatura: info?.thumburl || info?.url || '',
          url: info?.thumburl || info?.url || '',
          fuente: info?.descriptionurl || '',
          mime: info?.thumbmime || info?.mime || 'image/jpeg',
          autor: textoPlanoMetadata(metadata?.Artist?.value),
          licencia: textoPlanoMetadata(metadata?.LicenseShortName?.value || metadata?.UsageTerms?.value),
          proveedor: 'Wikimedia Commons',
        }
      })
      .filter((imagen: any) => imagen.url && /^image\/(jpeg|png|webp)$/i.test(imagen.mime))

    const urlsVistas = new Set<string>()
    resultadosImagen.value = [...resultadosOpenverse, ...resultadosCommons]
      .filter((imagen: any) => {
        const clave = String(imagen.fuente || imagen.titulo || imagen.url).toLowerCase()
        if (urlsVistas.has(clave)) return false
        urlsVistas.add(clave)
        return true
      })
      .slice(0, 42)
    if (!resultadosImagen.value.length) {
      toast.add({ severity: 'info', summary: 'Sin resultados', detail: 'Prueba con la marca y el modelo exacto del teléfono', life: 3500 })
    }
  } catch (error: any) {
    const mensaje = error?.name === 'AbortError' ? 'La búsqueda tardó demasiado. Intenta de nuevo.' : (error?.message || 'No se pudieron buscar imágenes')
    toast.add({ severity: 'error', summary: 'Búsqueda no disponible', detail: mensaje, life: 4500 })
  } finally {
    window.clearTimeout(timeoutId)
    buscandoImagen.value = false
  }
}

async function importarImagenInternet(imagen: any) {
  if (!imagen?.url || importandoImagenUrl.value) return
  if (!tmCloudConnected()) {
    toast.add({ severity: 'warn', summary: 'TM Cloud no configurado', detail: 'Configura TM Cloud para guardar la imagen encontrada', life: 3500 })
    return
  }
  importandoImagenUrl.value = imagen.url
  subiendoImagen.value = true
  try {
    const response = await fetch(imagen.url)
    if (!response.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${response.status})`)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('El resultado seleccionado no es una imagen válida')
    const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
    const nombreArchivo = `${String(form.value.nombre || 'telefono').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'telefono'}.${extension}`
    const file = new File([blob], nombreArchivo, { type: blob.type })
    const uid = await uploadImage(file, 'telefonos')
    form.value.imagen = uid
    if (isEditing.value && selectedTelefono.value?.id) {
      const actualizado = await window.db.update('telefonos', selectedTelefono.value.id, { imagen: uid })
      if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo guardar la imagen')
      selectedTelefono.value.imagen = uid
      const local = telefonos.value.find((telefono: any) => telefono.id === selectedTelefono.value.id)
      if (local) local.imagen = uid
      if (isOnline()) await pushLocalRowToCloud('telefonos', selectedTelefono.value.id)
    }
    dialogBuscarImagen.value = false
    toast.add({ severity: 'success', summary: 'Imagen agregada', detail: 'La imagen de internet fue guardada en el teléfono', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo traer la imagen', detail: error?.message || 'Intenta con otra imagen', life: 4500 })
  } finally {
    importandoImagenUrl.value = ''
    subiendoImagen.value = false
  }
}

async function eliminarImagen() {
  if (!form.value.imagen) return
  try {
    await deleteImage(form.value.imagen)
  } catch {}
  form.value.imagen = ''
  if (isEditing.value && selectedTelefono.value?.id) {
    await window.db.update('telefonos', selectedTelefono.value.id, { imagen: '' })
    if (isOnline()) await pushLocalRowToCloud('telefonos', selectedTelefono.value.id)
  }
}

function imagenUrl(uid: string | null | undefined): string | null {
  return uid ? getImageUrl(uid) : null
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

  await cargarTelefonos()
  const resProv = await window.db.getAll('proveedores')
  if (resProv.success) proveedores.value = resProv.data || []
})

useCloudRefresh(['telefonos', 'imei'], cargarTelefonos)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Telefonos">
      <div class="toolbar-mobile">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar telefono..." />
        </IconField>
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
          <Button label="Nuevo Telefono" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div v-if="selectedTelefonos.length > 0" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium text-primary-700 dark:text-primary-300">{{ selectedTelefonos.length }} seleccionado(s)</span>
        <Button label="Mover de almacen" icon="pi pi-warehouse" severity="success" size="small" @click="abrirMoverSeleccionados" />
        <Button label="Borrar" icon="pi pi-trash" severity="danger" size="small" @click="borrarSeleccionados" />
        <Button label="Deseleccionar" icon="pi pi-times" severity="secondary" text size="small" @click="selectedTelefonos = []" />
      </div>
      <div v-if="viewMode === 'table'" class="telefonos-table-wrap">
        <DataTable
          :value="telefonosFiltrados"
          v-model:selection="selectedTelefonos"
          :loading="loading"
          stripedRows
          paginator
          :rows="10"
          :rowsPerPageOptions="[10, 25, 50]"
          dataKey="id"
          responsiveLayout="scroll"
          class="telefonos-table"
          @row-click="(e) => {
            const idx = selectedTelefonos.value.findIndex((s: any) => s.id === e.data.id)
            if (idx >= 0) selectedTelefonos.value.splice(idx, 1)
            else selectedTelefonos.value.push(e.data)
          }"
          @row-dblclick="(e) => abrirDetalle(e.data)"
        >
          <Column selectionMode="multiple" headerStyle="width: 3rem" />
          <Column field="id" header="ID" style="width: 4rem" headerClass="hide-on-mobile" bodyClass="hide-on-mobile" />
          <Column field="nombre" header="Nombre" sortable style="min-width: 12rem" />
          <Column header="Acciones" style="width: 10rem">
            <template #body="{ data }">
              <div class="flex gap-1 justify-end">
                <Button
                  icon="pi pi-pencil"
                  severity="info"
                  text
                  rounded
                  @click.stop="abrirEditar(data)"
                  v-tooltip="'Editar'"
                />
                <Button
                  icon="pi pi-warehouse"
                  severity="success"
                  text
                  rounded
                  @click.stop="abrirMoverAlmacen(data)"
                  v-tooltip="'Mover a otro almacen'"
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

          <template #empty>
            <div class="text-center py-6 text-surface-500">No hay telefonos registrados.</div>
          </template>
        </DataTable>
      </div>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="telefonosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay telefonos registrados.</div>
        <div v-else class="grid grid-cols-1 min-[520px]:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5 gap-4">
          <div
            v-for="tel in telefonosFiltrados"
            :key="tel.id"
            class="flip-card phone-card min-w-0 perspective-[1000px]"
          >
            <div
              class="flip-inner phone-card-inner relative overflow-hidden transition-transform duration-500 cursor-pointer"
              :class="flippedTelId === tel.id ? '[transform:rotateY(180deg)]' : ''"
              style="transform-style: preserve-3d;"
            >
              <!-- FRONT -->
              <div
                class="phone-card-front absolute inset-0 overflow-hidden rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 flex flex-col backface-hidden"
                @click="abrirDetalle(tel)"
                @contextmenu.prevent="() => { flippedTelId = flippedTelId === tel.id ? null : tel.id; imeiSearch = '' }"
              >
                <div class="phone-card-media relative min-h-0 flex-1 flex items-center justify-center overflow-hidden">
                  <div class="absolute inset-x-3 top-3 z-10 flex min-w-0 items-center justify-between gap-2">
                    <span class="rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-mono font-semibold text-surface-500 shadow-sm backdrop-blur dark:border-surface-600/70 dark:bg-surface-900/85 dark:text-surface-300">#{{ tel.id }}</span>
                    <span class="max-w-[70%] truncate rounded-full border border-green-200 bg-green-50/95 px-2.5 py-1 text-[10px] font-semibold text-green-700 shadow-sm backdrop-blur dark:border-green-800 dark:bg-green-900/80 dark:text-green-300">
                      {{ imeiCount(tel.id) }} IMEI{{ imeiCount(tel.id) === 1 ? '' : 's' }}
                    </span>
                  </div>

                  <img
                    v-if="imagenUrl(tel.imagen)"
                    :src="imagenUrl(tel.imagen)"
                    class="phone-card-image h-full w-full object-contain"
                    :alt="`Imagen de ${tel.nombre || 'teléfono'}`"
                    loading="lazy"
                  />
                  <div v-else class="phone-card-placeholder flex h-24 w-24 items-center justify-center rounded-3xl border border-primary-200/70 bg-primary-100/80 shadow-inner dark:border-primary-800 dark:bg-primary-900/60">
                    <i class="pi pi-mobile text-4xl text-primary-600 dark:text-primary-300"></i>
                  </div>
                </div>

                <div class="phone-card-info shrink-0 border-t border-surface-200/80 bg-surface-0 px-4 py-3.5 dark:border-surface-700 dark:bg-surface-800">
                  <h4 class="phone-card-name whitespace-normal break-words text-base font-bold uppercase leading-snug text-surface-900 dark:text-surface-0" :title="tel.nombre">
                    {{ tel.nombre }}
                  </h4>
                  <div class="mt-1.5 flex items-center justify-between gap-2 text-xs text-surface-500 dark:text-surface-400">
                    <span>Ver detalles y opciones</span>
                    <i class="pi pi-arrow-right shrink-0 text-[11px] text-primary"></i>
                  </div>
                </div>
              </div>

              <!-- BACK: IMEIs -->
              <div
                class="absolute inset-0 rounded-2xl border border-primary-300 dark:border-primary-600 bg-surface-0 dark:bg-surface-800 p-3 flex flex-col gap-2 backface-hidden overflow-hidden [transform:rotateY(180deg)]"
                @contextmenu.prevent="flippedTelId = null"
              >
                <div class="flex items-center justify-between gap-2 shrink-0">
                  <h4 class="font-semibold text-sm whitespace-normal break-words leading-snug" :title="tel.nombre">{{ tel.nombre }}</h4>
                  <Button icon="pi pi-times" severity="secondary" text rounded size="small" class="!w-6 !h-6 !text-[10px] shrink-0" @click="flippedTelId = null" />
                </div>
                <IconField class="shrink-0">
                  <InputIcon class="pi pi-search text-xs" />
                  <InputText v-model="imeiSearch" placeholder="Buscar IMEI..." fluid class="!h-7 !text-xs" @click.stop />
                </IconField>
                <div class="min-h-0 flex-1 overflow-y-auto">
                  <div v-if="imeisDelTel(tel.id).length === 0" class="text-[11px] text-surface-400 text-center py-4">No hay IMEIs disponibles</div>
                  <div
                    v-for="imei in imeisDelTel(tel.id)"
                    :key="imei.id"
                    class="mb-1 flex items-center justify-between rounded-lg bg-surface-50 px-2 py-1.5 text-xs dark:bg-surface-700/50"
                    @contextmenu.prevent="flippedTelId = null"
                  >
                    <div class="flex flex-col min-w-0">
                      <span class="font-mono font-medium truncate">{{ imei.nombre }}</span>
                      <span v-if="imei.color || imei.capacidad" class="text-[10px] text-surface-400 truncate">{{ [imei.color, imei.capacidad].filter(Boolean).join(' / ') }}</span>
                    </div>
                    <span v-if="imei.precio_venta" class="font-semibold text-primary shrink-0 ml-2">{{ $formatMoney(imei.precio_venta) }}</span>
                  </div>
                </div>
                <p class="text-[9px] text-surface-400 text-center mt-auto shrink-0">Click derecho para volver</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <!-- Dialog Detalle Telefono -->
    <Dialog
      v-model:visible="detalleDialogVisible"
      :header="selectedTelefono?.nombre"
      modal
      :style="{ width: 'min(62rem, 96vw)' }"
    >
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3 rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
          <div v-if="imagenUrl(selectedTelefono?.imagen)" class="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-surface-200 dark:border-surface-700">
            <img :src="imagenUrl(selectedTelefono?.imagen)" class="w-full h-full object-cover" :alt="`Imagen de ${selectedTelefono?.nombre || 'teléfono'}`" />
          </div>
          <div v-else class="w-16 h-16 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center shrink-0">
            <i class="pi pi-mobile text-primary-600 dark:text-primary-300 text-2xl"></i>
          </div>
          <div class="min-w-0">
            <p class="font-semibold truncate">{{ selectedTelefono?.nombre }}</p>
            <p class="text-xs text-surface-500">{{ imeisDelTelefonoFiltrados.length }} IMEI(s) disponibles</p>
          </div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button
            label="Editar"
            icon="pi pi-pencil"
            severity="info"
            outlined
            @click="abrirEditar()"
          />
          <Button
            label="Agregar IMEI"
            icon="pi pi-plus"
            severity="success"
            outlined
            @click="abrirAgregarImei"
          />
          <Button
            label="Mover"
            icon="pi pi-warehouse"
            severity="success"
            outlined
            @click="abrirMoverAlmacen()"
          />
          <Button
            label="Eliminar"
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="confirmarBorrar()"
          />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-sm">Lista de IMEI</span>
            <span class="text-xs text-surface-500">{{ imeisDelTelefonoFiltrados.length }} encontrados</span>
          </div>

          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busquedaImeiTelefono" placeholder="Buscar IMEI..." fluid />
          </IconField>

          <DataTable
            :value="imeisDelTelefonoFiltrados"
            size="small"
            paginator
            :rows="5"
            :rowsPerPageOptions="[5, 10, 20]"
            dataKey="id"
            scrollable
            scrollHeight="14rem"
            responsiveLayout="scroll"
            class="imei-lista-acciones"
            @row-click="abrirAccionesImei($event.data)"
          >
            <Column field="nombre" header="IMEI" style="min-width: 10rem">
              <template #body="{ data }">
                <span class="font-mono text-sm">{{ data.nombre }}</span>
              </template>
            </Column>
            <Column field="capacidad" header="Cap." style="min-width: 5rem" />
            <Column field="color" header="Color" style="min-width: 6rem" />
            <Column field="costo" header="Costo" style="min-width: 7rem">
              <template #body="{ data }">
                <span class="font-medium text-orange-600 dark:text-orange-400">{{ $formatMoney(data.costo || 0) }}</span>
              </template>
            </Column>
            <Column field="precio_venta" header="Precio venta" style="min-width: 8rem">
              <template #body="{ data }">
                <span class="font-semibold text-primary">{{ $formatMoney(data.precio_venta || 0) }}</span>
              </template>
            </Column>
            <Column field="estado" header="Estado" style="min-width: 7rem">
              <template #body="{ data }">
                <span
                  class="text-xs font-semibold px-2 py-0.5 rounded-full"
                  :class="data.estado === 'DISPONIBLE' ? 'bg-green-100 text-green-700' : 'bg-yellow-100 text-yellow-700'"
                >
                  {{ data.estado }}
                </span>
              </template>
            </Column>
            <Column header="Acciones" style="min-width: 6.5rem">
              <template #body="{ data }">
                <Button label="Acciones" icon="pi pi-ellipsis-v" size="small" severity="secondary" outlined @click.stop="abrirAccionesImei(data)" />
              </template>
            </Column>

            <template #empty>
              <div class="text-center py-4 text-surface-500 text-sm">No hay IMEI asociados.</div>
            </template>
          </DataTable>
        </div>
      </div>
    </Dialog>

    <Dialog v-model:visible="dialogMoverAlmacen" :header="telefonosAMoverHeader" modal :style="{ width: 'min(30rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-3">
          <p class="font-semibold">{{ selectedTelefono?.nombre }}{{ selectedTelefonos.length > 1 ? ` y ${selectedTelefonos.length - 1} mas` : '' }}</p>
          <p class="text-xs text-surface-500 mt-1">
            {{
              selectedTelefonos.length > 1
                ? `Se moveran los ${selectedTelefonos.length} telefonos seleccionados al almacen de destino.`
                : `Tambien se moveran ${cantidadImeisATrasladar} IMEI(s) disponibles asociados a este telefono.`
            }}
          </p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Almacen destino</label>
          <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar otro almacen" fluid />
          <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para realizar el traslado.</p>
        </div>
        <p class="text-xs text-surface-500">Los IMEI vendidos conservaran su almacen historico.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button :label="selectedTelefonos.length > 1 ? `Mover ${selectedTelefonos.length} telefonos` : 'Mover Telefono'" icon="pi pi-warehouse" severity="success" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="moverTelefonoAlmacen" />
      </template>
    </Dialog>

    <Dialog v-model:visible="imeiAccionesVisible" header="Acciones del IMEI" modal :style="{ width: 'min(27rem, 95vw)' }">
      <div v-if="imeiSeleccionado" class="space-y-4 pt-1">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-3">
          <p class="font-mono font-semibold">{{ imeiSeleccionado.nombre }}</p>
          <p class="text-sm text-surface-500">{{ selectedTelefono?.nombre || imeiSeleccionado.equipo || 'Sin equipo' }}</p>
          <div class="grid grid-cols-2 gap-2 mt-3 text-sm">
            <div><span class="text-surface-500">Costo</span><p class="font-semibold text-orange-600 dark:text-orange-400">{{ $formatMoney(imeiSeleccionado.costo) }}</p></div>
            <div><span class="text-surface-500">Venta</span><p class="font-semibold text-primary">{{ $formatMoney(imeiSeleccionado.precio_venta) }}</p></div>
          </div>
        </div>
        <div class="grid grid-cols-1 gap-2">
          <Button label="Editar IMEI" icon="pi pi-pencil" severity="info" outlined @click="abrirEditarImeiDesdeAcciones" />
          <Button label="Vender express" icon="pi pi-bolt" severity="success" @click="venderImeiExpress" />
          <Button label="Agregar al carrito" icon="pi pi-cart-plus" outlined @click="agregarImeiAlCarrito" />
          <Button label="Reubicar en otro teléfono" icon="pi pi-mobile" severity="warn" outlined @click="abrirReubicarImei" />
          <Button label="Eliminar IMEI" icon="pi pi-trash" severity="danger" outlined @click="confirmarEliminarImeiDesdeAcciones" />
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="imeiAccionesVisible = false" /></template>
    </Dialog>

    <Dialog v-model:visible="editarImeiVisible" header="Editar IMEI" modal :style="{ width: 'min(42rem, 96vw)' }" :closable="!guardandoEdicionImei">
      <div class="flex flex-col gap-4 pt-1">
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">IMEI</label>
            <InputText v-model="editarImeiForm.nombre" inputmode="numeric" maxlength="15" placeholder="15 digitos" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Estado</label>
            <Select v-model="editarImeiForm.estado" :options="estadosImei" optionLabel="label" optionValue="value" fluid />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Capacidad</label>
            <InputText v-model="editarImeiForm.capacidad" placeholder="Ej: 256GB" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Color</label>
            <InputText v-model="editarImeiForm.color" placeholder="Color" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Bateria</label>
            <InputText v-model="editarImeiForm.bateria" placeholder="Condicion o capacidad" fluid />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Costo</label>
            <InputNumber v-model="editarImeiForm.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio venta</label>
            <InputNumber v-model="editarImeiForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio minimo</label>
            <InputNumber v-model="editarImeiForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio mayor</label>
            <InputNumber v-model="editarImeiForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Proveedor</label>
            <Select v-model="editarImeiForm.proveedor" :options="proveedores.map(p => p.nombre)" placeholder="Seleccionar proveedor" filter editable fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Nota</label>
            <InputText v-model="editarImeiForm.nota" placeholder="Observacion" fluid />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="guardandoEdicionImei" @click="editarImeiVisible = false" />
        <Button label="Actualizar IMEI" icon="pi pi-check" :loading="guardandoEdicionImei" @click="guardarEdicionImeiDesdeTelefono" />
      </template>
    </Dialog>

    <Dialog v-model:visible="eliminarImeiDialogVisible" header="Eliminar IMEI" modal :style="{ width: 'min(27rem, 95vw)' }" :closable="!eliminandoImei">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span>Seguro que deseas eliminar el IMEI <strong class="font-mono">{{ imeiSeleccionado?.nombre }}</strong>?</span>
        </div>
        <div v-if="eliminarImeiOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">Consulta el codigo de 4 digitos en el Centro OTP: {{ eliminarImeiOtpEmail || 'Configuracion > OTP Local' }}.</p>
          <InputOtp v-model="eliminarImeiOtp" :length="4" integerOnly />
        </div>
        <p v-if="eliminarImeiError" class="text-red-500 text-xs text-center">{{ eliminarImeiError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="eliminandoImei" @click="eliminarImeiDialogVisible = false" />
        <Button v-if="!eliminarImeiOtpEnviado" label="Generar OTP" icon="pi pi-key" severity="danger" :loading="eliminarImeiOtpLoading" @click="solicitarOtpEliminarImeiDesdeTelefono" />
        <Button v-else label="Eliminar IMEI" icon="pi pi-trash" severity="danger" :loading="eliminandoImei" @click="eliminarImeiDesdeTelefono" />
      </template>
    </Dialog>

    <Dialog v-model:visible="reubicarImeiVisible" header="Reubicar IMEI" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="flex flex-col gap-3 pt-1">
        <p class="text-sm text-surface-500">Selecciona el teléfono al que deseas asignar el IMEI <strong class="text-surface-900 dark:text-surface-0">{{ imeiSeleccionado?.nombre }}</strong>.</p>
        <Select v-model="telefonoDestinoImei" :options="telefonosDestinoImei" optionLabel="nombre" placeholder="Seleccionar teléfono" filter fluid />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="reubicarImeiVisible = false" />
        <Button label="Reubicar" icon="pi pi-check" :disabled="!telefonoDestinoImei" @click="reubicarImei" />
      </template>
    </Dialog>

    <!-- Dialog Crear/Editar -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Telefono' : 'Nuevo Telefono'"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre del telefono" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-semibold text-sm">Imagen</label>
          <div v-if="form.imagen" class="relative w-32 h-32 rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
            <img :src="imagenUrl(form.imagen)" class="w-full h-full object-cover" alt="Imagen del telefono" />
            <Button icon="pi pi-times" severity="danger" text rounded size="small" class="absolute top-1 right-1 !w-6 !h-6 !text-xs bg-white/80 dark:bg-surface-800/80" @click="eliminarImagen" />
          </div>
          <div class="flex gap-2">
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="subirImagen" />
            <Button :label="(form.imagen ? 'Cambiar ' : 'Subir ') + 'Imagen'" icon="pi pi-upload" severity="secondary" outlined :loading="subiendoImagen" @click="fileInput?.click()" />
            <Button v-if="isEditing" label="Buscar en internet" icon="pi pi-globe" severity="info" outlined :disabled="subiendoImagen" @click="abrirBusquedaImagen" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="subiendoImagen" @click="guardarTelefono" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogBuscarImagen" header="Buscar imagen en internet" modal :style="{ width: 'min(58rem, 96vw)' }" :draggable="false">
      <div class="space-y-4 pt-1">
        <form class="flex flex-col sm:flex-row gap-2" @submit.prevent="buscarImagenesInternet">
          <IconField class="flex-1">
            <InputIcon class="pi pi-search" />
            <InputText v-model="consultaImagen" placeholder="Ej.: Samsung Galaxy S24 Ultra" fluid autofocus />
          </IconField>
          <Button type="submit" label="Buscar" icon="pi pi-search" :loading="buscandoImagen" :disabled="!consultaImagen.trim()" />
        </form>

        <div v-if="buscandoImagen" class="py-12 text-center text-surface-500"><i class="pi pi-spin pi-spinner text-3xl block mb-3"></i>Buscando imágenes...</div>
        <div v-else-if="resultadosImagen.length" class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 max-h-[60vh] overflow-y-auto pr-1">
          <div v-for="imagen in resultadosImagen" :key="imagen.id || imagen.url" class="group text-left rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden hover:border-primary-400 hover:ring-2 hover:ring-primary-200 dark:hover:ring-primary-900 transition-all">
            <button type="button" class="w-full text-left disabled:opacity-60" :disabled="Boolean(importandoImagenUrl)" @click="importarImagenInternet(imagen)">
              <div class="aspect-square bg-surface-100 dark:bg-surface-900 flex items-center justify-center overflow-hidden">
                <i v-if="importandoImagenUrl === imagen.url" class="pi pi-spin pi-spinner text-3xl text-primary"></i>
                <img v-else :src="imagen.miniatura" :alt="imagen.titulo" loading="lazy" referrerpolicy="no-referrer" class="w-full h-full object-contain group-hover:scale-105 transition-transform" />
              </div>
              <div class="px-2.5 pt-2.5">
                <p class="text-xs font-semibold line-clamp-2" :title="imagen.titulo">{{ imagen.titulo }}</p>
                <p class="text-[10px] text-surface-500 mt-1 truncate" :title="imagen.proveedor">{{ imagen.proveedor }}</p>
                <p v-if="imagen.licencia" class="text-[10px] text-surface-500 mt-0.5 truncate" :title="`${imagen.licencia}${imagen.autor ? ` · ${imagen.autor}` : ''}`">{{ imagen.licencia }}<span v-if="imagen.autor"> · {{ imagen.autor }}</span></p>
              </div>
            </button>
            <a v-if="imagen.fuente" :href="imagen.fuente" target="_blank" rel="noopener noreferrer" class="text-[10px] text-primary hover:underline px-2.5 pb-2.5 pt-1 inline-block">Ver fuente</a>
          </div>
        </div>
        <div v-else class="py-12 text-center text-surface-500"><i class="pi pi-images text-3xl block mb-3 text-surface-400"></i>Escribe la marca y el modelo para buscar imágenes.</div>

        <p class="text-xs text-surface-500 border-t border-surface-200 dark:border-surface-700 pt-3">Resultados combinados de Openverse y Wikimedia Commons. Revisa la fuente y la licencia antes de usar una imagen.</p>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text :disabled="Boolean(importandoImagenUrl)" @click="dialogBuscarImagen = false" /></template>
    </Dialog>

    <!-- Dialog Agregar IMEI -->
    <Dialog
      v-model:visible="imeiDialogVisible"
      :header="`Agregar IMEI - ${selectedTelefono?.nombre || ''}`"
      modal
      :style="{ width: '34rem' }"
    >
      <div class="flex items-center gap-3 mb-3 rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
        <div v-if="imagenUrl(selectedTelefono?.imagen)" class="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-surface-200 dark:border-surface-700">
          <img :src="imagenUrl(selectedTelefono?.imagen)" class="w-full h-full object-cover" :alt="`Imagen de ${selectedTelefono?.nombre || 'teléfono'}`" />
        </div>
        <div v-else class="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center shrink-0"><i class="pi pi-mobile text-primary-600 dark:text-primary-300 text-lg"></i></div>
        <div><p class="font-semibold text-sm">{{ selectedTelefono?.nombre }}</p><p class="text-xs text-surface-500">Equipo para el nuevo IMEI</p></div>
      </div>
      <SelectButton v-model="modoImei" :options="modosImei" optionLabel="label" optionValue="value" :allowEmpty="false" class="w-full mb-3" fluid />

      <div v-if="modoImei === 'individual'" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">IMEI</label>
          <InputText
            v-model="imeiForm.nombre"
            placeholder="IMEI"
            fluid
            inputmode="numeric"
            maxlength="15"
            @keydown="bloquearImeiNoNumerico"
            @input="normalizarImei"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Costo</label>
          <InputNumber v-model="imeiForm.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Venta</label>
          <InputNumber v-model="imeiForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Min</label>
          <InputNumber v-model="imeiForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Mayor</label>
          <InputNumber v-model="imeiForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Capacidad</label>
          <InputText v-model="imeiForm.capacidad" placeholder="Ej: 128GB" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Color</label>
          <InputText v-model="imeiForm.color" placeholder="Color" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>

        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Proveedor</label>
          <div class="flex gap-2">
                <Select
                  v-model="imeiForm.proveedor"
                  :options="proveedores.map(p => p.nombre)"
                  placeholder="Seleccionar proveedor"
                  filter
                  filterPlaceholder="Buscar proveedor..."
                  showClear
                  class="flex-1"
                  fluid
                />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">IMEIs (escribe o pega, se agregan automaticamente)</label>
          <input
            v-model="batchImeiInput"
            placeholder="356307044521235"
            inputmode="numeric"
            class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm font-mono outline-none focus:ring-2 focus:ring-primary-500"
            @input="onBatchInput"
          />
          <div v-if="batchImeis.length > 0" class="flex flex-wrap gap-1 mt-2">
            <Chip
              v-for="imei in batchImeis"
              :key="imei"
              :label="imei"
              removable
              @remove="removerImeiBatch(imei)"
              class="text-xs"
            />
          </div>
          <p v-else class="text-xs text-surface-400">Cada vez que escribas 15 digitos se agregara automaticamente como chip.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Costo</label>
            <InputNumber v-model="imeiForm.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Venta</label>
            <InputNumber v-model="imeiForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Min</label>
            <InputNumber v-model="imeiForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Mayor</label>
            <InputNumber v-model="imeiForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Capacidad</label>
            <InputText v-model="imeiForm.capacidad" placeholder="Ej: 128GB" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Color</label>
            <InputText v-model="imeiForm.color" placeholder="Color" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Proveedor</label>
          <div class="flex gap-2">
                <Select
                  v-model="imeiForm.proveedor"
                  :options="proveedores.map(p => p.nombre)"
                  placeholder="Seleccionar proveedor"
                  filter
                  filterPlaceholder="Buscar proveedor..."
                  showClear
                  class="flex-1"
                  fluid
                />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="imeiDialogVisible = false" />
        <Button v-if="modoImei === 'individual'" label="Guardar" icon="pi pi-check" @click="guardarImei" />
        <Button v-else label="Guardar Lote" icon="pi pi-check" :loading="guardandoLote" @click="agregarImeiEnLote" />
      </template>
    </Dialog>

    <!-- Dialog Confirmar Borrar -->
    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span>Seguro que deseas eliminar <strong>{{ selectedTelefono?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrarTelefono" />
      </template>
    </Dialog>

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
        <Button label="Crear y Seleccionar" icon="pi pi-check" :disabled="!nuevoProveedorForm.nombre.trim()" @click="crearProveedorTel" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.phone-card-inner {
  height: 20rem;
}

.phone-card-front {
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px rgb(15 23 42 / 0.06);
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.phone-card:hover .phone-card-front {
  border-color: color-mix(in srgb, var(--p-primary-color) 42%, transparent);
  box-shadow: 0 14px 35px rgb(15 23 42 / 0.13);
  transform: translateY(-2px);
}

.phone-card-media {
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--p-primary-color) 10%, transparent), transparent 56%),
    linear-gradient(145deg, var(--p-surface-50), var(--p-surface-100));
}

.phone-card-image {
  padding: 2.6rem 1.35rem 1rem;
  filter: drop-shadow(0 12px 14px rgb(15 23 42 / 0.16));
  transition: transform 220ms ease, filter 220ms ease;
}

.phone-card:hover .phone-card-image {
  filter: drop-shadow(0 16px 18px rgb(15 23 42 / 0.2));
  transform: scale(1.035);
}

.phone-card-name {
  display: block;
  overflow: visible;
  text-overflow: clip;
}

:global(.dark) .phone-card-media {
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--p-primary-color) 16%, transparent), transparent 58%),
    linear-gradient(145deg, var(--p-surface-800), var(--p-surface-900));
}

.telefonos-table-wrap {
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  -webkit-overflow-scrolling: touch;
}

.telefonos-table {
  min-width: 0;
  max-width: 100%;
}

:deep(.telefonos-table .p-datatable-wrapper) {
  max-width: 100%;
  overflow-x: auto;
}

:deep(.telefonos-table .p-datatable-table) {
  min-width: 22rem !important;
}

:deep(.telefonos-table .p-paginator) {
  flex-wrap: wrap;
  row-gap: 0.35rem;
}

:deep(.imei-lista-acciones .p-datatable-tbody > tr) {
  cursor: pointer;
}

@media (max-width: 480px) {
  .phone-card-inner {
    height: 21.5rem;
  }

  .phone-card-image {
    padding-inline: 2rem;
  }

  :deep(.telefonos-table .p-datatable-thead > tr > th),
  :deep(.telefonos-table .p-datatable-tbody > tr > td) {
    padding-left: 0.55rem;
    padding-right: 0.55rem;
  }
}
</style>
