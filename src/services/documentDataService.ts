import { getLocaleProfile } from '@/i18n/localeProfiles'

function parseItems(value: unknown, fallback: any[] = []): any[] {
  if (Array.isArray(value)) return value
  if (value == null || String(value).trim() === '') return fallback
  try {
    const parsed = JSON.parse(String(value))
    return Array.isArray(parsed) ? parsed : fallback
  } catch { return fallback }
}

function parseTextList(value: unknown): string[] {
  const values = Array.isArray(value) ? value : (value == null ? [] : [value])
  return values
    .flatMap((item) => typeof item === 'string' ? item.split(',') : [item])
    .map((item: any) => String(item?.imei ?? item?.nombre ?? item ?? '').trim())
    .filter(Boolean)
}

function formatStorageCapacity(value: string): string {
  if (!value) return ''
  if (/\b(?:KB|MB|GB|TB)\b/i.test(value)) return value
  return /^\d+(?:[.,]\d+)?$/.test(value) ? `${value} GB` : value
}

export function getPhoneImeiDetails(item: any): string[] {
  const imeis = parseTextList(item?.imeis?.length ? item.imeis : item?.imei)
  if (!imeis.length) return []

  const capacities = parseTextList(item?.capacidades?.length ? item.capacidades : item?.capacidad)
  return imeis.map((imei, index) => {
    const capacity = formatStorageCapacity(capacities[index] || (capacities.length === 1 ? capacities[0] : ''))
    return capacity ? `${imei} — ${capacity}` : imei
  })
}

const documentLabels = {
  es: {
    language: 'es', date: 'Fecha', quote: 'Cotización', invoice: 'Factura', creditInvoice: 'FACTURA A CRÉDITO',
    salesInvoice: 'FACTURA DE VENTA', customer: 'CLIENTE', phone: 'TELÉFONO', address: 'DIRECCIÓN',
    paymentMethod: 'MÉTODO DE PAGO', seller: 'VENDEDOR', cashier: 'CAJERO', code: 'CÓD.', description: 'DESCRIPCIÓN',
    quantity: 'CANT.', package: 'EMPAQ.', unitPrice: 'P.U.', price: 'PRECIO', discount: 'DESC.', subtotal: 'SUBTOTAL',
    total: 'TOTAL', observation: 'OBSERVACIÓN', deliveredBy: 'ENTREGADO POR', receivedBy: 'RECIBIDO POR',
    unregistered: 'SIN REGISTRO', finalConsumer: 'CONSUMIDOR FINAL', company: 'MI EMPRESA', notApplicable: 'N/A', user: 'Usuario', thanks: '¡Gracias por su compra!',
    quoteValidity: 'Esta cotización tiene una validez de 30 días', paidWith: 'PAGO CON', change: 'SU CAMBIO',
    securityCode: 'Código de seguridad', cash: 'Efectivo', card: 'Tarjeta', transfer: 'Transferencia',
    check: 'Cheque', mixed: 'MIXTO', credit: 'CRÉDITO', saleInvoiceType: 'FACTURA_VENTA',
  },
  en: {
    language: 'en', date: 'Date', quote: 'Quote', invoice: 'Invoice', creditInvoice: 'CREDIT INVOICE',
    salesInvoice: 'SALES INVOICE', customer: 'CUSTOMER', phone: 'PHONE', address: 'ADDRESS',
    paymentMethod: 'PAYMENT METHOD', seller: 'SALESPERSON', cashier: 'CASHIER', code: 'CODE', description: 'DESCRIPTION',
    quantity: 'QTY.', package: 'PACK', unitPrice: 'UNIT PRICE', price: 'PRICE', discount: 'DISC.', subtotal: 'SUBTOTAL',
    total: 'TOTAL', observation: 'NOTE', deliveredBy: 'DELIVERED BY', receivedBy: 'RECEIVED BY',
    unregistered: 'NOT PROVIDED', finalConsumer: 'FINAL CONSUMER', company: 'MY COMPANY', notApplicable: 'N/A', user: 'User', thanks: 'Thank you for your purchase!',
    quoteValidity: 'This quote is valid for 30 days', paidWith: 'AMOUNT PAID', change: 'CHANGE',
    securityCode: 'Security code', cash: 'Cash', card: 'Card', transfer: 'Transfer',
    check: 'Check', mixed: 'MIXED', credit: 'CREDIT', saleInvoiceType: 'FACTURA_VENTA',
  },
} as const

export function getSalesDocumentLabels() {
  const language = localStorage.getItem('sistema_idioma') || 'es'
  return language.toLowerCase().startsWith('en') ? documentLabels.en : documentLabels.es
}

export function translateDocumentPaymentMethod(value: any): string {
  const labels = getSalesDocumentLabels()
  const method = String(value || '').trim()
  const translations: Record<string, string> = {
    EFECTIVO: labels.cash,
    TARJETA: labels.card,
    TRANSFERENCIA: labels.transfer,
    CHEQUE: labels.check,
    MIXTO: labels.mixed,
    CREDITO: labels.credit,
    CRÉDITO: labels.credit,
  }
  return translations[method.toUpperCase()] || method
}

export function translateDocumentType(value: any): string {
  const labels = getSalesDocumentLabels()
  const type = String(value || '').trim().toUpperCase()
  if (type.includes('COTIZACION') || type.includes('COTIZACIÓN')) return labels.quote.toUpperCase()
  if (type === labels.saleInvoiceType || type === 'FACTURA' || type === 'FACTURA DE VENTA') return labels.salesInvoice
  return String(value || labels.salesInvoice)
}

export function translateDocumentCustomerName(value: any): string {
  const labels = getSalesDocumentLabels()
  const name = String(value || '').trim()
  return !name || name.toUpperCase() === 'CONSUMIDOR FINAL' ? labels.finalConsumer : name
}

export function prepareDocumentData(input: { factura: any; empresa?: any; cliente?: any; items?: any[] }) {
  const factura = input.factura || {}
  const items = parseItems(factura.productos, input.items || factura.items || [])
  const total = Number(factura.total || 0)
  const tax = Number(factura.impuesto ?? factura.impuestos ?? 0)
  const discount = Number(factura.descuento || 0)
  const subtotal = Number(factura.subtotal ?? (total + discount - tax))
  const profile = getLocaleProfile()
  const customer = {
    nombre: translateDocumentCustomerName(factura.nombre_cliente || factura.cliente || input.cliente?.nombre),
    documento: factura.rnc_cliente || factura.cedula_cliente || factura.cod_cliente || input.cliente?.rnc || input.cliente?.cedula || '',
    telefono: factura.telefono_cliente || input.cliente?.telefono || input.cliente?.whatsapp || '',
    direccion: factura.direccion_cliente || input.cliente?.direccion || '',
  }
  return {
    factura,
    empresa: input.empresa || factura.empresa || {},
    customer,
    items,
    totals: { subtotal, discount, tax, total },
    regional: profile,
    documentNumber: factura.ncf || factura.comprobante || '',
    isQuote: String(factura.tipo_factura || factura.estado_factura || '').toLowerCase().includes('cotizacion'),
  }
}
