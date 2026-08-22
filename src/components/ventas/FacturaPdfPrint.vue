<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { envioElectron } from '@/funciones/funciones.js'
import { ensureConfigLoaded, getConfig, getImageUrl } from '@/services/tmCloudClient'
import { formatSystemCurrency, getFiscalLabels } from '@/i18n/localeProfiles'
import { getPhoneImeiDetails, getSalesDocumentLabels, prepareDocumentData, translateDocumentCustomerName, translateDocumentPaymentMethod } from '@/services/documentDataService'

type PartePagoMixto = { tipo: 'efectivo' | 'tarjeta' | 'transferencia' | 'cheque'; etiqueta: string; monto: number }

function obtenerPartesPagoMixto(factura: any): PartePagoMixto[] {
  const labels = getSalesDocumentLabels()
  const otro = parseJson(factura?.otro, {})
  const bancoNombre = factura.banco_nombre || otro?.banco_nombre || ''
  const partes: PartePagoMixto[] = []
  const efectivoDirecto = Number(factura.efectivo || 0)
  if (efectivoDirecto > 0) partes.push({ tipo: 'efectivo', etiqueta: labels.cash, monto: efectivoDirecto })
  const tarjetaMixtaDirecta = parseJson(factura.tarjeta_mixta, factura.tarjeta_mixta)
  const tarjetaMixta = tarjetaMixtaDirecta && typeof tarjetaMixtaDirecta === 'object'
    ? tarjetaMixtaDirecta
    : otro?.tarjeta_mixta || {}
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
      : (Number(factura.transferencia) > 0 ? [{ monto: factura.transferencia, banco_nombre: bancoNombre }] : [])
  for (const transferencia of transferencias) {
    const monto = Number(transferencia?.monto || 0)
    if (monto <= 0) continue
    const banco = transferencia?.banco_nombre ? ` (${transferencia.banco_nombre})` : ''
    partes.push({ tipo: 'transferencia', etiqueta: `${labels.transfer}${banco}`, monto })
  }
  if (Number(factura.cheque) > 0) partes.push({ tipo: 'cheque', etiqueta: labels.check, monto: Number(factura.cheque) })
  // Algunas consultas historicas no incluyen la columna `efectivo`, aunque el
  // resto de la distribucion mixta si esta disponible. El saldo hasta el total
  // corresponde al efectivo y debe aparecer tambien en el comprobante.
  if (efectivoDirecto <= 0) {
    const totalFactura = Number(factura.total || 0)
    const distribuido = partes.reduce((total, parte) => total + parte.monto, 0)
    const efectivoRestante = Math.round((totalFactura - distribuido) * 100) / 100
    if (efectivoRestante > 0.009) partes.unshift({ tipo: 'efectivo', etiqueta: labels.cash, monto: efectivoRestante })
  }
  return partes
}

function formatearMetodoPago(factura: any): string {
  const labels = getSalesDocumentLabels()
  const metodo = String(factura.metodo_pago || '').toUpperCase()
  const otro = parseJson(factura?.otro, {})
  const bancoNombre = factura.banco_nombre || otro?.banco_nombre || ''
  if (metodo !== 'MIXTO') {
    const metodoTraducido = translateDocumentPaymentMethod(factura.metodo_pago)
    return bancoNombre ? `${metodoTraducido} - ${bancoNombre}` : metodoTraducido
  }
  return labels.mixed
}

function resumirMetodoMixto(factura: any): string {
  const labels = getSalesDocumentLabels()
  const nombresPorTipo: Record<PartePagoMixto['tipo'], string> = {
    efectivo: labels.cash,
    tarjeta: labels.card,
    transferencia: labels.transfer,
    cheque: labels.check,
  }
  const metodos = [...new Set(obtenerPartesPagoMixto(factura).map(parte => nombresPorTipo[parte.tipo].toUpperCase()))]
  return metodos.length ? `${metodos.join(' Y ')} - ${labels.mixed}` : labels.mixed
}

function esCotizacion(factura: any): boolean {
  return String(factura.tipo_factura || '').toLowerCase() === 'cotizacion' || String(factura.estado_factura || '').toLowerCase() === 'cotizacion'
}

