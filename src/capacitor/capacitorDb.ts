import initSqlJs, { Database as SqlJsDatabase } from 'sql.js'
import { Filesystem, Directory } from '@capacitor/filesystem'
import { uuidv4 } from './util'
import { WASM_BASE64 } from './wasm'

const DB_FILE = 'mr_cutti_database.db'
const GLOBAL_TABLES = new Set(['usuarios', 'bancos', 'banco_transacciones'])

let db: SqlJsDatabase | null = null
let isReady = false

function decodeBase64Wasm(): Uint8Array {
  const binaryStr = atob(WASM_BASE64)
  const bytes = new Uint8Array(binaryStr.length)
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i)
  }
  return bytes
}

async function saveDb() {
  if (!db) return
  try {
    const data = db.export()
    const base64 = btoa(String.fromCharCode(...new Uint8Array(data)))
    await Filesystem.writeFile({
      path: DB_FILE,
      data: base64,
      directory: Directory.Data,
      recursive: true,
    })
  } catch (e) {
    console.error('[capacitorDb] Error saving DB:', e)
  }
}

async function loadDb(): Promise<Uint8Array | null> {
  try {
    const result = await Filesystem.readFile({
      path: DB_FILE,
      directory: Directory.Data,
    })
    const data = result.data as string
    const binaryStr = atob(data)
    const bytes = new Uint8Array(binaryStr.length)
    for (let i = 0; i < binaryStr.length; i++) {
      bytes[i] = binaryStr.charCodeAt(i)
    }
    return bytes
  } catch {
    return null
  }
}

function generarUid(): string {
  return uuidv4()
}

function nowISO(): string {
  return new Date().toISOString()
}

export async function initDatabase(): Promise<void> {
  if (isReady) return

  const wasmBuffer = decodeBase64Wasm()
  const SQL = await initSqlJs({ wasmBinary: wasmBuffer.buffer as ArrayBuffer })
  const existingData = await loadDb()

  if (existingData) {
    db = new SQL.Database(existingData)
    createTables()
    migrateTables()
    auditSchema()
    await saveDb()
  } else {
    db = new SQL.Database()
    createTables()
    migrateTables()
    auditSchema()
    insertDefaultData()
    await saveDb()
  }

  isReady = true
}

