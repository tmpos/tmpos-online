import { describe, expect, it } from 'vitest'
import { distribucionPagoGasto, montoTransferenciaGasto } from './gastosOnlineService'

describe('distribucion de pagos de gastos', () => {
  it('acepta un gasto mixto cuando ambas partes suman el total', () => {
    expect(distribucionPagoGasto({
      cantidad: 100,
      metodo_pago: 'MIXTO',
      efectivo: 35,
      transferencia: 65,
    })).toEqual({ cantidad: 100, metodoPago: 'MIXTO', efectivo: 35, transferencia: 65 })
  })

  it('rechaza una distribucion mixta que no coincide con el total', () => {
    expect(() => distribucionPagoGasto({
      cantidad: 100,
      metodo_pago: 'MIXTO',
      efectivo: 35,
      transferencia: 60,
    })).toThrow('debe coincidir')
  })

  it('usa solamente la parte transferida para afectar el banco', () => {
    expect(montoTransferenciaGasto({ metodo_pago: 'MIXTO', cantidad: 100, transferencia: 65 })).toBe(65)
    expect(montoTransferenciaGasto({ metodo_pago: 'TRANSFERENCIA', cantidad: 100 })).toBe(100)
    expect(montoTransferenciaGasto({ metodo_pago: 'EFECTIVO', cantidad: 100 })).toBe(0)
  })
})
