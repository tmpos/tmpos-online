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
const capacidades = ref<any[]>([])
const seleccionadas = ref<any[]>([])
const busqueda = ref('')
const loading = ref(false)
const editorVisible = ref(false)
const eliminarVisible = ref(false)
const editando = ref<any>(null)
const nombre = ref('')

const filtradas = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()
  return texto ? capacidades.value.filter(item => String(item.nombre || '').toLowerCase().includes(texto)) : capacidades.value
})

async function cargar() {
  loading.value = true
  try {
    const result = await window.db.getAll('capacidades')
    if (!result.success) throw new Error(result.error || 'No se pudieron consultar las capacidades')
    capacidades.value = Array.isArray(result.data) ? result.data : []
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se cargaron las capacidades', life: 4000 })
  } finally { loading.value = false }
}

function nueva() {
  editando.value = null
  nombre.value = ''
  editorVisible.value = true
}

function editar(item: any) {
  editando.value = item
  nombre.value = item.nombre || ''
  editorVisible.value = true
}

async function guardar() {
  const valor = nombre.value.trim().toUpperCase().replace(/\s+/g, '')
  if (!valor) return
  if (capacidades.value.some(item => item.id !== editando.value?.id && String(item.nombre || '').toUpperCase() === valor)) {
    toast.add({ severity: 'warn', summary: 'Capacidad duplicada', detail: 'Esa capacidad ya existe', life: 3000 })
    return
  }
  const result = editando.value
    ? await window.db.update('capacidades', editando.value.id, { nombre: valor })
    : await window.db.insert('capacidades', { nombre: valor, estado: 'activo' })
  if (!result.success) {
    toast.add({ severity: 'error', summary: 'Error', detail: result.error || 'No se pudo guardar', life: 4000 })
    return
  }
  editorVisible.value = false
  toast.add({ severity: 'success', summary: 'Guardado', detail: `Capacidad ${editando.value ? 'actualizada' : 'creada'}`, life: 2500 })
  await cargar()
}

async function eliminarSeleccionadas() {
  try {
    for (const item of seleccionadas.value) {
      const result = await window.db.delete('capacidades', item.id)
      if (!result.success) throw new Error(result.error || `No se pudo eliminar ${item.nombre}`)
    }
    const cantidad = seleccionadas.value.length
    seleccionadas.value = []
    eliminarVisible.value = false
    toast.add({ severity: 'success', summary: 'Eliminadas', detail: `${cantidad} capacidad(es) eliminadas`, life: 2500 })
    await cargar()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron eliminar', life: 4000 })
  }
}

onMounted(cargar)
useCloudRefresh(['capacidades'], cargar)
</script>

<template>
  <div>
    <Toast />
    <Fieldset legend="Capacidades">
      <div class="toolbar-mobile mb-3">
        <InputText v-model="busqueda" placeholder="Buscar capacidad..." />
        <Button label="Nueva capacidad" icon="pi pi-plus" @click="nueva" />
      </div>
      <div v-if="seleccionadas.length" class="flex items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
        <span class="text-sm font-medium">{{ seleccionadas.length }} seleccionada(s)</span>
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="eliminarVisible = true" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="seleccionadas = []" />
      </div>
      <DataTable v-model:selection="seleccionadas" :value="filtradas" :loading="loading" dataKey="id" stripedRows paginator :rows="15" :rowsPerPageOptions="[15, 30, 50]">
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="nombre" header="Capacidad" sortable />
        <Column header="Acciones" style="width: 7rem"><template #body="{ data }"><Button icon="pi pi-pencil" severity="info" text rounded @click="editar(data)" /></template></Column>
        <template #empty><div class="text-center py-8 text-surface-500">No hay capacidades registradas.</div></template>
      </DataTable>
    </Fieldset>
    <Dialog v-model:visible="editorVisible" :header="editando ? 'Editar capacidad' : 'Nueva capacidad'" modal :style="{ width: '26rem' }">
      <div class="flex flex-col gap-2 pt-2"><label class="font-semibold">Capacidad</label><InputText v-model="nombre" placeholder="Ejemplo: 64GB, 128GB, 220L" class="uppercase" @keyup.enter="guardar" /></div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="editorVisible = false" /><Button label="Guardar" icon="pi pi-check" :disabled="!nombre.trim()" @click="guardar" /></template>
    </Dialog>
    <Dialog v-model:visible="eliminarVisible" header="Confirmar" modal :style="{ width: '25rem' }">
      <p>¿Seguro que deseas eliminar las <strong>{{ seleccionadas.length }}</strong> capacidades seleccionadas?</p>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="eliminarVisible = false" /><Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="eliminarSeleccionadas" /></template>
    </Dialog>
  </div>
</template>
