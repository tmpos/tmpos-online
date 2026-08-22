<script setup lang="ts">
import { ref, onMounted, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import Button from 'primevue/button'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import * as tmc from '@/services/tmCloudClient'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const LICENCIA_TIMEOUT_MS = 10000
// La consulta de licencia pasa por Internet y en algunos equipos/redes puede
// tardar mas que una operacion SQLite. Debe superar el timeout interno de
// Electron (15 s) para no cancelar una respuesta que aun esta en curso.
const LICENCIA_CLOUD_TIMEOUT_MS = 25000

const verificando = ref(true)
const macAddress = ref('')

const licenciaFullCode = ref('')
const licenciaError = ref('')
const licenciaLoading = ref(false)
const licenciaInputRef = ref<HTMLInputElement | null>(null)

function withTimeout(promise: Promise<any>, ms: number, label: string) {
  let timeoutId: any
  const timeout = new Promise((_, reject) => {
    timeoutId = setTimeout(() => reject(new Error(`${label} excedio ${ms}ms`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timeoutId))
}

function formatLicenciaCode(val: string) {
  const clean = String(val || '').replace(/[^A-Z0-9]/gi, '').toUpperCase().slice(0, 15)
  const parts = []
  for (let i = 0; i < clean.length; i += 5) parts.push(clean.slice(i, i + 5))
  return parts.join('-')
}

function onInput(e: Event) {
  const input = e.target as HTMLInputElement
  const formatted = formatLicenciaCode(input.value)
  licenciaFullCode.value = formatted
  if (input.value !== formatted) input.value = formatted
}

function onPaste(e: ClipboardEvent) {
  const text = e.clipboardData?.getData('text') || ''
  const formatted = formatLicenciaCode(text)
  licenciaFullCode.value = formatted
  e.preventDefault()
}

function onKeydown(e: KeyboardEvent) {
  if (e.key === 'Enter' && licenciaFullCode.value.length === 17) registrarEquipo()
}

async function registrarEquipo() {
  const codigo = licenciaFullCode.value
  if (!/^[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/.test(codigo)) {
    licenciaError.value = 'Introduce un codigo valido de 15 caracteres'
    return
  }
  console.log('[LicenseView] Codigo ingresado:', codigo)
  licenciaLoading.value = true
  licenciaError.value = ''
  try {
    console.log('[LicenseView] Llamando licencia:validarCloud...')
    const val = await withTimeout(
      window.electron.invoke('licencia:validarCloud', codigo),
      LICENCIA_CLOUD_TIMEOUT_MS,
      'licencia:validarCloud'
    ) as any
    console.log('[LicenseView] Resultado validarCloud:', JSON.stringify(val))
    if (!val.success) {
      licenciaError.value = val.error || 'No se pudo validar la licencia'
      return
    }
    // Nunca borrar el inventario antes de saber que la nueva licencia existe.
    // Tampoco usar db:clearCloudData aqui: eliminaria las credenciales nuevas
    // que licencia:validarCloud acaba de guardar.
    console.log('[LicenseView] Licencia confirmada; preparando conexion con TM Cloud...')
    toast.add({ severity: 'success', summary: 'Licencia validada', detail: 'Conectando con la nube...', life: 3000 })
    tmc.resetConfig()
    const config = await tmc.ensureConfigLoaded(true)
    console.log('[LicenseView] TM Cloud config cargada:', { conectada: Boolean(config), url: config?.url?.substring(0, 50), tieneKey: Boolean(config?.key), tieneServiceKey: Boolean(config?.serviceKey) })
    if (!config) throw new Error('La licencia no devolvio una configuracion valida de TM Cloud')
    await tmc.testConnection(config.url, config.key)
    console.log('[LicenseView] Llamando licencia:solicitarRegistroEquipo...')
    const reg = await withTimeout(
      window.electron.invoke('licencia:solicitarRegistroEquipo', { licencia: codigo }),
      LICENCIA_CLOUD_TIMEOUT_MS,
      'licencia:solicitarRegistroEquipo'
    ) as any
    console.log('[LicenseView] Resultado solicitarRegistroEquipo:', JSON.stringify(reg))
    if (reg.success) {
      const empresasGuardadas = await tmc.cacheCompanyLocally()
      toast.add({ severity: 'success', summary: 'Equipo registrado', detail: reg.mensaje || 'El equipo se ha registrado correctamente', life: 3000 })
      toast.add({ severity: 'success', summary: 'Empresa guardada', detail: `${empresasGuardadas} registro(s) guardados localmente`, life: 3000 })
      router.push('/')
    } else {
      licenciaError.value = reg.error || 'No se pudo registrar el equipo'
    }
  } catch (e: any) {
    const timeout = String(e?.message || '').includes('excedio')
    licenciaError.value = timeout
      ? 'El servidor esta tardando en responder. Verifica tu conexion e intenta nuevamente.'
      : e.message || 'Error al registrar'
  } finally {
    licenciaLoading.value = false
  }
}

async function cerrarSesion() {
  auth.logout()
  router.push('/login')
}

onMounted(async () => {
  if (!(window as any).electron?.invoke) {
    router.push('/')
    return
  }
  try {
    const macResult = await window.electron.invoke('licencia:getMacAddress') as any
    if (macResult.success) {
      macAddress.value = macResult.data.mac
    }
  } catch (_) {}
  verificando.value = false
  nextTick(() => licenciaInputRef.value?.focus())
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden bg-gray-950">
    <div class="absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-10" style="background:var(--p-primary-500);filter:blur(80px)"></div>
      <div class="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-5" style="background:var(--p-primary-500);filter:blur(100px)"></div>
      <div class="absolute inset-0" style="background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,0.02) 1px,transparent 0);background-size:40px 40px"></div>
    </div>

    <Toast />

    <div
      v-if="verificando"
      class="flex flex-col items-center justify-center gap-4 relative z-10"
    >
      <i class="pi pi-spin pi-spinner text-3xl text-white"></i>
      <p class="text-white text-sm">Verificando...</p>
    </div>

    <div
      v-else
      class="w-full max-w-md rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl relative z-10 p-8"
    >
      <div class="absolute top-0 left-0 right-0 h-1 rounded-t-2xl" :style="{ backgroundColor: 'var(--p-primary-500)' }"></div>

      <div class="text-center mb-8">
        <div class="mx-auto w-16 h-16 rounded-2xl bg-white flex items-center justify-center mb-4">
          <i class="pi pi-shield text-2xl" style="color:var(--p-primary-500)"></i>
        </div>
        <h1 class="text-2xl font-bold text-white">Licencia requerida</h1>
        <p class="text-gray-400 text-sm mt-2">Este equipo no cuenta con una licencia activa.</p>
        <p class="text-gray-500 text-xs mt-1">Introduce el codigo de licencia para registrar este equipo.</p>
      </div>

      <div class="mb-4 p-3 rounded-lg bg-white/5 border border-white/10">
        <div class="flex items-center justify-between text-xs">
          <span class="text-gray-500">Codigo de equipo</span>
          <span class="font-mono text-gray-300 tracking-wide">{{ macAddress || '—' }}</span>
        </div>
      </div>

      <div class="space-y-4">
        <div>
          <label class="text-xs text-gray-400 mb-1.5 block text-center">Codigo de licencia</label>
          <input
            ref="licenciaInputRef"
            :value="licenciaFullCode"
            class="w-full px-3 py-3 rounded-lg border border-white/20 bg-white/5 text-white text-sm font-mono text-center tracking-[0.25em] placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-primary-500 transition-all uppercase"
            maxlength="17"
            autocomplete="off"
            placeholder="XXXXX-XXXXX-XXXXX"
            @input="onInput"
            @paste="onPaste"
            @keydown="onKeydown"
          />
        </div>
        <p v-if="licenciaError" class="text-red-400 text-xs text-center">{{ licenciaError }}</p>
        <Button
          label="Registrar equipo"
          icon="pi pi-check"
          class="w-full"
          :loading="licenciaLoading"
          @click="registrarEquipo"
        />
      </div>

      <div class="mt-6 text-center">
        <button
          class="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          @click="cerrarSesion"
        >
          <i class="pi pi-sign-out mr-1"></i>Cerrar sesion
        </button>
      </div>
    </div>

  </div>
</template>
