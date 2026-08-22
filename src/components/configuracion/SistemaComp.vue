<script setup lang="ts">
import { ref, computed, onMounted, watch } from 'vue'
import { useThemeStore } from '@/stores/theme'
import { useAlmacenStore } from '@/stores/almacen.store'
import InputText from 'primevue/inputtext'
import InputNumber from 'primevue/inputnumber'
import InputSwitch from 'primevue/inputswitch'
import Select from 'primevue/select'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'
import { useToast } from 'primevue/usetoast'
import Toast from 'primevue/toast'
import { getLocaleProfile, localeProfiles } from '@/i18n/localeProfiles'

const toast = useToast()
const theme = useThemeStore()
const almacenStore = useAlmacenStore()
const serverUrl = ref('')
const copiando = ref(false)
const shadeSeleccionada = ref(theme.colorShade || '500')
const shadeTopbar = ref(theme.topbarShade || '500')
const textoBarraPersonalizado = ref(theme.topbarTextColor === 'auto' ? '#0f172a' : theme.topbarTextColor)
const guardandoApariencia = ref(false)
const cargandoApariencia = ref(false)
const aparienciaPendiente = ref(false)
const dialogoLimpiar = ref(false)
const limpiando = ref(false)
const solicitarClaveAlAbrir = ref(true)
const guardandoSeguridad = ref(false)

const config = ref({
  app_nombre: 'TMPOS',
  pais: 'DO',
  moneda: 'DOP',
  simbolo_moneda: 'RD$',
  formato_fecha: 'DD/MM/YYYY',
  zona_horaria: 'America/Santo_Domingo',
  idioma: 'es-DO',
  locale: 'es-DO',
  impuesto_nombre: 'ITBIS',
  impuesto_porcentaje: 18,
})

const paises = [
  { label: '🇩🇴 República Dominicana', value: 'DO', idioma: 'es', locale: 'es-DO', moneda: 'DOP', simbolo: 'RD$', fecha: 'DD/MM/YYYY', zona: 'America/Santo_Domingo' },
  { label: '🇺🇸 Estados Unidos', value: 'US', idioma: 'en-US', locale: 'en-US', moneda: 'USD', simbolo: '$', fecha: 'MM/DD/YYYY', zona: 'America/New_York' },
  { label: '🇲🇽 México', value: 'MX', idioma: 'es', locale: 'es-MX', moneda: 'MXN', simbolo: '$', fecha: 'DD/MM/YYYY', zona: 'America/Mexico_City' },
  { label: '🇨🇦 Canadá', value: 'CA', idioma: 'en-US', locale: 'en-CA', moneda: 'CAD', simbolo: 'CA$', fecha: 'YYYY-MM-DD', zona: 'America/Toronto' },
  { label: '🇧🇷 Brasil', value: 'BR', idioma: 'pt-BR', locale: 'pt-BR', moneda: 'BRL', simbolo: 'R$', fecha: 'DD/MM/YYYY', zona: 'America/Sao_Paulo' },
  { label: '🇦🇷 Argentina', value: 'AR', idioma: 'es', locale: 'es-AR', moneda: 'ARS', simbolo: '$', fecha: 'DD/MM/YYYY', zona: 'America/Argentina/Buenos_Aires' },
  { label: '🇨🇴 Colombia', value: 'CO', idioma: 'es', locale: 'es-CO', moneda: 'COP', simbolo: '$', fecha: 'DD/MM/YYYY', zona: 'America/Bogota' },
  { label: '🇨🇱 Chile', value: 'CL', idioma: 'es', locale: 'es-CL', moneda: 'CLP', simbolo: '$', fecha: 'DD/MM/YYYY', zona: 'America/Santiago' },
  { label: '🇵🇪 Perú', value: 'PE', idioma: 'es', locale: 'es-PE', moneda: 'PEN', simbolo: 'S/', fecha: 'DD/MM/YYYY', zona: 'America/Lima' },
  { label: '🇵🇦 Panamá', value: 'PA', idioma: 'es', locale: 'es-PA', moneda: 'PAB', simbolo: 'B/.', fecha: 'DD/MM/YYYY', zona: 'America/Panama' },
  { label: '🇨🇷 Costa Rica', value: 'CR', idioma: 'es', locale: 'es-CR', moneda: 'CRC', simbolo: '₡', fecha: 'DD/MM/YYYY', zona: 'America/Costa_Rica' },
  { label: '🇬🇹 Guatemala', value: 'GT', idioma: 'es', locale: 'es-GT', moneda: 'GTQ', simbolo: 'Q', fecha: 'DD/MM/YYYY', zona: 'America/Guatemala' },
  { label: '🇵🇷 Puerto Rico', value: 'PR', idioma: 'es', locale: 'es-PR', moneda: 'USD', simbolo: '$', fecha: 'MM/DD/YYYY', zona: 'America/Puerto_Rico' },
]

