<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted } from 'vue'
import { useRouter, useRoute } from 'vue-router'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import TicketFacturaPrint from './TicketFacturaPrint.vue'
import FacturaPdfPrint from './FacturaPdfPrint.vue'
import { encryptarPassword } from '@/funciones/funciones.js'

const router = useRouter()
const route = useRoute()
const toast = useToast()
const facturaId = computed(() => Number(route.params.id) || null)
const guardando = ref(false)
const facturaBloqueadaFiscal = ref(false)
const todosIds = ref<number[]>([])
const indiceActual = computed(() => {
  const idx = todosIds.value.indexOf(Number(facturaId.value))
  return idx
})

function navegar(id: number | null) {
  if (id) router.push(`/ventas/editar/${id}`)
}

const ticketPrintRef = ref<any>(null)
const facturaPdfRef = ref<any>(null)

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'POS' } catch { return 'POS' }
}

async function registrarAuditoria(accion: string, detalle: any = {}, resultado = 'OK') {
  try {
    await window.electron.invoke('auditoria:registrar', {
      modulo: 'ventas',
      accion,
      entidad: 'facturas',
      entidad_id: Number(facturaId.value || 0),
      referencia: form.value.no_factura || '',
      usuario: usuarioAuditoria(),
      detalle,
      resultado,
    })
  } catch (_) {}
}

