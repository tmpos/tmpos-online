export interface TMCloudConfig {
  url: string
  key: string
  serviceKey: string
}

let currentConfig: TMCloudConfig | null = null
const SYSTEM_SESSION_KEY = '__tmpos_system_session__'

function getSystemProjectConfig(): TMCloudConfig | null {
  const url = String((window as any).__systemProjectApiBase || '').trim().replace(/\/+$/, '')
  if (!url) return null
  return { url, key: SYSTEM_SESSION_KEY, serviceKey: SYSTEM_SESSION_KEY }
}

function normalizeUrl(url: string): string {
  const value = url.trim().replace(/\/+$/, '')
  const match = value.match(/^(https?:\/\/.+?\/api\/prj_[A-Za-z0-9]+)/i)
  return match ? match[1] : value
}

function authHeaders(key: string, json = false): Record<string, string> {
  return {
    ...(key === SYSTEM_SESSION_KEY
      ? { 'X-CSRF-Token': String((window as any).__systemProjectCsrf || '') }
      : { Authorization: `Bearer ${key}` }),
    ...(json ? { 'Content-Type': 'application/json' } : {}),
  }
}

async function responseError(res: Response): Promise<string> {
  const body = await res.json().catch(() => null)
  return body?.error || body?.message || `HTTP ${res.status}: ${res.statusText}`
}

export async function loadConfig(): Promise<TMCloudConfig> {
  const systemConfig = getSystemProjectConfig()
  if (systemConfig) return systemConfig
  try {
    if ((window as any).electron?.invoke) {
      const res = await (window as any).electron.invoke('tmcloud:getConfig')
      if (res.success && res.data) {
        return {
          url: res.data.url || '',
          key: res.data.public_key || '',
          serviceKey: res.data.secret_key || '',
        }
      }
    }
  } catch (_e) { /* TM Cloud config not available yet. */ }
  return { url: '', key: '', serviceKey: '' }
}

async function loadRuntimeConfig(): Promise<TMCloudConfig> {
  try {
    if ((window as any).electron?.invoke) {
      const res = await (window as any).electron.invoke('tmcloud:getRuntimeConfig')
      if (res?.success && res?.data) {
        return {
          url: res.data.url || '',
          key: res.data.public_key || '',
          serviceKey: res.data.secret_key || '',
        }
      }
    }
  } catch (_e) { /* Usa el mecanismo normal en web/capacitor. */ }
  return loadConfig()
}

export function resetConfig() {
  currentConfig = null
}

export async function ensureConfigLoaded(force = false): Promise<TMCloudConfig | null> {
  if (!force && currentConfig?.url && (currentConfig.key || currentConfig.serviceKey)) return currentConfig
  const cfg = await loadRuntimeConfig()
  if (!cfg.url || (!cfg.key && !cfg.serviceKey)) return null
  currentConfig = {
    url: normalizeUrl(cfg.url),
    key: cfg.key.trim(),
    serviceKey: cfg.serviceKey.trim(),
  }
  return currentConfig
}

export async function saveConfig(url: string, key: string, serviceKey: string) {
  if (!(window as any).electron?.invoke) throw new Error('Electron no disponible')
  const normalized = normalizeUrl(url)
  const res = await (window as any).electron.invoke('tmcloud:saveConfig', {
    url: normalized,
    public_key: key.trim(),
    secret_key: serviceKey.trim(),
  })
  if (!res.success) throw new Error(res.error || 'No se pudo guardar configuracion de TM Cloud')
  const savedConfig = {
    url: res.data?.url || normalized,
    key: res.data?.public_key || key.trim(),
    serviceKey: res.data?.secret_key || serviceKey.trim(),
  }
  currentConfig = await loadRuntimeConfig()
  return savedConfig
}

