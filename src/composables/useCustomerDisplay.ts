import { ref } from 'vue'
import { formatSystemCurrency } from '@/i18n/localeProfiles'
import { escapeHtml, sanitizePrintableHtml } from '@/utils/htmlSecurity'

export function useCustomerDisplay() {
  const ventanaCliente = ref<Window | null>(null)

  function abrirPantallaCliente(items: any[], total: number, metodoPago: string, cliente: string, montoRecibido = 0, cambio = 0) {
    if (ventanaCliente.value && !ventanaCliente.value.closed) {
      ventanaCliente.value.focus()
      actualizarDisplay(items, total, metodoPago, cliente, montoRecibido, cambio)
      return
    }

    const w = 400
    const h = 650
    const x = window.screen.width - w - 20
    const y = 60

    ventanaCliente.value = window.open(
      '',
      'customer_display',
      `width=${w},height=${h},left=${x},top=${y},toolbar=no,menubar=no,location=no,status=no`
    )

    if (ventanaCliente.value) {
      ventanaCliente.value.document.write(sanitizePrintableHtml(generarHtmlCliente(items, total, metodoPago, cliente, montoRecibido, cambio)))
      ventanaCliente.value.document.close()

      const checkClosed = setInterval(() => {
        if (ventanaCliente.value?.closed) {
          ventanaCliente.value = null
          clearInterval(checkClosed)
        }
      }, 1000)
    }
  }

  function actualizarDisplay(items: any[], total: number, metodoPago: string, cliente: string, montoRecibido: number, cambio: number) {
    if (!ventanaCliente.value || ventanaCliente.value.closed) return
    const doc = ventanaCliente.value.document

    const clienteEl = doc.getElementById('cliente')
    if (clienteEl) clienteEl.textContent = 'Cliente: ' + (cliente || 'CONSUMIDOR FINAL')

    const totalEl = doc.getElementById('total')
    if (totalEl) totalEl.textContent = formatSystemCurrency(total)

    const pagoEl = doc.getElementById('pago')
    if (pagoEl) pagoEl.textContent = 'Pago: ' + (metodoPago || 'EFECTIVO')

    const recibidoEl = doc.getElementById('recibido')
    if (recibidoEl) {
      recibidoEl.textContent = montoRecibido > 0
        ? 'Recibido: ' + formatSystemCurrency(montoRecibido)
        : ''
    }

    const cambioEl = doc.getElementById('cambio')
    const cambioRow = doc.getElementById('cambioRow')
    if (cambioRow && cambioEl) {
      if (cambio > 0) {
        cambioRow.style.display = 'flex'
        cambioEl.textContent = formatSystemCurrency(cambio)
      } else {
        cambioRow.style.display = 'none'
      }
    }

    const itemsEl = doc.getElementById('items')
    if (itemsEl) {
      if (!items || items.length === 0) {
        itemsEl.innerHTML = '<div class="empty">Esperando productos...</div>'
      } else {
        let html = ''
        for (let i = 0; i < items.length; i++) {
          const item = items[i]
          const nombre = escapeHtml(item.nombre || 'Producto')
          const cantidad = item.cantidad || 1
          const precio = item.precio || 0
          let detalle = ''
          if (item.imei) detalle += 'IMEI: ' + escapeHtml(item.imei) + ' '
          if (item.serial) detalle += 'Serial: ' + escapeHtml(item.serial) + ' '
          if (item.color) detalle += escapeHtml(item.color) + ' '
          if (item.capacidad) detalle += escapeHtml(item.capacidad)
          html += '<div class="item">' +
            '<div><div class="nombre">' + (cantidad > 1 ? cantidad + ' x ' : '') + nombre + '</div>' +
            (detalle ? '<div class="detalle">' + detalle + '</div>' : '') +
            '</div>' +
            '<div class="precio">' + formatSystemCurrency(precio * cantidad) + '</div>' +
            '</div>'
        }
        itemsEl.innerHTML = html
      }
    }
  }

  function cerrarPantallaCliente() {
    if (ventanaCliente.value && !ventanaCliente.value.closed) {
      ventanaCliente.value.close()
    }
    ventanaCliente.value = null
  }

  function generarHtmlCliente(items: any[], total: number, metodoPago: string, cliente: string, montoRecibido: number, cambio: number): string {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cliente - TMPOS</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: 'Segoe UI', Arial, sans-serif; background: #0f172a; color: #f8fafc; height: 100vh; display: flex; flex-direction: column; overflow: hidden; }
    .header { background: linear-gradient(135deg, #1e293b, #334155); padding: 14px 20px; text-align: center; border-bottom: 2px solid #3b82f6; flex-shrink: 0; }
    .header h1 { font-size: 16px; color: #3b82f6; }
    .header .cliente { font-size: 12px; color: #94a3b8; margin-top: 2px; }
    .items { flex: 1; overflow-y: auto; padding: 10px 16px; }
    .item { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid #1e293b; }
    .item .nombre { font-size: 13px; }
    .item .detalle { font-size: 10px; color: #64748b; }
    .item .precio { font-size: 13px; font-weight: bold; color: #22c55e; }
    .footer { background: #1e293b; padding: 14px 20px; border-top: 2px solid #3b82f6; flex-shrink: 0; }
    .total-row { display: flex; justify-content: space-between; align-items: center; }
    .total-row .label { font-size: 13px; color: #94a3b8; }
    .total-row .value { font-size: 22px; font-weight: bold; color: #22c55e; }
    .cambio-row { display: flex; justify-content: space-between; align-items: center; margin-top: 6px; padding-top: 6px; border-top: 1px dashed #334155; }
    .cambio-row .label { font-size: 13px; color: #94a3b8; }
    .cambio-row .value { font-size: 20px; font-weight: bold; color: #fbbf24; }
    .pago { font-size: 11px; color: #64748b; margin-top: 6px; text-align: center; }
    .empty { display: flex; align-items: center; justify-content: center; flex: 1; color: #475569; font-size: 14px; }
    .recibido { font-size: 12px; color: #94a3b8; text-align: right; margin-top: 2px; }
  </style>
</head>
<body>
  <div class="header">
    <h1>Su compra</h1>
    <div class="cliente" id="cliente">Cliente: CONSUMIDOR FINAL</div>
  </div>
  <div class="items" id="items">
    <div class="empty">Esperando productos...</div>
  </div>
  <div class="footer">
    <div class="total-row">
      <span class="label">TOTAL</span>
      <span class="value" id="total">${formatSystemCurrency(0)}</span>
    </div>
    <div class="recibido" id="recibido"></div>
    <div class="cambio-row" id="cambioRow" style="display:none">
      <span class="label">CAMBIO</span>
      <span class="value" id="cambio">${formatSystemCurrency(0)}</span>
    </div>
    <div class="pago" id="pago">Pago: EFECTIVO</div>
  </div>
</body>
</html>`
  }

  return {
    ventanaCliente,
    abrirPantallaCliente,
    cerrarPantallaCliente,
    actualizarDisplay,
  }
}
