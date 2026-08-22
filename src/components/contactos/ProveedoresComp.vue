<script setup lang="ts">
import { getSystemCurrencyCode } from '@/i18n/localeProfiles'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { useFilteredSearch } from '@/composables/useSearch'

const { currency: systemCurrency, locale: systemLocale, fiscal } = useLocaleProfile()
import { ref, computed, onMounted } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { uploadImage, getImageUrl, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import Swal from 'sweetalert2'

const toast = useToast()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const proveedores = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedProveedor = ref<any>(null)
const dialogDeudaVisible = ref(false)
const proveedorDeuda = ref<any>(null)
const cuentasProveedor = ref<any[]>([])
const cargandoDeuda = ref(false)
const cuentaAbono = ref<any>(null)
const montoAbono = ref(0)
const guardandoAbono = ref(false)
const dialogHistorialAbonos = ref(false)
const cuentaHistorialAbonos = ref<any>(null)
const generandoPdfDeuda = ref(false)

const abonosHistorial = computed(() => {
  try {
    const pagos = JSON.parse(cuentaHistorialAbonos.value?.pagos || '[]')
    return Array.isArray(pagos) ? pagos : []
  } catch { return [] }
})

const totalDeudaProveedor = computed(() =>
  cuentasProveedor.value.reduce((total, cuenta) => total + Math.max(0, Number(cuenta.saldo || 0)), 0)
)

const camposArray = [
  'nombre',
  'rnc',
  'telefono',
  'email',
  'encargado',
  'cuenta_bancaria',
  'direccion',
  'created_at',
  'updated_at',
]

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCorto = ref('')

const formDefault = () => ({
  nombre: '',
  rnc: '',
  telefono: '',
  email: '',
  encargado: '',
  cuenta_bancaria: '',
  direccion: '',
  imagen: '',
})

const form = ref(formDefault())
const fileInput = ref<HTMLInputElement | null>(null)
const subiendoImagen = ref(false)

const { query: busqueda, results: proveedoresFiltrados } = useFilteredSearch(proveedores, [
  'nombre', 'rnc', 'telefono', 'email', 'encargado', 'cuenta_bancaria', 'direccion',
])

async function cargarProveedores() {
  loading.value = true
  try {
    const res = await window.db.getAll('proveedores')
    if (res.success) {
      proveedores.value = filterByAlmacen(res.data || [])
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedProveedor.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(proveedor: any) {
  isEditing.value = true
  selectedProveedor.value = proveedor
  form.value = {
    nombre: proveedor.nombre || '',
    rnc: proveedor.rnc || '',
    telefono: proveedor.telefono || '',
    email: proveedor.email || '',
    encargado: proveedor.encargado || '',
    cuenta_bancaria: proveedor.cuenta_bancaria || '',
    direccion: proveedor.direccion || '',
    imagen: proveedor.imagen || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(proveedor: any) {
  selectedProveedor.value = proveedor
  deleteDialogVisible.value = true
}

async function verDeudaProveedor(proveedor: any) {
  proveedorDeuda.value = proveedor
  cuentasProveedor.value = []
  cuentaAbono.value = null
  dialogDeudaVisible.value = true
  cargandoDeuda.value = true
  try {
    const res = await window.db.getAll('cuentas_pagar')
    if (!res.success) throw new Error(res.error || 'No se pudieron cargar las cuentas por pagar')
    const nombre = String(proveedor.nombre || '').trim().toUpperCase()
    const idProveedor = String(proveedor.id || '')
    cuentasProveedor.value = (res.data || []).filter((cuenta: any) => {
      const nombreCuenta = String(cuenta.nombre_proveedor || cuenta.proveedor || '').trim().toUpperCase()
      const codigoProveedor = String(cuenta.cod_proveedor || cuenta.proveedor_id || '')
      return Number(cuenta.saldo || 0) > 0 && (nombreCuenta === nombre || (idProveedor && codigoProveedor === idProveedor))
    })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo consultar la deuda', life: 3000 })
  } finally {
    cargandoDeuda.value = false
  }
}

function seleccionarCuentaAbono(cuenta: any) {
  cuentaAbono.value = cuenta
  montoAbono.value = Number(cuenta.saldo || 0)
}

function verHistorialAbonos(cuenta: any) {
  cuentaHistorialAbonos.value = cuenta
  dialogHistorialAbonos.value = true
}

function escaparHtml(valor: any): string {
  return String(valor ?? '').replace(/[&<>"']/g, caracter => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[caracter] || caracter))
}

function pagosDeCuenta(cuenta: any): any[] {
  try {
    const pagos = JSON.parse(cuenta?.pagos || '[]')
    return Array.isArray(pagos) ? pagos : []
  } catch { return [] }
}

async function generarPdfDeudaProveedor() {
  if (!proveedorDeuda.value) return
  generandoPdfDeuda.value = true
  try {
    const [cuentasRes, empresaRes] = await Promise.all([
      window.db.getAll('cuentas_pagar'),
      window.db.getAll('empresa'),
    ])
    if (!cuentasRes.success) throw new Error(cuentasRes.error || 'No se pudieron cargar las cuentas')
    const proveedor = proveedorDeuda.value
    const nombreProveedor = String(proveedor.nombre || '').trim().toUpperCase()
    const idProveedor = String(proveedor.id || '')
    const cuentasReporte = (cuentasRes.data || []).filter((cuenta: any) => {
      const nombreCuenta = String(cuenta.nombre_proveedor || cuenta.proveedor || '').trim().toUpperCase()
      const codigoProveedor = String(cuenta.cod_proveedor || cuenta.proveedor_id || '')
      return nombreCuenta === nombreProveedor || (idProveedor && codigoProveedor === idProveedor)
    })
    const empresa = empresaRes?.success ? empresaRes.data?.[0] || {} : {}
    const total = cuentasReporte.reduce((s: number, c: any) => s + Number(c.total || 0), 0)
    const abonado = cuentasReporte.reduce((s: number, c: any) => s + Number(c.abonado || 0), 0)
    const saldo = cuentasReporte.reduce((s: number, c: any) => s + Math.max(0, Number(c.saldo || 0)), 0)
    const moneda = (valor: any) => `${getSystemCurrencyCode()} ${Number(valor || 0).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
    const facturasHtml = cuentasReporte.map((cuenta: any) => {
      const pagos = pagosDeCuenta(cuenta)
      const pagosHtml = pagos.length
        ? `<table class="payments"><thead><tr><th>#</th><th>Fecha y hora</th><th>Monto</th></tr></thead><tbody>${pagos.map((pago: any, indice: number) => `<tr><td>${escaparHtml(pago.nopago || indice + 1)}</td><td>${escaparHtml(`${pago.fecha || ''} ${pago.hora || ''}`)}</td><td>${moneda(pago.cantidad)}</td></tr>`).join('')}</tbody></table>`
        : '<p class="empty">Sin abonos registrados.</p>'
      return `<section class="invoice"><div class="invoice-head"><strong>Factura: ${escaparHtml(cuenta.no_factura || 'Sin número')}</strong><span>${escaparHtml(cuenta.estado || 'ACTIVA')}</span></div><p>Fecha: ${escaparHtml(cuenta.fecha_compra || '-')} ${cuenta.fecha_vencimiento ? `| Vence: ${escaparHtml(cuenta.fecha_vencimiento)}` : ''}</p><div class="amounts"><span>Total <b>${moneda(cuenta.total)}</b></span><span>Abonado <b class="green">${moneda(cuenta.abonado)}</b></span><span>Pendiente <b class="red">${moneda(cuenta.saldo)}</b></span></div><h3>Abonos realizados</h3>${pagosHtml}</section>`
    }).join('') || '<p class="empty">No hay cuentas registradas para este proveedor.</p>'
    const fecha = new Date().toLocaleString(systemLocale.value)
    const html = `<!doctype html><html lang="es"><head><meta charset="utf-8"><style>@page{size:letter;margin:12mm}body{font-family:Arial,sans-serif;color:#1f2937;font-size:12px}.page{max-width:720px;margin:auto}.header{text-align:center;border-bottom:2px solid #0f766e;padding-bottom:12px}.header h1{margin:0;color:#0f766e;font-size:22px}.header p{margin:4px 0;color:#6b7280}.title{margin:18px 0;background:#0f766e;color:#fff;padding:10px;text-align:center;font-size:16px;font-weight:bold}.info{border:1px solid #d1d5db;border-radius:8px;padding:10px;margin-bottom:12px}.totals{display:flex;gap:8px;margin:14px 0}.total{flex:1;padding:10px;border-radius:8px;text-align:center;background:#f3f4f6}.total b{display:block;font-size:16px;margin-top:4px}.invoice{border:1px solid #d1d5db;border-radius:8px;padding:12px;margin:12px 0;page-break-inside:avoid}.invoice-head{display:flex;justify-content:space-between}.invoice-head span{font-size:10px;background:#e5e7eb;padding:3px 7px;border-radius:12px}.amounts{display:flex;gap:12px}.amounts span{flex:1}.amounts b{display:block}.green{color:#15803d}.red{color:#dc2626}h3{font-size:12px;margin:14px 0 6px}.payments{width:100%;border-collapse:collapse}.payments th,.payments td{padding:6px;border-bottom:1px solid #e5e7eb;text-align:left}.payments th{background:#f3f4f6}.empty{color:#6b7280;text-align:center;padding:8px}.footer{text-align:center;color:#9ca3af;margin-top:20px;font-size:10px}</style></head><body><div class="page"><div class="header"><h1>${escaparHtml(empresa.nombre || 'MI EMPRESA')}</h1><p>${escaparHtml(empresa.telefono || '')} ${empresa.email ? `| ${escaparHtml(empresa.email)}` : ''}</p></div><div class="title">ESTADO DE CUENTA DEL PROVEEDOR</div><div class="info"><p><b>Proveedor:</b> ${escaparHtml(proveedor.nombre)}</p><p><b>Teléfono:</b> ${escaparHtml(proveedor.telefono || 'N/A')}</p><p><b>${escaparHtml(fiscal.businessIdLabel)}:</b> ${escaparHtml(proveedor.rnc || 'N/A')}</p></div><div class="totals"><div class="total">Total facturado<b>${moneda(total)}</b></div><div class="total">Total abonado<b class="green">${moneda(abonado)}</b></div><div class="total">Deuda pendiente<b class="red">${moneda(saldo)}</b></div></div>${facturasHtml}<div class="footer">Generado el ${escaparHtml(fecha)} | TM POS</div></div></body></html>`
    const archivo = `Estado_Cuenta_${String(proveedor.nombre || proveedor.id).replace(/[^a-z0-9]+/gi, '_')}.pdf`
    const resultado = await window.electron.invoke('generate:pdf', html, archivo) as { success: boolean; dataUrl?: string; error?: string }
    if (!resultado.success || !resultado.dataUrl) throw new Error(resultado.error || 'No se pudo generar el PDF')
    const blob = await (await fetch(resultado.dataUrl)).blob()
    const url = URL.createObjectURL(blob)
    const decision = await Swal.fire({ title: 'Estado de cuenta', html: `<iframe src="${url}" style="width:100%;height:75vh;border:0;background:#fff"></iframe>`, width: '90vw', showCancelButton: true, confirmButtonText: 'Descargar PDF', cancelButtonText: 'Cerrar' })
    if (decision.isConfirmed) {
      const bytes = new Uint8Array(await blob.arrayBuffer())
      let binario = ''
      for (let i = 0; i < bytes.length; i += 0x8000) binario += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
      const guardado = await window.electron.invoke('save:pdf', `data:application/pdf;base64,${btoa(binario)}`, archivo) as { success: boolean; error?: string }
      if (!guardado.success) throw new Error(guardado.error || 'No se pudo guardar el PDF')
    }
    URL.revokeObjectURL(url)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo generar el PDF', life: 3500 })
  } finally {
    generandoPdfDeuda.value = false
  }
}

async function registrarAbonoProveedor() {
  if (!cuentaAbono.value || montoAbono.value <= 0) return
  const saldoActual = Number(cuentaAbono.value.saldo || 0)
  if (montoAbono.value > saldoActual) {
    toast.add({ severity: 'warn', summary: 'Monto excede el saldo', detail: `Saldo pendiente: ${getSystemCurrencyCode()} ${saldoActual.toLocaleString(systemLocale.value, { minimumFractionDigits: 2 })}`, life: 3000 })
    return
  }

  guardandoAbono.value = true
  try {
    let pagos: any[] = []
    try {
      pagos = JSON.parse(cuentaAbono.value.pagos || '[]')
      if (!Array.isArray(pagos)) pagos = []
    } catch { pagos = [] }
    const ahora = new Date()
    pagos.push({
      nopago: pagos.length + 1,
      cantidad: Number(montoAbono.value),
      fecha: ahora.toLocaleDateString(systemLocale.value),
      hora: ahora.toLocaleTimeString(systemLocale.value, { hour: '2-digit', minute: '2-digit' }),
    })
    const abonado = Number(cuentaAbono.value.abonado || 0) + Number(montoAbono.value)
    const saldo = Math.max(0, Number(cuentaAbono.value.total || 0) - abonado)
    const estado = saldo <= 0 ? 'PAGADA' : 'ACTIVA'
    const actualizado = await window.db.update('cuentas_pagar', cuentaAbono.value.id, {
      abonado,
      saldo,
      estado,
      pagos: JSON.stringify(pagos),
    })
    if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo registrar el abono')

    Object.assign(cuentaAbono.value, { abonado, saldo, estado, pagos: JSON.stringify(pagos) })
    const local = cuentasProveedor.value.find((cuenta: any) => cuenta.id === cuentaAbono.value.id)
    if (local) Object.assign(local, { abonado, saldo, estado, pagos: JSON.stringify(pagos) })
    toast.add({ severity: 'success', summary: 'Abono registrado', detail: `${getSystemCurrencyCode()} ${Number(montoAbono.value).toLocaleString(systemLocale.value, { minimumFractionDigits: 2 })}`, life: 3000 })
    cuentaAbono.value = null
    montoAbono.value = 0
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo registrar el abono', life: 3000 })
  } finally {
    guardandoAbono.value = false
  }
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      rnc: form.value.rnc.trim(),
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim().toLowerCase(),
      encargado: form.value.encargado.trim().toUpperCase(),
      cuenta_bancaria: form.value.cuenta_bancaria.trim(),
      direccion: form.value.direccion.trim().toUpperCase(),
      imagen: form.value.imagen || '',
    }

    if (isEditing.value) {
      const res = await window.db.update('proveedores', selectedProveedor.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Proveedor actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('proveedores', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Proveedor creado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarProveedores()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('proveedores', selectedProveedor.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Proveedor eliminado', life: 3000 })
    }
    deleteDialogVisible.value = false
    await cargarProveedores()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
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
    const uid = await uploadImage(file, 'proveedores')
    form.value.imagen = uid
    if (isEditing.value && selectedProveedor.value?.id) {
      const actualizado = await window.db.update('proveedores', selectedProveedor.value.id, { imagen: uid })
      if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo guardar la imagen')
      selectedProveedor.value.imagen = uid
      const local = proveedores.value.find((proveedor: any) => proveedor.id === selectedProveedor.value.id)
      if (local) local.imagen = uid
      if (isOnline()) await pushLocalRowToCloud('proveedores', selectedProveedor.value.id)
    }
    toast.add({ severity: 'success', summary: 'Imagen subida', life: 2000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo subir la imagen', life: 4000 })
  } finally {
    subiendoImagen.value = false
    input.value = ''
  }
}

async function eliminarImagen() {
  if (!form.value.imagen) return
  try { await deleteImage(form.value.imagen) } catch {}
  form.value.imagen = ''
  if (isEditing.value && selectedProveedor.value?.id) {
    await window.db.update('proveedores', selectedProveedor.value.id, { imagen: '' })
    selectedProveedor.value.imagen = ''
    const local = proveedores.value.find((proveedor: any) => proveedor.id === selectedProveedor.value.id)
    if (local) local.imagen = ''
    if (isOnline()) await pushLocalRowToCloud('proveedores', selectedProveedor.value.id)
  }
}

function imagenUrl(uid: string | null | undefined): string | null {
  return uid ? getImageUrl(uid) : null
}

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

  await cargarProveedores()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Proveedores">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar proveedor..." />
        </IconField>

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
          <Button label="Nuevo Proveedor" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="proveedoresFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column header="Imagen" style="width: 4rem">
          <template #body="{ data }">
            <div v-if="imagenUrl(data.imagen)" class="w-8 h-8 rounded overflow-hidden">
              <img :src="imagenUrl(data.imagen)" class="w-full h-full object-cover" alt="" />
            </div>
          </template>
        </Column>
        <Column header="Acciones" style="width: 8rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-pencil" severity="info" text rounded @click.stop="abrirEditar(data)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded @click.stop="confirmarBorrar(data)" v-tooltip="'Eliminar'" />
            </div>
          </template>
        </Column>
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="nombre" header="Nombre" sortable />
        <Column field="rnc" :header="fiscal.businessIdLabel" sortable style="width: 8rem" />
        <Column field="telefono" header="Telefono" sortable style="width: 9rem" />
        <Column field="email" header="Email" sortable />
        <Column field="encargado" header="Encargado" sortable />

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay proveedores registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="proveedoresFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay proveedores registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="proveedor in proveedoresFiltrados"
            :key="proveedor.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(proveedor)"
          >
            <div v-if="imagenUrl(proveedor.imagen)" class="-mx-4 -mt-4 h-36 overflow-hidden rounded-t-xl">
              <img :src="imagenUrl(proveedor.imagen)" class="w-full h-full object-cover" :alt="`Imagen de ${proveedor.nombre}`" />
            </div>
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ proveedor.id }}</span>
              <i class="pi pi-truck text-primary-500"></i>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ proveedor.nombre }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ proveedor.encargado || 'Sin encargado' }}</p>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-phone text-surface-400"></i>
                <span class="truncate">{{ proveedor.telefono || 'Sin telefono' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-envelope text-surface-400"></i>
                <span class="truncate">{{ proveedor.email || 'Sin email' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-id-card text-surface-400"></i>
                <span class="truncate">{{ proveedor.rnc || `Sin ${fiscal.businessIdLabel}` }}</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-wallet" severity="warn" text rounded size="small" @click.stop="verDeudaProveedor(proveedor)" v-tooltip="'Ver deuda'" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(proveedor)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(proveedor)" v-tooltip="'Eliminar'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Proveedor' : 'Nuevo Proveedor'"
      modal
      :style="{ width: '34rem' }"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre del proveedor" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">{{ fiscal.businessIdLabel }}</label>
          <InputText v-model="form.rnc" :placeholder="fiscal.businessIdLabel" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Telefono</label>
          <InputText v-model="form.telefono" placeholder="Telefono" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Email</label>
          <InputText v-model="form.email" placeholder="correo@dominio.com" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Encargado</label>
          <InputText v-model="form.encargado" placeholder="Persona encargada" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Cuenta Bancaria</label>
          <InputText v-model="form.cuenta_bancaria" placeholder="Cuenta bancaria" fluid />
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Direccion</label>
          <Textarea v-model="form.direccion" rows="3" placeholder="Direccion" class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-2 sm:col-span-2">
          <label class="font-semibold text-sm">Imagen</label>
          <div v-if="form.imagen" class="relative w-32 h-32 rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
            <img :src="imagenUrl(form.imagen)" class="w-full h-full object-cover" alt="Imagen del proveedor" />
            <Button icon="pi pi-times" severity="danger" text rounded size="small" class="absolute top-1 right-1 !w-6 !h-6 !text-xs bg-white/80 dark:bg-surface-800/80" @click="eliminarImagen" />
          </div>
          <div class="flex gap-2">
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="subirImagen" />
            <Button :label="(form.imagen ? 'Cambiar ' : 'Subir ') + 'Imagen'" icon="pi pi-upload" severity="secondary" outlined :loading="subiendoImagen" @click="fileInput?.click()" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="subiendoImagen" @click="guardar" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span>Seguro que deseas eliminar <strong>{{ selectedProveedor?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogDeudaVisible"
      :header="`Deuda con ${proveedorDeuda?.nombre || 'proveedor'}`"
      modal
      :style="{ width: 'min(46rem, 95vw)' }"
    >
      <div class="rounded-xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-800 p-4 mb-4">
        <span class="block text-sm text-orange-700 dark:text-orange-300">Total pendiente</span>
        <strong class="text-2xl text-orange-700 dark:text-orange-200">{{ $formatMoney(totalDeudaProveedor) }}</strong>
      </div>
      <DataTable :value="cuentasProveedor" :loading="cargandoDeuda" stripedRows responsiveLayout="scroll">
        <Column field="no_factura" header="Factura" />
        <Column field="fecha_compra" header="Fecha" />
        <Column field="fecha_vencimiento" header="Vence" />
        <Column field="total" header="Total">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column field="abonado" header="Abonado">
          <template #body="{ data }">{{ $formatMoney(data.abonado) }}</template>
        </Column>
        <Column field="saldo" header="Pendiente">
          <template #body="{ data }"><span class="font-bold text-orange-600 dark:text-orange-300">{{ $formatMoney(data.saldo) }}</span></template>
        </Column>
        <Column header="Acción" style="width: 7rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button label="Abonar" icon="pi pi-wallet" size="small" severity="success" outlined @click="seleccionarCuentaAbono(data)" />
              <Button icon="pi pi-history" size="small" severity="secondary" text rounded v-tooltip="'Ver abonos'" @click="verHistorialAbonos(data)" />
            </div>
          </template>
        </Column>
        <template #empty>
          <div v-if="!cargandoDeuda" class="text-center py-6 text-surface-500">Este proveedor no tiene cuentas pendientes.</div>
        </template>
      </DataTable>
      <div v-if="cuentaAbono" class="mt-4 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 p-4">
        <div class="flex items-center justify-between gap-3 mb-3">
          <div>
            <p class="font-semibold">Abonar a factura {{ cuentaAbono.no_factura || '-' }}</p>
            <p class="text-sm text-surface-500">Saldo: {{ $formatMoney(cuentaAbono.saldo) }}</p>
          </div>
          <Button icon="pi pi-times" severity="secondary" text rounded @click="cuentaAbono = null" />
        </div>
        <div class="flex flex-col sm:flex-row gap-2">
          <InputNumber v-model="montoAbono" :min="0" :max="Number(cuentaAbono.saldo || 0)" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
          <Button label="Registrar abono" icon="pi pi-check" :loading="guardandoAbono" :disabled="montoAbono <= 0" @click="registrarAbonoProveedor" />
        </div>
      </div>
      <template #footer>
        <Button label="PDF" icon="pi pi-file-pdf" severity="danger" outlined :loading="generandoPdfDeuda" @click="generarPdfDeudaProveedor" />
        <Button label="Cerrar" severity="secondary" text @click="dialogDeudaVisible = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogHistorialAbonos" :header="`Abonos - ${cuentaHistorialAbonos?.no_factura || 'Factura'}`" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div v-if="abonosHistorial.length" class="flex flex-col gap-2">
        <div v-for="(abono, index) in abonosHistorial" :key="`${abono.nopago || index}-${abono.fecha}`" class="flex items-center justify-between rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2">
          <div>
            <p class="font-semibold">Abono #{{ abono.nopago || index + 1 }}</p>
            <p class="text-xs text-surface-500">{{ abono.fecha || '-' }} {{ abono.hora || '' }}</p>
          </div>
          <strong class="text-green-600 dark:text-green-300">{{ $formatMoney(abono.cantidad) }}</strong>
        </div>
      </div>
      <div v-else class="text-center py-8 text-surface-500">No hay abonos registrados para esta factura.</div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogHistorialAbonos = false" />
      </template>
    </Dialog>
  </div>
</template>
