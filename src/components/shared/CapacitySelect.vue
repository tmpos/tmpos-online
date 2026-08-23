<script setup lang="ts">
import { watch } from 'vue'
import Select from 'primevue/select'
import { useCapacityCatalog } from '@/composables/useCapacityCatalog'

const props = defineProps<{ modelValue?: string }>()
const emit = defineEmits<{ 'update:modelValue': [value: string] }>()
const { capacidades } = useCapacityCatalog()

watch([() => props.modelValue, capacidades], ([value, options]) => {
  if (!value && options.length > 0) emit('update:modelValue', String(options[0].nombre || ''))
}, { immediate: true })
</script>

<template>
  <Select
    :modelValue="modelValue"
    :options="capacidades"
    optionLabel="nombre"
    optionValue="nombre"
    placeholder="Seleccionar capacidad"
    filter
    showClear
    fluid
    @update:modelValue="emit('update:modelValue', $event || '')"
  />
</template>
