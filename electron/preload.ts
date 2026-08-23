import { contextBridge, ipcRenderer } from 'electron'

const GLOBAL_TABLES = new Set(['usuarios', 'bancos', 'banco_transacciones'])
const ONLINE_ONLY_LOCAL_TABLES = new Set([
  'usuarios',
  'empresa',
  'tmcloud_config',
  'licencia',
  'otp_local_config',
  'impresoras_config',
])
const ONLINE_ONLY_LOCAL_CHANNELS = new Set([
  'getServerUrl',
  'generate:pdf',
  'getPrinters',
  'scan:bluetooth',
  // El OTP de eliminacion vive en memoria en el proceso principal y su envio
  // usa /otp/send. No es una accion de tabla ni debe pasar por /runtime.
  'facturas:solicitarOtpEliminar',
  'facturas:confirmarOtpEliminar',
])
const LOCAL_SCHEMA_ACTIONS = new Set([
  'tableExists', 'getTableColumns', 'crearTabla', 'addColumnToTable',
  'eliminarTabla', 'getAllTables',
])
const ONLINE_ONLY_LOCAL_PREFIXES = [
  'tmcloud:', 'licencia:', 'otp-local:', 'print:', 'printer:', 'pdf:', 'save:',
  'clipboard:', 'openai:', 'imei:', 'app:', 'update:',
  'empresa-local:', 'correo-local:', 'backup:', 'enviar:',
]

function isOnlineLocalTable(tabla: unknown) {
  return ONLINE_ONLY_LOCAL_TABLES.has(String(tabla || '').toLowerCase())
}

function isOnlineLocalChannel(channel: string) {
  return ONLINE_ONLY_LOCAL_CHANNELS.has(channel) || ONLINE_ONLY_LOCAL_PREFIXES.some(prefix => channel.startsWith(prefix))
}

function onlineDbAction(channel: string, args: unknown[]) {
  const tabla = String(args[0] || '')
  if (channel === 'db:getAll') return { action: 'db/getAll', data: { tabla } }
  if (channel === 'db:getWhere') return { action: 'db/getWhere', data: { tabla, where: args[1] || '', params: args[2] || [] } }
  if (channel === 'db:getModified') return { action: 'db/getModified', data: { tabla, desde: args[1] || '' } }
  if (channel === 'db:getById') return { action: 'db/getById', data: { tabla, id: args[1] } }
  if (channel === 'db:insert') return { action: 'db/insert', data: { tabla, data: args[1] || {}, usuario: getUsuario() } }
  if (channel === 'db:update') return { action: 'db/update', data: { tabla, id: args[1], data: args[2] || {}, usuario: getUsuario() } }
  if (channel === 'db:delete') return { action: 'db/delete', data: { tabla, id: args[1], usuario: getUsuario() } }
  return null
}

function withTableAlmacen(tabla: unknown, data: Record<string, unknown>) {
  return GLOBAL_TABLES.has(String(tabla || '').toLowerCase()) ? data : withAlmacen(data)
}

