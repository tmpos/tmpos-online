<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { ref, computed, onMounted, watch } from 'vue'
import { useRoute } from 'vue-router'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import Fieldset from 'primevue/fieldset'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import InputOtp from 'primevue/inputotp'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

import { envioElectron, encryptarPassword, peticionesFetch } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { ensureRecibidoCreditNote } from '@/services/recibidosCreditNoteService'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const route = useRoute()
const { store: almacenStore, filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const recibidos = ref<any[]>([])
const telefonos = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const deleteMultipleDialogVisible = ref(false)
const selectedRecibido = ref<any>(null)
const recibidosSeleccionados = ref<any[]>([])
const deleteOtpEnviado = ref(false)
const deleteOtpEmail = ref('')
const deleteOtp = ref('')
const deleteOtpError = ref('')
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const busqueda = ref(String(route.query.search || ''))
const estadoFiltro = ref(route.query.estado === 'todos' ? 'TODOS' : 'RECIBIDO')
const viewMode = ref<'table' | 'cards'>('table')
const verTodosAlmacenes = ref(false)
const dialogNuevoTelefono = ref(false)
const nuevoTelefonoForm = ref({ nombre: '' })
const guardandoTelefono = ref(false)
const generandoNC = ref(false)
const enviandoTaller = ref(false)
const publicandoImei = ref(false)

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'imei', entity: 'imei', label: 'equipo recibido',
  selection: recibidosSeleccionados, reload: cargarRecibidos,
  reference: (item: any) => item.nombre || String(item.id || ''),
})

const clientesLista = ref<any[]>([])
const clienteSeleccionadoBusqueda = ref<any | null>(null)
const buscandoDocumento = ref(false)

const dialogGenerarNC = ref(false)
const dialogEnviarTaller = ref(false)
const dialogPublicarImei = ref(false)

const tallerForm = ref({
  tecnico: '',
  fallas: '',
  accesorios: '',
})

const imeiPublishForm = ref({
  costo: 0,
  precio_venta: 0,
  precio_min: 0,
  precio_xmayor: 0,
})

const formDefault = () => ({
  nombre: '',
  id_equi: null as number | null,
  telefono_modelo: '',
  color: '',
  capacidad: '',
  precio_venta: 0,
  nota_json: JSON.stringify({
    customer_name: '',
    customer_phone: '',
    customer_cedula: '',
    credit_note_value: 0,
    credit_note_id: null,
    credit_note_no: null,
    credit_note_date: null,
  }),
})

const form = ref(formDefault())

const notaData = computed(() => {
  try {
    const parsed = JSON.parse(form.value.nota_json || '{}')
    return {
      customer_name: parsed.customer_name || '',
      customer_phone: parsed.customer_phone || '',
      customer_cedula: parsed.customer_cedula || '',
      credit_note_value: parsed.credit_note_value || 0,
      credit_note_id: parsed.credit_note_id || null,
      credit_note_no: parsed.credit_note_no || null,
      credit_note_date: parsed.credit_note_date || null,
    }
  } catch {
    return { customer_name: '', customer_phone: '', customer_cedula: '', credit_note_value: 0, credit_note_id: null, credit_note_no: null, credit_note_date: null }
  }
})

const busquedaTelefono = ref('')

const telefonosAlmacenActual = computed(() => {
  const almacenUid = String(almacenStore.activeUid || '')
  if (!almacenUid) return []
  return telefonos.value
    .filter((telefono: any) => String(telefono.almacen_uid || '') === almacenUid)
    .sort((a: any, b: any) => String(a.nombre || '').localeCompare(String(b.nombre || ''), 'es'))
})

const estadoOptions = computed(() => {
  const base = ['RECIBIDO', 'DISPONIBLE', 'EN_GARANTIA']
  const estados = Array.from(new Set([...base, ...recibidos.value.map((r: any) => estadoRecibido(r)).filter(Boolean)]))
  return [
    { label: 'Todos los estados', value: 'TODOS' },
    ...estados.map((estado: string) => ({ label: estado, value: estado })),
  ]
})

function getNotaDataFromImei(imei: any) {
  try {
    const parsed = JSON.parse(imei.nota || '{}')
    return {
      customer_name: parsed.customer_name || '',
      customer_phone: parsed.customer_phone || '',
      customer_cedula: parsed.customer_cedula || '',
      credit_note_value: parsed.credit_note_value || 0,
      credit_note_id: parsed.credit_note_id || null,
      credit_note_no: parsed.credit_note_no || null,
      credit_note_date: parsed.credit_note_date || null,
    }
  } catch {
    return { customer_name: '', customer_phone: '', customer_cedula: '', credit_note_value: 0, credit_note_id: null, credit_note_no: null, credit_note_date: null }
  }
}

function tieneNotaRecibido(imei: any): boolean {
  try {
    const parsed = JSON.parse(imei.nota || '{}')
    return Object.prototype.hasOwnProperty.call(parsed, 'customer_name') ||
      Object.prototype.hasOwnProperty.call(parsed, 'customer_phone') ||
      Object.prototype.hasOwnProperty.call(parsed, 'credit_note_value') ||
      Object.prototype.hasOwnProperty.call(parsed, 'credit_note_id') ||
      Object.prototype.hasOwnProperty.call(parsed, 'credit_note_no') ||
      Object.prototype.hasOwnProperty.call(parsed, 'cliente_id')
  } catch {
    return false
  }
}

function esEquipoRecibido(imei: any): boolean {
  const estado = String(imei.estado || '').toUpperCase()
  if (['RECIBIDO', 'EN_GARANTIA'].includes(estado)) return true
  return tieneNotaRecibido(imei)
}

function estadoRecibido(imei: any): string {
  const estado = String(imei.estado || '').toUpperCase()
  if (estado === 'APARTADO' && tieneNotaRecibido(imei)) return 'RECIBIDO'
  return estado || 'RECIBIDO'
}

