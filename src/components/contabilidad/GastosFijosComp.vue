<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import Fieldset from 'primevue/fieldset'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const { addAlmacenId, filterByAlmacen, store: almacenStore } = useAlmacenFilter()
const gastos = ref<any[]>([])
const selectedGastos = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedGasto = ref<any>(null)
const busqueda = ref('')

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'gastos_fijos', entity: 'gastos_fijos', label: 'gasto fijo',
  selection: selectedGastos, reload: cargarGastos,
  reference: (item: any) => item.nombre || String(item.id || ''),
})

const categorias = [
  { label: 'Alquiler', value: 'Alquiler' },
  { label: 'Agua', value: 'Agua' },
  { label: 'Luz', value: 'Luz' },
  { label: 'Internet', value: 'Internet' },
  { label: 'Telefono', value: 'Telefono' },
  { label: 'Nomina', value: 'Nomina' },
  { label: 'Seguros', value: 'Seguros' },
  { label: 'Mantenimiento', value: 'Mantenimiento' },
  { label: 'Publicidad', value: 'Publicidad' },
  { label: 'Otros', value: 'Otros' },
]

const periodicidades = [
  { label: 'Mensual', value: 'MENSUAL' },
  { label: 'Bimestral', value: 'BIMESTRAL' },
  { label: 'Trimestral', value: 'TRIMESTRAL' },
  { label: 'Semestral', value: 'SEMESTRAL' },
  { label: 'Anual', value: 'ANUAL' },
]

const diasMes = Array.from({ length: 31 }, (_, i) => ({ label: `Dia ${i + 1}`, value: i + 1 }))

const formDefault = () => ({
  nombre: '',
  monto: 0,
  dia_pago: 1,
  categoria: 'Otros',
  periodicidad: 'MENSUAL',
  estado: 'ACTIVO',
  descripcion: '',
})

const form = ref(formDefault())

const gastosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return gastos.value
  return gastos.value.filter(g =>
    g.nombre?.toLowerCase().includes(texto) ||
    g.categoria?.toLowerCase().includes(texto) ||
    g.descripcion?.toLowerCase().includes(texto)
  )
})

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getEstadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | undefined {
  return estado === 'ACTIVO' ? 'success' : 'danger'
}

