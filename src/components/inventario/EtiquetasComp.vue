<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, nextTick } from 'vue'
import Button from 'primevue/button'
import { useSystemModeStore } from '@/stores/systemMode'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'

const systemMode = useSystemModeStore()
const toast = useToast()

interface Elemento {
  id: string
  tipo: 'texto' | 'barcode' | 'qr' | 'imagen'
  x: number
  y: number
  ancho: number
  alto: number
  contenido: string
  fontSize?: number
  bold?: boolean
  rotacion?: number
}

const lienzo = ref<HTMLDivElement | null>(null)
const escala = ref(4)
const unidad = ref<'mm' | 'in'>('mm')
const anchoLienzo = ref(50)
const altoLienzo = ref(30)
const elementos = ref<Elemento[]>([])
const elementoSeleccionado = ref<string | null>(null)
const arrastrando = ref<{ id: string; startX: number; startY: number; elemStartX: number; elemStartY: number } | null>(null)
const redimensionando = ref<{ id: string; tipo: string; startX: number; startY: number; elemStartX: number; elemStartY: number; elemStartW: number; elemStartH: number } | null>(null)
const dialogGuardar = ref(false)
const dialogCargar = ref(false)
const nombrePlantilla = ref('')
const plantillas = ref<any[]>([])
const printerName = ref('')
const dialogImpresora = ref(false)
const printers = ref<any[]>([])
const printerTemp = ref('')
const escaneando = ref(false)
const empresaNombre = ref('MI EMPRESA')

const anchoDisplay = computed({
  get: () => unidad.value === 'in' ? +(anchoLienzo.value / 25.4).toFixed(2) : anchoLienzo.value,
  set: (v: number) => { anchoLienzo.value = unidad.value === 'in' ? Math.round(v * 25.4) : v },
})
const altoDisplay = computed({
  get: () => unidad.value === 'in' ? +(altoLienzo.value / 25.4).toFixed(2) : altoLienzo.value,
  set: (v: number) => { altoLienzo.value = unidad.value === 'in' ? Math.round(v * 25.4) : v },
})

const elementoActual = computed(() => elementos.value.find(e => e.id === elementoSeleccionado.value))

const predefinidos: Record<string, { contenido: string; fontSize: number; bold: boolean; ancho: number }> = {
  empresa: { contenido: 'MI EMPRESA', fontSize: 10, bold: true, ancho: 35 },
  precio: { contenido: 'RD$ 0.00', fontSize: 14, bold: true, ancho: 25 },
  producto: { contenido: 'NOMBRE PRODUCTO', fontSize: 9, bold: false, ancho: 40 },
  producto_variable: { contenido: '{PRODUCTO}', fontSize: 9, bold: true, ancho: 40 },
  precio_variable: { contenido: '{PRECIO}', fontSize: 14, bold: true, ancho: 25 },
  barcode_producto: { contenido: '{CODIGO_BARRA}', fontSize: 7, bold: false, ancho: 40 },
  modelo: { contenido: 'MODELO', fontSize: 8, bold: false, ancho: 30 },
  color: { contenido: 'COLOR', fontSize: 8, bold: false, ancho: 25 },
  capacidad: { contenido: 'CAPACIDAD', fontSize: 8, bold: false, ancho: 25 },
  imei: { contenido: '{IMEI}', fontSize: 7, bold: false, ancho: 40 },
  cliente_taller: { contenido: '{CLIENTE}', fontSize: 8, bold: true, ancho: 40 },
  orden_taller: { contenido: '{NO_ORDEN}', fontSize: 8, bold: true, ancho: 35 },
  barcode_orden: { contenido: '{NO_ORDEN}', fontSize: 7, bold: false, ancho: 40 },
  qr_predef: { contenido: 'https://tmposrd.com', fontSize: 6, bold: false, ancho: 15 },
}

