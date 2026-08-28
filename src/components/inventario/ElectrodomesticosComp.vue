<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted, watch } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import Chip from 'primevue/chip'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { uploadImage, getImageUrl, getImageIds, serializeImageIds, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import InternetImageSearchDialog from '@/components/shared/InternetImageSearchDialog.vue'
import ColorSelect from '@/components/shared/ColorSelect.vue'
import CapacitySelect from '@/components/shared/CapacitySelect.vue'

const toast = useToast()
const auth = useAuthStore()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const electrodomesticos = ref<any[]>([])
const electrodomesticosRaw = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const detalleDialogVisible = ref(false)
const serialDialogVisible = ref(false)
const isEditing = ref(false)
const selectedElectrodomestico = ref<any>(null)
const selectedElectrodomesticos = ref<any[]>([])
const busqueda = ref('')
const busquedaSerialElectrodomestico = ref('')
const serialesDelElectrodomestico = ref<any[]>([])
const proveedores = ref<any[]>([])
const dialogNuevoProveedor = ref(false)
const nuevoProveedorForm = ref({ nombre: '', telefono: '', direccion: '' })
const dialogMoverAlmacen = ref(false)
const almacenDestino = ref<any>(null)
const almacenesDestino = ref<any[]>([])
const moviendoAlmacen = ref(false)
const cantidadSerialesATrasladar = ref(0)

const modoSerial = ref<'individual' | 'lote'>('individual')
const modosSerial = ref([
  { label: 'Individual', value: 'individual' },
  { label: 'Por Lote', value: 'lote' },
])
const batchSerialInput = ref('')
const batchSeriales = ref<string[]>([])
const guardandoSerialLote = ref(false)

function onBatchSerialInput(event: Event) {
  const input = (event.target as HTMLInputElement).value
  const partes = input.split(/[,;]+/).map(s => s.trim()).filter(Boolean)
  if (partes.length > 1 || input.endsWith(',') || input.endsWith(';')) {
    const nuevos = partes.filter(p => !batchSeriales.value.includes(p))
    if (nuevos.length > 0) {
      batchSeriales.value = [...batchSeriales.value, ...nuevos]
    }
    batchSerialInput.value = ''
    ;(event.target as HTMLInputElement).value = ''
  } else {
    batchSerialInput.value = input
  }
}

function onBatchSerialKeydown(event: KeyboardEvent) {
  if (event.key === 'Enter') {
    event.preventDefault()
    const input = (event.target as HTMLInputElement).value.trim()
    if (input && !batchSeriales.value.includes(input)) {
      batchSeriales.value = [...batchSeriales.value, input]
    }
    batchSerialInput.value = ''
    ;(event.target as HTMLInputElement).value = ''
  }
}

function removerSerialBatch(serial: string) {
  batchSeriales.value = batchSeriales.value.filter(s => s !== serial)
}

const electrodomesticosAMoverHeader = computed(() => {
  if (selectedElectrodomesticos.value.length > 1) return `Mover ${selectedElectrodomesticos.value.length} electrónicos a otro Almacén`
  return 'Mover electrónico a otro Almacén'
})

const electrodomesticosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return electrodomesticos.value
  return electrodomesticos.value.filter(t =>
    t.nombre?.toLowerCase().includes(texto)
  )
})

const serialesDelElectrodomesticoFiltrados = computed(() => {
  const texto = busquedaSerialElectrodomestico.value.toLowerCase().trim()
  if (!texto) return serialesDelElectrodomestico.value
  return serialesDelElectrodomestico.value.filter(i =>
    i.nombre?.toLowerCase().includes(texto) ||
    i.color?.toLowerCase().includes(texto) ||
    i.capacidad?.toLowerCase().includes(texto) ||
    i.proveedor?.toLowerCase().includes(texto)
  )
})

