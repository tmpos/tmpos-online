import router from '@/router'
import { calcularPlanFinanciamiento, crearFinanciamiento } from '@/services/financingService'
import { formatSystemCurrency, getFiscalLabels } from '@/i18n/localeProfiles'

export interface AssistantMessage {
  role: 'user' | 'assistant'
  content: string
}

const DEFAULT_MODEL = 'gpt-5.6-sol'
const fiscal = () => getFiscalLabels()

const OPERATIONAL_TABLES = [
  'clientes', 'proveedores', 'usuarios', 'telefonos', 'imei', 'accesorios',
  'electrodomesticos', 'serial', 'categorias', 'marcas', 'piezas', 'tecnicos',
  'ordenes_taller', 'facturas', 'cuentas_cobrar', 'cuentas_pagar', 'bancos',
  'gastos', 'gastos_fijos', 'caja_turnos', 'caja_movimientos', 'cuadres',
  'catalogo_cuentas', 'comprobantes_fiscales', 'comisiones', 'ordenes_compra',
  'transferencias', 'perdidas', 'garantias', 'reclamos_garantia',
  'reclamaciones', 'notas', 'tickets_soporte', 'ticket_comentarios',
  'metodos_pago', 'almacenes', 'ajustes_inventario', 'historial_precios',
  'financiamientos', 'cuotas_financiamiento', 'promociones', 'listas_precios',
  'variantes_productos', 'niveles_fidelidad', 'movimientos_puntos',
  'tarjetas_regalo', 'reservas_piezas', 'comisiones_tecnicos', 'pedidos_online',
] as const

const MODULES = [
  'inicio', 'vender', 'inventario', 'telefonos', 'imei', 'accesorios',
  'electrodomesticos', 'serial', 'perdidas', 'categorias', 'marcas',
  'etiquetas', 'cambiazo', 'transferencias', 'compras', 'reporte_inventario',
  'ajustes_inventario', 'historial_precios', 'ventas', 'facturas',
  'cotizaciones', 'apartados', 'recibidos', 'notas_credito', 'notas',
  'reclamaciones', 'clientes', 'usuarios', 'proveedores', 'taller',
  'ordenes_taller', 'orden_express', 'piezas', 'tecnicos', 'garantias',
  'reporte_taller', 'contabilidad', 'caja', 'comprar', 'cuadre',
  'cuentas_cobrar', 'cuentas_pagar', 'bancos', 'gastos', 'gastos_fijos',
  'utilidades', 'catalogo_cuentas', 'balance_general', 'comprobantes',
  'comisiones', 'reportes', 'reporte_general', 'reporte_606', 'reporte_607',
  'reporte_gastos', 'reporte_ventas', 'reporte_ganancias', 'soporte',
  'configuracion',
] as const