function createTables() {
  if (!db) return

  db.run(`CREATE TABLE IF NOT EXISTS usuarios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    usuario TEXT DEFAULT '',
    email TEXT DEFAULT '',
    password TEXT DEFAULT '',
    pin TEXT DEFAULT '',
    patron TEXT DEFAULT '',
    pregunta_secreta TEXT DEFAULT '',
    respuesta TEXT DEFAULT '',
    fecha TEXT DEFAULT '',
    nivel_seguridad TEXT DEFAULT 'Usuario',
    intentos_login TEXT DEFAULT '',
    estado TEXT DEFAULT 'ACTIVADO',
    permisos TEXT DEFAULT '',
    restrinciones TEXT DEFAULT '',
    porciento TEXT DEFAULT '',
    imagen TEXT DEFAULT '',
    rol TEXT DEFAULT 'vendedor',
    ultimo_acceso TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS empresa (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT DEFAULT '',
    legal TEXT DEFAULT '',
    encargado TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    redes TEXT DEFAULT '',
    estado TEXT DEFAULT '',
    logo TEXT DEFAULT '',
    impuesto REAL DEFAULT 18,
    impuesto_incluido INTEGER DEFAULT 0,
    moneda TEXT DEFAULT 'RD$',
    tipo_documento_defecto TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS clientes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    cedula TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    whatsapp TEXT DEFAULT '',
    email TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    apodo TEXT DEFAULT '',
    precio_fijado TEXT DEFAULT '',
    limite_credito TEXT DEFAULT '',
    empresa TEXT DEFAULT '',
    cargo TEXT DEFAULT '',
    telefono_empresa TEXT DEFAULT '',
    direccion_empresa TEXT DEFAULT '',
    codigo TEXT DEFAULT '',
    rnc TEXT DEFAULT '',
    activo TEXT DEFAULT 'ACTIVO',
    nota TEXT DEFAULT '',
    imagen TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS proveedores (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    rnc TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    encargado TEXT DEFAULT '',
    cuenta_bancaria TEXT DEFAULT '',
    direccion TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS categorias (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    estado TEXT DEFAULT 'activo',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS marcas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    estado TEXT DEFAULT 'activo',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS accesorios (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    codigo_barra TEXT DEFAULT '',
    costo REAL DEFAULT 0,
    precio_venta REAL DEFAULT 0,
    precio_min REAL DEFAULT 0,
    precio_xmayor REAL DEFAULT 0,
    cantidad INTEGER DEFAULT 1,
    alerta INTEGER DEFAULT 10,
    marca INTEGER,
    categoria INTEGER,
    proveedor_id INTEGER DEFAULT 0,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS catalogo_cuentas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    codigo TEXT NOT NULL UNIQUE,
    nombre TEXT NOT NULL,
    tipo TEXT NOT NULL,
    subtipo TEXT DEFAULT '',
    naturaleza TEXT DEFAULT 'DEUDORA',
    saldo_inicial REAL DEFAULT 0,
    estado TEXT DEFAULT 'ACTIVA',
    descripcion TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run(`INSERT OR IGNORE INTO catalogo_cuentas (codigo,nombre,tipo,subtipo,naturaleza) VALUES
    ('1101','Caja General','ACTIVO','CORRIENTE','DEUDORA'),('1102','Bancos','ACTIVO','CORRIENTE','DEUDORA'),('1103','Cuentas por Cobrar','ACTIVO','CORRIENTE','DEUDORA'),('1201','Inventario','ACTIVO','CORRIENTE','DEUDORA'),
    ('2101','Cuentas por Pagar','PASIVO','CORRIENTE','ACREEDORA'),('3101','Capital','PATRIMONIO','CAPITAL','ACREEDORA'),
    ('4101','Ventas','INGRESOS','OPERACIONALES','ACREEDORA'),('5101','Costo de Ventas','GASTOS','OPERACIONALES','DEUDORA'),('5201','Gastos Operativos','GASTOS','OPERACIONALES','DEUDORA')`)

  db.run(`CREATE TABLE IF NOT EXISTS perdidas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    referencia_id INTEGER NOT NULL,
    nombre TEXT DEFAULT '',
    codigo TEXT DEFAULT '',
    cantidad INTEGER DEFAULT 1,
    costo REAL DEFAULT 0,
    motivo TEXT DEFAULT '',
    fecha TEXT DEFAULT '',
    almacen_id INTEGER DEFAULT 0,
    estado TEXT DEFAULT 'ACTIVA',
    detalle TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS telefonos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS imei (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    id_equi INTEGER,
    telefono_uid TEXT DEFAULT '',
    equipo TEXT DEFAULT '',
    costo REAL DEFAULT 0,
    precio_venta REAL DEFAULT 0,
    precio_min REAL DEFAULT 0,
    precio_xmayor REAL DEFAULT 0,
    color TEXT DEFAULT '',
    capacidad TEXT DEFAULT '',
    bateria TEXT DEFAULT '',
    estado TEXT DEFAULT 'DISPONIBLE',
    fecha_venta TEXT,
    comprador TEXT DEFAULT '',
    proveedor TEXT DEFAULT '',
    no_compra TEXT DEFAULT '',
    precio_vendido REAL DEFAULT 0,
    hora_venta TEXT DEFAULT '',
    no_factura TEXT DEFAULT '',
    nota TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS electrodomesticos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS serial (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    id_equi INTEGER,
    equipo_uid TEXT DEFAULT '',
    equipo TEXT DEFAULT '',
    costo REAL DEFAULT 0,
    precio_venta REAL DEFAULT 0,
    precio_min REAL DEFAULT 0,
    precio_xmayor REAL DEFAULT 0,
    color TEXT DEFAULT '',
    capacidad TEXT DEFAULT '',
    bateria TEXT DEFAULT '',
    estado TEXT DEFAULT 'DISPONIBLE',
    fecha_venta TEXT,
    comprador TEXT DEFAULT '',
    proveedor TEXT DEFAULT '',
    no_compra TEXT DEFAULT '',
    precio_vendido REAL DEFAULT 0,
    hora_venta TEXT DEFAULT '',
    no_factura TEXT DEFAULT '',
    nota TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS facturas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cheque TEXT DEFAULT '',
    token TEXT DEFAULT '',
    cajero TEXT DEFAULT '',
    no_factura TEXT DEFAULT '',
    tipo_factura TEXT DEFAULT '',
    comprobante TEXT DEFAULT '',
    cod_cliente TEXT DEFAULT '',
    nombre_cliente TEXT DEFAULT '',
    telefono_cliente TEXT DEFAULT '',
    productos TEXT DEFAULT '',
    vendedor TEXT DEFAULT '',
    metodo_pago TEXT DEFAULT 'EFECTIVO',
    tarjeta REAL DEFAULT 0,
    porcentaje_tarjeta REAL DEFAULT 0,
    monto_porcentaje_tarjeta REAL DEFAULT 0,
    transferencia REAL DEFAULT 0,
    efectivo REAL DEFAULT 0,
    canal_venta TEXT DEFAULT '',
    fecha_emision TEXT DEFAULT '',
    impuesto REAL DEFAULT 0,
    descuento REAL DEFAULT 0,
    subtotal REAL DEFAULT 0,
    costo REAL DEFAULT 0,
    total REAL DEFAULT 0,
    ganancia REAL DEFAULT 0,
    financiera TEXT DEFAULT '',
    estado_factura TEXT DEFAULT 'PENDIENTE',
    fecha_estado TEXT DEFAULT '',
    mes TEXT DEFAULT '',
    year TEXT DEFAULT '',
    hora TEXT DEFAULT '',
    otro TEXT DEFAULT '',
    nota TEXT DEFAULT '',
    usuario TEXT DEFAULT '',
    identificadordb TEXT DEFAULT '',
    total_institucion REAL DEFAULT 0,
    total_cliente REAL DEFAULT 0,
    ncf TEXT DEFAULT '',
    tipo_comprobante TEXT DEFAULT '',
    comprobante_id INTEGER DEFAULT 0,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS piezas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    costo REAL DEFAULT 0,
    precio_venta REAL DEFAULT 0,
    cantidad INTEGER DEFAULT 0,
    alerta INTEGER DEFAULT 1,
    proveedor TEXT DEFAULT '',
    descripcion TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS tecnicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    porcentaje REAL DEFAULT 0,
    estado TEXT DEFAULT 'ACTIVO',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS ordenes_taller (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no_orden TEXT DEFAULT '',
    nombre TEXT NOT NULL,
    cedula TEXT DEFAULT '',
    telefono TEXT DEFAULT '',
    email TEXT DEFAULT '',
    equipo TEXT DEFAULT '',
    imei TEXT DEFAULT '',
    serial TEXT DEFAULT '',
    marca_modelo TEXT DEFAULT '',
    clave TEXT DEFAULT '',
    accesorios TEXT DEFAULT '',
    fallas TEXT DEFAULT '',
    piezas TEXT DEFAULT '',
    tecnico TEXT DEFAULT '',
    metodo_pago TEXT DEFAULT 'EFECTIVO',
    fecha_entrada TEXT,
    fecha_entrega TEXT,
    estado TEXT DEFAULT 'RECIBIDO',
    precio_pieza REAL DEFAULT 0,
    mano_obra REAL DEFAULT 0,
    abono REAL DEFAULT 0,
    pendiente REAL DEFAULT 0,
    total REAL DEFAULT 0,
    pagos TEXT DEFAULT '',
    beneficio_empresa REAL DEFAULT 0,
    beneficio_tecnico REAL DEFAULT 0,
    porcentaje_tecnico REAL DEFAULT 0,
    estado_pago_tecnico TEXT DEFAULT 'PENDIENTE',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS correo (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    host TEXT DEFAULT 'smtp.gmail.com',
    puerto TEXT DEFAULT '587',
    seguridad TEXT DEFAULT 'STARTTLS',
    email TEXT DEFAULT '',
    password TEXT DEFAULT '',
    nombre_remitente TEXT DEFAULT '',
    activo INTEGER DEFAULT 0,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS gastos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    cantidad REAL DEFAULT 0,
    fecha TEXT DEFAULT '',
    hora TEXT DEFAULT '',
    comentario TEXT DEFAULT '',
    metodo_pago TEXT DEFAULT 'EFECTIVO',
    efectivo REAL DEFAULT 0,
    transferencia REAL DEFAULT 0,
    banco_id INTEGER DEFAULT 0,
    banco_uid TEXT DEFAULT '',
    banco_nombre TEXT DEFAULT '',
    turno_id INTEGER DEFAULT 0,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS bancos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    numero_cuenta TEXT DEFAULT '',
    moneda TEXT DEFAULT 'PESOS',
    saldo REAL DEFAULT 0,
    fecha_transaccion TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS banco_transacciones (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT DEFAULT '',
    banco_id INTEGER DEFAULT 0,
    banco_uid TEXT DEFAULT '',
    banco_nombre TEXT DEFAULT '',
    tipo TEXT DEFAULT 'AJUSTE',
    monto REAL DEFAULT 0,
    saldo_anterior REAL DEFAULT 0,
    saldo_nuevo REAL DEFAULT 0,
    concepto TEXT DEFAULT '',
    referencia_tipo TEXT DEFAULT '',
    referencia_id INTEGER DEFAULT 0,
    referencia TEXT DEFAULT '',
    usuario TEXT DEFAULT '',
    created_at TEXT DEFAULT '',
    updated_at TEXT DEFAULT ''
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS ventas_pausadas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT DEFAULT '',
    codigo TEXT NOT NULL DEFAULT '',
    datos TEXT NOT NULL DEFAULT '{}',
    cliente_nombre TEXT DEFAULT '',
    total REAL DEFAULT 0,
    items_count INTEGER DEFAULT 0,
    usuario TEXT DEFAULT '',
    estado TEXT DEFAULT 'PAUSADA',
    almacen_id INTEGER DEFAULT 0,
    almacen_uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS apariencia_almacen (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    uid TEXT DEFAULT '',
    color_primario TEXT DEFAULT 'blue',
    tono_primario TEXT DEFAULT '500',
    fondo_barra TEXT DEFAULT 'white',
    tono_barra TEXT DEFAULT '500',
    color_texto_barra TEXT DEFAULT 'auto',
    almacen_id INTEGER DEFAULT 0,
    almacen_uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  try { db.run(`ALTER TABLE apariencia_almacen ADD COLUMN color_texto_barra TEXT DEFAULT 'auto'`) } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS gastos_fijos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    monto REAL DEFAULT 0,
    dia_pago INTEGER DEFAULT 1,
    categoria TEXT DEFAULT '',
    periodicidad TEXT DEFAULT 'MENSUAL',
    estado TEXT DEFAULT 'ACTIVO',
    descripcion TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS impresoras_config (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    printer_name TEXT DEFAULT '',
    printer_model TEXT DEFAULT '',
    paper_width INTEGER DEFAULT 80,
    show_logo INTEGER DEFAULT 1,
    show_company_name INTEGER DEFAULT 1,
    show_legal INTEGER DEFAULT 1,
    show_phone INTEGER DEFAULT 1,
    show_address INTEGER DEFAULT 1,
    show_email INTEGER DEFAULT 1,
    show_cliente INTEGER DEFAULT 1,
    show_items INTEGER DEFAULT 1,
    show_totals INTEGER DEFAULT 1,
    show_barcode INTEGER DEFAULT 1,
    show_footer INTEGER DEFAULT 1,
    show_qr INTEGER DEFAULT 0,
    show_nota INTEGER DEFAULT 1,
    footer_text TEXT DEFAULT 'Gracias por su compra',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS cuentas_cobrar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no_factura TEXT DEFAULT '',
    cod_cliente TEXT DEFAULT '',
    nombre_cliente TEXT DEFAULT '',
    telefono_cliente TEXT DEFAULT '',
    total REAL DEFAULT 0,
    abonado REAL DEFAULT 0,
    saldo REAL DEFAULT 0,
    fecha_venta TEXT DEFAULT '',
    fecha_vencimiento TEXT DEFAULT '',
    estado TEXT DEFAULT 'ACTIVA',
    notas TEXT DEFAULT '',
    pagos TEXT DEFAULT '[]',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS cuentas_pagar (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    no_factura TEXT DEFAULT '',
    cod_proveedor TEXT DEFAULT '',
    nombre_proveedor TEXT DEFAULT '',
    telefono_proveedor TEXT DEFAULT '',
    total REAL DEFAULT 0,
    abonado REAL DEFAULT 0,
    saldo REAL DEFAULT 0,
    fecha_compra TEXT DEFAULT '',
    fecha_vencimiento TEXT DEFAULT '',
    estado TEXT DEFAULT 'ACTIVA',
    notas TEXT DEFAULT '',
    pagos TEXT DEFAULT '[]',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS bitacora (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabla TEXT DEFAULT '',
    registro_id INTEGER DEFAULT 0,
    accion TEXT DEFAULT '',
    usuario TEXT DEFAULT '',
    datos_nuevos TEXT DEFAULT '',
    datos_anteriores TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS configuracion (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    clave TEXT UNIQUE NOT NULL,
    valor TEXT DEFAULT '',
    tipo TEXT DEFAULT 'string',
    categoria TEXT DEFAULT 'general',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS plantillas_etiquetas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    nombre TEXT NOT NULL,
    ancho REAL DEFAULT 50,
    alto REAL DEFAULT 30,
    elementos TEXT DEFAULT '[]',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS licencia (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    licencia_equipo TEXT,
    licencia_cifrada TEXT,
    estado TEXT DEFAULT 'sin_verificar',
    nombre_empresa TEXT,
    fecha_inicio_prueba TEXT,
    fecha_vencimiento TEXT,
    ultima_verificacion TEXT,
    api_key TEXT,
    datos_servidor TEXT,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS sync_deletes (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tabla TEXT NOT NULL,
    uid TEXT NOT NULL,
    confirmado INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  try { db.run(`ALTER TABLE sync_deletes ADD COLUMN confirmado INTEGER DEFAULT 0`) } catch {}

  db.run(`CREATE TABLE IF NOT EXISTS comprobantes_fiscales (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    tipo TEXT NOT NULL,
    nombre TEXT NOT NULL,
    descripcion TEXT DEFAULT '',
    prefijo TEXT DEFAULT '',
    secuencia_actual INTEGER DEFAULT 1,
    secuencia_desde INTEGER DEFAULT 1,
    secuencia_hasta INTEGER DEFAULT 99999999,
    fecha_vencimiento TEXT DEFAULT '',
    activo INTEGER DEFAULT 1,
    es_default INTEGER DEFAULT 0,
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS notas (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    titulo TEXT NOT NULL,
    contenido TEXT DEFAULT '',
    uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS reservas_piezas (
    id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL, pieza_id INTEGER NOT NULL,
    pieza_nombre TEXT DEFAULT '', cantidad REAL DEFAULT 1, estado TEXT DEFAULT 'RESERVADA',
    usuario TEXT DEFAULT '', liberada_at TEXT DEFAULT '', consumida_at TEXT DEFAULT '',
    uid TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS comisiones_tecnicos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, orden_id INTEGER NOT NULL, tecnico_id INTEGER DEFAULT 0,
    tecnico_nombre TEXT DEFAULT '', tipo TEXT DEFAULT 'PORCENTAJE_MANO_OBRA',
    base REAL DEFAULT 0, valor REAL DEFAULT 0, monto REAL DEFAULT 0,
    estado TEXT DEFAULT 'PENDIENTE', fecha_pago TEXT DEFAULT '', uid TEXT DEFAULT '',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)

  db.run(`CREATE TABLE IF NOT EXISTS financiamientos (
    id INTEGER PRIMARY KEY AUTOINCREMENT, cliente_id INTEGER DEFAULT 0, cliente_nombre TEXT DEFAULT '',
    cliente_telefono TEXT DEFAULT '', factura_id INTEGER DEFAULT 0, no_factura TEXT DEFAULT '',
    frecuencia TEXT DEFAULT 'MENSUAL', cantidad_cuotas INTEGER DEFAULT 1, monto_original REAL DEFAULT 0,
    inicial REAL DEFAULT 0, tasa_interes REAL DEFAULT 0, total_financiado REAL DEFAULT 0,
    mora_porcentaje REAL DEFAULT 0, ingreso_mensual REAL DEFAULT 0, gastos_mensuales REAL DEFAULT 0,
    capacidad_pago REAL DEFAULT 0, garante_nombre TEXT DEFAULT '', garante_cedula TEXT DEFAULT '',
    garante_telefono TEXT DEFAULT '', documentos TEXT DEFAULT '[]', estado TEXT DEFAULT 'ACTIVO',
    proximo_vencimiento TEXT DEFAULT '', uid TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS cuotas_financiamiento (
    id INTEGER PRIMARY KEY AUTOINCREMENT, financiamiento_id INTEGER NOT NULL, numero INTEGER NOT NULL,
    fecha_vencimiento TEXT DEFAULT '', capital REAL DEFAULT 0, interes REAL DEFAULT 0, mora REAL DEFAULT 0,
    total REAL DEFAULT 0, pagado REAL DEFAULT 0, saldo REAL DEFAULT 0, estado TEXT DEFAULT 'PENDIENTE',
    pagos TEXT DEFAULT '[]', uid TEXT DEFAULT '', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  )`)
  db.run(`CREATE TABLE IF NOT EXISTS promociones (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,tipo TEXT DEFAULT 'DESCUENTO',valor REAL DEFAULT 0,cantidad_compra INTEGER DEFAULT 1,cantidad_gratis INTEGER DEFAULT 0,cantidad_minima REAL DEFAULT 1,productos TEXT DEFAULT '[]',fecha_inicio TEXT DEFAULT '',fecha_fin TEXT DEFAULT '',lista_precio TEXT DEFAULT '',prioridad INTEGER DEFAULT 0,combinable INTEGER DEFAULT 0,estado TEXT DEFAULT 'ACTIVA',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS listas_precios (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,tipo TEXT DEFAULT 'MINORISTA',descuento_porcentaje REAL DEFAULT 0,cantidad_minima REAL DEFAULT 1,estado TEXT DEFAULT 'ACTIVA',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS variantes_productos (id INTEGER PRIMARY KEY AUTOINCREMENT,producto_id INTEGER NOT NULL,sku TEXT DEFAULT '',codigo_barra TEXT DEFAULT '',talla TEXT DEFAULT '',color TEXT DEFAULT '',capacidad TEXT DEFAULT '',sabor TEXT DEFAULT '',presentacion TEXT DEFAULT '',costo REAL DEFAULT 0,precio REAL DEFAULT 0,precio_mayor REAL DEFAULT 0,cantidad REAL DEFAULT 0,alerta REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVA',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS niveles_fidelidad (id INTEGER PRIMARY KEY AUTOINCREMENT,nombre TEXT NOT NULL,puntos_desde REAL DEFAULT 0,multiplicador REAL DEFAULT 1,descuento REAL DEFAULT 0,estado TEXT DEFAULT 'ACTIVO',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS movimientos_puntos (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER NOT NULL,tipo TEXT DEFAULT 'GANADO',puntos REAL DEFAULT 0,saldo_anterior REAL DEFAULT 0,saldo_nuevo REAL DEFAULT 0,referencia TEXT DEFAULT '',vence_at TEXT DEFAULT '',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS tarjetas_regalo (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT NOT NULL UNIQUE,pin TEXT DEFAULT '',saldo_inicial REAL DEFAULT 0,saldo REAL DEFAULT 0,cliente_id INTEGER DEFAULT 0,fecha_vencimiento TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVA',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS portal_clientes (id INTEGER PRIMARY KEY AUTOINCREMENT,cliente_id INTEGER DEFAULT 0,token TEXT NOT NULL UNIQUE,email TEXT DEFAULT '',telefono TEXT DEFAULT '',permisos TEXT DEFAULT '[]',vence_at TEXT DEFAULT '',ultimo_acceso TEXT DEFAULT '',estado TEXT DEFAULT 'ACTIVO',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
  db.run(`CREATE TABLE IF NOT EXISTS pedidos_online (id INTEGER PRIMARY KEY AUTOINCREMENT,codigo TEXT DEFAULT '',cliente_id INTEGER DEFAULT 0,cliente_nombre TEXT DEFAULT '',cliente_telefono TEXT DEFAULT '',productos TEXT DEFAULT '[]',subtotal REAL DEFAULT 0,descuento REAL DEFAULT 0,envio REAL DEFAULT 0,total REAL DEFAULT 0,tipo_entrega TEXT DEFAULT 'RECOGIDA',direccion TEXT DEFAULT '',estado TEXT DEFAULT 'NUEVO',pago_estado TEXT DEFAULT 'PENDIENTE',uid TEXT DEFAULT '',created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP)`)
}

function migrateTables() {
  if (!db) return
  const gastosInfo = db.exec('PRAGMA table_info("gastos")')
  const gastosColumns = new Set(
    (gastosInfo[0]?.values || []).map((row: any[]) => String(row[1]))
  )
  if (!gastosColumns.has('turno_id')) {
    db.run('ALTER TABLE gastos ADD COLUMN turno_id INTEGER DEFAULT 0')
  }
  const empresaInfo = db.exec('PRAGMA table_info("empresa")')
  const empresaColumns = new Set(
    (empresaInfo[0]?.values || []).map((row: any[]) => String(row[1]))
  )
  if (!empresaColumns.has('encargado')) {
    db.run(`ALTER TABLE empresa ADD COLUMN encargado TEXT DEFAULT ''`)
  }
  if (!empresaColumns.has('redes')) {
    db.run(`ALTER TABLE empresa ADD COLUMN redes TEXT DEFAULT ''`)
  }
  if (!empresaColumns.has('estado')) {
    db.run(`ALTER TABLE empresa ADD COLUMN estado TEXT DEFAULT ''`)
  }
  const facturasInfo = db.exec('PRAGMA table_info("facturas")')
  const facturasColumns = new Set(
    (facturasInfo[0]?.values || []).map((row: any[]) => String(row[1]))
  )
  if (!facturasColumns.has('costo')) {
    db.run('ALTER TABLE facturas ADD COLUMN costo REAL DEFAULT 0')
  }
  if (!facturasColumns.has('ganancia')) {
    db.run('ALTER TABLE facturas ADD COLUMN ganancia REAL DEFAULT 0')
  }
  if (!facturasColumns.has('porcentaje_tarjeta')) {
    db.run('ALTER TABLE facturas ADD COLUMN porcentaje_tarjeta REAL DEFAULT 0')
  }
  if (!facturasColumns.has('monto_porcentaje_tarjeta')) {
    db.run('ALTER TABLE facturas ADD COLUMN monto_porcentaje_tarjeta REAL DEFAULT 0')
  }
  const imeiInfo = db.exec('PRAGMA table_info("imei")')
  const imeiColumns = new Set(
    (imeiInfo[0]?.values || []).map((row: any[]) => String(row[1]))
  )
  if (!imeiColumns.has('telefono_uid')) {
    db.run("ALTER TABLE imei ADD COLUMN telefono_uid TEXT DEFAULT ''")
    db.run(`UPDATE imei SET telefono_uid = (SELECT uid FROM telefonos WHERE telefonos.id = imei.id_equi) WHERE id_equi IS NOT NULL`)
  }
  if (!imeiColumns.has('equipo')) {
    db.run("ALTER TABLE imei ADD COLUMN equipo TEXT DEFAULT ''")
    db.run(`UPDATE imei SET equipo = (SELECT nombre FROM telefonos WHERE telefonos.id = imei.id_equi) WHERE id_equi IS NOT NULL`)
  }
}

// Misma auditoria de esquema para instalaciones moviles/Capacitor.
function auditSchema() {
  if (!db) return
  const expected: Record<string, Record<string, string>> = {
    empresa: { encargado: "TEXT DEFAULT ''", logo: "TEXT DEFAULT ''", impuesto: 'REAL DEFAULT 18', impuesto_incluido: 'INTEGER DEFAULT 0', moneda: "TEXT DEFAULT 'RD$'", almacen_id: 'INTEGER DEFAULT 0' },
    telefonos: { imagen: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    imei: { telefono_uid: "TEXT DEFAULT ''", equipo: "TEXT DEFAULT ''", costo: 'REAL DEFAULT 0', precio_venta: 'REAL DEFAULT 0', precio_min: 'REAL DEFAULT 0', precio_xmayor: 'REAL DEFAULT 0', estado: "TEXT DEFAULT 'DISPONIBLE'", almacen_id: 'INTEGER DEFAULT 0' },
    accesorios: { imagen: "TEXT DEFAULT ''", no_compra: "TEXT DEFAULT ''", proveedor_id: 'INTEGER DEFAULT 0', almacen_id: 'INTEGER DEFAULT 0' },
    facturas: { costo: 'REAL DEFAULT 0', ganancia: 'REAL DEFAULT 0', financiera: "TEXT DEFAULT ''", turno_id: 'INTEGER DEFAULT 0', almacen_id: 'INTEGER DEFAULT 0' },
    clientes: { imagen: "TEXT DEFAULT ''", rnc: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    ordenes_taller: { imagen: "TEXT DEFAULT ''", pagos: "TEXT DEFAULT '[]'", tipo_comision_tecnico: "TEXT DEFAULT 'PORCENTAJE_MANO_OBRA'", valor_comision_tecnico: 'REAL DEFAULT 0', estado_pago_tecnico: "TEXT DEFAULT 'PENDIENTE'", fecha_pago_tecnico: "TEXT DEFAULT ''", almacen_id: 'INTEGER DEFAULT 0' },
    piezas: { reservada: 'INTEGER DEFAULT 0' },
    tecnicos: { tipo_comision: "TEXT DEFAULT 'PORCENTAJE_MANO_OBRA'", valor_comision: 'REAL DEFAULT 0' },
    gastos: { metodo_pago: "TEXT DEFAULT 'EFECTIVO'", efectivo: 'REAL DEFAULT 0', transferencia: 'REAL DEFAULT 0', banco_id: 'INTEGER DEFAULT 0', banco_uid: "TEXT DEFAULT ''", banco_nombre: "TEXT DEFAULT ''" },
    caja_turnos: { monto_final: 'REAL DEFAULT 0', efectivo_esperado: 'REAL DEFAULT 0', diferencia: 'REAL DEFAULT 0', cierre_ciego: 'INTEGER DEFAULT 0' },
    cuadres: { efectivo_esperado: 'REAL DEFAULT 0', efectivo_contado: 'REAL DEFAULT 0', diferencia: 'REAL DEFAULT 0', cierre_ciego: 'INTEGER DEFAULT 0', abonos_cxc: 'REAL DEFAULT 0', cantidad_abonos_cxc: 'INTEGER DEFAULT 0' },
    serial: { equipo_uid: "TEXT DEFAULT ''", equipo: "TEXT DEFAULT ''" },
    transferencias: { origen_uid: "TEXT DEFAULT ''", destino_uid: "TEXT DEFAULT ''", almacen_uid: "TEXT DEFAULT ''" },
  }
  db.run(`CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, aplicado_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, detalle TEXT DEFAULT '')`)
  for (const [table, columns] of Object.entries(expected)) {
    const info = db.exec(`PRAGMA table_info(${escapeId(table)})`)
    if (!info.length) continue
    const existing = new Set((info[0]?.values || []).map((row: any[]) => String(row[1])))
    for (const [column, definition] of Object.entries(columns)) {
      if (!existing.has(column)) db.run(`ALTER TABLE ${escapeId(table)} ADD COLUMN ${escapeId(column)} ${definition}`)
    }
  }
  const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")
  for (const row of tables[0]?.values || []) {
    const table = String(row[0])
    if (table === 'schema_migrations') continue
    const info = db.exec(`PRAGMA table_info(${escapeId(table)})`)
    const existing = new Set((info[0]?.values || []).map((column: any[]) => String(column[1])))
    if (!GLOBAL_TABLES.has(table)) {
      if (!existing.has('almacen_id')) db.run(`ALTER TABLE ${escapeId(table)} ADD COLUMN almacen_id INTEGER DEFAULT 0`)
      if (!existing.has('almacen_uid')) db.run(`ALTER TABLE ${escapeId(table)} ADD COLUMN almacen_uid TEXT DEFAULT ''`)
    }
    if (!existing.has('uid')) db.run(`ALTER TABLE ${escapeId(table)} ADD COLUMN uid TEXT DEFAULT ''`)
    if (!existing.has('created_at')) db.run(`ALTER TABLE ${escapeId(table)} ADD COLUMN created_at TEXT DEFAULT ''`)
    if (!existing.has('updated_at')) db.run(`ALTER TABLE ${escapeId(table)} ADD COLUMN updated_at TEXT DEFAULT ''`)
    const missingUids = db.exec(`SELECT id FROM ${escapeId(table)} WHERE uid IS NULL OR uid = ''`)
    for (const missingRow of missingUids[0]?.values || []) {
      db.run(`UPDATE ${escapeId(table)} SET uid = ? WHERE id = ?`, [generarUid(), missingRow[0]])
    }
  }
  const bancosInfo = db.exec(`PRAGMA table_info(bancos)`)
  const bancosColumns = new Set((bancosInfo[0]?.values || []).map((column: any[]) => String(column[1])))
  const bancoUpdatedAt = bancosColumns.has('updated_at') ? `, updated_at = datetime('now')` : ''
  if (bancosColumns.has('almacen_id')) db.run(`UPDATE bancos SET almacen_id = 0${bancoUpdatedAt} WHERE almacen_id IS NOT NULL AND almacen_id <> 0`)
  if (bancosColumns.has('almacen_uid')) db.run(`UPDATE bancos SET almacen_uid = ''${bancoUpdatedAt} WHERE almacen_uid IS NOT NULL AND almacen_uid <> ''`)
  const empresasResult = db.exec(`SELECT id, almacen_id, uid FROM empresa WHERE uid IS NOT NULL AND uid <> '' ORDER BY id`)
  const empresas = (empresasResult[0]?.values || []).map((row: any[]) => ({ id: Number(row[0]), almacen_id: Number(row[1]), uid: String(row[2]) }))
  const uidPrincipal = empresas[0]?.uid || ''
  for (const row of tables[0]?.values || []) {
    const table = String(row[0])
    if (table === 'schema_migrations' || GLOBAL_TABLES.has(table)) continue
    if (table === 'empresa') {
      db.run(`UPDATE empresa SET almacen_uid = uid WHERE almacen_uid IS NULL OR almacen_uid = ''`)
      continue
    }
    for (const empresa of empresas) {
      db.run(`UPDATE ${escapeId(table)} SET almacen_uid = ? WHERE (almacen_uid IS NULL OR almacen_uid = '') AND almacen_id = ?`, [empresa.uid, empresa.almacen_id || empresa.id])
    }
    if (uidPrincipal) db.run(`UPDATE ${escapeId(table)} SET almacen_uid = ? WHERE (almacen_uid IS NULL OR almacen_uid = '') AND (almacen_id IS NULL OR almacen_id = 0)`, [uidPrincipal])
  }
  db.run(`UPDATE serial SET equipo_uid = (SELECT uid FROM electrodomesticos WHERE electrodomesticos.id = serial.id_equi) WHERE (equipo_uid IS NULL OR equipo_uid = '') AND id_equi IS NOT NULL`)
  db.run(`UPDATE serial SET equipo = (SELECT nombre FROM electrodomesticos WHERE electrodomesticos.id = serial.id_equi) WHERE (equipo IS NULL OR equipo = '') AND id_equi IS NOT NULL`)
  db.run(`UPDATE serial SET id_equi = (SELECT id FROM electrodomesticos WHERE electrodomesticos.uid = serial.equipo_uid) WHERE equipo_uid IS NOT NULL AND equipo_uid <> '' AND EXISTS (SELECT 1 FROM electrodomesticos WHERE electrodomesticos.uid = serial.equipo_uid)`)
  db.run(`INSERT OR REPLACE INTO schema_migrations (version, detalle) VALUES (20260721, 'Relacion estable de almacenes mediante almacen_uid')`)
}

function insertDefaultData() {
  if (!db) return

  // Default users
  const userCheck = db.exec("SELECT id FROM usuarios WHERE email = 'admin' LIMIT 1")
  if (userCheck.length === 0 || userCheck[0].values.length === 0) {
    const defaults = [
      { nombre: 'ADMINISTRADOR', email: 'admin', pin: '1234', nivel_seguridad: 'Administrador' },
      { nombre: 'USUARIO', email: 'usuario', pin: '1111', nivel_seguridad: 'Usuario' },
      { nombre: 'SOPORTE', email: 'soporte', pin: '2222', nivel_seguridad: 'Soporte' },
    ]
    for (const user of defaults) {
      const uid = generarUid()
      db.run(
        `INSERT INTO usuarios (nombre, email, password, pin, nivel_seguridad, estado, uid, created_at, updated_at)
         VALUES (?, ?, '', ?, ?, 'ACTIVADO', ?, datetime('now'), datetime('now'))`,
        [user.nombre, user.email, user.pin, user.nivel_seguridad, uid]
      )
    }
  }

  // Default company
  const empCheck = db.exec("SELECT id FROM empresa LIMIT 1")
  if (empCheck.length === 0 || empCheck[0].values.length === 0) {
    const uid = generarUid()
    db.run(`INSERT INTO empresa (nombre, uid, created_at, updated_at) VALUES ('MI EMPRESA', ?, datetime('now'), datetime('now'))`, [uid])
  }

  // Default license
  const licCheck = db.exec("SELECT id FROM licencia WHERE id = 1 LIMIT 1")
  if (licCheck.length === 0 || licCheck[0].values.length === 0) {
    const uid = generarUid()
    db.run(`INSERT INTO licencia (id, estado, uid, created_at, updated_at) VALUES (1, 'sin_verificar', ?, datetime('now'), datetime('now'))`, [uid])
  }

  // Default printer config
  const printCheck = db.exec("SELECT id FROM impresoras_config WHERE id = 1 LIMIT 1")
  if (printCheck.length === 0 || printCheck[0].values.length === 0) {
    const uid = generarUid()
    db.run(`INSERT INTO impresoras_config (id, uid, created_at, updated_at) VALUES (1, ?, datetime('now'), datetime('now'))`, [uid])
  }

  // Default comprobantes
  const compCheck = db.exec("SELECT COUNT(*) as c FROM comprobantes_fiscales")
  if (compCheck.length === 0 || Number(compCheck[0].values[0]) === 0) {
    const comprobantes = [
      ['SIN', 'Sin Comprobante', 'Venta sin comprobante fiscal', '', 1, 1, 99999999, 1, 0],
      ['E31', 'Factura de Credito Fiscal', 'Ventas a contribuyentes con RNC', 'E31', 1, 1, 99999999, 1, 0],
      ['E32', 'Factura de Consumo', 'Ventas a consumidores finales', 'E32', 1, 1, 99999999, 1, 1],
      ['E33', 'Nota de Debito', 'Cargos adicionales', 'E33', 1, 1, 99999999, 1, 0],
      ['E34', 'Nota de Credito', 'Devoluciones y descuentos', 'E34', 1, 1, 99999999, 1, 0],
      ['E41', 'Compras', 'Comprobante de compras', 'E41', 1, 1, 99999999, 1, 0],
      ['E43', 'Gastos Menores', 'Gastos menores sin comprobante', 'E43', 1, 1, 99999999, 1, 0],
      ['E44', 'Regimenes Especiales', 'Ventas a zonas francas', 'E44', 1, 1, 99999999, 1, 0],
      ['E45', 'Gubernamental', 'Ventas al gobierno', 'E45', 1, 1, 99999999, 1, 0],
      ['E46', 'Exportacion', 'Ventas al exterior', 'E46', 1, 1, 99999999, 1, 0],
      ['E47', 'Pagos al Exterior', 'Pagos a proveedores extranjeros', 'E47', 1, 1, 99999999, 1, 0],
    ]
    for (const c of comprobantes) {
      const uid = generarUid()
      db.run(
        `INSERT INTO comprobantes_fiscales (tipo, nombre, descripcion, prefijo, secuencia_actual, secuencia_desde, secuencia_hasta, activo, es_default, uid, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'))`,
        [...c, uid]
      )
    }
  }

  // Default notas
  const notasCheck = db.exec("SELECT COUNT(*) as total FROM notas")
  if (notasCheck.length === 0 || Number(notasCheck[0].values[0]) === 0) {
    const notas = [
      ['SIN SELLO', 'Sin sello de fabrica'],
      ['CAMBIO', 'Cambio del producto'],
      ['GARANTIA', 'Garantia del producto'],
      ['ENTREGADO', 'Producto entregado al cliente'],
      ['REPARACION', 'Reparacion del equipo'],
      ['A DOMICILIO', 'Envio a domicilio'],
      ['CON FACTURA', 'Venta con factura fiscal'],
      ['SIN FACTURA', 'Venta sin factura fiscal'],
      ['PENDIENTE', 'Pendiente por entregar'],
      ['OBSERVACION', 'Observacion general'],
    ]
    for (const [titulo, contenido] of notas) {
      const uid = generarUid()
      db.run(`INSERT INTO notas (titulo, contenido, uid, created_at) VALUES (?, ?, ?, datetime('now'))`, [titulo, contenido, uid])
    }
  }
}

// ========== DB API ==========

function getDb(): SqlJsDatabase {
  if (!db) throw new Error('Database not initialized')
  return db
}

function escapeId(id: string): string {
  return `"${id.replace(/"/g, '""')}"`
}

export function dbGetAll(tabla: string): { success: boolean; data?: any[]; error?: string } {
  try {
    const stmt = getDb().prepare(`SELECT * FROM ${escapeId(tabla)} ORDER BY id DESC`)
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    if (tabla === 'empresa' && rows.length > 1) {
      const activeUid = localStorage.getItem('almacen_default_uid') || localStorage.getItem('almacen_uid') || ''
      const activeId = Number(localStorage.getItem('almacen_default_id') || localStorage.getItem('almacen_id'))
      if (activeUid || activeId) {
        rows.sort((a: any, b: any) =>
          Number(activeUid ? String(b.uid || b.almacen_uid || '') === activeUid : Number(b.almacen_id || b.id) === activeId) -
          Number(activeUid ? String(a.uid || a.almacen_uid || '') === activeUid : Number(a.almacen_id || a.id) === activeId)
        )
      }
    }
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbGetWhere(tabla: string, where: string, params: any[] = []): { success: boolean; data?: any[]; error?: string } {
  try {
    const stmt = getDb().prepare(`SELECT * FROM ${escapeId(tabla)}${where ? ` WHERE ${where}` : ''} ORDER BY id DESC`)
    if (params.length) stmt.bind(params)
    const rows: any[] = []
    while (stmt.step()) rows.push(stmt.getAsObject())
    stmt.free()
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbGetModified(tabla: string, desde: string): { success: boolean; data?: any[]; error?: string } {
  try {
    const d = getDb()
    let rows: any[]
    if (desde) {
      const stmt = d.prepare(`SELECT * FROM ${escapeId(tabla)} WHERE updated_at > ? ORDER BY updated_at ASC`)
      stmt.bind([desde])
      rows = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
    } else {
      const stmt = d.prepare(`SELECT * FROM ${escapeId(tabla)} ORDER BY id DESC`)
      rows = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
    }
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbGetById(tabla: string, id: number): { success: boolean; data?: any; error?: string } {
  try {
    const stmt = getDb().prepare(`SELECT * FROM ${escapeId(tabla)} WHERE id = ?`)
    stmt.bind([id])
    const row = stmt.step() ? stmt.getAsObject() : null
    stmt.free()
    return { success: true, data: row }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbInsert(tabla: string, data: Record<string, any>): { success: boolean; data?: { id: number }; error?: string } {
  try {
    const d = getDb()
    if (GLOBAL_TABLES.has(tabla)) {
      delete data.almacen_id
      delete data.almacen_uid
    } else {
      if (data.almacen_id === undefined) data.almacen_id = Number(localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0)
      if (!data.almacen_uid) data.almacen_uid = localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || ''
    }
    if (!data.uid) data.uid = generarUid()
    if (tabla === 'empresa') data.almacen_uid = data.uid
    if (tabla === 'serial') {
      const equipoStmt = d.prepare(data.equipo_uid
        ? `SELECT id, uid, nombre FROM electrodomesticos WHERE uid = ? LIMIT 1`
        : `SELECT id, uid, nombre FROM electrodomesticos WHERE id = ? LIMIT 1`)
      equipoStmt.bind([data.equipo_uid || data.id_equi || 0])
      if (equipoStmt.step()) {
        const equipo: any = equipoStmt.getAsObject()
        data.id_equi = equipo.id
        data.equipo_uid = equipo.uid || ''
        data.equipo = equipo.nombre || data.equipo || ''
      }
      equipoStmt.free()
    }
    data.created_at = data.created_at || nowISO()
    data.updated_at = nowISO()

    const keys = Object.keys(data)
    const placeholders = keys.map(() => '?').join(', ')
    const values = keys.map(k => data[k])

    d.run(`INSERT INTO ${escapeId(tabla)} (${keys.map(escapeId).join(', ')}) VALUES (${placeholders})`, values)
    const result = d.exec('SELECT last_insert_rowid() as id')
    const newId = result[0]?.values[0]?.[0] || 0

    if (tabla !== 'bitacora' && tabla !== 'sync_deletes') {
      try {
        const uid = data.uid || ''
        const usuario = data.usuario || ''
        d.run(
          `INSERT INTO bitacora (tabla, registro_id, accion, usuario, datos_nuevos, created_at) VALUES (?, ?, 'CREATE', ?, ?, datetime('now'))`,
          [tabla, Number(newId), usuario, JSON.stringify(data)]
        )
      } catch {}
    }

    saveDb()
    return { success: true, data: { id: Number(newId) } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbUpdate(tabla: string, id: number, data: Record<string, any>): { success: boolean; error?: string } {
  try {
    const d = getDb()

    const oldStmt = d.prepare(`SELECT * FROM ${escapeId(tabla)} WHERE id = ?`)
    oldStmt.bind([id])
    const oldData = oldStmt.step() ? oldStmt.getAsObject() : {}
    oldStmt.free()

    if (GLOBAL_TABLES.has(tabla)) {
      delete data.almacen_id
      delete data.almacen_uid
    }
    if (tabla === 'empresa') {
      // Conserva para siempre el identificador con el que la empresa fue creada.
      data.uid = (oldData as any).uid || data.uid || generarUid()
      data.almacen_uid = data.uid
    }
    if (tabla === 'serial' && (data.equipo_uid !== undefined || data.id_equi !== undefined)) {
      const equipoStmt = d.prepare(data.equipo_uid
        ? `SELECT id, uid, nombre FROM electrodomesticos WHERE uid = ? LIMIT 1`
        : `SELECT id, uid, nombre FROM electrodomesticos WHERE id = ? LIMIT 1`)
      equipoStmt.bind([data.equipo_uid || data.id_equi || 0])
      if (equipoStmt.step()) {
        const equipo: any = equipoStmt.getAsObject()
        data.id_equi = equipo.id
        data.equipo_uid = equipo.uid || ''
        data.equipo = equipo.nombre || data.equipo || ''
      }
      equipoStmt.free()
    }
    data.updated_at = nowISO()
    const keys = Object.keys(data)
    const sets = keys.map(k => `${escapeId(k)} = ?`).join(', ')
    const values = [...keys.map(k => data[k]), id]

    d.run(`UPDATE ${escapeId(tabla)} SET ${sets} WHERE id = ?`, values)

    if (tabla !== 'bitacora' && tabla !== 'sync_deletes') {
      try {
        const usuario = data.usuario || ''
        d.run(
          `INSERT INTO bitacora (tabla, registro_id, accion, usuario, datos_nuevos, datos_anteriores, created_at) VALUES (?, ?, 'UPDATE', ?, ?, ?, datetime('now'))`,
          [tabla, id, usuario, JSON.stringify(data), JSON.stringify(oldData)]
        )
      } catch {}
    }

    saveDb()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbDelete(tabla: string, id: number, usuario?: string): { success: boolean; data?: { cuentas_cobrar_eliminadas: number }; error?: string } {
  try {
    const d = getDb()

    const oldStmt = d.prepare(`SELECT * FROM ${escapeId(tabla)} WHERE id = ?`)
    oldStmt.bind([id])
    const oldData = oldStmt.step() ? oldStmt.getAsObject() : {}
    oldStmt.free()

    const uid = oldData?.uid || ''
    let cuentasCobrarEliminadas = 0
    if (tabla === 'facturas' && String(oldData?.no_factura || '').trim()) {
      const cuentasStmt = d.prepare(`SELECT * FROM cuentas_cobrar WHERE no_factura = ?`)
      cuentasStmt.bind([String(oldData.no_factura).trim()])
      const relacionadas: any[] = []
      while (cuentasStmt.step()) {
        const cuenta = cuentasStmt.getAsObject()
        const facturaAlmacenUid = String(oldData?.almacen_uid || '').trim()
        const cuentaAlmacenUid = String(cuenta?.almacen_uid || '').trim()
        const mismoAlmacen = facturaAlmacenUid && cuentaAlmacenUid
          ? facturaAlmacenUid === cuentaAlmacenUid
          : Number(oldData?.almacen_id || 0) === Number(cuenta?.almacen_id || 0)
        if (mismoAlmacen) relacionadas.push(cuenta)
      }
      cuentasStmt.free()

      for (const cuenta of relacionadas) {
        d.run('DELETE FROM cuentas_cobrar WHERE id = ?', [Number(cuenta.id)])
        try {
          d.run(
            `INSERT INTO bitacora (tabla, registro_id, accion, usuario, datos_anteriores, created_at) VALUES ('cuentas_cobrar', ?, 'DELETE', ?, ?, datetime('now'))`,
            [Number(cuenta.id), usuario || '', JSON.stringify(cuenta)]
          )
          if (cuenta.uid) d.run(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES ('cuentas_cobrar', ?, 1)`, [cuenta.uid])
        } catch {}
        cuentasCobrarEliminadas++
      }
    }
    d.run(`DELETE FROM ${escapeId(tabla)} WHERE id = ?`, [id])

    if (tabla !== 'bitacora' && tabla !== 'sync_deletes') {
      try {
        d.run(
          `INSERT INTO bitacora (tabla, registro_id, accion, usuario, datos_anteriores, created_at) VALUES (?, ?, 'DELETE', ?, ?, datetime('now'))`,
          [tabla, id, usuario || '', JSON.stringify(oldData)]
        )
        if (uid) {
          d.run(`INSERT INTO sync_deletes (tabla, uid, confirmado) VALUES (?, ?, 1)`, [tabla, uid])
        }
      } catch {}
    }

    saveDb()
    return { success: true, data: { cuentas_cobrar_eliminadas: cuentasCobrarEliminadas } }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbDeleteLocalOnly(tabla: string, id: number): { success: boolean; error?: string } {
  try {
    const d = getDb()
    d.run(`DELETE FROM ${escapeId(tabla)} WHERE id = ?`, [Number(id)])
    saveDb()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbBitacoraList(limite = 1000): { success: boolean; data?: any[]; error?: string } {
  try {
    const stmt = getDb().prepare('SELECT * FROM bitacora ORDER BY id DESC LIMIT ?')
    stmt.bind([limite])
    const rows: any[] = []
    while (stmt.step()) {
      rows.push(stmt.getAsObject())
    }
    stmt.free()
    return { success: true, data: rows }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbBitacoraDeleteAll(): { success: boolean; error?: string } {
  try {
    getDb().run('DELETE FROM bitacora')
    saveDb()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbExecuteSQL(sql: string): { success: boolean; type?: string; rows?: any[]; columns?: string[]; count?: number; changes?: number; error?: string } {
  try {
    const d = getDb()
    const upper = sql.trim().toUpperCase()
    if (upper.startsWith('SELECT') || upper.startsWith('PRAGMA') || upper.startsWith('EXPLAIN')) {
      const stmt = d.prepare(sql)
      const rows: any[] = []
      while (stmt.step()) {
        rows.push(stmt.getAsObject())
      }
      stmt.free()
      const columns = rows.length > 0 ? Object.keys(rows[0]) : []
      return { success: true, type: 'select', rows, columns, count: rows.length }
    } else {
      d.run(sql)
      saveDb()
      return { success: true, type: 'execute', changes: d.getRowsModified() }
    }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbGetTableColumns(tabla: string): any[] {
  try {
    const result = getDb().exec(`PRAGMA table_info("${tabla}")`)
    if (result.length === 0) return []
    return result[0].values.map((row: any) => ({
      name: row[1],
      type: row[2],
      notnull: row[3],
      dflt_value: row[4],
    }))
  } catch {
    return []
  }
}

export function dbGetAllTables(): string[] {
  try {
    const result = getDb().exec("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name")
    if (result.length === 0) return []
    return result[0].values.map((row: any) => row[0])
  } catch {
    return []
  }
}

export function dbAssignAllWarehouse(almacenId: number, almacenUid: string): { success: boolean; data?: { registros: number; tablas: number; resumen: Record<string, number> }; error?: string } {
  const id = Number(almacenId || 0)
  const uid = String(almacenUid || '').trim()
  if (!id || !uid) return { success: false, error: 'El almacen actual no tiene ID o UID valido' }

  const d = getDb()
  try {
    const empresaStmt = d.prepare(`SELECT id FROM empresa WHERE id = ? AND (uid = ? OR almacen_uid = ?) LIMIT 1`)
    empresaStmt.bind([id, uid, uid])
    const empresaExiste = empresaStmt.step()
    empresaStmt.free()
    if (!empresaExiste) return { success: false, error: 'El almacen actual no coincide con una empresa registrada' }

    const excluidas = new Set([
      'empresa', 'usuarios', 'bancos', 'banco_transacciones', 'schema_migrations', 'configuracion', 'licencia', 'tmcloud_config',
      'otp_local_config', 'sync_deletes', 'bitacora', 'auditoria_acciones',
    ])
    const ahora = nowISO()
    const resumen: Record<string, number> = {}
    let registros = 0

    d.run('BEGIN TRANSACTION')
    for (const tabla of dbGetAllTables().filter(nombre => !excluidas.has(nombre))) {
      const columnas = new Set(dbGetTableColumns(tabla).map((columna: any) => String(columna.name || '')))
      if (!columnas.has('almacen_uid')) continue

      const cambios = ['almacen_uid = ?']
      const valores: any[] = [uid]
      if (columnas.has('almacen_id')) {
        cambios.push('almacen_id = ?')
        valores.push(id)
      }
      if (columnas.has('updated_at')) {
        cambios.push('updated_at = ?')
        valores.push(ahora)
      }

      d.run(`UPDATE ${escapeId(tabla)} SET ${cambios.join(', ')}`, valores)
      const cantidad = Number(d.getRowsModified() || 0)
      if (cantidad > 0) resumen[tabla] = cantidad
      registros += cantidad
    }
    d.run('COMMIT')
    saveDb()
    return { success: true, data: { registros, tablas: Object.keys(resumen).length, resumen } }
  } catch (e: any) {
    try { d.run('ROLLBACK') } catch {}
    return { success: false, error: e?.message || 'No se pudieron asignar los datos al almacen actual' }
  }
}

export function dbTableExists(tabla: string): boolean {
  try {
    const result = getDb().exec(`SELECT name FROM sqlite_master WHERE type='table' AND name=?`, [tabla])
    return result.length > 0 && result[0].values.length > 0
  } catch {
    return false
  }
}

export function dbRawQuery(sql: string): { success: boolean; error?: string } {
  try {
    getDb().run(sql)
    saveDb()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbVaciarTabla(tabla: string): { success: boolean; error?: string } {
  try {
    const d = getDb()
    d.run(`DELETE FROM "${tabla}"`)
    d.run(`DELETE FROM sqlite_sequence WHERE name='${tabla}'`)
    saveDb()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbEliminarTabla(tabla: string): { success: boolean; error?: string } {
  try {
    getDb().run(`DROP TABLE IF EXISTS "${tabla}"`)
    saveDb()
    return { success: true }
  } catch (e: any) {
    return { success: false, error: e.message }
  }
}

export function dbGetTableRowCount(tabla: string): number {
  try {
    const result = getDb().exec(`SELECT COUNT(*) as count FROM "${tabla}"`)
    return Number(result[0]?.values[0]?.[0]) || 0
  } catch {
    return 0
  }
}

export function dbGetCreateTableSQL(tabla: string): string {
  try {
    const result = getDb().exec(`SELECT sql FROM sqlite_master WHERE type='table' AND name=?`, [tabla])
    return (result[0]?.values[0]?.[0] as string) || ''
  } catch {
    return ''
  }
}

export function dbGetConfig(): { VITE_LINKURL: string; VITE_LINK_API: string; VITE_TOKEN: string; VITE_PATRON_TELEFONO: string; VITE_IMPRESORA_LOCAL: string; VITE_PATRON_CEDULA: string; VITE_TOKEN_CORTO: string } {
  return {
    VITE_LINKURL: '',
    VITE_LINK_API: '',
    VITE_TOKEN: '',
    VITE_PATRON_TELEFONO: '^[0-9]{10}$',
    VITE_IMPRESORA_LOCAL: '',
    VITE_PATRON_CEDULA: '^[0-9]{11}$',
    VITE_TOKEN_CORTO: '',
  }
}
