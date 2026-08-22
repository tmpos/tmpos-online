<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import Button from 'primevue/button'
import { useSystemModeStore } from '@/stores/systemMode'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Tabs from 'primevue/tabs'
import TabList from 'primevue/tablist'
import Tab from 'primevue/tab'
import TabPanels from 'primevue/tabpanels'
import TabPanel from 'primevue/tabpanel'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { encryptarPassword } from '@/funciones/funciones.js'
import { getImageUrl, uploadImageSource, deleteImage } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const systemMode = useSystemModeStore()
const { addAlmacenId } = useAlmacenFilter()
const props = defineProps<{ orderId?: number | null; visible: boolean; initialData?: Record<string, any> | null }>()
const emit = defineEmits<{ close: []; saved: [payload?: any] }>()

const toast = useToast()
const isEditing = computed(() => !!props.orderId)
const guardando = ref(false)
const activeTab = ref('0')
const estadoOriginal = ref('')
const fileInput = ref<HTMLInputElement | null>(null)
const imagenPreview = ref('')
const dialogImagenVisible = ref(false)
const subiendoImagenes = ref(false)

const tecnicos = ref<{ nombre: string; porcentaje: number }[]>([])
const metodosPagoDB = ref<any[]>([])

const piezasDisponibles = ref<any[]>([])
const dialogPiezasVisible = ref(false)
const buscarPieza = ref('')
const buscandoClienteCedula = ref(false)
const dialogClientesVisible = ref(false)
const clientes = ref<any[]>([])
const busquedaCliente = ref('')

const piezasFiltradas = computed(() => {
  const q = buscarPieza.value.toLowerCase().trim()
  if (!q) return piezasDisponibles.value
  return piezasDisponibles.value.filter((p: any) => (p.nombre || '').toLowerCase().includes(q))
})

const clientesFiltrados = computed(() => {
  const texto = busquedaCliente.value.toLowerCase().trim()
  if (!texto) return clientes.value
  return clientes.value.filter((cliente: any) =>
    [cliente.nombre, cliente.telefono, cliente.whatsapp, cliente.cedula, cliente.rnc]
      .some(valor => String(valor || '').toLowerCase().includes(texto))
  )
})

async function cargarPiezas() {
  try {
    const res = await window.db.getAll('piezas')
    if (res.success && res.data) {
      piezasDisponibles.value = (res.data || []).filter((p: any) => (p.nombre || '').trim())
    }
  } catch {}
}

