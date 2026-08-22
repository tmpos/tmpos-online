/**
 * Composable para conectar con Supabase
 * Base de datos TMPOS en el VPS
 */

import { ref, computed } from 'vue';
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// Configuración de Supabase desde variables de entorno
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://srv1794803.hstgr.cloud';
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || '';

// Tipos para TypeScript
export interface Producto {
  id: string;
  codigo: string;
  nombre: string;
  descripcion?: string;
  categoria_id?: string;
  precio_venta: number;
  precio_costo?: number;
  stock: number;
  stock_minimo: number;
  unidad_medida: string;
  tiene_itbis: boolean;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface Venta {
  id: string;
  numero_factura: string;
  ncf?: string;
  fecha: string;
  cliente_id?: string;
  usuario_id?: string;
  subtotal: number;
  itbis: number;
  descuento: number;
  total: number;
  efectivo_recibido?: number;
  cambio?: number;
  tipo_pago: 'efectivo' | 'tarjeta' | 'transferencia' | 'credito';
  estado: 'completada' | 'cancelada' | 'pendiente';
  notas?: string;
  created_at: string;
}

export interface VentaDetalle {
  id: string;
  venta_id: string;
  producto_id: string;
  cantidad: number;
  precio_unitario: number;
  descuento: number;
  itbis: number;
  subtotal: number;
  created_at: string;
}

export interface Cliente {
  id: string;
  codigo?: string;
  nombre: string;
  cedula_rnc?: string;
  tipo_documento: 'cedula' | 'rnc' | 'pasaporte';
  telefono?: string;
  email?: string;
  direccion?: string;
  limite_credito: number;
  activo: boolean;
  created_at: string;
  updated_at: string;
}

export interface CierreCaja {
  id: string;
  usuario_id?: string;
  fecha_apertura: string;
  fecha_cierre?: string;
  monto_inicial: number;
  monto_final?: number;
  total_ventas: number;
  total_efectivo: number;
  total_tarjeta: number;
  diferencia: number;
  estado: 'abierto' | 'cerrado';
  notas?: string;
  created_at: string;
}

// Cliente de Supabase singleton
let supabaseClient: SupabaseClient<any, any, any> | null = null;

export function useSupabase() {
  const loading = ref(false);
  const error = ref<string | null>(null);

  // Crear o retornar cliente existente
  const getClient = (): SupabaseClient<any, any, any> => {
    if (!supabaseClient) {
      if (!supabaseAnonKey) {
        console.warn('⚠️ Supabase Anon Key no configurado. Configura VITE_SUPABASE_ANON_KEY en .env');
      }
      supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
        db: {
          schema: 'tmpos' // Usar el schema tmpos por defecto
        }
      });
    }
    return supabaseClient!;
  };

  const supabase = getClient();

  // ============================================
  // PRODUCTOS
  // ============================================

  /**
   * Obtener todos los productos activos
   */
  async function obtenerProductos(activos = true) {
    loading.value = true;
    error.value = null;
    try {
      let query = supabase.from('productos').select('*');

      if (activos) {
        query = query.eq('activo', true);
      }

      const { data, error: err } = await query.order('nombre');

      if (err) throw err;
      return data as Producto[];
    } catch (err: any) {
      error.value = err.message;
      console.error('Error obteniendo productos:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Buscar productos por código o nombre
   */
  async function buscarProducto(termino: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('productos')
        .select('*')
        .or(`codigo.ilike.%${termino}%,nombre.ilike.%${termino}%`)
        .eq('activo', true)
        .limit(10);

      if (err) throw err;
      return data as Producto[];
    } catch (err: any) {
      error.value = err.message;
      console.error('Error buscando producto:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Crear o actualizar producto
   */
  async function guardarProducto(producto: Partial<Producto>) {
    loading.value = true;
    error.value = null;
    try {
      if (producto.id) {
        // Actualizar
        const { data, error: err } = await supabase
          .from('productos')
          .update(producto)
          .eq('id', producto.id)
          .select()
          .single();

        if (err) throw err;
        return data as Producto;
      } else {
        // Crear
        const { data, error: err } = await supabase
          .from('productos')
          .insert(producto)
          .select()
          .single();

        if (err) throw err;
        return data as Producto;
      }
    } catch (err: any) {
      error.value = err.message;
      console.error('Error guardando producto:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtener productos con bajo stock
   */
  async function productosaBajoStock() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('productos_bajo_stock')
        .select('*');

      if (err) throw err;
      return data;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error obteniendo productos con bajo stock:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  // ============================================
  // VENTAS
  // ============================================

  /**
   * Crear una venta completa con detalles
   */
  async function crearVenta(venta: Partial<Venta>, detalles: Partial<VentaDetalle>[]) {
    loading.value = true;
    error.value = null;
    try {
      // 1. Crear la venta
      const { data: ventaCreada, error: ventaError } = await supabase
        .from('ventas')
        .insert(venta)
        .select()
        .single();

      if (ventaError) throw ventaError;

      // 2. Crear los detalles
      const detallesConVentaId = detalles.map(d => ({
        ...d,
        venta_id: ventaCreada.id
      }));

      const { error: detallesError } = await supabase
        .from('ventas_detalle')
        .insert(detallesConVentaId);

      if (detallesError) throw detallesError;

      return ventaCreada as Venta;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error creando venta:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtener ventas del día
   */
  async function obtenerVentasHoy() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('ventas_hoy')
        .select('*');

      if (err) throw err;
      return data;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error obteniendo ventas de hoy:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtener detalles de una venta
   */
  async function obtenerDetallesVenta(ventaId: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('ventas_detalle')
        .select('*, productos(*)')
        .eq('venta_id', ventaId);

      if (err) throw err;
      return data;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error obteniendo detalles de venta:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  // ============================================
  // CLIENTES
  // ============================================

  /**
   * Obtener todos los clientes
   */
  async function obtenerClientes(activos = true) {
    loading.value = true;
    error.value = null;
    try {
      let query = supabase.from('clientes').select('*');

      if (activos) {
        query = query.eq('activo', true);
      }

      const { data, error: err } = await query.order('nombre');

      if (err) throw err;
      return data as Cliente[];
    } catch (err: any) {
      error.value = err.message;
      console.error('Error obteniendo clientes:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  /**
   * Buscar cliente por cédula/RNC o nombre
   */
  async function buscarCliente(termino: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('clientes')
        .select('*')
        .or(`cedula_rnc.ilike.%${termino}%,nombre.ilike.%${termino}%`)
        .eq('activo', true)
        .limit(10);

      if (err) throw err;
      return data as Cliente[];
    } catch (err: any) {
      error.value = err.message;
      console.error('Error buscando cliente:', err);
      return [];
    } finally {
      loading.value = false;
    }
  }

  // ============================================
  // CIERRES DE CAJA
  // ============================================

  /**
   * Abrir caja
   */
  async function abrirCaja(montoInicial: number, usuarioId?: string) {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('cierres_caja')
        .insert({
          usuario_id: usuarioId,
          fecha_apertura: new Date().toISOString(),
          monto_inicial: montoInicial,
          estado: 'abierto'
        })
        .select()
        .single();

      if (err) throw err;
      return data as CierreCaja;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error abriendo caja:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Cerrar caja
   */
  async function cerrarCaja(cierreId: string, montoFinal: number, notas?: string) {
    loading.value = true;
    error.value = null;
    try {
      // Calcular totales de ventas del período
      const { data: cierre } = await supabase
        .from('cierres_caja')
        .select('fecha_apertura')
        .eq('id', cierreId)
        .single();

      if (!cierre) throw new Error('Cierre no encontrado');

      // Obtener ventas del período
      const { data: ventas } = await supabase
        .from('ventas')
        .select('total, tipo_pago')
        .gte('fecha', cierre.fecha_apertura)
        .eq('estado', 'completada');

      const totalVentas = ventas?.reduce((sum, v) => sum + v.total, 0) || 0;
      const totalEfectivo = ventas?.filter(v => v.tipo_pago === 'efectivo').reduce((sum, v) => sum + v.total, 0) || 0;
      const totalTarjeta = ventas?.filter(v => v.tipo_pago === 'tarjeta').reduce((sum, v) => sum + v.total, 0) || 0;

      // Actualizar cierre
      const { data, error: err } = await supabase
        .from('cierres_caja')
        .update({
          fecha_cierre: new Date().toISOString(),
          monto_final: montoFinal,
          total_ventas: totalVentas,
          total_efectivo: totalEfectivo,
          total_tarjeta: totalTarjeta,
          diferencia: montoFinal - totalEfectivo,
          estado: 'cerrado',
          notas
        })
        .eq('id', cierreId)
        .select()
        .single();

      if (err) throw err;
      return data as CierreCaja;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error cerrando caja:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  /**
   * Obtener caja abierta actual
   */
  async function obtenerCajaAbierta() {
    loading.value = true;
    error.value = null;
    try {
      const { data, error: err } = await supabase
        .from('cierres_caja')
        .select('*')
        .eq('estado', 'abierto')
        .order('fecha_apertura', { ascending: false })
        .limit(1)
        .single();

      if (err && err.code !== 'PGRST116') throw err; // PGRST116 = no rows returned
      return data as CierreCaja | null;
    } catch (err: any) {
      error.value = err.message;
      console.error('Error obteniendo caja abierta:', err);
      return null;
    } finally {
      loading.value = false;
    }
  }

  // ============================================
  // UTILIDADES
  // ============================================

  const isConnected = computed(() => !!supabase);
  const isConfigured = computed(() => !!supabaseAnonKey);

  return {
    // Cliente
    supabase,
    loading,
    error,
    isConnected,
    isConfigured,

    // Productos
    obtenerProductos,
    buscarProducto,
    guardarProducto,
    productosaBajoStock,

    // Ventas
    crearVenta,
    obtenerVentasHoy,
    obtenerDetallesVenta,

    // Clientes
    obtenerClientes,
    buscarCliente,

    // Cierres de Caja
    abrirCaja,
    cerrarCaja,
    obtenerCajaAbierta
  };
}

export default useSupabase;
