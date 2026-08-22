<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import InputSwitch from 'primevue/inputswitch'
import Calendar from 'primevue/calendar'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron } from '@/funciones/funciones.js'

const toast = useToast()

const comprobantes = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const dialogVisible = ref(false)
const dialogDelete = ref(false)
const isEditing = ref(false)
const selectedComp = ref<any>(null)
const compToDelete = ref<any>(null)

const link = ref('')
const api = ref('')
const token = ref('')

const tiposDGII = [
  { label: 'Sin Comprobante', value: 'SIN' },
  { label: 'E31 - Factura Credito Fiscal', value: 'E31' },
  { label: 'E32 - Factura de Consumo', value: 'E32' },
  { label: 'E33 - Nota de Debito', value: 'E33' },
  { label: 'E34 - Nota de Credito', value: 'E34' },
  { label: 'E41 - Compras', value: 'E41' },
  { label: 'E43 - Gastos Menores', value: 'E43' },
  { label: 'E44 - Regimenes Especiales', value: 'E44' },
  { label: 'E45 - Gubernamental', value: 'E45' },
  { label: 'E46 - Exportacion', value: 'E46' },
  { label: 'E47 - Pagos al Exterior', value: 'E47' },
]

const nombresPorTipo: Record<string, string> = {
  SIN: 'Sin Comprobante',
  E31: 'Factura de Credito Fiscal',
  E32: 'Factura de Consumo',
  E33: 'Nota de Debito',
  E34: 'Nota de Credito',
  E41: 'Compras',
  E43: 'Gastos Menores',
  E44: 'Regimenes Especiales',
  E45: 'Gubernamental',
  E46: 'Exportacion',
  E47: 'Pagos al Exterior',
}

const tipoColors: Record<string, string> = {
  SIN: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  E31: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  E32: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  E33: 'bg-orange-100 text-orange-700 dark:bg-orange-900 dark:text-orange-300',
  E34: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
  E41: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  E43: 'bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300',
  E44: 'bg-teal-100 text-teal-700 dark:bg-teal-900 dark:text-teal-300',
  E45: 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900 dark:text-indigo-300',
  E46: 'bg-cyan-100 text-cyan-700 dark:bg-cyan-900 dark:text-cyan-300',
  E47: 'bg-pink-100 text-pink-700 dark:bg-pink-900 dark:text-pink-300',
}

const formDefault = () => ({
  tipo: 'E32',
  nombre: 'Factura de Consumo',
  descripcion: '',
  prefijo: 'E32',
  secuencia_actual: 1,
  secuencia_desde: 1,
  secuencia_hasta: 9999999999,
  fecha_vencimiento: null as Date | null,
  activo: true,
  es_default: false,
})

const form = ref(formDefault())

const comprobantesFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return comprobantes.value
  return comprobantes.value.filter(c =>
    c.tipo?.toLowerCase().includes(texto) ||
    c.nombre?.toLowerCase().includes(texto) ||
    c.descripcion?.toLowerCase().includes(texto)
  )
})

function formatNCF(comp: any): string {
  if (comp.tipo === 'SIN') return 'Sin NCF'
  const esElectronico = String(comp.tipo || '').toUpperCase().startsWith('E')
  const sec = String(comp.secuencia_actual || 1).padStart(esElectronico ? 10 : 8, '0')
  return `${comp.prefijo || comp.tipo}${sec}`
}

function secuenciaMax(comp: any = form.value): number {
  return String(comp?.tipo || '').toUpperCase().startsWith('E') ? 9999999999 : 99999999
}

function getSecuenciaRestante(comp: any): number {
  return (comp.secuencia_hasta || 99999999) - (comp.secuencia_actual || 1) + 1
}

function getSecuenciaPorcentaje(comp: any): number {
  const total = (comp.secuencia_hasta || 99999999) - (comp.secuencia_desde || 1) + 1
  const usado = (comp.secuencia_actual || 1) - (comp.secuencia_desde || 1)
  return Math.min(100, Math.round((usado / total) * 100))
}

function isVencido(comp: any): boolean {
  if (!comp.fecha_vencimiento) return false
  return new Date(comp.fecha_vencimiento) < new Date()
}

function isPorVencer(comp: any): boolean {
  if (!comp.fecha_vencimiento) return false
  const fecha = new Date(comp.fecha_vencimiento)
  const hoy = new Date()
  const dias = Math.ceil((fecha.getTime() - hoy.getTime()) / (1000 * 60 * 60 * 24))
  return dias > 0 && dias <= 30
}

