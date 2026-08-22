<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Textarea from 'primevue/textarea'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Toast from 'primevue/toast'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const auth = useAuthStore()
const reclamaciones = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const isEditing = ref(false)
const selectedId = ref<number | null>(null)
const busqueda = ref('')
const buscandoFactura = ref(false)
const facturaEncontrada = ref<any>(null)
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const selectedReclamaciones = ref<any[]>([])

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'reclamaciones', entity: 'reclamaciones', label: 'reclamación',
  selection: selectedReclamaciones, reload: cargar,
  reference: (item: any) => item.no_reclamacion || String(item.id || ''),
})

const estados = [
  { label: 'Abierta', value: 'ABIERTA' },
  { label: 'En Proceso', value: 'EN_PROCESO' },
  { label: 'Resuelta', value: 'RESUELTA' },
  { label: 'Cerrada', value: 'CERRADA' },
]

const resultados = [
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'Procede', value: 'PROCEDE' },
  { label: 'No Procede', value: 'NO_PROCEDE' },
]

const form = ref({
  no_reclamacion: '',
  fecha_emision: new Date(),
  fecha_respuesta: null as Date | null,
  fecha_vencimiento: null as Date | null,
  no_factura: '',
  nombre_cliente: '',
  telefono: '',
  whatsapp: '',
  email: '',
  institucion: '',
  articulo: '',
  fecha_compra: null as Date | null,
  no_factura_rel: '',
  estado: 'ABIERTA',
  resultado: 'PENDIENTE',
  respuesta: '',
  fecha_cierre: null as Date | null,
  representante: '',
  uid: '',
})

const reclamacionesFiltradas = computed(() => {
  const q = busqueda.value.toLowerCase().trim()
  if (!q) return reclamaciones.value
  return reclamaciones.value.filter((r: any) =>
    (r.no_reclamacion || '').toLowerCase().includes(q) ||
    (r.nombre_cliente || '').toLowerCase().includes(q) ||
    (r.articulo || '').toLowerCase().includes(q)
  )
})

async function generarNoReclamacion(): Promise<string> {
  try {
    const res = await (window as any).db.getAll('reclamaciones')
    const max = (res.data || []).reduce((maxId: number, r: any) => Math.max(maxId, r.id || 0), 0)
    return `REC${String(max + 1).padStart(8, '0')}`
  } catch { return `REC${String(Date.now()).padStart(8, '0')}` }
}

function formDefault() {
  return {
    no_reclamacion: '',
    fecha_emision: new Date(),
    fecha_respuesta: null as Date | null,
    fecha_vencimiento: null as Date | null,
    no_factura: '',
    nombre_cliente: '',
    telefono: '',
    whatsapp: '',
    email: '',
    institucion: '',
    articulo: '',
    fecha_compra: null as Date | null,
    no_factura_rel: '',
    estado: 'ABIERTA',
    resultado: 'PENDIENTE',
    respuesta: '',
    fecha_cierre: null as Date | null,
    representante: '',
    uid: '',
  }
}

async function abrirCrear() {
  isEditing.value = false
  selectedId.value = null
  facturaEncontrada.value = null
  form.value = formDefault()
  form.value.no_reclamacion = await generarNoReclamacion()
  form.value.fecha_emision = new Date()
  dialogVisible.value = true
}

async function abrirEditar(reclamo: any) {
  isEditing.value = true
  selectedId.value = reclamo.id
  facturaEncontrada.value = null
  form.value = {
    no_reclamacion: reclamo.no_reclamacion || '',
    fecha_emision: reclamo.fecha_emision ? new Date(reclamo.fecha_emision + 'T00:00:00') : new Date(),
    fecha_respuesta: reclamo.fecha_respuesta ? new Date(reclamo.fecha_respuesta + 'T00:00:00') : null,
    fecha_vencimiento: reclamo.fecha_vencimiento ? new Date(reclamo.fecha_vencimiento + 'T00:00:00') : null,
    no_factura: reclamo.no_factura || '',
    nombre_cliente: reclamo.nombre_cliente || '',
    telefono: reclamo.telefono || '',
    whatsapp: reclamo.whatsapp || '',
    email: reclamo.email || '',
    institucion: reclamo.institucion || '',
    articulo: reclamo.articulo || '',
    fecha_compra: reclamo.fecha_compra ? new Date(reclamo.fecha_compra + 'T00:00:00') : null,
    no_factura_rel: reclamo.no_factura_rel || '',
    estado: reclamo.estado || 'ABIERTA',
    resultado: reclamo.resultado || 'PENDIENTE',
    respuesta: reclamo.respuesta || '',
    fecha_cierre: reclamo.fecha_cierre ? new Date(reclamo.fecha_cierre + 'T00:00:00') : null,
    representante: reclamo.representante || '',
    uid: reclamo.uid || '',
  }
  dialogVisible.value = true
}

