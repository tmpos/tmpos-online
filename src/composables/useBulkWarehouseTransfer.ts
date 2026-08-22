import { ref, type Ref } from 'vue'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'

interface BulkWarehouseTransferOptions {
  table: string
  entity: string
  label: string
  selection: Ref<any[]>
  reload: () => Promise<void>
  reference?: (item: any) => string
  afterUpdate?: (item: any, destination: { id: number; uid: string; name: string }) => Promise<void>
}

export function useBulkWarehouseTransfer(options: BulkWarehouseTransferOptions) {
  const toast = useToast()
  const almacenStore = useAlmacenStore()
  const dialogMoverAlmacen = ref(false)
  const almacenDestino = ref<any>(null)
  const almacenesDestino = ref<any[]>([])
  const moviendoAlmacen = ref(false)

  async function abrirMoverAlmacen() {
    if (!options.selection.value.length) {
      toast.add({ severity: 'warn', summary: 'Seleccion requerida', detail: `Selecciona al menos un ${options.label}`, life: 2500 })
      return
    }

    almacenDestino.value = null
    try {
      await almacenStore.load()
      const origenes = new Set(
        options.selection.value.map((item: any) => String(item.almacen_uid || '')).filter(Boolean)
      )
      almacenesDestino.value = almacenStore.almacenes.filter((almacen: any) =>
        origenes.size !== 1 || !origenes.has(String(almacen.uid || ''))
      )
      dialogMoverAlmacen.value = true
    } catch (error: any) {
      toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron cargar los almacenes', life: 4000 })
    }
  }

  async function aplicarMoverAlmacen() {
    if (!almacenDestino.value || moviendoAlmacen.value || !options.selection.value.length) return

    const destinoId = Number(almacenDestino.value.id || 0)
    const destinoUid = String(almacenDestino.value.uid || '')
    const destinoNombre = String(almacenDestino.value.nombre || 'almacen destino')
    const seleccion = [...options.selection.value]
    moviendoAlmacen.value = true

    try {
      for (const item of seleccion) {
        const res = await window.db.update(options.table, item.id, {
          almacen_id: destinoId,
          almacen_uid: destinoUid,
        })
        if (!res.success) {
          const referencia = options.reference?.(item) || item.id
          throw new Error(res.error || `No se pudo mover el registro ${referencia}`)
        }

        await options.afterUpdate?.(item, { id: destinoId, uid: destinoUid, name: destinoNombre })

        try {
          await window.electron?.invoke('auditoria:registrar', {
            modulo: 'almacenes',
            accion: 'mover_almacen',
            entidad: options.entity,
            entidad_id: Number(item.id || 0),
            referencia: options.reference?.(item) || String(item.id || ''),
            usuario: localStorage.getItem('mr_user_usuario') || 'POS',
            detalle: {
              almacen_origen_id: item.almacen_id || 0,
              almacen_origen_uid: item.almacen_uid || '',
              almacen_destino_id: destinoId,
              almacen_destino_uid: destinoUid,
              almacen_destino_nombre: destinoNombre,
            },
          })
        } catch (_) {}
      }

      dialogMoverAlmacen.value = false
      options.selection.value = []
      toast.add({ severity: 'success', summary: 'Almacen actualizado', detail: `${seleccion.length} registro(s) movido(s) a ${destinoNombre}`, life: 3000 })
      await options.reload()
    } catch (error: any) {
      toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron mover los registros', life: 4000 })
      await options.reload()
    } finally {
      moviendoAlmacen.value = false
    }
  }

  return {
    dialogMoverAlmacen,
    almacenDestino,
    almacenesDestino,
    moviendoAlmacen,
    abrirMoverAlmacen,
    aplicarMoverAlmacen,
  }
}