async function sincronizarFactura(datos: any) {
  try {
    const cfgRes = await window.db.getAll('servidor_sync_config')
    const cfg = cfgRes.success && cfgRes.data?.length > 0 ? cfgRes.data[0] : null
    if (!cfg || !cfg.activo) return
    const tablasSync: string[] = cfg.tablas_sync ? JSON.parse(cfg.tablas_sync) : []
    if (!tablasSync.includes('facturas')) return
    const baseUrl = String(cfg.servidor_url || '').replace(/\/+$/, '') + (String(cfg.api_path || '/api2')).replace(/\/+$/, '')
    const tokenRaw = cfg.token_hash || '1234567890abc'
    const token = tokenRaw.startsWith('$2b$') ? tokenRaw : await encryptarPassword(tokenRaw, 10)
    const camposRes = await fetch(`${baseUrl}/campos/facturas`, { method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token } })
    if (!camposRes.ok) return
    const camposArr = await camposRes.json()
    const campos: string[] = (Array.isArray(camposArr) ? camposArr : []).map((c: any) => typeof c === 'string' ? c : (c.nombre || c.field || c.Field || '')).filter(Boolean)
    if (datos.productos && typeof datos.productos === 'string') { try { JSON.parse(datos.productos) } catch { datos.productos = JSON.stringify(datos.productos) } }
    if (datos.otro && typeof datos.otro !== 'string') datos.otro = JSON.stringify(datos.otro)
    const enviar: Record<string, any> = {}
    for (const campo of campos) {
      if (campo === 'id') continue
      if (datos[campo] !== undefined && datos[campo] !== null && datos[campo] !== '') enviar[campo] = String(datos[campo])
    }
    const existeRes = await fetch(`${baseUrl}/datoscampo/facturas/no_factura/${encodeURIComponent(datos.no_factura || '')}`, {
      method: 'GET', headers: { 'Accept': '*/*', 'Authorization': token },
    })
    let servidorId: string | null = null
    if (existeRes.ok) {
      try {
        const existeData = await existeRes.json()
        const existente = Array.isArray(existeData) ? existeData[0] : existeData?.data || existeData
        if (existente?.id) servidorId = String(existente.id)
      } catch {}
    }
    if (servidorId) {
      enviar.id = servidorId
      await fetch(`${baseUrl}/actualizarcampos/facturas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    } else {
      await fetch(`${baseUrl}/insertar/facturas`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Accept': '*/*', 'Authorization': token },
        body: JSON.stringify(enviar),
      })
    }
  } catch {}
}

function imprimirTicket() {
  registrarAuditoria('imprimir_ticket_edicion')
  ticketPrintRef.value?.printTicket(form.value)
}

function imprimirPdf() {
  registrarAuditoria('generar_pdf_edicion')
  facturaPdfRef.value?.printFactura(form.value)
}

const productosParsed = computed(() => {
  try {
    const p = JSON.parse(form.value.productos || '[]')
    return Array.isArray(p) ? p : []
  } catch { return [] }
})

const metodosPago = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Mixto', value: 'MIXTO' },
]

const tiposFactura = [
  { label: 'Factura de Venta', value: 'FACTURA_VENTA' },
  { label: 'Factura de Compra', value: 'FACTURA_COMPRA' },
  { label: 'Cotizacion', value: 'COTIZACION' },
  { label: 'Sin Comprobante', value: 'SIN COMPROBANTE' },
]

const estadosFactura = [
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'Pagada', value: 'PAGADA' },
  { label: 'Credito', value: 'CREDITO' },
  { label: 'Anulada', value: 'ANULADA' },
  { label: 'Cotizacion', value: 'COTIZACION' },
  { label: 'Convertida', value: 'CONVERTIDA' },
]

const form = ref({
  no_factura: '', nombre_cliente: '', telefono_cliente: '', cod_cliente: '',
  tipo_factura: 'FACTURA_VENTA', comprobante: '', metodo_pago: 'EFECTIVO',
  efectivo: 0, tarjeta: 0, transferencia: 0, cheque: 0,
  total: 0, subtotal: 0, costo: 0, impuesto: 0, descuento: 0, ganancia: 0,
  estado_factura: 'PENDIENTE', fecha_emision: new Date(), fecha_estado: new Date(),
  hora: '', vendedor: '', cajero: '', usuario: '', canal_venta: 'LOCAL',
  nota: '', productos: '', otro: '', token: '', financiera: '',
  mes: '', year: '', total_institucion: 0, total_cliente: 0, identificadordb: '',
})

function getAlanubeOtroFactura(factura: any): any {
  try {
    const otro = typeof factura?.otro === 'string' ? JSON.parse(factura.otro || '{}') : factura?.otro || {}
    return otro || {}
  } catch {
    return {}
  }
}

function esFacturaElectronicaAceptadaLocal(factura: any): boolean {
  const tipo = String(factura?.tipo_comprobante || factura?.comprobante || '').toUpperCase()
  const otro = getAlanubeOtroFactura(factura)
  const response = otro?.alanube_response || {}
  const legalStatus = String(
    factura?.legal_status ||
    factura?.alanube_legal_status ||
    factura?.ecf_legal_status ||
    otro?.legal_status ||
    response?.legalStatus ||
    response?.legal_status ||
    ''
  ).toUpperCase()
  return tipo.startsWith('E') && legalStatus === 'ACCEPTED'
}

async function esFacturaElectronicaAceptada(factura: any): Promise<boolean> {
  if (!factura?.id) return false
  if (esFacturaElectronicaAceptadaLocal(factura)) return true
  try {
    const res = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [factura.id])
    const ecf = res?.success && Array.isArray(res.data) ? res.data[0] : null
    return String(ecf?.legal_status || '').toUpperCase() === 'ACCEPTED'
  } catch {
    return false
  }
}

function parseDate(val: any): Date {
  if (!val) return new Date()
  const d = new Date(val)
  return isNaN(d.getTime()) ? new Date() : d
}

function dateToStr(d: any): string {
  if (!d) return ''
  if (typeof d === 'string') return d
  if (isNaN(d.getTime?.())) return ''
  return d.toISOString().split('T')[0]
}

async function cargarDatos() {
  facturaBloqueadaFiscal.value = false
  const res = await window.db.getAll('facturas')
  if (res.success && res.data) {
    todosIds.value = res.data.map((r: any) => r.id).sort((a: number, b: number) => a - b)
    if (facturaId.value) {
      const f = res.data.find((r: any) => r.id === facturaId.value)
      if (f) {
        form.value = {
          cheque: f.cheque || '', token: f.token || '', cajero: f.cajero || '',
          no_factura: f.no_factura || '', tipo_factura: f.tipo_factura || 'FACTURA_VENTA',
          comprobante: f.comprobante || '', cod_cliente: f.cod_cliente || '',
          nombre_cliente: f.nombre_cliente || '', telefono_cliente: f.telefono_cliente || '',
          productos: f.productos || '', vendedor: f.vendedor || '',
          metodo_pago: f.metodo_pago || 'EFECTIVO', tarjeta: f.tarjeta || 0,
          transferencia: f.transferencia || 0, efectivo: f.efectivo || 0,
          canal_venta: f.canal_venta || 'LOCAL', fecha_emision: parseDate(f.fecha_emision),
          impuesto: f.impuesto || 0, descuento: f.descuento || 0, subtotal: f.subtotal || 0, costo: f.costo || 0,
          total: f.total || 0, ganancia: f.ganancia || 0, financiera: f.financiera || '',
          estado_factura: f.estado_factura || 'PENDIENTE',
          fecha_estado: parseDate(f.fecha_estado), mes: f.mes || '', year: f.year || '',
          hora: f.hora || '', otro: f.otro || '', nota: f.nota || '', usuario: f.usuario || '',
          identificadordb: f.identificadordb || '', total_institucion: f.total_institucion || 0,
          total_cliente: f.total_cliente || 0,
        }
        facturaBloqueadaFiscal.value = await esFacturaElectronicaAceptada(f)
        if (facturaBloqueadaFiscal.value) {
          await registrarAuditoria('abrir_edicion_bloqueada', { motivo: 'DGII_ACCEPTED' }, 'BLOQUEADO')
          toast.add({
            severity: 'info',
            summary: 'Solo lectura',
            detail: 'Esta factura electronica fue aceptada por DGII y no puede modificarse.',
            life: 4500,
          })
        }
      }
    }
  }
}

async function guardar() {
  if (facturaBloqueadaFiscal.value) {
    await registrarAuditoria('guardar_edicion_bloqueada', { motivo: 'DGII_ACCEPTED' }, 'BLOQUEADO')
    toast.add({
      severity: 'warn',
      summary: 'Factura fiscal bloqueada',
      detail: 'Esta factura electronica fue aceptada por DGII. Usa reimpresion o nota de credito.',
      life: 4500,
    })
    return
  }
  if (!form.value.no_factura.trim() && !form.value.nombre_cliente.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'No. factura o nombre del cliente requerido', life: 3000 })
    return
  }
  guardando.value = true
  try {
    const data = {
      cheque: form.value.cheque.trim(), token: form.value.token.trim(),
      cajero: form.value.cajero.trim().toUpperCase(), no_factura: form.value.no_factura.trim().toUpperCase(),
      tipo_factura: form.value.tipo_factura, comprobante: form.value.comprobante.trim(),
      cod_cliente: form.value.cod_cliente.trim().toUpperCase(),
      nombre_cliente: form.value.nombre_cliente.trim().toUpperCase(),
      telefono_cliente: form.value.telefono_cliente.trim(), productos: form.value.productos,
      vendedor: form.value.vendedor.trim().toUpperCase(), metodo_pago: form.value.metodo_pago,
      tarjeta: form.value.tarjeta || 0, transferencia: form.value.transferencia || 0,
      efectivo: form.value.efectivo || 0, canal_venta: form.value.canal_venta,
      fecha_emision: dateToStr(form.value.fecha_emision), impuesto: form.value.impuesto || 0,
      descuento: form.value.descuento || 0, subtotal: form.value.subtotal || 0, costo: form.value.costo || 0,
      total: form.value.total || 0, ganancia: form.value.ganancia || 0,
      financiera: form.value.financiera, estado_factura: form.value.estado_factura,
      fecha_estado: dateToStr(form.value.fecha_estado), mes: form.value.mes, year: form.value.year,
      hora: form.value.hora, otro: form.value.otro, nota: form.value.nota,
      usuario: form.value.usuario, identificadordb: form.value.identificadordb || '',
      total_institucion: form.value.total_institucion || 0, total_cliente: form.value.total_cliente || 0,
    }
    const res = await window.db.update('facturas', facturaId.value!, data)
    if (res.success) {
      await registrarAuditoria('editar_factura', { campos: Object.keys(data) }, 'OK')
      toast.add({ severity: 'success', summary: 'Actualizada', detail: 'Factura actualizada', life: 3000 })
      await sincronizarFactura(data)
    } else {
      await registrarAuditoria('editar_factura', { error: res.error || '' }, 'ERROR')
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

onMounted(cargarDatos)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto space-y-5">
    <Toast />
    <section class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-gradient-to-br from-primary-50 via-surface-0 to-surface-0 dark:from-primary-950/30 dark:via-surface-900 dark:to-surface-900 p-4 sm:p-5 shadow-sm">
      <div class="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
        <div class="flex items-center gap-3">
          <Button icon="pi pi-arrow-left" severity="secondary" text rounded @click="router.push('/ventas')" v-tooltip="'Volver a ventas'" />
          <div>
            <div class="flex items-center gap-2">
              <h1 class="text-xl font-bold text-surface-900 dark:text-surface-0">Editar factura</h1>
              <span class="rounded-full bg-primary-100 px-2 py-0.5 text-[11px] font-bold text-primary-700 dark:bg-primary-900/50 dark:text-primary-200">{{ form.no_factura || 'SIN NUMERO' }}</span>
            </div>
            <p class="mt-1 text-sm text-surface-500">Consulta, actualiza e imprime la informacion de la venta.</p>
          </div>
        </div>
        <div class="flex flex-wrap items-center gap-1.5">
          <div class="mr-1 flex items-center rounded-lg border border-surface-200 bg-surface-0 p-0.5 dark:border-surface-700 dark:bg-surface-800">
            <Button icon="pi pi-angle-double-left" severity="secondary" text rounded size="small" :disabled="indiceActual <= 0" @click="navegar(todosIds[0])" v-tooltip="'Primera'" />
            <Button icon="pi pi-angle-left" severity="secondary" text rounded size="small" :disabled="indiceActual <= 0" @click="navegar(todosIds[indiceActual - 1])" v-tooltip="'Anterior'" />
            <span class="min-w-14 px-1 text-center text-xs font-medium text-surface-500">{{ indiceActual + 1 }} / {{ todosIds.length }}</span>
            <Button icon="pi pi-angle-right" severity="secondary" text rounded size="small" :disabled="indiceActual >= todosIds.length - 1" @click="navegar(todosIds[indiceActual + 1])" v-tooltip="'Siguiente'" />
            <Button icon="pi pi-angle-double-right" severity="secondary" text rounded size="small" :disabled="indiceActual >= todosIds.length - 1" @click="navegar(todosIds[todosIds.length - 1])" v-tooltip="'Ultima'" />
          </div>
          <Button icon="pi pi-print" severity="secondary" outlined rounded @click="imprimirTicket" v-tooltip="'Imprimir ticket'" />
          <Button icon="pi pi-file-pdf" severity="danger" outlined rounded @click="imprimirPdf" v-tooltip="'Generar PDF'" />
          <Button label="Guardar cambios" icon="pi pi-check" :loading="guardando" :disabled="facturaBloqueadaFiscal" @click="guardar" />
        </div>
      </div>
    </section>

    <div v-if="facturaBloqueadaFiscal" class="flex items-start gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-900/20 dark:text-amber-200">
      <i class="pi pi-lock mt-0.5"></i>
      <span>Esta factura electronica fue aceptada por DGII. Solo puede reimprimirse o corregirse con una nota de credito.</span>
    </div>

    <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5">
      <div class="mb-4 flex items-center gap-2">
        <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-300"><i class="pi pi-file-edit"></i></span>
        <div><h2 class="font-semibold">Datos de la factura</h2><p class="text-xs text-surface-500">Identificacion, cliente y estado de la venta.</p></div>
      </div>
      <div class="grid grid-cols-1 gap-4 md:grid-cols-3">
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">No. Factura</label>
        <InputText v-model="form.no_factura" placeholder="No. factura" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Tipo Factura</label>
        <Select v-model="form.tipo_factura" :options="tiposFactura" optionLabel="label" optionValue="value" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Comprobante</label>
        <InputText v-model="form.comprobante" placeholder="NCF" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      <div class="flex flex-col gap-1 md:col-span-3">
        <label class="font-semibold text-sm">Cliente</label>
        <InputText v-model="form.nombre_cliente" placeholder="Nombre del cliente" :disabled="facturaBloqueadaFiscal" fluid class="uppercase" style="text-transform: uppercase;" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Codigo Cliente</label>
        <InputText v-model="form.cod_cliente" placeholder="RNC / Cedula" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Telefono</label>
        <InputText v-model="form.telefono_cliente" placeholder="Telefono" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Vendedor</label>
        <InputText v-model="form.vendedor" placeholder="Vendedor" :disabled="facturaBloqueadaFiscal" fluid class="uppercase" style="text-transform: uppercase;" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Metodo Pago</label>
        <Select v-model="form.metodo_pago" :options="metodosPago" optionLabel="label" optionValue="value" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Estado</label>
        <Select v-model="form.estado_factura" :options="estadosFactura" optionLabel="label" optionValue="value" :disabled="facturaBloqueadaFiscal" fluid />
      </div>
      </div>
    </section>

    <div class="grid grid-cols-1 gap-5 lg:grid-cols-5">
      <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5 lg:col-span-3">
        <div class="mb-4 flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-100 text-violet-600 dark:bg-violet-950/50 dark:text-violet-300"><i class="pi pi-credit-card"></i></span>
          <div><h2 class="font-semibold">Distribucion del pago</h2><p class="text-xs text-surface-500">Registra los montos recibidos por cada metodo.</p></div>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Efectivo</label>
        <InputNumber v-model="form.efectivo" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Tarjeta</label>
        <InputNumber v-model="form.tarjeta" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Transferencia</label>
        <InputNumber v-model="form.transferencia" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Cheque</label>
        <InputNumber v-model="form.cheque" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
        </div>
      </section>

      <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5 lg:col-span-2">
        <div class="mb-4 flex items-center gap-2">
          <span class="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-100 text-emerald-600 dark:bg-emerald-950/50 dark:text-emerald-300"><i class="pi pi-chart-line"></i></span>
          <div><h2 class="font-semibold">Resumen financiero</h2><p class="text-xs text-surface-500">Totales y rentabilidad de la factura.</p></div>
        </div>
        <div class="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-1">
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Subtotal</label>
        <InputNumber v-model="form.subtotal" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Total</label>
        <InputNumber v-model="form.total" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Costo</label>
        <InputNumber v-model="form.costo" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Impuesto</label>
        <InputNumber v-model="form.impuesto" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Descuento</label>
        <InputNumber v-model="form.descuento" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Ganancia</label>
        <InputNumber v-model="form.ganancia" :disabled="facturaBloqueadaFiscal" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid @focus="(e: any) => e.target.select()" />
      </div>
        </div>
      </section>
    </div>

    <section v-if="productosParsed.length" class="overflow-hidden rounded-2xl border border-surface-200 bg-surface-0 shadow-sm dark:border-surface-700 dark:bg-surface-900">
      <div class="flex items-center justify-between border-b border-surface-200 px-4 py-4 dark:border-surface-700 sm:px-5">
        <div class="flex items-center gap-2"><span class="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-300"><i class="pi pi-shopping-bag"></i></span><div><h2 class="font-semibold">Productos</h2><p class="text-xs text-surface-500">Detalle de los articulos facturados.</p></div></div>
        <span class="rounded-full bg-surface-100 px-2.5 py-1 text-xs font-semibold text-surface-600 dark:bg-surface-800 dark:text-surface-300">{{ productosParsed.length }} items</span>
      </div>
      <DataTable :value="productosParsed" stripedRows size="small" responsiveLayout="scroll" class="text-sm">
        <Column field="nombre" header="Producto">
          <template #body="{ data }">{{ data.nombre || data.descripcion || data.producto || '—' }}</template>
        </Column>
        <Column field="cantidad" header="Cant" style="width: 4rem" />
        <Column field="precio" header="Precio" style="width: 7rem">
          <template #body="{ data }">{{ $formatMoney(data.precio || data.precio_venta || 0) }}</template>
        </Column>
        <Column field="total" header="Total" style="width: 7rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
      </DataTable>
    </section>

    <section class="rounded-2xl border border-surface-200 bg-surface-0 p-4 shadow-sm dark:border-surface-700 dark:bg-surface-900 sm:p-5">
      <div class="mb-3 flex items-center gap-2"><span class="flex h-8 w-8 items-center justify-center rounded-lg bg-surface-100 text-surface-600 dark:bg-surface-800 dark:text-surface-300"><i class="pi pi-comment"></i></span><h2 class="font-semibold">Notas internas</h2></div>
      <div class="flex flex-col gap-1">
        <label class="font-semibold text-sm">Nota</label>
        <textarea v-model="form.nota" :disabled="facturaBloqueadaFiscal" class="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500 resize-none disabled:opacity-60" rows="2" />
      </div>
    </section>

    <div class="flex justify-end gap-2 pb-2">
      <Button label="Cancelar" severity="secondary" text @click="router.push('/ventas')" />
      <Button label="Guardar cambios" icon="pi pi-check" :loading="guardando" :disabled="facturaBloqueadaFiscal" @click="guardar" />
    </div>

    <TicketFacturaPrint ref="ticketPrintRef" />
    <FacturaPdfPrint ref="facturaPdfRef" />
  </div>
</template>
