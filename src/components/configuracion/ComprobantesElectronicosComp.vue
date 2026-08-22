<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const loading = ref(false)
const guardandoConfig = ref(false)
const guardandoTodo = ref(false)
const guardandoIds = ref<Record<number, boolean>>({})
const comprobantes = ref<any[]>([])
const busqueda = ref('')
const activo = ref(false)
const tipoDefault = ref('E32')

const tiposPermitidos = ['E31', 'E32', 'E33', 'E34', 'E41', 'E43', 'E44', 'E45', 'E46', 'E47']
const ECF_SECUENCIA_MAX = 9999999999

const comprobantesFiltrados = computed(() => {
  const texto = busqueda.value.trim().toLowerCase()
  const rows = comprobantes.value.filter((c: any) => tiposPermitidos.includes(String(c.tipo || '').toUpperCase()))
  if (!texto) return rows
  return rows.filter((c: any) =>
    String(c.tipo || '').toLowerCase().includes(texto) ||
    String(c.nombre || '').toLowerCase().includes(texto) ||
    String(c.prefijo || '').toLowerCase().includes(texto)
  )
})

const opcionesDefault = computed(() => comprobantes.value
  .filter((c: any) => c.activo && tiposPermitidos.includes(String(c.tipo || '').toUpperCase()))
  .map((c: any) => ({ label: `${c.tipo} - ${c.nombre}`, value: c.tipo }))
)

function normalizarComprobante(comp: any) {
  return {
    ...comp,
    tipo: String(comp.tipo || '').toUpperCase(),
    prefijo: String(comp.prefijo || comp.tipo || '').toUpperCase(),
    secuencia_desde: Number(comp.secuencia_desde || 1),
    secuencia_actual: Number(comp.secuencia_actual || 1),
    secuencia_hasta: Number(comp.secuencia_hasta || ECF_SECUENCIA_MAX),
    activo: Number(comp.activo) === 1 || comp.activo === true,
  }
}

function formatECF(comp: any) {
  const tipo = String(comp.tipo || '').toUpperCase()
  const sec = String(comp.secuencia_actual || 1).padStart(10, '0')
  return `${comp.prefijo || tipo}${sec}`
}

function restantes(comp: any) {
  return Math.max(0, Number(comp.secuencia_hasta || 0) - Number(comp.secuencia_actual || 1) + 1)
}

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'CONFIG' } catch { return 'CONFIG' }
}

async function registrarAuditoria(accion: string, detalle: any = {}, resultado = 'OK') {
  try {
    await (window as any).electron.invoke('auditoria:registrar', {
      modulo: 'configuracion',
      accion,
      entidad: 'comprobantes_fiscales',
      entidad_id: Number(detalle?.id || 0),
      referencia: detalle?.tipo || tipoDefault.value || '',
      usuario: usuarioAuditoria(),
      detalle,
      resultado,
    })
  } catch (_) {}
}

async function setConfig(clave: string, valor: string) {
  const res = await (window as any).config.set(clave, valor)
  if (!res?.success) throw new Error(res?.error || `No se pudo guardar ${clave}`)
}

