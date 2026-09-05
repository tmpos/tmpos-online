import * as tmc from './tmCloudClient'

const delay = (ms: number) => new Promise(r => setTimeout(r, ms))
// Las credenciales SMTP son configuracion sensible de cada instalacion. No se
// descargan ni se sobrescriben mediante sincronizacion o realtime.
const LOCAL_SYSTEM_TABLES = ['configuracion', 'tmcloud_config', 'sync_deletes', 'bitacora', 'licencia', 'correo', 'otp_local_config']
const GLOBAL_BUSINESS_TABLES = new Set(['usuarios', 'bancos', 'banco_transacciones'])
// En modo solo-online los usuarios se leen y escriben directamente en la API.
// Solo la identidad esencial de la empresa conserva una copia local sincronizable.
const ONLINE_ONLY_SYNCED_LOCAL_TABLES = new Set(['empresa'])

export function shouldSkipOnlineOnlyRowPush(tabla: string, onlineOnly: boolean): boolean {
  return onlineOnly && !ONLINE_ONLY_SYNCED_LOCAL_TABLES.has(tabla)
}
const VENTAS_PAUSADAS_CLOUD_COLUMNS = [
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
]
const APARIENCIA_ALMACEN_CLOUD_COLUMNS = [
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
]
const CUADRES_CLOUD_COLUMNS = [
  { name: 'uid', type: 'TEXT' },
  { name: 'fecha', type: 'TEXT' },
  { name: 'turno_id', type: 'INTEGER', default: 0, indexed: true },
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
  { name: 'almacen_id', type: 'INTEGER', default: 0 },
  { name: 'almacen_uid', type: 'TEXT', indexed: true },
  { name: 'created_at', type: 'DATETIME' },
  { name: 'updated_at', type: 'DATETIME' },
]

// imei depende de telefonos (telefono_uid) y serial depende de electrodomesticos
// (equipo_uid): upsertLocal busca el id local del "padre" para resolver id_equi
// en el momento en que procesa la fila. El servidor devuelve las tablas en
// orden alfabetico, asi que en una instalacion nueva "imei" se procesaba antes
// que "telefonos" -- la tabla local aun estaba vacia, y CADA imei quedaba con
// id_equi null para siempre (nada vuelve a marcarlos como "cambiados" en
// sincronizaciones futuras, asi que nunca se autocorregian). Esta prioridad
// obliga a procesar primero las tablas "padre".
const TABLE_DEPENDENCY_PRIORITY: Record<string, number> = {
  // Primero se deja utilizable la instalacion: identidad de la tienda,
  // usuarios, catalogo e inventario. El proyecto puede contener mas de cien
  // tablas historicas y no tiene sentido esperar a todas para ver el POS.
  empresa: -100,
  almacenes: -99,
  usuarios: -98,
  clientes: -97,
  proveedores: -96,
  categorias: -95,
  marcas: -95,
  telefonos: -90,
  electrodomesticos: -90,
  accesorios: -89,
  piezas: -89,
  imei: -88,
  serial: -88,
  bancos: -87,
  metodos_pago: -87,
  facturas: -80,
  cuentas_cobrar: -79,
  cuentas_pagar: -79,
}

export function sortTablesByDependency<T>(items: T[], getName: (item: T) => string): T[] {
  return [...items].sort((a, b) => (TABLE_DEPENDENCY_PRIORITY[getName(a)] ?? 0) - (TABLE_DEPENDENCY_PRIORITY[getName(b)] ?? 0))
}

function normalizeProductName(value: unknown): string {
  return String(value || '').trim().replace(/\s+/g, ' ').toUpperCase()
}

export function findPhoneForImei(imei: any, telefonos: any[]): any | null {
  const telefonoUid = String(imei?.telefono_uid || '').trim()
  if (telefonoUid) {
    const byUid = telefonos.find((telefono: any) => String(telefono.uid || '') === telefonoUid)
    if (byUid) return byUid
  }

  const nombreEquipo = normalizeProductName(imei?.equipo)
  if (nombreEquipo) {
    const almacenUid = String(imei?.almacen_uid || '').trim()
    const byName = telefonos.filter((telefono: any) =>
      normalizeProductName(telefono.nombre) === nombreEquipo
      && (!almacenUid || String(telefono.almacen_uid || '') === almacenUid),
    )
    if (byName.length === 1) return byName[0]
  }

  const localId = Number(imei?.id_equi || 0)
  if (localId > 0) {
    const byId = telefonos.find((telefono: any) => Number(telefono.id) === localId)
    if (byId) return byId
  }
  return null
}

// Red de seguridad ademas del orden de descarga: si por cualquier motivo un
// imei/serial quedo con id_equi vacio pero ya tiene el uid del telefono o
// electrodomestico (telefono_uid/equipo_uid), lo reconecta usando lo que haya
// localmente en ese momento. Barato de correr siempre: si no hay nada roto,
// no actualiza nada.
async function repairRelationalLinks(): Promise<void> {
  try {
    const [imeiRows, telefonos] = await Promise.all([getLocalRows('imei'), getLocalRows('telefonos')])
    for (const imei of imeiRows) {
      if (imei.id_equi) continue
      const telefono = findPhoneForImei(imei, telefonos)
      if (!telefono) continue
      await (window as any).electron.invoke('db:updateCloud', 'imei', imei.id, {
        id_equi: telefono.id,
        telefono_uid: String(telefono.uid || ''),
        equipo: telefono.nombre || imei.equipo || '',
      })
    }
  } catch { /* se reintenta en el proximo ciclo */ }

  try {
    const [serialRows, electrodomesticos] = await Promise.all([getLocalRows('serial'), getLocalRows('electrodomesticos')])
    const equiposByUid = new Map(electrodomesticos.filter((t: any) => t.uid).map((t: any) => [String(t.uid), t]))
    for (const serial of serialRows) {
      if (serial.id_equi) continue
      const uid = String(serial.equipo_uid || '').trim()
      if (!uid) continue
      const equipo = equiposByUid.get(uid)
      if (!equipo) continue
      await (window as any).db.update('serial', serial.id, { id_equi: equipo.id, equipo: equipo.nombre || serial.equipo || '' })
    }
  } catch { /* se reintenta en el proximo ciclo */ }
}

