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
    return items.filter(item => {
      const itemUid = String(item.almacen_uid || '')
      const itemId = Number(item.almacen_id || 0)
      if (itemUid) return itemUid === uid
      if (itemId) return itemId === id
      // Compatibilidad con datos creados antes de almacen_uid. Si solo existe
      // una empresa, los registros sin asignacion pertenecen a ese almacen.
      return store.almacenes.length <= 1
    })
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
