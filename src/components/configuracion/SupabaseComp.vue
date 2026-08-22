<template>
  <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5">
    <h2 class="text-lg font-semibold mb-1">Supabase</h2>
    <p class="text-sm text-surface-500 mb-4">
      Configuracion de Supabase para autenticacion y sincronizacion en la nube
    </p>

    <div class="space-y-3 mb-4">
      <div>
        <label class="text-xs text-surface-400 mb-1 block">URL del proyecto</label>
        <div class="flex gap-2">
          <InputText v-model="form.url" placeholder="https://xxxxx.supabase.co" fluid class="flex-1" />
          <Button icon="pi pi-qrcode" severity="secondary" outlined @click="abrirScanner('url')" v-tooltip.left="'Escanear QR'" />
        </div>
      </div>
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Anon / Public Key</label>
        <div class="flex gap-2">
          <Password v-model="form.anonKey" placeholder="eyJhbGciOiJIUzI1NiIs..." :feedback="false" toggleMask fluid class="flex-1" />
          <Button icon="pi pi-qrcode" severity="secondary" outlined @click="abrirScanner('anonKey')" v-tooltip.left="'Escanear QR'" />
        </div>
      </div>
      <div>
        <label class="text-xs text-surface-400 mb-1 block">Service Role Key <span class="text-red-400">(requerido para escribir)</span></label>
        <div class="flex gap-2">
          <Password v-model="form.serviceRole" placeholder="eyJhbGciOiJIUzI1NiIs..." :feedback="false" toggleMask fluid class="flex-1" />
          <Button icon="pi pi-qrcode" severity="secondary" outlined @click="abrirScanner('serviceRole')" v-tooltip.left="'Escanear QR'" />
        </div>
      </div>
    </div>

    <div class="flex flex-wrap gap-2 mb-3">
      <Button label="Guardar" icon="pi pi-check" :loading="guardando" @click="guardar" />
      <Button label="Probar conexion" icon="pi pi-plug" severity="secondary" :loading="testLoading" @click="probarConexion" />
    </div>

    <!-- Modo de sincronizacion -->
    <div class="mb-3 p-3 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-800">
      <div class="flex items-center justify-between mb-2">
        <label class="text-xs text-surface-400">Modo de sincronizacion</label>
        <span class="text-xs font-mono px-2 py-0.5 rounded bg-surface-200 dark:bg-surface-600">
          {{ syncMode }} / DB: {{ dbMode }}
        </span>
      </div>
      <div class="grid grid-cols-3 gap-1 mb-3">
        <Button
          label="Offline"
          icon="pi pi-ban"
          :severity="syncMode === 'offline' ? 'danger' : 'secondary'"
          :outlined="syncMode !== 'offline'"
          size="small"
          @click="cambiarModo('offline')"
        />
        <Button
          label="Online"
          icon="pi pi-arrow-up"
          :severity="syncMode === 'online' ? 'info' : 'secondary'"
          :outlined="syncMode !== 'online'"
          size="small"
          @click="cambiarModo('online')"
        />
        <Button
          label="Ambos"
          icon="pi pi-arrows-alt"
          :severity="syncMode === 'ambos' ? 'success' : 'secondary'"
          :outlined="syncMode !== 'ambos'"
          size="small"
          @click="cambiarModo('ambos')"
        />
      </div>
      <div class="flex items-center gap-2">
        <label class="text-xs text-surface-400">Intervalo:</label>
        <Select v-model="syncInterval" :options="intervalOptions" optionLabel="label" optionValue="value" class="w-40" size="small" @change="cambiarIntervalo" />
        <span class="text-xs text-surface-400">({{ autoSync ? 'Activo' : 'Inactivo' }})</span>
      </div>
    </div>

    <p v-if="msg" class="text-xs mt-2 flex items-center gap-1" :class="msgError ? 'text-red-600' : 'text-green-600'">
      <i :class="msgError ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'"></i> {{ msg }}
    </p>

    <hr class="my-4 border-surface-200 dark:border-surface-700" />

    <!-- Migracion SQL -->
    <div class="mb-4">
      <h3 class="text-sm font-semibold mb-2">Migracion a Supabase</h3>
      <p class="text-xs text-surface-400 mb-3">Genera el script SQL para crear las tablas de la base local en Supabase.</p>
      <div class="flex flex-wrap gap-2">
        <Button label="Ver SQL de migracion" icon="pi pi-code" severity="secondary" @click="sqlDialogVisible = true" />
        <Button v-if="conectado" label="Crear/verificar tablas en Supabase" icon="pi pi-database" :loading="creandoTablas" style="background-color:#059669; color:white" @click="crearTablasEnSupabase" />
      </div>
    </div>

    <hr class="my-4 border-surface-200 dark:border-surface-700" />

    <!-- Exportar datos como SQL -->
    <div class="mb-4">
      <h3 class="text-sm font-semibold mb-2">Exportar datos como SQL</h3>
      <p class="text-xs text-surface-400 mb-3">Genera sentencias INSERT para pegar en el SQL Editor de Supabase.</p>
      <div class="flex flex-wrap gap-2">
        <Select v-model="tablaExportar" :options="tablasDisponibles" placeholder="Seleccionar tabla..." class="w-56" />
        <Button label="Generar SQL datos" icon="pi pi-file" severity="secondary" :loading="generandoSQL" :disabled="!tablaExportar" @click="generarSQLDatos" />
      </div>
    </div>

    <!-- SQL eliminar tablas (siempre visible) -->
    <div class="mb-3">
      <Button label="SQL para eliminar tablas" icon="pi pi-trash" severity="danger" class="w-full" @click="dropSqlVisible = true" />
    </div>

    <!-- Estado conectado -->
    <div v-if="conectado" class="mt-2">
      <div class="flex items-center gap-2 mb-3">
        <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400">
          <i class="pi pi-check-circle"></i> Conectado
        </span>
        <span class="text-xs text-surface-400">{{ sessionUser?.email || 'Sesion activa' }}</span>
        <span class="ml-auto inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
          :class="onlineStatus ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400' : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'">
          <i :class="onlineStatus ? 'pi pi-wifi' : 'pi pi-wifi-off'"></i>
          {{ onlineStatus ? 'En linea' : 'Offline' }}
        </span>
      </div>

      <div class="space-y-2">
        <div class="flex items-center gap-2">
          <Button label="Subir todo" icon="pi pi-arrow-up" :loading="syncing" severity="info" @click="subirTodo" />
          <Button label="Sincronizar ahora" icon="pi pi-cloud-download" :loading="syncing" class="flex-1" @click="syncNow" />
          <Button
            :label="autoSync ? 'Auto ON' : 'Auto OFF'"
            :icon="autoSync ? 'pi pi-pause' : 'pi pi-play'"
            :severity="autoSync ? 'success' : 'secondary'"
            @click="toggleAutoSync"
          />
        </div>
        <Button label="Cerrar sesion" icon="pi pi-sign-out" severity="secondary" class="w-full" @click="cerrarSesion" />
      </div>

      <div v-if="syncStatus.running" class="mt-2 flex items-center gap-2 text-xs text-primary">
        <i class="pi pi-spin pi-spinner"></i>
        <span>{{ syncStatus.progreso || 'Sincronizando...' }}</span>
      </div>

      <p v-if="syncMsg && !syncStatus.running" class="text-xs mt-2 flex items-center gap-1" :class="syncMsgError ? 'text-red-600' : 'text-green-600'">
        <i :class="syncMsgError ? 'pi pi-exclamation-circle' : 'pi pi-check-circle'"></i> {{ syncMsg }}
      </p>

      <div v-if="syncResult && !syncStatus.running" class="mt-2 grid grid-cols-3 gap-2 text-center text-xs">
        <div class="rounded-lg bg-green-50 dark:bg-green-900/20 p-2 text-green-700 dark:text-green-400">
          <p class="font-bold">{{ syncResult.inserts }}</p>
          <p>Insertados</p>
        </div>
        <div class="rounded-lg bg-blue-50 dark:bg-blue-900/20 p-2 text-blue-700 dark:text-blue-400">
          <p class="font-bold">{{ syncResult.updates }}</p>
          <p>Actualizados</p>
        </div>
        <div class="rounded-lg" :class="syncResult.errors ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-400' : 'bg-surface-100 dark:bg-surface-700 text-surface-500'">
          <p class="font-bold">{{ syncResult.errors }}</p>
          <p>Errores</p>
        </div>
      </div>
    </div>

    <!-- Dialog SQL Migracion -->
    <Dialog v-model:visible="sqlDialogVisible" header="SQL de migracion - Supabase" :modal="true" class="w-full max-w-3xl" @show="cargarSQLMigracion">
      <p class="text-xs text-surface-400 mb-3">Ejecuta este script en el SQL Editor de Supabase (Dashboard &gt; SQL Editor) para crear todas las tablas con el esquema exacto de la base local.</p>
      <div v-if="cargandoSQL" class="text-center py-8 text-surface-500">
        <i class="pi pi-spin pi-spinner mr-2"></i> Generando esquema desde SQLite...
      </div>
      <textarea v-else readonly :value="sqlMigracion" rows="25"
        class="w-full font-mono text-xs p-3 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 text-surface-800 dark:text-surface-200 resize-none focus:outline-none"></textarea>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Abrir SQL Editor" icon="pi pi-external-link" @click="abrirSQLEditor" />
          <Button label="Copiar SQL" icon="pi pi-copy" @click="copiarSQL" />
          <Button label="Cerrar" severity="secondary" text @click="sqlDialogVisible = false" />
        </div>
      </template>
    </Dialog>

    <!-- Dialog Drop SQL -->
    <Dialog v-model:visible="dropSqlVisible" header="Eliminar todas las tablas" :modal="true" class="w-full max-w-3xl">
      <div class="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 text-xs text-red-600 dark:text-red-400 mb-3 flex items-start gap-2">
        <i class="pi pi-exclamation-triangle mt-0.5"></i>
        <span>Esto eliminara TODAS las tablas y sus datos en Supabase. Esta accion no se puede deshacer.</span>
      </div>
      <textarea readonly :value="sqlDrop" rows="15"
        class="w-full font-mono text-xs p-3 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 text-surface-800 dark:text-surface-200 resize-none focus:outline-none"></textarea>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Copiar SQL" icon="pi pi-copy" @click="copiarDropSQL" />
          <Button label="Cerrar" severity="secondary" text @click="dropSqlVisible = false" />
        </div>
      </template>
    </Dialog>

    <!-- Dialog Datos SQL -->
    <Dialog v-model:visible="datosSqlVisible" header="INSERT SQL - datos" :modal="true" class="w-full max-w-3xl">
      <p class="text-xs text-surface-400 mb-3">Ejecuta estas sentencias en el SQL Editor de Supabase para insertar los datos locales en la nube.</p>
      <textarea readonly :value="datosSQL" rows="20"
        class="w-full font-mono text-xs p-3 rounded-lg border border-surface-200 dark:border-surface-600 bg-surface-50 dark:bg-surface-900 text-surface-800 dark:text-surface-200 resize-none focus:outline-none"></textarea>
      <p v-if="datosSQLCount" class="text-xs text-surface-400 mt-1">{{ datosSQLCount }} registro(s)</p>
      <template #footer>
        <div class="flex justify-end gap-2">
          <Button label="Copiar SQL" icon="pi pi-copy" @click="copiarDatosSQL" />
          <Button label="Cerrar" severity="secondary" text @click="datosSqlVisible = false" />
        </div>
      </template>
    </Dialog>
    <!-- Dialog Escaner QR -->
    <Dialog v-model:visible="scannerVisible" header="Escanear codigo QR" :modal="true" :closable="true" @hide="detenerScanner" class="w-full max-w-sm">
      <div class="flex flex-col items-center gap-3">
        <p class="text-xs text-surface-400 text-center">
          {{ scannerCampo === 'todo' ? 'Escanea un QR con la configuracion completa (JSON) o un valor individual' : `Enfoca el QR para el campo: ${scannerCampo}` }}
        </p>
        <div ref="scannerContainer" class="w-full aspect-square max-w-xs rounded-lg overflow-hidden bg-surface-900 flex items-center justify-center">
          <div v-if="!scannerActivo" class="text-surface-400 text-sm flex flex-col items-center gap-2 p-4">
            <i class="pi pi-camera text-3xl"></i>
            <span>Iniciando camara...</span>
          </div>
        </div>
        <Button v-if="scannerActivo" label="Cancelar" icon="pi pi-times" severity="secondary" @click="detenerScanner" class="w-full" />
      </div>
    </Dialog>

  </div>
