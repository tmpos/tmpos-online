import { createClient } from '@supabase/supabase-js'

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || ''
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!supabaseUrl || !supabaseAnonKey) {
  console.warn('[Supabase] Faltan credenciales. Configura VITE_SUPABASE_URL y VITE_SUPABASE_ANON_KEY en .env')
}

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

export async function supabaseGetAll(tabla: string) {
  const { data, error } = await supabase
    .from(tabla)
    .select('*')
    .order('id', { ascending: false })
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function supabaseGetById(tabla: string, id: number) {
  const { data, error } = await supabase
    .from(tabla)
    .select('*')
    .eq('id', id)
    .single()
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function supabaseInsert(tabla: string, data: Record<string, unknown>, usuario?: string) {
  const record = {
    ...data,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }
  const { data: inserted, error } = await supabase
    .from(tabla)
    .insert(record)
    .select()
    .single()
  if (error) return { success: false, error: error.message }
  if (tabla !== 'bitacora') {
    await supabaseInsert('bitacora', {
      tabla,
      registro_id: (inserted as any).id,
      accion: 'CREATE',
      usuario: usuario || '',
      datos_nuevos: JSON.stringify(data),
    })
  }
  return { success: true, data: { id: (inserted as any).id } }
}

export async function supabaseUpdate(tabla: string, id: number, data: Record<string, unknown>, usuario?: string) {
  const { data: oldData } = await supabase
    .from(tabla)
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from(tabla)
    .update({ ...data, updated_at: new Date().toISOString() })
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  if (tabla !== 'bitacora') {
    await supabaseInsert('bitacora', {
      tabla,
      registro_id: id,
      accion: 'UPDATE',
      usuario: usuario || '',
      datos_nuevos: JSON.stringify(data),
      datos_anteriores: JSON.stringify(oldData || {}),
    })
  }
  return { success: true }
}

export async function supabaseDelete(tabla: string, id: number, usuario?: string) {
  const { data: oldData } = await supabase
    .from(tabla)
    .select('*')
    .eq('id', id)
    .single()

  const { error } = await supabase
    .from(tabla)
    .delete()
    .eq('id', id)
  if (error) return { success: false, error: error.message }
  if (tabla !== 'bitacora') {
    await supabaseInsert('bitacora', {
      tabla,
      registro_id: id,
      accion: 'DELETE',
      usuario: usuario || '',
      datos_anteriores: JSON.stringify(oldData || {}),
    })
  }
  return { success: true }
}

export async function supabaseBitacoraList(limite = 1000) {
  const { data, error } = await supabase
    .from('bitacora')
    .select('*')
    .order('id', { ascending: false })
    .limit(limite)
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function supabaseBitacoraDeleteAll() {
  const { error } = await supabase
    .from('bitacora')
    .delete()
    .neq('id', 0)
  if (error) return { success: false, error: error.message }
  return { success: true }
}

export async function supabaseRawQuery(sql: string) {
  const { data, error } = await supabase.rpc('exec_sql', { query: sql })
  if (error) return { success: false, error: error.message }
  return { success: true, data }
}

export async function supabaseTableExists(tabla: string) {
  const { data, error } = await supabase
    .from('information_schema.tables')
    .select('table_name')
    .eq('table_name', tabla)
    .eq('table_schema', 'public')
  if (error) return false
  return (data || []).length > 0
}
