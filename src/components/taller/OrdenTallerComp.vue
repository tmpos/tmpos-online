<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Textarea from 'primevue/textarea'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { uploadImage, getImageUrl, deleteImage, isConnected as tmCloudConnected } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const { addAlmacenId } = useAlmacenFilter()
const ordenes = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedOrden = ref<any>(null)
const busqueda = ref('')

const metodosPago = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Pago Movil', value: 'PAGO_MOVIL' },
]

const estadosOrden = [
  { label: 'Recibido', value: 'RECIBIDO' },
  { label: 'En Proceso', value: 'EN_PROCESO' },
  { label: 'Completado', value: 'COMPLETADO' },
  { label: 'Entregado', value: 'ENTREGADO' },
  { label: 'Cancelado', value: 'CANCELADO' },
]

const camposArray = [
  'nombre',
  'cedula',
  'telefono',
  'email',
  'equipo',
  'imei',
  'serial',
  'marca_modelo',
  'clave',
  'accesorios',
  'fallas',
  'piezas',
  'tecnico',
  'metodo_pago',
  'fecha_entrada',
  'fecha_entrega',
  'estado',
  'precio_pieza',
  'mano_obra',
  'abono',
  'pendiente',
  'total',
  'pagos',
  'beneficio_empresa',
  'beneficio_tecnico',
  'porcentaje_tecnico',
  'estado_pago_tecnico',
]

const form = ref({
  nombre: '',
  cedula: '',
  telefono: '',
  email: '',
  equipo: '',
  imei: '',
  serial: '',
  marca_modelo: '',
  clave: '',
  accesorios: '',
  fallas: '',
  piezas: '',
  tecnico: '',
  metodo_pago: 'EFECTIVO',
  fecha_entrada: new Date(),
  fecha_entrega: null as Date | null,
  estado: 'RECIBIDO',
  precio_pieza: 0,
  mano_obra: 0,
  abono: 0,
  pendiente: 0,
  total: 0,
  pagos: '',
  beneficio_empresa: 0,
  beneficio_tecnico: 0,
  porcentaje_tecnico: 0,
  estado_pago_tecnico: 'PENDIENTE',
  imagen: '',
})
const fileInput = ref<HTMLInputElement | null>(null)
const subiendoImagen = ref(false)

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCifrado = ref('')
const tokenCorto = ref('')

const ordenesFiltradas = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return ordenes.value
  return ordenes.value.filter(o =>
    o.nombre?.toLowerCase().includes(texto) ||
    o.cedula?.toLowerCase().includes(texto) ||
    o.equipo?.toLowerCase().includes(texto)
  )
})

const totalCalculado = computed(() => {
  return (form.value.precio_pieza || 0) + (form.value.mano_obra || 0)
})

const pendienteCalculado = computed(() => {
  return totalCalculado.value - (form.value.abono || 0)
})

