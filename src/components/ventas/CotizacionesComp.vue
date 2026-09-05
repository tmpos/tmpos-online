<script setup lang="ts">
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ref, computed, onMounted, watch } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Menu from 'primevue/menu'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputOtp from 'primevue/inputotp'
import Select from 'primevue/select'
import Calendar from 'primevue/calendar'
import Tag from 'primevue/tag'
import Fieldset from 'primevue/fieldset'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import FacturaPdfPrint from './FacturaPdfPrint.vue'
import TicketFacturaPrint from './TicketFacturaPrint.vue'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useAuthStore } from '@/stores/auth.store'

const toast = useToast()
const auth = useAuthStore()
const { store: almacenStore, filterByAlmacen } = useAlmacenFilter()
const cotizaciones = ref<any[]>([])
const cotizacionesRaw = ref<any[]>([])
const verTodosAlmacenes = ref(false)
const puedeVerTodosAlmacenes = computed(() => auth.isAdmin || auth.isSoporte)
const loading = ref(false)
const busqueda = ref('')
const filtroEstado = ref('')
const rangoActivo = ref<string>('mes')
const rangoPersonalizado = ref<Date[]>([])
const dialogDetalle = ref(false)
const selectedCot = ref<any>(null)
const selectedCotizaciones = ref<any[]>([])
const dialogMoverAlmacen = ref(false)
const almacenDestino = ref<any>(null)
const almacenesDestino = ref<any[]>([])
const moviendoAlmacen = ref(false)
const facturaPdfRef = ref<any>(null)
const ticketPrintRef = ref<any>(null)
const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')

const dialogConvertir = ref(false)
const metodoPagoConvertir = ref('EFECTIVO')
const convirtiendo = ref(false)
const compartiendoWhatsapp = ref(false)
const dialogWhatsapp = ref(false)
const cotizacionWhatsapp = ref<any>(null)
const numeroWhatsapp = ref('')
const guardandoWhatsapp = ref(false)
const whatsappPaso = ref(0)
const whatsappDetalle = ref('Preparando los datos de la cotizacion...')
const etapasCompartirWhatsapp = [
  { titulo: 'Generando PDF', detalle: 'Creando el documento profesional de la cotizacion.' },
  { titulo: 'Copiando archivo', detalle: 'Colocando el PDF en el portapapeles de Windows.' },
  { titulo: 'Abriendo WhatsApp', detalle: 'Iniciando WhatsApp Desktop con el mensaje preparado.' },
]
const actionMenu = ref()
const cotizacionAccion = ref<any>(null)
const actionMenuItems = computed(() => [
  { label: 'Imprimir', icon: 'pi pi-print', command: () => imprimirCotizacion(cotizacionAccion.value) },
  { label: 'Ver PDF', icon: 'pi pi-file-pdf', command: () => verPdfCotizacion(cotizacionAccion.value) },
  { label: 'WhatsApp', icon: 'pi pi-whatsapp', disabled: () => compartiendoWhatsapp.value, command: () => compartirWhatsAppCotizacion(cotizacionAccion.value) },
  { label: 'Convertir en factura', icon: 'pi pi-file-export', disabled: () => cotizacionAccion.value?.estado_factura === 'CONVERTIDA', command: () => abrirConvertir(cotizacionAccion.value) },
  { separator: true },
  { label: 'Eliminar', icon: 'pi pi-trash', command: () => confirmarBorrar(cotizacionAccion.value) },
])

function toggleActionMenu(event: Event, cotizacion: any) {
  cotizacionAccion.value = cotizacion
  actionMenu.value.toggle(event)
}

const metodosPago = [
  { label: 'Efectivo', value: 'EFECTIVO' },
  { label: 'Tarjeta', value: 'TARJETA' },
  { label: 'Transferencia', value: 'TRANSFERENCIA' },
  { label: 'Cheque', value: 'CHEQUE' },
  { label: 'Credito', value: 'CREDITO' },
  { label: 'Mixto', value: 'MIXTO' },
]

const estados = [
  { label: 'Todas', value: '' },
  { label: 'Cotizacion', value: 'COTIZACION' },
  { label: 'Aprobada', value: 'APROBADA' },
  { label: 'Vencida', value: 'VENCIDA' },
  { label: 'Convertida', value: 'CONVERTIDA' },
  { label: 'Rechazada', value: 'RECHAZADA' },
]

