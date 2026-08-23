import { ref } from 'vue'
import { useCloudRefresh } from '@/composables/useCloudRefresh'

export function useCapacityCatalog() {
  const capacidades = ref<any[]>([])
  async function cargarCapacidades() {
    const result = await window.db.getAll('capacidades')
    capacidades.value = result.success && Array.isArray(result.data)
      ? result.data.filter((item: any) => item?.nombre).sort((a: any, b: any) => String(a.nombre).localeCompare(String(b.nombre), undefined, { numeric: true }))
      : []
  }
  void cargarCapacidades()
  useCloudRefresh(['capacidades'], cargarCapacidades)
  return { capacidades, cargarCapacidades }
}
