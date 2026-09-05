import { describe, expect, it } from 'vitest'
import { calculateSalesCommission, commissionProductKey, type UserCommissionPlan } from './salesCommissions'

const plan = (overrides: Partial<UserCommissionPlan> = {}): UserCommissionPlan => ({
  userId: 7,
  userName: 'Vendedor',
  enabled: true,
  applyGeneral: true,
  generalType: 'PERCENTAGE',
  generalValue: 10,
  products: [],
  ...overrides,
})

describe('sales commissions', () => {
  it('calcula porcentaje general sobre cada linea', () => {
    const result = calculateSalesCommission(plan(), [{ tipo: 'accesorio', accesorio_id: 3, nombre: 'Cable', cantidad: 2, precio: 100 }])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ productKey: 'accesorio:3', base: 200, amount: 20, source: 'GENERAL' })
  })

  it('calcula el monto fijo por cada unidad vendida', () => {
    const result = calculateSalesCommission(plan({ generalType: 'FIXED', generalValue: 75 }), [{ tipo: 'accesorio', accesorio_id: 3, cantidad: 3, precio: 100 }])
    expect(result[0].amount).toBe(225)
  })

  it('permite comisiones solo para productos seleccionados', () => {
    const result = calculateSalesCommission(plan({
      applyGeneral: false,
      products: [{ productKey: 'telefono:9', productName: 'Telefono X', type: 'FIXED', value: 500 }],
    }), [
      { tipo: 'imei', telefono_id: 9, nombre: 'Telefono X', cantidad: 1, precio: 10000 },
      { tipo: 'accesorio', accesorio_id: 4, nombre: 'Protector', cantidad: 1, precio: 500 },
    ])
    expect(result).toHaveLength(1)
    expect(result[0]).toMatchObject({ productKey: 'telefono:9', amount: 500, source: 'PRODUCT' })
  })

  it('la regla del producto reemplaza la regla general', () => {
    const result = calculateSalesCommission(plan({
      products: [{ productKey: 'electrodomestico:2', productName: 'Nevera', type: 'PERCENTAGE', value: 5 }],
    }), [{ tipo: 'serial', electrodomestico_id: 2, cantidad: 1, precio: 20000 }])
    expect(result[0].amount).toBe(1000)
    expect(result[0].source).toBe('PRODUCT')
  })

  it('prioriza la comision configurada directamente en el accesorio', () => {
    const result = calculateSalesCommission(plan({ applyGeneral: false }), [{
      tipo: 'accesorio', accesorio_id: 12, nombre: 'Cargador', cantidad: 2, precio: 800,
      tipo_comision: 'FIXED', valor_comision: 125,
    }])
    expect(result[0]).toMatchObject({ productKey: 'accesorio:12', amount: 250, source: 'PRODUCT' })
  })

  it('aplica el porcentaje propio del accesorio solo con el plan del vendedor activo', () => {
    const accessory = { tipo: 'accesorio', accesorio_id: 5, cantidad: 1, precio: 2000, tipo_comision: 'PERCENTAGE', valor_comision: 7.5 }
    expect(calculateSalesCommission(plan({ applyGeneral: false }), [accessory])[0].amount).toBe(150)
    expect(calculateSalesCommission(plan({ enabled: false }), [accessory])).toEqual([])
  })
  it('no genera comisiones con el plan desactivado', () => {
    expect(calculateSalesCommission(plan({ enabled: false }), [{ precio: 1000, cantidad: 1 }])).toEqual([])
    expect(commissionProductKey({ tipo: 'serial', electrodomestico_id: 8 })).toBe('electrodomestico:8')
  })
})