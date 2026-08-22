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
import Calendar from 'primevue/calendar'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import Menu from 'primevue/menu'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import TicketFacturaPrint from './TicketFacturaPrint.vue'
import FacturaPdfPrint from './FacturaPdfPrint.vue'

import { envioElectron } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const router = useRouter()
const { addAlmacenId, filterByAlmacen } = useAlmacenFilter()
const auth = useAuthStore()
const notasCredito = ref<any[]>([])
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
const selectedNota = ref<any>(null)
const selectedNotas = ref<any[]>([])
const notaActionMenu = ref()
const notaAccion = ref<any>(null)
const busqueda = ref('')
const rangoActivo = ref<string>('todo')
const rangoPersonalizado = ref<Date[]>([])
const comprobanteFiltro = ref('')
const facturasOrigen = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'facturas', entity: 'facturas', label: 'nota de crédito',
  selection: selectedNotas, reload: cargarNotasCredito,
  reference: (item: any) => item.no_factura || String(item.id || ''),
})

const notaActionItems = computed(() => [
  { label: 'Imprimir', icon: 'pi pi-print', command: () => notaAccion.value && imprimirNota(notaAccion.value) },
  { label: 'Ver PDF', icon: 'pi pi-file-pdf', command: () => notaAccion.value && verNotaPdf(notaAccion.value) },
  { label: 'Editar', icon: 'pi pi-pencil', command: () => notaAccion.value && abrirEditar(notaAccion.value) },
  { separator: true },
  { label: 'Eliminar', icon: 'pi pi-trash', class: 'text-red-500', command: () => notaAccion.value && confirmarBorrar(notaAccion.value) },
])

function abrirMenuAccionesNota(event: Event, nota: any) {
  notaAccion.value = nota
  notaActionMenu.value?.toggle(event)
}

function getRango(key: string): { inicio: string; fin: string } | null {
  if (key === 'todo') return null
  const now = new Date()
  const y = (d: Date) => d.toISOString().split('T')[0]
  switch (key) {
    case 'hoy': return { inicio: y(now), fin: y(now) }
    case 'ayer': {
      const ayer = new Date(now); ayer.setDate(ayer.getDate() - 1)
      return { inicio: y(ayer), fin: y(ayer) }
    }
    case 'semana': {
      const l = new Date(now); l.setDate(l.getDate() - (l.getDay() || 7) + 1)
      const d = new Date(l); d.setDate(d.getDate() + 6)
      return { inicio: y(l), fin: y(d) }
    }
    case 'mes': {
      const inicio = new Date(now.getFullYear(), now.getMonth(), 1)
      const fin = new Date(now.getFullYear(), now.getMonth() + 1, 0)
      return { inicio: y(inicio), fin: y(fin) }
    }
    case 'personalizado': {
      if (rangoPersonalizado.value.length === 2 && rangoPersonalizado.value[0] && rangoPersonalizado.value[1])
        return { inicio: y(rangoPersonalizado.value[0]), fin: y(rangoPersonalizado.value[1]) }
      return null
    }
    default: return { inicio: y(now), fin: y(now) }
  }
}

const rango = computed(() => getRango(rangoActivo.value))

const comprobantesLista = ref<string[]>([])

const ticketPrintRef = ref<any>(null)
const facturaPdfRef = ref<any>(null)

const formDefault = () => ({
  no_factura: '',
  comprobante: '',
  cod_cliente: '',
  nombre_cliente: '',
  telefono_cliente: '',
  productos: '',
  vendedor: '',
  metodo_pago: 'EFECTIVO',
  canal_venta: 'LOCAL',
  fecha_emision: new Date(),
  impuesto: 0,
  descuento: 0,
  subtotal: 0,
  total: 0,
  ganancia: 0,
  estado_factura: 'PENDIENTE',
  fecha_estado: new Date(),
  nota: '',
  usuario: '',
  identificadordb: '',
  factura_original: '',
  total_institucion: 0,
  total_cliente: 0,
})

const form = ref(formDefault())

const notasFiltradas = computed(() => {
  let items = notasCredito.value

  if (rango.value) {
    items = items.filter((f: any) =>
      f.fecha_emision >= rango.value!.inicio && f.fecha_emision <= rango.value!.fin
    )
  }

  if (comprobanteFiltro.value) {
    items = items.filter((f: any) => f.comprobante === comprobanteFiltro.value)
  }

  const texto = busqueda.value.toLowerCase().trim()
  if (texto) {
    items = items.filter(f =>
      f.no_factura?.toLowerCase().includes(texto) ||
      f.nombre_cliente?.toLowerCase().includes(texto) ||
      f.telefono_cliente?.toLowerCase().includes(texto) ||
      f.estado_factura?.toLowerCase().includes(texto) ||
      f.total?.toString().includes(texto) ||
      f.comprobante?.toLowerCase().includes(texto)
    )
  }

  return items
})

