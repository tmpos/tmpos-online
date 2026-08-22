import { ref } from 'vue'

export function useBarcodeEntry() {
  const barcodeBuffer = ref('')
  const barcodeTimeout = ref<ReturnType<typeof setTimeout> | null>(null)
  const modoBarcode = ref(false)
  const barcodeActivo = ref(false)

  const BARCODE_TIMEOUT = 50

  function iniciarEscuchaBarcode(
    onBarcode: (code: string) => void,
    onError?: (msg: string) => void
  ) {
    barcodeActivo.value = true
    modoBarcode.value = true

    const handler = (e: KeyboardEvent) => {
      if (!barcodeActivo.value) return
      if (e.ctrlKey || e.altKey || e.metaKey) return

      if (e.key === 'Enter' && barcodeBuffer.value.length >= 3) {
        const code = barcodeBuffer.value
        barcodeBuffer.value = ''
        if (barcodeTimeout.value) clearTimeout(barcodeTimeout.value)
        onBarcode(code)
        return
      }

      if (e.key.length === 1) {
        barcodeBuffer.value += e.key
        if (barcodeTimeout.value) clearTimeout(barcodeTimeout.value)
        barcodeTimeout.value = setTimeout(() => {
          if (barcodeBuffer.value.length >= 3) {
            const code = barcodeBuffer.value
            barcodeBuffer.value = ''
            onBarcode(code)
          } else {
            barcodeBuffer.value = ''
          }
        }, BARCODE_TIMEOUT)
      }
    }

    window.addEventListener('keydown', handler)

    return () => {
      window.removeEventListener('keydown', handler)
      barcodeActivo.value = false
      if (barcodeTimeout.value) clearTimeout(barcodeTimeout.value)
    }
  }

  function toggleBarcode() {
    barcodeActivo.value = !barcodeActivo.value
  }

  return {
    barcodeBuffer,
    modoBarcode,
    barcodeActivo,
    iniciarEscuchaBarcode,
    toggleBarcode,
  }
}
