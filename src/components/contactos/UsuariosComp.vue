<script setup lang="ts">
import { ref, computed, onMounted } from 'vue'
import IconField from 'primevue/iconfield'
import InputIcon from 'primevue/inputicon'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputText from 'primevue/inputtext'
import InputOtp from 'primevue/inputotp'
import Select from 'primevue/select'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useAuthStore } from '@/stores/auth.store'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'

import { envioElectron } from '@/funciones/funciones.js'

const toast = useToast()
const auth = useAuthStore()
const usuarios = ref<any[]>([])
const loading = ref(false)
const viewMode = ref<'table' | 'cards'>('cards')
const dialogVisible = ref(false)
const deleteDialogVisible = ref(false)
const deleteOtpEnviado = ref(false)
const deleteOtpEmail = ref('')
const deleteOtp = ref('')
const deleteOtpError = ref('')
const deleteOtpLoading = ref(false)
const deleteOtpConfirmando = ref(false)
const isEditing = ref(false)
const selectedUsuario = ref<any>(null)
const selectedUsuarios = ref<any[]>([])
const usuariosPendientesEliminar = ref<any[]>([])
const busqueda = ref('')

const roles = computed(() => {
  return [
    { label: 'Administrador', value: 'Administrador' },
    { label: 'Vendedor', value: 'Vendedor' },
    { label: 'Cajero', value: 'Cajero' },
    { label: 'Usuario', value: 'Usuario' },
    { label: 'Soporte', value: 'Soporte' },
  ]
})

const camposArray = [
  'nombre',
  'email',
  'password',
  'pin',
  'patron',
  'pregunta_secreta',
  'respuesta',
  'fecha',
  'nivel_seguridad',
  'intentos_login',
  'estado',
  'permisos',
  'restrinciones',
  'porciento',
  'imagen',
  'created_at',
  'updated_at',
]

const link = ref('')
const api = ref('')
const token = ref('')
const patronTelefono = ref('')
const linkImpresora = ref('')
const patroncedula = ref('')
const tokenCorto = ref('')

const formDefault = () => ({
  nombre: '',
  usuario: '',
  pin: '',
  rol: 'Usuario',
})

const form = ref(formDefault())

function onDialogKeydown(e: KeyboardEvent) {
  if (e.shiftKey && e.ctrlKey) {
    showSoporte.value = true
  }
}

const usuariosFiltrados = computed(() => {
  let data = usuarios.value.filter(u => u.nivel_seguridad?.toLowerCase() !== 'soporte')
  const texto = busqueda.value.toLowerCase().trim()
  if (!texto) return data
  return data.filter(u =>
    u.nombre?.toLowerCase().includes(texto) ||
    u.email?.toLowerCase().includes(texto) ||
    u.nivel_seguridad?.toLowerCase().includes(texto)
  )
})

