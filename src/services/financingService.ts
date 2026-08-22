import { useAlmacenStore } from '@/stores/almacen.store'

export type FrecuenciaFinanciamiento = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL'

export interface FinanciamientoInput {
  cliente_id?: number
  cliente_nombre: string
  cliente_telefono?: string
  monto_original: number
  inicial: number
  tasa_interes: number
  mora_porcentaje: number
  cantidad_cuotas: number
  frecuencia: FrecuenciaFinanciamiento
  primer_vencimiento?: string
  ingreso_mensual?: number
  gastos_mensuales?: number
  garante_nombre?: string
  garante_cedula?: string
  garante_telefono?: string
  documentos?: string[]
  factura_id?: number
  no_factura?: string
}

function siguienteFecha(base: Date, frecuencia: FrecuenciaFinanciamiento, indice: number): Date {
  const fecha = new Date(base)
  if (frecuencia === 'SEMANAL') fecha.setDate(fecha.getDate() + 7 * indice)
  else if (frecuencia === 'QUINCENAL') fecha.setDate(fecha.getDate() + 15 * indice)
  else fecha.setMonth(fecha.getMonth() + indice)
  return fecha
}

export function calcularPlanFinanciamiento(input: FinanciamientoInput) {
  const principal = Math.max(0, Number(input.monto_original || 0) - Number(input.inicial || 0))
  const interesTotal = principal * Math.max(0, Number(input.tasa_interes || 0)) / 100
  const totalFinanciado = Math.round((principal + interesTotal) * 100) / 100
  const cantidad = Math.max(1, Math.floor(Number(input.cantidad_cuotas || 1)))
  const cuotaBase = Math.round((totalFinanciado / cantidad) * 100) / 100
  const inicio = input.primer_vencimiento ? new Date(`${input.primer_vencimiento}T12:00:00`) : new Date()
  const cuotas = Array.from({ length: cantidad }, (_, index) => {
    const total = index === cantidad - 1
      ? Math.round((totalFinanciado - cuotaBase * (cantidad - 1)) * 100) / 100
      : cuotaBase
    return {
      numero: index + 1,
      fecha_vencimiento: siguienteFecha(inicio, input.frecuencia, index).toISOString().slice(0, 10),
      capital: Math.round((principal / cantidad) * 100) / 100,
      interes: Math.round((total - principal / cantidad) * 100) / 100,
      mora: 0,
      total,
      pagado: 0,
      saldo: total,
      estado: 'PENDIENTE',
      pagos: '[]',
    }
  })
  const capacidadPago = Math.max(0, Number(input.ingreso_mensual || 0) - Number(input.gastos_mensuales || 0))
  const equivalenteMensual = cuotaBase * (input.frecuencia === 'SEMANAL' ? 4.33 : input.frecuencia === 'QUINCENAL' ? 2 : 1)
  return {
    principal,
    interes_total: Math.round(interesTotal * 100) / 100,
    total_financiado: totalFinanciado,
    cuota: cuotaBase,
    capacidad_pago: capacidadPago,
    porcentaje_comprometido: capacidadPago > 0 ? Math.round((equivalenteMensual / capacidadPago) * 10000) / 100 : 0,
    recomendacion: capacidadPago <= 0 || equivalenteMensual > capacidadPago * 0.35 ? 'RIESGO_ALTO' : 'APROBABLE',
    cuotas,
  }
}

export async function crearFinanciamiento(input: FinanciamientoInput) {
  const plan = calcularPlanFinanciamiento(input)
  const almacenStore = useAlmacenStore()
  const result = await window.db.insert('financiamientos', {
    ...input,
    documentos: JSON.stringify(input.documentos || []),
    total_financiado: plan.total_financiado,
    capacidad_pago: plan.capacidad_pago,
    estado: 'ACTIVO',
    proximo_vencimiento: plan.cuotas[0]?.fecha_vencimiento || '',
    almacen_id: almacenStore.activeId || 0,
    almacen_uid: almacenStore.activeUid || '',
  })
  if (!result.success) throw new Error(result.error || 'No se pudo crear el financiamiento')
  const id = Number(result.data?.id || result.id || 0)
  for (const cuota of plan.cuotas) {
    const cuotaResult = await window.db.insert('cuotas_financiamiento', {
      ...cuota,
      financiamiento_id: id,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
    })
    if (!cuotaResult.success) throw new Error(cuotaResult.error || 'No se pudo crear el calendario de cuotas')
  }
  return { id, ...plan }
}