const idiomas = [
  { label: 'Español', value: 'es' },
  { label: 'English (United States)', value: 'en-US' },
]

const coloresDisponibles = [
  { label: 'Azul', value: 'blue', color: '#3b82f6' },
  { label: 'Rojo', value: 'red', color: '#ef4444' },
  { label: 'Verde', value: 'green', color: '#22c55e' },
  { label: 'Amarillo', value: 'yellow', color: '#eab308' },
  { label: 'Indigo', value: 'indigo', color: '#6366f1' },
  { label: 'Violeta', value: 'violet', color: '#8b5cf6' },
  { label: 'Teal', value: 'teal', color: '#14b8a6' },
  { label: 'Esmeralda', value: 'emerald', color: '#10b981' },
  { label: 'Rosa', value: 'pink', color: '#ec4899' },
  { label: 'Rosa fuerte', value: 'rose', color: '#f43f5e' },
  { label: 'Naranja', value: 'orange', color: '#f97316' },
  { label: 'Cian', value: 'cyan', color: '#06b6d4' },
  { label: 'Cielo', value: 'sky', color: '#0ea5e9' },
  { label: 'Gris', value: 'gray', color: '#6b7280' },
  { label: 'Pizarra', value: 'slate', color: '#64748b' },
]

const variantes = ['50', '100', '200', '300', '400', '500', '600', '700', '800', '900', '950']

const etiquetasColorBarra: Record<string, string> = {
  white: 'Blanco', primary: 'Color primario', dark: 'Oscuro', transparent: 'Transparente',
  red: 'Rojo', orange: 'Naranja', yellow: 'Amarillo', green: 'Verde', blue: 'Azul',
  indigo: 'Indigo', violet: 'Violeta', pink: 'Rosa', rose: 'Rosa fuerte',
  emerald: 'Esmeralda', teal: 'Teal', cyan: 'Cian', sky: 'Cielo', gray: 'Gris', slate: 'Pizarra',
}

const coloresBarra = computed(() => {
  const tono = shadeTopbar.value as keyof (typeof theme.colorPalettes)['blue']
  const muestra = (color: string) => theme.colorPalettes[color]?.[tono] || '#64748b'
  const primario = theme.colorPalettes[theme.primaryColor] || theme.colorPalettes.blue
  return [
    { label: 'Blanco', value: 'white', color: '#ffffff' },
    { label: 'Color primario', value: 'primary', color: primario[600] },
    { label: 'Oscuro', value: 'dark', color: '#0f172a' },
    { label: 'Transparente', value: 'transparent', color: 'transparent' },
    ...['red', 'orange', 'yellow', 'green', 'blue', 'indigo', 'violet', 'pink', 'rose', 'emerald', 'teal', 'cyan', 'sky', 'gray', 'slate']
      .map(value => ({ label: etiquetasColorBarra[value], value, color: muestra(value) })),
  ]
})

const coloresTextoBarra = [
  { label: 'Automatico', value: 'auto', color: 'linear-gradient(135deg, #ffffff 50%, #0f172a 50%)' },
  { label: 'Blanco', value: '#ffffff', color: '#ffffff' },
  { label: 'Negro', value: '#0f172a', color: '#0f172a' },
  { label: 'Gris oscuro', value: '#334155', color: '#334155' },
  { label: 'Gris claro', value: '#e2e8f0', color: '#e2e8f0' },
]

const monedas = computed(() => Array.from(new Map(paises.map(p => [p.moneda, {
  label: `${p.moneda} (${p.simbolo})`, value: p.moneda,
}])).values()))

const formatosFecha = [
  { label: 'DD/MM/YYYY', value: 'DD/MM/YYYY' },
  { label: 'MM/DD/YYYY', value: 'MM/DD/YYYY' },
  { label: 'YYYY-MM-DD', value: 'YYYY-MM-DD' },
]