async function cargarGastos() {
  loading.value = true
  try {
    const res = await window.db.getAll('gastos_fijos')
    if (res.success) {
      gastos.value = verTodosAlmacenes.value ? (res.data || []) : filterByAlmacen(res.data || [])
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar los gastos fijos', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, async () => {
  selectedGastos.value = []
  await cargarGastos()
})

function estaSeleccionado(gasto: any): boolean {
  return selectedGastos.value.some((item: any) => Number(item.id) === Number(gasto.id))
}

function toggleSeleccion(gasto: any) {
  if (estaSeleccionado(gasto)) {
    selectedGastos.value = selectedGastos.value.filter((item: any) => Number(item.id) !== Number(gasto.id))
  } else {
    selectedGastos.value = [...selectedGastos.value, gasto]
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedGasto.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(gasto: any) {
  isEditing.value = true
  selectedGasto.value = gasto
  form.value = {
    nombre: gasto.nombre || '',
    monto: gasto.monto || 0,
    dia_pago: gasto.dia_pago || 1,
    categoria: gasto.categoria || 'Otros',
    periodicidad: gasto.periodicidad || 'MENSUAL',
    estado: gasto.estado || 'ACTIVO',
    descripcion: gasto.descripcion || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(gasto: any) {
  selectedGasto.value = gasto
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }
  if (form.value.monto <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El monto debe ser mayor a 0', life: 3000 })
    return
  }

  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      monto: form.value.monto,
      dia_pago: form.value.dia_pago,
      categoria: form.value.categoria,
      periodicidad: form.value.periodicidad,
      estado: form.value.estado,
      descripcion: form.value.descripcion.trim().toUpperCase(),
    }

    if (isEditing.value) {
      const res = await window.db.update('gastos_fijos', selectedGasto.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Gasto fijo actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('gastos_fijos', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Gasto fijo creado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarGastos()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('gastos_fijos', selectedGasto.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Gasto fijo eliminado', life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
      return
    }
    deleteDialogVisible.value = false
    await cargarGastos()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

async function toggleEstado(gasto: any) {
  const nuevo = gasto.estado === 'ACTIVO' ? 'INACTIVO' : 'ACTIVO'
  const res = await window.db.update('gastos_fijos', gasto.id, { estado: nuevo })
  if (res.success) {
    gasto.estado = nuevo
    toast.add({ severity: 'success', summary: nuevo === 'ACTIVO' ? 'Activado' : 'Desactivado', detail: gasto.nombre, life: 2000 })
  }
}

onMounted(async () => {
  await almacenStore.load()
  await cargarGastos()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Gastos Fijos">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar gasto fijo..." />
        </IconField>

        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 text-sm text-surface-600 dark:text-surface-300 cursor-pointer">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            <span>Todos los almacenes</span>
          </label>
          <Button
            v-if="selectedGastos.length"
            :label="`Cambiar almacén (${selectedGastos.length})`"
            icon="pi pi-warehouse"
            severity="success"
            @click="abrirMoverAlmacen"
          />
          <div class="inline-flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer"
              :class="viewMode === 'table'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'table'"
            ><i class="pi pi-list"></i></button>
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-surface-200 dark:border-surface-700"
              :class="viewMode === 'cards'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'cards'"
            ><i class="pi pi-th-large"></i></button>
          </div>
          <Button label="Nuevo Gasto Fijo" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        v-model:selection="selectedGastos"
        :value="gastosFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
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
        <Column field="monto" header="Monto" sortable style="width: 9rem">
          <template #body="{ data }">{{ $formatMoney(data.monto) }}</template>
        </Column>
        <Column field="dia_pago" header="Dia Pago" sortable style="width: 7rem" />
        <Column field="categoria" header="Categoria" sortable style="width: 8rem" />
        <Column field="periodicidad" header="Periodicidad" sortable style="width: 8rem" />
        <Column field="estado" header="Estado" sortable style="width: 7rem">
          <template #body="{ data }">
            <Tag :value="data.estado" :severity="getEstadoSeverity(data.estado)" />
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay gastos fijos registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="gastosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay gastos fijos registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="gasto in gastosFiltrados"
            :key="gasto.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(gasto)"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1">
                <Button
                  :icon="estaSeleccionado(gasto) ? 'pi pi-check-square' : 'pi pi-square'"
                  :severity="estaSeleccionado(gasto) ? 'success' : 'secondary'"
                  text
                  rounded
                  size="small"
                  @click.stop="toggleSeleccion(gasto)"
                  v-tooltip="estaSeleccionado(gasto) ? 'Quitar de la selección' : 'Seleccionar gasto fijo'"
                />
                <span class="text-xs font-mono text-surface-400">#{{ gasto.id }}</span>
              </div>
              <Tag :value="gasto.estado" :severity="getEstadoSeverity(gasto.estado)" />
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-base leading-tight truncate">{{ gasto.nombre || 'Sin nombre' }}</h4>
              <p v-if="gasto.categoria" class="text-xs text-surface-400">{{ gasto.categoria }}</p>
            </div>

            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="text-xs text-surface-400">Monto</span>
                <p class="font-bold text-primary">{{ $formatMoney(gasto.monto) }}</p>
              </div>
              <div>
                <span class="text-xs text-surface-400">Dia Pago</span>
                <p class="font-medium">{{ gasto.dia_pago }}</p>
              </div>
            </div>

            <div class="flex items-center justify-between pt-2 border-t border-surface-100 dark:border-surface-700">
              <span class="text-xs text-surface-400">{{ gasto.periodicidad || 'MENSUAL' }}</span>
              <div class="flex gap-1" @click.stop>
                <ToggleSwitch
                  :modelValue="gasto.estado === 'ACTIVO'"
                  @update:modelValue="toggleEstado(gasto)"
                  size="small"
                />
              </div>
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm text-surface-600 dark:text-surface-300">
          Se moverán {{ selectedGastos.length }} gasto(s) fijo(s) al almacén seleccionado.
        </p>
        <Select
          v-model="almacenDestino"
          :options="almacenesDestino"
          optionLabel="nombre"
          placeholder="Seleccionar almacén destino"
          fluid
        />
        <p v-if="almacenesDestino.length === 0" class="text-sm text-orange-600">
          No hay otro almacén disponible como destino.
        </p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogMoverAlmacen = false" />
        <Button
          label="Cambiar almacén"
          icon="pi pi-warehouse"
          severity="success"
          :loading="moviendoAlmacen"
          :disabled="!almacenDestino"
          @click="aplicarMoverAlmacen"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Gasto Fijo' : 'Nuevo Gasto Fijo'"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre <span class="text-red-400">*</span></label>
          <InputText v-model="form.nombre" placeholder="Nombre del gasto" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Monto (RD$) <span class="text-red-400">*</span></label>
            <InputNumber v-model="form.monto" :min="0" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Dia de Pago</label>
            <Select v-model="form.dia_pago" :options="diasMes" optionLabel="label" optionValue="value" fluid />
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Categoria</label>
            <Select v-model="form.categoria" :options="categorias" optionLabel="label" optionValue="value" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Periodicidad</label>
            <Select v-model="form.periodicidad" :options="periodicidades" optionLabel="label" optionValue="value" fluid />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Descripcion</label>
          <Textarea v-model="form.descripcion" placeholder="Descripcion opcional..." fluid autoResize class="uppercase" style="text-transform: uppercase;" />
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
        <span>Seguro que deseas eliminar este gasto fijo?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
