<script setup lang="ts">
import { ref, reactive, onMounted, nextTick } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import InputOtp from 'primevue/inputotp'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import QRCode from 'qrcode'
import * as tmc from '@/services/tmCloudClient'
import { useAlmacenStore } from '@/stores/almacen.store'
import { useEmpresa } from '@/composables/useEmpresa'

const toast = useToast()
const almacenStore = useAlmacenStore()
const empresaState = useEmpresa()
const loading = ref(true)
const licVerificando = ref(false)
const licMsg = ref('')
const licError = ref(false)
const licenciaQr = ref('')
const licenciaDesbloqueada = ref(false)
const verLicenciaVisible = ref(false)
const verLicenciaLoading = ref(false)
const verLicenciaConfirmando = ref(false)
const verLicenciaOtp = ref('')
const verLicenciaEmail = ref('')
const verLicenciaError = ref('')

const apiKeyInput = ref('')
const mostrarApiKey = ref(false)
const apiKeyGuardando = ref(false)
const apiKeyMsg = ref('')
const apiKeyError = ref(false)

const dialogoCambiarLicencia = ref(false)
const nuevaLicencia = ref('')
const nuevaLicenciaInput = ref<HTMLInputElement | null>(null)
const nuevaLicenciaError = ref('')
const nuevaLicenciaLoading = ref(false)

function formatLicenciaCode(val: string) {
  const clean = String(val || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 15)
  const parts = []
  for (let i = 0; i < clean.length; i += 5) parts.push(clean.slice(i, i + 5))
  return parts.join('-')
}

function onLicenciaInput(e: Event) {
  const input = e.target as HTMLInputElement
  const formatted = formatLicenciaCode(input.value)
  nuevaLicencia.value = formatted
  if (input.value !== formatted) input.value = formatted
}

function onLicenciaPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') || ''
  nuevaLicencia.value = formatLicenciaCode(text)
  e.preventDefault()
}

function onLicenciaKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && nuevaLicencia.value.length === 17) cambiarLicencia()
}

async function cambiarLicencia() {
  const codigo = nuevaLicencia.value
  if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(codigo)) {
    nuevaLicenciaError.value = 'Introduce un codigo valido de 15 caracteres'
    return
  }
  nuevaLicenciaLoading.value = true
  nuevaLicenciaError.value = ''
  try {
    const val = await window.electron.invoke('licencia:validarCloud', codigo) as any
    if (!val.success) {
      nuevaLicenciaError.value = val.error || 'No se pudo validar la licencia'
      return
    }
    const refresh = await window.electron.invoke('licencia:fetchConfig', codigo) as any
    if (!refresh.success) {
      nuevaLicenciaError.value = refresh.error || 'No se pudo preparar TM Cloud'
      return
    }
    toast.add({ severity: 'success', summary: 'TM Cloud configurado', detail: 'Registrando equipo...', life: 3000 })
    const reg = await window.electron.invoke('licencia:solicitarRegistroEquipo', { licencia: codigo }) as any
    if (!reg.success) {
      nuevaLicenciaError.value = reg.error || 'No se pudo registrar el equipo'
      return
    }
    toast.add({ severity: 'success', summary: 'Equipo registrado', detail: reg.mensaje || 'Licencia actualizada', life: 4000 })
    tmc.resetConfig()
    const config = await tmc.ensureConfigLoaded(true)
    if (!config) throw new Error('La licencia no devolvio una configuracion valida de TM Cloud')
    await tmc.testConnection(config.url, config.key)
    const reset = await window.electron.invoke('db:resetForLicenseChange') as any
    if (!reset?.success) throw new Error(reset?.error || 'No se pudo limpiar la base de datos local')
    const empresasGuardadas = await tmc.cacheCompanyLocally()
    const usuariosGuardados = await tmc.cacheLoginUsersLocally()
    await almacenStore.load()
    await empresaState.cargar()
    dialogoCambiarLicencia.value = false
    await cargarLicencia()
    toast.add({
      severity: 'success',
      summary: 'Licencia cambiada',
      detail: `${empresasGuardadas} empresa(s) y ${usuariosGuardados} usuario(s) aplicados. Descargando los demas datos...`,
      life: 4000,
    })
    void import('@/services/tmCloudSyncService').then(async ({ downloadAllTables }) => {
      const descarga = await downloadAllTables({ force: true })
      toast.add({
        severity: descarga.success ? 'success' : 'warn',
        summary: descarga.success ? 'Datos sincronizados' : 'Sincronizacion parcial',
        detail: descarga.message,
        life: 5000,
      })
    }).catch((error: any) => {
      toast.add({ severity: 'warn', summary: 'Sincronizacion pendiente', detail: error?.message || 'No se pudieron descargar todos los datos', life: 5000 })
    })
  } catch (e: any) {
    nuevaLicenciaError.value = e.message || 'Error al cambiar licencia'
  } finally { nuevaLicenciaLoading.value = false }
}

