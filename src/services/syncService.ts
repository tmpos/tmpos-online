import * as sb from './supabaseClient'

const SYNC_TABLES = [
  'usuarios', 'empresa', 'clientes', 'proveedores', 'categorias', 'marcas',
  'accesorios', 'telefonos', 'imei', 'electrodomesticos', 'serial',
  'facturas', 'piezas', 'tecnicos', 'ordenes_taller',
  'gastos', 'gastos_fijos', 'impresoras_config', 'cuentas_cobrar',
  'cuentas_pagar', 'comprobantes_fiscales', 'notas', 'plantillas_etiquetas',
]

let intervalId: ReturnType<typeof setInterval> | null = null
let onStatusChange: ((status: SyncStatus) => void) | null = null
let currentMode: SyncMode = 'ambos'

export type SyncMode = 'offline' | 'online' | 'ambos'

export interface SyncStatus {
  running: boolean
  tabla?: string
  progreso?: string
  error?: string
  lastSync?: string
  mode?: SyncMode
  result?: SyncResult
}

export interface SyncResult {
  success: boolean
  inserts: number
  updates: number
  errors: number
  message: string
}

function notificar(status: SyncStatus) {
  if (onStatusChange) onStatusChange(status)
}

export function setStatusCallback(cb: (status: SyncStatus) => void) {
  onStatusChange = cb
}

export function setSyncMode(mode: SyncMode) {
  currentMode = mode
}

export function getSyncMode(): SyncMode {
  return currentMode
}

async function getConfigValue(clave: string): Promise<string> {
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      return res.data.find((r: any) => r.clave === clave)?.valor || ''
    }
  } catch {}
  return ''
}

function nowISO(): string {
  return new Date().toISOString()
}

// ========== ULTIMO SYNC ==========
async function getLastSync(): Promise<string> {
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const row = res.data.find((r: any) => r.clave === 'ultimo_sync')
      return row?.valor || ''
    }
  } catch {}
  return ''
}

async function setLastSync() {
  const now = nowISO()
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const row = res.data.find((r: any) => r.clave === 'ultimo_sync')
      if (row) await (window as any).db.update('configuracion', row.id, { valor: now })
      else await (window as any).db.insert('configuracion', { clave: 'ultimo_sync', valor: now })
    }
  } catch {}
}

// ========== FETCH DIRECTO A SUPABASE ==========
function getCloudApi(): { url: string; key: string } | null {
  const cfg = sb.getConfig()
  if (!cfg) return null
  const base = cfg.url.replace(/\/+$/, '')
  return { url: `${base}/rest/v1`, key: cfg.serviceRole || cfg.anonKey }
}

async function ensureCloudApi(): Promise<{ url: string; key: string } | null> {
  const current = getCloudApi()
  if (current) return current

  const cfg = await sb.loadConfig()
  if (!cfg.url || !cfg.anonKey) return null

  sb.init({
    url: cfg.url.trim(),
    anonKey: cfg.anonKey.trim(),
    serviceRole: cfg.serviceRole?.trim() || undefined,
  })

  return getCloudApi()
}

async function fetchFromCloud(path: string): Promise<{ data: any; error: string | null }> {
  const api = await ensureCloudApi()
  if (!api) return { data: null, error: 'No client' }
  try {
    const res = await fetch(`${api.url}/${path}`, {
      headers: { 'apikey': api.key, 'Authorization': `Bearer ${api.key}` },
    })
    if (res.status === 404) return { data: null, error: 'NOT_FOUND' }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 180) || res.statusText}` }
    }
    return { data: await res.json(), error: null }
  } catch (e: any) {
    return { data: null, error: e.message }
  }
}

async function postToCloud(path: string, body: any): Promise<{ data: any; error: string | null }> {
  const api = await ensureCloudApi()
  if (!api) return { data: null, error: 'No client' }
  try {
    const res = await fetch(`${api.url}/${path}`, {
      method: 'POST',
      headers: { 'apikey': api.key, 'Authorization': `Bearer ${api.key}`, 'Content-Type': 'application/json', 'Prefer': 'return=representation' },
      body: JSON.stringify(body),
    })
    if (res.status === 404) return { data: null, error: 'NOT_FOUND' }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 180) || res.statusText}` }
    }
    return { data: await res.json(), error: null }
  } catch (e: any) {
    return { data: null, error: e.message }
  }
}