function fechaLocal(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
}

function getRango(key: string): { inicio: string; fin: string } | null {
  if (key === 'todo') return null
  const hoy = new Date()
  switch (key) {
    case 'hoy': return { inicio: fechaLocal(hoy), fin: fechaLocal(hoy) }
    case 'ayer': {
      const ayer = new Date(hoy)
      ayer.setDate(ayer.getDate() - 1)
      return { inicio: fechaLocal(ayer), fin: fechaLocal(ayer) }
    }
    case 'semana': {
      const inicio = new Date(hoy)
      inicio.setDate(inicio.getDate() - (inicio.getDay() || 7) + 1)
      const fin = new Date(inicio)
      fin.setDate(fin.getDate() + 6)
      return { inicio: fechaLocal(inicio), fin: fechaLocal(fin) }
    }
    case 'mes': {
      return {
        inicio: fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth(), 1)),
        fin: fechaLocal(new Date(hoy.getFullYear(), hoy.getMonth() + 1, 0)),
      }
    }
    case 'personalizado': {
      if (rangoPersonalizado.value.length === 2 && rangoPersonalizado.value[0] && rangoPersonalizado.value[1]) {
        return { inicio: fechaLocal(rangoPersonalizado.value[0]), fin: fechaLocal(rangoPersonalizado.value[1]) }
      }
      return null
    }
    default: return null
  }
}

const rango = computed(() => getRango(rangoActivo.value))

const cotizacionesFiltradas = computed(() => {
  let data = cotizaciones.value
  const texto = busqueda.value.toLowerCase().trim()
  if (texto) {
    data = data.filter(c =>
      c.no_factura?.toLowerCase().includes(texto) ||
      c.nombre_cliente?.toLowerCase().includes(texto) ||
      c.telefono_cliente?.toLowerCase().includes(texto)
    )
  }
  if (filtroEstado.value) {
    data = data.filter(c => c.estado_factura === filtroEstado.value)
  }
  if (rango.value) {
    data = data.filter((c: any) => {
      const fecha = String(c.fecha_emision || '').slice(0, 10)
      return fecha >= rango.value!.inicio && fecha <= rango.value!.fin
    })
  }
  return [...data].sort((a: any, b: any) => {
    const fecha = String(b.fecha_emision || '').localeCompare(String(a.fecha_emision || ''))
    if (fecha !== 0) return fecha
    const hora = String(b.hora || '').localeCompare(String(a.hora || ''))
    if (hora !== 0) return hora
    return Number(b.id || 0) - Number(a.id || 0)
  })
})

const cotizacionesParaEliminar = computed(() => {
  if (selectedCot.value && deleteDialogVisible.value) return [selectedCot.value]
  return selectedCotizaciones.value || []
})

