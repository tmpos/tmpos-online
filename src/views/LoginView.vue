<script setup lang="ts">
import { ref, onMounted, onUnmounted, watch, nextTick } from 'vue'
import { useRouter } from 'vue-router'
import { useAuthStore } from '@/stores/auth.store'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'

const router = useRouter()
const auth = useAuthStore()
const toast = useToast()

const mode = ref<'credentials' | 'pin'>('pin')
const usuario = ref('')
const password = ref('')
const pin = ref('')
const loading = ref(false)
const pinContainer = ref<HTMLElement | null>(null)

const companyName = ref('')

const turnoDialogVisible = ref(false)
const turnoAbiertoDialogVisible = ref(false)
const turnoAbiertoData = ref<any>(null)
const turnoMontoInicial = ref<number>(0)
const turnoLoading = ref(false)
const turnoPendienteRouter = ref(false)
const turnoMontoInputRef = ref<HTMLInputElement | null>(null)

watch(turnoDialogVisible, (val) => {
  if (val) nextTick(() => turnoMontoInputRef.value?.focus())
})
const soporteDialogVisible = ref(false)
const soporteClave = ref('')
const soporteError = ref('')
const soporteLoading = ref(false)
function claveSoporteActual() {
  const ahora = new Date()
  const h = String(ahora.getHours()).padStart(2, '0')
  const m = String(ahora.getMinutes()).padStart(2, '0')
  return `SP${h}${m}`
}

async function verificarTurnoCajero() {
  const esCajero = auth.isCajero || auth.user?.nivel_seguridad?.toLowerCase() === 'cajero'
  console.log('[Login] Verificar turno cajero, rol:', auth.user?.rol, 'nivel:', auth.user?.nivel_seguridad, 'esCajero:', esCajero)
  if (esCajero) {
    console.log('[Login] Buscando turno abierto...')
    const res = await (window as any).electron.invoke('caja:getTurnoAbierto')
    console.log('[Login] Turno abierto:', JSON.stringify(res))
    if (res.success && res.data) {
      turnoAbiertoData.value = res.data
      turnoAbiertoDialogVisible.value = true
      turnoPendienteRouter.value = true
    } else {
      turnoMontoInicial.value = 0
      turnoPendienteRouter.value = true
      turnoDialogVisible.value = true
    }
  } else {
    router.push('/vender')
  }
}

async function cerrarTurnoAnterior() {
  if (!turnoAbiertoData.value) return
  turnoLoading.value = true
  try {
    await (window as any).electron.invoke('caja:cerrarTurno', turnoAbiertoData.value.id)
    turnoAbiertoDialogVisible.value = false
    turnoAbiertoData.value = null
    turnoMontoInicial.value = 0
    turnoDialogVisible.value = true
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo cerrar el turno anterior', life: 3000 })
  } finally {
    turnoLoading.value = false
  }
}

async function continuarTurnoAbierto() {
  turnoAbiertoDialogVisible.value = false
  turnoAbiertoData.value = null
  router.push('/vender')
}

async function abrirNuevoTurno() {
  if (!turnoMontoInicial.value || turnoMontoInicial.value < 0) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un monto inicial valido', life: 3000 })
    return
  }
  turnoLoading.value = true
  try {
    await (window as any).electron.invoke('caja:abrirTurno', {
      monto_inicial: turnoMontoInicial.value,
      usuario_id: auth.user?.id || 0,
      usuario_nombre: auth.user?.nombre || auth.user?.usuario || '',
    })
    turnoDialogVisible.value = false
    router.push('/vender')
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo abrir el turno', life: 3000 })
  } finally {
    turnoLoading.value = false
  }
}

async function iniciarSesion() {
  if (mode.value === 'credentials') {
    if (!usuario.value.trim() || !password.value.trim()) {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Usuario y contrasena requeridos', life: 3000 })
      return
    }
    loading.value = true
    const res = await auth.login(usuario.value.trim(), password.value.trim())
    loading.value = false
    console.log('[Login] Login result:', JSON.stringify(res))
    if (res.success) {
      await verificarTurnoCajero()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
    }
  } else {
    if (!pin.value || pin.value.length < 4) {
      toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa tu PIN completo', life: 3000 })
      return
    }
    loading.value = true
    const res = await auth.loginWithPin(pin.value)
    loading.value = false
    console.log('[Login] Login result:', JSON.stringify(res))
    if (res.success) {
      await verificarTurnoCajero()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 3000 })
    }
  }
}

