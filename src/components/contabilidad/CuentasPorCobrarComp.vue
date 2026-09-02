<script setup lang="ts">
import { getSystemCurrencyCode, getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputOtp from 'primevue/inputotp'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Fieldset from 'primevue/fieldset'
import Menu from 'primevue/menu'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import TicketCuentaCobrarPrint from './TicketCuentaCobrarPrint.vue'
import { matchesSearch } from '@/composables/useSearch'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import Swal from 'sweetalert2'
import { resolvePrintableImage } from '@/services/printImageService'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'
import { reintegrarInventarioFactura } from '@/composables/useDevoluciones'

const toast = useToast()
const router = useRouter()
const { filterByAlmacen, addAlmacenId, store: almacenStore } = useAlmacenFilter()
const cuentas = ref<any[]>([])
const loading = ref(false)
const busqueda = ref('')
const filtroEstado = ref('ACTIVA')
const verTodosAlmacenes = ref(false)

const selectedCuentas = ref<any[]>([])

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'cuentas_cobrar', entity: 'cuentas_cobrar', label: 'cuenta por cobrar',
  selection: selectedCuentas, reload: cargarCuentas,
  reference: (item: any) => item.no_factura || String(item.id || ''),
  afterUpdate: moverFacturaRelacionada,
})
const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')
const cuentaParaEliminar = ref<any>(null)
const eliminarFacturaAsociada = ref(false)

const dialogPago = ref(false)
const cuentaSelected = ref<any>(null)
const montoPago = ref(0)
const metodoPago = ref('EFECTIVO')
const bancos = ref<any[]>([])
const bancoSeleccionado = ref<number | null>(null)
const cargandoBancos = ref(false)
const metodosPagoAbono = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Tarjeta', value: 'TARJETA' },
]
const guardando = ref(false)
const productosFactura = ref<any[]>([])
const facturaRelacionada = ref<any>(null)

const bancoSeleccionadoInfo = computed(() =>
  bancos.value.find((banco: any) => Number(banco.id) === Number(bancoSeleccionado.value)) || null
)

async function cargarBancos() {
  cargandoBancos.value = true
  try {
    const res = await window.db.getAll('bancos')
    if (!res.success) throw new Error(res.error || 'No se pudieron cargar los bancos')
    bancos.value = (res.data || [])
      .filter((banco: any) => banco.activo === undefined || Number(banco.activo) !== 0)
      .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
  } catch (error: any) {
    bancos.value = []
    toast.add({ severity: 'error', summary: 'Bancos', detail: error?.message || 'No se pudieron cargar los bancos', life: 3000 })
  } finally {
    cargandoBancos.value = false
  }
}

const dialogTelefono = ref(false)
const telefonoInput = ref('')
const cuentaTelefonoPendiente = ref<any>(null)

const generandoPdf = ref(false)
const actionMenu = ref()
const cuentaAccion = ref<any>(null)
const actionMenuItems = ref([
  { label: 'Editar cuenta por cobrar', icon: 'pi pi-pencil', command: () => editarCuenta(cuentaAccion.value) },
  { label: 'PDF Estado de Cuenta', icon: 'pi pi-file-pdf', command: () => generarPdfEstadoCuenta(cuentaAccion.value) },
  { label: 'Imprimir Recibo', icon: 'pi pi-print', command: () => imprimirEstadoCuenta(cuentaAccion.value) },
  { label: 'WhatsApp', icon: 'pi pi-whatsapp', command: () => enviarWhatsApp(cuentaAccion.value) },
  { label: 'Notificar Pago', icon: 'pi pi-bell', command: () => notificarCliente(cuentaAccion.value) },
  { separator: true },
  { label: 'Eliminar', icon: 'pi pi-trash', command: () => confirmarBorrar(cuentaAccion.value) },
])

function perteneceMismoAlmacen(item: any, cuenta: any): boolean {
  if (cuenta?.almacen_uid && item?.almacen_uid) return String(item.almacen_uid) === String(cuenta.almacen_uid)
  return Number(item?.almacen_id || 0) === Number(cuenta?.almacen_id || 0)
}

async function facturaElectronicaAceptada(factura: any): Promise<boolean> {
  if (!factura?.id) return false
  try {
    const otro = typeof factura.otro === 'string' ? JSON.parse(factura.otro || '{}') : factura.otro || {}
    const response = otro?.alanube_response || {}
    const estadoLocal = String(
      factura.legal_status || factura.alanube_legal_status || factura.ecf_legal_status ||
      factura?._ecf?.legal_status || otro?.legal_status || response?.legalStatus || response?.legal_status || ''
    ).toUpperCase()
    if (estadoLocal === 'ACCEPTED') return true
  } catch {}
  try {
    const res = await window.db.getWhere('facturas_ecf', 'factura_id = ?', [factura.id])
    const ecf = res?.success && Array.isArray(res.data) ? res.data[0] : null
    return String(ecf?.legal_status || '').toUpperCase() === 'ACCEPTED'
  } catch {
    return false
  }
}

async function moverFacturaRelacionada(cuenta: any, destino: { id: number; uid: string }) {
  const res = await window.db.getAll('facturas')
  if (!res.success) throw new Error(res.error || 'No se pudo localizar la factura relacionada')
  const factura = (res.data || []).find((item: any) =>
    String(item.no_factura || '') === String(cuenta.no_factura || '') && perteneceMismoAlmacen(item, cuenta)
  )
  if (!factura?.id) return
  const actualizado = await window.db.update('facturas', factura.id, {
    almacen_id: destino.id,
    almacen_uid: destino.uid,
  })
  if (!actualizado.success) throw new Error(actualizado.error || `No se pudo mover la factura ${cuenta.no_factura || ''}`)
}

async function editarCuenta(cuenta: any) {
  if (!cuenta) return
  try {
    const res = await window.db.getAll('facturas')
    const factura = res.success
      ? (res.data || []).find((item: any) => String(item.no_factura || '') === String(cuenta.no_factura || '') && perteneceMismoAlmacen(item, cuenta))
      : null
    if (!factura?.id) {
      toast.add({ severity: 'warn', summary: 'Factura no encontrada', detail: 'No se encontro la factura relacionada con esta cuenta', life: 3500 })
      return
    }
    await router.push({ name: 'editar-cuenta-cobrar', params: { facturaId: factura.id } })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo abrir la cuenta por cobrar', life: 3500 })
  }
}

