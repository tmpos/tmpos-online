<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted, watch } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import Tag from 'primevue/tag'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { uploadImage, getImageUrl, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'
import { useCloudRefresh } from '@/composables/useCloudRefresh'

const toast = useToast()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const piezas = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedPieza = ref<any>(null)
const selectedPiezas = ref<any[]>([])
const busqueda = ref('')
const verTodosAlmacenes = ref(false)

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'piezas', entity: 'piezas', label: 'pieza',
  selection: selectedPiezas, reload: cargarPiezas,
  reference: (item: any) => item.nombre || String(item.id || ''),
})

function formatCurrency(val: number): string {
  return val != null ? val.toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '0.00'
}

const dialogMovimientos = ref(false)
const movimientosPieza = ref<any[]>([])
const piezaMovimiento = ref<any>(null)

const camposArray = [
  'nombre',
  'costo',
  'precio_venta',
  'cantidad',
  'alerta',
  'proveedor',
  'descripcion',
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
  costo: 0,
  precio_venta: 0,
  cantidad: 0,
  alerta: 1,
  proveedor: '',
  descripcion: '',
  imagen: '',
})

const form = ref(formDefault())
const fileInput = ref<HTMLInputElement | null>(null)
const subiendoImagen = ref(false)

const proveedores = ref<any[]>([])
const dialogNuevoProveedor = ref(false)
const nuevoProveedorForm = ref({ nombre: '', telefono: '' })
const guardandoProveedor = ref(false)

const piezasFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return piezas.value
  return piezas.value.filter(p =>
    p.nombre?.toLowerCase().includes(texto) ||
    p.proveedor?.toLowerCase().includes(texto) ||
    p.descripcion?.toLowerCase().includes(texto)
  )
})

