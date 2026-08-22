import { ref, computed } from 'vue'

export function useMiniDashboard() {
  const ventasDelDia = ref(0)
  const cantidadTransacciones = ref(0)
  const gananciaDelDia = ref(0)
  const metodosUsados = ref<Record<string, number>>({})
  const cargandoDashboard = ref(false)
  const mostrarDashboard = ref(false)

  async function cargarDashboard() {
    cargandoDashboard.value = true
    try {
      const hoy = new Date().toISOString().split('T')[0]
      const res = await window.db.getAll('facturas')
      if (res.success) {
        const facturasHoy = (res.data || []).filter((f: any) =>
          f.fecha_emision === hoy && f.tipo_factura === 'FACTURA_VENTA'
        )

        ventasDelDia.value = facturasHoy.reduce((s: number, f: any) => s + Number(f.total || 0), 0)
        cantidadTransacciones.value = facturasHoy.length
        gananciaDelDia.value = facturasHoy.reduce((s: number, f: any) => s + Number(f.ganancia || 0), 0)

        const metodos: Record<string, number> = {}
        for (const f of facturasHoy) {
          const mp = f.metodo_pago || 'OTRO'
          metodos[mp] = (metodos[mp] || 0) + 1
        }
        metodosUsados.value = metodos
      }
    } catch {
      ventasDelDia.value = 0
    } finally {
      cargandoDashboard.value = false
    }
  }

  function toggleDashboard() {
    mostrarDashboard.value = !mostrarDashboard.value
    if (mostrarDashboard.value) cargarDashboard()
  }

  return {
    ventasDelDia,
    cantidadTransacciones,
    gananciaDelDia,
    metodosUsados,
    cargandoDashboard,
    mostrarDashboard,
    cargarDashboard,
    toggleDashboard,
  }
}