function toggleActionMenu(event: Event, cuenta: any) {
  cuentaAccion.value = cuenta
  actionMenu.value.toggle(event)
}

const ticketRef = ref<InstanceType<typeof TicketCuentaCobrarPrint> | null>(null)

const estados = [
  { label: 'Todas', value: '' },
  { label: 'Activa', value: 'ACTIVA' },
  { label: 'Pagada', value: 'PAGADA' },
  { label: 'Vencida', value: 'VENCIDA' },
]

const cuentasFiltradas = computed(() => {
  let data = cuentas.value
  if (busqueda.value) data = data.filter(c => matchesSearch(c, busqueda.value, ['nombre_cliente', 'no_factura', 'telefono_cliente', 'cod_cliente', 'estado']))
  if (filtroEstado.value) {
    data = data.filter(c => c.estado === filtroEstado.value)
  }
  return data
})

const cuentasParaEliminar = computed(() => {
  if (cuentaParaEliminar.value) return [cuentaParaEliminar.value]
  return selectedCuentas.value || []
})

const totalSeleccionadoEliminar = computed(() =>
  cuentasParaEliminar.value.reduce((sum, c) => sum + Number(c?.total || 0), 0)
)

function formatCurrency(n: number): string {
  return Number(n || 0).toLocaleString(getSystemLocale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const d = new Date(fechaStr)
  if (isNaN(d.getTime())) return fechaStr
  return `${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}/${d.getFullYear()}`
}

function valoresUnicos(valorPlural: any, valorSingular: any): string[] {
  const valores = Array.isArray(valorPlural) && valorPlural.length ? valorPlural : (valorSingular ? [valorSingular] : [])
  return [...new Set(valores.map((v: any) => String(v || '').trim()).filter(Boolean))]
}

function detalleVarianteProducto(prod: any): string {
  const imeis = valoresUnicos(prod?.imeis, prod?.imei)
  const seriales = valoresUnicos(prod?.seriales, prod?.serial)
  const capacidades = valoresUnicos(prod?.capacidades, prod?.capacidad)
  const colores = valoresUnicos(prod?.colores, prod?.color)
  return [
    imeis.length ? `IMEI: ${imeis.join(', ')}` : '',
    seriales.length ? `Serial: ${seriales.join(', ')}` : '',
    capacidades.length ? `Capacidad: ${capacidades.join(', ')}` : '',
    colores.length ? `Color: ${colores.join(', ')}` : '',
  ].filter(Boolean).join(' · ')
}

function buildEstadoCuentaHtml(cuenta: any, empresa: any, pagos: any[], productos: any[] = [], logoResuelto = ''): string {
  const logo = logoResuelto || String(empresa?.logoprinter || empresa?.logo || '').trim()
  const ahora = new Date()
  const fecha = `${String(ahora.getDate()).padStart(2, '0')}/${String(ahora.getMonth() + 1).padStart(2, '0')}/${ahora.getFullYear()} ${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
  const pagosHtml = pagos.map((p: any, i: number) => `
    <tr>
      <td class="text-center">${i + 1}</td>
      <td class="text-center">${p.fecha || ''} ${p.hora || ''}</td>
      <td>${p.metodo || p.metodo_pago || 'ABONO'}${p.banco_nombre ? `<small>${p.banco_nombre}${p.banco_numero_cuenta ? ` · ${p.banco_numero_cuenta}` : ''}</small>` : ''}</td>
      <td>${p.nota || ''}</td>
      <td class="text-right">${getSystemCurrencyCode()} ${formatCurrency(p.monto || p.cantidad)}</td>
    </tr>
  `).join('')
  const productosHtml = productos.map((p: any, i: number) => {
    const cantidad = Number(p.cantidad || 1)
    const precio = Number(p.precio ?? p.precio_venta ?? 0)
    const identificador = detalleVarianteProducto(p)
    return `<tr><td>${i + 1}</td><td><strong>${p.nombre || p.descripcion || 'Producto'}</strong>${identificador ? `<small>${identificador}</small>` : ''}</td><td class="text-right">${cantidad}</td><td class="text-right">${getSystemCurrencyCode()} ${formatCurrency(precio)}</td><td class="text-right">${getSystemCurrencyCode()} ${formatCurrency(cantidad * precio)}</td></tr>`
  }).join('') || '<tr><td colspan="5" class="empty">Sin productos registrados</td></tr>'
  const total = Number(cuenta.total || 0)
  const abonado = Number(cuenta.abonado || 0)
  const porcentaje = total > 0 ? Math.min(100, (abonado / total) * 100) : 0
  const estado = Number(cuenta.saldo || 0) <= 0 ? 'PAGADA' : String(cuenta.estado || 'ACTIVA').toUpperCase()
  const estadoClass = estado === 'PAGADA' ? 'paid' : estado === 'VENCIDA' ? 'overdue' : 'active'
  return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Estado de Cuenta ${cuenta.no_factura || ''}</title>
  <style>
    * { box-sizing: border-box; }
    @page{size:A4;margin:12mm}body{margin:0;color:#172033;font-family:Arial,Helvetica,sans-serif;font-size:11px}.page{border:1px solid #d8e0ea;min-height:270mm}.header{background:linear-gradient(120deg,#102a43,#1e4f7a);color:#fff;padding:25px 30px;display:flex;justify-content:space-between;align-items:center}.brand{display:flex;align-items:center;gap:16px}.header img{width:72px;height:72px;object-fit:contain;background:#fff;border-radius:8px;padding:5px}.header h1{margin:0 0 4px;font-size:21px}.header p{margin:2px 0;color:#dbeafe}.document{text-align:right}.document small{letter-spacing:1.8px;color:#93c5fd}.document h2{font-size:24px;margin:5px 0}.content{padding:25px 30px}.info-grid{display:grid;grid-template-columns:1.3fr 1fr .6fr;gap:12px}.info-box{border:1px solid #dbe3ec;border-radius:8px;padding:13px 15px;background:#f8fafc}.info-box p{margin:4px 0}.label{display:block;text-transform:uppercase;letter-spacing:.8px;font-size:8px;font-weight:bold;color:#64748b;margin-bottom:6px}.status{display:inline-block;border-radius:99px;padding:6px 12px;font-weight:bold}.paid{background:#dcfce7;color:#166534}.active{background:#dbeafe;color:#1d4ed8}.overdue{background:#fee2e2;color:#b91c1c}.totals{display:grid;grid-template-columns:repeat(3,1fr);border:1px solid #dbe3ec;border-radius:10px;overflow:hidden;margin:16px 0}.total-card{padding:17px 18px;border-right:1px solid #dbe3ec}.total-card:last-child{border:0;background:#fff7ed}.total-card .label{font-size:9px}.total-card .value{font-size:22px;font-weight:bold}.progress{height:7px;background:#e5e7eb;border-radius:99px;overflow:hidden;margin-bottom:23px}.bar{height:100%;width:${porcentaje}%;background:#059669}.section{margin-top:22px}.section h3{font-size:13px;color:#102a43;border-bottom:2px solid #1e4f7a;padding-bottom:7px;text-transform:uppercase}table{width:100%;border-collapse:collapse}th{background:#edf3f8;color:#334e68;text-transform:uppercase;font-size:8px;text-align:left}th,td{padding:8px 7px;border-bottom:1px solid #e2e8f0}tbody tr:nth-child(even){background:#fafcff}td small{display:block;color:#64748b;margin-top:3px}.empty{text-align:center;color:#94a3b8;padding:20px}
    .text-center { text-align: center; }
    .text-right { text-align: right; }
    .footer{display:flex;justify-content:space-between;border-top:1px solid #dbe3ec;margin-top:26px;padding-top:10px;font-size:8px;color:#64748b}
  </style>
</head>
<body>
  <div class="page"><div class="header"><div class="brand">${logo ? `<img src="${logo}">` : ''}<div><h1>${empresa.nombre || 'MI EMPRESA'}</h1><p>${empresa.legal || ''}${empresa.rnc ? ` · RNC: ${empresa.rnc}` : ''}</p><p>${empresa.direccion || ''}</p><p>${empresa.telefono || ''}${empresa.email ? ` · ${empresa.email}` : ''}</p></div></div><div class="document"><small>DOCUMENTO FINANCIERO</small><h2>ESTADO DE CUENTA</h2><p>Factura #${cuenta.no_factura || cuenta.id}</p><p>Emitido: ${fecha}</p></div></div><div class="content">
    <div class="info-grid"><div class="info-box"><span class="label">Cliente</span><strong>${cuenta.nombre_cliente || 'CONSUMIDOR FINAL'}</strong><p>Codigo: ${cuenta.cod_cliente || '-'} · Telefono: ${cuenta.telefono_cliente || '-'}</p></div><div class="info-box"><span class="label">Informacion del credito</span><strong>Factura #${cuenta.no_factura || '-'}</strong><p>Venta: ${formatFecha(cuenta.fecha_venta) || '-'}</p><p>Vencimiento: ${formatFecha(cuenta.fecha_vencimiento) || '-'}</p></div><div class="info-box"><span class="label">Estado actual</span><span class="status ${estadoClass}">${estado}</span><p>${pagos.length} abono(s)</p></div></div>

    <div class="totals">
      <div class="total-card">
        <div class="label">Total</div>
        <div class="value" style="color:#2563eb;">${getSystemCurrencyCode()} ${formatCurrency(cuenta.total)}</div>
      </div>
      <div class="total-card">
        <div class="label">Abonado</div>
        <div class="value" style="color:#16a34a;">${getSystemCurrencyCode()} ${formatCurrency(cuenta.abonado)}</div>
      </div>
      <div class="total-card">
        <div class="label">Saldo Pendiente</div>
        <div class="value" style="color:#dc2626;">${getSystemCurrencyCode()} ${formatCurrency(cuenta.saldo)}</div>
      </div>
    </div>

    <div class="progress"><div class="bar"></div></div>
    <div class="section"><h3>Detalle de productos facturados</h3><table><thead><tr><th>#</th><th>Descripcion</th><th class="text-right">Cantidad</th><th class="text-right">Precio unitario</th><th class="text-right">Importe</th></tr></thead><tbody>${productosHtml}</tbody></table></div>
    <div class="section"><h3>Historial de abonos</h3>${pagos.length ? `<table>
      <thead>
        <tr><th>#</th><th>Fecha y hora</th><th>Metodo</th><th>Referencia / nota</th><th class="text-right">Monto</th></tr>
      </thead>
      <tbody>
        ${pagosHtml}
        <tr style="font-weight:700;background:#f9fafb;">
          <td colspan="4" class="text-right">Total Abonado:</td>
          <td class="text-right">${getSystemCurrencyCode()} ${formatCurrency(cuenta.abonado)}</td>
        </tr>
      </tbody>
    </table>` : '<div class="empty">Sin abonos registrados</div>'}</div>

    <div class="footer"><span>Este documento refleja los movimientos registrados hasta su fecha de emision.</span><span>Generado por TMPOS</span></div></div></div>
</body>
</html>`
}

async function generarPdfEstadoCuenta(cuenta: any) {
  generandoPdf.value = true
  try {
    let empresa: any = {}
    try {
      const res = await window.db.getAll('empresa')
      if (res.success && res.data?.length) empresa = res.data[0]
    } catch {}
    const pagos: any[] = []
    try {
      const p = JSON.parse(cuenta.pagos || '[]')
      if (Array.isArray(p)) pagos.push(...p)
    } catch {}
    let productos: any[] = []
    try {
      const facturasRes = await window.db.getAll('facturas')
      const factura = facturasRes.success
        ? (facturasRes.data || []).find((item: any) => String(item.no_factura || '') === String(cuenta.no_factura || '') && perteneceMismoAlmacen(item, cuenta))
        : null
      const detalle = typeof factura?.productos === 'string' ? JSON.parse(factura.productos || '[]') : factura?.productos
      productos = Array.isArray(detalle) ? detalle : []
    } catch {}
    const logo = await resolvePrintableImage(empresa?.logoprinter || empresa?.logo)
    const html = buildEstadoCuentaHtml(cuenta, empresa, pagos, productos, logo)
    const nombre = `Estado_Cuenta_${cuenta.no_factura || cuenta.id}.pdf`
    const res = await window.electron.invoke('generate:pdf', html, nombre) as { success: boolean; dataUrl?: string; error?: string }
    if (res.success && res.dataUrl) {
      const resp = await fetch(res.dataUrl)
      const blob = await resp.blob()
      const url = URL.createObjectURL(blob)
      const result = await Swal.fire({
        title: `Estado de Cuenta #${cuenta.no_factura || ''}`,
        html: `<iframe src="${url}" style="width:100%;height:75vh;border:0;border-radius:6px;background:#fff"></iframe>`,
        width: '90vw',
        padding: '1rem',
        showCancelButton: true,
        confirmButtonText: 'Descargar PDF',
        cancelButtonText: 'Cerrar',
        focusConfirm: false,
        customClass: { popup: 'swal-pdf-popup' },
      })
      if (result.isConfirmed) {
        const resp2 = await fetch(url)
        const blob2 = await resp2.blob()
        const buffer = await blob2.arrayBuffer()
        const bytes = new Uint8Array(buffer)
        let binary = ''
        for (let i = 0; i < bytes.length; i += 0x8000) binary += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
        const dataUrl = `data:application/pdf;base64,${btoa(binary)}`
        const saveRes = await window.electron.invoke('save:pdf', dataUrl, nombre) as { success: boolean; error?: string }
        if (saveRes.success) toast.add({ severity: 'success', summary: 'Guardado', detail: 'PDF descargado', life: 2000 })
        else toast.add({ severity: 'error', summary: 'Error', detail: saveRes.error || 'No se pudo guardar', life: 3000 })
      }
      URL.revokeObjectURL(url)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar el PDF', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al generar PDF', life: 3000 })
  } finally {
    generandoPdf.value = false
  }
}