function getNombreTelefono(id_equi: number | null): string {
  if (!id_equi) return ''
  const tel = telefonos.value.find(t => t.id === id_equi)
  return tel?.nombre || ''
}

const recibidosFiltrados = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  const estado = estadoFiltro.value
  return recibidos.value.filter(a => {
    if (estado !== 'TODOS' && estadoRecibido(a) !== estado) return false
    if (!texto) return true
    const nd = getNotaDataFromImei(a)
    return (
      a.nombre?.toLowerCase().includes(texto) ||
      nd.customer_name?.toLowerCase().includes(texto) ||
      nd.customer_phone?.toLowerCase().includes(texto) ||
      nd.customer_cedula?.toLowerCase().includes(texto) ||
      getNombreTelefono(a.id_equi)?.toLowerCase().includes(texto) ||
      a.color?.toLowerCase().includes(texto) ||
      a.capacidad?.toLowerCase().includes(texto)
    )
  })
})

function formatCurrency(n: number): string {
  if (n == null) return '0.00'
  return Number(n).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function formatFecha(fechaStr: string): string {
  if (!fechaStr) return ''
  const parts = fechaStr.split('T')[0].split('-')
  if (parts.length !== 3) return fechaStr
  return `${parts[2]}/${parts[1]}/${parts[0]}`
}

function formatCapacidad(value: any): string {
  const capacidad = String(value || '').trim().toUpperCase()
  if (!capacidad) return '—'
  return /(?:GB|TB)$/.test(capacidad) ? capacidad : `${capacidad} GB`
}

async function cargarRecibidos() {
  loading.value = true
  try {
    const res = await window.db.getAll('imei')
    if (res.success) {
      const lista = verTodosAlmacenes.value
        ? (res.data || [])
        : filterByAlmacen(res.data || [])
      recibidos.value = lista.filter(esEquipoRecibido)
      const ids = new Set(recibidos.value.map((item: any) => item.id))
      recibidosSeleccionados.value = recibidosSeleccionados.value.filter((item: any) => ids.has(item.id))
    }
  } catch (_) {}
  loading.value = false
}

async function cargarTelefonos() {
  try {
    const res = await window.db.getAll('telefonos')
    if (res.success) telefonos.value = res.data || []
  } catch (_) {}
}

watch(verTodosAlmacenes, () => {
  recibidosSeleccionados.value = []
  selectedRecibido.value = null
  cargarRecibidos()
})

function abrirRecibir() {
  form.value = formDefault()
  busquedaTelefono.value = ''
  clienteSeleccionadoBusqueda.value = null
  selectedRecibido.value = null
  dialogVisible.value = true
}

function abrirEditar(recibido: any) {
  const nd = getNotaDataFromImei(recibido)
  form.value = {
    nombre: recibido.nombre || '',
    id_equi: recibido.id_equi || null,
    telefono_modelo: getNombreTelefono(recibido.id_equi),
    color: recibido.color || '',
    capacidad: recibido.capacidad || '',
    precio_venta: recibido.precio_venta || 0,
    nota_json: JSON.stringify(nd),
  }
  clienteSeleccionadoBusqueda.value = null
  dialogVisible.value = true
  selectedRecibido.value = recibido
}

function setCreditNoteValue(val: number) {
  try {
    const parsed = JSON.parse(form.value.nota_json || '{}')
    parsed.credit_note_value = val
    form.value.nota_json = JSON.stringify(parsed)
  } catch {}
}

function setCustomerName(val: string) {
  try {
    const parsed = JSON.parse(form.value.nota_json || '{}')
    parsed.customer_name = val.toUpperCase()
    form.value.nota_json = JSON.stringify(parsed)
  } catch {}
}

function setCustomerPhone(val: string) {
  try {
    const parsed = JSON.parse(form.value.nota_json || '{}')
    parsed.customer_phone = val
    form.value.nota_json = JSON.stringify(parsed)
  } catch {}
}

function setCustomerCedula(val: string) {
  try {
    const parsed = JSON.parse(form.value.nota_json || '{}')
    parsed.customer_cedula = String(val || '').replace(/-/g, '')
    form.value.nota_json = JSON.stringify(parsed)
  } catch {}
}

function setImei(val: string) {
  form.value.nombre = String(val || '').replace(/\D/g, '').slice(0, 15)
}

async function buscarClientePorDocumento() {
  const valor = String(notaData.value.customer_cedula || '').trim().replace(/-/g, '')
  if (!valor) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa una cedula o RNC', life: 3000 })
    return
  }

  setCustomerCedula(valor)
  buscandoDocumento.value = true
  try {
    const tokenCifrado = await encryptarPassword('1234567890abc', 10)
    const esRnc = valor.length === 9
    const resultado = esRnc
      ? await peticionesFetch('https://demo.tmposrd.com/api2', `consultarrnc/${valor}`, {}, tokenCifrado, 'GET')
      : await peticionesFetch('https://demo.tmposrd.com/api2', 'buscarcedula', { cedula: valor }, tokenCifrado, 'POST')

    if (resultado?.error) {
      toast.add({ severity: 'error', summary: 'Error', detail: resultado.error, life: 4000 })
      return
    }

    let info = resultado?.datos || resultado?.data || resultado
    if (Array.isArray(info)) info = info[0]
    if (!info || (typeof info === 'object' && Object.keys(info).length === 0)) {
      toast.add({ severity: 'info', summary: 'No encontrado', detail: 'No se encontraron datos para ese documento', life: 3000 })
      return
    }

    const nombre = (info.name || info.nombre || info.razon_social || info.RazonSocial || '').toUpperCase()
    if (nombre) setCustomerName(nombre)
    toast.add({ severity: 'success', summary: 'Encontrado', detail: nombre ? `Datos cargados: ${nombre}` : 'Datos encontrados', life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'Error al consultar API', life: 4000 })
  } finally {
    buscandoDocumento.value = false
  }
}