const toast = useToast()
const fiscal = getFiscalLabels()

const dialogPdf = ref(false)
const generandoPdf = ref(false)
const pdfUrl = ref('')
const pdfNombre = ref('')

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

function normalizarAlanubeData(factura: any, ecf: any = {}) {
  const otro = parseJson(factura?.otro, {})
  const response = otro?.alanube_response || factura?.alanube_response || {}
  return {
    documentStampUrl: ecf?.document_stamp_url || factura?.document_stamp_url || factura?.documentStampUrl || otro?.documentStampUrl || otro?.document_stamp_url || response?.documentStampUrl || response?.document_stamp_url || '',
    securityCode: ecf?.security_code || factura?.codigo_seguridad || factura?.securityCode || otro?.securityCode || otro?.security_code || response?.securityCode || response?.security_code || '',
    legalStatus: ecf?.legal_status || factura?.alanube_legal_status || response?.legalStatus || otro?.legalStatus || '',
    status: ecf?.status || factura?.alanube_status || response?.status || otro?.status || '',
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

function formatoMoneda(value: any): string {
  return formatSystemCurrency(value)
}

function formatoFechaFactura(value: any, hora = ''): string {
  const horaTexto = String(hora || '').trim().match(/^(\d{1,2}:\d{2})/)
  const fechaTexto = String(value || '').trim()
  const horaEnFecha = fechaTexto.match(/(?:T|\s)(\d{1,2}:\d{2})/)
  const horaFormateada = horaTexto ? horaTexto[1].padStart(5, '0') : (horaEnFecha ? horaEnFecha[1].padStart(5, '0') : '')
  const fechaSql = fechaTexto.match(/^(\d{4})-(\d{2})-(\d{2})/)
  const fechaLatina = fechaTexto.match(/^(\d{2})\/(\d{2})\/(\d{4})/)

  if (fechaSql) return `${fechaSql[3]}/${fechaSql[2]}/${fechaSql[1]}${horaFormateada ? ` ${horaFormateada}` : ''}`
  if (fechaLatina) return `${fechaLatina[1]}/${fechaLatina[2]}/${fechaLatina[3]}${horaFormateada ? ` ${horaFormateada}` : ''}`

  const fecha = value instanceof Date ? value : new Date(value)
  if (Number.isNaN(fecha.getTime())) return horaFormateada
  const fechaFormateada = `${String(fecha.getDate()).padStart(2, '0')}/${String(fecha.getMonth() + 1).padStart(2, '0')}/${fecha.getFullYear()}`
  const horaDesdeFecha = `${String(fecha.getHours()).padStart(2, '0')}:${String(fecha.getMinutes()).padStart(2, '0')}`
  return `${fechaFormateada} ${horaFormateada || horaDesdeFecha}`
}

function obtenerImeisProducto(producto: any): string[] {
  const valores = [producto?.imei, producto?.lista_imei, producto?.imeis, producto?.serial, producto?.seriales]
  return valores
    .flatMap((valor) => {
      if (Array.isArray(valor)) return valor
      if (typeof valor === 'string') return valor.split(',')
      return valor ? [valor] : []
    })
    .map((valor) => {
      if (typeof valor === 'object') return String(valor.imei || valor.serial || '').trim()
      return String(valor).trim()
    })
    .filter(Boolean)
    .filter((valor, index, lista) => lista.indexOf(valor) === index)
}

function obtenerCodigoProducto(producto: any): string {
  return String(
    producto?.codigo ||
    producto?.codigo_barra ||
    producto?.cod_producto ||
    producto?.sku ||
    producto?.referencia ||
    producto?.barcode ||
    producto?.imei ||
    producto?.serial ||
    producto?.accesorio_id ||
    producto?.telefono_id ||
    producto?.imei_id ||
    producto?.serial_id ||
    ''
  ).trim()
}

function normalizarRutaImagen(ruta: any, baseUrl = ''): string {
  const valor = String(ruta ?? '').trim()
  if (!valor) return ''
  if (/^(data:|https?:\/\/|file:|blob:)/i.test(valor)) return valor
  if (valor.startsWith('/')) return baseUrl ? `${baseUrl.replace(/\/$/, '')}${valor}` : valor
  return baseUrl ? `${baseUrl.replace(/\/$/, '')}/${valor.replace(/^\.\//, '')}` : valor
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

// El visor con el que se imprime el PDF no siempre conserva la autenticacion de
// TM Cloud. Por eso el logo se convierte a data URL antes de construir el HTML.
async function resolverLogoEmpresa(ruta: any, baseUrl = ''): Promise<string> {
  const valor = String(ruta ?? '').trim()
  if (!valor) return ''

  const rutaDirecta = normalizarRutaImagen(valor, baseUrl)
  if (/^data:/i.test(rutaDirecta)) return rutaDirecta

  // Los logos nuevos se guardan como uid de Storage (fil_xxx), no como URL.
  if (!/^(https?:\/\/|file:|blob:|\/)/i.test(valor)) {
    try {
      await ensureConfigLoaded()
      const url = getImageUrl(valor)
      const key = getConfig()?.key || ''
      if (url) {
        const response = await fetch(url, {
          headers: key ? { Authorization: `Bearer ${key}` } : {},
        })
        if (response.ok) {
          const type = response.headers.get('content-type') || 'image/png'
          return `data:${type};base64,${arrayBufferToBase64(await response.arrayBuffer())}`
        }
      }
    } catch (_) {
      // Si TM Cloud no esta disponible, se intenta la ruta existente.
    }
  }

  return rutaDirecta
}

async function cargarEmpresa() {
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) return res.data[0]
  } catch (_) {}
  return {}
}

async function cargarCliente(factura: any) {
  try {
    const res = await window.db.getAll('clientes')
    if (!res.success || !Array.isArray(res.data)) return {}
    const codCliente = String(factura.cod_cliente || factura.cliente_id || '').trim()
    const nombreCliente = String(factura.nombre_cliente || factura.cliente || factura.comprador || '').trim().toUpperCase()
    const telefonoCliente = String(factura.telefono_cliente || factura.telefono || factura.whatsapp || '').trim()
    const documentoCliente = String(factura.rnc_cliente || factura.cedula_cliente || factura.rnc || factura.cedula || '').trim()
    return res.data.find((cliente: any) =>
      String(cliente.id || '') === codCliente ||
      String(cliente.codigo || '') === codCliente ||
      String(cliente.nombre || '').trim().toUpperCase() === nombreCliente ||
      String(cliente.telefono || '').trim() === telefonoCliente ||
      String(cliente.whatsapp || '').trim() === telefonoCliente ||
      String(cliente.rnc || '').trim() === documentoCliente ||
      String(cliente.cedula || '').trim() === documentoCliente
    ) || {}
  } catch (_) {
    return {}
  }
}

function normalizarClienteFactura(factura: any, clienteData: any = {}) {
  return {
    nombre: factura.nombre_cliente || factura.cliente || factura.comprador || clienteData?.nombre || 'CONSUMIDOR FINAL',
    telefono: factura.telefono_cliente || factura.telefono || factura.whatsapp || clienteData?.telefono || clienteData?.whatsapp || '',
    documento: factura.rnc_cliente || factura.cedula_cliente || factura.rnc || factura.cedula || clienteData?.rnc || clienteData?.cedula || '',
    direccion: factura.direccion_cliente || factura.direccion || clienteData?.direccion || '',
  }
}

function obtenerNotaFactura(factura: any): string {
  return String(
    factura.nota ||
    factura.observacion ||
    factura.observaciones ||
    factura.nota_factura ||
    factura.comentario ||
    ''
  ).trim()
}

async function cargarConfig() {
  try {
    return await envioElectron('datosarchivo')
  } catch (_) {
    return {}
  }
}

async function cargarConfiguracionImpresora() {
  try {
    const res = await window.db.getAll('impresoras_config')
    return res?.success && Array.isArray(res.data) ? res.data[0] || {} : {}
  } catch (_) {
    return {}
  }
}

function limitarMedidaLogo(valor: any, predeterminado: number, minimo: number, maximo: number): number {
  const medida = Number(valor)
  return Number.isFinite(medida) ? Math.min(maximo, Math.max(minimo, medida)) : predeterminado
}

async function generateFacturaHtml({ factura, cliente = null, datosEmpresa = null }: {
  factura: any
  cliente?: any
  datosEmpresa?: any
}) {
  const labels = getSalesDocumentLabels()
  const datosJSON = await cargarConfig()
  const link = datosJSON?.VITE_LINKURL || ''
  const empresa = datosEmpresa?.empresa || datosEmpresa?.datosEmpresa?.empresa || factura.empresa || await cargarEmpresa()
  const clienteData = cliente || await cargarCliente(factura)
  const documentData = prepareDocumentData({ factura, empresa, cliente: clienteData })
  const clienteFactura = { ...normalizarClienteFactura(factura, clienteData), ...documentData.customer }
  clienteFactura.nombre = translateDocumentCustomerName(clienteFactura.nombre)
  const notaFactura = obtenerNotaFactura(factura) || labels.thanks
  const notaFacturaHtml = notaFactura.replace(/\n/g, '<br>')
  const productos = documentData.items
  const logoEmpresa = await resolverLogoEmpresa(empresa?.logoprinter || empresa?.logo, link)
  const configImpresora = await cargarConfiguracionImpresora()
  const logoAncho = limitarMedidaLogo(configImpresora.factura_logo_ancho, 150, 30, 400)
  const logoAlto = limitarMedidaLogo(configImpresora.factura_logo_alto, 90, 20, 250)

  const alanubeData = await obtenerAlanubeData(factura)
  const qrValue = alanubeData.documentStampUrl || `${link || 'https://tmposrd.com'}/receipt/factura?factura=${factura.no_factura || ''}`
  let qrCodeData = factura.qr || ''
  try {
    if (!qrCodeData) qrCodeData = await QRCode.toDataURL(qrValue)
  } catch (_) {}

  const productosProcesados = Array.isArray(productos) ? productos.map((producto: any) => {
    const cantidad = toNumber(producto.cantidad ?? producto.quantity, 0)
    const precioUnidad = toNumber(producto.precio_final ?? producto.precio_venta ?? producto.precio_unitario ?? producto.precio, 0)
    const precioNormal = toNumber(producto.precio_normal ?? producto.precio_lista ?? producto.precio_venta_normal, precioUnidad)
    const descuento = toNumber(producto.descuento, 0)
    const impuesto = toNumber(producto.impuesto_venta ?? producto.impuesto, 0)
    const totalProducto = toNumber(producto.total, (precioUnidad * cantidad) - descuento)
    const tieneDescuentoProducto = precioNormal > 0 && precioUnidad >= 0 && precioUnidad < precioNormal
    return {
      ...producto,
      codigoProducto: obtenerCodigoProducto(producto),
      cantidad,
      precioUnidad,
      precioNormal,
      descuento,
      tieneDescuentoProducto,
      impuestoTotal: impuesto * cantidad,
      totalProducto,
      imeis: obtenerImeisProducto(producto),
      detallesImei: getPhoneImeiDetails(producto),
    }
  }) : []

  const mostrarImpuesto = toNumber(factura.impuesto ?? factura.impuestos) > 0 || productosProcesados.some((p: any) => p.impuestoTotal > 0)
  const mostrarDescuento = toNumber(factura.descuento) > 0 || productosProcesados.some((p: any) => p.descuento > 0)
  const totalImpuesto = productosProcesados.reduce((sum: number, p: any) => sum + p.impuestoTotal, 0) || toNumber(factura.impuesto ?? factura.impuestos)
  const totalFactura = toNumber(factura.total)
  const subtotal = toNumber(factura.subtotal, totalFactura + toNumber(factura.descuento) - totalImpuesto)
  const esPagoMixto = String(factura.metodo_pago || '').toUpperCase() === 'MIXTO'
  const subtotalMostrado = esPagoMixto ? totalFactura : subtotal
  const partesPagoMixto = esPagoMixto ? obtenerPartesPagoMixto(factura) : []
  const filasPagoMixto = partesPagoMixto.map(parte =>
    `<tr class="payment-row"><td>${parte.etiqueta}</td><td class="text-right">${formatoMoneda(parte.monto)}</td></tr>`,
  ).join('')
  const colCount = 5 + (mostrarImpuesto ? 1 : 0) + (mostrarDescuento ? 1 : 0)
  const fechaFactura = formatoFechaFactura(factura.fecha_emision || factura.fecha || '', factura.hora || '')
  const etiquetaDatosCliente = labels.language === 'en' ? 'CUSTOMER DETAILS' : 'DATOS DEL CLIENTE'
  const etiquetaResumenPago = labels.language === 'en' ? 'PAYMENT SUMMARY' : 'RESUMEN DE PAGO'
  const etiquetaDocumento = esCotizacion(factura)
    ? labels.quote.toUpperCase()
    : factura.metodo_pago === 'CREDITO'
      ? labels.creditInvoice
      : labels.invoice.toUpperCase()

  const productosHTML = productosProcesados.map((producto: any) => {
    const imeiHTML = producto.detallesImei.length
      ? producto.detallesImei.map((detalle: string) => `<div class="imei-line">IMEI: ${detalle}</div>`).join('')
      : (producto.imeis.length ? `<div class="imei-line">IMEI: ${producto.imeis.join(', ')}</div>` : '')
    const ofertaHTML = producto.tieneDescuentoProducto
      ? `<div class="discount-line">Normal: <span class="line-through">${formatoMoneda(producto.precioNormal)}</span> &nbsp; Con descuento: <strong>${formatoMoneda(producto.precioUnidad)}</strong></div>`
      : ''
    return `
      <tr class="invoice-line">
        <td>${producto.codigoProducto || ''}</td>
        <td>
          <div>${producto.nombre || producto.descripcion || ''}</div>
          ${ofertaHTML}
          ${imeiHTML}
        </td>
        <td class="text-center">${producto.cantidad}</td>
        <td class="text-right">${formatoMoneda(producto.precioUnidad)}</td>
        ${mostrarImpuesto ? `<td class="text-right">${formatoMoneda(producto.impuestoTotal)}</td>` : ''}
        ${mostrarDescuento ? `<td class="text-right">${formatoMoneda(producto.descuento)}</td>` : ''}
        <td class="text-right"><strong>${formatoMoneda(producto.totalProducto)}</strong></td>
      </tr>
    `
  }).join('')

  const filasRelleno = Array.from({ length: Math.max(0, 8 - productosProcesados.length) }, () =>
    `<tr class="invoice-line empty-row">${Array.from({ length: colCount }, () => '<td>&nbsp;</td>').join('')}</tr>`
  ).join('')

  return `<!DOCTYPE html>
<html lang="${labels.language}">
<head>
  <meta charset="UTF-8">
  <title>${labels.invoice} ${factura.no_factura || ''}</title>
  <style>
    * { box-sizing: border-box; }
    @page { size: letter; margin: 10mm; }
    :root { --navy: #102a43; --blue: #176b9c; --blue-soft: #eaf4f9; --slate: #52667a; --line: #d8e2ea; --surface: #f7fafc; }
    body { margin: 0; background: #fff; color: #172b3a; font-family: "Segoe UI", Arial, Helvetica, sans-serif; font-size: 11px; }
    .page { position: relative; width: 100%; max-width: 760px; margin: 0 auto; padding: 18px 20px 14px; border-top: 6px solid var(--blue); }
    .header { display: flex; justify-content: space-between; align-items: stretch; gap: 28px; padding-bottom: 16px; border-bottom: 1px solid var(--line); }
    .company { flex: 1; min-width: 0; display: flex; align-items: center; gap: 14px; line-height: 1.45; }
    .company img { max-width: ${logoAncho}px; max-height: ${logoAlto}px; object-fit: contain; flex: 0 0 auto; }
    .company-copy { min-width: 0; }
    .company-name { color: var(--navy); font-size: 20px; line-height: 1.15; font-weight: 800; letter-spacing: -.02em; margin-bottom: 6px; }
    .company-meta { color: var(--slate); font-size: 10px; }
    .invoice-box { width: 290px; flex: 0 0 290px; border: 1px solid var(--line); border-radius: 12px; overflow: hidden; background: var(--surface); }
    .document-heading { padding: 11px 13px 9px; background: var(--navy); color: #fff; }
    .document-type { font-size: 9px; font-weight: 700; letter-spacing: .16em; opacity: .72; }
    .document-number { margin-top: 3px; font-size: 15px; font-weight: 800; letter-spacing: .01em; overflow-wrap: anywhere; }
    .invoice-box table { width: 100%; border-collapse: collapse; }
    .invoice-box td { padding: 5px 10px; border-bottom: 1px solid var(--line); color: var(--slate); }
    .invoice-box td:first-child { width: 40%; text-transform: uppercase; font-size: 9px; font-weight: 700; letter-spacing: .04em; }
    .invoice-box td:last-child { color: var(--navy); font-weight: 600; }
    .invoice-title { margin: 8px; padding: 7px 9px; text-align: center; background: var(--blue-soft); color: var(--blue); border-radius: 7px; font-size: 10px; font-weight: 800; letter-spacing: .04em; }
    .section-label { margin-bottom: 7px; color: var(--blue); font-size: 9px; font-weight: 800; letter-spacing: .13em; }
    .client-box { margin-top: 14px; border: 1px solid var(--line); border-radius: 12px; display: flex; justify-content: space-between; gap: 18px; padding: 11px 13px; background: #fff; }
    .client-data { flex: 1; min-width: 0; }
    .client-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 18px; }
    .client-box p { margin: 0; color: var(--slate); }
    .client-box strong { color: var(--navy); font-size: 9px; letter-spacing: .02em; }
    .client-wide { grid-column: 1 / -1; }
    .payment-detail { display: inline; line-height: 1.4; overflow-wrap: anywhere; }
    .qr { flex: 0 0 auto; text-align: center; }
    .qr img { width: 78px; height: 78px; padding: 3px; border: 1px solid var(--line); border-radius: 7px; }
    .products { margin-top: 14px; width: 100%; border-collapse: separate; border-spacing: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
    .products th { background: var(--navy); color: #fff; padding: 8px 7px; border: none; font-weight: 700; font-size: 9px; text-transform: uppercase; letter-spacing: .06em; }
    .products td { padding: 7px; border: none; border-bottom: 1px solid #e8eef3; vertical-align: top; font-size: 10px; }
    .products tbody tr:nth-child(even):not(.empty-row) td { background: var(--surface); }
    .products tbody tr:last-child td { border-bottom: none; }
    .invoice-line { min-height: 24px; }
    .empty-row td { height: 22px; }
    .imei-line { margin-top: 3px; font-size: 8px; font-weight: 700; color: var(--slate); }
    .discount-line { margin-top: 3px; font-size: 8px; color: var(--slate); }
    .line-through { text-decoration: line-through; color: #6b7280; }
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .bottom { display: flex; justify-content: space-between; align-items: flex-start; gap: 34px; margin-top: 14px; }
    .signatures { flex: 1; display: grid; grid-template-columns: 1fr 1fr; gap: 18px; padding-top: 26px; }
    .signature-line { border-top: 1px solid #7b8b99; padding-top: 5px; text-align: center; color: var(--slate); font-size: 9px; }
    .signature-line strong { display: block; color: var(--navy); font-size: 9px; text-transform: uppercase; }
    .totals { width: 310px; border: 1px solid var(--line); border-radius: 11px; overflow: hidden; align-self: flex-start; box-shadow: 0 3px 10px rgba(16,42,67,.06); }
    .totals-title { padding: 8px 10px; background: var(--blue-soft); color: var(--blue); font-size: 9px; font-weight: 800; letter-spacing: .12em; }
    .totals table { width: 100%; border-collapse: collapse; }
    .totals td { padding: 6px 10px; border-bottom: 1px solid #e8eef3; }
    .totals .payment-row td { color: var(--blue); font-size: 10px; background: #fbfdff; }
    .totals tr:last-child td { border-bottom: none; background: var(--navy); color: #fff; font-size: 14px; font-weight: 800; padding-top: 9px; padding-bottom: 9px; }
    .note { margin-top: 10px; padding: 9px 11px; border-left: 3px solid var(--blue); border-radius: 0 8px 8px 0; font-size: 10px; line-height: 1.4; color: var(--slate); background: var(--surface); }
    .note strong { color: var(--navy); font-size: 9px; letter-spacing: .06em; }
    .footer { margin-top: 16px; padding-top: 8px; border-top: 1px solid var(--line); display: flex; justify-content: space-between; color: #8494a3; font-size: 8px; }
    @media print {
      * { -webkit-print-color-adjust: exact !important; print-color-adjust: exact !important; }
      .page { padding: 0; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="header">
      <div class="company">
        ${logoEmpresa ? `<img src="${logoEmpresa}" alt="Logo">` : ''}
        <div class="company-copy">
          <div class="company-name">${empresa.nombre || labels.company}</div>
          <div class="company-meta">
            ${empresa.legal || empresa.rnc ? `${fiscal.businessIdLabel}: ${empresa.legal || empresa.rnc}<br>` : ''}
            ${empresa.telefono ? `Tel: ${empresa.telefono}` : ''}${empresa.email ? `${empresa.telefono ? ' &nbsp;|&nbsp; ' : ''}${empresa.email}<br>` : '<br>'}
            ${empresa.direccion || ''}
          </div>
        </div>
      </div>

      <div class="invoice-box">
        <div class="document-heading">
          <div class="document-type">${etiquetaDocumento}</div>
          <div class="document-number">${factura.no_factura || ''}</div>
        </div>
        <table>
          <tr><td><strong>${labels.date}</strong></td><td class="text-right">${fechaFactura}</td></tr>
          ${esCotizacion(factura) || !(factura.ncf || factura.comprobante) ? '' : `<tr><td><strong>${fiscal.fiscalDocumentLabel}</strong></td><td class="text-right">${factura.ncf || factura.comprobante || ''}</td></tr>`}
        </table>
        <div class="invoice-title">${(() => {
          if (esCotizacion(factura)) return `${labels.quote.toUpperCase()} #${factura.no_factura || ''}`
          if (factura.metodo_pago === 'CREDITO') return `${labels.creditInvoice} #${factura.no_factura || ''}`
          if (esPagoMixto) return resumirMetodoMixto(factura)
          return `${labels.invoice.toUpperCase()} #${factura.no_factura || ''}`
        })()}</div>
        ${esCotizacion(factura) ? `<div style="text-align:center;margin-top:8px;font-size:10px;color:#666;font-style:italic">${labels.quoteValidity}</div>` : ''}
      </div>
    </div>

    <div class="client-box">
      <div class="client-data">
        <div class="section-label">${etiquetaDatosCliente}</div>
        <div class="client-grid">
          <p><strong>${labels.customer}:</strong><br>${clienteFactura.nombre || labels.unregistered}</p>
          <p><strong>${labels.phone}:</strong><br>${clienteFactura.telefono || labels.notApplicable}</p>
          <p><strong>${fiscal.customerIdLabel.toUpperCase()}:</strong><br>${clienteFactura.documento || labels.notApplicable}</p>
          <p><strong>${labels.paymentMethod}:</strong><br><span class="payment-detail">${formatearMetodoPago(factura)}</span></p>
          <p class="client-wide"><strong>${labels.address}:</strong><br>${clienteFactura.direccion || labels.notApplicable}</p>
        </div>
      </div>
      <div class="qr">
        ${qrCodeData ? `<img src="${qrCodeData}" alt="QR">` : ''}
        ${alanubeData.securityCode ? `<div style="font-size:9px;font-weight:700;text-align:center;margin-top:4px">${labels.securityCode}: ${alanubeData.securityCode}</div>` : ''}
      </div>
    </div>

    <table class="products">
      <thead>
        <tr>
          <th>${labels.code}</th>
          <th>${labels.description}</th>
          <th>${labels.quantity}</th>
          <th>${labels.unitPrice}</th>
          ${mostrarImpuesto ? `<th>${fiscal.shortName}</th>` : ''}
          ${mostrarDescuento ? `<th>${labels.discount}</th>` : ''}
          <th>${labels.subtotal}</th>
        </tr>
      </thead>
      <tbody>
        ${productosHTML}
        ${filasRelleno}
      </tbody>
    </table>

    <div class="note"><strong>${labels.observation}:</strong><br>${notaFacturaHtml}</div>

    <div class="bottom">
      <div class="signatures">
        <div class="signature-line"><strong>${labels.deliveredBy}</strong>${factura.usuario || factura.cajero || labels.user}</div>
        <div class="signature-line"><strong>${labels.receivedBy}</strong>${clienteFactura.nombre || labels.unregistered}</div>
      </div>

      <div class="totals">
        <div class="totals-title">${etiquetaResumenPago}</div>
        <table>
          <tr><td>${labels.subtotal}</td><td class="text-right">${formatoMoneda(subtotalMostrado)}</td></tr>
          ${mostrarImpuesto ? `<tr><td>${fiscal.shortName}</td><td class="text-right">${formatoMoneda(totalImpuesto)}</td></tr>` : ''}
          ${mostrarDescuento ? `<tr><td>${labels.discount}</td><td class="text-right">${formatoMoneda(factura.descuento)}</td></tr>` : ''}
          ${filasPagoMixto}
          <tr><td>${labels.total}</td><td class="text-right">${formatoMoneda(factura.total)}</td></tr>
        </table>
      </div>
    </div>

    <div class="footer"><span>${empresa.nombre || labels.company}</span><span>${labels.invoice} ${factura.no_factura || ''}</span></div>

  </div>
