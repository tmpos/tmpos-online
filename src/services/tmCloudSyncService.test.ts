import { describe, expect, it } from 'vitest'
import { findPhoneForImei, isConfirmedCloudDelete, shouldSkipOnlineOnlyRowPush, sortTablesByDependency } from './tmCloudSyncService'

describe('orden de descarga inicial de TM Cloud', () => {
  it('descarga las tablas esenciales y sus padres antes que las historicas', () => {
    const tables = [
      'whatsapp',
      'imei',
      'accesorios',
      'marcas',
      'categorias',
      'telefonos',
      'proveedores',
      'empresa',
      'clientes',
      'serial',
      'electrodomesticos',
    ]

    const ordered = sortTablesByDependency(tables, table => table)

    expect(ordered.indexOf('empresa')).toBeLessThan(ordered.indexOf('clientes'))
    expect(ordered.indexOf('proveedores')).toBeLessThan(ordered.indexOf('accesorios'))
    expect(ordered.indexOf('marcas')).toBeLessThan(ordered.indexOf('accesorios'))
    expect(ordered.indexOf('categorias')).toBeLessThan(ordered.indexOf('accesorios'))
    expect(ordered.indexOf('telefonos')).toBeLessThan(ordered.indexOf('imei'))
    expect(ordered.indexOf('electrodomesticos')).toBeLessThan(ordered.indexOf('serial'))
    expect(ordered.indexOf('imei')).toBeLessThan(ordered.indexOf('whatsapp'))
  })

  it('reconstruye la relacion de un IMEI por nombre dentro del mismo almacen', () => {
    const telefono = findPhoneForImei(
      { equipo: 'IPHONE 13 PROMAX', almacen_uid: 'almacen-a' },
      [
        { id: 1, uid: 'telefono-a', nombre: 'IPHONE 13 PROMAX', almacen_uid: 'almacen-a' },
        { id: 2, uid: 'telefono-b', nombre: 'IPHONE 13 PROMAX', almacen_uid: 'almacen-b' },
      ],
    )

    expect(telefono).toMatchObject({ id: 1, uid: 'telefono-a' })
  })

  it('solo propaga borrados marcados expresamente por una accion del usuario', () => {
    expect(isConfirmedCloudDelete({ tabla: 'usuarios', uid: 'usr-1' })).toBe(false)
    expect(isConfirmedCloudDelete({ tabla: 'usuarios', uid: 'usr-1', confirmado: 0 })).toBe(false)
    expect(isConfirmedCloudDelete({ tabla: 'usuarios', uid: 'usr-1', confirmado: 1 })).toBe(true)
  })

  it('envia usuarios locales a la API incluso en modo solo-online', () => {
    expect(shouldSkipOnlineOnlyRowPush('usuarios', true)).toBe(false)
    expect(shouldSkipOnlineOnlyRowPush('empresa', true)).toBe(false)
    expect(shouldSkipOnlineOnlyRowPush('clientes', true)).toBe(true)
    expect(shouldSkipOnlineOnlyRowPush('usuarios', false)).toBe(false)
  })
})
