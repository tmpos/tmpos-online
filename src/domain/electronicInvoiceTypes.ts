export const POS_SALE_ECF_TYPES = ['E31', 'E32', 'E45'] as const

export type PosSaleEcfType = typeof POS_SALE_ECF_TYPES[number]

export function normalizeEcfType(value: unknown): string {
  return String(value || '').trim().toUpperCase()
}

export function isSupportedPosSaleEcf(value: unknown): value is PosSaleEcfType {
  return POS_SALE_ECF_TYPES.includes(normalizeEcfType(value) as PosSaleEcfType)
}

export function alanubeSaleEndpoint(value: unknown): string | null {
  const type = normalizeEcfType(value)
  if (type === 'E31') return 'fiscal-invoices'
  if (type === 'E32') return 'invoices'
  if (type === 'E45') return 'gubernamentals'
  return null
}

export function saleEcfRequiresBuyer(value: unknown): boolean {
  const type = normalizeEcfType(value)
  return type === 'E31' || type === 'E45'
}