</template>

<script setup lang="ts">
import { ref, reactive, onMounted, onUnmounted, computed, nextTick } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Select from 'primevue/select'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import * as sb from '@/services/supabaseClient'
import * as syncService from '@/services/syncService'
import type { SyncMode } from '@/services/syncService'
import { getCreateTableSQL } from '@/services/syncService'
import { reproducirNotificacion } from '@/capacitor/notificacion'

const toast = useToast()
const emit = defineEmits(['config-changed'])

const form = reactive({ url: '', anonKey: '', serviceRole: '' })
const guardando = ref(false)
const msg = ref('')
const msgError = ref(false)
const testLoading = ref(false)
const initLoading = ref(false)
const conectado = ref(false)
const sessionUser = ref<any>(null)
const sqlDialogVisible = ref(false)
const dropSqlVisible = ref(false)
const datosSqlVisible = ref(false)
const datosSQL = ref('')
const datosSQLCount = ref(0)
const tablaExportar = ref('')
const generandoSQL = ref(false)
const creandoTablas = ref(false)
const syncing = ref(false)
const autoSync = ref(false)
const syncMsg = ref('')
const syncMsgError = ref(false)
const syncStatus = ref<syncService.SyncStatus>({ running: false })
const syncResult = ref<syncService.SyncResult | null>(null)
const syncMode = ref<SyncMode>('ambos')
const dbMode = ref('?')
const onlineStatus = ref(navigator.onLine)
const syncInterval = ref(30)
const intervalOptions = [
  { label: '10 segundos', value: 10 },
  { label: '30 segundos', value: 30 },
  { label: '1 minuto', value: 60 },
  { label: '2 minutos', value: 120 },
  { label: '5 minutos', value: 300 },
  { label: '10 minutos', value: 600 },
  { label: '30 minutos', value: 1800 },
  { label: '1 hora', value: 3600 },
  { label: '3 horas', value: 10800 },
  { label: 'Una vez al dia', value: 86400 },
]