export function init(config: { url: string; key: string; serviceKey?: string }) {
  const url = normalizeUrl(config.url)
  const key = config.key.trim()
  const serviceKey = (config.serviceKey || '').trim()
  if (!url || !key) throw new Error('URL del proyecto y Public Key requeridos')
  if (!/^https?:\/\//i.test(url)) throw new Error('La URL debe comenzar con http:// o https://')
  if (!/\/api\/prj_[A-Za-z0-9]+$/i.test(url)) {
    throw new Error('Usa la URL base del proyecto: https://dominio.com/api/prj_xxx')
  }
  currentConfig = { url, key, serviceKey }
}

export function getConfig() {
  return currentConfig
}

export function isConnected() {
  return currentConfig !== null
}

export function getRealtimeUrl(table?: string, event?: 'INSERT' | 'UPDATE' | 'DELETE'): string | null {
  if (!currentConfig?.url || !currentConfig.key) return null
  const params = new URLSearchParams({ apikey: currentConfig.key })
  if (table) params.set('table', table)
  if (event) params.set('event', event)
  return `${currentConfig.url}/realtime?${params.toString()}`
}

export function subscribeRealtime(
  onChange: (payload: any) => void,
  onError?: (error: Event) => void,
  table?: string,
) {
  const url = getRealtimeUrl(table)
  if (!url) throw new Error('TM Cloud no configurado')
  const source = new EventSource(url)
  source.addEventListener('postgres_changes', (event) => {
    try {
      onChange(JSON.parse((event as MessageEvent).data))
    } catch {
      // Ignore malformed realtime payloads and keep the stream alive.
    }
  })
  source.onerror = (event) => onError?.(event)
  return () => source.close()
}

export async function testConnection(url: string, key: string) {
  const base = normalizeUrl(url)
  // Electron y los clientes de red ocultan las llaves reales detras del
  // proxy local. Esa URL es una configuracion de runtime valida aunque no
  // termine directamente en /api/prj_xxx.
  const isRuntimeProxy = /\/tmcloud-proxy$/i.test(base)
  if (!isRuntimeProxy && !/\/api\/prj_[A-Za-z0-9]+$/i.test(base)) {
    throw new Error('URL invalida. Usa https://tu-dominio.com/api/prj_xxx')
  }
  const publicKey = key.trim()
  if (!publicKey) throw new Error('La Public Key es obligatoria')

  // Electron debe hacer esta comprobacion desde el proceso principal. Un fetch
  // directo desde el renderer es bloqueado por CORS y solo muestra "Failed to fetch".
  if (!isRuntimeProxy && /Electron/i.test(navigator.userAgent) && (window as any).electron?.invoke) {
    const result = await (window as any).electron.invoke('tmcloud:testConnection', {
      url: base,
      public_key: publicKey,
    })
    if (!result?.success) throw new Error(result?.error || 'No se pudo conectar con TM Cloud')
    return result.data
  }

  const res = await fetch(`${base}/health`, { headers: authHeaders(publicKey) })
  if (!res.ok) {
    const message = await responseError(res)
    if (res.status === 404 && /route not found/i.test(message)) {
      throw new Error('TMPBase no tiene disponible /health. Sube al servidor la version actualizada de app/Controllers/ApiController.php')
    }
    throw new Error(message)
  }
  const data = await res.json()
  if (data.status !== 'ok') throw new Error('Respuesta inesperada de TMPBase')
  return data.data
}

function getCloudApi(): { url: string; key: string } | null {
  return currentConfig ? { url: currentConfig.url, key: currentConfig.key } : null
}

function getCloudWriteApi(): { url: string; key: string } | null {
  if (!currentConfig) return null
  const key = currentConfig.serviceKey || currentConfig.key
  return { url: currentConfig.url, key }
}

export async function verifyTable(tabla: string) {
  const api = getCloudApi()
  if (!api) return false
  try {
    const res = await fetch(`${api.url}/${encodeURIComponent(tabla)}?limit=1`, {
      headers: authHeaders(api.key),
    })
    return res.ok
  } catch (_e) { return false }
}

export async function syncTableUpload(tabla: string, localData: any[]) {
  const api = getCloudWriteApi()
  if (!api || localData.length === 0) return { success: true, synced: 0 }
  const rows = localData.map(row => cleanRecord(row))
  const res = await fetch(`${api.url}/${encodeURIComponent(tabla)}/upsert`, {
    method: 'POST',
    headers: authHeaders(api.key, true),
    body: JSON.stringify({ rows }),
  })
  if (!res.ok) throw new Error(await responseError(res))
  const json = await res.json()
  const result = json.data || {}
  return { success: true, synced: (result.inserted || 0) + (result.updated || 0) }
}

export async function fetchTable(tabla: string, updatedSince?: string): Promise<any[]> {
  const api = getCloudApi()
  if (!api) return []
  const path = updatedSince
    ? `${api.url}/${encodeURIComponent(tabla)}/sync?from=${encodeURIComponent(updatedSince)}`
    : `${api.url}/${encodeURIComponent(tabla)}?limit=100`
  const res = await fetch(path, { headers: authHeaders(api.key) })
  if (!res.ok) throw new Error(await responseError(res))
  const json = await res.json()
  return json.data || []
}

export async function cacheCompanyLocally(): Promise<number> {
  const rows = await fetchTable('empresa')
  if (rows.length === 0) throw new Error('TM Cloud no contiene los datos de la empresa')
  const normalized = rows.map(row => Object.fromEntries(
    Object.entries(row).filter(([key]) => key !== 'id').map(([key, value]) => [
      key,
      value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
    ]),
  ))
  const sample = Object.assign({}, ...normalized)
  const schema = await (window as any).electron.invoke('empresa-local:ensureColumns', sample)
  if (!schema?.success) throw new Error(schema?.error || 'No se pudo actualizar la estructura local de empresa')
  const clear = await (window as any).electron.invoke('db:clearEmpresaOnly')
  if (!clear?.success) throw new Error(clear?.error || 'No se pudo preparar la empresa local')
  for (const empresa of normalized) {
    const saved = await (window as any).electron.invoke('db:insertCloud', 'empresa', empresa)
    if (!saved?.success) throw new Error(saved?.error || 'No se pudo guardar la empresa localmente')
  }
  return normalized.length
}

export async function cacheLoginUsersLocally(): Promise<number> {
  const rows = await fetchTable('usuarios')
  if (rows.length === 0) throw new Error('TM Cloud no contiene usuarios de acceso')
  let saved = 0
  for (const row of rows) {
    const normalized = Object.fromEntries(
      Object.entries(row)
        .filter(([key]) => key !== 'id')
        .map(([key, value]) => [
          key,
          value !== null && typeof value === 'object' ? JSON.stringify(value) : value,
        ]),
    )
    const result = await (window as any).electron.invoke('db:insertCloud', 'usuarios', normalized)
    if (!result?.success) throw new Error(result?.error || 'No se pudo guardar un usuario localmente')
    saved++
  }
  return saved
}

export async function insertRecord(tabla: string, data: any) {
  const api = getCloudWriteApi()
  if (!api) return null
  const res = await fetch(`${api.url}/${encodeURIComponent(tabla)}`, {
    method: 'POST',
    headers: authHeaders(api.key, true),
    body: JSON.stringify(cleanRecord(data)),
  })
  if (!res.ok) throw new Error(await responseError(res))
  const json = await res.json()
  return json.data || null
}

export async function updateRecord(tabla: string, uid: string | number, data: any) {
  const api = getCloudWriteApi()
  if (!api) return false
  const res = await fetch(`${api.url}/${encodeURIComponent(tabla)}/${encodeURIComponent(String(uid))}`, {
    method: 'PUT',
    headers: authHeaders(api.key, true),
    body: JSON.stringify(cleanRecord(data, true)),
  })
  if (!res.ok) throw new Error(await responseError(res))
  return true
}

export async function deleteRecord(tabla: string, uid: string | number) {
  const api = getCloudWriteApi()
  if (!api) return false
  const res = await fetch(`${api.url}/${encodeURIComponent(tabla)}/${encodeURIComponent(String(uid))}`, {
    method: 'DELETE',
    headers: authHeaders(api.key),
  })
  if (!res.ok && res.status !== 404) throw new Error(await responseError(res))
  return true
}

export function cleanRecord(data: any, updating = false): any {
  const record = { ...data }
  delete record.id
  delete record._rowId
  // almacen_id is an autoincrement identifier that is only meaningful in the
  // local SQLite database. TM Cloud relates warehouses through almacen_uid.
  delete record.almacen_id
  if (updating) {
    delete record.uid
    delete record.created_at
  }
  return record
}

function getStorageUrl(): string | null {
  const systemStorageUrl = String((window as any).__systemProjectStorageBase || '').trim().replace(/\/+$/, '')
  if (systemStorageUrl) return systemStorageUrl
  if (!currentConfig?.url) return null
  const apiUrl = currentConfig.url.replace(/\/+$/, '')
  return apiUrl + '/storage'
}

function getStorageWriteKey(): { key: string; type: 'secret' | 'public' } | null {
  if (currentConfig?.serviceKey) return { key: currentConfig.serviceKey, type: 'secret' }
  if (currentConfig?.key) return { key: currentConfig.key, type: 'public' }
  return null
}

function safeImageBaseName(fileName: string): string {
  return String(fileName || 'imagen')
    .replace(/\.[^.]+$/, '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9_-]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'imagen'
}

function imageType(file: File): string {
  const declared = String(file.type || '').toLowerCase().split(';')[0]
  if (declared === 'image/jpg') return 'image/jpeg'
  if (declared) return declared
  const extension = file.name.split('.').pop()?.toLowerCase()
  if (extension === 'jpg' || extension === 'jpeg' || extension === 'jfif') return 'image/jpeg'
  if (extension === 'png') return 'image/png'
  if (extension === 'webp') return 'image/webp'
  if (extension === 'avif') return 'image/avif'
  return ''
}

async function convertImageToJpeg(file: File): Promise<File> {
  const objectUrl = URL.createObjectURL(file)
  try {
    const image = await new Promise<HTMLImageElement>((resolve, reject) => {
      const element = new Image()
      element.onload = () => resolve(element)
      element.onerror = () => reject(new Error(`No se pudo convertir ${file.name}`))
      element.src = objectUrl
    })
    const maxDimension = 2400
    const scale = Math.min(1, maxDimension / Math.max(image.naturalWidth, image.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale))
    const context = canvas.getContext('2d')
    if (!context) throw new Error(`No se pudo procesar ${file.name}`)
    context.fillStyle = '#ffffff'
    context.fillRect(0, 0, canvas.width, canvas.height)
    context.drawImage(image, 0, 0, canvas.width, canvas.height)
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.88))
    if (!blob) throw new Error(`No se pudo convertir ${file.name}`)
    return new File([blob], `${safeImageBaseName(file.name)}.jpg`, { type: 'image/jpeg' })
  } catch {
    throw new Error(`${file.name}: formato no compatible. Usa una imagen JPG, PNG, WEBP o AVIF valida.`)
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}

async function normalizeImageForUpload(file: File): Promise<File> {
  const type = imageType(file)
  const baseName = safeImageBaseName(file.name)
  if (type === 'image/jpeg') return new File([file], `${baseName}.jpg`, { type })
  if (type === 'image/png') return new File([file], `${baseName}.png`, { type })
  if (type.startsWith('image/')) return convertImageToJpeg(file)
  throw new Error(`${file.name}: el archivo seleccionado no es una imagen valida.`)
}

export async function uploadImage(file: File, directory: string): Promise<string> {
  await ensureConfigLoaded()
  const storageUrl = getStorageUrl()
  const auth = getStorageWriteKey()
  if (!storageUrl || !auth) throw new Error('TM Cloud no configurado')
  let uploadFile = await normalizeImageForUpload(file)

  for (let attempt = 0; attempt < 4; attempt++) {
    const formData = new FormData()
    formData.append('file', uploadFile, uploadFile.name)
    formData.append('directory', directory)
    const res = await fetch(`${storageUrl}/upload`, {
      method: 'POST',
      headers: authHeaders(auth.key),
      credentials: auth.key === SYSTEM_SESSION_KEY ? 'same-origin' : undefined,
      body: formData,
    })
    if (res.status === 429 && attempt < 3) {
      const retryAfter = Number(res.headers.get('retry-after') || 0)
      await new Promise(resolve => setTimeout(resolve, retryAfter > 0 ? retryAfter * 1000 : 1000 * (attempt + 1)))
      continue
    }
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      const rejectedType = res.status === 400 && /file type is not allowed/i.test(text)
      if (rejectedType && uploadFile.type !== 'image/jpeg' && attempt < 3) {
        uploadFile = await convertImageToJpeg(uploadFile)
        continue
      }
      if (rejectedType) throw new Error(`${file.name}: TM Cloud no admite este formato de imagen.`)
      throw new Error(
        `HTTP ${res.status} (key: ${auth.type})` +
        (text ? `: ${text.slice(0, 300)}` : '')
      )
    }
    const json = await res.json()
    const uid = json.data?.uid || json.data?.id || json.file?.uid || json.uid || json.id || json.data?.url || json.url || ''
    if (!uid) throw new Error('TM Cloud no devolvio el identificador de la imagen')
    return uid
  }
  throw new Error('TM Cloud alcanzo el limite de solicitudes. Intenta nuevamente en unos segundos.')
}

