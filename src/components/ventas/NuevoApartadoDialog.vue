<script setup lang="ts">
import { computed, ref } from 'vue'
import Button from 'primevue/button'
import Calendar from 'primevue/calendar'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import SelectButton from 'primevue/selectbutton'
import TabPanel from 'primevue/tabpanel'
import TabView from 'primevue/tabview'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import TicketApartadoPrint from './TicketApartadoPrint.vue'

const emit = defineEmits<{ created: [apartado: any] }>()
const toast = useToast()
const { addAlmacenId, filterByAlmacen } = useAlmacenFilter()
const { currency, locale } = useLocaleProfile()
const visible = ref(false)
const guardando = ref(false)
const tabActiva = ref(0)
const ticketRef = ref<any>(null)
const clientes = ref<any[]>([])
const imeis = ref<any[]>([])
const telefonos = ref<any[]>([])
const seriales = ref<any[]>([])
const accesorios = ref<any[]>([])

type Tipo = 'TELEFONO' | 'ELECTRODOMESTICO' | 'ACCESORIO'
function nuevoForm() {
  const n = new Date()
  return {
    no_apartado: `AP-${n.getFullYear()}${String(n.getMonth() + 1).padStart(2, '0')}${String(n.getDate()).padStart(2, '0')}-${String(n.getHours()).padStart(2, '0')}${String(n.getMinutes()).padStart(2, '0')}${String(n.getSeconds()).padStart(2, '0')}`,
    cod_cliente: '', nombre_cliente: '', telefono_cliente: '', tipo_producto: 'TELEFONO' as Tipo,
    producto_id: null as number | null, identificador: '', producto_nombre: '', total: 0, inicial: 0,
    fecha_inicio: new Date(), vendedor: '', nota: '',
  }
}
const form = ref(nuevoForm())
const tipos = [
  { label: 'Telefono', value: 'TELEFONO' },
  { label: 'Electrodomestico', value: 'ELECTRODOMESTICO' },
  { label: 'Accesorio', value: 'ACCESORIO' },
]
const saldo = computed(() => Math.max(0, Number(form.value.total || 0) - Number(form.value.inicial || 0)))
const productos = computed(() => {
  if (form.value.tipo_producto === 'ELECTRODOMESTICO') return seriales.value.map(p => ({ ...p, etiqueta: `${p.equipo || 'Electrodomestico'} - Serial: ${p.nombre}` }))
  if (form.value.tipo_producto === 'ACCESORIO') return accesorios.value.map(p => ({ ...p, etiqueta: `${p.nombre} - Stock: ${Number(p.cantidad || 0)}` }))
  return imeis.value.map(p => ({ ...p, etiqueta: `${telefonos.value.find(t => Number(t.id) === Number(p.id_equi))?.nombre || p.equipo || 'Telefono'} - IMEI: ${p.nombre}` }))
})

async function cargarDatos() {
  const [ri, rt, rs, re, ra, rc] = await Promise.all(['imei', 'telefonos', 'serial', 'electrodomesticos', 'accesorios', 'clientes'].map(t => window.db.getAll(t)))
  telefonos.value = rt.success ? filterByAlmacen(rt.data || []) : []
  clientes.value = rc.success ? filterByAlmacen(rc.data || []) : []
  imeis.value = ri.success ? filterByAlmacen(ri.data || []).filter((p: any) => String(p.estado).toUpperCase() === 'DISPONIBLE') : []
  const equipos = re.success ? filterByAlmacen(re.data || []) : []
  seriales.value = rs.success ? filterByAlmacen(rs.data || []).filter((p: any) => String(p.estado || 'DISPONIBLE').toUpperCase() === 'DISPONIBLE').map((p: any) => ({ ...p, equipo: equipos.find((e: any) => Number(e.id) === Number(p.id_equi) || (p.equipo_uid && e.uid === p.equipo_uid))?.nombre || p.equipo })) : []
  accesorios.value = ra.success ? filterByAlmacen(ra.data || []).filter((p: any) => Number(p.cantidad || 0) > 0) : []
}