// ===== QR Scanner =====
const scannerVisible = ref(false)
const scannerActivo = ref(false)
const scannerCampo = ref<string>('url')
const scannerContainer = ref<HTMLElement | null>(null)
let html5QrCode: any = null

async function abrirScanner(campo: string) {
  scannerCampo.value = campo
  scannerVisible.value = true
  await nextTick()
  await iniciarScanner()
}

async function pedirPermisoCamara(): Promise<boolean> {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
    stream.getTracks().forEach(t => t.stop())
    return true
  } catch {
    return false
  }
}

async function iniciarScanner() {
  if (!scannerContainer.value) return
  scannerActivo.value = false

  const permitido = await pedirPermisoCamara()
  if (!permitido) {
    toast.add({
      severity: 'error',
      summary: 'Permiso requerido',
      detail: 'Para escanear QR, otorga permiso de camara en Configuracion > Aplicaciones > MR Cutti Technology > Permisos',
      life: 6000,
    })
    scannerVisible.value = false
    return
  }

  try {
    const { Html5Qrcode } = await import('html5-qrcode')
    const id = 'qr-scanner-' + Date.now()
    scannerContainer.value.id = id
    html5QrCode = new Html5Qrcode(id)
    await html5QrCode.start(
      { facingMode: 'environment' },
      { fps: 10, qrbox: { width: 250, height: 250 } },
      onScanSuccess,
      () => {}
    )
    scannerActivo.value = true
  } catch (e: any) {
    console.error('[QR] Error iniciando camara:', e)
    toast.add({ severity: 'error', summary: 'Camara', detail: 'Error al iniciar: ' + (e.message || ''), life: 4000 })
    scannerVisible.value = false
  }
}

