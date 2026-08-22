<template>
  <div class="p-4 sm:p-6 max-w-6xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Soporte al Cliente</h1>
        <p class="text-sm text-surface-500">Gestiona los tickets de soporte tecnico</p>
      </div>
      <button @click="abrirNuevoTicket" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
        <i class="pi pi-plus"></i>Nuevo Ticket
      </button>
    </div>

    <div class="grid grid-cols-1 sm:grid-cols-4 gap-4 mb-6">
      <div class="rounded-xl bg-gradient-to-br from-blue-500 to-blue-700 p-3 text-white shadow" @click="filtroEstado = 'ABIERTO'">
        <p class="text-blue-100 text-xs">Abiertos</p>
        <p class="text-xl font-bold">{{ contar('ABIERTO') }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-amber-500 to-amber-700 p-3 text-white shadow" @click="filtroEstado = 'EN_PROCESO'">
        <p class="text-amber-100 text-xs">En Proceso</p>
        <p class="text-xl font-bold">{{ contar('EN_PROCESO') }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-green-500 to-green-700 p-3 text-white shadow" @click="filtroEstado = 'RESUELTO'">
        <p class="text-green-100 text-xs">Resueltos</p>
        <p class="text-xl font-bold">{{ contar('RESUELTO') }}</p>
      </div>
      <div class="rounded-xl bg-gradient-to-br from-slate-500 to-slate-700 p-3 text-white shadow" @click="filtroEstado = ''">
        <p class="text-slate-100 text-xs">Total</p>
        <p class="text-xl font-bold">{{ tickets.length }}</p>
      </div>
    </div>

    <DataTable :value="ticketsFiltrados" stripedRows paginator :rows="15" dataKey="id" sortField="created_at" :sortOrder="-1">
      <Column field="codigo" header="Ticket" sortable style="width:6rem">
        <template #body="{ data }"><span class="font-mono text-xs font-semibold">{{ data.codigo }}</span></template>
      </Column>
      <Column field="cliente_nombre" header="Cliente" sortable />
      <Column field="cliente_telefono" header="Telefono" style="width:7rem" />
      <Column field="producto" header="Producto" sortable />
      <Column field="prioridad" header="Prioridad" sortable style="width:6rem">
        <template #body="{ data }">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            :class="data.prioridad === 'ALTA' ? 'bg-red-100 text-red-700' : data.prioridad === 'MEDIA' ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'"
          >{{ data.prioridad }}</span>
        </template>
      </Column>
      <Column field="estado" header="Estado" sortable style="width:7rem">
        <template #body="{ data }">
          <span class="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium"
            :class="data.estado === 'ABIERTO' ? 'bg-blue-100 text-blue-700' : data.estado === 'EN_PROCESO' ? 'bg-amber-100 text-amber-700' : data.estado === 'RESUELTO' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-700'"
          >{{ data.estado === 'EN_PROCESO' ? 'En Proceso' : data.estado }}</span>
        </template>
      </Column>
      <Column field="created_at" header="Creado" sortable style="width:8rem">
        <template #body="{ data }">{{ $formatDate(data.created_at) }}</template>
      </Column>
      <Column header="Acciones" style="width:8rem">
        <template #body="{ data }">
          <Button icon="pi pi-eye" severity="info" text rounded size="small" @click="verTicket(data)" v-tooltip="'Ver detalle'" />
        </template>
      </Column>
      <template #empty>
        <div class="text-center py-10 text-surface-400">No hay tickets de soporte.</div>
      </template>
    </DataTable>

    <Dialog v-model:visible="dialogTicket" :header="'Ticket ' + (editando?.codigo || 'Nuevo')" modal :style="{ width: 'min(40rem, 95vw)' }" :draggable="false">
      <div class="space-y-4 pt-2">
        <div v-if="!editando" class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Cliente <span class="text-red-500">*</span></label>
            <InputText v-model="form.cliente_nombre" placeholder="Nombre del cliente" fluid />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Telefono</label>
            <InputText v-model="form.cliente_telefono" placeholder="Telefono" fluid />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Email</label>
            <InputText v-model="form.cliente_email" placeholder="Email" fluid />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Producto/Equipo</label>
            <InputText v-model="form.producto" placeholder="Equipo o producto" fluid />
          </div>
          <div class="col-span-2">
            <label class="text-xs font-semibold mb-1 block">Descripcion del problema <span class="text-red-500">*</span></label>
            <Textarea v-model="form.descripcion" placeholder="Describe el problema..." rows="3" fluid />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Prioridad</label>
            <Select v-model="form.prioridad" :options="['BAJA', 'NORMAL', 'MEDIA', 'ALTA']" fluid />
          </div>
        </div>

        <div v-if="editando">
          <div class="grid grid-cols-2 gap-3 text-sm mb-4">
            <div><span class="text-surface-400">Cliente:</span> <strong>{{ editando.cliente_nombre }}</strong></div>
            <div><span class="text-surface-400">Telefono:</span> <strong>{{ editando.cliente_telefono || '-' }}</strong></div>
            <div><span class="text-surface-400">Producto:</span> <strong>{{ editando.producto || '-' }}</strong></div>
            <div><span class="text-surface-400">Prioridad:</span> <strong>{{ editando.prioridad }}</strong></div>
          </div>
          <div class="text-sm mb-4 p-3 rounded-lg bg-surface-50 dark:bg-surface-800">
            <p class="text-surface-400 text-xs mb-1">Problema:</p>
            <p>{{ editando.descripcion }}</p>
          </div>
          <div v-if="editando.solucion" class="text-sm mb-4 p-3 rounded-lg bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800">
            <p class="text-green-600 text-xs mb-1">Solucion:</p>
            <p>{{ editando.solucion }}</p>
          </div>

          <div class="border-t border-surface-200 dark:border-surface-700 pt-3">
            <label class="text-xs font-semibold mb-1 block">Estado</label>
            <Select v-model="editando.estado" :options="['ABIERTO', 'EN_PROCESO', 'RESUELTO', 'CERRADO']" fluid @change="onEstadoChange" />
          </div>
          <div v-if="editando.estado === 'RESUELTO' || editando.estado === 'CERRADO'" class="mt-3">
            <label class="text-xs font-semibold mb-1 block">Solucion</label>
            <Textarea v-model="editando.solucion" placeholder="Describe la solucion..." rows="2" fluid />
          </div>

          <div class="border-t border-surface-200 dark:border-surface-700 pt-3 mt-3">
            <h4 class="text-sm font-semibold mb-2">Comentarios</h4>
            <div v-if="comentarios.length === 0" class="text-xs text-surface-400 mb-2">Sin comentarios</div>
            <div v-else class="space-y-2 mb-3 max-h-48 overflow-y-auto">
              <div v-for="c in comentarios" :key="c.id" class="text-sm p-2 rounded-lg" :class="c.tipo === 'SISTEMA' ? 'bg-surface-50 dark:bg-surface-800 text-surface-500 italic' : 'bg-blue-50 dark:bg-blue-900/20'">
                <div class="flex justify-between">
                  <span class="text-xs font-medium">{{ c.usuario || 'Sistema' }}</span>
                  <span class="text-[10px] text-surface-400">{{ $formatDateTime(c.created_at) }}</span>
                </div>
                <p>{{ c.comentario }}</p>
              </div>
            </div>
            <div class="flex gap-2">
              <InputText v-model="nuevoComentario" placeholder="Agregar comentario..." class="flex-1" fluid />
              <Button icon="pi pi-send" @click="agregarComentario" :disabled="!nuevoComentario.trim()" />
            </div>
          </div>
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="cerrarDialogo" />
        <Button v-if="!editando" label="Crear Ticket" icon="pi pi-check" :loading="guardando" @click="crearTicket" />
        <Button v-if="editando" label="Guardar Cambios" icon="pi pi-save" :loading="guardando" @click="actualizarTicket" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import Textarea from 'primevue/textarea'
import Select from 'primevue/select'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'

const toast = useToast()
const almacenStore = useAlmacenStore()

const tickets = ref<any[]>([])
const comentarios = ref<any[]>([])
const dialogTicket = ref(false)
const editando = ref<any>(null)
const guardando = ref(false)
const error = ref('')
const filtroEstado = ref('')
const nuevoComentario = ref('')

const form = ref({ cliente_nombre: '', cliente_telefono: '', cliente_email: '', producto: '', descripcion: '', prioridad: 'NORMAL' })

const ticketsFiltrados = computed(() => {
  if (!filtroEstado.value) return tickets.value
  return tickets.value.filter(t => t.estado === filtroEstado.value)
})

function contar(estado: string): number {
  return tickets.value.filter(t => t.estado === estado).length
}

async function cargar() {
  try {
    const res = await (window as any).electron.invoke('db:getAll', 'tickets_soporte')
    if (res.success) tickets.value = res.data || []
  } catch {}
}

function abrirNuevoTicket() {
  editando.value = null
  form.value = { cliente_nombre: '', cliente_telefono: '', cliente_email: '', producto: '', descripcion: '', prioridad: 'NORMAL' }
  error.value = ''
  dialogTicket.value = true
}

async function crearTicket() {
  if (!form.value.cliente_nombre.trim() || !form.value.descripcion.trim()) { error.value = 'Nombre y descripcion requeridos'; return }
  guardando.value = true; error.value = ''
  try {
    const codigo = `TK-${Date.now().toString(36).toUpperCase()}`
    const data = { ...form.value, codigo, estado: 'ABIERTO', usuario: '', almacen_id: almacenStore.activeId || 0, almacen_uid: almacenStore.activeUid || '' }
    const res = await (window as any).electron.invoke('db:insert', 'tickets_soporte', data)
    if (!res.success) throw new Error(res.error)
    dialogTicket.value = false
    toast.add({ severity: 'success', summary: 'Ticket creado', detail: codigo, life: 3000 })
    await cargar()
  } catch (e: any) { error.value = e.message || 'Error al crear ticket' }
  finally { guardando.value = false }
}

async function verTicket(t: any) {
  editando.value = { ...t }
  comentarios.value = []
  nuevoComentario.value = ''
  error.value = ''
  dialogTicket.value = true
  const res = await (window as any).electron.invoke('db:getWhere', 'ticket_comentarios', 'ticket_id = ?', [t.id])
  if (res.success) comentarios.value = res.data || []
}

function onEstadoChange() {
  if (editando.value.estado === 'RESUELTO' || editando.value.estado === 'CERRADO') {
    editando.value.fecha_cierre = new Date().toISOString().split('T')[0]
  }
}

async function actualizarTicket() {
  guardando.value = true
  try {
    const cambios: any = { estado: editando.value.estado, prioridad: editando.value.prioridad }
    if (editando.value.solucion) cambios.solucion = editando.value.solucion
    if (editando.value.fecha_cierre) cambios.fecha_cierre = editando.value.fecha_cierre
    const res = await (window as any).electron.invoke('db:update', 'tickets_soporte', editando.value.id, cambios)
    if (!res.success) throw new Error(res.error)
    dialogTicket.value = false
    toast.add({ severity: 'success', summary: 'Ticket actualizado', detail: editando.value.codigo, life: 3000 })
    await cargar()
  } catch (e: any) { toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 }) }
  finally { guardando.value = false }
}

async function agregarComentario() {
  if (!nuevoComentario.value.trim() || !editando.value?.id) return
  try {
    const res = await (window as any).electron.invoke('db:insert', 'ticket_comentarios', {
      ticket_id: editando.value.id, comentario: nuevoComentario.value.trim(), tipo: 'COMENTARIO', usuario: '',
    })
    if (res.success) {
      comentarios.value.push({ id: res.data.id, ticket_id: editando.value.id, comentario: nuevoComentario.value.trim(), tipo: 'COMENTARIO', usuario: '', created_at: new Date().toISOString() })
      nuevoComentario.value = ''
    }
  } catch {}
}

function cerrarDialogo() {
  dialogTicket.value = false
  editando.value = null
}

onMounted(cargar)
</script>
