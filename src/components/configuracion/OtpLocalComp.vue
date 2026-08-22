<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputNumber from 'primevue/inputnumber'
import InputText from 'primevue/inputtext'
import SelectButton from 'primevue/selectbutton'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'
import { useAuthStore } from '@/stores/auth.store'

const auth = useAuthStore()
const toast = useToast()
const loading = ref(false)
const saving = ref(false)
const code = ref('----')
const secondsRemaining = ref(0)
const networkUrl = ref('')
const form = ref({ mode: 'variable', fixedCode: '0000', intervalSeconds: 60, sendEmail: false })
const modes = [
  { label: 'Variable', value: 'variable' },
  { label: 'Fijo', value: 'fixed' },
]
let timer: ReturnType<typeof setInterval> | null = null
let formLoaded = false

const autorizado = computed(() => auth.isAdmin || auth.isSoporte)

async function loadStatus(syncForm = false) {
  if (!autorizado.value) return
  const res = await window.electron.invoke('otp-local:getConfig') as any
  if (!res?.success) return
  const data = res.data || {}
  if (syncForm || !formLoaded) {
    form.value = {
      mode: data.mode === 'fixed' ? 'fixed' : 'variable',
      fixedCode: String(data.fixedCode || '0000'),
      intervalSeconds: Number(data.intervalSeconds || 60),
      sendEmail: data.sendEmail === true,
    }
    formLoaded = true
  }
  code.value = String(data.code || '----')
  secondsRemaining.value = Number(data.secondsRemaining || 0)
  networkUrl.value = String(data.networkUrl || '')
}

async function saveConfig() {
  if (!autorizado.value) return
  if (form.value.mode === 'fixed' && !/^\d{4}$/.test(form.value.fixedCode)) {
    toast.add({ severity: 'warn', summary: 'Codigo invalido', detail: 'El codigo fijo debe tener 4 digitos', life: 3000 })
    return
  }
  saving.value = true
  try {
    const res = await window.electron.invoke('otp-local:saveConfig', {
      mode: form.value.mode,
      fixedCode: form.value.fixedCode,
      intervalSeconds: form.value.intervalSeconds,
      sendEmail: form.value.sendEmail,
      regenerateSecret: false,
    }) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo guardar')
    await loadStatus(true)
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuracion OTP local actualizada', life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar', life: 3500 })
  } finally {
    saving.value = false
  }
}

async function regenerateCode() {
  saving.value = true
  try {
    const res = await window.electron.invoke('otp-local:saveConfig', {
      mode: form.value.mode,
      fixedCode: form.value.fixedCode,
      intervalSeconds: form.value.intervalSeconds,
      sendEmail: form.value.sendEmail,
      regenerateSecret: true,
    }) as any
    if (!res?.success) throw new Error(res?.error || 'No se pudo regenerar')
    await loadStatus(true)
    toast.add({ severity: 'success', summary: 'Regenerado', detail: 'La secuencia variable fue cambiada', life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo regenerar', life: 3500 })
  } finally {
    saving.value = false
  }
}

async function copiarTexto(texto: string) {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(texto)
      return
    } catch (_) {
      // Permiso denegado por Electron; usar el metodo de respaldo abajo.
    }
  }
  const area = document.createElement('textarea')
  area.value = texto
  area.style.position = 'fixed'
  area.style.opacity = '0'
  document.body.appendChild(area)
  area.select()
  const copiado = document.execCommand('copy')
  area.remove()
  if (!copiado) throw new Error('El portapapeles no esta disponible')
}

