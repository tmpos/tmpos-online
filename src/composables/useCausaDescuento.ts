import { ref } from 'vue'

const CAUSAS_DESCUENTO = [
  { id: 'cliente_frecuente', label: 'Cliente frecuente' },
  { id: 'producto_danado', label: 'Producto dañado / exhibición' },
  { id: 'volumen', label: 'Compra por volumen' },
  { id: 'liquidacion', label: 'Liquidación / temporada' },
  { id: 'error_precio', label: 'Error de precio en etiqueta' },
  { id: 'empleado', label: 'Descuento empleado' },
  { id: 'competencia', label: 'Igualar precio competencia' },
  { id: 'otro', label: 'Otro' },
]

export function useCausaDescuento() {
  const requerirCausa = ref(true)
  const dialogCausaDescuento = ref(false)
  const causaSeleccionada = ref('')
  const causaOtraEspecificar = ref('')
  const onConfirmarCallback = ref<(() => void) | null>(null)

  function pedirCausa(onConfirmar: () => void) {
    if (!requerirCausa.value) {
      onConfirmar()
      return
    }
    causaSeleccionada.value = ''
    causaOtraEspecificar.value = ''
    onConfirmarCallback.value = onConfirmar
    dialogCausaDescuento.value = true
  }

  function confirmarCausa() {
    if (!causaSeleccionada.value && requerirCausa.value) return
    dialogCausaDescuento.value = false
    onConfirmarCallback.value?.()
    onConfirmarCallback.value = null
  }

  function getCausaTexto(): string {
    if (!causaSeleccionada.value) return ''
    const causa = CAUSAS_DESCUENTO.find(c => c.id === causaSeleccionada.value)
    const texto = causa?.label || causaSeleccionada.value
    if (causaSeleccionada.value === 'otro' && causaOtraEspecificar.value) {
      return `${texto}: ${causaOtraEspecificar.value}`
    }
    return texto
  }

  return {
    requerirCausa,
    dialogCausaDescuento,
    causaSeleccionada,
    causaOtraEspecificar,
    CAUSAS_DESCUENTO,
    pedirCausa,
    confirmarCausa,
    getCausaTexto,
  }
}