function onScanSuccess(decodedText: string) {
  const texto = decodedText.trim()
  if (scannerCampo.value === 'todo') {
    try {
      const json = JSON.parse(texto)
      if (json.url) form.url = json.url
      if (json.anonKey) form.anonKey = json.anonKey
      if (json.serviceRole) form.serviceRole = json.serviceRole
      toast.add({ severity: 'success', summary: 'QR escaneado', detail: 'Configuracion cargada desde JSON', life: 3000 })
    } catch {
      if (texto.startsWith('http://') || texto.startsWith('https://')) {
        form.url = texto
      } else if (texto.startsWith('eyJ')) {
        if (!form.anonKey) form.anonKey = texto
        else form.serviceRole = texto
      }
      toast.add({ severity: 'success', summary: 'QR escaneado', detail: 'Valor cargado', life: 2000 })
    }
  } else {
    if (scannerCampo.value === 'url') {
      form.url = texto
    } else if (scannerCampo.value === 'anonKey') {
      form.anonKey = texto
    } else if (scannerCampo.value === 'serviceRole') {
      form.serviceRole = texto
    }
    toast.add({ severity: 'success', summary: 'QR escaneado', detail: `Campo ${scannerCampo.value} actualizado`, life: 2000 })
  }
  detenerScanner()
}

