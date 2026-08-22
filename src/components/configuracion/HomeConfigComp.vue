<script setup lang="ts">
import { ref, onMounted } from 'vue'
import ToggleSwitch from 'primevue/toggleswitch'
import Button from 'primevue/button'
import Toast from 'primevue/toast'
import { useToast } from 'primevue/usetoast'

const CONFIG_KEY = 'home_secciones_visibles'
const toast = useToast()
const guardando = ref(false)
const defaults = { encabezado: true, turno: true, resumen: true, accesoRapido: true, productosTop: true, stockBajo: true }
const config = ref({ ...defaults })
const secciones = [
  { key: 'encabezado', label: 'Bienvenida y fecha', description: 'Nombre del usuario, fecha y nombre de la aplicación.', icon: 'pi pi-home' },
  { key: 'turno', label: 'Estado del turno', description: 'Aviso de caja abierta o cerrada.', icon: 'pi pi-clock' },
  { key: 'resumen', label: 'Resumen financiero', description: 'Ventas, ganancia, gastos y stock bajo del día o mes.', icon: 'pi pi-chart-bar' },
  { key: 'accesoRapido', label: 'Accesos rápidos', description: 'Botones para vender, inventario, taller, clientes y otras áreas.', icon: 'pi pi-bolt' },
  { key: 'productosTop', label: 'Productos más vendidos', description: 'Ranking de productos vendidos durante el período.', icon: 'pi pi-trophy' },
  { key: 'stockBajo', label: 'Alertas de stock', description: 'Productos agotados o próximos a agotarse.', icon: 'pi pi-exclamation-triangle' },
] as const

async function cargar() {
  try {
    const res = await window.config.get(CONFIG_KEY)
    if (res?.success && res.data) config.value = { ...defaults, ...JSON.parse(res.data) }
  } catch { config.value = { ...defaults } }
}

async function guardar() {
  guardando.value = true
  try {
    const res = await window.config.set(CONFIG_KEY, JSON.stringify(config.value))
    if (!res?.success) throw new Error(res?.error || 'No se pudo guardar')
    window.dispatchEvent(new CustomEvent('home-config-changed', { detail: { ...config.value } }))
    toast.add({ severity: 'success', summary: 'Home actualizado', detail: 'La visibilidad se aplicará inmediatamente.', life: 2500 })
  } catch (error: any) { toast.add({ severity: 'error', summary: 'Error', detail: error?.message || 'No se pudo guardar', life: 3000 }) }
  finally { guardando.value = false }
}

function mostrarTodo() { config.value = { ...defaults } }
function ocultarTodo() { config.value = Object.fromEntries(Object.keys(defaults).map(key => [key, false])) as typeof defaults }
onMounted(cargar)
</script>

<template>
  <div class="space-y-6 max-w-4xl">
    <Toast />
    <div class="flex items-center gap-3 pb-3 border-b border-surface-200 dark:border-surface-700"><div class="w-10 h-10 rounded-xl bg-primary-100 dark:bg-primary-900/30 flex items-center justify-center"><i class="pi pi-home text-primary text-lg"></i></div><div><h2 class="text-xl font-bold">Personalizar Home</h2><p class="text-sm text-surface-500">Elige qué información verán los usuarios en la pantalla de inicio</p></div></div>
    <div class="grid grid-cols-1 md:grid-cols-2 gap-3"><div v-for="seccion in secciones" :key="seccion.key" class="rounded-xl border border-surface-200 dark:border-surface-700 bg-surface-0 dark:bg-surface-800 p-4 flex items-start gap-3"><div class="w-10 h-10 rounded-lg bg-surface-100 dark:bg-surface-700 flex items-center justify-center shrink-0"><i :class="seccion.icon" class="text-primary"></i></div><div class="flex-1"><p class="font-semibold">{{ seccion.label }}</p><p class="text-xs text-surface-500 mt-1 leading-relaxed">{{ seccion.description }}</p></div><ToggleSwitch v-model="config[seccion.key]" /></div></div>
    <div class="flex flex-wrap justify-between gap-3 pt-2"><div class="flex gap-2"><Button label="Mostrar todo" icon="pi pi-eye" severity="secondary" outlined @click="mostrarTodo" /><Button label="Ocultar todo" icon="pi pi-eye-slash" severity="secondary" text @click="ocultarTodo" /></div><Button label="Guardar configuración" icon="pi pi-save" :loading="guardando" @click="guardar" /></div>
  </div>
</template>
