import { beforeEach, describe, expect, it, vi } from 'vitest'
import { ensureRecibidoCreditNote } from './recibidosCreditNoteService'

describe('notas de crédito de recibidos', () => {
  const invoices: any[] = []
  const updates: any[] = []
  beforeEach(() => {
    invoices.length = 0
    updates.length = 0
    ;(globalThis as any).window = { db: {
      getWhere: vi.fn(async (_table: string, _where: string, params: any[]) => ({ success: true, data: invoices.filter(row => row.referencia_origen === params[0]) })),
      insert: vi.fn(async (_table: string, data: any) => { const row = { id: invoices.length + 1, ...data }; invoices.push(row); return { success: true, data: { id: row.id } } }),
      update: vi.fn(async (_table: string, id: number, data: any) => { updates.push({ id, data }); return { success: true } }),
    } }
  })

  it('crea una sola factura y reutiliza la referencia al repetir', async () => {
    const recibido = { id: 7, nombre: '123456789012345', nota: JSON.stringify({ credit_note_value: 100, customer_name: 'Ana' }) }
    const first = await ensureRecibidoCreditNote(recibido, { almacenId: 1, almacenUid: 'a', productName: 'Teléfono' })
    const second = await ensureRecibidoCreditNote(recibido, { almacenId: 1, almacenUid: 'a', productName: 'Teléfono' })
    expect(first?.created).toBe(true)
    expect(second?.created).toBe(false)
    expect(invoices).toHaveLength(1)
    expect(invoices[0]).toMatchObject({ referencia_origen: 'RECIBIDO:7', almacen_uid: 'a', tipo_factura: 'NOTA_CREDITO' })
    expect(updates.length).toBe(2)
  })
})