async function buscarFactura() {
  const nf = form.value.no_factura.trim()
  if (!nf) return
  buscandoFactura.value = true
  try {
    const res = await (window as any).db.getAll('facturas')
    if (res.success) {
      const factura = filterByAlmacen(res.data || []).find((f: any) =>
        String(f.no_factura || '').toLowerCase() === nf.toLowerCase()
      )
      if (factura) {
        facturaEncontrada.value = factura
        form.value.nombre_cliente = factura.nombre_cliente || ''
        form.value.telefono = factura.telefono_cliente || ''
        form.value.no_factura_rel = factura.no_factura || ''
        form.value.fecha_compra = factura.fecha_emision ? new Date(factura.fecha_emision + 'T00:00:00') : null
        const prods = parseProductos(factura.productos)
        if (prods.length > 0) form.value.articulo = prods[0].nombre || ''
        toast.add({ severity: 'success', summary: 'Factura encontrada', detail: `Cliente: ${factura.nombre_cliente}`, life: 3000 })
      } else {
        toast.add({ severity: 'warn', summary: 'No encontrada', detail: 'Factura no encontrada', life: 3000 })
      }
    }
  } catch {} finally {
    buscandoFactura.value = false
  }
}

function parseProductos(productos: any): any[] {
  if (!productos) return []
  if (Array.isArray(productos)) return productos
  try { return JSON.parse(productos) } catch { return [] }
}

async function guardar() {
  if (!form.value.nombre_cliente.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del cliente es requerido', life: 3000 })
    return
  }
  const fecha = (d: Date | null) => d ? d.toISOString().split('T')[0] : ''
  const data = {
    no_reclamacion: form.value.no_reclamacion,
    fecha_emision: fecha(form.value.fecha_emision),
    fecha_respuesta: fecha(form.value.fecha_respuesta),
    fecha_vencimiento: fecha(form.value.fecha_vencimiento),
    no_factura: form.value.no_factura,
    nombre_cliente: form.value.nombre_cliente.trim().toUpperCase(),
    telefono: form.value.telefono.trim(),
    whatsapp: form.value.whatsapp.trim(),
    email: form.value.email.trim().toLowerCase(),
    institucion: form.value.institucion.trim().toUpperCase(),
    articulo: form.value.articulo.trim().toUpperCase(),
    fecha_compra: fecha(form.value.fecha_compra),
    no_factura_rel: form.value.no_factura_rel,
    estado: form.value.estado,
    resultado: form.value.resultado,
    respuesta: form.value.respuesta.trim().toUpperCase(),
    fecha_cierre: fecha(form.value.fecha_cierre),
    representante: form.value.representante.trim().toUpperCase(),
  }
  try {
    if (isEditing.value && selectedId.value) {
      const res = await (window as any).db.update('reclamaciones', selectedId.value, data)
      if (res.success) toast.add({ severity: 'success', summary: 'Actualizado', detail: 'Reclamacion actualizada', life: 3000 })
    } else {
      const res = await (window as any).db.insert('reclamaciones', addAlmacenId(data))
      if (res.success) toast.add({ severity: 'success', summary: 'Creada', detail: 'Reclamacion registrada', life: 3000 })
    }
    dialogVisible.value = false
    await cargar()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al guardar', life: 3000 })
  }
}

async function cargar() {
  loading.value = true
  try {
    const res = await (window as any).db.getAll('reclamaciones')
    if (res.success) {
      reclamaciones.value = puedeVerTodosAlmacenes.value && verTodosAlmacenes.value
        ? (res.data || [])
        : filterByAlmacen(res.data || [])
    }
  } catch {} finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  selectedReclamaciones.value = []
  cargar()
})

function formatFecha(fecha: string): string {
  if (!fecha) return ''
  const parts = String(fecha).split('T')[0].split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fecha
}

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

onMounted(cargar)
</script>

