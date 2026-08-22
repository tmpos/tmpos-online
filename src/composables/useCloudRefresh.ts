import { onActivated } from 'vue'

/**
 * Los modulos dentro de KeepAlive conservan su estado al cambiar de pestana.
 * La primera carga la realiza el onMounted de cada componente; al volver a
 * entrar, esta funcion descarta la vista anterior y consulta la nube una vez.
 * No usa polling, eventos globales ni refrescos por foco.
 */
export function useCloudRefresh(_tablas: string[], cargarDesdeCloud: () => void | Promise<void>) {
  let primeraActivacion = true
  let cargando = false

  onActivated(async () => {
    if (primeraActivacion) {
      primeraActivacion = false
      return
    }
    if (cargando) return
    cargando = true
    try {
      await cargarDesdeCloud()
    } finally {
      cargando = false
    }
  })
}