function abrirCambiarLicencia() {
  nuevaLicencia.value = ''
  nuevaLicenciaError.value = ''
  dialogoCambiarLicencia.value = true
  nextTick(() => nuevaLicenciaInput.value?.focus())
}

const licInfo = reactive({
  estado: '',
  estado_display: '',
  nombre_empresa: '',
  licencia: '',
  licencia_equipo: '',
  dias_restantes: null as number | null,
  fecha_vencimiento: '',
  ultima_verificacion: '',
})

async function generarQrLicencia() {
  licenciaQr.value = ''
  if (!licenciaDesbloqueada.value || !licInfo.licencia) return
  licenciaQr.value = await QRCode.toDataURL(licInfo.licencia, {
    width: 180,
    margin: 2,
    color: {
      dark: '#111827',
      light: '#ffffff',
    },
  })
}

async function cargarLicencia() {
  loading.value = true
  try {
    console.log('[LicenciaComp] Cargando info de licencia...')
    const macRes = await window.electron.invoke('licencia:getMacAddress') as any
    console.log('[LicenciaComp] MAC:', macRes)
    if (macRes.success) licInfo.licencia_equipo = macRes.data.mac

    const res = await window.electron.invoke('licencia:getInfo') as any
    console.log('[LicenciaComp] Info:', res)
    if (res.success && res.data) {
      licInfo.estado = res.data.estado
      licInfo.estado_display = res.data.estado_display
      licInfo.nombre_empresa = res.data.nombre_empresa || ''
      licInfo.licencia = res.data.licencia || ''
      if (res.data.licencia_equipo) licInfo.licencia_equipo = res.data.licencia_equipo
      licInfo.dias_restantes = res.data.dias_restantes
      licInfo.fecha_vencimiento = res.data.fecha_vencimiento || ''
      licInfo.ultima_verificacion = res.data.ultima_verificacion || ''
      licenciaQr.value = ''
    }

    const keyRes = await window.electron.invoke('licencia:getApiKey') as any
    if (keyRes.success && keyRes.data?.configurada) apiKeyInput.value = '********'
  } catch (_) {}
  loading.value = false
}

async function guardarApiKey() {
  if (!apiKeyInput.value || apiKeyInput.value === '********') {
    apiKeyMsg.value = 'No hay cambios'
    apiKeyError.value = true
    return
  }
  apiKeyGuardando.value = true
  apiKeyMsg.value = ''
  apiKeyError.value = false
  try {
    const res = await window.electron.invoke('licencia:setApiKey', apiKeyInput.value) as any
    if (res.success) {
      apiKeyMsg.value = 'API Key guardada correctamente'
      apiKeyError.value = false
      apiKeyInput.value = '********'
    } else {
      apiKeyMsg.value = res.error || 'Error al guardar'
      apiKeyError.value = true
    }
  } catch (e: any) {
    apiKeyMsg.value = e.message || 'Error'
    apiKeyError.value = true
  } finally {
    apiKeyGuardando.value = false
  }
}

