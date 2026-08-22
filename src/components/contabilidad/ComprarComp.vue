<script setup lang="ts">
import { getSystemCurrencyCode, getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Calendar from 'primevue/calendar'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import Swal from 'sweetalert2'
import { useSystemModeStore } from '@/stores/systemMode'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const systemMode = useSystemModeStore()
const { addAlmacenId, filterByAlmacen } = useAlmacenFilter()
const dialogNuevoProveedor = ref(false)
const nuevoProveedor = ref({ nombre: '', telefono: '', email: '', direccion: '' })


const proveedores = ref<any[]>([])
const telefonos = ref<any[]>([])
const accesorios = ref<any[]>([])
const electrodomesticos = ref<any[]>([])
const marcas = ref<any[]>([])
const categorias = ref<any[]>([])

const form = ref({
  fecha: new Date(),
  proveedor_id: null as number | null,
  proveedor_nombre: '',
  no_factura: '',
  nota: '',
})

const busqueda = ref('')
const imeiData = ref({ nombre: '', color: '', capacidad: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0 })
const accSearch = ref('')
const accCantidad = ref(1)
const accNuevo = ref({ nombre: '', costo: 0, precio_venta: 0, cantidad: 1, marca: null as number | null, categoria: null as number | null })
const elecSearch = ref('')
const serialData = ref({ nombre: '', id_equi: null as number | null, equipo_uid: '', electrodomestico_nombre: '', color: '', capacidad: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0 })

const modo = ref<'registrar' | 'historial'>('registrar')
const historialCompras = ref<any[]>([])
const compraExpandida = ref<any>(null)
const historialLoading = ref(false)
const historialBusqueda = ref('')
const historialFiltro = ref('')

const historialFiltrado = computed(() => {
  let data = historialCompras.value
  const texto = historialBusqueda.value.toLowerCase().trim()
  if (texto) {
    data = data.filter(c =>
      c.no_compra?.toLowerCase().includes(texto) ||
      c.proveedor?.toLowerCase().includes(texto)
    )
  }
  if (historialFiltro.value) {
    data = data.filter(c => c.proveedor === historialFiltro.value)
  }
  return data
})

const proveedoresUnicos = computed(() => {
  const set = new Set(historialCompras.value.map(c => c.proveedor).filter(Boolean))
  return Array.from(set).sort()
})

async function cargarHistorial() {
  historialLoading.value = true
  try {
    const [resImei, resSerial, resAcc] = await Promise.all([
      window.db.getAll('imei'),
      window.db.getAll('serial'),
      window.db.getAll('accesorios'),
    ])
    const items: any[] = []
    if (systemMode.isCellphoneStore && resImei.success) for (const i of filterByAlmacen(resImei.data || [])) items.push({ ...i, _tipo: 'IMEI' })
    if (resSerial.success) for (const s of filterByAlmacen(resSerial.data || [])) items.push({ ...s, _tipo: 'SERIAL' })
    if (resAcc.success) for (const a of filterByAlmacen(resAcc.data || [])) {
      if (a.no_compra) items.push({ ...a, _tipo: 'ACC', nombre: a.nombre, color: '', capacidad: '' })
    }
    const grouped: Record<string, any> = {}
    for (const item of items) {
      const key = item.no_compra || 'S/N'
      if (!grouped[key]) {
        const prov = item.proveedor || ''
        grouped[key] = { no_compra: key, proveedor: prov, items: [], total: 0, fecha: item.created_at || '' }
      }
      const g = grouped[key]
      g.items.push(item)
      g.total += Number(item.costo || 0)
      if (!g.fecha || item.created_at < g.fecha) g.fecha = item.created_at || g.fecha
      if (item.proveedor) g.proveedor = item.proveedor
    }
    historialCompras.value = Object.values(grouped).sort((a: any, b: any) => (b.fecha || '').localeCompare(a.fecha || ''))
  } catch (_) {}
  historialLoading.value = false
}

function buildCompraHtml(compra: any, empresa: any): string {
  const logo = String(empresa?.logoprinter || empresa?.logo || '').trim()
  const ahora = new Date()
  const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  const itemsHtml = (compra.items || []).map((item: any, i: number) => `
    <tr>
      <td class="text-center">${i + 1}</td>
      <td><span class="tag ${item._tipo === 'IMEI' ? 'tag-info' : item._tipo === 'SERIAL' ? 'tag-warn' : 'tag-success'}">${item._tipo || '-'}</span></td>
      <td>${item.nombre || '--'}</td>
      <td>${item.color || '--'}</td>
      <td>${item.capacidad || '--'}</td>
      <td class="text-right">${getSystemCurrencyCode()} ${formatCurrency(item.costo)}</td>
    </tr>
  `).join('')
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Compra ${compra.no_compra || ''}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: letter; margin: 10mm; }
    body { margin: 0; background: #fff; color: #111827; font-family: Arial, Helvetica, sans-serif; font-size: 12px; }
    .page { width: 100%; max-width: 720px; margin: 0 auto; padding: 20px; }
    .header { text-align: center; margin-bottom: 16px; }
    .header img { max-width: 120px; max-height: 70px; object-fit: contain; margin-bottom: 6px; }
    .header h1 { margin: 0; font-size: 22px; color: #175C8A; }
    .header p { margin: 2px 0; font-size: 11px; color: #555; }
    .title { text-align: center; font-size: 16px; font-weight: 700; margin: 16px 0; padding: 8px; background: #175C8A; color: #fff; border-radius: 6px; }
    .info-box { border: 1px solid #d1d5db; border-radius: 8px; padding: 10px; margin-bottom: 14px; }
    .info-box p { margin: 3px 0; }
    .info-box .label { color: #6b7280; }
    table { width: 100%; border-collapse: collapse; }
    th { background: #f3f4f6; padding: 6px 8px; border-bottom: 2px solid #d1d5db; font-size: 10px; text-align: left; }
    td { padding: 5px 8px; border-bottom: 1px solid #e5e7eb; font-size: 11px; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .tag { display: inline-block; padding: 1px 6px; border-radius: 4px; font-size: 10px; font-weight: 600; }
    .tag-info { background: #dbeafe; color: #1d4ed8; }
    .tag-warn { background: #fef3c7; color: #d97706; }
    .tag-success { background: #d1fae5; color: #059669; }
    .total-row td { font-weight: 700; background: #f9fafb; border-top: 2px solid #d1d5db; font-size: 12px; }
    .footer { text-align: center; margin-top: 20px; font-size: 10px; color: #999; }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      ${logo ? `<img src="${logo}">` : `<h1>${empresa.nombre || 'MI EMPRESA'}</h1>`}
      <p>${empresa.legal || empresa.rnc ? `RNC: ${empresa.legal || empresa.rnc}` : ''}</p>
      <p>${empresa.telefono ? `Tel: ${empresa.telefono}` : ''} ${empresa.email ? ` | Email: ${empresa.email}` : ''}</p>
      <p>${empresa.direccion || ''}</p>
    </div>

    <div class="title">REGISTRO DE COMPRA</div>

    <div class="info-box">
      <p><span class="label">No. Factura:</span> ${compra.no_compra || 'S/N'}</p>
      <p><span class="label">Proveedor:</span> ${compra.proveedor || 'SIN REGISTRO'}</p>
      <p><span class="label">Fecha:</span> ${compra.fecha ? formatFecha(compra.fecha.split('T')[0]) : '--'}</p>
      <p><span class="label">Total Items:</span> ${(compra.items || []).length}</p>
    </div>

    <table>
      <thead>
        <tr><th class="text-center">#</th><th style="width:5rem">Tipo</th><th>Nombre / Serial</th><th>Color</th><th>Capacidad</th><th class="text-right">Costo</th></tr>
      </thead>
      <tbody>
        ${itemsHtml}
        <tr class="total-row">
          <td colspan="5" class="text-right">TOTAL:</td>
          <td class="text-right">${getSystemCurrencyCode()} ${formatCurrency(compra.total)}</td>
        </tr>
      </tbody>
    </table>

    <div class="footer">Generado el ${fecha} | TM POS</div>
  </div>
</body>
</html>`
}

async function generarPdfCompra(compra: any) {
  generandoPdf.value = true
  try {
    let empresa: any = {}
    try {
      const res = await window.db.getAll('empresa')
      if (res.success && res.data?.length) empresa = res.data[0]
    } catch {}
    const html = buildCompraHtml(compra, empresa)
    const nombre = `Compra_${compra.no_compra || 'sin_factura'}.pdf`
    const res = await window.electron.invoke('generate:pdf', html, nombre) as { success: boolean; dataUrl?: string; error?: string }
    if (res.success && res.dataUrl) {
      const resp = await fetch(res.dataUrl)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const result = await Swal.fire({
        title: `Compra #${compra.no_compra || ''}`,
        html: `<iframe src="${url}" style="width:100%;height:75vh;border:0;border-radius:6px;background:#fff"></iframe>`,
        width: '90vw',
        padding: '1rem',
        showCancelButton: true,
        confirmButtonText: 'Descargar PDF',
        cancelButtonText: 'Cerrar',
        focusConfirm: false,
        customClass: { popup: 'swal-pdf-popup' },
      })
      if (result.isConfirmed) {
        const resp2 = await fetch(url)
        const blob2 = await resp2.blob()
        const buffer = await blob2.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        const dataUrl = `data:application/pdf;base64,${btoa(binary)}`
        const saveRes = await window.electron.invoke('save:pdf', dataUrl, nombre) as { success: boolean; error?: string }
        if (saveRes.success) toast.add({ severity: 'success', summary: 'Guardado', detail: 'PDF descargado', life: 2000 })
        else toast.add({ severity: 'error', summary: 'Error', detail: saveRes.error || 'No se pudo guardar', life: 3000 })
      }
      URL.revokeObjectURL(url)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar el PDF', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al generar PDF', life: 3000 })
  } finally {
    generandoPdf.value = false
  }
}

watch(() => form.value.proveedor_id, (id) => {
  if (id) {
    const prov = proveedores.value.find(p => p.id === id)
    form.value.proveedor_nombre = prov?.nombre || ''
  } else {
    form.value.proveedor_nombre = ''
  }
})

const generandoPdf = ref(false)
const cart = ref<any[]>([])
const cargando = ref(false)

const productosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return telefonos.value
  return telefonos.value.filter((t: any) => t.nombre?.toLowerCase().includes(texto))
})

const accFiltrados = computed(() => {
  const texto = accSearch.value.toLowerCase().trim()
  if (!texto) return accesorios.value
  return accesorios.value.filter((a: any) =>
    a.nombre?.toLowerCase().includes(texto) ||
    a.marca_nombre?.toLowerCase().includes(texto)
  )
})

const elecFiltrados = computed(() => {
  const texto = elecSearch.value.toLowerCase().trim()
  if (!texto) return electrodomesticos.value
  return electrodomesticos.value.filter((e: any) => e.nombre?.toLowerCase().includes(texto))
})

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const d = new Date(fechaStr)
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

async function cargarDatos() {
  const [resProv, resTel, resAcc, resElec, resMar, resCat] = await Promise.all([
    window.db.getAll('proveedores'),
    window.db.getAll('telefonos'),
    window.db.getAll('accesorios'),
    window.db.getAll('electrodomesticos'),
    window.db.getAll('marcas'),
    window.db.getAll('categorias'),
  ])
  if (resProv.success) {
    proveedores.value = filterByAlmacen(resProv.data || [])
    const defProv = proveedores.value.find((p: any) => p.id === form.value.proveedor_id)
    if (!defProv) form.value.proveedor_id = null
  }
  if (resTel.success) telefonos.value = filterByAlmacen(resTel.data || [])
  if (resAcc.success) accesorios.value = filterByAlmacen(resAcc.data || [])
  if (resElec.success) electrodomesticos.value = filterByAlmacen(resElec.data || [])
  if (resMar.success) marcas.value = resMar.data || []
  if (resCat.success) categorias.value = resCat.data || []

  const marcasMap = new Map(marcas.value.map((m: any) => [m.id, m.nombre]))
  const catsMap = new Map(categorias.value.map((c: any) => [c.id, c.nombre]))
  accesorios.value = accesorios.value.map((a: any) => ({
    ...a,
    marca_nombre: marcasMap.get(a.marca) || '',
    categoria_nombre: catsMap.get(a.categoria) || '',
  }))
}

function agregarImeiAlCarrito() {
  if (!imeiData.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'IMEI requerido', detail: 'Ingresa el numero IMEI', life: 2000 })
    return
  }
  cart.value.push({
    tipo: 'imei',
    imei: imeiData.value.nombre.trim(),
    telefono_nombre: busqueda.value.trim().toUpperCase() || 'SIN MODELO',
    color: imeiData.value.color.trim().toUpperCase(),
    capacidad: imeiData.value.capacidad.trim().toUpperCase(),
    costo: imeiData.value.costo,
    precio_venta: imeiData.value.precio_venta,
    precio_min: imeiData.value.precio_min,
    precio_xmayor: imeiData.value.precio_xmayor,
    proveedor: form.value.proveedor_nombre || '',
    no_compra: form.value.no_factura || '',
  })
  imeiData.value = { nombre: '', color: '', capacidad: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0 }
  toast.add({ severity: 'success', summary: 'Agregado', detail: 'IMEI agregado a la compra', life: 2000 })
}

function agregarAccAlCarrito(acc: any) {
  const existente = cart.value.find((item: any) => item.tipo === 'accesorio' && item.accesorio_id === acc.id)
  if (existente) {
    existente.cantidad += accCantidad.value
  } else {
    cart.value.push({
      tipo: 'accesorio',
      accesorio_id: acc.id,
      nombre: acc.nombre,
      costo: acc.costo || 0,
      precio_venta: acc.precio_venta || 0,
      stock_actual: acc.cantidad || 0,
      cantidad: accCantidad.value,
    })
  }
  toast.add({ severity: 'success', summary: 'Agregado', detail: `${acc.nombre} x${accCantidad.value}`, life: 2000 })
}

function agregarAccNuevoAlCarrito() {
  if (!accNuevo.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Nombre requerido', detail: 'Ingresa el nombre del accesorio', life: 2000 })
    return
  }
  cart.value.push({
    tipo: 'accesorio_nuevo',
    nombre: accNuevo.value.nombre.trim().toUpperCase(),
    costo: accNuevo.value.costo,
    precio_venta: accNuevo.value.precio_venta,
    cantidad: accNuevo.value.cantidad,
    marca: accNuevo.value.marca,
    categoria: accNuevo.value.categoria,
  })
  accNuevo.value = { nombre: '', costo: 0, precio_venta: 0, cantidad: 1, marca: null, categoria: null }
  toast.add({ severity: 'success', summary: 'Agregado', detail: 'Nuevo accesorio agregado a la compra', life: 2000 })
}

function agregarSerialAlCarrito() {
  if (!serialData.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Serial requerido', detail: 'Ingresa el numero de serial', life: 2000 })
    return
  }
  if (!serialData.value.id_equi) {
    toast.add({ severity: 'warn', summary: 'Modelo requerido', detail: 'Selecciona o busca un modelo de electrodomestico', life: 2000 })
    return
  }
  cart.value.push({
    tipo: 'serial',
    serial: serialData.value.nombre.trim(),
    id_equi: serialData.value.id_equi,
    equipo_uid: serialData.value.equipo_uid,
    electrodomestico_nombre: serialData.value.electrodomestico_nombre,
    color: serialData.value.color.trim().toUpperCase(),
    capacidad: serialData.value.capacidad.trim().toUpperCase(),
    costo: serialData.value.costo,
    precio_venta: serialData.value.precio_venta,
    precio_min: serialData.value.precio_min,
    precio_xmayor: serialData.value.precio_xmayor,
    proveedor: form.value.proveedor_nombre || '',
    no_compra: form.value.no_factura || '',
  })
  serialData.value = { nombre: '', id_equi: null, equipo_uid: '', electrodomestico_nombre: '', color: '', capacidad: '', costo: 0, precio_venta: 0, precio_min: 0, precio_xmayor: 0 }
  elecSearch.value = ''
  toast.add({ severity: 'success', summary: 'Agregado', detail: 'Serial agregado a la compra', life: 2000 })
}

function quitarDelCarrito(index: number) {
  cart.value.splice(index, 1)
}

const totalCompra = computed(() =>
  cart.value.reduce((sum, item) => {
    if (item.tipo === 'imei' || item.tipo === 'serial') return sum + (item.costo || 0)
    return sum + ((item.costo || 0) * (item.cantidad || 1))
  }, 0)
)

async function completarCompra() {
  if (cart.value.length === 0) {
    toast.add({ severity: 'warn', summary: 'Carrito vacio', detail: 'Agrega productos a la compra', life: 3000 })
    return
  }
  cargando.value = true
  let ok = 0
  let errors: string[] = []
  try {
    for (const item of cart.value) {
      if (item.tipo === 'imei') {
        const res = await window.db.insert('imei', addAlmacenId({
          nombre: item.imei,
          id_equi: null,
          costo: item.costo,
          precio_venta: item.precio_venta,
          precio_min: item.precio_min,
          precio_xmayor: item.precio_xmayor,
          color: item.color,
          capacidad: item.capacidad,
          estado: 'DISPONIBLE',
          proveedor: item.proveedor,
          no_compra: item.no_compra,
        }))
        if (res.success) ok++
        else errors.push(`IMEI ${item.imei}: ${res.error}`)
      } else if (item.tipo === 'serial') {
        const res = await window.db.insert('serial', addAlmacenId({
          nombre: item.serial,
          id_equi: item.id_equi,
          equipo_uid: item.equipo_uid || '',
          equipo: item.electrodomestico_nombre || '',
          costo: item.costo,
          precio_venta: item.precio_venta,
          precio_min: item.precio_min,
          precio_xmayor: item.precio_xmayor,
          color: item.color,
          capacidad: item.capacidad,
          estado: 'DISPONIBLE',
          proveedor: item.proveedor,
          no_compra: item.no_compra,
        }))
        if (res.success) ok++
        else errors.push(`Serial ${item.serial}: ${res.error}`)
      } else if (item.tipo === 'accesorio') {
        const acc = accesorios.value.find((a: any) => a.id === item.accesorio_id)
        if (acc) {
          const nuevoStock = (acc.cantidad || 0) + item.cantidad
          const res = await window.db.update('accesorios', item.accesorio_id, {
            cantidad: nuevoStock,
            no_compra: item.no_compra || form.value.no_factura || '',
            proveedor_id: form.value.proveedor_id || 0,
          })
          if (res.success) { acc.cantidad = nuevoStock; ok++ }
          else errors.push(`Stock ${item.nombre}: ${res.error}`)
        }
      } else if (item.tipo === 'accesorio_nuevo') {
        const res = await window.db.insert('accesorios', addAlmacenId({
          nombre: item.nombre,
          costo: item.costo,
          precio_venta: item.precio_venta,
          cantidad: item.cantidad,
          alerta: 10,
          marca: item.marca,
          categoria: item.categoria,
          no_compra: form.value.no_factura || '',
          proveedor_id: form.value.proveedor_id || 0,
        }))
        if (res.success) ok++
        else errors.push(`Accesorio ${item.nombre}: ${res.error}`)
      }
    }
    if (ok > 0) {
      toast.add({ severity: 'success', summary: 'Compra registrada', detail: `${ok} producto(s) procesados`, life: 3000 })
  cart.value = []
  await cargarDatos()
}

async function guardarNuevoProveedor() {
  if (!nuevoProveedor.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Nombre requerido', detail: 'El nombre del proveedor es obligatorio', life: 2000 })
    return
  }
  try {
    const data = {
      nombre: nuevoProveedor.value.nombre.trim().toUpperCase(),
      telefono: nuevoProveedor.value.telefono.trim(),
      email: nuevoProveedor.value.email.trim().toLowerCase(),
      direccion: nuevoProveedor.value.direccion.trim().toUpperCase(),
    }
    const res = await window.db.insert('proveedores', addAlmacenId(data))
    if (res.success) {
      const nuevo = { id: res.data.id, ...data }
      proveedores.value.unshift(nuevo)
      form.value.proveedor_id = res.data.id
      dialogNuevoProveedor.value = false
      toast.add({ severity: 'success', summary: 'Proveedor creado', detail: data.nombre, life: 2000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}
    for (const e of errors.slice(0, 3)) toast.add({ severity: 'error', summary: 'Error', detail: e, life: 4000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    cargando.value = false
  }
}

watch(modo, (m) => { if (m === 'historial') cargarHistorial() })
onMounted(cargarDatos)
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-5">
      <div class="flex items-center justify-between pb-2 border-b border-surface-200/50 dark:border-surface-700/30">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <i class="pi pi-shopping-bag text-primary text-lg"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold">Compras</h2>
            <p class="text-sm text-surface-500">Registro de compras a suplidores</p>
          </div>
        </div>
        <div class="flex items-center gap-1 rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
          <button
            class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer"
            :class="modo === 'registrar' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
            @click="modo = 'registrar'"
          ><i class="pi pi-plus-circle mr-1"></i>Registrar</button>
          <button
            class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-surface-200 dark:border-surface-700"
            :class="modo === 'historial' ? 'bg-primary text-primary-contrast' : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
            @click="modo = 'historial'"
          ><i class="pi pi-history mr-1"></i>Historial</button>
        </div>
      </div>

      <div v-if="modo === 'registrar'" class="rounded-xl border border-surface-200/50 dark:border-surface-700/30 bg-surface-0 dark:bg-surface-800 p-4 space-y-3">
        <div class="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <div class="space-y-1">
            <label class="text-xs font-semibold text-surface-500">Fecha</label>
            <Calendar v-model="form.fecha" dateFormat="dd/mm/yy" fluid showIcon />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold text-surface-500">Proveedor</label>
            <div class="flex gap-2">
              <Select v-model="form.proveedor_id" :options="proveedores" optionLabel="nombre" optionValue="id" placeholder="Seleccionar..." class="flex-1" fluid />
              <Button icon="pi pi-plus" severity="success" text rounded size="small" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
            </div>
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold text-surface-500">No. Factura</label>
            <InputText v-model="form.no_factura" placeholder="Factura del proveedor" fluid class="text-sm" />
          </div>
          <div class="space-y-1">
            <label class="text-xs font-semibold text-surface-500">Nota</label>
            <InputText v-model="form.nota" placeholder="Opcional" fluid class="text-sm" />
          </div>
        </div>
      </div>

      <div v-if="modo === 'registrar'" class="grid grid-cols-1 xl:grid-cols-[1fr_380px] gap-4">
        <div class="rounded-xl border border-surface-200/50 dark:border-surface-700/30 bg-surface-0 dark:bg-surface-800 p-4">
          <TabView>
            <TabPanel v-if="systemMode.isCellphoneStore" header="Celulares (IMEI)">
              <div class="space-y-3">
                <div class="relative">
                  <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
                  <InputText v-model="busqueda" placeholder="Buscar modelo de telefono..." fluid class="!pl-8 h-9 text-sm" />
                </div>
                <div v-if="busqueda && productosFiltrados.length > 0" class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  <button
                    v-for="t in productosFiltrados" :key="t.id"
                    class="text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer"
                    :class="busqueda.trim().toUpperCase() === t.nombre ? 'bg-primary text-primary-contrast border-primary' : 'border-surface-200 dark:border-surface-600 hover:border-primary-300'"
                    @click="busqueda = t.nombre"
                  >{{ t.nombre }}</button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label class="text-xs font-medium">IMEI <span class="text-red-400">*</span></label>
                    <InputText v-model="imeiData.nombre" placeholder="Numero IMEI" fluid class="text-sm" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Color</label>
                    <InputText v-model="imeiData.color" placeholder="Color" fluid class="text-sm" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Capacidad</label>
                    <InputText v-model="imeiData.capacidad" placeholder="Ej: 128GB" fluid class="text-sm" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Costo (RD$)</label>
                    <InputNumber v-model="imeiData.costo" :min="0" fluid class="text-sm" @focus="(e) => e.target.select()" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Precio Venta</label>
                    <InputNumber v-model="imeiData.precio_venta" :min="0" fluid class="text-sm" @focus="(e) => e.target.select()" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Precio Min</label>
                    <InputNumber v-model="imeiData.precio_min" :min="0" fluid class="text-sm" @focus="(e) => e.target.select()" />
                  </div>
                </div>
                <Button label="Agregar IMEI a la Compra" icon="pi pi-plus" class="w-full" size="small" @click="agregarImeiAlCarrito" />
              </div>
            </TabPanel>

            <TabPanel :header="systemMode.productLabel">
              <div class="space-y-3">
                <div class="relative">
                  <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
                  <InputText v-model="accSearch" :placeholder="systemMode.isGeneralStore ? 'Buscar producto existente...' : 'Buscar accesorio existente...'" fluid class="!pl-8 h-9 text-sm" />
                </div>
                <div v-if="accSearch && accFiltrados.length > 0" class="flex flex-col gap-1 max-h-40 overflow-y-auto">
                  <div
                    v-for="acc in accFiltrados" :key="acc.id"
                    class="flex items-center justify-between p-2 rounded-lg border border-surface-200 dark:border-surface-600 hover:border-primary-300 cursor-pointer transition-colors"
                    @click="agregarAccAlCarrito(acc)"
                  >
                    <div class="min-w-0 text-sm">
                      <p class="font-medium truncate">{{ acc.nombre }}</p>
                      <p class="text-xs text-surface-400 truncate">{{ acc.marca_nombre }} | Stock: {{ acc.cantidad || 0 }} | Costo: {{ $formatMoney(acc.costo) }}</p>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                      <InputNumber v-model="accCantidad" :min="1" class="w-16 text-xs" fluid @click.stop @focus="(e) => e.target.select()" />
                      <i class="pi pi-plus-circle text-primary text-lg cursor-pointer" @click.stop="agregarAccAlCarrito(acc)"></i>
                    </div>
                  </div>
                </div>
                <div class="border-t border-surface-200/50 dark:border-surface-700/30 pt-3">
                  <p class="text-xs font-semibold text-surface-500 mb-2">O crear {{ systemMode.isGeneralStore ? 'un nuevo producto' : 'un nuevo accesorio' }}:</p>
                  <div class="grid grid-cols-2 gap-2">
                    <div class="space-y-1 col-span-2">
                      <InputText v-model="accNuevo.nombre" :placeholder="systemMode.isGeneralStore ? 'Nombre del nuevo producto' : 'Nombre del nuevo accesorio'" fluid class="text-sm uppercase" style="text-transform: uppercase;" />
                    </div>
                    <div class="space-y-1">
                      <InputNumber v-model="accNuevo.costo" :min="0" placeholder="Costo" fluid class="text-sm" @focus="(e) => e.target.select()" />
                    </div>
                    <div class="space-y-1">
                      <InputNumber v-model="accNuevo.precio_venta" :min="0" placeholder="Precio venta" fluid class="text-sm" @focus="(e) => e.target.select()" />
                    </div>
                    <div class="space-y-1">
                      <InputNumber v-model="accNuevo.cantidad" :min="1" placeholder="Cantidad" fluid class="text-sm" @focus="(e) => e.target.select()" />
                    </div>
                    <div class="space-y-1">
                      <Select v-model="accNuevo.marca" :options="marcas" optionLabel="nombre" optionValue="id" placeholder="Marca" fluid class="text-sm" />
                    </div>
                  </div>
                  <Button :label="systemMode.isGeneralStore ? 'Agregar Nuevo Producto' : 'Agregar Nuevo Accesorio'" icon="pi pi-plus" class="w-full mt-2" size="small" severity="info" @click="agregarAccNuevoAlCarrito" />
                </div>
              </div>
            </TabPanel>

            <TabPanel header="Electrodomesticos (Serial)">
              <div class="space-y-3">
                <div class="relative">
                  <i class="pi pi-search absolute left-3 top-1/2 -translate-y-1/2 text-surface-400 text-xs"></i>
                  <InputText v-model="elecSearch" placeholder="Buscar modelo de electrodomestico..." fluid class="!pl-8 h-9 text-sm" />
                </div>
                <div v-if="elecSearch && elecFiltrados.length > 0" class="flex flex-wrap gap-1.5 max-h-28 overflow-y-auto">
                  <button
                    v-for="e in elecFiltrados" :key="e.id"
                    class="text-xs px-2 py-1 rounded-md border transition-colors cursor-pointer"
                    :class="serialData.id_equi === e.id ? 'bg-primary text-primary-contrast border-primary' : 'border-surface-200 dark:border-surface-600 hover:border-primary-300'"
            @click="serialData.id_equi = e.id; serialData.equipo_uid = e.uid || ''; serialData.electrodomestico_nombre = e.nombre; elecSearch = e.nombre"
                  >{{ e.nombre }}</button>
                </div>
                <div class="grid grid-cols-2 gap-2">
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Serial <span class="text-red-400">*</span></label>
                    <InputText v-model="serialData.nombre" placeholder="Numero de serial" fluid class="text-sm" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Color</label>
                    <InputText v-model="serialData.color" placeholder="Color" fluid class="text-sm" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Capacidad</label>
                    <InputText v-model="serialData.capacidad" placeholder="Ej: 220L" fluid class="text-sm" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Costo (RD$)</label>
                    <InputNumber v-model="serialData.costo" :min="0" fluid class="text-sm" @focus="(e) => e.target.select()" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Precio Venta</label>
                    <InputNumber v-model="serialData.precio_venta" :min="0" fluid class="text-sm" @focus="(e) => e.target.select()" />
                  </div>
                  <div class="space-y-1">
                    <label class="text-xs font-medium">Precio Min</label>
                    <InputNumber v-model="serialData.precio_min" :min="0" fluid class="text-sm" @focus="(e) => e.target.select()" />
                  </div>
                </div>
                <Button label="Agregar Serial a la Compra" icon="pi pi-plus" class="w-full" size="small" @click="agregarSerialAlCarrito" />
              </div>
            </TabPanel>
          </TabView>
        </div>

        <div class="rounded-xl border border-surface-200/50 dark:border-surface-700/30 bg-surface-0 dark:bg-surface-800 flex flex-col">
          <div class="flex items-center justify-between px-4 py-3 border-b border-surface-200/50 dark:border-surface-700/30">
            <div class="flex items-center gap-2">
              <i class="pi pi-shopping-cart text-primary text-sm"></i>
              <span class="font-bold text-sm">Carrito</span>
              <span class="text-xs text-surface-400">({{ cart.length }})</span>
            </div>
            <Button icon="pi pi-trash" severity="danger" text rounded size="small" :disabled="cart.length === 0" @click="cart = []" v-tooltip="'Limpiar'" />
          </div>
          <div v-if="cart.length === 0" class="flex flex-col items-center justify-center py-10 text-surface-300 gap-2">
            <i class="pi pi-shopping-cart text-2xl"></i>
            <span class="text-xs">Carrito vacio</span>
          </div>
          <div v-else class="flex flex-col gap-1.5 px-3 py-3 max-h-64 overflow-y-auto">
            <div v-for="(item, idx) in cart" :key="idx" class="flex items-start gap-2 p-2 rounded-lg bg-surface-50 dark:bg-surface-700/30 text-xs">
              <i :class="{'pi pi-mobile': item.tipo === 'imei', 'pi pi-sitemap': item.tipo === 'serial', 'pi pi-box': item.tipo === 'accesorio' || item.tipo === 'accesorio_nuevo'}" class="mt-0.5 text-primary text-xs"></i>
              <div class="flex-1 min-w-0">
                <p class="font-medium truncate">{{ item.tipo === 'imei' ? item.imei : item.tipo === 'serial' ? item.serial : item.nombre }}</p>
                <p v-if="item.tipo === 'imei'" class="text-[10px] text-surface-400 truncate">{{ item.telefono_nombre }} {{ item.color }} {{ item.capacidad }}</p>
                <p v-if="item.tipo === 'serial'" class="text-[10px] text-surface-400 truncate">{{ item.electrodomestico_nombre }} {{ item.color }} {{ item.capacidad }}</p>
                <div class="flex justify-between mt-0.5">
                  <span class="text-[10px] text-surface-400">{{ $formatMoney(item.costo) }}{{ item.cantidad ? ' x' + item.cantidad : '' }}</span>
                  <span class="font-semibold text-[10px]">{{ $formatMoney((item.tipo === 'imei' || item.tipo === 'serial') ? item.costo : (item.costo || 0) * (item.cantidad || 1)) }}</span>
                </div>
              </div>
              <button class="text-red-400 hover:text-red-600 cursor-pointer flex-shrink-0 mt-0.5" @click="quitarDelCarrito(idx)"><i class="pi pi-times text-[9px]"></i></button>
            </div>
          </div>
          <div class="mt-auto border-t border-surface-200/50 dark:border-surface-700/30 p-4 space-y-2">
            <div class="flex justify-between text-sm font-bold">
              <span>Total Compra</span>
              <span class="text-primary">{{ $formatMoney(totalCompra) }}</span>
            </div>
            <Button label="Completar Compra" icon="pi pi-check" class="w-full" :loading="cargando" :disabled="cart.length === 0" @click="completarCompra" />
          </div>
        </div>
      </div>
    </div>

    <div v-if="modo === 'historial'" class="space-y-4">
      <div class="flex items-center gap-2">
        <span class="p-input-icon-left flex-1">
          <i class="pi pi-search"></i>
          <InputText v-model="historialBusqueda" placeholder="Buscar por factura o proveedor..." fluid class="text-sm" />
        </span>
        <Select v-model="historialFiltro" :options="proveedoresUnicos" placeholder="Proveedor" clearable class="w-48" fluid />
        <Button icon="pi pi-refresh" severity="secondary" text @click="cargarHistorial" />
      </div>

      <DataTable
        :value="historialFiltrado"
        :loading="historialLoading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="no_compra"
        responsiveLayout="scroll"
      >
        <Column field="no_compra" header="No. Factura" sortable style="width: 10rem" />
        <Column field="proveedor" header="Proveedor" sortable />
        <Column field="fecha" header="Fecha" sortable style="width: 9rem">
          <template #body="{ data }">{{ formatFecha(data.fecha?.split('T')[0]) }}</template>
        </Column>
        <Column field="items" header="Items" style="width: 5rem">
          <template #body="{ data }">{{ data.items?.length || 0 }}</template>
        </Column>
        <Column field="total" header="Total Costo" sortable style="width: 10rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column header="" style="width: 7rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-file-pdf" severity="danger" text rounded size="small" :loading="generandoPdf" @click.stop="generarPdfCompra(data)" v-tooltip="'PDF'" />
              <Button
                :icon="compraExpandida?.no_compra === data.no_compra ? 'pi pi-chevron-up' : 'pi pi-chevron-down'"
                severity="secondary" text rounded size="small"
                @click.stop="compraExpandida = compraExpandida?.no_compra === data.no_compra ? null : data"
              />
            </div>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay compras registradas.</div>
        </template>
      </DataTable>

      <div v-if="compraExpandida" class="rounded-xl border border-surface-200/50 dark:border-surface-700/30 bg-surface-0 dark:bg-surface-800 overflow-hidden">
        <div class="px-4 py-2 bg-surface-50 dark:bg-surface-700/30 border-b border-surface-200/50 dark:border-surface-700/30 flex items-center justify-between">
          <span class="font-bold text-sm">Detalle - {{ compraExpandida.no_compra }}</span>
          <span class="text-xs text-surface-400">{{ compraExpandida.items?.length || 0 }} item(s) - Total: {{ $formatMoney(compraExpandida.total) }}</span>
        </div>
        <div class="p-3 max-h-72 overflow-y-auto">
          <table class="w-full text-xs">
            <thead>
              <tr class="border-b border-surface-200 dark:border-surface-700">
                <th class="text-left py-2 px-2">Tipo</th>
                <th class="text-left py-2 px-2">Serial / Nombre</th>
                <th class="text-left py-2 px-2">Color</th>
                <th class="text-left py-2 px-2">Capacidad</th>
                <th class="text-right py-2 px-2">Costo</th>
              </tr>
            </thead>
            <tbody>
              <tr v-for="(item, i) in compraExpandida.items" :key="i" class="border-b border-surface-100 dark:border-surface-800 last:border-0">
                <td class="py-1.5 px-2">
                  <Tag :value="item._tipo" :severity="item._tipo === 'IMEI' ? 'info' : item._tipo === 'SERIAL' ? 'warn' : 'success'" class="text-[10px]" />
                </td>
                <td class="py-1.5 px-2 font-medium">{{ item.nombre }}</td>
                <td class="py-1.5 px-2 text-surface-500">{{ item.color || '--' }}</td>
                <td class="py-1.5 px-2 text-surface-500">{{ item.capacidad || '--' }}</td>
                <td class="py-1.5 px-2 text-right">{{ $formatMoney(item.costo) }}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="dialogNuevoProveedor" header="Nuevo Proveedor" modal :style="{ width: '28rem' }">
      <div class="flex flex-col gap-4 pt-2">
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
            <label class="text-sm font-medium">Email</label>
            <InputText v-model="nuevoProveedor.email" placeholder="Email" fluid />
          </div>
        </div>
        <div class="space-y-1">
          <label class="text-sm font-medium">Direccion</label>
          <InputText v-model="nuevoProveedor.direccion" placeholder="Direccion" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevoProveedor = false" />
        <Button label="Guardar y Seleccionar" icon="pi pi-check" @click="guardarNuevoProveedor" />
      </template>
    </Dialog>
  </div>
</template>
