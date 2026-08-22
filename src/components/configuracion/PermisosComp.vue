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

const opcionesPermisosBase = [
  { label: 'Inicio', key: 'home', grupo: 'General' },
  { label: 'Vender', key: 'vender', grupo: 'Ventas' },
  { label: 'Inventario', key: 'inventario', grupo: 'Inventario' },
  { label: 'Telefonos', key: 'telefonos', grupo: 'Inventario' },
  { label: 'Accesorios', key: 'accesorios', grupo: 'Inventario' },
  { label: 'Electrodomesticos', key: 'electrodomesticos', grupo: 'Inventario' },
  { label: 'IMEI', key: 'imei', grupo: 'Inventario' },
  { label: 'Serial', key: 'serial', grupo: 'Inventario' },
  { label: 'Categorias', key: 'categorias', grupo: 'Inventario' },
  { label: 'Marcas', key: 'marcas', grupo: 'Inventario' },
  { label: 'Etiquetas', key: 'etiquetas', grupo: 'Inventario' },
  { label: 'Cambiazo', key: 'cambiazo', grupo: 'Inventario' },
  { label: 'Transferencias', key: 'transferencias', grupo: 'Inventario' },
  { label: 'Reporte Inventario', key: 'reporte', grupo: 'Inventario' },
  { label: 'Perdidas', key: 'perdidas', grupo: 'Inventario' },
  { label: 'Taller', key: 'taller', grupo: 'Taller' },
  { label: 'Ordenes', key: 'ordenes', grupo: 'Taller' },
  { label: 'Orden Express', key: 'orden-express', grupo: 'Taller' },
  { label: 'Piezas', key: 'piezas', grupo: 'Taller' },
  { label: 'Tecnicos', key: 'tecnicos', grupo: 'Taller' },
  { label: 'Garantias', key: 'garantias', grupo: 'Taller' },
  { label: 'Reporte Taller', key: 'reporte', grupo: 'Taller' },
  { label: 'Contactos', key: 'contactos', grupo: 'Contactos' },
  { label: 'Clientes', key: 'clientes', grupo: 'Contactos' },
  { label: 'Usuarios', key: 'usuarios', grupo: 'Contactos' },
  { label: 'Proveedores', key: 'proveedores', grupo: 'Contactos' },
  { label: 'Contabilidad', key: 'contabilidad', grupo: 'Contabilidad' },
  { label: 'Caja', key: 'caja', grupo: 'Contabilidad' },
  { label: 'Comprar', key: 'comprar', grupo: 'Contabilidad' },
  { label: 'Cuadre', key: 'cuadre', grupo: 'Contabilidad' },
  { label: 'CxC', key: 'cxc', grupo: 'Contabilidad' },
  { label: 'CxP', key: 'cxp', grupo: 'Contabilidad' },
  { label: 'Bancos', key: 'bancos', grupo: 'Contabilidad' },
  { label: 'Gastos', key: 'gastos', grupo: 'Contabilidad' },
  { label: 'Gastos Fijos', key: 'gastos-fijos', grupo: 'Contabilidad' },
  { label: 'Utilidades', key: 'utilidades', grupo: 'Contabilidad' },
  { label: 'Catalogo Cuentas', key: 'catalogo', grupo: 'Contabilidad' },
  { label: 'Balance General', key: 'balance', grupo: 'Contabilidad' },
  { label: 'Comprobantes', key: 'comprobantes', grupo: 'Contabilidad' },
  { label: 'Ventas', key: 'ventas', grupo: 'Ventas' },
  { label: 'Facturas', key: 'facturas', grupo: 'Ventas' },
  { label: 'Cotizaciones', key: 'cotizaciones', grupo: 'Ventas' },
  { label: 'Apartados', key: 'apartados', grupo: 'Ventas' },
  { label: 'Recibidos', key: 'recibidos', grupo: 'Ventas' },
  { label: 'Notas Credito', key: 'notas-credito', grupo: 'Ventas' },
  { label: 'Notas Admin', key: 'notas', grupo: 'Ventas' },
  { label: 'Reportes', key: 'reportes', grupo: 'Reportes' },
  { label: 'Reporte General', key: 'general', grupo: 'Reportes' },
  { label: 'Reporte 606', key: '606', grupo: 'Reportes' },
  { label: 'Reporte 607', key: '607', grupo: 'Reportes' },
  { label: 'Reporte Gastos', key: 'gastos', grupo: 'Reportes' },
  { label: 'Reporte Ventas', key: 'ventas', grupo: 'Reportes' },
  { label: 'Reporte Ganancias', key: 'ganancias', grupo: 'Reportes' },
  { label: 'Configuracion', key: 'configuracion', grupo: 'Configuracion' },
  { label: 'Eliminar registros', key: 'accion_eliminar', grupo: 'Acciones sensibles' },
  { label: 'Modificar precios y costos', key: 'accion_precios', grupo: 'Acciones sensibles' },
  { label: 'Administrar usuarios', key: 'accion_usuarios', grupo: 'Acciones sensibles' },
  { label: 'Mover inventario entre almacenes', key: 'accion_trasladar', grupo: 'Acciones sensibles' },
  { label: 'Anular o editar facturas', key: 'accion_facturas', grupo: 'Acciones sensibles' },
]

const opcionesPermisos = computed(() => opcionesPermisosBase
  .filter(option => !systemMode.isGeneralStore || !['telefonos', 'imei', 'cambiazo', 'recibidos'].includes(option.key))
  .map(option => option.key === 'accesorios' && systemMode.isGeneralStore
    ? { ...option, label: 'Productos' }
    : option))

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
  try {
    const p = usuario.permisos ? JSON.parse(usuario.permisos) : []
    permisosSeleccionados.value = Array.isArray(p) ? p : []
  } catch {
    permisosSeleccionados.value = []
  }
  dialogVisible.value = true
}

async function guardarPermisos() {
  try {
    const data = { permisos: JSON.stringify(permisosSeleccionados.value) }
    const res = await window.db.update('usuarios', selectedUser.value.id, data)
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Permisos actualizados', life: 3000 })
      dialogVisible.value = false
      await cargarUsuarios()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
    }
  } catch (_) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

const gruposPermisos = ['General', 'Ventas', 'Inventario', 'Taller', 'Contactos', 'Contabilidad', 'Reportes', 'Configuracion']

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
