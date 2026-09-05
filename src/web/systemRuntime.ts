type ApiResult = { success?: boolean; data?: any; error?: string; [key: string]: any }

let csrf = ''
let projectBase = ''
let systemPath = '/sistema'
const cache = new Map<string, { at: number; value: any }>()
const inflight = new Map<string, Promise<any>>()
const READ_CACHE_MS = 1200

function clone<T>(value: T): T {
  return typeof structuredClone === 'function' ? structuredClone(value) : JSON.parse(JSON.stringify(value))
}

function invalidate(table?: string) {
  if (!table) { cache.clear(); return }
  for (const key of cache.keys()) if (key.includes(`"tabla":"${table}"`)) cache.delete(key)
}

async function runtime(action: string, data: Record<string, any> = {}, timeoutMs = 25000): Promise<any> {
  const isRead = ['db/getAll', 'db/getWhere', 'db/getModified', 'db/getById', 'db/bitacoraList', 'config/get'].includes(action)
  const key = isRead ? `${action}:${JSON.stringify(data)}` : ''
  const cached = key ? cache.get(key) : undefined
  if (cached && Date.now() - cached.at < READ_CACHE_MS) return clone(cached.value)
  if (key && inflight.has(key)) return clone(await inflight.get(key))
  const request = (async () => {
    const controller = new AbortController()
    const timeout = setTimeout(() => controller.abort(), timeoutMs)
    try {
      const response = await fetch(`${projectBase}/runtime`, {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrf },
        body: JSON.stringify({ action, data }),
        signal: controller.signal,
      })
      const value = await response.json().catch(() => ({}))
      if (response.status === 401) {
        location.assign(`${systemPath}/login`)
        throw new Error('La sesion expiro.')
      }
      if (!response.ok) throw new Error(value.error || value.message || `HTTP ${response.status}`)
      if (key) cache.set(key, { at: Date.now(), value })
      return value
    } finally { clearTimeout(timeout) }
  })()
  if (key) inflight.set(key, request)
  try { return clone(await request) } finally { if (key) inflight.delete(key) }
}

function browserPrint(html: string) {
  const popup = window.open('', '_blank', 'width=520,height=820')
  if (!popup) throw new Error('Permite las ventanas emergentes para imprimir.')
  popup.document.write(html)
  popup.document.close()
  popup.focus()
  setTimeout(() => popup.print(), 350)
}

function saveDataUrl(dataUrl: string, name: string) {
  const link = document.createElement('a')
  link.href = dataUrl
  link.download = name || 'documento.pdf'
  link.click()
}

function installProjectLocalStorage(projectUid: string) {
  const nativeStorage = window.localStorage
  const prefix = `tmpos-project:${projectUid}:`
  const scoped: Storage = {
    get length() {
      let count = 0
      for (let index = 0; index < nativeStorage.length; index++) {
        if (nativeStorage.key(index)?.startsWith(prefix)) count++
      }
      return count
    },
    key(index: number) {
      const keys: string[] = []
      for (let position = 0; position < nativeStorage.length; position++) {
        const key = nativeStorage.key(position)
        if (key?.startsWith(prefix)) keys.push(key.slice(prefix.length))
      }
      return keys[index] ?? null
    },
    getItem(key: string) { return nativeStorage.getItem(prefix + key) },
    setItem(key: string, value: string) { nativeStorage.setItem(prefix + key, String(value)) },
    removeItem(key: string) { nativeStorage.removeItem(prefix + key) },
    clear() {
      const keys: string[] = []
      for (let index = 0; index < nativeStorage.length; index++) {
        const key = nativeStorage.key(index)
        if (key?.startsWith(prefix)) keys.push(key)
      }
      keys.forEach(key => nativeStorage.removeItem(key))
    },
  }
  Object.defineProperty(window, 'localStorage', { configurable: true, value: scoped })
}

