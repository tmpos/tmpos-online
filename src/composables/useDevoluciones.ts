import { reactive } from 'vue'

export interface DevolucionItem {
  facturaId: number
  noFactura: string
  producto: any
  cantidad: number
  motivo: string
  fecha: string
}

function normalizarListaIds(value: any): number[] {
  const lista = Array.isArray(value) ? value : (value ? String(value).split(',') : [])
  return lista
    .map((id: any) => Number(id))
    .filter((id: number) => Number.isFinite(id) && id > 0)
}

function normalizarListaTextos(value: any): string[] {
  const lista = Array.isArray(value) ? value : (value ? String(value).split(',') : [])
  return lista
    .map((texto: any) => String(texto || '').replace(/^IMEI:\s*/i, '').replace(/^Serial:\s*/i, '').trim())
    .filter(Boolean)
}

async function devolverImeis(producto: any) {
  const ids = normalizarListaIds(producto.imei_ids || producto.imei_id)
  const nombres = normalizarListaTextos(producto.imeis || producto.imei)
  const idsProcesados = new Set<number>()

  for (const id of ids) {
    if (idsProcesados.has(id)) continue
    idsProcesados.add(id)
    await window.db.update('imei', id, {
      estado: 'DISPONIBLE', comprador: '', no_factura: '',
      precio_vendido: 0, fecha_venta: '', hora_venta: '',
    })
  }

  const nombresPendientes = nombres.filter(Boolean)
  if (nombresPendientes.length === 0) return

  const imeiRes = await window.db.getAll('imei')
  if (!imeiRes.success) return

  for (const nombre of nombresPendientes) {
    const imei = (imeiRes.data || []).find((i: any) => String(i.nombre || '').trim() === nombre)
    const id = Number(imei?.id || 0)
    if (!id || idsProcesados.has(id)) continue
    idsProcesados.add(id)
    await window.db.update('imei', id, {
      estado: 'DISPONIBLE', comprador: '', no_factura: '',
      precio_vendido: 0, fecha_venta: '', hora_venta: '',
    })
  }
}

async function devolverSeriales(producto: any) {
  const ids = normalizarListaIds(producto.serial_ids || producto.serial_id)
  const nombres = normalizarListaTextos(producto.seriales || producto.serial)
  const idsProcesados = new Set<number>()

  for (const id of ids) {
    if (idsProcesados.has(id)) continue
    idsProcesados.add(id)
    await window.db.update('serial', id, {
      estado: 'DISPONIBLE', comprador: '', no_factura: '',
      precio_vendido: 0, fecha_venta: '', hora_venta: '',
    })
  }

  const nombresPendientes = nombres.filter(Boolean)
  if (nombresPendientes.length === 0) return

  const serialRes = await window.db.getAll('serial')
  if (!serialRes.success) return

  for (const nombre of nombresPendientes) {
    const serial = (serialRes.data || []).find((s: any) => String(s.nombre || '').trim() === nombre)
    const id = Number(serial?.id || 0)
    if (!id || idsProcesados.has(id)) continue
    idsProcesados.add(id)
    await window.db.update('serial', id, {
      estado: 'DISPONIBLE', comprador: '', no_factura: '',
      precio_vendido: 0, fecha_venta: '', hora_venta: '',
    })
  }
}