function detenerScanner() {
  if (html5QrCode) {
    try {
      html5QrCode.stop().catch(() => {})
    } catch {}
    html5QrCode = null
  }
  scannerActivo.value = false
  scannerVisible.value = false
}

const tablasEsperadas = [
  'usuarios', 'empresa', 'clientes', 'proveedores', 'categorias', 'marcas',
  'accesorios', 'telefonos', 'imei', 'electrodomesticos', 'serial',
  'facturas', 'piezas', 'tecnicos', 'ordenes_taller', 'correo', 'bancos',
  'gastos', 'gastos_fijos', 'impresoras_config', 'cuentas_cobrar',
  'cuentas_pagar', 'comprobantes_fiscales', 'bitacora', 'notas',
  'licencia', 'plantillas_etiquetas', 'configuracion',
]

const sqlMigracion = ref('')
const cargandoSQL = ref(false)

async function cargarSQLMigracion() {
  if (sqlMigracion.value) return
  cargandoSQL.value = true
  try {
    const lines: string[] = []
    lines.push('-- ============================================')
    lines.push('-- Migracion: Esquema generado desde SQLite local')
    lines.push('-- Ejecutar en Supabase SQL Editor')
    lines.push('-- ============================================')
    lines.push('')
    for (const tabla of tablasEsperadas) {
      const sql = await getCreateTableSQL(tabla)
      if (sql) lines.push(sql + '\n')
    }
    sqlMigracion.value = lines.join('\n')
  } catch (e) {
    sqlMigracion.value = '-- Error al generar SQL: ' + e
  } finally {
    cargandoSQL.value = false
  }
}

const sqlDrop = computed(() => {
  return `-- ============================================\n-- ELIMINAR TODAS LAS TABLAS (con CASCADE)\n-- ============================================\n\nDROP TABLE IF EXISTS ${tablasEsperadas.join(', ')} CASCADE;`
})

const tablasDisponibles = [...tablasEsperadas].sort()

function syncToastSummary(mode: SyncMode) {
  if (mode === 'online') return 'Subida a la nube finalizada'
  if (mode === 'ambos') return 'Sincronizacion bidireccional finalizada'
  return 'Sincronizacion finalizada'
}

function mostrarToastSync(result: syncService.SyncResult, mode: SyncMode) {
  const cambios = result.inserts + result.updates
  if (!result.success || cambios === 0) return

  reproducirNotificacion()

  toast.add({
    severity: 'success',
    summary: syncToastSummary(mode),
    detail: result.message,
    life: 4000,
  })
}

async function cargarConfig() {
  const cfg = await sb.loadConfig()
  form.url = cfg.url
  form.anonKey = cfg.anonKey
  form.serviceRole = cfg.serviceRole
  try {
    const modeRes = await (window as any).db.getAll('configuracion')
    if (modeRes.success && modeRes.data) {
      const row = modeRes.data.find((r: any) => r.clave === 'supabase_sync_mode')
      dbMode.value = row?.valor || '(sin registro)'
      if (row && ['offline', 'online', 'ambos'].includes(row.valor)) {
        syncMode.value = row.valor
        syncService.setSyncMode(row.valor)
        console.log('[Modo] Cargado:', row.valor)
      } else {
        console.log('[Modo] No encontrado en DB, dbMode:', dbMode.value)
      }
      const intervalRow = modeRes.data.find((r: any) => r.clave === 'supabase_interval')
      if (intervalRow) {
        const val = parseInt(intervalRow.valor, 10)
        if (val > 0 && intervalOptions.some(o => o.value === val)) syncInterval.value = val
      }
    } else {
      dbMode.value = `error: ${modeRes.error}`
      console.log('[Modo] Error leyendo configuracion:', modeRes.error)
    }
  } catch (e) {
    console.error('[Modo] Error:', e)
  }
}