async function verificarLicenciaAhora() {
  licVerificando.value = true
  licMsg.value = ''
  licError.value = false
  try {
    console.log('[LicenciaComp] Verificando licencia...')
    const res = await window.electron.invoke('licencia:verificar') as any
    console.log('[LicenciaComp] Resultado:', res)
    if (res.success) {
      licMsg.value = res.data?.mensaje || 'Licencia verificada correctamente'
      licError.value = false
    } else {
      licMsg.value = res.error || 'Error al verificar'
      licError.value = true
    }
    const info = await window.electron.invoke('licencia:getInfo') as any
    if (info.success && info.data) {
      licInfo.estado = info.data.estado
      licInfo.estado_display = info.data.estado_display
      licInfo.licencia = info.data.licencia || licInfo.licencia
      licInfo.dias_restantes = info.data.dias_restantes
      licInfo.ultima_verificacion = info.data.ultima_verificacion || ''
      await generarQrLicencia()
    }
  } catch (e: any) {
    licMsg.value = 'Error de conexion: ' + (e.message || 'desconocido')
    licError.value = true
  } finally {
    licVerificando.value = false
  }
}

function licenciaEnmascarada() {
  const codigo = String(licInfo.licencia || '')
  if (!codigo) return '—'
  if (licenciaDesbloqueada.value) return codigo
  const partes = codigo.split('-')
  if (partes.length === 2) return `${partes[0].slice(0, 2)}***-*****`
  return '**********'
}

async function solicitarVerLicencia() {
  verLicenciaError.value = ''
  verLicenciaOtp.value = ''
  verLicenciaLoading.value = true
  try {
    const res = await window.electron.invoke('licencia:solicitarVerCodigo') as any
    if (res.success) {
      verLicenciaEmail.value = res.data?.email || ''
      verLicenciaVisible.value = true
      toast.add({ severity: 'success', summary: 'Codigo enviado', detail: 'Revisa el correo de la empresa', life: 3000 })
    } else {
      verLicenciaError.value = res.error || 'No se pudo enviar el codigo'
      toast.add({ severity: 'error', summary: 'Error', detail: verLicenciaError.value, life: 3000 })
    }
  } catch (e: any) {
    verLicenciaError.value = e.message || 'Error solicitando codigo'
  } finally {
    verLicenciaLoading.value = false
  }
}

async function confirmarVerLicencia() {
  verLicenciaError.value = ''
  const codigo = String(verLicenciaOtp.value || '').replace(/\D/g, '')
  if (!/^\d{4}$/.test(codigo)) {
    verLicenciaError.value = 'Introduce el codigo de 4 digitos'
    return
  }

  verLicenciaConfirmando.value = true
  try {
    const res = await window.electron.invoke('licencia:confirmarVerCodigo', { codigo }) as any
    if (res.success) {
      licInfo.licencia = res.data?.licencia || licInfo.licencia
      licenciaDesbloqueada.value = true
      verLicenciaVisible.value = false
      await generarQrLicencia()
      toast.add({ severity: 'success', summary: 'Licencia visible', detail: 'Codigo desbloqueado correctamente', life: 3000 })
    } else {
      verLicenciaError.value = res.error || 'No se pudo validar el codigo'
    }
  } catch (e: any) {
    verLicenciaError.value = e.message || 'Error validando codigo'
  } finally {
    verLicenciaConfirmando.value = false
  }
}