const totalSeleccionadoEliminar = computed(() =>
  cotizacionesParaEliminar.value.reduce((sum, cot) => sum + Number(cot?.total || 0), 0)
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

function getEstadoSeverity(estado: string): 'success' | 'info' | 'warn' | 'danger' | 'secondary' | undefined {
  switch (estado) {
    case 'COTIZACION': return 'info'
    case 'APROBADA': return 'success'
    case 'VENCIDA': return 'danger'
    case 'CONVERTIDA': return 'warn'
    case 'RECHAZADA': return 'secondary'
    default: return 'info'
  }
}

async function cargarCotizaciones() {
  loading.value = true
  try {
    const res = await window.db.getAll('facturas')
    if (res.success) {
      const todas = (res.data || []).filter((f: any) =>
        f.tipo_factura === 'COTIZACION' || f.estado_factura === 'COTIZACION'
      )
      cotizacionesRaw.value = todas
      cotizaciones.value = verTodosAlmacenes.value ? todas : filterByAlmacen(todas)
    }
  } catch (_) {}
  loading.value = false
}

watch(verTodosAlmacenes, () => {
  cotizaciones.value = verTodosAlmacenes.value
    ? cotizacionesRaw.value
    : filterByAlmacen(cotizacionesRaw.value)
  selectedCotizaciones.value = []
})

function abrirDetalle(cot: any) {
  selectedCot.value = cot
  dialogDetalle.value = true
}

function resetDeleteOtp() {
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
}

function confirmarBorrar(cot: any) {
  selectedCot.value = cot
  resetDeleteOtp()
  deleteDialogVisible.value = true
}

function confirmarBorrarSeleccionadas() {
  if (!selectedCotizaciones.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una cotizacion', life: 2500 })
    return
  }
  selectedCot.value = null
  resetDeleteOtp()
  deleteDialogVisible.value = true
}

async function abrirMoverAlmacenSeleccionadas() {
  if (!selectedCotizaciones.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una cotizacion', life: 2500 })
    return
  }
  almacenDestino.value = null
  try {
    await almacenStore.load()
    const origenes = new Set(selectedCotizaciones.value.map((cot: any) => String(cot.almacen_uid || '')).filter(Boolean))
    almacenesDestino.value = almacenStore.almacenes.filter((almacen: any) =>
      origenes.size !== 1 || !origenes.has(String(almacen.uid || ''))
    )
    dialogMoverAlmacen.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
  }
}

async function aplicarMoverAlmacenSeleccionadas() {
  if (!almacenDestino.value || moviendoAlmacen.value || !selectedCotizaciones.value.length) return
  const destinoId = Number(almacenDestino.value.id || 0)
  const destinoUid = String(almacenDestino.value.uid || '')
  const destinoNombre = String(almacenDestino.value.nombre || 'almacen destino')
  const seleccion = [...selectedCotizaciones.value]
  moviendoAlmacen.value = true
  try {
    for (const cotizacion of seleccion) {
      const res = await window.db.update('facturas', cotizacion.id, {
        almacen_id: destinoId,
        almacen_uid: destinoUid,
      })
      if (!res.success) throw new Error(res.error || `No se pudo mover la cotizacion ${cotizacion.no_factura || cotizacion.id}`)
      try {
        await window.electron.invoke('auditoria:registrar', {
          modulo: 'ventas', accion: 'mover_almacen', entidad: 'facturas', entidad_id: Number(cotizacion.id || 0),
          referencia: cotizacion.no_factura || '', usuario: localStorage.getItem('mr_user_usuario') || 'POS',
          detalle: { tipo: 'cotizacion', almacen_origen_id: cotizacion.almacen_id || 0, almacen_origen_uid: cotizacion.almacen_uid || '', almacen_destino_id: destinoId, almacen_destino_uid: destinoUid, almacen_destino_nombre: destinoNombre },
          resultado: 'OK',
        })
      } catch (_) {}
    }
    dialogMoverAlmacen.value = false
    selectedCotizaciones.value = []
    toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: `${seleccion.length} cotizacion(es) movida(s) a ${destinoNombre}`, life: 3000 })
    await cargarCotizaciones()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron mover las cotizaciones', life: 4500 })
  } finally {
    moviendoAlmacen.value = false
  }
}

async function solicitarOtpEliminarCotizacion() {
  const cotizaciones = cotizacionesParaEliminar.value
  if (!cotizaciones.length) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: cotizaciones[0]?.id,
      facturaIds: cotizaciones.map(c => c.id),
      no_factura: cotizaciones.length === 1 ? cotizaciones[0]?.no_factura : '',
      nombre_cliente: cotizaciones.length === 1 ? cotizaciones[0]?.nombre_cliente : '',
      cantidad: cotizaciones.length,
      total: totalSeleccionadoEliminar.value,
      entidad: 'cotizacion',
      entidadPlural: 'cotizaciones',
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

async function borrarCotizaciones() {
  const cotizaciones = cotizacionesParaEliminar.value
  if (!cotizaciones.length) return
  deleteOtpError.value = ''
  const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
  if (!/^\d{4}$/.test(codigo)) {
    deleteOtpError.value = 'Introduce el codigo de 4 digitos'
    return
  }

  deleteOtpConfirmando.value = true
  try {
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: cotizaciones[0]?.id,
      facturaIds: cotizaciones.map(c => c.id),
      codigo,
    }) as any
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    let eliminadas = 0
    for (const cotizacion of cotizaciones) {
      const res = await window.db.delete('facturas', cotizacion.id)
      if (res.success) eliminadas++
      else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || `No se pudo eliminar ${cotizacion.no_factura || cotizacion.id}`, life: 3000 })
        return
      }
    }
    toast.add({ severity: 'success', summary: 'Exito', detail: `${eliminadas} cotizacion(es) eliminada(s)`, life: 3000 })
    deleteDialogVisible.value = false
    dialogDetalle.value = false
    selectedCot.value = null
    selectedCotizaciones.value = []
    await cargarCotizaciones()
  } catch (_) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