async function cargar() {
  loading.value = true
  try {
    const [activoRes, defaultRes, compRes] = await Promise.all([
      (window as any).config.get('facturacion_electronica_activa'),
      (window as any).config.get('facturacion_electronica_comprobante_default'),
      (window as any).db.getAll('comprobantes_fiscales'),
    ])
    activo.value = String(activoRes?.data || '') === '1'
    tipoDefault.value = String(defaultRes?.data || '') || 'E32'
    if (compRes?.success) {
      comprobantes.value = (compRes.data || [])
        .map(normalizarComprobante)
        .sort((a: any, b: any) => String(a.tipo).localeCompare(String(b.tipo)))
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar la configuracion', life: 3500 })
  } finally {
    loading.value = false
  }
}

async function guardarConfig() {
  guardandoConfig.value = true
  try {
    await setConfig('facturacion_electronica_activa', activo.value ? '1' : '0')
    await setConfig('facturacion_electronica_comprobante_default', tipoDefault.value || 'E32')
    await registrarAuditoria('guardar_config_ecf', {
      facturacion_electronica_activa: activo.value ? 1 : 0,
      comprobante_default: tipoDefault.value || 'E32',
    })
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuracion de facturacion electronica actualizada', life: 3000 })
  } catch (error: any) {
    await registrarAuditoria('guardar_config_ecf', { error: error?.message || 'No se pudo guardar' }, 'ERROR')
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar', life: 3500 })
  } finally {
    guardandoConfig.value = false
  }
}

async function guardarSecuencia(comp: any) {
  if (Number(comp.secuencia_desde || 1) > Number(comp.secuencia_hasta || 1)) {
    toast.add({ severity: 'warn', summary: 'Secuencia invalida', detail: 'Desde no puede ser mayor que hasta', life: 3000 })
    return
  }
  if (Number(comp.secuencia_actual || 1) < Number(comp.secuencia_desde || 1) || Number(comp.secuencia_actual || 1) > Number(comp.secuencia_hasta || 1)) {
    toast.add({ severity: 'warn', summary: 'Secuencia invalida', detail: 'Actual debe estar entre desde y hasta', life: 3000 })
    return
  }

  guardandoIds.value = { ...guardandoIds.value, [comp.id]: true }
  try {
    const data = {
      prefijo: String(comp.prefijo || comp.tipo || '').toUpperCase(),
      secuencia_desde: Number(comp.secuencia_desde || 1),
      secuencia_actual: Number(comp.secuencia_actual || 1),
      secuencia_hasta: Number(comp.secuencia_hasta || 1),
      activo: comp.activo ? 1 : 0,
    }
    const res = await (window as any).db.update('comprobantes_fiscales', comp.id, data)
    if (!res?.success) throw new Error(res?.error || 'No se pudo guardar la secuencia')
    await registrarAuditoria('guardar_secuencia_ecf', {
      id: comp.id,
      tipo: comp.tipo,
      ...data,
    })
    Object.assign(comp, normalizarComprobante({ ...comp, ...data }))
    toast.add({ severity: 'success', summary: 'Guardado', detail: `${comp.tipo} actualizado`, life: 2200 })
  } catch (error: any) {
    await registrarAuditoria('guardar_secuencia_ecf', {
      id: comp?.id || 0,
      tipo: comp?.tipo || '',
      error: error?.message || 'No se pudo guardar la secuencia',
    }, 'ERROR')
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar la secuencia', life: 3500 })
  } finally {
    guardandoIds.value = { ...guardandoIds.value, [comp.id]: false }
  }
}

async function guardarTodo() {
  guardandoTodo.value = true
  try {
    await guardarConfig()
    for (const comp of comprobantes.value.filter((c: any) => tiposPermitidos.includes(String(c.tipo || '').toUpperCase()))) {
      await guardarSecuencia(comp)
    }
    await cargar()
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Todos los cambios fueron guardados', life: 3000 })
  } finally {
    guardandoTodo.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <div>
    <Toast />

    <div class="max-w-5xl mx-auto space-y-5">
      <div class="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
            <i class="pi pi-receipt text-emerald-600 dark:text-emerald-300 text-lg"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold">Comprobantes Electronicos</h2>
            <p class="text-sm text-surface-500">Activacion y secuencias e-CF para el POS</p>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <Button label="Guardar todo" icon="pi pi-save" :loading="guardandoTodo" @click="guardarTodo" />
          <Button label="Recargar" icon="pi pi-refresh" severity="secondary" outlined :loading="loading" @click="cargar" />
        </div>
      </div>

      <div class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800/50 p-5 space-y-4">
        <div class="flex items-center justify-between gap-4">
          <div>
            <div class="text-sm font-semibold">Facturacion electronica en POS</div>
            <div class="text-xs text-surface-500 mt-0.5">Al activarla, el POS usara solo comprobantes e-CF activos.</div>
          </div>
          <ToggleSwitch v-model="activo" />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-3 border-t border-surface-100 dark:border-surface-700">
          <div class="space-y-1.5">
            <label class="text-sm font-semibold">Comprobante e-CF por defecto</label>
            <Select v-model="tipoDefault" :options="opcionesDefault" optionLabel="label" optionValue="value" placeholder="Selecciona" fluid />
          </div>
          <div class="flex items-end justify-end">
            <Button label="Guardar Configuracion" icon="pi pi-check" :loading="guardandoConfig" @click="guardarConfig" />
          </div>
        </div>
      </div>

      <div class="flex items-center justify-between gap-3">
        <h3 class="font-semibold">Secuencias</h3>
        <InputText v-model="busqueda" placeholder="Buscar e-CF..." class="w-64 max-w-full" />
      </div>

      <div v-if="loading" class="flex items-center justify-center py-16 text-surface-400 gap-3">
        <i class="pi pi-spin pi-spinner text-2xl"></i>
        <span>Cargando comprobantes...</span>
      </div>

      <div v-else class="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        <div v-for="comp in comprobantesFiltrados" :key="comp.id" class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 space-y-3">
          <div class="flex items-start justify-between gap-3">
            <div>
              <div class="text-xs font-bold text-emerald-600">{{ comp.tipo }}</div>
              <div class="font-semibold text-sm">{{ comp.nombre }}</div>
              <div class="font-mono text-xs text-surface-500 mt-1">{{ formatECF(comp) }}</div>
            </div>
            <ToggleSwitch v-model="comp.activo" />
          </div>

          <div class="grid grid-cols-3 gap-2">
            <div class="col-span-3">
              <label class="text-[11px] text-surface-500">Prefijo</label>
              <InputText v-model="comp.prefijo" class="w-full font-mono uppercase" style="text-transform: uppercase;" />
            </div>
            <div>
              <label class="text-[11px] text-surface-500">Desde</label>
              <InputNumber v-model="comp.secuencia_desde" :min="1" :max="ECF_SECUENCIA_MAX" fluid />
            </div>
            <div>
              <label class="text-[11px] text-surface-500">Actual</label>
              <InputNumber v-model="comp.secuencia_actual" :min="1" :max="ECF_SECUENCIA_MAX" fluid />
            </div>
            <div>
              <label class="text-[11px] text-surface-500">Hasta</label>
              <InputNumber v-model="comp.secuencia_hasta" :min="1" :max="ECF_SECUENCIA_MAX" fluid />
            </div>
          </div>

          <div class="flex items-center justify-between gap-3">
            <span class="text-xs text-surface-500">{{ restantes(comp) }} disponibles</span>
            <Button label="Guardar" icon="pi pi-check" size="small" severity="secondary" :loading="!!guardandoIds[comp.id]" @click="guardarSecuencia(comp)" />
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
