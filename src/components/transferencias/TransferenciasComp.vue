<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Transferencias entre Almacenes</h1>
        <p class="text-sm text-surface-500">Mueve inventario de un almacen a otro</p>
      </div>
      <div class="flex items-center gap-2 flex-wrap">
        <Select
          v-model="almacenFiltro"
          :options="almacenesFiltroOptions"
          optionLabel="label"
          optionValue="value"
          placeholder="Filtrar por almacén"
          class="w-56"
        />
        <button @click="abrirNueva" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
          <i class="pi pi-plus"></i>Nueva Transferencia
        </button>
      </div>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <template v-else>
      <DataTable :value="transferenciasFiltradas" stripedRows paginator :rows="15" dataKey="id" responsiveLayout="scroll" sortField="created_at" :sortOrder="-1">
        <Column field="no_transferencia" header="Transf." sortable style="width:8rem">
          <template #body="{ data }"><span class="font-semibold">{{ data.no_transferencia }}</span></template>
        </Column>
        <Column field="origen_nombre" header="Origen" sortable />
        <Column field="destino_nombre" header="Destino" sortable />
        <Column v-if="almacenFiltro !== TODOS_ALMACENES" header="Movimiento" style="width:7rem">
          <template #body="{ data }">
            <span class="inline-flex items-center gap-1 text-xs font-semibold" :class="direccionTransferencia(data) === 'SALIDA' ? 'text-orange-600' : 'text-green-600'">
              <i :class="direccionTransferencia(data) === 'SALIDA' ? 'pi pi-arrow-up-right' : 'pi pi-arrow-down-left'"></i>
              {{ direccionTransferencia(data) }}
            </span>
          </template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width:8rem">
          <template #body="{ data }">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.estado === 'COMPLETADA' ? 'bg-green-100 text-green-700' : data.estado === 'CANCELADA' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'"
            >{{ data.estado || 'PENDIENTE' }}</span>
          </template>
        </Column>
        <Column field="created_at" header="Fecha" sortable style="width:8rem" />
        <Column header="Acciones" style="width:6rem">
          <template #body="{ data }">
            <Button icon="pi pi-eye" severity="info" text rounded size="small" @click="verDetalle(data)" v-tooltip="'Ver detalle'" />
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-10 text-surface-400">No hay transferencias registradas.</div>
        </template>
      </DataTable>
    </template>

    <Dialog v-model:visible="dialogVisible" header="Nueva Transferencia" modal :style="{ width: 'min(44rem, 95vw)' }" :draggable="false">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Origen</label>
            <Select v-model="form.origen_id" :options="almacenesDisponibles" optionLabel="nombre" optionValue="id" placeholder="Origen" fluid @change="cargarProductosOrigen" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Destino</label>
            <Select v-model="form.destino_id" :options="almacenesDestino" optionLabel="nombre" optionValue="id" placeholder="Destino" fluid />
          </div>
        </div>
        <div v-if="form.origen_id">
          <label class="text-xs font-semibold mb-1 block">Seleccionar productos</label>
          <div class="flex gap-2 mb-2">
            <Select v-model="tablaOrigen" :options="tablasInventario" optionLabel="label" optionValue="value" placeholder="Tipo de producto" fluid class="w-48" @change="cargarProductosOrigen" />
            <InputText v-model="busquedaProd" placeholder="Buscar..." fluid @input="cargarProductosOrigen" />
          </div>
          <div v-if="productosOrigen.length > 0" class="max-h-48 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg divide-y divide-surface-100 dark:divide-surface-700">
            <label v-for="(p, i) in productosOrigen" :key="i" class="flex items-center gap-3 px-3 py-2 hover:bg-surface-50 dark:hover:bg-surface-800 cursor-pointer text-sm">
              <Checkbox :inputId="'prod-' + i" :binary="true" v-model="p.selected" />
              <span class="flex-1">{{ p.nombre }}</span>
              <span class="text-surface-400 text-xs">Stock: {{ p.cantidad || 0 }}</span>
              <InputNumber v-model="p.transferir" :min="1" :max="p.cantidad || 0" placeholder="Cant" class="w-20" fluid :disabled="!p.selected" />
            </label>
          </div>
          <div v-else class="text-sm text-surface-400 py-4 text-center">No hay productos disponibles en el almacen origen.</div>
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Realizar Transferencia" icon="pi pi-arrow-right-arrow-left" :loading="guardando" @click="realizarTransferencia" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogDetalle" header="Detalle de Transferencia" modal :style="{ width: 'min(36rem, 95vw)' }">
      <div v-if="transfSeleccionada" class="space-y-4 pt-2">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div><span class="text-surface-400">Transferencia:</span> <strong>{{ transfSeleccionada.no_transferencia }}</strong></div>
          <div><span class="text-surface-400">Fecha:</span> <strong>{{ $formatDateTime(transfSeleccionada.created_at) }}</strong></div>
          <div><span class="text-surface-400">Origen:</span> <strong>{{ transfSeleccionada.origen_nombre }}</strong></div>
          <div><span class="text-surface-400">Destino:</span> <strong>{{ transfSeleccionada.destino_nombre }}</strong></div>
          <div><span class="text-surface-400">Estado:</span> <strong>{{ transfSeleccionada.estado }}</strong></div>
        </div>
        <div class="border-t border-surface-200 dark:border-surface-700 pt-3">
          <h4 class="font-semibold text-sm mb-2">Productos transferidos</h4>
          <div v-for="(p, i) in productosParseados" :key="i" class="flex justify-between py-1.5 text-sm border-b border-surface-100 dark:border-surface-800 last:border-b-0">
            <span>{{ p.nombre }}</span>
            <span class="text-surface-500">Cantidad: <strong>{{ p.cantidad }}</strong></span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogDetalle = false" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Checkbox from 'primevue/checkbox'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useSystemModeStore } from '@/stores/systemMode'

