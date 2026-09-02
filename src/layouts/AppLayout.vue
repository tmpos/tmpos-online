<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute } from 'vue-router'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import AppTopbar from '@/components/AppTopbar.vue'
import JarvisAssistant from '@/components/assistant/JarvisAssistant.vue'
import GlobalSearchPalette from '@/components/GlobalSearchPalette.vue'
import { version } from '../../package.json'
import { useConexion } from '@/composables/useConexion'

const route = useRoute()
const toast = useToast()
const isLogin = () => route.name === 'login'
const isLicense = () => route.name === 'license'
let lastEditable: HTMLElement | null = null
const contentRefreshKey = ref(0)
const conexion = useConexion()
const licenciaEstado = ref('')
const licenciaDias = ref<number | null>(null)

const licenciaActiva = computed(() => ['activo', 'activa'].includes(licenciaEstado.value.toLowerCase()))
const licenciaLabel = computed(() => {
  const estado = licenciaEstado.value.toLowerCase()
  if (['activo', 'activa'].includes(estado)) return 'Licencia activa'
  if (estado === 'pendiente') return 'Licencia pendiente'
  if (estado === 'vencida') return 'Licencia vencida'
  if (estado === 'bloqueada') return 'Licencia bloqueada'
  return licenciaEstado.value ? `Licencia ${licenciaEstado.value}` : 'Verificando licencia'
})

function actualizarEstadoLicencia(value: any) {
  licenciaEstado.value = String(value?.estado || '')
  licenciaDias.value = value?.dias == null ? null : Number(value.dias)
}

function onLicenseStatus(event: Event) {
  actualizarEstadoLicencia((event as CustomEvent).detail || {})
}

function getEditableTarget(target: EventTarget | null): HTMLElement | null {
  const element = target instanceof Element
    ? target.closest('input, textarea, select, [contenteditable="true"]') as HTMLElement | null
    : null
  if (!element) return null
  const control = element as HTMLInputElement
  if (control.disabled || control.readOnly) return null
  return element
}

function rememberEditableFocus(event: FocusEvent) {
  const editable = getEditableTarget(event.target)
  if (editable) lastEditable = editable
}

function ensureClickedEditableFocus(event: PointerEvent) {
  const editable = getEditableTarget(event.target)
  if (!editable) return
  lastEditable = editable
  requestAnimationFrame(() => {
    if (editable.isConnected && document.activeElement !== editable) {
      editable.focus({ preventScroll: true })
    }
  })
}

function restoreWebFocus() {
  requestAnimationFrame(() => {
    if (
      lastEditable?.isConnected &&
      (!document.activeElement || document.activeElement === document.body)
    ) {
      lastEditable.focus({ preventScroll: true })
    }
  })
}

function onTmCloudLocalChange(event: Event) {
  const detail = (event as CustomEvent).detail || {}
  if (!['INSERT', 'UPDATE'].includes(detail.eventType)) return
  toast.add({
    severity: detail.eventType === 'INSERT' ? 'success' : 'info',
    summary: detail.eventType === 'INSERT' ? 'Dato nuevo recibido' : 'Dato actualizado',
    detail: `${detail.table || 'Tabla'} se actualizo desde TM Cloud`,
    life: 3500,
  })
}

function onJarvisDataChange() {
  contentRefreshKey.value += 1
}

onMounted(() => {
  window.addEventListener('tmcloud:local-change', onTmCloudLocalChange)
  window.addEventListener('jarvis:data-change', onJarvisDataChange)
  window.addEventListener('focus', restoreWebFocus)
  document.addEventListener('focusin', rememberEditableFocus)
  document.addEventListener('pointerdown', ensureClickedEditableFocus, true)
  window.addEventListener('licencia:estado', onLicenseStatus)
  actualizarEstadoLicencia((window as any).__tmposLicenseStatus || {})
})

onBeforeUnmount(() => {
  window.removeEventListener('tmcloud:local-change', onTmCloudLocalChange)
  window.removeEventListener('jarvis:data-change', onJarvisDataChange)
  window.removeEventListener('focus', restoreWebFocus)
  document.removeEventListener('focusin', rememberEditableFocus)
  document.removeEventListener('pointerdown', ensureClickedEditableFocus, true)
  window.removeEventListener('licencia:estado', onLicenseStatus)
})
</script>

