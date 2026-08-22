<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import InputSwitch from 'primevue/inputswitch'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { isVersionNewer } from '@/domain/versioning'

const toast = useToast()
const versionActual = ref('')
const versionInfo = ref<any>(null)
const revisando = ref(false)
const descargando = ref(false)
const estadoDescarga = ref('')
const autoCheck = ref(false)
const autoInstall = ref(false)
const catalogo = ref({ url: '', publicKey: '', secretKey: '' })
const paquete = ref<any>(null)
const paqueteOrigen = ref('')
const trabajandoEsquema = ref(false)
const resultadoEsquema = ref('')

const limpiarUrl = (url: string) => url.trim().replace(/\/+$/, '')

async function cargarCatalogo() {
  try {
    const [url, publicKey, secretKey] = await Promise.all([
      (window as any).config.get('schema_catalog_url'),
      (window as any).config.get('schema_catalog_public_key'),
      (window as any).config.get('schema_catalog_secret_key'),
    ])
    catalogo.value.url = url?.success ? String(url.data || '') : ''
    catalogo.value.publicKey = publicKey?.success ? String(publicKey.data || '') : ''
    catalogo.value.secretKey = secretKey?.success ? String(secretKey.data || '') : ''
  } catch {}
}

async function guardarCatalogo(mostrarToast = true) {
  await Promise.all([
    (window as any).config.set('schema_catalog_url', limpiarUrl(catalogo.value.url)),
    (window as any).config.set('schema_catalog_public_key', catalogo.value.publicKey.trim()),
    (window as any).config.set('schema_catalog_secret_key', catalogo.value.secretKey.trim()),
  ])
  if (mostrarToast) toast.add({ severity: 'success', summary: 'Catalogo guardado', detail: 'La conexion central quedo configurada.', life: 3000 })
}

async function capturarConfiguracion() {
  trabajandoEsquema.value = true
  try {
    const res = await (window as any).electron.invoke('portable-config:create')
    if (!res.success) throw new Error(res.error)
    paquete.value = res.data
    paqueteOrigen.value = 'Esta instalacion'
    resultadoEsquema.value = `${res.data.schema.tables.length} tablas, ${res.data.settings?.length || 0} configuraciones y ${res.data.defaults?.seeds?.length || 0} datos iniciales.`
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 }) }
  finally { trabajandoEsquema.value = false }
}

