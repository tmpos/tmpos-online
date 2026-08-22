import { computed, ref, watch } from 'vue'
import { defineStore } from 'pinia'

export type SystemMode = 'celulares' | 'general'

const STORAGE_KEY = 'tmpos-system-mode'

export const useSystemModeStore = defineStore('systemMode', () => {
  const storedMode = localStorage.getItem(STORAGE_KEY)
  const mode = ref<SystemMode>(storedMode === 'general' ? 'general' : 'celulares')

  const isGeneralStore = computed(() => mode.value === 'general')
  const isCellphoneStore = computed(() => mode.value === 'celulares')
  const productLabel = computed(() => isGeneralStore.value ? 'Productos' : 'Accesorios')

  function setMode(value: SystemMode) {
    mode.value = value
  }

  watch(mode, (value) => {
    localStorage.setItem(STORAGE_KEY, value)
    document.documentElement.dataset.systemMode = value
  }, { immediate: true })

  return { mode, isGeneralStore, isCellphoneStore, productLabel, setMode }
})