export function getImageIds(value: unknown): string[] {
  if (Array.isArray(value)) return [...new Set(value.map(item => String(item || '').trim()).filter(Boolean))]
  const raw = String(value || '').trim()
  if (!raw) return []
  if (raw.startsWith('[')) {
    try {
      const parsed = JSON.parse(raw)
      if (Array.isArray(parsed)) return [...new Set(parsed.map(item => String(item || '').trim()).filter(Boolean))]
    } catch { /* Compatibilidad con referencias antiguas. */ }
  }
  return [raw]
}

export function serializeImageIds(values: unknown[]): string {
  const ids = getImageIds(values)
  if (ids.length === 0) return ''
  return ids.length === 1 ? ids[0] : JSON.stringify(ids)
}

export function getImageUrl(uid: unknown): string | null {
  const imageId = getImageIds(uid)[0] || ''
  if (!imageId) return null
  if (/^(data:|https?:\/\/|blob:)/i.test(imageId)) return imageId
  const systemProjectApi = String((window as any).__systemProjectApiBase || '').replace(/\/+$/, '')
  if (systemProjectApi && /^fil_[A-Za-z0-9]+$/i.test(imageId)) return `${systemProjectApi}/storage/${encodeURIComponent(imageId)}`
  const storageUrl = getStorageUrl()
  if (!storageUrl) return null
  return `${storageUrl}/${imageId}`
}