async function cambiarIntervalo() {
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const row = res.data.find((r: any) => r.clave === 'supabase_interval')
      if (row) await (window as any).db.update('configuracion', row.id, { valor: String(syncInterval.value) })
      else await (window as any).db.insert('configuracion', { clave: 'supabase_interval', valor: String(syncInterval.value) })
    }
  } catch {}
  if (autoSync.value) {
    syncService.startAutoSync(syncInterval.value * 1000)
    toast.add({ severity: 'info', summary: 'Intervalo actualizado', detail: `Cada ${syncInterval.value} segundos`, life: 2000 })
  }
}

async function cambiarModo(modo: SyncMode) {
  syncMode.value = modo
  syncService.setSyncMode(modo)
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const row = res.data.find((r: any) => r.clave === 'supabase_sync_mode')
      if (row) {
        await (window as any).db.update('configuracion', row.id, { valor: modo })
        console.log('[Modo] Actualizado en DB:', modo, 'id:', row.id)
      } else {
        const insertRes = await (window as any).db.insert('configuracion', { clave: 'supabase_sync_mode', valor: modo })
        console.log('[Modo] Insertado en DB:', modo, 'result:', insertRes)
      }
      dbMode.value = modo
    } else {
      console.log('[Modo] Error leyendo config:', res)
    }
  } catch (e) { console.error('[Modo] Error guardando:', e) }
  if (modo === 'offline') {
    syncService.stopAutoSync()
    autoSync.value = false
  } else if (autoSync.value) {
    syncService.startAutoSync(30000)
  }
  toast.add({ severity: 'info', summary: `Modo: ${modo}`, detail: modo === 'offline' ? 'Sin sincronizacion' : modo === 'online' ? 'Solo subir datos' : 'Sincronizacion bidireccional', life: 2000 })
}

async function guardar() {
  guardando.value = true
  msg.value = ''
  msgError.value = false
  try {
    await sb.saveConfig(form.url.trim(), form.anonKey.trim(), form.serviceRole.trim())
    const modeRes = await (window as any).db.getAll('configuracion')
    if (modeRes.success && modeRes.data) {
      const modeRow = modeRes.data.find((r: any) => r.clave === 'supabase_sync_mode')
      if (modeRow) await (window as any).db.update('configuracion', modeRow.id, { valor: syncMode.value })
      else await (window as any).db.insert('configuracion', { clave: 'supabase_sync_mode', valor: syncMode.value })
    }
    if (form.url && form.anonKey) {
      sb.init({ url: form.url.trim(), anonKey: form.anonKey.trim(), serviceRole: form.serviceRole.trim() || undefined })
      conectado.value = sb.isConnected()
    }
    msg.value = 'Configuracion guardada'
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuracion de Supabase actualizada', life: 2500 })
    emit('config-changed')
    await verificarSesion()
  } catch (e: any) {
    msg.value = 'Error al guardar: ' + e.message
    msgError.value = true
  } finally {
    guardando.value = false
  }
}

async function probarConexion() {
  if (!form.url || !form.anonKey) {
    msg.value = 'Completa URL y Anon Key primero'
    msgError.value = true
    return
  }
  testLoading.value = true
  msg.value = ''
  msgError.value = false
  try {
    await sb.testConnection(form.url.trim(), form.anonKey.trim())
    msg.value = 'Conexion exitosa con Supabase'
    msgError.value = false
    toast.add({ severity: 'success', summary: 'Conexion exitosa', detail: 'Supabase responde correctamente', life: 3000 })
    conectado.value = true
  } catch (e: any) {
    msg.value = 'Error de conexion: ' + (e.message || 'desconocido')
    msgError.value = true
  } finally {
    testLoading.value = false
  }
}

async function inicializar() {
  initLoading.value = true
  msg.value = ''
  msgError.value = false
  try {
    sb.init({ url: form.url.trim(), anonKey: form.anonKey.trim(), serviceRole: form.serviceRole.trim() || undefined })
    conectado.value = sb.isConnected()
    if (conectado.value) {
      msg.value = 'Supabase inicializado correctamente'
      toast.add({ severity: 'success', summary: 'Inicializado', detail: 'Cliente Supabase listo', life: 2500 })
      await verificarSesion()
    } else {
      msg.value = 'No se pudo inicializar. Verifica las credenciales.'
      msgError.value = true
    }
  } catch (e: any) {
    msg.value = 'Error: ' + e.message
    msgError.value = true
  } finally {
    initLoading.value = false
  }
}