const SYSTEM_TABLE_DEFS: Record<string, string[]> = {
  configuracion: ['id INTEGER PRIMARY KEY AUTOINCREMENT', 'clave TEXT UNIQUE NOT NULL', 'valor TEXT DEFAULT ""', 'tipo TEXT DEFAULT "string"', 'categoria TEXT DEFAULT "general"', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
  tmcloud_config: ['id INTEGER PRIMARY KEY AUTOINCREMENT', 'url TEXT NOT NULL DEFAULT ""', 'public_key TEXT NOT NULL DEFAULT ""', 'secret_key TEXT NOT NULL DEFAULT ""', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
  sync_deletes: ['id INTEGER PRIMARY KEY AUTOINCREMENT', 'tabla TEXT NOT NULL', 'uid TEXT NOT NULL', 'confirmado INTEGER DEFAULT 0', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
  bitacora: ['id INTEGER PRIMARY KEY AUTOINCREMENT', 'tabla TEXT DEFAULT ""', 'registro_id INTEGER DEFAULT 0', 'accion TEXT DEFAULT ""', 'usuario TEXT DEFAULT ""', 'datos_nuevos TEXT DEFAULT ""', 'datos_anteriores TEXT DEFAULT ""', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
  licencia: ['id INTEGER PRIMARY KEY AUTOINCREMENT', 'licencia_equipo TEXT', 'licencia_cifrada TEXT', 'estado TEXT DEFAULT "sin_verificar"', 'nombre_empresa TEXT', 'fecha_inicio_prueba TEXT', 'fecha_vencimiento TEXT', 'ultima_verificacion TEXT', 'api_key TEXT', 'datos_servidor TEXT', 'created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP', 'updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP'],
}

interface ServerColumn {
  name: string
  type: string
  nullable?: boolean
  primary?: boolean
  pk?: boolean
  notnull?: boolean
}

interface ServerTableInfo {
  name: string
  count: number
  columns: ServerColumn[]
}

export type SyncMode = 'offline' | 'online' | 'ambos'

export interface SyncDetail {
  tabla: string
  downloaded: number
  uploaded: number
  errors: number
  errorMessages?: string[]
}

export interface SyncResult {
  success: boolean
  inserts: number
  updates: number
  errors: number
  message: string
  details?: SyncDetail[]
}

export interface SyncStatus {
  running: boolean
  tabla?: string
  progreso?: string
  error?: string
  lastSync?: string
  mode?: SyncMode
  result?: SyncResult
  details?: SyncDetail[]
  realtime?: boolean
}

let intervalId: ReturnType<typeof setInterval> | null = null
let realtimeStop: (() => void) | null = null
let syncingInProgress = false
// Permite invalidar inicializaciones asincronas que comenzaron antes de un
// cambio de licencia. Sin esta guarda, el init del arranque podia terminar
// despues de stopAutoSync() y sincronizar datos del negocio anterior.
let autoSyncGeneration = 0
let realtimeConnected = false
let currentMode: SyncMode = 'ambos'
let onStatusChange: ((status: SyncStatus) => void) | null = null
let onSyncComplete: ((details: SyncDetail[]) => void) | null = null

export function setStatusCallback(cb: (status: SyncStatus) => void) {
  onStatusChange = cb
}

export function setSyncCompleteCallback(cb: (details: SyncDetail[]) => void) {
  onSyncComplete = cb
}

export function setSyncMode(mode: SyncMode) {
  currentMode = mode
}

export function getSyncMode(): SyncMode {
  return currentMode
}

export function isOnline(): boolean {
  return currentMode !== 'offline' && tmc.isConnected()
}

export function isRealtimeConnected(): boolean {
  return realtimeConnected
}

export function isConfirmedCloudDelete(row: any): boolean {
  return Number(row?.confirmado || 0) === 1
}

function notify(status: SyncStatus) {
  onStatusChange?.(status)
}

function notifyLocalRealtimeChange(eventType: 'INSERT' | 'UPDATE', tabla: string, uid?: string) {
  window.dispatchEvent(new CustomEvent('tmcloud:local-change', {
    detail: { eventType, table: tabla, uid },
  }))
}

function nowSql(): string {
  return new Date().toISOString().slice(0, 19).replace('T', ' ')
}

async function getConfigValue(key: string): Promise<string> {
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (!res.success || !Array.isArray(res.data)) return ''
    return res.data.find((row: any) => row.clave === key)?.valor || ''
  } catch {
    return ''
  }
}

async function setConfigValue(key: string, value: string): Promise<void> {
  const res = await (window as any).db.getAll('configuracion')
  if (!res.success || !Array.isArray(res.data)) return
  const row = res.data.find((item: any) => item.clave === key)
  if (row) {
    await (window as any).db.update('configuracion', row.id, { valor: value })
  } else {
    await (window as any).db.insert('configuracion', {
      clave: key,
      valor: value,
      tipo: 'string',
      categoria: 'tmcloud',
    })
  }
}

async function ensureCloudApi(): Promise<boolean> {
  // En Electron, ensureConfigLoaded obtiene la URL del proxy local. Usar
  // loadConfig() aqui inicializaba el cliente con la URL publica directa y
  // dejaba las peticiones del renderer expuestas a CORS ("Failed to fetch").
  // Se fuerza la configuracion de ejecucion para corregir tambien una URL
  // directa que haya quedado en memoria por una inicializacion anterior.
  return Boolean(await tmc.ensureConfigLoaded(true))
}

async function reloadCloudApi(): Promise<boolean> {
  tmc.resetConfig()
  return Boolean(await tmc.ensureConfigLoaded(true))
}

async function getLocalRows(tabla: string): Promise<any[]> {
  try {
    const res = await (window as any).db.getAll(tabla)
    return res.success && Array.isArray(res.data) ? res.data : []
  } catch {
    return []
  }
}

function timestamp(row: any): string {
  return String(row?.updated_at || row?.created_at || '')
}

// El esquema local tiene columnas legado que el servidor no conoce (campos
// viejos de una integracion anterior, siempre null). Antes se comparaban los
// dos objetos completos con JSON.stringify, asi que esas columnas de mas
// hacian que CUALQUIER fila descargada pareciera "distinta" aunque nada
// hubiera cambiado realmente -- por eso una sincronizacion podia reportar
// "144 imei actualizados" sin que el usuario hubiera tocado nada. Ahora solo
// se comparan los campos que realmente vienen en la fila del servidor.
const IGNORED_COMPARE_FIELDS = new Set(['id', '_rowId', 'created_at', 'updated_at'])

function sameData(existing: any, incoming: any): boolean {
  for (const key of Object.keys(incoming || {})) {
    if (IGNORED_COMPARE_FIELDS.has(key)) continue
    const local = existing?.[key] ?? null
    const remote = incoming[key] ?? null
    if (String(local) !== String(remote)) return false
  }
  return true
}

interface CloudSyncChanges {
  updated: any[]
  // El endpoint /sync?since= devuelve cada borrado como un objeto
  // { uid, data, deleted_at }, no como un string suelto.
  deleted: Array<{ uid: string } | string>
}

// Devuelve null cuando la descarga realmente fallo (error de red, servidor
// caido, respuesta invalida) para que el llamador NO avance la marca de
// "ultimo_sync_tm". Si esa marca avanzara igual en un fallo, un borrado o
// cambio ocurrido justo en ese momento quedaria fuera de rango en el
// proximo "since" y nunca se volveria a descargar (revive/queda "pegado").
// Solo se devuelve {} cuando el servidor confirmo una respuesta valida sin
// cambios pendientes.
async function fetchCloudSyncAll(since?: string): Promise<Record<string, CloudSyncChanges> | null> {
  const api = tmc.getCloudApi()
  if (!api) throw new Error('TM Cloud no configurado')
  const url = since
    ? `${api.url}/sync?since=${encodeURIComponent(since)}`
    : `${api.url}/sync`
  try {
    const res = await fetch(url, { headers: tmc.authHeaders(api.key) })
    if (!res.ok) {
      return null
    }
    const json = await res.json()
    // Try various possible response shapes:
    //   1. { changes: { table: { updated, deleted } } }
    //   2. { data: { changes: { table: { updated, deleted } } } }
    //   3. { data: { table: { updated, deleted } } }
    const raw = json.changes || json.data?.changes || json.data
    if (!raw || typeof raw !== 'object') return null
    return raw as Record<string, CloudSyncChanges>
  } catch { return null }
}

async function fetchCloudRows(tabla: string, since?: string): Promise<any[]> {
  const api = tmc.getCloudApi()
  if (!api) throw new Error('TM Cloud no configurado')

  // try sync endpoint first (incremental), fallback to paginated fetch
  if (since) {
    try {
      const res = await fetch(
        `${api.url}/${encodeURIComponent(tabla)}/sync?from=${encodeURIComponent(since)}`,
        { headers: tmc.authHeaders(api.key) },
      )
      if (res.ok) return (await res.json()).data || []
    } catch {
      // fall through
    }
  }

  const all: any[] = []
  let page = 1
  while (true) {
    let res: Response | null = null
    for (let intento = 0; intento < 5; intento++) {
      res = await fetch(
        `${api.url}/${encodeURIComponent(tabla)}?page=${page}&limit=100`,
        { headers: tmc.authHeaders(api.key) },
      )
      if (res.status !== 429) break
      await delay(1500 * (intento + 1))
    }
    if (!res) throw new Error(`No se pudo descargar ${tabla}`)
    if (!res.ok) {
      if (res.status === 400 || res.status === 404) return []
      throw new Error(await tmc.responseError(res))
    }
    const json = await res.json()
    const rows = json.data || []
    all.push(...rows)
    const totalPages = json.meta?.pages || Math.ceil((json.meta?.total || 1) / 100)
    if (page >= totalPages || rows.length < 100) break
    page++
  }
  return all
}

export async function fetchServerSchema(): Promise<ServerTableInfo[]> {
  return fetchServerFullSchema()
}

// El esquema remoto casi nunca cambia entre un ciclo de sync y el siguiente,
// pero antes se pedia de nuevo por completo (GET /schema) en CADA sincronizacion
// periodica Y en CADA guardado individual que usa pushLocalRowToCloud (el cual
// se llama despues de casi cualquier alta/edicion en la app). En una sesion
// activa eso significaba decenas de peticiones identicas por minuto. Se cachea
// por un rato corto para no saturar el servidor sin dejar de detectar cambios
// reales de esquema en un tiempo razonable.
const SCHEMA_CACHE_TTL_MS = 20000
let schemaCache: { data: ServerTableInfo[]; fetchedAt: number } | null = null
let schemaLastError = ''

export function invalidateSchemaCache(): void {
  schemaCache = null
}

async function fetchServerFullSchema(): Promise<ServerTableInfo[]> {
  if (schemaCache && Date.now() - schemaCache.fetchedAt < SCHEMA_CACHE_TTL_MS) {
    return schemaCache.data
  }
  const api = tmc.getCloudApi()
  if (!api) return []
  let lastError = ''
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      const res = await fetch(`${api.url}/schema`, { headers: tmc.authHeaders(api.key) })
      if (res.ok) {
        const json = await res.json()
        const data = json.data || {}
        const parsed = Object.entries(data).map(([name, info]: [string, any]) => ({
          name,
          count: info.count || 0,
          columns: info.columns || [],
        }))
        if (parsed.length > 0) {
          schemaCache = { data: parsed, fetchedAt: Date.now() }
          schemaLastError = ''
          return parsed
        }
        lastError = 'El servidor devolvio un esquema vacio'
      } else {
        lastError = await tmc.responseError(res)
        const transient = res.status === 429 || res.status >= 500
        if (!transient) break
      }
    } catch (error: any) {
      lastError = error?.message || 'Error de conexion obteniendo el esquema'
    }
    if (attempt < 4) await delay(1500 * (attempt + 1))
  }
  schemaLastError = lastError
  console.error('[TM Cloud] No se pudo obtener el esquema:', lastError)
  return schemaCache?.data || []
}

export async function ensureVentasPausadasCloudTable(): Promise<boolean> {
  if (!await ensureCloudApi()) return false
  const actual = await fetchServerFullSchema()
  if (actual.some(tabla => tabla.name === 'ventas_pausadas')) return true
  const api = tmc.getCloudWriteApi()
  if (!api) return false
  try {
    const res = await fetch(`${api.url}/schema/tables/batch`, {
      method: 'POST',
      headers: tmc.authHeaders(api.key, true),
      body: JSON.stringify({ tables: [{ name: 'ventas_pausadas', columns: VENTAS_PAUSADAS_CLOUD_COLUMNS }] }),
    })
    if (!res.ok) return false
    invalidateSchemaCache()
    return (await fetchServerFullSchema()).some(tabla => tabla.name === 'ventas_pausadas')
  } catch {
    return false
  }
}

export async function ensureAparienciaAlmacenCloudTable(): Promise<boolean> {
  if (!await ensureCloudApi()) return false
  const actual = await fetchServerFullSchema()
  const existente = actual.find(tabla => tabla.name === 'apariencia_almacen')
  if (existente && APARIENCIA_ALMACEN_CLOUD_COLUMNS.every(columna =>
    existente.columns?.some(actualColumna => actualColumna.name === columna.name),
  )) return true
  const api = tmc.getCloudWriteApi()
  if (!api) return false
  try {
    const res = await fetch(`${api.url}/schema/tables/batch`, {
      method: 'POST',
      headers: tmc.authHeaders(api.key, true),
      body: JSON.stringify({ tables: [{ name: 'apariencia_almacen', columns: APARIENCIA_ALMACEN_CLOUD_COLUMNS }] }),
    })
    if (!res.ok) return false
    invalidateSchemaCache()
    const actualizada = (await fetchServerFullSchema()).find(tabla => tabla.name === 'apariencia_almacen')
    return Boolean(actualizada && APARIENCIA_ALMACEN_CLOUD_COLUMNS.every(columna =>
      actualizada.columns?.some(actualColumna => actualColumna.name === columna.name),
    ))
  } catch {
    return false
  }
}

export async function ensureCuadresCloudTable(): Promise<boolean> {
  if (!await ensureCloudApi()) return false
  const actual = await fetchServerFullSchema()
  const existente = actual.find(tabla => tabla.name === 'cuadres')
  if (existente && CUADRES_CLOUD_COLUMNS.every(columna =>
    existente.columns?.some(actualColumna => actualColumna.name === columna.name),
  )) return true
  const api = tmc.getCloudWriteApi()
  if (!api) return false
  try {
    const res = await fetch(`${api.url}/schema/tables/batch`, {
      method: 'POST',
      headers: tmc.authHeaders(api.key, true),
      body: JSON.stringify({ tables: [{ name: 'cuadres', columns: CUADRES_CLOUD_COLUMNS }] }),
    })
    if (!res.ok) return false
    invalidateSchemaCache()
    const actualizada = (await fetchServerFullSchema()).find(tabla => tabla.name === 'cuadres')
    return Boolean(actualizada && CUADRES_CLOUD_COLUMNS.every(columna =>
      actualizada.columns?.some(actualColumna => actualColumna.name === columna.name),
    ))
  } catch {
    return false
  }
}

function columnsToSqlDefs(cols: ServerColumn[]): string[] {
  return cols.map(c => {
    let def = `${c.name} ${c.type}`
    if (c.pk) def += ' PRIMARY KEY'
    if (c.notnull) def += ' NOT NULL'
    return def
  })
}

function inferColumnsFromRows(rows: any[]): ServerColumn[] {
  const names = new Set<string>()
  for (const row of rows) {
    for (const name of Object.keys(row || {})) {
      if (/^[A-Za-z_][A-Za-z0-9_]*$/.test(name)) names.add(name)
    }
  }
  // upsertLocal no copia el id remoto: cada snapshot necesita su propia clave
  // numerica local para poder actualizarse y eliminarse posteriormente.
  names.delete('id')
  return [
    { name: 'id', type: 'INTEGER', pk: true },
    ...Array.from(names).map(name => ({ name, type: 'TEXT' })),
  ]
}

async function recreateLocalTable(tabla: string, columns: ServerColumn[]): Promise<boolean> {
  try {
    await (window as any).electron?.invoke('consultaservidor', 'eliminarTabla', tabla)
    const colDefs = columnsToSqlDefs(columns)
    await (window as any).electron?.invoke('consultaservidor', 'crearTabla', tabla, colDefs)
    return true
  } catch {
    return false
  }
}

async function upsertLocal(tabla: string, cloudRow: any, preloadedRows?: any[]): Promise<'inserted' | 'updated' | 'skipped'> {
  const localRows = preloadedRows ?? await getLocalRows(tabla)
  let existing = localRows.find((row: any) => row.uid === cloudRow.uid)
  // Una instalacion nueva crea usuarios iniciales con UID local. Al recibir los
  // definitivos desde la API se reconcilian por email/usuario para no duplicar
  // cuentas ni dejar que el registro inicial oculte al registro remoto.
  if (!existing && tabla === 'usuarios') {
    const email = String(cloudRow.email || '').trim().toLowerCase()
    const usuario = String(cloudRow.usuario || '').trim().toLowerCase()
    existing = localRows.find((row: any) =>
      (email && String(row.email || '').trim().toLowerCase() === email) ||
      (usuario && String(row.usuario || '').trim().toLowerCase() === usuario)
    )
  }
  const cleanRow = { ...cloudRow }
  // Los usuarios pertenecen al proyecto completo, no a un almacen. Se
  // descartan campos heredados de instalaciones que los asociaban a una sede.
  if (GLOBAL_BUSINESS_TABLES.has(tabla)) {
    delete cleanRow.almacen_id
    delete cleanRow.almacen_uid
  }
  if (tabla === 'imei') {
    // Los IDs numericos locales no son portables entre equipos. La nube puede
    // traer id_equi vacio, decimal o con un ID de otra PC; nunca debe insertarse
    // directamente porque viola la FK local y descarta el IMEI completo.
    const telefonos = await getLocalRows('telefonos')
    const telefono = findPhoneForImei(cleanRow, telefonos)
    cleanRow.id_equi = telefono ? telefono.id : null
    cleanRow.telefono_uid = telefono ? String(telefono.uid || '') : ''
    if (!cleanRow.nombre) cleanRow.nombre = cleanRow.imei || ''
  }
  if (tabla === 'serial') {
    const equipoUid = String(cleanRow.equipo_uid || '').trim()
    const equipos = equipoUid ? await getLocalRows('electrodomesticos') : []
    const equipo = equipos.find((item: any) => String(item.uid || '') === equipoUid)
    cleanRow.id_equi = equipo ? equipo.id : null
    if (!cleanRow.equipo && equipo) cleanRow.equipo = equipo.nombre || ''
    if (!cleanRow.nombre) cleanRow.nombre = cleanRow.serial || ''
  }
  if (tabla === 'accesorios') {
    // marca, categoria y proveedor_id son IDs SQLite locales y no son
    // portables entre equipos. Las tablas padre se descargan primero; aun asi,
    // una referencia que no exista localmente no debe impedir que se importe
    // el accesorio completo.
    const [marcas, categorias, proveedores] = await Promise.all([
      cleanRow.marca ? getLocalRows('marcas') : [],
      cleanRow.categoria ? getLocalRows('categorias') : [],
      cleanRow.proveedor_id ? getLocalRows('proveedores') : [],
    ])
    if (cleanRow.marca && !marcas.some((marca: any) => Number(marca.id) === Number(cleanRow.marca))) cleanRow.marca = null
    if (cleanRow.categoria && !categorias.some((categoria: any) => Number(categoria.id) === Number(cleanRow.categoria))) cleanRow.categoria = null
    if (cleanRow.proveedor_id && !proveedores.some((proveedor: any) => Number(proveedor.id) === Number(cleanRow.proveedor_id))) cleanRow.proveedor_id = null
  }
  delete cleanRow.id
  if (!existing) {
    const result = await (window as any).electron.invoke('db:insertCloud', tabla, cleanRow)
    if (!result.success) throw new Error(result.error || `No se pudo insertar en ${tabla}`)
    return 'inserted'
  }
  if (sameData(existing, cleanRow) || (existing.uid === cleanRow.uid && timestamp(existing) >= timestamp(cleanRow))) return 'skipped'
  const result = await (window as any).electron.invoke('db:updateCloud', tabla, existing.id, cleanRow)
  if (!result.success) throw new Error(result.error || `No se pudo actualizar ${tabla}`)
  return 'updated'
}

async function applyRealtimeChange(payload: any): Promise<void> {
  const tabla = String(payload?.table || '')
  if (!tabla || LOCAL_SYSTEM_TABLES.includes(tabla)) return
  // El servidor TMPBASE envia { type: 'event', event: 'record.deleted'|'record.created'|'record.updated',
  // table, record, created_at }. El campo "type" siempre vale literalmente "event" (es el
  // discriminador del mensaje de websocket, no el tipo de cambio); el tipo de cambio real
  // esta en "event", y el registro completo (con su uid) viene siempre en "record".
  const event = String(payload?.event || '').toLowerCase()
  const record = payload?.record
  const recordUid = record?.uid
  if (!recordUid) return

  if (event === 'record.deleted') {
    const local = (await getLocalRows(tabla)).find((row: any) => row.uid === recordUid)
    if (local) {
      await deleteLocalFromRealtime(tabla, local.id)
      window.dispatchEvent(new CustomEvent('tmcloud:table-changed', { detail: { table: tabla, updated: 0, deleted: 1 } }))
    }
    notify({ running: false, tabla, progreso: `Realtime DELETE ${tabla}`, realtime: true })
    return
  }

  if (event === 'record.created' || event === 'record.updated') {
    const action = await upsertLocal(tabla, record)
    if (action === 'inserted' || action === 'updated') {
      notifyLocalRealtimeChange(event === 'record.created' ? 'INSERT' : 'UPDATE', tabla, recordUid)
      window.dispatchEvent(new CustomEvent('tmcloud:table-changed', { detail: { table: tabla, updated: 1, deleted: 0 } }))
    }
    notify({ running: false, tabla, progreso: `Realtime ${event} ${tabla}`, realtime: true })
  }
}

async function deleteLocalFromRealtime(tabla: string, id: number): Promise<void> {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) throw new Error('Tabla invalida en realtime')
  const result = await (window as any).electron?.invoke('db:deleteLocalOnly', tabla, Number(id))
  if (result && result.success === false) throw new Error(result.error || `No se pudo borrar ${tabla}`)
}