function getProgressColor(pct: number): string {
  if (pct >= 90) return 'bg-red-500'
  if (pct >= 70) return 'bg-yellow-500'
  return 'bg-green-500'
}

async function cargarComprobantes() {
  loading.value = true
  try {
    const res = await window.db.getAll('comprobantes_fiscales')
    if (res.success) {
      comprobantes.value = (res.data || []).sort((a: any, b: any) => {
        if (b.es_default !== a.es_default) return b.es_default - a.es_default
        if (b.activo !== a.activo) return b.activo - a.activo
        return a.tipo.localeCompare(b.tipo)
      })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedComp.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(comp: any) {
  isEditing.value = true
  selectedComp.value = comp
  form.value = {
    tipo: comp.tipo || 'E32',
    nombre: comp.nombre || '',
    descripcion: comp.descripcion || '',
    prefijo: comp.prefijo || comp.tipo || '',
    secuencia_actual: comp.secuencia_actual || 1,
    secuencia_desde: comp.secuencia_desde || 1,
    secuencia_hasta: comp.secuencia_hasta || secuenciaMax(comp),
    fecha_vencimiento: comp.fecha_vencimiento ? new Date(comp.fecha_vencimiento) : null,
    activo: comp.activo === 1,
    es_default: comp.es_default === 1,
  }
  dialogVisible.value = true
}

function onTipoChange(tipo: string) {
  form.value.nombre = nombresPorTipo[tipo] || ''
  form.value.prefijo = tipo === 'SIN' ? '' : tipo
}

async function guardar() {
  if (!form.value.tipo || !form.value.nombre) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Tipo y nombre son requeridos', life: 3000 })
    return
  }

  if (form.value.secuencia_desde > form.value.secuencia_hasta) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'La secuencia desde no puede ser mayor que hasta', life: 3000 })
    return
  }

  if (form.value.secuencia_actual < form.value.secuencia_desde || form.value.secuencia_actual > form.value.secuencia_hasta) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'La secuencia actual debe estar entre desde y hasta', life: 3000 })
    return
  }

  try {
    const data: any = {
      tipo: form.value.tipo,
      nombre: form.value.nombre,
      descripcion: form.value.descripcion,
      prefijo: form.value.prefijo,
      secuencia_actual: form.value.secuencia_actual,
      secuencia_desde: form.value.secuencia_desde,
      secuencia_hasta: form.value.secuencia_hasta,
      fecha_vencimiento: form.value.fecha_vencimiento instanceof Date
        ? form.value.fecha_vencimiento.toISOString().split('T')[0]
        : form.value.fecha_vencimiento || '',
      activo: form.value.activo ? 1 : 0,
      es_default: form.value.es_default ? 1 : 0,
    }

    if (isEditing.value && selectedComp.value) {
      if (data.es_default) {
        await window.db.runQuery?.('UPDATE comprobantes_fiscales SET es_default = 0')
        await window.db.runQuery?.(`UPDATE comprobantes_fiscales SET es_default = 1 WHERE id = ${selectedComp.value.id}`)
      }
      const res = await window.db.update('comprobantes_fiscales', selectedComp.value.id, {
        ...data,
        ...(data.es_default ? {} : { es_default: 0 }),
      })
      if (!res.success) throw new Error(res.error)
      toast.add({ severity: 'success', summary: 'Actualizado', detail: 'Comprobante actualizado', life: 2000 })
    } else {
      const res = await window.db.insert('comprobantes_fiscales', data)
      if (!res.success) throw new Error(res.error)
      if (data.es_default) {
        const newId = res.data.id
        await window.db.runQuery?.(`UPDATE comprobantes_fiscales SET es_default = 0 WHERE id != ${newId}`)
      }
      toast.add({ severity: 'success', summary: 'Creado', detail: 'Comprobante creado', life: 2000 })
    }

    dialogVisible.value = false
    await cargarComprobantes()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al guardar', life: 3000 })
  }
}

function confirmarBorrar(comp: any) {
  compToDelete.value = comp
  dialogDelete.value = true
}

async function borrar() {
  if (!compToDelete.value) return
  if (compToDelete.value.es_default) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'No se puede eliminar el comprobante por defecto', life: 3000 })
    dialogDelete.value = false
    return
  }
  try {
    const res = await window.db.delete('comprobantes_fiscales', compToDelete.value.id)
    if (!res.success) throw new Error(res.error)
    toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Comprobante eliminado', life: 2000 })
    dialogDelete.value = false
    await cargarComprobantes()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al eliminar', life: 3000 })
  }
}