async function copyLink() {
  if (!networkUrl.value) return
  try {
    await copiarTexto(networkUrl.value)
    toast.add({ severity: 'success', summary: 'Copiado', detail: 'Enlace OTP copiado', life: 2000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo copiar', detail: error?.message || 'Error de portapapeles', life: 2500 })
  }
}

async function copyOtp() {
  const otp = String(code.value || '').trim()
  if (!/^\d{4}$/.test(otp)) return
  try {
    await copiarTexto(otp)
    toast.add({ severity: 'success', summary: 'OTP copiado', detail: `Codigo ${otp} copiado al portapapeles`, life: 2000 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo copiar', detail: error?.message || 'Error de portapapeles', life: 2500 })
  }
}

onMounted(async () => {
  loading.value = true
  await loadStatus(true)
  loading.value = false
  timer = setInterval(loadStatus, 1000)
})

onBeforeUnmount(() => { if (timer) clearInterval(timer) })
</script>

<template>
  <div v-if="!autorizado" class="rounded-xl border border-red-200 bg-red-50 p-5 text-red-700">
    Solo Administrador o Soporte puede acceder al centro OTP local.
  </div>
  <div v-else class="grid grid-cols-1 lg:grid-cols-[1fr_22rem] gap-5">
    <section class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-5">
      <div>
        <h3 class="font-semibold text-lg">Codigos OTP locales</h3>
        <p class="text-sm text-surface-500">Autoriza eliminaciones sin depender del correo SMTP.</p>
      </div>

      <div class="space-y-2">
        <label class="font-semibold text-sm">Tipo de codigo</label>
        <SelectButton v-model="form.mode" :options="modes" optionLabel="label" optionValue="value" :allowEmpty="false" fluid />
      </div>

      <div v-if="form.mode === 'fixed'" class="space-y-2">
        <label class="font-semibold text-sm">Codigo fijo de 4 digitos</label>
        <InputText v-model="form.fixedCode" maxlength="4" inputmode="numeric" placeholder="0000" fluid />
      </div>
      <div v-else class="space-y-2">
        <label class="font-semibold text-sm">Cambiar cada</label>
        <InputNumber v-model="form.intervalSeconds" :min="30" :max="3600" suffix=" segundos" fluid />
        <p class="text-xs text-surface-400">La secuencia se genera localmente y funciona aunque no haya Internet.</p>
      </div>

      <div class="flex items-center justify-between gap-4 rounded-lg border border-surface-200 dark:border-surface-700 p-4">
        <div>
          <label class="font-semibold text-sm">Enviar OTP al correo</label>
          <p class="text-xs text-surface-400 mt-1">Cuando este activo, el cliente enviara el correo destino y el codigo al endpoint OTP de TM Cloud.</p>
        </div>
        <ToggleSwitch v-model="form.sendEmail" />
      </div>

      <div class="rounded-lg border border-surface-200 dark:border-surface-700 p-4 space-y-2">
        <label class="font-semibold text-sm">Enlace para la red local</label>
        <div class="flex gap-2">
          <InputText :modelValue="networkUrl" readonly fluid />
          <Button icon="pi pi-copy" severity="secondary" outlined @click="copyLink" v-tooltip="'Copiar enlace'" />
        </div>
        <p class="text-xs text-surface-400">Solicita inicio de sesion y solo acepta usuarios Administrador o Soporte activos.</p>
      </div>

      <div class="flex flex-wrap justify-end gap-2">
        <Button v-if="form.mode === 'variable'" label="Cambiar secuencia" icon="pi pi-refresh" severity="secondary" outlined :loading="saving" @click="regenerateCode" />
        <Button label="Guardar" icon="pi pi-check" :loading="saving" @click="saveConfig" />
      </div>
    </section>

    <aside class="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 p-6 flex flex-col items-center justify-center text-center min-h-64">
      <i class="pi pi-shield text-primary text-3xl mb-3"></i>
      <p class="text-xs font-semibold uppercase tracking-widest text-primary">Codigo vigente</p>
      <div class="text-5xl font-black tracking-[0.35em] pl-[0.35em] my-5 tabular-nums">{{ loading ? '----' : code }}</div>
      <Button label="Copiar OTP" icon="pi pi-copy" severity="secondary" outlined :disabled="loading || !/^\d{4}$/.test(code)" class="mb-3" @click="copyOtp" />
      <p v-if="form.mode === 'variable'" class="text-sm text-surface-500">Cambia en {{ secondsRemaining }} segundos</p>
      <p v-else class="text-sm text-surface-500">Codigo fijo</p>
    </aside>
  </div>
</template>
