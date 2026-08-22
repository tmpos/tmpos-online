<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { getLocaleProfile, getSystemCurrencyCode } from '@/i18n/localeProfiles'
import { useAlmacenStore } from '@/stores/almacen.store'
import { resolvePrintableImage } from '@/services/printImageService'

const toast = useToast()
const almacenStore = useAlmacenStore()

const DEFAULT_TICKET_CONFIG = {
  printer_name: '',
  paper_width: 80,
  show_logo: 1,
  show_company_name: 1,
  show_legal: 1,
  show_phone: 1,
  show_address: 1,
  show_email: 1,
  show_cliente: 1,
  show_items: 1,
  show_totals: 1,
  show_barcode: 1,
  show_footer: 1,
  show_qr: 0,
  footer_text: 'Gracias por su compra',
}

function isOn(value: any): boolean {
  return value === true || value === 1 || value === '1'
}

function toNumber(value: any, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatCurrency(value: any): string {
  return toNumber(value).toFixed(2)
}

function resolveLogo(empresa: any): string {
  return String(empresa?.logoprinter || empresa?.logo || '').trim()
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const d = new Date(fechaStr)
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function buildTicketHtml({
  cuenta,
  empresa,
  monto,
  abonadoTotal,
  saldoRestante,
  ticketConfig,
  productos,
  factura,
}: {
  cuenta: any
  empresa: any
  monto: number
  abonadoTotal: number
  saldoRestante: number
  ticketConfig: any
  productos: any[]
  factura: any
}) {
  const simbolo = getSystemCurrencyCode()
  const logoEmpresa = resolveLogo(empresa)
  const paperWidth = toNumber(ticketConfig.paper_width, 80)
  const pageWidth = paperWidth === 58 ? 230 : 300
  const bodyWidth = paperWidth === 58 ? 210 : 250
  const ticketWidth = paperWidth === 58 ? 200 : 240
  const tipoDoc = monto > 0 ? 'RECIBO DE ABONO' : 'ESTADO DE CUENTA'
  const ahora = new Date()
  const fechaHora = `${ahora.toLocaleDateString(getLocaleProfile().locale)} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  const fechaVenta = cuenta.fecha_venta ? formatFecha(cuenta.fecha_venta) : ''
  const fechaVencimiento = cuenta.fecha_vencimiento ? formatFecha(cuenta.fecha_vencimiento) : ''

  // Construir HTML de productos
  const productosHtml = productos.length > 0
    ? productos.map((p: any) => {
        const nombre = p.nombre || p.descripcion || p.producto || 'Producto'
        const cant = toNumber(p.cantidad ?? p.quantity, 1)
        const precio = toNumber(p.precio_venta ?? p.precio_unitario ?? p.precio ?? p.price)
        const total = toNumber(p.total, precio * cant)
        return `<tr>
          <td>${nombre}</td>
          <td class="centrado">${cant}</td>
          <td class="precio">${simbolo}${formatCurrency(precio)}</td>
          <td class="precio"><b>${simbolo}${formatCurrency(total)}</b></td>
        </tr>`
      }).join('')
    : ''

  const infoParts: string[] = []
  if (isOn(ticketConfig.show_address) && empresa.direccion) infoParts.push(empresa.direccion)
  const pe: string[] = []
  if (isOn(ticketConfig.show_phone) && empresa.telefono) pe.push(empresa.telefono)
  if (isOn(ticketConfig.show_email) && empresa.email) pe.push(empresa.email)
  if (pe.length) infoParts.push(pe.join(' / '))
  if (isOn(ticketConfig.show_legal) && (empresa.legal || empresa.rnc)) infoParts.push(`RNC: ${empresa.legal || empresa.rnc}`)
  const empresaInfoHtml = infoParts.length ? `<p>${infoParts.join('<br>')}</p>` : ''

  const refFactura = factura
    ? `Metodo: ${factura.metodo_pago || 'CREDITO'}<br>
       ${factura.vendedor ? `Vendedor: ${factura.vendedor}<br>` : ''}
       ${factura.cajero ? `Cajero: ${factura.cajero}<br>` : ''}`
    : ''

  // Parsear historial de pagos
  let pagos: any[] = []
  try {
    pagos = JSON.parse(cuenta.pagos || '[]')
    if (!Array.isArray(pagos)) pagos = []
  } catch { pagos = [] }

  const abonosHtml = pagos.length > 0
    ? pagos.map((p: any) => `
      <tr>
        <td>Pago #${p.nopago || ''}<br><small>${p.metodo || p.metodo_pago || 'ABONO'}${p.banco_nombre ? ` · ${p.banco_nombre}` : ''}</small></td>
        <td>${p.fecha || ''} ${p.hora || ''}</td>
        <td class="precio"><b>${simbolo}${formatCurrency(p.cantidad)}</b></td>
      </tr>
    `).join('')
    : '<tr><td colspan="3">Sin abonos registrados</td></tr>'

  return `<!DOCTYPE html>
<html>
<head>
  <style>
    * { font-size: 10px; font-family: Arial, Helvetica, sans-serif; }
    @page { size: ${pageWidth}px auto; margin: 5px; }
    body { width: ${bodyWidth}px; margin: 5px; padding: 5px; color: #111; }
    .ticket { width: ${ticketWidth}px; padding-top: 10px; padding-bottom: 10px; }
    .bordeado { border: 1px solid #000; border-radius: 5px; padding: 5px; }
    .linea { width: 100%; border-top: 1px solid #000; margin: 6px 0; }
    table { width: 100%; border-collapse: separate; border-spacing: 0; }
    th { text-align: left; padding: 5px 0; border-bottom: 1px solid #000; }
    .precio { text-align: right; }
    .centrado { text-align: center; }
    .big { font-size: 1.35em !important; font-weight: bold; }
  </style>
</head>
<body>
  <div class="ticket">
    <center>
      <div class="logos">
        ${isOn(ticketConfig.show_logo) && logoEmpresa
          ? `<img src="${logoEmpresa}" alt="Logo" style="max-width:100px">`
          : isOn(ticketConfig.show_company_name)
            ? `<div style="font-size:18px !important;font-weight:bold">${empresa.nombre || 'MI EMPRESA'}</div>`
            : ''
        }
      ${empresaInfoHtml}
    </center>

    <div class="bordeado">
      <p>
        <b>${tipoDoc}</b><br>
        Fecha: ${fechaHora}<br>
        Factura Ref: <b style="font-size:14px">#${cuenta.no_factura || ''}</b><br>
        ${isOn(ticketConfig.show_cliente) ? `Cliente: ${cuenta.nombre_cliente || 'SIN REGISTRO'}<br>` : ''}
        ${isOn(ticketConfig.show_cliente) && cuenta.telefono_cliente ? `Telefono: ${cuenta.telefono_cliente}<br>` : ''}
        ${fechaVenta ? `Fecha Venta: ${fechaVenta}<br>` : ''}
        ${fechaVencimiento ? `Vencimiento: ${fechaVencimiento}<br>` : ''}
        ${refFactura}
        Estado: <b>${cuenta.estado || 'ACTIVA'}</b>
      </p>
    </div>

    ${productosHtml ? `
    <div class="bordeado" style="text-align:center;padding:4px;margin-top:6px;">
      PRODUCTOS A CREDITO
    </div>

    <table>
      <thead>
        <tr>
          <th>Producto</th>
          <th class="centrado">Cant.</th>
          <th class="precio">Precio</th>
          <th class="precio">Total</th>
        </tr>
      </thead>
      <tbody>
        ${productosHtml}
      </tbody>
    </table>
    ` : ''}

    <div class="bordeado" style="text-align:center;padding:4px;margin-top:6px;">
      DETALLE DE CUENTA
    </div>

    <table>
      <thead>
        <tr>
          <th>Concepto</th>
          <th class="precio">Monto</th>
        </tr>
      </thead>
      <tbody>
        <tr>
          <td>Total Factura</td>
          <td class="precio"><b>${simbolo}${formatCurrency(cuenta.total)}</b></td>
        </tr>
        <tr>
          <td>Abonado Anterior</td>
          <td class="precio">${simbolo}${formatCurrency(cuenta.abonado || 0)}</td>
        </tr>
        ${monto > 0 ? `<tr style="color:#059669;font-weight:bold">
          <td style="color:#059669;font-weight:bold">Nuevo Abono</td>
          <td class="precio" style="color:#059669;font-weight:bold">${simbolo}${formatCurrency(monto)}</td>
        </tr>` : ''}
      </tbody>
    </table>

    <div class="bordeado" style="text-align:center;padding:4px;margin-top:6px;">
      ABONOS REALIZADOS
    </div>

    <table>
      <thead>
        <tr>
          <th>Pago / metodo</th>
          <th>Fecha</th>
          <th class="precio">Monto</th>
        </tr>
      </thead>
      <tbody>
        ${abonosHtml}
      </tbody>
    </table>

    <div class="linea" style="margin-top: 12px;"></div>

    <div style="font-weight:bold;">
      <table>
        <tr>
          <td>TOTAL ABONADO:</td>
          <td class="precio"><span class="big">${simbolo}${formatCurrency(abonadoTotal)}</span></td>
        </tr>
      </table>
    </div>

    <div style="font-weight:bold;">
      <table>
        <tr>
          <td style="color:#dc2626">SALDO PENDIENTE:</td>
          <td class="precio"><span class="big" style="color:#dc2626">${simbolo}${formatCurrency(saldoRestante)}</span></td>
        </tr>
      </table>
    </div>

    ${saldoRestante <= 0 ? `<div style="text-align:center;font-size:12px;color:#059669;font-weight:bold;border:2px solid #059669;border-radius:5px;padding:6px;margin:8px 0">CUENTA PAGADA EN SU TOTALIDAD</div>` : ''}

    ${cuenta.notas ? `<div class="bordeado" style="margin-top:6px"><p>${String(cuenta.notas).replace(/\n/g, '<br>')}</p></div>` : ''}

    ${isOn(ticketConfig.show_footer) ? `<div class="linea"></div><div style="text-align:center;">${ticketConfig.footer_text || 'Gracias por su preferencia'}</div>` : ''}
  </div>
</body>
</html>`
}

async function printTicket(cuenta: any, monto = 0, abonadoTotal = 0, saldoRestante = 0) {
  let ticketConfig = { ...DEFAULT_TICKET_CONFIG }
  try {
    const resConfig = await window.db.getAll('impresoras_config')
    if (resConfig.success && resConfig.data?.length > 0) {
      ticketConfig = { ...ticketConfig, ...resConfig.data[0] }
    }
  } catch (_) {}

  let empresa: any = {}
  try {
    await almacenStore.load()
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) {
      empresa = (almacenStore.activeUid && res.data.find((item: any) => String(item.uid || item.almacen_uid || '') === String(almacenStore.activeUid)))
        || res.data.find((item: any) => Number(item.almacen_id || item.id) === Number(almacenStore.activeId))
        || res.data[0]
      const logo = await resolvePrintableImage(empresa.logoprinter || empresa.logo)
      if (logo) empresa = { ...empresa, logo, logoprinter: logo }
    }
  } catch (_) {}

  // Cargar factura relacionada y sus productos
  let factura: any = null
  let productos: any[] = []
  try {
    const resFacturas = await window.db.getAll('facturas')
    if (resFacturas.success && resFacturas.data) {
      factura = resFacturas.data.find((f: any) => f.no_factura === cuenta.no_factura) || null
      if (factura) {
        try {
          const prods = typeof factura.productos === 'string' ? JSON.parse(factura.productos) : factura.productos
          productos = Array.isArray(prods) ? prods : []
        } catch { productos = [] }
      }
    }
  } catch (_) {}

  const html = buildTicketHtml({
    cuenta,
    empresa,
    monto,
    abonadoTotal,
    saldoRestante,
    ticketConfig,
    productos,
    factura,
  })

  const printerName = ticketConfig.printer_name || localStorage.getItem('etiquetas_printer') || ''

  try {
    const res = await window.electron.invoke('print:ticket', html, printerName || undefined)
    if (res.success) toast.add({ severity: 'success', summary: 'Imprimiendo...', life: 2000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}

defineExpose({ printTicket })
</script>

<template>
  <div style="display:none">
    <Toast />
  </div>
</template>