export async function startRealtime() {
  stopRealtime()
  if (!await ensureCloudApi() || currentMode === 'offline') return false
  realtimeStop = tmc.subscribeRealtime(
    (payload) => {
      applyRealtimeChange(payload).catch((error) => {
        notify({ running: false, error: error?.message || 'Error aplicando realtime', realtime: false })
      })
    },
    () => {
      // El navegador (EventSource) reintenta esta conexion indefinidamente cada
      // pocos segundos por diseno. El endpoint /realtime aun no existe en el
      // servidor, asi que ese reintento nunca puede tener exito: dejarlo activo
      // solo genera trafico continuo contra el servidor sin ningun beneficio.
      // Se corta la conexion en el primer error y se sigue solo con el polling
      // periodico (executeSync), que ya es el mecanismo que mantiene todo
      // sincronizado.
      stopRealtime()
      notify({ running: false, error: 'Realtime no disponible; usando solo sincronizacion periodica', realtime: false })
    },
  )
  realtimeConnected = true
  notify({ running: false, progreso: 'Realtime conectado', realtime: true })
  return true
}

export function stopRealtime() {
  if (realtimeStop) realtimeStop()
  realtimeStop = null
  realtimeConnected = false
}

async function upsertCloud(tabla: string, rows: any[]): Promise<{ inserted: number; updated: number; errors: number; error?: string }> {
  const api = tmc.getCloudWriteApi()
  if (!api || rows.length === 0) return { inserted: 0, updated: 0, errors: 0 }

  let inserted = 0
  let updated = 0
  let errors = 0
  let error = ''
  for (let offset = 0; offset < rows.length; offset += 500) {
    const batch = rows.slice(offset, offset + 500).map(row => {
      const record = tmc.cleanRecord(row)
      if (tabla === 'usuarios') {
        delete record.almacen_id
        delete record.almacen_uid
      } else if (tabla === 'bancos') {
        record.almacen_id = 0
        record.almacen_uid = ''
      }
      if (tabla === 'gastos') delete record.turno_id
      if (tabla === 'imei') {
        if (record.telefono_uid) record.id_equi = record.telefono_uid
        delete record.telefono_uid
      }
      if (tabla === 'serial') delete record.id_equi
      return record
    })
    const res = await fetch(`${api.url}/${encodeURIComponent(tabla)}/upsert`, {
      method: 'POST',
      headers: tmc.authHeaders(api.key, true),
      body: JSON.stringify({ rows: batch }),
    })
    if (!res.ok) {
      errors += batch.length
      error = await tmc.responseError(res)
      continue
    }
    const json = await res.json()
    inserted += json.data?.inserted || 0
    updated += json.data?.updated || 0
    errors += json.data?.failed || 0
    if (json.data?.failed) {
      error = json.data?.errors?.[0]?.error || json.data?.errors?.[0] || json.error || 'TMPBase rechazo el registro'
    }
  }
  return { inserted, updated, errors, error: error || undefined }
}

