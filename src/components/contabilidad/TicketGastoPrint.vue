<script setup lang="ts">
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { getLocaleProfile, getSystemCurrencyCode } from '@/i18n/localeProfiles'
import { ensureConfigLoaded, getConfig, getImageUrl } from '@/services/tmCloudClient'

const toast = useToast()

const DEFAULT_TICKET_CONFIG = {
  printer_name: '',
  paper_width: 80,
  show_logo: 1,
  show_company_name: 1,
  show_legal: 1,
  show_phone: 1,
  show_address: 1,
  show_email: 1,
  show_footer: 1,
  footer_text: 'Gracias por su preferencia',
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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer)
  let binary = ''
  const chunkSize = 0x8000
  for (let i = 0; i < bytes.length; i += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunkSize))
  }
  return btoa(binary)
}

async function resolverLogoTicket(ruta: any): Promise<string> {
  const valor = String(ruta || '').trim()
  if (!valor || /^data:/i.test(valor)) return valor
  try {
    await ensureConfigLoaded()
    const url = /^(https?:\/\/|blob:|file:|\/)/i.test(valor) ? valor : getImageUrl(valor)
    if (!url) return valor
    const key = getConfig()?.key || ''
    const response = await fetch(url, { headers: key ? { Authorization: `Bearer ${key}` } : {} })
    if (!response.ok) return valor
    const type = response.headers.get('content-type') || 'image/png'
    return `data:${type};base64,${arrayBufferToBase64(await response.arrayBuffer())}`
  } catch (_) {
    return valor
  }
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const d = new Date(fechaStr)
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function buildTicketHtml({ gasto, empresa, ticketConfig }: { gasto: any; empresa: any; ticketConfig: any }) {
  const simbolo = getSystemCurrencyCode()
  const logoEmpresa = resolveLogo(empresa)
  const paperWidth = toNumber(ticketConfig.paper_width, 80)
  const pageWidth = paperWidth === 58 ? 230 : 300
  const bodyWidth = paperWidth === 58 ? 210 : 250
  const ticketWidth = paperWidth === 58 ? 200 : 240
  const ahora = new Date()
  const fechaHora = `${ahora.toLocaleDateString(getLocaleProfile().locale)} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`

  const infoParts: string[] = []
  if (isOn(ticketConfig.show_address) && empresa.direccion) infoParts.push(empresa.direccion)
  const pe: string[] = []
  if (isOn(ticketConfig.show_phone) && empresa.telefono) pe.push(empresa.telefono)
  if (isOn(ticketConfig.show_email) && empresa.email) pe.push(empresa.email)
  if (pe.length) infoParts.push(pe.join(' / '))
  if (isOn(ticketConfig.show_legal) && (empresa.legal || empresa.rnc)) infoParts.push(`RNC: ${empresa.legal || empresa.rnc}`)
  const empresaInfoHtml = infoParts.length ? `<p>${infoParts.join('<br>')}</p>` : ''

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
    table { width: 100%; border-collapse: collapse; }
    .precio { text-align: right; }
    .centrado { text-align: center; }
    .big { font-size: 1.35em !important; font-weight: bold; }
    .rojo { color: #dc2626; }
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

    <div class="bordeado" style="text-align:center;padding:4px;margin-top:6px;">
      COMPROBANTE DE GASTO
    </div>

    <table style="margin-top:6px;">
      <tr><td style="padding:2px 0"><b>No. Gasto:</b></td><td class="precio">${gasto.id || ''}</td></tr>
      <tr><td style="padding:2px 0"><b>Fecha:</b></td><td class="precio">${formatFecha(gasto.fecha)}</td></tr>
      <tr><td style="padding:2px 0"><b>Hora:</b></td><td class="precio">${gasto.hora || ''}</td></tr>
    </table>

    <div class="linea"></div>

    <div style="text-align:center;margin:8px 0;">
      <span class="big rojo">${simbolo}${formatCurrency(gasto.cantidad)}</span>
    </div>

    ${gasto.comentario ? `<div class="bordeado" style="margin-top:6px"><p><b>Concepto:</b><br>${String(gasto.comentario).replace(/\n/g, '<br>')}</p></div>` : ''}

    <div class="linea"></div>
    <div style="text-align:center;font-size:9px;color:#666;">Emitido: ${fechaHora}</div>

    ${isOn(ticketConfig.show_footer) ? `<div class="linea"></div><div style="text-align:center;">${ticketConfig.footer_text || 'Gracias por su preferencia'}</div>` : ''}
  </div>
</body>
</html>`
}

async function printTicket(gasto: any) {
  let ticketConfig = { ...DEFAULT_TICKET_CONFIG }
  try {
    const resConfig = await window.db.getAll('impresoras_config')
    if (resConfig.success && resConfig.data?.length > 0) {
      ticketConfig = { ...ticketConfig, ...resConfig.data[0] }
    }
  } catch (_) {}

  let empresa: any = {}
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) empresa = res.data[0]
  } catch (_) {}
  const logo = await resolverLogoTicket(empresa?.logoprinter || empresa?.logo)
  if (logo) empresa = { ...empresa, logo, logoprinter: logo }

  const html = buildTicketHtml({ gasto, empresa, ticketConfig })

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
