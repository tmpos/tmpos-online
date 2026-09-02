import { describe, expect, it } from 'vitest'
import { buildSoldImeiInvoiceCostUpdate } from './imeiInvoiceCostSync'

describe('buildSoldImeiInvoiceCostUpdate', () => {
  it('updates a single IMEI and the invoice totals', () => {
    const result = buildSoldImeiInvoiceCostUpdate({
      productos: JSON.stringify([
        { tipo: 'imei', imei_id: 15, imei: 'ABC', cantidad: 1, costo: 100, precio: 160 },
        { tipo: 'accesorio', cantidad: 2, costo: 10, precio: 20 },
      ]),
      costo: 120,
      ganancia: 80,
    }, { id: 15, nombre: 'ABC' }, 100, 125)

    expect(result?.costo).toBe(145)
    expect(result?.ganancia).toBe(55)
    expect(JSON.parse(result!.productos)[0].costo).toBe(125)
  })

  it('recalculates the average cost of a grouped IMEI line', () => {
    const result = buildSoldImeiInvoiceCostUpdate({
      productos: JSON.stringify([
        { tipo: 'imei', imei_ids: [10, 11], imeis: ['AAA', 'BBB'], cantidad: 2, costo: 110, precio: 200 },
      ]),
      ganancia: 180,
    }, { id: 11, nombre: 'BBB' }, 120, 150)

    expect(result?.costo).toBe(250)
    expect(result?.ganancia).toBe(150)
    expect(JSON.parse(result!.productos)[0].costo).toBe(125)
  })

  it('supports old invoices that only stored the IMEI text', () => {
    const result = buildSoldImeiInvoiceCostUpdate({
      productos: JSON.stringify([{ imei: '359 OLD', cantidad: 1, costo: 50 }]),
      ganancia: 30,
    }, { id: 99, nombre: '359 old' }, 50, 40)

    expect(result?.costo).toBe(40)
    expect(result?.ganancia).toBe(40)
  })

  it('repairs a stale invoice when the IMEI already has the new cost', () => {
    const result = buildSoldImeiInvoiceCostUpdate({
      productos: JSON.stringify([
        { tipo: 'imei', imei_id: 651, cantidad: 1, costo: 40000 },
        { tipo: 'accesorio', cantidad: 1, costo: 550 },
      ]),
      costo: 40550,
      ganancia: 2240,
    }, { id: 651 }, 26000, 26000)

    expect(result?.costo).toBe(26550)
    expect(result?.ganancia).toBe(16240)
    expect(JSON.parse(result!.productos)[0].costo).toBe(26000)
  })

  it('supports legacy comma-separated IMEI lists', () => {
    const result = buildSoldImeiInvoiceCostUpdate({
      productos: JSON.stringify([{ lista_imei: '111, 222', cantidad: 2, costo: 75 }]),
      ganancia: 50,
    }, { id: 9, nombre: '222' }, 80, 90)

    expect(result?.costo).toBe(160)
    expect(result?.ganancia).toBe(40)
  })

  it('does not change an unrelated or malformed invoice', () => {
    expect(buildSoldImeiInvoiceCostUpdate({ productos: 'invalid' }, { id: 1 }, 10, 20)).toBeNull()
    expect(buildSoldImeiInvoiceCostUpdate({ productos: '[]' }, { id: 1 }, 10, 20)).toBeNull()
  })
})
