<script setup lang="ts">
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
import { computed, ref, watch } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import TabView from 'primevue/tabview'
import TabPanel from 'primevue/tabpanel'
import { useToast } from 'primevue/usetoast'
import { encryptarPassword, peticionesFetch } from '@/funciones/funciones.js'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { ensureRecibidoCreditNote } from '@/services/recibidosCreditNoteService'

const props = defineProps<{
  visible: boolean
  initialData?: Record<string, any> | null
  askPublishAfterSave?: boolean
}>()

const emit = defineEmits<{
  close: []
  saved: [payload?: any]
}>()

const toast = useToast()
const { addAlmacenId, store: almacenStore } = useAlmacenFilter()
const telefonos = ref<any[]>([])
const clientesLista = ref<any[]>([])
const clienteSeleccionadoBusqueda = ref<any | null>(null)
const dialogNuevoTelefono = ref(false)
const nuevoTelefonoForm = ref({ nombre: '' })
const guardandoTelefono = ref(false)
const guardando = ref(false)
const buscandoDocumento = ref(false)
const dialogPublicarImei = ref(false)
const publicandoImei = ref(false)
const recibidoCreado = ref<any | null>(null)
const imeiPublishForm = ref({
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

const clienteCompleto = computed(() => {
  const cliente = notaData.value
  return Boolean(
    String(cliente.customer_name || '').trim()
    && String(cliente.customer_phone || '').trim()
    && String(cliente.customer_cedula || '').trim(),
  )
})

function formatCurrency(n: number): string {
  if (n == null) return '0.00'
  return Number(n).toLocaleString(systemLocale.value, { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

function getNombreTelefono(id_equi: number | null): string {
  if (!id_equi) return ''
  const tel = telefonos.value.find(t => t.id === id_equi)
  return tel?.nombre || ''
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
    parsed.customer_cedula = val.replace(/-/g, '')
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

function aplicarDatosIniciales() {
  if (!props.initialData) return
  const parsed = JSON.parse(form.value.nota_json || '{}')
  parsed.customer_name = (props.initialData.customer_name || props.initialData.nombre || parsed.customer_name || '').toUpperCase()
  parsed.customer_phone = props.initialData.customer_phone || props.initialData.telefono || parsed.customer_phone || ''
  parsed.customer_cedula = props.initialData.customer_cedula || props.initialData.cedula || props.initialData.rnc || parsed.customer_cedula || ''
  form.value.nota_json = JSON.stringify(parsed)
}

async function cargarTelefonos() {
  try {
    const res = await window.db.getAll('telefonos')
    if (res.success) telefonos.value = res.data || []
  } catch {}
}

async function cargarClientes() {
  try {
    const res = await window.db.getAll('clientes')
    if (res.success) clientesLista.value = res.data || []
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

async function crearTelefono() {
  if (!nuevoTelefonoForm.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del telefono es requerido', life: 3000 })
    return
  }
  guardandoTelefono.value = true
  try {
    const nombre = nuevoTelefonoForm.value.nombre.trim().toUpperCase()
    const res = await window.db.insert('telefonos', addAlmacenId({ nombre }))
    if (res.success) {
      const nuevo = { id: res.data.id, nombre }
      telefonos.value.unshift(nuevo)
      form.value.id_equi = nuevo.id
      form.value.telefono_modelo = nuevo.nombre
      dialogNuevoTelefono.value = false
      nuevoTelefonoForm.value.nombre = ''
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
  return result?.recibido || null
  /* Legacy implementation retained temporarily below; all calls return through the shared service. */
  try {
    const nd = JSON.parse(recibido.nota || '{}')
    if (!nd.credit_note_value || nd.credit_note_value <= 0) return null
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
      toast.add({ severity: 'success', summary: 'Nota de Credito', detail: `${noCredito} por RD$ ${formatCurrency(nd.credit_note_value)}`, life: 4000 })
      return {
        ...recibido,
        nota: JSON.stringify(nd),
        notaCredito: {
          id: res.data.id,
          no_factura: noCredito,
          tipo_factura: 'NOTA_CREDITO',
          cod_cliente: codCliente,
          nombre_cliente: nombreCliente,
          telefono_cliente: nd.customer_phone || '',
          total: nd.credit_note_value,
          estado_factura: 'PENDIENTE',
        },
      }
    }
  } catch {}
  return null
}

async function guardarRecibir() {
  if (!clienteCompleto.value) {
    toast.add({ severity: 'warn', summary: 'Cliente requerido', detail: 'Completa nombre, telefono y cedula/RNC del cliente para recibir el equipo', life: 3500 })
    return
  }
  if (!form.value.nombre.trim() && !form.value.id_equi) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El IMEI o modelo del telefono es requerido', life: 3000 })
    return
  }
  if (form.value.nombre.trim() && form.value.nombre.trim().length !== 15) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El IMEI debe tener 15 digitos', life: 3000 })
    return
  }

  guardando.value = true
  try {
    const nd = JSON.parse(form.value.nota_json || '{}')
    const nombreCliente = (nd.customer_name || '').toUpperCase().trim()
    let clienteId = ''
    if (nombreCliente) {
      try {
        const resCli = await window.db.getAll('clientes')
        if (resCli.success) {
          const existente = (resCli.data || []).find((c: any) => (c.nombre || '').toUpperCase() === nombreCliente)
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
      color: form.value.color.trim().toUpperCase(),
      capacidad: form.value.capacidad.trim().toUpperCase(),
      precio_venta: form.value.precio_venta || 0,
      estado: 'RECIBIDO',
      nota: JSON.stringify({ ...nd, cliente_id: clienteId }),
    }

    const res = await window.db.insert('imei', addAlmacenId(data))
    if (res.success) {
      let nuevoRecibido = { id: res.data.id, ...data }
      toast.add({ severity: 'success', summary: 'Recibido', detail: 'Equipo recibido correctamente', life: 3000 })
      if (nd.credit_note_value && nd.credit_note_value > 0) {
        nuevoRecibido = await crearNotaCreditoInterna(nuevoRecibido) || nuevoRecibido
      }
      if (props.askPublishAfterSave !== false) {
        const valor = Number(nd.credit_note_value || 0)
        const precioVenta = Number(form.value.precio_venta || 0)
        recibidoCreado.value = nuevoRecibido
        imeiPublishForm.value = {
          precio_venta: precioVenta > 0 ? precioVenta : (valor > 0 ? Math.round(valor * 1.3 * 100) / 100 : 0),
          precio_min: valor > 0 ? Math.round(valor * 1.15 * 100) / 100 : 0,
          precio_xmayor: valor > 0 ? Math.round(valor * 1.2 * 100) / 100 : 0,
        }
        dialogPublicarImei.value = true
      } else {
        emit('saved', nuevoRecibido)
        emit('close')
      }
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

function cerrarSinPublicar() {
  const recibido = recibidoCreado.value
  dialogPublicarImei.value = false
  recibidoCreado.value = null
  emit('saved', recibido)
  emit('close')
}

async function publicarComoImei() {
  if (!recibidoCreado.value) return
  if (!imeiPublishForm.value.precio_venta || imeiPublishForm.value.precio_venta <= 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El precio de venta es requerido', life: 3000 })
    return
  }

  publicandoImei.value = true
  try {
    let valorNotaCredito = 0
    try {
      valorNotaCredito = Number(JSON.parse(recibidoCreado.value.nota || '{}').credit_note_value || 0)
    } catch {}

    const data: any = {
      estado: 'DISPONIBLE',
      precio_venta: imeiPublishForm.value.precio_venta,
      precio_min: imeiPublishForm.value.precio_min || 0,
      precio_xmayor: imeiPublishForm.value.precio_xmayor || 0,
    }

    if (valorNotaCredito > 0) {
      data.costo = valorNotaCredito
    } else if (!recibidoCreado.value.costo && imeiPublishForm.value.precio_min > 0) {
      data.costo = imeiPublishForm.value.precio_min * 0.7
    }

    const res = await window.db.update('imei', recibidoCreado.value.id, data)
    if (res.success) {
      const publicado = { ...recibidoCreado.value, ...data }
      toast.add({ severity: 'success', summary: 'Publicado', detail: 'IMEI disponible en inventario', life: 3000 })
      dialogPublicarImei.value = false
      recibidoCreado.value = null
      emit('saved', publicado)
      emit('close')
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo publicar', life: 3000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 3000 })
  } finally {
    publicandoImei.value = false
  }
}

watch(() => props.visible, async (visible) => {
  if (!visible) return
  form.value = formDefault()
  clienteSeleccionadoBusqueda.value = null
  recibidoCreado.value = null
  dialogPublicarImei.value = false
  await Promise.all([cargarTelefonos(), cargarClientes()])
  aplicarDatosIniciales()
})
</script>

<template>
  <Dialog
    :visible="visible"
    header="Recibir Equipo"
    modal
    :style="{ width: 'min(48rem, 95vw)' }"
    @update:visible="value => { if (!value) emit('close') }"
  >
    <TabView>
      <TabPanel header="Equipo">
        <div class="flex flex-col gap-3 pt-2">
          <div class="flex flex-col gap-1">
            <label class="text-sm font-semibold">Modelo del Telefono</label>
            <div class="flex gap-2">
              <Select v-model="form.id_equi" :options="telefonos" optionLabel="nombre" optionValue="id" placeholder="Seleccionar modelo" filter class="flex-1" @change="form.telefono_modelo = getNombreTelefono(form.id_equi)" />
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
                  <span class="text-xs text-surface-500">{{ option.telefono || option.whatsapp || 'Sin telefono' }} · {{ option.cedula || option.rnc || 'Sin cedula' }}</span>
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
            <label class="text-sm font-semibold">Nombre del Cliente (dueno del equipo)</label>
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
      <Button label="Cancelar" severity="secondary" text @click="emit('close')" />
      <Button label="Recibir Equipo" icon="pi pi-check" :loading="guardando" :disabled="!clienteCompleto" @click="guardarRecibir" />
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

  <Dialog
    v-model:visible="dialogPublicarImei"
    header="Publicar en IMEI"
    modal
    :closable="false"
    :style="{ width: 'min(30rem, 95vw)' }"
  >
    <div v-if="recibidoCreado" class="space-y-4 pt-2">
      <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 text-sm">
        <div class="flex justify-between gap-3">
          <span class="text-surface-500">Modelo</span>
          <span class="font-semibold text-right">{{ getNombreTelefono(recibidoCreado.id_equi) || 'SIN MODELO' }}</span>
        </div>
        <div class="flex justify-between gap-3 mt-1">
          <span class="text-surface-500">IMEI</span>
          <span class="font-semibold text-right">{{ recibidoCreado.nombre || '-' }}</span>
        </div>
      </div>
      <p class="text-sm text-surface-500 dark:text-surface-400">
        El equipo fue recibido. Puedes publicarlo ahora como IMEI disponible o dejarlo solo como recibido.
      </p>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Venta</label>
          <InputNumber v-model="imeiPublishForm.precio_venta" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Minimo</label>
          <InputNumber v-model="imeiPublishForm.precio_min" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Mayor</label>
          <InputNumber v-model="imeiPublishForm.precio_xmayor" mode="currency" :currency="systemCurrency" :locale="systemLocale" fluid />
        </div>
      </div>
    </div>
    <template #footer>
      <Button label="No publicar" severity="secondary" text @click="cerrarSinPublicar" />
      <Button label="Publicar IMEI" icon="pi pi-shopping-cart" :loading="publicandoImei" @click="publicarComoImei" />
    </template>
  </Dialog>
</template>
