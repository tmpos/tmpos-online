<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { useToast } from 'primevue/usetoast'
import { ensureConfigLoaded, getConfig, getImageUrl } from '@/services/tmCloudClient'
import { getFiscalLabels, getSystemCurrencyCode } from '@/i18n/localeProfiles'
import { getSalesDocumentLabels, prepareDocumentData, translateDocumentCustomerName, translateDocumentPaymentMethod, translateDocumentType } from '@/services/documentDataService'

type PartePagoMixto = { tipo: 'efectivo' | 'tarjeta' | 'transferencia' | 'cheque'; etiqueta: string; monto: number }

function obtenerPartesPagoMixto(factura: any): PartePagoMixto[] {
  const labels = getSalesDocumentLabels()
  const otro = parseJson(factura?.otro, {})
  const partes: PartePagoMixto[] = []
  const efectivoDirecto = Number(factura.efectivo || 0)
  if (efectivoDirecto > 0) partes.push({ tipo: 'efectivo', etiqueta: labels.cash, monto: efectivoDirecto })

  const tarjetaDirecta = parseJson(factura.tarjeta_mixta, factura.tarjeta_mixta)
  const tarjetaMixta = tarjetaDirecta && typeof tarjetaDirecta === 'object' ? tarjetaDirecta : otro?.tarjeta_mixta || {}
  const montoTarjeta = Number(
    factura.tarjeta
      || tarjetaMixta?.total
      || (Number(tarjetaMixta?.monto_base || 0) + Number(tarjetaMixta?.monto_comision || 0)),
  )
  if (montoTarjeta > 0) partes.push({ tipo: 'tarjeta', etiqueta: labels.card, monto: montoTarjeta })

  const transferenciasDirectas = parseJson(factura.transferencias_mixtas, factura.transferencias_mixtas)
  const transferenciasOtro = parseJson(otro?.transferencias_mixtas, otro?.transferencias_mixtas)
  const transferencias = Array.isArray(transferenciasDirectas)
    ? transferenciasDirectas
    : Array.isArray(transferenciasOtro)
      ? transferenciasOtro
      : (Number(factura.transferencia) > 0 ? [{ monto: factura.transferencia, banco_nombre: factura.banco_nombre || otro?.banco_nombre || '' }] : [])
  for (const transferencia of transferencias) {
    const monto = Number(transferencia?.monto || 0)
    if (monto <= 0) continue
    const banco = transferencia?.banco_nombre ? ` (${transferencia.banco_nombre})` : ''
    partes.push({ tipo: 'transferencia', etiqueta: `${labels.transfer}${banco}`, monto })
  }
  if (Number(factura.cheque) > 0) partes.push({ tipo: 'cheque', etiqueta: labels.check, monto: Number(factura.cheque) })

  if (efectivoDirecto <= 0) {
    const distribuido = partes.reduce((total, parte) => total + parte.monto, 0)
    const efectivoRestante = Math.round((Number(factura.total || 0) - distribuido) * 100) / 100
    if (efectivoRestante > 0.009) partes.unshift({ tipo: 'efectivo', etiqueta: labels.cash, monto: efectivoRestante })
  }
  return partes
}

function formatearMetodoPago(factura: any): string {
  const labels = getSalesDocumentLabels()
  if (String(factura.metodo_pago || '').toLowerCase() !== 'mixto') return translateDocumentPaymentMethod(factura.metodo_pago)
  return labels.mixed
}
import Toast from 'primevue/toast'

const toast = useToast()
const fiscal = getFiscalLabels()
const printerName = ref('')

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
  show_nota: 1,
  footer_text: 'Gracias por su compra',
}

function normalizarFacturaParaTicket(valor: any): any {
  const factura = { ...(valor || {}) }
  const items = Array.isArray(factura.items) ? factura.items : parseJson(factura.productos, [])
  return {
    ...factura,
    fecha_emision: factura.fecha_emision || factura.fecha || '',
    nombre_cliente: factura.nombre_cliente || factura.cliente || 'CONSUMIDOR FINAL',
    telefono_cliente: factura.telefono_cliente || factura.telefono || '',
    comprobante: factura.comprobante || factura.tipo_comprobante || '',
    productos: items.map((item: any) => ({
      ...item,
      precio_venta: item.precio_venta ?? item.precio,
      precio_final: item.precio_final ?? item.precio,
      total: item.total ?? (Number(item.precio || item.precio_venta || 0) * Number(item.cantidad || 1)),
    })),
  }
}

