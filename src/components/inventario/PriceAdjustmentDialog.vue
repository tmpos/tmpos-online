<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Select from 'primevue/select'
import InputNumber from 'primevue/inputnumber'
import ToggleSwitch from 'primevue/toggleswitch'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'

const props = defineProps<{
  visible: boolean
  items: any[]
  selectedItems?: any[]
  itemLabel: string
  scopeLabel: string
  currency: string
  locale: string
  loading?: boolean
}>()

const emit = defineEmits<{
  'update:visible': [value: boolean]
  apply: [changes: Array<{ id: number; data: Record<string, number> }>]
}>()

const mode = ref<'percentage' | 'manual'>('percentage')
const direction = ref<'increase' | 'decrease'>('increase')
const percentage = ref<number | null>(null)
const affectMinimum = ref(false)
const affectWholesale = ref(false)
const salePrices = ref<Record<number, number>>({})
const minimumPrices = ref<Record<number, number>>({})
const wholesalePrices = ref<Record<number, number>>({})
const scope = ref<'all' | 'selected'>('all')
const effectiveItems = computed(() => scope.value === 'selected' ? (props.selectedItems || []) : props.items)

watch(() => props.visible, (visible) => {
  if (!visible) return
  mode.value = 'percentage'
  direction.value = 'increase'
  percentage.value = null
  affectMinimum.value = false
  affectWholesale.value = false
  scope.value = props.selectedItems?.length ? 'selected' : 'all'
  salePrices.value = Object.fromEntries(props.items.map(item => [Number(item.id), Number(item.precio_venta || 0)]))
  minimumPrices.value = Object.fromEntries(props.items.map(item => [Number(item.id), Number(item.precio_min || 0)]))
  wholesalePrices.value = Object.fromEntries(props.items.map(item => [Number(item.id), Number(item.precio_xmayor || 0)]))
})

function adjusted(value: number, factor: number) {
  return Math.max(0, Math.round(value * factor * 100) / 100)
}

function apply() {
  const pct = Number(percentage.value || 0)
  if (mode.value === 'percentage' && pct <= 0) return
  const factor = direction.value === 'increase' ? 1 + pct / 100 : 1 - pct / 100
  const changes = effectiveItems.value.map(item => {
    const id = Number(item.id)
    const sale = Number(item.precio_venta || 0)
    const minimum = Number(item.precio_min || 0)
    const wholesale = Number(item.precio_xmayor || 0)
    const data: Record<string, number> = {
      precio_venta: mode.value === 'percentage' ? adjusted(sale, factor) : Math.max(0, Number(salePrices.value[id] ?? sale)),
    }
    if (affectMinimum.value) data.precio_min = mode.value === 'percentage' ? adjusted(minimum, factor) : Math.max(0, Number(minimumPrices.value[id] ?? minimum))
    if (affectWholesale.value) data.precio_xmayor = mode.value === 'percentage' ? adjusted(wholesale, factor) : Math.max(0, Number(wholesalePrices.value[id] ?? wholesale))
    return { id, data }
  }).filter(({ id, data }) => {
    const item = effectiveItems.value.find(current => Number(current.id) === id)
    return Object.entries(data).some(([field, value]) => Number(item?.[field] || 0) !== value)
  })
  emit('apply', changes)
}
</script>

