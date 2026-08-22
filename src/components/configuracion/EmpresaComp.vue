<script setup lang="ts">
import { computed, ref, onMounted } from 'vue'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import Fieldset from 'primevue/fieldset'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { useEmpresa } from '@/composables/useEmpresa'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useAuthStore } from '@/stores/auth.store'
import { uploadImage, getImageUrl, deleteImage } from '@/services/tmCloudClient'
import { isOnline, pushLocalRowToCloud } from '@/services/tmCloudSyncService'
import { useLocaleProfile } from '@/composables/useLocaleProfile'

const toast = useToast()
const almacenStore = useAlmacenStore()
const auth = useAuthStore()
const puedeEditarEmpresa = computed(() => Boolean(auth.isAdmin || auth.isSoporte))
const { fiscal } = useLocaleProfile()
const { empresa, cargar: cargarEmpresa, guardar: guardarEmpresa, nombre } = useEmpresa()
const loading = ref(false)
const guardando = ref(false)
const cambiandoTienda = ref(false)
const tiendaSeleccionada = ref<string | null>(null)
const deleteDialogVisible = ref(false)
const eliminandoEmpresa = ref(false)
const nuevoAlmacenDialogVisible = ref(false)
const creandoAlmacen = ref(false)
const registrandoEmpresaAlmacen = ref(false)
const marcarTodosDialogVisible = ref(false)
const marcandoTodosLosDatos = ref(false)
const nuevoAlmacenForm = ref({
  nombre: '',
  legal: '',
  encargado: '',
  telefono: '',
  email: '',
  direccion: '',
})

const logoInput = ref<HTMLInputElement | null>(null)
const logoPreview = ref('')
const subiendoLogo = ref(false)

const form = ref({
  nombre: '',
  legal: '',
  encargado: '',
  telefono: '',
  email: '',
  direccion: '',
  logo: '',
})

const empresaActualEsAlmacen = computed(() => {
  const empresaId = Number(empresa.value?.id || 0)
  if (!empresaId) return false

  return almacenStore.almacenes.some((item: any) =>
    Number(item.empresa_id || 0) === empresaId
    && Number(item.almacen_id || 0) > 0
    && Boolean(String(item.uid || item.almacen_uid || '').trim())
  )
})

async function cargar() {
  loading.value = true
  try {
    await cargarEmpresa()
    tiendaSeleccionada.value = almacenStore.activeUid || null
    if (empresa.value) {
      form.value = {
        nombre: empresa.value.nombre || '',
        legal: empresa.value.legal || '',
        encargado: empresa.value.encargado || '',
        telefono: empresa.value.telefono || '',
        email: empresa.value.email || '',
        direccion: empresa.value.direccion || '',
        logo: empresa.value.logo || '',
      }
      logoPreview.value = getImageUrl(empresa.value.logo || '') || empresa.value.logo || ''
    }
  } catch (error) {
    console.error(error)
  } finally {
    loading.value = false
  }
}

async function cambiarTienda() {
  if ((!auth.isAdmin && !auth.isSoporte) || !tiendaSeleccionada.value || tiendaSeleccionada.value === almacenStore.activeUid) return
  cambiandoTienda.value = true
  try {
    const seleccionada = almacenStore.almacenes.find((item: any) => String(item.uid || '') === tiendaSeleccionada.value)
    if (!seleccionada || !almacenStore.setDefault(seleccionada.uid)) return
    await (window as any).config.set('empresa_id', String(seleccionada.empresa_id || seleccionada.id))
    toast.add({ severity: 'success', summary: 'Tienda cambiada', detail: seleccionada.nombre, life: 2000 })
    setTimeout(() => window.location.reload(), 400)
  } finally {
    setTimeout(() => { cambiandoTienda.value = false }, 500)
  }
}

function confirmarEliminarEmpresa() {
  if ((!auth.isAdmin && !auth.isSoporte) || !empresa.value?.id) return
  if (almacenStore.almacenes.length <= 1) {
    toast.add({ severity: 'warn', summary: 'No se puede eliminar', detail: 'Debe existir al menos una empresa en el sistema', life: 3500 })
    return
  }
  deleteDialogVisible.value = true
}

