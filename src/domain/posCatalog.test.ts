import { describe, expect, it } from 'vitest'
import { searchGlobalPosCatalog } from './posCatalog'

const catalog = {
  hideOutOfStock: true,
  phones: [{ id: 1, nombre: 'Galaxy S25' }],
  appliances: [{ id: 2, nombre: 'Nevera Polar' }],
  accessories: [
    { id: 3, nombre: 'Cargador rápido', codigo_barra: 'ACC-100', cantidad: 4 },
    { id: 4, nombre: 'Cable agotado', codigo_barra: 'ACC-200', cantidad: 0 },
  ],
  imeis: [{ id: 10, id_equi: 1, nombre: '359999000111222' }],
  serials: [{ id: 20, id_equi: 2, nombre: 'SER-NEV-001' }],
  imeiBelongsToPhone: (imei: any, phone: any) => imei.id_equi === phone.id,
  serialBelongsToAppliance: (serial: any, appliance: any) => serial.id_equi === appliance.id,
}

describe('búsqueda global del POS', () => {
  it.each([
    ['Galaxy', 'telefono'],
    ['359999000111222', 'imei'],
    ['Nevera', 'electrodomestico'],
    ['SER-NEV-001', 'serial'],
    ['ACC-100', 'accesorio'],
  ])('encuentra %s sin depender de la pestaña activa', (query, type) => {
    const results = searchGlobalPosCatalog({ ...catalog, query })
    expect(results.some(result => result.type === type)).toBe(true)
  })

  it('respeta el filtro de productos con stock', () => {
    expect(searchGlobalPosCatalog({ ...catalog, query: 'Cable' })).toEqual([])
    expect(searchGlobalPosCatalog({ ...catalog, query: 'Cable', hideOutOfStock: false })[0]?.type).toBe('accesorio')
  })
})
