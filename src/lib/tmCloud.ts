import * as tmc from '../services/tmCloudClient'

let clientUrl = import.meta.env.VITE_TMCLOUD_URL || ''
let clientKey = import.meta.env.VITE_TMCLOUD_KEY || ''

if (clientUrl && clientKey) {
  tmc.init({ url: clientUrl, key: clientKey })
}

export class TMCloudQuery {
  private url: string
  private key: string

  constructor(url: string, key: string) {
    this.url = url.replace(/\/+$/, '')
    this.key = key
  }

  async get(tabla: string, limit = 1000, orderBy?: string): Promise<{ success: boolean; data?: any[]; error?: string }> {
    try {
      let path = `${this.url}/api/db/${tabla}?limit=${limit}`
      if (orderBy) path += `&order=${encodeURIComponent(orderBy)}.desc`
      const res = await fetch(path, { headers: { 'X-API-Key': this.key } })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = await res.json()
      return { success: true, data: json.data || [] }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async getById(tabla: string, id: string | number): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${this.url}/api/db/${tabla}?where=id=${id}&limit=1`, {
        headers: { 'apikey': this.key },
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = await res.json()
      return { success: true, data: (json.data || [])[0] || null }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async insert(tabla: string, data: Record<string, unknown>): Promise<{ success: boolean; data?: any; error?: string }> {
    try {
      const res = await fetch(`${this.url}/api/db/${tabla}`, {
        method: 'POST',
        headers: { 'X-API-Key': this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      const json = await res.json()
      return { success: true, data: json.data }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async update(tabla: string, id: string | number, data: Record<string, unknown>): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.url}/api/db/${tabla}/${id}`, {
        method: 'PUT',
        headers: { 'X-API-Key': this.key, 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async delete(tabla: string, id: string | number): Promise<{ success: boolean; error?: string }> {
    try {
      const res = await fetch(`${this.url}/api/db/${tabla}/${id}`, {
        method: 'DELETE',
        headers: { 'apikey': this.key },
      })
      if (!res.ok) return { success: false, error: `HTTP ${res.status}` }
      return { success: true }
    } catch (e: any) { return { success: false, error: e.message } }
  }

  async count(tabla: string, where?: string): Promise<number> {
    try {
      let path = `${this.url}/api/db/${tabla}?count=exact&limit=1`
      if (where) path += `&where=${encodeURIComponent(where)}`
      const res = await fetch(path, { headers: { 'X-API-Key': this.key } })
      if (!res.ok) return 0
      const json = await res.json()
      return json.count || (json.data?.length || 0)
    } catch (_e) { return 0 }
  }
}

let staticClient: TMCloudQuery | null = null

function getStaticClient(): TMCloudQuery | null {
  if (!staticClient) {
    const cfg = tmc.getConfig()
    if (cfg) staticClient = new TMCloudQuery(cfg.url, cfg.key)
    else if (clientUrl && clientKey) staticClient = new TMCloudQuery(clientUrl, clientKey)
  }
  return staticClient
}

function getOrCreateClient(): TMCloudQuery {
  const c = getStaticClient()
  if (c) return c
  const cfg = tmc.getConfig()
  if (cfg) {
    staticClient = new TMCloudQuery(cfg.url, cfg.key)
    return staticClient
  }
  throw new Error('TM Cloud no configurado')
}

export async function tmCloudGetAll(tabla: string) {
  return getOrCreateClient().get(tabla, 5000, 'id')
}

export async function tmCloudGetById(tabla: string, id: number) {
  return getOrCreateClient().getById(tabla, id)
}

export async function tmCloudInsert(tabla: string, data: Record<string, unknown>, usuario?: string) {
  const record = {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const result = await getOrCreateClient().insert(tabla, record)
  if (result.success && tabla !== 'bitacora') {
    await tmCloudInsert('bitacora', {
      tabla,
      registro_id: (result.data as any)?.id,
      accion: 'CREATE',
      usuario: usuario || '',
      datos_nuevos: JSON.stringify(data),
    } as any)
  }
  return { success: result.success, data: result.data, error: result.error }
}

export async function tmCloudUpdate(tabla: string, id: number, data: Record<string, unknown>, usuario?: string) {
  const oldRes = await getOrCreateClient().getById(tabla, id)
  const result = await getOrCreateClient().update(tabla, id, { ...data, updated_at: new Date().toISOString() })
  if (result.success && tabla !== 'bitacora') {
    await tmCloudInsert('bitacora', {
      tabla,
      registro_id: id,
      accion: 'UPDATE',
      usuario: usuario || '',
      datos_nuevos: JSON.stringify(data),
      datos_anteriores: JSON.stringify(oldRes.data || {}),
    } as any)
  }
  return result
}

export async function tmCloudDelete(tabla: string, id: number, usuario?: string) {
  const oldRes = await getOrCreateClient().getById(tabla, id)
  const result = await getOrCreateClient().delete(tabla, id)
  if (result.success && tabla !== 'bitacora') {
    await tmCloudInsert('bitacora', {
      tabla,
      registro_id: id,
      accion: 'DELETE',
      usuario: usuario || '',
      datos_anteriores: JSON.stringify(oldRes.data || {}),
    } as any)
  }
  return result
}

export async function tmCloudBitacoraList(limite = 1000) {
  return getOrCreateClient().get('bitacora', limite, 'id')
}

export async function tmCloudBitacoraDeleteAll() {
  let deleted = 0
  const allRes = await getOrCreateClient().get('bitacora', 100000, 'id')
  if (allRes.success && allRes.data) {
    for (const row of allRes.data) {
      const r = await getOrCreateClient().delete('bitacora', row.id)
      if (r.success) deleted++
    }
  }
  return { success: true, deleted }
}

export async function tmCloudTableExists(tabla: string) {
  try {
    const c = getStaticClient() || new TMCloudQuery(clientUrl || '', clientKey || '')
    const res = await fetch(`${c['url']}/api/schema/tables/${tabla}`, {
      headers: { 'X-API-Key': c['key'] },
    })
    return res.ok
  } catch (_e) { return false }
}

export function createTMCloudClient(url: string, key: string): TMCloudQuery {
  staticClient = new TMCloudQuery(url, key)
  return staticClient
}

export default { tmCloudGetAll, tmCloudGetById, tmCloudInsert, tmCloudUpdate, tmCloudDelete, tmCloudBitacoraList, tmCloudBitacoraDeleteAll, tmCloudTableExists, createTMCloudClient, TMCloudQuery }