</body>
</html>`
}

async function abrirPdf(url: string, nombre: string) {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = url
  pdfNombre.value = nombre
  dialogPdf.value = true
}

function cerrarPdf() {
  if (pdfUrl.value) URL.revokeObjectURL(pdfUrl.value)
  pdfUrl.value = ''
  pdfNombre.value = ''
  dialogPdf.value = false
}

async function descargarPDF() {
  if (!pdfUrl.value) return
  const blob = await (await fetch(pdfUrl.value)).blob()
  const buffer = await blob.arrayBuffer()
  const dataUrl = `data:application/pdf;base64,${arrayBufferToBase64(buffer)}`
  const res = await window.electron.invoke('save:pdf', dataUrl, pdfNombre.value) as { success: boolean; error?: string }
  if (res.success) toast.add({ severity: 'success', summary: 'Guardado', detail: 'PDF descargado', life: 2000 })
  else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar el PDF', life: 3000 })
}

async function printFactura(factura: any) {
  generandoPdf.value = true
  try {
    const html = await generateFacturaHtml({ factura })
    const nombre = `Factura_${factura?.no_factura || 'sin_numero'}.pdf`
    const res = await window.electron.invoke('generate:pdf', html, nombre) as { success: boolean; dataUrl?: string; error?: string }
    if (res.success && res.dataUrl) {
      const blob = await (await fetch(res.dataUrl)).blob()
      await abrirPdf(URL.createObjectURL(blob), nombre)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar el PDF', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al generar PDF', life: 3000 })
  } finally {
    generandoPdf.value = false
  }
}

defineExpose({
  printFactura,
  generateFacturaHtml,
})
</script>

<template>
  <div style="display:none">
    <Toast />
  </div>

  <Dialog
    v-model:visible="dialogPdf"
    header="Vista Previa - Factura PDF"
    modal
    :style="{ width: '80vw', height: '90vh' }"
    :draggable="false"
    @hide="cerrarPdf"
  >
    <div class="flex flex-col h-full gap-3">
      <iframe
        v-if="pdfUrl"
        :src="pdfUrl"
        class="w-full flex-1 border-0 rounded-lg"
        style="min-height: 70vh"
        title="Factura PDF"
      ></iframe>
    </div>
    <template #footer>
      <Button label="Cerrar" severity="secondary" text @click="cerrarPdf" />
      <Button label="Descargar PDF" icon="pi pi-download" @click="descargarPDF" />
    </template>
  </Dialog>
</template>
