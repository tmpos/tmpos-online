import { useAlmacenStore } from '@/stores/almacen.store'

export function useAlmacenFilter() {
  const store = useAlmacenStore()

  function whereClause(alias = '') {
    const prefix = alias ? `${alias}.` : ''
    const id = store.activeId || 0
    const uid = store.activeUid || ''
    if (!uid && !id) return { clause: '1=1', params: [] }
    if (!uid) return { clause: `${prefix}almacen_id = ?`, params: [id] }
    return { clause: `(${prefix}almacen_uid = ? OR ((${prefix}almacen_uid IS NULL OR ${prefix}almacen_uid = '') AND ${prefix}almacen_id = ?))`, params: [uid, id] }
  }

  function filterByAlmacen<T extends Record<string, any>>(items: T[]): T[] {
    const id = store.activeId || 0
    const uid = store.activeUid || ''
    if (!uid && !id) return items
    return items.filter(item => item.almacen_uid
      ? String(item.almacen_uid) === uid
      : Number(item.almacen_id) === id || (!item.almacen_id && id === 1))
  }

  function addAlmacenId(data: Record<string, any>) {
    const id = store.activeId || 0
    const uid = store.activeUid || ''
    if (id) data.almacen_id = id
    if (uid) data.almacen_uid = uid
    return data
  }

  return { store, whereClause, filterByAlmacen, addAlmacenId }
}
