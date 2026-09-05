import { describe, expect, it } from 'vitest'
import { summarizeCashClosingExpenses } from './cashClosingExpenses'

describe('summarizeCashClosingExpenses', () => {
  it('separates cash, transfer, mixed and legacy expenses', () => {
    expect(summarizeCashClosingExpenses([
      { cantidad: 100, metodo_pago: 'EFECTIVO' },
      { cantidad: 200, metodo_pago: 'TRANSFERENCIA' },
      { cantidad: 300, metodo_pago: 'MIXTO', efectivo: 125, transferencia: 175 },
      { monto: 50 },
    ])).toEqual({
      total: 650,
      efectivo: 275,
      transferencia: 375,
      tarjeta: 0,
      cantidad: 4,
    })
  })

  it('assigns an incomplete mixed distribution remainder to cash', () => {
    expect(summarizeCashClosingExpenses([
      { cantidad: 100, metodo_pago: 'MIXTO', efectivo: 25, transferencia: 40 },
    ])).toEqual({
      total: 100,
      efectivo: 60,
      transferencia: 40,
      tarjeta: 0,
      cantidad: 1,
    })
  })

  it('ignores invalid and non-positive values', () => {
    expect(summarizeCashClosingExpenses([
      { cantidad: 0 },
      { cantidad: -10 },
      { cantidad: 'invalid' },
    ])).toEqual({
      total: 0,
      efectivo: 0,
      transferencia: 0,
      tarjeta: 0,
      cantidad: 0,
    })
  })
})
