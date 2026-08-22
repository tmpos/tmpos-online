<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import { useToast } from 'primevue/usetoast'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useSystemModeStore } from '@/stores/systemMode'

const toast = useToast()
const systemMode = useSystemModeStore()
const { filterByAlmacen, addAlmacenId } = useAlmacenFilter()
const tipoActivo = ref(systemMode.isGeneralStore ? 'accesorio' : 'imei')
const busqueda = ref('')
const imeis = ref<any[]>([])
const seriales = ref<any[]>([])
const accesorios = ref<any[]>([])
const telefonos = ref<any[]>([])
const electrodomesticos = ref<any[]>([])
const perdidas = ref<any[]>([])
const cargando = ref(false)
const dialogPerdida = ref(false)
const itemSeleccionado = ref<any>(null)
const cantidadPerdida = ref(1)
const motivo = ref('DANADO')

const tipos = computed(() => [
  ...(systemMode.isCellphoneStore ? [{ label: 'IMEI', value: 'imei' }] : []),
  { label: systemMode.productLabel, value: 'accesorio' },
  { label: 'Electrodomesticos', value: 'serial' },
])

const nombresTelefonos = computed(() => new Map(telefonos.value.map((item: any) => [Number(item.id), item.nombre])))
const nombresElectro = computed(() => new Map(electrodomesticos.value.map((item: any) => [Number(item.id), item.nombre])))
const itemsDisponibles = computed(() => {
  const texto = busqueda.value.toLowerCase().trim()
  let data: any[] = []
  if (tipoActivo.value === 'imei') {
    data = imeis.value.filter((item: any) => String(item.estado).toUpperCase() === 'DISPONIBLE').map((item: any) => ({ ...item, equipo: nombresTelefonos.value.get(Number(item.id_equi)) || '' }))
  } else if (tipoActivo.value === 'serial') {
    data = seriales.value.filter((item: any) => String(item.estado).toUpperCase() === 'DISPONIBLE').map((item: any) => ({ ...item, equipo: nombresElectro.value.get(Number(item.id_equi)) || '' }))
  } else {
    data = accesorios.value.filter((item: any) => Number(item.cantidad || 0) > 0)
  }
  if (!texto) return data
  return data.filter((item: any) => [item.nombre, item.codigo_barra, item.equipo, item.color, item.capacidad].some(v => String(v || '').toLowerCase().includes(texto)))
})

const perdidasFiltradas = computed(() => perdidas.value.filter((item: any) =>
  String(item.estado).toUpperCase() === 'ACTIVA' &&
  (systemMode.isCellphoneStore || String(item.tipo).toUpperCase() !== 'IMEI')))

function tipoVisible(tipo: string) {
  if (systemMode.isGeneralStore && String(tipo).toUpperCase() === 'ACCESORIO') return 'PRODUCTO'
  return tipo
}

function moneda(valor: any) {
  return Number(valor || 0).toFixed(2)
}

async function cargarDatos() {
  cargando.value = true
  try {
    const [imeiRes, serialRes, accesoriosRes, telRes, electroRes, perdidasRes] = await Promise.all([
      window.db.getAll('imei'), window.db.getAll('serial'), window.db.getAll('accesorios'),
      window.db.getAll('telefonos'), window.db.getAll('electrodomesticos'), window.db.getAll('perdidas'),
    ])
    if (imeiRes.success) imeis.value = filterByAlmacen(imeiRes.data || [])
    if (serialRes.success) seriales.value = filterByAlmacen(serialRes.data || [])
    if (accesoriosRes.success) accesorios.value = filterByAlmacen(accesoriosRes.data || [])
    if (telRes.success) telefonos.value = filterByAlmacen(telRes.data || [])
    if (electroRes.success) electrodomesticos.value = filterByAlmacen(electroRes.data || [])
    if (perdidasRes.success) perdidas.value = filterByAlmacen(perdidasRes.data || [])
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar las perdidas', life: 3000 })
  } finally {
    cargando.value = false
  }
}

function abrirPerdida(item: any) {
  itemSeleccionado.value = item
  cantidadPerdida.value = 1
  motivo.value = 'DANADO'
  dialogPerdida.value = true
}

async function registrarPerdida() {
  const item = itemSeleccionado.value
  if (!item) return
  const cantidad = tipoActivo.value === 'accesorio' ? Number(cantidadPerdida.value || 0) : 1
  if (cantidad <= 0 || (tipoActivo.value === 'accesorio' && cantidad > Number(item.cantidad || 0))) {
    toast.add({ severity: 'warn', summary: 'Cantidad invalida', detail: 'Verifica la cantidad a sacar', life: 3000 })
    return
  }
  try {
    if (tipoActivo.value === 'imei') await window.db.update('imei', item.id, { estado: 'DANADO', nota: `${item.nota || ''} | PERDIDA: ${motivo.value}`.trim() })
    else if (tipoActivo.value === 'serial') await window.db.update('serial', item.id, { estado: 'DANADO', nota: `${item.nota || ''} | PERDIDA: ${motivo.value}`.trim() })
    else await window.db.update('accesorios', item.id, { cantidad: Number(item.cantidad || 0) - cantidad })

    const tipoLabel = tipoActivo.value === 'serial' ? 'ELECTRODOMESTICO' : tipoActivo.value.toUpperCase()
    const res = await window.db.insert('perdidas', addAlmacenId({
      tipo: tipoLabel, referencia_id: item.id, nombre: item.nombre || '', codigo: item.nombre || item.codigo_barra || '',
      cantidad, costo: Number(item.costo || 0), motivo: motivo.value.trim().toUpperCase(),
      fecha: new Date().toISOString().split('T')[0], estado: 'ACTIVA', detalle: JSON.stringify({ estado_anterior: item.estado || 'DISPONIBLE' }),
    }))
    if (!res.success) throw new Error(res.error)
    dialogPerdida.value = false
    toast.add({ severity: 'success', summary: 'Movido a perdidas', detail: `${item.nombre} ya no aparece en inventario`, life: 3000 })
    await cargarDatos()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo registrar la perdida', life: 3000 })
  }
}