<template>
  <Toast position="top-right" />
  <div v-if="isLogin() || isLicense()" class="h-screen overflow-hidden bg-surface-100 dark:bg-surface-900">
    <router-view />
  </div>
  <div v-else class="app-shell flex flex-col h-screen overflow-hidden text-surface-900 dark:text-surface-0">
    <AppTopbar />
    <main
      class="app-main flex-1 min-h-0 min-w-0 overflow-auto"
      :class="{ 'app-main--pos': route.name === 'vender' }"
    >
      <div class="app-main-inner" :class="{ 'app-main-inner--pos': route.name === 'vender' }">
        <router-view :key="`${route.fullPath}:${contentRefreshKey}`" />
      </div>
    </main>
    <footer class="app-footer shrink-0 py-2.5 px-6 text-sm text-surface-500 dark:text-surface-400 flex flex-wrap items-center justify-center gap-x-4 gap-y-2">
      <div class="flex items-center gap-1">
        <span>&copy; {{ new Date().getFullYear() }} TMPOS SRL</span>
        <span class="mx-1">v{{ version }}</span>
      </div>
      <span class="hidden sm:block h-4 w-px bg-surface-300 dark:bg-surface-700"></span>
      <div class="flex items-center gap-4 text-xs font-medium">
        <span class="inline-flex items-center gap-1.5" :class="licenciaActiva ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'" :title="licenciaDias !== null ? `${licenciaDias} días restantes` : licenciaLabel">
          <span class="h-2 w-2 rounded-full" :class="licenciaActiva ? 'bg-emerald-500' : 'bg-amber-500'"></span>
          {{ licenciaLabel }}
          <span v-if="licenciaDias !== null" class="text-surface-400">({{ licenciaDias }} días)</span>
        </span>
        <span class="inline-flex items-center gap-1.5" :class="conexion.isOnline.value ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'">
          <span class="h-2 w-2 rounded-full" :class="conexion.isOnline.value ? 'bg-emerald-500' : 'bg-red-500'"></span>
          <i :class="conexion.isOnline.value ? 'pi pi-wifi' : 'pi pi-ban'" class="text-[11px]"></i>
          {{ conexion.isOnline.value ? 'En línea' : 'Offline · Sin Internet' }}
        </span>
      </div>
    </footer>
    <JarvisAssistant />
    <GlobalSearchPalette />
  </div>
</template>

<style>
.app-shell {
  background:
    radial-gradient(circle at 18% 0%, rgba(59, 130, 246, 0.08), transparent 34rem),
    linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
}

.dark .app-shell {
  background:
    radial-gradient(circle at 18% 0%, rgba(59, 130, 246, 0.14), transparent 34rem),
    linear-gradient(180deg, #020617 0%, #0f172a 100%);
}

.glass .app-shell {
  background:
    radial-gradient(circle at 12% 8%, rgba(125, 211, 252, 0.68), transparent 30rem),
    radial-gradient(circle at 88% 18%, rgba(196, 181, 253, 0.6), transparent 34rem),
    radial-gradient(circle at 56% 96%, rgba(251, 207, 232, 0.5), transparent 38rem),
    linear-gradient(145deg, #eaf5ff 0%, #eef2ff 46%, #fdf2f8 100%);
}

.glass.dark .app-shell {
  background:
    radial-gradient(circle at 12% 5%, rgba(14, 165, 233, 0.28), transparent 32rem),
    radial-gradient(circle at 88% 14%, rgba(124, 58, 237, 0.25), transparent 36rem),
    radial-gradient(circle at 55% 100%, rgba(219, 39, 119, 0.14), transparent 40rem),
    linear-gradient(145deg, #06101f 0%, #111827 52%, #170e25 100%);
}

.app-main {
  padding: 1.25rem;
  min-height: 0;
  min-width: 0;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}

.app-main-inner {
  width: 100%;
  max-width: 1680px;
  min-height: 100%;
  min-width: 0;
  margin: 0 auto;
}

/* En el POS el viewport queda fijo para que solo los catalogos de productos
   (telefonos, accesorios y electronicos) manejen su propio scroll vertical. */
.app-main--pos {
  overflow: hidden;
}

.app-main-inner--pos {
  height: 100%;
  min-height: 0;
}

.app-footer {
  border-top: 1px solid rgba(203, 213, 225, 0.76);
  background: rgba(248, 250, 252, 0.78);
  backdrop-filter: blur(16px);
}

.dark .app-footer {
  border-top-color: rgba(51, 65, 85, 0.8);
  background: rgba(2, 6, 23, 0.76);
}

.glass .app-footer {
  border-top-color: rgba(255, 255, 255, 0.58);
  background: rgba(255, 255, 255, 0.42);
  -webkit-backdrop-filter: saturate(160%) blur(26px);
  backdrop-filter: saturate(160%) blur(26px);
}

.glass.dark .app-footer {
  border-top-color: rgba(255, 255, 255, 0.1);
  background: rgba(2, 6, 23, 0.4);
}

@media (min-width: 1024px) {
  .app-main {
    padding: 1.35rem 1.5rem 1.1rem;
  }
}

@media (max-width: 640px) {
  .app-main {
    padding: 0.85rem;
  }
}

.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0;
}
</style>
