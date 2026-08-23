<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, nextTick, onMounted } from 'vue'
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
import Calendar from 'primevue/calendar'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const tecnicos = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedTecnico = ref<any>(null)
const busqueda = ref('')
const ordenesPagadas = ref<any[]>([])
const loadingPagos = ref(false)
const busquedaPagos = ref('')
const fechaPagoDesde = ref<Date | null>(null)
const fechaPagoHasta = ref<Date | null>(null)
const estadoPagoFiltro = ref<'TODOS' | 'PAGADO' | 'PENDIENTE'>('TODOS')
const historialPagosRef = ref<any>(null)
const tecnicoRegistroFiltro = ref('')
const generandoPdfPagos = ref(false)
const dialogPdfPagos = ref(false)
const pdfPagosUrl = ref('')
const pdfPagosNombre = ref('')

const estados = [
  { label: 'Activo', value: 'ACTIVO' },
  { label: 'Inactivo', value: 'INACTIVO' },
]

const camposArray = [
  'nombre',
  'telefono',
  'email',
  'porcentaje',
  'estado',
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
  telefono: '',
  email: '',
  porcentaje: 0,
  tipo_comision: 'PORCENTAJE_MANO_OBRA',
  valor_comision: 0,
  estado: 'ACTIVO',
})

const form = ref(formDefault())

const tecnicosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return tecnicos.value
  return tecnicos.value.filter(t =>
    t.nombre?.toLowerCase().includes(texto) ||
    t.telefono?.toLowerCase().includes(texto) ||
    t.email?.toLowerCase().includes(texto) ||
    t.estado?.toLowerCase().includes(texto)
  )
})

function fechaPagoOrden(orden: any): string {
  return String(orden.fecha_pago_tecnico || orden.updated_at || orden.fecha_entrega || orden.fecha_entrada || '').slice(0, 10)
}

const pagosBaseFiltrados = computed(() => {
  const texto = busquedaPagos.value.toLowerCase().trim()
  const desde = fechaPagoDesde.value ? fechaPagoDesde.value.toISOString().slice(0, 10) : ''
  const hasta = fechaPagoHasta.value ? fechaPagoHasta.value.toISOString().slice(0, 10) : ''
  return ordenesPagadas.value.filter((orden: any) => {
    const fecha = fechaPagoOrden(orden)
    const coincideFecha = (!desde || fecha >= desde) && (!hasta || fecha <= hasta)
    const coincideTexto = !texto || [orden.tecnico, orden.no_orden, orden.nombre, orden.equipo]
      .some(valor => String(valor || '').toLowerCase().includes(texto))
    const coincideTecnico = !tecnicoRegistroFiltro.value || String(orden.tecnico || '').trim().toUpperCase() === tecnicoRegistroFiltro.value.toUpperCase()
    return coincideFecha && coincideTexto && coincideTecnico
  })
})

const pagosFiltrados = computed(() => pagosBaseFiltrados.value.filter((orden: any) => {
  if (estadoPagoFiltro.value === 'TODOS') return true
  const estado = String(orden.estado_pago_tecnico || 'PENDIENTE').trim().toUpperCase()
  return estadoPagoFiltro.value === 'PAGADO' ? estado === 'PAGADO' : estado !== 'PAGADO'
}))

const totalPagadoTecnicos = computed(() =>
  pagosBaseFiltrados.value
    .filter((orden: any) => String(orden.estado_pago_tecnico || '').trim().toUpperCase() === 'PAGADO')
    .reduce((total, orden) => total + Number(orden.beneficio_tecnico || 0), 0)
)
const totalPendienteTecnicos = computed(() =>
  pagosBaseFiltrados.value
    .filter((orden: any) => String(orden.estado_pago_tecnico || '').trim().toUpperCase() !== 'PAGADO')
    .reduce((total, orden) => total + Number(orden.beneficio_tecnico || 0), 0)
)

async function cargarPagosTecnicos() {
  loadingPagos.value = true
  try {
    const res = await window.db.getAll('ordenes_taller')
    if (!res.success) throw new Error(res.error || 'No se pudo cargar el historial')
    ordenesPagadas.value = filterByAlmacen(res.data || [])
      .filter((orden: any) => String(orden.tecnico || '').trim() && Number(orden.beneficio_tecnico || 0) > 0)
      .sort((a: any, b: any) => fechaPagoOrden(b).localeCompare(fechaPagoOrden(a)))
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar el historial de pagos.', life: 3500 })
  } finally {
    loadingPagos.value = false
  }
}

async function verRegistrosTecnico(tecnico: any) {
  busquedaPagos.value = String(tecnico?.nombre || '').trim()
  tecnicoRegistroFiltro.value = busquedaPagos.value
  estadoPagoFiltro.value = 'TODOS'
  fechaPagoDesde.value = null
  fechaPagoHasta.value = null
  await nextTick()
  historialPagosRef.value?.$el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' })
}