const productosCotizacion = computed(() => {
  if (!selectedCot.value?.productos) return []
  try {
    const data = JSON.parse(selectedCot.value.productos)
    return Array.isArray(data) ? data : []
  } catch { return [] }
})

function abrirConvertir(cotizacion?: any) {
  if (cotizacion) selectedCot.value = cotizacion
  if (!selectedCot.value || selectedCot.value.estado_factura === 'CONVERTIDA') {
    toast.add({ severity: 'info', summary: 'Cotizacion', detail: 'Esta cotizacion ya fue convertida en factura', life: 3000 })
    return
  }
  metodoPagoConvertir.value = 'EFECTIVO'
  dialogConvertir.value = true
}

async function confirmarConvertir() {
  if (!selectedCot.value) return
  convirtiendo.value = true
  try {
    const now = new Date()
    const fechaStr = now.toISOString().split('T')[0]
    const horaStr = String(now.getHours()).padStart(2, '0') + ':' + String(now.getMinutes()).padStart(2, '0')
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const newInvoiceNo = `F-${y}${m}${d}-${h}${min}${s}`

    await window.db.update('facturas', selectedCot.value.id, {
      estado_factura: 'CONVERTIDA',
    })

    await window.db.insert('facturas', {
      ...selectedCot.value,
      id: undefined,
      no_factura: newInvoiceNo,
      tipo_factura: 'FACTURA_VENTA',
      estado_factura: metodoPagoConvertir.value === 'CREDITO' ? 'CREDITO' : 'PAGADA',
      metodo_pago: metodoPagoConvertir.value,
      efectivo: metodoPagoConvertir.value === 'EFECTIVO' || metodoPagoConvertir.value === 'MIXTO' ? selectedCot.value.total : 0,
      tarjeta: metodoPagoConvertir.value === 'TARJETA' ? selectedCot.value.total : 0,
      transferencia: metodoPagoConvertir.value === 'TRANSFERENCIA' ? selectedCot.value.total : 0,
      cheque: metodoPagoConvertir.value === 'CHEQUE' ? selectedCot.value.total : 0,
      hora: horaStr,
      fecha_emision: fechaStr,
    })
    if (metodoPagoConvertir.value === 'CREDITO') {
      await window.db.insert('cuentas_cobrar', {
        no_factura: newInvoiceNo,
        nombre_cliente: selectedCot.value.nombre_cliente || 'CONSUMIDOR FINAL',
        telefono_cliente: selectedCot.value.telefono_cliente || '',
        total: selectedCot.value.total,
        abonado: 0,
        saldo: selectedCot.value.total,
        fecha_venta: fechaStr,
        estado: 'ACTIVA',
        almacen_id: selectedCot.value.almacen_id || 0,
        almacen_uid: selectedCot.value.almacen_uid || '',
      })
    }
    toast.add({ severity: 'success', summary: 'Convertida', detail: 'Cotizacion convertida a factura', life: 3000 })
    dialogConvertir.value = false
    dialogDetalle.value = false
    await cargarCotizaciones()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    convirtiendo.value = false
  }
}

async function cambiarEstado(cotizacion: any, estado: string) {
  await window.db.update('facturas', cotizacion.id, { estado_factura: estado })
  cotizacion.estado_factura = estado
  toast.add({ severity: 'success', summary: 'Estado actualizado', detail: estado, life: 2000 })
}

function imprimirCotizacion(cotizacion?: any) {
  const documento = cotizacion || selectedCot.value
  if (documento) ticketPrintRef.value?.printTicket(documento)
}

function verPdfCotizacion(cotizacion?: any) {
  const documento = cotizacion || selectedCot.value
  if (documento) facturaPdfRef.value?.printFactura(documento)
}