const tools = [
  {
    type: 'function',
    name: 'buscar_imei',
    description: 'Busca un IMEI en el inventario local y devuelve su equipo, estado, precio, costo, color y capacidad.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        imei: { type: 'string', description: 'IMEI completo o una parte del IMEI.' },
      },
      required: ['imei'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'buscar_clientes',
    description: `Busca clientes por nombre, teléfono, ${fiscal().customerIdLabel} o email.`,
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        consulta: { type: 'string', description: 'Texto a buscar.' },
      },
      required: ['consulta'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'crear_cliente',
    description: 'Crea un cliente nuevo. Esta accion requiere confirmacion del usuario.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        nombre: { type: 'string' },
        telefono: { type: 'string' },
        email: { type: 'string' },
        direccion: { type: 'string' },
        rnc: { type: 'string' },
      },
      required: ['nombre', 'telefono', 'email', 'direccion', 'rnc'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'preparar_factura',
    description: 'Prepara una factura agregando un IMEI disponible al carrito del POS y seleccionando el cliente. No finaliza ni cobra la venta.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        imei: { type: 'string', description: 'IMEI exacto que se desea facturar.' },
        cliente: { type: 'string', description: `Nombre, teléfono o ${fiscal().customerIdLabel} del cliente. Puede ser CONSUMIDOR FINAL.` },
        metodo_pago: { type: 'string', enum: ['EFECTIVO', 'TARJETA', 'TRANSFERENCIA', 'CREDITO', 'MIXTO'] },
      },
      required: ['imei', 'cliente', 'metodo_pago'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'abrir_modulo',
    description: 'Navega a cualquier modulo o submodulo del sistema.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        modulo: {
          type: 'string',
          enum: MODULES,
        },
      },
      required: ['modulo'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'consultar_resumen',
    description: 'Consulta un resumen local de inventario, clientes o ventas del dia.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['inventario', 'clientes', 'ventas_hoy'] },
      },
      required: ['tipo'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'consultar_datos',
    description: 'Consulta registros de cualquier modulo operativo. Busca texto en todos los campos, permite filtrar por estado y nunca devuelve claves ni contrasenas.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        tabla: { type: 'string', enum: OPERATIONAL_TABLES },
        consulta: { type: 'string', description: 'Texto libre a buscar. Usa cadena vacia para listar.' },
        estado: { type: 'string', description: 'Estado exacto a filtrar. Usa cadena vacia para no filtrar.' },
        limite: { type: 'integer', minimum: 1, maximum: 50 },
      },
      required: ['tabla', 'consulta', 'estado', 'limite'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'gestionar_registro',
    description: 'Crea, edita o elimina registros en los modulos operativos. Siempre muestra una confirmacion al usuario. Para crear usa id 0; para eliminar usa datos_json "{}".',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        accion: { type: 'string', enum: ['crear', 'editar', 'eliminar'] },
        tabla: { type: 'string', enum: OPERATIONAL_TABLES },
        id: { type: 'integer', minimum: 0 },
        datos_json: { type: 'string', description: 'Objeto JSON con los campos y valores. No inventes campos.' },
        motivo: { type: 'string', description: 'Resumen breve de lo solicitado por el usuario.' },
      },
      required: ['accion', 'tabla', 'id', 'datos_json', 'motivo'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'analizar_negocio',
    description: 'Analiza datos locales reales y detecta inventario bajo, equipos inmoviles, margenes peligrosos, clientes inactivos y ordenes de taller atrasadas. Usa "general" para un diagnostico completo.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        analisis: {
          type: 'string',
          enum: ['general', 'stock_bajo', 'inventario_inmovil', 'margenes', 'clientes_inactivos', 'taller_atrasado'],
        },
        dias: { type: 'integer', minimum: 1, maximum: 730, description: 'Antiguedad que se usara para el analisis.' },
      },
      required: ['analisis', 'dias'],
      additionalProperties: false,
    },
  },
  {
    type: 'function',
    name: 'crear_financiamiento',
    description: 'Calcula capacidad de pago, muestra el plan y crea un financiamiento con calendario de cuotas después de confirmación.',
    strict: true,
    parameters: {
      type: 'object',
      properties: {
        cliente_nombre: { type: 'string' },
        cliente_telefono: { type: 'string' },
        monto_original: { type: 'number', minimum: 0 },
        inicial: { type: 'number', minimum: 0 },
        tasa_interes: { type: 'number', minimum: 0 },
        mora_porcentaje: { type: 'number', minimum: 0 },
        cantidad_cuotas: { type: 'integer', minimum: 1, maximum: 260 },
        frecuencia: { type: 'string', enum: ['SEMANAL', 'QUINCENAL', 'MENSUAL'] },
        ingreso_mensual: { type: 'number', minimum: 0 },
        gastos_mensuales: { type: 'number', minimum: 0 },
        garante_nombre: { type: 'string' },
        garante_cedula: { type: 'string' },
        garante_telefono: { type: 'string' },
      },
      required: ['cliente_nombre', 'cliente_telefono', 'monto_original', 'inicial', 'tasa_interes', 'mora_porcentaje', 'cantidad_cuotas', 'frecuencia', 'ingreso_mensual', 'gastos_mensuales', 'garante_nombre', 'garante_cedula', 'garante_telefono'],
      additionalProperties: false,
    },
  },
]

const instructions = `Eres Jarvis, el asistente por voz del sistema TMPOS.
Habla siempre en español claro, breve y profesional.
Tienes herramientas para navegar, consultar y administrar inventario, ventas, contactos, taller, compras, transferencias, contabilidad, reportes, soporte y configuracion operativa.
No inventes resultados: para cualquier dato del negocio debes usar una herramienta.
Usa buscar_imei y buscar_clientes para esas busquedas especializadas. Para los demas datos usa consultar_datos.
Para crear, editar o eliminar usa gestionar_registro. Antes de llamarla resume la accion; TMPOS mostrara una confirmacion obligatoria.
Cuando te pidan recomendaciones, alertas, productos para comprar, inventario sin rotacion, clientes que no regresan o trabajos atrasados, usa analizar_negocio.
Para crear ventas financiadas usa crear_financiamiento; explica antes la cuota, el total y el nivel de riesgo.
Nunca solicites ni reveles contrasenas, PIN, API keys, tokens o secretos almacenados.
No cambies configuracion de licencias, credenciales de nube, OpenAI, correo o sincronizacion.
Preparar una factura solo carga el carrito y abre el POS. Nunca afirmes que una venta fue cobrada o finalizada si solo fue preparada.
Si faltan datos obligatorios, pregunta por ellos antes de llamar la herramienta.
Las ventas, cobros, movimientos de caja y documentos fiscales deben respetar el flujo del modulo; no los declares finalizados si solo abriste o preparaste la pantalla.
Cuando una herramienta falle, explica el error y ofrece el siguiente paso concreto.`

function currentWarehouse() {
  return {
    id: Number(localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0),
    uid: String(localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || ''),
  }
}

