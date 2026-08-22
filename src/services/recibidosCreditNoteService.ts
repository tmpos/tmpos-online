export type RecibidoCreditNoteResult = {
  created: boolean
  recibido: any
  factura: any
}

function parseNota(value: unknown): Record<string, any> {
  if (value && typeof value === 'object') return { ...(value as Record<string, any>) }
  try { return JSON.parse(String(value || '{}')) } catch { return {} }
}

function timestampParts(now = new Date()) {
  const year = String(now.getFullYear())
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  const hour = String(now.getHours()).padStart(2, '0')
  const minute = String(now.getMinutes()).padStart(2, '0')
  const second = String(now.getSeconds()).padStart(2, '0')
  return { year, month, day, hour, minute, second }
}

/** Single entry point for automatic and manual credit notes created from received equipment. */
export async function ensureRecibidoCreditNote(
  recibido: any,
  options: { almacenId: number; almacenUid: string; productName?: string },
): Promise<RecibidoCreditNoteResult | null> {
  const nota = parseNota(recibido?.nota)
  const value = Number(nota.credit_note_value || 0)
  if (!recibido?.id || value <= 0) return null

  const reference = `RECIBIDO:${recibido.id}`
  const existing = await window.db.getWhere('facturas', 'referencia_origen = ?', [reference])
  const existingInvoice = existing?.success && existing.data?.[0]
  if (existingInvoice) {
    nota.credit_note_id = existingInvoice.id
    nota.credit_note_no = existingInvoice.no_factura
    nota.credit_note_date = existingInvoice.fecha_emision
    const updated = { ...recibido, nota: JSON.stringify(nota) }
    await window.db.update('imei', recibido.id, { nota: updated.nota })
    return { created: false, recibido: updated, factura: existingInvoice }
  }

  const p = timestampParts()
  const invoiceNo = `NC-${p.year}${p.month}${p.day}-${p.hour}${p.minute}${p.second}-${recibido.id}`
  const date = `${p.year}-${p.month}-${p.day}`
  const invoice = {
    no_factura: invoiceNo,
    tipo_factura: 'NOTA_CREDITO',
    cod_cliente: nota.cliente_id || '',
    nombre_cliente: String(nota.customer_name || 'CONSUMIDOR FINAL').toUpperCase(),
    telefono_cliente: nota.customer_phone || '',
    productos: JSON.stringify([{ nombre: `RECIBIDO: ${options.productName || recibido.nombre || ''}`, cantidad: 1, precio: value, total: value }]),
    total: value,
    subtotal: value,
    metodo_pago: 'EFECTIVO',
    estado_factura: 'PENDIENTE',
    fecha_emision: date,
    fecha_estado: date,
    hora: `${p.hour}:${p.minute}`,
    nota: `NOTA DE CREDITO POR EQUIPO RECIBIDO IMEI: ${recibido.nombre || ''}`,
    referencia_origen: reference,
    mes: p.month,
    year: p.year,
    almacen_id: options.almacenId || 0,
    almacen_uid: options.almacenUid || '',
  }

  const inserted = await window.db.insert('facturas', invoice)
  if (!inserted.success) {
    // A concurrent caller may have won the unique-reference race.
    const concurrent = await window.db.getWhere('facturas', 'referencia_origen = ?', [reference])
    if (concurrent?.success && concurrent.data?.[0]) {
      return ensureRecibidoCreditNote(recibido, options)
    }
    throw new Error(inserted.error || 'No se pudo generar la nota de credito')
  }

  const factura = { id: inserted.data.id, ...invoice }
  nota.credit_note_id = factura.id
  nota.credit_note_no = invoiceNo
  nota.credit_note_date = date
  const updated = { ...recibido, nota: JSON.stringify(nota) }
  const saved = await window.db.update('imei', recibido.id, { nota: updated.nota })
  if (!saved.success) throw new Error(saved.error || 'La nota fue creada, pero no se pudo vincular al equipo recibido')
  return { created: true, recibido: updated, factura }
}
