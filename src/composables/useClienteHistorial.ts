import { ref } from 'vue'

export interface CompraAnterior {
  id: number
  no_factura: string
  fecha_emision: string
  hora: string
  total: number
  metodo_pago: string
  productos: any[]
  ncf: string
}

export function useClienteHistorial() {
  const historialCliente = ref<CompraAnterior[]>([])
  const dialogHistorialCliente = ref(false)
  const cargandoHistorial = ref(false)
  const clienteHistorialNombre = ref('')

  async function cargarHistorialCliente(clienteId: string | number, clienteNombre: string) {
    cargandoHistorial.value = true
    clienteHistorialNombre.value = clienteNombre
    try {
      const res = await window.db.getAll('facturas')
      if (res.success) {
        const facturas: CompraAnterior[] = (res.data || [])
          .filter((f: any) =>
            f.tipo_factura === 'FACTURA_VENTA' &&
            (String(f.cod_cliente || '') === String(clienteId) ||
             String(f.nombre_cliente || '').toUpperCase() === clienteNombre.toUpperCase())
          )
          .sort((a: any, b: any) => {
            const fechaA = new Date(a.fecha_emision || a.created_at || 0).getTime()
            const fechaB = new Date(b.fecha_emision || b.created_at || 0).getTime()
            return fechaB - fechaA
          })
          .slice(0, 30)
        historialCliente.value = facturas.map((f: any) => ({
          ...f,
          productos: typeof f.productos === 'string' ? JSON.parse(f.productos || '[]') : (f.productos || []),
        }))
      }
    } catch {
      historialCliente.value = []
    } finally {
      cargandoHistorial.value = false
    }
  }

  function abrirHistorial(clienteId: string | number, clienteNombre: string) {
    dialogHistorialCliente.value = true
    cargarHistorialCliente(clienteId, clienteNombre)
  }

  function formatFecha(fecha: string, hora: string) {
    return `${fecha || ''}${hora ? ' ' + hora : ''}`.trim()
  }

  return {
    historialCliente,
    dialogHistorialCliente,
    cargandoHistorial,
    clienteHistorialNombre,
    cargarHistorialCliente,
    abrirHistorial,
    formatFecha,
  }
}