async function syncTable(tabla: string, mode: SyncMode, incremental: boolean, skipDownload = false): Promise<SyncDetail> {
  notify({ running: true, tabla, progreso: `Sincronizando ${tabla}...`, mode })
  const lastSync = incremental ? await getConfigValue(`last_sync_${tabla}`) : ''
  const localBeforeDownload = await getLocalRows(tabla)
  const cloudByUid = new Map<string, any>()
  let downloaded = 0
  let uploaded = 0
  let errors = 0

  if (mode === 'ambos' && !skipDownload) {
    try {
      const cloudRows = await fetchCloudRows(tabla, lastSync || undefined)
      for (const row of cloudRows) {
        if (row.uid) cloudByUid.set(row.uid, row)
        try {
          const action = await upsertLocal(tabla, row, localBeforeDownload)
          if (action !== 'skipped') downloaded++
        } catch {
          errors++
        }
      }
    } catch {
      errors++
    }
  }

  {
    const candidates = incremental && lastSync
      ? localBeforeDownload.filter(row => timestamp(row) > lastSync)
      : localBeforeDownload
    const changedRows = candidates.filter(row => {
      const cloud = cloudByUid.get(row.uid)
      return !cloud || timestamp(row) > timestamp(cloud)
    })
    const result = await upsertCloud(tabla, changedRows)
    uploaded = result.inserted + result.updated
    errors += result.errors
  }

  await setConfigValue(`last_sync_${tabla}`, nowSql())
  return { tabla, downloaded, uploaded, errors }
}

