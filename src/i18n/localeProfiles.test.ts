import { beforeEach, describe, expect, it } from 'vitest'
import { formatSystemCurrency, getFiscalLabels, localeProfiles } from './localeProfiles'

const storage = new Map<string, string>()
Object.defineProperty(globalThis, 'localStorage', { value: {
  getItem: (key: string) => storage.get(key) ?? null,
  setItem: (key: string, value: string) => storage.set(key, String(value)),
  removeItem: (key: string) => storage.delete(key),
  clear: () => storage.clear(),
}, configurable: true })

describe('perfiles regionales', () => {
  beforeEach(() => storage.clear())

  it.each(Object.entries(localeProfiles))('%s tiene moneda, locale y fiscalidad válidos', (country, profile) => {
    storage.set('sistema_pais', country)
    expect(profile.currency).toMatch(/^[A-Z]{3}$/)
    expect(profile.locale).toBeTruthy()
    expect(profile.tax.shortName).toBeTruthy()
    expect(profile.tax.customerIdLabel).toBeTruthy()
    expect(formatSystemCurrency(1234.5)).toContain(profile.currency)
  })

  it('separa Argentina de República Dominicana', () => {
    expect(getFiscalLabels('AR')).toMatchObject({ businessIdLabel: 'CUIT', personalIdLabel: 'DNI', taxAuthority: 'ARCA', electronicProviderEnabled: false })
    expect(getFiscalLabels('DO')).toMatchObject({ businessIdLabel: 'RNC', personalIdLabel: 'Cédula', taxAuthority: 'DGII', electronicProviderEnabled: true })
  })
})
