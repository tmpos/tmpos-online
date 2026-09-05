import { computed, readonly, ref } from 'vue'
import * as tmCloud from './tmCloudClient'

type ApiResult<T = any> = { success: boolean; data?: T; error?: string; changes?: number }

const LOCAL_TABLES = new Set([
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
  'whatsapp:open',
  'scan:bluetooth',
  'db:clearEmpresaOnly',
  // Mantener solicitud y validacion dentro del runtime nativo. El servidor
  // remoto solo participa en el envio del mensaje mediante /otp/send.
  'facturas:solicitarOtpEliminar',
  'facturas:confirmarOtpEliminar',
  'telefonos:solicitarOtpEliminar',
  'telefonos:confirmarOtpEliminar',
])

const installed = ref(false)
const reachable = ref(false)
const checking = ref(false)
const lastError = ref('')
let healthTimer: ReturnType<typeof setInterval> | null = null
let localElectronBridge: any = null
let cloudInvalidationListenerInstalled = false

type CloudColumnDefinition = {
  name: string
  type: string
  nullable?: boolean
  required?: boolean
  default?: string | number
}

type CloudTableSchema = { columns: Array<{ name: string }> }

const CLOUD_SCHEMA_CACHE_TTL_MS = 15000
// Las lecturas completas se reutilizan por unos segundos. Las mutaciones y los
// eventos de sincronizacion invalidan la tabla inmediatamente, de modo que no
// se pierde ningun cambio y varias vistas pueden compartir la misma descarga.
const CLOUD_DATA_CACHE_TTL_MS = 5000
const cloudSchemaChecks = new Map<string, Promise<void>>()
let cloudSchemaCache: { tables: Record<string, CloudTableSchema>; fetchedAt: number } | null = null
let cloudSchemaFetch: Promise<Record<string, CloudTableSchema>> | null = null
const cloudDataCache = new Map<string, { rows: any[]; fetchedAt: number }>()
const cloudDataFetches = new Map<string, Promise<any[]>>()
type CloudDataBatchEntry = {
  resolve: (rows: any[]) => void
  reject: (error: unknown) => void
}
type CloudTableLoad =
  | { status: 'fulfilled'; rows: any[] }
  | { status: 'rejected'; reason: unknown }
const cloudDataBatch = new Map<string, CloudDataBatchEntry>()
let cloudDataBatchScheduled = false
let cloudSnapshotUnsupported = false
const CLOUD_EXCLUDED_LOCAL_COLUMNS = new Set(['id', 'almacen_id', 'sync_status', 'last_synced_at', '_rowid'])
const CLOUD_FALLBACK_SCHEMAS: Record<string, CloudColumnDefinition[]> = {
  cuadres: [
    { name: 'uid', type: 'TEXT' },
    { name: 'fecha', type: 'TEXT' },
    { name: 'turno_id', type: 'INTEGER', default: 0 },
    { name: 'turno_usuario', type: 'TEXT' },
    { name: 'monto_inicial', type: 'REAL', default: 0 },
    { name: 'total_ventas', type: 'REAL', default: 0 },
    { name: 'efectivo', type: 'REAL', default: 0 },
    { name: 'tarjeta', type: 'REAL', default: 0 },
    { name: 'transferencia', type: 'REAL', default: 0 },
    { name: 'abonos_cxc', type: 'REAL', default: 0 },
    { name: 'cantidad_abonos_cxc', type: 'INTEGER', default: 0 },
    { name: 'total_gastos', type: 'REAL', default: 0 },
    { name: 'saldo_final', type: 'REAL', default: 0 },
    { name: 'observacion', type: 'TEXT' },
    { name: 'almacen_uid', type: 'TEXT' },
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
  colores: [
    { name: 'uid', type: 'TEXT' },
    { name: 'nombre', type: 'TEXT' },
    { name: 'codigo', type: 'TEXT' },
    { name: 'estado', type: 'TEXT' },
    { name: 'created_at', type: 'DATETIME' },
    { name: 'updated_at', type: 'DATETIME' },
  ],
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
  let response: Response | null = null
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      response = await fetch(`${api.url}${path}`, {
        ...init,
        cache: 'no-store',
        headers: { ...tmCloud.authHeaders(api.key, Boolean(init.body)), ...(init.headers || {}) },
      })
    } catch (error) {
      // fetch solo rechaza por un problema real de red. Los errores HTTP y de
      // contenido pertenecen a la operacion solicitada y no deben declarar toda
      // la aplicacion sin conexion.
      if (attempt >= 3) {
        markOffline(error)
        throw error
      }
      await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)))
      continue
    }
    markOnline()
    const retryable = response.status === 408 || response.status === 425 || response.status === 429 || (response.status >= 500 && response.status !== 501)
    if (!retryable || attempt === 3) break
    const retryAfter = Number(response.headers.get('retry-after') || 0)
    await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 500 * (attempt + 1)))
  }
  if (!response) throw new Error('TM Cloud no respondio')
  if (!response.ok) {
    const error = new Error(await tmCloud.responseError(response)) as Error & { status?: number }
    error.status = response.status
    throw error
  }
  return await response.json().catch(() => ({}))
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
  if (!force && cloudSchemaFetch) return cloudSchemaFetch

  const request = cloudRequest('/schema').then(response => {
    const tables = response?.data && typeof response.data === 'object' ? response.data : {}
    if (Object.keys(tables).length === 0 && cloudSchemaCache && Object.keys(cloudSchemaCache.tables).length > 0) {
      return cloudSchemaCache.tables
    }
    cloudSchemaCache = { tables, fetchedAt: Date.now() }
    return tables
  })
  if (!force) cloudSchemaFetch = request
  try {
    return await request
  } finally {
    if (!force && cloudSchemaFetch === request) cloudSchemaFetch = null
  }
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

function isMissingCloudTableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error || '')
  return /table\s+not\s+found|tabla.+no\s+(?:existe|encontr)/i.test(message)
}

async function readCloudTable(tabla: string, path: string): Promise<any> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await cloudRequest(path)
    } catch (error) {
      if (!isMissingCloudTableError(error) || attempt >= 3) throw error

      // El esquema de TMPBase puede anunciar una tabla justo antes de que el
      // endpoint de datos termine de habilitarla. Desechar el esquema cacheado,
      // volver a prepararla y reintentar evita mostrar "Table not found" al
      // entrar por primera vez a modulos como Cuadre.
      cloudSchemaCache = null
      cloudSchemaChecks.delete(tabla)
      await ensureOnlineTable(tabla)
      await new Promise(resolve => setTimeout(resolve, 350 * (attempt + 1)))
    }
  }
}

async function fetchTableRowsIndividual(tabla: string): Promise<any[]> {
  await ensureOnlineTable(tabla)
  let rows: any[] = []

  // TMPBASE moderno entrega el snapshot completo en una sola consulta y una
  // sola respuesta comprimible. Conservamos el recorrido paginado como
  // compatibilidad durante despliegues donde el servidor aun no se actualizo.
  const snapshot = await readCloudTable(tabla, `/${encodeURIComponent(tabla)}?all=1&limit=100&page=1`)
  if (!Array.isArray(snapshot?.data)) throw new Error(`TM Cloud devolvio una respuesta invalida para ${tabla}`)
  if (snapshot?.meta?.mode === 'all') {
    rows = snapshot.data
  } else {
    for (let page = 1; ; page++) {
      const response = page === 1
        ? snapshot
        : await readCloudTable(tabla, `/${encodeURIComponent(tabla)}?page=${page}&limit=100`)
      if (!Array.isArray(response?.data)) throw new Error(`TM Cloud devolvio una respuesta invalida para ${tabla}`)
      const batch = response.data
      rows.push(...batch)
      const pages = Number(response?.meta?.pages || 0)
      if ((pages && page >= pages) || (!pages && batch.length < 100)) break
    }
  }
  return rows
}

function hydrateOnlineImageRows(tabla: string, rows: any[], metadata: any[]): any[] {
  if (!ONLINE_IMAGE_TABLES.has(tabla) || !rows.length) return rows
  const images = new Map(metadata
    .filter(row => String(row.nombre || '').startsWith(`${ONLINE_IMAGE_PREFIX}${tabla}:`))
    .map(row => [String(row.nombre), String(row.valor || '')]))
  return rows.map(row => ({
    ...row,
    imagen: images.get(onlineImageKey(tabla, row.uid || row.id)) || row.imagen || '',
  }))
}

async function fetchTableRowsIndividualWithImages(tabla: string): Promise<any[]> {
  const rows = await fetchTableRowsIndividual(tabla)
  if (!ONLINE_IMAGE_TABLES.has(tabla) || !rows.length) return rows
  try {
    const metadata = await fetchTableRowsIndividual(ONLINE_IMAGE_METADATA_TABLE)
    cloudDataCache.set(ONLINE_IMAGE_METADATA_TABLE, { rows: metadata, fetchedAt: Date.now() })
    return hydrateOnlineImageRows(tabla, rows, metadata)
  } catch {
    // La metadata de imagen es opcional y nunca debe bloquear el catalogo.
    return rows
  }
}

