import { ref, computed } from 'vue'
import { useAlmacenStore } from '@/stores/almacen.store'
import { getSystemCurrencyCode } from '@/i18n/localeProfiles'

const empresa = ref<any>(null)
const loaded = ref(false)

export function useEmpresa() {
  const almacenStore = useAlmacenStore()

  const nombre = computed(() => empresa.value?.nombre || 'MI EMPRESA')
  const logo = computed(() => empresa.value?.logo || '')
  const rnc = computed(() => empresa.value?.legal || '')
  const telefono = computed(() => empresa.value?.telefono || '')
  const email = computed(() => empresa.value?.email || '')
  const direccion = computed(() => empresa.value?.direccion || '')
  const moneda = computed(() => getSystemCurrencyCode())
  const impuesto = computed(() => empresa.value?.impuesto ?? 18)
  const impuestoIncluido = computed(() => empresa.value?.impuesto_incluido === 1 || empresa.value?.impuesto_incluido === true)

  async function cargar() {
    try {
      let emp = null
      await almacenStore.load()
      const empresas = await (window as any).electron.invoke('db:getAll', 'empresa')
      if (empresas?.success && Array.isArray(empresas.data) && empresas.data.length > 0) {
        // El uid es siempre unico; el almacen_id numerico puede repetirse entre
        // empresas (dato duplicado), asi que solo se usa como respaldo si ningun
        // registro coincide por uid.
        emp = (almacenStore.activeUid && empresas.data.find((item: any) => String(item.uid || item.almacen_uid || '') === String(almacenStore.activeUid)))
          || empresas.data.find((item: any) => Number(item.almacen_id || item.id) === Number(almacenStore.activeId))
          || empresas.data[0]
      }

      if (!emp) {
        if (empresas?.success && Array.isArray(empresas.data) && empresas.data.length > 0) {
          emp = empresas.data[0]
        } else {
          const r = await (window as any).db.insert('empresa', {
            nombre: 'MI EMPRESA',
            almacen_uid: almacenStore.activeUid || '',
          })
          if (r.success) {
            const r2 = await (window as any).electron.invoke('db:getById', 'empresa', r.data.id)
            if (r2.success) emp = r2.data
          }
        }
      }
      if (emp) {
        empresa.value = emp
        await (window as any).config?.set?.('empresa_id', String(emp.id))
        ;(window as any).__empresaNombre = emp.nombre || 'MI EMPRESA'
        ;(window as any).__empresaDireccion = emp.direccion || ''
        ;(window as any).__empresaTelefono = emp.telefono || ''
      }
    } catch (_) {}
    loaded.value = true
  }

  async function guardar(data: Record<string, any>) {
    const database = (window as any).db
    if (!database) throw new Error('La base de datos no esta disponible')

    let empresaId = Number(empresa.value?.id || 0)
    if (empresaId) {
      // window.db agrega el usuario autenticado. La llamada directa a
      // electron.invoke no lo hacia y el proceso principal rechazaba en silencio
      // todos los cambios de empresa por falta de permisos.
      const result = await database.update('empresa', empresaId, data)
      if (!result?.success) throw new Error(result?.error || 'No se pudo actualizar la empresa')
    } else {
      const result = await database.insert('empresa', data)
      if (!result?.success || !result?.data?.id) throw new Error(result?.error || 'No se pudo crear la empresa')
      empresaId = Number(result.data.id)
      await (window as any).config.set('empresa_id', String(empresaId))
    }

    // Se vuelve a leer la fila porque el proceso principal completa uid,
    // almacen_uid y updated_at; esos valores son los que necesita el upsert.
    const refreshed = await database.getById('empresa', empresaId)
    if (!refreshed?.success || !refreshed?.data) {
      throw new Error(refreshed?.error || 'La empresa se guardo, pero no pudo volver a cargarse')
    }
    empresa.value = refreshed.data
    ;(window as any).__empresaNombre = empresa.value.nombre || 'MI EMPRESA'
    ;(window as any).__empresaDireccion = empresa.value.direccion || ''
    ;(window as any).__empresaTelefono = empresa.value.telefono || ''
    return empresa.value
  }

  return { empresa, loaded, nombre, logo, rnc, telefono, email, direccion, moneda, impuesto, impuestoIncluido, cargar, guardar }
}