const toast = useToast()
const almacenStore = useAlmacenStore()
const systemMode = useSystemModeStore()

const loading = ref(true)
const transferencias = ref<any[]>([])
const almacenesDisponibles = ref<any[]>([])
const dialogVisible = ref(false)
const dialogDetalle = ref(false)
const guardando = ref(false)
const error = ref('')
const transfSeleccionada = ref<any>(null)
const tablaOrigen = ref('')
const busquedaProd = ref('')
const productosOrigen = ref<any[]>([])
const TODOS_ALMACENES = '__TODOS__'
const almacenFiltro = ref('')

const tablasInventario = computed(() => [
  { label: systemMode.productLabel, value: 'accesorios' },
  { label: 'Electrodomesticos', value: 'electrodomesticos' },
  { label: 'Piezas Taller', value: 'piezas' },
])

const almacenesDestino = computed(() =>
  almacenesDisponibles.value.filter((a: any) => a.id !== form.value.origen_id)
)

function almacenKey(almacen: any): string {
  return almacen?.uid ? `uid:${almacen.uid}` : `id:${Number(almacen?.id || 0)}`
}

const almacenesFiltroOptions = computed(() => [
  { label: 'Todos los almacenes', value: TODOS_ALMACENES },
  ...almacenesDisponibles.value.map((almacen: any) => ({
    label: almacen.nombre || `Almacén ${almacen.id}`,
    value: almacenKey(almacen),
  })),
])

const almacenSeleccionado = computed(() =>
  almacenesDisponibles.value.find((almacen: any) => almacenKey(almacen) === almacenFiltro.value) || null
)

function transferenciaPerteneceAlmacen(transferencia: any, almacen: any): boolean {
  if (!almacen) return false
  const coincideOrigen = almacen.uid && transferencia.origen_uid
    ? String(transferencia.origen_uid) === String(almacen.uid)
    : Number(transferencia.origen_id || 0) === Number(almacen.id || 0)
  const coincideDestino = almacen.uid && transferencia.destino_uid
    ? String(transferencia.destino_uid) === String(almacen.uid)
    : Number(transferencia.destino_id || 0) === Number(almacen.id || 0)
  return coincideOrigen || coincideDestino
}

const transferenciasFiltradas = computed(() => {
  if (almacenFiltro.value === TODOS_ALMACENES) return transferencias.value
  return transferencias.value.filter((transferencia: any) =>
    transferenciaPerteneceAlmacen(transferencia, almacenSeleccionado.value)
  )
})

function direccionTransferencia(transferencia: any): 'ENTRADA' | 'SALIDA' {
  const almacen = almacenSeleccionado.value
  if (!almacen) return 'SALIDA'
  const esOrigen = almacen.uid && transferencia.origen_uid
    ? String(transferencia.origen_uid) === String(almacen.uid)
    : Number(transferencia.origen_id || 0) === Number(almacen.id || 0)
  return esOrigen ? 'SALIDA' : 'ENTRADA'
}

const productosParseados = computed(() => {
  if (!transfSeleccionada.value?.productos) return []
  try {
    return JSON.parse(typeof transfSeleccionada.value.productos === 'string' ? transfSeleccionada.value.productos : '[]')
  } catch { return [] }
})