function seleccionarTelefono(telefono: any) {
  form.value.id_equi = telefono.id
  form.value.telefono_modelo = telefono.nombre
  dialogNuevoTelefono.value = false
}

async function crearTelefono() {
  if (!nuevoTelefonoForm.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del telefono es requerido', life: 3000 })
    return
  }
  guardandoTelefono.value = true
  try {
    const datosTelefono = addAlmacenId({
      nombre: nuevoTelefonoForm.value.nombre.trim().toUpperCase(),
    })
    const res = await window.db.insert('telefonos', datosTelefono)
    if (res.success) {
      const nuevo = { id: res.data.id, uid: res.data.uid || '', ...datosTelefono }
      telefonos.value.unshift(nuevo)
      form.value.id_equi = nuevo.id
      form.value.telefono_modelo = nuevo.nombre
      dialogNuevoTelefono.value = false
      toast.add({ severity: 'success', summary: 'Telefono creado', detail: nuevo.nombre, life: 3000 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    guardandoTelefono.value = false
  }
}

async function crearNotaCreditoInterna(recibido: any) {
  const result = await ensureRecibidoCreditNote(recibido, {
    almacenId: almacenStore.activeId || 0,
    almacenUid: almacenStore.activeUid || '',
    productName: getNombreTelefono(recibido.id_equi) || recibido.nombre || '',
  })
  if (result?.created) toast.add({ severity: 'success', summary: 'Nota de Credito', detail: `${result.factura.no_factura} por ${formatCurrency(result.factura.total)}`, life: 4000 })
  return result?.recibido || recibido
  /* Legacy implementation retained temporarily below; all calls return through the shared service. */
  try {
    const nd = JSON.parse(recibido.nota || '{}')
    if (!nd.credit_note_value || nd.credit_note_value <= 0) return
    const nombreCliente = (nd.customer_name || 'CONSUMIDOR FINAL').toUpperCase()
    const codCliente = nd.cliente_id || ''
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d2 = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const noCredito = `NC-${y}${m}${d2}-${h}${min}${s}`
    const fechaStr = `${y}-${m}-${d2}`

    const res = await window.db.insert('facturas', addAlmacenId({
      no_factura: noCredito,
      tipo_factura: 'NOTA_CREDITO',
      cod_cliente: codCliente,
      nombre_cliente: nombreCliente,
      telefono_cliente: nd.customer_phone || '',
      productos: JSON.stringify([{
        nombre: `RECIBIDO: ${getNombreTelefono(recibido.id_equi) || recibido.nombre || ''}`,
        cantidad: 1,
        precio: nd.credit_note_value,
        total: nd.credit_note_value,
      }]),
      total: nd.credit_note_value,
      subtotal: nd.credit_note_value,
      metodo_pago: 'EFECTIVO',
      estado_factura: 'PENDIENTE',
      fecha_emision: fechaStr,
      fecha_estado: fechaStr,
      hora: `${h}:${min}`,
      nota: `NOTA DE CREDITO POR EQUIPO RECIBIDO IMEI: ${recibido.nombre || ''}`,
      referencia_origen: `RECIBIDO:${recibido.id}`,
      mes: m,
      year: String(y),
    }))

    if (res.success) {
      nd.credit_note_id = res.data.id
      nd.credit_note_no = noCredito
      nd.credit_note_date = fechaStr
      await window.db.update('imei', recibido.id, { nota: JSON.stringify(nd) })
      toast.add({ severity: 'success', summary: 'Nota de Credito', detail: `${noCredito} por ${formatCurrency(nd.credit_note_value)}`, life: 4000 })
    }
  } catch {}
}

async function cargarClientes() {
  try {
    const res = await window.db.getAll('clientes')
    if (res.success) clientesLista.value = filterByAlmacen(res.data || [])
  } catch {}
}

function seleccionarCliente(cliente: any) {
  if (!cliente) return
  const parsed = JSON.parse(form.value.nota_json || '{}')
  parsed.customer_name = (cliente.nombre || '').toUpperCase()
  parsed.customer_phone = cliente.telefono || cliente.whatsapp || ''
  parsed.customer_cedula = cliente.cedula || cliente.rnc || ''
  form.value.nota_json = JSON.stringify(parsed)
}

async function guardarRecibir() {
  if (!form.value.nombre.trim() && !form.value.id_equi) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El IMEI o modelo del telefono es requerido', life: 3000 })
    return
  }
  if (form.value.nombre.trim() && form.value.nombre.trim().length !== 15) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El IMEI debe tener 15 digitos', life: 3000 })
    return
  }

  try {
    const nd = JSON.parse(form.value.nota_json || '{}')
    const nombreCliente = (nd.customer_name || '').toUpperCase().trim()
    let clienteId = ''
    if (nombreCliente && !selectedRecibido.value) {
      try {
        const resCli = await window.db.getAll('clientes')
        if (resCli.success) {
          const existente = filterByAlmacen(resCli.data || []).find((c: any) => (c.nombre || '').toUpperCase() === nombreCliente)
          if (existente) {
            clienteId = String(existente.id)
          } else {
            const resNuevo = await window.db.insert('clientes', addAlmacenId({
              nombre: nombreCliente,
              telefono: nd.customer_phone || '',
              cedula: nd.customer_cedula || '',
              rnc: nd.customer_cedula || '',
            }))
            if (resNuevo.success) clienteId = String(resNuevo.data.id)
          }
        }
      } catch {}
    }
    const data: any = {
      nombre: form.value.nombre.trim().toUpperCase(),
      id_equi: form.value.id_equi,
      telefono_uid: telefonos.value.find((telefono: any) => Number(telefono.id) === Number(form.value.id_equi))?.uid || '',
      equipo: getNombreTelefono(form.value.id_equi),
      color: form.value.color.trim().toUpperCase(),
      capacidad: form.value.capacidad.trim().toUpperCase(),
      costo: Number(nd.credit_note_value || 0),
      precio_venta: form.value.precio_venta || 0,
      estado: 'RECIBIDO',
      nota: JSON.stringify({ ...nd, cliente_id: clienteId }),
    }

    if (selectedRecibido.value) {
      const res = await window.db.update('imei', selectedRecibido.value.id, data)
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Actualizado', detail: 'Recibido actualizado', life: 3000 })
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('imei', addAlmacenId({ ...data }))
      if (res.success) {
        toast.add({ severity: 'success', summary: 'Recibido', detail: 'Equipo recibido correctamente', life: 3000 })
        const nuevoRecibido = { id: res.data.id, ...data }
        const ncVal = nd.credit_note_value
        if (ncVal && ncVal > 0) {
          await crearNotaCreditoInterna(nuevoRecibido)
        }
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
        return
      }
    }

    dialogVisible.value = false
    selectedRecibido.value = null
    await cargarRecibidos()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  }
}

function confirmarBorrar(recibido: any) {
  selectedRecibido.value = recibido
  resetDeleteOtp()
  deleteDialogVisible.value = true
}

function resetDeleteOtp() {
  deleteOtpEnviado.value = false
  deleteOtpEmail.value = ''
  deleteOtp.value = ''
  deleteOtpError.value = ''
  deleteOtpLoading.value = false
  deleteOtpConfirmando.value = false
}

function estaSeleccionado(recibido: any): boolean {
  return recibidosSeleccionados.value.some((item: any) => item.id === recibido.id)
}

function toggleSeleccionRecibido(recibido: any) {
  if (estaSeleccionado(recibido)) {
    recibidosSeleccionados.value = recibidosSeleccionados.value.filter((item: any) => item.id !== recibido.id)
  } else {
    recibidosSeleccionados.value = [...recibidosSeleccionados.value, recibido]
  }
}

function confirmarBorrarSeleccionados() {
  if (!recibidosSeleccionados.value.length) {
    toast.add({ severity: 'warn', summary: 'Seleccion', detail: 'Selecciona al menos un recibido', life: 2500 })
    return
  }
  resetDeleteOtp()
  deleteMultipleDialogVisible.value = true
}

function recibidosParaOtp(): any[] {
  if (deleteMultipleDialogVisible.value) return recibidosSeleccionados.value
  return selectedRecibido.value ? [selectedRecibido.value] : []
}

async function solicitarOtpEliminarRecibidos() {
  const registros = recibidosParaOtp()
  if (!registros.length) return

  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true

  try {
    const total = registros.reduce((sum: number, recibido: any) => sum + Number(getNotaDataFromImei(recibido).credit_note_value || 0), 0)
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: registros[0]?.id,
      facturaIds: registros.map((recibido: any) => recibido.id),
      no_factura: registros.length === 1 ? `RECIBIDO-${registros[0].id}` : 'RECIBIDOS',
      nombre_cliente: registros.length === 1 ? (getNotaDataFromImei(registros[0]).customer_name || '') : `${registros.length} recibidos`,
      cantidad: registros.length,
      total,
    }) as any

    if (res.success) {
    deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (error: any) {
    deleteOtpError.value = error?.message || 'Error solicitando codigo'
  } finally {
    deleteOtpLoading.value = false
  }
}

async function confirmarOtpEliminarRecibidos(): Promise<boolean> {
  const registros = recibidosParaOtp()
  const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
  if (!registros.length) return false
  if (!/^\d{4}$/.test(codigo)) {
    deleteOtpError.value = 'Introduce el codigo de 4 digitos'
    return false
  }

  deleteOtpConfirmando.value = true
  deleteOtpError.value = ''

  try {
    const otpRes = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: registros[0]?.id,
      facturaIds: registros.map((recibido: any) => recibido.id),
      codigo,
    }) as any

    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return false
    }
    return true
  } catch (error: any) {
    deleteOtpError.value = error?.message || 'Error al confirmar codigo'
    return false
  } finally {
    deleteOtpConfirmando.value = false
  }
}