function filterWarehouse(rows: any[]): any[] {
  const almacen = currentWarehouse()
  if (almacen.uid) {
    const conUid = rows.filter(row => String(row.almacen_uid || '') === almacen.uid)
    if (conUid.length) return conUid
  }
  if (almacen.id) {
    return rows.filter(row => !Number(row.almacen_id) || Number(row.almacen_id) === almacen.id)
  }
  return rows
}

function normalize(value: unknown): string {
  return String(value || '').trim().toLowerCase()
}

function assertOperationalTable(table: string): asserts table is typeof OPERATIONAL_TABLES[number] {
  if (!(OPERATIONAL_TABLES as readonly string[]).includes(table)) {
    throw new Error(`La tabla "${table}" no esta habilitada para Jarvis`)
  }
}

function sanitizeRecord(row: Record<string, any>) {
  const hidden = /password|contrasena|pin|api.?key|token|secret|licencia_cifrada/i
  return Object.fromEntries(
    Object.entries(row || {})
      .filter(([key]) => !hidden.test(key))
      .map(([key, value]) => [
        key,
        typeof value === 'string' && value.length > 500 ? `${value.slice(0, 500)}...` : value,
      ])
  )
}

function parseMutationData(raw: string, table: string): Record<string, any> {
  let parsed: any
  try {
    parsed = JSON.parse(raw || '{}')
  } catch {
    throw new Error('Los datos enviados no tienen un formato JSON valido')
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Los datos deben ser un objeto JSON')
  }

  const blocked = /api.?key|token|secret|licencia_cifrada/i
  const clean: Record<string, any> = {}
  for (const [key, value] of Object.entries(parsed)) {
    if (['id', 'created_at', 'updated_at', '__proto__', 'constructor', 'prototype'].includes(key)) continue
    if (blocked.test(key)) throw new Error(`Jarvis no puede modificar el campo protegido "${key}"`)
    if ((key === 'password' || key === 'pin') && table !== 'usuarios') {
      throw new Error(`El campo "${key}" solo es valido al administrar usuarios`)
    }
    clean[key] = value
  }
  return clean
}

function notifyDataChange(table: string, action: string, id?: number) {
  window.dispatchEvent(new CustomEvent('jarvis:data-change', {
    detail: { table, action, id: id || 0 },
  }))
}

async function getConfig(key: string): Promise<string> {
  const result = await (window as any).electron.invoke('config:get', key) as any
  return result?.success ? String(result.data || '') : ''
}

async function requestOpenAI(payload: Record<string, unknown>): Promise<any> {
  // Electron IPC cannot clone Vue proxies. Serializing also guarantees that tool
  // definitions and conversation items cross the preload bridge as plain data.
  const plainPayload = JSON.parse(JSON.stringify(payload))
  const response = await (window as any).electron.invoke('openai:request', plainPayload) as any
  if (!response?.success) throw new Error(response?.error || 'No se pudo conectar con OpenAI')
  return response.data
}

async function buscarImei(args: any) {
  const [imeiRes, telRes] = await Promise.all([
    window.db.getAll('imei'),
    window.db.getAll('telefonos'),
  ])
  if (!imeiRes.success) throw new Error(imeiRes.error || 'No se pudo consultar los IMEI')
  const term = normalize(args.imei)
  const telefonos = telRes.success ? (telRes.data || []) : []
  const encontrados = filterWarehouse(imeiRes.data || [])
    .filter((row: any) => normalize(row.nombre).includes(term))
    .slice(0, 10)
    .map((row: any) => {
      const telefono = telefonos.find((tel: any) =>
        (row.telefono_uid && tel.uid === row.telefono_uid) || Number(tel.id) === Number(row.id_equi)
      )
      return {
        id: row.id,
        imei: row.nombre,
        equipo: telefono?.nombre || row.equipo || 'Sin equipo',
        estado: row.estado || 'DISPONIBLE',
        color: row.color || '',
        capacidad: row.capacidad || '',
        precio_venta: Number(row.precio_venta || 0),
        costo: Number(row.costo || 0),
      }
    })
  return { total: encontrados.length, resultados: encontrados }
}

async function buscarClientes(args: any) {
  const result = await window.db.getAll('clientes')
  if (!result.success) throw new Error(result.error || 'No se pudo consultar los clientes')
  const term = normalize(args.consulta)
  const rows = filterWarehouse(result.data || [])
    .filter((row: any) => [row.nombre, row.telefono, row.cedula, row.rnc, row.email].some(value => normalize(value).includes(term)))
    .slice(0, 10)
    .map((row: any) => ({
      id: row.id,
      nombre: row.nombre,
      telefono: row.telefono || '',
      cedula_rnc: row.cedula || row.rnc || '',
      email: row.email || '',
      direccion: row.direccion || '',
    }))
  return { total: rows.length, resultados: rows }
}

