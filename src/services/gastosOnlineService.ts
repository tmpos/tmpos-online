type GastoPayload = {
  id?: number
  cantidad: number
  fecha?: string
  hora?: string
  comentario?: string
  metodo_pago?: string
  banco_id?: number
  banco_uid?: string
  turno_id?: number | null
  almacen_id?: number
  almacen_uid?: string
}

type Banco = {
  id: number
  uid?: string
  nombre?: string
  saldo?: number
}

type CambioBanco = {
  banco: Banco
  saldoAnterior: number
  saldoNuevo: number
}

function errorResult(error: unknown): DbResponse<any> {
  return { success: false, error: error instanceof Error ? error.message : String(error || 'No se pudo guardar el gasto') }
}

function buscarBanco(bancos: Banco[], uid: unknown, id: unknown): Banco | undefined {
  const bancoUid = String(uid || '').trim()
  if (bancoUid) {
    const porUid = bancos.find(banco => String(banco.uid || '') === bancoUid)
    if (porUid) return porUid
  }
  const bancoId = Number(id || 0)
  return bancoId ? bancos.find(banco => Number(banco.id) === bancoId) : undefined
}

async function revertirCambiosBanco(cambios: CambioBanco[]): Promise<void> {
  for (const cambio of [...cambios].reverse()) {
    await window.db.update('bancos', cambio.banco.id, {
      saldo: cambio.saldoAnterior,
      fecha_transaccion: new Date().toISOString(),
    }).catch(() => undefined)
  }
}

async function aplicarCambiosBanco(cambios: CambioBanco[]): Promise<DbResponse<any>> {
  const aplicados: CambioBanco[] = []
  for (const cambio of cambios) {
    const result = await window.db.update('bancos', cambio.banco.id, {
      saldo: cambio.saldoNuevo,
      fecha_transaccion: new Date().toISOString(),
    })
    if (!result.success) {
      await revertirCambiosBanco(aplicados)
      return result
    }
    aplicados.push(cambio)
  }
  return { success: true, data: aplicados }
}

