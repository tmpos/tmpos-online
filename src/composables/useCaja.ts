import { ref, watch } from 'vue'
import { useAlmacenStore } from '@/stores/almacen.store'

export interface TurnoCaja {
  id: number
  almacen_id: number
  almacen_uid?: string
  usuario: string
  monto_inicial: number
  monto_final?: number
  fecha_apertura: string
  hora_apertura: string
  fecha_cierre?: string
  hora_cierre?: string
  estado: 'ABIERTO' | 'CERRADO'
  notas?: string
}

export interface MovimientoCaja {
  id: number
  turno_id: number
  tipo: 'INGRESO' | 'RETIRO'
  concepto: string
  monto: number
  fecha: string
  hora: string
  usuario: string
}

export function useCaja() {
  const almacenStore = useAlmacenStore()
  const turnoActivo = ref<TurnoCaja | null>(null)
  const dialogAperturaCaja = ref(false)
  const dialogCierreCaja = ref(false)
  const dialogMovimientoCaja = ref(false)
  const montoApertura = ref(0)
  const montoFinal = ref(0)
  const movimientoConcepto = ref('')
  const movimientoMonto = ref(0)
  const movimientoTipo = ref<'INGRESO' | 'RETIRO'>('INGRESO')
  const cargandoTurno = ref(false)
  const cierreRevelado = ref(false)
  const historialMovimientos = ref<MovimientoCaja[]>([])
  const hayTurnoAbierto = ref(false)

  async function verificarTurno() {
    try {
      const res = await (window as any).electron.invoke('caja:getTurnoActivo', almacenStore.activeUid || '')
      if (res.success && res.data) {
        turnoActivo.value = res.data
        hayTurnoAbierto.value = true
      } else {
        turnoActivo.value = null
        hayTurnoAbierto.value = false
      }
    } catch {
      turnoActivo.value = null
      hayTurnoAbierto.value = false
    }
  }

  async function abrirTurno() {
    if (montoApertura.value < 0) return false
    cargandoTurno.value = true
    try {
      const now = new Date()
      const data = {
        monto_inicial: montoApertura.value,
        fecha_apertura: now.toISOString().split('T')[0],
        hora_apertura: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        estado: 'ABIERTO',
        almacen_id: almacenStore.activeId || 0,
        almacen_uid: almacenStore.activeUid || '',
      }
      const res = await (window as any).electron.invoke('caja:abrirTurno', data)
      if (res.success) {
        turnoActivo.value = res.data
        hayTurnoAbierto.value = true
        dialogAperturaCaja.value = false
        return true
      }
      return false
    } catch { return false }
    finally { cargandoTurno.value = false }
  }

  async function cerrarTurno() {
    if (!turnoActivo.value || !cierreRevelado.value) return false
    cargandoTurno.value = true
    try {
      const now = new Date()
      const data = {
        monto_final: montoFinal.value,
        efectivo_esperado: sugerirMontoCierre(),
        diferencia: montoFinal.value - sugerirMontoCierre(),
        cierre_ciego: true,
        fecha_cierre: now.toISOString().split('T')[0],
        hora_cierre: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        estado: 'CERRADO',
      }
      const res = await (window as any).electron.invoke('caja:cerrarTurno', turnoActivo.value.id, data)
      if (res.success) {
        turnoActivo.value = null
        hayTurnoAbierto.value = false
        dialogCierreCaja.value = false
        return true
      }
      return false
    } catch { return false }
    finally { cargandoTurno.value = false }
  }

  async function registrarMovimiento() {
    if (!turnoActivo.value || !movimientoConcepto.value || movimientoMonto.value <= 0) return false
    try {
      const now = new Date()
      const data = {
        turno_id: turnoActivo.value.id,
        tipo: movimientoTipo.value,
        concepto: movimientoConcepto.value,
        monto: movimientoMonto.value,
        fecha: now.toISOString().split('T')[0],
        hora: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
        usuario: 'POS',
        almacen_id: almacenStore.activeId || 0,
        almacen_uid: almacenStore.activeUid || '',
      }
      const res = await (window as any).electron.invoke('caja:registrarMovimiento', data)
      if (res.success) {
        movimientoConcepto.value = ''
        movimientoMonto.value = 0
        dialogMovimientoCaja.value = false
        await cargarMovimientos()
        return true
      }
      return false
    } catch { return false }
  }

  async function cargarMovimientos() {
    if (!turnoActivo.value) return
    try {
      const res = await (window as any).electron.invoke('caja:getMovimientos', turnoActivo.value.id)
      if (res.success) {
        historialMovimientos.value = res.data || []
      }
    } catch {}
  }

  function sugerirMontoCierre() {
    if (!turnoActivo.value) return 0
    const ingresos = historialMovimientos.value
      .filter(m => m.tipo === 'INGRESO')
      .reduce((s, m) => s + m.monto, 0)
    const retiros = historialMovimientos.value
      .filter(m => m.tipo === 'RETIRO')
      .reduce((s, m) => s + m.monto, 0)
    return (turnoActivo.value.monto_inicial || 0) + ingresos - retiros
  }

  function declararMontoFinal() {
    if (montoFinal.value < 0) return false
    cierreRevelado.value = true
    return true
  }

  watch(dialogCierreCaja, (visible) => {
    if (!visible) return
    montoFinal.value = 0
    cierreRevelado.value = false
  })

  return {
    turnoActivo,
    hayTurnoAbierto,
    dialogAperturaCaja,
    dialogCierreCaja,
    dialogMovimientoCaja,
    montoApertura,
    montoFinal,
    movimientoConcepto,
    movimientoMonto,
    movimientoTipo,
    cargandoTurno,
    cierreRevelado,
    historialMovimientos,
    verificarTurno,
    abrirTurno,
    cerrarTurno,
    registrarMovimiento,
    cargarMovimientos,
    sugerirMontoCierre,
    declararMontoFinal,
  }
}
