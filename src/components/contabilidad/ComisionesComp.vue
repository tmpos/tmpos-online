<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'
import Button from 'primevue/button'
import Column from 'primevue/column'
import DataTable from 'primevue/datatable'
import Dialog from 'primevue/dialog'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Textarea from 'primevue/textarea'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import jsPDF from 'jspdf'
import { autoTable } from 'jspdf-autotable'
import { useAlmacenFilter } from '@/composables/useAlmacenFilter'
import { formatSystemCurrency } from '@/i18n/localeProfiles'
import { COMMISSION_CONFIG_KEY, USER_WARNINGS_KEY, calculateSalesCommission, type CommissionValueType, type UserCommissionPlan } from '@/domain/salesCommissions'

type Section = 'generated' | 'plans' | 'warnings'
interface WarningRecord {
  id: string
  userId: number
  userName: string
  type: string
  reason: string
  notes: string
  date: string
  createdAt: string
  economicAmount?: number
  economicStatus?: 'PENDIENTE' | 'APLICADA' | 'NO_APLICA'
  appliedAt?: string
}

const toast = useToast()
const { filterByAlmacen } = useAlmacenFilter()
const loading = ref(true)
const section = ref<Section>('generated')
const commissions = ref<any[]>([])
const plans = ref<UserCommissionPlan[]>([])
const warnings = ref<WarningRecord[]>([])
const users = ref<any[]>([])
const products = ref<any[]>([])
const statusFilter = ref('TODAS')
const userFilter = ref<number | null>(null)
const periodFilter = ref<'TODAS' | 'HOY' | 'SEMANA' | 'MES' | 'RANGO'>('MES')
const dateFrom = ref('')
const dateTo = ref('')
const payingUserId = ref<number | null>(null)
const paymentDialog = ref(false)
const paymentCandidate = ref<any>(null)
const generatingPdfUserId = ref<number | null>(null)
const generatingWarningPdfId = ref<string | null>(null)
const pdfDialog = ref(false)
const pdfPreviewUrl = ref('')
const pdfFileName = ref('')
const sellerChangeDialog = ref(false)
const sellerChangeCandidate = ref<any>(null)
const sellerChangeInvoice = ref<any>(null)
const sellerChangeUserId = ref<number | null>(null)
const sellerChangeLines = ref<any[]>([])
const loadingSellerChange = ref(false)
const savingSellerChange = ref(false)
const sellerChangeAmount = computed(() => sellerChangeLines.value.reduce((sum, line) => sum + Number(line.amount || 0), 0))
const sellerChangePlan = computed(() => plans.value.find(item => Number(item.userId) === Number(sellerChangeUserId.value)))
const periodOptions = [
  { label: 'Todo', value: 'TODAS' },
  { label: 'Hoy', value: 'HOY' },
  { label: 'Esta semana', value: 'SEMANA' },
  { label: 'Este mes', value: 'MES' },
  { label: 'Rango', value: 'RANGO' },
]
const planDialog = ref(false)
const warningDialog = ref(false)
const plan = ref<UserCommissionPlan | null>(null)
const rule = ref<{ productKey: string | null; type: CommissionValueType; value: number }>({ productKey: null, type: 'PERCENTAGE', value: 0 })
const warningPeriodFilter = ref<'TODAS' | 'HOY' | 'SEMANA' | 'MES' | 'RANGO'>('TODAS')
const warningDateFrom = ref('')
const warningDateTo = ref('')
const warningForm = ref({ userId: null as number | null, type: 'AMONESTACION', reason: '', notes: '', date: localDateKey(new Date()), economicAmount: 0 })
const typeOptions = [{ label: 'Porcentaje (%)', value: 'PERCENTAGE' }, { label: 'Monto fijo por unidad', value: 'FIXED' }]
const warningTypes = ['AMONESTACION', 'AMONESTACION ECONOMICA', 'ADVERTENCIA', 'SUSPENSION', 'OTRA']

const filteredWarnings = computed(() => warnings.value
  .filter(item => {
    const date = warningDateKey(item)
    if (warningDateFrom.value && (!date || date < warningDateFrom.value)) return false
    if (warningDateTo.value && (!date || date > warningDateTo.value)) return false
    return true
  })
  .slice()
  .sort((a, b) => `${warningDateKey(b)} ${b.createdAt || ''}`.localeCompare(`${warningDateKey(a)} ${a.createdAt || ''}`)))

const warningEconomicSummary = computed(() => filteredWarnings.value.reduce((acc, item) => {
  const amount = Number(item.economicAmount || 0)
  if (amount <= 0) return acc
  acc.total += amount
  if (item.economicStatus === 'APLICADA') acc.applied += amount
  else acc.pending += amount
  return acc
}, { total: 0, pending: 0, applied: 0 }))

function localDateKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`
}

function warningDateKey(item: WarningRecord): string {
  const raw = String(item?.date || item?.createdAt || '').trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : localDateKey(parsed)
}

function normalizeWarningDate(item: WarningRecord): WarningRecord {
  const createdAt = String(item?.createdAt || '')
  const created = new Date(createdAt)
  if (!createdAt || Number.isNaN(created.getTime())) return item
  const utcDate = createdAt.match(/^(\d{4}-\d{2}-\d{2})/)?.[1] || ''
  const correctLocalDate = localDateKey(created)
  return item.date === utcDate && utcDate !== correctLocalDate ? { ...item, date: correctLocalDate } : item
}

function applyWarningPeriod(period = warningPeriodFilter.value) {
  if (period === 'RANGO') return
  if (period === 'TODAS') {
    warningDateFrom.value = ''
    warningDateTo.value = ''
    return
  }
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (period === 'SEMANA') {
    const day = start.getDay() || 7
    start.setDate(start.getDate() - day + 1)
  } else if (period === 'MES') {
    start.setDate(1)
  }
  warningDateFrom.value = localDateKey(start)
  warningDateTo.value = localDateKey(today)
}
function commissionDateKey(item: any): string {
  const raw = String(item?.created_at || item?.fecha || '').trim()
  const match = raw.match(/^(\d{4}-\d{2}-\d{2})/)
  if (match) return match[1]
  const parsed = new Date(raw)
  return Number.isNaN(parsed.getTime()) ? '' : localDateKey(parsed)
}
function applyPeriod(period = periodFilter.value) {
  if (period === 'RANGO') return
  if (period === 'TODAS') { dateFrom.value = ''; dateTo.value = ''; return }
  const today = new Date()
  const start = new Date(today.getFullYear(), today.getMonth(), today.getDate())
  if (period === 'SEMANA') {
    const day = start.getDay() || 7
    start.setDate(start.getDate() - day + 1)
  } else if (period === 'MES') start.setDate(1)
  dateFrom.value = localDateKey(start)
  dateTo.value = localDateKey(today)
}

const commissionUserOptions = computed(() => {
  const options = users.value.map(user => ({ id: Number(user.id), displayName: user.displayName }))
  for (const item of commissions.value) {
    const id = Number(item.vendedor_id || 0)
    if (id && !options.some(option => option.id === id)) options.push({ id, displayName: String(item.vendedor || `Usuario ${id}`) })
  }
  return options.sort((a, b) => a.displayName.localeCompare(b.displayName))
})

const commissionsInScope = computed(() => commissions.value
  .filter(item => userFilter.value === null || Number(item.vendedor_id || 0) === Number(userFilter.value))
  .filter(item => {
    const date = commissionDateKey(item)
    if (dateFrom.value && (!date || date < dateFrom.value)) return false
    if (dateTo.value && (!date || date > dateTo.value)) return false
    return true
  }))

const filteredCommissions = computed(() => commissionsInScope.value
  .filter(item => statusFilter.value === 'TODAS' || item.estado === statusFilter.value)
  .slice()
  .sort((a, b) => `${commissionDateKey(b)} ${b.created_at || ''} ${Number(b.id || 0)}`.localeCompare(`${commissionDateKey(a)} ${a.created_at || ''} ${Number(a.id || 0)}`)))

const summary = computed(() => commissionsInScope.value.reduce((acc, item) => {
  const amount = Number(item.monto || 0); acc.total += amount
  if (item.estado === 'PAGADA') acc.paid += amount; else acc.pending += amount
  return acc
}, { total: 0, pending: 0, paid: 0 }))

const userSummaries = computed(() => {
  const grouped = new Map<number, any>()
  for (const item of commissionsInScope.value) {
    const id = Number(item.vendedor_id || 0)
    const current = grouped.get(id) || { userId: id, userName: item.vendedor || `Usuario ${id}`, invoices: 0, sales: 0, total: 0, pending: 0, paid: 0 }
    const amount = Number(item.monto || 0)
    current.invoices++
    current.sales += Number(item.total_venta || 0)
    current.total += amount
    if (item.estado === 'PAGADA') current.paid += amount; else current.pending += amount
    grouped.set(id, current)
  }
  return [...grouped.values()].sort((a, b) => b.pending - a.pending || a.userName.localeCompare(b.userName))
})

watch(periodFilter, applyPeriod)
watch(warningPeriodFilter, applyWarningPeriod)
applyPeriod('MES')
applyWarningPeriod('TODAS')

const labelUser = (u: any) => String(u?.nombre || u?.usuario || u?.email || `Usuario ${u?.id || ''}`)
const labelProduct = (p: any) => String(p?.nombre || p?.modelo || p?.descripcion || `Producto ${p?.id || ''}`)
function parseConfig<T>(value: any, fallback: T): T { try { return JSON.parse(String(value ?? '')) ?? fallback } catch { return fallback } }

async function loadAll() {
  loading.value = true
  try {
    const [c, u, t, a, e, p, w] = await Promise.all([
      window.db.getAll('comisiones'), window.db.getAll('usuarios'), window.db.getAll('telefonos'),
      window.db.getAll('accesorios'), window.db.getAll('electrodomesticos'),
      window.config.get(COMMISSION_CONFIG_KEY), window.config.get(USER_WARNINGS_KEY),
    ])
    commissions.value = c.success ? filterByAlmacen(c.data || []) : []
    users.value = (u.success ? u.data || [] : []).filter((x: any) => String(x.estado || 'ACTIVADO').toUpperCase() !== 'DESACTIVADO').map((x: any) => ({ ...x, displayName: labelUser(x) }))
    products.value = [
      ...(t.success ? t.data || [] : []).map((x: any) => ({ key: `telefono:${x.id}`, name: labelProduct(x) })),
      ...(a.success ? a.data || [] : []).map((x: any) => ({ key: `accesorio:${x.id}`, name: labelProduct(x) })),
      ...(e.success ? e.data || [] : []).map((x: any) => ({ key: `electrodomestico:${x.id}`, name: labelProduct(x) })),
    ].sort((x, y) => x.name.localeCompare(y.name))
    plans.value = parseConfig<UserCommissionPlan[]>(p?.data, [])
    const storedWarnings = parseConfig<WarningRecord[]>(w?.data, [])
    const normalizedWarnings = storedWarnings.map(normalizeWarningDate)
    warnings.value = normalizedWarnings
    if (JSON.stringify(normalizedWarnings) !== JSON.stringify(storedWarnings)) {
      const migrationResult = await window.config.set(USER_WARNINGS_KEY, JSON.stringify(normalizedWarnings))
      if (!migrationResult?.success) console.warn('No se pudieron normalizar las fechas de amonestaciones:', migrationResult?.error)
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los datos', life: 4000 })
  } finally { loading.value = false }
}

function openPlan(existing?: UserCommissionPlan) {
  const defaultUser = users.value.find(u => !plans.value.some(p => Number(p.userId) === Number(u.id))) || users.value[0]
  plan.value = existing ? JSON.parse(JSON.stringify(existing)) : {
    userId: Number(defaultUser?.id || 0), userName: labelUser(defaultUser), enabled: true,
    applyGeneral: false, generalType: 'PERCENTAGE', generalValue: 0, products: [],
  }
  rule.value = { productKey: null, type: 'PERCENTAGE', value: 0 }
  planDialog.value = true
}
function syncPlanUser() {
  if (!plan.value) return
  plan.value.userName = labelUser(users.value.find(u => Number(u.id) === Number(plan.value?.userId)))
}
function addRule() {
  if (!plan.value || !rule.value.productKey || Number(rule.value.value) <= 0) {
    toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Selecciona un producto y un valor mayor que cero', life: 3000 }); return
  }
  const product = products.value.find(p => p.key === rule.value.productKey)
  const next = { productKey: rule.value.productKey, productName: product?.name || 'Producto', type: rule.value.type, value: Number(rule.value.value) }
  const index = plan.value.products.findIndex(p => p.productKey === next.productKey)
  if (index >= 0) plan.value.products[index] = next; else plan.value.products.push(next)
  rule.value = { productKey: null, type: 'PERCENTAGE', value: 0 }
}
async function persistPlans(next: UserCommissionPlan[]) {
  const result = await window.config.set(COMMISSION_CONFIG_KEY, JSON.stringify(next))
  if (!result?.success) throw new Error(result?.error || 'No se pudo guardar el plan')
  plans.value = next
}
async function savePlan() {
  if (!plan.value?.userId) return
  syncPlanUser()
  if (plan.value.applyGeneral && Number(plan.value.generalValue) <= 0) {
    toast.add({ severity: 'warn', summary: 'Valor requerido', detail: 'La comision general debe ser mayor que cero', life: 3000 }); return
  }
  try {
    await persistPlans([...plans.value.filter(p => Number(p.userId) !== Number(plan.value?.userId)), JSON.parse(JSON.stringify(plan.value))])
    planDialog.value = false
    toast.add({ severity: 'success', summary: 'Plan guardado', detail: plan.value.userName, life: 3000 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 4000 }) }
}
async function togglePlan(item: UserCommissionPlan) {
  try { await persistPlans(plans.value.map(p => Number(p.userId) === Number(item.userId) ? { ...p, enabled: !p.enabled } : p)) }
  catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}
async function markPaid(item: any) {
  try {
    const result = await window.db.update('comisiones', item.id, { estado: 'PAGADA', fecha_pago: localDateKey(new Date()) })
    if (!result.success) throw new Error(result.error)
    await loadAll(); toast.add({ severity: 'success', summary: 'Comision pagada', detail: item.vendedor, life: 2500 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3000 }) }
}
function parseInvoiceProducts(invoice: any): any[] {
  try {
    const value = typeof invoice?.productos === 'string' ? JSON.parse(invoice.productos || '[]') : invoice?.productos
    if (!Array.isArray(value)) return []
    return value.map((item: any) => {
      const normalizedName = String(item?.nombre || item?.descripcion || '').trim().toLowerCase()
      const product = products.value.find(candidate => String(candidate.name || '').trim().toLowerCase() === normalizedName)
      if (!product?.key) return item
      const [kind, rawId] = String(product.key).split(':')
      const id = Number(rawId || 0)
      if (kind === 'telefono' && !item.telefono_id) return { ...item, telefono_id: id }
      if (kind === 'electrodomestico' && !item.electrodomestico_id) return { ...item, electrodomestico_id: id }
      if (kind === 'accesorio' && !item.accesorio_id) return { ...item, accesorio_id: id }
      return item
    })
  } catch { return [] }
}

function recalculateSellerChange() {
  const userId = Number(sellerChangeUserId.value || 0)
  const commissionPlan = plans.value.find(item => Number(item.userId) === userId)
  sellerChangeLines.value = calculateSalesCommission(commissionPlan, parseInvoiceProducts(sellerChangeInvoice.value))
}

watch(sellerChangeUserId, recalculateSellerChange)

async function openSellerChange(item: any) {
  sellerChangeCandidate.value = item
  sellerChangeInvoice.value = null
  sellerChangeUserId.value = Number(item.vendedor_id || 0) || null
  sellerChangeLines.value = []
  sellerChangeDialog.value = true
  loadingSellerChange.value = true
  try {
    let invoice: any = null
    const invoiceId = Number(item.factura_id || 0)
    if (invoiceId) {
      const byId = await window.db.getById('facturas', invoiceId)
      if (byId.success) invoice = byId.data
    }
    if (!invoice && item.no_factura) {
      const all = await window.db.getAll('facturas')
      if (all.success) invoice = (all.data || []).find((row: any) => String(row.no_factura || '') === String(item.no_factura || ''))
    }
    if (!invoice) throw new Error('No se encontro la factura relacionada con esta comision')
    sellerChangeInvoice.value = invoice
    recalculateSellerChange()
  } catch (error: any) {
    sellerChangeDialog.value = false
    toast.add({ severity: 'error', summary: 'Factura no encontrada', detail: error?.message || 'No se pudo cargar la factura', life: 4000 })
  } finally { loadingSellerChange.value = false }
}

async function saveSellerChange() {
  const commission = sellerChangeCandidate.value
  const invoice = sellerChangeInvoice.value
  const user = users.value.find(item => Number(item.id) === Number(sellerChangeUserId.value))
  if (!commission?.id || !invoice?.id || !user) {
    toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Selecciona el nuevo vendedor', life: 3000 })
    return
  }
  savingSellerChange.value = true
  const sellerName = labelUser(user)
  const previousSeller = String(invoice.vendedor || '')
  try {
    let metadata: any = {}
    try { metadata = typeof invoice.otro === 'string' ? JSON.parse(invoice.otro || '{}') : invoice.otro || {} } catch { metadata = {} }
    const invoiceResult = await window.db.update('facturas', invoice.id, {
      vendedor: sellerName,
      otro: JSON.stringify({ ...metadata, vendedor_comision_id: Number(user.id), vendedor_comision_nombre: sellerName }),
    })
    if (!invoiceResult.success) throw new Error(invoiceResult.error || 'No se pudo cambiar el vendedor de la factura')

    const commissionPlan = plans.value.find(item => Number(item.userId) === Number(user.id))
    const lines = calculateSalesCommission(commissionPlan, parseInvoiceProducts(invoice))
    const amount = Number(lines.reduce((sum, line) => sum + Number(line.amount || 0), 0).toFixed(2))
    const commissionResult = await window.db.update('comisiones', commission.id, {
      vendedor_id: Number(user.id),
      vendedor: sellerName,
      productos: JSON.stringify(lines),
      total_venta: Number(invoice.total || commission.total_venta || 0),
      porcentaje: commissionPlan?.applyGeneral && commissionPlan.generalType === 'PERCENTAGE' ? Number(commissionPlan.generalValue || 0) : 0,
      monto: amount,
    })
    if (!commissionResult.success) {
      await window.db.update('facturas', invoice.id, { vendedor: previousSeller, otro: invoice.otro || '' }).catch(() => {})
      throw new Error(commissionResult.error || 'No se pudo reasignar la comision')
    }
    sellerChangeDialog.value = false
    await loadAll()
    toast.add({ severity: 'success', summary: 'Vendedor actualizado', detail: String(invoice.no_factura || commission.no_factura || '') + ': ' + sellerName + ' - ' + formatSystemCurrency(amount), life: 4000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo cambiar', detail: error?.message || 'Error reasignando la comision', life: 4500 })
  } finally { savingSellerChange.value = false }
}

async function generateUserPdf(summaryItem: any) {
  const userId = Number(summaryItem.userId)
  const detail = commissionsInScope.value
    .filter(item => Number(item.vendedor_id || 0) === userId)
    .slice()
    .sort((a, b) => `${commissionDateKey(a)} ${a.created_at || ''}`.localeCompare(`${commissionDateKey(b)} ${b.created_at || ''}`))
  if (detail.length === 0) return
  generatingPdfUserId.value = userId
  try {
    const companyResult = await window.db.getAll('empresa')
    const company = companyResult.success ? companyResult.data?.[0] || {} : {}
    const doc = new jsPDF('portrait', 'mm', 'letter')
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 14
    const contentWidth = pageWidth - margin * 2
    const from = dateFrom.value || commissionDateKey(detail[0]) || 'Inicio'
    const to = dateTo.value || commissionDateKey(detail[detail.length - 1]) || 'Hoy'
    const generatedAt = new Date().toLocaleString()
    const navy: [number, number, number] = [15, 23, 42]
    const blue: [number, number, number] = [37, 99, 235]
    const green: [number, number, number] = [5, 150, 105]
    const amber: [number, number, number] = [217, 119, 6]
    const slate: [number, number, number] = [71, 85, 105]

    // Encabezado corporativo
    doc.setFillColor(...navy)
    doc.rect(0, 0, pageWidth, 34, 'F')
    doc.setFillColor(...blue)
    doc.rect(0, 34, pageWidth, 1.5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(17)
    doc.text(String(company.nombre || 'MI EMPRESA').toUpperCase(), margin, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const companyId = company.legal || company.rnc
    if (companyId) doc.text(`RNC / Identificacion: ${companyId}`, margin, 20)
    if (company.telefono) doc.text(`Telefono: ${company.telefono}`, margin, 25)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('LIQUIDACION DE COMISIONES', pageWidth - margin, 14, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Documento generado: ${generatedAt}`, pageWidth - margin, 21, { align: 'right' })
    doc.text('Reporte interno de compensacion', pageWidth - margin, 26, { align: 'right' })

    // Datos del colaborador y periodo
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, 42, contentWidth, 15, 2, 2, 'FD')
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('COLABORADOR', margin + 4, 47)
    doc.text('PERIODO LIQUIDADO', margin + 75, 47)
    doc.text('FACTURAS', pageWidth - margin - 28, 47)
    doc.setTextColor(...navy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(String(summaryItem.userName || 'Sin asignar').toUpperCase(), margin + 4, 53)
    doc.text(`${from} al ${to}`, margin + 75, 53)
    doc.text(String(summaryItem.invoiceCount || detail.length), pageWidth - margin - 28, 53)

    // Resumen financiero
    const cardY = 63
    const cardHeight = 21
    const cardGap = 4
    const cardWidth = (contentWidth - cardGap * 2) / 3
    const cards = [
      { label: 'TOTAL GENERADO', value: summaryItem.total, color: blue, fill: [239, 246, 255] as [number, number, number] },
      { label: 'PAGADO', value: summaryItem.paid, color: green, fill: [236, 253, 245] as [number, number, number] },
      { label: 'PENDIENTE', value: summaryItem.pending, color: amber, fill: [255, 251, 235] as [number, number, number] },
    ]
    cards.forEach((card, index) => {
      const x = margin + index * (cardWidth + cardGap)
      doc.setFillColor(...card.fill)
      doc.setDrawColor(...card.color)
      doc.roundedRect(x, cardY, cardWidth, cardHeight, 2, 2, 'FD')
      doc.setFillColor(...card.color)
      doc.rect(x, cardY, 2, cardHeight, 'F')
      doc.setTextColor(...slate)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(7)
      doc.text(card.label, x + 6, cardY + 6)
      doc.setTextColor(...card.color)
      doc.setFontSize(12)
      doc.text(formatSystemCurrency(card.value), x + 6, cardY + 15)
    })

    autoTable(doc, {
      startY: 91,
      margin: { left: margin, right: margin, bottom: 22 },
      head: [['Fecha', 'Factura', 'Venta', 'Comision', 'Estado', 'Fecha pago']],
      body: detail.map(item => [
        commissionDateKey(item),
        String(item.no_factura || ''),
        formatSystemCurrency(item.total_venta),
        formatSystemCurrency(item.monto),
        String(item.estado || '').toUpperCase(),
        String(item.fecha_pago || '-'),
      ]),
      theme: 'grid',
      headStyles: {
        fillColor: navy,
        textColor: 255,
        fontStyle: 'bold',
        fontSize: 7.5,
        cellPadding: 2.6,
        lineColor: navy,
      },
      bodyStyles: {
        textColor: slate,
        fontSize: 7.5,
        cellPadding: 2.5,
        lineColor: [226, 232, 240],
        lineWidth: 0.15,
      },
      alternateRowStyles: { fillColor: [248, 250, 252] },
      columnStyles: {
        0: { cellWidth: 21 },
        1: { cellWidth: 38, fontStyle: 'bold', textColor: navy },
        2: { cellWidth: 33, halign: 'right' },
        3: { cellWidth: 33, halign: 'right', fontStyle: 'bold' },
        4: { cellWidth: 25, halign: 'center' },
        5: { halign: 'center' },
      },
      didParseCell: (hookData: any) => {
        if (hookData.section !== 'body' || hookData.column.index !== 4) return
        const status = String(hookData.cell.raw || '').toLowerCase()
        hookData.cell.styles.fontStyle = 'bold'
        hookData.cell.styles.textColor = status === 'pagada' || status === 'pagado' ? green : amber
      },
    })

    // Cierre y firmas
    const tableFinalY = (doc as any).lastAutoTable?.finalY || 105
    let signatureY = tableFinalY + 24
    if (signatureY > pageHeight - 34) {
      doc.addPage()
      signatureY = 45
      doc.setTextColor(...navy)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(12)
      doc.text('CONSTANCIA DE LIQUIDACION', margin, 20)
      doc.setDrawColor(...blue)
      doc.line(margin, 24, pageWidth - margin, 24)
    }

    const signatureWidth = 70
    doc.setDrawColor(148, 163, 184)
    doc.line(margin, signatureY, margin + signatureWidth, signatureY)
    doc.line(pageWidth - margin - signatureWidth, signatureY, pageWidth - margin, signatureY)
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('RECIBIDO POR', margin + signatureWidth / 2, signatureY + 5, { align: 'center' })
    doc.text('ENTREGADO POR', pageWidth - margin - signatureWidth / 2, signatureY + 5, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(String(summaryItem.userName || ''), margin + signatureWidth / 2, signatureY + 10, { align: 'center' })
    doc.text('Nombre, firma y fecha', pageWidth - margin - signatureWidth / 2, signatureY + 10, { align: 'center' })

    // Pie uniforme y numeracion
    const totalPages = doc.getNumberOfPages()
    for (let page = 1; page <= totalPages; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(226, 232, 240)
      doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15)
      doc.setTextColor(100, 116, 139)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.text(String(company.nombre || 'MI EMPRESA'), margin, pageHeight - 9)
      doc.text('Documento interno - Comisiones', pageWidth / 2, pageHeight - 9, { align: 'center' })
      doc.text(`Pagina ${page} de ${totalPages}`, pageWidth - margin, pageHeight - 9, { align: 'right' })
    }

    const safeUser = String(summaryItem.userName || userId).replace(/[^a-z0-9_-]+/gi, '_')
    if (pdfPreviewUrl.value) URL.revokeObjectURL(pdfPreviewUrl.value)
    pdfFileName.value = `Comisiones_${safeUser}_${from}_al_${to}.pdf`
    pdfPreviewUrl.value = URL.createObjectURL(doc.output('blob'))
    pdfDialog.value = true
    toast.add({ severity: 'success', summary: 'PDF listo', detail: `Reporte de ${summaryItem.userName}`, life: 2000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo generar el PDF', life: 4000 })
  } finally {
    generatingPdfUserId.value = null
  }
}
function downloadEmbeddedPdf() {
  if (!pdfPreviewUrl.value) return
  const link = document.createElement('a')
  link.href = pdfPreviewUrl.value
  link.download = pdfFileName.value || 'Comisiones.pdf'
  document.body.appendChild(link)
  link.click()
  link.remove()
}

function closeEmbeddedPdf() {
  if (pdfPreviewUrl.value) URL.revokeObjectURL(pdfPreviewUrl.value)
  pdfPreviewUrl.value = ''
  pdfFileName.value = ''
}
function openPayment(summaryItem: any) {
  paymentCandidate.value = summaryItem
  paymentDialog.value = true
}
async function payUser(summaryItem: any) {
  const pending = commissionsInScope.value.filter(item =>
    Number(item.vendedor_id || 0) === Number(summaryItem.userId) && String(item.estado || '').toUpperCase() === 'PENDIENTE'
  )
  if (pending.length === 0) return
  payingUserId.value = Number(summaryItem.userId)
  let paid = 0
  try {
    const paymentDate = localDateKey(new Date())
    for (const item of pending) {
      const result = await window.db.update('comisiones', item.id, { estado: 'PAGADA', fecha_pago: paymentDate })
      if (!result.success) throw new Error(result.error || `No se pudo pagar la comision ${item.id}`)
      paid++
    }
    paymentDialog.value = false
    await loadAll()
    toast.add({ severity: 'success', summary: 'Comisiones pagadas', detail: `${summaryItem.userName}: ${paid} comision(es) pagadas`, life: 3500 })
  } catch (error: any) {
    await loadAll()
    toast.add({ severity: 'error', summary: 'Pago incompleto', detail: `${paid} pagada(s). ${error?.message || 'No se pudo completar el pago'}`, life: 5000 })
  } finally {
    payingUserId.value = null
  }
}
function openWarning() {
  warningForm.value = { userId: null, type: 'AMONESTACION', reason: '', notes: '', date: localDateKey(new Date()), economicAmount: 0 }
  warningDialog.value = true
}

async function persistWarnings(next: WarningRecord[]) {
  const result = await window.config.set(USER_WARNINGS_KEY, JSON.stringify(next))
  if (!result?.success) throw new Error(result?.error || 'No se pudieron guardar las amonestaciones')
  warnings.value = next
}

async function saveWarning() {
  const f = warningForm.value
  const user = users.value.find(u => Number(u.id) === Number(f.userId))
  const isEconomic = f.type === 'AMONESTACION ECONOMICA'
  if (!user || !f.reason.trim()) {
    toast.add({ severity: 'warn', summary: 'Datos incompletos', detail: 'Selecciona el usuario y escribe el motivo', life: 3000 })
    return
  }
  if (isEconomic && Number(f.economicAmount || 0) <= 0) {
    toast.add({ severity: 'warn', summary: 'Monto requerido', detail: 'La amonestacion economica debe tener un monto mayor que cero', life: 3000 })
    return
  }
  const record: WarningRecord = {
    id: `${Date.now()}-${f.userId}`,
    userId: Number(f.userId),
    userName: labelUser(user),
    type: f.type,
    reason: f.reason.trim(),
    notes: f.notes.trim(),
    date: f.date,
    createdAt: new Date().toISOString(),
    economicAmount: isEconomic ? Number(f.economicAmount) : 0,
    economicStatus: isEconomic ? 'PENDIENTE' : 'NO_APLICA',
    appliedAt: '',
  }
  try {
    await persistWarnings([record, ...warnings.value])
    warningDialog.value = false
    toast.add({ severity: 'success', summary: 'Amonestacion registrada', detail: record.userName, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 4000 })
  }
}

async function applyEconomicWarning(item: WarningRecord) {
  if (Number(item.economicAmount || 0) <= 0 || item.economicStatus === 'APLICADA') return
  try {
    const appliedAt = new Date().toISOString()
    const next = warnings.value.map(record => record.id === item.id ? { ...record, economicStatus: 'APLICADA' as const, appliedAt } : record)
    await persistWarnings(next)
    toast.add({ severity: 'success', summary: 'Monto aplicado', detail: `${item.userName}: ${formatSystemCurrency(item.economicAmount)}`, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo aplicar el monto', life: 4000 })
  }
}

async function generateWarningPdf(item: WarningRecord) {
  generatingWarningPdfId.value = item.id
  try {
    const companyResult = await window.db.getAll('empresa')
    const company = companyResult.success ? companyResult.data?.[0] || {} : {}
    const doc = new jsPDF('portrait', 'mm', 'letter')
    const pageWidth = doc.internal.pageSize.getWidth()
    const pageHeight = doc.internal.pageSize.getHeight()
    const margin = 16
    const contentWidth = pageWidth - margin * 2
    const navy: [number, number, number] = [15, 23, 42]
    const red: [number, number, number] = [185, 28, 28]
    const amber: [number, number, number] = [217, 119, 6]
    const green: [number, number, number] = [5, 150, 105]
    const slate: [number, number, number] = [71, 85, 105]
    const isEconomic = Number(item.economicAmount || 0) > 0

    doc.setFillColor(...navy)
    doc.rect(0, 0, pageWidth, 35, 'F')
    doc.setFillColor(...red)
    doc.rect(0, 35, pageWidth, 1.5, 'F')
    doc.setTextColor(255, 255, 255)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(16)
    doc.text(String(company.nombre || 'MI EMPRESA').toUpperCase(), margin, 14)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    const companyId = company.legal || company.rnc
    if (companyId) doc.text(`RNC / Identificacion: ${companyId}`, margin, 21)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(11)
    doc.text('CONSTANCIA DE AMONESTACION', pageWidth - margin, 14, { align: 'right' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(8)
    doc.text(`Referencia: ${item.id}`, pageWidth - margin, 21, { align: 'right' })
    doc.text(`Emitido: ${new Date().toLocaleString()}`, pageWidth - margin, 27, { align: 'right' })

    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    doc.roundedRect(margin, 43, contentWidth, 22, 2, 2, 'FD')
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text('COLABORADOR', margin + 5, 49)
    doc.text('FECHA', margin + 95, 49)
    doc.text('TIPO', pageWidth - margin - 45, 49)
    doc.setTextColor(...navy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9.5)
    doc.text(String(item.userName || '').toUpperCase(), margin + 5, 57)
    doc.text(String(item.date || '-'), margin + 95, 57)
    doc.text(String(item.type || 'AMONESTACION'), pageWidth - margin - 45, 57)

    let y = 76
    doc.setTextColor(...navy)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(9)
    doc.text('MOTIVO DE LA AMONESTACION', margin, y)
    doc.setDrawColor(...red)
    doc.line(margin, y + 3, margin + 55, y + 3)
    y += 11
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(9)
    const reasonLines = doc.splitTextToSize(String(item.reason || '-'), contentWidth)
    doc.text(reasonLines, margin, y)
    y += reasonLines.length * 5 + 8

    if (item.notes) {
      doc.setTextColor(...navy)
      doc.setFont('helvetica', 'bold')
      doc.text('OBSERVACIONES', margin, y)
      y += 8
      doc.setTextColor(...slate)
      doc.setFont('helvetica', 'normal')
      const noteLines = doc.splitTextToSize(String(item.notes), contentWidth)
      doc.text(noteLines, margin, y)
      y += noteLines.length * 5 + 8
    }

    if (isEconomic) {
      const statusColor = item.economicStatus === 'APLICADA' ? green : amber
      doc.setFillColor(item.economicStatus === 'APLICADA' ? 236 : 255, item.economicStatus === 'APLICADA' ? 253 : 251, item.economicStatus === 'APLICADA' ? 245 : 235)
      doc.setDrawColor(...statusColor)
      doc.roundedRect(margin, y, contentWidth, 25, 2, 2, 'FD')
      doc.setTextColor(...slate)
      doc.setFont('helvetica', 'bold')
      doc.setFontSize(8)
      doc.text('AMONESTACION ECONOMICA', margin + 6, y + 8)
      doc.setTextColor(...statusColor)
      doc.setFontSize(15)
      doc.text(formatSystemCurrency(item.economicAmount), margin + 6, y + 18)
      doc.setFontSize(9)
      doc.text(String(item.economicStatus || 'PENDIENTE'), pageWidth - margin - 6, y + 12, { align: 'right' })
      if (item.appliedAt) {
        doc.setFont('helvetica', 'normal')
        doc.setFontSize(7)
        doc.text(`Aplicada: ${new Date(item.appliedAt).toLocaleString()}`, pageWidth - margin - 6, y + 18, { align: 'right' })
      }
      y += 37
    }

    const acknowledgement = 'Con su firma, el colaborador confirma haber recibido esta comunicacion. La firma no implica necesariamente conformidad con su contenido.'
    doc.setFillColor(248, 250, 252)
    doc.setDrawColor(226, 232, 240)
    const acknowledgementLines = doc.splitTextToSize(acknowledgement, contentWidth - 10)
    doc.roundedRect(margin, y, contentWidth, 18, 2, 2, 'FD')
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'italic')
    doc.setFontSize(7.5)
    doc.text(acknowledgementLines, margin + 5, y + 7)
    y += 38

    if (y > pageHeight - 38) {
      doc.addPage()
      y = 48
    }
    const signatureWidth = 72
    doc.setDrawColor(148, 163, 184)
    doc.line(margin, y, margin + signatureWidth, y)
    doc.line(pageWidth - margin - signatureWidth, y, pageWidth - margin, y)
    doc.setTextColor(...slate)
    doc.setFont('helvetica', 'bold')
    doc.setFontSize(8)
    doc.text('FIRMA DEL COLABORADOR', margin + signatureWidth / 2, y + 6, { align: 'center' })
    doc.text('SUPERVISOR / ADMINISTRACION', pageWidth - margin - signatureWidth / 2, y + 6, { align: 'center' })
    doc.setFont('helvetica', 'normal')
    doc.setFontSize(7)
    doc.text(String(item.userName || ''), margin + signatureWidth / 2, y + 11, { align: 'center' })
    doc.text('Nombre, firma y fecha', pageWidth - margin - signatureWidth / 2, y + 11, { align: 'center' })

    const pages = doc.getNumberOfPages()
    for (let page = 1; page <= pages; page += 1) {
      doc.setPage(page)
      doc.setDrawColor(226, 232, 240)
      doc.line(margin, pageHeight - 15, pageWidth - margin, pageHeight - 15)
      doc.setTextColor(100, 116, 139)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(7)
      doc.text(String(company.nombre || 'MI EMPRESA'), margin, pageHeight - 9)
      doc.text('Documento interno y confidencial', pageWidth / 2, pageHeight - 9, { align: 'center' })
      doc.text(`Pagina ${page} de ${pages}`, pageWidth - margin, pageHeight - 9, { align: 'right' })
    }

    const safeUser = String(item.userName || item.userId).replace(/[^a-z0-9_-]+/gi, '_')
    if (pdfPreviewUrl.value) URL.revokeObjectURL(pdfPreviewUrl.value)
    pdfFileName.value = `Amonestacion_${safeUser}_${item.date || item.id}.pdf`
    pdfPreviewUrl.value = URL.createObjectURL(doc.output('blob'))
    pdfDialog.value = true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo generar el PDF', life: 4000 })
  } finally {
    generatingWarningPdfId.value = null
  }
}
onMounted(loadAll)
</script>

<template>
  <div class="p-4 sm:p-6 max-w-7xl mx-auto space-y-5">
    <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div><h1 class="text-2xl font-bold">Comisiones y amonestaciones</h1><p class="text-sm text-surface-500">Configura incentivos por usuario y producto, y registra medidas disciplinarias.</p></div>
      <Button label="Recargar" icon="pi pi-refresh" severity="secondary" outlined @click="loadAll" />
    </div>
    <div class="flex flex-wrap gap-2 border-b border-surface-200 dark:border-surface-700 pb-3">
      <Button label="Comisiones generadas" icon="pi pi-dollar" :outlined="section !== 'generated'" @click="section = 'generated'" />
      <Button label="Planes por usuario" icon="pi pi-percentage" :outlined="section !== 'plans'" @click="section = 'plans'" />
      <Button label="Amonestaciones" icon="pi pi-exclamation-triangle" severity="warn" :outlined="section !== 'warnings'" @click="section = 'warnings'" />
    </div>
    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl block mb-2"></i>Cargando...</div>

    <template v-else-if="section === 'generated'">
      <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 space-y-3">
        <div class="flex items-center gap-2 font-semibold"><i class="pi pi-filter text-primary"></i>Filtrar liquidacion</div>
        <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold">Usuario</label>
            <Select v-model="userFilter" :options="commissionUserOptions" optionLabel="displayName" optionValue="id" filter showClear placeholder="Todos los usuarios" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold">Periodo</label>
            <Select v-model="periodFilter" :options="periodOptions" optionLabel="label" optionValue="value" fluid />
          </div>
          <div v-if="periodFilter === 'RANGO'" class="flex flex-col gap-1">
            <label class="text-xs font-semibold">Desde</label>
            <InputText v-model="dateFrom" type="date" fluid />
          </div>
          <div v-if="periodFilter === 'RANGO'" class="flex flex-col gap-1">
            <label class="text-xs font-semibold">Hasta</label>
            <InputText v-model="dateTo" type="date" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="text-xs font-semibold">Estado del detalle</label>
            <Select v-model="statusFilter" :options="['TODAS', 'PENDIENTE', 'PAGADA']" fluid />
          </div>
        </div>
        <div v-if="periodFilter !== 'TODAS'" class="text-xs text-surface-500">
          Periodo aplicado: <strong>{{ dateFrom || 'inicio' }}</strong> al <strong>{{ dateTo || 'hoy' }}</strong>
        </div>
      </div>

      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-xl bg-blue-600 p-4 text-white"><small>Total del periodo</small><div class="text-xl font-bold">{{ $formatMoney(summary.total) }}</div></div>
        <div class="rounded-xl bg-amber-500 p-4 text-white"><small>Pendiente por pagar</small><div class="text-xl font-bold">{{ $formatMoney(summary.pending) }}</div></div>
        <div class="rounded-xl bg-emerald-600 p-4 text-white"><small>Pagado</small><div class="text-xl font-bold">{{ $formatMoney(summary.paid) }}</div></div>
      </div>

      <div class="space-y-2">
        <div><h2 class="text-lg font-bold">Liquidacion por usuario</h2><p class="text-xs text-surface-500">El botón Pagar liquida todas las comisiones pendientes de ese usuario dentro del periodo seleccionado.</p></div>
        <DataTable :value="userSummaries" stripedRows dataKey="userId" sortField="pending" :sortOrder="-1">
          <Column field="userName" header="Usuario" sortable />
          <Column field="invoices" header="Facturas" sortable style="width:7rem" />
          <Column field="sales" header="Ventas" sortable><template #body="{ data }">{{ $formatMoney(data.sales) }}</template></Column>
          <Column field="total" header="Comisiones" sortable><template #body="{ data }">{{ $formatMoney(data.total) }}</template></Column>
          <Column field="paid" header="Pagado" sortable><template #body="{ data }"><span class="text-emerald-600">{{ $formatMoney(data.paid) }}</span></template></Column>
          <Column field="pending" header="Pendiente" sortable><template #body="{ data }"><strong class="text-amber-600">{{ $formatMoney(data.pending) }}</strong></template></Column>
          <Column header="Accion" style="width:14rem">
            <template #body="{ data }">
              <div class="flex gap-1">
                <Button label="PDF" icon="pi pi-file-pdf" severity="danger" outlined size="small" :loading="generatingPdfUserId === Number(data.userId)" @click="generateUserPdf(data)" />
                <Button label="Pagar" icon="pi pi-check" severity="success" size="small" :disabled="data.pending <= 0" :loading="payingUserId === Number(data.userId)" @click="openPayment(data)" />
              </div>
            </template>
          </Column>
          <template #empty><div class="text-center py-8 text-surface-400">No hay comisiones en este periodo.</div></template>
        </DataTable>
      </div>

      <div class="space-y-2">
        <h2 class="text-lg font-bold">Detalle de comisiones</h2>
        <DataTable :value="filteredCommissions" paginator :rows="15" stripedRows dataKey="id" sortField="created_at" :sortOrder="-1">
          <Column field="no_factura" header="Factura" sortable /><Column field="vendedor" header="Vendedor" sortable />
          <Column field="total_venta" header="Venta" sortable><template #body="{ data }">{{ $formatMoney(data.total_venta) }}</template></Column>
          <Column field="monto" header="Comision" sortable><template #body="{ data }"><strong>{{ $formatMoney(data.monto) }}</strong></template></Column>
          <Column field="estado" header="Estado" sortable />
          <Column field="created_at" header="Fecha" sortable />
          <Column header="Accion" style="width:14rem"><template #body="{ data }"><div class="flex items-center gap-1"><Button label="Vendedor" icon="pi pi-user-edit" severity="info" size="small" outlined @click="openSellerChange(data)" /><Button v-if="data.estado === 'PENDIENTE'" icon="pi pi-check" severity="success" text rounded v-tooltip="'Marcar pagada'" @click="markPaid(data)" /></div></template></Column>
          <template #empty><div class="text-center py-10 text-surface-400">No hay comisiones con estos filtros.</div></template>
        </DataTable>
      </div>
    </template>
    <template v-else-if="section === 'plans'">
      <div class="flex items-center justify-between gap-3"><p class="text-sm text-surface-500">Desactiva la regla general para pagar solamente los productos seleccionados.</p><Button label="Nuevo plan" icon="pi pi-plus" @click="openPlan()" /></div>
      <DataTable :value="plans" stripedRows dataKey="userId">
        <Column field="userName" header="Usuario" sortable />
        <Column header="Regla general"><template #body="{ data }"><span v-if="data.applyGeneral">{{ data.generalType === 'PERCENTAGE' ? `${data.generalValue}%` : $formatMoney(data.generalValue) }}</span><span v-else class="text-surface-400">Solo productos</span></template></Column>
        <Column header="Productos"><template #body="{ data }">{{ data.products?.length || 0 }} regla(s)</template></Column>
        <Column header="Activo"><template #body="{ data }"><ToggleSwitch :modelValue="data.enabled" @update:modelValue="togglePlan(data)" /></template></Column>
        <Column header="Accion"><template #body="{ data }"><Button icon="pi pi-pencil" text rounded @click="openPlan(data)" /></template></Column>
        <template #empty><div class="text-center py-10 text-surface-400">Aun no hay planes de comision.</div></template>
      </DataTable>
    </template>

    <template v-else>
      <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-900 p-4 space-y-3">
        <div class="flex items-center gap-2 font-semibold"><i class="pi pi-filter text-primary"></i>Filtrar amonestaciones por fecha</div>
        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div class="flex flex-col gap-1"><label class="text-xs font-semibold">Periodo</label><Select v-model="warningPeriodFilter" :options="periodOptions" optionLabel="label" optionValue="value" fluid /></div>
          <div v-if="warningPeriodFilter === 'RANGO'" class="flex flex-col gap-1"><label class="text-xs font-semibold">Desde</label><InputText v-model="warningDateFrom" type="date" fluid /></div>
          <div v-if="warningPeriodFilter === 'RANGO'" class="flex flex-col gap-1"><label class="text-xs font-semibold">Hasta</label><InputText v-model="warningDateTo" type="date" fluid /></div>
        </div>
        <div v-if="warningPeriodFilter !== 'TODAS'" class="text-xs text-surface-500">Periodo aplicado: <strong>{{ warningDateFrom || 'inicio' }}</strong> al <strong>{{ warningDateTo || 'hoy' }}</strong> - {{ filteredWarnings.length }} registro(s)</div>
      </div>
      <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div class="rounded-xl bg-slate-800 p-4 text-white"><small>Total economico</small><div class="text-xl font-bold">{{ $formatMoney(warningEconomicSummary.total) }}</div></div>
        <div class="rounded-xl bg-amber-500 p-4 text-white"><small>Pendiente de aplicar</small><div class="text-xl font-bold">{{ $formatMoney(warningEconomicSummary.pending) }}</div></div>
        <div class="rounded-xl bg-emerald-600 p-4 text-white"><small>Aplicado</small><div class="text-xl font-bold">{{ $formatMoney(warningEconomicSummary.applied) }}</div></div>
      </div>
      <div class="flex justify-end"><Button label="Nueva amonestacion" icon="pi pi-plus" severity="warn" @click="openWarning" /></div>
      <DataTable :value="filteredWarnings" paginator :rows="15" stripedRows dataKey="id" sortField="createdAt" :sortOrder="-1">
        <Column field="date" header="Fecha" sortable />
        <Column field="userName" header="Usuario" sortable />
        <Column field="type" header="Tipo" sortable />
        <Column field="reason" header="Motivo" />
        <Column header="Monto" sortable>
          <template #body="{ data }"><strong v-if="Number(data.economicAmount || 0) > 0" class="text-red-600">{{ $formatMoney(data.economicAmount) }}</strong><span v-else>-</span></template>
        </Column>
        <Column header="Estado">
          <template #body="{ data }">
            <span v-if="Number(data.economicAmount || 0) > 0" class="inline-flex rounded-full px-2 py-1 text-xs font-semibold" :class="data.economicStatus === 'APLICADA' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'">{{ data.economicStatus || 'PENDIENTE' }}</span>
            <span v-else class="text-surface-400">-</span>
          </template>
        </Column>
        <Column header="Accion" style="width:12rem">
          <template #body="{ data }">
            <div class="flex items-center gap-1">
              <Button label="PDF" icon="pi pi-file-pdf" severity="danger" outlined size="small" :loading="generatingWarningPdfId === data.id" @click="generateWarningPdf(data)" />
              <Button v-if="Number(data.economicAmount || 0) > 0 && data.economicStatus !== 'APLICADA'" icon="pi pi-check" severity="success" text rounded v-tooltip="'Marcar monto como aplicado'" @click="applyEconomicWarning(data)" />
            </div>
          </template>
        </Column>
        <template #empty><div class="text-center py-10 text-surface-400">No hay amonestaciones registradas.</div></template>
      </DataTable>
    </template>

    <Dialog
      v-model:visible="pdfDialog"
      :header="pdfFileName || 'Reporte de comisiones'"
      modal
      maximizable
      :style="{ width: '94vw' }"
      :contentStyle="{ padding: '0', height: '78vh', overflow: 'hidden' }"
      @after-hide="closeEmbeddedPdf"
    >
      <iframe v-if="pdfPreviewUrl" :src="pdfPreviewUrl" title="Vista previa del reporte de comisiones" class="w-full h-full border-0 bg-white"></iframe>
      <template #footer>
        <Button label="Cerrar" severity="secondary" text @click="pdfDialog = false" />
        <Button label="Descargar PDF" icon="pi pi-download" severity="danger" @click="downloadEmbeddedPdf" />
      </template>
    </Dialog>
    <Dialog v-model:visible="paymentDialog" header="Confirmar pago de comisiones" modal :style="{ width: 'min(28rem, 94vw)' }">
      <div v-if="paymentCandidate" class="space-y-4">
        <p>Se marcaran como pagadas todas las comisiones pendientes de <strong>{{ paymentCandidate.userName }}</strong> dentro del periodo seleccionado.</p>
        <div class="rounded-xl bg-emerald-50 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-800 p-4 text-center">
          <div class="text-xs text-surface-500">Total a pagar</div>
          <div class="text-2xl font-bold text-emerald-600">{{ $formatMoney(paymentCandidate.pending) }}</div>
          <div class="text-xs text-surface-500 mt-1">{{ dateFrom || 'Todas las fechas' }} - {{ dateTo || 'Hoy' }}</div>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="payingUserId !== null" @click="paymentDialog = false" />
        <Button label="Confirmar pago" icon="pi pi-check" severity="success" :loading="payingUserId !== null" @click="payUser(paymentCandidate)" />
      </template>
    </Dialog>
    <Dialog v-model:visible="sellerChangeDialog" header="Cambiar vendedor de la factura" modal :style="{ width: 'min(34rem, 96vw)' }" :draggable="false">
      <div v-if="loadingSellerChange" class="flex items-center justify-center gap-2 py-10 text-surface-500"><i class="pi pi-spin pi-spinner"></i>Cargando factura...</div>
      <div v-else-if="sellerChangeCandidate && sellerChangeInvoice" class="space-y-4">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 p-4">
          <div class="flex items-center justify-between gap-3"><div><div class="text-xs text-surface-500">Factura</div><strong>#{{ sellerChangeInvoice.no_factura || sellerChangeCandidate.no_factura }}</strong></div><div class="text-right"><div class="text-xs text-surface-500">Venta</div><strong>{{ $formatMoney(sellerChangeInvoice.total || sellerChangeCandidate.total_venta) }}</strong></div></div>
          <div class="mt-3 text-sm text-surface-500">Vendedor actual: <strong class="text-surface-800 dark:text-surface-100">{{ sellerChangeCandidate.vendedor || 'Sin asignar' }}</strong></div>
        </div>
        <div class="flex flex-col gap-1"><label class="font-semibold">Nuevo vendedor</label><Select v-model="sellerChangeUserId" :options="users" optionLabel="displayName" optionValue="id" filter placeholder="Seleccionar vendedor" fluid /></div>
        <div class="rounded-xl border p-4" :class="sellerChangePlan?.enabled ? 'border-emerald-200 bg-emerald-50 dark:border-emerald-800 dark:bg-emerald-950/30' : 'border-amber-200 bg-amber-50 dark:border-amber-800 dark:bg-amber-950/30'">
          <div class="flex justify-between items-center gap-3"><span class="text-sm">Nueva comisión calculada</span><strong class="text-xl" :class="sellerChangePlan?.enabled ? 'text-emerald-600' : 'text-amber-600'">{{ $formatMoney(sellerChangeAmount) }}</strong></div>
          <p class="text-xs text-surface-500 mt-1">{{ sellerChangePlan?.enabled ? `${sellerChangeLines.length} producto(s) con comisión aplicable.` : 'El vendedor seleccionado no tiene un plan de comisión activo.' }}</p>
        </div>
        <div v-if="String(sellerChangeCandidate.estado || '').toUpperCase() === 'PAGADA'" class="rounded-lg border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-3 text-xs text-red-700 dark:text-red-300"><i class="pi pi-exclamation-triangle mr-1"></i>Esta comisión ya fue pagada. La reasignación también cambiará el historial pagado.</div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text :disabled="savingSellerChange" @click="sellerChangeDialog = false" /><Button label="Cambiar vendedor" icon="pi pi-user-edit" severity="info" :loading="savingSellerChange" :disabled="loadingSellerChange || !sellerChangeUserId" @click="saveSellerChange" /></template>
    </Dialog>

    <Dialog v-model:visible="planDialog" header="Plan de comisiones" modal :style="{ width: 'min(52rem, 96vw)' }">
      <div v-if="plan" class="space-y-5">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4"><div class="flex flex-col gap-1"><label class="font-semibold">Usuario</label><Select v-model="plan.userId" :options="users" optionLabel="displayName" optionValue="id" filter fluid @change="syncPlanUser" /></div><div class="flex items-center gap-3 pt-6"><ToggleSwitch v-model="plan.enabled" /><span>Plan activo</span></div></div>
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 p-4 space-y-3">
          <div class="flex items-center gap-3"><ToggleSwitch v-model="plan.applyGeneral" /><div><strong>Aplicar comision general</strong><div class="text-xs text-surface-500">Se usa en productos sin una regla específica.</div></div></div>
          <div v-if="plan.applyGeneral" class="grid grid-cols-2 gap-3"><Select v-model="plan.generalType" :options="typeOptions" optionLabel="label" optionValue="value" fluid /><InputNumber v-model="plan.generalValue" :min="0" :max="plan.generalType === 'PERCENTAGE' ? 100 : undefined" :maxFractionDigits="2" fluid /></div>
        </div>
        <div class="space-y-3"><div><strong>Comisiones por producto</strong><div class="text-xs text-surface-500">Tienen prioridad sobre la regla general.</div></div>
          <div class="grid grid-cols-1 md:grid-cols-[1fr_12rem_9rem_auto] gap-2 items-end"><Select v-model="rule.productKey" :options="products" optionLabel="name" optionValue="key" filter placeholder="Buscar producto" fluid /><Select v-model="rule.type" :options="typeOptions" optionLabel="label" optionValue="value" fluid /><InputNumber v-model="rule.value" :min="0" :max="rule.type === 'PERCENTAGE' ? 100 : undefined" :maxFractionDigits="2" fluid /><Button label="Agregar" icon="pi pi-plus" @click="addRule" /></div>
          <DataTable :value="plan.products" size="small" stripedRows><Column field="productName" header="Producto" /><Column header="Comision"><template #body="{ data }">{{ data.type === 'PERCENTAGE' ? `${data.value}%` : $formatMoney(data.value) }}</template></Column><Column header=""><template #body="{ index }"><Button icon="pi pi-trash" severity="danger" text rounded @click="plan!.products.splice(index, 1)" /></template></Column><template #empty><div class="text-center py-5 text-surface-400">Sin reglas por producto.</div></template></DataTable>
        </div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="planDialog = false" /><Button label="Guardar plan" icon="pi pi-save" @click="savePlan" /></template>
    </Dialog>

    <Dialog v-model:visible="warningDialog" header="Registrar amonestacion" modal :style="{ width: 'min(36rem, 96vw)' }">
      <div class="space-y-4">
        <div class="flex flex-col gap-1"><label class="font-semibold">Usuario</label><Select v-model="warningForm.userId" :options="users" optionLabel="displayName" optionValue="id" filter fluid /></div>
        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3"><div class="flex flex-col gap-1"><label class="font-semibold">Tipo</label><Select v-model="warningForm.type" :options="warningTypes" fluid /></div><div class="flex flex-col gap-1"><label class="font-semibold">Fecha</label><InputText v-model="warningForm.date" type="date" fluid /></div></div>
        <div v-if="warningForm.type === 'AMONESTACION ECONOMICA'" class="rounded-xl border border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/30 p-4">
          <label class="mb-2 block font-semibold text-red-700 dark:text-red-300">Monto economico</label>
          <InputNumber v-model="warningForm.economicAmount" mode="currency" currency="DOP" locale="es-DO" :min="0" :maxFractionDigits="2" fluid />
          <p class="mt-2 text-xs text-surface-500">El monto quedara pendiente hasta que se marque como aplicado.</p>
        </div>
        <div class="flex flex-col gap-1"><label class="font-semibold">Motivo</label><InputText v-model="warningForm.reason" placeholder="Motivo de la amonestacion" maxlength="180" fluid /></div>
        <div class="flex flex-col gap-1"><label class="font-semibold">Observaciones</label><Textarea v-model="warningForm.notes" placeholder="Detalles adicionales" rows="4" autoResize fluid /></div>
      </div>
      <template #footer><Button label="Cancelar" severity="secondary" text @click="warningDialog = false" /><Button label="Guardar" icon="pi pi-save" severity="warn" @click="saveWarning" /></template>
    </Dialog>
  </div>
</template>