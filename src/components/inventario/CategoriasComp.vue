<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import Tooltip from 'primevue/tooltip'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js';
import { useDatosEmpresa } from '@/stores'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
const datosEmpresa = useDatosEmpresa();
const { store: almacenStore } = useAlmacenFilter()

const toast = useToast()
const categorias = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedCategoria = ref<any>(null)
const selectedCategorias = ref<any[]>([])
const deletingMultiple = ref(false)
const dialogMoverAlmacenMulti = ref(false)
const almacenDestinoMulti = ref<any>(null)
const almacenesDestinoMulti = ref<any[]>([])
const moviendoAlmacenMulti = ref(false)
const busqueda = ref('')

const categoriasFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return categorias.value
  return categorias.value.filter(c =>
    c.nombre?.toLowerCase().includes(texto) ||
    c.descripcion?.toLowerCase().includes(texto)
  )
})

/****************************************************************/
const camposArray = ['nombre', 'descripcion', 'estado'];
/****************************************************************/
const link = ref('');
const api = ref('');
const token = ref('');
const patronTelefono = ref('');
const linkImpresora = ref('');
const patroncedula = ref('');
const tokenCifrado = ref('');
const tokenCorto = ref('');
/****************************************************************/

const form = ref({
  nombre: '',
  descripcion: '',
})