function calcularCambiosBanco(bancos: Banco[], anterior: any, payload: GastoPayload): CambioBanco[] {
  const saldos = new Map<number, { banco: Banco; anterior: number; nuevo: number }>()
  const ajustar = (banco: Banco, diferencia: number) => {
    const actual = saldos.get(banco.id) || {
      banco,
      anterior: Number(banco.saldo || 0),
      nuevo: Number(banco.saldo || 0),
    }
    actual.nuevo += diferencia
    saldos.set(banco.id, actual)
  }

  if (anterior && String(anterior.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA') {
    const bancoAnterior = buscarBanco(bancos, anterior.banco_uid, anterior.banco_id)
    if (!bancoAnterior) throw new Error('No se encontro el banco asociado al gasto anterior')
    ajustar(bancoAnterior, Number(anterior.cantidad || 0))
  }

  if (String(payload.metodo_pago || 'EFECTIVO').toUpperCase() === 'TRANSFERENCIA') {
    const bancoNuevo = buscarBanco(bancos, payload.banco_uid, payload.banco_id)
    if (!bancoNuevo) throw new Error('No se encontro el banco seleccionado')
    ajustar(bancoNuevo, -Number(payload.cantidad || 0))
    const saldoFinal = saldos.get(bancoNuevo.id)?.nuevo ?? Number(bancoNuevo.saldo || 0)
    if (saldoFinal < 0) throw new Error(`Fondos insuficientes en ${bancoNuevo.nombre || 'el banco'}`)
  }

  return [...saldos.values()].map(item => ({
    banco: item.banco,
    saldoAnterior: item.anterior,
    saldoNuevo: item.nuevo,
  }))
}

export async function guardarGastoOnline(payload: GastoPayload): Promise<DbResponse<any>> {
  let cambiosAplicados: CambioBanco[] = []
  try {
    const cantidad = Number(payload.cantidad || 0)
    const metodoPago = String(payload.metodo_pago || 'EFECTIVO').trim().toUpperCase()
    if (!(cantidad > 0)) return { success: false, error: 'El monto del gasto debe ser mayor que cero' }
    if (!['EFECTIVO', 'TRANSFERENCIA'].includes(metodoPago)) return { success: false, error: 'Metodo de pago no valido' }

    const id = Number(payload.id || 0)
    const anteriorResult = id ? await window.db.getById('gastos', id) : null
    const anterior = anteriorResult?.success ? anteriorResult.data : null
    if (id && !anterior) return { success: false, error: 'El gasto que intentas editar no existe en TM Cloud' }

    const necesitaBancos = metodoPago === 'TRANSFERENCIA' ||
      String(anterior?.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA'
    const bancosResult = necesitaBancos ? await window.db.getAll('bancos') : { success: true, data: [] }
    if (!bancosResult.success) return bancosResult
    const bancos = bancosResult.data || []
    const banco = metodoPago === 'TRANSFERENCIA'
      ? buscarBanco(bancos, payload.banco_uid, payload.banco_id)
      : undefined
    if (metodoPago === 'TRANSFERENCIA' && !banco) return { success: false, error: 'Selecciona el banco de la transferencia' }

    const cambiosBanco = calcularCambiosBanco(bancos, anterior, { ...payload, metodo_pago: metodoPago })
    const resultadoBancos = await aplicarCambiosBanco(cambiosBanco)
    if (!resultadoBancos.success) return resultadoBancos
    cambiosAplicados = cambiosBanco

    const registro = {
      cantidad,
      fecha: String(payload.fecha || ''),
      hora: String(payload.hora || ''),
      comentario: String(payload.comentario || '').trim(),
      metodo_pago: metodoPago,
      banco_id: banco ? Number(banco.id) : 0,
      banco_uid: banco ? String(banco.uid || '') : '',
      banco_nombre: banco ? String(banco.nombre || '') : '',
      turno_id: payload.turno_id || null,
      almacen_id: Number(payload.almacen_id || 0),
      almacen_uid: String(payload.almacen_uid || ''),
    }
    const resultado = id
      ? await window.db.update('gastos', id, registro)
      : await window.db.insert('gastos', registro)

    if (!resultado.success) {
      await revertirCambiosBanco(cambiosBanco)
      cambiosAplicados = []
      return resultado
    }
    cambiosAplicados = []
    return id ? { ...resultado, data: { id } } : resultado
  } catch (error) {
    if (cambiosAplicados.length) await revertirCambiosBanco(cambiosAplicados)
    return errorResult(error)
  }
}

export async function eliminarGastoOnline(id: number): Promise<DbResponse<any>> {
  try {
    const gastoResult = await window.db.getById('gastos', Number(id || 0))
    if (!gastoResult.success) return gastoResult
    const gasto = gastoResult.data
    if (!gasto) return { success: false, error: 'El gasto no existe en TM Cloud' }

    let cambiosBanco: CambioBanco[] = []
    if (String(gasto.metodo_pago || '').toUpperCase() === 'TRANSFERENCIA') {
      const bancosResult = await window.db.getAll('bancos')
      if (!bancosResult.success) return bancosResult
      const banco = buscarBanco(bancosResult.data || [], gasto.banco_uid, gasto.banco_id)
      if (!banco) return { success: false, error: 'No se encontro el banco asociado al gasto' }
      cambiosBanco = [{
        banco,
        saldoAnterior: Number(banco.saldo || 0),
        saldoNuevo: Number(banco.saldo || 0) + Number(gasto.cantidad || 0),
      }]
      const resultadoBancos = await aplicarCambiosBanco(cambiosBanco)
      if (!resultadoBancos.success) return resultadoBancos
    }

    const resultado = await window.db.delete('gastos', Number(id || 0))
    if (!resultado.success) await revertirCambiosBanco(cambiosBanco)
    return resultado
  } catch (error) {
    return errorResult(error)
  }
}