function seleccionarEmpresaTicket(empresas: any[], factura: any): any {
  if (factura?.empresa && typeof factura.empresa === 'object') return factura.empresa
  const uid = String(
    factura?.almacen_uid ||
    localStorage.getItem('almacen_uid') ||
    localStorage.getItem('almacen_default_uid') ||
    '',
  )
  const id = Number(
    factura?.almacen_id ||
    localStorage.getItem('almacen_id') ||
    localStorage.getItem('almacen_default_id') ||
    0,
  )
  return (uid && empresas.find(empresa => String(empresa.uid || empresa.almacen_uid || '') === uid))
    || (id && empresas.find(empresa => Number(empresa.almacen_id || empresa.id) === id))
    || empresas[0]
    || {}
}

function isOn(value: any): boolean {
  return value === true || value === 1 || value === '1'
}

function parseJson(value: any, fallback: any) {
  if (value == null) return fallback
  if (typeof value === 'string') {
    try {
      return JSON.parse(value)
    } catch {
      return fallback
    }
  }
  return value
}

function toNumber(value: any, fallback = 0): number {
  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : fallback
}

function formatCurrency(value: any): string {
  return toNumber(value).toFixed(2)
}

function getProductPrice(producto: any): number {
  return toNumber(producto.precio_venta ?? producto.precio_unitario ?? producto.precio ?? producto.price)
}

function getProductTotal(producto: any): number {
  const cantidad = toNumber(producto.cantidad ?? producto.quantity, 1)
  const precioFinal = toNumber(
    producto.precio_final ?? producto.precio_venta ?? producto.precio_unitario ?? producto.precio ?? producto.price
  )
  return toNumber(producto.total, precioFinal * cantidad)
}

function resolveLogo(empresa: any): string {
  return String(empresa?.logoprinter || empresa?.logo || '').trim()
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

// La ventana que imprime el ticket no hereda la autenticacion de TM Cloud.
// Se incrusta el logo para que tambien funcione con uid de Storage (fil_xxx).
async function resolverLogoTicket(ruta: any): Promise<string> {
  const valor = String(ruta || '').trim()
  if (!valor || /^data:/i.test(valor)) return valor
  if (/^(https?:\/\/|file:|blob:|\/)/i.test(valor)) return valor
  try {
    await ensureConfigLoaded()
    const url = getImageUrl(valor)
    const key = getConfig()?.key || ''
    if (!url) return valor
    const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
    if (!response.ok) return valor
    const type = response.headers.get('content-type') || 'image/png'
    return `data:${type};base64,${arrayBufferToBase64(await response.arrayBuffer())}`
  } catch (_) {
    return valor
  }
}

function normalizarAlanubeData(factura: any, ecf: any = {}) {
  const otro = parseJson(factura?.otro, {})
  const response = otro?.alanube_response || factura?.alanube_response || {}
  return {
    documentStampUrl: ecf?.document_stamp_url || factura?.document_stamp_url || factura?.documentStampUrl || otro?.documentStampUrl || otro?.document_stamp_url || response?.documentStampUrl || response?.document_stamp_url || '',
    securityCode: ecf?.security_code || factura?.codigo_seguridad || factura?.securityCode || otro?.securityCode || otro?.security_code || response?.securityCode || response?.security_code || '',
  }
}

async function obtenerAlanubeData(factura: any) {
  if (factura?.id) {
    try {
      const res = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [factura.id])
      const ecf = res?.success && Array.isArray(res.data) ? res.data[0] : null
      if (ecf) return normalizarAlanubeData(factura, ecf)
    } catch (_) {}
  }
  return normalizarAlanubeData(factura)
}

function tieneComprobanteElectronico(factura: any): boolean {
  return /^E\d{2}/i.test(String(factura?.ncf || factura?.comprobante || factura?.tipo_comprobante || ''))
}

async function generarQR(data: string): Promise<string> {
  try {
    return await QRCode.toDataURL(data, { width: 200, margin: 1 })
  } catch {
    return ''
  }
}