function normalizarTelefonoWhatsapp(valor: any): string {
  const digitos = String(valor || '').replace(/\D/g, '')
  if (digitos.length === 10) return `1${digitos}`
  return digitos
}

async function guardarWhatsappYCompartir() {
  const documento = cotizacionWhatsapp.value
  const telefono = normalizarTelefonoWhatsapp(numeroWhatsapp.value)
  if (!documento || telefono.length < 8 || telefono.length > 15) {
    toast.add({ severity: 'warn', summary: 'WhatsApp', detail: 'Ingresa un numero de WhatsApp valido', life: 3000 })
    return
  }

  guardandoWhatsapp.value = true
  try {
    const telefonoLocal = telefono.startsWith('1') && telefono.length === 11 ? telefono.slice(1) : telefono
    const res = await window.db.update('facturas', documento.id, { telefono_cliente: telefonoLocal })
    if (!res.success) throw new Error(res.error || 'No se pudo guardar el numero de WhatsApp')

    documento.telefono_cliente = telefonoLocal
    if (selectedCot.value?.id === documento.id) selectedCot.value.telefono_cliente = telefonoLocal
    if (cotizacionAccion.value?.id === documento.id) cotizacionAccion.value.telefono_cliente = telefonoLocal
    dialogWhatsapp.value = false
    await compartirWhatsAppCotizacion(documento)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'WhatsApp', detail: error?.message || 'No se pudo guardar el numero', life: 4000 })
  } finally {
    guardandoWhatsapp.value = false
  }
}

