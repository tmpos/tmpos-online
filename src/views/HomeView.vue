<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import { useAlmacenStore } from '@/stores/almacen.store'
import QRCode from 'qrcode'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import { useToast } from 'primevue/usetoast'
import { useSystemModeStore } from '@/stores/systemMode'
import Toast from 'primevue/toast'
import { useLocaleProfile } from '@/composables/useLocaleProfile'
import { guardarGastoOnline } from '@/services/gastosOnlineService'

const router = useRouter()
const route = useRoute()
const auth = useAuthStore()
const almacenStore = useAlmacenStore()
const appName = ref('ArgentPOS')
const toast = useToast()
const systemMode = useSystemModeStore()
const { currency: systemCurrency, locale: systemLocale } = useLocaleProfile()
const homeConfig = ref({ encabezado: true, turno: true, resumen: true, accesoRapido: true, productosTop: true, stockBajo: true })

async function cargarHomeConfig() {
  try {
    const res = await window.config.get('home_secciones_visibles')
    if (res?.success && res.data) homeConfig.value = { ...homeConfig.value, ...JSON.parse(res.data) }
  } catch {}
}
function aplicarHomeConfig(event: Event) { homeConfig.value = { ...homeConfig.value, ...(event as CustomEvent).detail } }

function formatMoney(value: any): string {
  return new Intl.NumberFormat(systemLocale.value, {
    style: 'currency',
    currency: systemCurrency.value,
    currencyDisplay: 'code',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Number(value || 0))
}

let _loadedAppName = false

const serverUrl = ref('')
const qrDataUrl = ref('')
const dialogRed = ref(false)
const dialogGasto = ref(false)
const guardandoGasto = ref(false)
const cargandoBancosGasto = ref(false)
const bancosGasto = ref<any[]>([])
const gastoForm = ref({ categoria: '', descripcion: '', monto: 0, metodo_pago: 'EFECTIVO', banco_id: null as number | null })
const categoriasGasto = ['Alimentos', 'Servicios', 'Suministros', 'Nomina', 'Mantenimiento', 'Transporte', 'Otros']

const dialogImei = ref(false)
const imeiInput = ref('')
const imeiConsultando = ref(false)
const imeiResultado = ref<any>(null)
const imeiServicio = ref(55)

type ResultadoBusquedaImei = {
  clave: string
  origen: string
  icono: string
  color: string
  titulo: string
  detalle: string
  ruta: string
}

const dialogBuscadorImei = ref(false)
const imeiBusquedaGeneral = ref('')
const buscandoImeiGeneral = ref(false)
const resultadosImeiGeneral = ref<ResultadoBusquedaImei[]>([])
const busquedaImeiRealizada = ref(false)

function fechaLocalIso(fecha: Date): string {
  const year = fecha.getFullYear()
  const month = String(fecha.getMonth() + 1).padStart(2, '0')
  const day = String(fecha.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function normalizarFechaRegistro(valor: any): string {
  const texto = String(valor || '').trim()
  const iso = texto.match(/^(\d{4}-\d{2}-\d{2})/)
  if (iso) return iso[1]
  const local = texto.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/)
  if (local) return `${local[3]}-${local[2].padStart(2, '0')}-${local[1].padStart(2, '0')}`
  return ''
}

function fechaEfectivaFactura(factura: any): string {
  const fechaGuardada = normalizarFechaRegistro(factura?.fecha_emision)
  const creadoRaw = String(factura?.created_at || '').trim()
  if (!creadoRaw) return fechaGuardada
  const tieneZona = /(?:z|[+-]\d{2}:?\d{2})$/i.test(creadoRaw)
  const creado = new Date(`${creadoRaw.replace(' ', 'T')}${tieneZona ? '' : 'Z'}`)
  if (Number.isNaN(creado.getTime())) return fechaGuardada
  const fechaCreadaDb = creadoRaw.slice(0, 10)
  const fechaCreadaLocal = fechaLocalIso(creado)
  return fechaGuardada === fechaCreadaDb && fechaCreadaLocal < fechaGuardada
    ? fechaCreadaLocal
    : (fechaGuardada || fechaCreadaLocal)
}

function esFacturaVenta(factura: any): boolean {
  const tipo = String(factura?.tipo_factura || '').trim().toUpperCase()
  const estado = String(factura?.estado_factura || '').trim().toUpperCase()
  if (tipo.includes('COTIZACION') || tipo.includes('NOTA_CREDITO') || tipo.includes('NOTA CREDITO') || tipo.includes('RECIBIDO')) return false
  return estado === 'PAGADA' || estado === 'COBRADO' || estado === 'CREDITO' || estado === 'CRÉDITO'
}

function estadoTallerCerrado(orden: any): boolean {
  const estado = String(orden?.estado || '').trim().toUpperCase().replace(/\s+/g, '_')
  return estado === 'COMPLETADO' || estado === 'ENTREGADO'
}

function fechaEfectivaTaller(orden: any): string {
  const valor = estadoTallerCerrado(orden)
    ? orden?.fecha_entrega || orden?.fecha_pago || orden?.updated_at || orden?.fecha_entrada || orden?.created_at
    : orden?.fecha_entrada || orden?.created_at || orden?.updated_at
  return normalizarFechaRegistro(valor)
}

function gananciaTaller(orden: any): number {
  return Number(orden?.beneficio_empresa ?? orden?.ganancia ?? orden?.mano_obra ?? orden?.manodeobra ?? 0) || 0
}

function fechaEfectivaGasto(gasto: any): string {
  const fechaGuardada = String(gasto?.fecha || '').slice(0, 10)
  const creadoRaw = String(gasto?.created_at || '').trim()
  if (!creadoRaw) return fechaGuardada

  const tieneZona = /(?:z|[+-]\d{2}:?\d{2})$/i.test(creadoRaw)
  const creado = new Date(`${creadoRaw.replace(' ', 'T')}${tieneZona ? '' : 'Z'}`)
  if (Number.isNaN(creado.getTime())) return fechaGuardada

  const fechaCreadaDb = creadoRaw.slice(0, 10)
  const fechaCreadaLocal = fechaLocalIso(creado)
  // Caja guardaba la fecha en UTC. Corrige los registros creados de noche que
  // quedaron con la fecha del dia siguiente, sin alterar fechas manuales.
  if (fechaGuardada === fechaCreadaDb && fechaCreadaLocal < fechaGuardada) return fechaCreadaLocal
  return fechaGuardada || fechaCreadaLocal
}

const hoy = ref(fechaLocalIso(new Date()))
const inicioMes = ref(fechaLocalIso(new Date(new Date().getFullYear(), new Date().getMonth(), 1)))

const periodoDashboard = ref<'dia' | 'mes'>('dia')
const ventasPeriodo = ref(0)
const cantidadPeriodo = ref(0)
const gananciaPeriodo = ref(0)
const gastosPeriodo = ref(0)
const stockBajo = ref<any[]>([])
const productosTop = ref<any[]>([])
const turnoActivo = ref<any>(null)
const loadingDashboard = ref(true)
const etiquetaPeriodo = computed(() => periodoDashboard.value === 'dia' ? 'Hoy' : 'Este Mes')

function getFechaStr(d: Date) {
  return d.toISOString().replace('T', ' ').split('.')[0]
}

function formatoInicioTurno(turno: any): string {
  const valor = turno?.created_at || turno?.updated_at
  if (!valor) return 'hora no disponible'
  const fecha = new Date(valor)
  return Number.isNaN(fecha.getTime()) ? 'hora no disponible' : fecha.toLocaleString(systemLocale.value)
}

async function cargarDashboard() {
  loadingDashboard.value = true
  try {
    if (!almacenStore.activeUid) await almacenStore.load()

    const [resFacturas, resGastos, resTel, resAcc, resElec, resPiezas, resTaller, resTurno] = await Promise.all([
      window.db.getAll('facturas'),
      window.db.getAll('gastos'),
      window.db.getAll('telefonos'),
      window.db.getAll('accesorios'),
      window.db.getAll('electrodomesticos'),
      window.db.getAll('piezas'),
      window.db.getAll('ordenes_taller'),
      (window as any).electron.invoke('caja:getTurnoActivo'),
    ])

    const almacenId = almacenStore.activeId || 0
    const almacenUid = almacenStore.activeUid || ''
    const perteneceAlAlmacen = (item: any) => !almacenUid || (item.almacen_uid ? String(item.almacen_uid) === almacenUid : Number(item.almacen_id) === almacenId || (!item.almacen_id && almacenStore.almacenes.length <= 1))
    const perteneceAlAlmacenPorUid = (item: any) => Boolean(almacenUid) && String(item?.almacen_uid || '') === almacenUid
    const filtrarAlmacen = (items: any[]) => items.filter(perteneceAlAlmacen)

    const facturas = (resFacturas.success ? resFacturas.data || [] : []).filter((f: any) =>
      esFacturaVenta(f) && perteneceAlAlmacenPorUid(f)
    )

    const fechaInicioPeriodo = periodoDashboard.value === 'dia' ? hoy.value : inicioMes.value
    const facturasPeriodo = facturas.filter((f: any) => {
      const fechaEmision = fechaEfectivaFactura(f)
      return fechaEmision >= fechaInicioPeriodo && fechaEmision <= hoy.value
    })
    ventasPeriodo.value = facturasPeriodo.reduce((s: number, f: any) => s + Number(f.total || 0), 0)
    cantidadPeriodo.value = facturasPeriodo.length
    const reparacionesPeriodo = (resTaller.success ? resTaller.data || [] : []).filter((orden: any) => {
      if (!perteneceAlAlmacenPorUid(orden) || !estadoTallerCerrado(orden)) return false
      const fecha = fechaEfectivaTaller(orden)
      return fecha >= fechaInicioPeriodo && fecha <= hoy.value
    })
    const gananciaFacturas = facturasPeriodo.reduce((s: number, f: any) => s + Number(f.ganancia || 0), 0)
    const gananciaReparaciones = reparacionesPeriodo.reduce((s: number, orden: any) => s + gananciaTaller(orden), 0)
    gananciaPeriodo.value = gananciaFacturas + gananciaReparaciones

    const gastos = (resGastos.success ? resGastos.data || [] : []).filter(perteneceAlAlmacenPorUid)
    const gastosDelPeriodo = gastos.filter((gasto: any) => {
      const fecha = fechaEfectivaGasto(gasto)
      if (!fecha) return false
      return periodoDashboard.value === 'dia'
        ? fecha === hoy.value
        : fecha >= inicioMes.value && fecha <= hoy.value
    })
    gastosPeriodo.value = gastosDelPeriodo.reduce((total: number, gasto: any) => total + Number(gasto.cantidad || gasto.monto || 0), 0)

    const contarProducto = (items: any[], campoNombre: string, campoPrecio: string) => {
      const map = new Map<string, { nombre: string; total: number; cantidad: number }>()
      for (const f of facturasPeriodo) {
        try {
          const prods = typeof f.productos === 'string' ? JSON.parse(f.productos) : (f.productos || [])
          if (Array.isArray(prods)) {
            for (const p of prods) {
              const nom = p[campoNombre] || p.nombre || 'Producto'
              map.set(nom, {
                nombre: nom,
                total: (map.get(nom)?.total || 0) + Number(p[campoPrecio] || p.precio || 0) * Number(p.cantidad || 1),
                cantidad: (map.get(nom)?.cantidad || 0) + Number(p.cantidad || 1),
              })
            }
          }
        } catch {}
      }
      return Array.from(map.values()).sort((a, b) => b.cantidad - a.cantidad).slice(0, 10)
    }

    productosTop.value = [
      ...contarProducto([], 'nombre', 'precio'),
      ...contarProducto([], 'nombre', 'precio'),
    ].slice(0, 10)

    const parseNombre = (p: any) => {
      if (typeof p === 'string') return p
      if (typeof p === 'object') return p.nombre || p.producto || p.descripcion || ''
      return ''
    }
    const agrupados = new Map<string, { nombre: string; total: number; cantidad: number }>()
    for (const f of facturasPeriodo) {
      try {
        const prods = typeof f.productos === 'string' ? JSON.parse(f.productos) : (f.productos || [])
        if (Array.isArray(prods)) {
          for (const p of prods) {
            const nom = parseNombre(p)
            if (!nom) continue
            const key = nom.toUpperCase().trim()
            const existente = agrupados.get(key)
            const cant = Number(p.cantidad || 1)
            const precio = Number(p.precio || 0)
            if (existente) {
              existente.cantidad += cant
              existente.total += precio * cant
            } else {
              agrupados.set(key, { nombre: nom, total: precio * cant, cantidad: cant })
            }
          }
        }
      } catch {}
    }
    productosTop.value = Array.from(agrupados.values())
      .sort((a, b) => b.cantidad - a.cantidad)
      .slice(0, 10)

    const allInv = [
      ...(systemMode.isCellphoneStore && resTel.success ? resTel.data || [] : []),
      ...(resAcc.success ? resAcc.data || [] : []),
      ...(resElec.success ? resElec.data || [] : []),
      ...(resPiezas.success ? resPiezas.data || [] : []),
    ]
    stockBajo.value = filtrarAlmacen(allInv)
      .filter((i: any) => Number(i.cantidad || 0) <= Number(i.alerta || 0) && Number(i.alerta || 0) > 0)
      .sort((a, b) => {
        const aPct = (a.cantidad || 0) / (a.alerta || 1)
        const bPct = (b.cantidad || 0) / (b.alerta || 1)
        return aPct - bPct
      })
      .slice(0, 10)

    if (resTurno.success && resTurno.data) {
      turnoActivo.value = resTurno.data
    } else {
      turnoActivo.value = null
    }
  } catch (e) {
    console.error('Error cargando dashboard:', e)
  } finally {
    loadingDashboard.value = false
  }
}

async function cargarServerUrl() {
  try {
    const res = await window.electron.invoke('getServerUrl') as any
    if (res.success && res.url) {
      serverUrl.value = res.url
      qrDataUrl.value = await QRCode.toDataURL(res.url, { width: 300, margin: 2 })
    }
  } catch (_) {}
}

async function consultarImei() {
  if (!imeiInput.value.trim() || imeiInput.value.trim().length < 15) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un IMEI valido (15 digitos)', life: 3000 })
    return
  }
  imeiConsultando.value = true
  imeiResultado.value = null
  try {
    const res = await window.electron.invoke('imei:consultar', imeiInput.value.trim(), imeiServicio.value) as any
    if (res.success) {
      imeiResultado.value = res.data
      if (res.data?.status === 'error') {
        toast.add({ severity: 'error', summary: 'Error', detail: res.data.message || res.data.error || 'Error en la consulta', life: 5000 })
      }
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo conectar al servidor', life: 5000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 5000 })
  } finally {
    imeiConsultando.value = false
  }
}

function normalizarImei(valor: any): string {
  return String(valor || '').toLowerCase().replace(/[^a-z0-9]/g, '')
}

function parseJsonSeguro(valor: any, defecto: any = []) {
  if (typeof valor !== 'string') return valor ?? defecto
  try { return JSON.parse(valor) } catch { return defecto }
}

function contieneImeiEnObjeto(valor: any, termino: string): boolean {
  if (Array.isArray(valor)) return valor.some(item => contieneImeiEnObjeto(item, termino))
  if (!valor || typeof valor !== 'object') return false
  return Object.entries(valor).some(([clave, contenido]) => {
    if (clave.toLowerCase().includes('imei') && normalizarImei(contenido).includes(termino)) return true
    return typeof contenido === 'object' && contieneImeiEnObjeto(contenido, termino)
  })
}

function imeiDesdeNotas(valor: any): string {
  const texto = String(valor || '')
  return texto.match(/IMEI\s*:\s*([^|,;\n]+)/i)?.[1]?.trim() || ''
}

function esRecibidoImei(item: any): boolean {
  const estado = String(item?.estado || '').toUpperCase()
  if (['RECIBIDO', 'EN_GARANTIA'].includes(estado)) return true
  const nota = parseJsonSeguro(item?.nota, {})
  return Boolean(nota && typeof nota === 'object' && (
    Object.prototype.hasOwnProperty.call(nota, 'customer_name') ||
    Object.prototype.hasOwnProperty.call(nota, 'customer_phone') ||
    Object.prototype.hasOwnProperty.call(nota, 'credit_note_id') ||
    Object.prototype.hasOwnProperty.call(nota, 'cliente_id')
  ))
}

async function buscarImeiGeneral() {
  const termino = normalizarImei(imeiBusquedaGeneral.value)
  if (termino.length < 3) {
    toast.add({ severity: 'warn', summary: 'Busqueda incompleta', detail: 'Escribe al menos 3 caracteres del IMEI', life: 3000 })
    return
  }

  buscandoImeiGeneral.value = true
  busquedaImeiRealizada.value = true
  resultadosImeiGeneral.value = []
  try {
    const [resImeis, resApartados, resFacturas, resTaller] = await Promise.all([
      window.db.getAll('imei'),
      window.db.getAll('cuentas_cobrar'),
      window.db.getAll('facturas'),
      window.db.getAll('ordenes_taller'),
    ])
    const resultados: ResultadoBusquedaImei[] = []
    const coincide = (valor: any) => normalizarImei(valor).includes(termino)

    for (const item of (resImeis.success ? resImeis.data || [] : [])) {
      if (!coincide(item.nombre || item.imei)) continue
      const imei = String(item.nombre || item.imei || '')
      resultados.push({
        clave: `imei-${item.uid || item.id}`,
        origen: 'Inventario IMEI', icono: 'pi pi-barcode', color: 'text-indigo-500',
        titulo: imei,
        detalle: `${item.estado || 'SIN ESTADO'}${item.comprador ? ` · ${item.comprador}` : ''}${item.no_factura ? ` · Factura ${item.no_factura}` : ''}`,
        ruta: `/inventario?tab=imei&search=${encodeURIComponent(imei)}&estado=todos`,
      })
      if (esRecibidoImei(item)) {
        resultados.push({
          clave: `recibido-${item.uid || item.id}`,
          origen: 'Recibidos', icono: 'pi pi-download', color: 'text-cyan-500',
          titulo: imei,
          detalle: `Equipo recibido · ${item.estado || 'RECIBIDO'}`,
          ruta: `/ventas?tab=recibidos&search=${encodeURIComponent(imei)}&estado=todos`,
        })
      }
    }

    for (const apartado of (resApartados.success ? resApartados.data || [] : [])) {
      const contenido = [apartado.imei, apartado.imei_nombre, imeiDesdeNotas(apartado.notas)].join(' ')
      if (!coincide(contenido)) continue
      resultados.push({
        clave: `apartado-${apartado.uid || apartado.id}`,
        origen: 'Apartados', icono: 'pi pi-bookmark', color: 'text-amber-500',
        titulo: apartado.no_factura || apartado.no_apartado || 'Apartado',
        detalle: `${apartado.nombre_cliente || 'SIN CLIENTE'} · ${apartado.notas || ''}`,
        ruta: `/ventas?tab=apartados&search=${encodeURIComponent(imeiBusquedaGeneral.value.trim())}`,
      })
    }

    for (const factura of (resFacturas.success ? resFacturas.data || [] : [])) {
      const productos = parseJsonSeguro(factura.productos, [])
      if (!coincide(factura.imei) && !contieneImeiEnObjeto(productos, termino)) continue
      resultados.push({
        clave: `factura-${factura.uid || factura.id}`,
        origen: 'Facturas', icono: 'pi pi-file', color: 'text-blue-500',
        titulo: `Factura ${factura.no_factura || factura.id}`,
        detalle: `${factura.nombre_cliente || 'CONSUMIDOR FINAL'} · ${formatMoney(factura.total)}`,
        ruta: `/ventas/editar/${factura.id}`,
      })
    }

    for (const orden of (resTaller.success ? resTaller.data || [] : [])) {
      if (!coincide(orden.imei)) continue
      resultados.push({
        clave: `taller-${orden.uid || orden.id}`,
        origen: 'Taller', icono: 'pi pi-wrench', color: 'text-violet-500',
        titulo: orden.no_orden || `Orden #${orden.id}`,
        detalle: `${orden.nombre || 'SIN CLIENTE'} · ${orden.equipo || 'Equipo'} · ${orden.estado || ''}`,
        ruta: `/taller?tab=ordenes&search=${encodeURIComponent(imeiBusquedaGeneral.value.trim())}`,
      })
    }

    resultadosImeiGeneral.value = resultados
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message || 'No se pudo realizar la busqueda', life: 4000 })
  } finally {
    buscandoImeiGeneral.value = false
  }
}