async function crearCliente(args: any) {
  const nombre = String(args.nombre || '').trim().toUpperCase()
  if (!nombre) throw new Error('El nombre del cliente es obligatorio')
  const confirmado = window.confirm(
    `Jarvis quiere crear este cliente:\n\n${nombre}\nTeléfono: ${args.telefono || '-'}\n${fiscal().customerIdLabel}: ${args.rnc || '-'}\n\n¿Deseas continuar?`
  )
  if (!confirmado) return { cancelado: true, mensaje: 'El usuario canceló la creación del cliente.' }

  const existentes = await window.db.getAll('clientes')
  const duplicado = (existentes.data || []).find((row: any) =>
    normalize(row.nombre) === normalize(nombre) &&
    (!args.telefono || normalize(row.telefono) === normalize(args.telefono))
  )
  if (duplicado) return { creado: false, duplicado: true, cliente: { id: duplicado.id, nombre: duplicado.nombre } }

  const almacen = currentWarehouse()
  const result = await window.db.insert('clientes', {
    nombre,
    telefono: String(args.telefono || '').trim(),
    email: String(args.email || '').trim(),
    direccion: String(args.direccion || '').trim().toUpperCase(),
    rnc: String(args.rnc || '').trim(),
    activo: 'ACTIVO',
    almacen_id: almacen.id,
    almacen_uid: almacen.uid,
  })
  if (!result.success) throw new Error(result.error || 'No se pudo crear el cliente')
  window.dispatchEvent(new CustomEvent('jarvis:data-change', { detail: { table: 'clientes' } }))
  return { creado: true, id: result.data?.id, nombre }
}

async function prepararFactura(args: any) {
  const [imeiRes, telRes, clienteRes] = await Promise.all([
    window.db.getAll('imei'),
    window.db.getAll('telefonos'),
    window.db.getAll('clientes'),
  ])
  const imei = filterWarehouse(imeiRes.data || []).find((row: any) => normalize(row.nombre) === normalize(args.imei))
  if (!imei) throw new Error(`No encontré el IMEI ${args.imei} en el almacén actual`)
  if (normalize(imei.estado || 'DISPONIBLE') !== 'disponible') {
    throw new Error(`El IMEI ${imei.nombre} no está disponible; su estado es ${imei.estado}`)
  }
  const telefono = (telRes.data || []).find((row: any) =>
    (imei.telefono_uid && row.uid === imei.telefono_uid) || Number(row.id) === Number(imei.id_equi)
  )
  if (!telefono) throw new Error('El IMEI no tiene un teléfono válido asignado')
  if (Number(imei.precio_venta || 0) <= 0) throw new Error('El IMEI no tiene un precio de venta válido')

  const clienteTerm = normalize(args.cliente)
  const consumidorFinal = !clienteTerm || clienteTerm === 'consumidor final' || clienteTerm === 'al contado'
  const cliente = consumidorFinal ? null : filterWarehouse(clienteRes.data || []).find((row: any) =>
    [row.nombre, row.telefono, row.cedula, row.rnc].some(value => normalize(value).includes(clienteTerm))
  )
  if (!consumidorFinal && !cliente) throw new Error(`No encontré el cliente "${args.cliente}"`)

  const confirmado = window.confirm(
    `Preparar factura:\n\n${telefono.nombre}\nIMEI: ${imei.nombre}\nCliente: ${cliente?.nombre || 'CONSUMIDOR FINAL'}\nPago: ${args.metodo_pago}\nTotal: ${formatSystemCurrency(imei.precio_venta)}\n\nEsto abrirá el POS, pero no cobrará la venta.`
  )
  if (!confirmado) return { cancelado: true, mensaje: 'El usuario canceló la preparación de la factura.' }

  const state = {
    cart: [{
      tipo: 'imei',
      imei_id: imei.id,
      imei_ids: [imei.id],
      imei: imei.nombre,
      imeis: [imei.nombre],
      codigo: imei.nombre,
      nombre: telefono.nombre,
      telefono_id: telefono.id,
      color: imei.color || '',
      colores: imei.color ? [imei.color] : [],
      capacidad: imei.capacidad || '',
      capacidades: imei.capacidad ? [imei.capacidad] : [],
      precio: Number(imei.precio_venta),
      precio_normal: Number(imei.precio_venta),
      costo: Number(imei.costo || 0),
      cantidad: 1,
    }],
    cliente,
    descuento_fijo: 0,
    descuento_porc: 0,
    descuento_tipo: 'fijo',
    descuento_valor: 0,
    metodoPago: args.metodo_pago,
    nota: 'Factura preparada por Jarvis',
    es_cotizacion: false,
  }
  localStorage.setItem('pos_cart_data', JSON.stringify(state))
  await router.push('/vender')
  return {
    preparado: true,
    imei: imei.nombre,
    equipo: telefono.nombre,
    cliente: cliente?.nombre || 'CONSUMIDOR FINAL',
    total: Number(imei.precio_venta),
    mensaje: 'Carrito preparado. El usuario debe revisar y confirmar la venta en el POS.',
  }
}

