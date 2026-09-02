<template>
  <div class="space-y-4">
    <!-- Header -->
    <div class="flex items-start justify-between">
      <div>
        <div class="flex items-center gap-3 mb-1">
          <div class="w-10 h-10 rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 flex items-center justify-center shadow-lg shadow-violet-500/20">
            <i class="pi pi-cloud text-white text-lg"></i>
          </div>
          <div>
            <h2 class="text-lg font-bold text-surface-900 dark:text-surface-0">TM Cloud</h2>
            <p class="text-xs text-surface-400">Sincronizacion privada con TMPBase</p>
          </div>
        </div>
      </div>
      <div class="flex items-center gap-2">
        <span v-if="estado?.connected" class="flex items-center gap-1.5 text-xs font-medium text-emerald-600 bg-emerald-50 dark:bg-emerald-900/30 px-2.5 py-1 rounded-full">
          <span class="w-1.5 h-1.5 bg-emerald-500 rounded-full animate-pulse"></span> Conectado
        </span>
        <span v-else class="flex items-center gap-1.5 text-xs font-medium text-red-500 bg-red-50 dark:bg-red-900/30 px-2.5 py-1 rounded-full">
          <span class="w-1.5 h-1.5 bg-red-500 rounded-full"></span> Desconectado
        </span>
        <span v-if="realtimeConnected" class="flex items-center gap-1.5 text-xs font-medium text-cyan-600 bg-cyan-50 dark:bg-cyan-900/30 px-2.5 py-1 rounded-full">
          <span class="w-1.5 h-1.5 bg-cyan-500 rounded-full animate-pulse"></span> Realtime
        </span>
      </div>
    </div>

    <!-- Config Card -->
    <div class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800/50 p-5 space-y-4">
      <div class="flex items-center gap-2 mb-1">
        <i class="pi pi-cog text-surface-400 text-sm"></i>
        <span class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Configuracion</span>
      </div>

      <div class="grid grid-cols-1 gap-3">
        <div>
          <label class="text-xs font-medium text-surface-500 mb-1.5 block">URL API del proyecto</label>
          <InputText v-model="form.url" placeholder="https://tu-dominio.com/api/prj_xxx" class="w-full" />
          <small class="text-[11px] text-surface-400">Copiala desde TMPBase. Debe terminar en /api/prj_xxx.</small>
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-medium text-surface-500 mb-1.5 block flex items-center gap-1">
              Public Key <span class="text-[10px] px-1.5 py-0.5 rounded bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400">Lectura</span>
            </label>
            <Password v-model="form.key" placeholder="tmp_public_..." :feedback="false" toggleMask fluid class="w-full" />
          </div>
          <div>
            <label class="text-xs font-medium text-surface-500 mb-1.5 block flex items-center gap-1">
              Secret Key <span class="text-[10px] px-1.5 py-0.5 rounded bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400">Escritura</span>
            </label>
            <Password v-model="form.serviceKey" placeholder="tmp_secret_..." :feedback="false" toggleMask fluid class="w-full" />
          </div>
        </div>
      </div>

      <div class="flex flex-wrap gap-2 pt-1">
        <Button label="Guardar" icon="pi pi-check" :loading="guardando" @click="guardar" severity="success" />
        <Button label="Probar conexion" icon="pi pi-plug" severity="secondary" :loading="testLoading" @click="probarConexion" />
        <Button label="Panel Admin" icon="pi pi-external-link" severity="secondary" outlined @click="abrirAdmin" />
      </div>
    </div>

    <!-- Status Card -->
    <div v-if="estado" class="rounded-2xl border p-5 transition-all" 
      :class="estado.connected ? 'border-emerald-200 dark:border-emerald-800 bg-emerald-50/50 dark:bg-emerald-900/10' : 'border-red-200 dark:border-red-800 bg-red-50/50 dark:bg-red-900/10'">
      <div class="flex items-center gap-2 mb-3">
        <i :class="estado.connected ? 'pi pi-check-circle text-emerald-500' : 'pi pi-exclamation-triangle text-red-500'" class="text-lg" />
        <span class="text-sm font-semibold" :class="estado.connected ? 'text-emerald-700 dark:text-emerald-400' : 'text-red-700 dark:text-red-400'">
          {{ estado.connected ? 'Conexion exitosa' : estado.error }}
        </span>
      </div>
      <div v-if="estado.connected && estado.stats" class="grid grid-cols-3 gap-3">
        <div class="bg-white/70 dark:bg-surface-800/50 rounded-xl p-3 text-center border border-surface-100 dark:border-surface-700">
          <div class="text-xl font-bold text-accent-500">{{ estado.stats.project_name ?? '-' }}</div>
          <div class="text-[10px] text-surface-400 uppercase tracking-wider mt-0.5">Proyecto</div>
        </div>
        <div class="bg-white/70 dark:bg-surface-800/50 rounded-xl p-3 text-center border border-surface-100 dark:border-surface-700">
          <div class="text-sm font-bold text-emerald-500 truncate">{{ estado.stats.project_uid ?? '-' }}</div>
          <div class="text-[10px] text-surface-400 uppercase tracking-wider mt-0.5">UID</div>
        </div>
        <div class="bg-white/70 dark:bg-surface-800/50 rounded-xl p-3 text-center border border-surface-100 dark:border-surface-700">
          <div class="text-xl font-bold text-amber-500">{{ estado.stats.tables ?? '-' }}</div>
          <div class="text-[10px] text-surface-400 uppercase tracking-wider mt-0.5">Tablas</div>
        </div>
      </div>
    </div>

    <!-- Online-only mode -->
    <div class="rounded-2xl border border-blue-200 dark:border-blue-800 bg-blue-50/60 dark:bg-blue-950/20 p-5">
      <div class="flex items-center gap-2">
        <i class="pi pi-cloud text-blue-600"></i>
        <span class="text-sm font-semibold text-blue-800 dark:text-blue-200">Modo online obligatorio</span>
      </div>
      <p class="mt-2 text-xs text-blue-700 dark:text-blue-300">Todos los datos del negocio se leen y guardan directamente en TM Cloud. No hay copia local ni sincronizacion pendiente.</p>
    </div>

    <!-- Actions Card -->
    <div v-if="false" class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800/50 p-5 space-y-3">
      <div class="flex items-center gap-2 mb-1">
        <i class="pi pi-bolt text-surface-400 text-sm"></i>
        <span class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Acciones</span>
      </div>

      <div class="grid grid-cols-2 gap-2">
        <Button label="Crear Tablas" icon="pi pi-database" severity="secondary" :loading="creandoTablas" @click="createTables" class="w-full justify-start" />
        <Button label="Crear Local" icon="pi pi-download" severity="warn" :loading="creandoTablasLocales" @click="createLocalTablesFromServer" class="w-full justify-start" />
        <Button label="Descargar Todo" icon="pi pi-cloud-download" severity="warn" :loading="downloadAllLoading" @click="downloadAll" class="w-full justify-start" />
        <Button label="Enviar Todo" icon="pi pi-cloud-upload" severity="help" :loading="pushAllLoading" @click="pushAllData" class="w-full justify-start" />
        <Button label="Sync Cambios" icon="pi pi-arrow-right-arrow-left" severity="info" :loading="syncChangesLoading" @click="syncChanges" class="w-full justify-start" />
        <Button label="Sync Completo" icon="pi pi-sync" :loading="syncing" @click="syncNow" class="w-full justify-start" />
        <Button label="Reparar UID de IMEI" icon="pi pi-wrench" severity="warn" :loading="reparandoImeiUid" @click="repararReferenciasImei" class="w-full justify-start col-span-2" />
      </div>
      <p class="text-[11px] text-surface-400">Convierte los IMEI antiguos que usan el ID local del teléfono a su UID y los actualiza en TM Cloud.</p>
    </div>

    <div v-if="false" class="rounded-2xl border border-cyan-200 dark:border-cyan-800 bg-cyan-50/40 dark:bg-cyan-950/10 p-5 space-y-4">
      <div class="flex items-center gap-2">
        <i class="pi pi-cloud-download text-cyan-600 text-sm"></i>
        <div><span class="text-xs font-semibold text-cyan-800 dark:text-cyan-200 uppercase tracking-wider">Importar desde otra API</span><p class="text-xs text-surface-500 mt-1">Descarga tablas, campos y registros para prepararlos para TM Cloud.</p></div>
      </div>
      <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div><label class="text-xs font-medium text-surface-500 mb-1.5 block">URL base de la API externa</label><InputText v-model="externalApi.url" placeholder="https://servidor.com/api2" class="w-full" /></div>
        <div><label class="text-xs font-medium text-surface-500 mb-1.5 block">Authorization</label><Password v-model="externalApi.token" :feedback="false" toggleMask placeholder="Token de la API externa" fluid class="w-full" /></div>
      </div>
      <div class="flex flex-wrap items-center gap-2"><Button label="Elegir tablas para importar" icon="pi pi-list-check" severity="info" :loading="externalImportLoading" @click="cargarTablasExternas" /><span v-if="externalImportResult" class="text-xs text-surface-600 dark:text-surface-300">{{ externalImportResult }}</span></div>
    </div>

    <Dialog v-model:visible="externalTableDialog" header="Tablas a importar" modal :style="{ width: 'min(48rem, 96vw)' }">
      <div class="space-y-3">
        <p class="text-sm text-surface-500">Marca solo las tablas que deseas bajar. Puedes cambiar el destino de cada una para agrupar datos, por ejemplo <strong>productos → productos_categoria_a</strong>.</p>
        <div class="flex flex-wrap items-center gap-3">
          <IconField class="flex-1 min-w-48"><InputIcon class="pi pi-search" /><InputText v-model="externalTableSearch" placeholder="Buscar tabla..." class="w-full" /></IconField>
          <div class="flex items-center gap-2 whitespace-nowrap">
            <label for="seleccionar-todas-tablas" class="text-xs font-medium text-surface-600 dark:text-surface-300">Seleccionar todas</label>
            <ToggleSwitch inputId="seleccionar-todas-tablas" v-model="todasExternalTablesSeleccionadas" />
          </div>
          <span class="text-xs text-surface-500 whitespace-nowrap">{{ externalTablesFiltradas.length }} tablas</span>
        </div>
        <div class="max-h-[50vh] overflow-y-auto space-y-2 pr-1">
          <div v-for="tabla in externalTablesFiltradas" :key="tabla.origen" class="grid grid-cols-1 sm:grid-cols-[auto_1fr_1fr] items-center gap-2 rounded-xl border p-3" :class="tabla.seleccionada ? 'border-cyan-200 bg-cyan-50/50 dark:border-cyan-800 dark:bg-cyan-950/20' : 'border-surface-200 dark:border-surface-700 opacity-65'">
            <input v-model="tabla.seleccionada" type="checkbox" class="h-4 w-4 accent-cyan-600" />
            <div><p class="text-xs text-surface-400">Tabla origen</p><p class="font-semibold font-mono text-sm">{{ tabla.origen }}</p></div>
            <div><label class="text-xs text-surface-400">Guardar en tabla local</label><InputText v-model="tabla.destino" :disabled="!tabla.seleccionada" class="w-full mt-1" /></div>
          </div>
        </div>
        <p v-if="externalTablesFiltradas.length === 0" class="py-4 text-center text-sm text-surface-400">No se encontraron tablas.</p>
        <p v-if="!externalTables.some(t => t.seleccionada)" class="text-xs text-amber-600">Selecciona al menos una tabla para continuar.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="externalTableDialog = false" />
        <Button
          :label="externalImportLoading ? 'Importando tablas...' : 'Importar seleccionadas'"
          :icon="externalImportLoading ? 'pi pi-spin pi-spinner' : 'pi pi-download'"
          :loading="externalImportLoading"
          :disabled="externalImportLoading || !externalTables.some(t => t.seleccionada)"
          @click="importarApiExterna"
        />
      </template>
    </Dialog>

    <!-- Sync Status -->
    <div v-if="false && syncStatus" class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800/50 p-4">
      <div v-if="syncStatus.running" class="flex items-center gap-3">
        <div class="w-8 h-8 rounded-full bg-accent-100 dark:bg-accent-500/20 flex items-center justify-center">
          <i class="pi pi-spin pi-spinner text-accent-500 text-sm"></i>
        </div>
        <div>
          <div class="text-sm font-medium text-surface-700 dark:text-surface-200">{{ syncStatus.tabla || 'Sincronizando...' }}</div>
          <div class="text-xs text-surface-400">{{ syncStatus.progreso }}</div>
        </div>
      </div>
      <div v-else-if="syncStatus.result" class="flex items-start gap-3">
        <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5"
          :class="syncStatus.result.success ? 'bg-emerald-100 dark:bg-emerald-900/30' : 'bg-red-100 dark:bg-red-900/30'">
          <i :class="syncStatus.result.success ? 'pi pi-check text-emerald-500' : 'pi pi-times text-red-500'" class="text-sm"></i>
        </div>
        <div>
          <div class="text-sm font-medium text-surface-700 dark:text-surface-200">{{ syncStatus.result.message }}</div>
          <div class="text-[10px] text-surface-400 mt-0.5">
            Ultimo: {{ syncStatus.lastSync ? new Date(syncStatus.lastSync).toLocaleString() : '--' }}
          </div>
          <div v-if="syncStatus.result.inserts > 0 || syncStatus.result.updates > 0 || syncStatus.result.errors > 0" class="flex gap-3 mt-1.5 text-xs">
            <span class="text-emerald-600 font-medium" v-if="syncStatus.result.inserts">+{{ syncStatus.result.inserts }} nuevos</span>
            <span class="text-amber-600 font-medium" v-if="syncStatus.result.updates">{{ syncStatus.result.updates }} actualizados</span>
            <span class="text-red-500 font-medium" v-if="syncStatus.result.errors">{{ syncStatus.result.errors }} errores</span>
          </div>
          <div v-if="syncStatus.details && syncStatus.details.length > 0" class="mt-2 text-[10px] text-surface-400 space-y-0.5">
            <div v-for="d in syncStatus.details.filter((x:any)=>x.errors > 0)" :key="d.tabla" class="text-red-400">
              {{ d.tabla }}: {{ d.errors }} error(es)
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { reactive, ref, computed, onMounted } from 'vue'
import * as tmc from '@/services/tmCloudClient'
import * as tmSync from '@/services/tmCloudSyncService'
import Password from 'primevue/password'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import Button from 'primevue/button'
import ToggleSwitch from 'primevue/toggleswitch'
import Dialog from 'primevue/dialog'

