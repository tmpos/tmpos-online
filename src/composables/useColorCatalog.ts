import { ref } from 'vue'
import { useCloudRefresh } from '@/composables/useCloudRefresh'

export function useColorCatalog() {
  const colores = ref<any[]>([])

  async function cargarColores() {
    const result = await window.db.getAll('colores')
    colores.value = result.success && Array.isArray(result.data)
      ? result.data.filter((color: any) => color?.nombre).sort((a: any, b: any) => String(a.nombre).localeCompare(String(b.nombre)))
      : []
  }

  void cargarColores()
  useCloudRefresh(['colores'], cargarColores)
  return { colores, cargarColores }
}