function generarBarcodeSVG(data: string): string {
  if (!data) return ''
  try {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    JsBarcode(svg, data, {
      format: 'CODE128',
      width: 2,
      height: 50,
      displayValue: true,
      fontSize: 12,
      margin: 2,
    })
    return new XMLSerializer()
      .serializeToString(svg)
      .replace(/width="[^"]*"/, 'width="180"')
      .replace(/height="[^"]*"/, 'height="55"')
  } catch {
    return ''
  }
}

function buildProductosHTML(productos: any[], simbolo: string, mostrarDescuento: boolean): string {
  return productos.map((producto: any) => {
    const cantidad = toNumber(producto.cantidad ?? producto.quantity, 1)
    const precioVenta = getProductPrice(producto)
    const totalProducto = getProductTotal(producto)
    const descuento = toNumber(producto.descuento)
    const nombre = producto.nombre || producto.descripcion || producto.producto || ''
    const imeis = [producto.imeis, producto.imei]
      .flatMap((valor: any) => Array.isArray(valor) ? valor : (valor ? String(valor).split(',') : []))
      .map((valor: any) => String(valor || '').trim())
      .filter(Boolean)
      .filter((valor: string, index: number, lista: string[]) => lista.indexOf(valor) === index)
    const seriales = [producto.seriales, producto.serial]
      .flatMap((valor: any) => Array.isArray(valor) ? valor : (valor ? String(valor).split(',') : []))
      .map((valor: any) => String(valor || '').trim())
      .filter(Boolean)
      .filter((valor: string, index: number, lista: string[]) => lista.indexOf(valor) === index)
    const imei = imeis.length ? `<br><span style="font-size:8px;color:#555;">IMEI: ${imeis.join(', ')}</span>` : ''
    const serial = seriales.length ? `<br><span style="font-size:8px;color:#555;">Serial: ${seriales.join(', ')}</span>` : ''

    return `
      <tr class="item-name">
        <td colspan="${mostrarDescuento ? 5 : 4}" style="overflow-wrap:break-word;white-space:normal;word-break:break-word;">
          ${nombre}${imei}${serial}
        </td>
      </tr>
      <tr class="item-values">
        <td>${cantidad} x</td>
        <td>${producto.empaque || ''}</td>
        <td>${simbolo}${formatCurrency(precioVenta)}</td>
        ${mostrarDescuento ? `<td class="precio">${simbolo}${formatCurrency(descuento)}</td>` : ''}
        <td class="precio">
          <b>${simbolo}${formatCurrency(totalProducto)}</b>
        </td>
      </tr>
    `
  }).join('')
}