const form = reactive({
  url: '',
  key: '',
  serviceKey: '',
  mode: 'online' as string,
  autoSync: false,
  interval: 30,
})

const modos = [
  { label: 'Offline', value: 'offline' },
  { label: 'Online', value: 'online' },
  { label: 'Ambos', value: 'ambos' },
]

const guardando = ref(false)
const testLoading = ref(false)
const syncing = ref(false)
const creandoTablas = ref(false)
const creandoTablasLocales = ref(false)
const pushAllLoading = ref(false)
const syncChangesLoading = ref(false)
const downloadAllLoading = ref(false)
const reparandoImeiUid = ref(false)
const estado = ref<{ connected: boolean; error?: string; stats?: any } | null>(null)
const syncStatus = ref<any>(null)
const realtimeConnected = ref(false)
const externalApi = reactive({ url: '', token: '' })
const externalImportLoading = ref(false)
const externalImportResult = ref('')
const externalTableDialog = ref(false)
const externalTables = ref<{ origen: string; destino: string; seleccionada: boolean }[]>([])
const externalTableSearch = ref('')
const externalTablesFiltradas = computed(() => {
  const texto = externalTableSearch.value.trim().toLowerCase()
  return texto ? externalTables.value.filter(tabla => `${tabla.origen} ${tabla.destino}`.toLowerCase().includes(texto)) : externalTables.value
})
const todasExternalTablesSeleccionadas = computed({
  get: () => externalTables.value.length > 0 && externalTables.value.every(tabla => tabla.seleccionada),
  set: (seleccionada: boolean) => {
    externalTables.value.forEach(tabla => { tabla.seleccionada = seleccionada })
  },
})

