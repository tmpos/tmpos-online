<script setup lang="ts">
import { ref, onMounted } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import InputSwitch from 'primevue/inputswitch'
import Dialog from 'primevue/dialog'
import InputOtp from 'primevue/inputotp'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const loading = ref(false)
const guardando = ref(false)
const registroId = ref<number | null>(null)

const showTestDialog = ref(false)
const testEmail = ref('')
const testEnviando = ref(false)
const showOtpDialog = ref(false)
const otpCodigo = ref('')
const otpInput = ref('')
const otpEnviando = ref(false)
const otpVerificado = ref(false)
const otpError = ref('')

const form = ref({
  activo: false,
  email: '',
  password: '',
})

function passwordInfo(value: unknown) {
  const texto = String(value || '')
  return {
    length: texto.length,
    format: texto.startsWith('b64:') ? 'b64-prefixed' : texto.includes('=') ? 'base64-padded' : 'plain-or-unpadded',
  }
}

async function cargarConfig() {
  loading.value = true
  try {
    const res = await window.db.getAll('correo')
    if (!res.success) throw new Error(res.error || 'No se pudo cargar la configuracion')

    let row = res.data?.[0]
    if (!row) {
      const localRes = await window.electron.invoke('correo-local:getConfig') as any
      if (!localRes?.success) throw new Error(localRes?.error || 'No se pudo leer la configuracion local de correo')
      if (localRes.data) {
        const { id: _localId, ...configLocal } = localRes.data
        const migracion = await window.db.insert('correo', configLocal)
        if (!migracion.success) throw new Error(migracion.error || 'No se pudo guardar la configuracion de correo en el servidor')
        row = { ...configLocal, ...(migracion.data || {}) }
      }
    }

    if (row) {
      const syncLocal = await window.electron.invoke('correo-local:saveConfig', row) as any
      if (!syncLocal?.success) throw new Error(syncLocal?.error || 'No se pudo sincronizar la configuracion SMTP local')
      console.info('[CorreoConfig] Configuracion leida de DB', {
        id: row.id,
        email: row.email || '',
        activo: Boolean(row.activo),
        password: passwordInfo(row.password),
      })
      registroId.value = row.id
      form.value = {
        activo: Boolean(row.activo),
        email: row.email || '',
        // Mostrar exactamente lo almacenado. La decodificacion para SMTP se
        // realiza solamente en el proceso principal y nunca modifica este valor.
        password: String(row.password || ''),
      }
      otpVerificado.value = false
    }
  } catch (error: any) {
    console.error(error)
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar la configuracion', life: 3500 })
  } finally {
    loading.value = false
  }
}

async function guardar() {
  if (!form.value.email.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El correo es requerido', life: 3000 })
    return
  }

  guardando.value = true
  try {
    const data = {
      activo: form.value.activo ? 1 : 0,
      email: form.value.email.trim().toLowerCase(),
      // No codificar, decodificar ni agregar prefijos al guardar.
      password: form.value.password.trim(),
    }
    console.info('[CorreoConfig] Guardando configuracion', {
      id: registroId.value,
      email: data.email,
      activo: Boolean(data.activo),
      password: passwordInfo(data.password),
    })

    let res
    if (registroId.value) {
      res = await window.db.update('correo', registroId.value, data)
    } else {
      res = await window.db.insert('correo', data)
    }

    if (res.success) {
      const syncLocal = await window.electron.invoke('correo-local:saveConfig', data) as any
      if (!syncLocal?.success) throw new Error(syncLocal?.error || 'No se pudo sincronizar la configuracion SMTP local')
      const verificacion = registroId.value
        ? await window.db.getById('correo', registroId.value)
        : await window.db.getAll('correo')
      const guardado = registroId.value
        ? verificacion.data
        : (verificacion.data || []).find((row: any) => String(row.email || '') === data.email)
      const coincide = String(guardado?.password || '') === data.password
      console.info('[CorreoConfig] Verificacion posterior al guardado', {
        success: verificacion.success,
        coincideExactamente: coincide,
        passwordEnDB: passwordInfo(guardado?.password),
      })
      if (!verificacion.success || !coincide) {
        toast.add({ severity: 'error', summary: 'Error', detail: 'La contrasena SMTP no quedo guardada exactamente como fue introducida', life: 5000 })
        return
      }
      toast.add({ severity: 'success', summary: 'Guardado', detail: 'Configuracion de correo actualizada', life: 2500 })
      await cargarConfig()
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudo guardar', life: 3000 })
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'Error al guardar la configuracion', life: 3000 })
  } finally {
    guardando.value = false
  }
}