async function cargarPiezas() {
  loading.value = true
  try {
    const [piezasRes, proveedoresRes] = await Promise.all([
      window.db.getAll('piezas'),
      window.db.getAll('proveedores'),
    ])
    if (piezasRes.success) {
      piezas.value = verTodosAlmacenes.value
        ? (piezasRes.data || [])
        : filterByAlmacen(piezasRes.data || [])
    }
    if (proveedoresRes.success) {
      proveedores.value = proveedoresRes.data || []
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

watch(verTodosAlmacenes, () => {
  selectedPiezas.value = []
  selectedPieza.value = null
  cargarPiezas()
})

function estaPiezaSeleccionada(pieza: any): boolean {
  return selectedPiezas.value.some((item: any) => item.id === pieza.id)
}

function toggleSeleccionPieza(pieza: any) {
  selectedPiezas.value = estaPiezaSeleccionada(pieza)
    ? selectedPiezas.value.filter((item: any) => item.id !== pieza.id)
    : [...selectedPiezas.value, pieza]
}

function abrirCrear() {
  isEditing.value = false
  selectedPieza.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(pieza: any) {
  isEditing.value = true
  selectedPieza.value = pieza
  form.value = {
    nombre: pieza.nombre || '',
    costo: pieza.costo || 0,
    precio_venta: pieza.precio_venta || 0,
    cantidad: pieza.cantidad || 0,
    alerta: pieza.alerta || 1,
    proveedor: pieza.proveedor || '',
    descripcion: pieza.descripcion || '',
    imagen: pieza.imagen || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(pieza: any) {
  selectedPieza.value = pieza
  deleteDialogVisible.value = true
}

async function verMovimientos(pieza: any) {
  piezaMovimiento.value = pieza
  try {
    const res = await window.db.getWhere('movimientos_piezas', 'pieza_id = ?', [pieza.id])
    if (res.success) movimientosPieza.value = (res.data || []).reverse()
  } catch { movimientosPieza.value = [] }
  dialogMovimientos.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  try {
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      costo: form.value.costo || 0,
      precio_venta: form.value.precio_venta || 0,
      cantidad: form.value.cantidad || 0,
      alerta: form.value.alerta || 1,
      proveedor: form.value.proveedor.trim().toUpperCase(),
      descripcion: form.value.descripcion.trim(),
      imagen: form.value.imagen || '',
    }

    if (isEditing.value) {
      const cantidadAnterior = selectedPieza.value.cantidad || 0
      const res = await window.db.update('piezas', selectedPieza.value.id, data)
      if (res.success) {
        if (Number(data.cantidad) !== Number(cantidadAnterior)) {
          const ahora = new Date()
          const movimiento = await window.db.insert('movimientos_piezas', addAlmacenId({
            pieza_id: selectedPieza.value.id,
            pieza_nombre: data.nombre,
            tipo: 'AJUSTE',
            cantidad_antes: cantidadAnterior,
            cantidad_despues: data.cantidad,
            referencia: 'Edicion manual',
            fecha: ahora.toISOString().split('T')[0],
            hora: ahora.toTimeString().split(' ')[0].slice(0, 5),
          }))
          if (!movimiento.success) throw new Error(movimiento.error || 'No se pudo registrar el movimiento en la nube')
        }
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Pieza actualizada', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('piezas', addAlmacenId(data))
      if (res.success) {
        const ahora = new Date()
        const movimiento = await window.db.insert('movimientos_piezas', addAlmacenId({
          pieza_id: res.data.id,
          pieza_nombre: data.nombre,
          tipo: 'ENTRADA',
          cantidad_antes: 0,
          cantidad_despues: data.cantidad,
          referencia: 'Creacion inicial',
          fecha: ahora.toISOString().split('T')[0],
          hora: ahora.toTimeString().split(' ')[0].slice(0, 5),
        }))
        if (!movimiento.success) throw new Error(movimiento.error || 'No se pudo registrar el movimiento en la nube')
        toast.add({ severity: 'success', summary: 'Guardado en la nube', detail: 'Pieza creada', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarPiezas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se guardo completamente', detail: error?.message || 'Error al guardar en la nube', life: 4000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('piezas', selectedPieza.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Pieza eliminada', life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
      return
    }
    deleteDialogVisible.value = false
    await cargarPiezas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

async function subirImagen() {
  const input = fileInput.value
  if (!input?.files?.length) return
  const file = input.files[0]
  if (!file.type.startsWith('image/')) {
    toast.add({ severity: 'warn', summary: 'Solo imagenes', detail: 'Selecciona un archivo de imagen', life: 3000 })
    return
  }
  if (!tmCloudConnected()) {
    toast.add({ severity: 'warn', summary: 'TM Cloud no configurado', detail: 'Configura TM Cloud para subir imagenes', life: 3000 })
    return
  }

  subiendoImagen.value = true
  try {
    const uid = await uploadImage(file, 'piezas')
    form.value.imagen = uid
    if (isEditing.value && selectedPieza.value?.id) {
      const actualizado = await window.db.update('piezas', selectedPieza.value.id, { imagen: uid })
      if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo guardar la imagen')
      selectedPieza.value.imagen = uid
      const local = piezas.value.find((pieza: any) => pieza.id === selectedPieza.value.id)
      if (local) local.imagen = uid
      if (isOnline()) await pushLocalRowToCloud('piezas', selectedPieza.value.id)
    }
    toast.add({ severity: 'success', summary: 'Imagen subida', life: 2000 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo subir la imagen', life: 4000 })
  } finally {
    subiendoImagen.value = false
    input.value = ''
  }
}

async function eliminarImagen() {
  if (!form.value.imagen) return
  try { await deleteImage(form.value.imagen) } catch {}
  form.value.imagen = ''
  if (isEditing.value && selectedPieza.value?.id) {
    await window.db.update('piezas', selectedPieza.value.id, { imagen: '' })
    selectedPieza.value.imagen = ''
    const local = piezas.value.find((pieza: any) => pieza.id === selectedPieza.value.id)
    if (local) local.imagen = ''
    if (isOnline()) await pushLocalRowToCloud('piezas', selectedPieza.value.id)
  }
}

function imagenUrl(uid: string | null | undefined): string | null {
  return uid ? getImageUrl(uid) : null
}

async function guardarNuevoProveedor() {
  if (!nuevoProveedorForm.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del proveedor es requerido', life: 3000 })
    return
  }
  guardandoProveedor.value = true
  try {
    const res = await window.db.insert('proveedores', addAlmacenId({
      nombre: nuevoProveedorForm.value.nombre.trim().toUpperCase(),
      telefono: nuevoProveedorForm.value.telefono.trim(),
    }))
    if (res.success) {
      form.value.proveedor = nuevoProveedorForm.value.nombre.trim().toUpperCase()
      dialogNuevoProveedor.value = false
      await cargarPiezas()
      toast.add({ severity: 'success', summary: 'Creado', detail: 'Proveedor agregado', life: 2000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    guardandoProveedor.value = false
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

  await cargarPiezas()
})

useCloudRefresh(['piezas', 'proveedores', 'movimientos_piezas'], cargarPiezas)
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Piezas">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar pieza..." />
        </IconField>

        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button v-if="selectedPiezas.length" :label="`Cambiar almacén (${selectedPiezas.length})`" icon="pi pi-warehouse" severity="success" @click="abrirMoverAlmacen" />
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
          <Button label="Nueva Pieza" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="piezasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        v-model:selection="selectedPiezas"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Imagen" style="width: 4rem">
          <template #body="{ data }">
            <div v-if="imagenUrl(data.imagen)" class="w-8 h-8 rounded overflow-hidden">
              <img :src="imagenUrl(data.imagen)" class="w-full h-full object-cover" alt="" />
            </div>
          </template>
        </Column>
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
        <Column field="cantidad" header="Cant." sortable style="width: 6rem" />
        <Column field="costo" header="Costo" sortable style="width: 7rem">
          <template #body="{ data }">{{ formatCurrency(data.costo) }}</template>
        </Column>
        <Column field="precio_venta" header="Venta" sortable style="width: 7rem">
          <template #body="{ data }">{{ formatCurrency(data.precio_venta) }}</template>
        </Column>
        <Column field="proveedor" header="Proveedor" sortable />

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay piezas registradas.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="piezasFiltradas.length === 0" class="text-center py-10 text-surface-500">No hay piezas registradas.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="pieza in piezasFiltradas"
            :key="pieza.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(pieza)"
          >
            <div v-if="imagenUrl(pieza.imagen)" class="-mx-4 -mt-4 h-36 overflow-hidden rounded-t-xl">
              <img :src="imagenUrl(pieza.imagen)" class="w-full h-full object-cover" :alt="`Imagen de ${pieza.nombre}`" />
            </div>
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <Button
                  :icon="estaPiezaSeleccionada(pieza) ? 'pi pi-check-square' : 'pi pi-square'"
                  :severity="estaPiezaSeleccionada(pieza) ? 'success' : 'secondary'"
                  text
                  rounded
                  size="small"
                  @click.stop="toggleSeleccionPieza(pieza)"
                  v-tooltip="estaPiezaSeleccionada(pieza) ? 'Quitar selección' : 'Seleccionar pieza'"
                />
                <span class="text-xs font-mono text-surface-400">#{{ pieza.id }}</span>
              </div>
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full"
                :class="pieza.cantidad <= pieza.alerta
                  ? 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'"
              >
                Stock: {{ pieza.cantidad }}
              </span>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ pieza.nombre }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ pieza.proveedor || 'Sin proveedor' }}</p>
            </div>

            <div class="grid grid-cols-2 gap-2 text-sm">
              <div>
                <span class="block text-surface-400 text-xs">Costo</span>
                <span class="font-semibold">{{ formatCurrency(pieza.costo) }}</span>
              </div>
              <div>
                <span class="block text-surface-400 text-xs">Venta</span>
                <span class="font-semibold">{{ formatCurrency(pieza.precio_venta) }}</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-history" severity="secondary" text rounded size="small" @click.stop="verMovimientos(pieza)" v-tooltip="'Movimientos'" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(pieza)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(pieza)" v-tooltip="'Eliminar'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedPiezas.length }}</strong> pieza(s), incluyendo sus existencias, a otro almacén:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover piezas" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Pieza' : 'Nueva Pieza'"
      modal
      :style="{ width: '34rem' }"
    >
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre de la pieza" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Costo</label>
          <InputNumber v-model="form.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Precio Venta</label>
          <InputNumber v-model="form.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Cantidad</label>
          <InputNumber v-model="form.cantidad" :min="0" fluid @focus="(e) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Alerta</label>
          <InputNumber v-model="form.alerta" :min="0" fluid @focus="(e) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Proveedor</label>
          <div class="flex gap-2">
            <Select v-model="form.proveedor" :options="proveedores.map(p => p.nombre)" editable placeholder="Seleccionar proveedor" fluid class="uppercase" />
            <Button icon="pi pi-plus" severity="info" @click="dialogNuevoProveedor = true" v-tooltip="'Nuevo proveedor'" />
          </div>
        </div>
        <div class="flex flex-col gap-1 sm:col-span-2">
          <label class="font-semibold text-sm">Descripcion</label>
          <Textarea v-model="form.descripcion" rows="3" placeholder="Descripcion" />
        </div>
        <div class="flex flex-col gap-2 sm:col-span-2">
          <label class="font-semibold text-sm">Imagen</label>
          <div v-if="form.imagen" class="relative w-32 h-32 rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
            <img :src="imagenUrl(form.imagen)" class="w-full h-full object-cover" alt="Imagen de la pieza" />
            <Button icon="pi pi-times" severity="danger" text rounded size="small" class="absolute top-1 right-1 !w-6 !h-6 !text-xs bg-white/80 dark:bg-surface-800/80" @click="eliminarImagen" />
          </div>
          <div class="flex gap-2">
            <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="subirImagen" />
            <Button :label="(form.imagen ? 'Cambiar ' : 'Subir ') + 'Imagen'" icon="pi pi-upload" severity="secondary" outlined :loading="subiendoImagen" @click="fileInput?.click()" />
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="subiendoImagen" @click="guardar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevoProveedor" header="Nuevo Proveedor" modal :style="{ width: 'min(24rem, 95vw)' }">
      <div class="flex flex-col gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre <span class="text-red-400">*</span></label>
          <InputText v-model="nuevoProveedorForm.nombre" placeholder="Nombre del proveedor" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Telefono</label>
          <InputText v-model="nuevoProveedorForm.telefono" placeholder="Telefono" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevoProveedor = false" />
        <Button label="Guardar" icon="pi pi-check" :loading="guardandoProveedor" @click="guardarNuevoProveedor" />
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
        <span>Seguro que deseas eliminar <strong>{{ selectedPieza?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogMovimientos" :header="`Movimientos - ${piezaMovimiento?.nombre || ''}`" :modal="true" :style="{ width: 'min(34rem, 95vw)' }">
      <div class="max-h-96 overflow-y-auto">
        <div v-if="movimientosPieza.length > 0" class="flex flex-col gap-1">
          <div
            v-for="(m, i) in movimientosPieza"
            :key="i"
            class="flex items-center gap-3 px-3 py-2 rounded-lg border border-surface-100 dark:border-surface-700 text-sm"
          >
            <Tag :value="m.tipo" :severity="m.tipo === 'SALIDA' ? 'danger' : m.tipo === 'ENTRADA' ? 'success' : 'info'" />
            <div class="flex-1 min-w-0">
              <p class="font-medium truncate">{{ m.referencia || '-' }}</p>
              <p class="text-xs text-surface-500">{{ m.fecha }} {{ m.hora }}</p>
            </div>
            <span class="text-xs tabular-nums whitespace-nowrap" :class="m.tipo === 'SALIDA' ? 'text-red-500' : 'text-green-600'">
              {{ m.cantidad_antes }} → {{ m.cantidad_despues }}
            </span>
          </div>
        </div>
        <div v-else class="text-center py-6 text-surface-400 text-sm">
          Sin movimientos registrados.
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogMovimientos = false" />
      </template>
    </Dialog>
  </div>
</template>