tmSync.setStatusCallback((s) => {
  syncStatus.value = s
  if (typeof s.realtime === 'boolean') realtimeConnected.value = s.realtime
})

onMounted(async () => {
  const config = await tmc.loadConfig()
  form.url = config.url
  form.key = config.key
  form.serviceKey = config.serviceKey
  if (config.url && config.key) {
    try {
      const stats = await tmc.testConnection(config.url, config.key)
      tmc.resetConfig()
      await tmc.ensureConfigLoaded(true)
      estado.value = { connected: true, stats }
    } catch (e: any) {
      estado.value = { connected: false, error: e.message }
    }
  }

  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const getVal = (clave: string) => res.data.find((r: any) => r.clave === clave)?.valor || ''
      form.mode = 'online'
      form.autoSync = false
      externalApi.url = getVal('tm_external_api_url')
      externalApi.token = getVal('tm_external_api_token')
    }
  } catch {}
})

async function guardar() {
  guardando.value = true
  try {
    if (!form.serviceKey.trim()) throw new Error('La Secret Key es requerida para sincronizar y crear tablas')
    const stats = await tmc.testConnection(form.url, form.key)
    const saved = await tmc.saveConfig(form.url, form.key, form.serviceKey)
    form.url = saved.url
    form.key = saved.key
    form.serviceKey = saved.serviceKey
    form.mode = 'online'
    form.autoSync = false
    tmSync.stopAutoSync()
    tmSync.stopRealtime()
    tmc.resetConfig()
    await tmc.ensureConfigLoaded(true)
    estado.value = { connected: true, stats }
  } catch (e: any) {
    estado.value = { connected: false, error: e.message }
  } finally {
    guardando.value = false
  }
}

async function probarConexion() {
  testLoading.value = true
  try {
    const stats = await tmc.testConnection(form.url, form.key)
    tmc.init({ url: form.url.trim(), key: form.key.trim(), serviceKey: form.serviceKey.trim() })
    estado.value = { connected: true, stats }
  } catch (e: any) {
    estado.value = { connected: false, error: e.message }
  } finally {
    testLoading.value = false
  }
}

async function syncChanges() {
  syncChangesLoading.value = true
  tmSync.setSyncCompleteCallback((details) => {
    if (details.length > 0) {
      estado.value = {
        connected: true,
        error: `${details.length} tablas con cambios: ${details.map(d => `${d.tabla}(bajados ${d.downloaded}/subidos ${d.uploaded})`).join(', ')}`
      }
    } else {
      estado.value = { connected: true, error: 'Sin cambios detectados' }
    }
  })
  try {
    const result = await tmSync.syncAll(form.mode as any, true)
    syncStatus.value = { running: false, result }
  } catch (e: any) {
    syncStatus.value = { running: false, result: { message: 'Error: ' + e.message, success: false, inserts: 0, updates: 0, errors: 1 } }
  } finally {
    syncChangesLoading.value = false
  }
}

async function pushAllData() {
  pushAllLoading.value = true
  try {
    const result = await tmSync.pushAllTables(form.mode as any)
    syncStatus.value = { running: false, result }
    estado.value = { connected: true, error: result.message }
  } catch (e: any) {
    syncStatus.value = { running: false, result: { message: 'Error: ' + e.message, success: false, inserts: 0, updates: 0, errors: 1 } }
  } finally {
    pushAllLoading.value = false
  }
}

async function downloadAll() {
  downloadAllLoading.value = true
  try {
    const result = await tmSync.downloadAllTables()
    syncStatus.value = { running: false, result }
    estado.value = { connected: true, error: result.message }
  } catch (e: any) {
    syncStatus.value = { running: false, result: { message: 'Error: ' + e.message, success: false, inserts: 0, updates: 0, errors: 1 } }
  } finally {
    downloadAllLoading.value = false
  }
}

async function syncNow() {
  syncing.value = true
  try {
    await tmSync.startAutoSync(0)
    await tmSync.syncAll(form.mode as any)
  } catch (e: any) {
    syncStatus.value = { running: false, result: { message: 'Error: ' + e.message } }
  } finally {
    syncing.value = false
  }
}