async function abrir() {
  form.value = nuevoForm()
  tabActiva.value = 0
  try { await cargarDatos(); visible.value = true }
  catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e?.message || 'No se pudo cargar el apartado', life: 3500 }) }
}
function cambiarTipo() {
  form.value.producto_id = null; form.value.identificador = ''; form.value.producto_nombre = ''; form.value.total = 0; form.value.inicial = 0
}
function seleccionarProducto(event: any) {
  const p = productos.value.find(item => Number(item.id) === Number(event.value))
  if (!p) return
  form.value.identificador = form.value.tipo_producto === 'ACCESORIO' ? (p.codigo_barra || `ID-${p.id}`) : p.nombre
  form.value.producto_nombre = form.value.tipo_producto === 'TELEFONO' ? (telefonos.value.find(t => Number(t.id) === Number(p.id_equi))?.nombre || p.equipo || 'Telefono') : (p.equipo || p.nombre)
  form.value.total = Number(p.precio_venta || 0)
  form.value.inicial = Math.round(form.value.total * 0.3)
}
function seleccionarCliente(event: any) {
  const c = clientes.value.find(item => Number(item.id) === Number(event.value))
  if (!c) return
  form.value.nombre_cliente = String(c.nombre || '').toUpperCase(); form.value.telefono_cliente = c.telefono || ''
}
function notas(): string {
  const tipo = form.value.tipo_producto
  const etiqueta = tipo === 'TELEFONO' ? 'IMEI' : tipo === 'ELECTRODOMESTICO' ? 'SERIAL' : 'CODIGO'
  return [String(form.value.nota || '').trim().toUpperCase(), `PRODUCTO_TIPO: ${tipo}`, `PRODUCTO_ID: ${Number(form.value.producto_id)}`, `PRODUCTO: ${form.value.producto_nombre}`, `${etiqueta}: ${form.value.identificador}`].filter(Boolean).join(' | ')
}
async function reservar() {
  const id = Number(form.value.producto_id)
  if (form.value.tipo_producto !== 'ACCESORIO') return window.db.update(form.value.tipo_producto === 'ELECTRODOMESTICO' ? 'serial' : 'imei', id, { estado: 'APARTADO' })
  const actual = await window.db.getById('accesorios', id)
  if (!actual.success || !actual.data) return { success: false, error: actual.error || 'No se encontro el accesorio' }
  const cantidad = Number(actual.data.cantidad || 0) - 1
  return cantidad < 0 ? { success: false, error: 'El accesorio ya no tiene existencia disponible' } : window.db.update('accesorios', id, { cantidad })
}
async function guardar() {
  if (!form.value.nombre_cliente.trim()) return toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del cliente es requerido', life: 3000 })
  if (!form.value.producto_id) return toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona un producto del inventario', life: 3000 })
  if (form.value.total <= 0) return toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El total debe ser mayor a 0', life: 3000 })
  if (form.value.inicial > form.value.total) return toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El pago inicial no puede superar el total', life: 3000 })
  guardando.value = true
  try {
    const fecha = form.value.fecha_inicio.toISOString().split('T')[0]
    const pagos = form.value.inicial > 0 ? JSON.stringify([{ monto: form.value.inicial, metodo_pago: 'EFECTIVO', fecha, referencia: 'PAGO INICIAL' }]) : '[]'
    const nota = notas()
    const res = await window.db.insert('cuentas_cobrar', addAlmacenId({ no_factura: form.value.no_apartado, cod_cliente: form.value.cod_cliente, nombre_cliente: form.value.nombre_cliente.trim().toUpperCase(), telefono_cliente: form.value.telefono_cliente.trim(), total: form.value.total, abonado: form.value.inicial, saldo: saldo.value, fecha_venta: fecha, estado: 'APARTADO', notas: nota, pagos }))
    if (!res.success) throw new Error(res.error || 'No se pudo crear el apartado')
    const inventario = await reservar()
    if (!inventario.success) { if (res.data?.id) await window.db.delete('cuentas_cobrar', res.data.id); throw new Error(inventario.error || 'El producto ya no esta disponible') }
    const creado = { id: res.data?.id, no_factura: form.value.no_apartado, nombre_cliente: form.value.nombre_cliente, telefono_cliente: form.value.telefono_cliente, total: form.value.total, abonado: form.value.inicial, pagos, notas: nota, fecha_venta: fecha, estado: 'APARTADO' }
    visible.value = false; emit('created', creado); ticketRef.value?.printTicket(creado, 'apartado')
    toast.add({ severity: 'success', summary: 'Apartado creado', detail: form.value.no_apartado, life: 4000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'No se pudo crear el apartado', detail: e?.message || 'Error inesperado', life: 4000 }); await cargarDatos().catch(() => undefined) }
  finally { guardando.value = false }
}
defineExpose({ abrir })
</script>

