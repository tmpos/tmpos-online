<script setup lang="ts">
import { watch } from 'vue'
import Select from 'primevue/select'
import { useColorCatalog } from '@/composables/useColorCatalog'

const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { colores } = useColorCatalog()

watch([() => props.modelValue, colores], ([value, options]) => {
  if (!value && options.length > 0) emit('update:modelValue', String(options[0].nombre || ''))
}, { immediate: true })
</script>

<template>
  <Select
    :modelValue="modelValue"
    :options="colores"
    optionLabel="nombre"
    optionValue="nombre"
    placeholder="Seleccionar color"
    filter
    showClear
    fluid
    @update:modelValue="emit('update:modelValue', $event || '')"
  >
    <template #value="{ value, placeholder }">
      <div v-if="value" class="flex items-center gap-2">
        <span class="w-4 h-4 rounded-full border border-surface-300" :style="{ backgroundColor: colores.find(c => c.nombre === value)?.codigo || value }"></span>
        <span>{{ value }}</span>
      </div>
      <span v-else>{{ placeholder }}</span>
    </template>
    <template #option="{ option }">
      <div class="flex items-center gap-2">
        <span class="w-5 h-5 rounded-full border border-surface-300 shadow-sm" :style="{ backgroundColor: option.codigo || option.nombre }"></span>
        <span>{{ option.nombre }}</span>
        <span class="ml-auto text-xs text-surface-400">{{ option.codigo }}</span>
      </div>
    </template>
  </Select>
</template>