<template>
  <Dialog :visible="visible" header="Ajustar precios de venta" modal :style="{ width: 'min(46rem, 94vw)' }" :closable="!loading" @update:visible="emit('update:visible', $event)">
    <div class="space-y-4 pt-2">
      <div class="grid grid-cols-2 gap-2 rounded-xl bg-surface-100 dark:bg-surface-800 p-1">
        <Button label="Por porcentaje" icon="pi pi-percentage" :severity="mode === 'percentage' ? 'primary' : 'secondary'" :text="mode !== 'percentage'" @click="mode = 'percentage'" />
        <Button label="Precio fijo manual" icon="pi pi-pencil" :severity="mode === 'manual' ? 'primary' : 'secondary'" :text="mode !== 'manual'" @click="mode = 'manual'" />
      </div>
      <p class="text-sm text-surface-500">Hay {{ items.length }} {{ itemLabel }} visibles en el {{ scopeLabel }}.</p>
      <div class="space-y-1.5">
        <label class="text-sm font-medium">Aplicar a</label>
        <Select v-model="scope" :options="[{ label: `Todos (${items.length})`, value: 'all' }, { label: `Solo seleccionados (${selectedItems?.length || 0})`, value: 'selected', disabled: !selectedItems?.length }]" optionLabel="label" optionValue="value" optionDisabled="disabled" fluid />
        <p class="text-xs text-surface-500">Se modificarán <strong>{{ effectiveItems.length }}</strong> registro(s).</p>
      </div>
      <div class="flex flex-wrap gap-3">
        <label class="flex flex-1 min-w-48 items-center justify-between gap-3 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer">
          <span class="text-sm font-medium">Afectar precio mínimo</span><ToggleSwitch v-model="affectMinimum" />
        </label>
        <label class="flex flex-1 min-w-48 items-center justify-between gap-3 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer">
          <span class="text-sm font-medium">Afectar precio al por mayor</span><ToggleSwitch v-model="affectWholesale" />
        </label>
      </div>
      <div v-if="mode === 'percentage'" class="grid sm:grid-cols-2 gap-4">
        <div class="space-y-1.5"><label class="text-sm font-medium">Operación</label><Select v-model="direction" :options="[{ label: 'Aumentar', value: 'increase' }, { label: 'Disminuir', value: 'decrease' }]" optionLabel="label" optionValue="value" fluid /></div>
        <div class="space-y-1.5"><label class="text-sm font-medium">Porcentaje</label><InputNumber v-model="percentage" suffix=" %" :min="0.01" :max="100" :maxFractionDigits="2" fluid @keyup.enter="apply" /></div>
        <div class="sm:col-span-2 rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-950/30 p-3 text-sm text-blue-700 dark:text-blue-300">Ejemplo: un precio de 1,000 quedará en <strong>{{ (direction === 'increase' ? 1000 * (1 + Number(percentage || 0) / 100) : 1000 * (1 - Number(percentage || 0) / 100)).toFixed(2) }}</strong>.</div>
      </div>
      <DataTable v-else :value="effectiveItems" scrollable scrollHeight="24rem" stripedRows size="small" dataKey="id">
        <Column field="nombre" header="Nombre" /><Column header="Precio actual" style="width:9rem"><template #body="{ data }">{{ Number(data.precio_venta || 0).toFixed(2) }}</template></Column>
        <Column header="Nuevo precio fijo" style="width:13rem"><template #body="{ data }"><InputNumber v-model="salePrices[Number(data.id)]" mode="currency" :currency="currency" :locale="locale" :min="0" fluid /></template></Column>
        <Column v-if="affectMinimum" header="Nuevo mínimo" style="width:13rem"><template #body="{ data }"><InputNumber v-model="minimumPrices[Number(data.id)]" mode="currency" :currency="currency" :locale="locale" :min="0" fluid /></template></Column>
        <Column v-if="affectWholesale" header="Nuevo por mayor" style="width:13rem"><template #body="{ data }"><InputNumber v-model="wholesalePrices[Number(data.id)]" mode="currency" :currency="currency" :locale="locale" :min="0" fluid /></template></Column>
      </DataTable>
    </div>
    <template #footer>
      <Button label="Cancelar" severity="secondary" text :disabled="loading" @click="emit('update:visible', false)" />
      <Button label="Guardar precios" icon="pi pi-check" :loading="loading" :disabled="mode === 'percentage' && Number(percentage || 0) <= 0" @click="apply" />
    </template>
  </Dialog>
</template>