async function syncDeletes(): Promise<number> {
  const api = tmc.getCloudWriteApi()
  if (!api) return 0
  const rows = await getLocalRows('sync_deletes')
  let deleted = 0
  for (const row of rows) {
    // Las colas creadas antes de esta proteccion no prueban que el usuario
    // pidio borrar el registro. Se descartan localmente sin tocar TM Cloud.
    if (!isConfirmedCloudDelete(row)) {
      await (window as any).electron.invoke('db:deleteLocalOnly', 'sync_deletes', row.id)
      continue
    }
    if (row.tabla === 'sync_deletes') {
      await (window as any).electron.invoke('db:deleteLocalOnly', 'sync_deletes', row.id)
      continue
    }
    const uid = row.uid_registro || row.registro_uid || row.uid
    if (!row.tabla || !uid) continue
    try {
      const res = await fetch(
        `${api.url}/${encodeURIComponent(row.tabla)}/${encodeURIComponent(String(uid))}`,
        { method: 'DELETE', headers: tmc.authHeaders(api.key) },
      )
      if (res.ok || res.status === 404 || res.status === 400) {
        await (window as any).electron.invoke('db:deleteLocalOnly', 'sync_deletes', row.id)
        deleted++
      }
    } catch { /* Retry on the next synchronization. */ }
  }
  return deleted
}