const camposArray = ['nombre']
const serialCamposArray = [
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
const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCifrado = ref('')
const tokenCorto = ref('')

const form = ref({
  nombre: '',
  imagen: '',
})
const fileInput = ref<HTMLInputElement | null>(null)
const subiendoImagen = ref(false)
const dialogBuscarImagen = ref(false)
const importandoImagenInternet = ref(false)
const formImages = computed(() => getImageIds(form.value.imagen))

const serialForm = ref({
  nombre: '',
  costo: 0,
  precio_venta: 0,
  precio_min: 0,
  precio_xmayor: 0,
  capacidad: '',
  color: '',
  proveedor: '',
})

async function crearProveedorElect() {
  if (!nuevoProveedorForm.value.nombre.trim()) return
  const data = {
    nombre: nuevoProveedorForm.value.nombre.trim().toUpperCase(),
    telefono: nuevoProveedorForm.value.telefono.trim(),
    direccion: nuevoProveedorForm.value.direccion.trim().toUpperCase(),
  }
  const res = await window.db.insert('proveedores', addAlmacenId(data))
  if (res.success) {
    proveedores.value.push({ id: res.data.id, ...addAlmacenId(data) })
    serialForm.value.proveedor = data.nombre
    dialogNuevoProveedor.value = false
    toast.add({ severity: 'success', summary: 'Proveedor creado', detail: data.nombre, life: 2000 })
  }
}

async function cargarElectrodomesticos() {
  loading.value = true
  try {
    const res = await window.db.getAll('electrodomesticos')
    if (res.success) {
      electrodomesticosRaw.value = res.data || []
      electrodomesticos.value = verTodosAlmacenes.value ? electrodomesticosRaw.value : filterByAlmacen(res.data || [])
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  electrodomesticos.value = verTodosAlmacenes.value ? electrodomesticosRaw.value : filterByAlmacen(electrodomesticosRaw.value)
})

async function cargarSerialesDelElectrodomestico(electrodomesticoId: number) {
  try {
    const res = await window.db.getAll('serial')
    if (res.success) {
      const equipo = electrodomesticos.value.find((item: any) => Number(item.id) === Number(electrodomesticoId))
      serialesDelElectrodomestico.value = filterByAlmacen(res.data || []).filter((i: any) =>
        i.equipo_uid ? String(i.equipo_uid) === String(equipo?.uid || '') : Number(i.id_equi) === Number(electrodomesticoId))
    }
  } catch (error) {
    console.error(error)
  }
}

function abrirDetalle(electrodomestico: any) {
  selectedElectrodomestico.value = electrodomestico
  busquedaSerialElectrodomestico.value = ''
  cargarSerialesDelElectrodomestico(electrodomestico.id)
  detalleDialogVisible.value = true
}

function abrirCrear() {
  isEditing.value = false
  form.value = { nombre: '', imagen: '' }
  dialogVisible.value = true
}

function abrirEditar(electrodomestico: any) {
  isEditing.value = true
  selectedElectrodomestico.value = electrodomestico
  form.value = {
    nombre: electrodomestico.nombre,
    imagen: electrodomestico.imagen || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(electrodomestico = selectedElectrodomestico.value) {
  selectedElectrodomestico.value = electrodomestico
  selectedElectrodomesticos.value = []
  deleteDialogVisible.value = true
}

function confirmarBorrarMultiple() {
  if (selectedElectrodomesticos.value.length === 0) return
  deleteDialogVisible.value = true
}

function abrirAgregarSerial() {
  serialForm.value = {
    nombre: '',
    costo: 0,
    precio_venta: 0,
    precio_min: 0,
    precio_xmayor: 0,
    capacidad: '',
    color: '',
    proveedor: '',
  }
  batchSerialInput.value = ''
  batchSeriales.value = []
  modoSerial.value = 'individual'
  serialDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()

  try {
    const data: any = { nombre: nombreMayus }
    if (form.value.imagen) data.imagen = form.value.imagen

    const res = isEditing.value
      ? await window.db.update('electrodomesticos', selectedElectrodomestico.value.id, data)
      : await window.db.insert('electrodomesticos', addAlmacenId(data))
    if (!res.success) throw new Error(res.error || 'La nube rechazo la operacion')

    toast.add({
      severity: 'success',
      summary: 'Guardado en la nube',
      detail: `Electrónico ${isEditing.value ? 'actualizado' : 'creado'}`,
      life: 3000,
    })
    dialogVisible.value = false
    await cargarElectrodomesticos()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se guardo', detail: error?.message || 'Error al guardar en la nube', life: 4000 })
  }
}

async function guardarSerial() {
  if (!selectedElectrodomestico.value?.id) {
    toast.add({ severity: 'warn', summary: 'Atención', detail: 'Selecciona un electrónico', life: 3000 })
    return
  }

  if (!serialForm.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El Serial es requerido', life: 3000 })
    return
  }

  try {
    const existe = await window.db.getAll('serial')
    if (existe.success) {
      const dup = (existe.data || []).find((i: any) => i.nombre === serialForm.value.nombre.trim())
      if (dup) {
        toast.add({ severity: 'warn', summary: 'Serial duplicado', detail: 'Este Serial ya esta registrado', life: 4000 })
        return
      }
    }

    const data = {
      nombre: serialForm.value.nombre.trim().toUpperCase(),
      id_equi: selectedElectrodomestico.value.id,
      equipo_uid: selectedElectrodomestico.value.uid || '',
      equipo: selectedElectrodomestico.value.nombre || '',
      costo: serialForm.value.costo || 0,
      precio_venta: serialForm.value.precio_venta || 0,
      precio_min: serialForm.value.precio_min || 0,
      precio_xmayor: serialForm.value.precio_xmayor || 0,
      color: serialForm.value.color.trim().toUpperCase(),
      capacidad: serialForm.value.capacidad.trim().toUpperCase(),
      bateria: '',
      estado: 'DISPONIBLE',
      fecha_venta: null,
      comprador: '',
      proveedor: serialForm.value.proveedor.trim().toUpperCase(),
      no_compra: '',
      precio_vendido: 0,
      hora_venta: '',
      no_factura: '',
      nota: '',
    }

    const res = await window.db.insert('serial', addAlmacenId(data))
    if (!res.success) throw new Error(res.error || 'La nube rechazo el serial')
    toast.add({ severity: 'success', summary: 'Guardado en la nube', detail: 'Serial creado', life: 3000 })
    serialDialogVisible.value = false
    await cargarSerialesDelElectrodomestico(selectedElectrodomestico.value.id)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se guardo', detail: error?.message || 'Error al guardar el Serial en la nube', life: 4000 })
  }
}

async function agregarSerialEnLote() {
  if (!selectedElectrodomestico.value?.id) {
    toast.add({ severity: 'warn', summary: 'Atención', detail: 'Selecciona un electrónico', life: 3000 })
    return
  }

  const seriales = [...batchSeriales.value]
  if (seriales.length === 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa al menos un Serial', life: 3000 })
    return
  }

  guardandoSerialLote.value = true
  let insertados = 0
  let duplicados = 0
  let errores = 0

  try {
    const res = await window.db.getAll('serial')
    const existentes = new Set((res.data || []).map((i: any) => i.nombre))

    for (const serial of seriales) {
      const nombre = serial.trim().toUpperCase()
      if (existentes.has(nombre)) {
        duplicados++
        continue
      }

      const data = {
        nombre,
        id_equi: selectedElectrodomestico.value.id,
        equipo_uid: selectedElectrodomestico.value.uid || '',
        equipo: selectedElectrodomestico.value.nombre || '',
        costo: serialForm.value.costo || 0,
        precio_venta: serialForm.value.precio_venta || 0,
        precio_min: serialForm.value.precio_min || 0,
        precio_xmayor: serialForm.value.precio_xmayor || 0,
        color: serialForm.value.color.trim().toUpperCase(),
        capacidad: serialForm.value.capacidad.trim().toUpperCase(),
        bateria: '',
        estado: 'DISPONIBLE',
        fecha_venta: null,
        comprador: '',
        proveedor: serialForm.value.proveedor.trim().toUpperCase(),
        no_compra: '',
        precio_vendido: 0,
        hora_venta: '',
        no_factura: '',
        nota: '',
      }

      const r = await window.db.insert('serial', addAlmacenId(data))
      if (r.success) {
        insertados++
        existentes.add(nombre)
      } else {
        errores++
      }
    }

    let msg = `${insertados} Serial(es) insertados`
    if (duplicados > 0) msg += `, ${duplicados} duplicados omitidos`
    if (errores > 0) msg += `, ${errores} error(es)`

    toast.add({
      severity: insertados > 0 ? 'success' : 'warn',
      summary: 'Lote procesado',
      detail: msg,
      life: 4000,
    })

    batchSerialInput.value = ''
    batchSeriales.value = []
    await cargarSerialesDelElectrodomestico(selectedElectrodomestico.value.id)
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al procesar lote', life: 3000 })
  } finally {
    guardandoSerialLote.value = false
  }
}

function serialPerteneceElectrodomestico(serial: any, electrodomestico: any): boolean {
  if (!serial || !electrodomestico) return false
  return serial.equipo_uid
    ? String(serial.equipo_uid) === String(electrodomestico.uid || '')
    : Number(serial.id_equi) === Number(electrodomestico.id)
}

async function abrirMoverAlmacen(electrodomestico?: any) {
  const seleccionado = electrodomestico || selectedElectrodomestico.value
  if (!seleccionado) return
  selectedElectrodomestico.value = seleccionado
  almacenDestino.value = null
  cantidadSerialesATrasladar.value = 0

  try {
    const [, serialRes] = await Promise.all([
      almacenStore.load(),
      window.db.getAll('serial'),
    ])
    const almacenOrigenUid = String(seleccionado.almacen_uid || almacenStore.activeUid || '')
    almacenesDestino.value = almacenStore.almacenes.filter((almacen: any) => String(almacen.uid || '') !== almacenOrigenUid)
    if (serialRes.success) {
      cantidadSerialesATrasladar.value = (serialRes.data || []).filter((serial: any) =>
        serialPerteneceElectrodomestico(serial, seleccionado) && String(serial.estado || '').toUpperCase() === 'DISPONIBLE').length
    }
    dialogMoverAlmacen.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function abrirMoverSeleccionados() {
  const seleccionados = selectedElectrodomesticos.value
  if (!seleccionados.length) return
  selectedElectrodomestico.value = seleccionados[0]
  almacenDestino.value = null
  cantidadSerialesATrasladar.value = 0
  try {
    await almacenStore.load()
    const almacenOrigenUid = String(seleccionados[0].almacen_uid || almacenStore.activeUid || '')
    almacenesDestino.value = almacenStore.almacenes.filter((a: any) => String(a.uid || '') !== almacenOrigenUid)
    dialogMoverAlmacen.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function moverElectrodomesticoAlmacen() {
  if (!selectedElectrodomestico.value || !almacenDestino.value || moviendoAlmacen.value) return
  const electrodomesticosAMover = selectedElectrodomesticos.value.length ? selectedElectrodomesticos.value : [selectedElectrodomestico.value]
  const destinoId = Number(almacenDestino.value.id || almacenDestino.value)
  const destinoUid = String(almacenDestino.value.uid || '')
  moviendoAlmacen.value = true
  let movidos = 0
  let serialesMovidos = 0

  try {
    const serialRes = await window.db.getAll('serial')
    if (!serialRes.success) throw new Error(serialRes.error || 'No se pudieron consultar los seriales asociados')

    for (const electrodomestico of electrodomesticosAMover) {
      const serialesDisponibles = (serialRes.data || []).filter((serial: any) =>
        serialPerteneceElectrodomestico(serial, electrodomestico) && String(serial.estado || '').toUpperCase() === 'DISPONIBLE')

      const equipoRes = await window.db.update('electrodomesticos', electrodomestico.id, {
        almacen_id: destinoId,
        almacen_uid: destinoUid,
      })
      if (!equipoRes.success) throw new Error(equipoRes.error || `No se pudo mover ${electrodomestico.nombre}`)

      for (const serial of serialesDisponibles) {
        const res = await window.db.update('serial', serial.id, {
          almacen_id: destinoId,
          almacen_uid: destinoUid,
          id_equi: electrodomestico.id,
          equipo_uid: electrodomestico.uid || serial.equipo_uid || '',
          equipo: electrodomestico.nombre || serial.equipo || '',
        })
        if (!res.success) throw new Error(res.error || `No se pudo mover el serial ${serial.nombre || serial.id}`)
      }
      movidos++
      serialesMovidos += serialesDisponibles.length
    }

    dialogMoverAlmacen.value = false
    detalleDialogVisible.value = false
    selectedElectrodomesticos.value = []
    toast.add({
      severity: 'success',
      summary: 'Electrónico trasladado',
      detail: movidos > 1
        ? `${movidos} electrónicos y ${serialesMovidos} serial(es) disponibles fueron movidos a ${almacenDestino.value.nombre}`
        : `${electrodomesticosAMover[0].nombre} y ${serialesMovidos} serial(es) disponibles fueron movidos a ${almacenDestino.value.nombre}`,
      life: 4000,
    })
    await cargarElectrodomesticos()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo trasladar el electrónico', life: 4000 })
  } finally {
    moviendoAlmacen.value = false
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('electrodomesticos', selectedElectrodomestico.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Éxito', detail: 'Electrónico eliminado', life: 3000 })
    }
    deleteDialogVisible.value = false
    detalleDialogVisible.value = false
    await cargarElectrodomesticos()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

async function borrarMultiple() {
  const seleccionados = selectedElectrodomesticos.value
  const cantidad = seleccionados.length
  for (const elec of seleccionados) {
    await window.db.delete('electrodomesticos', elec.id)
  }
  selectedElectrodomesticos.value = []
  deleteDialogVisible.value = false
  toast.add({ severity: 'success', summary: 'Eliminados', detail: `${cantidad} electrónico(s) eliminados`, life: 3000 })
  await cargarElectrodomesticos()
}

async function guardarImagenesElectrodomestico(ids: string[]) {
  const imagen = serializeImageIds(ids)
  form.value.imagen = imagen
  if (!isEditing.value || !selectedElectrodomestico.value?.id) return
  const actualizado = await window.db.update('electrodomesticos', selectedElectrodomestico.value.id, { imagen })
  if (!actualizado.success) throw new Error(actualizado.error || 'No se pudieron guardar las imagenes')
  selectedElectrodomestico.value.imagen = imagen
  const local = electrodomesticos.value.find((electrodomestico: any) => electrodomestico.id === selectedElectrodomestico.value.id)
  if (local) local.imagen = imagen
  if (isOnline()) await pushLocalRowToCloud('electrodomesticos', selectedElectrodomestico.value.id)
}

async function subirImagen() {
  const input = fileInput.value
  if (!input?.files?.length) return
  const files = Array.from(input.files)
  if (files.some(file => !file.type.startsWith('image/'))) {
    toast.add({ severity: 'warn', summary: 'Solo imagenes', detail: 'Todos los archivos deben ser imagenes', life: 3000 })
    return
  }
  if (!tmCloudConnected()) {
    toast.add({ severity: 'warn', summary: 'TM Cloud no configurado', detail: 'Configura TM Cloud para subir imagenes', life: 3000 })
    return
  }
  subiendoImagen.value = true
  try {
    const ids = getImageIds(form.value.imagen)
    const errors: string[] = []
    let uploaded = 0
    for (let index = 0; index < files.length; index++) {
      try {
        ids.push(await uploadImage(files[index], 'electrodomesticos'))
        uploaded++
      } catch (error: any) {
        errors.push(error?.message || `${files[index].name}: no se pudo subir`)
      }
      if (index < files.length - 1) await new Promise(resolve => setTimeout(resolve, 350))
    }
    if (!uploaded) throw new Error(errors[0] || 'No se pudo subir ninguna imagen')
    await guardarImagenesElectrodomestico(ids)
    toast.add({
      severity: errors.length ? 'warn' : 'success',
      summary: errors.length ? 'Carga parcial' : (uploaded === 1 ? 'Imagen subida' : 'Imagenes subidas'),
      detail: errors.length ? `${uploaded} agregada(s), ${errors.length} omitida(s). ${errors[0]}` : `${uploaded} imagen(es) agregada(s)`,
      life: errors.length ? 5000 : 2500,
    })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudieron subir las imagenes', life: 4500 })
  } finally {
    subiendoImagen.value = false
    input.value = ''
  }
}

function abrirBusquedaImagen() {
  dialogBuscarImagen.value = true
}

async function importarImagenInternet(image: any) {
  if (!image?.url || importandoImagenInternet.value) return
  if (!tmCloudConnected()) {
    toast.add({ severity: 'warn', summary: 'TM Cloud no configurado', detail: 'Configura TM Cloud para guardar la imagen encontrada', life: 3500 })
    return
  }
  importandoImagenInternet.value = true
  subiendoImagen.value = true
  try {
    const response = await fetch(image.url)
    if (!response.ok) throw new Error(`No se pudo descargar la imagen (HTTP ${response.status})`)
    const blob = await response.blob()
    if (!blob.type.startsWith('image/')) throw new Error('El resultado seleccionado no es una imagen válida')
    const extension = blob.type.includes('png') ? 'png' : blob.type.includes('webp') ? 'webp' : 'jpg'
    const baseName = String(form.value.nombre || 'electrodomestico').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'electrodomestico'
    const file = new File([blob], `${baseName}.${extension}`, { type: blob.type })
    const uid = await uploadImage(file, 'electrodomesticos')
    await guardarImagenesElectrodomestico([...getImageIds(form.value.imagen), uid])
    dialogBuscarImagen.value = false
    toast.add({ severity: 'success', summary: 'Imagen agregada', detail: 'La imagen de internet fue guardada en el electrodomestico', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo traer la imagen', detail: error?.message || 'Intenta con otra imagen', life: 4500 })
  } finally {
    importandoImagenInternet.value = false
    subiendoImagen.value = false
  }
}

async function eliminarImagen(uid: string) {
  if (!uid) return
  try { await deleteImage(uid) } catch {}
  await guardarImagenesElectrodomestico(getImageIds(form.value.imagen).filter(imageId => imageId !== uid))
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

  await cargarElectrodomesticos()
  const resProv = await window.db.getAll('proveedores')
  if (resProv.success) proveedores.value = resProv.data || []
})

useCloudRefresh(['electrodomesticos', 'serial'], cargarElectrodomesticos)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Electrónicos">
      <div class="toolbar-mobile">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar electrónico..." />
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
          <Button label="Nuevo electrónico" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div v-if="selectedElectrodomesticos.length > 0" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium text-primary-700 dark:text-primary-300">{{ selectedElectrodomesticos.length }} seleccionado(s)</span>
        <Button label="Mover de almacen" icon="pi pi-warehouse" severity="success" size="small" @click="abrirMoverSeleccionados" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="confirmarBorrarMultiple" />
        <Button label="Deseleccionar" icon="pi pi-times" severity="secondary" text size="small" @click="selectedElectrodomesticos = []" />
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="electrodomesticosFiltrados"
        v-model:selection="selectedElectrodomesticos"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        @row-click="(e) => {
          const idx = selectedElectrodomesticos.findIndex((s: any) => s.id === e.data.id)
          if (idx >= 0) selectedElectrodomesticos.splice(idx, 1)
          else selectedElectrodomesticos.push(e.data)
        }"
        @row-dblclick="(e) => abrirDetalle(e.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="nombre" header="Nombre" sortable />
        <Column header="Acciones" style="width: 10rem">
          <template #body="{ data }">
            <div class="flex gap-2">
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
          <div class="text-center py-6 text-surface-500">No hay electrónicos registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="electrodomesticosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay electrónicos registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="elec in electrodomesticosFiltrados"
            :key="elec.id"
            class="electro-card min-w-0 overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 dark:border-surface-700 dark:bg-surface-800 flex flex-col cursor-pointer"
            @click="abrirDetalle(elec)"
          >
            <div class="electro-card-media relative flex h-56 shrink-0 items-center justify-center overflow-hidden">
              <div class="absolute inset-x-3 top-3 z-10 flex items-center justify-between gap-2">
                <span class="rounded-full border border-white/70 bg-white/90 px-2.5 py-1 text-[10px] font-mono font-semibold text-surface-500 shadow-sm backdrop-blur dark:border-surface-600/70 dark:bg-surface-900/85 dark:text-surface-300">#{{ elec.id }}</span>
                <span class="rounded-full border border-white/70 bg-white/90 p-2 text-surface-500 shadow-sm backdrop-blur dark:border-surface-600/70 dark:bg-surface-900/85 dark:text-surface-300">
                  <i class="pi pi-arrow-right text-[10px]"></i>
                </span>
              </div>

              <img
                v-if="imagenUrl(elec.imagen)"
                :src="imagenUrl(elec.imagen)"
                class="electro-card-image h-full w-full object-contain"
                :alt="`Imagen de ${elec.nombre || 'electrodoméstico'}`"
                loading="lazy"
              />
              <div v-else class="flex h-24 w-24 items-center justify-center rounded-3xl border border-primary-200/70 bg-primary-100/80 shadow-inner dark:border-primary-800 dark:bg-primary-900/60">
                <i class="pi pi-desktop text-4xl text-primary-600 dark:text-primary-300"></i>
              </div>
            </div>

            <div class="shrink-0 border-t border-surface-200/80 bg-surface-0 px-4 py-3.5 dark:border-surface-700 dark:bg-surface-800">
              <h4 class="electro-card-name whitespace-normal break-words text-base font-bold uppercase leading-snug text-surface-900 dark:text-surface-0" :title="elec.nombre">
                {{ elec.nombre }}
              </h4>
              <div class="mt-1.5 flex items-center justify-between gap-2 text-xs text-surface-500 dark:text-surface-400">
                <span>Ver detalles y opciones</span>
                <i class="pi pi-arrow-right shrink-0 text-[11px] text-primary"></i>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <!-- Dialog Detalle Electrodomestico -->
    <Dialog
      v-model:visible="detalleDialogVisible"
      :header="selectedElectrodomestico?.nombre"
      modal
      :style="{ width: 'min(46rem, 95vw)' }"
    >
      <div class="flex flex-col gap-3">
        <div class="flex items-center gap-3 rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
          <div v-if="imagenUrl(selectedElectrodomestico?.imagen)" class="w-16 h-16 rounded-lg overflow-hidden shrink-0 border border-surface-200 dark:border-surface-700">
            <img :src="imagenUrl(selectedElectrodomestico?.imagen)" class="w-full h-full object-cover" :alt="`Imagen de ${selectedElectrodomestico?.nombre || 'electrodomestico'}`" />
          </div>
          <div v-else class="w-16 h-16 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center shrink-0"><i class="pi pi-desktop text-primary-600 dark:text-primary-300 text-2xl"></i></div>
          <div class="min-w-0"><p class="font-semibold truncate">{{ selectedElectrodomestico?.nombre }}</p><p class="text-xs text-surface-500">{{ serialesDelElectrodomesticoFiltrados.length }} serial(es) disponibles</p></div>
        </div>
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2">
          <Button label="Editar" icon="pi pi-pencil" severity="info" outlined @click="abrirEditar(selectedElectrodomestico)" />
          <Button label="Agregar Serial" icon="pi pi-plus" severity="success" outlined @click="abrirAgregarSerial" />
          <Button label="Mover" icon="pi pi-warehouse" severity="success" outlined @click="abrirMoverAlmacen()" />
          <Button label="Eliminar" icon="pi pi-trash" severity="danger" outlined @click="confirmarBorrar()" />
        </div>
        <div class="flex flex-col gap-2">
          <div class="flex items-center justify-between gap-2">
            <span class="font-semibold text-sm">Lista de Seriales</span>
            <span class="text-xs text-surface-500">{{ serialesDelElectrodomesticoFiltrados.length }} encontrados</span>
          </div>

          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busquedaSerialElectrodomestico" placeholder="Buscar Serial..." fluid />
          </IconField>

          <DataTable
            :value="serialesDelElectrodomesticoFiltrados"
            size="small"
            paginator
            :rows="5"
            :rowsPerPageOptions="[5, 10, 20]"
            dataKey="id"
            scrollable
            scrollHeight="14rem"
            responsiveLayout="scroll"
          >
            <Column field="nombre" header="Serial" style="min-width: 10rem">
              <template #body="{ data }">
                <span class="font-mono text-sm">{{ data.nombre }}</span>
              </template>
            </Column>
            <Column field="capacidad" header="Cap." style="min-width: 5rem" />
            <Column field="color" header="Color" style="min-width: 6rem" />
            <Column header="Costo" style="min-width: 6.5rem">
              <template #body="{ data }"><span class="font-medium">{{ $formatMoney(data.costo) }}</span></template>
            </Column>
            <Column header="Precio Venta" style="min-width: 7.5rem">
              <template #body="{ data }"><span class="font-semibold text-primary">{{ $formatMoney(data.precio_venta) }}</span></template>
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

            <template #empty>
              <div class="text-center py-4 text-surface-500 text-sm">No hay Seriales asociados.</div>
            </template>
          </DataTable>
        </div>
      </div>
    </Dialog>

    <Dialog v-model:visible="dialogMoverAlmacen" :header="electrodomesticosAMoverHeader" modal :style="{ width: 'min(30rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-3">
          <p class="font-semibold">{{ selectedElectrodomestico?.nombre }}{{ selectedElectrodomesticos.length > 1 ? ` y ${selectedElectrodomesticos.length - 1} mas` : '' }}</p>
          <p class="text-xs text-surface-500 mt-1">
            {{
              selectedElectrodomesticos.length > 1
                ? `Se moverán los ${selectedElectrodomesticos.length} electrónicos seleccionados al almacén de destino.`
                : `También se moverán ${cantidadSerialesATrasladar} serial(es) disponibles asociados a este electrónico.`
            }}
          </p>
        </div>
        <div class="space-y-1.5">
          <label class="text-sm font-semibold">Almacen destino</label>
          <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar otro almacen" fluid />
          <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para realizar el traslado.</p>
        </div>
        <p class="text-xs text-surface-500">Los seriales vendidos conservaran su almacen historico.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button :label="selectedElectrodomesticos.length > 1 ? `Mover ${selectedElectrodomesticos.length} electrónicos` : 'Mover electrónico'" icon="pi pi-warehouse" severity="success" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="moverElectrodomesticoAlmacen" />
      </template>
    </Dialog>

    <!-- Dialog Crear/Editar -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar electrónico' : 'Nuevo electrónico'"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre del electrónico" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-semibold text-sm">Imagenes</label>
          <div v-if="formImages.length" class="grid grid-cols-3 gap-2">
            <div v-for="imageId in formImages" :key="imageId" class="relative aspect-square rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
              <img :src="getImageUrl(imageId)" class="w-full h-full object-cover" alt="Imagen del electrodomestico" />
              <Button icon="pi pi-times" severity="danger" text rounded size="small" class="absolute top-1 right-1 !w-6 !h-6 !text-xs bg-white/80 dark:bg-surface-800/80" @click="eliminarImagen(imageId)" />
            </div>
          </div>
          <div class="flex flex-wrap gap-2">
            <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="subirImagen" />
            <Button label="Agregar imagenes" icon="pi pi-upload" severity="secondary" outlined :loading="subiendoImagen" @click="fileInput?.click()" />
            <Button v-if="isEditing" label="Buscar en internet" icon="pi pi-globe" severity="info" outlined :disabled="subiendoImagen" @click="abrirBusquedaImagen" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="subiendoImagen" @click="guardar" />
      </template>
    </Dialog>

    <InternetImageSearchDialog v-model:visible="dialogBuscarImagen" :initial-query="form.nombre" :importing="importandoImagenInternet" @select="importarImagenInternet" />

    <!-- Dialog Agregar Serial -->
    <Dialog
      v-model:visible="serialDialogVisible"
      :header="`Agregar Serial - ${selectedElectrodomestico?.nombre || ''}`"
      modal
      :style="{ width: '34rem' }"
    >
      <div class="flex items-center gap-3 mb-3 rounded-lg bg-surface-50 dark:bg-surface-700/30 p-3">
        <div v-if="imagenUrl(selectedElectrodomestico?.imagen)" class="w-12 h-12 rounded-lg overflow-hidden shrink-0 border border-surface-200 dark:border-surface-700">
          <img :src="imagenUrl(selectedElectrodomestico?.imagen)" class="w-full h-full object-cover" :alt="`Imagen de ${selectedElectrodomestico?.nombre || 'electrodomestico'}`" />
        </div>
        <div v-else class="w-12 h-12 rounded-lg bg-primary-100 dark:bg-primary-900 flex items-center justify-center shrink-0"><i class="pi pi-desktop text-primary-600 dark:text-primary-300 text-lg"></i></div>
        <div><p class="font-semibold text-sm">{{ selectedElectrodomestico?.nombre }}</p><p class="text-xs text-surface-500">Equipo para el nuevo serial</p></div>
      </div>
      <SelectButton v-model="modoSerial" :options="modosSerial" optionLabel="label" optionValue="value" :allowEmpty="false" fluid class="w-full mb-3" />

      <div v-if="modoSerial === 'individual'" class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Serial</label>
          <InputText
            v-model="serialForm.nombre"
            placeholder="Serial"
            fluid
            class="uppercase"
            style="text-transform: uppercase;"
          />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Costo</label>
          <InputNumber v-model="serialForm.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Venta</label>
          <InputNumber v-model="serialForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Min</label>
          <InputNumber v-model="serialForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Mayor</label>
          <InputNumber v-model="serialForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Capacidad</label>
          <CapacitySelect v-model="serialForm.capacidad" />
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Color</label>
          <ColorSelect v-model="serialForm.color" />
        </div>

        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Proveedor</label>
          <div class="flex gap-2">
            <Select v-model="serialForm.proveedor" :options="proveedores.map(p => p.nombre)" placeholder="Seleccionar proveedor" class="flex-1" fluid />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
          </div>
        </div>
      </div>

      <div v-else class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Seriales (separados por coma, espacio o salto de linea)</label>
          <InputText
            :value="batchSerialInput"
            placeholder="SN-001, SN-002, SN-003"
            fluid
            class="font-mono text-sm uppercase"
            style="text-transform: uppercase;"
            @input="onBatchSerialInput"
            @keydown="onBatchSerialKeydown"
          />
          <div v-if="batchSeriales.length > 0" class="flex flex-wrap gap-1 mt-2">
            <Chip
              v-for="serial in batchSeriales"
              :key="serial"
              :label="serial"
              removable
              @remove="removerSerialBatch(serial)"
              class="text-xs"
            />
          </div>
          <p v-else class="text-xs text-surface-400">Escribe o pega los seriales separados por coma, espacio o enter. Cada uno se agregara como chip.</p>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Costo</label>
            <InputNumber v-model="serialForm.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Venta</label>
            <InputNumber v-model="serialForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Min</label>
            <InputNumber v-model="serialForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Precio Mayor</label>
            <InputNumber v-model="serialForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Capacidad</label>
            <CapacitySelect v-model="serialForm.capacidad" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Color</label>
            <ColorSelect v-model="serialForm.color" />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Proveedor</label>
          <div class="flex gap-2">
            <Select v-model="serialForm.proveedor" :options="proveedores.map(p => p.nombre)" placeholder="Seleccionar proveedor" class="flex-1" fluid />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="serialDialogVisible = false" />
        <Button v-if="modoSerial === 'individual'" label="Guardar" icon="pi pi-check" @click="guardarSerial" />
        <Button v-else label="Guardar Lote" icon="pi pi-check" :loading="guardandoSerialLote" @click="agregarSerialEnLote" />
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
        <span v-if="selectedElectrodomesticos.length > 1">¿Seguro que deseas eliminar los <strong>{{ selectedElectrodomesticos.length }}</strong> electrónicos seleccionados?</span>
        <span v-else>Seguro que deseas eliminar <strong>{{ selectedElectrodomestico?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="selectedElectrodomesticos.length > 1 ? borrarMultiple() : borrar()" />
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
        <Button label="Crear y Seleccionar" icon="pi pi-check" :disabled="!nuevoProveedorForm.nombre.trim()" @click="crearProveedorElect" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.electro-card {
  box-shadow: 0 1px 2px rgb(15 23 42 / 0.04), 0 8px 24px rgb(15 23 42 / 0.06);
  transition: border-color 180ms ease, box-shadow 180ms ease, transform 180ms ease;
}

.electro-card:hover {
  border-color: color-mix(in srgb, var(--p-primary-color) 42%, transparent);
  box-shadow: 0 14px 35px rgb(15 23 42 / 0.13);
  transform: translateY(-2px);
}

.electro-card-media {
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--p-primary-color) 10%, transparent), transparent 56%),
    linear-gradient(145deg, var(--p-surface-50), var(--p-surface-100));
}

.electro-card-image {
  padding: 2.7rem 1.35rem 1rem;
  filter: drop-shadow(0 12px 14px rgb(15 23 42 / 0.16));
  transition: transform 220ms ease, filter 220ms ease;
}

.electro-card:hover .electro-card-image {
  filter: drop-shadow(0 16px 18px rgb(15 23 42 / 0.2));
  transform: scale(1.035);
}

.electro-card-name {
  display: block;
  overflow: visible;
  text-overflow: clip;
}

:global(.dark) .electro-card-media {
  background:
    radial-gradient(circle at 50% 38%, color-mix(in srgb, var(--p-primary-color) 16%, transparent), transparent 58%),
    linear-gradient(145deg, var(--p-surface-800), var(--p-surface-900));
}

@media (max-width: 480px) {
  .electro-card-media {
    height: 16rem;
  }

  .electro-card-image {
    padding-inline: 2rem;
  }
}
</style>
