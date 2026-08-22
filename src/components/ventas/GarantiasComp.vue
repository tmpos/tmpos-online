<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
      <div class="flex items-center justify-between mb-6">
        <div>
          <h1 class="text-2xl font-bold">Gestion de Garantias</h1>
          <p class="text-sm text-surface-500">Registra y da seguimiento a las garantias de productos</p>
        </div>
        <div class="flex items-center gap-2">
          <label class="flex items-center gap-2 rounded-lg border border-surface-200 dark:border-surface-700 px-3 py-2 cursor-pointer text-sm text-surface-500">
            <ToggleSwitch v-model="verTodosAlmacenes" />
            Todos los almacenes
          </label>
          <Button
            v-if="selectedGarantias.length"
            :label="`Cambiar almacén (${selectedGarantias.length})`"
            icon="pi pi-warehouse"
            severity="success"
            @click="abrirMoverAlmacen"
          />
          <Button
            v-if="selectedGarantias.length"
            :label="`Eliminar (${selectedGarantias.length})`"
            icon="pi pi-trash"
            severity="danger"
            outlined
            @click="confirmarBorrarSeleccionadas"
          />
          <button @click="abrirRegistroRapido" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" style="background:#10b981">
            <i class="pi pi-plus"></i>Registrar Garantia
          </button>
          <button @click="abrirReclamo" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
            <i class="pi pi-exclamation-triangle"></i>Reclamo
          </button>
        </div>
      </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <template v-else>
      <DataTable :value="garantias" stripedRows paginator :rows="15" dataKey="id" sortField="created_at" :sortOrder="-1" v-model:selection="selectedGarantias" responsiveLayout="scroll">
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column field="producto_nombre" header="Producto" sortable />
        <Column :header="systemMode.isGeneralStore ? 'Serial/Referencia' : 'IMEI/Serial'" sortable style="width:9rem">
          <template #body="{ data }">{{ systemMode.isGeneralStore ? (data.serial || '') : (data.imei || data.serial || '') }}</template>
        </Column>
        <Column field="cliente_nombre" header="Cliente" sortable />
        <Column field="fecha_venta" header="Venta" sortable style="width:7rem" />
        <Column field="fecha_vencimiento" header="Vence" sortable style="width:7rem" />
        <Column header="Dias Rest." style="width:6rem">
          <template #body="{ data }">
            <span class="font-semibold" :class="diasRestantes(data) <= 0 ? 'text-red-500' : diasRestantes(data) <= 7 ? 'text-amber-500' : 'text-green-500'">{{ diasRestantes(data) }}</span>
          </template>
        </Column>
        <Column field="estado" header="Estado" sortable style="width:7rem">
          <template #body="{ data }">
            <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
              :class="data.estado === 'ACTIVA' ? 'bg-green-100 text-green-700' : data.estado === 'EN_REPARACION' ? 'bg-amber-100 text-amber-700' : data.estado === 'VENCIDA' ? 'bg-red-100 text-red-700' : 'bg-gray-100 text-gray-700'"
            >{{ data.estado }}</span>
          </template>
        </Column>
        <Column header="Reclamos" style="width:5rem">
          <template #body="{ data }">
            <button v-if="data.reclamos_count > 0" class="text-xs text-primary underline" @click="verReclamos(data)">{{ data.reclamos_count }} reclamo(s)</button>
            <span v-else class="text-xs text-surface-400">0</span>
          </template>
        </Column>
        <Column header="Acciones" style="width:10rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-print" severity="warn" text rounded size="small" v-tooltip="'Imprimir etiqueta'" @click.stop="abrirImpresionEtiqueta(data)" />
              <Button icon="pi pi-whatsapp" severity="success" text rounded size="small" v-tooltip="'Avisar por WhatsApp'" @click.stop="avisarGarantiaWhatsApp(data)" />
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" v-tooltip="'Editar'" @click.stop="abrirEditar(data)" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" v-tooltip="'Eliminar'" @click.stop="confirmarBorrar(data)" />
            </div>
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-10 text-surface-400">No hay garantias registradas.</div>
        </template>
      </DataTable>
    </template>

    <Dialog v-model:visible="dialogMoverAlmacen" header="Cambiar almacén" modal :style="{ width: '28rem' }">
      <div class="space-y-4 pt-2">
        <p class="text-sm">Mover <strong>{{ selectedGarantias.length }}</strong> garantía(s) a otro almacén:</p>
        <Select v-model="almacenDestino" :options="almacenesDestino" optionLabel="nombre" placeholder="Seleccionar almacén destino..." fluid />
        <p v-if="almacenesDestino.length === 0" class="text-xs text-amber-600 dark:text-amber-400">No hay otro almacén disponible.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="moviendoAlmacen" @click="dialogMoverAlmacen = false" />
        <Button label="Mover garantías" icon="pi pi-warehouse" :loading="moviendoAlmacen" :disabled="!almacenDestino" @click="aplicarMoverAlmacen" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogGarantia" :header="editandoId ? 'Editar Garantia' : 'Registrar Garantia'" modal :style="{ width: 'min(36rem, 95vw)' }" :draggable="false">
      <div class="flex flex-col gap-3 pt-2">
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Tipo de producto</label>
            <Select v-model="form.tipo_producto" :options="productTypes" placeholder="Tipo" fluid @change="onTipoProductoChange" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Producto</label>
            <Select
              v-model="form.producto_id"
              :options="productosDisponibles"
              optionLabel="_garantiaLabel"
              optionValue="id"
              placeholder="Buscar producto..."
              fluid
              filter
              :filterFields="['_garantiaLabel', 'nombre', 'comprador', 'no_factura']"
              @change="onProductoSelect"
            >
              <template #option="{ option }">
                <div class="flex flex-col min-w-0">
                  <span class="font-medium truncate">{{ option._garantiaLabel || option.nombre }}</span>
                  <span v-if="option._garantiaDetalle" class="text-xs text-surface-500 truncate">{{ option._garantiaDetalle }}</span>
                </div>
              </template>
            </Select>
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Cliente</label>
            <Select v-model="form.cliente_id" :options="clientes" optionLabel="nombre" optionValue="id" placeholder="Cliente" fluid filter @change="onClienteSelect" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Dias de garantia</label>
            <InputNumber v-model="form.dias_garantia" :min="1" class="w-full" fluid />
          </div>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Fecha de venta</label>
            <Calendar v-model="form.fecha_venta" dateFormat="yy-mm-dd" fluid />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">No. Factura</label>
            <InputText v-model="form.no_factura" placeholder="Opcional" fluid />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Nota</label>
          <InputText v-model="form.nota" placeholder="Observaciones" fluid />
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Estado</label>
          <Select v-model="form.estado" :options="estadosGarantia" optionLabel="label" optionValue="value" placeholder="Estado" fluid />
        </div>
        <p v-if="errorGarantia" class="text-red-500 text-xs">{{ errorGarantia }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogGarantia = false" />
        <Button v-if="editandoId" label="Enviar al taller" icon="pi pi-wrench" severity="warn" outlined @click="abrirOrdenTallerDesdeGarantia" />
        <Button :label="editandoId ? 'Actualizar' : 'Registrar'" icon="pi pi-check" :loading="guardando" @click="registrarGarantia" />
      </template>
    </Dialog>

    <OrdenTallerForm
      :order-id="null"
      :visible="dialogOrdenTallerGarantia"
      :initial-data="ordenTallerGarantiaInitialData"
      @close="dialogOrdenTallerGarantia = false"
      @saved="onOrdenTallerGarantiaGuardada"
    />

    <Dialog v-model:visible="dialogReclamo" header="Registrar Reclamo de Garantia" modal :style="{ width: 'min(36rem, 95vw)' }">
      <div class="flex flex-col gap-3 pt-2">
        <div>
          <label class="text-xs font-semibold mb-1 block">Buscar garantia por IMEI/Serial o Cliente</label>
          <InputText v-model="busquedaReclamo" placeholder="IMEI, Serial o nombre de cliente..." fluid @input="buscarGarantiasReclamo" />
        </div>
        <div v-if="garantiasEncontradas.length > 0" class="max-h-32 overflow-y-auto border border-surface-200 dark:border-surface-700 rounded-lg divide-y divide-surface-100">
          <button v-for="g in garantiasEncontradas" :key="g.id" class="w-full text-left px-3 py-2 text-sm hover:bg-surface-50 dark:hover:bg-surface-800" :class="g.id === reclamoForm.garantia_id ? 'bg-primary-50 dark:bg-primary-900/20' : ''" @click="seleccionarGarantiaReclamo(g)">
            <strong>{{ g.producto_nombre }}</strong> - {{ g.imei || g.serial || '' }} - {{ g.cliente_nombre }}
          </button>
        </div>
        <div v-if="reclamoForm.garantia_id && garantiaSeleccionada">
          <div class="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-sm">
            <p><strong>{{ garantiaSeleccionada.producto_nombre }}</strong> (Vence: {{ garantiaSeleccionada.fecha_vencimiento }})</p>
            <p class="text-xs text-surface-500">{{ garantiaSeleccionada.cliente_nombre }} - {{ garantiaSeleccionada.imei || garantiaSeleccionada.serial }}</p>
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Descripcion del problema</label>
          <Textarea v-model="reclamoForm.descripcion" placeholder="Describe el fallo o problema del producto..." rows="3" fluid />
        </div>
        <p v-if="errorReclamo" class="text-red-500 text-xs">{{ errorReclamo }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogReclamo = false" />
        <Button label="Registrar Reclamo" icon="pi pi-save" :loading="guardando" @click="registrarReclamo" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogVerReclamos" :header="'Reclamos - ' + (garantiaReclamos?.producto_nombre || '')" modal :style="{ width: 'min(36rem, 95vw)' }">
      <div v-if="reclamosLista.length === 0" class="text-center py-8 text-surface-400 text-sm">Sin reclamos para esta garantia.</div>
      <div v-else class="space-y-3 pt-2">
        <div v-for="r in reclamosLista" :key="r.id" class="rounded-lg border border-surface-200 dark:border-surface-700 p-3">
          <div class="flex justify-between items-start">
            <span class="text-xs text-surface-400">{{ $formatDateTime(r.created_at) }}</span>
            <div class="flex items-center gap-2">
              <Button icon="pi pi-whatsapp" severity="success" text rounded size="small" @click="avisarReclamoWhatsApp(r)" v-tooltip="'Avisar por WhatsApp'" />
              <Select
                v-model="r.estado"
                :options="estadosReclamo"
                optionLabel="label"
                optionValue="value"
                size="small"
                class="w-36"
                @change="actualizarEstadoReclamo(r)"
              />
            </div>
          </div>
          <p class="text-sm mt-1">{{ r.descripcion }}</p>
          <p v-if="r.solucion" class="text-sm text-green-600 mt-1"><strong>Solucion:</strong> {{ r.solucion }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="dialogVerReclamos = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogImpresoraEtiqueta" header="Imprimir etiqueta de garantía" modal :style="{ width: 'min(28rem, 95vw)' }">
      <div class="flex flex-col gap-3 pt-1">
        <div class="rounded-lg bg-surface-50 dark:bg-surface-800 p-3 text-sm">
          <p class="font-semibold">{{ garantiaEtiqueta?.cliente_nombre || 'Cliente' }}</p>
          <p class="text-xs text-surface-500">{{ garantiaEtiqueta?.producto_nombre || '' }} · {{ garantiaEtiqueta?.imei || garantiaEtiqueta?.serial || '' }}</p>
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Impresora</label>
          <Select v-model="impresoraEtiqueta" :options="impresorasEtiqueta" optionLabel="label" optionValue="value" placeholder="Seleccionar impresora" filter fluid :loading="cargandoImpresorasEtiqueta" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="text-sm font-semibold">Tamaño de etiqueta (pulgadas)</label>
          <Select v-model="plantillaEtiquetaId" :options="plantillasEtiqueta" optionLabel="nombre" optionValue="id" placeholder="Seleccionar plantilla" filter fluid />
          <small v-if="plantillaEtiquetaSeleccionada" class="text-surface-500">{{ plantillaEtiquetaSeleccionada.ancho }} × {{ plantillaEtiquetaSeleccionada.alto }} mm</small>
          <small v-else class="text-amber-600 dark:text-amber-400">Crea primero una plantilla en Inventario → Etiquetas.</small>
        </div>
        <p v-if="!cargandoImpresorasEtiqueta && impresorasEtiqueta.length === 0" class="text-sm text-amber-600 dark:text-amber-400">No se encontraron impresoras instaladas.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogImpresoraEtiqueta = false" />
        <Button label="Imprimir" icon="pi pi-print" :disabled="!impresoraEtiqueta || !plantillaEtiquetaId" :loading="imprimiendoEtiqueta" @click="confirmarImpresionEtiqueta" />
      </template>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" header="Eliminar Garantia" modal :style="{ width: '24rem' }">
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span>Seguro que deseas eliminar {{ garantiasParaEliminar.length > 1 ? `estas ${garantiasParaEliminar.length} garantias` : 'esta garantia' }}?</span>
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
          @click="solicitarOtpEliminarGarantia"
        />
        <Button
          v-else
          label="Eliminar"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          @click="borrarGarantias"
        />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useSystemModeStore } from '@/stores/systemMode'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputOtp from 'primevue/inputotp'
import Calendar from 'primevue/calendar'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'
import OrdenTallerForm from '@/components/taller/OrdenTallerForm.vue'
import Swal from 'sweetalert2'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { useBulkWarehouseTransfer } from '@/composables/useBulkWarehouseTransfer'

const toast = useToast()
const systemMode = useSystemModeStore()
const productTypes = computed(() => systemMode.isGeneralStore
  ? ['SERIAL', 'PRODUCTO', 'ELECTRODOMESTICO', 'PIEZA']
  : ['IMEI', 'SERIAL', 'ACCESORIO', 'ELECTRODOMESTICO', 'PIEZA'])
const almacenStore = useAlmacenStore()
const { filterByAlmacen } = useAlmacenFilter()

const loading = ref(true)
const garantias = ref<any[]>([])
const clientes = ref<any[]>([])
const productosDisponibles = ref<any[]>([])
const dialogGarantia = ref(false)
const dialogReclamo = ref(false)
const dialogVerReclamos = ref(false)
const dialogOrdenTallerGarantia = ref(false)
const guardando = ref(false)
const errorGarantia = ref('')
const errorReclamo = ref('')
const busquedaReclamo = ref('')
const garantiasEncontradas = ref<any[]>([])
const garantiaSeleccionada = ref<any>(null)
const garantiaReclamos = ref<any>(null)
const garantiaTallerOrigen = ref<any>(null)
const reclamosLista = ref<any[]>([])
const estadosGarantia = [
  { label: 'Activa', value: 'ACTIVA' },
  { label: 'En reparacion', value: 'EN_REPARACION' },
  { label: 'Vencida', value: 'VENCIDA' },
  { label: 'Cancelada', value: 'CANCELADA' },
  { label: 'Resuelta', value: 'RESUELTA' },
]
const estadosReclamo = [
  { label: 'Pendiente', value: 'PENDIENTE' },
  { label: 'En proceso', value: 'EN_PROCESO' },
  { label: 'Resuelto', value: 'RESUELTO' },
]

const editandoId = ref<number | null>(null)
const selectedGarantias = ref<any[]>([])
const verTodosAlmacenes = ref(false)

const {
  dialogMoverAlmacen, almacenDestino, almacenesDestino, moviendoAlmacen,
  abrirMoverAlmacen, aplicarMoverAlmacen,
} = useBulkWarehouseTransfer({
  table: 'garantias', entity: 'garantias', label: 'garantía',
  selection: selectedGarantias, reload: cargar,
  reference: (item: any) => item.no_factura || item.imei || item.serial || String(item.id || ''),
})
const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const deleteOtp = ref('')
const deleteOtpEmail = ref('')
const deleteOtpError = ref('')
const garantiaParaEliminar = ref<any>(null)
const deleteMultipleDialogVisible = ref(false)
const dialogImpresoraEtiqueta = ref(false)
const garantiaEtiqueta = ref<any>(null)
const impresorasEtiqueta = ref<{ label: string; value: string }[]>([])
const impresoraEtiqueta = ref('')
const cargandoImpresorasEtiqueta = ref(false)
const imprimiendoEtiqueta = ref(false)
const plantillasEtiqueta = ref<any[]>([])
const plantillaEtiquetaId = ref<number | null>(null)
const plantillaEtiquetaSeleccionada = computed(() => plantillasEtiqueta.value.find((plantilla: any) => Number(plantilla.id) === Number(plantillaEtiquetaId.value)) || null)

const garantiasParaEliminar = computed(() => {
  if (garantiaParaEliminar.value) return [garantiaParaEliminar.value]
  return selectedGarantias.value || []
})

const totalSeleccionadoEliminar = computed(() =>
  garantiasParaEliminar.value.length
)

function resetDeleteOtp() {
  deleteOtpEnviado.value = false
  deleteOtpEmail.value = ''
  deleteOtp.value = ''
  deleteOtpError.value = ''
  deleteOtpLoading.value = false
  deleteOtpConfirmando.value = false
}

const form = ref({
  tipo_producto: '', producto_id: null as number | null,
  cliente_id: null as number | null, cliente_nombre: '', cliente_telefono: '',
  dias_garantia: 30, fecha_venta: new Date(), no_factura: '', nota: '',
  imei: '', serial: '', estado: 'ACTIVA',
})

const reclamoForm = ref({ garantia_id: 0, descripcion: '' })

const ordenTallerGarantiaInitialData = computed(() => ({
  nombre: form.value.cliente_nombre || '',
  telefono: form.value.cliente_telefono || '',
  equipo: form.value.tipo_producto || '',
  imei: form.value.imei || '',
  serial: form.value.serial || '',
  marca_modelo: productosDisponibles.value.find((x: any) => x.id === form.value.producto_id)?.nombre || '',
  fallas: form.value.nota || 'GARANTIA',
}))

function diasRestantes(g: any): number {
  if (!g.fecha_vencimiento) return 0
  const venc = new Date(g.fecha_vencimiento)
  const diff = venc.getTime() - Date.now()
  return Math.ceil(diff / 86400000)
}

async function cargar() {
  loading.value = true
  try {
    const [resGar, resCli] = await Promise.all([
      (window as any).electron.invoke('db:getAll', 'garantias'),
      (window as any).electron.invoke('db:getAll', 'clientes'),
    ])
    if (resGar.success) {
      const lista = verTodosAlmacenes.value
        ? (resGar.data || [])
        : filterByAlmacen(resGar.data || [])
      garantias.value = lista
      const ids = lista.map((g: any) => g.id)
      if (ids.length > 0) {
        const resRec = await (window as any).electron.invoke('db:getWhere', 'reclamos_garantia', `garantia_id IN (${ids.join(',')})`)
        if (resRec.success) {
          const counts = new Map<number, number>()
          const ultimos = new Map<number, any>()
          for (const r of resRec.data || []) {
            counts.set(r.garantia_id, (counts.get(r.garantia_id) || 0) + 1)
            const actual = ultimos.get(r.garantia_id)
            const fechaActual = new Date(actual?.created_at || actual?.fecha_ingreso || 0).getTime()
            const fechaNueva = new Date(r.created_at || r.fecha_ingreso || 0).getTime()
            if (!actual || fechaNueva >= fechaActual) ultimos.set(r.garantia_id, r)
          }
          garantias.value = lista.map((g: any) => ({ ...g, reclamos_count: counts.get(g.id) || 0, ultimo_reclamo: ultimos.get(g.id) || null }))
        }
      }
    }
    if (resCli.success) clientes.value = filterByAlmacen(resCli.data || [])
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al cargar garantias', life: 3000 })
  } finally { loading.value = false }
}

watch(verTodosAlmacenes, () => {
  selectedGarantias.value = []
  garantiaParaEliminar.value = null
  cargar()
})

function productoVendido(item: any): boolean {
  return String(item?.estado || '').toUpperCase() === 'VENDIDO'
}

function prepararProductoGarantia(item: any) {
  const tipo = form.value.tipo_producto
  if (tipo === 'IMEI') {
    const detalle = [
      item.comprador ? `Cliente: ${item.comprador}` : '',
      item.no_factura ? `Factura: ${item.no_factura}` : '',
      item.fecha_venta ? `Venta: ${item.fecha_venta}` : '',
    ].filter(Boolean).join(' - ')
    return {
      ...item,
      _garantiaLabel: `IMEI: ${item.nombre || ''}`,
      _garantiaDetalle: detalle,
    }
  }

  if (tipo === 'SERIAL') {
    return {
      ...item,
      _garantiaLabel: `Serial: ${item.nombre || ''}`,
      _garantiaDetalle: item.estado ? `Estado: ${item.estado}` : '',
    }
  }

  return {
    ...item,
    _garantiaLabel: item.nombre || item.descripcion || `Producto #${item.id}`,
    _garantiaDetalle: item.codigo_barra || item.codigo || item.referencia || '',
  }
}

function getNombreProductoGarantia(item: any): string {
  return item?.nombre || item?.descripcion || item?._garantiaLabel || ''
}

async function onTipoProductoChange() {
  form.value.producto_id = null
  form.value.imei = ''
  form.value.serial = ''
  await cargarProductos()
}

async function cargarProductos() {
  if (!form.value.tipo_producto) { productosDisponibles.value = []; return }
  const tablaMap: Record<string, string> = { IMEI: 'imei', SERIAL: 'serial', ACCESORIO: 'accesorios', PRODUCTO: 'accesorios', ELECTRODOMESTICO: 'electrodomesticos', PIEZA: 'piezas' }
  const tabla = tablaMap[form.value.tipo_producto]
  if (!tabla) return
  const res = await (window as any).electron.invoke('db:getAll', tabla)
  if (res.success) {
    let productos = filterByAlmacen(res.data || [])
    if (form.value.tipo_producto === 'IMEI') {
      productos = productos.filter((p: any) =>
        productoVendido(p) || Number(p.id) === Number(form.value.producto_id)
      )
    }
    productosDisponibles.value = productos.map(prepararProductoGarantia)
  }
}

function onProductoSelect() {
  const p = productosDisponibles.value.find((x: any) => x.id === form.value.producto_id)
  if (p) {
    if (form.value.tipo_producto === 'IMEI') form.value.imei = p.nombre || ''
    else if (form.value.tipo_producto === 'SERIAL') form.value.serial = p.nombre || ''
    if (form.value.tipo_producto === 'IMEI') {
      form.value.no_factura = p.no_factura || form.value.no_factura
      form.value.fecha_venta = p.fecha_venta ? new Date(p.fecha_venta) : form.value.fecha_venta
      if (p.comprador && !form.value.cliente_nombre) {
        const cliente = clientes.value.find((c: any) => String(c.nombre || '').trim().toUpperCase() === String(p.comprador || '').trim().toUpperCase())
        form.value.cliente_id = cliente?.id || form.value.cliente_id
        form.value.cliente_nombre = cliente?.nombre || p.comprador || form.value.cliente_nombre
        form.value.cliente_telefono = cliente?.telefono || form.value.cliente_telefono
      }
    }
  }
}

function onClienteSelect() {
  const c = clientes.value.find((x: any) => x.id === form.value.cliente_id)
  if (c) { form.value.cliente_nombre = c.nombre || ''; form.value.cliente_telefono = c.telefono || '' }
}

function abrirRegistroRapido() {
  editandoId.value = null
  form.value = { tipo_producto: '', producto_id: null, cliente_id: null, cliente_nombre: '', cliente_telefono: '', dias_garantia: 30, fecha_venta: new Date(), no_factura: '', nota: '', imei: '', serial: '', estado: 'ACTIVA' }
  errorGarantia.value = ''
  dialogGarantia.value = true
}

async function abrirEditar(g: any) {
  editandoId.value = g.id
  form.value = {
    tipo_producto: g.tipo_producto || '',
    producto_id: g.producto_id,
    cliente_id: clientes.value.find((c: any) => c.nombre === g.cliente_nombre)?.id || null,
    cliente_nombre: g.cliente_nombre || '',
    cliente_telefono: g.cliente_telefono || '',
    dias_garantia: g.dias_garantia || 30,
    fecha_venta: g.fecha_venta ? new Date(g.fecha_venta) : new Date(),
    no_factura: g.no_factura || '',
    nota: g.nota || '',
    imei: g.imei || '',
    serial: g.serial || '',
    estado: g.estado || 'ACTIVA',
  }
  if (g.tipo_producto) await cargarProductos()
  errorGarantia.value = ''
  dialogGarantia.value = true
}

function confirmarBorrar(g: any) {
  garantiaParaEliminar.value = g
  selectedGarantias.value = []
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function confirmarBorrarSeleccionadas() {
  if (!selectedGarantias.value.length) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona al menos una garantia', life: 2500 })
    return
  }
  garantiaParaEliminar.value = null
  deleteOtpEnviado.value = false
  deleteOtp.value = ''
  deleteOtpEmail.value = ''
  deleteOtpError.value = ''
  deleteDialogVisible.value = true
}

async function solicitarOtpEliminarGarantia() {
  const garantias = garantiasParaEliminar.value
  if (!garantias.length) return
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await (window as any).electron.invoke('facturas:solicitarOtpEliminar', {
      id: garantias[0]?.id,
      facturaIds: garantias.map((c: any) => c.id),
      no_factura: garantias.length === 1 ? (garantias[0]?.no_factura || '') : '',
      nombre_cliente: garantias.length === 1 ? (garantias[0]?.cliente_nombre || '') : '',
      cantidad: garantias.length,
      total: garantias.length,
    })
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

async function borrarGarantias() {
  try {
    const garantias = garantiasParaEliminar.value
    if (!garantias.length) return
    deleteOtpError.value = ''
    const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
    if (!/^\d{4}$/.test(codigo)) {
      deleteOtpError.value = 'Introduce el codigo de 4 digitos'
      return
    }
    deleteOtpConfirmando.value = true
    const otpRes = await (window as any).electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: garantias[0]?.id,
      facturaIds: garantias.map((c: any) => c.id),
      codigo,
    })
    if (!otpRes.success) {
      deleteOtpError.value = otpRes.error || 'Codigo no valido'
      return
    }

    let eliminadas = 0
    for (const g of garantias) {
      await (window as any).electron.invoke('db:delete', 'garantias', g.id)
      eliminadas++
    }
    toast.add({ severity: 'success', summary: 'Exito', detail: `${eliminadas} garantia(s) eliminada(s)`, life: 3000 })
    deleteDialogVisible.value = false
    selectedGarantias.value = []
    garantiaParaEliminar.value = null
    await cargar()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  } finally {
    deleteOtpConfirmando.value = false
  }
}

async function registrarGarantia() {
  if (!form.value.tipo_producto || !form.value.producto_id || !form.value.cliente_id) { errorGarantia.value = 'Completa tipo, producto y cliente'; return }
  guardando.value = true; errorGarantia.value = ''
  try {
    const fechaVenta = form.value.fecha_venta instanceof Date ? form.value.fecha_venta.toISOString().split('T')[0] : form.value.fecha_venta
    const fechaVenc = new Date(fechaVenta)
    fechaVenc.setDate(fechaVenc.getDate() + (form.value.dias_garantia || 30))
    const data = {
      no_factura: form.value.no_factura, tipo_producto: form.value.tipo_producto,
      producto_id: form.value.producto_id, producto_nombre: productosDisponibles.value.find((x: any) => x.id === form.value.producto_id)?.nombre || '',
      imei: form.value.imei, serial: form.value.serial,
      cliente_nombre: form.value.cliente_nombre, cliente_telefono: form.value.cliente_telefono,
      fecha_venta: fechaVenta, fecha_vencimiento: fechaVenc.toISOString().split('T')[0],
      dias_garantia: form.value.dias_garantia, estado: form.value.estado || 'ACTIVA', nota: form.value.nota,
      usuario: '', almacen_id: almacenStore.activeId || 0, almacen_uid: almacenStore.activeUid || '',
    }
    let res
    if (editandoId.value) {
      res = await (window as any).electron.invoke('db:update', 'garantias', editandoId.value, data)
      if (!res.success) throw new Error(res.error)
    } else {
      res = await (window as any).electron.invoke('db:insert', 'garantias', data)
      if (!res.success) throw new Error(res.error)
    }
    const fueEdicion = !!editandoId.value
    dialogGarantia.value = false
    editandoId.value = null
    toast.add({ severity: 'success', summary: fueEdicion ? 'Garantia actualizada' : 'Garantia registrada', detail: data.producto_nombre, life: 3000 })
    await cargar()
  } catch (e: any) { errorGarantia.value = e.message || 'Error al registrar' }
  finally { guardando.value = false }
}

function abrirOrdenTallerDesdeGarantia() {
  if (!editandoId.value) {
    toast.add({ severity: 'warn', summary: 'Guarda primero', detail: 'Debes guardar la garantia antes de enviarla al taller', life: 3000 })
    return
  }
  garantiaTallerOrigen.value = { id: editandoId.value, ...form.value }
  dialogOrdenTallerGarantia.value = true
}

async function onOrdenTallerGarantiaGuardada(payload?: any) {
  dialogOrdenTallerGarantia.value = false
  const garantiaId = garantiaTallerOrigen.value?.id || editandoId.value
  const orden = payload?.orden || null
  if (!garantiaId) return

  const noOrden = orden?.no_orden || orden?.id || ''
  const notaBase = String(form.value.nota || '').trim()
  const notaTaller = noOrden ? `Enviada al taller: ${noOrden}` : 'Enviada al taller'
  const nota = [notaBase, notaTaller].filter(Boolean).join(' | ')
  const res = await (window as any).electron.invoke('db:update', 'garantias', garantiaId, {
    estado: 'EN_REPARACION',
    nota,
  })
  if (res.success) {
    form.value.estado = 'EN_REPARACION'
    form.value.nota = nota
    toast.add({ severity: 'success', summary: 'Enviada al taller', detail: noOrden ? `Orden ${noOrden}` : 'Orden creada', life: 3000 })
    await cargar()
  } else {
    toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar la garantia', life: 3000 })
  }
}

function abrirReclamo() {
  reclamoForm.value = { garantia_id: 0, descripcion: '' }
  busquedaReclamo.value = ''
  garantiasEncontradas.value = []
  garantiaSeleccionada.value = null
  errorReclamo.value = ''
  dialogReclamo.value = true
}

async function buscarGarantiasReclamo() {
  const texto = busquedaReclamo.value.toLowerCase().trim()
  if (!texto) { garantiasEncontradas.value = []; return }
  garantiasEncontradas.value = garantias.value.filter((g: any) =>
    g.estado === 'ACTIVA' && (
      (g.imei || '').toLowerCase().includes(texto) ||
      (g.serial || '').toLowerCase().includes(texto) ||
      (g.cliente_nombre || '').toLowerCase().includes(texto) ||
      (g.producto_nombre || '').toLowerCase().includes(texto)
    )
  ).slice(0, 10)
}

function seleccionarGarantiaReclamo(g: any) {
  reclamoForm.value.garantia_id = g.id
  garantiaSeleccionada.value = g
  garantiasEncontradas.value = []
  busquedaReclamo.value = ''
}

async function registrarReclamo() {
  if (!reclamoForm.value.garantia_id || !reclamoForm.value.descripcion.trim()) { errorReclamo.value = 'Selecciona una garantia y describe el problema'; return }
  guardando.value = true; errorReclamo.value = ''
  try {
    const data = { garantia_id: reclamoForm.value.garantia_id, descripcion: reclamoForm.value.descripcion.trim(), estado: 'PENDIENTE', fecha_ingreso: new Date().toISOString().split('T')[0], usuario: '' }
    const res = await (window as any).electron.invoke('db:insert', 'reclamos_garantia', data)
    if (!res.success) throw new Error(res.error)
    dialogReclamo.value = false
    toast.add({ severity: 'success', summary: 'Reclamo registrado', life: 3000 })
    await cargar()
  } catch (e: any) { errorReclamo.value = e.message || 'Error al registrar reclamo' }
  finally { guardando.value = false }
}

async function verReclamos(g: any) {
  garantiaReclamos.value = g
  const res = await (window as any).electron.invoke('db:getWhere', 'reclamos_garantia', 'garantia_id = ?', [g.id])
  reclamosLista.value = res.success ? (res.data || []) : []
  dialogVerReclamos.value = true
}

async function actualizarEstadoReclamo(r: any) {
  if (!r?.id) return
  const estado = r.estado || 'PENDIENTE'
  const data: any = { estado }
  if (estado === 'RESUELTO') data.fecha_cierre = new Date().toISOString().split('T')[0]
  const res = await (window as any).electron.invoke('db:update', 'reclamos_garantia', r.id, data)
  if (!res.success) {
    toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo cambiar el estado', life: 3000 })
    return
  }
  toast.add({ severity: 'success', summary: 'Estado actualizado', detail: estado, life: 2000 })
  await cargar()
  if (garantiaReclamos.value?.id) {
    garantiaReclamos.value = garantias.value.find((g: any) => g.id === garantiaReclamos.value.id) || garantiaReclamos.value
  }
}

function normalizarTelefonoWhatsApp(telefono: string): string {
  const digitos = String(telefono || '').replace(/\D/g, '')
  if (digitos.length === 10) return `1${digitos}`
  return digitos
}

function mensajeEstadoReclamo(r: any, garantiaBase: any = garantiaReclamos.value): string {
  const garantia = garantiaBase || {}
  const cliente = garantia.cliente_nombre || 'cliente'
  const producto = garantia.producto_nombre || 'producto'
  const identificador = garantia.imei || garantia.serial || ''
  const estado = String(r?.estado || garantia.estado || 'PENDIENTE').toUpperCase()
  const estadoTexto = estado === 'RESUELTO'
    ? 'ya esta resuelto'
    : `tiene estado: ${estado}`
  const partes = [
    `Hola ${cliente}, le informamos que su ${r ? 'reclamo de garantia' : 'garantia'} ${estadoTexto}.`,
    `Producto: ${producto}${identificador ? ` (${identificador})` : ''}.`,
  ]
  if (r?.solucion) partes.push(`Solucion: ${r.solucion}.`)
  partes.push('Gracias por preferirnos.')
  return partes.join('\n')
}

function abrirWhatsAppGarantia(garantia: any, mensaje: string) {
  const telefono = normalizarTelefonoWhatsApp(garantia?.cliente_telefono || '')
  if (!telefono) {
    toast.add({ severity: 'warn', summary: 'WhatsApp', detail: 'El cliente no tiene telefono registrado', life: 3000 })
    return
  }
  window.open(`https://wa.me/${telefono}?text=${encodeURIComponent(mensaje)}`, '_blank')
}

function avisarReclamoWhatsApp(r: any) {
  abrirWhatsAppGarantia(garantiaReclamos.value, mensajeEstadoReclamo(r))
}

function avisarGarantiaWhatsApp(g: any) {
  abrirWhatsAppGarantia(g, mensajeEstadoReclamo(g?.ultimo_reclamo || null, g))
}

function escaparHtml(valor: any): string {
  return String(valor ?? '').replace(/[&<>'"]/g, caracter => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#039;', '"': '&quot;',
  }[caracter] || caracter))
}