async function ensureLocalTableExists(tabla: string, columns: ServerColumn[]): Promise<boolean> {
  try {
    const res = await (window as any).electron?.invoke('consultaservidor', 'getTableColumns', tabla, 'names')
    const localCols: string[] = Array.isArray(res) ? res : []
    if (localCols.length === 0) {
      if (!columns.length) return false
      const colDefs = columnsToSqlDefs(columns)
      const created = await (window as any).electron?.invoke('consultaservidor', 'crearTabla', tabla, colDefs)
      if (created?.success === false) throw new Error(created.error || `No se pudo crear ${tabla}`)
      return true
    }
    const serverCols = columns.filter(c => c.name !== 'id').map(c => c.name)
    const missing = serverCols.filter(c => !localCols.includes(c))
    if (!missing.length) return true
    for (const col of missing) {
      const def = columns.find(c => c.name === col)
      if (def) {
        const added = await (window as any).electron?.invoke('consultaservidor', 'addColumnToTable', tabla, col)
        if (added?.success === false) throw new Error(added.error || `No se pudo agregar ${tabla}.${col}`)
      }
    }
    return true
  } catch {
    // table doesn't exist, create it
    try {
      if (!columns.length) return false
      const colDefs = columnsToSqlDefs(columns)
      const created = await (window as any).electron?.invoke('consultaservidor', 'crearTabla', tabla, colDefs)
      if (created?.success === false) return false
      return true
    } catch { return false }
  }
}

async function executeSync(mode: SyncMode, incremental: boolean): Promise<SyncResult> {
  if (mode === 'offline') {
    return { success: true, inserts: 0, updates: 0, errors: 0, message: 'Modo offline' }
  }
  if (!await ensureCloudApi()) {
    return { success: false, inserts: 0, updates: 0, errors: 1, message: 'TM Cloud no conectado' }
  }
  await repairSystemTables()
  await ensureVentasPausadasCloudTable()
  await ensureAparienciaAlmacenCloudTable()
  await ensureCuadresCloudTable()

  const schema = await fetchServerFullSchema()
  if (!schema.length) {
    return { success: false, inserts: 0, updates: 0, errors: 1, message: `No se pudo obtener esquema del servidor${schemaLastError ? `: ${schemaLastError}` : ''}` }
  }

  // Ensure all schema tables exist locally first
  const tableSchemaMap = new Map(schema.map(t => [t.name, t]))
  for (const table of schema) {
    if (!LOCAL_SYSTEM_TABLES.includes(table.name)) {
      await ensureLocalTableExists(table.name, table.columns)
    }
  }

  const details: SyncDetail[] = []
  let totalUploaded = 0
  let totalDownloaded = 0
  let totalErrors = 0
  const completedAt = nowSql()

  // Los borrados locales pendientes deben llegar a la nube ANTES de descargar.
  // Si se descarga primero, un registro borrado localmente pero aun no borrado
  // en la nube se vuelve a insertar (upsertLocal lo trata como nuevo) y "revive".
  await syncDeletes()

  // --- DOWNLOAD from cloud (single call for ALL tables) ---
  // Si la descarga falla (red, servidor, respuesta invalida), downloadOk queda
  // en false y "ultimo_sync_tm" NO avanza: sin esto, un fallo puntual dejaba
  // el proximo "since" mas adelante en el tiempo que un borrado/cambio real,
  // y ese cambio jamas volvia a aparecer en ningun sync futuro.
  let downloadOk = true
  if (incremental) {
    // En la primera sincronizacion no existe marca local. Consultar desde el
    // inicio permite descargar el proyecto antes de intentar subir defaults.
    const lastSync = await getConfigValue('ultimo_sync_tm') || '1970-01-01 00:00:00'
    const changes = await fetchCloudSyncAll(lastSync)
      if (changes !== null) {
        const entradas = sortTablesByDependency(Object.entries(changes), ([tabla]) => tabla)
        for (const [tabla, change] of entradas) {
          if (LOCAL_SYSTEM_TABLES.includes(tabla)) continue
          let tabDownloaded = 0
          let tabDeleted = 0
          let tabErrors = 0
          // Se cargan las filas locales de esta tabla una sola vez y se
          // reutilizan para cada fila actualizada/borrada del lote, en vez de
          // volver a pedir la tabla completa por cada elemento (era el patron
          // anterior y multiplicaba las consultas IPC en tablas grandes).
          const localRows = await getLocalRows(tabla)
          const localByUid = new Map<string, any>(localRows.filter((r: any) => r.uid).map((r: any) => [r.uid, r]))
          for (const row of (Array.isArray(change?.updated) ? change.updated : [])) {
            try {
              const action = await upsertLocal(tabla, row, localRows)
              if (action !== 'skipped') tabDownloaded++
            } catch { tabErrors++ }
          }
          for (const item of (Array.isArray(change?.deleted) ? change.deleted : [])) {
            const uid = typeof item === 'string' ? item : item?.uid
            if (!uid) continue
            try {
              const local = localByUid.get(uid)
              if (local) {
                const result = await (window as any).electron.invoke('db:deleteLocalOnly', tabla, local.id)
                if (result?.success === false) throw new Error(result.error || `No se pudo borrar ${tabla} localmente`)
                tabDeleted++
              }
            } catch { tabErrors++ }
          }
          if (tabDownloaded > 0 || tabDeleted > 0 || tabErrors > 0) {
            details.push({ tabla, downloaded: tabDownloaded, uploaded: 0, errors: tabErrors })
            totalDownloaded += tabDownloaded
            totalErrors += tabErrors
          }
          // Avisa a los componentes visibles que tengan datos de esta tabla
          // para que se refresquen solos (ver useCloudRefresh), en vez de
          // esperar a que el usuario cambie de pantalla o recargue la app.
          if (tabDownloaded > 0 || tabDeleted > 0) {
            window.dispatchEvent(new CustomEvent('tmcloud:table-changed', {
              detail: { table: tabla, updated: tabDownloaded, deleted: tabDeleted },
            }))
          }
        }
        notify({ running: true, progreso: `Descarga completada (${totalDownloaded} cambios)`, mode })
      } else {
        // Fallo la descarga (red, servidor, endpoint no disponible, etc.):
        // no se avanza la marca de sincronizacion, se reintentara en el
        // proximo ciclo desde el mismo punto.
        downloadOk = false
        notify({ running: true, progreso: 'No se pudo descargar cambios; se reintentara', mode })
      }
  }

  // --- UPLOAD local→cloud (only tables with local modifications) ---
  {
    const uploadBatch: { tabla: string; rows: any[] }[] = []
    for (const table of schema) {
      const tabla = table.name
      if (LOCAL_SYSTEM_TABLES.includes(tabla)) continue
      const tablaLastSync = incremental
        ? (await getConfigValue(`last_sync_${tabla}`) || '')
        : ''
      let candidates: any[]
      if (incremental && tablaLastSync) {
        candidates = (await getLocalRows(tabla)).filter(r => timestamp(r) > tablaLastSync)
      } else {
        candidates = await getLocalRows(tabla)
      }
      if (candidates.length > 0) uploadBatch.push({ tabla, rows: candidates })
    }

    for (const { tabla, rows } of uploadBatch) {
      const serverCols = tableSchemaMap.get(tabla)
      const serverColNames = serverCols ? serverCols.columns.map(c => c.name) : null
      const cleanRows = serverColNames
        ? rows.map(r => {
            const cleaned: any = { uid: r.uid }
            for (const col of serverColNames) {
              if (col in r) cleaned[col] = r[col]
            }
            return cleaned
          })
        : rows
      notify({ running: true, tabla, progreso: `Subiendo ${tabla} (${cleanRows.length} registros)...`, mode })
      const result = await upsertCloud(tabla, cleanRows)
      if (result.inserted + result.updated > 0 || result.errors > 0) {
        const ups = result.inserted + result.updated
        details.push({ tabla, downloaded: 0, uploaded: ups, errors: result.errors })
        totalUploaded += ups
        totalErrors += result.errors
      }
      // Igual que con la descarga: si hubo errores no se avanza la marca de
      // subida de esta tabla, para que esas filas se reintenten en el
      // proximo ciclo en vez de quedar "atrapadas" detras del watermark.
      if (result.errors > 0) continue
      await setConfigValue(`last_sync_${tabla}`, completedAt)
    }
  }

  await syncDeletes()
  if (downloadOk) {
    await setConfigValue('ultimo_sync_tm', completedAt)
  }
  await repairRelationalLinks()
  onSyncComplete?.(details)

  const result: SyncResult = {
    success: totalErrors === 0,
    inserts: totalUploaded,
    updates: totalDownloaded,
    errors: totalErrors,
    message: `${totalUploaded} subidos, ${totalDownloaded} descargados, ${totalErrors} errores`,
  }
  notify({ running: false, lastSync: completedAt, mode, result, details })
  return result
}