function enfocarPin() {
  if (mode.value !== 'pin') return
  nextTick(() => pinContainer.value?.focus())
}

watch(mode, (val) => {
  if (val === 'pin') enfocarPin()
})

async function validarAccesoSoporte() {
  soporteError.value = ''
  if (!soporteClave.value.trim()) {
    soporteError.value = 'Introduce la clave de soporte'
    return
  }
  if (soporteClave.value.trim() !== claveSoporteActual()) {
    soporteError.value = 'Clave incorrecta'
    return
  }
  soporteLoading.value = true
  try {
    const res = await window.db.getAll('usuarios')
    if (!res.success) throw new Error(res.error)
    let soporte = (res.data || []).find(u =>
      u.nivel_seguridad?.toLowerCase() === 'soporte' || u.rol?.toLowerCase() === 'soporte'
    )
    if (!soporte) {
      const insertRes = await window.db.insert('usuarios', {
        nombre: 'SOPORTE', email: 'soporte', pin: '2222', nivel_seguridad: 'Soporte',
        estado: 'ACTIVADO', rol: 'soporte',
      })
      if (!insertRes.success) throw new Error('No se pudo crear usuario soporte')
      const getRes = await window.db.getById('usuarios', insertRes.data.id)
      if (!getRes.success) throw new Error('Error al obtener usuario soporte')
      soporte = getRes.data
    }
    if (!soporte.rol && soporte.nivel_seguridad) {
      soporte.rol = 'soporte'
      await window.db.update('usuarios', soporte.id, { rol: 'soporte' })
    }
    auth.user = soporte
    auth.isAuthenticated = true
    localStorage.setItem('mr_user_id', soporte.id)
    localStorage.setItem('mr_user_usuario', soporte.usuario || soporte.email || '')
    auth.markCurrentSessionAuthenticated()
    soporteDialogVisible.value = false
    router.push('/')
  } catch (e: any) {
    soporteError.value = e.message || 'Error al acceder como soporte'
  } finally {
    soporteLoading.value = false
  }
}

function abrirDialogoSoporte() {
  soporteClave.value = ''
  soporteError.value = ''
  soporteDialogVisible.value = true
}

function onTeclaGlobal(e: KeyboardEvent) {
  if (e.ctrlKey && e.shiftKey && (e.key === 'S' || e.key === 's')) {
    e.preventDefault()
    if (!soporteDialogVisible.value) abrirDialogoSoporte()
    return
  }
  const target = e.target as HTMLElement | null
  const escribiendoEnCampo = target?.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(target?.tagName || '')
  if (escribiendoEnCampo || turnoDialogVisible.value || turnoAbiertoDialogVisible.value) return
  if (e.key === ' ') {
    e.preventDefault()
    cambiarModo()
    return
  }
  if (soporteDialogVisible.value || mode.value !== 'pin') return
  if (e.key >= '0' && e.key <= '9') {
    pin.value = (pin.value + e.key).slice(0, 4)
    if (pin.value.length === 4) iniciarSesion()
    return
  }
  if (e.key === 'Backspace' || e.key === 'Delete') {
    pin.value = pin.value.slice(0, -1)
    return
  }
  if (e.key === 'Enter' && pin.value.length === 4) {
    iniciarSesion()
    return
  }
}

function cambiarModo() {
  mode.value = mode.value === 'credentials' ? 'pin' : 'credentials'
  pin.value = ''
  password.value = ''
}