function getEstadoSeverity(estado: string): 'success' | 'danger' | 'warn' | 'info' | undefined {
  switch (estado) {
    case 'ACTIVA': return 'warn'
    case 'PAGADA': return 'success'
    case 'VENCIDA': return 'danger'
    default: return 'info'
  }
}

async function cargarCuentas() {
  loading.value = true
  try {
    const res = await window.db.getAll('cuentas_cobrar')
    if (res.success) {
      cuentas.value = verTodosAlmacenes.value
        ? (res.data || [])
        : filterByAlmacen(res.data || [])
    }
  } catch (_) {}
  loading.value = false
}

watch(verTodosAlmacenes, () => {
  selectedCuentas.value = []
  cuentaSelected.value = null
  cargarCuentas()
})

function confirmarBorrar(cuenta: any) {
  cuentaParaEliminar.value = cuenta
  selectedCuentas.value = []
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  eliminarFacturaAsociada.value = false
  deleteDialogVisible.value = true
}

async function confirmarBorrarSeleccionadas() {
  if (!selectedCuentas.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una cuenta', life: 2500 })
    return
  }
  cuentaParaEliminar.value = null
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  eliminarFacturaAsociada.value = false
  deleteDialogVisible.value = true
}

async function solicitarOtpEliminarCuenta() {
  const cuentas = cuentasParaEliminar.value
  if (!cuentas.length) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: cuentas[0]?.id,
      facturaIds: cuentas.map(c => c.id),
      no_factura: cuentas.length === 1 ? cuentas[0]?.no_factura : '',
      nombre_cliente: cuentas.length === 1 ? cuentas[0]?.nombre_cliente : '',
      cantidad: cuentas.length,
      total: totalSeleccionadoEliminar.value,
    }) as any
    if (res.success) {
    deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (e: any) {
    deleteOtpError.value = e.message || 'Error solicitando codigo'
  } finally {
    deleteOtpLoading.value = false
  }
}