async function cargarCategorias() {
  loading.value = true
  try {
    const res = await window.db.getAll('categorias')
    if (res.success) {
      categorias.value = res.data || []
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  form.value = { nombre: '', descripcion: '' }
  dialogVisible.value = true
}

function abrirEditar(categoria: any) {
  isEditing.value = true
  selectedCategoria.value = categoria
  form.value = {
    nombre: categoria.nombre,
    descripcion: categoria.descripcion || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(categoria: any) {
  deletingMultiple.value = false
  selectedCategoria.value = categoria
  deleteDialogVisible.value = true
}

function confirmarBorrarMultiple() {
  if (selectedCategorias.value.length === 0) return
  deletingMultiple.value = true
  deleteDialogVisible.value = true
}

async function borrarMultiple() {
  const seleccionadas = [...selectedCategorias.value]
  try {
    for (const categoria of seleccionadas) {
      const res = await window.db.delete('categorias', categoria.id)
      if (!res.success) throw new Error(res.error || `No se pudo eliminar ${categoria.nombre}`)
    }
    selectedCategorias.value = []
    deleteDialogVisible.value = false
    deletingMultiple.value = false
    toast.add({ severity: 'success', summary: 'Eliminadas', detail: `${seleccionadas.length} categoria(s) eliminadas`, life: 2500 })
    await cargarCategorias()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron eliminar las categorias', life: 4000 })
  }
}

async function abrirMoverAlmacenMulti() {
  if (selectedCategorias.value.length === 0) return
  almacenDestinoMulti.value = null
  try {
    await almacenStore.load()
    const origenUid = String(selectedCategorias.value[0].almacen_uid || almacenStore.activeUid || '')
    almacenesDestinoMulti.value = almacenStore.almacenes.filter((almacen: any) => String(almacen.uid || '') !== origenUid)
    dialogMoverAlmacenMulti.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function aplicarMoverAlmacenMulti() {
  if (!almacenDestinoMulti.value || moviendoAlmacenMulti.value) return
  const destinoId = Number(almacenDestinoMulti.value.id || almacenDestinoMulti.value)
  const destinoUid = String(almacenDestinoMulti.value.uid || '')
  const destinoNombre = String(almacenDestinoMulti.value.nombre || '')
  const seleccionadas = [...selectedCategorias.value]
  moviendoAlmacenMulti.value = true
  try {
    for (const categoria of seleccionadas) {
      const res = await window.db.update('categorias', categoria.id, { almacen_id: destinoId, almacen_uid: destinoUid })
      if (!res.success) throw new Error(res.error || `No se pudo mover ${categoria.nombre}`)
    }
    selectedCategorias.value = []
    dialogMoverAlmacenMulti.value = false
    toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: `${seleccionadas.length} categoria(s) movidas a ${destinoNombre}`, life: 3000 })
    await cargarCategorias()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cambiar el almacen', life: 4000 })
  } finally {
    moviendoAlmacenMulti.value = false
  }
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()

  try {
    if (isEditing.value) {
      const res = await window.db.update('categorias', selectedCategoria.value.id, {
        nombre: nombreMayus,
        descripcion: form.value.descripcion.trim(),
      })
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Categoria actualizada', life: 3000 })
      }
    } else {
      const res = await window.db.insert('categorias', {
        nombre: nombreMayus,
        descripcion: form.value.descripcion.trim(),
      })
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Categoria creada', life: 3000 })
      }
    }
    dialogVisible.value = false
    await cargarCategorias()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('categorias', selectedCategoria.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Categoria eliminada', life: 3000 })
    }
    deleteDialogVisible.value = false
    await cargarCategorias()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo');
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || '';
      api.value = datosJSON.VITE_LINK_API || '';
      token.value = datosJSON.VITE_TOKEN || '';
      patronTelefono.value = datosJSON.VITE_PATRON_TELEFONO || '';
      linkImpresora.value = datosJSON.VITE_IMPRESORA_LOCAL || '';
      patroncedula.value = datosJSON.VITE_PATRON_CEDULA || '';
      tokenCorto.value = datosJSON.VITE_TOKEN_CORTO || '';
    } else {
      console.warn("No se pudieron cargar los datos de configuracion, usando valores por defecto");
    }
  } catch (error) {
    console.error("Error cargando configuracion:", error);
  }

  await cargarCategorias()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Categorias">
      <div class="toolbar-mobile">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar categoria..." />
        </IconField>
        <div class="flex items-center gap-2">
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
        <Button label="Nueva Categoria" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

    <!-- Vista Tabla -->
    <div v-if="viewMode === 'table' && selectedCategorias.length > 0" class="flex flex-wrap items-center gap-2 p-2 mb-2 rounded-lg bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800">
      <span class="text-sm font-medium">{{ selectedCategorias.length }} seleccionada(s)</span>
      <Button label="Cambiar Almacen" icon="pi pi-warehouse" severity="success" size="small" @click="abrirMoverAlmacenMulti" />
      <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" @click="confirmarBorrarMultiple" />
      <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="selectedCategorias = []" v-tooltip="'Limpiar seleccion'" />
    </div>

    <DataTable
      v-if="viewMode === 'table'"
      :value="categoriasFiltradas"
      :loading="loading"
      stripedRows
      paginator
      :rows="10"
      :rowsPerPageOptions="[10, 25, 50]"
      dataKey="id"
      responsiveLayout="scroll"
      v-model:selection="selectedCategorias"
    >
      <Column selectionMode="multiple" headerStyle="width: 3rem" />
      <Column field="id" header="ID" style="width: 5rem" />
      <Column field="nombre" header="Nombre" sortable />
      <Column field="descripcion" header="Descripcion" sortable />
      <Column field="estado" header="Estado" style="width: 8rem" />
      <Column header="Acciones" style="width: 10rem">
        <template #body="{ data }">
          <div class="flex gap-2">
            <Button
              icon="pi pi-pencil"
              severity="info"
              text
              rounded
              @click="abrirEditar(data)"
              v-tooltip="'Editar'"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              @click="confirmarBorrar(data)"
              v-tooltip="'Eliminar'"
            />
          </div>
        </template>
      </Column>

      <template #empty>
        <div class="text-center py-6 text-surface-500">No hay categorias registradas.</div>
      </template>
    </DataTable>

    <!-- Vista Cards -->
    <div v-else>
      <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
      <div v-else-if="categoriasFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay categorias registradas.</div>
      <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        <div
          v-for="cat in categoriasFiltradas"
          :key="cat.id"
          class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md"
        >
          <div class="flex items-center justify-between">
            <span class="text-xs font-mono text-surface-400">#{{ cat.id }}</span>
            <span
              class="text-xs font-semibold px-2 py-0.5 rounded-full"
              :class="cat.estado === 'activo'
                ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'"
            >
              {{ cat.estado }}
            </span>
          </div>
          <div>
            <h4 class="font-bold text-lg leading-tight">{{ cat.nombre }}</h4>
            <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">{{ cat.descripcion || 'Sin descripcion' }}</p>
          </div>
          <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
            <Button
              icon="pi pi-pencil"
              severity="info"
              text
              rounded
              size="small"
              @click="abrirEditar(cat)"
              v-tooltip="'Editar'"
            />
            <Button
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              size="small"
              @click="confirmarBorrar(cat)"
              v-tooltip="'Eliminar'"
            />
          </div>
        </div>
      </div>
    </div>

    </Fieldset>

    <!-- Dialog Crear / Editar -->
    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Categoria' : 'Nueva Categoria'"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre de la categoria" class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Descripcion</label>
          <Textarea v-model="form.descripcion" rows="3" placeholder="Descripcion (opcional)" />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>

    <!-- Dialog Confirmar Borrar -->
    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span v-if="deletingMultiple">Seguro que deseas eliminar las <strong>{{ selectedCategorias.length }}</strong> categorias seleccionadas?</span>
        <span v-else>Seguro que deseas eliminar <strong>{{ selectedCategoria?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="deletingMultiple ? borrarMultiple() : borrar()" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogMoverAlmacenMulti" header="Cambiar Almacen" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedCategorias.length }}</strong> categoria(s) a otro almacen:</p>
        <Select v-model="almacenDestinoMulti" :options="almacenesDestinoMulti" optionLabel="nombre" placeholder="Seleccionar almacen destino..." fluid />
        <p v-if="almacenesDestinoMulti.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para el traslado.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacenMulti" @click="dialogMoverAlmacenMulti = false" />
        <Button label="Aplicar" icon="pi pi-warehouse" :loading="moviendoAlmacenMulti" :disabled="!almacenDestinoMulti" @click="aplicarMoverAlmacenMulti" />
      </template>
    </Dialog>
  </div>
</template>