onMounted(async () => {
  window.addEventListener('keydown', onTeclaGlobal)

  await auth.checkAuth()
  if (auth.isAuthenticated) {
    router.push('/')
    return
  }

  try {
    const res = await window.db.getAll('empresa') as any
    if (res.success && res.data?.length > 0) {
      companyName.value = res.data[0].nombre || ''
    }
  } catch (_) {}

  enfocarPin()
  // Adelantar el chunk del POS mientras el usuario escribe su PIN evita que
  // la primera navegacion tenga que cargarlo despues de autenticar.
  void import('@/views/VenderView.vue')
})

onUnmounted(() => {
  window.removeEventListener('keydown', onTeclaGlobal)
})
</script>

<template>
  <div class="min-h-screen flex items-center justify-center relative overflow-hidden bg-gray-950">
    <div class="absolute inset-0 overflow-hidden">
      <div class="absolute -top-40 -right-40 w-80 h-80 rounded-full opacity-10" style="background:var(--p-primary-500);filter:blur(80px)"></div>
      <div class="absolute -bottom-40 -left-40 w-96 h-96 rounded-full opacity-5" style="background:var(--p-primary-500);filter:blur(100px)"></div>
      <div class="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] rounded-full opacity-3" style="background:var(--p-primary-500);filter:blur(120px)"></div>
      <div class="absolute inset-0" style="background-image:radial-gradient(circle at 1px 1px,rgba(255,255,255,0.02) 1px,transparent 0);background-size:40px 40px"></div>
      <div class="particles" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
        <span></span><span></span><span></span><span></span><span></span>
        <span></span><span></span><span></span><span></span><span></span>
        <span></span><span></span><span></span><span></span><span></span>
      </div>
    </div>

    <Toast />

    <div
      class="login-neon-card w-full rounded-2xl border border-white/10 bg-black/40 backdrop-blur-xl shadow-2xl relative z-10 transition-all duration-300"
      :class="mode === 'pin' ? 'max-w-[20rem] p-5' : 'max-w-sm p-8'"
    >
      <div class="login-neon-line absolute top-0 left-0 right-0 h-1 rounded-t-2xl" :style="{ backgroundColor: 'var(--p-primary-500)' }"></div>

      <div class="text-center" :class="mode === 'pin' ? 'mb-4' : 'mb-8'">
        <div
          class="mx-auto rounded-xl flex items-center justify-center bg-white transition-all"
          :class="mode === 'pin' ? 'w-11 h-11 mb-2.5' : 'w-16 h-16 mb-4 rounded-2xl'"
        >
          <i class="pi pi-shield" :class="mode === 'pin' ? 'text-lg' : 'text-2xl'" style="color:var(--p-primary-500)"></i>
        </div>
        <h1 class="font-bold text-white" :class="mode === 'pin' ? 'text-xl' : 'text-2xl'">Iniciar Sesion</h1>
        <p class="text-gray-400 mt-0.5" :class="mode === 'pin' ? 'text-xs' : 'text-sm'">{{ companyName || 'ArgentPOS' }}</p>
      </div>

      <div class="flex p-1 rounded-lg bg-white/5 border border-white/10" :class="mode === 'pin' ? 'mb-4' : 'mb-6'">
        <button
          v-for="tab in [{ key: 'pin', label: 'PIN', icon: 'pi pi-key' }, { key: 'credentials', label: 'Usuario', icon: 'pi pi-user' }]"
          :key="tab.key"
          @click="mode = tab.key as 'credentials' | 'pin'; pin = ''; password = ''"
          class="flex-1 rounded-md text-sm font-medium transition-all cursor-pointer"
          :class="[mode === tab.key ? 'bg-white/10 shadow-sm text-white' : 'text-gray-400 hover:text-gray-300', mode === 'pin' ? 'py-1.5' : 'py-2']"
        >
          <i :class="tab.icon" class="mr-1.5"></i>{{ tab.label }}
        </button>
      </div>

      <form @submit.prevent="iniciarSesion">
        <div v-if="mode === 'credentials'" class="space-y-4">
          <div>
            <label class="text-xs text-gray-400 mb-1 block">Usuario</label>
            <input v-model="usuario" class="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition-all" placeholder="Nombre de usuario" autocomplete="username" />
          </div>
          <div>
            <label class="text-xs text-gray-400 mb-1 block">Contrasena</label>
            <input v-model="password" type="password" class="w-full px-3 py-2.5 rounded-lg border border-white/10 bg-white/5 text-white text-sm placeholder-gray-500 focus:outline-none focus:ring-2 transition-all" placeholder="Contrasena" autocomplete="current-password" />
          </div>
        </div>

        <div v-else ref="pinContainer" tabindex="-1" class="flex flex-col items-center gap-3 outline-none">
          <p class="text-xs text-gray-400">Ingresa tu PIN de acceso</p>
          <div class="flex gap-2">
            <div v-for="i in 4" :key="i" class="w-8 h-9 rounded-lg border flex items-center justify-center font-bold transition-all"
              :class="pin.length >= i ? 'border-white/60 bg-white/10 text-white' : 'border-white/20 text-gray-500'">
              <span v-if="pin.length >= i" class="text-lg">&#9679;</span><span v-else class="text-lg">&#9675;</span>
            </div>
          </div>
          <div class="grid grid-cols-3 gap-2 w-48">
            <button v-for="n in [1,2,3,4,5,6,7,8,9]" :key="n" type="button" class="w-full h-10 rounded-lg border border-white/10 bg-white/5 text-base font-semibold hover:bg-white/15 hover:border-white/25 active:scale-95 transition-all text-white cursor-pointer" @click="pin = (pin + String(n)).slice(0, 4)">{{ n }}</button>
            <button type="button" title="Borrar" class="w-full h-10 rounded-lg border border-white/10 bg-white/5 text-sm hover:bg-red-500/20 hover:border-red-400/30 active:scale-95 transition-all text-red-400 cursor-pointer" @click="pin = pin.slice(0, -1)"><i class="pi pi-delete-left"></i></button>
            <button type="button" class="w-full h-10 rounded-lg border text-base font-semibold active:scale-95 transition-all cursor-pointer" :class="pin.length === 4 ? 'border-white/50 bg-white/15 text-white' : 'border-white/10 bg-white/5 text-white/70 hover:border-white/30'" @click="pin = (pin + '0').slice(0, 4)">0</button>
            <button type="button" title="Limpiar PIN" class="w-full h-10 rounded-lg border border-white/10 bg-white/5 text-xs font-medium hover:bg-white/15 active:scale-95 transition-all text-gray-400 cursor-pointer" @click="pin = ''">Limpiar</button>
          </div>
        </div>

        <p v-if="false" class="text-red-400 text-xs mt-3 flex items-center gap-1"><i class="pi pi-exclamation-circle"></i></p>

        <button type="submit" :disabled="loading" class="w-full rounded-lg text-white text-sm font-medium transition-all hover:opacity-90 disabled:opacity-40 flex items-center justify-center gap-2 cursor-pointer" :class="mode === 'pin' ? 'mt-3 py-2' : 'mt-5 py-2.5'" :style="{ backgroundColor: 'var(--p-primary-500)' }">
          <i v-if="loading" class="pi pi-spin pi-spinner"></i><i v-else class="pi pi-sign-in"></i>
          <span>Entrar</span>
        </button>
      </form>
    </div>

    <Dialog
      v-model:visible="soporteDialogVisible"
      header="Acceso Soporte"
      modal
      :style="{ width: 'min(22rem, 92vw)' }"
      :draggable="false"
      :closable="true"
    >
      <div class="flex flex-col items-center gap-4 pt-2">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--p-primary-500);">
          <i class="pi pi-shield text-2xl text-white"></i>
        </div>
        <p class="text-sm text-surface-500 text-center">Introduce la clave de soporte</p>
        <input
          v-model="soporteClave"
          type="password"
          placeholder="SPHHMM"
          class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-surface-900 text-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-center"
          @keydown.enter="validarAccesoSoporte"
        />
        <p v-if="soporteError" class="text-red-500 text-xs text-center">{{ soporteError }}</p>
      </div>
      <template #footer>
        <Button label="Cancelar" severity="secondary" text @click="soporteDialogVisible = false" />
        <Button label="Acceder" icon="pi pi-sign-in" :loading="soporteLoading" @click="validarAccesoSoporte" />
      </template>
    </Dialog>

    <Dialog v-model:visible="turnoAbiertoDialogVisible" header="Turno Abierto" modal :style="{ width: 'min(24rem, 92vw)' }" :closable="false">
      <div class="flex flex-col items-center gap-4 pt-2">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center bg-amber-500/20">
          <i class="pi pi-exclamation-triangle text-2xl text-amber-500"></i>
        </div>
        <p class="text-sm text-surface-500 text-center">Hay un turno de caja abierto por <strong>{{ turnoAbiertoData?.usuario_nombre || 'otro usuario' }}</strong> desde {{ turnoAbiertoData?.created_at ? new Date(turnoAbiertoData.created_at).toLocaleString() : '' }}.</p>
        <p class="text-sm text-surface-500 text-center">Monto inicial: <strong>${{ Number(turnoAbiertoData?.monto_inicial || 0).toFixed(2) }}</strong></p>
      </div>
      <template #footer>
        <Button label="Terminar turno y empezar nuevo" icon="pi pi-refresh" :loading="turnoLoading" @click="cerrarTurnoAnterior" severity="danger" />
        <Button label="Continuar de todos modos" icon="pi pi-arrow-right" @click="continuarTurnoAbierto" />
      </template>
    </Dialog>

    <Dialog v-model:visible="turnoDialogVisible" header="Iniciar Turno de Caja" modal :style="{ width: 'min(24rem, 92vw)' }" :closable="false">
      <div class="flex flex-col items-center gap-4 pt-2">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--p-primary-500);">
          <i class="pi pi-calculator text-2xl text-white"></i>
        </div>
        <p class="text-sm text-surface-500 text-center">Ingresa el monto inicial de caja para comenzar el turno.</p>
        <div class="w-full">
          <label class="text-xs text-surface-400 mb-1 block">Monto inicial ($)</label>
          <input ref="turnoMontoInputRef" v-model.number="turnoMontoInicial" type="number" step="0.01" min="0" placeholder="0.00" class="w-full px-3 py-2.5 rounded-lg border border-surface-300 bg-surface-0 text-surface-900 text-sm placeholder-surface-400 focus:outline-none focus:ring-2 focus:ring-primary-500 text-center text-lg font-bold" @keydown.stop @keydown.enter.prevent="abrirNuevoTurno" />
        </div>
      </div>
      <template #footer>
        <Button label="Abrir Turno" icon="pi pi-check" :loading="turnoLoading" @click="abrirNuevoTurno" />
      </template>
    </Dialog>
  </div>
