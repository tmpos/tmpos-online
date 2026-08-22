<template>
  <div class="p-4 sm:p-6 max-w-5xl mx-auto">
    <div class="flex items-center justify-between mb-6">
      <div>
        <h1 class="text-2xl font-bold">Almacenes / Empresas</h1>
        <p class="text-sm text-surface-500">Gestiona los almacenes y empresas del sistema</p>
      </div>
      <button @click="abrirNuevo" class="flex items-center gap-2 px-4 py-2.5 rounded-lg text-white text-sm font-semibold transition-all hover:opacity-90" :style="{ background: 'var(--p-primary-500)' }">
        <i class="pi pi-plus"></i>Nuevo Almacen
      </button>
    </div>

    <div v-if="loading" class="text-center py-16 text-surface-500"><i class="pi pi-spin pi-spinner text-2xl mb-2 block"></i>Cargando...</div>

    <div v-else class="grid gap-4">
      <div v-for="a in almacenes" :key="a.id" class="flex items-center justify-between p-4 rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800">
        <div class="flex items-center gap-4">
          <div class="w-10 h-10 rounded-xl flex items-center justify-center text-white text-sm font-bold" :style="{ background: a.id === almacenStore.activeId ? 'var(--p-primary-500)' : 'var(--p-primary-300)' }">
            {{ a.nombre?.charAt(0) || 'A' }}
          </div>
          <div>
            <div class="font-semibold">{{ a.nombre }} <span v-if="a.id === almacenStore.defaultId" class="text-xs text-primary-500 font-normal">(Predeterminada en este equipo)</span></div>
            <div class="text-xs text-surface-500">{{ a.codigo || 'Sin codigo' }}{{ a.direccion ? ' - ' + a.direccion : '' }}</div>
          </div>
        </div>
        <div class="flex items-center gap-2">
          <button v-if="auth.isAdmin && a.id !== almacenStore.defaultId" @click="establecerPredeterminado(a)" class="px-3 py-1.5 rounded-lg text-xs font-medium border border-surface-300 dark:border-surface-600 hover:bg-surface-100 dark:hover:bg-surface-700">Usar en este equipo</button>
          <button @click="editar(a)" class="w-8 h-8 flex items-center justify-center rounded-lg text-surface-400 hover:text-surface-700 dark:hover:text-surface-200 hover:bg-surface-100 dark:hover:bg-surface-700"><i class="pi pi-pencil text-xs"></i></button>
          <button v-if="a.id !== 1" @click="confirmarEliminar(a)" class="w-8 h-8 flex items-center justify-center rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"><i class="pi pi-trash text-xs"></i></button>
        </div>
      </div>
    </div>

    <Dialog v-model:visible="dialogVisible" :header="editando ? 'Editar Almacen' : 'Nuevo Almacen'" modal :style="{ width: 'min(28rem, 92vw)' }" :draggable="false">
      <div class="flex flex-col gap-3 pt-2">
        <div>
          <label class="text-xs font-semibold mb-1 block">Nombre <span class="text-red-500">*</span></label>
          <input v-model="form.nombre" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Nombre del almacen" />
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Codigo</label>
          <input v-model="form.codigo" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="PRINCIPAL" />
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">Direccion</label>
          <input v-model="form.direccion" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Direccion" />
        </div>
        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="text-xs font-semibold mb-1 block">Telefono</label>
            <input v-model="form.telefono" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Telefono" />
          </div>
          <div>
            <label class="text-xs font-semibold mb-1 block">Email</label>
            <input v-model="form.email" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="Email" />
          </div>
        </div>
        <div>
          <label class="text-xs font-semibold mb-1 block">RNC</label>
          <input v-model="form.rnc" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-sm outline-none focus:ring-2 focus:ring-primary-500" placeholder="RNC" />
        </div>
        <p v-if="error" class="text-red-500 text-xs">{{ error }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="editando ? 'Guardar' : 'Crear'" icon="pi pi-check" :loading="guardando" @click="guardar" />
      </template>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" header="Eliminar Almacen" modal :style="{ width: 'min(24rem, 92vw)' }">
      <p class="text-sm text-surface-500 text-center">¿Estas seguro de eliminar <strong>{{ eliminando?.nombre }}</strong>?</p>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" severity="danger" icon="pi pi-trash" :loading="guardando" @click="eliminar" />
      </template>
    </Dialog>
  </div>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Dialog from 'primevue/dialog'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useAuthStore } from '@/stores/auth.store'

