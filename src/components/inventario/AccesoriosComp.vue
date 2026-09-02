<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, watch, onMounted } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

import { envioElectron } from '@/funciones/funciones.js'
import { uploadImage, getImageUrl, getImageIds, serializeImageIds, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useEmpresa } from '@/composables/useEmpresa'
import { useSystemModeStore } from '@/stores/systemMode'
import { useAuthStore } from '@/stores/auth.store'
import { useCloudRefresh } from '@/composables/useCloudRefresh'
import InternetImageSearchDialog from '@/components/shared/InternetImageSearchDialog.vue'

const toast = useToast()
const systemMode = useSystemModeStore()
const { nombre: nombreEmpresa, cargar: cargarEmpresa } = useEmpresa()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const auth = useAuthStore()
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const accesorios = ref<any[]>([])
const accesoriosRaw = ref<any[]>([])
const marcas = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedAccesorio = ref<any>(null)
const busqueda = ref('')
const dialogEtiquetaProducto = ref(false)
const productoEtiqueta = ref<any>(null)
const plantillasEtiquetas = ref<any[]>([])
const printers = ref<any[]>([])
const printerSel = ref('')
const escaneando = ref(false)
const escaneandoBT = ref(false)
const copias = ref(1)
const busquedaPlantilla = ref('')
const proveedores = ref<any[]>([])
const dialogNuevaCategoria = ref(false)
const nuevaCategoria = ref('')
const dialogNuevaMarca = ref(false)
const nuevaMarca = ref('')
const dialogNuevoProveedor = ref(false)
const nuevoProveedor = ref({ nombre: '', telefono: '', direccion: '' })
const dialogAgregarStock = ref(false)
const accesorioStock = ref<any>(null)
const stockCantidad = ref(0)
const selectedAccesorios = ref<any[]>([])
const dialogCambioProveedorMulti = ref(false)
const proveedorMultiSel = ref<any>(null)
const dialogMoverAlmacenMulti = ref(false)
const almacenDestinoMulti = ref<any>(null)
const almacenesDestinoMulti = ref<any[]>([])
const moviendoAlmacenMulti = ref(false)
const dialogAjustarPrecios = ref(false)
const modoAjustePrecio = ref<'porcentaje' | 'manual'>('porcentaje')
const direccionPorcentaje = ref<'aumentar' | 'disminuir'>('aumentar')
const porcentajePrecio = ref<number | null>(null)
const preciosManuales = ref<Record<number, number>>({})
const preciosMinManuales = ref<Record<number, number>>({})
const preciosMayorManuales = ref<Record<number, number>>({})
const afectarPrecioMin = ref(false)
const afectarPrecioMayor = ref(false)
const alcanceAjustePrecio = ref<'todos' | 'seleccionados'>('todos')
const guardandoPrecios = ref(false)

const camposArray = ['nombre', 'codigo_barra', 'costo', 'precio_venta', 'precio_min', 'precio_xmayor', 'cantidad', 'alerta', 'marca', 'categoria', 'proveedor_id']

const form = ref({
  nombre: '',
  codigo_barra: '',
  costo: 0,
  precio_venta: 0,
  precio_min: 0,
  precio_xmayor: 0,
  cantidad: 1,
  alerta: 10,
  marca: null as number | null,
  categoria: null as number | null,
  proveedor_id: null as number | null,
  imagen: '',
})
const fileInput = ref<HTMLInputElement | null>(null)
const subiendoImagen = ref(false)
const dialogBuscarImagen = ref(false)
const importandoImagenInternet = ref(false)
const formImages = computed(() => getImageIds(form.value.imagen))

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCifrado = ref('')
const tokenCorto = ref('')

const categorias = ref<any[]>([])

const accesoriosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return accesorios.value
  return accesorios.value.filter(a =>
    a.nombre?.toLowerCase().includes(texto) ||
    a.marca_nombre?.toLowerCase().includes(texto)
  )
})
const accesoriosObjetivoPrecio = computed(() =>
  alcanceAjustePrecio.value === 'seleccionados' ? selectedAccesorios.value : accesorios.value
)

function abrirAjustePrecios() {
  modoAjustePrecio.value = 'porcentaje'
  direccionPorcentaje.value = 'aumentar'
  porcentajePrecio.value = null
  preciosManuales.value = Object.fromEntries(
    accesorios.value.map((accesorio: any) => [Number(accesorio.id), Number(accesorio.precio_venta || 0)])
  )
  preciosMinManuales.value = Object.fromEntries(
    accesorios.value.map((accesorio: any) => [Number(accesorio.id), Number(accesorio.precio_min || 0)])
  )
  preciosMayorManuales.value = Object.fromEntries(
    accesorios.value.map((accesorio: any) => [Number(accesorio.id), Number(accesorio.precio_xmayor || 0)])
  )
  afectarPrecioMin.value = false
  afectarPrecioMayor.value = false
  alcanceAjustePrecio.value = 'todos'
  dialogAjustarPrecios.value = true
}

