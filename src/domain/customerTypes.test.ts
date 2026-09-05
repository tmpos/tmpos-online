import { describe, expect, it } from 'vitest'
import { customerReceiptType, customerTypeLabel, normalizeCustomerType } from './customerTypes'

describe('customer types', () => {
  it('uses NORMAL for empty and unknown values', () => {
    expect(normalizeCustomerType(undefined)).toBe('NORMAL')
    expect(normalizeCustomerType('unknown')).toBe('NORMAL')
  })

  it('normalizes valid values', () => {
    expect(normalizeCustomerType(' gubernamental ')).toBe('GUBERNAMENTAL')
  })

  it('maps fiscal classifications to their receipts', () => {
    expect(customerReceiptType('CONSUMO')).toBe('E32')
    expect(customerReceiptType('FISCAL')).toBe('E31')
    expect(customerReceiptType('GUBERNAMENTAL')).toBe('E45')
    expect(customerReceiptType('NORMAL')).toBeNull()
  })

  it('returns the user-facing label', () => {
    expect(customerTypeLabel('REGIMEN_ESPECIAL')).toBe('Regimen especial')
  })
})
