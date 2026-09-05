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
import SelectButton from 'primevue/selectbutton'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron, peticionesFetch, encryptarPassword } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { getImageUrl, uploadImage, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { useFilteredSearch } from '@/composables/useSearch'
import { CUSTOMER_TYPE_OPTIONS, customerTypeLabel, normalizeCustomerType } from '@/domain/customerTypes'

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
const guardandoCliente = ref(false)
const tipoDocumento = ref<'RNC' | 'CEDULA'>('RNC')
const buscandoDocumento = ref(false)

const camposArray = [
  'nombre',
  'telefono',
  'email',
  'direccion',
  'rnc',
  'tipo_cliente',
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
  tipo_cliente: 'NORMAL',
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

async function guardarImagenCliente(imagen: string) {
  const imagenAnterior = form.value.imagen
  form.value.imagen = imagen
  if (!isEditing.value || !selectedCliente.value?.id) return

  const actualizado = await window.db.update('clientes', selectedCliente.value.id, { imagen })
  if (!actualizado.success) {
    form.value.imagen = imagenAnterior
    throw new Error(actualizado.error || 'No se pudo guardar la foto del cliente')
  }

  selectedCliente.value.imagen = imagen
  const local = clientes.value.find((cliente: any) => cliente.id === selectedCliente.value.id)
  if (local) local.imagen = imagen
  if (isOnline()) await pushLocalRowToCloud('clientes', selectedCliente.value.id)
}

async function quitarImagen() {
  const imagenAnterior = form.value.imagen
  try {
    await guardarImagenCliente('')
    if (imagenAnterior) {
      try { await deleteImage(imagenAnterior) } catch {}
    }
    if (fileInput.value) fileInput.value.value = ''
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo quitar la foto', life: 3500 })
  }
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

  if (!tmCloudConnected()) {
    toast.add({ severity: 'warn', summary: 'TM Cloud no configurado', detail: 'Configura TM Cloud para subir fotos de clientes', life: 3500 })
    input.value = ''
    return
  }

  subiendoImagen.value = true
  try {
    const imagenAnterior = form.value.imagen
    const imagenNueva = await uploadImage(file, 'clientes')
    try {
      await guardarImagenCliente(imagenNueva)
    } catch (error) {
      try { await deleteImage(imagenNueva) } catch {}
      throw error
    }
    if (imagenAnterior && imagenAnterior !== imagenNueva) {
      try { await deleteImage(imagenAnterior) } catch {}
    }
    toast.add({
      severity: 'success',
      summary: 'Foto subida',
      detail: isEditing.value ? 'La foto del cliente fue actualizada' : 'La foto se guardara con el nuevo cliente',
      life: 2500,
    })
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
  'nombre', 'rnc', 'cedula', 'email', 'telefono', 'whatsapp', 'direccion', 'codigo', 'tipo_cliente',
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
  tipoDocumento.value = 'RNC'
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
    tipo_cliente: normalizeCustomerType(cliente.tipo_cliente),
  }
  tipoDocumento.value = form.value.rnc.replace(/\D/g, '').length === 11 ? 'CEDULA' : 'RNC'
  dialogVisible.value = true
}

async function buscarDocumentoApi() {
  const documento = form.value.rnc.trim().replace(/\D/g, '')
  if (!documento) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un RNC o Cedula', life: 3000 })
    return
  }

  form.value.rnc = documento
  buscandoDocumento.value = true
  try {
    const tokenCifrado = await encryptarPassword('1234567890abc', 10)
    const resultado: any = tipoDocumento.value === 'CEDULA'
      ? await peticionesFetch('https://demo.tmposrd.com/api2', 'buscarcedula', { cedula: documento }, tokenCifrado, 'POST')
      : await peticionesFetch('https://demo.tmposrd.com/api2', `consultarrnc/${documento}`, {}, tokenCifrado, 'GET')

    if (resultado?.error) {
      toast.add({ severity: 'error', summary: 'Error', detail: resultado.error, life: 4000 })
      return
    }

    let datos = resultado?.datos || resultado?.data || resultado
    if (Array.isArray(datos)) datos = datos[0]
    if (!datos || typeof datos !== 'object' || Object.keys(datos).length === 0) {
      toast.add({ severity: 'info', summary: 'No encontrado', detail: 'No se encontraron datos para ese documento', life: 3000 })
      return
    }

    const nombre = datos.name || datos.nombre || datos.razon_social || datos.RazonSocial || ''
    const direccion = datos.direccion || datos.Direccion || datos.address || datos.domicilio || ''
    if (nombre) form.value.nombre = String(nombre).toUpperCase()
    if (direccion) form.value.direccion = String(direccion).toUpperCase()

    toast.add({
      severity: 'success',
      summary: 'Encontrado',
      detail: form.value.nombre ? `Datos cargados: ${form.value.nombre}` : 'Documento encontrado',
      life: 3000,
    })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'Error al consultar API', life: 4000 })
  } finally {
    buscandoDocumento.value = false
  }
}