function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')
}

async function generarPdfPagosTecnicos() {
  if (pagosFiltrados.value.length === 0) {
    toast.add({ severity: 'info', summary: 'Sin registros', detail: 'No hay pagos para generar el PDF.', life: 2800 })
    return
  }
  generandoPdfPagos.value = true
  try {
    const currencyCode = systemCurrency.value
    const localeCode = systemLocale.value
    const empresaRes = await window.db.getAll('empresa')
    const empresa = empresaRes.success ? empresaRes.data?.[0] || {} : {}
    const periodo = fechaPagoDesde.value || fechaPagoHasta.value
      ? `${fechaPagoDesde.value?.toLocaleDateString(localeCode) || 'Inicio'} - ${fechaPagoHasta.value?.toLocaleDateString(localeCode) || 'Hoy'}`
      : 'Todos los registros'
    const filas = pagosFiltrados.value.map((orden: any, index: number) => `<tr><td>${index + 1}</td><td>${escapeHtml(fechaPagoOrden(orden))}</td><td>${escapeHtml(orden.tecnico)}</td><td>${escapeHtml(orden.no_orden || `#${orden.id}`)}</td><td>${escapeHtml(orden.nombre || '-')}</td><td>${escapeHtml(orden.equipo || '-')}</td><td>${String(orden.estado_pago_tecnico || '').toUpperCase() === 'PAGADO' ? 'PAGADA' : 'SIN PAGAR'}</td><td class="money">${escapeHtml(currencyCode)} ${Number(orden.beneficio_tecnico || 0).toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Registro de Técnicos</title><style>@page{margin:12mm}*{box-sizing:border-box}body{font-family:Arial,sans-serif;color:#1f2937;font-size:10px;margin:0}.bar{height:7px;background:#7c3aed;margin-bottom:18px}.head{display:flex;justify-content:space-between;border-bottom:2px solid #7c3aed;padding-bottom:12px}.head h1{margin:0;font-size:21px}.meta{text-align:right;line-height:1.6}.summary{display:flex;gap:12px;margin:18px 0}.card{flex:1;border:1px solid #ddd;border-radius:7px;padding:12px;background:#f9fafb}.card.total{background:#f5f3ff;border-color:#c4b5fd}.label{font-size:9px;text-transform:uppercase;color:#6b7280}.value{font-size:20px;font-weight:bold;color:#6d28d9;margin-top:3px}table{width:100%;border-collapse:collapse}th{background:#312e81;color:#fff;padding:8px;text-align:left;text-transform:uppercase;font-size:9px}td{padding:8px;border-bottom:1px solid #e5e7eb}tbody tr:nth-child(even){background:#f9fafb}.money{text-align:right;white-space:nowrap;font-weight:bold}.footer{margin-top:20px;border-top:1px solid #ddd;padding-top:8px;color:#6b7280;display:flex;justify-content:space-between}</style></head><body><div class="bar"></div><div class="head"><div><h1>${escapeHtml(empresa.nombre || 'MI EMPRESA')}</h1><p>Registro de órdenes y pagos a técnicos</p></div><div class="meta"><strong>Estado: ${escapeHtml(estadoPagoFiltro.value)}</strong><br>Período: ${escapeHtml(periodo)}<br>Filtro: ${escapeHtml(tecnicoRegistroFiltro.value || busquedaPagos.value || 'Todos')}</div></div><div class="summary"><div class="card"><div class="label">Órdenes mostradas</div><div class="value">${pagosFiltrados.value.length}</div></div><div class="card total"><div class="label">Total pagado</div><div class="value">${escapeHtml(currencyCode)} ${totalPagadoTecnicos.value.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div><div class="card"><div class="label">Pendiente</div><div class="value">${escapeHtml(currencyCode)} ${totalPendienteTecnicos.value.toLocaleString(localeCode, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</div></div></div><table><thead><tr><th>#</th><th>Fecha</th><th>Técnico</th><th>Orden</th><th>Cliente</th><th>Equipo</th><th>Estado</th><th class="money">Monto</th></tr></thead><tbody>${filas}</tbody></table><div class="footer"><span>MrCuttiTechnology</span><span>Generado: ${new Date().toLocaleString(localeCode)}</span></div></body></html>`
    const nombre = `Pagos_Tecnicos_${new Date().toISOString().slice(0, 10)}.pdf`
    const res = await window.electron.invoke('generate:pdf', html, nombre) as any
    if (!res.success) throw new Error(res.error || 'No se pudo generar el PDF')
    pdfPagosUrl.value = res.dataUrl
    pdfPagosNombre.value = nombre
    dialogPdfPagos.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo generar el PDF.', life: 3500 })
  } finally {
    generandoPdfPagos.value = false
  }
}

async function descargarPdfPagos() {
  if (!pdfPagosUrl.value) return
  const res = await window.electron.invoke('save:pdf', pdfPagosUrl.value, pdfPagosNombre.value) as any
  if (res.success) toast.add({ severity: 'success', summary: 'Guardado', detail: 'PDF descargado correctamente.', life: 2500 })
  else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar el PDF.', life: 3000 })
}

async function cargarTecnicos() {
  loading.value = true
  try {
    const res = await window.db.getAll('tecnicos')
    if (res.success) {
      tecnicos.value = filterByAlmacen(res.data || [])
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar los tecnicos', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedTecnico.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(tecnico: any) {
  isEditing.value = true
  selectedTecnico.value = tecnico
  form.value = {
    nombre: tecnico.nombre || '',
    telefono: tecnico.telefono || '',
    email: tecnico.email || '',
    porcentaje: tecnico.porcentaje || 0,
    tipo_comision: tecnico.tipo_comision || 'PORCENTAJE_MANO_OBRA',
    valor_comision: Number(tecnico.valor_comision ?? tecnico.porcentaje ?? 0),
    estado: tecnico.estado || 'ACTIVO',
  }
  dialogVisible.value = true
}

function confirmarBorrar(tecnico: any) {
  selectedTecnico.value = tecnico
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim().toLowerCase(),
      porcentaje: form.value.porcentaje || 0,
      tipo_comision: form.value.tipo_comision,
      valor_comision: form.value.tipo_comision === 'MONTO_FIJO'
        ? Number(form.value.valor_comision || 0)
        : Number(form.value.porcentaje || 0),
      estado: form.value.estado,
    }

    if (isEditing.value) {
      const res = await window.db.update('tecnicos', selectedTecnico.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Tecnico actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('tecnicos', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Tecnico creado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarTecnicos()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('tecnicos', selectedTecnico.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Tecnico eliminado', life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
      return
    }
    deleteDialogVisible.value = false
    await cargarTecnicos()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
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

  await Promise.all([cargarTecnicos(), cargarPagosTecnicos()])
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Tecnicos">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar tecnico..." />
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
          <Button label="Nuevo Tecnico" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="tecnicosFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
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
        <Column field="telefono" header="Telefono" sortable style="width: 9rem" />
        <Column field="email" header="Email" sortable />
        <Column field="porcentaje" header="% Comision" sortable style="width: 8rem">
          <template #body="{ data }">{{ data.porcentaje || 0 }}%</template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width: 8rem" />

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay tecnicos registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="tecnicosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay tecnicos registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="tecnico in tecnicosFiltrados"
            :key="tecnico.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(tecnico)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ tecnico.id }}</span>
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full"
                :class="tecnico.estado === 'INACTIVO'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'"
              >
                {{ tecnico.estado || 'ACTIVO' }}
              </span>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ tecnico.nombre }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ tecnico.email || 'Sin email' }}</p>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-phone text-surface-400"></i>
                <span class="truncate">{{ tecnico.telefono || 'Sin telefono' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-chart-line text-surface-400"></i>
                <span class="truncate">{{ tecnico.porcentaje || 0 }}% comision</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button label="Registros" icon="pi pi-history" severity="success" text size="small" @click.stop="verRegistrosTecnico(tecnico)" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(tecnico)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(tecnico)" v-tooltip="'Eliminar'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Fieldset ref="historialPagosRef" legend="Registro de órdenes por técnico" class="mt-5 scroll-mt-4">
      <div class="space-y-4">
        <div class="flex items-end justify-between gap-3 flex-wrap">
          <div class="flex items-end gap-3 flex-wrap">
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-surface-500">Buscar</label>
              <IconField>
                <InputIcon class="pi pi-search" />
                <InputText v-model="busquedaPagos" placeholder="Técnico, orden, cliente..." @input="tecnicoRegistroFiltro = ''" />
              </IconField>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-surface-500">Desde</label>
              <Calendar v-model="fechaPagoDesde" dateFormat="dd/mm/yy" placeholder="Desde" showIcon showButtonBar />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-surface-500">Hasta</label>
              <Calendar v-model="fechaPagoHasta" dateFormat="dd/mm/yy" placeholder="Hasta" showIcon showButtonBar />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-xs font-medium text-surface-500">Estado</label>
              <Select v-model="estadoPagoFiltro" :options="[{ label: 'Todas', value: 'TODOS' }, { label: 'Pagadas', value: 'PAGADO' }, { label: 'Sin pagar', value: 'PENDIENTE' }]" optionLabel="label" optionValue="value" class="w-36" />
            </div>
            <Button icon="pi pi-refresh" severity="secondary" outlined :loading="loadingPagos" @click="cargarPagosTecnicos" v-tooltip="'Actualizar historial'" />
            <Button label="PDF" icon="pi pi-file-pdf" severity="danger" :loading="generandoPdfPagos" @click="generarPdfPagosTecnicos" />
          </div>

          <div class="flex gap-3 flex-wrap">
            <div class="rounded-xl border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950/30 px-5 py-3 min-w-48">
              <p class="text-xs font-semibold text-green-600">Total pagado</p>
              <p class="text-2xl font-bold text-green-700 dark:text-green-400">{{ $formatMoney(totalPagadoTecnicos) }}</p>
            </div>
            <div class="rounded-xl border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-950/30 px-5 py-3 min-w-48">
              <p class="text-xs font-semibold text-amber-600">Pendiente de pago</p>
              <p class="text-2xl font-bold text-amber-700 dark:text-amber-400">{{ $formatMoney(totalPendienteTecnicos) }}</p>
            </div>
          </div>
        </div>

        <DataTable :value="pagosFiltrados" :loading="loadingPagos" stripedRows paginator :rows="10" :rowsPerPageOptions="[10, 25, 50]" dataKey="id" responsiveLayout="scroll">
          <Column field="fecha_pago_tecnico" header="Fecha de pago" sortable style="width: 10rem">
            <template #body="{ data }">{{ fechaPagoOrden(data) || '-' }}</template>
          </Column>
          <Column field="tecnico" header="Técnico" sortable />
          <Column field="no_orden" header="Orden" sortable style="width: 9rem">
            <template #body="{ data }">{{ data.no_orden || `#${data.id}` }}</template>
          </Column>
          <Column field="nombre" header="Cliente" sortable />
          <Column field="equipo" header="Equipo" sortable />
          <Column field="beneficio_tecnico" header="Monto técnico" sortable style="width: 11rem">
            <template #body="{ data }"><span class="font-bold" :class="String(data.estado_pago_tecnico || '').toUpperCase() === 'PAGADO' ? 'text-green-600' : 'text-amber-600'">{{ $formatMoney(data.beneficio_tecnico || 0) }}</span></template>
          </Column>
          <Column field="estado_pago_tecnico" header="Estado" sortable style="width: 9rem">
            <template #body="{ data }">
              <span class="text-xs font-semibold rounded-full px-2 py-1" :class="String(data.estado_pago_tecnico || '').toUpperCase() === 'PAGADO' ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300' : 'bg-amber-100 text-amber-700 dark:bg-amber-900 dark:text-amber-300'">{{ String(data.estado_pago_tecnico || 'PENDIENTE').toUpperCase() === 'PAGADO' ? 'PAGADA' : 'SIN PAGAR' }}</span>
            </template>
          </Column>
          <template #empty>
            <div class="text-center py-8 text-surface-500">No hay órdenes de técnicos para los filtros seleccionados.</div>
          </template>
        </DataTable>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogPdfPagos" header="Vista previa - Pagos a técnicos" modal :style="{ width: '85vw', height: '90vh' }" :draggable="false">
      <iframe v-if="pdfPagosUrl" :src="pdfPagosUrl" class="w-full border-0 rounded-lg bg-white" style="height:72vh" title="Registro PDF de pagos a técnicos"></iframe>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogPdfPagos = false" />
        <Button label="Descargar PDF" icon="pi pi-download" @click="descargarPdfPagos" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Tecnico' : 'Nuevo Tecnico'"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="grid grid-cols-1 gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre del tecnico" fluid class="uppercase" style="text-transform: uppercase;" />
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
          <label class="font-semibold text-sm">Forma de comisión</label>
          <Select
            v-model="form.tipo_comision"
            :options="[
              { label: '% de mano de obra', value: 'PORCENTAJE_MANO_OBRA' },
              { label: '% de piezas', value: 'PORCENTAJE_PIEZAS' },
              { label: 'Monto fijo por reparación', value: 'MONTO_FIJO' },
            ]"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">{{ form.tipo_comision === 'MONTO_FIJO' ? 'Monto por reparación' : '% Comisión' }}</label>
          <InputNumber v-if="form.tipo_comision === 'MONTO_FIJO'" v-model="form.valor_comision" mode="currency" :currency="systemCurrency" :locale="systemLocale" :min="0" fluid />
          <InputNumber v-else v-model="form.porcentaje" suffix="%" :min="0" :max="100" fluid @focus="(e) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Estado</label>
          <Select v-model="form.estado" :options="estados" optionLabel="label" optionValue="value" fluid />
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" @click="guardar" />
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
        <span>Seguro que deseas eliminar <strong>{{ selectedTecnico?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
