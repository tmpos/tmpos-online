import { ref } from 'vue'

export interface TeclaRapida {
  id: string
  nombre: string
  icono: string
  tipo: 'producto' | 'accion'
  accion?: string
  productoId?: number
  productoNombre?: string
  color: string
}

const TECLAS_KEY = 'pos_teclas_rapidas'

export function useTeclasRapidas() {
  const teclasRapidas = ref<TeclaRapida[]>([])
  const dialogTeclaRapida = ref(false)
  const editandoTecla = ref<TeclaRapida | null>(null)

  function cargarTeclas() {
    try {
      const raw = localStorage.getItem(TECLAS_KEY)
      teclasRapidas.value = raw ? JSON.parse(raw) : getDefaultTeclas()
    } catch {
      teclasRapidas.value = getDefaultTeclas()
    }
  }

  function getDefaultTeclas(): TeclaRapida[] {
    return [
      { id: 'fav-1', nombre: 'Fact-Coti', icono: 'pi pi-file-edit', tipo: 'accion', accion: 'factCot', color: 'amber' },
      { id: 'fav-2', nombre: 'Nuevo Cliente', icono: 'pi pi-user-plus', tipo: 'accion', accion: 'nuevoCliente', color: 'blue' },
      { id: 'fav-3', nombre: 'Express', icono: 'pi pi-bolt', tipo: 'accion', accion: 'productoPersonalizado', color: 'purple' },
    ]
  }

  function guardarTeclas() {
    localStorage.setItem(TECLAS_KEY, JSON.stringify(teclasRapidas.value))
  }

  function agregarTecla(tecla: TeclaRapida) {
    const idx = teclasRapidas.value.findIndex(t => t.id === tecla.id)
    if (idx >= 0) {
      teclasRapidas.value[idx] = tecla
    } else {
      teclasRapidas.value.push(tecla)
    }
    guardarTeclas()
  }

  function eliminarTecla(id: string) {
    teclasRapidas.value = teclasRapidas.value.filter(t => t.id !== id)
    guardarTeclas()
  }

  function reordenarTeclas(nuevoOrden: TeclaRapida[]) {
    teclasRapidas.value = nuevoOrden
    guardarTeclas()
  }

  function abrirEditor(tecla?: TeclaRapida) {
    editandoTecla.value = tecla ? { ...tecla } : {
      id: `fav-${Date.now()}`,
      nombre: '',
      icono: 'pi pi-star',
      tipo: 'accion',
      accion: 'factCot',
      color: 'blue',
    }
    dialogTeclaRapida.value = true
  }

  function guardarEditando() {
    if (!editandoTecla.value) return
    agregarTecla(editandoTecla.value)
    dialogTeclaRapida.value = false
    editandoTecla.value = null
  }

  cargarTeclas()

  return {
    teclasRapidas,
    dialogTeclaRapida,
    editandoTecla,
    cargarTeclas,
    agregarTecla,
    eliminarTecla,
    reordenarTeclas,
    abrirEditor,
    guardarEditando,
  }
}
