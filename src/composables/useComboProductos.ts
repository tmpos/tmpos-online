import { ref } from 'vue'

export interface ComboItem {
  id: string
  tipo: 'telefono' | 'accesorio' | 'electrodomestico' | 'manual'
  nombre: string
  cantidad: number
  precio: number
  costo: number
  refId: number | null
}

export interface ComboProducto {
  id: string
  nombre: string
  precio: number
  costo: number
  items: ComboItem[]
  activo: boolean
}

const COMBOS_KEY = 'pos_combos'

export function useComboProductos() {
  const combos = ref<ComboProducto[]>([])
  const dialogCombo = ref(false)
  const comboEditando = ref<ComboProducto | null>(null)
  const dialogSeleccionarCombo = ref(false)

  function cargarCombos() {
    try {
      const raw = localStorage.getItem(COMBOS_KEY)
      combos.value = raw ? JSON.parse(raw) : []
    } catch {
      combos.value = []
    }
  }

  function guardarCombos() {
    localStorage.setItem(COMBOS_KEY, JSON.stringify(combos.value))
  }

  function agregarCombo(combo: ComboProducto) {
    const idx = combos.value.findIndex(c => c.id === combo.id)
    if (idx >= 0) {
      combos.value[idx] = combo
    } else {
      combos.value.push(combo)
    }
    guardarCombos()
  }

  function eliminarCombo(id: string) {
    combos.value = combos.value.filter(c => c.id !== id)
    guardarCombos()
  }

  function nuevoCombo() {
    comboEditando.value = {
      id: `COMBO-${Date.now()}`,
      nombre: '',
      precio: 0,
      costo: 0,
      items: [],
      activo: true,
    }
    dialogCombo.value = true
  }

  function editarCombo(combo: ComboProducto) {
    comboEditando.value = { ...combo }
    dialogCombo.value = true
  }

  function comboToCart(combo: ComboProducto): any[] {
    return combo.items.map(item => ({
      tipo: item.tipo === 'telefono' ? 'imei' : item.tipo === 'electrodomestico' ? 'serial' : item.tipo === 'accesorio' ? 'accesorio' : 'manual',
      nombre: `${combo.nombre} - ${item.nombre}`,
      cantidad: item.cantidad,
      precio: item.precio || 0,
      costo: item.costo || 0,
      origenCombo: combo.id,
    }))
  }

  cargarCombos()

  return {
    combos,
    dialogCombo,
    comboEditando,
    dialogSeleccionarCombo,
    cargarCombos,
    guardarCombos,
    agregarCombo,
    eliminarCombo,
    nuevoCombo,
    editarCombo,
    comboToCart,
  }
}