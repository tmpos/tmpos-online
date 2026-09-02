<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Select from 'primevue/select'
import Chip from 'primevue/chip'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.store'
import { useSystemModeStore } from '@/stores/systemMode'
import { USER_PERMISSION_GROUPS, getDefaultUserPermissions, getUserPermissionOptions, parseUserPermissions } from '@/config/userPermissions'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'

const toast = useToast()
const auth = useAuthStore()
const systemMode = useSystemModeStore()
const usuarios = ref<any[]>([])
const loading = ref(false)
const dialogVisible = ref(false)
const selectedUser = ref<any>(null)
const permisosSeleccionados = ref<string[]>([])
const deleteDialogVisible = ref(false)
const selectedDeleteUser = ref<any>(null)

const opcionesPermisos = computed(() => getUserPermissionOptions(systemMode.isGeneralStore))
const permisosPredeterminados = computed(() => getDefaultUserPermissions(systemMode.isGeneralStore))

async function cargarUsuarios() {
  loading.value = true
  try {
    const res = await window.db.getAll('usuarios')
    if (res.success) {
      usuarios.value = res.data || []
    }
  } catch (_) {
  } finally {
    loading.value = false
  }
}

function esSoporte(usuario: any): boolean {
  return usuario?.nivel_seguridad?.toLowerCase() === 'soporte' || usuario?.rol?.toLowerCase() === 'soporte'
}

function abrirPermisos(usuario: any) {
  if (esSoporte(usuario)) return
  selectedUser.value = usuario
  permisosSeleccionados.value = parseUserPermissions(usuario.permisos, permisosPredeterminados.value)
  dialogVisible.value = true
}

async function guardarPermisos() {
  try {
    const data = { permisos: JSON.stringify(permisosSeleccionados.value) }
    const res = await window.db.update('usuarios', selectedUser.value.id, data)
    if (res.success) {
      if (Number((auth.user as any)?.id || 0) === Number(selectedUser.value.id)) {
        ;(auth.user as any).permisos = data.permisos
      }

      let sincronizado = true
      if (isOnline()) {
        const cloud = await pushLocalRowToCloud('usuarios', Number(selectedUser.value.id))
        sincronizado = cloud.success
      }

      toast.add({
        severity: sincronizado ? 'success' : 'warn',
        summary: sincronizado ? 'Exito' : 'Guardado localmente',
        detail: sincronizado
          ? 'Permisos actualizados'
          : 'Los permisos se sincronizaran con TM Cloud en el proximo intento',
        life: sincronizado ? 3000 : 5000,
      })
      dialogVisible.value = false
      await cargarUsuarios()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
    }
  } catch (_) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

const gruposPermisos = USER_PERMISSION_GROUPS

function opcionesPorGrupo(grupo: string) {
  return opcionesPermisos.value.filter(o => o.grupo === grupo)
}

function togglePermiso(key: string) {
  const current = [...permisosSeleccionados.value]
  const idx = current.indexOf(key)
  if (idx >= 0) current.splice(idx, 1)
  else current.push(key)
  permisosSeleccionados.value = current
}

function confirmarBorrar(usuario: any) {
  selectedDeleteUser.value = usuario
  deleteDialogVisible.value = true
}

async function borrarUsuario() {
  if (!selectedDeleteUser.value) return
  try {
    const res = await window.db.delete('usuarios', selectedDeleteUser.value.id)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Eliminado', detail: 'Usuario eliminado', life: 3000 })
      deleteDialogVisible.value = false
      await cargarUsuarios()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo eliminar', life: 3000 })
    }
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

onMounted(cargarUsuarios)
</script>

<template>
  <div>
    <Toast />
    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5">
      <h3 class="font-semibold text-lg mb-4">Permisos de Usuarios</h3>
      <p class="text-sm text-surface-500 mb-4">Selecciona a que modulos puede acceder cada usuario. Si no tiene permisos asignados, puede acceder a todo.</p>

      <DataTable :value="usuarios" :loading="loading" stripedRows paginator :rows="10" dataKey="id" responsiveLayout="scroll">
        <Column field="nombre" header="Nombre" sortable />
        <Column field="email" header="Usuario" sortable />
        <Column field="nivel_seguridad" header="Rol" sortable style="width: 10rem" />
        <Column header="Permisos" style="width: 14rem">
          <template #body="{ data }">
            <div v-if="esSoporte(data)" class="text-green-600 dark:text-green-400 text-sm font-semibold flex items-center gap-1">
              <i class="pi pi-check-circle"></i> Sin limite
            </div>
            <div v-else-if="data.permisos" class="flex gap-1 flex-wrap">
              <Chip v-for="k in (JSON.parse(data.permisos || '[]'))" :key="k" :label="k" class="text-xs" />
            </div>
            <span v-else class="text-surface-400 text-sm">Todos</span>
          </template>
        </Column>
        <Column header="Acciones" style="width: 10rem">
          <template #body="{ data }">
            <div class="flex gap-1" v-if="!esSoporte(data)">
              <Button icon="pi pi-shield" label="Permisos" size="small" @click="abrirPermisos(data)" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click="confirmarBorrar(data)" v-tooltip="'Eliminar'" />
            </div>
            <span v-else class="text-xs text-surface-400">—</span>
          </template>
        </Column>
        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay usuarios.</div>
        </template>
      </DataTable>
    </div>

    <Dialog v-model:visible="dialogVisible" :header="'Permisos: ' + selectedUser?.nombre" modal :style="{ width: '90%', maxWidth: '500px' }">
      <div class="space-y-3 max-h-96 overflow-y-auto scrollbar-none">
        <p class="text-xs text-surface-500">Selecciona los modulos a los que este usuario puede acceder. Si no seleccionas ninguno, tiene acceso completo.</p>
        <template v-for="grupo in gruposPermisos" :key="grupo">
          <div v-if="opcionesPorGrupo(grupo).length" class="space-y-1.5">
            <h4 class="text-xs font-semibold text-surface-400 uppercase tracking-wider">{{ grupo }}</h4>
            <div class="grid grid-cols-3 gap-1.5">
              <label
                v-for="opt in opcionesPorGrupo(grupo)"
                :key="opt.key"
                class="flex items-center gap-1.5 px-2.5 py-2 rounded-lg border cursor-pointer select-none transition-all text-xs"
                :class="permisosSeleccionados.includes(opt.key)
                  ? 'bg-primary text-primary-contrast border-primary'
                  : 'border-surface-200 dark:border-surface-700 hover:border-primary-300'"
              >
                <i :class="permisosSeleccionados.includes(opt.key) ? 'pi pi-check-circle' : 'pi pi-circle'" class="text-xs"></i>
                <span>{{ opt.label }}</span>
                <input type="checkbox" :checked="permisosSeleccionados.includes(opt.key)" @change="togglePermiso(opt.key)" class="hidden" />
              </label>
            </div>
          </div>
        </template>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button label="Guardar" icon="pi pi-check" @click="guardarPermisos" />
      </template>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" header="Confirmar Eliminacion" :modal="true" :style="{ width: '400px' }">
      <div class="flex items-center gap-3">
        <i class="pi pi-exclamation-triangle text-amber-500 text-2xl"></i>
        <p>¿Estas seguro de eliminar al usuario <strong>{{ selectedDeleteUser?.nombre }}</strong>?</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="deleteDialogVisible = false" />
        <Button label="Eliminar" severity="danger" icon="pi pi-trash" @click="borrarUsuario" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.scrollbar-none::-webkit-scrollbar { display: none; }
.scrollbar-none { scrollbar-width: none; -ms-overflow-style: none; }
</style>
