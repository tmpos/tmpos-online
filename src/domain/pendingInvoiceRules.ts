function normalizeMarker(value: unknown): string {
  return String(value || '')
    .trim()
    .toUpperCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[\s-]+/g, '_')
}

export function isCreditNoteInvoice(invoice: any): boolean {
  const markers = [invoice?.tipo_factura, invoice?.metodo_pago, invoice?.canal_venta]
    .map(normalizeMarker)
  const origin = normalizeMarker(invoice?.referencia_origen)
  const invoiceNumber = String(invoice?.no_factura || '').trim().toUpperCase()

  return markers.some(marker => /NOTA_(?:DE_)?CREDITO/.test(marker)) ||
    origin.startsWith('RECIBIDO:') ||
    invoiceNumber.startsWith('NC-')
}

export function isCollectablePendingInvoice(invoice: any): boolean {
  return normalizeMarker(invoice?.estado_factura) === 'PENDIENTE' && !isCreditNoteInvoice(invoice)
}
