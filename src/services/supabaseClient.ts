import { createClient } from '@supabase/supabase-js'
import type { SupabaseClient } from '@supabase/supabase-js'

let client: SupabaseClient | null = null
let currentConfig: { url: string; anonKey: string; serviceRole?: string } | null = null

export async function loadConfig(): Promise<{ url: string; anonKey: string; serviceRole: string }> {
  try {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const getVal = (clave: string) => res.data.find((r: any) => r.clave === clave)?.valor || ''
      return { url: getVal('supabase_url'), anonKey: getVal('supabase_anon_key'), serviceRole: getVal('supabase_service_role') }
    }
  } catch {}
  return { url: '', anonKey: '', serviceRole: '' }
}

export async function upsertConfig(clave: string, valor: string) {
  const res = await (window as any).db.getAll('configuracion')
  if (res.success && res.data) {
    const row = res.data.find((r: any) => r.clave === clave)
    if (row) await (window as any).db.update('configuracion', row.id, { valor })
    else await (window as any).db.insert('configuracion', { clave, valor: valor || '', tipo: 'string', categoria: 'supabase' })
  }
}

export async function saveConfig(url: string, anonKey: string, serviceRole: string) {
  const upsert = async (clave: string, valor: string) => {
    const res = await (window as any).db.getAll('configuracion')
    if (res.success && res.data) {
      const row = res.data.find((r: any) => r.clave === clave)
      if (row) await (window as any).db.update('configuracion', row.id, { valor })
      else await (window as any).db.insert('configuracion', { clave, valor: valor || '', tipo: 'string', categoria: 'supabase' })
    }
  }
  await upsert('supabase_url', url)
  await upsert('supabase_anon_key', anonKey)
  await upsert('supabase_service_role', serviceRole)
}

export function init(config: { url: string; anonKey: string; serviceRole?: string }) {
  if (!config.url || !config.anonKey) throw new Error('URL y Anon Key requeridos')
  if (currentConfig?.url === config.url && currentConfig?.anonKey === config.anonKey && client) return
  currentConfig = config
  client = createClient(config.url, config.serviceRole || config.anonKey)
}

export function getClient() {
  return client
}

export function getConfig() {
  return currentConfig
}

export function isConnected() {
  return client !== null
}

export async function getSession() {
  if (!client) return null
  try {
    const { data } = await client.auth.getSession()
    return data.session
  } catch { return null }
}

export function onAuthStateChange(callback: (event: string, session: any) => void) {
  if (!client) return { data: { subscription: { unsubscribe: () => {} } } }
  const { data } = client.auth.onAuthStateChange((event, session) => callback(event, session))
  return data
}

export async function signOut() {
  if (!client) return
  await client.auth.signOut()
  client = null
  currentConfig = null
}

export async function testConnection(url: string, anonKey: string) {
  const base = url.replace(/\/+$/, '')
  const res = await fetch(`${base}/auth/v1/health`, {
    headers: { 'apikey': anonKey, 'Authorization': `Bearer ${anonKey}` },
  })
  if (res.ok) return true
  const text = await res.text().catch(() => '')
  throw new Error(`HTTP ${res.status}: ${text.slice(0, 150) || res.statusText}`)
}

export async function verifyTable(tabla: string) {
  if (!client) return false
  try {
    const { error } = await client.from(tabla).select('id', { count: 'exact', head: true })
    if (!error) return true
    if (error.code === '42P01' || error.code === 'PGRST205') return false
    return false
  } catch { return false }
}

export async function syncTable(tabla: string, localData: any[]) {
  if (!client || localData.length === 0) return { success: true, synced: 0 }
  let synced = 0
  for (const row of localData) {
    try {
      const id = row.id
      if (id) {
        const { error: existsError } = await client.from(tabla).select('id').eq('id', id).maybeSingle()
        if (existsError && existsError.code !== '42P01') continue
        if (existsError || !existsError) {
          const { error } = await client.from(tabla).upsert(row, { onConflict: 'id' })
          if (!error) synced++
        }
      }
    } catch {}
  }
  return { success: true, synced }
}
