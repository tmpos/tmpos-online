export const CUSTOMER_TYPE_OPTIONS = [
  { label: 'Normal', value: 'NORMAL', receiptType: null },
  { label: 'Consumidor final', value: 'CONSUMO', receiptType: 'E32' },
  { label: 'Credito fiscal', value: 'FISCAL', receiptType: 'E31' },
  { label: 'Gubernamental', value: 'GUBERNAMENTAL', receiptType: 'E45' },
  { label: 'Regimen especial', value: 'REGIMEN_ESPECIAL', receiptType: 'E44' },
  { label: 'Exportacion', value: 'EXPORTACION', receiptType: 'E46' },
] as const

export type CustomerType = typeof CUSTOMER_TYPE_OPTIONS[number]['value']

export function normalizeCustomerType(value: unknown): CustomerType {
  const normalized = String(value || '').trim().toUpperCase()
  return CUSTOMER_TYPE_OPTIONS.some(option => option.value === normalized)
    ? normalized as CustomerType
    : 'NORMAL'
}

export function customerTypeLabel(value: unknown): string {
  const normalized = normalizeCustomerType(value)
  return CUSTOMER_TYPE_OPTIONS.find(option => option.value === normalized)?.label || 'Normal'
}

export function customerReceiptType(value: unknown): string | null {
  const normalized = normalizeCustomerType(value)
  return CUSTOMER_TYPE_OPTIONS.find(option => option.value === normalized)?.receiptType || null
}
