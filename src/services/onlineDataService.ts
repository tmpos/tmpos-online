import { computed, readonly, ref } from 'vue'
import * as tmCloud from './tmCloudClient'

type ApiResult<T = any> = { success: boolean; data?: T; error?: string; changes?: number }

const LOCAL_TABLES = new Set([
  'usuarios',
  'empresa',
  'tmcloud_config',
  'licencia',
  'otp_local_config',
  'impresoras_config',
])
const LOCAL_CHANNEL_PREFIXES = [
  'tmcloud:', 'licencia:', 'otp-local:', 'print:', 'printer:', 'pdf:', 'save:',
  'clipboard:', 'openai:', 'imei:', 'app:', 'update:',
  'empresa-local:', 'correo-local:', 'backup:', 'enviar:',
]
const LOCAL_CHANNELS = new Set([
  'getServerUrl',
  'generate:pdf',
  'getPrinters',
  'scan:bluetooth',
  'db:clearEmpresaOnly',
  // Mantener solicitud y validacion dentro del runtime nativo. El servidor
  // remoto solo participa en el envio del mensaje mediante /otp/send.
  'facturas:solicitarOtpEliminar',
  'facturas:confirmarOtpEliminar',
])

const installed = ref(false)
const reachable = ref(false)
const checking = ref(false)
const lastError = ref('')
let healthTimer: ReturnType<typeof setInterval> | null = null
let localElectronBridge: any = null

type CloudColumnDefinition = {
  name: string
  type: string
  nullable?: boolean
  required?: boolean
  default?: string | number
}

type CloudTableSchema = { columns: Array<{ name: string }> }

const CLOUD_SCHEMA_CACHE_TTL_MS = 15000
const cloudSchemaChecks = new Map<string, Promise<void>>()
let cloudSchemaCache: { tables: Record<string, CloudTableSchema>; fetchedAt: number } | null = null
const CLOUD_EXCLUDED_LOCAL_COLUMNS = new Set(['id', 'almacen_id', 'sync_status', 'last_synced_at', '_rowid'])
const CLOUD_FALLBACK_SCHEMAS: Record<string, CloudColumnDefinition[]> = {
  datos_config: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'valor', type: 'TEXT' },
    { name: 'identificadordb', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
}

export const onlineDataStatus = {
  installed: readonly(installed),
  reachable: readonly(reachable),
  checking: readonly(checking),
  lastError: readonly(lastError),
  ready: computed(() => installed.value && reachable.value),
}

function tableName(value: unknown): string {
  const name = String(value || '').trim().toLowerCase()
  if (!/^[a-z_][a-z0-9_]*$/.test(name)) throw new Error('Nombre de tabla no valido')
  return name
}

function isLocalTable(value: unknown): boolean {
  return LOCAL_TABLES.has(tableName(value))
}

function isLocalChannel(channel: string): boolean {
  return LOCAL_CHANNELS.has(channel) || LOCAL_CHANNEL_PREFIXES.some(prefix => channel.startsWith(prefix))
}

function cloudApi(write = false) {
  const api = write ? tmCloud.getCloudWriteApi() : tmCloud.getCloudApi()
  if (!api?.url || !api.key) throw new Error('TM Cloud no esta configurado. Configuralo para usar el sistema.')
  return api
}

function markOnline() {
  const changed = !reachable.value
  reachable.value = true
  lastError.value = ''
  if (changed) window.dispatchEvent(new CustomEvent('tmcloud:connection-restored'))
}

function markOffline(error: unknown) {
  reachable.value = false
  lastError.value = error instanceof Error ? error.message : String(error || 'Sin conexion con TM Cloud')
  window.dispatchEvent(new CustomEvent('tmcloud:connection-lost', { detail: { error: lastError.value } }))
}

async function cloudRequest(path: string, init: RequestInit = {}, write = false): Promise<any> {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    const error = new Error('No hay conexion a Internet. El sistema requiere conexion para operar.')
    markOffline(error)
    throw error
  }
  const api = cloudApi(write)
  try {
    const response = await fetch(`${api.url}${path}`, {
      ...init,
      cache: 'no-store',
      headers: { ...tmCloud.authHeaders(api.key, Boolean(init.body)), ...(init.headers || {}) },
    })
    if (!response.ok) throw new Error(await tmCloud.responseError(response))
    markOnline()
    return await response.json().catch(() => ({}))
  } catch (error) {
    markOffline(error)
    throw error
  }
}