async function restaurarPerdida(perdida: any) {
  try {
    const tipo = String(perdida.tipo || '').toUpperCase()
    if (tipo === 'IMEI') await window.db.update('imei', perdida.referencia_id, { estado: 'DISPONIBLE' })
    else if (tipo === 'ELECTRODOMESTICO') await window.db.update('serial', perdida.referencia_id, { estado: 'DISPONIBLE' })
    else if (tipo === 'ACCESORIO') {
      const res = await window.db.getById('accesorios', perdida.referencia_id)
      if (!res.success || !res.data) throw new Error('Accesorio no encontrado')
      await window.db.update('accesorios', perdida.referencia_id, { cantidad: Number(res.data.cantidad || 0) + Number(perdida.cantidad || 0) })
    }
    await window.db.update('perdidas', perdida.id, { estado: 'RESTAURADA' })
    toast.add({ severity: 'success', summary: 'Restaurado', detail: `${perdida.nombre} volvió al inventario`, life: 3000 })
    await cargarDatos()
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo restaurar', life: 3000 })
  }
}

onMounted(cargarDatos)
</script>

<template>
  <div class="p-3 sm:p-5">
    <div class="flex flex-col gap-1 mb-4">
      <h2 class="text-xl font-bold">Perdidas</h2>
      <p class="text-sm text-surface-500">Saca artículos dañados del inventario sin perder su historial.</p>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-2 gap-5">
      <section class="rounded-xl border border-surface-200 dark:border-surface-700 p-4">
        <div class="flex flex-col sm:flex-row gap-2 mb-4">
          <Select v-model="tipoActivo" :options="tipos" optionLabel="label" optionValue="value" class="sm:w-48" />
          <InputText v-model="busqueda" placeholder="Buscar artículo..." fluid />
        </div>
        <DataTable :value="itemsDisponibles" :loading="cargando" paginator :rows="8" size="small" dataKey="id" responsiveLayout="scroll">
          <Column field="nombre" header="Articulo">
            <template #body="{ data }"><p class="font-medium">{{ data.nombre }}</p><p v-if="data.equipo" class="text-xs text-surface-400">{{ data.equipo }} · {{ data.color }} {{ data.capacidad }}</p></template>
          </Column>
          <Column header="Disponible" style="width: 7rem"><template #body="{ data }">{{ tipoActivo === 'accesorio' ? data.cantidad : '1' }}</template></Column>
          <Column header="Accion" style="width: 6rem"><template #body="{ data }"><Button label="Perdida" icon="pi pi-times-circle" severity="danger" size="small" @click="abrirPerdida(data)" /></template></Column>
          <template #empty><div class="text-center py-5 text-surface-400">No hay artículos disponibles.</div></template>
        </DataTable>
      </section>

      <section class="rounded-xl border border-surface-200 dark:border-surface-700 p-4">
        <h3 class="font-semibold mb-4">Registro de pérdidas activas</h3>
        <DataTable :value="perdidasFiltradas" :loading="cargando" paginator :rows="8" size="small" dataKey="id" responsiveLayout="scroll">
          <Column field="nombre" header="Articulo"><template #body="{ data }"><p class="font-medium">{{ data.nombre }}</p><p class="text-xs text-surface-400">{{ tipoVisible(data.tipo) }} · {{ data.fecha }} · {{ data.motivo }}</p></template></Column>
          <Column field="cantidad" header="Cant." style="width: 5rem" />
          <Column header="Costo" style="width: 6rem"><template #body="{ data }">{{ $formatMoney(Number(data.costo || 0) * Number(data.cantidad || 1)) }}</template></Column>
          <Column header="Accion" style="width: 7rem"><template #body="{ data }"><Button label="Restaurar" icon="pi pi-replay" severity="success" text size="small" @click="restaurarPerdida(data)" /></template></Column>
          <template #empty><div class="text-center py-5 text-surface-400">No hay pérdidas registradas.</div></template>
        </DataTable>
      </section>
    </div>

    <Dialog v-model:visible="dialogPerdida" header="Registrar pérdida" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="flex flex-col gap-4">
        <div class="rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 p-3"><p class="font-semibold">{{ itemSeleccionado?.nombre }}</p><p class="text-sm text-surface-500">Este artículo dejará de aparecer en el inventario disponible.</p></div>
        <div v-if="tipoActivo === 'accesorio'" class="flex flex-col gap-1"><label class="text-sm font-semibold">Cantidad dañada</label><InputNumber v-model="cantidadPerdida" :min="1" :max="itemSeleccionado?.cantidad || 1" fluid /></div>
        <div class="flex flex-col gap-1"><label class="text-sm font-semibold">Motivo</label><Textarea v-model="motivo" rows="3" placeholder="Ej.: Pantalla rota" fluid /></div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="dialogPerdida = false" /><Button label="Mover a pérdidas" icon="pi pi-times-circle" severity="danger" @click="registrarPerdida" /></template>
    </Dialog>
  </div>
</template>
