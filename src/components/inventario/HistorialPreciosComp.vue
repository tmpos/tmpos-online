<template>
  <div class="p-4 sm:p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Historial de Precios</h1>
        <p class="text-sm text-surface-500">Registro de cambios de precios en productos</p>
      </div>
      <div class="flex gap-2">
        <Select v-model="filtroTabla" :options="tiposDisponibles" optionLabel="label" optionValue="value" placeholder="Tipo" class="w-36" size="small" @change="cargar" />
        <button @click="cargar" class="px-3 py-2 rounded-lg text-xs font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100"><i class="pi pi-refresh mr-1"></i></button>
      </div>
    </div>

    <DataTable :value="historial" stripedRows paginator :rows="20" dataKey="id" sortField="created_at" :sortOrder="-1">
      <Column field="created_at" header="Fecha" sortable style="width:8rem">
        <template #body="{ data }">{{ $formatDateTime(data.created_at) }}</template>
      </Column>
      <Column field="producto_nombre" header="Producto" sortable />
      <Column field="tabla" header="Tipo" sortable style="width:6rem"><template #body="{ data }">{{ systemMode.isGeneralStore && data.tabla === 'accesorios' ? 'productos' : data.tabla }}</template></Column>
      <Column field="campo" header="Campo" sortable style="width:7rem" />
      <Column header="Valor Anterior" sortable style="width:7rem">
        <template #body="{ data }"><span class="text-red-500 line-through text-sm">{{ data.valor_anterior }}</span></template>
      </Column>
      <Column header="Valor Nuevo" sortable style="width:7rem">
        <template #body="{ data }"><span class="text-green-600 font-semibold">{{ data.valor_nuevo }}</span></template>
      </Column>
      <template #empty>
        <div class="text-center py-10 text-surface-400">No hay cambios de precio registrados.</div>
      </template>
    </DataTable>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Select from 'primevue/select'
import { useSystemModeStore } from '@/stores/systemMode'

const systemMode = useSystemModeStore()
const historial = ref<any[]>([])
const filtroTabla = ref('TODAS')
const tiposDisponibles = computed(() => [
  { label: 'TODAS', value: 'TODAS' },
  { label: systemMode.isGeneralStore ? 'productos' : 'accesorios', value: 'accesorios' },
  { label: 'electrodomesticos', value: 'electrodomesticos' },
  { label: 'piezas', value: 'piezas' },
  ...(systemMode.isCellphoneStore ? [{ label: 'imei', value: 'imei' }] : []),
  { label: 'serial', value: 'serial' },
])

async function cargar() {
  try {
    if (filtroTabla.value === 'TODAS') {
      const res = await (window as any).electron.invoke('db:getAll', 'historial_precios')
      if (res.success) historial.value = (res.data || []).filter((item: any) => !systemMode.isGeneralStore || item.tabla !== 'imei')
    } else {
      const res = await (window as any).electron.invoke('db:getWhere', 'historial_precios', 'tabla = ?', [filtroTabla.value])
      if (res.success) historial.value = res.data || []
    }
  } catch {}
}

onMounted(cargar)
</script>