async function abrirModulo(args: any) {
  const routes: Record<string, { path: string, tab?: string }> = {
    inicio: { path: '/' },
    vender: { path: '/vender' },
    inventario: { path: '/inventario' },
    telefonos: { path: '/inventario', tab: 'telefonos' },
    imei: { path: '/inventario', tab: 'imei' },
    accesorios: { path: '/inventario', tab: 'accesorios' },
    electrodomesticos: { path: '/inventario', tab: 'electrodomesticos' },
    serial: { path: '/inventario', tab: 'serial' },
    perdidas: { path: '/inventario', tab: 'perdidas' },
    categorias: { path: '/inventario', tab: 'categorias' },
    marcas: { path: '/inventario', tab: 'marcas' },
    etiquetas: { path: '/inventario', tab: 'etiquetas' },
    cambiazo: { path: '/inventario', tab: 'cambiazo' },
    transferencias: { path: '/inventario', tab: 'transferencias' },
    compras: { path: '/inventario', tab: 'compras' },
    reporte_inventario: { path: '/inventario', tab: 'reporte' },
    ajustes_inventario: { path: '/inventario', tab: 'ajustes' },
    historial_precios: { path: '/inventario', tab: 'historial-precios' },
    ventas: { path: '/ventas' },
    facturas: { path: '/ventas', tab: 'facturas' },
    cotizaciones: { path: '/ventas', tab: 'cotizaciones' },
    apartados: { path: '/ventas', tab: 'apartados' },
    recibidos: { path: '/ventas', tab: 'recibidos' },
    notas_credito: { path: '/ventas', tab: 'notas-credito' },
    notas: { path: '/ventas', tab: 'notas' },
    reclamaciones: { path: '/ventas', tab: 'reclamaciones' },
    clientes: { path: '/contactos', tab: 'clientes' },
    usuarios: { path: '/contactos', tab: 'usuarios' },
    proveedores: { path: '/contactos', tab: 'proveedores' },
    taller: { path: '/taller' },
    ordenes_taller: { path: '/taller', tab: 'ordenes' },
    orden_express: { path: '/taller', tab: 'orden-express' },
    piezas: { path: '/taller', tab: 'piezas' },
    tecnicos: { path: '/taller', tab: 'tecnicos' },
    garantias: { path: '/taller', tab: 'garantias' },
    reporte_taller: { path: '/taller', tab: 'reporte' },
    contabilidad: { path: '/contabilidad' },
    caja: { path: '/contabilidad', tab: 'caja' },
    comprar: { path: '/contabilidad', tab: 'comprar' },
    cuadre: { path: '/contabilidad', tab: 'cuadre' },
    cuentas_cobrar: { path: '/contabilidad', tab: 'cxc' },
    cuentas_pagar: { path: '/contabilidad', tab: 'cxp' },
    bancos: { path: '/contabilidad', tab: 'bancos' },
    gastos: { path: '/contabilidad', tab: 'gastos' },
    gastos_fijos: { path: '/contabilidad', tab: 'gastos-fijos' },
    utilidades: { path: '/contabilidad', tab: 'utilidades' },
    catalogo_cuentas: { path: '/contabilidad', tab: 'catalogo' },
    balance_general: { path: '/contabilidad', tab: 'balance' },
    comprobantes: { path: '/contabilidad', tab: 'comprobantes' },
    comisiones: { path: '/contabilidad', tab: 'comisiones' },
    reportes: { path: '/reportes' },
    reporte_general: { path: '/reportes', tab: 'general' },
    reporte_606: { path: '/reportes', tab: '606' },
    reporte_607: { path: '/reportes', tab: '607' },
    reporte_gastos: { path: '/reportes', tab: 'gastos' },
    reporte_ventas: { path: '/reportes', tab: 'ventas' },
    reporte_ganancias: { path: '/reportes', tab: 'ganancias' },
    soporte: { path: '/soporte' },
    configuracion: { path: '/configuracion' },
  }
  const target = routes[args.modulo]
  if (!target) throw new Error('Modulo no reconocido')
  await router.push({ path: target.path, query: target.tab ? { tab: target.tab } : {} })
  return { abierto: true, modulo: args.modulo }
}

async function consultarDatos(args: any) {
  const table = String(args.tabla || '')
  assertOperationalTable(table)
  const result = await window.db.getAll(table)
  if (!result.success) throw new Error(result.error || `No se pudo consultar ${table}`)

  const term = normalize(args.consulta)
  const status = normalize(args.estado)
  const limit = Math.max(1, Math.min(50, Number(args.limite) || 20))
  const rows = filterWarehouse(result.data || [])
    .filter((row: any) => {
      if (status) {
        const rowStatus = normalize(row.estado ?? row.estado_factura ?? row.activo)
        if (rowStatus !== status) return false
      }
      if (!term) return true
      return Object.values(sanitizeRecord(row)).some(value => normalize(value).includes(term))
    })

  return {
    tabla: table,
    total_encontrados: rows.length,
    resultados: rows.slice(0, limit).map((row: any) => sanitizeRecord(row)),
    truncado: rows.length > limit,
  }
}