const form = ref({ origen_id: null as number | null, destino_id: null as number | null })

async function cargar() {
  loading.value = true
  try {
    const [resTrans] = await Promise.all([
      (window as any).electron.invoke('db:getAll', 'transferencias'),
      almacenStore.load(),
    ])
    if (resTrans.success) transferencias.value = resTrans.data || []
    almacenesDisponibles.value = almacenStore.almacenes
    if (!almacenFiltro.value) {
      const activo = almacenesDisponibles.value.find((almacen: any) =>
        (almacenStore.activeUid && String(almacen.uid || '') === String(almacenStore.activeUid)) ||
        Number(almacen.id || 0) === Number(almacenStore.activeId || 0)
      )
      almacenFiltro.value = activo ? almacenKey(activo) : TODOS_ALMACENES
    }
  } catch {} finally { loading.value = false }
}

async function cargarProductosOrigen() {
  if (!form.value.origen_id || !tablaOrigen.value) { productosOrigen.value = []; return }
  try {
    const res = await (window as any).electron.invoke('db:getAll', tablaOrigen.value)
    if (res.success) {
      const origen = almacenesDisponibles.value.find((a: any) => a.id === form.value.origen_id)
      let items = (res.data || []).filter((p: any) =>
        p.almacen_uid ? String(p.almacen_uid) === String(origen?.uid || '') : Number(p.almacen_id) === form.value.origen_id
      )
      const texto = busquedaProd.value.toLowerCase().trim()
      if (texto) items = items.filter((p: any) => p.nombre?.toLowerCase().includes(texto))
      productosOrigen.value = items.map((p: any) => ({ ...p, selected: false, transferir: 1 }))
    }
  } catch {}
}

function abrirNueva() {
  const origen = almacenSeleccionado.value || almacenesDisponibles.value.find((almacen: any) =>
    (almacenStore.activeUid && String(almacen.uid || '') === String(almacenStore.activeUid)) ||
    Number(almacen.id || 0) === Number(almacenStore.activeId || 0)
  )
  form.value = { origen_id: origen?.id || null, destino_id: null }
  tablaOrigen.value = ''
  busquedaProd.value = ''
  productosOrigen.value = []
  error.value = ''
  dialogVisible.value = true
}

function verDetalle(t: any) {
  transfSeleccionada.value = t
  dialogDetalle.value = true
}

async function realizarTransferencia() {
  if (!form.value.origen_id || !form.value.destino_id) { error.value = 'Selecciona origen y destino'; return }
  if (form.value.origen_id === form.value.destino_id) { error.value = 'Origen y destino deben ser diferentes'; return }
  const items = productosOrigen.value.filter((p: any) => p.selected && p.transferir > 0)
  if (items.length === 0) { error.value = 'Selecciona al menos un producto'; return }
  guardando.value = true; error.value = ''
  try {
    const noTrans = `TR-${Date.now().toString(36).toUpperCase()}`
    const origen = almacenesDisponibles.value.find((a: any) => a.id === form.value.origen_id)
    const destino = almacenesDisponibles.value.find((a: any) => a.id === form.value.destino_id)
    const data = {
      no_transferencia: noTrans,
      origen_id: form.value.origen_id,
      destino_id: form.value.destino_id,
      origen_uid: origen?.uid || '',
      destino_uid: destino?.uid || '',
      almacen_uid: origen?.uid || '',
      origen_nombre: origen?.nombre || '',
      destino_nombre: destino?.nombre || '',
      productos: JSON.stringify(items.map((p: any) => ({ id: p.id, nombre: p.nombre, cantidad: p.transferir }))),
      estado: 'COMPLETADA',
      usuario: localStorage.getItem('mr_user_usuario') || '',
    }
    const res = await (window as any).electron.invoke('transferencia:realizar', {
      tabla: tablaOrigen.value,
      items: items.map((p: any) => ({ id: p.id, cantidad: p.transferir })),
      origen_id: form.value.origen_id,
      destino_id: form.value.destino_id,
      origen_uid: origen?.uid || '',
      destino_uid: destino?.uid || '',
      transferencia: data,
    })
    if (!res.success) throw new Error(res.error)
    window.dispatchEvent(new CustomEvent('inventory-changed', { detail: { table: tablaOrigen.value, updated: items.length, deleted: 0 } }))
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Transferencia realizada', detail: noTrans, life: 3000 })
    await cargar()
  } catch (e: any) { error.value = e.message || 'Error al realizar transferencia' }
  finally { guardando.value = false }
}

onMounted(cargar)
</script>
