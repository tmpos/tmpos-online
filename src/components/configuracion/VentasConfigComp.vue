<script setup lang="ts">
import { ref, onMounted, watch } from 'vue'
import InputNumber from 'primevue/inputnumber'
import Select from 'primevue/select'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { useAlmacenStore } from '@/stores/almacen.store'

const toast = useToast()
const { taxName, taxFullName, currency: systemCurrency } = useLocaleProfile()
const almacenStore = useAlmacenStore()
const loading = ref(true)
const guardando = ref(false)
const comprobantes = ref<any[]>([])

const form = ref({
  impuesto: 18,
  impuesto_incluido: 1,
  moneda: systemCurrency.value,
  tipo_documento_defecto: '',
})

const tiposDocumento = [
  { label: 'Sin Comprobante', value: 'SIN_COMPROBANTE' },
  { label: 'Factura de Consumo (E32)', value: 'FACTURA_CONSUMO' },
  { label: 'Factura de Credito Fiscal (E31)', value: 'FACTURA_CREDITO' },
  { label: 'Nota de Debito (E33)', value: 'NOTA_DEBITO' },
  { label: 'Nota de Credito (E34)', value: 'NOTA_CREDITO' },
  { label: 'Proforma', value: 'PROFORMA' },
  { label: 'Ticket', value: 'TICKET' },
]

watch(systemCurrency, (currency) => {
  form.value.moneda = currency
})

function empresaActiva(empresas: any[]) {
  const uid = String(almacenStore.activeUid || localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || '')
  const id = Number(almacenStore.activeId || localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0)
  return (uid && empresas.find((e: any) => String(e.uid || e.almacen_uid || '') === uid))
    || (id && empresas.find((e: any) => Number(e.almacen_id || e.id) === id))
    || empresas[0]
}

function setImpuestoIncluido(valor: 0 | 1 | 2) {
  form.value.impuesto_incluido = valor
}

function formatSecuencia(comp: any): string {
  const tipo = String(comp?.tipo || '').toUpperCase()
  return String(comp?.secuencia_actual || 1).padStart(tipo.startsWith('E') ? 10 : 8, '0')
}

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'CONFIG' } catch { return 'CONFIG' }
}

async function registrarAuditoria(accion: string, detalle: any = {}, resultado = 'OK') {
  try {
    await window.electron.invoke('auditoria:registrar', {
      modulo: 'configuracion',
      accion,
      entidad: 'empresa',
      entidad_id: Number(detalle?.id || 0),
      referencia: 'ventas',
      usuario: usuarioAuditoria(),
      detalle,
      resultado,
    })
  } catch (_) {}
}

async function cargar() {
  try {
    if (!almacenStore.activeUid && !almacenStore.activeId) await almacenStore.load()
    const [resEmp, resComp] = await Promise.all([
      window.db.getAll('empresa'),
      window.db.getAll('comprobantes_fiscales'),
    ])
    if (resComp.success) comprobantes.value = resComp.data || []
    if (resEmp.success && resEmp.data?.length > 0) {
      const e = empresaActiva(resEmp.data)
      form.value.impuesto = e.impuesto == null || e.impuesto === '' ? 18 : Number(e.impuesto)
      form.value.impuesto_incluido = e.impuesto_incluido == null || e.impuesto_incluido === '' ? 1 : Number(e.impuesto_incluido)
      // Country selection is the single source of truth. Do not restore a
      // legacy company symbol such as RD$ or US$ over the active ISO currency.
      form.value.moneda = systemCurrency.value
      form.value.tipo_documento_defecto = e.tipo_documento_defecto || ''
    }
  } catch (_) {}
  loading.value = false
}

