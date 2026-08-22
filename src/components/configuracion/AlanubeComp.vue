<script setup lang="ts">
import { computed, onMounted, reactive, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Password from 'primevue/password'
import Textarea from 'primevue/textarea'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

const DEFAULT_ALANUBE_BASE_URL = 'https://api.alanube.co/dom/v1'

const toast = useToast()
const loading = ref(false)
const testing = ref(false)
const companyData = ref<any | null>(null)
const fetchedAt = ref('')
const status = ref<{ ok: boolean; message: string } | null>(null)

const form = reactive({
  baseUrl: DEFAULT_ALANUBE_BASE_URL,
  token: '',
  idCompania: '',
})

const companyEndpoint = computed(() => `${form.baseUrl.replace(/\/+$/, '')}/company`)

const companyJson = computed(() => {
  if (!companyData.value) return ''
  try {
    return JSON.stringify(companyData.value, null, 2)
  } catch {
    return String(companyData.value)
  }
})

function unwrapConfigValue(res: any) {
  return res?.success ? String(res.data || '') : ''
}

function authHeader(token: string) {
  const value = token.trim()
  return value.toLowerCase().startsWith('bearer ') ? value : `Bearer ${value}`
}

function usuarioAuditoria(): string {
  try { return localStorage.getItem('mr_user_usuario') || 'CONFIG' } catch { return 'CONFIG' }
}

function tokenMasked(token: string): string {
  const value = String(token || '').trim()
  if (!value) return ''
  if (value.length <= 10) return '********'
  return `${value.slice(0, 6)}...${value.slice(-4)}`
}

async function registrarAuditoria(accion: string, detalle: any = {}, resultado = 'OK') {
  try {
    await (window as any).electron.invoke('auditoria:registrar', {
      modulo: 'configuracion',
      accion,
      entidad: 'alanube',
      entidad_id: 0,
      referencia: form.idCompania || '',
      usuario: usuarioAuditoria(),
      detalle,
      resultado,
    })
  } catch (_) {}
}

async function setConfig(clave: string, valor: string) {
  const res = await (window as any).config.set(clave, valor)
  if (!res?.success) throw new Error(res?.error || `No se pudo guardar ${clave}`)
}

async function cargar() {
  loading.value = true
  try {
    form.baseUrl = unwrapConfigValue(await (window as any).config.get('alanube_base_url')) || DEFAULT_ALANUBE_BASE_URL
    form.token = unwrapConfigValue(await (window as any).config.get('alanube_token'))
    form.idCompania = unwrapConfigValue(await (window as any).config.get('alanube_id_compania'))
    fetchedAt.value = unwrapConfigValue(await (window as any).config.get('alanube_company_fetched_at'))

    const rawCompany = unwrapConfigValue(await (window as any).config.get('alanube_company_data'))
    if (rawCompany) {
      try {
        companyData.value = JSON.parse(rawCompany)
      } catch {
        companyData.value = rawCompany
      }
    }
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo cargar Alanube', life: 3500 })
  } finally {
    loading.value = false
  }
}

async function guardar() {
  if (!form.baseUrl.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'La URL base de Alanube es requerida', life: 3000 })
    return
  }
  if (!form.token.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El token de Alanube es requerido', life: 3000 })
    return
  }
  if (!form.idCompania.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El ID de compania es requerido', life: 3000 })
    return
  }

  loading.value = true
  try {
    await setConfig('alanube_base_url', form.baseUrl.trim().replace(/\/+$/, ''))
    await setConfig('alanube_token', form.token.trim())
    await setConfig('alanube_id_compania', form.idCompania.trim())
    await registrarAuditoria('guardar_alanube', {
      base_url: form.baseUrl.trim().replace(/\/+$/, ''),
      id_compania: form.idCompania.trim(),
      token: tokenMasked(form.token),
    })
    status.value = { ok: true, message: 'Configuracion guardada' }
    toast.add({ severity: 'success', summary: 'Exito', detail: 'Configuracion de Alanube guardada', life: 3000 })
  } catch (error: any) {
    await registrarAuditoria('guardar_alanube', { error: error?.message || 'Error al guardar' }, 'ERROR')
    status.value = { ok: false, message: error?.message || 'Error al guardar' }
    toast.add({ severity: 'error', summary: 'Error', detail: status.value.message, life: 3500 })
  } finally {
    loading.value = false
  }
}