async function cargarOrdenes() {
  loading.value = true
  try {
    const res = await window.db.getAll('ordenes_taller')
    if (res.success) {
      ordenes.value = res.data || []
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  form.value = {
    nombre: '',
    cedula: '',
    telefono: '',
    email: '',
    equipo: '',
    imei: '',
    serial: '',
    marca_modelo: '',
    clave: '',
    accesorios: '',
    fallas: '',
    piezas: '',
    tecnico: '',
    metodo_pago: 'EFECTIVO',
    fecha_entrada: new Date(),
    fecha_entrega: null,
    estado: 'RECIBIDO',
    precio_pieza: 0,
    mano_obra: 0,
    abono: 0,
    pendiente: 0,
    total: 0,
    pagos: '',
    beneficio_empresa: 0,
    beneficio_tecnico: 0,
    porcentaje_tecnico: 0,
    estado_pago_tecnico: 'PENDIENTE',
    imagen: '',
  }
  dialogVisible.value = true
}

function abrirEditar(orden: any) {
  isEditing.value = true
  selectedOrden.value = orden
  form.value = {
    nombre: orden.nombre || '',
    cedula: orden.cedula || '',
    telefono: orden.telefono || '',
    email: orden.email || '',
    equipo: orden.equipo || '',
    imei: orden.imei || '',
    serial: orden.serial || '',
    marca_modelo: orden.marca_modelo || '',
    clave: orden.clave || '',
    accesorios: orden.accesorios || '',
    fallas: orden.fallas || '',
    piezas: orden.piezas || '',
    tecnico: orden.tecnico || '',
    metodo_pago: orden.metodo_pago || 'EFECTIVO',
    fecha_entrada: orden.fecha_entrada ? new Date(orden.fecha_entrada) : new Date(),
    fecha_entrega: orden.fecha_entrega ? new Date(orden.fecha_entrega) : null,
    estado: orden.estado || 'RECIBIDO',
    precio_pieza: orden.precio_pieza || 0,
    mano_obra: orden.mano_obra || 0,
    abono: orden.abono || 0,
    pendiente: orden.pendiente || 0,
    total: orden.total || 0,
    pagos: orden.pagos || '',
    beneficio_empresa: orden.beneficio_empresa || 0,
    beneficio_tecnico: orden.beneficio_tecnico || 0,
    porcentaje_tecnico: orden.porcentaje_tecnico || 0,
    estado_pago_tecnico: orden.estado_pago_tecnico || 'PENDIENTE',
    imagen: orden.imagen || '',
  }
  dialogVisible.value = true
}

function confirmarBorrar(orden: any) {
  selectedOrden.value = orden
  deleteDialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  const nombreMayus = form.value.nombre.trim().toUpperCase()
  const total = totalCalculado.value
  const pendiente = pendienteCalculado.value

  try {
    const data: any = {
      nombre: nombreMayus,
      cedula: form.value.cedula,
      telefono: form.value.telefono,
      email: form.value.email,
      equipo: form.value.equipo.toUpperCase(),
      imei: form.value.imei,
      serial: form.value.serial,
      marca_modelo: form.value.marca_modelo.toUpperCase(),
      clave: form.value.clave,
      accesorios: form.value.accesorios.toUpperCase(),
      fallas: form.value.fallas.toUpperCase(),
      piezas: form.value.piezas,
      tecnico: form.value.tecnico.toUpperCase(),
      metodo_pago: form.value.metodo_pago,
      fecha_entrada: form.value.fecha_entrada.toISOString().split('T')[0],
      fecha_entrega: form.value.fecha_entrega ? form.value.fecha_entrega.toISOString().split('T')[0] : null,
      estado: form.value.estado,
      precio_pieza: form.value.precio_pieza || 0,
      mano_obra: form.value.mano_obra || 0,
      abono: form.value.abono || 0,
      pendiente: pendiente,
      total: total,
      pagos: form.value.pagos,
      beneficio_empresa: form.value.beneficio_empresa || 0,
      beneficio_tecnico: form.value.beneficio_tecnico || 0,
      porcentaje_tecnico: form.value.porcentaje_tecnico || 0,
      estado_pago_tecnico: form.value.estado_pago_tecnico,
    }
    if (form.value.imagen) data.imagen = form.value.imagen

    if (isEditing.value) {
      const res = await window.db.update('ordenes_taller', selectedOrden.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Orden actualizada', life: 3000 })
      }
    } else {
      const res = await window.db.insert('ordenes_taller', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Orden creada', life: 3000 })
      }
    }
    dialogVisible.value = false
    await cargarOrdenes()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('ordenes_taller', selectedOrden.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Orden eliminada', life: 3000 })
    }
    deleteDialogVisible.value = false
    await cargarOrdenes()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

function getEstadoClass(estado: string) {
  switch (estado) {
    case 'RECIBIDO': return 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300'
    case 'EN_PROCESO': return 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300'
    case 'COMPLETADO': return 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'
    case 'ENTREGADO': return 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300'
    case 'CANCELADO': return 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
    default: return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
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
    const uid = await uploadImage(file, 'ordenes_taller')
    form.value.imagen = uid
    if (isEditing.value && selectedOrden.value?.id) {
      const actualizado = await window.db.update('ordenes_taller', selectedOrden.value.id, { imagen: uid })
      if (!actualizado.success) throw new Error(actualizado.error || 'No se pudo guardar la imagen')
      selectedOrden.value.imagen = uid
      const local = ordenes.value.find((orden: any) => orden.id === selectedOrden.value.id)
      if (local) local.imagen = uid
      if (isOnline()) await pushLocalRowToCloud('ordenes_taller', selectedOrden.value.id)
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
  try {
    await deleteImage(form.value.imagen)
  } catch {}
  form.value.imagen = ''
  if (isEditing.value && selectedOrden.value?.id) {
    await window.db.update('ordenes_taller', selectedOrden.value.id, { imagen: '' })
    if (isOnline()) await pushLocalRowToCloud('ordenes_taller', selectedOrden.value.id)
  }
}

function imagenUrl(uid: string | null | undefined): string | null {
  return uid ? getImageUrl(uid) : null
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

  await cargarOrdenes()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Ordenes de Taller">
      <div class="flex items-center justify-between mb-4 gap-2">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar orden..." />
        </IconField>
        <Button label="Nueva Orden" icon="pi pi-plus" @click="abrirCrear" />
      </div>

      <DataTable
        :value="ordenesFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
      >
        <Column field="id" header="ID" style="width: 4rem" />
        <Column field="nombre" header="Cliente" sortable />
        <Column field="equipo" header="Equipo" sortable />
        <Column field="tecnico" header="Tecnico" sortable />
        <Column field="estado" header="Estado" sortable style="width: 8rem">
          <template #body="{ data }">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full" :class="getEstadoClass(data.estado)">
              {{ data.estado }}
            </span>
          </template>
        </Column>
        <Column field="total" header="Total" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.total ? `$${data.total.toFixed(2)}` : '$0.00' }}
          </template>
        </Column>
        <Column field="fecha_entrada" header="Fecha" sortable style="width: 7rem">
          <template #body="{ data }">
            {{ data.fecha_entrada }}
          </template>
        </Column>
        <Column header="Acciones" style="width: 8rem">
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
          <div class="text-center py-6 text-surface-500">No hay ordenes registradas.</div>
        </template>
      </DataTable>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Orden' : 'Nueva Orden de Taller'"
      modal
      :style="{ width: '40rem' }"
    >
      <TabView>
        <TabPanel header="Cliente">
          <div class="flex flex-col gap-3 pt-2">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Nombre</label>
                <InputText v-model="form.nombre" placeholder="Nombre del cliente" fluid class="uppercase" style="text-transform: uppercase;" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Cedula</label>
                <InputText v-model="form.cedula" placeholder="Cedula" fluid />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Telefono</label>
                <InputText v-model="form.telefono" placeholder="Telefono" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Email</label>
                <InputText v-model="form.email" placeholder="Email" fluid />
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel header="Equipo">
          <div class="flex flex-col gap-3 pt-2">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Equipo</label>
                <InputText v-model="form.equipo" placeholder="Tipo de equipo" fluid class="uppercase" style="text-transform: uppercase;" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">IMEI</label>
                <InputText v-model="form.imei" placeholder="IMEI" fluid />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Serial</label>
                <InputText v-model="form.serial" placeholder="Serial" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Marca/Modelo</label>
                <InputText v-model="form.marca_modelo" placeholder="Marca y modelo" fluid class="uppercase" style="text-transform: uppercase;" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-semibold text-sm">Clave</label>
              <InputText v-model="form.clave" placeholder="Clave del equipo" fluid />
            </div>
            <div class="flex flex-col gap-2">
              <label class="font-semibold text-sm">Imagen del equipo</label>
              <div v-if="form.imagen" class="relative w-32 h-32 rounded-lg overflow-hidden border border-surface-200 dark:border-surface-700">
                <img :src="imagenUrl(form.imagen)" class="w-full h-full object-cover" alt="Imagen del equipo" />
                <Button icon="pi pi-times" severity="danger" text rounded size="small" class="absolute top-1 right-1 !w-6 !h-6 !text-xs bg-white/80 dark:bg-surface-800/80" @click="eliminarImagen" />
              </div>
              <div class="flex gap-2">
                <input ref="fileInput" type="file" accept="image/*" class="hidden" @change="subirImagen" />
                <Button :label="(form.imagen ? 'Cambiar ' : 'Subir ') + 'Imagen'" icon="pi pi-upload" severity="secondary" outlined :loading="subiendoImagen" @click="fileInput?.click()" />
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel header="Diagnostico">
          <div class="flex flex-col gap-3 pt-2">
            <div class="flex flex-col gap-1">
              <label class="font-semibold text-sm">Accesorios</label>
              <Textarea v-model="form.accesorios" placeholder="Accesorios recibidos con el equipo" rows="2" fluid />
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-semibold text-sm">Fallas Reportadas</label>
              <Textarea v-model="form.fallas" placeholder="Fallas reportadas por el cliente" rows="3" fluid class="uppercase" style="text-transform: uppercase;" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-semibold text-sm">Piezas Requeridas</label>
              <Textarea v-model="form.piezas" placeholder="Piezas necesarias para la reparacion" rows="2" fluid />
            </div>
          </div>
        </TabPanel>

        <TabPanel header="Trabajo">
          <div class="flex flex-col gap-3 pt-2">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Tecnico</label>
                <InputText v-model="form.tecnico" placeholder="Nombre del tecnico" fluid class="uppercase" style="text-transform: uppercase;" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Estado</label>
                <Select v-model="form.estado" :options="estadosOrden" optionLabel="label" optionValue="value" fluid />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Fecha Entrada</label>
                <Calendar v-model="form.fecha_entrada" dateFormat="yy-mm-dd" placeholder="YYYY-MM-DD" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Fecha Entrega</label>
                <Calendar v-model="form.fecha_entrega" dateFormat="yy-mm-dd" placeholder="YYYY-MM-DD" fluid />
              </div>
            </div>
          </div>
        </TabPanel>

        <TabPanel header="Pago">
          <div class="flex flex-col gap-3 pt-2">
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Precio Pieza</label>
                <InputNumber v-model="form.precio_pieza" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Mano de Obra</label>
                <InputNumber v-model="form.mano_obra" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Total</label>
                <InputNumber :modelValue="totalCalculado" mode="currency" :currency="systemCurrency" :locale="systemLocale" disabled fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Abono</label>
                <InputNumber v-model="form.abono" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Pendiente</label>
                <InputNumber :modelValue="pendienteCalculado" mode="currency" :currency="systemCurrency" :locale="systemLocale" disabled fluid />
              </div>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Metodo de Pago</label>
                <Select v-model="form.metodo_pago" :options="metodosPago" optionLabel="label" optionValue="value" fluid />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Estado Pago Tecnico</label>
                <Select v-model="form.estado_pago_tecnico" :options="[{label: 'Pendiente', value: 'PENDIENTE'}, {label: 'Pagado', value: 'PAGADO'}]" optionLabel="label" optionValue="value" fluid />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">% Tecnico</label>
                <InputNumber v-model="form.porcentaje_tecnico" suffix="%" fluid @focus="(e) => e.target.select()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Beneficio Tecnico</label>
                <InputNumber v-model="form.beneficio_tecnico" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="font-semibold text-sm">Beneficio Empresa</label>
                <InputNumber v-model="form.beneficio_empresa" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e) => e.target.select()" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="font-semibold text-sm">Notas de Pago</label>
              <Textarea v-model="form.pagos" placeholder="Notas sobre pagos" rows="2" fluid />
            </div>
          </div>
        </TabPanel>
      </TabView>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" :disabled="subiendoImagen" @click="guardar" />
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
        <span>Seguro que deseas eliminar la orden de <strong>{{ selectedOrden?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