contextBridge.exposeInMainWorld('electron', {
  invoke: (channel: string, ...args: unknown[]) => {
    if (channel === 'db:insert' && args[1] && typeof args[1] === 'object') args[1] = withTableAlmacen(args[0], args[1] as Record<string, unknown>)
    if (channel === 'caja:abrirTurno' && args[0] && typeof args[0] === 'object') args[0] = withAlmacen(args[0] as Record<string, unknown>)
    if ((channel === 'cuadre:realizar' || channel === 'precio:registrarHistorial') && args[0] && typeof args[0] === 'object') args[0] = withAlmacen(args[0] as Record<string, unknown>)
    if ((channel === 'caja:getTurnoActivo' || channel === 'caja:getTurnoAbierto') && !args[0]) args[0] = getAlmacenContext().almacen_uid
    if ((channel === 'cuadre:listar' || channel === 'cuadre:ventasTurno' || channel === 'cuadre:gastosTurno') && !args[0]) args[0] = getAlmacenContext().almacen_uid
    if (channel === 'consultaservidor' && args[0] === 'executeSQL') {
      args.push({ __supportContext: true, userId: Number(localStorage.getItem('mr_user_id') || 0), usuario: getUsuario() })
    }
    const dbAction = channel.startsWith('db:') ? onlineDbAction(channel, args) : null
    if (dbAction && !isOnlineLocalTable(args[0])) return ipcRenderer.invoke('online:runtime', dbAction.action, dbAction.data)
    if (channel === 'consultaservidor' && args[0] !== 'getAllConfig' && !LOCAL_SCHEMA_ACTIONS.has(String(args[0] || ''))) {
      return ipcRenderer.invoke('online:runtime', 'invoke', { channel, args })
    }
    if (!channel.startsWith('db:') && channel !== 'consultaservidor' && !isOnlineLocalChannel(channel)) {
      return ipcRenderer.invoke('online:runtime', 'invoke', { channel, args })
    }
    return ipcRenderer.invoke(channel, ...args)
  },
  send: (channel: string, ...args: unknown[]) => ipcRenderer.send(channel, ...args),
  on: (channel: string, callback: (...args: unknown[]) => void) => {
    ipcRenderer.on(channel, (_event, ...args) => callback(...args))
  },
})

function getUsuario() {
  try { return localStorage.getItem('mr_user_usuario') || '' } catch { return '' }
}

function getAlmacenContext() {
  try {
    return {
      almacen_id: Number(localStorage.getItem('almacen_id') || localStorage.getItem('almacen_default_id') || 0),
      almacen_uid: localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || '',
    }
  } catch {
    return { almacen_id: 0, almacen_uid: '' }
  }
}

function withAlmacen(data: Record<string, unknown>) {
  const context = getAlmacenContext()
  return {
    almacen_id: context.almacen_id,
    almacen_uid: context.almacen_uid,
    ...data,
  }
}

contextBridge.exposeInMainWorld('db', {
  getPath: () => ipcRenderer.invoke('db:getPath'),
  getAll: (tabla: string) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:getAll', tabla) : ipcRenderer.invoke('online:runtime', 'db/getAll', { tabla }),
  getWhere: (tabla: string, where: string, params: unknown[] = []) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:getWhere', tabla, where, params) : ipcRenderer.invoke('online:runtime', 'db/getWhere', { tabla, where, params }),
  getModified: (tabla: string, desde: string) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:getModified', tabla, desde) : ipcRenderer.invoke('online:runtime', 'db/getModified', { tabla, desde }),
  getById: (tabla: string, id: number) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:getById', tabla, id) : ipcRenderer.invoke('online:runtime', 'db/getById', { tabla, id }),
  insert: (tabla: string, data: Record<string, unknown>) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:insert', tabla, data, getUsuario()) : ipcRenderer.invoke('online:runtime', 'db/insert', { tabla, data: withTableAlmacen(tabla, data), usuario: getUsuario() }),
  update: (tabla: string, id: number, data: Record<string, unknown>) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:update', tabla, id, data, getUsuario()) : ipcRenderer.invoke('online:runtime', 'db/update', { tabla, id, data, usuario: getUsuario() }),
  delete: (tabla: string, id: number) => isOnlineLocalTable(tabla) ? ipcRenderer.invoke('db:delete', tabla, id, getUsuario()) : ipcRenderer.invoke('online:runtime', 'db/delete', { tabla, id, usuario: getUsuario() }),
  bitacoraList: (limite?: number) => ipcRenderer.invoke('online:runtime', 'db/bitacoraList', { limite }),
  bitacoraDeleteAll: () => ipcRenderer.invoke('online:runtime', 'db/bitacoraDeleteAll', {}),
})

contextBridge.exposeInMainWorld('config', {
  get: (clave: string) => ipcRenderer.invoke('config:get', clave),
  set: (clave: string, valor: string) => ipcRenderer.invoke('config:set', clave, valor, 'general', getUsuario()),
})