async function repararReferenciasImei() {
  reparandoImeiUid.value = true
  try {
    const reparacion = await (window as any).electron.invoke('imei:repararReferenciasTelefono')
    if (!reparacion?.success) throw new Error(reparacion?.error || 'No se pudieron reparar los IMEI')
    const ids: number[] = reparacion.data?.ids || []
    let sincronizados = 0
    let errores = 0
    if (ids.length && form.url && (form.key || form.serviceKey)) {
      tmc.init({ url: form.url.trim(), key: form.key.trim(), serviceKey: form.serviceKey.trim() })
      for (const id of ids) {
        const resultado = await tmSync.pushLocalRowToCloud('imei', id)
        if (resultado.success) sincronizados++
        else errores++
      }
    }
    const mensaje = ids.length
      ? `${ids.length} IMEI reparados${sincronizados ? ` y ${sincronizados} sincronizados` : ''}${errores ? ` (${errores} pendientes de sincronizar)` : ''}`
      : 'No habia IMEI con referencias locales pendientes de reparar'
    estado.value = { connected: true, error: mensaje }
  } catch (e: any) {
    estado.value = { connected: false, error: e.message || 'Error reparando referencias de IMEI' }
  } finally {
    reparandoImeiUid.value = false
  }
}

function nombreSeguro(nombre: any): string {
  const valor = String(nombre || '').trim()
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(valor)) throw new Error(`Nombre no valido: ${valor}`)
  return valor
}

async function guardarConfigExterna(clave: string, valor: string) {
  const res = await (window as any).db.getAll('configuracion')
  const actual = res.success ? (res.data || []).find((r: any) => r.clave === clave) : null
  if (actual) await (window as any).db.update('configuracion', actual.id, { valor })
  else await (window as any).db.insert('configuracion', { clave, valor, tipo: 'string', categoria: 'tmcloud' })
}

async function ejecutarSqlLocal(sql: string) {
  const res = await (window as any).electron.invoke('consultaservidor', 'rawQuery', sql)
  if (res?.success === false) throw new Error(res.error || 'No se pudo actualizar la base local')
}

async function cargarTablasExternas() {
  const base = externalApi.url.trim().replace(/\/+$/, '')
  const token = externalApi.token.trim()
  if (!base || !token) { externalImportResult.value = 'Indica la URL y el token de la API externa.'; return }
  externalImportLoading.value = true
  externalImportResult.value = ''
  try {
    const response = await fetch(`${base}/tablas/`, { headers: { Authorization: token, Accept: 'application/json' } })
    if (!response.ok) throw new Error(`No se pudieron consultar las tablas (${response.status})`)
    const data = await response.json()
    const tablas = (Array.isArray(data) ? data : data?.data || []).map(nombreSeguro)
    externalTables.value = tablas.map(origen => ({ origen, destino: origen, seleccionada: false }))
    externalTableSearch.value = ''
    externalTableDialog.value = true
  } catch (e: any) {
    externalImportResult.value = e.message || 'No se pudieron consultar las tablas.'
  } finally {
    externalImportLoading.value = false
  }
}

