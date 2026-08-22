<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Ajustes de Inventario</h1>
        <p class="text-sm text-surface-500">Registra ajustes de stock por perdida, daño, robo, etc.</p>
      </div>
      <button @click="abrirNuevo" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
        <i class="pi pi-plus"></i>Nuevo Ajuste
      </button>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <template v-else>
      <DataTable :value="ajustes" stripedRows paginator :rows="15" dataKey="id" responsiveLayout="scroll" sortField="created_at" :sortOrder="-1">
        <Column field="created_at" header="Fecha" sortable style="width:8rem">
          <template #body="{ data }">{{ $formatDateTime(data.created_at) }}</template>
        </Column>
        <Column field="producto_nombre" header="Producto" sortable />
        <Column field="tabla" header="Tipo" sortable style="width:7rem" />
        <Column field="tipo" header="Ajuste" sortable style="width:6rem">
          <template #body="{ data }">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.tipo === 'ENTRADA' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'"
            >{{ data.tipo }}</span>
          </template>
        </Column>
        <Column header="Stock Anterior" style="width:6rem"><template #body="{ data }">{{ data.cantidad_anterior }}</template></Column>
        <Column header="Stock Nuevo" style="width:6rem"><template #body="{ data }">{{ data.cantidad_nueva }}</template></Column>
        <Column header="Diferencia" style="width:6rem">
          <template #body="{ data }">
            <span :class="data.diferencia >= 0 ? 'text-green-600' : 'text-red-600'" class="font-semibold">{{ data.diferencia >= 0 ? '+' : '' }}{{ data.diferencia }}</span>
          </template>
        </Column>
        <Column field="motivo" header="Motivo" sortable />
        <template #empty>
          <div class="text-center py-10 text-surface-400">No hay ajustes registrados.</div>
        </template>
      </DataTable>
    </template>

    <Dialog v-model:visible="dialogVisible" header="Nuevo Ajuste de Inventario" modal :style="{ width: 'min(36rem, 95vw)' }" :draggable="false">
      <div class="flex flex-col gap-4 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Tipo de producto</label>
            <Select v-model="form.tabla" :options="tablasInventario" optionLabel="label" optionValue="value" placeholder="Seleccionar" fluid @change="cargarProductos" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Tipo de ajuste</label>
            <Select v-model="form.tipo" :options="['ENTRADA', 'SALIDA']" placeholder="Tipo" fluid />
          </div>
        </div>
        <div v-if="form.tabla">
          <label class="text-xs font-semibold mb-1 block">Producto</label>
          <Select v-model="form.producto_id" :options="productos" optionLabel="nombre" optionValue="id" placeholder="Buscar producto" fluid filter @change="onProductoChange" />
        </div>
        <div v-if="form.producto_id" class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Stock actual</label>
            <InputNumber v-model="cantidadActual" disabled class="w-full" fluid />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Nuevo stock</label>
            <InputNumber v-model="form.cantidad_nueva" :min="0" class="w-full" fluid @update:modelValue="calcularDiferencia" />
          </div>
        </div>
        <div v-if="form.producto_id && form.cantidad_nueva !== undefined" class="text-center">
          <span class="text-sm">Diferencia: <strong :class="diferencia >= 0 ? 'text-green-600' : 'text-red-600'">{{ diferencia >= 0 ? '+' : '' }}{{ diferencia }}</strong></span>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Motivo <span class="text-red-500">*</span></label>
          <InputText v-model="form.motivo" placeholder="Ej: Perdida, robo, daño, error de inventario..." fluid />
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Realizar Ajuste" icon="pi pi-check" :loading="guardando" @click="realizarAjuste" />
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
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useSystemModeStore } from '@/stores/systemMode'

const toast = useToast()
const almacenStore = useAlmacenStore()
const systemMode = useSystemModeStore()

const loading = ref(true)
const ajustes = ref<any[]>([])
const dialogVisible = ref(false)
const guardando = ref(false)
const error = ref('')
const productos = ref<any[]>([])
const cantidadActual = ref(0)

const tablasInventario = computed(() => [
  { label: systemMode.productLabel, value: 'accesorios' },
  { label: 'Electrodomesticos', value: 'electrodomesticos' },
  { label: 'Piezas Taller', value: 'piezas' },
])

const form = ref({ tabla: '', producto_id: null as number | null, cantidad_nueva: undefined as number | undefined, tipo: '', motivo: '' })

const diferencia = computed(() => {
  if (form.value.cantidad_nueva === undefined || cantidadActual.value === undefined) return 0
  return Number(form.value.cantidad_nueva) - Number(cantidadActual.value)
})

async function cargar() {
  loading.value = true
  try {
    const res = await (window as any).electron.invoke('db:getAll', 'ajustes_inventario')
    if (res.success) ajustes.value = res.data || []
  } catch {} finally { loading.value = false }
}

async function cargarProductos() {
  if (!form.value.tabla) { productos.value = []; return }
  try {
    const res = await (window as any).electron.invoke('db:getAll', form.value.tabla)
    if (res.success) productos.value = (res.data || []).filter((p: any) => p.nombre)
  } catch { productos.value = [] }
}

function onProductoChange() {
  const p = productos.value.find((x: any) => x.id === form.value.producto_id)
  cantidadActual.value = Number(p?.cantidad || 0)
  form.value.cantidad_nueva = cantidadActual.value
}

function calcularDiferencia() {}

function abrirNuevo() {
  form.value = { tabla: '', producto_id: null, cantidad_nueva: undefined, tipo: '', motivo: '' }
  cantidadActual.value = 0
  productos.value = []
  error.value = ''
  dialogVisible.value = true
}

async function realizarAjuste() {
  if (!form.value.tabla || !form.value.producto_id || form.value.cantidad_nueva === undefined) { error.value = 'Completa todos los campos'; return }
  if (!form.value.motivo.trim()) { error.value = 'El motivo es requerido'; return }
  if (!form.value.tipo) { error.value = 'Selecciona el tipo de ajuste'; return }
  guardando.value = true; error.value = ''
  try {
    const res = await (window as any).electron.invoke('ajuste:realizar', {
      tabla: form.value.tabla,
      producto_id: form.value.producto_id,
      cantidad_nueva: form.value.cantidad_nueva,
      motivo: form.value.motivo.trim(),
      tipo: form.value.tipo,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    })
    if (!res.success) throw new Error(res.error)
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Ajuste realizado', detail: `${diferencia.value >= 0 ? '+' : ''}${diferencia.value} unidades`, life: 3000 })
    await cargar()
  } catch (e: any) { error.value = e.message || 'Error al realizar ajuste' }
  finally { guardando.value = false }
}

onMounted(cargar)
</script>
