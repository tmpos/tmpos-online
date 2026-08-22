import { ref } from 'vue'
import { useAlmacenStore } from '@/stores/almacen.store'

export interface Alerta {
  tipo: 'stock' | 'turno' | 'cobro'
  mensaje: string
  severidad: 'danger' | 'warning' | 'info'
  ruta?: string
  cantidad?: number
}

export function useAlertas() {
  const alertas = ref<Alerta[]>([])
  const loadingAlertas = ref(false)

  const claveAlerta = (alerta: Alerta) => `${alerta.tipo}|${alerta.mensaje}`
  const obtenerDescartadas = (): string[] => {
    try { return JSON.parse(localStorage.getItem('alertas_descartadas') || '[]') } catch { return [] }
  }
  const guardarDescartadas = (claves: string[]) => {
    localStorage.setItem('alertas_descartadas', JSON.stringify([...new Set(claves)].slice(-100)))
  }

  async function verificarAlertas() {
    loadingAlertas.value = true
    const result: Alerta[] = []
    const almacenId = useAlmacenStore().activeId || 0

    try {
      const [resAcc, resElec, resPiezas] = await Promise.all([
        (window as any).electron.invoke('db:getAll', 'accesorios'),
        (window as any).electron.invoke('db:getAll', 'electrodomesticos'),
        (window as any).electron.invoke('db:getAll', 'piezas'),
      ])

      for (const res of [resAcc, resElec, resPiezas]) {
        if (!res.success) continue
        for (const item of res.data || []) {
          const cant = Number(item.cantidad || 0)
          const alerta = Number(item.alerta || 0)
          if (alerta > 0 && cant <= alerta) {
            result.push({
              tipo: 'stock',
              mensaje: `${item.nombre}: ${cant} / ${alerta} unidades`,
              severidad: cant === 0 ? 'danger' : 'warning',
              ruta: '/inventario',
              cantidad: cant,
            })
          }
        }
      }
    } catch {}

    try {
      const resTurno = await (window as any).electron.invoke('caja:getTurnoActivo')
      if (!resTurno.success || !resTurno.data) {
        result.push({
          tipo: 'turno',
          mensaje: 'No hay turno de caja abierto',
          severidad: 'warning',
          ruta: '/contabilidad',
        })
      }
    } catch {}

    const descartadas = new Set(obtenerDescartadas())
    alertas.value = result.filter(alerta => !descartadas.has(claveAlerta(alerta))).slice(0, 20)
    loadingAlertas.value = false
  }

  function descartarAlerta(alerta: Alerta) {
    guardarDescartadas([...obtenerDescartadas(), claveAlerta(alerta)])
    alertas.value = alertas.value.filter(item => claveAlerta(item) !== claveAlerta(alerta))
  }

  function descartarTodas() {
    guardarDescartadas([...obtenerDescartadas(), ...alertas.value.map(claveAlerta)])
    alertas.value = []
  }

  return { alertas, loadingAlertas, verificarAlertas, descartarAlerta, descartarTodas }
}
