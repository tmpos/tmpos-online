export type UserPermissionGroup =
  | 'General'
  | 'Ventas'
  | 'Inventario'
  | 'Taller'
  | 'Contactos'
  | 'Contabilidad'
  | 'Reportes'
  | 'Configuracion'
  | 'Acciones sensibles'

export interface UserPermissionOption {
  label: string
  key: string
  grupo: UserPermissionGroup
}

export const USER_PERMISSION_GROUPS: UserPermissionGroup[] = [
  'General',
  'Ventas',
  'Inventario',
  'Taller',
  'Contactos',
  'Contabilidad',
  'Reportes',
  'Configuracion',
  'Acciones sensibles',
]

export const USER_PERMISSION_OPTIONS: UserPermissionOption[] = [
  { label: 'Inicio', key: 'home', grupo: 'General' },
  { label: 'Vender', key: 'vender', grupo: 'Ventas' },
  { label: 'Inventario', key: 'inventario', grupo: 'Inventario' },
  { label: 'Telefonos', key: 'telefonos', grupo: 'Inventario' },
  { label: 'Accesorios', key: 'accesorios', grupo: 'Inventario' },
  { label: 'Electrodomesticos', key: 'electrodomesticos', grupo: 'Inventario' },
  { label: 'IMEI', key: 'imei', grupo: 'Inventario' },
  { label: 'Serial', key: 'serial', grupo: 'Inventario' },
  { label: 'Categorias', key: 'categorias', grupo: 'Inventario' },
  { label: 'Marcas', key: 'marcas', grupo: 'Inventario' },
  { label: 'Colores', key: 'colores', grupo: 'Inventario' },
  { label: 'Capacidades', key: 'capacidades', grupo: 'Inventario' },
  { label: 'Etiquetas', key: 'etiquetas', grupo: 'Inventario' },
  { label: 'Cambiazo', key: 'cambiazo', grupo: 'Inventario' },
  { label: 'Transferencias', key: 'transferencias', grupo: 'Inventario' },
  { label: 'Reporte Inventario', key: 'reporte', grupo: 'Inventario' },
  { label: 'Perdidas', key: 'perdidas', grupo: 'Inventario' },
  { label: 'Taller', key: 'taller', grupo: 'Taller' },
  { label: 'Ordenes', key: 'ordenes', grupo: 'Taller' },
  { label: 'Orden Express', key: 'orden-express', grupo: 'Taller' },
  { label: 'Piezas', key: 'piezas', grupo: 'Taller' },
  { label: 'Tecnicos', key: 'tecnicos', grupo: 'Taller' },
  { label: 'Garantias', key: 'garantias', grupo: 'Taller' },
  { label: 'Reporte Taller', key: 'reporte', grupo: 'Taller' },
  { label: 'Contactos', key: 'contactos', grupo: 'Contactos' },
  { label: 'Clientes', key: 'clientes', grupo: 'Contactos' },
  { label: 'Usuarios', key: 'usuarios', grupo: 'Contactos' },
  { label: 'Proveedores', key: 'proveedores', grupo: 'Contactos' },
  { label: 'Contabilidad', key: 'contabilidad', grupo: 'Contabilidad' },
  { label: 'Caja', key: 'caja', grupo: 'Contabilidad' },
  { label: 'Comprar', key: 'comprar', grupo: 'Contabilidad' },
  { label: 'Cuadre', key: 'cuadre', grupo: 'Contabilidad' },
  { label: 'CxC', key: 'cxc', grupo: 'Contabilidad' },
  { label: 'CxP', key: 'cxp', grupo: 'Contabilidad' },
  { label: 'Bancos', key: 'bancos', grupo: 'Contabilidad' },
  { label: 'Gastos', key: 'gastos', grupo: 'Contabilidad' },
  { label: 'Gastos Fijos', key: 'gastos-fijos', grupo: 'Contabilidad' },
  { label: 'Utilidades', key: 'utilidades', grupo: 'Contabilidad' },
  { label: 'Catalogo Cuentas', key: 'catalogo', grupo: 'Contabilidad' },
  { label: 'Balance General', key: 'balance', grupo: 'Contabilidad' },
  { label: 'Comprobantes', key: 'comprobantes', grupo: 'Contabilidad' },
  { label: 'Notas Credito e-CF', key: 'notas-credito-ecf', grupo: 'Contabilidad' },
  { label: 'Ventas', key: 'ventas', grupo: 'Ventas' },
  { label: 'Facturas', key: 'facturas', grupo: 'Ventas' },
  { label: 'Cotizaciones', key: 'cotizaciones', grupo: 'Ventas' },
  { label: 'Apartados', key: 'apartados', grupo: 'Ventas' },
  { label: 'Recibidos', key: 'recibidos', grupo: 'Ventas' },
  { label: 'Notas Credito', key: 'notas-credito', grupo: 'Ventas' },
  { label: 'Notas Admin', key: 'notas', grupo: 'Ventas' },
  { label: 'Reportes', key: 'reportes', grupo: 'Reportes' },
  { label: 'Reporte General', key: 'general', grupo: 'Reportes' },
  { label: 'Reporte 606', key: '606', grupo: 'Reportes' },
  { label: 'Reporte 607', key: '607', grupo: 'Reportes' },
  { label: 'Reporte Gastos', key: 'gastos', grupo: 'Reportes' },
  { label: 'Reporte Ventas', key: 'ventas', grupo: 'Reportes' },
  { label: 'Reporte Ganancias', key: 'ganancias', grupo: 'Reportes' },
  { label: 'Configuracion', key: 'configuracion', grupo: 'Configuracion' },
  { label: 'Eliminar registros', key: 'accion_eliminar', grupo: 'Acciones sensibles' },
  { label: 'Modificar precios y costos', key: 'accion_precios', grupo: 'Acciones sensibles' },
  { label: 'Administrar usuarios', key: 'accion_usuarios', grupo: 'Acciones sensibles' },
  { label: 'Mover inventario entre almacenes', key: 'accion_trasladar', grupo: 'Acciones sensibles' },
  { label: 'Anular o editar facturas', key: 'accion_facturas', grupo: 'Acciones sensibles' },
]

export function getUserPermissionOptions(isGeneralStore: boolean): UserPermissionOption[] {
  return USER_PERMISSION_OPTIONS
    .filter(option => !isGeneralStore || !['telefonos', 'imei', 'cambiazo', 'recibidos'].includes(option.key))
    .map(option => option.key === 'accesorios' && isGeneralStore
      ? { ...option, label: 'Productos' }
      : option)
}

export function getDefaultUserPermissions(isGeneralStore: boolean): string[] {
  return [...new Set(getUserPermissionOptions(isGeneralStore).map(option => option.key))]
}

export function parseUserPermissions(value: unknown, defaults: string[] = []): string[] {
  if (value === null || value === undefined || value === '') return [...defaults]

  try {
    const parsed = typeof value === 'string' ? JSON.parse(value) : value
    if (!Array.isArray(parsed) || parsed.length === 0) return [...defaults]

    const permissions = parsed.flatMap((item: unknown) => {
      if (typeof item === 'string') return [item]
      if (!item || typeof item !== 'object' || (item as any).ver === false) return []
      const permission = (item as any).key || (item as any).permiso || (item as any).tabla || (item as any).modulo
      return permission ? [String(permission)] : []
    })

    return [...new Set(permissions)]
  } catch {
    return [...defaults]
  }
}