async function fetchTablesIndividually(tables: string[]): Promise<Map<string, CloudTableLoad>> {
  const loads = await Promise.all(tables.map(async tabla => {
    try {
      return [tabla, { status: 'fulfilled', rows: await fetchTableRowsIndividual(tabla) } as CloudTableLoad] as const
    } catch (reason) {
      return [tabla, { status: 'rejected', reason } as CloudTableLoad] as const
    }
  }))
  return new Map<string, CloudTableLoad>(loads)
}

async function fetchSnapshotTables(tables: string[]): Promise<Map<string, CloudTableLoad>> {
  await Promise.all(tables.map(tabla => ensureOnlineTable(tabla)))
  const response = await cloudRequest('/snapshot', {
    method: 'POST',
    body: JSON.stringify({ tables }),
  })
  const data = response?.data
  if (response?.meta?.mode !== 'snapshot' || !data || typeof data !== 'object' || Array.isArray(data)) {
    throw new Error('TM Cloud devolvio un snapshot invalido')
  }
  const incomplete = tables.find(tabla => !Object.prototype.hasOwnProperty.call(data, tabla) || !Array.isArray(data[tabla]))
  if (incomplete) throw new Error(`TM Cloud devolvio un snapshot incompleto; falta ${incomplete}`)
  return new Map<string, CloudTableLoad>(tables.map(tabla => [
    tabla,
    { status: 'fulfilled', rows: data[tabla] },
  ]))
}

async function flushCloudDataBatch(): Promise<void> {
  cloudDataBatchScheduled = false
  const entries = new Map(cloudDataBatch)
  cloudDataBatch.clear()
  if (!entries.size) return

  const requestedTables = [...entries.keys()]
  const tables = [...requestedTables]
  if (requestedTables.some(tabla => ONLINE_IMAGE_TABLES.has(tabla)) && !tables.includes(ONLINE_IMAGE_METADATA_TABLE)) {
    tables.push(ONLINE_IMAGE_METADATA_TABLE)
  }

  let loads: Map<string, CloudTableLoad>
  if (cloudSnapshotUnsupported) {
    loads = await fetchTablesIndividually(tables)
  } else {
    try {
      loads = await fetchSnapshotTables(tables)
    } catch (error) {
      const status = Number((error as { status?: number })?.status || 0)
      if ([404, 405, 501].includes(status)) cloudSnapshotUnsupported = true
      // Un fallo parcial nunca se mezcla con el snapshot: todas las tablas se
      // vuelven a leer individualmente para evitar entregar filas incompletas.
      loads = await fetchTablesIndividually(tables)
    }
  }

  const metadataLoad = loads.get(ONLINE_IMAGE_METADATA_TABLE)
  const metadata = metadataLoad?.status === 'fulfilled' ? metadataLoad.rows : []
  if (metadataLoad?.status === 'fulfilled' && !entries.has(ONLINE_IMAGE_METADATA_TABLE)) {
    cloudDataCache.set(ONLINE_IMAGE_METADATA_TABLE, { rows: metadata, fetchedAt: Date.now() })
  }
  for (const [tabla, entry] of entries) {
    const load = loads.get(tabla)
    if (!load || load.status === 'rejected') {
      entry.reject(load?.status === 'rejected' ? load.reason : new Error(`No se pudo cargar ${tabla}`))
      continue
    }
    entry.resolve(hydrateOnlineImageRows(tabla, load.rows, metadata))
  }
}

function fetchAllUncached(tabla: string): Promise<any[]> {
  return new Promise((resolve, reject) => {
    cloudDataBatch.set(tabla, { resolve, reject })
    if (cloudDataBatchScheduled) return
    cloudDataBatchScheduled = true
    queueMicrotask(() => { void flushCloudDataBatch() })
  })
}

async function fetchAll(tabla: string): Promise<any[]> {
  // Usuarios contiene permisos de seguridad: siempre se consulta fresco y no
  // se reutiliza una respuesta anterior cuando la API no esta disponible.
  const cached = tabla === 'usuarios' ? undefined : cloudDataCache.get(tabla)
  if (cached && Date.now() - cached.fetchedAt < CLOUD_DATA_CACHE_TTL_MS) return cached.rows
  const pending = cloudDataFetches.get(tabla)
  if (pending) return pending

  const request = fetchAllUncached(tabla)
    .then(async rows => {
      // Siempre consultamos la API. Si una tabla que tenia registros llega
      // vacia una sola vez, verificamos antes de borrar la vista del usuario.
      if (rows.length === 0 && cached?.rows.length) {
        await new Promise(resolve => setTimeout(resolve, 300))
        rows = await fetchTableRowsIndividualWithImages(tabla)
      }
      cloudDataCache.set(tabla, { rows, fetchedAt: Date.now() })
      return rows
    })
    .catch(error => {
      if (cached) return cached.rows
      throw error
    })
    .finally(() => cloudDataFetches.delete(tabla))
  cloudDataFetches.set(tabla, request)
  return request
}

