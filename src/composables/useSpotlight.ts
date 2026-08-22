import { ref, computed } from 'vue'
import { useSystemModeStore } from '@/stores/systemMode'

export interface SpotlightResultado {
  tipo: 'producto' | 'cliente' | 'accion'
  label: string
  detalle: string
  icono: string
  data: any
  accion: string
}

export function useSpotlight() {
  const systemMode = useSystemModeStore()
  const dialogSpotlight = ref(false)
  const busquedaSpotlight = ref('')
  const spotlightIndex = ref(-1)

  const telefonos = ref<any[]>([])
  const accesorios = ref<any[]>([])
  const clientes = ref<any[]>([])

  const resultadosSpotlight = computed(() => {
    const texto = busquedaSpotlight.value.toLowerCase().trim()
    if (!texto || texto.length < 2) return []

    const results: SpotlightResultado[] = []

    for (const tel of telefonos.value) {
      if (tel.nombre?.toLowerCase().includes(texto)) {
        results.push({
          tipo: 'producto', label: tel.nombre, detalle: 'Teléfono',
          icono: 'pi pi-mobile', data: tel, accion: 'telefono',
        })
      }
    }

    for (const acc of accesorios.value) {
      if (acc.nombre?.toLowerCase().includes(texto) || acc.marca_nombre?.toLowerCase().includes(texto)) {
        results.push({
        tipo: 'producto', label: acc.nombre, detalle: `${systemMode.isGeneralStore ? 'Producto' : 'Accesorio'} | Stock: ${acc.cantidad || 0}`,
          icono: 'pi pi-box', data: acc, accion: 'accesorio',
        })
      }
    }

    for (const cli of clientes.value) {
      if (cli.nombre?.toLowerCase().includes(texto) || cli.telefono?.includes(texto) || cli.rnc?.includes(texto)) {
        results.push({
          tipo: 'cliente', label: cli.nombre, detalle: cli.telefono || cli.rnc || '',
          icono: 'pi pi-user', data: cli, accion: 'cliente',
        })
      }
    }

    results.push({
      tipo: 'accion', label: 'Producto personalizado',
      detalle: 'Agregar producto no registrado al carrito',
      icono: 'pi pi-plus-circle', data: null, accion: 'productoPersonalizado',
    })
    results.push({
      tipo: 'accion', label: 'Nuevo cliente',
      detalle: 'Crear un cliente nuevo',
      icono: 'pi pi-user-plus', data: null, accion: 'nuevoCliente',
    })

    return results.slice(0, 20)
  })

  function abrirSpotlight(tels: any[], accs: any[], clis: any[]) {
    telefonos.value = tels
    accesorios.value = accs
    clientes.value = clis
    busquedaSpotlight.value = ''
    spotlightIndex.value = -1
    dialogSpotlight.value = true
  }

  function cerrarSpotlight() {
    dialogSpotlight.value = false
    busquedaSpotlight.value = ''
  }

  function manejarSpotlightKeydown(e: KeyboardEvent, onSelect: (r: SpotlightResultado) => void) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      spotlightIndex.value = Math.min(spotlightIndex.value + 1, resultadosSpotlight.value.length - 1)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      spotlightIndex.value = Math.max(spotlightIndex.value - 1, -1)
    } else if (e.key === 'Enter' && spotlightIndex.value >= 0) {
      e.preventDefault()
      onSelect(resultadosSpotlight.value[spotlightIndex.value])
      cerrarSpotlight()
    } else if (e.key === 'Enter' && resultadosSpotlight.value.length > 0) {
      e.preventDefault()
      onSelect(resultadosSpotlight.value[0])
      cerrarSpotlight()
    }
  }

  return {
    dialogSpotlight,
    busquedaSpotlight,
    spotlightIndex,
    resultadosSpotlight,
    abrirSpotlight,
    cerrarSpotlight,
    manejarSpotlightKeydown,
  }
}