export async function refreshLoginUsers(): Promise<{ success: boolean; downloaded: number; error?: string }> {
  if ((window as any).__onlineOnly) return { success: true, downloaded: 0 }
  try {
    // La verificacion de licencia puede cambiar proyecto y llaves con la app
    // abierta. Se recarga la configuracion para evitar credenciales en cache.
    if (!await reloadCloudApi()) return { success: false, downloaded: 0, error: 'TM Cloud no configurado' }
    const rows = await fetchCloudRows('usuarios')
    let downloaded = 0
    for (const row of rows) {
      if (!row?.uid) continue
      const action = await upsertLocal('usuarios', row)
      if (action !== 'skipped') downloaded++
    }
    return { success: true, downloaded }
  } catch (error: any) {
    return { success: false, downloaded: 0, error: error?.message || 'No se pudieron descargar los usuarios' }
  }
}

async function repairSystemTables(): Promise<void> {
  for (const [tabla, defs] of Object.entries(SYSTEM_TABLE_DEFS)) {
    try {
      const res = await (window as any).electron?.invoke('consultaservidor', 'getTableColumns', tabla, 'names')
      const cols: string[] = Array.isArray(res) ? res : []
      const needed = defs.map(d => d.split(' ')[0])
      const missing = needed.filter(n => !cols.includes(n))
      if (missing.length > 0) {
        await (window as any).electron?.invoke('consultaservidor', 'eliminarTabla', tabla)
        await (window as any).electron?.invoke('consultaservidor', 'crearTabla', tabla, defs)
      }
    } catch {
      try {
        await (window as any).electron?.invoke('consultaservidor', 'crearTabla', tabla, defs)
      } catch {}
    }
  }
}

export async function downloadAllTables(options: { force?: boolean } = {}): Promise<SyncResult> {
  if ((window as any).__onlineOnly && !options.force) {
    return { success: false, inserts: 0, updates: 0, errors: 0, message: 'La descarga local esta deshabilitada en modo online obligatorio' }
  }
  if (!await ensureCloudApi()) {
    return { success: false, inserts: 0, updates: 0, errors: 1, message: 'TM Cloud no conectado' }
  }
  await repairSystemTables()

  const schema = await fetchServerFullSchema()
  if (!schema.length) {
    return { success: false, inserts: 0, updates: 0, errors: 1, message: `No se pudo obtener esquema del servidor${schemaLastError ? `: ${schemaLastError}` : ''}` }
  }

  const details: SyncDetail[] = []
  const schemaOrdenado = sortTablesByDependency(schema, t => t.name)
  for (const table of schemaOrdenado) {
    const tabla = table.name
    if (LOCAL_SYSTEM_TABLES.includes(tabla)) continue
    // El esquema contiene muchas tablas historicas vacias. Consultarlas no
    // aporta filas y consume el limite de solicitudes antes de llegar a las
    // tablas de inventario.
    if (Number(table.count || 0) <= 0) continue
    // Evita alcanzar el limite por rafaga del servidor; los 429 adicionales
    // tambien se reintentan dentro de fetchCloudRows.
    await delay(350)
    notify({ running: true, tabla, progreso: `Descargando ${tabla} (${table.count} registros)...` })
    let downloaded = 0
    let errors = 0
    const errorMessages: string[] = []
    try {
      const cloudRows = await fetchCloudRows(tabla)
      const localColumns = table.columns?.length ? table.columns : inferColumnsFromRows(cloudRows)
      if (!(await ensureLocalTableExists(tabla, localColumns))) {
        throw new Error(`No se pudo preparar la tabla local ${tabla}`)
      }
      const localRows = await getLocalRows(tabla)
      for (const row of cloudRows) {
        if (row.uid) {
          try {
            const action = await upsertLocal(tabla, row, localRows)
            if (action !== 'skipped') downloaded++
          } catch (error) {
            console.error(`[TM Cloud] No se pudo importar ${tabla} (${String(row.uid || 'sin uid')}):`, error)
            errors++
            if (errorMessages.length < 5) errorMessages.push(error instanceof Error ? error.message : String(error))
          }
        }
      }
    } catch (error) {
      console.error(`[TM Cloud] Error descargando la tabla ${tabla}:`, error)
      errors++
      if (errorMessages.length < 5) errorMessages.push(error instanceof Error ? error.message : String(error))
    }
    if (downloaded > 0 || errors > 0) {
      details.push({ tabla, downloaded, uploaded: 0, errors, ...(errorMessages.length ? { errorMessages } : {}) })
    }
    await setConfigValue(`last_sync_${tabla}`, nowSql())
  }

  const downloaded = details.reduce((total, item) => total + item.downloaded, 0)
  const errors = details.reduce((total, item) => total + item.errors, 0)
  const completedAt = nowSql()
  await setConfigValue('ultimo_sync_tm', completedAt)
  await repairRelationalLinks()
  onSyncComplete?.(details)

  const result: SyncResult = {
    success: errors === 0,
    inserts: 0,
    updates: downloaded,
    errors,
    message: `${downloaded} descargados, ${errors} errores`,
    details,
  }
  notify({ running: false, lastSync: completedAt, mode: currentMode, result, details })
  return result
}