const notasParaEliminar = computed(() => {
  if (selectedNota.value) return [selectedNota.value]
  return selectedNotas.value || []
})

const totalSeleccionadoEliminar = computed(() =>
  notasParaEliminar.value.reduce((sum, n) => sum + Number(n?.total || 0), 0)
)

function formatCurrency(n: number): string {
  if (n == null) return '0.00'
  return Number(n).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const parts = fechaStr.split('-')
  if (parts.length !== 3) return fechaStr
  const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]))
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function getEstadoSeverity(estado: string): string {
  switch (estado) {
    case 'PAGADA': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    case 'ANULADA': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    default: return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
  }
}

async function cargarNotasCredito() {
  loading.value = true
  try {
    const res = await window.db.getAll('facturas')
    if (res.success) {
      const lista = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
        ? (res.data || [])
        : filterByAlmacen(res.data || [])
      notasCredito.value = lista.filter((f: any) =>
        f.tipo_factura === 'NOTA_CREDITO'
      )
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar las notas de credito', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function cargarFacturasOrigen() {
  try {
    const res = await window.db.getAll('facturas')
    if (res.success) {
      facturasOrigen.value = filterByAlmacen(res.data || []).filter((f: any) =>
        f.tipo_factura === 'FACTURA_VENTA' || f.tipo_factura === 'FACTURA_COMPRA'
      )
    }
  } catch (_) {}
}

watch(verTodosAlmacenes, () => {
  selectedNotas.value = []
  selectedNota.value = null
  cargarNotasCredito()
})

function abrirCrear() {
  isEditing.value = false
  selectedNota.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(nota: any) {
  router.push(`/ventas/editar/${nota.id}`)
}

function confirmarBorrar(nota: any) {
  selectedNota.value = nota
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

function confirmarBorrarSeleccionadas() {
  if (!selectedNotas.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una nota de credito', life: 2500 })
    return
  }
  selectedNota.value = null
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function solicitarOtpEliminarNota() {
  const notas = notasParaEliminar.value
  if (!notas.length) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: notas[0]?.id,
      facturaIds: notas.map(f => f.id),
      no_factura: notas.length === 1 ? notas[0]?.no_factura : '',
      nombre_cliente: notas.length === 1 ? notas[0]?.nombre_cliente : '',
      cantidad: notas.length,
      total: totalSeleccionadoEliminar.value,
    }) as any
    if (res.success) {
    deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (e: any) {
    deleteOtpError.value = e.message || 'Error solicitando codigo'
  } finally {
    deleteOtpLoading.value = false
  }
}

function dateToStr(d: Date | string): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  if (isNaN(d.getTime())) return ''
  return d.toISOString().split('T')[0]
}

async function guardar() {
  if (!form.value.no_factura.trim() && !form.value.nombre_cliente.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El numero o nombre del cliente es requerido', life: 3000 })
    return
  }

  try {
    const data: any = {
      no_factura: form.value.no_factura.trim().toUpperCase(),
      tipo_factura: 'NOTA_CREDITO',
      comprobante: form.value.comprobante.trim(),
      cod_cliente: form.value.cod_cliente.trim().toUpperCase(),
      nombre_cliente: form.value.nombre_cliente.trim().toUpperCase(),
      telefono_cliente: form.value.telefono_cliente.trim(),
      productos: form.value.productos,
      vendedor: form.value.vendedor.trim().toUpperCase(),
      metodo_pago: form.value.metodo_pago,
      canal_venta: form.value.canal_venta,
      fecha_emision: dateToStr(form.value.fecha_emision),
      impuesto: form.value.impuesto || 0,
      descuento: form.value.descuento || 0,
      subtotal: form.value.subtotal || 0,
      total: form.value.total || 0,
      ganancia: form.value.ganancia || 0,
      estado_factura: form.value.estado_factura,
      fecha_estado: dateToStr(form.value.fecha_estado),
      nota: form.value.nota.trim().toUpperCase(),
      usuario: form.value.usuario.trim().toUpperCase(),
      identificadordb: form.value.identificadordb.trim(),
      total_institucion: form.value.total_institucion || 0,
      total_cliente: form.value.total_cliente || 0,
    }

    if (form.value.factura_original) {
      data.nota = (data.nota ? data.nota + ' | ' : '') + 'FACTURA ORIGINAL: ' + form.value.factura_original.trim().toUpperCase()
    }

    const res = isEditing.value
      ? await window.db.update('facturas', selectedNota.value.id, data)
      : await window.db.insert('facturas', addAlmacenId(data))

    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: isEditing.value ? 'Nota de credito actualizada' : 'Nota de credito creada', life: 3000 })
      dialogVisible.value = false
      await cargarNotasCredito()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
    }
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const notas = notasParaEliminar.value
    if (!notas.length) return
    deleteOtpError.value = ''
    const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
    if (!/^\d{4}$/.test(codigo)) {
      deleteOtpError.value = 'Introduce el codigo de 4 digitos'
      return
    }
    deleteOtpConfirmando.value = true
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: notas[0]?.id,
      facturaIds: notas.map(f => f.id),
      codigo,
    }) as any
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    let eliminadas = 0
    for (const nota of notas) {
      const res = await window.db.delete('facturas', nota.id)
      if (res.success) eliminadas++
      else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || `No se pudo eliminar ${nota.no_factura || nota.id}`, life: 3000 })
        return
      }
    }
    toast.add({ severity: 'success', summary: 'Exito', detail: `${eliminadas} nota(s) de credito eliminada(s)`, life: 3000 })
    deleteDialogVisible.value = false
    selectedNotas.value = []
    selectedNota.value = null
    await cargarNotasCredito()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

