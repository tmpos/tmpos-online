import { ref } from 'vue'

const PUNTOS_POR_PESO = 0.01
const PESO_POR_PUNTO = 0.5

export function useLoyalty() {
  const puntosCliente = ref(0)
  const puntosGanados = ref(0)
  const puntosCanjeables = ref(0)
  const dialogPuntos = ref(false)
  const canjeActivo = ref(false)
  const puntosACanjear = ref(0)
  const valorCanje = ref(0)

  function calcularPuntos(monto: number) {
    puntosGanados.value = Math.floor(monto * PUNTOS_POR_PESO)
    return puntosGanados.value
  }

  function calcularValorCanje(puntos: number) {
    return puntos * PESO_POR_PUNTO
  }

  function activarCanje(puntosDisponibles: number) {
    canjeActivo.value = true
    puntosCliente.value = puntosDisponibles
    puntosCanjeables.value = Math.min(puntosDisponibles, 10000)
    puntosACanjear.value = 0
    valorCanje.value = 0
    dialogPuntos.value = true
  }

  function confirmarCanje() {
    const descuento = calcularValorCanje(puntosACanjear.value)
    dialogPuntos.value = false
    return {
      puntosUsados: puntosACanjear.value,
      descuento,
    }
  }

  function cancelarCanje() {
    canjeActivo.value = false
    puntosACanjear.value = 0
    valorCanje.value = 0
    dialogPuntos.value = false
  }

  return {
    puntosCliente,
    puntosGanados,
    dialogPuntos,
    canjeActivo,
    puntosACanjear,
    valorCanje,
    calcularPuntos,
    calcularValorCanje,
    activarCanje,
    confirmarCanje,
    cancelarCanje,
  }
}