function abrirResultadoImei(resultado: ResultadoBusquedaImei) {
  dialogBuscadorImei.value = false
  router.push(resultado.ruta)
}

function limpiarBusquedaImeiGeneral() {
  imeiBusquedaGeneral.value = ''
  resultadosImeiGeneral.value = []
  busquedaImeiRealizada.value = false
  if (route.query.buscar_imei) {
    const query = { ...route.query }
    delete query.buscar_imei
    void router.replace({ query })
  }
}

watch(() => route.query.buscar_imei, async (value) => {
  const imei = String(value || '').trim()
  if (imei.length < 3) return
  imeiBusquedaGeneral.value = imei
  dialogBuscadorImei.value = true
  await buscarImeiGeneral()
}, { immediate: true })

async function copiarUrl() {
  try {
    try {
      await navigator.clipboard.writeText(serverUrl.value)
    } catch (_) {
      const area = document.createElement('textarea')
      area.value = serverUrl.value
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const copiado = document.execCommand('copy')
      area.remove()
      if (!copiado) throw new Error('El portapapeles no esta disponible')
    }
    toast.add({ severity: 'success', summary: 'Copiado', detail: 'URL copiada al portapapeles', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo copiar', life: 2000 })
  }
}

function cambiarPeriodo(periodo: 'dia' | 'mes') {
  if (periodoDashboard.value === periodo) return
  periodoDashboard.value = periodo
  cargarDashboard()
}

async function cargarBancosGasto() {
  cargandoBancosGasto.value = true
  try {
    const res = await window.db.getAll('bancos')
    bancosGasto.value = res.success ? (res.data || []) : []
  } catch {
    bancosGasto.value = []
  } finally {
    cargandoBancosGasto.value = false
  }
}

async function abrirGasto() {
  if (!turnoActivo.value) {
    toast.add({ severity: 'warn', summary: 'Sin turno activo', detail: 'Abre un turno en Caja antes de registrar el gasto', life: 3500 })
    return
  }
  gastoForm.value = { categoria: '', descripcion: '', monto: 0, metodo_pago: 'EFECTIVO', banco_id: null }
  dialogGasto.value = true
  await cargarBancosGasto()
}

async function guardarGasto() {
  const monto = Number(gastoForm.value.monto || 0)
  const descripcion = gastoForm.value.descripcion.trim()
  if (!turnoActivo.value) {
    dialogGasto.value = false
    toast.add({ severity: 'warn', summary: 'Sin turno activo', detail: 'El turno fue cerrado. Abre uno nuevo en Caja.', life: 3500 })
    await cargarDashboard()
    return
  }
  if (!descripcion || monto <= 0 || guardandoGasto.value) return
  if (gastoForm.value.metodo_pago === 'TRANSFERENCIA' && !gastoForm.value.banco_id) {
    toast.add({ severity: 'warn', summary: 'Banco requerido', detail: 'Selecciona el banco de donde saldra el dinero', life: 3000 })
    return
  }

  guardandoGasto.value = true
  try {
    const ahora = new Date()
    const comentario = gastoForm.value.categoria
      ? `${gastoForm.value.categoria}: ${descripcion}`
      : descripcion
    const banco = bancosGasto.value.find((item: any) => Number(item.id) === Number(gastoForm.value.banco_id || 0))
    const result = await guardarGastoOnline({
      cantidad: monto,
      comentario,
      metodo_pago: gastoForm.value.metodo_pago,
      banco_id: banco?.id || 0,
      banco_uid: banco?.uid || '',
      turno_id: turnoActivo.value.id,
      fecha: fechaLocalIso(ahora),
      hora: `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`,
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || '',
      usuario: auth.user?.usuario || auth.user?.nombre || '',
    })
    if (!result.success) throw new Error(result.error || 'No se pudo guardar el gasto')

    dialogGasto.value = false
    await cargarDashboard()
    toast.add({ severity: 'success', summary: 'Gasto registrado', detail: `Se agregaron ${formatMoney(monto)}`, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar el gasto', life: 3500 })
  } finally {
    guardandoGasto.value = false
  }
}

function irA(ruta: string) {
  router.push(ruta)
}

function cerrarSesion() {
  auth.logout()
  router.push('/login')
}

onMounted(() => {
  cargarHomeConfig()
  window.addEventListener('home-config-changed', aplicarHomeConfig)
  cargarDashboard()
  cargarServerUrl()
  if ((window as any).electron?.invoke && !_loadedAppName) {
    _loadedAppName = true
    ;(window as any).electron.invoke('app:getName').then((r: any) => {
      if (r) appName.value = r
    }).catch(() => {})
  }
})
onUnmounted(() => window.removeEventListener('home-config-changed', aplicarHomeConfig))
</script>

<template>
  <Toast />
  <div class="dashboard-page space-y-6">
    <!-- Header -->
    <div v-if="homeConfig.encabezado" class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
      <div>
        <h1 class="text-3xl font-bold tracking-tight">
          Bienvenido, <span class="text-primary">{{ auth.user?.nombre || 'Usuario' }}</span>
        </h1>
        <p class="text-surface-500 mt-1">{{ new Date().toLocaleDateString(systemLocale, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }) }}</p>
      </div>
      <div class="hidden sm:flex items-center gap-2 px-4 py-2 rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 border border-blue-100 dark:border-blue-800/30">
        <i :class="systemMode.isGeneralStore ? 'pi pi-shop' : 'pi pi-mobile'" class="text-blue-500 text-lg"></i>
        <span class="text-sm font-medium text-blue-700 dark:text-blue-300">{{ appName }}</span>
      </div>
    </div>

    <div v-if="loadingDashboard" class="flex items-center justify-center py-16 text-surface-400 gap-2">
      <i class="pi pi-spin pi-spinner text-lg"></i><span>Cargando dashboard...</span>
    </div>

    <template v-else>
      <!-- Turno activo alerta -->
      <div v-if="homeConfig.turno && turnoActivo" class="flex items-center gap-3 p-3 rounded-xl bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
        <i class="pi pi-check-circle text-green-500 text-lg"></i>
        <div class="text-sm text-green-800 dark:text-green-100"><span class="font-semibold">Turno activo</span> &mdash; Abierto por <strong class="text-green-950 dark:text-white">{{ turnoActivo.usuario_nombre || 'Usuario' }}</strong> desde {{ formatoInicioTurno(turnoActivo) }}</div>
      </div>
      <div v-else-if="homeConfig.turno" class="flex items-center gap-3 p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800">
        <i class="pi pi-exclamation-triangle text-amber-500 text-lg"></i>
        <div class="text-sm text-amber-800 dark:text-amber-100"><span class="font-semibold">Sin turno activo</span> &mdash; <button @click="irA('/contabilidad')" class="font-semibold text-amber-900 dark:text-amber-50 underline hover:text-primary">Abrir turno en Caja</button></div>
      </div>

      <div v-if="homeConfig.resumen" class="flex items-center justify-between gap-3">
        <h2 class="text-base font-semibold">Resumen</h2>
        <div class="inline-flex rounded-lg border border-surface-200 dark:border-surface-700 p-1 bg-surface-0 dark:bg-surface-800">
          <button type="button" class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all" :class="periodoDashboard === 'dia' ? 'bg-blue-600 text-white shadow-sm' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700'" @click="cambiarPeriodo('dia')">Día</button>
          <button type="button" class="px-4 py-1.5 rounded-md text-sm font-semibold transition-all" :class="periodoDashboard === 'mes' ? 'bg-blue-600 text-white shadow-sm' : 'text-surface-500 hover:bg-surface-100 dark:hover:bg-surface-700'" @click="cambiarPeriodo('mes')">Mes</button>
        </div>
      </div>

      <!-- KPI Cards -->
      <div v-if="homeConfig.resumen" class="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div class="dashboard-kpi rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-1">
          <span class="text-xs font-medium text-surface-400 uppercase tracking-wide">Ventas · {{ etiquetaPeriodo }}</span>
          <span class="text-2xl font-bold text-primary">{{ formatMoney(ventasPeriodo) }}</span>
          <span class="text-xs text-surface-500">{{ cantidadPeriodo }} factura(s)</span>
        </div>
        <div class="dashboard-kpi rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-1">
          <span class="text-xs font-medium text-surface-400 uppercase tracking-wide">Ganancia · {{ etiquetaPeriodo }}</span>
          <span class="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{{ formatMoney(gananciaPeriodo) }}</span>
        </div>
        <div class="dashboard-kpi rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-1">
          <span class="text-xs font-medium text-surface-400 uppercase tracking-wide">Gastos · {{ etiquetaPeriodo }}</span>
          <span class="text-2xl font-bold text-rose-600 dark:text-rose-400">{{ formatMoney(gastosPeriodo) }}</span>
        </div>
        <div class="dashboard-kpi rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-1">
          <span class="text-xs font-medium text-surface-400 uppercase tracking-wide">Stock Bajo</span>
          <span class="text-2xl font-bold" :class="stockBajo.length > 0 ? 'text-red-500' : 'text-green-500'">{{ stockBajo.length }}</span>
          <span class="text-xs text-surface-500">{{ stockBajo.length > 0 ? 'Productos por reabastecer' : 'Sin alertas' }}</span>
        </div>
      </div>

      <!-- Acceso Rapido -->
      <div v-if="homeConfig.accesoRapido">
        <h2 class="text-lg font-semibold mb-3">Acceso Rapido</h2>
        <div class="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-6 gap-3">
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all cursor-pointer group" @click="irA('/vender')">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-blue-500 to-blue-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-shopping-cart text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Vender</span><span class="text-[10px] text-surface-400 -mt-1">Punto de venta</span>
          </button>
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-emerald-300 dark:hover:border-emerald-600 hover:shadow-md transition-all cursor-pointer group" @click="irA('/inventario')">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-box text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Inventario</span><span class="text-[10px] text-surface-400 -mt-1">Productos y stock</span>
          </button>
          <button v-if="systemMode.isCellphoneStore" class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-violet-300 dark:hover:border-violet-600 hover:shadow-md transition-all cursor-pointer group" @click="irA('/taller')">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-violet-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-wrench text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Taller</span><span class="text-[10px] text-surface-400 -mt-1">Reparaciones</span>
          </button>
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-amber-300 dark:hover:border-amber-600 hover:shadow-md transition-all cursor-pointer group" @click="irA('/contactos')">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-users text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Clientes</span><span class="text-[10px] text-surface-400 -mt-1">Contactos</span>
          </button>
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-rose-300 dark:hover:border-rose-600 hover:shadow-md transition-all cursor-pointer group" @click="irA('/contabilidad')">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-rose-500 to-rose-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-calculator text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Contabilidad</span><span class="text-[10px] text-surface-400 -mt-1">Finanzas</span>
          </button>
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-orange-300 dark:hover:border-orange-600 hover:shadow-md transition-all cursor-pointer group" @click="abrirGasto">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-orange-500 to-orange-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-receipt text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Agregar Gasto</span><span class="text-[10px] text-surface-400 -mt-1">Caja actual</span>
          </button>
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-sky-300 dark:hover:border-sky-600 hover:shadow-md transition-all cursor-pointer group" @click="irA('/ventas')">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-sky-500 to-sky-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-file text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Facturas</span><span class="text-[10px] text-surface-400 -mt-1">Historial</span>
          </button>
          <button v-if="serverUrl" class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-primary-300 dark:hover:border-primary-600 hover:shadow-md transition-all cursor-pointer group" @click="dialogRed = true">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-primary to-primary-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-globe text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Red Local</span><span class="text-[10px] text-surface-400 -mt-1">Acceso por QR</span>
          </button>
          <button v-if="systemMode.isCellphoneStore" class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-indigo-300 dark:hover:border-indigo-600 hover:shadow-md transition-all cursor-pointer group" @click="dialogImei = true">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-indigo-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-search text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Consultar IMEI</span><span class="text-[10px] text-surface-400 -mt-1">Busqueda externa</span>
          </button>
          <button v-if="systemMode.isCellphoneStore" class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-fuchsia-300 dark:hover:border-fuchsia-600 hover:shadow-md transition-all cursor-pointer group" @click="dialogBuscadorImei = true">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-fuchsia-500 to-purple-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-search-plus text-white text-xl"></i></div>
            <span class="text-sm font-semibold text-center">Buscador General de IMEI</span><span class="text-[10px] text-surface-400 -mt-1">Todo el sistema</span>
          </button>
          <button class="dashboard-action flex flex-col items-center gap-2 p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 hover:border-red-300 dark:hover:border-red-600 hover:shadow-md transition-all cursor-pointer group" @click="cerrarSesion">
            <div class="w-12 h-12 rounded-xl bg-gradient-to-br from-red-500 to-red-600 flex items-center justify-center shadow-md group-hover:shadow-lg transition-shadow"><i class="pi pi-sign-out text-white text-xl"></i></div>
            <span class="text-sm font-semibold">Salir</span><span class="text-[10px] text-surface-400 -mt-1">Cerrar sesion</span>
          </button>
        </div>
      </div>

      <!-- Dos columnas: Productos mas vendidos + Stock bajo -->
      <div v-if="homeConfig.productosTop || homeConfig.stockBajo" class="grid grid-cols-1 gap-6" :class="homeConfig.productosTop && homeConfig.stockBajo ? 'lg:grid-cols-2' : ''">
        <!-- Productos mas vendidos -->
        <div v-if="homeConfig.productosTop" class="dashboard-panel rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700">
            <h3 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-chart-bar text-primary"></i> Productos mas vendidos</h3>
            <span class="text-xs text-surface-400">{{ etiquetaPeriodo }}</span>
          </div>
          <div v-if="productosTop.length === 0" class="text-center py-8 text-surface-400 text-sm">Sin ventas {{ periodoDashboard === 'dia' ? 'hoy' : 'este mes' }}</div>
          <div v-else class="divide-y divide-surface-100 dark:divide-surface-700">
            <div v-for="(p, i) in productosTop" :key="i" class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
              <span class="w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold text-white" :style="{ background: i < 3 ? ['#FFD700','#C0C0C0','#CD7F32'][i] : 'var(--p-primary-300)' }">
                {{ i + 1 }}
              </span>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ p.nombre }}</div>
                <div class="text-xs text-surface-400">{{ p.cantidad }} vendido(s)</div>
              </div>
              <span class="text-sm font-semibold">{{ formatMoney(p.total) }}</span>
            </div>
          </div>
        </div>

        <!-- Stock bajo -->
        <div v-if="homeConfig.stockBajo" class="dashboard-panel rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 overflow-hidden">
          <div class="flex items-center justify-between px-4 py-3 border-b border-surface-100 dark:border-surface-700">
            <h3 class="font-semibold text-sm flex items-center gap-2"><i class="pi pi-exclamation-triangle text-red-500"></i> Alertas de Stock</h3>
            <button v-if="stockBajo.length > 0" @click="irA('/inventario')" class="text-xs text-primary hover:underline">Ver inventario</button>
          </div>
          <div v-if="stockBajo.length === 0" class="text-center py-8 text-surface-400 text-sm">No hay alertas de stock bajo</div>
          <div v-else class="divide-y divide-surface-100 dark:divide-surface-700">
            <div v-for="(item, i) in stockBajo" :key="i" class="flex items-center gap-3 px-4 py-2.5 hover:bg-surface-50 dark:hover:bg-surface-800/50 transition-colors">
              <div class="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold text-white"
                :class="item.cantidad === 0 ? 'bg-red-500' : 'bg-orange-400'">
                {{ item.cantidad || 0 }}
              </div>
              <div class="flex-1 min-w-0">
                <div class="text-sm font-medium truncate">{{ item.nombre }}</div>
                <div class="text-xs" :class="item.cantidad === 0 ? 'text-red-500' : 'text-orange-500'">
                  {{ item.cantidad || 0 }} / {{ item.alerta || 0 }} unidades
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </template>

    <Dialog v-model:visible="dialogGasto" header="Registrar Gasto" modal :style="{ width: 'min(24rem, 92vw)' }" :closable="!guardandoGasto">
      <div class="space-y-4">
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Categoria</label>
          <select v-model="gastoForm.categoria" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option value="">Seleccionar</option>
            <option v-for="categoria in categoriasGasto" :key="categoria" :value="categoria">{{ categoria }}</option>
          </select>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Descripcion <span class="text-red-500">*</span></label>
          <InputText v-model="gastoForm.descripcion" placeholder="Ej: Compra de hielo" fluid autofocus @keydown.enter="guardarGasto" />
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Monto <span class="text-red-500">*</span></label>
          <div class="flex items-center rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 overflow-hidden focus-within:ring-2 focus-within:ring-primary-500">
            <span class="px-3 py-2.5 text-sm font-semibold bg-surface-100 dark:bg-surface-800 border-r border-surface-300 dark:border-surface-600">{{ systemCurrency }}</span>
            <input v-model.number="gastoForm.monto" type="number" step="0.01" min="0" class="flex-1 min-w-0 px-3 py-2.5 text-sm font-bold outline-none bg-transparent" placeholder="0.00" @keydown.enter="guardarGasto" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1.5 block">Metodo de pago</label>
          <select v-model="gastoForm.metodo_pago" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500" @change="gastoForm.banco_id = null">
            <option value="EFECTIVO">Efectivo</option>
            <option value="TRANSFERENCIA">Transferencia</option>
          </select>
        </div>
        <div v-if="gastoForm.metodo_pago === 'TRANSFERENCIA'">
          <label class="text-xs font-semibold mb-1.5 block">Banco de origen <span class="text-red-500">*</span></label>
          <select v-model="gastoForm.banco_id" :disabled="cargandoBancosGasto" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm outline-none focus:ring-2 focus:ring-primary-500">
            <option :value="null">{{ cargandoBancosGasto ? 'Cargando bancos...' : 'Seleccionar banco' }}</option>
            <option v-for="banco in bancosGasto" :key="banco.uid || banco.id" :value="banco.id">{{ banco.nombre }} · {{ formatMoney(banco.saldo) }}</option>
          </select>
          <p v-if="!cargandoBancosGasto && bancosGasto.length === 0" class="text-xs text-amber-500 mt-1">No hay bancos configurados.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="guardandoGasto" @click="dialogGasto = false" />
        <Button label="Guardar Gasto" icon="pi pi-check" severity="warn" :loading="guardandoGasto" :disabled="!gastoForm.descripcion.trim() || Number(gastoForm.monto) <= 0 || (gastoForm.metodo_pago === 'TRANSFERENCIA' && !gastoForm.banco_id)" @click="guardarGasto" />
      </template>
    </Dialog>

    <Dialog
      v-if="systemMode.isCellphoneStore"
      v-model:visible="dialogBuscadorImei"
      header="Buscador General de IMEI"
      modal
      :style="{ width: 'min(42rem, 95vw)' }"
      @after-hide="limpiarBusquedaImeiGeneral"
    >
      <div class="flex flex-col gap-4 py-2">
        <p class="text-sm text-surface-500">Busca un IMEI completo o una parte en inventario, apartados, recibidos, taller y facturas.</p>
        <div class="flex items-center gap-2">
          <InputText v-model="imeiBusquedaGeneral" placeholder="Escribe al menos 3 caracteres del IMEI" class="flex-1" fluid autofocus @keydown.enter="buscarImeiGeneral" />
          <Button label="Buscar" icon="pi pi-search" :loading="buscandoImeiGeneral" @click="buscarImeiGeneral" />
        </div>

        <div v-if="buscandoImeiGeneral" class="flex items-center justify-center gap-2 py-10 text-surface-400">
          <i class="pi pi-spin pi-spinner"></i><span>Buscando en todo el sistema...</span>
        </div>
        <div v-else-if="resultadosImeiGeneral.length" class="flex flex-col gap-2 max-h-[25rem] overflow-y-auto pr-1">
          <button
            v-for="resultado in resultadosImeiGeneral"
            :key="resultado.clave"
            type="button"
            class="w-full flex items-center gap-3 p-3 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 text-left hover:border-primary-400 hover:bg-surface-50 dark:hover:bg-surface-700 transition-colors cursor-pointer"
            @click="abrirResultadoImei(resultado)"
          >
            <div class="w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center shrink-0">
              <i :class="[resultado.icono, resultado.color]"></i>
            </div>
            <div class="min-w-0 flex-1">
              <div class="flex items-center gap-2">
                <span class="text-xs font-semibold uppercase tracking-wide text-surface-400">{{ resultado.origen }}</span>
                <span class="font-semibold truncate">{{ resultado.titulo }}</span>
              </div>
              <p class="text-xs text-surface-500 truncate mt-0.5">{{ resultado.detalle }}</p>
            </div>
            <i class="pi pi-arrow-right text-surface-400 shrink-0"></i>
          </button>
        </div>
        <div v-else-if="busquedaImeiRealizada" class="text-center py-10 text-surface-400">
          <i class="pi pi-search text-2xl block mb-2"></i>
          <p>No se encontró ese IMEI en el sistema.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Limpiar" severity="secondary" text :disabled="!imeiBusquedaGeneral" @click="limpiarBusquedaImeiGeneral" />
        <Button label="Cerrar" severity="secondary" text @click="dialogBuscadorImei = false" />
      </template>
    </Dialog>

    <Dialog v-if="systemMode.isCellphoneStore" v-model:visible="dialogImei" header="Consultar IMEI" modal :style="{ width: '28rem' }" @after-hide="imeiResultado = null; imeiInput = ''">
      <div class="flex flex-col gap-4 py-2">
        <div class="flex items-center gap-2">
          <label class="text-sm font-semibold whitespace-nowrap">Servicio:</label>
          <InputText v-model.number="imeiServicio" type="number" class="w-20" placeholder="55" @keydown.enter="consultarImei" />
        </div>
        <div class="flex items-center gap-2">
          <InputText v-model="imeiInput" placeholder="IMEI (15 digitos)" class="flex-1" fluid maxlength="15" @keydown.enter="consultarImei" />
          <Button label="Consultar" icon="pi pi-search" :loading="imeiConsultando" @click="consultarImei" />
        </div>
        <div v-if="imeiConsultando" class="flex items-center justify-center py-8 text-surface-400 gap-2"><i class="pi pi-spin pi-spinner"></i><span>Consultando IMEI...</span></div>
        <div v-else-if="imeiResultado" class="space-y-3">
          <div v-if="imeiResultado.response?.object" class="rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 divide-y divide-surface-200 dark:divide-surface-700 overflow-hidden">
            <div class="px-4 py-2.5 text-sm flex items-center gap-2" :class="imeiResultado.response.object.blacklistStatus ? 'bg-red-50 dark:bg-red-900/20' : 'bg-green-50 dark:bg-green-900/20'">
              <i :class="imeiResultado.response.object.blacklistStatus ? 'pi pi-times-circle text-red-500' : 'pi pi-check-circle text-green-500'"></i>
              <span class="font-semibold" :class="imeiResultado.response.object.blacklistStatus ? 'text-red-700 dark:text-red-400' : 'text-green-700 dark:text-green-400'">{{ imeiResultado.response.object.blacklistStatus ? 'BLACKLISTEADO' : 'LIMPIO' }}</span>
            </div>
            <div v-for="(val, key) in { Modelo: imeiResultado.response.object.model, 'Nombre': imeiResultado.response.object.modelName, Fabricante: imeiResultado.response.object.manufacturer, IMEI: imeiResultado.response.object.imei }" :key="key" class="flex items-start gap-2 px-4 py-2.5 text-sm">
              <span class="text-surface-400 font-medium min-w-[90px]">{{ key }}:</span><span class="font-medium break-all">{{ val }}</span>
            </div>
          </div>
          <div v-else class="p-4 rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 text-sm text-red-600 dark:text-red-400 text-center">{{ imeiResultado.message || imeiResultado.error || 'Sin resultados' }}</div>
        </div>
      </div>
      <template #footer>
        <Button label="Limpiar" severity="secondary" text :disabled="!imeiResultado && !imeiInput" @click="imeiResultado = null; imeiInput = ''" />
        <Button label="Cerrar" severity="secondary" text @click="dialogImei = false" />
      </template>
    </Dialog>

    <Dialog v-model:visible="dialogRed" header="Acceso por Red Local" modal :style="{ width: '22rem' }">
      <div class="flex flex-col items-center gap-4 py-4">
        <p class="text-sm text-surface-500 text-center">Escanea este codigo QR desde otro dispositivo en la misma red:</p>
        <div v-if="qrDataUrl" class="bg-white p-3 rounded-xl shadow-md"><img :src="qrDataUrl" alt="QR" class="w-56 h-56" /></div>
        <div class="flex items-center gap-2 w-full">
          <input :value="serverUrl" readonly class="flex-1 text-xs font-mono px-3 py-2 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-50 dark:bg-surface-800 text-center outline-none" />
          <Button icon="pi pi-copy" severity="primary" text rounded size="small" @click="copiarUrl" v-tooltip="'Copiar URL'" />
        </div>
      </div>
      <template #footer><Button label="Cerrar" severity="secondary" text @click="dialogRed = false" /></template>
    </Dialog>
  </div>
</template>

<style scoped>
.dashboard-page h1,
.dashboard-page h2,
.dashboard-page h3 {
  letter-spacing: 0;
}

.dashboard-kpi,
.dashboard-action,
.dashboard-panel {
  border-color: var(--app-border, rgba(203, 213, 225, 0.82)) !important;
  background: var(--app-surface, rgba(255, 255, 255, 0.9)) !important;
  box-shadow: var(--shadow-card, 0 10px 30px -24px rgba(15, 23, 42, 0.45));
  backdrop-filter: blur(14px);
}

.dashboard-kpi {
  min-height: 7rem;
  position: relative;
  overflow: hidden;
}

.dashboard-kpi::after {
  content: '';
  position: absolute;
  inset: 0;
  pointer-events: none;
  background: linear-gradient(135deg, rgba(99, 102, 241, 0.08), transparent 48%);
}

.dashboard-action {
  min-height: 8.25rem;
  transition: border-color 0.18s ease, box-shadow 0.18s ease, transform 0.18s ease;
}

.dashboard-action:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow-card-hover, 0 18px 42px -28px rgba(15, 23, 42, 0.62)) !important;
}

.dashboard-panel {
  box-shadow: var(--shadow-card, 0 10px 30px -24px rgba(15, 23, 42, 0.45));
}

:global(.dark) .dashboard-kpi,
:global(.dark) .dashboard-action,
:global(.dark) .dashboard-panel {
  background: var(--app-surface, rgba(15, 23, 42, 0.78)) !important;
  border-color: var(--app-border, rgba(71, 85, 105, 0.78)) !important;
}

@media (max-width: 640px) {
  .dashboard-kpi {
    min-height: 6.4rem;
  }

  .dashboard-action {
    min-height: 7.6rem;
    padding: 0.85rem !important;
  }
}
</style>