type CuadresQuery = { almacenUid?: string; limit?: number; desde?: string; hasta?: string }

async function fetchCuadres(query: CuadresQuery = {}): Promise<any[]> {
  await ensureOnlineTable('cuadres')
  const limit = query.desde || query.hasta ? 0 : Math.max(1, Math.min(Number(query.limit || 10), 100))
  const pageSize = limit ? Math.max(25, limit) : 100
  const rows: any[] = []

  for (let page = 1; ; page++) {
    const response = await readCloudTable('cuadres', `/cuadres?page=${page}&limit=${pageSize}`)
    if (!Array.isArray(response?.data)) throw new Error('TM Cloud devolvio una respuesta invalida para cuadres')
    const batch = response.data
    rows.push(...batch.filter((row: any) => {
      const sameStore = !query.almacenUid || !row.almacen_uid || String(row.almacen_uid) === String(query.almacenUid)
      const date = String(row.created_at || row.fecha || '').slice(0, 10)
      return sameStore && (!query.desde || date >= query.desde) && (!query.hasta || date <= query.hasta)
    }))

    const pages = Number(response?.meta?.pages || 0)
    if ((limit && rows.length >= limit) || response?.meta?.mode === 'all' || (pages && page >= pages) || (!pages && batch.length < pageSize)) break
  }

  rows.sort((a, b) => String(b.created_at || b.fecha || '').localeCompare(String(a.created_at || a.fecha || '')))
  return limit ? rows.slice(0, limit) : rows
}

function invalidateCloudData(tabla: string) {
  cloudDataCache.delete(tabla)
}

function invalidateCloudDataFromEvent(event: Event) {
  const tabla = String((event as CustomEvent)?.detail?.table || '').trim().toLowerCase()
  if (tabla) invalidateCloudData(tabla)
}
const ONLINE_IMAGE_METADATA_TABLE = 'datos_config'
const ONLINE_IMAGE_PREFIX = '__tmpos_imagen__:'
const ONLINE_IMAGE_TABLES = new Set(['accesorios', 'telefonos', 'electrodomesticos', 'piezas', 'clientes', 'usuarios'])

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
  invalidateCloudData(ONLINE_IMAGE_METADATA_TABLE)
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
  if (!cloudInvalidationListenerInstalled) {
    window.addEventListener('tmcloud:table-changed', invalidateCloudDataFromEvent)
    cloudInvalidationListenerInstalled = true
  }

  const onlineDb = {
    getAll: async (tablaValue: string): Promise<ApiResult<any[]>> => {
      if (isLocalTable(tablaValue)) return localDb.getAll(tablaValue)
      try { return { success: true, data: await fetchAll(tableName(tablaValue)) } }
      catch (error: any) { return { success: false, error: error.message } }
    },
    getCuadres: async (query: CuadresQuery = {}): Promise<ApiResult<any[]>> => {
      try { return { success: true, data: await fetchCuadres(query) } }
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
        invalidateCloudData(tabla)
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
        await ensureOnlineTable(tabla, record)
        if (Object.keys(record).length) {
          await cloudRequest(`/${encodeURIComponent(tabla)}/${encodeURIComponent(String(key))}`, { method: 'PUT', body: JSON.stringify(record) }, true)
        }
        if (ONLINE_IMAGE_TABLES.has(tabla) && hasImage) await saveOnlineImage(tabla, current.uid || current.id, image)
        invalidateCloudData(tabla)
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
        invalidateCloudData(tabla)
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
      if (['db:insertCloud', 'db:updateCloud', 'db:deleteLocalOnly'].includes(channel)) return localElectron.invoke(channel, ...args)
      if (channel.startsWith('db:') && isLocalTable(args[0])) return localElectron.invoke(channel, ...args)
      if (isLocalChannel(channel)) return localElectron.invoke(channel, ...args)
      if (channel === 'consultaservidor' && ['getAllConfig', 'tableExists', 'getTableColumns', 'crearTabla', 'addColumnToTable', 'eliminarTabla', 'getAllTables'].includes(String(args[0] || ''))) return localElectron.invoke(channel, ...args)
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