function cloudColumnType(value: unknown): string {
  const type = String(value || 'TEXT').toUpperCase()
  if (type.includes('INT') || type.includes('BOOL')) return 'INTEGER'
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB') || type.includes('DEC') || type.includes('NUM')) return 'REAL'
  if (type.includes('DATE') || type.includes('TIME')) return 'DATETIME'
  return 'TEXT'
}

function inferredCloudColumns(data: Record<string, any> = {}): CloudColumnDefinition[] {
  return Object.entries(data)
    .filter(([name]) => !CLOUD_EXCLUDED_LOCAL_COLUMNS.has(name.toLowerCase()))
    .map(([name, value]) => ({
      name,
      type: typeof value === 'number' ? (Number.isInteger(value) ? 'INTEGER' : 'REAL') : 'TEXT',
    }))
}

async function localCloudColumns(tabla: string): Promise<CloudColumnDefinition[]> {
  try {
    const columns = await localElectronBridge?.invoke('consultaservidor', 'getTableColumns', tabla)
    if (!Array.isArray(columns) || !columns.length) return []
    return columns
      .filter((column: any) => !CLOUD_EXCLUDED_LOCAL_COLUMNS.has(String(column.name || '').toLowerCase()))
      .map((column: any) => ({
        name: String(column.name),
        type: cloudColumnType(column.type),
        nullable: Number(column.notnull || 0) !== 1,
        ...(Number(column.notnull || 0) === 1 && column.dflt_value == null ? { required: true } : {}),
      }))
  } catch {
    return []
  }
}

async function fetchCloudSchema(force = false): Promise<Record<string, CloudTableSchema>> {
  if (!force && cloudSchemaCache && Date.now() - cloudSchemaCache.fetchedAt < CLOUD_SCHEMA_CACHE_TTL_MS) {
    return cloudSchemaCache.tables
  }
  const response = await cloudRequest('/schema')
  const tables = response?.data && typeof response.data === 'object' ? response.data : {}
  cloudSchemaCache = { tables, fetchedAt: Date.now() }
  return tables
}

async function desiredCloudColumns(tabla: string, data: Record<string, any> = {}): Promise<CloudColumnDefinition[]> {
  const local = await localCloudColumns(tabla)
  const fallback = CLOUD_FALLBACK_SCHEMAS[tabla] || []
  const inferred = inferredCloudColumns(data)
  const merged = new Map<string, CloudColumnDefinition>()
  for (const column of [...fallback, ...local, ...inferred]) merged.set(column.name, column)
  if (!merged.has('uid')) merged.set('uid', { name: 'uid', type: 'TEXT' })
  if (!merged.has('created_at')) merged.set('created_at', { name: 'created_at', type: 'DATETIME' })
  if (!merged.has('updated_at')) merged.set('updated_at', { name: 'updated_at', type: 'DATETIME' })
  return [...merged.values()]
}

export async function ensureOnlineTable(tablaValue: string, data: Record<string, any> = {}): Promise<void> {
  const tabla = tableName(tablaValue)
  if (isLocalTable(tabla)) return

  const pending = cloudSchemaChecks.get(tabla)
  if (pending) return pending

  const check = (async () => {
    const schema = await fetchCloudSchema()
    const desired = await desiredCloudColumns(tabla, data)
    const current = schema[tabla]
    const currentColumns = new Set((current?.columns || []).map(column => column.name))
    const needsUpdate = !current || desired.some(column => !currentColumns.has(column.name))
    if (!needsUpdate) return

    const config = tmCloud.getConfig()
    if (!config?.serviceKey) {
      throw new Error(`La tabla ${tabla} no existe o esta incompleta en TM Cloud. Configura la Secret Key para crearla automaticamente.`)
    }

    await cloudRequest('/schema/tables/batch', {
      method: 'POST',
      body: JSON.stringify({ tables: [{ name: tabla, columns: desired }] }),
    }, true)

    const refreshed = await fetchCloudSchema(true)
    const created = refreshed[tabla]
    const createdColumns = new Set((created?.columns || []).map(column => column.name))
    const missing = desired.filter(column => !createdColumns.has(column.name)).map(column => column.name)
    if (!created || missing.length) {
      throw new Error(`TM Cloud no pudo preparar la tabla ${tabla}${missing.length ? `; faltan columnas: ${missing.join(', ')}` : ''}`)
    }
  })().finally(() => cloudSchemaChecks.delete(tabla))

  cloudSchemaChecks.set(tabla, check)
  return check
}

