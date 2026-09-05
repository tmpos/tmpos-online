import { describe, expect, it } from 'vitest'
import {
  alanubeSaleEndpoint,
  isSupportedPosSaleEcf,
  saleEcfRequiresBuyer,
} from './electronicInvoiceTypes'

describe('electronic invoice sale types', () => {
  it('supports governmental E45 sales', () => {
    expect(isSupportedPosSaleEcf('e45')).toBe(true)
    expect(alanubeSaleEndpoint('E45')).toBe('gubernamentals')
    expect(saleEcfRequiresBuyer('E45')).toBe(true)
  })

  it('preserves the existing E31 and E32 routes', () => {
    expect(alanubeSaleEndpoint('E31')).toBe('fiscal-invoices')
    expect(alanubeSaleEndpoint('E32')).toBe('invoices')
    expect(saleEcfRequiresBuyer('E31')).toBe(true)
    expect(saleEcfRequiresBuyer('E32')).toBe(false)
  })

  it('rejects document types that do not belong to the POS sale flow', () => {
    expect(isSupportedPosSaleEcf('E34')).toBe(false)
    expect(alanubeSaleEndpoint('E34')).toBeNull()
  })
})
