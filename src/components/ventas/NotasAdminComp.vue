<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useCloudRefresh } from '@/composables/useCloudRefresh'

const toast = useToast()
const notas = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const selectedNota = ref<any>(null)
const selectedNotas = ref<any[]>([])
const eliminacionMultiple = ref(false)
const eliminando = ref(false)
const busqueda = ref('')
const form = ref({ titulo: '', contenido: '' })
const isEditing = ref(false)

const notasFiltradas = computed(() => {
  const termino = busqueda.value.trim().toLocaleLowerCase()
  if (!termino) return notas.value

  return notas.value.filter((nota) =>
    [nota.id, nota.titulo, nota.contenido]
      .some((valor) => String(valor ?? '').toLocaleLowerCase().includes(termino)),
  )
})

async function cargarNotas() {
  loading.value = true
  try {
    const res = await window.db.getAll('notas')
    if (res.success) {
      notas.value = res.data || []
      const idsSeleccionados = new Set(selectedNotas.value.map((nota) => nota.id))
      selectedNotas.value = notas.value.filter((nota) => idsSeleccionados.has(nota.id))
    } else {
      notas.value = []
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar las notas online', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  form.value = { titulo: '', contenido: '' }
  dialogVisible.value = true
}

function abrirEditar(nota: any) {
  isEditing.value = true
  selectedNota.value = nota
  form.value = { titulo: nota.titulo, contenido: nota.contenido || '' }
  dialogVisible.value = true
}

function confirmarBorrar(nota: any) {
  selectedNota.value = nota
  eliminacionMultiple.value = false
  deleteDialogVisible.value = true
}

function confirmarBorrarSeleccionadas() {
  if (!selectedNotas.value.length) return
  selectedNota.value = null
  eliminacionMultiple.value = true
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.titulo.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El titulo es requerido', life: 3000 })
    return
  }

  const data = {
    titulo: form.value.titulo.trim().toUpperCase(),
    contenido: form.value.contenido.trim(),
  }

  try {
    if (isEditing.value) {
      const res = await window.db.update('notas', selectedNota.value.id, data)
      if (res.success) toast.add({ severity: 'success', summary: 'Exito', detail: 'Nota actualizada', life: 3000 })
    } else {
      const res = await window.db.insert('notas', data)
      if (res.success) toast.add({ severity: 'success', summary: 'Exito', detail: 'Nota creada', life: 3000 })
    }
    dialogVisible.value = false
    await cargarNotas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  const objetivos = eliminacionMultiple.value
    ? [...selectedNotas.value]
    : selectedNota.value
      ? [selectedNota.value]
      : []

  if (!objetivos.length || eliminando.value) return

  eliminando.value = true
  const fallidos: any[] = []

  try {
    for (const nota of objetivos) {
      try {
        const res = await window.db.delete('notas', nota.id)
        if (!res.success) fallidos.push(nota)
      } catch {
        fallidos.push(nota)
      }
    }

    const eliminadas = objetivos.length - fallidos.length

    if (eliminadas > 0) {
      toast.add({
        severity: 'success',
        summary: 'Exito',
        detail: eliminadas === 1 ? 'Nota eliminada' : `${eliminadas} notas eliminadas`,
        life: 3000,
      })
    }

    if (fallidos.length > 0) {
      toast.add({
        severity: 'error',
        summary: 'Error',
        detail: `No se pudieron eliminar ${fallidos.length} nota(s) en la nube`,
        life: 4000,
      })
    }

    deleteDialogVisible.value = false
    selectedNota.value = null
    selectedNotas.value = fallidos
    await cargarNotas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    eliminando.value = false
  }
}

useCloudRefresh(['notas'], cargarNotas)

onMounted(cargarNotas)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Notas">
      <div class="flex items-center justify-between mb-4">
        <span class="text-sm text-surface-500">
          {{ busqueda.trim() ? `${notasFiltradas.length} de ${notas.length}` : notas.length }} nota(s) registradas
        </span>
        <div class="flex items-center gap-2">
          <Button
            v-if="selectedNotas.length"
            :label="`Eliminar (${selectedNotas.length})`"
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="confirmarBorrarSeleccionadas"
          />
          <Button label="Nueva Nota" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div class="mb-4">
        <span class="p-input-icon-left w-full">
          <i class="pi pi-search" />
          <InputText
            v-model="busqueda"
            placeholder="Buscar por titulo, contenido o ID..."
            class="w-full"
          />
        </span>
      </div>

      <DataTable
        v-model:selection="selectedNotas"
        :value="notasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="titulo" header="Titulo" sortable />
        <Column field="contenido" header="Contenido" sortable>
          <template #body="{ data }">
            <span class="text-surface-500 text-sm truncate block max-w-xs">{{ data.contenido || '-' }}</span>
          </template>
        </Column>
        <Column header="Acciones" style="width: 10rem">
          <template #body="{ data }">
            <div class="flex gap-2">
              <Button icon="pi pi-pencil" severity="info" text rounded @click="abrirEditar(data)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded @click="confirmarBorrar(data)" v-tooltip="'Eliminar'" />
            </div>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay notas registradas.</div>
        </template>
      </DataTable>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Nota' : 'Nueva Nota'"
      modal
      :style="{ width: '32rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Titulo</label>
          <InputText v-model="form.titulo" placeholder="Titulo de la nota" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Contenido</label>
          <Textarea v-model="form.contenido" placeholder="Contenido de la nota" fluid autoResize :rows="4" />
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
        <span v-if="eliminacionMultiple">
          Seguro que deseas eliminar <strong>{{ selectedNotas.length }} notas</strong>?
        </span>
        <span v-else>Seguro que deseas eliminar <strong>{{ selectedNota?.titulo }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="eliminando" @click="deleteDialogVisible = false" />
        <Button
          :label="eliminacionMultiple ? `Eliminar (${selectedNotas.length})` : 'Eliminar'"
          icon="pi pi-trash"
          severity="danger"
          :loading="eliminando"
          @click="borrar"
        />
      </template>
    </Dialog>
  </div>
</template>