export async function deleteImage(uid: string): Promise<boolean> {
  await ensureConfigLoaded()
  const storageUrl = getStorageUrl()
  const key = getStorageWriteKey()
  if (!storageUrl || !key || !uid) return false
  if (/^(data:|blob:)/i.test(uid)) return false
  const res = await fetch(`${storageUrl}/${uid}`, {
    method: 'DELETE',
    headers: authHeaders(key.key),
    credentials: key.key === SYSTEM_SESSION_KEY ? 'same-origin' : undefined,
  })
  return res.ok
}

export function dataUrlToFile(dataUrl: string, fileName: string): File {
  const [header, data] = dataUrl.split(',')
  const mime = header.match(/data:([^;]+)/)?.[1] || 'image/jpeg'
  const binary = atob(data || '')
  const bytes = new Uint8Array(binary.length)
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i)
  return new File([bytes], fileName, { type: mime })
}

export async function uploadImageSource(source: File | string, directory: string, fileName = 'imagen.jpg'): Promise<string> {
  if (source instanceof File) return uploadImage(source, directory)
  if (/^(https?:\/\/|fil_)/i.test(source)) return source
  if (/^data:/i.test(source)) return uploadImage(dataUrlToFile(source, fileName), directory)
  throw new Error('Formato de imagen no soportado')
}

export async function uploadImageSources(sources: string[], directory: string, prefix = 'imagen'): Promise<string[]> {
  const uploaded: string[] = []
  for (let i = 0; i < sources.length; i++) {
    uploaded.push(await uploadImageSource(sources[i], directory, `${prefix}-${i + 1}.jpg`))
  }
  return uploaded
}

export { authHeaders, getCloudApi, getCloudWriteApi, responseError, getStorageUrl, getStorageWriteKey }