function agregarPredefinido(clave: string) {
  const p = predefinidos[clave]
  if (!p) return
  const id = `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const ultimoY = elementos.value.length > 0 ? Math.max(...elementos.value.map(e => e.y)) + (elementos.value[elementos.value.length - 1]?.alto || 8) + 1 : 2

  if (clave === 'qr_predef') {
    elementos.value.push({
      id, tipo: 'qr',
      x: 2, y: ultimoY,
      ancho: 15, alto: 15,
      contenido: 'https://tmposrd.com',
    })
  } else if (clave === 'imei' || clave === 'barcode_imei' || clave === 'barcode_orden' || clave === 'barcode_producto') {
    elementos.value.push({
      id, tipo: 'barcode',
      x: 2, y: ultimoY,
      ancho: 40, alto: 10,
      contenido: clave === 'barcode_orden' ? '{NO_ORDEN}' : clave === 'barcode_producto' ? '{CODIGO_BARRA}' : '{IMEI}',
    })
  } else {
    const contenido = clave === 'empresa' ? empresaNombre.value : p.contenido
    elementos.value.push({
      id, tipo: 'texto',
      x: 2, y: ultimoY,
      ancho: p.ancho, alto: 6,
      contenido,
      fontSize: p.fontSize, bold: p.bold,
    })
  }
  elementoSeleccionado.value = id
}

function agregarElemento(tipo: Elemento['tipo']) {
  const id = `elem_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`
  const base: Elemento = {
    id, tipo,
    x: 5, y: 5,
    ancho: tipo === 'barcode' ? 40 : 20,
    alto: tipo === 'texto' ? 8 : 10,
    contenido: tipo === 'texto' ? 'Texto' : tipo === 'barcode' ? '1234567890' : '',
    fontSize: tipo === 'texto' ? 8 : undefined,
    bold: false,
  }
  if (tipo === 'qr') {
    base.contenido = 'https://ejemplo.com'
    base.alto = 15
    base.ancho = 15
  }
  elementos.value.push(base)
  elementoSeleccionado.value = id
}

function eliminarElemento() {
  if (!elementoSeleccionado.value) return
  elementos.value = elementos.value.filter(e => e.id !== elementoSeleccionado.value)
  elementoSeleccionado.value = null
}

function iniciarArrastre(e: MouseEvent, id: string) {
  const el = elementos.value.find(el => el.id === id)
  if (!el) return
  arrastrando.value = {
    id,
    startX: e.clientX,
    startY: e.clientY,
    elemStartX: el.x,
    elemStartY: el.y,
  }
  document.addEventListener('mousemove', enArrastre)
  document.addEventListener('mouseup', finArrastre)
}

function enArrastre(e: MouseEvent) {
  if (!arrastrando.value) return
  const dx = (e.clientX - arrastrando.value.startX) / escala.value
  const dy = (e.clientY - arrastrando.value.startY) / escala.value
  const el = elementos.value.find(el => el.id === arrastrando.value!.id)
  if (el) {
    el.x = Math.max(0, arrastrando.value.elemStartX + dx)
    el.y = Math.max(0, arrastrando.value.elemStartY + dy)
  }
}

function finArrastre() {
  arrastrando.value = null
  document.removeEventListener('mousemove', enArrastre)
  document.removeEventListener('mouseup', finArrastre)
}

function seleccionarElemento(id: string, e: MouseEvent) {
  e.stopPropagation()
  elementoSeleccionado.value = id
}

function limpiarSeleccion() {
  elementoSeleccionado.value = null
}

function generarBarcodeSVG(data: string, escalar = false): string {
  if (!data) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, data, {
      format: 'CODE128',
      width: 1.5,
      height: 40,
      displayValue: true,
      fontSize: 10,
      margin: 2,
    })
    let svgStr = new XMLSerializer().serializeToString(svg)
    if (escalar) {
      svgStr = svgStr.replace(/width="[^"]*"/, 'width="100%"').replace(/height="[^"]*"/, 'height="100%"')
    }
    return svgStr
  } catch {
    return '<div>Error</div>'
  }
}

function iniciarResize(e: MouseEvent, id: string, tipo: string) {
  e.stopPropagation()
  const el = elementos.value.find(el => el.id === id)
  if (!el) return
  redimensionando.value = {
    id, tipo,
    startX: e.clientX, startY: e.clientY,
    elemStartX: el.x, elemStartY: el.y,
    elemStartW: el.ancho, elemStartH: el.alto,
  }
  document.addEventListener('mousemove', enResize)
  document.addEventListener('mouseup', finResize)
}

function enResize(e: MouseEvent) {
  if (!redimensionando.value) return
  const r = redimensionando.value
  const dx = (e.clientX - r.startX) / escala.value
  const dy = (e.clientY - r.startY) / escala.value
  const el = elementos.value.find(el => el.id === r.id)
  if (!el) return
  if (r.tipo.includes('e')) el.ancho = Math.max(5, r.elemStartW + dx)
  if (r.tipo.includes('w')) { el.ancho = Math.max(5, r.elemStartW - dx); el.x = r.elemStartX + dx }
  if (r.tipo.includes('s')) el.alto = Math.max(3, r.elemStartH + dy)
  if (r.tipo.includes('n')) { el.alto = Math.max(3, r.elemStartH - dy); el.y = r.elemStartY + dy }
}

function finResize() {
  redimensionando.value = null
  document.removeEventListener('mousemove', enResize)
  document.removeEventListener('mouseup', finResize)
}

async function escanearImpresoras() {
  escaneando.value = true
  try {
    const res = await window.electron.invoke('getPrinters')
    if (res.success) printers.value = res.data || []
  } catch (_) {}
  escaneando.value = false
}

function guardarImpresora() {
  printerName.value = printerTemp.value
  localStorage.setItem('etiquetas_printer', printerTemp.value)
  dialogImpresora.value = false
}

async function generarQR(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, { width: 200, margin: 1 })
  } catch {
    return ''
  }
}

async function imprimir() {
  printerName.value = localStorage.getItem('etiquetas_printer') || printerName.value

  const mmToPx = (mm: number) => mm * 3.7795275591

  let html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta</title><style>'
  html += 'body{margin:0;padding:0;font-family:Arial,sans-serif}'
  html += `.label{width:${mmToPx(anchoLienzo.value)}px;height:${mmToPx(altoLienzo.value)}px;position:relative;overflow:hidden;background:white}`
  html += '.elem{position:absolute;overflow:hidden;word-wrap:break-word;display:flex;align-items:center;justify-content:center}'
  html += '</style></head><body><div class="label">'

  for (const el of elementos.value) {
    const style = `left:${mmToPx(el.x)}px;top:${mmToPx(el.y)}px;width:${mmToPx(el.ancho)}px;height:${mmToPx(el.alto)}px;`
    if (el.tipo === 'texto') {
      const fontWeight = el.bold ? 'bold' : 'normal'
      html += `<div class="elem" style="${style}font-size:${(el.fontSize || 8) * 1.333}px;font-weight:${fontWeight}">${el.contenido}</div>`
    } else if (el.tipo === 'qr') {
      const qrData = await generarQR(el.contenido)
      if (qrData) html += `<img class="elem" style="${style}object-fit:contain;max-width:100%;max-height:100%" src="${qrData}" />`
    } else if (el.tipo === 'barcode') {
      html += `<div class="elem" style="${style}overflow:hidden">${generarBarcodeSVG(el.contenido, true)}</div>`
    }
  }

  html += '</div></body></html>'

  try {
    const res = await window.electron.invoke('print:ticket', html, printerName.value || undefined)
    if (res.success) toast.add({ severity: 'success', summary: 'Imprimiendo...', life: 2000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}

async function guardarPlantilla() {
  if (!nombrePlantilla.value.trim()) return
  try {
    const data = {
      nombre: nombrePlantilla.value.trim().toUpperCase(),
      ancho: anchoLienzo.value,
      alto: altoLienzo.value,
      elementos: JSON.stringify(elementos.value),
    }
    const res = await window.db.insert('plantillas_etiquetas', data)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Guardado', detail: 'Plantilla guardada', life: 2000 })
      dialogGuardar.value = false
      await cargarPlantillas()
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}

async function cargarPlantillas() {
  const res = await window.db.getAll('plantillas_etiquetas')
  if (res.success) plantillas.value = res.data || []
}

function abrirPlantilla(p: any) {
  anchoLienzo.value = p.ancho || 50
  altoLienzo.value = p.alto || 30
  try { elementos.value = JSON.parse(p.elementos) || [] } catch { elementos.value = [] }
  elementoSeleccionado.value = null
  dialogCargar.value = false
}

async function eliminarPlantilla(id: number) {
  await window.db.delete('plantillas_etiquetas', id)
  await cargarPlantillas()
}

function nuevaPlantilla() {
  elementos.value = []
  anchoLienzo.value = 50
  altoLienzo.value = 30
  elementoSeleccionado.value = null
}

onMounted(async () => {
  await cargarPlantillas()
  const savedPrinter = localStorage.getItem('etiquetas_printer')
  if (savedPrinter) printerName.value = savedPrinter
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0 && res.data[0].nombre) {
      empresaNombre.value = res.data[0].nombre
    }
  } catch (_) {}
})

onUnmounted(() => {
  document.removeEventListener('mousemove', enArrastre)
  document.removeEventListener('mouseup', finArrastre)
  document.removeEventListener('mousemove', enResize)
  document.removeEventListener('mouseup', finResize)
})
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-4">
      <div class="flex items-center justify-between gap-3 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <i class="pi pi-qrcode text-primary text-lg"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold">Disenador de Etiquetas</h2>
            <p class="text-sm text-surface-500">Cree y personalice etiquetas para productos</p>
          </div>
        </div>
        <div class="flex items-center gap-2 flex-wrap">
          <Button label="Nueva" icon="pi pi-file" severity="secondary" @click="nuevaPlantilla" />
          <Button label="Guardar" icon="pi pi-save" @click="dialogGuardar = true" />
          <Button label="Cargar" icon="pi pi-folder-open" severity="info" @click="dialogCargar = true; cargarPlantillas()" />
          <Button
            :label="printerName || 'Impresora'"
            icon="pi pi-print"
            :severity="printerName ? 'warn' : 'secondary'"
            size="small"
            @click="dialogImpresora = true"
          />
          <Button label="Imprimir" icon="pi pi-print" severity="warn" :disabled="elementos.length === 0" @click="imprimir" />
        </div>
      </div>

      <div class="label-designer-grid grid grid-cols-1 xl:grid-cols-[260px_1fr_300px] gap-4 items-start">
        <aside class="label-left-panel space-y-4">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-3 space-y-2">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">Elementos</h4>
            <Button label="Texto" icon="pi pi-font" class="w-full !justify-start" size="small" severity="secondary" outlined @click="agregarElemento('texto')" />
            <Button label="Codigo Barras" icon="pi pi-barcode" class="w-full !justify-start" size="small" severity="secondary" outlined @click="agregarElemento('barcode')" />
            <Button label="Codigo QR" icon="pi pi-qrcode" class="w-full !justify-start" size="small" severity="secondary" outlined @click="agregarElemento('qr')" />
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-3 space-y-2">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">Predefinidos</h4>
            <Button label="Nombre Empresa" icon="pi pi-building" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('empresa')" />
            <Button label="Precio" icon="pi pi-dollar" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('precio')" />
            <Button label="Producto" icon="pi pi-box" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('producto')" />
            <Button label="Producto Variable" icon="pi pi-box" class="w-full !justify-start !text-[11px]" size="small" severity="warn" text @click="agregarPredefinido('producto_variable')" />
            <Button label="Precio Variable" icon="pi pi-dollar" class="w-full !justify-start !text-[11px]" size="small" severity="warn" text @click="agregarPredefinido('precio_variable')" />
            <Button label="Barcode Producto" icon="pi pi-barcode" class="w-full !justify-start !text-[11px]" size="small" severity="warn" text @click="agregarPredefinido('barcode_producto')" />
            <Button label="Modelo" icon="pi pi-tag" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('modelo')" />
            <Button label="Color" icon="pi pi-palette" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('color')" />
            <Button label="Capacidad" icon="pi pi-database" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('capacidad')" />
          <Button v-if="systemMode.isCellphoneStore" label="Barcode {IMEI}" icon="pi pi-barcode" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('imei')" />
            <Button label="Cliente Taller" icon="pi pi-user" class="w-full !justify-start !text-[11px]" size="small" severity="help" text @click="agregarPredefinido('cliente_taller')" />
            <Button label="No. Orden" icon="pi pi-hashtag" class="w-full !justify-start !text-[11px]" size="small" severity="help" text @click="agregarPredefinido('orden_taller')" />
            <Button label="Barcode Orden" icon="pi pi-barcode" class="w-full !justify-start !text-[11px]" size="small" severity="help" text @click="agregarPredefinido('barcode_orden')" />
            <Button label="QR" icon="pi pi-qrcode" class="w-full !justify-start !text-[11px]" size="small" severity="success" text @click="agregarPredefinido('qr_predef')" />
          </div>
        </aside>

        <main class="label-canvas-panel min-w-0 flex justify-center items-start min-h-[60vh] overflow-auto p-6">
          <div
            ref="lienzo"
            class="relative mx-auto bg-white shadow-lg border border-surface-200 dark:border-surface-700 rounded-lg overflow-hidden"
            :style="{ width: anchoLienzo * escala + 'px', height: altoLienzo * escala + 'px' }"
            @click="limpiarSeleccion"
          >
            <div
              v-for="el in elementos"
              :key="el.id"
              class="absolute cursor-move border-2 transition-colors group"
              :class="elementoSeleccionado === el.id ? 'border-primary bg-primary-5' : 'border-transparent hover:border-primary-3'"
              :style="{ left: el.x * escala + 'px', top: el.y * escala + 'px', width: el.ancho * escala + 'px', height: el.alto * escala + 'px' }"
              @mousedown="iniciarArrastre($event, el.id)"
              @click.stop="elementoSeleccionado = el.id"
            >
              <button
                class="absolute -top-2.5 -right-2.5 w-5 h-5 rounded-full bg-red-500 text-white text-[10px] flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity z-20 shadow-md cursor-pointer hover:bg-red-600"
                @click.stop="elementoSeleccionado = el.id; eliminarElemento()"
              >✕</button>

              <div v-if="el.tipo === 'texto'" class="w-full h-full flex items-center justify-center p-0.5 select-none truncate"
                :style="{ fontSize: (el.fontSize || 8) + 'px', fontWeight: el.bold ? 'bold' : 'normal' }">
                {{ el.contenido }}
              </div>
              <div v-else-if="el.tipo === 'barcode'" class="w-full h-full flex items-center justify-center overflow-hidden select-none bg-white">
                <div v-html="generarBarcodeSVG(el.contenido, true)" style="width:100%;height:100%"></div>
              </div>
              <div v-else-if="el.tipo === 'qr'" class="w-full h-full flex items-center justify-center overflow-hidden bg-gray-50 rounded select-none">
                <i class="pi pi-qrcode text-2xl text-surface-400"></i>
              </div>

              <template v-if="elementoSeleccionado === el.id">
                <div class="absolute -top-1 -left-1 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-nw-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'nw')"></div>
                <div class="absolute -top-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-n-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'n')"></div>
                <div class="absolute -top-1 -right-1 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-ne-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'ne')"></div>
                <div class="absolute top-1/2 -right-1 -translate-y-1/2 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-e-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'e')"></div>
                <div class="absolute -bottom-1 -right-1 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-se-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'se')"></div>
                <div class="absolute -bottom-1 left-1/2 -translate-x-1/2 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-s-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 's')"></div>
                <div class="absolute -bottom-1 -left-1 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-sw-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'sw')"></div>
                <div class="absolute top-1/2 -left-1 -translate-y-1/2 w-3 h-3 bg-primary border-2 border-white rounded-sm cursor-w-resize z-10" @mousedown.stop="iniciarResize($event, el.id, 'w')"></div>
              </template>
            </div>

            <div v-if="elementos.length === 0" class="absolute inset-0 flex items-center justify-center text-surface-300 text-sm">
              Agrega elementos desde el panel izquierdo
            </div>
          </div>
        </main>

        <aside class="label-right-panel space-y-4">
          <div v-if="elementoActual" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-3 space-y-3">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">Propiedades</h4>
            <div class="space-y-2">
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] text-surface-400">Contenido</label>
                <InputText v-model="elementoActual.contenido" class="!text-xs" fluid />
              </div>
              <div v-if="elementoActual.tipo === 'texto'" class="flex items-center gap-2">
                <InputNumber v-model="elementoActual.fontSize" :min="4" :max="50" class="w-16" fluid @focus="(e) => e.target.select()" />
                <ToggleSwitch v-model="elementoActual.bold" />
                <span class="text-xs text-surface-400">Negrita</span>
              </div>
              <div class="grid grid-cols-2 gap-2">
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] text-surface-400">X ({{ unidad }})</label>
                  <InputNumber v-model="elementoActual.x" :min="0" class="!text-xs" fluid />
                </div>
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] text-surface-400">Y ({{ unidad }})</label>
                  <InputNumber v-model="elementoActual.y" :min="0" class="!text-xs" fluid />
                </div>
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] text-surface-400">Ancho ({{ unidad }})</label>
                  <InputNumber v-model="elementoActual.ancho" :min="2" class="!text-xs" fluid />
                </div>
                <div class="flex flex-col gap-0.5">
                  <label class="text-[10px] text-surface-400">Alto ({{ unidad }})</label>
                  <InputNumber v-model="elementoActual.alto" :min="2" class="!text-xs" fluid />
                </div>
              </div>
              <Button label="Eliminar" icon="pi pi-trash" severity="danger" text size="small" class="w-full" @click="eliminarElemento" />
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-3 space-y-2">
            <h4 class="text-xs font-semibold uppercase tracking-wide text-surface-500">Lienzo</h4>
            <div class="flex items-center gap-2 mb-2">
              <button class="flex-1 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer" :class="unidad === 'mm' ? 'bg-primary text-primary-contrast' : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300'" @click="unidad = 'mm'">mm</button>
              <button class="flex-1 py-1 text-xs font-medium rounded-md transition-colors cursor-pointer" :class="unidad === 'in' ? 'bg-primary text-primary-contrast' : 'bg-surface-100 dark:bg-surface-700 text-surface-600 dark:text-surface-300'" @click="unidad = 'in'">pulgadas</button>
            </div>
            <div class="grid grid-cols-2 gap-2">
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] text-surface-400">Ancho ({{ unidad }})</label>
                <InputNumber v-model="anchoDisplay" :min="unidad === 'mm' ? 20 : 1" :max="unidad === 'mm' ? 150 : 6" :step="unidad === 'in' ? 0.1 : 1" class="!text-xs" fluid />
              </div>
              <div class="flex flex-col gap-0.5">
                <label class="text-[10px] text-surface-400">Alto ({{ unidad }})</label>
                <InputNumber v-model="altoDisplay" :min="unidad === 'mm' ? 10 : 0.5" :max="unidad === 'mm' ? 100 : 4" :step="unidad === 'in' ? 0.1 : 1" class="!text-xs" fluid />
              </div>
            </div>
            <div class="flex items-center gap-2">
              <label class="text-[10px] text-surface-400">Zoom:</label>
              <Select v-model="escala" :options="[1, 1.5, 2, 3, 4, 5, 6, 8, 10]" class="w-20" fluid />
            </div>
          </div>
        </aside>
      </div>
    </div>

    <Dialog v-model:visible="dialogGuardar" header="Guardar Plantilla" modal :style="{ width: '24rem' }">
      <div class="space-y-3 pt-2">
        <InputText v-model="nombrePlantilla" placeholder="Nombre de la plantilla" fluid class="uppercase" style="text-transform: uppercase;" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogGuardar = false" />
        <Button label="Guardar" icon="pi pi-check" :disabled="!nombrePlantilla.trim()" @click="guardarPlantilla" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogCargar" header="Cargar Plantilla" modal :style="{ width: '30rem' }">
      <div v-if="plantillas.length === 0" class="text-center py-6 text-surface-400">No hay plantillas guardadas</div>
      <div v-else class="space-y-2">
        <div v-for="p in plantillas" :key="p.id" class="flex items-center justify-between p-2.5 rounded-lg border border-surface-200 dark:border-surface-700 hover:border-primary-300 transition-colors cursor-pointer" @click="abrirPlantilla(p)">
          <div>
            <p class="font-medium text-sm">{{ p.nombre }}</p>
            <p class="text-xs text-surface-400">{{ p.ancho }}x{{ p.alto }}mm</p>
          </div>
          <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="eliminarPlantilla(p.id)" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogCargar = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogImpresora" header="Seleccionar Impresora" modal :style="{ width: '30rem' }">
      <div class="space-y-4 pt-2">
        <Button label="Buscar Impresoras" icon="pi pi-search" :loading="escaneando" @click="escanearImpresoras" />
        <div v-if="printers.length === 0" class="text-center py-6 text-surface-400 text-sm">No hay impresoras. Haz clic en "Buscar Impresoras".</div>
        <div v-else class="flex flex-col gap-1 max-h-60 overflow-y-auto">
          <div
            v-for="p in printers" :key="p.name"
            class="flex items-center gap-3 px-3 py-2.5 rounded-lg cursor-pointer transition-colors"
            :class="printerTemp === p.name ? 'bg-primary text-primary-contrast' : 'hover:bg-surface-100 dark:hover:bg-surface-700'"
            @click="printerTemp = p.name"
          >
            <i class="pi pi-print text-xs"></i>
            <div class="flex-1 min-w-0">
              <p class="text-sm font-medium truncate">{{ p.name }}</p>
              <p v-if="p.model" class="text-xs text-surface-400 truncate">{{ p.model }}</p>
            </div>
            <i v-if="printerTemp === p.name" class="pi pi-check ml-auto flex-shrink-0"></i>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogImpresora = false" />
        <Button label="Guardar" icon="pi pi-check" :disabled="!printerTemp" @click="guardarImpresora" />
      </template>
    </Dialog>
  </div>
</template>