/** Restaura el inventario de los productos contenidos en una factura. */
export async function reintegrarInventarioFactura(productosFactura: any): Promise<void> {
  let productos = productosFactura
  if (typeof productos === 'string') {
    try { productos = JSON.parse(productos || '[]') } catch { productos = [] }
  }
  if (!Array.isArray(productos)) return

  const accesoriosRes = await window.db.getAll('accesorios')
  const accesorios = accesoriosRes.success ? accesoriosRes.data || [] : []
  const cantidadesAccesorios = new Map<number, number>()

  for (const producto of productos) {
    const tipo = String(producto?.tipo || producto?._tipo || '').toLowerCase()
    if ((tipo === 'imei' || producto?.imei_id || producto?.imei_ids?.length) && (producto?.imei_id || producto?.imei_ids?.length || producto?.imei || producto?.imeis?.length)) {
      await devolverImeis(producto)
      continue
    }
    if ((tipo === 'serial' || producto?.serial_id || producto?.serial_ids?.length) && (producto?.serial_id || producto?.serial_ids?.length || producto?.serial || producto?.seriales?.length)) {
      await devolverSeriales(producto)
      continue
    }

    const esAccesorio = tipo === 'accesorio' || tipo === 'accesorios' || producto?.accesorio_id
    if (!esAccesorio) continue
    const idDirecto = Number(producto?.accesorio_id || 0)
    const codigo = String(producto?.codigo_barra || producto?.codigo || producto?.sku || '').trim()
    const nombre = String(producto?.nombre || producto?.descripcion || '').trim().toLowerCase()
    const accesorio = accesorios.find((a: any) => Number(a.id) === idDirecto) || accesorios.find((a: any) =>
      (codigo && [a.codigo_barra, a.codigo, a.sku].some((valor) => String(valor || '').trim() === codigo)) ||
      (nombre && String(a.nombre || '').trim().toLowerCase() === nombre)
    )
    if (!accesorio?.id) continue
    const cantidad = Math.max(1, Number(producto?.cantidad || 1))
    cantidadesAccesorios.set(Number(accesorio.id), (cantidadesAccesorios.get(Number(accesorio.id)) || 0) + cantidad)
  }

  for (const [id, cantidad] of cantidadesAccesorios) {
    const accesorio = accesorios.find((a: any) => Number(a.id) === id)
    if (!accesorio) continue
    const resultado = await window.db.update('accesorios', id, {
      cantidad: Number(accesorio.cantidad || 0) + cantidad,
    })
    if (!resultado.success) throw new Error(resultado.error || `No se pudo restaurar el accesorio ${accesorio.nombre || id}`)
  }
}

