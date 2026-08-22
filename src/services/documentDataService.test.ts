import { describe, expect, it } from 'vitest'
import { getPhoneImeiDetails, getSalesDocumentLabels, prepareDocumentData, translateDocumentCustomerName, translateDocumentPaymentMethod, translateDocumentType } from './documentDataService'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
}, configurable: true })

describe('prepareDocumentData', () => {
  it('usa factura.items cuando productos no viene en la factura', () => {
    const items = [{ nombre: 'Producto de prueba', cantidad: 2, precio: 100 }]

    const result = prepareDocumentData({ factura: { items, total: 200 } })

    expect(result.items).toEqual(items)
  })

  it('usa los items proporcionados cuando productos esta vacio', () => {
    const items = [{ nombre: 'Producto enviado al PDF', cantidad: 1, precio: 50 }]

    const result = prepareDocumentData({ factura: { productos: '' }, items })

    expect(result.items).toEqual(items)
  })

  it('mantiene productos como fuente principal cuando contiene datos', () => {
    const productos = [{ nombre: 'Producto guardado', cantidad: 1, precio: 75 }]

    const result = prepareDocumentData({
      factura: { productos: JSON.stringify(productos) },
      items: [{ nombre: 'Fallback' }],
    })

    expect(result.items).toEqual(productos)
  })
})

describe('getPhoneImeiDetails', () => {
  it('muestra los GB junto al IMEI del telefono', () => {
    expect(getPhoneImeiDetails({ imei: '359999000111222', capacidad: '128' }))
      .toEqual(['359999000111222 — 128 GB'])
  })

  it('relaciona cada IMEI con su capacidad', () => {
    expect(getPhoneImeiDetails({
      imeis: ['111', '222'],
      capacidades: ['128 GB', '256GB'],
    })).toEqual(['111 — 128 GB', '222 — 256GB'])
  })

  it('aplica una capacidad comun a todos los IMEI agrupados', () => {
    expect(getPhoneImeiDetails({ imeis: ['111', '222'], capacidades: ['512'] }))
      .toEqual(['111 — 512 GB', '222 — 512 GB'])
  })
})

describe('traducciones de documentos de venta', () => {
  it('traduce las etiquetas, el pago y el tipo de factura cuando el idioma es ingles', () => {
    storage.set('sistema_idioma', 'en-US')

    expect(getSalesDocumentLabels().customer).toBe('CUSTOMER')
    expect(translateDocumentPaymentMethod('EFECTIVO')).toBe('Cash')
    expect(translateDocumentType('FACTURA_VENTA')).toBe('SALES INVOICE')
    expect(translateDocumentType('COTIZACION')).toBe('QUOTE')
    expect(translateDocumentCustomerName('CONSUMIDOR FINAL')).toBe('FINAL CONSUMER')
  })

  it('mantiene las etiquetas en espanol cuando ese es el idioma activo', () => {
    storage.set('sistema_idioma', 'es')

    expect(getSalesDocumentLabels().customer).toBe('CLIENTE')
    expect(translateDocumentPaymentMethod('TARJETA')).toBe('Tarjeta')
  })
})
