import * as tmc from './tmCloudClient'
import { ensureAparienciaAlmacenCloudTable, pushLocalRowToCloud } from './tmCloudSyncService'

export const WAREHOUSE_APPEARANCE_TABLE = 'apariencia_almacen'

export interface WarehouseAppearance {
  id?: number
  uid?: string
  color_primario: string
  tono_primario: string
  fondo_barra: string
  tono_barra: string
  color_texto_barra: string
  tema_visual: 'standard' | 'glass'
  almacen_id: number
  almacen_uid: string
}

export interface WarehouseReference {
  id: number
  uid: string
}

function belongsToWarehouse(row: any, warehouse: WarehouseReference): boolean {
  if (warehouse.uid && row?.almacen_uid) return String(row.almacen_uid) === warehouse.uid
  return Number(row?.almacen_id || 0) === Number(warehouse.id || 0)
}

function appearanceUid(warehouse: WarehouseReference): string {
  return `apariencia-${warehouse.uid || `almacen-${warehouse.id || 0}`}`
}

function normalizeAppearance(row: any, warehouse: WarehouseReference): WarehouseAppearance {
  return {
    id: Number(row?.id || 0) || undefined,
    uid: String(row?.uid || appearanceUid(warehouse)),
    color_primario: String(row?.color_primario || 'blue'),
    tono_primario: String(row?.tono_primario || '500'),
    fondo_barra: String(row?.fondo_barra || 'white'),
    tono_barra: String(row?.tono_barra || '500'),
    color_texto_barra: String(row?.color_texto_barra || 'auto'),
    tema_visual: row?.tema_visual === 'glass' ? 'glass' : 'standard',
    almacen_id: Number(row?.almacen_id || warehouse.id || 0),
    almacen_uid: String(row?.almacen_uid || warehouse.uid || ''),
  }
}

async function localRows(): Promise<any[]> {
  const result = await window.db.getAll(WAREHOUSE_APPEARANCE_TABLE)
  return result.success && Array.isArray(result.data) ? result.data : []
}

async function cacheRemoteAppearance(remote: any, warehouse: WarehouseReference): Promise<WarehouseAppearance> {
  const rows = await localRows()
  const normalized = normalizeAppearance(remote, warehouse)
  const existing = rows.find(row => String(row.uid || '') === String(normalized.uid || ''))
    || rows.find(row => belongsToWarehouse(row, warehouse))
  const payload = { ...remote, ...normalized } as any
  delete payload.id
  delete payload._rowId
  if (existing?.id) {
    await window.db.update(WAREHOUSE_APPEARANCE_TABLE, Number(existing.id), payload)
    normalized.id = Number(existing.id)
  } else {
    const inserted = await window.db.insert(WAREHOUSE_APPEARANCE_TABLE, payload)
    if (inserted.success && inserted.data?.id) normalized.id = Number(inserted.data.id)
  }
  return normalized
}

async function fetchRemoteAppearance(warehouse: WarehouseReference): Promise<WarehouseAppearance | null> {
  try {
    await tmc.ensureConfigLoaded()
    if (!await ensureAparienciaAlmacenCloudTable()) return null
    const rows = await tmc.fetchTable(WAREHOUSE_APPEARANCE_TABLE)
    const remote = rows.find(row => belongsToWarehouse(row, warehouse))
    return remote ? await cacheRemoteAppearance(remote, warehouse) : null
  } catch {
    return null
  }
}

export async function loadWarehouseAppearance(
  warehouse: WarehouseReference,
  refreshCloud = true,
): Promise<WarehouseAppearance | null> {
  if (refreshCloud) {
    const remote = await fetchRemoteAppearance(warehouse)
    if (remote) return remote
  }
  const local = (await localRows()).find(row => belongsToWarehouse(row, warehouse))
  return local ? normalizeAppearance(local, warehouse) : null
}

export async function saveWarehouseAppearance(
  warehouse: WarehouseReference,
  appearance: Pick<WarehouseAppearance, 'color_primario' | 'tono_primario' | 'fondo_barra' | 'tono_barra' | 'color_texto_barra' | 'tema_visual'>,
): Promise<{ success: boolean; synced: boolean; error?: string }> {
  try {
    const rows = await localRows()
    const existing = rows.find(row => belongsToWarehouse(row, warehouse))
    const normalized = normalizeAppearance({
      ...appearance,
      uid: existing?.uid || appearanceUid(warehouse),
      almacen_id: warehouse.id,
      almacen_uid: warehouse.uid,
    }, warehouse)
    // `id` pertenece solo a SQLite. En un registro nuevo normalizeAppearance
    // lo deja como undefined y better-sqlite3 intenta insertarlo en la PK
    // INTEGER, lo que provoca "datatype mismatch". Nunca se envia en payload.
    const payload: any = { ...normalized }
    delete payload.id
    delete payload._rowId
    let localId = Number(existing?.id || 0)
    if (localId) {
      const updated = await window.db.update(WAREHOUSE_APPEARANCE_TABLE, localId, payload as any)
      if (!updated.success) throw new Error(updated.error || 'No se pudo guardar la apariencia')
    } else {
      const inserted = await window.db.insert(WAREHOUSE_APPEARANCE_TABLE, payload as any)
      if (!inserted.success || !inserted.data?.id) throw new Error(inserted.error || 'No se pudo guardar la apariencia')
      localId = Number(inserted.data.id)
    }
    const cloud = await pushLocalRowToCloud(WAREHOUSE_APPEARANCE_TABLE, localId)
    window.dispatchEvent(new CustomEvent('warehouse-appearance-changed', {
      detail: { ...payload, synced: cloud.success },
    }))
    return { success: true, synced: cloud.success, error: cloud.error }
  } catch (error: any) {
    return { success: false, synced: false, error: error?.message || 'No se pudo guardar la apariencia' }
  }
}