async function fetchAll(tabla: string): Promise<any[]> {
  await ensureOnlineTable(tabla)
  const rows: any[] = []
  for (let page = 1; ; page++) {
    const response = await cloudRequest(`/${encodeURIComponent(tabla)}?page=${page}&limit=500`)
    const batch = Array.isArray(response?.data) ? response.data : []
    rows.push(...batch)
    const pages = Number(response?.meta?.pages || 0)
    if ((pages && page >= pages) || (!pages && batch.length < 500)) break
  }
  if (ONLINE_IMAGE_TABLES.has(tabla) && rows.length) {
    let metadata: any[] = []
    try {
      metadata = await fetchAll(ONLINE_IMAGE_METADATA_TABLE)
    } catch {
      // La metadata de imagen es opcional y nunca debe bloquear el catalogo.
      return rows
    }
    const images = new Map(metadata
      .filter(row => String(row.nombre || '').startsWith(`${ONLINE_IMAGE_PREFIX}${tabla}:`))
      .map(row => [String(row.nombre), String(row.valor || '')]))
    return rows.map(row => ({
      ...row,
      imagen: images.get(onlineImageKey(tabla, row.uid || row.id)) || row.imagen || '',
    }))
  }
  return rows
}

const ONLINE_IMAGE_METADATA_TABLE = 'datos_config'
const ONLINE_IMAGE_PREFIX = '__tmpos_imagen__:'
const ONLINE_IMAGE_TABLES = new Set(['accesorios', 'telefonos', 'electrodomesticos', 'piezas'])

function onlineImageKey(tabla: string, rowKey: unknown): string {
  return `${ONLINE_IMAGE_PREFIX}${tabla}:${String(rowKey || '')}`
}