async function guardar() {
  guardando.value = true
  try {
    const res = await window.db.getAll('empresa')
    if (res.success && res.data?.length > 0) {
      const e = empresaActiva(res.data)
      await window.db.update('empresa', e.id, {
        impuesto: form.value.impuesto,
        impuesto_incluido: form.value.impuesto_incluido,
        moneda: systemCurrency.value,
        tipo_documento_defecto: form.value.tipo_documento_defecto,
      })
      await registrarAuditoria('guardar_config_ventas', {
        id: e.id,
        impuesto: form.value.impuesto,
        impuesto_incluido: form.value.impuesto_incluido,
        moneda: systemCurrency.value,
        tipo_documento_defecto: form.value.tipo_documento_defecto,
      })
      window.dispatchEvent(new CustomEvent('ventas-config-changed', { detail: {
        impuesto: Number(form.value.impuesto || 0),
        impuesto_incluido: Number(form.value.impuesto_incluido),
        empresa_uid: e.uid || e.almacen_uid || '',
      } }))
      toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuracion de ventas actualizada', life: 2000 })
    }
  } catch (error: any) {
    await registrarAuditoria('guardar_config_ventas', { error: error?.message || 'Error' }, 'ERROR')
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 })
  } finally {
    guardando.value = false
  }
}

