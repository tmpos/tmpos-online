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
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'

const toast = useToast()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const tecnicos = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const isEditing = ref(false)
const selectedTecnico = ref<any>(null)
const busqueda = ref('')

const estados = [
  { label: 'Activo', value: 'ACTIVO' },
  { label: 'Inactivo', value: 'INACTIVO' },
]

const camposArray = [
  'nombre',
  'telefono',
  'email',
  'porcentaje',
  'estado',
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
  telefono: '',
  email: '',
  porcentaje: 0,
  tipo_comision: 'PORCENTAJE_MANO_OBRA',
  valor_comision: 0,
  estado: 'ACTIVO',
})

const form = ref(formDefault())

const tecnicosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return tecnicos.value
  return tecnicos.value.filter(t =>
    t.nombre?.toLowerCase().includes(texto) ||
    t.telefono?.toLowerCase().includes(texto) ||
    t.email?.toLowerCase().includes(texto) ||
    t.estado?.toLowerCase().includes(texto)
  )
})

async function cargarTecnicos() {
  loading.value = true
  try {
    const res = await window.db.getAll('tecnicos')
    if (res.success) {
      tecnicos.value = filterByAlmacen(res.data || [])
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar los tecnicos', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedTecnico.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(tecnico: any) {
  isEditing.value = true
  selectedTecnico.value = tecnico
  form.value = {
    nombre: tecnico.nombre || '',
    telefono: tecnico.telefono || '',
    email: tecnico.email || '',
    porcentaje: tecnico.porcentaje || 0,
    tipo_comision: tecnico.tipo_comision || 'PORCENTAJE_MANO_OBRA',
    valor_comision: Number(tecnico.valor_comision ?? tecnico.porcentaje ?? 0),
    estado: tecnico.estado || 'ACTIVO',
  }
  dialogVisible.value = true
}

function confirmarBorrar(tecnico: any) {
  selectedTecnico.value = tecnico
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
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim().toLowerCase(),
      porcentaje: form.value.porcentaje || 0,
      tipo_comision: form.value.tipo_comision,
      valor_comision: form.value.tipo_comision === 'MONTO_FIJO'
        ? Number(form.value.valor_comision || 0)
        : Number(form.value.porcentaje || 0),
      estado: form.value.estado,
    }

    if (isEditing.value) {
      const res = await window.db.update('tecnicos', selectedTecnico.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Tecnico actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('tecnicos', addAlmacenId(data))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Exito', detail: 'Tecnico creado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    await cargarTecnicos()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  try {
    const res = await window.db.delete('tecnicos', selectedTecnico.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Tecnico eliminado', life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
      return
    }
    deleteDialogVisible.value = false
    await cargarTecnicos()
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

  await cargarTecnicos()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Tecnicos">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar tecnico..." />
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
          <Button label="Nuevo Tecnico" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="tecnicosFiltrados"
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
        <Column field="nombre" header="Nombre" sortable />
        <Column field="telefono" header="Telefono" sortable style="width: 9rem" />
        <Column field="email" header="Email" sortable />
        <Column field="porcentaje" header="% Comision" sortable style="width: 8rem">
          <template #body="{ data }">{{ data.porcentaje || 0 }}%</template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width: 8rem" />

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay tecnicos registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="tecnicosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay tecnicos registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="tecnico in tecnicosFiltrados"
            :key="tecnico.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(tecnico)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ tecnico.id }}</span>
              <span
                class="text-xs font-semibold px-2 py-0.5 rounded-full"
                :class="tecnico.estado === 'INACTIVO'
                  ? 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300'
                  : 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300'"
              >
                {{ tecnico.estado || 'ACTIVO' }}
              </span>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ tecnico.nombre }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ tecnico.email || 'Sin email' }}</p>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-phone text-surface-400"></i>
                <span class="truncate">{{ tecnico.telefono || 'Sin telefono' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-chart-line text-surface-400"></i>
                <span class="truncate">{{ tecnico.porcentaje || 0 }}% comision</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(tecnico)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(tecnico)" v-tooltip="'Eliminar'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Tecnico' : 'Nuevo Tecnico'"
      modal
      :style="{ width: '30rem' }"
    >
      <div class="grid grid-cols-1 gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre del tecnico" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Telefono</label>
          <InputText v-model="form.telefono" placeholder="Telefono" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Email</label>
          <InputText v-model="form.email" placeholder="correo@dominio.com" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Forma de comisión</label>
          <Select
            v-model="form.tipo_comision"
            :options="[
              { label: '% de mano de obra', value: 'PORCENTAJE_MANO_OBRA' },
              { label: '% de piezas', value: 'PORCENTAJE_PIEZAS' },
              { label: 'Monto fijo por reparación', value: 'MONTO_FIJO' },
            ]"
            optionLabel="label"
            optionValue="value"
            fluid
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">{{ form.tipo_comision === 'MONTO_FIJO' ? 'Monto por reparación' : '% Comisión' }}</label>
          <InputNumber v-if="form.tipo_comision === 'MONTO_FIJO'" v-model="form.valor_comision" mode="currency" :currency="systemCurrency" :locale="systemLocale" :min="0" fluid />
          <InputNumber v-else v-model="form.porcentaje" suffix="%" :min="0" :max="100" fluid @focus="(e) => e.target.select()" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Estado</label>
          <Select v-model="form.estado" :options="estados" optionLabel="label" optionValue="value" fluid />
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
        <span>Seguro que deseas eliminar <strong>{{ selectedTecnico?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