async function publicarCatalogo() {
  if (!paquete.value) await capturarConfiguracion()
  if (!paquete.value) return
  const base = limpiarUrl(catalogo.value.url)
  const key = catalogo.value.secretKey.trim()
  if (!base || !key) { toast.add({ severity: 'warn', summary: 'Falta conexion', detail: 'Indica la URL y Secret Key del catalogo central.', life: 4000 }); return }
  trabajandoEsquema.value = true
  try {
    await guardarCatalogo(false)
    const schemaResponse = await fetch(`${base}/schema/tables/batch`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ tables: [{ name: 'sistema_actualizaciones', columns: [
        { name: 'uid', type: 'TEXT' }, { name: 'nombre', type: 'TEXT' }, { name: 'version', type: 'TEXT' },
        { name: 'app_version', type: 'TEXT' }, { name: 'package_json', type: 'LONGTEXT' },
        { name: 'created_at', type: 'DATETIME' }, { name: 'updated_at', type: 'DATETIME' },
      ] }] }),
    })
    if (!schemaResponse.ok) throw new Error(`No se pudo preparar el catalogo (${schemaResponse.status})`)
    const now = new Date().toISOString()
    const upload = await fetch(`${base}/sistema_actualizaciones/upsert`, {
      method: 'POST', headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ rows: [{ uid: '00000000-0000-4000-8000-000000009001', nombre: 'CONFIGURACION PRINCIPAL TMPOS', version: String(paquete.value.generatedAt), app_version: String(paquete.value.appVersion || ''), package_json: JSON.stringify(paquete.value), created_at: now, updated_at: now }] }),
    })
    if (!upload.ok) throw new Error(`No se pudo publicar (${upload.status})`)
    resultadoEsquema.value = `Configuracion publicada en el catalogo central el ${new Date().toLocaleString()}.`
    toast.add({ severity: 'success', summary: 'Publicada', detail: 'Los otros sistemas ya pueden descargar esta estructura.', life: 4000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error de publicacion', detail: e.message, life: 6000 }) }
  finally { trabajandoEsquema.value = false }
}

async function descargarCatalogo() {
  const base = limpiarUrl(catalogo.value.url)
  const key = catalogo.value.publicKey.trim() || catalogo.value.secretKey.trim()
  if (!base || !key) { toast.add({ severity: 'warn', summary: 'Falta conexion', detail: 'Indica la URL y una llave del catalogo.', life: 4000 }); return }
  trabajandoEsquema.value = true
  try {
    await guardarCatalogo(false)
    const response = await fetch(`${base}/sistema_actualizaciones?limit=100`, { headers: { Authorization: `Bearer ${key}` } })
    if (!response.ok) throw new Error(`No se pudo descargar (${response.status})`)
    const json = await response.json()
    const rows = Array.isArray(json.data) ? json.data : []
    const row = rows.find((item: any) => item.uid === '00000000-0000-4000-8000-000000009001') || rows.sort((a: any, b: any) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))[0]
    if (!row?.package_json) throw new Error('El catalogo todavia no contiene una configuracion publicada')
    paquete.value = JSON.parse(row.package_json)
    paqueteOrigen.value = 'Catalogo central'
    resultadoEsquema.value = `${paquete.value.schema.tables.length} tablas descargadas. Generada: ${new Date(paquete.value.generatedAt).toLocaleString()}.`
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error de descarga', detail: e.message, life: 6000 }) }
  finally { trabajandoEsquema.value = false }
}

async function aplicarPaquete() {
  if (!paquete.value) { toast.add({ severity: 'warn', summary: 'Sin configuracion', detail: 'Primero captura, descarga o importa un paquete.', life: 3500 }); return }
  trabajandoEsquema.value = true
  try {
    const paquetePlano = JSON.parse(JSON.stringify(paquete.value))
    const res = await (window as any).electron.invoke('portable-config:apply', paquetePlano)
    if (!res.success) throw new Error(res.error)
    const data = res.data
    resultadoEsquema.value = `${data.tablesCreated.length} tablas creadas, ${data.columnsAdded.length} campos agregados y ${data.tablesUnchanged.length} tablas ya actualizadas.`
    toast.add({ severity: 'success', summary: 'Estructura actualizada', detail: resultadoEsquema.value, life: 5000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'No se pudo aplicar', detail: e.message, life: 6000 }) }
  finally { trabajandoEsquema.value = false }
}

async function instalarDatosIniciales() {
  trabajandoEsquema.value = true
  try {
    const defaultsPlanos = paquete.value?.defaults ? JSON.parse(JSON.stringify(paquete.value.defaults)) : undefined
    const res = await (window as any).electron.invoke('portable-config:seed-defaults', defaultsPlanos)
    if (!res.success) throw new Error(res.error)
    resultadoEsquema.value = `${res.data.inserted.length} datos iniciales creados y ${res.data.existing.length} ya existentes.`
    toast.add({ severity: 'success', summary: 'Datos iniciales listos', detail: resultadoEsquema.value, life: 5000 })
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 6000 }) }
  finally { trabajandoEsquema.value = false }
}

async function cargarConfig() {
  try {
    const [resCheck, resInstall] = await Promise.all([
      (window as any).config.get('update_autoCheck'),
      (window as any).config.get('update_autoInstall'),
    ])
    if (resCheck.success) autoCheck.value = resCheck.data === 'true'
    if (resInstall.success) autoInstall.value = resInstall.data === 'true'
  } catch {}
}

async function guardarAutoCheck(v: boolean) {
  await (window as any).config.set('update_autoCheck', String(v))
  if (!v) {
    autoInstall.value = false
    await (window as any).config.set('update_autoInstall', 'false')
  }
}

async function guardarAutoInstall(v: boolean) {
  await (window as any).config.set('update_autoInstall', String(v))
}

const hayActualizacion = computed(() => {
  if (!versionInfo.value || !versionActual.value) return false
  if (typeof versionInfo.value.hayActualizacion === 'boolean') return versionInfo.value.hayActualizacion
  return isVersionNewer(versionInfo.value.version, versionActual.value)
})

function formatReleaseDate(value: unknown): string {
  const date = new Date(String(value || ''))
  return Number.isNaN(date.getTime()) ? String(value || '-') : date.toLocaleString()
}

