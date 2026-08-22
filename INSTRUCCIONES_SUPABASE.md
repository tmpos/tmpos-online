# 🚀 Configuración de TMPOS en Supabase

## 📝 Paso 1: Ejecutar el Script SQL

1. **Accede a Supabase Studio**
   - URL: `https://srv1794803.hstgr.cloud`
   - Username: `supabase`
   - Password: `T@veras20260`

2. **Ve al SQL Editor**
   - En el menú lateral, busca "SQL Editor" o "Database" → "SQL Editor"

3. **Ejecuta el script**
   - Abre el archivo `setup_tmpos_supabase.sql`
   - Copia todo el contenido
   - Pégalo en el SQL Editor
   - Click en "Run" o presiona `Ctrl+Enter`

4. **Verifica la creación**
   - Ve a "Table Editor" en el menú lateral
   - Deberías ver el schema `tmpos` con las siguientes tablas:
     - ✅ empresas
     - ✅ categorias
     - ✅ productos
     - ✅ clientes
     - ✅ usuarios
     - ✅ ventas
     - ✅ ventas_detalle
     - ✅ cierres_caja
     - ✅ movimientos_inventario

## 🔑 Paso 2: Obtener las Credenciales de la API

1. **En Supabase Studio, ve a Settings → API**

2. **Copia los siguientes valores:**
   - **Project URL**: `https://srv1794803.hstgr.cloud` (o el que aparezca)
   - **anon public key**: Copia la clave pública (anon key)
   - **service_role key**: Copia la clave de servicio (solo si necesitas acceso completo)

## ⚙️ Paso 3: Configurar el Proyecto Vue

1. **Actualiza el archivo `.env`**:

```env
# Configuración de Supabase
VITE_SUPABASE_URL=https://srv1794803.hstgr.cloud
VITE_SUPABASE_ANON_KEY=tu_anon_key_aqui
VITE_SUPABASE_SERVICE_ROLE_KEY=tu_service_role_key_aqui
```

2. **Instala el cliente de Supabase**:

```bash
npm install @supabase/supabase-js
```

## 📦 Paso 4: Estructura de la Base de Datos

### Tablas Principales

#### `tmpos.empresas`
- Información de la empresa/sucursal
- RUC, dirección, teléfono, logo

#### `tmpos.productos`
- Catálogo de productos
- Código, nombre, precio, stock
- Control de stock mínimo
- ITBIS incluido

#### `tmpos.ventas`
- Registro de ventas
- NCF, facturas
- Totales, impuestos, descuentos
- Métodos de pago

#### `tmpos.clientes`
- Base de clientes
- Cédula/RNC
- Límite de crédito

#### `tmpos.cierres_caja`
- Control de cierres de caja
- Montos iniciales/finales
- Diferencias

### Funciones Automáticas

✅ **Actualización de Stock**: Se actualiza automáticamente al registrar ventas
✅ **Registro de Movimientos**: Cada venta registra movimiento de inventario
✅ **Timestamps**: `created_at` y `updated_at` se actualizan automáticamente

### Vistas Disponibles

- `tmpos.productos_bajo_stock`: Productos que necesitan reabastecimiento
- `tmpos.ventas_hoy`: Resumen de ventas del día actual

## 🔗 Paso 5: Conectar desde la Aplicación Vue

Ver el archivo `src/composables/useSupabase.ts` para ejemplos de uso.

### Ejemplo básico:

```typescript
import { useSupabase } from '@/composables/useSupabase'

const { supabase } = useSupabase()

// Consultar productos
const { data: productos } = await supabase
  .from('productos')
  .select('*')
  .eq('activo', true)

// Crear una venta
const { data: venta } = await supabase
  .from('ventas')
  .insert({
    numero_factura: 'B01-00000001',
    cliente_id: clienteId,
    subtotal: 100.00,
    itbis: 18.00,
    total: 118.00
  })
  .select()
  .single()
```

## 📊 Datos de Ejemplo Incluidos

El script incluye datos de ejemplo:
- ✅ 4 categorías básicas (Bebidas, Comida, Cigarrillos, Otros)
- ✅ 1 empresa de ejemplo
- ✅ 1 usuario administrador (username: `admin`)

## 🔐 Seguridad

- ✅ Row Level Security (RLS) habilitado
- ✅ Políticas básicas configuradas
- ⚠️ **IMPORTANTE**: Ajusta las políticas de seguridad según tus necesidades

## 🆘 Troubleshooting

### Error: "permission denied for schema tmpos"
**Solución**: Asegúrate de estar conectado como superusuario o con permisos suficientes.

### Error: "relation already exists"
**Solución**: Las tablas ya existen. Puedes borrar el schema y volver a ejecutar:
```sql
DROP SCHEMA tmpos CASCADE;
-- Luego ejecuta el script completo de nuevo
```

### No veo el schema tmpos en Table Editor
**Solución**: Refresca la página o ve a Database → Schemas para verificar.

## 📞 Soporte

Si necesitas ayuda adicional:
1. Revisa los logs en el SQL Editor
2. Verifica los permisos de usuario
3. Consulta la documentación de Supabase: https://supabase.com/docs

---

**Creado el**: 2026-07-01
**Versión**: 1.0
**Base de datos**: PostgreSQL 15+ con Supabase