async function patchToCloud(path: string, body: any): Promise<{ data: any; error: string | null }> {
  const api = await ensureCloudApi()
  if (!api) return { data: null, error: 'No client' }
  try {
    const res = await fetch(`${api.url}/${path}`, {
      method: 'PATCH',
      headers: { 'apikey': api.key, 'Authorization': `Bearer ${api.key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.status === 404) return { data: null, error: 'NOT_FOUND' }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      console.warn('[PATCH Error]', path, res.status, text.slice(0, 200))
      return { data: null, error: `HTTP ${res.status}: ${text.slice(0, 180) || res.statusText}` }
    }
    return { data: true, error: null }
  } catch (e: any) {
    return { data: null, error: e.message }
  }
}

// ========== GENERAR SQL MIGRACION ==========
function sqliteTypeToPostgres(type: string): string {
  const t = type.toUpperCase()
  if (t.includes('INT')) return 'BIGINT'
  if (t.includes('REAL') || t.includes('FLOAT') || t.includes('DOUBLE') || t.includes('NUMERIC')) return 'DOUBLE PRECISION'
  return 'TEXT'
}

export async function getCreateTableSQL(tabla: string): Promise<string> {
  try {
    const res = await (window as any).electron.invoke('consultaservidor', 'getTableColumns', tabla)
    if (!Array.isArray(res)) return ''
    const lines = [`CREATE TABLE IF NOT EXISTS ${tabla} (`]
    const cols: string[] = []
    const addedNames = new Set<string>()
    for (const col of res) {
      const colName = (col.name || '').toLowerCase()
      if (colName === 'id') { cols.push('  id BIGINT PRIMARY KEY GENERATED BY DEFAULT AS IDENTITY'); addedNames.add('id'); continue }
      // Forzar created_at y updated_at a TIMESTAMPTZ para que el trigger funcione
      if (colName === 'created_at') { cols.push('  created_at TIMESTAMPTZ DEFAULT NOW()'); addedNames.add('created_at'); continue }
      if (colName === 'updated_at') { cols.push('  updated_at TIMESTAMPTZ DEFAULT NOW()'); addedNames.add('updated_at'); continue }
      const pgType = sqliteTypeToPostgres(col.type || 'TEXT')
      const nullable = col.notnull ? 'NOT NULL' : ''
      const def = col.dflt_value ? `DEFAULT ${col.dflt_value}` : ''
      cols.push(`  ${colName} ${pgType} ${nullable} ${def}`.trim())
      addedNames.add(colName)
    }
    if (!addedNames.has('uid')) cols.push('  uid TEXT DEFAULT gen_random_uuid()::text')
    if (!addedNames.has('created_at')) cols.push('  created_at TIMESTAMPTZ DEFAULT NOW()')
    if (!addedNames.has('updated_at')) cols.push('  updated_at TIMESTAMPTZ DEFAULT NOW()')
    lines.push(cols.join(',\n'))
    lines.push(');')
    lines.push(`ALTER TABLE ${tabla} DISABLE ROW LEVEL SECURITY;`)
    lines.push(`CREATE OR REPLACE FUNCTION update_updated_at_column()`)
    lines.push(`RETURNS TRIGGER AS $$`)
    lines.push(`BEGIN`)
    lines.push(`  NEW.updated_at = NOW();`)
    lines.push(`  RETURN NEW;`)
    lines.push(`END;`)
    lines.push(`$$ language 'plpgsql';`)
    lines.push(`DROP TRIGGER IF EXISTS trigger_${tabla}_updated_at ON ${tabla};`)
    lines.push(`CREATE TRIGGER trigger_${tabla}_updated_at BEFORE UPDATE ON ${tabla}`)
    lines.push(`  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();`)
    return lines.join('\n')
  } catch { return '' }
}

// ========== OBTENER DATOS ==========
async function getLocalRows(tabla: string, desde?: string): Promise<any[]> {
  try {
    const dbApi = (window as any).db
    const res = desde && dbApi.getModified
      ? await dbApi.getModified(tabla, desde)
      : await dbApi.getAll(tabla)
    return res.success && Array.isArray(res.data) ? res.data : []
  } catch { return [] }
}

async function getCloudRows(tabla: string, desde?: string): Promise<any[]> {
  let path = `${tabla}?select=*`
  if (desde) path += `&updated_at=gt.${encodeURIComponent(desde)}`
  path += `&order=id.desc`
  const { data, error } = await fetchFromCloud(path)
  if (error === 'NOT_FOUND') return []
  if (error) return []
  return Array.isArray(data) ? data : []
}

// ========== UPSERT ==========
async function upsertLocal(tabla: string, row: any): Promise<boolean> {
  try {
    const uid = row.uid
    if (!uid) return false
    const localRes = await (window as any).db.getAll(tabla)
    if (!localRes.success) return false
    const existing = (localRes.data || []).find((r: any) => r.uid === uid)
    const data: any = { ...row }
    delete data.id
    if (tabla === 'serial' && data.equipo_uid) {
      const equiposRes = await (window as any).db.getAll('electrodomesticos')
      const equipo = (equiposRes.data || []).find((item: any) => String(item.uid || '') === String(data.equipo_uid))
      data.id_equi = equipo?.id || null
      if (!data.equipo && equipo) data.equipo = equipo.nombre || ''
    }
    data.updated_at = nowISO()
    if (existing) {
      const res = await (window as any).db.update(tabla, existing.id, data)
      return res.success
    } else {
      data.uid = uid
      data.created_at = data.created_at || nowISO()
      const res = await (window as any).db.insert(tabla, data)
      return res.success
    }
  } catch { return false }
}

async function upsertCloud(tabla: string, row: any): Promise<boolean> {
  try {
    const uid = row.uid
    if (!uid) return false
    const { data: existing, error: checkError } = await fetchFromCloud(`${tabla}?select=id,updated_at&uid=eq.${encodeURIComponent(uid)}`)
    if (checkError === 'NOT_FOUND') return false
    const data: any = { ...row }
    delete data.id
    if (tabla === 'serial') delete data.id_equi
    data.updated_at = nowISO()
    if (existing && Array.isArray(existing) && existing.length > 0) {
      const { error } = await patchToCloud(`${tabla}?uid=eq.${encodeURIComponent(uid)}`, data)
      if (error) console.warn(`[Sync] Error actualizando ${tabla}:`, error)
      return !error
    } else {
      data.uid = uid
      data.created_at = data.created_at || nowISO()
      const { error } = await postToCloud(tabla, data)
      if (error) console.warn(`[Sync] Error insertando ${tabla}:`, error)
      return !error
    }
  } catch (error) {
    console.warn(`[Sync] Error inesperado subiendo ${tabla}:`, error)
    return false
  }
}

// ========== SINCRONIZAR TABLA ==========
export async function syncTable(tabla: string, mode?: SyncMode, fullSync?: boolean): Promise<{ inserts: number; updates: number; errors: number }> {
  const m = mode || currentMode
  if (m === 'offline') return { inserts: 0, updates: 0, errors: 0 }
  const soloSubir = m === 'online'

  const lastSync = fullSync ? '' : await getLastSync()
  notificar({ running: true, tabla, progreso: `Procesando ${tabla}...` })

  const localRows = await getLocalRows(tabla, lastSync || undefined)
  if (localRows.length === 0 && !fullSync) {
    return { inserts: 0, updates: 0, errors: 0 }
  }
  const cloudRows = soloSubir ? [] : await getCloudRows(tabla, lastSync || undefined)
  const localRowsForCompare = cloudRows.length > 0 ? await getLocalRows(tabla) : localRows

  const localCompareMap = new Map<string, any>()
  for (const row of localRowsForCompare) if (row.uid) localCompareMap.set(row.uid, row)

  const cloudMap = new Map<string, any>()
  for (const row of cloudRows) if (row.uid) cloudMap.set(row.uid, row)

  let inserts = 0, updates = 0, errors = 0

  function dataIgual(a: any, b: any) {
    const ignored = ['id', 'created_at', 'updated_at', ...(tabla === 'serial' ? ['id_equi'] : [])]
    const sa = JSON.stringify(a, (k, v) => ignored.includes(k) ? undefined : v)
    const sb = JSON.stringify(b, (k, v) => ignored.includes(k) ? undefined : v)
    return sa === sb
  }

  // 1) LOCAL → CLOUD: push registros locales nuevos o mas recientes
  for (const local of localRows) {
    try {
      const uid = local.uid
      if (!uid) continue
      const cloud = cloudMap.get(uid)
      if (!cloud) {
        const ok = await upsertCloud(tabla, local)
        if (ok) { inserts++ } else { errors++ }
      } else {
        const lt = local.updated_at || ''
        const ct = cloud.updated_at || ''
        if (dataIgual(local, cloud) || lt <= ct) continue
        const ok = await upsertCloud(tabla, local)
        if (ok) { updates++ } else { errors++ }
      }
    } catch { errors++ }
  }

  // 2) CLOUD → LOCAL: pull registros de nube nuevos o mas recientes
  if (!soloSubir) {
    for (const [uid, cloud] of cloudMap) {
      try {
        const local = localCompareMap.get(uid)
        if (!local) {
          const ok = await upsertLocal(tabla, cloud)
          if (ok) { inserts++ } else { errors++ }
        } else {
          const lt = local.updated_at || ''
          const ct = cloud.updated_at || ''
          if (dataIgual(local, cloud) || ct <= lt) continue
          const ok = await upsertLocal(tabla, cloud)
          if (ok) { updates++ } else { errors++ }
        }
      } catch { errors++ }
    }
  }

  return { inserts, updates, errors }
}

// ========== SYNC TODAS LAS TABLAS ==========
async function deleteFromCloud(path: string): Promise<{ error: string | null }> {
  const api = getCloudApi()
  if (!api) return { error: 'No client' }
  try {
    const res = await fetch(`${api.url}/${path}`, {
      method: 'DELETE',
      headers: { 'apikey': api.key, 'Authorization': `Bearer ${api.key}` },
    })
    if (res.status === 404) return { error: null }
    if (!res.ok) return { error: `HTTP ${res.status}` }
    return { error: null }
  } catch (e: any) { return { error: e.message } }
}

export async function syncDeletes(): Promise<number> {
  try {
    const res = await (window as any).db.getAll('sync_deletes')
    if (!res.success || !Array.isArray(res.data) || res.data.length === 0) return 0
    let deleted = 0
    for (const row of res.data) {
      // Solo una eliminacion marcada expresamente por la capa de datos puede
      // propagarse. Las colas antiguas o creadas por limpiezas internas se
      // descartan localmente para proteger la nube.
      if (Number(row.confirmado || 0) !== 1) {
        await (window as any).electron.invoke('db:deleteLocalOnly', 'sync_deletes', row.id)
        continue
      }
      const { error } = await deleteFromCloud(`${row.tabla}?uid=eq.${encodeURIComponent(row.uid)}`)
      if (!error || error === 'NOT_FOUND') {
        await (window as any).electron.invoke('db:deleteLocalOnly', 'sync_deletes', row.id)
        deleted++
      }
    }
    return deleted
  } catch { return 0 }
}

export async function syncAll(mode?: SyncMode, incremental?: boolean): Promise<SyncResult> {
  const m = mode || currentMode
  if (m === 'offline') return { success: true, inserts: 0, updates: 0, errors: 0, message: 'Modo offline' }
  if (!await ensureCloudApi()) return { success: false, inserts: 0, updates: 0, errors: 0, message: 'Supabase no conectado' }

  const lastSync = await getLastSync()
  const times = lastSync ? new Date(lastSync).toLocaleTimeString() : 'nunca'
  notificar({ running: true, progreso: `Ultimo sync: ${times}` })

  let totalInserts = 0, totalUpdates = 0, totalErrors = 0

  for (const tabla of SYNC_TABLES) {
    const r = await syncTable(tabla, m, !incremental)
    totalInserts += r.inserts
    totalUpdates += r.updates
    totalErrors += r.errors
  }

  // Sincronizar eliminaciones
  const deletedCount = await syncDeletes()
  if (deletedCount > 0) console.log(`[Sync] ${deletedCount} eliminacion(es) sincronizada(s)`)

  await setLastSync()
  const msg = `${totalInserts} nuevos, ${totalUpdates} actualizados, ${totalErrors} errores`
  const result = { success: totalErrors === 0, inserts: totalInserts, updates: totalUpdates, errors: totalErrors, message: msg }
  notificar({ running: false, lastSync: nowISO(), mode: m, result })
  return result
}

// ========== AUTO SYNC ==========
let syncingInProgress = false

export async function startAutoSync(intervalMs = 30000) {
  stopAutoSync()
  if (!await ensureCloudApi()) return
  if (syncingInProgress) return
  syncingInProgress = true
  try { await syncAll(undefined, true) } finally { syncingInProgress = false }
  intervalId = setInterval(async () => {
    if (syncingInProgress || !await ensureCloudApi()) return
    if (currentMode === 'offline') return
    syncingInProgress = true
    try { await syncAll(undefined, true) } finally { syncingInProgress = false }
  }, intervalMs)
}

export async function initAutoSyncFromConfig(): Promise<boolean> {
  try {
    const cfg = await sb.loadConfig()
    if (!cfg.url || !cfg.anonKey) return false

    const mode = await getConfigValue('supabase_sync_mode')
    const validMode = ['offline', 'online', 'ambos'].includes(mode) ? mode as SyncMode : 'ambos'
    setSyncMode(validMode)
    if (validMode === 'offline') return false

    const intervalRaw = await getConfigValue('supabase_interval')
    const interval = Math.max(10, Number.parseInt(intervalRaw || '30', 10) || 30)
    await startAutoSync(interval * 1000)
    return true
  } catch (error) {
    console.warn('[Sync] No se pudo iniciar auto-sync:', error)
    return false
  }
}

export function stopAutoSync() {
  if (intervalId) { clearInterval(intervalId); intervalId = null }
  notificar({ running: false })
}

export function isAutoSyncRunning(): boolean {
  return intervalId !== null
}

export function isOnline(): boolean {
  return navigator.onLine
}

export async function pushLocalRowToCloud(tabla: string, id: number): Promise<{ success: boolean; error?: string }> {
  if (!isOnline()) return { success: false, error: 'Sin conexion a internet' }
  const api = await ensureCloudApi()
  if (!api) return { success: false, error: 'Supabase no esta configurado o inicializado' }

  try {
    const res = await (window as any).db.getById(tabla, id)
    if (!res.success) return { success: false, error: res.error || 'No se pudo leer el registro local' }
    if (!res.data) return { success: false, error: 'Registro local no encontrado' }
    if (!res.data.uid) return { success: false, error: 'El registro local no tiene uid de sincronizacion' }

    const uid = String(res.data.uid)
    const { data: existing, error: checkError } = await fetchFromCloud(`${tabla}?select=id,updated_at&uid=eq.${encodeURIComponent(uid)}`)
    if (checkError) return { success: false, error: checkError === 'NOT_FOUND' ? `La tabla ${tabla} no existe en Supabase` : checkError }

    const data: any = { ...res.data }
    delete data.id
    data.updated_at = nowISO()

    if (existing && Array.isArray(existing) && existing.length > 0) {
      const { error } = await patchToCloud(`${tabla}?uid=eq.${encodeURIComponent(uid)}`, data)
      return error ? { success: false, error } : { success: true }
    }

    data.uid = uid
    data.created_at = data.created_at || nowISO()
    const { error } = await postToCloud(tabla, data)
    return error ? { success: false, error } : { success: true }
  } catch {
    return { success: false, error: 'Error inesperado sincronizando con Supabase' }
  }
}

export function getCloudApiInfo() {
  const api = getCloudApi()
  if (!api) return null
  return { url: api.url, keyPrefix: api.key.slice(0, 10) + '...' }
}