async function revisar() {
  revisando.value = true
  try {
    const res = await (window as any).electron.invoke('update:check')
    if (res.success) {
      versionInfo.value = res.data
      versionActual.value = res.data?.currentVersion || versionActual.value || (window as any).appVersion || '0.0.0'
      toast.add(hayActualizacion.value
        ? { severity: 'warn', summary: 'Nueva version disponible', detail: `TMPOS ${res.data.version} esta disponible en GitHub.`, life: 6000 }
        : { severity: 'success', summary: 'TMPOS actualizado', detail: `Tienes la ultima version (${versionActual.value}).`, life: 3500 })
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo verificar', life: 6000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 6000 })
  } finally {
    revisando.value = false
  }
}

async function descargarEInstalar() {
  if (!versionInfo.value?.url) {
    toast.add({ severity: 'warn', summary: 'Sin URL', detail: 'No hay URL de descarga disponible', life: 3000 })
    return
  }
  descargando.value = true
  estadoDescarga.value = 'Descargando actualizacion...'
  try {
    const res = await (window as any).electron.invoke('update:download', versionInfo.value.url)
    if (!res.success) {
      estadoDescarga.value = 'Error: ' + res.error
      setTimeout(() => { descargando.value = false }, 3000)
      return
    }
    estadoDescarga.value = 'Instalando nueva version...'
    await (window as any).electron.invoke('update:install', res.path)
  } catch (e: any) {
    estadoDescarga.value = 'Error: ' + e.message
    setTimeout(() => { descargando.value = false }, 3000)
  }
}

onMounted(async () => {
  await cargarConfig()
  await cargarCatalogo()
  if ((window as any).electron?.invoke) {
    try {
      const currentVersion = await (window as any).electron.invoke('app:getVersion')
      if (currentVersion) versionActual.value = currentVersion
    } catch {}
    await revisar()
  }
})
</script>

<template>
  <div>
    <Toast />

    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 max-w-xl">
      <div class="flex items-center gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600">
          <i class="pi pi-refresh text-lg"></i>
        </div>
        <div>
          <h3 class="font-bold text-lg">Actualizacion</h3>
          <p class="text-xs text-surface-500">Version actual: <strong>{{ versionActual }}</strong></p>
        </div>
      </div>

      <div v-if="versionInfo" class="space-y-4">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-3 space-y-2 text-sm">
          <div class="flex justify-between">
            <span class="text-surface-500">Version disponible</span>
            <span class="font-bold text-primary">{{ versionInfo.version }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Fecha</span>
            <span>{{ formatReleaseDate(versionInfo.fecha) }}</span>
          </div>
          <div class="flex justify-between">
            <span class="text-surface-500">Actualizada</span>
            <Tag :value="hayActualizacion ? 'Disponible' : 'Actualizada'" :severity="hayActualizacion ? 'warn' : 'success'" />
          </div>
          <div v-if="versionInfo.notas" class="pt-1">
            <span class="text-surface-500 text-xs">Notas:</span>
            <p class="text-xs mt-0.5">{{ versionInfo.notas }}</p>
          </div>
        </div>

        <div v-if="hayActualizacion" class="flex gap-2">
          <Button label="Descargar e Instalar" icon="pi pi-download" :loading="descargando" @click="descargarEInstalar" />
        </div>
        <div v-else class="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
          <i class="pi pi-check-circle"></i> Tienes la ultima version
        </div>
      </div>

      <div class="mt-4">
        <Button label="Revisar actualizaciones" icon="pi pi-search" severity="secondary" :loading="revisando" @click="revisar" />
      </div>
    </div>

    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 max-w-xl mt-4">
      <h4 class="font-bold text-sm mb-3 flex items-center gap-2"><i class="pi pi-cog text-primary"></i>Actualizacion automatica</h4>
      <div class="space-y-4">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">Buscar actualizaciones</p>
            <p class="text-xs text-surface-400">Revisar automaticamente cada 30 minutos</p>
          </div>
           <InputSwitch v-model="autoCheck" @update:model-value="v => guardarAutoCheck(v)" />
        </div>
        <div class="flex items-center justify-between">
          <div>
            <p class="text-sm font-medium">Descargar e instalar automaticamente</p>
            <p class="text-xs text-surface-400">Si hay actualizacion, descargar e instalar sin intervencion</p>
          </div>
           <InputSwitch v-model="autoInstall" :disabled="!autoCheck" @update:model-value="v => guardarAutoInstall(v)" />
        </div>
      </div>
    </div>

    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 max-w-4xl mt-4">
      <div class="flex items-start gap-3 mb-4">
        <div class="w-10 h-10 rounded-xl bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center text-emerald-600 shrink-0"><i class="pi pi-database text-lg"></i></div>
        <div>
          <h3 class="font-bold text-lg">Estructura y configuracion del sistema</h3>
          <p class="text-xs text-surface-500">Publica una plantilla central para actualizar instalaciones de cualquier empresa. Solo crea tablas y agrega campos faltantes; nunca elimina tablas ni registros.</p>
        </div>
      </div>

      <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 mb-4">
        <h4 class="font-semibold text-sm mb-3">Catalogo central de actualizaciones</h4>
        <div class="grid grid-cols-1 md:grid-cols-3 gap-3">
          <div><label class="text-xs text-surface-500 block mb-1">URL del proyecto central</label><InputText v-model="catalogo.url" placeholder="https://servidor/api/prj_..." class="w-full" /></div>
          <div><label class="text-xs text-surface-500 block mb-1">Public Key (descargar)</label><Password v-model="catalogo.publicKey" :feedback="false" toggleMask fluid placeholder="tmp_public_..." /></div>
          <div><label class="text-xs text-surface-500 block mb-1">Secret Key (publicar)</label><Password v-model="catalogo.secretKey" :feedback="false" toggleMask fluid placeholder="tmp_secret_..." /></div>
        </div>
        <Button label="Guardar conexion" icon="pi pi-save" severity="secondary" outlined size="small" class="mt-3" @click="guardarCatalogo()" />
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
          <div><h4 class="font-semibold text-sm">Preparar y publicar</h4><p class="text-xs text-surface-500 mt-1">Captura todas las tablas/campos, preferencias no sensibles y datos iniciales controlados.</p></div>
          <div class="flex flex-wrap gap-2">
            <Button label="Capturar actual" icon="pi pi-camera" severity="info" :loading="trabajandoEsquema" @click="capturarConfiguracion" />
            <Button label="Subir a la API" icon="pi pi-cloud-upload" severity="success" :disabled="!paquete" :loading="trabajandoEsquema" @click="publicarCatalogo" />
          </div>
        </div>
        <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-3">
          <div><h4 class="font-semibold text-sm">Actualizar esta instalacion</h4><p class="text-xs text-surface-500 mt-1">Descarga la ultima plantilla y completa la base local sin tocar los datos existentes.</p></div>
          <div class="flex flex-wrap gap-2">
            <Button label="Descargar de API" icon="pi pi-cloud-download" severity="info" :loading="trabajandoEsquema" @click="descargarCatalogo" />
            <Button label="Crear tablas y campos" icon="pi pi-wrench" severity="warn" :disabled="!paquete" :loading="trabajandoEsquema" @click="aplicarPaquete" />
            <Button label="Datos por default" icon="pi pi-sparkles" severity="secondary" :loading="trabajandoEsquema" @click="instalarDatosIniciales" />
          </div>
        </div>
      </div>

      <div v-if="paquete || resultadoEsquema" class="mt-4 rounded-lg bg-surface-50 dark:bg-surface-900 p-3 text-xs">
        <div v-if="paquete" class="font-medium mb-1"><i class="pi pi-box mr-1 text-primary"></i>{{ paqueteOrigen }} · {{ paquete.schema?.tables?.length || 0 }} tablas · versión {{ paquete.appVersion }}</div>
        <div class="text-surface-500">{{ resultadoEsquema }}</div>
      </div>
      <p class="text-[11px] text-amber-600 dark:text-amber-400 mt-3"><i class="pi pi-shield mr-1"></i>Las claves, tokens, contraseñas, licencias y datos reales de clientes/inventario no se publican.</p>
    </div>

    <!-- Overlay de carga -->
    <div
      v-if="descargando"
      class="fixed inset-0 z-[9999] flex flex-col items-center justify-center"
      style="background: rgba(0,0,0,0.7)"
    >
      <div class="w-16 h-16 rounded-2xl bg-white dark:bg-surface-800 flex items-center justify-center shadow-2xl mb-4">
        <i class="pi pi-spin pi-spinner text-3xl text-primary"></i>
      </div>
      <p class="text-white text-lg font-semibold">{{ estadoDescarga }}</p>
      <p class="text-white/60 text-sm mt-1">No cierres la aplicacion...</p>
    </div>
  </div>
</template>