<template>
  <Dialog v-model:visible="visible" header="Nuevo Apartado" modal :style="{ width: 'min(34rem, 94vw)' }">
    <TabView v-model:activeIndex="tabActiva">
      <TabPanel header="Cliente"><div class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Cliente</label><Select v-model="form.cod_cliente" :options="clientes" optionLabel="nombre" optionValue="id" placeholder="Seleccionar cliente" filter :filterFields="['nombre', 'telefono', 'cedula', 'rnc']" filterPlaceholder="Buscar por nombre, cédula o RNC..." fluid @change="seleccionarCliente" /></div>
        <div class="grid grid-cols-2 gap-3"><div class="flex flex-col gap-1"><label class="text-sm font-semibold">Nombre</label><InputText v-model="form.nombre_cliente" placeholder="Nombre del cliente" class="uppercase" /></div><div class="flex flex-col gap-1"><label class="text-sm font-semibold">Telefono</label><InputText v-model="form.telefono_cliente" placeholder="Telefono" /></div></div>
      </div></TabPanel>
      <TabPanel header="Equipo"><div class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Tipo de producto</label><SelectButton v-model="form.tipo_producto" :options="tipos" optionLabel="label" optionValue="value" :allowEmpty="false" fluid @change="cambiarTipo" /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Producto del inventario</label><Select v-model="form.producto_id" :options="productos" optionLabel="etiqueta" optionValue="id" placeholder="Seleccionar producto disponible" filter fluid @change="seleccionarProducto" /><p class="text-xs text-surface-400">Solo se muestran productos disponibles en el almacén actual.</p></div>
        <div class="grid grid-cols-2 gap-3"><div class="flex flex-col gap-1"><label class="text-sm font-semibold">Producto</label><InputText :value="form.producto_nombre" disabled fluid /></div><div class="flex flex-col gap-1"><label class="text-sm font-semibold">Identificador</label><InputText :value="form.identificador" disabled fluid /></div></div>
      </div></TabPanel>
      <TabPanel header="Pago"><div class="flex flex-col gap-3 pt-2">
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Total del Apartado</label><InputNumber v-model="form.total" mode="currency" :currency="currency" :locale="locale" fluid /></div>
        <div class="grid grid-cols-2 gap-3"><div class="flex flex-col gap-1"><label class="text-sm font-semibold">Pago Inicial</label><InputNumber v-model="form.inicial" mode="currency" :currency="currency" :locale="locale" fluid /></div><div class="flex flex-col gap-1"><label class="text-sm font-semibold">Saldo Pendiente</label><InputNumber :modelValue="saldo" mode="currency" :currency="currency" :locale="locale" disabled fluid /></div></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Fecha de Inicio</label><Calendar v-model="form.fecha_inicio" dateFormat="yy-mm-dd" showIcon fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Vendedor</label><InputText v-model="form.vendedor" placeholder="Vendedor" class="uppercase" /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Nota</label><Textarea v-model="form.nota" placeholder="Nota adicional" rows="2" class="uppercase" /></div>
      </div></TabPanel>
    </TabView>
    <template #footer><Button label="Cancelar" severity="secondary" text :disabled="guardando" @click="visible = false" /><Button label="Crear Apartado" icon="pi pi-check" :loading="guardando" :disabled="tabActiva !== 2" @click="guardar" /></template>
  </Dialog>
  <TicketApartadoPrint ref="ticketRef" />
</template>