function buildTicketHtml({
  factura,
  empresa,
  productos,
  qrCodeData,
  alanubeData,
  ticketConfig,
}: {
  factura: any
  empresa: any
  productos: any[]
  qrCodeData: string
  alanubeData: any
  ticketConfig: any
}) {
  const labels = getSalesDocumentLabels()
  const documentData = prepareDocumentData({ factura, empresa, items: productos })
  productos = documentData.items
  const simbolo = getSystemCurrencyCode()
  const logoEmpresa = resolveLogo(empresa)
  const configuredPaperWidth = toNumber(ticketConfig.paper_width, 80)
  const paperWidth = configuredPaperWidth === 58 ? 58 : 72
  const sidePaddingMm = paperWidth === 58 ? 3 : 3
  const descuentoFactura = documentData.totals.discount
  const impuestoFactura = documentData.totals.tax
  const totalFactura = documentData.totals.total
  const subtotal = documentData.totals.subtotal
  const esPagoMixto = String(factura.metodo_pago || '').toUpperCase() === 'MIXTO'
  const subtotalMostrado = esPagoMixto ? totalFactura : subtotal
  const partesPagoMixto = esPagoMixto ? obtenerPartesPagoMixto(factura) : []
  const filasPagoMixto = partesPagoMixto.map(parte => `
    <div class="payment-row">
      <span>${parte.etiqueta}</span>
      <strong>${simbolo}${formatCurrency(parte.monto)}</strong>
    </div>
  `).join('')
  const etiquetaResumen = labels.language === 'en' ? 'PAYMENT SUMMARY' : 'RESUMEN DE PAGO'
  const etiquetaDistribucion = labels.language === 'en' ? 'PAYMENT DISTRIBUTION' : 'DISTRIBUCION DEL PAGO'
  const mostrarDescuento = descuentoFactura > 0 || productos.some((p) => toNumber(p.descuento) > 0)
  const productosHTML = buildProductosHTML(productos, simbolo, mostrarDescuento)
  const otro = parseJson(factura.otro, [])
  const otroPago = Array.isArray(otro) ? otro[0] : {}
  const pagocon = toNumber(otroPago?.pagocon)
  const sucambio = toNumber(otroPago?.sucambio)
  const delivery = otroPago?.delivery || ''
  const rncCliente = factura.rnc_cliente || factura.cedula_cliente || factura.rnc || ''
  const barcodeSvg = generarBarcodeSVG(factura.no_factura || factura.id || '')
  const mostrarQrFiscal = Boolean(qrCodeData && (alanubeData?.documentStampUrl || tieneComprobanteElectronico(factura)))

  const infoParts: string[] = []
  if (isOn(ticketConfig.show_address) && empresa.direccion) infoParts.push(empresa.direccion)
  const pe: string[] = []
  if (isOn(ticketConfig.show_phone) && empresa.telefono) pe.push(empresa.telefono)
  if (isOn(ticketConfig.show_email) && empresa.email) pe.push(empresa.email)
  if (pe.length) infoParts.push(pe.join(' / '))
  if (isOn(ticketConfig.show_legal) && (empresa.legal || empresa.rnc)) infoParts.push(`${fiscal.businessIdLabel}: ${empresa.legal || empresa.rnc}`)
  const empresaInfoHtml = infoParts.length ? `<div class="brand-info">${infoParts.join('<br>')}</div>` : ''

  return `<!DOCTYPE html>
<html lang="${labels.language}">
<head>
  <meta charset="utf-8">
  <title>${labels.invoice} - ${factura.no_factura || ''}</title>
  <style>
    * { box-sizing: border-box; font-family: Arial, Helvetica, sans-serif; }
    @page { size: ${paperWidth}mm auto; margin: 0; }
    html { width: ${paperWidth}mm; margin: 0; padding: 0; background: #fff; }
    body { width: ${paperWidth}mm; margin: 0; padding: 0 ${sidePaddingMm}mm; background: #fff; color: #000; font-size: 10px; overflow: hidden; }
    .ticket { width: 100%; max-width: 100%; margin: 0; padding: 8px 0 12px; overflow: hidden; }
    .brand { text-align: center; padding-bottom: 7px; }
    .brand img { display: block; max-width: 92px; max-height: 62px; object-fit: contain; margin: 0 auto 4px; }
    .brand-name { font-size: 16px; line-height: 1.1; font-weight: 800; text-transform: uppercase; }
    .brand-info { margin-top: 5px; font-size: 8px; line-height: 1.35; }
    .rule { width: 100%; border-top: 1px dashed #000; margin: 7px 0; }
    .document { border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 7px 0; }
    .document-label { text-align: center; font-size: 9px; font-weight: 700; letter-spacing: .12em; }
    .document-number { margin: 2px 0 6px; text-align: center; font-size: 15px; line-height: 1.1; font-weight: 800; overflow-wrap: anywhere; }
    .meta-row { display: flex; justify-content: space-between; gap: 8px; padding: 1px 0; line-height: 1.3; }
    .meta-label { flex: 0 0 auto; font-size: 8px; font-weight: 700; text-transform: uppercase; }
    .meta-value { min-width: 0; text-align: right; overflow-wrap: anywhere; }
    .customer { padding: 7px 0 2px; }
    .section-title { margin-bottom: 4px; text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .12em; }
    table { width: 100%; border-collapse: collapse; }
    .items thead th { padding: 5px 2px; border-top: 1px solid #000; border-bottom: 1px solid #000; font-size: 8px; text-transform: uppercase; }
    .items tbody td { padding: 2px; vertical-align: top; font-size: 9px; }
    .items .item-name td { padding-top: 6px; font-weight: 800; }
    .items .item-values td { padding-bottom: 5px; border-bottom: 1px dotted #777; }
    .centrado { text-align: center; }
    .derecha, .precio { text-align: right; }
    .summary { margin-top: 8px; border-top: 2px solid #000; border-bottom: 2px solid #000; padding: 5px 0; }
    .summary-title { margin-bottom: 4px; text-align: center; font-size: 8px; font-weight: 800; letter-spacing: .1em; }
    .summary-row, .payment-row { display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; padding: 2px 0; }
    .summary-row span:first-child, .payment-row span { min-width: 0; overflow-wrap: anywhere; }
    .summary-row strong, .payment-row strong { flex: 0 0 auto; text-align: right; }
    .payment-group { margin: 4px 0; padding: 4px 0; border-top: 1px dashed #777; border-bottom: 1px dashed #777; }
    .payment-caption { margin-bottom: 2px; font-size: 7px; font-weight: 800; letter-spacing: .08em; }
    .payment-row { font-size: 9px; }
    .grand-total { margin-top: 3px; padding-top: 5px; border-top: 1px solid #000; font-size: 14px; font-weight: 800; }
    .note { margin-top: 7px; padding: 6px 0; border-top: 1px dashed #000; border-bottom: 1px dashed #000; font-size: 8px; line-height: 1.35; }
    .code-block { margin-top: 8px; text-align: center; }
    .barcode svg { display: block; max-width: 100%; margin: 0 auto; }
    .qr-code img { display: block; width: ${paperWidth === 58 ? 112 : 130}px; height: ${paperWidth === 58 ? 112 : 130}px; margin: 0 auto; }
    .security-code { margin-top: 3px; font-size: 8px; font-weight: 700; }
    .footer { margin-top: 9px; padding-top: 7px; border-top: 1px dashed #000; text-align: center; font-size: 10px; font-weight: 700; }
  </style>
</head>
<body>
  <div class="ticket">
    <div class="brand">
      ${isOn(ticketConfig.show_logo) && logoEmpresa ? `<img src="${logoEmpresa}" alt="Logo">` : ''}
      ${isOn(ticketConfig.show_company_name) ? `<div class="brand-name">${empresa.nombre || labels.company}</div>` : ''}
      ${empresaInfoHtml}
    </div>

    <div class="document">
      <div class="document-label">${translateDocumentType(factura.tipo_factura)}</div>
      <div class="document-number">#${factura.no_factura || ''}</div>
      ${factura.fecha_emision ? `<div class="meta-row"><span class="meta-label">${labels.date}</span><span class="meta-value">${factura.fecha_emision || ''} ${factura.hora || ''}</span></div>` : ''}
      ${factura.ncf || factura.comprobante ? `<div class="meta-row"><span class="meta-label">${fiscal.fiscalDocumentLabel}</span><span class="meta-value">${factura.ncf || factura.comprobante}</span></div>` : ''}
    </div>

    ${isOn(ticketConfig.show_cliente) ? `<div class="customer">
      <div class="section-title">${labels.customer}</div>
      <div class="meta-row"><span class="meta-label">${labels.customer}</span><span class="meta-value">${translateDocumentCustomerName(factura.nombre_cliente)}</span></div>
      ${rncCliente ? `<div class="meta-row"><span class="meta-label">${fiscal.customerIdLabel}</span><span class="meta-value">${rncCliente}</span></div>` : ''}
      ${factura.telefono_cliente ? `<div class="meta-row"><span class="meta-label">${labels.phone}</span><span class="meta-value">${factura.telefono_cliente}</span></div>` : ''}
      ${factura.direccion_cliente ? `<div class="meta-row"><span class="meta-label">${labels.address}</span><span class="meta-value">${factura.direccion_cliente}</span></div>` : ''}
      ${factura.vendedor ? `<div class="meta-row"><span class="meta-label">${labels.seller}</span><span class="meta-value">${factura.vendedor}</span></div>` : ''}
      ${factura.cajero ? `<div class="meta-row"><span class="meta-label">${labels.cashier}</span><span class="meta-value">${factura.cajero}</span></div>` : ''}
      ${delivery ? `<div class="meta-row"><span class="meta-label">DELIVERY</span><span class="meta-value">${delivery}</span></div>` : ''}
      ${factura.metodo_pago ? `<div class="meta-row"><span class="meta-label">${labels.paymentMethod}</span><span class="meta-value">${formatearMetodoPago(factura)}</span></div>` : ''}
    </div>` : ''}

    <div class="rule"></div>

    ${isOn(ticketConfig.show_items) ? `<table class="items">
      <thead>
        <tr>
          <th>${labels.quantity}</th>
          <th>${labels.package}</th>
          <th>${labels.price}</th>
          ${mostrarDescuento ? `<th class="precio">${labels.discount}</th>` : ''}
          <th class="precio">${labels.total}</th>
        </tr>
      </thead>
      <tbody>${productosHTML}</tbody>
    </table>` : ''}

    ${isOn(ticketConfig.show_totals) ? `<div class="summary">
      <div class="summary-title">${etiquetaResumen}</div>
      <div class="summary-row"><span>${labels.subtotal}</span><strong>${simbolo}${formatCurrency(subtotalMostrado)}</strong></div>
      ${descuentoFactura > 0 ? `<div class="summary-row"><span>${labels.discount}</span><strong>${simbolo}${formatCurrency(descuentoFactura)}</strong></div>` : ''}
      ${impuestoFactura > 0 ? `<div class="summary-row"><span>${fiscal.shortName}</span><strong>${simbolo}${formatCurrency(impuestoFactura)}</strong></div>` : ''}
      ${esPagoMixto && filasPagoMixto ? `<div class="payment-group"><div class="payment-caption">${etiquetaDistribucion}</div>${filasPagoMixto}</div>` : ''}
      <div class="summary-row grand-total"><span>${labels.total}</span><strong>${simbolo}${formatCurrency(totalFactura)}</strong></div>
      ${pagocon > 0 ? `<div class="summary-row"><span>${labels.paidWith}</span><strong>${simbolo}${formatCurrency(pagocon)}</strong></div>` : ''}
      ${pagocon > 0 ? `<div class="summary-row"><span>${labels.change}</span><strong>${simbolo}${formatCurrency(sucambio)}</strong></div>` : ''}
    </div>` : ''}

    ${isOn(ticketConfig.show_nota) && factura.nota ? `<div class="note"><strong>${labels.observation}:</strong><br>${String(factura.nota).replace(/\n/g, '<br>')}</div>` : ''}

    ${isOn(ticketConfig.show_barcode) && barcodeSvg ? `<div class="code-block barcode">${barcodeSvg}</div>` : ''}

    ${(isOn(ticketConfig.show_qr) || mostrarQrFiscal) && qrCodeData ? `<div class="code-block qr-code">
      <img src="${qrCodeData}" alt="Codigo QR">
      ${alanubeData?.securityCode ? `<div class="security-code">${labels.securityCode}: ${alanubeData.securityCode}</div>` : ''}
    </div>
    ` : ''}

    ${isOn(ticketConfig.show_footer) ? `<div class="footer">${ticketConfig.footer_text === DEFAULT_TICKET_CONFIG.footer_text ? labels.thanks : (ticketConfig.footer_text || '')}</div>` : ''}
  </div>
</body>
</html>`
}

