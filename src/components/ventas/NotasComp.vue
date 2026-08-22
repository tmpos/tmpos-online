<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Button from 'primevue/button'

const props = defineProps<{ modelValue: string }>()
const emit = defineEmits<{ (e: 'update:modelValue', value: string): void }>()

const notas = ref<any[]>([])
const selectedKey = ref<string | null>(null)
const customMode = ref(false)
const customText = ref('')
const editingContent = ref(false)
const contentEditValue = ref('')

const opciones = computed(() => {
  const items = notas.value.map((n: any) => ({
    label: n.titulo,
    value: n.contenido,
  }))
  items.push({ label: '--- Personalizada ---', value: '__custom__' })
  return items
})

async function cargarNotas() {
  const res = await window.db.getAll('notas')
  if (!res.success) {
    notas.value = []
    return
  }
  notas.value = res.data || []
  if (props.modelValue) {
    const match = notas.value.find((nota: any) => nota.contenido === props.modelValue)
    selectedKey.value = match ? match.contenido : '__custom__'
    if (!match) {
      customMode.value = true
      customText.value = props.modelValue
    }
  }
}

onMounted(cargarNotas)

function onChange(value: string | null) {
  if (value === '__custom__') {
    selectedKey.value = '__custom__'
    customMode.value = true
    customText.value = props.modelValue
    return
  }
  customMode.value = false
  editingContent.value = false
  selectedKey.value = value
  emit('update:modelValue', value || '')
}

function aplicarCustom() {
  emit('update:modelValue', customText.value)
  customMode.value = false
}

function activarEditar() {
  editingContent.value = true
  contentEditValue.value = props.modelValue
}

function aplicarEditar() {
  emit('update:modelValue', contentEditValue.value)
  editingContent.value = false
}

function limpiar() {
  emit('update:modelValue', '')
  selectedKey.value = null
  customMode.value = false
  editingContent.value = false
  customText.value = ''
}
</script>

<template>
  <div class="flex flex-col gap-2">
    <Select
      :modelValue="selectedKey"
      :options="opciones"
      optionLabel="label"
      optionValue="value"
      placeholder="Seleccionar nota..."
      fluid
      class="!text-xs"
      @update:modelValue="onChange"
    />

    <div v-if="customMode" class="flex items-start gap-2">
      <Textarea
        v-model="customText"
        placeholder="Escribe la nota..."
        fluid
        autoResize
        :rows="2"
        class="!text-xs"
      />
      <div class="flex flex-col gap-1 flex-shrink-0">
        <Button icon="pi pi-check" severity="info" text rounded size="small" @click="aplicarCustom" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="customMode = false; selectedKey = null" />
      </div>
    </div>

    <div v-else-if="props.modelValue && !editingContent" class="flex items-start gap-2">
      <span class="text-xs flex-1 px-2 py-1 rounded-md bg-primary-50 dark:bg-primary-900/20 text-surface-700 dark:text-surface-200 whitespace-pre-wrap">{{ props.modelValue }}</span>
      <div class="flex flex-col gap-1 flex-shrink-0">
        <Button icon="pi pi-pencil" severity="info" text rounded size="small" class="!w-6 !h-6 !text-[10px]" @click="activarEditar" v-tooltip="'Editar'" />
        <Button icon="pi pi-times" severity="danger" text rounded size="small" class="!w-6 !h-6 !text-[10px]" @click="limpiar" v-tooltip="'Limpiar'" />
      </div>
    </div>

    <div v-else-if="editingContent" class="flex items-start gap-2">
      <Textarea
        v-model="contentEditValue"
        placeholder="Editar nota..."
        fluid
        autoResize
        :rows="2"
        class="!text-xs"
      />
      <div class="flex flex-col gap-1 flex-shrink-0">
        <Button icon="pi pi-check" severity="info" text rounded size="small" @click="aplicarEditar" />
        <Button icon="pi pi-times" severity="secondary" text rounded size="small" @click="editingContent = false" />
      </div>
    </div>
  </div>
</template>
