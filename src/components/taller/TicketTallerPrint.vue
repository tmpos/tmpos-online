<script setup lang="ts">
import { ref } from 'vue'
import QRCode from 'qrcode'
import JsBarcode from 'jsbarcode'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { formatSystemCurrency } from '@/i18n/localeProfiles'
import { resolvePrintableImage } from '@/services/printImageService'

const toast = useToast()
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
  footer_text: 'Gracias por su compra',
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

function isOn(value: any): boolean {
  return value === true || value === 1 || value === '1'
}

function formatCurrency(value: any): string {
  return formatSystemCurrency(value)
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

function getMarcaModelo(orden: any) {
  const valor = String(orden.marca_modelo || '').trim()
  if (!valor) return { marca: orden.marca || '', modelo: orden.modelo || '' }
  const partes = valor.split('/').map((p) => p.trim())
  return {
    marca: orden.marca || partes[0] || '',
    modelo: orden.modelo || partes.slice(1).join(' / ') || '',
  }
}

function buildTicketHtml({
  orden,
  empresa,
  ticketConfig,
  qrCodeData,
}: {
  orden: any
  empresa: any
  ticketConfig: any
  qrCodeData: string
}) {
  const paperWidth = toNumber(ticketConfig.paper_width, 80)
  const pageWidth = paperWidth === 58 ? 230 : 300
  const bodyWidth = paperWidth === 58 ? 210 : 250
  const ticketWidth = paperWidth === 58 ? 200 : 240
  const marcaModelo = getMarcaModelo(orden)
  const total = toNumber(orden.total)
  const abonado = toNumber(orden.abono)
  const pendiente = toNumber(orden.pendiente, Math.max(0, total - abonado))
  const logo = String(empresa.logoprinter || empresa.logo || '').trim()
  const barcodeSvg = generarBarcodeSVG(orden.no_orden || orden.no_factura || String(orden.id || ''))

  const infoParts: string[] = []
  if (isOn(ticketConfig.show_address) && empresa.direccion) infoParts.push(empresa.direccion)
  const pe: string[] = []
  if (isOn(ticketConfig.show_phone) && empresa.telefono) pe.push(empresa.telefono)
  if (isOn(ticketConfig.show_email) && empresa.email) pe.push(empresa.email)
  if (pe.length) infoParts.push(pe.join(' / '))
  if (isOn(ticketConfig.show_legal) && (empresa.legal || empresa.rnc)) infoParts.push(`RNC: ${empresa.legal || empresa.rnc}`)
  const empresaInfoHtml = infoParts.length ? `<div class="info"><p style="width:100%;text-align:center;">${infoParts.join('<br>')}</p></div>` : ''

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>Orden Taller - ${orden.no_orden || ''}</title>
  <style>
    * { font-size: 10px; font-family: Arial, Helvetica, sans-serif; }
    @page { size: ${pageWidth}px auto; margin: 5px; }
    html, body { background-color: #ffffff; }
    body { width: ${bodyWidth}px; margin: 5px; padding: 5px; background-color: #ffffff; color: #000; }
    .ticket { width: ${ticketWidth}px; padding-top: 10px; padding-bottom: 10px; }
    table { width: 100%; border-collapse: collapse; border-spacing: 0 !important; }
    td, th { vertical-align: top; }
    .bordeado { border: 1px solid #000; border-radius: 5px; padding-left: 5px; }
    .bordeado2 { border: 1px solid #000; border-radius: 5px; padding: 3px; max-width: 150px; margin-top: 5px; }
    .contenedor { border: 2px solid #000; border-radius: 5px; box-sizing: border-box; padding: 6px; width: 100%; }
    .linea { width: 100%; border-top: 1px solid #000; padding-top: 5px; padding-bottom: 5px; margin-bottom: 5px; }
    .info { display: flex; justify-content: space-between; align-items: flex-start; }
    .logos img { display: block; width: auto; height: auto; max-width: 100px; max-height: 72px; margin: 0 auto 4px; object-fit: contain; }
    .label { width: 42%; font-weight: bold; padding: 2px 3px 2px 0; }
    .value { width: 58%; padding: 2px 0; word-break: break-word; white-space: pre-wrap; }
    .totales { text-align: right; font-weight: bold; padding-right: 10px; }
  </style>
</head>
<body>
  <div class="ticket">
    <center id="top">
      <div class="logos" style="text-align:center;">
        ${isOn(ticketConfig.show_logo) && logo ? `<img src="${logo}" alt="Logo">` : ''}
        ${isOn(ticketConfig.show_company_name) ? `<div style="font-size:18px !important;font-weight:bold">${empresa.nombre || 'MI EMPRESA'}</div>` : ''}
        ${empresaInfoHtml}
      </div>
    </center>

    <div id="mid" class="bordeado">
      <div class="info">
        <p>
          Fecha: ${orden.fecha_entrada || ''}<br>
          DOC: <b style="font-size:16px">#${orden.no_orden || orden.no_factura || ''}</b><br>
          ${isOn(ticketConfig.show_cliente) ? `CLIENTE: ${orden.nombre || ''}<br>` : ''}
          ${isOn(ticketConfig.show_cliente) && orden.cedula ? `CEDULA: ${orden.cedula}<br>` : ''}
          ${isOn(ticketConfig.show_cliente) && orden.telefono ? `TELEFONO: ${orden.telefono}<br>` : ''}
          METODO DE PAGO: ${orden.metodo_pago || ''}
        </p>
      </div>
    </div>

    <div class="bordeado" style="text-align:center;padding:3px;margin-bottom:5px;margin-top:5px">
      RESUMEN DE LA ORDEN
    </div>

    ${isOn(ticketConfig.show_items) ? `<table class="contenedor">
      <tr><td class="label">EQUIPO:</td><td class="value">${orden.equipo || ''}</td></tr>
      <tr><td class="label">MARCA:</td><td class="value">${marcaModelo.marca}</td></tr>
      <tr><td class="label">MODELO:</td><td class="value">${marcaModelo.modelo}</td></tr>
      <tr><td class="label">IMEI:</td><td class="value">${orden.imei || ''}</td></tr>
      <tr><td class="label">SERIAL:</td><td class="value">${orden.serial || ''}</td></tr>
      <tr><td class="label">CLAVE:</td><td class="value">${orden.clave ? 'NO SE REVELA' : ''}</td></tr>
      <tr><td class="label">ACCESORIOS:</td><td class="value">${orden.accesorios || ''}</td></tr>
      <tr><td class="label">FALLAS:</td><td class="value">${orden.fallas || ''}</td></tr>
      <tr><td class="label">PIEZAS CAMBIADAS:</td><td class="value">${orden.piezas || ''}</td></tr>
      <tr><td class="label">TECNICO ASIGNADO:</td><td class="value">${orden.tecnico || ''}</td></tr>
      <tr><td class="label">FECHA ENTRADA:</td><td class="value">${orden.fecha_entrada || ''}</td></tr>
      <tr><td class="label">FECHA ENTREGA:</td><td class="value">${orden.fecha_entrega || ''}</td></tr>
      <tr><td class="label">ESTADO:</td><td class="value"><b>${orden.estado || ''}</b></td></tr>
    </table>` : ''}

    ${isOn(ticketConfig.show_totals) ? `<div class="linea" style="margin-top:10px;"></div>
      <div class="totales"><span>TOTAL: </span><span>${formatCurrency(total)}</span></div>
      <div class="totales"><span>ABONADO: </span><span>${formatCurrency(abonado)}</span></div>
      <div class="totales"><span>PENDIENTE: </span><span>${formatCurrency(pendiente)}</span></div>
    ` : ''}

    ${isOn(ticketConfig.show_barcode) ? `<div class="barcode"><center><div class="bordeado2" style="overflow:hidden;">${barcodeSvg}</div></center></div>` : ''}

    ${isOn(ticketConfig.show_qr) && qrCodeData ? `<div style="text-align:center;"><img src="${qrCodeData}" alt="QR" style="width:150px;position:relative;"></div>` : ''}

    ${isOn(ticketConfig.show_footer) ? `<div class="linea" style="margin-top:8px;"></div><div style="text-align:center;">${ticketConfig.footer_text || ''}</div>` : ''}
  </div>
</body>
</html>`
}

async function printTicket(orden: any) {
  let ticketConfig = { ...DEFAULT_TICKET_CONFIG }
  try {
    const resConfig = await window.db.getAll('impresoras_config')
    if (resConfig.success && resConfig.data?.length > 0) {
      ticketConfig = { ...ticketConfig, ...resConfig.data[0] }
      printerName.value = ticketConfig.printer_name || ''
    }
  } catch (_) {}

  let empresa: any = {}
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) empresa = res.data[0]
  } catch (_) {}

  const logo = await resolvePrintableImage(empresa?.logoprinter || empresa?.logo)
  if (logo) empresa = { ...empresa, logo, logoprinter: logo }

  let qrCodeData = ''
  try {
    qrCodeData = await QRCode.toDataURL(`https://tmposrd.com/taller/${orden.no_orden || orden.id || ''}`)
  } catch (_) {}

  const html = buildTicketHtml({
    orden,
    empresa,
    ticketConfig,
    qrCodeData,
  })

  try {
    const res = await window.electron.invoke('print:ticket', html, printerName.value || undefined)
    if (res.success) toast.add({ severity: 'success', summary: 'Imprimiendo...', detail: 'Orden enviada a la impresora', life: 2000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo imprimir', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al imprimir', life: 3000 })
  }
}

defineExpose({ printTicket })
</script>

<template>
  <div style="display:none">
    <Toast />
  </div>
</template>
