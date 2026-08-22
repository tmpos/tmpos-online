-- ============================================
-- Setup TMPOS en Supabase
-- Ejecutar en SQL Editor de Supabase Studio
-- ============================================

-- Crear schema para TMPOS
CREATE SCHEMA IF NOT EXISTS tmpos;

COMMENT ON SCHEMA tmpos IS 'Schema para el sistema TMPOS (Point of Sale)';

-- Establecer el schema como predeterminado para esta sesión
SET search_path TO tmpos, public;

-- ============================================
-- EXTENSIONES ÚTILES
-- ============================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp" SCHEMA public;
CREATE EXTENSION IF NOT EXISTS "pgcrypto" SCHEMA public;

-- ============================================
-- TABLAS DEL SISTEMA TMPOS
-- ============================================

-- Tabla: Empresas/Sucursales
CREATE TABLE IF NOT EXISTS tmpos.empresas (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  nombre VARCHAR(255) NOT NULL,
  ruc VARCHAR(20),
  direccion TEXT,
  telefono VARCHAR(20),
  email VARCHAR(255),
  logo_url TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Categorías de Productos
CREATE TABLE IF NOT EXISTS tmpos.categorias (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  nombre VARCHAR(100) NOT NULL,
  descripcion TEXT,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Productos
CREATE TABLE IF NOT EXISTS tmpos.productos (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  codigo VARCHAR(50) UNIQUE NOT NULL,
  nombre VARCHAR(255) NOT NULL,
  descripcion TEXT,
  categoria_id UUID REFERENCES tmpos.categorias(id),
  precio_venta DECIMAL(10,2) NOT NULL,
  precio_costo DECIMAL(10,2),
  stock INTEGER DEFAULT 0,
  stock_minimo INTEGER DEFAULT 0,
  unidad_medida VARCHAR(20) DEFAULT 'unidad',
  tiene_itbis BOOLEAN DEFAULT true,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Clientes
CREATE TABLE IF NOT EXISTS tmpos.clientes (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  codigo VARCHAR(50) UNIQUE,
  nombre VARCHAR(255) NOT NULL,
  cedula_rnc VARCHAR(20),
  tipo_documento VARCHAR(20) DEFAULT 'cedula',
  telefono VARCHAR(20),
  email VARCHAR(255),
  direccion TEXT,
  limite_credito DECIMAL(10,2) DEFAULT 0,
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Usuarios del Sistema
CREATE TABLE IF NOT EXISTS tmpos.usuarios (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  username VARCHAR(50) UNIQUE NOT NULL,
  nombre_completo VARCHAR(255) NOT NULL,
  email VARCHAR(255),
  rol VARCHAR(50) DEFAULT 'vendedor',
  activo BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Ventas
CREATE TABLE IF NOT EXISTS tmpos.ventas (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  numero_factura VARCHAR(50) UNIQUE NOT NULL,
  ncf VARCHAR(50),
  fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
  cliente_id UUID REFERENCES tmpos.clientes(id),
  usuario_id UUID REFERENCES tmpos.usuarios(id),
  subtotal DECIMAL(10,2) NOT NULL,
  itbis DECIMAL(10,2) DEFAULT 0,
  descuento DECIMAL(10,2) DEFAULT 0,
  total DECIMAL(10,2) NOT NULL,
  efectivo_recibido DECIMAL(10,2),
  cambio DECIMAL(10,2),
  tipo_pago VARCHAR(20) DEFAULT 'efectivo',
  estado VARCHAR(20) DEFAULT 'completada',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Detalles de Venta
CREATE TABLE IF NOT EXISTS tmpos.ventas_detalle (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  venta_id UUID REFERENCES tmpos.ventas(id) ON DELETE CASCADE,
  producto_id UUID REFERENCES tmpos.productos(id),
  cantidad DECIMAL(10,2) NOT NULL,
  precio_unitario DECIMAL(10,2) NOT NULL,
  descuento DECIMAL(10,2) DEFAULT 0,
  itbis DECIMAL(10,2) DEFAULT 0,
  subtotal DECIMAL(10,2) NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Cierres de Caja
CREATE TABLE IF NOT EXISTS tmpos.cierres_caja (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  usuario_id UUID REFERENCES tmpos.usuarios(id),
  fecha_apertura TIMESTAMP WITH TIME ZONE NOT NULL,
  fecha_cierre TIMESTAMP WITH TIME ZONE,
  monto_inicial DECIMAL(10,2) NOT NULL,
  monto_final DECIMAL(10,2),
  total_ventas DECIMAL(10,2) DEFAULT 0,
  total_efectivo DECIMAL(10,2) DEFAULT 0,
  total_tarjeta DECIMAL(10,2) DEFAULT 0,
  diferencia DECIMAL(10,2) DEFAULT 0,
  estado VARCHAR(20) DEFAULT 'abierto',
  notas TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Tabla: Movimientos de Inventario
CREATE TABLE IF NOT EXISTS tmpos.movimientos_inventario (
  id UUID PRIMARY KEY DEFAULT public.uuid_generate_v4(),
  producto_id UUID REFERENCES tmpos.productos(id),
  tipo_movimiento VARCHAR(20) NOT NULL, -- 'entrada', 'salida', 'ajuste'
  cantidad INTEGER NOT NULL,
  motivo VARCHAR(255),
  usuario_id UUID REFERENCES tmpos.usuarios(id),
  referencia VARCHAR(100),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- ============================================
-- ÍNDICES PARA MEJOR RENDIMIENTO
-- ============================================

CREATE INDEX IF NOT EXISTS idx_productos_codigo ON tmpos.productos(codigo);
CREATE INDEX IF NOT EXISTS idx_productos_categoria ON tmpos.productos(categoria_id);
CREATE INDEX IF NOT EXISTS idx_productos_activo ON tmpos.productos(activo);
CREATE INDEX IF NOT EXISTS idx_clientes_cedula ON tmpos.clientes(cedula_rnc);
CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON tmpos.ventas(fecha DESC);
CREATE INDEX IF NOT EXISTS idx_ventas_cliente ON tmpos.ventas(cliente_id);
CREATE INDEX IF NOT EXISTS idx_ventas_estado ON tmpos.ventas(estado);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta ON tmpos.ventas_detalle(venta_id);
CREATE INDEX IF NOT EXISTS idx_ventas_detalle_producto ON tmpos.ventas_detalle(producto_id);
CREATE INDEX IF NOT EXISTS idx_cierres_usuario ON tmpos.cierres_caja(usuario_id);
CREATE INDEX IF NOT EXISTS idx_cierres_estado ON tmpos.cierres_caja(estado);

-- ============================================
-- FUNCIONES Y TRIGGERS
-- ============================================

-- Función para actualizar updated_at automáticamente
CREATE OR REPLACE FUNCTION tmpos.actualizar_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers para actualizar updated_at
CREATE TRIGGER trigger_empresas_updated_at
  BEFORE UPDATE ON tmpos.empresas
  FOR EACH ROW
  EXECUTE FUNCTION tmpos.actualizar_updated_at();

CREATE TRIGGER trigger_productos_updated_at
  BEFORE UPDATE ON tmpos.productos
  FOR EACH ROW
  EXECUTE FUNCTION tmpos.actualizar_updated_at();

CREATE TRIGGER trigger_clientes_updated_at
  BEFORE UPDATE ON tmpos.clientes
  FOR EACH ROW
  EXECUTE FUNCTION tmpos.actualizar_updated_at();

CREATE TRIGGER trigger_usuarios_updated_at
  BEFORE UPDATE ON tmpos.usuarios
  FOR EACH ROW
  EXECUTE FUNCTION tmpos.actualizar_updated_at();

-- Función para actualizar stock automáticamente
CREATE OR REPLACE FUNCTION tmpos.actualizar_stock_venta()
RETURNS TRIGGER AS $$
BEGIN
  -- Restar del stock cuando se crea una venta
  UPDATE tmpos.productos
  SET stock = stock - NEW.cantidad
  WHERE id = NEW.producto_id;

  -- Registrar movimiento de inventario
  INSERT INTO tmpos.movimientos_inventario (producto_id, tipo_movimiento, cantidad, motivo, referencia)
  VALUES (NEW.producto_id, 'salida', NEW.cantidad, 'Venta', NEW.venta_id::TEXT);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger para actualizar stock en ventas
CREATE TRIGGER trigger_actualizar_stock
  AFTER INSERT ON tmpos.ventas_detalle
  FOR EACH ROW
  EXECUTE FUNCTION tmpos.actualizar_stock_venta();

-- ============================================
-- VISTAS ÚTILES
-- ============================================

-- Vista: Productos con bajo stock
CREATE OR REPLACE VIEW tmpos.productos_bajo_stock AS
SELECT
  p.id,
  p.codigo,
  p.nombre,
  c.nombre as categoria,
  p.stock,
  p.stock_minimo,
  (p.stock_minimo - p.stock) as faltante
FROM tmpos.productos p
LEFT JOIN tmpos.categorias c ON p.categoria_id = c.id
WHERE p.stock <= p.stock_minimo AND p.activo = true
ORDER BY p.stock ASC;

-- Vista: Resumen de ventas del día
CREATE OR REPLACE VIEW tmpos.ventas_hoy AS
SELECT
  v.id,
  v.numero_factura,
  v.fecha,
  c.nombre as cliente,
  u.nombre_completo as vendedor,
  v.subtotal,
  v.itbis,
  v.descuento,
  v.total,
  v.tipo_pago,
  v.estado
FROM tmpos.ventas v
LEFT JOIN tmpos.clientes c ON v.cliente_id = c.id
LEFT JOIN tmpos.usuarios u ON v.usuario_id = u.id
WHERE DATE(v.fecha) = CURRENT_DATE
ORDER BY v.fecha DESC;

-- ============================================
-- DATOS DE EJEMPLO (OPCIONAL)
-- ============================================

-- Insertar categorías de ejemplo
INSERT INTO tmpos.categorias (nombre, descripcion) VALUES
  ('Bebidas', 'Bebidas alcohólicas y no alcohólicas'),
  ('Comida', 'Alimentos y snacks'),
  ('Cigarrillos', 'Productos de tabaco'),
  ('Otros', 'Productos varios')
ON CONFLICT DO NOTHING;

-- Insertar empresa de ejemplo
INSERT INTO tmpos.empresas (nombre, ruc, direccion, telefono) VALUES
  ('Mi Negocio', '000-0000000-0', 'Dirección de ejemplo', '809-000-0000')
ON CONFLICT DO NOTHING;

-- Insertar usuario administrador de ejemplo
INSERT INTO tmpos.usuarios (username, nombre_completo, email, rol) VALUES
  ('admin', 'Administrador', 'admin@example.com', 'administrador')
ON CONFLICT DO NOTHING;

-- ============================================
-- PERMISOS (Row Level Security - RLS)
-- ============================================

-- Habilitar RLS en tablas principales
ALTER TABLE tmpos.empresas ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmpos.productos ENABLE ROW LEVEL SECURITY;
ALTER TABLE tmpos.ventas ENABLE ROW LEVEL SECURITY;

-- Crear políticas básicas (ajustar según necesidades)
-- Por ahora, permitir todo para usuarios autenticados

CREATE POLICY "Permitir lectura a todos" ON tmpos.empresas
  FOR SELECT USING (true);

CREATE POLICY "Permitir lectura a todos" ON tmpos.productos
  FOR SELECT USING (true);

CREATE POLICY "Permitir lectura a todos" ON tmpos.ventas
  FOR SELECT USING (true);

-- ============================================
-- FINALIZACIÓN
-- ============================================

-- Mensaje de confirmación
DO $$
BEGIN
  RAISE NOTICE '✅ Base de datos TMPOS configurada exitosamente!';
  RAISE NOTICE '📊 Schema: tmpos';
  RAISE NOTICE '📁 Tablas creadas: 11';
  RAISE NOTICE '🔍 Vistas creadas: 2';
  RAISE NOTICE '⚡ Triggers configurados';
  RAISE NOTICE '';
  RAISE NOTICE 'Próximos pasos:';
  RAISE NOTICE '1. Configurar usuarios y permisos según necesidades';
  RAISE NOTICE '2. Agregar productos a través de la aplicación';
  RAISE NOTICE '3. Configurar conexión desde tu aplicación Vue';
END $$;

-- Mostrar resumen de tablas creadas
SELECT
  schemaname as schema,
  tablename as tabla,
  pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as tamaño
FROM pg_tables
WHERE schemaname = 'tmpos'
ORDER BY tablename;
