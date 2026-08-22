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
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { getImageUrl, uploadImageSource, deleteImage } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { useFilteredSearch } from '@/composables/useSearch'

const toast = useToast()
const { fiscal } = useLocaleProfile()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const clientes = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedCliente = ref<any>(null)
const fileInput = ref<HTMLInputElement | null>(null)
const imagenPreview = ref('')
const dialogImagenVisible = ref(false)
const subiendoImagen = ref(false)

const camposArray = [
  'nombre',
  'telefono',
  'email',
  'direccion',
  'rnc',
  'imagen',
  'created_at',
  'updated_at',
]

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCorto = ref('')

const formDefault = () => ({
  nombre: '',
  rnc: '',
  email: '',
  telefono: '',
  direccion: '',
  imagen: '',
})

const form = ref(formDefault())

function iniciales(nombre: string) {
  const partes = String(nombre || '').trim().split(/\s+/).filter(Boolean)
  return partes.slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase() || '?'
}

function abrirImagen(src: string) {
  imagenPreview.value = src
  dialogImagenVisible.value = true
}

async function quitarImagen() {
  const imagenAnterior = form.value.imagen
  try { await deleteImage(imagenAnterior) } catch {}
  form.value.imagen = ''
  if (isEditing.value && selectedCliente.value?.id) {
    await window.db.update('clientes', selectedCliente.value.id, { imagen: '' })
    const local = clientes.value.find((cliente: any) => cliente.id === selectedCliente.value.id)
    if (local) local.imagen = ''
    if (isOnline()) await pushLocalRowToCloud('clientes', selectedCliente.value.id)
  }
  if (fileInput.value) fileInput.value.value = ''
}

function imagenDesdeArchivo(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const img = new Image()
      img.onload = () => {
        const maxSide = 900
        const ratio = Math.min(1, maxSide / Math.max(img.width, img.height))
        const canvas = document.createElement('canvas')
        canvas.width = Math.max(1, Math.round(img.width * ratio))
        canvas.height = Math.max(1, Math.round(img.height * ratio))
        const ctx = canvas.getContext('2d')
        if (!ctx) {
          reject(new Error('No se pudo procesar la imagen'))
          return
        }
        ctx.drawImage(img, 0, 0, canvas.width, canvas.height)
        resolve(canvas.toDataURL('image/jpeg', 0.78))
      }
      img.onerror = () => reject(new Error('Imagen invalida'))
      img.src = String(reader.result || '')
    }
    reader.onerror = () => reject(new Error('No se pudo leer la imagen'))
    reader.readAsDataURL(file)
  })
}

