import { ref } from 'vue'

export interface AlertaStock {
  nombre: string
  tipo: 'accesorio' | 'imei' | 'serial'
  stock: number
  alerta: number
  id: number
}

export function useStockAlertas() {
  const alertasStock = ref<AlertaStock[]>([])
  const dialogAlertasStock = ref(false)

  async function verificarStockBajo(accesorios: any[], imeis: any[], seriales: any[]) {
    const alertas: AlertaStock[] = []

    for (const acc of accesorios) {
      const alerta = Number(acc.alerta || 0)
      const stock = Number(acc.cantidad || 0)
      if (alerta > 0 && stock <= alerta) {
        alertas.push({
          nombre: acc.nombre,
          tipo: 'accesorio',
          stock,
          alerta,
          id: acc.id,
        })
      }
    }

    const imeiCount = new Map<number, { nombre: string; stock: number; alerta: number }>()
    for (const imei of imeis) {
      if (imei.estado === 'DISPONIBLE') {
        const id = Number(imei.id_equi || 0)
        if (!imeiCount.has(id)) {
          const tel = telefonosFromImeis.value?.find((t: any) => t.id === id)
          imeiCount.set(id, { nombre: tel?.nombre || `ID ${id}`, stock: 0, alerta: 3 })
        }
        imeiCount.get(id)!.stock++
      }
    }
    for (const [_, info] of imeiCount) {
      if (info.stock <= info.alerta) {
        alertas.push({
          nombre: info.nombre,
          tipo: 'imei',
          stock: info.stock,
          alerta: info.alerta,
          id: 0,
        })
      }
    }

    alertasStock.value = alertas.slice(0, 20)
  }

  const telefonosFromImeis = ref<any[]>([])

  function setTelefonos(tels: any[]) {
    telefonosFromImeis.value = tels
  }

  function tieneStockBajo(accesorioId: number): boolean {
    return alertasStock.value.some(a => a.tipo === 'accesorio' && a.id === accesorioId)
  }

  function abrirAlertas() {
    dialogAlertasStock.value = true
  }

  return {
    alertasStock,
    dialogAlertasStock,
    verificarStockBajo,
    setTelefonos,
    tieneStockBajo,
    abrirAlertas,
  }
}