async function cargarUsuarios() {
  loading.value = true
  try {
    const res = await window.db.getAll('usuarios')
    if (res.success) {
      usuarios.value = res.data || []
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron cargar los usuarios', life: 3000 })
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

function abrirCrear() {
  isEditing.value = false
  selectedUsuario.value = null
  form.value = formDefault()
  dialogVisible.value = true
}

function abrirEditar(usuario: any) {
  isEditing.value = true
  selectedUsuario.value = usuario
  form.value = {
    nombre: usuario.nombre || '',
    usuario: usuario.email || '',
    pin: usuario.pin || '',
    rol: usuario.nivel_seguridad || 'Usuario',
  }
  dialogVisible.value = true
}

function confirmarBorrar(usuario: any) {
  selectedUsuario.value = usuario
  usuariosPendientesEliminar.value = [usuario]
  resetDeleteOtp()
  deleteDialogVisible.value = true
}

function confirmarBorrarSeleccionados() {
  if (!selectedUsuarios.value.length) return
  usuariosPendientesEliminar.value = [...selectedUsuarios.value]
  selectedUsuario.value = usuariosPendientesEliminar.value[0] || null
  resetDeleteOtp()
  deleteDialogVisible.value = true
}

function resetDeleteOtp() {
  deleteOtpEnviado.value = false
  deleteOtpEmail.value = ''
  deleteOtp.value = ''
  deleteOtpError.value = ''
  deleteOtpLoading.value = false
  deleteOtpConfirmando.value = false
}

function cancelarBorrado() {
  deleteDialogVisible.value = false
  usuariosPendientesEliminar.value = []
  resetDeleteOtp()
}

async function solicitarOtpEliminarUsuario() {
  if (!usuariosPendientesEliminar.value.length) return
  const ids = usuariosPendientesEliminar.value.map(usuario => Number(usuario.id)).filter(Boolean)
  deleteOtpError.value = ''
  deleteOtp.value = ''
  deleteOtpLoading.value = true
  try {
    const res = await window.electron.invoke('facturas:solicitarOtpEliminar', {
      id: ids[0],
      facturaIds: ids,
      no_factura: ids.length > 1 ? `USUARIOS-${ids.length}` : `USUARIO-${ids[0]}`,
      nombre_cliente: ids.length > 1
        ? `${ids.length} USUARIOS`
        : usuariosPendientesEliminar.value[0]?.nombre || usuariosPendientesEliminar.value[0]?.email || 'USUARIO',
      cantidad: ids.length,
      total: 0,
    }) as any
    if (res.success) {
      deleteOtpEmail.value = res.data?.networkUrl || ''
      deleteOtpEnviado.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      deleteOtpError.value = res.error || 'No se pudo enviar el codigo'
    }
  } catch (error: any) {
    deleteOtpError.value = error?.message || 'Error solicitando codigo'
  } finally {
    deleteOtpLoading.value = false
  }
}

async function confirmarOtpEliminarUsuario(): Promise<boolean> {
  if (!usuariosPendientesEliminar.value.length) return false
  const ids = usuariosPendientesEliminar.value.map(usuario => Number(usuario.id)).filter(Boolean)
  const codigo = String(deleteOtp.value || '').replace(/\D/g, '')
  if (!/^\d{4}$/.test(codigo)) {
    deleteOtpError.value = 'Introduce el codigo de 4 digitos'
    return false
  }
  deleteOtpConfirmando.value = true
  deleteOtpError.value = ''
  try {
    const res = await window.electron.invoke('facturas:confirmarOtpEliminar', {
      facturaId: ids[0],
      facturaIds: ids,
      codigo,
    }) as any
    if (!res.success) {
      deleteOtpError.value = res.error || 'Codigo no valido'
      return false
    }
    return true
  } catch (error: any) {
    deleteOtpError.value = error?.message || 'Error al confirmar codigo'
    return false
  } finally {
    deleteOtpConfirmando.value = false
  }
}

function normalizarPin(event: Event) {
  const input = event.target as HTMLInputElement
  const valor = input.value.replace(/\D/g, '').slice(0, 4)
  input.value = valor
  form.value.pin = valor
}

function bloquearPinNoNumerico(event: KeyboardEvent) {
  const teclasPermitidas = ['Backspace', 'Delete', 'Tab', 'ArrowLeft', 'ArrowRight', 'Home', 'End']
  if (teclasPermitidas.includes(event.key)) return
  if (!/^\d$/.test(event.key) || form.value.pin.length >= 4) {
    event.preventDefault()
  }
}

async function guardar() {
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre es requerido', life: 3000 })
    return
  }

  if (!form.value.usuario.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El usuario es requerido', life: 3000 })
    return
  }

  if (form.value.pin.length !== 4) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El PIN debe tener 4 digitos', life: 3000 })
    return
  }

  try {
    let usuarioId = 0
    const data = {
      nombre: form.value.nombre.trim().toUpperCase(),
      email: form.value.usuario.trim().toLowerCase(),
      password: selectedUsuario.value?.password || '',
      pin: form.value.pin,
      patron: selectedUsuario.value?.patron || '',
      pregunta_secreta: selectedUsuario.value?.pregunta_secreta || '',
      respuesta: selectedUsuario.value?.respuesta || '',
      fecha: selectedUsuario.value?.fecha || '',
      nivel_seguridad: form.value.rol,
      intentos_login: selectedUsuario.value?.intentos_login || '',
      estado: selectedUsuario.value?.estado || 'ACTIVADO',
      permisos: selectedUsuario.value?.permisos || '',
      restrinciones: selectedUsuario.value?.restrinciones || '',
      porciento: selectedUsuario.value?.porciento || '',
      imagen: selectedUsuario.value?.imagen || '',
    }

    if (isEditing.value) {
      const res = await window.db.update('usuarios', selectedUsuario.value.id, data)
      if (res.success) {
        usuarioId = Number(selectedUsuario.value.id)
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo actualizar', life: 3000 })
        return
      }
    } else {
      const res = await window.db.insert('usuarios', data)
      if (res.success) {
        usuarioId = Number(res.data?.id || 0)
      } else {
        toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo crear', life: 3000 })
        return
      }
    }

    if (usuarioId && isOnline()) {
      const cloud = await pushLocalRowToCloud('usuarios', usuarioId)
      if (!cloud.success) {
        toast.add({
          severity: 'warn',
          summary: 'Guardado localmente',
          detail: cloud.error || 'El usuario no pudo guardarse en la API; se reintentara en la proxima sincronizacion',
          life: 5000,
        })
      } else {
        toast.add({
          severity: 'success',
          summary: 'Exito',
          detail: isEditing.value ? 'Usuario actualizado y sincronizado' : 'Usuario creado y sincronizado',
          life: 3000,
        })
      }
    } else {
      toast.add({
        severity: 'success',
        summary: 'Exito',
        detail: isEditing.value ? 'Usuario actualizado' : 'Usuario creado',
        life: 3000,
      })
    }

    dialogVisible.value = false
    await cargarUsuarios()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al guardar', life: 3000 })
  }
}

async function borrar() {
  if (!await confirmarOtpEliminarUsuario()) return
  try {
    const resultados = await Promise.all(
      usuariosPendientesEliminar.value.map(usuario => window.db.delete('usuarios', usuario.id))
    )
    const eliminados = resultados.filter(resultado => resultado.success).length
    const errores = resultados.filter(resultado => !resultado.success).length
    if (errores) {
      toast.add({
        severity: eliminados ? 'warn' : 'error',
        summary: eliminados ? 'Eliminacion parcial' : 'Error',
        detail: `${eliminados} eliminado(s), ${errores} no se pudieron eliminar`,
        life: 4000,
      })
      if (!eliminados) return
    } else {
      toast.add({
        severity: 'success',
        summary: 'Exito',
        detail: eliminados === 1 ? 'Usuario eliminado' : `${eliminados} usuarios eliminados`,
        life: 3000,
      })
    }
    deleteDialogVisible.value = false
    selectedUsuarios.value = []
    usuariosPendientesEliminar.value = []
    selectedUsuario.value = null
    resetDeleteOtp()
    await cargarUsuarios()
  } catch (error) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Error al eliminar', life: 3000 })
  }
}

