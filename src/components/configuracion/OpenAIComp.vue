<script setup lang="ts">
import { onMounted, ref } from 'vue'
import Button from 'primevue/button'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import ToggleSwitch from 'primevue/toggleswitch'
import { useToast } from 'primevue/usetoast'

const toast = useToast()
const loading = ref(false)
const testing = ref(false)
const showKey = ref(false)
const maskedKey = ref('')
const hasKey = ref(false)

const form = ref({
  enabled: false,
  api_key: '',
  model: 'gpt-5.6-sol',
  voice_enabled: true,
  voice: 'es-DO',
})

const models = [
  { label: 'GPT-5.6 Sol — máxima inteligencia', value: 'gpt-5.6-sol' },
  { label: 'GPT-5.6 Terra — balance calidad/costo', value: 'gpt-5.6-terra' },
  { label: 'GPT-5.6 Luna — rápido y económico', value: 'gpt-5.6-luna' },
  { label: 'GPT-4.1 — muy bueno usando herramientas', value: 'gpt-4.1' },
  { label: 'GPT-4.1 mini — rápido y económico', value: 'gpt-4.1-mini' },
  { label: 'GPT-4o — multimodal', value: 'gpt-4o' },
  { label: 'GPT-4o mini — el más económico', value: 'gpt-4o-mini' },
]

const voices = [
  { label: 'Español (República Dominicana)', value: 'es-DO' },
  { label: 'Español (Latinoamérica)', value: 'es-419' },
  { label: 'Español (España)', value: 'es-ES' },
]

async function loadConfig() {
  loading.value = true
  try {
    const result = await window.electron.invoke('openai:getConfig') as any
    if (!result?.success) throw new Error(result?.error || 'No se pudo cargar la configuración')
    form.value.enabled = result.data.enabled
    form.value.model = result.data.model || 'gpt-5.6-sol'
    form.value.voice_enabled = result.data.voice_enabled
    form.value.voice = result.data.voice || 'es-DO'
    maskedKey.value = result.data.masked_api_key || ''
    hasKey.value = Boolean(result.data.has_api_key)
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3500 })
  } finally {
    loading.value = false
  }
}

async function saveConfig(showToast = true) {
  loading.value = true
  try {
    const payload = {
      enabled: Boolean(form.value.enabled),
      api_key: String(form.value.api_key || ''),
      model: String(form.value.model || 'gpt-5.6-sol'),
      voice_enabled: Boolean(form.value.voice_enabled),
      voice: String(form.value.voice || 'es-DO'),
    }
    const result = await window.electron.invoke('openai:saveConfig', payload) as any
    if (!result?.success) throw new Error(result?.error || 'No se pudo guardar')
    hasKey.value = Boolean(result.data?.has_api_key)
    form.value.api_key = ''
    await loadConfig()
    window.dispatchEvent(new CustomEvent('jarvis:config-change'))
    if (showToast) {
      toast.add({ severity: 'success', summary: 'Jarvis configurado', detail: 'Configuración de OpenAI guardada', life: 2500 })
    }
    return true
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 4000 })
    return false
  } finally {
    loading.value = false
  }
}

async function testConnection() {
  testing.value = true
  try {
    if (!(await saveConfig(false))) return
    const result = await window.electron.invoke('openai:request', {
      model: form.value.model,
      input: 'Responde únicamente con: CONEXION OK',
      max_output_tokens: 30,
    }) as any
    if (!result?.success) throw new Error(result?.error || 'La prueba falló')
    toast.add({ severity: 'success', summary: 'Conexión correcta', detail: 'OpenAI respondió correctamente', life: 3500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'No se pudo conectar', detail: error.message, life: 5000 })
  } finally {
    testing.value = false
  }
}

async function clearKey() {
  if (!window.confirm('¿Deseas eliminar la API key guardada de este equipo?')) return
  loading.value = true
  try {
    const result = await window.electron.invoke('openai:saveConfig', { ...form.value, clear_api_key: true }) as any
    if (!result?.success) throw new Error(result?.error || 'No se pudo eliminar')
    hasKey.value = false
    maskedKey.value = ''
    window.dispatchEvent(new CustomEvent('jarvis:config-change'))
    toast.add({ severity: 'success', summary: 'API key eliminada', life: 2500 })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error.message, life: 3500 })
  } finally {
    loading.value = false
  }
}

onMounted(loadConfig)
</script>

