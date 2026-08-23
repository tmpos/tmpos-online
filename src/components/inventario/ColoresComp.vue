<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import Fieldset from 'primevue/fieldset'
import InputText from 'primevue/inputtext'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useCloudRefresh } from '@/composables/useCloudRefresh'

const toast = useToast()
const colores = ref<any[]>([])
const seleccionados = ref<any[]>([])
const busqueda = ref('')
const loading = ref(false)
const dialogVisible = ref(false)
const deleteVisible = ref(false)
const editando = ref<any>(null)
const nombre = ref('')
const codigo = ref('#000000')

const filtrados = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()
  return texto ? colores.value.filter(color => String(color.nombre || '').toLowerCase().includes(texto)) : colores.value
})

async function cargar() {
  loading.value = true
  try {
    const result = await window.db.getAll('colores')
    if (!result.success) throw new Error(result.error || 'No se pudieron consultar los colores')
    colores.value = Array.isArray(result.data) ? result.data : []
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se cargaron los colores', life: 4000 })
  } finally { loading.value = false }
}

function nuevo() {
  editando.value = null
  nombre.value = ''
  codigo.value = '#000000'
  dialogVisible.value = true
}

function editar(color: any) {
  editando.value = color
  nombre.value = color.nombre || ''
  codigo.value = color.codigo || '#000000'
  dialogVisible.value = true
}

async function guardar() {
  const valor = nombre.value.trim().toUpperCase()
  if (!valor) return
  if (!/^#[0-9A-F]{6}$/i.test(codigo.value)) {
    toast.add({ severity: 'warn', summary: 'Código inválido', detail: 'Usa un color hexadecimal como #000000', life: 3000 })
    return
  }
  const duplicado = colores.value.some(color => color.id !== editando.value?.id && String(color.nombre || '').toUpperCase() === valor)
  if (duplicado) {
    toast.add({ severity: 'warn', summary: 'Color duplicado', detail: 'Ese color ya está registrado', life: 3000 })
    return
  }
  const result = editando.value
    ? await window.db.update('colores', editando.value.id, { nombre: valor, codigo: codigo.value })
    : await window.db.insert('colores', { nombre: valor, codigo: codigo.value, estado: 'activo' })
  if (!result.success) {
    toast.add({ severity: 'error', summary: 'Error', detail: result.error || 'No se pudo guardar el color', life: 4000 })
    return
  }
  dialogVisible.value = false
  toast.add({ severity: 'success', summary: 'Guardado', detail: `Color ${editando.value ? 'actualizado' : 'creado'}`, life: 2500 })
  await cargar()
}

async function eliminarSeleccionados() {
  try {
    for (const color of seleccionados.value) {
      const result = await window.db.delete('colores', color.id)
      if (!result.success) throw new Error(result.error || `No se pudo eliminar ${color.nombre}`)
    }
    const cantidad = seleccionados.value.length
    seleccionados.value = []
    deleteVisible.value = false
    toast.add({ severity: 'success', summary: 'Eliminados', detail: `${cantidad} color(es) eliminados`, life: 2500 })
    await cargar()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se eliminaron los colores', life: 4000 })
  }
}

onMounted(cargar)
useCloudRefresh(['colores'], cargar)
</script>

<template>
  <div>
    <Toast />
    <Fieldset legend="Colores">
      <div class="toolbar-mobile mb-3">
        <InputText v-model="busqueda" placeholder="Buscar color..." />
        <Button label="Nuevo color" icon="pi pi-plus" @click="nuevo" />
      </div>
      <div v-if="seleccionados.length" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium">{{ seleccionados.length }} seleccionado(s)</span>
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="deleteVisible = true" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="seleccionados = []" />
      </div>
      <DataTable v-model:selection="seleccionados" :value="filtrados" :loading="loading" dataKey="id" stripedRows paginator :rows="15" :rowsPerPageOptions="[15, 30, 50]">
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="nombre" header="Nombre" sortable>
          <template #body="{ data }">
            <div class="flex items-center gap-3">
              <span class="w-7 h-7 rounded-full border border-surface-300 shadow-sm" :style="{ backgroundColor: data.codigo || data.nombre }"></span>
              <span class="font-medium">{{ data.nombre }}</span>
              <span class="text-xs text-surface-400">{{ data.codigo }}</span>
            </div>
          </template>
        </Column>
        <Column header="Acciones" style="width: 7rem">
          <template #body="{ data }"><Button icon="pi pi-pencil" severity="info" text rounded @click="editar(data)" /></template>
        </Column>
        <template #empty><div class="text-center py-8 text-surface-500">No hay colores registrados.</div></template>
      </DataTable>
    </Fieldset>

    <Dialog v-model:visible="dialogVisible" :header="editando ? 'Editar color' : 'Nuevo color'" modal :style="{ width: '26rem' }">
      <div class="flex flex-col gap-2 pt-2">
        <label class="font-semibold">Nombre</label>
        <InputText v-model="nombre" placeholder="Ejemplo: NEGRO, AZUL, DORADO" class="uppercase" @keyup.enter="guardar" />
        <label class="font-semibold mt-2">Color visual</label>
        <div class="flex items-center gap-3">
          <input v-model="codigo" type="color" class="w-14 h-11 rounded border border-surface-300 cursor-pointer bg-transparent p-1" />
          <InputText v-model="codigo" placeholder="#000000" class="font-mono uppercase flex-1" maxlength="7" />
          <span class="w-10 h-10 rounded-full border border-surface-300 shadow-sm" :style="{ backgroundColor: codigo }"></span>
        </div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" /><Button label="Guardar" icon="pi pi-check" :disabled="!nombre.trim()" @click="guardar" /></template>
    </Dialog>

    <Dialog v-model:visible="deleteVisible" header="Confirmar" modal :style="{ width: '25rem' }">
      <p>¿Seguro que deseas eliminar los <strong>{{ seleccionados.length }}</strong> colores seleccionados?</p>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="deleteVisible = false" /><Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="eliminarSeleccionados" /></template>
    </Dialog>
  </div>
</template>