async function imprimirNota(nota: any) {
  ticketPrintRef.value?.printTicket(nota)
}

async function verNotaPdf(nota: any) {
  facturaPdfRef.value?.printFactura(nota)
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      // config loaded if needed
    }
  } catch (_) {}

  await cargarNotasCredito()
  await cargarFacturasOrigen()

  try {
    const res = await window.db.getAll('comprobantes_fiscales')
    if (res.success) {
      comprobantesLista.value = (res.data || []).map((c: any) => c.tipo).filter(Boolean) as string[]
    }
  } catch (_) {}
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Notas de Credito">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar nota de credito..." />
        </IconField>

        <div class="flex items-center gap-2 flex-wrap">
          <div class="flex flex-wrap gap-1">
            <Button
              v-for="item in [
                { label: 'Todo', key: 'todo' },
                { label: 'Hoy', key: 'hoy' },
                { label: 'Ayer', key: 'ayer' },
                { label: 'Semana', key: 'semana' },
                { label: 'Mes', key: 'mes' },
                { label: 'Rango', key: 'personalizado' },
              ]"
              :key="item.key"
              :label="item.label"
              size="small"
              :severity="rangoActivo === item.key ? 'primary' : 'secondary'"
              :outlined="rangoActivo !== item.key"
              @click="rangoActivo = item.key"
            />
          </div>

          <Calendar
            v-if="rangoActivo === 'personalizado'"
            v-model="rangoPersonalizado"
            selectionMode="range"
            dateFormat="yy-mm-dd"
            placeholder="Seleccionar rango"
            showIcon
          />

          <Select
            v-model="comprobanteFiltro"
            :options="comprobantesLista"
            placeholder="Comprobante"
            clearable
            class="w-36"
            size="small"
          />
        </div>

        <div class="flex items-center gap-2">
          <label v-if="puedeVerTodosAlmacenes" class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button v-if="selectedNotas.length" :label="`Cambiar almacén (${selectedNotas.length})`" icon="pi pi-warehouse" severity="success" @click="abrirMoverAlmacen" />
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
          <Button
            v-if="selectedNotas.length"
            :label="`Eliminar (${selectedNotas.length})`"
            icon="pi pi-trash"
            severity="danger"
            @click="confirmarBorrarSeleccionadas"
          />
          <Button label="Nueva Nota de Credito" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        v-model:selection="selectedNotas"
        :value="notasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Acciones" style="width: 5rem">
          <template #body="{ data }">
            <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded @click.stop="abrirMenuAccionesNota($event, data)" v-tooltip="'Acciones'" />
          </template>
        </Column>
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="no_factura" header="No. Nota" sortable style="width: 10rem" />
        <Column field="comprobante" header="Comprobante" sortable style="width: 8rem" />
        <Column field="nombre_cliente" header="Cliente" sortable />
        <Column field="fecha_emision" header="Fecha Emision" sortable style="width: 9rem">
          <template #body="{ data }">{{ formatFecha(data.fecha_emision) }}</template>
        </Column>
        <Column field="total" header="Total" sortable style="width: 10rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column field="estado_factura" header="Estado" sortable style="width: 9rem">
          <template #body="{ data }">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEstadoSeverity(data.estado_factura)">
              {{ data.estado_factura || 'PENDIENTE' }}
            </span>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay notas de credito registradas.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="notasFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay notas de credito registradas.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="nota in notasFiltradas"
            :key="nota.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(nota)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ nota.id }}</span>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEstadoSeverity(nota.estado_factura)">
                {{ nota.estado_factura || 'PENDIENTE' }}
              </span>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-base leading-tight truncate">{{ nota.no_factura || 'Sin numero' }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ nota.nombre_cliente || 'Sin cliente' }}</p>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-calendar text-surface-400"></i>
                <span class="truncate">{{ formatFecha(nota.fecha_emision) || '--' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-dollar text-surface-400"></i>
                <span class="truncate font-semibold">{{ $formatMoney(nota.total) }}</span>
              </div>
            </div>

            <div class="flex justify-end mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded size="small" @click.stop="abrirMenuAccionesNota($event, nota)" v-tooltip="'Acciones'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>
    <Menu ref="notaActionMenu" :model="notaActionItems" popup appendTo="body" />

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedNotas.length }}</strong> nota(s) de crédito a otro almacén:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover notas" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Nota de Credito' : 'Nueva Nota de Credito'"
      modal
      :style="{ width: '90%', maxWidth: '600px' }"
    >
      <div class="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">No. Nota</label>
          <InputText v-model="form.no_factura" placeholder="Numero de nota" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Comprobante</label>
          <InputText v-model="form.comprobante" placeholder="Comprobante fiscal" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Cod. Cliente</label>
          <InputText v-model="form.cod_cliente" placeholder="Codigo del cliente" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Nombre Cliente</label>
          <InputText v-model="form.nombre_cliente" placeholder="Nombre del cliente" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Telefono</label>
          <InputText v-model="form.telefono_cliente" placeholder="Telefono del cliente" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Metodo Pago</label>
          <Select
            v-model="form.metodo_pago"
            :options="[
              { label: 'Efectivo', value: 'EFECTIVO' },
              { label: 'Tarjeta', value: 'TARJETA' },
              { label: 'Transferencia', value: 'TRANSFERENCIA' },
              { label: 'Cheque', value: 'CHEQUE' },
            ]"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Canal Venta</label>
          <Select
            v-model="form.canal_venta"
            :options="[
              { label: 'Local', value: 'LOCAL' },
              { label: 'Online', value: 'ONLINE' },
              { label: 'Telefono', value: 'TELEFONO' },
              { label: 'WhatsApp', value: 'WHATSAPP' },
              { label: 'Otro', value: 'OTRO' },
            ]"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Vendedor</label>
          <InputText v-model="form.vendedor" placeholder="Vendedor" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Usuario</label>
          <InputText v-model="form.usuario" placeholder="Usuario" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Estado</label>
          <Select
            v-model="form.estado_factura"
            :options="[
              { label: 'Pendiente', value: 'PENDIENTE' },
              { label: 'Pagada', value: 'PAGADA' },
              { label: 'Anulada', value: 'ANULADA' },
            ]"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Fecha Emision</label>
          <Calendar v-model="form.fecha_emision" dateFormat="yy-mm-dd" showIcon fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Factura Original</label>
          <Select
            v-model="form.factura_original"
            :options="facturasOrigen"
            optionLabel="no_factura"
            optionValue="no_factura"
            placeholder="Seleccionar factura"
            clearable
            filter
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Subtotal</label>
          <InputNumber v-model="form.subtotal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Impuesto</label>
          <InputNumber v-model="form.impuesto" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Descuento</label>
          <InputNumber v-model="form.descuento" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Total</label>
          <InputNumber v-model="form.total" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1 md:col-span-2">
          <label class="text-sm font-semibold">Nota / Motivo</label>
          <Textarea v-model="form.nota" placeholder="Motivo de la nota de credito" rows="3" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Eliminar nota de credito"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="notasParaEliminar.length === 1">Seguro que deseas eliminar la nota de credito <strong>{{ notasParaEliminar[0]?.no_factura }}</strong>?</span>
          <span v-else>Seguro que deseas eliminar <strong>{{ notasParaEliminar.length }}</strong> notas de credito seleccionadas?</span>
        </div>
        <div v-if="notasParaEliminar.length > 1" class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
          Total combinado: <strong>{{ $formatMoney(totalSeleccionadoEliminar) }}</strong>
        </div>
        <div v-if="deleteOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">
            Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.
          </p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly />
        </div>
        <p v-if="deleteOtpError" class="text-red-500 text-xs text-center">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-envelope"
          severity="danger"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarNota"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          @click="borrar"
        />
      </template>
    </Dialog>
    <TicketFacturaPrint ref="ticketPrintRef" />
    <FacturaPdfPrint ref="facturaPdfRef" />
  </div>
</template>