async function gestionarRegistro(args: any) {
  const table = String(args.tabla || '')
  const action = String(args.accion || '')
  const id = Number(args.id || 0)
  assertOperationalTable(table)
  if (!['crear', 'editar', 'eliminar'].includes(action)) throw new Error('Accion no valida')
  if (action !== 'crear' && id <= 0) throw new Error('Debes indicar el ID del registro')

  const current = action === 'crear' ? null : await window.db.getById(table, id)
  if (action !== 'crear' && (!current?.success || !current.data)) {
    throw new Error(`No existe el registro ${id} en ${table}`)
  }

  const data = action === 'eliminar' ? {} : parseMutationData(String(args.datos_json || '{}'), table)
  if (action !== 'eliminar' && !Object.keys(data).length) throw new Error('No se recibieron datos para guardar')

  const financialTables = new Set([
    'facturas', 'cuentas_cobrar', 'cuentas_pagar', 'bancos', 'gastos',
    'caja_turnos', 'caja_movimientos', 'cuadres', 'comisiones',
  ])
  const detail = action === 'eliminar'
    ? JSON.stringify(sanitizeRecord(current!.data), null, 2).slice(0, 1400)
    : JSON.stringify(sanitizeRecord(data), null, 2).slice(0, 1400)
  const warning = financialTables.has(table)
    ? '\n\nADVERTENCIA: esta accion afecta informacion financiera.'
    : ''
  const confirmed = window.confirm(
    `Jarvis solicita ${action} en ${table}${id ? ` (ID ${id})` : ''}.\n\n${args.motivo || ''}\n\n${detail}${warning}\n\nDeseas continuar?`
  )
  if (!confirmed) return { cancelado: true, mensaje: 'El usuario cancelo la accion.' }

  let result: any
  if (action === 'crear') {
    const almacen = currentWarehouse()
    if (almacen.id) data.almacen_id = almacen.id
    if (almacen.uid) data.almacen_uid = almacen.uid
    result = await window.db.insert(table, data)
  }
  else if (action === 'editar') result = await window.db.update(table, id, data)
  else result = await window.db.delete(table, id)
  if (!result?.success) throw new Error(result?.error || `No se pudo ${action} el registro`)

  const resultId = action === 'crear' ? Number(result.data?.id || result.id || 0) : id
  try {
    await window.db.insert('auditoria_acciones', {
      modulo: 'JARVIS',
      accion: action.toUpperCase(),
      entidad: table,
      entidad_id: resultId,
      referencia: String(args.motivo || '').slice(0, 200),
      usuario: localStorage.getItem('mr_user_usuario') || localStorage.getItem('usuario') || 'JARVIS',
      detalle: JSON.stringify({
        solicitado_por_voz: true,
        datos: action === 'eliminar' ? sanitizeRecord(current!.data) : sanitizeRecord(data),
      }).slice(0, 4000),
      resultado: 'COMPLETADO',
    })
  } catch (auditError) {
    console.warn('No se pudo registrar la auditoria de Jarvis:', auditError)
  }
  notifyDataChange(table, action, resultId)
  return {
    completado: true,
    accion: action,
    tabla: table,
    id: resultId,
    mensaje: `Registro ${action === 'crear' ? 'creado' : action === 'editar' ? 'actualizado' : 'eliminado'} correctamente.`,
  }
}

function ageInDays(value: unknown): number {
  const timestamp = new Date(String(value || '')).getTime()
  if (!Number.isFinite(timestamp)) return 0
  return Math.max(0, Math.floor((Date.now() - timestamp) / 86400000))
}