async function borrar() {
  if (!await confirmarOtpEliminarRecibidos()) return
  try {
    const res = await window.db.delete('imei', selectedRecibido.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Registro eliminado', life: 3000 })
    }
    deleteDialogVisible.value = false
    resetDeleteOtp()
    recibidosSeleccionados.value = recibidosSeleccionados.value.filter((item: any) => item.id !== selectedRecibido.value?.id)
    await cargarRecibidos()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  }
}

async function borrarSeleccionados() {
  const seleccion = [...recibidosSeleccionados.value]
  if (!seleccion.length) return
  if (!await confirmarOtpEliminarRecibidos()) return
  try {
    let eliminados = 0
    for (const recibido of seleccion) {
      const res = await window.db.delete('imei', recibido.id)
      if (res.success) eliminados++
    }
    toast.add({ severity: 'success', summary: 'Eliminados', detail: `${eliminados} registro(s) eliminado(s)`, life: 3000 })
    deleteMultipleDialogVisible.value = false
    resetDeleteOtp()
    recibidosSeleccionados.value = []
    await cargarRecibidos()
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  }
}

async function generarNotaCredito(recibido: any) {
  const nd = getNotaDataFromImei(recibido)
  if (nd.credit_note_id) {
    toast.add({ severity: 'warn', summary: 'Ya generada', detail: `Nota de credito ${nd.credit_note_no} ya fue generada`, life: 3000 })
    return
  }
  if (!nd.credit_note_value || nd.credit_note_value <= 0) {
    toast.add({ severity: 'warn', summary: 'Sin valor', detail: 'Establece un valor para la nota de credito', life: 3000 })
    return
  }

  generandoNC.value = true
  try {
    const result = await ensureRecibidoCreditNote(recibido, {
      almacenId: almacenStore.activeId || 0,
      almacenUid: almacenStore.activeUid || '',
      productName: getNombreTelefono(recibido.id_equi) || recibido.nombre || '',
    })
    if (!result) throw new Error('Establece un valor para la nota de credito')
    toast.add({
      severity: result.created ? 'success' : 'info',
      summary: result.created ? 'Nota de Credito' : 'Nota existente',
      detail: `${result.factura.no_factura} por ${formatCurrency(result.factura.total)}`,
      life: 4000,
    })
    await cargarRecibidos()
    return
    /* Legacy implementation retained temporarily below; all calls return through the shared service. */
    const nombreCliente = (nd.customer_name || 'CONSUMIDOR FINAL').toUpperCase()
    const codCliente = nd.cliente_id || ''
    const now = new Date()
    const y = now.getFullYear()
    const m = String(now.getMonth() + 1).padStart(2, '0')
    const d = String(now.getDate()).padStart(2, '0')
    const h = String(now.getHours()).padStart(2, '0')
    const min = String(now.getMinutes()).padStart(2, '0')
    const s = String(now.getSeconds()).padStart(2, '0')
    const noCredito = `NC-${y}${m}${d}-${h}${min}${s}`
    const fechaStr = `${y}-${m}-${d}`
    const horaStr = `${h}:${min}`

    const res = await window.db.insert('facturas', addAlmacenId({
      no_factura: noCredito,
      tipo_factura: 'NOTA_CREDITO',
      cod_cliente: codCliente,
      nombre_cliente: nombreCliente,
      telefono_cliente: nd.customer_phone || '',
      productos: JSON.stringify([{
        nombre: `RECIBIDO: ${getNombreTelefono(recibido.id_equi) || recibido.nombre}`,
        cantidad: 1,
        precio: nd.credit_note_value,
        total: nd.credit_note_value,
      }]),
      total: nd.credit_note_value,
      subtotal: nd.credit_note_value,
      metodo_pago: 'EFECTIVO',
      estado_factura: 'PENDIENTE',
      fecha_emision: fechaStr,
      fecha_estado: fechaStr,
      hora: horaStr,
      nota: `NOTA DE CREDITO POR EQUIPO RECIBIDO IMEI: ${recibido.nombre}`,
      referencia_origen: `RECIBIDO:${recibido.id}`,
      mes: m,
      year: String(y),
    }))

    if (res.success) {
      nd.credit_note_id = res.data.id
      nd.credit_note_no = noCredito
      nd.credit_note_date = fechaStr
      await window.db.update('imei', recibido.id, { nota: JSON.stringify(nd) })
      toast.add({ severity: 'success', summary: 'Nota de Credito', detail: `${noCredito} por ${formatCurrency(nd.credit_note_value)}`, life: 4000 })
      await cargarRecibidos()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo generar la nota de credito', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    generandoNC.value = false
  }
}

function abrirTallerDialog(recibido: any) {
  selectedRecibido.value = recibido
  tallerForm.value = { tecnico: '', fallas: '', accesorios: '' }
  dialogEnviarTaller.value = true
}

async function enviarAlTaller() {
  if (!selectedRecibido.value) return
  enviandoTaller.value = true
  try {
    const now = new Date()
    const fechaStr = now.toISOString().split('T')[0]
    const nd = getNotaDataFromImei(selectedRecibido.value)
    const nombreCliente = nd.customer_name || 'CONSUMIDOR FINAL'

    const res = await window.db.insert('ordenes_taller', addAlmacenId({
      nombre: nombreCliente.toUpperCase(),
      telefono: nd.customer_phone || '',
      equipo: getNombreTelefono(selectedRecibido.value.id_equi) || 'TELEFONO',
      imei: selectedRecibido.value.nombre || '',
      marca_modelo: (getNombreTelefono(selectedRecibido.value.id_equi) || '') + ' ' + (selectedRecibido.value.color || '') + ' ' + (selectedRecibido.value.capacidad || ''),
      accesorios: tallerForm.value.accesorios.toUpperCase(),
      fallas: tallerForm.value.fallas.toUpperCase(),
      tecnico: tallerForm.value.tecnico.toUpperCase(),
      estado: 'RECIBIDO',
      fecha_entrada: fechaStr,
      total: nd.credit_note_value || 0,
      metodo_pago: 'EFECTIVO',
    }))

    if (res.success) {
      await window.db.update('imei', selectedRecibido.value.id, { estado: 'EN_GARANTIA' })
      toast.add({ severity: 'success', summary: 'Enviado al Taller', detail: 'Orden de taller creada', life: 3000 })
      dialogEnviarTaller.value = false
      await cargarRecibidos()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear la orden', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    enviandoTaller.value = false
  }
}

function abrirPublicarImei(recibido: any) {
  selectedRecibido.value = recibido
  const nd = getNotaDataFromImei(recibido)
  const ndVal = nd.credit_note_value || 0
  const precioVenta = Number(recibido.precio_venta || 0)
  imeiPublishForm.value = {
    costo: Number(recibido.costo || ndVal || 0),
    precio_venta: precioVenta > 0 ? precioVenta : (ndVal > 0 ? ndVal * 1.3 : 0),
    precio_min: ndVal > 0 ? ndVal * 1.15 : 0,
    precio_xmayor: ndVal > 0 ? ndVal * 1.2 : 0,
  }
  dialogPublicarImei.value = true
}

async function publicarComoImei() {
  if (!selectedRecibido.value) return
  if (!imeiPublishForm.value.precio_venta || imeiPublishForm.value.precio_venta <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El precio de venta es requerido', life: 3000 })
    return
  }

  const telefonoUidActual = String(selectedRecibido.value.telefono_uid || '')
  const equipoAsignado = telefonosAlmacenActual.value.find((telefono: any) =>
    Boolean(telefonoUidActual) && String(telefono.uid || '') === telefonoUidActual
  ) || telefonosAlmacenActual.value.find((telefono: any) =>
    Number(telefono.id) === Number(selectedRecibido.value.id_equi)
  )

  if (!equipoAsignado || !String(equipoAsignado.uid || '')) {
    toast.add({
      severity: 'warn',
      summary: 'Equipo requerido',
      detail: 'El IMEI debe tener asignado un equipo con UID del almacén actual antes de publicarlo',
      life: 4000,
    })
    return
  }

  publicandoImei.value = true
  try {
    const data: any = {
      estado: 'DISPONIBLE',
      id_equi: Number(equipoAsignado.id),
      telefono_uid: String(equipoAsignado.uid),
      equipo: String(equipoAsignado.nombre || '').toUpperCase(),
      almacen_id: Number(almacenStore.activeId || equipoAsignado.almacen_id || 0),
      almacen_uid: String(almacenStore.activeUid || equipoAsignado.almacen_uid || ''),
      costo: Number(imeiPublishForm.value.costo || 0),
      precio_venta: imeiPublishForm.value.precio_venta,
      precio_min: imeiPublishForm.value.precio_min || 0,
      precio_xmayor: imeiPublishForm.value.precio_xmayor || 0,
    }

    const res = await window.db.update('imei', selectedRecibido.value.id, data)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Publicado', detail: 'IMEI disponible en inventario', life: 3000 })
      dialogPublicarImei.value = false
      await cargarRecibidos()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo publicar', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    publicandoImei.value = false
  }
}

function abrirNotaCreditoDialog(recibido: any) {
  selectedRecibido.value = recibido
  dialogGenerarNC.value = true
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      // config loaded if needed
    }
  } catch (_) {}

  await almacenStore.load()
  await Promise.all([cargarRecibidos(), cargarTelefonos()])
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Equipos Recibidos (Trade-in)">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <div class="flex items-center gap-2 flex-wrap">
          <IconField>
            <InputIcon class="pi pi-search" />
            <InputText v-model="busqueda" placeholder="Buscar por IMEI, cliente, modelo..." />
          </IconField>
          <Select
            v-model="estadoFiltro"
            :options="estadoOptions"
            optionLabel="label"
            optionValue="value"
            placeholder="Estado"
            class="w-48"
          />
        </div>

        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button v-if="recibidosSeleccionados.length" :label="`Cambiar almacén (${recibidosSeleccionados.length})`" icon="pi pi-warehouse" severity="success" @click="abrirMoverAlmacen" />
          <Button
            v-if="recibidosSeleccionados.length"
            :label="`Eliminar (${recibidosSeleccionados.length})`"
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="confirmarBorrarSeleccionados"
          />
          <div class="inline-flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer"
              :class="viewMode === 'table'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'table'"
            >
              <i class="pi pi-list"></i>
            </button>
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-surface-200 dark:border-surface-700"
              :class="viewMode === 'cards'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'cards'"
            >
              <i class="pi pi-th-large"></i>
            </button>
          </div>
          <Button label="Recibir Equipo" icon="pi pi-plus" @click="abrirRecibir" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="recibidosFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        v-model:selection="recibidosSeleccionados"
        responsiveLayout="scroll"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="id" header="ID" style="width: 4rem" />
        <Column header="Modelo" sortable style="width: 10rem">
          <template #body="{ data }">
            {{ getNombreTelefono(data.id_equi) || 'SIN MODELO' }}
          </template>
        </Column>
        <Column field="nombre" header="IMEI" sortable style="width: 10rem" />
        <Column field="capacidad" header="Capacidad" sortable style="width: 7rem">
          <template #body="{ data }">{{ formatCapacidad(data.capacidad) }}</template>
        </Column>
        <Column header="Cliente" sortable style="width: 10rem">
          <template #body="{ data }">
            {{ getNotaDataFromImei(data).customer_name || '—' }}
          </template>
        </Column>
        <Column header="Cedula" sortable style="width: 9rem">
          <template #body="{ data }">
            {{ getNotaDataFromImei(data).customer_cedula || '-' }}
          </template>
        </Column>
        <Column header="Valor NC" sortable style="width: 8rem">
          <template #body="{ data }">
            {{ $formatMoney(getNotaDataFromImei(data).credit_note_value) }}
          </template>
        </Column>
        <Column header="Precio Venta" sortable style="width: 8rem">
          <template #body="{ data }">
            {{ $formatMoney(data.precio_venta || 0) }}
          </template>
        </Column>
        <Column header="Estado NC" style="width: 8rem">
          <template #body="{ data }">
            <span
              v-if="getNotaDataFromImei(data).credit_note_id"
              class="text-xs font-semibold px-2 py-0.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300"
            >
              {{ getNotaDataFromImei(data).credit_note_no }}
            </span>
            <span v-else class="text-xs font-semibold px-2 py-0.5 rounded-full bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300">
              PENDIENTE
            </span>
          </template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width: 8rem">
          <template #body="{ data }">
            <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">
              {{ estadoRecibido(data) }}
            </span>
          </template>
        </Column>
        <Column header="Acciones" style="width: 14rem">
          <template #body="{ data }">
            <div class="flex gap-1 flex-wrap">
              <Button icon="pi pi-file-minus" severity="success" text rounded size="small" v-tooltip="'Generar Nota de Credito'" @click.stop="abrirNotaCreditoDialog(data)" />
              <Button icon="pi pi-wrench" severity="info" text rounded size="small" v-tooltip="'Enviar al Taller'" @click.stop="abrirTallerDialog(data)" />
              <Button icon="pi pi-shopping-cart" severity="primary" text rounded size="small" v-tooltip="'Publicar en IMEI'" @click.stop="abrirPublicarImei(data)" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" v-tooltip="'Editar'" @click.stop="abrirEditar(data)" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" v-tooltip="'Eliminar'" @click.stop="confirmarBorrar(data)" />
            </div>
          </template>
        </Column>

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay equipos recibidos.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="recibidosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay equipos recibidos.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="recibido in recibidosFiltrados"
            :key="recibido.id"
            class="rounded-xl border bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600"
            :class="estaSeleccionado(recibido) ? 'border-primary-400 ring-2 ring-primary-100 dark:ring-primary-900/40' : 'border-surface-200 dark:border-surface-700'"
          >
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-2">
                <input
                  type="checkbox"
                  class="w-4 h-4 accent-primary-500 cursor-pointer"
                  :checked="estaSeleccionado(recibido)"
                  @change.stop="toggleSeleccionRecibido(recibido)"
                />
                <span class="text-xs font-mono text-surface-400">#{{ recibido.id }}</span>
              </div>
              <span class="text-xs font-semibold px-2 py-0.5 rounded-full bg-yellow-100 text-yellow-700 dark:bg-yellow-900 dark:text-yellow-300">{{ estadoRecibido(recibido) }}</span>
            </div>
            <div class="min-w-0">
              <h4 class="font-bold text-base leading-tight truncate">{{ getNombreTelefono(recibido.id_equi) || 'SIN MODELO' }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">IMEI: {{ recibido.nombre || '—' }}</p>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ getNotaDataFromImei(recibido).customer_name || 'Sin cliente' }}</p>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">Cedula: {{ getNotaDataFromImei(recibido).customer_cedula || '-' }}</p>
            </div>
            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2">
                <i class="pi pi-dollar text-surface-400"></i>
                <span class="font-semibold">{{ $formatMoney(getNotaDataFromImei(recibido).credit_note_value) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <i class="pi pi-shopping-cart text-surface-400"></i>
                <span class="font-semibold">{{ $formatMoney(recibido.precio_venta || 0) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <i class="pi pi-tag text-surface-400"></i>
                <span>{{ recibido.color || '—' }} · {{ formatCapacidad(recibido.capacidad) }}</span>
              </div>
              <div class="flex items-center gap-2">
                <i class="pi pi-file text-surface-400"></i>
                <span v-if="getNotaDataFromImei(recibido).credit_note_no" class="text-green-600 dark:text-green-400">{{ getNotaDataFromImei(recibido).credit_note_no }}</span>
                <span v-else class="text-surface-400">Sin NC</span>
              </div>
            </div>
            <div class="flex gap-1 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700 flex-wrap">
              <Button icon="pi pi-file-minus" severity="success" text rounded size="small" v-tooltip="'Generar NC'" @click.stop="abrirNotaCreditoDialog(recibido)" />
              <Button icon="pi pi-wrench" severity="info" text rounded size="small" v-tooltip="'Taller'" @click.stop="abrirTallerDialog(recibido)" />
              <Button icon="pi pi-shopping-cart" severity="primary" text rounded size="small" v-tooltip="'IMEI'" @click.stop="abrirPublicarImei(recibido)" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" v-tooltip="'Editar'" @click.stop="abrirEditar(recibido)" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" v-tooltip="'Eliminar'" @click.stop="confirmarBorrar(recibido)" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ recibidosSeleccionados.length }}</strong> equipo(s) recibido(s) a otro almacén:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover recibidos" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="dialogVisible"
      :header="selectedRecibido ? 'Editar Equipo Recibido' : 'Recibir Equipo'"
      modal
      :style="{ width: 'min(48rem, 95vw)' }"
    >
      <TabView>
        <TabPanel header="Equipo">
          <div class="flex flex-col gap-3 pt-2">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Modelo del Telefono</label>
              <div class="flex gap-2">
                <Select v-model="form.id_equi" :options="telefonosAlmacenActual" optionLabel="nombre" optionValue="id" placeholder="Seleccionar modelo" filter class="flex-1" @change="form.telefono_modelo = getNombreTelefono(form.id_equi)" />
                <Button icon="pi pi-plus" severity="secondary" @click="dialogNuevoTelefono = true" v-tooltip="'Crear nuevo modelo'" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">IMEI</label>
              <InputText :value="form.nombre" placeholder="IMEI de 15 digitos" inputmode="numeric" maxlength="15" @input="setImei(($event.target as HTMLInputElement).value)" />
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Color</label>
                <InputText v-model="form.color" placeholder="Color" class="uppercase" style="text-transform: uppercase;" />
              </div>
              <div class="flex flex-col gap-1">
                <label class="text-sm font-semibold">Capacidad</label>
                <InputText v-model="form.capacidad" placeholder="Ej: 128GB" class="uppercase" style="text-transform: uppercase;" />
              </div>
            </div>
          </div>
        </TabPanel>
        <TabPanel header="Cliente / Valor">
          <div class="flex flex-col gap-3 pt-2">
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Buscar Cliente Existente</label>
              <Select
                v-model="clienteSeleccionadoBusqueda"
                :options="clientesLista"
                optionLabel="nombre"
                placeholder="Seleccionar cliente"
                filter
                showClear
                fluid
                @show="cargarClientes"
                @update:modelValue="seleccionarCliente"
              >
                <template #value="{ value, placeholder }">
                  <div v-if="value" class="flex flex-col leading-tight">
                    <span class="font-semibold text-sm truncate">{{ value.nombre }}</span>
                    <span class="text-xs text-surface-500 truncate">{{ value.telefono || value.whatsapp || value.cedula || value.rnc || 'Sin datos' }}</span>
                  </div>
                  <span v-else class="text-surface-400">{{ placeholder }}</span>
                </template>
                <template #option="{ option }">
                  <div class="flex flex-col leading-tight py-1">
                    <span class="font-semibold text-sm">{{ option.nombre }}</span>
                    <span class="text-xs text-surface-500">{{ option.telefono || option.whatsapp || 'Sin telefono' }} - {{ option.cedula || option.rnc || 'Sin cedula' }}</span>
                  </div>
                </template>
              </Select>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Cedula</label>
              <div class="flex gap-2">
                <InputText :value="notaData.customer_cedula" @input="setCustomerCedula(($event.target as HTMLInputElement).value)" placeholder="Cedula o RNC" class="flex-1" @keydown.enter="buscarClientePorDocumento" />
                <Button icon="pi pi-search" severity="info" :loading="buscandoDocumento" @click="buscarClientePorDocumento" v-tooltip="'Buscar en API'" />
              </div>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Nombre del Cliente (dueño del equipo)</label>
              <InputText :value="notaData.customer_name" @input="setCustomerName(($event.target as HTMLInputElement).value)" placeholder="Nombre completo" class="uppercase" style="text-transform: uppercase;" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Telefono</label>
              <InputText :value="notaData.customer_phone" @input="setCustomerPhone(($event.target as HTMLInputElement).value)" placeholder="Telefono" />
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Valor de Nota de Credito (RD$)</label>
              <InputNumber :value="notaData.credit_note_value" @update:modelValue="setCreditNoteValue" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
              <p class="text-xs text-surface-400">Monto que se le ofrecera al cliente como nota de credito</p>
            </div>
            <div class="flex flex-col gap-1">
              <label class="text-sm font-semibold">Precio de venta</label>
              <InputNumber v-model="form.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
            </div>
          </div>
        </TabPanel>
      </TabView>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="selectedRecibido ? 'Actualizar' : 'Recibir Equipo'" icon="pi pi-check" @click="guardarRecibir" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogNuevoTelefono" header="Nuevo Modelo de Telefono" modal :style="{ width: '24rem' }">
      <div class="flex flex-col gap-3 pt-2">
        <InputText v-model="nuevoTelefonoForm.nombre" placeholder="Ej: iPhone 14 Pro Max" class="uppercase" style="text-transform: uppercase;" @keyup.enter="crearTelefono" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogNuevoTelefono = false" />
        <Button label="Crear" icon="pi pi-check" :loading="guardandoTelefono" @click="crearTelefono" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogGenerarNC" header="Generar Nota de Credito" modal :style="{ width: '24rem' }">
      <div v-if="selectedRecibido" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Modelo</span>
            <span class="font-semibold">{{ getNombreTelefono(selectedRecibido.id_equi) || 'SIN MODELO' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">IMEI</span>
            <span class="font-semibold">{{ selectedRecibido.nombre || '—' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Cliente</span>
            <span class="font-semibold">{{ getNotaDataFromImei(selectedRecibido).customer_name || 'CONSUMIDOR FINAL' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Valor NC</span>
            <span class="font-bold text-primary">{{ $formatMoney(getNotaDataFromImei(selectedRecibido).credit_note_value) }}</span>
          </div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogGenerarNC = false" />
        <Button label="Generar Nota de Credito" icon="pi pi-file-minus" :loading="generandoNC" @click="generarNotaCredito(selectedRecibido)" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogEnviarTaller" header="Enviar al Taller" modal :style="{ width: '90%', maxWidth: '450px' }">
      <div v-if="selectedRecibido" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Equipo</span>
            <span class="font-semibold">{{ getNombreTelefono(selectedRecibido.id_equi) || selectedRecibido.nombre }}</span>
          </div>
        </div>
        <InputText v-model="tallerForm.tecnico" placeholder="Nombre del tecnico" class="uppercase w-full" style="text-transform: uppercase;" />
        <Textarea v-model="tallerForm.fallas" placeholder="Describir las fallas del equipo" rows="3" class="uppercase w-full" style="text-transform: uppercase;" />
        <Textarea v-model="tallerForm.accesorios" placeholder="Accesorios que vienen con el equipo" rows="2" class="uppercase w-full" style="text-transform: uppercase;" />
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogEnviarTaller = false" />
        <Button label="Enviar al Taller" icon="pi pi-wrench" :loading="enviandoTaller" @click="enviarAlTaller" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogPublicarImei" header="Publicar en Inventario (IMEI)" modal :style="{ width: '90%', maxWidth: '450px' }">
      <div v-if="selectedRecibido" class="space-y-4 pt-2">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Modelo</span>
            <span class="font-semibold">{{ getNombreTelefono(selectedRecibido.id_equi) || 'SIN MODELO' }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">IMEI</span>
            <span class="font-semibold">{{ selectedRecibido.nombre || '—' }}</span>
          </div>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Costo real del equipo (RD$)</label>
          <InputNumber v-model="imeiPublishForm.costo" mode="currency" :currency="systemCurrency" :locale="systemLocale" :min="0" fluid />
          <p class="text-xs text-surface-400">Se toma del valor registrado cuando se recibió el celular.</p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Precio de Venta (RD$)</label>
          <InputNumber v-model="imeiPublishForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Precio Minimo (RD$)</label>
          <InputNumber v-model="imeiPublishForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Precio por Mayor (RD$)</label>
          <InputNumber v-model="imeiPublishForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogPublicarImei = false" />
        <Button label="Publicar en IMEI" icon="pi pi-check" :loading="publicandoImei" @click="publicarComoImei" />
      </template>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" header="Eliminar" modal :style="{ width: '24rem' }">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span>Seguro que deseas eliminar este registro?</span>
        </div>
        <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
          Esta accion requiere codigo OTP enviado al correo de la empresa.
        </div>
        <div v-if="deleteOtpEnviado" class="space-y-2">
        <p class="text-xs text-surface-500">Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.</p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly />
        </div>
        <p v-if="deleteOtpError" class="text-sm text-red-500">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false; resetDeleteOtp()" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-send"
          severity="warning"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarRecibidos"
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

    <Dialog v-model:visible="deleteMultipleDialogVisible" header="Eliminar seleccionados" modal :style="{ width: '26rem' }">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span>Seguro que deseas eliminar {{ recibidosSeleccionados.length }} registro(s)?</span>
        </div>
        <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
          Esta accion requiere codigo OTP enviado al correo de la empresa.
        </div>
        <div v-if="deleteOtpEnviado" class="space-y-2">
        <p class="text-xs text-surface-500">Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.</p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly />
        </div>
        <p v-if="deleteOtpError" class="text-sm text-red-500">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteMultipleDialogVisible = false; resetDeleteOtp()" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-send"
          severity="warning"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarRecibidos"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          @click="borrarSeleccionados"
        />
      </template>
    </Dialog>
  </div>
</template>