const guardando = ref(false)
const almacenNombre = computed(() => almacenStore.activeAlmacen?.nombre || `Almacen ${almacenStore.activeId || ''}`.trim())

function seleccionarColorPrimario(color: string) {
  theme.setPrimaryColor(color)
  aparienciaPendiente.value = true
}

function seleccionarTonoPrimario(tono: string) {
  shadeSeleccionada.value = tono
  theme.setColorShade(tono)
  aparienciaPendiente.value = true
}

function seleccionarFondoBarra(color: string) {
  theme.setTopbarBg(color)
  aparienciaPendiente.value = true
}

function seleccionarTonoBarra(tono: string) {
  shadeTopbar.value = tono
  theme.setTopbarShade(tono)
  aparienciaPendiente.value = true
}

function seleccionarColorTextoBarra(color: string) {
  theme.setTopbarTextColor(color)
  if (color !== 'auto') textoBarraPersonalizado.value = color
  aparienciaPendiente.value = true
}

function seleccionarTextoPersonalizado(event: Event) {
  seleccionarColorTextoBarra((event.target as HTMLInputElement).value)
}

async function cargarAparienciaAlmacen() {
  cargandoApariencia.value = true
  try {
    await almacenStore.load()
    await theme.loadWarehouseAppearance(almacenStore.activeId, almacenStore.activeUid, true)
    shadeSeleccionada.value = theme.colorShade || '500'
    shadeTopbar.value = theme.topbarShade || '500'
    textoBarraPersonalizado.value = theme.topbarTextColor === 'auto' ? '#0f172a' : theme.topbarTextColor
    aparienciaPendiente.value = false
  } finally {
    cargandoApariencia.value = false
  }
}

async function guardarAparienciaAlmacen() {
  guardandoApariencia.value = true
  try {
    const result = await theme.saveWarehouseAppearance(almacenStore.activeId, almacenStore.activeUid)
    if (!result.success) throw new Error(result.error || 'No se pudo guardar la apariencia')
    aparienciaPendiente.value = false
    toast.add({
      severity: result.synced ? 'success' : 'warn',
      summary: result.synced ? 'Apariencia sincronizada' : 'Guardada localmente',
      detail: result.synced
        ? `Los colores de ${almacenNombre.value} ya estan disponibles en las otras PCs.`
        : (result.error || 'Se subiran a TM Cloud cuando vuelva la conexion.'),
      life: 3500,
    })
  } catch (error: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar la apariencia', life: 4000 })
  } finally {
    guardandoApariencia.value = false
  }
}

const vistaPreviaMoneda = computed(() => {
  try {
    return new Intl.NumberFormat(config.value.locale, { style: 'currency', currency: config.value.moneda }).format(1234567.89)
  } catch (_) {
    return `${config.value.simbolo_moneda} 1,234,567.89`
  }
})

const vistaPreviaFecha = computed(() => {
  try {
    return new Intl.DateTimeFormat(config.value.locale, { dateStyle: 'full' }).format(new Date(2026, 6, 31))
  } catch (_) {
    return '31/07/2026'
  }
})

const perfilFiscal = computed(() => getLocaleProfile(config.value.pais).tax)

function aplicarPais(codigo: string) {
  const pais = paises.find(p => p.value === codigo)
  if (!pais) return
  config.value.idioma = pais.idioma
  config.value.locale = pais.locale
  config.value.moneda = pais.moneda
  config.value.simbolo_moneda = pais.simbolo
  config.value.formato_fecha = pais.fecha
  config.value.zona_horaria = pais.zona
  const fiscal = (localeProfiles[codigo] || localeProfiles.DO).tax
  config.value.impuesto_nombre = fiscal.shortName
  config.value.impuesto_porcentaje = fiscal.defaultRate
}

watch(() => config.value.pais, aplicarPais)

