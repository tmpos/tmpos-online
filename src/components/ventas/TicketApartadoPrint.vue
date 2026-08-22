<script setup lang="ts">
import { ref } from 'vue'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { formatSystemCurrency } from '@/i18n/localeProfiles'

const toast = useToast()
const printerName = ref('')

function money(value: any): string {
  return formatSystemCurrency(value)
}

function formatFecha(fecha: string): string {
  if (!fecha) return ''
  const parts = String(fecha).split('T')[0].split('-')
  return parts.length === 3 ? `${parts[2]}/${parts[1]}/${parts[0]}` : fecha
}

function getPagos(apartado: any): any[] {
  try {
    return Array.isArray(apartado?.pagos) ? apartado.pagos : JSON.parse(apartado?.pagos || '[]')
  } catch {
    return []
  }
}

function getTotalAbonado(apartado: any): number {
  return getPagos(apartado).reduce((sum, pago) => sum + Number(pago?.monto || 0), 0)
}

function getSaldo(apartado: any): number {
  return Math.max(0, Number(apartado?.total || 0) - getTotalAbonado(apartado))
}

function buildTicketHtml(apartado: any, tipo: 'apartado' | 'pago' = 'apartado', pago?: any): string {
  const pagos = getPagos(apartado)
  const titulo = tipo === 'pago' ? (getSaldo(apartado) <= 0 ? 'APARTADO COMPLETADO' : 'PAGO DE APARTADO') : 'RECIBO DE APARTADO'
  const empresaNombre = (window as any).__empresaNombre || 'MI EMPRESA'
  const empresaDireccion = (window as any).__empresaDireccion || ''
  const empresaTelefono = (window as any).__empresaTelefono || ''
  const notas = String(apartado?.notas || '')
  const imei = notas.match(/IMEI:\s*([^|]+)/i)?.[1]?.trim() || ''
  const modelo = notas.match(/MODELO:\s*([^|]+)/i)?.[1]?.trim() || ''

  const pagoActual = pago
    ? `
      <div class="row strong"><span>Monto pagado</span><b>${money(pago.monto)}</b></div>
      <div class="row"><span>Metodo</span><b>${pago.metodo_pago || 'N/A'}</b></div>
      ${pago.referencia ? `<div class="row"><span>Referencia</span><b>${pago.referencia}</b></div>` : ''}
      <div class="sep"></div>
    `
    : ''

  const pagosHtml = pagos.length
    ? `
      <div class="section-title">Historial de pagos</div>
      ${pagos.map((p: any) => `
        <div class="payment">
          <span>${formatFecha(p.fecha)} ${p.metodo_pago || ''}</span>
          <b>${money(p.monto)}</b>
        </div>
      `).join('')}
      <div class="sep"></div>
    `
    : ''

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>${titulo} ${apartado?.no_factura || ''}</title>
    <style>
      * { box-sizing: border-box; }
      body { margin: 0; padding: 10px; background: #fff; color: #111; font-family: "Courier New", monospace; }
      .ticket { width: 300px; margin: 0 auto; }
      .center { text-align: center; }
      .brand { font-size: 16px; font-weight: 800; letter-spacing: .4px; text-transform: uppercase; }
      .title { margin-top: 6px; font-size: 15px; font-weight: 800; text-transform: uppercase; }
      .muted { color: #444; font-size: 11px; }
      .sep { border-top: 1px dashed #111; margin: 8px 0; }
      .row { display: flex; justify-content: space-between; gap: 10px; font-size: 12px; line-height: 1.45; }
      .row span { color: #333; }
      .row b { text-align: right; }
      .strong { font-size: 13px; font-weight: 800; }
      .section-title { margin: 8px 0 4px; font-size: 11px; font-weight: 800; text-transform: uppercase; }
      .payment { display: flex; justify-content: space-between; gap: 8px; font-size: 11px; padding: 2px 0; }
      .total-box { border: 1px solid #111; padding: 7px; margin: 8px 0; }
      .footer { margin-top: 10px; font-size: 11px; line-height: 1.4; }
      @media print { body { padding: 0; } .ticket { width: 300px; } }
    </style>
  </head>
  <body>
    <div class="ticket">
      <div class="center">
        <div class="brand">${empresaNombre}</div>
        ${empresaDireccion ? `<div class="muted">${empresaDireccion}</div>` : ''}
        ${empresaTelefono ? `<div class="muted">Tel: ${empresaTelefono}</div>` : ''}
        <div class="sep"></div>
        <div class="title">${titulo}</div>
      </div>
      <div class="sep"></div>
      <div class="row"><span>No.</span><b>${apartado?.no_factura || apartado?.no_apartado || '-'}</b></div>
      <div class="row"><span>Fecha</span><b>${formatFecha(apartado?.fecha_venta || new Date().toISOString())}</b></div>
      <div class="row"><span>Cliente</span><b>${apartado?.nombre_cliente || 'SIN CLIENTE'}</b></div>
      <div class="row"><span>Telefono</span><b>${apartado?.telefono_cliente || 'N/A'}</b></div>
      <div class="sep"></div>
      ${modelo ? `<div class="row"><span>Equipo</span><b>${modelo}</b></div>` : ''}
      ${imei ? `<div class="row"><span>IMEI</span><b>${imei}</b></div>` : ''}
      ${pagoActual}
      <div class="total-box">
        <div class="row strong"><span>Total</span><b>${money(apartado?.total)}</b></div>
        <div class="row"><span>Abonado</span><b>${money(getTotalAbonado(apartado))}</b></div>
        <div class="row strong"><span>Saldo</span><b>${money(getSaldo(apartado))}</b></div>
      </div>
      ${pagosHtml}
      <div class="center footer">
        Gracias por su preferencia.<br>
        Este recibo confirma el movimiento registrado.
      </div>
    </div>
  </body>
  </html>`
}

async function printTicket(apartado: any, tipo: 'apartado' | 'pago' = 'apartado', pago?: any) {
  try {
    const saved = localStorage.getItem('etiquetas_printer')
    printerName.value = saved || ''
    const resConfig = await window.db.getAll('impresoras_config')
    if (resConfig.success && resConfig.data?.length > 0) {
      printerName.value = resConfig.data[0].printer_name || printerName.value
    }

    const res = await window.electron.invoke('print:ticket', buildTicketHtml(apartado, tipo, pago), printerName.value || undefined)
    if (res.success) toast.add({ severity: 'success', summary: 'Imprimiendo recibo', life: 2000 })
    else toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo imprimir', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo imprimir', life: 3000 })
  }
}

defineExpose({ printTicket, buildTicketHtml })
</script>

<template>
  <div style="display:none">
    <Toast />
  </div>
</template>
