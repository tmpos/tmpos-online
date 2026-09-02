import { describe, expect, it } from 'vitest'
import { isCollectablePendingInvoice, isCreditNoteInvoice } from './pendingInvoiceRules'

describe('pending invoice rules', () => {
  it('allows a pending sales invoice sent to cash register', () => {
    expect(isCollectablePendingInvoice({
      no_factura: 'F-20260901-100000',
      tipo_factura: 'FACTURA_VENTA',
      estado_factura: 'PENDIENTE',
    })).toBe(true)
  })

  it('excludes received-device credit notes', () => {
    expect(isCollectablePendingInvoice({
      no_factura: 'NC-20260901-151830-658',
      tipo_factura: 'NOTA_CREDITO',
      estado_factura: 'PENDIENTE',
      referencia_origen: 'RECIBIDO:658',
    })).toBe(false)
  })

  it('recognizes legacy credit notes by payment channel or number', () => {
    expect(isCreditNoteInvoice({ metodo_pago: 'NOTA DE CRÉDITO' })).toBe(true)
    expect(isCreditNoteInvoice({ canal_venta: 'NOTA_CREDITO' })).toBe(true)
    expect(isCreditNoteInvoice({ no_factura: 'NC-OLD-1' })).toBe(true)
  })

  it('does not allow a paid sales invoice in pending cash operations', () => {
    expect(isCollectablePendingInvoice({
      tipo_factura: 'FACTURA_VENTA',
      estado_factura: 'PAGADA',
    })).toBe(false)
  })
})