async function guardarAjustePrecios() {
  const porcentaje = Number(porcentajePrecio.value || 0)
  if (modoAjustePrecio.value === 'porcentaje' && porcentaje <= 0) {
    toast.add({ severity: 'warn', summary: 'Porcentaje requerido', detail: 'Indica un porcentaje mayor que cero.', life: 2500 })
    return
  }

  const cambios = accesoriosObjetivoPrecio.value
    .map((accesorio: any) => {
      const precioActual = Number(accesorio.precio_venta || 0)
      const precioMinActual = Number(accesorio.precio_min || 0)
      const precioMayorActual = Number(accesorio.precio_xmayor || 0)
      const factor = direccionPorcentaje.value === 'aumentar' ? 1 + porcentaje / 100 : 1 - porcentaje / 100
      const precioNuevo = modoAjustePrecio.value === 'porcentaje'
        ? Math.max(0, Math.round(precioActual * factor * 100) / 100)
        : Math.max(0, Number(preciosManuales.value[Number(accesorio.id)] ?? precioActual))
      const precioMinNuevo = !afectarPrecioMin.value ? precioMinActual : modoAjustePrecio.value === 'porcentaje'
        ? Math.max(0, Math.round(precioMinActual * factor * 100) / 100)
        : Math.max(0, Number(preciosMinManuales.value[Number(accesorio.id)] ?? precioMinActual))
      const precioMayorNuevo = !afectarPrecioMayor.value ? precioMayorActual : modoAjustePrecio.value === 'porcentaje'
        ? Math.max(0, Math.round(precioMayorActual * factor * 100) / 100)
        : Math.max(0, Number(preciosMayorManuales.value[Number(accesorio.id)] ?? precioMayorActual))
      return { accesorio, precioActual, precioNuevo, precioMinActual, precioMinNuevo, precioMayorActual, precioMayorNuevo }
    })
    .filter(({ precioActual, precioNuevo, precioMinActual, precioMinNuevo, precioMayorActual, precioMayorNuevo }) =>
      precioActual !== precioNuevo || precioMinActual !== precioMinNuevo || precioMayorActual !== precioMayorNuevo
    )

  if (cambios.length === 0) {
    toast.add({ severity: 'info', summary: 'Sin cambios', detail: 'No hay precios nuevos para guardar.', life: 2200 })
    return
  }

  guardandoPrecios.value = true
  let actualizados = 0
  try {
    for (const { accesorio, precioNuevo, precioMinNuevo, precioMayorNuevo } of cambios) {
      const data: Record<string, number> = { precio_venta: precioNuevo }
      if (afectarPrecioMin.value) data.precio_min = precioMinNuevo
      if (afectarPrecioMayor.value) data.precio_xmayor = precioMayorNuevo
      const res = await window.db.update('accesorios', accesorio.id, data)
      if (!res.success) throw new Error(res.error || `No se pudo actualizar ${accesorio.nombre}`)
      actualizados++
    }
    dialogAjustarPrecios.value = false
    await cargarAccesorios()
    toast.add({ severity: 'success', summary: 'Precios actualizados', detail: `${actualizados} precio(s) fueron actualizados.`, life: 3000 })
  } catch (error: any) {
    await cargarAccesorios()
    toast.add({ severity: 'error', summary: 'Actualización incompleta', detail: `${actualizados} precio(s) actualizados. ${error?.message || 'Ocurrió un error.'}`, life: 4500 })
  } finally {
    guardandoPrecios.value = false
  }
}

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

function mmToDots(mm: number) {
  return Math.round(Number(mm || 0) * 8)
}