async function compartirWhatsAppCotizacion(cotizacion?: any) {
  const documento = cotizacion || selectedCot.value
  if (!documento || compartiendoWhatsapp.value) return

  const telefonoLocal = String(documento.telefono_cliente || '').replace(/\D/g, '')
  const telefono = telefonoLocal.length === 10 ? `1${telefonoLocal}` : telefonoLocal
  if (!telefono) {
    cotizacionWhatsapp.value = documento
    numeroWhatsapp.value = ''
    dialogWhatsapp.value = true
    return
  }

  compartiendoWhatsapp.value = true
  whatsappPaso.value = 0
  whatsappDetalle.value = etapasCompartirWhatsapp[0].detalle
  try {
    const html = await facturaPdfRef.value?.generateFacturaHtml({ factura: documento })
    if (!html) throw new Error('No se pudo preparar el contenido de la cotizacion')

    const nombre = `Cotizacion_${documento.no_factura || 'sin_numero'}.pdf`
    const pdf = await window.electron.invoke('pdf:generateToFile', html, nombre) as any
    if (!pdf?.success || !pdf.filePath) throw new Error(pdf?.error || 'No se pudo crear el PDF')

    whatsappPaso.value = 1
    whatsappDetalle.value = etapasCompartirWhatsapp[1].detalle
    const copiado = await window.electron.invoke('clipboard:copyFile', pdf.filePath) as any
    if (!copiado?.success) throw new Error(copiado?.error || 'No se pudo copiar el PDF al portapapeles')

    whatsappPaso.value = 2
    whatsappDetalle.value = etapasCompartirWhatsapp[2].detalle
    const mensaje = `Cotizacion ${documento.no_factura || ''}\nTotal: RD$${Number(documento.total || 0).toFixed(2)}\nCliente: ${documento.nombre_cliente || 'CONSUMIDOR FINAL'}\nFecha: ${documento.fecha_emision || ''}`
    const resultado = await window.electron.invoke('whatsapp:open', { telefono, mensaje }) as any
    if (resultado?.success === false) throw new Error(resultado.error || 'No se pudo abrir WhatsApp')

    toast.add({ severity: 'success', summary: 'Cotizacion preparada', detail: 'El PDF esta copiado. Pegalo en WhatsApp con Ctrl+V para enviarlo.', life: 5000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo compartir', detail: error?.message || 'Ocurrio un error preparando la cotizacion', life: 4500 })
  } finally {
    compartiendoWhatsapp.value = false
  }
}

onMounted(cargarCotizaciones)
</script>

<template>
  <div>
    <Toast />
    <FacturaPdfPrint ref="facturaPdfRef" />
    <TicketFacturaPrint ref="ticketPrintRef" />

    <Dialog
      v-model:visible="compartiendoWhatsapp"
      modal
      :closable="false"
      :closeOnEscape="false"
      :draggable="false"
      :showHeader="false"
      :style="{ width: 'min(30rem, 92vw)' }"
    >
      <div class="px-2 py-5 sm:px-5">
        <div class="flex flex-col items-center text-center">
          <div class="relative mb-5 flex h-20 w-20 items-center justify-center rounded-2xl bg-emerald-50 dark:bg-emerald-950/40">
            <i class="pi pi-whatsapp text-4xl text-emerald-500"></i>
            <span class="absolute -bottom-1 -right-1 flex h-8 w-8 items-center justify-center rounded-full border-4 border-surface-0 bg-primary text-primary-contrast dark:border-surface-800">
              <i class="pi pi-spin pi-spinner text-sm"></i>
            </span>
          </div>
          <span class="mb-2 rounded-full bg-emerald-50 px-3 py-1 text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:bg-emerald-950/50 dark:text-emerald-300">Compartiendo cotizacion</span>
          <h3 class="text-xl font-bold text-surface-900 dark:text-surface-0">{{ etapasCompartirWhatsapp[whatsappPaso].titulo }}</h3>
          <p class="mt-2 min-h-10 text-sm leading-5 text-surface-500">{{ whatsappDetalle }}</p>
        </div>

        <div class="my-6 h-2 overflow-hidden rounded-full bg-surface-100 dark:bg-surface-700">
          <div class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-emerald-600 transition-all duration-500" :style="{ width: `${((whatsappPaso + 1) / etapasCompartirWhatsapp.length) * 100}%` }"></div>
        </div>

        <div class="grid grid-cols-3 gap-2">
          <div v-for="(etapa, index) in etapasCompartirWhatsapp" :key="etapa.titulo" class="flex flex-col items-center gap-2 text-center">
            <span
              class="flex h-7 w-7 items-center justify-center rounded-full border text-xs font-bold transition-colors"
              :class="index < whatsappPaso
                ? 'border-emerald-500 bg-emerald-500 text-white'
                : index === whatsappPaso
                  ? 'border-primary bg-primary text-primary-contrast'
                  : 'border-surface-300 text-surface-400 dark:border-surface-600'"
            >
              <i v-if="index < whatsappPaso" class="pi pi-check text-xs"></i>
              <span v-else>{{ index + 1 }}</span>
            </span>
            <span class="text-[11px] font-medium" :class="index <= whatsappPaso ? 'text-surface-700 dark:text-surface-200' : 'text-surface-400'">{{ etapa.titulo }}</span>
          </div>
        </div>

        <div class="mt-6 flex items-center justify-center gap-2 rounded-lg bg-surface-50 px-3 py-2 text-xs text-surface-500 dark:bg-surface-700/40">
          <i class="pi pi-info-circle"></i>
          No cierres la aplicacion mientras se prepara el archivo.
        </div>
      </div>
    </Dialog>

    <Fieldset legend="Cotizaciones">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div class="flex items-center gap-2">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busqueda" placeholder="Buscar cotizacion..." />
          </IconField>
          <Select v-model="filtroEstado" :options="estados" optionLabel="label" optionValue="value" placeholder="Estado" class="w-36" fluid />
        </div>
        <div class="flex items-center gap-1 flex-wrap">
          <Button
            v-for="item in [
              { label: 'Todo', key: 'todo' },
              { label: 'Hoy', key: 'hoy' },
              { label: 'Ayer', key: 'ayer' },
              { label: 'Semana', key: 'semana' },
              { label: 'Mes', key: 'mes' },
              { label: 'Rango', key: 'personalizado' },
            ]"
            :key="item.key"
            :label="item.label"
            size="small"
            :severity="rangoActivo === item.key ? 'primary' : 'secondary'"
            :outlined="rangoActivo !== item.key"
            @click="rangoActivo = item.key"
          />
          <Calendar
            v-if="rangoActivo === 'personalizado'"
            v-model="rangoPersonalizado"
            selectionMode="range"
            dateFormat="yy-mm-dd"
            placeholder="Seleccionar rango"
            showIcon
          />
        </div>
        <div class="flex items-center gap-2">
          <label v-if="puedeVerTodosAlmacenes" class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button
            v-if="selectedCotizaciones.length"
            :label="`Cambiar almacen (${selectedCotizaciones.length})`"
            icon="pi pi-warehouse"
            severity="success"
            @click="abrirMoverAlmacenSeleccionadas"
          />
          <Button
            v-if="selectedCotizaciones.length"
            :label="`Eliminar (${selectedCotizaciones.length})`"
            icon="pi pi-trash"
            severity="danger"
            @click="confirmarBorrarSeleccionadas"
          />
          <Button label="Actualizar" icon="pi pi-refresh" severity="secondary" @click="cargarCotizaciones" />
        </div>
      </div>

      <DataTable
        v-model:selection="selectedCotizaciones"
        :value="cotizacionesFiltradas"
        :loading="loading"
        stripedRows
        paginator
        :rows="15"
        :rowsPerPageOptions="[15, 25, 50]"
        dataKey="id"
        sortField="fecha_emision"
        :sortOrder="-1"
        responsiveLayout="scroll"
        @row-click="abrirDetalle($event.data)"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Acciones" style="width: 5rem">
          <template #body="{ data }">
            <Button icon="pi pi-ellipsis-v" severity="secondary" text rounded @click.stop="toggleActionMenu($event, data)" v-tooltip="'Acciones'" />
          </template>
        </Column>
        <Column field="no_factura" header="No." sortable style="width: 8rem" />
        <Column field="nombre_cliente" header="Cliente" sortable />
        <Column field="total" header="Total" sortable style="width: 8rem">
          <template #body="{ data }">{{ $formatMoney(data.total) }}</template>
        </Column>
        <Column field="fecha_emision" header="Fecha" sortable style="width: 7rem">
          <template #body="{ data }">{{ formatFecha(data.fecha_emision) }}</template>
        </Column>
        <Column field="estado_factura" header="Estado" sortable style="width: 8rem">
          <template #body="{ data }">
            <Tag :value="data.estado_factura || 'COTIZACION'" :severity="getEstadoSeverity(data.estado_factura)" />
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay cotizaciones.</div>
        </template>
      </DataTable>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacen" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedCotizaciones.length }}</strong> cotizacion(es) seleccionada(s) a otro almacen:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacen destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacen disponible para el traslado.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover cotizaciones" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacenSeleccionadas" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogDetalle" :header="`Cotizacion: ${selectedCot?.no_factura || ''}`" modal :style="{ width: '90%', maxWidth: '700px' }">
      <div v-if="selectedCot" class="space-y-4 pt-2">
        <div class="grid grid-cols-2 gap-3 text-sm">
          <div>
            <span class="text-surface-400 text-xs">No.</span>
            <p class="font-semibold">{{ selectedCot.no_factura || '—' }}</p>
          </div>
          <div>
            <span class="text-surface-400 text-xs">Estado</span>
            <Tag :value="selectedCot.estado_factura || 'COTIZACION'" :severity="getEstadoSeverity(selectedCot.estado_factura)" />
          </div>
          <div class="col-span-2">
            <span class="text-surface-400 text-xs">Cliente</span>
            <p class="font-medium">{{ selectedCot.nombre_cliente || 'CONSUMIDOR FINAL' }}</p>
          </div>
          <div>
            <span class="text-surface-400 text-xs">Total</span>
            <p class="font-bold text-primary">{{ $formatMoney(selectedCot.total) }}</p>
          </div>
          <div>
            <span class="text-surface-400 text-xs">Metodo Pago</span>
            <p>{{ selectedCot.metodo_pago || '—' }}</p>
          </div>
        </div>

        <div v-if="productosCotizacion.length" class="text-sm">
          <span class="text-surface-400 text-xs font-semibold mb-1 block">Productos</span>
          <DataTable :value="productosCotizacion" stripedRows class="p-datatable-sm" responsiveLayout="scroll">
            <Column field="cantidad" header="Cant" style="width: 4rem">
              <template #body="{ data }">{{ data.cantidad || data.quantity || 1 }}</template>
            </Column>
            <Column field="nombre" header="Producto">
              <template #body="{ data }">{{ data.nombre || data.descripcion || data.producto || '—' }}</template>
            </Column>
            <Column field="precio" header="Precio" style="width: 7rem">
              <template #body="{ data }">{{ $formatMoney(data.precio || data.precio_venta || 0) }}</template>
            </Column>
            <Column header="Total" style="width: 7rem">
              <template #body="{ data }">{{ $formatMoney((data.precio || data.precio_venta || 0) * (data.cantidad || data.quantity || 1)) }}</template>
            </Column>
          </DataTable>
        </div>

        <div class="border-t border-surface-200 dark:border-surface-700 pt-3 flex flex-wrap gap-2">
          <Button label="Convertir en factura" icon="pi pi-file-export" severity="success" size="small" :disabled="selectedCot?.estado_factura === 'CONVERTIDA'" @click="abrirConvertir()" />
          <Button label="Vencida" icon="pi pi-clock" severity="danger" size="small" @click="cambiarEstado(selectedCot, 'VENCIDA')" />
          <Button label="Rechazar" icon="pi pi-times" severity="secondary" size="small" @click="cambiarEstado(selectedCot, 'RECHAZADA')" />
          <Button label="Eliminar" icon="pi pi-trash" severity="danger" size="small" outlined @click="confirmarBorrar(selectedCot)" />
        </div>
      </div>

      <template #footer>
        <Button label="Imprimir" icon="pi pi-print" severity="info" @click="imprimirCotizacion()" />
        <Button label="PDF" icon="pi pi-file-pdf" severity="danger" @click="verPdfCotizacion()" />
        <Button label="WhatsApp" icon="pi pi-whatsapp" severity="success" :disabled="compartiendoWhatsapp" @click="compartirWhatsAppCotizacion()" />
        <Button label="Cerrar" severity="secondary" text @click="dialogDetalle = false" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogWhatsapp"
      header="Agregar WhatsApp"
      modal
      :style="{ width: 'min(26rem, 95vw)' }"
      :draggable="false"
    >
      <div class="space-y-4">
        <div class="rounded-lg border border-green-200 bg-green-50 p-3 text-sm dark:border-green-800 dark:bg-green-900/20">
          <p class="font-semibold text-green-700 dark:text-green-300">El cliente no tiene WhatsApp registrado.</p>
          <p class="mt-1 text-xs text-surface-500">Agrega el numero para guardarlo y compartir la cotizacion.</p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Numero de WhatsApp</label>
          <InputText
            v-model="numeroWhatsapp"
            placeholder="8095551234"
            inputmode="tel"
            fluid
            autofocus
            @keydown.enter="guardarWhatsappYCompartir"
          />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="guardandoWhatsapp" @click="dialogWhatsapp = false" />
        <Button label="Guardar y compartir" icon="pi pi-whatsapp" severity="success" :loading="guardandoWhatsapp" @click="guardarWhatsappYCompartir" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogConvertir" header="Convertir a Factura" modal :style="{ width: '90%', maxWidth: '450px' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm text-surface-500">Selecciona el metodo de pago para la factura:</p>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Metodo de Pago</label>
          <Select v-model="metodoPagoConvertir" :options="metodosPago" optionLabel="label" optionValue="value" fluid />
        </div>
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-1 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Total</span>
            <span class="font-bold">{{ $formatMoney(selectedCot?.total || 0) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Cliente</span>
            <span>{{ selectedCot?.nombre_cliente || 'CONSUMIDOR FINAL' }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogConvertir = false" />
        <Button label="Convertir" icon="pi pi-check" :loading="convirtiendo" @click="confirmarConvertir" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Eliminar cotizacion"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="cotizacionesParaEliminar.length === 1">Seguro que deseas eliminar la cotizacion <strong>{{ cotizacionesParaEliminar[0]?.no_factura }}</strong>?</span>
          <span v-else>Seguro que deseas eliminar <strong>{{ cotizacionesParaEliminar.length }}</strong> cotizaciones seleccionadas?</span>
        </div>
        <div v-if="cotizacionesParaEliminar.length > 1" class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3 text-xs text-red-700 dark:text-red-300">
          Total combinado: <strong>{{ $formatMoney(totalSeleccionadoEliminar) }}</strong>
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
          @click="solicitarOtpEliminarCotizacion"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          @click="borrarCotizaciones"
        />
      </template>
    </Dialog>
    <Menu ref="actionMenu" :model="actionMenuItems" popup />
  </div>
</template>
