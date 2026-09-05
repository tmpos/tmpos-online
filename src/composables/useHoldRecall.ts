import { onUnmounted, ref } from 'vue'
import { getSystemLocale } from '@/i18n/localeProfiles'
import { ensureVentasPausadasCloudTable, pushLocalRowToCloud, syncAll } from '@/services/tmCloudSyncService'

export interface VentaHold {
  id: string
  dbId?: number
  uid?: string
  fecha: string
  hora: string
  cart: any[]
  cliente: any | null
  clienteExpress: string
  descuentoFijo: number
  descuentoPorc: number
  descuentoTipo: string
  descuentoValor: number
  metodoPago: string
  nota: string
  total: number
  itemsCount: number
  usuario?: string
  vendedorId?: number
  vendedorNombre?: string
  syncPendiente?: boolean
}

const HOLDS_KEY = 'pos_ventas_hold'
const HOLDS_TABLE = 'ventas_pausadas'

function almacenActual() {
  return {
    id: Number(localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0),
    uid: String(localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || ''),
  }
}

function perteneceAlmacenActual(row: any): boolean {
  const almacen = almacenActual()
  if (almacen.uid && row.almacen_uid) return String(row.almacen_uid) === almacen.uid
  return !Number(row.almacen_id) || Number(row.almacen_id) === almacen.id
}

function parseHoldRow(row: any): VentaHold | null {
  try {
    const datos = typeof row.datos === 'string' ? JSON.parse(row.datos || '{}') : (row.datos || {})
    return {
      ...datos,
      id: String(row.codigo || datos.id || row.uid || `HOLD-${row.id}`),
      dbId: Number(row.id || 0),
      uid: String(row.uid || ''),
      total: Number(row.total ?? datos.total ?? 0),
      itemsCount: Number(row.items_count ?? datos.itemsCount ?? 0),
      usuario: String(row.usuario || datos.usuario || ''),
      cart: Array.isArray(datos.cart) ? datos.cart : [],
    }
  } catch {
    return null
  }
}