async function verificarSesion() {
  const session = await sb.getSession()
  sessionUser.value = session?.user || null
}

async function crearTablasEnSupabase() {
  creandoTablas.value = true
  syncMsg.value = ''
  syncMsgError.value = false
  try {
    const client = sb.getClient()
    if (!client) throw new Error('Supabase no esta conectado')

    syncMsg.value = 'Verificando tablas en Supabase...'
    let existentes = 0
    let faltantes = 0

    for (const tabla of tablasEsperadas) {
      syncMsg.value = `Verificando tabla: ${tabla}...`
      const existe = await sb.verifyTable(tabla)
      if (existe) existentes++
      else faltantes++
    }

    if (faltantes > 0) {
      syncMsg.value = `Tablas existentes: ${existentes}. Faltantes: ${faltantes}. Abre el SQL de migracion y ejecutalo en Supabase.`
      syncMsgError.value = true
      sqlDialogVisible.value = true
    } else {
      syncMsg.value = `Todas las tablas (${existentes}) ya existen en Supabase.`
    }
  } catch (e: any) {
    syncMsg.value = 'Error: ' + (e.message || 'desconocido')
    syncMsgError.value = true
  } finally {
    creandoTablas.value = false
  }
}

async function subirTodo() {
  console.log('[SubirTodo] Iniciando...')
  console.log('[SubirTodo] Modo sync:', syncMode.value)
  console.log('[SubirTodo] Config:', { url: form.url, anonKey: form.anonKey ? '***' : '', serviceRole: form.serviceRole ? '***' : '' })
  const api = syncService.getCloudApiInfo()
  console.log('[SubirTodo] Cloud API:', api)

  syncing.value = true
  syncMsg.value = ''
  syncMsgError.value = false
  syncResult.value = null
  try {
    const result = await syncService.syncAll('online')
    syncResult.value = result
    syncMsg.value = result.message
    console.log('[SubirTodo] Resultado:', result)
    mostrarToastSync(result, 'online')
  } catch (e: any) {
    console.error('[SubirTodo] Error:', e)
    syncMsg.value = 'Error: ' + (e.message || 'desconocido')
    syncMsgError.value = true
  } finally {
    syncing.value = false
  }
}

async function syncNow() {
  syncing.value = true
  syncMsg.value = ''
  syncMsgError.value = false
  syncResult.value = null
  try {
    const result = await syncService.syncAll()
    syncResult.value = result
    syncMsg.value = result.message
    if (result.success) {
      mostrarToastSync(result, syncMode.value)
    } else {
      syncMsgError.value = true
      mostrarToastSync(result, syncMode.value)
    }
  } catch (e: any) {
    syncMsg.value = 'Error de sincronizacion: ' + (e.message || 'desconocido')
    syncMsgError.value = true
  } finally {
    syncing.value = false
  }
}

function toggleAutoSync() {
  autoSync.value = !autoSync.value
  if (autoSync.value) {
    syncService.startAutoSync(syncInterval.value * 1000)
    toast.add({ severity: 'info', summary: 'Auto-sync activado', detail: `Cada ${syncInterval.value} segundos`, life: 3000 })
  } else {
    syncService.stopAutoSync()
    toast.add({ severity: 'info', summary: 'Auto-sync desactivado', detail: '', life: 2000 })
  }
}

async function cerrarSesion() {
  await sb.signOut()
  sessionUser.value = null
  conectado.value = false
  emit('config-changed')
  msg.value = 'Sesion cerrada'
}

function escapeSQL(val: any): string {
  if (val === null || val === undefined) return 'NULL'
  if (typeof val === 'number') return String(val)
  return `'${String(val).replace(/'/g, "''")}'`
}