async function printTicket(valor: any) {
  const factura = normalizarFacturaParaTicket(valor)
  let ticketConfig = { ...DEFAULT_TICKET_CONFIG }
  try {
    const resConfig = await window.db.getAll('impresoras_config')
    if (resConfig.success && resConfig.data?.length > 0) {
      ticketConfig = { ...ticketConfig, ...resConfig.data[0] }
      printerName.value = ticketConfig.printer_name || ''
    }
  } catch (_) {}

  const saved = localStorage.getItem('etiquetas_printer')
  if (saved && !ticketConfig.printer_name) printerName.value = saved

  const productos = parseJson(factura.productos, [])

  let empresa: any = {}
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) empresa = seleccionarEmpresaTicket(res.data, factura)
  } catch (_) {}
  if (factura.empresa && typeof factura.empresa === 'object') empresa = factura.empresa
  const logo = await resolverLogoTicket(empresa?.logoprinter || empresa?.logo)
  if (logo) empresa = { ...empresa, logo, logoprinter: logo }

  const alanubeData = await obtenerAlanubeData(factura)
  const qrUrl = alanubeData.documentStampUrl || `https://tmposrd.com/factura/${factura.no_factura}`
  const qrCodeData = await generarQR(qrUrl)
  const html = buildTicketHtml({
    factura,
    empresa,
    productos: Array.isArray(productos) ? productos : [],
    qrCodeData,
    alanubeData,
    ticketConfig,
  })

  try {
    const paperWidth = toNumber(ticketConfig.paper_width, 80) === 58 ? 58 : 72
    const res = await window.electron.invoke('print:ticket', html, printerName.value || undefined, { width: paperWidth })
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