async function eliminarEmpresa() {
  if ((!auth.isAdmin && !auth.isSoporte) || !empresa.value?.id || almacenStore.almacenes.length <= 1) return
  eliminandoEmpresa.value = true
  try {
    const empresaId = Number(empresa.value.id)
    const siguiente = almacenStore.almacenes.find((item: any) => Number(item.empresa_id || item.id) !== empresaId)
    if (!siguiente) throw new Error('No hay otra empresa disponible')

    const res = await window.db.delete('empresa', empresaId)
    if (!res.success) throw new Error(res.error || 'No se pudo eliminar la empresa')

    almacenStore.setDefault(siguiente.uid)
    await (window as any).config.set('empresa_id', String(siguiente.empresa_id || siguiente.id))
    deleteDialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Empresa eliminada', detail: 'Se activará la siguiente empresa disponible', life: 2500 })
    setTimeout(() => window.location.reload(), 500)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo eliminar la empresa', life: 4000 })
  } finally {
    eliminandoEmpresa.value = false
  }
}

function abrirNuevoAlmacen() {
  if (!auth.isAdmin && !auth.isSoporte) return
  nuevoAlmacenForm.value = {
    nombre: '',
    legal: '',
    encargado: '',
    telefono: '',
    email: '',
    direccion: '',
  }
  nuevoAlmacenDialogVisible.value = true
}

