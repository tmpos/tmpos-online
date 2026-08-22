<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useAuthStore } from '@/stores/auth.store'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

const auth = useAuthStore()
const toast = useToast()
const data = ref<any[]>([])
const cargando = ref(false)
const filtro = ref({ tabla: '', accion: '', usuario: '', desde: '', hasta: '' })

const tablasUnicas = computed(() => {
  const set = new Set(data.value.map(r => r.tabla).filter(Boolean))
  return [...set].sort()
})

const filtered = computed(() => {
  let items = data.value
  if (filtro.value.tabla) items = items.filter(r => r.tabla === filtro.value.tabla)
  if (filtro.value.accion) items = items.filter(r => r.accion === filtro.value.accion)
  if (filtro.value.usuario) items = items.filter(r => r.usuario && r.usuario.toLowerCase().includes(filtro.value.usuario.toLowerCase()))
  if (filtro.value.desde) items = items.filter(r => r.created_at && r.created_at.split(' ')[0] >= filtro.value.desde)
  if (filtro.value.hasta) items = items.filter(r => r.created_at && r.created_at.split(' ')[0] <= filtro.value.hasta)
  return items
})

function accionClass(accion: string) {
  if (accion === 'CREATE') return 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
  if (accion === 'UPDATE') return 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400'
  if (accion === 'DELETE') return 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
  return 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300'
}

function formatFecha(f: string) {
  if (!f) return '—'
  const parts = f.split(' ')
  if (parts.length >= 2) {
    const d = parts[0]; const t = parts[1].slice(0, 5)
    return `${d} ${t}`
  }
  return f
}

function resumirDatos(json: string) {
  try {
    const obj = JSON.parse(json || '{}')
    const keys = Object.keys(obj)
    if (keys.length === 0) return '—'
    return keys.slice(0, 3).map(k => `${k}: ${obj[k]}`).join(', ') + (keys.length > 3 ? '...' : '')
  } catch { return json || '—' }
}

async function load() {
  cargando.value = true
  try {
    const res = await window.db.bitacoraList(1000)
    if (res.success) data.value = res.data || []
  } catch (e) {
    console.error(e)
    data.value = []
  }
  cargando.value = false
}

function aplicarFiltro() {}

function limpiarFiltros() {
  filtro.value = { tabla: '', accion: '', usuario: '', desde: '', hasta: '' }
}

async function borrarTodo() {
  if (!confirm('Seguro que deseas borrar todos los registros de la bitacora? Esta accion no se puede deshacer.')) return
  try {
    const res = await window.db.bitacoraDeleteAll()
    if (res.success) {
      data.value = []
      toast.add({ severity: 'success', summary: 'Borrado', detail: 'Bitacora limpiada exitosamente', life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo borrar', life: 3000 })
    }
  } catch (e) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al borrar bitacora', life: 3000 })
  }
}

onMounted(load)
</script>

<template>
  <div>
    <Toast />
    <div class="flex items-center gap-3 mb-4">
      <div class="flex-1">
        <h2 class="text-xl font-bold">Bitacora</h2>
        <p class="text-sm text-surface-500">Registro de todas las operaciones del sistema</p>
      </div>
      <Button v-if="auth.isSoporte" icon="pi pi-trash" label="Borrar Todo" severity="danger" size="small" @click="borrarTodo" />
      <Button icon="pi pi-refresh" label="Actualizar" size="small" @click="load" />
    </div>

    <div class="flex flex-wrap gap-2 mb-4 items-end">
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Tabla</label>
        <select v-model="filtro.tabla" class="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 text-sm focus:outline-none focus:ring-2">
          <option value="">Todas</option>
          <option v-for="t in tablasUnicas" :key="t" :value="t">{{ t }}</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Accion</label>
        <select v-model="filtro.accion" class="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 text-sm focus:outline-none focus:ring-2">
          <option value="">Todas</option>
          <option value="CREATE">CREAR</option>
          <option value="UPDATE">MODIFICAR</option>
          <option value="DELETE">ELIMINAR</option>
        </select>
      </div>
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Usuario</label>
        <InputText v-model="filtro.usuario" placeholder="Usuario..." class="!w-32 !h-9" />
      </div>
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Desde</label>
        <input v-model="filtro.desde" type="date" class="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 text-sm focus:outline-none focus:ring-2" />
      </div>
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Hasta</label>
        <input v-model="filtro.hasta" type="date" class="px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 text-sm focus:outline-none focus:ring-2" />
      </div>
      <Button label="Filtrar" icon="pi pi-filter" size="small" @click="aplicarFiltro" style="margin-bottom:1px" />
      <Button label="Limpiar" severity="secondary" text size="small" @click="limpiarFiltros" style="margin-bottom:1px" />
    </div>

    <DataTable
      :value="filtered"
      stripedRows
      responsiveLayout="scroll"
      class="text-xs"
      paginator
      :rows="25"
      :rowsPerPageOptions="[15, 25, 50, 100]"
      :loading="cargando"
      sortField="id"
      :sortOrder="-1"
    >
      <Column field="id" header="#" :style="{ width: '50px' }" />
      <Column field="created_at" header="Fecha/Hora" :style="{ width: '150px' }" sortable>
        <template #body="{ data }">{{ formatFecha(data.created_at) }}</template>
      </Column>
      <Column field="tabla" header="Tabla" :style="{ width: '100px' }" sortable>
        <template #body="{ data }"><span class="font-medium">{{ data.tabla }}</span></template>
      </Column>
      <Column field="registro_id" header="ID" :style="{ width: '50px' }" />
      <Column field="accion" header="Accion" :style="{ width: '80px' }">
        <template #body="{ data }">
          <span class="px-2 py-0.5 rounded-full text-[10px] font-medium" :class="accionClass(data.accion)">{{ data.accion }}</span>
        </template>
      </Column>
      <Column field="usuario" header="Usuario" :style="{ width: '100px' }" />
      <Column header="Detalles" :style="{ minWidth: '250px' }">
        <template #body="{ data }">
          <div v-if="data.accion === 'CREATE'" class="text-surface-500 truncate max-w-[400px]" :title="data.datos_nuevos">{{ resumirDatos(data.datos_nuevos) }}</div>
          <div v-else-if="data.accion === 'DELETE'" class="text-red-500 truncate max-w-[400px]" :title="data.datos_anteriores">{{ resumirDatos(data.datos_anteriores) }}</div>
          <div v-else class="truncate max-w-[400px]" :title="data.datos_nuevos">
            <span class="text-green-600 dark:text-green-400">{{ resumirDatos(data.datos_nuevos) }}</span>
          </div>
        </template>
      </Column>
      <template #empty>
        <div class="text-center py-8 text-surface-400">
          <i class="pi pi-book text-4xl mb-2 block"></i>
          <span class="text-sm">No hay registros en la bitacora</span>
        </div>
      </template>
    </DataTable>
  </div>
</template>