function imageMetadataUid(): string {
  return typeof crypto?.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`
}

async function saveOnlineImage(tabla: string, rowKey: unknown, image: unknown): Promise<void> {
  if (!ONLINE_IMAGE_TABLES.has(tabla) || !rowKey) return
  const name = onlineImageKey(tabla, rowKey)
  let metadata: any[] = []
  try { metadata = await fetchAll(ONLINE_IMAGE_METADATA_TABLE) }
  catch { metadata = [] }
  const current = metadata.find(row => String(row.nombre || '') === name)
  const value = String(image || '')
  if (!value) {
    if (current) await cloudRequest(`/${ONLINE_IMAGE_METADATA_TABLE}/${encodeURIComponent(String(current.uid || current.id))}`, { method: 'DELETE' }, true)
    return
  }
  if (current) {
    await cloudRequest(`/${ONLINE_IMAGE_METADATA_TABLE}/${encodeURIComponent(String(current.uid || current.id))}`, {
      method: 'PUT', body: JSON.stringify({ valor: value, identificadordb: name }),
    }, true)
    return
  }
  await cloudRequest(`/${ONLINE_IMAGE_METADATA_TABLE}`, {
    method: 'POST',
    body: JSON.stringify({ uid: imageMetadataUid(), nombre: name, valor: value, identificadordb: name }),
  }, true)
}

function like(value: unknown, pattern: unknown): boolean {
  const source = String(pattern ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
  return new RegExp(`^${source}$`, 'i').test(String(value ?? ''))
}

// getWhere historically receives simple SQLite predicates from the views. We
// evaluate those predicates over fresh server rows; data is never read from a
// local business cache. Complex reports use the cloud runtime endpoint below.
function filterRows(rows: any[], where: string, params: any[]): any[] {
  if (!where.trim()) return rows
  let index = 0
  const clauses = where.replace(/^\s*where\s+/i, '').split(/\s+AND\s+/i)
  const tests = clauses.map(raw => {
    const clause = raw.trim().replace(/^\(+|\)+$/g, '')
    let match = clause.match(/^([A-Za-z_][\w]*)\s+IS\s+(NOT\s+)?NULL$/i)
    if (match) return (row: any) => match![2] ? row[match![1]] != null : row[match![1]] == null
    match = clause.match(/^([A-Za-z_][\w]*)\s+(NOT\s+LIKE|LIKE|<>|!=|>=|<=|=|>|<)\s+\?$/i)
    if (!match) throw new Error(`Filtro online no soportado: ${raw}`)
    const [, column, operatorRaw] = match
    const expected = params[index++]
    const operator = operatorRaw.toUpperCase()
    return (row: any) => {
      const actual = row[column]
      if (operator === 'LIKE') return like(actual, expected)
      if (operator === 'NOT LIKE') return !like(actual, expected)
      if (operator === '=' ) return String(actual ?? '') === String(expected ?? '')
      if (operator === '!=' || operator === '<>') return String(actual ?? '') !== String(expected ?? '')
      const left = Number(actual); const right = Number(expected)
      if (operator === '>') return left > right
      if (operator === '<') return left < right
      if (operator === '>=') return left >= right
      return left <= right
    }
  })
  return rows.filter(row => tests.every(test => test(row)))
}

async function runtime(action: string, data: Record<string, any>): Promise<any> {
  const response = await cloudRequest('/runtime', {
    method: 'POST',
    body: JSON.stringify({ action, data }),
  }, true)
  return response
}

export async function checkOnlineDataConnection(): Promise<boolean> {
  if (checking.value) return reachable.value
  checking.value = true
  try {
    await cloudRequest('/health')
    return true
  } catch {
    return false
  } finally {
    checking.value = false
  }
}

export async function installOnlineDataService(): Promise<void> {
  if (installed.value || (window as any).__isServerSystem) return
  const localDb = (window as any).db
  const localElectron = (window as any).electron
  if (!localDb || !localElectron?.invoke) throw new Error('La capa local no esta inicializada')
  localElectronBridge = localElectron

  const onlineDb = {
    getAll: async (tablaValue: string): Promise<ApiResult<any[]>> => {
      if (isLocalTable(tablaValue)) return localDb.getAll(tablaValue)
      try { return { success: true, data: await fetchAll(tableName(tablaValue)) } }
      catch (error: any) { return { success: false, error: error.message } }
    },
    getWhere: async (tablaValue: string, where: string, params: any[] = []): Promise<ApiResult<any[]>> => {
      if (isLocalTable(tablaValue)) return localDb.getWhere(tablaValue, where, params)
      try {
        const rows = await fetchAll(tableName(tablaValue))
        return { success: true, data: filterRows(rows, where || '', params) }
      } catch (error: any) { return { success: false, error: error.message } }
    },
    getModified: async (tablaValue: string, desde: string): Promise<ApiResult<any[]>> => {
      if (isLocalTable(tablaValue)) return localDb.getModified(tablaValue, desde)
      try {
        const tabla = tableName(tablaValue)
        await ensureOnlineTable(tabla)
        const path = `/${encodeURIComponent(tabla)}/sync?from=${encodeURIComponent(desde || '')}`
        const value = await cloudRequest(path)
        return { success: true, data: value?.data || [] }
      } catch (error: any) { return { success: false, error: error.message } }
    },
    getById: async (tablaValue: string, id: number): Promise<ApiResult<any>> => {
      if (isLocalTable(tablaValue)) return localDb.getById(tablaValue, id)
      try {
        const row = (await fetchAll(tableName(tablaValue))).find(item => Number(item.id) === Number(id))
        return { success: true, data: row }
      } catch (error: any) { return { success: false, error: error.message } }
    },
    insert: async (tablaValue: string, data: Record<string, any>): Promise<ApiResult<any>> => {
      if (isLocalTable(tablaValue)) return localDb.insert(tablaValue, data)
      try {
        const tabla = tableName(tablaValue)
        const record = tmCloud.cleanRecord(data)
        const image = record.imagen
        if (ONLINE_IMAGE_TABLES.has(tabla)) delete record.imagen
        await ensureOnlineTable(tabla, record)
        const value = await cloudRequest(`/${encodeURIComponent(tabla)}`, { method: 'POST', body: JSON.stringify(record) }, true)
        const created = value?.data || value
        if (ONLINE_IMAGE_TABLES.has(tabla) && image) await saveOnlineImage(tabla, created?.uid || record.uid || created?.id, image)
        window.dispatchEvent(new CustomEvent('tmcloud:table-changed', { detail: { table: tablaValue, updated: 1 } }))
        return { success: true, data: { ...created, ...(image ? { imagen: image } : {}) } }
      } catch (error: any) { return { success: false, error: error.message } }
    },
    update: async (tablaValue: string, id: number, data: Record<string, any>): Promise<ApiResult> => {
      if (isLocalTable(tablaValue)) return localDb.update(tablaValue, id, data)
      try {
        const tabla = tableName(tablaValue)
        const current = (await fetchAll(tabla)).find(item => Number(item.id) === Number(id))
        if (!current) return { success: false, error: 'El registro ya no existe en TM Cloud' }
        const key = current.uid || current.id
        const record = tmCloud.cleanRecord(data, true)
        const hasImage = Object.prototype.hasOwnProperty.call(record, 'imagen')
        const image = record.imagen
        if (ONLINE_IMAGE_TABLES.has(tabla)) delete record.imagen
        if (Object.keys(record).length) {
          await cloudRequest(`/${encodeURIComponent(tabla)}/${encodeURIComponent(String(key))}`, { method: 'PUT', body: JSON.stringify(record) }, true)
        }
        if (ONLINE_IMAGE_TABLES.has(tabla) && hasImage) await saveOnlineImage(tabla, current.uid || current.id, image)
        window.dispatchEvent(new CustomEvent('tmcloud:table-changed', { detail: { table: tabla, updated: 1 } }))
        return { success: true, changes: 1 }
      } catch (error: any) { return { success: false, error: error.message } }
    },
    delete: async (tablaValue: string, id: number): Promise<ApiResult> => {
      if (isLocalTable(tablaValue)) return localDb.delete(tablaValue, id)
      try {
        const tabla = tableName(tablaValue)
        const current = (await fetchAll(tabla)).find(item => Number(item.id) === Number(id))
        if (!current) return { success: true, changes: 0 }
        let cuentasCobrarEliminadas = 0
        if (tabla === 'facturas') {
          const cuentas = await fetchAll('cuentas_cobrar')
          const relacionadas = cuentas.filter(cuenta => {
            if (String(cuenta.no_factura || '').trim() !== String(current.no_factura || '').trim()) return false
            const facturaAlmacen = String(current.almacen_uid || '').trim()
            const cuentaAlmacen = String(cuenta.almacen_uid || '').trim()
            return !facturaAlmacen || !cuentaAlmacen || facturaAlmacen === cuentaAlmacen
          })
          for (const cuenta of relacionadas) {
            await cloudRequest(`/cuentas_cobrar/${encodeURIComponent(String(cuenta.uid || cuenta.id))}`, { method: 'DELETE' }, true)
            cuentasCobrarEliminadas++
          }

          const ecfRows = (await fetchAll('facturas_ecf')).filter(ecf => Number(ecf.factura_id || 0) === Number(current.id || 0))
          for (const ecf of ecfRows) {
            await cloudRequest(`/facturas_ecf/${encodeURIComponent(String(ecf.uid || ecf.id))}`, { method: 'DELETE' }, true)
          }
        }
        await cloudRequest(`/${encodeURIComponent(tabla)}/${encodeURIComponent(String(current.uid || current.id))}`, { method: 'DELETE' }, true)
        if (ONLINE_IMAGE_TABLES.has(tabla)) await saveOnlineImage(tabla, current.uid || current.id, '')
        window.dispatchEvent(new CustomEvent('tmcloud:table-changed', { detail: { table: tabla, deleted: 1 } }))
        return { success: true, changes: 1, data: { cuentas_cobrar_eliminadas: cuentasCobrarEliminadas } }
      } catch (error: any) { return { success: false, error: error.message } }
    },
    bitacoraList: (limite?: number) => runtime('db/bitacoraList', { limite }),
    bitacoraDeleteAll: () => runtime('db/bitacoraDeleteAll', {}),
  }

  // ContextBridge freezes exposed Electron objects. Electron's preload already
  // routes these calls to online:runtime; mutable web/Capacitor runtimes are
  // replaced here with the equivalent browser implementation.
  try { ;(window as any).db = onlineDb } catch { /* routed by preload */ }
  try { ;(window as any).electron = {
      ...localElectron,
      invoke: async (channel: string, ...args: any[]) => {
      if (channel === 'db:getAll') return onlineDb.getAll(args[0])
      if (channel === 'db:getWhere') return onlineDb.getWhere(args[0], args[1], args[2] || [])
      if (channel === 'db:getModified') return onlineDb.getModified(args[0], args[1] || '')
      if (channel === 'db:getById') return onlineDb.getById(args[0], args[1])
      if (channel === 'db:insert') return onlineDb.insert(args[0], args[1] || {})
      if (channel === 'db:update') return onlineDb.update(args[0], args[1], args[2] || {})
      if (channel === 'db:delete') return onlineDb.delete(args[0], args[1])
      if (channel.startsWith('db:') && isLocalTable(args[0])) return localElectron.invoke(channel, ...args)
      if (isLocalChannel(channel)) return localElectron.invoke(channel, ...args)
      if (channel === 'consultaservidor' && args[0] === 'getAllConfig') return localElectron.invoke(channel, ...args)
      return runtime('invoke', { channel, args })
      },
    }
  } catch { /* routed by preload */ }

  installed.value = true
  ;(window as any).__onlineOnly = true
  await checkOnlineDataConnection()
  healthTimer = setInterval(() => { void checkOnlineDataConnection() }, 15000)
}

export function stopOnlineDataHealthCheck() {
  if (healthTimer) clearInterval(healthTimer)
  healthTimer = null
}