const toast = useToast()

const almacenStore = useAlmacenStore()
const auth = useAuthStore()

const loading = ref(true)
const almacenes = ref([])
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const editando = ref(false)
const guardando = ref(false)
const error = ref('')
const eliminando = ref(null)
const form = ref({ nombre: '', codigo: '', direccion: '', telefono: '', email: '', rnc: '' })

async function cargar() {
  loading.value = true
  try {
    const res = await (window as any).electron.invoke('db:getAll', 'almacenes')
    if (res.success && res.data) almacenes.value = res.data
  } catch {} finally { loading.value = false }
}

function abrirNuevo() {
  editando.value = false
  form.value = { nombre: '', codigo: '', direccion: '', telefono: '', email: '', rnc: '' }
  error.value = ''
  dialogVisible.value = true
}

function establecerPredeterminado(almacen: any) {
  if (!auth.isAdmin) {
    toast.add({ severity: 'warn', summary: 'Acceso restringido', detail: 'Solo un administrador puede cambiar la tienda predeterminada', life: 3000 })
    return
  }
  almacenStore.setDefault(almacen.id)
  toast.add({ severity: 'success', summary: 'Tienda predeterminada', detail: `${almacen.nombre} quedó asignada a este equipo`, life: 2500 })
  setTimeout(() => window.location.reload(), 500)
}

function editar(a) {
  editando.value = true
  form.value = { nombre: a.nombre, codigo: a.codigo, direccion: a.direccion, telefono: a.telefono, email: a.email, rnc: a.rnc }
  form.value.id = a.id
  error.value = ''
  dialogVisible.value = true
}

async function guardar() {
  if (!form.value.nombre.trim()) { error.value = 'El nombre es requerido'; return }
  guardando.value = true
  error.value = ''
  try {
    if (editando.value) {
      console.log('[Almacenes] Editando almacen:', form.value.id)
      const res = await (window as any).electron.invoke('db:update', 'almacenes', form.value.id, {
        nombre: form.value.nombre.trim(),
        codigo: form.value.codigo.trim().toUpperCase(),
        direccion: form.value.direccion.trim(),
        telefono: form.value.telefono.trim(),
        email: form.value.email.trim(),
        rnc: form.value.rnc.trim(),
      })
      console.log('[Almacenes] Update result:', JSON.stringify(res))
      if (!res.success) throw new Error(res.error)
    } else {
      console.log('[Almacenes] Insertando nuevo almacen')
      const res = await (window as any).electron.invoke('db:insert', 'almacenes', {
        nombre: form.value.nombre.trim(),
        codigo: form.value.codigo.trim().toUpperCase(),
        direccion: form.value.direccion.trim(),
        telefono: form.value.telefono.trim(),
        email: form.value.email.trim(),
        rnc: form.value.rnc.trim(),
      })
      console.log('[Almacenes] Insert result:', JSON.stringify(res))
      if (!res.success) throw new Error(res.error || 'Error al insertar')
      const resGet = await (window as any).electron.invoke('db:getById', 'almacenes', res.data.id)
      console.log('[Almacenes] Get result:', JSON.stringify(resGet))
      if (resGet.success && resGet.data) {
        await almacenStore.load()
      }
    }
    dialogVisible.value = false
    toast.add({ severity: 'success', summary: editando.value ? 'Almacen actualizado' : 'Almacen creado', detail: form.value.nombre, life: 3000 })
    await cargar()
  } catch (e: any) {
    console.error('[Almacenes] Error:', e.message)
    error.value = e.message || 'Error al guardar'
  }
  finally { guardando.value = false }
}

function confirmarEliminar(a) {
  eliminando.value = a
  deleteDialogVisible.value = true
}

async function eliminar() {
  if (!eliminando.value) return
  guardando.value = true
  try {
    await (window as any).electron.invoke('db:delete', 'almacenes', eliminando.value.id)
    deleteDialogVisible.value = false
    eliminando.value = null
    await cargar()
    await almacenStore.load()
  } catch {} finally { guardando.value = false }
}

onMounted(cargar)
</script>
