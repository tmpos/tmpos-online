import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useAlmacenStore = defineStore('almacen', () => {
  const almacenes = ref<any[]>([])
  const defaultId = ref(Number(localStorage.getItem('almacen_default_id') || localStorage.getItem('almacen_id')) || 0)
  const activeId = ref(defaultId.value)
  const defaultUid = ref(localStorage.getItem('almacen_default_uid') || localStorage.getItem('almacen_uid') || '')
  const activeUid = ref(defaultUid.value)

  const activeAlmacen = computed(() => almacenes.value.find(a => activeUid.value ? a.uid === activeUid.value : a.id === activeId.value) || null)
  const hasMultiple = computed(() => almacenes.value.length > 1)

  async function load() {
    try {
      const res = await (window as any).electron.invoke('db:getAll', 'empresa')
      if (res.success && res.data) {
        almacenes.value = res.data.map((empresa: any) => ({
          ...empresa,
          empresa_id: Number(empresa.id),
          id: Number(empresa.almacen_id) || Number(empresa.id),
          uid: String(empresa.uid || empresa.almacen_uid || ''),
          almacen_uid: String(empresa.uid || empresa.almacen_uid || ''),
        }))
        const savedUid = localStorage.getItem('almacen_default_uid') || localStorage.getItem('almacen_uid') || ''
        const saved = Number(localStorage.getItem('almacen_default_id') || localStorage.getItem('almacen_id'))
        const seleccionada = (savedUid && almacenes.value.find((a: any) => a.uid === savedUid)) || almacenes.value.find((a: any) => a.id === saved)
        if (seleccionada) {
          defaultId.value = seleccionada.id
          activeId.value = seleccionada.id
          defaultUid.value = seleccionada.uid || ''
          activeUid.value = seleccionada.uid || ''
        } else if (almacenes.value.length > 0) {
          defaultId.value = almacenes.value[0].id
          activeId.value = defaultId.value
          defaultUid.value = almacenes.value[0].uid || ''
          activeUid.value = defaultUid.value
          localStorage.setItem('almacen_default_id', String(defaultId.value))
          localStorage.setItem('almacen_id', String(defaultId.value))
        }
        if (activeUid.value) {
          localStorage.setItem('almacen_default_uid', activeUid.value)
          localStorage.setItem('almacen_uid', activeUid.value)
        }
      }
    } catch {}
  }

  // Varias empresas pueden compartir el mismo almacen_id numerico (dato duplicado o
  // heredado de la nube), asi que buscamos primero por uid (siempre unico) y solo
  // caemos al id numerico cuando no se paso un uid.
  function encontrarAlmacen(idOrUid: number | string) {
    if (typeof idOrUid === 'string') {
      const porUid = almacenes.value.find(a => String(a.uid || '') === idOrUid)
      if (porUid) return porUid
    }
    return almacenes.value.find(a => Number(a.id) === Number(idOrUid))
  }

  function select(idOrUid: number | string) {
    const almacen = encontrarAlmacen(idOrUid)
    if (!almacen) return
    activeId.value = Number(almacen.id)
    activeUid.value = String(almacen.uid || '')
    localStorage.setItem('almacen_id', String(activeId.value))
    localStorage.setItem('almacen_uid', activeUid.value)
  }

  function setDefault(idOrUid: number | string) {
    const almacen = encontrarAlmacen(idOrUid)
    if (!almacen) return false
    defaultId.value = Number(almacen.id)
    activeId.value = Number(almacen.id)
    defaultUid.value = String(almacen.uid || '')
    activeUid.value = defaultUid.value
    localStorage.setItem('almacen_default_id', String(defaultId.value))
    localStorage.setItem('almacen_id', String(defaultId.value))
    localStorage.setItem('almacen_default_uid', defaultUid.value)
    localStorage.setItem('almacen_uid', activeUid.value)
    return true
  }

  function resetToDefault() {
    activeId.value = defaultId.value
    activeUid.value = defaultUid.value
  }

  return { almacenes, activeId, defaultId, activeUid, defaultUid, activeAlmacen, hasMultiple, load, select, setDefault, resetToDefault }
})