async function borrar() {
  try {
    const cuentas = cuentasParaEliminar.value
    if (!cuentas.length) return
    deleteOtpError.value = ''
    const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
    if (!/^\d{4}$/.test(codigo)) {
      deleteOtpError.value = 'Introduce el codigo de 4 digitos'
      return
    }
    deleteOtpConfirmando.value = true
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: cuentas[0]?.id,
      facturaIds: cuentas.map(c => c.id),
      codigo,
    }) as any
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    let facturasRelacionadas: any[] = []
    if (eliminarFacturaAsociada.value) {
      const facturasRes = await window.db.getAll('facturas')
      if (!facturasRes.success) throw new Error(facturasRes.error || 'No se pudieron localizar las facturas relacionadas')
      facturasRelacionadas = cuentas.map((cuenta) => (
        (facturasRes.data || []).find((factura: any) =>
          String(factura.no_factura || '') === String(cuenta.no_factura || '') && perteneceMismoAlmacen(factura, cuenta)
        ) || null
      ))
      for (const factura of facturasRelacionadas) {
        if (factura && await facturaElectronicaAceptada(factura)) {
          deleteOtpError.value = `La factura ${factura.no_factura || factura.id} fue aceptada por DGII y no puede eliminarse`
          return
        }
      }
    }

    let eliminadas = 0
    let facturasEliminadas = 0
    let inventariosConError = 0
    for (const cuenta of cuentas) {
      const index = cuentas.indexOf(cuenta)
      const factura = eliminarFacturaAsociada.value ? facturasRelacionadas[index] : null
      const res = factura?.id
        ? await window.db.delete('facturas', factura.id)
        : await window.db.delete('cuentas_cobrar', cuenta.id)
      if (res.success) {
        eliminadas++
        if (factura?.id) {
          facturasEliminadas++
          if (String(factura.tipo_factura || '').toUpperCase() === 'FACTURA_VENTA') {
            try {
              await reintegrarInventarioFactura(factura.productos)
            } catch {
              inventariosConError++
            }
          }
        }
      }
      else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || `No se pudo eliminar ${cuenta.no_factura || cuenta.id}`, life: 3000 })
        return
      }
    }
    toast.add({
      severity: inventariosConError ? 'warn' : 'success',
      summary: 'Exito',
      detail: `${eliminadas} cuenta(s) eliminada(s)${facturasEliminadas ? ` y ${facturasEliminadas} factura(s) asociada(s)` : ''}${inventariosConError ? '; revisa la restauracion del inventario' : ''}`,
      life: inventariosConError ? 5000 : 3000,
    })
    deleteDialogVisible.value = false
    selectedCuentas.value = []
    cuentaParaEliminar.value = null
    eliminarFacturaAsociada.value = false
    await cargarCuentas()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

