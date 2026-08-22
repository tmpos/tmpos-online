<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'

const toast = useToast()
const marcas = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedMarca = ref<any>(null)
const busqueda = ref('')

const marcasFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return marcas.value
  return marcas.value.filter(m =>
    m.nombre?.toLowerCase().includes(texto) ||
    m.descripcion?.toLowerCase().includes(texto)
  )
})

const camposArray = ['nombre', 'descripcion', 'estado']
const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCifrado = ref('')
const tokenCorto = ref('')

const form = ref({
  nombre: '',
  descripcion: '',
})

async function cargarMarcas() {
  loading.value = true
  try {
    const res = await window.db.getAll('marcas')
    if (res.success) {
      marcas.value = res.data || []
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

function abrirEditar(marca: any) {
  isEditing.value = true
  selectedMarca.value = marca
  form.value = {
    nombre: marca.nombre,
    descripcion: marca.descripcion || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(marca: any) {
  selectedMarca.value = marca
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()

  try {
    if (isEditing.value) {
      const res = await window.db.update('marcas', selectedMarca.value.id, {
        nombre: nombreMayus,
        descripcion: form.value.descripcion.trim(),
      })
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Marca actualizada', life: 3000 })
      }
    } else {
      const res = await window.db.insert('marcas', {
        nombre: nombreMayus,
        descripcion: form.value.descripcion.trim(),
      })
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Marca creada', life: 3000 })
      }
    }
    dialogVisible.value = false
    await cargarMarcas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('marcas', selectedMarca.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Marca eliminada', life: 3000 })
    }
    deleteDialogVisible.value = false
    await cargarMarcas()
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
    }
  } catch (error) {
    console.error("Error cargando configuracion:", error);
  }

  await cargarMarcas()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Marcas">
      <div class="toolbar-mobile">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar marca..." />
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
          <Button label="Nueva Marca" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="marcasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
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
          <div class="text-center py-6 text-surface-500">No hay marcas registradas.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="marcasFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay marcas registradas.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          <div
            v-for="marca in marcasFiltradas"
            :key="marca.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ marca.id }}</span>
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full"
                :class="marca.estado === 'activo'
                  ? 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
                  : 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'"
              >
                {{ marca.estado }}
              </span>
            </div>
            <div>
              <h4 class="font-bold text-lg leading-tight">{{ marca.nombre }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 mt-1">{{ marca.descripcion || 'Sin descripcion' }}</p>
            </div>
            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button
                icon="pi pi-pencil"
                severity="info"
                text
                rounded
                size="small"
                @click="abrirEditar(marca)"
                v-tooltip="'Editar'"
              />
              <Button
                icon="pi pi-trash"
                severity="danger"
                text
                rounded
                size="small"
                @click="confirmarBorrar(marca)"
                v-tooltip="'Eliminar'"
              />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Marca' : 'Nueva Marca'"
      modal
      :style="{ width: '28rem' }"
    >
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre de la marca" class="uppercase" style="text-transform: uppercase;" />
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

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span>Seguro que deseas eliminar <strong>{{ selectedMarca?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
