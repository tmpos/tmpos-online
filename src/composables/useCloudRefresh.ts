import { onActivated, onBeforeUnmount, onDeactivated } from 'vue'

/**
 * Los modulos dentro de KeepAlive conservan su estado al cambiar de pestana.
 * La primera carga la realiza el onMounted de cada componente. Al reactivarse,
 * restaurarse la conexion o cambiar una tabla observada, consulta la nube otra vez.
 */
export function useCloudRefresh(tablas: string[], cargarDesdeCloud: () => void | Promise<void>) {
  let primeraActivacion = true
  let cargando = false
  let pendiente = false
  let activo = false
  const tablasObservadas = new Set(tablas.map(tabla => String(tabla).trim().toLowerCase()))

  async function refrescar() {
    if (!activo) return
    if (cargando) {
      pendiente = true
      return
    }
    cargando = true
    try {
      do {
        pendiente = false
        await cargarDesdeCloud()
      } while (pendiente && activo)
    } finally {
      cargando = false
    }
  }

  function alCambiarTabla(event: Event) {
    const tabla = String((event as CustomEvent)?.detail?.table || '').trim().toLowerCase()
    if (!tabla || tablasObservadas.has(tabla)) void refrescar()
  }

  function activarEventos() {
    window.addEventListener('tmcloud:table-changed', alCambiarTabla)
    window.addEventListener('tmcloud:connection-restored', refrescar)
  }

  function desactivarEventos() {
    window.removeEventListener('tmcloud:table-changed', alCambiarTabla)
    window.removeEventListener('tmcloud:connection-restored', refrescar)
  }

  onActivated(() => {
    activo = true
    activarEventos()
    if (primeraActivacion) {
      primeraActivacion = false
      return
    }
    void refrescar()
  })

  onDeactivated(() => {
    activo = false
    desactivarEventos()
  })

  onBeforeUnmount(desactivarEventos)
}
