<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Ordenes de Compra</h1>
        <p class="text-sm text-surface-500">Gestiona las ordenes de compra a proveedores</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <label class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
          <ToggleSwitch v-model="verTodosAlmacenes" />
          Todos los almacenes
        </label>
        <Button v-if="selectedOrdenes.length" :label="`Cambiar almacén (${selectedOrdenes.length})`" icon="pi pi-warehouse" severity="success" @click="abrirMoverAlmacen" />
        <button @click="abrirNueva" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
          <i class="pi pi-plus"></i>Nueva Orden
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <template v-else>
      <DataTable :value="ordenes" v-model:selection="selectedOrdenes" stripedRows paginator :rows="15" :rowsPerPageOptions="[15, 25, 50]" dataKey="id" responsiveLayout="scroll" sortField="fecha_orden" :sortOrder="-1">
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="no_orden" header="Orden" sortable style="width:8rem">
          <template #body="{ data }"><span class="font-semibold">{{ data.no_orden }}</span></template>
        </Column>
        <Column field="fecha_orden" header="Fecha" sortable style="width:7rem" />
        <Column field="proveedor_nombre" header="Proveedor" sortable />
        <Column field="estado" header="Estado" sortable style="width:8rem">
          <template #body="{ data }">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.estado === 'RECIBIDA' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : data.estado === 'CANCELADA' ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' : 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400'"
            >{{ data.estado || 'PENDIENTE' }}</span>
          </template>
        </Column>
        <Column field="total" header="Total" sortable style="width:8rem">
          <template #body="{ data }"><span class="font-semibold">{{ $formatMoney(data.total) }}</span></template>
        </Column>
        <Column header="Acciones" style="width:8rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button v-if="data.estado === 'PENDIENTE'" icon="pi pi-check-circle" severity="success" text rounded size="small" @click="recibirOrden(data)" v-tooltip="'Recibir mercancia'" />
              <Button icon="pi pi-eye" severity="info" text rounded size="small" @click="verDetalle(data)" v-tooltip="'Ver detalle'" />
            </div>
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-10 text-surface-400">No hay ordenes de compra registradas.</div>
        </template>
      </DataTable>
    </template>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedOrdenes.length }}</strong> orden(es) de compra a otro almacén:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover órdenes" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogVisible" :header="editando ? 'Editar Orden' : 'Nueva Orden de Compra'" modal :style="{ width: 'min(40rem, 95vw)' }" :draggable="false">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Proveedor</label>
            <Select v-model="form.proveedor_id" :options="proveedores" optionLabel="nombre" optionValue="id" placeholder="Seleccionar" fluid @change="onProveedorChange" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Fecha de Orden</label>
            <Calendar v-model="form.fecha_orden" dateFormat="yy-mm-dd" fluid />
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold mb-1 block">Productos</label>
          <div class="space-y-2">
            <div v-for="(item, i) in form.productos" :key="i" class="flex items-center gap-2">
              <InputText v-model="item.nombre" placeholder="Producto" class="flex-1" fluid />
              <InputNumber v-model="item.cantidad" :min="1" placeholder="Cant" class="w-20" fluid />
              <InputNumber v-model="item.precio" :min="0" placeholder="Precio" class="w-24" fluid :minFractionDigits="2" />
              <span class="text-sm font-semibold w-20 text-right">{{ $formatMoney((item.cantidad || 0) * (item.precio || 0)) }}</span>
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="form.productos.splice(i, 1)" />
            </div>
            <Button label="Agregar producto" icon="pi pi-plus" size="small" severity="info" text @click="form.productos.push({ nombre: '', cantidad: 1, precio: 0 })" />
          </div>
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Subtotal</label>
            <InputNumber v-model="form.subtotal" :min="0" class="w-full" fluid :minFractionDigits="2" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Impuesto</label>
            <InputNumber v-model="form.impuesto" :min="0" class="w-full" fluid :minFractionDigits="2" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Descuento</label>
            <InputNumber v-model="form.descuento" :min="0" class="w-full" fluid :minFractionDigits="2" />
          </div>
        </div>

        <div>
          <label class="text-xs font-semibold mb-1 block">Nota</label>
          <InputText v-model="form.nota" placeholder="Observaciones" fluid />
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" :loading="guardando" @click="guardar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogDetalle" header="Detalle de Orden" modal :style="{ width: 'min(36rem, 95vw)' }">
      <div v-if="ordenSeleccionada" class="space-y-4 pt-2">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-surface-400">Orden:</span> <strong>{{ ordenSeleccionada.no_orden }}</strong></div>
          <div><span class="text-surface-400">Fecha:</span> <strong>{{ ordenSeleccionada.fecha_orden }}</strong></div>
          <div><span class="text-surface-400">Proveedor:</span> <strong>{{ ordenSeleccionada.proveedor_nombre }}</strong></div>
          <div><span class="text-surface-400">Estado:</span> <strong>{{ ordenSeleccionada.estado }}</strong></div>
        </div>
        <div v-if="ordenSeleccionada.productos" class="border-t border-surface-200 dark:border-surface-700 pt-3">
          <h4 class="font-semibold text-sm mb-2">Productos</h4>
          <div v-for="(p, i) in JSON.parse(typeof ordenSeleccionada.productos === 'string' ? ordenSeleccionada.productos : '[]') || []" :key="i" class="flex items-center justify-between py-1.5 text-sm border-b border-surface-100 dark:border-surface-800 last:border-b-0">
            <span>{{ p.nombre }}</span>
            <span class="text-surface-500">{{ p.cantidad }} x {{ $formatMoney(p.precio || 0) }} = <strong>{{ $formatMoney((p.cantidad || 0) * (p.precio || 0)) }}</strong></span>
          </div>
        </div>
        <div class="border-t border-surface-200 dark:border-surface-700 pt-3 space-y-1 text-sm">
          <div class="flex justify-between"><span class="text-surface-400">Subtotal</span><span>{{ $formatMoney(ordenSeleccionada.subtotal) }}</span></div>
          <div v-if="ordenSeleccionada.impuesto" class="flex justify-between"><span class="text-surface-400">Impuesto</span><span>{{ $formatMoney(ordenSeleccionada.impuesto) }}</span></div>
          <div v-if="ordenSeleccionada.descuento" class="flex justify-between"><span class="text-surface-400">Descuento</span><span class="text-red-500">-{{ $formatMoney(ordenSeleccionada.descuento) }}</span></div>
          <div class="flex justify-between text-lg font-bold border-t border-surface-200 dark:border-surface-700 pt-2"><span>Total</span><span>{{ $formatMoney(ordenSeleccionada.total) }}</span></div>
        </div>
        <p v-if="ordenSeleccionada.nota" class="text-xs text-surface-500 italic">{{ ordenSeleccionada.nota }}</p>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogDetalle = false" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, onMounted, watch } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const almacenStore = useAlmacenStore()
