<script setup lang="ts">
import { ref } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { formatSystemCurrency, formatSystemDateTime } from '@/i18n/localeProfiles'

const toast = useToast()
const dialogPdf = ref(false)
const pdfUrl = ref('')
const pdfNombre = ref('')
const generandoPdf = ref(false)

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

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = ''
  const bytes = new Uint8Array(buffer)
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i])
  return btoa(binary)
}

function buildApartadoPdfHtml(apartado: any): string {
  const pagos = getPagos(apartado)
  const abonado = getTotalAbonado(apartado)
  const saldo = getSaldo(apartado)
  const empresaNombre = (window as any).__empresaNombre || 'MI EMPRESA'
  const notas = String(apartado?.notas || '')
  const imei = notas.match(/IMEI:\s*([^|]+)/i)?.[1]?.trim() || ''
  const modelo = notas.match(/MODELO:\s*([^|]+)/i)?.[1]?.trim() || ''
  const estado = saldo <= 0 ? 'COMPLETADO' : (apartado?.estado === 'APARTADO' ? 'ACTIVO' : apartado?.estado || 'ACTIVO')
  const progreso = Number(apartado?.total || 0) > 0 ? Math.min(100, Math.round((abonado / Number(apartado.total)) * 100)) : 0

  const pagosRows = pagos.length
    ? pagos.map((p: any, index: number) => `
      <tr>
        <td>${index + 1}</td>
        <td>${formatFecha(p.fecha)}</td>
        <td>${p.metodo_pago || 'N/A'}</td>
        <td>${p.referencia || '-'}</td>
        <td class="right">${money(p.monto)}</td>
      </tr>
    `).join('')
    : '<tr><td colspan="5" class="empty">No hay pagos registrados.</td></tr>'

  return `<!doctype html>
  <html>
  <head>
    <meta charset="utf-8">
    <title>Recibo de Apartado ${apartado?.no_factura || ''}</title>
    <style>
      @page { size: A4; margin: 18mm; }
      * { box-sizing: border-box; }
      body { margin: 0; background: #f4f6f8; color: #111827; font-family: Arial, Helvetica, sans-serif; }
      .page { width: 210mm; min-height: 297mm; margin: 0 auto; background: #fff; padding: 28px; }
      .header { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 3px solid #111827; padding-bottom: 18px; }
      .brand { font-size: 24px; font-weight: 800; letter-spacing: .5px; }
      .subtitle { margin-top: 4px; color: #6b7280; font-size: 13px; }
      .doc-title { text-align: right; }
      .doc-title h1 { margin: 0; font-size: 26px; letter-spacing: .8px; }
      .pill { display: inline-block; margin-top: 8px; padding: 6px 12px; border-radius: 999px; background: #ecfdf5; color: #047857; font-weight: 700; font-size: 12px; }
      .grid { display: grid; grid-template-columns: 1.1fr .9fr; gap: 18px; margin-top: 22px; }
      .panel { border: 1px solid #e5e7eb; border-radius: 8px; padding: 16px; }
      .panel h2 { margin: 0 0 12px; font-size: 13px; text-transform: uppercase; color: #374151; letter-spacing: .8px; }
      .kv { display: grid; grid-template-columns: 120px 1fr; gap: 8px; font-size: 13px; margin: 7px 0; }
      .kv span { color: #6b7280; }
      .kv b { color: #111827; }
      .summary { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; margin-top: 18px; }
      .metric { border-radius: 8px; padding: 14px; border: 1px solid #e5e7eb; background: #f9fafb; }
      .metric span { display: block; color: #6b7280; font-size: 12px; text-transform: uppercase; letter-spacing: .6px; }
      .metric b { display: block; margin-top: 8px; font-size: 20px; }
      .metric.balance b { color: #b45309; }
      .metric.paid b { color: #047857; }
      .progress { margin-top: 18px; border: 1px solid #e5e7eb; border-radius: 8px; padding: 14px; }
      .progress-head { display: flex; justify-content: space-between; font-size: 13px; margin-bottom: 8px; }
      .bar { height: 10px; background: #e5e7eb; border-radius: 999px; overflow: hidden; }
      .bar-fill { height: 100%; width: ${progreso}%; background: linear-gradient(90deg, #059669, #0f766e); }
      table { width: 100%; border-collapse: collapse; margin-top: 18px; font-size: 12px; }
      th { text-align: left; background: #111827; color: #fff; padding: 10px; font-size: 11px; text-transform: uppercase; letter-spacing: .5px; }
      td { border-bottom: 1px solid #e5e7eb; padding: 10px; }
      .right { text-align: right; }
      .empty { text-align: center; color: #6b7280; padding: 18px; }
      .notes { margin-top: 18px; padding: 14px; background: #fffbeb; border: 1px solid #fde68a; border-radius: 8px; font-size: 12px; color: #92400e; }
      .footer { margin-top: 28px; display: flex; justify-content: space-between; align-items: flex-end; gap: 18px; color: #6b7280; font-size: 11px; }
      .signature { width: 220px; border-top: 1px solid #9ca3af; padding-top: 8px; text-align: center; color: #374151; }
      @media print { body { background: #fff; } .page { width: auto; min-height: auto; margin: 0; padding: 0; } }
    </style>
  </head>
  <body>
    <main class="page">
      <section class="header">
        <div>
          <div class="brand">${empresaNombre}</div>
          <div class="subtitle">Documento profesional de control de apartado</div>
        </div>
        <div class="doc-title">
          <h1>RECIBO DE APARTADO</h1>
          <div class="pill">${estado}</div>
        </div>
      </section>

      <section class="grid">
        <div class="panel">
          <h2>Cliente</h2>
          <div class="kv"><span>Nombre</span><b>${apartado?.nombre_cliente || 'SIN CLIENTE'}</b></div>
          <div class="kv"><span>Telefono</span><b>${apartado?.telefono_cliente || 'N/A'}</b></div>
          <div class="kv"><span>Fecha</span><b>${formatFecha(apartado?.fecha_venta)}</b></div>
        </div>
        <div class="panel">
          <h2>Apartado</h2>
          <div class="kv"><span>No.</span><b>${apartado?.no_factura || apartado?.no_apartado || '-'}</b></div>
          <div class="kv"><span>Equipo</span><b>${modelo || 'N/A'}</b></div>
          <div class="kv"><span>IMEI</span><b>${imei || 'N/A'}</b></div>
        </div>
      </section>

      <section class="summary">
        <div class="metric"><span>Total</span><b>${money(apartado?.total)}</b></div>
        <div class="metric paid"><span>Abonado</span><b>${money(abonado)}</b></div>
        <div class="metric balance"><span>Saldo</span><b>${money(saldo)}</b></div>
      </section>

      <section class="progress">
        <div class="progress-head"><strong>Progreso de pago</strong><span>${progreso}% pagado</span></div>
        <div class="bar"><div class="bar-fill"></div></div>
      </section>

      <table>
        <thead>
          <tr>
            <th>#</th>
            <th>Fecha</th>
            <th>Metodo</th>
            <th>Referencia</th>
            <th class="right">Monto</th>
          </tr>
        </thead>
        <tbody>${pagosRows}</tbody>
      </table>

      ${notas ? `<div class="notes"><strong>Notas:</strong> ${notas}</div>` : ''}

      <section class="footer">
        <div>Generado el ${formatSystemDateTime(new Date())} por el sistema.</div>
        <div class="signature">Firma del cliente</div>
      </section>
    </main>
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
  if (!res.success) toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
}

async function verPdf(apartado: any) {
  generandoPdf.value = true
  try {
    const nombre = `Apartado_${apartado?.no_factura || apartado?.id || 'sin_numero'}.pdf`
    const res = await window.electron.invoke('generate:pdf', buildApartadoPdfHtml(apartado), nombre) as { success: boolean; dataUrl?: string; error?: string }
    if (!res.success || !res.dataUrl) throw new Error(res.error || 'No se pudo generar el PDF')
    const blob = await (await fetch(res.dataUrl)).blob()
    await abrirPdf(URL.createObjectURL(blob), nombre)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo generar el PDF', life: 3000 })
  } finally {
    generandoPdf.value = false
  }
}

defineExpose({ verPdf, buildApartadoPdfHtml })
</script>

<template>
  <div style="display:none">
    <Toast />
  </div>

  <Dialog
    v-model:visible="dialogPdf"
    header="Vista Previa - Apartado PDF"
    modal
    :style="{ width: '82vw', height: '90vh' }"
    :draggable="false"
    @hide="cerrarPdf"
  >
    <div class="flex flex-col h-full gap-3">
      <iframe
        v-if="pdfUrl"
        :src="pdfUrl"
        class="w-full flex-1 border-0 rounded-lg bg-white"
        style="min-height: 70vh"
        title="Apartado PDF"
      ></iframe>
    </div>
    <template #footer>
      <Button label="Cerrar" severity="secondary" text @click="cerrarPdf" />
      <Button label="Descargar PDF" icon="pi pi-download" @click="descargarPDF" />
    </template>
  </Dialog>
</template>