</template>

<style scoped>
.particles {
  position: absolute;
  inset: 0;
  overflow: hidden;
  pointer-events: none;
}
.particles span {
  position: absolute;
  display: block;
  width: 4px;
  height: 4px;
  border-radius: 50%;
  box-shadow: 0 0 6px 2px rgba(99, 102, 241, 0.6);
  background: radial-gradient(circle at 30% 30%, #a5b4fc, #6366f1);
  opacity: 0;
  animation: particleFloat var(--d, 10s) ease-in-out infinite alternate;
}
.particles span:nth-child(1) { left: 5%; top: 20%; --d: 8s; animation-delay: 0s; }
.particles span:nth-child(2) { left: 15%; top: 60%; --d: 12s; animation-delay: 1s; width: 6px; height: 6px; }
.particles span:nth-child(3) { left: 25%; top: 10%; --d: 10s; animation-delay: 2s; }
.particles span:nth-child(4) { left: 35%; top: 80%; --d: 14s; animation-delay: 0.5s; width: 3px; height: 3px; }
.particles span:nth-child(5) { left: 45%; top: 40%; --d: 9s; animation-delay: 3s; }
.particles span:nth-child(6) { left: 55%; top: 15%; --d: 11s; animation-delay: 1.5s; width: 5px; height: 5px; }
.particles span:nth-child(7) { left: 65%; top: 70%; --d: 13s; animation-delay: 0.8s; }
.particles span:nth-child(8) { left: 75%; top: 30%; --d: 7s; animation-delay: 2.5s; width: 3px; height: 3px; }
.particles span:nth-child(9) { left: 85%; top: 90%; --d: 15s; animation-delay: 1.2s; }
.particles span:nth-child(10) { left: 92%; top: 50%; --d: 10s; animation-delay: 3.5s; width: 6px; height: 6px; }
.particles span:nth-child(11) { left: 8%; top: 75%; --d: 9s; animation-delay: 0.3s; }
.particles span:nth-child(12) { left: 18%; top: 35%; --d: 11s; animation-delay: 2.2s; width: 4px; height: 4px; }
.particles span:nth-child(13) { left: 28%; top: 55%; --d: 13s; animation-delay: 1.8s; }
.particles span:nth-child(14) { left: 38%; top: 25%; --d: 8s; animation-delay: 0.6s; width: 5px; height: 5px; }
.particles span:nth-child(15) { left: 48%; top: 95%; --d: 12s; animation-delay: 2.8s; }
.particles span:nth-child(16) { left: 58%; top: 5%; --d: 14s; animation-delay: 1.4s; width: 3px; height: 3px; }
.particles span:nth-child(17) { left: 68%; top: 45%; --d: 7s; animation-delay: 3.2s; }
.particles span:nth-child(18) { left: 78%; top: 85%; --d: 10s; animation-delay: 0.1s; width: 5px; height: 5px; }
.particles span:nth-child(19) { left: 88%; top: 15%; --d: 11s; animation-delay: 1.6s; }
.particles span:nth-child(20) { left: 95%; top: 65%; --d: 9s; animation-delay: 2.4s; width: 4px; height: 4px; }

.login-neon-card {
  isolation: isolate;
  box-shadow:
    0 0 0 1px rgba(255, 255, 255, 0.08),
    0 0 22px rgba(59, 130, 246, 0.24),
    0 0 58px rgba(59, 130, 246, 0.16),
    0 24px 70px rgba(0, 0, 0, 0.55);
  animation: neonCardPulse 3.8s ease-in-out infinite;
}

.login-neon-card::before {
  content: '';
  position: absolute;
  inset: -2px;
  z-index: -1;
  border-radius: 1rem;
  background: linear-gradient(135deg, rgba(34, 211, 238, 0.55), rgba(59, 130, 246, 0.16), rgba(168, 85, 247, 0.45));
  opacity: 0.55;
  filter: blur(14px);
  animation: neonHaloShift 5.5s ease-in-out infinite alternate;
}

.login-neon-line {
  box-shadow:
    0 0 12px rgba(59, 130, 246, 0.9),
    0 0 28px rgba(59, 130, 246, 0.55);
  animation: neonLineSweep 2.8s ease-in-out infinite;
}

@keyframes particleFloat {
  0% { transform: translateY(0) translateX(0) scale(1); opacity: 0; }
  10% { opacity: 0.8; }
  90% { opacity: 0.8; }
  100% { transform: translateY(-80px) translateX(20px) scale(1.2); opacity: 0; }
}

@keyframes neonCardPulse {
  0%, 100% {
    transform: translateY(0);
    box-shadow:
      0 0 0 1px rgba(255, 255, 255, 0.08),
      0 0 22px rgba(59, 130, 246, 0.24),
      0 0 58px rgba(59, 130, 246, 0.16),
      0 24px 70px rgba(0, 0, 0, 0.55);
  }
  50% {
    transform: translateY(-3px);
    box-shadow:
      0 0 0 1px rgba(125, 211, 252, 0.2),
      0 0 30px rgba(34, 211, 238, 0.36),
      0 0 76px rgba(168, 85, 247, 0.22),
      0 30px 82px rgba(0, 0, 0, 0.62);
  }
}

@keyframes neonHaloShift {
  0% {
    opacity: 0.35;
    transform: scale(0.985);
  }
  100% {
    opacity: 0.7;
    transform: scale(1.02);
  }
}

@keyframes neonLineSweep {
  0%, 100% {
    opacity: 0.7;
    filter: saturate(1);
  }
  50% {
    opacity: 1;
    filter: saturate(1.6);
  }
}
</style>
