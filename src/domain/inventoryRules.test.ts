import { describe, expect, it } from 'vitest'
import { assertAvailableInventory, assertSameWarehouse, belongsToWarehouse, validateWarehouseConversion } from './inventoryRules'

describe('venta e inventario por almacén', () => {
  it('rechaza IMEI vendido y stock insuficiente antes del cierre', () => {
    expect(() => assertAvailableInventory('imei', { id: 1, nombre: '123', estado: 'VENDIDO' })).toThrow(/no está disponible/)
    expect(() => assertAvailableInventory('accesorios', { id: 2, nombre: 'Cable', cantidad: 1 }, 2)).toThrow(/Stock insuficiente/)
  })

  it('acepta inventario disponible con stock suficiente', () => {
    expect(() => assertAvailableInventory('serial', { estado: 'DISPONIBLE' })).not.toThrow()
    expect(() => assertAvailableInventory('accesorios', { cantidad: 5 }, 3)).not.toThrow()
  })

  it.each(['cotización', 'apartado', 'devolución', 'venta a crédito', 'traslado'])('aísla %s por almacén', operation => {
    const source = { id: 10, almacen_uid: 'almacen-a' }
    expect(validateWarehouseConversion(source, { uid: 'almacen-a' }, operation)).toBe(true)
    expect(() => validateWarehouseConversion(source, { uid: 'almacen-b' }, operation)).toThrow(/otro almacén/)
  })

  it('filtra por UID y usa ID como respaldo', () => {
    expect(belongsToWarehouse({ almacen_uid: 'a' }, { uid: 'a' })).toBe(true)
    expect(belongsToWarehouse({ almacen_id: 1 }, { id: 2 })).toBe(false)
    expect(() => assertSameWarehouse({ almacen_uid: 'a' }, { uid: 'b' })).toThrow()
  })
})