const pagosHistorialParsed = computed(() => {
  if (!cuentaSelected.value) return []
  try {
    const p = JSON.parse(cuentaSelected.value.pagos || '[]')
    return Array.isArray(p) ? p : []
  } catch { return [] }
})

async function abrirPago(cuenta: any) {
  cuentaSelected.value = cuenta
  montoPago.value = cuenta.saldo
  metodoPago.value = 'EFECTIVO'
  bancoSeleccionado.value = null
  productosFactura.value = []
  facturaRelacionada.value = null
  dialogPago.value = true
  await cargarBancos()

  // Cargar factura relacionada y sus productos
  try {
    const res = await window.db.getAll('facturas')
    if (res.success && res.data) {
      const factura = res.data.find((f: any) => f.no_factura === cuenta.no_factura && perteneceMismoAlmacen(f, cuenta))
      if (factura) {
        facturaRelacionada.value = factura
        try {
          const prods = typeof factura.productos === 'string' ? JSON.parse(factura.productos) : factura.productos
          productosFactura.value = Array.isArray(prods) ? prods : []
        } catch { productosFactura.value = [] }
      }
    }
  } catch (_) {}
}

async function pagoCompleto() {
  if (!cuentaSelected.value || cuentaSelected.value.saldo <= 0) return
  montoPago.value = cuentaSelected.value.saldo
  await registrarPago()
}