const { filterByAlmacen } = useAlmacenFilter()

const loading = ref(true)
const ordenes = ref<any[]>([])
const selectedOrdenes = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const proveedores = ref<any[]>([])
const dialogVisible = ref(false)
const dialogDetalle = ref(false)
const editando = ref(false)
const guardando = ref(false)
const error = ref('')
const ordenSeleccionada = ref<any>(null)

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'ordenes_compra', entity: 'ordenes_compra', label: 'orden de compra',
  selection: selectedOrdenes, reload: cargar,
  reference: (item: any) => item.no_orden || String(item.id || ''),
})
const form = ref({
  proveedor_id: null as number | null,
  proveedor_nombre: '',
  fecha_orden: new Date(),
  productos: [] as any[],
  subtotal: 0,
  impuesto: 0,
  descuento: 0,
  total: 0,
  nota: '',
})

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

async function cargar() {
  loading.value = true
  try {
    const [resOrd, resProv] = await Promise.all([
      (window as any).electron.invoke('db:getAll', 'ordenes_compra'),
      (window as any).electron.invoke('db:getAll', 'proveedores'),
    ])
    if (resOrd.success) {
      ordenes.value = verTodosAlmacenes.value
        ? (resOrd.data || [])
        : filterByAlmacen(resOrd.data || [])
    }
    if (resProv.success) proveedores.value = filterByAlmacen(resProv.data || [])
  } catch {} finally { loading.value = false }
}

watch(verTodosAlmacenes, () => {
  selectedOrdenes.value = []
  ordenSeleccionada.value = null
  cargar()
})

function onProveedorChange() {
  const prov = proveedores.value.find((p: any) => p.id === form.value.proveedor_id)
  form.value.proveedor_nombre = prov?.nombre || ''
}

function abrirNueva() {
  editando.value = false
  form.value = {
    proveedor_id: null,
    proveedor_nombre: '',
    fecha_orden: new Date(),
    productos: [{ nombre: '', cantidad: 1, precio: 0 }],
    subtotal: 0,
    impuesto: 0,
    descuento: 0,
    total: 0,
    nota: '',
  }
  error.value = ''
  dialogVisible.value = true
}

function verDetalle(orden: any) {
  ordenSeleccionada.value = orden
  dialogDetalle.value = true
}

async function recibirOrden(orden: any) {
  guardando.value = true
  try {
    await (window as any).electron.invoke('db:update', 'ordenes_compra', orden.id, {
      estado: 'RECIBIDA',
      fecha_recibido: new Date().toISOString().split('T')[0],
    })
    toast.add({ severity: 'success', summary: 'Orden recibida', detail: `Orden ${orden.no_orden} recibida exitosamente`, life: 3000 })
    await cargar()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al recibir orden', life: 4000 })
  } finally { guardando.value = false }
}

async function guardar() {
  if (!form.value.proveedor_id) { error.value = 'Selecciona un proveedor'; return }
  const items = form.value.productos.filter((p: any) => p.nombre.trim())
  if (items.length === 0) { error.value = 'Agrega al menos un producto'; return }
  guardando.value = true
  error.value = ''
  try {
    const subtotal = items.reduce((s: number, p: any) => s + (p.cantidad || 0) * (p.precio || 0), 0)
    const impuesto = Number(form.value.impuesto || 0)
    const descuento = Number(form.value.descuento || 0)
    const total = subtotal + impuesto - descuento
    const noOrden = `OC-${Date.now().toString(36).toUpperCase()}`
    const data = {
      no_orden: noOrden,
      proveedor_id: form.value.proveedor_id,
      proveedor_nombre: form.value.proveedor_nombre,
      fecha_orden: form.value.fecha_orden instanceof Date ? form.value.fecha_orden.toISOString().split('T')[0] : form.value.fecha_orden,
      estado: 'PENDIENTE',
      productos: JSON.stringify(items),
      subtotal,
      impuesto,
      descuento,
      total,
      nota: form.value.nota,
      usuario: '',
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    }
    const res = await (window as any).electron.invoke('db:insert', 'ordenes_compra', data)
    if (!res.success) throw new Error(res.error)
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Orden creada', detail: noOrden, life: 3000 })
    await cargar()
  } catch (e: any) { error.value = e.message || 'Error al guardar' }
  finally { guardando.value = false }
}

onMounted(async () => {
  await almacenStore.load()
  await cargar()
})
</script>