async function analizarNegocio(args: any) {
  const tipo = String(args.analisis || 'general')
  const dias = Math.max(1, Math.min(730, Number(args.dias) || 60))
  const [accesoriosRes, piezasRes, imeiRes, clientesRes, facturasRes, tallerRes] = await Promise.all([
    window.db.getAll('accesorios'),
    window.db.getAll('piezas'),
    window.db.getAll('imei'),
    window.db.getAll('clientes'),
    window.db.getAll('facturas'),
    window.db.getAll('ordenes_taller'),
  ])

  const accesorios = filterWarehouse(accesoriosRes.data || [])
  const piezas = filterWarehouse(piezasRes.data || [])
  const imeis = filterWarehouse(imeiRes.data || [])
  const clientes = filterWarehouse(clientesRes.data || [])
  const facturas = filterWarehouse(facturasRes.data || [])
  const ordenes = filterWarehouse(tallerRes.data || [])

  const stockBajo = [...accesorios.map((item: any) => ({ ...item, origen: 'producto' })), ...piezas.map((item: any) => ({ ...item, origen: 'pieza' }))]
    .filter((item: any) => Number(item.cantidad || 0) <= Number(item.alerta ?? item.stock_minimo ?? 0))
    .sort((a: any, b: any) => Number(a.cantidad || 0) - Number(b.cantidad || 0))
    .slice(0, 20)
    .map((item: any) => ({
      tipo: item.origen,
      id: item.id,
      nombre: item.nombre,
      existencia: Number(item.cantidad || 0),
      minimo: Number(item.alerta ?? item.stock_minimo ?? 0),
      sugerido: Math.max(1, Number(item.alerta ?? item.stock_minimo ?? 0) * 2 - Number(item.cantidad || 0)),
    }))

  const inventarioInmovil = imeis
    .filter((item: any) => normalize(item.estado || 'DISPONIBLE') === 'disponible' && ageInDays(item.created_at) >= dias)
    .sort((a: any, b: any) => ageInDays(b.created_at) - ageInDays(a.created_at))
    .slice(0, 20)
    .map((item: any) => ({
      id: item.id,
      imei: item.nombre,
      equipo: item.equipo || '',
      dias_en_inventario: ageInDays(item.created_at),
      costo: Number(item.costo || 0),
      precio: Number(item.precio_venta || 0),
    }))

  const margenes = [...accesorios.map((item: any) => ({ ...item, tipo: 'producto' })), ...imeis.map((item: any) => ({ ...item, tipo: 'imei' }))]
    .map((item: any) => {
      const costo = Number(item.costo || 0)
      const precio = Number(item.precio_venta || 0)
      return {
        tipo: item.tipo,
        id: item.id,
        nombre: item.equipo || item.nombre,
        costo,
        precio,
        margen_porcentaje: precio > 0 ? Math.round(((precio - costo) / precio) * 10000) / 100 : 0,
      }
    })
    .filter((item: any) => item.precio <= item.costo || item.margen_porcentaje < 15)
    .sort((a: any, b: any) => a.margen_porcentaje - b.margen_porcentaje)
    .slice(0, 20)

  const fechaLimite = Date.now() - dias * 86400000
  const compradoresRecientes = new Set(
    facturas
      .filter((factura: any) => new Date(String(factura.created_at || factura.fecha_emision || '')).getTime() >= fechaLimite)
      .flatMap((factura: any) => [normalize(factura.cod_cliente), normalize(factura.nombre_cliente)])
      .filter(Boolean)
  )
  const clientesInactivos = clientes
    .filter((cliente: any) =>
      !compradoresRecientes.has(normalize(cliente.id)) &&
      !compradoresRecientes.has(normalize(cliente.cod_cliente)) &&
      !compradoresRecientes.has(normalize(cliente.nombre))
    )
    .slice(0, 20)
    .map((cliente: any) => ({
      id: cliente.id,
      nombre: cliente.nombre,
      telefono: cliente.telefono || '',
      email: cliente.email || '',
    }))

  const tallerAtrasado = ordenes
    .filter((orden: any) =>
      !['completado', 'entregado', 'cancelado'].includes(normalize(orden.estado)) &&
      ageInDays(orden.fecha_entrada || orden.created_at) >= dias
    )
    .sort((a: any, b: any) => ageInDays(b.fecha_entrada || b.created_at) - ageInDays(a.fecha_entrada || a.created_at))
    .slice(0, 20)
    .map((orden: any) => ({
      id: orden.id,
      orden: orden.no_orden,
      cliente: orden.nombre,
      equipo: orden.equipo,
      tecnico: orden.tecnico,
      estado: orden.estado,
      dias_abierta: ageInDays(orden.fecha_entrada || orden.created_at),
    }))

  const resultado: Record<string, any> = { analisis: tipo, dias }
  if (tipo === 'general' || tipo === 'stock_bajo') resultado.stock_bajo = stockBajo
  if (tipo === 'general' || tipo === 'inventario_inmovil') resultado.inventario_inmovil = inventarioInmovil
  if (tipo === 'general' || tipo === 'margenes') resultado.margenes_peligrosos = margenes
  if (tipo === 'general' || tipo === 'clientes_inactivos') resultado.clientes_inactivos = clientesInactivos
  if (tipo === 'general' || tipo === 'taller_atrasado') resultado.taller_atrasado = tallerAtrasado
  resultado.recomendaciones = [
    stockBajo.length ? `Reponer ${stockBajo.length} productos o piezas con existencia baja.` : '',
    inventarioInmovil.length ? `Revisar precio o promocionar ${inventarioInmovil.length} equipos sin rotacion.` : '',
    margenes.length ? `Corregir ${margenes.length} precios con margen inferior al 15%.` : '',
    tallerAtrasado.length ? `Dar seguimiento a ${tallerAtrasado.length} ordenes atrasadas.` : '',
    clientesInactivos.length ? `Preparar una campana para hasta ${clientesInactivos.length} clientes inactivos.` : '',
  ].filter(Boolean)
  return resultado
}