function confirmarBorrar(cliente: any) {
  selectedCliente.value = cliente
  deleteDialogVisible.value = true
}

async function guardar() {
  if (subiendoImagen.value || guardandoCliente.value) return
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  guardandoCliente.value = true
  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      rnc: form.value.rnc.trim(),
      email: form.value.email.trim().toLowerCase(),
      telefono: form.value.telefono.trim(),
      direccion: form.value.direccion.trim().toUpperCase(),
      imagen: form.value.imagen || '',
      tipo_cliente: normalizeCustomerType(form.value.tipo_cliente),
    }

    if (isEditing.value) {
      const res = await window.db.update('clientes', selectedCliente.value.id, data)
      if (res.success) {
        if (isOnline()) {
          const sincronizado = await pushLocalRowToCloud('clientes', selectedCliente.value.id)
          if (!sincronizado.success) {
            toast.add({ severity: 'warn', summary: 'Cliente guardado localmente', detail: sincronizado.error || 'La sincronizacion quedo pendiente', life: 4500 })
          }
        }
        if ((window as any).__onlineOnly) {
          const verificacion = await window.db.getById('clientes', selectedCliente.value.id)
          if (!verificacion.success || String(verificacion.data?.imagen || '') !== String(data.imagen || '')) {
            throw new Error('El servidor no confirmo la imagen del cliente')
          }
        }
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Cliente actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('clientes', addAlmacenId(data))
      if (res.success) {
        const clienteId = Number(res.data?.id || res.id || 0)
        if (isOnline() && clienteId) {
          const sincronizado = await pushLocalRowToCloud('clientes', clienteId)
          if (!sincronizado.success) {
            toast.add({ severity: 'warn', summary: 'Cliente guardado localmente', detail: sincronizado.error || 'La sincronizacion quedo pendiente', life: 4500 })
          }
        }
        if ((window as any).__onlineOnly && clienteId) {
          const verificacion = await window.db.getById('clientes', clienteId)
          if (!verificacion.success || String(verificacion.data?.imagen || '') !== String(data.imagen || '')) {
            throw new Error('El servidor no confirmo la imagen del cliente')
          }
        }
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Cliente creado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarClientes()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'Error al guardar', life: 4000 })
  } finally {
    guardandoCliente.value = false
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
        <Column field="tipo_cliente" header="Tipo" sortable style="width: 10rem">
          <template #body="{ data }">
            <span class="inline-flex rounded-full bg-primary-50 dark:bg-primary-900/30 px-2.5 py-1 text-xs font-semibold text-primary">
              {{ customerTypeLabel(data.tipo_cliente) }}
            </span>
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
              <span class="rounded-full bg-primary-50 dark:bg-primary-900/30 px-2 py-1 text-xs font-semibold text-primary">
                {{ customerTypeLabel(cliente.tipo_cliente) }}
              </span>
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
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Tipo de cliente</label>
          <Select
            v-model="form.tipo_cliente"
            :options="CUSTOMER_TYPE_OPTIONS"
            optionLabel="label"
            optionValue="value"
            placeholder="Seleccionar tipo"
            fluid
          />
          <small class="text-surface-500">Este tipo sugiere el comprobante correspondiente al facturar.</small>
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Documento</label>
          <div class="flex flex-col sm:flex-row gap-2">
            <SelectButton v-model="tipoDocumento" :options="['RNC', 'CEDULA']" class="shrink-0" />
            <div class="flex flex-1 gap-2">
              <InputText
                v-model="form.rnc"
                :placeholder="tipoDocumento === 'RNC' ? 'RNC' : 'Cedula'"
                class="flex-1"
                fluid
                @keyup.enter="buscarDocumentoApi"
              />
              <Button
                icon="pi pi-search"
                severity="info"
                :loading="buscandoDocumento"
                @click="buscarDocumentoApi"
                v-tooltip="'Buscar en API'"
              />
            </div>
          </div>
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
        <Button
          :label="isEditing ? 'Actualizar' : 'Guardar'"
          icon="pi pi-check"
          :loading="guardandoCliente"
          :disabled="subiendoImagen"
          @click="guardar"
        />
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
