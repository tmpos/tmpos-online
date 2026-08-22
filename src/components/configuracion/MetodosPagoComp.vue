<template>
  <div class="p-4 sm:p-6 max-w-3xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Metodos de Pago</h1>
        <p class="text-sm text-surface-500">Administra las formas de pago del sistema</p>
      </div>
      <button @click="abrirNuevo" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
        <i class="pi pi-plus"></i>Nuevo Metodo
      </button>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <div v-else class="rounded-xl border border-surface-200 dark:border-surface-700 overflow-hidden">
      <table class="w-full text-sm">
        <thead>
          <tr class="bg-surface-50 dark:bg-surface-800 border-b border-surface-200 dark:border-surface-700">
            <th class="text-left py-3 px-4 font-semibold">Nombre</th>
            <th class="text-left py-3 px-4 font-semibold">% Comision</th>
            <th class="text-left py-3 px-4 font-semibold">Estado</th>
            <th class="text-right py-3 px-4 font-semibold">Acciones</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="m in metodos" :key="m.id" class="border-b border-surface-100 dark:border-surface-800 hover:bg-surface-50 dark:hover:bg-surface-800/50">
            <td class="py-3 px-4 font-medium">{{ m.nombre }}</td>
            <td class="py-3 px-4">{{ m.porcentaje ? m.porcentaje + '%' : '-' }}</td>
            <td class="py-3 px-4">
              <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
                :class="m.estado === 'ACTIVO' ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' : 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'"
              >{{ m.estado || 'ACTIVO' }}</span>
            </td>
            <td class="py-3 px-4 text-right">
              <button @click="editar(m)" class="px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700 mr-1"><i class="pi pi-pencil mr-1"></i>Editar</button>
              <button @click="confirmarEliminar(m)" class="px-3 py-1.5 rounded-lg text-xs font-medium border border-red-200 text-red-600 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-950/30"><i class="pi pi-trash mr-1"></i>Eliminar</button>
            </td>
          </tr>
          <tr v-if="metodos.length === 0">
            <td colspan="4" class="text-center py-10 text-surface-400">No hay metodos de pago registrados</td>
          </tr>
        </tbody>
      </table>
    </div>

    <Dialog v-model:visible="dialogVisible" :header="editando ? 'Editar Metodo' : 'Nuevo Metodo de Pago'" modal :style="{ width: 'min(26rem, 92vw)' }" :draggable="false">
      <div class="flex flex-col gap-4 pt-2">
        <div>
          <label class="text-xs font-semibold mb-1 block">Nombre <span class="text-red-500">*</span></label>
          <InputText v-model="form.nombre" placeholder="EFECTIVO" class="w-full uppercase" style="text-transform:uppercase" fluid />
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">% Comision</label>
          <InputNumber v-model="form.porcentaje" :min="0" :max="100" :minFractionDigits="0" :maxFractionDigits="2" placeholder="0" class="w-full" fluid />
          <p class="text-xs text-surface-400 mt-1">Porcentaje que cobra el procesador de pago por transaccion</p>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Estado</label>
          <Select v-model="form.estado" :options="['ACTIVO', 'INACTIVO']" placeholder="Estado" fluid />
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="editando ? 'Guardar' : 'Crear'" icon="pi pi-check" :loading="guardando" @click="guardar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" header="Eliminar metodo de pago" modal :style="{ width: 'min(26rem, 92vw)' }" :draggable="false">
      <div class="flex items-start gap-3 pt-2">
        <span class="w-10 h-10 rounded-full bg-red-100 text-red-600 dark:bg-red-950/40 dark:text-red-400 flex items-center justify-center shrink-0">
          <i class="pi pi-exclamation-triangle"></i>
        </span>
        <div>
          <p class="font-semibold">¿Eliminar {{ metodoAEliminar?.nombre }}?</p>
          <p class="text-sm text-surface-500 mt-1">Las ventas anteriores conservaran el nombre del metodo utilizado. Esta accion no se puede deshacer.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="eliminando" @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" :loading="eliminando" @click="eliminar" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'

const toast = useToast()

const loading = ref(true)
const metodos = ref<any[]>([])
const dialogVisible = ref(false)
const editando = ref(false)
const guardando = ref(false)
const error = ref('')
const form = ref({ id: 0, nombre: '', porcentaje: 0, estado: 'ACTIVO' })
const deleteDialogVisible = ref(false)
const metodoAEliminar = ref<any | null>(null)
const eliminando = ref(false)

async function cargar() {
  loading.value = true
  try {
    const res = await (window as any).electron.invoke('db:getAll', 'metodos_pago')
    if (res.success && res.data) metodos.value = res.data
  } catch {} finally { loading.value = false }
}

function abrirNuevo() {
  editando.value = false
  form.value = { id: 0, nombre: '', porcentaje: 0, estado: 'ACTIVO' }
  error.value = ''
  dialogVisible.value = true
}

function editar(m: any) {
  editando.value = true
  form.value = { id: m.id, nombre: m.nombre, porcentaje: m.porcentaje || 0, estado: m.estado || 'ACTIVO' }
  error.value = ''
  dialogVisible.value = true
}

function confirmarEliminar(metodo: any) {
  metodoAEliminar.value = metodo
  deleteDialogVisible.value = true
}

async function eliminar() {
  if (!metodoAEliminar.value?.id) return
  eliminando.value = true
  try {
    const nombre = String(metodoAEliminar.value.nombre || 'Metodo de pago')
    const res = await window.db.delete('metodos_pago', Number(metodoAEliminar.value.id))
    if (!res.success) throw new Error(res.error || 'No se pudo eliminar el metodo de pago')
    deleteDialogVisible.value = false
    metodoAEliminar.value = null
    toast.add({ severity: 'success', summary: 'Eliminado', detail: nombre, life: 2500 })
    await cargar()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e?.message || 'No se pudo eliminar el metodo de pago', life: 3500 })
  } finally {
    eliminando.value = false
  }
}

async function guardar() {
  if (!form.value.nombre.trim()) { error.value = 'El nombre es requerido'; return }
  guardando.value = true
  error.value = ''
  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      porcentaje: Number(form.value.porcentaje || 0),
      estado: form.value.estado || 'ACTIVO',
    }
    if (editando.value) {
      const res = await (window as any).electron.invoke('db:update', 'metodos_pago', form.value.id, data)
      if (!res.success) throw new Error(res.error)
      toast.add({ severity: 'success', summary: 'Actualizado', detail: data.nombre, life: 2000 })
    } else {
      const res = await (window as any).electron.invoke('db:insert', 'metodos_pago', data)
      if (!res.success) throw new Error(res.error)
      toast.add({ severity: 'success', summary: 'Creado', detail: data.nombre, life: 2000 })
    }
    dialogVisible.value = false
    await cargar()
  } catch (e: any) {
    error.value = e.message || 'Error al guardar'
  } finally {
    guardando.value = false
  }
}

onMounted(cargar)
</script>
