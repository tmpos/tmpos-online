import { describe, expect, it } from 'vitest'
import { compareVersions, isVersionNewer } from './versioning'

describe('versioning', () => {
  it('compara segmentos numericamente', () => {
    expect(isVersionNewer('2.13.10', '2.13.9')).toBe(true)
    expect(isVersionNewer('2.13.9', '2.13.10')).toBe(false)
  })

  it('acepta el prefijo v y segmentos faltantes', () => {
    expect(compareVersions('v3.0', '3.0.0')).toBe(0)
    expect(isVersionNewer('v3.1.0', '3.0')).toBe(true)
  })

  it('considera una version estable superior a su prerelease', () => {
    expect(isVersionNewer('2.14.0', '2.14.0-beta.2')).toBe(true)
    expect(isVersionNewer('2.14.0-beta.2', '2.14.0')).toBe(false)
  })
})