async function guardar() {
  guardando.value = true
  try {
    const valores: Record<string, string> = {
      app_nombre: config.value.app_nombre,
      sistema_pais: config.value.pais,
      sistema_idioma: config.value.idioma,
      sistema_locale: config.value.locale,
      sistema_moneda: config.value.moneda,
      sistema_simbolo_moneda: config.value.simbolo_moneda,
      sistema_formato_fecha: config.value.formato_fecha,
      sistema_zona_horaria: config.value.zona_horaria,
      sistema_impuesto_nombre: config.value.impuesto_nombre.trim() || perfilFiscal.value.shortName,
      sistema_impuesto_nombre_completo: config.value.impuesto_nombre.trim() || perfilFiscal.value.fullName,
      sistema_impuesto_porcentaje: String(config.value.impuesto_porcentaje),
    }
    for (const [clave, valor] of Object.entries(valores)) {
      const res = await (window as any).config.set(clave, valor)
      if (!res?.success) throw new Error(res?.error || `No se pudo guardar ${clave}`)
      localStorage.setItem(clave, valor)
    }
    document.documentElement.lang = config.value.idioma
    const empresas = await window.db.getAll('empresa')
    if (empresas.success && empresas.data?.length) {
      const almacenUid = localStorage.getItem('almacen_uid') || localStorage.getItem('almacen_default_uid') || ''
      const empresaActiva = empresas.data.find((item: any) => almacenUid && String(item.uid || item.almacen_uid || '') === almacenUid) || empresas.data[0]
      await window.db.update('empresa', empresaActiva.id, {
        impuesto: Number(config.value.impuesto_porcentaje || 0),
        moneda: config.value.simbolo_moneda,
      })
    }
    window.dispatchEvent(new CustomEvent('system-locale-changed', { detail: { ...config.value } }))
    toast.add({ severity: 'success', summary: 'Guardado', detail: 'País, idioma y formatos actualizados', life: 2500 })
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message || 'No se pudo guardar la configuración', life: 4000 })
  } finally {
    guardando.value = false
  }
}

async function cargarPreferencias() {
  const claves: Record<string, keyof typeof config.value> = {
    app_nombre: 'app_nombre', sistema_pais: 'pais', sistema_idioma: 'idioma', sistema_locale: 'locale',
    sistema_moneda: 'moneda', sistema_simbolo_moneda: 'simbolo_moneda', sistema_formato_fecha: 'formato_fecha',
    sistema_zona_horaria: 'zona_horaria',
    sistema_impuesto_nombre: 'impuesto_nombre', sistema_impuesto_porcentaje: 'impuesto_porcentaje',
  }
  for (const [clave, campo] of Object.entries(claves)) {
    try {
      const res = await (window as any).config.get(clave)
      const valor = res?.success && res.data !== '' ? String(res.data) : localStorage.getItem(clave)
      if (valor) (config.value as any)[campo] = valor
    } catch (_) {}
  }
  config.value.impuesto_porcentaje = Number(config.value.impuesto_porcentaje || 0)
}

async function cargarServerUrl() {
  try {
    const res = await window.electron.invoke('getServerUrl') as any
    if (res.success && res.url) serverUrl.value = res.url
  } catch (_) {}
}

async function cargarSeguridad() {
  try {
    const res = await (window as any).config.get('security_require_login_on_startup')
    solicitarClaveAlAbrir.value = !res?.success || res.data === '' || res.data === '1' || res.data === 'true'
  } catch (_) {
    solicitarClaveAlAbrir.value = true
  }
}

async function guardarSeguridad(valor: boolean) {
  const valorAnterior = solicitarClaveAlAbrir.value
  solicitarClaveAlAbrir.value = valor
  guardandoSeguridad.value = true
  try {
    const res = await (window as any).config.set('security_require_login_on_startup', valor ? '1' : '0')
    if (!res?.success) throw new Error(res?.error || 'No se pudo guardar la configuracion')

    // Autoriza la sesion abierta; la marca se elimina automaticamente al cerrar la app.
    if (valor) sessionStorage.setItem('mr_session_authenticated', '1')

    toast.add({
      severity: 'success',
      summary: 'Seguridad actualizada',
      detail: valor
        ? 'Se pedira la clave al volver a abrir TMPOS'
        : 'TMPOS mantendra la sesion iniciada',
      life: 3000,
    })
  } catch (e: any) {
    solicitarClaveAlAbrir.value = valorAnterior
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 })
  } finally {
    guardandoSeguridad.value = false
  }
}