async function abrirImpresionEtiqueta(garantia: any) {
  garantiaEtiqueta.value = garantia
  const impresoraConfigurada = localStorage.getItem('etiquetas_printer') || ''
  impresoraEtiqueta.value = ''
  impresorasEtiqueta.value = []
  plantillaEtiquetaId.value = null
  try {
    const plantillas = await (window as any).db.getAll('plantillas_etiquetas')
    if (plantillas?.success) plantillasEtiqueta.value = plantillas.data || []
  } catch {
    plantillasEtiqueta.value = []
  }
  dialogImpresoraEtiqueta.value = true
  cargandoImpresorasEtiqueta.value = true
  try {
    const resultado = await (window as any).electron?.invoke('getPrinters')
    if (resultado?.success) {
      impresorasEtiqueta.value = (resultado.data || [])
        .map((impresora: any) => ({ label: impresora.displayName || impresora.name, value: impresora.name }))
        .filter((impresora: any) => impresora.value)
      if (impresorasEtiqueta.value.some((impresora: any) => impresora.value === impresoraConfigurada)) {
        impresoraEtiqueta.value = impresoraConfigurada
      }
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Impresoras', detail: error?.message || 'No se pudieron cargar las impresoras', life: 3000 })
  } finally {
    cargandoImpresorasEtiqueta.value = false
  }
}

async function confirmarImpresionEtiqueta() {
  const plantilla = plantillaEtiquetaSeleccionada.value
  if (!garantiaEtiqueta.value || !impresoraEtiqueta.value || !plantilla) return
  imprimiendoEtiqueta.value = true
  await imprimirEtiquetaGarantia(garantiaEtiqueta.value, impresoraEtiqueta.value, plantilla)
  imprimiendoEtiqueta.value = false
}

async function imprimirEtiquetaGarantia(garantia: any, impresora: string, plantilla: any) {
  const ancho = Number(plantilla.ancho || 50)
  const alto = Number(plantilla.alto || 30)
  const compacta = ancho <= 30
  const fuente = compacta ? 6 : 10
  const identificador = garantia.imei || garantia.serial || 'SIN IDENTIFICADOR'
  const filas = [
    ['CLIENTE', garantia.cliente_nombre || 'CONSUMIDOR FINAL'],
    ['TEL.', garantia.cliente_telefono || 'SIN TELÉFONO'],
    ['EQUIPO', garantia.producto_nombre || garantia.tipo_producto || 'PRODUCTO'],
    [garantia.imei ? 'IMEI' : 'SERIAL', identificador],
    ['FACTURA', garantia.no_factura || 'N/A'],
    ['VENCE', garantia.fecha_vencimiento || 'N/A'],
  ].map(([titulo, valor]) => `<div class="fila"${compacta && (titulo === 'TEL.' || titulo === 'FACTURA') ? ' style="display:none"' : ''}><b>${escaparHtml(titulo)}:</b> <span>${escaparHtml(valor)}</span></div>`).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Etiqueta de garantía</title><style>
    @page{size:${ancho}mm ${alto}mm;margin:0}*{box-sizing:border-box}body{width:${ancho}mm;height:${alto}mm;overflow:hidden;margin:0;padding:${ancho <= 30 ? '1.5' : '2.5'}mm;font-family:Arial,sans-serif;color:#000;font-size:${fuente}px}.titulo{text-align:center;font-size:0;font-weight:800;border-bottom:1px solid #000;padding-bottom:.5mm;margin-bottom:.5mm}.titulo:before{content:'GARANTIA';font-size:${fuente + 3}px}.fila{padding:${ancho <= 30 ? '.35' : '.65'}mm 0;border-bottom:1px dashed #999;word-break:break-word;line-height:1.05}.codigo{font-family:monospace;font-size:${fuente + 1}px;font-weight:700;text-align:center;padding:.5mm 0;word-break:break-all}.pie{text-align:center;font-size:${Math.max(6, fuente - 2)}px;padding-top:.5mm}
  </style></head><body><div class="titulo">ETIQUETA DE GARANTÍA</div>${filas}<div class="codigo">${escaparHtml(identificador)}</div><div class="pie">Conservar junto al equipo</div></body></html>`
  try {
    const resultado = await (window as any).electron?.invoke('print:ticket', html, impresora, { width: ancho, height: alto })
    if (!resultado?.success) throw new Error(resultado?.error || 'No se pudo enviar a la impresora')
    dialogImpresoraEtiqueta.value = false
    toast.add({ severity: 'success', summary: 'Etiqueta enviada', detail: `Etiqueta de ${garantia.cliente_nombre || 'cliente'} enviada a la impresora`, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error al imprimir', detail: error?.message || 'No se pudo imprimir la etiqueta', life: 4000 })
  }
}

onMounted(cargar)
</script>