<template>
  <div>
    <Toast />
    <div class="flex items-center gap-3 mb-4 flex-wrap">
      <InputText v-model="busqueda" placeholder="Buscar..." class="w-64" />
      <label v-if="puedeVerTodosAlmacenes" class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
        <ToggleSwitch v-model="verTodosAlmacenes" />
        Todos los almacenes
      </label>
      <Button v-if="selectedReclamaciones.length" :label="`Cambiar almacén (${selectedReclamaciones.length})`" icon="pi pi-warehouse" severity="success" @click="abrirMoverAlmacen" />
      <Button label="Nueva Reclamacion" icon="pi pi-plus" @click="abrirCrear" />
    </div>

    <DataTable
      :value="reclamacionesFiltradas"
      :loading="loading"
      stripedRows
      paginator
      :rows="15"
      :rowsPerPageOptions="[15, 25, 50]"
      responsiveLayout="scroll"
      sortField="fecha_emision"
      :sortOrder="-1"
      dataKey="id"
      v-model:selection="selectedReclamaciones"
      class="!text-xs"
      @row-click="abrirEditar($event.data)"
    >
      <Column selectionMode="multiple" headerStyle="width: 3rem" />
      <Column field="no_reclamacion" header="No." sortable style="width: 9rem" />
      <Column field="fecha_emision" header="Fecha" sortable style="width: 7rem">
        <template #body="{ data }">{{ formatFecha(data.fecha_emision) }}</template>
      </Column>
      <Column field="nombre_cliente" header="Cliente" sortable />
      <Column field="articulo" header="Articulo" sortable />
      <Column field="estado" header="Estado" sortable style="width: 7rem">
        <template #body="{ data }">
          <span class="px-2 py-0.5 rounded-full text-xs font-semibold"
            :class="{
              'bg-yellow-100 text-yellow-800': data.estado === 'ABIERTA',
              'bg-blue-100 text-blue-800': data.estado === 'EN_PROCESO',
              'bg-green-100 text-green-800': data.estado === 'RESUELTA',
              'bg-gray-100 text-gray-800': data.estado === 'CERRADA',
            }">
            {{ data.estado === 'ABIERTA' ? 'Abierta' : data.estado === 'EN_PROCESO' ? 'En Proceso' : data.estado === 'RESUELTA' ? 'Resuelta' : 'Cerrada' }}
          </span>
        </template>
      </Column>
      <Column field="representante" header="Representante" sortable />
      <template #empty>
        <div class="text-center py-8 text-surface-400">No hay reclamaciones registradas.</div>
      </template>
    </DataTable>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedReclamaciones.length }}</strong> reclamación(es) a otro almacén:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover reclamaciones" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogVisible" :header="isEditing ? 'Editar Reclamacion' : 'Nueva Reclamacion'" :modal="true" :style="{ width: 'min(48rem, 95vw)' }" :dismissableMask="false">
      <TabView>
        <TabPanel header="Informacion General">
          <div class="flex flex-col gap-3 pt-2">
            <div class="grid grid-cols-3 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">No. Reclamacion</label>
                <InputText v-model="form.no_reclamacion" disabled />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Fecha Emision</label>
                <Calendar v-model="form.fecha_emision" dateFormat="yy-mm-dd" showIcon fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Fecha Vencimiento</label>
                <Calendar v-model="form.fecha_vencimiento" dateFormat="yy-mm-dd" showIcon fluid />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Fecha Respuesta</label>
                <Calendar v-model="form.fecha_respuesta" dateFormat="yy-mm-dd" showIcon fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Buscar Factura (Opcional)</label>
                <div class="flex gap-2">
                  <InputText v-model="form.no_factura" placeholder="No. Factura" class="flex-1" @keyup.enter="buscarFactura" />
                  <Button icon="pi pi-search" severity="info" :loading="buscandoFactura" @click="buscarFactura" />
                </div>
              </div>
            </div>
            <div class="border-t border-surface-200 dark:border-surface-700 pt-3">
              <p class="text-xs text-surface-500 mb-2">Datos del Cliente</p>
              <div class="grid grid-cols-2 gap-3">
                <div class="flex flex-col gap-1 col-span-2">
                  <label class="text-sm font-semibold">Nombre Completo</label>
                  <InputText v-model="form.nombre_cliente" placeholder="Nombre completo del cliente" fluid />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-semibold">Telefono</label>
                  <InputText v-model="form.telefono" placeholder="Telefono" fluid />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-semibold">WhatsApp</label>
                  <InputText v-model="form.whatsapp" placeholder="WhatsApp" fluid />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-semibold">Email</label>
                  <InputText v-model="form.email" placeholder="Correo electronico" fluid />
                </div>
                <div class="flex flex-col gap-1">
                  <label class="text-sm font-semibold">Institucion</label>
                  <InputText v-model="form.institucion" placeholder="Institucion" fluid />
                </div>
              </div>
            </div>
          </div>
        </TabPanel>
        <TabPanel header="Detalle de Reclamacion">
          <div class="flex flex-col gap-3 pt-2">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Articulo Reclamado</label>
                <InputText v-model="form.articulo" placeholder="Nombre del articulo o servicio reclamado" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Fecha de Compra</label>
                <Calendar v-model="form.fecha_compra" dateFormat="yy-mm-dd" showIcon fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">No. Factura Relacionada</label>
                <InputText v-model="form.no_factura_rel" placeholder="Numero de factura" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Representante</label>
                <InputText v-model="form.representante" placeholder="Nombre del representante" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Estado</label>
                <Select v-model="form.estado" :options="estados" optionLabel="label" optionValue="value" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Resultado</label>
                <Select v-model="form.resultado" :options="resultados" optionLabel="label" optionValue="value" fluid />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Respuesta de la Reclamacion</label>
              <Textarea v-model="form.respuesta" rows="4" placeholder="Ingrese la respuesta detallada de la reclamacion..." fluid />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Fecha de Cierre</label>
              <Calendar v-model="form.fecha_cierre" dateFormat="yy-mm-dd" showIcon fluid />
            </div>
          </div>
        </TabPanel>
      </TabView>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>
  </div>
</template>