async function copiarUrl() {
  if (!serverUrl.value) return
  copiando.value = true
  try {
    try {
      await navigator.clipboard.writeText(serverUrl.value)
    } catch (_) {
      const area = document.createElement('textarea')
      area.value = serverUrl.value
      area.style.position = 'fixed'
      area.style.opacity = '0'
      document.body.appendChild(area)
      area.select()
      const copiado = document.execCommand('copy')
      area.remove()
      if (!copiado) throw new Error('El portapapeles no esta disponible')
    }
    toast.add({ severity: 'success', summary: 'Copiado', detail: 'URL copiada al portapapeles', life: 2000 })
  } catch {
    toast.add({ severity: 'error', summary: 'Error', detail: 'No se pudo copiar', life: 2000 })
  }
  copiando.value = false
}

async function limpiarTodosLosDatos() {
  limpiando.value = true
  try {
    const res = await window.electron.invoke('db:clearAllData') as any
    if (res.success) {
      const total = res.data.resultados.length
      const errores = res.data.errores.length
      const detalle = res.data.resultados.join(', ')
      toast.add({ severity: 'success', summary: `${total} tablas limpiadas`, detail: errores ? `${errores} errores` : 'Todos los datos fueron eliminados', life: 4000 })
      console.log('[Limpiar datos]', res.data)
    } else {
      toast.add({ severity: 'error', summary: 'Error', detail: res.error || 'No se pudieron limpiar los datos', life: 4000 })
    }
  } catch (e: any) {
    toast.add({ severity: 'error', summary: 'Error', detail: e.message, life: 4000 })
  }
  limpiando.value = false
  dialogoLimpiar.value = false
}

onMounted(async () => {
  await Promise.all([cargarPreferencias(), cargarAparienciaAlmacen()])
  cargarServerUrl()
  cargarSeguridad()
})
</script>