function generarTsplProducto(plantilla: any, elementos: any[], producto: any) {
  const ancho = Number(plantilla.ancho || 50)
  const alto = Number(plantilla.alto || 30)
  let tspl = `SIZE ${ancho} mm,${alto} mm\r\nGAP 2 mm,0\r\nCLS\r\n`

  for (const el of JSON.parse(JSON.stringify(elementos))) {
    if (typeof el.contenido === 'string') {
      el.contenido = aplicarVariablesProducto(el.contenido, producto)
    }
    const x = mmToDots(el.x)
    const y = mmToDots(el.y)
    const w = mmToDots(el.ancho)
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

async function cargarMarcas() {
  try {
    const res = await window.db.getAll('marcas')
    if (res.success) {
      marcas.value = res.data || []
    }
  } catch (error) {
    console.error(error)
  }
}

async function cargarCategorias() {
  try {
    const res = await window.db.getAll('categorias')
    if (res.success) {
      categorias.value = res.data || []
    }
  } catch (error) {
    console.error(error)
  }
}

async function cargarAccesorios() {
  loading.value = true
  try {
    const res = await window.db.getAll('accesorios')
    if (res.success) {
      const marcaMap = new Map(marcas.value.map((m: any) => [m.id, m.nombre]))
      const catMap = new Map(categorias.value.map((c: any) => [c.id, c.nombre]))
      accesoriosRaw.value = (res.data || []).map((a: any) => ({
        ...a,
        marca_nombre: marcaMap.get(a.marca) || '',
        categoria_nombre: catMap.get(a.categoria) || '',
      }))
      accesorios.value = verTodosAlmacenes.value ? accesoriosRaw.value : filterByAlmacen(accesoriosRaw.value)
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  if (accesoriosRaw.value.length === 0) return
  accesorios.value = verTodosAlmacenes.value ? accesoriosRaw.value : filterByAlmacen(accesoriosRaw.value)
})

function abrirCrear() {
  isEditing.value = false
  form.value = {
    nombre: '',
    costo: 0,
    precio_venta: 0,
    precio_min: 0,
    precio_xmayor: 0,
    cantidad: 1,
    alerta: 10,
    marca: null,
    categoria: null,
    imagen: '',
  }
  dialogVisible.value = true
}

function abrirEditar(accesorio: any) {
  isEditing.value = true
  selectedAccesorio.value = accesorio
  form.value = {
    nombre: accesorio.nombre,
    codigo_barra: accesorio.codigo_barra || '',
    costo: accesorio.costo || 0,
    precio_venta: accesorio.precio_venta || 0,
    precio_min: accesorio.precio_min || 0,
    precio_xmayor: accesorio.precio_xmayor || 0,
    cantidad: accesorio.cantidad || 1,
    alerta: accesorio.alerta || 10,
    marca: accesorio.marca || null,
    categoria: accesorio.categoria || null,
    proveedor_id: accesorio.proveedor_id || null,
    imagen: accesorio.imagen || '',
  }
  dialogVisible.value = true
}

function abrirAgregarStock(accesorio: any) {
  accesorioStock.value = accesorio
  stockCantidad.value = 0
  dialogAgregarStock.value = true
}

function actualizarStockCantidad(event: { value?: number | null }) {
  stockCantidad.value = Number(event.value || 0)
}

async function aplicarAgregarStock() {
  const cantidadAgregar = Number(stockCantidad.value || 0)
  if (!accesorioStock.value || cantidadAgregar <= 0) return
  const nueva = Number(accesorioStock.value.cantidad || 0) + cantidadAgregar
  await window.db.update('accesorios', accesorioStock.value.id, { cantidad: nueva })
  accesorioStock.value.cantidad = nueva
  dialogAgregarStock.value = false
  toast.add({ severity: 'success', summary: 'Stock agregado', detail: `+${cantidadAgregar} unidades`, life: 2000 })
  await cargarAccesorios()
}

function confirmarBorrar(accesorio: any) {
  selectedAccesorio.value = accesorio
  deleteDialogVisible.value = true
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
  return plantillasEtiquetas.value.filter((p: any) =>
    p.nombre?.toLowerCase().includes(texto)
  )
})

function abrirEtiquetaProducto(producto: any) {
  productoEtiqueta.value = producto
  const saved = localStorage.getItem('etiquetas_printer') || ''
  printerSel.value = saved
  incluirImpresoraGuardada()
  copias.value = 1
  busquedaPlantilla.value = ''
  escanearImpresoras()
  cargarPlantillasEtiquetas()
  dialogEtiquetaProducto.value = true
}

function generarCodigoBarra() {
  const digitos = Array.from({ length: 10 }, () => Math.floor(Math.random() * 10)).join('')
  form.value.codigo_barra = digitos
}

function generarCodigoProducto(producto: any): string {
  return String(producto?.codigo_barra || producto?.codigo || producto?.barcode || producto?.id || '')
}

function generarBarcodeSVG(data: string): string {
  if (!data) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, data, { format: 'CODE128', width: 1.5, height: 40, displayValue: true, fontSize: 10, margin: 2 })
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

function aplicarVariablesProducto(valor: string, producto: any): string {
  const precio = Number(producto?.precio_venta || 0).toFixed(2)
  const codigo = generarCodigoProducto(producto)
  return String(valor || '')
    .replace(/\{EMPRESA\}/gi, nombreEmpresa.value || 'MI EMPRESA')
    .replace(/\{PRODUCTO\}/gi, producto?.nombre || '')
    .replace(/\{NOMBRE_PRODUCTO\}/gi, producto?.nombre || '')
    .replace(/\{PRECIO\}/gi, `RD$ ${precio}`)
    .replace(/\{CODIGO_BARRA\}/gi, codigo)
    .replace(/\{CODIGO\}/gi, codigo)
    .replace(/\{BARCODE\}/gi, codigo)
}

async function imprimirEtiquetaProducto(plantilla: any) {
  if (!printerSel.value) {
    toast.add({ severity: 'warn', summary: 'Selecciona una impresora', life: 2000 })
    return
  }
  if (!productoEtiqueta.value || !plantilla?.elementos) return

  await cargarEmpresa()

  localStorage.setItem('etiquetas_printer', printerSel.value)
  dialogEtiquetaProducto.value = false

  let elementos: any[]
  try { elementos = JSON.parse(plantilla.elementos) } catch { return }

  const mmToPx = (mm: number) => mm * 3.7795275591
  const ancho = plantilla.ancho || 50
  const alto = plantilla.alto || 30
  const producto = productoEtiqueta.value
  const directPrinter = getSelectedDirectPrinter()

  if (directPrinter?.portName) {
    localStorage.setItem('etiquetas_printer_direct', JSON.stringify({
      name: printerSel.value,
      portName: directPrinter.portName,
      protocol: 'TSPL',
    }))
    const tspl = generarTsplProducto(plantilla, elementos, producto)
    let impresasDirectas = 0
    let ultimoErrorDirecto = ''
    for (let i = 0; i < copias.value; i++) {
      try {
        const res = await window.electron.invoke('print:bluetooth-raw', directPrinter.portName, tspl) as any
        if (res.success) impresasDirectas++
        else ultimoErrorDirecto = res.error || 'No se pudo imprimir por Bluetooth directo'
      } catch (error: any) {
        ultimoErrorDirecto = error.message || 'No se pudo imprimir por Bluetooth directo'
      }
    }
    if (impresasDirectas > 0) toast.add({ severity: 'success', summary: 'Impreso', detail: `${impresasDirectas} etiqueta(s) enviada(s) por ${directPrinter.portName}`, life: 3000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: ultimoErrorDirecto || 'No se pudo imprimir por Bluetooth directo', life: 6000 })
    return
  }

  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta Producto</title><style>'
  html += `@page{size:${ancho}mm ${alto}mm;margin:0}html,body{margin:0;padding:0;width:${ancho}mm;height:${alto}mm;font-family:Arial,sans-serif}`
  html += `.label{width:${mmToPx(ancho)}px;height:${mmToPx(alto)}px;position:relative;overflow:hidden;background:white}`
  html += '.elem{position:absolute;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:center}'
  html += '</style></head><body><div class="label">'

  const elClone = JSON.parse(JSON.stringify(elementos))
  for (const el of elClone) {
    if (typeof el.contenido === 'string') {
      el.contenido = aplicarVariablesProducto(el.contenido, producto)
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

  let impresas = 0
  let ultimoError = ''
  for (let i = 0; i < copias.value; i++) {
    try {
      const res = await window.electron.invoke('print:ticket', html, printerSel.value || undefined, { width: ancho, height: alto }) as any
      if (res.success) impresas++
      else ultimoError = res.error || 'No se pudo imprimir'
    } catch (error: any) {
      ultimoError = error.message || 'No se pudo imprimir'
    }
  }
  if (impresas > 0) toast.add({ severity: 'success', summary: 'Impreso', detail: `${impresas} etiqueta(s) enviada(s) a la impresora`, life: 2000 })
  else toast.add({ severity: 'error', summary: 'Error', detail: ultimoError || 'No se pudieron imprimir las etiquetas', life: 6000 })
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()

  try {
    const data: any = {
      nombre: nombreMayus,
      codigo_barra: form.value.codigo_barra.trim(),
      costo: form.value.costo || 0,
      precio_venta: form.value.precio_venta || 0,
      precio_min: form.value.precio_min || 0,
      precio_xmayor: form.value.precio_xmayor || 0,
      cantidad: form.value.cantidad || 1,
      alerta: form.value.alerta || 10,
      marca: form.value.marca,
      categoria: form.value.categoria,
      proveedor_id: form.value.proveedor_id,
    }
    if (form.value.imagen) data.imagen = form.value.imagen

    const res = isEditing.value
      ? await window.db.update('accesorios', selectedAccesorio.value.id, data)
      : await window.db.insert('accesorios', addAlmacenId(data))
    if (!res.success) throw new Error(res.error || 'La nube rechazo la operacion')

    toast.add({
      severity: 'success',
      summary: 'Guardado en la nube',
      detail: `${systemMode.isGeneralStore ? 'Producto' : 'Accesorio'} ${isEditing.value ? 'actualizado' : 'creado'}`,
      life: 3000,
    })
    dialogVisible.value = false
    await cargarAccesorios()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se guardo', detail: error?.message || 'Error al guardar en la nube', life: 4000 })
  }
}

function confirmarBorrarMultiple() {
  if (selectedAccesorios.value.length === 0) return
  deleteDialogVisible.value = true
}

async function borrarMultiple() {
  for (const acc of selectedAccesorios.value) {
    await window.db.delete('accesorios', acc.id)
  }
  selectedAccesorios.value = []
  deleteDialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Eliminados', detail: `${systemMode.productLabel} eliminados`, life: 2000 })
  await cargarAccesorios()
}

function abrirCambioProveedorMulti() {
  proveedorMultiSel.value = null
  dialogCambioProveedorMulti.value = true
}

async function aplicarCambioProveedorMulti() {
  if (!proveedorMultiSel.value) return
  const cantidad = selectedAccesorios.value.length
  for (const acc of selectedAccesorios.value) {
    await window.db.update('accesorios', acc.id, { proveedor_id: proveedorMultiSel.value.id })
  }
  selectedAccesorios.value = []
  dialogCambioProveedorMulti.value = false
  toast.add({ severity: 'success', summary: 'Proveedor actualizado', detail: `${cantidad} accesorio(s)`, life: 2000 })
  await cargarAccesorios()
}

async function abrirMoverAlmacenMulti() {
  if (selectedAccesorios.value.length === 0) return
  almacenDestinoMulti.value = null
  try {
    await almacenStore.load()
    const origenUid = String(selectedAccesorios.value[0].almacen_uid || almacenStore.activeUid || '')
    almacenesDestinoMulti.value = almacenStore.almacenes.filter((a: any) => String(a.uid || '') !== origenUid)
    dialogMoverAlmacenMulti.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function aplicarMoverAlmacenMulti() {
  if (!almacenDestinoMulti.value || moviendoAlmacenMulti.value) return
  const destinoId = Number(almacenDestinoMulti.value.id || almacenDestinoMulti.value)
  const destinoUid = String(almacenDestinoMulti.value.uid || '')
  const destinoNombre = almacenDestinoMulti.value.nombre || ''
  const cantidad = selectedAccesorios.value.length
  moviendoAlmacenMulti.value = true
  try {
    for (const acc of selectedAccesorios.value) {
      const res = await window.db.update('accesorios', acc.id, { almacen_id: destinoId, almacen_uid: destinoUid })
      if (!res.success) throw new Error(res.error || `No se pudo mover ${acc.nombre}`)
    }
    dialogMoverAlmacenMulti.value = false
    selectedAccesorios.value = []
    toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: `${cantidad} ${systemMode.isGeneralStore ? 'producto(s)' : 'accesorio(s)'} movidos a ${destinoNombre}`, life: 3000 })
    await cargarAccesorios()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cambiar el almacen', life: 4000 })
  } finally {
    moviendoAlmacenMulti.value = false
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('accesorios', selectedAccesorio.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: `${systemMode.isGeneralStore ? 'Producto' : 'Accesorio'} eliminado`, life: 3000 })
    }
    deleteDialogVisible.value = false
    await cargarAccesorios()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

async function crearCategoria() {
  if (!nuevaCategoria.value.trim()) return
  const res = await window.db.insert('categorias', { nombre: nuevaCategoria.value.trim().toUpperCase() })
  if (res.success) {
    categorias.value.push({ id: res.data.id, nombre: nuevaCategoria.value.trim().toUpperCase() })
    form.value.categoria = res.data.id
    dialogNuevaCategoria.value = false
    toast.add({ severity: 'success', summary: 'Categoria creada', detail: nuevaCategoria.value.trim().toUpperCase(), life: 2000 })
  }
}

async function crearMarca() {
  if (!nuevaMarca.value.trim()) return
  const res = await window.db.insert('marcas', { nombre: nuevaMarca.value.trim().toUpperCase() })
  if (res.success) {
    marcas.value.push({ id: res.data.id, nombre: nuevaMarca.value.trim().toUpperCase() })
    form.value.marca = res.data.id
    dialogNuevaMarca.value = false
    toast.add({ severity: 'success', summary: 'Marca creada', detail: nuevaMarca.value.trim().toUpperCase(), life: 2000 })
  }
}

async function crearProveedor() {
  if (!nuevoProveedor.value.nombre.trim()) return
  const data = {
    nombre: nuevoProveedor.value.nombre.trim().toUpperCase(),
    telefono: nuevoProveedor.value.telefono.trim(),
    direccion: nuevoProveedor.value.direccion.trim().toUpperCase(),
  }
  const res = await window.db.insert('proveedores', addAlmacenId(data))
  if (res.success) {
    proveedores.value.push({ id: res.data.id, ...data })
    form.value.proveedor_id = res.data.id
    dialogNuevoProveedor.value = false
    toast.add({ severity: 'success', summary: 'Proveedor creado', detail: data.nombre, life: 2000 })
  }
}

async function guardarImagenesAccesorio(ids: string[]) {
  const imagen = serializeImageIds(ids)
  form.value.imagen = imagen
  if (!isEditing.value || !selectedAccesorio.value?.id) return
  const actualizado = await window.db.update('accesorios', selectedAccesorio.value.id, { imagen })
  if (!actualizado.success) throw new Error(actualizado.error || 'No se pudieron guardar las imagenes')
  selectedAccesorio.value.imagen = imagen
  const local = accesorios.value.find((accesorio: any) => accesorio.id === selectedAccesorio.value.id)
  if (local) local.imagen = imagen
  if (isOnline()) await pushLocalRowToCloud('accesorios', selectedAccesorio.value.id)
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
        ids.push(await uploadImage(files[index], 'accesorios'))
        uploaded++
      } catch (error: any) {
        errors.push(error?.message || `${files[index].name}: no se pudo subir`)
      }
      if (index < files.length - 1) await new Promise(resolve => setTimeout(resolve, 350))
    }
    if (!uploaded) throw new Error(errors[0] || 'No se pudo subir ninguna imagen')
    await guardarImagenesAccesorio(ids)
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
    const baseName = String(form.value.nombre || 'accesorio').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'accesorio'
    const file = new File([blob], `${baseName}.${extension}`, { type: blob.type })
    const uid = await uploadImage(file, 'accesorios')
    await guardarImagenesAccesorio([...getImageIds(form.value.imagen), uid])
    toast.add({ severity: 'success', summary: 'Imagen agregada', detail: 'La imagen de internet fue guardada en el accesorio', life: 3000 })
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
  await guardarImagenesAccesorio(getImageIds(form.value.imagen).filter(imageId => imageId !== uid))
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

  await cargarCategorias()
  await cargarMarcas()
  await cargarAccesorios()
  const resProv = await window.db.getAll('proveedores')
  if (resProv.success) proveedores.value = resProv.data || []
})

useCloudRefresh(['accesorios'], cargarAccesorios)
</script>

<template>
  <div>
    <Toast />

    <Fieldset :legend="systemMode.productLabel">
      <div class="toolbar-mobile">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" :placeholder="systemMode.isGeneralStore ? 'Buscar producto...' : 'Buscar accesorio...'" />
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
          <Button label="Ajustar precios" icon="pi pi-percentage" severity="secondary" outlined @click="abrirAjustePrecios" />
          <Button :label="systemMode.isGeneralStore ? 'Nuevo Producto' : 'Nuevo Accesorio'" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div v-if="selectedAccesorios.length > 0" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium">{{ selectedAccesorios.length }} seleccionado(s)</span>
        <Button label="Ajustar precios" icon="pi pi-percentage" severity="secondary" size="small" @click="abrirAjustePrecios(); alcanceAjustePrecio = 'seleccionados'" />
        <Button label="Cambiar Proveedor" icon="pi pi-truck" severity="info" size="small" @click="abrirCambioProveedorMulti" />
        <Button label="Cambiar Almacen" icon="pi pi-warehouse" severity="success" size="small" @click="abrirMoverAlmacenMulti" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="confirmarBorrarMultiple" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="selectedAccesorios = []" v-tooltip="'Limpiar seleccion'" />
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="accesoriosFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        v-model:selection="selectedAccesorios"
        @row-click="abrirEditar($event.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Imagen" style="width: 4rem">
          <template #body="{ data }">
            <div v-if="imagenUrl(data.imagen)" class="w-8 h-8 rounded overflow-hidden">
              <img :src="imagenUrl(data.imagen)" loading="lazy" decoding="async" class="w-full h-full object-cover" alt="" />
            </div>
          </template>
        </Column>
        <Column field="nombre" header="Nombre" sortable />
        <Column field="codigo_barra" header="Cod. Barra" sortable style="width: 8rem">
          <template #body="{ data }">
            <span v-if="data.codigo_barra" class="font-mono text-xs">{{ data.codigo_barra }}</span>
            <span v-else class="text-surface-400">—</span>
          </template>
        </Column>
        <Column field="categoria" header="Categoria" sortable style="width: 8rem">
          <template #body="{ data }">
            <span v-if="data.categoria_nombre">{{ data.categoria_nombre }}</span>
            <span v-else class="text-surface-400">Sin categoria</span>
          </template>
        </Column>
        <Column field="marca" header="Marca" sortable style="width: 8rem">
          <template #body="{ data }">
            <span v-if="data.marca_nombre">{{ data.marca_nombre }}</span>
            <span v-else class="text-surface-400">Sin marca</span>
          </template>
        </Column>
        <Column field="costo" header="Costo" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.costo ? `$${data.costo.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>
        <Column field="precio_venta" header="Venta" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.precio_venta ? `$${data.precio_venta.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>
        <Column field="precio_min" header="Min" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.precio_min ? `$${data.precio_min.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>
        <Column field="precio_xmayor" header="Mayor" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.precio_xmayor ? `$${data.precio_xmayor.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>
        <Column field="cantidad" header="Cant" sortable style="width: 5rem" />
        <Column field="alerta" header="Alerta" sortable style="width: 5rem" />
        <Column header="Acciones" style="width: 10rem">
          <template #body="{ data }">
            <div class="flex gap-2">
              <Button
                icon="pi pi-qrcode"
                severity="success"
                text
                rounded
                @click="abrirEtiquetaProducto(data)"
                v-tooltip="'Etiqueta'"
              />
              <Button
                icon="pi pi-pencil"
                severity="info"
                text
                rounded
                @click="abrirEditar(data)"
                v-tooltip="'Editar'"
              />
              <Button
                icon="pi pi-plus"
                severity="success"
                text
                rounded
                @click="abrirAgregarStock(data)"
                v-tooltip="'Agregar stock'"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                @click="confirmarBorrar(data)"
                v-tooltip="'Eliminar'"
              />
            </div>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay {{ systemMode.isGeneralStore ? 'productos' : 'accesorios' }} registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="accesoriosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay {{ systemMode.isGeneralStore ? 'productos' : 'accesorios' }} registrados.</div>
        <div v-else class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
          <div
            v-for="acc in accesoriosFiltrados"
            :key="acc.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ acc.id }}</span>
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full"
                :class="acc.cantidad <= acc.alerta
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'"
              >
                Stock: {{ acc.cantidad }}
              </span>
            </div>
            <div v-if="imagenUrl(acc.imagen)" class="-mx-4 -mt-4 mb-2 h-36 overflow-hidden">
              <img :src="imagenUrl(acc.imagen)" loading="lazy" decoding="async" class="w-full h-full object-cover" alt="" />
            </div>
            <div>
              <h4 class="font-bold text-lg leading-tight uppercase">{{ acc.nombre }}</h4>
              <p v-if="acc.codigo_barra" class="text-xs font-mono text-surface-400">Cod: {{ acc.codigo_barra }}</p>
              <p class="text-sm text-surface-500 dark:text-surface-400">{{ acc.marca_nombre || 'Sin marca' }}</p>
              <p v-if="acc.categoria_nombre" class="text-xs text-surface-400">{{ acc.categoria_nombre }}</p>
            </div>
            <div class="grid grid-cols-3 gap-2 text-sm">
              <div class="text-center">
                <span class="block text-surface-400 text-xs">Venta</span>
                <span class="font-semibold">${{ (acc.precio_venta || 0).toFixed(2) }}</span>
              </div>
              <div class="text-center">
                <span class="block text-surface-400 text-xs">Minimo</span>
                <span class="font-semibold">${{ (acc.precio_min || 0).toFixed(2) }}</span>
              </div>
              <div class="text-center">
                <span class="block text-surface-400 text-xs">Por Mayor</span>
                <span class="font-semibold">${{ (acc.precio_xmayor || 0).toFixed(2) }}</span>
              </div>
            </div>
            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button
                icon="pi pi-plus"
                severity="success"
                text
                rounded
                size="small"
                @click.stop="abrirAgregarStock(acc)"
                v-tooltip="'Agregar stock'"
              />
              <Button
                icon="pi pi-qrcode"
                severity="success"
                text
                rounded
                size="small"
                @click="abrirEtiquetaProducto(acc)"
                v-tooltip="'Etiqueta'"
              />
              <Button
                icon="pi pi-pencil"
                severity="info"
                text
                rounded
                size="small"
                @click="abrirEditar(acc)"
                v-tooltip="'Editar'"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                @click="confirmarBorrar(acc)"
                v-tooltip="'Eliminar'"
              />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="`${isEditing ? 'Editar' : 'Nuevo'} ${systemMode.isGeneralStore ? 'Producto' : 'Accesorio'}`"
      modal
      :style="{ width: '32rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" :placeholder="systemMode.isGeneralStore ? 'Nombre del producto' : 'Nombre del accesorio'" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Codigo de Barra</label>
          <div class="flex gap-2">
            <InputText v-model="form.codigo_barra" placeholder="Codigo de barras del producto" class="flex-1" fluid />
            <Button icon="pi pi-sync" severity="info" text rounded size="small" @click="generarCodigoBarra" v-tooltip="'Generar codigo de 10 digitos'" />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
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
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Cantidad</label>
            <InputNumber v-model="form.cantidad" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Alerta Stock</label>
            <InputNumber v-model="form.alerta" fluid />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Categoria</label>
          <div class="flex gap-2">
            <Select v-model="form.categoria" :options="categorias" optionLabel="nombre" optionValue="id" placeholder="Seleccionar categoria" class="flex-1" fluid />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevaCategoria = true" v-tooltip="'Nueva categoria'" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Marca</label>
          <div class="flex gap-2">
            <Select v-model="form.marca" :options="marcas" optionLabel="nombre" optionValue="id" placeholder="Seleccionar marca" class="flex-1" fluid />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevaMarca = true" v-tooltip="'Nueva marca'" />
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Proveedor</label>
          <div class="flex gap-2">
            <Select v-model="form.proveedor_id" :options="proveedores" optionLabel="nombre" optionValue="id" placeholder="Seleccionar proveedor" class="flex-1" fluid />
            <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
          </div>
        </div>

        <div class="flex flex-col gap-2">
          <label class="font-semibold text-sm">Imagenes</label>
          <div v-if="formImages.length" class="grid grid-cols-3 gap-2">
            <div v-for="imageId in formImages" :key="imageId" class="relative aspect-square rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
              <img :src="getImageUrl(imageId)" class="w-full h-full object-cover" alt="Imagen del accesorio" />
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

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="selectedAccesorios.length > 1">Seguro que deseas eliminar los <strong>{{ selectedAccesorios.length }}</strong> {{ systemMode.isGeneralStore ? 'productos' : 'accesorios' }} seleccionados?</span>
        <span v-else>Seguro que deseas eliminar <strong>{{ selectedAccesorio?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="selectedAccesorios.length > 1 ? borrarMultiple() : borrar()" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogEtiquetaProducto" header="Imprimir Etiqueta de Producto" modal :style="{ width: '34rem' }">
      <div class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 bg-surface-50 dark:bg-surface-800/60">
          <p class="text-sm font-semibold">{{ productoEtiqueta?.nombre || 'Sin producto' }}</p>
          <p class="text-xs text-surface-500">Precio: RD$ {{ Number(productoEtiqueta?.precio_venta || 0).toFixed(2) }}</p>
          <p class="text-xs text-surface-500">Codigo: {{ generarCodigoProducto(productoEtiqueta) || '-' }}</p>
        </div>

        <div class="grid grid-cols-3 gap-3 items-end">
          <div class="col-span-2">
            <label class="text-sm font-semibold block mb-1">Impresora</label>
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
          <div>
            <label class="text-sm font-semibold block mb-1">Copias</label>
            <InputNumber v-model="copias" :min="1" :max="99" class="w-full" fluid />
          </div>
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold">Plantilla</label>
          <div class="relative">
            <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
            <InputText v-model="busquedaPlantilla" placeholder="Buscar plantilla..." fluid class="!pl-8 h-9 text-sm" />
          </div>
          <p class="text-xs text-surface-400">Usa variables como <strong>{producto}</strong>, <strong>{precio}</strong> y <strong>{codigo_barra}</strong> en Inventario &gt; Etiquetas.</p>
          <div v-if="plantillasFiltradas.length === 0" class="text-center py-4 text-surface-400 text-sm">{{ busquedaPlantilla ? 'Sin resultados' : 'No hay plantillas. Crea una en Inventario > Etiquetas.' }}</div>
          <div v-else class="flex flex-col gap-2 max-h-44 overflow-y-auto">
            <div
              v-for="p in plantillasFiltradas"
              :key="p.id"
              class="flex items-center justify-between p-3 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 hover:bg-surface-50 dark:hover:bg-surface-700/30 transition-all cursor-pointer"
              @click="imprimirEtiquetaProducto(p)"
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
        <Button label="Cancelar" severity="secondary" text @click="dialogEtiquetaProducto = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevaCategoria" header="Nueva Categoria" modal :style="{ width: '24rem' }">
      <div class="flex flex-col gap-3 pt-2">
        <label class="text-sm font-medium">Nombre</label>
        <InputText v-model="nuevaCategoria" placeholder="Nombre de la categoria" fluid class="uppercase" style="text-transform: uppercase;" @keyup.enter="crearCategoria" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevaCategoria = false" />
        <Button label="Crear" icon="pi pi-check" :disabled="!nuevaCategoria.trim()" @click="crearCategoria" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogAjustarPrecios" header="Ajustar precios de venta" modal :style="{ width: 'min(46rem, 94vw)' }" :closable="!guardandoPrecios">
      <div class="space-y-4 pt-2">
        <div class="grid grid-cols-2 gap-2 rounded-xl bg-surface-100 dark:bg-surface-800 p-1">
          <Button label="Por porcentaje" icon="pi pi-percentage" :severity="modoAjustePrecio === 'porcentaje' ? 'primary' : 'secondary'" :text="modoAjustePrecio !== 'porcentaje'" @click="modoAjustePrecio = 'porcentaje'" />
          <Button label="Precio fijo manual" icon="pi pi-pencil" :severity="modoAjustePrecio === 'manual' ? 'primary' : 'secondary'" :text="modoAjustePrecio !== 'manual'" @click="modoAjustePrecio = 'manual'" />
        </div>

        <p class="text-sm text-surface-500">
          Se actualizarán los {{ accesorios.length }} {{ systemMode.isGeneralStore ? 'productos' : 'accesorios' }} visibles del {{ verTodosAlmacenes ? 'conjunto de todos los almacenes' : 'almacén activo' }}.
        </p>

        <div class="space-y-1.5">
          <label class="text-sm font-medium">Aplicar a</label>
          <Select
            v-model="alcanceAjustePrecio"
            :options="[
              { label: `Todos (${accesorios.length})`, value: 'todos' },
              { label: `Solo seleccionados (${selectedAccesorios.length})`, value: 'seleccionados', disabled: selectedAccesorios.length === 0 },
            ]"
            optionLabel="label"
            optionValue="value"
            optionDisabled="disabled"
            fluid
          />
          <p class="text-xs text-surface-500">Se modificarán <strong>{{ accesoriosObjetivoPrecio.length }}</strong> registro(s).</p>
        </div>

        <div class="flex flex-wrap gap-3">
          <label class="flex flex-1 min-w-48 items-center justify-between gap-3 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer">
            <span class="text-sm font-medium">Afectar precio mínimo</span>
            <ToggleSwitch v-model="afectarPrecioMin" />
          </label>
          <label class="flex flex-1 min-w-48 items-center justify-between gap-3 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer">
            <span class="text-sm font-medium">Afectar precio al por mayor</span>
            <ToggleSwitch v-model="afectarPrecioMayor" />
          </label>
        </div>

        <div v-if="modoAjustePrecio === 'porcentaje'" class="grid sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-sm font-medium">Operación</label>
            <Select v-model="direccionPorcentaje" :options="[{ label: 'Aumentar', value: 'aumentar' }, { label: 'Disminuir', value: 'disminuir' }]" optionLabel="label" optionValue="value" fluid />
          </div>
          <div class="space-y-1.5">
            <label class="text-sm font-medium">Porcentaje</label>
            <InputNumber v-model="porcentajePrecio" suffix=" %" :min="0.01" :max="100" :minFractionDigits="0" :maxFractionDigits="2" fluid @keyup.enter="guardarAjustePrecios" />
          </div>
          <div class="sm:col-span-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">
            Ejemplo: un precio de {{ $formatMoney(1000) }} quedará en
            <strong>{{ $formatMoney(direccionPorcentaje === 'aumentar' ? 1000 * (1 + Number(porcentajePrecio || 0) / 100) : 1000 * (1 - Number(porcentajePrecio || 0) / 100)) }}</strong>.
          </div>
        </div>

        <DataTable v-else :value="accesoriosObjetivoPrecio" scrollable scrollHeight="24rem" stripedRows size="small" dataKey="id">
          <Column field="nombre" header="Nombre" />
          <Column header="Precio actual" style="width: 9rem">
            <template #body="{ data }">{{ $formatMoney(data.precio_venta || 0) }}</template>
          </Column>
          <Column header="Nuevo precio fijo" style="width: 13rem">
            <template #body="{ data }">
              <InputNumber v-model="preciosManuales[Number(data.id)]" mode="currency" :currency="systemCurrency" :locale="systemLocale" :min="0" fluid @focus="(e) => e.target.select()" />
            </template>
          </Column>
          <Column v-if="afectarPrecioMin" header="Nuevo mínimo" style="width: 13rem">
            <template #body="{ data }">
              <InputNumber v-model="preciosMinManuales[Number(data.id)]" mode="currency" :currency="systemCurrency" :locale="systemLocale" :min="0" fluid @focus="(e) => e.target.select()" />
            </template>
          </Column>
          <Column v-if="afectarPrecioMayor" header="Nuevo por mayor" style="width: 13rem">
            <template #body="{ data }">
              <InputNumber v-model="preciosMayorManuales[Number(data.id)]" mode="currency" :currency="systemCurrency" :locale="systemLocale" :min="0" fluid @focus="(e) => e.target.select()" />
            </template>
          </Column>
        </DataTable>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="guardandoPrecios" @click="dialogAjustarPrecios = false" />
        <Button label="Guardar precios" icon="pi pi-check" :loading="guardandoPrecios" :disabled="modoAjustePrecio === 'porcentaje' && Number(porcentajePrecio || 0) <= 0" @click="guardarAjustePrecios" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevaMarca" header="Nueva Marca" modal :style="{ width: '24rem' }">
      <div class="flex flex-col gap-3 pt-2">
        <label class="text-sm font-medium">Nombre</label>
        <InputText v-model="nuevaMarca" placeholder="Nombre de la marca" fluid class="uppercase" style="text-transform: uppercase;" @keyup.enter="crearMarca" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevaMarca = false" />
        <Button label="Crear" icon="pi pi-check" :disabled="!nuevaMarca.trim()" @click="crearMarca" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogCambioProveedorMulti" header="Cambiar Proveedor" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Asignar proveedor a <strong>{{ selectedAccesorios.length }}</strong> {{ systemMode.isGeneralStore ? 'producto(s)' : 'accesorio(s)' }}:</p>
        <div class="flex gap-2">
          <Select v-model="proveedorMultiSel" :options="proveedores" optionLabel="nombre" placeholder="Seleccionar proveedor..." class="flex-1" fluid>
            <template #value="{ value }">
              <span v-if="value" class="text-sm">{{ value.nombre }}</span>
              <span v-else class="text-sm text-surface-400">Seleccionar...</span>
            </template>
          </Select>
          <Button icon="pi pi-plus" severity="info" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCambioProveedorMulti = false" />
        <Button label="Aplicar" icon="pi pi-check" :disabled="!proveedorMultiSel" @click="aplicarCambioProveedorMulti" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogMoverAlmacenMulti" header="Cambiar Almacen" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedAccesorios.length }}</strong> {{ systemMode.isGeneralStore ? 'producto(s)' : 'accesorio(s)' }} a otro almacen:</p>
        <Select v-model="almacenDestinoMulti" :options="almacenesDestinoMulti" optionLabel="nombre" placeholder="Seleccionar almacen destino..." fluid />
        <p v-if="almacenesDestinoMulti.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para el traslado.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacenMulti" @click="dialogMoverAlmacenMulti = false" />
        <Button label="Aplicar" icon="pi pi-warehouse" :loading="moviendoAlmacenMulti" :disabled="!almacenDestinoMulti" @click="aplicarMoverAlmacenMulti" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevoProveedor" header="Nuevo Proveedor" modal :style="{ width: '26rem' }">
      <div class="flex flex-col gap-3 pt-2">
        <div class="space-y-1">
          <label class="text-sm font-medium">Nombre <span class="text-red-400">*</span></label>
          <InputText v-model="nuevoProveedor.nombre" placeholder="Nombre del proveedor" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div class="space-y-1">
            <label class="text-sm font-medium">Telefono</label>
            <InputText v-model="nuevoProveedor.telefono" placeholder="Telefono" fluid />
          </div>
          <div class="space-y-1">
            <label class="text-sm font-medium">Direccion</label>
            <InputText v-model="nuevoProveedor.direccion" placeholder="Direccion" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevoProveedor = false" />
        <Button label="Crear y Seleccionar" icon="pi pi-check" :disabled="!nuevoProveedor.nombre.trim()" @click="crearProveedor" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogAgregarStock" header="Agregar Stock" modal :style="{ width: 'min(24rem, 92vw)' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="bg-surface-50 dark:bg-surface-800 rounded-lg p-3 flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" style="background:var(--p-primary-500)">{{ accesorioStock?.nombre?.charAt(0) || 'A' }}</div>
          <div>
            <div class="font-semibold">{{ accesorioStock?.nombre }}</div>
            <div class="text-xs text-surface-400">Stock actual: <strong>{{ accesorioStock?.cantidad || 0 }}</strong></div>
          </div>
        </div>
        <InputNumber v-model="stockCantidad" :min="1" placeholder="Cantidad a agregar" class="w-full text-center text-2xl font-bold" fluid @input="actualizarStockCantidad" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogAgregarStock = false" />
        <Button label="Agregar" icon="pi pi-plus" :disabled="!stockCantidad || stockCantidad <= 0" @click="aplicarAgregarStock" />
      </template>
    </Dialog>
  </div>
</template>