<template>
  <div class="space-y-6">
    <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
      <div class="w-11 h-11 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
        <i class="pi pi-sparkles text-primary text-xl"></i>
      </div>
      <div>
        <h2 class="text-xl font-bold">OpenAI / Jarvis</h2>
        <p class="text-sm text-surface-500">Asistente inteligente por voz para operar TMPOS</p>
      </div>
    </div>

    <div class="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_22rem] gap-6">
      <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-5">
        <div class="flex items-center justify-between gap-4">
          <div>
            <p class="font-semibold">Activar Jarvis</p>
            <p class="text-xs text-surface-500">Muestra el asistente flotante en todo el sistema</p>
          </div>
          <ToggleSwitch v-model="form.enabled" />
        </div>

        <div class="space-y-2">
          <label class="text-sm font-semibold">API key de OpenAI</label>
          <div class="flex gap-2">
            <div class="relative flex-1">
              <InputText
                v-model="form.api_key"
                :type="showKey ? 'text' : 'password'"
                :placeholder="hasKey ? maskedKey : 'sk-...'"
                autocomplete="off"
                fluid
              />
            </div>
            <Button :icon="showKey ? 'pi pi-eye-slash' : 'pi pi-eye'" severity="secondary" outlined @click="showKey = !showKey" />
            <Button v-if="hasKey" icon="pi pi-trash" severity="danger" outlined @click="clearKey" />
          </div>
          <p class="text-xs text-surface-500">
            {{ hasKey ? `Hay una clave guardada (${maskedKey}). Déjalo vacío para conservarla.` : 'Crea una clave en la plataforma de OpenAI y pégala aquí.' }}
          </p>
          <p class="text-xs text-amber-600 dark:text-amber-400">
            ChatGPT Plus/Pro no incluye crédito para la API. La API necesita facturación o saldo propio.
            <a href="https://platform.openai.com/settings/organization/billing/overview" target="_blank" rel="noreferrer" class="underline font-semibold">Revisar facturación</a>
          </p>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div class="space-y-2">
            <label class="text-sm font-semibold">Modelo</label>
            <Select v-model="form.model" :options="models" optionLabel="label" optionValue="value" fluid />
          </div>
          <div class="space-y-2">
            <label class="text-sm font-semibold">Idioma de reconocimiento</label>
            <Select v-model="form.voice" :options="voices" optionLabel="label" optionValue="value" fluid />
          </div>
        </div>

        <div class="flex items-center justify-between gap-4 rounded-lg bg-surface-50 dark:bg-surface-900/40 p-3">
          <div>
            <p class="text-sm font-medium">Leer respuestas en voz alta</p>
            <p class="text-xs text-surface-500">Usa la voz instalada en este dispositivo</p>
          </div>
          <ToggleSwitch v-model="form.voice_enabled" />
        </div>

        <div class="flex flex-wrap justify-end gap-2 pt-2">
          <Button label="Probar conexión" icon="pi pi-wifi" severity="secondary" outlined :loading="testing" @click="testConnection" />
          <Button label="Guardar" icon="pi pi-save" :loading="loading" @click="saveConfig()" />
        </div>
      </div>

      <aside class="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-950/30 p-5 space-y-4">
        <div class="flex items-center gap-2 text-primary">
          <i class="pi pi-shield"></i>
          <h3 class="font-bold">Acciones disponibles</h3>
        </div>
        <ul class="text-sm space-y-3 text-surface-700 dark:text-surface-200">
          <li class="flex gap-2"><i class="pi pi-search mt-0.5 text-primary"></i><span>Buscar IMEI y consultar inventario.</span></li>
          <li class="flex gap-2"><i class="pi pi-users mt-0.5 text-primary"></i><span>Buscar y crear clientes.</span></li>
          <li class="flex gap-2"><i class="pi pi-receipt mt-0.5 text-primary"></i><span>Preparar facturas en el POS.</span></li>
          <li class="flex gap-2"><i class="pi pi-chart-bar mt-0.5 text-primary"></i><span>Consultar ventas del día y resúmenes.</span></li>
          <li class="flex gap-2"><i class="pi pi-compass mt-0.5 text-primary"></i><span>Abrir módulos del sistema.</span></li>
        </ul>
        <p class="text-xs text-surface-500 border-t border-primary-200 dark:border-primary-800 pt-3">
          Jarvis pide confirmación antes de crear clientes o preparar ventas. El cobro final siempre se realiza desde el POS.
        </p>
      </aside>
    </div>
  </div>
</template>