async function importarApiExterna() {
  const base = externalApi.url.trim().replace(/\/+$/, '')
  const token = externalApi.token.trim()
  if (!base || !token) { externalImportResult.value = 'Indica la URL y el token de la API externa.'; return }
  externalImportLoading.value = true
  externalImportResult.value = ''
  let clavesForaneasSuspendidas = false
  try {
    const headers = { Authorization: token, Accept: 'application/json' }
    const tablas = externalTables.value.filter(tabla => tabla.seleccionada).map(tabla => ({ origen: nombreSeguro(tabla.origen), destino: nombreSeguro(tabla.destino) }))
    if (!tablas.length) throw new Error('Selecciona al menos una tabla para importar.')
    // Las tablas pueden llegar en cualquier orden. Se suspenden solo durante
    // esta carga para conservar las relaciones del origen sin bloquear hijos
    // como IMEI/accesorios antes de que se inserten sus tablas padre.
    await ejecutarSqlLocal('PRAGMA foreign_keys = OFF')
    clavesForaneasSuspendidas = true
    let creadas = 0, camposAgregados = 0, registros = 0, omitidos = 0
    const schemasCloud: any[] = []

    for (const tablaConfig of tablas) {
      const { origen, destino } = tablaConfig
      const camposRes = await fetch(`${base}/campos/${encodeURIComponent(origen)}`, { headers })
      if (!camposRes.ok) throw new Error(`No se pudieron consultar los campos de ${origen}`)
      const camposData = await camposRes.json()
      const campos = (Array.isArray(camposData) ? camposData : camposData?.data || []).map(nombreSeguro)
      const datosRes = await fetch(`${base}/datosarray/${encodeURIComponent(origen)}`, { headers })
      if (!datosRes.ok) throw new Error(`No se pudieron descargar los datos de ${origen}`)
      const datosData = await datosRes.json()
      const datos = Array.isArray(datosData) ? datosData : datosData?.data || []
      const columnas = Array.from(new Set(['id', ...campos, 'uid', 'created_at', 'updated_at']))
      const tablaExiste = await (window as any).electron.invoke('consultaservidor', 'tableExists', destino)
      const existe = Array.isArray(tablaExiste) ? tablaExiste[0] === 'ok' : Boolean(tablaExiste?.success)
      if (!existe) {
        const definiciones = columnas.map(c => c === 'id' ? '"id" INTEGER PRIMARY KEY' : `"${c}" TEXT DEFAULT ''`)
        await ejecutarSqlLocal(`CREATE TABLE IF NOT EXISTS "${destino}" (${definiciones.join(', ')})`)
        creadas++
      } else {
        const local = await (window as any).electron.invoke('consultaservidor', 'getTableColumns', destino, 'names')
        const existentes = new Set(Array.isArray(local) ? local : [])
        for (const campo of columnas) {
          if (existentes.has(campo) || campo === 'id') continue
          await ejecutarSqlLocal(`ALTER TABLE "${destino}" ADD COLUMN "${campo}" TEXT DEFAULT ''`)
          camposAgregados++
        }
      }
      const metadatosColumnas = await (window as any).electron.invoke('consultaservidor', 'getTableColumns', destino)
      const columnasLocales = new Set((Array.isArray(metadatosColumnas) ? metadatosColumnas : []).map((columna: any) => columna.name))
      const requeridas = (Array.isArray(metadatosColumnas) ? metadatosColumnas : [])
        .filter((columna: any) => Number(columna.notnull) === 1 && columna.dflt_value == null && Number(columna.pk) === 0)
        .map((columna: any) => columna.name)
      const existentes = await (window as any).db.getAll(destino)
      const porId = new Map((existentes.success ? existentes.data || [] : []).map((fila: any) => [String(fila.id), fila]))
      for (const fila of datos) {
        const limpia: Record<string, any> = {}
        // Solo se usan campos que existen en la tabla local. Esto permite
        // importar APIs con esquemas parciales sin intentar columnas ajenas.
        for (const campo of campos) {
          if (columnasLocales.has(campo) && fila[campo] !== undefined && fila[campo] !== null) limpia[campo] = fila[campo]
        }
        // En versiones antiguas el numero IMEI se guardaba en `nombre`.
        // Si la API lo envia como `imei`, se usa como respaldo obligatorio.
        if (destino === 'imei' && !String(limpia.nombre || '').trim() && fila.imei != null) limpia.nombre = String(fila.imei)
        if (fila.id !== undefined && fila.id !== null) limpia.id = Number(fila.id)
        const actual = porId.get(String(fila.id))
        const faltantes = !actual ? requeridas.filter((campo: string) => limpia[campo] === undefined || limpia[campo] === null || limpia[campo] === '') : []
        if (faltantes.length) {
          omitidos++
          continue
        }
        if (actual) delete limpia.id
        const resultado = actual ? await (window as any).db.update(destino, actual.id, limpia) : await (window as any).db.insert(destino, limpia)
        if (resultado.success) registros++
        else omitidos++
      }
      schemasCloud.push({ name: destino, columns: columnas.filter(c => c !== 'id').map(name => ({ name, type: 'TEXT', nullable: true })) })
    }
    if (form.url && form.serviceKey && schemasCloud.length) {
      await fetch(`${form.url.replace(/\/+$/, '')}/schema/tables/batch`, { method: 'POST', headers: { Authorization: `Bearer ${form.serviceKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ tables: schemasCloud }) })
    }
    await guardarConfigExterna('tm_external_api_url', base)
    await guardarConfigExterna('tm_external_api_token', token)
    externalImportResult.value = `${tablas.length} tablas: ${creadas} creadas, ${camposAgregados} campos agregados y ${registros} registros importados${omitidos ? ` (${omitidos} omitidos por datos incompatibles)` : ''}.`
    externalTableDialog.value = false
  } catch (e: any) {
    externalImportResult.value = e.message || 'No se pudo completar la importacion.'
  } finally {
    if (clavesForaneasSuspendidas) {
      try { await ejecutarSqlLocal('PRAGMA foreign_keys = ON') } catch (_) {}
    }
    externalImportLoading.value = false
  }
}

function abrirAdmin() {
  const base = form.url.replace(/\/+$/, '')
  const adminUrl = base.replace(/\/api\/prj_[A-Za-z0-9]+$/i, '')
  window.open(adminUrl || base, '_blank')
}

const TABLE_SCHEMAS: Record<string, { name: string; type: string; nullable?: boolean; primary?: boolean; required?: boolean; default?: string | number; indexed?: boolean; unique?: boolean }[]> = {
  usuarios: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'usuario', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'password', type: 'TEXT' },
    { name: 'pin', type: 'TEXT' },
    { name: 'patron', type: 'TEXT' },
    { name: 'pregunta_secreta', type: 'TEXT' },
    { name: 'respuesta', type: 'TEXT' },
    { name: 'fecha', type: 'TEXT' },
    { name: 'nivel_seguridad', type: 'TEXT' },
    { name: 'intentos_login', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'permisos', type: 'TEXT' },
    { name: 'restrinciones', type: 'TEXT' },
    { name: 'porciento', type: 'TEXT' },
    { name: 'imagen', type: 'TEXT' },
    { name: 'rol', type: 'TEXT' },
    { name: 'ultimo_acceso', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  empresa: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'legal', type: 'TEXT' },
    { name: 'encargado', type: 'TEXT' },
    { name: 'telefono', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'direccion', type: 'TEXT' },
    { name: 'logo', type: 'TEXT' },
    { name: 'impuesto', type: 'REAL' },
    { name: 'impuesto_incluido', type: 'INTEGER' },
    { name: 'moneda', type: 'TEXT' },
    { name: 'tipo_documento_defecto', type: 'TEXT' },
    { name: 'almacen_id', type: 'INTEGER' },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  clientes: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'cedula', type: 'TEXT' },
    { name: 'telefono', type: 'TEXT' },
    { name: 'whatsapp', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'direccion', type: 'TEXT' },
    { name: 'apodo', type: 'TEXT' },
    { name: 'precio_fijado', type: 'TEXT' },
    { name: 'limite_credito', type: 'TEXT' },
    { name: 'empresa', type: 'TEXT' },
    { name: 'cargo', type: 'TEXT' },
    { name: 'telefono_empresa', type: 'TEXT' },
    { name: 'direccion_empresa', type: 'TEXT' },
    { name: 'codigo', type: 'TEXT' },
    { name: 'rnc', type: 'TEXT' },
    { name: 'activo', type: 'TEXT' },
    { name: 'nota', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  proveedores: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'rnc', type: 'TEXT' },
    { name: 'telefono', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'encargado', type: 'TEXT' },
    { name: 'cuenta_bancaria', type: 'TEXT' },
    { name: 'direccion', type: 'TEXT' },
    { name: 'imagen', type: 'IMAGE' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  categorias: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'descripcion', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  marcas: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'descripcion', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  colores: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'codigo', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  capacidades: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  accesorios: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'codigo_barra', type: 'TEXT' },
    { name: 'costo', type: 'REAL' },
    { name: 'precio_venta', type: 'REAL' },
    { name: 'precio_min', type: 'REAL' },
    { name: 'precio_xmayor', type: 'REAL' },
    { name: 'cantidad', type: 'INTEGER' },
    { name: 'alerta', type: 'INTEGER' },
    { name: 'marca', type: 'INTEGER' },
    { name: 'categoria', type: 'INTEGER' },
    { name: 'proveedor_id', type: 'INTEGER' },
    { name: 'imagen', type: 'IMAGE' },
    { name: 'no_compra', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  telefonos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'imagen', type: 'IMAGE' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  imei: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'id_equi', type: 'INTEGER' },
    { name: 'telefono_uid', type: 'TEXT' },
    { name: 'equipo', type: 'TEXT' },
    { name: 'costo', type: 'REAL' },
    { name: 'precio_venta', type: 'REAL' },
    { name: 'precio_min', type: 'REAL' },
    { name: 'precio_xmayor', type: 'REAL' },
    { name: 'color', type: 'TEXT' },
    { name: 'capacidad', type: 'TEXT' },
    { name: 'bateria', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'fecha_venta', type: 'TEXT' },
    { name: 'comprador', type: 'TEXT' },
    { name: 'proveedor', type: 'TEXT' },
    { name: 'no_compra', type: 'TEXT' },
    { name: 'precio_vendido', type: 'REAL' },
    { name: 'hora_venta', type: 'TEXT' },
    { name: 'no_factura', type: 'TEXT' },
    { name: 'nota', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  electrodomesticos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  serial: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'id_equi', type: 'INTEGER' },
    { name: 'equipo_uid', type: 'TEXT' },
    { name: 'equipo', type: 'TEXT' },
    { name: 'costo', type: 'REAL' },
    { name: 'precio_venta', type: 'REAL' },
    { name: 'precio_min', type: 'REAL' },
    { name: 'precio_xmayor', type: 'REAL' },
    { name: 'color', type: 'TEXT' },
    { name: 'capacidad', type: 'TEXT' },
    { name: 'bateria', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'fecha_venta', type: 'TEXT' },
    { name: 'comprador', type: 'TEXT' },
    { name: 'proveedor', type: 'TEXT' },
    { name: 'no_compra', type: 'TEXT' },
    { name: 'precio_vendido', type: 'REAL' },
    { name: 'hora_venta', type: 'TEXT' },
    { name: 'no_factura', type: 'TEXT' },
    { name: 'nota', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  facturas: [
    { name: 'uid', type: 'TEXT' },
    { name: 'cheque', type: 'TEXT' },
    { name: 'token', type: 'TEXT' },
    { name: 'cajero', type: 'TEXT' },
    { name: 'no_factura', type: 'TEXT' },
    { name: 'tipo_factura', type: 'TEXT' },
    { name: 'comprobante', type: 'TEXT' },
    { name: 'cod_cliente', type: 'TEXT' },
    { name: 'nombre_cliente', type: 'TEXT' },
    { name: 'telefono_cliente', type: 'TEXT' },
    { name: 'productos', type: 'TEXT' },
    { name: 'vendedor', type: 'TEXT' },
    { name: 'metodo_pago', type: 'TEXT' },
    { name: 'tarjeta', type: 'REAL' },
    { name: 'transferencia', type: 'REAL' },
    { name: 'efectivo', type: 'REAL' },
    { name: 'canal_venta', type: 'TEXT' },
    { name: 'fecha_emision', type: 'TEXT' },
    { name: 'impuesto', type: 'REAL' },
    { name: 'descuento', type: 'REAL' },
    { name: 'subtotal', type: 'REAL' },
    { name: 'total', type: 'REAL' },
    { name: 'ganancia', type: 'REAL' },
    { name: 'financiera', type: 'TEXT' },
    { name: 'estado_factura', type: 'TEXT' },
    { name: 'fecha_estado', type: 'TEXT' },
    { name: 'mes', type: 'TEXT' },
    { name: 'year', type: 'TEXT' },
    { name: 'hora', type: 'TEXT' },
    { name: 'otro', type: 'TEXT' },
    { name: 'nota', type: 'TEXT' },
    { name: 'usuario', type: 'TEXT' },
    { name: 'identificadordb', type: 'TEXT' },
    { name: 'total_institucion', type: 'REAL' },
    { name: 'total_cliente', type: 'REAL' },
    { name: 'ncf', type: 'TEXT' },
    { name: 'tipo_comprobante', type: 'TEXT' },
    { name: 'comprobante_id', type: 'INTEGER' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  piezas: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'costo', type: 'REAL' },
    { name: 'precio_venta', type: 'REAL' },
    { name: 'cantidad', type: 'INTEGER' },
    { name: 'alerta', type: 'INTEGER' },
    { name: 'proveedor', type: 'TEXT' },
    { name: 'descripcion', type: 'TEXT' },
    { name: 'imagen', type: 'IMAGE' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  tecnicos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'telefono', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'porcentaje', type: 'REAL' },
    { name: 'estado', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  ordenes_taller: [
    { name: 'uid', type: 'TEXT' },
    { name: 'no_orden', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'cedula', type: 'TEXT' },
    { name: 'telefono', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'equipo', type: 'TEXT' },
    { name: 'imei', type: 'TEXT' },
    { name: 'serial', type: 'TEXT' },
    { name: 'marca_modelo', type: 'TEXT' },
    { name: 'clave', type: 'TEXT' },
    { name: 'accesorios', type: 'TEXT' },
    { name: 'fallas', type: 'TEXT' },
    { name: 'piezas', type: 'TEXT' },
    { name: 'tecnico', type: 'TEXT' },
    { name: 'metodo_pago', type: 'TEXT' },
    { name: 'fecha_entrada', type: 'TEXT' },
    { name: 'fecha_entrega', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'precio_pieza', type: 'REAL' },
    { name: 'mano_obra', type: 'REAL' },
    { name: 'abono', type: 'REAL' },
    { name: 'pendiente', type: 'REAL' },
    { name: 'total', type: 'REAL' },
    { name: 'pagos', type: 'TEXT' },
    { name: 'beneficio_empresa', type: 'REAL' },
    { name: 'beneficio_tecnico', type: 'REAL' },
    { name: 'porcentaje_tecnico', type: 'REAL' },
    { name: 'estado_pago_tecnico', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  correo: [
    { name: 'uid', type: 'TEXT' },
    { name: 'host', type: 'TEXT' },
    { name: 'puerto', type: 'TEXT' },
    { name: 'seguridad', type: 'TEXT' },
    { name: 'email', type: 'TEXT' },
    { name: 'password', type: 'TEXT' },
    { name: 'nombre_remitente', type: 'TEXT' },
    { name: 'activo', type: 'INTEGER' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  gastos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'cantidad', type: 'REAL' },
    { name: 'fecha', type: 'TEXT' },
    { name: 'hora', type: 'TEXT' },
    { name: 'comentario', type: 'TEXT' },
    { name: 'metodo_pago', type: 'TEXT' },
    { name: 'banco_id', type: 'INTEGER' },
    { name: 'banco_uid', type: 'TEXT' },
    { name: 'banco_nombre', type: 'TEXT' },
    { name: 'turno_id', type: 'INTEGER' },
    { name: 'almacen_id', type: 'INTEGER' },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  bancos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'numero_cuenta', type: 'TEXT' },
    { name: 'moneda', type: 'TEXT' },
    { name: 'saldo', type: 'REAL' },
    { name: 'fecha_transaccion', type: 'TEXT' },
    { name: 'almacen_id', type: 'INTEGER' },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  gastos_fijos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'monto', type: 'REAL' },
    { name: 'dia_pago', type: 'INTEGER' },
    { name: 'categoria', type: 'TEXT' },
    { name: 'periodicidad', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'descripcion', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  impresoras_config: [
    { name: 'uid', type: 'TEXT' },
    { name: 'printer_name', type: 'TEXT' },
    { name: 'printer_model', type: 'TEXT' },
    { name: 'paper_width', type: 'INTEGER' },
    { name: 'show_logo', type: 'INTEGER' },
    { name: 'show_company_name', type: 'INTEGER' },
    { name: 'show_legal', type: 'INTEGER' },
    { name: 'show_phone', type: 'INTEGER' },
    { name: 'show_address', type: 'INTEGER' },
    { name: 'show_email', type: 'INTEGER' },
    { name: 'show_cliente', type: 'INTEGER' },
    { name: 'show_items', type: 'INTEGER' },
    { name: 'show_totals', type: 'INTEGER' },
    { name: 'show_barcode', type: 'INTEGER' },
    { name: 'show_footer', type: 'INTEGER' },
    { name: 'show_qr', type: 'INTEGER' },
    { name: 'show_nota', type: 'INTEGER' },
    { name: 'footer_text', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  cuentas_cobrar: [
    { name: 'uid', type: 'TEXT' },
    { name: 'no_factura', type: 'TEXT' },
    { name: 'cod_cliente', type: 'TEXT' },
    { name: 'nombre_cliente', type: 'TEXT' },
    { name: 'telefono_cliente', type: 'TEXT' },
    { name: 'total', type: 'REAL' },
    { name: 'abonado', type: 'REAL' },
    { name: 'saldo', type: 'REAL' },
    { name: 'fecha_venta', type: 'TEXT' },
    { name: 'fecha_vencimiento', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'notas', type: 'TEXT' },
    { name: 'pagos', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  cuentas_pagar: [
    { name: 'uid', type: 'TEXT' },
    { name: 'no_factura', type: 'TEXT' },
    { name: 'cod_proveedor', type: 'TEXT' },
    { name: 'nombre_proveedor', type: 'TEXT' },
    { name: 'telefono_proveedor', type: 'TEXT' },
    { name: 'total', type: 'REAL' },
    { name: 'abonado', type: 'REAL' },
    { name: 'saldo', type: 'REAL' },
    { name: 'fecha_compra', type: 'TEXT' },
    { name: 'fecha_vencimiento', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'notas', type: 'TEXT' },
    { name: 'pagos', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  caja_turnos: [
    { name: 'uid', type: 'TEXT' },
    { name: 'monto_inicial', type: 'REAL', default: 0 },
    { name: 'entradas', type: 'REAL', default: 0 },
    { name: 'retiros', type: 'REAL', default: 0 },
    { name: 'monto_final', type: 'REAL', default: 0 },
    { name: 'efectivo_esperado', type: 'REAL', default: 0 },
    { name: 'diferencia', type: 'REAL', default: 0 },
    { name: 'cierre_ciego', type: 'INTEGER', default: 0 },
    { name: 'estado', type: 'TEXT', default: 'abierto' },
    { name: 'observacion', type: 'TEXT' },
    { name: 'usuario_id', type: 'INTEGER', default: 0 },
    { name: 'usuario_nombre', type: 'TEXT' },
    { name: 'almacen_id', type: 'INTEGER', default: 0 },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  ventas_pausadas: [
    { name: 'uid', type: 'TEXT' },
    { name: 'codigo', type: 'TEXT', required: true, indexed: true },
    { name: 'datos', type: 'TEXT', required: true },
    { name: 'cliente_nombre', type: 'TEXT' },
    { name: 'total', type: 'REAL', default: 0 },
    { name: 'items_count', type: 'INTEGER', default: 0 },
    { name: 'usuario', type: 'TEXT' },
    { name: 'estado', type: 'TEXT', default: 'PAUSADA', indexed: true },
    { name: 'almacen_id', type: 'INTEGER', default: 0 },
    { name: 'almacen_uid', type: 'TEXT', indexed: true },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  apariencia_almacen: [
    { name: 'uid', type: 'TEXT' },
    { name: 'color_primario', type: 'TEXT', default: 'blue' },
    { name: 'tono_primario', type: 'TEXT', default: '500' },
    { name: 'fondo_barra', type: 'TEXT', default: 'white' },
    { name: 'tono_barra', type: 'TEXT', default: '500' },
    { name: 'color_texto_barra', type: 'TEXT', default: 'auto' },
    { name: 'tema_visual', type: 'TEXT', default: 'standard' },
    { name: 'almacen_id', type: 'INTEGER', default: 0 },
    { name: 'almacen_uid', type: 'TEXT', required: true, indexed: true },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  metodos_pago: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT', required: true },
    { name: 'porcentaje', type: 'REAL', default: 0 },
    { name: 'estado', type: 'TEXT', default: 'ACTIVO' },
    { name: 'almacen_id', type: 'INTEGER', default: 0 },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  facturas_ecf: [
    { name: 'uid', type: 'TEXT' },
    { name: 'factura_id', type: 'INTEGER', required: true, indexed: true },
    { name: 'no_factura', type: 'TEXT' },
    { name: 'ncf', type: 'TEXT' },
    { name: 'tipo_comprobante', type: 'TEXT' },
    { name: 'alanube_id', type: 'TEXT' },
    { name: 'alanube_id_compania', type: 'TEXT' },
    { name: 'document_number', type: 'TEXT' },
    { name: 'document_stamp_url', type: 'TEXT' },
    { name: 'security_code', type: 'TEXT' },
    { name: 'status', type: 'TEXT', default: 'PENDIENTE' },
    { name: 'legal_status', type: 'TEXT' },
    { name: 'sequence_consumed', type: 'INTEGER', default: 0 },
    { name: 'pdf_url', type: 'TEXT' },
    { name: 'xml_url', type: 'TEXT' },
    { name: 'resume_xml_url', type: 'TEXT' },
    { name: 'endpoint', type: 'TEXT' },
    { name: 'http_status', type: 'INTEGER', default: 0 },
    { name: 'payload', type: 'TEXT' },
    { name: 'response', type: 'TEXT' },
    { name: 'error', type: 'TEXT' },
    { name: 'enviado_at', type: 'TEXT' },
    { name: 'aceptado_at', type: 'TEXT' },
    { name: 'almacen_id', type: 'INTEGER', default: 0 },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  transferencias: [
    { name: 'uid', type: 'TEXT' },
    { name: 'no_transferencia', type: 'TEXT' },
    { name: 'origen_id', type: 'INTEGER', default: 0 },
    { name: 'origen_uid', type: 'TEXT' },
    { name: 'origen_nombre', type: 'TEXT' },
    { name: 'destino_id', type: 'INTEGER', default: 0 },
    { name: 'destino_uid', type: 'TEXT' },
    { name: 'destino_nombre', type: 'TEXT' },
    { name: 'productos', type: 'TEXT' },
    { name: 'estado', type: 'TEXT', default: 'PENDIENTE' },
    { name: 'usuario', type: 'TEXT' },
    { name: 'almacen_id', type: 'INTEGER', default: 0 },
    { name: 'almacen_uid', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  comprobantes_fiscales: [
    { name: 'uid', type: 'TEXT' },
    { name: 'tipo', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'descripcion', type: 'TEXT' },
    { name: 'prefijo', type: 'TEXT' },
    { name: 'secuencia_actual', type: 'INTEGER' },
    { name: 'secuencia_desde', type: 'INTEGER' },
    { name: 'secuencia_hasta', type: 'INTEGER' },
    { name: 'fecha_vencimiento', type: 'TEXT' },
    { name: 'activo', type: 'INTEGER' },
    { name: 'es_default', type: 'INTEGER' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  notas: [
    { name: 'uid', type: 'TEXT' },
    { name: 'titulo', type: 'TEXT' },
    { name: 'contenido', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
  ],
  plantillas_etiquetas: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'ancho', type: 'REAL' },
    { name: 'alto', type: 'REAL' },
    { name: 'elementos', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
  bitacora: [
    { name: 'uid', type: 'TEXT' },
    { name: 'tabla', type: 'TEXT' },
    { name: 'registro_id', type: 'TEXT' },
    { name: 'accion', type: 'TEXT' },
    { name: 'usuario', type: 'TEXT' },
    { name: 'datos_nuevos', type: 'TEXT' },
    { name: 'datos_anteriores', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
  ],
  configuracion: [
    { name: 'uid', type: 'TEXT' },
    { name: 'clave', type: 'TEXT' },
    { name: 'valor', type: 'TEXT' },
    { name: 'tipo', type: 'TEXT' },
    { name: 'categoria', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
  ],
}

async function createTables() {
  if (!form.url || !form.serviceKey) {
    estado.value = { connected: false, error: 'Configura la URL y Secret Key primero' }
    return
  }
  creandoTablas.value = true
  const base = form.url.replace(/\/+$/, '')
  const key = form.serviceKey

  try {
    // Fetch current cloud schema to know which tables/columns exist
    let cloudSchema: Record<string, string[]> = {}
    const schemaRes = await fetch(`${base}/schema`, { headers: { Authorization: `Bearer ${key}` } })
    if (schemaRes.ok) {
      const json = await schemaRes.json()
      const data = json.data || {}
      for (const [name, info] of Object.entries(data)) {
        cloudSchema[name] = ((info as any).columns || []).map((c: any) => c.name)
      }
    }
    console.log('[TMCloud] Schema del cloud:', cloudSchema)

    const batch: any[] = []

    for (const [name, columns] of Object.entries(TABLE_SCHEMAS)) {
      const finalColumns = columns.some(c => c.name === 'almacen_uid')
        ? columns
        : [...columns, { name: 'almacen_uid', type: 'TEXT' }]

      if (!cloudSchema[name]) {
        console.log(`[TMCloud] Tabla nueva: "${name}"`)
        batch.push({ name, columns: finalColumns })
      } else {
        const cloudCols = new Set(cloudSchema[name])
        const missing = finalColumns.filter(c => !cloudCols.has(c.name))
        if (missing.length > 0) {
          console.log(`[TMCloud] Columnas faltantes en "${name}":`, missing.map(c => c.name))
          batch.push({ name, columns: finalColumns })
        }
      }
    }

    const errores: string[] = []
    let creadas = 0
    let columnasAgregadas = 0

    if (batch.length > 0) {
      const body = JSON.stringify({ tables: batch })
      console.log('[TMCloud] Enviando POST batch:', body)
      const res = await fetch(`${base}/schema/tables/batch`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
        body,
      })
      const responseText = await res.text()
      console.log('[TMCloud] Respuesta batch recibida', { bytes: responseText.length })
      if (res.ok) {
        const json = JSON.parse(responseText)
        creadas = json.data?.created || 0
        columnasAgregadas = json.data?.columns_created || 0
      } else {
        try { const err = JSON.parse(responseText); errores.push(err.error || 'Error en la operacion') }
        catch { errores.push(responseText || 'Error en la operacion') }
      }
    }

    const partes: string[] = []
    if (creadas > 0) partes.push(`${creadas} tablas creadas`)
    if (columnasAgregadas > 0) partes.push(`${columnasAgregadas} columnas agregadas`)
    if (errores.length > 0) partes.push(`Errores: ${errores.join(', ')}`)
    if (partes.length === 0) partes.push('Sin cambios necesarios')

    if (creadas > 0 || columnasAgregadas > 0) tmSync.invalidateSchemaCache()
    estado.value = { connected: true, error: partes.join('. ') }
  } catch (e: any) {
    estado.value = { connected: false, error: e.message || 'Error de red' }
  } finally {
    creandoTablas.value = false
  }
}

async function createLocalTablesFromServer() {
  if (!form.url || !form.key) {
    estado.value = { connected: false, error: 'Configura la URL y la Public Key primero' }
    return
  }
  creandoTablasLocales.value = true
  try {
    tmc.init({ url: form.url.trim(), key: form.key.trim(), serviceKey: form.serviceKey.trim() })
    const schema = await tmSync.fetchServerSchema()
    if (!schema || !schema.length) {
      estado.value = { connected: false, error: 'No se pudo obtener el esquema del servidor' }
      return
    }
    let creadas = 0
    for (const table of schema) {
      if (['sync_deletes', 'sync_queue', 'configuracion'].includes(table.name)) continue
      const cols = table.columns || []
      const hasUid = cols.some((c: any) => c.name === 'uid')
      const hasCreatedAt = cols.some((c: any) => c.name === 'created_at')
      const hasUpdatedAt = cols.some((c: any) => c.name === 'updated_at')
      const extraCols = []
      if (!hasUid) extraCols.push('"uid" TEXT DEFAULT \'\'')
      if (!hasCreatedAt) extraCols.push('"created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      if (!hasUpdatedAt) extraCols.push('"updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP')
      if (!cols.some((c: any) => c.name === 'almacen_id')) extraCols.push('"almacen_id" INTEGER DEFAULT 0')
      if (!cols.some((c: any) => c.name === 'almacen_uid')) extraCols.push('"almacen_uid" TEXT DEFAULT \'\'')
      const columnDefs = cols.map((c: any) => {
        let type = 'TEXT DEFAULT \'\''
        if (c.type?.toLowerCase().includes('int')) type = 'INTEGER DEFAULT 0'
        else if (c.type?.toLowerCase().includes('real') || c.type?.toLowerCase().includes('float') || c.type?.toLowerCase().includes('double') || c.type?.toLowerCase().includes('decimal')) type = 'REAL DEFAULT 0'
        else if (c.type?.toLowerCase().includes('timestamp') || c.type?.toLowerCase().includes('datetime')) type = 'TEXT DEFAULT \'\''
        return `"${c.name}" ${type}`
      })
      const allCols = [...columnDefs, ...extraCols]
      const sql = `CREATE TABLE IF NOT EXISTS "${table.name}" (id INTEGER PRIMARY KEY AUTOINCREMENT, ${allCols.join(', ')})`
      try {
        await (window as any).electron.invoke('db:exec', sql)
        creadas++
      } catch (e) {
        console.error(`Error creating ${table.name}:`, e)
      }
    }
    estado.value = { connected: true, error: `${creadas} tablas creadas/actualizadas` }
  } catch (e: any) {
    estado.value = { connected: false, error: e.message || 'Error de red' }
  } finally {
    creandoTablasLocales.value = false
  }
}
</script>