async function crearAlmacen() {
  if ((!auth.isAdmin && !auth.isSoporte) || creandoAlmacen.value) return
  const nombreAlmacen = nuevoAlmacenForm.value.nombre.trim().toUpperCase()
  if (!nombreAlmacen) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre del almacen es requerido', life: 3000 })
    return
  }
  if (almacenStore.almacenes.some((item: any) => String(item.nombre || '').trim().toUpperCase() === nombreAlmacen)) {
    toast.add({ severity: 'warn', summary: 'Almacen existente', detail: 'Ya existe un almacen con ese nombre', life: 3000 })
    return
  }

  creandoAlmacen.value = true
  try {
    const data = {
      nombre: nombreAlmacen,
      legal: nuevoAlmacenForm.value.legal.trim().toUpperCase(),
      encargado: nuevoAlmacenForm.value.encargado.trim().toUpperCase(),
      telefono: nuevoAlmacenForm.value.telefono.trim(),
      email: nuevoAlmacenForm.value.email.trim().toLowerCase(),
      direccion: nuevoAlmacenForm.value.direccion.trim().toUpperCase(),
      logo: empresa.value?.logo || '',
      impuesto: Number(empresa.value?.impuesto ?? 18),
      impuesto_incluido: empresa.value?.impuesto_incluido ? 1 : 0,
      moneda: empresa.value?.moneda || '',
      tipo_documento_defecto: empresa.value?.tipo_documento_defecto || '',
    }
    const res = await window.db.insert('empresa', data)
    if (!res.success || !res.data?.id) throw new Error(res.error || 'No se pudo crear el almacen')

    const nuevoId = Number(res.data.id)
    const updateRes = await window.db.update('empresa', nuevoId, { almacen_id: nuevoId })
    if (!updateRes.success) throw new Error(updateRes.error || 'No se pudo completar la configuracion del almacen')

    if (isOnline()) {
      const syncResult = await pushLocalRowToCloud('empresa', nuevoId)
      if (!syncResult.success) {
        toast.add({ severity: 'warn', summary: 'Creado localmente', detail: syncResult.error || 'No se pudo sincronizar el almacen con TM Cloud', life: 5000 })
      }
    }

    await almacenStore.load()
    nuevoAlmacenDialogVisible.value = false
    toast.add({ severity: 'success', summary: 'Almacen creado', detail: nombreAlmacen, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo crear el almacen', life: 4000 })
  } finally {
    creandoAlmacen.value = false
  }
}

async function registrarEmpresaActualComoAlmacen() {
  if ((!auth.isAdmin && !auth.isSoporte) || registrandoEmpresaAlmacen.value || empresaActualEsAlmacen.value) return
  const empresaId = Number(empresa.value?.id || 0)
  if (!empresaId) {
    toast.add({ severity: 'warn', summary: 'Empresa requerida', detail: 'Guarda primero los datos de la empresa', life: 3000 })
    return
  }

  registrandoEmpresaAlmacen.value = true
  try {
    const almacenUid = String(empresa.value?.uid || empresa.value?.almacen_uid || '') || crypto.randomUUID()
    const cambios: Record<string, any> = {
      almacen_id: empresaId,
      almacen_uid: almacenUid,
    }
    if (!empresa.value?.uid) cambios.uid = almacenUid

    const res = await window.db.update('empresa', empresaId, cambios)
    if (!res.success) throw new Error(res.error || 'No se pudo registrar la empresa como almacen')

    empresa.value = { ...empresa.value, ...cambios }
    await almacenStore.load()
    almacenStore.setDefault(almacenUid)
    tiendaSeleccionada.value = almacenUid
    await (window as any).config.set('empresa_id', String(empresaId))

    if (isOnline()) {
      const syncResult = await pushLocalRowToCloud('empresa', empresaId)
      if (!syncResult.success) {
        toast.add({ severity: 'warn', summary: 'Registrado localmente', detail: syncResult.error || 'No se pudo sincronizar el almacen con TM Cloud', life: 5000 })
      }
    }

    toast.add({ severity: 'success', summary: 'Almacen registrado', detail: `${empresa.value?.nombre || 'La empresa actual'} ahora es el almacen principal`, life: 3000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo registrar la empresa como almacen', life: 4000 })
  } finally {
    registrandoEmpresaAlmacen.value = false
  }
}

function confirmarMarcarTodosLosDatos() {
  if (!auth.isAdmin && !auth.isSoporte) return
  if (!empresaActualEsAlmacen.value || !almacenStore.activeUid) {
    toast.add({ severity: 'warn', summary: 'Almacen requerido', detail: 'Primero agrega la empresa actual como almacen', life: 3500 })
    return
  }
  marcarTodosDialogVisible.value = true
}

async function marcarTodosLosDatosConAlmacenActual() {
  if ((!auth.isAdmin && !auth.isSoporte) || marcandoTodosLosDatos.value) return
  const almacenId = Number(empresa.value?.id || almacenStore.activeId || 0)
  const almacenUid = String(almacenStore.activeUid || empresa.value?.uid || empresa.value?.almacen_uid || '')
  if (!almacenId || !almacenUid) return

  marcandoTodosLosDatos.value = true
  try {
    const res = await window.electron.invoke('almacen:asignarTodosLosDatos', {
      almacen_id: almacenId,
      almacen_uid: almacenUid,
    })
    if (!res?.success) throw new Error(res?.error || 'No se pudieron marcar los datos')

    marcarTodosDialogVisible.value = false
    const registros = Number(res.data?.registros || 0)
    const tablas = Number(res.data?.tablas || 0)
    toast.add({
      severity: 'success',
      summary: 'Datos asignados',
      detail: `${registros} registro(s) de ${tablas} tabla(s) fueron marcados con el almacen actual`,
      life: 5000,
    })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudieron marcar los datos', life: 5000 })
  } finally {
    marcandoTodosLosDatos.value = false
  }
}

function seleccionarLogo() {
  if (!puedeEditarEmpresa.value) return
  logoInput.value?.click()
}

async function guardarLogoInmediatamente(logo: string) {
  if (!puedeEditarEmpresa.value) return
  if (!empresa.value?.id) return
  await guardarEmpresa({ logo, almacen_id: almacenStore.activeId || 0, almacen_uid: almacenStore.activeUid || empresa.value?.uid || '' })
  if (isOnline()) {
    const syncResult = await pushLocalRowToCloud('empresa', empresa.value.id)
    if (!syncResult.success) throw new Error(syncResult.error || 'No se pudo sincronizar el logo con TM Cloud')
  }
  window.dispatchEvent(new CustomEvent('empresa:actualizada', { detail: { logo } }))
}

async function procesarLogo(e: Event) {
  if (!puedeEditarEmpresa.value) return
  const input = e.target as HTMLInputElement
  const file = input.files?.[0]
  if (!file) return

  if (!file.type.startsWith('image/')) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Selecciona una imagen valida', life: 3000 })
    return
  }

  if (file.size > 2 * 1024 * 1024) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'La imagen no debe superar 2MB', life: 3000 })
    return
  }

  subiendoLogo.value = true
  try {
    const uid = await uploadImage(file, 'company/logo')
    form.value.logo = uid
    logoPreview.value = getImageUrl(uid) || ''
    await guardarLogoInmediatamente(uid)
    toast.add({ severity: 'success', summary: 'Logo subido', detail: 'El logo se guardo en TM Cloud', life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error al subir', detail: error?.message || 'Configura TM Cloud antes de subir el logo', life: 4000 })
  } finally {
    subiendoLogo.value = false
    if (logoInput.value) logoInput.value.value = ''
  }
}

async function quitarLogo() {
  if (!puedeEditarEmpresa.value) return
  const logoAnterior = form.value.logo
  if (logoAnterior) {
    try { await deleteImage(logoAnterior) } catch {}
  }
  logoPreview.value = ''
  form.value.logo = ''
  try { await guardarLogoInmediatamente('') } catch (error: any) {
    toast.add({ severity: 'warn', summary: 'Logo removido localmente', detail: error?.message || 'No se pudo sincronizar el cambio', life: 4000 })
  }
  if (logoInput.value) logoInput.value.value = ''
}

async function guardar() {
  if (!puedeEditarEmpresa.value) return
  if (!form.value.nombre.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El nombre de la empresa es requerido', life: 3000 })
    return
  }

  guardando.value = true
  try {
    const data: Record<string, any> = {
      nombre: form.value.nombre.trim().toUpperCase(),
      legal: form.value.legal.trim().toUpperCase(),
      encargado: form.value.encargado.trim().toUpperCase(),
      telefono: form.value.telefono.trim(),
      email: form.value.email.trim().toLowerCase(),
      direccion: form.value.direccion.trim().toUpperCase(),
      logo: form.value.logo || '',
      almacen_id: almacenStore.activeId || 0,
      almacen_uid: almacenStore.activeUid || empresa.value?.uid || '',
    }

    await guardarEmpresa(data)
    let sincronizadoEnCloud = false
    if (empresa.value?.id && isOnline()) {
      const syncResult = await pushLocalRowToCloud('empresa', empresa.value.id)
      if (!syncResult.success) {
        toast.add({ severity: 'warn', summary: 'Guardado local', detail: syncResult.error || 'No se pudo sincronizar la empresa con TM Cloud', life: 5000 })
      } else {
        sincronizadoEnCloud = true
      }
    }
    window.dispatchEvent(new CustomEvent('empresa:actualizada', { detail: data }))
    if (sincronizadoEnCloud) {
      toast.add({ severity: 'success', summary: 'Exito', detail: 'Empresa actualizada en TM Cloud', life: 3000 })
    } else if (!isOnline()) {
      toast.add({ severity: 'info', summary: 'Guardado local', detail: 'La empresa se sincronizara cuando vuelva la conexion', life: 4000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'Error al guardar', life: 4000 })
  } finally {
    guardando.value = false
  }
}

onMounted(async () => {
  await cargar()
})
</script>

<template>
  <div>
    <Toast />

    <div v-if="loading" class="flex items-center justify-center py-20 text-surface-400 gap-3">
      <i class="pi pi-spin pi-spinner text-2xl"></i>
      <span>Cargando datos de la empresa...</span>
    </div>

    <div v-else class="max-w-3xl mx-auto space-y-6">
      <div v-if="almacenStore.hasMultiple" class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-4">
        <div>
          <p class="font-semibold text-sm">Empresa / tienda activa</p>
          <p class="text-xs text-surface-500">Los registros de Empresa se utilizan como almacenes del sistema.</p>
        </div>
        <Select
          v-model="tiendaSeleccionada"
          :options="almacenStore.almacenes"
          optionLabel="nombre"
          optionValue="uid"
          class="w-full sm:w-64"
          :disabled="(!auth.isAdmin && !auth.isSoporte) || cambiandoTienda"
          @change="cambiarTienda"
        />
        <small v-if="!auth.isAdmin && !auth.isSoporte" class="text-amber-600">Solo Administrador o Soporte pueden cambiarla.</small>
      </div>

      <div class="flex items-center justify-between gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="flex items-center gap-3">
          <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
            <i class="pi pi-building text-primary text-lg"></i>
          </div>
          <div>
            <h2 class="text-xl font-bold">Datos de la Empresa</h2>
            <p class="text-sm text-surface-500">Informacion general del negocio</p>
          </div>
        </div>
        <div v-if="auth.isAdmin || auth.isSoporte" class="flex flex-wrap items-center justify-end gap-2">
          <Button
            :label="empresaActualEsAlmacen ? 'Empresa actual ya esta en Almacen' : 'Agregar la empresa actual a Almacen'"
            :icon="empresaActualEsAlmacen ? 'pi pi-check-circle' : 'pi pi-building'"
            :severity="empresaActualEsAlmacen ? 'secondary' : 'info'"
            outlined
            :loading="registrandoEmpresaAlmacen"
            :disabled="empresaActualEsAlmacen"
            @click="registrarEmpresaActualComoAlmacen"
          />
          <Button label="Agregar Almacen" icon="pi pi-plus" severity="success" outlined @click="abrirNuevoAlmacen" />
        </div>
      </div>

      <div class="flex flex-col sm:flex-row gap-8">
        <div class="flex-shrink-0 flex flex-col items-center sm:items-start">
          <div
            class="relative w-40 h-40 rounded-2xl border-2 border-dashed border-surface-300 dark:border-surface-600 flex items-center justify-center overflow-hidden bg-surface-50 dark:bg-surface-800 group transition-colors"
            :class="puedeEditarEmpresa ? 'cursor-pointer hover:border-primary-300 dark:hover:border-primary-600' : 'cursor-default'"
            @click="seleccionarLogo"
          >
            <img v-if="logoPreview" :src="logoPreview" class="w-full h-full object-contain p-3" alt="Logo" />
            <div v-else class="flex flex-col items-center gap-2 text-surface-400">
              <i class="pi pi-image text-4xl"></i>
              <span class="text-xs font-medium">{{ puedeEditarEmpresa ? 'Click para subir' : 'Sin logo' }}</span>
            </div>
            <div v-if="puedeEditarEmpresa" class="absolute inset-0 bg-surface-900/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center rounded-2xl">
              <i class="pi pi-camera text-white text-2xl"></i>
            </div>
          </div>
          <div v-if="puedeEditarEmpresa" class="flex items-center gap-2 mt-3">
            <Button icon="pi pi-upload" size="small" severity="secondary" outlined :loading="subiendoLogo" @click="seleccionarLogo">Subir</Button>
            <Button v-if="logoPreview" icon="pi pi-trash" size="small" severity="danger" text @click="quitarLogo">Quitar</Button>
          </div>
          <p class="text-[11px] text-surface-400 mt-1.5">PNG, JPG. Max 2MB.</p>
          <input ref="logoInput" type="file" accept="image/*" class="hidden" :disabled="!puedeEditarEmpresa" @change="procesarLogo" />
        </div>

        <div class="flex-1 space-y-5">
          <div class="space-y-1.5">
            <label class="text-sm font-semibold flex items-center gap-1.5">
              <i class="pi pi-building text-surface-400 text-xs"></i>
              Nombre <span class="text-red-400">*</span>
            </label>
            <InputText v-model="form.nombre" :readonly="!puedeEditarEmpresa" placeholder="Nombre de la empresa" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div class="space-y-1.5">
              <label class="text-sm font-semibold flex items-center gap-1.5">
                <i class="pi pi-id-card text-surface-400 text-xs"></i>
                {{ fiscal.businessIdLabel }} / Razón legal
              </label>
              <InputText v-model="form.legal" :readonly="!puedeEditarEmpresa" :placeholder="fiscal.businessIdLabel" fluid class="uppercase" style="text-transform: uppercase;" />
            </div>
            <div class="space-y-1.5">
              <label class="text-sm font-semibold flex items-center gap-1.5">
                <i class="pi pi-phone text-surface-400 text-xs"></i>
                Telefono
              </label>
              <InputText v-model="form.telefono" :readonly="!puedeEditarEmpresa" placeholder="Telefono" fluid />
            </div>
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-semibold flex items-center gap-1.5">
              <i class="pi pi-user text-surface-400 text-xs"></i>
              Encargado
            </label>
            <InputText v-model="form.encargado" :readonly="!puedeEditarEmpresa" placeholder="Nombre del encargado" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-semibold flex items-center gap-1.5">
              <i class="pi pi-envelope text-surface-400 text-xs"></i>
              Email
            </label>
            <InputText v-model="form.email" :readonly="!puedeEditarEmpresa" placeholder="correo@dominio.com" fluid />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-semibold flex items-center gap-1.5">
              <i class="pi pi-map-marker text-surface-400 text-xs"></i>
              Direccion
            </label>
            <InputText v-model="form.direccion" :readonly="!puedeEditarEmpresa" placeholder="Direccion de la empresa" fluid class="uppercase" style="text-transform: uppercase;" />
          </div>
        </div>
      </div>

      <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-700">
        <Button
          v-if="auth.isAdmin || auth.isSoporte"
          label="Marcar todos los datos con el Almacen actual"
          icon="pi pi-tags"
          severity="warn"
          outlined
          :disabled="!empresaActualEsAlmacen"
          @click="confirmarMarcarTodosLosDatos"
        />
        <Button
          v-if="auth.isAdmin || auth.isSoporte"
          label="Eliminar Empresa"
          icon="pi pi-trash"
          severity="danger"
          text
          :disabled="almacenStore.almacenes.length <= 1"
          @click="confirmarEliminarEmpresa"
        />
        <Button v-if="puedeEditarEmpresa" label="Guardar Cambios" icon="pi pi-check" :loading="guardando" @click="guardar" />
      </div>
    </div>

    <Dialog v-model:visible="marcarTodosDialogVisible" header="Asignar todos los datos" modal :style="{ width: 'min(32rem, 94vw)' }" :draggable="false" :closable="!marcandoTodosLosDatos">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-amber-500 text-2xl mt-1"></i>
        <div>
          <p class="font-semibold">Marcar todos los registros con {{ almacenStore.activeAlmacen?.nombre || empresa?.nombre }}?</p>
          <p class="text-sm text-surface-500 mt-2">
            Se reemplazara el almacen asignado a todos los datos compatibles por el UID del almacen actual.
            Esto incluye registros que actualmente pertenezcan a otros almacenes.
          </p>
          <p class="text-xs font-mono text-surface-400 mt-3 break-all">UID: {{ almacenStore.activeUid }}</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="marcandoTodosLosDatos" @click="marcarTodosDialogVisible = false" />
        <Button label="Si, marcar todos" icon="pi pi-tags" severity="warn" :loading="marcandoTodosLosDatos" @click="marcarTodosLosDatosConAlmacenActual" />
      </template>
    </Dialog>

    <Dialog v-model:visible="deleteDialogVisible" header="Eliminar Empresa" modal :style="{ width: 'min(26rem, 92vw)' }">
      <div class="flex items-start gap-3">
        <i class="pi pi-exclamation-triangle text-red-500 text-2xl mt-1"></i>
        <div>
          <p class="font-semibold">¿Eliminar {{ empresa?.nombre }}?</p>
          <p class="text-sm text-surface-500 mt-1">Esta acción eliminará el registro de empresa. Otra empresa quedará activa automáticamente.</p>
        </div>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="eliminandoEmpresa" @click="deleteDialogVisible = false" />
        <Button label="Sí, eliminar" icon="pi pi-trash" severity="danger" :loading="eliminandoEmpresa" @click="eliminarEmpresa" />
      </template>
    </Dialog>

    <Dialog v-model:visible="nuevoAlmacenDialogVisible" header="Agregar Almacen" modal :style="{ width: 'min(34rem, 94vw)' }" :draggable="false">
      <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-2">
        <div class="sm:col-span-2 space-y-1">
          <label class="text-sm font-semibold">Nombre <span class="text-red-400">*</span></label>
          <InputText v-model="nuevoAlmacenForm.nombre" placeholder="Nombre del almacen" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <div class="space-y-1">
          <label class="text-sm font-semibold">{{ fiscal.businessIdLabel }} / Razon legal</label>
          <InputText v-model="nuevoAlmacenForm.legal" :placeholder="fiscal.businessIdLabel" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <div class="space-y-1">
          <label class="text-sm font-semibold">Encargado</label>
          <InputText v-model="nuevoAlmacenForm.encargado" placeholder="Nombre del encargado" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <div class="space-y-1">
          <label class="text-sm font-semibold">Telefono</label>
          <InputText v-model="nuevoAlmacenForm.telefono" placeholder="Telefono" fluid />
        </div>
        <div class="space-y-1">
          <label class="text-sm font-semibold">Email</label>
          <InputText v-model="nuevoAlmacenForm.email" placeholder="correo@dominio.com" fluid />
        </div>
        <div class="sm:col-span-2 space-y-1">
          <label class="text-sm font-semibold">Direccion</label>
          <InputText v-model="nuevoAlmacenForm.direccion" placeholder="Direccion del almacen" fluid class="uppercase" style="text-transform: uppercase" />
        </div>
        <p class="sm:col-span-2 text-xs text-surface-500">El nuevo almacen conservara la configuracion fiscal y el logo de la empresa actual.</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text :disabled="creandoAlmacen" @click="nuevoAlmacenDialogVisible = false" />
        <Button label="Crear Almacen" icon="pi pi-plus" severity="success" :loading="creandoAlmacen" @click="crearAlmacen" />
      </template>
    </Dialog>
  </div>
</template>