async function generarSQLDatos() {
  if (!tablaExportar.value) return
  generandoSQL.value = true
  datosSQL.value = ''
  datosSQLCount.value = 0
  try {
    const res = await (window as any).db.getAll(tablaExportar.value)
    if (!res.success || !res.data || res.data.length === 0) {
      datosSQL.value = `-- No hay datos en "${tablaExportar.value}"`
      datosSqlVisible.value = true
      generandoSQL.value = false
      return
    }
    const datos = res.data
    const columnas = Object.keys(datos[0])
    const lines: string[] = []
    lines.push(`-- Datos de "${tablaExportar.value}" - ${datos.length} registro(s)`)
    lines.push(`INSERT INTO "${tablaExportar.value}" (${columnas.map(c => `"${c}"`).join(', ')}) VALUES`)
    const valores = datos.map((row: any) => {
      return `  (${columnas.map(c => escapeSQL(row[c])).join(', ')})`
    })
    lines.push(valores.join(',\n') + ';')
    datosSQL.value = lines.join('\n')
    datosSQLCount.value = datos.length
    datosSqlVisible.value = true
  } catch (e: any) {
    datosSQL.value = `-- Error: ${e.message}`
    datosSqlVisible.value = true
  } finally {
    generandoSQL.value = false
  }
}

async function copiarAlPortapapeles(texto: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(texto)
    return
  } catch (_) {
    const area = document.createElement('textarea')
    area.value = texto
    area.style.position = 'fixed'
    area.style.opacity = '0'
    document.body.appendChild(area)
    area.select()
    const copiado = document.execCommand('copy')
    area.remove()
    if (!copiado) throw new Error('El portapapeles no esta disponible')
  }
}

async function copiarSQL() {
  try {
    await copiarAlPortapapeles(sqlMigracion.value)
    msg.value = 'SQL copiado al portapapeles'
    msgError.value = false
  } catch {
    msg.value = 'No se pudo copiar. Selecciona el texto manualmente.'
    msgError.value = true
  }
}

async function copiarDropSQL() {
  try {
    await copiarAlPortapapeles(sqlDrop.value)
    msg.value = 'SQL de eliminacion copiado'
    msgError.value = false
  } catch {
    msg.value = 'No se pudo copiar. Selecciona el texto manualmente.'
    msgError.value = true
  }
}

async function copiarDatosSQL() {
  try {
    await copiarAlPortapapeles(datosSQL.value)
    msg.value = 'SQL de datos copiado al portapapeles'
    msgError.value = false
  } catch {
    msg.value = 'No se pudo copiar. Selecciona el texto manualmente.'
    msgError.value = true
  }
}

function abrirSQLEditor() {
  const url = form.url.replace(/\/+$/, '')
  const projectRef = url.replace('https://', '').replace('.supabase.co', '')
  if (projectRef) {
    window.open(`https://supabase.com/dashboard/project/${projectRef}/sql/new`, '_blank')
  } else {
    window.open('https://supabase.com/dashboard', '_blank')
  }
}

let authSub: any = null
let onlineHandler: (() => void) | null = null
let offlineHandler: (() => void) | null = null

onMounted(async () => {
  await cargarConfig()

  onlineStatus.value = navigator.onLine
  const onOnline = () => {
    onlineStatus.value = true
    if (syncMode.value !== 'offline') syncNow()
  }
  const onOffline = () => { onlineStatus.value = false }
  window.addEventListener('online', onOnline)
  window.addEventListener('offline', onOffline)
  onlineHandler = () => window.removeEventListener('online', onOnline)
  offlineHandler = () => window.removeEventListener('offline', onOffline)

  syncService.setStatusCallback((status) => {
    syncStatus.value = status
    if (status.lastSync) {
      syncMsg.value = `Ultima sync: ${new Date(status.lastSync).toLocaleTimeString()}`
      syncMsgError.value = false
    }
    if (status.result && !syncing.value) {
      syncResult.value = status.result
      syncMsg.value = status.result.message
      syncMsgError.value = !status.result.success
      mostrarToastSync(status.result, status.mode || syncMode.value)
    }
  })

  if (form.url && form.anonKey) {
    sb.init({ url: form.url, anonKey: form.anonKey, serviceRole: form.serviceRole || undefined })
    conectado.value = sb.isConnected()
    await verificarSesion()
    if (conectado.value) {
      autoSync.value = true
      syncService.startAutoSync(syncInterval.value * 1000)
      console.log('[AutoSync] Iniciado cada', syncInterval.value, 's')
    }
  }
  authSub = sb.onAuthStateChange((_event, session) => {
    sessionUser.value = session?.user || null
  })
})

onUnmounted(() => {
  if (onlineHandler) onlineHandler()
  if (offlineHandler) offlineHandler()
  if (authSub?.subscription) authSub.subscription.unsubscribe()
})
</script>