async function solicitarOtp() {
  if (!form.value.email.trim() || !form.value.email.includes('@')) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Configura un correo valido primero', life: 3000 })
    return
  }
  otpEnviando.value = true
  otpError.value = ''
  try {
    otpCodigo.value = String(Math.floor(100000 + Math.random() * 900000))
    const res = await (window as any).electron.invoke('enviar:otp', form.value.email.trim(), otpCodigo.value)
    if (res.success) {
      otpInput.value = ''
      showOtpDialog.value = true
      toast.add({ severity: 'success', summary: 'OTP enviado', detail: `Codigo enviado a ${form.value.email}`, life: 4000 })
    } else {
      otpError.value = res.error || 'No se pudo enviar el OTP'
      toast.add({ severity: 'error', summary: 'Error', detail: otpError.value, life: 4000 })
    }
  } catch (e: any) {
    otpError.value = e.message || 'Error al enviar OTP'
    toast.add({ severity: 'error', summary: 'Error', detail: otpError.value, life: 4000 })
  } finally {
    otpEnviando.value = false
  }
}

function verificarOtp() {
  if (otpInput.value === otpCodigo.value) {
    otpVerificado.value = true
    showOtpDialog.value = false
    toast.add({ severity: 'success', summary: 'Verificado', detail: 'Codigo correcto, puedes ver la contrasena', life: 3000 })
  } else {
    toast.add({ severity: 'error', summary: 'Error', detail: 'Codigo incorrecto', life: 3000 })
  }
}

async function enviarPrueba() {
  if (!testEmail.value.trim() || !testEmail.value.includes('@')) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'Ingresa un correo valido', life: 3000 })
    return
  }
  testEnviando.value = true
  try {
    const res = await (window as any).electron.invoke('enviar:testEmail', testEmail.value.trim())
    if (res.success) {
      toast.add({ severity: 'success', summary: 'Enviado', detail: res.message, life: 5000 })
      showTestDialog.value = false
      testEmail.value = ''
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error, life: 5000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'Error al enviar', life: 5000 })
  } finally {
    testEnviando.value = false
  }
}

onMounted(cargarConfig)
</script>

<template>
  <div>
    <Toast />

    <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5">
      <div v-if="loading" class="text-center py-10 text-surface-500">Cargando configuracion...</div>

      <div v-else class="space-y-5">
        <div class="flex items-center justify-between gap-3">
          <div>
            <h3 class="font-semibold text-lg">Correo SMTP</h3>
            <p class="text-sm text-surface-500">Cuenta de correo para enviar reportes y notificaciones.</p>
          </div>
          <div class="flex items-center gap-2">
            <span class="text-sm text-surface-500">Activo</span>
            <InputSwitch v-model="form.activo" />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Correo electronico</label>
            <InputText v-model="form.email" placeholder="correo@dominio.com" fluid />
          </div>
          <div class="flex flex-col gap-1">
            <label class="font-semibold text-sm">Contrasena</label>
            <Password v-model="form.password" placeholder="Contrasena de aplicacion SMTP" toggleMask :feedback="false" fluid />
            <small class="text-xs text-surface-400">Para Gmail usa una contrasena de aplicacion.</small>
          </div>
        </div>

        <div class="flex justify-end gap-2">
          <Button label="Enviar prueba" icon="pi pi-send" severity="secondary" @click="showTestDialog = true" />
          <Button label="Guardar" icon="pi pi-check" :loading="guardando" @click="guardar" />
        </div>
      </div>
    </div>

    <Dialog v-model:visible="showOtpDialog" header="Verificar con OTP" :modal="true" :closable="true" style="width: 360px">
      <div class="flex flex-col items-center gap-4 py-2">
        <div class="w-14 h-14 rounded-2xl flex items-center justify-center" style="background:var(--p-primary-500)"><i class="pi pi-shield text-white text-xl"></i></div>
        <p class="text-sm text-surface-500 text-center">Hemos enviado un codigo de verificacion a <strong>{{ form.email }}</strong></p>
        <InputOtp v-model="otpInput" :length="6" mask class="gap-2" />
        <p v-if="otpError" class="text-red-500 text-xs">{{ otpError }}</p>
        <button @click="solicitarOtp" class="text-xs text-primary hover:underline" :disabled="otpEnviando">Reenviar codigo</button>
      </div>
      <template #footer>
        <Button label="Cancelar" icon="pi pi-times" severity="secondary" @click="showOtpDialog = false" />
        <Button label="Verificar" icon="pi pi-check" :disabled="otpInput.length < 6" @click="verificarOtp" />
      </template>
    </Dialog>

    <Dialog v-model:visible="showTestDialog" header="Enviar correo de prueba" :modal="true" :closable="true" style="width: 400px">
      <div class="flex flex-col gap-3">
        <label class="font-semibold text-sm">Correo destinatario</label>
        <InputText v-model="testEmail" placeholder="destinatario@correo.com" fluid />
      </div>
      <template #footer>
        <Button label="Cancelar" icon="pi pi-times" severity="secondary" @click="showTestDialog = false" />
        <Button label="Enviar" icon="pi pi-send" :loading="testEnviando" @click="enviarPrueba" />
      </template>
    </Dialog>
  </div>
</template>
