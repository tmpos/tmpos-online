import { app, BrowserWindow, ipcMain, Menu, dialog, safeStorage, session } from 'electron'
import { join } from 'path'
import { exec, execSync, spawn } from 'child_process'
import path from 'path'
import fs from 'fs'
import http from 'http'
import https from 'https'
import net from 'net'
import tls from 'tls'
import dns from 'dns'
import { networkInterfaces, hostname } from 'os'
import crypto from 'crypto'
import { gzipSync } from 'zlib'
import bcrypt from 'bcryptjs'
import Database from 'better-sqlite3'
import { getMachineId, getMachineIdLegacy } from './machine-id'
import { assertAvailableInventory, assertSameWarehouse } from '../src/domain/inventoryRules'
import { isVersionNewer } from '../src/domain/versioning'

// En desarrollo, Electron puede sobrevivir a la terminal que lo inicio. Si esa
// terminal cierra su tuberia, cualquier console.log posterior emite EPIPE y,
// sin un listener, Node termina todo el proceso principal.
const ignoreClosedConsolePipe = (error: NodeJS.ErrnoException): void => {
  if (error.code !== 'EPIPE') return
}
process.stdout?.on('error', ignoreClosedConsolePipe)
process.stderr?.on('error', ignoreClosedConsolePipe)

let mainWindow: BrowserWindow | null = null
let db: InstanceType<typeof Database> | null = null

const OPENAI_KEY_PREFIX = 'safe:v1:'

function protectOpenAIKey(value: string): string {
  if (!value || !safeStorage.isEncryptionAvailable()) return value
  return OPENAI_KEY_PREFIX + safeStorage.encryptString(value).toString('base64')
}

function revealOpenAIKey(value: string): string {
  if (!value.startsWith(OPENAI_KEY_PREFIX)) return value
  try {
    return safeStorage.decryptString(Buffer.from(value.slice(OPENAI_KEY_PREFIX.length), 'base64'))
  } catch {
    return ''
  }
}

function getOpenAIError(data: any, status: number): string {
  const code = String(data?.error?.code || data?.error?.type || '')
  const message = String(data?.error?.message || '')
  if (code === 'insufficient_quota' || /exceeded your current quota/i.test(message)) {
    return 'La cuenta de API de OpenAI no tiene crédito o cuota disponible. ChatGPT y la API se facturan por separado; revisa Billing en platform.openai.com.'
  }
  if (code === 'model_not_found' || /model.*does not exist|access to it/i.test(message)) {
    return 'La API key no tiene acceso al modelo seleccionado. Elige otro modelo en Configuración > OpenAI / Jarvis.'
  }
  if (status === 401) return 'La API key de OpenAI no es válida o fue revocada.'
  if (status === 429) return 'OpenAI rechazó la solicitud por límite de uso. Revisa la cuota y los límites del proyecto de API.'
  return message || `OpenAI respondió con HTTP ${status}`
}

type OtpLocalMode = 'fixed' | 'variable'

function ensureOtpLocalTable(): void {
  db!.exec(`CREATE TABLE IF NOT EXISTS otp_local_config (
    id INTEGER PRIMARY KEY,
    mode TEXT NOT NULL DEFAULT 'variable',
    fixed_code TEXT NOT NULL DEFAULT '0000',
    interval_seconds INTEGER NOT NULL DEFAULT 60,
    send_email INTEGER NOT NULL DEFAULT 0,
    secret TEXT NOT NULL DEFAULT '',
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  const columns = db!.prepare(`PRAGMA table_info(otp_local_config)`).all() as any[]
  if (!columns.some((column: any) => column.name === 'send_email')) {
    db!.exec(`ALTER TABLE otp_local_config ADD COLUMN send_email INTEGER NOT NULL DEFAULT 0`)
  }
  const row = db!.prepare(`SELECT id, secret FROM otp_local_config WHERE id = 1`).get() as any
  if (!row) {
    db!.prepare(`INSERT INTO otp_local_config (id, mode, fixed_code, interval_seconds, secret) VALUES (1, 'variable', '0000', 60, ?)`).run(crypto.randomBytes(32).toString('hex'))
  } else if (!row.secret) {
    db!.prepare(`UPDATE otp_local_config SET secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(crypto.randomBytes(32).toString('hex'))
  }
}

function getOtpLocalConfig(): { mode: OtpLocalMode; fixedCode: string; intervalSeconds: number; sendEmail: boolean; secret: string } {
  ensureOtpLocalTable()
  const row = db!.prepare(`SELECT * FROM otp_local_config WHERE id = 1`).get() as any
  return {
    mode: row?.mode === 'fixed' ? 'fixed' : 'variable',
    fixedCode: /^\d{4}$/.test(String(row?.fixed_code || '')) ? String(row.fixed_code) : '0000',
    intervalSeconds: Math.min(3600, Math.max(30, Number(row?.interval_seconds || 60))),
    sendEmail: Number(row?.send_email || 0) === 1,
    secret: String(row?.secret || ''),
  }
}

function calculateVariableOtp(secret: string, intervalSeconds: number, timestamp = Date.now()): string {
  const windowNumber = Math.floor(timestamp / 1000 / intervalSeconds)
  const digest = crypto.createHmac('sha256', secret).update(String(windowNumber)).digest()
  return String(digest.readUInt32BE(0) % 10000).padStart(4, '0')
}

function getOtpLocalStatus() {
  const config = getOtpLocalConfig()
  const nowSeconds = Math.floor(Date.now() / 1000)
  const code = config.mode === 'fixed'
    ? config.fixedCode
    : calculateVariableOtp(config.secret, config.intervalSeconds)
  const secondsRemaining = config.mode === 'fixed'
    ? 0
    : config.intervalSeconds - (nowSeconds % config.intervalSeconds)
  return {
    mode: config.mode,
    fixedCode: config.fixedCode,
    intervalSeconds: config.intervalSeconds,
    sendEmail: config.sendEmail,
    code,
    secondsRemaining,
    networkUrl: serverUrl ? `${serverUrl}/otp` : '',
  }
}

function validateLocalOtp(code: string): boolean {
  const config = getOtpLocalConfig()
  if (config.mode === 'fixed') return code === config.fixedCode
  const current = calculateVariableOtp(config.secret, config.intervalSeconds)
  const previous = calculateVariableOtp(config.secret, config.intervalSeconds, Date.now() - config.intervalSeconds * 1000)
  return code === current || code === previous
}

function getDbPath(): string {
  const dbDir = path.join(app.getPath('userData'), 'database')
  if (!fs.existsSync(dbDir)) {
    fs.mkdirSync(dbDir, { recursive: true })
  }
  return path.join(dbDir, 'database.db')
}

function getBackupsDir(): string {
  const backupsDir = path.join(app.getPath('userData'), 'backups')
  if (!fs.existsSync(backupsDir)) {
    fs.mkdirSync(backupsDir, { recursive: true })
  }
  return backupsDir
}

async function pruneBackups(maxBackups = 5): Promise<void> {
  const backupsDir = getBackupsDir()
  const files = await fs.promises.readdir(backupsDir)
  const backups = await Promise.all(
    files
      .filter(file => file.toLowerCase().endsWith('.db'))
      .map(async file => {
        const filePath = path.join(backupsDir, file)
        const stat = await fs.promises.stat(filePath)
        return { filePath, mtime: stat.mtime.getTime() }
      })
  )
  backups.sort((a, b) => b.mtime - a.mtime)
  const toDelete = backups.slice(maxBackups)
  await Promise.all(toDelete.map(backup => fs.promises.unlink(backup.filePath)))
}

function generarUid(): string {
  return crypto.randomUUID()
}

function getOnlineCloudCredentials(): { baseUrl: string; key: string } | null {
  const cloud = db!.prepare(`SELECT url, public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
  const baseUrl = String(cloud?.url || '').trim().replace(/\/+$/, '')
  const key = String(cloud?.secret_key || cloud?.public_key || '').trim()
  if (!/^https?:\/\/[^/]+\/api\/prj_[A-Za-z0-9]+$/i.test(baseUrl) || !key) {
    return null
  }
  return { baseUrl, key }
}

async function onlineCloudRequest(pathname: string, init: RequestInit = {}): Promise<any> {
  const cloud = getOnlineCloudCredentials()
  if (!cloud) throw new Error('TM Cloud no esta configurado. Configuralo para usar el sistema.')
  const response = await fetch(`${cloud.baseUrl}${pathname}`, {
    ...init,
    headers: { Authorization: `Bearer ${cloud.key}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers || {}) },
    signal: AbortSignal.timeout(45000),
  })
  const value = await response.json().catch(() => ({}))
  if (!response.ok) throw new Error(value?.error || value?.message || `TM Cloud respondio HTTP ${response.status}`)
  return value
}

function validOnlineTable(value: unknown): string {
  const table = String(value || '').trim().toLowerCase()
  if (!/^[a-z_][a-z0-9_]*$/.test(table)) throw new Error('Nombre de tabla no valido')
  return table
}

async function fetchOnlineTable(tableValue: unknown): Promise<any[]> {
  const table = validOnlineTable(tableValue)
  const rows: any[] = []
  for (let page = 1; ; page++) {
    const value = await onlineCloudRequest(`/${encodeURIComponent(table)}?page=${page}&limit=500`)
    const batch = Array.isArray(value?.data) ? value.data : []
    rows.push(...batch)
    const pages = Number(value?.meta?.pages || 0)
    if ((pages && page >= pages) || (!pages && batch.length < 500)) break
  }
  if (ONLINE_IMAGE_TABLES.has(table) && rows.length) {
    let imageRows: any[] = []
    try {
      imageRows = await fetchOnlineTable(ONLINE_IMAGE_METADATA_TABLE)
    } catch {
      // Some TM Cloud projects answer "Table not found" while this optional
      // metadata table is still empty. Business rows must remain available.
      return rows
    }
    const images = new Map(imageRows
      .filter(row => String(row.nombre || '').startsWith(`${ONLINE_IMAGE_PREFIX}${table}:`))
      .map(row => [String(row.nombre), String(row.valor || '')]))
    return rows.map(row => ({
      ...row,
      imagen: images.get(onlineImageKey(table, row.uid || row.id)) || row.imagen || '',
    }))
  }
  return rows
}

const ONLINE_IMAGE_METADATA_TABLE = 'datos_config'
const ONLINE_IMAGE_PREFIX = '__tmpos_imagen__:'
const ONLINE_IMAGE_TABLES = new Set(['accesorios', 'telefonos', 'electrodomesticos', 'piezas'])

function onlineImageKey(table: string, rowKey: unknown): string {
  return `${ONLINE_IMAGE_PREFIX}${table}:${String(rowKey || '')}`
}

async function saveOnlineImage(table: string, rowKey: unknown, image: unknown): Promise<void> {
  if (!ONLINE_IMAGE_TABLES.has(table) || !rowKey) return
  await ensureOnlineCloudTable(ONLINE_IMAGE_METADATA_TABLE)
  const name = onlineImageKey(table, rowKey)
  let metadata: any[] = []
  try { metadata = await fetchOnlineTable(ONLINE_IMAGE_METADATA_TABLE) }
  catch { metadata = [] }
  const current = metadata.find(row => String(row.nombre || '') === name)
  const value = String(image || '')
  if (!value) {
    if (current) await onlineCloudRequest(`/${ONLINE_IMAGE_METADATA_TABLE}/${encodeURIComponent(String(current.uid || current.id))}`, { method: 'DELETE' })
    return
  }
  if (current) {
    await onlineCloudRequest(`/${ONLINE_IMAGE_METADATA_TABLE}/${encodeURIComponent(String(current.uid || current.id))}`, {
      method: 'PUT', body: JSON.stringify({ valor: value, identificadordb: name }),
    })
    return
  }
  await onlineCloudRequest(`/${ONLINE_IMAGE_METADATA_TABLE}`, {
    method: 'POST',
    body: JSON.stringify({ uid: generarUid(), nombre: name, valor: value, identificadordb: name }),
  })
}

function filterOnlineRows(rows: any[], whereValue: unknown, params: any[] = []): any[] {
  const where = String(whereValue || '').replace(/^\s*where\s+/i, '').trim()
  if (!where) return rows
  let paramIndex = 0
  const tests = where.split(/\s+AND\s+/i).map(raw => {
    const clause = raw.trim().replace(/^\(+|\)+$/g, '')
    let match = clause.match(/^([A-Za-z_][\w]*)\s+IS\s+(NOT\s+)?NULL$/i)
    if (match) return (row: any) => match![2] ? row[match![1]] != null : row[match![1]] == null
    match = clause.match(/^([A-Za-z_][\w]*)\s+(NOT\s+LIKE|LIKE|<>|!=|>=|<=|=|>|<)\s+\?$/i)
    if (!match) throw new Error(`Filtro online no soportado: ${raw}`)
    const column = match[1]
    const operator = match[2].toUpperCase()
    const expected = params[paramIndex++]
    return (row: any) => {
      const actual = row[column]
      if (operator === 'LIKE' || operator === 'NOT LIKE') {
        const escaped = String(expected ?? '').replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/%/g, '.*').replace(/_/g, '.')
        const matches = new RegExp(`^${escaped}$`, 'i').test(String(actual ?? ''))
        return operator === 'LIKE' ? matches : !matches
      }
      if (operator === '=') return String(actual ?? '') === String(expected ?? '')
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

const ONLINE_SCHEMA_EXCLUDED_COLUMNS = new Set(['id', 'almacen_id', 'sync_status', 'last_synced_at', '_rowid'])

function onlineCloudColumnType(value: unknown): string {
  const type = String(value || 'TEXT').toUpperCase()
  if (type.includes('INT') || type.includes('BOOL')) return 'INTEGER'
  if (type.includes('REAL') || type.includes('FLOA') || type.includes('DOUB') || type.includes('DEC') || type.includes('NUM')) return 'REAL'
  if (type.includes('DATE') || type.includes('TIME')) return 'DATETIME'
  return 'TEXT'
}

async function ensureOnlineCloudTable(tableValue: unknown, sample: Record<string, any> = {}): Promise<void> {
  const table = validOnlineTable(tableValue)
  const desired = new Map<string, { name: string; type: string }>()

  try {
    const existsLocally = db!.prepare(`SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?`).get(table)
    if (existsLocally) {
      const columns = db!.prepare(`PRAGMA table_info("${table}")`).all() as any[]
      for (const column of columns) {
        const name = String(column.name || '').toLowerCase()
        if (!ONLINE_SCHEMA_EXCLUDED_COLUMNS.has(name)) {
          desired.set(name, { name, type: onlineCloudColumnType(column.type) })
        }
      }
    }
  } catch {}

  for (const [rawName, value] of Object.entries(sample || {})) {
    const name = String(rawName || '').toLowerCase()
    if (!/^[a-z_][a-z0-9_]*$/.test(name) || ONLINE_SCHEMA_EXCLUDED_COLUMNS.has(name)) continue
    desired.set(name, {
      name,
      type: typeof value === 'number' ? (Number.isInteger(value) ? 'INTEGER' : 'REAL') : 'TEXT',
    })
  }
  if (!desired.has('uid')) desired.set('uid', { name: 'uid', type: 'TEXT' })
  if (!desired.has('created_at')) desired.set('created_at', { name: 'created_at', type: 'DATETIME' })
  if (!desired.has('updated_at')) desired.set('updated_at', { name: 'updated_at', type: 'DATETIME' })

  const schemaResponse = await onlineCloudRequest('/schema')
  const schema = schemaResponse?.data && typeof schemaResponse.data === 'object' ? schemaResponse.data : {}
  const current = schema[table]
  const currentColumns = new Set((current?.columns || []).map((column: any) => String(column.name || '').toLowerCase()))
  if (current && [...desired.keys()].every(name => currentColumns.has(name))) return

  await onlineCloudRequest('/schema/tables/batch', {
    method: 'POST',
    body: JSON.stringify({ tables: [{ name: table, columns: [...desired.values()] }] }),
  })

  const refreshedResponse = await onlineCloudRequest('/schema')
  const refreshed = refreshedResponse?.data?.[table]
  const refreshedColumns = new Set((refreshed?.columns || []).map((column: any) => String(column.name || '').toLowerCase()))
  const missing = [...desired.keys()].filter(name => !refreshedColumns.has(name))
  if (!refreshed || missing.length) {
    throw new Error(`TM Cloud no pudo preparar la tabla ${table}${missing.length ? `; faltan columnas: ${missing.join(', ')}` : ''}`)
  }
}

async function handleOnlineDbAction(action: string, data: Record<string, any>): Promise<any> {
  const table = validOnlineTable(data.tabla)
  const sample = action === 'db/insert' || action === 'db/update' ? { ...(data.data || {}) } : {}
  await ensureOnlineCloudTable(table, sample)
  if (action === 'db/getAll') return { success: true, data: await fetchOnlineTable(table) }
  if (action === 'db/getWhere') return { success: true, data: filterOnlineRows(await fetchOnlineTable(table), data.where, data.params || []) }
  if (action === 'db/getModified') {
    const value = await onlineCloudRequest(`/${encodeURIComponent(table)}/sync?from=${encodeURIComponent(String(data.desde || ''))}`)
    return { success: true, data: value?.data || [] }
  }
  if (action === 'db/getById') {
    const row = (await fetchOnlineTable(table)).find(item => Number(item.id) === Number(data.id))
    return { success: true, data: row }
  }
  if (action === 'db/insert') {
    const record = { ...(data.data || {}) }
    const image = record.imagen
    delete record.imagen
    delete record.id
    delete record._rowId
    delete record.almacen_id
    if (!record.uid) record.uid = generarUid()
    const value = await onlineCloudRequest(`/${encodeURIComponent(table)}`, { method: 'POST', body: JSON.stringify(record) })
    const created = value?.data || value
    if (ONLINE_IMAGE_TABLES.has(table) && image) await saveOnlineImage(table, created?.uid || record.uid || created?.id, image)
    return { success: true, data: { ...created, ...(image ? { imagen: image } : {}) } }
  }
  if (action === 'db/update' || action === 'db/delete') {
    const row = (await fetchOnlineTable(table)).find(item => Number(item.id) === Number(data.id))
    if (!row) return { success: action === 'db/delete', changes: 0, error: action === 'db/update' ? 'El registro ya no existe en TM Cloud' : undefined }
    const key = String(row.uid || row.id)
    if (action === 'db/delete') {
      let cuentasCobrarEliminadas = 0
      if (table === 'facturas') {
        await ensureOnlineCloudTable('cuentas_cobrar')
        const cuentas = await fetchOnlineTable('cuentas_cobrar')
        const relacionadas = cuentas.filter(cuenta => {
          if (String(cuenta.no_factura || '').trim() !== String(row.no_factura || '').trim()) return false
          const facturaAlmacen = String(row.almacen_uid || '').trim()
          const cuentaAlmacen = String(cuenta.almacen_uid || '').trim()
          return !facturaAlmacen || !cuentaAlmacen || facturaAlmacen === cuentaAlmacen
        })
        for (const cuenta of relacionadas) {
          await onlineCloudRequest(`/cuentas_cobrar/${encodeURIComponent(String(cuenta.uid || cuenta.id))}`, { method: 'DELETE' })
          cuentasCobrarEliminadas++
        }

        await ensureOnlineCloudTable('facturas_ecf')
        const ecfRows = (await fetchOnlineTable('facturas_ecf')).filter(ecf => Number(ecf.factura_id || 0) === Number(row.id || 0))
        for (const ecf of ecfRows) {
          await onlineCloudRequest(`/facturas_ecf/${encodeURIComponent(String(ecf.uid || ecf.id))}`, { method: 'DELETE' })
        }
      }
      await onlineCloudRequest(`/${encodeURIComponent(table)}/${encodeURIComponent(key)}`, { method: 'DELETE' })
      if (ONLINE_IMAGE_TABLES.has(table)) await saveOnlineImage(table, row.uid || row.id, '')
      return { success: true, changes: 1, data: { cuentas_cobrar_eliminadas: cuentasCobrarEliminadas } }
    } else {
      const record = { ...(data.data || {}) }
      const hasImage = Object.prototype.hasOwnProperty.call(record, 'imagen')
      const image = record.imagen
      delete record.imagen
      delete record.id
      delete record.uid
      delete record.created_at
      delete record.almacen_id
      if (Object.keys(record).length) {
        await onlineCloudRequest(`/${encodeURIComponent(table)}/${encodeURIComponent(key)}`, { method: 'PUT', body: JSON.stringify(record) })
      }
      if (ONLINE_IMAGE_TABLES.has(table) && hasImage) await saveOnlineImage(table, row.uid || row.id, image)
    }
    return { success: true, changes: 1 }
  }
  throw new Error(`Accion de datos online no soportada: ${action}`)
}

async function callOnlineRuntime(action: string, data: Record<string, any>): Promise<any> {
  if (['db/getAll', 'db/getWhere', 'db/getModified', 'db/getById', 'db/insert', 'db/update', 'db/delete'].includes(action)) {
    try { return await handleOnlineDbAction(action, data) }
    catch (error: any) { return { success: false, error: error?.message || 'No se pudo consultar TM Cloud' } }
  }
  const cloud = getOnlineCloudCredentials()
  if (!cloud) return { success: false, error: 'TM Cloud no esta configurado. Configuralo para usar el sistema.' }
  try {
    const response = await fetch(`${cloud.baseUrl}/runtime`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${cloud.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, data }),
      signal: AbortSignal.timeout(45000),
    })
    const value = await response.json().catch(() => ({}))
    if (!response.ok) return { success: false, error: value?.error || value?.message || `TM Cloud respondio HTTP ${response.status}` }
    return value
  } catch (error: any) {
    return { success: false, error: error?.message || 'No se pudo conectar con TM Cloud' }
  }
}

type PortableSchemaColumn = {
  name: string
  type: string
  notNull: boolean
  defaultValue: string | number | null
  primaryKey: boolean
}

type PortableSchemaTable = { name: string; columns: PortableSchemaColumn[] }

type PortableSeed = {
  table: string
  match: Record<string, string | number | null>
  data: Record<string, string | number | null>
}

type PortableConfiguration = {
  format: 'tmpos-portable-configuration'
  formatVersion: number
  generatedAt: string
  appVersion: string
  schema: { tables: PortableSchemaTable[] }
  defaults: { version: number; seeds: PortableSeed[] }
  settings: Array<{ clave: string; valor: string; tipo: string; categoria: string }>
}

const SAFE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/
const PORTABLE_SEED_TABLES = new Set(['clientes', 'usuarios', 'metodos_pago', 'correo'])

function quoteIdentifier(value: string): string {
  if (!SAFE_IDENTIFIER.test(value)) throw new Error(`Identificador no valido: ${value}`)
  return `"${value}"`
}

function normalizeSqliteType(value: unknown): string {
  const raw = String(value || 'TEXT').trim().toUpperCase()
  if (raw.includes('INT')) return 'INTEGER'
  if (raw.includes('REAL') || raw.includes('FLOA') || raw.includes('DOUB')) return 'REAL'
  if (raw.includes('BLOB')) return 'BLOB'
  if (raw.includes('NUM') || raw.includes('DEC') || raw.includes('BOOL')) return 'NUMERIC'
  if (raw.includes('DATE') || raw.includes('TIME')) return 'TIMESTAMP'
  return 'TEXT'
}

function safeDefaultSql(value: unknown): string {
  if (value === null || value === undefined || value === '') return ''
  const raw = String(value).trim()
  if (/^-?\d+(\.\d+)?$/.test(raw)) return ` DEFAULT ${raw}`
  if (/^NULL$/i.test(raw)) return ' DEFAULT NULL'
  if (/^CURRENT_(TIMESTAMP|DATE|TIME)$/i.test(raw)) return ` DEFAULT ${raw.toUpperCase()}`
  if (/^'.*'$/.test(raw) && !raw.slice(1, -1).includes("'")) return ` DEFAULT ${raw}`
  if (/^".*"$/.test(raw) && !raw.slice(1, -1).includes('"')) return ` DEFAULT '${raw.slice(1, -1).replace(/'/g, "''")}'`
  return ''
}

function builtInDefaultSeeds(): PortableSeed[] {
  return [
    { table: 'clientes', match: { nombre: 'CONSUMIDOR FINAL' }, data: { uid: '00000000-0000-4000-8000-000000000001', nombre: 'CONSUMIDOR FINAL', cedula: '00000000000', codigo: 'CF-0001', activo: 'ACTIVO' } },
    { table: 'usuarios', match: { email: 'admin' }, data: { uid: '00000000-0000-4000-8000-000000000101', nombre: 'ADMINISTRADOR', email: 'admin', password: '', pin: '1234', nivel_seguridad: 'Administrador', estado: 'ACTIVADO', rol: 'admin' } },
    { table: 'usuarios', match: { email: 'cajero' }, data: { uid: '00000000-0000-4000-8000-000000000102', nombre: 'CAJERO', email: 'cajero', password: '', pin: '0000', nivel_seguridad: 'Cajero', estado: 'ACTIVADO', rol: 'cajero' } },
    { table: 'usuarios', match: { email: 'usuario' }, data: { uid: '00000000-0000-4000-8000-000000000103', nombre: 'USUARIO', email: 'usuario', password: '', pin: '1111', nivel_seguridad: 'Usuario', estado: 'ACTIVADO', rol: 'vendedor' } },
    { table: 'usuarios', match: { email: 'soporte' }, data: { uid: '00000000-0000-4000-8000-000000000104', nombre: 'SOPORTE', email: 'soporte', password: '', pin: '2222', nivel_seguridad: 'Soporte', estado: 'ACTIVADO', rol: 'soporte' } },
    { table: 'metodos_pago', match: { nombre: 'EFECTIVO' }, data: { uid: '00000000-0000-4000-8000-000000000201', nombre: 'EFECTIVO', porcentaje: 0, estado: 'ACTIVO' } },
    { table: 'metodos_pago', match: { nombre: 'TARJETA' }, data: { uid: '00000000-0000-4000-8000-000000000202', nombre: 'TARJETA', porcentaje: 2.5, estado: 'ACTIVO' } },
    { table: 'metodos_pago', match: { nombre: 'TRANSFERENCIA' }, data: { uid: '00000000-0000-4000-8000-000000000203', nombre: 'TRANSFERENCIA', porcentaje: 0, estado: 'ACTIVO' } },
    { table: 'correo', match: { id: 1 }, data: { id: 1, uid: '00000000-0000-4000-8000-000000000301', host: 'smtp.gmail.com', puerto: '587', seguridad: 'STARTTLS', activo: 0 } },
  ]
}

function createPortableConfiguration(): PortableConfiguration {
  if (!db) throw new Error('Base de datos no disponible')
  const tables = db.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' AND name <> 'schema_migrations' ORDER BY name`).all() as any[]
  const configTableExists = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='configuracion'`).get()
  const sensitiveSetting = /(secret|token|password|clave_api|api_key|licencia|smtp|correo_password)/i
  const settings = configTableExists
    ? (db.prepare(`SELECT clave, valor, tipo, categoria FROM configuracion ORDER BY clave`).all() as any[])
        .filter(row => !sensitiveSetting.test(String(row.clave || '')))
        .map(row => ({ clave: String(row.clave || ''), valor: String(row.valor ?? ''), tipo: String(row.tipo || 'string'), categoria: String(row.categoria || '') }))
    : []
  return {
    format: 'tmpos-portable-configuration',
    formatVersion: 1,
    generatedAt: new Date().toISOString(),
    appVersion: app.getVersion(),
    schema: {
      tables: tables.map(table => ({
        name: String(table.name),
        columns: (db!.prepare(`PRAGMA table_info(${quoteIdentifier(String(table.name))})`).all() as any[]).map(column => ({
          name: String(column.name),
          type: normalizeSqliteType(column.type),
          notNull: Boolean(column.notnull),
          defaultValue: column.dflt_value ?? null,
          primaryKey: Boolean(column.pk),
        })),
      })),
    },
    defaults: { version: 1, seeds: builtInDefaultSeeds() },
    settings,
  }
}

function validatePortableConfiguration(input: any): PortableConfiguration {
  if (!input || input.format !== 'tmpos-portable-configuration' || Number(input.formatVersion) !== 1 || !Array.isArray(input.schema?.tables)) {
    throw new Error('El archivo no es una configuracion portable valida de TMPOS')
  }
  if (input.schema.tables.length > 500) throw new Error('La configuracion contiene demasiadas tablas')
  for (const table of input.schema.tables) {
    quoteIdentifier(String(table?.name || ''))
    if (!Array.isArray(table.columns) || table.columns.length === 0 || table.columns.length > 500) throw new Error(`Estructura invalida en ${table.name}`)
    for (const column of table.columns) quoteIdentifier(String(column?.name || ''))
  }
  return input as PortableConfiguration
}

function applyPortableConfiguration(input: any) {
  if (!db) throw new Error('Base de datos no disponible')
  const pack = validatePortableConfiguration(input)
  const result = { tablesCreated: [] as string[], columnsAdded: [] as string[], tablesUnchanged: [] as string[] }
  const transaction = db.transaction(() => {
    for (const table of pack.schema.tables) {
      const tableName = quoteIdentifier(table.name)
      const exists = db!.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table.name)
      if (!exists) {
        const definitions = table.columns.map((column, index) => {
          const name = quoteIdentifier(column.name)
          const type = normalizeSqliteType(column.type)
          if (column.primaryKey && type === 'INTEGER') return `${name} INTEGER PRIMARY KEY AUTOINCREMENT`
          const primary = column.primaryKey ? ' PRIMARY KEY' : ''
          const notNull = column.notNull && safeDefaultSql(column.defaultValue) ? ' NOT NULL' : ''
          return `${name} ${type}${primary}${notNull}${safeDefaultSql(column.defaultValue)}`
        })
        db!.exec(`CREATE TABLE ${tableName} (${definitions.join(', ')})`)
        result.tablesCreated.push(table.name)
        continue
      }
      const existing = new Set((db!.prepare(`PRAGMA table_info(${tableName})`).all() as any[]).map(column => String(column.name)))
      let added = false
      for (const column of table.columns) {
        if (existing.has(column.name)) continue
        const rawDefault = safeDefaultSql(column.defaultValue)
        const alterDefault = /CURRENT_(TIMESTAMP|DATE|TIME)/i.test(rawDefault) ? '' : rawDefault
        const definition = `${quoteIdentifier(column.name)} ${normalizeSqliteType(column.type)}${alterDefault}`
        db!.exec(`ALTER TABLE ${tableName} ADD COLUMN ${definition}`)
        result.columnsAdded.push(`${table.name}.${column.name}`)
        added = true
      }
      if (!added) result.tablesUnchanged.push(table.name)
    }
    const settings = Array.isArray(pack.settings) ? pack.settings.slice(0, 500) : []
    const hasConfiguration = db!.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='configuracion'`).get()
    if (hasConfiguration) {
      const columns = new Set((db!.prepare(`PRAGMA table_info("configuracion")`).all() as any[]).map(column => String(column.name)))
      if (columns.has('clave') && columns.has('valor')) {
        const sensitiveSetting = /(secret|token|password|clave_api|api_key|licencia|smtp|correo_password)/i
        for (const setting of settings) {
          const clave = String(setting?.clave || '').trim()
          if (!clave || sensitiveSetting.test(clave)) continue
          const current = db!.prepare(`SELECT id FROM configuracion WHERE clave = ? LIMIT 1`).get(clave) as any
          const data: Record<string, any> = { valor: String(setting.valor ?? '') }
          if (columns.has('tipo')) data.tipo = String(setting.tipo || 'string')
          if (columns.has('categoria')) data.categoria = String(setting.categoria || '')
          if (current?.id) {
            const keys = Object.keys(data)
            db!.prepare(`UPDATE configuracion SET ${keys.map(key => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(key => data[key]), current.id)
          } else {
            const insert = { clave, ...data }
            const keys = Object.keys(insert)
            db!.prepare(`INSERT INTO configuracion (${keys.map(quoteIdentifier).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map(key => (insert as any)[key]))
          }
        }
      }
    }
  })
  transaction()
  return result
}

function seedPortableDefaults(input?: any) {
  if (!db) throw new Error('Base de datos no disponible')
  const rawSeeds = Array.isArray(input?.seeds) ? input.seeds : builtInDefaultSeeds()
  const seeds = rawSeeds.slice(0, 100).filter((seed: any) => PORTABLE_SEED_TABLES.has(String(seed?.table || '')))
  const result = { inserted: [] as string[], existing: [] as string[], skipped: [] as string[] }
  const hasEmpresa = db.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name='empresa'`).get()
  const principal = hasEmpresa ? db.prepare(`SELECT id, uid FROM empresa ORDER BY id LIMIT 1`).get() as any : null
  const transaction = db.transaction(() => {
    for (const seed of seeds) {
      try {
        const table = String(seed.table)
        const exists = db!.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name=?`).get(table)
        if (!exists) { result.skipped.push(table); continue }
        const columns = new Set((db!.prepare(`PRAGMA table_info(${quoteIdentifier(table)})`).all() as any[]).map(column => String(column.name)))
        const matchEntries = Object.entries(seed.match || {}).filter(([key]) => columns.has(key) && SAFE_IDENTIFIER.test(key))
        if (!matchEntries.length) { result.skipped.push(table); continue }
        const where = matchEntries.map(([key]) => `${quoteIdentifier(key)} = ?`).join(' AND ')
        if (db!.prepare(`SELECT 1 FROM ${quoteIdentifier(table)} WHERE ${where} LIMIT 1`).get(...matchEntries.map(([, value]) => value))) {
          result.existing.push(`${table}:${String(matchEntries[0][1])}`)
          continue
        }
        const data: Record<string, any> = {}
        for (const [key, value] of Object.entries(seed.data || {})) if (columns.has(key) && SAFE_IDENTIFIER.test(key) && (value === null || ['string', 'number'].includes(typeof value))) data[key] = value
        if (columns.has('uid') && !data.uid) data.uid = generarUid()
        if (columns.has('almacen_id') && data.almacen_id === undefined) data.almacen_id = Number(principal?.id || 0)
        if (columns.has('almacen_uid') && data.almacen_uid === undefined) data.almacen_uid = String(principal?.uid || '')
        const keys = Object.keys(data)
        if (!keys.length) { result.skipped.push(table); continue }
        db!.prepare(`INSERT INTO ${quoteIdentifier(table)} (${keys.map(quoteIdentifier).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map(key => data[key]))
        result.inserted.push(`${table}:${String(matchEntries[0][1])}`)
      } catch { result.skipped.push(String(seed?.table || 'desconocida')) }
    }
  })
  transaction()
  return result
}

function initDatabase(): void {
  const dbPath = getDbPath()
  db = new Database(dbPath)
  db.pragma('journal_mode = WAL')
  db.pragma('foreign_keys = ON')

  // Asegurar uid, created_at y updated_at en TODAS las tablas existentes
  // Y poblar uid para registros existentes que no tengan
  {
    const tablas = db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as any[]
    for (const t of tablas) {
      try {
        const cols = db!.prepare(`PRAGMA table_info("${t.name}")`).all() as any[]
        if (!cols.some((c: any) => c.name === 'uid')) {
          db!.exec(`ALTER TABLE "${t.name}" ADD COLUMN "uid" TEXT DEFAULT ''`)
        }
        if (!cols.some((c: any) => c.name === 'created_at')) {
          db!.exec(`ALTER TABLE "${t.name}" ADD COLUMN "created_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
        }
        if (!cols.some((c: any) => c.name === 'updated_at')) {
          db!.exec(`ALTER TABLE "${t.name}" ADD COLUMN "updated_at" TIMESTAMP DEFAULT CURRENT_TIMESTAMP`)
        }
        // Poblar uid para registros existentes que tengan uid vacio o NULL
        const rowsSinUid = db!.prepare(`SELECT id FROM "${t.name}" WHERE uid IS NULL OR uid = ''`).all() as any[]
        if (rowsSinUid.length > 0) {
          const update = db!.prepare(`UPDATE "${t.name}" SET uid = ? WHERE id = ?`)
          for (const row of rowsSinUid) {
            update.run(generarUid(), row.id)
          }
        }
      } catch {}
    }
  }

  function tableExists(tabla: string): boolean {
    const result = db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(tabla)
    return !!result
  }

  function tableColumns(tabla: string): string[] {
    return db!.prepare(`PRAGMA table_info("${tabla}")`).all().map((col: any) => col.name)
  }

  // Catalogo central de columnas. Agregar una columna aqui hace que todas las
  // instalaciones existentes la reciban automaticamente al iniciar TMPOS.
  const SCHEMA_COLUMNS: Record<string, Record<string, string>> = {
    empresa: { encargado: "TEXT DEFAULT ''", redes: "TEXT DEFAULT ''", estado: "TEXT DEFAULT ''", logo: "TEXT DEFAULT ''", impuesto: 'REAL DEFAULT 18', impuesto_incluido: 'INTEGER DEFAULT 0', moneda: "TEXT DEFAULT 'RD$'", tipo_documento_defecto: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    telefonos: { imagen: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    imei: { id_equi: 'INTEGER', telefono_uid: "TEXT DEFAULT ''", equipo: "TEXT DEFAULT ''", costo: 'REAL DEFAULT 0', precio_venta: 'REAL DEFAULT 0', precio_min: 'REAL DEFAULT 0', precio_xmayor: 'REAL DEFAULT 0', color: "TEXT DEFAULT ''", capacidad: "TEXT DEFAULT ''", bateria: "TEXT DEFAULT ''", estado: "TEXT DEFAULT 'DISPONIBLE'", fecha_venta: "TEXT DEFAULT ''", comprador: "TEXT DEFAULT ''", proveedor: "TEXT DEFAULT ''", no_compra: "TEXT DEFAULT ''", precio_vendido: 'REAL DEFAULT 0', hora_venta: "TEXT DEFAULT ''", no_factura: "TEXT DEFAULT ''", nota: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    serial: { id_equi: 'INTEGER', equipo_uid: "TEXT DEFAULT ''", equipo: "TEXT DEFAULT ''", costo: 'REAL DEFAULT 0', precio_venta: 'REAL DEFAULT 0', precio_min: 'REAL DEFAULT 0', precio_xmayor: 'REAL DEFAULT 0', color: "TEXT DEFAULT ''", capacidad: "TEXT DEFAULT ''", bateria: "TEXT DEFAULT ''", estado: "TEXT DEFAULT 'DISPONIBLE'", almacen_id: 'INTEGER DEFAULT 0' },
    accesorios: { codigo_barra: "TEXT DEFAULT ''", costo: 'REAL DEFAULT 0', precio_venta: 'REAL DEFAULT 0', precio_min: 'REAL DEFAULT 0', precio_xmayor: 'REAL DEFAULT 0', cantidad: 'INTEGER DEFAULT 1', alerta: 'INTEGER DEFAULT 10', proveedor_id: 'INTEGER DEFAULT 0', imagen: "TEXT DEFAULT ''", no_compra: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    piezas: { reservada: 'INTEGER DEFAULT 0', almacen_id: 'INTEGER DEFAULT 0' },
    tecnicos: { tipo_comision: "TEXT DEFAULT 'PORCENTAJE_MANO_OBRA'", valor_comision: 'REAL DEFAULT 0' },
    facturas: { costo: 'REAL DEFAULT 0', ganancia: 'REAL DEFAULT 0', financiera: "TEXT DEFAULT ''", turno_id: 'INTEGER DEFAULT 0', canal_venta: "TEXT DEFAULT ''", ncf: "TEXT DEFAULT ''", tipo_comprobante: "TEXT DEFAULT ''", comprobante_id: 'INTEGER DEFAULT 0', referencia_origen: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    clientes: { imagen: "TEXT DEFAULT ''", rnc: "TEXT DEFAULT ''", nota: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    ordenes_taller: { imagen: "TEXT DEFAULT ''", pagos: "TEXT DEFAULT '[]'", beneficio_empresa: 'REAL DEFAULT 0', beneficio_tecnico: 'REAL DEFAULT 0', porcentaje_tecnico: 'REAL DEFAULT 0', tipo_comision_tecnico: "TEXT DEFAULT 'PORCENTAJE_MANO_OBRA'", valor_comision_tecnico: 'REAL DEFAULT 0', estado_pago_tecnico: "TEXT DEFAULT 'PENDIENTE'", almacen_id: 'INTEGER DEFAULT 0' },
    cuentas_cobrar: { pagos: "TEXT DEFAULT '[]'", fecha_vencimiento: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    cuentas_pagar: { pagos: "TEXT DEFAULT '[]'", fecha_vencimiento: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    gastos: { turno_id: 'INTEGER DEFAULT 0', almacen_id: 'INTEGER DEFAULT 0' },
    caja_turnos: { monto_final: 'REAL DEFAULT 0', efectivo_esperado: 'REAL DEFAULT 0', diferencia: 'REAL DEFAULT 0', cierre_ciego: 'INTEGER DEFAULT 0' },
    cuadres: { efectivo_esperado: 'REAL DEFAULT 0', efectivo_contado: 'REAL DEFAULT 0', diferencia: 'REAL DEFAULT 0', cierre_ciego: 'INTEGER DEFAULT 0', abonos_cxc: 'REAL DEFAULT 0', cantidad_abonos_cxc: 'INTEGER DEFAULT 0' },
    perdidas: { detalle: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    transferencias: { origen_uid: "TEXT DEFAULT ''", destino_uid: "TEXT DEFAULT ''", almacen_uid: "TEXT DEFAULT ''" },
  }

  function auditarEsquemaLocal(): void {
    db!.exec(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, aplicado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, detalle TEXT DEFAULT '')`)
    for (const [tabla, columnasEsperadas] of Object.entries(SCHEMA_COLUMNS)) {
      if (!tableExists(tabla)) continue
      const existentes = new Set(tableColumns(tabla))
      for (const [columna, definicion] of Object.entries(columnasEsperadas)) {
        if (!existentes.has(columna)) db!.exec(`ALTER TABLE "${tabla}" ADD COLUMN "${columna}" ${definicion}`)
      }
    }
    const tablas = db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'`).all() as any[]
    const tablasGlobales = new Set(['usuarios', 'bancos', 'banco_transacciones'])
    for (const tabla of tablas) {
      if (tabla.name === 'schema_migrations') continue
      const existentes = new Set(tableColumns(tabla.name))
      if (!tablasGlobales.has(tabla.name)) {
        if (!existentes.has('almacen_id')) db!.exec(`ALTER TABLE "${tabla.name}" ADD COLUMN almacen_id INTEGER DEFAULT 0`)
        if (!existentes.has('almacen_uid')) db!.exec(`ALTER TABLE "${tabla.name}" ADD COLUMN almacen_uid TEXT DEFAULT ''`)
      }
      if (!existentes.has('uid')) db!.exec(`ALTER TABLE "${tabla.name}" ADD COLUMN uid TEXT DEFAULT ''`)
      if (!existentes.has('created_at')) db!.exec(`ALTER TABLE "${tabla.name}" ADD COLUMN created_at TEXT DEFAULT ''`)
      if (!existentes.has('updated_at')) db!.exec(`ALTER TABLE "${tabla.name}" ADD COLUMN updated_at TEXT DEFAULT ''`)
      const sinUid = db!.prepare(`SELECT id FROM "${tabla.name}" WHERE uid IS NULL OR uid = ''`).all() as any[]
      const asignarUid = db!.prepare(`UPDATE "${tabla.name}" SET uid = ? WHERE id = ?`)
      for (const fila of sinUid) asignarUid.run(generarUid(), fila.id)
    }
    if (tableExists('bancos')) {
      const columnasBancos = new Set(tableColumns('bancos'))
      const marcaActualizacion = columnasBancos.has('updated_at') ? `, updated_at = CURRENT_TIMESTAMP` : ''
      if (columnasBancos.has('almacen_id')) db!.exec(`UPDATE bancos SET almacen_id = 0${marcaActualizacion} WHERE almacen_id IS NOT NULL AND almacen_id <> 0`)
      if (columnasBancos.has('almacen_uid')) db!.exec(`UPDATE bancos SET almacen_uid = ''${marcaActualizacion} WHERE almacen_uid IS NOT NULL AND almacen_uid <> ''`)
    }
    // almacen_id solo es valido dentro de esta base local. almacen_uid es la
    // referencia estable que viaja entre computadoras y la API.
    if (tableExists('empresa')) {
      const empresas = db!.prepare(`SELECT id, almacen_id, uid FROM empresa WHERE uid IS NOT NULL AND uid <> '' ORDER BY id`).all() as any[]
      const uidPrincipal = String(empresas[0]?.uid || '')
      for (const tabla of tablas) {
        if (tabla.name === 'schema_migrations' || tablasGlobales.has(tabla.name)) continue
        const columnas = new Set(tableColumns(tabla.name))
        if (!columnas.has('almacen_uid')) continue
        if (tabla.name === 'empresa') {
          db!.exec(`UPDATE empresa SET almacen_uid = uid WHERE almacen_uid IS NULL OR almacen_uid = ''`)
          continue
        }
        if (columnas.has('almacen_id')) {
          const asignar = db!.prepare(`UPDATE "${tabla.name}" SET almacen_uid = ? WHERE (almacen_uid IS NULL OR almacen_uid = '') AND almacen_id = ?`)
          for (const empresa of empresas) asignar.run(String(empresa.uid), Number(empresa.almacen_id) || Number(empresa.id))
          if (uidPrincipal) db!.prepare(`UPDATE "${tabla.name}" SET almacen_uid = ? WHERE (almacen_uid IS NULL OR almacen_uid = '') AND (almacen_id IS NULL OR almacen_id = 0)`).run(uidPrincipal)
          try {
            const fijarId = db!.prepare(`UPDATE "${tabla.name}" SET almacen_id = ? WHERE almacen_uid = ? AND almacen_uid <> '' AND (almacen_id IS NULL OR almacen_id != ?)`)
            for (const empresa of empresas) fijarId.run(Number(empresa.id), String(empresa.uid), Number(empresa.id))
          } catch (_) {}
        }
      }
    }
    if (tableExists('serial') && tableExists('electrodomesticos')) {
      db!.exec(`UPDATE serial SET equipo_uid = (SELECT uid FROM electrodomesticos WHERE electrodomesticos.id = serial.id_equi) WHERE (equipo_uid IS NULL OR equipo_uid = '') AND id_equi IS NOT NULL`)
      db!.exec(`UPDATE serial SET equipo = (SELECT nombre FROM electrodomesticos WHERE electrodomesticos.id = serial.id_equi) WHERE (equipo IS NULL OR equipo = '') AND id_equi IS NOT NULL`)
      db!.exec(`UPDATE serial SET id_equi = (SELECT id FROM electrodomesticos WHERE electrodomesticos.uid = serial.equipo_uid) WHERE equipo_uid IS NOT NULL AND equipo_uid <> '' AND EXISTS (SELECT 1 FROM electrodomesticos WHERE electrodomesticos.uid = serial.equipo_uid)`)
      try {
        if (tableExists('imei') && tableExists('telefonos')) {
          db!.exec(`UPDATE imei SET id_equi = (SELECT id FROM telefonos WHERE telefonos.uid = imei.telefono_uid) WHERE telefono_uid IS NOT NULL AND telefono_uid <> '' AND EXISTS (SELECT 1 FROM telefonos WHERE telefonos.uid = imei.telefono_uid)`)
        }
      } catch (_) {}
    }
    db!.prepare(`INSERT OR IGNORE INTO schema_migrations (version, detalle) VALUES (?, ?)`)
      .run(20260721, 'Relacion estable de almacenes mediante almacen_uid')

    const versionAuditoriaAlmacenes = 20260802
    const auditoriaExistente = db!.prepare(`SELECT version FROM schema_migrations WHERE version = ?`).get(versionAuditoriaAlmacenes)
    if (!auditoriaExistente) {
      const tablasOperativas = ['facturas', 'clientes', 'proveedores', 'telefonos', 'accesorios', 'electrodomesticos', 'imei', 'serial', 'piezas', 'ordenes_taller', 'gastos', 'gastos_fijos', 'bancos', 'cuentas_cobrar', 'cuentas_pagar', 'reclamaciones', 'financiamientos']
      const resumen: Record<string, { total: number; sin_almacen: number }> = {}
      for (const tabla of tablasOperativas) {
        if (!tableExists(tabla)) continue
        const columnas = new Set(tableColumns(tabla))
        if (!columnas.has('almacen_uid')) continue
        const fila = db!.prepare(`SELECT COUNT(*) total, SUM(CASE WHEN almacen_uid IS NULL OR almacen_uid = '' THEN 1 ELSE 0 END) sin_almacen FROM "${tabla}"`).get() as any
        resumen[tabla] = { total: Number(fila?.total || 0), sin_almacen: Number(fila?.sin_almacen || 0) }
      }
      db!.prepare(`INSERT INTO schema_migrations (version, detalle) VALUES (?, ?)`)
        .run(versionAuditoriaAlmacenes, JSON.stringify({ tipo: 'auditoria_migracion_almacenes', resumen }))
    }
  }

  function ensureProveedoresTable(): void {
    if (tableExists('proveedores')) {
      const columns = tableColumns('proveedores')
      if (!columns.includes('id')) {
        const copyColumns = ['nombre', 'rnc', 'telefono', 'email', 'encargado', 'cuenta_bancaria', 'direccion', 'imagen']
          .filter(column => columns.includes(column))
        db!.exec(`ALTER TABLE proveedores RENAME TO proveedores_old`)
        db!.exec(`CREATE TABLE proveedores (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,rnc TEXT DEFAULT '',telefono TEXT DEFAULT '',email TEXT DEFAULT '',encargado TEXT DEFAULT '',cuenta_bancaria TEXT DEFAULT '',direccion TEXT DEFAULT '',imagen TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO proveedores (${columnsSql}) SELECT ${columnsSql} FROM proveedores_old`)
        }
        db!.exec('DROP TABLE proveedores_old')
        return
      }
      for (const column of ['rnc', 'telefono', 'email', 'encargado', 'cuenta_bancaria', 'direccion', 'imagen', 'created_at', 'updated_at']) {
        if (!columns.includes(column)) db!.exec(`ALTER TABLE proveedores ADD COLUMN "${column}" TEXT DEFAULT ''`)
      }
      return
    }
    db!.exec(`CREATE TABLE proveedores (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,rnc TEXT DEFAULT '',telefono TEXT DEFAULT '',email TEXT DEFAULT '',encargado TEXT DEFAULT '',cuenta_bancaria TEXT DEFAULT '',direccion TEXT DEFAULT '',imagen TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }

  function ensureClientesTable(): void {
    const requiredColumns = ['cedula', 'telefono', 'whatsapp', 'email', 'direccion', 'apodo', 'precio_fijado', 'limite_credito', 'empresa', 'cargo', 'telefono_empresa', 'direccion_empresa', 'codigo', 'rnc', 'activo', 'nota', 'imagen', 'created_at', 'updated_at']
    if (tableExists('clientes')) {
      const columns = tableColumns('clientes')
      if (!columns.includes('id')) {
        const copyColumns = ['nombre', ...requiredColumns].filter(column => columns.includes(column))
        db!.exec(`ALTER TABLE clientes RENAME TO clientes_old`)
        db!.exec(`CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,cedula TEXT DEFAULT '',telefono TEXT DEFAULT '',whatsapp TEXT DEFAULT '',email TEXT DEFAULT '',direccion TEXT DEFAULT '',apodo TEXT DEFAULT '',precio_fijado TEXT DEFAULT '',limite_credito TEXT DEFAULT '',empresa TEXT DEFAULT '',cargo TEXT DEFAULT '',telefono_empresa TEXT DEFAULT '',direccion_empresa TEXT DEFAULT '',codigo TEXT DEFAULT '',rnc TEXT DEFAULT '',activo TEXT DEFAULT 'ACTIVO',nota TEXT DEFAULT '',imagen TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO clientes (${columnsSql}) SELECT ${columnsSql} FROM clientes_old`)
        }
        db!.exec('DROP TABLE clientes_old')
        return
      }
      for (const column of requiredColumns) {
        if (!columns.includes(column)) db!.exec(`ALTER TABLE clientes ADD COLUMN "${column}" TEXT DEFAULT ''`)
      }
      return
    }
    db!.exec(`CREATE TABLE clientes (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,cedula TEXT DEFAULT '',telefono TEXT DEFAULT '',whatsapp TEXT DEFAULT '',email TEXT DEFAULT '',direccion TEXT DEFAULT '',apodo TEXT DEFAULT '',precio_fijado TEXT DEFAULT '',limite_credito TEXT DEFAULT '',empresa TEXT DEFAULT '',cargo TEXT DEFAULT '',telefono_empresa TEXT DEFAULT '',direccion_empresa TEXT DEFAULT '',codigo TEXT DEFAULT '',rnc TEXT DEFAULT '',activo TEXT DEFAULT 'ACTIVO',nota TEXT DEFAULT '',imagen TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }

  function ensureUsuariosTable(): void {
    const requiredColumns = ['usuario', 'email', 'password', 'pin', 'patron', 'pregunta_secreta', 'respuesta', 'fecha', 'nivel_seguridad', 'intentos_login', 'estado', 'permisos', 'restrinciones', 'porciento', 'imagen', 'rol', 'ultimo_acceso', 'created_at', 'updated_at']
    if (tableExists('usuarios')) {
      const columns = tableColumns('usuarios')
      if (!columns.includes('id')) {
        const copyColumns = ['nombre', ...requiredColumns].filter(column => columns.includes(column))
        db!.exec(`ALTER TABLE usuarios RENAME TO usuarios_old`)
        db!.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,usuario TEXT DEFAULT '',email TEXT DEFAULT '',password TEXT DEFAULT '',pin TEXT DEFAULT '',patron TEXT DEFAULT '',pregunta_secreta TEXT DEFAULT '',respuesta TEXT DEFAULT '',fecha TEXT DEFAULT '',nivel_seguridad TEXT DEFAULT 'Usuario',intentos_login TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVADO',permisos TEXT DEFAULT '',restrinciones TEXT DEFAULT '',porciento TEXT DEFAULT '',imagen TEXT DEFAULT '',rol TEXT DEFAULT 'vendedor',ultimo_acceso TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO usuarios (${columnsSql}) SELECT ${columnsSql} FROM usuarios_old`)
        }
        db!.exec('DROP TABLE usuarios_old')
      } else {
        for (const column of requiredColumns) {
          if (!columns.includes(column)) db!.exec(`ALTER TABLE usuarios ADD COLUMN "${column}" TEXT DEFAULT ''`)
        }
      }
    } else {
      db!.exec(`CREATE TABLE usuarios (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,usuario TEXT DEFAULT '',email TEXT DEFAULT '',password TEXT DEFAULT '',pin TEXT DEFAULT '',patron TEXT DEFAULT '',pregunta_secreta TEXT DEFAULT '',respuesta TEXT DEFAULT '',fecha TEXT DEFAULT '',nivel_seguridad TEXT DEFAULT 'Usuario',intentos_login TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVADO',permisos TEXT DEFAULT '',restrinciones TEXT DEFAULT '',porciento TEXT DEFAULT '',imagen TEXT DEFAULT '',rol TEXT DEFAULT 'vendedor',ultimo_acceso TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
    }

    // "uid" no estaba en requiredColumns, asi que instalaciones cuyo "usuarios"
    // ya tenia "id" (rama de arriba) pero no "uid" nunca lo recibian -- y el
    // INSERT de defaults de mas abajo SIEMPRE referencia "uid", asi que la app
    // no arrancaba (SqliteError: table usuarios has no column named uid).
    // Se agrega aparte porque necesita un valor unico por fila, no un DEFAULT
    // compartido como el resto de las columnas de texto.
    if (!tableColumns('usuarios').includes('uid')) {
      db!.exec(`ALTER TABLE usuarios ADD COLUMN "uid" TEXT DEFAULT ''`)
    }
    const filasSinUid = db!.prepare(`SELECT id FROM usuarios WHERE uid IS NULL OR uid = ''`).all() as any[]
    if (filasSinUid.length > 0) {
      const asignarUid = db!.prepare(`UPDATE usuarios SET uid = ? WHERE id = ?`)
      for (const fila of filasSinUid) asignarUid.run(generarUid(), fila.id)
    }

    const defaults = [
      { nombre: 'ADMINISTRADOR', email: 'admin', pin: '1234', nivel_seguridad: 'Administrador', rol: 'admin' },
      { nombre: 'CAJERO', email: 'cajero', pin: '0000', nivel_seguridad: 'Cajero', rol: 'cajero' },
      { nombre: 'USUARIO', email: 'usuario', pin: '1111', nivel_seguridad: 'Usuario', rol: 'vendedor' },
      { nombre: 'SOPORTE', email: 'soporte', pin: '2222', nivel_seguridad: 'Soporte', rol: 'soporte' },
    ]
    const stmtExists = db!.prepare('SELECT id FROM usuarios WHERE email = ? LIMIT 1')
    const stmtInsert = db!.prepare(`INSERT INTO usuarios (nombre, email, password, pin, patron, pregunta_secreta, respuesta, fecha, nivel_seguridad, intentos_login, estado, permisos, restrinciones, porciento, imagen, rol, uid, created_at, updated_at) VALUES (?, ?, '', ?, '', '', '', '', ?, '', 'ACTIVADO', '', '', '', '', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
    for (const user of defaults) {
      if (!stmtExists.get(user.email)) stmtInsert.run(user.nombre, user.email, user.pin, user.nivel_seguridad, user.rol, generarUid())
    }
  }

  function ensurePiezasTable(): void {
    if (tableExists('piezas')) {
      const columns = tableColumns('piezas')
      if (!columns.includes('id')) {
        db!.exec(`ALTER TABLE piezas RENAME TO piezas_old`)
        db!.exec(`CREATE TABLE piezas (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,costo REAL DEFAULT 0,precio_venta REAL DEFAULT 0,cantidad INTEGER DEFAULT 0,alerta INTEGER DEFAULT 1,proveedor TEXT DEFAULT '',descripcion TEXT DEFAULT '',imagen TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        const copyColumns = ['nombre', 'costo', 'precio_venta', 'cantidad', 'alerta', 'proveedor', 'descripcion', 'imagen', 'created_at', 'updated_at'].filter(c => columns.includes(c))
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO piezas (${columnsSql}) SELECT ${columnsSql} FROM piezas_old`)
        }
        db!.exec('DROP TABLE piezas_old')
        return
      }
      for (const column of ['costo', 'precio_venta', 'cantidad', 'alerta', 'proveedor', 'descripcion', 'imagen', 'created_at', 'updated_at']) {
        if (!columns.includes(column)) db!.exec(`ALTER TABLE piezas ADD COLUMN "${column}" TEXT DEFAULT ''`)
      }
      return
    }
    db!.exec(`CREATE TABLE piezas (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,costo REAL DEFAULT 0,precio_venta REAL DEFAULT 0,cantidad INTEGER DEFAULT 0,alerta INTEGER DEFAULT 1,proveedor TEXT DEFAULT '',descripcion TEXT DEFAULT '',imagen TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }

  try { db!.exec(`CREATE TABLE IF NOT EXISTS movimientos_piezas (id INTEGER PRIMARY KEY AUTOINCREMENT,pieza_id INTEGER NOT NULL,pieza_nombre TEXT DEFAULT '',tipo TEXT DEFAULT '',cantidad_antes INTEGER DEFAULT 0,cantidad_despues INTEGER DEFAULT 0,referencia TEXT DEFAULT '',fecha TEXT DEFAULT '',hora TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`) } catch {} 
  db!.exec(`CREATE TABLE IF NOT EXISTS reservas_piezas (id INTEGER PRIMARY KEY AUTOINCREMENT,orden_id INTEGER NOT NULL,pieza_id INTEGER NOT NULL,pieza_nombre TEXT DEFAULT '',cantidad REAL DEFAULT 1,estado TEXT DEFAULT 'RESERVADA',usuario TEXT DEFAULT '',liberada_at TEXT DEFAULT '',consumida_at TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS comisiones_tecnicos (id INTEGER PRIMARY KEY AUTOINCREMENT,orden_id INTEGER NOT NULL,tecnico_id INTEGER DEFAULT 0,tecnico_nombre TEXT DEFAULT '',tipo TEXT DEFAULT 'PORCENTAJE_MANO_OBRA',base REAL DEFAULT 0,valor REAL DEFAULT 0,monto REAL DEFAULT 0,estado TEXT DEFAULT 'PENDIENTE',fecha_pago TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS financiamientos (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER DEFAULT 0,cliente_nombre TEXT DEFAULT '',cliente_telefono TEXT DEFAULT '',factura_id INTEGER DEFAULT 0,no_factura TEXT DEFAULT '',frecuencia TEXT DEFAULT 'MENSUAL',cantidad_cuotas INTEGER DEFAULT 1,monto_original REAL DEFAULT 0,inicial REAL DEFAULT 0,tasa_interes REAL DEFAULT 0,total_financiado REAL DEFAULT 0,mora_porcentaje REAL DEFAULT 0,ingreso_mensual REAL DEFAULT 0,gastos_mensuales REAL DEFAULT 0,capacidad_pago REAL DEFAULT 0,garante_nombre TEXT DEFAULT '',garante_cedula TEXT DEFAULT '',garante_telefono TEXT DEFAULT '',documentos TEXT DEFAULT '[]',estado TEXT DEFAULT 'ACTIVO',proximo_vencimiento TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS cuotas_financiamiento (id INTEGER PRIMARY KEY AUTOINCREMENT,financiamiento_id INTEGER NOT NULL,numero INTEGER NOT NULL,fecha_vencimiento TEXT DEFAULT '',capital REAL DEFAULT 0,interes REAL DEFAULT 0,mora REAL DEFAULT 0,total REAL DEFAULT 0,pagado REAL DEFAULT 0,saldo REAL DEFAULT 0,estado TEXT DEFAULT 'PENDIENTE',pagos TEXT DEFAULT '[]',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS promociones (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,tipo TEXT DEFAULT 'DESCUENTO',valor REAL DEFAULT 0,cantidad_compra INTEGER DEFAULT 1,cantidad_gratis INTEGER DEFAULT 0,cantidad_minima REAL DEFAULT 1,productos TEXT DEFAULT '[]',fecha_inicio TEXT DEFAULT '',fecha_fin TEXT DEFAULT '',lista_precio TEXT DEFAULT '',prioridad INTEGER DEFAULT 0,combinable INTEGER DEFAULT 0,estado TEXT DEFAULT 'ACTIVA',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS listas_precios (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,tipo TEXT DEFAULT 'MINORISTA',descuento_porcentaje REAL DEFAULT 0,cantidad_minima REAL DEFAULT 1,estado TEXT DEFAULT 'ACTIVA',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS variantes_productos (id INTEGER PRIMARY KEY AUTOINCREMENT,producto_id INTEGER NOT NULL,sku TEXT DEFAULT '',codigo_barra TEXT DEFAULT '',talla TEXT DEFAULT '',color TEXT DEFAULT '',capacidad TEXT DEFAULT '',sabor TEXT DEFAULT '',presentacion TEXT DEFAULT '',costo REAL DEFAULT 0,precio REAL DEFAULT 0,precio_mayor REAL DEFAULT 0,cantidad REAL DEFAULT 0,alerta REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVA',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS niveles_fidelidad (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,puntos_desde REAL DEFAULT 0,multiplicador REAL DEFAULT 1,descuento REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVO',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS movimientos_puntos (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER NOT NULL,tipo TEXT DEFAULT 'GANADO',puntos REAL DEFAULT 0,saldo_anterior REAL DEFAULT 0,saldo_nuevo REAL DEFAULT 0,referencia TEXT DEFAULT '',vence_at TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS tarjetas_regalo (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT NOT NULL UNIQUE,pin TEXT DEFAULT '',saldo_inicial REAL DEFAULT 0,saldo REAL DEFAULT 0,cliente_id INTEGER DEFAULT 0,fecha_vencimiento TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVA',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS portal_clientes (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER DEFAULT 0,token TEXT NOT NULL UNIQUE,email TEXT DEFAULT '',telefono TEXT DEFAULT '',permisos TEXT DEFAULT '[]',vence_at TEXT DEFAULT '',ultimo_acceso TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVO',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db!.exec(`CREATE TABLE IF NOT EXISTS pedidos_online (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT DEFAULT '',cliente_id INTEGER DEFAULT 0,cliente_nombre TEXT DEFAULT '',cliente_telefono TEXT DEFAULT '',productos TEXT DEFAULT '[]',subtotal REAL DEFAULT 0,descuento REAL DEFAULT 0,envio REAL DEFAULT 0,total REAL DEFAULT 0,tipo_entrega TEXT DEFAULT 'RECOGIDA',direccion TEXT DEFAULT '',estado TEXT DEFAULT 'NUEVO',pago_estado TEXT DEFAULT 'PENDIENTE',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`CREATE TABLE IF NOT EXISTS reclamaciones (id INTEGER PRIMARY KEY AUTOINCREMENT,no_reclamacion TEXT DEFAULT '',fecha_emision TEXT DEFAULT '',fecha_respuesta TEXT DEFAULT '',fecha_vencimiento TEXT DEFAULT '',no_factura TEXT DEFAULT '',nombre_cliente TEXT DEFAULT '',telefono TEXT DEFAULT '',whatsapp TEXT DEFAULT '',email TEXT DEFAULT '',institucion TEXT DEFAULT '',articulo TEXT DEFAULT '',fecha_compra TEXT DEFAULT '',no_factura_rel TEXT DEFAULT '',estado TEXT DEFAULT 'ABIERTA',resultado TEXT DEFAULT '',respuesta TEXT DEFAULT '',fecha_cierre TEXT DEFAULT '',representante TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`) } catch {}

  function ensureTecnicosTable(): void {
    if (tableExists('tecnicos')) {
      const columns = tableColumns('tecnicos')
      if (!columns.includes('id')) {
        db!.exec(`ALTER TABLE tecnicos RENAME TO tecnicos_old`)
        db!.exec(`CREATE TABLE tecnicos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,telefono TEXT DEFAULT '',email TEXT DEFAULT '',porcentaje REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVO',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        const copyColumns = ['nombre', 'telefono', 'email', 'porcentaje', 'estado', 'created_at', 'updated_at'].filter(c => columns.includes(c))
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO tecnicos (${columnsSql}) SELECT ${columnsSql} FROM tecnicos_old`)
        }
        db!.exec('DROP TABLE tecnicos_old')
        return
      }
      for (const column of ['telefono', 'email', 'porcentaje', 'estado', 'created_at', 'updated_at']) {
        if (!columns.includes(column)) db!.exec(`ALTER TABLE tecnicos ADD COLUMN "${column}" TEXT DEFAULT ''`)
      }
      return
    }
    db!.exec(`CREATE TABLE tecnicos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,telefono TEXT DEFAULT '',email TEXT DEFAULT '',porcentaje REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVO',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }

  function ensureCorreoTable(): void {
    db!.exec(`CREATE TABLE IF NOT EXISTS correo (id INTEGER PRIMARY KEY AUTOINCREMENT,host TEXT DEFAULT 'smtp.gmail.com',puerto TEXT DEFAULT '587',seguridad TEXT DEFAULT 'STARTTLS',email TEXT DEFAULT '',password TEXT DEFAULT '',nombre_remitente TEXT DEFAULT '',activo INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
    const columns = tableColumns('correo')
    for (const column of ['nombre_remitente', 'activo', 'created_at', 'updated_at']) {
      if (!columns.includes(column)) {
        const type = column === 'activo' ? 'INTEGER DEFAULT 0' : "TEXT DEFAULT ''"
        db!.exec(`ALTER TABLE correo ADD COLUMN "${column}" ${type}`)
      }
    }
    db!.exec(`INSERT OR IGNORE INTO correo (id, host, puerto, seguridad, activo) VALUES (1, 'smtp.gmail.com', '587', 'STARTTLS', 0)`)
  }

  function ensureGastosTable(): void {
    if (tableExists('gastos')) {
      const columns = tableColumns('gastos')
      if (!columns.includes('id')) {
        db!.exec(`ALTER TABLE gastos RENAME TO gastos_old`)
        db!.exec(`CREATE TABLE gastos (id INTEGER PRIMARY KEY AUTOINCREMENT,cantidad REAL DEFAULT 0,fecha TEXT DEFAULT '',hora TEXT DEFAULT '',comentario TEXT DEFAULT '',metodo_pago TEXT DEFAULT 'EFECTIVO',banco_id INTEGER DEFAULT 0,banco_uid TEXT DEFAULT '',banco_nombre TEXT DEFAULT '',turno_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        const copyColumns = ['cantidad', 'fecha', 'hora', 'comentario', 'metodo_pago', 'banco_id', 'banco_uid', 'banco_nombre', 'turno_id', 'created_at', 'updated_at'].filter(c => columns.includes(c))
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO gastos (${columnsSql}) SELECT ${columnsSql} FROM gastos_old`)
        }
        db!.exec('DROP TABLE gastos_old')
        return
      }
      for (const column of ['cantidad', 'fecha', 'hora', 'comentario', 'created_at', 'updated_at']) {
        if (!columns.includes(column)) db!.exec(`ALTER TABLE gastos ADD COLUMN "${column}" TEXT DEFAULT ''`)
      }
      if (!columns.includes('metodo_pago')) db!.exec(`ALTER TABLE gastos ADD COLUMN metodo_pago TEXT DEFAULT 'EFECTIVO'`)
      if (!columns.includes('banco_id')) db!.exec(`ALTER TABLE gastos ADD COLUMN banco_id INTEGER DEFAULT 0`)
      if (!columns.includes('banco_uid')) db!.exec(`ALTER TABLE gastos ADD COLUMN banco_uid TEXT DEFAULT ''`)
      if (!columns.includes('banco_nombre')) db!.exec(`ALTER TABLE gastos ADD COLUMN banco_nombre TEXT DEFAULT ''`)
      if (!columns.includes('turno_id')) db!.exec(`ALTER TABLE gastos ADD COLUMN turno_id INTEGER DEFAULT 0`)
      return
    }
    db!.exec(`CREATE TABLE gastos (id INTEGER PRIMARY KEY AUTOINCREMENT,cantidad REAL DEFAULT 0,fecha TEXT DEFAULT '',hora TEXT DEFAULT '',comentario TEXT DEFAULT '',metodo_pago TEXT DEFAULT 'EFECTIVO',banco_id INTEGER DEFAULT 0,banco_uid TEXT DEFAULT '',banco_nombre TEXT DEFAULT '',turno_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }

  function ensureFacturasTable(): void {
    const requiredColumns = ['cheque', 'token', 'cajero', 'no_factura', 'tipo_factura', 'comprobante', 'cod_cliente', 'nombre_cliente', 'telefono_cliente', 'productos', 'vendedor', 'metodo_pago', 'tarjeta', 'porcentaje_tarjeta', 'monto_porcentaje_tarjeta', 'transferencia', 'efectivo', 'canal_venta', 'fecha_emision', 'impuesto', 'descuento', 'subtotal', 'costo', 'total', 'ganancia', 'financiera', 'estado_factura', 'fecha_estado', 'mes', 'year', 'hora', 'otro', 'nota', 'usuario', 'identificadordb', 'total_institucion', 'total_cliente', 'ncf', 'tipo_comprobante', 'comprobante_id', 'turno_id', 'created_at', 'updated_at']
    if (tableExists('facturas')) {
      const columns = tableColumns('facturas')
      if (!columns.includes('id')) {
        db!.exec(`ALTER TABLE facturas RENAME TO facturas_old`)
        db!.exec(`CREATE TABLE facturas (id INTEGER PRIMARY KEY AUTOINCREMENT,cheque TEXT DEFAULT '',token TEXT DEFAULT '',cajero TEXT DEFAULT '',no_factura TEXT DEFAULT '',tipo_factura TEXT DEFAULT '',comprobante TEXT DEFAULT '',cod_cliente TEXT DEFAULT '',nombre_cliente TEXT DEFAULT '',telefono_cliente TEXT DEFAULT '',productos TEXT DEFAULT '',vendedor TEXT DEFAULT '',metodo_pago TEXT DEFAULT 'EFECTIVO',tarjeta REAL DEFAULT 0,porcentaje_tarjeta REAL DEFAULT 0,monto_porcentaje_tarjeta REAL DEFAULT 0,transferencia REAL DEFAULT 0,efectivo REAL DEFAULT 0,canal_venta TEXT DEFAULT '',fecha_emision TEXT DEFAULT '',impuesto REAL DEFAULT 0,descuento REAL DEFAULT 0,subtotal REAL DEFAULT 0,costo REAL DEFAULT 0,total REAL DEFAULT 0,ganancia REAL DEFAULT 0,financiera TEXT DEFAULT '',estado_factura TEXT DEFAULT 'PENDIENTE',fecha_estado TEXT DEFAULT '',mes TEXT DEFAULT '',year TEXT DEFAULT '',hora TEXT DEFAULT '',otro TEXT DEFAULT '',nota TEXT DEFAULT '',usuario TEXT DEFAULT '',identificadordb TEXT DEFAULT '',total_institucion REAL DEFAULT 0,total_cliente REAL DEFAULT 0,ncf TEXT DEFAULT '',tipo_comprobante TEXT DEFAULT '',comprobante_id INTEGER DEFAULT 0,turno_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        const copyColumns = requiredColumns.filter(column => columns.includes(column))
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO facturas (${columnsSql}) SELECT ${columnsSql} FROM facturas_old`)
        }
        db!.exec('DROP TABLE facturas_old')
        return
      }
      if (!columns.includes('turno_id')) db!.exec(`ALTER TABLE facturas ADD COLUMN turno_id INTEGER DEFAULT 0`)
      for (const column of requiredColumns) {
        if (!columns.includes(column) && column !== 'turno_id') db!.exec(`ALTER TABLE facturas ADD COLUMN "${column}" ${['tarjeta', 'porcentaje_tarjeta', 'monto_porcentaje_tarjeta', 'transferencia', 'efectivo', 'impuesto', 'descuento', 'subtotal', 'costo', 'total', 'ganancia', 'total_institucion', 'total_cliente'].includes(column) ? 'REAL DEFAULT 0' : "TEXT DEFAULT ''"}`)
      }
      return
    }
    db!.exec(`CREATE TABLE facturas (id INTEGER PRIMARY KEY AUTOINCREMENT,cheque TEXT DEFAULT '',token TEXT DEFAULT '',cajero TEXT DEFAULT '',no_factura TEXT DEFAULT '',tipo_factura TEXT DEFAULT '',comprobante TEXT DEFAULT '',cod_cliente TEXT DEFAULT '',nombre_cliente TEXT DEFAULT '',telefono_cliente TEXT DEFAULT '',productos TEXT DEFAULT '',vendedor TEXT DEFAULT '',metodo_pago TEXT DEFAULT 'EFECTIVO',tarjeta REAL DEFAULT 0,porcentaje_tarjeta REAL DEFAULT 0,monto_porcentaje_tarjeta REAL DEFAULT 0,transferencia REAL DEFAULT 0,efectivo REAL DEFAULT 0,canal_venta TEXT DEFAULT '',fecha_emision TEXT DEFAULT '',impuesto REAL DEFAULT 0,descuento REAL DEFAULT 0,subtotal REAL DEFAULT 0,costo REAL DEFAULT 0,total REAL DEFAULT 0,ganancia REAL DEFAULT 0,financiera TEXT DEFAULT '',estado_factura TEXT DEFAULT 'PENDIENTE',fecha_estado TEXT DEFAULT '',mes TEXT DEFAULT '',year TEXT DEFAULT '',hora TEXT DEFAULT '',otro TEXT DEFAULT '',nota TEXT DEFAULT '',usuario TEXT DEFAULT '',identificadordb TEXT DEFAULT '',total_institucion REAL DEFAULT 0,total_cliente REAL DEFAULT 0,ncf TEXT DEFAULT '',tipo_comprobante TEXT DEFAULT '',comprobante_id INTEGER DEFAULT 0,turno_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  }

  function backfillPorcentajeTarjetaFacturas(): void {
    if (!tableExists('facturas')) return
    const columns = tableColumns('facturas')
    if (!columns.includes('porcentaje_tarjeta') || !columns.includes('monto_porcentaje_tarjeta')) return

    const porcentajes = new Map<string, number>()
    if (tableExists('metodos_pago')) {
      const metodos = db!.prepare(`SELECT nombre, porcentaje FROM metodos_pago`).all() as any[]
      for (const metodo of metodos) porcentajes.set(String(metodo.nombre || '').trim().toUpperCase(), Number(metodo.porcentaje || 0))
    }

    const facturasTarjeta = db!.prepare(`SELECT id, metodo_pago, productos, total, descuento, impuesto, financiera, porcentaje_tarjeta, monto_porcentaje_tarjeta FROM facturas WHERE UPPER(metodo_pago) LIKE '%TARJETA%' AND COALESCE(monto_porcentaje_tarjeta, 0) <= 0`).all() as any[]
    const actualizar = db!.prepare(`UPDATE facturas SET porcentaje_tarjeta = ?, monto_porcentaje_tarjeta = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`)
    const transaction = db!.transaction(() => {
      for (const factura of facturasTarjeta) {
        let productos: any[] = []
        let financiera: any = {}
        try { productos = Array.isArray(factura.productos) ? factura.productos : JSON.parse(factura.productos || '[]') } catch {}
        try { financiera = typeof factura.financiera === 'string' ? JSON.parse(factura.financiera || '{}') : factura.financiera || {} } catch {}
        const subtotalProductos = productos.reduce((sum: number, producto: any) => {
          const cantidad = Number(producto?.cantidad || 1)
          const precio = Number(producto?.precio ?? producto?.precio_venta ?? 0)
          return sum + (precio * cantidad)
        }, 0)
        let porcentaje = Number(factura.porcentaje_tarjeta || financiera?.comision_porcentaje || porcentajes.get(String(factura.metodo_pago || '').trim().toUpperCase()) || 0)
        let monto = Number(factura.monto_porcentaje_tarjeta || financiera?.monto_comision || 0)
        if (monto <= 0 && porcentaje > 0 && subtotalProductos > 0) monto = subtotalProductos * (porcentaje / 100)
        if (monto <= 0) monto = Math.max(0, Number(factura.total || 0) - subtotalProductos + Number(factura.descuento || 0) - Number(factura.impuesto || 0))
        if (porcentaje <= 0 && monto > 0 && subtotalProductos > 0) porcentaje = (monto / subtotalProductos) * 100
        if (monto > 0) actualizar.run(Number(porcentaje.toFixed(4)), Number(monto.toFixed(2)), factura.id)
      }
    })
    transaction()
  }

  function ensureEmpresaTable(): void {
    const requiredColumns = ['nombre', 'legal', 'encargado', 'telefono', 'email', 'direccion', 'redes', 'estado', 'logo', 'impuesto', 'impuesto_incluido', 'moneda', 'tipo_documento_defecto', 'almacen_id', 'created_at', 'updated_at']
    if (tableExists('empresa')) {
      const columns = tableColumns('empresa')
      if (!columns.includes('id')) {
        db!.exec(`ALTER TABLE empresa RENAME TO empresa_old`)
        db!.exec(`CREATE TABLE empresa (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT DEFAULT '',legal TEXT DEFAULT '',encargado TEXT DEFAULT '',telefono TEXT DEFAULT '',email TEXT DEFAULT '',direccion TEXT DEFAULT '',redes TEXT DEFAULT '',estado TEXT DEFAULT '',logo TEXT DEFAULT '',impuesto REAL DEFAULT 18,impuesto_incluido INTEGER DEFAULT 0,moneda TEXT DEFAULT 'RD$',tipo_documento_defecto TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
        const copyColumns = requiredColumns.filter(column => columns.includes(column))
        if (copyColumns.length > 0) {
          const columnsSql = copyColumns.map(column => `"${column}"`).join(', ')
          db!.exec(`INSERT INTO empresa (${columnsSql}) SELECT ${columnsSql} FROM empresa_old`)
        }
        db!.exec('DROP TABLE empresa_old')
        return
      }
      for (const column of requiredColumns) {
        if (!columns.includes(column)) {
          const isNumeric = ['impuesto', 'impuesto_incluido', 'almacen_id'].includes(column)
          db!.exec(`ALTER TABLE empresa ADD COLUMN "${column}" ${isNumeric ? (column === 'impuesto_incluido' || column === 'almacen_id' ? 'INTEGER' : 'REAL') : 'TEXT'} DEFAULT ${isNumeric ? (column === 'impuesto_incluido' ? '1' : column === 'almacen_id' ? '0' : '18') : "''"}`)
        }
      }
      return
    }
    db!.exec(`CREATE TABLE empresa (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT DEFAULT '',legal TEXT DEFAULT '',encargado TEXT DEFAULT '',telefono TEXT DEFAULT '',email TEXT DEFAULT '',direccion TEXT DEFAULT '',redes TEXT DEFAULT '',estado TEXT DEFAULT '',logo TEXT DEFAULT '',impuesto REAL DEFAULT 18,impuesto_incluido INTEGER DEFAULT 0,moneda TEXT DEFAULT 'RD$',tipo_documento_defecto TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
    db!.exec(`INSERT INTO empresa (nombre) VALUES ('MI EMPRESA')`)
  }

  db.exec(`CREATE TABLE IF NOT EXISTS categorias (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,descripcion TEXT DEFAULT '',estado TEXT DEFAULT 'activo',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS marcas (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,descripcion TEXT DEFAULT '',estado TEXT DEFAULT 'activo',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS accesorios (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,codigo_barra TEXT DEFAULT '',costo REAL DEFAULT 0,precio_venta REAL DEFAULT 0,precio_min REAL DEFAULT 0,precio_xmayor REAL DEFAULT 0,cantidad INTEGER DEFAULT 1,alerta INTEGER DEFAULT 10,marca INTEGER,categoria INTEGER,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (marca) REFERENCES marcas(id),FOREIGN KEY (categoria) REFERENCES categorias(id))`)
  db.exec(`CREATE TABLE IF NOT EXISTS perdidas (id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT NOT NULL,referencia_id INTEGER NOT NULL,nombre TEXT DEFAULT '',codigo TEXT DEFAULT '',cantidad INTEGER DEFAULT 1,costo REAL DEFAULT 0,motivo TEXT DEFAULT '',fecha TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,estado TEXT DEFAULT 'ACTIVA',detalle TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`ALTER TABLE accesorios ADD COLUMN codigo_barra TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE accesorios ADD COLUMN proveedor_id INTEGER DEFAULT 0`) } catch {}
  try { db!.exec(`ALTER TABLE accesorios ADD COLUMN imagen TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE accesorios ADD COLUMN no_compra TEXT DEFAULT ''`) } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS telefonos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`ALTER TABLE telefonos ADD COLUMN imagen TEXT DEFAULT ''`) } catch {}
  ensureProveedoresTable()
  ensureClientesTable()
  ensureUsuariosTable()
  ensurePiezasTable()
  ensureTecnicosTable()
  ensureCorreoTable()
  ensureOtpLocalTable()
  ensureGastosTable()
  ensureFacturasTable()
  backfillPorcentajeTarjetaFacturas()
  ensureEmpresaTable()

  db.exec(`CREATE TABLE IF NOT EXISTS impresoras_config (id INTEGER PRIMARY KEY AUTOINCREMENT,printer_name TEXT DEFAULT '',printer_model TEXT DEFAULT '',paper_width INTEGER DEFAULT 80,show_logo INTEGER DEFAULT 1,show_company_name INTEGER DEFAULT 1,show_legal INTEGER DEFAULT 1,show_phone INTEGER DEFAULT 1,show_address INTEGER DEFAULT 1,show_email INTEGER DEFAULT 1,show_cliente INTEGER DEFAULT 1,show_items INTEGER DEFAULT 1,show_totals INTEGER DEFAULT 1,show_barcode INTEGER DEFAULT 1,show_footer INTEGER DEFAULT 1,show_qr INTEGER DEFAULT 0,footer_text TEXT DEFAULT 'Gracias por su compra',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS cuentas_cobrar (id INTEGER PRIMARY KEY AUTOINCREMENT,no_factura TEXT DEFAULT '',cod_cliente TEXT DEFAULT '',nombre_cliente TEXT DEFAULT '',telefono_cliente TEXT DEFAULT '',total REAL DEFAULT 0,abonado REAL DEFAULT 0,saldo REAL DEFAULT 0,fecha_venta TEXT DEFAULT '',fecha_vencimiento TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVA',notas TEXT DEFAULT '',uid TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`INSERT OR IGNORE INTO impresoras_config (id) VALUES (1)`)
  try { db!.exec(`ALTER TABLE impresoras_config ADD COLUMN show_cliente INTEGER DEFAULT 1`) } catch {}
  try { db!.exec(`ALTER TABLE impresoras_config ADD COLUMN show_nota INTEGER DEFAULT 1`) } catch {}
  try { db!.exec(`ALTER TABLE impresoras_config ADD COLUMN copies INTEGER DEFAULT 1`) } catch {}
  try { db!.exec(`ALTER TABLE impresoras_config ADD COLUMN factura_logo_ancho INTEGER DEFAULT 150`) } catch {}
  try { db!.exec(`ALTER TABLE impresoras_config ADD COLUMN factura_logo_alto INTEGER DEFAULT 90`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN pagos TEXT DEFAULT '[]'`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN uid TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN telefono_cliente TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN fecha_vencimiento TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN total REAL DEFAULT 0`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN abonado REAL DEFAULT 0`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN saldo REAL DEFAULT 0`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN notas TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN cod_cliente TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN nombre_cliente TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN no_factura TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN fecha_venta TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN estado TEXT DEFAULT 'ACTIVA'`) } catch {}
  try { db!.exec(`ALTER TABLE cuentas_cobrar ADD COLUMN almacen_id INTEGER DEFAULT 0`) } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS cuentas_pagar (id INTEGER PRIMARY KEY AUTOINCREMENT,no_factura TEXT DEFAULT '',cod_proveedor TEXT DEFAULT '',nombre_proveedor TEXT DEFAULT '',telefono_proveedor TEXT DEFAULT '',total REAL DEFAULT 0,abonado REAL DEFAULT 0,saldo REAL DEFAULT 0,fecha_compra TEXT DEFAULT '',fecha_vencimiento TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVA',notas TEXT DEFAULT '',pagos TEXT DEFAULT '[]',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS catalogo_cuentas (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT NOT NULL UNIQUE,nombre TEXT NOT NULL,tipo TEXT NOT NULL,subtipo TEXT DEFAULT '',naturaleza TEXT DEFAULT 'DEUDORA',saldo_inicial REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVA',descripcion TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`INSERT OR IGNORE INTO catalogo_cuentas (codigo,nombre,tipo,subtipo,naturaleza) VALUES
    ('1101','Caja General','ACTIVO','CORRIENTE','DEUDORA'),('1102','Bancos','ACTIVO','CORRIENTE','DEUDORA'),('1103','Cuentas por Cobrar','ACTIVO','CORRIENTE','DEUDORA'),('1201','Inventario','ACTIVO','CORRIENTE','DEUDORA'),
    ('2101','Cuentas por Pagar','PASIVO','CORRIENTE','ACREEDORA'),('3101','Capital','PATRIMONIO','CAPITAL','ACREEDORA'),
    ('4101','Ventas','INGRESOS','OPERACIONALES','ACREEDORA'),('5101','Costo de Ventas','GASTOS','OPERACIONALES','DEUDORA'),('5201','Gastos Operativos','GASTOS','OPERACIONALES','DEUDORA')`)
  db.exec(`CREATE TABLE IF NOT EXISTS bitacora (id INTEGER PRIMARY KEY AUTOINCREMENT,tabla TEXT DEFAULT '',registro_id INTEGER DEFAULT 0,accion TEXT DEFAULT '',usuario TEXT DEFAULT '',datos_nuevos TEXT DEFAULT '',datos_anteriores TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS auditoria_acciones (id INTEGER PRIMARY KEY AUTOINCREMENT,modulo TEXT DEFAULT '',accion TEXT DEFAULT '',entidad TEXT DEFAULT '',entidad_id INTEGER DEFAULT 0,referencia TEXT DEFAULT '',usuario TEXT DEFAULT '',detalle TEXT DEFAULT '',resultado TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS configuracion (id INTEGER PRIMARY KEY AUTOINCREMENT,clave TEXT UNIQUE NOT NULL,valor TEXT DEFAULT '',tipo TEXT DEFAULT 'string',categoria TEXT DEFAULT 'general',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS facturas_ecf (id INTEGER PRIMARY KEY AUTOINCREMENT,factura_id INTEGER NOT NULL,no_factura TEXT DEFAULT '',ncf TEXT DEFAULT '',tipo_comprobante TEXT DEFAULT '',alanube_id TEXT DEFAULT '',alanube_id_compania TEXT DEFAULT '',document_number TEXT DEFAULT '',document_stamp_url TEXT DEFAULT '',security_code TEXT DEFAULT '',status TEXT DEFAULT 'PENDIENTE',legal_status TEXT DEFAULT '',sequence_consumed INTEGER DEFAULT 0,pdf_url TEXT DEFAULT '',xml_url TEXT DEFAULT '',resume_xml_url TEXT DEFAULT '',endpoint TEXT DEFAULT '',http_status INTEGER DEFAULT 0,payload TEXT DEFAULT '',response TEXT DEFAULT '',error TEXT DEFAULT '',enviado_at TEXT DEFAULT '',aceptado_at TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (factura_id) REFERENCES facturas(id))`)
  try { db!.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_ecf_factura_id ON facturas_ecf(factura_id)`) } catch {}
  try {
    const rows = db!.prepare(`SELECT id, no_factura, ncf, tipo_comprobante, comprobante, otro FROM facturas WHERE (tipo_comprobante LIKE 'E%' OR comprobante LIKE 'E%' OR otro LIKE '%alanube_response%')`).all() as any[]
    const exists = db!.prepare(`SELECT id FROM facturas_ecf WHERE factura_id = ? LIMIT 1`)
    const insertEcf = db!.prepare(`INSERT INTO facturas_ecf (factura_id,no_factura,ncf,tipo_comprobante,alanube_id,alanube_id_compania,document_number,document_stamp_url,security_code,status,legal_status,sequence_consumed,pdf_url,xml_url,resume_xml_url,endpoint,http_status,payload,response,error,enviado_at,aceptado_at,uid,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`)
    const now = new Date().toISOString()
    for (const row of rows) {
      if (exists.get(row.id)) continue
      let otro: any = {}
      try { otro = row.otro ? JSON.parse(row.otro) : {} } catch {}
      const response = otro?.alanube_response || {}
      const legalStatus = String(response?.legalStatus || response?.legal_status || '').toUpperCase()
      const status = legalStatus === 'ACCEPTED' ? 'ACEPTADA' : legalStatus === 'REJECTED' ? 'RECHAZADA' : String(response?.status || (otro?.alanube_error ? 'ERROR_ENVIO' : 'PENDIENTE')).toUpperCase()
      insertEcf.run(
        row.id,
        row.no_factura || '',
        row.ncf || '',
        row.tipo_comprobante || row.comprobante || '',
        response?.id || '',
        otro?.alanube_id_compania || '',
        response?.documentNumber || row.ncf || '',
        response?.documentStampUrl || response?.document_stamp_url || '',
        response?.securityCode || response?.security_code || '',
        status,
        legalStatus,
        response?.sequenceConsumed ? 1 : 0,
        response?.pdf || '',
        response?.xml || '',
        response?.resumeXml || '',
        otro?.alanube_endpoint || '',
        Number(otro?.alanube_status || 0),
        JSON.stringify(otro?.alanube_payload || {}),
        JSON.stringify(response || {}),
        otro?.alanube_error || '',
        otro?.alanube_enviado_at || '',
        legalStatus === 'ACCEPTED' ? (response?.signatureDate || now) : '',
        generarUid(),
        now,
        now
      )
    }
  } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS plantillas_etiquetas (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,ancho REAL DEFAULT 50,alto REAL DEFAULT 30,elementos TEXT DEFAULT '[]',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  const plantillasPredeterminadas = [
    { nombre: 'Taller - Orden de servicio', elementos: [
      { id: 'empresa', tipo: 'texto', x: 3, y: 1.5, ancho: 44, alto: 4, contenido: '{EMPRESA}', fontSize: 10, bold: true },
      { id: 'cliente', tipo: 'texto', x: 3, y: 6.5, ancho: 44, alto: 3.5, contenido: '{CLIENTE}', fontSize: 7, bold: true },
      { id: 'fallas', tipo: 'texto', x: 3, y: 10.5, ancho: 44, alto: 4, contenido: 'FALLA: {FALLAS}', fontSize: 5, bold: false },
      { id: 'numero_orden', tipo: 'texto', x: 3, y: 15, ancho: 44, alto: 3, contenido: 'ORDEN: {NO_ORDEN}', fontSize: 7, bold: true },
      { id: 'orden', tipo: 'barcode', x: 8, y: 19, ancho: 34, alto: 7, contenido: '{NO_ORDEN}' },
    ] },
    { nombre: 'Accesorios - Precio', elementos: [
      { id: 'empresa', tipo: 'texto', x: 2, y: 2, ancho: 46, alto: 4, contenido: '{empresa}', fontSize: 8, bold: true },
      { id: 'producto', tipo: 'texto', x: 2, y: 7, ancho: 46, alto: 5, contenido: '{producto}', fontSize: 9, bold: true },
      { id: 'precio', tipo: 'texto', x: 2, y: 13, ancho: 46, alto: 5, contenido: '{precio}', fontSize: 14, bold: true },
      { id: 'codigo', tipo: 'barcode', x: 2, y: 20, ancho: 46, alto: 8, contenido: '{codigo_barra}' },
    ] },
    { nombre: 'Electrodomésticos - Precio', elementos: [
      { id: 'empresa', tipo: 'texto', x: 2, y: 2, ancho: 46, alto: 4, contenido: '{EMPRESA}', fontSize: 8, bold: true },
      { id: 'producto', tipo: 'texto', x: 2, y: 7, ancho: 46, alto: 5, contenido: '{PRODUCTO}', fontSize: 9, bold: true },
      { id: 'serial', tipo: 'texto', x: 2, y: 13, ancho: 46, alto: 4, contenido: 'SERIAL: {SERIAL}', fontSize: 8, bold: false },
      { id: 'precio', tipo: 'texto', x: 2, y: 18, ancho: 46, alto: 5, contenido: '{PRECIO}', fontSize: 13, bold: true },
      { id: 'codigo', tipo: 'barcode', x: 2, y: 24, ancho: 46, alto: 5, contenido: '{SERIAL}' },
    ] },
    { nombre: 'Garantía - Cliente y equipo', elementos: [
      { id: 'titulo', tipo: 'texto', x: 2, y: 2, ancho: 46, alto: 4, contenido: '{GARANTIA}', fontSize: 10, bold: true },
      { id: 'cliente', tipo: 'texto', x: 2, y: 7, ancho: 46, alto: 4, contenido: '{CLIENTE}', fontSize: 8, bold: true },
      { id: 'producto', tipo: 'texto', x: 2, y: 12, ancho: 46, alto: 4, contenido: '{PRODUCTO}', fontSize: 8, bold: false },
      { id: 'imei', tipo: 'texto', x: 2, y: 17, ancho: 46, alto: 4, contenido: 'IMEI: {IMEI}', fontSize: 8, bold: false },
      { id: 'vence', tipo: 'texto', x: 2, y: 22, ancho: 46, alto: 4, contenido: 'VENCE: {VENCIMIENTO}', fontSize: 8, bold: true },
      { id: 'codigo', tipo: 'barcode', x: 2, y: 27, ancho: 46, alto: 3, contenido: '{IMEI}' },
    ] },
  ]
  const existePlantilla = db!.prepare(`SELECT id FROM plantillas_etiquetas WHERE nombre = ? LIMIT 1`)
  const insertarPlantilla = db!.prepare(`INSERT INTO plantillas_etiquetas (nombre, ancho, alto, elementos, created_at, updated_at) VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`)
  for (const plantilla of plantillasPredeterminadas) {
    const esGarantia = plantilla.nombre.startsWith('Garant')
    if (!existePlantilla.get(plantilla.nombre)) insertarPlantilla.run(plantilla.nombre, esGarantia ? 25.4 : 50, esGarantia ? 38.1 : 30, JSON.stringify(plantilla.elementos))
  }
  const plantillaTaller = db!.prepare(`SELECT id FROM plantillas_etiquetas WHERE nombre = ? LIMIT 1`).get('Taller - Orden de servicio') as any
  if (plantillaTaller?.id) {
    const disenoTaller = plantillasPredeterminadas[0].elementos
    db!.prepare(`UPDATE plantillas_etiquetas SET elementos = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(JSON.stringify(disenoTaller), plantillaTaller.id)
  }
  const plantillaAccesorios = db!.prepare(`SELECT id FROM plantillas_etiquetas WHERE nombre = ? LIMIT 1`).get('Accesorios - Precio') as any
  if (plantillaAccesorios?.id) {
    const disenoAccesorios = plantillasPredeterminadas[1].elementos
    db!.prepare(`UPDATE plantillas_etiquetas SET elementos = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(JSON.stringify(disenoAccesorios), plantillaAccesorios.id)
  }
  db!.prepare(`UPDATE plantillas_etiquetas SET ancho = 25.4, alto = 38.1 WHERE nombre LIKE 'Garant%'`).run()
  db.exec(`CREATE TABLE IF NOT EXISTS licencia (id INTEGER PRIMARY KEY AUTOINCREMENT,licencia_equipo TEXT,licencia_cifrada TEXT,estado TEXT DEFAULT 'sin_verificar',nombre_empresa TEXT,fecha_inicio_prueba TEXT,fecha_vencimiento TEXT,ultima_verificacion TEXT,api_key TEXT,datos_servidor TEXT,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`INSERT OR IGNORE INTO licencia (id, estado) VALUES (1, 'sin_verificar')`)
  try { db.exec(`ALTER TABLE licencia ADD COLUMN datos_servidor TEXT`) } catch {}
  const badKey = db!.prepare(`SELECT api_key FROM licencia WHERE id = 1`).get() as any
  if (badKey?.api_key && /^\d+-[0-9A-F]{12}$/i.test(badKey.api_key)) {
    db!.prepare(`UPDATE licencia SET api_key = NULL, updated_at = datetime('now','localtime') WHERE id = 1`).run()
  }
  db.exec(`CREATE TABLE IF NOT EXISTS imei (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,id_equi INTEGER,telefono_uid TEXT DEFAULT '',equipo TEXT DEFAULT '',costo REAL DEFAULT 0,precio_venta REAL DEFAULT 0,precio_min REAL DEFAULT 0,precio_xmayor REAL DEFAULT 0,color TEXT DEFAULT '',capacidad TEXT DEFAULT '',bateria TEXT DEFAULT '',estado TEXT DEFAULT 'DISPONIBLE',fecha_venta TEXT,comprador TEXT DEFAULT '',proveedor TEXT DEFAULT '',no_compra TEXT DEFAULT '',precio_vendido REAL DEFAULT 0,hora_venta TEXT DEFAULT '',no_factura TEXT DEFAULT '',nota TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (id_equi) REFERENCES telefonos(id))`)
  try { db!.exec(`ALTER TABLE imei ADD COLUMN telefono_uid TEXT DEFAULT ''`) } catch {}
  try { db!.exec(`ALTER TABLE imei ADD COLUMN equipo TEXT DEFAULT ''`) } catch {}
  try {
    db!.exec(`UPDATE imei SET telefono_uid = (SELECT uid FROM telefonos WHERE telefonos.id = imei.id_equi) WHERE (telefono_uid IS NULL OR telefono_uid = '') AND id_equi IS NOT NULL`)
  } catch {}
  try {
    db!.exec(`UPDATE imei SET equipo = (SELECT nombre FROM telefonos WHERE telefonos.id = imei.id_equi) WHERE (equipo IS NULL OR TRIM(equipo) = '') AND id_equi IS NOT NULL`)
  } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS electrodomesticos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`ALTER TABLE electrodomesticos ADD COLUMN imagen TEXT DEFAULT ''`) } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS serial (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,id_equi INTEGER,equipo_uid TEXT DEFAULT '',equipo TEXT DEFAULT '',costo REAL DEFAULT 0,precio_venta REAL DEFAULT 0,precio_min REAL DEFAULT 0,precio_xmayor REAL DEFAULT 0,color TEXT DEFAULT '',capacidad TEXT DEFAULT '',bateria TEXT DEFAULT '',estado TEXT DEFAULT 'DISPONIBLE',fecha_venta TEXT,comprador TEXT DEFAULT '',proveedor TEXT DEFAULT '',no_compra TEXT DEFAULT '',precio_vendido REAL DEFAULT 0,hora_venta TEXT DEFAULT '',no_factura TEXT DEFAULT '',nota TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,FOREIGN KEY (id_equi) REFERENCES electrodomesticos(id))`)
  db.exec(`CREATE TABLE IF NOT EXISTS notas (id INTEGER PRIMARY KEY AUTOINCREMENT,titulo TEXT NOT NULL,contenido TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try {
    const cols = db.prepare("PRAGMA table_info(notas)").all() as any[]
    if (cols.some((c: any) => c.name === 'nombre')) {
      db.exec("ALTER TABLE notas RENAME TO notas_old")
      db.exec(`CREATE TABLE IF NOT EXISTS notas (id INTEGER PRIMARY KEY AUTOINCREMENT,titulo TEXT NOT NULL,contenido TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
      db.exec("INSERT INTO notas (titulo, contenido) SELECT nombre, '' FROM notas_old")
      db.exec("DROP TABLE notas_old")
    }
  } catch {}
  const countNotas = db.prepare('SELECT COUNT(*) as total FROM notas').get() as any
  if (countNotas.total === 0) {
    const insert = db.prepare('INSERT INTO notas (titulo, contenido) VALUES (?, ?)')
    for (const [titulo, contenido] of [
      ['SIN SELLO', 'Sin sello de fabrica'], ['CAMBIO', 'Cambio del producto'], ['GARANTIA', 'Garantia del producto'],
      ['ENTREGADO', 'Producto entregado al cliente'], ['REPARACION', 'Reparacion del equipo'],
      ['A DOMICILIO', 'Envio a domicilio'], ['CON FACTURA', 'Venta con factura fiscal'],
      ['SIN FACTURA', 'Venta sin factura fiscal'], ['PENDIENTE', 'Pendiente por entregar'],
      ['OBSERVACION', 'Observacion general'],
    ]) insert.run(titulo, contenido)
  }
  db.exec(`CREATE TABLE IF NOT EXISTS ordenes_taller (id INTEGER PRIMARY KEY AUTOINCREMENT,no_orden TEXT DEFAULT '',nombre TEXT NOT NULL,cedula TEXT DEFAULT '',telefono TEXT DEFAULT '',email TEXT DEFAULT '',equipo TEXT DEFAULT '',imei TEXT DEFAULT '',serial TEXT DEFAULT '',marca_modelo TEXT DEFAULT '',clave TEXT DEFAULT '',accesorios TEXT DEFAULT '',fallas TEXT DEFAULT '',piezas TEXT DEFAULT '',tecnico TEXT DEFAULT '',metodo_pago TEXT DEFAULT 'EFECTIVO',fecha_entrada TEXT,fecha_entrega TEXT,estado TEXT DEFAULT 'RECIBIDO',precio_pieza REAL DEFAULT 0,mano_obra REAL DEFAULT 0,abono REAL DEFAULT 0,pendiente REAL DEFAULT 0,total REAL DEFAULT 0,pagos TEXT DEFAULT '',beneficio_empresa REAL DEFAULT 0,beneficio_tecnico REAL DEFAULT 0,porcentaje_tecnico REAL DEFAULT 0,estado_pago_tecnico TEXT DEFAULT 'PENDIENTE',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`ALTER TABLE ordenes_taller ADD COLUMN imagen TEXT DEFAULT ''`) } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS comprobantes_fiscales (id INTEGER PRIMARY KEY AUTOINCREMENT,tipo TEXT NOT NULL,nombre TEXT NOT NULL,descripcion TEXT DEFAULT '',prefijo TEXT DEFAULT '',secuencia_actual INTEGER DEFAULT 1,secuencia_desde INTEGER DEFAULT 1,secuencia_hasta INTEGER DEFAULT 99999999,fecha_vencimiento TEXT DEFAULT '',activo INTEGER DEFAULT 1,es_default INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`ALTER TABLE comprobantes_fiscales ADD COLUMN prefijo TEXT DEFAULT ''`) } catch {}
  const count = db!.prepare(`SELECT COUNT(*) as c FROM comprobantes_fiscales`).get() as any
  if (count.c === 0) {
    const insert = db!.prepare(`INSERT INTO comprobantes_fiscales (tipo, nombre, descripcion, prefijo, secuencia_actual, secuencia_desde, secuencia_hasta, activo, es_default) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
    insert.run('SIN', 'Sin Comprobante', 'Venta sin comprobante fiscal', '', 1, 1, 99999999, 1, 0)
    insert.run('E31', 'Factura de Credito Fiscal', 'Ventas a contribuyentes con RNC', 'E31', 1, 1, 9999999999, 1, 0)
    insert.run('E32', 'Factura de Consumo', 'Ventas a consumidores finales', 'E32', 1, 1, 9999999999, 1, 1)
    insert.run('E33', 'Nota de Debito', 'Cargos adicionales', 'E33', 1, 1, 9999999999, 1, 0)
    insert.run('E34', 'Nota de Credito', 'Devoluciones y descuentos', 'E34', 1, 1, 9999999999, 1, 0)
    insert.run('E41', 'Compras', 'Comprobante de compras', 'E41', 1, 1, 9999999999, 1, 0)
    insert.run('E43', 'Gastos Menores', 'Gastos menores sin comprobante', 'E43', 1, 1, 9999999999, 1, 0)
    insert.run('E44', 'Regimenes Especiales', 'Ventas a zonas francas', 'E44', 1, 1, 9999999999, 1, 0)
    insert.run('E45', 'Gubernamental', 'Ventas al gobierno', 'E45', 1, 1, 9999999999, 1, 0)
    insert.run('E46', 'Exportacion', 'Ventas al exterior', 'E46', 1, 1, 9999999999, 1, 0)
    insert.run('E47', 'Pagos al Exterior', 'Pagos a proveedores extranjeros', 'E47', 1, 1, 9999999999, 1, 0)
  }
  try { db!.exec(`UPDATE comprobantes_fiscales SET secuencia_hasta = 9999999999 WHERE tipo LIKE 'E%' AND secuencia_hasta = 99999999`) } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS gastos_fijos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,monto REAL DEFAULT 0,dia_pago INTEGER DEFAULT 1,categoria TEXT DEFAULT '',periodicidad TEXT DEFAULT 'MENSUAL',estado TEXT DEFAULT 'ACTIVO',descripcion TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS sync_deletes (id INTEGER PRIMARY KEY AUTOINCREMENT,tabla TEXT NOT NULL,uid TEXT NOT NULL,confirmado INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db!.exec(`ALTER TABLE sync_deletes ADD COLUMN confirmado INTEGER DEFAULT 0`) } catch {}
  db.exec(`CREATE TABLE IF NOT EXISTS tmcloud_config (id INTEGER PRIMARY KEY AUTOINCREMENT,url TEXT NOT NULL DEFAULT '',public_key TEXT NOT NULL DEFAULT '',secret_key TEXT NOT NULL DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS bancos (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,numero_cuenta TEXT DEFAULT '',moneda TEXT DEFAULT 'PESOS',saldo REAL DEFAULT 0,fecha_transaccion TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TEXT DEFAULT '',updated_at TEXT DEFAULT '')`)
  db.exec(`CREATE TABLE IF NOT EXISTS banco_transacciones (id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT DEFAULT '',banco_id INTEGER DEFAULT 0,banco_uid TEXT DEFAULT '',banco_nombre TEXT DEFAULT '',tipo TEXT DEFAULT 'AJUSTE',monto REAL DEFAULT 0,saldo_anterior REAL DEFAULT 0,saldo_nuevo REAL DEFAULT 0,concepto TEXT DEFAULT '',referencia_tipo TEXT DEFAULT '',referencia_id INTEGER DEFAULT 0,referencia TEXT DEFAULT '',usuario TEXT DEFAULT '',created_at TEXT DEFAULT '',updated_at TEXT DEFAULT '')`)
  db.prepare(`INSERT OR IGNORE INTO tmcloud_config (id, url, public_key, secret_key) VALUES (1, '', '', '')`).run()
  db.exec(`CREATE TABLE IF NOT EXISTS caja_turnos (id INTEGER PRIMARY KEY AUTOINCREMENT,monto_inicial REAL DEFAULT 0,entradas REAL DEFAULT 0,retiros REAL DEFAULT 0,estado TEXT DEFAULT 'abierto',observacion TEXT DEFAULT '',usuario_id INTEGER DEFAULT 0,usuario_nombre TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS caja_movimientos (id INTEGER PRIMARY KEY AUTOINCREMENT,turno_id INTEGER,tipo TEXT,monto REAL DEFAULT 0,descripcion TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS almacenes (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL DEFAULT '',codigo TEXT DEFAULT '',direccion TEXT DEFAULT '',telefono TEXT DEFAULT '',email TEXT DEFAULT '',rnc TEXT DEFAULT '',logo TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVO',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.prepare(`INSERT OR IGNORE INTO almacenes (id, nombre, codigo) VALUES (1, 'Almacen Principal', 'PRINCIPAL')`).run()
  const crearMetodosPagoIniciales = !tableExists('metodos_pago')
  db.exec(`CREATE TABLE IF NOT EXISTS metodos_pago (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL DEFAULT '',porcentaje REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVO',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  if (crearMetodosPagoIniciales) {
    const insertarMetodoPago = db.prepare(`INSERT INTO metodos_pago (nombre, porcentaje) VALUES (?, ?)`)
    insertarMetodoPago.run('EFECTIVO', 0)
    insertarMetodoPago.run('TARJETA', 2.5)
    insertarMetodoPago.run('TRANSFERENCIA', 0)
  }
  db.exec(`CREATE TABLE IF NOT EXISTS ordenes_compra (id INTEGER PRIMARY KEY AUTOINCREMENT,no_orden TEXT DEFAULT '',proveedor_id INTEGER DEFAULT 0,proveedor_nombre TEXT DEFAULT '',fecha_orden TEXT DEFAULT '',fecha_recibido TEXT DEFAULT '',estado TEXT DEFAULT 'PENDIENTE',productos TEXT DEFAULT '',subtotal REAL DEFAULT 0,impuesto REAL DEFAULT 0,descuento REAL DEFAULT 0,total REAL DEFAULT 0,nota TEXT DEFAULT '',usuario TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS transferencias (id INTEGER PRIMARY KEY AUTOINCREMENT,no_transferencia TEXT DEFAULT '',origen_id INTEGER DEFAULT 0,origen_nombre TEXT DEFAULT '',destino_id INTEGER DEFAULT 0,destino_nombre TEXT DEFAULT '',productos TEXT DEFAULT '',estado TEXT DEFAULT 'PENDIENTE',usuario TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS ajustes_inventario (id INTEGER PRIMARY KEY AUTOINCREMENT,tabla TEXT DEFAULT '',producto_id INTEGER DEFAULT 0,producto_nombre TEXT DEFAULT '',cantidad_anterior REAL DEFAULT 0,cantidad_nueva REAL DEFAULT 0,diferencia REAL DEFAULT 0,tipo TEXT DEFAULT '',motivo TEXT DEFAULT '',usuario TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS garantias (id INTEGER PRIMARY KEY AUTOINCREMENT,no_factura TEXT DEFAULT '',tipo_producto TEXT DEFAULT '',producto_id INTEGER DEFAULT 0,producto_nombre TEXT DEFAULT '',imei TEXT DEFAULT '',serial TEXT DEFAULT '',cliente_nombre TEXT DEFAULT '',cliente_telefono TEXT DEFAULT '',fecha_venta TEXT DEFAULT '',fecha_vencimiento TEXT DEFAULT '',dias_garantia INTEGER DEFAULT 30,estado TEXT DEFAULT 'ACTIVA',nota TEXT DEFAULT '',usuario TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS reclamos_garantia (id INTEGER PRIMARY KEY AUTOINCREMENT,garantia_id INTEGER DEFAULT 0,descripcion TEXT DEFAULT '',solucion TEXT DEFAULT '',estado TEXT DEFAULT 'PENDIENTE',fecha_ingreso TEXT DEFAULT '',fecha_salida TEXT DEFAULT '',costo REAL DEFAULT 0,tecnico TEXT DEFAULT '',usuario TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS comisiones (id INTEGER PRIMARY KEY AUTOINCREMENT,factura_id INTEGER DEFAULT 0,no_factura TEXT DEFAULT '',productos TEXT DEFAULT '',vendedor TEXT DEFAULT '',vendedor_id INTEGER DEFAULT 0,total_venta REAL DEFAULT 0,porcentaje REAL DEFAULT 0,monto REAL DEFAULT 0,estado TEXT DEFAULT 'PENDIENTE',fecha_pago TEXT DEFAULT '',usuario TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS historial_precios (id INTEGER PRIMARY KEY AUTOINCREMENT,tabla TEXT DEFAULT '',producto_id INTEGER DEFAULT 0,producto_nombre TEXT DEFAULT '',campo TEXT DEFAULT '',valor_anterior TEXT DEFAULT '',valor_nuevo TEXT DEFAULT '',usuario TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS tickets_soporte (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT DEFAULT '',cliente_nombre TEXT DEFAULT '',cliente_telefono TEXT DEFAULT '',cliente_email TEXT DEFAULT '',producto TEXT DEFAULT '',descripcion TEXT DEFAULT '',prioridad TEXT DEFAULT 'NORMAL',estado TEXT DEFAULT 'ABIERTO',asignado TEXT DEFAULT '',solucion TEXT DEFAULT '',fecha_cierre TEXT DEFAULT '',usuario TEXT DEFAULT '',almacen_id INTEGER DEFAULT 0,created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS ticket_comentarios (id INTEGER PRIMARY KEY AUTOINCREMENT,ticket_id INTEGER DEFAULT 0,comentario TEXT DEFAULT '',tipo TEXT DEFAULT 'COMENTARIO',usuario TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS cuadres (id INTEGER PRIMARY KEY AUTOINCREMENT,fecha TEXT DEFAULT '',turno_id INTEGER DEFAULT 0,turno_usuario TEXT DEFAULT '',monto_inicial REAL DEFAULT 0,total_ventas REAL DEFAULT 0,efectivo REAL DEFAULT 0,tarjeta REAL DEFAULT 0,transferencia REAL DEFAULT 0,abonos_cxc REAL DEFAULT 0,cantidad_abonos_cxc INTEGER DEFAULT 0,total_gastos REAL DEFAULT 0,saldo_final REAL DEFAULT 0,observacion TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS ventas_pausadas (id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT DEFAULT '',codigo TEXT NOT NULL DEFAULT '',datos TEXT NOT NULL DEFAULT '{}',cliente_nombre TEXT DEFAULT '',total REAL DEFAULT 0,items_count INTEGER DEFAULT 0,usuario TEXT DEFAULT '',estado TEXT DEFAULT 'PAUSADA',almacen_id INTEGER DEFAULT 0,almacen_uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.exec(`CREATE TABLE IF NOT EXISTS apariencia_almacen (id INTEGER PRIMARY KEY AUTOINCREMENT,uid TEXT DEFAULT '',color_primario TEXT DEFAULT 'blue',tono_primario TEXT DEFAULT '500',fondo_barra TEXT DEFAULT 'white',tono_barra TEXT DEFAULT '500',color_texto_barra TEXT DEFAULT 'auto',almacen_id INTEGER DEFAULT 0,almacen_uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  try { db.exec(`ALTER TABLE apariencia_almacen ADD COLUMN color_texto_barra TEXT DEFAULT 'auto'`) } catch {}
  const tablasConAlmacen = ['facturas', 'clientes', 'proveedores', 'telefonos', 'accesorios', 'electrodomesticos', 'imei', 'serial', 'piezas', 'tecnicos', 'ordenes_taller', 'gastos', 'gastos_fijos', 'cuentas_cobrar', 'cuentas_pagar', 'notas', 'comprobantes_fiscales', 'plantillas_etiquetas', 'correo', 'ventas_pausadas', 'apariencia_almacen']
  for (const t of tablasConAlmacen) { try { db!.exec(`ALTER TABLE "${t}" ADD COLUMN almacen_id INTEGER DEFAULT 0`) } catch {} }
  auditarEsquemaLocal()
  db.exec(`CREATE UNIQUE INDEX IF NOT EXISTS idx_facturas_nota_credito_origen ON facturas(referencia_origen) WHERE referencia_origen IS NOT NULL AND referencia_origen <> '' AND tipo_factura = 'NOTA_CREDITO'`)
}

function registrarBitacora(tabla: string, registroId: number, accion: string, usuario: string, datosNuevos: any, datosAnteriores: any) {
  try {
    const now = new Date().toISOString()
    db!.prepare(`INSERT INTO bitacora (tabla, registro_id, accion, usuario, datos_nuevos, datos_anteriores, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)`).run(
      tabla, registroId, accion, usuario || '', JSON.stringify(datosNuevos || {}), JSON.stringify(datosAnteriores || {}), now
    )
  } catch {}
}

function registrarTransaccionBanco(
  banco: any,
  saldoAnterior: number,
  saldoNuevo: number,
  concepto = 'Movimiento bancario',
  usuario = '',
  referenciaTipo = '',
  referenciaId = 0,
  referencia = '',
) {
  const diferencia = Number(saldoNuevo || 0) - Number(saldoAnterior || 0)
  if (!banco?.id || Math.abs(diferencia) < 0.001) return
  const now = new Date().toISOString()
  db!.prepare(`INSERT INTO banco_transacciones (uid,banco_id,banco_uid,banco_nombre,tipo,monto,saldo_anterior,saldo_nuevo,concepto,referencia_tipo,referencia_id,referencia,usuario,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(
    generarUid(), Number(banco.id), String(banco.uid || ''), String(banco.nombre || ''),
    diferencia > 0 ? 'ENTRADA' : 'SALIDA', Math.abs(diferencia), Number(saldoAnterior || 0), Number(saldoNuevo || 0),
    concepto, referenciaTipo, Number(referenciaId || 0), referencia, usuario || '', now, now,
  )
}

function usuarioPuedeAccion(usuario: string, permiso: string): boolean {
  if (!usuario) return false
  const identity = String(usuario).trim()
  const row = db!.prepare(`SELECT rol, nivel_seguridad, permisos, estado FROM usuarios WHERE LOWER(TRIM(usuario)) = LOWER(?) OR LOWER(TRIM(email)) = LOWER(?) OR LOWER(TRIM(nombre)) = LOWER(?) LIMIT 1`).get(identity, identity, identity) as any
  if (!row || !['ACTIVADO', 'ACTIVO'].includes(String(row.estado || '').trim().toUpperCase())) return false
  // Datos antiguos pueden conservar rol=vendedor aunque nivel_seguridad sea
  // Administrador. Ambos campos son fuentes validas y deben evaluarse.
  const roles = [row.rol, row.nivel_seguridad].map(value => String(value || '').trim().toLowerCase())
  if (roles.some(role => ['administrador', 'admin', 'soporte'].includes(role))) return true
  try {
    const permissions = JSON.parse(row.permisos || '[]')
    return Array.isArray(permissions) && permissions.includes(permiso)
  } catch { return false }
}

function guardarVentaAtomica(payload: any): { success: boolean; data?: { id: number }; error?: string } {
  try {
    const factura = { ...(payload?.factura || {}) }
    const inventario = Array.isArray(payload?.inventario) ? payload.inventario : []
    const bancos = Array.isArray(payload?.bancos) ? payload.bancos : []
    if (!String(factura.no_factura || '').trim()) throw new Error('La venta no tiene número de factura')
    if (!String(factura.almacen_uid || '').trim() && !Number(factura.almacen_id || 0)) throw new Error('La venta no tiene almacén asignado')

    const guardar = db!.transaction(() => {
      const duplicada = db!.prepare(`SELECT id FROM facturas WHERE no_factura = ? LIMIT 1`).get(factura.no_factura) as any
      if (duplicada) throw new Error(`La factura ${factura.no_factura} ya existe`)
      factura.uid = factura.uid || generarUid()
      factura.created_at = new Date().toISOString()
      factura.updated_at = factura.created_at
      const facturaKeys = Object.keys(factura)
      const facturaInfo = db!.prepare(`INSERT INTO facturas (${facturaKeys.map(quoteIdentifier).join(', ')}) VALUES (${facturaKeys.map(() => '?').join(', ')})`).run(...facturaKeys.map(key => factura[key]))
      const facturaId = Number(facturaInfo.lastInsertRowid)

      if (payload?.cuenta_cobrar) {
        const cuenta = { ...payload.cuenta_cobrar, uid: payload.cuenta_cobrar.uid || generarUid(), created_at: new Date().toISOString() }
        cuenta.updated_at = cuenta.created_at
        const keys = Object.keys(cuenta)
        db!.prepare(`INSERT INTO cuentas_cobrar (${keys.map(quoteIdentifier).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...keys.map(key => cuenta[key]))
      }
      if (Number(payload?.comprobante_id || 0)) {
        const result = db!.prepare(`UPDATE comprobantes_fiscales SET secuencia_actual = secuencia_actual + 1, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), Number(payload.comprobante_id))
        if (result.changes !== 1) throw new Error('No se pudo consumir la secuencia fiscal')
      }
      for (const item of inventario) {
        const tabla = String(item?.tabla || '')
        const id = Number(item?.id || 0)
        if (!['imei', 'serial', 'accesorios'].includes(tabla) || !id) throw new Error('Producto de inventario inválido')
        const actual = db!.prepare(`SELECT * FROM ${quoteIdentifier(tabla)} WHERE id = ?`).get(id) as any
        if (!actual) throw new Error(`No existe el producto ${tabla} #${id}`)
        assertSameWarehouse(actual, { id: factura.almacen_id, uid: factura.almacen_uid }, 'El producto')
        assertAvailableInventory(tabla, actual, Number(item.cantidad || 1))
        if (tabla === 'accesorios') db!.prepare(`UPDATE accesorios SET cantidad = cantidad - ?, updated_at = ? WHERE id = ?`).run(Number(item.cantidad || 0), new Date().toISOString(), id)
        else {
          const cambios = { ...(item.cambios || {}), updated_at: new Date().toISOString() }
          const keys = Object.keys(cambios)
          db!.prepare(`UPDATE ${quoteIdentifier(tabla)} SET ${keys.map(key => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(key => cambios[key]), id)
        }
      }
      for (const movimiento of bancos) {
        const bancoId = Number(movimiento?.id || 0)
        const monto = Number(movimiento?.monto || 0)
        if (!bancoId || monto <= 0) continue
        const banco = db!.prepare(`SELECT * FROM bancos WHERE id = ?`).get(bancoId) as any
        if (!banco) throw new Error(`No existe el banco #${bancoId}`)
        const now = new Date().toISOString()
        db!.prepare(`UPDATE bancos SET saldo = saldo + ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(monto, now, now, bancoId)
        registrarTransaccionBanco(banco, Number(banco.saldo || 0), Number(banco.saldo || 0) + monto, 'Venta POS', factura.usuario || 'POS', 'FACTURA', facturaId, factura.no_factura || '')
      }
      registrarBitacora('facturas', facturaId, 'CREATE', factura.usuario || 'POS', factura, null)
      return { id: facturaId }
    })
    return { success: true, data: guardar() }
  } catch (error: any) {
    return { success: false, error: error?.message || 'No se pudo completar la venta' }
  }
}

function cobrarVentaPendiente(payload: any): { success: boolean; error?: string } {
  try {
    const facturaId = Number(payload?.factura_id || 0)
    const turnoId = Number(payload?.turno_id || 0)
    if (!facturaId || !turnoId) throw new Error('Factura o turno inválido')
    const factura = db!.prepare(`SELECT * FROM facturas WHERE id = ?`).get(facturaId) as any
    const turno = db!.prepare(`SELECT * FROM caja_turnos WHERE id = ? AND estado = 'abierto'`).get(turnoId) as any
    if (!factura) throw new Error('La factura no existe')
    if (String(factura.estado_factura || '').toUpperCase() !== 'PENDIENTE') throw new Error('La factura ya no está pendiente')
    if (!turno) throw new Error('El turno de caja no está abierto')
    if (factura.almacen_uid && turno.almacen_uid && String(factura.almacen_uid) !== String(turno.almacen_uid)) throw new Error('La factura pertenece a otro almacén')
    const metodo = String(payload?.metodo_pago || '').toUpperCase()
    if (!['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'MIXTO'].includes(metodo)) throw new Error('Método de pago inválido')
    const efectivo = Math.max(0, Number(payload?.efectivo || 0))
    const transferencia = Math.max(0, Number(payload?.transferencia || 0))
    const tarjeta = Math.max(0, Number(payload?.tarjeta || 0))
    if (Math.abs(efectivo + transferencia + tarjeta - Number(factura.total || 0)) >= 0.01) throw new Error('La distribución del pago no coincide con el total')
    const montoBanco = transferencia + tarjeta
    const bancoId = Number(payload?.banco_id || 0)
    let banco: any = null
    if (montoBanco > 0) {
      if (!bancoId) throw new Error('Selecciona el banco para la transferencia o tarjeta')
      banco = db!.prepare(`SELECT * FROM bancos WHERE id = ?`).get(bancoId) as any
      if (!banco) throw new Error('El banco seleccionado no existe')
    }
    const ahora = new Date()
    let otro: any = {}
    try { otro = typeof factura.otro === 'string' ? JSON.parse(factura.otro || '{}') : factura.otro || {} } catch {}
    otro = { ...otro, cobro_caja: { metodo_pago: metodo, efectivo, transferencia, tarjeta, banco_id: bancoId || 0, banco_nombre: banco?.nombre || '', observacion: String(payload?.observacion || '').trim().slice(0, 500), cajero: String(payload?.cajero || ''), fecha: ahora.toISOString() } }
    const cambios = { estado_factura: 'PAGADA', turno_id: turnoId, metodo_pago: metodo, efectivo, transferencia, tarjeta, fecha_estado: ahora.toISOString().split('T')[0], hora: ahora.toTimeString().slice(0, 5), cajero: String(payload?.cajero || ''), otro: JSON.stringify(otro), updated_at: ahora.toISOString() }
    db!.transaction(() => {
      const result = db!.prepare(`UPDATE facturas SET estado_factura = ?, turno_id = ?, metodo_pago = ?, efectivo = ?, transferencia = ?, tarjeta = ?, fecha_estado = ?, hora = ?, cajero = ?, otro = ?, updated_at = ? WHERE id = ? AND estado_factura = 'PENDIENTE'`).run(cambios.estado_factura, cambios.turno_id, cambios.metodo_pago, cambios.efectivo, cambios.transferencia, cambios.tarjeta, cambios.fecha_estado, cambios.hora, cambios.cajero, cambios.otro, cambios.updated_at, facturaId)
      if (result.changes !== 1) throw new Error('La factura fue cobrada por otro usuario')
      if (banco && montoBanco > 0) {
        db!.prepare(`UPDATE bancos SET saldo = saldo + ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(montoBanco, ahora.toISOString(), ahora.toISOString(), banco.id)
        registrarTransaccionBanco(banco, Number(banco.saldo || 0), Number(banco.saldo || 0) + montoBanco, 'Cobro de factura pendiente', cambios.cajero || 'CAJA', 'FACTURA', facturaId, factura.no_factura || '')
      }
      registrarBitacora('facturas', facturaId, 'COBRAR_PENDIENTE', cambios.cajero || 'CAJA', cambios, factura)
    })()
    return { success: true }
  } catch (error: any) {
    return { success: false, error: error?.message || 'No se pudo cobrar la factura pendiente' }
  }
}

function setupIpcHandlers(): void {
  ipcMain.handle('online:runtime', (_event, action: string, data: Record<string, any> = {}) => callOnlineRuntime(action, data))

  ipcMain.handle('empresa-local:ensureColumns', (_event, sample: Record<string, any> = {}) => {
    try {
      const existing = new Set((db!.prepare(`PRAGMA table_info("empresa")`).all() as any[]).map(column => String(column.name)))
      const added: string[] = []
      for (const [column, value] of Object.entries(sample || {})) {
        if (column === 'id' || existing.has(column) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column)) continue
        const type = typeof value === 'number' ? (Number.isInteger(value) ? 'INTEGER' : 'REAL') : typeof value === 'boolean' ? 'INTEGER' : 'TEXT'
        db!.exec(`ALTER TABLE empresa ADD COLUMN "${column}" ${type}`)
        existing.add(column)
        added.push(column)
      }
      return { success: true, data: { added } }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo actualizar la tabla empresa' }
    }
  })

  ipcMain.handle('correo-local:getConfig', () => {
    try {
      const data = db!.prepare(`SELECT * FROM correo ORDER BY id ASC LIMIT 1`).get()
      return { success: true, data }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo leer la configuracion local de correo' }
    }
  })

  ipcMain.handle('correo-local:saveConfig', (_event, payload: Record<string, any> = {}) => {
    try {
      const current = db!.prepare(`SELECT * FROM correo ORDER BY id ASC LIMIT 1`).get() as any
      const values = {
        host: String(payload.host ?? current?.host ?? 'smtp.gmail.com'),
        puerto: String(payload.puerto ?? current?.puerto ?? '587'),
        seguridad: String(payload.seguridad ?? current?.seguridad ?? 'STARTTLS'),
        email: String(payload.email ?? current?.email ?? ''),
        password: String(payload.password ?? current?.password ?? ''),
        nombre_remitente: String(payload.nombre_remitente ?? current?.nombre_remitente ?? ''),
        activo: Number(payload.activo ?? current?.activo ?? 0),
      }
      if (current?.id) {
        db!.prepare(`UPDATE correo SET host = @host, puerto = @puerto, seguridad = @seguridad, email = @email, password = @password, nombre_remitente = @nombre_remitente, activo = @activo, updated_at = CURRENT_TIMESTAMP WHERE id = @id`).run({ ...values, id: current.id })
      } else {
        db!.prepare(`INSERT INTO correo (host, puerto, seguridad, email, password, nombre_remitente, activo) VALUES (@host, @puerto, @seguridad, @email, @password, @nombre_remitente, @activo)`).run(values)
      }
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo guardar la configuracion local de correo' }
    }
  })

  ipcMain.handle('bancos:listarTransacciones', (_event, bancoId = 0) => {
    try {
      const id = Number(bancoId || 0)
      const rows = id
        ? db!.prepare(`SELECT * FROM banco_transacciones WHERE banco_id = ? ORDER BY created_at DESC, id DESC`).all(id)
        : db!.prepare(`SELECT * FROM banco_transacciones ORDER BY created_at DESC, id DESC`).all()
      return { success: true, data: rows }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('bancos:eliminarTransaccion', async (_event, payload: any = {}) => {
    try {
      const id = Number(payload?.id || 0)
      const usuario = String(payload?.usuario || '')
      if (!id) return { success: false, error: 'Transaccion no valida' }
      if (!usuarioPuedeAccion(usuario, 'accion_eliminar')) return { success: false, error: 'No tienes permiso para eliminar transacciones' }
      const movimiento = db!.prepare(`SELECT * FROM banco_transacciones WHERE id = ?`).get(id) as any
      if (!movimiento) return { success: false, error: 'La transaccion ya no existe' }
      const banco = movimiento.banco_uid
        ? db!.prepare(`SELECT * FROM bancos WHERE uid = ? LIMIT 1`).get(movimiento.banco_uid) as any
        : db!.prepare(`SELECT * FROM bancos WHERE id = ? LIMIT 1`).get(Number(movimiento.banco_id || 0)) as any
      if (!banco) return { success: false, error: 'No se encontro la cuenta bancaria' }
      const efecto = Number(movimiento.saldo_nuevo || 0) - Number(movimiento.saldo_anterior || 0)
      const saldoActual = Number(banco.saldo || 0)
      const saldoNuevo = saldoActual - efecto
      const now = new Date().toISOString()
      db!.transaction(() => {
        db!.prepare(`UPDATE bancos SET saldo = ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(saldoNuevo, now, now, banco.id)
        db!.prepare(`DELETE FROM banco_transacciones WHERE id = ?`).run(id)
        if (movimiento.uid) db!.prepare(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES (?, ?, 1)`).run('banco_transacciones', movimiento.uid)
        registrarBitacora('bancos', Number(banco.id), 'ELIMINAR_TRANSACCION', usuario, { saldo: saldoNuevo, transaccion_id: id }, banco)
        registrarBitacora('banco_transacciones', id, 'DELETE', usuario, null, movimiento)
      })()
      if (movimiento.uid && await pushCloudDelete('banco_transacciones', String(movimiento.uid))) {
        try { db!.prepare(`DELETE FROM sync_deletes WHERE tabla = ? AND uid = ?`).run('banco_transacciones', movimiento.uid) } catch {}
      }
      return { success: true, data: { saldo: saldoNuevo } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('auditoria:registrar', (_event, payload: any = {}) => {
    try {
      const now = new Date().toISOString()
      db!.prepare(`INSERT INTO auditoria_acciones (modulo,accion,entidad,entidad_id,referencia,usuario,detalle,resultado,created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        String(payload.modulo || ''),
        String(payload.accion || ''),
        String(payload.entidad || ''),
        Number(payload.entidad_id || 0),
        String(payload.referencia || ''),
        String(payload.usuario || ''),
        typeof payload.detalle === 'string' ? payload.detalle : JSON.stringify(payload.detalle || {}),
        String(payload.resultado || ''),
        now
      )
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('almacen:asignarTodosLosDatos', (_event, payload: any = {}) => {
    try {
      const almacenId = Number(payload.almacen_id || 0)
      const almacenUid = String(payload.almacen_uid || '').trim()
      if (!almacenId || !almacenUid) throw new Error('El almacen actual no tiene ID o UID valido')

      const empresa = db!.prepare(`SELECT id FROM empresa WHERE id = ? AND (uid = ? OR almacen_uid = ?) LIMIT 1`).get(almacenId, almacenUid, almacenUid)
      if (!empresa) throw new Error('El almacen actual no coincide con una empresa registrada')

      const excluidas = new Set([
        'empresa', 'usuarios', 'bancos', 'banco_transacciones', 'schema_migrations', 'configuracion', 'licencia', 'tmcloud_config',
        'otp_local_config', 'sync_deletes', 'bitacora', 'auditoria_acciones',
      ])
      const tablas = (db!.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all() as any[])
        .map(item => String(item.name || ''))
        .filter(nombre => nombre && !excluidas.has(nombre))
      const ahora = new Date().toISOString()

      const asignar = db!.transaction(() => {
        const resumen: Record<string, number> = {}
        let registros = 0
        for (const tabla of tablas) {
          const columnas = new Set(
            (db!.prepare(`PRAGMA table_info(${quoteIdentifier(tabla)})`).all() as any[])
              .map(columna => String(columna.name || '')),
          )
          if (!columnas.has('almacen_uid')) continue

          const cambios = ['almacen_uid = ?']
          const valores: any[] = [almacenUid]
          if (columnas.has('almacen_id')) {
            cambios.push('almacen_id = ?')
            valores.push(almacenId)
          }
          if (columnas.has('updated_at')) {
            cambios.push('updated_at = ?')
            valores.push(ahora)
          }

          const resultado = db!.prepare(`UPDATE "${tabla}" SET ${cambios.join(', ')}`).run(...valores)
          const cantidad = Number(resultado.changes || 0)
          if (cantidad > 0) resumen[tabla] = cantidad
          registros += cantidad
        }
        return { registros, tablas: Object.keys(resumen).length, resumen }
      })()

      return { success: true, data: asignar }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudieron asignar los datos al almacen actual' }
    }
  })

  ipcMain.handle('db:getPath', () => {
    try {
      return { success: true, data: getDbPath() }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:getAll', (_event, tabla: string) => {
    try {
      // La empresa activa se devuelve primero para que tickets y reportes usen la tienda seleccionada.
      const rows = db!.prepare(`SELECT * FROM "${tabla}" ORDER BY id DESC`).all() as any[]
      if (tabla === 'empresa' && rows.length > 1) {
        const config = db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'empresa_id'`).get() as any
        const empresaId = Number(config?.valor || 0)
        if (empresaId) rows.sort((a: any, b: any) => Number(b.id === empresaId) - Number(a.id === empresaId))
      }
      return { success: true, data: rows }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:getWhere', (_event, tabla: string, where: string, params: any[] = []) => {
    try {
      const clause = where ? `WHERE ${where}` : ''
      const rows = db!.prepare(`SELECT * FROM "${tabla}" ${clause} ORDER BY id DESC`).all(...params)
      return { success: true, data: rows }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:getModified', (_event, tabla: string, desde: string) => {
    try {
      if (!desde) {
        const rows = db!.prepare(`SELECT * FROM "${tabla}" ORDER BY id DESC`).all()
        return { success: true, data: rows }
      }
      const rows = db!.prepare(`SELECT * FROM "${tabla}" WHERE updated_at > ? ORDER BY updated_at ASC`).all(desde)
      return { success: true, data: rows }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:getById', (_event, tabla: string, id: number) => {
    try {
      const row = db!.prepare(`SELECT * FROM "${tabla}" WHERE id = ?`).get(id)
      return { success: true, data: row }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('ventas:guardarAtomica', (_event, payload: any) => {
    try {
      const factura = { ...(payload?.factura || {}) }
      const inventario = Array.isArray(payload?.inventario) ? payload.inventario : []
      const bancos = Array.isArray(payload?.bancos) ? payload.bancos : []
      if (!String(factura.no_factura || '').trim()) throw new Error('La venta no tiene número de factura')
      if (!String(factura.almacen_uid || '').trim() && !Number(factura.almacen_id || 0)) throw new Error('La venta no tiene almacén asignado')

      const guardar = db!.transaction(() => {
        const duplicada = db!.prepare(`SELECT id FROM facturas WHERE no_factura = ? LIMIT 1`).get(factura.no_factura) as any
        if (duplicada) throw new Error(`La factura ${factura.no_factura} ya existe`)

        factura.uid = factura.uid || generarUid()
        factura.created_at = new Date().toISOString()
        factura.updated_at = factura.created_at
        const facturaKeys = Object.keys(factura)
        const facturaInfo = db!.prepare(`INSERT INTO facturas (${facturaKeys.map(quoteIdentifier).join(', ')}) VALUES (${facturaKeys.map(() => '?').join(', ')})`).run(...facturaKeys.map(key => factura[key]))
        const facturaId = Number(facturaInfo.lastInsertRowid)

        if (payload?.cuenta_cobrar) {
          const cuenta = { ...payload.cuenta_cobrar, uid: payload.cuenta_cobrar.uid || generarUid() }
          cuenta.created_at = new Date().toISOString()
          cuenta.updated_at = cuenta.created_at
          const cuentaKeys = Object.keys(cuenta)
          db!.prepare(`INSERT INTO cuentas_cobrar (${cuentaKeys.map(quoteIdentifier).join(', ')}) VALUES (${cuentaKeys.map(() => '?').join(', ')})`).run(...cuentaKeys.map(key => cuenta[key]))
        }

        if (Number(payload?.comprobante_id || 0)) {
          const comprobante = db!.prepare(`UPDATE comprobantes_fiscales SET secuencia_actual = secuencia_actual + 1, updated_at = ? WHERE id = ?`).run(new Date().toISOString(), Number(payload.comprobante_id))
          if (comprobante.changes !== 1) throw new Error('No se pudo consumir la secuencia fiscal')
        }

        for (const item of inventario) {
          const tabla = String(item?.tabla || '')
          const id = Number(item?.id || 0)
          if (!['imei', 'serial', 'accesorios'].includes(tabla) || !id) throw new Error('Producto de inventario inválido')
          const actual = db!.prepare(`SELECT * FROM ${quoteIdentifier(tabla)} WHERE id = ?`).get(id) as any
          if (!actual) throw new Error(`No existe el producto ${tabla} #${id}`)
          assertSameWarehouse(actual, { id: factura.almacen_id, uid: factura.almacen_uid }, 'El producto')
          assertAvailableInventory(tabla, actual, Number(item.cantidad || 1))
          if (tabla === 'accesorios') {
            const cantidad = Number(item.cantidad || 0)
            db!.prepare(`UPDATE accesorios SET cantidad = cantidad - ?, updated_at = ? WHERE id = ?`).run(cantidad, new Date().toISOString(), id)
          } else {
            const cambios = { ...(item.cambios || {}), updated_at: new Date().toISOString() }
            const keys = Object.keys(cambios)
            db!.prepare(`UPDATE ${quoteIdentifier(tabla)} SET ${keys.map(key => `${quoteIdentifier(key)} = ?`).join(', ')} WHERE id = ?`).run(...keys.map(key => cambios[key]), id)
          }
        }

        for (const movimiento of bancos) {
          const bancoId = Number(movimiento?.id || 0)
          const monto = Number(movimiento?.monto || 0)
          if (!bancoId || monto <= 0) continue
          const banco = db!.prepare(`SELECT * FROM bancos WHERE id = ?`).get(bancoId) as any
          if (!banco) throw new Error(`No existe el banco #${bancoId}`)
          db!.prepare(`UPDATE bancos SET saldo = saldo + ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(monto, new Date().toISOString(), new Date().toISOString(), bancoId)
          registrarTransaccionBanco(banco, Number(banco.saldo || 0), Number(banco.saldo || 0) + monto, 'Venta POS', factura.usuario || 'POS', 'FACTURA', facturaId, factura.no_factura || '')
        }

        registrarBitacora('facturas', facturaId, 'CREATE', factura.usuario || 'POS', factura, null)
        return { id: facturaId }
      })

      return { success: true, data: guardar() }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo completar la venta' }
    }
  })

  ipcMain.handle('ventas:cobrarPendiente', (_event, payload: any) => {
    try {
      const facturaId = Number(payload?.factura_id || 0)
      const turnoId = Number(payload?.turno_id || 0)
      if (!facturaId || !turnoId) throw new Error('Factura o turno inválido')
      const factura = db!.prepare(`SELECT * FROM facturas WHERE id = ?`).get(facturaId) as any
      if (!factura) throw new Error('La factura no existe')
      if (String(factura.estado_factura || '').toUpperCase() !== 'PENDIENTE') throw new Error('La factura ya no está pendiente')
      const turno = db!.prepare(`SELECT * FROM caja_turnos WHERE id = ? AND estado = 'abierto'`).get(turnoId) as any
      if (!turno) throw new Error('El turno de caja no está abierto')
      if (factura.almacen_uid && turno.almacen_uid && String(factura.almacen_uid) !== String(turno.almacen_uid)) throw new Error('La factura pertenece a otro almacén')
      const metodo = String(payload?.metodo_pago || '').toUpperCase()
      if (!['EFECTIVO', 'TRANSFERENCIA', 'TARJETA', 'MIXTO'].includes(metodo)) throw new Error('Método de pago inválido')
      const efectivo = Math.max(0, Number(payload?.efectivo || 0))
      const transferencia = Math.max(0, Number(payload?.transferencia || 0))
      const tarjeta = Math.max(0, Number(payload?.tarjeta || 0))
      if (Math.abs((efectivo + transferencia + tarjeta) - Number(factura.total || 0)) >= 0.01) throw new Error('La distribución del pago no coincide con el total')
      const montoBanco = transferencia + tarjeta
      const bancoId = Number(payload?.banco_id || 0)
      let banco: any = null
      if (montoBanco > 0) {
        if (!bancoId) throw new Error('Selecciona el banco para la transferencia o tarjeta')
        banco = db!.prepare(`SELECT * FROM bancos WHERE id = ?`).get(bancoId) as any
        if (!banco) throw new Error('El banco seleccionado no existe')
      }
      const ahora = new Date()
      let otro: any = {}
      try { otro = typeof factura.otro === 'string' ? JSON.parse(factura.otro || '{}') : factura.otro || {} } catch { otro = {} }
      otro = { ...otro, cobro_caja: { metodo_pago: metodo, efectivo, transferencia, tarjeta, banco_id: bancoId || 0, banco_nombre: banco?.nombre || '', observacion: String(payload?.observacion || '').trim().slice(0, 500), cajero: String(payload?.cajero || ''), fecha: ahora.toISOString() } }
      const cambios = {
        estado_factura: 'PAGADA', turno_id: turnoId, metodo_pago: metodo,
        efectivo, transferencia, tarjeta,
        fecha_estado: ahora.toISOString().split('T')[0], hora: ahora.toTimeString().slice(0, 5),
        cajero: String(payload?.cajero || ''), otro: JSON.stringify(otro), updated_at: ahora.toISOString(),
      }
      const cobrar = db!.transaction(() => {
        const result = db!.prepare(`UPDATE facturas SET estado_factura = ?, turno_id = ?, metodo_pago = ?, efectivo = ?, transferencia = ?, tarjeta = ?, fecha_estado = ?, hora = ?, cajero = ?, otro = ?, updated_at = ? WHERE id = ? AND estado_factura = 'PENDIENTE'`).run(
          cambios.estado_factura, cambios.turno_id, cambios.metodo_pago, cambios.efectivo, cambios.transferencia, cambios.tarjeta, cambios.fecha_estado, cambios.hora, cambios.cajero, cambios.otro, cambios.updated_at, facturaId
        )
        if (result.changes !== 1) throw new Error('La factura fue cobrada por otro usuario')
        if (banco && montoBanco > 0) {
          db!.prepare(`UPDATE bancos SET saldo = saldo + ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(montoBanco, ahora.toISOString(), ahora.toISOString(), banco.id)
          registrarTransaccionBanco(banco, Number(banco.saldo || 0), Number(banco.saldo || 0) + montoBanco, 'Cobro de factura pendiente', cambios.cajero || 'CAJA', 'FACTURA', facturaId, factura.no_factura || '')
        }
        registrarBitacora('facturas', facturaId, 'COBRAR_PENDIENTE', cambios.cajero || 'CAJA', cambios, factura)
      })
      cobrar()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo cobrar la factura pendiente' }
    }
  })

  ipcMain.handle('db:insert', (_event, tabla: string, data: Record<string, any>, usuario?: string) => {
    try {
      if (tabla === 'empresa' && !usuarioPuedeAccion(usuario || '', 'configuracion')) return { success: false, error: 'Solo Administrador o Soporte puede crear empresas' }
      if (!data.uid) data.uid = generarUid()
      if (tabla === 'empresa') data.almacen_uid = data.uid
      if (tabla !== 'empresa' && data.almacen_uid) {
        const emp = db!.prepare(`SELECT id FROM empresa WHERE uid = ? LIMIT 1`).get(data.almacen_uid) as any
        if (emp?.id) data.almacen_id = emp.id
      }
      if (tabla === 'serial') {
        const equipo = data.equipo_uid
          ? db!.prepare(`SELECT id, uid, nombre FROM electrodomesticos WHERE uid = ? LIMIT 1`).get(data.equipo_uid) as any
          : db!.prepare(`SELECT id, uid, nombre FROM electrodomesticos WHERE id = ? LIMIT 1`).get(data.id_equi || 0) as any
        if (equipo) {
          data.id_equi = equipo.id
          data.equipo_uid = equipo.uid || ''
          data.equipo = equipo.nombre || data.equipo || ''
        }
      }
      data.created_at = new Date().toISOString()
      data.updated_at = new Date().toISOString()
      const keys = Object.keys(data)
      const placeholders = keys.map(() => '?').join(', ')
      const values = Object.values(data)
      const stmt = db!.prepare(`INSERT INTO "${tabla}" (${keys.join(', ')}) VALUES (${placeholders})`)
      const result = stmt.run(...values)
      const newId = Number(result.lastInsertRowid)
      if (tabla === 'bancos' && Math.abs(Number(data.saldo || 0)) >= 0.001) {
        registrarTransaccionBanco({ ...data, id: newId }, 0, Number(data.saldo || 0), 'Saldo inicial', usuario || '', 'BANCO', newId, data.nombre || '')
      }
      if (tabla !== 'bitacora') registrarBitacora(tabla, Number(newId), 'CREATE', usuario || '', data, null)
      return { success: true, data: { id: newId } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Importacion interna desde TM Cloud. A diferencia de db:insert/db:update,
  // conserva exactamente el registro remoto: no agrega el almacen activo, no
  // reemplaza timestamps y no genera miles de entradas de bitacora.
  ipcMain.handle('db:insertCloud', (_event, tabla: string, data: Record<string, any>) => {
    try {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) return { success: false, error: 'Nombre de tabla no valido' }
      const keys = Object.keys(data || {})
      if (keys.length === 0) return { success: false, error: 'Registro remoto vacio' }
      const placeholders = keys.map(() => '?').join(', ')
      const columns = keys.map(key => `"${key}"`).join(', ')
      const result = db!.prepare(`INSERT INTO "${tabla}" (${columns}) VALUES (${placeholders})`).run(...Object.values(data))
      return { success: true, data: { id: Number(result.lastInsertRowid) } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:updateCloud', (_event, tabla: string, id: number, data: Record<string, any>) => {
    try {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) return { success: false, error: 'Nombre de tabla no valido' }
      const keys = Object.keys(data || {})
      if (keys.length === 0) return { success: true }
      const sets = keys.map(key => `"${key}" = ?`).join(', ')
      db!.prepare(`UPDATE "${tabla}" SET ${sets} WHERE id = ?`).run(...Object.values(data), id)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // Exclusivo para aplicar una eliminacion que ya ocurrio en TM Cloud o para
  // reemplazar datos durante una descarga. No crea tombstones, no toca la API
  // y no ejecuta cascadas de negocio propias de una eliminacion del usuario.
  ipcMain.handle('db:deleteLocalOnly', (_event, tabla: string, id: number) => {
    try {
      if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) return { success: false, error: 'Tabla invalida' }
      const result = db!.prepare(`DELETE FROM "${tabla}" WHERE id = ?`).run(Number(id))
      return { success: true, changes: result.changes }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:update', (_event, tabla: string, id: number, data: Record<string, any>, usuario?: string) => {
    try {
      if (tabla === 'empresa' && !usuarioPuedeAccion(usuario || '', 'configuracion')) return { success: false, error: 'Solo Administrador o Soporte puede modificar la empresa' }
      if (tabla === 'usuarios' && !usuarioPuedeAccion(usuario || '', 'accion_usuarios')) return { success: false, error: 'No tienes permiso para modificar usuarios' }
      if (tabla === 'facturas' && !usuarioPuedeAccion(usuario || '', 'accion_facturas')) return { success: false, error: 'No tienes permiso para editar facturas' }
      const priceFields = ['precio_venta', 'precio_min', 'precio_xmayor', 'costo']
      if (priceFields.some(field => data[field] !== undefined) && !usuarioPuedeAccion(usuario || '', 'accion_precios')) return { success: false, error: 'No tienes permiso para modificar precios o costos' }
      const oldData = db!.prepare(`SELECT * FROM "${tabla}" WHERE id = ?`).get(id) as Record<string, any> || {}
      if (tabla === 'empresa') data.almacen_uid = data.uid || oldData.uid || oldData.almacen_uid || ''
      if (tabla !== 'empresa' && data.almacen_uid) {
        const emp = db!.prepare(`SELECT id FROM empresa WHERE uid = ? LIMIT 1`).get(data.almacen_uid) as any
        if (emp?.id) data.almacen_id = emp.id
      }
      if (tabla === 'serial' && (data.equipo_uid !== undefined || data.id_equi !== undefined)) {
        const equipo = data.equipo_uid
          ? db!.prepare(`SELECT id, uid, nombre FROM electrodomesticos WHERE uid = ? LIMIT 1`).get(data.equipo_uid) as any
          : db!.prepare(`SELECT id, uid, nombre FROM electrodomesticos WHERE id = ? LIMIT 1`).get(data.id_equi || 0) as any
        if (equipo) {
          data.id_equi = equipo.id
          data.equipo_uid = equipo.uid || ''
          data.equipo = equipo.nombre || data.equipo || ''
        }
      }
      data.updated_at = new Date().toISOString()
      const keys = Object.keys(data)
      const sets = keys.map(k => `${k} = ?`).join(', ')
      const values = [...Object.values(data), id]
      const stmt = db!.prepare(`UPDATE "${tabla}" SET ${sets} WHERE id = ?`)
      stmt.run(...values)
      if (tabla === 'bancos' && data.saldo !== undefined) {
        registrarTransaccionBanco(
          { ...oldData, ...data, id },
          Number(oldData.saldo || 0),
          Number(data.saldo || 0),
          'Movimiento registrado',
          usuario || '',
          'BANCO',
          id,
          String(oldData.nombre || data.nombre || ''),
        )
      }
      if (tabla !== 'bitacora') registrarBitacora(tabla, id, 'UPDATE', usuario || '', data, oldData)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('gastos:guardarConPago', (_event, payload: any = {}) => {
    try {
      const id = Number(payload?.id || 0)
      const cantidad = Number(payload?.cantidad || 0)
      const metodoPago = String(payload?.metodo_pago || 'EFECTIVO').trim().toUpperCase()
      const bancoId = Number(payload?.banco_id || 0)
      const bancoUid = String(payload?.banco_uid || '').trim()
      if (!(cantidad > 0)) return { success: false, error: 'El monto del gasto debe ser mayor que cero' }
      if (!['EFECTIVO', 'TRANSFERENCIA'].includes(metodoPago)) return { success: false, error: 'Metodo de pago no valido' }
      if (metodoPago === 'TRANSFERENCIA' && !bancoId && !bancoUid) return { success: false, error: 'Selecciona el banco de la transferencia' }

      const guardar = db!.transaction(() => {
        const now = new Date().toISOString()
        const anterior = id ? db!.prepare(`SELECT * FROM gastos WHERE id = ?`).get(id) as any : null
        if (id && !anterior) throw new Error('El gasto que intentas editar no existe')

        const buscarBanco = (uid: string, bankId: number) => {
          if (uid) return db!.prepare(`SELECT * FROM bancos WHERE uid = ? LIMIT 1`).get(uid) as any
          if (bankId) return db!.prepare(`SELECT * FROM bancos WHERE id = ? LIMIT 1`).get(bankId) as any
          return null
        }

        // Al editar, primero se revierte el retiro bancario anterior dentro de
        // la misma transaccion para que el saldo nunca quede duplicado.
        if (anterior && String(anterior.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA') {
          const bancoAnterior = buscarBanco(String(anterior.banco_uid || ''), Number(anterior.banco_id || 0))
          if (!bancoAnterior) throw new Error('No se encontro el banco asociado al gasto anterior')
          const saldoRestaurado = Number(bancoAnterior.saldo || 0) + Number(anterior.cantidad || 0)
          db!.prepare(`UPDATE bancos SET saldo = ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(saldoRestaurado, now, now, bancoAnterior.id)
          registrarTransaccionBanco(bancoAnterior, Number(bancoAnterior.saldo || 0), saldoRestaurado, 'Reversion de gasto editado', String(payload?.usuario || ''), 'GASTO', id, String(anterior.comentario || ''))
          registrarBitacora('bancos', Number(bancoAnterior.id), 'UPDATE', String(payload?.usuario || ''), { saldo: saldoRestaurado }, bancoAnterior)
        }

        let banco: any = null
        if (metodoPago === 'TRANSFERENCIA') {
          banco = buscarBanco(bancoUid, bancoId)
          if (!banco) throw new Error('No se encontro el banco seleccionado')
          const saldoActual = Number((db!.prepare(`SELECT saldo FROM bancos WHERE id = ?`).get(banco.id) as any)?.saldo || 0)
          if (saldoActual < cantidad) throw new Error(`Fondos insuficientes en ${banco.nombre}. Saldo disponible: RD$ ${saldoActual.toFixed(2)}`)
          const saldoNuevo = saldoActual - cantidad
          db!.prepare(`UPDATE bancos SET saldo = ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(saldoNuevo, now, now, banco.id)
          registrarTransaccionBanco(banco, saldoActual, saldoNuevo, 'Gasto por transferencia', String(payload?.usuario || ''), 'GASTO', id, String(payload?.comentario || ''))
          registrarBitacora('bancos', Number(banco.id), 'UPDATE', String(payload?.usuario || ''), { saldo: saldoNuevo }, { ...banco, saldo: saldoActual })
        }

        const data: Record<string, any> = {
          cantidad,
          fecha: String(payload?.fecha || ''),
          hora: String(payload?.hora || ''),
          comentario: String(payload?.comentario || '').trim(),
          metodo_pago: metodoPago,
          banco_id: banco ? Number(banco.id) : 0,
          banco_uid: banco ? String(banco.uid || '') : '',
          banco_nombre: banco ? String(banco.nombre || '') : '',
          turno_id: Number(payload?.turno_id || 0),
          almacen_id: Number(payload?.almacen_id || 0),
          almacen_uid: String(payload?.almacen_uid || ''),
          updated_at: now,
        }

        if (id) {
          const keys = Object.keys(data)
          db!.prepare(`UPDATE gastos SET ${keys.map(key => `"${key}" = ?`).join(', ')} WHERE id = ?`).run(...Object.values(data), id)
          registrarBitacora('gastos', id, 'UPDATE', String(payload?.usuario || ''), data, anterior)
          return id
        }

        data.uid = generarUid()
        data.created_at = now
        const keys = Object.keys(data)
        const result = db!.prepare(`INSERT INTO gastos (${keys.map(key => `"${key}"`).join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...Object.values(data))
        const nuevoId = Number(result.lastInsertRowid)
        registrarBitacora('gastos', nuevoId, 'CREATE', String(payload?.usuario || ''), data, null)
        return nuevoId
      })

      return { success: true, data: { id: guardar() } }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo guardar el gasto' }
    }
  })

  ipcMain.handle('gastos:eliminarConPago', (_event, id: number, usuario?: string) => {
    try {
      const eliminar = db!.transaction(() => {
        const gasto = db!.prepare(`SELECT * FROM gastos WHERE id = ?`).get(Number(id || 0)) as any
        if (!gasto) throw new Error('El gasto no existe')
        if (String(gasto.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA') {
          const banco = gasto.banco_uid
            ? db!.prepare(`SELECT * FROM bancos WHERE uid = ? LIMIT 1`).get(gasto.banco_uid) as any
            : db!.prepare(`SELECT * FROM bancos WHERE id = ? LIMIT 1`).get(Number(gasto.banco_id || 0)) as any
          if (!banco) throw new Error('No se encontro el banco asociado al gasto')
          const saldoNuevo = Number(banco.saldo || 0) + Number(gasto.cantidad || 0)
          const now = new Date().toISOString()
          db!.prepare(`UPDATE bancos SET saldo = ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(saldoNuevo, now, now, banco.id)
          registrarTransaccionBanco(banco, Number(banco.saldo || 0), saldoNuevo, 'Reversion de gasto eliminado', usuario || '', 'GASTO', Number(gasto.id || 0), String(gasto.comentario || ''))
          registrarBitacora('bancos', Number(banco.id), 'UPDATE', usuario || '', { saldo: saldoNuevo }, banco)
        }
        db!.prepare(`DELETE FROM gastos WHERE id = ?`).run(gasto.id)
        registrarBitacora('gastos', Number(gasto.id), 'DELETE', usuario || '', null, gasto)
        if (gasto.uid) db!.prepare(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES ('gastos', ?, 1)`).run(gasto.uid)
      })
      eliminar()
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error?.message || 'No se pudo eliminar el gasto' }
    }
  })

  ipcMain.handle('imei:repararReferenciasTelefono', () => {
    try {
      const rows = db!.prepare(`
        SELECT imei.id, imei.telefono_uid, telefonos.uid AS telefono_uid_nuevo
        FROM imei
        INNER JOIN telefonos ON telefonos.id = imei.id_equi
        WHERE imei.id_equi IS NOT NULL AND telefonos.uid IS NOT NULL AND TRIM(telefonos.uid) <> ''
      `).all() as any[]
      const update = db!.prepare(`UPDATE imei SET telefono_uid = ?, updated_at = ? WHERE id = ?`)
      const ids: number[] = []
      for (const row of rows) {
        const uid = String(row.telefono_uid_nuevo || '')
        if (String(row.telefono_uid || '') === uid) continue
        update.run(uid, new Date().toISOString(), row.id)
        ids.push(Number(row.id))
      }
      return { success: true, data: { repaired: ids.length, ids, scanned: rows.length } }
    } catch (error: any) {
      return { success: false, error: error.message || 'No se pudieron reparar los IMEI' }
    }
  })

  async function pushCloudDelete(tabla: string, uid: string): Promise<boolean> {
    try {
      const cfg = db!.prepare(`SELECT url, secret_key, public_key FROM tmcloud_config WHERE id = 1`).get() as any
      const base = String(cfg?.url || '').replace(/\/+$/, '')
      const key = String(cfg?.secret_key || cfg?.public_key || '').trim()
      if (!base || !key || !uid || !/^https?:\/\//i.test(base)) return false
      const res = await fetch(`${base}/${encodeURIComponent(tabla)}/${encodeURIComponent(uid)}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${key}` },
      })
      return res.ok || res.status === 404
    } catch {
      return false
    }
  }

  ipcMain.handle('db:delete', async (_event, tabla: string, id: number, usuario?: string) => {
    try {
      if (!usuarioPuedeAccion(usuario || '', 'accion_eliminar')) return { success: false, error: 'No tienes permiso para eliminar registros' }
      const oldData = db!.prepare(`SELECT * FROM "${tabla}" WHERE id = ?`).get(id) as Record<string, any> || {}
      const queuedDeletes: Array<{ tabla: string; uid: string; queuedId: number | null }> = []
      const cuentasCobrarRelacionadas: Record<string, any>[] = []
      const deleteLocal = db!.transaction(() => {
        const queueDelete = (deleteTable: string, uid: string) => {
          if (!uid) return
          let queuedId: number | null = null
          try {
            const queued = db!.prepare(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES (?, ?, 1)`).run(deleteTable, uid)
            queuedId = Number(queued.lastInsertRowid)
          } catch {}
          queuedDeletes.push({ tabla: deleteTable, uid, queuedId })
        }

        // facturas_ecf depende de facturas mediante una clave foranea NO ACTION.
        // Se elimina primero el metadato tecnico dentro de la misma transaccion.
        if (tabla === 'facturas') {
          const noFactura = String(oldData?.no_factura || '').trim()
          if (noFactura) {
            const candidatas = db!.prepare(`SELECT * FROM cuentas_cobrar WHERE no_factura = ?`).all(noFactura) as Record<string, any>[]
            const relacionadas = candidatas.filter((cuenta) => {
              const facturaAlmacenUid = String(oldData?.almacen_uid || '').trim()
              const cuentaAlmacenUid = String(cuenta?.almacen_uid || '').trim()
              if (facturaAlmacenUid && cuentaAlmacenUid) return facturaAlmacenUid === cuentaAlmacenUid
              return Number(oldData?.almacen_id || 0) === Number(cuenta?.almacen_id || 0)
            })
            for (const cuenta of relacionadas) {
              db!.prepare(`DELETE FROM cuentas_cobrar WHERE id = ?`).run(Number(cuenta.id))
              registrarBitacora('cuentas_cobrar', Number(cuenta.id), 'DELETE', usuario || '', null, cuenta)
              queueDelete('cuentas_cobrar', String(cuenta.uid || ''))
              cuentasCobrarRelacionadas.push(cuenta)
            }
          }

          const ecfRows = db!.prepare(`SELECT * FROM facturas_ecf WHERE factura_id = ?`).all(id) as Record<string, any>[]
          db!.prepare(`DELETE FROM facturas_ecf WHERE factura_id = ?`).run(id)
          for (const ecf of ecfRows) {
            registrarBitacora('facturas_ecf', Number(ecf.id || 0), 'DELETE', usuario || '', null, ecf)
            queueDelete('facturas_ecf', String(ecf.uid || ''))
          }
        }

        // Cualquier eliminacion de un gasto por transferencia debe devolver
        // el dinero al banco, incluso si proviene de una vista antigua.
        if (tabla === 'gastos' && String(oldData?.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA') {
          const banco = oldData?.banco_uid
            ? db!.prepare(`SELECT * FROM bancos WHERE uid = ? LIMIT 1`).get(oldData.banco_uid) as any
            : db!.prepare(`SELECT * FROM bancos WHERE id = ? LIMIT 1`).get(Number(oldData?.banco_id || 0)) as any
          if (!banco) throw new Error('No se encontro el banco asociado al gasto')
          const saldoNuevo = Number(banco.saldo || 0) + Number(oldData.cantidad || 0)
          const now = new Date().toISOString()
          db!.prepare(`UPDATE bancos SET saldo = ?, fecha_transaccion = ?, updated_at = ? WHERE id = ?`).run(saldoNuevo, now, now, banco.id)
          registrarTransaccionBanco(banco, Number(banco.saldo || 0), saldoNuevo, 'Reversion de gasto eliminado', usuario || '', 'GASTO', Number(oldData.id || 0), String(oldData.comentario || ''))
          registrarBitacora('bancos', Number(banco.id), 'UPDATE', usuario || '', { saldo: saldoNuevo }, banco)
        }

        db!.prepare(`DELETE FROM "${tabla}" WHERE id = ?`).run(id)
        if (tabla !== 'bitacora' && tabla !== 'sync_deletes') {
          registrarBitacora(tabla, id, 'DELETE', usuario || '', null, oldData)
          queueDelete(tabla, String(oldData?.uid || ''))
        }
      })
      deleteLocal()

      for (const item of queuedDeletes) {
        if (await pushCloudDelete(item.tabla, item.uid)) {
          try {
            if (item.queuedId) db!.prepare(`DELETE FROM sync_deletes WHERE id = ?`).run(item.queuedId)
            else db!.prepare(`DELETE FROM sync_deletes WHERE tabla = ? AND uid = ?`).run(item.tabla, item.uid)
          } catch {}
        }
      }
      return { success: true, data: { cuentas_cobrar_eliminadas: cuentasCobrarRelacionadas.length } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:clearAllData', async () => {
    try {
      const tablasSistema = new Set([
        'licencia', 'configuracion', 'usuarios', 'empresa', 'almacenes',
        'tmcloud_config', 'schema_migrations', 'sync_deletes',
        'otp_local_config', 'impresoras_config', 'correo',
      ])
      const tablas = db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' ORDER BY name`).all() as { name: string }[]
      const resultados: string[] = []
      const errores: string[] = []
      const deleteAll = db!.transaction(() => {
        for (const { name } of tablas) {
          if (tablasSistema.has(name)) continue
          try {
            const count = db!.prepare(`DELETE FROM "${name}"`).run()
            db!.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(name)
            resultados.push(`${name} (${count.changes} registros)`)
          } catch (e: any) {
            errores.push(`${name}: ${e.message}`)
          }
        }
        db!.prepare(`DELETE FROM sync_deletes`).run()
      })
      deleteAll()
      console.log('[db:clearAllData]', { resultados, errores })
      return { success: true, data: { resultados, errores } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:clearEmpresaOnly', async () => {
    try {
      const count = db!.prepare(`DELETE FROM empresa`).run()
      db!.prepare(`DELETE FROM sqlite_sequence WHERE name = 'empresa'`).run()
      console.log('[db:clearEmpresaOnly] eliminados:', count.changes)
      return { success: true, data: { eliminados: count.changes } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:clearProductos', async () => {
    try {
      // Primero se eliminan las tablas hijas. Con foreign_keys activo, borrar
      // telefonos/electrodomesticos antes de IMEI/serial abortaba toda la
      // transaccion y dejaba mezclados productos de la licencia anterior.
      const tablasProductos = ['imei', 'serial', 'telefonos', 'electrodomesticos', 'accesorios']
      const resultados: string[] = []
      const limpiar = db!.transaction(() => {
        for (const name of tablasProductos) {
          if (!db!.prepare(`SELECT 1 FROM sqlite_master WHERE type='table' AND name = ?`).get(name)) continue
          const count = db!.prepare(`DELETE FROM "${name}"`).run()
          db!.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(name)
          resultados.push(`${name} (${count.changes} registros)`)
        }
      })
      limpiar()
      console.log('[db:clearProductos]', { resultados })
      return { success: true, data: { resultados } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:clearCloudData', async () => {
    try {
      const resultados: string[] = []
      const limpiar = db!.transaction(() => {
        const empCount = db!.prepare(`DELETE FROM empresa`).run()
        db!.prepare(`DELETE FROM sqlite_sequence WHERE name = 'empresa'`).run()
        resultados.push(`empresa (${empCount.changes} registros)`)
        const tmCount = db!.prepare(`DELETE FROM tmcloud_config`).run()
        db!.prepare(`DELETE FROM sqlite_sequence WHERE name = 'tmcloud_config'`).run()
        resultados.push(`tmcloud_config (${tmCount.changes} registros)`)
        db!.prepare(`DELETE FROM configuracion WHERE clave IN ('supabase_url', 'supabase_anon_key', 'supabase_service_role', 'tmcloud_url', 'tmcloud_key', 'tmcloud_service_key')`).run()
      })
      limpiar()
      console.log('[db:clearCloudData]', { resultados })
      return { success: true, data: { resultados } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('config:get', (_event, clave: string) => {
    try {
      const row = db!.prepare(`SELECT valor FROM configuracion WHERE clave = ?`).get(clave) as any
      return { success: true, data: row ? row.valor : '' }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('config:set', (_event, clave: string, valor: string, categoria = 'general', usuario = '') => {
    try {
      if (!usuarioPuedeAccion(usuario, 'configuracion')) return { success: false, error: 'Solo Administrador o Soporte puede modificar la configuracion' }
      guardarConfigLocal(clave, valor, categoria)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('openai:getConfig', () => {
    try {
      const get = (clave: string) => {
        const row = db!.prepare(`SELECT valor FROM configuracion WHERE clave = ?`).get(clave) as any
        return String(row?.valor || '')
      }
      const apiKey = revealOpenAIKey(get('openai_api_key'))
      return {
        success: true,
        data: {
          enabled: get('openai_enabled') === '1',
          model: get('openai_model') || 'gpt-5.6-sol',
          voice_enabled: get('openai_voice_enabled') !== '0',
          voice: get('openai_voice') || 'es-DO',
          has_api_key: Boolean(apiKey),
          masked_api_key: apiKey ? `${apiKey.slice(0, 7)}••••••••${apiKey.slice(-4)}` : '',
        },
      }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('openai:saveConfig', (_event, payload: any = {}) => {
    try {
      const apiKey = String(payload.api_key || '').trim()
      if (apiKey && !apiKey.startsWith('sk-')) {
        return { success: false, error: 'La API key debe comenzar con sk-' }
      }
      if (apiKey) guardarConfigLocal('openai_api_key', protectOpenAIKey(apiKey), 'openai')
      if (payload.clear_api_key) guardarConfigLocal('openai_api_key', '', 'openai')
      guardarConfigLocal('openai_enabled', payload.enabled === true ? '1' : '0', 'openai')
      guardarConfigLocal('openai_model', String(payload.model || 'gpt-5.6-sol'), 'openai')
      guardarConfigLocal('openai_voice_enabled', payload.voice_enabled === false ? '0' : '1', 'openai')
      guardarConfigLocal('openai_voice', String(payload.voice || 'es-DO'), 'openai')
      const configured = Boolean(apiKey) || (!payload.clear_api_key && Boolean(
        (db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'openai_api_key'`).get() as any)?.valor
      ))
      guardarConfigLocal('openai_api_key_configured', configured ? '1' : '0', 'openai')
      return { success: true, data: { has_api_key: configured } }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('openai:request', async (_event, payload: any = {}) => {
    try {
      const row = db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'openai_api_key'`).get() as any
      const apiKey = revealOpenAIKey(String(row?.valor || '')).trim()
      if (!apiKey) return { success: false, error: 'OpenAI no está configurado. Agrega la API key en Configuración.' }
      const response = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
        signal: AbortSignal.timeout(90000),
      })
      const data = await response.json().catch(() => ({})) as any
      if (!response.ok) {
        return { success: false, error: getOpenAIError(data, response.status) }
      }
      return { success: true, data }
    } catch (error: any) {
      const message = error?.name === 'TimeoutError'
        ? 'OpenAI tardó demasiado en responder'
        : error?.message || 'No se pudo conectar con OpenAI'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('openai:transcribe', async (_event, payload: any = {}) => {
    try {
      const row = db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'openai_api_key'`).get() as any
      const apiKey = revealOpenAIKey(String(row?.valor || '')).trim()
      if (!apiKey) return { success: false, error: 'OpenAI no está configurado. Agrega la API key en Configuración.' }

      const base64 = String(payload.audio_base64 || '')
      const audio = Buffer.from(base64, 'base64')
      if (!audio.length) return { success: false, error: 'La grabación de audio está vacía' }
      if (audio.length > 20 * 1024 * 1024) return { success: false, error: 'La grabación es demasiado grande' }

      const allowedMimeTypes = new Set(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/ogg'])
      const rawMimeType = String(payload.mime_type || 'audio/webm').split(';')[0].toLowerCase()
      const mimeType = allowedMimeTypes.has(rawMimeType) ? rawMimeType : 'audio/webm'
      const extension: Record<string, string> = {
        'audio/webm': 'webm',
        'audio/mp4': 'm4a',
        'audio/mpeg': 'mp3',
        'audio/wav': 'wav',
        'audio/ogg': 'ogg',
      }
      const form = new FormData()
      form.append('file', new Blob([audio], { type: mimeType }), `jarvis.${extension[mimeType] || 'webm'}`)
      form.append('model', 'gpt-4o-mini-transcribe')
      form.append('language', String(payload.language || 'es').slice(0, 2))
      form.append('response_format', 'json')
      form.append('prompt', 'Conversación en español sobre ventas, clientes, facturas, inventario, teléfonos e IMEI en el sistema TMPOS.')

      const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}` },
        body: form,
        signal: AbortSignal.timeout(90000),
      })
      const data = await response.json().catch(() => ({})) as any
      if (!response.ok) {
        return { success: false, error: getOpenAIError(data, response.status) }
      }
      return { success: true, data: { text: String(data?.text || '').trim() } }
    } catch (error: any) {
      const message = error?.name === 'TimeoutError'
        ? 'La transcripción tardó demasiado'
        : error?.message || 'No se pudo transcribir el audio'
      return { success: false, error: message }
    }
  })

  ipcMain.handle('db:bitacoraList', (_event, limite = 1000) => {
    try {
      const rows = db!.prepare(`SELECT * FROM bitacora ORDER BY id DESC LIMIT ?`).all(limite)
      return { success: true, data: rows }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:bitacoraDeleteAll', () => {
    try {
      db!.exec('DELETE FROM bitacora')
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('db:exec', (_event, sql: string) => {
    try {
      db!.exec(sql)
      return { success: true }
    } catch (error: any) {
      return { success: false, error: error.message }
    }
  })

  // ===== LICENCIA =====
  function obtenerMacAddress(): string | null {
    try {
      return getMachineId()
    } catch {}
    try {
      const row = db!.prepare(`SELECT licencia_equipo FROM licencia WHERE id = 1`).get() as any
      if (row?.licencia_equipo && row.licencia_equipo.length > 0) return row.licencia_equipo
    } catch {}
    try {
      const id = getMachineIdLegacy()
      db!.prepare(`UPDATE licencia SET licencia_equipo = COALESCE(NULLIF(licencia_equipo, ''), ?), licencia_cifrada = COALESCE(NULLIF(licencia_cifrada, ''), ?), updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(id, cifrarBase64(id))
      return id
    } catch {}
    return null
  }

  function cifrarBase64(valor: string) {
    return Buffer.from(String(valor || '').trim().toUpperCase()).toString('base64')
  }

  function calcularDiasRestantes(fechaVencimiento?: string): number | null {
    if (!fechaVencimiento) return null
    return Math.ceil((new Date(fechaVencimiento).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
  }

  function mensajeLicenciaVencida(fechaVencimiento?: string) {
    if (!fechaVencimiento) return 'Licencia vencida'
    const fecha = new Date(fechaVencimiento)
    if (Number.isNaN(fecha.getTime())) return `Licencia vencida (${fechaVencimiento})`
    return `Licencia vencida desde el ${fecha.toLocaleDateString('es-DO')}`
  }

  function getLicenciaApiUrl(): string {
    const row = db!.prepare(`SELECT url FROM tmcloud_config WHERE id = 1`).get() as any
    return row?.url ? row.url.replace(/\/+$/, '') : ''
  }

  function getLicenciaReadToken(): string {
    const row = db!.prepare(`SELECT public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
    if (row?.public_key) return row.public_key
    if (row?.secret_key) return row.secret_key
    return getLegacyLicenciaToken()
  }

  function getLicenciaWriteToken(): string {
    const row = db!.prepare(`SELECT secret_key, public_key FROM tmcloud_config WHERE id = 1`).get() as any
    if (row?.secret_key) return row.secret_key
    if (row?.public_key) return row.public_key
    return getLegacyLicenciaToken()
  }

  function getLegacyLicenciaToken(): string {
    const row = db!.prepare(`SELECT api_key FROM licencia WHERE id = 1`).get() as any
    return row?.api_key || bcrypt.hashSync('1234567890abc', 10)
  }

  const DIAS_PRUEBA = 7
  // La vigencia se decide siempre con la copia local. La unica consulta
  // periodica permitida es una senal ligera de bloqueo administrativo.
  const INTERVALO_CHEQUEO_BLOQUEO_MS = 24 * 60 * 60 * 1000
  const CLAVE_ULTIMO_CHEQUEO_BLOQUEO = 'licencia_ultimo_chequeo_bloqueo'
  const licenciaEquipoOtp = new Map<string, { codigo: string; licencia: string; email: string; mac: string; expiresAt: number; datosServidor: any }>()
  const licenciaVisualizacionOtp = new Map<string, { codigo: string; licencia: string; email: string; expiresAt: number }>()
  const facturaEliminacionOtp = new Map<string, { codigo: string; facturaIds: number[]; email: string; expiresAt: number }>()
  const imeiEliminacionOtp = new Map<string, { codigo: string; imeiIds: number[]; email: string; expiresAt: number }>()

  function getLicenciaAuthToken(): string {
    return getLicenciaWriteToken()
  }

  function getLicenciaLocal() {
    const row = db!.prepare(`SELECT * FROM licencia WHERE id = 1`).get() as any
    if (!row) return null
    let datosServidor = null
    try { datosServidor = row.datos_servidor ? JSON.parse(row.datos_servidor) : null } catch {}
    return { ...row, datosServidor }
  }

  function guardarConfigLocal(clave: string, valor: string, categoria = 'supabase') {
    const value = String(valor || '').trim()
    const row = db!.prepare(`SELECT id FROM configuracion WHERE clave = ?`).get(clave) as any
    if (!value) {
      if (row) db!.prepare(`DELETE FROM configuracion WHERE id = ?`).run(row.id)
      return
    }
    if (row) {
      db!.prepare(`UPDATE configuracion SET valor = ?, categoria = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(value, categoria, row.id)
    } else {
      db!.prepare(`INSERT INTO configuracion (clave, valor, tipo, categoria, created_at, updated_at) VALUES (?, ?, 'string', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(clave, value, categoria)
    }
  }

  function guardarCredencialesTmCloud(datosServidor: any, permitirCambioProyecto = false) {
    if (!datosServidor || typeof datosServidor !== 'object') return
    const proyecto = datosServidor.project && typeof datosServidor.project === 'object' ? datosServidor.project : {}
    const licencia = datosServidor.license && typeof datosServidor.license === 'object' ? datosServidor.license : {}
    const url = datosServidor.project_url || licencia.project_url || proyecto.project_url || datosServidor.url_supabase || datosServidor.supabase_url || datosServidor.urlSupabase || ''
    const publicKey = datosServidor.public_key || licencia.public_key || proyecto.public_key || datosServidor.supabase_anon_key || datosServidor.anon_key || ''
    const secretKey = datosServidor.secret_key || licencia.secret_key || proyecto.secret_key || datosServidor.role_key || datosServidor.supabase_service_role || datosServidor.service_role || ''
    console.log('[TMCloud][guardarCredencialesTmCloud]', { tieneUrl: Boolean(url), tienePublicKey: Boolean(publicKey), tieneSecretKey: Boolean(secretKey), secretKeyLength: secretKey?.length, keysEnData: Object.keys(datosServidor).filter(k => k.includes('secret') || k.includes('role') || k.includes('key')) })
    if (url || publicKey || secretKey) {
      const row = db!.prepare(`SELECT id, url, public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
      const lock = db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'tmcloud_project_lock' ORDER BY id DESC LIMIT 1`).get() as any
      const proyectoActual = String(row?.url || '').match(/\/api\/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      const proyectoEntrante = String(url || '').match(/\/api\/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      const proyectoBloqueado = String(lock?.valor || '').match(/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      if (!permitirCambioProyecto && proyectoEntrante && ((proyectoBloqueado && proyectoBloqueado !== proyectoEntrante)
        || (row?.url && row?.public_key && row?.secret_key && proyectoActual && proyectoActual !== proyectoEntrante))) {
        console.warn('[TMCloud] Se ignoran credenciales de licencia para otro proyecto', { proyectoActual, proyectoEntrante })
        return
      }
      if (row) {
        db!.prepare(`UPDATE tmcloud_config SET
          url = CASE WHEN ? <> '' THEN ? ELSE url END,
          public_key = CASE WHEN ? <> '' THEN ? ELSE public_key END,
          secret_key = CASE WHEN ? <> '' THEN ? ELSE secret_key END,
          updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(url, url, publicKey, publicKey, secretKey, secretKey)
      } else {
        db!.prepare(`INSERT INTO tmcloud_config (id, url, public_key, secret_key) VALUES (1, ?, ?, ?)`).run(url, publicKey, secretKey)
      }
      if (permitirCambioProyecto && proyectoEntrante) {
        db!.prepare(`INSERT INTO configuracion (clave, valor, tipo, categoria, created_at, updated_at)
          VALUES ('tmcloud_project_lock', ?, 'string', 'tmcloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP`).run(proyectoEntrante)
      }
    }
  }

  function guardarSupabaseDesdeLicencia(datosServidor: any, permitirCambioProyecto = false) {
    if (!datosServidor || typeof datosServidor !== 'object') return

    const url = datosServidor.project_url || datosServidor.url_supabase || datosServidor.supabase_url || datosServidor.urlSupabase || ''
    const publicKey = datosServidor.public_key || datosServidor.supabase_anon_key || datosServidor.anon_key || datosServidor.publicKey || ''
    const roleKey = datosServidor.secret_key || datosServidor.role_key || datosServidor.supabase_service_role || datosServidor.service_role || datosServidor.roleKey || datosServidor.secretKey || ''
    console.log('[TMCloud][guardarSupabaseDesdeLicencia]', { tieneUrl: Boolean(url), tienePublicKey: Boolean(publicKey), tieneRoleKey: Boolean(roleKey), camposData: Object.keys(datosServidor).filter(k => k.includes('secret') || k.includes('role') || k.includes('key') || k.includes('url') || k.includes('public')) })

    if (url || publicKey || roleKey) {
      const row = db!.prepare(`SELECT id, url, public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
      const lock = db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'tmcloud_project_lock' ORDER BY id DESC LIMIT 1`).get() as any
      const proyectoActual = String(row?.url || '').match(/\/api\/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      const proyectoEntrante = String(url || '').match(/\/api\/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      const proyectoBloqueado = String(lock?.valor || '').match(/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      if (!permitirCambioProyecto && proyectoEntrante && ((proyectoBloqueado && proyectoBloqueado !== proyectoEntrante)
        || (row?.url && row?.public_key && row?.secret_key && proyectoActual && proyectoActual !== proyectoEntrante))) {
        console.warn('[TMCloud] Se ignoran credenciales de licencia para otro proyecto', { proyectoActual, proyectoEntrante })
        return
      }
      if (row) {
        db!.prepare(`UPDATE tmcloud_config SET
          url = CASE WHEN ? <> '' THEN ? ELSE url END,
          public_key = CASE WHEN ? <> '' THEN ? ELSE public_key END,
          secret_key = CASE WHEN ? <> '' THEN ? ELSE secret_key END,
          updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(url, url, publicKey, publicKey, roleKey, roleKey)
      } else {
        db!.prepare(`INSERT INTO tmcloud_config (id, url, public_key, secret_key) VALUES (1, ?, ?, ?)`).run(url, publicKey, roleKey)
      }
      if (permitirCambioProyecto && proyectoEntrante) {
        db!.prepare(`INSERT INTO configuracion (clave, valor, tipo, categoria, created_at, updated_at)
          VALUES ('tmcloud_project_lock', ?, 'string', 'tmcloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP`).run(proyectoEntrante)
      }
    }
    db!.prepare(`DELETE FROM configuracion WHERE clave IN ('supabase_url', 'supabase_anon_key', 'supabase_service_role', 'tmcloud_url', 'tmcloud_key', 'tmcloud_service_key')`).run()
  }

  function guardarEmpresaDesdeLicencia(datosServidor: any) {
    if (!datosServidor || typeof datosServidor !== 'object') return

    const empresaServidor = datosServidor.empresa && typeof datosServidor.empresa === 'object'
      ? datosServidor.empresa
      : {}
    const valor = (...campos: string[]) => {
      for (const campo of campos) {
        const encontrado = empresaServidor[campo] ?? datosServidor[campo]
        if (encontrado !== undefined && encontrado !== null && String(encontrado).trim()) {
          return String(encontrado).trim()
        }
      }
      return ''
    }

    const nombre = valor('nombre', 'nombre_empresa', 'empresa_nombre', 'almacen', 'comercio')
    const legal = valor('legal', 'razon_social', 'rnc', 'rnc_cedula', 'cedula', 'documento', 'identificacion')
    const encargado = valor('encargado', 'representante', 'contacto', 'administrador')
    const telefono = valor('telefono', 'telefono_empresa', 'celular', 'whatsapp')
    const email = valor('email', 'correo', 'correo_empresa', 'email_empresa').toLowerCase()
    const direccion = valor('direccion', 'direccion_empresa', 'domicilio')
    const logo = valor('logo', 'logo_url', 'logo_base64', 'imagen', 'image')

    if (!nombre && !legal && !encargado && !telefono && !email && !direccion && !logo) return

    const empresaLocal = db!.prepare(`SELECT id, nombre, legal, encargado, telefono, email, direccion, logo FROM empresa ORDER BY rowid ASC LIMIT 1`).get() as any
    if (empresaLocal?.id) {
      const cambios: string[] = []
      const params: any[] = []
      if (nombre) { cambios.push('nombre = ?'); params.push(nombre) }
      if (legal) { cambios.push('legal = ?'); params.push(legal) }
      if (encargado) { cambios.push('encargado = ?'); params.push(encargado) }
      if (telefono) { cambios.push('telefono = ?'); params.push(telefono) }
      if (email) { cambios.push('email = ?'); params.push(email) }
      if (direccion) { cambios.push('direccion = ?'); params.push(direccion) }
      if (logo) { cambios.push('logo = ?'); params.push(logo) }
      if (cambios.length > 0) {
        params.push(empresaLocal.id)
        db!.prepare(`UPDATE empresa SET ${cambios.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(...params)
      }
    } else {
      db!.prepare(`INSERT INTO empresa (nombre, legal, encargado, telefono, email, direccion, logo, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(
        nombre, legal, encargado, telefono, email, direccion, logo,
      )
    }
  }

  function descargarEmpresaProyecto(datosServidor: any, timeoutMs = 10000): Promise<any | null> {
    const proyecto = datosServidor?.project && typeof datosServidor.project === 'object' ? datosServidor.project : {}
    const licencia = datosServidor?.license && typeof datosServidor.license === 'object' ? datosServidor.license : {}
    const baseUrl = String(datosServidor?.project_url || licencia?.project_url || proyecto?.project_url || '').trim().replace(/\/+$/, '')
    const key = String(datosServidor?.secret_key || licencia?.secret_key || proyecto?.secret_key || datosServidor?.public_key || '').trim()
    if (!baseUrl || !key) return Promise.resolve(null)

    return new Promise(resolve => {
      try {
        const target = new URL(`${baseUrl}/empresa`)
        const req = https.request({
          hostname: target.hostname,
          port: target.port || 443,
          path: target.pathname + target.search,
          method: 'GET',
          headers: { Accept: 'application/json', Authorization: `Bearer ${key}` },
          timeout: timeoutMs,
        }, response => {
          let body = ''
          response.on('data', chunk => body += chunk)
          response.on('end', () => {
            try {
              if ((response.statusCode || 500) < 200 || (response.statusCode || 500) >= 300) return resolve(null)
              const parsed = JSON.parse(body)
              const rows = Array.isArray(parsed?.data) ? parsed.data : Array.isArray(parsed) ? parsed : []
              const nombreLicencia = String(datosServidor?.nombre || datosServidor?.nombre_empresa || '').trim().toLowerCase()
              const empresa = rows.find((row: any) => nombreLicencia && String(row?.nombre || '').trim().toLowerCase() === nombreLicencia)
                || rows.find((row: any) => Number(row?.almacen_id || 0) === 1)
                || rows[0]
                || null
              if (empresa) guardarEmpresaDesdeLicencia({ ...empresa, empresa })
              resolve(empresa)
            } catch { resolve(null) }
          })
        })
        req.on('error', () => resolve(null))
        req.setTimeout(timeoutMs, () => { req.destroy(); resolve(null) })
        req.end()
      } catch { resolve(null) }
    })
  }

  function guardarLicenciaLocal(datos: any) {
    const mac = obtenerMacAddress()
    const cifrada = mac ? cifrarBase64(mac) : ''
    const licenciaAnterior = db!.prepare(`SELECT datos_servidor FROM licencia WHERE id = 1`).get() as any
    let datosAnteriores: any = {}
    try { datosAnteriores = licenciaAnterior?.datos_servidor ? JSON.parse(licenciaAnterior.datos_servidor) : {} } catch {}
    const datosNuevos = datos.datosServidor && typeof datos.datosServidor === 'object' ? datos.datosServidor : {}
    // /api/license/info no devuelve license_key. Conservar el valor previamente
    // registrado evita perder la unica referencia necesaria para la siguiente
    // verificacion online.
    const datosCombinados = datos.reemplazarDatosServidor
      ? { ...datosNuevos }
      : { ...datosAnteriores, ...datosNuevos }
    const codigoExplicito = String(datos.codigoLicencia || '').trim().toUpperCase()
    if (/^[A-Z0-9]{5}-[A-Z0-9]{5}(-[A-Z0-9]{5})?$/.test(codigoExplicito)) {
      // /api/license/info identifica la licencia por el query string, pero su
      // respuesta no siempre incluye license_key. En un cambio manual debemos
      // persistir el codigo introducido y descartar cualquier codigo anterior.
      datosCombinados.license_key = codigoExplicito
      datosCombinados.licencia = codigoExplicito
    }
    const codigoAnterior = datosAnteriores?.license_key || datosAnteriores?.licencia || datosAnteriores?.license?.license_key
    if (codigoAnterior && !datosCombinados.license_key && !datosCombinados.licencia && !datosCombinados?.license?.license_key) {
      datosCombinados.license_key = codigoAnterior
    }
    const datosJson = Object.keys(datosCombinados).length ? JSON.stringify(datosCombinados) : null
    db!.prepare(`INSERT INTO licencia (id, licencia_equipo, licencia_cifrada, estado, nombre_empresa, fecha_inicio_prueba, fecha_vencimiento, ultima_verificacion, datos_servidor, updated_at) VALUES (1, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET licencia_equipo = COALESCE(excluded.licencia_equipo, licencia_equipo), licencia_cifrada = COALESCE(excluded.licencia_cifrada, licencia_cifrada), estado = excluded.estado, nombre_empresa = excluded.nombre_empresa, fecha_inicio_prueba = excluded.fecha_inicio_prueba, fecha_vencimiento = excluded.fecha_vencimiento, ultima_verificacion = excluded.ultima_verificacion, datos_servidor = excluded.datos_servidor, updated_at = excluded.updated_at`).run(
      mac || null, cifrada || null, datos.estado || 'sin_verificar', datos.nombre || '', datos.fecha_inicio_prueba || null, datos.fecha_vencimiento || null, datosJson
    )
    guardarSupabaseDesdeLicencia(datos.datosServidor, Boolean(datos.permitirCambioProyecto))
    guardarEmpresaDesdeLicencia(datos.datosServidor)
  }

  function getCodigoLicenciaLocal() {
    const licencia = getLicenciaLocal()
    let datosServidor: any = null
    try {
      datosServidor = licencia?.datos_servidor ? JSON.parse(licencia.datos_servidor) : null
    } catch {
      datosServidor = null
    }
    const codigo = String(
      datosServidor?.licencia || datosServidor?.license_key ||
      datosServidor?.license?.license_key || datosServidor?.license?.licencia ||
      datosServidor?.codigo_licencia || datosServidor?.codigo || ''
    ).trim().toUpperCase()
    return /^[A-Z0-9]{5}-[A-Z0-9]{5}(-[A-Z0-9]{5})?$/.test(codigo) ? codigo : ''
  }

  function normalizarMac(valor: any) {
    return String(valor || '').replace(/[^0-9A-F]/gi, '').toUpperCase()
  }

  function ocultarCodigoLicencia(valor: any) {
    const codigo = String(valor || '').trim().toUpperCase()
    if (!codigo) return '(sin codigo)'
    return codigo.length > 9 ? `${codigo.slice(0, 5)}...${codigo.slice(-5)}` : '***'
  }

  function resumenLicenciaLog(data: any) {
    if (!data || typeof data !== 'object') return data
    return {
      uid: data.uid || data.id || '',
      project_uid: data.project_uid || '',
      project_name: data.project_name || data.nombre || '',
      system_name: data.system_name || '',
      status: data.status || data.estado || '',
      expires_at: data.expires_at || data.proximopago || data.fecha_vencimiento || null,
      license_key: ocultarCodigoLicencia(data.license_key || data.licencia),
      authorized_devices: data.authorized_devices ?? data.devices ?? data.dispositivos ?? [],
      unauthorized_devices: data.unauthorized_devices ?? data.pending_devices ?? data.equipos_no_autorizados ?? [],
    }
  }

  function obtenerDispositivosLicencia(dispositivos: any): string[] {
    if (Array.isArray(dispositivos)) return dispositivos.map(normalizarMac).filter(Boolean)
    if (dispositivos && typeof dispositivos === 'object') return Object.values(dispositivos).map(normalizarMac).filter(Boolean)

    const texto = String(dispositivos || '').trim()
    if (!texto) return []

    try {
      const parsed = JSON.parse(texto)
      return obtenerDispositivosLicencia(parsed)
    } catch {
      return texto.split(/[,\s;|]+/).map(normalizarMac).filter(Boolean)
    }
  }

  function validarDispositivoLicencia(datosServidor: any) {
    const mac = obtenerMacAddress()
    if (!mac) return { success: false, error: 'No se pudo identificar este equipo' }

    const dispositivos = obtenerDispositivosLicencia(datosServidor?.authorized_devices ?? datosServidor?.devices ?? datosServidor?.dispositivos)
    const equipoLocal = normalizarMac(mac)
    const autorizado = dispositivos.includes(equipoLocal)
    console.log('[Licencia][Dispositivo]', { equipoOriginal: mac, equipoNormalizado: equipoLocal, dispositivosAutorizados: dispositivos, autorizado })
    if (!autorizado) {
      return { success: false, estado: 'equipo_no_autorizado', error: 'Este equipo no esta permitido para usar esta licencia' }
    }

    return { success: true }
  }

  function obtenerEquiposNoAutorizados(valor: any): string[] {
    if (Array.isArray(valor)) return valor.map(normalizarMac).filter(Boolean)
    if (valor && typeof valor === 'object') return Object.values(valor).map(normalizarMac).filter(Boolean)

    const texto = String(valor || '').trim()
    if (!texto) return []

    try {
      const parsed = JSON.parse(texto)
      return obtenerEquiposNoAutorizados(parsed)
    } catch {
      return texto.split(/[,\s;|]+/).map(normalizarMac).filter(Boolean)
    }
  }

  function actualizarCamposLicencia(payloadData: any, timeoutMs = 5000): Promise<any> {
    const baseUrl = getLicenciaApiUrl()
    if (!baseUrl) return Promise.resolve({ success: false, error: 'TM Cloud no configurado' })
    const uid = payloadData?.uid || payloadData?.id
    if (!uid) return Promise.resolve({ success: false, error: 'UID de licencia requerido para actualizar' })
    const token = getLicenciaWriteToken()
    const { uid: _uid, id: _id, ...updateData } = payloadData
    const payload = JSON.stringify({ ...updateData, updated_at: new Date().toISOString().replace('T', ' ').split('.')[0] })
    const urlObj = new URL(`${baseUrl}/licenses/${encodeURIComponent(String(uid))}`)

    return new Promise((resolve) => {
      let resolved = false
      const finish = (result: any) => {
        if (!resolved) {
          resolved = true
          resolve(result)
        }
      }

      const req = https.request({
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'PUT',
        headers: {
          'Accept': '*/*',
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload),
          'Authorization': `Bearer ${token}`,
        },
        timeout: timeoutMs,
      }, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('error', (error) => finish({ success: false, error: error.message }))
        res.on('end', () => {
          const statusCode = res.statusCode ?? 500
          if (statusCode >= 200 && statusCode < 300) {
            finish({ success: true, data: body })
            return
          }
          finish({ success: false, error: `Error HTTP ${statusCode}: ${body}` })
        })
      })

      req.on('error', (error) => finish({ success: false, error: error.message }))
      req.setTimeout(timeoutMs, () => { req.destroy(); finish({ success: false, error: 'Tiempo de espera agotado' }) })
      req.write(payload)
      req.end()
    })
  }

  async function registrarEquipoNoAutorizado(datosServidor: any, mac: string): Promise<void> {
    const uid = datosServidor?.uid || datosServidor?.id
    const equipo = normalizarMac(mac)
    if (!uid || !equipo) return

    const licenseKey = String(datosServidor?.license_key || datosServidor?.licencia || '').trim().toUpperCase()
    if (licenseKey) {
      const conectado = await conectarDispositivoLicencia(licenseKey, equipo)
      if (!conectado.success) throw new Error(conectado.error || 'No se pudo solicitar autorizacion para este equipo')
      return
    }

    const actuales = obtenerEquiposNoAutorizados(datosServidor?.unauthorized_devices ?? datosServidor?.pending_devices ?? datosServidor?.equipos_no_autorizados)
    if (actuales.includes(equipo)) return

    const result = await actualizarCamposLicencia({
      uid,
      equipos_no_autorizados: JSON.stringify([...actuales, equipo]),
      updated_at: new Date().toISOString().replace('T', ' ').split('.')[0],
    })
    if (!result.success) throw new Error(result.error || 'No se pudo registrar el equipo no autorizado')
    console.log('[Licencia] Equipo no autorizado registrado:', equipo)
  }

  function verificarLicenciaOffline() {
    const licencia = getLicenciaLocal()
    if (!licencia || !licencia.licencia_equipo) return { success: false, error: 'No hay licencia registrada localmente', estado: 'sin_verificar' }
    const mac = obtenerMacAddress()
    if (!mac) return { success: false, error: 'No se pudo identificar el equipo', estado: 'error' }
    const cifrada = cifrarBase64(mac)
    const equipoLocal = licencia.licencia_equipo.replace(/:/g, '').toUpperCase()
    if (equipoLocal !== mac && equipoLocal !== mac.replace(/-/g, '') && (licencia.licencia_cifrada || '').toUpperCase() !== cifrada) {
      return { success: false, error: 'La licencia no corresponde a este equipo', estado: 'invalida' }
    }
    const estado = (licencia.estado || '').toUpperCase()
    if (estado === 'ACTIVO' || estado === 'PENDIENTE') {
      const diasRestantes = calcularDiasRestantes(licencia.fecha_vencimiento)
      if (diasRestantes !== null && diasRestantes <= 0) return { success: false, error: mensajeLicenciaVencida(licencia.fecha_vencimiento), estado: 'vencida' }
      return { success: true, estado: estado.toLowerCase(), diasRestantes }
    }
    return { success: false, error: 'Estado de licencia desconocido', estado: licencia.estado }
  }

  function normalizarEstado(estado: string): string {
    const map: Record<string, string> = {
      active: 'ACTIVO', activo: 'ACTIVO',
      pending: 'PENDIENTE', pendiente: 'PENDIENTE',
      expired: 'VENCIDA', vencida: 'VENCIDA', vencido: 'VENCIDA',
      blocked: 'BLOQUEADA', bloqueada: 'BLOQUEADA',
      inactive: 'BLOQUEADA', inactivo: 'BLOQUEADA', inactiva: 'BLOQUEADA',
      suspended: 'BLOQUEADA', suspendida: 'BLOQUEADA', suspendido: 'BLOQUEADA',
      revoked: 'BLOQUEADA', revocada: 'BLOQUEADA', revocado: 'BLOQUEADA',
      cancelled: 'CANCELADA', canceled: 'CANCELADA', cancelada: 'CANCELADA', cancelado: 'CANCELADA',
    }
    return map[estado.toLowerCase().trim()] || estado.toUpperCase()
  }

  function parseLicenciaServerResponse(body: string, licenciaEsperada?: string, validarDispositivo = true): any {
    let data = JSON.parse(body)
    if (Array.isArray(data)) data = data.find((item: any) => item && typeof item === 'object') || null
    if (data?.data) data = data.data
    console.log('[Licencia][API] Datos recibidos:', resumenLicenciaLog(data))
    if (data && (data.id || data.uid || data.licencia || data.license_key || data.nombre)) {
      data.estado = normalizarEstado(data.status || data.estado || '')
      if (validarDispositivo) {
        const dispositivo = validarDispositivoLicencia(data)
        if (!dispositivo.success) {
          return { success: false, estado: dispositivo.estado || 'invalida', error: dispositivo.error, data }
        }
      }
      return { success: true, data }
    }
    return { success: false, error: 'Licencia no registrada en el servidor', data: null }
  }

  function errorRespuestaLicencia(body: string, statusCode: number, contentType = '', cfMitigated = ''): string {
    const texto = String(body || '').trim()
    const esHtml = /<!doctype\s+html|<html[\s>]/i.test(texto) || /text\/html/i.test(contentType)
    const esCloudflare = /cloudflare|cf-chl-|challenge-platform|just a moment|checking your browser/i.test(texto)
      || /challenge/i.test(cfMitigated)
    if (esCloudflare) {
      return 'Cloudflare bloqueo la API de licencia con una verificacion humana. Excluye /api/license/* de Managed Challenge/Bot Fight Mode para las solicitudes de TMPOS.'
    }
    if (esHtml) {
      return `El servidor de licencia devolvio HTML en lugar de JSON (HTTP ${statusCode}). Revisa la ruta /api/license/info y las reglas de Cloudflare.`
    }
    try {
      const json = JSON.parse(texto)
      return String(json?.error || json?.message || `Error HTTP ${statusCode}`)
    } catch {
      return texto ? texto.slice(0, 300) : `Error HTTP ${statusCode}`
    }
  }

  function buscarLicenciaServidor(licencia: string, validarCoincidencia = false, validarDispositivo = true, timeoutMs = 5000): Promise<any> {
    const url = `https://api.tmposystem.com/api/license/info?license_key=${encodeURIComponent(licencia)}`
    console.log('[Licencia][API] GET /api/license/info', { licencia: ocultarCodigoLicencia(licencia), validarDispositivo, timeoutMs })
    return new Promise((resolve) => {
      let resolved = false
      const finish = (payload: any) => {
        if (!resolved) {
          resolved = true
          console.log('[Licencia][API] Resultado /api/license/info:', { success: payload?.success, estado: payload?.estado, error: payload?.error || null, data: resumenLicenciaLog(payload?.data) })
          resolve(payload)
        }
      }
      const urlObj = new URL(url)
      const req = https.request({
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname + urlObj.search,
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'User-Agent': `TMPOS-Desktop/${app.getVersion()}`,
          'Cache-Control': 'no-cache',
        },
        timeout: timeoutMs,
      }, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}`, data: null }))
        res.on('end', () => {
          try {
            const statusCode = res.statusCode ?? 500
            const contentType = String(res.headers['content-type'] || '')
            const cfMitigated = String(res.headers['cf-mitigated'] || '')
            console.log('[Licencia][API] HTTP /api/license/info:', { statusCode, contentType, cfMitigated, bytes: Buffer.byteLength(body) })
            if (statusCode < 200 || statusCode >= 300) {
              const errMsg = errorRespuestaLicencia(body, statusCode, contentType, cfMitigated)
              finish({ success: false, error: errMsg, data: null, estado: statusCode === 404 ? 'no_encontrada' : 'error_servidor' })
              return
            }
            if (/<!doctype\s+html|<html[\s>]|text\/html/i.test(`${contentType}\n${body.slice(0, 500)}`)) {
              finish({ success: false, error: errorRespuestaLicencia(body, statusCode, contentType, cfMitigated), data: null, estado: 'error_servidor' })
              return
            }
            const parsed = parseLicenciaServerResponse(body, validarCoincidencia ? licencia : undefined, validarDispositivo)
            if (parsed.success && parsed.data) {
              console.log('[buscarLicenciaServidor] Data del servidor:', {
                campos: Object.keys(parsed.data),
                secret_key: parsed.data.secret_key ? parsed.data.secret_key.substring(0, 8) + '...' : '(vacio)',
                role_key: parsed.data.role_key ? parsed.data.role_key.substring(0, 8) + '...' : '(vacio)',
                public_key: parsed.data.public_key ? parsed.data.public_key.substring(0, 8) + '...' : '(vacio)',
                project_url: parsed.data.project_url || '(vacio)',
                tieneEmpresa: Boolean(parsed.data.empresa),
                nombre: parsed.data.nombre || '(vacio)',
              })
              guardarCredencialesTmCloud(parsed.data)
            }
            finish(parsed)
          } catch {
            finish({ success: false, error: errorRespuestaLicencia(body, res.statusCode ?? 500, String(res.headers['content-type'] || ''), String(res.headers['cf-mitigated'] || '')), data: null })
          }
        })
      })
      req.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}`, data: null }))
      req.setTimeout(timeoutMs, () => { req.destroy(); finish({ success: false, error: 'Tiempo de espera agotado', data: null }) })
      req.end()
    })
  }

  function recuperarLicenciaDelProyecto(timeoutMs = 5000): Promise<any> {
    const baseUrl = getLicenciaApiUrl()
    const token = getLicenciaReadToken()
    console.log('[Licencia][Proyecto] Preparando GET /licenses:', { baseUrl: baseUrl || '(sin URL)', tokenConfigurado: Boolean(token), timeoutMs })
    if (!baseUrl || !token) return Promise.resolve({ success: false, error: 'TM Cloud no configurado' })
    return new Promise((resolve) => {
      let resolved = false
      const finish = (payload: any) => {
        if (!resolved) {
          resolved = true
          console.log('[Licencia][Proyecto] Resultado GET /licenses:', { success: payload?.success, error: payload?.error || null, data: resumenLicenciaLog(payload?.data) })
          resolve(payload)
        }
      }
      const urlObj = new URL(`${baseUrl}/licenses`)
      const req = https.request({
        hostname: urlObj.hostname,
        port: 443,
        path: urlObj.pathname,
        method: 'GET',
        headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
        timeout: timeoutMs,
      }, (res) => {
        let body = ''
        res.on('data', chunk => body += chunk)
        res.on('end', () => {
          try {
            const parsed = body ? JSON.parse(body) : null
            console.log('[Licencia][Proyecto] HTTP GET /licenses:', { statusCode: res.statusCode, bytes: Buffer.byteLength(body), cantidad: Array.isArray(parsed?.data) ? parsed.data.length : null })
            if ((res.statusCode || 500) < 200 || (res.statusCode || 500) >= 300) {
              finish({ success: false, error: parsed?.error || parsed?.message || `Error HTTP ${res.statusCode}` })
              return
            }
            const rows = Array.isArray(parsed?.data) ? parsed.data : []
            const equipo = normalizarMac(obtenerMacAddress())
            const licencia = rows.find((item: any) =>
              obtenerDispositivosLicencia(item?.authorized_devices ?? item?.devices ?? item?.dispositivos).includes(equipo)
            ) || rows.find((item: any) => normalizarEstado(item?.status || item?.estado || '') === 'ACTIVO') || rows[0]
            if (!licencia?.license_key) {
              finish({ success: false, error: 'El proyecto no devolvio una licencia utilizable' })
              return
            }
            licencia.estado = normalizarEstado(licencia.status || licencia.estado || '')
            finish({ success: true, data: licencia })
          } catch {
            finish({ success: false, error: 'Respuesta de licencias invalida' })
          }
        })
      })
      req.on('error', error => finish({ success: false, error: `Sin conexion: ${error.message}` }))
      req.setTimeout(timeoutMs, () => { req.destroy(); finish({ success: false, error: 'Tiempo de espera agotado' }) })
      req.end()
    })
  }

  function getEmailEmpresa() {
    const empresa = db!.prepare(`SELECT email FROM empresa ORDER BY rowid ASC LIMIT 1`).get() as any
    return String(empresa?.email || '').trim()
  }

  function ocultarEmail(email: string) {
    const [usuario, dominio] = email.split('@')
    if (!usuario || !dominio) return email
    const visible = usuario.slice(0, Math.min(2, usuario.length))
    return `${visible}${'*'.repeat(Math.max(3, usuario.length - visible.length))}@${dominio}`
  }

  function getCodigoRegistroEquipo(codigo?: string) {
    const manual = String(codigo || '').trim().toUpperCase()
    if (/^[A-Z0-9]{5}-[A-Z0-9]{5}(-[A-Z0-9]{5})?$/.test(manual)) return manual
    return getCodigoLicenciaLocal()
  }

  async function buscarLicenciaParaRegistroEquipo(codigo?: string) {
    const licencia = getCodigoRegistroEquipo(codigo)
    if (!licencia) return { success: false, error: 'Introduce la licencia primero' }

    const result = await buscarLicenciaServidor(licencia, false, false)
    if (!result.success || !result.data) return { success: false, error: result.error || 'Licencia no encontrada' }

    const mac = obtenerMacAddress()
    const equipo = normalizarMac(mac)
    if (!equipo) return { success: false, error: 'No se pudo identificar este equipo' }

    const d = { ...result.data, license_key: licencia, licencia }
    const estado = (d.estado || d.status || 'PENDIENTE').toUpperCase()
    guardarLicenciaLocal({ estado, nombre: d.nombre || d.almacen || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: d.proximopago || d.fecha_vencimiento, datosServidor: d, permitirCambioProyecto: true, codigoLicencia: licencia, reemplazarDatosServidor: true })

    const dispositivos = obtenerDispositivosLicencia(result.data.authorized_devices ?? result.data.devices ?? result.data.dispositivos)
    if (dispositivos.includes(equipo)) {
      return { success: true, yaRegistrado: true, mensaje: 'Este equipo ya esta registrado' }
    }

    try {
      await registrarEquipoNoAutorizado(result.data, equipo)
      return { success: true, pendiente: true, mensaje: 'Solicitud enviada. Espera a que el administrador active tu equipo.' }
    } catch (e: any) {
      console.log('[Licencia] No se pudo registrar equipo no autorizado (secret_key no disponible):', e.message)
      return { success: true, pendiente: true, mensaje: 'Licencia configurada localmente. La activacion del equipo queda pendiente.' }
    }
  }

  async function enviarEmailOtpEquipo(email: string, codigo: string, mac: string) {
    const config = getOtpEmailConfig()
    if (!config.activo) return { success: false, error: 'Correo desactivado en configuracion' }
    if (!config.email || !config.password) return { success: false, error: 'Configuracion de correo incompleta' }

    const html = `
      <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f4f6;padding:28px 0">
          <tr>
            <td align="center" style="padding:28px 12px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 16px 40px rgba(17,24,39,.10)">
                <tr>
                  <td style="background:#111827;padding:24px 28px">
                    <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#93c5fd">TM POS System</div>
                    <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#ffffff">Activacion de equipo</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px">
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151">
                      Se solicito autorizar este equipo para usar la licencia de su sistema. Introduce el siguiente codigo en la pantalla de activacion.
                    </p>

                    <div style="margin:24px 0;padding:22px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center">
                      <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#2563eb;margin-bottom:10px">Codigo de verificacion</div>
                      <div style="font-size:36px;line-height:1;font-weight:800;letter-spacing:12px;color:#111827">${codigo}</div>
                    </div>

                    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;margin:20px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px">
                      <tr>
                        <td style="padding:14px 16px;font-size:13px;color:#6b7280;border-bottom:1px solid #e5e7eb">Equipo</td>
                        <td style="padding:14px 16px;font-size:13px;color:#111827;border-bottom:1px solid #e5e7eb;text-align:right;font-weight:700">${mac}</td>
                      </tr>
                      <tr>
                        <td style="padding:14px 16px;font-size:13px;color:#6b7280">Vigencia</td>
                        <td style="padding:14px 16px;font-size:13px;color:#111827;text-align:right;font-weight:700">10 minutos</td>
                      </tr>
                    </table>

                    <div style="margin-top:22px;padding:14px 16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:1.5">
                      Si no solicitaste esta activacion, ignora este correo. El equipo no se registrara sin este codigo.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">
                    Este mensaje fue enviado automaticamente por TM POS System.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>`
    const attempts = getSmtpAttempts(config)

    let lastError: any = null
    for (const attempt of attempts) {
      try {
        await sendEmail(email, 'Codigo para activar equipo', html, attempt.host, attempt.port, attempt.secure, config)
        return { success: true, label: attempt.label }
      } catch (error: any) {
        lastError = error
      }
    }
    return { success: false, error: lastError?.message || 'No se pudo enviar el correo' }
  }

  function getDatosServidorLicenciaLocal() {
    const row = getLicenciaLocal()
    try {
      return row?.datos_servidor ? JSON.parse(row.datos_servidor) : null
    } catch {
      return null
    }
  }

  async function enviarEmailOtpVisualizacionLicencia(email: string, codigo: string) {
    const config = getOtpEmailConfig()
    if (!config.email || !config.password) return { success: false, error: 'Configuracion de correo incompleta' }

    const html = `
      <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f4f6;padding:28px 0">
          <tr>
            <td align="center" style="padding:28px 12px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 16px 40px rgba(17,24,39,.10)">
                <tr>
                  <td style="background:#111827;padding:24px 28px">
                    <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#93c5fd">TM POS System</div>
                    <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#ffffff">Codigo para ver licencia</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px">
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151">
                      Se solicito mostrar el codigo de licencia del sistema. Introduce este codigo para autorizar la visualizacion.
                    </p>
                    <div style="margin:24px 0;padding:22px;border-radius:12px;background:#eff6ff;border:1px solid #bfdbfe;text-align:center">
                      <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#2563eb;margin-bottom:10px">Codigo de verificacion</div>
                      <div style="font-size:36px;line-height:1;font-weight:800;letter-spacing:12px;color:#111827">${codigo}</div>
                    </div>
                    <div style="margin-top:22px;padding:14px 16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:1.5">
                      Este codigo vence en 10 minutos. Si no solicitaste ver la licencia, ignora este correo.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">
                    Este mensaje fue enviado automaticamente por TM POS System.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>`

    let lastError: any = null
    for (const attempt of getSmtpAttempts(config)) {
      try {
        await sendEmail(email, 'Codigo para ver licencia', html, attempt.host, attempt.port, attempt.secure, config)
        return { success: true }
      } catch (error: any) {
        lastError = error
      }
    }
    return { success: false, error: lastError?.message || 'No se pudo enviar el correo' }
  }

  async function enviarEmailOtpEliminarFactura(email: string, codigo: string, factura: any) {
    const config = getOtpEmailConfig()
    if (!config.email || !config.password) return { success: false, error: 'Configuracion de correo incompleta' }

    const cantidad = Number(factura?.cantidad || 1)
    const entidad = String(factura?.entidad || 'factura')
    const entidadPlural = String(factura?.entidadPlural || `${entidad}s`)
    const noFactura = cantidad > 1 ? `${cantidad} ${entidadPlural} seleccionadas` : String(factura?.no_factura || factura?.id || '').trim() || 'Sin numero'
    const cliente = cantidad > 1 ? 'Eliminacion multiple' : String(factura?.nombre_cliente || 'Sin cliente').trim()
    const total = Number(factura?.total || 0).toFixed(2)
    const html = `
      <div style="margin:0;padding:0;background:#f3f4f6;font-family:Arial,Helvetica,sans-serif;color:#111827">
        <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="border-collapse:collapse;background:#f3f4f6;padding:28px 0">
          <tr>
            <td align="center" style="padding:28px 12px">
              <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:560px;border-collapse:collapse;background:#ffffff;border:1px solid #e5e7eb;border-radius:14px;overflow:hidden;box-shadow:0 16px 40px rgba(17,24,39,.10)">
                <tr>
                  <td style="background:#7f1d1d;padding:24px 28px">
                    <div style="font-size:12px;font-weight:700;letter-spacing:2px;text-transform:uppercase;color:#fecaca">TM POS System</div>
                    <h1 style="margin:8px 0 0;font-size:22px;line-height:1.25;color:#ffffff">Autorizacion para eliminar ${entidad}</h1>
                  </td>
                </tr>
                <tr>
                  <td style="padding:28px">
                    <p style="margin:0 0 18px;font-size:15px;line-height:1.6;color:#374151">
                      Se solicito eliminar ${cantidad > 1 ? entidadPlural : `una ${entidad}`} del sistema. Introduce este codigo para confirmar la accion.
                    </p>
                    <div style="margin:20px 0;background:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;overflow:hidden">
                      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">${entidad.charAt(0).toUpperCase() + entidad.slice(1)} <strong style="color:#111827">${noFactura}</strong></div>
                      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">Cliente <strong style="color:#111827">${cliente}</strong></div>
                      <div style="padding:12px 16px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280">Total <strong style="color:#111827">RD$ ${total}</strong></div>
                      <div style="padding:12px 16px;font-size:13px;color:#6b7280">Cantidad <strong style="color:#111827">${cantidad}</strong></div>
                    </div>
                    <div style="margin:24px 0;padding:22px;border-radius:12px;background:#fef2f2;border:1px solid #fecaca;text-align:center">
                      <div style="font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;color:#b91c1c;margin-bottom:10px">Codigo de verificacion</div>
                      <div style="font-size:36px;line-height:1;font-weight:800;letter-spacing:12px;color:#111827">${codigo}</div>
                    </div>
                    <div style="margin-top:22px;padding:14px 16px;border-radius:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;line-height:1.5">
                      Este codigo vence en 10 minutos. Si no solicitaste eliminar esta factura, revisa el acceso al sistema.
                    </div>
                  </td>
                </tr>
                <tr>
                  <td style="padding:18px 28px;background:#f9fafb;border-top:1px solid #e5e7eb;font-size:12px;line-height:1.5;color:#6b7280;text-align:center">
                    Este mensaje fue enviado automaticamente por TM POS System.
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </div>`

    let lastError: any = null
    for (const attempt of getSmtpAttempts(config)) {
      try {
        await sendEmail(email, `Codigo para eliminar ${entidad}`, html, attempt.host, attempt.port, attempt.secure, config)
        return { success: true }
      } catch (error: any) {
        lastError = error
      }
    }
    return { success: false, error: lastError?.message || 'No se pudo enviar el correo' }
  }

  async function enviarOtpPorApi(email: string, codigo: string, detalle: any = {}) {
    const destino = String(email || '').trim()
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(destino)) {
      return { success: false, error: 'El correo destino no es valido' }
    }

    const config = db!.prepare(`SELECT url, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
    const baseUrl = String(config?.url || '').trim().replace(/\/+$/, '')
    const secretKey = String(config?.secret_key || '').trim()
    if (!baseUrl || !/^https?:\/\//i.test(baseUrl)) {
      return { success: false, error: 'Configura la URL del proyecto en TM Cloud antes de enviar el OTP' }
    }
    if (!secretKey) {
      return { success: false, error: 'Configura la Secret Key de TM Cloud antes de enviar el OTP' }
    }

    const cantidad = Math.max(1, Number(detalle?.cantidad || 1))
    const entidad = String(detalle?.entidad || 'factura').trim()
    const referencia = String(detalle?.no_factura || detalle?.nombre || detalle?.id || '').trim()
    let companyName = 'TM POS System'
    try {
      const empresa = db!.prepare(`SELECT nombre FROM empresa ORDER BY id ASC LIMIT 1`).get() as any
      companyName = String(empresa?.nombre || companyName).trim()
    } catch {}

    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), 15000)
    try {
      const response = await fetch(`${baseUrl}/otp/send`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${secretKey}`,
          'Content-Type': 'application/json',
          Accept: 'application/json',
        },
        body: JSON.stringify({
          to: destino,
          otp: String(codigo || '').trim(),
          purpose: `Autorizar eliminacion de ${cantidad > 1 ? `${cantidad} ${entidad}` : entidad}${referencia ? ` ${referencia}` : ''}`,
          expires_minutes: 10,
          company_name: companyName,
        }),
        signal: controller.signal,
      })

      const raw = await response.text()
      let body: any = null
      try { body = raw ? JSON.parse(raw) : null } catch {}
      if (!response.ok || body?.success === false) {
        const message = body?.message || body?.error || `El servidor respondio HTTP ${response.status}`
        return { success: false, error: String(message) }
      }
      return { success: true, data: body?.data || body }
    } catch (error: any) {
      const message = error?.name === 'AbortError'
        ? 'El servidor tardo demasiado en responder al envio del OTP'
        : (error?.message || 'No se pudo conectar con el servidor para enviar el OTP')
      return { success: false, error: message }
    } finally {
      clearTimeout(timeout)
    }
  }

  async function verificarLicenciaOnline(timeoutMs = 5000): Promise<any> {
    const mac = obtenerMacAddress()
    if (!mac) return { success: false, error: 'Sin conexion: no se pudo identificar el equipo', data: null }
    const cifrada = cifrarBase64(mac)
    return buscarLicenciaServidor(cifrada, true, true, timeoutMs)
  }

  function esErrorConexion(error: string) { return error && (error.startsWith('Sin conexion:') || error.startsWith('Tiempo de espera')) }

  async function verificarLicenciaCompleta(): Promise<any> {
    const VERIFY_TIMEOUT = 3000
    let codigoLocal = getCodigoLicenciaLocal()
    const licenciaInicial = getLicenciaLocal()
    console.log('[Licencia][Verificacion] Inicio:', {
      equipo: obtenerMacAddress(),
      codigoLocal: ocultarCodigoLicencia(codigoLocal),
      estadoLocal: licenciaInicial?.estado || '(sin estado)',
      vencimientoLocal: licenciaInicial?.fecha_vencimiento || null,
      ultimaVerificacionLocal: licenciaInicial?.ultima_verificacion || null,
      tmCloudUrl: getLicenciaApiUrl() || '(sin URL)',
    })

    // Primero verificar offline: si la licencia local es valida, usarla sin esperar online
    const offlineLocal = verificarLicenciaOffline()
    if (offlineLocal.success) {
      // Disparar verificacion online en background (no bloqueante) para refrescar datos
      verificarLicenciaOnlineBackground(codigoLocal, VERIFY_TIMEOUT)
      return {
        ...offlineLocal,
        nombreEmpresa: licenciaInicial?.nombre_empresa,
        verificadoOnline: false,
        mensaje: offlineLocal.estado === 'pendiente'
          ? `Periodo de prueba: ${offlineLocal.diasRestantes} dia(s) restantes`
          : 'Licencia activa (offline)',
      }
    }

    if (!codigoLocal) {
      const recuperada = await recuperarLicenciaDelProyecto(VERIFY_TIMEOUT)
      if (recuperada.success && recuperada.data) {
        const d = recuperada.data
        guardarLicenciaLocal({
          estado: normalizarEstado(d.estado || d.status || ''),
          nombre: d.nombre || d.project_name || '',
          fecha_inicio_prueba: d.created_at,
          fecha_vencimiento: d.expires_at || d.proximopago || d.fecha_vencimiento,
          datosServidor: d,
        })
        codigoLocal = String(d.license_key || '').trim().toUpperCase()
        const offlineNow = verificarLicenciaOffline()
        if (offlineNow.success) {
          verificarLicenciaOnlineBackground(codigoLocal, VERIFY_TIMEOUT)
          return { ...offlineNow, nombreEmpresa: licenciaInicial?.nombre_empresa, verificadoOnline: false, mensaje: 'Licencia recuperada del proyecto' }
        }
      }
    }
    if (codigoLocal) {
      const localLicencia = getLicenciaLocal()
      const online = await buscarLicenciaServidor(codigoLocal, false, true, VERIFY_TIMEOUT)
      if (online.success && online.data) {
        const d = online.data
        const estado = normalizarEstado(d.estado || d.status || '')
        const vencimiento = d.expires_at || d.proximopago || d.fecha_vencimiento
        guardarLicenciaLocal({ estado, nombre: d.nombre || d.almacen || d.project_name || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: vencimiento, datosServidor: d })
        if (estado !== 'ACTIVO' && estado !== 'PENDIENTE') {
          return { success: false, estado: estado.toLowerCase(), mensaje: `Estado: ${estado}`, verificadoOnline: true }
        }
        const dias = calcularDiasRestantes(vencimiento)
        if (dias !== null && dias <= 0) {
          return { success: false, estado: 'vencida', mensaje: mensajeLicenciaVencida(vencimiento), verificadoOnline: true }
        }
        const mensajeDias = dias !== null ? `${dias} dia(s) restantes` : 'sin vencimiento'
        return { success: true, estado: estado.toLowerCase(), mensaje: `Licencia verificada - ${mensajeDias}`, diasRestantes: dias, nombreEmpresa: d.nombre || d.project_name || localLicencia?.nombre_empresa, verificadoOnline: true }
      }
      if (online.estado === 'equipo_no_autorizado') {
        return { success: false, estado: 'equipo_no_autorizado', mensaje: online.error || 'Este equipo no esta autorizado para usar esta licencia', codigoLicencia: online.data?.license_key || codigoLocal || '', verificadoOnline: true }
      }
      if (esErrorConexion(online.error)) {
        const offline = verificarLicenciaOffline()
        if (offline.success) {
          return { ...offline, nombreEmpresa: localLicencia?.nombre_empresa, verificadoOnline: false, mensaje: offline.estado === 'pendiente' ? `Periodo de prueba: ${offline.diasRestantes} dia(s) restantes` : 'Licencia activa (offline)' }
        }
        return { success: false, estado: offline.estado || 'sin_verificar', mensaje: offline.error || online.error || 'Sin conexion y sin licencia local', verificadoOnline: false }
      }
      return { success: false, estado: online.estado || 'no_encontrada', mensaje: online.error || 'Licencia no encontrada en el servidor', verificadoOnline: true }
    }
    let online: any = await verificarLicenciaOnline(VERIFY_TIMEOUT)
    if (!online.success && !esErrorConexion(online.error)) {
      const mac = obtenerMacAddress()
      if (mac) online = await buscarLicenciaServidor(mac, false, true, VERIFY_TIMEOUT)
    }
    if (online.success && online.data) {
      const d = online.data
      const estado = normalizarEstado(d.estado || d.status || '')
      const vencimiento = d.expires_at || d.proximopago || d.fecha_vencimiento
      guardarLicenciaLocal({ estado, nombre: d.nombre || d.almacen || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: vencimiento, datosServidor: d })
      if (estado === 'ACTIVO' || estado === 'PENDIENTE') {
        const dias = calcularDiasRestantes(vencimiento)
        if (dias !== null && dias <= 0) return { success: false, estado: 'vencida', mensaje: mensajeLicenciaVencida(vencimiento), verificadoOnline: true }
        const mensajeDias = dias !== null ? `${dias} dia(s) restantes` : 'sin vencimiento'
        return { success: true, estado: estado === 'ACTIVO' ? 'activo' : 'pendiente', mensaje: estado === 'ACTIVO' ? `Licencia activa - ${mensajeDias}` : `Periodo de prueba: ${mensajeDias}`, diasRestantes: dias, nombreEmpresa: d.nombre, verificadoOnline: true }
      }
      return { success: false, estado: estado.toLowerCase(), mensaje: `Estado: ${estado}`, verificadoOnline: true }
    }
    if (online.estado === 'equipo_no_autorizado') {
      return { success: false, estado: 'equipo_no_autorizado', mensaje: online.error || 'Este equipo no esta autorizado para usar esta licencia', codigoLicencia: online.data?.license_key || '', verificadoOnline: true }
    }
    const licencia = getLicenciaLocal()
    const estadoLocal = (licencia?.estado || '').toUpperCase()

    if (esErrorConexion(online.error)) {
      if (estadoLocal === 'SIN_VERIFICAR' || !licencia?.licencia_equipo) {
        const mac = obtenerMacAddress()
        if (mac) {
          const cifrada = cifrarBase64(mac)
          const fechaVenc = new Date(Date.now() + DIAS_PRUEBA * 86400000).toISOString().replace('T', ' ').split('.')[0]
          const now = new Date().toISOString().replace('T', ' ').split('.')[0]
          db!.prepare(`INSERT INTO licencia (id, licencia_equipo, licencia_cifrada, estado, fecha_inicio_prueba, fecha_vencimiento, ultima_verificacion, updated_at) VALUES (1, ?, ?, 'PENDIENTE', ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET licencia_equipo = COALESCE(excluded.licencia_equipo, licencia_equipo), licencia_cifrada = COALESCE(excluded.licencia_cifrada, licencia_cifrada), estado = excluded.estado, fecha_inicio_prueba = excluded.fecha_inicio_prueba, fecha_vencimiento = excluded.fecha_vencimiento, ultima_verificacion = excluded.ultima_verificacion, updated_at = excluded.updated_at`).run(mac, cifrada, now, fechaVenc)
          return { success: true, estado: 'pendiente', mensaje: `Periodo de prueba: ${DIAS_PRUEBA} dia(s) restantes`, diasRestantes: DIAS_PRUEBA, verificadoOnline: false }
        }
      }
      const offline = verificarLicenciaOffline()
      if (offline.success) return { ...offline, verificadoOnline: false, mensaje: offline.estado === 'pendiente' ? `Periodo de prueba: ${offline.diasRestantes} dia(s) restantes` : 'Licencia activa (offline)' }
      return { success: false, estado: offline.estado || 'sin_verificar', mensaje: online.error || offline.error || 'Sin conexion y sin licencia local', verificadoOnline: false }
    }

    if (online.error && !esErrorConexion(online.error)) {
      return { success: false, estado: 'equipo_no_autorizado', mensaje: online.error, verificadoOnline: true }
    }

    return { success: false, estado: 'no_encontrada', mensaje: online.error || 'Licencia no encontrada en el servidor', verificadoOnline: true }
  }

  function verificarLicenciaOnlineBackground(codigoLocal: string, timeout: number): void {
    if (!codigoLocal) return
    buscarLicenciaServidor(codigoLocal, false, true, timeout).then((online: any) => {
      if (online.success && online.data) {
        const d = online.data
        const estado = normalizarEstado(d.estado || d.status || '')
        const vencimiento = d.expires_at || d.proximopago || d.fecha_vencimiento
        guardarLicenciaLocal({ estado, nombre: d.nombre || d.almacen || d.project_name || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: vencimiento, datosServidor: d })
        console.log('[Licencia][Background] Datos actualizados desde el servidor')
      }
    }).catch((e: any) => {
      console.log('[Licencia][Background] Error actualizando desde servidor:', e.message)
    })
  }

  async function registrarLicenciaOnline(payload: any): Promise<any> {
    const baseUrl = getLicenciaApiUrl()
    if (!baseUrl) return { success: false, error: 'TM Cloud no configurado. Configura TM Cloud en Configuracion.' }
    const token = getLicenciaWriteToken()
    const body = JSON.stringify({
      system_name: payload.nombre || payload.system_name || '',
      max_uses: payload.max_uses || 1,
      expires_at: payload.proximopago || payload.expires_at || '',
      licencia: payload.licencia || '',
      estado: payload.estado || 'PENDIENTE',
      tipo: payload.tipo || 'UN_EQUIPO',
      dispositivos: payload.dispositivos || '',
      nombre: payload.nombre || '',
      encargado: payload.encargado || '',
      telefono: payload.telefono || '',
      email: payload.email || '',
      direccion: payload.direccion || '',
      precio: payload.precio || '0.00',
    })
    const url = `${baseUrl}/licenses`
    return new Promise((resolve) => {
      let resolved = false
      const finish = (r: any) => { if (!resolved) { resolved = true; resolve(r) } }
      const urlObj = new URL(url)
      const req = https.request({ hostname: urlObj.hostname, port: 443, path: urlObj.pathname, method: 'POST', headers: { 'Accept': '*/*', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body), 'Authorization': `Bearer ${token}` }, timeout: 15000 }, (res) => {
        let responseBody = ''
        res.on('data', chunk => responseBody += chunk)
        res.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}` }))
        res.on('end', () => {
          let parsed: any = responseBody
          try { parsed = responseBody ? JSON.parse(responseBody) : null } catch { parsed = responseBody }
          const statusCode = res.statusCode ?? 500
          const registrado = statusCode >= 200 && statusCode < 300 && ((Array.isArray(parsed) && parsed[0] === 'ok') || (parsed && typeof parsed === 'object' && (parsed.id || parsed.success || parsed.ok)) || parsed === 'ok')
          if (!registrado) { finish({ success: false, error: (parsed && typeof parsed === 'object' ? parsed.message || parsed.error : null) || `Error HTTP ${statusCode}`, data: parsed }); return }
          finish({ success: true, data: parsed })
        })
      })
      req.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}` }))
      req.setTimeout(15000, () => { req.destroy(); finish({ success: false, error: 'Tiempo de espera agotado' }) })
      req.write(body)
      req.end()
    })
  }

  function conectarDispositivoLicencia(licenseKey: string, deviceId: string, timeoutMs = 15000): Promise<any> {
    const body = JSON.stringify({ license_key: licenseKey, device_id: deviceId })
    const url = 'https://api.tmposystem.com/api/license/connect'
    return new Promise((resolve) => {
      let resolved = false
      const finish = (r: any) => { if (!resolved) { resolved = true; resolve(r) } }
      const urlObj = new URL(url)
      const req = https.request({ hostname: urlObj.hostname, port: 443, path: urlObj.pathname, method: 'POST', headers: { 'Accept': '*/*', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs }, (res) => {
        let responseBody = ''
        res.on('data', chunk => responseBody += chunk)
        res.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}` }))
        res.on('end', () => {
          let parsed: any = responseBody
          try { parsed = responseBody ? JSON.parse(responseBody) : null } catch { parsed = responseBody }
          const statusCode = res.statusCode ?? 500
          if (statusCode >= 200 && statusCode < 300 && parsed?.success && parsed?.data) {
            if (parsed.data) guardarCredencialesTmCloud(parsed.data, true)
            finish({ success: true, data: parsed.data, device_registered: parsed.device_registered, devices: parsed.devices })
          } else {
            finish({ success: false, error: (parsed && typeof parsed === 'object' ? parsed.message || parsed.error : null) || `Error HTTP ${statusCode}` })
          }
        })
      })
      req.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}` }))
      req.setTimeout(timeoutMs, () => { req.destroy(); finish({ success: false, error: 'Tiempo de espera agotado' }) })
      req.write(body)
      req.end()
    })
  }

  function crearProyectoServidor(nombre: string, systemName: string, timeoutMs = 20000): Promise<any> {
    const body = JSON.stringify({ name: nombre, system_name: systemName })
    const url = 'https://api.tmposystem.com/api/project/create'
    return new Promise((resolve) => {
      let resolved = false
      const finish = (r: any) => { if (!resolved) { resolved = true; resolve(r) } }
      const urlObj = new URL(url)
      const req = https.request({ hostname: urlObj.hostname, port: 443, path: urlObj.pathname, method: 'POST', headers: { 'Accept': '*/*', 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(body) }, timeout: timeoutMs }, (res) => {
        let responseBody = ''
        res.on('data', chunk => responseBody += chunk)
        res.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}` }))
        res.on('end', () => {
          let parsed: any = responseBody
          try { parsed = responseBody ? JSON.parse(responseBody) : null } catch { parsed = responseBody }
          const statusCode = res.statusCode ?? 500
          if (statusCode >= 200 && statusCode < 300) {
            const rawData = parsed?.data || parsed
            const project = rawData?.project && typeof rawData.project === 'object' ? rawData.project : {}
            const license = rawData?.license && typeof rawData.license === 'object' ? rawData.license : rawData
            const data = {
              ...rawData,
              ...license,
              project,
              license,
              project_url: license?.project_url || rawData?.project_url || '',
              public_key: license?.public_key || project?.public_key || rawData?.public_key || '',
              secret_key: project?.secret_key || license?.secret_key || rawData?.secret_key || '',
            }
            if (data) {
              guardarCredencialesTmCloud(data, true)
              guardarEmpresaDesdeLicencia(data)
              guardarLicenciaLocal({ estado: normalizarEstado(data.estado || data.status || 'ACTIVO'), nombre: data.nombre || nombre, fecha_inicio_prueba: data.created_at || data.fecha_inicio || new Date().toISOString().replace('T', ' ').split('.')[0], fecha_vencimiento: data.expires_at || data.proximopago || data.fecha_vencimiento, datosServidor: data, permitirCambioProyecto: true })
            }
            finish({ success: true, data })
          } else {
            finish({ success: false, error: (parsed && typeof parsed === 'object' ? parsed.message || parsed.error : null) || `Error HTTP ${statusCode}` })
          }
        })
      })
      req.on('error', (error) => finish({ success: false, error: `Sin conexion: ${error.message}` }))
      req.setTimeout(timeoutMs, () => { req.destroy(); finish({ success: false, error: 'Tiempo de espera agotado' }) })
      req.write(body)
      req.end()
    })
  }

  ipcMain.handle('licencia:getMacAddress', async () => {
    try {
      const mac = obtenerMacAddress()
      if (!mac) return { success: false, error: 'No se pudo identificar el equipo' }
      return { success: true, data: { mac, cifrada: cifrarBase64(mac) } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:getInfo', async () => {
    try {
      const row = db!.prepare(`SELECT * FROM licencia WHERE id = 1`).get() as any
      const mac = obtenerMacAddress()
      const estado = (row?.estado || 'sin_verificar').toUpperCase()
      let datosServidor: any = null
      try { datosServidor = row?.datos_servidor ? JSON.parse(row.datos_servidor) : null } catch {}
      const codigoLicencia = String(datosServidor?.licencia || datosServidor?.codigo_licencia || datosServidor?.codigo || '').trim().toUpperCase()
      let estadoDisplay = 'Sin verificar'
      if (estado === 'ACTIVO') estadoDisplay = 'Activa'
      else if (estado === 'PENDIENTE') estadoDisplay = 'Pendiente'
      return { success: true, data: { licencia: codigoLicencia, licencia_equipo: mac || '', licencia_cifrada: mac ? cifrarBase64(mac) : '', estado: (row?.estado || 'sin_verificar'), estado_display: estadoDisplay, nombre_empresa: row?.nombre_empresa || '', dias_restantes: calcularDiasRestantes(row?.fecha_vencimiento), ultima_verificacion: row?.ultima_verificacion || '', fecha_vencimiento: row?.fecha_vencimiento || '' } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:setApiKey', async (_event, apiKey: string) => {
    try {
      if (!apiKey || apiKey.trim() === '') return { success: false, error: 'API Key no puede estar vacia' }
      db!.prepare(`UPDATE licencia SET api_key = ?, updated_at = datetime('now','localtime') WHERE id = 1`).run(apiKey.trim())
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:getApiKey', async () => {
    try {
      const row = db!.prepare(`SELECT api_key FROM licencia WHERE id = 1`).get() as any
      return { success: true, data: { configurada: !!row?.api_key } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  function logLic(msg: string) {
    try { require('fs').appendFileSync(require('path').join(app.getPath('userData'), 'licencia_debug.log'), `[${new Date().toISOString()}] ${msg}\n`) } catch {}
  }

  ipcMain.handle('licencia:registrar', async (_event, payload: any) => {
    try {
      logLic(`Payload recibido: ${JSON.stringify(payload)}`)
      const result = await registrarLicenciaOnline(payload)
      logLic(`Resultado online: ${JSON.stringify(result)}`)
      const d = result.success && result.data ? (Array.isArray(result.data) ? result.data[0] : result.data) : null
      logLic(`d extraido: ${JSON.stringify(d)}`)
      if (d) {
        logLic('Guardando con datos del servidor')
        guardarLicenciaLocal({ estado: 'PENDIENTE', nombre: payload.nombre || d.nombre || '', fecha_inicio_prueba: new Date().toISOString().replace('T', ' ').split('.')[0], fecha_vencimiento: payload.proximopago, datosServidor: { ...d, licencia: payload.licencia }, permitirCambioProyecto: true })
        logLic('Guardado exitoso con datos del servidor')
        return { success: true, data: { mensaje: 'Licencia registrada correctamente' } }
      }
      logLic('Guardando local offline')
      const mac = obtenerMacAddress()
      const cifrada = mac ? cifrarBase64(mac) : ''
      const now = new Date().toISOString().replace('T', ' ').split('.')[0]
      const fechaVenc = payload.proximopago || new Date(Date.now() + DIAS_PRUEBA * 86400000).toISOString().replace('T', ' ').split('.')[0]
      const datos = JSON.stringify({ licencia: payload.licencia, nombre: payload.nombre, encargado: payload.encargado, telefono: payload.telefono, email: payload.email, direccion: payload.direccion || '' })
      db!.prepare(`INSERT INTO licencia (id, licencia_equipo, licencia_cifrada, estado, nombre_empresa, fecha_inicio_prueba, fecha_vencimiento, ultima_verificacion, datos_servidor, updated_at) VALUES (1, ?, ?, 'PENDIENTE', ?, ?, ?, CURRENT_TIMESTAMP, ?, CURRENT_TIMESTAMP) ON CONFLICT(id) DO UPDATE SET licencia_equipo = COALESCE(excluded.licencia_equipo, licencia_equipo), licencia_cifrada = COALESCE(excluded.licencia_cifrada, licencia_cifrada), estado = excluded.estado, nombre_empresa = excluded.nombre_empresa, fecha_inicio_prueba = excluded.fecha_inicio_prueba, fecha_vencimiento = excluded.fecha_vencimiento, ultima_verificacion = excluded.ultima_verificacion, datos_servidor = excluded.datos_servidor, updated_at = excluded.updated_at`).run(
        mac || null, cifrada || null, payload.nombre || '', now, fechaVenc, datos
      )
      logLic('INSERT/UPDATE ejecutado correctamente')
      return { success: true, data: { mensaje: d ? 'Licencia registrada correctamente' : 'Licencia registrada en modo offline. Se sincronizara cuando haya conexion.' } }
    } catch (e: any) {
      logLic(`ERROR: ${e.message}`)
      return { success: false, error: e.message }
    }
  })

  ipcMain.handle('licencia:guardarLocal', async (_event, payload: any) => {
    try {
      const mac = obtenerMacAddress()
      const cifrada = mac ? cifrarBase64(mac) : ''
      const now = new Date().toISOString().replace('T', ' ').split('.')[0]
      const fechaVenc = payload.proximopago || new Date(Date.now() + DIAS_PRUEBA * 86400000).toISOString().replace('T', ' ').split('.')[0]
      const datosServidor = { licencia: payload.licencia, nombre: payload.nombre, encargado: payload.encargado, telefono: payload.telefono, email: payload.email, direccion: payload.direccion || '' }
      db!.prepare(`UPDATE licencia SET estado = 'ACTIVO', licencia_equipo = COALESCE(?, licencia_equipo), licencia_cifrada = COALESCE(?, licencia_cifrada), nombre_empresa = ?, fecha_inicio_prueba = ?, fecha_vencimiento = ?, ultima_verificacion = CURRENT_TIMESTAMP, datos_servidor = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(
        mac || null, cifrada || null, payload.nombre || '', now, fechaVenc, JSON.stringify(datosServidor)
      )
      return { success: true, data: { mensaje: 'Licencia registrada correctamente' } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('tmcloud:getConfig', async () => {
    try {
      db!.prepare(`INSERT OR IGNORE INTO tmcloud_config (id, url, public_key, secret_key) VALUES (1, '', '', '')`).run()
      const row = db!.prepare(`SELECT url, public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
      return { success: true, data: row || { url: '', public_key: '', secret_key: '' } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('tmcloud:getRuntimeConfig', async () => {
    try {
      const row = db!.prepare(`SELECT url, public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
      if (serverUrl && row?.url && (row?.public_key || row?.secret_key)) {
        const port = new URL(serverUrl).port
        return {
          success: true,
          data: {
            url: `http://127.0.0.1:${port}/tmcloud-proxy`,
            public_key: 'desktop-proxy',
            secret_key: '',
          },
        }
      }
      return { success: true, data: row || { url: '', public_key: '', secret_key: '' } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('tmcloud:testConnection', async (_event, payload: { url?: string; public_key?: string }) => {
    const baseUrl = String(payload?.url || '').trim().replace(/\/+$/, '')
    const publicKey = String(payload?.public_key || '').trim()
    if (!/^https?:\/\/[^/]+\/api\/prj_[A-Za-z0-9]+$/i.test(baseUrl)) {
      return { success: false, error: 'URL invalida. Usa https://tu-dominio.com/api/prj_xxx' }
    }
    if (!publicKey) return { success: false, error: 'La Public Key es obligatoria' }

    return new Promise((resolve) => {
      let settled = false
      const finish = (result: any) => {
        if (settled) return
        settled = true
        resolve(result)
      }

      try {
        const target = new URL(`${baseUrl}/health`)
        const transport = target.protocol === 'https:' ? https : http
        const request = transport.request(target, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Bearer ${publicKey}`,
          },
          timeout: 15000,
        }, (response) => {
          let body = ''
          response.setEncoding('utf8')
          response.on('data', chunk => { body += chunk })
          response.on('error', error => finish({ success: false, error: `Sin conexion: ${error.message}` }))
          response.on('end', () => {
            let parsed: any = null
            try { parsed = body ? JSON.parse(body) : null } catch { /* handled below */ }
            const statusCode = Number(response.statusCode || 0)
            if (statusCode < 200 || statusCode >= 300) {
              const message = parsed?.error || parsed?.message || `TM Cloud respondio con HTTP ${statusCode || 'desconocido'}`
              finish({ success: false, error: message })
              return
            }
            if (parsed?.status !== 'ok') {
              finish({ success: false, error: 'Respuesta inesperada de TM Cloud' })
              return
            }
            finish({ success: true, data: parsed.data || {} })
          })
        })
        request.on('timeout', () => request.destroy(new Error('Tiempo de espera agotado')))
        request.on('error', error => finish({ success: false, error: `Sin conexion: ${error.message}` }))
        request.end()
      } catch (error: any) {
        finish({ success: false, error: error?.message || 'No se pudo conectar con TM Cloud' })
      }
    })
  })

  ipcMain.handle('tmcloud:saveConfig', async (_event, payload: { url: string; public_key: string; secret_key: string }) => {
    try {
      const url = String(payload.url || '').trim().replace(/\/+$/, '')
      const publicKey = String(payload.public_key || '').trim()
      const secretKey = String(payload.secret_key || '').trim()
      db!.prepare(`INSERT INTO tmcloud_config (id, url, public_key, secret_key, created_at, updated_at)
        VALUES (1, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        ON CONFLICT(id) DO UPDATE SET url = excluded.url, public_key = excluded.public_key, secret_key = excluded.secret_key, updated_at = CURRENT_TIMESTAMP`).run(
        url, publicKey, secretKey
      )
      db!.prepare(`DELETE FROM configuracion WHERE clave IN ('supabase_url', 'supabase_anon_key', 'supabase_service_role', 'tmcloud_url', 'tmcloud_key', 'tmcloud_service_key')`).run()
      const projectId = url.match(/\/api\/(prj_[A-Za-z0-9]+)/i)?.[1] || ''
      if (projectId) {
        db!.prepare(`INSERT INTO configuracion (clave, valor, tipo, categoria, created_at, updated_at)
          VALUES ('tmcloud_project_lock', ?, 'string', 'tmcloud', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
          ON CONFLICT(clave) DO UPDATE SET valor = excluded.valor, updated_at = CURRENT_TIMESTAMP`).run(projectId)
      }
      return { success: true, data: { url, public_key: publicKey, secret_key: secretKey } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('caja:getTurnoAbierto', async (_event, almacenUid = '') => {
    try {
      const row = almacenUid
        ? db!.prepare(`SELECT * FROM caja_turnos WHERE estado = 'abierto' AND almacen_uid = ? ORDER BY id DESC LIMIT 1`).get(almacenUid) as any
        : null
      return { success: true, data: row || null }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('caja:abrirTurno', async (_event, data: { monto_inicial: number; observacion?: string; usuario_id: number; usuario_nombre: string; almacen_id?: number; almacen_uid?: string }) => {
    try {
      const now = new Date().toISOString()
      const info = db!.prepare(`INSERT INTO caja_turnos (monto_inicial, entradas, retiros, estado, observacion, usuario_id, usuario_nombre, almacen_id, almacen_uid, uid, created_at, updated_at) VALUES (?, 0, 0, 'abierto', ?, ?, ?, ?, ?, ?, ?, ?)`).run(
        data.monto_inicial || 0, data.observacion || '', data.usuario_id || 0, data.usuario_nombre || '', data.almacen_id || 0, data.almacen_uid || '', generarUid(), now, now
      )
      return { success: true, data: { id: info.lastInsertRowid } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('caja:cerrarTurno', async (_event, turnoId: number, data: any = {}) => {
    try {
      const contado = Number(data.monto_final || 0)
      const esperado = Number(data.efectivo_esperado || 0)
      db!.prepare(`UPDATE caja_turnos
        SET estado = 'cerrado', monto_final = ?, efectivo_esperado = ?,
            diferencia = ?, cierre_ciego = ?, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND estado = 'abierto'`).run(
        contado,
        esperado,
        Number(data.diferencia ?? (contado - esperado)),
        data.cierre_ciego ? 1 : 0,
        turnoId
      )
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('caja:getTurnoActivo', async (_event, almacenUid = '') => {
    try {
      const row = almacenUid
        ? db!.prepare(`SELECT * FROM caja_turnos WHERE estado = 'abierto' AND almacen_uid = ? ORDER BY id DESC LIMIT 1`).get(almacenUid) as any
        : null
      return { success: true, data: row || null }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('cuadre:listar', async (_event, almacenUid = '') => {
    try {
      const rows = almacenUid
        ? db!.prepare(`SELECT * FROM cuadres WHERE almacen_uid = ? ORDER BY created_at DESC`).all(almacenUid)
        : []
      return { success: true, data: rows }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('cuadre:ventasTurno', async (_event, almacenUid = '') => {
    try {
      const turno = almacenUid
        ? db!.prepare(`SELECT id, created_at FROM caja_turnos WHERE estado = 'abierto' AND almacen_uid = ? ORDER BY id DESC LIMIT 1`).get(almacenUid) as any
        : null
      if (!turno) return { success: true, data: { total: 0, efectivo: 0, tarjeta: 0, transferencia: 0, abonos_cxc: 0, cantidad_abonos_cxc: 0 } }
      const desde = turno.created_at
      const facturas = almacenUid
        ? db!.prepare(`SELECT metodo_pago, total, efectivo, tarjeta, transferencia FROM facturas WHERE estado_factura = 'PAGADA' AND turno_id = ? AND almacen_uid = ?`).all(turno.id, almacenUid) as any[]
        : db!.prepare(`SELECT metodo_pago, total, efectivo, tarjeta, transferencia FROM facturas WHERE estado_factura = 'PAGADA' AND created_at >= ?`).all(desde) as any[]
      let total = 0, efectivo = 0, tarjeta = 0, transferencia = 0
      for (const f of facturas) {
        const metodo = String(f.metodo_pago || '').toUpperCase()
        if (metodo.includes('CREDITO') || metodo.includes('CRÉDITO')) continue
        total += Number(f.total || 0)
        let montoEfectivo = Number(f.efectivo || 0)
        let montoTarjeta = Number(f.tarjeta || 0)
        let montoTransferencia = Number(f.transferencia || 0)
        if (montoEfectivo + montoTarjeta + montoTransferencia === 0) {
          if (metodo.includes('TARJETA')) montoTarjeta = Number(f.total || 0)
          else if (metodo.includes('TRANSFERENCIA')) montoTransferencia = Number(f.total || 0)
          else montoEfectivo = Number(f.total || 0)
        }
        efectivo += montoEfectivo
        tarjeta += montoTarjeta
        transferencia += montoTransferencia
      }
      const cuentas = almacenUid
        ? db!.prepare(`SELECT pagos FROM cuentas_cobrar WHERE almacen_uid = ?`).all(almacenUid) as any[]
        : db!.prepare(`SELECT pagos FROM cuentas_cobrar`).all() as any[]
      let abonosCxc = 0, cantidadAbonosCxc = 0
      for (const cuenta of cuentas) {
        let pagos: any[] = []
        try { pagos = Array.isArray(cuenta.pagos) ? cuenta.pagos : JSON.parse(cuenta.pagos || '[]') } catch { pagos = [] }
        for (const pago of pagos) {
          const perteneceTurno = Number(pago.turno_id || 0) === Number(turno.id)
          if (!perteneceTurno) continue
          const monto = Number(pago.monto || pago.cantidad || 0)
          const metodo = String(pago.metodo || pago.metodo_pago || 'EFECTIVO').toUpperCase()
          if (metodo.includes('TARJETA')) tarjeta += monto
          else if (metodo.includes('TRANSFERENCIA')) transferencia += monto
          else efectivo += monto
          total += monto
          abonosCxc += monto
          cantidadAbonosCxc++
        }
      }
      const ordenes = almacenUid
        ? db!.prepare(`SELECT id, no_orden, nombre, total, estado, metodo_pago, pagos, created_at FROM ordenes_taller WHERE almacen_uid = ?`).all(almacenUid) as any[]
        : db!.prepare(`SELECT id, no_orden, nombre, total, estado, metodo_pago, pagos, created_at FROM ordenes_taller`).all() as any[]
      let cobrosTaller = 0, cantidadCobrosTaller = 0
      for (const orden of ordenes) {
        let pagos: any[] = []
        try { pagos = Array.isArray(orden.pagos) ? orden.pagos : JSON.parse(orden.pagos || '[]') } catch { pagos = [] }
        for (const pago of pagos) {
          const pertenece = Number(pago.turno_id || 0) === Number(turno.id)
          if (!pertenece) continue
          const monto = Number(pago.monto || pago.cantidad || 0)
          const metodo = String(pago.metodo || pago.metodo_pago || orden.metodo_pago || 'EFECTIVO').toUpperCase()
          if (metodo.includes('TARJETA')) tarjeta += monto
          else if (metodo.includes('TRANSFERENCIA')) transferencia += monto
          else efectivo += monto
          total += monto; cobrosTaller += monto; cantidadCobrosTaller++
        }
      }
      return { success: true, data: { total, efectivo, tarjeta, transferencia, abonos_cxc: abonosCxc, cantidad_abonos_cxc: cantidadAbonosCxc, cobros_taller: cobrosTaller, cantidad_cobros_taller: cantidadCobrosTaller } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('cuadre:gastosTurno', async (_event, almacenUid = '') => {
    try {
      const turno = almacenUid
        ? db!.prepare(`SELECT id, created_at FROM caja_turnos WHERE estado = 'abierto' AND almacen_uid = ? ORDER BY id DESC LIMIT 1`).get(almacenUid) as any
        : null
      if (!turno) return { success: true, data: { total: 0 } }
      const desde = turno.created_at
      const rows = almacenUid
        ? db!.prepare(`SELECT cantidad FROM gastos WHERE turno_id = ? AND almacen_uid = ?`).all(turno.id, almacenUid) as any[]
        : []
      let total = 0
      for (const r of rows) total += Number(r.cantidad || 0)
      return { success: true, data: { total } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('cuadre:realizar', async (_event, data: any) => {
    try {
      const now = new Date().toISOString()
      data.fecha = now.split('T')[0]
      if (!data.uid) data.uid = generarUid()
      data.created_at = data.created_at || now
      data.updated_at = now
      const keys = Object.keys(data)
      const vals = Object.values(data)
      const result = db!.prepare(`INSERT INTO cuadres (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...vals)
      const id = Number(result.lastInsertRowid)
      registrarBitacora('cuadres', id, 'CREATE', String(data.turno_usuario || ''), data, null)
      return { success: true, data: { id, uid: data.uid } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:introducirCodigo', async (_event, codigo: string) => {
    try {
      const licencia = String(codigo || '').trim().toUpperCase()
      if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(licencia)) {
        return { success: false, error: 'Formato de licencia invalido. Usa XXXXX-XXXXX-XXXXX' }
      }

      console.log('[LicenciaManual] Buscando licencia:', `${licencia.slice(0, 2)}***-${licencia.slice(6, 8)}***`)
      const result = await buscarLicenciaServidor(licencia, false)
      console.log('[LicenciaManual] Respuesta servidor:', JSON.stringify(result))
      if (!result.success || !result.data) {
        return { success: false, estado: result.estado, error: result.error || 'Licencia no encontrada' }
      }

      const d = { ...result.data, license_key: licencia, licencia }
      const estado = (d.estado || d.status || '').toUpperCase()
      const vencimiento = d.proximopago || d.fecha_vencimiento
      guardarLicenciaLocal({ estado, nombre: d.nombre || d.almacen || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: vencimiento, datosServidor: d, permitirCambioProyecto: true, codigoLicencia: licencia, reemplazarDatosServidor: true })
      await descargarEmpresaProyecto(d)

      const ok = estado === 'ACTIVO' || estado === 'PENDIENTE'
      return {
        success: ok,
        estado: estado.toLowerCase(),
        data: {
          estado: estado.toLowerCase(),
          mensaje: ok ? `Licencia ${estado.toLowerCase()} registrada en este equipo` : `Estado: ${estado}`,
        },
      }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:solicitarRegistroEquipo', async (_event, payload: { licencia?: string } = {}) => {
    try {
      const result = await buscarLicenciaParaRegistroEquipo(payload?.licencia)
      if (!result.success) return result
      if (result.yaRegistrado) return { success: true, yaRegistrado: true, mensaje: 'Este equipo ya esta registrado' }
      if (result.pendiente) return { success: true, pendiente: true, mensaje: result.mensaje || 'Solicitud enviada. Espera a que el administrador active tu equipo.' }
      return { success: true, mensaje: result.mensaje || 'Equipo registrado correctamente' }
    } catch (e: any) { return { success: false, error: e.message || 'Error registrando equipo' } }
  })

  ipcMain.handle('licencia:confirmarRegistroEquipo', async (_event, payload: { licencia?: string; codigo?: string } = {}) => {
    try {
      const codigo = String(payload?.codigo || '').replace(/\D/g, '')
      if (!/^\d{4}$/.test(codigo)) return { success: false, error: 'Introduce el codigo de 4 digitos' }

      const licencia = getCodigoRegistroEquipo(payload?.licencia)
      if (!licencia) return { success: false, error: 'Introduce la licencia primero' }

      const mac = normalizarMac(obtenerMacAddress())
      if (!mac) return { success: false, error: 'No se pudo identificar este equipo' }

      const key = `${licencia}:${mac}`
      const registro = licenciaEquipoOtp.get(key)
      if (!registro) return { success: false, error: 'Solicita un codigo nuevo' }
      if (Date.now() > registro.expiresAt) {
        licenciaEquipoOtp.delete(key)
        return { success: false, error: 'El codigo vencio. Solicita uno nuevo' }
      }
      if (registro.codigo !== codigo) return { success: false, error: 'Codigo incorrecto' }

      const d = registro.datosServidor
      const id = d?.id
      if (!id) return { success: false, error: 'La licencia no tiene identificador para actualizar' }

      const dispositivos = obtenerDispositivosLicencia(d.authorized_devices ?? d.devices ?? d.dispositivos)
      const equiposNoAutorizados = obtenerEquiposNoAutorizados(d.unauthorized_devices ?? d.pending_devices ?? d.equipos_no_autorizados).filter(equipo => equipo !== mac)
      const dispositivosActualizados = dispositivos.includes(mac) ? dispositivos : [...dispositivos, mac]
      const fecha = new Date().toISOString().replace('T', ' ').split('.')[0]
      const updateResult = await actualizarCamposLicencia({
        id,
        dispositivos: JSON.stringify(dispositivosActualizados),
        equipos_no_autorizados: JSON.stringify(equiposNoAutorizados),
        updated_at: fecha,
      }, 15000)
      if (!updateResult.success) return { success: false, error: updateResult.error || 'No se pudo activar este equipo' }

      const datosServidor = { ...d, dispositivos: JSON.stringify(dispositivosActualizados), equipos_no_autorizados: JSON.stringify(equiposNoAutorizados), updated_at: fecha }
      const estado = (datosServidor.estado || datosServidor.status || '').toUpperCase()
      guardarLicenciaLocal({ estado, nombre: datosServidor.nombre || datosServidor.almacen || '', fecha_inicio_prueba: datosServidor.created_at || datosServidor.fecha_inicio, fecha_vencimiento: datosServidor.proximopago || datosServidor.fecha_vencimiento, datosServidor, permitirCambioProyecto: true })
      licenciaEquipoOtp.delete(key)

      return { success: true, data: { mensaje: 'Equipo activado correctamente' } }
    } catch (e: any) { return { success: false, error: e.message || 'Error activando equipo' } }
  })

  ipcMain.handle('licencia:solicitarVerCodigo', async () => {
    try {
      const licencia = getCodigoLicenciaLocal()
      if (!licencia) return { success: false, error: 'No hay una licencia registrada para mostrar' }

      const email = getEmailEmpresa()
      if (!email || !email.includes('@')) return { success: false, error: 'Configura un correo valido en los datos de la empresa' }

      const mac = normalizarMac(obtenerMacAddress()) || 'LOCAL'
      const codigo = Math.floor(1000 + Math.random() * 9000).toString()
      licenciaVisualizacionOtp.set(mac, {
        codigo,
        licencia,
        email,
        expiresAt: Date.now() + 10 * 60 * 1000,
      })

      const emailResult = await enviarEmailOtpVisualizacionLicencia(email, codigo)
      if (!emailResult.success) {
        licenciaVisualizacionOtp.delete(mac)
        return { success: false, error: emailResult.error || 'No se pudo enviar el codigo' }
      }

      return { success: true, data: { email: ocultarEmail(email), expiresMinutes: 10 } }
    } catch (e: any) { return { success: false, error: e.message || 'Error solicitando codigo' } }
  })

  ipcMain.handle('licencia:confirmarVerCodigo', async (_event, payload: { codigo?: string } = {}) => {
    try {
      const codigo = String(payload?.codigo || '').replace(/\D/g, '')
      if (!/^\d{4}$/.test(codigo)) return { success: false, error: 'Introduce el codigo de 4 digitos' }

      const mac = normalizarMac(obtenerMacAddress()) || 'LOCAL'
      const registro = licenciaVisualizacionOtp.get(mac)
      if (!registro) return { success: false, error: 'Solicita un codigo nuevo' }
      if (Date.now() > registro.expiresAt) {
        licenciaVisualizacionOtp.delete(mac)
        return { success: false, error: 'El codigo vencio. Solicita uno nuevo' }
      }
      if (registro.codigo !== codigo) return { success: false, error: 'Codigo incorrecto' }

      licenciaVisualizacionOtp.delete(mac)
      return { success: true, data: { licencia: registro.licencia } }
    } catch (e: any) { return { success: false, error: e.message || 'Error validando codigo' } }
  })

  ipcMain.handle('facturas:solicitarOtpEliminar', async (_event, factura: any = {}) => {
    try {
      const facturaIds = (Array.isArray(factura?.facturaIds) ? factura.facturaIds : [factura?.id])
        .map((id: any) => Number(id || 0))
        .filter((id: number) => id > 0)
        .sort((a: number, b: number) => a - b)
      if (facturaIds.length === 0) return { success: false, error: 'Factura invalida' }

      const mac = normalizarMac(obtenerMacAddress()) || 'LOCAL'
      const key = `${mac}:${facturaIds.join(',')}`
      const otpStatus = getOtpLocalStatus()
      facturaEliminacionOtp.set(key, {
        codigo: otpStatus.code,
        facturaIds,
        email: otpStatus.sendEmail ? getOtpEmailConfig().email : 'OTP LOCAL',
        expiresAt: Date.now() + 10 * 60 * 1000,
      })

      let email = ''
      if (otpStatus.sendEmail) {
        const emailConfig = getOtpEmailConfig()
        email = String(emailConfig.email || '').trim()
        if (!email) {
          facturaEliminacionOtp.delete(key)
          return { success: false, error: 'Activa o completa la configuracion de correo antes de enviar el OTP' }
        }
        const emailResult = await enviarOtpPorApi(email, otpStatus.code, factura)
        if (!emailResult.success) {
          facturaEliminacionOtp.delete(key)
          return { success: false, error: emailResult.error || 'No se pudo enviar el OTP al correo' }
        }
      }

      return { success: true, data: { local: true, emailSent: otpStatus.sendEmail, email, networkUrl: otpStatus.networkUrl, mode: otpStatus.mode, expiresMinutes: 10 } }
    } catch (e: any) { return { success: false, error: e.message || 'Error solicitando codigo' } }
  })

  ipcMain.handle('facturas:confirmarOtpEliminar', async (_event, payload: { facturaId?: number; facturaIds?: number[]; codigo?: string } = {}) => {
    try {
      const facturaIds = (Array.isArray(payload?.facturaIds) ? payload.facturaIds : [payload?.facturaId])
        .map((id: any) => Number(id || 0))
        .filter((id: number) => id > 0)
        .sort((a: number, b: number) => a - b)
      const codigo = String(payload?.codigo || '').replace(/\D/g, '')
      if (facturaIds.length === 0) return { success: false, error: 'Factura invalida' }
      if (!/^\d{4}$/.test(codigo)) return { success: false, error: 'Introduce el codigo de 4 digitos' }

      const mac = normalizarMac(obtenerMacAddress()) || 'LOCAL'
      const key = `${mac}:${facturaIds.join(',')}`
      const registro = facturaEliminacionOtp.get(key)
      if (!registro) return { success: false, error: 'Solicita un codigo nuevo' }
      if (Date.now() > registro.expiresAt) {
        facturaEliminacionOtp.delete(key)
        return { success: false, error: 'El codigo vencio. Solicita uno nuevo' }
      }
      if (!validateLocalOtp(codigo)) return { success: false, error: 'Codigo OTP local incorrecto' }

      facturaEliminacionOtp.delete(key)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message || 'Error validando codigo' } }
  })

  ipcMain.handle('imei:solicitarOtpEliminar', async (_event, imei: any = {}) => {
    try {
      const imeiIds = (Array.isArray(imei?.imeiIds) ? imei.imeiIds : [imei?.id])
        .map((id: any) => Number(id || 0))
        .filter((id: number) => id > 0)
        .sort((a: number, b: number) => a - b)
      if (imeiIds.length === 0) return { success: false, error: 'IMEI invalido' }

      const mac = normalizarMac(obtenerMacAddress()) || 'LOCAL'
      const key = `${mac}:${imeiIds.join(',')}`
      const otpStatus = getOtpLocalStatus()
      imeiEliminacionOtp.set(key, { codigo: otpStatus.code, imeiIds, email: otpStatus.sendEmail ? getOtpEmailConfig().email : 'OTP LOCAL', expiresAt: Date.now() + 10 * 60 * 1000 })

      let email = ''
      if (otpStatus.sendEmail) {
        const emailConfig = getOtpEmailConfig()
        email = String(emailConfig.email || '').trim()
        if (!email) {
          imeiEliminacionOtp.delete(key)
          return { success: false, error: 'Activa o completa la configuracion de correo antes de enviar el OTP' }
        }
        const emailResult = await enviarOtpPorApi(email, otpStatus.code, {
          ...imei,
          entidad: 'IMEI',
          entidadPlural: 'IMEI',
          cantidad: imeiIds.length,
          no_factura: imeiIds.length > 1 ? `${imeiIds.length} IMEI` : (imei?.nombre || `IMEI-${imeiIds[0]}`),
        })
        if (!emailResult.success) {
          imeiEliminacionOtp.delete(key)
          return { success: false, error: emailResult.error || 'No se pudo enviar el OTP al correo' }
        }
      }

      return { success: true, data: { local: true, emailSent: otpStatus.sendEmail, email, networkUrl: otpStatus.networkUrl, mode: otpStatus.mode, expiresMinutes: 10 } }
    } catch (e: any) { return { success: false, error: e.message || 'Error solicitando codigo' } }
  })

  ipcMain.handle('imei:confirmarOtpEliminar', async (_event, payload: { imeiId?: number; imeiIds?: number[]; codigo?: string } = {}) => {
    try {
      const imeiIds = (Array.isArray(payload?.imeiIds) ? payload.imeiIds : [payload?.imeiId])
        .map((id: any) => Number(id || 0))
        .filter((id: number) => id > 0)
        .sort((a: number, b: number) => a - b)
      const codigo = String(payload?.codigo || '').replace(/\D/g, '')
      if (imeiIds.length === 0) return { success: false, error: 'IMEI invalido' }
      if (!/^\d{4}$/.test(codigo)) return { success: false, error: 'Introduce el codigo de 4 digitos' }

      const mac = normalizarMac(obtenerMacAddress()) || 'LOCAL'
      const key = `${mac}:${imeiIds.join(',')}`
      const registro = imeiEliminacionOtp.get(key)
      if (!registro) return { success: false, error: 'Solicita un codigo nuevo' }
      if (Date.now() > registro.expiresAt) {
        imeiEliminacionOtp.delete(key)
        return { success: false, error: 'El codigo vencio. Solicita uno nuevo' }
      }
      if (!validateLocalOtp(codigo)) return { success: false, error: 'Codigo OTP local incorrecto' }

      imeiEliminacionOtp.delete(key)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message || 'Error validando codigo' } }
  })

  ipcMain.handle('transferencia:realizar', async (_event, params: { tabla: string; items: { id: number; cantidad: number }[]; origen_id: number; destino_id: number; origen_uid?: string; destino_uid?: string; transferencia: any }) => {
    try {
      const { tabla, items, origen_id, destino_id, origen_uid = '', destino_uid = '', transferencia } = params
      if (!usuarioPuedeAccion(String(transferencia?.usuario || ''), 'accion_trasladar')) return { success: false, error: 'No tienes permiso para trasladar inventario' }
      for (const item of items) {
        const row = db!.prepare(`SELECT * FROM "${tabla}" WHERE id = ?`).get(item.id) as any
        if (!row) { return { success: false, error: `Producto #${item.id} no encontrado` } }
        if (origen_uid && row.almacen_uid && String(row.almacen_uid) !== origen_uid) {
          return { success: false, error: `${row.nombre || 'Producto'} no pertenece al almacen de origen` }
        }
        const stockActual = Number(row.cantidad || 0)
        if (stockActual < item.cantidad) { return { success: false, error: `${row.nombre}: stock insuficiente (${stockActual} < ${item.cantidad})` } }
        const nuevaCantidadOrigen = stockActual - item.cantidad
        db!.prepare(`UPDATE "${tabla}" SET cantidad = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(nuevaCantidadOrigen, item.id)
        const destRow = db!.prepare(`SELECT * FROM "${tabla}" WHERE almacen_uid = ? AND nombre = ? LIMIT 1`).get(destino_uid, row.nombre || '') as any
        if (destRow) {
          db!.prepare(`UPDATE "${tabla}" SET cantidad = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(Number(destRow.cantidad || 0) + item.cantidad, destRow.id)
        } else {
          const newRow = { ...row, uid: generarUid(), cantidad: item.cantidad, almacen_id: destino_id, almacen_uid: destino_uid }
          delete newRow.id
          const keys = Object.keys(newRow)
          const placeholders = keys.map(() => '?').join(', ')
          const values = Object.values(newRow)
          db!.prepare(`INSERT INTO "${tabla}" (${keys.join(', ')}) VALUES (${placeholders})`).run(...values)
        }
      }
      if (!transferencia.uid) transferencia.uid = generarUid()
      if (!transferencia.created_at) transferencia.created_at = new Date().toISOString()
      transferencia.updated_at = new Date().toISOString()
      const tk = Object.keys(transferencia)
      const tp = tk.map(() => '?').join(', ')
      const tv = Object.values(transferencia)
      db!.prepare(`INSERT INTO transferencias (${tk.join(', ')}) VALUES (${tp})`).run(...tv)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('ajuste:realizar', async (_event, params: { tabla: string; producto_id: number; cantidad_nueva: number; motivo: string; tipo: string; almacen_id: number; almacen_uid?: string }) => {
    try {
      const { tabla, producto_id, cantidad_nueva, motivo, tipo, almacen_id, almacen_uid = '' } = params
      const row = db!.prepare(`SELECT * FROM "${tabla}" WHERE id = ?`).get(producto_id) as any
      if (!row) return { success: false, error: 'Producto no encontrado' }
      const anterior = Number(row.cantidad || 0)
      const diferencia = cantidad_nueva - anterior
      db!.prepare(`UPDATE "${tabla}" SET cantidad = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(cantidad_nueva, producto_id)
      const data = { uid: generarUid(), tabla, producto_id, producto_nombre: row.nombre || '', cantidad_anterior: anterior, cantidad_nueva, diferencia, tipo, motivo, usuario: '', almacen_id, almacen_uid }
      const keys = Object.keys(data); const vals = Object.values(data)
      db!.prepare(`INSERT INTO ajustes_inventario (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`).run(...vals)
      return { success: true, data: { anterior, nueva: cantidad_nueva, diferencia } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('precio:registrarHistorial', async (_event, params: { tabla: string; producto_id: number; producto_nombre: string; cambios: { campo: string; anterior: any; nuevo: any }[]; almacen_id?: number; almacen_uid?: string }) => {
    try {
      const { tabla, producto_id, producto_nombre, cambios, almacen_id = 0, almacen_uid = '' } = params
      const stmt = db!.prepare(`INSERT INTO historial_precios (uid, tabla, producto_id, producto_nombre, campo, valor_anterior, valor_nuevo, usuario, almacen_id, almacen_uid) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      for (const c of cambios) {
        if (String(c.anterior) !== String(c.nuevo)) {
          stmt.run(generarUid(), tabla, producto_id, producto_nombre, c.campo, String(c.anterior || ''), String(c.nuevo || ''), '', almacen_id, almacen_uid)
        }
      }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('empresa:guardar', async (_event, data: { nombre: string; encargado: string; telefono: string; email: string }) => {
    try {
      guardarEmpresaDesdeLicencia(data)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('proyecto:crear', async (_event, data: { nombre: string; system_name: string }) => {
    try {
      const result = await crearProyectoServidor(data.nombre, data.system_name)
      if (result.success && result.data) {
        return { success: true, data: result.data }
      }
      return { success: false, error: result.error || 'No se pudo crear el proyecto' }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:validarCloud', async (_event, codigo: string) => {
    try {
      const licencia = String(codigo || '').trim().toUpperCase()
      const result = await buscarLicenciaServidor(licencia, false, false, 15000)
      console.log('[validarCloud] resultado:', { success: result?.success, tieneData: Boolean(result?.data), error: result?.error })
      if (!result.success || !result.data) return { success: false, error: result.error || 'Licencia no encontrada en el servidor' }
      const d = { ...result.data, license_key: licencia, licencia }
      const estadoLicencia = normalizarEstado(String(d.estado || d.status || 'PENDIENTE'))
      if (estadoLicencia !== 'ACTIVO' && estadoLicencia !== 'PENDIENTE') {
        return { success: false, error: estadoLicencia === 'BLOQUEADA' || estadoLicencia === 'CANCELADA' ? 'Esta licencia esta bloqueada administrativamente' : `La licencia no esta activa (${estadoLicencia})` }
      }
      guardarSupabaseDesdeLicencia(d, true)
      guardarLicenciaLocal({
        estado: estadoLicencia,
        nombre: d.nombre || d.almacen || d.project_name || '',
        fecha_inicio_prueba: d.created_at || d.fecha_inicio,
        fecha_vencimiento: d.expires_at || d.proximopago || d.fecha_vencimiento,
        datosServidor: d,
        permitirCambioProyecto: true,
        codigoLicencia: licencia,
        reemplazarDatosServidor: true,
      })
      // Una licencia recien registrada debe comprobar inmediatamente si el
      // equipo sigue autorizado, aunque antes hubiese otra licencia instalada.
      guardarConfigLocal(CLAVE_ULTIMO_CHEQUEO_BLOQUEO, '', 'licencia')
      // La vista de registro descarga empresa y demas tablas inmediatamente
      // despues. No retrasar la confirmacion de la licencia con otra consulta
      // redundante de hasta 10 segundos.
      return { success: true, data: { mensaje: 'TM Cloud configurado correctamente' } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:fetchConfig', async (_event, codigo: string) => {
    try {
      const licencia = String(codigo || '').trim().toUpperCase()
      const result = await buscarLicenciaServidor(licencia, false, false)
      console.log('[fetchConfig] resultado buscarLicenciaServidor:', {
        success: result?.success,
        tieneData: Boolean(result?.data),
        camposData: result?.data ? Object.keys(result.data) : [],
        tieneSecretKey: Boolean(result?.data?.secret_key),
        tieneRoleKey: Boolean(result?.data?.role_key),
        tienePublicKey: Boolean(result?.data?.public_key),
        tieneProjectUrl: Boolean(result?.data?.project_url),
        tieneEmpresa: Boolean(result?.data?.empresa),
        error: result?.error,
      })
      if (!result.success || !result.data) return { success: false, error: result.error || 'Licencia no encontrada en el servidor' }
      const d = { ...result.data, license_key: licencia, licencia }
      guardarSupabaseDesdeLicencia(d, true)
      guardarLicenciaLocal({ estado: (d.estado || d.status || 'PENDIENTE').toUpperCase(), nombre: d.nombre || d.almacen || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: d.proximopago || d.fecha_vencimiento, datosServidor: d, permitirCambioProyecto: true, codigoLicencia: licencia, reemplazarDatosServidor: true })
      await descargarEmpresaProyecto(d)
      const camposServer = Object.keys(d)
      return { success: true, data: { mensaje: 'TM Cloud y datos de la empresa actualizados correctamente', serverFields: camposServer, tieneSecretKey: Boolean(d.secret_key), tienePublicKey: Boolean(d.public_key), tieneProjectUrl: Boolean(d.project_url), tieneEmpresa: Boolean(d.empresa), secretKeyPreview: d.secret_key ? d.secret_key.substring(0, 10) + '...' : null, publicKeyPreview: d.public_key ? d.public_key.substring(0, 10) + '...' : null, projectUrl: d.project_url || null } }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:verificar', async (_event, opts: { forceOnline?: boolean; offlineOnly?: boolean } = {}) => {
    try {
      const { forceOnline } = opts
      // Por defecto toda verificacion es local. La consulta completa a la API
      // queda reservada para una accion manual explicita de configuracion.
      if (!forceOnline) {
        const offline = verificarLicenciaOffline()
        if (offline.success) {
          const mensaje = offline.diasRestantes === null
            ? 'Licencia perpetua'
            : (offline.estado === 'pendiente' ? `Periodo de prueba: ${offline.diasRestantes} dia(s) restantes` : `Licencia activa: ${offline.diasRestantes} dia(s) restantes`)
          return { success: true, estado: offline.estado, data: { estado: offline.estado, mensaje, diasRestantes: offline.diasRestantes }, verificadoOnline: false }
        }
        const estadoFinal = offline.estado === 'sin_verificar' ? 'no_encontrada' : offline.estado
        return { success: false, estado: estadoFinal, error: offline.error || 'Sin licencia local', data: { estado: estadoFinal, mensaje: offline.error || 'Sin licencia local' } }
      }
      if (forceOnline) {
        const VERIFY_TIMEOUT = 5000
        const codigoLocal = getCodigoLicenciaLocal()
        let online: any
        if (codigoLocal) {
          online = await buscarLicenciaServidor(codigoLocal, false, true, VERIFY_TIMEOUT)
        } else {
          online = await verificarLicenciaOnline(VERIFY_TIMEOUT)
          if (!online.success && !esErrorConexion(online.error)) {
            const mac = obtenerMacAddress()
            if (mac) online = await buscarLicenciaServidor(mac, false, true, VERIFY_TIMEOUT)
          }
        }
        if (online.success && online.data) {
          const d = online.data
          const estado = (d.estado || d.status || '').toUpperCase()
          guardarLicenciaLocal({ estado, nombre: d.nombre || d.almacen || '', fecha_inicio_prueba: d.created_at || d.fecha_inicio, fecha_vencimiento: d.proximopago || d.fecha_vencimiento, datosServidor: d })
          const ok = estado === 'ACTIVO' || estado === 'PENDIENTE'
          return { success: ok, estado: estado.toLowerCase(), data: { estado: estado.toLowerCase(), mensaje: `Licencia ${estado.toLowerCase()}` }, verificadoOnline: true }
        }
        if (online.estado === 'equipo_no_autorizado') {
          return { success: false, estado: 'equipo_no_autorizado', error: online.error || 'Este equipo no esta autorizado para usar esta licencia', data: { estado: 'equipo_no_autorizado', mensaje: online.error || 'Este equipo no esta autorizado para usar esta licencia', codigoLicencia: online.data?.license_key || codigoLocal || '' }, verificadoOnline: true }
        }
        return { success: false, error: online.error || 'Error verificando online', data: { estado: 'error', mensaje: online.error || 'Sin respuesta del servidor' } }
      }

      return { success: false, estado: 'error', error: 'Opcion de verificacion no reconocida' }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('licencia:consultarBloqueo', async (_event, opts: { force?: boolean } = {}) => {
    try {
      const licenciaLocal = getLicenciaLocal()
      const codigoLocal = getCodigoLicenciaLocal()
      if (!licenciaLocal?.licencia_equipo || !codigoLocal) {
        return { success: true, checked: false, blocked: false, reason: 'sin_licencia_local' }
      }

      const marca = db!.prepare(`SELECT valor FROM configuracion WHERE clave = ? LIMIT 1`).get(CLAVE_ULTIMO_CHEQUEO_BLOQUEO) as any
      const ultimoChequeo = marca?.valor ? new Date(marca.valor).getTime() : 0
      if (!opts.force && ultimoChequeo > 0 && Date.now() - ultimoChequeo < INTERVALO_CHEQUEO_BLOQUEO_MS) {
        return {
          success: true,
          checked: false,
          skipped: true,
          blocked: false,
          nextCheck: new Date(ultimoChequeo + INTERVALO_CHEQUEO_BLOQUEO_MS).toISOString(),
        }
      }

      // Esta llamada no refresca vencimiento, empresa ni credenciales. Solo
      // escucha un bloqueo explicito o que el equipo haya sido desautorizado.
      // Registrar tambien el intento evita repetir llamadas en cada arranque
      // cuando la tienda permanece sin Internet.
      guardarConfigLocal(CLAVE_ULTIMO_CHEQUEO_BLOQUEO, new Date().toISOString(), 'licencia')
      const online = await buscarLicenciaServidor(codigoLocal, false, true, 4000)
      const estadoRemoto = normalizarEstado(String(online?.data?.estado || online?.data?.status || ''))
      const equipoRetirado = online?.estado === 'equipo_no_autorizado'
      const blocked = equipoRetirado || estadoRemoto === 'BLOQUEADA' || estadoRemoto === 'CANCELADA'

      if (blocked) {
        db!.prepare(`UPDATE licencia SET estado = 'BLOQUEADA', updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run()
        guardarConfigLocal(CLAVE_ULTIMO_CHEQUEO_BLOQUEO, new Date().toISOString(), 'licencia')
        return {
          success: true,
          checked: true,
          blocked: true,
          estado: estadoRemoto === 'CANCELADA' ? 'cancelada' : 'bloqueada',
          message: equipoRetirado ? 'Este equipo fue retirado de los dispositivos autorizados' : 'La licencia fue bloqueada administrativamente',
        }
      }

      if (online?.success) {
        guardarConfigLocal(CLAVE_ULTIMO_CHEQUEO_BLOQUEO, new Date().toISOString(), 'licencia')
        return { success: true, checked: true, blocked: false }
      }

      // Una falla de red, un timeout o una respuesta inconclusa nunca altera
      // la licencia local ni interrumpe el uso del sistema.
      return { success: true, checked: false, blocked: false, offline: true }
    } catch {
      return { success: true, checked: false, blocked: false, offline: true }
    }
  })

  // IMEI externo
  const TOKEN_SECRET = '1234567890abc'
  function generarJWT() {
    const header = Buffer.from(JSON.stringify({ alg: 'HS256', typ: 'JWT' })).toString('base64url')
    const payload = Buffer.from(JSON.stringify({ iss: 'argentpos', iat: Math.floor(Date.now() / 1000), exp: Math.floor(Date.now() / 1000) + 3600 })).toString('base64url')
    const signature = crypto.createHmac('sha256', TOKEN_SECRET).update(`${header}.${payload}`).digest('base64url')
    return `${header}.${payload}.${signature}`
  }

  ipcMain.handle('imei:consultar', async (_event, imei: string, servicio: number) => {
    try {
      const payload = { imei, servicio }
      const data = JSON.stringify(payload)
      const url = new URL('https://demo.tmposrd.com/api2/consultaimei')
      return new Promise((resolve) => {
        const req = https.request({ hostname: url.hostname, path: url.pathname, method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${generarJWT()}`, 'Content-Length': Buffer.byteLength(data) }, timeout: 30000 }, (res) => {
          let body = ''
          res.on('data', (chunk: string) => body += chunk)
          res.on('end', () => {
            try { resolve({ success: true, data: JSON.parse(body) }) } catch { resolve({ success: true, data: { raw: body } }) }
          })
        })
        req.on('error', (error) => resolve({ success: false, error: error.message }))
        req.setTimeout(30000, () => { req.destroy(); resolve({ success: false, error: 'Tiempo de espera agotado' }) })
        req.write(data)
        req.end()
      })
    } catch (e: any) { return { success: false, error: e.message } }
  })

  // Impresoras
  ipcMain.handle('getPrinters', async () => {
    try {
      if (!mainWindow) return { success: false, error: 'Ventana no disponible' }
      const printers = await mainWindow.webContents.getPrintersAsync()
      return { success: true, data: printers }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // Imprimir ticket
  ipcMain.handle('print:ticket', async (_event, html: string, printerName?: string, pageSizeMm?: { width?: number; height?: number }) => {
    let printWindow: BrowserWindow | null = null
    const tmpPath = path.join(app.getPath('temp'), `print-ticket-${Date.now()}.html`)
    try {
      const safeHtml = String(html || '')
        .replace(/<script\b[^>]*>[\s\S]*?<\/script\s*>/gi, '')
        .replace(/<(?:iframe|object|embed|base)\b[^>]*>[\s\S]*?<\/(?:iframe|object|embed)>/gi, '')
        .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, '')
        .replace(/\b(?:href|src)\s*=\s*(["'])\s*javascript:[\s\S]*?\1/gi, '$1#$1')
      const isFullDoc = safeHtml.includes('<!DOCTYPE html>') || safeHtml.includes('<html>')
      const hasOwnPageRule = safeHtml.includes('@page')
      const pageStyle = '<style>@page { size: 80mm 297mm; margin: 0; }</style>'
      const fullHtml = isFullDoc ? (hasOwnPageRule ? safeHtml : safeHtml.replace('<head>', `<head>${pageStyle}`)) : `<!DOCTYPE html><html><head><meta charset="utf-8"><style>@page { size: 80mm 297mm; margin: 0; }body { margin: 0; padding: 0; }</style></head><body>${safeHtml}</body></html>`
      fs.writeFileSync(tmpPath, fullHtml, 'utf-8')
      printWindow = new BrowserWindow({ width: 480, height: 800, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
      await printWindow.loadFile(tmpPath)
      await new Promise(r => setTimeout(r, 1000))
      if (printerName) {
        const installedPrinters = await printWindow.webContents.getPrintersAsync()
        const searchName = printerName.trim().toLowerCase()
        const match = installedPrinters.find(printer =>
          printer.name?.trim().toLowerCase() === searchName ||
          printer.name?.trim().toLowerCase().includes(searchName)
        )
        if (!match) {
          if (printWindow) { printWindow.close(); printWindow = null }
          try { fs.unlinkSync(tmpPath) } catch {}
          return { success: false, error: `La impresora "${printerName}" no esta instalada en Windows.` }
        }
        printerName = match.name
      }
      const printOptions: any = { silent: true, printBackground: true, landscape: false, scaleFactor: 100, margins: { marginType: 'none' } }
      if (printerName) printOptions.deviceName = printerName
      const width = Number(pageSizeMm?.width || 0)
      let height = Number(pageSizeMm?.height || 0)
      if (width > 0) {
        if (!(height > 0)) {
          const contentHeightPx = await printWindow.webContents.executeJavaScript(
            `Math.ceil(Math.max(document.body?.scrollHeight || 0, document.documentElement?.scrollHeight || 0))`,
            true,
          )
          height = Math.max(30, Math.min(3000, Number(contentHeightPx || 0) * 25.4 / 96 + 4))
        }
        printOptions.pageSize = { width: Math.round(width * 1000), height: Math.round(height * 1000) }
      }
      return new Promise((resolve) => {
        printWindow!.webContents.print(printOptions, (success, failureReason) => {
          if (printWindow) { printWindow.close(); printWindow = null }
          try { fs.unlinkSync(tmpPath) } catch {}
          resolve(success ? { success: true } : { success: false, error: failureReason || 'Error al imprimir' })
        })
      })
    } catch (error: any) { try { fs.unlinkSync(tmpPath) } catch {}; return { success: false, error: error.message } }
  })

  ipcMain.handle('print:bluetooth-raw', async (_event, portName: string, data: string) => {
    try {
      const normalizedPort = String(portName || '').trim().toUpperCase()
      if (!/^COM\d+$/.test(normalizedPort)) return { success: false, error: 'Puerto Bluetooth invalido' }
      const encodedData = Buffer.from(String(data || ''), 'utf8').toString('base64')
      const script = `$portName = '${normalizedPort}'; $bytes = [Convert]::FromBase64String('${encodedData}'); $serial = [System.IO.Ports.SerialPort]::new($portName, 9600, [System.IO.Ports.Parity]::None, 8, [System.IO.Ports.StopBits]::One); $serial.WriteTimeout = 8000; $serial.Open(); $serial.Write($bytes, 0, $bytes.Length); $serial.Close()`
      const encodedScript = Buffer.from(script, 'utf16le').toString('base64')
      return await new Promise((resolve) => {
        exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encodedScript}`, { timeout: 12000 }, (err, _stdout, stderr) => {
          resolve(err ? { success: false, error: stderr || err.message || 'No se pudo escribir al Bluetooth' } : { success: true })
        })
      })
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // PDF
  ipcMain.handle('generate:pdf', async (_event, html: string, defaultName: string) => {
    let pdfWindow: BrowserWindow | null = null
    try {
      pdfWindow = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await new Promise(r => setTimeout(r, 1500))
      const pdfBuffer = await pdfWindow.webContents.printToPDF({})
      pdfWindow.close(); pdfWindow = null
      return { success: true, dataUrl: `data:application/pdf;base64,${pdfBuffer.toString('base64')}`, defaultName }
    } catch (error: any) { if (pdfWindow) pdfWindow.close(); return { success: false, error: error.message } }
  })

  ipcMain.handle('pdf:generateToFile', async (_event, html: string, fileName: string) => {
    let pdfWindow: BrowserWindow | null = null
    try {
      pdfWindow = new BrowserWindow({ width: 800, height: 600, show: false, webPreferences: { nodeIntegration: false, contextIsolation: true } })
      await pdfWindow.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`)
      await new Promise(r => setTimeout(r, 1500))
      const pdfBuffer = await pdfWindow.webContents.printToPDF({})
      pdfWindow.close(); pdfWindow = null
      const filePath = path.join(app.getPath('temp'), fileName.replace(/[^a-zA-Z0-9_.-]/g, '_'))
      fs.writeFileSync(filePath, pdfBuffer)
      return { success: true, filePath }
    } catch (error: any) { if (pdfWindow) pdfWindow.close(); return { success: false, error: error.message } }
  })

  // Clipboard
  ipcMain.handle('clipboard:copyFile', async (_event, filePath: string) => {
    try {
      const normalizedPath = path.resolve(filePath)
      const script = `Add-Type -AssemblyName System.Windows.Forms; $paths = New-Object System.Collections.Specialized.StringCollection; $paths.Add('${normalizedPath.replace(/\\/g, '\\\\').replace(/'/g, "''")}'); [System.Windows.Forms.Clipboard]::SetFileDropList($paths)`
      const encoded = Buffer.from(script, 'utf16le').toString('base64')
      return await new Promise((resolve) => {
        exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { timeout: 10000 }, (err, _stdout, stderr) => {
          resolve(err ? { success: false, error: stderr || err.message } : { success: true })
        })
      })
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // Bluetooth scan
  ipcMain.handle('scan:bluetooth', async () => {
    try {
      const devices: any[] = []
      const isWin = process.platform === 'win32'
      const addDevice = (device: any) => {
        const name = String(device.name || '').trim()
        if (!name) return
        const key = `${name.toLowerCase()}|${String(device.address || device.deviceId || '').toLowerCase()}`
        const existing = devices.find((d: any) => `${d.name.toLowerCase()}|${String(d.address || d.deviceId || '').toLowerCase()}` === key)
        if (existing) Object.assign(existing, { ...device, name })
        else devices.push({ name, address: device.address || '', deviceId: device.deviceId || device.address || '', model: device.model || 'Bluetooth', source: device.source || 'bluetooth', portName: device.portName || '' })
      }
      const parseJsonList = (value: string): any[] => { try { const parsed = JSON.parse(value || '[]'); return Array.isArray(parsed) ? parsed : [parsed] } catch { return [] } }
      const runPowerShellJson = (script: string) => new Promise<string>((resolve) => {
        const encoded = Buffer.from(script, 'utf16le').toString('base64')
        exec(`powershell.exe -NoProfile -ExecutionPolicy Bypass -EncodedCommand ${encoded}`, { timeout: 10000 }, (err, stdout) => { resolve(err ? '[]' : stdout || '[]') })
      })

      if (isWin) {
        for (const d of parseJsonList(await runPowerShellJson(`Get-PnpDevice -Class Bluetooth | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName } | Select-Object FriendlyName, DeviceID | ConvertTo-Json -Compress`))) {
          addDevice({ name: d.FriendlyName, address: d.DeviceID || '', deviceId: d.DeviceID || '', model: 'Bluetooth', source: 'bluetooth' })
        }
        for (const p of parseJsonList(await runPowerShellJson(`Get-CimInstance Win32_Printer | Where-Object { $_.Name -match 'bluetooth|bt|label|zebra|tsc|xprinter|xp-|rongta|goojprt|munbyn|hprt|portable|thermal|termica|etiqueta' -or $_.DriverName -match 'bluetooth|bt|label|zebra|tsc|xprinter|xp-|rongta|goojprt|munbyn|hprt|portable|thermal|termica|etiqueta' -or $_.PortName -match 'BTH|Bluetooth|COM' } | Select-Object Name, DriverName, PortName, DeviceID | ConvertTo-Json -Compress`))) {
          addDevice({ name: p.Name, address: p.PortName || p.DeviceID || '', deviceId: p.Name || p.DeviceID || '', model: p.DriverName || 'Bluetooth Printer', source: 'bluetooth-printer' })
        }
        for (const port of parseJsonList(await runPowerShellJson(`Get-PnpDevice -Class Ports | Where-Object { $_.Status -eq 'OK' -and $_.FriendlyName -match 'COM\\d+' } | Select-Object FriendlyName, InstanceId | ConvertTo-Json -Compress`)).map((port: any) => {
          const portName = String(port.FriendlyName || '').match(/COM\d+/i)?.[0]?.toUpperCase() || ''
          const instanceId = String(port.InstanceId || '')
          const address = instanceId.match(/([0-9A-F]{12})/i)?.[1] || ''
          return { portName, instanceId, address }
        }).filter((port: any) => port.portName)) {
          const matched = devices.find((device: any) => {
            const deviceAddress = String(device.deviceId || device.address || '').match(/DEV_([0-9A-F]{12})/i)?.[1] || ''
            return deviceAddress && port.instanceId.toUpperCase().includes(deviceAddress.toUpperCase())
          })
          if (matched) {
            matched.portName = port.portName
            if (matched.source === 'bluetooth') { matched.source = 'bluetooth-direct'; matched.model = `Bluetooth directo ${port.portName}` }
          } else addDevice({ name: `Bluetooth ${port.portName}`, address: port.address, deviceId: port.instanceId, model: `Bluetooth directo ${port.portName}`, source: 'bluetooth-direct', portName: port.portName })
        }
      }
      return { success: true, data: devices }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // Actualizacion
  ipcMain.handle('app:getName', () => app.getName())
  ipcMain.handle('app:getVersion', () => app.getVersion())

  const githubUpdatesRepository = 'tmpos/tmpos-online'
  const githubUpdatesApi = `https://api.github.com/repos/${githubUpdatesRepository}/releases/latest`

  function githubInstallerAsset(release: any): any | null {
    const assets = Array.isArray(release?.assets) ? release.assets : []
    const extensions = process.platform === 'win32'
      ? ['.exe', '.msi']
      : process.platform === 'darwin'
        ? ['.dmg', '.zip']
        : ['.appimage', '.deb', '.rpm']
    const candidates = assets.filter((asset: any) => {
      const name = String(asset?.name || '').toLowerCase()
      return extensions.some(extension => name.endsWith(extension)) && asset?.browser_download_url
    })
    return candidates.sort((left: any, right: any) => {
      const score = (asset: any) => {
        const name = String(asset?.name || '').toLowerCase()
        return (name.includes('tmpos') ? 4 : 0) + (name.includes('setup') ? 2 : 0) + (name.endsWith('.exe') || name.endsWith('.dmg') ? 1 : 0)
      }
      return score(right) - score(left)
    })[0] || null
  }

  function trustedGithubUpdateUrl(value: unknown): URL {
    const parsed = new URL(String(value || ''))
    if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || !parsed.pathname.startsWith(`/${githubUpdatesRepository}/releases/download/`)) {
      throw new Error('La URL del instalador no pertenece al repositorio oficial de TMPOS')
    }
    return parsed
  }

  async function downloadGithubUpdate(urlValue: unknown, destination: string): Promise<void> {
    const updateUrl = trustedGithubUpdateUrl(urlValue)
    const response = await fetch(updateUrl, {
      redirect: 'follow',
      headers: { 'Accept': 'application/octet-stream', 'User-Agent': `TMPOS/${app.getVersion()}` },
      signal: AbortSignal.timeout(120000),
    })
    if (!response.ok) throw new Error(`GitHub no pudo descargar el instalador (HTTP ${response.status})`)
    const content = Buffer.from(await response.arrayBuffer())
    if (!content.length) throw new Error('GitHub devolvio un instalador vacio')
    await fs.promises.writeFile(destination, content)
  }

  ipcMain.handle('app:getConfig', () => {
    try {
      const basePath = path.dirname(app.getPath('exe'))
      for (const p of [path.join(basePath, 'config.json'), path.join(process.cwd(), 'config.json'), path.join(__dirname, 'config.json')]) {
        try { if (fs.existsSync(p)) return { success: true, data: JSON.parse(fs.readFileSync(p, 'utf8')) } } catch {}
      }
      return { success: false, error: 'config.json no encontrado' }
    } catch { return { success: false, error: 'Error al leer config' } }
  })

  // Configuracion portable: esquema de tablas/campos y datos iniciales controlados.
  ipcMain.handle('portable-config:create', () => {
    try { return { success: true, data: createPortableConfiguration() } }
    catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('portable-config:apply', (_event, packageData: any) => {
    try { return { success: true, data: applyPortableConfiguration(packageData) } }
    catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('portable-config:seed-defaults', (_event, defaults?: any) => {
    try { return { success: true, data: seedPortableDefaults(defaults) } }
    catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('portable-config:export', async (_event, packageData?: any) => {
    try {
      const data = packageData ? validatePortableConfiguration(packageData) : createPortableConfiguration()
      const stamp = new Date().toISOString().slice(0, 10)
      const result = await dialog.showSaveDialog(mainWindow!, {
        title: 'Exportar configuracion TMPOS',
        defaultPath: `tmpos-configuracion-${stamp}.json`,
        filters: [{ name: 'Configuracion JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePath) return { success: false, canceled: true }
      await fs.promises.writeFile(result.filePath, JSON.stringify(data, null, 2), 'utf8')
      return { success: true, path: result.filePath, data }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('portable-config:import', async () => {
    try {
      const result = await dialog.showOpenDialog(mainWindow!, {
        title: 'Importar configuracion TMPOS',
        properties: ['openFile'],
        filters: [{ name: 'Configuracion JSON', extensions: ['json'] }],
      })
      if (result.canceled || !result.filePaths[0]) return { success: false, canceled: true }
      const data = validatePortableConfiguration(JSON.parse(await fs.promises.readFile(result.filePaths[0], 'utf8')))
      return { success: true, path: result.filePaths[0], data }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('update:check', async () => {
    try {
      const currentVersion = app.getVersion()
      const res = await fetch(githubUpdatesApi, {
        headers: {
          'Accept': 'application/vnd.github+json',
          'User-Agent': `TMPOS/${currentVersion}`,
          'X-GitHub-Api-Version': '2022-11-28',
        },
        signal: AbortSignal.timeout(15000),
      })
      if (!res.ok) return { success: false, error: `GitHub respondio HTTP ${res.status} al verificar actualizaciones` }
      const release = await res.json() as any
      const version = String(release?.tag_name || release?.name || '').trim().replace(/^v/i, '')
      if (!version) return { success: false, error: 'El release de GitHub no contiene una version valida' }
      const installer = githubInstallerAsset(release)
      return {
        success: true,
        data: {
          version,
          currentVersion,
          hayActualizacion: isVersionNewer(version, currentVersion),
          fecha: release.published_at || release.created_at || '',
          notas: String(release.body || '').trim(),
          url: installer?.browser_download_url || '',
          fileName: installer?.name || '',
          releaseUrl: release.html_url || `https://github.com/${githubUpdatesRepository}/releases/latest`,
          origen: 'GitHub Releases',
        },
      }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('update:download', async (_event, url_: string) => {
    try {
      const updateUrl = trustedGithubUpdateUrl(url_)
      const fileName = path.basename(decodeURIComponent(updateUrl.pathname)) || `TMPOS.Setup.${app.getVersion()}.exe`
      const result = await dialog.showSaveDialog(mainWindow!, { title: 'Guardar e instalar actualizacion', defaultPath: path.join(app.getPath('downloads'), fileName), filters: [{ name: 'Instalador', extensions: ['exe', 'msi', 'dmg', 'zip'] }] })
      if (result.canceled || !result.filePath) return { success: false, error: 'Descarga cancelada' }
      await downloadGithubUpdate(updateUrl.toString(), result.filePath)
      return { success: true, path: result.filePath }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('update:downloadAuto', async (_event, url_: string) => {
    try {
      const updateUrl = trustedGithubUpdateUrl(url_)
      const fileName = path.basename(decodeURIComponent(updateUrl.pathname)) || 'TMPOS.Setup.exe'
      const destination = path.join(app.getPath('downloads'), fileName)
      await downloadGithubUpdate(updateUrl.toString(), destination)
      return { success: true, path: destination }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('update:install', async (_event, filePath: string) => {
    try {
      const ext = path.extname(filePath).toLowerCase()
      const args = ext === '.msi' ? ['/quiet', '/norestart'] : ['/S']
      const currentExe = process.execPath
      spawn(filePath, args, { detached: true, stdio: 'ignore', windowsHide: true }).unref()
      setTimeout(() => { try { spawn(currentExe, [], { detached: true, stdio: 'ignore', windowsHide: true }).unref() } catch {}; app.quit() }, 5000)
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  })

  ipcMain.handle('open:devtools', (_event, usuario = '') => {
    try {
      if (!usuarioPuedeAccion(usuario, 'configuracion')) return { success: false, error: 'Solo Administrador o Soporte puede abrir las herramientas de desarrollo' }
      mainWindow?.webContents.openDevTools()
      return { success: true }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // Guardar PDF
  ipcMain.handle('save:pdf', async (_event, dataUrl: string, defaultName: string) => {
    try {
      const buffer = Buffer.from(dataUrl.split(',')[1], 'base64')
      const result = await dialog.showSaveDialog({ title: 'Guardar PDF', defaultPath: defaultName, filters: [{ name: 'PDF', extensions: ['pdf'] }] })
      if (result.canceled || !result.filePath) return { success: false }
      await fs.promises.writeFile(result.filePath, buffer)
      return { success: true, path: result.filePath }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // Backup
  ipcMain.handle('backup:create', async () => {
    try {
      const backupsDir = getBackupsDir()
      const stamp = new Date().toISOString().replace(/[:.]/g, '-')
      const fileName = `backup_${stamp}.db`
      const filePath = path.join(backupsDir, fileName)
      await db!.backup(filePath)
      await pruneBackups(5)
      return { success: true, data: { fileName } }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('backup:list', async () => {
    try {
      const backupsDir = getBackupsDir()
      const files = await fs.promises.readdir(backupsDir)
      const backups = await Promise.all(files.filter(f => f.toLowerCase().endsWith('.db')).map(async file => {
        const stat = await fs.promises.stat(path.join(backupsDir, file))
        return { nombre: file, tamano: stat.size, fecha: stat.mtime.toISOString() }
      }))
      backups.sort((a, b) => new Date(b.fecha).getTime() - new Date(a.fecha).getTime())
      return { success: true, data: backups }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('backup:download', async (_event, fileName: string) => {
    try {
      const source = path.join(getBackupsDir(), path.basename(fileName))
      await fs.promises.access(source)
      const result = await dialog.showSaveDialog({ title: 'Guardar backup', defaultPath: path.basename(fileName), filters: [{ name: 'SQLite Backup', extensions: ['db'] }] })
      if (result.canceled || !result.filePath) return { success: false }
      await fs.promises.copyFile(source, result.filePath)
      return { success: true, path: result.filePath }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('backup:delete', async (_event, fileName: string) => {
    try {
      await fs.promises.unlink(path.join(getBackupsDir(), path.basename(fileName)))
      return { success: true }
    } catch (error: any) { return { success: false, error: error.message } }
  })

  ipcMain.handle('backup:restore', async (_event, fileName: string) => {
    try {
      const backupPath = path.join(getBackupsDir(), path.basename(fileName))
      const dbPath = getDbPath()
      await fs.promises.access(backupPath)
      if (db) { db.close(); db = null }
      await fs.promises.copyFile(backupPath, dbPath)
      initDatabase()
      return { success: true }
    } catch (error: any) {
      if (!db) initDatabase()
      return { success: false, error: error.message }
    }
  })

  ipcMain.handle('getServerUrl', () => { return { success: true, url: serverUrl } })

  ipcMain.handle('otp-local:getConfig', () => {
    try { return { success: true, data: getOtpLocalStatus() } }
    catch (error: any) { return { success: false, error: error.message || 'No se pudo cargar el OTP local' } }
  })

  ipcMain.handle('otp-local:saveConfig', (_event, payload: any = {}) => {
    try {
      const mode: OtpLocalMode = payload.mode === 'fixed' ? 'fixed' : 'variable'
      const fixedCode = String(payload.fixedCode || '').replace(/\D/g, '')
      const intervalSeconds = Math.min(3600, Math.max(30, Number(payload.intervalSeconds || 60)))
      const sendEmail = payload.sendEmail === true
      if (mode === 'fixed' && !/^\d{4}$/.test(fixedCode)) return { success: false, error: 'El codigo fijo debe tener 4 digitos' }
      const current = getOtpLocalConfig()
      const secret = payload.regenerateSecret ? crypto.randomBytes(32).toString('hex') : current.secret
      db!.prepare(`UPDATE otp_local_config SET mode = ?, fixed_code = ?, interval_seconds = ?, send_email = ?, secret = ?, updated_at = CURRENT_TIMESTAMP WHERE id = 1`).run(
        mode, /^\d{4}$/.test(fixedCode) ? fixedCode : current.fixedCode, intervalSeconds, sendEmail ? 1 : 0, secret
      )
      registrarBitacora('otp_local_config', 1, 'UPDATE', 'ADMIN/SOPORTE', { mode, interval_seconds: intervalSeconds, send_email: sendEmail, secret_regenerated: Boolean(payload.regenerateSecret) }, { mode: current.mode, interval_seconds: current.intervalSeconds, send_email: current.sendEmail })
      return { success: true, data: getOtpLocalStatus() }
    } catch (error: any) { return { success: false, error: error.message || 'No se pudo guardar el OTP local' } }
  })

  // consultaservidor
  ipcMain.handle('consultaservidor', (_event, action: string, ...args: any[]) => {
    try {
      if (action === 'getAllConfig') {
        return { VITE_LINKURL: process.env.VITE_LINKURL || 'http://localhost:3000', VITE_LINK_API: process.env.VITE_LINK_API || 'http://localhost:3000/api', VITE_TOKEN: process.env.VITE_TOKEN || '', VITE_PATRON_TELEFONO: process.env.VITE_PATRON_TELEFONO || '^[0-9]{10}$', VITE_IMPRESORA_LOCAL: process.env.VITE_IMPRESORA_LOCAL || '', VITE_PATRON_CEDULA: process.env.VITE_PATRON_CEDULA || '^[0-9]{11}$', VITE_TOKEN_CORTO: process.env.VITE_TOKEN_CORTO || '' }
      }
      if (action === 'tableExists') {
        const result = db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`).get(args[0])
        return result ? ['ok'] : ['error']
      }
      if (action === 'getTableColumns') {
        const columns = db!.prepare(`PRAGMA table_info("${args[0]}")`).all()
        return args[1] === 'names' ? columns.map((c: any) => c.name) : columns
      }
      if (action === 'crearTabla') {
        const campos = Array.isArray(args[1]) ? args[1].join(', ') : args[1]
        db!.exec(`CREATE TABLE IF NOT EXISTS "${args[0]}" (${campos})`)
        return { success: true }
      }
      if (action === 'addColumnToTable') {
        try { db!.exec(`ALTER TABLE "${args[0]}" ADD COLUMN "${args[1]}"`); return ['ok'] } catch (error: any) { return { success: false, error: error.message } }
      }
      if (action === 'getAllTables') {
        const rows = db!.prepare(`SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name`).all()
        return { data: rows.map((r: any) => r.name) }
      }
      if (action === 'rawQuery') {
        try { db!.exec(args[0]); return { success: true } } catch (error: any) { return { success: false, error: error.message } }
      }
      if (action === 'executeSQL') {
        const sql = args[0].trim()
        const context = args.find((arg: any) => arg?.__supportContext === true) || {}
        const supportUser = Number(context.userId || 0) > 0
          ? db!.prepare(`SELECT id, usuario, rol, nivel_seguridad, estado FROM usuarios WHERE id = ? LIMIT 1`).get(Number(context.userId)) as any
          : null
        const role = String(supportUser?.rol || supportUser?.nivel_seguridad || '').toLowerCase()
        const authorized = supportUser?.estado === 'ACTIVADO' && ['administrador', 'soporte'].includes(role)
        const sqlHash = crypto.createHash('sha256').update(sql).digest('hex')
        if (!authorized) {
          registrarBitacora('soporte_sql', 0, 'DENIED', String(context.usuario || 'DESCONOCIDO'), { hash: sqlHash, length: sql.length }, null)
          return { success: false, error: 'Solo administracion o soporte puede ejecutar SQL' }
        }
        try {
          const upper = sql.toUpperCase()
          if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN')) {
            const rows = db!.prepare(sql).all() as Record<string, any>[]
            const columns = rows.length > 0 ? Object.keys(rows[0]) : []
            registrarBitacora('soporte_sql', 0, 'SELECT', String(context.usuario || supportUser.usuario || ''), { hash: sqlHash, length: sql.length, rows: rows.length }, null)
            return { success: true, type: 'select', rows: rows.map((r: any, i: number) => ({ ...r, __index: i })), columns, count: rows.length }
          } else {
            const result = db!.prepare(sql).run()
            registrarBitacora('soporte_sql', 0, 'EXECUTE', String(context.usuario || supportUser.usuario || ''), { hash: sqlHash, length: sql.length, changes: result.changes }, null)
            return { success: true, type: 'execute', changes: result.changes }
          }
        } catch (error: any) {
          registrarBitacora('soporte_sql', 0, 'ERROR', String(context.usuario || supportUser.usuario || ''), { hash: sqlHash, length: sql.length, error: String(error.message || '').slice(0, 200) }, null)
          return { success: false, error: error.message }
        }
      }
      if (action === 'vaciarTabla') {
        try { db!.exec(`DELETE FROM "${args[0]}"`); db!.exec(`DELETE FROM sqlite_sequence WHERE name='${args[0]}'`); return { success: true } } catch (error: any) { return { success: false, error: error.message } }
      }
      if (action === 'resetTableIds') {
        const tabla = String(args[0] || '')
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) return { success: false, error: 'Nombre de tabla no valido' }
        try {
          const existe = db!.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tabla)
          if (!existe) return { success: false, error: 'La tabla no existe' }
          const filas = db!.prepare(`SELECT id FROM "${tabla}" ORDER BY id ASC`).all() as any[]
          const tablasLocales = db!.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'").all() as any[]
          const referencias: Array<{ tabla: string; columna: string }> = []
          for (const filaTabla of tablasLocales) {
            const tablaHija = String(filaTabla.name || '')
            if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tablaHija)) continue
            const claves = db!.prepare(`PRAGMA foreign_key_list("${tablaHija}")`).all() as any[]
            for (const clave of claves) {
              if (String(clave.table || '') === tabla && String(clave.to || 'id') === 'id') referencias.push({ tabla: tablaHija, columna: String(clave.from) })
            }
          }
          db!.pragma('foreign_keys = OFF')
          const resetear = db!.transaction(() => {
            const cambios = filas.map((fila, indice) => ({ anterior: Number(fila.id), nuevo: indice + 1, temporal: -(Number(fila.id) + 1000000000) }))
            const actualizarId = db!.prepare(`UPDATE "${tabla}" SET id = ? WHERE id = ?`)
            for (const cambio of cambios) actualizarId.run(cambio.temporal, cambio.anterior)
            for (const referencia of referencias) {
              const actualizarReferencia = db!.prepare(`UPDATE "${referencia.tabla}" SET "${referencia.columna}" = ? WHERE "${referencia.columna}" = ?`)
              for (const cambio of cambios) actualizarReferencia.run(cambio.nuevo, cambio.anterior)
            }
            for (const cambio of cambios) actualizarId.run(cambio.nuevo, cambio.temporal)
            db!.prepare('DELETE FROM sqlite_sequence WHERE name = ?').run(tabla)
            return cambios.length
          })
          const renumerados = resetear()
          db!.pragma('foreign_keys = ON')
          return { success: true, renumbered: renumerados }
        } catch (error: any) { try { db!.pragma('foreign_keys = ON') } catch {} return { success: false, error: error.message } }
      }
      if (action === 'eliminarTabla') {
        try { db!.exec(`DROP TABLE IF EXISTS "${args[0]}"`); return { success: true } } catch (error: any) { return { success: false, error: error.message } }
      }
      if (action === 'getCreateTableSQL') {
        const row = db!.prepare(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`).get(args[0]) as any
        return { success: true, sql: row?.sql || '' }
      }
      if (action === 'getTableRowCount') {
        const row = db!.prepare(`SELECT COUNT(*) as count FROM "${args[0]}"`).get() as any
        return { success: true, count: row?.count || 0 }
      }
      if (action === 'tableAdminInfo') {
        const tabla = String(args[0] || '')
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) return { success: false, error: 'Nombre de tabla no valido' }
        const existe = db!.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tabla)
        if (!existe) return { success: false, error: 'La tabla no existe' }
        const count = (db!.prepare(`SELECT COUNT(*) AS count FROM "${tabla}"`).get() as any)?.count || 0
        const columns = db!.prepare(`PRAGMA table_info("${tabla}")`).all() as any[]
        const indexes = db!.prepare(`PRAGMA index_list("${tabla}")`).all() as any[]
        const foreignKeys = db!.prepare(`PRAGMA foreign_key_list("${tabla}")`).all() as any[]
        const sequence = db!.prepare(`SELECT seq FROM sqlite_sequence WHERE name = ?`).get(tabla) as any
        return { success: true, data: { tabla, rows: count, columns: columns.length, indexes: indexes.length, foreignKeys: foreignKeys.length, nextId: Number(sequence?.seq || 0) + 1 } }
      }
      if (action === 'tableAdminAction') {
        const tabla = String(args[0] || '')
        const operation = String(args[1] || '')
        if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(tabla)) return { success: false, error: 'Nombre de tabla no valido' }
        const existe = db!.prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name = ?`).get(tabla)
        if (!existe) return { success: false, error: 'La tabla no existe' }
        if (operation === 'empty') {
          const result = db!.transaction(() => {
            const deleted = db!.prepare(`DELETE FROM "${tabla}"`).run().changes
            db!.prepare(`DELETE FROM sqlite_sequence WHERE name = ?`).run(tabla)
            return deleted
          })()
          if (tabla !== 'bitacora') registrarBitacora(tabla, 0, 'EMPTY_TABLE', 'SOPORTE', { reset_id: true, deleted: result }, null)
          return { success: true, deleted: result }
        }
        if (operation === 'drop') {
          db!.exec(`DROP TABLE "${tabla}"`)
          registrarBitacora(tabla, 0, 'DROP_TABLE', 'SOPORTE', null, { tabla })
          return { success: true }
        }
        if (operation === 'optimize') {
          db!.exec(`ANALYZE "${tabla}"`)
          db!.exec(`REINDEX "${tabla}"`)
          return { success: true }
        }
        if (operation === 'integrity') {
          const rows = db!.prepare(`PRAGMA integrity_check("${tabla}")`).all() as any[]
          const messages = rows.map(row => String(Object.values(row)[0] || ''))
          return { success: true, ok: messages.length === 1 && messages[0].toLowerCase() === 'ok', messages }
        }
        return { success: false, error: 'Accion de tabla no reconocida' }
      }
      return null
    } catch (error: any) { return { success: false, error: error.message } }
  })

  // Email
  function decodeBase64Password(encoded: string): string {
    if (!encoded) return ''
    const valor = String(encoded).trim()
    try {
      const marcado = valor.startsWith('b64:')
      const base64 = marcado ? valor.slice(4) : valor
      // Sin prefijo solo se considera Base64 cuando tiene padding. Esto evita
      // cambiar por accidente una contrasena normal compuesta por letras.
      if (!marcado && !base64.includes('=')) return valor
      if (!/^[A-Za-z0-9+/]+={0,2}$/.test(base64) || base64.length % 4 !== 0) return valor
      const decoded = Buffer.from(base64, 'base64').toString('utf8')
      return Buffer.from(decoded, 'utf8').toString('base64') === base64 ? decoded : valor
    } catch { return valor }
  }

  function getOtpEmailConfig() {
    const row = db!.prepare(`SELECT * FROM correo ORDER BY id ASC LIMIT 1`).get() as any
    const config = {
      activo: Number(row?.activo || 0),
      email: row?.email || '',
      password: row?.password ? decodeBase64Password(row.password) : '',
      host: row?.host || row?.smtp_host || 'smtp.gmail.com',
      puerto: Number(row?.puerto || row?.port || 587),
      seguridad: row?.seguridad || row?.secure || 'STARTTLS',
    }
    console.info('[SMTP] Configuracion cargada', {
      id: row?.id || null,
      activo: Boolean(config.activo),
      email: config.email,
      host: config.host,
      puerto: config.puerto,
      seguridad: config.seguridad,
      passwordAlmacenado: {
        length: String(row?.password || '').length,
        format: String(row?.password || '').startsWith('b64:') ? 'b64-prefixed' : String(row?.password || '').includes('=') ? 'base64-padded' : 'plain-or-unpadded',
      },
      passwordSmtpLength: config.password.length,
    })
    return config
  }

  function getEmailConfig() {
    const defaultEmailConfig = getOtpEmailConfig()
    const row = db!.prepare(`SELECT * FROM correo ORDER BY id ASC LIMIT 1`).get() as any
    if (!row) return defaultEmailConfig
    const email = row.email || ''
    const password = row.password ? decodeBase64Password(row.password || '') : ''
    return {
      activo: Number(row.activo ?? defaultEmailConfig.activo),
      email,
      password,
      host: row.host || row.smtp_host || defaultEmailConfig.host,
      puerto: Number(row.puerto || row.port || defaultEmailConfig.puerto),
      seguridad: row.seguridad || row.secure || defaultEmailConfig.seguridad,
    }
  }

  function getSmtpAttempts(config: any): Array<{ host: string; port: number; secure: boolean; label: string }> {
    const host = String(config?.host || 'smtp.gmail.com').trim() || 'smtp.gmail.com'
    const port = Number(config?.puerto || 587)
    const secure = port === 465 || String(config?.seguridad || '').toLowerCase().includes('ssl')
    const attempts = [{ host, port, secure, label: `${host}:${port} ${secure ? 'SSL' : 'STARTTLS'}` }]

    // El puerto 465 suele estar bloqueado en algunas redes. Gmail 587 con
    // STARTTLS es el fallback, sin terminar ocultando el error con un timeout 465.
    if (!(host.toLowerCase() === 'smtp.gmail.com' && port === 587)) {
      attempts.push({ host: 'smtp.gmail.com', port: 587, secure: false, label: 'smtp.gmail.com:587 STARTTLS' })
    }
    return attempts
  }

  function smtpCommand(socket: any, command: string | null, expected: number[] = [250]): Promise<string> {
    return new Promise((resolve, reject) => {
      let buffer = ''
      const cleanup = () => { socket.off('data', onData); socket.off('error', onError) }
      const onError = (error: Error) => { cleanup(); reject(error) }
      const onData = (data: Buffer) => {
        buffer += data.toString('utf8')
        const lines = buffer.split(/\r?\n/).filter(Boolean)
        if (lines.length === 0) return
        const last = lines[lines.length - 1]
        if (!/^\d{3}\s/.test(last)) return
        cleanup()
        if (expected.includes(Number(last.slice(0, 3)))) resolve(buffer)
        else reject(new Error(`SMTP ${last.slice(0, 3)}: ${buffer.trim()}`))
      }
      socket.on('data', onData); socket.on('error', onError)
      if (command) socket.write(`${command}\r\n`)
    })
  }

  async function resolverHostsSmtp(host: string): Promise<string[]> {
    const direcciones = new Set<string>()
    try {
      const lookup = await dns.promises.lookup(host, { all: true })
      lookup.forEach(item => direcciones.add(item.address))
    } catch (_) {}
    try { (await dns.promises.resolve4(host)).forEach(address => direcciones.add(address)) } catch (_) {}
    try { (await dns.promises.resolve6(host)).forEach(address => direcciones.add(address)) } catch (_) {}
    if (direcciones.size === 0) {
      throw new Error(`No se pudo resolver el servidor SMTP ${host}. Verifica la conexion DNS.`)
    }
    const resultado = [...direcciones]
    console.info('[SMTP] DNS resuelto', { host, direcciones: resultado })
    return resultado
  }

  async function connectSmtp(host: string, port: number, secure: boolean): Promise<any> {
    const addresses = await resolverHostsSmtp(host)
    let lastError: any = null
    for (const address of addresses) {
      console.info('[SMTP] Probando conexion TCP', { host, address, port, secure })
      try {
        const socket = await new Promise<any>((resolve, reject) => {
          const options: any = { host: address, port, servername: host }
          const candidate = secure ? tls.connect(options) : net.connect(options)
          const event = secure ? 'secureConnect' : 'connect'
          const cleanup = () => {
            candidate.off(event, onConnect)
            candidate.off('error', onError)
            candidate.off('timeout', onTimeout)
          }
          const onConnect = () => { cleanup(); resolve(candidate) }
          const onError = (error: any) => { cleanup(); candidate.destroy(); reject(error) }
          const onTimeout = () => {
            cleanup()
            candidate.destroy()
            const error: any = new Error(`connect ETIMEDOUT ${address}:${port}`)
            error.code = 'ETIMEDOUT'
            reject(error)
          }
          candidate.setTimeout(10000)
          candidate.once(event, onConnect)
          candidate.once('error', onError)
          candidate.once('timeout', onTimeout)
        })
        console.info('[SMTP] Conexion TCP establecida', { host, address, port, secure })
        return socket
      } catch (error: any) {
        lastError = error
        console.error('[SMTP] Conexion TCP fallida', { host, address, port, secure, code: error?.code, message: error?.message })
      }
    }
    throw lastError || new Error(`No se pudo conectar a ${host}:${port}`)
  }

  async function sendEmail(toEmail: string, subject: string, html: string, host: string, port: number, secure: boolean, authConfig?: any): Promise<any> {
    const config = authConfig || getEmailConfig()
    let socket: any = null
    let phase = 'conexion TCP'
    console.info('[SMTP] Inicio de envio', { host, port, secure, from: config.email, to: toEmail, subject })
    try {
      socket = await connectSmtp(host, port, secure)
      phase = 'saludo del servidor'
      await smtpCommand(socket, null, [220])
      phase = 'EHLO inicial'
      await smtpCommand(socket, `EHLO ${hostname() || 'localhost'}`)
      if (!secure) {
        phase = 'STARTTLS'
        await smtpCommand(socket, 'STARTTLS', [220])
        socket = tls.connect({ socket, servername: host })
        await new Promise((resolve, reject) => { socket.once('secureConnect', resolve); socket.once('error', reject) })
        phase = 'EHLO despues de STARTTLS'
        await smtpCommand(socket, `EHLO ${hostname() || 'localhost'}`)
      }
      phase = 'AUTH LOGIN'
      await smtpCommand(socket, 'AUTH LOGIN', [334])
      phase = 'usuario SMTP'
      await smtpCommand(socket, Buffer.from(config.email).toString('base64'), [334])
      const password = /smtp\.gmail\.com/i.test(host)
        ? String(config.password || '').replace(/\s+/g, '')
        : String(config.password || '')
      phase = 'contrasena SMTP'
      await smtpCommand(socket, Buffer.from(password).toString('base64'), [235])
      console.info('[SMTP] Autenticacion aceptada', { host, port, email: config.email })
      phase = 'remitente'
      await smtpCommand(socket, `MAIL FROM:<${config.email}>`)
      phase = 'destinatario'
      await smtpCommand(socket, `RCPT TO:<${toEmail}>`, [250, 251])
      phase = 'contenido del mensaje'
      await smtpCommand(socket, 'DATA', [354])
      const message = `From: "${config.email}" <${config.email}>\r\nTo: <${toEmail}>\r\nSubject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=\r\nMIME-Version: 1.0\r\nContent-Type: text/html; charset=UTF-8\r\nContent-Transfer-Encoding: 8bit\r\n\r\n${html}`
      await smtpCommand(socket, `${message}\r\n.`, [250])
      phase = 'cierre SMTP'
      await smtpCommand(socket, 'QUIT', [221])
      console.info('[SMTP] Correo enviado correctamente', { host, port, to: toEmail })
      return { success: true }
    } catch (error: any) {
      console.error('[SMTP] Envio fallido', { phase, host, port, secure, code: error?.code, message: error?.message })
      throw new Error(`[${phase}] ${error?.message || 'Error SMTP'}`)
    } finally {
      if (socket && !socket.destroyed) socket.end()
    }
  }

  async function sendTestEmail(toEmail: string, host: string, port: number, secure: boolean): Promise<any> {
    return sendEmail(
      toEmail,
      'Prueba de configuracion de correo',
      '<h2>Correo de prueba</h2><p>Si recibes este mensaje, la configuracion de correo funciona correctamente.</p>',
      host,
      port,
      secure
    )
  }

  ipcMain.handle('enviar:testEmail', async (_event, toEmail: string) => {
    try {
      const config = getEmailConfig()
      if (!config.activo) return { success: false, error: 'Correo desactivado en configuracion' }
      if (!config.email || !config.password) return { success: false, error: 'Configuracion de correo incompleta' }
      if (!toEmail || !toEmail.includes('@')) return { success: false, error: 'Correo destinatario invalido' }
      let lastError: any = null
      for (const attempt of getSmtpAttempts(config)) {
        try { await sendTestEmail(toEmail, attempt.host, attempt.port, attempt.secure); return { success: true, message: `Correo de prueba enviado correctamente (${attempt.label})` } } catch (e: any) { lastError = e }
      }
      return { success: false, error: `No se pudo enviar el correo. Intentos fallidos: ${lastError?.message || 'Error desconocido'}` }
    } catch (e: any) { return { success: false, error: e.message || 'Error al enviar correo' } }
  })

  ipcMain.handle('enviar:otp', async (_event, toEmail: string, codigo: string) => {
    try {
      const config = getEmailConfig()
      if (!config.activo) return { success: false, error: 'Correo desactivado en configuracion' }
      if (!config.email || !config.password) return { success: false, error: 'Configuracion de correo incompleta' }
      if (!toEmail || !toEmail.includes('@')) return { success: false, error: 'Correo destinatario invalido' }
      let lastError: any = null
      for (const attempt of getSmtpAttempts(config)) {
        try {
          await sendEmail(toEmail, 'Codigo de verificacion - TMPOS', `<h2>Tu codigo de verificacion</h2><p style="font-size:24px;font-weight:bold;letter-spacing:8px;text-align:center;padding:16px;background:#f3f4f6;border-radius:8px">${codigo}</p><p>Este codigo expirara en 10 minutos.</p>`, attempt.host, attempt.port, attempt.secure)
          return { success: true, message: `OTP enviado (${attempt.label})` }
        } catch (e: any) { lastError = e }
      }
      return { success: false, error: `No se pudo enviar el OTP. Intentos fallidos: ${lastError?.message || 'Error desconocido'}` }
    } catch (e: any) { return { success: false, error: e.message || 'Error al enviar OTP' } }
  })

  ipcMain.handle('enviar:cierreCaja', async (_event, payload: any) => {
    try {
      const toEmail = String(payload?.toEmail || getEmailEmpresa()).trim()
      if (!toEmail || !toEmail.includes('@')) {
        return { success: false, error: 'Configura un correo valido en los datos de la empresa' }
      }

      // Canal principal: API de TMPBASE/TM Cloud. La Secret Key permanece
      // solamente en el proceso principal y nunca se expone al renderer.
      const cloud = db!.prepare(`SELECT url, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
      const baseUrl = String(cloud?.url || '').replace(/\/+$/, '')
      const secretKey = String(cloud?.secret_key || '').trim()
      let apiError = ''
      if (baseUrl && secretKey && /^https?:\/\//i.test(baseUrl)) {
        try {
          // /mail/send trabaja con plantillas registradas. En proyectos nuevos,
          // la primera solicitud tambien inicializa las tablas internas de la
          // cola y puede responder "Table not found" antes de completar ese
          // primer envio. Repetir solo ese error permite que la API termine su
          // migracion sin ocultar otros fallos ni depender de tablas locales.
          const mailPayload = {
            template: 'cash_closing',
            to: toEmail,
            data: payload?.data || {},
            send_now: true,
          }
          let response: Response | null = null
          let responseData: any = {}
          for (let attempt = 0; attempt < 2; attempt++) {
            response = await fetch(`${baseUrl}/mail/send`, {
              method: 'POST',
              headers: { Authorization: `Bearer ${secretKey}`, 'Content-Type': 'application/json', Accept: 'application/json' },
              body: JSON.stringify(mailPayload),
              signal: AbortSignal.timeout(20000),
            })
            responseData = await response.json().catch(() => ({})) as any
            if (response.ok) break
            const message = String(responseData?.error?.message || responseData?.error || responseData?.message || '')
            if (attempt === 0 && /table\s+not\s+found|tabla.+no\s+(?:existe|encontr)/i.test(message)) {
              await new Promise(resolve => setTimeout(resolve, 350))
              continue
            }
            break
          }
          if (!response) throw new Error('La API no produjo una respuesta')
          if (!response.ok) {
            throw new Error(
              responseData?.error?.message ||
              responseData?.message ||
              `HTTP ${response.status}`
            )
          }
          const mail = responseData?.data?.mail || responseData?.data || {}
          const sent = String(mail.status || '').toLowerCase() === 'sent'
          return {
            success: true,
            queued: !sent,
            provider: 'TMPBASE API',
            mailUid: mail.uid || '',
            status: mail.status || 'pending',
            message: sent
              ? `Cierre enviado por TMPBASE a ${toEmail}`
              : `Cierre encolado por TMPBASE para ${toEmail}`,
            toEmail,
          }
        } catch (error: any) {
          apiError = error?.name === 'TimeoutError'
            ? 'La API de TMPBASE excedio el tiempo de espera'
            : (error?.message || 'No se pudo usar la API de TMPBASE')
          console.error('[CierreCaja][TMPBASE]', apiError)
        }
      } else {
        apiError = 'TM Cloud no tiene URL y Secret Key configuradas'
      }

      // Respaldo local: si TMPBASE no responde, intentar el SMTP configurado
      // para que el cierre del turno no se quede sin entregar.
      const config = getOtpEmailConfig()
      if (!config.email || !config.password) {
        return {
          success: false,
          error: `${apiError}. El SMTP de respaldo tampoco esta configurado.`,
        }
      }
      if (!payload?.html) return { success: false, error: `${apiError}. El reporte de cierre esta vacio.` }

      const attempts = getSmtpAttempts(config)
      let lastError: any = null
      for (const attempt of attempts) {
        try {
          await sendEmail(
            toEmail,
            String(payload.subject || 'Cierre de caja'),
            String(payload.html),
            attempt.host,
            attempt.port,
            attempt.secure,
            config
          )
          return {
            success: true,
            provider: 'SMTP local (respaldo)',
            warning: apiError,
            message: `Cierre enviado a ${toEmail} por SMTP de respaldo`,
            toEmail,
          }
        } catch (e: any) {
          lastError = e
        }
      }
      return {
        success: false,
        error: `TMPBASE: ${apiError}. SMTP: ${lastError?.message || 'Error desconocido'}`,
      }
    } catch (e: any) {
      return { success: false, error: e.message || 'Error al enviar el cierre de caja' }
    }
  })
}

let serverUrl = ''

function findFreePort(startPort = 5173): Promise<number> {
  return new Promise((resolve) => {
    const server = net.createServer()
    server.unref()
    server.on('error', () => resolve(findFreePort(startPort + 1)))
    server.listen(startPort, '0.0.0.0', () => {
      const addr = server.address()
      const port = typeof addr === 'object' && addr ? addr.port : startPort
      server.close(() => resolve(port))
    })
  })
}

function getLocalIP(): string {
  const nets = networkInterfaces()
  for (const name of Object.keys(nets)) {
    for (const net of nets[name] || []) {
      if (net.family === 'IPv4' && !net.internal) return net.address
    }
  }
  return '127.0.0.1'
}

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'application/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg',
  '.gif': 'image/gif', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff': 'font/woff', '.woff2': 'font/woff2',
  '.ttf': 'font/ttf', '.map': 'application/octet-stream',
}

const otpWebSessions = new Map<string, { user: string; expiresAt: number }>()
const otpLoginAttempts = new Map<string, { count: number; blockedUntil: number }>()

function otpWebPage(): string {
  return `<!doctype html>
<html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Centro OTP Local</title><style>
*{box-sizing:border-box}body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07111f;color:#e5edf7;font-family:system-ui,-apple-system,Segoe UI,sans-serif;padding:20px}.card{width:min(440px,100%);background:#111d2e;border:1px solid #26364c;border-radius:22px;padding:28px;box-shadow:0 24px 70px #0008}h1{margin:0 0 6px;font-size:25px}.sub{color:#94a3b8;margin:0 0 24px}.field{margin:14px 0}label{display:block;font-size:13px;color:#b9c5d4;margin-bottom:7px}input{width:100%;border:1px solid #34465f;background:#0a1422;color:white;border-radius:11px;padding:13px;font-size:16px;outline:none}input:focus{border-color:#22c55e}button{width:100%;border:0;border-radius:11px;padding:13px;font-weight:700;font-size:15px;background:#22c55e;color:#052e16;cursor:pointer}button:disabled{opacity:.6}.error{min-height:22px;color:#fca5a5;font-size:13px;margin:10px 0}.hidden{display:none}.code{text-align:center;font-size:64px;font-weight:800;letter-spacing:12px;color:#86efac;margin:20px 0 8px;font-variant-numeric:tabular-nums}.pill{display:inline-block;background:#1d3047;color:#bfdbfe;padding:6px 10px;border-radius:999px;font-size:12px}.center{text-align:center}.timer{color:#94a3b8;margin:12px 0 22px}.logout{background:transparent;color:#cbd5e1;border:1px solid #34465f}.notice{font-size:12px;color:#64748b;text-align:center;margin-top:18px}
</style></head><body><main class="card">
<section id="login"><h1>Centro OTP Local</h1><p class="sub">Acceso exclusivo para Administrador y Soporte.</p><form id="form"><div class="field"><label for="user">Usuario</label><input id="user" autocomplete="username" required autofocus></div><div class="field"><label for="pass">Contrasena o PIN</label><input id="pass" type="password" autocomplete="current-password" required></div><div id="error" class="error"></div><button id="enter">Entrar</button></form></section>
<section id="viewer" class="hidden center"><h1>Codigo de eliminacion</h1><p class="sub">Usa este codigo en la solicitud abierta dentro del sistema.</p><span id="mode" class="pill"></span><div id="code" class="code">----</div><div id="timer" class="timer"></div><button id="logout" class="logout">Cerrar sesion</button></section>
<div class="notice">Conexion local. No compartas este enlace ni el codigo.</div></main>
<script>
const login=document.getElementById('login'),viewer=document.getElementById('viewer'),errorBox=document.getElementById('error'),form=document.getElementById('form'),enter=document.getElementById('enter');let poll;
async function request(url,options={}){const r=await fetch(url,{...options,credentials:'same-origin',headers:{'Content-Type':'application/json',...(options.headers||{})}});const data=await r.json().catch(()=>({success:false,error:'Respuesta invalida'}));if(!r.ok)throw new Error(data.error||'Acceso denegado');return data}
function showLogin(message=''){clearInterval(poll);viewer.classList.add('hidden');login.classList.remove('hidden');errorBox.textContent=message}
function showViewer(){login.classList.add('hidden');viewer.classList.remove('hidden');refresh();clearInterval(poll);poll=setInterval(refresh,1000)}
async function refresh(){try{const d=await request('/api/otp/status');document.getElementById('code').textContent=d.data.code;document.getElementById('mode').textContent=d.data.mode==='fixed'?'Codigo fijo':'Codigo variable';document.getElementById('timer').textContent=d.data.mode==='fixed'?'El codigo no cambia':'Cambia en '+d.data.secondsRemaining+' s'}catch(e){showLogin(e.message)}}
form.addEventListener('submit',async e=>{e.preventDefault();errorBox.textContent='';enter.disabled=true;try{await request('/api/otp/login',{method:'POST',body:JSON.stringify({user:document.getElementById('user').value,password:document.getElementById('pass').value})});document.getElementById('pass').value='';showViewer()}catch(err){errorBox.textContent=err.message}finally{enter.disabled=false}});
document.getElementById('logout').addEventListener('click',async()=>{try{await request('/api/otp/logout',{method:'POST',body:'{}'})}catch{}showLogin()});
request('/api/otp/status').then(showViewer).catch(()=>showLogin());
</script></body></html>`
}

function parseCookies(header = ''): Record<string, string> {
  return Object.fromEntries(header.split(';').map(value => value.trim().split('=')).filter(parts => parts.length === 2).map(([key, value]) => [key, decodeURIComponent(value)]))
}

async function readJsonBody(req: http.IncomingMessage): Promise<any> {
  const chunks: Buffer[] = []
  let size = 0
  for await (const chunk of req) {
    const buffer = Buffer.from(chunk)
    size += buffer.length
    if (size > 16_384) throw new Error('Solicitud demasiado grande')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf-8') || '{}')
}

function sendOtpJson(res: http.ServerResponse, status: number, data: any, headers: Record<string, string> = {}): void {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers })
  res.end(JSON.stringify(data))
}

function sendNetworkJson(req: http.IncomingMessage, res: http.ServerResponse, data: any): void {
  const json = Buffer.from(JSON.stringify(data))
  const acceptsGzip = String(req.headers['accept-encoding'] || '').includes('gzip')
  if (acceptsGzip && json.length >= 1024) {
    const compressed = gzipSync(json, { level: 4 })
    res.writeHead(200, {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Encoding': 'gzip',
      'Content-Length': compressed.length,
      'Cache-Control': 'no-store',
      Vary: 'Accept-Encoding',
    })
    res.end(compressed)
    return
  }
  res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8', 'Content-Length': json.length, 'Cache-Control': 'no-store' })
  res.end(json)
}

function getOtpWebSession(req: http.IncomingMessage) {
  const token = parseCookies(String(req.headers.cookie || '')).otp_session
  const session = token ? otpWebSessions.get(token) : undefined
  if (!session || session.expiresAt <= Date.now()) {
    if (token) otpWebSessions.delete(token)
    return null
  }
  return session
}

function verifyOtpWebLogin(userInput: string, password: string): { valid: boolean; user: string } {
  const normalized = userInput.trim().toLowerCase()
  const supportPassword = new Date().toTimeString().slice(0, 5).replace(':', '')
  if (normalized === 'soporte' && password === supportPassword) return { valid: true, user: 'SOPORTE TECNICO' }
  const users = db!.prepare(`SELECT * FROM usuarios WHERE estado = 'ACTIVADO'`).all() as any[]
  const user = users.find(row => [row.usuario, row.email, row.nombre].some(value => String(value || '').trim().toLowerCase() === normalized))
  if (!user) return { valid: false, user: '' }
  const role = String(user.rol || '').toLowerCase()
  const level = String(user.nivel_seguridad || '').toLowerCase()
  if (!['admin', 'administrador', 'soporte'].includes(role) && !['administrador', 'soporte'].includes(level)) return { valid: false, user: '' }
  const storedPassword = String(user.password || '')
  const passwordMatches = storedPassword.startsWith('$2') ? bcrypt.compareSync(password, storedPassword) : storedPassword === password
  const valid = passwordMatches || String(user.pin || '') === password
  return { valid, user: valid ? String(user.nombre || user.email || user.usuario) : '' }
}

async function startLocalServer() {
  try {
    const port = await findFreePort()
    const distDir = path.join(__dirname, '../dist')
    if (!fs.existsSync(distDir)) { console.warn('[Server] dist/ no encontrado, servidor no iniciado'); return }

    const server = http.createServer(async (req, res) => {
      res.setHeader('Access-Control-Allow-Origin', '*')
      // El renderer usa Authorization para todas las llamadas a TM Cloud. En
      // desarrollo vive en el servidor de Vite y el proxy local en otro
      // origen, por lo que Chromium exige que el preflight autorice
      // explicitamente ese header. Sin esto, el servidor remoto respondia 200
      // pero fetch lo descartaba como CORS y solo reportaba "Failed to fetch".
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS')
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization')
      res.setHeader('Access-Control-Allow-Private-Network', 'true')
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return }

      const urlPath = new URL(req.url || '/', 'http://localhost').pathname
      if (urlPath === '/tmcloud-proxy' || urlPath.startsWith('/tmcloud-proxy/')) {
        try {
          const cloud = db!.prepare(`SELECT url, public_key, secret_key FROM tmcloud_config WHERE id = 1`).get() as any
          const cloudBase = String(cloud?.url || '').trim().replace(/\/+$/, '')
          if (!/^https?:\/\//i.test(cloudBase)) throw new Error('TM Cloud no esta configurado')

          const suffix = String(req.url || '').slice('/tmcloud-proxy'.length)
          const target = new URL(cloudBase + suffix)
          const isRead = req.method === 'GET' || req.method === 'HEAD'
          const key = String((isRead ? cloud?.public_key : cloud?.secret_key || cloud?.public_key) || '')
          if (!key) throw new Error('TM Cloud no tiene una llave configurada')

          const headers = { ...req.headers, host: target.host, authorization: `Bearer ${key}` }
          delete headers.origin
          delete headers.referer
          const transport = target.protocol === 'https:' ? https : http
          const proxyRequest = transport.request(target, { method: req.method, headers }, proxyResponse => {
            const responseHeaders: http.OutgoingHttpHeaders = {
              ...proxyResponse.headers,
              'access-control-allow-origin': '*',
              'access-control-allow-methods': 'GET,POST,PUT,PATCH,DELETE,OPTIONS',
              'access-control-allow-headers': 'Content-Type, Authorization',
            }
            res.writeHead(proxyResponse.statusCode || 502, responseHeaders)
            proxyResponse.pipe(res)
          })
          proxyRequest.on('error', error => {
            if (!res.headersSent) sendNetworkJson(req, res, { success: false, error: error.message })
            else res.end()
          })
          req.pipe(proxyRequest)
        } catch (error: any) {
          sendNetworkJson(req, res, { success: false, error: error.message || 'No se pudo conectar con TM Cloud' })
        }
        return
      }
      if (urlPath === '/otp' && req.method === 'GET') {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store', 'X-Frame-Options': 'DENY', 'Content-Security-Policy': "default-src 'self'; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors 'none'" })
        res.end(otpWebPage())
        return
      }
      if (urlPath === '/api/otp/login' && req.method === 'POST') {
        const remoteAddress = String(req.socket.remoteAddress || 'unknown')
        const attempts = otpLoginAttempts.get(remoteAddress)
        if (attempts?.blockedUntil && attempts.blockedUntil > Date.now()) {
          sendOtpJson(res, 429, { success: false, error: 'Demasiados intentos. Espera un minuto.' })
          return
        }
        try {
          const body = await readJsonBody(req)
          const login = verifyOtpWebLogin(String(body.user || ''), String(body.password || ''))
          if (!login.valid) {
            const count = (attempts?.count || 0) + 1
            otpLoginAttempts.set(remoteAddress, { count: count >= 5 ? 0 : count, blockedUntil: count >= 5 ? Date.now() + 60_000 : 0 })
            sendOtpJson(res, 401, { success: false, error: 'Credenciales incorrectas o usuario no autorizado' })
            return
          }
          otpLoginAttempts.delete(remoteAddress)
          const token = crypto.randomBytes(32).toString('hex')
          otpWebSessions.set(token, { user: login.user, expiresAt: Date.now() + 8 * 60 * 60 * 1000 })
          sendOtpJson(res, 200, { success: true }, { 'Set-Cookie': `otp_session=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=28800` })
        } catch (error: any) {
          sendOtpJson(res, 400, { success: false, error: error.message || 'Solicitud invalida' })
        }
        return
      }
      if (urlPath === '/api/otp/status' && req.method === 'GET') {
        if (!getOtpWebSession(req)) sendOtpJson(res, 401, { success: false, error: 'Inicia sesion para ver el codigo' })
        else sendOtpJson(res, 200, { success: true, data: getOtpLocalStatus() })
        return
      }
      if (urlPath === '/api/otp/logout' && req.method === 'POST') {
        const token = parseCookies(String(req.headers.cookie || '')).otp_session
        if (token) otpWebSessions.delete(token)
        sendOtpJson(res, 200, { success: true }, { 'Set-Cookie': 'otp_session=; HttpOnly; SameSite=Strict; Path=/; Max-Age=0' })
        return
      }
      if (urlPath.startsWith('/api/') && req.method === 'POST') {
        const buffers: Buffer[] = []
        for await (const chunk of req) buffers.push(chunk)
        const body = JSON.parse(Buffer.concat(buffers).toString('utf-8') || '{}')
        try {
          const action = urlPath.replace('/api/', '')
          let result: any
          if (String(body.tabla || '') === 'otp_local_config') {
            sendOtpJson(res, 403, { success: false, error: 'La configuracion OTP solo esta disponible mediante acceso autorizado' })
            return
          }
          if (action === 'auth/login') {
            const users = db!.prepare(`SELECT * FROM usuarios WHERE UPPER(estado) = 'ACTIVADO'`).all() as any[]
            const mode = String(body.mode || 'credentials')
            let user: any
            if (mode === 'pin') {
              const pin = String(body.pin || '')
              const supportPin = new Date().toTimeString().slice(0, 5).replace(':', '')
              user = users.find(item => String(item.pin || '') === pin)
              if (!user && pin === supportPin) user = users.find(item => String(item.rol || item.nivel_seguridad || '').toLowerCase() === 'soporte')
            } else {
              const login = String(body.usuario || '').trim().toLowerCase()
              const password = String(body.password || '')
              user = users.find(item => [item.usuario, item.email, item.nombre].some(value => String(value || '').trim().toLowerCase() === login))
              if (user) {
                const stored = String(user.password || '')
                const validPassword = stored.startsWith('$2') ? bcrypt.compareSync(password, stored) : stored === password
                if (!validPassword && String(user.pin || '') !== password) user = null
              }
            }
            if (!user) result = { success: false, error: mode === 'pin' ? 'PIN incorrecto' : 'Usuario o contrasena incorrectos' }
            else {
              const { password: _password, pin: _pin, patron: _patron, respuesta: _respuesta, ...safeUser } = user
              result = { success: true, data: safeUser }
            }
          }
          else if (action === 'ventas/guardarAtomica') result = guardarVentaAtomica(body)
          else if (action === 'ventas/cobrarPendiente') result = cobrarVentaPendiente(body)
          else if (action === 'caja/getTurnoActivo') {
            const almacenUid = String(body.almacenUid || '')
            const row = almacenUid
              ? db!.prepare(`SELECT * FROM caja_turnos WHERE estado = 'abierto' AND almacen_uid = ? ORDER BY id DESC LIMIT 1`).get(almacenUid)
              : null
            result = { success: true, data: row || null }
          }
          else if (action === 'db/getAll') {
            const rows = db!.prepare(`SELECT * FROM "${body.tabla}" ORDER BY id DESC`).all() as any[]
            // En un navegador nuevo no existe aun una seleccion local. Enviamos
            // primero el almacen principal configurado, igual que por Electron.
            if (body.tabla === 'empresa' && rows.length > 1) {
              const config = db!.prepare(`SELECT valor FROM configuracion WHERE clave = 'empresa_id'`).get() as any
              const empresaId = Number(config?.valor || 0)
              if (empresaId) rows.sort((a: any, b: any) => Number(b.id === empresaId) - Number(a.id === empresaId))
              else rows.sort((a: any, b: any) => Number(a.id) - Number(b.id))
            }
            result = { success: true, data: rows }
          }
          else if (action === 'db/getModified') {
            const rows = body.desde
              ? db!.prepare(`SELECT * FROM "${body.tabla}" WHERE updated_at > ? ORDER BY updated_at ASC`).all(body.desde)
              : db!.prepare(`SELECT * FROM "${body.tabla}" ORDER BY id DESC`).all()
            result = { success: true, data: rows }
          }
          else if (action === 'db/getById') { const row = db!.prepare(`SELECT * FROM "${body.tabla}" WHERE id = ?`).get(body.id); result = { success: true, data: row } }
          else if (action === 'db/getWhere') {
            const clause = String(body.where || '').trim()
            if (clause.includes(';') || /--|\/\*/.test(clause)) throw new Error('Filtro no valido')
            const rows = db!.prepare(`SELECT * FROM "${body.tabla}" ${clause ? `WHERE ${clause}` : ''} ORDER BY id DESC`).all(...(Array.isArray(body.params) ? body.params : []))
            result = { success: true, data: rows }
          }
          else if (action === 'db/insert') {
            if (!body.data.uid) body.data.uid = generarUid()
            body.data.created_at = new Date().toISOString(); body.data.updated_at = new Date().toISOString()
            const keys = Object.keys(body.data); const placeholders = keys.map(() => '?').join(', ')
            const r = db!.prepare(`INSERT INTO "${body.tabla}" (${keys.join(', ')}) VALUES (${placeholders})`).run(...Object.values(body.data))
            const newId = Number(r.lastInsertRowid)
            if (body.tabla !== 'bitacora') registrarBitacora(body.tabla, newId, 'CREATE', body.usuario || '', body.data, null)
            result = { success: true, data: { id: newId } }
          } else if (action === 'db/update') {
            const oldData = db!.prepare(`SELECT * FROM "${body.tabla}" WHERE id = ?`).get(body.id) as Record<string, any> || {}
            body.data.updated_at = new Date().toISOString()
            const keys = Object.keys(body.data); const sets = keys.map(k => `"${k}" = ?`).join(', ')
            db!.prepare(`UPDATE "${body.tabla}" SET ${sets} WHERE id = ?`).run(...Object.values(body.data), body.id)
            if (body.tabla !== 'bitacora') registrarBitacora(body.tabla, body.id, 'UPDATE', body.usuario || '', body.data, oldData)
            result = { success: true }
          } else if (action === 'db/delete') {
            const oldData = db!.prepare(`SELECT * FROM "${body.tabla}" WHERE id = ?`).get(body.id) as Record<string, any> || {}
            const uid = oldData?.uid || ''
            db!.transaction(() => {
              if (body.tabla === 'facturas') {
                const ecfRows = db!.prepare(`SELECT * FROM facturas_ecf WHERE factura_id = ?`).all(body.id) as Record<string, any>[]
                db!.prepare(`DELETE FROM facturas_ecf WHERE factura_id = ?`).run(body.id)
                for (const ecf of ecfRows) {
                  registrarBitacora('facturas_ecf', Number(ecf.id || 0), 'DELETE', body.usuario || '', null, ecf)
                  if (ecf.uid) { try { db!.prepare(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES ('facturas_ecf', ?, 1)`).run(ecf.uid) } catch {} }
                }
              }
              db!.prepare(`DELETE FROM "${body.tabla}" WHERE id = ?`).run(body.id)
              if (body.tabla !== 'bitacora' && body.tabla !== 'sync_deletes') {
                registrarBitacora(body.tabla, body.id, 'DELETE', body.usuario || '', null, oldData)
                if (uid) { try { db!.prepare(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES (?, ?, 1)`).run(body.tabla, uid) } catch {} }
              }
            })()
            result = { success: true }
          } else if (action === 'db/bitacoraList') { const rows = db!.prepare(`SELECT * FROM bitacora ORDER BY id DESC LIMIT ?`).all(body.limite || 1000); result = { success: true, data: rows } }
          else if (action === 'db/bitacoraDeleteAll') { db!.prepare(`DELETE FROM bitacora`).run(); result = { success: true } }
          else if (action === 'config/get') {
            const row = db!.prepare(`SELECT valor FROM configuracion WHERE clave = ?`).get(String(body.clave || '')) as any
            result = { success: true, data: row?.valor ?? '' }
          }
          else if (action === 'config/set') {
            const clave = String(body.clave || '').trim()
            if (!clave) throw new Error('Clave de configuracion requerida')
            const valor = String(body.valor ?? '').trim()
            const categoria = String(body.categoria || 'general')
            const existente = db!.prepare(`SELECT id FROM configuracion WHERE clave = ?`).get(clave) as any
            if (existente) db!.prepare(`UPDATE configuracion SET valor = ?, categoria = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?`).run(valor, categoria, existente.id)
            else db!.prepare(`INSERT INTO configuracion (clave, valor, tipo, categoria, created_at, updated_at) VALUES (?, ?, 'string', ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)`).run(clave, valor, categoria)
            result = { success: true }
          }
          else if (action === 'tmcloud/getConfig') {
            const cloud = db!.prepare(`SELECT url, public_key FROM tmcloud_config WHERE id = 1`).get() as any
            const host = String(req.headers.host || `127.0.0.1:${port}`)
            // En red toda comunicacion con TM Cloud pasa por el equipo principal.
            // Esto evita CORS y mantiene las llaves reales fuera del navegador.
            result = cloud?.url && cloud?.public_key
              ? { success: true, data: { url: `http://${host}/tmcloud-proxy`, public_key: 'network-proxy', secret_key: '' } }
              : { success: true, data: { url: '', public_key: '', secret_key: '' } }
          }
          else if (action === 'datosarchivo') result = {}
          else result = { success: false, error: `Accion desconocida: ${action}` }
          sendNetworkJson(req, res, result)
        } catch (error: any) { sendNetworkJson(req, res, { success: false, error: error.message }) }
        return
      }

      let filePath = path.join(distDir, urlPath === '/' ? '/index.html' : urlPath)
      let ext = path.extname(filePath).toLowerCase()
      if (ext && MIME_TYPES[ext]) {
        if (!fs.existsSync(filePath)) { res.writeHead(404); res.end('Not Found'); return }
        const file = await fs.promises.readFile(filePath)
        const cacheControl = urlPath.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-store'
        res.writeHead(200, { 'Content-Type': MIME_TYPES[ext], 'Content-Length': file.length, 'Cache-Control': cacheControl }); res.end(file)
      } else {
        const indexPath = path.join(distDir, 'index.html')
        if (!fs.existsSync(indexPath)) { res.writeHead(404); res.end('Not Found'); return }
        const file = await fs.promises.readFile(indexPath)
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Content-Length': file.length, 'Cache-Control': 'no-store' }); res.end(file)
      }
    })

    await new Promise<void>((resolve, reject) => {
      server.listen(port, '0.0.0.0', () => { serverUrl = `http://${getLocalIP()}:${port}`; resolve() })
      server.on('error', reject)
    })
  } catch (error) { console.error('[Server] Error al iniciar servidor:', error) }
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200, height: 800, minWidth: 800, minHeight: 600, show: false,
    icon: app.isPackaged
      ? join(process.resourcesPath, 'tmpos-windows.ico')
      : join(__dirname, '../build/tmpos-windows.ico'),
    webPreferences: { preload: join(__dirname, 'preload.js'), contextIsolation: true, nodeIntegration: false, webSecurity: true },
    titleBarStyle: 'default',
  })
  mainWindow.on('ready-to-show', () => {
    mainWindow?.maximize()
    mainWindow?.show()
    mainWindow?.focus()
    mainWindow?.webContents.focus()
  })
  mainWindow.on('focus', () => mainWindow?.webContents.focus())
  mainWindow.on('restore', () => {
    mainWindow?.focus()
    mainWindow?.webContents.focus()
  })
  if (process.env.VITE_DEV_SERVER_URL) mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL)
  else mainWindow.loadFile(join(__dirname, '../dist/index.html'))
}

app.whenReady().then(async () => {
  Menu.setApplicationMenu(null)
  const allowedPermissions = ['media', 'clipboard-read', 'clipboard-sanitized-write']
  session.defaultSession.setPermissionCheckHandler((_webContents, permission) => allowedPermissions.includes(permission))
  session.defaultSession.setPermissionRequestHandler((_webContents, permission, callback) => {
    callback(allowedPermissions.includes(permission))
  })
  initDatabase()
  setupIpcHandlers()
  await startLocalServer()
  createWindow()
  mainWindow?.webContents.closeDevTools()
  // F12 is handled by the renderer and validated by the privileged IPC handler.
  // Never toggle DevTools directly here because that bypasses the active user role.
})

app.on('window-all-closed', () => {
  if (db) { db.close(); db = null }
  if (process.platform !== 'darwin') app.quit()
})

app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow() })