async function buscarClientePorCedula() {
  const cedula = String(form.value.cedula || '').replace(/\D/g, '')
  if (!cedula) {
    toast.add({ severity: 'warn', summary: 'Cédula requerida', detail: 'Ingresa una cédula para buscar el cliente', life: 2500 })
    return
  }
  buscandoClienteCedula.value = true
  try {
    const res = await window.db.getAll('clientes')
    const cliente = (res.success ? res.data || [] : []).find((item: any) => {
      const documento = String(item.cedula || item.rnc || '').replace(/\D/g, '')
      return documento === cedula
    })
    if (!cliente) {
      toast.add({ severity: 'info', summary: 'No encontrado', detail: 'No hay un cliente registrado con esa cédula', life: 2500 })
      return
    }
    form.value.nombre = String(cliente.nombre || '').toUpperCase()
    form.value.cedula = String(cliente.cedula || cliente.rnc || cedula)
    form.value.telefono = String(cliente.telefono || cliente.whatsapp || '')
    form.value.email = String(cliente.email || '')
    toast.add({ severity: 'success', summary: 'Cliente cargado', detail: cliente.nombre, life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo buscar el cliente', life: 3000 })
  } finally {
    buscandoClienteCedula.value = false
  }
}

function abrirSeleccionarCliente() {
  busquedaCliente.value = ''
  dialogClientesVisible.value = true
}

function seleccionarCliente(cliente: any) {
  form.value.nombre = String(cliente.nombre || '').toUpperCase()
  form.value.cedula = String(cliente.cedula || cliente.rnc || '')
  form.value.telefono = String(cliente.telefono || cliente.whatsapp || '')
  form.value.email = String(cliente.email || '')
  dialogClientesVisible.value = false
  toast.add({ severity: 'success', summary: 'Cliente seleccionado', detail: cliente.nombre, life: 2000 })
}

function seleccionarPieza(pieza: any) {
  const texto = pieza.nombre || ''
  form.value.piezas = form.value.piezas ? form.value.piezas + '\n' + texto : texto
  form.value.precio_pieza = (form.value.precio_pieza || 0) + (Number(pieza.precio_venta) || 0)
  dialogPiezasVisible.value = false
}

const dialogPatron = ref(false)
const patronDots = ref<number[]>([])
const patronDrawing = ref(false)
const patronGridRef = ref<HTMLDivElement | null>(null)

const patronPreview = computed(() => {
  if (!form.value.clave) return ''
  if (form.value.clave.startsWith('PATRON:')) {
    const nums = form.value.clave.replace('PATRON:', '').trim().split('-').map(Number).filter(n => !isNaN(n))
    return nums.map(n => n + 1).join(' → ')
  }
  return form.value.clave
})

function abrirPatron() {
  patronDots.value = []
  patronDrawing.value = false
  if (form.value.clave.startsWith('PATRON:')) {
    const nums = form.value.clave.replace('PATRON:', '').trim().split('-').map(Number).filter(n => !isNaN(n))
    patronDots.value = nums
  }
  dialogPatron.value = true
}

function patronPointerDown(num: number) {
  patronDrawing.value = true
  patronDots.value = [num]
}

function patronPointerEnter(num: number) {
  if (!patronDrawing.value) return
  if (!patronDots.value.includes(num)) patronDots.value.push(num)
}

function patronPointerUp() {
  patronDrawing.value = false
}

function patronPointerLeaveGrid() {
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

const fallasComunes = [
  'NO ENCIENDE', 'NO CARGA', 'PANTALLA ROTA', 'BATERIA DAÑADA',
  'NO TIENE SEÑAL', 'MOJADO', 'TECLAS NO FUNCIONAN', 'AUDIO NO FUNCIONA',
  'SE REINICIA SOLO', 'CAMARA NO FUNCIONA', 'NO LEE SIM',
  'PUERTO DE CARGA DAÑADO', 'HUELLA NO FUNCIONA', 'SE CALIENTA',
]

const form = ref({
  no_orden: '', nombre: '', cedula: '', telefono: '', email: '',
  equipo: '', imei: '', serial: '', marca_modelo: '', clave: '', accesorios: '',
  fallas: '', piezas: '', tecnico: '', metodo_pago: 'EFECTIVO',
  fecha_entrada: new Date(), fecha_entrega: null as Date | null,
  estado: 'RECIBIDO', precio_pieza: 0, mano_obra: 0, abono: 0,
  pendiente: 0, total: 0, pagos: '', beneficio_empresa: 0, beneficio_tecnico: 0,
  porcentaje_tecnico: 0, estado_pago_tecnico: 'PENDIENTE',
  imagen: '',
})

const metodosPago = computed(() => {
  const activos = metodosPagoDB.value
    .filter((metodo: any) => String(metodo.estado || 'ACTIVO').toUpperCase() === 'ACTIVO')
    .map((metodo: any) => ({
      label: Number(metodo.porcentaje || 0) > 0 ? `${metodo.nombre} (${metodo.porcentaje}%)` : metodo.nombre,
      value: metodo.nombre,
    }))
  return activos.length ? activos : ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CHEQUE', 'CREDITO'].map(value => ({ label: value, value }))
})

const comisionPagoPorcentaje = computed(() => {
  const metodo = metodosPagoDB.value.find((item: any) => String(item.nombre || '').toUpperCase() === String(form.value.metodo_pago || '').toUpperCase())
  return Number(metodo?.porcentaje || 0)
})
const subtotalTaller = computed(() => Number(form.value.precio_pieza || 0) + Number(form.value.mano_obra || 0))
const comisionPagoMonto = computed(() => Math.round(subtotalTaller.value * (comisionPagoPorcentaje.value / 100) * 100) / 100)
const totalCalculado = computed(() => subtotalTaller.value + comisionPagoMonto.value)
const pendienteCalculado = computed(() => totalCalculado.value - (form.value.abono || 0))

function formDefault() {
  return {
    no_orden: '', nombre: '', cedula: '', telefono: '', email: '',
    equipo: '', imei: '', serial: '', marca_modelo: '', clave: '', accesorios: '',
    fallas: '', piezas: '', tecnico: '', metodo_pago: 'EFECTIVO',
    fecha_entrada: new Date(), fecha_entrega: null as Date | null,
    estado: 'RECIBIDO', precio_pieza: 0, mano_obra: 0, abono: 0,
    pendiente: 0, total: 0, pagos: '', beneficio_empresa: 0, beneficio_tecnico: 0,
    porcentaje_tecnico: 0, estado_pago_tecnico: 'PENDIENTE',
    imagen: '',
  }
}

function parseImagenes(valor: any): string[] {
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

const imagenesOrden = computed(() => parseImagenes(form.value.imagen))

async function guardarImagenes(imagenes: string[]) {
  form.value.imagen = JSON.stringify(imagenes.filter(Boolean))
  if (!props.orderId) return
  const resultado = await window.db.update('ordenes_taller', props.orderId, { imagen: form.value.imagen })
  if (!resultado.success) throw new Error(resultado.error || 'No se pudo guardar las imagenes de la orden')
  if (isOnline()) await pushLocalRowToCloud('ordenes_taller', props.orderId)
}

function abrirImagen(src: string) {
  imagenPreview.value = src
  dialogImagenVisible.value = true
}

function imagenOrdenUrl(valor: string): string {
  return getImageUrl(valor) || valor
}

async function quitarImagen(index: number) {
  const imagenes = [...imagenesOrden.value]
  const eliminada = imagenes.splice(index, 1)[0]
  try { await deleteImage(eliminada) } catch {}
  try {
    await guardarImagenes(imagenes)
    toast.add({ severity: 'success', summary: 'Imagen actualizada', detail: 'El cambio se guardo inmediatamente', life: 2000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo actualizar la imagen', life: 3000 })
  }
}

function imagenDesdeArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxSide = 1400
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * ratio))
        canvas.height = Math.max(1, Math.round(img.height * ratio))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.onerror = () => reject(new Error('Imagen invalida'))
      img.src = String(reader.result || '')
    }
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

async function agregarImagenes(event: Event) {
  const input = event.target as HTMLInputElement
  const files = Array.from(input.files || [])
  if (!files.length) return

  const actuales = [...imagenesOrden.value]
  const disponibles = Math.max(0, 8 - actuales.length)
  const seleccionadas = files.slice(0, disponibles)

  if (files.length > disponibles) {
    toast.add({ severity: 'warn', summary: 'Limite de imagenes', detail: 'Puedes guardar hasta 8 imagenes por orden', life: 3000 })
  }

  subiendoImagenes.value = true
  try {
    for (const file of seleccionadas) {
      if (!file.type.startsWith('image/')) continue
      if (file.size > 8 * 1024 * 1024) {
        toast.add({ severity: 'warn', summary: 'Imagen omitida', detail: `${file.name} supera 8MB`, life: 3000 })
        continue
      }
      const localImage = await imagenDesdeArchivo(file)
      try {
        actuales.push(await uploadImageSource(localImage, 'ordenes_taller', `orden-${Date.now()}-${actuales.length + 1}.jpg`))
      } catch (uploadError: any) {
        actuales.push(localImage)
        toast.add({ severity: 'warn', summary: 'Imagen local', detail: uploadError?.message || 'No se pudo subir a TM Cloud', life: 3500 })
      }
    }
    await guardarImagenes(actuales)
    if (props.orderId) toast.add({ severity: 'success', summary: 'Imagenes actualizadas', detail: 'Los cambios se guardaron inmediatamente', life: 2000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo agregar la imagen', life: 3000 })
  } finally {
    subiendoImagenes.value = false
    input.value = ''
  }
}

async function generarNoOrden(): Promise<string> {
  try {
    const res = await window.db.getAll('ordenes_taller')
    const max = (res.data || []).reduce((maxId: number, o: any) => Math.max(maxId, o.id || 0), 0)
    return `ORD-${String(max + 1).padStart(4, '0')}`
  } catch { return '' }
}

function resetForm() {
  form.value = formDefault()
  estadoOriginal.value = ''
  activeTab.value = '0'
}

function aplicarDatosIniciales() {
  if (!props.initialData) return

  const data = props.initialData
  form.value = {
    ...form.value,
    nombre: data.nombre ?? form.value.nombre,
    cedula: data.cedula ?? form.value.cedula,
    telefono: data.telefono ?? form.value.telefono,
    email: data.email ?? form.value.email,
    equipo: data.equipo ?? form.value.equipo,
    imei: data.imei ?? form.value.imei,
    serial: data.serial ?? form.value.serial,
    marca_modelo: data.marca_modelo ?? form.value.marca_modelo,
    fallas: data.fallas ?? form.value.fallas,
    accesorios: data.accesorios ?? form.value.accesorios,
  }
}

watch(() => props.orderId, async (newId) => {
  if (newId == null) {
    resetForm()
    form.value.no_orden = await generarNoOrden()
    aplicarDatosIniciales()
  } else {
    await cargarDatos()
  }
})

watch(() => props.visible, async (v) => {
  if (v) {
    if (!props.orderId) {
      resetForm()
      form.value.no_orden = await generarNoOrden()
      aplicarDatosIniciales()
    } else {
      await cargarDatos()
    }
  }
})

watch([() => form.value.precio_pieza, () => form.value.mano_obra, () => form.value.abono, () => form.value.metodo_pago], () => {
  form.value.total = totalCalculado.value
  form.value.pendiente = pendienteCalculado.value
}, { deep: true })

watch(() => form.value.tecnico, (nombre) => {
  if (nombre) {
    const encontrado = tecnicos.value.find(t => t.nombre === nombre)
    if (encontrado) form.value.porcentaje_tecnico = encontrado.porcentaje
  }
})

watch([() => form.value.porcentaje_tecnico, () => form.value.mano_obra], () => {
  const mano = form.value.mano_obra || 0
  const pct = form.value.porcentaje_tecnico || 0
  form.value.beneficio_tecnico = Math.round((mano * pct / 100) * 100) / 100
  form.value.beneficio_empresa = Math.round((mano - form.value.beneficio_tecnico) * 100) / 100
})

async function cargarDatos() {
  const [tecnicosRes, ordenRes, clientesRes, metodosRes] = await Promise.all([
    window.db.getAll('tecnicos'),
    props.orderId ? window.db.getAll('ordenes_taller') : Promise.resolve(null),
    window.db.getAll('clientes'),
    window.db.getAll('metodos_pago'),
  ])
  cargarPiezas()
  if (clientesRes.success) clientes.value = clientesRes.data || []
  if (metodosRes.success) metodosPagoDB.value = metodosRes.data || []
  if (tecnicosRes.success) {
    tecnicos.value = (tecnicosRes.data || []).map((t: any) => ({
      nombre: (t.nombre || '').toUpperCase(), porcentaje: t.porcentaje || 0
    })).filter(t => t.nombre).sort((a, b) => a.nombre.localeCompare(b.nombre))
    if (!props.orderId && tecnicos.value.length > 0 && !form.value.tecnico) {
      form.value.tecnico = tecnicos.value[0].nombre
    }
  }
  if (ordenRes?.success && ordenRes.data) {
    const orden = ordenRes.data.find((o: any) => o.id === props.orderId)
    if (orden) {
      form.value = {
        no_orden: orden.no_orden || '', nombre: orden.nombre || '', cedula: orden.cedula || '',
        telefono: orden.telefono || '', email: orden.email || '', equipo: orden.equipo || '',
        imei: orden.imei || '', serial: orden.serial || '', marca_modelo: orden.marca_modelo || '',
        clave: orden.clave || '', accesorios: orden.accesorios || '', fallas: orden.fallas || '',
        piezas: orden.piezas || '', tecnico: orden.tecnico || '', metodo_pago: orden.metodo_pago || 'EFECTIVO',
        fecha_entrada: orden.fecha_entrada ? new Date(orden.fecha_entrada) : new Date(),
        fecha_entrega: orden.fecha_entrega ? new Date(orden.fecha_entrega) : null,
        estado: orden.estado || 'RECIBIDO', precio_pieza: orden.precio_pieza || 0,
        mano_obra: orden.mano_obra || 0, abono: orden.abono || 0,
        pendiente: orden.pendiente || 0, total: orden.total || 0, pagos: orden.pagos || '',
        beneficio_empresa: orden.beneficio_empresa || 0, beneficio_tecnico: orden.beneficio_tecnico || 0,
        porcentaje_tecnico: orden.porcentaje_tecnico || 0, estado_pago_tecnico: orden.estado_pago_tecnico || 'PENDIENTE',
        imagen: orden.imagen || '',
      }
      estadoOriginal.value = orden.estado || 'RECIBIDO'
    }
  }
}

async function guardar() {
  guardando.value = true
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del cliente es requerido', life: 3000 })
    activeTab.value = '0'
    guardando.value = false
    return
  }
  try {
    const total = totalCalculado.value
    const pendiente = pendienteCalculado.value
    const data = {
      no_orden: form.value.no_orden.trim(), nombre: form.value.nombre.trim().toUpperCase(),
      cedula: form.value.cedula.trim(), telefono: form.value.telefono.trim(), email: form.value.email.trim(),
      equipo: form.value.equipo.trim().toUpperCase(), imei: form.value.imei.trim(), serial: form.value.serial.trim(),
      marca_modelo: form.value.marca_modelo.trim().toUpperCase(), clave: form.value.clave.trim(),
      accesorios: form.value.accesorios.trim().toUpperCase(), fallas: form.value.fallas.trim().toUpperCase(),
      piezas: form.value.piezas.trim(), tecnico: form.value.tecnico.trim().toUpperCase(),
      metodo_pago: form.value.metodo_pago,
      fecha_entrada: form.value.fecha_entrada instanceof Date ? form.value.fecha_entrada.toISOString().split('T')[0] : new Date().toISOString().split('T')[0],
      fecha_entrega: form.value.fecha_entrega instanceof Date ? form.value.fecha_entrega.toISOString().split('T')[0] : '',
      estado: form.value.estado, precio_pieza: form.value.precio_pieza || 0, mano_obra: form.value.mano_obra || 0,
      abono: form.value.abono || 0, pendiente, total, pagos: form.value.pagos.trim(),
      beneficio_empresa: form.value.beneficio_empresa || 0, beneficio_tecnico: form.value.beneficio_tecnico || 0,
      porcentaje_tecnico: form.value.porcentaje_tecnico || 0, estado_pago_tecnico: form.value.estado_pago_tecnico,
      imagen: form.value.imagen,
    }
    let res
    if (isEditing.value && props.orderId) {
      res = await window.db.update('ordenes_taller', props.orderId, data)
    } else {
      res = await window.db.insert('ordenes_taller', addAlmacenId(data))
    }
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: isEditing.value ? 'Orden actualizada' : 'Orden creada', life: 3000 })
      await sincronizarServidor(data)
      emit('saved', {
        orden: { ...data, id: props.orderId || res.data?.id },
        estadoAnterior: estadoOriginal.value,
        estadoNuevo: data.estado,
        cambioEstado: isEditing.value && estadoOriginal.value && estadoOriginal.value !== data.estado,
      })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

async function sincronizarServidor(datos: any) {
  try {
    const cfgRes = await window.db.getAll('servidor_sync_config')
    const cfg = cfgRes.success && cfgRes.data?.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.activo) return
    const tablasSync: string[] = cfg.tablas_sync ? JSON.parse(cfg.tablas_sync) : []
    if (!tablasSync.includes('taller') && !tablasSync.includes('ordenes_taller')) return
    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)
    const campos = ['id','almacen','beneficio_empresa','porcentaje_tecnico','beneficio_tecnico','pago_tecnico','nombre','cedula','direccion','telefono','whatsapp','email','equipo','marca','modelo','serial','imei','clave','accesorios','observaciones','fallas','reparacion','piezas','tecnico','metodopago','fecha_entrada','fecha_entrega','no_factura','estado','preciopiezas','manodeobra','abono','saldo','total','usuario','created_at','updated_at','identificadordb','historial_pagos','historial_orden']
    const empresaRes = await window.db.getAll('empresa')
    const nombreEmpresa = (empresaRes.success && empresaRes.data?.[0]?.nombre) || ''
    const pendiente = Number(datos.total || 0) - Number(datos.abono || 0)
    const marcaModelo = String(datos.marca_modelo || '')
    const marca = marcaModelo.split(' ')[0] || ''
    const modelo = marcaModelo.split(' ').slice(1).join(' ') || marca
    const enviar: Record<string, any> = {
      nombre: String(datos.nombre || ''), cedula: String(datos.cedula || ''), direccion: '',
      telefono: String(datos.telefono || ''), whatsapp: String(datos.telefono || ''),
      email: String(datos.email || ''), equipo: String(datos.equipo || ''), marca, modelo,
      serial: String(datos.serial || ''), imei: String(datos.imei || ''), clave: String(datos.clave || ''),
      accesorios: String(datos.accesorios || ''), observaciones: '', fallas: String(datos.fallas || ''),
      reparacion: String(datos.piezas || ''), piezas: String(datos.piezas || ''),
      tecnico: String(datos.tecnico || ''), metodopago: String(datos.metodo_pago || 'EFECTIVO'),
      fecha_entrada: String(datos.fecha_entrada || ''), fecha_entrega: String(datos.fecha_entrega || ''),
      no_factura: String(datos.no_orden || ''), estado: String(datos.estado || 'RECIBIDO'),
      preciopiezas: String(datos.precio_pieza || '0'), manodeobra: String(datos.mano_obra || '0'),
      abono: String(datos.abono || '0'), saldo: String(Math.max(0, pendiente)),
      total: String(datos.total || '0'), usuario: '', almacen: nombreEmpresa,
      beneficio_empresa: String(datos.beneficio_empresa || '0'),
      beneficio_tecnico: String(datos.beneficio_tecnico || '0'),
      porcentaje_tecnico: String(datos.porcentaje_tecnico || '0'),
      pago_tecnico: String(datos.estado_pago_tecnico || 'PENDIENTE'),
      historial_pagos: String(datos.pagos || ''), historial_orden: '',
    }
    for (const key of Object.keys(enviar)) { if (!campos.includes(key)) delete enviar[key] }
    if (Object.keys(enviar).length === 0) return
    const existeRes = await fetch(`${baseUrl}/datoscampo/taller/no_factura/${encodeURIComponent(datos.no_orden || '')}`, {
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
    if (servidorId) {
      enviar.id = servidorId
      await fetch(`${baseUrl}/actualizarcampos/taller`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    } else {
      await fetch(`${baseUrl}/insertar/taller`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    }
  } catch {}
}

onMounted(async () => {
  await cargarDatos()
  if (!props.orderId) {
    form.value.no_orden = await generarNoOrden()
  }
})
</script>

<template>
  <Dialog
    :visible="props.visible"
    :header="isEditing ? `Editar Orden #${props.orderId}` : 'Nueva Orden de Taller'"
    modal
    :style="{ width: 'min(48rem, 95vw)' }"
    @update:visible="$emit('close')"
  >
    <Toast />
    <div class="space-y-4 pt-2">
      <div class="flex justify-end gap-2">
        <Button label="Cancelar" severity="secondary" text @click="$emit('close')" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :loading="guardando" :disabled="subiendoImagenes" @click="guardar" />
      </div>

      <Tabs v-model:value="activeTab">
        <TabList>
          <Tab value="0"><i class="pi pi-user mr-2"></i>Cliente</Tab>
          <Tab value="1"><i class="pi pi-mobile mr-2"></i>Equipo</Tab>
          <Tab value="2"><i class="pi pi-search mr-2"></i>Diagnostico</Tab>
          <Tab value="3"><i class="pi pi-wrench mr-2"></i>Trabajo</Tab>
          <Tab value="4"><i class="pi pi-credit-card mr-2"></i>Pago</Tab>
        </TabList>
        <TabPanels>
          <TabPanel value="0">
            <div class="flex flex-col gap-4 pt-3">
              <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div class="flex flex-col gap-1">
                  <label class="font-semibold text-sm">No. Orden</label>
                  <InputText v-model="form.no_orden" placeholder="No. de orden" fluid readonly />
                </div>
                <div class="flex flex-col gap-1 md:col-span-2">
                  <div class="flex items-center justify-between gap-2"><label class="font-semibold text-sm">Nombre <span class="text-red-500">*</span></label><Button label="Seleccionar cliente" icon="pi pi-users" size="small" text @click="abrirSeleccionarCliente" /></div>
                  <InputText v-model="form.nombre" placeholder="Nombre del cliente" fluid class="uppercase" style="text-transform: uppercase;" />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="font-semibold text-sm">Cedula</label>
                  <div class="flex gap-2">
                    <InputText v-model="form.cedula" placeholder="Cedula" fluid @keyup.enter="buscarClientePorCedula" />
                    <Button icon="pi pi-search" severity="info" :loading="buscandoClienteCedula" @click="buscarClientePorCedula" v-tooltip="'Buscar cliente por cédula'" />
                  </div>
                </div>
                <div class="flex flex-col gap-1">
                  <label class="font-semibold text-sm">Telefono</label>
                  <InputText v-model="form.telefono" placeholder="Telefono" fluid />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="font-semibold text-sm">Email</label>
                  <InputText v-model="form.email" placeholder="Email" fluid />
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value="1">
            <div class="flex flex-col gap-4 pt-3">
              <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="font-semibold text-sm">Equipo</label>
                  <InputText v-model="form.equipo" placeholder="Tipo de equipo" fluid class="uppercase" style="text-transform: uppercase;" />
                </div>
                <div v-if="systemMode.isCellphoneStore" class="flex flex-col gap-1">
                  <label class="font-semibold text-sm">IMEI</label>
                  <InputText v-model="form.imei" placeholder="IMEI" fluid />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="font-semibold text-sm">Serial</label>
                  <InputText v-model="form.serial" placeholder="Serial" fluid />
                </div>
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="font-semibold text-sm">Marca / Modelo</label>
                  <InputText v-model="form.marca_modelo" placeholder="Ej: SAMSUNG A50" fluid class="uppercase" style="text-transform: uppercase;" />
                </div>
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="font-semibold text-sm">Clave / Patron</label>
                  <div class="flex gap-2">
                    <InputText v-model="form.clave" placeholder="Clave o patron de desbloqueo" fluid class="flex-1" />
                    <Button
                      icon="pi pi-th-large"
                      severity="info"
                      text
                      rounded
                      size="small"
                      v-tooltip="'Dibujar patron'"
                      @click="abrirPatron"
                    />
                    <Button
                      v-if="form.clave.startsWith('PATRON:')"
                      icon="pi pi-eye"
                      severity="secondary"
                      text
                      rounded
                      size="small"
                      v-tooltip="'Ver patron'"
                      @click="abrirPatron"
                    />
                  </div>
                  <span v-if="patronPreview && patronPreview !== form.clave" class="text-xs text-surface-400">{{ patronPreview }}</span>
                </div>
                <div class="flex flex-col gap-1 md:col-span-2">
                  <label class="font-semibold text-sm">Accesorios</label>
                  <InputText v-model="form.accesorios" placeholder="Accesorios recibidos" fluid class="uppercase" style="text-transform: uppercase;" />
                </div>
                <div class="flex flex-col gap-2 md:col-span-2">
                  <div class="flex items-center justify-between gap-2">
                    <label class="font-semibold text-sm">Imagenes del equipo</label>
                    <span class="text-xs text-surface-400">{{ imagenesOrden.length }}/8</span>
                  </div>
                  <input ref="fileInput" type="file" accept="image/*" multiple class="hidden" @change="agregarImagenes" />
                  <div class="rounded-xl border border-dashed border-surface-300 dark:border-surface-600 bg-surface-50/70 dark:bg-surface-800/40 p-3">
                    <div v-if="imagenesOrden.length" class="grid grid-cols-2 sm:grid-cols-4 gap-2 mb-3">
                      <div
                        v-for="(img, index) in imagenesOrden"
                        :key="`${index}-${img.slice(0, 24)}`"
                        class="relative aspect-square rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-800 group"
                      >
                        <img :src="imagenOrdenUrl(img)" class="w-full h-full object-cover cursor-zoom-in" alt="Imagen de la orden" @click="abrirImagen(imagenOrdenUrl(img))" />
                        <button
                          type="button"
                          class="absolute top-1 right-1 w-7 h-7 rounded-md bg-red-500 text-white shadow-md opacity-95 hover:bg-red-600"
                          title="Quitar imagen"
                          @click.stop="quitarImagen(index)"
                        >
                          <i class="pi pi-times text-xs"></i>
                        </button>
                      </div>
                    </div>
                    <button
                      type="button"
                      class="w-full min-h-24 rounded-lg border border-surface-200 dark:border-surface-700 bg-white/80 dark:bg-surface-900/60 hover:border-primary-300 dark:hover:border-primary-600 transition-colors flex flex-col items-center justify-center gap-2 text-surface-500 dark:text-surface-300"
                      @click="fileInput?.click()"
                    >
                      <i class="pi pi-images text-2xl text-primary"></i>
                      <span class="text-sm font-semibold">{{ imagenesOrden.length ? 'Agregar mas imagenes' : 'Agregar imagenes' }}</span>
                      <span class="text-xs text-surface-400">{{ subiendoImagenes ? 'Subiendo a TM Cloud...' : 'JPG, PNG o fotos de camara. Maximo 8 imagenes.' }}</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </TabPanel>

          <TabPanel value="2">
            <div class="flex flex-col gap-4 pt-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Falla Reportada</label>
                <div class="flex flex-wrap gap-1 mb-1">
                  <Button v-for="f in fallasComunes" :key="f" :label="f" size="small" severity="secondary" text class="!text-xs !py-1 !px-2" @click="form.fallas = form.fallas ? form.fallas + '\n' + f : f" />
                </div>
                <Textarea v-model="form.fallas" rows="3" placeholder="Describe la falla reportada por el cliente" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <div class="flex items-center justify-between">
                  <label class="font-semibold text-sm">Piezas a Utilizar</label>
                  <Button icon="pi pi-plus" label="Agregar Pieza" size="small" severity="info" text @click="dialogPiezasVisible = true" />
                </div>
                <Textarea v-model="form.piezas" rows="2" placeholder="Piezas o repuestos necesarios" fluid />
              </div>
            </div>
          </TabPanel>

          <TabPanel value="3">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Tecnico</label>
                <div class="flex gap-2">
                  <Select v-model="form.tecnico" :options="tecnicos.map(t => t.nombre)" placeholder="Seleccionar tecnico" fluid class="uppercase" />
                </div>
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Fecha Entrada</label>
                <Calendar v-model="form.fecha_entrada" dateFormat="dd/mm/yy" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Fecha Entrega</label>
                <Calendar v-model="form.fecha_entrega" dateFormat="dd/mm/yy" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Estado</label>
                <Select v-model="form.estado" :options="['RECIBIDO', 'EN_PROCESO', 'REPARADO', 'ENTREGADO', 'PARCIAL', 'CANCELADO']" fluid />
              </div>
            </div>
          </TabPanel>

          <TabPanel value="4">
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Total Piezas</label>
                <InputNumber v-model="form.precio_pieza" :min="0" fluid @focus="(e: any) => e.target.select()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Mano de Obra</label>
                <InputNumber v-model="form.mano_obra" :min="0" fluid @focus="(e: any) => e.target.select()" />
              </div>
      <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Total</label>
                <InputNumber :modelValue="totalCalculado" disabled fluid />
                <small v-if="comisionPagoPorcentaje > 0" class="text-amber-600 dark:text-amber-400">
                  Incluye recargo de {{ comisionPagoPorcentaje }}%: {{ comisionPagoMonto.toFixed(2) }}
                </small>
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Abono</label>
                <InputNumber v-model="form.abono" :min="0" fluid @focus="(e: any) => e.target.select()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Pendiente</label>
                <InputNumber :modelValue="pendienteCalculado" disabled fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Metodo Pago</label>
                <Select v-model="form.metodo_pago" :options="metodosPago" optionLabel="label" optionValue="value" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">% Tecnico</label>
                <InputNumber v-model="form.porcentaje_tecnico" suffix=" %" fluid disabled />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Beneficio Tecnico</label>
                <InputNumber v-model="form.beneficio_tecnico" fluid disabled />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Beneficio Empresa</label>
                <InputNumber v-model="form.beneficio_empresa" fluid disabled />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Estado Pago Tecnico</label>
                <Select v-model="form.estado_pago_tecnico" :options="['PENDIENTE', 'PAGADO']" fluid />
              </div>
              <div class="flex flex-col gap-1 md:col-span-2">
                <label class="font-semibold text-sm">Notas de Pago</label>
                <Textarea v-model="form.pagos" placeholder="Notas sobre pagos realizados" rows="2" fluid />
              </div>
            </div>
          </TabPanel>
        </TabPanels>
      </Tabs>

      <div class="flex justify-between gap-2 pt-4 border-t border-surface-200 dark:border-surface-700">
        <Button icon="pi pi-chevron-left" label="Anterior" severity="secondary" outlined :disabled="activeTab === '0'" @click="activeTab = String(Number(activeTab) - 1)" />
        <div class="flex gap-2">
          <Button v-if="activeTab !== '4'" label="Siguiente" icon="pi pi-chevron-right" iconPos="right" severity="secondary" outlined @click="activeTab = String(Number(activeTab) + 1)" />
        </div>
      </div>

      <div class="flex justify-end gap-2 pt-2">
        <Button label="Cancelar" severity="secondary" text @click="$emit('close')" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :loading="guardando" :disabled="subiendoImagenes" @click="guardar" />
      </div>
    </div>
  </Dialog>

  <Dialog v-model:visible="dialogClientesVisible" header="Seleccionar cliente" modal :style="{ width: 'min(38rem, 95vw)' }">
    <div class="flex flex-col gap-3">
      <InputText v-model="busquedaCliente" placeholder="Buscar por nombre, teléfono, cédula o RNC..." fluid autofocus />
      <div class="max-h-80 overflow-y-auto flex flex-col gap-1">
        <button v-for="cliente in clientesFiltrados" :key="cliente.id" type="button" class="flex items-center justify-between text-left px-3 py-2.5 rounded-lg border border-transparent hover:bg-surface-100 dark:hover:bg-surface-700 hover:border-surface-200 dark:hover:border-surface-600" @click="seleccionarCliente(cliente)">
          <div><p class="font-medium text-sm">{{ cliente.nombre }}</p><p class="text-xs text-surface-500">{{ cliente.cedula || cliente.rnc || 'Sin documento' }} · {{ cliente.telefono || cliente.whatsapp || 'Sin teléfono' }}</p></div>
          <i class="pi pi-chevron-right text-surface-400"></i>
        </button>
        <div v-if="clientesFiltrados.length === 0" class="text-center py-8 text-surface-400 text-sm">No se encontraron clientes.</div>
      </div>
    </div>
    <template #footer><Button label="Cancelar" severity="secondary" text @click="dialogClientesVisible = false" /></template>
  </Dialog>

  <Dialog v-model:visible="dialogPiezasVisible" header="Seleccionar Pieza" :modal="true" :style="{ width: 'min(40rem, 95vw)' }">
    <div class="flex flex-col gap-3">
      <InputText v-model="buscarPieza" placeholder="Buscar pieza..." fluid class="w-full" />
      <div class="max-h-80 overflow-y-auto flex flex-col gap-1">
        <div
          v-for="pieza in piezasFiltradas"
          :key="pieza.id"
          class="flex items-center justify-between px-3 py-2 rounded-lg cursor-pointer hover:bg-surface-100 dark:hover:bg-surface-700 border border-transparent hover:border-surface-200 dark:hover:border-surface-600"
          @click="seleccionarPieza(pieza)"
        >
          <div>
            <p class="text-sm font-medium">{{ pieza.nombre }}</p>
            <p class="text-xs text-surface-500">Stock: {{ pieza.cantidad || 0 }}</p>
          </div>
          <span class="text-sm font-semibold text-emerald-600">${{ pieza.precio_venta || 0 }}</span>
        </div>
        <div v-if="piezasFiltradas.length === 0" class="text-center py-6 text-surface-400 text-sm">
          No se encontraron piezas.
        </div>
      </div>
    </div>
  </Dialog>

  <Dialog v-model:visible="dialogImagenVisible" header="Imagen de la orden" modal :style="{ width: 'min(48rem, 96vw)' }">
    <div class="flex items-center justify-center bg-surface-100 dark:bg-surface-900 rounded-xl overflow-hidden">
      <img v-if="imagenPreview" :src="imagenPreview" class="max-w-full max-h-[72vh] object-contain" alt="Imagen de la orden" />
    </div>
  </Dialog>

  <Dialog v-model:visible="dialogPatron" header="Dibujar patron de desbloqueo" modal :style="{ width: '22rem' }" :dismissableMask="false">
    <div class="flex flex-col items-center gap-4 py-4">
      <div
        ref="patronGridRef"
        class="grid grid-cols-3 gap-6 p-6 rounded-xl select-none"
        style="background:#f3f4f6;touch-action:none;"
        @pointerup="patronPointerUp"
        @pointerleave="patronPointerLeaveGrid"
        @pointercancel="patronPointerUp"
      >
        <div
          v-for="num in 9" :key="num"
          class="w-10 h-10 rounded-full flex items-center justify-center cursor-pointer transition-all duration-100 select-none text-xs font-bold"
          style="background:#fff;border:2px solid #d1d5db;"
          :style="patronDots.includes(num - 1) ? 'background:#3b82f6;border-color:#3b82f6;color:#fff;scale:1.15;' : ''"
          @pointerdown.prevent="patronPointerDown(num - 1)"
          @pointerenter="patronPointerEnter(num - 1)"
        >{{ patronDots.includes(num - 1) ? patronDots.indexOf(num - 1) + 1 : '' }}</div>
      </div>
      <p class="text-xs text-surface-400">Conecta los puntos para crear el patron</p>
      <div class="flex gap-2">
        <Button label="Limpiar" icon="pi pi-refresh" severity="secondary" text @click="limpiarPatron" />
        <Button label="Cancelar" severity="secondary" @click="dialogPatron = false" />
        <Button label="Guardar Patron" icon="pi pi-check" @click="guardarPatron" />
      </div>
    </div>
  </Dialog>
</template>