async function procesarImagen(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona una imagen valida', life: 3000 })
    input.value = ''
    return
  }

  if (file.size > 8 * 1024 * 1024) {
    toast.add({ severity: 'warn', summary: 'Imagen muy grande', detail: 'Selecciona una imagen menor a 8MB', life: 3000 })
    input.value = ''
    return
  }

  subiendoImagen.value = true
  try {
    const localImage = await imagenDesdeArchivo(file)
    try {
      form.value.imagen = await uploadImageSource(localImage, 'clientes', `cliente-${Date.now()}.jpg`)
      if (isEditing.value && selectedCliente.value?.id) {
        const actualizado = await window.db.update('clientes', selectedCliente.value.id, { imagen: form.value.imagen })
        if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo guardar la foto')
        selectedCliente.value.imagen = form.value.imagen
        const local = clientes.value.find((cliente: any) => cliente.id === selectedCliente.value.id)
        if (local) local.imagen = form.value.imagen
        if (isOnline()) await pushLocalRowToCloud('clientes', selectedCliente.value.id)
      }
      toast.add({ severity: 'success', summary: 'Imagen subida', detail: 'Foto guardada en TM Cloud', life: 2000 })
    } catch (uploadError: any) {
      form.value.imagen = localImage
      toast.add({ severity: 'warn', summary: 'Imagen local', detail: uploadError?.message || 'No se pudo subir a TM Cloud', life: 3500 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo cargar la imagen', life: 3000 })
  } finally {
    subiendoImagen.value = false
    input.value = ''
  }
}

function imagenClienteUrl(valor: string | null | undefined): string {
  return valor ? (getImageUrl(valor) || valor) : ''
}

const { query: busqueda, results: clientesFiltrados } = useFilteredSearch(clientes, [
  'nombre', 'rnc', 'cedula', 'email', 'telefono', 'whatsapp', 'direccion', 'codigo',
])

async function cargarClientes() {
  loading.value = true
  try {
    const res = await window.db.getAll('clientes')
    if (res.success) {
      clientes.value = filterByAlmacen(res.data || [])
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar los clientes', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedCliente.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(cliente: any) {
  isEditing.value = true
  selectedCliente.value = cliente
  form.value = {
    nombre: cliente.nombre || '',
    rnc: cliente.rnc || '',
    email: cliente.email || '',
    telefono: cliente.telefono || '',
    direccion: cliente.direccion || '',
    imagen: cliente.imagen || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(cliente: any) {
  selectedCliente.value = cliente
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      rnc: form.value.rnc.trim(),
      email: form.value.email.trim().toLowerCase(),
      telefono: form.value.telefono.trim(),
      direccion: form.value.direccion.trim().toUpperCase(),
      imagen: form.value.imagen || '',
    }

    if (isEditing.value) {
      const res = await window.db.update('clientes', selectedCliente.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Cliente actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('clientes', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Cliente creado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarClientes()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('clientes', selectedCliente.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Cliente eliminado', life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
      return
    }
    deleteDialogVisible.value = false
    await cargarClientes()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || ''
      api.value = datosJSON.VITE_LINK_API || ''
      token.value = datosJSON.VITE_TOKEN || ''
      patronTelefono.value = datosJSON.VITE_PATRON_TELEFONO || ''
      linkImpresora.value = datosJSON.VITE_IMPRESORA_LOCAL || ''
      patroncedula.value = datosJSON.VITE_PATRON_CEDULA || ''
      tokenCorto.value = datosJSON.VITE_TOKEN_CORTO || ''
    }
  } catch (error) {
    console.error('Error cargando configuracion:', error)
  }

  await cargarClientes()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Clientes">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar cliente..." />
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
          <Button label="Nuevo Cliente" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="clientesFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column header="Acciones" style="width: 8rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-pencil" severity="info" text rounded @click.stop="abrirEditar(data)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded @click.stop="confirmarBorrar(data)" v-tooltip="'Eliminar'" />
            </div>
          </template>
        </Column>
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="nombre" header="Nombre" sortable>
          <template #body="{ data }">
            <div class="flex items-center gap-3 min-w-0">
              <div class="w-10 h-10 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                <img v-if="data.imagen" :src="imagenClienteUrl(data.imagen)" class="w-full h-full object-cover" alt="Foto del cliente" />
                <span v-else class="text-xs font-bold text-primary">{{ iniciales(data.nombre) }}</span>
              </div>
              <span class="font-semibold truncate">{{ data.nombre }}</span>
            </div>
          </template>
        </Column>
        <Column field="rnc" :header="fiscal.customerIdLabel" sortable style="width: 8rem" />
        <Column field="email" header="Email" sortable />
        <Column field="telefono" header="Telefono" sortable style="width: 9rem" />
        <Column field="direccion" header="Direccion" sortable />

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay clientes registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="clientesFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay clientes registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="cliente in clientesFiltrados"
            :key="cliente.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(cliente)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ cliente.id }}</span>
              <i class="pi pi-user text-primary-500"></i>
            </div>

            <div class="flex items-center gap-3 min-w-0">
              <div class="w-16 h-16 rounded-xl overflow-hidden border border-surface-200 dark:border-surface-700 bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center shrink-0">
                <img v-if="cliente.imagen" :src="imagenClienteUrl(cliente.imagen)" class="w-full h-full object-cover" alt="Foto del cliente" />
                <span v-else class="text-lg font-bold text-primary">{{ iniciales(cliente.nombre) }}</span>
              </div>
              <div class="min-w-0">
                <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ cliente.nombre }}</h4>
                <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ cliente.rnc || `Sin ${fiscal.customerIdLabel}` }}</p>
              </div>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-phone text-surface-400"></i>
                <span class="truncate">{{ cliente.telefono || 'Sin telefono' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-envelope text-surface-400"></i>
                <span class="truncate">{{ cliente.email || 'Sin email' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-map-marker text-surface-400"></i>
                <span class="truncate">{{ cliente.direccion || 'Sin direccion' }}</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(cliente)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(cliente)" v-tooltip="'Eliminar'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Cliente' : 'Nuevo Cliente'"
      modal
      :style="{ width: '34rem' }"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col items-center gap-3 sm:col-span-2">
          <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="procesarImagen" />
          <div class="relative w-28 h-28 rounded-2xl overflow-hidden border border-surface-200 dark:border-surface-700 bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
            <img
              v-if="form.imagen"
              :src="imagenClienteUrl(form.imagen)"
              class="w-full h-full object-cover cursor-zoom-in"
              alt="Foto del cliente"
              @click="abrirImagen(imagenClienteUrl(form.imagen))"
            />
            <span v-else class="text-2xl font-bold text-primary">{{ iniciales(form.nombre) }}</span>
          </div>
          <div class="flex items-center gap-2">
            <Button :label="form.imagen ? 'Cambiar Foto' : 'Agregar Foto'" icon="pi pi-camera" severity="secondary" outlined size="small" :loading="subiendoImagen" @click="fileInput?.click()" />
            <Button v-if="form.imagen" icon="pi pi-trash" severity="danger" text rounded size="small" @click="quitarImagen" v-tooltip="'Quitar foto'" />
          </div>
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre del cliente" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">{{ fiscal.customerIdLabel }}</label>
          <InputText v-model="form.rnc" :placeholder="fiscal.customerIdLabel" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Email</label>
          <InputText v-model="form.email" placeholder="correo@dominio.com" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Telefono</label>
          <InputText v-model="form.telefono" placeholder="Telefono" fluid />
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Direccion</label>
          <Textarea v-model="form.direccion" rows="2" placeholder="Direccion" class="uppercase" style="text-transform: uppercase;" />
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogImagenVisible" header="Foto del cliente" modal :style="{ width: 'min(34rem, 94vw)' }">
      <div class="flex items-center justify-center bg-surface-100 dark:bg-surface-900 rounded-xl overflow-hidden">
        <img v-if="imagenPreview" :src="imagenPreview" class="max-w-full max-h-[70vh] object-contain" alt="Foto del cliente" />
      </div>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span>Seguro que deseas eliminar <strong>{{ selectedCliente?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