onMounted(cargarLicencia)
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-6">
      <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <i class="pi pi-shield text-primary text-lg"></i>
        </div>
        <div>
          <h2 class="text-xl font-bold">Licencia</h2>
          <p class="text-sm text-surface-500">Estado y configuracion de la licencia del sistema</p>
        </div>
      </div>

      <div v-if="loading" class="text-center py-10 text-surface-400">Cargando...</div>

      <div v-else class="max-w-3xl space-y-5">
        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5">
          <div class="flex flex-col sm:flex-row sm:items-center gap-4">
            <div v-if="licenciaDesbloqueada && licenciaQr" class="w-40 h-40 bg-white p-2 rounded-lg border border-surface-200 flex items-center justify-center shrink-0">
              <img :src="licenciaQr" :alt="`QR licencia ${licInfo.licencia}`" class="w-full h-full object-contain" />
            </div>
            <div v-else class="w-40 h-40 rounded-lg border border-surface-200 dark:border-surface-700 bg-surface-100 dark:bg-surface-900 flex flex-col items-center justify-center shrink-0 text-surface-400">
              <i class="pi pi-lock text-3xl mb-2"></i>
              <span class="text-xs font-semibold">Protegido</span>
            </div>
            <div class="min-w-0">
              <h4 class="font-semibold text-sm flex items-center gap-2">
                <i :class="licenciaDesbloqueada ? 'pi pi-qrcode text-primary' : 'pi pi-lock text-primary'"></i>
                Licencia protegida
              </h4>
              <p class="mt-2 text-sm text-surface-500">Codigo de licencia</p>
              <p class="font-mono text-lg font-semibold tracking-wide break-all">{{ licenciaEnmascarada() }}</p>
              <div class="mt-3 flex flex-wrap gap-2">
                <Button
                  v-if="!licenciaDesbloqueada"
                  label="Ver licencia"
                  icon="pi pi-eye"
                  size="small"
                  :loading="verLicenciaLoading"
                  @click="solicitarVerLicencia"
                />
                <Button
                  v-else
                  label="Ocultar"
                  icon="pi pi-eye-slash"
                  size="small"
                  severity="secondary"
                  outlined
                  @click="licenciaDesbloqueada = false; licenciaQr = ''"
                />
              </div>
            </div>
          </div>
        </div>

        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
          <h3 class="font-semibold flex items-center gap-2 text-sm">
            <i class="pi pi-info-circle text-primary"></i>
            Estado de la Licencia
          </h3>

          <div class="grid gap-5 md:grid-cols-[1fr_auto]">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
            <div>
              <span class="text-surface-400 text-xs">Estado</span>
              <div class="mt-0.5">
                <span
                  class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium"
                  :class="licInfo.estado === 'activa'
                    ? 'bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400'
                    : licInfo.estado === 'pendiente'
                      ? 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400'
                      : 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400'"
                >
                  <i :class="licInfo.estado === 'activa' ? 'pi pi-check-circle' : 'pi pi-times-circle'"></i>
                  {{ licInfo.estado_display }}
                </span>
              </div>
            </div>
            <div>
              <span class="text-surface-400 text-xs">Empresa</span>
              <p class="font-medium">{{ licInfo.nombre_empresa || '—' }}</p>
            </div>
            <div>
              <span class="text-surface-400 text-xs">Licencia</span>
              <div class="flex items-center gap-2">
                <p class="font-mono text-sm font-semibold tracking-wide">{{ licenciaEnmascarada() }}</p>
                <Button
                  v-if="licInfo.licencia && !licenciaDesbloqueada"
                  icon="pi pi-eye"
                  text
                  rounded
                  size="small"
                  :loading="verLicenciaLoading"
                  @click="solicitarVerLicencia"
                  v-tooltip="'Enviar OTP para ver licencia'"
                />
              </div>
            </div>
            <div>
              <span class="text-surface-400 text-xs">Dias restantes</span>
              <p class="font-medium">{{ licInfo.dias_restantes !== null ? `${licInfo.dias_restantes} dia(s)` : '—' }}</p>
            </div>
            <div>
              <span class="text-surface-400 text-xs">Vencimiento</span>
              <p>{{ licInfo.fecha_vencimiento ? new Date(licInfo.fecha_vencimiento).toLocaleDateString() : '—' }}</p>
            </div>
            <div>
              <span class="text-surface-400 text-xs">Ultima verificacion</span>
              <p>{{ licInfo.ultima_verificacion ? new Date(licInfo.ultima_verificacion).toLocaleString() : '—' }}</p>
            </div>
            <div>
              <span class="text-surface-400 text-xs">Codigo de equipo (MAC)</span>
              <p class="font-mono text-xs">{{ licInfo.licencia_equipo || '—' }}</p>
            </div>
          </div>
        </div>
        </div>

        <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
          <h4 class="font-semibold text-sm flex items-center gap-2">
            <i class="pi pi-key text-primary"></i>
            API Key
          </h4>
          <div class="flex items-center gap-2">
            <div class="relative flex-1">
              <input
                v-model="apiKeyInput"
                :type="mostrarApiKey ? 'text' : 'password'"
                placeholder="API Key de licencia"
                class="w-full px-3 py-2 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-700 text-sm focus:outline-none focus:ring-2 font-mono"
              />
            </div>
            <Button
              :icon="mostrarApiKey ? 'pi pi-eye-slash' : 'pi pi-eye'"
              severity="secondary"
              text
              size="small"
              @click="mostrarApiKey = !mostrarApiKey"
              v-tooltip="mostrarApiKey ? 'Ocultar' : 'Mostrar'"
            />
            <Button
              v-if="apiKeyInput"
              label="Guardar"
              size="small"
              :loading="apiKeyGuardando"
              @click="guardarApiKey"
            />
          </div>
          <p v-if="apiKeyMsg" class="text-xs" :class="apiKeyError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">
            {{ apiKeyMsg }}
          </p>
        </div>

        <div class="flex justify-end gap-2">
          <Button
            label="Cambiar licencia"
            icon="pi pi-key"
            severity="warn"
            @click="abrirCambiarLicencia"
          />
          <Button
            :label="licVerificando ? 'Verificando...' : 'Verificar ahora'"
            :icon="licVerificando ? 'pi pi-spin pi-spinner' : 'pi pi-refresh'"
            severity="secondary"
            :loading="licVerificando"
            @click="verificarLicenciaAhora"
          />
        </div>
        <p v-if="licMsg" class="text-xs text-right" :class="licError ? 'text-red-600 dark:text-red-400' : 'text-green-600 dark:text-green-400'">
          {{ licMsg }}
        </p>
      </div>
    </div>

    <Dialog
      v-model:visible="dialogoCambiarLicencia"
      header="Cambiar licencia"
      modal
      :style="{ width: 'min(26rem, 92vw)' }"
      :draggable="false"
    >
      <div class="space-y-4 pt-2">
        <div class="flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg">
          <i class="pi pi-exclamation-triangle text-amber-500"></i>
          <p class="text-sm text-surface-600 dark:text-surface-300">Al cambiar la licencia se descargaran los datos de la nueva empresa desde la nube.</p>
        </div>
        <div>
          <label class="text-xs text-surface-500 mb-1.5 block text-center">Codigo de licencia</label>
          <input
            ref="nuevaLicenciaInput"
            :value="nuevaLicencia"
            class="w-full px-3 py-3 rounded-lg border border-surface-300 dark:border-surface-600 bg-surface-0 dark:bg-surface-800 text-surface-900 dark:text-surface-0 text-sm font-mono text-center tracking-[0.25em] placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all uppercase"
            maxlength="17"
            autocomplete="off"
            placeholder="XXXXX-XXXXX-XXXXX"
            @input="onLicenciaInput"
            @paste="onLicenciaPaste"
            @keydown="onLicenciaKeydown"
          />
        </div>
        <p v-if="nuevaLicenciaError" class="text-red-500 text-xs text-center">{{ nuevaLicenciaError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="dialogoCambiarLicencia = false" :disabled="nuevaLicenciaLoading" />
        <Button label="Cambiar licencia" icon="pi pi-check" :loading="nuevaLicenciaLoading" @click="cambiarLicencia" />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="verLicenciaVisible"
      header="Ver licencia"
      modal
      :style="{ width: 'min(24rem, 92vw)' }"
      :draggable="false"
    >
      <div class="flex flex-col items-center gap-4 pt-2">
        <div class="w-14 h-14 rounded-2xl bg-primary-50 dark:bg-primary-900/30 flex items-center justify-center">
          <i class="pi pi-shield text-primary text-2xl"></i>
        </div>
        <p class="text-sm text-surface-500 text-center">
          Enviamos un codigo de 4 digitos al correo {{ verLicenciaEmail || 'de la licencia' }} para autorizar la visualizacion.
        </p>
        <InputOtp
          v-model="verLicenciaOtp"
          :length="4"
          integerOnly
        />
        <p v-if="verLicenciaError" class="text-red-500 text-xs text-center">{{ verLicenciaError }}</p>
      </div>
      <template #footer>
        <Button label="Reenviar" severity="secondary" text :loading="verLicenciaLoading" @click="solicitarVerLicencia" />
        <Button label="Ver licencia" icon="pi pi-eye" :loading="verLicenciaConfirmando" @click="confirmarVerLicencia" />
      </template>
    </Dialog>
  </div>
</template>