onMounted(async () => {
  await almacenStore.load()
  await cargar()
})
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-6">
      <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <i class="pi pi-shopping-cart text-primary text-lg"></i>
        </div>
        <div>
          <h2 class="text-xl font-bold">Ventas</h2>
          <p class="text-sm text-surface-500">Configuracion de impuestos y opciones de venta</p>
        </div>
      </div>

      <div v-if="loading" class="text-center py-10 text-surface-400">Cargando...</div>

      <div v-else class="max-w-xl space-y-5">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
          <h3 class="font-semibold flex items-center gap-2 text-sm">
            <i class="pi pi-percentage text-primary"></i>
            Impuesto ({{ taxName }})
          </h3>
          <p class="text-xs text-surface-400">{{ taxFullName }}</p>

          <p class="text-xs text-surface-400">Estado actual: <strong>{{ form.impuesto_incluido === 0 ? 'Agregar al precio' : form.impuesto_incluido === 1 ? 'Incluido en el precio' : 'Sin impuestos' }}</strong></p>

          <div class="grid grid-cols-3 gap-3">
            <button
              class="relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer font-semibold"
              :class="Number(form.impuesto_incluido) === 2 ? 'opcion-activa' : 'opcion-inactiva'"
              @click="setImpuestoIncluido(2)"
            >
              <i class="pi pi-ban text-2xl mb-2" :class="Number(form.impuesto_incluido) === 2 ? 'text-white' : 'text-surface-300'"></i>
              <span class="text-sm" :class="Number(form.impuesto_incluido) === 2 ? 'text-white' : 'text-surface-600'">Sin Impuestos</span>
              <span class="text-[10px] text-center mt-1.5" :class="Number(form.impuesto_incluido) === 2 ? 'text-white/70' : 'text-surface-400'">{{ $formatMoney(100) }} sin {{ taxName }}</span>
            </button>
            <button
              class="relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer font-semibold"
              :class="Number(form.impuesto_incluido) === 0 ? 'opcion-activa' : 'opcion-inactiva'"
              @click="setImpuestoIncluido(0)"
            >
              <i class="pi pi-plus-circle text-2xl mb-2" :class="Number(form.impuesto_incluido) === 0 ? 'text-white' : 'text-surface-300'"></i>
              <span class="text-sm" :class="Number(form.impuesto_incluido) === 0 ? 'text-white' : 'text-surface-600'">Agregar al precio</span>
              <span class="text-[10px] text-center mt-1.5" :class="Number(form.impuesto_incluido) === 0 ? 'text-white/70' : 'text-surface-400'">{{ $formatMoney(100) }} + {{ form.impuesto }}% = {{ $formatMoney(100 + (100 * form.impuesto / 100)) }}</span>
            </button>
            <button
              class="relative flex flex-col items-center justify-center p-4 rounded-xl border-2 transition-all cursor-pointer font-semibold"
              :class="Number(form.impuesto_incluido) === 1 ? 'opcion-activa' : 'opcion-inactiva'"
              @click="setImpuestoIncluido(1)"
            >
              <i class="pi pi-check-circle text-2xl mb-2" :class="Number(form.impuesto_incluido) === 1 ? 'text-white' : 'text-surface-300'"></i>
              <span class="text-sm" :class="Number(form.impuesto_incluido) === 1 ? 'text-white' : 'text-surface-600'">Incluido en el precio</span>
              <span class="text-[10px] text-center mt-1.5" :class="Number(form.impuesto_incluido) === 1 ? 'text-white/70' : 'text-surface-400'">{{ $formatMoney(100) }} ya incluye {{ form.impuesto }}% {{ taxName }}</span>
            </button>
          </div>

          <div class="flex items-center gap-4 pt-2">
            <label class="text-sm font-medium">Porcentaje {{ taxName }}</label>
            <InputNumber v-model="form.impuesto" :min="0" :max="100" class="w-24" fluid @focus="(e) => e.target.select()">
              <template #suffix><span class="text-xs text-surface-400">%</span></template>
            </InputNumber>
          </div>
        </div>

        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
          <h3 class="font-semibold flex items-center gap-2 text-sm">
            <i class="pi pi-file text-primary"></i>
            Tipo de Documento
          </h3>

          <div class="space-y-1.5">
            <label class="text-sm font-medium">Documento por defecto en ventas</label>
            <Select v-model="form.tipo_documento_defecto" :options="tiposDocumento" optionLabel="label" optionValue="value" placeholder="Seleccionar tipo de documento..." fluid />
            <p class="text-xs text-surface-400">Este tipo de documento se usara como predeterminado al realizar ventas en el POS.</p>
          </div>

          <div v-if="comprobantes.length > 0" class="space-y-1.5">
            <label class="text-sm font-medium">Comprobante fiscal por defecto</label>
            <div class="flex flex-col gap-1 p-3 rounded-lg bg-surface-50 dark:bg-surface-700/30 text-sm">
              <div v-for="c in comprobantes.filter(c => c.es_default)" :key="c.id" class="flex items-center gap-2">
                <i class="pi pi-check-circle text-green-500 text-xs"></i>
                <span class="font-medium">{{ c.tipo }}</span>
                <span class="text-surface-400">- {{ c.nombre }}</span>
                <span class="text-xs text-surface-400 font-mono ml-auto">{{ c.prefijo || c.tipo }}{{ formatSecuencia(c) }}</span>
              </div>
              <p v-if="!comprobantes.find(c => c.es_default)" class="text-surface-400 text-xs">No hay comprobante fiscal por defecto. Configurelo en <strong>Comprobantes Fiscales</strong>.</p>
            </div>
          </div>
        </div>

        <div class="flex justify-end">
          <Button label="Guardar Cambios" icon="pi pi-check" :loading="guardando" @click="guardar" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.opcion-activa {
  background: var(--p-primary-500, #3b82f6);
  color: #fff;
  border-color: var(--p-primary-500, #3b82f6);
  transform: scale(1.02);
  box-shadow: 0 4px 12px rgba(0,0,0,0.15);
}
.opcion-inactiva {
  background: #fff;
  color: var(--p-surface-500, #64748b);
  border-color: var(--p-surface-200, #e2e8f0);
}
.opcion-inactiva:hover {
  border-color: var(--p-primary-300, #93c5fd);
  background: var(--p-primary-50, #eff6ff);
}
.dark .opcion-inactiva {
  background: var(--p-surface-800, #1e293b);
  color: var(--p-surface-300, #cbd5e1);
  border-color: var(--p-surface-600, #475569);
}
.dark .opcion-inactiva:hover {
  border-color: var(--p-primary-300, #93c5fd);
  background: color-mix(in srgb, var(--p-primary-900) 10%, var(--p-surface-800));
}
</style>
