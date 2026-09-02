export type ImeiInvoiceReference = {
  id?: number | string | null
  nombre?: string | null
}

export type InvoiceCostUpdate = {
  productos: string
  costo: number
  ganancia: number
}

function list(value: unknown): unknown[] {
  if (Array.isArray(value)) return value
  if (value === null || value === undefined || value === '') return []
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed.startsWith('[')) {
      try {
        const parsed = JSON.parse(trimmed)
        if (Array.isArray(parsed)) return parsed
      } catch {}
    }
    if (trimmed.includes(',')) return trimmed.split(',').map(item => item.trim()).filter(Boolean)
  }
  return [value]
}

function money(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100
}

function unitCost(value: number): number {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

function productHasImei(product: any, imei: ImeiInvoiceReference): boolean {
  const targetId = Number(imei.id || 0)
  const ids = list(product?.imei_ids ?? product?.imei_id)
    .map(value => Number(value))
    .filter(value => Number.isFinite(value) && value > 0)

  if (targetId > 0 && ids.includes(targetId)) return true
  if (ids.length > 0) return false

  const targetName = String(imei.nombre || '').trim().toUpperCase()
  if (!targetName) return false
  const names = [product?.imeis, product?.imei, product?.lista_imei]
    .flatMap(value => list(value))
    .map(value => String(typeof value === 'object' && value ? (value as any).imei || '' : value || '').trim().toUpperCase())
    .filter(Boolean)
  return names.includes(targetName)
}

function parseProducts(value: unknown): any[] | null {
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(String(value || '[]'))
    return Array.isArray(parsed) ? parsed : null
  } catch {
    return null
  }
}

/** Actualiza el costo del IMEI dentro de los productos y totales de una factura. */
export function buildSoldImeiInvoiceCostUpdate(
  invoice: any,
  imei: ImeiInvoiceReference,
  previousCostValue: unknown,
  nextCostValue: unknown,
): InvoiceCostUpdate | null {
  const products = parseProducts(invoice?.productos)
  if (!products) return null

  const previousCost = Number(previousCostValue || 0)
  const nextCost = Number(nextCostValue || 0)
  if (!Number.isFinite(previousCost) || !Number.isFinite(nextCost)) return null

  const productIndex = products.findIndex(product => productHasImei(product, imei))
  if (productIndex < 0) return null

  const productsCost = (items: any[]) => items.reduce((total, product) => {
    return total + (Number(product?.costo || 0) * Math.max(1, Number(product?.cantidad || 1)))
  }, 0)
  const originalProductsCost = productsCost(products)

  const updatedProducts = products.map((product, index) => {
    if (index !== productIndex) return product
    const quantity = Math.max(1, Number(product?.cantidad || 1))
    const currentLineCost = Number(product?.costo || 0) * quantity
    return {
      ...product,
      // Para una venta individual, la factura es la fuente que puede haber
      // quedado desfasada: se reemplaza su costo directamente. En lineas
      // agrupadas se conserva el promedio de los demas IMEIs.
      costo: quantity === 1
        ? unitCost(nextCost)
        : unitCost((currentLineCost - previousCost + nextCost) / quantity),
    }
  })

  const updatedProductsCost = productsCost(updatedProducts)
  const costDifference = updatedProductsCost - originalProductsCost
  const savedProfit = Number(invoice?.ganancia)
  const previousProfit = Number.isFinite(savedProfit)
    ? savedProfit
    : Number(invoice?.total || 0) - originalProductsCost

  return {
    productos: JSON.stringify(updatedProducts),
    costo: money(updatedProductsCost),
    ganancia: money(previousProfit - costDifference),
  }
}
