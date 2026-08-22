<script setup lang="ts">
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useSystemModeStore, type SystemMode } from '@/stores/systemMode'

const toast = useToast()
const systemMode = useSystemModeStore()

const options: Array<{ value: SystemMode; title: string; description: string; icon: string }> = [
  {
    value: 'celulares',
    title: 'Tienda de celulares',
    description: 'Muestra celulares, IMEI, accesorios y las funciones especializadas del negocio.',
    icon: 'pi pi-mobile',
  },
  {
    value: 'general',
    title: 'Tienda general',
    description: 'Usa Productos como inventario principal y oculta celulares, IMEI y funciones relacionadas.',
    icon: 'pi pi-shop',
  },
]

function selectMode(mode: SystemMode) {
  if (systemMode.mode === mode) return
  systemMode.setMode(mode)
  toast.add({
    severity: 'success',
    summary: 'Modo actualizado',
    detail: mode === 'general' ? 'El sistema ahora esta configurado para una tienda general.' : 'El sistema ahora esta configurado para una tienda de celulares.',
    life: 3000,
  })
}
</script>

<template>
  <div class="space-y-6">
    <Toast />
    <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
      <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
        <i class="pi pi-shop text-primary text-lg"></i>
      </div>
      <div>
        <h2 class="text-xl font-bold">Modo de tienda</h2>
        <p class="text-sm text-surface-500">Adapta los modulos y nombres al tipo de negocio</p>
      </div>
    </div>

    <div class="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-4xl">
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        class="relative flex items-start gap-4 rounded-2xl border-2 p-5 text-left transition-all cursor-pointer"
        :class="systemMode.mode === option.value
          ? 'border-primary bg-primary-50 dark:bg-primary-900/20 shadow-sm'
          : 'border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-primary-300'"
        @click="selectMode(option.value)"
      >
        <span class="w-12 h-12 rounded-xl flex items-center justify-center shrink-0" :class="systemMode.mode === option.value ? 'bg-primary text-primary-contrast' : 'bg-surface-100 dark:bg-surface-700 text-surface-500'">
          <i :class="option.icon" class="text-xl"></i>
        </span>
        <span>
          <span class="font-bold block mb-1">{{ option.title }}</span>
          <span class="text-sm text-surface-500 leading-relaxed">{{ option.description }}</span>
        </span>
        <i v-if="systemMode.mode === option.value" class="pi pi-check-circle text-primary absolute top-4 right-4"></i>
      </button>
    </div>

    <div class="max-w-4xl rounded-xl border border-blue-200 dark:border-blue-800 bg-blue-50 dark:bg-blue-900/20 p-4 flex gap-3">
      <i class="pi pi-info-circle text-blue-600 mt-0.5"></i>
      <p class="text-sm text-blue-800 dark:text-blue-200">El cambio se aplica inmediatamente y se conserva al volver a abrir la aplicacion. No elimina ningun dato; al regresar al modo de celulares, los modulos especializados vuelven a estar disponibles.</p>
    </div>
  </div>
</template>