export async function pushAllTables(mode?: SyncMode): Promise<SyncResult> {
  const selected = mode || currentMode
  return executeSync(selected === 'offline' ? 'offline' : 'online', false)
}

export async function pushLocalRowToCloud(tabla: string, id: number): Promise<{ success: boolean; error?: string }> {
  if (shouldSkipOnlineOnlyRowPush(tabla, Boolean((window as any).__onlineOnly))) return { success: true }
  try {
    if (!await ensureCloudApi()) return { success: false, error: 'TM Cloud no conectado' }
    if (tabla === 'apariencia_almacen') {
      // La reparacion del esquema es preventiva. Una respuesta temporalmente
      // fallida del endpoint de esquema no debe bloquear un upsert si la tabla
      // ya existe (la fila se filtra mas abajo con las columnas remotas reales).
      invalidateSchemaCache()
      await ensureAparienciaAlmacenCloudTable()
    }
    if (tabla === 'cuadres') {
      invalidateSchemaCache()
      await ensureCuadresCloudTable()
    }
    const rows = await getLocalRows(tabla)
    const row = rows.find(item => Number(item.id) === Number(id))
    if (!row) return { success: false, error: 'Registro local no encontrado' }
    // Las tablas locales pueden tener columnas nuevas antes de que TM Cloud las tenga.
    // En el envio inmediato filtramos por el esquema remoto para no rechazar todo el registro.
    let schema = await fetchServerFullSchema()
    let tablaRemota = schema.find(item => item.name === tabla)
    if (!tablaRemota) {
      const tablaPreparada = tabla === 'ventas_pausadas'
        ? await ensureVentasPausadasCloudTable()
        : tabla === 'apariencia_almacen'
          ? await ensureAparienciaAlmacenCloudTable()
          : tabla === 'cuadres'
            ? await ensureCuadresCloudTable()
          : false
      if (tablaPreparada) {
        schema = await fetchServerFullSchema()
        tablaRemota = schema.find(item => item.name === tabla)
      }
    }
    const columnasRemotas = tablaRemota?.columns.map(columna => columna.name)
      || (tabla === 'apariencia_almacen'
        ? APARIENCIA_ALMACEN_CLOUD_COLUMNS.map(columna => columna.name)
        : tabla === 'cuadres'
          ? CUADRES_CLOUD_COLUMNS.map(columna => columna.name)
        : null)
    if (!columnasRemotas) return { success: false, error: `La tabla ${tabla} no existe en TM Cloud` }
    const fila = columnasRemotas
      ? columnasRemotas.reduce((acumulado: any, columna: string) => {
          if (row[columna] !== undefined) acumulado[columna] = row[columna]
          return acumulado
        }, {})
      : row
    if (tabla === 'imei') {
      if (row.telefono_uid) fila.id_equi = row.telefono_uid
      delete fila.telefono_uid
    }
    if (tabla === 'serial') delete fila.id_equi
    if (row.uid && fila.uid === undefined) fila.uid = row.uid
    const result = await upsertCloud(tabla, [fila])
    if (result.errors > 0) return { success: false, error: result.error || 'TMPBase rechazo el registro' }
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'No se pudo sincronizar el registro' }
  }
}

export async function syncAll(mode?: SyncMode, incremental = false): Promise<SyncResult> {
  return executeSync(mode || currentMode, incremental)
}

export async function startAutoSync(intervalMs = 30000) {
  stopAutoSync()
  if ((window as any).__onlineOnly) return
  const generation = autoSyncGeneration
  if (!await ensureCloudApi() || currentMode === 'offline' || generation !== autoSyncGeneration) return
  await startRealtime()
  if (generation !== autoSyncGeneration || syncingInProgress) return

  syncingInProgress = true
  try {
    await syncAll(undefined, true)
  } finally {
    syncingInProgress = false
  }
  if (intervalMs <= 0 || generation !== autoSyncGeneration) return

  intervalId = setInterval(async () => {
    if (generation !== autoSyncGeneration || syncingInProgress || currentMode === 'offline') return
    syncingInProgress = true
    try {
      await syncAll(undefined, true)
    } finally {
      syncingInProgress = false
    }
  }, Math.max(intervalMs, 10000))
}

export function stopAutoSync() {
  autoSyncGeneration += 1
  if (intervalId) clearInterval(intervalId)
  intervalId = null
  syncingInProgress = false
  stopRealtime()
}

export async function initAutoSyncFromConfig() {
  if ((window as any).__onlineOnly) return
  const generation = autoSyncGeneration
  try {
    await repairSystemTables()
    if (generation !== autoSyncGeneration) return
    const mode = (await getConfigValue('tm_sync_mode') || 'ambos') as SyncMode
    const interval = parseInt(await getConfigValue('tm_sync_interval') || '30', 10) * 1000
    const enabled = await getConfigValue('tm_auto_sync') === '1'
    if (generation !== autoSyncGeneration) return
    currentMode = mode
    if (enabled && mode !== 'offline') await startAutoSync(interval)
    else if (mode !== 'offline' && generation === autoSyncGeneration) await startRealtime()
  } catch { /* Configuration will be retried when the user opens TM Cloud. */ }
}