export function useDevoluciones() {
  const state = reactive({
    dialogDevolucion: false as boolean,
    facturaDevolucion: null as any,
    productosDevolucion: [] as any[],
    devolucionSeleccion: [] as any[],
    motivoDevolucion: '' as string,
    cargandoDevolucion: false as boolean,
    resultadoDevolucion: null as string | null,
    facturasDisponibles: [] as any[],
    busquedaFactura: '' as string,
    cargandoFacturas: false as boolean,
  })

  function facturasFiltradas() {
    const texto = state.busquedaFactura.toLowerCase().trim()
    if (!texto) return state.facturasDisponibles
    return state.facturasDisponibles.filter((f: any) =>
      String(f.no_factura || '').toLowerCase().includes(texto) ||
      String(f.nombre_cliente || '').toLowerCase().includes(texto) ||
      String(f.ncf || '').toLowerCase().includes(texto)
    )
  }

  async function cargarFacturas() {
    state.cargandoFacturas = true
    try {
      const res = await window.db.getAll('facturas')
      if (res.success) {
        state.facturasDisponibles = (res.data || [])
          .filter((f: any) => f.tipo_factura === 'FACTURA_VENTA')
          .sort((a: any, b: any) => {
            const da = new Date(a.fecha_emision || a.created_at || 0).getTime()
            const db = new Date(b.fecha_emision || b.created_at || 0).getTime()
            return db - da
          })
      }
    } catch {} finally {
      state.cargandoFacturas = false
    }
  }

  function seleccionarFactura(factura: any) {
    state.facturaDevolucion = factura
    const productos = typeof factura.productos === 'string'
      ? JSON.parse(factura.productos || '[]')
      : (factura.productos || [])
    state.productosDevolucion = productos.map((p: any) => ({ ...p, _devolver: false }))
    state.devolucionSeleccion = []
    state.busquedaFactura = ''
  }

  function volverALista() {
    state.facturaDevolucion = null
    state.productosDevolucion = []
    state.devolucionSeleccion = []
    state.motivoDevolucion = ''
  }

  async function buscarFacturaParaDevolucion(noFactura: string) {
    state.cargandoDevolucion = true
    state.resultadoDevolucion = null
    try {
      const res = await window.db.getAll('facturas')
      if (res.success) {
        const factura = (res.data || []).find((f: any) =>
          String(f.no_factura || '') === String(noFactura) &&
          f.tipo_factura === 'FACTURA_VENTA'
        )
        if (factura) {
          seleccionarFactura(factura)
        } else {
          state.resultadoDevolucion = 'Factura no encontrada o no es de tipo venta'
        }
      }
    } catch {
      state.resultadoDevolucion = 'Error al buscar factura'
    } finally {
      state.cargandoDevolucion = false
    }
  }

  function toggleDevolucionProducto(producto: any) {
    producto._devolver = !producto._devolver
    state.devolucionSeleccion = state.productosDevolucion.filter((p: any) => p._devolver)
  }

  function todosProductosSeleccionados() {
    return state.productosDevolucion.length > 0 && state.productosDevolucion.every((p: any) => p._devolver)
  }

  function algunosProductosSeleccionados() {
    return state.productosDevolucion.some((p: any) => p._devolver) && !todosProductosSeleccionados()
  }

  function seleccionarTodosProductos(seleccionar: boolean) {
    state.productosDevolucion.forEach((p: any) => {
      p._devolver = seleccionar
    })
    state.devolucionSeleccion = state.productosDevolucion.filter((p: any) => p._devolver)
  }

  async function procesarDevolucion(): Promise<boolean> {
    if (!state.facturaDevolucion || state.devolucionSeleccion.length === 0) return false
    if (!state.motivoDevolucion.trim()) return false

    state.cargandoDevolucion = true
    try {
      const factura = state.facturaDevolucion
      const ahora = new Date()
      const fechaStr = ahora.toISOString().split('T')[0]
      const horaStr = `${String(ahora.getHours()).padStart(2, '0')}:${String(ahora.getMinutes()).padStart(2, '0')}`
      const noNC = `NC-${fechaStr}-${String(ahora.getSeconds()).padStart(2, '0')}`

      const productosDevueltos = state.devolucionSeleccion.map((p: any) => ({
        ...p,
        motivo: state.motivoDevolucion,
        fecha_devolucion: fechaStr,
      }))

      const totalDevuelto = productosDevueltos.reduce(
        (s: number, p: any) => s + (Number(p.precio || 0) * Number(p.cantidad || 1)), 0
      )

      const notaCreditoData = {
        no_factura: noNC,
        tipo_factura: 'NOTA_CREDITO',
        estado_factura: 'PENDIENTE',
        fecha_emision: fechaStr,
        hora: horaStr,
        cod_cliente: factura.cod_cliente || '',
        nombre_cliente: factura.nombre_cliente || 'CONSUMIDOR FINAL',
        telefono_cliente: factura.telefono_cliente || '',
        total: totalDevuelto,
        subtotal: totalDevuelto,
        productos: JSON.stringify(productosDevueltos),
        nota: `DEVOLUCION: ${factura.no_factura} | ${state.motivoDevolucion}`,
        metodo_pago: 'NOTA_CREDITO',
        almacen_id: factura.almacen_id || 0,
        almacen_uid: factura.almacen_uid || '',
        usuario: 'POS',
      }

      const resNC = await window.db.insert('facturas', notaCreditoData)
      if (!resNC.success) {
        state.resultadoDevolucion = 'Error al crear nota de crédito'
        return false
      }

      await reintegrarInventarioFactura(productosDevueltos)

      state.resultadoDevolucion = `NC ${noNC} creada por RD$ ${totalDevuelto.toFixed(2)}`
      state.dialogDevolucion = false
      return true
    } catch (e: any) {
      state.resultadoDevolucion = `Error: ${e.message}`
      return false
    } finally {
      state.cargandoDevolucion = false
    }
  }

  function cerrarDevolucion() {
    state.dialogDevolucion = false
    state.facturaDevolucion = null
    state.productosDevolucion = []
    state.devolucionSeleccion = []
    state.motivoDevolucion = ''
    state.resultadoDevolucion = null
    state.busquedaFactura = ''
  }

  return {
    state,
    facturasFiltradas,
    cargarFacturas,
    seleccionarFactura,
    volverALista,
    buscarFacturaParaDevolucion,
    toggleDevolucionProducto,
    todosProductosSeleccionados,
    algunosProductosSeleccionados,
    seleccionarTodosProductos,
    procesarDevolucion,
    cerrarDevolucion,
  }
}