<template>
  <div>
    <Toast />

    <div class="space-y-6">
      <div class="flex items-center gap-3 pb-2 border-b border-surface-200 dark:border-surface-700">
        <div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center">
          <i class="pi pi-desktop text-primary text-lg"></i>
        </div>
        <div>
          <h2 class="text-xl font-bold">Sistema</h2>
          <p class="text-sm text-surface-500">Configuracion general del sistema</p>
        </div>
      </div>

      <div class="grid grid-cols-1 xl:grid-cols-2 gap-6">
        <div class="space-y-5">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-5">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="font-semibold flex items-center gap-2 text-sm">
                  <i class="pi pi-palette text-primary"></i>
                  Colores de {{ almacenNombre }}
                </h3>
                <p class="text-xs text-surface-400 mt-1">Esta apariencia identifica solamente al almacen activo.</p>
              </div>
              <i v-if="cargandoApariencia" class="pi pi-spin pi-spinner text-primary"></i>
              <span v-else class="text-[10px] px-2 py-1 rounded-full bg-primary-50 dark:bg-primary-900/30 text-primary font-semibold whitespace-nowrap">
                <i class="pi pi-warehouse mr-1"></i>{{ almacenNombre }}
              </span>
            </div>

            <div class="grid grid-cols-4 sm:grid-cols-8 gap-3">
              <button
                v-for="c in coloresDisponibles"
                :key="c.value"
                class="w-full aspect-square rounded-xl border-2 transition-all cursor-pointer relative"
                :class="theme.primaryColor === c.value
                  ? 'border-surface-900 dark:border-surface-0 ring-2 ring-offset-2 ring-primary'
                  : 'border-surface-200 dark:border-surface-600 hover:scale-105'"
                :style="{ backgroundColor: c.color }"
                @click="seleccionarColorPrimario(c.value)"
              >
                <div v-if="theme.primaryColor === c.value" class="absolute inset-0 flex items-center justify-center">
                  <i class="pi pi-check text-white text-sm drop-shadow"></i>
                </div>
              </button>
            </div>

            <div v-if="theme.colorPalettes[theme.primaryColor]" class="space-y-3">
              <h4 class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Variantes</h4>
              <div class="grid grid-cols-11 gap-1.5">
                <button
                  v-for="v in variantes"
                  :key="v"
                  class="aspect-square rounded-lg border-2 transition-all cursor-pointer relative"
                  :class="shadeSeleccionada === v ? 'border-surface-900 dark:border-surface-0 ring-2 ring-offset-1 ring-primary' : 'border-transparent hover:scale-110'"
                  :style="{ backgroundColor: theme.colorPalettes[theme.primaryColor][v] }"
                  @click="seleccionarTonoPrimario(v)"
                >
                  <div v-if="shadeSeleccionada === v" class="absolute inset-0 flex items-center justify-center">
                    <i class="pi pi-check text-white text-[8px] drop-shadow"></i>
                  </div>
                </button>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="font-medium">{{ shadeSeleccionada }}</span>
                <span class="text-surface-400">seleccionado</span>
                <span class="text-surface-400">|</span>
                <span class="font-mono text-[10px] text-surface-400">{{ theme.colorPalettes[theme.primaryColor][shadeSeleccionada] }}</span>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2 text-sm">
              <i class="pi pi-sun text-primary"></i>
              Apariencia
            </h3>

            <div class="flex items-center justify-between">
              <div>
                <p class="text-sm font-medium">Modo Oscuro</p>
                <p class="text-xs text-surface-400">Cambiar entre modo claro y oscuro</p>
              </div>
              <InputSwitch :modelValue="theme.isDark" @update:modelValue="theme.toggleTheme()" />
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2 text-sm">
              <i class="pi pi-window-maximize text-primary"></i>
              Fondo de la Barra Superior
            </h3>

            <div class="grid grid-cols-4 sm:grid-cols-5 gap-2">
              <button
                v-for="c in coloresBarra"
                :key="c.value"
                class="w-full aspect-square rounded-xl border-2 transition-all cursor-pointer relative"
                :class="theme.topbarBg === c.value
                  ? 'border-surface-900 dark:border-surface-0 ring-2 ring-offset-2 ring-primary'
                  : 'border-surface-200 dark:border-surface-600 hover:scale-105'"
                :style="{ backgroundColor: c.color, borderStyle: c.value === 'transparent' ? 'dashed' : 'solid' }"
                :title="c.label"
                @click="seleccionarFondoBarra(c.value)"
              >
                <div v-if="theme.topbarBg === c.value" class="absolute inset-0 flex items-center justify-center">
                  <i class="pi pi-check text-sm drop-shadow" :class="['white', 'transparent', 'yellow'].includes(c.value) ? 'text-surface-900' : 'text-white'"></i>
                </div>
              </button>
            </div>

            <div class="flex items-center gap-2 text-sm">
              <span class="font-medium">{{ etiquetasColorBarra[theme.topbarBg] || 'Blanco' }}</span>
              <span class="text-surface-400">seleccionado</span>
            </div>
            <div v-if="theme.colorPalettes[theme.topbarBg]" class="space-y-3">
              <h4 class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Variantes</h4>
              <div class="grid grid-cols-11 gap-1.5">
                <button
                  v-for="v in variantes"
                  :key="v"
                  class="aspect-square rounded-lg border-2 transition-all cursor-pointer relative"
                  :class="shadeTopbar === v ? 'border-surface-900 dark:border-surface-0 ring-2 ring-offset-1 ring-primary' : 'border-transparent hover:scale-110'"
                  :style="{ backgroundColor: theme.colorPalettes[theme.topbarBg][v] }"
                  @click="seleccionarTonoBarra(v)"
                >
                  <div v-if="shadeTopbar === v" class="absolute inset-0 flex items-center justify-center">
                    <i class="pi pi-check text-white text-[8px] drop-shadow"></i>
                  </div>
                </button>
              </div>
              <div class="flex items-center gap-2 text-xs">
                <span class="font-medium">{{ shadeTopbar }}</span>
                <span class="text-surface-400">seleccionado</span>
                <span class="font-mono text-[10px] text-surface-400">{{ theme.colorPalettes[theme.topbarBg][shadeTopbar] }}</span>
              </div>
            </div>

            <div class="pt-3 border-t border-surface-200 dark:border-surface-700 space-y-3">
              <div>
                <h4 class="text-xs font-semibold text-surface-500 uppercase tracking-wider">Color del texto e iconos</h4>
                <p class="text-xs text-surface-400 mt-1">Automatico elige blanco o negro para mantener el mejor contraste.</p>
              </div>
              <div class="flex flex-wrap items-center gap-2">
                <button
                  v-for="c in coloresTextoBarra"
                  :key="c.value"
                  type="button"
                  class="w-9 h-9 rounded-lg border-2 transition-all relative"
                  :class="theme.topbarTextColor === c.value
                    ? 'border-primary ring-2 ring-primary/25'
                    : 'border-surface-300 dark:border-surface-600 hover:scale-105'"
                  :style="{ background: c.color }"
                  :title="c.label"
                  @click="seleccionarColorTextoBarra(c.value)"
                >
                  <i v-if="theme.topbarTextColor === c.value" class="pi pi-check text-primary text-xs drop-shadow"></i>
                </button>
                <label class="flex items-center gap-2 rounded-lg border border-surface-300 dark:border-surface-600 px-2.5 py-1.5 cursor-pointer">
                  <input
                    :value="textoBarraPersonalizado"
                    type="color"
                    class="w-6 h-6 border-0 bg-transparent cursor-pointer"
                    @input="seleccionarTextoPersonalizado"
                  />
                  <span class="text-xs font-medium">Personalizado</span>
                  <span class="font-mono text-[10px] text-surface-400">{{ theme.topbarTextColor === 'auto' ? 'AUTO' : theme.topbarTextColor }}</span>
                </label>
              </div>
            </div>

            <div class="pt-3 border-t border-surface-200 dark:border-surface-700 flex items-center justify-between gap-3">
              <p class="text-xs" :class="aparienciaPendiente ? 'text-amber-600 dark:text-amber-400' : 'text-surface-400'">
                <i :class="aparienciaPendiente ? 'pi pi-circle-fill' : 'pi pi-cloud'" class="text-[8px] mr-1"></i>
                {{ aparienciaPendiente ? 'Hay cambios de color sin guardar' : 'Apariencia vinculada al almacen' }}
              </p>
              <Button
                label="Guardar apariencia"
                icon="pi pi-cloud-upload"
                size="small"
                :loading="guardandoApariencia"
                :disabled="cargandoApariencia || !aparienciaPendiente"
                @click="guardarAparienciaAlmacen"
              />
            </div>
          </div>
        </div>

        <div class="space-y-5">
          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2 text-sm">
              <i class="pi pi-shield text-primary"></i>
              Seguridad de Acceso
            </h3>

            <div class="flex items-center justify-between gap-4">
              <div>
                <p class="text-sm font-medium">Pedir clave al abrir TMPOS</p>
                <p class="text-xs text-surface-400">Solicita nuevamente el PIN o la contrasena despues de cerrar la aplicacion.</p>
              </div>
              <InputSwitch
                :modelValue="solicitarClaveAlAbrir"
                :disabled="guardandoSeguridad"
                @update:modelValue="guardarSeguridad"
              />
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2 text-sm">
              <i class="pi pi-globe text-primary"></i>
              País, Idioma y Formatos
            </h3>

            <div class="space-y-1.5">
              <label class="text-sm font-medium">Nombre de la Aplicacion</label>
              <InputText v-model="config.app_nombre" placeholder="TMPOS" fluid />
            </div>

            <div class="grid grid-cols-2 gap-4">
              <div class="space-y-1.5 col-span-2 sm:col-span-1">
                <label class="text-sm font-medium">País</label>
                <Select v-model="config.pais" :options="paises" optionLabel="label" optionValue="value" filter fluid />
              </div>
              <div class="space-y-1.5 col-span-2 sm:col-span-1">
                <label class="text-sm font-medium">Idioma</label>
                <Select v-model="config.idioma" :options="idiomas" optionLabel="label" optionValue="value" fluid />
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Moneda</label>
                <Select v-model="config.moneda" :options="monedas" optionLabel="label" optionValue="value" fluid />
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Formato de Fecha</label>
                <Select v-model="config.formato_fecha" :options="formatosFecha" optionLabel="label" optionValue="value" fluid />
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3 rounded-lg bg-surface-50 dark:bg-surface-900/50 p-3 text-sm">
              <div>
                <span class="block text-xs text-surface-400">Vista previa de moneda</span>
                <strong>{{ vistaPreviaMoneda }}</strong>
              </div>
              <div>
                <span class="block text-xs text-surface-400">Vista previa de fecha</span>
                <strong>{{ vistaPreviaFecha }}</strong>
              </div>
              <div>
                <span class="block text-xs text-surface-400">Símbolo</span>
                <strong>{{ config.simbolo_moneda }} · {{ config.moneda }}</strong>
              </div>
              <div>
                <span class="block text-xs text-surface-400">Zona horaria</span>
                <strong>{{ config.zona_horaria }}</strong>
              </div>
              <div class="sm:col-span-2">
                <span class="block text-xs text-surface-400">Impuesto del país</span>
                <strong>{{ config.impuesto_nombre }}</strong>
                <span class="text-xs text-surface-400"> · {{ perfilFiscal.fullName }}</span>
              </div>
            </div>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Nombre del impuesto</label>
                <InputText v-model="config.impuesto_nombre" placeholder="Ej: ITBIS, IVA, Sales Tax" fluid />
              </div>
              <div class="space-y-1.5">
                <label class="text-sm font-medium">Porcentaje del impuesto</label>
                <InputNumber v-model="config.impuesto_porcentaje" :min="0" :max="100" :minFractionDigits="0" :maxFractionDigits="2" fluid>
                  <template #suffix><span class="text-xs text-surface-400">%</span></template>
                </InputNumber>
              </div>
            </div>

            <p class="text-xs text-surface-400">El país aplica automáticamente el idioma, la moneda y los formatos recomendados. Puedes ajustarlos antes de guardar.</p>
            <div class="flex justify-end">
              <Button label="Guardar preferencias" icon="pi pi-save" :loading="guardando" @click="guardar" />
            </div>
          </div>

          <div class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2 text-sm">
              <i class="pi pi-info-circle text-primary"></i>
              Informacion del Sistema
            </h3>

            <div class="grid grid-cols-2 gap-3 text-sm">
              <div>
                <span class="text-surface-400 text-xs">Version</span>
                <p class="font-medium">1.0.0</p>
              </div>
              <div>
                <span class="text-surface-400 text-xs">Entorno</span>
                <p class="font-medium">Electron + Vue 3</p>
              </div>
              <div>
                <span class="text-surface-400 text-xs">Base de Datos</span>
                <p class="font-medium">SQLite</p>
              </div>
              <div>
                <span class="text-surface-400 text-xs">Tema Actual</span>
                <p class="font-medium capitalize">{{ theme.isDark ? 'Oscuro' : 'Claro' }}</p>
              </div>
            </div>
          </div>

          <div class="rounded-xl border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-5 space-y-4">
            <h3 class="font-semibold flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <i class="pi pi-exclamation-triangle"></i>
              Zona de Peligro
            </h3>
            <p class="text-xs text-surface-500">Elimina todos los datos de las tablas del sistema. Se conservan licencia, usuarios, empresa, almacenes y configuracion.</p>
            <Button severity="danger" outlined icon="pi pi-trash" label="Borrar todos los datos" @click="dialogoLimpiar = true" />
          </div>

          <Dialog v-model:visible="dialogoLimpiar" header="Confirmar" modal :closable="false" class="w-96">
            <div class="space-y-4">
              <div class="flex items-center gap-3 p-3 bg-red-50 dark:bg-red-900/20 rounded-lg">
                <i class="pi pi-exclamation-triangle text-red-500 text-xl"></i>
                <p class="text-sm text-surface-700 dark:text-surface-300">Esta accion eliminara todos los registros de clientes, productos, facturas, inventario y demas tablas. No se puede deshacer. Se conservan licencia, usuarios, empresa y configuracion.</p>
              </div>
              <div class="flex justify-end gap-2">
                <Button label="Cancelar" severity="secondary" text @click="dialogoLimpiar = false" :disabled="limpiando" />
                <Button label="Borrar todo" severity="danger" icon="pi pi-trash" :loading="limpiando" @click="limpiarTodosLosDatos" />
              </div>
            </div>
          </Dialog>

          <div v-if="serverUrl" class="rounded-xl border border-primary-200 dark:border-primary-800 bg-primary-50 dark:bg-primary-900/20 p-5 space-y-3">
            <h3 class="font-semibold flex items-center gap-2 text-sm text-primary">
              <i class="pi pi-globe text-primary"></i>
              Acceso por Red Local
            </h3>
            <p class="text-xs text-surface-500">Escanea el codigo QR o abre esta URL desde otro dispositivo en la misma red:</p>
            <div class="flex items-center gap-2">
              <InputText :value="serverUrl" readonly fluid class="font-mono text-xs" />
              <Button icon="pi pi-copy" severity="primary" text rounded size="small" :loading="copiando" @click="copiarUrl" v-tooltip="'Copiar URL'" />
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>