onMounted(async () => {
  try {
    const datosJSON = await envioElectron('datosarchivo')
    if (datosJSON) {
      link.value = datosJSON.VITE_LINKURL || ''
      api.value = datosJSON.VITE_LINK_API || ''
      token.value = datosJSON.VITE_TOKEN || ''
      patronTelefono.value = datosJSON.VITE_PATRON_TELEFONO || ''
      linkImpresora.value = datosJSON.VITE_IMPRESORA_LOCAL || ''
      patroncedula.value = datosJSON.VITE_PATRON_CEDULA || ''
      tokenCorto.value = datosJSON.VITE_TOKEN_CORTO || ''
    }
  } catch (error) {
    console.error('Error cargando configuracion:', error)
  }

  await cargarUsuarios()
})
</script>

<template>
  <div>
    <Toast />

    <Fieldset legend="Usuarios">
      <div class="flex items-center justify-between mb-4 gap-2 flex-wrap">
        <IconField>
          <InputIcon class="pi pi-search" />
          <InputText v-model="busqueda" placeholder="Buscar usuario..." />
        </IconField>

        <div class="flex items-center gap-2">
          <div class="inline-flex rounded-lg border border-surface-200 dark:border-surface-700 overflow-hidden">
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer"
              :class="viewMode === 'table'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'table'"
            >
              <i class="pi pi-list"></i>
            </button>
            <button
              class="px-3 py-1.5 text-sm font-medium transition-colors cursor-pointer border-l border-surface-200 dark:border-surface-700"
              :class="viewMode === 'cards'
                ? 'bg-primary text-primary-contrast'
                : 'bg-surface-0 dark:bg-surface-800 text-surface-600 dark:text-surface-300 hover:bg-surface-100 dark:hover:bg-surface-700'"
              @click="viewMode = 'cards'"
            >
              <i class="pi pi-th-large"></i>
            </button>
          </div>
          <Button label="Nuevo Usuario" icon="pi pi-plus" @click="abrirCrear" />
        </div>
      </div>

      <div
        v-if="viewMode === 'table' && selectedUsuarios.length"
        class="flex items-center justify-between gap-3 mb-3 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950/25 px-3 py-2"
      >
        <span class="text-sm font-medium">{{ selectedUsuarios.length }} usuario(s) seleccionado(s)</span>
        <div class="flex items-center gap-2">
          <Button
            label="Eliminar seleccionados"
            icon="pi pi-trash"
            severity="danger"
            size="small"
            @click="confirmarBorrarSeleccionados"
          />
          <Button icon="pi pi-times" severity="secondary" text rounded size="small" v-tooltip="'Limpiar seleccion'" @click="selectedUsuarios = []" />
        </div>
      </div>

      <DataTable
        v-if="viewMode === 'table'"
        :value="usuariosFiltrados"
        :loading="loading"
        stripedRows
        paginator
        :rows="10"
        :rowsPerPageOptions="[10, 25, 50]"
        dataKey="id"
        responsiveLayout="scroll"
        v-model:selection="selectedUsuarios"
      >
        <Column selectionMode="multiple" headerStyle="width: 3rem" />
        <Column header="Acciones" style="width: 8rem">
          <template #body="{ data }">
            <div class="flex gap-1">
              <Button icon="pi pi-pencil" severity="info" text rounded @click.stop="abrirEditar(data)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded @click.stop="confirmarBorrar(data)" v-tooltip="'Eliminar'" />
            </div>
          </template>
        </Column>
        <Column field="id" header="ID" style="width: 5rem" />
        <Column field="nombre" header="Nombre" sortable />
        <Column field="email" header="Usuario" sortable />
        <Column field="pin" header="PIN" sortable style="width: 6rem">
          <template #body="{ data }">
            <span v-if="data.pin" class="tracking-widest font-mono">{{ '•'.repeat(String(data.pin).length) }}</span>
            <span v-else class="text-surface-400">—</span>
          </template>
        </Column>
        <Column field="nivel_seguridad" header="Rol" sortable style="width: 10rem" />

        <template #empty>
          <div class="text-center py-6 text-surface-500">No hay usuarios registrados.</div>
        </template>
      </DataTable>

      <div v-else>
        <div v-if="loading" class="text-center py-10 text-surface-500">Cargando...</div>
        <div v-else-if="usuariosFiltrados.length === 0" class="text-center py-10 text-surface-500">No hay usuarios registrados.</div>
        <div v-else class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          <div
            v-for="usuario in usuariosFiltrados"
            :key="usuario.id"
            class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex flex-col gap-3 transition-shadow hover:shadow-md hover:border-primary-300 dark:hover:border-primary-600 cursor-pointer"
            @click="abrirEditar(usuario)"
          >
            <div class="flex items-center justify-between">
              <span class="text-xs font-mono text-surface-400">#{{ usuario.id }}</span>
              <i class="pi pi-id-card text-primary-500"></i>
            </div>

            <div class="min-w-0">
              <h4 class="font-bold text-lg leading-tight uppercase truncate">{{ usuario.nombre }}</h4>
              <p class="text-sm text-surface-500 dark:text-surface-400 truncate">{{ usuario.email || 'Sin usuario' }}</p>
            </div>

            <div class="grid grid-cols-1 gap-1 text-sm">
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-lock text-surface-400"></i>
                <span class="truncate">{{ usuario.nivel_seguridad || 'Usuario' }}</span>
              </div>
              <div class="flex items-center gap-2 min-w-0">
                <i class="pi pi-hashtag text-surface-400"></i>
                <span class="truncate tracking-widest font-mono">PIN: {{ usuario.pin ? '•'.repeat(String(usuario.pin).length) : '----' }}</span>
              </div>
            </div>

            <div class="flex gap-2 mt-auto pt-2 border-t border-surface-100 dark:border-surface-700">
              <Button icon="pi pi-pencil" severity="info" text rounded size="small" @click.stop="abrirEditar(usuario)" v-tooltip="'Editar'" />
              <Button icon="pi pi-trash" severity="danger" text rounded size="small" @click.stop="confirmarBorrar(usuario)" v-tooltip="'Eliminar'" />
            </div>
          </div>
        </div>
      </div>
    </Fieldset>

    <Dialog
      v-model:visible="dialogVisible"
      :header="isEditing ? 'Editar Usuario' : 'Nuevo Usuario'"
      modal
      :style="{ width: '30rem' }"
      @keydown="onDialogKeydown"
    >
      <div class="grid grid-cols-1 gap-4 pt-2">
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Nombre</label>
          <InputText v-model="form.nombre" placeholder="Nombre" fluid class="uppercase" style="text-transform: uppercase;" />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Usuario</label>
          <InputText v-model="form.usuario" placeholder="Usuario" fluid />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">PIN</label>
          <InputText
            v-model="form.pin"
            placeholder="0000"
            fluid
            type="password"
            inputmode="numeric"
            maxlength="4"
            @keydown="bloquearPinNoNumerico"
            @input="normalizarPin"
          />
        </div>
        <div class="flex flex-col gap-1">
          <label class="font-semibold text-sm">Rol</label>
          <Select v-model="form.rol" :options="roles" optionLabel="label" optionValue="value" fluid />
        </div>
      </div>

      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogVisible = false" />
        <Button :label="isEditing ? 'Actualizar' : 'Guardar'" icon="pi pi-check" @click="guardar" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="deleteDialogVisible"
      header="Confirmar"
      modal
      :style="{ width: '24rem' }"
    >
      <div class="space-y-4">
        <div class="flex items-center gap-3">
          <i class="pi pi-exclamation-triangle text-3xl text-red-500"></i>
          <span v-if="usuariosPendientesEliminar.length === 1">
            Seguro que deseas eliminar <strong>{{ usuariosPendientesEliminar[0]?.nombre }}</strong>?
          </span>
          <span v-else>
            Seguro que deseas eliminar los <strong>{{ usuariosPendientesEliminar.length }} usuarios seleccionados</strong>?
          </span>
        </div>
        <div class="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-3 text-sm text-amber-800 dark:text-amber-200">
          Esta accion requiere el codigo OTP enviado al correo de la empresa.
        </div>
        <div v-if="deleteOtpEnviado" class="space-y-2">
          <p class="text-xs text-surface-500">Consulta el codigo de 4 digitos en el Centro OTP: {{ deleteOtpEmail || 'Configuracion > OTP Local' }}.</p>
          <InputOtp v-model="deleteOtp" :length="4" integerOnly />
        </div>
        <p v-if="deleteOtpError" class="text-sm text-red-500">{{ deleteOtpError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="cancelarBorrado" />
        <Button
          v-if="!deleteOtpEnviado"
          label="Enviar OTP"
          icon="pi pi-send"
          severity="warning"
          :loading="deleteOtpLoading"
          @click="solicitarOtpEliminarUsuario"
        />
        <Button
          v-else
          :label="usuariosPendientesEliminar.length > 1 ? 'Eliminar seleccionados' : 'Confirmar y eliminar'"
          icon="pi pi-trash"
          severity="danger"
          :loading="deleteOtpConfirmando"
          :disabled="String(deleteOtp || '').length !== 4"
          @click="borrar"
        />
      </template>
    </Dialog>
  </div>
</template>
