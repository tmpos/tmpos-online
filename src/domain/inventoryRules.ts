export function assertSameWarehouse(row: any, warehouse: { id?: number; uid?: string }, label = 'El registro') {
  const expectedUid = String(warehouse.uid || '')
  const rowUid = String(row?.almacen_uid || '')
  if (expectedUid && rowUid && expectedUid !== rowUid) throw new Error(`${label} pertenece a otro almacén`)
  const expectedId = Number(warehouse.id || 0)
  const rowId = Number(row?.almacen_id || 0)
  if (!expectedUid && expectedId && rowId && expectedId !== rowId) throw new Error(`${label} pertenece a otro almacén`)
}

export function assertAvailableInventory(table: string, row: any, quantity = 1) {
  if (!row) throw new Error('El producto no existe')
  if (['imei', 'serial'].includes(table) && String(row.estado || 'DISPONIBLE').toUpperCase() !== 'DISPONIBLE') {
    throw new Error(`${table.toUpperCase()} ${row.nombre || row.id} ya no está disponible`)
  }
  if (table === 'accesorios' && (!(quantity > 0) || Number(row.cantidad || 0) < quantity)) {
    throw new Error(`Stock insuficiente para ${row.nombre || row.id}`)
  }
}

export function belongsToWarehouse(row: any, warehouse: { id?: number; uid?: string }): boolean {
  try { assertSameWarehouse(row, warehouse); return true } catch { return false }
}

export function validateWarehouseConversion(source: any, targetWarehouse: { id?: number; uid?: string }, operation: string) {
  assertSameWarehouse(source, targetWarehouse, operation)
  if (!source?.id) throw new Error(`${operation}: documento de origen inválido`)
  return true
}