async function probarConexion() {
  if (!form.baseUrl.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'La URL base de Alanube es requerida', life: 3000 })
    return
  }
  if (!form.token.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El token de Alanube es requerido', life: 3000 })
    return
  }
  if (!form.idCompania.trim()) {
    toast.add({ severity: 'warn', summary: 'Atencion', detail: 'El ID de compania es requerido', life: 3000 })
    return
  }

  testing.value = true
  status.value = null
  try {
    const id = encodeURIComponent(form.idCompania.trim())
    const res = await fetch(`${companyEndpoint.value}/${id}`, {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: authHeader(form.token),
      },
    })

    const contentType = res.headers.get('content-type') || ''
    const data = contentType.includes('application/json') ? await res.json() : await res.text()
    if (!res.ok) {
      const message = typeof data === 'object'
        ? data?.message || data?.error || `Alanube respondio ${res.status}`
        : data || `Alanube respondio ${res.status}`
      if (res.status === 401) {
        throw new Error(`${message}. Revisa que el token sea valido para este ambiente y que la URL base corresponda al token.`)
      }
      throw new Error(message)
    }

    companyData.value = data
    fetchedAt.value = new Date().toISOString()
    await setConfig('alanube_base_url', form.baseUrl.trim().replace(/\/+$/, ''))
    await setConfig('alanube_token', form.token.trim())
    await setConfig('alanube_id_compania', form.idCompania.trim())
    await setConfig('alanube_company_data', JSON.stringify(data))
    await setConfig('alanube_company_fetched_at', fetchedAt.value)
    await registrarAuditoria('probar_conexion_alanube', {
      base_url: form.baseUrl.trim().replace(/\/+$/, ''),
      id_compania: form.idCompania.trim(),
      http_status: res.status,
    })

    status.value = { ok: true, message: 'Conexion exitosa. Datos de la empresa guardados.' }
    toast.add({ severity: 'success', summary: 'Alanube', detail: status.value.message, life: 3500 })
  } catch (error: any) {
    await registrarAuditoria('probar_conexion_alanube', {
      base_url: form.baseUrl.trim().replace(/\/+$/, ''),
      id_compania: form.idCompania.trim(),
      error: error?.message || 'No se pudo conectar con Alanube',
    }, 'ERROR')
    status.value = { ok: false, message: error?.message || 'No se pudo conectar con Alanube' }
    toast.add({ severity: 'error', summary: 'Alanube', detail: status.value.message, life: 4500 })
  } finally {
    testing.value = false
  }
}

onMounted(cargar)
</script>

<template>
  <div>
    <Toast />

    <div v-if="loading && !testing" class="flex items-center justify-center py-20 text-surface-400 gap-3">
      <i class="pi pi-spin pi-spinner text-2xl"></i>
      <span>Cargando configuracion de Alanube...</span>
    </div>

    <div v-else class="max-w-3xl mx-auto space-y-6">
      <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="w-10 h-10 rounded-xl bg-cyan-100 dark:bg-cyan-900/30 flex items-center justify-center">
          <i class="pi pi-cloud text-cyan-600 dark:text-cyan-300 text-lg"></i>
        </div>
        <div>
          <h2 class="text-xl font-bold">Alanube</h2>
          <p class="text-sm text-surface-500">Credenciales y consulta de empresa</p>
        </div>
      </div>

      <div class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800/50 p-5 space-y-5">
        <div class="space-y-1.5">
          <label class="text-sm font-semibold flex items-center gap-1.5">
            <i class="pi pi-link text-surface-400 text-xs"></i>
            URL Base <span class="text-red-400">*</span>
          </label>
          <InputText v-model="form.baseUrl" placeholder="https://api.alanube.co/dom/v1" fluid />
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div class="space-y-1.5">
            <label class="text-sm font-semibold flex items-center gap-1.5">
              <i class="pi pi-key text-surface-400 text-xs"></i>
              Token <span class="text-red-400">*</span>
            </label>
            <Password v-model="form.token" placeholder="Bearer token de Alanube" :feedback="false" toggleMask fluid />
          </div>

          <div class="space-y-1.5">
            <label class="text-sm font-semibold flex items-center gap-1.5">
              <i class="pi pi-building text-surface-400 text-xs"></i>
              ID Compania <span class="text-red-400">*</span>
            </label>
            <InputText v-model="form.idCompania" placeholder="ID de la empresa" fluid />
          </div>
        </div>

        <div class="text-xs text-surface-400">
          Endpoint: <span class="font-mono">{{ companyEndpoint }}/{id}</span>
        </div>

        <div class="flex flex-wrap items-center justify-end gap-3 pt-4 border-t border-surface-200 dark:border-surface-700">
          <Button label="Guardar" icon="pi pi-check" severity="secondary" :loading="loading" @click="guardar" />
          <Button label="Probar conexion" icon="pi pi-plug" :loading="testing" @click="probarConexion" />
        </div>
      </div>

      <div
        v-if="status"
        class="rounded-2xl border p-4 flex items-start gap-3"
        :class="status.ok ? 'border-emerald-200 bg-emerald-50/60 dark:border-emerald-800 dark:bg-emerald-900/10' : 'border-red-200 bg-red-50/60 dark:border-red-800 dark:bg-red-900/10'"
      >
        <i :class="status.ok ? 'pi pi-check-circle text-emerald-500' : 'pi pi-exclamation-triangle text-red-500'" class="text-lg mt-0.5"></i>
        <div>
          <div class="text-sm font-semibold" :class="status.ok ? 'text-emerald-700 dark:text-emerald-300' : 'text-red-700 dark:text-red-300'">
            {{ status.message }}
          </div>
          <div v-if="fetchedAt" class="text-xs text-surface-500 mt-1">
            Ultima consulta: {{ new Date(fetchedAt).toLocaleString() }}
          </div>
        </div>
      </div>

      <div v-if="companyData" class="rounded-2xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800/50 p-5 space-y-3">
        <div class="flex items-center gap-2">
          <i class="pi pi-database text-surface-400 text-sm"></i>
          <span class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Datos guardados de la empresa</span>
        </div>
        <Textarea :model-value="companyJson" readonly autoResize rows="10" class="w-full font-mono text-xs" />
      </div>
    </div>
  </div>
</template>