export function useHoldRecall() {
  const ventasHold = ref<VentaHold[]>([])
  const dialogHold = ref(false)
  const holdSeleccionado = ref<VentaHold | null>(null)
  const sincronizando = ref(false)

  async function migrarHoldsLocales() {
    const raw = localStorage.getItem(HOLDS_KEY)
    if (!raw) return
    try {
      const legacy = JSON.parse(raw)
      if (!Array.isArray(legacy) || legacy.length === 0) {
        localStorage.removeItem(HOLDS_KEY)
        return
      }
      const actuales = await window.db.getAll(HOLDS_TABLE)
      const codigos = new Set((actuales.success ? actuales.data || [] : []).map((row: any) => String(row.codigo || '')))
      let migracionCompleta = actuales.success
      for (const hold of legacy) {
        if (!hold?.id || codigos.has(String(hold.id))) continue
        const res = await window.db.insert(HOLDS_TABLE, {
          codigo: String(hold.id),
          datos: JSON.stringify(hold),
          cliente_nombre: String(hold.cliente?.nombre || hold.clienteExpress || 'CONSUMIDOR FINAL'),
          total: Number(hold.total || 0),
          items_count: Number(hold.itemsCount || 0),
          usuario: String(hold.usuario || ''),
          estado: 'PAUSADA',
        })
        if (res.success && res.data?.id) {
          void pushLocalRowToCloud(HOLDS_TABLE, Number(res.data.id))
        } else {
          migracionCompleta = false
        }
      }
      if (migracionCompleta) localStorage.removeItem(HOLDS_KEY)
    } catch {
      // Se conserva el respaldo local si la migracion no pudo completarse.
    }
  }

  async function cargarHolds(sincronizar = false) {
    sincronizando.value = sincronizar
    try {
      await migrarHoldsLocales()
      if (sincronizar) await syncAll(undefined, true)
      const res = await window.db.getAll(HOLDS_TABLE)
      ventasHold.value = (res.success ? res.data || [] : [])
        .filter((row: any) => String(row.estado || 'PAUSADA').toUpperCase() === 'PAUSADA' && perteneceAlmacenActual(row))
        .map(parseHoldRow)
        .filter((hold: VentaHold | null): hold is VentaHold => Boolean(hold))
        .sort((a: VentaHold, b: VentaHold) => Number(b.dbId || 0) - Number(a.dbId || 0))
    } catch {
      ventasHold.value = []
    } finally {
      sincronizando.value = false
    }
  }

  async function abrirHolds() {
    dialogHold.value = true
    await cargarHolds(true)
  }

  async function holdVenta(
    cart: any[],
    cliente: any | null,
    clienteExpress: string,
    descuentoFijo: number,
    descuentoPorc: number,
    descuentoTipo: string,
    descuentoValor: number,
    metodoPago: string,
    nota: string,
    total: number,
    usuario = '',
    vendedorId = 0,
    vendedorNombre = '',
  ) {
    const ahora = new Date()
    const hold: VentaHold = {
      id: `HOLD-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`,
      fecha: ahora.toLocaleDateString(getSystemLocale()),
      hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`,
      cart: JSON.parse(JSON.stringify(cart)),
      cliente,
      clienteExpress,
      descuentoFijo,
      descuentoPorc,
      descuentoTipo,
      descuentoValor,
      metodoPago,
      nota,
      total,
      itemsCount: cart.reduce((s: number, i: any) => s + (i.cantidad || 1), 0),
      usuario,
      vendedorId,
      vendedorNombre,
    }
    const res = await window.db.insert(HOLDS_TABLE, {
      codigo: hold.id,
      datos: JSON.stringify(hold),
      cliente_nombre: String(cliente?.nombre || clienteExpress || 'CONSUMIDOR FINAL'),
      total: Number(total || 0),
      items_count: hold.itemsCount,
      usuario,
      estado: 'PAUSADA',
    })
    if (!res.success || !res.data?.id) throw new Error(res.error || 'No se pudo pausar la venta')
    hold.dbId = Number(res.data.id)
    const cloud = await pushLocalRowToCloud(HOLDS_TABLE, hold.dbId)
    hold.syncPendiente = !cloud.success
    await cargarHolds(false)
    return hold
  }

  function recallVenta(hold: VentaHold) {
    return {
      cart: JSON.parse(JSON.stringify(hold.cart)),
      cliente: hold.cliente,
      clienteExpress: hold.clienteExpress,
      descuentoFijo: hold.descuentoFijo,
      descuentoPorc: hold.descuentoPorc,
      descuentoTipo: hold.descuentoTipo,
      descuentoValor: hold.descuentoValor,
      metodoPago: hold.metodoPago,
      nota: hold.nota,
      vendedorId: Number(hold.vendedorId || 0),
      vendedorNombre: String(hold.vendedorNombre || ''),
    }
  }

  async function cambiarEstadoHold(hold: VentaHold, estado: 'RECUPERADA' | 'CANCELADA') {
    if (!hold.dbId) return
    const res = await window.db.update(HOLDS_TABLE, hold.dbId, { estado })
    if (!res.success) throw new Error(res.error || 'No se pudo actualizar la venta pausada')
    await pushLocalRowToCloud(HOLDS_TABLE, hold.dbId)
    await cargarHolds(false)
  }

  async function eliminarHold(id: string, estado: 'RECUPERADA' | 'CANCELADA' = 'CANCELADA') {
    const hold = ventasHold.value.find(item => item.id === id)
    if (hold) await cambiarEstadoHold(hold, estado)
  }

  async function limpiarHolds() {
    const actuales = [...ventasHold.value]
    for (const hold of actuales) await cambiarEstadoHold(hold, 'CANCELADA')
  }

  const refrescarPorSync = (event: Event) => {
    const tabla = String((event as CustomEvent)?.detail?.table || '')
    if (tabla === HOLDS_TABLE) void cargarHolds(false)
  }
  window.addEventListener('tmcloud:table-changed', refrescarPorSync)
  onUnmounted(() => window.removeEventListener('tmcloud:table-changed', refrescarPorSync))

  // Prepara el recurso remoto al entrar al POS, aunque aun no exista ninguna
  // venta pausada y la sincronizacion automatica este desactivada.
  void ensureVentasPausadasCloudTable()
  void cargarHolds(false)

  return {
    ventasHold,
    dialogHold,
    holdSeleccionado,
    sincronizando,
    cargarHolds,
    abrirHolds,
    holdVenta,
    recallVenta,
    eliminarHold,
    limpiarHolds,
  }
}
