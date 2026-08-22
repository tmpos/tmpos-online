-- ============================================================
-- ESQUEMA SUPABASE PARA MR CUTTI TECHNOLOGY
-- Ejecuta este script en el SQL Editor de tu proyecto Supabase
-- ============================================================

-- Crear secuencia para no_factura
CREATE SEQUENCE IF NOT EXISTS facturas_no_factura_seq START 1;

-- ===================== USUARIOS =====================
CREATE TABLE IF NOT EXISTS usuarios (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL DEFAULT '',
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Default users
INSERT INTO usuarios (nombre, email, pin, nivel_seguridad) VALUES
  ('ADMINISTRADOR', 'admin', '1234', 'Administrador'),
  ('USUARIO', 'usuario', '1111', 'Usuario'),
  ('SOPORTE', 'soporte', '2222', 'Soporte')
ON CONFLICT DO NOTHING;

-- ===================== EMPRESA =====================
CREATE TABLE IF NOT EXISTS empresa (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT DEFAULT '',
  legal TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  logo TEXT DEFAULT '',
  impuesto REAL DEFAULT 18,
  impuesto_incluido INTEGER DEFAULT 0,
  moneda TEXT DEFAULT 'RD$',
  tipo_documento_defecto TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO empresa (nombre) VALUES ('MI EMPRESA') ON CONFLICT DO NOTHING;

-- ===================== CLIENTES =====================
CREATE TABLE IF NOT EXISTS clientes (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== PROVEEDORES =====================
CREATE TABLE IF NOT EXISTS proveedores (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  rnc TEXT DEFAULT '',
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  encargado TEXT DEFAULT '',
  cuenta_bancaria TEXT DEFAULT '',
  direccion TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== CATEGORIAS =====================
CREATE TABLE IF NOT EXISTS categorias (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  estado TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== MARCAS =====================
CREATE TABLE IF NOT EXISTS marcas (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  descripcion TEXT DEFAULT '',
  estado TEXT DEFAULT 'activo',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== ACCESORIOS =====================
CREATE TABLE IF NOT EXISTS accesorios (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  codigo_barra TEXT DEFAULT '',
  costo REAL DEFAULT 0,
  precio_venta REAL DEFAULT 0,
  precio_min REAL DEFAULT 0,
  precio_xmayor REAL DEFAULT 0,
  cantidad INTEGER DEFAULT 1,
  alerta INTEGER DEFAULT 10,
  marca INTEGER REFERENCES marcas(id),
  categoria INTEGER REFERENCES categorias(id),
  proveedor_id INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== TELEFONOS =====================
CREATE TABLE IF NOT EXISTS telefonos (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== IMEI =====================
CREATE TABLE IF NOT EXISTS imei (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  id_equi INTEGER REFERENCES telefonos(id),
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== ELECTRODOMESTICOS =====================
CREATE TABLE IF NOT EXISTS electrodomesticos (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== SERIAL =====================
CREATE TABLE IF NOT EXISTS serial (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  id_equi INTEGER REFERENCES electrodomesticos(id),
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== FACTURAS =====================
CREATE TABLE IF NOT EXISTS facturas (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  transferencia REAL DEFAULT 0,
  efectivo REAL DEFAULT 0,
  canal_venta TEXT DEFAULT '',
  fecha_emision TEXT DEFAULT '',
  impuesto REAL DEFAULT 0,
  descuento REAL DEFAULT 0,
  subtotal REAL DEFAULT 0,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== PIEZAS =====================
CREATE TABLE IF NOT EXISTS piezas (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  costo REAL DEFAULT 0,
  precio_venta REAL DEFAULT 0,
  cantidad INTEGER DEFAULT 0,
  alerta INTEGER DEFAULT 1,
  proveedor TEXT DEFAULT '',
  descripcion TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== TECNICOS =====================
CREATE TABLE IF NOT EXISTS tecnicos (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  telefono TEXT DEFAULT '',
  email TEXT DEFAULT '',
  porcentaje REAL DEFAULT 0,
  estado TEXT DEFAULT 'ACTIVO',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== ORDENES_TALLER =====================
CREATE TABLE IF NOT EXISTS ordenes_taller (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== CORREO =====================
CREATE TABLE IF NOT EXISTS correo (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  host TEXT DEFAULT 'smtp.gmail.com',
  puerto TEXT DEFAULT '587',
  seguridad TEXT DEFAULT 'STARTTLS',
  email TEXT DEFAULT '',
  password TEXT DEFAULT '',
  nombre_remitente TEXT DEFAULT '',
  activo INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO correo (id, host, puerto, seguridad, activo) VALUES (1, 'smtp.gmail.com', '587', 'STARTTLS', 0)
ON CONFLICT DO NOTHING;

-- ===================== GASTOS =====================
CREATE TABLE IF NOT EXISTS gastos (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  cantidad REAL DEFAULT 0,
  fecha TEXT DEFAULT '',
  hora TEXT DEFAULT '',
  comentario TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== GASTOS_FIJOS =====================
CREATE TABLE IF NOT EXISTS gastos_fijos (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  monto REAL DEFAULT 0,
  dia_pago INTEGER DEFAULT 1,
  categoria TEXT DEFAULT '',
  periodicidad TEXT DEFAULT 'MENSUAL',
  estado TEXT DEFAULT 'ACTIVO',
  descripcion TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== IMPRESORAS_CONFIG =====================
CREATE TABLE IF NOT EXISTS impresoras_config (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO impresoras_config (id) VALUES (1) ON CONFLICT DO NOTHING;

-- ===================== CUENTAS_COBRAR =====================
CREATE TABLE IF NOT EXISTS cuentas_cobrar (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== CUENTAS_PAGAR =====================
CREATE TABLE IF NOT EXISTS cuentas_pagar (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== COMPROBANTES_FISCALES =====================
CREATE TABLE IF NOT EXISTS comprobantes_fiscales (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO comprobantes_fiscales (tipo, nombre, descripcion, prefijo, secuencia_actual, secuencia_desde, secuencia_hasta, activo, es_default) VALUES
  ('SIN', 'Sin Comprobante', 'Venta sin comprobante fiscal', '', 1, 1, 99999999, 1, 0),
  ('E31', 'Factura de Credito Fiscal', 'Ventas a contribuyentes con RNC', 'E31', 1, 1, 99999999, 1, 0),
  ('E32', 'Factura de Consumo', 'Ventas a consumidores finales', 'E32', 1, 1, 99999999, 1, 1),
  ('E33', 'Nota de Debito', 'Cargos adicionales', 'E33', 1, 1, 99999999, 1, 0),
  ('E34', 'Nota de Credito', 'Devoluciones y descuentos', 'E34', 1, 1, 99999999, 1, 0),
  ('E41', 'Compras', 'Comprobante de compras', 'E41', 1, 1, 99999999, 1, 0),
  ('E43', 'Gastos Menores', 'Gastos menores sin comprobante', 'E43', 1, 1, 99999999, 1, 0),
  ('E44', 'Regimenes Especiales', 'Ventas a zonas francas', 'E44', 1, 1, 99999999, 1, 0),
  ('E45', 'Gubernamental', 'Ventas al gobierno', 'E45', 1, 1, 99999999, 1, 0),
  ('E46', 'Exportacion', 'Ventas al exterior', 'E46', 1, 1, 99999999, 1, 0),
  ('E47', 'Pagos al Exterior', 'Pagos a proveedores extranjeros', 'E47', 1, 1, 99999999, 1, 0)
ON CONFLICT DO NOTHING;

-- ===================== BITACORA =====================
CREATE TABLE IF NOT EXISTS bitacora (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  tabla TEXT DEFAULT '',
  registro_id INTEGER DEFAULT 0,
  accion TEXT DEFAULT '',
  usuario TEXT DEFAULT '',
  datos_nuevos TEXT DEFAULT '',
  datos_anteriores TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== NOTAS =====================
CREATE TABLE IF NOT EXISTS notas (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  titulo TEXT NOT NULL,
  contenido TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO notas (titulo, contenido) VALUES
  ('SIN SELLO', 'Sin sello de fabrica'),
  ('CAMBIO', 'Cambio del producto'),
  ('GARANTIA', 'Garantia del producto'),
  ('ENTREGADO', 'Producto entregado al cliente'),
  ('REPARACION', 'Reparacion del equipo'),
  ('A DOMICILIO', 'Envio a domicilio'),
  ('CON FACTURA', 'Venta con factura fiscal'),
  ('SIN FACTURA', 'Venta sin factura fiscal'),
  ('PENDIENTE', 'Pendiente por entregar'),
  ('OBSERVACION', 'Observacion general')
ON CONFLICT DO NOTHING;

-- ===================== LICENCIA =====================
CREATE TABLE IF NOT EXISTS licencia (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  licencia_equipo TEXT,
  licencia_cifrada TEXT,
  estado TEXT DEFAULT 'sin_verificar',
  nombre_empresa TEXT,
  fecha_inicio_prueba TEXT,
  fecha_vencimiento TEXT,
  ultima_verificacion TEXT,
  api_key TEXT,
  datos_servidor TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

INSERT INTO licencia (id, estado) VALUES (1, 'sin_verificar') ON CONFLICT DO NOTHING;

-- ===================== PLANTILLAS_ETIQUETAS =====================
CREATE TABLE IF NOT EXISTS plantillas_etiquetas (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  nombre TEXT NOT NULL,
  ancho REAL DEFAULT 50,
  alto REAL DEFAULT 30,
  elementos TEXT DEFAULT '[]',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== CONFIGURACION =====================
CREATE TABLE IF NOT EXISTS configuracion (
  id BIGSERIAL PRIMARY KEY,
  uid TEXT DEFAULT gen_random_uuid()::text,
  clave TEXT UNIQUE NOT NULL,
  valor TEXT DEFAULT '',
  tipo TEXT DEFAULT 'string',
  categoria TEXT DEFAULT 'general',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ===================== ÍNDICES =====================
CREATE INDEX IF NOT EXISTS idx_facturas_no_factura ON facturas(no_factura);
CREATE INDEX IF NOT EXISTS idx_facturas_fecha_emision ON facturas(fecha_emision);
CREATE INDEX IF NOT EXISTS idx_facturas_estado ON facturas(estado_factura);
CREATE INDEX IF NOT EXISTS idx_clientes_nombre ON clientes(nombre);
CREATE INDEX IF NOT EXISTS idx_imei_estado ON imei(estado);
CREATE INDEX IF NOT EXISTS idx_imei_id_equi ON imei(id_equi);
CREATE INDEX IF NOT EXISTS idx_ordenes_taller_estado ON ordenes_taller(estado);
