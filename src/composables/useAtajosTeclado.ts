import { onMounted, onUnmounted, type Ref } from 'vue'

type AccionMap = Record<string, () => void>

const combinaciones: { key: string; ctrl?: boolean; alt?: boolean; shift?: boolean; desc: string }[] = []

export function useAtajosTeclado(acciones: AccionMap) {
  function handler(e: KeyboardEvent) {
    const target = e.target as HTMLElement | null
    const tag = target?.tagName?.toLowerCase()
    const escribiendo = tag === 'input' || tag === 'textarea' || tag === 'select' || Boolean(target?.isContentEditable)
    if (escribiendo) return

    const key = e.key.toLowerCase()
    const ctrl = e.ctrlKey || e.metaKey

    if (ctrl && key === 'k') { e.preventDefault(); acciones['ctrl+k']?.() }
    else if (ctrl && key === 'n') { e.preventDefault(); acciones['ctrl+n']?.() }
    else if (ctrl && key === 'l') { e.preventDefault(); acciones['ctrl+l']?.() }
    else if (ctrl && key === 'd') { e.preventDefault(); acciones['ctrl+d']?.() }
    else if (ctrl && key === 's') { e.preventDefault(); acciones['ctrl+s']?.() }
    else if (ctrl && key === 'p') { e.preventDefault(); acciones['ctrl+p']?.() }
    else if (ctrl && key === 'h') { e.preventDefault(); acciones['ctrl+h']?.() }
    else if (key === 'f2') { e.preventDefault(); acciones['f2']?.() }
    else if (key === 'f3') { e.preventDefault(); acciones['f3']?.() }
    else if (key === 'f4') { e.preventDefault(); acciones['f4']?.() }
    else if (key === 'f5') { e.preventDefault(); acciones['f5']?.() }
    else if (key === 'f6') { e.preventDefault(); acciones['f6']?.() }
    else if (key === 'f7') { e.preventDefault(); acciones['f7']?.() }
    else if (key === 'f8') { e.preventDefault(); acciones['f8']?.() }
    else if (key === 'f9') { e.preventDefault(); acciones['f9']?.() }
    else if (key === 'f10') { e.preventDefault(); acciones['f10']?.() }
    else if (key === 'f11') { e.preventDefault(); acciones['f11']?.() }
    else if (key === 'f12') { e.preventDefault(); acciones['f12']?.() }
    else if (key === 'escape') { acciones['escape']?.() }
    else if (key === 'enter' && !e.ctrlKey && !e.metaKey) { acciones['enter']?.() }
  }

  onMounted(() => window.addEventListener('keydown', handler))
  onUnmounted(() => window.removeEventListener('keydown', handler))

  return {
    atajosDisponibles: [
      { tecla: 'F2', desc: 'Buscar producto' },
      { tecla: 'F3', desc: 'Abrir carrito/cliente' },
      { tecla: 'F4', desc: 'Completar venta' },
      { tecla: 'F5', desc: 'Cambiar método de pago' },
      { tecla: 'F6', desc: 'Descuento' },
      { tecla: 'F7', desc: 'Producto personalizado' },
      { tecla: 'F8', desc: 'Fact-Coti' },
      { tecla: 'F9', desc: 'Limpiar carrito' },
      { tecla: 'F10', desc: 'Express (venta rápida)' },
      { tecla: 'F11', desc: 'Nota' },
      { tecla: 'F12', desc: 'Ayuda / Atajos' },
      { tecla: 'Ctrl+K', desc: 'Búsqueda global' },
      { tecla: 'Ctrl+N', desc: 'Nuevo producto personalizado' },
      { tecla: 'Ctrl+L', desc: 'Limpiar carrito' },
      { tecla: 'Ctrl+D', desc: 'Descuento' },
      { tecla: 'Ctrl+S', desc: 'Completar venta' },
      { tecla: 'Ctrl+P', desc: 'Cambiar precio' },
      { tecla: 'Ctrl+H', desc: 'Retener/Hold venta' },
      { tecla: 'Escape', desc: 'Cerrar diálogo actual' },
    ],
  }
}
