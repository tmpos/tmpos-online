-- Script para crear bases de datos en Supabase
-- Ejecutar en el SQL Editor de Supabase Studio (https://srv1794803.hstgr.cloud)

-- ==================================================
-- 1. Base de datos TMPOS (Sistema POS)
-- ==================================================

-- Crear la base de datos TMPOS
CREATE DATABASE tmpos
  WITH
  OWNER = postgres
  ENCODING = 'UTF8'
  LC_COLLATE = 'en_US.UTF-8'
  LC_CTYPE = 'en_US.UTF-8'
  TABLESPACE = pg_default
  CONNECTION LIMIT = -1
  TEMPLATE template0;

COMMENT ON DATABASE tmpos IS 'Base de datos para el sistema TMPOS (Point of Sale)';

-- ==================================================
-- Conexión a la base de datos TMPOS
-- ==================================================
-- NOTA: Después de crear la base de datos, conéctate a ella
-- usando el selector de base de datos en Supabase Studio
-- y ejecuta los siguientes comandos:

-- Habilitar extensiones útiles en TMPOS
\c tmpos;

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";

-- Crear schema para el sistema
CREATE SCHEMA IF NOT EXISTS tmpos_schema;

COMMENT ON SCHEMA tmpos_schema IS 'Schema principal para el sistema TMPOS';

-- ==================================================
-- 2. Usuario y permisos para TMPOS
-- ==================================================

-- Crear usuario específico para la aplicación TMPOS (opcional)
-- Cambia 'tu_password_seguro' por una contraseña fuerte
-- CREATE USER tmpos_user WITH PASSWORD 'tu_password_seguro';

-- Otorgar permisos
-- GRANT CONNECT ON DATABASE tmpos TO tmpos_user;
-- GRANT USAGE ON SCHEMA tmpos_schema TO tmpos_user;
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA tmpos_schema TO tmpos_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA tmpos_schema TO tmpos_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA tmpos_schema GRANT ALL ON TABLES TO tmpos_user;
-- ALTER DEFAULT PRIVILEGES IN SCHEMA tmpos_schema GRANT ALL ON SEQUENCES TO tmpos_user;

-- ==================================================
-- 3. Tablas base de ejemplo para TMPOS (opcional)
-- ==================================================

-- Descomentar si quieres crear la estructura básica ahora:

-- SET search_path TO tmpos_schema;

-- Tabla de empresas/sucursales
-- CREATE TABLE IF NOT EXISTS empresas (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   nombre VARCHAR(255) NOT NULL,
--   ruc VARCHAR(20),
--   direccion TEXT,
--   telefono VARCHAR(20),
--   email VARCHAR(255),
--   activo BOOLEAN DEFAULT true,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Tabla de productos
-- CREATE TABLE IF NOT EXISTS productos (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   codigo VARCHAR(50) UNIQUE NOT NULL,
--   nombre VARCHAR(255) NOT NULL,
--   descripcion TEXT,
--   precio_venta DECIMAL(10,2) NOT NULL,
--   precio_costo DECIMAL(10,2),
--   stock INTEGER DEFAULT 0,
--   stock_minimo INTEGER DEFAULT 0,
--   activo BOOLEAN DEFAULT true,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
--   updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Tabla de ventas
-- CREATE TABLE IF NOT EXISTS ventas (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   numero_factura VARCHAR(50) UNIQUE,
--   fecha TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
--   subtotal DECIMAL(10,2) NOT NULL,
--   impuesto DECIMAL(10,2) DEFAULT 0,
--   descuento DECIMAL(10,2) DEFAULT 0,
--   total DECIMAL(10,2) NOT NULL,
--   estado VARCHAR(20) DEFAULT 'completada',
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Tabla de detalles de venta
-- CREATE TABLE IF NOT EXISTS ventas_detalle (
--   id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
--   venta_id UUID REFERENCES ventas(id) ON DELETE CASCADE,
--   producto_id UUID REFERENCES productos(id),
--   cantidad INTEGER NOT NULL,
--   precio_unitario DECIMAL(10,2) NOT NULL,
--   subtotal DECIMAL(10,2) NOT NULL,
--   created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
-- );

-- Índices para mejor rendimiento
-- CREATE INDEX IF NOT EXISTS idx_productos_codigo ON productos(codigo);
-- CREATE INDEX IF NOT EXISTS idx_ventas_fecha ON ventas(fecha);
-- CREATE INDEX IF NOT EXISTS idx_ventas_detalle_venta ON ventas_detalle(venta_id);

COMMENT ON DATABASE tmpos IS 'Base de datos creada exitosamente para TMPOS';

-- ==================================================
-- INSTRUCCIONES:
-- ==================================================
-- 1. Copia todo este script
-- 2. Ve a https://srv1794803.hstgr.cloud
-- 3. Inicia sesión con tus credenciales
-- 4. Ve a SQL Editor
-- 5. Pega y ejecuta este script
-- 6. Verifica que la base de datos se creó correctamente
-- ==================================================