async function crearFinanciamientoJarvis(args: any) {
  const plan = calcularPlanFinanciamiento(args)
  const confirmado = window.confirm(
    `Crear financiamiento para ${args.cliente_nombre}\n\n` +
    `Monto: RD$ ${Number(args.monto_original).toFixed(2)}\nInicial: RD$ ${Number(args.inicial).toFixed(2)}\n` +
    `${args.cantidad_cuotas} cuotas ${String(args.frecuencia).toLowerCase()} de RD$ ${plan.cuota.toFixed(2)}\n` +
    `Total financiado: RD$ ${plan.total_financiado.toFixed(2)}\nRiesgo: ${plan.recomendacion}\n\n¿Deseas continuar?`
  )
  if (!confirmado) return { cancelado: true }
  const result = await crearFinanciamiento(args)
  notifyDataChange('financiamientos', 'crear', result.id)
  return { creado: true, ...result }
}

async function consultarResumen(args: any) {
  if (args.tipo === 'clientes') {
    const result = await window.db.getAll('clientes')
    return { tipo: 'clientes', total: filterWarehouse(result.data || []).length }
  }
  if (args.tipo === 'inventario') {
    const [imeiRes, accRes, serialRes] = await Promise.all([
      window.db.getAll('imei'),
      window.db.getAll('accesorios'),
      window.db.getAll('serial'),
    ])
    const imeis = filterWarehouse(imeiRes.data || [])
    const accesorios = filterWarehouse(accRes.data || [])
    const seriales = filterWarehouse(serialRes.data || [])
    return {
      tipo: 'inventario',
      imeis_disponibles: imeis.filter((row: any) => normalize(row.estado || 'DISPONIBLE') === 'disponible').length,
      seriales_disponibles: seriales.filter((row: any) => normalize(row.estado || 'DISPONIBLE') === 'disponible').length,
      unidades_accesorios: accesorios.reduce((sum: number, row: any) => sum + Number(row.cantidad || 0), 0),
    }
  }
  const result = await window.db.getAll('facturas')
  const today = new Date().toISOString().slice(0, 10)
  const facturas = filterWarehouse(result.data || []).filter((row: any) =>
    String(row.fecha_emision || row.created_at || '').slice(0, 10) === today &&
    normalize(row.estado_factura) !== 'cotizacion'
  )
  return {
    tipo: 'ventas_hoy',
    facturas: facturas.length,
    total: facturas.reduce((sum: number, row: any) => sum + Number(row.total || 0), 0),
  }
}

async function executeTool(name: string, args: any) {
  switch (name) {
    case 'buscar_imei': return buscarImei(args)
    case 'buscar_clientes': return buscarClientes(args)
    case 'crear_cliente': return crearCliente(args)
    case 'preparar_factura': return prepararFactura(args)
    case 'abrir_modulo': return abrirModulo(args)
    case 'consultar_resumen': return consultarResumen(args)
    case 'consultar_datos': return consultarDatos(args)
    case 'gestionar_registro': return gestionarRegistro(args)
    case 'analizar_negocio': return analizarNegocio(args)
    case 'crear_financiamiento': return crearFinanciamientoJarvis(args)
    default: throw new Error(`Herramienta no permitida: ${name}`)
  }
}

function extractText(response: any): string {
  if (response?.output_text) return String(response.output_text)
  return (response?.output || [])
    .filter((item: any) => item.type === 'message')
    .flatMap((item: any) => item.content || [])
    .filter((item: any) => item.type === 'output_text')
    .map((item: any) => item.text)
    .join('\n')
    .trim()
}

export async function isAssistantConfigured(): Promise<boolean> {
  const enabled = await getConfig('openai_enabled')
  const hasKey = await getConfig('openai_api_key_configured')
  return enabled === '1' && hasKey === '1'
}

export async function sendAssistantMessage(messages: AssistantMessage[]): Promise<string> {
  const configured = await isAssistantConfigured()
  if (!configured) throw new Error('Configura primero la API key de OpenAI en Configuración > OpenAI / Jarvis')
  const model = await getConfig('openai_model') || DEFAULT_MODEL
  const input: any[] = messages.slice(-16).map(message => ({
    role: message.role,
    content: message.content,
  }))

  for (let turn = 0; turn < 6; turn++) {
    const request: Record<string, unknown> = {
      model,
      instructions,
      input,
      tools,
      tool_choice: 'auto',
      parallel_tool_calls: false,
      max_output_tokens: 900,
    }
    if (model.startsWith('gpt-5')) request.text = { verbosity: 'low' }
    const response = await requestOpenAI(request)
    const calls = (response.output || []).filter((item: any) => item.type === 'function_call')
    if (!calls.length) return extractText(response) || 'No pude generar una respuesta.'

    input.push(...response.output)
    for (const call of calls) {
      let output: any
      try {
        output = await executeTool(call.name, JSON.parse(call.arguments || '{}'))
      } catch (error: any) {
        output = { success: false, error: error?.message || 'Error ejecutando la acción' }
      }
      input.push({
        type: 'function_call_output',
        call_id: call.call_id,
        output: JSON.stringify(output),
      })
    }
  }
  throw new Error('La solicitud necesitó demasiados pasos. Intenta dividirla en una instrucción más corta.')
}