async function toggleActivo(comp: any) {
  const nuevo = comp.activo ? 0 : 1
  const res = await window.db.update('comprobantes_fiscales', comp.id, { activo: nuevo })
  if (res.success) {
    comp.activo = nuevo
    toast.add({ severity: 'success', summary: nuevo ? 'Activado' : 'Desactivado', detail: comp.nombre, life: 2000 })
  }
}

async function setDefault(comp: any) {
  try {
    const res = await window.db.runQuery?.('UPDATE comprobantes_fiscales SET es_default = 0')
    if (!res?.success && res !== undefined) return
    const res2 = await window.db.update('comprobantes_fiscales', comp.id, { es_default: 1 })
    if (!res2.success) throw new Error(res2.error)
    toast.add({ severity: 'success', summary: 'Default', detail: `${comp.nombre} ahora es el default`, life: 2000 })
    await cargarComprobantes()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}

async function resetSecuencia(comp: any) {
  const res = await window.db.update('comprobantes_fiscales', comp.id, { secuencia_actual: comp.secuencia_desde || 1 })
  if (res.success) {
    comp.secuencia_actual = comp.secuencia_desde || 1
    toast.add({ severity: 'success', summary: 'Reiniciado', detail: 'Secuencia reiniciada', life: 2000 })
  }
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || ''
      api.value = datosJSON.VITE_LINK_API || ''
      token.value = datosJSON.VITE_TOKEN || ''
    }
  } catch (error) {
    console.error(error)
  }
  await cargarComprobantes()
})
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-5">
      <div class="flex items-center justify-between gap-4 flex-wrap">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <i class="pi pi-shield text-primary text-lg"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold">Comprobantes Fiscales</h2>
            <p class="text-sm text-surface-500">Gestion de NCF / e-CF para DGII</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busqueda" placeholder="Buscar comprobante..." />
          </IconField>
          <Button label="Nuevo Comprobante" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16 text-surface-400 gap-3">
        <i class="pi pi-spin pi-spinner text-2xl"></i>
        <span>Cargando...</span>
      </div>

      <div v-else-if="comprobantesFiltrados.length === 0" class="flex flex-col items-center justify-center py-16 text-surface-400 gap-3">
        <i class="pi pi-inbox text-4xl"></i>
        <span>No hay comprobantes</span>
        <Button label="Agregar Comprobante" icon="pi pi-plus" severity="secondary" @click="abrirCrear" />
      </div>

      <div v-else class="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4 gap-3">
        <div
          v-for="comp in comprobantesFiltrados"
          :key="comp.id"
          class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-3 flex flex-col gap-2 transition-shadow hover:shadow-sm relative text-sm"
          :class="comp.activo ? '' : 'opacity-60'"
        >
          <div v-if="comp.es_default" class="absolute top-1.5 right-1.5">
            <span class="text-[9px] font-bold px-1 py-0.5 rounded-full bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300 flex items-center gap-0.5">
              <i class="pi pi-star text-[8px]"></i> DEFAULT
            </span>
          </div>

          <div class="flex items-start justify-between gap-1">
            <span class="text-[10px] font-bold px-1.5 py-0.5 rounded-full" :class="tipoColors[comp.tipo] || tipoColors.SIN">
              {{ comp.tipo }}
            </span>
            <div class="flex items-center gap-0.5 -mr-1">
              <Button icon="pi pi-star" severity="info" text rounded size="small" class="!w-5 !h-5 !text-[10px]" :disabled="comp.es_default" @click="setDefault(comp)" v-tooltip="'Default'" />
              <Button icon="pi pi-refresh" severity="warning" text rounded size="small" class="!w-5 !h-5 !text-[10px]" @click="resetSecuencia(comp)" v-tooltip="'Reiniciar'" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" class="!w-5 !h-5 !text-[10px]" @click="abrirEditar(comp)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" class="!w-5 !h-5 !text-[10px]" :disabled="comp.es_default" @click="confirmarBorrar(comp)" v-tooltip="'Eliminar'" />
            </div>
          </div>

          <h4 class="font-semibold text-xs leading-tight truncate">{{ comp.nombre }}</h4>

          <div class="bg-surface-50 dark:bg-surface-700/40 rounded-md p-1.5 text-center">
            <span class="text-[10px] text-surface-400 block leading-tight">Proximo NCF</span>
            <span class="font-mono font-bold text-xs tracking-wider">{{ formatNCF(comp) }}</span>
          </div>

          <div v-if="comp.fecha_vencimiento" class="text-[10px]">
            <span v-if="isVencido(comp)" class="text-red-500 font-semibold flex items-center gap-1">
              <i class="pi pi-exclamation-circle text-[9px]"></i> Vence: {{ comp.fecha_vencimiento }}
            </span>
            <span v-else-if="isPorVencer(comp)" class="text-yellow-600 dark:text-yellow-400 font-semibold flex items-center gap-1">
              <i class="pi pi-clock text-[9px]"></i> Vence: {{ comp.fecha_vencimiento }}
            </span>
            <span v-else class="text-surface-400">Vence: {{ comp.fecha_vencimiento }}</span>
          </div>

          <div class="space-y-0.5">
            <div class="flex items-center justify-between text-[10px]">
              <span class="text-surface-500">Secuencia</span>
              <span class="font-mono font-semibold text-[10px]">{{ comp.secuencia_actual || 1 }}/{{ comp.secuencia_hasta || secuenciaMax(comp) }}</span>
            </div>
            <div class="w-full h-1.5 rounded-full bg-surface-200 dark:bg-surface-600 overflow-hidden">
              <div
                class="h-full rounded-full transition-all duration-300"
                :class="getProgressColor(getSecuenciaPorcentaje(comp))"
                :style="{ width: getSecuenciaPorcentaje(comp) + '%' }"
              ></div>
            </div>
            <div class="flex justify-between text-[9px] text-surface-400">
              <span>{{ getSecuenciaRestante(comp) }} disp.</span>
              <span>{{ getSecuenciaPorcentaje(comp) }}%</span>
            </div>
          </div>

          <div class="flex items-center justify-between pt-1 border-t border-surface-100 dark:border-surface-700 mt-0.5">
            <span class="text-[10px] text-surface-500">{{ comp.activo ? 'Activo' : 'Inactivo' }}</span>
            <InputSwitch
              :modelValue="comp.activo === 1"
              @update:modelValue="toggleActivo(comp)"
              size="small"
              class="!h-4"
            />
          </div>
        </div>
      </div>
    </div>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Comprobante' : 'Nuevo Comprobante'"
      modal
      :style="{ width: '32rem' }"
    >
      <div class="space-y-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Tipo <span class="text-red-400">*</span></label>
          <Select v-model="form.tipo" :options="tiposDGII" optionLabel="label" optionValue="value" fluid @update:modelValue="onTipoChange" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Nombre <span class="text-red-400">*</span></label>
            <InputText v-model="form.nombre" placeholder="Nombre" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Prefijo NCF</label>
            <InputText v-model="form.prefijo" placeholder="Ej: E32" fluid class="font-mono uppercase" style="text-transform: uppercase;" />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Descripcion</label>
          <InputText v-model="form.descripcion" placeholder="Descripcion opcional" fluid />
        </div>

        <div class="grid grid-cols-3 gap-3">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Sec. Desde</label>
            <InputNumber v-model="form.secuencia_desde" :min="1" :max="secuenciaMax()" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Sec. Actual</label>
            <InputNumber v-model="form.secuencia_actual" :min="1" :max="secuenciaMax()" fluid @focus="(e) => e.target.select()" />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Sec. Hasta</label>
            <InputNumber v-model="form.secuencia_hasta" :min="1" :max="secuenciaMax()" fluid @focus="(e) => e.target.select()" />
          </div>
        </div>

        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Fecha de Vencimiento</label>
          <Calendar v-model="form.fecha_vencimiento" dateFormat="dd/mm/yy" fluid showIcon />
        </div>

        <div class="flex items-center gap-6 pt-2">
          <div class="flex items-center gap-2">
            <InputSwitch v-model="form.activo" />
            <label class="text-sm">Activo</label>
          </div>
          <div class="flex items-center gap-2">
            <InputSwitch v-model="form.es_default" />
            <label class="text-sm">Comprobante por defecto</label>
          </div>
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogDelete"
      header="Confirmar Eliminacion"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
        <span>Seguro que deseas eliminar el comprobante <strong>{{ compToDelete?.nombre }}</strong>?</span>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogDelete = false" />
        <Button label="Eliminar" icon="pi pi-trash" severity="danger" @click="borrar" />
      </template>
    </Dialog>
  </div>
</template>