export async function initSystemRuntime(): Promise<void> {
  const match = window.location.pathname.match(/\/sistema\/([^/]+)\/?$/)
  if (!match) throw new Error('La URL no contiene un proyecto valido.')
  const projectSlug = encodeURIComponent(decodeURIComponent(match[1]))
  systemPath = `/sistema/${projectSlug}`
  projectBase = `/api/system/${projectSlug}`
  const response = await fetch(`${projectBase}/session`, { credentials: 'same-origin', cache: 'no-store' })
  if (response.status === 401) { location.assign(`${systemPath}/login`); return }
  const session = await response.json()
  if (!response.ok || !session?.data?.csrf) throw new Error(session?.error || 'No se pudo abrir la empresa.')
  csrf = session.data.csrf
  ;(window as any).__systemProjectCsrf = csrf
  ;(window as any).__systemProjectStorageBase = `${projectBase}/storage`

  const currentProject = String(session.data.project.uid || '')
  ;(window as any).__systemProjectApiBase = `${location.origin}/api/${encodeURIComponent(currentProject)}`
  installProjectLocalStorage(currentProject)
  sessionStorage.setItem('tmpos_web_project', currentProject)
  localStorage.setItem('tmpos_web_project_name', String(session.data.project.name || ''))
  if (session.data.user?.id) {
    localStorage.setItem('mr_user_id', String(session.data.user.id))
    localStorage.setItem('mr_user_usuario', String(session.data.user.usuario || session.data.user.email || session.data.user.nombre || ''))
    sessionStorage.setItem('mr_session_authenticated', '1')
  }

  const actor = () => localStorage.getItem('mr_user_usuario') || ''
  const db: any = {
    getAll: (tabla: string) => runtime('db/getAll', { tabla }),
    getCuadres: (options: Record<string, any> = {}) => runtime('cuadres/listar', options),
    getWhere: (tabla: string, where: string, params: any[] = []) => runtime('db/getWhere', { tabla, where, params }),
    getModified: (tabla: string, desde: string) => runtime('db/getModified', { tabla, desde }),
    getById: (tabla: string, id: number) => runtime('db/getById', { tabla, id }),
    insert: async (tabla: string, data: any) => { const value = await runtime('db/insert', { tabla, data, usuario: actor() }); invalidate(tabla); return value },
    update: async (tabla: string, id: number, data: any) => { const value = await runtime('db/update', { tabla, id, data, usuario: actor() }); invalidate(tabla); return value },
    delete: async (tabla: string, id: number) => { const value = await runtime('db/delete', { tabla, id, usuario: actor() }); invalidate(tabla); return value },
    bitacoraList: (limite?: number) => runtime('db/bitacoraList', { limite }),
    bitacoraDeleteAll: () => runtime('db/bitacoraDeleteAll'),
  }
  const config = {
    get: (clave: string) => runtime('config/get', { clave }),
    set: (clave: string, valor: string, categoria = 'general') => runtime('config/set', { clave, valor, categoria }),
  }
  ;(window as any).db = db
  ;(window as any).config = config
  ;(window as any).electron = {
    invoke: async (channel: string, ...args: any[]): Promise<ApiResult | any> => {
      if (channel === 'db:getAll') return db.getAll(args[0])
      if (channel === 'db:getWhere') return db.getWhere(args[0], args[1], args[2] || [])
      if (channel === 'db:getModified') return db.getModified(args[0], args[1] || '')
      if (channel === 'db:getById') return db.getById(args[0], args[1])
      if (channel === 'db:insert') return db.insert(args[0], args[1] || {})
      if (channel === 'db:insertCloud') return db.insert(args[0], args[1] || {})
      if (channel === 'db:update') return db.update(args[0], args[1], args[2] || {})
      if (channel === 'db:updateCloud') return db.update(args[0], args[1], args[2] || {})
      if (channel === 'db:delete') return db.delete(args[0], args[1])
      if (channel === 'config:get') return config.get(args[0])
      if (channel === 'config:set') return config.set(args[0], args[1], args[2])
      if (channel === 'getServerUrl') return { success: true, url: location.origin }
      if (channel === 'tmcloud:getConfig') return { success: true, data: { enabled: false, mode: 'online', project_uid: currentProject } }
      if (channel === 'print:ticket') { browserPrint(String(args[0] || '')); return { success: true } }
      if (channel === 'generate:pdf') { browserPrint(String(args[0] || '')); return { success: true } }
      if (channel === 'save:pdf' && args[0]) { saveDataUrl(String(args[0]), String(args[1] || 'documento.pdf')); return { success: true } }
      if (channel === 'pdf:generateToFile') { browserPrint(String(args[0] || '')); return { success: true, filePath: '' } }
      if (channel === 'clipboard:copyFile') return { success: false, error: 'El navegador no permite copiar archivos locales directamente.' }
      if (channel.startsWith('openai:') || channel === 'imei:consultar' || channel.startsWith('otp-local:')) {
        const { handleElectronInvoke } = await import('@/capacitor/capacitorElectron')
        return handleElectronInvoke(channel, ...args)
      }
      const result = await runtime('invoke', { channel, args }, 45000)
      if (!channel.startsWith('db:get') && channel !== 'config:get') invalidate()
      return result
    },
    send: () => {},
    on: () => {},
  }
  ;(window as any).__isElectron = false
  ;(window as any).__isCapacitor = false
  ;(window as any).__isNetworkClient = true
  ;(window as any).__isServerSystem = true
}
