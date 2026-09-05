export type CommissionValueType = 'PERCENTAGE' | 'FIXED'

export interface ProductCommissionRule {
  productKey: string
  productName: string
  type: CommissionValueType
  value: number
}

export interface UserCommissionPlan {
  userId: number
  userName: string
  enabled: boolean
  applyGeneral: boolean
  generalType: CommissionValueType
  generalValue: number
  products: ProductCommissionRule[]
}

export interface CommissionLine {
  productKey: string
  productName: string
  quantity: number
  base: number
  type: CommissionValueType
  value: number
  amount: number
  source: 'PRODUCT' | 'GENERAL'
}

export const COMMISSION_CONFIG_KEY = 'sales_commission_plans_v1'
export const USER_WARNINGS_KEY = 'user_warnings_v1'

export function commissionProductKey(item: any): string {
  if (item?.tipo === 'imei' || item?.telefono_id) return `telefono:${Number(item.telefono_id || item.id || 0)}`
  if (item?.tipo === 'serial' || item?.electrodomestico_id) return `electrodomestico:${Number(item.electrodomestico_id || item.id || 0)}`
  if (item?.tipo === 'accesorio' || item?.accesorio_id) return `accesorio:${Number(item.accesorio_id || item.id || 0)}`
  return `${String(item?.tipo || 'producto')}:${Number(item?.producto_id || item?.id || 0)}`
}

export function calculateSalesCommission(plan: UserCommissionPlan | undefined, items: any[]): CommissionLine[] {
  if (!plan?.enabled) return []
  const rules = new Map((plan.products || []).map(rule => [rule.productKey, rule]))
  return items.flatMap((item): CommissionLine[] => {
    const quantity = Math.max(0, Number(item?.cantidad || item?.quantity || 1))
    const base = Math.max(0, Number(item?.precio || item?.precio_venta || 0) * quantity)
    const configuredType = String(item?.tipo_comision || item?.commission_type || '').toUpperCase()
    const configuredValue = Math.max(0, Number(item?.valor_comision ?? item?.commission_value ?? 0))
    const hasProductCommission = ['PERCENTAGE', 'FIXED'].includes(configuredType) && configuredValue > 0
    const rule = rules.get(commissionProductKey(item))
    if (!hasProductCommission && !rule && !plan.applyGeneral) return []
    const type = (hasProductCommission ? configuredType : rule?.type || plan.generalType) as CommissionValueType
    const value = hasProductCommission ? configuredValue : Math.max(0, Number(rule?.value ?? plan.generalValue ?? 0))
    if (value <= 0 || base <= 0) return []
    const amount = type === 'PERCENTAGE' ? base * value / 100 : value * quantity
    return [{
      productKey: commissionProductKey(item),
      productName: String(item?.nombre || item?.descripcion || 'Producto'),
      quantity,
      base,
      type,
      value,
      amount: Number(amount.toFixed(2)),
      source: hasProductCommission || rule ? 'PRODUCT' : 'GENERAL',
    }]
  })
}