async function registrarPago() {
  if (!cuentaSelected.value || montoPago.value <= 0) return
  if (montoPago.value > cuentaSelected.value.saldo) {
    toast.add({ severity: 'warn', summary: 'Monto excede el saldo', detail: `Saldo: $${formatCurrency(cuentaSelected.value.saldo)}`, life: 3000 })
    return
  }
  if (metodoPago.value === 'TRANSFERENCIA' && !bancoSeleccionadoInfo.value) {
    toast.add({ severity: 'warn', summary: 'Banco requerido', detail: 'Selecciona el banco que recibira la transferencia', life: 3000 })
    return
  }
  guardando.value = true
  try {
    const cuentaAlmacenUid = cuentaSelected.value.almacen_uid || almacenStore.activeUid || ''
    const turnoRes = await window.electron.invoke('caja:getTurnoActivo', cuentaAlmacenUid) as any
    if (!turnoRes?.success || !turnoRes.data?.id) {
      toast.add({ severity: 'warn', summary: 'Caja cerrada', detail: 'Abre un turno de caja antes de registrar el pago', life: 3500 })
      return
    }
    // Agregar pago al historial primero
    let pagosHistorial: any[] = []
    try {
      pagosHistorial = JSON.parse(cuentaSelected.value.pagos || '[]')
      if (!Array.isArray(pagosHistorial)) pagosHistorial = []
    } catch { pagosHistorial = [] }

    const ahora = new Date()
    const banco = metodoPago.value === 'TRANSFERENCIA' ? bancoSeleccionadoInfo.value : null
    const pagoNuevo = {
      nopago: pagosHistorial.length + 1,
      cantidad: montoPago.value,
      fecha: `${ahora.getFullYear()}-${String(ahora.getMonth() + 1).padStart(2, '0')}-${String(ahora.getDate()).padStart(2, '0')}`,
      hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`,
      metodo: metodoPago.value,
      banco_id: banco ? Number(banco.id) : 0,
      banco_uid: banco ? String(banco.uid || '') : '',
      banco_nombre: banco ? String(banco.nombre || '') : '',
      banco_numero_cuenta: banco ? String(banco.numero_cuenta || '') : '',
      turno_id: Number(turnoRes.data.id),
      almacen_uid: cuentaAlmacenUid,
      created_at: ahora.toISOString(),
    }
    pagosHistorial.push(pagoNuevo)

    // Recalcular abonado sumando todos los pagos
    const nuevoAbonado = pagosHistorial.reduce((sum: number, p: any) => sum + (Number(p.cantidad) || 0), 0)
    const nuevoSaldo = (cuentaSelected.value.total || 0) - nuevoAbonado
    const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'ACTIVA'

    const pagosAnteriores = String(cuentaSelected.value.pagos || '[]')
    const cuentaRes = await window.db.update('cuentas_cobrar', cuentaSelected.value.id, {
      abonado: nuevoAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      pagos: JSON.stringify(pagosHistorial),
    })
    if (!cuentaRes.success) throw new Error(cuentaRes.error || 'No se pudo registrar el abono')

    if (banco) {
      const saldoAnteriorBanco = Number(banco.saldo || 0)
      const bancoRes = await window.db.update('bancos', banco.id, {
        saldo: saldoAnteriorBanco + Number(montoPago.value),
        fecha_transaccion: ahora.toISOString(),
        updated_at: ahora.toISOString(),
      })
      if (!bancoRes.success) {
        await window.db.update('cuentas_cobrar', cuentaSelected.value.id, {
          abonado: Number(cuentaSelected.value.abonado || 0),
          saldo: Number(cuentaSelected.value.saldo || 0),
          estado: cuentaSelected.value.estado || 'ACTIVA',
          pagos: pagosAnteriores,
        })
        throw new Error(bancoRes.error || 'No se pudo acreditar la transferencia al banco')
      }
      banco.saldo = saldoAnteriorBanco + Number(montoPago.value)
    }

    // Actualizar el objeto local antes de imprimir para que el ticket tenga los pagos
    cuentaSelected.value.pagos = JSON.stringify(pagosHistorial)

    await ticketRef.value?.printTicket(cuentaSelected.value, montoPago.value, nuevoAbonado, nuevoSaldo)

    toast.add({ severity: 'success', summary: 'Pago registrado', detail: `$${formatCurrency(montoPago.value)} abonados`, life: 3000 })
    dialogPago.value = false
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

async function eliminarPago(index: number) {
  if (!cuentaSelected.value) return
  let pagosHistorial: any[] = []
  try {
    pagosHistorial = JSON.parse(cuentaSelected.value.pagos || '[]')
    if (!Array.isArray(pagosHistorial)) pagosHistorial = []
  } catch { pagosHistorial = [] }

  const pagoEliminado = pagosHistorial[index]
  if (!pagoEliminado) return

  pagosHistorial.splice(index, 1)
  // Renumerar
  pagosHistorial.forEach((p: any, i: number) => { p.nopago = i + 1 })

  // Recalcular abonado sumando todos los pagos restantes
  const nuevoAbonado = pagosHistorial.reduce((sum: number, p: any) => sum + (Number(p.cantidad) || 0), 0)
  const nuevoSaldo = (cuentaSelected.value.total || 0) - nuevoAbonado
  const nuevoEstado = nuevoSaldo <= 0 ? 'PAGADA' : 'ACTIVA'

  try {
    const cuentaRes = await window.db.update('cuentas_cobrar', cuentaSelected.value.id, {
      abonado: nuevoAbonado,
      saldo: nuevoSaldo,
      estado: nuevoEstado,
      pagos: JSON.stringify(pagosHistorial),
    })
    if (!cuentaRes.success) throw new Error(cuentaRes.error || 'No se pudo eliminar el abono')

    const esTransferencia = String(pagoEliminado.metodo || pagoEliminado.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA'
    if (esTransferencia && (pagoEliminado.banco_id || pagoEliminado.banco_uid)) {
      const bancosRes = await window.db.getAll('bancos')
      const banco = bancosRes.success
        ? (bancosRes.data || []).find((item: any) =>
            (pagoEliminado.banco_uid && String(item.uid || '') === String(pagoEliminado.banco_uid)) ||
            Number(item.id) === Number(pagoEliminado.banco_id)
          )
        : null
      if (!banco) {
        await window.db.update('cuentas_cobrar', cuentaSelected.value.id, {
          abonado: Number(cuentaSelected.value.abonado || 0),
          saldo: Number(cuentaSelected.value.saldo || 0),
          estado: cuentaSelected.value.estado || 'ACTIVA',
          pagos: String(cuentaSelected.value.pagos || '[]'),
        })
        throw new Error('No se encontro el banco asociado a la transferencia')
      }
      const bancoRes = await window.db.update('bancos', banco.id, {
        saldo: Number(banco.saldo || 0) - Number(pagoEliminado.cantidad || pagoEliminado.monto || 0),
        fecha_transaccion: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      if (!bancoRes.success) {
        await window.db.update('cuentas_cobrar', cuentaSelected.value.id, {
          abonado: Number(cuentaSelected.value.abonado || 0),
          saldo: Number(cuentaSelected.value.saldo || 0),
          estado: cuentaSelected.value.estado || 'ACTIVA',
          pagos: String(cuentaSelected.value.pagos || '[]'),
        })
        throw new Error(bancoRes.error || 'No se pudo revertir el movimiento bancario')
      }
    }
    cuentaSelected.value.abonado = nuevoAbonado
    cuentaSelected.value.saldo = nuevoSaldo
    cuentaSelected.value.estado = nuevoEstado
    cuentaSelected.value.pagos = JSON.stringify(pagosHistorial)
    montoPago.value = nuevoSaldo
    toast.add({ severity: 'info', summary: 'Pago eliminado', detail: `$${formatCurrency(pagoEliminado.cantidad)} removido`, life: 3000 })
    await cargarCuentas()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  }
}

async function imprimirEstadoCuenta(cuenta: any) {
  await ticketRef.value?.printTicket(cuenta, 0, cuenta.abonado || 0, cuenta.saldo || 0)
}

function enviarWhatsApp(cuenta: any) {
  const telefono = String(cuenta.telefono_cliente || '').replace(/\D/g, '')
  if (!telefono) {
    cuentaTelefonoPendiente.value = cuenta
    telefonoInput.value = ''
    dialogTelefono.value = true
    return
  }
  abrirWhatsApp(cuenta, telefono, '*ESTADO DE CUENTA*')
}

function abrirWhatsApp(cuenta: any, telefono: string, encabezado: string) {
  const abonos = pagosHistorialParsed.value || []
  const historial = abonos.map((p: any, i: number) => `${i + 1}. $${formatCurrency(p.cantidad)} - ${p.fecha || ''} ${p.hora || ''}`).join('\n')
  const msg = [
    encabezado,
    '',
    `Cliente: ${cuenta.nombre_cliente || ''}`,
    `Factura: ${cuenta.no_factura || ''}`,
    `Total: $${formatCurrency(cuenta.total)}`,
    `Abonado: $${formatCurrency(cuenta.abonado)}`,
    `Saldo pendiente: $${formatCurrency(cuenta.saldo)}`,
    '',
    historial ? '*Abonos realizados:*\n' + historial : '',
    '',
    'Gracias por su preferencia.',
  ].filter(Boolean).join('\n')
  window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(msg)}`, '_blank')
}

function notificarCliente(cuenta: any) {
  const telefono = String(cuenta.telefono_cliente || '').replace(/\D/g, '')
  if (!telefono) {
    cuentaTelefonoPendiente.value = { ...cuenta, _notificar: true }
    telefonoInput.value = ''
    dialogTelefono.value = true
    return
  }
  const msg = [
    '*RECORDATORIO DE PAGO*',
    '',
    `Hola ${cuenta.nombre_cliente || ''},`,
    `Tienes un saldo pendiente de $${formatCurrency(cuenta.saldo)} en la factura #${cuenta.no_factura || ''}.`,
    '',
    'Te recordamos realizar tu pago lo antes posible.',
    'Gracias.',
  ].filter(Boolean).join('\n')
  window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(msg)}`, '_blank')
}

async function confirmarTelefonoEnviar() {
  const tel = telefonoInput.value.replace(/\D/g, '')
  if (!tel || tel.length < 10) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un telefono valido (min 10 digitos)', life: 3000 })
    return
  }
  const cuenta = cuentaTelefonoPendiente.value
  if (!cuenta) return
  try {
    await window.db.update('cuentas_cobrar', cuenta.id, { telefono_cliente: tel })
    cuenta.telefono_cliente = tel
  } catch (_) {}
  if (cuenta._notificar) {
    notificarCliente(cuenta)
  } else {
    abrirWhatsApp(cuenta, tel, '*ESTADO DE CUENTA*')
  }
  dialogTelefono.value = false
  cuentaTelefonoPendiente.value = null
}

async function cambiarEstado(cuenta: any, estado: string) {
  await window.db.update('cuentas_cobrar', cuenta.id, { estado })
  cuenta.estado = estado
  toast.add({ severity: 'success', summary: 'Estado actualizado', detail: estado, life: 2000 })
}

onMounted(async () => {
  await almacenStore.load()
  await Promise.all([cargarCuentas(), cargarBancos()])
})

watch(metodoPago, (metodo) => {
  if (metodo !== 'TRANSFERENCIA') bancoSeleccionado.value = null
})
</script>

<template>
  <div>
    <Toast />
    <TicketCuentaCobrarPrint ref="ticketRef" />

    <Fieldset legend="Cuentas por Cobrar">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <span class="p-input-icon-left">
            <i class="pi pi-search"></i>
            <InputText v-model="busqueda" placeholder="Buscar factura o cliente..." />
          </span>
          <Select v-model="filtroEstado" :options="estados" optionLabel="label" optionValue="value" placeholder="Estado" class="w-32" fluid />
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button v-if="selectedCuentas.length" :label="`Cambiar almacén (${selectedCuentas.length})`" icon="pi pi-warehouse" severity="success" @click="abrirMoverAlmacen" />
          <Button
            v-if="selectedCuentas.length"
            :label="`Eliminar (${selectedCuentas.length})`"
            icon="pi pi-trash"
            severity="danger"
            @click="confirmarBorrarSeleccionadas"
          />
          <Button label="Actualizar" icon="pi pi-refresh" severity="secondary" @click="cargarCuentas" />
        </div>
      </div>

      <DataTable
        v-model:selection="selectedCuentas"
        :value="cuentasFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        @row-click="abrirPago($event.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="" style="width: 4rem">
          <template #body="{ data }">
            <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded @click.stop="toggleActionMenu($event, data)" v-tooltip="'Acciones'" />
          </template>
        </Column>
        <Column field="no_factura" header="Factura" sortable style="width: 8rem" />
        <Column field="nombre_cliente" header="Cliente" sortable />
        <Column field="total" header="Total" sortable style="width: 8rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column field="abonado" header="Abonado" sortable style="width: 8rem">
          <template #body="{ data }">{{ $formatMoney(data.abonado) }}</template>
        </Column>
        <Column field="saldo" header="Saldo" sortable style="width: 8rem">
          <template #body="{ data }">
            <span :class="data.saldo > 0 ? 'text-red-600 font-bold' : 'text-green-600'">{{ $formatMoney(data.saldo) }}</span>
          </template>
        </Column>
        <Column field="fecha_venta" header="Fecha" sortable style="width: 7rem">
          <template #body="{ data }">{{ formatFecha(data.fecha_venta) }}</template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width: 7rem">
          <template #body="{ data }">
            <Tag :value="data.estado" :severity="getEstadoSeverity(data.estado)" />
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay cuentas por cobrar.</div>
        </template>
      </DataTable>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedCuentas.length }}</strong> cuenta(s) por cobrar y sus facturas relacionadas:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover cuentas" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogPago" header="Registrar Pago" modal :style="{ width: '50rem' }">
      <div v-if="cuentaSelected" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Factura</span>
            <span class="font-semibold">{{ cuentaSelected.no_factura }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Cliente</span>
            <span class="font-semibold">{{ cuentaSelected.nombre_cliente }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Total</span>
            <span>{{ $formatMoney(cuentaSelected.total) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Abonado</span>
            <span class="text-green-600">{{ $formatMoney(cuentaSelected.abonado) }}</span>
          </div>
          <div class="flex justify-between font-bold border-t border-surface-200 dark:border-surface-700 pt-2">
            <span>Saldo pendiente</span>
            <span class="text-red-600">{{ $formatMoney(cuentaSelected.saldo) }}</span>
          </div>
        </div>

        <!-- Productos de la factura -->
        <div v-if="productosFactura.length > 0" class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm">
          <div class="font-semibold mb-2">Productos (Factura #{{ cuentaSelected.no_factura }})</div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div v-for="(prod, i) in productosFactura" :key="i" class="flex justify-between items-center py-1 border-b border-surface-100 dark:border-surface-800 last:border-0">
              <div class="min-w-0">
                <div>
                  <span class="font-semibold">{{ prod.nombre || prod.descripcion || prod.producto || 'Producto' }}</span>
                  <span class="text-surface-500 ml-2">x{{ prod.cantidad || prod.quantity || 1 }}</span>
                </div>
                <div v-if="detalleVarianteProducto(prod)" class="text-xs text-surface-500 truncate">{{ detalleVarianteProducto(prod) }}</div>
              </div>
              <span class="font-semibold shrink-0 ml-2">{{ $formatMoney(prod.total || ((prod.precio_venta || prod.precio_unitario || prod.precio || 0) * (prod.cantidad || prod.quantity || 1))) }}</span>
            </div>
          </div>
          <div v-if="facturaRelacionada" class="flex justify-between font-bold border-t border-surface-200 dark:border-surface-700 pt-2 mt-2">
            <span>Total factura</span>
            <span>{{ $formatMoney(facturaRelacionada.total) }}</span>
          </div>
        </div>

        <!-- Historial de abonos -->
        <div v-if="pagosHistorialParsed.length > 0" class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm">
          <div class="font-semibold mb-2">Abonos realizados</div>
          <div class="space-y-1 max-h-40 overflow-y-auto">
            <div v-for="(pago, index) in pagosHistorialParsed" :key="pago.nopago" class="flex justify-between items-center py-1 border-b border-surface-100 dark:border-surface-800 last:border-0">
              <div>
                <span class="font-semibold">#{{ pago.nopago }}</span>
                <span class="text-surface-500 ml-2">{{ pago.fecha }} {{ pago.hora }}</span>
                <div class="text-xs text-surface-500 mt-0.5">
                  {{ pago.metodo || pago.metodo_pago || 'ABONO' }}
                  <span v-if="pago.banco_nombre"> · {{ pago.banco_nombre }}<span v-if="pago.banco_numero_cuenta"> ({{ pago.banco_numero_cuenta }})</span></span>
                </div>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-green-600 font-semibold">{{ $formatMoney(pago.cantidad) }}</span>
                <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="eliminarPago(index)" v-tooltip="'Eliminar pago'" />
              </div>
            </div>
          </div>
        </div>
        <div v-else class="text-sm text-surface-400 text-center py-2">Sin abonos registrados</div>

        <!-- Monto a abonar -->
        <div v-if="cuentaSelected.saldo > 0" class="space-y-2">
          <div class="space-y-1">
            <label class="text-sm font-semibold">Monto a abonar (RD$)</label>
            <InputNumber v-model="montoPago" :min="0" :max="cuentaSelected.saldo" fluid @focus="(e: any) => e.target.select()" />
            <Select v-model="metodoPago" :options="metodosPagoAbono" optionLabel="label" optionValue="value" placeholder="Metodo de pago" fluid />
            <div v-if="metodoPago === 'TRANSFERENCIA'" class="rounded-lg border border-blue-200 dark:border-blue-800 bg-blue-50/70 dark:bg-blue-950/30 p-3 space-y-2">
              <label class="text-sm font-semibold text-blue-900 dark:text-blue-100">Banco que recibe la transferencia</label>
              <Select
                v-model="bancoSeleccionado"
                :options="bancos"
                optionLabel="nombre"
                optionValue="id"
                :loading="cargandoBancos"
                placeholder="Seleccionar banco..."
                emptyMessage="No hay bancos registrados"
                filter
                fluid
              >
                <template #option="slotProps">
                  <div class="flex justify-between items-center gap-4 w-full">
                    <div>
                      <div class="font-semibold">{{ slotProps.option.nombre }}</div>
                      <div v-if="slotProps.option.numero_cuenta" class="text-xs text-surface-500">{{ slotProps.option.numero_cuenta }}</div>
                    </div>
                    <span class="text-xs font-semibold text-surface-500">{{ $formatMoney(slotProps.option.saldo || 0) }}</span>
                  </div>
                </template>
              </Select>
              <p v-if="bancoSeleccionadoInfo" class="text-xs text-blue-700 dark:text-blue-300">
                El abono de {{ $formatMoney(montoPago || 0) }} se acreditara a {{ bancoSeleccionadoInfo.nombre }}.
              </p>
            </div>
          </div>

          <div class="flex gap-2 pt-1">
            <Button
              v-for="m in [Math.round(cuentaSelected.saldo * 0.25), Math.round(cuentaSelected.saldo / 2), cuentaSelected.saldo]"
              :key="m"
              :label="'$' + formatCurrency(m)"
              severity="secondary"
              text
              size="small"
              @click="montoPago = m"
            />
          </div>
        </div>
        <div v-else class="text-center py-2">
          <Tag value="PAGADA" severity="success" />
        </div>
      </div>
      <template #footer>
        <Button label="Imprimir" icon="pi pi-print" severity="info" text :disabled="!cuentaSelected" @click="imprimirEstadoCuenta(cuentaSelected)" />
        <Button label="WhatsApp" icon="pi pi-whatsapp" severity="success" text @click="enviarWhatsApp(cuentaSelected)" />
        <Button v-if="cuentaSelected?.saldo > 0" label="Pago Completo" icon="pi pi-wallet" severity="warn" :loading="guardando" @click="pagoCompleto" />
        <Button label="Cancelar" severity="secondary" text @click="dialogPago = false" />
        <Button v-if="cuentaSelected?.saldo > 0" label="Registrar Pago" icon="pi pi-check" :loading="guardando" :disabled="montoPago <= 0 || (metodoPago === 'TRANSFERENCIA' && !bancoSeleccionado)" @click="registrarPago" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Eliminar cuenta por cobrar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="cuentasParaEliminar.length === 1">Seguro que deseas eliminar la cuenta <strong>{{ cuentasParaEliminar[0]?.no_factura }}</strong>?</span>
          <span v-else>Seguro que deseas eliminar <strong>{{ cuentasParaEliminar.length }}</strong> cuentas seleccionadas?</span>
        </div>
        <div v-if="cuentasParaEliminar.length > 1" class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
          Total combinado: <strong>{{ $formatMoney(totalSeleccionadoEliminar) }}</strong>
        </div>
        <div class="flex items-center justify-between gap-4 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <div>
            <p class="text-sm font-semibold">Eliminar también la factura asociada</p>
            <p class="text-xs text-surface-500">Si la activas, se eliminarán ambos registros y se restaurará el inventario vendido.</p>
          </div>
          <ToggleSwitch v-model="eliminarFacturaAsociada" />
        </div>
        <div v-if="deleteOtpEnviado" class="flex flex-col items-center gap-3 rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <p class="text-xs text-surface-500 text-center">
            Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.
          </p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly mask />
        </div>
        <p v-if="deleteOtpError" class="text-red-500 text-xs text-center">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-envelope"
          severity="danger"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarCuenta"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          @click="borrar"
        />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogTelefono" header="Telefono del cliente" modal :style="{ width: '90%', maxWidth: '400px' }">
      <div class="space-y-3">
        <p class="text-sm text-surface-500">El cliente no tiene telefono registrado. Ingresa el numero para enviar por WhatsApp:</p>
        <InputText v-model="telefonoInput" placeholder="8095551234" fluid @keydown.enter="confirmarTelefonoEnviar" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogTelefono = false" />
        <Button label="Enviar WhatsApp" icon="pi pi-whatsapp" severity="success" @click="confirmarTelefonoEnviar" />
      </template>
    </Dialog>
    <Menu ref="actionMenu" :model="actionMenuItems" popup />
  </div>
</template>
